"""
URL validation and SSRF protection.

Layers (all must pass):
1. Syntactic validation (scheme, host, port, credentials, length).
2. Hostname deny-list (localhost, *.internal, metadata hostnames ...).
3. DNS resolution — EVERY resolved address must be globally routable.
   Literal IPs in any notation (decimal, octal, IPv4-mapped IPv6) are covered
   because they are resolved through ``getaddrinfo`` as well.
4. The resolved IP of the target host is *pinned* into Chromium via
   ``--host-resolver-rules`` so a DNS-rebinding answer cannot change the
   destination of the main navigation after validation.
5. Every request/sub-request/redirect/websocket issued by the browser is
   re-validated by ``RequestGuard`` (Playwright ``route``) before it leaves.

Residual risk (documented in ACCURACY_AND_LIMITATIONS.md): third-party
sub-requests are checked against our own DNS resolution, but Chromium resolves
them again itself (TOCTOU). Production deployments must additionally run the
scanner in a network namespace / container whose egress firewall drops
private, loopback, link-local and metadata ranges.
"""
from __future__ import annotations

import ipaddress
import os
import socket
import threading
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urlsplit

ALLOWED_SCHEMES = {"http", "https"}
ALLOWED_TARGET_PORTS = {None, 80, 443, 8080, 8443}
MAX_URL_LENGTH = 2048

_BLOCKED_HOSTNAMES = {
    "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
    "metadata", "metadata.google.internal", "metadata.goog", "instance-data",
    "instance-data.ec2.internal", "kubernetes", "kubernetes.default", "kubernetes.default.svc",
}
_BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa",
                     ".corp", ".cluster.local", ".svc")

# Explicit ranges (in addition to ipaddress' is_global check) so intent is auditable.
_BLOCKED_NETWORKS = [ipaddress.ip_network(n) for n in (
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15",
    "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32",
    "::/128", "::1/128", "::ffff:0:0/96", "64:ff9b::/96", "100::/64", "fc00::/7", "fe80::/10",
    "ff00::/8", "2001:db8::/32",
)]
_METADATA_IPS = {ipaddress.ip_address(x) for x in ("169.254.169.254", "169.254.170.2", "fd00:ec2::254", "100.100.100.200")}


class UrlRejected(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


Resolver = Callable[[str, int], List[str]]


def system_resolver(host: str, port: int) -> List[str]:
    infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    return sorted({info[4][0] for info in infos})


def ip_is_blocked(ip_str: str) -> Optional[str]:
    """Return a reason string if the IP must not be contacted, else None."""
    try:
        ip = ipaddress.ip_address(ip_str.split("%")[0])
    except ValueError:
        return "unparseable_ip"
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        mapped = ip_is_blocked(str(ip.ipv4_mapped))
        if mapped:
            return f"ipv4_mapped:{mapped}"
    if ip in _METADATA_IPS:
        return "cloud_metadata_endpoint"
    for net in _BLOCKED_NETWORKS:
        if ip.version == net.version and ip in net:
            return f"blocked_range:{net}"
    if not ip.is_global:
        return "not_globally_routable"
    return None


def hostname_is_blocked(host: str) -> Optional[str]:
    h = (host or "").strip().lower().rstrip(".")
    if not h:
        return "empty_host"
    if h in _BLOCKED_HOSTNAMES:
        return "blocked_hostname"
    if any(h.endswith(s) for s in _BLOCKED_SUFFIXES):
        return "blocked_hostname_suffix"
    return None


@dataclass
class ValidatedTarget:
    url: str
    scheme: str
    host: str
    port: int
    resolved_ips: List[str]

    @property
    def pinned_ip(self) -> str:
        # prefer IPv4 for Chromium host-resolver-rules simplicity
        v4 = [ip for ip in self.resolved_ips if ":" not in ip]
        return (v4 or self.resolved_ips)[0]


def normalize_input_url(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        raise UrlRejected("INVALID_URL", "empty")
    if len(value) > MAX_URL_LENGTH:
        raise UrlRejected("INVALID_URL", "too_long")
    if "://" not in value:
        value = "https://" + value
    return value


def _test_allowlist() -> Set[Tuple[str, int]]:
    """
    Test-only escape hatch so local fixture servers can be scanned.
    Format: DATATRUST_TEST_ALLOW_HOSTS="127.0.0.1:8765,127.0.0.1:8766".
    Never set this in production; it is not reachable through the API.
    """
    raw = os.getenv("DATATRUST_TEST_ALLOW_HOSTS", "")
    out: Set[Tuple[str, int]] = set()
    for item in raw.split(","):
        item = item.strip()
        if not item or ":" not in item:
            continue
        h, p = item.rsplit(":", 1)
        try:
            out.add((h.lower(), int(p)))
        except ValueError:
            continue
    return out


def is_test_allowed(host: str, port: int) -> bool:
    return ((host or "").lower(), port) in _test_allowlist()


def validate_url(raw: str, resolver: Resolver = system_resolver, *, is_target: bool = True) -> ValidatedTarget:
    url = normalize_input_url(raw) if is_target else raw
    try:
        parts = urlsplit(url)
    except Exception:
        raise UrlRejected("INVALID_URL", "unparseable")
    scheme = (parts.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UrlRejected("INVALID_URL", f"scheme_not_allowed:{scheme}")
    if parts.username or parts.password:
        raise UrlRejected("INVALID_URL", "credentials_in_url")
    host = (parts.hostname or "").lower().rstrip(".")
    try:
        port = parts.port
    except ValueError:
        raise UrlRejected("INVALID_URL", "invalid_port")
    effective_port = port or (443 if scheme == "https" else 80)

    allow = _test_allowlist()
    if (host, effective_port) in allow:
        return ValidatedTarget(url=url, scheme=scheme, host=host, port=effective_port, resolved_ips=[host])

    if is_target and port not in ALLOWED_TARGET_PORTS:
        raise UrlRejected("BLOCKED_TARGET", f"port_not_allowed:{port}")
    reason = hostname_is_blocked(host)
    if reason:
        raise UrlRejected("BLOCKED_TARGET", reason)
    if is_target and "." not in host and ":" not in host:
        # single-label names resolve via search domains -> internal hosts
        try:
            ipaddress.ip_address(host)
        except ValueError:
            raise UrlRejected("INVALID_URL", "single_label_hostname")

    try:
        ips = resolver(host, effective_port)
    except socket.gaierror as exc:
        raise UrlRejected("DNS_FAILURE", f"dns_resolution_failed:{exc.__class__.__name__}")
    except Exception as exc:
        raise UrlRejected("DNS_FAILURE", f"dns_error:{exc.__class__.__name__}")
    if not ips:
        raise UrlRejected("DNS_FAILURE", "no_addresses")
    for ip in ips:
        r = ip_is_blocked(ip)
        if r:
            raise UrlRejected("BLOCKED_TARGET", f"resolves_to_blocked_address:{r}")
    return ValidatedTarget(url=url, scheme=scheme, host=host, port=effective_port, resolved_ips=list(ips))


@dataclass
class RequestGuard:
    """
    Per-scan guard used to vet every browser request.
    Caches decisions per (host, port) to avoid repeated DNS lookups.
    """
    resolver: Resolver = system_resolver
    blocked: List[Dict[str, str]] = field(default_factory=list)
    _cache: Dict[Tuple[str, int], Optional[str]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def check(self, url: str) -> Optional[str]:
        """Return None if allowed, else a reason."""
        try:
            parts = urlsplit(url)
        except Exception:
            return "unparseable"
        scheme = (parts.scheme or "").lower()
        if scheme in ("data", "blob", "about"):
            return None
        if scheme not in ("http", "https", "ws", "wss"):
            return f"scheme_not_allowed:{scheme}"
        if parts.username or parts.password:
            return "credentials_in_url"
        host = (parts.hostname or "").lower().rstrip(".")
        try:
            port = parts.port or (443 if scheme in ("https", "wss") else 80)
        except ValueError:
            return "invalid_port"
        key = (host, port)
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        if key in _test_allowlist():
            decision = None
        else:
            decision = hostname_is_blocked(host)
            if not decision:
                try:
                    ips = self.resolver(host, port)
                    if not ips:
                        decision = "no_addresses"
                    for ip in ips:
                        r = ip_is_blocked(ip)
                        if r:
                            decision = f"resolves_to_blocked_address:{r}"
                            break
                except Exception:
                    # Unresolvable hosts cannot be reached anyway; let the browser fail naturally
                    # but do not cache as allowed for other ports.
                    decision = None
        with self._lock:
            self._cache[key] = decision
        return decision

    def record_block(self, url: str, reason: str, resource_type: str = "") -> None:
        host = ""
        try:
            host = urlsplit(url).hostname or ""
        except Exception:
            pass
        self.blocked.append({"host": host, "reason": reason, "resource_type": resource_type})


def chromium_pin_args(target: ValidatedTarget) -> List[str]:
    """Pin the validated target host to the validated IP (anti DNS-rebinding)."""
    if target.host == target.pinned_ip:
        return []
    ip = target.pinned_ip
    if ":" in ip:
        ip = f"[{ip}]"
    return [f"--host-resolver-rules=MAP {target.host} {ip}"]
