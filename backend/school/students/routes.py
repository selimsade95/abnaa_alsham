import math
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from school.core.csv_upload import _read_csv_rows
from school.core.database import db, raw_db
from school.core.filters import _split_filter_values
from school.core.services import (
    allowed_class_ids,
    ensure_student_access,
    generate_code,
    now_iso,
    require_permission,
)
from school.payments.fees import (
    _fee_payables,
    _overall_student_payable,
    _student_payment_totals,
    _student_totals_for_docs,
)
from school.settings.services import get_discount_options, get_registration_paths
from school.students.services import _augment_student, _augment_students


router = APIRouter()


@router.get("/students")
async def list_students(search: Optional[str] = None, gender: Optional[str] = None,
                        orphan: Optional[str] = None, registrationPath: Optional[str] = None,
                        finalRegistrationPath: Optional[str] = None,
                        classId: Optional[str] = None, status: Optional[str] = None,
                        academicYear: Optional[str] = None, paymentStatus: Optional[str] = None,
                        teacherId: Optional[str] = None,
                        sortBy: Optional[str] = Query(
                            default=None,
                            regex="^(code|name|gender|birthdate|class|registrationPath|status|orphan)$",
                        ),
                        sortOrder: str = Query(default="asc", regex="^(asc|desc)$"),
                        page: int = 1, limit: int = 20,
                        current=Depends(require_permission("students.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    permissions = set(current.get("permissions") or [])
    if paymentStatus and "payments.view" not in permissions:
        raise HTTPException(403, "لا تملك صلاحية عرض بيانات المدفوعات")
    statuses = _split_filter_values(status)
    q = {}
    if gender: q["student.gender"] = gender
    if orphan in ("true", "false"): q["student.orphan"] = (orphan == "true")
    registration_paths = _split_filter_values(registrationPath)
    if registration_paths:
        q["student.registrationPath"] = {"$in": registration_paths}
    if academicYear: q["fees.academicYear"] = academicYear
    class_ids = _split_filter_values(classId)
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        if class_ids:
            q["currentClassId"] = {"$in": [item for item in class_ids if item in allowed]}
        else:
            q["currentClassId"] = {"$in": allowed}
    elif class_ids:
        q["currentClassId"] = {"$in": class_ids}
    elif teacherId:
        cls = await db.classes.find({"$or": [{"teacherIds": teacherId}, {"teacherId": teacherId}]}, {"id": 1, "_id": 0}).to_list(500)
        q["currentClassId"] = {"$in": [c["id"] for c in cls]}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"student.fullName": rx}, {"code": rx},
                    {"father.name": rx}, {"mother.name": rx},
                    {"father.phone": rx}, {"mother.phone": rx},
                    {"student.currentAddress": rx},
                    {"general.whatsappGroupPhone": rx}]
    # Payment status and fee totals are derived from payment records, so the
    # complete filtered set must be evaluated before pagination.
    matched_docs = await db.students.find(
        q,
        {
            "_id": 0,
            "id": 1,
            "code": 1,
            "createdAt": 1,
            "student.fullName": 1,
            "student.finalRegistrationPath": 1,
            "student.registrationPath": 1,
            "student.gender": 1,
            "student.birthdate": 1,
            "student.newClass": 1,
            "student.status": 1,
            "student.orphan": 1,
            "currentClassId": 1,
            "fees": 1,
        },
    ).sort("createdAt", -1).to_list(None)
    final_registration_paths = _split_filter_values(finalRegistrationPath)
    if final_registration_paths:
        matched_docs = [
            d for d in matched_docs
            if ((d.get("student") or {}).get("finalRegistrationPath")
                or (d.get("student") or {}).get("registrationPath")) in final_registration_paths
        ]
    totals_by_student = await _student_totals_for_docs(matched_docs)
    if paymentStatus:
        def matches(d):
            fees = d.get("fees") or {}
            payable = _overall_student_payable(fees)
            paid = totals_by_student[d["id"]]["totalPaid"]
            if paymentStatus == "paid": return payable > 0 and paid >= payable
            if paymentStatus == "partial": return 0 < paid < payable
            if paymentStatus == "unpaid": return paid == 0
            return True
        matched_docs = [d for d in matched_docs if matches(d)]
    financial_docs = matched_docs
    if "all" not in statuses:
        matched_docs = [
            d for d in matched_docs
            if (
                (d.get("student") or {}).get("status") in statuses
                if statuses
                else (d.get("student") or {}).get("status") != "inactive"
            )
        ]
    if sortBy:
        class_names = {}
        if sortBy == "class":
            class_ids = list(
                {doc["currentClassId"] for doc in matched_docs if doc.get("currentClassId")}
            )
            classes = await db.classes.find(
                {"id": {"$in": class_ids}},
                {"_id": 0, "id": 1, "name": 1},
            ).to_list(len(class_ids))
            class_names = {class_doc["id"]: class_doc.get("name") or "" for class_doc in classes}

        def student_sort_value(d):
            student = d.get("student") or {}
            values = {
                "code": d.get("code") or "",
                "name": student.get("fullName") or "",
                "gender": student.get("gender") or "",
                "birthdate": student.get("birthdate") or "",
                "class": class_names.get(d.get("currentClassId"), "") or student.get("newClass") or "",
                "registrationPath": student.get("registrationPath") or "",
                "status": student.get("status") or "",
                "orphan": bool(student.get("orphan")),
            }
            value = values[sortBy]
            return value.casefold() if isinstance(value, str) else value
        matched_docs.sort(key=student_sort_value, reverse=sortOrder == "desc")
    total = len(matched_docs)
    start = (page - 1) * limit
    page_ids = [doc["id"] for doc in matched_docs[start:start + limit]]
    if page_ids:
        page_docs = await db.students.find(
            {"id": {"$in": page_ids}},
            {"_id": 0},
        ).to_list(len(page_ids))
        page_docs_by_id = {doc["id"]: doc for doc in page_docs}
        docs = [page_docs_by_id[student_id] for student_id in page_ids]
    else:
        docs = []
    await _augment_students(
        docs,
        current,
        {doc["id"]: totals_by_student[doc["id"]] for doc in docs},
    )
    if "students.fullInformation.view" not in permissions:
        allowed_student_fields = {
            "fullName",
            "gender",
            "birthdate",
            "registrationPath",
            "finalRegistrationPath",
            "status",
            "orphan",
        }
        for doc in docs:
            doc["student"] = {
                key: value
                for key, value in (doc.get("student") or {}).items()
                if key in allowed_student_fields
            }
            doc.pop("father", None)
            doc.pop("mother", None)
            doc.pop("general", None)
    if "payments.view" not in permissions:
        for doc in docs:
            doc.pop("fees", None)
    summary = {
        "totalPayable": sum(
            _overall_student_payable(d.get("fees") or {})
            for d in matched_docs
            if (d.get("student") or {}).get("status") != "inactive"
        ),
        "totalPaid": sum(
            totals_by_student[d["id"]]["totalPaid"] for d in financial_docs
        ),
        "totalBooksFee": sum(
            _fee_payables(d.get("fees") or {})["books"]
            for d in matched_docs
            if (d.get("student") or {}).get("status") != "inactive"
        ),
        "totalBusFee": sum(
            _fee_payables(d.get("fees") or {})["transportation"]
            for d in matched_docs
            if (d.get("student") or {}).get("status") != "inactive"
        ),
        "totalOutfitFee": sum(
            _fee_payables(d.get("fees") or {})["outfit"]
            for d in matched_docs
            if (d.get("student") or {}).get("status") != "inactive"
        ),
    }
    summary["totalRemaining"] = max(0, summary["totalPayable"] - summary["totalPaid"])
    if "payments.view" not in permissions:
        summary = {}
    return {"data": docs, "summary": summary,
            "pagination": {"page": page, "limit": limit, "total": total,
                            "totalPages": (total + limit - 1) // limit}}


@router.get("/students/options")
async def student_options(
    search: Optional[str] = None,
    exclude_ids: Optional[str] = Query(default=None, alias="excludeIds"),
    include_dropped: bool = Query(default=False, alias="includeDropped"),
    current=Depends(require_permission("students.view")),
):
    if include_dropped and "payments.create" not in (current.get("permissions") or []):
        raise HTTPException(403, "لا تملك صلاحية عرض الطلاب المنسحبين للاسترداد")
    query = {} if include_dropped else {"student.status": {"$ne": "inactive"}}
    if exclude_ids:
        query["id"] = {"$nin": [student_id for student_id in exclude_ids.split(",") if student_id]}
    if search and search.strip():
        value = re.escape(search.strip())
        query["$or"] = [
            {"student.fullName": {"$regex": re.escape(value), "$options": "i"}},
            {"code": {"$regex": re.escape(value), "$options": "i"}},
        ]
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        query["currentClassId"] = {"$in": allowed}

    students = await db.students.find(
        query,
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1, "fees": 1},
    ).sort("createdAt", -1).limit(10).to_list(10)
    options = []
    for student in students:
        fees = student.get("fees") or {}
        payable = _fee_payables(fees)
        totals = await _student_payment_totals(student["id"], fees.get("academicYear"))
        options.append({
            "id": student["id"],
            "code": student.get("code"),
            "student": student.get("student") or {},
            "fees": {
                "byType": {
                    fee_type: {
                        "payable": amount,
                        "paid": totals.get("byFeeType", {}).get(fee_type, 0),
                    }
                    for fee_type, amount in payable.items()
                }
            },
        })
    return {"data": options}


@router.post("/students/import")
async def import_students(file: UploadFile = File(...), current=Depends(require_permission("students.create"))):
    rows = await _read_csv_rows(file)
    required = {"fullName", "gender", "birthdate", "registrationPath"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب الطلاب غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        def text(field):
            return (row.get(field) or "").strip()

        def csv_bool(field, default=False):
            value = text(field).lower()
            if not value:
                return default
            if value in ("true", "1", "yes", "نعم"):
                return True
            if value in ("false", "0", "no", "لا"):
                return False
            raise HTTPException(400, f"قيمة {field} غير صحيحة في الصف {index}")

        full_name = text("fullName")
        if not full_name: raise HTTPException(400, f"اسم الطالب مطلوب في الصف {index}")
        gender = text("gender").lower()
        if gender not in ("male", "female"):
            raise HTTPException(400, f"الجنس غير صحيح في الصف {index}")
        orphan_of = text("orphanOf").lower()
        if orphan_of and orphan_of not in ("mother", "father", "both"):
            raise HTTPException(400, f"قيمة orphanOf غير صحيحة في الصف {index}")

        registration_path = text("registrationPath")
        if not registration_path:
            raise HTTPException(400, f"مسار التسجيل الأولي مطلوب في الصف {index}")
        final_registration_path = text("finalRegistrationPath") or registration_path
        configured_paths = await get_registration_paths()
        paths_to_add = [
            path for path in dict.fromkeys((registration_path, final_registration_path))
            if path and path not in configured_paths
        ]

        dropped = csv_bool("dropped")
        status = "inactive" if dropped else (text("status") or "resident")
        try:
            academic_fee = float(text("academicFee") or text("totalPayable") or 0)
            academic_paid = float(text("academicPaid") or 0)
            general_discount_percentage = float(
                text("generalDiscountPercentage")
                or text("discountPercentage")
                or 0
            )
            siblings_staff_discount_percentage = float(
                text("siblingsStaffDiscountPercentage") or 0
            )
            books_fee = float(text("booksFee") or 0)
            books_paid = float(text("booksPaid") or 0)
            bus_fee = float(text("busFee") or 0)
            bus_paid = float(text("busPaid") or 0)
            outfit_fee = float(text("outfitFee") or 0)
        except ValueError:
            raise HTTPException(400, f"الرسوم غير صحيحة في الصف {index}")
        amounts = (
            academic_fee, academic_paid, general_discount_percentage,
            siblings_staff_discount_percentage, books_fee, books_paid,
            bus_fee, bus_paid, outfit_fee,
        )
        if not all(math.isfinite(value) for value in amounts):
            raise HTTPException(400, f"الرسوم غير صحيحة في الصف {index}")
        if min(
            academic_fee,
            academic_paid,
            books_fee,
            books_paid,
            bus_fee,
            bus_paid,
            outfit_fee,
        ) < 0:
            raise HTTPException(400, f"الرسوم لا يمكن أن تكون سالبة في الصف {index}")
        if not 0 <= general_discount_percentage <= 100:
            raise HTTPException(
                400, f"نسبة الخصم العام يجب أن تكون بين 0 و100 في الصف {index}"
            )
        if not 0 <= siblings_staff_discount_percentage <= 100:
            raise HTTPException(
                400,
                f"نسبة خصم الإخوة/الكادر يجب أن تكون بين 0 و100 في الصف {index}",
            )
        academic_payable = (
            academic_fee
            * (1 - general_discount_percentage / 100)
            * (1 - siblings_staff_discount_percentage / 100)
        )
        orphan = csv_bool("orphan")
        father_deceased = csv_bool("fatherDeceased")
        mother_deceased = csv_bool("motherDeceased")
        chronic_disease = csv_bool("chronicDisease")
        permanent_habits = csv_bool("permanentHabits")
        bus_registered = csv_bool("busRegistered", bus_fee > 0)
        bus_payable = bus_fee if bus_registered else 0
        if (academic_paid > academic_payable + 0.0001 or
                books_paid > books_fee + 0.0001 or
                bus_paid > bus_payable + 0.0001):
            raise HTTPException(400, f"الدفعة تتجاوز الرسوم المستحقة في الصف {index}")

        class_id = (row.get("currentClassId") or "").strip() or None
        if class_id and not await db.classes.find_one({"id": class_id}):
            raise HTTPException(400, f"الصف غير موجود في الصف {index}")
        allowed = await allowed_class_ids(current)
        class_name = text("newClass")
        if not class_id and class_name:
            class_record = await db.classes.find_one(
                {"name": class_name, "academicYear": text("academicYear")},
                {"_id": 0},
            )
            if class_record:
                class_id = class_record["id"]
            elif allowed is None:
                code = await generate_code("classes")
                class_id = str(uuid.uuid4())
                class_record = {
                    "id": class_id, "code": code, "name": class_name,
                    "grade": "", "section": "", "academicYear": text("academicYear"),
                    "teacherIds": [], "teacherId": None, "capacity": 0,
                    "status": "active", "notes": "", "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                await db.classes.insert_one(class_record)
            else:
                raise HTTPException(403, f"لا يمكنك إضافة طالب إلى هذا الصف في الصف {index}")
        if allowed is not None and class_id not in allowed:
            raise HTTPException(403, f"لا يمكنك إضافة طالب إلى هذا الصف في الصف {index}")

        if paths_to_add:
            configured_paths.extend(paths_to_add)
            await db.settings.update_one(
                {"id": "registration_paths"},
                {"$set": {"paths": configured_paths, "updatedAt": now_iso()},
                 "$setOnInsert": {"createdAt": now_iso()}},
                upsert=True,
            )
        options = await get_discount_options()
        discounts = (
            (
                "general",
                general_discount_percentage,
                text("generalDiscountName"),
                "خصم عام",
            ),
            (
                "siblings_staff",
                siblings_staff_discount_percentage,
                text("siblingsStaffDiscountName"),
                "خصم الإخوة/الكادر",
            ),
        )
        discount_names = {}
        options_updated = False
        for category, percentage, requested_name, default_label in discounts:
            if percentage <= 0:
                discount_names[category] = ""
                continue
            option = next(
                (
                    item
                    for item in options
                    if (item.get("category") or "general") == category
                    and math.isclose(
                        float(item.get("percentage", 0)), percentage
                    )
                    and (not requested_name or item.get("name") == requested_name)
                ),
                None,
            )
            if option:
                discount_names[category] = option["name"]
                continue

            name = requested_name or f"{default_label} {percentage:g}%"
            existing_names = {item.get("name") for item in options}
            base_name = name
            suffix = 2
            while name in existing_names:
                name = f"{base_name} ({suffix})"
                suffix += 1
            options.append({
                "name": name,
                "percentage": percentage,
                "category": category,
            })
            discount_names[category] = name
            options_updated = True

        if options_updated:
            await db.settings.update_one(
                {"id": "discount_options"},
                {"$set": {"options": options, "updatedAt": now_iso()},
                 "$setOnInsert": {"createdAt": now_iso()}},
                upsert=True,
            )
        general_discount_name = discount_names["general"]
        siblings_staff_discount_name = discount_names["siblings_staff"]
        discount_enabled = (
            general_discount_percentage > 0
            or siblings_staff_discount_percentage > 0
        )
        combined_discount_percentage = 100 * (
            1
            - (1 - general_discount_percentage / 100)
            * (1 - siblings_staff_discount_percentage / 100)
        )
        discount_name = " / ".join(
            name
            for name in (general_discount_name, siblings_staff_discount_name)
            if name
        )

        class_record = await db.classes.find_one({"id": class_id}, {"_id": 0, "name": 1}) if class_id else None
        code = await generate_code("students")
        doc = {"id": str(uuid.uuid4()), "code": code,
               "student": {"fullName": full_name, "gender": gender,
                           "birthdate": text("birthdate"), "birthPlace": text("birthPlace"),
                           "registrationPath": registration_path,
                           "finalRegistrationPath": final_registration_path,
                           "previousClass": text("previousClass"),
                           "newClass": class_name or (class_record or {}).get("name", ""),
                           "busNumber": text("busNo"),
                           "status": status, "currentAddress": text("currentAddress"),
                           "orphan": orphan, "orphanOf": orphan_of,
                           "orphanDocType": text("orphanDocType"),
                           "addressCodes": {key: text(key) for key in ("sector", "block", "minutes", "floor", "apartment")},
                           "chronicDisease": chronic_disease, "chronicDiseaseDetails": text("chronicDiseaseDetails"),
                           "permanentHabits": permanent_habits, "permanentHabitsDetails": text("permanentHabitsDetails")},
               "father": {"name": text("fatherName"), "alive": not father_deceased, "phone": text("fatherPhone"),
                          "address": text("fatherAddress"), "profession": text("fatherProfession"), "whatsapp": text("fatherWhatsapp"), "telegram": text("fatherTelegram")},
               "mother": {"name": text("motherName"), "alive": not mother_deceased, "phone": text("motherPhone"),
                          "address": text("motherAddress"), "profession": text("motherProfession"), "whatsapp": text("motherWhatsapp"), "telegram": text("motherTelegram")},
               "general": {"whatsappGroupPhone": text("whatsappGroupPhone"), "emergencyContact": {"name": text("emergencyName"), "relation": text("emergencyRelation"), "phone": text("emergencyPhone")}},
               "fees": {"academicYear": text("academicYear"), "totalPayable": academic_fee,
                        "discountEnabled": discount_enabled,
                        "discountPercentage": combined_discount_percentage,
                        "discountName": discount_name,
                        "generalDiscountName": general_discount_name,
                        "generalDiscountPercentage": general_discount_percentage,
                        "siblingsStaffDiscountName": siblings_staff_discount_name,
                        "siblingsStaffDiscountPercentage": siblings_staff_discount_percentage,
                        "booksFee": books_fee, "busFee": bus_fee,
                        "busRegistered": bus_registered,
                        "outfitFee": outfit_fee},
               "currentClassId": class_id, "siblings": [], "previousEducation": [], "islamicLegalEducation": "", "bestAchievement": "",
               "otherInfo": {"familySmokers": False, "transportation": "", "notes": ""}, "signing": {"parentName": "", "relationToStudent": ""}, "fullInfo": {}, "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.students.insert_one(doc); created.append(doc["id"])
        for fee_type, amount in (
            ("academic", academic_paid),
            ("books", books_paid),
            ("transportation", bus_paid),
        ):
            if amount > 0:
                await db.payments.insert_one({
                    "id": str(uuid.uuid4()), "student": doc["id"],
                    "academicYear": doc["fees"]["academicYear"], "feeType": fee_type,
                    "semester": "full_year", "amount": amount,
                    "paymentDate": now_iso(), "notes": "دفعة عند استيراد الطالب",
                    "createdBy": current["id"], "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                })
    return {"ok": True, "created": len(created)}


@router.get("/students/{sid}")
async def get_student(sid: str, current=Depends(require_permission("students.view"))):
    d = await ensure_student_access(sid, current)
    d.pop("_id", None)
    return await _augment_student(d, current)


@router.get("/public/students/{sid}/validation")
async def validate_student(sid: str):
    d = await raw_db.students.find_one({"id": sid}, {"_id": 0})
    if not d: raise HTTPException(404, "الطالب غير موجود")
    student = d.get("student") or {}
    current_class = None
    if d.get("currentClassId"):
        current_class = await raw_db.classes.find_one(
            {"id": d["currentClassId"]},
            {"_id": 0, "name": 1, "section": 1, "academicYear": 1},
        )
    return {
        "code": d.get("code"),
        "fullName": student.get("fullName"),
        "status": student.get("status") or "resident",
        "isActive": student.get("status") != "inactive",
        "className": current_class.get("name") if current_class else student.get("newClass"),
        "section": current_class.get("section") if current_class else None,
        "academicYear": (current_class or {}).get("academicYear") or (d.get("fees") or {}).get("academicYear"),
    }
