from typing import List, Optional

from pydantic import BaseModel


class RoleIn(BaseModel):
    name: str
    description: Optional[str] = ""
    permissions: List[str] = []
