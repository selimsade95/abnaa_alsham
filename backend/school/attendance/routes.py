import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from school.attendance.schemas import AttendanceSaveIn
from school.attendance.services import (
    _attendance_class_scope,
    _repeated_absence_reports,
    ATTENDANCE_REPEAT_ABSENCE_THRESHOLD,
)
from school.auth.dependencies import require_any_permission
from school.core.database import db
from school.core.services import ensure_class_access, now_iso, require_permission


router = APIRouter()


@router.get("/attendance/classes")
async def list_attendance_classes(
    current=Depends(require_any_permission("attendance.view", "attendance.manage")),
):
    query = await _attendance_class_scope(current)
    classes = await db.classes.find(
        {**(query or {}), "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1, "grade": 1, "section": 1, "academicYear": 1},
    ).sort("name", 1).to_list(5000)
    return classes


@router.get("/attendance/classes/{class_id}")
async def get_class_attendance(
    class_id: str,
    attendance_date: date = Query(alias="date"),
    current=Depends(require_any_permission("attendance.view", "attendance.manage")),
):
    class_doc = await ensure_class_access(class_id, current)
    records = await db.students.find(
        {
            "currentClassId": class_id,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1},
    ).sort("student.fullName", 1).to_list(5000)
    session = await db.attendance_sessions.find_one(
        {"classId": class_id, "attendanceDate": attendance_date.isoformat()},
        {"_id": 0},
    )
    saved_records = {
        record["studentId"]: record
        for record in (session or {}).get("records", [])
    }
    return {
        "classId": class_id,
        "className": class_doc["name"],
        "attendanceDate": attendance_date.isoformat(),
        "markedAt": (session or {}).get("markedAt"),
        "students": [
            {
                "studentId": student["id"],
                "studentName": (student.get("student") or {}).get("fullName") or "—",
                "studentCode": student.get("code") or "",
                "status": saved_records.get(student["id"], {}).get("status"),
                "absenceReason": saved_records.get(student["id"], {}).get("absenceReason"),
                "lateMinutes": saved_records.get(student["id"], {}).get("lateMinutes"),
                "earlyDismissalReason": saved_records.get(student["id"], {}).get("earlyDismissalReason"),
                "earlyDismissalRelation": saved_records.get(student["id"], {}).get("earlyDismissalRelation"),
                "earlyDismissalBy": saved_records.get(student["id"], {}).get("earlyDismissalBy"),
            }
            for student in records
        ],
    }


@router.put("/attendance/classes/{class_id}")
async def save_class_attendance(
    class_id: str,
    body: AttendanceSaveIn,
    current=Depends(require_permission("attendance.manage")),
):
    class_doc = await ensure_class_access(class_id, current)
    if body.attendanceDate > date.today():
        raise HTTPException(400, "لا يمكن تسجيل الحضور لتاريخ مستقبلي")
    date_value = body.attendanceDate.isoformat()
    students = await db.students.find(
        {
            "currentClassId": class_id,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1},
    ).to_list(5000)
    submitted = [record.studentId for record in body.records]
    if len(submitted) != len(set(submitted)):
        raise HTTPException(400, "لا يمكن تسجيل الطالب أكثر من مرة")
    students_by_id = {student["id"]: student for student in students}
    if set(submitted) != set(students_by_id):
        raise HTTPException(400, "يجب تحديد حالة الحضور لكل طالب نشط في الصف")

    for record in body.records:
        if record.status == "absent" and not record.absenceReason:
            raise HTTPException(400, "يرجى تحديد ما إذا كان الغياب بعذر أو دون عذر")
        if record.status != "present" and record.lateMinutes is not None:
            raise HTTPException(400, "لا يمكن تسجيل مدة تأخر إلا للطالب الحاضر")
        if record.status != "absent" and record.absenceReason is not None:
            raise HTTPException(400, "سبب الغياب متاح للطالب الغائب فقط")
        if record.status == "early_dismissal" and not (
            (record.earlyDismissalReason or "").strip()
            and record.earlyDismissalRelation
            and (record.earlyDismissalBy or "").strip()
        ):
            raise HTTPException(
                400,
                "يرجى إدخال سبب الانصراف المبكر واسم المستلم وصفته",
            )

    records_by_id = {record.studentId: record for record in body.records}
    timestamp = now_iso()
    session_records = [
        {
            "studentId": student_id,
            "studentName": (student.get("student") or {}).get("fullName") or "—",
            "studentCode": student.get("code") or "",
            "status": records_by_id[student_id].status,
            "absenceReason": (
                records_by_id[student_id].absenceReason
                if records_by_id[student_id].status == "absent"
                else None
            ),
            "lateMinutes": records_by_id[student_id].lateMinutes,
            "earlyDismissalReason": (
                records_by_id[student_id].earlyDismissalReason.strip()
                if records_by_id[student_id].status == "early_dismissal"
                and records_by_id[student_id].earlyDismissalReason
                else None
            ),
            "earlyDismissalRelation": (
                records_by_id[student_id].earlyDismissalRelation
                if records_by_id[student_id].status == "early_dismissal"
                else None
            ),
            "earlyDismissalBy": (
                records_by_id[student_id].earlyDismissalBy.strip()
                if records_by_id[student_id].status == "early_dismissal"
                and records_by_id[student_id].earlyDismissalBy
                else None
            ),
        }
        for student_id, student in students_by_id.items()
    ]
    await db.attendance_sessions.update_one(
        {"classId": class_id, "attendanceDate": date_value},
        {
            "$set": {
                "className": class_doc["name"],
                "records": session_records,
                "markedBy": current["id"],
                "markedAt": timestamp,
                "updatedAt": timestamp,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "createdAt": timestamp,
            },
        },
        upsert=True,
    )
    return {
        "ok": True,
        "classId": class_id,
        "attendanceDate": date_value,
        "total": len(session_records),
        "absent": sum(
            record["status"] in ("absent", "truancy") for record in session_records
        ),
        "earlyDismissal": sum(
            record["status"] == "early_dismissal" for record in session_records
        ),
        "truancy": sum(record["status"] == "truancy" for record in session_records),
        "markedAt": timestamp,
    }


@router.get("/attendance/reports")
async def repeated_absence_reports(
    class_id: Optional[str] = Query(default=None, alias="classId"),
    date_from: Optional[date] = Query(default=None, alias="dateFrom"),
    date_to: Optional[date] = Query(default=None, alias="dateTo"),
    current=Depends(require_permission("attendance.reports.view")),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "نطاق التاريخ غير صالح")
    reports = await _repeated_absence_reports(current, class_id, date_from, date_to)
    return {
        "threshold": ATTENDANCE_REPEAT_ABSENCE_THRESHOLD,
        "count": len(reports),
        "reports": reports,
    }
