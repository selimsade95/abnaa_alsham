import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException, Query

from school.core.database import db
from school.core.services import allowed_class_ids, get_current_user


router = APIRouter()


async def find_records(collection, name_field, match, filters):
    records = await collection.find(
        {**filters, "$or": [{name_field: match}, {"code": match}]},
        {"_id": 0, "id": 1, name_field: 1, "code": 1},
    ).sort([(name_field, 1), ("id", 1)]).limit(6).to_list(6)
    return [
        {"id": item["id"], "name": (item.get("student") or {}).get("fullName")
         if name_field == "student.fullName" else item.get(name_field), "code": item.get("code")}
        for item in records
    ]


@router.get("/quick-search")
async def quick_search(q: str = Query(min_length=2, max_length=100), current=Depends(get_current_user)):
    if not current.get("branchId"):
        raise HTTPException(428, "يرجى اختيار الفرع أولاً")
    query = q.strip()
    if len(query) < 2:
        return {}
    match = {"$regex": re.escape(query), "$options": "i"}
    permissions = set(current.get("permissions") or [])
    allowed = await allowed_class_ids(current) if permissions & {"classes.view", "students.view"} else None
    lookups = {}
    if "students.view" in permissions:
        filters = {"student.status": {"$ne": "inactive"}}
        if allowed is not None:
            filters["currentClassId"] = {"$in": allowed}
        lookups["students"] = find_records(db.students, "student.fullName", match, filters)
    if "teachers.view" in permissions:
        lookups["teachers"] = find_records(db.teachers, "fullName", match, {"employmentStatus": {"$ne": "inactive"}})
    if "classes.view" in permissions:
        filters = {"status": {"$ne": "inactive"}}
        if allowed is not None:
            filters["id"] = {"$in": allowed}
        lookups["classes"] = find_records(db.classes, "name", match, filters)
    return dict(zip(lookups, await asyncio.gather(*lookups.values())))
