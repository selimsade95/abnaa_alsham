"""Student route exports.

HTTP registration remains centralized in routes.py during this incremental
migration; these exports provide a stable domain boundary for future moves.
"""
from routes import (
    list_students, import_students, get_student, validate_student,
    get_student_full, create_student, update_student, delete_student,
    reactivate_student, get_public_personal_photo,
)

__all__ = [
    "list_students", "import_students", "get_student", "validate_student",
    "get_student_full", "create_student", "update_student", "delete_student",
    "reactivate_student", "get_public_personal_photo",
]
