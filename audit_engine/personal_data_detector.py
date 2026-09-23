"""
audit_engine.personal_data_detector — Personal data and PII signal detection engine.

Inspects technical evidence visible to the scanner:
- URL query parameters
- dataLayer events and keys
- Analytics event parameters
- Cookie names
- localStorage / sessionStorage keys
- Network request parameters
- HTML form field names

IMPORTANT:
- Values are REDACTED in all findings
- This detects SIGNALS, not confirmed violations
- No finding is fabricated without technical evidence
- STRICT_EVIDENCE_MODE: if no evidence exists, no finding is emitted

LGPD context: Art. 5 I defines personal data as "informação relacionada a
pessoa natural identificada ou identificável."
"""
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

STRICT_MODE = os.getenv("STRICT_EVIDENCE_MODE", "true").lower() == "true"

# ─── Personal data category definitions ───────────────────────────────────────

PERSONAL_DATA_CATEGORIES = {
    "email": {
        "label": "Endereço de e-mail",
        "pattern": re.compile(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
            re.IGNORECASE,
        ),
        "key_patterns": re.compile(
            r"\b(email|e_mail|e-mail|mail|email_address|correio|contact_email|user_email)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "personal",
        "risk": "high",
    },
    "phone": {
        "label": "Número de telefone",
        "pattern": re.compile(
            r"""(?:(?:\+?55[\s\-.]?)?\(?(?:0?[1-9]{2})\)?[\s\-.]?)?(?:9\d{4}|\d{4})[\s\-.]?\d{4}""",
            re.IGNORECASE,
        ),
        "key_patterns": re.compile(
            r"\b(phone|telefone|celular|mobile|fone|tel|phone_number|phone_no|whatsapp|ddd)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "personal",
        "risk": "high",
    },
    "cpf": {
        "label": "CPF (identificador fiscal brasileiro)",
        "pattern": re.compile(
            r"\b\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\-]?\d{2}\b",
            re.IGNORECASE,
        ),
        "key_patterns": re.compile(
            r"\b(cpf|documento|doc_number|fiscal_id|tax_id|cnpj)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "personal",
        "risk": "critical",
    },
    "name": {
        "label": "Nome pessoal",
        "pattern": None,  # No reliable value pattern — match by key name only
        "key_patterns": re.compile(
            r"\b(first_name|last_name|full_name|nome|sobrenome|customer_name|user_name|nome_completo|given_name|family_name)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "personal",
        "risk": "medium",
    },
    "address": {
        "label": "Endereço físico",
        "pattern": None,
        "key_patterns": re.compile(
            r"\b(address|endereco|logradouro|street|street_address|addr|rua|avenida|city|cidade|state|estado|cep|postal_code|zipcode|zip)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "personal",
        "risk": "high",
    },
    "user_id": {
        "label": "Identificador de usuário",
        "pattern": None,
        "key_patterns": re.compile(
            r"\b(user_id|userid|uid|customer_id|customerid|account_id|client_id(?!.*google)|member_id|person_id|id_usuario|id_cliente)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "identifier",
        "risk": "medium",
    },
    "booking_id": {
        "label": "Identificador de reserva/pedido",
        "pattern": None,
        "key_patterns": re.compile(
            r"\b(booking_id|reservation_id|order_id|transaction_id|purchase_id|pedido_id|reserva_id)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "identifier",
        "risk": "low",
    },
    "geolocation": {
        "label": "Geolocalização precisa",
        "pattern": re.compile(
            r"""(?:lat(?:itude)?|lng|lon(?:gitude)?)[\s\"':=]+(-?\d{1,3}\.\d{4,})""",
            re.IGNORECASE,
        ),
        "key_patterns": re.compile(
            r"\b(latitude|longitude|lat|lon|lng|geoip|geolocation|coordinates|coords|location_lat|location_lng)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "personal",
        "risk": "high",
    },
    "device_id": {
        "label": "Identificador de dispositivo persistente",
        "pattern": None,
        "key_patterns": re.compile(
            r"\b(device_id|device_uuid|fingerprint|fp_id|fpid|browser_id|install_id|hardware_id)\b",
            re.IGNORECASE,
        ),
        "lgpd_category": "identifier",
        "risk": "medium",
    },
}


# ─── Redaction helpers ─────────────────────────────────────────────────────────

def _redact_email(value: str) -> str:
    m = re.match(r"([^@]{1,3})[^@]*(@.*)", value)
    if m:
        return m.group(1) + "***" + m.group(2)
    return "***@***"


def _redact_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) >= 8:
        return "(" + digits[:2] + ") *****-" + digits[-4:]
    return "(**) *****-****"


def _redact_cpf(value: str) -> str:
    return "***.***.***-**"


def _redact_generic(value: str) -> str:
    if not value:
        return "[REDACTED]"
    s = str(value)
    if len(s) <= 4:
        return "[REDACTED]"
    visible = min(3, len(s) // 4)
    return s[:visible] + "***"


def redact_value(category: str, raw_value: str) -> str:
    """Redact a detected personal data value for safe reporting."""
    v = str(raw_value or "").strip()
    if not v:
        return "[REDACTED]"
    if category == "email":
        return _redact_email(v)
    if category == "phone":
        return _redact_phone(v)
    if category == "cpf":
        return _redact_cpf(v)
    return _redact_generic(v)


# ─── Data models ───────────────────────────────────────────────────────────────

@dataclass
class PersonalDataFinding:
    """A single personal data signal detected in technical evidence."""
    finding_id: str
    category: str                  # email | phone | cpf | name | address | user_id | ...
    category_label: str            # Human-readable label in Portuguese
    classification: str            # personal | identifier
    confidence: str                # confirmed | probable | possible | not_confirmed
    page_url: str
    timestamp: str
    consent_state: str             # before | rejected | accepted | unknown
    source: str                    # network | cookie | storage | datalayer | form | url_param
    field_name: str                # The key/parameter name that triggered detection
    redacted_value: str            # Redacted value — never the original
    destination_domain: str        # Where it was sent (if applicable)
    first_or_third_party: str      # first_party | third_party | unknown
    request_url_redacted: str      # Redacted URL
    technical_evidence: str        # Human-readable evidence summary
    recommendation: str
    risk_level: str = "medium"     # low | medium | high | critical

    def to_dict(self) -> Dict[str, Any]:
        return {
            "findingId": self.finding_id,
            "category": self.category,
            "categoryLabel": self.category_label,
            "classification": self.classification,
            "confidence": self.confidence,
            "pageUrl": self.page_url,
            "timestamp": self.timestamp,
            "consentState": self.consent_state,
            "source": self.source,
            "fieldName": self.field_name,
            "redactedValue": self.redacted_value,
            "destinationDomain": self.destination_domain,
            "firstOrThirdParty": self.first_or_third_party,
            "requestUrlRedacted": self.request_url_redacted,
            "technicalEvidence": self.technical_evidence,
            "recommendation": self.recommendation,
            "riskLevel": self.risk_level,
        }


# ─── Third-party domain classifier ────────────────────────────────────────────

_KNOWN_ANALYTICS = re.compile(
    r"(google-analytics\.com|analytics\.google\.com|googletagmanager\.com|clarity\.ms"
    r"|amplitude\.com|mixpanel\.com|segment\.com|hotjar\.com|fullstory\.com|mouseflow\.com"
    r"|omtrdc\.net|adobedtm\.com)",
    re.IGNORECASE,
)
_KNOWN_ADVERTISING = re.compile(
    r"(doubleclick\.net|googlesyndication\.com|googleadservices\.com"
    r"|connect\.facebook\.net|facebook\.com/tr|ads\.tiktok\.com"
    r"|static\.ads-twitter\.com|snap\.licdn\.com|px\.ads\.linkedin\.com"
    r"|criteo\.com|taboola\.com|outbrain\.com|pinterest\.com/ct)",
    re.IGNORECASE,
)
_KNOWN_SESSION_REPLAY = re.compile(
    r"(hotjar\.com|fullstory\.com|mouseflow\.com|logrocket\.com|smartlook\.com|inspectlet\.com)",
    re.IGNORECASE,
)


def classify_domain(domain: str, first_party_domain: str) -> Dict[str, str]:
    if not domain:
        return {"type": "unknown", "label": "Desconhecido"}
    d = domain.lower()
    fp = first_party_domain.lower().replace("www.", "")
    if d == fp or d.endswith("." + fp):
        return {"type": "first_party", "label": "Próprio (first-party)"}
    if _KNOWN_SESSION_REPLAY.search(d):
        return {"type": "known_session_replay", "label": "Gravação de sessão (third-party)"}
    if _KNOWN_ADVERTISING.search(d):
        return {"type": "known_advertising", "label": "Publicidade / remarketing (third-party)"}
    if _KNOWN_ANALYTICS.search(d):
        return {"type": "known_analytics", "label": "Analytics (third-party)"}
    return {"type": "unknown_third_party", "label": "Terceiro desconhecido"}


def _redact_url(url: str) -> str:
    """Redact query parameters from URL for safe logging."""
    try:
        parsed = urlparse(url)
        # Keep path, redact query params
        if parsed.query:
            params = parse_qs(parsed.query, keep_blank_values=True)
            redacted_params = {k: ["[REDACTED]"] for k in params}
            from urllib.parse import urlencode
            new_query = urlencode(redacted_params, doseq=True)
            return parsed._replace(query=new_query).geturl()
        return url
    except Exception:
        return url[:100] + "[...]"


# ─── Main detection function ───────────────────────────────────────────────────

def detect_personal_data(
    scan_result: Any,
    url: str,
    timestamp: str,
    consent_state: str = "unknown",
) -> List[PersonalDataFinding]:
    """
    Detect personal data signals in a BrowserScanResult.

    Returns a list of PersonalDataFinding objects. All values are redacted.
    Does NOT fabricate findings — requires actual technical evidence.
    """
    findings: List[PersonalDataFinding] = []
    seen: set = set()  # Deduplication by (category, field_name, source)
    finding_counter = [0]

    parsed_site = urlparse(url)
    first_party_domain = parsed_site.netloc.lower().replace("www.", "")

    def _make_id() -> str:
        finding_counter[0] += 1
        return f"pd_{finding_counter[0]:04d}"

    def _add_finding(
        category: str,
        field_name: str,
        source: str,
        redacted_value: str,
        destination_domain: str,
        request_url: str,
        evidence: str,
        confidence: str,
    ) -> None:
        dedup_key = (category, field_name.lower(), source)
        if dedup_key in seen:
            return
        seen.add(dedup_key)

        cat_def = PERSONAL_DATA_CATEGORIES.get(category, {})
        domain_info = classify_domain(destination_domain, first_party_domain)
        first_third = domain_info["type"] if domain_info["type"] != "unknown" else "unknown"
        if "first_party" in first_third:
            first_third = "first_party"
        elif first_third != "unknown":
            first_third = "third_party"

        findings.append(PersonalDataFinding(
            finding_id=_make_id(),
            category=category,
            category_label=cat_def.get("label", category),
            classification=cat_def.get("lgpd_category", "personal"),
            confidence=confidence,
            page_url=url,
            timestamp=timestamp,
            consent_state=consent_state,
            source=source,
            field_name=field_name,
            redacted_value=redacted_value,
            destination_domain=destination_domain,
            first_or_third_party=first_third,
            request_url_redacted=_redact_url(request_url) if request_url else "",
            technical_evidence=evidence,
            recommendation=(
                "Revise com a equipe jurídica/privacidade: base legal, minimização de dados "
                "e configuração de consentimento para esta transmissão."
            ),
            risk_level=cat_def.get("risk", "medium"),
        ))

    # ── 1. URL parameters of the scanned page ─────────────────────────────────
    try:
        page_params = parse_qs(parsed_site.query, keep_blank_values=True)
        for param_name, values in page_params.items():
            for cat, cat_def in PERSONAL_DATA_CATEGORIES.items():
                key_re = cat_def.get("key_patterns")
                val_re = cat_def.get("pattern")
                if key_re and key_re.search(param_name):
                    raw_val = values[0] if values else ""
                    _add_finding(
                        category=cat,
                        field_name=param_name,
                        source="url_param",
                        redacted_value=redact_value(cat, raw_val),
                        destination_domain=first_party_domain,
                        request_url=url,
                        evidence=f"URL query parameter '{param_name}' matches personal data pattern",
                        confidence="probable",
                    )
                elif val_re and values and val_re.search(values[0]):
                    raw_val = values[0]
                    _add_finding(
                        category=cat,
                        field_name=param_name,
                        source="url_param",
                        redacted_value=redact_value(cat, raw_val),
                        destination_domain=first_party_domain,
                        request_url=url,
                        evidence=f"URL query parameter '{param_name}' contains value matching {cat} pattern",
                        confidence="confirmed",
                    )
    except Exception:
        pass

    # ── 2. dataLayer events ────────────────────────────────────────────────────
    try:
        datalayer = getattr(scan_result, "datalayer_raw", []) or []
        for event in datalayer[:100]:
            if not isinstance(event, dict):
                continue
            _scan_dict_recursive(
                event, "datalayer", "", first_party_domain,
                _add_finding, url,
            )
    except Exception:
        pass

    # ── 3. Network request URLs (intercepted tracking requests) ───────────────
    try:
        intercepted = getattr(scan_result, "intercepted_requests", []) or []
        for req in intercepted[:200]:
            req_url = getattr(req, "url", "") or ""
            req_domain = getattr(req, "domain", "") or ""
            if not req_url:
                continue
            try:
                parsed_req = urlparse(req_url)
                req_params = parse_qs(parsed_req.query, keep_blank_values=True)
                for param_name, values in req_params.items():
                    for cat, cat_def in PERSONAL_DATA_CATEGORIES.items():
                        key_re = cat_def.get("key_patterns")
                        val_re = cat_def.get("pattern")
                        raw_val = values[0] if values else ""
                        matched = False
                        confidence = "probable"
                        if key_re and key_re.search(param_name):
                            matched = True
                        elif val_re and raw_val and val_re.search(raw_val):
                            matched = True
                            confidence = "confirmed"
                        if matched:
                            _add_finding(
                                category=cat,
                                field_name=param_name,
                                source="network",
                                redacted_value=redact_value(cat, raw_val),
                                destination_domain=req_domain or parsed_req.netloc,
                                request_url=req_url,
                                evidence=f"Network request to '{req_domain}' contains parameter '{param_name}'",
                                confidence=confidence,
                            )
            except Exception:
                pass

            # Also check POST data
            post_data = getattr(req, "post_data", "") or ""
            if post_data:
                _scan_post_data(post_data, req_url, req_domain, first_party_domain, _add_finding, url)
    except Exception:
        pass

    # ── 4. Cookie names ────────────────────────────────────────────────────────
    try:
        cookies = getattr(scan_result, "cookies", {}) or {}
        for cookie_name in cookies.keys():
            for cat, cat_def in PERSONAL_DATA_CATEGORIES.items():
                key_re = cat_def.get("key_patterns")
                if key_re and key_re.search(cookie_name):
                    _add_finding(
                        category=cat,
                        field_name=cookie_name,
                        source="cookie",
                        redacted_value="[REDACTED]",
                        destination_domain=first_party_domain,
                        request_url=url,
                        evidence=f"Cookie name '{cookie_name}' matches personal data pattern",
                        confidence="possible",
                    )
    except Exception:
        pass

    # ── 5. localStorage / sessionStorage keys ─────────────────────────────────
    for storage_type, attr_name in [("storage", "local_storage"), ("storage", "session_storage")]:
        try:
            storage = getattr(scan_result, attr_name, {}) or {}
            source_label = "local_storage" if attr_name == "local_storage" else "session_storage"
            for key_name in (storage.keys() if isinstance(storage, dict) else []):
                for cat, cat_def in PERSONAL_DATA_CATEGORIES.items():
                    key_re = cat_def.get("key_patterns")
                    if key_re and key_re.search(key_name):
                        _add_finding(
                            category=cat,
                            field_name=key_name,
                            source=source_label,
                            redacted_value="[REDACTED]",
                            destination_domain=first_party_domain,
                            request_url=url,
                            evidence=f"{source_label} key '{key_name}' matches personal data pattern",
                            confidence="possible",
                        )
        except Exception:
            pass

    return findings


def _scan_dict_recursive(
    d: Any,
    source: str,
    path: str,
    first_party_domain: str,
    add_fn: Any,
    page_url: str,
    depth: int = 0,
) -> None:
    """Recursively scan a dict for personal data keys/values."""
    if depth > 4 or not isinstance(d, dict):
        return
    for k, v in d.items():
        full_path = f"{path}.{k}" if path else k
        k_str = str(k)
        v_str = str(v) if v is not None else ""

        for cat, cat_def in PERSONAL_DATA_CATEGORIES.items():
            key_re = cat_def.get("key_patterns")
            val_re = cat_def.get("pattern")
            matched = False
            confidence = "probable"
            if key_re and key_re.search(k_str):
                matched = True
            elif val_re and v_str and val_re.search(v_str):
                matched = True
                confidence = "confirmed"
            if matched:
                add_fn(
                    category=cat,
                    field_name=full_path,
                    source=source,
                    redacted_value=redact_value(cat, v_str),
                    destination_domain=first_party_domain,
                    request_url=page_url,
                    evidence=f"dataLayer key '{full_path}' matches {cat} pattern",
                    confidence=confidence,
                )

        if isinstance(v, dict):
            _scan_dict_recursive(v, source, full_path, first_party_domain, add_fn, page_url, depth + 1)
        elif isinstance(v, list):
            for item in v[:10]:
                if isinstance(item, dict):
                    _scan_dict_recursive(item, source, full_path + "[]", first_party_domain, add_fn, page_url, depth + 1)


def _scan_post_data(
    post_data: str,
    req_url: str,
    req_domain: str,
    first_party_domain: str,
    add_fn: Any,
    page_url: str,
) -> None:
    """Scan POST body for personal data field names."""
    try:
        import json as _json
        data = _json.loads(post_data)
        if isinstance(data, dict):
            _scan_dict_recursive(data, "network_post", "", req_domain or first_party_domain, add_fn, req_url)
        return
    except Exception:
        pass

    # Form-encoded
    try:
        params = parse_qs(post_data, keep_blank_values=True)
        for k, vals in params.items():
            for cat, cat_def in PERSONAL_DATA_CATEGORIES.items():
                key_re = cat_def.get("key_patterns")
                if key_re and key_re.search(k):
                    add_fn(
                        category=cat,
                        field_name=k,
                        source="network_post",
                        redacted_value=redact_value(cat, vals[0] if vals else ""),
                        destination_domain=req_domain,
                        request_url=req_url,
                        evidence=f"POST parameter '{k}' matches personal data pattern",
                        confidence="probable",
                    )
    except Exception:
        pass
