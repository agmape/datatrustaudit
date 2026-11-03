"""
Account services: profiles, effective plan resolution, atomic/idempotent analyses quota, domain
limits, the administrator's test context and the admin log.

Definitions (documented in PLANS.md):
  * An ANALYSIS is a new execution for one URL and one test profile. Reopening a report, changing
    language/view, collapsing sections or exporting again does not consume one.
  * Periods: Free (and subscriptions without a billing period) use the calendar month in
    America/Sao_Paulo; paid plans with a subscription period use that period.
  * A quota unit is RESERVED before the scan starts (atomic against the monthly, daily and domain
    limits), COMMITTED when the audit is ``completed`` or ``partial`` with the browser runtime
    observed (useful result), and RELEASED when the scan fails/times out/is blocked or is
    ``partial`` without runtime evidence. Reserving twice for the same audit id is idempotent.
  * Deleting history never returns analyses or domains (the ledger is independent of audits).
  * Domain limit: distinct domains (host without ``www.``) used in the period.
  * Administrator: internal role without commercial quota. In a TEST CONTEXT the administrator is
    metered exactly like the chosen plan, against a separate, resettable test balance.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AdminAuditLog, AdminTestContext, Audit, CreditLedger, Profile, Subscription, utcnow
from .plans import ADMIN, ANON, PLAN_IDS, entitlements

TZ = ZoneInfo("America/Sao_Paulo")
ACTIVE_STATES = {"active"}
TEST_PLANS = ("free", "pro", "premium")
QUOTA_STATES = ("available", "exhausted")
SUB_STATES = ("active", "expired", "payment_failed")
_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


class QuotaExceeded(Exception):
    """kind: monthly | daily | domains"""
    def __init__(self, kind: str, limit: int, used: int, renews_at: Optional[datetime], simulated: bool = False):
        super().__init__(f"quota exceeded ({kind})")
        self.kind, self.limit, self.used, self.renews_at, self.simulated = kind, limit, used, renews_at, simulated
        self.period_end = renews_at


def _lock_for(user_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(user_id, threading.Lock())


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def normalize_domain(url_or_host: str) -> str:
    s = (url_or_host or "").strip().lower()
    host = urlparse(s if "://" in s else f"http://{s}").hostname or s
    return host[4:] if host.startswith("www.") else host


# ── periods ─────────────────────────────────────────────────────────────────
def month_bounds(now: Optional[datetime] = None) -> tuple:
    """Calendar month in America/Sao_Paulo, returned in UTC."""
    now_l = (now or utcnow()).astimezone(TZ)
    start_l = now_l.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end_l = (start_l.replace(year=start_l.year + 1, month=1) if start_l.month == 12
             else start_l.replace(month=start_l.month + 1))
    return start_l.astimezone(timezone.utc), end_l.astimezone(timezone.utc)


def day_bounds(now: Optional[datetime] = None) -> tuple:
    now_l = (now or utcnow()).astimezone(TZ)
    start_l = now_l.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_l.astimezone(timezone.utc), (start_l + timedelta(days=1)).astimezone(timezone.utc)


def period_bounds(now: Optional[datetime] = None, sub: Optional[Subscription] = None) -> tuple:
    """(start, end, kind). Subscription period when the subscription carries one, else calendar month."""
    if sub is not None and sub.current_period_start and sub.current_period_end:
        s, e = aware(sub.current_period_start), aware(sub.current_period_end)
        n = now or utcnow()
        if s <= n < e:
            return s, e, "subscription"
    s, e = month_bounds(now)
    return s, e, "calendar_month"


# ── profiles ────────────────────────────────────────────────────────────────
def upsert_profile(db: Session, user_id: str, email: Optional[str]) -> Profile:
    """Create on first verified login; never changes ``role`` (server-controlled)."""
    p = db.get(Profile, user_id)
    now = utcnow()
    if p is None:
        p = Profile(id=user_id, email=email, role="user", created_at=now, last_seen_at=now)
        db.add(p)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            p = db.get(Profile, user_id)
    if p is not None:
        p.last_seen_at = now
        if email and p.email != email:
            p.email = email
    db.commit()
    return p


def bootstrap_admin_emails() -> set:
    """Owner e-mails that become admin on their first VERIFIED login (env ``ADMIN_BOOTSTRAP_EMAILS``,
    comma-separated). This is an e-mail allow-list, not a credential: the identity is still proven by
    a Supabase-signed JWT. Set the variable to an empty string to disable."""
    raw = os.getenv("ADMIN_BOOTSTRAP_EMAILS", "datatrustaudit@gmail.com")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def bootstrap_admin(db: Session, profile: Profile, claims: Dict[str, Any]) -> bool:
    """Idempotently promote an allow-listed owner. Only promotes, never demotes. Requires a
    verified e-mail (Supabase only issues sessions after confirmation; Google e-mails are verified)."""
    email = (claims.get("email") or "").strip().lower()
    if not email or profile.role == "admin" or email not in bootstrap_admin_emails():
        return False
    if claims.get("is_anonymous") or (claims.get("user_metadata") or {}).get("email_verified") is False:
        return False
    profile.role = "admin"
    db.commit()
    log_admin(db, actor="system:bootstrap", action="role.bootstrap_admin", target=profile.id,
              details={"email": email, "provider": (claims.get("app_metadata") or {}).get("provider")})
    return True


# ── subscriptions / plan resolution ─────────────────────────────────────────
def active_subscription(db: Session, user_id: str, now: Optional[datetime] = None) -> Optional[Subscription]:
    now = now or utcnow()
    subs = db.execute(select(Subscription).where(Subscription.user_id == user_id)
                      .order_by(Subscription.updated_at.desc())).scalars().all()
    for s in subs:
        end = aware(s.current_period_end)
        if s.status in ACTIVE_STATES and (end is None or end > now):
            return s
    return None


def subscription_state(db: Session, user_id: str, now: Optional[datetime] = None) -> str:
    now = now or utcnow()
    subs = db.execute(select(Subscription).where(Subscription.user_id == user_id)
                      .order_by(Subscription.updated_at.desc())).scalars().all()
    if not subs:
        return "none"
    s = subs[0]
    end = aware(s.current_period_end)
    if s.status in ACTIVE_STATES and end is not None and end <= now:
        return "expired"
    return s.status


def get_test_context(db: Session, admin_id: str) -> Optional[AdminTestContext]:
    return db.get(AdminTestContext, admin_id)


def resolve_context(db: Session, profile: Profile, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Server-side plan context. Never derived from client headers or token metadata."""
    if profile.role == "admin":
        ctx = get_test_context(db, profile.id)
        if ctx is None:
            return {"plan": ADMIN, "metered": False, "is_test": False, "test": None, "subscription": None}
        plan = ctx.plan
        fallback = None
        if plan != "free" and ctx.subscription_state != "active":
            plan, fallback = "free", ctx.subscription_state       # expired / payment failed -> no paid features
        return {"plan": plan, "metered": True, "is_test": True, "subscription": None,
                "test": {"selected_plan": ctx.plan, "effective_plan": plan, "quota_state": ctx.quota_state,
                         "subscription_state": ctx.subscription_state, "fallback_reason": fallback,
                         "started_at": aware(ctx.started_at).isoformat()}}
    sub = active_subscription(db, profile.id, now)
    plan = sub.plan if sub and sub.plan in PLAN_IDS else "free"
    return {"plan": plan, "metered": True, "is_test": False, "test": None, "subscription": sub}


def effective_plan_id(db: Session, profile: Profile, now: Optional[datetime] = None) -> str:
    return resolve_context(db, profile, now)["plan"]


# ── quota ───────────────────────────────────────────────────────────────────
def _active_rows(db: Session, user_id: str, is_test: bool, start: datetime, end: datetime):
    return select(CreditLedger).where(
        CreditLedger.user_id == user_id, CreditLedger.is_test == (1 if is_test else 0),
        CreditLedger.created_at >= start, CreditLedger.created_at < end,
        CreditLedger.state.in_(("reserved", "committed")))


def usage(db: Session, user_id: str, is_test: bool, start: datetime, end: datetime,
          now: Optional[datetime] = None) -> Dict[str, Any]:
    rows = db.execute(_active_rows(db, user_id, is_test, start, end)).scalars().all()
    d0, d1 = day_bounds(now)
    domains = sorted({r.domain for r in rows if r.domain})
    today = sum(1 for r in rows if d0 <= aware(r.created_at) < d1)
    return {"used": len(rows), "domains": domains, "today": today}


def credits_used(db: Session, user_id: str, now: Optional[datetime] = None, is_test: bool = False) -> int:
    s, e = month_bounds(now)
    return usage(db, user_id, is_test, s, e, now)["used"]


def quota_snapshot(db: Session, profile: Profile, ctx: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    ent = entitlements(ctx["plan"])
    start, end, kind = period_bounds(now, ctx.get("subscription"))
    if not ctx["metered"]:
        u = usage(db, profile.id, False, start, end, now)
        return {"unlimited": True, "limit": None, "used": u["used"], "remaining": None,
                "period_start": start.isoformat(), "period_end": end.isoformat(), "renews_at": end.isoformat(),
                "period_kind": kind, "timezone": "America/Sao_Paulo", "is_test": False,
                "domains": {"limit": None, "used": len(u["domains"]), "list": u["domains"]},
                "daily": {"limit": None, "used": u["today"], "renews_at": day_bounds(now)[1].isoformat()}}
    u = usage(db, profile.id, ctx["is_test"], start, end, now)
    limit = ent["analyses_per_month"] or 0
    used = u["used"]
    simulated_exhausted = bool(ctx.get("test") and ctx["test"]["quota_state"] == "exhausted")
    if simulated_exhausted:
        used = max(used, limit)
    return {"unlimited": False, "limit": limit, "used": used, "remaining": max(0, limit - used),
            "period_start": start.isoformat(), "period_end": end.isoformat(), "renews_at": end.isoformat(),
            "period_kind": kind, "timezone": "America/Sao_Paulo", "is_test": ctx["is_test"],
            "simulated_exhausted": simulated_exhausted,
            "domains": {"limit": ent["domains_per_period"], "used": len(u["domains"]), "list": u["domains"]},
            "daily": {"limit": ent["daily_limit"], "used": u["today"], "renews_at": day_bounds(now)[1].isoformat()}}


def reserve_credit(db: Session, profile: Profile, ctx: Dict[str, Any], audit_id: str, url: str,
                   now: Optional[datetime] = None) -> Optional[CreditLedger]:
    """Atomically reserve one analysis. Idempotent per audit_id. Unmetered admins return None."""
    if not ctx["metered"]:
        return None
    now = now or utcnow()
    ent = entitlements(ctx["plan"])
    start, end, _ = period_bounds(now, ctx.get("subscription"))
    domain = normalize_domain(url)
    limit = ent["analyses_per_month"] or 0
    with _lock_for(profile.id):
        existing = db.execute(select(CreditLedger).where(CreditLedger.audit_id == audit_id)).scalar_one_or_none()
        if existing is not None:
            return existing                                   # retry: same audit, same unit
        if ctx.get("test") and ctx["test"]["quota_state"] == "exhausted":
            raise QuotaExceeded("monthly", limit, limit, end, simulated=True)
        # row lock on PostgreSQL (no-op on SQLite, covered by the process lock above)
        db.execute(select(Profile).where(Profile.id == profile.id).with_for_update())
        u = usage(db, profile.id, ctx["is_test"], start, end, now)
        if u["used"] >= limit:
            db.rollback()
            raise QuotaExceeded("monthly", limit, u["used"], end)
        daily = ent["daily_limit"]
        if daily is not None and u["today"] >= daily:
            db.rollback()
            raise QuotaExceeded("daily", daily, u["today"], day_bounds(now)[1])
        dom_limit = ent["domains_per_period"]
        if dom_limit is not None and domain not in u["domains"] and len(u["domains"]) >= dom_limit:
            db.rollback()
            raise QuotaExceeded("domains", dom_limit, len(u["domains"]), end)
        row = CreditLedger(id=str(uuid.uuid4()), user_id=profile.id, audit_id=audit_id, state="reserved",
                           period_start=start, created_at=now, updated_at=now, domain=domain,
                           plan=ctx["plan"], is_test=1 if ctx["is_test"] else 0)
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            row = db.execute(select(CreditLedger).where(CreditLedger.audit_id == audit_id)).scalar_one()
        return row


def finalize_credit(db: Session, audit_id: str, scan_status: str, runtime_observed: bool,
                    reason: Optional[str] = None) -> Optional[str]:
    """commit | release according to the policy. Idempotent: only 'reserved' rows change."""
    useful = scan_status == "completed" or (scan_status == "partial" and runtime_observed)
    new_state = "committed" if useful else "released"
    res = db.execute(update(CreditLedger).where(CreditLedger.audit_id == audit_id, CreditLedger.state == "reserved")
                     .values(state=new_state, updated_at=utcnow(), reason=reason or scan_status))
    db.commit()
    return new_state if res.rowcount else None


# ── administrator test context ──────────────────────────────────────────────
def set_test_context(db: Session, admin: Profile, plan: str, quota_state: str = "available",
                     subscription_state: str = "active") -> Optional[AdminTestContext]:
    """plan in free|pro|premium starts/updates the test context; 'admin' leaves it. Logged."""
    if admin.role != "admin":
        raise PermissionError("administrator role required")
    if plan == ADMIN:
        ctx = db.get(AdminTestContext, admin.id)
        if ctx is not None:
            prev = ctx.plan
            db.delete(ctx)
            db.commit()
            log_admin(db, admin.email or admin.id, "test_context.exit", admin.id, {"previous_plan": prev})
        return None
    if plan not in TEST_PLANS or quota_state not in QUOTA_STATES or subscription_state not in SUB_STATES:
        raise ValueError("invalid test context")
    now = utcnow()
    ctx = db.get(AdminTestContext, admin.id)
    if ctx is None:
        ctx = AdminTestContext(admin_id=admin.id, plan=plan, quota_state=quota_state,
                               subscription_state=subscription_state, started_at=now, updated_at=now)
        db.add(ctx)
    else:
        ctx.plan, ctx.quota_state, ctx.subscription_state, ctx.updated_at = plan, quota_state, subscription_state, now
    db.commit()
    log_admin(db, admin.email or admin.id, "test_context.set", admin.id,
              {"plan": plan, "quota_state": quota_state, "subscription_state": subscription_state})
    return ctx


def reset_test_balance(db: Session, admin: Profile) -> int:
    """Delete the administrator's TEST ledger rows only. Real balances are never touched."""
    res = db.execute(delete(CreditLedger).where(CreditLedger.user_id == admin.id, CreditLedger.is_test == 1))
    db.commit()
    log_admin(db, admin.email or admin.id, "test_context.reset_balance", admin.id, {"rows": res.rowcount})
    return res.rowcount or 0


# ── admin log ───────────────────────────────────────────────────────────────
def log_admin(db: Session, actor: str, action: str, target: Optional[str] = None,
              details: Optional[Dict[str, Any]] = None) -> None:
    db.add(AdminAuditLog(id=str(uuid.uuid4()), actor=actor, action=action, target=target,
                         details=json.dumps(details or {}, ensure_ascii=False), created_at=utcnow()))
    db.commit()


def set_role(db: Session, user_id: str, role: str, actor: str) -> Dict[str, Any]:
    """Idempotent role assignment (server-side only). Returns {changed, previous, current}."""
    if role not in ("admin", "user"):
        raise ValueError("invalid role")
    p = db.get(Profile, user_id)
    if p is None:
        raise LookupError("profile not found")
    previous = p.role
    if previous == role:
        return {"changed": False, "previous": previous, "current": role}
    p.role = role
    if role != "admin":
        ctx = db.get(AdminTestContext, user_id)
        if ctx is not None:
            db.delete(ctx)
    db.commit()
    log_admin(db, actor, "set_role", user_id, {"previous": previous, "current": role})
    return {"changed": True, "previous": previous, "current": role}


def me_payload(db: Session, profile: Profile, ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    ctx = ctx or resolve_context(db, profile)
    return {
        "user": {"id": profile.id, "email": profile.email, "role": profile.role, "is_admin": profile.role == "admin"},
        "plan": ctx["plan"], "entitlements": entitlements(ctx["plan"]),
        "test_context": ctx["test"], "simulated": bool(ctx["is_test"]),
        "subscription": subscription_state(db, profile.id),
        "quota": quota_snapshot(db, profile, ctx),
        "billing": {"enabled": False},
    }
