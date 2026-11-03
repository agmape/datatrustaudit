"""Account endpoints: /api/me, /api/plans, /api/audits (history; ownership enforced on every route)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from datatrust import accounts, repository
from datatrust.auth import Principal, require_user
from datatrust.db import get_session
from datatrust.models import Audit
from datatrust.plans import entitlements, plan_matrix
from api.audit import present

router = APIRouter(prefix="/api", tags=["Account"])


@router.get("/plans")
async def plans(db: Session = Depends(get_session)):
    from datatrust import plan_config
    plan_config.refresh(db)
    return plan_matrix()


@router.get("/me")
async def me(p: Principal = Depends(require_user), db: Session = Depends(get_session)):
    return accounts.me_payload(db, p.profile, p.ctx)


def _own_or_404(db: Session, audit_id: str, p: Principal) -> Audit:
    a = db.get(Audit, audit_id)
    # 404 (not 403) for other users' audits: do not reveal that the id exists
    if a is None or a.user_id != p.user_id:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": "Audit not found."})
    return a


@router.get("/audits")
async def list_audits(p: Principal = Depends(require_user), db: Session = Depends(get_session)):
    limit = entitlements(p.plan)["history_limit"]
    return repository.list_audits(db, p.user_id, limit)


@router.get("/audits/{audit_id}")
async def get_audit(audit_id: str, language: str = Query("pt-BR"), p: Principal = Depends(require_user),
                    db: Session = Depends(get_session)):
    a = _own_or_404(db, audit_id, p)
    if audit_id not in repository.visible_ids(db, p.user_id, entitlements(p.plan)["history_limit"]):
        raise HTTPException(status_code=403, detail={"error_code": "HISTORY_LIMIT",
                                                      "message": "This audit is outside your plan's visible history."})
    if not a.report_gz_b64:
        return {"success": False, "audit": repository.summary_row(a),
                "message": "This audit has no stored report (it did not finish with a result)."}
    report = repository.unpack(a.report_gz_b64)
    # same visibility rule as the original response, for the viewer's CURRENT plan/test context:
    # reopening never consumes an analysis and never reveals more than the plan allows
    out = present(report, language, p.plan)
    out["audit_id"] = a.id
    out["plan"] = p.plan
    out["simulated_plan"] = p.simulated
    out["test_context"] = p.test
    return out


@router.delete("/audits/{audit_id}")
async def delete_audit(audit_id: str, p: Principal = Depends(require_user), db: Session = Depends(get_session)):
    a = _own_or_404(db, audit_id, p)
    db.delete(a)
    db.commit()
    return {"deleted": audit_id}
