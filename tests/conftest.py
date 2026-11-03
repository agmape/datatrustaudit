"""
Shared test infrastructure: two local HTTP servers, a deterministic DNS
resolver and a scan helper. No internet access is needed: every third-party
request is answered by local mocks AFTER passing the SSRF guard.
"""
import http.server
import ipaddress
import os
import re
import socket
import socketserver
import sys
import threading
from functools import partial
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIX = Path(__file__).resolve().parent / "fixtures"
PUBLIC_IP = "93.184.216.34"   # documentation-like public address returned for every external hostname


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


PORT_A = _free_port()   # allow-listed fixture origin
PORT_B = _free_port()   # NOT allow-listed (simulates an internal service)
os.environ["DATATRUST_TEST_ALLOW_HOSTS"] = f"127.0.0.1:{PORT_A}"

# ── account/auth test configuration (never the real project's secrets) ──────
TEST_JWT_SECRET = "unit-test-secret-unit-test-secret-0123456789"
TEST_SUPABASE_URL = "https://testproject.supabase.co"
os.environ["SUPABASE_URL"] = TEST_SUPABASE_URL
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["DEV_ADMIN_MODE"] = "true"          # must be IGNORED by the application (tested)
os.environ["VITE_DEV_ADMIN_MODE"] = "true"
os.environ["GOOGLE_API_KEY"] = ""
os.environ["ADMIN_BOOTSTRAP_EMAILS"] = ""       # owner bootstrap off by default; enabled per test



class _FixtureHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="text/html; charset=utf-8", headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/redirect-private":
            return self._send(302, headers={"Location": f"http://127.0.0.1:{PORT_B}/internal"})
        if path == "/redirect-metadata":
            return self._send(302, headers={"Location": "http://169.254.169.254/latest/meta-data/"})
        if path == "/redirect-ok":
            return self._send(302, headers={"Location": "/fixtures/ga4_basic.html"})
        if path == "/_hit.js":
            return self._send(200, (FIX / "_hit.js").read_bytes(), "application/javascript")
        if path.startswith("/fixtures/"):
            f = FIX / path[len("/fixtures/"):]
            if f.exists() and f.is_file():
                body = f.read_text(encoding="utf-8").replace("__OTHER_HOST__", f"127.0.0.1:{PORT_B}")
                return self._send(200, body.encode("utf-8"))
            return self._send(404, b"not found")
        return self._send(200, b"<!doctype html><html><body><h1>page</h1></body></html>")

    def do_POST(self):
        return self._send(204)


class _InternalHandler(_FixtureHandler):
    def do_GET(self):
        return self._send(200, b"INTERNAL-SECRET", "text/plain")


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def _start(handler, port):
    srv = _Server(("127.0.0.1", port), handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


@pytest.fixture(scope="session", autouse=True)
def servers():
    a = _start(_FixtureHandler, PORT_A)
    b = _start(_InternalHandler, PORT_B)
    yield
    a.shutdown()
    b.shutdown()


def fake_resolver(host, port):
    """Deterministic resolver: IP literals resolve to themselves; *.rebind.test to loopback; others public."""
    try:
        ipaddress.ip_address(host)
        return [host]
    except ValueError:
        pass
    if host.endswith(".rebind.test"):
        return ["127.0.0.1"]
    if host.endswith(".mixed.test"):
        return [PUBLIC_IP, "10.1.2.3"]
    if host.endswith(".nx.test"):
        raise socket.gaierror("nx")
    return [PUBLIC_IP]


def _mock_routes():
    m = FIX / "mocks"
    return [
        (re.compile(r"googletagmanager\.com/gtm\.js"), "application/javascript", (m / "gtm.js").read_bytes()),
        (re.compile(r"googletagmanager\.com/gtag/js"), "application/javascript", b"/* gtag.js mock */"),
        (re.compile(r"googletagmanager\.com/ns\.html"), "text/html", b"<html></html>"),
        (re.compile(r"connect\.facebook\.net/.+/fbevents\.js"), "application/javascript", (m / "fbevents.js").read_bytes()),
        (re.compile(r"consent\.cookiebot\.com/uc\.js"), "application/javascript", (m / "cookiebot_uc.js").read_bytes()),
        (re.compile(r"cdn\.cookielaw\.org/"), "application/javascript", (m / "onetrust_stub.js").read_bytes()),
        # every other external host: empty 200 (keeps tests offline)
        (re.compile(r"^https?://(?!127\.0\.0\.1[:/])"), "text/plain", b""),
    ]


def fixture_url(name: str) -> str:
    return f"http://127.0.0.1:{PORT_A}/fixtures/{name}"


def scan_fixture(name: str, consent: bool = False, deep: bool = False, **kw):
    from datatrust.collector import CollectorOptions
    from datatrust.pipeline import ScanOptions, run_scan
    co = CollectorOptions(nav_timeout_ms=15000, load_wait_ms=4000, idle_wait_ms=1500, settle_ms=900,
                          post_interaction_ms=1500, banner_wait_ms=600, mock_routes=_mock_routes())
    opts = ScanOptions(deep=deep, consent_phases=consent, collector=co, total_budget_s=120, **kw)
    return run_scan(fixture_url(name) if not name.startswith("http") else name, opts, resolver=fake_resolver)


_CACHE = {}


@pytest.fixture(scope="session")
def scanned():
    """Memoized fixture scans (each fixture scanned once per session)."""
    def get(name, consent=False):
        key = (name, consent)
        if key not in _CACHE:
            _CACHE[key] = scan_fixture(name, consent=consent)
        return _CACHE[key]
    return get


@pytest.fixture()
def fresh_db():
    """Isolated in-memory database with migrations applied; becomes the global engine for the test."""
    from datatrust import db as dtdb
    eng = dtdb.make_engine("sqlite://")
    dtdb.run_migrations(eng)
    dtdb.configure_engine(eng)
    yield eng
    eng.dispose()


def make_token(sub=None, email="user@example.com", secret=TEST_JWT_SECRET, alg="HS256", exp_in=3600, iss=None,
               aud="authenticated", role="authenticated", extra=None, headers=None, key=None):
    import time as _t
    import uuid as _u
    from jose import jwt as _jwt
    claims = {"sub": sub or str(_u.uuid4()), "email": email, "aud": aud, "role": role,
              "iss": iss or f"{TEST_SUPABASE_URL}/auth/v1", "iat": int(_t.time()), "exp": int(_t.time()) + exp_in}
    claims.update(extra or {})
    return _jwt.encode(claims, key if key is not None else secret, algorithm=alg, headers=headers)
