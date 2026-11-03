"""SSRF: URL validation, DNS rebinding, redirects to private addresses."""
import pytest

from conftest import PORT_A, PORT_B, _mock_routes, fake_resolver, fixture_url
from datatrust.collector import CollectorOptions
from datatrust.pipeline import ScanOptions, run_scan
from datatrust.static_fetch import static_fetch
from datatrust.url_guard import RequestGuard, UrlRejected, chromium_pin_args, ip_is_blocked, validate_url


@pytest.mark.parametrize("url", [
    "http://localhost/", "http://127.0.0.1/", "http://127.1/", "http://2130706433/", "http://0x7f000001/",
    "http://10.0.0.5/", "http://172.16.3.4/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[fe80::1]/", "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/", "http://0.0.0.0/",
    "http://metadata.google.internal/", "http://foo.internal/", "http://printer.local/", "http://100.64.0.1/",
])
def test_private_targets_rejected(url):
    from datatrust.url_guard import system_resolver
    with pytest.raises(UrlRejected) as e:
        validate_url(url, system_resolver)
    assert e.value.code in ("BLOCKED_TARGET", "INVALID_URL", "DNS_FAILURE")


@pytest.mark.parametrize("url", ["ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)",
                                 "http://user:pass@example.com/", "http://example.com:22/", "http://intranet/"])
def test_bad_urls_rejected(url):
    with pytest.raises(UrlRejected):
        validate_url(url, fake_resolver)


def test_public_url_accepted_and_pinned():
    t = validate_url("example.com", fake_resolver)
    assert t.url == "https://example.com" and t.resolved_ips == ["93.184.216.34"]
    assert chromium_pin_args(t) == ["--host-resolver-rules=MAP example.com 93.184.216.34"]


def test_dns_rebinding_hostname_resolving_to_loopback_is_blocked():
    with pytest.raises(UrlRejected) as e:
        validate_url("http://attacker.rebind.test/", fake_resolver)
    assert e.value.code == "BLOCKED_TARGET"


def test_any_private_record_among_many_blocks():
    with pytest.raises(UrlRejected):
        validate_url("http://dual.mixed.test/", fake_resolver)


def test_rebinding_after_validation_is_defeated_by_pinning():
    """Resolver answers public first, private second. The browser must use the pinned (validated) IP."""
    answers = iter([["93.184.216.34"], ["127.0.0.1"]])
    t = validate_url("http://flip.example/", lambda h, p: next(answers))
    args = chromium_pin_args(t)
    assert args == ["--host-resolver-rules=MAP flip.example 93.184.216.34"]
    # the request guard re-resolves sub-requests and blocks the rebinding answer
    g = RequestGuard(resolver=lambda h, p: ["127.0.0.1"])
    assert g.check("http://flip.example/x") is not None


def test_ip_classifier():
    assert ip_is_blocked("8.8.8.8") is None
    assert ip_is_blocked("::ffff:10.0.0.1")
    assert ip_is_blocked("169.254.169.254") == "cloud_metadata_endpoint"
    assert ip_is_blocked("fd00:ec2::254") == "cloud_metadata_endpoint"


def test_static_redirect_to_private_is_blocked():
    r = static_fetch(f"http://127.0.0.1:{PORT_A}/redirect-private", fake_resolver)
    assert not r.ok and r.error_code == "BLOCKED_REDIRECT"
    r = static_fetch(f"http://127.0.0.1:{PORT_A}/redirect-metadata", fake_resolver)
    assert not r.ok and r.error_code == "BLOCKED_REDIRECT"
    r = static_fetch(f"http://127.0.0.1:{PORT_A}/redirect-ok", fake_resolver)
    assert r.ok and r.final_url.endswith("/fixtures/ga4_basic.html")


def _opts():
    return ScanOptions(consent_phases=False, collector=CollectorOptions(
        nav_timeout_ms=8000, load_wait_ms=1500, idle_wait_ms=800, settle_ms=300, mock_routes=_mock_routes()))


def test_pipeline_refuses_redirect_to_private():
    r = run_scan(f"http://127.0.0.1:{PORT_A}/redirect-private", _opts(), resolver=fake_resolver)
    assert r["success"] is False and r["status"] == "blocked" and r["error_code"] == "BLOCKED_TARGET"
    assert r["evidence"] == [] and r["tags"] == []


def test_browser_never_reaches_internal_service():
    r = run_scan(fixture_url("ssrf_subrequests.html"), _opts(), resolver=fake_resolver)
    blocked = {(b["host"], b["resource_type"]) for b in r["network"]["blocked_by_guard"]}
    assert ("127.0.0.1", "fetch") in blocked
    blob = str(r)
    assert "INTERNAL-SECRET" not in blob


def test_browser_launch_has_no_disable_web_security():
    import inspect
    from datatrust import collector
    src = inspect.getsource(collector)
    assert "--disable-web-security" not in src
    assert "bypass_csp=True" not in src
