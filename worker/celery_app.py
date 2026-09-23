"""
worker/celery_app.py — Celery application configuration.

Celery is optional for local development. When not installed, this module
exports celery_app = None and the tasks run synchronously via BackgroundTasks.
"""
import os

try:
    from celery import Celery as _Celery

    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    celery_app = _Celery(
        "gtm_audit_worker",
        broker=REDIS_URL,
        backend=REDIS_URL,
        include=["worker.tasks"]
    )

    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="America/Sao_Paulo",
        enable_utc=True,
        task_track_started=True,
        worker_concurrency=2,  # Playwright is heavy
    )

except ImportError:
    celery_app = None
