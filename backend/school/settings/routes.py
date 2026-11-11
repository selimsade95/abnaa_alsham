import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db
from school.core.services import (
    get_code_settings,
    get_current_user,
    now_iso,
    render_code,
    require_permission,
    validate_format,
)
from school.settings.schemas import CodeSettingsIn, DiscountOptionsIn, RegistrationPathsIn
from school.settings.services import get_discount_options, get_registration_paths


router = APIRouter()


@router.get("/settings/code-generation")
async def get_settings(current=Depends(require_permission("settings.codeGeneration.view"))):
    return await get_code_settings()


@router.get("/registration-paths")
async def list_registration_paths(current=Depends(get_current_user)):
    return {"paths": await get_registration_paths()}


@router.get("/discount-options")
async def list_discount_options(current=Depends(get_current_user)):
    return {"options": await get_discount_options()}


@router.put("/settings/discount-options")
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


@router.get("/settings/registration-paths")
async def get_registration_path_settings(current=Depends(require_permission("settings.codeGeneration.view"))):
    return {"paths": await get_registration_paths()}


@router.put("/settings/registration-paths")
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


@router.post("/settings/code-generation/preview")
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


@router.put("/settings/code-generation")
async def update_settings(body: CodeSettingsIn, current=Depends(require_permission("settings.codeGeneration.update"))):
    for k in ("students", "teachers", "classes"):
        cfg = body.model_dump()[k]
        if not cfg.get("prefix"): raise HTTPException(400, f"البادئة مطلوبة لـ {k}")
        validate_format(cfg["format"])
    await db.settings.update_one({"id": "code_generation"},
        {"$set": {**body.model_dump(), "updatedAt": now_iso()}}, upsert=True)
    return await get_code_settings()
