from pydantic import BaseModel


class BranchIn(BaseModel):
    name: str
    active: bool = True


class SelectBranchIn(BaseModel):
    branchId: str
