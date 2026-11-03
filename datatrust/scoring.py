"""
Scoring (versioned). See SCORING.md for the human-readable specification.

Principles:
* Every axis is ``passed_checks / applicable_checks * 100``.
* A check is applicable only if the scanner had the capability AND the
  precondition evidence to evaluate it. Unobservable => not applicable => no
  penalty. An axis with zero applicable checks is ``null`` with a reason.
* The global score only exists when the browser runtime was observed and the
  weighted coverage of non-null axes is >= MIN_GLOBAL_COVERAGE.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .analyzers import AnalysisContext, _beacon_vendors, _is_denied_ping
from .catalog import BY_ID, TRACKING_CATEGORIES
from .evidence import Phase, SourceType

SCORING_VERSION = "2026.10.1"
WEIGHTS = {"tracking_implementation": 0.30, "event_data_quality": 0.20, "consent_integrity": 0.30,
           "privacy_exposure": 0.20}
MIN_GLOBAL_COVERAGE = 0.50
DEFINED_CHECKS = {"tracking_implementation": 7, "consent_integrity": 5, "privacy_exposure": 3}
RELIABLE_FIRING_VENDORS = {"ga4", "meta_pixel"}   # vendors with page-load HTTP beacons we can rely on


def _check(cid: str, label: str, applicable: bool, passed: Optional[bool], evidence: List[str] = None,
           reason: str = "") -> Dict[str, Any]:
    return {"id": cid, "label": label, "applicable": applicable, "passed": passed if applicable else None,
            "evidence_ids": (evidence or [])[:30], "reason": reason}


def _axis(name: str, checks: List[Dict[str, Any]], confidence: str, null_reason: str,
          defined: Optional[int] = None, coverage_override: Optional[float] = None) -> Dict[str, Any]:
    app = [c for c in checks if c["applicable"]]
    passed = [c for c in app if c["passed"]]
    defined = defined or len(checks) or 1
    coverage = coverage_override if coverage_override is not None else (len(app) / defined if defined else 0.0)
    if not app:
        return {"score": None, "null_reason": null_reason, "passed": 0, "applicable": 0, "defined_checks": defined,
                "coverage": round(coverage, 2), "confidence": None, "checks": checks,
                "formula": "passed_checks / applicable_checks * 100"}
    return {"score": round(100 * len(passed) / len(app)), "passed": len(passed), "applicable": len(app),
            "defined_checks": defined, "coverage": round(coverage, 2), "confidence": confidence, "checks": checks,
            "formula": "passed_checks / applicable_checks * 100"}


def compute_scores(ctx: AnalysisContext, tags: List[Dict[str, Any]], findings: List[Dict[str, Any]],
                   events: Dict[str, Any], consent: Dict[str, Any], baseline_status: str) -> Dict[str, Any]:
    rules = {}
    for f in findings:
        rules.setdefault(f["rule_id"], []).append(f)
    rt = ctx.runtime_available
    conf_rt = "high" if baseline_status == "completed" else "medium"
    store = ctx.store
    tag_ids = {t["vendor_id"] for t in tags}

    # ── tracking implementation ──
    tchecks = []
    cmp_present = any(t["category"] == "cmp" for t in tags)
    accept_done = ctx.interactions.get("accept", {}).get("status") == "performed"
    for vid in sorted(RELIABLE_FIRING_VENDORS & tag_ids):
        t = next(x for x in tags if x["vendor_id"] == vid)
        applicable = rt and (not cmp_present or accept_done)
        tchecks.append(_check(f"fires:{vid}", f"{t['technology']} sends a collection request on page load", applicable,
                              t["observed_firing"] is True, t["evidence_ids"][:10],
                              "" if applicable else ("runtime not observed" if not rt else
                                                      "CMP present and accept interaction not performed; absence could be consent gating")))
    gtm_rt = rt and any(t["vendor_id"] == "gtm" and "script_loaded" in t["detection_methods"] for t in tags)
    tchecks.append(_check("gtm_single_load", "Each GTM container loaded once per page", gtm_rt,
                          "GTM_CONTAINER_LOADED_MULTIPLE_TIMES" not in rules,
                          [i for f in rules.get("GTM_CONTAINER_LOADED_MULTIPLE_TIMES", []) for i in f["evidence_ids"]],
                          "" if gtm_rt else "GTM not observed loading at runtime"))
    pv_obs = rt and any(e["name"] == "page_view" and e["sent_to_ga4"] for e in events.get("events", []))
    tchecks.append(_check("ga4_single_page_view", "GA4 page_view not duplicated", pv_obs,
                          "GA4_DUPLICATE_PAGE_VIEW" not in rules,
                          [i for f in rules.get("GA4_DUPLICATE_PAGE_VIEW", []) for i in f["evidence_ids"]],
                          "" if pv_obs else "no GA4 page_view hit observed"))
    meta_rt = rt and "meta_pixel" in tag_ids
    tchecks.append(_check("meta_no_duplicates", "Meta Pixel not initialized / PageView not sent twice", meta_rt,
                          not ({"META_PIXEL_DUPLICATE_INIT", "META_PIXEL_DUPLICATE_PAGEVIEW"} & set(rules)), [],
                          "" if meta_rt else "Meta Pixel not observed at runtime"))
    any_analytics = any(t["category"] in ("analytics", "google_tag", "tag_manager") for t in tags)
    tchecks.append(_check("no_legacy_ua", "No Universal Analytics (legacy) code", any_analytics,
                          "universal_analytics" not in tag_ids, [], "" if any_analytics else "no analytics tags observed"))
    tchecks.append(_check("no_placeholder_ids", "No placeholder tag IDs published", bool(tags),
                          "PLACEHOLDER_TAG_ID" not in rules, [], "" if tags else "no tags observed"))
    ga4_cfg = rt and "ga4" in tag_ids and (not cmp_present or accept_done)
    tchecks.append(_check("ga4_config_collects", "Configured GA4 actually collects", ga4_cfg,
                          "GA4_CONFIGURED_NO_COLLECTION_OBSERVED" not in rules, [],
                          "" if ga4_cfg else "GA4 not observed or consent gating not testable"))
    tracking = _axis("tracking_implementation", tchecks, conf_rt if rt else "low",
                     "No tracking technology was observed to evaluate.", DEFINED_CHECKS["tracking_implementation"])

    # ── event data quality ──
    echecks = []
    evaluated_events = 0
    total_ga4_events = 0
    for e in events.get("events", []):
        if e["name"].startswith("meta:"):
            continue
        if e["status"] == "OBSERVED":
            total_ga4_events += 1
        if e["recommended_ga4_event"] and e["status"] == "OBSERVED":
            evaluated_events += 1
            echecks.append(_check(f"event:{e['name']}", f"'{e['name']}' carries required parameters", True,
                                  not e["validation_issues"], e["evidence_ids"][:10]))
    if "GA4_DUPLICATE_PURCHASE" in rules:
        echecks.append(_check("no_duplicate_purchase", "transaction_id not sent twice", True, False,
                              [i for f in rules["GA4_DUPLICATE_PURCHASE"] for i in f["evidence_ids"]]))
    event_cov = (evaluated_events / total_ga4_events) if total_ga4_events else 0.0
    event_axis = _axis("event_data_quality", echecks, conf_rt if rt else "low",
                       "No GA4 recommended event with a published parameter specification was observed firing; "
                       "nothing to validate.", max(1, len(echecks)), coverage_override=round(event_cov, 2))

    # ── consent integrity ──
    cchecks = []
    cmp_obs = bool(consent.get("cmp_observed"))
    reject = ctx.interactions.get("reject", {})
    reject_done = reject.get("status") == "performed"
    base_ok = rt and cmp_obs and ctx.phase_status.get("baseline") in ("completed", "partial")
    cchecks.append(_check("no_tracking_before_interaction", "No tracking requests before consent interaction", base_ok,
                          "TRACKING_BEFORE_CONSENT_INTERACTION" not in rules,
                          [i for f in rules.get("TRACKING_BEFORE_CONSENT_INTERACTION", []) for i in f["evidence_ids"]],
                          "" if base_ok else "requires runtime + CMP observed"))
    cchecks.append(_check("reject_blocks_requests", "No tracking requests after 'reject all'", reject_done,
                          "TRACKING_AFTER_REJECT" not in rules,
                          [i for f in rules.get("TRACKING_AFTER_REJECT", []) for i in f["evidence_ids"]],
                          "" if reject_done else f"reject interaction status: {reject.get('status', 'not_run')}"))
    cchecks.append(_check("reject_blocks_cookies", "No new tracking cookies after 'reject all'", reject_done,
                          "TRACKING_COOKIES_SET_AFTER_REJECT" not in rules,
                          [i for f in rules.get("TRACKING_COOKIES_SET_AFTER_REJECT", []) for i in f["evidence_ids"]],
                          "" if reject_done else f"reject interaction status: {reject.get('status', 'not_run')}"))
    cm = consent.get("consent_mode") or {}
    cm_default = bool(cm.get("default"))
    cchecks.append(_check("consent_mode_default_first", "Consent Mode default set before Google tags", rt and cm_default,
                          "CONSENT_MODE_DEFAULT_AFTER_TAG" not in rules, [],
                          "" if cm_default else "no consent default command observed"))
    gcs_rej = bool((cm.get("gcs_values") or {}).get("reject"))
    cchecks.append(_check("consent_mode_denied_after_reject", "GA4 hits after reject report denied storage",
                          reject_done and gcs_rej, "CONSENT_MODE_GRANTED_AFTER_REJECT" not in rules, [],
                          "" if (reject_done and gcs_rej) else "no GA4 hits with gcs in reject phase"))
    c_conf = conf_rt if reject_done else "medium"
    null_reason = ("Runtime browser not observed." if not rt else
                   "No CMP observed; consent gating could not be evaluated. This is not a penalty — it may require "
                   "analysis of purpose and legal basis." if not cmp_obs else "No consent check was applicable.")
    consent_axis = _axis("consent_integrity", cchecks, c_conf, null_reason, DEFINED_CHECKS["consent_integrity"])

    # ── privacy exposure ──
    pchecks = []
    pchecks.append(_check("no_pii_to_third_parties", "No validated personal-data values sent to third parties", rt,
                          "PII_VALUE_SENT_TO_THIRD_PARTY" not in rules,
                          [i for f in rules.get("PII_VALUE_SENT_TO_THIRD_PARTY", []) for i in f["evidence_ids"]],
                          "" if rt else "network not observed"))
    pchecks.append(_check("no_pii_in_datalayer", "No validated personal-data values in dataLayer/tag calls", rt,
                          "PII_VALUE_IN_DATALAYER" not in rules,
                          [i for f in rules.get("PII_VALUE_IN_DATALAYER", []) for i in f["evidence_ids"]],
                          "" if rt else "runtime not observed"))
    pchecks.append(_check("no_pii_in_storage", "No validated personal-data values in cookies/storage", rt,
                          "PII_VALUE_IN_BROWSER_STORAGE" not in rules,
                          [i for f in rules.get("PII_VALUE_IN_BROWSER_STORAGE", []) for i in f["evidence_ids"]],
                          "" if rt else "storage not observed"))
    privacy_axis = _axis("privacy_exposure", pchecks, conf_rt if rt else "low", "Runtime browser not observed.",
                         DEFINED_CHECKS["privacy_exposure"])

    axes = {"tracking_implementation": tracking, "event_data_quality": event_axis,
            "consent_integrity": consent_axis, "privacy_exposure": privacy_axis}
    avail = {k: v for k, v in axes.items() if v["score"] is not None}
    covered_weight = sum(WEIGHTS[k] for k in avail)
    overall: Dict[str, Any] = {"score": None, "coverage": round(covered_weight, 2), "confidence": None,
                               "formula": "sum(weight_i * score_i) / sum(weight_i) over non-null axes",
                               "weights": WEIGHTS, "min_coverage": MIN_GLOBAL_COVERAGE}
    if not rt:
        overall["null_reason"] = "Global score withheld: the browser runtime was not observed (static or failed scan)."
    elif covered_weight < MIN_GLOBAL_COVERAGE:
        overall["null_reason"] = (f"Global score withheld: only {round(covered_weight * 100)}% of the weighted axes "
                                  f"could be measured (minimum {int(MIN_GLOBAL_COVERAGE * 100)}%).")
    else:
        overall["score"] = round(sum(WEIGHTS[k] * v["score"] for k, v in avail.items()) / covered_weight)
        confs = [v["confidence"] for v in avail.values()]
        overall["confidence"] = "high" if all(c == "high" for c in confs) else ("low" if "low" in confs else "medium")
    return {"version": SCORING_VERSION, "overall": overall, "axes": axes}
