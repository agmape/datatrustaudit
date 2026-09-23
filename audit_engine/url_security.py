"""Central URL/SSRF protection for external website scans.

Every user-supplied URL must pass this module before any HTTP or browser
navigation. The scanner is an SSRF-capable component by design, so we reject
non-public address space both before the request and on redirects/navigation.
"""
from __future__ import annotations

import ipaddress
import socket
from typing import Callable, Iterable
from urllib.parse import urljoin, urlparse, urlunparse


class UnsafeURLError(ValueError):
    """Raised when a scan target is invalid or resolves to non-public network space."""


_BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.aws.internal",
    "metadata.azure.internal",
}

_BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
)


def _normalise(raw_url: str) -> str:
    value = (raw_url or "").strip()
    if not value:
        raise UnsafeURLError("URL is empty")

    if "://" not in value:
        value = "https://" + value

    parsed = urlparse(value)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise UnsafeURLError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeURLError("URL must include a hostname")
    if parsed.username or parsed.password:
        raise UnsafeURLError("Credentials in scan URLs are not allowed")

    # Fragments are browser-local and not needed by the scanner.
    return urlunparse(parsed._replace(fragment=""))


def _assert_public_ip(ip_text: str) -> None:
    try:
        ip = ipaddress.ip_address(ip_text.split("%", 1)[0])
    except ValueError as exc:
        raise UnsafeURLError(f"Invalid resolved IP address: {ip_text}") from exc

    # is_global is intentionally strict. It rejects loopback, private, link-local,
    # carrier-grade NAT, documentation, multicast, unspecified and reserved ranges.
    if not ip.is_global:
        raise UnsafeURLError(f"Target resolves to non-public address space: {ip}")


def _resolve(hostname: str, port: int, resolver: Callable = socket.getaddrinfo) -> Iterable[str]:
    try:
        infos = resolver(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"Could not resolve hostname: {hostname}") from exc

    addresses = []
    for info in infos:
        sockaddr = info[4]
        if sockaddr:
            addresses.append(sockaddr[0])

    if not addresses:
        raise UnsafeURLError(f"Hostname returned no addresses: {hostname}")

    return addresses


def validate_public_url(raw_url: str, resolver: Callable = socket.getaddrinfo) -> str:
    """Return a normalized URL only when every resolved address is public."""
    value = _normalise(raw_url)
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").rstrip(".").lower()

    if hostname in _BLOCKED_HOSTNAMES or hostname.endswith(_BLOCKED_SUFFIXES):
        raise UnsafeURLError(f"Blocked hostname: {hostname}")

    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)

    # Literal IP targets do not require DNS.
    try:
        literal = ipaddress.ip_address(hostname.split("%", 1)[0])
    except ValueError:
        literal = None

    if literal is not None:
        _assert_public_ip(str(literal))
    else:
        for address in _resolve(hostname, port, resolver=resolver):
            _assert_public_ip(address)

    return value


def validate_redirect_target(current_url: str, location: str, resolver: Callable = socket.getaddrinfo) -> str:
    """Resolve a redirect location relative to current_url and re-run SSRF validation."""
    if not location:
        raise UnsafeURLError("Redirect response is missing a Location header")
    return validate_public_url(urljoin(current_url, location), resolver=resolver)
