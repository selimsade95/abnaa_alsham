import uuid

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db
from school.core.services import ensure_class_access, grade_scope, now_iso, require_permission
from school.homework.schemas import HomeworkIn


router = APIRouter()


@router.get("/classes/{cid}/homework-options")
async def homework_options(cid: str, current=Depends(require_permission("homework.create"))):
    class_record = await ensure_class_access(cid, current)
    if class_record.get("status") == "inactive":
        raise HTTPException(400, "لا يمكن تسجيل واجب لصف غير نشط")

    assignments = await db.class_subject_assignments.find(
        {"classId": cid}, {"_id": 0, "subjectId": 1, "teacherIds": 1}
    ).to_list(5000)
    teacher_id = current.get("teacherId")
    if teacher_id:
        teacher_subjects = await db.teacher_subject_assignments.find(
            {"teacherId": teacher_id}, {"_id": 0, "subjectId": 1}
        ).to_list(5000)
        assigned_subject_ids = {item["subjectId"] for item in teacher_subjects}
        assignments = [
            item for item in assignments
            if teacher_id in (item.get("teacherIds") or [])
            and item["subjectId"] in assigned_subject_ids
        ]

    subject_ids = list(dict.fromkeys(item["subjectId"] for item in assignments))
    subjects = await db.subjects.find(
        {"id": {"$in": subject_ids}, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1},
    ).sort("name", 1).to_list(None)
    students = await db.students.find(
        {"currentClassId": cid, "student.status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "code": 1, "student.fullName": 1},
    ).sort("student.fullName", 1).to_list(None)
    return {"subjects": subjects, "students": students}


@router.post("/homework")
async def create_homework(body: HomeworkIn, current=Depends(require_permission("homework.create"))):
    class_record = await ensure_class_access(body.classId, current)
    if class_record.get("status") == "inactive":
        raise HTTPException(400, "لا يمكن تسجيل واجب لصف غير نشط")
    if len(body.studentIds) != len(set(body.studentIds)):
        raise HTTPException(400, "لا يمكن تكرار الطالب في الطلب")

    subject = await db.subjects.find_one(
        {"id": body.subjectId, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not subject:
        raise HTTPException(400, "المادة غير موجودة")
    assignment = await db.class_subject_assignments.find_one(
        {"classId": body.classId, "subjectId": body.subjectId}
    )
    if not assignment:
        raise HTTPException(400, "المادة غير مسندة إلى هذا الصف")
    teacher_id = current.get("teacherId")
    if teacher_id:
        if teacher_id not in (assignment.get("teacherIds") or []):
            raise HTTPException(403, "المادة غير مسندة إليك في هذا الصف")
        if not await db.teacher_subject_assignments.find_one(
            {"teacherId": teacher_id, "subjectId": body.subjectId}
        ):
            raise HTTPException(403, "غير مخول لتدريس هذه المادة")

    students = await db.students.find(
        {
            "id": {"$in": body.studentIds},
            "currentClassId": body.classId,
            "student.status": {"$ne": "inactive"},
        },
        {"_id": 0, "id": 1, "student.fullName": 1, "classNotes": 1},
    ).to_list(None)
    if len(students) != len(body.studentIds):
        raise HTTPException(400, "يجب اختيار طلاب نشطين من هذا الصف فقط")

    timestamp = now_iso()
    homework_date = timestamp[:10]
    saved = []
    for student in students:
        homework_id = str(uuid.uuid4())
        content = f"لم يؤدِ الطالب الواجب في مادة {subject['name']} بتاريخ {homework_date}"
        note = {
            "id": str(uuid.uuid4()),
            "content": content,
            "authorId": current["id"],
            "authorName": current.get("name") or current.get("username") or "—",
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "homeworkId": homework_id,
        }
        record = {
            "id": homework_id,
            "classId": body.classId,
            "className": class_record.get("name") or "—",
            "studentId": student["id"],
            "studentName": (student.get("student") or {}).get("fullName") or "—",
            "studentCode": student.get("code"),
            "subjectId": body.subjectId,
            "subjectName": subject["name"],
            "teacherId": current.get("teacherId"),
            "teacherName": current.get("name") or current.get("username") or "—",
            "homeworkDate": homework_date,
            "status": "undone",
            "createdAt": timestamp,
            "createdBy": current["id"],
        }
        await db.homework.insert_one(record)
        await db.students.update_one(
            {"id": student["id"], "currentClassId": body.classId},
            {"$push": {"classNotes": note}, "$set": {"updatedAt": timestamp}},
        )
        saved.append({key: value for key, value in record.items() if key != "_id"})
    return {"ok": True, "created": len(saved), "homework": saved}


@router.get("/homework")
async def list_homework(current=Depends(require_permission("homework.view"))):
    query = {"status": "undone"}
    allowed = await grade_scope(current)
    if allowed is not None:
        if not allowed:
            return []
        query["$or"] = [
            {"classId": class_id, "subjectId": subject_id}
            for class_id, subject_id in allowed
        ]
    records = await db.homework.find(query, {"_id": 0}).sort(
        [("homeworkDate", -1), ("studentName", 1)]
    ).to_list(None)
    return records
