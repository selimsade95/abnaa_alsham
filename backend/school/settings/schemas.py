from typing import List, Literal

from pydantic import BaseModel


class RegistrationPathsIn(BaseModel):
    paths: List[str]


class DiscountOptionIn(BaseModel):
    name: str
    percentage: float
    category: Literal["general", "siblings_staff"] = "general"


class DiscountOptionsIn(BaseModel):
    options: List[DiscountOptionIn]


class CodeSettingsIn(BaseModel):
    students: dict
    teachers: dict
    classes: dict
    resetYearly: bool = True
