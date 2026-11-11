from typing import List, Optional

from pydantic import BaseModel, Field


class PaymentIn(BaseModel):
    student: str
    academicYear: str
    feeType: str = "academic"
    semester: str
    amount: float
    paymentDate: str
    notes: Optional[str] = ""


class PaymentAllocationIn(BaseModel):
    student: str
    amount: float


class PaymentSplitIn(BaseModel):
    academicYear: str
    feeType: str = "academic"
    semester: str
    totalAmount: float
    allocations: List[PaymentAllocationIn] = Field(min_length=1)
    paymentDate: str
    notes: Optional[str] = ""


class RefundIn(BaseModel):
    student: str
    academicYear: str
    feeType: str = "academic"
    semester: str
    amount: float
    paymentDate: str
    notes: Optional[str] = ""
