from school.core.database import db
from school.core.services import allowed_class_ids, ensure_class_access


ATTENDANCE_REPEAT_ABSENCE_THRESHOLD = 3


async def _attendance_class_scope(current):
    allowed = await allowed_class_ids(current)
    if allowed is None:
        return None
    return {"id": {"$in": allowed}}


async def _repeated_absence_reports(current, class_id=None, date_from=None, date_to=None):
    class_scope = await _attendance_class_scope(current)
    query = {}
    if class_scope is not None:
        query["classId"] = class_scope["id"]
    if class_id:
        await ensure_class_access(class_id, current)
        query["classId"] = class_id
    if date_from or date_to:
        query["attendanceDate"] = {
            **({"$gte": date_from.isoformat()} if date_from else {}),
            **({"$lte": date_to.isoformat()} if date_to else {}),
        }

    sessions = await db.attendance_sessions.find(
        query,
        {"_id": 0, "classId": 1, "className": 1, "attendanceDate": 1, "records": 1},
    ).to_list(100000)
    by_student = {}
    for session in sessions:
        for record in session.get("records", []):
            if record.get("status") not in ("absent", "truancy"):
                continue
            student_id = record.get("studentId")
            if not student_id:
                continue
            report = by_student.setdefault(student_id, {
                "studentId": student_id,
                "studentName": record.get("studentName") or "—",
                "studentCode": record.get("studentCode") or "",
                "absenceDates": set(),
                "absences": [],
            })
            report["absenceDates"].add(session["attendanceDate"])
            report["absences"].append({
                "date": session["attendanceDate"],
                "classId": session["classId"],
                "className": session.get("className") or "—",
                "reason": record.get("absenceReason"),
                "status": record.get("status"),
            })

    reports = [
        report for report in by_student.values()
        if len(report["absenceDates"]) >= ATTENDANCE_REPEAT_ABSENCE_THRESHOLD
    ]
    for report in reports:
        report["absences"].sort(key=lambda absence: absence["date"])
        report["absenceCount"] = len(report["absenceDates"])
        report.pop("absenceDates")
        report["lastAbsenceDate"] = report["absences"][-1]["date"]
    return sorted(
        reports,
        key=lambda report: (-report["absenceCount"], report["studentName"].casefold()),
    )
