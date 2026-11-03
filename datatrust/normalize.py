"""
Normalization: raw PhaseCapture -> redacted Evidence + PII hit index.

This is the only place where raw captured data is read. Everything leaving
this module is sanitized (see ``redaction``). Cookie and storage values are
never copied: only names/keys, attributes, lengths and PII classification.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlsplit

from .catalog import BY_ID, VENDORS, vendors_for_url
from .collector import PhaseCapture
from .evidence import Confidence, Evidence, EvidenceStore, Phase, Redaction, SourceType
from .redaction import (PiiHit, redact_text, redact_value, sanitize_body, sanitize_obj, sanitize_url)

_MULTI_PART_SUFFIXES = {
    "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "blog.br", "eco.br", "ind.br", "inf.br",
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.nz", "com.mx",
    "com.ar", "com.co", "com.pe", "com.pt", "co.za", "com.tr", "com.cn", "com.sg", "co.in", "co.kr",
}

POLICY_TEXT_RE = re.compile(
    r"pol[ií]tica\s+de\s+(?:privacidade|cookies|dados)|aviso\s+de\s+privacidade|privacidade|"
    r"privacy(?:\s+(?:policy|notice|statement))?|cookie\s*(?:policy|notice|settings|preferences)|"
    r"pol[ií]tica\s+de\s+privacidad|prote[cç][aã]o\s+de\s+dados|lgpd|gdpr", re.I)
POLICY_HREF_RE = re.compile(r"privac|cookie|lgpd|gdpr|protecao-de-dados|protecao_de_dados|data-protection", re.I)

_SKIP_FIRST_PARTY_TYPES = {"image", "stylesheet", "font", "media", "manifest", "texttrack", "other"}


def registrable_domain(host: str) -> str:
    """Approximate eTLD+1 (no public-suffix dependency; documented approximation)."""
    h = (host or "").lower().strip(".")
    if not h or re.match(r"^[\d.]+$", h) or ":" in h:
        return h
    parts = h.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in _MULTI_PART_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _iso(epoch: Optional[float]) -> Optional[str]:
    if epoch is None or epoch <= 0:
        return None
    try:
        return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat(timespec="seconds")
    except Exception:
        return None


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


_INERT_RE = re.compile(r"<!--.*?-->|<(pre|code|textarea|xmp)\b[^>]*>.*?</\1\s*>", re.I | re.S)


def blank_inert(html: str) -> str:
    """Blank out comments and <pre>/<code>/<textarea> content (keeps offsets/newlines).
    Code shown as documentation or commented-out snippets is not an implementation."""
    def rep(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    return _INERT_RE.sub(rep, html or "")


def _snippet(text: str, pos: int, end: int, radius: int = 120) -> str:
    s = max(0, pos - radius)
    e = min(len(text), end + radius)
    return text[s:e].replace("\r", "")


# ── hit parsers ──────────────────────────────────────────────────────────────
_GA4_ITEM_KEYS = {"id": "item_id", "nm": "item_name", "br": "item_brand", "ca": "item_category", "va": "item_variant",
                  "pr": "price", "qt": "quantity", "cp": "coupon", "ds": "discount", "af": "affiliation",
                  "lp": "index", "ln": "item_list_name", "li": "item_list_id"}


def _parse_ga4_item(raw: str) -> Dict[str, Any]:
    item: Dict[str, Any] = {}
    for tok in raw.split("~"):
        if len(tok) < 2:
            continue
        k, v = tok[:2], tok[2:]
        name = _GA4_ITEM_KEYS.get(k)
        if name:
            item[name] = v
    return item


def parse_ga4_hit(url_params: List[Tuple[str, str]], body_lines: List[List[Tuple[str, str]]]) -> List[Dict[str, Any]]:
    """Parse a (sanitized) GA4 /g/collect request into events. One body line = one event."""
    base = dict(url_params)
    lines = body_lines or [[]]
    events = []
    for line in lines:
        merged = dict(base)
        merged.update(dict(line))
        en = merged.get("en")
        if not en:
            continue
        params: Dict[str, Any] = {}
        items = []
        for k, v in list(base.items()) + list(line):
            if k.startswith("ep."):
                params[k[3:]] = v
            elif k.startswith("epn."):
                params[k[4:]] = v
            elif re.match(r"^pr\d+$", k):
                items.append(_parse_ga4_item(v))
        if "cu" in merged:
            params.setdefault("currency", merged.get("cu"))
        events.append({
            "tid": merged.get("tid"), "en": en, "params": params, "items": items,
            "gcs": merged.get("gcs"), "gcd": merged.get("gcd"), "npa": merged.get("npa"),
            "dma": merged.get("dma"), "has_cid": "cid" in merged, "has_uid": "uid" in merged,
            "page_location": merged.get("dl"),
        })
    return events


def parse_meta_hit(params: List[Tuple[str, str]]) -> Dict[str, Any]:
    d = dict(params)
    return {"pixel_id": d.get("id"), "event": d.get("ev"),
            "custom_data_keys": sorted({k[3:-1] for k in d if k.startswith("cd[") and k.endswith("]")}),
            "user_data_keys": sorted({k[3:-1] for k in d if k.startswith("ud[") and k.endswith("]")})}


class Normalizer:
    def __init__(self, store: EvidenceStore, site_host: str):
        self.store = store
        self.site_reg = registrable_domain(site_host)
        self.pii_hits: List[Dict[str, Any]] = []

    def _is_third_party(self, host: str) -> bool:
        return registrable_domain(host) != self.site_reg

    def _record_hits(self, hits: List[PiiHit], ev: Evidence) -> None:
        for h in hits:
            d = h.to_dict()
            d.update({"evidence_id": ev.id, "phase": ev.phase.value, "page_url": ev.page_url,
                      "domain": ev.domain, "third_party": ev.third_party, "source_type": ev.source_type.value})
            self.pii_hits.append(d)

    # ── main entry ─────────────────────────────────────────────────────────
    def ingest(self, cap: PhaseCapture, page_url: str, phase: Phase, *, static_only: bool = False) -> None:
        self._navigation(cap, page_url, phase)
        html = cap.initial_html or ""
        if html:
            self._html_source(html, page_url, phase, static_only=static_only)
        if static_only:
            return
        it = cap.interaction
        performed = bool(it and it.status == "performed")
        click_wall = it.click_wall_ms if performed else None
        click_perf = it.click_perf_ms if performed else None
        self._network(cap, page_url, phase, click_wall)
        self._datalayer(cap, page_url, phase, click_perf)
        self._fbq(cap, page_url, phase, click_perf)
        self._globals(cap, page_url, phase)
        if cap.rendered_html and phase == Phase.BASELINE:
            self._rendered_scripts(cap.rendered_html, page_url, phase)
        self._consent(cap, page_url, phase)
        self._cookies(cap.cookies, page_url, phase, stage="end")
        if cap.cookies_before_interaction is not None:
            self._cookies(cap.cookies_before_interaction, page_url, phase, stage="before_interaction")
        self._storage(cap.local_storage, SourceType.LOCAL_STORAGE, page_url, phase)
        self._storage(cap.session_storage, SourceType.SESSION_STORAGE, page_url, phase)
        self._policy_links(cap.links, page_url, phase)
        self._console(cap, page_url, phase)

    @staticmethod
    def _after(t: Optional[float], click: Optional[float]) -> Optional[bool]:
        """True/False when both timestamps come from the same clock; None when unknown."""
        if t is None or click is None:
            return None
        return t >= click

    def _navigation(self, cap: PhaseCapture, page_url: str, phase: Phase) -> None:
        final, red, _h, _p = sanitize_url(cap.final_url or "")
        chain = [sanitize_url(u)[0] for u in cap.redirect_chain]
        self.store.add(source_type=SourceType.NAVIGATION, phase=phase, page_url=page_url,
                       request_url=final or None, domain=urlsplit(cap.final_url or "").hostname,
                       parsed={"http_status": cap.http_status, "redirect_chain": chain, "phase_status": cap.status,
                               "duration_ms": cap.duration_ms},
                       confidence=Confidence.HIGH, redaction=red)

    def _html_source(self, html_raw: str, page_url: str, phase: Phase, static_only: bool) -> None:
        html = blank_inert(html_raw)
        # vendor code signatures
        for v in VENDORS:
            n = 0
            for pattern, m in v.html_matches(html):
                if n >= 5:
                    break
                n += 1
                snip, red, hits = redact_text(_snippet(html, m.start(), m.end()), 400, "html")
                ids = [i for i in v.extract_ids(html[max(0, m.start() - 200): m.end() + 300], "html")]
                ev = self.store.add(source_type=SourceType.HTML_SOURCE, phase=phase, page_url=page_url,
                                    html_line=_line_of(html, m.start()), snippet=snip, vendor_hint=v.id,
                                    confidence=Confidence.MEDIUM,
                                    parsed={"signature": pattern, "ids": ids, "position": m.start()}, redaction=red)
                self._record_hits(hits, ev)
        # dataLayer re-assignment (used for an INFERRED source-order rule)
        for m in re.finditer(r"(?<![\w.|])(?:window\.)?dataLayer\s*=\s*\[", html):
            snip, red, _h = redact_text(_snippet(html, m.start(), m.end(), 60), 200, "html")
            self.store.add(source_type=SourceType.HTML_SOURCE, phase=phase, page_url=page_url,
                           html_line=_line_of(html, m.start()), snippet=snip, confidence=Confidence.MEDIUM,
                           parsed={"signature": "__dl_reassign__", "position": m.start()}, redaction=red)
        # every external <script src> in source order (needed for load-order analysis)
        for m in re.finditer(r"<script\b[^>]*\bsrc\s*=\s*(['\"])(.*?)\1[^>]*>", html, re.I | re.S):
            src = m.group(2).strip()
            if not src or src.startswith("data:"):
                continue
            s_url, red, hits, _ = sanitize_url(src if "://" in src or src.startswith("//") else src)
            matches = vendors_for_url(src)
            vid = matches[0][0].id if matches else None
            ev = self.store.add(source_type=SourceType.HTML_SOURCE, phase=phase, page_url=page_url,
                                html_line=_line_of(html, m.start()), script_url=s_url, vendor_hint=vid,
                                confidence=Confidence.MEDIUM if static_only else Confidence.HIGH,
                                parsed={"kind": "script_tag", "position": m.start(),
                                        "async": bool(re.search(r"\basync\b", m.group(0), re.I)),
                                        "defer": bool(re.search(r"\bdefer\b", m.group(0), re.I)),
                                        "all_vendor_matches": [x[0].id for x in matches],
                                        "ids": sorted({i for x in matches for i in x[0].extract_ids(src, "url")})},
                                redaction=red)
            self._record_hits(hits, ev)

    def _network(self, cap: PhaseCapture, page_url: str, phase: Phase, click_wall) -> None:
        for rr in cap.requests:
            host = urlsplit(rr.url).hostname or ""
            if rr.url.startswith("data:") or rr.url.startswith("blob:"):
                continue
            third = self._is_third_party(host)
            matches = vendors_for_url(rr.url)
            s_url, red, hits, params = sanitize_url(rr.url, "")
            body_s, bred, bhits, body_lines = sanitize_body(rr.post_data) if rr.post_data else (None, Redaction(), [], [])
            red.merge(bred)
            hits = hits + bhits
            keep = bool(matches) or bool(hits and any(h.is_value or h.kind not in ("online_identifier",) for h in hits)) \
                or rr.resource_type == "script" or rr.is_navigation \
                or (third and rr.resource_type not in {"stylesheet", "font", "media", "manifest", "texttrack"})
            if not keep:
                continue
            parsed: Dict[str, Any] = {}
            if body_s:
                parsed["post_body"] = body_s
            if rr.status is not None:
                parsed["status"] = rr.status
            if rr.failed:
                parsed["failed"] = rr.failed
            if not rr.frame_is_main:
                parsed["frame"] = "subframe"
            beacon_vendors = [v.id for v, kind in matches if kind == "beacon"]
            script_vendors = [v.id for v, kind in matches if kind == "script"]
            if beacon_vendors:
                parsed["beacon_vendors"] = beacon_vendors
            if script_vendors:
                parsed["script_vendors"] = script_vendors
            ids = sorted({i for v, _k in matches for i in v.extract_ids(rr.url, "url")})
            if ids:
                parsed["ids"] = ids
            if "ga4" in beacon_vendors:
                parsed["ga4_events"] = parse_ga4_hit(params, body_lines)
            if "meta_pixel" in beacon_vendors:
                parsed["meta"] = parse_meta_hit(params + (body_lines[0] if body_lines else []))
            vendor_hint = (beacon_vendors or script_vendors or [None])[0]
            stype = SourceType.SCRIPT_URL if (rr.resource_type == "script" and not beacon_vendors) else SourceType.NETWORK
            ev = self.store.add(source_type=stype, phase=phase, page_url=page_url, t_ms=rr.t_ms,
                                request_url=s_url, request_method=rr.method, resource_type=rr.resource_type,
                                domain=host, third_party=third, after_interaction=self._after(rr.wall_ms, click_wall),
                                script_url=s_url if stype == SourceType.SCRIPT_URL else None,
                                vendor_hint=vendor_hint, confidence=Confidence.HIGH, parsed=parsed or None,
                                redaction=red)
            self._record_hits(hits, ev)

    def _datalayer(self, cap: PhaseCapture, page_url: str, phase: Phase, click_perf) -> None:
        for item in cap.datalayer_items:
            data = item.get("data")
            t = item.get("t")
            if isinstance(data, dict) and "__args" in data:
                args = data.get("__args") or []
                sargs, red, hits = sanitize_obj(args, "gtag")
                ev = self.store.add(source_type=SourceType.GTAG, phase=phase, page_url=page_url, t_ms=t,
                                    gtag_call=sargs, after_interaction=self._after(t, click_perf),
                                    confidence=Confidence.HIGH, vendor_hint="google_tag",
                                    parsed={"timing": "approximate_poll_150ms", "dl_index": item.get("idx")},
                                    redaction=red)
            else:
                sdata, red, hits = sanitize_obj(data, "datalayer")
                ev = self.store.add(source_type=SourceType.DATALAYER, phase=phase, page_url=page_url, t_ms=t,
                                    datalayer_event=sdata, after_interaction=self._after(t, click_perf),
                                    confidence=Confidence.HIGH,
                                    parsed={"timing": "approximate_poll_150ms", "dl_index": item.get("idx")},
                                    redaction=red)
            self._record_hits(hits, ev)

    def _fbq(self, cap: PhaseCapture, page_url: str, phase: Phase, click_perf) -> None:
        for call in cap.fbq_calls:
            sargs, red, hits = sanitize_obj(call.get("args") or [], "fbq")
            ev = self.store.add(source_type=SourceType.FBQ, phase=phase, page_url=page_url, t_ms=call.get("t"),
                                fbq_call=sargs, after_interaction=self._after(call.get("t"), click_perf),
                                vendor_hint="meta_pixel", confidence=Confidence.HIGH, redaction=red)
            self._record_hits(hits, ev)

    def _globals(self, cap: PhaseCapture, page_url: str, phase: Phase) -> None:
        keys = cap.google_tag_keys or []
        gtm_ids = [k for k in keys if k.startswith("GTM-")]
        if gtm_ids:
            self.store.add(source_type=SourceType.RUNTIME_JS, phase=phase, page_url=page_url, vendor_hint="gtm",
                           confidence=Confidence.HIGH,
                           parsed={"source": "Object.keys(window.google_tag_manager)", "ids": gtm_ids})
        tag_ids = [k for k in keys if not k.startswith("GTM-")]
        if tag_ids:
            self.store.add(source_type=SourceType.RUNTIME_JS, phase=phase, page_url=page_url, vendor_hint="google_tag",
                           confidence=Confidence.HIGH,
                           parsed={"source": "Object.keys(window.google_tag_manager)", "ids": tag_ids})
        present = {k for k, v in (cap.globals_present or {}).items() if v}
        for v in VENDORS:
            hit = [g for g in v.globals if g in present]
            if hit:
                self.store.add(source_type=SourceType.RUNTIME_JS, phase=phase, page_url=page_url, vendor_hint=v.id,
                               confidence=Confidence.MEDIUM, parsed={"globals": hit})

    def _rendered_scripts(self, rendered: str, page_url: str, phase: Phase) -> None:
        """Vendor <script> elements present in the rendered DOM (each element executes, even when
        Chromium coalesces identical in-flight fetches into a single network request)."""
        html = blank_inert(rendered)
        for m in re.finditer(r"<script\b[^>]*\bsrc\s*=\s*(['\"])(.*?)\1[^>]*>", html, re.I | re.S):
            src = m.group(2).replace("&amp;", "&").strip()
            matches = vendors_for_url(src)
            if not matches:
                continue
            s_url, red, _h, _p = sanitize_url(src)
            self.store.add(source_type=SourceType.RENDERED_DOM, phase=phase, page_url=page_url, script_url=s_url,
                           vendor_hint=matches[0][0].id, confidence=Confidence.HIGH,
                           parsed={"kind": "script_element", "all_vendor_matches": [x[0].id for x in matches],
                                   "ids": sorted({i for x in matches for i in x[0].extract_ids(src, "url")})},
                           redaction=red)

    def _consent(self, cap: PhaseCapture, page_url: str, phase: Phase) -> None:
        if cap.consent_mode_ics:
            self.store.add(source_type=SourceType.CONSENT_MODE, phase=phase, page_url=page_url,
                           consent_state=cap.consent_mode_ics, confidence=Confidence.HIGH,
                           parsed={"source": "window.google_tag_data.ics (end of phase)"})
        signal: Dict[str, Any] = {"detected_adapters": cap.cmp_detected, "banner_visible_selector": cap.banner_selector}
        if cap.tcf:
            signal["tcf"] = cap.tcf
        if cap.cmp_detected or cap.banner_selector or cap.tcf:
            self.store.add(source_type=SourceType.CMP, phase=phase, page_url=page_url, cmp_signal=signal,
                           confidence=Confidence.HIGH if cap.cmp_detected else Confidence.MEDIUM,
                           vendor_hint=cap.cmp_detected[0] if cap.cmp_detected else None)
        if cap.interaction is not None:
            self.store.add(source_type=SourceType.CMP, phase=phase, page_url=page_url,
                           cmp_signal={"interaction": cap.interaction.to_dict()},
                           t_ms=cap.interaction.t_end_ms, confidence=Confidence.HIGH)

    def _cookies(self, cookies: List[Dict[str, Any]], page_url: str, phase: Phase, stage: str) -> None:
        for c in cookies or []:
            name = str(c.get("name", ""))[:120]
            domain = str(c.get("domain", "")).lstrip(".")
            value = c.get("value") or ""
            _sv, red, hits = redact_value(value, name, "cookie_value")
            expires = c.get("expires")
            attrs = {"path": c.get("path"), "secure": c.get("secure"), "httpOnly": c.get("httpOnly"),
                     "sameSite": c.get("sameSite"), "session": (expires is None or expires < 0),
                     "expires": _iso(expires) if expires and expires > 0 else None,
                     "value_length": len(value), "stage": stage}
            # value never stored; record only PII classification of the value
            pii_kinds = sorted({h.kind for h in hits if h.is_value and h.kind not in ("online_identifier",)})
            if pii_kinds:
                attrs["value_pii_kinds"] = pii_kinds
            ev = self.store.add(source_type=SourceType.COOKIE, phase=phase, page_url=page_url, cookie_name=name,
                                cookie_domain=domain, cookie_attributes=attrs,
                                third_party=self._is_third_party(domain), confidence=Confidence.HIGH,
                                redaction=Redaction(redacted=True, fields=["value"]))
            if pii_kinds:
                self._record_hits([h for h in hits if h.kind in pii_kinds], ev)

    def _storage(self, items: Dict[str, str], stype: SourceType, page_url: str, phase: Phase) -> None:
        for k, v in (items or {}).items():
            _sv, red, hits = redact_value(v, k, stype.value)
            # also scan JSON values deeply for PII values
            if v and v[:1] in "{[":
                try:
                    import json
                    _o, r2, h2 = sanitize_obj(json.loads(v), stype.value)
                    hits = hits + h2
                except Exception:
                    pass
            kinds = sorted({h.kind for h in hits if h.is_value and h.kind not in ("online_identifier", "credential")})
            ev = self.store.add(source_type=stype, phase=phase, page_url=page_url, storage_key=str(k)[:200],
                                confidence=Confidence.HIGH,
                                parsed={"value_length": len(v or ""), **({"value_pii_kinds": kinds} if kinds else {})},
                                redaction=Redaction(redacted=True, fields=["value"]))
            self._record_hits([h for h in hits if h.kind not in ("online_identifier",)], ev)

    def _policy_links(self, links: List[Dict[str, str]], page_url: str, phase: Phase) -> None:
        seen = set()
        for ln in links or []:
            href, text = ln.get("href", ""), ln.get("text", "")
            if not href or href.startswith(("javascript:", "mailto:", "tel:")):
                continue
            if POLICY_TEXT_RE.search(text or "") or POLICY_HREF_RE.search(href):
                s, red, _h, _p = sanitize_url(href)
                if s in seen:
                    continue
                seen.add(s)
                t, _r, _ = redact_text(text, 80)
                self.store.add(source_type=SourceType.POLICY_LINK, phase=phase, page_url=page_url, request_url=s,
                               snippet=t, domain=urlsplit(href).hostname, confidence=Confidence.MEDIUM, redaction=red)

    def _console(self, cap: PhaseCapture, page_url: str, phase: Phase) -> None:
        for c in cap.console_errors[:25]:
            t, red, hits = redact_text(c.get("text", ""), 300, "console")
            self.store.add(source_type=SourceType.CONSOLE, phase=phase, page_url=page_url, t_ms=c.get("t"),
                           snippet=t, confidence=Confidence.HIGH, redaction=red)

    # links for crawler (sanitized, no fragments)
    @staticmethod
    def raw_links(cap: PhaseCapture) -> List[str]:
        return [ln.get("href", "") for ln in cap.links or []]
