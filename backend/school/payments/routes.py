import re
import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from school.core.database import db
from school.core.services import (
    allowed_class_ids,
    ensure_student_access,
    now_iso,
    require_permission,
)
from school.payments.fees import (
    _clean_fee_type,
    _fee_payables,
    _payment_order_key,
    _payment_snapshot,
    _student_payment_totals,
    FEE_TYPE_FIELDS,
)
from school.payments.schemas import PaymentIn, PaymentSplitIn, RefundIn


router = APIRouter()


async def _enrich_payment(p):
    # Database inserts add Mongo's ObjectId to the original dictionary. It is
    # not JSON serializable, so never allow it to reach an API response.
    p.pop("_id", None)
    s = await db.students.find_one({"id": p.get("student")}, {"_id": 0, "student.fullName": 1, "code": 1, "fees": 1})
    p["studentName"] = (s.get("student") or {}).get("fullName") if s else "—"
    p["studentCode"] = s.get("code") if s else None
    fee_year = p.get("academicYear") or ((s.get("fees") or {}).get("academicYear") if s else "")
    if not p.get("feeType"):
        p.pop("totalPaidAtPayment", None)
        p.pop("totalRemainingAtPayment", None)
    p["feeType"] = p.get("feeType") or "academic"
    _clean_fee_type(p["feeType"])
    p["totalPayable"] = _fee_payables(s.get("fees") or {}).get(p["feeType"], 0) if s else 0
    p["totalPaid"], p["totalRemaining"] = await _payment_snapshot(p, p["totalPayable"]) if s else (0, 0)
    current_totals = await _student_payment_totals(p.get("student"), fee_year) if s else {"totalPaid": 0}
    p["currentTotalPaid"] = current_totals.get("byFeeType", {}).get(p["feeType"], 0)
    p["currentTotalRemaining"] = max(0, p["totalPayable"] - p["currentTotalPaid"])
    p["totalPaidAtPayment"] = float(p.get("totalPaidAtPayment") if p.get("totalPaidAtPayment") is not None else p["totalPaid"])
    p["totalRemainingAtPayment"] = float(p.get("totalRemainingAtPayment") if p.get("totalRemainingAtPayment") is not None else p["totalRemaining"])
    creator = await db.users.find_one({"id": p.get("createdBy")}, {"_id": 0, "name": 1})
    p["createdByName"] = creator.get("name") if creator else "—"
    return p


async def _enrich_payments(payments: list[dict]) -> list[dict]:
    if not payments:
        return payments
    student_ids = list({payment.get("student") for payment in payments if payment.get("student")})
    creator_ids = list({payment.get("createdBy") for payment in payments if payment.get("createdBy")})
    students = await db.students.find(
        {"id": {"$in": student_ids}},
        {"_id": 0, "id": 1, "student.fullName": 1, "code": 1, "fees": 1},
    ).to_list(len(student_ids))
    students_by_id = {student["id"]: student for student in students}
    creators = await db.users.find(
        {"id": {"$in": creator_ids}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(len(creator_ids))
    creators_by_id = {creator["id"]: creator for creator in creators}

    totals_by_student_year = {}
    if student_ids:
        grouped_totals = await db.payments.aggregate(
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
        for row in grouped_totals:
            key = (row["_id"]["student"], row["_id"]["academicYear"])
            by_type = totals_by_student_year.setdefault(
                key,
                {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
            )
            fee_type = row["_id"]["feeType"]
            by_type[fee_type] = by_type.get(fee_type, 0) + float(row["paid"] or 0)

    legacy_payments = [
        payment
        for payment in payments
        if not payment.get("feeType")
        or "totalPaidAtPayment" not in payment
        or "totalRemainingAtPayment" not in payment
    ]
    ledgers_by_student_year = {}
    ledger_pairs = {
        (payment.get("student"), payment.get("academicYear") or "")
        for payment in legacy_payments
        if payment.get("student")
    }
    if ledger_pairs:
        ledger_query = {
            "$or": [
                {"student": student_id, "academicYear": academic_year}
                for student_id, academic_year in ledger_pairs
            ]
        }
        ledgers = await db.payments.find(
            ledger_query,
            {
                "_id": 0,
                "id": 1,
                "student": 1,
                "academicYear": 1,
                "amount": 1,
                "feeType": 1,
                "paymentDate": 1,
                "createdAt": 1,
            },
        ).to_list(None)
        for ledger in ledgers:
            key = (ledger.get("student"), ledger.get("academicYear") or "")
            ledgers_by_student_year.setdefault(key, []).append(ledger)
        for ledger_group in ledgers_by_student_year.values():
            ledger_group.sort(key=_payment_order_key)

    totals_by_student = {}
    for (student_id, _), yearly_totals in totals_by_student_year.items():
        by_type = totals_by_student.setdefault(
            student_id,
            {fee_type: 0 for fee_type in FEE_TYPE_FIELDS},
        )
        for fee_type, amount in yearly_totals.items():
            by_type[fee_type] += amount

    for payment in payments:
        payment.pop("_id", None)
        student = students_by_id.get(payment.get("student"))
        student_fees = (student or {}).get("fees") or {}
        has_fee_type = bool(payment.get("feeType"))
        payment["studentName"] = (
            (student.get("student") or {}).get("fullName") if student else "—"
        )
        payment["studentCode"] = student.get("code") if student else None
        fee_year = (
            payment.get("academicYear") or student_fees.get("academicYear") or ""
        )
        fee_type = payment.get("feeType") or "academic"
        _clean_fee_type(fee_type)
        payment["feeType"] = fee_type
        payment["totalPayable"] = (
            _fee_payables(student_fees).get(fee_type, 0) if student else 0
        )
        student_year_totals = totals_by_student_year.get(
            (payment.get("student"), fee_year), {}
        )
        if not fee_year:
            student_year_totals = totals_by_student.get(payment.get("student"), {})
        payment["currentTotalPaid"] = student_year_totals.get(fee_type, 0)
        payment["currentTotalRemaining"] = max(
            0, payment["totalPayable"] - payment["currentTotalPaid"]
        )

        if (
            has_fee_type
            and "totalPaidAtPayment" in payment
            and "totalRemainingAtPayment" in payment
        ):
            paid_at_payment = float(payment["totalPaidAtPayment"])
            remaining_at_payment = float(payment["totalRemainingAtPayment"])
        else:
            ledger_key = (
                payment.get("student"),
                payment.get("academicYear") or "",
            )
            cumulative = 0
            for ledger in ledgers_by_student_year.get(ledger_key, []):
                if (ledger.get("feeType") or "academic") != fee_type:
                    continue
                cumulative += float(ledger.get("amount") or 0)
                if ledger.get("id") == payment.get("id"):
                    break
            paid_at_payment = cumulative
            remaining_at_payment = max(
                0, payment["totalPayable"] - cumulative
            )
        payment["totalPaid"] = paid_at_payment
        payment["totalRemaining"] = remaining_at_payment
        payment["totalPaidAtPayment"] = paid_at_payment
        payment["totalRemainingAtPayment"] = remaining_at_payment
        creator = creators_by_id.get(payment.get("createdBy"))
        payment["createdByName"] = creator.get("name") if creator else "—"
    return payments


@router.get("/payments")
async def list_payments(search: Optional[str] = None, academicYear: Optional[str] = None,
                        semester: Optional[str] = None,
                        feeType: Optional[str] = Query(
                            default=None, regex="^(academic|transportation)$"
                        ),
                        minAmount: Optional[float] = None,
                        maxAmount: Optional[float] = None,
                        page: Optional[int] = Query(default=None, ge=1),
                        limit: int = Query(default=10, ge=1, le=100),
                        current=Depends(require_permission("payments.view"))):
    q = {}
    if academicYear: q["academicYear"] = academicYear
    if semester: q["semester"] = semester
    if feeType == "academic":
        q["$and"] = [
            {
                "$or": [
                    {"feeType": "academic"},
                    {"feeType": {"$exists": False}},
                    {"feeType": None},
                ]
            }
        ]
    elif feeType:
        q["feeType"] = feeType
    amount_query = {}
    if minAmount is not None:
        amount_query["$gte"] = minAmount
    if maxAmount is not None:
        amount_query["$lte"] = maxAmount
    if amount_query:
        q["amount"] = amount_query
    if search:
        matching = await db.students.find({"$or": [{"student.fullName": {"$regex": re.escape(search), "$options": "i"}},
                                                    {"code": {"$regex": re.escape(search), "$options": "i"}}]}, {"id": 1, "_id": 0}).to_list(500)
        search_student_ids = [m["id"] for m in matching]
        q["student"] = {"$in": search_student_ids}
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        scoped_students = await db.students.find({"currentClassId": {"$in": allowed}}, {"id": 1, "_id": 0}).to_list(5000)
        scoped_ids = [student["id"] for student in scoped_students]
        existing_ids = q.get("student", {}).get("$in") if isinstance(q.get("student"), dict) else None
        q["student"] = {
            "$in": [
                sid
                for sid in (existing_ids if existing_ids is not None else scoped_ids)
                if sid in scoped_ids
            ]
        }
    total = await db.payments.count_documents(q) if page is not None else None
    total_pages = max(1, (total + limit - 1) // limit) if total is not None else 1
    resolved_page = min(page, total_pages) if page is not None else None
    cursor = db.payments.find(q, {"_id": 0}).sort("paymentDate", -1)
    if resolved_page is not None:
        cursor = cursor.skip((resolved_page - 1) * limit).limit(limit)
    docs = await cursor.to_list(limit if resolved_page is not None else 1000)
    await _enrich_payments(docs)
    if resolved_page is not None:
        return {
            "data": docs,
            "pagination": {
                "page": resolved_page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        }
    return docs


@router.get("/payments/summary")
async def payment_summary(search: Optional[str] = None, academicYear: Optional[str] = None,
                          include_dropped: bool = Query(default=False, alias="includeDropped"),
                          exclude_dropped: bool = Query(default=False, alias="excludeDropped"),
                          current=Depends(require_permission("payments.view"))):
    student_query = {}
    if academicYear:
        student_query["fees.academicYear"] = academicYear
    if search:
        student_query["$or"] = [
            {"student.fullName": {"$regex": re.escape(search), "$options": "i"}},
            {"code": {"$regex": re.escape(search), "$options": "i"}},
        ]
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        student_query["currentClassId"] = {"$in": allowed}
    students = await db.students.find(
        student_query,
        {"_id": 0, "id": 1, "fees": 1, "student.status": 1},
    ).to_list(None)
    student_ids = [student["id"] for student in students]
    current_fee_years = {
        student["id"]: (student.get("fees") or {}).get("academicYear") or ""
        for student in students
    }
    categories = {
        fee_type: {"payable": 0, "paid": 0, "remaining": 0}
        for fee_type in FEE_TYPE_FIELDS
    }
    dropped_totals = {"payable": 0, "paid": 0, "remaining": 0}
    dropped_student_ids = set()
    for student in students:
        is_dropped = (student.get("student") or {}).get("status") == "inactive"
        if is_dropped:
            dropped_student_ids.add(student["id"])
            dropped_totals["payable"] += sum(
                _fee_payables(student.get("fees") or {}).values()
            )
        if not is_dropped or include_dropped:
            for fee_type, payable in _fee_payables(student.get("fees") or {}).items():
                categories[fee_type]["payable"] += payable
    if student_ids:
        payment_query = {"student": {"$in": student_ids}}
        if academicYear:
            payment_query["academicYear"] = academicYear
        payments = await db.payments.find(
            payment_query,
            {"_id": 0, "student": 1, "academicYear": 1, "amount": 1, "feeType": 1},
        ).to_list(None)
        for payment in payments:
            if not academicYear and current_fee_years.get(payment.get("student")) and (
                payment.get("academicYear") or ""
            ) != current_fee_years[payment["student"]]:
                continue
            fee_type = payment.get("feeType") or "academic"
            if fee_type in categories:
                amount = float(payment.get("amount") or 0)
                if payment.get("student") in dropped_student_ids:
                    dropped_totals["paid"] += amount
                if not exclude_dropped or payment.get("student") not in dropped_student_ids:
                    categories[fee_type]["paid"] += amount
    for values in categories.values():
        values["remaining"] = max(0, values["payable"] - values["paid"])
    dropped_totals["remaining"] = max(
        0, dropped_totals["payable"] - dropped_totals["paid"]
    )
    return {"feeTypes": categories, "dropped": dropped_totals}


@router.get("/payments/{pid}")
async def get_payment(pid: str, current=Depends(require_permission("payments.view"))):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "غير موجود")
    await ensure_student_access(p.get("student"), current)
    return await _enrich_payment(p)


@router.get("/students/{sid}/payments")
async def list_student_payments(sid: str, current=Depends(require_permission("payments.view"))):
    await ensure_student_access(sid, current)
    docs = await db.payments.find({"student": sid}, {"_id": 0}).sort("paymentDate", -1).to_list(500)
    for d in docs: await _enrich_payment(d)
    return docs


async def _validate_no_overpayment(sid, ay, amt, fee_type="academic", exclude=None):
    s = await db.students.find_one({"id": sid})
    if not s: raise HTTPException(404, "الطالب غير موجود")
    fee_type = _clean_fee_type(fee_type)
    tp = _fee_payables(s.get("fees") or {}).get(fee_type, 0)
    q = {"student": sid, "academicYear": ay}
    if exclude: q["id"] = {"$ne": exclude}
    docs = await db.payments.find(q, {"_id": 0}).to_list(1000)
    cur = sum(float(p.get("amount", 0)) for p in docs if (p.get("feeType") or "academic") == fee_type)
    if cur + float(amt) > tp + 0.0001:
        raise HTTPException(400, f"مبلغ الدفعة يتجاوز الرصيد المتبقي (المتبقي: {tp - cur})")


@router.post("/payments")
async def create_payment(body: PaymentIn, current=Depends(require_permission("payments.create"))):
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await ensure_student_access(body.student, current)
    await _validate_no_overpayment(body.student, body.academicYear, body.amount, fee_type)
    doc = {"id": str(uuid.uuid4()), "student": body.student, "academicYear": body.academicYear,
            "feeType": fee_type, "semester": body.semester, "amount": float(body.amount), "paymentDate": body.paymentDate,
           "notes": body.notes or "", "createdBy": current["id"], "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(doc, _fee_payables(((await db.students.find_one({"id": body.student}) or {}).get("fees") or {})).get(fee_type, 0))
    await db.payments.update_one({"id": doc["id"]}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    doc["totalPaidAtPayment"] = paid_at_payment
    doc["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment({k: v for k, v in doc.items() if k != "_id"})


@router.post("/payments/split")
async def create_split_payment(body: PaymentSplitIn, current=Depends(require_permission("payments.create"))):
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"):
        raise HTTPException(400, "الفصل غير صالح")
    if not math.isfinite(body.totalAmount) or body.totalAmount <= 0:
        raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    if any(
        not math.isfinite(item.amount) or item.amount <= 0
        for item in body.allocations
    ):
        raise HTTPException(400, "يجب أن يكون مبلغ كل طالب أكبر من صفر")
    total_cents = round(body.totalAmount * 100)
    allocations_cents = [round(item.amount * 100) for item in body.allocations]
    if abs(body.totalAmount * 100 - total_cents) > 0.000001 or any(
        abs(item.amount * 100 - cents) > 0.000001
        for item, cents in zip(body.allocations, allocations_cents)
    ):
        raise HTTPException(400, "المبالغ يجب أن تكون بدقة منزلتين عشريتين")
    if sum(allocations_cents) != total_cents:
        raise HTTPException(400, "مجموع مبالغ الطلاب يجب أن يساوي إجمالي الدفعة")
    student_ids = [item.student for item in body.allocations]
    if len(student_ids) != len(set(student_ids)):
        raise HTTPException(400, "لا يمكن إضافة الطالب أكثر من مرة")

    for allocation in body.allocations:
        await ensure_student_access(allocation.student, current)
        await _validate_no_overpayment(
            allocation.student,
            body.academicYear,
            allocation.amount,
            fee_type,
        )

    created_at = now_iso()
    documents = [
        {
            "id": str(uuid.uuid4()),
            "student": allocation.student,
            "academicYear": body.academicYear,
            "feeType": fee_type,
            "semester": body.semester,
            "amount": allocations_cents[index] / 100,
            "paymentDate": body.paymentDate,
            "notes": body.notes or "",
            "createdBy": current["id"],
            "createdAt": created_at,
            "updatedAt": created_at,
        }
        for index, allocation in enumerate(body.allocations)
    ]
    await db.payments.insert_many(documents)
    result = []
    for document in documents:
        student = await db.students.find_one(
            {"id": document["student"]}, {"_id": 0, "fees": 1}
        )
        payable = _fee_payables((student or {}).get("fees") or {}).get(fee_type, 0)
        paid_at_payment, remaining_at_payment = await _payment_snapshot(
            document, payable
        )
        document["totalPaidAtPayment"] = paid_at_payment
        document["totalRemainingAtPayment"] = remaining_at_payment
        await db.payments.update_one(
            {"id": document["id"]},
            {
                "$set": {
                    "totalPaidAtPayment": paid_at_payment,
                    "totalRemainingAtPayment": remaining_at_payment,
                }
            },
        )
        result.append(await _enrich_payment(document))
    return result


@router.post("/payments/refund")
async def create_refund(body: RefundIn, current=Depends(require_permission("payments.create"))):
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "مبلغ الاسترداد يجب أن يكون أكبر من صفر")
    await ensure_student_access(body.student, current)
    student = await db.students.find_one({"id": body.student}, {"_id": 0, "fees": 1})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    semester_payments = await db.payments.find(
        {"student": body.student, "academicYear": body.academicYear, "semester": body.semester},
        {"_id": 0, "amount": 1, "feeType": 1},
    ).to_list(1000)
    paid_for_semester = max(0, sum(float(p.get("amount", 0)) for p in semester_payments
                                   if (p.get("feeType") or "academic") == fee_type))
    if body.amount > paid_for_semester + 0.0001:
        raise HTTPException(400, f"مبلغ الاسترداد يتجاوز المدفوع للفصل (المتاح: {paid_for_semester})")
    doc = {"id": str(uuid.uuid4()), "student": body.student, "academicYear": body.academicYear,
            "feeType": fee_type, "semester": body.semester, "amount": -float(body.amount), "type": "refund",
           "paymentDate": body.paymentDate, "notes": body.notes or "", "createdBy": current["id"],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.payments.insert_one(doc)
    payable = _fee_payables(student.get("fees") or {}).get(fee_type, 0)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(doc, payable)
    await db.payments.update_one({"id": doc["id"]}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    doc["totalPaidAtPayment"] = paid_at_payment
    doc["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment({k: v for k, v in doc.items() if k != "_id"})


@router.put("/payments/{pid}")
async def update_payment(pid: str, body: PaymentIn, current=Depends(require_permission("payments.update"))):
    existing = await db.payments.find_one({"id": pid})
    if not existing: raise HTTPException(404, "غير موجود")
    student_id = existing.get("student")
    if body.student != student_id:
        raise HTTPException(400, "لا يمكن تغيير الطالب المرتبط بالدفعة")
    await ensure_student_access(student_id, current)
    fee_type = _clean_fee_type(body.feeType)
    if body.semester not in ("first", "second", "full_year"): raise HTTPException(400, "الفصل غير صالح")
    if body.amount <= 0: raise HTTPException(400, "المبلغ يجب أن يكون أكبر من صفر")
    await _validate_no_overpayment(student_id, body.academicYear, body.amount, fee_type, exclude=pid)
    await db.payments.update_one({"id": pid}, {"$set": {"student": student_id, "academicYear": body.academicYear,
        "feeType": fee_type, "semester": body.semester, "amount": float(body.amount), "paymentDate": body.paymentDate,
        "notes": body.notes or "", "updatedAt": now_iso()}})
    updated = await db.payments.find_one({"id": pid}, {"_id": 0})
    student = await db.students.find_one({"id": student_id}, {"_id": 0, "fees": 1})
    updated.pop("totalPaidAtPayment", None)
    updated.pop("totalRemainingAtPayment", None)
    paid_at_payment, remaining_at_payment = await _payment_snapshot(updated, _fee_payables((student or {}).get("fees") or {}).get(fee_type, 0))
    await db.payments.update_one({"id": pid}, {"$set": {"totalPaidAtPayment": paid_at_payment,
        "totalRemainingAtPayment": remaining_at_payment}})
    updated["totalPaidAtPayment"] = paid_at_payment
    updated["totalRemainingAtPayment"] = remaining_at_payment
    return await _enrich_payment(updated)


@router.delete("/payments/{pid}")
async def delete_payment(pid: str, current=Depends(require_permission("payments.delete"))):
    existing = await db.payments.find_one({"id": pid}, {"_id": 0, "student": 1})
    if not existing: raise HTTPException(404, "غير موجود")
    await ensure_student_access(existing.get("student"), current)
    r = await db.payments.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True}
