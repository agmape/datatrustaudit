"""
Regressions for false positives found while scanning REAL sites (2026-10-27, www.cookiebot.com).
Each test pins the corrected behavior.
"""
from datatrust.analyzers import AnalysisContext, analyze_implementation
from datatrust.catalog import BY_ID, vendors_for_url
from datatrust.evidence import EvidenceStore, Phase, SourceType
from datatrust.findings import FindingList
from datatrust.redaction import find_pii_spans, redact_value


def test_cloudflare_bot_cookie_token_is_not_a_card():
    # random token fragments with digit groups previously matched the card pattern
    for v in ("1793126365914-1.0.1.1-AbCdEf", "x4111 1111 1111 1111", "a.4111-1111-1111-1111.b",
              "4111-1111 1111-1111"):
        assert [k for *_x, k in find_pii_spans(v)] == [], v
    assert [k for *_x, k in find_pii_spans("cartão 4111-1111-1111-1111 ok")] == ["card"]


def test_public_sdk_api_keys_are_not_credentials():
    v, red, hits = redact_value("0123456789abcdef0123456789abcdef", "api_key")
    assert not any(h.kind == "credential" for h in hits)
    v, red, hits = redact_value("hunter2", "password")
    assert hits and hits[0].kind == "credential" and v == "[REDACTED_CREDENTIAL]"


def test_google_tag_manager_global_alone_is_not_gtm():
    assert BY_ID["gtm"].globals == []
    # server-side GTM custom domains are still recognized through the GA4 beacon
    m = dict((v.id, k) for v, k in vendors_for_url("https://sst.example.com/g/collect?v=2&tid=G-ABCD123456&en=page_view"))
    assert m == {"ga4": "beacon"}


def test_hotjar_modules_script_recognized():
    assert dict((v.id, k) for v, k in vendors_for_url("https://script.hotjar.com/modules.abc123.js"))["hotjar"] == "script"


def _hit(store, phase, gcs, after):
    return store.add(source_type=SourceType.NETWORK, phase=phase, page_url="https://s.example/",
                     request_url="https://sst.example/g/collect", after_interaction=after,
                     parsed={"beacon_vendors": ["ga4"], "ga4_events": [
                         {"tid": "G-ABCD123456", "en": "page_view", "page_location": "https://s.example/", "gcs": gcs}]})


def test_consent_update_page_view_resend_is_not_a_duplicate():
    store = EvidenceStore()
    _hit(store, Phase.ACCEPT, "G100", False)   # denied ping before the click
    _hit(store, Phase.ACCEPT, "G111", True)    # re-sent after consent update
    ctx = AnalysisContext(store=store, pii_hits=[], home_url="https://s.example/", pages=["https://s.example/"],
                          runtime_available=True)
    fl = FindingList()
    analyze_implementation(ctx, [], fl)
    assert "GA4_DUPLICATE_PAGE_VIEW" not in {f.rule_id for f in fl.items}


def test_true_duplicate_page_view_still_detected():
    store = EvidenceStore()
    _hit(store, Phase.BASELINE, None, None)
    _hit(store, Phase.BASELINE, None, None)
    ctx = AnalysisContext(store=store, pii_hits=[], home_url="https://s.example/", pages=["https://s.example/"],
                          runtime_available=True)
    fl = FindingList()
    analyze_implementation(ctx, [], fl)
    assert "GA4_DUPLICATE_PAGE_VIEW" in {f.rule_id for f in fl.items}


def test_hashed_values_under_any_pii_key_are_hashed_identifiers():
    h = "a" * 64
    for key in ("ud[fn]", "ud[ln]", "ud[ct]", "ud[zp]", "ud[em]", "ph"):
        v, red, hits = redact_value(h, key)
        assert v == "[HASHED_VALUE]" and hits[0].kind == "hashed_identifier", key
