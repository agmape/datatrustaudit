"""
Versioned report contract (v1.0) shared by the API, the UI, the history and the exporters.

Validated with pydantic (extra keys allowed so the contract can grow without breaking readers).
Rules the model enforces:
  * not-observable values are nullable / explicit states — never coerced to false/0;
  * every finding carries a stable ``rule_id``, an epistemic ``status`` and ``evidence_ids``;
  * an ``OBSERVED`` finding must cite at least one evidence id that exists in the report.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTRACT_VERSION = "1.0"
Status = Literal["OBSERVED", "INFERRED", "NOT_OBSERVED", "UNVERIFIABLE", "NOT_APPLICABLE"]
Severity = Literal["info", "low", "medium", "high", "critical", "needs_manual_review"]


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow")


class EvidenceModel(_Base):
    id: str
    source_type: str
    phase: Literal["static", "baseline", "reject", "accept"]
    page_url: str
    timestamp: str
    confidence: Literal["high", "medium", "low"]


class LocalizedModel(_Base):
    title: str
    found: str
    ask: str
    confirm: str
    owner: Literal["marketing", "agency", "development", "privacy"]
    owner_label: str
    status_label: str
    status_condition: str
    priority: str
    priority_reason: str
    copy_request: str


class FindingModel(_Base):
    id: str
    rule_id: str
    category: str
    status: Status
    severity: Severity
    confidence: Literal["high", "medium", "low"]
    evidence_ids: List[str]
    pages: List[str]
    localized: LocalizedModel


class TagModel(_Base):
    vendor_id: str
    technology: str
    ids: List[str]
    detection_methods: List[str]
    confidence: Literal["high", "medium", "low"]
    observed_firing: Optional[bool]                       # null = not verifiable, never coerced to false
    evidence_ids: List[str]


class AxisModel(_Base):
    score: Optional[int] = Field(ge=0, le=100)
    coverage: float = Field(ge=0, le=1)
    checks: List[Dict[str, Any]]


class ScoresModel(_Base):
    version: str
    overall: Dict[str, Any]
    axes: Dict[str, AxisModel]

    @model_validator(mode="after")
    def _null_needs_reason(self):
        if self.overall.get("score") is None and not self.overall.get("null_reason"):
            raise ValueError("overall score is null without null_reason")
        for name, ax in self.axes.items():
            if ax.score is None and not (ax.model_extra or {}).get("null_reason"):
                raise ValueError(f"axis {name} is null without null_reason")
        return self


class ReportContract(_Base):
    success: Literal[True]
    contract_version: str
    language: str
    timezone: str
    scan_id: str
    status: Literal["completed", "partial"]
    engine_version: str
    scoring_version: str
    started_at: str
    finished_at: str
    capabilities: Dict[str, Any]
    limitations: List[str]
    pages: List[Dict[str, Any]]
    tags: List[TagModel]
    findings: List[FindingModel]
    scores: ScoresModel
    evidence: List[EvidenceModel]
    disclaimer: str

    @model_validator(mode="after")
    def _evidence_integrity(self):
        ids = {e.id for e in self.evidence}
        if len(ids) != len(self.evidence):
            raise ValueError("duplicate evidence ids")
        fids = [f.id for f in self.findings]
        if len(set(fids)) != len(fids):
            raise ValueError("duplicate finding ids")
        for f in self.findings:
            if f.status == "OBSERVED" and not f.evidence_ids:
                raise ValueError(f"{f.id} is OBSERVED without evidence")
            missing = [i for i in f.evidence_ids if i not in ids]
            if missing:
                raise ValueError(f"{f.id} cites unknown evidence {missing[:3]}")
        for t in self.tags:
            missing = [i for i in t.evidence_ids if i not in ids]
            if missing:
                raise ValueError(f"tag {t.vendor_id} cites unknown evidence {missing[:3]}")
        return self


def validate_report(report: Dict[str, Any]) -> ReportContract:
    return ReportContract.model_validate(report)
