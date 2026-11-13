from typing import List, Optional

from pydantic import BaseModel


class StudentIn(BaseModel):
    student: dict
    siblings: List[dict] = []
    father: dict = {}
    mother: dict = {}
    general: dict = {}
    previousEducation: List[dict] = []
    islamicLegalEducation: Optional[str] = ""
    bestAchievement: Optional[str] = ""
    otherInfo: dict = {}
    signing: dict = {}
    fees: dict = {}
    initialPayment: Optional[dict] = None
    fullInfo: dict = {}
    currentClassId: Optional[str] = None


class StudentNoteIn(BaseModel):
    shareWithParent: Optional[bool] = None
    content: str
