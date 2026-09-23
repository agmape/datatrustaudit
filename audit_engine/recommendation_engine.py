"""
audit_engine.recommendation_engine — Specific, actionable, non-generic recommendations.

Each recommendation includes a confidence level.
Context-specific evidence is injected into the detail.
"""
from typing import List, Optional
from .models import (
    Recommendation, TagFinding, GTMQualityResult, EventAuditResult,
    ConsentAuditResult, PrivacyAnalysisResult, DuplicateFinding, DataLayerFinding,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM,
    VALIDITY_PARTIAL, VALIDITY_MALFORMED, VALIDITY_NO_PARAMS,
)


def generate_recommendations(
    tags: List[TagFinding],
    gtm: Optional[GTMQualityResult],
    events: Optional[EventAuditResult],
    datalayer: List[DataLayerFinding],
    consent: Optional[ConsentAuditResult],
    privacy: Optional[PrivacyAnalysisResult],
    duplicates: List[DuplicateFinding],
    jurisdiction: dict,
) -> List[Recommendation]:

    recs: List[Recommendation] = []
    law = jurisdiction.get("law", "applicable privacy law")

    has_gtm  = any(t.id == "gtm" for t in tags)
    has_ga4  = any(t.id == "ga4" for t in tags)
    has_ua   = any(t.id == "ua" for t in tags)
    has_meta = any(t.id == "meta_pixel" for t in tags)

    # ── Consent / CMP ─────────────────────────────────────────────────────────
    if consent:
        if not consent.cmp_detected:
            tracking_tags = [t.name for t in tags if t.type in ("analytics", "advertising", "heatmap")]
            detail = (
                f"No consent management platform was found on this page. "
                f"Tracking scripts detected: {', '.join(tracking_tags[:4]) or 'none'}. "
                f"Under {law}, user consent must be obtained before these scripts can collect data."
            )
            recs.append(Recommendation(
                severity="critical",
                category="consent",
                title="No CMP detected — tracking scripts may fire without user consent",
                detail=detail,
                fix="Implement a CMP (e.g., Cookiebot, OneTrust, Didomi) as the very first element in <head>. "
                    "Configure it to block all non-essential scripts until consent is granted.",
                confidence=CONFIDENCE_HIGH,
            ))

        if not consent.consent_mode_v2 and has_ga4:
            missing_signals = set(["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"])
            missing_signals -= set(consent.consent_signals.keys())
            recs.append(Recommendation(
                severity="critical" if not consent.consent_mode_version else "high",
                category="consent_mode",
                title=f"GA4 detected without Google Consent Mode v2 {'(CMv2 not configured)' if not consent.consent_mode_version else '(CMv2 partially configured)'}",
                detail=(
                    f"Google Analytics 4 was found but Consent Mode v2 is {'not configured' if not consent.consent_mode_version else 'incomplete'}. "
                    f"{'Missing signals: ' + ', '.join(sorted(missing_signals)) + '. ' if missing_signals else ''}"
                    "Google has required CMv2 compliance for EU users since March 2024. "
                    "Without it, your Google Ads conversion measurement will be significantly impaired."
                ),
                fix="Add gtag('consent','default',{ad_storage:'denied', analytics_storage:'denied', "
                    "ad_user_data:'denied', ad_personalization:'denied'}) before the GA4 config call. "
                    "Ensure your CMP calls gtag('consent','update',{...}) when the user consents.",
                confidence=CONFIDENCE_HIGH,
            ))

        if consent.cmp_detected and not consent.has_default_denied:
            recs.append(Recommendation(
                severity="high",
                category="consent_mode",
                title="Consent Mode detected but signals not set to 'denied' by default",
                detail="Google Consent Mode is configured but the default state allows data collection "
                       "before user consent. The gtag consent default block does not have all signals set to 'denied'.",
                fix="Update your Consent Mode default: set all four signals "
                    "(ad_storage, analytics_storage, ad_user_data, ad_personalization) to 'denied'. "
                    "Only update to 'granted' in the CMP callback after user consents.",
                confidence=CONFIDENCE_HIGH,
            ))

        if consent.has_reject_all is False and consent.cmp_detected:
            recs.append(Recommendation(
                severity="medium",
                category="consent",
                title="Reject-all option not clearly detectable in CMP",
                detail="A CMP was found but no 'reject all' button text was confirmed from static HTML. "
                       "Under GDPR and LGPD, users must be able to decline cookies as easily as they can accept them. "
                       "A pre-ticked 'Accept All' without a visible 'Reject All' creates regulatory exposure.",
                fix="Ensure your CMP presents a 'Reject All' or equivalent button at the same prominence level "
                    "as the 'Accept All' button on the initial banner.",
                confidence=CONFIDENCE_MEDIUM,
            ))

    # ── Meta Pixel before consent ─────────────────────────────────────────────
    if has_meta and consent and not consent.cmp_detected:
        recs.append(Recommendation(
            severity="critical",
            category="tracking_before_consent",
            title="Meta Pixel detected with no consent mechanism",
            detail=f"Meta Pixel (Facebook) was detected loading without any CMP or consent gate. "
                   f"Meta Pixel transmits browser fingerprint, IP address, and page URL to Meta on every load. "
                   f"Under {law}, this constitutes data transfer without legal basis.",
            fix="Load Meta Pixel via GTM with a custom trigger that fires only when the user has accepted "
                "marketing/analytics cookies. Alternatively, use Meta's pixel consent mode settings.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── Universal Analytics ────────────────────────────────────────────────────
    if has_ua:
        recs.append(Recommendation(
            severity="critical",
            category="obsolete_technology",
            title="Universal Analytics detected — discontinued since July 2023",
            detail="Universal Analytics stopped processing new data in July 2023. "
                   "Any UA code still on your site is collecting data into an unmaintained system "
                   "and potentially using outdated security practices.",
            fix="Remove all UA code (analytics.js, ga('create', 'UA-...')) immediately. "
                "Migrate all tracking to Google Analytics 4 (GA4).",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── GTM improvements ──────────────────────────────────────────────────────
    if gtm:
        for f in gtm.findings:
            if f.status == "critical" and f.recommendation:
                recs.append(Recommendation(
                    severity="high",
                    category="gtm_quality",
                    title=f"GTM Issue: {f.label}",
                    detail=f.description,
                    fix=f.recommendation,
                    confidence=f.confidence,
                ))

    if not has_gtm and (has_ga4 or has_meta):
        recs.append(Recommendation(
            severity="medium",
            category="implementation",
            title="Tracking scripts loaded without a tag manager",
            detail="GA4 or Meta Pixel were detected hardcoded in the page without Google Tag Manager. "
                   "Without a tag manager, consent orchestration, trigger management, and compliance updates "
                   "require direct developer involvement on every change.",
            fix="Implement Google Tag Manager. Migrate all tracking scripts into GTM and configure "
                "consent triggers so scripts only fire after user consent.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── Event quality ─────────────────────────────────────────────────────────
    if events:
        partial_events = [ev for ev in events.events if ev.validity == VALIDITY_PARTIAL]
        malformed_events = [ev for ev in events.events if ev.validity == VALIDITY_MALFORMED]

        for ev in partial_events[:3]:    # cap to avoid report flooding
            recs.append(Recommendation(
                severity="high",
                category="event_quality",
                title=f"Event '{ev.name}' is missing required parameters",
                detail=f"The '{ev.name}' event was detected but is missing required GA4 parameters: "
                       f"{', '.join(ev.missing_required_params)}. "
                       "Incomplete event payloads reduce data quality and may cause GA4 reporting gaps, "
                       f"especially {'for purchase events, which will under-report revenue' if ev.name == 'purchase' else ''}.",
                fix=f"Ensure all '{ev.name}' dataLayer.push() calls include: "
                    f"{', '.join(ev.missing_required_params)}.",
                confidence=ev.confidence,
            ))

        for ev in malformed_events[:2]:
            recs.append(Recommendation(
                severity="high",
                category="event_quality",
                title=f"Event '{ev.name}' appears malformed",
                detail=f"The '{ev.name}' event payload could not be fully parsed, "
                        "suggesting a syntax error in the dataLayer.push() object. "
                        "Malformed events are silently dropped by GA4.",
                fix=f"Inspect the dataLayer.push() for '{ev.name}' on line {ev.line_number or 'unknown'}. "
                    "Validate that all object keys are quoted and values are correct types.",
                confidence=CONFIDENCE_MEDIUM,
            ))

    # ── DataLayer PII ─────────────────────────────────────────────────────────
    pii_findings = [f for f in datalayer if f.type == "pii_exposure"]
    for f in pii_findings[:2]:
        recs.append(Recommendation(
            severity="critical",
            category="pii_exposure",
            title=f"PII detected in dataLayer: {', '.join(f.keys)}",
            detail=f"Personal identifiable information key(s) '{', '.join(f.keys)}' was found in a dataLayer.push(). "
                   "All scripts loaded on the page (including third-party ad networks and analytics) can read dataLayer. "
                   "This may constitute an unlawful data transfer under " + law + ".",
            fix="Remove PII from dataLayer pushes. Use hashed or anonymised identifiers only. "
                "If user identification is needed, use GA4's user_id property with a hashed internal ID, "
                "never with email, CPF, phone, or name in clear text.",
            confidence=f.confidence,
        ))

    # ── Duplicates ────────────────────────────────────────────────────────────
    for dup in duplicates[:4]:
        if dup.entity_type in ("tag", "pixel"):
            recs.append(Recommendation(
                severity=dup.severity,
                category="duplication",
                title=f"Duplicate detected: {dup.name} ({dup.occurrence_count}×)",
                detail=dup.recommendation,
                fix=f"Review your page source and GTM container to consolidate {dup.name} "
                    f"to a single implementation.",
                confidence=dup.confidence,
            ))

    # Sort: critical → high → medium → low
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    recs.sort(key=lambda r: severity_order.get(r.severity, 4))

    return recs
