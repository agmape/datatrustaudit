"""
Analyzers: Evidence -> tags + findings.

Rules of the road:
* A finding is OBSERVED only when it can cite evidence ids that directly show it.
* Source-order / code-presence claims are INFERRED and say so.
* NOT_OBSERVED is only emitted when the relevant capability actually ran.
* Anything the scanner could not test is UNVERIFIABLE (never silently skipped
  in a way that looks like a pass).
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from .catalog import BY_ID, CATEGORIES, TRACKING_CATEGORIES, VENDORS, is_placeholder_id
from .evidence import Evidence, EvidenceStore, Phase, SourceType
from .findings import Finding, FindingList, LegalContext
from .ga4_spec import GA4_EVENTS_DOC, GA4_RECOMMENDED, validate_event

TRACKING_COOKIE_RE = re.compile(
    r"^(?:_ga(?:_[A-Z0-9]+)?|_gid|_gat(?:_.*)?|_gcl_[a-z]+|_gac_.*|__gads|__gpi|IDE|test_cookie|NID|"
    r"_fbp|_fbc|fr|_ttp|_tt_enable_cookie|ttwid|li_sugr|bcookie|lidc|UserMatchHistory|AnalyticsSyncHistory|"
    r"li_fat_id|_uetsid|_uetvid|MUID|_clck|_clsk|CLID|ANONCHK|SM|_hj.*|ajs_(?:anonymous_id|user_id)|"
    r"amp_.*|AMP_.*|mp_.*_mixpanel|hubspotutk|__hstc|__hssc|__hssrc|__kla_id|_pin_unauth|_pinterest_.*|"
    r"_scid|_sctr|_rdt_uuid|cto_bundle|cto_bidid|t_gid|taboola_.*|_vwo_.*|_vis_opt_.*|optimizelyEndUserId|"
    r"s_cc|s_sq|s_vi|s_fid|AMCV_.*|AMCVS_.*|_cs_.*|_derived_epik|_twitter_sess|personalization_id|guest_id)$")

LC_CONSENT = LegalContext(
    text=("Where consent is the legal basis chosen by the controller, LGPD (Lei 13.709/2018, arts. 7, I and 8) "
          "requires it to be free, informed and unambiguous, and ANPD's cookie guidance discusses consent for "
          "non-essential cookies. In the EU, ePrivacy art. 5(3) and GDPR art. 7 apply to storage/access on the "
          "device. A public scan cannot know the legal basis defined by the controller; this behavior may "
          "require analysis of purpose and legal basis."),
    frameworks=["LGPD", "ANPD cookie guidance", "GDPR", "ePrivacy"])
LC_PII = LegalContext(
    text=("Personal data sent to third parties may constitute shared use and, depending on the recipient's "
          "location, international transfer (LGPD arts. 7, 26, 33; GDPR arts. 6, 28, 44+). Whether this is "
          "lawful depends on purpose, legal basis, contracts and transparency, which a public scan cannot "
          "assess. Requires legal/manual review."),
    frameworks=["LGPD", "GDPR"])


@dataclass
class AnalysisContext:
    store: EvidenceStore
    pii_hits: List[Dict[str, Any]]
    home_url: str
    pages: List[str]
    runtime_available: bool
    phase_status: Dict[str, str] = field(default_factory=dict)        # home phases: baseline/reject/accept -> status
    interactions: Dict[str, Dict[str, Any]] = field(default_factory=dict)  # reject/accept -> interaction dict


def _beacon_vendors(ev: Evidence) -> List[str]:
    return list((ev.parsed or {}).get("beacon_vendors") or [])


def _script_vendors(ev: Evidence) -> List[str]:
    p = ev.parsed or {}
    return list(p.get("script_vendors") or []) + list(p.get("all_vendor_matches") or [])


def _ga4_events(ev: Evidence) -> List[Dict[str, Any]]:
    return list((ev.parsed or {}).get("ga4_events") or [])


def _is_denied_ping(ev: Evidence) -> bool:
    """GA4/Google hits whose gcs indicates both ad_storage and analytics_storage denied (G100)."""
    evs = _ga4_events(ev)
    gcs_vals = [e.get("gcs") for e in evs if e.get("gcs")]
    if not gcs_vals:
        # Google Ads hits can carry gcs in URL params too
        m = re.search(r"[?&]gcs=(G1\d\d)", ev.request_url or "")
        gcs_vals = [m.group(1)] if m else []
    return bool(gcs_vals) and all(g == "G100" for g in gcs_vals)


def _gtag_args(ev: Evidence) -> List[Any]:
    return ev.gtag_call if isinstance(ev.gtag_call, list) else []


# ═══════════════════════════════════════════════════════════════════════════
# TAGS
# ═══════════════════════════════════════════════════════════════════════════
def analyze_tags(ctx: AnalysisContext) -> List[Dict[str, Any]]:
    by_vendor: Dict[str, List[Evidence]] = defaultdict(list)
    for ev in ctx.store.all():
        vids: Set[str] = set()
        if ev.vendor_hint and ev.vendor_hint in BY_ID:
            vids.add(ev.vendor_hint)
        vids.update(v for v in _beacon_vendors(ev) + _script_vendors(ev) if v in BY_ID)
        for v in vids:
            by_vendor[v].append(ev)

    tags = []
    for vid, evs in by_vendor.items():
        v = BY_ID[vid]
        methods: Set[str] = set()
        ids: Set[str] = set()
        placeholders: Set[str] = set()
        pages: Set[str] = set()
        phases: Set[str] = set()
        beacon_ids: List[str] = []
        for ev in evs:
            pages.add(ev.page_url)
            phases.add(ev.phase.value)
            p = ev.parsed or {}
            if ev.source_type == SourceType.NETWORK and vid in _beacon_vendors(ev):
                methods.add("network_collection_request")
                beacon_ids.append(ev.id)
            elif ev.source_type in (SourceType.SCRIPT_URL, SourceType.NETWORK) and vid in _script_vendors(ev):
                methods.add("script_loaded")
            elif ev.source_type == SourceType.RENDERED_DOM:
                methods.add("rendered_dom_script")
            elif ev.source_type == SourceType.HTML_SOURCE and p.get("kind") == "script_tag":
                methods.add("html_script_tag")
            elif ev.source_type == SourceType.HTML_SOURCE:
                methods.add("html_code_signature")
            elif ev.source_type == SourceType.RUNTIME_JS and "google_tag_manager" in str(p.get("source", "")):
                methods.add("runtime_container_registry")
            elif ev.source_type == SourceType.RUNTIME_JS:
                methods.add("runtime_global")
            elif ev.source_type == SourceType.GTAG:
                methods.add("gtag_call")
            elif ev.source_type == SourceType.FBQ:
                methods.add("fbq_call")
            elif ev.source_type == SourceType.CMP:
                methods.add("cmp_runtime_signal")
            for i in p.get("ids") or []:
                (placeholders if is_placeholder_id(i) else ids).add(i)
            for ge in _ga4_events(ev):
                if vid == "ga4" and ge.get("tid"):
                    (placeholders if is_placeholder_id(ge["tid"]) else ids).add(ge["tid"])
        # IDs from gtag('config', ID) / fbq('init', ID) calls
        for ev in ctx.store.filter(source_type=SourceType.GTAG):
            a = _gtag_args(ev)
            if len(a) >= 2 and a[0] == "config" and isinstance(a[1], str):
                tid = a[1]
                if (vid == "ga4" and tid.startswith("G-")) or (vid == "google_ads" and tid.startswith("AW-")) \
                        or (vid == "floodlight" and tid.startswith("DC-")):
                    (placeholders if is_placeholder_id(tid) else ids).add(tid)
                    methods.add("gtag_config_call")
        if vid == "meta_pixel":
            for ev in ctx.store.filter(source_type=SourceType.FBQ):
                a = ev.fbq_call or []
                if len(a) >= 2 and a[0] == "init" and isinstance(a[1], str) and a[1].isdigit():
                    ids.add(a[1])
        # only GA4 ids for GA4, GTM ids for GTM etc. (google_tag may hold several kinds)
        if vid == "ga4":
            ids = {i for i in ids if i.startswith("G-")}
        elif vid == "gtm":
            ids = {i for i in ids if i.startswith("GTM-")}
        if not methods:
            continue
        strong = {"network_collection_request", "script_loaded", "gtag_call", "gtag_config_call", "fbq_call",
                  "cmp_runtime_signal", "runtime_container_registry", "rendered_dom_script"}
        confidence = "high" if methods & strong else "medium"
        has_beacon_patterns = bool(v.beacon)
        if "network_collection_request" in methods:
            firing: Optional[bool] = True
        elif ctx.runtime_available and has_beacon_patterns:
            firing = False
        else:
            firing = None
        tags.append({
            "vendor_id": vid, "technology": v.name, "vendor": v.company, "category": v.category,
            "category_label": CATEGORIES.get(v.category, v.category),
            "ids": sorted(ids), "placeholder_ids_in_source": sorted(placeholders),
            "detection_methods": sorted(methods), "confidence": confidence,
            "observed_firing": firing,
            "observed_firing_note": (
                "Collection request to the vendor endpoint observed." if firing else
                ("No collection request to known vendor endpoints was observed during the observation window."
                 if firing is False else
                 ("Not applicable: this technology has no collection endpoint signature (loader/CMP)."
                  if not has_beacon_patterns else "Runtime not verified (no browser phase)."))),
            "collection_request_count": len(beacon_ids),
            "phases": sorted(phases), "pages": sorted(pages),
            "evidence_ids": [e.id for e in evs][:200],
            "docs": v.docs,
        })
    order = {"tag_manager": 0, "google_tag": 1, "analytics": 2, "advertising": 3, "session_replay": 4, "cdp": 5,
             "experimentation": 6, "marketing_automation": 7, "cmp": 8}
    tags.sort(key=lambda t: (order.get(t["category"], 9), t["technology"]))
    return tags


# ═══════════════════════════════════════════════════════════════════════════
# IMPLEMENTATION (GTM / GA4 / Meta duplicates, order, placeholders)
# ═══════════════════════════════════════════════════════════════════════════
def analyze_implementation(ctx: AnalysisContext, tags: List[Dict[str, Any]], out: FindingList) -> None:
    store = ctx.store
    # GTM container loaded more than once on same page/phase
    # (network requests OR rendered-DOM script elements; Chromium may coalesce identical fetches)
    loads: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    dom_loads: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    for ev in store.all():
        if ev.source_type in (SourceType.SCRIPT_URL, SourceType.RENDERED_DOM) and "gtm" in _script_vendors(ev):
            target = loads if ev.source_type == SourceType.SCRIPT_URL else dom_loads
            for cid in (ev.parsed or {}).get("ids") or []:
                if cid.startswith("GTM-"):
                    target[(ev.page_url, ev.phase.value, cid)].append(ev.id)
    for k, ids in dom_loads.items():
        if len(ids) > len(loads.get(k, [])):
            loads[k] = loads.get(k, []) + ids
    for (page, phase, cid), ids in loads.items():
        n = max(len([i for i in ids if store.get(i).source_type == SourceType.SCRIPT_URL]),
                len([i for i in ids if store.get(i).source_type == SourceType.RENDERED_DOM]))
        if n > 1 and phase == "baseline":
            out.add(Finding("GTM_CONTAINER_LOADED_MULTIPLE_TIMES", f"GTM container {cid} loaded {n} times",
                            f"The same Google Tag Manager container ({cid}) was injected/requested {n} times during a single "
                            "page load (network requests and/or script elements in the rendered DOM). Duplicate containers "
                            "can double-fire every tag inside them.",
                            "implementation", "OBSERVED", "medium", "high", ids, [page], vendor="gtm",
                            recommendation="Keep exactly one GTM snippet per container per page (check theme, plugins and hard-coded snippets).",
                            how_to_verify="Open DevTools > Network, filter 'gtm.js', reload and count requests for this ID.", data={"container": cid, "times": n}))
    # GTM snippet duplicated in HTML source
    src_snips: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    for ev in store.filter(source_type=SourceType.HTML_SOURCE):
        p = ev.parsed or {}
        if ev.vendor_hint == "gtm":
            for cid in p.get("ids") or []:
                if cid.startswith("GTM-") and p.get("kind") != "script_tag":
                    src_snips[(ev.page_url, cid)].append(ev.id)
    for (page, cid), ids in src_snips.items():
        # a standard install has 1 script snippet + 1 noscript iframe => >2 signatures suggests duplication
        if len(ids) > 2:
            out.add(Finding("GTM_SNIPPET_REPEATED_IN_SOURCE", f"GTM {cid} snippet appears {len(ids)} times in HTML source",
                            "The HTML source contains more GTM signatures for this container than a standard install "
                            "(one script + one noscript). Runtime duplication is only confirmed if the container is "
                            "requested more than once.", "implementation", "INFERRED", "low", "medium", ids, [page],
                            vendor="gtm", data={"ids": [cid]}))
    for t in tags:
        if t["vendor_id"] == "gtm" and len(t["ids"]) > 1:
            out.add(Finding("GTM_MULTIPLE_CONTAINERS", f"{len(t['ids'])} GTM containers observed",
                            f"Containers observed: {', '.join(t['ids'])}. Multiple containers are valid but increase the "
                            "risk of duplicate tags and conflicting consent configuration.", "implementation",
                            "OBSERVED", "info", t["confidence"], t["evidence_ids"][:50], t["pages"], vendor="gtm", data={"ids": t["ids"]}))
        if t["vendor_id"] == "ga4" and len(t["ids"]) > 1:
            out.add(Finding("GA4_MULTIPLE_MEASUREMENT_IDS", f"{len(t['ids'])} GA4 measurement IDs observed",
                            f"Measurement IDs: {', '.join(t['ids'])}. Can be intentional (roll-up properties) or a "
                            "leftover/duplicate configuration.", "implementation", "OBSERVED", "info", t["confidence"],
                            t["evidence_ids"][:50], t["pages"], vendor="ga4", data={"ids": t["ids"]}))
        if t["placeholder_ids_in_source"]:
            out.add(Finding("PLACEHOLDER_TAG_ID", f"Placeholder ID in {t['technology']} code",
                            f"Placeholder identifiers found: {', '.join(t['placeholder_ids_in_source'])}. Template code "
                            "was likely published without a real ID.", "implementation", "OBSERVED", "low", "medium",
                            t["evidence_ids"][:20], t["pages"], vendor=t["vendor_id"], data={"ids": t["placeholder_ids_in_source"], "technology": t["technology"]}))
        if t["vendor_id"] == "universal_analytics":
            out.add(Finding("UNIVERSAL_ANALYTICS_LEGACY", "Universal Analytics (legacy) code present",
                            "Universal Analytics stopped processing data (standard properties on 1 July 2023). "
                            "Requests to it no longer produce reports.", "implementation", "OBSERVED", "medium",
                            t["confidence"], t["evidence_ids"][:20], t["pages"], vendor="universal_analytics",
                            recommendation="Remove analytics.js / ga() calls and rely on GA4."))
        if t["vendor_id"] == "ga4" and ctx.runtime_available and t["observed_firing"] is False:
            accept_done = ctx.interactions.get("accept", {}).get("status") == "performed"
            cmp_present = any(x["category"] == "cmp" for x in tags)
            sev = "medium" if (accept_done or not cmp_present) else "needs_manual_review"
            out.add(Finding("GA4_CONFIGURED_NO_COLLECTION_OBSERVED", "GA4 configured but no collection request observed",
                            "GA4 configuration code/script was observed but no request to a GA4 collection endpoint "
                            "(/g/collect) was seen during the observation window"
                            + (" — including after the scanner accepted consent." if accept_done else
                               ". If a CMP blocks GA4 until consent, this can be expected."),
                            "implementation", "NOT_OBSERVED", sev, "medium", t["evidence_ids"][:20], t["pages"],
                            vendor="ga4", how_to_verify="Use GA4 DebugView / Tag Assistant and check /g/collect requests."))

    # GA4 duplicate page_view (same tid, same page_location, same page load)
    # Hits with different consent states (gcs) or on different sides of the consent click are NOT duplicates:
    # Consent Mode legitimately re-sends page_view after a consent update (observed on real sites).
    pv: Dict[Tuple[str, str, str, str, str, str], List[str]] = defaultdict(list)
    for ev in store.filter(source_type=SourceType.NETWORK):
        for ge in _ga4_events(ev):
            if ge.get("en") == "page_view":
                pv[(ev.page_url, ev.phase.value, ge.get("tid") or "?", ge.get("page_location") or "",
                    ge.get("gcs") or "", str(ev.after_interaction))].append(ev.id)
    for (page, phase, tid, loc, _gcs, _side), ids in pv.items():
        if len(ids) > 1 and phase in ("baseline", "accept"):
            out.add(Finding("GA4_DUPLICATE_PAGE_VIEW", f"GA4 page_view sent {len(ids)} times for {tid}",
                            f"{len(ids)} page_view hits were sent to {tid} for the same page location in one page load "
                            f"({phase} phase). This inflates page views and sessions metrics.", "implementation",
                            "OBSERVED", "medium", "high", ids, [page], vendor="ga4",
                            recommendation="Check for both a GA4 config tag and a manual page_view event, or duplicated Google tag installs.",
                            data={"tid": tid, "times": len(ids), "phase": phase}))

    # Meta duplicate init / PageView
    inits: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    for ev in store.filter(source_type=SourceType.FBQ):
        a = ev.fbq_call or []
        if len(a) >= 2 and a[0] == "init":
            inits[(ev.page_url, ev.phase.value, str(a[1]))].append(ev.id)
    for (page, phase, pid), ids in inits.items():
        if len(ids) > 1 and phase == "baseline":
            out.add(Finding("META_PIXEL_DUPLICATE_INIT", f"Meta Pixel {pid} initialized {len(ids)} times",
                            "fbq('init') was called more than once for the same pixel ID in one page load.",
                            "implementation", "OBSERVED", "medium", "high", ids, [page], vendor="meta_pixel", data={"pixel": pid, "times": len(ids)}))
    mpv: Dict[Tuple[str, str, str, str], List[str]] = defaultdict(list)
    for ev in store.filter(source_type=SourceType.NETWORK):
        m = (ev.parsed or {}).get("meta")
        if m and m.get("event") == "PageView":
            mpv[(ev.page_url, ev.phase.value, str(m.get("pixel_id")), "PageView")].append(ev.id)
    for (page, phase, pid, _e), ids in mpv.items():
        if len(ids) > 1 and phase == "baseline":
            out.add(Finding("META_PIXEL_DUPLICATE_PAGEVIEW", f"Meta PageView sent {len(ids)} times for pixel {pid}",
                            "More than one PageView collection request for the same pixel was observed in one page load.",
                            "implementation", "OBSERVED", "medium", "high", ids, [page], vendor="meta_pixel", data={"pixel": pid, "times": len(ids)}))

    # dataLayer reassigned after GTM snippet (source order — inferred)
    for page in ctx.pages:
        gtm_pos = [ (e.parsed or {}).get("position", 0) for e in store.filter(source_type=SourceType.HTML_SOURCE, vendor="gtm", page_url=page)
                    if (e.parsed or {}).get("kind") != "script_tag"]
        if not gtm_pos:
            continue
        first_gtm = min(gtm_pos)
        reassign = [e for e in store.filter(source_type=SourceType.HTML_SOURCE, page_url=page)
                    if (e.parsed or {}).get("signature") == "__dl_reassign__" and (e.parsed or {}).get("position", 0) > first_gtm]
        if reassign:
            out.add(Finding("DATALAYER_REASSIGNED_AFTER_GTM", "dataLayer re-assigned after GTM snippet (source order)",
                            "`dataLayer = [...]` appears after the GTM snippet in HTML source. If executed after GTM loads, "
                            "it replaces the array GTM is listening to and later pushes may be ignored. Source order alone "
                            "does not prove the runtime effect.", "implementation", "INFERRED", "low", "medium",
                            [e.id for e in reassign], [page], vendor="gtm",
                            recommendation="Use `window.dataLayer = window.dataLayer || [];` before pushing."))


# ═══════════════════════════════════════════════════════════════════════════
# CONSENT
# ═══════════════════════════════════════════════════════════════════════════
def analyze_consent(ctx: AnalysisContext, tags: List[Dict[str, Any]], out: FindingList) -> Dict[str, Any]:
    store = ctx.store
    home = ctx.home_url
    cmp_tags = [t for t in tags if t["category"] == "cmp"]
    cmp_ev = [e for e in store.filter(source_type=SourceType.CMP, page_url=home)
              if (e.cmp_signal or {}).get("detected_adapters") or (e.cmp_signal or {}).get("banner_visible_selector")]
    cmp_observed = bool(cmp_tags or cmp_ev)
    banner_baseline = [e for e in cmp_ev if e.phase == Phase.BASELINE and (e.cmp_signal or {}).get("banner_visible_selector")]

    def tracking_beacons(phase: Phase, after: Optional[bool] = None) -> List[Evidence]:
        res = []
        for ev in store.filter(source_type=SourceType.NETWORK, phase=phase, page_url=home):
            vids = [v for v in _beacon_vendors(ev) if BY_ID[v].category in TRACKING_CATEGORIES]
            if not vids:
                continue
            if after is not None and ev.after_interaction is not after:
                continue
            res.append(ev)
        return res

    summary: Dict[str, Any] = {
        "cmp_observed": cmp_observed if ctx.runtime_available or cmp_tags else None,
        "cmp_vendors": sorted({t["technology"] for t in cmp_tags}),
        "banner_visible_in_baseline": bool(banner_baseline) if ctx.runtime_available else None,
        "phases": {p: {"status": ctx.phase_status.get(p, "not_run")} for p in ("baseline", "reject", "accept")},
        "consent_mode": None,
    }
    for a in ("reject", "accept"):
        if a in ctx.interactions:
            summary["phases"][a]["interaction"] = ctx.interactions[a]

    if not ctx.runtime_available:
        out.add(Finding("CONSENT_BEHAVIOR_UNVERIFIED", "Consent behavior not verified",
                        "The browser phases did not run, so network requests, cookies and consent interactions were "
                        "not observed. No claim is made about tracking before or after consent.", "consent",
                        "UNVERIFIABLE", "needs_manual_review", "high", [], [home]))
    else:
        base = tracking_beacons(Phase.BASELINE)
        base_real = [e for e in base if not _is_denied_ping(e)]
        base_denied = [e for e in base if _is_denied_ping(e)]
        vendors_real = sorted({BY_ID[v].name for e in base_real for v in _beacon_vendors(e) if BY_ID[v].category in TRACKING_CATEGORIES})
        summary["baseline_tracking_requests"] = len(base_real)
        if cmp_observed and base_real:
            out.add(Finding("TRACKING_BEFORE_CONSENT_INTERACTION",
                            "Tracking requests observed before any consent interaction",
                            f"With a CMP present{' and its banner visible' if banner_baseline else ''}, the browser sent "
                            f"{len(base_real)} collection request(s) to tracking vendors ({', '.join(vendors_real)}) "
                            "before any click on the consent banner (fresh context, no interaction).",
                            "consent", "OBSERVED", "high", "high", [e.id for e in base_real][:60], [home],
                            recommendation="Block non-essential tags until consent (CMP blocking / GTM consent checks / Consent Mode).",
                            how_to_verify="Open the site in a private window, do not interact, and inspect Network for the listed endpoints.",
                            legal_context=LC_CONSENT, data={"requests": len(base_real), "vendors": vendors_real}))
        elif not cmp_observed and base_real:
            out.add(Finding("TRACKING_WITHOUT_OBSERVED_CMP", "Tracking observed and no CMP observed in this scan",
                            f"{len(base_real)} collection request(s) to tracking vendors ({', '.join(vendors_real)}) were "
                            "observed and no consent management platform was observed. This is not proof of a violation: "
                            "the controller may rely on another legal basis, use a CMP not recognized by the scanner, or "
                            "display the banner only in certain regions.", "consent", "OBSERVED", "needs_manual_review",
                            "high", [e.id for e in base_real][:60], [home], legal_context=LC_CONSENT,
                            data={"requests": len(base_real), "vendors": vendors_real}))
        if base_denied:
            out.add(Finding("CONSENT_MODE_DENIED_PINGS", "Google cookieless pings with consent denied observed",
                            f"{len(base_denied)} Google request(s) carried gcs=G100 (ad_storage and analytics_storage "
                            "denied), consistent with Consent Mode 'advanced' behavior before consent.", "consent",
                            "OBSERVED", "info", "high", [e.id for e in base_denied][:40], [home],
                            legal_context=LegalContext(
                                "Whether cookieless pings before consent are acceptable depends on the controller's "
                                "legal analysis; regulators have not uniformly endorsed them.", ["LGPD", "GDPR"]), data={"n": len(base_denied)}))
        if not cmp_observed:
            out.add(Finding("CMP_NOT_OBSERVED", "No consent management platform observed",
                            "No known CMP script/global and no consent banner button were observed on the home page in "
                            "this scan. Banners can be geo-targeted (the scanner's location may not trigger them) or use "
                            "unrecognized implementations.", "consent", "NOT_OBSERVED", "info", "medium", [], [home]))

        # REJECT / ACCEPT phases
        for action in ("reject", "accept"):
            it = ctx.interactions.get(action)
            if it is None:
                continue
            st = it.get("status")
            ph = Phase.REJECT if action == "reject" else Phase.ACCEPT
            ev_int = [e.id for e in store.filter(source_type=SourceType.CMP, phase=ph, page_url=home)
                      if (e.cmp_signal or {}).get("interaction")]
            if st == "manual_verification_required":
                out.add(Finding(f"CONSENT_{action.upper()}_MANUAL_VERIFICATION",
                                f"'{action.capitalize()} all' could not be performed automatically",
                                it.get("detail") or "Manual verification required.", "consent", "UNVERIFIABLE",
                                "needs_manual_review", "high", ev_int, [home]))
                continue
            if st != "performed":
                continue
            after = tracking_beacons(ph, after=True)
            ambiguous = [e for e in tracking_beacons(ph) if e.after_interaction is None]
            if action == "reject":
                real = [e for e in after if not _is_denied_ping(e)]
                vendors = sorted({BY_ID[v].name for e in real for v in _beacon_vendors(e) if BY_ID[v].category in TRACKING_CATEGORIES})
                ads = any(BY_ID[v].category == "advertising" for e in real for v in _beacon_vendors(e))
                if real:
                    out.add(Finding("TRACKING_AFTER_REJECT", "Tracking requests observed after 'reject all'",
                                    f"After the scanner clicked reject ({it.get('method')}, verified by "
                                    f"{', '.join(it.get('verified_by') or [])}), {len(real)} collection request(s) to "
                                    f"tracking vendors were observed: {', '.join(vendors)}.", "consent", "OBSERVED",
                                    "critical" if ads else "high", "high", ev_int + [e.id for e in real][:60], [home],
                                    recommendation="Ensure tags respect the CMP's rejection (blocking rules/consent checks) and that Consent Mode updates to denied.",
                                    legal_context=LC_CONSENT, data={"requests": len(real), "vendors": vendors}))
                # cookies set after reject
                before = {(e.cookie_name, e.cookie_domain) for e in store.filter(source_type=SourceType.COOKIE, phase=ph, page_url=home)
                          if (e.cookie_attributes or {}).get("stage") == "before_interaction"}
                end = [e for e in store.filter(source_type=SourceType.COOKIE, phase=ph, page_url=home)
                       if (e.cookie_attributes or {}).get("stage") == "end"]
                new_tracking = [e for e in end if (e.cookie_name, e.cookie_domain) not in before
                                and TRACKING_COOKIE_RE.match(e.cookie_name or "")]
                if new_tracking:
                    out.add(Finding("TRACKING_COOKIES_SET_AFTER_REJECT", "Tracking cookies set after 'reject all'",
                                    f"{len(new_tracking)} cookie(s) with names of known tracking technologies appeared only "
                                    f"after the reject click: {', '.join(sorted({e.cookie_name for e in new_tracking}))}. "
                                    "Cookie values were not stored.", "consent", "OBSERVED", "high", "high",
                                    ev_int + [e.id for e in new_tracking], [home], legal_context=LC_CONSENT, data={"cookies": sorted({e.cookie_name for e in new_tracking})}))
                if not real and not new_tracking:
                    out.add(Finding("NO_TRACKING_OBSERVED_AFTER_REJECT", "No tracking observed after 'reject all'",
                                    "After a verified reject interaction, no collection requests to known tracking endpoints "
                                    "and no new known tracking cookies were observed during the observation window.",
                                    "consent", "NOT_OBSERVED", "info", "medium", ev_int, [home],
                                    limitations=["Observation window is a few seconds on one page; later navigation was not observed."]))
                if ambiguous:
                    out.add(Finding("REJECT_TIMING_AMBIGUOUS", "Some requests overlapped the reject click",
                                    f"{len(ambiguous)} tracking request(s) were captured during the click round-trip; "
                                    "they are not attributed to before or after the interaction.", "consent", "INFERRED",
                                    "info", "low", [e.id for e in ambiguous][:20], [home], data={"n": len(ambiguous)}))
            else:
                vendors = sorted({BY_ID[v].name for e in after for v in _beacon_vendors(e) if BY_ID[v].category in TRACKING_CATEGORIES})
                base_v = {v for e in tracking_beacons(Phase.BASELINE) for v in _beacon_vendors(e)}
                newly = sorted({BY_ID[v].name for e in after for v in _beacon_vendors(e)
                                if v not in base_v and BY_ID[v].category in TRACKING_CATEGORIES})
                out.add(Finding("TRACKING_AFTER_ACCEPT", "Tracking behavior after 'accept all'",
                                (f"After accepting, collection requests were observed for: {', '.join(vendors)}." if vendors
                                 else "After accepting, no collection requests to known tracking endpoints were observed.")
                                + (f" Vendors that only appeared after acceptance (consistent with consent gating): {', '.join(newly)}." if newly else ""),
                                "consent", "OBSERVED" if after else "NOT_OBSERVED", "info", "high",
                                ev_int + [e.id for e in after][:40], [home], data={"vendors": vendors, "only_after_accept": newly}))

    # Script order in HTML source (INFERRED only)
    src = sorted(store.filter(source_type=SourceType.HTML_SOURCE, page_url=home), key=lambda e: (e.parsed or {}).get("position", 0))
    cmp_positions = [(e.parsed or {}).get("position", 0) for e in src if e.vendor_hint and BY_ID.get(e.vendor_hint) and BY_ID[e.vendor_hint].category == "cmp"]
    if cmp_positions:
        first_cmp = min(cmp_positions)
        before = [e for e in src if (e.parsed or {}).get("kind") == "script_tag" and e.vendor_hint
                  and BY_ID.get(e.vendor_hint) and BY_ID[e.vendor_hint].category in TRACKING_CATEGORIES
                  and (e.parsed or {}).get("position", 0) < first_cmp]
        if before:
            out.add(Finding("SCRIPT_BEFORE_CMP_IN_SOURCE", "Tracking script appears before the CMP in HTML source",
                            "Script tags for tracking vendors appear before the CMP script in the HTML source. Source order "
                            "alone does NOT prove the tag executed or sent data before consent — see the runtime findings "
                            "for observed network behavior.", "consent", "INFERRED", "low", "medium",
                            [e.id for e in before], [home]))

    summary["consent_mode"] = _consent_mode(ctx, tags, out)
    return summary


def _consent_mode(ctx: AnalysisContext, tags: List[Dict[str, Any]], out: FindingList) -> Dict[str, Any]:
    store, home = ctx.store, ctx.home_url
    google = any(t["vendor_id"] in ("gtm", "google_tag", "ga4", "google_ads", "floodlight") for t in tags)
    res: Dict[str, Any] = {"observed": None, "default": None, "updates": [], "gcs_values": {}, "v2_signals": None}
    if not google:
        res["observed"] = None
        res["note"] = "No Google tags observed; Consent Mode not applicable."
        return res
    if not ctx.runtime_available:
        res["note"] = "Runtime not verified; Consent Mode state unknown."
        return res
    base = sorted([e for e in store.filter(source_type=SourceType.GTAG, phase=Phase.BASELINE, page_url=home)],
                  key=lambda e: (e.parsed or {}).get("dl_index", 0))
    defaults = [e for e in base if len(_gtag_args(e)) >= 3 and _gtag_args(e)[0] == "consent" and _gtag_args(e)[1] == "default"]
    first_tag = [e for e in base if len(_gtag_args(e)) >= 2 and _gtag_args(e)[0] in ("config", "event")]
    gcs: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ph in (Phase.BASELINE, Phase.REJECT, Phase.ACCEPT):
        for ev in store.filter(source_type=SourceType.NETWORK, phase=ph, page_url=home):
            for ge in _ga4_events(ev):
                if ge.get("gcs"):
                    gcs[ph.value][ge["gcs"]] += 1
    res["gcs_values"] = {k: dict(v) for k, v in gcs.items()}
    ics = [e for e in store.filter(source_type=SourceType.CONSENT_MODE, phase=Phase.BASELINE, page_url=home)]
    res["observed"] = bool(defaults or gcs or ics)
    if defaults:
        d = defaults[0]
        state = _gtag_args(d)[2] if isinstance(_gtag_args(d)[2], dict) else {}
        res["default"] = {k: state.get(k) for k in state}
        v2 = all(k in state for k in ("ad_user_data", "ad_personalization"))
        res["v2_signals"] = v2
        if first_tag and (first_tag[0].parsed or {}).get("dl_index", 0) < (d.parsed or {}).get("dl_index", 0):
            out.add(Finding("CONSENT_MODE_DEFAULT_AFTER_TAG", "Consent Mode default set after a Google tag command",
                            "gtag('consent','default',…) was pushed to the dataLayer after a gtag('config'/'event') "
                            "command. Google requires the default to be set before any tag fires, otherwise early hits "
                            "may not respect the default state.", "consent", "OBSERVED", "high", "high",
                            [first_tag[0].id, d.id] + [e.id for e in ics], [home],
                            recommendation="Move the consent default command above the Google tag / GTM snippet."))
        if not v2:
            out.add(Finding("CONSENT_MODE_V2_SIGNALS_MISSING", "Consent Mode default lacks v2 signals",
                            "The default command does not set ad_user_data and ad_personalization (Consent Mode v2).",
                            "consent", "OBSERVED", "low", "high", [d.id], [home]))
        granted = [k for k in ("ad_storage", "analytics_storage", "ad_user_data", "ad_personalization") if state.get(k) == "granted"]
        if granted:
            region = state.get("region")
            out.add(Finding("CONSENT_MODE_DEFAULT_GRANTED", "Consent Mode default grants storage before interaction",
                            f"Default state grants: {', '.join(granted)}"
                            + (f" (region-scoped: {region})." if region else ".")
                            + " Requires review of whether this matches the consent strategy for the audience.",
                            "consent", "OBSERVED", "needs_manual_review", "high", [d.id], [home], legal_context=LC_CONSENT, data={"granted": granted}))
    for e in ics:
        if (e.consent_state or {}).get("wasSetLate"):
            out.add(Finding("CONSENT_MODE_SET_LATE_FLAG", "Google tag reports consent was set late",
                            "window.google_tag_data.ics.wasSetLate is true: Google's tag itself flagged that consent "
                            "state was set after tags started.", "consent", "OBSERVED", "medium", "high", [e.id], [home]))
    if not res["observed"]:
        out.add(Finding("CONSENT_MODE_NOT_OBSERVED", "Google Consent Mode not observed",
                        "Google tags were observed but no consent default command, no gcs parameter in GA4 hits and no "
                        "consent state object were observed in the baseline phase.", "consent", "NOT_OBSERVED", "low",
                        "medium", [], [home],
                        limitations=["Consent Mode may be configured server-side or only in some regions."]))
    rej = gcs.get("reject", {})
    if ctx.interactions.get("reject", {}).get("status") == "performed" and any(k in ("G111", "G101", "G110") for k in rej):
        ids = [ev.id for ev in store.filter(source_type=SourceType.NETWORK, phase=Phase.REJECT, page_url=home)
               if ev.after_interaction and any(ge.get("gcs") in ("G111", "G101", "G110") for ge in _ga4_events(ev))]
        if ids:
            out.add(Finding("CONSENT_MODE_GRANTED_AFTER_REJECT", "GA4 hits report granted storage after 'reject all'",
                            "GA4 requests after the reject click carried a gcs value indicating granted storage.",
                            "consent", "OBSERVED", "high", "high", ids[:30], [home], legal_context=LC_CONSENT))
    return res


# ═══════════════════════════════════════════════════════════════════════════
# EVENTS
# ═══════════════════════════════════════════════════════════════════════════
_CODE_EVENT_RES = [
    re.compile(r"gtag\s*\(\s*['\"]event['\"]\s*,\s*['\"]([A-Za-z0-9_]{2,40})['\"]"),
    re.compile(r"dataLayer\.push\s*\(\s*\{[^{}]{0,300}?['\"]?event['\"]?\s*:\s*['\"]([A-Za-z0-9_.\-]{2,40})['\"]", re.S),
    re.compile(r"fbq\s*\(\s*['\"](?:track|trackCustom)['\"]\s*,\s*['\"]([A-Za-z0-9_]{2,40})['\"]"),
]
_GTM_INTERNAL = re.compile(r"^gtm\.|^gtag\.|^optimize\.|^consent_|^cookie_consent")


def analyze_events(ctx: AnalysisContext, out: FindingList, html_by_page: Dict[str, str]) -> Dict[str, Any]:
    store = ctx.store
    agg: Dict[str, Dict[str, Any]] = {}

    def entry(name: str) -> Dict[str, Any]:
        return agg.setdefault(name, {"name": name, "sources": defaultdict(int), "evidence_ids": [], "pages": set(),
                                     "measurement_ids": set(), "validation": [], "recommended": name in GA4_RECOMMENDED})

    # network GA4 hits — the only proof the event was SENT to GA4
    tx_seen: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    for ev in store.filter(source_type=SourceType.NETWORK):
        for ge in _ga4_events(ev):
            name = ge.get("en")
            e = entry(name)
            e["sources"]["ga4_network_hit"] += 1
            e["evidence_ids"].append(ev.id)
            e["pages"].add(ev.page_url)
            if ge.get("tid"):
                e["measurement_ids"].add(ge["tid"])
            missing = validate_event(name, ge.get("params") or {}, ge.get("items") or [])
            if missing:
                e["validation"].append({"evidence_id": ev.id, "source": "ga4_network_hit", "missing": missing})
            if name == "purchase" and (ge.get("params") or {}).get("transaction_id"):
                tx_seen[(ev.page_url, (ge["params"]["transaction_id"]))].append(ev.id)
        m = (ev.parsed or {}).get("meta")
        if m and m.get("event"):
            e = entry(f"meta:{m['event']}")
            e["sources"]["meta_network_hit"] += 1
            e["evidence_ids"].append(ev.id)
            e["pages"].add(ev.page_url)

    for ev in store.filter(source_type=SourceType.GTAG):
        a = _gtag_args(ev)
        if len(a) >= 2 and a[0] == "event" and isinstance(a[1], str):
            e = entry(a[1])
            e["sources"]["gtag_call"] += 1
            e["evidence_ids"].append(ev.id)
            e["pages"].add(ev.page_url)
            params = a[2] if len(a) >= 3 and isinstance(a[2], dict) else {}
            missing = validate_event(a[1], params, params.get("items") if isinstance(params.get("items"), list) else [])
            if missing:
                e["validation"].append({"evidence_id": ev.id, "source": "gtag_call", "missing": missing})
    for ev in store.filter(source_type=SourceType.DATALAYER):
        d = ev.datalayer_event
        if isinstance(d, dict) and isinstance(d.get("event"), str) and not _GTM_INTERNAL.match(d["event"]):
            name = d["event"]
            e = entry(name)
            e["sources"]["datalayer_push"] += 1
            e["evidence_ids"].append(ev.id)
            e["pages"].add(ev.page_url)
            ecom = d.get("ecommerce") if isinstance(d.get("ecommerce"), dict) else None
            if ecom is not None and name in GA4_RECOMMENDED:
                missing = validate_event(name, ecom, ecom.get("items") if isinstance(ecom.get("items"), list) else [])
                if missing:
                    e["validation"].append({"evidence_id": ev.id, "source": "datalayer_push", "missing": missing})
            if ecom is not None and any(k in ecom for k in ("purchase", "detail", "add", "checkout", "impressions")):
                e["legacy_ua_ecommerce_schema"] = True
    for ev in store.filter(source_type=SourceType.FBQ):
        a = ev.fbq_call or []
        if len(a) >= 2 and a[0] in ("track", "trackCustom") and isinstance(a[1], str):
            e = entry(f"meta:{a[1]}")
            e["sources"]["fbq_call"] += 1
            e["evidence_ids"].append(ev.id)
            e["pages"].add(ev.page_url)

    # static code candidates (never counted as observed)
    candidates: Dict[str, Dict[str, Any]] = {}
    for page, html in html_by_page.items():
        for rx in _CODE_EVENT_RES:
            for m in rx.finditer(html or ""):
                nm = m.group(1)
                if rx.pattern.startswith("fbq"):
                    nm = f"meta:{nm}"
                if _GTM_INTERNAL.match(nm):
                    continue
                c = candidates.setdefault(nm, {"name": nm, "pages": set(), "lines": []})
                c["pages"].add(page)
                if len(c["lines"]) < 5:
                    c["lines"].append(html.count("\n", 0, m.start()) + 1)

    events_out = []
    for name, e in agg.items():
        runtime = sum(e["sources"].values()) > 0
        events_out.append({
            "name": name, "recommended_ga4_event": e["recommended"],
            "sent_to_ga4": e["sources"].get("ga4_network_hit", 0) > 0,
            "sources": dict(e["sources"]), "measurement_ids": sorted(e["measurement_ids"]),
            "status": "OBSERVED" if runtime else "INFERRED",
            "validation_issues": e["validation"], "evidence_ids": e["evidence_ids"][:100],
            "pages": sorted(e["pages"]), "legacy_ua_ecommerce_schema": e.get("legacy_ua_ecommerce_schema", False),
            "note": (None if e["sources"].get("ga4_network_hit") else
                     "Observed in browser runtime (dataLayer/gtag/fbq) but no GA4 collection hit for this event was observed."
                     if not name.startswith("meta:") else None),
        })
        for v in e["validation"]:
            out.add(Finding("EVENT_MISSING_REQUIRED_PARAMS", f"'{name}' observed without required parameters",
                            f"Observed via {v['source'].replace('_', ' ')}; missing: {', '.join(v['missing'])}. "
                            "Requirements per the GA4 recommended events reference.", "events", "OBSERVED", "medium",
                            "high", [v["evidence_id"]], sorted(e["pages"]), vendor="ga4",
                            recommendation=f"Send the required parameters for '{name}' (see {GA4_EVENTS_DOC}).",
                            data={"event": name, "missing": v["missing"], "source": v["source"]}))
    for (page, tx), ids in tx_seen.items():
        if len(ids) > 1:
            out.add(Finding("GA4_DUPLICATE_PURCHASE", "Same transaction_id sent more than once",
                            f"{len(ids)} purchase hits with the same transaction_id were observed on one page.",
                            "events", "OBSERVED", "high", "high", ids, [page], vendor="ga4", data={"times": len(ids)}))
    code_only = []
    for nm, c in candidates.items():
        if nm in agg:
            continue
        code_only.append({"name": nm, "status": "INFERRED", "pages": sorted(c["pages"]), "html_lines": c["lines"],
                          "note": "implementation candidate detected; runtime firing not confirmed"})
    if code_only:
        out.add(Finding("EVENT_CODE_CANDIDATES_NOT_FIRED", f"{len(code_only)} event(s) present only in source code",
                        "Event names were found in page code but were not observed firing during the scan: "
                        + ", ".join(sorted(x["name"] for x in code_only)[:20])
                        + ". Implementation candidate detected; runtime firing not confirmed (they may require user "
                          "actions such as add-to-cart or checkout).", "events", "INFERRED", "info", "medium", [],
                        sorted({p for x in code_only for p in x["pages"]}), data={"events": sorted(x["name"] for x in code_only)}))
    events_out.sort(key=lambda x: (not x["sent_to_ga4"], x["name"]))
    return {"events": events_out, "code_candidates": sorted(code_only, key=lambda x: x["name"])}


# ═══════════════════════════════════════════════════════════════════════════
# PRIVACY / PII
# ═══════════════════════════════════════════════════════════════════════════
_VALUE_KINDS = {"email", "phone", "cpf", "card"}


def analyze_privacy(ctx: AnalysisContext, out: FindingList) -> Dict[str, Any]:
    hits = [h for h in ctx.pii_hits if h.get("location") not in ("html", "console")]
    groups: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    for h in hits:
        groups[(h["classification"], h["kind"], h.get("source_type") or "")].append(h)

    observed_values = []
    key_patterns = []
    for (cls, kind, stype), hs in groups.items():
        ev_ids = sorted({h["evidence_id"] for h in hs})
        pages = sorted({h["page_url"] for h in hs})
        domains = sorted({h.get("domain") or "" for h in hs if h.get("domain")})
        keys = sorted({h.get("key") or "(free text)" for h in hs})
        if cls == "OBSERVED_PII_VALUE" and kind in _VALUE_KINDS:
            third = [h for h in hs if h.get("third_party") and stype in ("network", "script_url")]
            if third:
                tdom = sorted({h.get("domain") or "" for h in third})
                out.add(Finding("PII_VALUE_SENT_TO_THIRD_PARTY", f"{kind.upper()} value observed in requests to third parties",
                                f"A value matching a validated {kind} pattern was observed in {len(third)} request(s) to "
                                f"third-party domain(s): {', '.join(tdom)} (keys: {', '.join(sorted({h.get('key') or '(text)' for h in third}))}). "
                                "The value itself was redacted and never stored.", "privacy", "OBSERVED", "critical", "high",
                                sorted({h["evidence_id"] for h in third}), pages, legal_context=LC_PII,
                                recommendation="Remove personal data from URLs/payloads sent to analytics/ads vendors; use hashed, consented user-provided-data features where appropriate.",
                                data={"kind": kind, "domains": tdom}))
            elif stype in ("datalayer", "gtag", "fbq"):
                out.add(Finding("PII_VALUE_IN_DATALAYER", f"{kind.upper()} value observed in dataLayer/tag calls",
                                f"A value matching a validated {kind} pattern was present in {stype} data (keys: "
                                f"{', '.join(keys)}). Any tag reading the dataLayer can forward it. Value redacted.",
                                "privacy", "OBSERVED", "high", "high", ev_ids, pages, legal_context=LC_PII, data={"kind": kind}))
            elif stype in ("local_storage", "session_storage", "cookie"):
                out.add(Finding("PII_VALUE_IN_BROWSER_STORAGE", f"{kind.upper()} value observed in {stype.replace('_', ' ')}",
                                f"A value matching a validated {kind} pattern is stored in {stype.replace('_', ' ')} "
                                f"(keys: {', '.join(keys)}). Readable by any script on the origin. Value redacted.",
                                "privacy", "OBSERVED", "medium", "high", ev_ids, pages, data={"kind": kind}))
            elif stype in ("network", "script_url", "navigation"):
                out.add(Finding("PII_VALUE_IN_FIRST_PARTY_URL", f"{kind.upper()} value observed in first-party request",
                                f"A value matching a validated {kind} pattern appeared in a first-party request URL/body. "
                                "URLs end up in logs, referrers and analytics page_location. Value redacted.",
                                "privacy", "OBSERVED", "medium", "high", ev_ids, pages, data={"kind": kind}))
            observed_values.append({"kind": kind, "source_type": stype, "count": len(hs), "evidence_ids": ev_ids,
                                    "domains": domains})
        elif cls == "OBSERVED_PII_VALUE" and kind == "hashed_identifier":
            out.add(Finding("HASHED_IDENTIFIER_SENT", "Hashed identifiers observed",
                            f"Hashed values under keys {', '.join(keys)} were observed (e.g. advanced matching). Hashing is "
                            "pseudonymization: the data generally remains personal data.", "privacy", "OBSERVED", "info",
                            "high", ev_ids, pages, data={"keys": keys, "domains": domains}))
        elif cls == "OBSERVED_PII_VALUE" and kind == "credential":
            out.add(Finding("CREDENTIAL_LIKE_PARAMETER", "Credential-like parameter observed",
                            f"Keys {', '.join(keys)} carrying non-empty values were observed in {stype}. Values redacted.",
                            "privacy", "OBSERVED", "high" if any(h.get("third_party") for h in hs) else "medium", "medium",
                            ev_ids, pages, data={"keys": keys, "domains": domains}))
        elif cls == "PII_KEY_PATTERN":
            key_patterns.append({"kind": kind, "keys": keys, "source_type": stype, "evidence_ids": ev_ids})
    if key_patterns:
        out.add(Finding("PII_KEY_PATTERN", "Keys that usually carry personal data were observed",
                        "Key names such as " + ", ".join(sorted({k for kp in key_patterns for k in kp['keys']})[:12])
                        + " were observed but their values did NOT match validated personal-data patterns (values withheld). "
                          "This is not evidence that personal data was transmitted.", "privacy", "INFERRED",
                        "needs_manual_review", "medium", sorted({i for kp in key_patterns for i in kp["evidence_ids"]})[:60],
                        [ctx.home_url], data={"key_patterns": key_patterns}))
    return {"observed_pii_values": observed_values, "pii_key_patterns": key_patterns,
            "note": "Raw values are never stored or displayed. Online identifiers (client IDs, cookie IDs) are expected and not reported as PII findings."}


# ═══════════════════════════════════════════════════════════════════════════
# POLICY LINKS
# ═══════════════════════════════════════════════════════════════════════════
def analyze_policy(ctx: AnalysisContext, out: FindingList, dom_available_pages: Iterable[str]) -> List[Dict[str, Any]]:
    links = []
    for ev in ctx.store.filter(source_type=SourceType.POLICY_LINK):
        links.append({"url": ev.request_url, "text": ev.snippet, "page": ev.page_url, "evidence_id": ev.id})
    pages_with = {l["page"] for l in links}
    if ctx.home_url in set(dom_available_pages) and ctx.home_url not in pages_with:
        out.add(Finding("POLICY_LINK_NOT_OBSERVED", "No privacy/cookie policy link observed on the home page",
                        "No anchor whose text or URL matches privacy/cookie-policy patterns was observed in the rendered "
                        "home page.", "policy", "NOT_OBSERVED", "low", "medium", [], [ctx.home_url],
                        limitations=["Links rendered as images, inside iframes or only after interaction are not detected."]))
    return links
