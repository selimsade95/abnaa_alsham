import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from starlette.background import BackgroundTask
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from school.audit import middleware


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_audited_mutation_sends_complete_response(monkeypatch, method):
    audit_records = []

    class AuditLogs:
        async def insert_one(self, record):
            audit_records.append(record)

    monkeypatch.setattr(middleware, "raw_db", SimpleNamespace(audit_logs=AuditLogs()))
    app = FastAPI()
    app.middleware("http")(middleware.audit_data_changes)
    body = b'{"name":"Student"}'
    saved = []

    @app.api_route("/api/students", methods=[method])
    async def mutate(payload: dict):
        saved.append(payload)

        async def chunks():
            yield b"sa"
            await asyncio.sleep(0.01)
            yield b"ved"

        return StreamingResponse(chunks(), headers={"content-length": "5"})

    async def run():
        messages = []
        request_delivered = False
        response_finished = asyncio.Event()

        async def receive():
            nonlocal request_delivered
            if not request_delivered:
                request_delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            await response_finished.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            messages.append(message)
            if message["type"] == "http.response.body" and not message.get("more_body"):
                response_finished.set()

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": "/api/students",
            "query_string": b"",
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
        await asyncio.wait_for(app(scope, receive, send), timeout=2)
        return messages

    start, *response = asyncio.run(run())
    assert start["status"] == 200
    assert dict(start["headers"])[b"content-length"] == b"5"
    assert b"".join(message["body"] for message in response) == b"saved"
    assert not response[-1]["more_body"]
    assert saved == [{"name": "Student"}]
    assert [record["requestLabel"] for record in audit_records] == ["Student"]


def test_mutation_response_waits_for_audit_write(monkeypatch):
    events = []

    async def run():
        audit_gate = asyncio.Event()
        audit_started = asyncio.Event()

        class AuditLogs:
            async def insert_one(self, record):
                audit_started.set()
                await audit_gate.wait()
                events.append(("audit", record))

        monkeypatch.setattr(middleware, "raw_db", SimpleNamespace(audit_logs=AuditLogs()))
        body = b'{"name":"Student"}'

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/students",
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }

        async def call_next(_request):
            events.append(("route", None))

            async def existing_background_task():
                events.append(("existing-background", None))

            return Response("saved", background=BackgroundTask(existing_background_task))

        pending_response = asyncio.create_task(
            middleware.audit_data_changes(Request(scope, receive), call_next)
        )
        try:
            await asyncio.wait_for(audit_started.wait(), timeout=2)
            assert not pending_response.done()
        finally:
            audit_gate.set()
        response = await pending_response
        assert [event[0] for event in events] == ["route", "audit"]

        async def send(message):
            if message["type"] == "http.response.body" and message.get("body"):
                events.append(("response", message["body"]))

        await response(scope, receive, send)

    asyncio.run(run())
    assert [event[0] for event in events] == [
        "route",
        "audit",
        "response",
        "existing-background",
    ]
    assert events[1][1]["requestLabel"] == "Student"
