"""
Redaction and PII classification.

Two different things are reported and must never be confused:

* ``PII_KEY_PATTERN``    — a key/parameter *name* that usually carries personal data
                           (``email``, ``phone``, ``cpf`` ...) was seen. This is NOT proof
                           that personal data was transmitted.
* ``OBSERVED_PII_VALUE`` — a *value* matched a validated personal-data pattern
                           (e-mail syntax, CPF with valid check digits, phone with
                           context, card number passing Luhn ...).

Raw values are never returned. Every function returns a sanitized string plus a
``Redaction`` record and a list of ``PiiHit`` describing what was found *where*
(kind + key + location), never *what* the value was.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, quote, unquote_plus, urlsplit, urlunsplit

from .evidence import Redaction

MAX_VALUE_LEN = 200
MAX_SNIPPET_LEN = 400
MAX_BODY_LEN = 2000


@dataclass
class PiiHit:
    kind: str                 # email | phone | cpf | card | hashed_identifier | online_identifier | credential | <key-kind>
    key: Optional[str]        # parameter / object key where it was seen (may be None for free text)
    location: str             # "query" | "body" | "path" | "datalayer" | "storage" | "html" | "gtag" | "fbq" | "cookie_name"
    is_value: bool            # True => OBSERVED_PII_VALUE ; False => PII_KEY_PATTERN only

    def to_dict(self) -> Dict[str, Any]:
        return {"kind": self.kind, "key": self.key, "location": self.location,
                "classification": "OBSERVED_PII_VALUE" if self.is_value else "PII_KEY_PATTERN"}


# ── value patterns ───────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@([A-Za-z0-9\-]+\.)+([A-Za-z]{2,24})")
_FILE_EXT_TLDS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "js", "css", "ico", "woff", "woff2",
                  "ttf", "map", "json", "html", "htm", "php", "mp4", "webm"}
_CPF_FMT_RE = re.compile(r"(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)")
_CPF_RAW_RE = re.compile(r"(?<!\d)\d{11}(?!\d)")
_PHONE_FMT_RE = re.compile(
    r"(?<!\d)(?<!\d[ .\-])(?:"
    r"\+\d{1,3}[\s.\-]?\(?\d{2,3}\)?[\s.\-]?\d{4,5}[\s.\-]?\d{4}"      # +55 11 91234-5678
    r"|\(\d{2,3}\)\s?\d{4,5}[\s.\-]?\d{4}"                              # (11) 91234-5678
    r"|\d{2}\s\d{4,5}-\d{4}"                                             # 11 91234-5678
    r")(?![\d])(?![ .\-]\d)"
)
_PHONE_E164_RE = re.compile(r"(?<![\w])\+\d{10,15}(?!\d)")
_DIGITS_RE = re.compile(r"(?<!\d)\d{8,15}(?!\d)")
_CARD_RE = re.compile(r"(?<!\d)(?:\d[ \-]?){13,19}(?!\d)")
# without key context, only the canonical isolated 4-4-4-4(-3) layout with one consistent separator counts
_CARD_STRICT_RE = re.compile(r"(?<![\w.\-])\d{4}([ \-])\d{4}\1\d{4}\1\d{4}(?:\1\d{3})?(?![\w.\-])")
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)

# ── key patterns ─────────────────────────────────────────────────────────────
# exact (case-insensitive) short keys used by vendors, and substring keys.
_EXACT_KEYS = {
    "em": "email", "ph": "phone", "fn": "first_name", "ln": "last_name", "db": "birth_date",
    "ct": "city", "zp": "postal_code", "uid": "online_identifier", "cid": "online_identifier",
    "external_id": "online_identifier", "fbp": "online_identifier", "fbc": "online_identifier",
    "user_id": "online_identifier", "userid": "online_identifier", "_gid": "online_identifier",
}
# Key names are matched on WHOLE WORDS (snake_case, kebab-case, dot.case and camelCase are split),
# never on raw substrings: substring matching turned "graph_id"/"phase" into phone context,
# "company_id" into card context, "acceptCookies" into a postal code (cep) and "adobe_mc" into a
# birth date (dob) — producing OBSERVED personal-data findings that were not real.
# Each entry is a tuple of consecutive words; a single-word tuple matches that word exactly.
_KEY_WORDS: List[Tuple[Tuple[str, ...], str]] = [
    (("password",), "credential"), (("passwd",), "credential"), (("senha",), "credential"),
    (("secret",), "credential"), (("access", "token"), "credential"), (("auth", "token"), "credential"),
    (("accesstoken",), "credential"), (("authtoken",), "credential"),
    # NOTE: api_key / write_key are intentionally NOT credentials: browser SDKs (Amplitude, Segment,
    # Maps...) ship public client keys by design. Flagging them produced false positives on real sites.
    (("email",), "email"), (("e", "mail"), "email"), (("emailaddress",), "email"),
    (("phone",), "phone"), (("telefone",), "phone"), (("celular",), "phone"), (("whatsapp",), "phone"),
    (("phonenumber",), "phone"), (("mobile", "number"), "phone"), (("mobile", "phone"), "phone"),
    (("mobilephone",), "phone"), (("tel",), "phone"), (("fone",), "phone"),
    (("cpf",), "cpf"), (("document", "number"), "document"), (("documento",), "document"),
    (("rg", "number"), "document"),
    (("first", "name"), "first_name"), (("firstname",), "first_name"), (("last", "name"), "last_name"),
    (("lastname",), "last_name"), (("full", "name"), "full_name"), (("fullname",), "full_name"),
    (("nome", "completo"), "full_name"), (("sobrenome",), "last_name"),
    (("birth",), "birth_date"), (("birthday",), "birth_date"), (("birthdate",), "birth_date"),
    (("nascimento",), "birth_date"), (("dob",), "birth_date"),
    (("street",), "address"), (("address",), "address"), (("endereco",), "address"),
    (("logradouro",), "address"),
    (("cep",), "postal_code"), (("zipcode",), "postal_code"), (("zip", "code"), "postal_code"),
    (("zip",), "postal_code"), (("postal",), "postal_code"), (("postcode",), "postal_code"),
]
# words that turn a PII-looking key into metadata about the field, not the value itself
# (is_mobile, phone_model, email_verified, address_type, ip_address ...)
_META_WORDS = {"is", "has", "type", "model", "brand", "version", "os", "app", "device", "mode", "view",
               "layout", "format", "verified", "valid", "validated", "enabled", "opt", "optin", "consent",
               "count", "length", "status", "field", "label", "placeholder", "error", "ip", "mac", "wallet",
               "domain", "provider"}
_PHONE_CONTEXT_WORDS = {"phone", "telefone", "celular", "whatsapp", "tel", "fone", "ph", "phonenumber",
                        "mobilephone"}
_CPF_CONTEXT_WORDS = {"cpf", "documento", "taxid"}
_CARD_WORDS = {"card", "cartao", "cc"}
_CARD_NUMBER_WORDS = {"number", "num", "numero", "no", "pan"}
_PLACEHOLDER_VALUES = {"", "undefined", "null", "none", "(not set)", "not set", "false", "true", "0", "[]", "{}"}
_MAX_KEY_LEN = 64


def _strip_key(key: Optional[str]) -> str:
    k = str(key).strip()
    # strip vendor wrappers like ud[em], ep.email, epn.phone
    m = re.match(r"^(?:ud|user_data)\[(\w+)\]$", k, re.I)
    if m:
        k = m.group(1)
    for prefix in ("ep.", "epn.", "up.", "upn.", "cd[", "u."):
        if k.lower().startswith(prefix):
            k = k[len(prefix):].rstrip("]")
    return k


def key_words(key: Optional[str]) -> List[str]:
    """Split a key name into lower-case words (camelCase, snake_case, kebab-case, dots, brackets)."""
    if not key:
        return []
    k = _strip_key(key)
    if len(k) > _MAX_KEY_LEN:
        return []   # not a field name (base64 blobs, serialized JSON used as a key ...)
    k = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", k)
    k = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", k)
    return [w for w in re.split(r"[^a-z0-9]+", k.lower()) if w]


def _has_seq(words: List[str], seq: Tuple[str, ...]) -> bool:
    n = len(seq)
    return any(tuple(words[i:i + n]) == seq for i in range(len(words) - n + 1))


def key_kind(key: Optional[str]) -> Optional[str]:
    """Return the PII category suggested by a key name, or None."""
    if not key:
        return None
    k = _strip_key(key).lower()
    if k in _EXACT_KEYS:
        return _EXACT_KEYS[k]
    words = key_words(key)
    if not words:
        return None
    for seq, kind in _KEY_WORDS:
        if _has_seq(words, seq):
            if kind != "credential" and set(words) & _META_WORDS:
                return None
            return kind
    return None


def _phone_context(key: Optional[str]) -> bool:
    w = set(key_words(key))
    return key_kind(key) == "phone" or (bool(w & _PHONE_CONTEXT_WORDS) and not (w & _META_WORDS))


def _cpf_context(key: Optional[str]) -> bool:
    w = key_words(key)
    return key_kind(key) in ("cpf", "document") or (
        (bool(set(w) & _CPF_CONTEXT_WORDS) or _has_seq(w, ("tax", "id"))) and not (set(w) & _META_WORDS))


def _card_context(key: Optional[str]) -> bool:
    w = set(key_words(key))
    if w & _META_WORDS:
        return False
    return w == {"pan"} or bool(w & _CARD_WORDS and w & _CARD_NUMBER_WORDS) or "ccnumber" in w or "cardnumber" in w


def _cpf_valid(digits: str) -> bool:
    if len(digits) != 11 or len(set(digits)) == 1:
        return False
    nums = [int(c) for c in digits]
    s = sum(nums[i] * (10 - i) for i in range(9))
    d1 = (s * 10 % 11) % 10
    s = sum(nums[i] * (11 - i) for i in range(10))
    d2 = (s * 10 % 11) % 10
    return d1 == nums[9] and d2 == nums[10]


def _luhn_valid(digits: str) -> bool:
    if not (13 <= len(digits) <= 19) or len(set(digits)) == 1:
        return False
    total, alt = 0, False
    for c in reversed(digits):
        n = int(c)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def find_pii_spans(text: str, key: Optional[str] = None) -> List[Tuple[int, int, str]]:
    """Return (start, end, kind) spans of validated personal-data VALUES in ``text``."""
    if not text:
        return []
    spans: List[Tuple[int, int, str]] = []

    for m in _EMAIL_RE.finditer(text):
        tld = m.group(2).lower()
        if tld in _FILE_EXT_TLDS:
            continue  # e.g. logo@2x.png
        spans.append((m.start(), m.end(), "email"))

    for m in _CPF_FMT_RE.finditer(text):
        if _cpf_valid(re.sub(r"\D", "", m.group(0))):
            spans.append((m.start(), m.end(), "cpf"))
    if _cpf_context(key):
        for m in _CPF_RAW_RE.finditer(text):
            if _cpf_valid(m.group(0)):
                spans.append((m.start(), m.end(), "cpf"))

    phone_ctx = _phone_context(key)
    for m in _PHONE_FMT_RE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if 10 <= len(digits) <= 13:
            spans.append((m.start(), m.end(), "phone"))
    if phone_ctx:
        for m in _PHONE_E164_RE.finditer(text):
            spans.append((m.start(), m.end(), "phone"))
        for m in _DIGITS_RE.finditer(text):
            if 10 <= len(m.group(0)) <= 13:
                spans.append((m.start(), m.end(), "phone"))

    card_ctx = _card_context(key)
    for m in (_CARD_RE if card_ctx else _CARD_STRICT_RE).finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if _luhn_valid(digits):
            spans.append((m.start(), m.end(), "card"))

    # merge overlapping spans (keep first/longest)
    spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
    merged: List[Tuple[int, int, str]] = []
    for s in spans:
        if merged and s[0] < merged[-1][1]:
            continue
        merged.append(s)
    return merged


def redact_value(value: Any, key: Optional[str] = None, location: str = "value"
                 ) -> Tuple[str, Redaction, List[PiiHit]]:
    """Redact a scalar value. Returns (sanitized, redaction, hits)."""
    red = Redaction()
    hits: List[PiiHit] = []
    if value is None:
        return "", red, hits
    text = value if isinstance(value, str) else str(value)
    decoded = text
    try:
        if "%" in text or "+" in text:
            decoded = unquote_plus(text)
    except Exception:
        decoded = text

    kk = key_kind(key)
    norm = decoded.strip()
    is_placeholder = norm.lower() in _PLACEHOLDER_VALUES

    # credentials and online identifiers: always withheld, never PII "findings" by themselves
    if kk == "credential" and not is_placeholder:
        red.redacted = True
        red.kinds.append("credential")
        red.fields.append(str(key))
        hits.append(PiiHit("credential", key, location, True))
        return "[REDACTED_CREDENTIAL]", red, hits
    if kk == "online_identifier" and not is_placeholder:
        red.redacted = True
        red.kinds.append("online_identifier")
        red.fields.append(str(key))
        hits.append(PiiHit("online_identifier", key, location, True))
        return "[REDACTED_ID]", red, hits

    if kk and _SHA256_RE.match(norm):   # hashed user data (e.g. Meta advanced matching em/ph/fn/ln/ct/zp)
        red.redacted = True
        red.kinds.append("hashed_identifier")
        red.fields.append(str(key))
        hits.append(PiiHit("hashed_identifier", key, location, True))
        return "[HASHED_VALUE]", red, hits

    spans = find_pii_spans(decoded, key)
    if spans:
        out, last = [], 0
        for s, e, kind in spans:
            out.append(decoded[last:s])
            out.append(f"[REDACTED_{kind.upper()}]")
            last = e
            if kind not in red.kinds:
                red.kinds.append(kind)
            hits.append(PiiHit(kind, key, location, True))
        out.append(decoded[last:])
        sanitized = "".join(out)
        red.redacted = True
        if key:
            red.fields.append(str(key))
    elif kk and not is_placeholder:
        # PII-suggestive key whose value did not match a validated PII pattern:
        # withhold the value anyway, report only the key pattern.
        sanitized = f"[WITHHELD_{kk.upper()}]"
        red.redacted = True
        red.fields.append(str(key))
        hits.append(PiiHit(kk, key, location, False))
    else:
        sanitized = decoded if decoded != text else text

    if len(sanitized) > MAX_VALUE_LEN:
        sanitized = sanitized[:MAX_VALUE_LEN] + "…"
        red.truncated = True
    return sanitized, red, hits


def redact_text(text: str, max_len: int = MAX_SNIPPET_LEN, location: str = "html"
                ) -> Tuple[str, Redaction, List[PiiHit]]:
    """Redact free text (HTML snippets, console messages). Only value patterns apply."""
    red = Redaction()
    hits: List[PiiHit] = []
    if not text:
        return "", red, hits
    spans = find_pii_spans(text, None)
    out, last = [], 0
    for s, e, kind in spans:
        out.append(text[last:s])
        out.append(f"[REDACTED_{kind.upper()}]")
        last = e
        red.redacted = True
        if kind not in red.kinds:
            red.kinds.append(kind)
        hits.append(PiiHit(kind, None, location, True))
    out.append(text[last:])
    result = "".join(out)
    if len(result) > max_len:
        result = result[:max_len] + "…"
        red.truncated = True
    return result, red, hits


def sanitize_url(url: str, location_prefix: str = "") -> Tuple[str, Redaction, List[PiiHit], List[Tuple[str, str]]]:
    """
    Sanitize a URL. Returns (sanitized_url, redaction, hits, sanitized_params).
    ``sanitized_params`` is the list of (key, sanitized_value) pairs, useful for hit parsing.
    """
    red = Redaction()
    hits: List[PiiHit] = []
    params_out: List[Tuple[str, str]] = []
    if not url:
        return "", red, hits, params_out
    try:
        parts = urlsplit(url)
    except Exception:
        s, r, h = redact_text(url, 500, "url")
        return s, r, h, params_out

    # path may carry e-mails (e.g. /unsubscribe/john@x.com)
    path, pred, phits = redact_text(unquote_plus(parts.path), 500, "path")
    red.merge(pred)
    hits.extend(phits)

    q_out = []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        sv, r, h = redact_value(v, k, f"{location_prefix}query")
        red.merge(r)
        hits.extend(h)
        params_out.append((k, sv))
        q_out.append(f"{quote(k, safe='[]._-')}={quote(sv, safe='[]._-:/@')}")
    query = "&".join(q_out)
    # fragments can contain tokens (#access_token=...) — drop content, keep marker
    fragment = "[fragment-removed]" if parts.fragment else ""
    if parts.fragment:
        red.redacted = True
        red.fields.append("#fragment")
    sanitized = urlunsplit((parts.scheme, parts.netloc.split("@")[-1], path, query, fragment))
    return sanitized, red, hits, params_out


def sanitize_obj(obj: Any, location: str = "datalayer", key: Optional[str] = None, depth: int = 0
                 ) -> Tuple[Any, Redaction, List[PiiHit]]:
    """Deep-sanitize JSON-like data (dataLayer pushes, gtag/fbq args, JSON bodies)."""
    red = Redaction()
    hits: List[PiiHit] = []
    if depth > 8:
        red.truncated = True
        return "[DEPTH_LIMIT]", red, hits
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for i, (k, v) in enumerate(obj.items()):
            if i >= 80:
                red.truncated = True
                break
            sv, r, h = sanitize_obj(v, location, str(k), depth + 1)
            out[str(k)[:80]] = sv
            red.merge(r)
            hits.extend(h)
        return out, red, hits
    if isinstance(obj, (list, tuple)):
        out_l = []
        for i, v in enumerate(obj):
            if i >= 50:
                red.truncated = True
                break
            sv, r, h = sanitize_obj(v, location, key, depth + 1)
            out_l.append(sv)
            red.merge(r)
            hits.extend(h)
        return out_l, red, hits
    if isinstance(obj, bool) or obj is None:
        return obj, red, hits
    if isinstance(obj, (int, float)):
        # numbers can be phones/CPFs only with context
        kk = key_kind(key)
        if kk in ("phone", "cpf", "online_identifier", "credential"):
            sv, r, h = redact_value(str(obj), key, location)
            return sv, r, h
        return obj, red, hits
    sv, r, h = redact_value(str(obj), key, location)
    return sv, r, h


_MULTIPART_PART_RE = re.compile(
    r'Content-Disposition:\s*form-data;\s*name="([^"]*)"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n(.*?)\r?\n?(?=--)',
    re.S | re.I)


def _parse_multipart(text: str) -> Optional[List[Tuple[str, str]]]:
    """Parse a multipart/form-data body into (name, value) pairs; None if it is not multipart."""
    first = text.split("\n", 1)[0].strip()
    if not first.startswith("--") or "content-disposition: form-data" not in text[:600].lower():
        return None
    return [(m.group(1), m.group(2)) for m in _MULTIPART_PART_RE.finditer(text + "\n--")]


def sanitize_body(body: Optional[str], content_type: Optional[str] = None, location: str = "body"
                  ) -> Tuple[Optional[str], Redaction, List[PiiHit], List[List[Tuple[str, str]]]]:
    """
    Sanitize a request body. Returns (sanitized_body, redaction, hits, param_lines).
    ``param_lines`` holds parsed key/value lines for url-encoded bodies (GA4 batches
    multiple events, one per line).
    """
    red = Redaction()
    hits: List[PiiHit] = []
    lines_out: List[List[Tuple[str, str]]] = []
    if not body:
        return None, red, hits, lines_out
    text = body[:20000]
    stripped = text.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            data = json.loads(stripped)
            sdata, r, h = sanitize_obj(data, location)
            red.merge(r)
            hits.extend(h)
            out = json.dumps(sdata, ensure_ascii=False)[:MAX_BODY_LEN]
            if len(out) >= MAX_BODY_LEN:
                red.truncated = True
            return out, red, hits, lines_out
        except Exception:
            pass
    mp = _parse_multipart(stripped)
    if mp is not None:
        # multipart/form-data (e.g. Meta Pixel POST /tr/): one event = one line of (name, value) pairs
        pairs, q = [], []
        for k, v in mp:
            sk = k if len(k) <= _MAX_KEY_LEN else k[:_MAX_KEY_LEN] + "…"
            sv, r, h = redact_value(v, k, location)
            red.merge(r)
            hits.extend(h)
            pairs.append((sk, sv))
            q.append(f"{sk}={sv}")
        lines_out.append(pairs)
        out = "&".join(q)
        if len(out) > MAX_BODY_LEN:
            out = out[:MAX_BODY_LEN] + "…"
            red.truncated = True
        return out, red, hits, lines_out
    if "=" in stripped and " " not in stripped.split("\n", 1)[0][:200]:
        out_lines = []
        for line in stripped.splitlines():
            pairs = []
            q = []
            for k, v in parse_qsl(line, keep_blank_values=True):
                sv, r, h = redact_value(v, k, location)
                red.merge(r)
                hits.extend(h)
                pairs.append((k, sv))
                q.append(f"{k}={sv}")
            lines_out.append(pairs)
            out_lines.append("&".join(q))
        out = "\n".join(out_lines)
        if len(out) > MAX_BODY_LEN:
            out = out[:MAX_BODY_LEN] + "…"
            red.truncated = True
        return out, red, hits, lines_out
    s, r, h = redact_text(stripped, MAX_BODY_LEN, location)
    red.merge(r)
    hits.extend(h)
    return s, red, hits, lines_out
