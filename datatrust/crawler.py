"""
Deep-scan link discovery. Only links actually present in the rendered DOM
(or initial HTML in static mode) are used — URLs are never invented.
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

ASSET_EXT_RE = re.compile(r"\.(?:jpe?g|png|gif|svg|webp|avif|ico|bmp|css|js|mjs|map|json|xml|txt|pdf|zip|rar|gz|7z|"
                          r"docx?|xlsx?|pptx?|csv|mp4|webm|mov|mp3|wav|woff2?|ttf|eot|apk|exe|dmg|rss|atom)$", re.I)
DANGEROUS_RE = re.compile(r"log-?out|sign-?out|sair|/exit\b|delete|remove|destroy|unsubscribe|descadastr|"
                          r"/admin|wp-admin|wp-login|/login|/entrar|/signin|/sign-in|/account|/minha-conta|/my-account|"
                          r"/cart/(?:add|clear|change)|/api/|/graphql|/feed\b|/wp-json", re.I)
DANGEROUS_QUERY_KEYS = {"add-to-cart", "add_to_cart", "remove_item", "action", "logout", "delete", "token",
                        "redirect", "redirect_to", "return_url", "next"}
TRACKING_QUERY_PREFIXES = ("utm_", "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "mc_", "_ga", "_gl", "ref", "srsltid")

PRIORITY_RULES: List[Tuple[str, re.Pattern, int]] = [
    ("privacy_policy", re.compile(r"privac|cookie|lgpd|gdpr|protecao-de-dados|politica", re.I), 90),
    ("product_or_service", re.compile(r"/produto|/product|/p/|/shop|/loja|/servi[cç]o|/service|/planos|/pricing|/precos|/categoria|/category|/collections?/", re.I), 70),
    ("contact", re.compile(r"contato|contact|fale-conosco|atendimento|support", re.I), 60),
    ("cart_checkout", re.compile(r"/carrinho|/cart\b|/checkout|/sacola|/bag\b", re.I), 50),
]


def _host_key(host: str) -> str:
    h = (host or "").lower()
    return h[4:] if h.startswith("www.") else h


def normalize_link(href: str, base: str) -> str:
    try:
        u = urlsplit(urljoin(base, href.strip()))
    except Exception:
        return ""
    if u.scheme not in ("http", "https"):
        return ""
    netloc = u.hostname or ""
    if u.port and not ((u.scheme == "http" and u.port == 80) or (u.scheme == "https" and u.port == 443)):
        netloc = f"{netloc}:{u.port}"
    params = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
              if not k.lower().startswith(TRACKING_QUERY_PREFIXES)]
    path = re.sub(r"/{2,}", "/", u.path or "/")
    return urlunsplit((u.scheme.lower(), netloc.lower(), path, urlencode(params), ""))


def select_pages(home_final_url: str, raw_links: List[str], max_pages: int) -> Dict[str, object]:
    """Return {"selected": [{url, reason, priority}], "discovered": n, "skipped": {reason: count}}."""
    base_host = _host_key(urlsplit(home_final_url).hostname or "")
    home_norm = normalize_link(home_final_url, home_final_url)
    seen_paths = {urlsplit(home_norm).path.rstrip("/") or "/"}
    skipped: Dict[str, int] = {}
    cands: List[Dict[str, object]] = []

    def skip(reason: str):
        skipped[reason] = skipped.get(reason, 0) + 1

    for href in raw_links:
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
            skip("non_http")
            continue
        url = normalize_link(href, home_final_url)
        if not url:
            skip("non_http")
            continue
        u = urlsplit(url)
        if _host_key(u.hostname or "") != base_host:
            skip("other_origin")
            continue
        if ASSET_EXT_RE.search(u.path):
            skip("asset")
            continue
        if DANGEROUS_RE.search(u.path):
            skip("unsafe_or_authenticated_path")
            continue
        keys = {k.lower() for k, _ in parse_qsl(u.query)}
        if keys & DANGEROUS_QUERY_KEYS:
            skip("unsafe_query")
            continue
        path_key = u.path.rstrip("/") or "/"
        if path_key in seen_paths:
            skip("duplicate_path")   # one URL per path avoids query-parameter explosion
            continue
        seen_paths.add(path_key)
        reason, prio = "same_origin_link", 10 - min(path_key.count("/"), 9)
        for name, rx, p in PRIORITY_RULES:
            if rx.search(path_key):
                reason, prio = name, p
                break
        cands.append({"url": url, "reason": reason, "priority": prio})
    cands.sort(key=lambda c: (-int(c["priority"]), len(str(c["url"]))))
    # diversify: at most 2 per category before filling the rest
    picked, per = [], {}
    for c in cands:
        if len(picked) >= max_pages:
            break
        if per.get(c["reason"], 0) >= 2 and c["reason"] != "same_origin_link":
            continue
        per[c["reason"]] = per.get(c["reason"], 0) + 1
        picked.append(c)
    for c in cands:
        if len(picked) >= max_pages:
            break
        if c not in picked:
            picked.append(c)
    return {"selected": picked, "discovered": len(cands), "skipped": skipped}
