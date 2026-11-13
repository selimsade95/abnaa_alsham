from typing import Optional

from school.core.database import db
from school.payments.fees import (
    _discounted_payable,
    _fee_payables,
    _student_payment_totals,
    _student_totals_for_docs,
)


async def _augment_students(
    docs: list[dict],
    current=None,
    totals_by_student: Optional[dict] = None,
) -> list[dict]:
    if not docs:
        return docs
    if totals_by_student is None:
        totals_by_student = await _student_totals_for_docs(docs)
    class_ids = list(
        {doc["currentClassId"] for doc in docs if doc.get("currentClassId")}
    )
    classes = await db.classes.find(
        {"id": {"$in": class_ids}},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "grade": 1,
            "section": 1,
            "academicYear": 1,
            "teacherId": 1,
        },
    ).to_list(len(class_ids))
    classes_by_id = {class_doc["id"]: class_doc for class_doc in classes}
    teacher_ids = list(
        {
            class_doc["teacherId"]
            for class_doc in classes
            if class_doc.get("teacherId")
        }
    )
    teachers = await db.teachers.find(
        {"id": {"$in": teacher_ids}},
        {"_id": 0, "id": 1, "fullName": 1},
    ).to_list(len(teacher_ids))
    teachers_by_id = {teacher["id"]: teacher for teacher in teachers}

    for doc in docs:
        await _augment_student(
            doc,
            current,
            totals=totals_by_student[doc["id"]],
            class_doc=classes_by_id.get(doc.get("currentClassId")),
            teacher=teachers_by_id.get(
                classes_by_id.get(doc.get("currentClassId"), {}).get("teacherId")
            ),
            class_lookup_complete=True,
        )
    return docs


async def _augment_student(
    doc: dict,
    current=None,
    totals: Optional[dict] = None,
    class_doc: Optional[dict] = None,
    teacher: Optional[dict] = None,
    class_lookup_complete: bool = False,
) -> dict:
    permissions = set((current or {}).get("permissions") or [])
    for field, permission in (
        ("documents", "students.documents.view"),
        ("orphanDocument", "students.orphanDocument.view"),
    ):
        if permission not in permissions:
            doc.pop(field, None)
    for metadata in (doc.get("documents") or {}).values():
        metadata.pop("filePath", None)
    if doc.get("orphanDocument"):
        doc["orphanDocument"].pop("filePath", None)

    student = doc.setdefault("student", {})
    student.setdefault("finalRegistrationPath", student.get("registrationPath") or "")
    fees = doc.get("fees") or {}
    ay = fees.get("academicYear")
    total_payable, discount_percentage, discount_amount, net_payable = _discounted_payable(fees)
    discount_enabled = bool(fees.get("discountEnabled"))
    has_split_discounts = (
        "generalDiscountPercentage" in fees
        or "siblingsStaffDiscountPercentage" in fees
    )
    general_discount_percentage = (
        float(fees.get("generalDiscountPercentage") or 0)
        if has_split_discounts
        else (float(fees.get("discountPercentage") or 0) if discount_enabled else 0)
    )
    general_discount_name = fees.get("generalDiscountName") or (
        fees.get("discountName") or "" if not has_split_discounts else ""
    )
    books_fee = float(fees.get("booksFee") or 0)
    bus_registered = bool(fees.get("busRegistered", float(fees.get("busFee") or 0) > 0))
    bus_fee = float(fees.get("busFee") or 0) if bus_registered else 0
    outfit_fee = float(fees.get("outfitFee") or 0)
    if totals is None:
        totals = await _student_payment_totals(doc["id"], ay)
    payable_by_type = _fee_payables(fees)
    breakdown = {
        fee_type: {
            "payable": payable,
            "paid": totals["byFeeType"].get(fee_type, 0),
            "remaining": max(0, payable - totals["byFeeType"].get(fee_type, 0)),
        }
        for fee_type, payable in payable_by_type.items()
    }
    doc["fees"] = {"academicYear": ay, "totalPayable": total_payable,
                   "discountEnabled": discount_enabled,
                   "discountPercentage": discount_percentage,
                   "discountName": (fees.get("discountName") or ""),
                   "generalDiscountName": general_discount_name,
                   "generalDiscountPercentage": general_discount_percentage,
                   "siblingsStaffDiscountName": fees.get("siblingsStaffDiscountName") or "",
                   "siblingsStaffDiscountPercentage": float(fees.get("siblingsStaffDiscountPercentage") or 0),
                   "discountAmount": discount_amount, "netPayable": net_payable,
                   "booksFee": books_fee, "busFee": bus_fee, "busRegistered": bus_registered,
                   "outfitFee": outfit_fee, "byType": breakdown,
                   "overallPayable": net_payable + books_fee + bus_fee + outfit_fee,
                   "totalPaid": totals["totalPaid"],
                   "remaining": max(0, net_payable + books_fee + bus_fee + outfit_fee - totals["totalPaid"])}
    for field in ("classNotes", "nonClassNotes"):
        notes = doc.get(field) or []
        if not current or "students.notes.view" not in (current.get("permissions") or []):
            doc[field] = []
        elif current.get("teacherId"):
            doc[field] = [note for note in notes if note.get("authorId") == current.get("id")]
    if (
        not class_lookup_complete
        and class_doc is None
        and doc.get("currentClassId")
    ):
        class_doc = await db.classes.find_one(
            {"id": doc["currentClassId"]},
            {
                "_id": 0,
                "name": 1,
                "grade": 1,
                "section": 1,
                "academicYear": 1,
                "teacherId": 1,
            },
        )
        if class_doc and class_doc.get("teacherId"):
            teacher = await db.teachers.find_one(
                {"id": class_doc["teacherId"]}, {"_id": 0, "fullName": 1}
            )
    if class_doc:
        doc["currentClass"] = {
            "name": class_doc.get("name"),
            "grade": class_doc.get("grade"),
            "section": class_doc.get("section"),
            "academicYear": class_doc.get("academicYear"),
        }
        if class_doc.get("teacherId"):
            doc["currentTeacher"] = teacher.get("fullName") if teacher else None
    return doc


def _payment_status_query(status: str):
    return status  # handled in-memory after fetch to keep server simple
