from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid, bcrypt, jwt, logging, shutil, mimetypes
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', '24'))
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(ROOT_DIR / 'uploads')))
ORPHAN_DIR = UPLOAD_DIR / 'orphan-documents'
ORPHAN_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_MB', '10')) * 1024 * 1024
ALLOWED_MIMES = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="IQRA School API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ----------------- Helpers -----------------
def now_iso(): return datetime.now(timezone.utc).isoformat()
def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p, h):
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except Exception: return False
def create_token(uid, uname):
    return jwt.encode({"sub": uid, "username": uname,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc)}, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ----------------- Permissions catalog -----------------
PERMISSIONS_CATALOG = [
    ("students.view", "عرض الطلاب", "students", "view"),
    ("students.create", "إضافة طلاب", "students", "create"),
    ("students.update", "تعديل الطلاب", "students", "update"),
    ("students.delete", "حذف الطلاب", "students", "delete"),
    ("students.print", "طباعة الطلاب", "students", "print"),
    ("students.orphanDocument.view", "عرض وثيقة اليتم", "students", "orphanDocument.view"),
    ("students.orphanDocument.upload", "رفع وثيقة اليتم", "students", "orphanDocument.upload"),
    ("students.orphanDocument.delete", "حذف وثيقة اليتم", "students", "orphanDocument.delete"),
    ("payments.view", "عرض المدفوعات", "payments", "view"),
    ("payments.create", "إضافة مدفوعات", "payments", "create"),
    ("payments.update", "تعديل المدفوعات", "payments", "update"),
    ("payments.delete", "حذف المدفوعات", "payments", "delete"),
    ("payments.print", "طباعة المدفوعات", "payments", "print"),
    ("users.view", "عرض المستخدمين", "users", "view"),
    ("users.create", "إضافة مستخدمين", "users", "create"),
    ("users.update", "تعديل المستخدمين", "users", "update"),
    ("users.delete", "حذف المستخدمين", "users", "delete"),
    ("roles.view", "عرض الأدوار", "roles", "view"),
    ("roles.create", "إضافة أدوار", "roles", "create"),
    ("roles.update", "تعديل الأدوار", "roles", "update"),
    ("roles.delete", "حذف الأدوار", "roles", "delete"),
    ("permissions.view", "عرض الصلاحيات", "permissions", "view"),
]

async def compute_user_permissions(user: dict) -> List[str]:
    role_ids = user.get("roles", []) or []
    if not role_ids:
        return []
    roles = await db.roles.find({"id": {"$in": role_ids}}, {"_id": 0}).to_list(100)
    perms = set()
    for r in roles:
        for p in r.get("permissions", []) or []:
            perms.add(p)
    return sorted(perms)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not creds: raise HTTPException(401, "غير مصرح")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
        if not user: raise HTTPException(401, "مستخدم غير موجود")
        user["permissions"] = await compute_user_permissions(user)
        return user
    except jwt.ExpiredSignatureError: raise HTTPException(401, "انتهت الجلسة")
    except jwt.InvalidTokenError: raise HTTPException(401, "رمز غير صالح")

def require_permission(perm: str):
    async def checker(current=Depends(get_current_user)):
        if perm not in (current.get("permissions") or []):
            raise HTTPException(403, f"لا تملك صلاحية: {perm}")
        return current
    return checker

# ----------------- Models -----------------
class LoginIn(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    name: str
    username: str
    password: str
    roles: List[str] = []

class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    roles: Optional[List[str]] = None

class RoleIn(BaseModel):
    name: str
    description: Optional[str] = ""
    permissions: List[str] = []

class OrphanDocumentInfo(BaseModel):
    type: Optional[str] = ""
    description: Optional[str] = ""

class StudentIn(BaseModel):
    student: dict
    siblings: List[dict] = []
    father: dict = {}
    mother: dict = {}
    general: dict = {}
    previousEducation: List[dict] = []
    islamicLegalEducation: Optional[str] = ""
    bestAchievement: Optional[str] = ""
    otherInfo: dict = {}
    signing: dict = {}
    fees: dict = {}  # {academicYear, totalPayable}
    initialPayment: Optional[dict] = None  # {amount, semester, paymentDate}

class PaymentIn(BaseModel):
    student: str  # student id
    academicYear: str
    semester: str  # first|second|full_year
    amount: float
    paymentDate: str
    notes: Optional[str] = ""

# ----------------- Auth -----------------
@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"username": body.username})
    if not user or not verify_pw(body.password, user.get("password", "")):
        raise HTTPException(401, "اسم المستخدم أو كلمة المرور غير صحيحة")
    perms = await compute_user_permissions(user)
    return {"token": create_token(user["id"], user["username"]),
            "user": {"id": user["id"], "name": user["name"], "username": user["username"],
                     "createdAt": user["createdAt"], "roles": user.get("roles", []),
                     "permissions": perms}}

@api.post("/auth/logout")
async def logout(current=Depends(get_current_user)): return {"ok": True}

@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return {"id": current["id"], "name": current["name"], "username": current["username"],
            "createdAt": current["createdAt"], "roles": current.get("roles", []),
            "permissions": current.get("permissions", [])}

# ----------------- Permissions -----------------
@api.get("/permissions")
async def list_permissions(current=Depends(get_current_user)):
    # Return static catalog
    return [{"name": n, "description": d, "resource": r, "action": a}
            for (n, d, r, a) in PERMISSIONS_CATALOG]

# ----------------- Roles -----------------
@api.get("/roles")
async def list_roles(current=Depends(require_permission("roles.view"))):
    docs = await db.roles.find({}, {"_id": 0}).sort("createdAt", 1).to_list(200)
    return docs

@api.post("/roles")
async def create_role(body: RoleIn, current=Depends(require_permission("roles.create"))):
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    if await db.roles.find_one({"name": body.name}):
        raise HTTPException(400, "الاسم مستخدم")
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(),
           "description": body.description or "", "permissions": body.permissions,
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.roles.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/roles/{rid}")
async def update_role(rid: str, body: RoleIn, current=Depends(require_permission("roles.update"))):
    if not await db.roles.find_one({"id": rid}): raise HTTPException(404, "غير موجود")
    dup = await db.roles.find_one({"name": body.name, "id": {"$ne": rid}})
    if dup: raise HTTPException(400, "الاسم مستخدم")
    await db.roles.update_one({"id": rid}, {"$set": {"name": body.name,
        "description": body.description or "", "permissions": body.permissions,
        "updatedAt": now_iso()}})
    return await db.roles.find_one({"id": rid}, {"_id": 0})

@api.delete("/roles/{rid}")
async def delete_role(rid: str, current=Depends(require_permission("roles.delete"))):
    # remove role from all users
    await db.users.update_many({}, {"$pull": {"roles": rid}})
    r = await db.roles.delete_one({"id": rid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}

# ----------------- Users -----------------
async def _user_out(u):
    u.pop("password", None); u.pop("_id", None)
    return u

@api.get("/users")
async def list_users(current=Depends(require_permission("users.view"))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("createdAt", -1).to_list(500)
    return users

@api.post("/users")
async def create_user(body: UserCreate, current=Depends(require_permission("users.create"))):
    if not body.name.strip() or not body.username.strip() or len(body.password) < 4:
        raise HTTPException(400, "بيانات غير صالحة")
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(400, "اسم المستخدم مستخدم من قبل")
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(),
           "username": body.username.strip(), "password": hash_pw(body.password),
           "roles": body.roles or [], "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.users.insert_one(doc)
    return await _user_out(doc)

@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, current=Depends(require_permission("users.update"))):
    existing = await db.users.find_one({"id": uid})
    if not existing: raise HTTPException(404, "غير موجود")
    upd = {"updatedAt": now_iso()}
    if body.name is not None: upd["name"] = body.name.strip()
    if body.password: upd["password"] = hash_pw(body.password)
    if body.roles is not None: upd["roles"] = body.roles
    await db.users.update_one({"id": uid}, {"$set": upd})
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
    return u

@api.delete("/users/{uid}")
async def delete_user(uid: str, current=Depends(require_permission("users.delete"))):
    if uid == current["id"]: raise HTTPException(400, "لا يمكنك حذف حسابك الحالي")
    r = await db.users.delete_one({"id": uid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}

# ----------------- Students -----------------
async def _student_payment_totals(sid: str, academic_year: Optional[str] = None) -> dict:
    q = {"student": sid}
    if academic_year: q["academicYear"] = academic_year
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    total_paid = sum(float(p.get("amount", 0)) for p in docs)
    return {"totalPaid": total_paid, "count": len(docs)}

async def _augment_student(doc: dict) -> dict:
    fees = doc.get("fees") or {}
    ay = fees.get("academicYear")
    total_payable = float(fees.get("totalPayable") or 0)
    totals = await _student_payment_totals(doc["id"], ay)
    doc["fees"] = {"academicYear": ay, "totalPayable": total_payable,
                   "totalPaid": totals["totalPaid"],
                   "remaining": max(0, total_payable - totals["totalPaid"])}
    return doc

@api.get("/students")
async def list_students(search: Optional[str] = None, current=Depends(require_permission("students.view"))):
    q = {"student.fullName": {"$regex": search, "$options": "i"}} if search else {}
    docs = await db.students.find(q, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    for d in docs: await _augment_student(d)
    return docs

@api.get("/students/{sid}")
async def get_student(sid: str, current=Depends(require_permission("students.view"))):
    d = await db.students.find_one({"id": sid}, {"_id": 0})
    if not d: raise HTTPException(404, "غير موجود")
    return await _augment_student(d)

@api.post("/students")
async def create_student(body: StudentIn, current=Depends(require_permission("students.create"))):
    p = body.model_dump()
    p["id"] = str(uuid.uuid4())
    p["createdAt"] = now_iso(); p["updatedAt"] = now_iso()
    # Validate registrationPath
    reg_path = (p.get("student") or {}).get("registrationPath")
    if reg_path and reg_path not in ("خاص", "القرية", "الايتام"):
        raise HTTPException(400, "مسار التسجيل غير صالح")
    initial = p.pop("initialPayment", None)
    # keep only academicYear + totalPayable in fees
    fees = p.get("fees") or {}
    p["fees"] = {"academicYear": fees.get("academicYear") or "",
                 "totalPayable": float(fees.get("totalPayable") or 0)}
    await db.students.insert_one(p)
    # optional initial payment
    if initial and float(initial.get("amount") or 0) > 0:
        amt = float(initial["amount"])
        if amt > p["fees"]["totalPayable"]:
            # rollback
            await db.students.delete_one({"id": p["id"]})
            raise HTTPException(400, "الدفعة الأولى تتجاوز إجمالي المستحق")
        pay = {"id": str(uuid.uuid4()), "student": p["id"],
               "academicYear": p["fees"]["academicYear"] or "",
               "semester": initial.get("semester") or "full_year",
               "amount": amt, "paymentDate": initial.get("paymentDate") or now_iso(),
               "notes": "دفعة أولية عند التسجيل",
               "createdBy": current["id"],
               "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.payments.insert_one(pay)
    d = await db.students.find_one({"id": p["id"]}, {"_id": 0})
    return await _augment_student(d)

@api.put("/students/{sid}")
async def update_student(sid: str, body: StudentIn, current=Depends(require_permission("students.update"))):
    existing = await db.students.find_one({"id": sid})
    if not existing: raise HTTPException(404, "غير موجود")
    p = body.model_dump()
    p.pop("initialPayment", None)
    reg_path = (p.get("student") or {}).get("registrationPath")
    if reg_path and reg_path not in ("خاص", "القرية", "الايتام"):
        raise HTTPException(400, "مسار التسجيل غير صالح")
    fees = p.get("fees") or {}
    p["fees"] = {"academicYear": fees.get("academicYear") or "",
                 "totalPayable": float(fees.get("totalPayable") or 0)}
    # preserve orphanDocument from existing (it's managed via upload endpoints)
    if existing.get("orphanDocument"):
        p["orphanDocument"] = existing["orphanDocument"]
    p["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": p})
    d = await db.students.find_one({"id": sid}, {"_id": 0})
    return await _augment_student(d)

@api.delete("/students/{sid}")
async def delete_student(sid: str, current=Depends(require_permission("students.delete"))):
    doc = await db.students.find_one({"id": sid})
    if not doc: raise HTTPException(404, "غير موجود")
    od = doc.get("orphanDocument") or {}
    fp = od.get("filePath")
    if fp:
        try: os.remove(fp)
        except Exception: pass
    await db.payments.delete_many({"student": sid})
    await db.students.delete_one({"id": sid})
    return {"ok": True}

# ----- Orphan documents -----
@api.post("/students/{sid}/orphan-document")
async def upload_orphan_doc(sid: str, type: str = Form(...),
                             description: Optional[str] = Form(""),
                             file: UploadFile = File(...),
                             current=Depends(require_permission("students.orphanDocument.upload"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS: raise HTTPException(400, "امتداد ملف غير مسموح")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime and mime not in ALLOWED_MIMES: raise HTTPException(400, "نوع ملف غير مسموح")
    # save
    fname = f"{sid}-{int(datetime.now().timestamp())}-{uuid.uuid4().hex[:8]}{ext}"
    fpath = ORPHAN_DIR / fname
    size = 0
    with open(fpath, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk: break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close(); os.remove(fpath)
                raise HTTPException(400, f"حجم الملف يتجاوز {MAX_UPLOAD_BYTES // (1024*1024)}MB")
            out.write(chunk)
    # remove old file if exists
    old = (student.get("orphanDocument") or {}).get("filePath")
    if old:
        try: os.remove(old)
        except Exception: pass
    meta = {"type": type, "description": description or "", "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath),
            "mimeType": mime, "size": size,
            "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {"orphanDocument": meta, "updatedAt": now_iso()}})
    # return without filePath / uploadedBy (safe view)
    safe = {k: v for k, v in meta.items() if k not in ("filePath",)}
    return safe

@api.get("/students/{sid}/orphan-document")
async def get_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.view"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "غير موجود")
    od = student.get("orphanDocument")
    if not od or not od.get("filePath") or not os.path.exists(od["filePath"]):
        raise HTTPException(404, "لا توجد وثيقة")
    return FileResponse(od["filePath"], media_type=od.get("mimeType") or "application/octet-stream",
                        filename=od.get("originalName") or od.get("fileName"))

@api.delete("/students/{sid}/orphan-document")
async def delete_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.delete"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "غير موجود")
    od = student.get("orphanDocument")
    if not od: return {"ok": True}
    fp = od.get("filePath")
    if fp:
        try: os.remove(fp)
        except Exception: pass
    await db.students.update_one({"id": sid}, {"$unset": {"orphanDocument": ""}, "$set": {"updatedAt": now_iso()}})
    return {"ok": True}

# ----------------- Payments -----------------
async def _enrich_payment(p: dict) -> dict:
    s = await db.students.find_one({"id": p.get("student")}, {"_id": 0, "student.fullName": 1, "id": 1})
    p["studentName"] = (s.get("student") or {}).get("fullName") if s else "—"
    creator = await db.users.find_one({"id": p.get("createdBy")}, {"_id": 0, "name": 1})
    p["createdByName"] = creator.get("name") if creator else "—"
    return p

@api.get("/payments")
async def list_payments(search: Optional[str] = None, academicYear: Optional[str] = None,
                        semester: Optional[str] = None,
                        current=Depends(require_permission("payments.view"))):
    q = {}
    if academicYear: q["academicYear"] = academicYear
    if semester: q["semester"] = semester
    if search:
        matching = await db.students.find({"student.fullName": {"$regex": search, "$options": "i"}}, {"id": 1, "_id": 0}).to_list(500)
        q["student"] = {"$in": [m["id"] for m in matching]}
    docs = await db.payments.find(q, {"_id": 0}).sort("paymentDate", -1).to_list(1000)
    for d in docs: await _enrich_payment(d)
    return docs

@api.get("/payments/{pid}")
async def get_payment(pid: str, current=Depends(require_permission("payments.view"))):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "غير موجود")
    return await _enrich_payment(p)

@api.get("/students/{sid}/payments")
async def list_student_payments(sid: str, current=Depends(require_permission("payments.view"))):
    docs = await db.payments.find({"student": sid}, {"_id": 0}).sort("paymentDate", -1).to_list(500)
    for d in docs: await _enrich_payment(d)
    return docs

async def _validate_no_overpayment(sid: str, academic_year: str, new_amount: float, exclude_payment_id: Optional[str] = None):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    total_payable = float(((student.get("fees") or {}).get("totalPayable")) or 0)
    q = {"student": sid, "academicYear": academic_year}
    if exclude_payment_id: q["id"] = {"$ne": exclude_payment_id}
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    current_total = sum(float(p.get("amount", 0)) for p in docs)
    if current_total + float(new_amount) > total_payable + 0.0001:
        raise HTTPException(400, f"مبلغ الدفعة يتجاوز الرصيد المتبقي (المتبقي: {total_payable - current_total})")

@api.post("/payments")
async def create_payment(body: PaymentIn, current=Depends(require_permission("payments.create"))):
    if body.semester not in ("first", "second", "full_year"):
        raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await _validate_no_overpayment(body.student, body.academicYear, body.amount)
    doc = {"id": str(uuid.uuid4()), "student": body.student,
           "academicYear": body.academicYear, "semester": body.semester,
           "amount": float(body.amount), "paymentDate": body.paymentDate,
           "notes": body.notes or "", "createdBy": current["id"],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    return await _enrich_payment({k: v for k, v in doc.items() if k != "_id"})

@api.put("/payments/{pid}")
async def update_payment(pid: str, body: PaymentIn, current=Depends(require_permission("payments.update"))):
    existing = await db.payments.find_one({"id": pid})
    if not existing: raise HTTPException(404, "غير موجود")
    if body.semester not in ("first", "second", "full_year"):
        raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await _validate_no_overpayment(body.student, body.academicYear, body.amount, exclude_payment_id=pid)
    upd = {"student": body.student, "academicYear": body.academicYear,
           "semester": body.semester, "amount": float(body.amount),
           "paymentDate": body.paymentDate, "notes": body.notes or "",
           "updatedAt": now_iso()}
    await db.payments.update_one({"id": pid}, {"$set": upd})
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    return await _enrich_payment(p)

@api.delete("/payments/{pid}")
async def delete_payment(pid: str, current=Depends(require_permission("payments.delete"))):
    r = await db.payments.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}

# ----------------- Dashboard -----------------
@api.get("/dashboard/stats")
async def dashboard_stats(current=Depends(get_current_user)):
    total = await db.students.count_documents({})
    female = await db.students.count_documents({"student.gender": "female"})
    male = await db.students.count_documents({"student.gender": "male"})
    orphans = await db.students.count_documents({"student.orphan": True})
    # finance
    pay_agg = await db.payments.aggregate([{"$group": {"_id": None, "sum": {"$sum": "$amount"}}}]).to_list(1)
    total_collected = pay_agg[0]["sum"] if pay_agg else 0
    stu_agg = await db.students.aggregate([{"$group": {"_id": None, "sum": {"$sum": "$fees.totalPayable"}}}]).to_list(1)
    total_payable = stu_agg[0]["sum"] if stu_agg else 0
    return {"total": total, "female": female, "male": male, "orphans": orphans,
            "totalPayable": total_payable, "totalCollected": total_collected,
            "totalRemaining": max(0, (total_payable or 0) - (total_collected or 0))}

# ----------------- Startup / seed -----------------
@app.on_event("startup")
async def on_startup():
    # Seed default roles
    all_perms = [p[0] for p in PERMISSIONS_CATALOG]
    defaults = [
        {"name": "Administrator", "description": "صلاحيات كاملة", "permissions": all_perms},
        {"name": "Registration Staff", "description": "موظف تسجيل",
         "permissions": ["students.view","students.create","students.update","students.print",
                         "payments.view","payments.create","payments.print",
                         "students.orphanDocument.view","students.orphanDocument.upload"]},
        {"name": "Accountant", "description": "محاسب",
         "permissions": ["students.view","payments.view","payments.create","payments.update",
                         "payments.delete","payments.print"]},
    ]
    admin_role_id = None
    for r in defaults:
        existing = await db.roles.find_one({"name": r["name"]})
        if not existing:
            doc = {"id": str(uuid.uuid4()), **r, "createdAt": now_iso(), "updatedAt": now_iso()}
            await db.roles.insert_one(doc)
            if r["name"] == "Administrator": admin_role_id = doc["id"]
        else:
            # keep admin fully in sync with catalog
            if r["name"] == "Administrator":
                await db.roles.update_one({"id": existing["id"]}, {"$set": {"permissions": all_perms, "updatedAt": now_iso()}})
                admin_role_id = existing["id"]
    if admin_role_id is None:
        admin_role_id = (await db.roles.find_one({"name": "Administrator"}))["id"]

    # Seed indexes
    try:
        await db.students.create_index("student.fullName")
        await db.students.create_index("student.gender")
        await db.students.create_index("student.orphan")
        await db.students.create_index("student.registrationPath")
        await db.payments.create_index("student")
        await db.payments.create_index("academicYear")
        await db.payments.create_index("paymentDate")
        await db.users.create_index("username", unique=True)
        await db.roles.create_index("name", unique=True)
    except Exception as e:
        logging.warning(f"index setup: {e}")

    # Seed admin user if none
    if await db.users.count_documents({}) == 0:
        u = os.environ.get("SEED_ADMIN_USERNAME", "admin")
        p = os.environ.get("SEED_ADMIN_PASSWORD", "admin123")
        n = os.environ.get("SEED_ADMIN_NAME", "مدير النظام")
        await db.users.insert_one({"id": str(uuid.uuid4()), "name": n, "username": u,
            "password": hash_pw(p), "roles": [admin_role_id],
            "createdAt": now_iso(), "updatedAt": now_iso()})
        logging.info(f"Seeded initial admin: {u}")
    else:
        # ensure existing admin user has the admin role
        await db.users.update_many({"username": os.environ.get("SEED_ADMIN_USERNAME", "admin"),
                                    "roles": {"$exists": True, "$not": {"$elemMatch": {"$eq": admin_role_id}}}},
                                   {"$addToSet": {"roles": admin_role_id}})
        # backfill users without roles field
        await db.users.update_many({"roles": {"$exists": False}}, {"$set": {"roles": []}})

@app.on_event("shutdown")
async def on_shutdown(): client.close()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
