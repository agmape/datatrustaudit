"""
Score regression tests (SCORING.md, version 2026.10.1).

Expected values are derived by hand from the scoring rules and the known ground
truth of each fixture — not copied from a run. If a rule changes, bump
SCORING_VERSION and update SCORING.md together with these expectations.
"""
import pytest

from datatrust.scoring import SCORING_VERSION

# fixture -> {axis: expected score or None}, overall
EXPECTED = {
    # no tags: tracking N/A (0 applicable), events N/A, consent N/A (no CMP), privacy 100 (3/3) -> coverage 0.2 < 0.5 -> overall None
    "clean_no_tracking.html": ({"tracking_implementation": None, "event_data_quality": None,
                                "consent_integrity": None, "privacy_exposure": 100}, None),
    # GA4 fires, no dup, no UA, no placeholder, config collects -> 5/5 = 100; consent N/A; privacy 100
    # overall = (0.3*100 + 0.2*100) / 0.5 = 100
    "ga4_basic.html": ({"tracking_implementation": 100, "event_data_quality": None,
                        "consent_integrity": None, "privacy_exposure": 100}, 100),
    # consent default AFTER config: consent_mode_default_first applicable & failed -> 0/1 = 0
    # overall = (0.3*100 + 0.3*0 + 0.2*100) / 0.8 = 62.5 -> 62
    "consent_mode_v2_wrong_order.html": ({"tracking_implementation": 100, "consent_integrity": 0,
                                          "privacy_exposure": 100}, 62),
    # purchase missing params: event axis 0/1 = 0. tracking: fires:ga4 ok, page_view check N/A, ua ok,
    # placeholder ok, ga4_config_collects ok -> 4/4 = 100. overall = (30 + 0 + 20)/0.7 = 71.4 -> 71
    "ecommerce_purchase_missing_params.html": ({"tracking_implementation": 100, "event_data_quality": 0,
                                                "privacy_exposure": 100}, 71),
    "ecommerce_purchase_valid.html": ({"event_data_quality": 100}, 100),
    # PII: privacy checks third-party FAIL, datalayer FAIL, storage FAIL -> 0/3 = 0
    # tracking: fires ga4 ok, fires meta ok, meta dup ok, ua ok, placeholder ok, ga4 collects ok -> 6/6
    # (page_view not observed: login event only) overall = (30 + 0)/0.5 = 60
    "pii_runtime_value.html": ({"tracking_implementation": 100, "privacy_exposure": 0}, 60),
    # duplicate GTM + duplicate page_view: tracking checks: fires ga4 ok, gtm_single FAIL, pv FAIL, ua ok,
    # placeholder ok, ga4 collects ok -> 4/6 = 67. overall = (0.3*67 + 0.2*100)/0.5 = 80.2 -> 80
    "duplicate_gtm.html": ({"tracking_implementation": 67, "privacy_exposure": 100}, 80),
}

CONSENT_EXPECTED = {
    # well-behaved Cookiebot: before-interaction ok, reject requests ok, reject cookies ok (3/3)
    "cookiebot.html": {"consent_integrity": 100},
    # misbehaving OneTrust: before FAIL, reject requests FAIL, reject cookies FAIL, gcs after reject FAIL -> 0/4
    "onetrust.html": {"consent_integrity": 0},
}


def test_scoring_version_pinned():
    assert SCORING_VERSION == "2026.10.1"


@pytest.mark.parametrize("name", list(EXPECTED))
def test_score_regression(name, scanned):
    axes, overall = EXPECTED[name]
    r = scanned(name, False)
    got = r["scores"]["axes"]
    for k, v in axes.items():
        assert got[k]["score"] == v, f"{name}:{k} expected {v} got {got[k]['score']} ({got[k]})"
        if v is None:
            assert got[k]["null_reason"]
    assert r["scores"]["overall"]["score"] == overall, r["scores"]["overall"]


@pytest.mark.parametrize("name", list(CONSENT_EXPECTED))
def test_consent_score_regression(name, scanned):
    r = scanned(name, True)
    for k, v in CONSENT_EXPECTED[name].items():
        assert r["scores"]["axes"][k]["score"] == v, r["scores"]["axes"][k]


def test_unmeasurable_axes_never_penalize(scanned):
    r = scanned("clean_no_tracking.html", False)
    for k, a in r["scores"]["axes"].items():
        if a["applicable"] == 0:
            assert a["score"] is None and a["confidence"] is None
