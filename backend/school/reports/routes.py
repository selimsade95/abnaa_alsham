import uuid

from fastapi import APIRouter, Body, Depends, HTTPException

from school.core.database import db
from school.core.services import allowed_class_ids, now_iso, require_permission
from school.payments.fees import _fee_payables


router = APIRouter()


@router.get("/reports/overview")
async def reports_overview(current=Depends(require_permission("reports.view"))):
    allowed = await allowed_class_ids(current)
    student_query = {}
    if allowed is not None:
        student_query["currentClassId"] = {"$in": allowed}
    students = await db.students.find(
        student_query,
        {
            "_id": 0,
            "id": 1,
            "code": 1,
            "student": 1,
            "fees": 1,
            "currentClassId": 1,
            "deactivationReason": 1,
        },
    ).to_list(None)
    student_ids = [student.get("id") for student in students if student.get("id")]
    class_query = {}
    if allowed is not None:
        class_query["id"] = {"$in": allowed}
    classes = await db.classes.find(
        class_query,
        {"_id": 0, "id": 1, "grade": 1, "name": 1, "status": 1},
    ).to_list(None)
    classes_by_id = {item["id"]: item for item in classes}

    def grade_for(student):
        class_info = classes_by_id.get(student.get("currentClassId"), {})
        student_info = student.get("student") or {}
        return class_info.get("grade") or student_info.get("newClass") or "__unspecified__"

    payments = await db.payments.find(
        {"student": {"$in": student_ids}} if student_ids else {"student": {"$in": []}},
        {
            "_id": 0,
            "student": 1,
            "academicYear": 1,
            "feeType": 1,
            "semester": 1,
            "amount": 1,
            "paymentDate": 1,
        },
    ).to_list(None)
    payments_by_student_year = {}
    monthly = {}
    for payment in payments:
        student_id = payment.get("student")
        year = payment.get("academicYear") or ""
        fee_type = payment.get("feeType") or "academic"
        amount = float(payment.get("amount") or 0)
        key = (student_id, year)
        totals = payments_by_student_year.setdefault(
            key, {"academic": 0.0, "transportation": 0.0, "books": 0.0, "outfit": 0.0},
        )
        if fee_type in ("academic", "transportation", "books", "outfit"):
            totals[fee_type] += amount
        date_value = payment.get("paymentDate") or ""
        month_key = date_value[:7] if len(date_value) >= 7 else "__unknown__"
        month_totals = monthly.setdefault(
            month_key, {"month": month_key, "total": 0.0, "transportation": 0.0},
        )
        month_totals["total"] += amount
        if fee_type == "transportation":
            month_totals["transportation"] += amount

    registered = len(students)
    active_students = [
        student for student in students
        if (student.get("student") or {}).get("status") != "inactive"
    ]
    inactive_students = [
        student for student in students
        if (student.get("student") or {}).get("status") == "inactive"
    ]
    orphan_students = [
        student for student in active_students
        if (student.get("student") or {}).get("finalRegistrationPath") == "الايتام"
    ]
    orphan_student_ids = [student.get("id") for student in orphan_students]
    sponsorship_records = await db.sponsorships.find(
        {"studentId": {"$in": orphan_student_ids}} if orphan_student_ids else {"studentId": {"$in": []}},
        {"_id": 0, "id": 1, "studentId": 1, "donorName": 1},
    ).to_list(None)
    sponsorship_by_student = {
        record.get("studentId"): record for record in sponsorship_records
    }
    by_grade = {}
    by_gender = {}
    by_path = {}
    financial_by_grade = {}
    annual_amount_by_grade = {}
    required_installments_by_grade = {}
    discount_rows = []
    annual_amounts = []
    student_financial_rows = []
    withdrawn_rows = []
    installment_students = []
    sponsorship_rows = []
    sponsorship_by_class = {}
    total_financial = {"payable": 0.0, "collected": 0.0, "remaining": 0.0}
    transport_financial = {"payable": 0.0, "collected": 0.0, "remaining": 0.0}
    installments = {
        "annualPayable": 0.0,
        "firstSemesterPayable": 0.0,
        "secondSemesterPayable": 0.0,
        "firstSemesterPaid": 0.0,
        "secondSemesterPaid": 0.0,
        "firstSemesterRemaining": 0.0,
        "secondSemesterRemaining": 0.0,
    }

    for student in students:
        student_info = student.get("student") or {}
        fees = student.get("fees") or {}
        student_id = student.get("id")
        year = fees.get("academicYear") or ""
        paid = payments_by_student_year.get((student_id, year), {})
        grade = grade_for(student)
        path = (
            student_info.get("finalRegistrationPath")
            or student_info.get("registrationPath")
            or "__unspecified__"
        )
        is_inactive = student_info.get("status") == "inactive"

        if not is_inactive:
            by_grade[grade] = by_grade.get(grade, 0) + 1
            gender = student_info.get("gender") or "__unspecified__"
            by_gender[gender] = by_gender.get(gender, 0) + 1
            by_path[path] = by_path.get(path, 0) + 1

        fee_payables = _fee_payables(fees)
        academic_payable = fee_payables["academic"]
        bus_payable = fee_payables["transportation"]
        if not is_inactive:
            academic_collected = paid.get("academic", 0.0)
            bus_collected = paid.get("transportation", 0.0)
            bus_applicable = bool(
                fees.get("busRegistered", bus_payable > 0)
            )
            total_student_payable = academic_payable + bus_payable
            total_student_collected = academic_collected + bus_collected
            student_financial_rows.append({
                "studentId": student_id,
                "name": student_info.get("fullName") or student.get("code") or "",
                "grade": grade,
                "payable": total_student_payable,
                "paid": total_student_collected,
                "remaining": max(0.0, academic_payable - academic_collected)
                + max(0.0, bus_payable - bus_collected),
                "academicPayable": academic_payable,
                "academicPaid": academic_collected,
                "academicRemaining": max(0.0, academic_payable - academic_collected),
                "busPayable": bus_payable,
                "busPaid": bus_collected,
                "busRemaining": max(0.0, bus_payable - bus_collected),
                "busApplicable": bus_applicable,
            })
            total_payable = sum(fee_payables.values())
            total_collected_for_student = sum(
                paid.get(fee_type, 0.0)
                for fee_type in ("academic", "transportation", "books", "outfit")
            )
            total_financial["payable"] += total_payable
            total_financial["collected"] += total_collected_for_student
            transport_financial["payable"] += bus_payable
            transport_financial["collected"] += bus_collected

            grade_finance = financial_by_grade.setdefault(
                grade, {"grade": grade, "students": 0, "payable": 0.0,
                        "collected": 0.0, "remaining": 0.0},
            )
            grade_finance["students"] += 1
            grade_finance["payable"] += total_payable
            grade_finance["collected"] += total_collected_for_student

            if academic_payable > 0:
                annual_amounts.append({
                    "studentId": student_id,
                    "name": student_info.get("fullName") or student.get("code") or "",
                    "grade": grade,
                    "annualAmount": academic_payable,
                })
                annual_grade = annual_amount_by_grade.setdefault(
                    grade, {"grade": grade, "students": 0, "total": 0.0},
                )
                annual_grade["students"] += 1
                annual_grade["total"] += academic_payable

                semester_amount = academic_payable / 2
                academic_collected = max(0.0, paid.get("academic", 0.0))
                first_semester_paid = min(academic_collected, semester_amount)
                second_semester_paid = min(
                    max(0.0, academic_collected - semester_amount),
                    semester_amount,
                )
                first_semester_remaining = max(
                    0.0, semester_amount - first_semester_paid
                )
                second_semester_remaining = max(
                    0.0, semester_amount - second_semester_paid
                )
                installments["annualPayable"] += academic_payable
                installments["firstSemesterPayable"] += semester_amount
                installments["secondSemesterPayable"] += semester_amount
                installments["firstSemesterPaid"] += first_semester_paid
                installments["secondSemesterPaid"] += second_semester_paid
                installments["firstSemesterRemaining"] += first_semester_remaining
                installments["secondSemesterRemaining"] += second_semester_remaining
                if first_semester_remaining + second_semester_remaining > 0.0001:
                    installment_students.append({
                        "studentId": student_id,
                        "name": student_info.get("fullName") or student.get("code") or "",
                        "grade": grade,
                        "annualAmount": academic_payable,
                        "firstSemesterAmount": semester_amount,
                        "firstSemesterPaid": first_semester_paid,
                        "firstSemesterRemaining": first_semester_remaining,
                        "secondSemesterAmount": semester_amount,
                        "secondSemesterPaid": second_semester_paid,
                        "secondSemesterRemaining": second_semester_remaining,
                    })

                final_path = student_info.get("finalRegistrationPath") or ""
                if final_path != "الايتام" and academic_collected + 0.0001 < academic_payable:
                    grade_installments = required_installments_by_grade.setdefault(
                        grade, {"grade": grade, "students": 0},
                    )
                    grade_installments["students"] += 1

            has_split_discounts = (
                "generalDiscountPercentage" in fees
                or "siblingsStaffDiscountPercentage" in fees
            )
            first_discount_percentage = float(
                (
                    fees.get("generalDiscountPercentage")
                    if has_split_discounts
                    else fees.get("discountPercentage")
                )
                or 0
            )
            second_discount_percentage = float(
                fees.get("siblingsStaffDiscountPercentage") or 0
            ) if has_split_discounts else 0.0
            if bool(fees.get("discountEnabled")) and (
                first_discount_percentage > 0 or second_discount_percentage > 0
            ):
                annual_before_discount = float(fees.get("totalPayable") or 0)
                after_first_discount = annual_before_discount * (
                    1 - first_discount_percentage / 100
                )
                discount_rows.append({
                    "studentId": student_id,
                    "name": student_info.get("fullName") or student.get("code") or "",
                    "grade": grade,
                    "annualBeforeDiscount": annual_before_discount,
                    "firstDiscountName": (
                        fees.get("generalDiscountName")
                        or (fees.get("discountName") if not has_split_discounts else "")
                        or ""
                    ),
                    "firstDiscountPercentage": first_discount_percentage,
                    "valueAfterFirstDiscount": after_first_discount,
                    "secondDiscountName": fees.get("siblingsStaffDiscountName") or "",
                    "secondDiscountPercentage": second_discount_percentage,
                    "valueAfterSecondDiscount": academic_payable,
                })

        if not is_inactive and student_info.get("finalRegistrationPath") == "الايتام":
            class_info = classes_by_id.get(student.get("currentClassId"), {})
            total_payable_for_orphan = sum(fee_payables.values())
            total_collected_for_orphan = sum(
                paid.get(fee_type, 0.0)
                for fee_type in ("academic", "transportation", "books", "outfit")
            )
            sponsorship = sponsorship_by_student.get(student_id) or {}
            class_name = class_info.get("name") or grade
            sponsorship_rows.append({
                "id": sponsorship.get("id") or student_id,
                "studentId": student_id,
                "studentName": student_info.get("fullName") or student.get("code") or "",
                "classId": student.get("currentClassId") or "",
                "className": class_name,
                "grade": grade,
                "donorName": sponsorship.get("donorName") or "",
                "payable": total_payable_for_orphan,
                "collected": total_collected_for_orphan,
                "remaining": max(0.0, total_payable_for_orphan - total_collected_for_orphan),
            })
            class_totals = sponsorship_by_class.setdefault(
                student.get("currentClassId") or grade,
                {"classId": student.get("currentClassId") or "", "className": class_name,
                 "grade": grade, "students": 0, "payable": 0.0, "collected": 0.0,
                 "remaining": 0.0},
            )
            class_totals["students"] += 1
            class_totals["payable"] += total_payable_for_orphan
            class_totals["collected"] += total_collected_for_orphan

        if is_inactive:
            academic_collected = paid.get("academic", 0.0)
            bus_collected = paid.get("transportation", 0.0)
            withdrawn_rows.append({
                "studentId": student_id,
                "name": student_info.get("fullName") or student.get("code") or "",
                "grade": grade,
                "reason": student.get("deactivationReason") or "",
                "payable": sum(fee_payables.values()),
                "collected": sum(
                    paid.get(fee_type, 0.0)
                    for fee_type in ("academic", "transportation", "books", "outfit")
                ),
                "remaining": max(
                    0.0,
                    sum(fee_payables.values()) - sum(
                        paid.get(fee_type, 0.0)
                        for fee_type in ("academic", "transportation", "books", "outfit")
                    ),
                ),
            })

    for grade_finance in financial_by_grade.values():
        grade_finance["remaining"] = max(
            0.0, grade_finance["payable"] - grade_finance["collected"]
        )
    total_financial["remaining"] = max(
        0.0, total_financial["payable"] - total_financial["collected"]
    )
    transport_financial["remaining"] = max(
        0.0, transport_financial["payable"] - transport_financial["collected"]
    )
    installments["firstSemesterRemaining"] = max(
        0.0, installments["firstSemesterPayable"] - installments["firstSemesterPaid"]
    )
    installments["secondSemesterRemaining"] = max(
        0.0, installments["secondSemesterPayable"] - installments["secondSemesterPaid"]
    )
    for row in sponsorship_by_class.values():
        row["remaining"] = max(0.0, row["payable"] - row["collected"])
    for row in annual_amount_by_grade.values():
        row["averagePerStudent"] = row["total"] / row["students"] if row["students"] else 0

    return {
        "counts": {
            "registered": registered,
            "active": len(active_students),
            "inactive": len(inactive_students),
        },
        "distributions": {
            "byGrade": [
                {"grade": grade, "students": count}
                for grade, count in sorted(by_grade.items(), key=lambda item: item[0])
            ],
            "byGender": [
                {"gender": gender, "students": count}
                for gender, count in sorted(by_gender.items())
            ],
            "byPath": [
                {"path": path, "students": count}
                for path, count in sorted(by_path.items(), key=lambda item: item[0])
            ],
        },
        "classes": sorted(
            [
                {"id": class_id, "name": item.get("name") or "", "grade": item.get("grade") or ""}
                for class_id, item in classes_by_id.items()
                if item.get("status") != "inactive"
            ],
            key=lambda item: (item["grade"], item["name"]),
        ),
        "financial": {
            "byGrade": sorted(financial_by_grade.values(), key=lambda item: item["grade"]),
            "total": total_financial,
            "studentSummary": sorted(
                student_financial_rows,
                key=lambda item: (item["grade"], item["name"]),
            ),
            "transportation": transport_financial,
            "monthly": sorted(monthly.values(), key=lambda item: item["month"]),
            "sponsorshipAvailable": True,
            "sponsorship": sponsorship_rows,
            "sponsorshipByClass": sorted(
                sponsorship_by_class.values(),
                key=lambda item: (item["grade"], item["className"]),
            ),
            "orphanStudents": [
                {
                    "studentId": row["studentId"],
                    "name": row["studentName"],
                    "className": row["className"],
                    "grade": row["grade"],
                }
                for row in sponsorship_rows
            ],
            "withdrawnStudents": withdrawn_rows,
            "installments": installments,
            "installmentStudents": sorted(
                installment_students, key=lambda item: (item["grade"], item["name"])
            ),
            "installmentScheduleAvailable": False,
            "requiredInstallmentsByGrade": sorted(
                required_installments_by_grade.values(), key=lambda item: item["grade"]
            ),
            "annualAmountByGrade": sorted(
                annual_amount_by_grade.values(), key=lambda item: item["grade"]
            ),
            "annualAmounts": annual_amounts,
            "discounts": discount_rows,
        },
    }


@router.put("/reports/sponsorship")
async def save_report_sponsorship(
    body: dict = Body(...),
    current=Depends(require_permission("reports.view")),
):
    student_id = str(body.get("studentId") or "").strip()
    donor_name = str(body.get("donorName") or "").strip()
    if not student_id or not donor_name:
        raise HTTPException(400, "يجب تحديد الطالب واسم الجهة الداعمة أو المتبرع")
    if len(donor_name) > 160:
        raise HTTPException(400, "اسم الجهة الداعمة أو المتبرع طويل جداً")
    student = await db.students.find_one(
        {"id": student_id},
        {"_id": 0, "id": 1, "student.finalRegistrationPath": 1, "currentClassId": 1},
    )
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    allowed = await allowed_class_ids(current)
    if allowed is not None and student.get("currentClassId") not in allowed:
        raise HTTPException(404, "الطالب غير موجود")
    if (student.get("student") or {}).get("finalRegistrationPath") != "الايتام":
        raise HTTPException(400, "يمكن إسناد الجهة الداعمة لطلاب مسار الايتام فقط")

    existing = await db.sponsorships.find_one(
        {"studentId": student_id}, {"_id": 0, "id": 1}
    )
    sponsorship = {
        "id": (existing or {}).get("id") or str(uuid.uuid4()),
        "studentId": student_id,
        "donorName": donor_name,
        "updatedAt": now_iso(),
    }
    await db.sponsorships.update_one(
        {"studentId": student_id}, {"$set": sponsorship}, upsert=True
    )
    return {"ok": True, "sponsorship": sponsorship}
