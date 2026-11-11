import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from school.core.database import raw_db
from school.core.services import require_permission


router = APIRouter()


@router.get("/audit-logs")
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    user: Optional[str] = Query(default=None, max_length=100),
    status: Optional[str] = Query(default=None, max_length=50),
    date_from: Optional[date] = Query(default=None, alias="dateFrom"),
    date_to: Optional[date] = Query(default=None, alias="dateTo"),
    request_type: Optional[str] = Query(
        default=None, alias="type", regex="^(POST|PUT|PATCH|DELETE)$"
    ),
    current=Depends(require_permission("auditLogs.view")),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=400, detail="dateFrom must be on or before dateTo"
        )

    if "branches.accessAll" in (current.get("permissions") or []):
        scope_query = {}
    else:
        scope_query = {"branchId": current["branchId"]}
    filters = [scope_query] if scope_query else []
    if user and user.strip():
        user_pattern = re.escape(user.strip())
        matching_users = await raw_db.users.find(
            {
                "$or": [
                    {"username": {"$regex": user_pattern, "$options": "i"}},
                    {"name": {"$regex": user_pattern, "$options": "i"}},
                ]
            },
            {"_id": 0, "id": 1},
        ).to_list(None)
        matching_user_ids = [item["id"] for item in matching_users if item.get("id")]
        filters.append({
            "$or": [
                {"username": {"$regex": user_pattern, "$options": "i"}},
                {"userId": {"$regex": user_pattern, "$options": "i"}},
                {"userId": {"$in": matching_user_ids}},
            ]
        })
    if status:
        try:
            status_codes = sorted({int(value) for value in status.split(",")})
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid status code")
        if not status_codes or any(code < 100 or code > 599 for code in status_codes):
            raise HTTPException(status_code=422, detail="Invalid status code")
        filters.append({"statusCode": {"$in": status_codes}})
    if request_type:
        filters.append({"method": request_type})
    created_at = {}
    if date_from:
        created_at["$gte"] = datetime.combine(
            date_from, datetime.min.time(), timezone.utc
        ).isoformat()
    if date_to:
        created_at["$lt"] = datetime.combine(
            date_to + timedelta(days=1), datetime.min.time(), timezone.utc
        ).isoformat()
    if created_at:
        filters.append({"createdAt": created_at})

    query = {"$and": filters} if filters else {}
    collection = raw_db.audit_logs
    total = await collection.count_documents(query)
    items = await collection.find(query, {"_id": 0}).sort(
        "createdAt", -1
    ).skip(skip).limit(limit).to_list(limit)
    status_options = await collection.distinct("statusCode", scope_query)
    user_ids = list({item.get("userId") for item in items if item.get("userId")})
    users = await raw_db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(len(user_ids)) if user_ids else []
    user_names = {user["id"]: user.get("name") for user in users}
    for item in items:
        item["fullName"] = user_names.get(item.get("userId")) or item.get("username")
    return {
        "items": items,
        "total": total,
        "statusOptions": sorted(status_options),
    }
