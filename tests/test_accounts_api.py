"""Accounts / plans / history / admin through the real HTTP API (scan engine stubbed with a real fixture report)."""
import copy
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from conftest import make_token
from datatrust import accounts, db as dtdb, repository
from datatrust.models import Audit, CreditLedger, Profile, Subscription, utcnow


@pytest.fixture()
def env(fresh_db, monkeypatch, scanned):
    import main
    from api import audit as audit_api
    base = scanned("onetrust.html", True)
    calls = []

    def fake_run(url, opts, scan_id=None, **kw):
        calls.append({"url": url, "deep": opts.deep, "max_pages": opts.max_pages, "scan_id": scan_id})
        r = copy.deepcopy(base)
        r["scan_id"], r["mode"] = scan_id, ("deep" if opts.deep else "single")
        return r

    monkeypatch.setattr(audit_api, "run_scan", fake_run)
    audit_api._hits.clear()
    Session = sessionmaker(bind=fresh_db, expire_on_commit=False, future=True)

    class E:
        client = TestClient(main.app)
        run_calls = calls
        S = Session
        api = audit_api

        @staticmethod
        def user(email="u@example.com", plan=None, role=None, status="active", end=None):
            uid = str(uuid.uuid4())
            h = {"Authorization": f"Bearer {make_token(sub=uid, email=email)}"}
            E.client.get("/api/me", headers=h)                                   # first login creates the profile
            with Session() as s:
                if role:
                    s.get(Profile, uid).role = role
                if plan:
                    s.add(Subscription(id=str(uuid.uuid4()), user_id=uid, plan=plan, status=status,
                                       current_period_end=end or utcnow() + timedelta(days=20),
                                       created_at=utcnow(), updated_at=utcnow()))
                s.commit()
            return uid, h

        @staticmethod
        def scan(h=None, deep=False, **body):
            path = "/api/audit/deep" if deep else "/api/audit"
            return E.client.post(path, json={"url": "https://site.example/", **body}, headers=h or {})
    return E


# ── running an analysis requires an account (owner decision 28/10/2026) ─────
def test_anonymous_cannot_run_analyses(env):
    for deep in (False, True):
        r = env.scan(deep=deep)
        assert r.status_code == 401 and r.json()["error_code"] == "AUTH_REQUIRED"
        assert "conta grátis" in r.json()["message"]
    assert env.run_calls == []                                  # the engine was never invoked
    with env.S() as s:
        assert s.query(Audit).count() == 0


def test_unverified_email_cannot_run_analyses(env):
    uid = str(uuid.uuid4())
    h = {"Authorization": f"Bearer {make_token(sub=uid, extra={'user_metadata': {'email_verified': False}})}"}
    r = env.scan(h)
    assert r.status_code == 403 and r.json()["error_code"] == "EMAIL_NOT_VERIFIED" and env.run_calls == []


def test_free_user_cannot_deep_scan_but_pro_can_with_page_cap(env):
    _, free = env.user()
    assert env.scan(free, deep=True).status_code == 403
    _, pro = env.user("p@example.com", plan="pro")
    r = env.scan(pro, deep=True, max_pages=10)
    assert r.status_code == 200
    assert env.run_calls[-1]["max_pages"] == 5                 # Pro plan cap, even though 10 was requested
    _, prem = env.user("pp@example.com", plan="premium")
    assert env.scan(prem, deep=True, max_pages=10).status_code == 200
    assert env.run_calls[-1]["max_pages"] == 10


# ── authentication strictness ───────────────────────────────────────────────
def test_invalid_token_is_401_never_downgraded_to_anonymous(env):
    for tok in ("garbage", make_token(secret="wrong-wrong-wrong-wrong-wrong-12345"), make_token(exp_in=-100)):
        r = env.scan({"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401, tok
        assert r.json()["detail"]["error_code"] in ("INVALID_TOKEN", "TOKEN_EXPIRED")
    assert env.scan({"Authorization": "Basic abc"}).status_code == 401
    assert env.run_calls == []


def test_me_requires_auth_and_reports_server_truth(env):
    assert env.client.get("/api/me").status_code == 401
    _, h = env.user()
    me = env.client.get("/api/me", headers=h).json()
    assert me["user"]["role"] == "user" and me["plan"] == "free" and me["quota"]["limit"] == 3
    assert me["quota"]["domains"]["limit"] == 1 and me["quota"]["daily"]["limit"] == 1
    assert me["quota"]["period_kind"] == "calendar_month" and me["quota"]["timezone"] == "America/Sao_Paulo"
    assert me["entitlements"]["deep_scan"] is False and me["simulated"] is False and me["test_context"] is None
    assert me["entitlements"]["visibility_percent"] == 30 and me["billing"]["enabled"] is False


def test_token_metadata_cannot_grant_admin(env):
    uid = str(uuid.uuid4())
    tok = make_token(sub=uid, extra={"user_metadata": {"role": "admin", "is_admin": True},
                                     "app_metadata": {"role": "admin"}, "role": "authenticated"})
    h = {"Authorization": f"Bearer {tok}"}
    assert env.client.get("/api/me", headers=h).json()["user"]["role"] == "user"
    assert env.client.get("/api/admin/overview", headers=h).status_code == 403


def test_dev_admin_mode_env_is_ignored(env):
    import os
    assert os.environ["DEV_ADMIN_MODE"] == "true"
    assert env.client.get("/api/admin/overview").status_code == 401
    assert env.client.get("/api/admin/overview", headers={"Authorization": "Bearer dev-admin-token"}).status_code == 401


# ── quota & credits through the API ─────────────────────────────────────────
def test_free_daily_limit_enforced_by_direct_api_call(env):
    uid, h = env.user()
    assert env.scan(h).status_code == 200
    r = env.scan(h)
    assert r.status_code == 429 and r.json()["error_code"] == "DAILY_LIMIT"
    assert "por dia" in r.json()["message"] and r.json()["renews_at"]
    assert len(env.run_calls) == 1                              # the 2nd never reached the engine
    with env.S() as s:
        assert s.query(Audit).filter_by(user_id=uid).count() == 1


def test_pro_monthly_and_domain_limits_by_direct_api_call(env):
    uid, h = env.user("pro-q@example.com", plan="pro")
    for i in range(5):
        assert env.scan(h, url=f"https://d{i}.example/").status_code == 200
    r = env.scan(h, url="https://d5.example/")
    assert r.status_code == 429 and r.json()["error_code"] == "DOMAIN_LIMIT"
    for i in range(25):
        assert env.scan(h, url="https://d0.example/").status_code == 200       # reused domain is fine
    r = env.scan(h, url="https://d0.example/")
    assert r.status_code == 429 and r.json()["error_code"] == "QUOTA_EXCEEDED"
    assert r.json()["quota"]["used"] == 30 and r.json()["quota"]["limit"] == 30
    assert len(env.run_calls) == 30


def test_reopen_and_language_change_do_not_consume(env):
    uid, h = env.user()
    audit_id = env.scan(h).json()["audit_id"]
    for lang in ("pt-BR", "en", "es", "pt-BR"):
        assert env.client.get(f"/api/audits/{audit_id}?language={lang}", headers=h).status_code == 200
    with env.S() as s:
        assert accounts.credits_used(s, uid) == 1


def test_failed_scan_does_not_consume_credit(env, monkeypatch):
    uid, h = env.user()
    monkeypatch.setattr(env.api, "run_scan", lambda url, opts, scan_id=None, **kw: {
        "success": False, "status": "failed", "error_code": "DNS_FAILURE", "message": "x", "scan_id": scan_id})
    r = env.scan(h)
    assert r.status_code == 422
    with env.S() as s:
        assert accounts.credits_used(s, uid) == 0
        assert s.query(Audit).filter_by(user_id=uid).one().status == "failed"


def test_engine_crash_releases_credit_and_marks_audit(env, monkeypatch):
    uid, h = env.user()

    def boom(*a, **k):
        raise RuntimeError("chromium exploded")
    monkeypatch.setattr(env.api, "run_scan", boom)
    r = env.scan(h)
    assert r.status_code == 500 and r.json()["error_code"] == "SCAN_ERROR"
    with env.S() as s:
        assert accounts.credits_used(s, uid) == 0
        a = s.query(Audit).filter_by(user_id=uid).one()
        assert a.status == "failed" and a.error_code == "SCAN_ERROR"


def test_plan_change_during_audit_does_not_break_accounting(env, monkeypatch):
    uid, h = env.user("chg@example.com", plan="pro")
    real = env.api.run_scan

    def run_and_cancel(url, opts, scan_id=None, **kw):
        with env.S() as s:                                       # subscription canceled while the scan runs
            for sub in s.query(Subscription).filter_by(user_id=uid):
                sub.status = "canceled"
            s.commit()
        return real(url, opts, scan_id=scan_id)
    monkeypatch.setattr(env.api, "run_scan", run_and_cancel)
    r = env.scan(h)
    assert r.status_code == 200
    with env.S() as s:
        assert s.query(Audit).filter_by(user_id=uid).one().plan_at_run == "pro"
        assert accounts.credits_used(s, uid) == 1
    assert env.client.get("/api/me", headers=h).json()["plan"] == "free"       # next requests see the new reality


def test_interrupted_audits_recovered_and_credit_released(env):
    uid, _ = env.user()
    with env.S() as s:
        s.add(Audit(id="stuck", user_id=uid, url="https://x", mode="single", status="running", created_at=utcnow()))
        s.commit()
        prof = s.get(Profile, uid)
        accounts.reserve_credit(s, prof, accounts.resolve_context(s, prof), "stuck", "https://x")
        assert accounts.credits_used(s, uid) == 1
        assert repository.recover_interrupted(s) == 1
        assert s.get(Audit, "stuck").status == "failed" and s.get(Audit, "stuck").error_code == "INTERRUPTED"
        assert accounts.credits_used(s, uid) == 0


# ── history & ownership ─────────────────────────────────────────────────────
def test_history_reopen_and_cross_user_isolation(env):
    a_id, ha = env.user("a@example.com")
    b_id, hb = env.user("b@example.com")
    ja = env.scan(ha).json()
    audit_id = ja["audit_id"]
    assert ja["persisted"] is True
    lst = env.client.get("/api/audits", headers=ha).json()
    assert [i["id"] for i in lst["items"]] == [audit_id]
    again = env.client.get(f"/api/audits/{audit_id}", headers=ha).json()
    assert again["audit_id"] == audit_id and again["scan_id"] == audit_id and len(again["findings"]) == len(ja["findings"])
    # user B: not listed, not readable, not deletable (404, id existence not revealed)
    assert env.client.get("/api/audits", headers=hb).json()["items"] == []
    assert env.client.get(f"/api/audits/{audit_id}", headers=hb).status_code == 404
    assert env.client.delete(f"/api/audits/{audit_id}", headers=hb).status_code == 404
    assert env.client.get(f"/api/audits/{audit_id}").status_code == 401
    # owner can delete
    assert env.client.delete(f"/api/audits/{audit_id}", headers=ha).status_code == 200
    assert env.client.get(f"/api/audits/{audit_id}", headers=ha).status_code == 404


def test_reopen_in_other_language(env):
    _, h = env.user()
    audit_id = env.scan(h).json()["audit_id"]
    pt = env.client.get(f"/api/audits/{audit_id}", headers=h).json()
    en = env.client.get(f"/api/audits/{audit_id}?language=en", headers=h).json()
    assert pt["language"] == "pt-BR" and en["language"] == "en"
    assert pt["findings"][0]["rule_id"] == en["findings"][0]["rule_id"]
    assert pt["findings"][0]["title"] != en["findings"][0]["title"]
    assert [e["name"] for e in pt["events"]["events"]] == [e["name"] for e in en["events"]["events"]]   # identifiers preserved


def test_history_limit_by_plan_without_deleting_data(env):
    uid, h = env.user()
    report = env.api.run_scan("https://site.example/", type("O", (), {"deep": False, "max_pages": 1})(), scan_id="seed")
    ids = []
    with env.S() as s:
        for i in range(7):
            aid = f"hist-{i}"
            repository.begin_audit(s, aid, uid, "https://site.example/", "single", "free", "pt-BR")
            s.get(Audit, aid).created_at = utcnow() - timedelta(minutes=10 - i)
            s.commit()
            repository.finish_audit(s, aid, dict(report, scan_id=aid))
            ids.append(aid)
    lst = env.client.get("/api/audits", headers=h).json()
    assert len(lst["items"]) == 5 and lst["total"] == 7 and lst["hidden_by_plan"] == 2
    assert env.client.get(f"/api/audits/{ids[0]}", headers=h).status_code == 403       # outside plan visibility
    assert env.client.get(f"/api/audits/{ids[-1]}", headers=h).status_code == 200
    with env.S() as s:
        assert s.query(Audit).filter_by(user_id=uid).count() == 7                      # nothing was deleted


# ── plan visibility (30/70/100%) applied on the server ─────────────────────
def _all_ids(report):
    return {f["id"] for f in report["findings"]}


def test_visibility_is_enforced_server_side_and_nested(env):
    import json as _json
    uid, h = env.user("vis@example.com")
    free = env.scan(h).json()
    vis = free["visibility"]
    total = vis["lists"]["findings"]["total"]
    assert total == free["summary"]["findings"] and total >= 2                         # real count stays visible
    assert len(free["findings"]) == vis["lists"]["findings"]["released"] == max(1, int(total * 0.3)) if total else 0
    assert vis["percent"] == 30 and vis["full"] is False
    full_report = env.api.run_scan("https://site.example/", type("O", (), {"deep": False, "max_pages": 1})(), scan_id="x")
    withheld = {f["id"] for f in full_report["findings"]} - _all_ids(free)
    assert withheld
    raw = _json.dumps(free, ensure_ascii=False)
    for fid in withheld:                                                                # never shipped, not even as an id
        assert f'"{fid}"' not in raw
    # the same audit reopened under Pro and Premium: nested sets, same ids
    with env.S() as s:
        s.add(Subscription(id=str(uuid.uuid4()), user_id=uid, plan="pro", status="active",
                           current_period_end=utcnow() + timedelta(days=10), created_at=utcnow(), updated_at=utcnow()))
        s.commit()
    pro = env.client.get(f"/api/audits/{free['audit_id']}", headers=h).json()
    with env.S() as s:
        s.add(Subscription(id=str(uuid.uuid4()), user_id=uid, plan="premium", status="active",
                           current_period_end=utcnow() + timedelta(days=10), created_at=utcnow(), updated_at=utcnow()))
        s.commit()
    prem = env.client.get(f"/api/audits/{free['audit_id']}", headers=h).json()
    assert _all_ids(free) <= _all_ids(pro) <= _all_ids(prem)
    assert len(prem["findings"]) == total and prem["visibility"]["full"] is True
    for lst in ("tags", "cookies"):
        assert len(prem[lst]) == prem["visibility"]["lists"][lst]["total"]
        assert len(free[lst]) == free["visibility"]["lists"][lst]["released"]
    # every evidence id cited by a released finding is present
    ev = {e["id"] for e in free["evidence"]}
    assert all(set(f.get("evidence_ids") or []) <= ev for f in free["findings"])


# ── administrator test context (server-side; header simulation removed) ─────
def test_simulation_header_is_ignored_for_everyone(env):
    _, h = env.user("pro@example.com", plan="pro")
    me = env.client.get("/api/me", headers=dict(h, **{"X-DT-Simulate-Plan": "premium"})).json()
    assert me["plan"] == "pro" and me["simulated"] is False
    _, ha = env.user("adm2@example.com", role="admin")
    me = env.client.get("/api/me", headers=dict(ha, **{"X-DT-Simulate-Plan": "free"})).json()
    assert me["plan"] == "admin" and me["simulated"] is False


def test_admin_test_context_applies_plan_everywhere_without_touching_real_data(env):
    uid, h = env.user("adm@example.com", role="admin")
    me = env.client.get("/api/me", headers=h).json()
    assert me["plan"] == "admin" and me["quota"]["unlimited"] is True
    me = env.client.post("/api/admin/test-context", json={"plan": "free"}, headers=h).json()
    assert me["plan"] == "free" and me["simulated"] is True and me["test_context"]["selected_plan"] == "free"
    assert me["quota"]["limit"] == 3 and me["quota"]["is_test"] is True
    assert env.scan(h, deep=True).status_code == 403                                   # behaves as Free
    ok = env.scan(h).json()
    assert ok["simulated_plan"] is True and ok["visibility"]["percent"] == 30 and ok["plan"] == "free"
    second = env.scan(h)
    assert second.status_code == 429 and second.json()["error_code"] == "DAILY_LIMIT"  # admin bypass does not hide limits
    with env.S() as s:
        assert s.query(CreditLedger).filter_by(user_id=uid, is_test=1).count() == 1
        assert s.query(CreditLedger).filter_by(is_test=0).count() == 0
        assert s.query(Subscription).filter_by(user_id=uid).count() == 0
    assert env.client.get("/api/admin/overview", headers=h).status_code == 200          # administration preserved
    r = env.client.post("/api/admin/test-context/reset-balance", headers=h).json()
    assert r["deleted_test_rows"] == 1 and r["quota"]["used"] == 0
    me = env.client.post("/api/admin/test-context", json={"plan": "pro", "quota_state": "exhausted"}, headers=h).json()
    assert me["quota"]["remaining"] == 0
    assert env.scan(h).json()["error_code"] == "QUOTA_EXCEEDED"
    me = env.client.post("/api/admin/test-context", json={"plan": "premium", "subscription_state": "expired"}, headers=h).json()
    assert me["plan"] == "free" and me["test_context"]["fallback_reason"] == "expired"
    me = env.client.post("/api/admin/test-context", json={"plan": "premium"}, headers=h).json()
    assert me["plan"] == "premium"
    prem = env.client.get(f"/api/audits/{ok['audit_id']}", headers=h).json()         # export/reopen follows the context
    assert prem["visibility"]["full"] is True and len(prem["findings"]) >= len(ok["findings"])
    me = env.client.post("/api/admin/test-context", json={"plan": "admin"}, headers=h).json()
    assert me["plan"] == "admin" and me["test_context"] is None and me["user"]["is_admin"] is True
    log = [i["action"] for i in env.client.get("/api/admin/log", headers=h).json()["items"]]
    assert {"test_context.set", "test_context.exit", "test_context.reset_balance"} <= set(log)


def test_regular_user_cannot_use_test_context_or_assign_plan(env):
    uid, h = env.user()
    assert env.client.post("/api/admin/test-context", json={"plan": "premium"}, headers=h).status_code == 403
    assert env.client.post("/api/admin/subscriptions", json={"user_id": uid, "plan": "premium"}, headers=h).status_code == 403
    assert env.client.put("/api/admin/plans", json={"plans": {"free": {"analyses_per_month": 999}}}, headers=h).status_code == 403
    assert env.client.get("/api/me", headers=h).json()["plan"] == "free"


def test_admin_publishes_plan_config_version(env):
    _, h = env.user("adm@example.com", role="admin")
    r = env.client.put("/api/admin/plans", json={"plans": {"pro": {"price_cents": 9900}}, "note": "teste"}, headers=h)
    assert r.status_code == 200 and r.json()["version"] == 2 and r.json()["changes"]["pro"]["price_cents"] == [9700, 9900]
    assert {p["plan"]: p["price_cents"] for p in env.client.get("/api/plans").json()["plans"]}["pro"] == 9900
    bad = env.client.put("/api/admin/plans", json={"plans": {"free": {"price_cents": 100}}}, headers=h)
    assert bad.status_code == 400 and bad.json()["detail"]["error_code"] == "INVALID_CONFIG"
    a = env.client.get("/api/admin/plans", headers=h).json()
    assert a["history"][0]["version"] == 2 and a["admin_role"]["analyses_per_month"] is None
    assert env.client.get("/api/admin/billing", headers=h).json()["enabled"] is False
    from datatrust import plans as _plans
    _plans.set_active_config(_plans.DEFAULT_CONFIG)


# ── admin ───────────────────────────────────────────────────────────────────
def test_admin_endpoints_forbidden_for_regular_users_and_anonymous(env):
    _, h = env.user()
    for method, path in [("get", "/api/admin/overview"), ("get", "/api/admin/audits"), ("get", "/api/admin/credits"),
                         ("get", "/api/admin/plans"), ("get", "/api/admin/log"), ("post", "/api/admin/plan-tests"),
                         ("post", "/api/admin/users/role"), ("get", "/api/admin/test-context"),
                         ("post", "/api/admin/test-context"), ("post", "/api/admin/test-context/reset-balance"),
                         ("get", "/api/admin/billing")]:
        assert getattr(env.client, method)(path, headers=h, **({"json": {"plan": "free", "user_id": "x", "role": "admin"}} if method == "post" else {})).status_code == 403, path
        assert getattr(env.client, method)(path, **({"json": {"plan": "free"}} if method == "post" else {})).status_code == 401, path


def test_admin_overview_audits_credits_and_log(env):
    _, user_h = env.user("cust@example.com")
    env.scan(user_h)
    _, h = env.user("adm@example.com", role="admin")
    ov = env.client.get("/api/admin/overview", headers=h).json()
    assert ov["services"]["database"]["ok"] is True and ov["services"]["dev_admin_mode_effective"] is False
    assert ov["audits_last_7_days"]["total"] == 1 and ov["audits_last_7_days"]["duration_ms"]["p95"] is None
    items = env.client.get("/api/admin/audits", headers=h).json()["items"]
    assert items[0]["user_email"] == "cust@example.com" and items[0]["status"] in ("completed", "partial")
    assert env.client.get("/api/admin/audits?status=running", headers=h).json()["items"] == []
    cr = env.client.get("/api/admin/credits", headers=h).json()
    assert sum(cr["by_state"].values()) == 1
    pt = env.client.post("/api/admin/plan-tests", json={"plan": "pro"}, headers=h).json()
    assert pt["failed"] == 0 and pt["isolated"] is True
    log = env.client.get("/api/admin/log", headers=h).json()["items"]
    assert log[0]["action"] == "plan_tests" and log[0]["actor"] == "adm@example.com"


def test_admin_role_management_is_logged_idempotent_and_safe(env):
    uid, _ = env.user("target@example.com")
    aid, h = env.user("adm@example.com", role="admin")
    r1 = env.client.post("/api/admin/users/role", json={"user_id": uid, "role": "admin"}, headers=h).json()
    r2 = env.client.post("/api/admin/users/role", json={"user_id": uid, "role": "admin"}, headers=h).json()
    assert r1["changed"] is True and r2["changed"] is False
    assert env.client.post("/api/admin/users/role", json={"user_id": aid, "role": "user"}, headers=h).status_code == 400
    assert env.client.post("/api/admin/users/role", json={"user_id": str(uuid.uuid4()), "role": "admin"}, headers=h).status_code == 404
    with env.S() as s:
        from datatrust.models import AdminAuditLog
        assert s.query(AdminAuditLog).filter_by(action="set_role", target=uid).count() == 1


def test_grant_admin_cli_flow(fresh_db, tmp_path, monkeypatch):
    """scripts/grant_admin.py: pending before first login, idempotent after."""
    import importlib.util, sys
    spec = importlib.util.spec_from_file_location("grant_admin", "scripts/grant_admin.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(sys, "argv", ["grant_admin", "--email", "datatrustaudit@gmail.com"])
    assert mod.main() == 3                                                    # no profile yet -> explicit PENDING
    S = sessionmaker(bind=fresh_db, expire_on_commit=False, future=True)
    with S() as s:
        accounts.upsert_profile(s, str(uuid.uuid4()), "datatrustaudit@gmail.com")
    assert mod.main() == 0 and mod.main() == 0
    with S() as s:
        assert s.query(Profile).filter_by(email="datatrustaudit@gmail.com").one().role == "admin"



# ── owner bootstrap (ADMIN_BOOTSTRAP_EMAILS) ──────────────────────────────────
def test_owner_email_becomes_admin_on_verified_login_and_is_logged(env, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "datatrustaudit@gmail.com")
    uid = str(uuid.uuid4())
    h = {"Authorization": f"Bearer {make_token(sub=uid, email='DataTrustAudit@gmail.com', extra={'app_metadata': {'provider': 'google'}})}"}
    r = env.client.get("/api/me", headers=h)
    assert r.status_code == 200 and r.json()["user"]["is_admin"] is True
    assert env.client.get("/api/admin/overview", headers=h).status_code == 200
    log = env.client.get("/api/admin/log", headers=h).json()
    assert any(e.get("action") == "role.bootstrap_admin" for e in log["items"])


def test_other_emails_and_unverified_owner_are_not_promoted(env, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "datatrustaudit@gmail.com")
    other = {"Authorization": f"Bearer {make_token(sub=str(uuid.uuid4()), email='someone@gmail.com')}"}
    assert env.client.get("/api/me", headers=other).json()["user"]["is_admin"] is False
    assert env.client.get("/api/admin/overview", headers=other).status_code == 403
    unverified = {"Authorization": f"Bearer {make_token(sub=str(uuid.uuid4()), email='datatrustaudit@gmail.com', extra={'user_metadata': {'email_verified': False}})}"}
    assert env.client.get("/api/me", headers=unverified).json()["user"]["is_admin"] is False


def test_bootstrap_disabled_when_env_empty(env, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "")
    h = {"Authorization": f"Bearer {make_token(sub=str(uuid.uuid4()), email='datatrustaudit@gmail.com')}"}
    assert env.client.get("/api/me", headers=h).json()["user"]["is_admin"] is False
