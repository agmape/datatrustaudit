"""Jurisdiction-aware technical privacy risk analysis.

This module intentionally separates observable technical evidence from legal
conclusions. It never estimates monetary penalties and never treats an
external scan as proof of legal non-compliance.
"""
import re
from typing import List
from urllib.parse import urlparse

from .models import (
    PrivacyAnalysisResult,
    PrivacyViolation,
    TagFinding,
    CONFIDENCE_HIGH,
    CONFIDENCE_MEDIUM,
)


def detect_jurisdiction(html: str, url: str) -> dict:
    """Infer a likely privacy framework from public signals.

    This is a routing heuristic, not a determination that a law applies.
    """
    parsed = urlparse(url)
    domain = (parsed.hostname or "").lower()
    tld = domain.split(".")[-1] if domain else ""

    if tld == "br":
        return {
            "region": "Brazil",
            "law": "LGPD",
            "law_full": "Lei Geral de Proteção de Dados (LGPD) — Brazil",
            "confidence": "medium",
            "require_consent_first": None,
        }

    if domain.endswith(".uk"):
        return {
            "region": "United Kingdom",
            "law": "UK GDPR",
            "law_full": "UK General Data Protection Regulation (UK GDPR)",
            "confidence": "medium",
            "require_consent_first": True,
        }

    if tld in {"eu", "de", "fr", "it", "es", "pt", "nl", "be", "at", "pl", "se", "fi", "dk", "ie", "ch", "no"}:
        return {
            "region": "EU / EEA",
            "law": "GDPR",
            "law_full": "General Data Protection Regulation (GDPR) — EU/EEA",
            "confidence": "medium",
            "require_consent_first": True,
        }

    # A generic .us/.gov/.edu domain is not evidence that CCPA/CPRA applies.
    if domain.endswith(".ca.gov"):
        return {
            "region": "California, United States",
            "law": "CCPA/CPRA",
            "law_full": "California Consumer Privacy Act / CPRA",
            "confidence": "medium",
            "require_consent_first": False,
        }

    pt_signals = [
        r"\bLGPD\b",
        r"pol[ií]tica de privacidade",
        r"lei\s+13\.709",
    ]
    gdpr_signals = [
        r"\bGDPR\b",
        r"\bRGPD\b",
        r"Datenschutz",
        r"Cookie-Einstellungen",
    ]

    if any(re.search(pat, html or "", re.IGNORECASE) for pat in pt_signals):
        return {
            "region": "Brazil",
            "law": "LGPD",
            "law_full": "Lei Geral de Proteção de Dados (LGPD) — Brazil",
            "confidence": "low",
            "require_consent_first": None,
        }

    if any(re.search(pat, html or "", re.IGNORECASE) for pat in gdpr_signals):
        return {
            "region": "EU / EEA",
            "law": "GDPR",
            "law_full": "General Data Protection Regulation (GDPR) — EU/EEA",
            "confidence": "low",
            "require_consent_first": True,
        }

    return {
        "region": "Global / Unknown",
        "law": "General Privacy",
        "law_full": "General Privacy Risk Assessment (jurisdiction not determinable)",
        "confidence": "low",
        "require_consent_first": None,
    }


def _legal_context(law: str) -> str:
    if law == "LGPD":
        return "LGPD Arts. 6º e 7º — contexto de princípios/base legal; exige verificação jurídica"
    if law in {"GDPR", "UK GDPR"}:
        return f"{law} — lawful basis/cookie consent context; applicability requires legal review"
    if law == "CCPA/CPRA":
        return "CCPA/CPRA — consumer privacy context; applicability requires legal review"
    return "Privacy-law applicability requires manual legal verification"


def analyze_privacy(
    tags: List[TagFinding],
    has_consent_tool: bool,
    tags_before_consent: List[TagFinding],
    jurisdiction: dict,
) -> PrivacyAnalysisResult:
    """Build technical privacy risk indicators from observable evidence.

    The API field named violations is retained for backwards compatibility,
    but each item is a technical risk indicator, not a legal conclusion.
    """
    law = jurisdiction.get("law", "General Privacy")
    region = jurisdiction.get("region", "Global / Unknown")
    law_full = jurisdiction.get("law_full", "General Privacy")
    require_consent_first = jurisdiction.get("require_consent_first")

    findings: List[PrivacyViolation] = []
    consent_risks: List[str] = []
    disclosure_gaps: List[str] = []
    deductions = []

    relevant_trackers = [
        t for t in tags
        if t.type in {"analytics", "advertising", "heatmap", "marketing", "ab_testing"}
    ]

    if relevant_trackers and not has_consent_tool:
        findings.append(PrivacyViolation(
            tag="Site",
            violation=(
                "Technical risk indicator: tracking technologies were observed, "
                "but no known CMP was detected during this scan."
            ),
            article=_legal_context(law),
            description=(
                "Absence of a detected CMP is not proof of non-compliance. "
                "The organization may rely on another lawful basis or a consent "
                "mechanism that was not observable to this scanner."
            ),
            severity="medium",
            confidence=CONFIDENCE_MEDIUM,
        ))
        disclosure_gaps.append("No known CMP observed; legal basis/consent mechanism requires manual verification")
        deductions.append({
            "reason": "Trackers observed with no known CMP visible to the scan",
            "points": -10,
            "confidence": "medium",
            "evidence_type": "technical_observation",
        })

    seen_names = set()
    for tag in tags_before_consent:
        if tag.type not in {"analytics", "advertising", "heatmap", "marketing", "ab_testing"}:
            continue
        if tag.name in seen_names:
            continue
        seen_names.add(tag.name)

        evidence_type = "network" if tag.detection_method == "network_request" else "html_order_heuristic"
        confidence = CONFIDENCE_HIGH if evidence_type == "network" else CONFIDENCE_MEDIUM
        legal_note = (
            "For this inferred jurisdiction, non-essential tracking commonly requires "
            "consent before activation."
            if require_consent_first is True
            else
            "The applicable legal basis cannot be determined from an external scan."
        )

        findings.append(PrivacyViolation(
            tag=tag.name,
            violation=(
                "Technical risk indicator: the tracker appears to activate before "
                "an observable consent signal."
            ),
            article=_legal_context(law),
            description=f"{legal_note} Evidence type: {evidence_type}.",
            severity="high" if evidence_type == "network" else "medium",
            confidence=confidence,
            data_collected=tag.data_collected,
            tag_id=tag.tag_id,
        ))
        consent_risks.append(f"{tag.name}: observed/indicated before consent signal")
        deductions.append({
            "reason": f"{tag.name} appears before an observable consent signal",
            "points": -12 if evidence_type == "network" else -7,
            "confidence": confidence,
            "evidence_type": evidence_type,
        })

    # Deprecated UA is a technical maintenance/data-quality issue, not by itself
    # proof of a privacy-law violation.
    if any(t.id == "ua" for t in tags):
        disclosure_gaps.append(
            "Universal Analytics legacy code detected; this is a technical maintenance risk, "
            "not an automatic legal violation."
        )

    total_deduction = min(70, sum(abs(int(d["points"])) for d in deductions))
    technical_score = max(0, 100 - total_deduction)

    return PrivacyAnalysisResult(
        jurisdiction=region,
        law=law,
        law_full=law_full,
        violations=findings,
        total_violations=len(findings),
        has_consent_tool=has_consent_tool,
        has_universal_analytics=any(t.id == "ua" for t in tags),
        consent_risks=list(dict.fromkeys(consent_risks)),
        disclosure_gaps=list(dict.fromkeys(disclosure_gaps)),
        estimated_risk_exposure=(
            "Monetary penalties cannot be estimated from an external technical scan. "
            "Any sanction depends on facts not observable here, including legal basis, "
            "processing context, remediation, regulator assessment and, where relevant, turnover."
        ),
        compliance_score=technical_score,
        confidence_level=(
            "Technical privacy-risk assessment based on publicly observable evidence only. "
            "This score is a prioritization heuristic, not a legal compliance certification."
        ),
        score_basis="Technical privacy-risk heuristic; not a legal compliance percentage.",
        score_deductions=deductions,
    )
