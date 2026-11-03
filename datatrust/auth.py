"""
Supabase JWT verification and request principals.

Verified: signature, expiry, issuer (``<SUPABASE_URL>/auth/v1``), audience (``authenticated``),
and the ``role`` claim (anon/service tokens are rejected). Algorithms are pinned:

* HS256  -> legacy shared secret ``SUPABASE_JWT_SECRET`` (only when configured)
* ES256 / RS256 -> keys from the project's JWKS (``/auth/v1/.well-known/jwks.json``), cached

Nothing is ever disabled to "make login work". There is no development/synthetic admin: the
DEV_ADMIN_MODE variables that may exist in old .env files are ignored.

Role and plan are read from OUR database (server-controlled). Token metadata (user_metadata, even
app_metadata) never grants privileges.
"""
from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import requests
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from sqlalchemy.orm import Session

from . import accounts
from .db import get_session
from .models import Profile
from .plans import ANON, PLAN_IDS, entitlements  # noqa: F401

JWKS_TTL_S = 600
ALLOWED_ASYMMETRIC = ("ES256", "RS256")


class AuthError(Exception):
    def __init__(self, code: str, message: str, status: int = 401):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


# ── configuration ───────────────────────────────────────────────────────────
def supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").strip().rstrip("/")


def issuer() -> str:
    return f"{supabase_url()}/auth/v1"


def audience() -> str:
    return os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")


def auth_configured() -> Dict[str, Any]:
    return {"supabase_url": bool(supabase_url()), "jwt_secret": bool(os.getenv("SUPABASE_JWT_SECRET", "").strip()),
            "jwks_url": f"{issuer()}/.well-known/jwks.json" if supabase_url() else None}


# ── JWKS ────────────────────────────────────────────────────────────────────
_jwks_cache: Dict[str, Any] = {"fetched": 0.0, "keys": {}}
JwksFetcher = Callable[[], Dict[str, Any]]


def _default_fetch_jwks() -> Dict[str, Any]:
    r = requests.get(f"{issuer()}/.well-known/jwks.json", timeout=8)
    r.raise_for_status()
    return r.json()


_fetch_jwks: JwksFetcher = _default_fetch_jwks


def set_jwks_fetcher(fn: Optional[JwksFetcher]) -> None:
    """Test hook."""
    global _fetch_jwks
    _fetch_jwks = fn or _default_fetch_jwks
    _jwks_cache.update({"fetched": 0.0, "keys": {}})


def _jwk_for(kid: Optional[str], force: bool = False) -> Optional[Dict[str, Any]]:
    now = time.time()
    if force or not _jwks_cache["keys"] or now - _jwks_cache["fetched"] > JWKS_TTL_S:
        try:
            data = _fetch_jwks()
        except Exception as exc:
            raise AuthError("AUTH_UNAVAILABLE", f"Cannot fetch signing keys ({exc.__class__.__name__}).", 503)
        _jwks_cache["keys"] = {k.get("kid"): k for k in data.get("keys", [])}
        _jwks_cache["fetched"] = now
    return _jwks_cache["keys"].get(kid)


# ── verification ────────────────────────────────────────────────────────────
def verify_token(token: str) -> Dict[str, Any]:
    if not supabase_url():
        raise AuthError("AUTH_NOT_CONFIGURED", "Authentication is not configured on the server.", 503)
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise AuthError("INVALID_TOKEN", "Malformed token.")
    alg = header.get("alg")
    if alg == "HS256":
        secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
        if not secret:
            raise AuthError("AUTH_NOT_CONFIGURED", "HS256 verification is not configured.", 503)
        key: Any = secret
    elif alg in ALLOWED_ASYMMETRIC:
        kid = header.get("kid")
        jwk = _jwk_for(kid) or _jwk_for(kid, force=True)
        if jwk is None:
            raise AuthError("INVALID_TOKEN", "Unknown signing key.")
        if jwk.get("alg") and jwk["alg"] != alg:
            raise AuthError("INVALID_TOKEN", "Algorithm does not match the signing key.")
        key = jwk
    else:
        raise AuthError("INVALID_TOKEN", "Unsupported token algorithm.")
    try:
        claims = jwt.decode(token, key, algorithms=[alg], audience=audience(), issuer=issuer(),
                            options={"require_exp": True, "require_iat": False, "require_sub": True,
                                     "verify_signature": True, "verify_aud": True, "verify_iss": True,
                                     "verify_exp": True, "leeway": 5})
    except ExpiredSignatureError:
        raise AuthError("TOKEN_EXPIRED", "Session expired.")
    except JWTClaimsError:
        raise AuthError("INVALID_TOKEN", "Token claims rejected (issuer/audience).")
    except JWTError:
        raise AuthError("INVALID_TOKEN", "Token signature rejected.")
    if claims.get("role") != "authenticated":
        raise AuthError("INVALID_TOKEN", "Token is not a user session.")
    try:
        uuid.UUID(str(claims["sub"]))
    except (ValueError, KeyError):
        raise AuthError("INVALID_TOKEN", "Invalid subject.")
    return claims


# ── principals ──────────────────────────────────────────────────────────────
@dataclass
class Principal:
    anonymous: bool
    plan: str = ANON
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: str = "user"
    simulated: bool = False              # True while an administrator is in a server-side TEST context
    profile: Optional[Profile] = None
    metered: bool = True
    test: Optional[Dict[str, Any]] = None
    ctx: Optional[Dict[str, Any]] = None
    email_verified: bool = True

    @property
    def is_admin(self) -> bool:
        return not self.anonymous and self.role == "admin"


def _bearer(request: Request) -> Optional[str]:
    h = request.headers.get("authorization", "")
    if not h:
        return None
    parts = h.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("INVALID_TOKEN", "Malformed Authorization header.")
    return parts[1]


def _auth_http_error(e: AuthError) -> HTTPException:
    return HTTPException(status_code=e.status, detail={"error_code": e.code, "message": e.message},
                         headers={"WWW-Authenticate": "Bearer"} if e.status == 401 else None)


def get_principal(request: Request, db: Session = Depends(get_session)) -> Principal:
    """Optional authentication: no header -> anonymous visitor; invalid header -> 401 (never downgraded)."""
    try:
        token = _bearer(request)
        if token is None:
            return Principal(anonymous=True)
        claims = verify_token(token)
    except AuthError as e:
        raise _auth_http_error(e)
    profile = accounts.upsert_profile(db, claims["sub"], claims.get("email"))
    accounts.bootstrap_admin(db, profile, claims)
    from . import plan_config
    plan_config.refresh(db)
    # Plan context is resolved ONLY on the server (subscription or the administrator's stored test
    # context). No client header or token metadata can raise the plan.
    ctx = accounts.resolve_context(db, profile)
    verified = not (claims.get("is_anonymous") or (claims.get("user_metadata") or {}).get("email_verified") is False)
    return Principal(anonymous=False, plan=ctx["plan"], user_id=profile.id, email=profile.email, role=profile.role,
                     simulated=ctx["is_test"], profile=profile, metered=ctx["metered"], test=ctx["test"], ctx=ctx,
                     email_verified=verified)


def require_user(p: Principal = Depends(get_principal)) -> Principal:
    if p.anonymous:
        raise HTTPException(status_code=401, detail={"error_code": "AUTH_REQUIRED", "message": "Sign in required."},
                            headers={"WWW-Authenticate": "Bearer"})
    return p


def require_admin(p: Principal = Depends(require_user)) -> Principal:
    if not p.is_admin:
        raise HTTPException(status_code=403, detail={"error_code": "FORBIDDEN", "message": "Administrator role required."})
    return p
