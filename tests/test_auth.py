"""JWT verification (Supabase) and principals. Tokens are minted locally; nothing here uses real secrets."""
import time
import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from jose import jwk as jose_jwk

from conftest import TEST_JWT_SECRET, TEST_SUPABASE_URL, make_token
from datatrust import auth


@pytest.fixture(autouse=True)
def _reset_jwks():
    auth.set_jwks_fetcher(None)
    yield
    auth.set_jwks_fetcher(None)


def code(fn, *a, **k):
    with pytest.raises(auth.AuthError) as e:
        fn(*a, **k)
    return e.value.code


def test_valid_hs256():
    uid = str(uuid.uuid4())
    claims = auth.verify_token(make_token(sub=uid))
    assert claims["sub"] == uid


def test_expired_token():
    assert code(auth.verify_token, make_token(exp_in=-60)) == "TOKEN_EXPIRED"


def test_wrong_signature():
    assert code(auth.verify_token, make_token(secret="another-secret-another-secret-123456")) == "INVALID_TOKEN"


def test_wrong_issuer_and_audience():
    assert code(auth.verify_token, make_token(iss="https://evil.supabase.co/auth/v1")) == "INVALID_TOKEN"
    assert code(auth.verify_token, make_token(aud="something-else")) == "INVALID_TOKEN"


def test_anon_and_service_role_tokens_are_not_sessions():
    assert code(auth.verify_token, make_token(role="anon")) == "INVALID_TOKEN"
    assert code(auth.verify_token, make_token(role="service_role")) == "INVALID_TOKEN"


def test_missing_exp_and_bad_sub_rejected():
    from jose import jwt
    tok = jwt.encode({"sub": str(uuid.uuid4()), "aud": "authenticated", "role": "authenticated",
                      "iss": f"{TEST_SUPABASE_URL}/auth/v1"}, TEST_JWT_SECRET, algorithm="HS256")
    assert code(auth.verify_token, tok) == "INVALID_TOKEN"
    assert code(auth.verify_token, make_token(sub="not-a-uuid")) == "INVALID_TOKEN"


def test_alg_none_and_garbage_rejected():
    import base64, json
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    none_tok = f"{b({'alg': 'none', 'typ': 'JWT'})}.{b({'sub': str(uuid.uuid4()), 'aud': 'authenticated', 'role': 'authenticated', 'exp': int(time.time()) + 600})}."
    assert code(auth.verify_token, none_tok) == "INVALID_TOKEN"
    assert code(auth.verify_token, "not.a.jwt") == "INVALID_TOKEN"


def test_unsupported_algorithm_rejected():
    assert code(auth.verify_token, make_token(alg="HS512")) == "INVALID_TOKEN"


def test_auth_not_configured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL")
    assert code(auth.verify_token, make_token()) == "AUTH_NOT_CONFIGURED"


def test_hs256_without_secret_is_unavailable_not_accepted(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    assert code(auth.verify_token, make_token()) == "AUTH_NOT_CONFIGURED"


def _rsa_pair(kid="kid-rsa"):
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    pub_pem = priv.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    public = jose_jwk.construct(pub_pem, "RS256").to_dict()
    public.update({"kid": kid, "alg": "RS256", "use": "sig"})
    return pem.decode(), public


def test_rs256_via_jwks_and_key_rotation():
    pem, public = _rsa_pair("k1")
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return {"keys": [public]}

    auth.set_jwks_fetcher(fetch)
    tok = make_token(alg="RS256", key=pem, headers={"kid": "k1"})
    assert auth.verify_token(tok)["role"] == "authenticated"
    # unknown kid -> one forced refresh, then rejected
    tok2 = make_token(alg="RS256", key=pem, headers={"kid": "unknown"})
    assert code(auth.verify_token, tok2) == "INVALID_TOKEN"


def test_jwks_signature_mismatch_rejected():
    pem, public = _rsa_pair("k1")
    other_pem, _ = _rsa_pair("k1")
    auth.set_jwks_fetcher(lambda: {"keys": [public]})
    tok = make_token(alg="RS256", key=other_pem, headers={"kid": "k1"})
    assert code(auth.verify_token, tok) == "INVALID_TOKEN"


def test_es256_via_jwks():
    priv = ec.generate_private_key(ec.SECP256R1())
    pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    pub_pem = priv.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    public = jose_jwk.construct(pub_pem, "ES256").to_dict()
    public.update({"kid": "ec1", "alg": "ES256"})
    auth.set_jwks_fetcher(lambda: {"keys": [public]})
    assert auth.verify_token(make_token(alg="ES256", key=pem, headers={"kid": "ec1"}))["role"] == "authenticated"


def test_algorithm_confusion_blocked():
    """An HS256 token must never be verified with the public JWKS key as the HMAC secret."""
    _, public = _rsa_pair("k1")
    auth.set_jwks_fetcher(lambda: {"keys": [public]})
    forged = make_token(alg="HS256", secret="whatever-whatever-whatever-123456", headers={"kid": "k1"})
    assert code(auth.verify_token, forged) == "INVALID_TOKEN"


def test_jwks_unreachable_is_503_not_acceptance():
    def boom():
        raise RuntimeError("network down")
    auth.set_jwks_fetcher(boom)
    pem, _ = _rsa_pair("k1")
    tok = make_token(alg="RS256", key=pem, headers={"kid": "k1"})
    with pytest.raises(auth.AuthError) as e:
        auth.verify_token(tok)
    assert e.value.status == 503
