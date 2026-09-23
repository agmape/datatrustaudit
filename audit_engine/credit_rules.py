"""
audit_engine.credit_rules — Scan credit consumption logic.

Rules:
- Completed scans always consume credit.
- Partial scans consume credit only if evidence_count > 0.
- Failed/blocked/timeout/protocol_error scans with zero evidence do NOT consume credit.
- Admin users bypass all limits.

Weekly Scan Limits (final product rules):
- Free:    10 scans/week   (R$ 0)
- Pro:     50 scans/week   (R$ 49/month)
- Premium: 200 scans/week  (R$ 149/month)
- Admin:   unlimited       (internal role only)
"""

from typing import Dict, Any, Optional


def get_evidence_count(result: dict) -> int:
    """Count all evidence items in a scan result.

    Inspects both the ``evidence`` sub-dict and top-level fields used by
    the current orchestrator output so that it works with both old and new
    response shapes.
    """
    evidence = result.get("evidence", {})
    if not isinstance(evidence, dict):
        evidence = {}

    count = 0

    # Count each evidence category
    for key in [
        "network_requests", "scripts", "cookies_pre_consent",
        "cookies_post_consent", "dataLayer_pushes", "gtag_calls",
        "console_errors", "screenshots",
    ]:
        items = evidence.get(key, [])
        if isinstance(items, list):
            count += len(items)

    # http_probe counts as 1 if present
    if evidence.get("http_probe"):
        count += 1

    # Also count from top-level fields (backward compat with current schema)
    for key in ["tags", "events", "violations", "recommendations", "duplicates"]:
        items = result.get(key, [])
        if isinstance(items, list):
            count += len(items)
        elif isinstance(items, dict):
            inner = items.get("events", [])
            if isinstance(inner, list):
                count += len(inner)

    return count


def should_consume_scan_credit(result: dict) -> bool:
    """Determine if a scan result should consume a credit.

    Returns ``True`` if credit should be consumed, ``False`` otherwise.
    """
    scan_status = result.get("scan_status") or result.get("status", "")
    evidence_count = result.get("evidence_count")
    if evidence_count is None:
        evidence_count = get_evidence_count(result)

    if scan_status == "completed":
        return True
    if scan_status == "partial" and evidence_count > 0:
        return True
    if scan_status in ("protocol_error", "blocked", "timeout", "failed"):
        return evidence_count > 0

    # Default: consume only if evidence exists
    return evidence_count > 0


# ---------------------------------------------------------------------------
# Weekly scan limits per plan
# ---------------------------------------------------------------------------

WEEKLY_SCAN_LIMITS: Dict[str, int] = {
    "free": 10,
    "pro": 50,
    "premium": 200,
    "admin": -1,  # unlimited
}


def get_weekly_limit(plan: str, is_admin: bool = False) -> int:
    """Get the weekly scan limit for a plan. Returns ``-1`` for unlimited."""
    if is_admin:
        return -1
    return WEEKLY_SCAN_LIMITS.get(plan, WEEKLY_SCAN_LIMITS["free"])


def can_perform_scan(plan: str, weekly_scan_count: int, is_admin: bool = False) -> bool:
    """Check if a user can perform a scan based on their plan and usage."""
    limit = get_weekly_limit(plan, is_admin)
    if limit == -1:
        return True
    return weekly_scan_count < limit
