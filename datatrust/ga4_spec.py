"""
GA4 recommended-event requirements used for validation of OBSERVED events.

Source (official): https://developers.google.com/analytics/devguides/collection/ga4/reference/events
Retrieved 2026-10-25. Only requirements stated as required by the reference are
encoded; "currency is required if value is set" is modelled as a conditional.
Items: each item requires item_id OR item_name.
"""
from typing import Dict, List

GA4_EVENTS_DOC = "https://developers.google.com/analytics/devguides/collection/ga4/reference/events"

# event -> {"required": [...], "currency_if_value": bool, "items_required": bool}
GA4_RECOMMENDED: Dict[str, Dict] = {
    "purchase":          {"required": ["transaction_id"], "currency_if_value": True, "items_required": True},
    "refund":            {"required": ["transaction_id"], "currency_if_value": True, "items_required": False},
    "add_to_cart":       {"required": [], "currency_if_value": True, "items_required": True},
    "remove_from_cart":  {"required": [], "currency_if_value": True, "items_required": True},
    "add_to_wishlist":   {"required": [], "currency_if_value": True, "items_required": True},
    "view_item":         {"required": [], "currency_if_value": True, "items_required": True},
    "view_cart":         {"required": [], "currency_if_value": True, "items_required": True},
    "begin_checkout":    {"required": [], "currency_if_value": True, "items_required": True},
    "add_payment_info":  {"required": [], "currency_if_value": True, "items_required": True},
    "add_shipping_info": {"required": [], "currency_if_value": True, "items_required": True},
    "view_item_list":    {"required": [], "currency_if_value": False, "items_required": True},
    "select_item":       {"required": [], "currency_if_value": False, "items_required": True},
    "view_promotion":    {"required": [], "currency_if_value": False, "items_required": True},
    "select_promotion":  {"required": [], "currency_if_value": False, "items_required": False},
    "generate_lead":     {"required": [], "currency_if_value": True, "items_required": False},
    "search":            {"required": ["search_term"], "currency_if_value": False, "items_required": False},
}

GA4_AUTOMATIC_OR_ENHANCED = {
    "page_view", "session_start", "first_visit", "user_engagement", "scroll", "click", "file_download",
    "form_start", "form_submit", "video_start", "video_progress", "video_complete", "view_search_results",
}


def validate_event(name: str, params: Dict, items: List[Dict]) -> List[str]:
    """Return list of human-readable missing requirements for an OBSERVED event."""
    spec = GA4_RECOMMENDED.get(name)
    if not spec:
        return []
    missing = []
    for p in spec["required"]:
        if params.get(p) in (None, "", "undefined", "[undefined]"):
            missing.append(p)
    if spec["currency_if_value"] and params.get("value") not in (None, "", "undefined", "[undefined]"):
        if params.get("currency") in (None, "", "undefined", "[undefined]"):
            missing.append("currency (required when value is set)")
    if spec["items_required"]:
        if not items:
            missing.append("items")
        else:
            bad = [i for i, it in enumerate(items) if not (isinstance(it, dict) and (it.get("item_id") or it.get("item_name")))]
            if bad:
                missing.append(f"items[{bad[0]}].item_id or item_name")
    return missing
