import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from school.auth.dependencies import require_any_permission
from school.core.database import db
from school.core.services import (
    allowed_class_ids,
    ensure_class_access,
    now_iso,
    require_permission,
)
from school.daily_reports.schemas import DailyReportSaveIn


router = APIRouter()


DAILY_REPORT_PERMISSIONS = (
    "dailyReports.view",
    "dailyReports.create",
    "dailyReports.update",
    "dailyReports.print",
)


@router.get("/daily-reports/classes")
async def list_daily_report_classes(
    current=Depends(require_any_permission(*DAILY_REPORT_PERMISSIONS)),
):
    query = {"status": {"$ne": "inactive"}}
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        query["id"] = {"$in": allowed}
    classes = await db.classes.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "grade": 1, "section": 1},
    ).sort("name", 1).to_list(5000)
    return classes


async def _daily_report_payload(class_id, report_date, current):
    class_doc = await ensure_class_access(class_id, current)
    date_value = report_date.isoformat()
    report = await db.daily_reports.find_one(
        {"classId": class_id, "reportDate": date_value},
        {"_id": 0},
    )
    students = await db.students.find(
        {
            "currentClassId": class_id,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "student.fullName": 1},
    ).sort("student.fullName", 1).to_list(5000)
    student_ids = {student["id"] for student in students}
    absences = [
        absence
        for absence in (report or {}).get("absences", [])
        if absence.get("studentId") in student_ids
    ]
    absent_ids = {absence["studentId"] for absence in absences}
    return {
        "classId": class_id,
        "className": class_doc.get("name") or "",
        "division": class_doc.get("section") or "",
        "reportDate": date_value,
        "report": report,
        "students": [
            {
                "studentId": student["id"],
                "studentName": (student.get("student") or {}).get("fullName") or "—",
            }
            for student in students
        ],
        "counts": {
            "attended": len(students) - len(absent_ids),
            "absent": len(absent_ids),
            "total": len(students),
        },
    }


@router.get("/daily-reports/{class_id}")
async def get_daily_report(
    class_id: str,
    report_date: date = Query(alias="date"),
    current=Depends(require_any_permission(*DAILY_REPORT_PERMISSIONS)),
):
    return await _daily_report_payload(class_id, report_date, current)


def _validated_daily_report_absences(body, students):
    student_by_id = {student["id"]: student for student in students}
    absence_ids = [absence.studentId for absence in body.absences]
    if len(absence_ids) != len(set(absence_ids)):
        raise HTTPException(400, "لا يمكن تسجيل الطالب الغائب أكثر من مرة")
    if not set(absence_ids).issubset(student_by_id):
        raise HTTPException(400, "قائمة الغياب تحتوي على طالب غير نشط أو من صف آخر")
    absences = []
    for absence in body.absences:
        excuse_reason = (absence.excuseReason or "").strip()
        if absence.absenceReason == "excused" and not excuse_reason:
            raise HTTPException(400, "يرجى تحديد سبب الغياب بعذر")
        absences.append({
            "studentId": absence.studentId,
            "studentName": (student_by_id[absence.studentId].get("student") or {}).get("fullName") or "—",
            "absenceReason": absence.absenceReason,
            "excuseReason": excuse_reason if absence.absenceReason == "excused" else None,
        })
    return absences


async def _save_daily_report(body, current, create):
    class_doc = await ensure_class_access(body.classId, current)
    if class_doc.get("status") == "inactive":
        raise HTTPException(400, "لا يمكن تسجيل تقرير لصف غير نشط")
    if body.reportDate > date.today():
        raise HTTPException(400, "لا يمكن تسجيل تقرير لتاريخ مستقبلي")
    date_value = body.reportDate.isoformat()
    query = {"classId": body.classId, "reportDate": date_value}
    existing = await db.daily_reports.find_one(query, {"_id": 0, "id": 1})
    if create and existing:
        raise HTTPException(409, "يوجد تقرير مسجل لهذا الصف والتاريخ")
    if not create and not existing:
        raise HTTPException(404, "التقرير غير موجود")

    students = await db.students.find(
        {
            "currentClassId": body.classId,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "student.fullName": 1},
    ).to_list(5000)
    absences = _validated_daily_report_absences(body, students)
    timestamp = now_iso()
    update = {
        "className": class_doc.get("name") or "",
        "division": class_doc.get("section") or "",
        "absences": absences,
        "schoolFlow": body.schoolFlow,
        "firstBreakNotes": body.firstBreakNotes,
        "secondBreakNotes": body.secondBreakNotes,
        "notes": body.notes,
        "updatedAt": timestamp,
        "updatedBy": current["id"],
        "updatedByName": current.get("name") or current.get("username") or "",
    }
    if create:
        document = {
            "id": str(uuid.uuid4()),
            "classId": body.classId,
            "reportDate": date_value,
            "createdAt": timestamp,
            "createdBy": current["id"],
            **update,
        }
        try:
            await db.daily_reports.insert_one(document)
        except DuplicateKeyError:
            raise HTTPException(409, "يوجد تقرير مسجل لهذا الصف والتاريخ")
    else:
        await db.daily_reports.update_one(query, {"$set": update})
    return await _daily_report_payload(body.classId, body.reportDate, current)


@router.post("/daily-reports", status_code=201)
async def create_daily_report(
    body: DailyReportSaveIn,
    current=Depends(require_permission("dailyReports.create")),
):
    return await _save_daily_report(body, current, create=True)


@router.put("/daily-reports/{class_id}")
async def update_daily_report(
    class_id: str,
    body: DailyReportSaveIn,
    current=Depends(require_permission("dailyReports.update")),
):
    if body.classId != class_id:
        raise HTTPException(400, "معرّف الصف في المسار والطلب غير متطابق")
    return await _save_daily_report(body, current, create=False)
