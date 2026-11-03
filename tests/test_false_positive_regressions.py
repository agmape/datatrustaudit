"""
Regressions found while reviewing real reports (2026-11-03).

1. Key names were matched on raw substrings, so ordinary fields became personal data:
   "graph_id"/"phase" -> phone context, "company_id" -> card context,
   "acceptCookies" -> postal code (cep), "adobe_mc" -> birth date (dob), "is_mobile" -> phone.
   A 10-digit unix timestamp under such a key was reported as an OBSERVED phone number.
2. GA4 hits sent through a first-party path (Google tag gateway / server-side GTM,
   e.g. /w3l5tr8/ag/g/c?v=2&tid=G-...) were not recognised, so the report said no GA4 hit was sent.
3. Meta Pixel POST /tr/ bodies are multipart/form-data; they were parsed as url-encoded lines,
   losing pixel id / event and leaving values (e.g. an e-mail) un-redacted inside keys.
"""
import pytest

from datatrust.catalog import vendors_for_url
from datatrust.normalize import parse_ga4_hit, parse_meta_hit
from datatrust.redaction import key_kind, redact_value, sanitize_body, sanitize_url


@pytest.mark.parametrize("key,value", [
    ("graph_id", "1234567890"), ("phase", "1730650000"), ("hotel_id", "1234567890"),
    ("alpha", "11987654321"), ("is_mobile", "1730650000"), ("mobile_app_version", "2026110312"),
    ("phone_model", "11987654321"), ("company_id", "4111111111111111"), ("span_id", "4111111111111111"),
    ("document_referrer", "52998224725"),
])
def test_unrelated_keys_do_not_create_observed_pii(key, value):
    _, _, hits = redact_value(value, key)
    assert not [h for h in hits if h.is_value], (key, value, hits)


@pytest.mark.parametrize("key", ["acceptCookies", "adobe_mc", "receptor", "exceptions", "street_view_mode",
                                 "email_verified", "ip_address", "H4sIAAAAAAAACoWT0U7bMBSGXyU71w4kTdI2uZloBaiCgUYzNgn14sQ"])
def test_key_kind_ignores_non_pii_keys(key):
    assert key_kind(key) is None


@pytest.mark.parametrize("key,kind", [
    ("em", "email"), ("ud[em]", "email"), ("customerEmail", "email"), ("user_email", "email"),
    ("phone", "phone"), ("telefone", "phone"), ("mobile_number", "phone"), ("cpf", "cpf"),
    ("firstName", "first_name"), ("last_name", "last_name"), ("cep", "postal_code"), ("zipCode", "postal_code"),
    ("dob", "birth_date"), ("data_nascimento", "birth_date"), ("billing_address", "address"),
    ("password", "credential"), ("access_token", "credential"),
])
def test_key_kind_still_detects_real_pii_keys(key, kind):
    assert key_kind(key) == kind


def test_real_values_still_detected_with_context():
    assert redact_value("11987654321", "user_phone")[2][0].kind == "phone"
    assert redact_value("4111111111111111", "card_number")[2][0].kind == "card"
    assert redact_value("52998224725", "tax_id")[2][0].kind == "cpf"
    assert redact_value("joao@exemplo.com.br", "anything")[2][0].kind == "email"


def test_ga4_first_party_gateway_is_recognised_and_parsed():
    url = "https://www.loja.com.br/w3l5tr8/ag/g/c?v=2&tid=G-Q68S4NB67S&cid=123.456&en=page_view&dl=https%3A%2F%2Fwww.loja.com.br%2F"
    assert ("ga4", "beacon") in [(v.id, k) for v, k in vendors_for_url(url)]
    _, _, _, params = sanitize_url(url, "")
    events = parse_ga4_hit(params, [])
    assert [e["en"] for e in events] == ["page_view"]
    assert events[0]["tid"] == "G-Q68S4NB67S"


def test_unrelated_v2_api_is_not_ga4():
    assert vendors_for_url("https://api.example.com/items?v=2&tid=G-ABC") == []


def test_meta_multipart_body_is_parsed_and_redacted():
    b = "------WebKitFormBoundaryJW\r\n"
    body = (b + 'Content-Disposition: form-data; name="id"\r\n\r\n477103232470400\r\n'
            + b + 'Content-Disposition: form-data; name="ev"\r\n\r\nPageView\r\n'
            + b + 'Content-Disposition: form-data; name="ud[em]"\r\n\r\njoao.silva@gmail.com\r\n'
            + "------WebKitFormBoundaryJW--\r\n")
    out, _, hits, lines = sanitize_body(body)
    assert "joao.silva" not in out
    meta = parse_meta_hit(lines[0])
    assert meta["pixel_id"] == "477103232470400" and meta["event"] == "PageView"
    assert meta["user_data_keys"] == ["em"]
    assert any(h.kind == "email" and h.is_value for h in hits)


def test_assistant_rejects_answers_with_ids_not_in_report():
    from datatrust.assistant import ungrounded_references
    ctx = {"findings": [{"id": "F-001"}, {"id": "F-002"}], "tags": [{"ids": ["GTM-W3L5TR8", "G-Q68S4NB67S"]}]}
    ok = "O container GTM-W3L5TR8 envia para G-Q68S4NB67S antes do consentimento [F-001] [S1]."
    assert ungrounded_references(ok, ctx, 1) == []
    bad = "Há um segundo container GTM-ABC1234 duplicado [F-009] [S3]. Exemplo de ID: G-XXXXXXX."
    assert ungrounded_references(bad, ctx, 1) == ["F-009", "GTM-ABC1234", "S3"]
