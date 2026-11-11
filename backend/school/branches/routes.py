import uuid

from fastapi import APIRouter, Depends, HTTPException

from school.branches.schemas import BranchIn
from school.core.database import db
from school.core.services import now_iso, require_permission


router = APIRouter()


@router.get("/branches")
async def list_branches(current=Depends(require_permission("branches.manage"))):
    return await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/branches")
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


@router.put("/branches/{branch_id}")
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
