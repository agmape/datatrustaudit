"""
End-to-end UI tests in a REAL browser against the REAL frontend (Vite dev server) and REAL backend (uvicorn, in-process).

What is real:  routing, providers, JWT verification (HS256 with a TEST secret), database, plans/quotas, history, i18n, admin.
What is stubbed: (1) the scan engine call returns a genuine report produced earlier from a local fixture page by the real
pipeline (so the UI renders real engine output without needing internet); (2) the Supabase auth HTTP endpoints are mocked at
the browser level — the real Supabase project is unreachable from this environment, so REAL login is NOT covered here.
"""
import copy
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
import requests
import uvicorn
from playwright.sync_api import sync_playwright

from conftest import TEST_JWT_SECRET, TEST_SUPABASE_URL, make_token

pytestmark = pytest.mark.e2e
ROOT = Path(__file__).resolve().parents[2]
STORAGE_KEY = "sb-testproject-auth-token"
ENGLISH = re.compile(r"\b(the|was|were|with|without|before|after|observed|requests?|sent|which|because)\b", re.I)


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def session_for(uid, email, exp_in=3600, token_exp_in=None):
    tok = make_token(sub=uid, email=email, exp_in=token_exp_in if token_exp_in is not None else exp_in)
    now = int(time.time())
    return {"access_token": tok, "refresh_token": "rt-e2e", "expires_in": exp_in, "expires_at": now + exp_in, "token_type": "bearer",
            "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": email, "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}}


@pytest.fixture(scope="module")
def stack(tmp_path_factory, scanned):
    import main
    from api import audit as audit_api
    from datatrust import db as dtdb
    eng = dtdb.make_engine(f"sqlite:///{(tmp_path_factory.mktemp('e2e') / 'e2e.db').as_posix()}")
    dtdb.run_migrations(eng); dtdb.configure_engine(eng)
    base = scanned("onetrust.html", True)

    def fake_run(url, opts, scan_id=None, **kw):
        time.sleep(0.4)
        r = copy.deepcopy(base); r["scan_id"], r["mode"] = scan_id, ("deep" if opts.deep else "single")
        if "formula" in url:       # hostile raw content that could become a spreadsheet formula
            r["findings"][0]["pages"] = ['=HYPERLINK("http://evil.example","x")']
            r["findings"][1]["pages"] = ["@SUM(1+1)"]
            r["findings"][2]["pages"] = ["+1+1"]
        return r
    real_run = audit_api.run_scan
    audit_api.run_scan = fake_run
    audit_api._hits.clear()

    api_port, ui_port = free_port(), free_port()
    server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=api_port, log_level="warning"))
    th = threading.Thread(target=server.run, daemon=True); th.start()
    for _ in range(100):
        try:
            if requests.get(f"http://127.0.0.1:{api_port}/health", timeout=1).ok: break
        except Exception: time.sleep(0.2)
    env = dict(os.environ, VITE_SUPABASE_URL=TEST_SUPABASE_URL, VITE_SUPABASE_ANON_KEY="sb_publishable_e2e_test_key_000000000",
               DT_API_TARGET=f"http://127.0.0.1:{api_port}", BROWSER="none")
    vite = subprocess.Popen(f"npm run dev -- --host 127.0.0.1 --port {ui_port} --strictPort", cwd=ROOT / "static", env=env, shell=True,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(150):
        try:
            if requests.get(f"http://127.0.0.1:{ui_port}/", timeout=1).ok: break
        except Exception: time.sleep(0.3)
    else:
        pytest.fail("vite did not start")
    yield {"ui": f"http://127.0.0.1:{ui_port}", "api": f"http://127.0.0.1:{api_port}", "engine": eng}
    subprocess.run(f"taskkill /PID {vite.pid} /T /F", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server.should_exit = True
    th.join(timeout=10)
    audit_api.run_scan = real_run


@pytest.fixture(scope="module")
def browser(stack):
    # `stack` first: it runs a real scan (own Playwright) BEFORE this long-lived sync Playwright session starts.
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        yield b
        b.close()


def new_ctx(browser, stack, session=None, lang="pt-BR", mobile=False, mock_auth=True):
    ctx = browser.new_context(locale=lang, viewport={"width": 390, "height": 844} if mobile else {"width": 1366, "height": 900})
    if session:
        ctx.add_init_script(f"localStorage.setItem('{STORAGE_KEY}', {json.dumps(json.dumps(session))});")
    if mock_auth:
        def supa(route):
            u = route.request.url
            if "/auth/v1/logout" in u:
                return route.fulfill(status=204, body="")
            return route.fulfill(status=404, content_type="application/json", body=json.dumps({"error_code": "not_mocked", "msg": "not mocked"}))
        ctx.route("https://testproject.supabase.co/**", supa)
    return ctx


def mk_user(stack, email, role=None, plan=None):
    import uuid
    from datetime import timedelta
    from sqlalchemy.orm import sessionmaker
    from datatrust import accounts
    from datatrust.models import Subscription, utcnow
    uid = str(uuid.uuid4())
    S = sessionmaker(bind=stack["engine"], expire_on_commit=False, future=True)
    with S() as s:
        accounts.upsert_profile(s, uid, email)
        if role:
            accounts.set_role(s, uid, role, "e2e")
        if plan:
            s.add(Subscription(id=str(uuid.uuid4()), user_id=uid, plan=plan, status="active",
                               current_period_end=utcnow() + timedelta(days=30), created_at=utcnow(), updated_at=utcnow()))
            s.commit()
    return uid


def premium_page(browser, stack, email, **kw):
    uid = mk_user(stack, email, plan="premium")
    ctx = new_ctx(browser, stack, session_for(uid, email), **kw)
    return ctx, ctx.new_page()


def run_scan_ui(page, url="https://site.example/"):
    page.get_by_label("URL").fill(url)
    page.get_by_role("button", name="Auditar").click()
    page.get_by_role("tab", name="Visão do gestor").wait_for(timeout=30000)


# ───────────────────────────────────────────────────────────────────────────
def test_anonymous_visitor_sees_free_account_cta_and_cannot_run_analyses(browser, stack):
    ctx = new_ctx(browser, stack); page = ctx.new_page(); page.goto(stack["ui"] + "/")
    assert page.locator("html").get_attribute("lang") == "pt-BR"
    assert page.get_by_role("navigation", name="Principal").get_by_role("link", name="Entrar").is_visible()
    page.get_by_label("URL").fill("https://site.example/")
    page.get_by_role("button", name="Auditar").click()
    page.get_by_text("Criar conta grátis (sem cartão)").first.wait_for(timeout=10000)
    assert page.get_by_role("tab", name="Visão do gestor").count() == 0
    ctx.close()


def test_manager_view_in_portuguese_then_technical_with_same_numbers(browser, stack):
    ctx, page = premium_page(browser, stack, "views@example.com"); page.goto(stack["ui"] + "/")
    run_scan_ui(page)
    mgr = page.locator("main").inner_text()
    assert "Principais problemas confirmados" in mgr and "O que encontramos" in mgr and "O que pedir para a equipe" in mgr
    assert "Ferramentas continuaram enviando dados depois de" in mgr                      # finding title, Portuguese, from the engine rule code
    assert "Visibilidade do plano" in mgr and "100%" in mgr
    assert not ENGLISH.search(mgr.split("Limites desta auditoria")[0]), ENGLISH.search(mgr).group(0)
    low = mgr.lower()
    assert "multa estimada" not in low and "multa de" not in low and "violando a lgpd" not in low
    head = page.locator("main").get_by_text(re.compile(r"Achados: \d+")).first.inner_text()
    n_total = int(re.search(r"Achados: (\d+)", head).group(1))
    page.get_by_role("tab", name="Visão técnica").click()
    head2 = page.locator("main").get_by_text(re.compile(r"Achados: \d+")).first.inner_text()
    assert head2 == head                                                                    # identical counts in both views
    page.get_by_role("tab", name=re.compile(r"^Achados \(")).click()
    assert page.locator("[id^='tech-F-']").count() == n_total                                # Premium: every detail
    page.get_by_role("tab", name="Visão do gestor").click()
    page.get_by_role("button", name="Ver detalhes técnicos").first.click()
    page.get_by_role("tab", name="Visão técnica", selected=True).wait_for()
    assert page.locator("[id^='tech-F-']").count() == 1
    ctx.close()


def test_language_switch_persists_and_returns_to_portuguese(browser, stack):
    ctx, page = premium_page(browser, stack, "lang@example.com"); page.goto(stack["ui"] + "/")
    run_scan_ui(page)
    page.get_by_role("button", name="EN", exact=True).click()
    page.get_by_role("tab", name="Manager view").wait_for()
    EN = json.loads((ROOT / "static/src/i18n/en.json").read_text(encoding="utf-8"))
    assert EN["report"]["topProblems"] in page.locator("main").inner_text()
    page.reload(); assert page.locator("html").get_attribute("lang") == "en"                # choice persisted
    page.get_by_role("button", name="PT", exact=True).click()
    page.reload(); assert page.locator("html").get_attribute("lang") == "pt-BR"
    assert "Auditoria" in page.content()
    ctx.close()


@pytest.mark.parametrize("path", ["/app", "/admin", "/configuracoes", "/auditorias/xyz"])
def test_protected_routes_redirect_anonymous_to_login(browser, stack, path):
    ctx = new_ctx(browser, stack); page = ctx.new_page(); page.goto(stack["ui"] + path)
    page.wait_for_url(re.compile(r"/auth"), timeout=10000)
    assert page.get_by_role("heading", name="Entrar", exact=True).is_visible()
    ctx.close()


def test_login_form_errors_and_success_with_mocked_supabase(browser, stack):
    uid = mk_user(stack, "login@example.com")
    ctx = new_ctx(browser, stack)

    def token(route):
        body = json.loads(route.request.post_data or "{}")
        if body.get("password") == "correct-horse-1":
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(session_for(uid, "login@example.com")))
        return route.fulfill(status=400, content_type="application/json", body=json.dumps({"error_code": "invalid_credentials", "msg": "Invalid login credentials"}))
    ctx.route("https://testproject.supabase.co/auth/v1/token**", token)
    ctx.route("https://testproject.supabase.co/auth/v1/recover**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
    page = ctx.new_page(); page.goto(stack["ui"] + "/auth")
    page.get_by_label("E-mail").fill("login@example.com")
    page.get_by_label("Senha").fill("short"); page.get_by_role("button", name="Entrar", exact=True).click()
    assert "pelo menos 8 caracteres" in page.get_by_role("alert").inner_text()
    page.get_by_label("Senha").fill("wrong-password-1"); page.get_by_role("button", name="Entrar", exact=True).click()
    page.get_by_text("E-mail ou senha incorretos.").wait_for()
    page.get_by_role("button", name="Esqueci minha senha").click()
    page.get_by_label("E-mail").fill("login@example.com"); page.get_by_role("button", name="Enviar link de recuperação").click()
    page.get_by_text("Se o e-mail existir").wait_for()
    page.get_by_role("button", name="Voltar para entrar").click()
    page.get_by_label("E-mail").fill("login@example.com"); page.get_by_label("Senha").fill("correct-horse-1")
    page.get_by_role("button", name="Entrar", exact=True).click()
    page.wait_for_url(re.compile(r"/app$"), timeout=15000)
    page.get_by_text("Minhas auditorias").first.wait_for()
    page.locator("main").get_by_text("Free", exact=True).first.wait_for(timeout=15000)
    ctx.close()


def test_free_user_flow_quota_visibility_history_reopen_and_daily_limit(browser, stack):
    uid = mk_user(stack, "flow@example.com")
    ctx = new_ctx(browser, stack, session_for(uid, "flow@example.com")); page = ctx.new_page(); page.goto(stack["ui"] + "/app")
    page.get_by_text(re.compile(r"0 de 3 análises neste mês · renova em \d{2}/\d{2}/\d{4}")).first.wait_for(timeout=15000)
    assert "0 de 1 domínios" in page.locator("main").inner_text() and "0 de 1 hoje" in page.locator("main").inner_text()
    assert page.get_by_role("switch").first.is_disabled()                                  # Free: multi-page scan locked
    run_scan_ui(page)
    main_txt = page.locator("main").inner_text()
    assert "Visibilidade do plano" in main_txt and "30%" in main_txt
    assert re.search(r"\d+ de \d+ detalhes disponíveis no Free", main_txt)                # real count of withheld details
    assert page.get_by_role("link", name="Comparar planos").count() >= 1
    page.get_by_text("Esta auditoria foi salva no seu histórico.").wait_for()
    page.get_by_role("link", name="Abrir").first.click()
    page.wait_for_url(re.compile(r"/auditorias/[0-9a-f-]{36}$"))
    url = page.url
    page.get_by_role("tab", name="Visão do gestor").wait_for()
    page.goto(url); page.reload()                                                           # direct URL + refresh
    page.get_by_role("tab", name="Visão do gestor").wait_for(timeout=20000)
    page.get_by_role("button", name="EN", exact=True).click()
    page.get_by_role("tab", name="Manager view").wait_for()
    page.get_by_role("button", name="PT", exact=True).click()
    page.get_by_role("tab", name="Visão do gestor").wait_for()
    page.goto(stack["ui"] + "/app")
    page.get_by_text(re.compile(r"1 de 3 análises neste mês")).first.wait_for(timeout=15000)   # reopen/language did not consume
    page.get_by_label("URL").fill("https://site.example/")
    page.get_by_role("button", name="Auditar").click()
    page.get_by_text(re.compile(r"permite 1 análise por dia")).first.wait_for(timeout=15000)
    ctx.close()


def test_other_users_audit_url_is_not_readable(browser, stack):
    a = mk_user(stack, "a@example.com"); b = mk_user(stack, "b@example.com")
    ca = new_ctx(browser, stack, session_for(a, "a@example.com")); pa = ca.new_page(); pa.goto(stack["ui"] + "/app")
    pa.get_by_text(re.compile(r"análises neste mês")).first.wait_for(timeout=15000)
    run_scan_ui(pa); pa.get_by_role("link", name="Abrir").first.click(); pa.wait_for_url(re.compile(r"/auditorias/"))
    audit_url = pa.url
    cb = new_ctx(browser, stack, session_for(b, "b@example.com")); pb = cb.new_page(); pb.goto(audit_url)
    pb.get_by_role("alert").wait_for(timeout=15000)
    assert "Não encontrado" in pb.get_by_role("alert").inner_text() or "reabrir" in pb.get_by_role("alert").inner_text()
    assert pb.get_by_role("tab", name="Visão do gestor").count() == 0
    ca.close(); cb.close()


def test_regular_user_sees_403_and_admin_can_test_plans_with_server_context(browser, stack):
    uid = mk_user(stack, "boss@example.com")
    ctx = new_ctx(browser, stack, session_for(uid, "boss@example.com")); page = ctx.new_page()
    page.goto(stack["ui"] + "/admin"); page.get_by_text("403").wait_for()
    assert "Acesso restrito a administradores." in page.locator("body").inner_text()
    from sqlalchemy.orm import sessionmaker
    from datatrust import accounts
    with sessionmaker(bind=stack["engine"], future=True)() as s:
        accounts.set_role(s, uid, "admin", "e2e")
    page.reload(); page.get_by_role("heading", name="Administração").wait_for(timeout=15000)
    page.get_by_text("Banco de dados").first.wait_for(timeout=15000)
    assert "Banco de dados" in page.locator("main").inner_text()
    page.get_by_text("IGNORADA").first.wait_for(timeout=15000)
    assert "IGNORADA" in page.locator("main").inner_text()                                  # DEV_ADMIN_MODE present in env, ignored
    page.get_by_role("tab", name="Testar planos").click()
    page.get_by_role("button", name="Executar testes de Free").click()
    page.get_by_text(re.compile(r"\d+ de \d+ testes passaram")).wait_for(timeout=30000)
    txt = page.locator("main").inner_text()
    m = re.search(r"(\d+) de (\d+) testes passaram", txt); assert m.group(1) == m.group(2)
    page.get_by_role("button", name=re.compile(r"Testar Pro 70%")).click()
    page.get_by_text("Modo de teste: Pro, 70%, 30 análises/mês").first.wait_for(timeout=15000)
    assert page.get_by_role("button", name=re.compile(r"Testar Pro 70%")).get_attribute("aria-pressed") == "true"
    page.goto(stack["ui"] + "/app")
    page.get_by_text(re.compile(r"0 de 30 análises neste mês")).first.wait_for(timeout=15000)
    assert not page.get_by_role("switch").first.is_disabled()                              # Pro rules applied by the server
    page.get_by_role("button", name="Voltar ao administrador").first.click()
    page.get_by_text("Administrador — sem limite comercial").first.wait_for(timeout=15000)
    assert page.get_by_text("Modo de teste").count() == 0
    ctx.close()


def test_expired_server_side_token_signs_user_out_and_redirects(browser, stack):
    uid = mk_user(stack, "exp@example.com")
    # session JSON looks valid to the SDK (expires_at in the future) but the JWT itself is expired for the server
    ctx = new_ctx(browser, stack, session_for(uid, "exp@example.com", exp_in=3600, token_exp_in=-120)); page = ctx.new_page()
    page.goto(stack["ui"] + "/app")
    page.wait_for_url(re.compile(r"/auth"), timeout=15000)
    assert page.get_by_role("heading", name="Entrar", exact=True).is_visible()
    ctx.close()


def test_mobile_layout_has_no_horizontal_scroll_and_views_are_keyboard_reachable(browser, stack):
    ctx, page = premium_page(browser, stack, "mobile@example.com", mobile=True); page.goto(stack["ui"] + "/")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    run_scan_ui(page)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "manager view overflows on mobile"
    page.get_by_role("tab", name="Visão técnica").click()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "technical view overflows on mobile"
    page.get_by_role("tab", name="Visão do gestor").click()
    page.evaluate("document.activeElement && document.activeElement.blur()")
    for _ in range(80):                                                                    # keyboard-only: reach and activate the technical tab
        page.keyboard.press("Tab")
        if page.evaluate("document.activeElement && document.activeElement.textContent === 'Visão técnica'"):
            break
    else:
        pytest.fail("technical view tab not reachable with Tab")
    page.keyboard.press("Enter")
    page.get_by_role("tab", name="Visão técnica", selected=True).wait_for()
    ctx.close()


def test_login_returns_to_the_originally_requested_page(browser, stack):
    uid = mk_user(stack, "back@example.com")
    ctx = new_ctx(browser, stack)
    ctx.route("https://testproject.supabase.co/auth/v1/token**", lambda r: r.fulfill(
        status=200, content_type="application/json", body=json.dumps(session_for(uid, "back@example.com"))))
    page = ctx.new_page(); page.goto(stack["ui"] + "/configuracoes")
    page.wait_for_url(re.compile(r"/auth"))
    page.get_by_label("E-mail").fill("back@example.com"); page.get_by_label("Senha").fill("correct-horse-1")
    page.get_by_role("button", name="Entrar", exact=True).click()
    page.wait_for_url(re.compile(r"/configuracoes$"), timeout=15000)
    page.get_by_role("heading", name="Configurações").wait_for()
    assert "back@example.com" in page.locator("main").inner_text()
    page.get_by_role("button", name="Sair da conta").click()                                # logout clears the session
    page.goto(stack["ui"] + "/app"); page.wait_for_url(re.compile(r"/auth"))
    ctx.close()


def test_exports_are_real_files_with_masked_content_and_no_formula_injection(browser, stack):
    import csv as csvmod, io
    ctx, page = premium_page(browser, stack, "exports@example.com"); page.goto(stack["ui"] + "/")
    run_scan_ui(page, "https://formula.example/")
    page.get_by_role("tab", name="Visão técnica").click()
    with page.expect_download() as d:
        page.get_by_role("button", name="Achados (CSV)").click()
    dl = d.value; raw = Path(dl.path()).read_bytes()
    assert dl.suggested_filename.endswith("-achados.csv") and raw.startswith(b"\xef\xbb\xbf")      # UTF-8 BOM for Excel
    text = raw.decode("utf-8-sig"); rows = list(csvmod.reader(io.StringIO(text), delimiter=";"))
    assert rows[0][:4] == ["id", "regra", "titulo", "estado"]                               # Portuguese header, ';' delimiter (pt-BR)
    assert len(rows) - 1 == int(re.search(r"Achados: (\d+)", page.locator("main").inner_text()).group(1))
    for row in rows:
        for cell in row:
            assert not re.match(r"^[=+\-@]", cell) or re.match(r"^[+-]?\d+([.,]\d+)?$", cell), f"formula-like cell: {cell!r}"
    assert any(c.startswith("'=") or c.startswith("'@") or c.startswith("'+") for row in rows for c in row), "hostile cells must be neutralised, not dropped"
    assert "Ferramentas continuaram" in text or "Comportamento" in text                    # accents/Portuguese intact
    with page.expect_download() as d2:
        page.get_by_role("button", name="Evidências (CSV)").click()
    ev = Path(d2.value.path()).read_bytes().decode("utf-8-sig")
    assert ev.splitlines()[0].split(";")[:3] == ['"id"', '"tipo"', '"fase"']
    with page.expect_download() as d3:
        page.get_by_role("button", name="Exportar JSON").click()
    data = json.loads(Path(d3.value.path()).read_text(encoding="utf-8"))
    assert data["contract_version"] == "1.0" and data["language"] == "pt-BR" and len(data["evidence"]) > 0
    assert "multa" not in json.dumps(data, ensure_ascii=False).lower().replace("nenhuma multa ou dano é estimado", "")
    ctx.close()
