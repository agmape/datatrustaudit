"""
"Testar permissões e limites": REAL tests of the server rules for a chosen plan.

Runs against an isolated in-memory database with a synthetic test user whose role is ``user`` — an
administrator's unlimited access therefore cannot mask defects in the Free/Pro/Premium rules. It
never touches real subscriptions, real balances or billing.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any, Callable, Dict, List

from sqlalchemy.orm import Session, sessionmaker

from . import accounts
from .db import make_engine, run_migrations
from .models import Profile, Subscription, utcnow
from .plans import entitlements, released_count
from .visibility import apply_visibility


def _fresh() -> Session:
    eng = make_engine("sqlite://")
    run_migrations(eng)
    return sessionmaker(bind=eng, expire_on_commit=False, future=True)()


def _user(db: Session, plan: str, status: str = "active", period_end=None) -> Profile:
    uid = str(uuid.uuid4())
    p = Profile(id=uid, email=f"{uid[:8]}@plan-test.invalid", role="user", created_at=utcnow())
    db.add(p)
    if plan != "free":
        db.add(Subscription(id=str(uuid.uuid4()), user_id=uid, plan=plan, status=status,
                            current_period_end=period_end, source="plan-test", created_at=utcnow(), updated_at=utcnow()))
    db.commit()
    return p


def _ten_findings() -> Dict[str, Any]:
    sev = ["critical", "high", "high", "medium", "medium", "low", "low", "info", "info", "info"]
    return {"findings": [{"id": f"f-{i:02d}", "severity": s, "status": "OBSERVED", "evidence_ids": [f"ev-{i}"]}
                         for i, s in enumerate(sev)],
            "evidence": [{"id": f"ev-{i}", "source_type": "network"} for i in range(10)]}


def run_plan_tests(plan: str) -> Dict[str, Any]:
    plan = plan if plan in ("free", "pro", "premium") else "free"
    E = entitlements(plan)
    results: List[Dict[str, Any]] = []

    def case(cid: str, desc: str, expected: Any, fn: Callable[[], Any]) -> None:
        try:
            observed = fn()
            ok = observed == expected
        except Exception as exc:                         # a crash is a failed rule, never a pass
            observed, ok = f"{exc.__class__.__name__}: {exc}", False
        results.append({"id": cid, "description": desc, "expected": expected, "observed": observed, "passed": ok})

    # 1 — plan resolution
    db = _fresh(); u = _user(db, plan, "active", utcnow() + timedelta(days=10))
    case("resolve_active", "Plano ativo resolve para o plano contratado", plan, lambda: accounts.effective_plan_id(db, u))
    db = _fresh(); u = _user(db, plan if plan != "free" else "pro", "active", utcnow() - timedelta(days=1))
    case("resolve_expired", "Assinatura vencida volta para Free", "free", lambda: accounts.effective_plan_id(db, u))
    db = _fresh(); u = _user(db, plan if plan != "free" else "pro", "past_due", utcnow() + timedelta(days=10))
    case("resolve_payment_failed", "Falha de pagamento não concede recursos pagos", "free", lambda: accounts.effective_plan_id(db, u))

    # 2 — visibility (fixture with ten findings)
    exp_vis = released_count(10, E["visibility"])
    case("visibility_ten", f"Em 10 achados, o plano libera {exp_vis}", exp_vis,
         lambda: len(apply_visibility(_ten_findings(), plan)["findings"]))
    case("visibility_zero", "Relatório sem achados não fabrica achados", 0,
         lambda: len(apply_visibility({"findings": []}, plan)["findings"]))
    case("visibility_one", "Com 1 achado, a amostra mínima libera 1", 1,
         lambda: len(apply_visibility({"findings": [{"id": "x", "severity": "low"}]}, plan)["findings"]))

    # 3 — quota exactness (monthly)
    db = _fresh(); u = _user(db, plan, "active", utcnow() + timedelta(days=40))
    ctx = accounts.resolve_context(db, u)
    limit = E["analyses_per_month"] or 0
    daily = E["daily_limit"]
    base = utcnow().astimezone(accounts.TZ).replace(day=1, hour=12, minute=0, second=0, microsecond=0)

    def exhaust():
        for i in range(limit):
            when = (base + timedelta(days=i % 27)).astimezone(accounts.TZ) if daily else None
            accounts.reserve_credit(db, u, ctx, f"t-{i}", "https://site-a.example/", now=when)
        try:
            accounts.reserve_credit(db, u, ctx, "t-over", "https://site-a.example/", now=base + timedelta(days=27) if daily else None)
            return "allowed"
        except accounts.QuotaExceeded as q:
            return f"blocked:{q.kind}"
    case("quota_monthly", f"A {limit + 1}ª análise do mês é bloqueada (limite {limit})", "blocked:monthly", exhaust)
    case("reserve_idempotent", "Repetir a reserva da mesma auditoria não consome outra análise", "same",
         lambda: "same" if accounts.reserve_credit(db, u, ctx, "t-0", "https://site-a.example/") is not None else "none")

    # 4 — daily limit
    if daily:
        db = _fresh(); u = _user(db, plan, "active", utcnow() + timedelta(days=40)); ctx = accounts.resolve_context(db, u)
        def daily_case():
            accounts.reserve_credit(db, u, ctx, "d-1", "https://site-a.example/")
            try:
                accounts.reserve_credit(db, u, ctx, "d-2", "https://site-a.example/")
                return "allowed"
            except accounts.QuotaExceeded as q:
                return f"blocked:{q.kind}"
        case("quota_daily", f"Mais de {daily} análise(s) no mesmo dia é bloqueada", "blocked:daily", daily_case)

    # 5 — domains
    dlim = E["domains_per_period"]
    db = _fresh(); u = _user(db, plan, "active", utcnow() + timedelta(days=40)); ctx = accounts.resolve_context(db, u)
    def domains_case():
        for i in range(dlim):
            accounts.reserve_credit(db, u, ctx, f"dom-{i}", f"https://site-{i}.example/",
                                    now=(base + timedelta(days=i % 27)) if daily else None)
        try:
            accounts.reserve_credit(db, u, ctx, "dom-over", "https://another.example/",
                                    now=(base + timedelta(days=dlim % 27 + 0)) if daily else None)
            return "allowed"
        except accounts.QuotaExceeded as q:
            return f"blocked:{q.kind}"
    if dlim <= limit:
        case("quota_domains", f"O {dlim + 1}º domínio distinto do período é bloqueado (limite {dlim})", "blocked:domains", domains_case)

    # 6 — failure / partial policy
    db = _fresh(); u = _user(db, plan, "active", utcnow() + timedelta(days=40)); ctx = accounts.resolve_context(db, u)
    accounts.reserve_credit(db, u, ctx, "a-fail", "https://site-a.example/")
    case("release_on_failure", "Falha sem resultado útil libera a análise", 0,
         lambda: (accounts.finalize_credit(db, "a-fail", "failed", False), accounts.credits_used(db, u.id))[1])
    case("finalize_idempotent", "Finalizar duas vezes não altera o consumo", 0,
         lambda: (accounts.finalize_credit(db, "a-fail", "completed", True), accounts.credits_used(db, u.id))[1])

    # 7 — period renewal (calendar month in America/Sao_Paulo)
    db = _fresh(); u = _user(db, plan, "active", utcnow() + timedelta(days=40)); ctx = accounts.resolve_context(db, u)
    last_month = accounts.month_bounds()[0] - timedelta(days=3)
    accounts.reserve_credit(db, u, ctx, "old-1", "https://site-a.example/", now=last_month)
    case("period_renewal", "Análises do mês anterior não contam no mês atual", 0, lambda: accounts.credits_used(db, u.id))
    case("period_boundary", "Período começa no dia 1, 00:00 (America/Sao_Paulo)", (1, 0),
         lambda: (lambda d: (d.day, d.hour))(accounts.month_bounds()[0].astimezone(accounts.TZ)))

    passed = sum(1 for r in results if r["passed"])
    return {"plan": plan, "isolated": True, "note": "Executado em banco isolado em memória; não altera assinaturas, saldos ou cobrança reais.",
            "total": len(results), "passed": passed, "failed": len(results) - passed, "results": results}
