from typing import List, Optional

from pydantic import BaseModel


class SubjectIn(BaseModel):
    name: str
    code: Optional[str] = ""
    status: Optional[str] = "active"
    notes: Optional[str] = ""


class TeacherSubjectIn(BaseModel):
    teacherId: str
    subjectId: str


class ClassSubjectIn(BaseModel):
    classId: str
    subjectId: str
    teacherIds: List[str] = []
