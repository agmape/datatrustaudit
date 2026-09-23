"""
audit_engine.score_engine — 6-axis scoring model.

Axes (all 0-100):
1. Tracking Quality   — GTM usage, UA legacy, tag impl quality
2. Event Architecture — Events detected, parameter completeness, malformed payloads
3. DataLayer Quality  — PII exposure, eCommerce structure, init order
4. Consent Integrity  — CMP, Consent Mode v2, reject-all, all signals
5. Privacy Risk       — Violations count by severity (0=safe, 100=high risk)
6. Overall Audit      — Weighted average of axes 1, 2, 3, 4 and inverse of 5
"""
from typing import List, Optional
from .models import (
    AuditScores, TagFinding, GTMQualityResult, EventAuditResult,
    DataLayerFinding, ConsentAuditResult, PrivacyAnalysisResult, DuplicateFinding,
    VALIDITY_VALID, VALIDITY_PARTIAL, VALIDITY_MALFORMED, VALIDITY_NO_PARAMS,
)


def _clamp(val: int) -> int:
    return max(0, min(100, val))


def compute_tracking_quality(
    tags: List[TagFinding],
    gtm: Optional[GTMQualityResult],
    duplicates: List[DuplicateFinding],
) -> int:
    score = 100

    has_gtm = any(t.id == "gtm" for t in tags)
    has_ua  = any(t.id == "ua" for t in tags)
    has_ga4 = any(t.id == "ga4" for t in tags)

    if not has_gtm:
        score -= 25   # No tag manager
    if has_ua:
        score -= 30   # Deprecated technology
    if not has_ga4 and not has_gtm:
        score -= 15   # No modern analytics

    if gtm:
        for f in gtm.findings:
            if f.status == "critical":
                score -= 15
            elif f.status == "warning":
                score -= 7

    # Tag duplicates penalty
    tag_dups = [d for d in duplicates if d.entity_type == "tag"]
    score -= len(tag_dups) * 10

    return _clamp(score)


def compute_event_architecture(result: Optional[EventAuditResult]) -> int:
    if not result or result.total_events == 0:
        return 50   # Neutral: no events detected is normal for many pages

    score = 100

    for ev in result.events:
        if ev.validity == VALIDITY_MALFORMED:
            score -= 20
        elif ev.validity == VALIDITY_PARTIAL:
            score -= 10
        elif ev.validity == VALIDITY_NO_PARAMS and ev.name not in ("page_view", "scroll"):
            score -= 5

    # Duplicate events penalty
    duplicate_count = result.duplicated_event_names
    score -= duplicate_count * 12

    # Bonus: structured eCommerce events detected
    ecom_bonus = min(10, len(result.ecommerce_events_detected) * 3)
    score += ecom_bonus

    return _clamp(score)


def compute_datalayer_quality(findings: List[DataLayerFinding]) -> int:
    if not findings:
        return 100

    score = 100
    for f in findings:
        if f.severity == "critical":
            score -= 30
        elif f.severity == "high":
            score -= 20
        elif f.severity == "medium":
            score -= 10
        else:
            score -= 5

    return _clamp(score)


def compute_consent_integrity(consent: Optional[ConsentAuditResult]) -> int:
    if not consent:
        return 0

    score = 0

    if consent.cmp_detected:
        score += 35
    if consent.consent_mode_v2:
        score += 25
    elif consent.consent_mode_version:
        score += 10
    if consent.has_default_denied:
        score += 15
    if consent.has_reject_all is True:
        score += 10
    if consent.has_privacy_policy:
        score += 10
    if consent.has_cookie_policy:
        score += 5

    # Penalty for tags firing before consent
    score -= len(consent.tags_before_consent) * 8

    return _clamp(score)


def compute_privacy_risk(privacy: Optional[PrivacyAnalysisResult]) -> int:
    """Higher score = higher risk (bad). Displayed inverted in UI."""
    if not privacy:
        return 0

    risk = 0
    for v in privacy.violations:
        if v.severity == "critical":
            risk += 30
        elif v.severity == "high":
            risk += 20
        elif v.severity == "medium":
            risk += 10
        else:
            risk += 5

    if not privacy.has_consent_tool:
        risk += 20

    return _clamp(risk)


def compute_scores(
    tags: List[TagFinding],
    gtm: Optional[GTMQualityResult],
    events: Optional[EventAuditResult],
    datalayer: List[DataLayerFinding],
    consent: Optional[ConsentAuditResult],
    privacy: Optional[PrivacyAnalysisResult],
    duplicates: List[DuplicateFinding],
) -> AuditScores:

    tracking   = compute_tracking_quality(tags, gtm, duplicates)
    event_arch = compute_event_architecture(events)
    dl_quality = compute_datalayer_quality(datalayer)
    consent_s  = compute_consent_integrity(consent)
    priv_risk  = compute_privacy_risk(privacy)

    # Overall: weighted average of positive-sentiment axes, penalized by privacy risk
    overall = _clamp(
        int(
            tracking   * 0.25 +
            event_arch * 0.20 +
            dl_quality * 0.15 +
            consent_s  * 0.30 +
            (100 - priv_risk) * 0.10
        )
    )

    return AuditScores(
        overall=overall,
        tracking_quality=tracking,
        event_architecture=event_arch,
        datalayer_quality=dl_quality,
        consent_integrity=consent_s,
        privacy_risk=priv_risk,
        explanation={
            "model": "weighted_technical_audit_score_v2",
            "note": (
                "Heuristic technical prioritization score; not a legal compliance percentage. "
                "Each axis is computed from observable findings and fixed documented weights."
            ),
            "weights": {
                "trackingQuality": 0.25,
                "eventArchitecture": 0.20,
                "datalayerQuality": 0.15,
                "consentIntegrity": 0.30,
                "inversePrivacyRisk": 0.10,
            },
            "axisValues": {
                "trackingQuality": tracking,
                "eventArchitecture": event_arch,
                "datalayerQuality": dl_quality,
                "consentIntegrity": consent_s,
                "privacyRisk": priv_risk,
            },
        },
    )
