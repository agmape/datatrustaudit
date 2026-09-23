import socket

import pytest

from audit_engine.url_security import UnsafeURLError, validate_public_url, validate_redirect_target


def _resolver(mapping):
    def resolve(host, port, type=socket.SOCK_STREAM):
        ip = mapping[host]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]
    return resolve


def test_rejects_localhost():
    with pytest.raises(UnsafeURLError):
        validate_public_url("http://localhost:8000")


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://192.168.1.2/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/",
])
def test_rejects_non_public_literal_ips(url):
    with pytest.raises(UnsafeURLError):
        validate_public_url(url)


def test_rejects_hostname_resolving_to_private_ip():
    resolver = _resolver({"evil.example": "10.10.10.10"})
    with pytest.raises(UnsafeURLError):
        validate_public_url("https://evil.example/path", resolver=resolver)


def test_accepts_hostname_resolving_to_public_ip():
    resolver = _resolver({"example.test": "8.8.8.8"})
    assert validate_public_url("https://example.test/path", resolver=resolver) == "https://example.test/path"


def test_revalidates_redirect_target():
    resolver = _resolver({"public.example": "8.8.8.8", "private.example": "192.168.1.10"})
    current = validate_public_url("https://public.example", resolver=resolver)
    with pytest.raises(UnsafeURLError):
        validate_redirect_target(current, "https://private.example/admin", resolver=resolver)
