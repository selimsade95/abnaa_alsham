from typing import List, Optional

from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    username: str
    password: str
    roles: List[str] = []
    teacherId: Optional[str] = None
    branchIds: Optional[List[str]] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    roles: Optional[List[str]] = None
    teacherId: Optional[str] = None
    branchIds: Optional[List[str]] = None
