"""Redaction / PII classification unit tests (including false positives)."""
import pytest

from datatrust.redaction import (find_pii_spans, key_kind, redact_text, redact_value, sanitize_body,
                                 sanitize_obj, sanitize_url)


def kinds(text, key=None):
    return [k for _s, _e, k in find_pii_spans(text, key)]


@pytest.mark.parametrize("text", ["joao@email.com", "Maria.Silva+promo@example.com.br", "x%40y.com"])
def test_email_detected(text):
    v, red, hits = redact_value(text, "q")
    assert "@" not in v and "[REDACTED_EMAIL]" in v
    assert hits and hits[0].is_value and hits[0].kind == "email"


@pytest.mark.parametrize("text", ["logo@2x.png", "icon@3x.webp", "sprite@2x.svg", "v1.2.3", "user@localhost"])
def test_email_false_positives(text):
    assert "email" not in kinds(text)


def test_cpf_formatted_valid_and_invalid():
    assert kinds("529.982.247-25") == ["cpf"]
    assert kinds("123.456.789-00") == []          # invalid check digits
    assert kinds("111.111.111-11") == []          # repeated digits


def test_cpf_unformatted_needs_context():
    assert kinds("52998224725") == []             # 11 digits alone: could be any id
    assert kinds("52998224725", "cpf") == ["cpf"]
    assert kinds("52998224725", "customer_document_cpf") == ["cpf"]


def test_phone():
    assert kinds("(11) 91234-5678") == ["phone"]
    assert kinds("+55 11 91234-5678") == ["phone"]
    assert kinds("11912345678") == []             # no context
    assert kinds("11912345678", "phone") == ["phone"]
    assert kinds("+5511912345678", "whatsapp") == ["phone"]


@pytest.mark.parametrize("text", ["1729900000000", "20241025", "SKU-12345678", "order 98765432", "G-ABC123XYZ9"])
def test_ids_and_timestamps_are_not_pii(text):
    assert kinds(text) == []


def test_card_requires_luhn_and_separator_or_context():
    assert kinds("4111 1111 1111 1111") == ["card"]
    assert kinds("4111111111111111") == []
    assert kinds("4111111111111111", "card_number") == ["card"]
    assert kinds("4111 1111 1111 1112") == []


def test_key_patterns_without_values_are_not_observed_pii():
    v, red, hits = redact_value("not_provided", "user_email")
    assert v == "[WITHHELD_EMAIL]"
    assert hits[0].is_value is False and hits[0].to_dict()["classification"] == "PII_KEY_PATTERN"
    v, red, hits = redact_value("", "email")
    assert hits == []                              # empty value: nothing to report


def test_key_kind_vendor_prefixes():
    assert key_kind("ud[em]") == "email"
    assert key_kind("ep.user_phone") == "phone"
    assert key_kind("cid") == "online_identifier"
    assert key_kind("item_name") is None
    assert key_kind("name") is None                # too generic


def test_hashed_identifier():
    v, red, hits = redact_value("a" * 64, "em")
    assert v == "[HASHED_VALUE]" and hits[0].kind == "hashed_identifier"


def test_sanitize_url_redacts_query_and_fragment():
    u, red, hits, params = sanitize_url("https://x.com/p?email=joao%40email.com&cid=123.456&q=shoes#access_token=abc")
    assert "joao" not in u and "123.456" not in u and "abc" not in u
    assert "email=[REDACTED_EMAIL]" in u
    assert "q=shoes" in u
    assert {h.kind for h in hits} >= {"email", "online_identifier"}


def test_sanitize_url_path_email():
    u, red, hits, _ = sanitize_url("https://x.com/unsubscribe/joao@email.com")
    assert "joao" not in u


def test_sanitize_body_ga4_batch():
    body = "en=page_view&ep.x=1\nen=login&ep.user_email=ana%40ex.com"
    s, red, hits, lines = sanitize_body(body)
    assert "ana" not in s and len(lines) == 2
    assert any(h.kind == "email" and h.is_value for h in hits)


def test_sanitize_obj_deep_and_numbers():
    o, red, hits = sanitize_obj({"user": {"email": "a@b.com", "phone": 11912345678}, "value": 59.9})
    assert o["user"]["email"] == "[REDACTED_EMAIL]"
    assert "11912345678" not in str(o)
    assert o["value"] == 59.9


def test_redact_text_free_text():
    t, red, hits = redact_text("contact me at ana@example.org or (21) 99876-5432")
    assert "ana@" not in t and "99876" not in t
