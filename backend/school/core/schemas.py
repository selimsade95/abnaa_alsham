from pydantic import BaseModel


class DeactivationIn(BaseModel):
    reason: str
