import asyncio
from datetime import datetime, timezone

import services


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []
        self.sequence = 0

    async def find_one(self, query, projection=None):
        return next(
            (document for document in self.documents if all(
                document.get(key) == value for key, value in query.items()
            )),
            None,
        )

    async def find_one_and_update(self, query, update, **kwargs):
        self.sequence += update["$inc"]["sequence"]
        return {"sequence": self.sequence}


class FakeDatabase:
    def __init__(self, settings, classes):
        self.settings = FakeCollection([settings])
        self.counters = FakeCollection()
        self.classes = FakeCollection(classes)

    def __getitem__(self, name):
        return getattr(self, name)


def test_generate_code_skips_codes_already_in_use():
    year = datetime.now(timezone.utc).year
    database = FakeDatabase(
        {
            "id": "code_generation",
            "classes": {
                "prefix": "CLS",
                "format": "{PREFIX}-{YEAR}-{SEQ:6}",
            },
            "resetYearly": True,
        },
        [{"code": f"CLS-{year}-000001"}],
    )
    previous_database = services._db
    services._db = database
    try:
        code = asyncio.run(services.generate_code("classes"))
    finally:
        services._db = previous_database

    assert code == f"CLS-{year}-000002"
    assert database.counters.sequence == 2
