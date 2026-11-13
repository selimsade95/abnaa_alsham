import hashlib
import hmac
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, SecretStr

from school.core.database import JWT_SECRET, raw_db
from school.core.rate_limit import limit_attempts
from school.core.services import ensure_student_access, now_iso, require_permission


router = APIRouter()
manage_cards = require_permission("students.parentAccess.manage")


class ParentAccessIn(BaseModel):
    studentCode: str | None = None
    accessCode: SecretStr


def _digest(value):
    return hmac.new(JWT_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


@router.get("/students/{sid}/parent-access")
async def card_status(sid: str, current=Depends(manage_cards)):
    student = await ensure_student_access(sid, current)
    card = await raw_db.parent_access_cards.find_one(
        {"_id": sid, "branchId": student["branchId"]}, {"_id": 0, "issuedAt": 1},
    )
    return {"issuedAt": card["issuedAt"] if card else None}


@router.post("/students/{sid}/parent-access")
async def issue_card(sid: str, response: Response, current=Depends(manage_cards)):
    student = await ensure_student_access(sid, current)
    if not student.get("code") or (student.get("student") or {}).get("status") == "inactive":
        raise HTTPException(400, "لا يمكن إصدار بطاقة لهذا الطالب")
    token = secrets.token_hex(8).upper()
    issued_at = now_iso()
    # The office sees the code once. The database has no spare copy to print.
    await raw_db.parent_access_cards.replace_one(
        {"_id": sid},
        {"_id": sid, "branchId": student["branchId"], "digest": _digest(f"parent-card:{token}"),
         "issuedAt": issued_at},
        upsert=True,
    )
    response.headers["Cache-Control"] = "no-store"
    return {"studentCode": student["code"], "accessCode": "-".join(token[i:i + 4] for i in range(0, 16, 4)),
            "issuedAt": issued_at}


@router.delete("/students/{sid}/parent-access")
async def revoke_card(sid: str, current=Depends(manage_cards)):
    student = await ensure_student_access(sid, current)
    await raw_db.parent_access_cards.delete_one({"_id": sid, "branchId": student["branchId"]})
    return {"ok": True}


@router.post("/parent-access")
async def view_student(body: ParentAccessIn, request: Request, response: Response):
    await limit_attempts(request, "parent", 30)
    denied = HTTPException(401, "تحقق من رمز الطالب ورمز البطاقة أو راجع إدارة المدرسة",
                           headers={"Cache-Control": "no-store"})
    token = re.sub(r"[-\s]", "", body.accessCode.get_secret_value()).upper()
    if not re.fullmatch(r"[0-9A-F]{16}", token):
        raise denied
    card = await raw_db.parent_access_cards.find_one(
        {"digest": _digest(f"parent-card:{token}")}, {"branchId": 1},
    )
    if not card:
        raise denied
    scope = {"branchId": card["branchId"]}
    student = await raw_db.students.find_one(
        {**scope, "id": card["_id"], "student.status": {"$ne": "inactive"}},
        {"code": 1, "student.fullName": 1, "student.newClass": 1, "currentClassId": 1,
         "classNotes": 1, "nonClassNotes": 1},
    )
    if not student or (
        body.studentCode is not None
        and (student.get("code") or "").casefold() != body.studentCode.strip().casefold()
    ):
        raise denied
    sid = card["_id"]
    classroom = await raw_db.classes.find_one(
        {**scope, "id": student.get("currentClassId")}, {"_id": 0, "name": 1, "section": 1},
    )
    grades = await raw_db.grades.find(
        {**scope, "studentId": sid, "publishedToParents": True},
        {"_id": 0, "academicYear": 1, "period": 1, "score": 1, "subjectId": 1},
    ).sort([("academicYear", -1), ("period", 1)]).to_list(1000)
    subject_ids = {grade.get("subjectId") for grade in grades}
    subjects = {
        subject["id"]: subject.get("name")
        async for subject in raw_db.subjects.find(
            {**scope, "id": {"$in": list(subject_ids)}}, {"_id": 0, "id": 1, "name": 1},
        )
    }
    for grade in grades:
        grade["subjectName"] = subjects.get(grade.pop("subjectId", None)) or "—"

    sessions = raw_db.attendance_sessions.find(
        {**scope, "records.studentId": sid},
        {"_id": 0, "attendanceDate": 1, "records": {"$elemMatch": {"studentId": sid}}},
    ).sort("attendanceDate", -1)
    attendance = [
        {"date": session["attendanceDate"], "status": record.get("status"),
         "absenceReason": record.get("absenceReason"), "lateMinutes": record.get("lateMinutes")}
        async for session in sessions.limit(366)
        for record in session.get("records", [])
    ]
    notes = [
        {"content": note["content"], "date": note.get("updatedAt") or note.get("createdAt")}
        for field in ("classNotes", "nonClassNotes")
        for note in student.get(field) or []
        if note.get("shareWithParent") is True and note.get("content")
    ]
    notes.sort(key=lambda note: note["date"] or "", reverse=True)
    response.headers["Cache-Control"] = "no-store"
    return {"name": student["student"].get("fullName"),
            "className": (classroom or {}).get("name") or student["student"].get("newClass"),
            "section": (classroom or {}).get("section"), "grades": grades, "attendance": attendance, "notes": notes}
