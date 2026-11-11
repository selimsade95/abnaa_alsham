from typing import Optional

from fastapi import HTTPException

from school.core.database import db


# Refunds enter the ledger as negative payments. The sum already knows what to do.
async def _student_payment_totals(sid: str, ay: Optional[str] = None) -> dict:
    q = {"student": sid}
    if ay: q["academicYear"] = ay
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    totals_by_type = {fee_type: 0 for fee_type in ("academic", "transportation", "books", "outfit")}
    for payment in docs:
        fee_type = payment.get("feeType") or "academic"
        totals_by_type[fee_type] = totals_by_type.get(fee_type, 0) + float(payment.get("amount", 0))
    return {"totalPaid": sum(float(p.get("amount", 0)) for p in docs),
            "byFeeType": totals_by_type, "count": len(docs)}


def _payment_order_key(payment):
    return (payment.get("paymentDate") or "", payment.get("createdAt") or "", payment.get("id") or "")


async def _payment_snapshot(payment, payable):
    if payment.get("feeType") and "totalPaidAtPayment" in payment and "totalRemainingAtPayment" in payment:
        return float(payment["totalPaidAtPayment"]), float(payment["totalRemainingAtPayment"])
    docs = await db.payments.find(
        {"student": payment.get("student"), "academicYear": payment.get("academicYear")},
        {"_id": 0, "id": 1, "amount": 1, "feeType": 1, "paymentDate": 1, "createdAt": 1},
    ).to_list(1000)
    fee_type = payment.get("feeType") or "academic"
    cumulative = 0
    for doc in sorted(docs, key=_payment_order_key):
        if (doc.get("feeType") or "academic") != fee_type:
            continue
        cumulative += float(doc.get("amount", 0))
        if doc.get("id") == payment.get("id"):
            break
    return cumulative, max(0, payable - cumulative)


def _discounted_payable(fees):
    total_payable = float(fees.get("totalPayable") or 0)
    discount_enabled = bool(fees.get("discountEnabled"))
    has_split_discounts = (
        "generalDiscountPercentage" in fees
        or "siblingsStaffDiscountPercentage" in fees
    )
    if has_split_discounts:
        general_percentage = float(fees.get("generalDiscountPercentage") or 0)
        siblings_staff_percentage = float(
            fees.get("siblingsStaffDiscountPercentage") or 0
        )
    else:
        general_percentage = float(fees.get("discountPercentage") or 0)
        siblings_staff_percentage = 0

    subtotal = total_payable * (1 - general_percentage / 100)
    net_payable = subtotal * (1 - siblings_staff_percentage / 100)
    discount_amount = total_payable - net_payable if discount_enabled else 0
    discount_percentage = (
        discount_amount / total_payable * 100 if total_payable > 0 else 0
    )
    return total_payable, discount_percentage, discount_amount, max(0, net_payable)


FEE_TYPE_FIELDS = {
    "academic": "totalPayable",
    "transportation": "busFee",
    "books": "booksFee",
    "outfit": "outfitFee",
}


def _fee_payables(fees):
    bus_fee = float(fees.get("busFee") or 0)
    bus_registered = fees.get("busRegistered", bus_fee > 0)
    return {
        "academic": _discounted_payable(fees)[3],
        "transportation": bus_fee if bus_registered else 0,
        "books": float(fees.get("booksFee") or 0),
        "outfit": float(fees.get("outfitFee") or 0),
    }


def _clean_fee_type(fee_type):
    if fee_type not in FEE_TYPE_FIELDS:
        raise HTTPException(400, "نوع الرسوم غير صالح")
    return fee_type


def _normalize_student_fees(fees):
    legacy_discount_enabled = bool(fees.get("discountEnabled"))
    general_discount_percentage = float(
        fees.get(
            "generalDiscountPercentage",
            fees.get("discountPercentage") if legacy_discount_enabled else 0,
        )
        or 0
    )
    siblings_staff_discount_percentage = float(
        fees.get("siblingsStaffDiscountPercentage") or 0
    )
    if not 0 <= general_discount_percentage <= 100:
        raise HTTPException(400, "نسبة الخصم العام يجب أن تكون بين 0 و100")
    if not 0 <= siblings_staff_discount_percentage <= 100:
        raise HTTPException(400, "نسبة خصم الإخوة/الكادر يجب أن تكون بين 0 و100")
    general_discount_name = (
        fees.get("generalDiscountName")
        or (fees.get("discountName") if legacy_discount_enabled else "")
        or ""
    ).strip()
    siblings_staff_discount_name = (
        fees.get("siblingsStaffDiscountName") or ""
    ).strip()
    discount_enabled = (
        general_discount_percentage > 0 or siblings_staff_discount_percentage > 0
    )
    effective_discount_percentage = 100 * (
        1
        - (1 - general_discount_percentage / 100)
        * (1 - siblings_staff_discount_percentage / 100)
    )
    discount_name = " / ".join(
        name
        for name in (general_discount_name, siblings_staff_discount_name)
        if name
    )
    normalized = {
        "academicYear": fees.get("academicYear") or "",
        "totalPayable": float(fees.get("totalPayable") or 0),
        "discountEnabled": discount_enabled,
        "discountPercentage": effective_discount_percentage,
        "discountName": discount_name,
        "generalDiscountName": general_discount_name,
        "generalDiscountPercentage": general_discount_percentage,
        "siblingsStaffDiscountName": siblings_staff_discount_name,
        "siblingsStaffDiscountPercentage": siblings_staff_discount_percentage,
    }
    if normalized["totalPayable"] < 0:
        raise HTTPException(400, "الرسوم لا يمكن أن تكون سالبة")
    for field in ("booksFee", "busFee", "outfitFee"):
        value = float(fees.get(field) or 0)
        if value < 0:
            raise HTTPException(400, "الرسوم لا يمكن أن تكون سالبة")
        normalized[field] = value
    normalized["busRegistered"] = bool(fees.get("busRegistered", normalized["busFee"] > 0))
    if not normalized["busRegistered"]:
        normalized["busFee"] = 0
    return normalized


def _overall_student_payable(fees):
    return sum(_fee_payables(fees).values())


async def _student_totals_for_docs(docs: list[dict]) -> dict:
    student_ids = [doc["id"] for doc in docs]
    if not student_ids:
        return {}
    grouped = await db.payments.aggregate(
        [
            {"$match": {"student": {"$in": student_ids}}},
            {
                "$group": {
                    "_id": {
                        "student": "$student",
                        "academicYear": {"$ifNull": ["$academicYear", ""]},
                        "feeType": {
                            "$cond": [
                                {"$in": [{"$ifNull": ["$feeType", ""]}, ["", None]]},
                                "academic",
                                "$feeType",
                            ]
                        },
                    },
                    "paid": {"$sum": "$amount"},
                }
            },
        ]
    ).to_list(None)
    totals_by_student_year = {}
    for row in grouped:
        key = (row["_id"]["student"], row["_id"]["academicYear"])
        by_type = totals_by_student_year.setdefault(
            key,
            {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
        )
        fee_type = row["_id"]["feeType"]
        by_type[fee_type] = by_type.get(fee_type, 0) + float(row["paid"] or 0)

    years_by_student = {
        doc["id"]: (doc.get("fees") or {}).get("academicYear") or "" for doc in docs
    }
    totals = {
        student_id: {
            "totalPaid": 0,
            "byFeeType": {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
            "count": 0,
        }
        for student_id in student_ids
    }
    for (student_id, academic_year), row_totals in totals_by_student_year.items():
        current_year = years_by_student[student_id]
        if current_year and academic_year != current_year:
            continue
        for fee_type, amount in row_totals.items():
            by_type = totals[student_id]["byFeeType"]
            by_type[fee_type] = by_type.get(fee_type, 0) + amount
            totals[student_id]["totalPaid"] += amount
    return totals
