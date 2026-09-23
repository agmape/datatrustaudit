"""
audit_engine.consent_auditor — CMP detection, Consent Mode v2, and consent integrity analysis.

Checks:
- CMP presence (Cookiebot, OneTrust, Didomi, Usercentrics, LGPD banners, generic)
- Consent Mode v2 signal configuration
- Default denied status per signal
- Reject-all option presence
- Privacy and cookie policy links
- Tags firing before consent (based on source position)
"""
import re
from typing import Dict, List, Optional, Any
from .models import (
    ConsentAuditResult, ConsentFinding,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW,
)

# ─────────────────────────────────────────────
# CMP vendor signatures
# ─────────────────────────────────────────────

CMP_SIGNATURES = [
    {
        "name": "Cookiebot",
        "url_patterns": [r"consent\.cookiebot\.com", r"cookiebot\.com"],
        "source_patterns": [r"CookieConsent", r"Cookiebot"],
    },
    {
        "name": "OneTrust",
        "url_patterns": [r"cdn\.cookielaw\.org", r"optanon\.net"],
        "source_patterns": [r"OptanonWrapper", r"OneTrust"],
    },
    {
        "name": "Didomi",
        "url_patterns": [r"sdk\.privacy-center\.org"],
        "source_patterns": [r"Didomi\.ready", r"didomiConfig"],
    },
    {
        "name": "Usercentrics",
        "url_patterns": [r"app\.usercentrics\.eu"],
        "source_patterns": [r"UC_UI", r"usercentrics"],
    },
    {
        "name": "Quantcast Choice",
        "url_patterns": [r"quantcast\.mgr\.consensu\.org"],
        "source_patterns": [r"__cmp\s*\(", r"quantcast"],
    },
    {
        "name": "TrustArc",
        "url_patterns": [r"consent\.truste\.com"],
        "source_patterns": [r"truste", r"TrustArc"],
    },
    {
        "name": "LGPD Banner (Generic)",
        "url_patterns": [],
        "source_patterns": [
            r"lgpd[\s\-_]?(banner|consent|aviso|politica)",
            r"politica[\s\-_]?de[\s\-_]?privacidade.*aceitar",
            r"cookie[\s\-_]?consent.*pt[\-_]?br",
            r"BannerLGPD",
        ],
    },
    {
        "name": "Cookie Banner (Generic)",
        "url_patterns": [],
        "source_patterns": [
            r"cookie[\s\-_]?banner",
            r"cookie[\s\-_]?consent",
            r"cookie[\s\-_]?notice",
            r"""cookie[\s\S]{0,100}?accept[\s\S]{0,50}?button""",
        ],
    },
]

# Consent Mode v2 signal
_CM_DEFAULT_RE = re.compile(
    r"gtag\s*\(\s*['\"]consent['\"]\s*,\s*['\"]default['\"]\s*,\s*(\{[\s\S]{0,600}?\})",
    re.IGNORECASE,
)

_CM_SIGNALS = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]

# Reject-all patterns (text-based heuristic in HTML)
_REJECT_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"reject[\s\-_]?all",
        r"rejeitar[\s\s\-_]?todos",
        r"recusar[\s\-_]?todos",
        r"negar[\s\-_]?todos",
        r"decline[\s\-_]?all",
        r"refuse[\s\-_]?all",
        r"opt[\s\-_]?out[\s\s\-_]?all",
    ]
]

# Privacy/cookie policy links
_PRIVACY_POLICY_RE = re.compile(
    r"""(privacy[\s\-_]?policy|política[\s\-_]?de[\s\-_]?privacidade|datenschutz|informativa[\s\-_]?privacy)""",
    re.IGNORECASE,
)
_COOKIE_POLICY_RE = re.compile(
    r"""(cookie[\s\-_]?policy|política[\s\-_]?de[\s\-_]?cookies|cookie[\s\-_]?notice)""",
    re.IGNORECASE,
)


def _detect_cmp(html: str) -> Optional[str]:
    """Return the name of the first detected CMP, or None."""
    for sig in CMP_SIGNATURES:
        for pat in sig.get("url_patterns", []):
            if re.search(pat, html, re.IGNORECASE):
                return sig["name"]
        for pat in sig.get("source_patterns", []):
            if re.search(pat, html, re.IGNORECASE):
                return sig["name"]
    return None


def _detect_consent_mode(html: str) -> Dict:
    m = _CM_DEFAULT_RE.search(html)
    if not m:
        return {"detected": False}

    config_str = m.group(1)
    signals: Dict[str, str] = {}
    has_denied = False

    for signal in _CM_SIGNALS:
        denied_re = re.compile(rf"""['""]?{signal}['""\s]*:\s*['""]denied['""]""", re.IGNORECASE)
        granted_re = re.compile(rf"""['""]?{signal}['""\s]*:\s*['""]granted['""]""", re.IGNORECASE)
        if denied_re.search(config_str):
            signals[signal] = "denied"
            has_denied = True
        elif granted_re.search(config_str):
            signals[signal] = "granted"

    # Determine version
    v2_signals = {"ad_user_data", "ad_personalization"}
    version = "v2" if v2_signals.issubset(set(signals.keys())) else ("v1" if signals else None)

    return {
        "detected": True,
        "version": version,
        "signals": signals,
        "has_default_denied": has_denied,
        "snippet": config_str[:200],
    }


def audit_consent(html: str, tags_before_consent_names: Optional[List[str]] = None, scan: Optional[Any] = None) -> ConsentAuditResult:
    result = ConsentAuditResult()
    result.tags_before_consent = tags_before_consent_names or []

    # ── CMP detection ─────────────────────────────────────────────────────────
    cmp_name = _detect_cmp(html)
    result.cmp_detected = cmp_name is not None
    result.cmp_name = cmp_name

    # Runtime browser globals can reveal dynamically loaded CMPs that are absent
    # from the initial HTML. These are observable technical signals only.
    runtime_signals = getattr(scan, "consent_signals", {}) if scan is not None else {}
    if isinstance(runtime_signals, dict) and not result.cmp_detected:
        if runtime_signals.get("cookiebotStatus") is not None:
            result.cmp_detected = True
            result.cmp_name = "Cookiebot (runtime signal)"
        elif runtime_signals.get("oneTrustLoaded"):
            result.cmp_detected = True
            result.cmp_name = "OneTrust (runtime signal)"
        elif runtime_signals.get("didomiLoaded"):
            result.cmp_detected = True
            result.cmp_name = "Didomi (runtime signal)"
        elif runtime_signals.get("hasTcf") or runtime_signals.get("hasCmp"):
            result.cmp_detected = True
            result.cmp_name = "Consent API detected at runtime"

    result.findings.append(ConsentFinding(
        check="cmp_present" if result.cmp_detected else "cmp_missing",
        label="Consent Management Platform (CMP)",
        status="ok" if result.cmp_detected else "warning",
        description=(
            f"{result.cmp_name} detected — a consent management mechanism is observable."
            if result.cmp_detected else
            "No known CMP was observed in HTML or runtime signals. This is a technical "
            "observation, not proof of legal non-compliance; lawful basis and any custom "
            "consent mechanism require manual verification."
        ),
        evidence=result.cmp_name,
        confidence=CONFIDENCE_HIGH if result.cmp_detected else CONFIDENCE_HIGH,
    ))

    # ── Consent Mode v2 ───────────────────────────────────────────────────────
    cm = _detect_consent_mode(html)
    result.consent_mode_v2 = cm.get("version") == "v2"
    result.consent_mode_version = cm.get("version")
    result.has_default_denied = cm.get("has_default_denied", False)
    result.consent_signals = cm.get("signals", {})

    if cm.get("detected"):
        # Check all 4 signals present
        present_signals = set(cm.get("signals", {}).keys())
        missing_signals = set(_CM_SIGNALS) - present_signals

        if result.consent_mode_v2 and result.has_default_denied:
            result.findings.append(ConsentFinding(
                check="consent_mode_v2_ok",
                label="Google Consent Mode v2",
                status="ok",
                description=f"Consent Mode v2 is configured with all 4 signals set to 'denied' by default. "
                            f"Signals: {result.consent_signals}.",
                confidence=CONFIDENCE_HIGH,
            ))
        else:
            status = "warning"
            issues = []
            if not result.consent_mode_v2:
                issues.append(
                    f"Consent Mode detected but only v1 signals found. "
                    f"Google requires v2 (ad_user_data + ad_personalization) since March 2024."
                )
                status = "critical"
            if not result.has_default_denied:
                issues.append(
                    "Consent Mode is NOT set to 'denied' by default. "
                    "Tracking may fire before user consent is obtained."
                )
                status = "critical"
            if missing_signals:
                issues.append(f"Missing Consent Mode v2 signals: {', '.join(sorted(missing_signals))}.")

            result.findings.append(ConsentFinding(
                check="consent_mode_incomplete",
                label="Google Consent Mode v2",
                status=status,
                description=" ".join(issues),
                evidence=cm.get("snippet"),
                confidence=CONFIDENCE_HIGH,
            ))
    else:
        # Check if GA4/Google Ads is present without Consent Mode
        has_ga_product = re.search(
            r"googletagmanager\.com/gtag/js|G-[A-Z0-9]{10}|AW-\d{9}", html, re.IGNORECASE
        )
        if has_ga_product:
            result.findings.append(ConsentFinding(
                check="consent_mode_missing",
                label="Google Consent Mode v2",
                status="critical",
                description="Google Analytics or Google Ads was detected but Google Consent Mode v2 is NOT configured. "
                            "This may trigger Google's EU User Consent Policy enforcement.",
                recommendation="Implement gtag('consent','default',{…}) with all signals = 'denied' before the GA config call.",
                confidence=CONFIDENCE_HIGH,
            ))
        else:
            result.findings.append(ConsentFinding(
                check="consent_mode_not_applicable",
                label="Google Consent Mode v2",
                status="not_detected",
                description="No Google Analytics or Google Ads detected — Consent Mode v2 check is not applicable.",
                confidence=CONFIDENCE_HIGH,
            ))

    # ── Reject-all option ─────────────────────────────────────────────────────
    has_reject = any(p.search(html) for p in _REJECT_PATTERNS)
    if has_reject:
        result.has_reject_all = True
        result.findings.append(ConsentFinding(
            check="reject_all_present",
            label="Reject-All Option",
            status="ok",
            description="A 'reject all' option was detected in the page source. "
                        "Users appear to have a clear way to decline all non-essential tracking.",
            confidence=CONFIDENCE_MEDIUM,
        ))
    elif result.cmp_detected:
        result.has_reject_all = None   # cannot determine from static scan
        result.findings.append(ConsentFinding(
            check="reject_all_unverifiable",
            label="Reject-All Option",
            status="warning",
            description="CMP detected but a 'reject-all' button could not be confirmed from static HTML. "
                        "Dynamic/modal-based banners cannot be verified without browser interaction. "
                        "Ensure a reject-all or equivalent option is always accessible.",
            confidence=CONFIDENCE_LOW,
        ))
    else:
        result.has_reject_all = None
        result.findings.append(ConsentFinding(
            check="reject_all_unverifiable",
            label="Reject-All Option",
            status="not_detected",
            description="No CMP or reject-all control was observable. The scanner cannot determine "
                        "whether a lawful basis, custom consent UI, or another opt-out mechanism exists.",
            confidence=CONFIDENCE_LOW,
        ))

    # ── Privacy & Cookie policy links ─────────────────────────────────────────
    has_privacy = bool(_PRIVACY_POLICY_RE.search(html))
    has_cookie  = bool(_COOKIE_POLICY_RE.search(html))
    result.has_privacy_policy = has_privacy
    result.has_cookie_policy  = has_cookie

    result.findings.append(ConsentFinding(
        check="privacy_policy_present" if has_privacy else "privacy_policy_missing",
        label="Privacy Policy Link",
        status="ok" if has_privacy else "warning",
        description=(
            "A privacy policy link or text was found on the page."
            if has_privacy else
            "No privacy policy link detected. A privacy policy is required by virtually all privacy regulations."
        ),
        recommendation=None if has_privacy else "Add a clearly visible privacy policy link in the page footer.",
        confidence=CONFIDENCE_MEDIUM,
    ))

    result.findings.append(ConsentFinding(
        check="cookie_policy_present" if has_cookie else "cookie_policy_missing",
        label="Cookie Policy Link",
        status="ok" if has_cookie else "warning",
        description=(
            "A cookie policy link or text was found on the page."
            if has_cookie else
            "No cookie policy link detected. A cookie policy is recommended under GDPR and similar laws."
        ),
        recommendation=None if has_cookie else "Add a link to your cookie policy at the page footer.",
        confidence=CONFIDENCE_MEDIUM,
    ))

    # ── Tags before consent ────────────────────────────────────────────────────
    if result.tags_before_consent:
        result.findings.append(ConsentFinding(
            check="tags_before_consent",
            label="Tracking Before Consent",
            status="warning",
            description=f"{len(result.tags_before_consent)} tracking tag(s) appear to load before an observable consent signal: "
                        f"{', '.join(result.tags_before_consent[:5])}" +
                        (f" (+{len(result.tags_before_consent)-5} more)" if len(result.tags_before_consent) > 5 else ""),
            confidence=CONFIDENCE_MEDIUM,
        ))
    elif result.cmp_detected:
        result.findings.append(ConsentFinding(
            check="consent_before_tracking",
            label="Consent-First Order",
            status="ok",
            description="CMP was detected. Tracking tags do not appear to load before the consent signal in the HTML source.",
            confidence=CONFIDENCE_MEDIUM,
        ))

    return result
