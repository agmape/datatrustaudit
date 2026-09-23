"""
audit_engine.privacy_analyzer — Jurisdiction-aware privacy compliance analysis.

Applies the correct regulatory framework based on detected site jurisdiction.
Does NOT call everything LGPD. Uses jurisdiction-specific wording.

IMPORTANT: All wording is indicative only — not legal advice.
"""
import re
from typing import List
from .models import (
    PrivacyAnalysisResult, PrivacyViolation, TagFinding,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM,
)
from urllib.parse import urlparse


# ─────────────────────────────────────────────
# Jurisdiction detection
# ─────────────────────────────────────────────

def detect_jurisdiction(html: str, url: str) -> dict:
    """
    Detect the most likely applicable privacy jurisdiction.
    Returns a dict with: region, law, law_full, consent_required, require_consent_first
    """
    parsed = urlparse(url)
    tld = parsed.netloc.split(".")[-1].lower()
    domain = parsed.netloc.lower()

    # TLD-based (high confidence)
    if tld in ("br",) or "com.br" in domain or ".br" in domain:
        return {
            "region": "Brazil",
            "law": "LGPD",
            "law_full": "Lei Geral de Proteção de Dados (LGPD) — Brazil",
            "consent_required": True,
            "require_consent_first": True,
        }
    if tld in ("uk", "co") and ".uk" in domain:
        return {
            "region": "United Kingdom",
            "law": "UK GDPR",
            "law_full": "UK General Data Protection Regulation (UK GDPR)",
            "consent_required": True,
            "require_consent_first": True,
        }
    if tld in ("eu", "de", "fr", "it", "es", "pt", "nl", "be", "at", "pl", "se", "fi", "dk", "ie", "ch", "no"):
        return {
            "region": "EU / EEA",
            "law": "GDPR",
            "law_full": "General Data Protection Regulation (GDPR) — EU/EEA",
            "consent_required": True,
            "require_consent_first": True,
        }
    if tld in ("us", "gov", "edu") or ".ca.gov" in domain:
        return {
            "region": "United States / California",
            "law": "CCPA/CPRA",
            "law_full": "California Consumer Privacy Act / CPRA (US State Privacy Laws)",
            "consent_required": False,    # CCPA is opt-out by default
            "require_consent_first": False,
        }

    # Content-based heuristics (medium confidence)
    pt_signals = [r"\bLGPD\b", r"política de privacidade", r"aceitar cookies.*pt", r"consentimento\b"]
    gdpr_signals = [r"\bGDPR\b", r"\bRGPD\b", r"Datenschutz", r"Cookie-Einstellungen"]

    for pat in pt_signals:
        if re.search(pat, html, re.IGNORECASE):
            return {
                "region": "Brazil",
                "law": "LGPD",
                "law_full": "Lei Geral de Proteção de Dados (LGPD) — Brazil",
                "consent_required": True,
                "require_consent_first": True,
            }
    for pat in gdpr_signals:
        if re.search(pat, html, re.IGNORECASE):
            return {
                "region": "EU / EEA",
                "law": "GDPR",
                "law_full": "General Data Protection Regulation (GDPR) — EU/EEA",
                "consent_required": True,
                "require_consent_first": True,
            }

    # Default: general risk assessment
    return {
        "region": "Global / Unknown",
        "law": "General Privacy",
        "law_full": "General Privacy Risk Assessment (jurisdiction not determinable)",
        "consent_required": None,
        "require_consent_first": None,
    }


# ─────────────────────────────────────────────
# Risk table (jurisdiction-agnostic)
# ─────────────────────────────────────────────

_RISK_TABLE = {
    "no_cmp": {
        "article": "Consent Requirement",
        "description": "Tracking without a consent management mechanism",
        "min_fine": 5_000,
        "max_fine": 50_000,
    },
    "tracking_before_consent": {
        "article": "Consent-First Behaviour",
        "description": "Observable tracking script loading before any consent signal",
        "min_fine": 10_000,
        "max_fine": 50_000,
    },
    "critical_tracker": {
        "article": "High-Risk Tracking",
        "description": "Use of intrusive tracking tools (session recording, fingerprinting)",
        "min_fine": 15_000,
        "max_fine": 50_000,
    },
    "advertising_tracker": {
        "article": "Third-Party Data Sharing",
        "description": "Advertising/remarketing scripts without confirmed consent",
        "min_fine": 10_000,
        "max_fine": 40_000,
    },
    "obsolete_ua": {
        "article": "Data Security Obligation",
        "description": "Use of discontinued tracking technology (Universal Analytics)",
        "min_fine": 5_000,
        "max_fine": 20_000,
    },
}


def analyze_privacy(
    tags: List[TagFinding],
    has_consent_tool: bool,
    tags_before_consent: List[TagFinding],
    jurisdiction: dict,
) -> PrivacyAnalysisResult:

    law  = jurisdiction["law"]
    region = jurisdiction["region"]
    law_full = jurisdiction["law_full"]
    require_consent_first = jurisdiction.get("require_consent_first", True)

    violations: List[PrivacyViolation] = []
    total_min = 0
    total_max = 0
    consent_risks: List[str] = []
    disclosure_gaps: List[str] = []

    has_ua = any(t.id == "ua" for t in tags)

    # ── No CMP ────────────────────────────────────────────────────────────────
    if not has_consent_tool:
        r = _RISK_TABLE["no_cmp"]
        if any(t.type in ("analytics", "advertising", "heatmap") for t in tags):
            violations.append(PrivacyViolation(
                tag="Site",
                violation=f"No consent management platform detected. "
                          f"Under {law}, tracking technologies require explicit user consent before activation.",
                article=r["article"],
                description=r["description"],
                severity="critical",
                confidence=CONFIDENCE_HIGH,
            ))
            disclosure_gaps.append("No CMP found")
            total_min += r["min_fine"]
            total_max += r["max_fine"]

    # ── Tags before consent ────────────────────────────────────────────────────
    for tag in tags_before_consent:
        if tag.type == "consent":
            continue
        if tag.type in ("analytics", "advertising", "heatmap", "marketing") and require_consent_first:
            risk_key = "critical_tracker" if tag.privacy_risk == "critical" else (
                "advertising_tracker" if tag.type == "advertising" else "tracking_before_consent"
            )
            r = _RISK_TABLE.get(risk_key, _RISK_TABLE["tracking_before_consent"])
            violations.append(PrivacyViolation(
                tag=tag.name,
                violation=f"Observed loading before consent signal (line {tag.line_number or 'unknown'}). "
                          f"Observed technical behaviour — potential {law} non-compliance pattern.",
                article=r["article"],
                description=r["description"],
                severity=tag.privacy_risk,
                confidence=CONFIDENCE_MEDIUM,
                data_collected=tag.data_collected,
                tag_id=tag.tag_id,
            ))
            consent_risks.append(f"{tag.name} firing before consent")
            total_min += r["min_fine"]
            total_max += r["max_fine"]

    # ── Universal Analytics ────────────────────────────────────────────────────
    if has_ua:
        r = _RISK_TABLE["obsolete_ua"]
        violations.append(PrivacyViolation(
            tag="Universal Analytics",
            violation="Use of deprecated Universal Analytics (discontinued July 2023). "
                      "Continued use represents a data security and regulatory risk.",
            article=r["article"],
            description=r["description"],
            severity="critical",
            confidence=CONFIDENCE_HIGH,
        ))
        total_min += r["min_fine"]
        total_max += r["max_fine"]

    # ── Critical trackers without consent ─────────────────────────────────────
    critical_no_consent = [
        t for t in tags
        if t.privacy_risk == "critical" and t.type != "consent" and not has_consent_tool
        and t not in tags_before_consent
    ]
    for tag in critical_no_consent[:3]:   # cap at 3 to avoid spam
        r = _RISK_TABLE["critical_tracker"]
        violations.append(PrivacyViolation(
            tag=tag.name,
            violation=f"High-risk tracker detected ({tag.type}) with no consent mechanism. "
                      f"Indicative privacy exposure signal under {law}.",
            article=r["article"],
            description=r["description"],
            severity="critical",
            confidence=CONFIDENCE_MEDIUM,
            data_collected=tag.data_collected,
        ))
        total_min += r["min_fine"]
        total_max += r["max_fine"]

    # ── Score ──────────────────────────────────────────────────────────────────
    compliance_score = max(0, 100 - len(violations) * 12)

    # ── Risk exposure summary ──────────────────────────────────────────────────
    if violations:
        exposure = (
            f"Indicative risk exposure (reference only, not legal advice): "
            f"USD ${total_min // 5:,} – USD ${total_max // 5:,}"
        )
    else:
        exposure = "No significant risk indicators detected on this page"

    return PrivacyAnalysisResult(
        jurisdiction=region,
        law=law,
        law_full=law_full,
        violations=violations,
        total_violations=len(violations),
        has_consent_tool=has_consent_tool,
        has_universal_analytics=has_ua,
        consent_risks=list(set(consent_risks)),
        disclosure_gaps=list(set(disclosure_gaps)),
        estimated_risk_exposure=exposure,
        compliance_score=compliance_score,
        confidence_level=(
            "Indicative assessment based on publicly observable page behaviour. "
            "Does not constitute legal advice. Backend-only and SPA events are not visible to this scan."
        ),
    )
