"""
worker/tasks.py — Audit task runner.

In production with Celery: tasks run asynchronously via Celery worker.
In local dev without Celery: tasks run synchronously inside FastAPI's BackgroundTasks.
"""
import asyncio
from datetime import datetime
from fastapi.encoders import jsonable_encoder

from db.database import SessionLocal
from db.models import Scan

from audit_engine.browser_fetcher import browser_scan
from audit_engine.orchestrator import run_audit

# Celery is optional — only needed for async distributed task queue
try:
    from celery import shared_task
    from worker.celery_app import celery_app
    _celery_available = True
except ImportError:
    celery_app = None
    _celery_available = False


def _do_audit(scan_id: int):
    """
    Core audit execution logic. Runs synchronously.
    Called either by Celery task or FastAPI BackgroundTasks.
    """
    db = SessionLocal()
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        db.close()
        return

    scan.status = "processing"
    db.commit()

    try:
        print(f"[worker] Starting Playwright scan for {scan.url}")
        browser_data = browser_scan(scan.url, timeout_ms=30000)
        print(f"[worker] Playwright scan complete for {scan.url}, running analysis engine.")

        # Run analysis orchestration
        audit_result = run_audit(scan.url, browser_data, use_view_source=True)

        # Save results to DB
        scan.status = "completed"
        scan.completed_at = datetime.utcnow()
        scan.scan_method = getattr(audit_result, "scan_method", "browser")
        scores = getattr(audit_result, "scores", None)
        scan.score = getattr(scores, "overall", 0) if scores else 0

        # Serialize complex Pydantic/dataclass objects
        raw_data = jsonable_encoder(audit_result)
        scan.raw_data = raw_data

        db.commit()
    except Exception as e:
        import traceback
        traceback.print_exc()
        scan.status = "failed"
        scan.completed_at = datetime.utcnow()
        db.commit()
        print(f"[worker] Audit task failed for {scan.url}: {e}")
    finally:
        db.close()


def run_website_audit(scan_id: int):
    """
    Public entry point for scanning.
    Works both as a plain function (BackgroundTasks) and as a Celery task.
    """
    _do_audit(scan_id)


# Register as Celery task only when Celery is available
if _celery_available and celery_app is not None:
    run_website_audit = celery_app.task(name="run_website_audit")(_do_audit)
