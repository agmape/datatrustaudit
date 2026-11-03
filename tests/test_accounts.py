"""Accounts: migrations, monthly/daily/domain quotas, atomicity/idempotency, plan resolution, roles,
administrator test context, versioned plan configuration and isolated plan tests."""
import threading
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import inspect
from sqlalchemy.orm import sessionmaker

from datatrust import accounts, db as dtdb, plan_config, plans
from datatrust.models import AdminAuditLog, Base, CreditLedger, Profile, Subscription, utcnow
from datatrust.plan_tests import run_plan_tests
from datatrust.plans import entitlements, plan_matrix, released_count


@pytest.fixture()
def session(fresh_db):
    s = sessionmaker(bind=fresh_db, expire_on_commit=False, future=True)()
    plan_config.refresh(s)
    yield s
    s.close()
    plans.set_active_config(plans.DEFAULT_CONFIG)


def mk_user(s, role="user", plan=None, status="active", end=None):
    uid = str(uuid.uuid4())
    s.add(Profile(id=uid, email=f"{uid[:6]}@t.invalid", role=role, created_at=utcnow()))
    if plan:
        s.add(Subscription(id=str(uuid.uuid4()), user_id=uid, plan=plan, status=status, current_period_end=end,
                           created_at=utcnow(), updated_at=utcnow()))
    s.commit()
    return s.get(Profile, uid)


def ctx(s, u):
    return accounts.resolve_context(s, u)


def mid_month(day: int):
    """A fixed instant inside the current calendar month (America/Sao_Paulo) on a given day."""
    start, _ = accounts.month_bounds()
    return (start.astimezone(accounts.TZ).replace(day=day, hour=12)).astimezone(accounts.TZ)


def test_migrations_applied_once_and_orm_matches_schema(fresh_db):
    assert dtdb.run_migrations(fresh_db) == []                     # idempotent
    insp = inspect(fresh_db)
    for table in Base.metadata.sorted_tables:
        db_cols = {c["name"] for c in insp.get_columns(table.name)}
        orm_cols = {c.name for c in table.columns}
        assert db_cols == orm_cols, f"{table.name}: migration {sorted(db_cols)} != ORM {sorted(orm_cols)}"


# ── single source of truth (owner's launch offer, 28/10/2026) ───────────────
def test_plan_matrix_launch_offer_in_cents():
    m = plan_matrix()
    by = {p["plan"]: p for p in m["plans"]}
    assert set(by) == {"free", "pro", "premium"}                    # admin is a role, not a plan for sale
    assert [by[p]["price_cents"] for p in ("free", "pro", "premium")] == [0, 9700, 24700]
    assert {p["currency"] for p in by.values()} == {"BRL"} and {p["cycle"] for p in by.values()} == {"monthly"}
    assert [by[p]["visibility_percent"] for p in ("free", "pro", "premium")] == [30, 70, 100]
    assert [by[p]["analyses_per_month"] for p in ("free", "pro", "premium")] == [3, 30, 150]
    assert [by[p]["domains_per_period"] for p in ("free", "pro", "premium")] == [1, 5, 30]
    assert [by[p]["seats"] for p in ("free", "pro", "premium")] == [1, 1, 3]
    assert by["premium"]["seats_operational"] is False               # "até 3 quando disponível"
    assert by["free"]["daily_limit"] == 1 and by["pro"]["daily_limit"] is None
    assert m["billing"]["enabled"] is False
    unimpl = {f["id"] for f in m["features"] if not f["implemented"]}
    assert {"export_xlsx_pdf", "gtm_import", "comparison", "integrations", "billing", "team_seats"} <= unimpl
    adm = entitlements("admin")
    assert adm["analyses_per_month"] is None and adm["domains_per_period"] is None and adm["visibility"] == 1.0


@pytest.mark.parametrize("n,p,expected", [
    (10, 0.30, 3), (10, 0.70, 7), (10, 1.0, 10), (0, 0.30, 0), (0, 1.0, 0), (1, 0.30, 1), (1, 0.70, 1),
    (3, 0.30, 1), (3, 0.70, 2), (3, 1.0, 3), (2, 0.30, 1), (7, 0.30, 2)])
def test_released_count_rule(n, p, expected):
    assert released_count(n, p) == expected


# ── roles & resolution ──────────────────────────────────────────────────────
def test_profile_created_with_user_role_and_role_never_changed_by_upsert(session):
    uid = str(uuid.uuid4())
    p = accounts.upsert_profile(session, uid, "a@b.co")
    assert p.role == "user"
    accounts.set_role(session, uid, "admin", "test")
    p2 = accounts.upsert_profile(session, uid, "changed@b.co")      # a later login must not demote/alter the role
    assert p2.role == "admin" and p2.email == "changed@b.co"


def test_set_role_is_idempotent_and_logged(session):
    u = mk_user(session)
    r1 = accounts.set_role(session, u.id, "admin", "cli:test")
    r2 = accounts.set_role(session, u.id, "admin", "cli:test")
    assert r1["changed"] is True and r2["changed"] is False
    logs = session.query(AdminAuditLog).filter_by(action="set_role", target=u.id).all()
    assert len(logs) == 1 and logs[0].actor == "cli:test"
    with pytest.raises(ValueError):
        accounts.set_role(session, u.id, "root", "x")
    with pytest.raises(LookupError):
        accounts.set_role(session, str(uuid.uuid4()), "admin", "x")


@pytest.mark.parametrize("status,delta,expected", [
    ("active", 10, "pro"), ("active", -1, "free"), ("canceled", 10, "free"), ("past_due", 10, "free"), ("active", None, "pro")])
def test_effective_plan(session, status, delta, expected):
    end = None if delta is None else utcnow() + timedelta(days=delta)
    u = mk_user(session, plan="pro", status=status, end=end)
    assert accounts.effective_plan_id(session, u) == expected


def test_admin_role_is_unmetered_but_not_a_plan(session):
    a = mk_user(session, role="admin")
    c = ctx(session, a)
    assert c["plan"] == "admin" and c["metered"] is False and c["is_test"] is False
    for i in range(200):
        assert accounts.reserve_credit(session, a, c, f"adm-{i}", f"https://site-{i}.example/") is None
    assert session.query(CreditLedger).count() == 0
    assert accounts.quota_snapshot(session, a, c)["unlimited"] is True


# ── monthly / daily / domain quotas ─────────────────────────────────────────
def test_free_three_per_month_one_per_day_one_domain(session):
    u = mk_user(session)
    c = ctx(session, u)
    accounts.reserve_credit(session, u, c, "a1", "https://www.site.example/x", now=mid_month(2))
    with pytest.raises(accounts.QuotaExceeded) as e:                 # 2nd on the same day
        accounts.reserve_credit(session, u, c, "a2", "https://site.example/y", now=mid_month(2))
    assert e.value.kind == "daily" and e.value.limit == 1
    with pytest.raises(accounts.QuotaExceeded) as e:                 # another domain
        accounts.reserve_credit(session, u, c, "a3", "https://other.example/", now=mid_month(3))
    assert e.value.kind == "domains" and e.value.limit == 1
    accounts.reserve_credit(session, u, c, "a4", "https://site.example/z", now=mid_month(3))   # www. normalised
    accounts.reserve_credit(session, u, c, "a5", "https://site.example/", now=mid_month(4))
    with pytest.raises(accounts.QuotaExceeded) as e:
        accounts.reserve_credit(session, u, c, "a6", "https://site.example/", now=mid_month(5))
    assert e.value.kind == "monthly" and e.value.limit == 3 and e.value.used == 3
    # retry of an already-reserved audit is allowed even at the limit (idempotent)
    assert accounts.reserve_credit(session, u, c, "a4", "https://site.example/", now=mid_month(5)).audit_id == "a4"


def test_pro_domains_limit_counts_distinct_domains(session):
    u = mk_user(session, plan="pro", end=utcnow() + timedelta(days=40))
    c = ctx(session, u)
    for i in range(5):
        accounts.reserve_credit(session, u, c, f"d{i}", f"https://d{i}.example/")
    accounts.reserve_credit(session, u, c, "again", "https://d0.example/other")       # already-used domain: ok
    with pytest.raises(accounts.QuotaExceeded) as e:
        accounts.reserve_credit(session, u, c, "sixth", "https://d5.example/")
    assert e.value.kind == "domains"
    snap = accounts.quota_snapshot(session, u, c)
    assert snap["domains"]["used"] == 5 and snap["used"] == 6 and snap["limit"] == 30


def test_deleting_history_does_not_return_analyses(session):
    from datatrust.models import Audit
    u = mk_user(session, plan="pro", end=utcnow() + timedelta(days=40))
    c = ctx(session, u)
    session.add(Audit(id="h1", user_id=u.id, url="https://a.example", mode="single", status="completed", created_at=utcnow()))
    session.commit()
    accounts.reserve_credit(session, u, c, "h1", "https://a.example")
    accounts.finalize_credit(session, "h1", "completed", True)
    session.delete(session.get(Audit, "h1")); session.commit()
    assert accounts.credits_used(session, u.id) == 1


def test_concurrent_reservations_never_exceed_limit(tmp_path):
    # file-backed SQLite: real separate connections (an in-memory StaticPool would share one connection)
    eng = dtdb.make_engine(f"sqlite:///{(tmp_path / 'c.db').as_posix()}")
    dtdb.run_migrations(eng)
    Session = sessionmaker(bind=eng, expire_on_commit=False, future=True)
    s0 = Session()
    u = mk_user(s0, plan="pro", end=utcnow() + timedelta(days=40))
    results = []

    def worker(i):
        s = Session()
        try:
            p = s.get(Profile, u.id)
            accounts.reserve_credit(s, p, accounts.resolve_context(s, p), f"c-{i}", "https://same.example/")
            results.append("ok")
        except accounts.QuotaExceeded:
            results.append("blocked")
        finally:
            s.close()

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(45)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert results.count("ok") == 30 and results.count("blocked") == 15
    assert accounts.credits_used(s0, u.id) == 30


@pytest.mark.parametrize("scan_status,runtime,expected", [
    ("completed", True, "committed"), ("partial", True, "committed"), ("partial", False, "released"),
    ("failed", False, "released"), ("timeout", False, "released"), ("blocked", False, "released")])
def test_credit_policy(session, scan_status, runtime, expected):
    u = mk_user(session)
    accounts.reserve_credit(session, u, ctx(session, u), "aud", "https://a.example")
    assert accounts.finalize_credit(session, "aud", scan_status, runtime) == expected
    assert accounts.credits_used(session, u.id) == (1 if expected == "committed" else 0)
    assert accounts.finalize_credit(session, "aud", "failed", False) is None       # idempotent: already final


def test_monthly_period_renewal(session):
    u = mk_user(session)
    last_month = accounts.month_bounds()[0] - timedelta(days=2)
    accounts.reserve_credit(session, u, ctx(session, u), "old", "https://a.example", now=last_month)
    assert accounts.credits_used(session, u.id) == 0                # renewed
    accounts.reserve_credit(session, u, ctx(session, u), "new", "https://b.example")   # new domain allowed in new month
    assert accounts.credits_used(session, u.id) == 1


def test_period_is_calendar_month_in_sao_paulo():
    start, end = accounts.month_bounds()
    s, e = start.astimezone(accounts.TZ), end.astimezone(accounts.TZ)
    assert (s.day, s.hour, s.minute) == (1, 0, 0) and (e.day, e.hour) == (1, 0)
    assert 28 <= (end - start).days <= 31


def test_paid_subscription_period_is_used_when_present(session):
    u = mk_user(session, plan="pro", end=utcnow() + timedelta(days=20))
    sub = session.query(Subscription).filter_by(user_id=u.id).one()
    sub.current_period_start = utcnow() - timedelta(days=10)
    session.commit()
    snap = accounts.quota_snapshot(session, u, ctx(session, u))
    assert snap["period_kind"] == "subscription"


# ── administrator test context ──────────────────────────────────────────────
def test_test_context_meters_admin_like_the_plan_with_separate_balance(session):
    a = mk_user(session, role="admin")
    real_user = mk_user(session)
    accounts.reserve_credit(session, real_user, ctx(session, real_user), "real-1", "https://r.example")
    accounts.set_test_context(session, a, "free")
    c = ctx(session, a)
    assert c["plan"] == "free" and c["metered"] is True and c["is_test"] is True
    accounts.reserve_credit(session, a, c, "t1", "https://t.example", now=mid_month(2))
    with pytest.raises(accounts.QuotaExceeded):                     # admin bypass does NOT hide Free limits
        accounts.reserve_credit(session, a, c, "t2", "https://t.example", now=mid_month(2))
    assert session.query(CreditLedger).filter_by(user_id=a.id, is_test=1).count() == 1
    assert accounts.reset_test_balance(session, a) == 1
    assert session.query(CreditLedger).filter_by(audit_id="real-1").one().is_test == 0     # real rows untouched
    accounts.set_test_context(session, a, "admin")                  # back to administrator
    assert ctx(session, a)["plan"] == "admin"
    actions = [r.action for r in session.query(AdminAuditLog).filter_by(target=a.id)]
    assert {"test_context.set", "test_context.reset_balance", "test_context.exit"} <= set(actions)


def test_test_context_scenarios(session):
    a = mk_user(session, role="admin")
    accounts.set_test_context(session, a, "pro", quota_state="exhausted")
    c = ctx(session, a)
    with pytest.raises(accounts.QuotaExceeded) as e:
        accounts.reserve_credit(session, a, c, "x", "https://t.example")
    assert e.value.simulated is True
    assert accounts.quota_snapshot(session, a, c)["remaining"] == 0
    accounts.set_test_context(session, a, "premium", subscription_state="payment_failed")
    c = ctx(session, a)
    assert c["plan"] == "free" and c["test"]["fallback_reason"] == "payment_failed"
    assert session.query(Subscription).count() == 0                 # no real subscription created


def test_only_admins_can_have_test_context(session):
    u = mk_user(session)
    with pytest.raises(PermissionError):
        accounts.set_test_context(session, u, "premium")


# ── versioned configuration ─────────────────────────────────────────────────
def test_publish_new_config_version_and_validation(session):
    cfg = plan_config.publish(session, {"plans": {"pro": {"price_cents": 9900, "analyses_per_month": 40}}}, "adm", "teste")
    assert cfg["version"] == 2 and entitlements("pro")["price_cents"] == 9900 and entitlements("pro")["analyses_per_month"] == 40
    assert entitlements("premium")["price_cents"] == 24700           # untouched plans keep their values
    for bad in ({"free": {"price_cents": 100}}, {"pro": {"visibility": 1.5}}, {"pro": {"visibility": 0.2}},
                {"premium": {"max_deep_pages": 50}}, {"pro": {"domains_per_period": 0}}):
        with pytest.raises(ValueError):
            plan_config.publish(session, {"plans": bad}, "adm")
    assert plan_config.history(session)[0]["version"] == 2


@pytest.mark.parametrize("plan", ["free", "pro", "premium"])
def test_plan_tests_pass_for_each_plan_and_are_isolated(plan, fresh_db):
    before = dtdb.get_engine()
    res = run_plan_tests(plan)
    assert res["isolated"] is True and res["failed"] == 0, [r for r in res["results"] if not r["passed"]]
    assert res["total"] >= 12
    assert dtdb.get_engine() is before                              # real engine untouched
