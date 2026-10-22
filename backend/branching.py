"""MongoDB access scoping for school branches and gender-limited student roles."""

from contextvars import ContextVar
from copy import deepcopy

from fastapi import HTTPException


_UNSET = object()
_active_branch_id = ContextVar("active_branch_id", default=_UNSET)
_allowed_student_genders = ContextVar("allowed_student_genders", default=None)
_allowed_student_ids = ContextVar("allowed_student_ids", default=_UNSET)
_allowed_student_grade_rules = ContextVar("allowed_student_grade_rules", default=None)
_allowed_student_class_ids = ContextVar("allowed_student_class_ids", default=_UNSET)
_all_branch_access = ContextVar("all_branch_access", default=False)
_default_branch_id = None

GLOBAL_COLLECTIONS = frozenset({"branches", "roles"})
STUDENT_RELATIONS = {
    "attendance": "records.studentId",
    "attendance_sessions": "records.studentId",
    "grades": "studentId",
    "homework": "studentId",
    "payments": "student",
    "verification_messages": "studentId",
}


def set_default_branch_id(branch_id):
    global _default_branch_id
    _default_branch_id = branch_id


def set_access_context(branch_id, permissions):
    _active_branch_id.set(branch_id)
    _all_branch_access.set("branches.accessAll" in (permissions or []))
    grade_permissions = set(permissions or [])
    grade_rules = []
    if "students.scope.lowerGrades.view" in grade_permissions:
        grade_rules.append((frozenset({1, 2}), None))
    if "students.scope.upperGrades.male.view" in grade_permissions:
        grade_rules.append((frozenset(range(3, 10)), frozenset({"male"})))
    if "students.scope.upperGrades.female.view" in grade_permissions:
        grade_rules.append((frozenset(range(3, 10)), frozenset({"female"})))
    unrestricted_grades = {
        grade
        for grades, _ in grade_rules
        for grade in grades
    }
    if (
        unrestricted_grades == set(range(1, 10))
        and any(1 in grades and genders is None for grades, genders in grade_rules)
        and all(
            any(genders is None for grades, genders in grade_rules if grade in grades)
            or {
                gender
                for grades, genders in grade_rules
                if grade in grades and genders is not None
                for gender in genders
            } == {"male", "female"}
            for grade in range(3, 10)
        )
    ):
        grade_rules = []
    _allowed_student_grade_rules.set(tuple(grade_rules) if grade_rules else None)
    gender_permissions = {
        permission
        for permission in permissions or []
        if permission in {"students.gender.male.view", "students.gender.female.view"}
    }
    if gender_permissions:
        _allowed_student_genders.set(
            tuple(
                gender
                for permission, gender in (
                    ("students.gender.male.view", "male"),
                    ("students.gender.female.view", "female"),
                )
                if permission in gender_permissions
            )
        )
    else:
        _allowed_student_genders.set(None)
    _allowed_student_ids.set(_UNSET)
    _allowed_student_class_ids.set(_UNSET)


def active_branch_id():
    branch_id = _active_branch_id.get()
    return _default_branch_id if branch_id is _UNSET else branch_id


def allowed_student_genders():
    return _allowed_student_genders.get()


def _grade_number(value):
    import re

    normalized = str(value or "").strip().lower()
    digits = {
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
        "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    }
    normalized = "".join(digits.get(character, character) for character in normalized)
    match = re.search(r"(?<!\d)([1-9])(?:\.0)?(?!\d)", normalized)
    if match:
        return int(match.group(1))
    ordinal_grades = {
        "الأول": 1, "الاول": 1, "أولى": 1, "اولى": 1, "first": 1,
        "الثاني": 2, "الثانى": 2, "الثانية": 2, "second": 2,
        "الثالث": 3, "الثالثة": 3, "third": 3,
        "الرابع": 4, "الرابعة": 4, "fourth": 4,
        "الخامس": 5, "الخامسة": 5, "fifth": 5,
        "السادس": 6, "السادسة": 6, "sixth": 6,
        "السابع": 7, "السابعة": 7, "seventh": 7,
        "الثامن": 8, "الثامنة": 8, "eighth": 8,
        "التاسع": 9, "التاسعة": 9, "ninth": 9,
    }
    for name, number in ordinal_grades.items():
        if name in normalized:
            return number
    return None


def _merge_filters(*filters):
    present = [item for item in filters if item]
    if not present:
        return {}
    if len(present) == 1:
        return present[0]
    return {"$and": present}


class ScopedCursor:
    def __init__(self, collection, query, projection, args, kwargs, operations=()):
        self.collection = collection
        self.query = query
        self.projection = projection
        self.args = args
        self.kwargs = kwargs
        self.operations = list(operations)

    def sort(self, *args, **kwargs):
        self.operations.append(("sort", args, kwargs))
        return self

    def skip(self, *args, **kwargs):
        self.operations.append(("skip", args, kwargs))
        return self

    def limit(self, *args, **kwargs):
        self.operations.append(("limit", args, kwargs))
        return self

    async def __aiter__(self):
        for document in await self.to_list(None):
            yield document

    async def to_list(self, length=None):
        query = await self.collection._scoped_filter(self.query)
        cursor = self.collection.raw.find(
            query, self.projection, *self.args, **self.kwargs
        )
        for name, args, kwargs in self.operations:
            cursor = getattr(cursor, name)(*args, **kwargs)
        documents = await cursor.to_list(length)
        permitted_ids = None
        if self.collection.name in {"attendance", "attendance_sessions"}:
            permitted_ids = await self.collection._permitted_student_ids()
        return [
            self.collection._filter_related_records(document, permitted_ids)
            for document in documents
        ]


class ScopedAggregateCursor:
    def __init__(self, collection, pipeline, args, kwargs):
        self.collection = collection
        self.pipeline = pipeline
        self.args = args
        self.kwargs = kwargs

    async def to_list(self, length=None):
        match = await self.collection._scope_filter({})
        pipeline = deepcopy(self.pipeline)
        if match:
            pipeline.insert(0, {"$match": match})
        cursor = self.collection.raw.aggregate(
            pipeline, *self.args, **self.kwargs
        )
        return await cursor.to_list(length)


class ScopedCollection:
    def __init__(self, raw, database, name):
        self.raw = raw
        self.database = database
        self.name = name

    def __getattr__(self, name):
        return getattr(self.raw, name)

    async def _branch_filter(self):
        branch_id = active_branch_id()
        if self.name in GLOBAL_COLLECTIONS:
            return {}
        if self.name == "users":
            if _all_branch_access.get() or not branch_id:
                return {}
            return {"branchIds": branch_id}
        if not branch_id:
            return {}
        return {"branchId": branch_id}

    async def _scope_filter(self, query):
        filters = [deepcopy(query or {}), await self._branch_filter()]
        grade_rules = _allowed_student_grade_rules.get()
        genders = allowed_student_genders()
        if self.name == "students" and grade_rules is not None:
            filters.append(await self._student_grade_filter(grade_rules))
        elif self.name == "classes" and grade_rules is not None:
            class_ids = await self._permitted_class_ids(grade_rules)
            filters.append({"id": {"$in": class_ids}})
        elif self.name == "students" and genders is not None:
            filters.append({"student.gender": {"$in": list(genders)}})
        relation_field = STUDENT_RELATIONS.get(self.name)
        if relation_field and (genders is not None or grade_rules is not None):
            student_ids = await self._permitted_student_ids()
            filters.append({relation_field: {"$in": student_ids}})
        return _merge_filters(*filters)

    async def _scoped_filter(self, query):
        return await self._scope_filter(query)

    async def _permitted_student_ids(self):
        cached = _allowed_student_ids.get()
        if cached is not _UNSET:
            return cached
        branch_id = active_branch_id()
        if not branch_id:
            _allowed_student_ids.set(())
            return ()
        query = {"branchId": branch_id}
        grade_rules = _allowed_student_grade_rules.get()
        if grade_rules is not None:
            query.update(await self._student_grade_filter(grade_rules))
        else:
            query["student.gender"] = {
                "$in": list(allowed_student_genders() or [])
            }
        records = await self.database.raw["students"].find(
            query, {"_id": 0, "id": 1}
        ).to_list(None)
        student_ids = [record["id"] for record in records]
        _allowed_student_ids.set(student_ids)
        return student_ids

    async def _permitted_class_ids(self, grade_rules):
        cached = _allowed_student_class_ids.get()
        if cached is not _UNSET:
            return cached
        filters = await self._student_grade_rule_filters(grade_rules)
        class_ids = {
            class_id
            for item in filters
            for class_id in item["_classIds"]
        }
        result = list(class_ids)
        _allowed_student_class_ids.set(result)
        return result

    async def _student_grade_rule_filters(self, grade_rules):
        branch_id = active_branch_id()
        if not branch_id:
            return []
        classes = await self.database.raw["classes"].find(
            {"branchId": branch_id}, {"_id": 0, "id": 1, "grade": 1}
        ).to_list(None)
        result = []
        for grades, genders in grade_rules:
            class_ids = [
                class_record["id"]
                for class_record in classes
                if _grade_number(class_record.get("grade")) in grades
            ]
            if not class_ids:
                continue
            rule_filter = {"currentClassId": {"$in": class_ids}}
            if genders is not None:
                rule_filter["student.gender"] = {"$in": list(genders)}
            rule_filter["_classIds"] = class_ids
            result.append(rule_filter)
        return result

    async def _student_grade_filter(self, grade_rules):
        filters = await self._student_grade_rule_filters(grade_rules)
        query_filters = [
            {key: value for key, value in item.items() if key != "_classIds"}
            for item in filters
        ]
        if not query_filters:
            return {"id": {"$in": []}}
        return query_filters[0] if len(query_filters) == 1 else {"$or": query_filters}

    def _filter_related_records(self, document, permitted_ids):
        if self.name not in {"attendance", "attendance_sessions"}:
            return document
        genders = allowed_student_genders()
        grade_rules = _allowed_student_grade_rules.get()
        if (
            (genders is None and grade_rules is None)
            or permitted_ids is None
            or not isinstance(document.get("records"), list)
        ):
            return document
        document["records"] = [
            record
            for record in document["records"]
            if record.get("studentId") in permitted_ids
        ]
        return document

    def find(self, query=None, projection=None, *args, **kwargs):
        return ScopedCursor(self, query, projection, args, kwargs)

    async def find_one(self, query=None, projection=None, *args, **kwargs):
        scoped_query = await self._scope_filter(query)
        document = await self.raw.find_one(
            scoped_query, projection, *args, **kwargs
        )
        if not document:
            return None
        permitted_ids = None
        if self.name in {"attendance", "attendance_sessions"}:
            permitted_ids = await self._permitted_student_ids()
        return self._filter_related_records(document, permitted_ids)

    async def count_documents(self, query, *args, **kwargs):
        return await self.raw.count_documents(
            await self._scope_filter(query), *args, **kwargs
        )

    def aggregate(self, pipeline, *args, **kwargs):
        return ScopedAggregateCursor(self, pipeline, args, kwargs)

    async def distinct(self, key, filter=None, *args, **kwargs):
        return await self.raw.distinct(
            key, await self._scope_filter(filter), *args, **kwargs
        )

    async def insert_one(self, document, *args, **kwargs):
        document = deepcopy(document)
        await self._prepare_insert(document)
        return await self.raw.insert_one(document, *args, **kwargs)

    async def insert_many(self, documents, *args, **kwargs):
        documents = [deepcopy(document) for document in documents]
        for document in documents:
            await self._prepare_insert(document)
        return await self.raw.insert_many(documents, *args, **kwargs)

    async def _prepare_insert(self, document):
        branch_id = await self._branch_filter()
        if self.name == "users":
            required_branch = (branch_id or {}).get("branchIds")
            if required_branch and required_branch not in document.get("branchIds", []):
                raise HTTPException(403, "لا تملك صلاحية إنشاء مستخدم في هذا الفرع")
        elif branch_id:
            document["branchId"] = branch_id["branchId"]
        genders = allowed_student_genders()
        grade_rules = _allowed_student_grade_rules.get()
        if self.name == "students" and genders is not None:
            gender = (document.get("student") or {}).get("gender")
            if gender not in genders:
                raise HTTPException(403, "لا تملك صلاحية لهذا الجنس من الطلاب")
        if self.name == "students" and grade_rules is not None:
            await self._validate_student_grade_scope(document, grade_rules)
        relation_field = STUDENT_RELATIONS.get(self.name)
        if relation_field and (genders is not None or grade_rules is not None):
            if not set(self._relation_ids(document, relation_field)).issubset(
                set(await self._permitted_student_ids())
            ):
                raise HTTPException(404, "غير موجود")

    async def _validate_student_grade_scope(self, document, grade_rules):
        class_id = document.get("currentClassId")
        if not class_id:
            raise HTTPException(403, "يجب تحديد صف مسموح به لهذا الحساب")
        class_record = await self.database.raw["classes"].find_one(
            {"id": class_id, "branchId": active_branch_id()},
            {"_id": 0, "grade": 1},
        )
        grade = _grade_number((class_record or {}).get("grade"))
        gender = (document.get("student") or {}).get("gender")
        if not class_record or not any(
            grade in grades and (genders is None or gender in genders)
            for grades, genders in grade_rules
        ):
            raise HTTPException(403, "لا تملك صلاحية لهذا الصف أو الجنس")

    def _relation_ids(self, document, relation_field):
        if relation_field == "records.studentId":
            return [
                record.get("studentId")
                for record in document.get("records", [])
                if isinstance(record, dict)
            ]
        value = document.get(relation_field)
        return [value] if value is not None else []

    async def _scoped_update(self, update, upsert=False, query=None):
        if isinstance(update, list):
            branch_id = await self._branch_filter()
            if not branch_id:
                return update
            safe_update = deepcopy(update)
            for stage in safe_update:
                if isinstance(stage.get("$set"), dict):
                    stage["$set"].pop("branchId", None)
                if isinstance(stage.get("$unset"), dict):
                    stage["$unset"].pop("branchId", None)
                elif stage.get("$unset") == "branchId":
                    stage.pop("$unset")
            return safe_update
        update = deepcopy(update)
        genders = allowed_student_genders()
        grade_rules = _allowed_student_grade_rules.get()
        if self.name == "students" and grade_rules is not None:
            changes_scope = any(
                "student" in update.get(key, {})
                or "student.gender" in update.get(key, {})
                or "currentClassId" in update.get(key, {})
                for key in ("$set", "$setOnInsert")
            ) or "currentClassId" in update.get("$unset", {})
            if changes_scope:
                cursor = self.raw.find(
                    await self._scope_filter(query),
                    {"_id": 0, "student": 1, "currentClassId": 1},
                )
                existing_documents = await cursor.to_list(None)
                for existing in existing_documents:
                    merged = deepcopy(existing)
                    for key in ("$set", "$setOnInsert"):
                        values = update.get(key, {})
                        if "student" in values:
                            merged["student"] = values["student"]
                        elif "student.gender" in values:
                            merged.setdefault("student", {})["gender"] = values[
                                "student.gender"
                            ]
                        if "currentClassId" in values:
                            merged["currentClassId"] = values["currentClassId"]
                    if "currentClassId" in update.get("$unset", {}):
                        merged.pop("currentClassId", None)
                    await self._validate_student_grade_scope(merged, grade_rules)
        if self.name == "students" and genders is not None:
            for key in ("$set", "$setOnInsert"):
                values = update.get(key, {})
                gender = values.get("student.gender")
                student = values.get("student")
                if student is not None:
                    gender = (student or {}).get("gender")
                if gender is not None and gender not in genders:
                    raise HTTPException(403, "لا تملك صلاحية لهذا الجنس من الطلاب")
        relation_field = STUDENT_RELATIONS.get(self.name)
        if relation_field and (genders is not None or grade_rules is not None):
            student_ids = await self._permitted_student_ids()
            for key in ("$set", "$setOnInsert"):
                values = update.get(key, {})
                document = values
                if relation_field == "records.studentId":
                    document = {"records": values.get("records", [])}
                related_ids = self._relation_ids(document, relation_field)
                if not set(related_ids).issubset(set(student_ids)):
                    raise HTTPException(404, "غير موجود")
        if (
            self.name in {"attendance", "attendance_sessions"}
            and (genders is not None or grade_rules is not None)
            and isinstance(update.get("$set", {}).get("records"), list)
        ):
            student_ids = set(await self._permitted_student_ids())
            existing_sessions = await self.raw.find(
                await self._scope_filter(query), {"_id": 0, "records": 1}
            ).to_list(None)
            preserved_records = [
                record
                for session in existing_sessions
                for record in session.get("records", [])
                if record.get("studentId") not in student_ids
            ]
            update["$set"]["records"] = (
                preserved_records + update["$set"]["records"]
            )
        branch_id = await self._branch_filter()
        if branch_id and self.name != "users":
            if "$set" in update:
                update["$set"].pop("branchId", None)
            if "$unset" in update:
                update["$unset"].pop("branchId", None)
            if upsert:
                update.setdefault("$setOnInsert", {}).setdefault(
                    "branchId", branch_id["branchId"]
                )
        elif branch_id and self.name == "users":
            branch_id = branch_id["branchIds"]
            for key in ("$set", "$setOnInsert"):
                assigned_branches = update.get(key, {}).get("branchIds")
                if assigned_branches is not None and branch_id not in assigned_branches:
                    raise HTTPException(
                        403, "لا تملك صلاحية إسناد المستخدم إلى هذا الفرع"
                    )
        return update

    async def update_one(self, query, update, *args, **kwargs):
        return await self.raw.update_one(
            await self._scope_filter(query),
            await self._scoped_update(
                update, kwargs.get("upsert", False), query
            ),
            *args,
            **kwargs,
        )

    async def update_many(self, query, update, *args, **kwargs):
        return await self.raw.update_many(
            await self._scope_filter(query),
            await self._scoped_update(
                update, kwargs.get("upsert", False), query
            ),
            *args,
            **kwargs,
        )

    async def delete_one(self, query, *args, **kwargs):
        return await self.raw.delete_one(
            await self._scope_filter(query), *args, **kwargs
        )

    async def delete_many(self, query, *args, **kwargs):
        return await self.raw.delete_many(
            await self._scope_filter(query), *args, **kwargs
        )

    async def find_one_and_update(
        self, query, update, *args, **kwargs
    ):
        return await self.raw.find_one_and_update(
            await self._scope_filter(query),
            await self._scoped_update(
                update, kwargs.get("upsert", False), query
            ),
            *args,
            **kwargs,
        )

    async def replace_one(self, query, replacement, *args, **kwargs):
        replacement = deepcopy(replacement)
        await self._prepare_insert(replacement)
        return await self.raw.replace_one(
            await self._scope_filter(query), replacement, *args, **kwargs
        )


class BranchScopedDatabase:
    def __init__(self, raw):
        self.raw = raw
        self._collections = {}

    def __getattr__(self, name):
        value = getattr(self.raw, name)
        if hasattr(value, "find") and hasattr(value, "find_one"):
            return self[name]
        return value

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = ScopedCollection(
                self.raw[name], self, name
            )
        return self._collections[name]
