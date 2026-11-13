import uuid

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db, raw_db
from school.core.services import compute_user_permissions, hash_pw, now_iso, require_permission
from school.users.schemas import UserCreate, UserUpdate


router = APIRouter()


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
    granted = {permission for role in roles for permission in role.get("permissions") or []}
    _require_delegable_permissions(granted, current)
    return requested


def _require_delegable_permissions(granted, current):
    caller = set(current.get("permissions") or [])
    # Scope permissions restrict access. Dropping the last restriction can widen it.
    gender = {permission for permission in caller if permission.startswith("students.gender.")}
    grades = {permission for permission in caller if permission.startswith("students.scope.")}
    drops_gender = len(gender) == 1 and not gender.intersection(granted)
    drops_grades = 0 < len(grades) < 3 and not grades.intersection(granted)
    if not granted.issubset(caller) or drops_gender or drops_grades:
        raise HTTPException(403, "لا تملك صلاحية إدارة هذا المستوى من الوصول")


async def _manageable_user(uid, current):
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "غير موجود")
    _require_delegable_permissions(set(await compute_user_permissions(target)), current)
    await _validated_user_branch_ids(target.get("branchIds") or [current["branchId"]], current)
    if current.get("teacherId") and target.get("teacherId") != current["teacherId"]:
        raise HTTPException(403, "لا تملك صلاحية إدارة هذا المستخدم")
    return target


@router.get("/users")
async def list_users(current=Depends(require_permission("users.view"))):
    users = await db.users.find({}, {"_id": 0, "password": 0, "authVersion": 0}).sort("createdAt", -1).to_list(500)
    for user in users:
        user.setdefault("branchIds", [current["branchId"]])
    return users


@router.get("/users/{uid}")
async def get_user(uid: str, current=Depends(require_permission("users.view"))):
    user = await db.users.find_one(
        {"id": uid}, {"_id": 0, "password": 0, "authVersion": 0}
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


@router.post("/users")
async def create_user(body: UserCreate, current=Depends(require_permission("users.create"))):
    if not body.name.strip() or not body.username.strip() or len(body.password) < 4:
        raise HTTPException(400, "بيانات غير صالحة")
    if await raw_db.users.find_one({"username": body.username}): raise HTTPException(400, "اسم المستخدم مستخدم")
    if current.get("teacherId") and body.teacherId != current["teacherId"]:
        raise HTTPException(403, "لا تملك صلاحية إنشاء مستخدم خارج نطاقك")
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


@router.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, current=Depends(require_permission("users.update"))):
    target = await _manageable_user(uid, current)
    if current.get("teacherId") and "teacherId" in body.model_fields_set and body.teacherId != target.get("teacherId"):
        raise HTTPException(403, "لا تملك صلاحية تغيير نطاق المستخدم")
    upd = {"updatedAt": now_iso()}
    if body.name is not None: upd["name"] = body.name.strip()
    if body.password:
        upd["password"] = hash_pw(body.password)
        upd["authVersion"] = uuid.uuid4().hex
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
    return await db.users.find_one({"id": uid}, {"_id": 0, "password": 0, "authVersion": 0})


@router.delete("/users/{uid}")
async def delete_user(uid: str, current=Depends(require_permission("users.delete"))):
    if uid == current["id"]: raise HTTPException(400, "لا يمكنك حذف حسابك الحالي")
    await _manageable_user(uid, current)
    r = await db.users.delete_one({"id": uid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
