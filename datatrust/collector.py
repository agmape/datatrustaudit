"""
Playwright collector.

Each phase runs in a brand-new browser context (no shared cookies/storage):
  BASELINE — open page, no interaction (no scroll, no click).
  REJECT   — open page, try "reject all" on the CMP, observe.
  ACCEPT   — open page, try "accept all" on the CMP, observe.

The collector returns RAW captures that live only in memory and are converted
into redacted Evidence objects by ``datatrust.normalize`` inside the same
pipeline call. Nothing raw is logged or persisted.

Hooks are non-invasive:
  * dataLayer is *polled* (every 150 ms) instead of wrapping ``push`` — GTM
    replaces ``push`` itself and wrapping can cause recursion. Timing of
    dataLayer items is therefore approximate (±150 ms) and flagged as such.
  * ``fbq`` is observed through a transparent Proxy installed by a property
    setter so the official snippet's ``if(f.fbq)return;`` guard still works.
  * gtag() calls are recovered from ``Arguments`` objects pushed to dataLayer.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

from .catalog import VENDORS
from .cmp_adapters import (ADAPTERS, ACCEPT_TEXT_RE, BANNER_VISIBLE_JS, CONSENT_CONTAINER_HINT,
                           FIND_GENERIC_BUTTON_JS, REJECT_TEXT_RE)
from .url_guard import RequestGuard, ValidatedTarget, chromium_pin_args

USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

MAX_HTML = 3_000_000
MAX_REQUESTS = 1500
MAX_POST = 20_000


@dataclass
class CollectorOptions:
    nav_timeout_ms: int = 30_000
    load_wait_ms: int = 10_000
    idle_wait_ms: int = 6_000
    settle_ms: int = 2_500
    post_interaction_ms: int = 5_000
    banner_wait_ms: int = 4_000
    locale: str = "pt-BR"
    timezone_id: str = "America/Sao_Paulo"
    # TEST-ONLY: [(compiled_regex, content_type, body_bytes)] fulfilled locally after the SSRF guard
    # approved the request. Never populated by the public API.
    mock_routes: List[Any] = field(default_factory=list)


@dataclass
class RawRequest:
    url: str
    method: str
    resource_type: str
    t_ms: int
    is_navigation: bool = False
    frame_is_main: bool = True
    post_data: Optional[str] = None
    status: Optional[int] = None
    failed: Optional[str] = None
    redirected_from: Optional[str] = None
    wall_ms: Optional[float] = None     # browser start time (epoch ms) from request.timing, else event time


@dataclass
class Interaction:
    action: str                       # "reject" | "accept"
    status: str = "not_attempted"     # performed | manual_verification_required | not_applicable_no_cmp_observed | failed
    method: Optional[str] = None      # ui_click | ui_click_generic | cmp_api
    adapter: Optional[str] = None
    selector: Optional[str] = None
    clicked_text: Optional[str] = None
    t_start_ms: Optional[int] = None
    t_end_ms: Optional[int] = None
    click_wall_ms: Optional[float] = None   # Date.now() in page at the moment the click reached window (capture)
    click_perf_ms: Optional[float] = None   # performance.now() in page at the same moment
    verified_by: List[str] = field(default_factory=list)
    cmp_state_after: Optional[Dict[str, Any]] = None
    detail: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v not in (None, [], {})}


@dataclass
class PhaseCapture:
    phase: str
    status: str = "completed"        # completed | partial | failed | timeout | blocked | protocol_error
    error: Optional[str] = None
    started_at: float = field(default_factory=time.time)
    duration_ms: int = 0
    requested_url: str = ""
    final_url: Optional[str] = None
    http_status: Optional[int] = None
    redirect_chain: List[str] = field(default_factory=list)
    initial_html: str = ""
    rendered_html: str = ""
    requests: List[RawRequest] = field(default_factory=list)
    datalayer_items: List[Dict[str, Any]] = field(default_factory=list)   # [{t, data, args?}]
    fbq_calls: List[Dict[str, Any]] = field(default_factory=list)         # [{t, args}]
    globals_present: Dict[str, bool] = field(default_factory=dict)
    google_tag_keys: List[str] = field(default_factory=list)   # keys of window.google_tag_manager (container/tag ids)
    consent_mode_ics: Optional[Dict[str, Any]] = None
    tcf: Optional[Dict[str, Any]] = None
    cookies: List[Dict[str, Any]] = field(default_factory=list)          # raw (value only used for length)
    cookies_before_interaction: Optional[List[Dict[str, Any]]] = None
    local_storage: Dict[str, str] = field(default_factory=dict)
    session_storage: Dict[str, str] = field(default_factory=dict)
    console_errors: List[Dict[str, Any]] = field(default_factory=list)
    cmp_detected: List[str] = field(default_factory=list)
    banner_selector: Optional[str] = None
    interaction: Optional[Interaction] = None
    blocked_requests: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    links: List[Dict[str, str]] = field(default_factory=list)            # [{href, text}] from rendered DOM


# ── injected scripts ─────────────────────────────────────────────────────────
_INIT_SCRIPT = r"""
(() => {
  if (window.__dtCap) return;
  const cap = window.__dtCap = { dl: [], dlSeen: 0, fbq: [], max: 600 };
  const now = () => Math.round(performance.now());
  const ser = (v, depth) => {
    depth = depth || 0;
    if (depth > 6) return '[depth]';
    if (v === null || v === undefined) return v === undefined ? '[undefined]' : null;
    const t = typeof v;
    if (t === 'function') return '[function]';
    if (t !== 'object') return v;
    try { if (v instanceof Node) return '[dom-node]'; } catch (e) {}
    if (Object.prototype.toString.call(v) === '[object Arguments]') {
      return { __args: Array.prototype.slice.call(v, 0, 20).map(x => ser(x, depth + 1)) };
    }
    if (Array.isArray(v)) return v.slice(0, 50).map(x => ser(x, depth + 1));
    const o = {}; let i = 0;
    for (const k in v) { if (i++ > 80) break; try { o[k] = ser(v[k], depth + 1); } catch (e) { o[k] = '[error]'; } }
    return o;
  };
  cap.ser = ser;
  const poll = () => {
    try {
      const dl = window.dataLayer;
      if (Array.isArray(dl) && dl.length > cap.dlSeen) {
        for (let i = cap.dlSeen; i < dl.length && cap.dl.length < cap.max; i++) cap.dl.push({ t: now(), idx: i, data: ser(dl[i]) });
        cap.dlSeen = dl.length;
      }
    } catch (e) {}
  };
  cap.poll = poll;
  setInterval(poll, 150);
  try {
    let fbqVal;
    const handler = { apply(target, thisArg, args) {
      try { if (cap.fbq.length < cap.max) cap.fbq.push({ t: now(), args: ser(Array.prototype.slice.call(args, 0, 6)) }); } catch (e) {}
      return Reflect.apply(target, thisArg, args);
    } };
    Object.defineProperty(window, 'fbq', {
      configurable: true, enumerable: true,
      get() { return fbqVal; },
      set(v) { fbqVal = (typeof v === 'function') ? new Proxy(v, handler) : v; }
    });
  } catch (e) {}
})();
"""

_COLLECT_JS = r"""
(globalNames) => {
  const cap = window.__dtCap || { dl: [], fbq: [], ser: (x) => x, poll: () => {} };
  try { cap.poll(); } catch (e) {}
  const out = { dl: cap.dl, fbq: cap.fbq, globals: {}, ics: null, ls: {}, ss: {}, links: [], gtmKeys: [] };
  try { out.gtmKeys = Object.keys(window.google_tag_manager || {}).filter(k => /^(GTM|G|AW|DC|GT)-[A-Z0-9-]{4,16}$/.test(k)).slice(0, 30); } catch (e) {}
  for (const g of globalNames) { try { out.globals[g] = typeof window[g] !== 'undefined'; } catch (e) { out.globals[g] = false; } }
  try {
    const ics = window.google_tag_data && window.google_tag_data.ics;
    if (ics && ics.entries) {
      const e = {};
      for (const k in ics.entries) {
        const v = ics.entries[k] || {};
        e[k] = { default: v.default === undefined ? null : v.default, update: v.update === undefined ? null : v.update };
      }
      out.ics = { entries: e, usedDefault: !!ics.usedDefault, usedUpdate: !!ics.usedUpdate, wasSetLate: !!ics.wasSetLate, active: !!ics.active };
    }
  } catch (e) {}
  try { for (let i = 0; i < Math.min(localStorage.length, 100); i++) { const k = localStorage.key(i); out.ls[k] = (localStorage.getItem(k) || '').slice(0, 4000); } } catch (e) {}
  try { for (let i = 0; i < Math.min(sessionStorage.length, 100); i++) { const k = sessionStorage.key(i); out.ss[k] = (sessionStorage.getItem(k) || '').slice(0, 4000); } } catch (e) {}
  try {
    const as = document.querySelectorAll('a[href]');
    for (let i = 0; i < as.length && out.links.length < 400; i++) {
      out.links.push({ href: as[i].href, text: ((as[i].innerText || as[i].textContent || '') + '').replace(/\s+/g, ' ').trim().slice(0, 80) });
    }
  } catch (e) {}
  return out;
}
"""

_TCF_JS = r"""
() => new Promise((resolve) => {
  if (typeof window.__tcfapi !== 'function') return resolve(null);
  let done = false;
  const t = setTimeout(() => { if (!done) { done = true; resolve({ present: true, responded: false }); } }, 1500);
  try {
    window.__tcfapi('getTCData', 2, (d, ok) => {
      if (done) return; done = true; clearTimeout(t);
      if (!ok || !d) return resolve({ present: true, responded: false });
      const pc = (d.purpose && d.purpose.consents) || {};
      resolve({ present: true, responded: true, gdprApplies: d.gdprApplies, eventStatus: d.eventStatus,
                cmpStatus: d.cmpStatus, hasTcString: !!d.tcString, purposeConsents: pc });
    });
  } catch (e) { if (!done) { done = true; clearTimeout(t); resolve({ present: true, responded: false }); } }
})
"""

_GLOBAL_NAMES = sorted({g for v in VENDORS for g in v.globals} | {"dataLayer", "google_tag_data", "__tcfapi", "__gpp", "__uspapi"})


def _classify_error(msg: str) -> str:
    m = (msg or "").lower()
    if "timeout" in m:
        return "timeout"
    if "err_blocked_by_client" in m:
        return "blocked"
    if any(s in m for s in ("err_http2", "protocol error", "err_ssl", "err_cert", "err_connection_reset",
                            "err_quic", "err_empty_response")):
        return "protocol_error"
    if any(s in m for s in ("err_name_not_resolved", "err_connection_refused", "err_address_unreachable",
                            "err_internet_disconnected", "err_connection_timed_out")):
        return "failed"
    return "failed"


class BrowserSession:
    """Owns one Playwright + Chromium instance for the whole scan (all phases/pages)."""

    def __init__(self, target: ValidatedTarget, guard: RequestGuard, options: CollectorOptions):
        self.target = target
        self.guard = guard
        self.options = options
        self._pw = None
        self.browser = None

    def __enter__(self) -> "BrowserSession":
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        args = ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage",
                "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
                "--disable-component-update", "--disable-sync", "--metrics-recording-only",
                "--disable-domain-reliability"]
        args += chromium_pin_args(self.target)
        self.browser = self._pw.chromium.launch(headless=True, args=args)
        return self

    def __exit__(self, *exc):
        try:
            if self.browser:
                self.browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    # ── one isolated phase ─────────────────────────────────────────────────
    def run_phase(self, url: str, phase: str, action: Optional[str] = None) -> PhaseCapture:
        from playwright.sync_api import TimeoutError as PwTimeout, Error as PwError

        opt = self.options
        cap = PhaseCapture(phase=phase, requested_url=url)
        t_start = time.monotonic()
        t0 = [t_start]  # navigation start reference

        def t_ms() -> int:
            return int((time.monotonic() - t0[0]) * 1000)

        context = self.browser.new_context(
            user_agent=USER_AGENT, locale=opt.locale, timezone_id=opt.timezone_id,
            viewport={"width": 1366, "height": 900}, java_script_enabled=True,
            service_workers="block", accept_downloads=False, ignore_https_errors=False,
        )
        guard = self.guard

        def _route(route):
            req = route.request
            reason = guard.check(req.url)
            if reason:
                guard.record_block(req.url, reason, req.resource_type)
                cap.blocked_requests.append({"host": urlsplit(req.url).hostname or "", "reason": reason,
                                             "resource_type": req.resource_type})
                try:
                    route.abort("blockedbyclient")
                except Exception:
                    pass
                return
            for rx, ctype, body in opt.mock_routes:
                if rx.search(req.url):
                    try:
                        route.fulfill(status=200, body=body, headers={
                            "content-type": ctype, "cache-control": "no-store",
                            "access-control-allow-origin": "*"})
                    except Exception:
                        pass
                    return
            try:
                route.continue_()
            except Exception:
                pass

        def _ws_route(ws):
            reason = guard.check(ws.url)
            if reason:
                guard.record_block(ws.url, reason, "websocket")
                cap.blocked_requests.append({"host": urlsplit(ws.url).hostname or "", "reason": reason,
                                             "resource_type": "websocket"})
                try:
                    ws.close()
                except Exception:
                    pass
                return
            try:
                ws.connect_to_server()
            except Exception:
                pass

        context.route("**/*", _route)
        try:
            context.route_web_socket(re.compile(r".*"), _ws_route)
        except Exception:
            cap.warnings.append("websocket_guard_unavailable")
        context.add_init_script(_INIT_SCRIPT)
        page = context.new_page()
        req_index: Dict[Any, RawRequest] = {}

        def _on_request(req):
            if len(cap.requests) >= MAX_REQUESTS:
                return
            try:
                post = None
                if req.method not in ("GET", "HEAD"):
                    try:
                        buf = req.post_data_buffer
                        if buf:
                            post = buf[:MAX_POST].decode("utf-8", errors="replace")
                    except Exception:
                        post = None
                try:
                    is_main = req.frame == page.main_frame
                except Exception:
                    is_main = True
                rr = RawRequest(url=req.url, method=req.method, resource_type=req.resource_type, t_ms=t_ms(),
                                is_navigation=req.is_navigation_request(), frame_is_main=is_main, post_data=post,
                                redirected_from=(req.redirected_from.url if req.redirected_from else None),
                                wall_ms=time.time() * 1000)
                cap.requests.append(rr)
                req_index[req] = rr
            except Exception:
                pass

        def _on_response(resp):
            rr = req_index.get(resp.request)
            if rr is not None:
                rr.status = resp.status

        def _on_failed(req):
            rr = req_index.get(req)
            if rr is not None:
                try:
                    rr.failed = (req.failure or "failed")[:120]
                except Exception:
                    rr.failed = "failed"

        def _on_console(msg):
            if msg.type == "error" and len(cap.console_errors) < 50:
                cap.console_errors.append({"t": t_ms(), "text": (msg.text or "")[:500]})

        def _on_pageerror(err):
            if len(cap.console_errors) < 50:
                cap.console_errors.append({"t": t_ms(), "text": f"pageerror: {str(err)[:500]}"})

        page.on("request", _on_request)
        page.on("response", _on_response)
        page.on("requestfailed", _on_failed)
        page.on("console", _on_console)
        page.on("pageerror", _on_pageerror)

        try:
            t0[0] = time.monotonic()
            resp = None
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=opt.nav_timeout_ms)
            except PwTimeout:
                cap.status = "timeout"
                cap.error = f"navigation timeout after {opt.nav_timeout_ms} ms"
            except PwError as exc:
                cap.status = _classify_error(str(exc))
                cap.error = str(exc).split("\n")[0][:300]

            if resp is not None:
                cap.http_status = resp.status
                chain = []
                r = resp.request
                while r is not None:
                    chain.append(r.url)
                    r = r.redirected_from
                cap.redirect_chain = list(reversed(chain))
                try:
                    body = resp.text()
                    cap.initial_html = body[:MAX_HTML]
                except Exception:
                    cap.warnings.append("initial_html_unavailable")
                if resp.status in (401, 403, 429, 503):
                    cap.warnings.append(f"http_status_{resp.status}_possible_bot_protection")

            if cap.status == "completed" or cap.status == "timeout":
                for state, ms in (("load", opt.load_wait_ms), ("networkidle", opt.idle_wait_ms)):
                    try:
                        page.wait_for_load_state(state, timeout=ms)
                    except PwTimeout:
                        cap.warnings.append(f"{state}_not_reached_within_{ms}ms")
                    except PwError:
                        break
                page.wait_for_timeout(opt.settle_ms)

                cap.cmp_detected, cap.banner_selector = self._detect_cmp(page)
                if action and not cap.banner_selector:
                    # give lazy banners a chance
                    page.wait_for_timeout(opt.banner_wait_ms)
                    cap.cmp_detected, cap.banner_selector = self._detect_cmp(page)

                if action:
                    try:
                        cap.cookies_before_interaction = context.cookies()
                    except Exception:
                        cap.cookies_before_interaction = None
                    cap.interaction = self._interact(page, action, cap, t_ms)
                    if cap.interaction.status == "performed":
                        page.wait_for_timeout(opt.post_interaction_ms)
                        try:
                            page.wait_for_load_state("networkidle", timeout=opt.idle_wait_ms)
                        except Exception:
                            pass

                self._collect_runtime(page, context, cap)
                for _req, _rr in list(req_index.items()):
                    try:
                        st = (_req.timing or {}).get("startTime")
                        if st and st > 0:
                            _rr.wall_ms = float(st)
                    except Exception:
                        pass
                if cap.status == "timeout" and (cap.rendered_html or cap.requests):
                    cap.status = "partial"
            try:
                cap.final_url = page.url
            except Exception:
                pass
        except Exception as exc:  # defensive: never crash the pipeline
            cap.status = "failed" if cap.status == "completed" else cap.status
            cap.error = (cap.error or "") + f" | collector error: {exc.__class__.__name__}: {str(exc)[:200]}"
        finally:
            cap.duration_ms = int((time.monotonic() - t_start) * 1000)
            try:
                context.close()
            except Exception:
                pass
        return cap

    # ── helpers ────────────────────────────────────────────────────────────
    def _detect_cmp(self, page):
        detected = []
        banner = None
        for ad in ADAPTERS:
            try:
                if page.evaluate(f"() => !!({ad.detect_js})"):
                    detected.append(ad.id)
                    sel = page.evaluate(BANNER_VISIBLE_JS, ad.banner_selectors)
                    if sel and not banner:
                        banner = sel
            except Exception:
                continue
        if not banner:
            # generic: any visible consent-like button present => banner visible
            try:
                res = page.evaluate(FIND_GENERIC_BUTTON_JS, {"textRe": ACCEPT_TEXT_RE, "hintRe": CONSENT_CONTAINER_HINT})
                if res and res.get("found"):
                    banner = "generic:consent-button-visible"
            except Exception:
                pass
        return detected, banner

    def _cmp_state(self, page, adapter_id: Optional[str]):
        for ad in ADAPTERS:
            if adapter_id and ad.id != adapter_id:
                continue
            if ad.state_js:
                try:
                    st = page.evaluate(f"() => {{ try {{ return {ad.state_js}; }} catch(e) {{ return null; }} }}")
                    if st:
                        return st
                except Exception:
                    pass
        return None

    def _interact(self, page, action: str, cap: PhaseCapture, t_ms) -> Interaction:
        it = Interaction(action=action)
        if not cap.cmp_detected and not cap.banner_selector:
            it.status = "not_applicable_no_cmp_observed"
            it.detail = "No CMP script/global or consent banner was observed, so no consent interaction was attempted."
            return it

        def banner_hidden(adapter_sel: Optional[str]) -> bool:
            try:
                if adapter_sel and not adapter_sel.startswith("generic:"):
                    return page.evaluate(BANNER_VISIBLE_JS, [adapter_sel]) is None
                res = page.evaluate(FIND_GENERIC_BUTTON_JS, {"textRe": ACCEPT_TEXT_RE if action == "reject" else REJECT_TEXT_RE,
                                                              "hintRe": CONSENT_CONTAINER_HINT})
                return not (res and res.get("found"))
            except Exception:
                return False

        # 1) adapter selectors
        for ad in ADAPTERS:
            if ad.id not in cap.cmp_detected:
                continue
            sels = ad.reject_selectors if action == "reject" else ad.accept_selectors
            # some CMPs render their banner late (observed: ~20 s on a real AdOpt site) - wait for it
            try:
                page.locator(", ".join(sels)).first.wait_for(state="visible", timeout=12000)
            except Exception:
                pass
            for sel in sels:
                try:
                    loc = page.locator(sel).first
                    if loc.count() and loc.is_visible():
                        self._arm_click_marker(page)
                        it.t_start_ms = t_ms()
                        loc.click(timeout=3000, no_wait_after=True)
                        it.t_end_ms = t_ms()
                        it.method, it.adapter, it.selector = "ui_click", ad.id, sel
                        self._read_click_marker(page, it)
                        page.wait_for_timeout(1200)
                        if banner_hidden(cap.banner_selector):
                            it.verified_by.append("banner_hidden")
                        st = self._cmp_state(page, ad.id)
                        if st:
                            it.cmp_state_after = st
                            it.verified_by.append("cmp_state_read")
                        it.status = "performed" if it.verified_by else "failed"
                        if it.status == "performed":
                            return it
                except Exception:
                    continue
        # 2) generic text button
        try:
            res = page.evaluate(FIND_GENERIC_BUTTON_JS, {"textRe": REJECT_TEXT_RE if action == "reject" else ACCEPT_TEXT_RE,
                                                          "hintRe": CONSENT_CONTAINER_HINT})
            if res and res.get("found"):
                before_url = page.url
                self._arm_click_marker(page)
                it.t_start_ms = t_ms()
                page.locator("[data-dt-target='1']").first.click(timeout=3000, no_wait_after=True)
                it.t_end_ms = t_ms()
                it.method, it.clicked_text = "ui_click_generic", res.get("text")
                self._read_click_marker(page, it)
                page.wait_for_timeout(1200)
                if page.url.split("#")[0] != before_url.split("#")[0]:
                    it.status = "failed"
                    it.detail = "Generic click caused a navigation; result discarded."
                    return it
                if banner_hidden(cap.banner_selector):
                    it.verified_by.append("banner_hidden")
                st = self._cmp_state(page, None)
                if st:
                    it.cmp_state_after = st
                    it.verified_by.append("cmp_state_read")
                if it.verified_by:
                    it.status = "performed"
                    return it
        except Exception:
            pass
        # 3) CMP JavaScript API
        for ad in ADAPTERS:
            if ad.id not in cap.cmp_detected:
                continue
            js = ad.api_reject_js if action == "reject" else ad.api_accept_js
            if not js:
                continue
            try:
                it.t_start_ms = t_ms()
                page.evaluate(f"() => {{ try {{ window.__dtCap && window.__dtCap.poll(); }} catch(e) {{}} "
                              f"window.__dtClick = {{perf: performance.now(), wall: Date.now()}}; "
                              f"try {{ {js}; return true; }} catch(e) {{ return false; }} }}")
                self._read_click_marker(page, it)
                it.t_end_ms = t_ms()
                it.method, it.adapter = "cmp_api", ad.id
                page.wait_for_timeout(1500)
                st = self._cmp_state(page, ad.id)
                if st:
                    it.cmp_state_after = st
                    it.verified_by.append("cmp_state_read")
                if banner_hidden(cap.banner_selector):
                    it.verified_by.append("banner_hidden")
                if it.verified_by:
                    it.status = "performed"
                    return it
            except Exception:
                continue
        it.status = "manual_verification_required"
        it.method = it.method or None
        it.detail = ("A CMP/banner was observed but the scanner could not perform and verify a "
                     f"'{action} all' interaction automatically. No post-{action} behavior is claimed.")
        return it

    @staticmethod
    def _arm_click_marker(page) -> None:
        # Capture-phase listener on window runs before the CMP's own handler: we flush the dataLayer
        # poller and stamp the click time, so everything pushed before the click is attributed "before".
        page.evaluate("""() => {
          window.__dtClick = null;
          if (window.__dtArmed) return;
          window.__dtArmed = true;
          window.addEventListener('click', function () {
            if (window.__dtClick) return;
            try { window.__dtCap && window.__dtCap.poll(); } catch (e) {}
            window.__dtClick = { perf: performance.now(), wall: Date.now() };
          }, true);
        }""")

    @staticmethod
    def _read_click_marker(page, it: "Interaction") -> None:
        try:
            m = page.evaluate("() => window.__dtClick")
            if m:
                it.click_wall_ms = float(m.get("wall"))
                it.click_perf_ms = float(m.get("perf"))
        except Exception:
            pass

    def _collect_runtime(self, page, context, cap: PhaseCapture) -> None:
        try:
            data = page.evaluate(_COLLECT_JS, _GLOBAL_NAMES)
            cap.datalayer_items = data.get("dl") or []
            cap.fbq_calls = data.get("fbq") or []
            cap.globals_present = data.get("globals") or {}
            cap.google_tag_keys = data.get("gtmKeys") or []
            cap.consent_mode_ics = data.get("ics")
            cap.local_storage = data.get("ls") or {}
            cap.session_storage = data.get("ss") or {}
            cap.links = data.get("links") or []
        except Exception as exc:
            cap.warnings.append(f"runtime_state_unavailable:{exc.__class__.__name__}")
        try:
            cap.tcf = page.evaluate(_TCF_JS)
        except Exception:
            pass
        try:
            cap.rendered_html = page.content()[:MAX_HTML]
        except Exception:
            cap.warnings.append("rendered_dom_unavailable")
        try:
            cap.cookies = context.cookies()
        except Exception:
            cap.warnings.append("cookies_unavailable")
