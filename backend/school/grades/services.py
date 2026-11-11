from school.core.database import db


async def get_grade_settings():
    settings = await db.settings.find_one({"id": "grades"}, {"_id": 0})
    return settings or {"id": "grades", "accepting": False}
