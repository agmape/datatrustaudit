import hashlib
import hmac
from types import SimpleNamespace

import api.payments as payments


def _request(secret: str, data_id: str = "ABC123", request_id: str = "req-1", ts: str = "1700000000"):
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    digest = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return SimpleNamespace(
        headers={
            "x-signature": f"ts={ts},v1={digest}",
            "x-request-id": request_id,
        },
        query_params={"data.id": data_id},
    )


def test_mercado_pago_signature_accepts_valid_hmac(monkeypatch):
    secret = "test-secret"
    monkeypatch.setattr(payments, "MP_WEBHOOK_SECRET", secret)
    assert payments._verify_webhook_signature(_request(secret)) is True


def test_mercado_pago_signature_rejects_tampering(monkeypatch):
    secret = "test-secret"
    monkeypatch.setattr(payments, "MP_WEBHOOK_SECRET", secret)
    request = _request(secret)
    request.headers["x-signature"] = "ts=1700000000,v1=deadbeef"
    assert payments._verify_webhook_signature(request) is False


def test_mercado_pago_signature_requires_secret(monkeypatch):
    monkeypatch.setattr(payments, "MP_WEBHOOK_SECRET", "")
    assert payments._verify_webhook_signature(_request("another-secret")) is False
