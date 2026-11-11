from fastapi import Depends, HTTPException

from school.core.services import get_current_user


def require_any_permission(*permissions):
    async def checker(current=Depends(get_current_user)):
        if not any(permission in (current.get("permissions") or []) for permission in permissions):
            raise HTTPException(403, "لا تملك صلاحية الوصول إلى الحضور")
        return current
    return checker
