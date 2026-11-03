"""
SSRF-safe static HTTP fetch (used for redirect pre-flight and as static fallback).

Every redirect hop is re-validated (scheme, hostname, DNS -> public IPs).
The connection is made to the hostname via ``requests``; to avoid a DNS
rebinding race between validation and connect we re-resolve and compare
the peer address after connecting when possible.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import urljoin

import requests

from .url_guard import Resolver, UrlRejected, ip_is_blocked, is_test_allowed, system_resolver, validate_url
from .collector import USER_AGENT

MAX_BYTES = 3_000_000
MAX_HOPS = 8


@dataclass
class StaticFetchResult:
    ok: bool
    final_url: Optional[str] = None
    status: Optional[int] = None
    html: str = ""
    redirect_chain: List[str] = field(default_factory=list)
    error_code: Optional[str] = None
    error: Optional[str] = None
    content_type: Optional[str] = None


def static_fetch(url: str, resolver: Resolver = system_resolver, timeout: float = 20.0) -> StaticFetchResult:
    chain: List[str] = []
    current = url
    session = requests.Session()
    session.trust_env = False  # never route through env proxies implicitly
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
               "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"}
    for _ in range(MAX_HOPS + 1):
        try:
            vt = validate_url(current, resolver, is_target=not chain)
        except UrlRejected as exc:
            code = exc.code if not chain else "BLOCKED_REDIRECT"
            return StaticFetchResult(ok=False, redirect_chain=chain + [current], error_code=code, error=exc.detail)
        chain.append(current)
        try:
            resp = session.get(current, headers=headers, timeout=timeout, allow_redirects=False, stream=True)
        except requests.exceptions.SSLError as exc:
            return StaticFetchResult(ok=False, redirect_chain=chain, error_code="PROTOCOL_ERROR", error=str(exc)[:200])
        except requests.exceptions.Timeout:
            return StaticFetchResult(ok=False, redirect_chain=chain, error_code="TIMEOUT", error="static fetch timeout")
        except requests.exceptions.RequestException as exc:
            return StaticFetchResult(ok=False, redirect_chain=chain, error_code="FETCH_FAILED", error=str(exc)[:200])

        # post-connect peer check (best effort) — defends against rebinding between validate and connect
        try:
            sock = resp.raw._connection.sock  # type: ignore[attr-defined]
            peer = sock.getpeername()[0] if sock else None
            if peer and ip_is_blocked(peer) and not is_test_allowed(vt.host, vt.port):
                resp.close()
                return StaticFetchResult(ok=False, redirect_chain=chain, error_code="BLOCKED_TARGET",
                                         error="connected peer is a blocked address")
        except Exception:
            pass

        if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("Location"):
            nxt = urljoin(current, resp.headers["Location"])
            resp.close()
            current = nxt
            continue

        ctype = resp.headers.get("Content-Type", "")
        body = b""
        try:
            for chunk in resp.iter_content(65536):
                body += chunk
                if len(body) > MAX_BYTES:
                    break
        except Exception:
            pass
        resp.close()
        enc = resp.encoding or "utf-8"
        try:
            html = body.decode(enc, errors="replace")
        except LookupError:
            html = body.decode("utf-8", errors="replace")
        return StaticFetchResult(ok=200 <= resp.status_code < 400, final_url=current, status=resp.status_code,
                                 html=html if "html" in ctype.lower() or html.lstrip().startswith("<") else "",
                                 redirect_chain=chain, content_type=ctype,
                                 error_code=None if resp.status_code < 400 else ("BLOCKED" if resp.status_code in (401, 403, 429) else "FETCH_FAILED"),
                                 error=None if resp.status_code < 400 else f"HTTP {resp.status_code}")
    return StaticFetchResult(ok=False, redirect_chain=chain, error_code="FETCH_FAILED", error="too many redirects")
