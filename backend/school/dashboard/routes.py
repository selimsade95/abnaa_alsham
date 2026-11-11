from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from school.attendance.services import (
    _attendance_class_scope,
    _repeated_absence_reports,
    ATTENDANCE_REPEAT_ABSENCE_THRESHOLD,
)
from school.core.database import db
from school.core.services import allowed_class_ids, ensure_class_access, get_current_user
from school.payments.fees import _fee_payables
from school.settings.services import get_registration_paths


router = APIRouter()


@router.get("/dashboard/stats")
async def dashboard_stats(
    student_status: str = Query(default="active", alias="studentStatus"),
    include_dropped: bool = Query(default=False, alias="includeDropped"),
    class_id: Optional[str] = Query(default=None, alias="classId"),
    academic_year: Optional[str] = Query(default=None, alias="academicYear"),
    gender: Optional[str] = None,
    final_registration_path: Optional[str] = Query(
        default=None, alias="finalRegistrationPath"
    ),
    current=Depends(get_current_user),
):
    if student_status not in ("active", "dropped", "all"):
        raise HTTPException(400, "حالة الطلاب غير صالحة")
    if gender not in (None, "", "male", "female"):
        raise HTTPException(400, "الجنس غير صالح")
    allowed = await allowed_class_ids(current)
    if class_id:
        await ensure_class_access(class_id, current)
    class_query = {"status": {"$ne": "inactive"}}
    if allowed is not None:
        class_query["id"] = {"$in": allowed}
    if class_id:
        class_query["id"] = class_id
    if academic_year:
        class_query["academicYear"] = academic_year
    filtered_classes = await db.classes.find(
        class_query, {"_id": 0, "id": 1, "academicYear": 1}
    ).to_list(5000)
    filtered_class_ids = [item["id"] for item in filtered_classes]

    student_query = {}
    if allowed is not None or class_id or academic_year:
        student_query["currentClassId"] = {"$in": filtered_class_ids}
    if academic_year:
        student_query["fees.academicYear"] = academic_year
    if gender:
        student_query["student.gender"] = gender
    teachers_count = await db.teachers.count_documents({} if allowed is None else {"id": current.get("teacherId")})
    classes_count = len(filtered_classes) if (allowed is not None or class_id or academic_year) else await db.classes.count_documents({})

    path_students = await db.students.find(
        student_query,
        {"_id": 0, "id": 1, "student": 1, "fees": 1, "currentClassId": 1},
    ).to_list(None)
    if final_registration_path:
        path_students = [
            student
            for student in path_students
            if (
                (student.get("student") or {}).get("finalRegistrationPath")
                or (student.get("student") or {}).get("registrationPath")
                or "غير محدد"
            )
            == final_registration_path
        ]
    filtered_student_ids = {student["id"] for student in path_students}
    student_class_ids = {
        student["currentClassId"]
        for student in path_students
        if student.get("currentClassId")
    }
    status_students = [
        student
        for student in path_students
        if student_status == "all"
        or (
            student_status == "dropped"
            and (student.get("student") or {}).get("status") == "inactive"
        )
        or (
            student_status == "active"
            and (student.get("student") or {}).get("status") != "inactive"
        )
    ]
    total = len(status_students)
    female = sum(
        (student.get("student") or {}).get("gender") == "female"
        for student in status_students
    )
    male = sum(
        (student.get("student") or {}).get("gender") == "male"
        for student in status_students
    )
    orphans = sum(
        (student.get("student") or {}).get("orphan") is True
        for student in status_students
    )
    active = sum(
        (student.get("student") or {}).get("status") != "inactive"
        for student in path_students
    )
    dropped = sum(
        (student.get("student") or {}).get("status") == "inactive"
        for student in path_students
    )
    registration_paths = await get_registration_paths()
    path_stats = {
        path: {"path": path, "total": 0, "dropped": 0}
        for path in registration_paths
    }
    for student in path_students:
        student_data = student.get("student") or {}
        path = (
            student_data.get("finalRegistrationPath")
            or student_data.get("registrationPath")
            or "غير محدد"
        )
        if path not in path_stats:
            path_stats[path] = {"path": path, "total": 0, "dropped": 0}
        if student_data.get("status") == "inactive":
            path_stats[path]["dropped"] += 1
        else:
            path_stats[path]["total"] += 1

    if allowed is None:
        teacher_scope = {}
    else:
        teacher_scope = {"id": current.get("teacherId")}
    teacher_stats = {
        "total": teachers_count,
        "female": await db.teachers.count_documents({**teacher_scope, "gender": "female"}),
        "male": await db.teachers.count_documents({**teacher_scope, "gender": "male"}),
    }

    all_finance = {
        fee_type: {"payable": 0.0, "paid": 0.0, "remaining": 0.0}
        for fee_type in ("academic", "transportation")
    }
    path_finance = {}
    for path in path_stats:
        path_finance[path] = {
            fee_type: {"payable": 0.0, "paid": 0.0, "remaining": 0.0}
            for fee_type in ("academic", "transportation")
        }

    finance_students = {}
    for student in path_students:
        student_data = student.get("student") or {}
        is_dropped = student_data.get("status") == "inactive"
        path = (
            student_data.get("finalRegistrationPath")
            or student_data.get("registrationPath")
            or "غير محدد"
        )
        fees = student.get("fees") or {}
        fee_payables = _fee_payables(fees)
        finance_students[student["id"]] = {
            "path": path,
            "academicYear": fees.get("academicYear") or "",
        }
        if is_dropped and not include_dropped:
            continue
        for fee_type in ("academic", "transportation"):
            payable = fee_payables[fee_type]
            all_finance[fee_type]["payable"] += payable
            path_finance[path][fee_type]["payable"] += payable

    if finance_students:
        finance_payments = await db.payments.find(
            {"student": {"$in": list(finance_students)}},
            {"_id": 0, "student": 1, "academicYear": 1, "feeType": 1, "amount": 1},
        ).to_list(None)
        for payment in finance_payments:
            fee_type = payment.get("feeType") or "academic"
            student_id = payment.get("student")
            student_finance = finance_students.get(student_id)
            if (
                fee_type not in ("academic", "transportation")
                or student_finance is None
            ):
                continue
            if student_finance["academicYear"] and (
                payment.get("academicYear") or ""
            ) != student_finance["academicYear"]:
                continue
            amount = float(payment.get("amount") or 0)
            path = student_finance["path"]
            all_finance[fee_type]["paid"] += amount
            path_finance[path][fee_type]["paid"] += amount

    for group in (all_finance, *path_finance.values()):
        for totals in group.values():
            totals["remaining"] = max(0, totals["payable"] - totals["paid"])

    # Collections retain payments for dropped students; payables below exclude them.
    pay_agg = await db.payments.aggregate([
        {
            "$lookup": {
                "from": "students",
                "localField": "student",
                "foreignField": "id",
                "as": "student"
            }
        },
        {
            "$unwind": "$student"
        },
        {
            "$match": {
                **({} if allowed is None else {"student.currentClassId": {"$in": allowed}}),
                "student.id": {"$in": list(finance_students)},
            }
        },
        {
            "$group": {
                "_id": None,
                "sum": {"$sum": "$amount"}
            }
        }
    ]).to_list(1)

    total_collected = pay_agg[0]["sum"] if pay_agg else 0

    # Include dropped students' payable fees only when explicitly requested.
    stu_agg = await db.students.aggregate([
        {
            "$match": {
                **(
                    {}
                    if include_dropped
                    else {"student.status": {"$ne": "inactive"}}
                ),
                **({} if allowed is None else {"currentClassId": {"$in": allowed}}),
                "id": {"$in": list(finance_students)},
            }
        },
        {
            "$group": {
                "_id": None,
                "sum": {
                    "$sum": {
                        "$add": [
                            {
                                "$multiply": [
                                    {"$ifNull": ["$fees.totalPayable", 0]},
                                    {
                                        "$subtract": [
                                            1,
                                            {
                                                "$divide": [
                                                    {
                                                        "$cond": [
                                                            {
                                                                "$eq": [
                                                                    "$fees.discountEnabled",
                                                                    True,
                                                                ]
                                                            },
                                                            {
                                                                "$ifNull": [
                                                                    "$fees.generalDiscountPercentage",
                                                                    "$fees.discountPercentage",
                                                                ]
                                                            },
                                                            0,
                                                        ]
                                                    },
                                                    100,
                                                ]
                                            },
                                        ]
                                    },
                                    {
                                        "$subtract": [
                                            1,
                                            {
                                                "$divide": [
                                                    {
                                                        "$cond": [
                                                            {
                                                                "$eq": [
                                                                    "$fees.discountEnabled",
                                                                    True,
                                                                ]
                                                            },
                                                            {
                                                                "$ifNull": [
                                                                    "$fees.siblingsStaffDiscountPercentage",
                                                                    0,
                                                                ]
                                                            },
                                                            0,
                                                        ]
                                                    },
                                                    100,
                                                ]
                                            },
                                        ]
                                    },
                                ]
                            },
                            {"$ifNull": ["$fees.booksFee", 0]},
                            {"$ifNull": ["$fees.busFee", 0]},
                            {"$ifNull": ["$fees.outfitFee", 0]},
                        ]
                    }
                },
                "books": {"$sum": {"$ifNull": ["$fees.booksFee", 0]}},
                "bus": {"$sum": {"$ifNull": ["$fees.busFee", 0]}},
                "outfit": {"$sum": {"$ifNull": ["$fees.outfitFee", 0]}},
            }
        }
    ]).to_list(1)

    total_payable = stu_agg[0]["sum"] if stu_agg else 0
    total_books_fee = stu_agg[0].get("books", 0) if stu_agg else 0
    total_bus_fee = stu_agg[0].get("bus", 0) if stu_agg else 0
    total_outfit_fee = stu_agg[0].get("outfit", 0) if stu_agg else 0

    result = {
        "total": total,
        "female": female,
        "male": male,
        "orphans": orphans,
        "dropped":dropped,
        "active":active,
        "teachers": teachers_count,
        "teacherStats": teacher_stats,
        "studentPaths": list(path_stats.values()),
        "finance": {
            "all": all_finance,
            "byPath": [
                {"path": path, **path_finance[path]}
                for path in path_stats
            ],
        },
        "classes": classes_count,
        "totalPayable": total_payable,
        "totalBooksFee": total_books_fee,
        "totalBusFee": total_bus_fee,
        "totalOutfitFee": total_outfit_fee,
        "totalCollected": total_collected,
        "totalRemaining": max(
            0,
            (total_payable or 0) - (total_collected or 0)
        )
    }
    permissions = current.get("permissions") or []
    if "attendance.view" in permissions or "attendance.manage" in permissions:
        today = datetime.now().date().isoformat()
        attendance_scope = await _attendance_class_scope(current)
        session_query = {"attendanceDate": today}
        if class_id:
            session_query["classId"] = class_id
        elif (
            academic_year
            or allowed is not None
            or gender
            or final_registration_path
        ):
            target_class_ids = (
                set(filtered_class_ids)
                if academic_year or allowed is not None
                else student_class_ids
            )
            if gender or final_registration_path:
                target_class_ids.intersection_update(student_class_ids)
            session_query["classId"] = {"$in": list(target_class_ids)}
        elif attendance_scope is not None:
            session_query["classId"] = attendance_scope["id"]
        sessions = await db.attendance_sessions.find(
            session_query, {"_id": 0, "records": 1}
        ).to_list(5000)
        if gender or final_registration_path:
            sessions = [
                {
                    **session,
                    "records": [
                        record
                        for record in session.get("records", [])
                        if record.get("studentId") in filtered_student_ids
                    ],
                }
                for session in sessions
            ]
            sessions = [session for session in sessions if session["records"]]
        attendance_counts = [
            record
            for session in sessions
            for record in session.get("records", [])
        ]
        marked_classes = len(sessions)
        active_classes_filter = {**(attendance_scope or {}), "status": {"$ne": "inactive"}}
        if class_id:
            active_classes_filter["id"] = class_id
        elif (
            academic_year
            or allowed is not None
            or gender
            or final_registration_path
        ):
            target_class_ids = (
                set(filtered_class_ids)
                if academic_year or allowed is not None
                else student_class_ids
            )
            if gender or final_registration_path:
                target_class_ids.intersection_update(student_class_ids)
            active_classes_filter["id"] = {"$in": list(target_class_ids)}
        active_classes = await db.classes.count_documents(active_classes_filter)
        present_count = sum(
            record.get("status") in ("present", "early_dismissal")
            for record in attendance_counts
        )
        absent_count = sum(
            record.get("status") in ("absent", "truancy")
            for record in attendance_counts
        )
        early_dismissal_count = sum(
            record.get("status") == "early_dismissal"
            for record in attendance_counts
        )
        truancy_count = sum(
            record.get("status") == "truancy" for record in attendance_counts
        )
        late_count = sum(
            record.get("status") == "present" and record.get("lateMinutes") is not None
            for record in attendance_counts
        )
        result["attendance"] = {
            "date": today,
            "markedClasses": marked_classes,
            "totalClasses": active_classes,
            "present": present_count,
            "absent": absent_count,
            "earlyDismissal": early_dismissal_count,
            "truancy": truancy_count,
            "late": late_count,
            "markedStudents": present_count + absent_count,
            "attendanceRate": (
                round(present_count * 100 / (present_count + absent_count), 1)
                if present_count + absent_count else 0
            ),
        }
    if "attendance.reports.view" in permissions:
        reports = await _repeated_absence_reports(current, class_id=class_id)
        if academic_year or gender or final_registration_path:
            reports = [
                report
                for report in reports
                if report["studentId"] in filtered_student_ids
            ]
        if academic_year and not class_id:
            class_id_set = set(filtered_class_ids)
            filtered_reports = []
            for report in reports:
                absences = [
                    absence
                    for absence in report["absences"]
                    if absence["classId"] in class_id_set
                ]
                if len({absence["date"] for absence in absences}) >= ATTENDANCE_REPEAT_ABSENCE_THRESHOLD:
                    filtered_reports.append(report)
            reports = filtered_reports
        result["repeatedAbsenceReports"] = len(reports)
    return result
