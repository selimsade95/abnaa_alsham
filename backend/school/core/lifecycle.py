import logging
import os
import uuid

from school.auth.permissions import ALL_PERMS
from school.core.branching import set_default_branch_id
from school.core.database import client, db, raw_db
from school.core.services import generate_code, get_code_settings, hash_pw, now_iso
from school.grades.services import get_grade_settings


async def on_startup():
    default_branch = await raw_db.branches.find_one({"isDefault": True})
    if not default_branch:
        default_branch = await raw_db.branches.find_one({"id": "default"})
    if not default_branch:
        default_branch = {
            "id": str(uuid.uuid4()),
            "name": "الفرع الرئيسي",
            "active": True,
            "isDefault": True,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        await raw_db.branches.insert_one(default_branch)
    else:
        await raw_db.branches.update_one(
            {"id": default_branch["id"]},
            {"$set": {"isDefault": True, "active": True}},
        )
        default_branch["isDefault"] = True
        default_branch["active"] = True
    set_default_branch_id(default_branch["id"])

    # Old records predate branches. Give them a home before the scoped queries start.
    for collection_name in await raw_db.list_collection_names():
        if collection_name not in {"branches", "roles", "users", "audit_logs", "parent_access_attempts", "access_attempts"}:
            await raw_db[collection_name].update_many(
                {"$or": [{"branchId": {"$exists": False}}, {"branchId": None}]},
                {"$set": {"branchId": default_branch["id"]}},
            )
    await raw_db.users.update_many(
        {"branchIds": {"$exists": False}},
        {"$set": {"branchIds": [default_branch["id"]]}},
    )

    defaults = [
        {"name": "Administrator", "description": "صلاحيات كاملة", "permissions": ALL_PERMS},
        {"name": "Registration Staff", "description": "موظف تسجيل",
         "permissions": ["students.view","students.create","students.update","students.print",
                         "students.fullInformation.view",
                         "payments.view","payments.create","payments.print",
                         "reports.view",
                         "students.orphanDocument.view","students.orphanDocument.upload",
                         "students.documents.view","students.documents.upload","students.documents.delete",
                         "teachers.view","classes.view"]},
        {"name": "Accountant", "description": "محاسب",
         "permissions": ["students.view","payments.view","payments.create","payments.update",
                         "payments.delete","payments.print","reports.view"]},
        {"name": "Teacher", "description": "معلم - الصفوف والطلاب المسندون فقط",
         "permissions": ["students.view", "students.print", "students.fullInformation.view",
                         "students.documents.view", "students.orphanDocument.view",
                         "students.notes.view", "students.notes.create", "students.notes.update", "students.notes.delete",
                         "classes.view", "subjects.view", "grades.view", "grades.create", "grades.edit",
                         "homework.view", "homework.create", "attendance.view", "attendance.manage"]},
    ]
    admin_role_id = None
    for r in defaults:
        existing = await db.roles.find_one({"name": r["name"]})
        if not existing:
            doc = {"id": str(uuid.uuid4()), **r, "createdAt": now_iso(), "updatedAt": now_iso()}
            await db.roles.insert_one(doc)
            if r["name"] == "Administrator": admin_role_id = doc["id"]
        else:
            if r["name"] == "Administrator":
                await db.roles.update_one({"id": existing["id"]}, {"$set": {"permissions": ALL_PERMS, "updatedAt": now_iso()}})
                admin_role_id = existing["id"]
    if not admin_role_id:
        admin_role_id = (await db.roles.find_one({"name": "Administrator"}))["id"]

    # Grant the new document permissions to the seeded registration role without
    # replacing any permissions an administrator may have added later.
    await db.roles.update_one(
        {"name": "Registration Staff"},
        {"$addToSet": {"permissions": {"$each": [
            "students.documents.view", "students.documents.upload", "students.documents.delete"
        ]}}},
    )
    await db.roles.update_one(
        {"name": "Teacher"},
        {"$addToSet": {"permissions": {"$each": [
            "subjects.view", "grades.view", "grades.create", "grades.edit",
            "students.notes.view", "students.notes.create", "students.notes.update", "students.notes.delete",
            "homework.view", "homework.create", "attendance.view", "attendance.manage"
        ]}}},
    )

    await db.classes.update_many(
        {"teacherId": {"$exists": True}, "teacherIds": {"$exists": False}},
        [{"$set": {"teacherIds": {"$cond": [
            {"$ne": ["$teacherId", None]}, ["$teacherId"], []
        ]}}}],
    )

    try:
        legacy_indexes = {
            "students": ["code_1"],
            "teachers": ["code_1"],
            "classes": ["code_1"],
            "subjects": ["code_1"],
            "counters": ["key_1"],
            "grades": [
                "studentId_1_classId_1_subjectId_1_academicYear_1_period_1"
            ],
            "attendance_sessions": ["classId_1_attendanceDate_1"],
        }
        for collection_name, index_names in legacy_indexes.items():
            indexes = await raw_db[collection_name].index_information()
            for index_name in index_names:
                if index_name in indexes:
                    await raw_db[collection_name].drop_index(index_name)
        await db.students.create_index([("branchId", 1), ("student.fullName", 1)])
        await db.students.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.students.create_index([("branchId", 1), ("currentClassId", 1)])
        await db.students.create_index([("branchId", 1), ("createdAt", -1)])
        await db.payments.create_index([("branchId", 1), ("student", 1)])
        await db.payments.create_index("academicYear")
        await db.payments.create_index([("branchId", 1), ("student", 1), ("academicYear", 1)])
        await db.payments.create_index("paymentDate")
        await db.payments.create_index([("branchId", 1), ("academicYear", 1), ("paymentDate", -1)])
        await db.users.create_index("username", unique=True)
        await db.roles.create_index("name", unique=True)
        await db.teachers.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.teachers.create_index([("branchId", 1), ("createdAt", -1)])
        await db.classes.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.classes.create_index([("branchId", 1), ("createdAt", -1)])
        await db.counters.create_index([("branchId", 1), ("key", 1)], unique=True)
        await db.subjects.create_index([("branchId", 1), ("code", 1)], unique=True, sparse=True)
        await db.teacher_subject_assignments.create_index([("teacherId", 1), ("subjectId", 1)], unique=True)
        await db.class_subject_assignments.create_index([("classId", 1), ("subjectId", 1)], unique=True)
        await db.grades.create_index([("branchId", 1), ("studentId", 1), ("classId", 1), ("subjectId", 1), ("academicYear", 1), ("period", 1)], unique=True)
        await db.homework.create_index([("branchId", 1), ("classId", 1), ("subjectId", 1), ("status", 1), ("homeworkDate", -1)])
        await db.attendance_sessions.create_index([("branchId", 1), ("classId", 1), ("attendanceDate", 1)], unique=True)
        await db.attendance_sessions.create_index([("branchId", 1), ("attendanceDate", -1)])
        await db.daily_reports.create_index([("branchId", 1), ("classId", 1), ("reportDate", 1)], unique=True)
        await db.daily_reports.create_index([("branchId", 1), ("reportDate", -1)])
        await db.verification_messages.create_index([("createdAt", -1)])
        await db.contact_messages.create_index([("createdAt", -1)])
        await raw_db.audit_logs.create_index([("branchId", 1), ("createdAt", -1)])
    except Exception as e:
        logging.warning(f"index setup: {e}")

    await raw_db.parent_access_cards.create_index("digest", unique=True)
    await raw_db.access_attempts.create_index("expiresAt", expireAfterSeconds=0)
    await raw_db.grade_announcements.create_index(
        [("branchId", 1), ("grade", 1), ("createdAt", -1), ("id", -1)],
    )
    await raw_db.attendance_sessions.create_index([("branchId", 1), ("records.studentId", 1), ("attendanceDate", -1)])

    # Backfill missing student codes
    async for doc in db.students.find({"code": {"$exists": False}}, {"_id": 0, "id": 1}):
        try:
            code = await generate_code("students")
            await db.students.update_one({"id": doc["id"]}, {"$set": {"code": code}})
        except Exception:
            pass

    if await raw_db.users.count_documents({}) == 0:
        u = os.environ.get("SEED_ADMIN_USERNAME", "admin")
        p = os.environ.get("SEED_ADMIN_PASSWORD")
        if not p:
            raise RuntimeError("Set SEED_ADMIN_PASSWORD before starting with an empty user database.")
        n = os.environ.get("SEED_ADMIN_NAME", "مدير النظام")
        await raw_db.users.insert_one({"id": str(uuid.uuid4()), "name": n, "username": u,
            "password": hash_pw(p), "roles": [admin_role_id],
            "branchIds": [default_branch["id"]],
            "createdAt": now_iso(), "updatedAt": now_iso()})
    else:
        await raw_db.users.update_many({"roles": {"$exists": False}}, {"$set": {"roles": []}})

    await get_code_settings()
    await get_grade_settings()


async def on_shutdown(): client.close()
