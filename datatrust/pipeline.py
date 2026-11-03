"""
The canonical audit pipeline. Every frontend mode (single scan, deep scan,
AI chat context, exports) consumes the report produced here.
"""
from __future__ import annotations

import logging
import re
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlsplit

from . import ENGINE_VERSION
from .analyzers import (TRACKING_COOKIE_RE, AnalysisContext, analyze_consent, analyze_events,
                        analyze_implementation, analyze_policy, analyze_privacy, analyze_tags)
from .catalog import BY_ID
from .collector import BrowserSession, CollectorOptions, PhaseCapture
from .crawler import select_pages
from .evidence import EvidenceStore, Phase, SourceType
from .findings import Finding, FindingList
from .normalize import Normalizer, registrable_domain
from .scoring import SCORING_VERSION, compute_scores
from .static_fetch import static_fetch
from .url_guard import RequestGuard, Resolver, UrlRejected, system_resolver, validate_url

log = logging.getLogger("datatrust.pipeline")

STATIC_ONLY_LIMITATION = "Runtime JavaScript, cookies and network behavior were not verified."
BASE_LIMITATIONS = [
    "Only publicly reachable pages were visited, without login; authenticated areas and post-login funnels are not observed.",
    "Server-side tracking (server-side GTM, Measurement Protocol, Conversions API) is invisible to a browser-based scanner.",
    "Internal configuration of GA4/GTM (unpublished workspaces, triggers, retention, custom dimensions) cannot be observed.",
    "Events that require user actions (add to cart, checkout, form submission) are only observed if they fire on page load.",
    "The scanner's IP/location may differ from your visitors'; geo-targeted banners or tags may behave differently.",
    "Observation windows are a few seconds per phase; tags that fire later or on scroll/click are not observed.",
    "Findings are technical observations, not legal conclusions.",
]
DISCLAIMER = ("DataTrust Audit reports only what was observed in this scan. Items marked INFERRED, NOT_OBSERVED or "
              "UNVERIFIABLE are not facts about the site. Nothing here is legal advice or a determination of "
              "non-compliance; no fines or damages are estimated.")


@dataclass
class ScanOptions:
    deep: bool = False
    max_pages: int = 5
    consent_phases: bool = True
    explain: bool = False
    total_budget_s: float = 170.0
    collector: CollectorOptions = field(default_factory=CollectorOptions)


class StageLog:
    def __init__(self, scan_id: str):
        self.scan_id = scan_id
        self.stages: List[Dict[str, Any]] = []

    def run(self, name: str, fn: Callable, *args, **kwargs):
        t = time.monotonic()
        entry: Dict[str, Any] = {"name": name, "status": "ok"}
        try:
            res = fn(*args, **kwargs)
            return res
        except Exception as exc:
            entry["status"] = "error"
            entry["error"] = f"{exc.__class__.__name__}: {str(exc)[:200]}"
            raise
        finally:
            entry["duration_ms"] = int((time.monotonic() - t) * 1000)
            self.stages.append(entry)
            log.info("scan=%s stage=%s status=%s ms=%s", self.scan_id, name, entry["status"], entry["duration_ms"])

    def note(self, name: str, status: str, duration_ms: int = 0, error: Optional[str] = None, **extra):
        e = {"name": name, "status": status, "duration_ms": duration_ms}
        if error:
            e["error"] = error
        e.update(extra)
        self.stages.append(e)
        log.info("scan=%s stage=%s status=%s", self.scan_id, name, status)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _failed(scan_id: str, input_url: str, status: str, code: str, message: str, stages: StageLog,
            started: float, detail: Optional[str] = None) -> Dict[str, Any]:
    return {
        "success": False, "scan_id": scan_id, "status": status, "error_code": code, "message": message,
        "detail": detail, "engine_version": ENGINE_VERSION, "scoring_version": SCORING_VERSION,
        "target": {"input_url": input_url}, "stages": stages.stages, "started_at": _now(),
        "duration_ms": int((time.monotonic() - started) * 1000),
        "tags": [], "findings": [], "evidence": [], "cookies": [], "storage": [], "pages": [],
        "events": {"events": [], "code_candidates": []},
        "scores": {"version": SCORING_VERSION, "overall": {"score": None, "null_reason": "Scan failed; nothing was measured."}, "axes": {}},
        "limitations": ["Scan failed — no observation was made. Nothing in this response describes the website."],
        "disclaimer": DISCLAIMER,
    }


_MESSAGES = {
    "INVALID_URL": "Please enter a valid public http(s) URL.",
    "BLOCKED_TARGET": "This address is not allowed (private, local or reserved network).",
    "DNS_FAILURE": "The domain could not be resolved.",
    "TIMEOUT": "The website did not respond in time.",
    "PROTOCOL_ERROR": "The connection failed at protocol/TLS level.",
    "BLOCKED": "The website refused or blocked the scanner.",
    "FETCH_FAILED": "The website could not be fetched.",
}


def _extract_static_links(html: str) -> List[Dict[str, str]]:
    out = []
    for m in re.finditer(r"<a\b[^>]*\bhref\s*=\s*(['\"])(.*?)\1[^>]*>(.*?)</a>", html or "", re.I | re.S):
        text = re.sub(r"<[^>]+>", " ", m.group(3))
        out.append({"href": m.group(2), "text": re.sub(r"\s+", " ", text).strip()[:80]})
        if len(out) >= 400:
            break
    return out


def run_scan(input_url: str, options: Optional[ScanOptions] = None, resolver: Resolver = system_resolver,
             scan_id: Optional[str] = None,
             browser_factory: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    opts = options or ScanOptions()
    scan_id = scan_id or str(uuid.uuid4())
    started = time.monotonic()
    started_at = _now()
    stages = StageLog(scan_id)

    # 1. URL validation + DNS/SSRF
    try:
        target = stages.run("url_validation_dns_ssrf", validate_url, input_url, resolver)
    except UrlRejected as exc:
        status = "blocked" if exc.code == "BLOCKED_TARGET" else "failed"
        return _failed(scan_id, input_url, status, exc.code, _MESSAGES.get(exc.code, exc.code), stages, started, exc.detail)

    # 2. pre-flight redirect chain with per-hop SSRF validation
    pre = stages.run("redirect_preflight", static_fetch, target.url, resolver)
    if not pre.ok and pre.error_code in ("BLOCKED_REDIRECT", "BLOCKED_TARGET"):
        return _failed(scan_id, input_url, "blocked", "BLOCKED_TARGET",
                       "The site redirected to a disallowed (private/reserved) address.", stages, started, pre.error)

    store = EvidenceStore()
    norm = Normalizer(store, target.host)
    guard = RequestGuard(resolver=resolver)
    home_url = target.url
    captures: Dict[str, PhaseCapture] = {}
    page_reports: List[Dict[str, Any]] = []
    runtime_available = False
    browser_error: Optional[str] = None
    limitations = list(BASE_LIMITATIONS)
    html_by_page: Dict[str, str] = {}
    dom_pages: List[str] = []

    def over_budget() -> bool:
        return (time.monotonic() - started) > opts.total_budget_s

    factory = browser_factory or (lambda: BrowserSession(target, guard, opts.collector))
    try:
        t_launch = time.monotonic()
        session = factory()
        session.__enter__()
        stages.note("browser_launch", "ok", int((time.monotonic() - t_launch) * 1000))
    except Exception as exc:
        session = None
        browser_error = f"{exc.__class__.__name__}: {str(exc)[:200]}"
        stages.note("browser_launch", "error", 0, browser_error)

    try:
        if session is not None:
            t = time.monotonic()
            base = session.run_phase(home_url, "baseline")
            captures["baseline"] = base
            stages.note("navigation_baseline", base.status, int((time.monotonic() - t) * 1000), base.error)
            if base.status in ("completed", "partial") and (base.rendered_html or base.requests):
                runtime_available = True
                home_url = home_url  # keep page identity as requested URL
            if runtime_available and opts.consent_phases and not over_budget():
                for action in ("reject", "accept"):
                    if over_budget():
                        stages.note(f"consent_{action}", "skipped_time_budget")
                        limitations.append(f"'{action}' phase skipped: time budget exhausted.")
                        continue
                    t = time.monotonic()
                    cap = session.run_phase(home_url, action, action=action)
                    captures[action] = cap
                    stages.note(f"consent_{action}", cap.status, int((time.monotonic() - t) * 1000), cap.error,
                                interaction=(cap.interaction.status if cap.interaction else None))
    except Exception as exc:
        browser_error = browser_error or f"{exc.__class__.__name__}: {str(exc)[:200]}"
        stages.note("browser_phases", "error", 0, browser_error)

    # 3. normalize home captures
    t_norm = time.monotonic()
    static_only = not runtime_available
    if runtime_available:
        for phase_name, cap in captures.items():
            ph = Phase(phase_name)
            if phase_name != "baseline":
                cap.initial_html = ""   # HTML source evidence recorded once (baseline)
            norm.ingest(cap, home_url, ph)
        html_by_page[home_url] = captures["baseline"].initial_html or captures["baseline"].rendered_html
        dom_pages.append(home_url)
    else:
        # static fallback (explicitly partial)
        if pre.ok and pre.html:
            static_cap = PhaseCapture(phase="static", requested_url=home_url, final_url=pre.final_url,
                                    http_status=pre.status, redirect_chain=pre.redirect_chain, initial_html=pre.html)
            norm.ingest(static_cap, home_url, Phase.STATIC, static_only=True)
            static_cap.links = _extract_static_links(pre.html)
            norm._policy_links(static_cap.links, home_url, Phase.STATIC)
            captures["static"] = static_cap
            html_by_page[home_url] = pre.html
            dom_pages.append(home_url)
            stages.note("static_fallback", "ok")
        else:
            stages.note("static_fallback", "error", 0, pre.error)
    stages.note("evidence_normalization", "ok", int((time.monotonic() - t_norm) * 1000))

    if not captures:
        if session is not None:
            try:
                session.__exit__(None, None, None)
            except Exception:
                pass
        base = None
        code = pre.error_code or "FETCH_FAILED"
        bstat = "failed"
        if browser_error is None and "baseline" in captures:
            base = captures["baseline"]
        status_map = {"TIMEOUT": "timeout", "PROTOCOL_ERROR": "protocol_error", "BLOCKED": "blocked"}
        bstat = status_map.get(code, "failed")
        return _failed(scan_id, input_url, bstat, code, _MESSAGES.get(code, code), stages, started,
                       browser_error or pre.error)

    # home page report
    home_cap = captures.get("baseline") or captures.get("static")
    page_reports.append({"url": home_url, "reason": "home", "status": home_cap.status if runtime_available else "partial",
                         "mode": "browser" if runtime_available else "static_html", "http_status": home_cap.http_status,
                         "final_url": norm_url(home_cap.final_url), "error": home_cap.error,
                         "phases": sorted(captures.keys())})

    # 4. deep scan pages (baseline only, fresh context each)
    crawl_info: Optional[Dict[str, Any]] = None
    if opts.deep:
        links = [l.get("href", "") for l in (home_cap.links or [])]
        crawl_info = select_pages(home_cap.final_url or home_url, links, max(0, min(opts.max_pages, 10) - 1))
        for c in crawl_info["selected"]:
            purl = str(c["url"])
            if over_budget():
                page_reports.append({"url": purl, "reason": c["reason"], "status": "skipped_time_budget"})
                continue
            if runtime_available and session is not None:
                t = time.monotonic()
                cap = session.run_phase(purl, "baseline")
                stages.note("deep_page", cap.status, int((time.monotonic() - t) * 1000), cap.error)
                if cap.status in ("completed", "partial"):
                    norm.ingest(cap, purl, Phase.BASELINE)
                    html_by_page[purl] = cap.initial_html or cap.rendered_html
                    dom_pages.append(purl)
                page_reports.append({"url": purl, "reason": c["reason"], "status": cap.status, "mode": "browser",
                                     "http_status": cap.http_status, "final_url": norm_url(cap.final_url),
                                     "error": cap.error, "phases": ["baseline"]})
            else:
                sf = static_fetch(purl, resolver)
                if sf.ok and sf.html:
                    fc = PhaseCapture(phase="static", requested_url=purl, final_url=sf.final_url, http_status=sf.status,
                                      redirect_chain=sf.redirect_chain, initial_html=sf.html)
                    norm.ingest(fc, purl, Phase.STATIC, static_only=True)
                    norm._policy_links(_extract_static_links(sf.html), purl, Phase.STATIC)
                    html_by_page[purl] = sf.html
                    dom_pages.append(purl)
                page_reports.append({"url": purl, "reason": c["reason"], "status": "partial" if sf.ok else "failed",
                                     "mode": "static_html", "http_status": sf.status, "error": sf.error})

    if session is not None:
        try:
            session.__exit__(None, None, None)
        except Exception:
            pass

    # 5. analysis
    t_an = time.monotonic()
    interactions = {k: captures[k].interaction.to_dict() for k in ("reject", "accept")
                    if k in captures and captures[k].interaction is not None}
    ctx = AnalysisContext(store=store, pii_hits=norm.pii_hits, home_url=home_url,
                          pages=[p["url"] for p in page_reports], runtime_available=runtime_available,
                          phase_status={k: v.status for k, v in captures.items()}, interactions=interactions)
    fl = FindingList()
    tags = analyze_tags(ctx)
    analyze_implementation(ctx, tags, fl)
    consent = analyze_consent(ctx, tags, fl)
    events = analyze_events(ctx, fl, html_by_page)
    privacy = analyze_privacy(ctx, fl) if runtime_available else {
        "observed_pii_values": [], "pii_key_patterns": [], "status": "UNVERIFIABLE",
        "note": "Network, dataLayer and storage were not observed; personal-data exposure was not verified."}
    policy_links = analyze_policy(ctx, fl, dom_pages)
    if static_only:
        fl.add(Finding("SCAN_STATIC_ONLY", "Static HTML only — runtime not verified",
                       STATIC_ONLY_LIMITATION + " The browser could not complete the page load"
                       + (f" ({browser_error or home_cap.error})" if (browser_error or (home_cap and home_cap.error)) else "")
                       + "; only the initial HTML source was inspected.", "scan", "UNVERIFIABLE",
                       "needs_manual_review", "high", [], [home_url]))
        limitations.insert(0, STATIC_ONLY_LIMITATION)
    if home_cap and home_cap.http_status in (401, 403, 429, 503):
        fl.add(Finding("POSSIBLE_BOT_PROTECTION", f"Home page answered HTTP {home_cap.http_status}",
                       "The site may have served a bot-protection or error page to the scanner; observations may not "
                       "reflect what real visitors receive.", "scan", "OBSERVED", "needs_manual_review", "medium",
                       [e.id for e in store.filter(source_type=SourceType.NAVIGATION, page_url=home_url)][:3], [home_url], data={"http_status": home_cap.http_status}))
    if guard.blocked:
        hosts = sorted({b["host"] for b in guard.blocked})
        fl.add(Finding("REQUESTS_BLOCKED_BY_SSRF_GUARD", "Some sub-requests were blocked by the scanner's network guard",
                       f"{len(guard.blocked)} request(s) to private/reserved destinations were blocked: {', '.join(hosts[:10])}. "
                       "Behavior that depends on them was not observed.", "scan", "UNVERIFIABLE", "info", "high", [], [home_url], data={"n": len(guard.blocked), "hosts": hosts[:10]}))
    findings_list = fl.to_list()
    stages.note("analysis", "ok", int((time.monotonic() - t_an) * 1000))

    # 6. scoring
    t_sc = time.monotonic()
    scores = compute_scores(ctx, tags, findings_list, events, consent,
                            captures["baseline"].status if "baseline" in captures else "failed")
    stages.note("scoring", "ok", int((time.monotonic() - t_sc) * 1000))

    # 7. aggregate cookies/storage/network
    cookies = _aggregate_cookies(store)
    storage = _aggregate_storage(store)
    network = _network_summary(store, target.host, guard)

    # status
    phase_problems = [k for k, v in captures.items() if v.status not in ("completed",) and k != "static"]
    if static_only:
        status = "partial"
    elif phase_problems or any(p.get("status") not in ("completed", "skipped_time_budget") for p in page_reports):
        status = "partial"
    else:
        status = "completed"
    for p in page_reports:
        p["evidence_count"] = len(store.filter(page_url=p["url"]))
        p["finding_ids"] = [f["id"] for f in findings_list if p["url"] in f.get("pages", [])]
        p["limitations"] = ([STATIC_ONLY_LIMITATION] if p.get("mode") == "static_html" else []) + \
                           (["Consent phases are only run on the home page."] if p["reason"] != "home" else [])

    caps = {
        "runtime_js": runtime_available, "network": runtime_available, "cookies": runtime_available,
        "storage": runtime_available, "static_html": bool(html_by_page),
        "consent_interaction": {a: (interactions.get(a, {}).get("status") or ("not_run" if runtime_available else "unverifiable"))
                                for a in ("reject", "accept")},
    }
    for a in ("reject", "accept"):
        st = caps["consent_interaction"][a]
        if st == "manual_verification_required":
            limitations.append(f"'{a.capitalize()} all' could not be performed automatically — manual verification required.")

    report: Dict[str, Any] = {
        "success": True, "scan_id": scan_id, "status": status,
        "message": STATIC_ONLY_LIMITATION if static_only else None,
        "engine_version": ENGINE_VERSION, "scoring_version": SCORING_VERSION, "mode": "deep" if opts.deep else "single",
        "target": {"input_url": input_url, "url": target.url, "final_url": norm_url(home_cap.final_url),
                   "http_status": home_cap.http_status,
                   "redirect_chain": [norm_url(u) for u in (home_cap.redirect_chain or pre.redirect_chain)]},
        "started_at": started_at, "finished_at": _now(), "duration_ms": int((time.monotonic() - started) * 1000),
        "capabilities": caps, "limitations": limitations, "stages": stages.stages, "pages": page_reports,
        "crawl": crawl_info, "tags": tags, "events": events, "consent": consent, "privacy": privacy,
        "policy_links": policy_links, "cookies": cookies, "storage": storage, "network": network,
        "findings": findings_list, "scores": scores, "evidence": store.to_list(),
        "summary": {
            "tags": len(tags), "tags_firing": sum(1 for t in tags if t["observed_firing"]),
            "findings": len(findings_list),
            "findings_by_status": _count(findings_list, "status"), "findings_by_severity": _count(findings_list, "severity"),
            "evidence": len(store), "cookies": len(cookies), "pages": len(page_reports),
        },
        "disclaimer": DISCLAIMER,
    }
    if opts.explain:
        t_rag = time.monotonic()
        try:
            from .rag import explain_findings
            report["explanations"] = explain_findings(findings_list)
            stages.note("rag_enrichment", "ok", int((time.monotonic() - t_rag) * 1000))
        except Exception as exc:
            report["explanations"] = {"available": False, "reason": f"RAG unavailable: {exc.__class__.__name__}"}
            stages.note("rag_enrichment", "unavailable", int((time.monotonic() - t_rag) * 1000), str(exc)[:200])
    stages.note("response", "ok")
    report["stages"] = stages.stages
    return report


def norm_url(u: Optional[str]) -> Optional[str]:
    if not u:
        return u
    from .redaction import sanitize_url
    return sanitize_url(u)[0]


def _count(items: List[Dict[str, Any]], key: str) -> Dict[str, int]:
    out: Dict[str, int] = defaultdict(int)
    for i in items:
        out[i.get(key)] += 1
    return dict(out)


def _aggregate_cookies(store: EvidenceStore) -> List[Dict[str, Any]]:
    agg: Dict[tuple, Dict[str, Any]] = {}
    for ev in store.filter(source_type=SourceType.COOKIE):
        attrs = ev.cookie_attributes or {}
        key = (ev.cookie_name, ev.cookie_domain)
        a = agg.setdefault(key, {"name": ev.cookie_name, "domain": ev.cookie_domain, "third_party": ev.third_party,
                                 "known_tracking_cookie": bool(TRACKING_COOKIE_RE.match(ev.cookie_name or "")),
                                 "observed_in": [], "attributes": {k: v for k, v in attrs.items() if k not in ("stage",)},
                                 "evidence_ids": [], "pages": []})
        tag = f"{ev.phase.value}:{attrs.get('stage', 'end')}"
        if tag not in a["observed_in"]:
            a["observed_in"].append(tag)
        if ev.page_url not in a["pages"]:
            a["pages"].append(ev.page_url)
        a["evidence_ids"].append(ev.id)
    return sorted(agg.values(), key=lambda c: (not c["known_tracking_cookie"], c["domain"] or "", c["name"] or ""))


def _aggregate_storage(store: EvidenceStore) -> List[Dict[str, Any]]:
    agg: Dict[tuple, Dict[str, Any]] = {}
    for st in (SourceType.LOCAL_STORAGE, SourceType.SESSION_STORAGE):
        for ev in store.filter(source_type=st):
            key = (st.value, ev.storage_key)
            a = agg.setdefault(key, {"type": st.value, "key": ev.storage_key, "phases": [], "evidence_ids": [],
                                     "value_length": (ev.parsed or {}).get("value_length"),
                                     "value_pii_kinds": (ev.parsed or {}).get("value_pii_kinds", [])})
            if ev.phase.value not in a["phases"]:
                a["phases"].append(ev.phase.value)
            a["evidence_ids"].append(ev.id)
    return sorted(agg.values(), key=lambda s: (s["type"], s["key"] or ""))


def _network_summary(store: EvidenceStore, site_host: str, guard: RequestGuard) -> Dict[str, Any]:
    dom: Dict[str, Dict[str, Any]] = {}
    total = 0
    for ev in store.all():
        if ev.source_type not in (SourceType.NETWORK, SourceType.SCRIPT_URL):
            continue
        total += 1
        d = ev.domain or ""
        e = dom.setdefault(d, {"domain": d, "third_party": ev.third_party, "requests": 0, "vendors": set(),
                               "phases": set(), "collection_requests": 0})
        e["requests"] += 1
        e["phases"].add(ev.phase.value)
        for v in ((ev.parsed or {}).get("beacon_vendors") or []):
            e["vendors"].add(BY_ID[v].name)
            e["collection_requests"] += 1
        for v in ((ev.parsed or {}).get("script_vendors") or []):
            e["vendors"].add(BY_ID[v].name)
    rows = []
    for e in dom.values():
        e["vendors"] = sorted(e["vendors"])
        e["phases"] = sorted(e["phases"])
        rows.append(e)
    rows.sort(key=lambda r: (not r["third_party"], -r["requests"]))
    return {"recorded_requests": total, "domains": rows, "blocked_by_guard": guard.blocked[:50],
            "note": "Recorded = vendor-matched, script, navigation, third-party, or PII-bearing requests. "
                    "First-party images/styles/fonts are not stored."}
