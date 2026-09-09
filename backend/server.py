from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid, bcrypt, jwt, logging, mimetypes, re, csv, io
from pathlib import Path
from pydantic import BaseModel
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

def now_iso(): return datetime.now(timezone.utc).isoformat()
def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p, h):
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except Exception: return False
def create_token(uid, uname):
    return jwt.encode({"sub": uid, "username": uname,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc)}, JWT_SECRET, algorithm=JWT_ALGORITHM)

PERMISSIONS_CATALOG = [
    ("students.view", "عرض الطلاب", "students", "view"),
    ("students.create", "إضافة طلاب", "students", "create"),
    ("students.update", "تعديل الطلاب", "students", "update"),
    ("students.delete", "حذف الطلاب", "students", "delete"),
    ("students.print", "طباعة الطلاب", "students", "print"),
    ("students.fullInformation.view", "عرض المعلومات الكاملة للطالب", "students", "fullInformation.view"),
    ("students.orphanDocument.view", "عرض وثيقة اليتم", "students", "orphanDocument.view"),
    ("students.orphanDocument.upload", "رفع وثيقة اليتم", "students", "orphanDocument.upload"),
    ("students.orphanDocument.delete", "حذف وثيقة اليتم", "students", "orphanDocument.delete"),
    ("teachers.view", "عرض المعلمين", "teachers", "view"),
    ("teachers.create", "إضافة معلمين", "teachers", "create"),
    ("teachers.update", "تعديل المعلمين", "teachers", "update"),
    ("teachers.delete", "حذف المعلمين", "teachers", "delete"),
    ("classes.view", "عرض الصفوف", "classes", "view"),
    ("classes.create", "إضافة صفوف", "classes", "create"),
    ("classes.update", "تعديل الصفوف", "classes", "update"),
    ("classes.delete", "حذف الصفوف", "classes", "delete"),
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
    ("settings.codeGeneration.view", "عرض إعدادات توليد الأكواد", "settings", "codeGeneration.view"),
    ("settings.codeGeneration.update", "تعديل إعدادات توليد الأكواد", "settings", "codeGeneration.update"),
]
ALL_PERMS = [p[0] for p in PERMISSIONS_CATALOG]

async def compute_user_permissions(user):
    role_ids = user.get("roles") or []
    if not role_ids: return []
    roles = await db.roles.find({"id": {"$in": role_ids}}, {"_id": 0}).to_list(100)
    perms = set()
    for r in roles:
        for p in r.get("permissions") or []: perms.add(p)
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

def require_permission(perm):
    async def checker(current=Depends(get_current_user)):
        if perm not in (current.get("permissions") or []):
            raise HTTPException(403, f"لا تملك صلاحية: {perm}")
        return current
    return checker

#region Code generation
DEFAULT_CODE_SETTINGS = {
    "students": {"prefix": "STU", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
    "teachers": {"prefix": "TCR", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
    "classes":  {"prefix": "CLS", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
    "resetYearly": True,
}
VALID_TOKENS = re.compile(r"\{(PREFIX|YEAR|YEAR2|SEQ(?::\d+)?)\}")

def validate_format(fmt: str):
    # strip all valid tokens and ensure no unmatched {...} remains
    stripped = VALID_TOKENS.sub("", fmt)
    if "{" in stripped or "}" in stripped:
        raise HTTPException(400, "الصيغة تحتوي على رموز غير مدعومة")
    if "{SEQ" not in fmt and "{SEQ:" not in fmt:
        raise HTTPException(400, "الصيغة يجب أن تحتوي على {SEQ}")

def render_code(fmt: str, prefix: str, year: int, seq: int) -> str:
    out = fmt
    out = out.replace("{PREFIX}", prefix)
    out = out.replace("{YEAR}", str(year))
    out = out.replace("{YEAR2}", str(year)[-2:])
    def seq_repl(m):
        pad = int(m.group(1)) if m.group(1) else 0
        return str(seq).zfill(pad) if pad else str(seq)
    out = re.sub(r"\{SEQ(?::(\d+))?\}", seq_repl, out)
    return out

async def get_code_settings() -> dict:
    doc = await db.settings.find_one({"id": "code_generation"}, {"_id": 0})
    if not doc:
        doc = {"id": "code_generation", **DEFAULT_CODE_SETTINGS,
               "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.settings.insert_one(doc)
        doc.pop("_id", None)
    for k in ("students","teachers","classes"):
        if k not in doc: doc[k] = DEFAULT_CODE_SETTINGS[k]
    if "resetYearly" not in doc: doc["resetYearly"] = True
    return doc

async def next_sequence(entity: str) -> int:
    settings = await get_code_settings()
    year = datetime.now(timezone.utc).year
    key = f"{entity}-{year}" if settings.get("resetYearly", True) else entity
    res = await db.counters.find_one_and_update(
        {"key": key}, {"$inc": {"sequence": 1}},
        upsert=True, return_document=True)
    if not res: res = await db.counters.find_one({"key": key})
    return res["sequence"]

async def generate_code(entity: str) -> str:
    settings = await get_code_settings()
    cfg = settings.get(entity) or DEFAULT_CODE_SETTINGS[entity]
    seq = await next_sequence(entity)
    return render_code(cfg["format"], cfg["prefix"], datetime.now(timezone.utc).year, seq)
#endregion

#region Models
class LoginIn(BaseModel):
    username: str; password: str

class UserCreate(BaseModel):
    name: str; username: str; password: str; roles: List[str] = []

class UserUpdate(BaseModel):
    name: Optional[str] = None; password: Optional[str] = None; roles: Optional[List[str]] = None

class RoleIn(BaseModel):
    name: str; description: Optional[str] = ""; permissions: List[str] = []

class StudentIn(BaseModel):
    student: dict; siblings: List[dict] = []
    father: dict = {}; mother: dict = {}; general: dict = {}
    previousEducation: List[dict] = []
    islamicLegalEducation: Optional[str] = ""; bestAchievement: Optional[str] = ""
    otherInfo: dict = {}; signing: dict = {}
    fees: dict = {}; initialPayment: Optional[dict] = None
    fullInfo: dict = {}
    currentClassId: Optional[str] = None

class PaymentIn(BaseModel):
    student: str; academicYear: str; semester: str
    amount: float; paymentDate: str; notes: Optional[str] = ""

class RefundIn(BaseModel):
    student: str; academicYear: str; semester: str
    amount: float; paymentDate: str; notes: Optional[str] = ""

class TeacherIn(BaseModel):
    fullName: str
    gender: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    specialization: Optional[str] = ""
    qualification: Optional[str] = ""
    employmentStatus: Optional[str] = "active"
    notes: Optional[str] = ""

class ClassIn(BaseModel):
    name: str
    grade: Optional[str] = ""
    section: Optional[str] = ""
    academicYear: Optional[str] = ""
    teacherId: Optional[str] = None
    capacity: Optional[int] = 0
    status: Optional[str] = "active"
    notes: Optional[str] = ""

class DeactivationIn(BaseModel):
    reason: str

class CodeSettingsIn(BaseModel):
    students: dict; teachers: dict; classes: dict; resetYearly: bool = True
#endregion

#region Auth
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

@api.get("/permissions")
async def list_permissions(current=Depends(get_current_user)):
    return [{"name": n, "description": d, "resource": r, "action": a} for (n, d, r, a) in PERMISSIONS_CATALOG]
#endregion

#region Roles
@api.get("/roles")
async def list_roles(current=Depends(require_permission("roles.view"))):
    return await db.roles.find({}, {"_id": 0}).sort("createdAt", 1).to_list(200)

@api.post("/roles")
async def create_role(body: RoleIn, current=Depends(require_permission("roles.create"))):
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    if await db.roles.find_one({"name": body.name}): raise HTTPException(400, "الاسم مستخدم")
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "description": body.description or "",
           "permissions": body.permissions, "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.roles.insert_one(doc); doc.pop("_id", None); return doc

@api.put("/roles/{rid}")
async def update_role(rid: str, body: RoleIn, current=Depends(require_permission("roles.update"))):
    if not await db.roles.find_one({"id": rid}): raise HTTPException(404, "غير موجود")
    dup = await db.roles.find_one({"name": body.name, "id": {"$ne": rid}})
    if dup: raise HTTPException(400, "الاسم مستخدم")
    await db.roles.update_one({"id": rid}, {"$set": {"name": body.name, "description": body.description or "",
        "permissions": body.permissions, "updatedAt": now_iso()}})
    return await db.roles.find_one({"id": rid}, {"_id": 0})

@api.delete("/roles/{rid}")
async def delete_role(rid: str, current=Depends(require_permission("roles.delete"))):
    await db.users.update_many({}, {"$pull": {"roles": rid}})
    r = await db.roles.delete_one({"id": rid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
#endregion

#region Users
@api.get("/users")
async def list_users(current=Depends(require_permission("users.view"))):
    return await db.users.find({}, {"_id": 0, "password": 0}).sort("createdAt", -1).to_list(500)

@api.post("/users")
async def create_user(body: UserCreate, current=Depends(require_permission("users.create"))):
    if not body.name.strip() or not body.username.strip() or len(body.password) < 4:
        raise HTTPException(400, "بيانات غير صالحة")
    if await db.users.find_one({"username": body.username}): raise HTTPException(400, "اسم المستخدم مستخدم")
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "username": body.username.strip(),
           "password": hash_pw(body.password), "roles": body.roles or [],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.users.insert_one(doc); doc.pop("password", None); doc.pop("_id", None); return doc

@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, current=Depends(require_permission("users.update"))):
    if not await db.users.find_one({"id": uid}): raise HTTPException(404, "غير موجود")
    upd = {"updatedAt": now_iso()}
    if body.name is not None: upd["name"] = body.name.strip()
    if body.password: upd["password"] = hash_pw(body.password)
    if body.roles is not None: upd["roles"] = body.roles
    await db.users.update_one({"id": uid}, {"$set": upd})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})

@api.delete("/users/{uid}")
async def delete_user(uid: str, current=Depends(require_permission("users.delete"))):
    if uid == current["id"]: raise HTTPException(400, "لا يمكنك حذف حسابك الحالي")
    r = await db.users.delete_one({"id": uid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
#endregion

#region Teachers
async def _teacher_out(t): t.pop("_id", None); return t

@api.get("/teachers")
async def list_teachers(search: Optional[str] = None, gender: Optional[str] = None,
                        employmentStatus: Optional[str] = None, specialization: Optional[str] = None,
                        page: int = 1, limit: int = 20,
                        current=Depends(require_permission("teachers.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    q = {} if employmentStatus == "all" else {"employmentStatus": employmentStatus or {"$ne": "inactive"}}
    if gender: q["gender"] = gender
    if specialization: q["specialization"] = {"$regex": specialization, "$options": "i"}
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"fullName": rx}, {"phone": rx}, {"address": rx}, {"code": rx}, {"specialization": rx}]
    total = await db.teachers.count_documents(q)
    skip = max(0, (page - 1) * limit)
    docs = await db.teachers.find(q, {"_id": 0}).sort("createdAt", -1).skip(skip).limit(limit).to_list(limit)
    return {"data": docs, "pagination": {"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) // limit}}

async def _read_csv_rows(file: UploadFile):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "يجب أن يكون الملف بصيغة CSV وبترميز UTF-8")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows = []
    for row in reader:
        normalized = {}
        for key, value in row.items():
            base_key = re.split(r"\s*[\[(]", key or "", maxsplit=1)[0].strip()
            normalized[base_key] = value
        rows.append(normalized)
    return rows

@api.post("/teachers/import")
async def import_teachers(file: UploadFile = File(...), current=Depends(require_permission("teachers.create"))):
    rows = await _read_csv_rows(file)
    required = {"fullName", "gender", "phone", "address", "specialization", "qualification", "employmentStatus", "notes"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب المعلمين غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        if not (row.get("fullName") or "").strip():
            raise HTTPException(400, f"اسم المعلم مطلوب في الصف {index}")
        code = await generate_code("teachers")
        doc = {"id": str(uuid.uuid4()), "code": code,
               "fullName": row["fullName"].strip(), "gender": row.get("gender", "").strip(),
               "phone": row.get("phone", "").strip(), "address": row.get("address", "").strip(),
               "specialization": row.get("specialization", "").strip(), "qualification": row.get("qualification", "").strip(),
               "employmentStatus": row.get("employmentStatus", "active").strip() or "active",
               "notes": row.get("notes", "").strip(), "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.teachers.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}

@api.get("/teachers/{tid}")
async def get_teacher(tid: str, current=Depends(require_permission("teachers.view"))):
    t = await db.teachers.find_one({"id": tid}, {"_id": 0})
    if not t: raise HTTPException(404, "غير موجود")
    return t

@api.post("/teachers")
async def create_teacher(body: TeacherIn, current=Depends(require_permission("teachers.create"))):
    if not body.fullName.strip(): raise HTTPException(400, "الاسم مطلوب")
    code = await generate_code("teachers")
    doc = {"id": str(uuid.uuid4()), "code": code, **body.model_dump(),
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.teachers.insert_one(doc)
    return await _teacher_out(doc)

@api.put("/teachers/{tid}")
async def update_teacher(tid: str, body: TeacherIn, current=Depends(require_permission("teachers.update"))):
    if not await db.teachers.find_one({"id": tid}): raise HTTPException(404, "غير موجود")
    upd = {**body.model_dump(), "updatedAt": now_iso()}
    await db.teachers.update_one({"id": tid}, {"$set": upd})
    return await db.teachers.find_one({"id": tid}, {"_id": 0})

@api.delete("/teachers/{tid}")
async def delete_teacher(tid: str, body: DeactivationIn, current=Depends(require_permission("teachers.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    r = await db.teachers.update_one(
        {"id": tid},
        {"$set": {"employmentStatus": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}

@api.post("/teachers/{tid}/reactivate")
async def reactivate_teacher(tid: str, current=Depends(require_permission("teachers.update"))):
    r = await db.teachers.update_one(
        {"id": tid, "employmentStatus": "inactive"},
        {"$set": {"employmentStatus": "active", "updatedAt": now_iso()},
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        teacher = await db.teachers.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not teacher: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "المعلم نشط بالفعل")
    return {"ok": True, "reactivated": True}
#endregion

#region Classes
async def _class_enrich(c: dict) -> dict:
    if c.get("teacherId"):
        t = await db.teachers.find_one({"id": c["teacherId"]}, {"_id": 0, "fullName": 1, "code": 1})
        c["teacherName"] = t.get("fullName") if t else None
        c["teacherCode"] = t.get("code") if t else None
    else:
        c["teacherName"] = None; c["teacherCode"] = None
    c["studentCount"] = await db.students.count_documents({"currentClassId": c["id"]})
    return c

@api.get("/classes")
async def list_classes(search: Optional[str] = None, grade: Optional[str] = None,
                       section: Optional[str] = None, academicYear: Optional[str] = None,
                       teacherId: Optional[str] = None, status: Optional[str] = None,
                       page: int = 1, limit: int = 50,
                       current=Depends(require_permission("classes.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    q = {} if status == "all" else {"status": status or {"$ne": "inactive"}}
    if grade: q["grade"] = grade
    if section: q["section"] = section
    if academicYear: q["academicYear"] = academicYear
    if teacherId: q["teacherId"] = teacherId
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"name": rx}, {"code": rx}, {"grade": rx}, {"section": rx}, {"academicYear": rx}]
    total = await db.classes.count_documents(q)
    docs = await db.classes.find(q, {"_id": 0}).sort("createdAt", -1).skip((page-1)*limit).limit(limit).to_list(limit)
    for d in docs: await _class_enrich(d)
    return {"data": docs, "pagination": {"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) // limit}}

@api.post("/classes/import")
async def import_classes(file: UploadFile = File(...), current=Depends(require_permission("classes.create"))):
    rows = await _read_csv_rows(file)
    required = {"name", "grade", "section", "academicYear", "teacherId", "capacity", "status", "notes"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب الصفوف غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        if not (row.get("name") or "").strip():
            raise HTTPException(400, f"اسم الصف مطلوب في الصف {index}")
        teacher_id = (row.get("teacherId") or "").strip() or None
        if teacher_id and not await db.teachers.find_one({"id": teacher_id}):
            raise HTTPException(400, f"المعلم غير موجود في الصف {index}")
        try: capacity = int(row.get("capacity") or 0)
        except ValueError: raise HTTPException(400, f"السعة غير صحيحة في الصف {index}")
        code = await generate_code("classes")
        doc = {"id": str(uuid.uuid4()), "code": code, "name": row["name"].strip(),
               "grade": row.get("grade", "").strip(), "section": row.get("section", "").strip(),
               "academicYear": row.get("academicYear", "").strip(), "teacherId": teacher_id,
               "capacity": capacity, "status": row.get("status", "active").strip() or "active",
               "notes": row.get("notes", "").strip(), "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.classes.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}

@api.get("/classes/{cid}")
async def get_class(cid: str, current=Depends(require_permission("classes.view"))):
    c = await db.classes.find_one({"id": cid}, {"_id": 0})
    if not c: raise HTTPException(404, "غير موجود")
    return await _class_enrich(c)

@api.post("/classes")
async def create_class(body: ClassIn, current=Depends(require_permission("classes.create"))):
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    code = await generate_code("classes")
    doc = {"id": str(uuid.uuid4()), "code": code, **body.model_dump(),
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.classes.insert_one(doc)
    return await _class_enrich({k: v for k, v in doc.items() if k != "_id"})

@api.put("/classes/{cid}")
async def update_class(cid: str, body: ClassIn, current=Depends(require_permission("classes.update"))):
    if not await db.classes.find_one({"id": cid}): raise HTTPException(404, "غير موجود")
    upd = {**body.model_dump(), "updatedAt": now_iso()}
    await db.classes.update_one({"id": cid}, {"$set": upd})
    return await _class_enrich(await db.classes.find_one({"id": cid}, {"_id": 0}))

@api.delete("/classes/{cid}")
async def delete_class(cid: str, body: DeactivationIn, current=Depends(require_permission("classes.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    r = await db.classes.update_one(
        {"id": cid},
        {"$set": {"status": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}

@api.post("/classes/{cid}/reactivate")
async def reactivate_class(cid: str, current=Depends(require_permission("classes.update"))):
    r = await db.classes.update_one(
        {"id": cid, "status": "inactive"},
        {"$set": {"status": "active", "updatedAt": now_iso()},
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        cls = await db.classes.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not cls: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "الصف نشط بالفعل")
    return {"ok": True, "reactivated": True}
#endregion

#region Students
async def _student_payment_totals(sid: str, ay: Optional[str] = None) -> dict:
    q = {"student": sid}
    if ay: q["academicYear"] = ay
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    return {"totalPaid": sum(float(p.get("amount", 0)) for p in docs), "count": len(docs)}

def _payment_order_key(payment):
    return (payment.get("paymentDate") or "", payment.get("createdAt") or "", payment.get("id") or "")

async def _payment_snapshot(payment, payable):
    if "totalPaidAtPayment" in payment and "totalRemainingAtPayment" in payment:
        return float(payment["totalPaidAtPayment"]), float(payment["totalRemainingAtPayment"])
    docs = await db.payments.find(
        {"student": payment.get("student"), "academicYear": payment.get("academicYear")},
        {"_id": 0, "id": 1, "amount": 1, "paymentDate": 1, "createdAt": 1},
    ).to_list(1000)
    cumulative = 0
    for doc in sorted(docs, key=_payment_order_key):
        cumulative += float(doc.get("amount", 0))
        if doc.get("id") == payment.get("id"):
            break
    return cumulative, max(0, payable - cumulative)

async def _augment_student(doc: dict) -> dict:
    fees = doc.get("fees") or {}
    ay = fees.get("academicYear")
    total_payable = float(fees.get("totalPayable") or 0)
    totals = await _student_payment_totals(doc["id"], ay)
    doc["fees"] = {"academicYear": ay, "totalPayable": total_payable,
                   "totalPaid": totals["totalPaid"],
                   "remaining": max(0, total_payable - totals["totalPaid"])}
    if doc.get("currentClassId"):
        c = await db.classes.find_one({"id": doc["currentClassId"]}, {"_id": 0, "name": 1, "grade": 1, "section": 1, "academicYear": 1, "teacherId": 1})
        if c:
            doc["currentClass"] = {"name": c.get("name"), "grade": c.get("grade"),
                "section": c.get("section"), "academicYear": c.get("academicYear")}
            if c.get("teacherId"):
                t = await db.teachers.find_one({"id": c["teacherId"]}, {"_id": 0, "fullName": 1})
                doc["currentTeacher"] = t.get("fullName") if t else None
    return doc

def _payment_status_query(status: str):
    return status  # handled in-memory after fetch to keep server simple

@api.get("/students")
async def list_students(search: Optional[str] = None, gender: Optional[str] = None,
                        orphan: Optional[str] = None, registrationPath: Optional[str] = None,
                        classId: Optional[str] = None, status: Optional[str] = None,
                        academicYear: Optional[str] = None, paymentStatus: Optional[str] = None,
                        teacherId: Optional[str] = None,
                        page: int = 1, limit: int = 20,
                        current=Depends(require_permission("students.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    q = {} if status == "all" else {"student.status": status or {"$ne": "inactive"}}
    if gender: q["student.gender"] = gender
    if orphan in ("true", "false"): q["student.orphan"] = (orphan == "true")
    if registrationPath: q["student.registrationPath"] = registrationPath
    if academicYear: q["fees.academicYear"] = academicYear
    if classId: q["currentClassId"] = classId
    if teacherId:
        cls = await db.classes.find({"teacherId": teacherId}, {"id": 1, "_id": 0}).to_list(500)
        q["currentClassId"] = {"$in": [c["id"] for c in cls]}
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"student.fullName": rx}, {"code": rx},
                    {"father.name": rx}, {"mother.name": rx},
                    {"father.phone": rx}, {"mother.phone": rx},
                    {"student.currentAddress": rx},
                    {"general.whatsappGroupPhone": rx}]
    # Payment status is derived from payment records, so it must be evaluated
    # before pagination; otherwise matching students can be skipped and totals
    # become inaccurate.
    if paymentStatus:
        docs = await db.students.find(q, {"_id": 0}).sort("createdAt", -1).to_list(None)
        for d in docs: await _augment_student(d)
        def matches(d):
            f = d.get("fees", {}); tp = f.get("totalPayable", 0); pp = f.get("totalPaid", 0)
            if paymentStatus == "paid": return tp > 0 and pp >= tp
            if paymentStatus == "partial": return 0 < pp < tp
            if paymentStatus == "unpaid": return pp == 0
            return True
        docs = [d for d in docs if matches(d)]
        total = len(docs)
        docs = docs[(page - 1) * limit:page * limit]
    else:
        total = await db.students.count_documents(q)
        docs = await db.students.find(q, {"_id": 0}).sort("createdAt", -1).skip((page-1)*limit).limit(limit).to_list(limit)
        for d in docs: await _augment_student(d)
    return {"data": docs, "pagination": {"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) // limit}}

@api.post("/students/import")
async def import_students(file: UploadFile = File(...), current=Depends(require_permission("students.create"))):
    rows = await _read_csv_rows(file)
    required = {"fullName", "gender", "birthdate", "registrationPath", "status", "currentAddress", "fatherName", "fatherPhone", "motherName", "motherPhone", "academicYear", "totalPayable", "currentClassId"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب الطلاب غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        full_name = (row.get("fullName") or "").strip()
        if not full_name: raise HTTPException(400, f"اسم الطالب مطلوب في الصف {index}")
        class_id = (row.get("currentClassId") or "").strip() or None
        if class_id and not await db.classes.find_one({"id": class_id}):
            raise HTTPException(400, f"الصف غير موجود في الصف {index}")
        try: total_payable = float(row.get("totalPayable") or 0)
        except ValueError: raise HTTPException(400, f"إجمالي المستحق غير صحيح في الصف {index}")
        code = await generate_code("students")
        doc = {"id": str(uuid.uuid4()), "code": code,
               "student": {"fullName": full_name, "gender": row.get("gender", "male").strip() or "male",
                           "birthdate": row.get("birthdate", "").strip(), "registrationPath": row.get("registrationPath", "خاص").strip() or "خاص",
                           "status": row.get("status", "resident").strip() or "resident", "currentAddress": row.get("currentAddress", "").strip()},
               "father": {"name": row.get("fatherName", "").strip(), "phone": row.get("fatherPhone", "").strip()},
               "mother": {"name": row.get("motherName", "").strip(), "phone": row.get("motherPhone", "").strip()},
               "fees": {"academicYear": row.get("academicYear", "").strip(), "totalPayable": total_payable},
               "currentClassId": class_id, "siblings": [], "general": {}, "previousEducation": [],
               "otherInfo": {}, "signing": {}, "fullInfo": {}, "createdAt": now_iso(), "updatedAt": now_iso()}
        _clean_reg_path(doc["student"]["registrationPath"])
        await db.students.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}

@api.get("/students/{sid}")
async def get_student(sid: str, current=Depends(require_permission("students.view"))):
    d = await db.students.find_one({"id": sid}, {"_id": 0})
    if not d: raise HTTPException(404, "غير موجود")
    return await _augment_student(d)

@api.get("/public/students/{sid}/validation")
async def validate_student(sid: str):
    d = await db.students.find_one({"id": sid}, {"_id": 0})
    if not d: raise HTTPException(404, "الطالب غير موجود")
    student = d.get("student") or {}
    current_class = None
    if d.get("currentClassId"):
        current_class = await db.classes.find_one(
            {"id": d["currentClassId"]},
            {"_id": 0, "name": 1, "section": 1, "academicYear": 1},
        )
    return {
        "code": d.get("code"),
        "fullName": student.get("fullName"),
        "status": student.get("status") or "resident",
        "isActive": student.get("status") != "inactive",
        "className": current_class.get("name") if current_class else student.get("newClass"),
        "section": current_class.get("section") if current_class else None,
        "academicYear": (current_class or {}).get("academicYear") or (d.get("fees") or {}).get("academicYear"),
    }

@api.get("/students/{sid}/full-information")
async def get_student_full(sid: str, current=Depends(require_permission("students.fullInformation.view"))):
    d = await db.students.find_one({"id": sid}, {"_id": 0})
    if not d: raise HTTPException(404, "غير موجود")
    return await _augment_student(d)

def _clean_reg_path(p):
    if p and p not in ("خاص", "القرية", "الايتام"):
        raise HTTPException(400, "مسار التسجيل غير صالح")

@api.post("/students")
async def create_student(body: StudentIn, current=Depends(require_permission("students.create"))):
    p = body.model_dump()
    _clean_reg_path((p.get("student") or {}).get("registrationPath"))
    p["id"] = str(uuid.uuid4())
    p["code"] = await generate_code("students")
    p["createdAt"] = now_iso(); p["updatedAt"] = now_iso()
    initial = p.pop("initialPayment", None)
    fees = p.get("fees") or {}
    p["fees"] = {"academicYear": fees.get("academicYear") or "",
                 "totalPayable": float(fees.get("totalPayable") or 0)}
    if p.get("currentClassId"):
        if not await db.classes.find_one({"id": p["currentClassId"]}):
            raise HTTPException(400, "الصف غير موجود")
    await db.students.insert_one(p)
    if initial and float(initial.get("amount") or 0) > 0:
        amt = float(initial["amount"])
        if amt > p["fees"]["totalPayable"]:
            await db.students.delete_one({"id": p["id"]})
            raise HTTPException(400, "الدفعة الأولى تتجاوز إجمالي المستحق")
        await db.payments.insert_one({"id": str(uuid.uuid4()), "student": p["id"],
            "academicYear": p["fees"]["academicYear"] or "", "semester": initial.get("semester") or "full_year",
            "amount": amt, "paymentDate": initial.get("paymentDate") or now_iso(),
            "notes": "دفعة أولية عند التسجيل", "createdBy": current["id"],
            "createdAt": now_iso(), "updatedAt": now_iso()})
    return await _augment_student(await db.students.find_one({"id": p["id"]}, {"_id": 0}))

@api.put("/students/{sid}")
async def update_student(sid: str, body: StudentIn, current=Depends(require_permission("students.update"))):
    existing = await db.students.find_one({"id": sid})
    if not existing: raise HTTPException(404, "غير موجود")
    p = body.model_dump()
    p.pop("initialPayment", None)
    _clean_reg_path((p.get("student") or {}).get("registrationPath"))
    fees = p.get("fees") or {}
    p["fees"] = {"academicYear": fees.get("academicYear") or "",
                 "totalPayable": float(fees.get("totalPayable") or 0)}
    if existing.get("orphanDocument"): p["orphanDocument"] = existing["orphanDocument"]
    if existing.get("code"): p["code"] = existing["code"]
    if p.get("currentClassId"):
        if not await db.classes.find_one({"id": p["currentClassId"]}):
            raise HTTPException(400, "الصف غير موجود")
    p["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": p})
    return await _augment_student(await db.students.find_one({"id": sid}, {"_id": 0}))

@api.delete("/students/{sid}")
async def delete_student(sid: str, body: DeactivationIn, current=Depends(require_permission("students.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    r = await db.students.update_one(
        {"id": sid},
        {"$set": {"student.status": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}

@api.post("/students/{sid}/reactivate")
async def reactivate_student(sid: str, current=Depends(require_permission("students.update"))):
    r = await db.students.update_one(
        {"id": sid, "student.status": "inactive"},
        {"$set": {"student.status": "resident", "updatedAt": now_iso()},
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        student = await db.students.find_one({"id": sid}, {"_id": 0, "id": 1})
        if not student: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "الطالب نشط بالفعل")
    return {"ok": True, "reactivated": True}
#endregion

#region Orphan docs
@api.post("/students/{sid}/orphan-document")
async def upload_orphan_doc(sid: str, type: str = Form(...), description: Optional[str] = Form(""),
                             file: UploadFile = File(...),
                             current=Depends(require_permission("students.orphanDocument.upload"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS: raise HTTPException(400, "امتداد ملف غير مسموح")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime and mime not in ALLOWED_MIMES: raise HTTPException(400, "نوع ملف غير مسموح")
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
    old = (student.get("orphanDocument") or {}).get("filePath")
    if old:
        try: os.remove(old)
        except Exception: pass
    meta = {"type": type, "description": description or "", "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath),
            "mimeType": mime, "size": size, "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {"orphanDocument": meta, "updatedAt": now_iso()}})
    return {k: v for k, v in meta.items() if k != "filePath"}

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
    if od.get("filePath"):
        try: os.remove(od["filePath"])
        except Exception: pass
    await db.students.update_one({"id": sid}, {"$unset": {"orphanDocument": ""}, "$set": {"updatedAt": now_iso()}})
    return {"ok": True}
#endregion

#region Payments
async def _enrich_payment(p):
    # Database inserts add Mongo's ObjectId to the original dictionary. It is
    # not JSON serializable, so never allow it to reach an API response.
    p.pop("_id", None)
    s = await db.students.find_one({"id": p.get("student")}, {"_id": 0, "student.fullName": 1, "code": 1, "fees": 1})
    p["studentName"] = (s.get("student") or {}).get("fullName") if s else "—"
    p["studentCode"] = s.get("code") if s else None
    fee_year = p.get("academicYear") or ((s.get("fees") or {}).get("academicYear") if s else "")
    p["totalPayable"] = float(((s.get("fees") or {}).get("totalPayable")) or 0) if s else 0
    p["totalPaid"], p["totalRemaining"] = await _payment_snapshot(p, p["totalPayable"]) if s else (0, 0)
    current_totals = await _student_payment_totals(p.get("student"), fee_year) if s else {"totalPaid": 0}
    p["currentTotalPaid"] = current_totals["totalPaid"]
    p["currentTotalRemaining"] = max(0, p["totalPayable"] - p["currentTotalPaid"])
    p["totalPaidAtPayment"] = float(p.get("totalPaidAtPayment") if p.get("totalPaidAtPayment") is not None else p["totalPaid"])
    p["totalRemainingAtPayment"] = float(p.get("totalRemainingAtPayment") if p.get("totalRemainingAtPayment") is not None else p["totalRemaining"])
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
        matching = await db.students.find({"$or": [{"student.fullName": {"$regex": search, "$options": "i"}},
                                                    {"code": {"$regex": search, "$options": "i"}}]}, {"id": 1, "_id": 0}).to_list(500)
        q["student"] = {"$in": [m["id"] for m in matching]}
    docs = await db.payments.find(q, {"_id": 0}).sort("createdAt", -1).to_list(1000)
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

async def _validate_no_overpayment(sid, ay, amt, exclude=None):
    s = await db.students.find_one({"id": sid})
    if not s: raise HTTPException(404, "الطالب غير موجود")
    tp = float(((s.get("fees") or {}).get("totalPayable")) or 0)
    q = {"student": sid, "academicYear": ay}
    if exclude: q["id"] = {"$ne": exclude}
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    cur = sum(float(p.get("amount", 0)) for p in docs)
    if cur + float(amt) > tp + 0.0001:
        raise HTTPException(400, f"مبلغ الدفعة يتجاوز الرصيد المتبقي (المتبقي: {tp - cur})")

@api.post("/payments")
async def create_payment(body: PaymentIn, current=Depends(require_permission("payments.create"))):
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await _validate_no_overpayment(body.student, body.academicYear, body.amount)
    doc = {"id": str(uuid.uuid4()), "student": body.student, "academicYear": body.academicYear,
           "semester": body.semester, "amount": float(body.amount), "paymentDate": body.paymentDate,
           "notes": body.notes or "", "createdBy": current["id"], "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(doc, float(((await db.students.find_one({"id": body.student}) or {}).get("fees") or {}).get("totalPayable") or 0))
    await db.payments.update_one({"id": doc["id"]}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    doc["totalPaidAtPayment"] = paid_at_payment
    doc["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment({k: v for k, v in doc.items() if k != "_id"})

@api.post("/payments/refund")
async def create_refund(body: RefundIn, current=Depends(require_permission("payments.create"))):
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "مبلغ الاسترداد يجب أن يكون أكبر من صفر")
    student = await db.students.find_one({"id": body.student}, {"_id": 0, "fees": 1})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    semester_payments = await db.payments.find(
        {"student": body.student, "academicYear": body.academicYear, "semester": body.semester},
        {"_id": 0, "amount": 1},
    ).to_list(1000)
    paid_for_semester = max(0, sum(float(p.get("amount", 0)) for p in semester_payments))
    if body.amount > paid_for_semester + 0.0001:
        raise HTTPException(400, f"مبلغ الاسترداد يتجاوز المدفوع للفصل (المتاح: {paid_for_semester})")
    doc = {"id": str(uuid.uuid4()), "student": body.student, "academicYear": body.academicYear,
           "semester": body.semester, "amount": -float(body.amount), "type": "refund",
           "paymentDate": body.paymentDate, "notes": body.notes or "", "createdBy": current["id"],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    payable = float(((student.get("fees") or {}).get("totalPayable")) or 0)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(doc, payable)
    await db.payments.update_one({"id": doc["id"]}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    doc["totalPaidAtPayment"] = paid_at_payment
    doc["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment({k: v for k, v in doc.items() if k != "_id"})

@api.put("/payments/{pid}")
async def update_payment(pid: str, body: PaymentIn, current=Depends(require_permission("payments.update"))):
    existing = await db.payments.find_one({"id": pid})
    if not existing: raise HTTPException(404, "غير موجود")
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await _validate_no_overpayment(body.student, body.academicYear, body.amount, exclude=pid)
    await db.payments.update_one({"id": pid}, {"$set": {"student": body.student, "academicYear": body.academicYear,
        "semester": body.semester, "amount": float(body.amount), "paymentDate": body.paymentDate,
        "notes": body.notes or "", "updatedAt": now_iso()}})
    updated = await db.payments.find_one({"id": pid}, {"_id": 0})
    student = await db.students.find_one({"id": body.student}, {"_id": 0, "fees": 1})
    updated.pop("totalPaidAtPayment", None)
    updated.pop("totalRemainingAtPayment", None)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(updated, float(((student or {}).get("fees") or {}).get("totalPayable") or 0))
    await db.payments.update_one({"id": pid}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    updated["totalPaidAtPayment"] = paid_at_payment
    updated["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment(updated)

@api.delete("/payments/{pid}")
async def delete_payment(pid: str, current=Depends(require_permission("payments.delete"))):
    r = await db.payments.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
#endregion

#region Settings / Code generation
@api.get("/settings/code-generation")
async def get_settings(current=Depends(require_permission("settings.codeGeneration.view"))):
    return await get_code_settings()

@api.post("/settings/code-generation/preview")
async def preview_settings(body: CodeSettingsIn, current=Depends(require_permission("settings.codeGeneration.view"))):
    year = datetime.now(timezone.utc).year
    out = {}
    for k in ("students", "teachers", "classes"):
        cfg = body.model_dump()[k]
        try:
            validate_format(cfg["format"])
            out[k] = render_code(cfg["format"], cfg["prefix"], year, 1)
        except HTTPException as e:
            out[k] = f"ERROR: {e.detail}"
    return out

@api.put("/settings/code-generation")
async def update_settings(body: CodeSettingsIn, current=Depends(require_permission("settings.codeGeneration.update"))):
    for k in ("students", "teachers", "classes"):
        cfg = body.model_dump()[k]
        if not cfg.get("prefix"): raise HTTPException(400, f"البادئة مطلوبة لـ {k}")
        validate_format(cfg["format"])
    await db.settings.update_one({"id": "code_generation"},
        {"$set": {**body.model_dump(), "updatedAt": now_iso()}}, upsert=True)
    return await get_code_settings()
#endregion

#region Dashboard
@api.get("/dashboard/stats")
async def dashboard_stats(current=Depends(get_current_user)):
    total = await db.students.count_documents({})
    female = await db.students.count_documents({"student.gender": "female"})
    male = await db.students.count_documents({"student.gender": "male"})
    orphans = await db.students.count_documents({"student.orphan": True})
    teachers_count = await db.teachers.count_documents({})
    classes_count = await db.classes.count_documents({})

    # Only payments belonging to active students
    pay_agg = await db.payments.aggregate([
        {
            "$lookup": {
                "from": "students",
                "localField": "student",
                "foreignField": "id",
                "as": "student"
            }
        },
        {
            "$unwind": "$student"
        },
        {
            "$match": {
                "student.student.status": {"$ne": "inactive"}
            }
        },
        {
            "$group": {
                "_id": None,
                "sum": {"$sum": "$amount"}
            }
        }
    ]).to_list(1)

    total_collected = pay_agg[0]["sum"] if pay_agg else 0

    # Only payable fees of active students
    stu_agg = await db.students.aggregate([
        {
            "$match": {
                "student.status": {"$ne": "inactive"}
            }
        },
        {
            "$group": {
                "_id": None,
                "sum": {"$sum": "$fees.totalPayable"}
            }
        }
    ]).to_list(1)

    total_payable = stu_agg[0]["sum"] if stu_agg else 0

    return {
        "total": total,
        "female": female,
        "male": male,
        "orphans": orphans,
        "teachers": teachers_count,
        "classes": classes_count,
        "totalPayable": total_payable,
        "totalCollected": total_collected,
        "totalRemaining": max(
            0,
            (total_payable or 0) - (total_collected or 0)
        )
    }
#endregion

#region Startup / seed
@app.on_event("startup")
async def on_startup():
    defaults = [
        {"name": "Administrator", "description": "صلاحيات كاملة", "permissions": ALL_PERMS},
        {"name": "Registration Staff", "description": "موظف تسجيل",
         "permissions": ["students.view","students.create","students.update","students.print",
                         "students.fullInformation.view",
                         "payments.view","payments.create","payments.print",
                         "students.orphanDocument.view","students.orphanDocument.upload",
                         "teachers.view","classes.view"]},
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
            if r["name"] == "Administrator":
                await db.roles.update_one({"id": existing["id"]}, {"$set": {"permissions": ALL_PERMS, "updatedAt": now_iso()}})
                admin_role_id = existing["id"]
    if not admin_role_id:
        admin_role_id = (await db.roles.find_one({"name": "Administrator"}))["id"]

    try:
        await db.students.create_index("student.fullName")
        await db.students.create_index("code", unique=True, sparse=True)
        await db.students.create_index("currentClassId")
        await db.payments.create_index("student")
        await db.payments.create_index("academicYear")
        await db.users.create_index("username", unique=True)
        await db.roles.create_index("name", unique=True)
        await db.teachers.create_index("code", unique=True, sparse=True)
        await db.classes.create_index("code", unique=True, sparse=True)
        await db.counters.create_index("key", unique=True)
    except Exception as e:
        logging.warning(f"index setup: {e}")

    # Backfill missing student codes
    async for doc in db.students.find({"code": {"$exists": False}}, {"_id": 0, "id": 1}):
        try:
            code = await generate_code("students")
            await db.students.update_one({"id": doc["id"]}, {"$set": {"code": code}})
        except Exception:
            pass

    if await db.users.count_documents({}) == 0:
        u = os.environ.get("SEED_ADMIN_USERNAME", "admin")
        p = os.environ.get("SEED_ADMIN_PASSWORD", "admin123")
        n = os.environ.get("SEED_ADMIN_NAME", "مدير النظام")
        await db.users.insert_one({"id": str(uuid.uuid4()), "name": n, "username": u,
            "password": hash_pw(p), "roles": [admin_role_id],
            "createdAt": now_iso(), "updatedAt": now_iso()})
    else:
        await db.users.update_many({"roles": {"$exists": False}}, {"$set": {"roles": []}})
        await db.users.update_many(
            {"username": os.environ.get("SEED_ADMIN_USERNAME", "admin"),
             "roles": {"$not": {"$elemMatch": {"$eq": admin_role_id}}}},
            {"$addToSet": {"roles": admin_role_id}})

    await get_code_settings()

@app.on_event("shutdown")
async def on_shutdown(): client.close()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)

#endregion
