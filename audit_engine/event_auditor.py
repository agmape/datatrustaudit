"""
audit_engine.event_auditor — GA4 event detection and parameter validation.

Detects events from:
1. dataLayer.push({event: '...', ...}) in raw HTML source
2. gtag('event', '...', {...}) calls in raw HTML source

Validates each event against GA4 recommended parameter schemas.
IMPORTANT: Only source-visible events can be detected.
SPA events fired after page load, server-side events, and GTM-managed triggers
cannot be observed and are explicitly noted as limitations.
"""
import re
import json
from typing import Any, Dict, List, Optional, Tuple
from .models import (
    EventFinding, EventParameter, EventAuditResult,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW,
    DETECT_SOURCE, DETECT_PATTERN,
    VALIDITY_VALID, VALIDITY_PARTIAL, VALIDITY_NO_PARAMS, VALIDITY_MALFORMED,
)


# ─────────────────────────────────────────────
# GA4 parameter validation schemas
# Each event maps to: required params and recommended params
# ─────────────────────────────────────────────

GA4_EVENT_SCHEMAS: Dict[str, Dict[str, List[str]]] = {
    "purchase": {
        "required": ["transaction_id", "value", "currency"],
        "recommended": ["items", "coupon", "tax", "shipping", "affiliation"],
    },
    "begin_checkout": {
        "required": ["value", "currency"],
        "recommended": ["items", "coupon"],
    },
    "add_to_cart": {
        "required": ["currency", "value"],
        "recommended": ["items", "item_id", "item_name", "price", "quantity"],
    },
    "remove_from_cart": {
        "required": ["currency", "value"],
        "recommended": ["items", "item_id", "item_name"],
    },
    "view_item": {
        "required": ["currency", "value"],
        "recommended": ["items", "item_id", "item_name", "item_category"],
    },
    "view_item_list": {
        "required": [],
        "recommended": ["item_list_name", "item_list_id", "items"],
    },
    "select_item": {
        "required": [],
        "recommended": ["item_list_name", "items", "item_id", "item_name"],
    },
    "add_payment_info": {
        "required": ["currency", "value", "payment_type"],
        "recommended": ["coupon", "items"],
    },
    "add_shipping_info": {
        "required": ["currency", "value", "shipping_tier"],
        "recommended": ["coupon", "items"],
    },
    "generate_lead": {
        "required": [],
        "recommended": ["value", "currency", "lead_type"],
    },
    "sign_up": {
        "required": [],
        "recommended": ["method"],
    },
    "login": {
        "required": [],
        "recommended": ["method"],
    },
    "search": {
        "required": [],
        "recommended": ["search_term"],
    },
    "page_view": {
        "required": [],
        "recommended": ["page_title", "page_location", "page_path"],
    },
    "view_promotion": {
        "required": [],
        "recommended": ["promotion_id", "promotion_name", "creative_name", "creative_slot"],
    },
    "select_promotion": {
        "required": [],
        "recommended": ["promotion_id", "promotion_name", "items"],
    },
    "refund": {
        "required": ["transaction_id", "value", "currency"],
        "recommended": ["items", "coupon", "tax"],
    },
}

ECOMMERCE_EVENTS = {
    "purchase", "begin_checkout", "add_to_cart", "remove_from_cart",
    "view_item", "view_item_list", "select_item", "add_payment_info",
    "add_shipping_info", "view_promotion", "select_promotion", "refund",
}

# ─────────────────────────────────────────────
# Regex patterns for event detection
# ─────────────────────────────────────────────

# dataLayer.push({...}) — captures the full object (heuristic, up to 2000 chars)
_DL_PUSH_RE = re.compile(
    r"dataLayer\s*\.\s*push\s*\(\s*(\{[\s\S]{0,2000}?\})\s*\)",
    re.IGNORECASE,
)

# gtag('event', 'event_name', {...})
_GTAG_EVENT_RE = re.compile(
    r"""gtag\s*\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[\s\S]{0,1500}?\}))?\s*\)""",
    re.IGNORECASE,
)


def _safe_parse_json_like(text: str) -> Optional[Dict[str, Any]]:
    """
    Attempt to parse a JS object literal as JSON.
    Handles single quotes, trailing commas, and unquoted keys (best-effort).
    Returns None on failure — never raises.
    """
    if not text:
        return None
    try:
        # Replace JS single quotes with double quotes
        cleaned = re.sub(r"'([^']*)'", r'"\1"', text)
        # Remove trailing commas before } or ]
        cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
        # Quote unquoted keys: word: → "word":
        cleaned = re.sub(r'(?<=[{,\s])(\w+)\s*:', r'"\1":', cleaned)
        return json.loads(cleaned)
    except Exception:
        return None


def _extract_params(obj: Optional[Dict[str, Any]]) -> List[EventParameter]:
    """Convert a parsed JS object dict into a list of EventParameter."""
    if not obj:
        return []
    params = []
    for key, val in obj.items():
        if key == "event":
            continue
        actual_type = type(val).__name__ if val is not None else "null"
        params.append(EventParameter(
            name=key,
            value=str(val)[:120] if val is not None else None,
            actual_type=actual_type,
        ))
    return params


def _validate_event(event_name: str, params: List[EventParameter]) -> Tuple[str, List[str], List[str]]:
    """
    Validate an event against its GA4 schema.
    Returns (validity, missing_required, missing_recommended).
    """
    schema = GA4_EVENT_SCHEMAS.get(event_name.lower())
    if not params:
        return VALIDITY_NO_PARAMS, [], []

    param_names = {p.name.lower() for p in params}

    if schema:
        missing_req = [p for p in schema["required"] if p not in param_names]
        missing_rec = [p for p in schema["recommended"] if p not in param_names]
        if missing_req:
            return VALIDITY_PARTIAL, missing_req, missing_rec
        return VALIDITY_VALID, [], missing_rec
    else:
        return VALIDITY_VALID, [], []


def _find_line(html: str, pos: int) -> int:
    return html[:pos].count("\n") + 1


def audit_events(html: str, scan=None) -> EventAuditResult:
    """
    Scan for GA4 events from multiple sources:
    1. dataLayer.push({event: '...'}) in raw HTML source
    2. gtag('event', '...', {...}) calls in raw HTML source
    3. Live dataLayer array captured from running browser (if scan provided)
    4. GA4 network payload parsing (/g/collect hits) from intercepted requests

    Returns EventAuditResult with full findings and summary statistics.
    """
    all_events: List[EventFinding] = []
    seen_snippets: set = set()  # deduplicate by snippet hash

    def _add_event(ev: EventFinding) -> None:
        key = f"{ev.name}:{ev.source}:{str(ev.source_snippet)[:80]}"
        if key not in seen_snippets:
            seen_snippets.add(key)
            all_events.append(ev)

    # ── 1. dataLayer.push({...}) in HTML ─────────────────────────────────────
    for m in _DL_PUSH_RE.finditer(html):
        raw_obj = m.group(1)
        parsed  = _safe_parse_json_like(raw_obj)

        event_name = None
        params: List[EventParameter] = []

        if parsed:
            event_name = parsed.get("event") or parsed.get("event_name")
            params = _extract_params(parsed)
        else:
            name_m = re.search(r"""['"]event['"]\s*:\s*['"]([^'"]+)['"]""", raw_obj)
            if name_m:
                event_name = name_m.group(1)

        if not event_name:
            continue

        validity, missing_req, missing_rec = _validate_event(event_name, params)
        line_num = _find_line(html, m.start())

        _add_event(EventFinding(
            name=event_name,
            source="dataLayer.push",
            validity=validity,
            confidence=CONFIDENCE_HIGH if parsed else CONFIDENCE_MEDIUM,
            detection_method=DETECT_SOURCE,
            parameters_found=params,
            missing_required_params=missing_req,
            missing_recommended_params=missing_rec,
            line_number=line_num,
            source_snippet=raw_obj[:200],
        ))

    # ── 2. gtag('event', '...', {...}) in HTML ────────────────────────────────
    for m in _GTAG_EVENT_RE.finditer(html):
        event_name = m.group(1)
        raw_params = m.group(2)
        parsed = _safe_parse_json_like(raw_params) if raw_params else None
        params = _extract_params(parsed) if parsed else []

        validity, missing_req, missing_rec = _validate_event(event_name, params)
        line_num = _find_line(html, m.start())

        _add_event(EventFinding(
            name=event_name,
            source="gtag()",
            validity=validity,
            confidence=CONFIDENCE_HIGH if parsed else CONFIDENCE_MEDIUM,
            detection_method=DETECT_PATTERN,
            parameters_found=params,
            missing_required_params=missing_req,
            missing_recommended_params=missing_rec,
            line_number=line_num,
            source_snippet=m.group(0)[:200],
        ))

    # ── 3. Live dataLayer from browser (runtime pushes) ───────────────────────
    if scan and hasattr(scan, "datalayer_raw"):
        for dl_item in scan.datalayer_raw:
            if not isinstance(dl_item, dict):
                continue
            event_name = dl_item.get("event") or dl_item.get("event_name")
            if not event_name:
                continue
            params = _extract_params(dl_item)
            validity, missing_req, missing_rec = _validate_event(event_name, params)
            snippet = str(dl_item)[:200]
            _add_event(EventFinding(
                name=event_name,
                source="dataLayer (runtime)",
                validity=validity,
                confidence=CONFIDENCE_HIGH,
                detection_method="browser_datalayer",
                parameters_found=params,
                missing_required_params=missing_req,
                missing_recommended_params=missing_rec,
                line_number=None,
                source_snippet=snippet,
            ))

    # ── 4. GA4 network payload parsing (/g/collect hits) ─────────────────────
    if scan and hasattr(scan, "intercepted_requests"):
        import urllib.parse
        for req in scan.intercepted_requests:
            if "google-analytics.com/g/collect" not in req.url and \
               "analytics.google.com/g/collect" not in req.url:
                continue
            # Extract event name from URL or POST body
            try:
                # en= param is the event name in GA4 MP hits
                params_raw = req.url.split("?", 1)[1] if "?" in req.url else (req.post_data or "")
                qp = dict(urllib.parse.parse_qsl(params_raw))
                event_name = qp.get("en")
                if not event_name:
                    continue
                # Extract event params (ep.*, epn.*)
                ep_params: List[EventParameter] = []
                for k, v in qp.items():
                    if k.startswith("ep.") or k.startswith("epn."):
                        clean_key = k.split(".", 1)[1]
                        ep_params.append(EventParameter(name=clean_key, value=v, actual_type="string"))
                validity, missing_req, missing_rec = _validate_event(event_name, ep_params)
                _add_event(EventFinding(
                    name=event_name,
                    source="GA4 network hit",
                    validity=validity,
                    confidence=CONFIDENCE_HIGH,
                    detection_method="network_request",
                    parameters_found=ep_params,
                    missing_required_params=missing_req,
                    missing_recommended_params=missing_rec,
                    line_number=None,
                    source_snippet=req.url[:200],
                ))
            except Exception:
                continue

    # ── Deduplication analysis ────────────────────────────────────────────────
    name_counts: Dict[str, int] = {}
    for ev in all_events:
        name_counts[ev.name] = name_counts.get(ev.name, 0) + 1

    for ev in all_events:
        count = name_counts[ev.name]
        ev.occurrence_count = count
        ev.is_duplicate = count > 1

    unique_names = set(name_counts.keys())
    duplicated_names = {n for n, c in name_counts.items() if c > 1}
    ecommerce_found = sorted(unique_names & ECOMMERCE_EVENTS)
    events_with_issues = sum(
        1 for ev in all_events
        if ev.validity in (VALIDITY_PARTIAL, VALIDITY_MALFORMED) or ev.missing_required_params
    )

    return EventAuditResult(
        events=all_events,
        total_events=len(all_events),
        unique_event_names=len(unique_names),
        duplicated_event_names=len(duplicated_names),
        events_with_issues=events_with_issues,
        ecommerce_events_detected=ecommerce_found,
    )
