"""Shared backend services: authentication, access scoping, and code generation."""

import bcrypt
import jwt
import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_db = None
_security = HTTPBearer(auto_error=False)
_jwt_secret = None
_jwt_algorithm = "HS256"
_jwt_expire_hours = 24


def configure(db, jwt_secret, jwt_algorithm="HS256", jwt_expire_hours=24, security=None):
    global _db, _jwt_secret, _jwt_algorithm, _jwt_expire_hours, _security
    _db = db
    _jwt_secret = jwt_secret
    _jwt_algorithm = jwt_algorithm
    _jwt_expire_hours = jwt_expire_hours
    if security is not None:
        _security = security


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_pw(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_pw(password, hashed):
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def create_token(uid, username):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": uid, "username": username,
         "exp": now + timedelta(hours=_jwt_expire_hours), "iat": now},
        _jwt_secret, algorithm=_jwt_algorithm,
    )


async def compute_user_permissions(user):
    role_ids = user.get("roles") or []
    if not role_ids:
        return []
    roles = await _db.roles.find({"id": {"$in": role_ids}}, {"_id": 0}).to_list(100)
    return sorted({permission for role in roles for permission in role.get("permissions") or []})


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_security)):
    # Rebound by configure() to preserve FastAPI's dependency object.
    if not creds:
        raise HTTPException(401, "غير مصرح")
    try:
        payload = jwt.decode(creds.credentials, _jwt_secret, algorithms=[_jwt_algorithm])
        user = await _db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(401, "مستخدم غير موجود")
        user["permissions"] = await compute_user_permissions(user)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "انتهت الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "رمز غير صالح")


def require_permission(permission):
    async def checker(current=Depends(get_current_user)):
        if permission not in (current.get("permissions") or []):
            raise HTTPException(403, f"لا تملك صلاحية: {permission}")
        return current
    return checker


async def allowed_class_ids(current):
    teacher_id = current.get("teacherId")
    if not teacher_id:
        return None
    classes = await _db.classes.find(
        {"$or": [{"teacherIds": teacher_id}, {"teacherId": teacher_id}]},
        {"_id": 0, "id": 1},
    ).to_list(5000)
    return [item["id"] for item in classes]


async def ensure_class_access(class_id, current):
    allowed = await allowed_class_ids(current)
    if allowed is not None and class_id not in allowed:
        raise HTTPException(404, "غير موجود")
    record = await _db.classes.find_one({"id": class_id})
    if not record:
        raise HTTPException(404, "غير موجود")
    return record


async def ensure_student_access(student_id, current):
    student = await _db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(404, "غير موجود")
    allowed = await allowed_class_ids(current)
    if allowed is not None and student.get("currentClassId") not in allowed:
        raise HTTPException(404, "غير موجود")
    return student


async def grade_scope(current):
    teacher_id = current.get("teacherId")
    if not teacher_id:
        return None
    assignments = await _db.class_subject_assignments.find(
        {"teacherIds": teacher_id}, {"_id": 0, "classId": 1, "subjectId": 1}
    ).to_list(5000)
    return {(item["classId"], item["subjectId"]) for item in assignments}


async def ensure_grade_scope(class_id, subject_id, current):
    allowed = await grade_scope(current)
    if allowed is not None and (class_id, subject_id) not in allowed:
        raise HTTPException(404, "غير موجود")
    cls = await _db.classes.find_one({"id": class_id})
    subject = await _db.subjects.find_one({"id": subject_id})
    if not cls or not subject:
        raise HTTPException(400, "الصف أو المادة غير موجودة")
    assignment = await _db.class_subject_assignments.find_one({"classId": class_id, "subjectId": subject_id})
    if not assignment:
        raise HTTPException(400, "المادة غير مسندة إلى هذا الصف")
    return cls, subject, assignment


DEFAULT_CODE_SETTINGS = {
    "students": {"prefix": "STU", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
    "teachers": {"prefix": "TCR", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
    "classes": {"prefix": "CLS", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
    "resetYearly": True,
}
VALID_TOKENS = re.compile(r"\{(PREFIX|YEAR|YEAR2|SEQ(?::\d+)?)\}")


def validate_format(fmt):
    stripped = VALID_TOKENS.sub("", fmt)
    if "{" in stripped or "}" in stripped:
        raise HTTPException(400, "الصيغة تحتوي على رموز غير مدعومة")
    if "{SEQ" not in fmt and "{SEQ:" not in fmt:
        raise HTTPException(400, "الصيغة يجب أن تحتوي على {SEQ}")


def render_code(fmt, prefix, year, seq):
    out = fmt.replace("{PREFIX}", prefix).replace("{YEAR}", str(year)).replace("{YEAR2}", str(year)[-2:])
    return re.sub(r"\{SEQ(?::(\d+))?\}", lambda match: str(seq).zfill(int(match.group(1))) if match.group(1) else str(seq), out)


async def get_code_settings():
    doc = await _db.settings.find_one({"id": "code_generation"}, {"_id": 0})
    if not doc:
        doc = {"id": "code_generation", **DEFAULT_CODE_SETTINGS, "createdAt": now_iso(), "updatedAt": now_iso()}
        await _db.settings.insert_one(doc)
        doc.pop("_id", None)
    for key in ("students", "teachers", "classes"):
        doc.setdefault(key, DEFAULT_CODE_SETTINGS[key])
    doc.setdefault("resetYearly", True)
    return doc


async def next_sequence(entity):
    settings = await get_code_settings()
    year = datetime.now(timezone.utc).year
    key = f"{entity}-{year}" if settings.get("resetYearly", True) else entity
    result = await _db.counters.find_one_and_update({"key": key}, {"$inc": {"sequence": 1}}, upsert=True, return_document=True)
    if not result:
        result = await _db.counters.find_one({"key": key})
    return result["sequence"]


async def generate_code(entity):
    settings = await get_code_settings()
    config = settings.get(entity) or DEFAULT_CODE_SETTINGS[entity]
    return render_code(config["format"], config["prefix"], datetime.now(timezone.utc).year, await next_sequence(entity))
