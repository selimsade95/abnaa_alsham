import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from school.core.database import db
from school.core.services import allowed_class_ids, require_permission
from school.payments.fees import _fee_payables, FEE_TYPE_FIELDS


router = APIRouter()


@router.get("/reports/finance")
async def financial_reports(
    date_from: Optional[date] = Query(default=None, alias="dateFrom"),
    date_to: Optional[date] = Query(default=None, alias="dateTo"),
    month: Optional[str] = None,
    payment_type: str = Query(default="all", alias="paymentType"),
    course: Optional[str] = None,
    class_id: Optional[str] = Query(default=None, alias="classId"),
    current=Depends(require_permission("reports.view")),
):
    allowed = await allowed_class_ids(current)
    if payment_type not in ("all", *FEE_TYPE_FIELDS.keys()):
        raise HTTPException(400, "نوع الدفع غير صالح")

    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية")

    month_start = None
    month_end = None
    if month:
        try:
            month_dt = datetime.strptime(month, "%Y-%m")
            month_start = month_dt.date()
            month_end = (month_dt.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "شهر التقرير غير صالح")
        date_from = month_start if not date_from else date_from
        date_to = month_end if not date_to else min(date_to, month_end)

    query = {}
    if allowed is not None:
        if class_id and class_id not in allowed:
            raise HTTPException(403, "لا تملك صلاحية الوصول إلى هذا الصف")
        query["currentClassId"] = {"$in": [class_id] if class_id else allowed}
    elif class_id:
        query["currentClassId"] = class_id
    if course:
        query["$or"] = [
            {"student.registrationPath": course},
            {"student.finalRegistrationPath": course},
            {"student.registrationPath": {"$regex": f"^{re.escape(course)}$", "$options": "i"}},
        ]
    students = await db.students.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "code": 1,
            "student": 1,
            "fees": 1,
            "currentClassId": 1,
        },
    ).to_list(None)

    student_by_id = {student["id"]: student for student in students}
    student_ids = list(student_by_id.keys())
    class_names = {}
    if class_id:
        class_info = await db.classes.find_one(
            {"id": class_id}, {"_id": 0, "name": 1}
        )
        if class_info:
            class_names[class_id] = class_info.get("name") or ""
    fee_types = [payment_type] if payment_type != "all" else list(FEE_TYPE_FIELDS.keys())

    payment_filter = {}
    if date_from:
        payment_filter["paymentDate"] = {"$gte": date_from.isoformat()}
    if date_to:
        payment_filter["paymentDate"] = {**payment_filter.get("paymentDate", {}), "$lte": date_to.isoformat()}
    if student_ids:
        payment_filter["student"] = {"$in": student_ids}
    if payment_type != "all":
        payment_filter["feeType"] = payment_type
    payments = await db.payments.find(payment_filter, {"_id": 0, "student": 1, "amount": 1, "feeType": 1, "paymentDate": 1}).to_list(None)

    payment_totals_by_student = {sid: {fee: 0.0 for fee in fee_types} for sid in student_ids}
    for payment in payments:
        sid = payment.get("student")
        fee_type = payment.get("feeType") or "academic"
        if sid not in payment_totals_by_student:
            continue
        if payment_type == "all":
            if fee_type in FEE_TYPE_FIELDS:
                payment_totals_by_student[sid][fee_type] = payment_totals_by_student[sid].get(fee_type, 0.0) + float(payment.get("amount") or 0)
        else:
            payment_totals_by_student[sid][payment_type] = payment_totals_by_student[sid].get(payment_type, 0.0) + float(payment.get("amount") or 0)

    summary = {
        "totalStudents": len(student_ids),
        "paid": 0,
        "partial": 0,
        "unpaid": 0,
        "dropped": sum(
            (student.get("student") or {}).get("status") == "inactive"
            for student in students
        ),
        "totalPayable": 0.0,
        "totalCollected": 0.0,
        "totalRemaining": 0.0,
    }
    by_course = {}
    student_details = []

    for student in students:
        student_data = student.get("student") or {}
        course_name = student_data.get("finalRegistrationPath") or student_data.get("registrationPath") or "غير محدد"
        if course and course_name.lower() != course.lower():
            continue

        student_id = student.get("id")
        collected_for_student = (
            sum(payment_totals_by_student.get(student_id, {}).values())
            if payment_type == "all"
            else payment_totals_by_student.get(student_id, {}).get(payment_type, 0.0)
        )
        summary["totalCollected"] += collected_for_student
        course_entry = by_course.setdefault(course_name, {
            "course": course_name,
            "payable": 0.0,
            "collected": 0.0,
            "remaining": 0.0,
            "paidStudents": 0,
            "partialStudents": 0,
            "unpaidStudents": 0,
        })
        course_entry["collected"] += collected_for_student
        if student_data.get("status") == "inactive":
            continue

        payable_by_type = {fee: 0.0 for fee in fee_types}
        if payment_type == "all":
            for fee_type, field_name in FEE_TYPE_FIELDS.items():
                fees = student.get("fees") or {}
                value = 0.0
                if fee_type == "academic":
                    value = _fee_payables(fees).get("academic", 0.0)
                elif fee_type == "transportation":
                    value = float(fees.get("busFee") or 0) if bool(fees.get("busRegistered", float(fees.get("busFee") or 0) > 0)) else 0.0
                elif fee_type == "books":
                    value = float(fees.get("booksFee") or 0)
                elif fee_type == "outfit":
                    value = float(fees.get("outfitFee") or 0)
                payable_by_type[fee_type] = value
                summary["totalPayable"] += value
        else:
            fees = student.get("fees") or {}
            if payment_type == "academic":
                payable = _fee_payables(fees).get("academic", 0.0)
            elif payment_type == "transportation":
                payable = float(fees.get("busFee") or 0) if bool(fees.get("busRegistered", float(fees.get("busFee") or 0) > 0)) else 0.0
            elif payment_type == "books":
                payable = float(fees.get("booksFee") or 0)
            elif payment_type == "outfit":
                payable = float(fees.get("outfitFee") or 0)
            else:
                payable = 0.0
            payable_by_type[payment_type] = payable
            summary["totalPayable"] += payable

        payable_total = sum(payable_by_type.values())
        if payable_total > 0:
            if collected_for_student >= payable_total:
                summary["paid"] += 1
            elif collected_for_student > 0:
                summary["partial"] += 1
            else:
                summary["unpaid"] += 1
        else:
            if collected_for_student > 0:
                summary["paid"] += 1
            else:
                summary["unpaid"] += 1

        course_entry["payable"] += payable_total
        course_entry["remaining"] = max(0, course_entry["payable"] - course_entry["collected"])
        if class_id:
            student_details.append(
                {
                    "studentId": student_id,
                    "code": student.get("code") or "",
                    "name": student_data.get("fullName") or "",
                    "className": class_names.get(student.get("currentClassId"), ""),
                    "payable": payable_total,
                    "collected": collected_for_student,
                    "remaining": max(0.0, payable_total - collected_for_student),
                }
            )
        if payable_total > 0:
            if collected_for_student >= payable_total:
                course_entry["paidStudents"] += 1
            elif collected_for_student > 0:
                course_entry["partialStudents"] += 1
            else:
                course_entry["unpaidStudents"] += 1
        else:
            if collected_for_student > 0:
                course_entry["paidStudents"] += 1
            else:
                course_entry["unpaidStudents"] += 1

    summary["totalRemaining"] = max(0.0, summary["totalPayable"] - summary["totalCollected"])
    per_course = sorted(by_course.values(), key=lambda entry: entry["payable"], reverse=True)
    return {
        "period": {
            "month": month,
            "dateFrom": date_from.isoformat() if date_from else None,
            "dateTo": date_to.isoformat() if date_to else None,
            "paymentType": payment_type,
        },
        "summary": summary,
        "byCourse": per_course,
        "studentDetails": student_details,
    }
