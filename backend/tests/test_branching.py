import asyncio

import pytest
from fastapi import HTTPException

from branching import (
    BranchScopedDatabase,
    _grade_number,
    set_access_context,
    set_default_branch_id,
)


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, length=None):
        return self.documents[:length] if length is not None else self.documents


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []
        self.inserted = []

    def find(self, query, projection=None, *args, **kwargs):
        return FakeCursor(
            [document for document in self.documents if self._matches(document, query or {})]
        )

    async def find_one(self, query=None, projection=None, *args, **kwargs):
        return next(
            (document for document in self.documents if self._matches(document, query or {})),
            None,
        )

    @classmethod
    def _matches(cls, document, query):
        for key, expected in query.items():
            if key == "$and":
                if not all(cls._matches(document, part) for part in expected):
                    return False
                continue
            if key == "$or":
                if not any(cls._matches(document, part) for part in expected):
                    return False
                continue
            values = [document]
            for segment in key.split("."):
                values = [
                    child.get(segment)
                    for value in values
                    for child in (value if isinstance(value, list) else [value])
                    if isinstance(child, dict)
                ]
            value = values[0] if len(values) == 1 else values
            if isinstance(expected, dict) and "$in" in expected:
                candidates = value if isinstance(value, list) else [value]
                if not any(candidate in expected["$in"] for candidate in candidates):
                    return False
            elif value != expected:
                return False
        return True

    async def insert_one(self, document, *args, **kwargs):
        self.inserted.append(document)
        return document


class FakeRawDatabase:
    def __init__(self, students=None):
        self.collections = {
            "students": FakeCollection(students),
            "payments": FakeCollection(),
            "users": FakeCollection(),
            "classes": FakeCollection(),
        }

    def __getitem__(self, name):
        return self.collections[name]

    def __getattr__(self, name):
        return self[name]


def test_student_reads_are_limited_to_assigned_branch_and_gender():
    set_default_branch_id("default")
    set_access_context("west", ["students.gender.male.view"])
    database = BranchScopedDatabase(
        FakeRawDatabase(
            [
                {
                    "id": "west-male",
                    "branchId": "west",
                    "student": {"gender": "male"},
                },
                {
                    "id": "west-female",
                    "branchId": "west",
                    "student": {"gender": "female"},
                },
                {
                    "id": "east-male",
                    "branchId": "east",
                    "student": {"gender": "male"},
                },
            ]
        )
    )

    query = asyncio.run(database.students._scope_filter({"status": "active"}))

    assert query == {
        "$and": [
            {"status": "active"},
            {"branchId": "west"},
            {"student.gender": {"$in": ["male"]}},
        ]
    }


def test_related_payment_queries_are_limited_to_permitted_students():
    set_access_context("west", ["students.gender.female.view"])
    database = BranchScopedDatabase(
        FakeRawDatabase(
            [
                {
                    "id": "west-female",
                    "branchId": "west",
                    "student": {"gender": "female"},
                },
                {
                    "id": "west-male",
                    "branchId": "west",
                    "student": {"gender": "male"},
                },
            ]
        )
    )

    query = asyncio.run(database.payments._scope_filter({"id": "payment-id"}))

    assert query == {
        "$and": [
            {"id": "payment-id"},
            {"branchId": "west"},
            {"student": {"$in": ["west-female"]}},
        ]
    }


def test_user_directory_is_branch_scoped_unless_access_all_is_granted():
    database = BranchScopedDatabase(FakeRawDatabase())
    set_access_context("west", [])

    branch_query = asyncio.run(database.users._scope_filter({}))

    set_access_context("west", ["branches.accessAll"])
    all_branches_query = asyncio.run(database.users._scope_filter({}))

    assert branch_query == {"branchIds": "west"}
    assert all_branches_query == {}


def test_attendance_updates_preserve_records_for_the_other_gender():
    set_access_context("west", ["students.gender.male.view"])
    raw = FakeRawDatabase(
        [
            {
                "id": "male-id",
                "branchId": "west",
                "student": {"gender": "male"},
            }
        ]
    )
    raw.collections["attendance_sessions"] = FakeCollection(
        [
            {
                "id": "session-id",
                "branchId": "west",
                "records": [
                    {"studentId": "female-id", "status": "present"},
                    {"studentId": "male-id", "status": "absent"},
                ],
            }
        ]
    )
    database = BranchScopedDatabase(raw)

    update = asyncio.run(
        database.attendance_sessions._scoped_update(
            {"$set": {"records": [{"studentId": "male-id", "status": "present"}]}},
            query={"id": "session-id"},
        )
    )

    assert update["$set"]["records"] == [
        {"studentId": "female-id", "status": "present"},
        {"studentId": "male-id", "status": "present"},
    ]


def test_gender_limited_users_cannot_create_other_gender_students():
    set_access_context("west", ["students.gender.male.view"])
    database = BranchScopedDatabase(FakeRawDatabase())

    async def insert_female_student():
        await database.students.insert_one(
            {"id": "student-id", "student": {"gender": "female"}}
        )

    with pytest.raises(HTTPException) as error:
        asyncio.run(insert_female_student())

    assert error.value.status_code == 403


def test_grade_gender_scopes_include_mixed_lower_grades_and_only_female_upper_students():
    set_default_branch_id("default")
    set_access_context(
        "west",
        [
            "students.scope.lowerGrades.view",
            "students.scope.upperGrades.female.view",
        ],
    )
    raw = FakeRawDatabase()
    raw.collections["classes"] = FakeCollection(
        [
            {"id": "g1", "branchId": "west", "grade": "الصف الأول"},
            {"id": "g2", "branchId": "west", "grade": "Grade 2"},
            {"id": "g3", "branchId": "west", "grade": "الثالث"},
            {"id": "g4", "branchId": "west", "grade": "9"},
            {"id": "g5", "branchId": "west", "grade": "10"},
        ]
    )
    raw.collections["students"] = FakeCollection(
        [
            {"id": "boy-g1", "branchId": "west", "currentClassId": "g1", "student": {"gender": "male"}},
            {"id": "girl-g2", "branchId": "west", "currentClassId": "g2", "student": {"gender": "female"}},
            {"id": "boy-g3", "branchId": "west", "currentClassId": "g3", "student": {"gender": "male"}},
            {"id": "girl-g3", "branchId": "west", "currentClassId": "g3", "student": {"gender": "female"}},
            {"id": "girl-g10", "branchId": "west", "currentClassId": "g5", "student": {"gender": "female"}},
        ]
    )
    database = BranchScopedDatabase(raw)

    visible = asyncio.run(database.students.find({}).to_list(None))

    assert [student["id"] for student in visible] == [
        "boy-g1",
        "girl-g2",
        "girl-g3",
    ]


def test_male_upper_grade_scope_excludes_lower_and_female_students():
    set_default_branch_id("default")
    set_access_context("west", ["students.scope.upperGrades.male.view"])
    raw = FakeRawDatabase()
    raw.collections["classes"] = FakeCollection(
        [
            {"id": "g2", "branchId": "west", "grade": "2"},
            {"id": "g3", "branchId": "west", "grade": "3"},
        ]
    )
    raw.collections["students"] = FakeCollection(
        [
            {"id": "boy-g2", "branchId": "west", "currentClassId": "g2", "student": {"gender": "male"}},
            {"id": "boy-g3", "branchId": "west", "currentClassId": "g3", "student": {"gender": "male"}},
            {"id": "girl-g3", "branchId": "west", "currentClassId": "g3", "student": {"gender": "female"}},
        ]
    )
    database = BranchScopedDatabase(raw)

    visible = asyncio.run(database.students.find({}).to_list(None))

    assert [student["id"] for student in visible] == ["boy-g3"]


def test_grade_gender_scope_blocks_out_of_scope_creation_and_student_updates():
    set_access_context("west", ["students.scope.upperGrades.female.view"])
    raw = FakeRawDatabase(
        [
            {
                "id": "girl-g3",
                "branchId": "west",
                "currentClassId": "g3",
                "student": {"gender": "female"},
            }
        ]
    )
    raw.collections["classes"] = FakeCollection(
        [
            {"id": "g2", "branchId": "west", "grade": "2"},
            {"id": "g3", "branchId": "west", "grade": "3"},
        ]
    )
    database = BranchScopedDatabase(raw)

    async def create_out_of_scope_student():
        await database.students.insert_one(
            {
                "id": "boy-g3",
                "currentClassId": "g3",
                "student": {"gender": "male"},
            }
        )

    with pytest.raises(HTTPException) as creation_error:
        asyncio.run(create_out_of_scope_student())
    with pytest.raises(HTTPException) as update_error:
        asyncio.run(
            database.students._scoped_update(
                {"$set": {"student": {"gender": "male"}}},
                query={"id": "girl-g3"},
            )
        )

    assert creation_error.value.status_code == 403
    assert update_error.value.status_code == 403


def test_full_grade_scopes_do_not_limit_administrator_student_access():
    set_default_branch_id("default")
    set_access_context(
        "west",
        [
            "students.scope.lowerGrades.view",
            "students.scope.upperGrades.male.view",
            "students.scope.upperGrades.female.view",
        ],
    )
    database = BranchScopedDatabase(
        FakeRawDatabase(
            [
                {
                    "id": "legacy-student",
                    "branchId": "west",
                    "currentClassId": "legacy-class",
                    "student": {"gender": "male"},
                }
            ]
        )
    )

    visible = asyncio.run(database.students.find({}).to_list(None))

    assert [student["id"] for student in visible] == ["legacy-student"]


def test_grade_parser_supports_arabic_digits_and_ordinal_grade_names():
    assert _grade_number("الصف التاسع") == 9
    assert _grade_number("الصف ٣") == 3
    assert _grade_number("Grade 10") is None
    assert _grade_number("unrecognized") is None
