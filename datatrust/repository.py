"""Audit persistence. Reports are stored already masked (the pipeline redacts before building Evidence)."""
from __future__ import annotations

import base64
import gzip
import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .models import Audit, CreditLedger, utcnow


def pack(report: Dict[str, Any]) -> str:
    return base64.b64encode(gzip.compress(json.dumps(report, ensure_ascii=False).encode("utf-8"), 6)).decode("ascii")


def unpack(blob: str) -> Dict[str, Any]:
    return json.loads(gzip.decompress(base64.b64decode(blob)).decode("utf-8"))


def begin_audit(db: Session, audit_id: str, user_id: Optional[str], url: str, mode: str, plan: str, language: str,
                is_test: bool = False) -> Audit:
    host = (urlsplit(url if "://" in url else "https://" + url).hostname or "")[:253]
    a = Audit(id=audit_id, user_id=user_id, url=url[:2048], domain=host, mode=mode, status="running",
              language=language, plan_at_run=plan, created_at=utcnow(), is_test=1 if is_test else 0)
    db.add(a)
    db.commit()
    return a


def finish_audit(db: Session, audit_id: str, report: Dict[str, Any]) -> Optional[Audit]:
    a = db.get(Audit, audit_id)
    if a is None:
        return None
    a.status = report.get("status") or ("completed" if report.get("success") else "failed")
    a.error_code = report.get("error_code")
    a.engine_version = report.get("engine_version")
    a.scoring_version = report.get("scoring_version")
    a.finished_at = utcnow()
    a.duration_ms = report.get("duration_ms")
    a.runtime_observed = 1 if (report.get("capabilities") or {}).get("runtime_js") else 0
    a.findings_count = len(report.get("findings") or [])
    a.report_gz_b64 = pack(report) if report.get("success") else None
    db.commit()
    return a


def fail_audit(db: Session, audit_id: str, status: str, error_code: str) -> None:
    db.execute(update(Audit).where(Audit.id == audit_id).values(
        status=status, error_code=error_code, finished_at=utcnow()))
    db.commit()


def recover_interrupted(db: Session) -> int:
    """Controlled recovery on startup: audits still 'running' belong to a process that no longer exists."""
    rows = db.execute(select(Audit).where(Audit.status == "running")).scalars().all()
    for a in rows:
        a.status, a.error_code, a.finished_at = "failed", "INTERRUPTED", utcnow()
        db.execute(update(CreditLedger).where(CreditLedger.audit_id == a.id, CreditLedger.state == "reserved")
                   .values(state="released", reason="interrupted", updated_at=utcnow()))
    db.commit()
    return len(rows)


def summary_row(a: Audit) -> Dict[str, Any]:
    iso = lambda d: d.isoformat() if isinstance(d, datetime) else None
    return {"id": a.id, "url": a.url, "domain": a.domain, "mode": a.mode, "status": a.status,
            "error_code": a.error_code, "created_at": iso(a.created_at), "finished_at": iso(a.finished_at),
            "duration_ms": a.duration_ms, "findings_count": a.findings_count,
            "runtime_observed": bool(a.runtime_observed), "has_report": bool(a.report_gz_b64),
            "plan_at_run": a.plan_at_run, "is_test": bool(a.is_test)}


def list_audits(db: Session, user_id: str, visible_limit: int) -> Dict[str, Any]:
    total = db.execute(select(func.count()).select_from(Audit).where(Audit.user_id == user_id)).scalar_one()
    rows = db.execute(select(Audit).where(Audit.user_id == user_id).order_by(Audit.created_at.desc())
                      .limit(visible_limit)).scalars().all()
    return {"items": [summary_row(a) for a in rows], "total": total, "visible_limit": visible_limit,
            "hidden_by_plan": max(0, total - len(rows))}


def visible_ids(db: Session, user_id: str, visible_limit: int) -> set:
    return set(db.execute(select(Audit.id).where(Audit.user_id == user_id).order_by(Audit.created_at.desc())
                          .limit(visible_limit)).scalars().all())
