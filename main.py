"""
DataTrust Audit — application entry point.

There is exactly ONE audit pipeline (datatrust.pipeline.run_scan) exposed via
api/audit.py. No login, plan or database is required to scan or read results.

    uvicorn main:app --host 0.0.0.0 --port 8000
"""
import importlib.util
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from api import accounts as accounts_api, admin as admin_api, audit  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from datatrust import auth as dt_auth  # noqa: E402
from datatrust import repository  # noqa: E402
from datatrust.db import check_database, run_migrations, session_scope  # noqa: E402
from datatrust import ENGINE_VERSION  # noqa: E402
from datatrust.scoring import SCORING_VERSION  # noqa: E402

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("datatrust")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static" / "dist"
RAG_CORPUS = BASE_DIR / "datatrust" / "rag" / "corpus.json"

@asynccontextmanager
async def lifespan(_app: FastAPI):
    applied = run_migrations()
    if applied:
        log.info("database migrations applied: %s", applied)
    with session_scope() as db:
        recovered = repository.recover_interrupted(db)
        from datatrust import plan_config
        plan_config.refresh(db)
    if recovered:
        log.warning("recovered %s interrupted audit(s) (marked failed, credits released)", recovered)
    if os.getenv("DEV_ADMIN_MODE", "").lower() == "true" or os.getenv("VITE_DEV_ADMIN_MODE", "").lower() == "true":
        log.warning("DEV_ADMIN_MODE is set in the environment but is IGNORED: there is no synthetic/dev administrator access.")
    cfg = dt_auth.auth_configured()
    if not (cfg["supabase_url"] and cfg["jwt_secret"]):
        log.warning("Supabase auth is not fully configured (%s): sign-in will be unavailable; public scans keep working.", cfg)
    yield


app = FastAPI(title="DataTrust Audit API", version=ENGINE_VERSION, lifespan=lifespan,
              description="Evidence-first website tracking & privacy audit (public basic scan + accounts).")

_origins = [o.strip() for o in os.getenv("DATATRUST_CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "DELETE"],
                   allow_headers=["Content-Type", "Authorization"])


@app.exception_handler(RequestValidationError)
async def _validation(request: Request, exc: RequestValidationError):
    return JSONResponse({"success": False, "status": "failed", "error_code": "INVALID_REQUEST",
                         "message": "Invalid request payload.", "details": exc.errors()}, status_code=422)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse({"success": False, "status": "failed", "error_code": "INTERNAL_ERROR",
                         "message": "Internal error. No audit result is reported."}, status_code=500)


@app.get("/health")
async def health():
    corpus = {"available": False}
    if RAG_CORPUS.exists():
        try:
            data = json.loads(RAG_CORPUS.read_text(encoding="utf-8"))
            corpus = {"available": True, "chunks": len(data.get("chunks", [])), "built_at": data.get("built_at"),
                      "failed_sources": len(data.get("failed_sources", []))}
        except Exception:
            corpus = {"available": False, "error": "unreadable"}
    db = check_database()
    return {"status": "ok" if db["ok"] else "degraded", "database": db,
            "auth": {k: v for k, v in dt_auth.auth_configured().items() if k != "jwks_url"},
            "engine_version": ENGINE_VERSION, "scoring_version": SCORING_VERSION,
            "browser_runtime_installed": importlib.util.find_spec("playwright") is not None,
            "rag_corpus": corpus, "llm_configured": bool(os.getenv("GOOGLE_API_KEY")),
            "frontend_built": (STATIC_DIR / "index.html").exists()}


app.include_router(audit.router)
app.include_router(accounts_api.router)
app.include_router(admin_api.router)

if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    if full_path.startswith(("api/", "assets/")):
        return JSONResponse({"error": "not found"}, status_code=404)
    candidate = (STATIC_DIR / full_path).resolve()
    if full_path and candidate.is_file() and STATIC_DIR.resolve() in candidate.parents:
        return FileResponse(candidate)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"error": "frontend not built; run `npm run build` in static/ or use the Vite dev server"},
                        status_code=404)
