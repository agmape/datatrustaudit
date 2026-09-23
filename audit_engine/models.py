"""
audit_engine.models — Typed schemas for all audit findings.
These are the canonical data shapes produced by every analyzer.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ─────────────────────────────────────────────
# Confidence / Detection metadata
# ─────────────────────────────────────────────

CONFIDENCE_HIGH   = "high"    # Verified by exact source match
CONFIDENCE_MEDIUM = "medium"  # Inferred by pattern / partial match
CONFIDENCE_LOW    = "low"     # Behavioral heuristic only

DETECT_SOURCE       = "source"         # Found in raw HTML text
DETECT_DOM          = "dom"            # Found via DOM parsing
DETECT_SCRIPT_URL   = "script_url"     # External script src matched
DETECT_INFERRED     = "inferred"       # Cannot confirm from public scan
DETECT_PATTERN      = "script_pattern" # Inline JS code pattern


# ─────────────────────────────────────────────
# Tag Detection
# ─────────────────────────────────────────────

@dataclass
class TagFinding:
    id: str
    name: str
    vendor: str
    type: str                     # analytics | advertising | tag_manager | consent | heatmap | support | marketing | ab_testing
    confidence: str               # high | medium | low
    detection_method: str         # source | script_url | script_pattern | inferred
    occurrence_count: int = 1
    line_number: Optional[int] = None
    source_block: Optional[str] = None   # ±3 lines context, None if not determinable
    matched_pattern: Optional[str] = None
    tag_id: Optional[str] = None         # e.g. GTM-XXXXX, G-XXXXXXXXXX
    data_collected: List[str] = field(default_factory=list)
    privacy_risk: str = "medium"         # none | low | medium | high | critical
    is_before_consent: bool = False
    is_hardcoded: Optional[bool] = None  # True=hardcoded, False=GTM-managed, None=unknown
    position: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "vendor": self.vendor,
            "type": self.type,
            "confidence": self.confidence,
            "detectionMethod": self.detection_method,
            "occurrenceCount": self.occurrence_count,
            "lineNumber": self.line_number,
            "sourceBlock": self.source_block,
            "matchedPattern": self.matched_pattern,
            "tagId": self.tag_id,
            "dataCollected": self.data_collected,
            "dataCollectionBasis": "vendor_capability_catalog",
            "dataCollectionObserved": False,
            "privacyRisk": self.privacy_risk,
            "lgpdRisk": self.privacy_risk,     # backward-compat alias
            "isBeforeConsent": self.is_before_consent,
            "isHardcoded": self.is_hardcoded,
            "position": self.position,
        }


# ─────────────────────────────────────────────
# GTM Quality
# ─────────────────────────────────────────────

@dataclass
class GTMQualityFinding:
    check: str           # e.g. "noscript_missing"
    label: str           # Human-readable name
    status: str          # ok | warning | critical
    description: str
    evidence: Optional[str] = None   # raw snippet that triggered the finding
    recommendation: Optional[str] = None
    confidence: str = CONFIDENCE_HIGH

    def to_dict(self) -> Dict[str, Any]:
        return {
            "check": self.check,
            "label": self.label,
            "status": self.status,
            "description": self.description,
            "evidence": self.evidence,
            "recommendation": self.recommendation,
            "confidence": self.confidence,
        }


@dataclass
class GTMQualityResult:
    containers: List[str] = field(default_factory=list)   # GTM-XXXXX IDs found
    container_count: int = 0
    has_noscript: bool = False
    datalayer_init_before_gtm: bool = False
    datalayer_overwritten: bool = False
    gtm_in_head: bool = False
    gtm_loaded_multiple_times: bool = False
    findings: List[GTMQualityFinding] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "containers": self.containers,
            "containerCount": self.container_count,
            "hasNoscript": self.has_noscript,
            "datalayerInitBeforeGtm": self.datalayer_init_before_gtm,
            "datalayerOverwritten": self.datalayer_overwritten,
            "gtmInHead": self.gtm_in_head,
            "gtmLoadedMultipleTimes": self.gtm_loaded_multiple_times,
            "findings": [f.to_dict() for f in self.findings],
            "score": self._score(),
        }

    def _score(self) -> int:
        score = 100
        for f in self.findings:
            if f.status == "critical":
                score -= 25
            elif f.status == "warning":
                score -= 10
        return max(0, score)


# ─────────────────────────────────────────────
# Event Audit
# ─────────────────────────────────────────────

VALIDITY_VALID      = "valid"
VALIDITY_PARTIAL    = "partial"     # present but missing required params
VALIDITY_MALFORMED  = "malformed"   # syntax/type errors detected
VALIDITY_NO_PARAMS  = "no_parameters"

@dataclass
class EventParameter:
    name: str
    value: Optional[str]
    expected_type: Optional[str] = None   # string | number | array | object
    actual_type: Optional[str] = None
    is_valid: bool = True
    issue: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "value": self.value,
            "expectedType": self.expected_type,
            "actualType": self.actual_type,
            "isValid": self.is_valid,
            "issue": self.issue,
        }


@dataclass
class EventFinding:
    name: str
    source: str                    # "dataLayer.push" | "gtag()" | "GTM-inferred" | "hardcoded"
    validity: str                  # valid | partial | malformed | no_parameters
    confidence: str
    detection_method: str
    parameters_found: List[EventParameter] = field(default_factory=list)
    missing_required_params: List[str] = field(default_factory=list)
    missing_recommended_params: List[str] = field(default_factory=list)
    occurrence_count: int = 1
    line_number: Optional[int] = None
    source_snippet: Optional[str] = None
    is_duplicate: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "source": self.source,
            "validity": self.validity,
            "confidence": self.confidence,
            "detectionMethod": self.detection_method,
            "parametersFound": [p.to_dict() for p in self.parameters_found],
            "parameterCount": len(self.parameters_found),
            "missingRequiredParams": self.missing_required_params,
            "missingRecommendedParams": self.missing_recommended_params,
            "occurrenceCount": self.occurrence_count,
            "lineNumber": self.line_number,
            "sourceSnippet": self.source_snippet,
            "isDuplicate": self.is_duplicate,
        }


@dataclass
class EventAuditResult:
    events: List[EventFinding] = field(default_factory=list)
    total_events: int = 0
    unique_event_names: int = 0
    duplicated_event_names: int = 0
    events_with_issues: int = 0
    ecommerce_events_detected: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "events": [e.to_dict() for e in self.events],
            "totalEvents": self.total_events,
            "uniqueEventNames": self.unique_event_names,
            "duplicatedEventNames": self.duplicated_event_names,
            "eventsWithIssues": self.events_with_issues,
            "ecommerceEventsDetected": self.ecommerce_events_detected,
        }


# ─────────────────────────────────────────────
# DataLayer Audit
# ─────────────────────────────────────────────

@dataclass
class DataLayerFinding:
    type: str           # pii_exposure | ecommerce_malformed | init_order_issue | overwritten
    severity: str       # critical | high | medium | low
    keys: List[str] = field(default_factory=list)
    snippet: Optional[str] = None
    description: str = ""
    confidence: str = CONFIDENCE_MEDIUM

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "severity": self.severity,
            "keys": self.keys,
            "snippet": self.snippet,
            "description": self.description,
            "confidence": self.confidence,
        }


# ─────────────────────────────────────────────
# Consent Audit
# ─────────────────────────────────────────────

@dataclass
class ConsentFinding:
    check: str
    label: str
    status: str     # ok | warning | critical | not_detected
    description: str
    evidence: Optional[str] = None
    recommendation: Optional[str] = None
    confidence: str = CONFIDENCE_MEDIUM

    def to_dict(self) -> Dict[str, Any]:
        return {
            "check": self.check,
            "label": self.label,
            "status": self.status,
            "description": self.description,
            "evidence": self.evidence,
            "recommendation": self.recommendation,
            "confidence": self.confidence,
        }


@dataclass
class ConsentAuditResult:
    cmp_detected: bool = False
    cmp_name: Optional[str] = None
    consent_mode_v2: bool = False
    consent_mode_version: Optional[str] = None
    has_default_denied: bool = False
    consent_signals: Dict[str, str] = field(default_factory=dict)
    has_reject_all: Optional[bool] = None      # None = not determinable
    has_privacy_policy: bool = False
    has_cookie_policy: bool = False
    tags_before_consent: List[str] = field(default_factory=list)   # tag names
    findings: List[ConsentFinding] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cmpDetected": self.cmp_detected,
            "cmpName": self.cmp_name,
            "consentModeV2": self.consent_mode_v2,
            "consentModeVersion": self.consent_mode_version,
            "hasDefaultDenied": self.has_default_denied,
            "consentSignals": self.consent_signals,
            "hasRejectAll": self.has_reject_all,
            "hasPrivacyPolicy": self.has_privacy_policy,
            "hasCookiePolicy": self.has_cookie_policy,
            "tagsBeforeConsent": self.tags_before_consent,
            "findings": [f.to_dict() for f in self.findings],
        }


# ─────────────────────────────────────────────
# Privacy / Compliance
# ─────────────────────────────────────────────

@dataclass
class PrivacyViolation:
    tag: str
    violation: str
    article: str
    description: str
    severity: str
    confidence: str
    data_collected: List[str] = field(default_factory=list)
    tag_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tag": self.tag,
            "violation": self.violation,
            "article": self.article,
            "description": self.description,
            "severity": self.severity,
            "confidence": self.confidence,
            "dataCollected": self.data_collected,
            "tagId": self.tag_id,
        }


@dataclass
class PrivacyAnalysisResult:
    jurisdiction: str
    law: str
    law_full: str
    violations: List[PrivacyViolation] = field(default_factory=list)
    total_violations: int = 0
    has_consent_tool: bool = False
    has_universal_analytics: bool = False
    consent_risks: List[str] = field(default_factory=list)
    disclosure_gaps: List[str] = field(default_factory=list)
    estimated_risk_exposure: str = "Insufficient data"
    compliance_score: int = 0
    confidence_level: str = "Assessment based on publicly observable behavior only"
    score_basis: str = "Technical risk heuristic; not a legal compliance percentage."
    score_deductions: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "jurisdiction": self.jurisdiction,
            "law": self.law,
            "framework": self.law_full,
            "violations": [v.to_dict() for v in self.violations],
            "totalViolations": self.total_violations,
            "hasConsentTool": self.has_consent_tool,
            "hasUniversalAnalytics": self.has_universal_analytics,
            "consentRisks": self.consent_risks,
            "disclosureGaps": self.disclosure_gaps,
            "estimatedRiskExposure": self.estimated_risk_exposure,
            "complianceScore": self.compliance_score,
            "confidenceLevel": self.confidence_level,
            "scoreBasis": self.score_basis,
            "scoreDeductions": self.score_deductions,
        }


# ─────────────────────────────────────────────
# Duplication Detection
# ─────────────────────────────────────────────

@dataclass
class DuplicateFinding:
    entity_type: str    # tag | event | pixel | ga4_config
    name: str
    occurrence_count: int
    positions: List[int] = field(default_factory=list)
    severity: str = "warning"
    recommendation: str = ""
    confidence: str = CONFIDENCE_HIGH
    note: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entityType": self.entity_type,
            "name": self.name,
            "occurrenceCount": self.occurrence_count,
            "positions": self.positions,
            "severity": self.severity,
            "recommendation": self.recommendation,
            "confidence": self.confidence,
            "note": self.note,
        }


# ─────────────────────────────────────────────
# Recommendations
# ─────────────────────────────────────────────

@dataclass
class Recommendation:
    severity: str    # critical | high | medium | low
    category: str    # consent | gtm_quality | event_quality | pii | security | privacy | implementation
    title: str
    detail: str
    fix: str
    confidence: str = CONFIDENCE_HIGH

    def to_dict(self) -> Dict[str, Any]:
        return {
            "severity": self.severity,
            "category": self.category,
            "title": self.title,
            "detail": self.detail,
            "fix": self.fix,
            "confidence": self.confidence,
        }


# ─────────────────────────────────────────────
# Data Quality Notes (anti-hallucination layer)
# ─────────────────────────────────────────────

@dataclass
class DataQualityNote:
    limitation: str
    reason: str
    affected_areas: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "limitation": self.limitation,
            "reason": self.reason,
            "affectedAreas": self.affected_areas,
        }


# ─────────────────────────────────────────────
# Score Model
# ─────────────────────────────────────────────

@dataclass
class AuditScores:
    overall: int
    tracking_quality: int
    event_architecture: int
    datalayer_quality: int
    consent_integrity: int
    privacy_risk: int       # 0=low risk (good), 100=high risk (bad) – stored as risk, displayed inverted
    explanation: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "auditScore": self.overall,
            "trackingQualityScore": self.tracking_quality,
            "eventArchitectureScore": self.event_architecture,
            "datalayerQualityScore": self.datalayer_quality,
            "consentIntegrityScore": self.consent_integrity,
            "privacyRiskScore": self.privacy_risk,
            "explanation": self.explanation,
        }


# ─────────────────────────────────────────────
# Master Audit Result
# ─────────────────────────────────────────────

@dataclass
class AuditResult:
    url: str
    timestamp: str

    # Core findings
    tags: List[TagFinding] = field(default_factory=list)
    gtm_quality: Optional[GTMQualityResult] = None
    events: Optional[EventAuditResult] = None
    datalayer_findings: List[DataLayerFinding] = field(default_factory=list)
    consent: Optional[ConsentAuditResult] = None
    privacy: Optional[PrivacyAnalysisResult] = None
    duplicates: List[DuplicateFinding] = field(default_factory=list)

    # Privacy & sensitive data engine
    personal_data_findings: List[Any] = field(default_factory=list)
    sensitive_data_findings: List[Any] = field(default_factory=list)
    regulatory_exposure: Optional[Dict[str, Any]] = None

    # Scoring + recommendations
    scores: Optional[AuditScores] = None
    recommendations: List[Recommendation] = field(default_factory=list)
    data_quality_notes: List[DataQualityNote] = field(default_factory=list)

    # Metadata
    scan_method: str = "html_source"
    disclaimer: str = (
        "This platform provides an indicative technical and privacy risk assessment "
        "based on publicly observable site behavior. It does not constitute legal advice."
    )

