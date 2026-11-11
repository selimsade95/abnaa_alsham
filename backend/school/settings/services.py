from fastapi import HTTPException

from school.core.database import db
from school.core.services import now_iso


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


DEFAULT_DISCOUNT_OPTIONS = []


async def get_discount_options():
    doc = await db.settings.find_one({"id": "discount_options"}, {"_id": 0})
    options = doc.get("options", DEFAULT_DISCOUNT_OPTIONS) if doc else DEFAULT_DISCOUNT_OPTIONS
    return [
        {**option, "category": option.get("category") or "general"}
        for option in options
    ]
