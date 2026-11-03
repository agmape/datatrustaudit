"""
Finding model.

``status`` (epistemic status of the claim):
  OBSERVED      — directly supported by evidence collected in this scan.
  INFERRED      — derived from evidence by a rule, but not directly observed
                  (e.g. "script appears before CMP in HTML source").
                  Never displayed as OBSERVED.
  NOT_OBSERVED  — the scanner looked (capability was available) and did not
                  find it. This is not proof of absence outside the scan window.
  UNVERIFIABLE  — the scanner could not check it in this scan (capability
                  unavailable, interaction impossible, out of scope).

``kind``:
  technical      — a technical observation about the site.
  legal_context  — cautious context about why a technical finding may matter
                   legally. Never a legal conclusion.

``severity`` is a *technical risk classification*:
  info | low | medium | high | critical | needs_manual_review
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

STATUSES = ("OBSERVED", "INFERRED", "NOT_OBSERVED", "UNVERIFIABLE")
SEVERITIES = ("info", "low", "medium", "high", "critical", "needs_manual_review")


@dataclass
class LegalContext:
    text: str
    frameworks: List[str] = field(default_factory=list)   # e.g. ["LGPD", "GDPR/ePrivacy"]
    requires_manual_review: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {"text": self.text, "frameworks": self.frameworks, "requires_manual_review": self.requires_manual_review}


@dataclass
class Finding:
    rule_id: str
    title: str
    description: str
    category: str                 # tracking | consent | events | privacy | implementation | policy | scan
    status: str
    severity: str
    confidence: str               # high | medium | low  (detection reliability)
    evidence_ids: List[str] = field(default_factory=list)
    pages: List[str] = field(default_factory=list)
    vendor: Optional[str] = None
    recommendation: Optional[str] = None
    how_to_verify: Optional[str] = None
    limitations: List[str] = field(default_factory=list)
    legal_context: Optional[LegalContext] = None
    data: Dict[str, Any] = field(default_factory=dict)
    id: str = ""

    def __post_init__(self):
        assert self.status in STATUSES, self.status
        assert self.severity in SEVERITIES, self.severity
        if self.status == "OBSERVED" and not self.evidence_ids:
            raise ValueError(f"OBSERVED finding {self.rule_id} must reference evidence")

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "id": self.id, "rule_id": self.rule_id, "title": self.title, "description": self.description,
            "category": self.category, "kind": "technical", "status": self.status, "severity": self.severity,
            "confidence": self.confidence, "evidence_ids": self.evidence_ids, "pages": self.pages,
        }
        for k in ("vendor", "recommendation", "how_to_verify"):
            v = getattr(self, k)
            if v:
                d[k] = v
        if self.limitations:
            d["limitations"] = self.limitations
        if self.legal_context:
            d["legal_context"] = self.legal_context.to_dict()
        if self.data:
            d["data"] = self.data
        return d


class FindingList:
    def __init__(self):
        self.items: List[Finding] = []

    def add(self, f: Finding) -> Finding:
        f.id = f"F-{len(self.items) + 1:03d}"
        self.items.append(f)
        return f

    def to_list(self) -> List[Dict[str, Any]]:
        order = {s: i for i, s in enumerate(("critical", "high", "needs_manual_review", "medium", "low", "info"))}
        return [f.to_dict() for f in sorted(self.items, key=lambda x: (order.get(x.severity, 9), x.id))]
