"""
Canonical Evidence model.

Every important claim in a report must reference one or more Evidence ids.
Evidence objects only ever contain *sanitized* data: query strings, POST bodies,
storage values and dataLayer payloads are redacted before an Evidence object is
created (see ``datatrust.redaction``). Cookie and storage *values* are never
stored — only names, attributes, lengths and PII classification.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class SourceType(str, Enum):
    NETWORK = "network"
    SCRIPT_URL = "script_url"
    HTML_SOURCE = "html_source"
    RENDERED_DOM = "rendered_dom"
    RUNTIME_JS = "runtime_js"
    DATALAYER = "datalayer"
    GTAG = "gtag"
    FBQ = "fbq"
    COOKIE = "cookie"
    LOCAL_STORAGE = "local_storage"
    SESSION_STORAGE = "session_storage"
    CMP = "cmp"
    CONSENT_MODE = "consent_mode"
    POLICY_LINK = "policy_link"
    CONSOLE = "console"
    NAVIGATION = "navigation"


class Phase(str, Enum):
    STATIC = "static"        # initial HTML only (no JavaScript executed)
    BASELINE = "baseline"    # fresh context, page opened, no interaction
    REJECT = "reject"        # fresh context, CMP "reject all" attempted
    ACCEPT = "accept"        # fresh context, CMP "accept all" attempted


class Confidence(str, Enum):
    """Reliability of the *detection* — never legal certainty."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


@dataclass
class Redaction:
    redacted: bool = False
    kinds: List[str] = field(default_factory=list)      # e.g. ["email", "cpf"]
    fields: List[str] = field(default_factory=list)     # keys / params that were redacted
    truncated: bool = False

    def merge(self, other: "Redaction") -> "Redaction":
        self.redacted = self.redacted or other.redacted
        self.truncated = self.truncated or other.truncated
        for k in other.kinds:
            if k not in self.kinds:
                self.kinds.append(k)
        for f in other.fields:
            if f not in self.fields:
                self.fields.append(f)
        return self


@dataclass
class Evidence:
    id: str
    source_type: SourceType
    phase: Phase
    page_url: str
    timestamp: str = field(default_factory=utc_now_iso)
    t_ms: Optional[int] = None                 # ms since phase navigation start (approximate)
    confidence: Confidence = Confidence.HIGH
    vendor_hint: Optional[str] = None          # catalog id when the evidence matched a vendor signature
    # network
    request_url: Optional[str] = None          # sanitized
    request_method: Optional[str] = None
    resource_type: Optional[str] = None
    domain: Optional[str] = None
    third_party: Optional[bool] = None
    after_interaction: Optional[bool] = None   # only meaningful in reject/accept phases
    # html / dom
    html_line: Optional[int] = None
    snippet: Optional[str] = None              # sanitized, truncated
    script_url: Optional[str] = None
    # cookies
    cookie_name: Optional[str] = None
    cookie_domain: Optional[str] = None
    cookie_attributes: Optional[Dict[str, Any]] = None
    # storage
    storage_key: Optional[str] = None
    # runtime calls
    datalayer_event: Optional[Any] = None      # sanitized payload
    gtag_call: Optional[List[Any]] = None      # sanitized args
    fbq_call: Optional[List[Any]] = None       # sanitized args
    # consent
    cmp_signal: Optional[Dict[str, Any]] = None
    consent_state: Optional[Dict[str, Any]] = None
    # parsed hit data (e.g. GA4 en/tid/params) — sanitized
    parsed: Optional[Dict[str, Any]] = None
    redaction: Redaction = field(default_factory=Redaction)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["source_type"] = self.source_type.value
        d["phase"] = self.phase.value
        d["confidence"] = self.confidence.value
        red = d.pop("redaction")
        out = {k: v for k, v in d.items() if v is not None}
        if red.get("redacted") or red.get("truncated"):
            out["redaction"] = red
        return out


class EvidenceStore:
    """Append-only store; ids are stable and unique within a scan."""

    def __init__(self, prefix: str = "ev"):
        self._items: List[Evidence] = []
        self._by_id: Dict[str, Evidence] = {}
        self._prefix = prefix
        self._seq = 0

    def new_id(self) -> str:
        self._seq += 1
        return f"{self._prefix}-{self._seq:05d}"

    def add(self, **kwargs) -> Evidence:
        ev = Evidence(id=self.new_id(), **kwargs)
        self._items.append(ev)
        self._by_id[ev.id] = ev
        return ev

    def get(self, ev_id: str) -> Optional[Evidence]:
        return self._by_id.get(ev_id)

    def all(self) -> List[Evidence]:
        return list(self._items)

    def filter(self, *, source_type: Optional[SourceType] = None, phase: Optional[Phase] = None,
               vendor: Optional[str] = None, page_url: Optional[str] = None) -> List[Evidence]:
        out = []
        for ev in self._items:
            if source_type is not None and ev.source_type != source_type:
                continue
            if phase is not None and ev.phase != phase:
                continue
            if vendor is not None and ev.vendor_hint != vendor:
                continue
            if page_url is not None and ev.page_url != page_url:
                continue
            out.append(ev)
        return out

    def __len__(self) -> int:
        return len(self._items)

    def to_list(self) -> List[Dict[str, Any]]:
        return [e.to_dict() for e in self._items]
