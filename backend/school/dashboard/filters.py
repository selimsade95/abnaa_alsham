from fastapi import APIRouter, Depends

from school.core.database import db
from school.core.services import allowed_class_ids, get_current_user
from school.settings.services import get_registration_paths


router = APIRouter()


@router.get("/dashboard/filters")
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
