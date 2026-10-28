from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid, bcrypt, jwt, logging, mimetypes, re, csv, io, math, asyncio, json
from pathlib import Path
from pydantic import BaseModel, EmailStr, TypeAdapter, ValidationError
from typing import List, Optional
from datetime import date, datetime, timezone, timedelta
import requests
from models import *
from services import (
    configure as configure_services,
    now_iso, hash_pw, verify_pw, create_token,
    compute_user_permissions, get_current_user, require_permission,
    accessible_branches,
    allowed_class_ids, ensure_class_access, ensure_student_access,
    grade_scope, ensure_grade_scope, validate_format, render_code,
    get_code_settings, next_sequence, generate_code,
)
from branching import BranchScopedDatabase, set_default_branch_id

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', '24'))
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(ROOT_DIR / 'uploads')))
ORPHAN_DIR = UPLOAD_DIR / 'orphan-documents'
STUDENT_DOCUMENTS_DIR = UPLOAD_DIR / 'student-documents'
TEACHER_DOCUMENTS_DIR = UPLOAD_DIR / 'teacher-documents'
ORPHAN_DIR.mkdir(parents=True, exist_ok=True)
STUDENT_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
TEACHER_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_MB', '10')) * 1024 * 1024
ALLOWED_MIMES = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}

client = AsyncIOMotorClient(MONGO_URL)
raw_db = client[DB_NAME]
db = BranchScopedDatabase(raw_db)
configure_services(db, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS)
app = FastAPI(title="IQRA School API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

def now_iso(): return datetime.now(timezone.utc).isoformat()
def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p, h):
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except Exception: return False
def create_token(uid, uname, branch_id=None, selection_pending=False):
    return jwt.encode({"sub": uid, "username": uname,
        "branchId": branch_id, "branchSelectionPending": selection_pending,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc)}, JWT_SECRET, algorithm=JWT_ALGORITHM)

PERMISSIONS_CATALOG = [
    ("branches.manage", "إدارة فروع المدرسة", "branches", "manage"),
    ("branches.accessAll", "الوصول إلى جميع فروع المدرسة", "branches", "accessAll"),
    ("students.view", "عرض الطلاب", "students", "view"),
    ("students.gender.male.view", "عرض الطلاب الذكور فقط", "students.gender", "male.view"),
    ("students.gender.female.view", "عرض الطالبات فقط", "students.gender", "female.view"),
    ("students.scope.lowerGrades.view", "عرض طلاب الصفين الأول والثاني (ذكور وإناث)", "students.scope", "lowerGrades.view"),
    ("students.scope.upperGrades.male.view", "عرض الذكور من الصف الثالث إلى التاسع", "students.scope", "upperGrades.male.view"),
    ("students.scope.upperGrades.female.view", "عرض الإناث من الصف الثالث إلى التاسع", "students.scope", "upperGrades.female.view"),
    ("students.create", "إضافة طلاب", "students", "create"),
    ("students.update", "تعديل الطلاب", "students", "update"),
    ("students.delete", "حذف الطلاب", "students", "delete"),
    ("students.print", "طباعة الطلاب", "students", "print"),
    ("students.fullInformation.view", "عرض المعلومات الكاملة للطالب", "students", "fullInformation.view"),
    ("students.notes.view", "عرض ملاحظات الطلاب", "students.notes", "view"),
    ("students.notes.create", "إضافة ملاحظات الطلاب", "students.notes", "create"),
    ("students.notes.update", "تعديل ملاحظات الطلاب", "students.notes", "update"),
    ("students.notes.delete", "حذف ملاحظات الطلاب", "students.notes", "delete"),
    ("students.orphanDocument.view", "عرض وثيقة اليتم", "students", "orphanDocument.view"),
    ("students.orphanDocument.upload", "رفع وثيقة اليتم", "students", "orphanDocument.upload"),
    ("students.orphanDocument.delete", "حذف وثيقة اليتم", "students", "orphanDocument.delete"),
    ("students.documents.view", "عرض وثائق الطالب", "students", "documents.view"),
    ("students.documents.upload", "رفع وثائق الطالب", "students", "documents.upload"),
    ("students.documents.delete", "حذف وثائق الطالب", "students", "documents.delete"),
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
    ("reports.view", "عرض التقارير", "reports", "view"),
    ("reports.finance.view", "عرض تقارير المدفوعات", "reports.finance", "view"),
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
    ("subjects.view", "عرض المواد", "subjects", "view"),
    ("subjects.create", "إضافة مواد", "subjects", "create"),
    ("subjects.update", "تعديل المواد", "subjects", "update"),
    ("subjects.delete", "حذف المواد", "subjects", "delete"),
    ("grades.view", "عرض الدرجات", "grades", "view"),
    ("grades.create", "إضافة الدرجات", "grades", "create"),
    ("grades.edit", "تعديل الدرجات", "grades", "edit"),
    ("grades.accept", "فتح فترة قبول الدرجات", "grades", "accept"),
    ("homework.view", "عرض الواجبات غير المنجزة", "homework", "view"),
    ("homework.create", "تسجيل واجب غير منجز", "homework", "create"),
    ("attendance.view", "عرض الحضور", "attendance", "view"),
    ("attendance.manage", "إدارة الحضور", "attendance", "manage"),
    ("attendance.reports.view", "عرض تقارير الغياب المتكرر", "attendance.reports", "view"),
    ("attendance.reports.print", "طباعة تقارير الغياب المتكرر", "attendance.reports", "print"),
    ("messages.view", "عرض الرسائل", "messages", "view"),
    ("messages.reply", "الرد على الرسائل", "messages", "reply"),
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

async def allowed_class_ids(current):
    """Return None for unrestricted users, otherwise the classes assigned to their teacher."""
    teacher_id = current.get("teacherId")
    if not teacher_id:
        return None
    classes = await db.classes.find(
        {"$or": [{"teacherIds": teacher_id}, {"teacherId": teacher_id}]},
        {"_id": 0, "id": 1},
    ).to_list(5000)
    return [item["id"] for item in classes]

async def ensure_class_access(class_id, current):
    allowed = await allowed_class_ids(current)
    if allowed is not None and class_id not in allowed:
        raise HTTPException(404, "غير موجود")
    cls = await db.classes.find_one({"id": class_id})
    if not cls:
        raise HTTPException(404, "غير موجود")
    return cls

async def ensure_student_access(student_id, current):
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(404, "غير موجود")
    allowed = await allowed_class_ids(current)
    if allowed is not None and student.get("currentClassId") not in allowed:
        raise HTTPException(404, "غير موجود")
    return student

async def grade_scope(current):
    """Return authorized class/subject pairs, or None for unrestricted users."""
    teacher_id = current.get("teacherId")
    if not teacher_id:
        return None
    assignments = await db.class_subject_assignments.find(
        {"teacherIds": teacher_id}, {"_id": 0, "classId": 1, "subjectId": 1}
    ).to_list(5000)
    return {(item["classId"], item["subjectId"]) for item in assignments}

async def ensure_grade_scope(class_id, subject_id, current):
    allowed = await grade_scope(current)
    if allowed is not None and (class_id, subject_id) not in allowed:
        raise HTTPException(404, "غير موجود")
    cls = await db.classes.find_one({"id": class_id})
    subject = await db.subjects.find_one({"id": subject_id})
    if not cls or not subject:
        raise HTTPException(400, "الصف أو المادة غير موجودة")
    assignment = await db.class_subject_assignments.find_one({"classId": class_id, "subjectId": subject_id})
    if not assignment:
        raise HTTPException(400, "المادة غير مسندة إلى هذا الصف")
    return cls, subject, assignment

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

# Shared modules are rebound here after the legacy declarations above, so all
# route dependencies use the canonical models and service implementations.
from models import *
from services import (
    now_iso, hash_pw, verify_pw, create_token,
    compute_user_permissions, get_current_user, require_permission,
    accessible_branches,
    allowed_class_ids, ensure_class_access, ensure_student_access,
    grade_scope, ensure_grade_scope, validate_format, render_code,
    get_code_settings, next_sequence, generate_code,
)

#region Auth
def _auth_user_payload(user, branches, active_branch_id=None):
    return {
        "id": user["id"],
        "name": user["name"],
        "username": user["username"],
        "createdAt": user["createdAt"],
        "roles": user.get("roles", []),
        "teacherId": user.get("teacherId"),
        "branchIds": user.get("branchIds") or [],
        "branches": branches,
        "activeBranch": next(
            (branch for branch in branches if branch["id"] == active_branch_id),
            None,
        ),
        "permissions": user.get("permissions", []),
    }


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await raw_db.users.find_one({"username": body.username})
    if not user or not verify_pw(body.password, user.get("password", "")):
        raise HTTPException(401, "اسم المستخدم أو كلمة المرور غير صحيحة")
    perms = await compute_user_permissions(user)
    branches = await accessible_branches(user, perms)
    if not branches:
        raise HTTPException(403, "لا تملك صلاحية الوصول إلى أي فرع")
    active_branch = branches[0] if len(branches) == 1 else None
    return {
        "token": create_token(
            user["id"],
            user["username"],
            active_branch["id"] if active_branch else None,
            selection_pending=active_branch is None,
        ),
        "requiresBranchSelection": active_branch is None,
        "branches": branches,
        "user": _auth_user_payload(
            {**user, "permissions": perms},
            branches,
            active_branch["id"] if active_branch else None,
        ),
    }


@api.post("/auth/select-branch")
async def select_branch(body: SelectBranchIn, current=Depends(get_current_user)):
    branch = next(
        (item for item in current.get("branches", []) if item["id"] == body.branchId),
        None,
    )
    if not branch:
        raise HTTPException(403, "لا تملك صلاحية الوصول إلى هذا الفرع")
    user = {**current, "activeBranch": branch}
    return {
        "token": create_token(current["id"], current["username"], branch["id"]),
        "user": _auth_user_payload(
            user,
            current["branches"],
            branch["id"],
        ),
    }

@api.post("/auth/logout")
async def logout(current=Depends(get_current_user)): return {"ok": True}

@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return _auth_user_payload(
        current,
        current.get("branches", []),
        current.get("branchId"),
    )

@api.get("/permissions")
async def list_permissions(current=Depends(get_current_user)):
    return [{"name": n, "description": d, "resource": r, "action": a} for (n, d, r, a) in PERMISSIONS_CATALOG]
#endregion

#region Branches
@api.get("/branches")
async def list_branches(current=Depends(require_permission("branches.manage"))):
    return await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(500)


@api.post("/branches")
async def create_branch(
    body: BranchIn,
    current=Depends(require_permission("branches.manage")),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "اسم الفرع مطلوب")
    if await db.branches.find_one({"name": name}):
        raise HTTPException(400, "اسم الفرع مستخدم")
    branch = {
        "id": str(uuid.uuid4()),
        "name": name,
        "active": body.active,
        "isDefault": False,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    await db.branches.insert_one(branch)
    branch.pop("_id", None)
    return branch


@api.put("/branches/{branch_id}")
async def update_branch(
    branch_id: str,
    body: BranchIn,
    current=Depends(require_permission("branches.manage")),
):
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(404, "الفرع غير موجود")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "اسم الفرع مطلوب")
    if await db.branches.find_one({"name": name, "id": {"$ne": branch_id}}):
        raise HTTPException(400, "اسم الفرع مستخدم")
    if branch.get("isDefault") and not body.active:
        raise HTTPException(400, "لا يمكن تعطيل الفرع الرئيسي")
    if branch.get("active", True) and not body.active:
        active_count = await db.branches.count_documents({"active": {"$ne": False}})
        if active_count <= 1:
            raise HTTPException(400, "يجب إبقاء فرع واحد على الأقل نشطاً")
    await db.branches.update_one(
        {"id": branch_id},
        {"$set": {"name": name, "active": body.active, "updatedAt": now_iso()}},
    )
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})
#endregion

#region Roles
@api.get("/roles")
async def list_roles(current=Depends(require_permission("roles.view"))):
    return await db.roles.find({}, {"_id": 0}).sort("createdAt", 1).to_list(200)

@api.post("/roles")
async def create_role(body: RoleIn, current=Depends(require_permission("roles.create"))):
    if "branches.accessAll" not in current.get("permissions", []):
        raise HTTPException(403, "لا تملك صلاحية إدارة الأدوار العامة")
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    if await db.roles.find_one({"name": body.name}): raise HTTPException(400, "الاسم مستخدم")
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "description": body.description or "",
           "permissions": body.permissions, "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.roles.insert_one(doc); doc.pop("_id", None); return doc

@api.put("/roles/{rid}")
async def update_role(rid: str, body: RoleIn, current=Depends(require_permission("roles.update"))):
    if "branches.accessAll" not in current.get("permissions", []):
        raise HTTPException(403, "لا تملك صلاحية إدارة الأدوار العامة")
    if not await db.roles.find_one({"id": rid}): raise HTTPException(404, "غير موجود")
    dup = await db.roles.find_one({"name": body.name, "id": {"$ne": rid}})
    if dup: raise HTTPException(400, "الاسم مستخدم")
    await db.roles.update_one({"id": rid}, {"$set": {"name": body.name, "description": body.description or "",
        "permissions": body.permissions, "updatedAt": now_iso()}})
    return await db.roles.find_one({"id": rid}, {"_id": 0})

@api.delete("/roles/{rid}")
async def delete_role(rid: str, current=Depends(require_permission("roles.delete"))):
    if "branches.accessAll" not in current.get("permissions", []):
        raise HTTPException(403, "لا تملك صلاحية إدارة الأدوار العامة")
    await raw_db.users.update_many({}, {"$pull": {"roles": rid}})
    r = await db.roles.delete_one({"id": rid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
#endregion

#region Users
async def _validated_user_branch_ids(branch_ids, current):
    requested = list(dict.fromkeys(branch_ids or []))
    if not requested:
        raise HTTPException(400, "يجب اختيار فرع واحد على الأقل")
    accessible = current.get("branches", [])
    if "branches.accessAll" not in (current.get("permissions") or []):
        accessible_ids = {current.get("branchId")}
    else:
        accessible_ids = {branch["id"] for branch in accessible}
    if not set(requested).issubset(accessible_ids):
        raise HTTPException(403, "لا تملك صلاحية إسناد المستخدم إلى هذا الفرع")
    return requested


async def _validated_user_roles(role_ids, current):
    requested = list(dict.fromkeys(role_ids or []))
    roles = await db.roles.find(
        {"id": {"$in": requested}}, {"_id": 0, "id": 1, "permissions": 1}
    ).to_list(100)
    if len(roles) != len(requested):
        raise HTTPException(400, "أحد الأدوار المحددة غير موجود")
    if "branches.accessAll" not in (current.get("permissions") or []):
        granted_permissions = {
            permission
            for role in roles
            for permission in role.get("permissions") or []
        }
        caller_permissions = set(current.get("permissions") or [])
        if "branches.accessAll" in granted_permissions:
            raise HTTPException(403, "لا تملك صلاحية منح الوصول إلى جميع الفروع")
        gender_permissions = {
            "students.gender.male.view",
            "students.gender.female.view",
        }
        if not (granted_permissions & gender_permissions).issubset(
            caller_permissions & gender_permissions
        ):
            raise HTTPException(
                403, "لا تملك صلاحية منح صلاحيات عرض جنس آخر من الطلاب"
            )
        grade_scope_permissions = {
            "students.scope.lowerGrades.view",
            "students.scope.upperGrades.male.view",
            "students.scope.upperGrades.female.view",
        }
        if not (granted_permissions & grade_scope_permissions).issubset(
            caller_permissions & grade_scope_permissions
        ):
            raise HTTPException(
                403, "لا تملك صلاحية منح نطاق صفوف غير مسموح به"
            )
    return requested


@api.get("/users")
async def list_users(current=Depends(require_permission("users.view"))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("createdAt", -1).to_list(500)
    for user in users:
        user.setdefault("branchIds", [current["branchId"]])
    return users


@api.get("/users/{uid}")
async def get_user(uid: str, current=Depends(require_permission("users.view"))):
    user = await db.users.find_one(
        {"id": uid}, {"_id": 0, "password": 0}
    )
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    user.setdefault("branchIds", [current["branchId"]])
    role_ids = user.get("roles") or []
    roles = await db.roles.find(
        {"id": {"$in": role_ids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    user["roleDetails"] = roles
    if user.get("teacherId"):
        teacher = await raw_db.teachers.find_one(
            {"id": user["teacherId"]}, {"_id": 0, "fullName": 1}
        )
        user["teacherName"] = teacher.get("fullName") if teacher else None
    user["branchDetails"] = [
        branch
        for branch in current.get("branches", [])
        if branch["id"] in user["branchIds"]
    ]
    return user


@api.post("/users")
async def create_user(body: UserCreate, current=Depends(require_permission("users.create"))):
    if not body.name.strip() or not body.username.strip() or len(body.password) < 4:
        raise HTTPException(400, "بيانات غير صالحة")
    if await raw_db.users.find_one({"username": body.username}): raise HTTPException(400, "اسم المستخدم مستخدم")
    if body.teacherId:
        if not await db.teachers.find_one({"id": body.teacherId}): raise HTTPException(400, "المعلم غير موجود")
        if await raw_db.users.find_one({"teacherId": body.teacherId}): raise HTTPException(400, "المعلم مرتبط بحساب آخر")
    branch_ids = await _validated_user_branch_ids(
        body.branchIds if body.branchIds is not None else [current["branchId"]],
        current,
    )
    role_ids = await _validated_user_roles(body.roles, current)
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "username": body.username.strip(),
           "password": hash_pw(body.password), "roles": role_ids,
           "teacherId": body.teacherId, "branchIds": branch_ids,
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.users.insert_one(doc); doc.pop("password", None); doc.pop("_id", None); return doc

@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, current=Depends(require_permission("users.update"))):
    if not await db.users.find_one({"id": uid}): raise HTTPException(404, "غير موجود")
    upd = {"updatedAt": now_iso()}
    if body.name is not None: upd["name"] = body.name.strip()
    if body.password: upd["password"] = hash_pw(body.password)
    if body.roles is not None:
        upd["roles"] = await _validated_user_roles(body.roles, current)
    if "branchIds" in body.model_fields_set:
        upd["branchIds"] = await _validated_user_branch_ids(body.branchIds, current)
    if "teacherId" in body.model_fields_set and body.teacherId is None:
        upd["teacherId"] = None
    elif body.teacherId is not None:
        if not await db.teachers.find_one({"id": body.teacherId}): raise HTTPException(400, "المعلم غير موجود")
        if await raw_db.users.find_one({"teacherId": body.teacherId, "id": {"$ne": uid}}):
            raise HTTPException(400, "المعلم مرتبط بحساب آخر")
        upd["teacherId"] = body.teacherId
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
async def _teacher_out(t):
    t.pop("_id", None)
    certificate = t.get("certificateFile")
    if isinstance(certificate, dict):
        t["certificateFile"] = {
            key: value for key, value in certificate.items() if key != "filePath"
        }
    return t

@api.get("/teachers")
async def list_teachers(search: Optional[str] = None, gender: Optional[str] = None,
                        employmentStatus: Optional[str] = None, specialization: Optional[str] = None,
                        page: int = 1, limit: int = 10,
                        current=Depends(require_permission("teachers.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    q = {} if employmentStatus == "all" else {"employmentStatus": employmentStatus or {"$ne": "inactive"}}
    if gender: q["gender"] = gender
    if specialization:
        q.setdefault("$and", []).append({"$or": [
            {"specialization": {"$regex": specialization, "$options": "i"}},
            {"department": {"$regex": specialization, "$options": "i"}},
            {"jobDescription": {"$regex": specialization, "$options": "i"}},
        ]})
    if search:
        rx = {"$regex": search, "$options": "i"}
        q.setdefault("$and", []).append({"$or": [
            {"fullName": rx}, {"phone": rx}, {"contactPhone": rx}, {"address": rx},
            {"code": rx}, {"specialization": rx}, {"department": rx}, {"jobDescription": rx},
        ]})
    total = await db.teachers.count_documents(q)
    skip = max(0, (page - 1) * limit)
    docs = await db.teachers.find(q, {"_id": 0}).sort("createdAt", -1).skip(skip).limit(limit).to_list(limit)
    docs = [await _teacher_out(doc) for doc in docs]
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
    if not rows or "fullName" not in rows[0]:
        raise HTTPException(400, "قالب المعلمين غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        if not (row.get("fullName") or "").strip():
            raise HTTPException(400, f"اسم المعلم مطلوب في الصف {index}")
        def value(key):
            return (row.get(key) or "").strip()

        phone = value("contactPhone") or value("phone")
        education = value("education") or value("qualification")
        job_description = value("jobDescription") or value("specialization")
        code = await generate_code("teachers")
        doc = {"id": str(uuid.uuid4()), "code": code,
               "fullName": value("fullName"), "gender": value("gender"),
               "phone": phone, "contactPhone": phone, "address": value("address"),
               "specialization": job_description, "jobDescription": job_description,
               "qualification": education, "education": education,
               "employmentStatus": value("employmentStatus") or "active",
               "fatherName": value("fatherName"), "motherName": value("motherName"),
               "birthPlace": value("birthPlace"), "birthDate": value("birthDate"),
               "idNumber": value("idNumber"), "martialStatus": value("martialStatus"),
               "maleChildrenCount": value("maleChildrenCount"),
               "femaleChildrenCount": value("femaleChildrenCount"),
               "workStartDate": value("workStartDate"), "department": value("department"),
               "office": value("office"), "volunteer": value("volunteer").lower(),
               "skills": value("skills"), "certificate": value("certificate"),
               "notes": value("notes"), "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.teachers.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}

@api.get("/teachers/{tid}")
async def get_teacher(tid: str, current=Depends(require_permission("teachers.view"))):
    t = await db.teachers.find_one({"id": tid}, {"_id": 0})
    if not t: raise HTTPException(404, "غير موجود")
    return await _teacher_out(t)

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
    return await _teacher_out(await db.teachers.find_one({"id": tid}, {"_id": 0}))

async def require_teacher_certificate_permission(current=Depends(get_current_user)):
    if not current.get("branchId"):
        raise HTTPException(428, "يرجى اختيار الفرع أولاً")
    if not {"teachers.create", "teachers.update"}.intersection(
        current.get("permissions") or []
    ):
        raise HTTPException(403, "لا تملك صلاحية رفع شهادة المعلم")
    return current

@api.post("/teachers/{tid}/certificate")
async def upload_teacher_certificate(tid: str, file: UploadFile = File(...),
                                    current=Depends(require_teacher_certificate_permission)):
    teacher = await db.teachers.find_one({"id": tid})
    if not teacher:
        raise HTTPException(404, "المعلم غير موجود")
    fname, fpath, mime, size = await _save_upload(
        file, TEACHER_DOCUMENTS_DIR, teacher.get("code") or tid
    )
    old_path = (teacher.get("certificateFile") or {}).get("filePath")
    certificate = {
        "fileName": fname,
        "originalName": file.filename or fname,
        "filePath": str(fpath),
        "mimeType": mime,
        "size": size,
        "uploadedAt": now_iso(),
        "uploadedBy": current["id"],
    }
    await db.teachers.update_one(
        {"id": tid},
        {"$set": {"certificateFile": certificate, "updatedAt": now_iso()}},
    )
    if old_path:
        try:
            os.remove(old_path)
        except OSError:
            pass
    return await _teacher_out(certificate)

@api.get("/teachers/{tid}/certificate")
async def get_teacher_certificate(tid: str, current=Depends(require_permission("teachers.view"))):
    teacher = await db.teachers.find_one({"id": tid})
    if not teacher:
        raise HTTPException(404, "المعلم غير موجود")
    certificate = teacher.get("certificateFile") or {}
    path = certificate.get("filePath")
    if not path or not os.path.exists(path):
        raise HTTPException(404, "لا توجد شهادة مرفقة")
    return FileResponse(
        path,
        media_type=certificate.get("mimeType") or "application/octet-stream",
        filename=certificate.get("originalName") or certificate.get("fileName"),
    )

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
    reactivated_at = now_iso()
    r = await db.teachers.update_one(
        {"id": tid, "employmentStatus": "inactive"},
        {"$set": {
            "employmentStatus": "active",
            "reactivatedAt": reactivated_at,
            "updatedAt": reactivated_at,
        },
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        teacher = await db.teachers.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not teacher: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "المعلم نشط بالفعل")
    return {"ok": True, "reactivated": True}
#endregion

#region Subjects and assignments
@api.get("/subjects")
async def list_subjects(status: Optional[str] = None,
                        current=Depends(require_permission("subjects.view"))):
    q = {} if status == "all" else {"status": status or {"$ne": "inactive"}}
    if current.get("teacherId"):
        assignments = await db.teacher_subject_assignments.find(
            {"teacherId": current["teacherId"]}, {"_id": 0, "subjectId": 1}
        ).to_list(5000)
        q["id"] = {"$in": [item["subjectId"] for item in assignments]}
    return await db.subjects.find(q, {"_id": 0}).sort("name", 1).to_list(500)

@api.post("/subjects")
async def create_subject(body: SubjectIn, current=Depends(require_permission("subjects.create"))):
    if not body.name.strip(): raise HTTPException(400, "اسم المادة مطلوب")
    if body.code and await db.subjects.find_one({"code": body.code.strip()}):
        raise HTTPException(400, "رمز المادة مستخدم")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "name": body.name.strip(),
           "code": (body.code or "").strip(), "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.subjects.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/subjects/{subject_id}")
async def update_subject(subject_id: str, body: SubjectIn,
                         current=Depends(require_permission("subjects.update"))):
    if not body.name.strip(): raise HTTPException(400, "اسم المادة مطلوب")
    if not await db.subjects.find_one({"id": subject_id}): raise HTTPException(404, "غير موجود")
    if body.code and await db.subjects.find_one({"code": body.code.strip(), "id": {"$ne": subject_id}}):
        raise HTTPException(400, "رمز المادة مستخدم")
    await db.subjects.update_one({"id": subject_id}, {"$set": {
        **body.model_dump(), "name": body.name.strip(), "code": (body.code or "").strip(), "updatedAt": now_iso()
    }})
    return await db.subjects.find_one({"id": subject_id}, {"_id": 0})

@api.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str, current=Depends(require_permission("subjects.delete"))):
    result = await db.subjects.update_one({"id": subject_id}, {"$set": {"status": "inactive", "updatedAt": now_iso()}})
    if not result.matched_count: raise HTTPException(404, "غير موجود")
    return {"ok": True}

@api.get("/teacher-subject-assignments")
async def list_teacher_subject_assignments(teacherId: Optional[str] = None,
                                           current=Depends(require_permission("subjects.view"))):
    if current.get("teacherId"):
        teacherId = current["teacherId"]
    q = {"teacherId": teacherId} if teacherId else {}
    return await db.teacher_subject_assignments.find(q, {"_id": 0}).to_list(5000)

@api.post("/teacher-subject-assignments")
async def create_teacher_subject_assignment(body: TeacherSubjectIn,
                                            current=Depends(require_permission("subjects.update"))):
    if not await db.teachers.find_one({"id": body.teacherId}): raise HTTPException(400, "المعلم غير موجود")
    if not await db.subjects.find_one({"id": body.subjectId, "status": {"$ne": "inactive"}}): raise HTTPException(400, "المادة غير موجودة")
    if await db.teacher_subject_assignments.find_one({"teacherId": body.teacherId, "subjectId": body.subjectId}):
        raise HTTPException(400, "الإسناد موجود مسبقاً")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "createdAt": now_iso()}
    await db.teacher_subject_assignments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/teacher-subject-assignments/{assignment_id}")
async def delete_teacher_subject_assignment(assignment_id: str,
                                            current=Depends(require_permission("subjects.update"))):
    result = await db.teacher_subject_assignments.delete_one({"id": assignment_id})
    if not result.deleted_count: raise HTTPException(404, "غير موجود")
    return {"ok": True}

@api.get("/class-subject-assignments")
async def list_class_subject_assignments(classId: Optional[str] = None,
                                         current=Depends(require_permission("subjects.view"))):
    q = {"classId": classId} if classId else {}
    assignments = await db.class_subject_assignments.find(q, {"_id": 0}).to_list(5000)
    allowed = await grade_scope(current)
    if allowed is not None:
        assignments = [item for item in assignments if (item["classId"], item["subjectId"]) in allowed]
    return assignments

@api.post("/class-subject-assignments")
async def create_class_subject_assignment(body: ClassSubjectIn,
                                          current=Depends(require_permission("subjects.update"))):
    if not await db.classes.find_one({"id": body.classId}): raise HTTPException(400, "الصف غير موجود")
    if not await db.subjects.find_one({"id": body.subjectId, "status": {"$ne": "inactive"}}): raise HTTPException(400, "المادة غير موجودة")
    if await db.class_subject_assignments.find_one({"classId": body.classId, "subjectId": body.subjectId}):
        raise HTTPException(400, "المادة مسندة إلى الصف مسبقاً")
    teacher_ids = list(dict.fromkeys(body.teacherIds))
    for teacher_id in teacher_ids:
        if not await db.teachers.find_one({"id": teacher_id}): raise HTTPException(400, "المعلم غير موجود")
        if not await db.teacher_subject_assignments.find_one({"teacherId": teacher_id, "subjectId": body.subjectId}):
            raise HTTPException(400, "المعلم غير مخول لهذه المادة")
    doc = {"id": str(uuid.uuid4()), "classId": body.classId, "subjectId": body.subjectId,
           "teacherIds": teacher_ids, "createdAt": now_iso()}
    await db.class_subject_assignments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/class-subject-assignments/{assignment_id}")
async def update_class_subject_assignment(assignment_id: str, body: ClassSubjectIn,
                                          current=Depends(require_permission("subjects.update"))):
    existing = await db.class_subject_assignments.find_one({"id": assignment_id})
    if not existing: raise HTTPException(404, "غير موجود")
    if existing["classId"] != body.classId or existing["subjectId"] != body.subjectId:
        raise HTTPException(400, "لا يمكن تغيير الصف أو المادة")
    for teacher_id in body.teacherIds:
        if not await db.teacher_subject_assignments.find_one({"teacherId": teacher_id, "subjectId": body.subjectId}):
            raise HTTPException(400, "المعلم غير مخول لهذه المادة")
    await db.class_subject_assignments.update_one({"id": assignment_id}, {"$set": {"teacherIds": list(dict.fromkeys(body.teacherIds))}})
    return await db.class_subject_assignments.find_one({"id": assignment_id}, {"_id": 0})

@api.delete("/class-subject-assignments/{assignment_id}")
async def delete_class_subject_assignment(assignment_id: str,
                                          current=Depends(require_permission("subjects.update"))):
    result = await db.class_subject_assignments.delete_one({"id": assignment_id})
    if not result.deleted_count: raise HTTPException(404, "غير موجود")
    return {"ok": True}
#endregion

#region Classes
async def _class_enrich(c: dict) -> dict:
    teacher_ids = c.get("teacherIds") or ([c["teacherId"]] if c.get("teacherId") else [])
    teachers = await db.teachers.find({"id": {"$in": teacher_ids}}, {"_id": 0, "id": 1, "fullName": 1, "code": 1}).to_list(100)
    teachers_by_id = {teacher["id"]: teacher for teacher in teachers}
    teacher_ids = [teacher_id for teacher_id in teacher_ids if teacher_id in teachers_by_id]
    teachers = [teachers_by_id[teacher_id] for teacher_id in teacher_ids]
    c["teacherIds"] = teacher_ids
    c["teacherNames"] = [t.get("fullName") for t in teachers]
    c["teacherName"] = ", ".join(c["teacherNames"]) or None
    c["teacherCode"] = ", ".join(t.get("code") for t in teachers if t.get("code")) or None
    c["studentCount"] = await db.students.count_documents({"currentClassId": c["id"]})
    return c

async def _enrich_classes(classes: list[dict]) -> list[dict]:
    if not classes:
        return classes
    teacher_ids = {
        teacher_id
        for class_doc in classes
        for teacher_id in (
            class_doc.get("teacherIds")
            or ([class_doc["teacherId"]] if class_doc.get("teacherId") else [])
        )
    }
    teachers = await db.teachers.find(
        {"id": {"$in": list(teacher_ids)}},
        {"_id": 0, "id": 1, "fullName": 1, "code": 1},
    ).to_list(len(teacher_ids))
    teachers_by_id = {teacher["id"]: teacher for teacher in teachers}
    class_ids = [class_doc["id"] for class_doc in classes]
    student_counts = await db.students.aggregate(
        [
            {"$match": {"currentClassId": {"$in": class_ids}}},
            {"$group": {"_id": "$currentClassId", "count": {"$sum": 1}}},
        ]
    ).to_list(len(class_ids))
    counts_by_class = {row["_id"]: row["count"] for row in student_counts}

    for class_doc in classes:
        class_teacher_ids = class_doc.get("teacherIds") or (
            [class_doc["teacherId"]] if class_doc.get("teacherId") else []
        )
        resolved_ids = [
            teacher_id for teacher_id in class_teacher_ids if teacher_id in teachers_by_id
        ]
        class_teachers = [teachers_by_id[teacher_id] for teacher_id in resolved_ids]
        class_doc["teacherIds"] = resolved_ids
        class_doc["teacherNames"] = [
            teacher.get("fullName") for teacher in class_teachers
        ]
        class_doc["teacherName"] = ", ".join(class_doc["teacherNames"]) or None
        class_doc["teacherCode"] = (
            ", ".join(
                teacher["code"] for teacher in class_teachers if teacher.get("code")
            )
            or None
        )
        class_doc["studentCount"] = counts_by_class.get(class_doc["id"], 0)
    return classes

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
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        q["id"] = {"$in": allowed}
    elif teacherId:
        q["$or"] = [{"teacherIds": teacherId}, {"teacherId": teacherId}]
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"name": rx}, {"code": rx}, {"grade": rx}, {"section": rx}, {"academicYear": rx}]
    total = await db.classes.count_documents(q)
    docs = await db.classes.find(q, {"_id": 0}).sort("createdAt", -1).skip((page-1)*limit).limit(limit).to_list(limit)
    await _enrich_classes(docs)
    return {"data": docs, "pagination": {"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) // limit}}

@api.post("/classes/import")
async def import_classes(file: UploadFile = File(...), current=Depends(require_permission("classes.create"))):
    rows = await _read_csv_rows(file)
    required = {"name", "grade", "section", "academicYear", "capacity", "status", "notes"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب الصفوف غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        if not (row.get("name") or "").strip():
            raise HTTPException(400, f"اسم الصف مطلوب في الصف {index}")
        teacher_ids = [item.strip() for item in (row.get("teacherIds") or row.get("teacherId") or "").split(",") if item.strip()]
        for teacher_id in teacher_ids:
            if not await db.teachers.find_one({"id": teacher_id}):
                raise HTTPException(400, f"المعلم غير موجود في الصف {index}")
        try: capacity = int(row.get("capacity") or 0)
        except ValueError: raise HTTPException(400, f"السعة غير صحيحة في الصف {index}")
        code = await generate_code("classes")
        doc = {"id": str(uuid.uuid4()), "code": code, "name": row["name"].strip(),
               "grade": row.get("grade", "").strip(), "section": row.get("section", "").strip(),
               "academicYear": row.get("academicYear", "").strip(), "teacherIds": teacher_ids,
               "teacherId": teacher_ids[0] if teacher_ids else None,
               "capacity": capacity, "status": row.get("status", "active").strip() or "active",
               "notes": row.get("notes", "").strip(), "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.classes.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}

@api.get("/classes/{cid}")
async def get_class(cid: str, current=Depends(require_permission("classes.view"))):
    c = await ensure_class_access(cid, current)
    c.pop("_id", None)
    return await _class_enrich(c)

@api.post("/classes")
async def create_class(body: ClassIn, current=Depends(require_permission("classes.create"))):
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    code = await generate_code("classes")
    data = body.model_dump()
    teacher_ids = list(dict.fromkeys(data.get("teacherIds") or ([] if not data.get("teacherId") else [data["teacherId"]])))
    for teacher_id in teacher_ids:
        if not await db.teachers.find_one({"id": teacher_id}):
            raise HTTPException(400, "أحد المعلمين غير موجود")
    data["teacherIds"] = teacher_ids
    data["teacherId"] = teacher_ids[0] if teacher_ids else None
    doc = {"id": str(uuid.uuid4()), "code": code, **data,
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.classes.insert_one(doc)
    return await _class_enrich({k: v for k, v in doc.items() if k != "_id"})

@api.put("/classes/{cid}")
async def update_class(cid: str, body: ClassIn, current=Depends(require_permission("classes.update"))):
    await ensure_class_access(cid, current)
    upd = body.model_dump()
    upd["teacherIds"] = list(dict.fromkeys(upd.get("teacherIds") or ([] if not upd.get("teacherId") else [upd["teacherId"]])))
    for teacher_id in upd["teacherIds"]:
        if not await db.teachers.find_one({"id": teacher_id}):
            raise HTTPException(400, "أحد المعلمين غير موجود")
    upd["teacherId"] = upd["teacherIds"][0] if upd["teacherIds"] else None
    upd["updatedAt"] = now_iso()
    await db.classes.update_one({"id": cid}, {"$set": upd})
    return await _class_enrich(await db.classes.find_one({"id": cid}, {"_id": 0}))

@api.post("/classes/{source_id}/promote-students")
async def promote_class_students(
    source_id: str,
    body: ClassPromotionIn,
    current=Depends(require_permission("students.update")),
):
    source_class = await ensure_class_access(source_id, current)
    destination_class = await ensure_class_access(body.destinationClassId, current)
    if source_id == body.destinationClassId:
        raise HTTPException(400, "يجب اختيار صف مختلف للترفيع")
    if destination_class.get("status") != "active":
        raise HTTPException(400, "الصف الجديد غير نشط")
    if not body.students:
        raise HTTPException(400, "اختر طالباً واحداً على الأقل")
    student_ids = [selection.studentId for selection in body.students]
    if len(student_ids) != len(set(student_ids)):
        raise HTTPException(400, "لا يمكن تكرار الطالب في طلب الترفيع")

    students_to_move = []
    for selection in body.students:
        if not math.isfinite(selection.totalPayable) or selection.totalPayable < 0:
            raise HTTPException(400, "المستحق الجديد يجب أن يكون رقماً غير سالب")
        student = await ensure_student_access(selection.studentId, current)
        if student.get("currentClassId") != source_id:
            raise HTTPException(400, "أحد الطلاب لم يعد في الصف المحدد")
        if (student.get("student") or {}).get("status") == "inactive":
            raise HTTPException(400, "لا يمكن ترفيع طالب غير نشط")
        students_to_move.append((student, selection))

    timestamp = now_iso()
    source_name = source_class.get("name") or ""
    destination_name = destination_class.get("name") or ""
    moved = []
    for student, selection in students_to_move:
        fees = student.get("fees") or {}
        fees["totalPayable"] = float(selection.totalPayable)
        if destination_class.get("academicYear"):
            fees["academicYear"] = destination_class["academicYear"]
        await db.students.update_one(
            {"id": student["id"], "currentClassId": source_id},
            {"$set": {
                "currentClassId": body.destinationClassId,
                "student.previousClass": source_name,
                "student.newClass": destination_name,
                "fees": fees,
                "updatedAt": timestamp,
            }},
        )
        moved.append({"studentId": student["id"], "totalPayable": float(selection.totalPayable)})
    return {"ok": True, "moved": len(moved), "students": moved}

@api.delete("/classes/{cid}")
async def delete_class(cid: str, body: DeactivationIn, current=Depends(require_permission("classes.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    await ensure_class_access(cid, current)
    r = await db.classes.update_one(
        {"id": cid},
        {"$set": {"status": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}

@api.post("/classes/{cid}/reactivate")
async def reactivate_class(cid: str, current=Depends(require_permission("classes.update"))):
    await ensure_class_access(cid, current)
    reactivated_at = now_iso()
    r = await db.classes.update_one(
        {"id": cid, "status": "inactive"},
        {"$set": {
            "status": "active",
            "reactivatedAt": reactivated_at,
            "updatedAt": reactivated_at,
        },
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        cls = await db.classes.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not cls: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "الصف نشط بالفعل")
    return {"ok": True, "reactivated": True}
#endregion

@api.get("/classes/{cid}/homework-options")
async def homework_options(cid: str, current=Depends(require_permission("homework.create"))):
    class_record = await ensure_class_access(cid, current)
    if class_record.get("status") == "inactive":
        raise HTTPException(400, "لا يمكن تسجيل واجب لصف غير نشط")

    assignments = await db.class_subject_assignments.find(
        {"classId": cid}, {"_id": 0, "subjectId": 1, "teacherIds": 1}
    ).to_list(5000)
    teacher_id = current.get("teacherId")
    if teacher_id:
        teacher_subjects = await db.teacher_subject_assignments.find(
            {"teacherId": teacher_id}, {"_id": 0, "subjectId": 1}
        ).to_list(5000)
        assigned_subject_ids = {item["subjectId"] for item in teacher_subjects}
        assignments = [
            item for item in assignments
            if teacher_id in (item.get("teacherIds") or [])
            and item["subjectId"] in assigned_subject_ids
        ]

    subject_ids = list(dict.fromkeys(item["subjectId"] for item in assignments))
    subjects = await db.subjects.find(
        {"id": {"$in": subject_ids}, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1},
    ).sort("name", 1).to_list(None)
    students = await db.students.find(
        {"currentClassId": cid, "student.status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1},
    ).sort("student.fullName", 1).to_list(None)
    return {"subjects": subjects, "students": students}

@api.post("/homework")
async def create_homework(body: HomeworkIn, current=Depends(require_permission("homework.create"))):
    class_record = await ensure_class_access(body.classId, current)
    if class_record.get("status") == "inactive":
        raise HTTPException(400, "لا يمكن تسجيل واجب لصف غير نشط")
    if len(body.studentIds) != len(set(body.studentIds)):
        raise HTTPException(400, "لا يمكن تكرار الطالب في الطلب")

    subject = await db.subjects.find_one(
        {"id": body.subjectId, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not subject:
        raise HTTPException(400, "المادة غير موجودة")
    assignment = await db.class_subject_assignments.find_one(
        {"classId": body.classId, "subjectId": body.subjectId}
    )
    if not assignment:
        raise HTTPException(400, "المادة غير مسندة إلى هذا الصف")
    teacher_id = current.get("teacherId")
    if teacher_id:
        if teacher_id not in (assignment.get("teacherIds") or []):
            raise HTTPException(403, "المادة غير مسندة إليك في هذا الصف")
        if not await db.teacher_subject_assignments.find_one(
            {"teacherId": teacher_id, "subjectId": body.subjectId}
        ):
            raise HTTPException(403, "غير مخول لتدريس هذه المادة")

    students = await db.students.find(
        {
            "id": {"$in": body.studentIds},
            "currentClassId": body.classId,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "student.fullName": 1, "classNotes": 1},
    ).to_list(None)
    if len(students) != len(body.studentIds):
        raise HTTPException(400, "يجب اختيار طلاب نشطين من هذا الصف فقط")

    timestamp = now_iso()
    homework_date = timestamp[:10]
    saved = []
    for student in students:
        homework_id = str(uuid.uuid4())
        content = f"لم يؤدِ الطالب الواجب في مادة {subject['name']} بتاريخ {homework_date}"
        note = {
            "id": str(uuid.uuid4()),
            "content": content,
            "authorId": current["id"],
            "authorName": current.get("name") or current.get("username") or "—",
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "homeworkId": homework_id,
        }
        record = {
            "id": homework_id,
            "classId": body.classId,
            "className": class_record.get("name") or "—",
            "studentId": student["id"],
            "studentName": (student.get("student") or {}).get("fullName") or "—",
            "studentCode": student.get("code"),
            "subjectId": body.subjectId,
            "subjectName": subject["name"],
            "teacherId": current.get("teacherId"),
            "teacherName": current.get("name") or current.get("username") or "—",
            "homeworkDate": homework_date,
            "status": "undone",
            "createdAt": timestamp,
            "createdBy": current["id"],
        }
        await db.homework.insert_one(record)
        await db.students.update_one(
            {"id": student["id"], "currentClassId": body.classId},
            {"$push": {"classNotes": note}, "$set": {"updatedAt": timestamp}},
        )
        saved.append({key: value for key, value in record.items() if key != "_id"})
    return {"ok": True, "created": len(saved), "homework": saved}

@api.get("/homework")
async def list_homework(current=Depends(require_permission("homework.view"))):
    query = {"status": "undone"}
    allowed = await grade_scope(current)
    if allowed is not None:
        if not allowed:
            return []
        query["$or"] = [
            {"classId": class_id, "subjectId": subject_id}
            for class_id, subject_id in allowed
        ]
    records = await db.homework.find(query, {"_id": 0}).sort(
        [("homeworkDate", -1), ("studentName", 1)]
    ).to_list(None)
    return records

#region Students
async def _student_payment_totals(sid: str, ay: Optional[str] = None) -> dict:
    q = {"student": sid}
    if ay: q["academicYear"] = ay
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    totals_by_type = {fee_type: 0 for fee_type in ("academic", "transportation", "books", "outfit")}
    for payment in docs:
        fee_type = payment.get("feeType") or "academic"
        totals_by_type[fee_type] = totals_by_type.get(fee_type, 0) + float(payment.get("amount", 0))
    return {"totalPaid": sum(float(p.get("amount", 0)) for p in docs),
            "byFeeType": totals_by_type, "count": len(docs)}

def _payment_order_key(payment):
    return (payment.get("paymentDate") or "", payment.get("createdAt") or "", payment.get("id") or "")

async def _payment_snapshot(payment, payable):
    if payment.get("feeType") and "totalPaidAtPayment" in payment and "totalRemainingAtPayment" in payment:
        return float(payment["totalPaidAtPayment"]), float(payment["totalRemainingAtPayment"])
    docs = await db.payments.find(
        {"student": payment.get("student"), "academicYear": payment.get("academicYear")},
        {"_id": 0, "id": 1, "amount": 1, "feeType": 1, "paymentDate": 1, "createdAt": 1},
    ).to_list(1000)
    fee_type = payment.get("feeType") or "academic"
    cumulative = 0
    for doc in sorted(docs, key=_payment_order_key):
        if (doc.get("feeType") or "academic") != fee_type:
            continue
        cumulative += float(doc.get("amount", 0))
        if doc.get("id") == payment.get("id"):
            break
    return cumulative, max(0, payable - cumulative)

def _discounted_payable(fees):
    total_payable = float(fees.get("totalPayable") or 0)
    discount_enabled = bool(fees.get("discountEnabled"))
    has_split_discounts = (
        "generalDiscountPercentage" in fees
        or "siblingsStaffDiscountPercentage" in fees
    )
    if has_split_discounts:
        general_percentage = float(fees.get("generalDiscountPercentage") or 0)
        siblings_staff_percentage = float(
            fees.get("siblingsStaffDiscountPercentage") or 0
        )
    else:
        general_percentage = float(fees.get("discountPercentage") or 0)
        siblings_staff_percentage = 0

    subtotal = total_payable * (1 - general_percentage / 100)
    net_payable = subtotal * (1 - siblings_staff_percentage / 100)
    discount_amount = total_payable - net_payable if discount_enabled else 0
    discount_percentage = (
        discount_amount / total_payable * 100 if total_payable > 0 else 0
    )
    return total_payable, discount_percentage, discount_amount, max(0, net_payable)

FEE_TYPE_FIELDS = {
    "academic": "totalPayable",
    "transportation": "busFee",
    "books": "booksFee",
    "outfit": "outfitFee",
}

def _fee_payables(fees):
    bus_fee = float(fees.get("busFee") or 0)
    bus_registered = fees.get("busRegistered", bus_fee > 0)
    return {
        "academic": _discounted_payable(fees)[3],
        "transportation": bus_fee if bus_registered else 0,
        "books": float(fees.get("booksFee") or 0),
        "outfit": float(fees.get("outfitFee") or 0),
    }

def _clean_fee_type(fee_type):
    if fee_type not in FEE_TYPE_FIELDS:
        raise HTTPException(400, "نوع الرسوم غير صالح")
    return fee_type

def _normalize_student_fees(fees):
    legacy_discount_enabled = bool(fees.get("discountEnabled"))
    general_discount_percentage = float(
        fees.get(
            "generalDiscountPercentage",
            fees.get("discountPercentage") if legacy_discount_enabled else 0,
        )
        or 0
    )
    siblings_staff_discount_percentage = float(
        fees.get("siblingsStaffDiscountPercentage") or 0
    )
    if not 0 <= general_discount_percentage <= 100:
        raise HTTPException(400, "نسبة الخصم العام يجب أن تكون بين 0 و100")
    if not 0 <= siblings_staff_discount_percentage <= 100:
        raise HTTPException(400, "نسبة خصم الإخوة/الكادر يجب أن تكون بين 0 و100")
    general_discount_name = (
        fees.get("generalDiscountName")
        or (fees.get("discountName") if legacy_discount_enabled else "")
        or ""
    ).strip()
    siblings_staff_discount_name = (
        fees.get("siblingsStaffDiscountName") or ""
    ).strip()
    discount_enabled = (
        general_discount_percentage > 0 or siblings_staff_discount_percentage > 0
    )
    effective_discount_percentage = 100 * (
        1
        - (1 - general_discount_percentage / 100)
        * (1 - siblings_staff_discount_percentage / 100)
    )
    discount_name = " / ".join(
        name
        for name in (general_discount_name, siblings_staff_discount_name)
        if name
    )
    normalized = {
        "academicYear": fees.get("academicYear") or "",
        "totalPayable": float(fees.get("totalPayable") or 0),
        "discountEnabled": discount_enabled,
        "discountPercentage": effective_discount_percentage,
        "discountName": discount_name,
        "generalDiscountName": general_discount_name,
        "generalDiscountPercentage": general_discount_percentage,
        "siblingsStaffDiscountName": siblings_staff_discount_name,
        "siblingsStaffDiscountPercentage": siblings_staff_discount_percentage,
    }
    if normalized["totalPayable"] < 0:
        raise HTTPException(400, "الرسوم لا يمكن أن تكون سالبة")
    for field in ("booksFee", "busFee", "outfitFee"):
        value = float(fees.get(field) or 0)
        if value < 0:
            raise HTTPException(400, "الرسوم لا يمكن أن تكون سالبة")
        normalized[field] = value
    normalized["busRegistered"] = bool(fees.get("busRegistered", normalized["busFee"] > 0))
    if not normalized["busRegistered"]:
        normalized["busFee"] = 0
    return normalized

def _overall_student_payable(fees):
    return sum(_fee_payables(fees).values())

async def _student_totals_for_docs(docs: list[dict]) -> dict:
    student_ids = [doc["id"] for doc in docs]
    if not student_ids:
        return {}
    grouped = await db.payments.aggregate(
        [
            {"$match": {"student": {"$in": student_ids}}},
            {
                "$group": {
                    "_id": {
                        "student": "$student",
                        "academicYear": {"$ifNull": ["$academicYear", ""]},
                        "feeType": {
                            "$cond": [
                                {"$in": [{"$ifNull": ["$feeType", ""]}, ["", None]]},
                                "academic",
                                "$feeType",
                            ]
                        },
                    },
                    "paid": {"$sum": "$amount"},
                }
            },
        ]
    ).to_list(None)
    totals_by_student_year = {}
    for row in grouped:
        key = (row["_id"]["student"], row["_id"]["academicYear"])
        by_type = totals_by_student_year.setdefault(
            key,
            {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
        )
        fee_type = row["_id"]["feeType"]
        by_type[fee_type] = by_type.get(fee_type, 0) + float(row["paid"] or 0)

    years_by_student = {
        doc["id"]: (doc.get("fees") or {}).get("academicYear") or "" for doc in docs
    }
    totals = {
        student_id: {
            "totalPaid": 0,
            "byFeeType": {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
            "count": 0,
        }
        for student_id in student_ids
    }
    for (student_id, academic_year), row_totals in totals_by_student_year.items():
        current_year = years_by_student[student_id]
        if current_year and academic_year != current_year:
            continue
        for fee_type, amount in row_totals.items():
            by_type = totals[student_id]["byFeeType"]
            by_type[fee_type] = by_type.get(fee_type, 0) + amount
            totals[student_id]["totalPaid"] += amount
    return totals

async def _augment_students(
    docs: list[dict],
    current=None,
    totals_by_student: Optional[dict] = None,
) -> list[dict]:
    if not docs:
        return docs
    if totals_by_student is None:
        totals_by_student = await _student_totals_for_docs(docs)
    class_ids = list(
        {doc["currentClassId"] for doc in docs if doc.get("currentClassId")}
    )
    classes = await db.classes.find(
        {"id": {"$in": class_ids}},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "grade": 1,
            "section": 1,
            "academicYear": 1,
            "teacherId": 1,
        },
    ).to_list(len(class_ids))
    classes_by_id = {class_doc["id"]: class_doc for class_doc in classes}
    teacher_ids = list(
        {
            class_doc["teacherId"]
            for class_doc in classes
            if class_doc.get("teacherId")
        }
    )
    teachers = await db.teachers.find(
        {"id": {"$in": teacher_ids}},
        {"_id": 0, "id": 1, "fullName": 1},
    ).to_list(len(teacher_ids))
    teachers_by_id = {teacher["id"]: teacher for teacher in teachers}

    for doc in docs:
        await _augment_student(
            doc,
            current,
            totals=totals_by_student[doc["id"]],
            class_doc=classes_by_id.get(doc.get("currentClassId")),
            teacher=teachers_by_id.get(
                classes_by_id.get(doc.get("currentClassId"), {}).get("teacherId")
            ),
            class_lookup_complete=True,
        )
    return docs

async def _augment_student(
    doc: dict,
    current=None,
    totals: Optional[dict] = None,
    class_doc: Optional[dict] = None,
    teacher: Optional[dict] = None,
    class_lookup_complete: bool = False,
) -> dict:
    student = doc.setdefault("student", {})
    student.setdefault("finalRegistrationPath", student.get("registrationPath") or "")
    fees = doc.get("fees") or {}
    ay = fees.get("academicYear")
    total_payable, discount_percentage, discount_amount, net_payable = _discounted_payable(fees)
    discount_enabled = bool(fees.get("discountEnabled"))
    has_split_discounts = (
        "generalDiscountPercentage" in fees
        or "siblingsStaffDiscountPercentage" in fees
    )
    general_discount_percentage = (
        float(fees.get("generalDiscountPercentage") or 0)
        if has_split_discounts
        else (float(fees.get("discountPercentage") or 0) if discount_enabled else 0)
    )
    general_discount_name = fees.get("generalDiscountName") or (
        fees.get("discountName") or "" if not has_split_discounts else ""
    )
    books_fee = float(fees.get("booksFee") or 0)
    bus_registered = bool(fees.get("busRegistered", float(fees.get("busFee") or 0) > 0))
    bus_fee = float(fees.get("busFee") or 0) if bus_registered else 0
    outfit_fee = float(fees.get("outfitFee") or 0)
    if totals is None:
        totals = await _student_payment_totals(doc["id"], ay)
    payable_by_type = _fee_payables(fees)
    breakdown = {
        fee_type: {
            "payable": payable,
            "paid": totals["byFeeType"].get(fee_type, 0),
            "remaining": max(0, payable - totals["byFeeType"].get(fee_type, 0)),
        }
        for fee_type, payable in payable_by_type.items()
    }
    doc["fees"] = {"academicYear": ay, "totalPayable": total_payable,
                   "discountEnabled": discount_enabled,
                   "discountPercentage": discount_percentage,
                   "discountName": (fees.get("discountName") or ""),
                   "generalDiscountName": general_discount_name,
                   "generalDiscountPercentage": general_discount_percentage,
                   "siblingsStaffDiscountName": fees.get("siblingsStaffDiscountName") or "",
                   "siblingsStaffDiscountPercentage": float(fees.get("siblingsStaffDiscountPercentage") or 0),
                   "discountAmount": discount_amount, "netPayable": net_payable,
                   "booksFee": books_fee, "busFee": bus_fee, "busRegistered": bus_registered,
                   "outfitFee": outfit_fee, "byType": breakdown,
                   "overallPayable": net_payable + books_fee + bus_fee + outfit_fee,
                   "totalPaid": totals["totalPaid"],
                   "remaining": max(0, net_payable + books_fee + bus_fee + outfit_fee - totals["totalPaid"])}
    for field in ("classNotes", "nonClassNotes"):
        notes = doc.get(field) or []
        if not current or "students.notes.view" not in (current.get("permissions") or []):
            doc[field] = []
        elif current.get("teacherId"):
            doc[field] = [note for note in notes if note.get("authorId") == current.get("id")]
    if (
        not class_lookup_complete
        and class_doc is None
        and doc.get("currentClassId")
    ):
        class_doc = await db.classes.find_one(
            {"id": doc["currentClassId"]},
            {
                "_id": 0,
                "name": 1,
                "grade": 1,
                "section": 1,
                "academicYear": 1,
                "teacherId": 1,
            },
        )
        if class_doc and class_doc.get("teacherId"):
            teacher = await db.teachers.find_one(
                {"id": class_doc["teacherId"]}, {"_id": 0, "fullName": 1}
            )
    if class_doc:
        doc["currentClass"] = {
            "name": class_doc.get("name"),
            "grade": class_doc.get("grade"),
            "section": class_doc.get("section"),
            "academicYear": class_doc.get("academicYear"),
        }
        if class_doc.get("teacherId"):
            doc["currentTeacher"] = teacher.get("fullName") if teacher else None
    return doc

def _payment_status_query(status: str):
    return status  # handled in-memory after fetch to keep server simple

def _split_filter_values(value: Optional[str]) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]

@api.get("/students")
async def list_students(search: Optional[str] = None, gender: Optional[str] = None,
                        orphan: Optional[str] = None, registrationPath: Optional[str] = None,
                        finalRegistrationPath: Optional[str] = None,
                        classId: Optional[str] = None, status: Optional[str] = None,
                        academicYear: Optional[str] = None, paymentStatus: Optional[str] = None,
                        teacherId: Optional[str] = None,
                        sortBy: Optional[str] = Query(
                            default=None,
                            regex="^(code|name|gender|birthdate|class|registrationPath|status|orphan)$",
                        ),
                        sortOrder: str = Query(default="asc", regex="^(asc|desc)$"),
                        page: int = 1, limit: int = 20,
                        current=Depends(require_permission("students.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    statuses = _split_filter_values(status)
    q = (
        {}
        if status == "all" or "all" in statuses
        else {"student.status": {"$in": statuses}}
        if statuses
        else {"student.status": {"$ne": "inactive"}}
    )
    if gender: q["student.gender"] = gender
    if orphan in ("true", "false"): q["student.orphan"] = (orphan == "true")
    registration_paths = _split_filter_values(registrationPath)
    if registration_paths:
        q["student.registrationPath"] = {"$in": registration_paths}
    if academicYear: q["fees.academicYear"] = academicYear
    class_ids = _split_filter_values(classId)
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        if class_ids:
            q["currentClassId"] = {"$in": [item for item in class_ids if item in allowed]}
        else:
            q["currentClassId"] = {"$in": allowed}
    elif class_ids:
        q["currentClassId"] = {"$in": class_ids}
    elif teacherId:
        cls = await db.classes.find({"$or": [{"teacherIds": teacherId}, {"teacherId": teacherId}]}, {"id": 1, "_id": 0}).to_list(500)
        q["currentClassId"] = {"$in": [c["id"] for c in cls]}
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"student.fullName": rx}, {"code": rx},
                    {"father.name": rx}, {"mother.name": rx},
                    {"father.phone": rx}, {"mother.phone": rx},
                    {"student.currentAddress": rx},
                    {"general.whatsappGroupPhone": rx}]
    # Payment status and fee totals are derived from payment records, so the
    # complete filtered set must be evaluated before pagination.
    matched_docs = await db.students.find(
        q,
        {
            "_id": 0,
            "id": 1,
            "code": 1,
            "createdAt": 1,
            "student.fullName": 1,
            "student.finalRegistrationPath": 1,
            "student.registrationPath": 1,
            "student.gender": 1,
            "student.birthdate": 1,
            "student.newClass": 1,
            "student.status": 1,
            "student.orphan": 1,
            "currentClassId": 1,
            "fees": 1,
        },
    ).sort("createdAt", -1).to_list(None)
    final_registration_paths = _split_filter_values(finalRegistrationPath)
    if final_registration_paths:
        matched_docs = [
            d for d in matched_docs
            if ((d.get("student") or {}).get("finalRegistrationPath")
                or (d.get("student") or {}).get("registrationPath")) in final_registration_paths
        ]
    totals_by_student = await _student_totals_for_docs(matched_docs)
    if paymentStatus:
        def matches(d):
            fees = d.get("fees") or {}
            payable = _overall_student_payable(fees)
            paid = totals_by_student[d["id"]]["totalPaid"]
            if paymentStatus == "paid": return payable > 0 and paid >= payable
            if paymentStatus == "partial": return 0 < paid < payable
            if paymentStatus == "unpaid": return paid == 0
            return True
        matched_docs = [d for d in matched_docs if matches(d)]
    if sortBy:
        class_names = {}
        if sortBy == "class":
            class_ids = list(
                {doc["currentClassId"] for doc in matched_docs if doc.get("currentClassId")}
            )
            classes = await db.classes.find(
                {"id": {"$in": class_ids}},
                {"_id": 0, "id": 1, "name": 1},
            ).to_list(len(class_ids))
            class_names = {class_doc["id"]: class_doc.get("name") or "" for class_doc in classes}

        def student_sort_value(d):
            student = d.get("student") or {}
            values = {
                "code": d.get("code") or "",
                "name": student.get("fullName") or "",
                "gender": student.get("gender") or "",
                "birthdate": student.get("birthdate") or "",
                "class": class_names.get(d.get("currentClassId"), "") or student.get("newClass") or "",
                "registrationPath": student.get("registrationPath") or "",
                "status": student.get("status") or "",
                "orphan": bool(student.get("orphan")),
            }
            value = values[sortBy]
            return value.casefold() if isinstance(value, str) else value
        matched_docs.sort(key=student_sort_value, reverse=sortOrder == "desc")
    total = len(matched_docs)
    start = (page - 1) * limit
    page_ids = [doc["id"] for doc in matched_docs[start:start + limit]]
    if page_ids:
        page_docs = await db.students.find(
            {"id": {"$in": page_ids}},
            {"_id": 0},
        ).to_list(len(page_ids))
        page_docs_by_id = {doc["id"]: doc for doc in page_docs}
        docs = [page_docs_by_id[student_id] for student_id in page_ids]
    else:
        docs = []
    await _augment_students(
        docs,
        current,
        {doc["id"]: totals_by_student[doc["id"]] for doc in docs},
    )
    summary = {
        "totalPayable": sum(_overall_student_payable(d.get("fees") or {}) for d in matched_docs),
        "totalPaid": sum(totals_by_student[d["id"]]["totalPaid"] for d in matched_docs),
        "totalBooksFee": sum(float((d.get("fees") or {}).get("booksFee") or 0) for d in matched_docs),
        "totalBusFee": sum(_fee_payables(d.get("fees") or {})["transportation"] for d in matched_docs),
        "totalOutfitFee": sum(float((d.get("fees") or {}).get("outfitFee") or 0) for d in matched_docs),
    }
    summary["totalRemaining"] = max(0, summary["totalPayable"] - summary["totalPaid"])
    return {"data": docs, "summary": summary,
            "pagination": {"page": page, "limit": limit, "total": total,
                            "totalPages": (total + limit - 1) // limit}}

@api.get("/students/options")
async def student_options(
    search: Optional[str] = None,
    exclude_ids: Optional[str] = Query(default=None, alias="excludeIds"),
    current=Depends(require_permission("students.view")),
):
    query = {"student.status": {"$ne": "inactive"}}
    if exclude_ids:
        query["id"] = {"$nin": [student_id for student_id in exclude_ids.split(",") if student_id]}
    if search and search.strip():
        value = re.escape(search.strip())
        query["$or"] = [
            {"student.fullName": {"$regex": value, "$options": "i"}},
            {"code": {"$regex": value, "$options": "i"}},
        ]
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        query["currentClassId"] = {"$in": allowed}

    students = await db.students.find(
        query,
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1, "fees": 1},
    ).sort("createdAt", -1).limit(10).to_list(10)
    options = []
    for student in students:
        fees = student.get("fees") or {}
        payable = _fee_payables(fees)
        totals = await _student_payment_totals(student["id"], fees.get("academicYear"))
        options.append({
            "id": student["id"],
            "code": student.get("code"),
            "student": student.get("student") or {},
            "fees": {
                "byType": {
                    fee_type: {
                        "payable": amount,
                        "paid": totals.get("byFeeType", {}).get(fee_type, 0),
                    }
                    for fee_type, amount in payable.items()
                }
            },
        })
    return {"data": options}

@api.post("/students/import")
async def import_students(file: UploadFile = File(...), current=Depends(require_permission("students.create"))):
    rows = await _read_csv_rows(file)
    required = {"fullName", "gender", "birthdate", "registrationPath"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب الطلاب غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        def text(field):
            return (row.get(field) or "").strip()

        def csv_bool(field, default=False):
            value = text(field).lower()
            if not value:
                return default
            if value in ("true", "1", "yes", "نعم"):
                return True
            if value in ("false", "0", "no", "لا"):
                return False
            raise HTTPException(400, f"قيمة {field} غير صحيحة في الصف {index}")

        full_name = text("fullName")
        if not full_name: raise HTTPException(400, f"اسم الطالب مطلوب في الصف {index}")
        gender = text("gender").lower()
        if gender not in ("male", "female"):
            raise HTTPException(400, f"الجنس غير صحيح في الصف {index}")
        orphan_of = text("orphanOf").lower()
        if orphan_of and orphan_of not in ("mother", "father", "both"):
            raise HTTPException(400, f"قيمة orphanOf غير صحيحة في الصف {index}")

        registration_path = text("registrationPath")
        if not registration_path:
            raise HTTPException(400, f"مسار التسجيل الأولي مطلوب في الصف {index}")
        final_registration_path = text("finalRegistrationPath") or registration_path
        configured_paths = await get_registration_paths()
        paths_to_add = [
            path for path in dict.fromkeys((registration_path, final_registration_path))
            if path and path not in configured_paths
        ]

        dropped = csv_bool("dropped")
        status = "inactive" if dropped else (text("status") or "resident")
        try:
            academic_fee = float(text("academicFee") or text("totalPayable") or 0)
            academic_paid = float(text("academicPaid") or 0)
            general_discount_percentage = float(
                text("generalDiscountPercentage")
                or text("discountPercentage")
                or 0
            )
            siblings_staff_discount_percentage = float(
                text("siblingsStaffDiscountPercentage") or 0
            )
            books_fee = float(text("booksFee") or 0)
            books_paid = float(text("booksPaid") or 0)
            bus_fee = float(text("busFee") or 0)
            bus_paid = float(text("busPaid") or 0)
            outfit_fee = float(text("outfitFee") or 0)
        except ValueError:
            raise HTTPException(400, f"الرسوم غير صحيحة في الصف {index}")
        amounts = (
            academic_fee, academic_paid, general_discount_percentage,
            siblings_staff_discount_percentage, books_fee, books_paid,
            bus_fee, bus_paid, outfit_fee,
        )
        if not all(math.isfinite(value) for value in amounts):
            raise HTTPException(400, f"الرسوم غير صحيحة في الصف {index}")
        if min(
            academic_fee,
            academic_paid,
            books_fee,
            books_paid,
            bus_fee,
            bus_paid,
            outfit_fee,
        ) < 0:
            raise HTTPException(400, f"الرسوم لا يمكن أن تكون سالبة في الصف {index}")
        if not 0 <= general_discount_percentage <= 100:
            raise HTTPException(
                400, f"نسبة الخصم العام يجب أن تكون بين 0 و100 في الصف {index}"
            )
        if not 0 <= siblings_staff_discount_percentage <= 100:
            raise HTTPException(
                400,
                f"نسبة خصم الإخوة/الكادر يجب أن تكون بين 0 و100 في الصف {index}",
            )
        academic_payable = (
            academic_fee
            * (1 - general_discount_percentage / 100)
            * (1 - siblings_staff_discount_percentage / 100)
        )
        orphan = csv_bool("orphan")
        father_deceased = csv_bool("fatherDeceased")
        mother_deceased = csv_bool("motherDeceased")
        chronic_disease = csv_bool("chronicDisease")
        permanent_habits = csv_bool("permanentHabits")
        bus_registered = csv_bool("busRegistered", bus_fee > 0)
        bus_payable = bus_fee if bus_registered else 0
        if (academic_paid > academic_payable + 0.0001 or
                books_paid > books_fee + 0.0001 or
                bus_paid > bus_payable + 0.0001):
            raise HTTPException(400, f"الدفعة تتجاوز الرسوم المستحقة في الصف {index}")

        class_id = (row.get("currentClassId") or "").strip() or None
        if class_id and not await db.classes.find_one({"id": class_id}):
            raise HTTPException(400, f"الصف غير موجود في الصف {index}")
        allowed = await allowed_class_ids(current)
        class_name = text("newClass")
        if not class_id and class_name:
            class_record = await db.classes.find_one(
                {"name": class_name, "academicYear": text("academicYear")},
                {"_id": 0},
            )
            if class_record:
                class_id = class_record["id"]
            elif allowed is None:
                code = await generate_code("classes")
                class_id = str(uuid.uuid4())
                class_record = {
                    "id": class_id, "code": code, "name": class_name,
                    "grade": "", "section": "", "academicYear": text("academicYear"),
                    "teacherIds": [], "teacherId": None, "capacity": 0,
                    "status": "active", "notes": "", "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                await db.classes.insert_one(class_record)
            else:
                raise HTTPException(403, f"لا يمكنك إضافة طالب إلى هذا الصف في الصف {index}")
        if allowed is not None and class_id not in allowed:
            raise HTTPException(403, f"لا يمكنك إضافة طالب إلى هذا الصف في الصف {index}")

        if paths_to_add:
            configured_paths.extend(paths_to_add)
            await db.settings.update_one(
                {"id": "registration_paths"},
                {"$set": {"paths": configured_paths, "updatedAt": now_iso()},
                 "$setOnInsert": {"createdAt": now_iso()}},
                upsert=True,
            )
        options = await get_discount_options()
        discounts = (
            (
                "general",
                general_discount_percentage,
                text("generalDiscountName"),
                "خصم عام",
            ),
            (
                "siblings_staff",
                siblings_staff_discount_percentage,
                text("siblingsStaffDiscountName"),
                "خصم الإخوة/الكادر",
            ),
        )
        discount_names = {}
        options_updated = False
        for category, percentage, requested_name, default_label in discounts:
            if percentage <= 0:
                discount_names[category] = ""
                continue
            option = next(
                (
                    item
                    for item in options
                    if (item.get("category") or "general") == category
                    and math.isclose(
                        float(item.get("percentage", 0)), percentage
                    )
                    and (not requested_name or item.get("name") == requested_name)
                ),
                None,
            )
            if option:
                discount_names[category] = option["name"]
                continue

            name = requested_name or f"{default_label} {percentage:g}%"
            existing_names = {item.get("name") for item in options}
            base_name = name
            suffix = 2
            while name in existing_names:
                name = f"{base_name} ({suffix})"
                suffix += 1
            options.append({
                "name": name,
                "percentage": percentage,
                "category": category,
            })
            discount_names[category] = name
            options_updated = True

        if options_updated:
            await db.settings.update_one(
                {"id": "discount_options"},
                {"$set": {"options": options, "updatedAt": now_iso()},
                 "$setOnInsert": {"createdAt": now_iso()}},
                upsert=True,
            )
        general_discount_name = discount_names["general"]
        siblings_staff_discount_name = discount_names["siblings_staff"]
        discount_enabled = (
            general_discount_percentage > 0
            or siblings_staff_discount_percentage > 0
        )
        combined_discount_percentage = 100 * (
            1
            - (1 - general_discount_percentage / 100)
            * (1 - siblings_staff_discount_percentage / 100)
        )
        discount_name = " / ".join(
            name
            for name in (general_discount_name, siblings_staff_discount_name)
            if name
        )

        class_record = await db.classes.find_one({"id": class_id}, {"_id": 0, "name": 1}) if class_id else None
        code = await generate_code("students")
        doc = {"id": str(uuid.uuid4()), "code": code,
               "student": {"fullName": full_name, "gender": gender,
                           "birthdate": text("birthdate"), "birthPlace": text("birthPlace"),
                           "registrationPath": registration_path,
                           "finalRegistrationPath": final_registration_path,
                           "previousClass": text("previousClass"),
                           "newClass": class_name or (class_record or {}).get("name", ""),
                           "busNumber": text("busNo"),
                           "status": status, "currentAddress": text("currentAddress"),
                           "orphan": orphan, "orphanOf": orphan_of,
                           "orphanDocType": text("orphanDocType"),
                           "addressCodes": {key: text(key) for key in ("sector", "block", "minutes", "floor", "apartment")},
                           "chronicDisease": chronic_disease, "chronicDiseaseDetails": text("chronicDiseaseDetails"),
                           "permanentHabits": permanent_habits, "permanentHabitsDetails": text("permanentHabitsDetails")},
               "father": {"name": text("fatherName"), "alive": not father_deceased, "phone": text("fatherPhone"),
                          "address": text("fatherAddress"), "profession": text("fatherProfession"), "whatsapp": text("fatherWhatsapp"), "telegram": text("fatherTelegram")},
               "mother": {"name": text("motherName"), "alive": not mother_deceased, "phone": text("motherPhone"),
                          "address": text("motherAddress"), "profession": text("motherProfession"), "whatsapp": text("motherWhatsapp"), "telegram": text("motherTelegram")},
               "general": {"whatsappGroupPhone": text("whatsappGroupPhone"), "emergencyContact": {"name": text("emergencyName"), "relation": text("emergencyRelation"), "phone": text("emergencyPhone")}},
               "fees": {"academicYear": text("academicYear"), "totalPayable": academic_fee,
                        "discountEnabled": discount_enabled,
                        "discountPercentage": combined_discount_percentage,
                        "discountName": discount_name,
                        "generalDiscountName": general_discount_name,
                        "generalDiscountPercentage": general_discount_percentage,
                        "siblingsStaffDiscountName": siblings_staff_discount_name,
                        "siblingsStaffDiscountPercentage": siblings_staff_discount_percentage,
                        "booksFee": books_fee, "busFee": bus_fee,
                        "busRegistered": bus_registered,
                        "outfitFee": outfit_fee},
               "currentClassId": class_id, "siblings": [], "previousEducation": [], "islamicLegalEducation": "", "bestAchievement": "",
               "otherInfo": {"familySmokers": False, "transportation": "", "notes": ""}, "signing": {"parentName": "", "relationToStudent": ""}, "fullInfo": {}, "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.students.insert_one(doc); created.append(doc["id"])
        for fee_type, amount in (
            ("academic", academic_paid),
            ("books", books_paid),
            ("transportation", bus_paid),
        ):
            if amount > 0:
                await db.payments.insert_one({
                    "id": str(uuid.uuid4()), "student": doc["id"],
                    "academicYear": doc["fees"]["academicYear"], "feeType": fee_type,
                    "semester": "full_year", "amount": amount,
                    "paymentDate": now_iso(), "notes": "دفعة عند استيراد الطالب",
                    "createdBy": current["id"], "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                })
    return {"ok": True, "created": len(created)}

@api.get("/students/{sid}")
async def get_student(sid: str, current=Depends(require_permission("students.view"))):
    d = await ensure_student_access(sid, current)
    d.pop("_id", None)
    return await _augment_student(d, current)

@api.get("/public/students/{sid}/validation")
async def validate_student(sid: str):
    d = await raw_db.students.find_one({"id": sid}, {"_id": 0})
    if not d: raise HTTPException(404, "الطالب غير موجود")
    student = d.get("student") or {}
    current_class = None
    if d.get("currentClassId"):
        current_class = await raw_db.classes.find_one(
            {"id": d["currentClassId"]},
            {"_id": 0, "name": 1, "section": 1, "academicYear": 1},
        )
    grades = await raw_db.grades.find(
        {"studentId": sid},
        {"_id": 0, "academicYear": 1, "period": 1, "score": 1, "subjectId": 1},
    ).sort([("academicYear", -1), ("period", 1)]).to_list(10000)
    for grade in grades:
        subject = await raw_db.subjects.find_one(
            {"id": grade.pop("subjectId", None)}, {"_id": 0, "name": 1}
        )
        grade["subjectName"] = subject.get("name") if subject else "—"
    return {
        "code": d.get("code"),
        "fullName": student.get("fullName"),
        "status": student.get("status") or "resident",
        "isActive": student.get("status") != "inactive",
        "className": current_class.get("name") if current_class else student.get("newClass"),
        "section": current_class.get("section") if current_class else None,
        "academicYear": (current_class or {}).get("academicYear") or (d.get("fees") or {}).get("academicYear"),
        "hasPersonalPhoto": bool(((d.get("documents") or {}).get("personal_photo") or {}).get("filePath")),
        "grades": grades,
    }


MESSAGE_TYPE_LABELS = {
    "complaint": "شكوى",
    "suggestion": "اقتراح",
    "inquiry": "استفسار",
    "other": "أخرى",
}


async def _send_message_email(recipient, subject, content):
    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("MAIL_FROM")
    if not api_key or not sender:
        raise RuntimeError("إعدادات البريد الإلكتروني غير مكتملة")

    payload = {
        "from": sender,
        "to": recipient,
        "subject": subject,
        "text": content,
    }

    def send_request():
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "abnaa-alsham-backend/1.0",
                },
                timeout=30,
            )
            response.raise_for_status()
        except requests.HTTPError as error:
            response = error.response
            detail = response.text[:1000] if response is not None else str(error)
            status_code = response.status_code if response is not None else "unknown"
            raise RuntimeError(
                f"Resend returned HTTP {status_code}: {detail}"
            ) from error
        except requests.RequestException as error:
            raise RuntimeError(f"Could not reach Resend: {error}") from error

    await asyncio.to_thread(send_request)


async def _send_contact_form_email(contact_message):
    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("MAIL_FROM_CONTACT")
    if not api_key or not sender:
        raise RuntimeError("إعدادات بريد نموذج التواصل غير مكتملة")

    configured_recipients = [
        address.strip()
        for address in os.environ.get("CONTACT_EMAILS", "").split(",")
        if address.strip()
    ]
    if not configured_recipients or len(configured_recipients) > 5:
        raise RuntimeError("يجب إعداد عنوان بريد واحد إلى خمسة عناوين لاستقبال الرسائل")
    try:
        recipients = [
            str(address)
            for address in TypeAdapter(List[EmailStr]).validate_python(
                configured_recipients
            )
        ]
    except ValidationError as error:
        raise RuntimeError("قائمة عناوين بريد نموذج التواصل غير صالحة") from error

    text = (
        f"رسالة جديدة من نموذج التواصل في مدرسة أبناء الشام\n\n"
        f"الاسم: {contact_message['name']}\n"
        f"البريد الإلكتروني: {contact_message.get('email') or 'غير مذكور'}\n"
        f"المكتب: {contact_message.get('office') or 'غير محدد'}\n"
        f"رقم الهاتف: {contact_message['phone']}\n"
        f"نوع الرسالة: {MESSAGE_TYPE_LABELS[contact_message['messageType']]}\n"
        f"الموضوع: {contact_message['subject']}\n\n"
        f"الرسالة:\n{contact_message['message']}"
    )
    payload = {
        "from": sender,
        "to": recipients[0],
        "subject": (
            f"{MESSAGE_TYPE_LABELS[contact_message['messageType']]}: "
            f"{contact_message['subject']}"
        ),
        "text": text,
    }
    if len(recipients) > 1:
        payload["cc"] = recipients[1:]
    if contact_message.get("email"):
        payload["reply_to"] = str(contact_message["email"])

    def send_request():
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "abnaa-alsham-backend/1.0",
                },
                timeout=30,
            )
            response.raise_for_status()
        except requests.HTTPError as error:
            response = error.response
            detail = response.text[:1000] if response is not None else str(error)
            status_code = response.status_code if response is not None else "unknown"
            raise RuntimeError(
                f"Resend returned HTTP {status_code}: {detail}"
            ) from error
        except requests.RequestException as error:
            raise RuntimeError(f"Could not reach Resend: {error}") from error

    await asyncio.to_thread(send_request)


@api.post("/public/contact-messages")
async def create_contact_message(body: ContactFormIn):
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "email": str(body.email) if body.email else None,
        "createdAt": now_iso(),
        "emailDeliveryStatus": "pending",
        "emailDeliveryError": None,
    }
    await db.contact_messages.insert_one(doc)
    try:
        await _send_contact_form_email(doc)
    except Exception as exc:
        logging.exception("Could not send contact-form email")
        await db.contact_messages.update_one(
            {"id": doc["id"]},
            {"$set": {
                "emailDeliveryStatus": "failed",
                "emailDeliveryError": str(exc)[:500],
            }},
        )
        raise HTTPException(
            502,
            "تم حفظ رسالتك لكن تعذر إرسال البريد الإلكتروني، يرجى المحاولة لاحقاً",
        ) from exc

    await db.contact_messages.update_one(
        {"id": doc["id"]},
        {"$set": {
            "emailDeliveryStatus": "sent",
            "emailDeliveryError": None,
            "emailSentAt": now_iso(),
        }},
    )
    return {"ok": True, "id": doc["id"]}


@api.post("/public/students/{sid}/messages")
async def create_public_message(sid: str, body: PublicMessageIn):
    student = await raw_db.students.find_one(
        {"id": sid}, {"_id": 0, "code": 1, "student.fullName": 1}
    )
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "email": str(body.email),
        "messageTypeLabel": MESSAGE_TYPE_LABELS[body.messageType],
        "studentId": sid,
        "studentName": (student.get("student") or {}).get("fullName"),
        "studentCode": student.get("code"),
        "status": "open",
        "createdAt": now_iso(),
        "response": "",
        "responseBy": None,
        "responseAt": None,
        "emailDeliveryStatus": None,
        "emailDeliveryError": None,
        "branchId": student.get("branchId"),
    }
    await raw_db.verification_messages.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"]}


@api.get("/messages")
async def list_verification_messages(
    current=Depends(require_permission("messages.view")),
):
    return await db.verification_messages.find(
        {}, {"_id": 0, "emailDeliveryError": 0}
    ).sort("createdAt", -1).to_list(1000)


async def _deliver_message_response(message):
    try:
        await _send_message_email(
            message["email"],
            "الرد على رسالتك إلى مدرسة أبناء الشام",
            f"مرحباً {message['name']}،\n\n"
            f"رد المدرسة على رسالتك ({message['messageTypeLabel']}):\n\n"
            f"{message['response']}\n\nمدرسة أبناء الشام",
        )
    except Exception as exc:
        logging.exception("Could not send verification-message reply")
        await db.verification_messages.update_one(
            {"id": message["id"]},
            {"$set": {
                "emailDeliveryStatus": "failed",
                "emailDeliveryError": str(exc)[:500],
            }},
        )
        raise HTTPException(502, "تم حفظ الرد لكن تعذر إرسال البريد الإلكتروني") from exc

    await db.verification_messages.update_one(
        {"id": message["id"]},
        {"$set": {
            "emailDeliveryStatus": "sent",
            "emailDeliveryError": None,
            "emailSentAt": now_iso(),
        }},
    )


@api.post("/messages/{message_id}/reply")
async def reply_to_verification_message(
    message_id: str,
    body: MessageReplyIn,
    current=Depends(require_permission("messages.reply")),
):
    message = await db.verification_messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(404, "الرسالة غير موجودة")
    updated_at = now_iso()
    await db.verification_messages.update_one(
        {"id": message_id},
        {"$set": {
            "response": body.response,
            "responseBy": current.get("name") or current.get("username"),
            "responseAt": updated_at,
            "status": "responded",
            "emailDeliveryStatus": "pending",
            "emailDeliveryError": None,
        }},
    )
    message.update({
        "response": body.response,
        "responseAt": updated_at,
        "messageTypeLabel": message.get("messageTypeLabel")
        or MESSAGE_TYPE_LABELS.get(message.get("messageType"), "أخرى"),
    })
    await _deliver_message_response(message)
    return await db.verification_messages.find_one(
        {"id": message_id}, {"_id": 0, "emailDeliveryError": 0}
    )


@api.post("/messages/{message_id}/resend")
async def resend_verification_message_reply(
    message_id: str,
    current=Depends(require_permission("messages.reply")),
):
    message = await db.verification_messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(404, "الرسالة غير موجودة")
    if not message.get("response"):
        raise HTTPException(400, "لا يوجد رد لإعادة إرساله")
    message["messageTypeLabel"] = message.get("messageTypeLabel") or MESSAGE_TYPE_LABELS.get(
        message.get("messageType"), "أخرى"
    )
    await _deliver_message_response(message)
    return await db.verification_messages.find_one(
        {"id": message_id}, {"_id": 0, "emailDeliveryError": 0}
    )

@api.get("/students/{sid}/full-information")
async def get_student_full(sid: str, current=Depends(require_permission("students.fullInformation.view"))):
    d = await ensure_student_access(sid, current)
    d.pop("_id", None)
    return await _augment_student(d, current)

DEFAULT_REGISTRATION_PATHS = ["خاص", "القرية", "الايتام"]

async def get_registration_paths():
    doc = await db.settings.find_one({"id": "registration_paths"}, {"_id": 0})
    if not doc:
        doc = {"id": "registration_paths", "paths": DEFAULT_REGISTRATION_PATHS,
               "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.settings.insert_one(doc)
    paths = doc.get("paths") or DEFAULT_REGISTRATION_PATHS
    return list(paths)

async def _clean_reg_path(path, existing=None):
    if path and path not in await get_registration_paths() and path != existing:
        raise HTTPException(400, "مسار التسجيل غير صالح")

async def _sync_sibling_links(student_id, student_doc, current, previous_siblings=None):
    siblings = student_doc.get("siblings") or []
    linked_ids = [
        sibling.get("studentId")
        for sibling in siblings
        if isinstance(sibling, dict) and sibling.get("studentId")
    ]
    if student_id in linked_ids:
        raise HTTPException(400, "لا يمكن ربط الطالب بنفسه كأخ أو أخت")
    if len(linked_ids) != len(set(linked_ids)):
        raise HTTPException(400, "لا يمكن ربط الطالب نفسه أكثر من مرة")

    linked_students = {}
    for sibling_id in linked_ids:
        linked_students[sibling_id] = await ensure_student_access(sibling_id, current)

    previous_ids = {
        sibling.get("studentId")
        for sibling in (previous_siblings or [])
        if isinstance(sibling, dict) and sibling.get("studentId")
    }
    desired_ids = set(linked_ids)
    for sibling_id in previous_ids - desired_ids:
        sibling_doc = await db.students.find_one({"id": sibling_id}, {"_id": 0})
        if not sibling_doc:
            continue
        sibling_doc["siblings"] = [
            sibling
            for sibling in sibling_doc.get("siblings") or []
            if not isinstance(sibling, dict)
            or sibling.get("studentId") != student_id
        ]
        sibling_doc["siblings"] = [
            {**sibling, "order": index + 1}
            if isinstance(sibling, dict)
            else sibling
            for index, sibling in enumerate(sibling_doc["siblings"])
        ]
        await db.students.update_one(
            {"id": sibling_id}, {"$set": {"siblings": sibling_doc["siblings"]}}
        )

    group = {student_id: student_doc, **linked_students}
    group_links = {}
    for group_student_id, group_student in group.items():
        student_data = group_student.get("student") or {}
        class_name = student_data.get("newClass") or ""
        if group_student.get("currentClassId"):
            class_doc = await db.classes.find_one(
                {"id": group_student["currentClassId"]}, {"_id": 0, "name": 1}
            )
            class_name = (class_doc or {}).get("name") or class_name
        group_links[group_student_id] = {
            "studentId": group_student_id,
            "fullName": student_data.get("fullName") or "",
            "gender": student_data.get("gender") or "",
            "class": class_name,
        }

    for group_student_id, group_student in linked_students.items():
        sibling_siblings = [
            sibling
            for sibling in group_student.get("siblings") or []
            if isinstance(sibling, dict)
        ]
        sibling_indexes = {
            sibling.get("studentId"): index
            for index, sibling in enumerate(sibling_siblings)
            if sibling.get("studentId")
        }
        for related_student_id, related_link in group_links.items():
            if related_student_id == group_student_id:
                continue
            if related_student_id in sibling_indexes:
                sibling_index = sibling_indexes[related_student_id]
                sibling_siblings[sibling_index] = {
                    **sibling_siblings[sibling_index],
                    **related_link,
                }
            else:
                sibling_indexes[related_student_id] = len(sibling_siblings)
                sibling_siblings.append(related_link)
        sibling_siblings = [
            {**sibling, "order": index + 1}
            for index, sibling in enumerate(sibling_siblings)
        ]
        await db.students.update_one(
            {"id": group_student_id}, {"$set": {"siblings": sibling_siblings}}
        )

@api.post("/students")
async def create_student(body: StudentIn, current=Depends(require_permission("students.create"))):
    p = body.model_dump()
    student_data = p.setdefault("student", {})
    if not student_data.get("registrationPath"):
        raise HTTPException(400, "مسار التسجيل الأولي مطلوب")
    student_data["finalRegistrationPath"] = student_data.get("finalRegistrationPath") or student_data.get("registrationPath") or ""
    await _clean_reg_path(student_data.get("registrationPath"))
    await _clean_reg_path(student_data.get("finalRegistrationPath"))
    p["id"] = str(uuid.uuid4())
    p["code"] = await generate_code("students")
    p["createdAt"] = now_iso(); p["updatedAt"] = now_iso()
    initial = p.pop("initialPayment", None)
    p["fees"] = _normalize_student_fees(p.get("fees") or {})
    academic_payable = _fee_payables(p["fees"])["academic"]
    if p.get("currentClassId"):
        if not await db.classes.find_one({"id": p["currentClassId"]}):
            raise HTTPException(400, "الصف غير موجود")
        allowed = await allowed_class_ids(current)
        if allowed is not None and p["currentClassId"] not in allowed:
            raise HTTPException(403, "لا يمكنك إضافة طالب إلى هذا الصف")
    await db.students.insert_one(p)
    await _sync_sibling_links(p["id"], p, current)
    if initial and float(initial.get("amount") or 0) > 0:
        amt = float(initial["amount"])
        if amt > academic_payable:
            await db.students.delete_one({"id": p["id"]})
            raise HTTPException(400, "الدفعة الأولى تتجاوز إجمالي المستحق")
        await db.payments.insert_one({"id": str(uuid.uuid4()), "student": p["id"],
            "academicYear": p["fees"]["academicYear"] or "", "feeType": "academic",
            "semester": initial.get("semester") or "full_year",
            "amount": amt, "paymentDate": initial.get("paymentDate") or now_iso(),
            "notes": "دفعة أولية عند التسجيل", "createdBy": current["id"],
            "createdAt": now_iso(), "updatedAt": now_iso()})
    return await _augment_student(await db.students.find_one({"id": p["id"]}, {"_id": 0}), current)

@api.put("/students/{sid}")
async def update_student(sid: str, body: StudentIn, current=Depends(require_permission("students.update"))):
    existing = await ensure_student_access(sid, current)
    p = body.model_dump()
    p.pop("initialPayment", None)
    student_data = p.setdefault("student", {})
    existing_student = existing.get("student") or {}
    if existing_student.get("registrationPath"):
        student_data["registrationPath"] = existing_student["registrationPath"]
    student_data.setdefault("registrationPath", existing_student.get("registrationPath", ""))
    student_data.setdefault("finalRegistrationPath", existing_student.get("finalRegistrationPath") or existing_student.get("registrationPath", ""))
    await _clean_reg_path(student_data.get("registrationPath"), existing_student.get("registrationPath"))
    await _clean_reg_path(student_data.get("finalRegistrationPath"), existing_student.get("finalRegistrationPath") or existing_student.get("registrationPath"))
    p["fees"] = _normalize_student_fees(p.get("fees") or {})
    if existing.get("orphanDocument"): p["orphanDocument"] = existing["orphanDocument"]
    if existing.get("code"): p["code"] = existing["code"]
    if p.get("currentClassId"):
        if not await db.classes.find_one({"id": p["currentClassId"]}):
            raise HTTPException(400, "الصف غير موجود")
        allowed = await allowed_class_ids(current)
        if allowed is not None and p["currentClassId"] not in allowed:
            raise HTTPException(403, "لا يمكنك نقل الطالب إلى هذا الصف")
    p["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": p})
    await _sync_sibling_links(sid, p, current, existing.get("siblings") or [])
    return await _augment_student(await db.students.find_one({"id": sid}, {"_id": 0}), current)

STUDENT_NOTE_FIELDS = {"class": "classNotes", "non-class": "nonClassNotes"}

def _student_note_field(category):
    field = STUDENT_NOTE_FIELDS.get(category)
    if not field:
        raise HTTPException(400, "نوع الملاحظة غير صالح")
    return field

@api.get("/students/{sid}/notes")
async def list_student_notes(sid: str, current=Depends(require_permission("students.notes.view"))):
    student = await ensure_student_access(sid, current)
    result = {}
    for category, field in STUDENT_NOTE_FIELDS.items():
        notes = student.get(field) or []
        if current.get("teacherId"):
            notes = [note for note in notes if note.get("authorId") == current["id"]]
        result[field] = notes
    return result

@api.post("/students/{sid}/notes/{category}")
async def create_student_note(sid: str, category: str, body: StudentNoteIn,
                              current=Depends(require_permission("students.notes.create"))):
    await ensure_student_access(sid, current)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "نص الملاحظة مطلوب")
    if len(content) > 4000:
        raise HTTPException(400, "الملاحظة طويلة جداً")
    field = _student_note_field(category)
    timestamp = now_iso()
    note = {"id": str(uuid.uuid4()), "content": content, "authorId": current["id"],
            "authorName": current.get("name") or current.get("username") or "—",
            "createdAt": timestamp, "updatedAt": timestamp}
    await db.students.update_one({"id": sid}, {"$push": {field: note}})
    return note

@api.put("/students/{sid}/notes/{category}/{note_id}")
async def update_student_note(sid: str, category: str, note_id: str, body: StudentNoteIn,
                              current=Depends(require_permission("students.notes.update"))):
    student = await ensure_student_access(sid, current)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "نص الملاحظة مطلوب")
    if len(content) > 4000:
        raise HTTPException(400, "الملاحظة طويلة جداً")
    field = _student_note_field(category)
    notes = student.get(field) or []
    note = next((item for item in notes if item.get("id") == note_id), None)
    if not note or (current.get("teacherId") and note.get("authorId") != current["id"]):
        raise HTTPException(404, "الملاحظة غير موجودة")
    note["content"] = content
    note["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": {field: notes}})
    return note

@api.delete("/students/{sid}/notes/{category}/{note_id}")
async def delete_student_note(sid: str, category: str, note_id: str,
                              current=Depends(require_permission("students.notes.delete"))):
    student = await ensure_student_access(sid, current)
    field = _student_note_field(category)
    notes = student.get(field) or []
    note = next((item for item in notes if item.get("id") == note_id), None)
    if not note or (current.get("teacherId") and note.get("authorId") != current["id"]):
        raise HTTPException(404, "الملاحظة غير موجودة")
    await db.students.update_one({"id": sid}, {"$set": {field: [item for item in notes if item.get("id") != note_id]}})
    return {"ok": True}

@api.delete("/students/{sid}")
async def delete_student(sid: str, body: DeactivationIn, current=Depends(require_permission("students.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    await ensure_student_access(sid, current)
    r = await db.students.update_one(
        {"id": sid},
        {"$set": {"student.status": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}

@api.post("/students/{sid}/reactivate")
async def reactivate_student(sid: str, current=Depends(require_permission("students.update"))):
    await ensure_student_access(sid, current)
    reactivated_at = now_iso()
    r = await db.students.update_one(
        {"id": sid, "student.status": "inactive"},
        {"$set": {
            "student.status": "resident",
            "reactivatedAt": reactivated_at,
            "updatedAt": reactivated_at,
        },
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        student = await db.students.find_one({"id": sid}, {"_id": 0, "id": 1})
        if not student: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "الطالب نشط بالفعل")
    return {"ok": True, "reactivated": True}
#endregion

#region Grades
async def get_grade_settings():
    settings = await db.settings.find_one({"id": "grades"}, {"_id": 0})
    return settings or {"id": "grades", "accepting": False}

@api.get("/settings/grades")
async def read_grade_settings(current=Depends(require_permission("grades.view"))):
    return await get_grade_settings()

@api.put("/settings/grades")
async def update_grade_settings(body: GradeSettingsIn,
                                current=Depends(require_permission("grades.accept"))):
    doc = {"id": "grades", "accepting": body.accepting, "updatedAt": now_iso(), "updatedBy": current["id"]}
    await db.settings.update_one({"id": "grades"}, {"$set": doc}, upsert=True)
    return {k: v for k, v in doc.items() if k != "updatedBy"}

@api.get("/grades")
async def list_grades(academicYear: Optional[str] = None, period: Optional[str] = None,
                      classId: Optional[str] = None, subjectId: Optional[str] = None,
                      studentId: Optional[str] = None,
                      current=Depends(require_permission("grades.view"))):
    allowed = await grade_scope(current)
    q = {}
    if academicYear: q["academicYear"] = academicYear
    if period: q["period"] = period
    if classId: q["classId"] = classId
    if subjectId: q["subjectId"] = subjectId
    if studentId: q["studentId"] = studentId
    if allowed is not None:
        q["$or"] = [{"classId": c, "subjectId": s} for c, s in allowed]
    docs = await db.grades.find(q, {"_id": 0}).sort("updatedAt", -1).to_list(10000)
    if allowed is not None:
        docs = [doc for doc in docs if (doc.get("classId"), doc.get("subjectId")) in allowed]
    for doc in docs:
        student = await db.students.find_one({"id": doc.get("studentId")}, {"_id": 0, "student.fullName": 1, "code": 1})
        subject = await db.subjects.find_one({"id": doc.get("subjectId")}, {"_id": 0, "name": 1})
        cls = await db.classes.find_one({"id": doc.get("classId")}, {"_id": 0, "name": 1, "section": 1})
        doc["studentName"] = (student.get("student") or {}).get("fullName") if student else "—"
        doc["studentCode"] = student.get("code") if student else None
        doc["subjectName"] = subject.get("name") if subject else "—"
        doc["className"] = f'{cls.get("name")} {cls.get("section") or ""}'.strip() if cls else "—"
    return docs

@api.post("/grades")
async def create_grade(body: GradeIn, current=Depends(require_permission("grades.create"))):
    if not (0 <= body.score <= 100): raise HTTPException(400, "الدرجة يجب أن تكون بين 0 و100")
    settings = await get_grade_settings()
    if not settings.get("accepting"): raise HTTPException(403, "فترة قبول الدرجات غير مفعلة")
    student = await ensure_student_access(body.studentId, current)
    if student.get("currentClassId") != body.classId: raise HTTPException(400, "الطالب ليس في هذا الصف")
    await ensure_grade_scope(body.classId, body.subjectId, current)
    if await db.grades.find_one({"studentId": body.studentId, "classId": body.classId,
                                 "subjectId": body.subjectId, "academicYear": body.academicYear,
                                 "period": body.period}):
        raise HTTPException(400, "الدرجة موجودة مسبقاً")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "createdBy": current["id"],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.grades.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/grades/{grade_id}")
async def update_grade(grade_id: str, body: GradeIn,
                       current=Depends(require_permission("grades.edit"))):
    if not (0 <= body.score <= 100): raise HTTPException(400, "الدرجة يجب أن تكون بين 0 و100")
    settings = await get_grade_settings()
    if not settings.get("accepting"): raise HTTPException(403, "فترة قبول الدرجات غير مفعلة")
    existing = await db.grades.find_one({"id": grade_id})
    if not existing: raise HTTPException(404, "غير موجود")
    await ensure_student_access(body.studentId, current)
    await ensure_grade_scope(body.classId, body.subjectId, current)
    if body.studentId != existing.get("studentId") or body.classId != existing.get("classId") or body.subjectId != existing.get("subjectId"):
        raise HTTPException(400, "لا يمكن تغيير الطالب أو الصف أو المادة")
    await db.grades.update_one({"id": grade_id}, {"$set": {"score": body.score, "notes": body.notes or "", "updatedAt": now_iso(), "updatedBy": current["id"]}})
    return await db.grades.find_one({"id": grade_id}, {"_id": 0})
#endregion

#region Orphan docs
STUDENT_DOCUMENT_TYPES = {
    "student_id": "إخراج قيد / هوية الطالب",
    "family_father": "بيان عائلي / دفتر العائلة — صفحة الأب",
    "family_mother": "بيان عائلي / دفتر العائلة — صفحة الأم",
    "family_student": "بيان عائلي / دفتر العائلة — صفحة الطالب",
    "personal_photo": "صورة شخصية",
    "address_document": "طبعة الإحصاء",
    "mother_id_front": "هوية الأم — الوجه الأمامي",
    "mother_id_back": "هوية الأم — الوجه الخلفي",
}

def _validate_upload(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, "امتداد ملف غير مسموح")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime and mime not in ALLOWED_MIMES:
        raise HTTPException(400, "نوع ملف غير مسموح")
    return ext, mime

async def _save_upload(file: UploadFile, directory: Path, student_code: str):
    ext, mime = _validate_upload(file)
    safe_code = re.sub(r"[^A-Za-z0-9_-]", "", student_code or "student")
    fname = f"stu-{safe_code}-{int(datetime.now(timezone.utc).timestamp() * 1000)}{ext}"
    fpath = directory / fname
    size = 0
    with open(fpath, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                os.remove(fpath)
                raise HTTPException(400, f"حجم الملف يتجاوز {MAX_UPLOAD_BYTES // (1024*1024)}MB")
            out.write(chunk)
    return fname, fpath, mime, size

@api.post("/students/{sid}/documents/{document_type}")
async def upload_student_document(sid: str, document_type: str, file: UploadFile = File(...),
                                  current=Depends(require_permission("students.documents.upload"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await db.students.find_one({"id": sid})
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    await ensure_student_access(sid, current)
    fname, fpath, mime, size = await _save_upload(file, STUDENT_DOCUMENTS_DIR, student.get("code") or sid)
    old = ((student.get("documents") or {}).get(document_type) or {}).get("filePath")
    meta = {"type": document_type, "label": STUDENT_DOCUMENT_TYPES[document_type], "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath), "mimeType": mime,
            "size": size, "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {f"documents.{document_type}": meta, "updatedAt": now_iso()}})
    if old:
        try: os.remove(old)
        except OSError: pass
    return {k: v for k, v in meta.items() if k != "filePath"}

@api.get("/students/{sid}/documents/{document_type}")
async def get_student_document(sid: str, document_type: str,
                               current=Depends(require_permission("students.documents.view"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await db.students.find_one({"id": sid})
    await ensure_student_access(sid, current)
    document = ((student or {}).get("documents") or {}).get(document_type)
    if not document or not document.get("filePath") or not os.path.exists(document["filePath"]):
        raise HTTPException(404, "لا توجد وثيقة")
    return FileResponse(document["filePath"], media_type=document.get("mimeType") or "application/octet-stream",
                        filename=document.get("originalName") or document.get("fileName"))

@api.delete("/students/{sid}/documents/{document_type}")
async def delete_student_document(sid: str, document_type: str,
                                  current=Depends(require_permission("students.documents.delete"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await db.students.find_one({"id": sid})
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    await ensure_student_access(sid, current)
    document = ((student.get("documents") or {}).get(document_type) or {})
    if document.get("filePath"):
        try: os.remove(document["filePath"])
        except OSError: pass
    await db.students.update_one({"id": sid}, {"$unset": {f"documents.{document_type}": ""}, "$set": {"updatedAt": now_iso()}})
    return {"ok": True}

@api.get("/public/students/{sid}/validation/personal-photo")
async def get_public_personal_photo(sid: str):
    student = await raw_db.students.find_one(
        {"id": sid}, {"_id": 0, "documents.personal_photo": 1}
    )
    document = ((student or {}).get("documents") or {}).get("personal_photo") or {}
    if not document.get("filePath") or not os.path.exists(document["filePath"]):
        raise HTTPException(404, "لا توجد صورة شخصية")
    return FileResponse(document["filePath"], media_type=document.get("mimeType") or "image/jpeg")

@api.post("/students/{sid}/orphan-document")
async def upload_orphan_doc(sid: str, type: str = Form(...), description: Optional[str] = Form(""),
                             file: UploadFile = File(...),
                             current=Depends(require_permission("students.orphanDocument.upload"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    await ensure_student_access(sid, current)
    fname, fpath, mime, size = await _save_upload(file, ORPHAN_DIR, student.get("code") or sid)
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
    await ensure_student_access(sid, current)
    od = student.get("orphanDocument")
    if not od or not od.get("filePath") or not os.path.exists(od["filePath"]):
        raise HTTPException(404, "لا توجد وثيقة")
    return FileResponse(od["filePath"], media_type=od.get("mimeType") or "application/octet-stream",
                        filename=od.get("originalName") or od.get("fileName"))

@api.delete("/students/{sid}/orphan-document")
async def delete_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.delete"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "غير موجود")
    await ensure_student_access(sid, current)
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
    if not p.get("feeType"):
        p.pop("totalPaidAtPayment", None)
        p.pop("totalRemainingAtPayment", None)
    p["feeType"] = p.get("feeType") or "academic"
    _clean_fee_type(p["feeType"])
    p["totalPayable"] = _fee_payables(s.get("fees") or {}).get(p["feeType"], 0) if s else 0
    p["totalPaid"], p["totalRemaining"] = await _payment_snapshot(p, p["totalPayable"]) if s else (0, 0)
    current_totals = await _student_payment_totals(p.get("student"), fee_year) if s else {"totalPaid": 0}
    p["currentTotalPaid"] = current_totals.get("byFeeType", {}).get(p["feeType"], 0)
    p["currentTotalRemaining"] = max(0, p["totalPayable"] - p["currentTotalPaid"])
    p["totalPaidAtPayment"] = float(p.get("totalPaidAtPayment") if p.get("totalPaidAtPayment") is not None else p["totalPaid"])
    p["totalRemainingAtPayment"] = float(p.get("totalRemainingAtPayment") if p.get("totalRemainingAtPayment") is not None else p["totalRemaining"])
    creator = await db.users.find_one({"id": p.get("createdBy")}, {"_id": 0, "name": 1})
    p["createdByName"] = creator.get("name") if creator else "—"
    return p

async def _enrich_payments(payments: list[dict]) -> list[dict]:
    if not payments:
        return payments
    student_ids = list({payment.get("student") for payment in payments if payment.get("student")})
    creator_ids = list({payment.get("createdBy") for payment in payments if payment.get("createdBy")})
    students = await db.students.find(
        {"id": {"$in": student_ids}},
        {"_id": 0, "id": 1, "student.fullName": 1, "code": 1, "fees": 1},
    ).to_list(len(student_ids))
    students_by_id = {student["id"]: student for student in students}
    creators = await db.users.find(
        {"id": {"$in": creator_ids}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(len(creator_ids))
    creators_by_id = {creator["id"]: creator for creator in creators}

    totals_by_student_year = {}
    if student_ids:
        grouped_totals = await db.payments.aggregate(
            [
                {"$match": {"student": {"$in": student_ids}}},
                {
                    "$group": {
                        "_id": {
                            "student": "$student",
                            "academicYear": {"$ifNull": ["$academicYear", ""]},
                            "feeType": {
                                "$cond": [
                                    {"$in": [{"$ifNull": ["$feeType", ""]}, ["", None]]},
                                    "academic",
                                    "$feeType",
                                ]
                            },
                        },
                        "paid": {"$sum": "$amount"},
                    }
                },
            ]
        ).to_list(None)
        for row in grouped_totals:
            key = (row["_id"]["student"], row["_id"]["academicYear"])
            by_type = totals_by_student_year.setdefault(
                key,
                {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
            )
            fee_type = row["_id"]["feeType"]
            by_type[fee_type] = by_type.get(fee_type, 0) + float(row["paid"] or 0)

    legacy_payments = [
        payment
        for payment in payments
        if not payment.get("feeType")
        or "totalPaidAtPayment" not in payment
        or "totalRemainingAtPayment" not in payment
    ]
    ledgers_by_student_year = {}
    ledger_pairs = {
        (payment.get("student"), payment.get("academicYear") or "")
        for payment in legacy_payments
        if payment.get("student")
    }
    if ledger_pairs:
        ledger_query = {
            "$or": [
                {"student": student_id, "academicYear": academic_year}
                for student_id, academic_year in ledger_pairs
            ]
        }
        ledgers = await db.payments.find(
            ledger_query,
            {
                "_id": 0,
                "id": 1,
                "student": 1,
                "academicYear": 1,
                "amount": 1,
                "feeType": 1,
                "paymentDate": 1,
                "createdAt": 1,
            },
        ).to_list(None)
        for ledger in ledgers:
            key = (ledger.get("student"), ledger.get("academicYear") or "")
            ledgers_by_student_year.setdefault(key, []).append(ledger)
        for ledger_group in ledgers_by_student_year.values():
            ledger_group.sort(key=_payment_order_key)

    totals_by_student = {}
    for (student_id, _), yearly_totals in totals_by_student_year.items():
        by_type = totals_by_student.setdefault(
            student_id,
            {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
        )
        for fee_type, amount in yearly_totals.items():
            by_type[fee_type] += amount

    for payment in payments:
        payment.pop("_id", None)
        student = students_by_id.get(payment.get("student"))
        student_fees = (student or {}).get("fees") or {}
        has_fee_type = bool(payment.get("feeType"))
        payment["studentName"] = (
            (student.get("student") or {}).get("fullName") if student else "—"
        )
        payment["studentCode"] = student.get("code") if student else None
        fee_year = (
            payment.get("academicYear") or student_fees.get("academicYear") or ""
        )
        fee_type = payment.get("feeType") or "academic"
        _clean_fee_type(fee_type)
        payment["feeType"] = fee_type
        payment["totalPayable"] = (
            _fee_payables(student_fees).get(fee_type, 0) if student else 0
        )
        student_year_totals = totals_by_student_year.get(
            (payment.get("student"), fee_year), {}
        )
        if not fee_year:
            student_year_totals = totals_by_student.get(payment.get("student"), {})
        payment["currentTotalPaid"] = student_year_totals.get(fee_type, 0)
        payment["currentTotalRemaining"] = max(
            0, payment["totalPayable"] - payment["currentTotalPaid"]
        )

        if (
            has_fee_type
            and "totalPaidAtPayment" in payment
            and "totalRemainingAtPayment" in payment
        ):
            paid_at_payment = float(payment["totalPaidAtPayment"])
            remaining_at_payment = float(payment["totalRemainingAtPayment"])
        else:
            ledger_key = (
                payment.get("student"),
                payment.get("academicYear") or "",
            )
            cumulative = 0
            for ledger in ledgers_by_student_year.get(ledger_key, []):
                if (ledger.get("feeType") or "academic") != fee_type:
                    continue
                cumulative += float(ledger.get("amount") or 0)
                if ledger.get("id") == payment.get("id"):
                    break
            paid_at_payment = cumulative
            remaining_at_payment = max(
                0, payment["totalPayable"] - cumulative
            )
        payment["totalPaid"] = paid_at_payment
        payment["totalRemaining"] = remaining_at_payment
        payment["totalPaidAtPayment"] = paid_at_payment
        payment["totalRemainingAtPayment"] = remaining_at_payment
        creator = creators_by_id.get(payment.get("createdBy"))
        payment["createdByName"] = creator.get("name") if creator else "—"
    return payments

@api.get("/payments")
async def list_payments(search: Optional[str] = None, academicYear: Optional[str] = None,
                        semester: Optional[str] = None,
                        feeType: Optional[str] = Query(
                            default=None, regex="^(academic|transportation)$"
                        ),
                        minAmount: Optional[float] = None,
                        maxAmount: Optional[float] = None,
                        page: Optional[int] = Query(default=None, ge=1),
                        limit: int = Query(default=10, ge=1, le=100),
                        current=Depends(require_permission("payments.view"))):
    q = {}
    if academicYear: q["academicYear"] = academicYear
    if semester: q["semester"] = semester
    if feeType == "academic":
        q["$and"] = [
            {
                "$or": [
                    {"feeType": "academic"},
                    {"feeType": {"$exists": False}},
                    {"feeType": None},
                ]
            }
        ]
    elif feeType:
        q["feeType"] = feeType
    amount_query = {}
    if minAmount is not None:
        amount_query["$gte"] = minAmount
    if maxAmount is not None:
        amount_query["$lte"] = maxAmount
    if amount_query:
        q["amount"] = amount_query
    if search:
        matching = await db.students.find({"$or": [{"student.fullName": {"$regex": search, "$options": "i"}},
                                                    {"code": {"$regex": search, "$options": "i"}}]}, {"id": 1, "_id": 0}).to_list(500)
        search_student_ids = [m["id"] for m in matching]
        q["student"] = {"$in": search_student_ids}
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        scoped_students = await db.students.find({"currentClassId": {"$in": allowed}}, {"id": 1, "_id": 0}).to_list(5000)
        scoped_ids = [student["id"] for student in scoped_students]
        existing_ids = q.get("student", {}).get("$in") if isinstance(q.get("student"), dict) else None
        q["student"] = {
            "$in": [
                sid
                for sid in (existing_ids if existing_ids is not None else scoped_ids)
                if sid in scoped_ids
            ]
        }
    total = await db.payments.count_documents(q) if page is not None else None
    total_pages = max(1, (total + limit - 1) // limit) if total is not None else 1
    resolved_page = min(page, total_pages) if page is not None else None
    cursor = db.payments.find(q, {"_id": 0}).sort("paymentDate", -1)
    if resolved_page is not None:
        cursor = cursor.skip((resolved_page - 1) * limit).limit(limit)
    docs = await cursor.to_list(limit if resolved_page is not None else 1000)
    await _enrich_payments(docs)
    if resolved_page is not None:
        return {
            "data": docs,
            "pagination": {
                "page": resolved_page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        }
    return docs

@api.get("/payments/summary")
async def payment_summary(search: Optional[str] = None, academicYear: Optional[str] = None,
                          current=Depends(require_permission("payments.view"))):
    student_query = {"student.status": {"$ne": "inactive"}}
    if academicYear:
        student_query["fees.academicYear"] = academicYear
    if search:
        student_query["$or"] = [
            {"student.fullName": {"$regex": search, "$options": "i"}},
            {"code": {"$regex": search, "$options": "i"}},
        ]
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        student_query["currentClassId"] = {"$in": allowed}
    students = await db.students.find(student_query, {"_id": 0, "id": 1, "fees": 1}).to_list(None)
    student_ids = [student["id"] for student in students]
    current_fee_years = {
        student["id"]: (student.get("fees") or {}).get("academicYear") or ""
        for student in students
    }
    categories = {
        fee_type: {"payable": 0, "paid": 0, "remaining": 0}
        for fee_type in FEE_TYPE_FIELDS
    }
    for student in students:
        for fee_type, payable in _fee_payables(student.get("fees") or {}).items():
            categories[fee_type]["payable"] += payable
    if student_ids:
        payment_query = {"student": {"$in": student_ids}}
        if academicYear:
            payment_query["academicYear"] = academicYear
        payments = await db.payments.find(
            payment_query,
            {"_id": 0, "student": 1, "academicYear": 1, "amount": 1, "feeType": 1},
        ).to_list(None)
        for payment in payments:
            if not academicYear and current_fee_years.get(payment.get("student")) and (
                payment.get("academicYear") or ""
            ) != current_fee_years[payment["student"]]:
                continue
            fee_type = payment.get("feeType") or "academic"
            if fee_type in categories:
                categories[fee_type]["paid"] += float(payment.get("amount") or 0)
    for values in categories.values():
        values["remaining"] = max(0, values["payable"] - values["paid"])
    return {"feeTypes": categories}

@api.get("/payments/{pid}")
async def get_payment(pid: str, current=Depends(require_permission("payments.view"))):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "غير موجود")
    await ensure_student_access(p.get("student"), current)
    return await _enrich_payment(p)

@api.get("/students/{sid}/payments")
async def list_student_payments(sid: str, current=Depends(require_permission("payments.view"))):
    await ensure_student_access(sid, current)
    docs = await db.payments.find({"student": sid}, {"_id": 0}).sort("paymentDate", -1).to_list(500)
    for d in docs: await _enrich_payment(d)
    return docs

async def _validate_no_overpayment(sid, ay, amt, fee_type="academic", exclude=None):
    s = await db.students.find_one({"id": sid})
    if not s: raise HTTPException(404, "الطالب غير موجود")
    fee_type = _clean_fee_type(fee_type)
    tp = _fee_payables(s.get("fees") or {}).get(fee_type, 0)
    q = {"student": sid, "academicYear": ay}
    if exclude: q["id"] = {"$ne": exclude}
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    cur = sum(float(p.get("amount", 0)) for p in docs if (p.get("feeType") or "academic") == fee_type)
    if cur + float(amt) > tp + 0.0001:
        raise HTTPException(400, f"مبلغ الدفعة يتجاوز الرصيد المتبقي (المتبقي: {tp - cur})")

@api.post("/payments")
async def create_payment(body: PaymentIn, current=Depends(require_permission("payments.create"))):
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await ensure_student_access(body.student, current)
    await _validate_no_overpayment(body.student, body.academicYear, body.amount, fee_type)
    doc = {"id": str(uuid.uuid4()), "student": body.student, "academicYear": body.academicYear,
            "feeType": fee_type, "semester": body.semester, "amount": float(body.amount), "paymentDate": body.paymentDate,
           "notes": body.notes or "", "createdBy": current["id"], "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(doc, _fee_payables(((await db.students.find_one({"id": body.student}) or {}).get("fees") or {})).get(fee_type, 0))
    await db.payments.update_one({"id": doc["id"]}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    doc["totalPaidAtPayment"] = paid_at_payment
    doc["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment({k: v for k, v in doc.items() if k != "_id"})

@api.post("/payments/split")
async def create_split_payment(body: PaymentSplitIn, current=Depends(require_permission("payments.create"))):
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"):
        raise HTTPException(400, "الفصل غير صالح")
    if not math.isfinite(body.totalAmount) or body.totalAmount <= 0:
        raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    if any(
        not math.isfinite(item.amount) or item.amount <= 0
        for item in body.allocations
    ):
        raise HTTPException(400, "يجب أن يكون مبلغ كل طالب أكبر من صفر")
    total_cents = round(body.totalAmount * 100)
    allocations_cents = [round(item.amount * 100) for item in body.allocations]
    if abs(body.totalAmount * 100 - total_cents) > 0.000001 or any(
        abs(item.amount * 100 - cents) > 0.000001
        for item, cents in zip(body.allocations, allocations_cents)
    ):
        raise HTTPException(400, "المبالغ يجب أن تكون بدقة منزلتين عشريتين")
    if sum(allocations_cents) != total_cents:
        raise HTTPException(400, "مجموع مبالغ الطلاب يجب أن يساوي إجمالي الدفعة")
    student_ids = [item.student for item in body.allocations]
    if len(student_ids) != len(set(student_ids)):
        raise HTTPException(400, "لا يمكن إضافة الطالب أكثر من مرة")

    for allocation in body.allocations:
        await ensure_student_access(allocation.student, current)
        await _validate_no_overpayment(
            allocation.student,
            body.academicYear,
            allocation.amount,
            fee_type,
        )

    created_at = now_iso()
    documents = [
        {
            "id": str(uuid.uuid4()),
            "student": allocation.student,
            "academicYear": body.academicYear,
            "feeType": fee_type,
            "semester": body.semester,
            "amount": allocations_cents[index] / 100,
            "paymentDate": body.paymentDate,
            "notes": body.notes or "",
            "createdBy": current["id"],
            "createdAt": created_at,
            "updatedAt": created_at,
        }
        for index, allocation in enumerate(body.allocations)
    ]
    await db.payments.insert_many(documents)
    result = []
    for document in documents:
        student = await db.students.find_one(
            {"id": document["student"]}, {"_id": 0, "fees": 1}
        )
        payable = _fee_payables((student or {}).get("fees") or {}).get(fee_type, 0)
        paid_at_payment, remaining_at_payment = await _payment_snapshot(
            document, payable
        )
        document["totalPaidAtPayment"] = paid_at_payment
        document["totalRemainingAtPayment"] = remaining_at_payment
        await db.payments.update_one(
            {"id": document["id"]},
            {
                "$set": {
                    "totalPaidAtPayment": paid_at_payment,
                    "totalRemainingAtPayment": remaining_at_payment,
                }
            },
        )
        result.append(await _enrich_payment(document))
    return result

@api.post("/payments/refund")
async def create_refund(body: RefundIn, current=Depends(require_permission("payments.create"))):
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "مبلغ الاسترداد يجب أن يكون أكبر من صفر")
    await ensure_student_access(body.student, current)
    student = await db.students.find_one({"id": body.student}, {"_id": 0, "fees": 1})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    semester_payments = await db.payments.find(
        {"student": body.student, "academicYear": body.academicYear, "semester": body.semester},
        {"_id": 0, "amount": 1, "feeType": 1},
    ).to_list(1000)
    paid_for_semester = max(0, sum(float(p.get("amount", 0)) for p in semester_payments
                                   if (p.get("feeType") or "academic") == fee_type))
    if body.amount > paid_for_semester + 0.0001:
        raise HTTPException(400, f"مبلغ الاسترداد يتجاوز المدفوع للفصل (المتاح: {paid_for_semester})")
    doc = {"id": str(uuid.uuid4()), "student": body.student, "academicYear": body.academicYear,
            "feeType": fee_type, "semester": body.semester, "amount": -float(body.amount), "type": "refund",
           "paymentDate": body.paymentDate, "notes": body.notes or "", "createdBy": current["id"],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    payable = _fee_payables(student.get("fees") or {}).get(fee_type, 0)
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
    student_id = existing.get("student")
    if body.student != student_id:
        raise HTTPException(400, "لا يمكن تغيير الطالب المرتبط بالدفعة")
    await ensure_student_access(student_id, current)
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await _validate_no_overpayment(student_id, body.academicYear, body.amount, fee_type, exclude=pid)
    await db.payments.update_one({"id": pid}, {"$set": {"student": student_id, "academicYear": body.academicYear,
        "feeType": fee_type, "semester": body.semester, "amount": float(body.amount), "paymentDate": body.paymentDate,
        "notes": body.notes or "", "updatedAt": now_iso()}})
    updated = await db.payments.find_one({"id": pid}, {"_id": 0})
    student = await db.students.find_one({"id": student_id}, {"_id": 0, "fees": 1})
    updated.pop("totalPaidAtPayment", None)
    updated.pop("totalRemainingAtPayment", None)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(updated, _fee_payables((student or {}).get("fees") or {}).get(fee_type, 0))
    await db.payments.update_one({"id": pid}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    updated["totalPaidAtPayment"] = paid_at_payment
    updated["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment(updated)

@api.delete("/payments/{pid}")
async def delete_payment(pid: str, current=Depends(require_permission("payments.delete"))):
    existing = await db.payments.find_one({"id": pid}, {"_id": 0, "student": 1})
    if not existing: raise HTTPException(404, "غير موجود")
    await ensure_student_access(existing.get("student"), current)
    r = await db.payments.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
#endregion

#region Settings / Code generation
@api.get("/settings/code-generation")
async def get_settings(current=Depends(require_permission("settings.codeGeneration.view"))):
    return await get_code_settings()

@api.get("/registration-paths")
async def list_registration_paths(current=Depends(get_current_user)):
    return {"paths": await get_registration_paths()}

DEFAULT_DISCOUNT_OPTIONS = []

async def get_discount_options():
    doc = await db.settings.find_one({"id": "discount_options"}, {"_id": 0})
    options = doc.get("options", DEFAULT_DISCOUNT_OPTIONS) if doc else DEFAULT_DISCOUNT_OPTIONS
    return [
        {**option, "category": option.get("category") or "general"}
        for option in options
    ]

@api.get("/discount-options")
async def list_discount_options(current=Depends(get_current_user)):
    return {"options": await get_discount_options()}

@api.put("/settings/discount-options")
async def update_discount_options(
    body: DiscountOptionsIn,
    current=Depends(require_permission("settings.codeGeneration.update")),
):
    options = []
    names = set()
    for option in body.options:
        name = option.name.strip()
        if not name:
            raise HTTPException(400, "اسم الخصم مطلوب")
        if name in names:
            raise HTTPException(400, "أسماء الخصومات يجب أن تكون فريدة")
        if not math.isfinite(option.percentage) or not 0 < option.percentage <= 100:
            raise HTTPException(400, "نسبة الخصم يجب أن تكون أكبر من صفر ولا تتجاوز 100")
        names.add(name)
        options.append({
            "name": name,
            "percentage": option.percentage,
            "category": option.category,
        })
    await db.settings.update_one(
        {"id": "discount_options"},
        {
            "$set": {"options": options, "updatedAt": now_iso()},
            "$setOnInsert": {"createdAt": now_iso()},
        },
        upsert=True,
    )
    return {"options": options}

@api.get("/settings/registration-paths")
async def get_registration_path_settings(current=Depends(require_permission("settings.codeGeneration.view"))):
    return {"paths": await get_registration_paths()}

@api.put("/settings/registration-paths")
async def update_registration_path_settings(body: RegistrationPathsIn,
                                            current=Depends(require_permission("settings.codeGeneration.update"))):
    paths = [path.strip() for path in body.paths if path and path.strip()]
    if not paths:
        raise HTTPException(400, "يجب إضافة مسار تسجيل واحد على الأقل")
    if len(paths) != len(set(paths)):
        raise HTTPException(400, "مسارات التسجيل يجب أن تكون فريدة")
    await db.settings.update_one(
        {"id": "registration_paths"},
        {"$set": {"paths": paths, "updatedAt": now_iso()}, "$setOnInsert": {"createdAt": now_iso()}},
        upsert=True,
    )
    return {"paths": paths}

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
ATTENDANCE_REPEAT_ABSENCE_THRESHOLD = 3

@api.get("/dashboard/filters")
async def dashboard_filters(current=Depends(get_current_user)):
    allowed = await allowed_class_ids(current)
    class_query = {"status": {"$ne": "inactive"}}
    if allowed is not None:
        class_query["id"] = {"$in": allowed}
    classes = await db.classes.find(
        class_query,
        {"_id": 0, "id": 1, "name": 1, "grade": 1, "section": 1, "academicYear": 1},
    ).sort("name", 1).to_list(5000)
    years = await db.students.distinct("fees.academicYear", {})
    years = sorted({year for year in years if year}, reverse=True)
    years = sorted(
        set(years) | {item["academicYear"] for item in classes if item.get("academicYear")},
        reverse=True,
    )
    return {
        "classes": classes,
        "academicYears": years,
        "registrationPaths": await get_registration_paths(),
    }

async def _attendance_class_scope(current):
    allowed = await allowed_class_ids(current)
    if allowed is None:
        return None
    return {"id": {"$in": allowed}}

async def _repeated_absence_reports(current, class_id=None, date_from=None, date_to=None):
    class_scope = await _attendance_class_scope(current)
    query = {}
    if class_scope is not None:
        query["classId"] = class_scope["id"]
    if class_id:
        await ensure_class_access(class_id, current)
        query["classId"] = class_id
    if date_from or date_to:
        query["attendanceDate"] = {
            **({"$gte": date_from.isoformat()} if date_from else {}),
            **({"$lte": date_to.isoformat()} if date_to else {}),
        }

    sessions = await db.attendance_sessions.find(
        query,
        {"_id": 0, "classId": 1, "className": 1, "attendanceDate": 1, "records": 1},
    ).to_list(100000)
    by_student = {}
    for session in sessions:
        for record in session.get("records", []):
            if record.get("status") != "absent":
                continue
            student_id = record.get("studentId")
            if not student_id:
                continue
            report = by_student.setdefault(student_id, {
                "studentId": student_id,
                "studentName": record.get("studentName") or "—",
                "studentCode": record.get("studentCode") or "",
                "absenceDates": set(),
                "absences": [],
            })
            report["absenceDates"].add(session["attendanceDate"])
            report["absences"].append({
                "date": session["attendanceDate"],
                "classId": session["classId"],
                "className": session.get("className") or "—",
                "reason": record.get("absenceReason"),
            })

    reports = [
        report for report in by_student.values()
        if len(report["absenceDates"]) >= ATTENDANCE_REPEAT_ABSENCE_THRESHOLD
    ]
    for report in reports:
        report["absences"].sort(key=lambda absence: absence["date"])
        report["absenceCount"] = len(report["absenceDates"])
        report.pop("absenceDates")
        report["lastAbsenceDate"] = report["absences"][-1]["date"]
    return sorted(
        reports,
        key=lambda report: (-report["absenceCount"], report["studentName"].casefold()),
    )

def require_any_permission(*permissions):
    async def checker(current=Depends(get_current_user)):
        if not any(permission in (current.get("permissions") or []) for permission in permissions):
            raise HTTPException(403, "لا تملك صلاحية الوصول إلى الحضور")
        return current
    return checker

@api.get("/attendance/classes")
async def list_attendance_classes(
    current=Depends(require_any_permission("attendance.view", "attendance.manage")),
):
    query = await _attendance_class_scope(current)
    classes = await db.classes.find(
        {**(query or {}), "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1, "grade": 1, "section": 1, "academicYear": 1},
    ).sort("name", 1).to_list(5000)
    return classes

@api.get("/attendance/classes/{class_id}")
async def get_class_attendance(
    class_id: str,
    attendance_date: date = Query(alias="date"),
    current=Depends(require_any_permission("attendance.view", "attendance.manage")),
):
    class_doc = await ensure_class_access(class_id, current)
    records = await db.students.find(
        {
            "currentClassId": class_id,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1},
    ).sort("student.fullName", 1).to_list(5000)
    session = await db.attendance_sessions.find_one(
        {"classId": class_id, "attendanceDate": attendance_date.isoformat()},
        {"_id": 0},
    )
    saved_records = {
        record["studentId"]: record
        for record in (session or {}).get("records", [])
    }
    return {
        "classId": class_id,
        "className": class_doc["name"],
        "attendanceDate": attendance_date.isoformat(),
        "markedAt": (session or {}).get("markedAt"),
        "students": [
            {
                "studentId": student["id"],
                "studentName": (student.get("student") or {}).get("fullName") or "—",
                "studentCode": student.get("code") or "",
                "status": saved_records.get(student["id"], {}).get("status"),
                "absenceReason": saved_records.get(student["id"], {}).get("absenceReason"),
                "lateMinutes": saved_records.get(student["id"], {}).get("lateMinutes"),
            }
            for student in records
        ],
    }

@api.put("/attendance/classes/{class_id}")
async def save_class_attendance(
    class_id: str,
    body: AttendanceSaveIn,
    current=Depends(require_permission("attendance.manage")),
):
    class_doc = await ensure_class_access(class_id, current)
    if body.attendanceDate > date.today():
        raise HTTPException(400, "لا يمكن تسجيل الحضور لتاريخ مستقبلي")
    date_value = body.attendanceDate.isoformat()
    students = await db.students.find(
        {
            "currentClassId": class_id,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1},
    ).to_list(5000)
    submitted = [record.studentId for record in body.records]
    if len(submitted) != len(set(submitted)):
        raise HTTPException(400, "لا يمكن تسجيل الطالب أكثر من مرة")
    students_by_id = {student["id"]: student for student in students}
    if set(submitted) != set(students_by_id):
        raise HTTPException(400, "يجب تحديد حالة الحضور لكل طالب نشط في الصف")

    for record in body.records:
        if record.status == "absent" and not record.absenceReason:
            raise HTTPException(400, "يرجى تحديد ما إذا كان الغياب بعذر أو دون عذر")
        if record.status == "absent" and record.lateMinutes is not None:
            raise HTTPException(400, "لا يمكن تسجيل مدة تأخر للطالب الغائب")
        if record.status == "present" and record.absenceReason is not None:
            raise HTTPException(400, "سبب الغياب متاح للطالب الغائب فقط")

    records_by_id = {record.studentId: record for record in body.records}
    timestamp = now_iso()
    session_records = [
        {
            "studentId": student_id,
            "studentName": (student.get("student") or {}).get("fullName") or "—",
            "studentCode": student.get("code") or "",
            "status": records_by_id[student_id].status,
            "absenceReason": records_by_id[student_id].absenceReason,
            "lateMinutes": records_by_id[student_id].lateMinutes,
        }
        for student_id, student in students_by_id.items()
    ]
    await db.attendance_sessions.update_one(
        {"classId": class_id, "attendanceDate": date_value},
        {
            "$set": {
                "className": class_doc["name"],
                "records": session_records,
                "markedBy": current["id"],
                "markedAt": timestamp,
                "updatedAt": timestamp,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "createdAt": timestamp,
            },
        },
        upsert=True,
    )
    return {
        "ok": True,
        "classId": class_id,
        "attendanceDate": date_value,
        "total": len(session_records),
        "absent": sum(record["status"] == "absent" for record in session_records),
        "markedAt": timestamp,
    }

@api.get("/attendance/reports")
async def repeated_absence_reports(
    class_id: Optional[str] = Query(default=None, alias="classId"),
    date_from: Optional[date] = Query(default=None, alias="dateFrom"),
    date_to: Optional[date] = Query(default=None, alias="dateTo"),
    current=Depends(require_permission("attendance.reports.view")),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "نطاق التاريخ غير صالح")
    reports = await _repeated_absence_reports(current, class_id, date_from, date_to)
    return {
        "threshold": ATTENDANCE_REPEAT_ABSENCE_THRESHOLD,
        "count": len(reports),
        "reports": reports,
    }

@api.get("/dashboard/stats")
async def dashboard_stats(
    student_status: str = Query(default="active", alias="studentStatus"),
    class_id: Optional[str] = Query(default=None, alias="classId"),
    academic_year: Optional[str] = Query(default=None, alias="academicYear"),
    gender: Optional[str] = None,
    final_registration_path: Optional[str] = Query(
        default=None, alias="finalRegistrationPath"
    ),
    current=Depends(get_current_user),
):
    if student_status not in ("active", "dropped", "all"):
        raise HTTPException(400, "حالة الطلاب غير صالحة")
    if gender not in (None, "", "male", "female"):
        raise HTTPException(400, "الجنس غير صالح")
    allowed = await allowed_class_ids(current)
    if class_id:
        await ensure_class_access(class_id, current)
    class_query = {"status": {"$ne": "inactive"}}
    if allowed is not None:
        class_query["id"] = {"$in": allowed}
    if class_id:
        class_query["id"] = class_id
    if academic_year:
        class_query["academicYear"] = academic_year
    filtered_classes = await db.classes.find(
        class_query, {"_id": 0, "id": 1, "academicYear": 1}
    ).to_list(5000)
    filtered_class_ids = [item["id"] for item in filtered_classes]

    student_query = {}
    if allowed is not None or class_id or academic_year:
        student_query["currentClassId"] = {"$in": filtered_class_ids}
    if academic_year:
        student_query["fees.academicYear"] = academic_year
    if gender:
        student_query["student.gender"] = gender
    teachers_count = await db.teachers.count_documents({} if allowed is None else {"id": current.get("teacherId")})
    classes_count = len(filtered_classes) if (allowed is not None or class_id or academic_year) else await db.classes.count_documents({})

    path_students = await db.students.find(
        student_query,
        {"_id": 0, "id": 1, "student": 1, "fees": 1, "currentClassId": 1},
    ).to_list(None)
    if final_registration_path:
        path_students = [
            student
            for student in path_students
            if (
                (student.get("student") or {}).get("finalRegistrationPath")
                or (student.get("student") or {}).get("registrationPath")
                or "غير محدد"
            )
            == final_registration_path
        ]
    filtered_student_ids = {student["id"] for student in path_students}
    student_class_ids = {
        student["currentClassId"]
        for student in path_students
        if student.get("currentClassId")
    }
    status_students = [
        student
        for student in path_students
        if student_status == "all"
        or (
            student_status == "dropped"
            and (student.get("student") or {}).get("status") == "inactive"
        )
        or (
            student_status == "active"
            and (student.get("student") or {}).get("status") != "inactive"
        )
    ]
    total = len(status_students)
    female = sum(
        (student.get("student") or {}).get("gender") == "female"
        for student in status_students
    )
    male = sum(
        (student.get("student") or {}).get("gender") == "male"
        for student in status_students
    )
    orphans = sum(
        (student.get("student") or {}).get("orphan") is True
        for student in status_students
    )
    active = sum(
        (student.get("student") or {}).get("status") != "inactive"
        for student in path_students
    )
    dropped = sum(
        (student.get("student") or {}).get("status") == "inactive"
        for student in path_students
    )
    registration_paths = await get_registration_paths()
    path_stats = {
        path: {"path": path, "total": 0, "dropped": 0}
        for path in registration_paths
    }
    for student in path_students:
        student_data = student.get("student") or {}
        path = (
            student_data.get("finalRegistrationPath")
            or student_data.get("registrationPath")
            or "غير محدد"
        )
        if path not in path_stats:
            path_stats[path] = {"path": path, "total": 0, "dropped": 0}
        if student_data.get("status") == "inactive":
            path_stats[path]["dropped"] += 1
        else:
            path_stats[path]["total"] += 1

    if allowed is None:
        teacher_scope = {}
    else:
        teacher_scope = {"id": current.get("teacherId")}
    teacher_stats = {
        "total": teachers_count,
        "female": await db.teachers.count_documents({**teacher_scope, "gender": "female"}),
        "male": await db.teachers.count_documents({**teacher_scope, "gender": "male"}),
    }

    all_finance = {
        fee_type: {"payable": 0.0, "paid": 0.0, "remaining": 0.0}
        for fee_type in ("academic", "transportation")
    }
    path_finance = {}
    for path in path_stats:
        path_finance[path] = {
            fee_type: {"payable": 0.0, "paid": 0.0, "remaining": 0.0}
            for fee_type in ("academic", "transportation")
        }

    finance_students = {}
    for student in path_students:
        student_data = student.get("student") or {}
        is_dropped = student_data.get("status") == "inactive"
        if student_status == "active" and is_dropped:
            continue
        if student_status == "dropped" and not is_dropped:
            continue
        path = (
            student_data.get("finalRegistrationPath")
            or student_data.get("registrationPath")
            or "غير محدد"
        )
        fees = student.get("fees") or {}
        fee_payables = _fee_payables(fees)
        finance_students[student["id"]] = {
            "path": path,
            "academicYear": fees.get("academicYear") or "",
        }
        for fee_type in ("academic", "transportation"):
            payable = fee_payables[fee_type]
            all_finance[fee_type]["payable"] += payable
            path_finance[path][fee_type]["payable"] += payable

    if finance_students:
        finance_payments = await db.payments.find(
            {"student": {"$in": list(finance_students)}},
            {"_id": 0, "student": 1, "academicYear": 1, "feeType": 1, "amount": 1},
        ).to_list(None)
        for payment in finance_payments:
            fee_type = payment.get("feeType") or "academic"
            student_id = payment.get("student")
            student_finance = finance_students.get(student_id)
            if (
                fee_type not in ("academic", "transportation")
                or student_finance is None
            ):
                continue
            if student_finance["academicYear"] and (
                payment.get("academicYear") or ""
            ) != student_finance["academicYear"]:
                continue
            amount = float(payment.get("amount") or 0)
            path = student_finance["path"]
            all_finance[fee_type]["paid"] += amount
            path_finance[path][fee_type]["paid"] += amount

    for group in (all_finance, *path_finance.values()):
        for totals in group.values():
            totals["remaining"] = max(0, totals["payable"] - totals["paid"])

    # Payment and payable totals follow the selected student status.
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
                **(
                    {}
                    if student_status == "all"
                    else {
                        "student.student.status": (
                            "inactive"
                            if student_status == "dropped"
                            else {"$ne": "inactive"}
                        )
                    }
                ),
                **({} if allowed is None else {"student.currentClassId": {"$in": allowed}}),
                "student.id": {"$in": list(finance_students)},
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
                **(
                    {}
                    if student_status == "all"
                    else {
                        "student.status": (
                            "inactive"
                            if student_status == "dropped"
                            else {"$ne": "inactive"}
                        )
                    }
                ),
                **({} if allowed is None else {"currentClassId": {"$in": allowed}}),
                "id": {"$in": list(finance_students)},
            }
        },
        {
            "$group": {
                "_id": None,
                "sum": {
                    "$sum": {
                        "$add": [
                            {
                                "$multiply": [
                                    {"$ifNull": ["$fees.totalPayable", 0]},
                                    {
                                        "$subtract": [
                                            1,
                                            {
                                                "$divide": [
                                                    {
                                                        "$cond": [
                                                            {
                                                                "$eq": [
                                                                    "$fees.discountEnabled",
                                                                    True,
                                                                ]
                                                            },
                                                            {
                                                                "$ifNull": [
                                                                    "$fees.generalDiscountPercentage",
                                                                    "$fees.discountPercentage",
                                                                ]
                                                            },
                                                            0,
                                                        ]
                                                    },
                                                    100,
                                                ]
                                            },
                                        ]
                                    },
                                    {
                                        "$subtract": [
                                            1,
                                            {
                                                "$divide": [
                                                    {
                                                        "$cond": [
                                                            {
                                                                "$eq": [
                                                                    "$fees.discountEnabled",
                                                                    True,
                                                                ]
                                                            },
                                                            {
                                                                "$ifNull": [
                                                                    "$fees.siblingsStaffDiscountPercentage",
                                                                    0,
                                                                ]
                                                            },
                                                            0,
                                                        ]
                                                    },
                                                    100,
                                                ]
                                            },
                                        ]
                                    },
                                ]
                            },
                            {"$ifNull": ["$fees.booksFee", 0]},
                            {"$ifNull": ["$fees.busFee", 0]},
                            {"$ifNull": ["$fees.outfitFee", 0]},
                        ]
                    }
                },
                "books": {"$sum": {"$ifNull": ["$fees.booksFee", 0]}},
                "bus": {"$sum": {"$ifNull": ["$fees.busFee", 0]}},
                "outfit": {"$sum": {"$ifNull": ["$fees.outfitFee", 0]}},
            }
        }
    ]).to_list(1)

    total_payable = stu_agg[0]["sum"] if stu_agg else 0
    total_books_fee = stu_agg[0].get("books", 0) if stu_agg else 0
    total_bus_fee = stu_agg[0].get("bus", 0) if stu_agg else 0
    total_outfit_fee = stu_agg[0].get("outfit", 0) if stu_agg else 0

    result = {
        "total": total,
        "female": female,
        "male": male,
        "orphans": orphans,
        "dropped":dropped,
        "active":active,
        "teachers": teachers_count,
        "teacherStats": teacher_stats,
        "studentPaths": list(path_stats.values()),
        "finance": {
            "all": all_finance,
            "byPath": [
                {"path": path, **path_finance[path]}
                for path in path_stats
            ],
        },
        "classes": classes_count,
        "totalPayable": total_payable,
        "totalBooksFee": total_books_fee,
        "totalBusFee": total_bus_fee,
        "totalOutfitFee": total_outfit_fee,
        "totalCollected": total_collected,
        "totalRemaining": max(
            0,
            (total_payable or 0) - (total_collected or 0)
        )
    }
    permissions = current.get("permissions") or []
    if "attendance.view" in permissions or "attendance.manage" in permissions:
        today = datetime.now().date().isoformat()
        attendance_scope = await _attendance_class_scope(current)
        session_query = {"attendanceDate": today}
        if class_id:
            session_query["classId"] = class_id
        elif (
            academic_year
            or allowed is not None
            or gender
            or final_registration_path
        ):
            target_class_ids = (
                set(filtered_class_ids)
                if academic_year or allowed is not None
                else student_class_ids
            )
            if gender or final_registration_path:
                target_class_ids.intersection_update(student_class_ids)
            session_query["classId"] = {"$in": list(target_class_ids)}
        elif attendance_scope is not None:
            session_query["classId"] = attendance_scope["id"]
        sessions = await db.attendance_sessions.find(
            session_query, {"_id": 0, "records": 1}
        ).to_list(5000)
        if gender or final_registration_path:
            sessions = [
                {
                    **session,
                    "records": [
                        record
                        for record in session.get("records", [])
                        if record.get("studentId") in filtered_student_ids
                    ],
                }
                for session in sessions
            ]
            sessions = [session for session in sessions if session["records"]]
        attendance_counts = [
            record
            for session in sessions
            for record in session.get("records", [])
        ]
        marked_classes = len(sessions)
        active_classes_filter = {**(attendance_scope or {}), "status": {"$ne": "inactive"}}
        if class_id:
            active_classes_filter["id"] = class_id
        elif (
            academic_year
            or allowed is not None
            or gender
            or final_registration_path
        ):
            target_class_ids = (
                set(filtered_class_ids)
                if academic_year or allowed is not None
                else student_class_ids
            )
            if gender or final_registration_path:
                target_class_ids.intersection_update(student_class_ids)
            active_classes_filter["id"] = {"$in": list(target_class_ids)}
        active_classes = await db.classes.count_documents(active_classes_filter)
        present_count = sum(record.get("status") == "present" for record in attendance_counts)
        absent_count = sum(record.get("status") == "absent" for record in attendance_counts)
        late_count = sum(
            record.get("status") == "present" and record.get("lateMinutes") is not None
            for record in attendance_counts
        )
        result["attendance"] = {
            "date": today,
            "markedClasses": marked_classes,
            "totalClasses": active_classes,
            "present": present_count,
            "absent": absent_count,
            "late": late_count,
            "markedStudents": present_count + absent_count,
            "attendanceRate": (
                round(present_count * 100 / (present_count + absent_count), 1)
                if present_count + absent_count else 0
            ),
        }
    if "attendance.reports.view" in permissions:
        reports = await _repeated_absence_reports(current, class_id=class_id)
        if academic_year or gender or final_registration_path:
            reports = [
                report
                for report in reports
                if report["studentId"] in filtered_student_ids
            ]
        if academic_year and not class_id:
            class_id_set = set(filtered_class_ids)
            filtered_reports = []
            for report in reports:
                absences = [
                    absence
                    for absence in report["absences"]
                    if absence["classId"] in class_id_set
                ]
                if len({absence["date"] for absence in absences}) >= ATTENDANCE_REPEAT_ABSENCE_THRESHOLD:
                    filtered_reports.append(report)
            reports = filtered_reports
        result["repeatedAbsenceReports"] = len(reports)
    return result

@api.get("/reports/finance")
async def financial_reports(
    date_from: Optional[date] = Query(default=None, alias="dateFrom"),
    date_to: Optional[date] = Query(default=None, alias="dateTo"),
    month: Optional[str] = None,
    payment_type: str = Query(default="all", alias="paymentType"),
    course: Optional[str] = None,
    current=Depends(require_permission("reports.view")),
):
    allowed = await allowed_class_ids(current)
    if payment_type not in ("all", *FEE_TYPE_FIELDS.keys()):
        raise HTTPException(400, "نوع الدفع غير صالح")

    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية")

    month_start = None
    month_end = None
    if month:
        try:
            month_dt = datetime.strptime(month, "%Y-%m")
            month_start = month_dt.date()
            month_end = (month_dt.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "شهر التقرير غير صالح")
        date_from = month_start if not date_from else date_from
        date_to = month_end if not date_to else min(date_to, month_end)

    query = {}
    if allowed is not None:
        query["currentClassId"] = {"$in": allowed}
    if course:
        query["$or"] = [
            {"student.registrationPath": course},
            {"student.finalRegistrationPath": course},
            {"student.registrationPath": {"$regex": f"^{re.escape(course)}$", "$options": "i"}},
        ]
    students = await db.students.find(query, {"_id": 0, "id": 1, "student": 1, "fees": 1, "currentClassId": 1}).to_list(None)

    student_by_id = {student["id"]: student for student in students}
    student_ids = list(student_by_id.keys())
    fee_types = [payment_type] if payment_type != "all" else list(FEE_TYPE_FIELDS.keys())

    payment_filter = {}
    if date_from:
        payment_filter["paymentDate"] = {"$gte": date_from.isoformat()}
    if date_to:
        payment_filter["paymentDate"] = {**payment_filter.get("paymentDate", {}), "$lte": date_to.isoformat()}
    if student_ids:
        payment_filter["student"] = {"$in": student_ids}
    if payment_type != "all":
        payment_filter["feeType"] = payment_type
    payments = await db.payments.find(payment_filter, {"_id": 0, "student": 1, "amount": 1, "feeType": 1, "paymentDate": 1}).to_list(None)

    payment_totals_by_student = {sid: {fee: 0.0 for fee in fee_types} for sid in student_ids}
    for payment in payments:
        sid = payment.get("student")
        fee_type = payment.get("feeType") or "academic"
        if sid not in payment_totals_by_student:
            continue
        if payment_type == "all":
            if fee_type in FEE_TYPE_FIELDS:
                payment_totals_by_student[sid][fee_type] = payment_totals_by_student[sid].get(fee_type, 0.0) + float(payment.get("amount") or 0)
        else:
            payment_totals_by_student[sid][payment_type] = payment_totals_by_student[sid].get(payment_type, 0.0) + float(payment.get("amount") or 0)

    summary = {
        "totalStudents": len(student_ids),
        "paid": 0,
        "partial": 0,
        "unpaid": 0,
        "dropped": 0,
        "totalPayable": 0.0,
        "totalCollected": 0.0,
        "totalRemaining": 0.0,
    }
    by_course = {}

    for student in students:
        student_data = student.get("student") or {}
        if student_data.get("status") == "inactive":
            summary["dropped"] += 1
            continue

        course_name = student_data.get("finalRegistrationPath") or student_data.get("registrationPath") or "غير محدد"
        if course and course_name.lower() != course.lower():
            continue

        payable_by_type = {fee: 0.0 for fee in fee_types}
        if payment_type == "all":
            for fee_type, field_name in FEE_TYPE_FIELDS.items():
                fees = student.get("fees") or {}
                value = 0.0
                if fee_type == "academic":
                    value = _fee_payables(fees).get("academic", 0.0)
                elif fee_type == "transportation":
                    value = float(fees.get("busFee") or 0) if bool(fees.get("busRegistered", float(fees.get("busFee") or 0) > 0)) else 0.0
                elif fee_type == "books":
                    value = float(fees.get("booksFee") or 0)
                elif fee_type == "outfit":
                    value = float(fees.get("outfitFee") or 0)
                payable_by_type[fee_type] = value
                summary["totalPayable"] += value
        else:
            fees = student.get("fees") or {}
            if payment_type == "academic":
                payable = _fee_payables(fees).get("academic", 0.0)
            elif payment_type == "transportation":
                payable = float(fees.get("busFee") or 0) if bool(fees.get("busRegistered", float(fees.get("busFee") or 0) > 0)) else 0.0
            elif payment_type == "books":
                payable = float(fees.get("booksFee") or 0)
            elif payment_type == "outfit":
                payable = float(fees.get("outfitFee") or 0)
            else:
                payable = 0.0
            payable_by_type[payment_type] = payable
            summary["totalPayable"] += payable

        paid_for_type = sum(payment_totals_by_student.get(student.get("id"), {}).values()) if payment_type == "all" else payment_totals_by_student.get(student.get("id"), {}).get(payment_type, 0.0)
        if payment_type == "all":
            collected_for_student = sum(payment_totals_by_student.get(student.get("id"), {}).values())
            summary["totalCollected"] += collected_for_student
        else:
            collected_for_student = payment_totals_by_student.get(student.get("id"), {}).get(payment_type, 0.0)
            summary["totalCollected"] += collected_for_student

        payable_total = sum(payable_by_type.values())
        if payable_total > 0:
            if collected_for_student >= payable_total:
                summary["paid"] += 1
            elif collected_for_student > 0:
                summary["partial"] += 1
            else:
                summary["unpaid"] += 1
        else:
            if collected_for_student > 0:
                summary["paid"] += 1
            else:
                summary["unpaid"] += 1

        course_entry = by_course.setdefault(course_name, {
            "course": course_name,
            "payable": 0.0,
            "collected": 0.0,
            "remaining": 0.0,
            "paidStudents": 0,
            "partialStudents": 0,
            "unpaidStudents": 0,
        })
        course_entry["payable"] += payable_total
        course_entry["collected"] += collected_for_student
        course_entry["remaining"] = max(0, course_entry["payable"] - course_entry["collected"])
        if payable_total > 0:
            if collected_for_student >= payable_total:
                course_entry["paidStudents"] += 1
            elif collected_for_student > 0:
                course_entry["partialStudents"] += 1
            else:
                course_entry["unpaidStudents"] += 1
        else:
            if collected_for_student > 0:
                course_entry["paidStudents"] += 1
            else:
                course_entry["unpaidStudents"] += 1

    summary["totalRemaining"] = max(0.0, summary["totalPayable"] - summary["totalCollected"])
    per_course = sorted(by_course.values(), key=lambda entry: entry["payable"], reverse=True)
    return {
        "period": {
            "month": month,
            "dateFrom": date_from.isoformat() if date_from else None,
            "dateTo": date_to.isoformat() if date_to else None,
            "paymentType": payment_type,
        },
        "summary": summary,
        "byCourse": per_course,
    }
#endregion

#region Startup / seed
@app.on_event("startup")
async def on_startup():
    default_branch = await raw_db.branches.find_one({"isDefault": True})
    if not default_branch:
        default_branch = await raw_db.branches.find_one({"id": "default"})
    if not default_branch:
        default_branch = {
            "id": str(uuid.uuid4()),
            "name": "الفرع الرئيسي",
            "active": True,
            "isDefault": True,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        await raw_db.branches.insert_one(default_branch)
    else:
        await raw_db.branches.update_one(
            {"id": default_branch["id"]},
            {"$set": {"isDefault": True, "active": True}},
        )
        default_branch["isDefault"] = True
        default_branch["active"] = True
    set_default_branch_id(default_branch["id"])

    for collection_name in await raw_db.list_collection_names():
        if collection_name not in {"branches", "roles", "users"}:
            await raw_db[collection_name].update_many(
                {"$or": [{"branchId": {"$exists": False}}, {"branchId": None}]},
                {"$set": {"branchId": default_branch["id"]}},
            )
    await raw_db.users.update_many(
        {"branchIds": {"$exists": False}},
        {"$set": {"branchIds": [default_branch["id"]]}},
    )

    defaults = [
        {"name": "Administrator", "description": "صلاحيات كاملة", "permissions": ALL_PERMS},
        {"name": "Registration Staff", "description": "موظف تسجيل",
         "permissions": ["students.view","students.create","students.update","students.print",
                         "students.fullInformation.view",
                         "payments.view","payments.create","payments.print",
                         "reports.view",
                         "students.orphanDocument.view","students.orphanDocument.upload",
                         "students.documents.view","students.documents.upload","students.documents.delete",
                         "teachers.view","classes.view"]},
        {"name": "Accountant", "description": "محاسب",
         "permissions": ["students.view","payments.view","payments.create","payments.update",
                         "payments.delete","payments.print","reports.view"]},
        {"name": "Teacher", "description": "معلم - الصفوف والطلاب المسندون فقط",
         "permissions": ["students.view", "students.print", "students.fullInformation.view",
                         "students.documents.view", "students.orphanDocument.view",
                         "students.notes.view", "students.notes.create", "students.notes.update", "students.notes.delete",
                         "classes.view", "subjects.view", "grades.view", "grades.create", "grades.edit",
                         "homework.view", "homework.create", "attendance.view", "attendance.manage"]},
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

    # Grant the new document permissions to the seeded registration role without
    # replacing any permissions an administrator may have added later.
    await db.roles.update_one(
        {"name": "Registration Staff"},
        {"$addToSet": {"permissions": {"$each": [
            "students.documents.view", "students.documents.upload", "students.documents.delete"
        ]}}},
    )
    await db.roles.update_one(
        {"name": "Teacher"},
        {"$addToSet": {"permissions": {"$each": [
            "subjects.view", "grades.view", "grades.create", "grades.edit",
            "students.notes.view", "students.notes.create", "students.notes.update", "students.notes.delete",
            "homework.view", "homework.create", "attendance.view", "attendance.manage"
        ]}}},
    )

    await db.classes.update_many(
        {"teacherId": {"$exists": True}, "teacherIds": {"$exists": False}},
        [{"$set": {"teacherIds": {"$cond": [
            {"$ne": ["$teacherId", None]}, ["$teacherId"], []
        ]}}}],
    )

    try:
        legacy_indexes = {
            "students": ["code_1"],
            "teachers": ["code_1"],
            "classes": ["code_1"],
            "subjects": ["code_1"],
            "counters": ["key_1"],
            "grades": [
                "studentId_1_classId_1_subjectId_1_academicYear_1_period_1"
            ],
            "attendance_sessions": ["classId_1_attendanceDate_1"],
        }
        for collection_name, index_names in legacy_indexes.items():
            indexes = await raw_db[collection_name].index_information()
            for index_name in index_names:
                if index_name in indexes:
                    await raw_db[collection_name].drop_index(index_name)
        await db.students.create_index([("branchId", 1), ("student.fullName", 1)])
        await db.students.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.students.create_index([("branchId", 1), ("currentClassId", 1)])
        await db.students.create_index([("branchId", 1), ("createdAt", -1)])
        await db.payments.create_index([("branchId", 1), ("student", 1)])
        await db.payments.create_index("academicYear")
        await db.payments.create_index([("branchId", 1), ("student", 1), ("academicYear", 1)])
        await db.payments.create_index("paymentDate")
        await db.payments.create_index([("branchId", 1), ("academicYear", 1), ("paymentDate", -1)])
        await db.users.create_index("username", unique=True)
        await db.roles.create_index("name", unique=True)
        await db.teachers.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.teachers.create_index([("branchId", 1), ("createdAt", -1)])
        await db.classes.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.classes.create_index([("branchId", 1), ("createdAt", -1)])
        await db.counters.create_index([("branchId", 1), ("key", 1)], unique=True)
        await db.subjects.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.teacher_subject_assignments.create_index([("teacherId", 1), ("subjectId", 1)], unique=True)
        await db.class_subject_assignments.create_index([("classId", 1), ("subjectId", 1)], unique=True)
        await db.grades.create_index([("branchId", 1), ("studentId", 1), ("classId", 1), ("subjectId", 1), ("academicYear", 1), ("period", 1)], unique=True)
        await db.homework.create_index([("branchId", 1), ("classId", 1), ("subjectId", 1), ("status", 1), ("homeworkDate", -1)])
        await db.attendance_sessions.create_index([("branchId", 1), ("classId", 1), ("attendanceDate", 1)], unique=True)
        await db.attendance_sessions.create_index([("branchId", 1), ("attendanceDate", -1)])
        await db.verification_messages.create_index([("createdAt", -1)])
        await db.contact_messages.create_index([("createdAt", -1)])
    except Exception as e:
        logging.warning(f"index setup: {e}")

    # Backfill missing student codes
    async for doc in db.students.find({"code": {"$exists": False}}, {"_id": 0, "id": 1}):
        try:
            code = await generate_code("students")
            await db.students.update_one({"id": doc["id"]}, {"$set": {"code": code}})
        except Exception:
            pass

    if await raw_db.users.count_documents({}) == 0:
        u = os.environ.get("SEED_ADMIN_USERNAME", "admin")
        p = os.environ.get("SEED_ADMIN_PASSWORD", "admin123")
        n = os.environ.get("SEED_ADMIN_NAME", "مدير النظام")
        await raw_db.users.insert_one({"id": str(uuid.uuid4()), "name": n, "username": u,
            "password": hash_pw(p), "roles": [admin_role_id],
            "branchIds": [default_branch["id"]],
            "createdAt": now_iso(), "updatedAt": now_iso()})
    else:
        await raw_db.users.update_many({"roles": {"$exists": False}}, {"$set": {"roles": []}})
        await raw_db.users.update_many(
            {"username": os.environ.get("SEED_ADMIN_USERNAME", "admin"),
             "roles": {"$not": {"$elemMatch": {"$eq": admin_role_id}}}},
            {"$addToSet": {"roles": admin_role_id}})

    await get_code_settings()
    await get_grade_settings()

@app.on_event("shutdown")
async def on_shutdown(): client.close()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)

#endregion
