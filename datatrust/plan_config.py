"""Versioned plan configuration persistence (``plan_config_versions``)."""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import plans
from .models import PlanConfigVersion, utcnow


def latest_version(db: Session) -> Optional[int]:
    return db.execute(select(func.max(PlanConfigVersion.version))).scalar_one_or_none()


def refresh(db: Session) -> Dict[str, Any]:
    """Load the newest stored version into the process (defaults when none was published)."""
    v = latest_version(db)
    if v is None:
        if plans.active_version() != plans.DEFAULT_CONFIG["version"] or plans.active_config() != plans.DEFAULT_CONFIG:
            plans.set_active_config(plans.DEFAULT_CONFIG)
        return plans.active_config()
    if v != plans.active_version():
        row = db.execute(select(PlanConfigVersion).where(PlanConfigVersion.version == v)).scalar_one()
        plans.set_active_config(json.loads(row.config))
    return plans.active_config()


def publish(db: Session, edited: Dict[str, Any], actor: str, note: Optional[str] = None) -> Dict[str, Any]:
    """Validate and store a NEW version (never edits an existing one). Existing subscriptions keep
    their own price snapshot, so publishing never re-prices subscribers."""
    current = refresh(db)
    merged = {"plans": {pid: dict(current["plans"][pid], **((edited.get("plans") or {}).get(pid) or {}))
                        for pid in plans.PLAN_IDS}}
    new_version = max(latest_version(db) or 1, plans.active_version()) + 1
    merged["version"] = new_version
    cfg = plans.validate_config(merged)
    db.add(PlanConfigVersion(id=str(uuid.uuid4()), version=new_version, config=plans.config_json(cfg),
                             created_by=actor, note=(note or "")[:200], created_at=utcnow()))
    db.commit()
    plans.set_active_config(cfg)
    return cfg


def history(db: Session, limit: int = 20) -> List[Dict[str, Any]]:
    rows = db.execute(select(PlanConfigVersion).order_by(PlanConfigVersion.version.desc()).limit(limit)).scalars().all()
    return [{"version": r.version, "created_by": r.created_by, "note": r.note,
             "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]
