import uuid

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db, raw_db
from school.core.services import now_iso, require_permission
from school.roles.schemas import RoleIn
from school.users.routes import _require_delegable_permissions


router = APIRouter()


@router.get("/roles")
async def list_roles(current=Depends(require_permission("roles.view"))):
    return await db.roles.find({}, {"_id": 0}).sort("createdAt", 1).to_list(200)


@router.post("/roles")
async def create_role(body: RoleIn, current=Depends(require_permission("roles.create"))):
    if "branches.accessAll" not in current.get("permissions", []):
        raise HTTPException(403, "لا تملك صلاحية إدارة الأدوار العامة")
    _require_delegable_permissions(set(body.permissions), current)
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    if await db.roles.find_one({"name": body.name}): raise HTTPException(400, "الاسم مستخدم")
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "description": body.description or "",
           "permissions": body.permissions, "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.roles.insert_one(doc); doc.pop("_id", None); return doc


@router.put("/roles/{rid}")
async def update_role(rid: str, body: RoleIn, current=Depends(require_permission("roles.update"))):
    if "branches.accessAll" not in current.get("permissions", []):
        raise HTTPException(403, "لا تملك صلاحية إدارة الأدوار العامة")
    role = await db.roles.find_one({"id": rid})
    if not role: raise HTTPException(404, "غير موجود")
    _require_delegable_permissions(set(role.get("permissions") or []), current)
    _require_delegable_permissions(set(body.permissions), current)
    dup = await db.roles.find_one({"name": body.name, "id": {"$ne": rid}})
    if dup: raise HTTPException(400, "الاسم مستخدم")
    await db.roles.update_one({"id": rid}, {"$set": {"name": body.name, "description": body.description or "",
        "permissions": body.permissions, "updatedAt": now_iso()}})
    return await db.roles.find_one({"id": rid}, {"_id": 0})


@router.delete("/roles/{rid}")
async def delete_role(rid: str, current=Depends(require_permission("roles.delete"))):
    if "branches.accessAll" not in current.get("permissions", []):
        raise HTTPException(403, "لا تملك صلاحية إدارة الأدوار العامة")
    role = await db.roles.find_one({"id": rid})
    if not role: raise HTTPException(404, "غير موجود")
    _require_delegable_permissions(set(role.get("permissions") or []), current)
    await raw_db.users.update_many({}, {"$pull": {"roles": rid}})
    r = await db.roles.delete_one({"id": rid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
