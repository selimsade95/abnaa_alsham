from fastapi import APIRouter, Depends, HTTPException

from school.auth.permissions import PERMISSIONS_CATALOG
from school.auth.schemas import LoginIn
from school.branches.schemas import SelectBranchIn
from school.core.database import raw_db
from school.core.services import (
    accessible_branches,
    compute_user_permissions,
    create_token,
    get_current_user,
    verify_pw,
)


router = APIRouter()


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


@router.post("/auth/login")
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


@router.post("/auth/select-branch")
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


@router.post("/auth/logout")
async def logout(current=Depends(get_current_user)): return {"ok": True}


@router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return _auth_user_payload(
        current,
        current.get("branches", []),
        current.get("branchId"),
    )


@router.get("/permissions")
async def list_permissions(current=Depends(get_current_user)):
    return [{"name": n, "description": d, "resource": r, "action": a} for (n, d, r, a) in PERMISSIONS_CATALOG]
