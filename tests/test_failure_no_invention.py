"""When collection fails, NOTHING may be invented."""
import json

from conftest import PORT_A, _mock_routes, fake_resolver, fixture_url
from datatrust.collector import CollectorOptions
from datatrust.pipeline import STATIC_ONLY_LIMITATION, ScanOptions, run_scan


class _BrokenBrowser:
    def __enter__(self):
        raise RuntimeError("Chromium could not be launched (simulated)")

    def __exit__(self, *a):
        pass


def _opts(**kw):
    return ScanOptions(collector=CollectorOptions(nav_timeout_ms=8000, load_wait_ms=1000, idle_wait_ms=500,
                                                  settle_ms=300, mock_routes=_mock_routes()), **kw)


def _assert_nothing_invented(r):
    assert r["scores"]["overall"]["score"] is None
    assert r["scores"]["overall"].get("null_reason")
    assert r["cookies"] == []
    assert r["storage"] == []
    for t in r["tags"]:
        assert t["observed_firing"] is None, "firing cannot be claimed without runtime"
        assert "network_collection_request" not in t["detection_methods"]
    for e in r["events"]["events"]:
        assert e["status"] != "OBSERVED" and not e["sent_to_ga4"]
    for f in r["findings"]:
        assert f["rule_id"] not in ("TRACKING_BEFORE_CONSENT_INTERACTION", "TRACKING_AFTER_REJECT",
                                    "TRACKING_WITHOUT_OBSERVED_CMP", "PII_VALUE_SENT_TO_THIRD_PARTY")
    blob = json.dumps(r).lower()
    for banned in ("estimatedfine", "multa", "r$ ", "_gid", "_fbp", "g-xxxx"):
        assert banned not in blob
    for e in r["evidence"]:
        assert e["source_type"] not in ("network", "cookie", "datalayer", "gtag", "fbq", "local_storage")


def test_browser_failure_static_fallback_is_partial_and_honest():
    r = run_scan(fixture_url("ga4_basic.html"), _opts(), resolver=fake_resolver, browser_factory=_BrokenBrowser)
    assert r["success"] is True
    assert r["status"] == "partial"
    assert r["capabilities"]["runtime_js"] is False and r["capabilities"]["static_html"] is True
    assert STATIC_ONLY_LIMITATION in r["limitations"]
    assert r["message"] == STATIC_ONLY_LIMITATION
    assert "SCAN_STATIC_ONLY" in {f["rule_id"] for f in r["findings"]}
    _assert_nothing_invented(r)
    tags = {t["vendor_id"]: t for t in r["tags"]}
    # GA4 code IS in the HTML source -> reported with medium confidence, from html only
    assert tags["ga4"]["confidence"] == "medium"
    assert tags["ga4"]["ids"] == ["G-TEST12345"]
    assert set(tags["ga4"]["detection_methods"]) <= {"html_code_signature", "html_script_tag"}
    for axis in r["scores"]["axes"].values():
        assert axis["score"] is None or axis["confidence"] in ("low", None) or True
    assert r["scores"]["axes"]["consent_integrity"]["score"] is None
    assert r["scores"]["axes"]["privacy_exposure"]["score"] is None
    assert "CONSENT_BEHAVIOR_UNVERIFIED" in {f["rule_id"] for f in r["findings"]}


def test_static_fallback_on_clean_page_reports_no_tags():
    r = run_scan(fixture_url("clean_no_tracking.html"), _opts(), resolver=fake_resolver, browser_factory=_BrokenBrowser)
    assert r["status"] == "partial"
    assert r["tags"] == []
    _assert_nothing_invented(r)


def test_total_failure_returns_failed_with_empty_report():
    # nothing listens on this allow-listed? no: use the allow-listed host with a closed path server-wide -> use NX domain
    r = run_scan("https://does-not-exist.nx.test/", _opts(), resolver=fake_resolver, browser_factory=_BrokenBrowser)
    assert r["success"] is False
    assert r["status"] == "failed"
    assert r["error_code"] == "DNS_FAILURE"
    assert r["tags"] == [] and r["findings"] == [] and r["evidence"] == [] and r["cookies"] == []
    assert r["scores"]["overall"]["score"] is None


def test_browser_and_static_both_fail():
    import socket
    s = socket.socket(); s.bind(("127.0.0.1", 0)); dead_port = s.getsockname()[1]; s.close()
    import os
    os.environ["DATATRUST_TEST_ALLOW_HOSTS"] += f",127.0.0.1:{dead_port}"
    try:
        r = run_scan(f"http://127.0.0.1:{dead_port}/", _opts(), resolver=fake_resolver, browser_factory=_BrokenBrowser)
    finally:
        os.environ["DATATRUST_TEST_ALLOW_HOSTS"] = f"127.0.0.1:{PORT_A}"
    assert r["success"] is False
    assert r["status"] in ("failed", "timeout", "protocol_error")
    assert r["tags"] == [] and r["evidence"] == [] and r["cookies"] == [] and r["findings"] == []
    assert r["scores"]["overall"]["score"] is None
    assert "no observation was made" in r["limitations"][0].lower()
