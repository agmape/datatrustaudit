from audit_engine.models import TagFinding
from audit_engine.privacy_analyzer import analyze_privacy, detect_jurisdiction


def _tag(**overrides):
    data = dict(
        id="meta_pixel",
        name="Meta Pixel (Facebook)",
        vendor="Meta",
        type="advertising",
        confidence="high",
        detection_method="network_request",
        data_collected=["Purchase behaviour"],
        privacy_risk="high",
    )
    data.update(overrides)
    return TagFinding(**data)


def test_lgpd_jurisdiction_is_heuristic_not_consent_rule():
    j = detect_jurisdiction("", "https://example.com.br")
    assert j["law"] == "LGPD"
    assert j["require_consent_first"] is None


def test_generic_us_domain_is_not_automatically_ccpa():
    j = detect_jurisdiction("", "https://example.us")
    assert j["law"] == "General Privacy"


def test_privacy_analysis_does_not_estimate_money():
    tag = _tag()
    result = analyze_privacy([tag], False, [tag], {
        "region": "Brazil",
        "law": "LGPD",
        "law_full": "LGPD",
        "require_consent_first": None,
    })
    text = result.estimated_risk_exposure.lower()
    assert "cannot be estimated" in text
    assert "r$" not in text
    assert "$" not in text


def test_privacy_finding_is_worded_as_technical_indicator():
    tag = _tag()
    result = analyze_privacy([tag], False, [tag], {
        "region": "Brazil",
        "law": "LGPD",
        "law_full": "LGPD",
        "require_consent_first": None,
    })
    assert result.violations
    assert all("technical risk indicator" in f.violation.lower() for f in result.violations)
