"""
Audit API.

Direction (owner decision, 28/10/2026): running an analysis requires a verified account (Free needs
no card). Every plan sees the same collection; the plan only decides how many DETAILS are released
(visibility 30/70/100%, applied here on the server). Monthly/daily/domain quotas are enforced here.

    POST /api/audit            single-page scan
    POST /api/audit/deep       multi-page scan (Pro/Premium/admin)
    GET  /api/methodology      scoring weights, catalog, limitations (versioned)
    POST /api/explain          RAG explanations for findings (optional layer, never detection)
    POST /api/chat             assistant grounded ONLY on the confirmed report context
"""
from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
import uuid
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from datatrust import ENGINE_VERSION, accounts, repository
from datatrust.auth import Principal, get_principal
from datatrust.catalog import CATEGORIES, VENDORS
from datatrust.db import get_session
from datatrust.i18n import localize_report
from datatrust.i18n.rulebook import normalize_lang
from datatrust.pipeline import BASE_LIMITATIONS, DISCLAIMER, ScanOptions, run_scan
from datatrust.plans import ANON, entitlements  # noqa: F401
from datatrust.visibility import apply_visibility
from datatrust.scoring import DEFINED_CHECKS, MIN_GLOBAL_COVERAGE, SCORING_VERSION, WEIGHTS

log = logging.getLogger("datatrust.api")
router = APIRouter(prefix="/api", tags=["Audit"])

MAX_CONCURRENT = int(os.getenv("DATATRUST_MAX_CONCURRENT_SCANS", "2"))
RATE_LIMIT = int(os.getenv("DATATRUST_RATE_LIMIT_SCANS", "12"))          # anonymous scans per window per client IP
RATE_WINDOW_S = int(os.getenv("DATATRUST_RATE_WINDOW_S", "600"))
DEEP_MAX_PAGES = int(os.getenv("DATATRUST_DEEP_MAX_PAGES", "10"))

_sem = threading.BoundedSemaphore(MAX_CONCURRENT)
_hits: Dict[str, Deque[float]] = defaultdict(deque)
_hits_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    if os.getenv("DATATRUST_TRUST_PROXY", "0") == "1":
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.time()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW_S:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return True
        q.append(now)
        return False


class AuditRequest(BaseModel):
    url: str = Field(..., max_length=2048)
    consent_phases: bool = True
    explain: bool = False
    language: str = "pt-BR"


class DeepAuditRequest(AuditRequest):
    max_pages: int = Field(5, ge=1, le=10)


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    body = {"success": False, "status": "failed", "error_code": code, "message": message,
            "tags": [], "findings": [], "evidence": [], "cookies": [], "storage": [],
            "scores": {"overall": {"score": None, "null_reason": message}, "axes": {}}}
    body.update(extra)
    return JSONResponse(body, status_code=status)


def _fmt_local(dt) -> str:
    return dt.astimezone(accounts.TZ).strftime("%d/%m/%Y %H:%M") if dt else "-"


def _quota_message(q: "accounts.QuotaExceeded", plan_name: str, lang: str) -> str:
    when = _fmt_local(q.renews_at)
    if lang == "pt-BR":
        msg = {"monthly": f"Você usou as {q.limit} análises do mês no plano {plan_name}. Renova em {when} (horário de Brasília).",
               "daily": f"O plano {plan_name} permite {q.limit} análise por dia. Próxima liberação em {when} (horário de Brasília).",
               "domains": f"O plano {plan_name} permite {q.limit} domínio(s) distinto(s) por período. Você já usou {q.used}. "
                          f"Analise um domínio já usado ou aguarde a renovação em {when}."}[q.kind]
        return msg + (" (Saldo de teste simulado como esgotado.)" if q.simulated else "")
    msg = {"monthly": f"You used all {q.limit} monthly analyses of the {plan_name} plan. Renews at {when} (Brasília time).",
           "daily": f"The {plan_name} plan allows {q.limit} analysis per day. Next one available at {when} (Brasília time).",
           "domains": f"The {plan_name} plan allows {q.limit} distinct domain(s) per period. You already used {q.used}. "
                      f"Analyse a domain already used or wait for the renewal at {when}."}[q.kind]
    return msg + (" (Test balance simulated as exhausted.)" if q.simulated else "")


def present(report: Dict[str, Any], lang: str, plan: str) -> Dict[str, Any]:
    """Localize, then apply the plan visibility ON THE SERVER (withheld records never leave)."""
    return apply_visibility(localize_report(report, lang), plan, lang)


async def _execute(request: Request, url: str, opts: ScanOptions, mode: str, language: str,
                   principal: Principal, db: Session) -> JSONResponse:
    lang = normalize_lang(language)
    pt = lang == "pt-BR"

    # ── access rules (server side) ──────────────────────────────────────────
    if principal.anonymous:
        return _error(401, "AUTH_REQUIRED",
                      "Crie uma conta grátis (sem cartão) ou entre para executar análises." if pt
                      else "Create a free account (no card) or sign in to run analyses.")
    ent = entitlements(principal.plan)
    if ent["requires_verified_account"] and not principal.email_verified:
        return _error(403, "EMAIL_NOT_VERIFIED", "Confirme seu e-mail para executar análises." if pt
                      else "Confirm your e-mail to run analyses.")
    if mode == "deep" and not ent["deep_scan"]:
        return _error(403, "PLAN_FEATURE_UNAVAILABLE",
                      "A varredura de várias páginas exige o plano Pro ou Premium." if pt
                      else "The multi-page scan requires the Pro or Premium plan.",
                      feature="deep_scan", plan=principal.plan, required_plan="pro")
    if mode == "deep":
        opts.max_pages = max(1, min(opts.max_pages, ent["max_deep_pages"], DEEP_MAX_PAGES))

    audit_id = str(uuid.uuid4())
    ctx = principal.ctx or accounts.resolve_context(db, principal.profile)
    try:
        accounts.reserve_credit(db, principal.profile, ctx, audit_id, url)
    except accounts.QuotaExceeded as q:
        snap = accounts.quota_snapshot(db, principal.profile, ctx)
        return _error(429, {"monthly": "QUOTA_EXCEEDED", "daily": "DAILY_LIMIT", "domains": "DOMAIN_LIMIT"}[q.kind],
                      _quota_message(q, ent["plan_name"], lang), quota=snap, quota_kind=q.kind,
                      renews_at=q.renews_at.isoformat() if q.renews_at else None, test_context=principal.test)
    repository.begin_audit(db, audit_id, principal.user_id, url, mode, principal.plan, lang, is_test=principal.simulated)

    acquired = await asyncio.to_thread(_sem.acquire, True, 45)
    if not acquired:
        accounts.finalize_credit(db, audit_id, "failed", False, "busy")
        repository.fail_audit(db, audit_id, "failed", "BUSY")
        return _error(503, "BUSY", "O scanner está ocupado. Tente novamente em um minuto." if pt
                      else "The scanner is busy. Please try again in a minute.")
    report: Dict[str, Any] = {}
    try:
        report = await asyncio.wait_for(asyncio.to_thread(run_scan, url, opts, scan_id=audit_id),
                                        timeout=opts.total_budget_s + 90)
    except asyncio.TimeoutError:
        accounts.finalize_credit(db, audit_id, "timeout", False, "timeout")
        repository.fail_audit(db, audit_id, "timed_out", "TIMEOUT")
        return _error(504, "TIMEOUT", "A auditoria excedeu o tempo máximo. Nenhum resultado é informado." if pt
                      else "The scan exceeded the maximum time budget. No result is reported.")
    except Exception as exc:
        log.exception("scan crashed")
        accounts.finalize_credit(db, audit_id, "failed", False, "crash")
        repository.fail_audit(db, audit_id, "failed", "SCAN_ERROR")
        return _error(500, "SCAN_ERROR", f"Erro interno do scanner ({exc.__class__.__name__}). Nenhum resultado é informado."
                      if pt else f"Internal scanner error ({exc.__class__.__name__}). No result is reported.")
    finally:
        _sem.release()

    runtime = bool((report.get("capabilities") or {}).get("runtime_js"))
    repository.finish_audit(db, audit_id, report)
    state = accounts.finalize_credit(db, audit_id, report.get("status", "failed") if report.get("success") else "failed", runtime)
    quota = accounts.quota_snapshot(db, principal.profile, ctx)
    quota["credit_state"] = state
    out = present(report, lang, principal.plan)
    out["audit_id"] = audit_id
    out["plan"] = principal.plan
    out["simulated_plan"] = principal.simulated
    out["test_context"] = principal.test
    out["persisted"] = bool(report.get("success"))
    out["quota"] = quota
    code = 200
    if not report.get("success"):
        code = {"INVALID_URL": 400, "BLOCKED_TARGET": 400, "DNS_FAILURE": 422}.get(report.get("error_code"), 200)
    return JSONResponse(out, status_code=code)


@router.post("/audit")
@router.post("/audit/")
async def audit(payload: AuditRequest, request: Request, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_session)):
    opts = ScanOptions(deep=False, consent_phases=payload.consent_phases, explain=payload.explain)
    return await _execute(request, payload.url, opts, "single", payload.language, principal, db)


@router.post("/audit/deep")
async def audit_deep(payload: DeepAuditRequest, request: Request, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_session)):
    opts = ScanOptions(deep=True, max_pages=payload.max_pages, consent_phases=payload.consent_phases,
                       explain=payload.explain, total_budget_s=280.0)
    return await _execute(request, payload.url, opts, "deep", payload.language, principal, db)


@router.get("/methodology")
async def methodology():
    return {
        "engine_version": ENGINE_VERSION, "scoring_version": SCORING_VERSION, "weights": WEIGHTS,
        "min_global_coverage": MIN_GLOBAL_COVERAGE, "defined_checks": DEFINED_CHECKS,
        "finding_statuses": {
            "OBSERVED": "Directly supported by evidence collected in this scan.",
            "INFERRED": "Derived by a rule from evidence; not directly observed.",
            "NOT_OBSERVED": "Looked for with the capability available and not found during the observation window.",
            "UNVERIFIABLE": "Could not be checked in this scan.",
        },
        "catalog": [{"id": v.id, "name": v.name, "company": v.company, "category": v.category,
                     "category_label": CATEGORIES.get(v.category), "has_collection_endpoint_signature": bool(v.beacon),
                     "docs": v.docs} for v in VENDORS],
        "limitations": BASE_LIMITATIONS, "disclaimer": DISCLAIMER,
    }


class ExplainRequest(BaseModel):
    findings: List[Dict[str, Any]] = Field(default_factory=list, max_length=200)
    language: str = "pt-BR"


@router.post("/explain")
async def explain(payload: ExplainRequest):
    try:
        from datatrust.rag import explain_findings
        return explain_findings(payload.findings, language=payload.language)
    except Exception as exc:
        return {"available": False, "reason": f"Explanations unavailable ({exc.__class__.__name__}). "
                                              "The audit itself is unaffected.", "explanations": {}}


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=2000)
    report: Dict[str, Any] = Field(default_factory=dict)
    language: str = "pt-BR"


@router.post("/chat")
async def chat(payload: ChatRequest):
    from datatrust.assistant import answer
    return await asyncio.to_thread(answer, payload.message, payload.report, payload.language)
