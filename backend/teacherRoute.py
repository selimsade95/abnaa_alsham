"""Teacher route exports."""
from routes import (
    list_teachers, import_teachers, get_teacher, create_teacher,
    update_teacher, delete_teacher, reactivate_teacher,
)

__all__ = [
    "list_teachers", "import_teachers", "get_teacher", "create_teacher",
    "update_teacher", "delete_teacher", "reactivate_teacher",
]
