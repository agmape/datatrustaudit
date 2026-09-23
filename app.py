"""Vercel/FastAPI entrypoint with a fail-safe boot path.

The primary application lives in main.py. If an unexpected import-time error
still happens there, this module keeps the deployment alive long enough to
serve the built frontend (when present) and expose /health diagnostics instead
of returning Vercel FUNCTION_INVOCATION_FAILED.
"""
import os
import traceback

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BOOT_ERROR = None

try:
    from main import app as app
except Exception as exc:  # last-resort serverless safety net
    BOOT_ERROR = f"{type(exc).__name__}: {exc}"
    traceback.print_exc()

    app = FastAPI(
        title="DataTrust Audit - Recovery Mode",
        version="2.0.0-recovery",
    )

    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, "static", "dist")
    index_file = os.path.join(static_dir, "index.html")
    assets_dir = os.path.join(static_dir, "assets")

    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/health")
    async def recovery_health():
        return JSONResponse(
            {
                "status": "degraded",
                "mode": "recovery",
                "boot_error": BOOT_ERROR,
                "frontend_available": os.path.isfile(index_file),
            },
            status_code=200,
        )

    @app.get("/")
    async def recovery_root():
        if os.path.isfile(index_file):
            return FileResponse(
                index_file,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        return JSONResponse(
            {
                "status": "degraded",
                "mode": "recovery",
                "message": "Backend boot failed and frontend build was not bundled.",
                "boot_error": BOOT_ERROR,
                "health": "/health",
            },
            status_code=200,
        )

    @app.get("/{full_path:path}")
    async def recovery_spa(full_path: str):
        if os.path.isfile(index_file):
            return FileResponse(
                index_file,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        return JSONResponse(
            {"error": "frontend build not available", "boot_error": BOOT_ERROR},
            status_code=404,
        )

__all__ = ["app"]
