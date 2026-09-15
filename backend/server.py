"""Application entry point.

The API implementation lives in routes.py; request models live in models.py;
shared authentication, access-control, and code-generation logic lives in
services.py. This module stays intentionally small so the existing command
`uvicorn server:app` continues to work.
"""

from routes import app

__all__ = ["app"]
