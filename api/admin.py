"""Administration API. Every route requires the server-side ``admin`` role; operations are logged."""
from __future__ import annotations

import importlib.util
import json
import os
from collections import Counter
from datetime import timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from datatrust import ENGINE_VERSION, accounts, auth, plan_config
from datatrust.db import check_database, get_session
from datatrust.models import AdminAuditLog, Audit, CreditLedger, Profile, utcnow
from datatrust.plan_tests import run_plan_tests
from datatrust.plans import ADMIN, PLAN_IDS, active_config, entitlements, plan_matrix
from datatrust.scoring import SCORING_VERSION
from api.audit import DEEP_MAX_PAGES, MAX_CONCURRENT, RATE_LIMIT, RATE_WINDOW_S

router = APIRouter(prefix="/api/admin", tags=["Admin"])
RAG_CORPUS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "datatrust", "rag", "corpus.json")


def _jwks_status() -> Dict[str, Any]:
    cfg = auth.auth_configured()
    if not cfg["supabase_url"]:
        return {"configured": False}
    try:
        data = auth._fetch_jwks()
        return {"configured": True, "reachable": True, "algs": sorted({k.get("alg") for k in data.get("keys", []) if k.get("alg")})}
    except Exception as exc:
        return {"configured": True, "reachable": False, "error": exc.__class__.__name__}


@router.get("/overview")
async def overview(p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    since = utcnow() - timedelta(days=7)
    status_counts = dict(db.execute(select(Audit.status, func.count()).where(Audit.created_at >= since)
                                    .group_by(Audit.status)).all())
    errors = Counter(c for (c,) in db.execute(select(Audit.error_code).where(Audit.error_code.is_not(None),
                                                                              Audit.created_at >= since)).all())
    durs = [d for (d,) in db.execute(select(Audit.duration_ms).where(Audit.duration_ms.is_not(None),
                                                                      Audit.created_at >= since)).all()]
    durs.sort()
    pct = lambda q: durs[min(len(durs) - 1, int(q * len(durs)))] if durs else None
    corpus = {"available": os.path.exists(RAG_CORPUS)}
    return {
        "engine_version": ENGINE_VERSION, "scoring_version": SCORING_VERSION,
        "services": {
            "database": check_database(),
            "auth": {**auth.auth_configured(), "jwks": _jwks_status(), "issuer": auth.issuer() if auth.supabase_url() else None},
            "browser_runtime_installed": importlib.util.find_spec("playwright") is not None,
            "rag_corpus": corpus,
            "llm_configured": bool(os.getenv("GOOGLE_API_KEY")),
            "dev_admin_mode_env_present": os.getenv("DEV_ADMIN_MODE", "").lower() == "true",
            "dev_admin_mode_effective": False,
        },
        "limits": {"max_concurrent_scans": MAX_CONCURRENT, "anonymous_rate_limit": RATE_LIMIT,
                   "anonymous_rate_window_s": RATE_WINDOW_S, "deep_max_pages": DEEP_MAX_PAGES},
        "audits_last_7_days": {"by_status": status_counts, "total": sum(status_counts.values()),
                               "duration_ms": {"samples": len(durs), "p50": pct(0.5), "p95": pct(0.95) if len(durs) >= 20 else None,
                                               "note": "P95 só é informado com 20 ou mais execuções."},
                               "top_errors": errors.most_common(5)},
        "users": db.execute(select(func.count()).select_from(Profile)).scalar_one(),
    }


@router.get("/audits")
async def audits(status: Optional[str] = None, limit: int = 50, p=Depends(auth.require_admin),
                 db: Session = Depends(get_session)):
    q = select(Audit, Profile.email).join(Profile, Profile.id == Audit.user_id, isouter=True).order_by(Audit.created_at.desc())
    if status:
        q = q.where(Audit.status == status)
    rows = db.execute(q.limit(max(1, min(limit, 200)))).all()
    from datatrust.repository import summary_row
    return {"items": [dict(summary_row(a), user_email=email, plan_at_run=a.plan_at_run) for a, email in rows]}


@router.get("/credits")
async def credits(p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    """Usage in the current calendar month. REAL usage and admin TEST usage are reported separately."""
    start, end = accounts.month_bounds()
    in_month = (CreditLedger.created_at >= start, CreditLedger.created_at < end)
    def by_state(test: int):
        return dict(db.execute(select(CreditLedger.state, func.count()).where(*in_month, CreditLedger.is_test == test)
                               .group_by(CreditLedger.state)).all())
    top = db.execute(select(Profile.email, func.count(), func.count(func.distinct(CreditLedger.domain)))
                     .join(CreditLedger, CreditLedger.user_id == Profile.id)
                     .where(*in_month, CreditLedger.is_test == 0, CreditLedger.state.in_(("reserved", "committed")))
                     .group_by(Profile.email).order_by(func.count().desc()).limit(20)).all()
    by_plan = dict(db.execute(select(CreditLedger.plan, func.count()).where(*in_month, CreditLedger.is_test == 0,
                              CreditLedger.state.in_(("reserved", "committed"))).group_by(CreditLedger.plan)).all())
    return {"period_start": start.isoformat(), "period_end": end.isoformat(), "timezone": "America/Sao_Paulo",
            "period_kind": "calendar_month", "real": {"by_state": by_state(0), "by_plan": by_plan},
            "test": {"by_state": by_state(1), "note": "Saldo de teste do administrador; não é uso de clientes."},
            "by_state": by_state(0),
            "top_users": [{"email": e, "credits": c, "domains": d} for e, c, d in top]}


@router.get("/plans")
async def plans(p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    plan_config.refresh(db)
    m = plan_matrix()
    m["admin_role"] = entitlements(ADMIN)
    m["config"] = active_config()
    m["history"] = plan_config.history(db)
    return m


class PlanEditRequest(BaseModel):
    plans: Dict[str, Dict[str, Any]]
    note: Optional[str] = Field(None, max_length=200)


@router.put("/plans")
async def edit_plans(body: PlanEditRequest, p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    """Publish a NEW config version. Existing subscriptions keep their price snapshot."""
    unknown = set(body.plans) - set(PLAN_IDS)
    if unknown:
        raise HTTPException(400, detail={"error_code": "INVALID_PLAN", "message": f"Planos desconhecidos: {sorted(unknown)}"})
    before = active_config()
    try:
        cfg = plan_config.publish(db, {"plans": body.plans}, p.email or p.user_id, body.note)
    except ValueError as exc:
        raise HTTPException(400, detail={"error_code": "INVALID_CONFIG", "message": str(exc)})
    changes = {pid: {k: [before["plans"][pid].get(k), v] for k, v in cfg["plans"][pid].items()
                     if before["plans"][pid].get(k) != v} for pid in PLAN_IDS}
    accounts.log_admin(db, p.email or p.user_id, "plans.publish", f"v{cfg['version']}",
                       {"changes": {k: v for k, v in changes.items() if v}, "note": body.note})
    return {"version": cfg["version"], "config": cfg, "changes": {k: v for k, v in changes.items() if v}}


# ── administrator TEST CONTEXT (server-side; replaces any client-side "view as") ──
class TestContextRequest(BaseModel):
    plan: str = Field(pattern="^(admin|free|pro|premium)$")
    quota_state: str = Field("available", pattern="^(available|exhausted)$")
    subscription_state: str = Field("active", pattern="^(active|expired|payment_failed)$")


@router.get("/test-context")
async def get_test_context(p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    return {"test_context": p.test, "plan": p.plan, "quota": accounts.quota_snapshot(db, p.profile, p.ctx)}


@router.post("/test-context")
async def set_test_context(body: TestContextRequest, p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    """Switch the administrator's own effective context. Never touches other users, real
    subscriptions, real balances or billing. Logged with actor, time and scope."""
    try:
        accounts.set_test_context(db, p.profile, body.plan, body.quota_state, body.subscription_state)
    except ValueError:
        raise HTTPException(400, detail={"error_code": "INVALID_TEST_CONTEXT", "message": "Contexto de teste inválido."})
    ctx = accounts.resolve_context(db, p.profile)
    return accounts.me_payload(db, p.profile, ctx)


@router.post("/test-context/reset-balance")
async def reset_test_balance(p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    n = accounts.reset_test_balance(db, p.profile)
    ctx = accounts.resolve_context(db, p.profile)
    return {"deleted_test_rows": n, "quota": accounts.quota_snapshot(db, p.profile, ctx)}


@router.get("/billing")
async def billing_status(p=Depends(auth.require_admin)):
    """What is missing to activate payments. No gateway is chosen or connected here."""
    return {
        "enabled": False,
        "gateway": None,
        "missing": [
            {"id": "gateway_choice", "label": "Escolher o provedor de pagamento (decisão do proprietário)"},
            {"id": "gateway_secret", "label": "Chave secreta do provedor no servidor (nunca em VITE_*)"},
            {"id": "webhook_secret", "label": "Segredo de assinatura dos webhooks para validar origem"},
            {"id": "webhook_url", "label": "URL pública do backend para receber eventos de pagamento"},
            {"id": "product_ids", "label": "IDs de produto/preço no provedor para Pro (9700 BRL) e Premium (24700 BRL)"},
            {"id": "tax_invoice", "label": "Definição de emissão fiscal (NF-e/NFS-e), se aplicável"},
        ],
        "rules": ["Recursos pagos só são concedidos por evento de pagamento validado no servidor (origem + idempotência).",
                  "A página de sucesso do navegador nunca concede plano.",
                  "Sem planos anuais, excedente ou recarga automática neste escopo."],
    }


class PlanTestRequest(BaseModel):
    plan: str = Field("free", pattern="^(free|pro|premium)$")


@router.post("/plan-tests")
async def plan_tests(body: PlanTestRequest, p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    result = run_plan_tests(body.plan)
    accounts.log_admin(db, p.email or p.user_id, "plan_tests", body.plan, {"passed": result["passed"], "failed": result["failed"]})
    return result


class RoleRequest(BaseModel):
    user_id: str
    role: str = Field(pattern="^(admin|user)$")


@router.post("/users/role")
async def set_role(body: RoleRequest, p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    if body.user_id == p.user_id and body.role != "admin":
        raise HTTPException(400, detail={"error_code": "SELF_DEMOTION", "message": "You cannot remove your own administrator role."})
    try:
        return accounts.set_role(db, body.user_id, body.role, p.email or p.user_id)
    except LookupError:
        raise HTTPException(404, detail={"error_code": "NOT_FOUND", "message": "User profile not found."})


class SubscriptionRequest(BaseModel):
    user_id: str
    plan: str = Field(pattern="^(free|pro|premium)$")
    status: str = Field("active", pattern="^(active|canceled|past_due)$")
    days: int = Field(30, ge=1, le=3660)


@router.post("/subscriptions")
async def set_subscription(body: SubscriptionRequest, p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    """Manual plan assignment (support/testing accounts). Logged. Does not touch billing or prices."""
    import uuid as _uuid
    from datatrust.models import Subscription
    if db.get(Profile, body.user_id) is None:
        raise HTTPException(404, detail={"error_code": "NOT_FOUND", "message": "User profile not found."})
    now = utcnow()
    ent = entitlements(body.plan)
    sub = Subscription(id=str(_uuid.uuid4()), user_id=body.user_id, plan=body.plan, status=body.status,
                       current_period_start=now, current_period_end=now + timedelta(days=body.days),
                       source=f"admin:{p.email or p.user_id}", created_at=now, updated_at=now,
                       price_cents=ent["price_cents"], currency=ent["currency"], plan_config_version=ent["config_version"])
    db.add(sub)
    db.commit()
    accounts.log_admin(db, p.email or p.user_id, "set_subscription", body.user_id,
                       {"plan": body.plan, "status": body.status, "days": body.days})
    return {"user_id": body.user_id, "plan": body.plan, "status": body.status,
            "current_period_end": sub.current_period_end.isoformat(),
            "effective_plan": accounts.effective_plan_id(db, db.get(Profile, body.user_id))}


@router.get("/log")
async def log(limit: int = 100, p=Depends(auth.require_admin), db: Session = Depends(get_session)):
    rows = db.execute(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(max(1, min(limit, 500)))).scalars().all()
    return {"items": [{"actor": r.actor, "action": r.action, "target": r.target, "details": json.loads(r.details or "{}"),
                       "at": r.created_at.isoformat()} for r in rows]}
