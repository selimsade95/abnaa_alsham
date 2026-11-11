from typing import List

from pydantic import BaseModel, Field


class HomeworkIn(BaseModel):
    classId: str
    subjectId: str
    studentIds: List[str] = Field(min_length=1)
