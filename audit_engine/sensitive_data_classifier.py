"""
audit_engine.sensitive_data_classifier — LGPD Art. 5 X sensitive personal data classifier.

Sensitive categories under LGPD Art. 5 X:
  - racial or ethnic origin
  - religious belief
  - political opinion
  - union membership
  - data relating to health or sex life
  - genetic data
  - biometric data

IMPORTANT:
- All values are redacted — never stored or transmitted
- Findings are signals, not confirmed violations
- Confidence levels: confirmed | probable | possible | inconclusive
- STRICT_EVIDENCE_MODE: requires actual evidence key/value patterns

Wording is cautious and technical — not legal advice.
"""
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

STRICT_MODE = os.getenv("STRICT_EVIDENCE_MODE", "true").lower() == "true"

# ─── LGPD Art. 5 X Sensitive Categories ───────────────────────────────────────

SENSITIVE_CATEGORIES = {
    "racial_ethnic_origin": {
        "lgpd_article": "Art. 5 X — origem racial ou étnica",
        "label": "Origem racial ou étnica",
        "description": "Dado potencialmente relacionado à origem racial ou étnica do titular",
        "key_patterns": re.compile(
            r"\b(race|ethnicity|raca|etnia|racial_group|ethnic_group|cor_pele|skin_color|racial_origin|ethnic_origin)\b",
            re.IGNORECASE,
        ),
        "value_patterns": re.compile(
            r"\b(white|black|asian|hispanic|latino|indigenous|pardo|preto|branco|amarelo|indigena|afrodescendente)\b",
            re.IGNORECASE,
        ),
        "risk": "critical",
    },
    "religious_belief": {
        "lgpd_article": "Art. 5 X — convicção religiosa",
        "label": "Crença ou convicção religiosa",
        "description": "Dado potencialmente relacionado a crenças ou práticas religiosas do titular",
        "key_patterns": re.compile(
            r"\b(religion|crenca|religiao|faith|belief|denominacao|church|denominacion|mosque|temple|religieux)\b",
            re.IGNORECASE,
        ),
        "value_patterns": re.compile(
            r"\b(catholicism|christianity|islam|judaism|buddhism|catholico|evangelico|espirita|candomble|umbanda|ateu)\b",
            re.IGNORECASE,
        ),
        "risk": "critical",
    },
    "political_opinion": {
        "lgpd_article": "Art. 5 X — opinião política",
        "label": "Opinião política",
        "description": "Dado potencialmente relacionado a opiniões ou filiações políticas do titular",
        "key_patterns": re.compile(
            r"\b(political_affiliation|political_opinion|party|partido|filiacao_politica|political_party|vote|voto|candidato)\b",
            re.IGNORECASE,
        ),
        "value_patterns": None,
        "risk": "critical",
    },
    "union_membership": {
        "lgpd_article": "Art. 5 X — filiação a sindicato ou organização de caráter religioso, filosófico ou político",
        "label": "Filiação sindical ou a organização",
        "description": "Dado potencialmente relacionado à filiação a sindicato ou organização",
        "key_patterns": re.compile(
            r"\b(union|sindicato|syndicat|union_member|labor_union|guild|filiacao_sindical)\b",
            re.IGNORECASE,
        ),
        "value_patterns": None,
        "risk": "critical",
    },
    "health_data": {
        "lgpd_article": "Art. 5 X — dado referente à saúde ou à vida sexual",
        "label": "Dados de saúde",
        "description": "Dado potencialmente relacionado à saúde física ou mental do titular",
        "key_patterns": re.compile(
            r"\b(health|saude|medical|diagnosis|condition|disease|illness|treatment|medication|medicament|prescription"
            r"|cid|icd|patient|paciente|clinico|doenca|enfermidade|sintoma|disability|deficiencia|bmi|imc"
            r"|blood_type|tipo_sanguineo|allergy|alergia|health_status)\b",
            re.IGNORECASE,
        ),
        "value_patterns": re.compile(
            r"\b(diabetes|cancer|hipertensao|depressao|ansiedade|cardiopatia|hiv|aids|autismo|asma|epilepsia)\b",
            re.IGNORECASE,
        ),
        "risk": "critical",
    },
    "sexual_life": {
        "lgpd_article": "Art. 5 X — dado referente à saúde ou à vida sexual",
        "label": "Dados sobre vida sexual ou orientação sexual",
        "description": "Dado potencialmente relacionado à vida sexual ou orientação sexual do titular",
        "key_patterns": re.compile(
            r"\b(sexual_orientation|orientacao_sexual|gender_identity|identidade_genero|sexuality|lgbtq|gay|lesbian|bisexual)\b",
            re.IGNORECASE,
        ),
        "value_patterns": None,
        "risk": "critical",
    },
    "genetic_data": {
        "lgpd_article": "Art. 5 X — dado genético ou biométrico",
        "label": "Dados genéticos",
        "description": "Dado potencialmente relacionado a informações genéticas do titular",
        "key_patterns": re.compile(
            r"\b(genetic|genetico|dna|rna|genome|genoma|snp|genomic|ancestry_genetic)\b",
            re.IGNORECASE,
        ),
        "value_patterns": None,
        "risk": "critical",
    },
    "biometric_data": {
        "lgpd_article": "Art. 5 X — dado genético ou biométrico",
        "label": "Dados biométricos",
        "description": "Dado potencialmente relacionado a identificação biométrica do titular",
        "key_patterns": re.compile(
            r"\b(biometric|biometrico|fingerprint|digital|retina|iris|face_id|facial_recognition"
            r"|reconhecimento_facial|voz|voice_print|palm_print)\b",
            re.IGNORECASE,
        ),
        "value_patterns": None,
        "risk": "critical",
    },
}

# ─── High-risk combination detector ───────────────────────────────────────────

HIGH_RISK_COMBINATIONS = {
    # Sensitive data + persistent identifier + third party + no consent → critical
    "sensitive_transmitted_no_consent": {
        "description": "Dado sensível transmitido para terceiro sem consentimento confirmado",
        "risk": "critical",
        "lgpd_note": (
            "A transmissão de dados sensíveis (Art. 5 X da LGPD) para terceiros "
            "requer consentimento específico e destacado do titular. "
            "Indicador técnico — requer verificação jurídica."
        ),
    },
    "sensitive_before_consent": {
        "description": "Dado sensível detectado antes de qualquer sinal de consentimento",
        "risk": "critical",
        "lgpd_note": (
            "Dados sensíveis processados antes do consentimento podem configurar "
            "infração às hipóteses legais de tratamento (Art. 11 da LGPD). "
            "Indicador técnico — requer verificação jurídica."
        ),
    },
}


# ─── Data model ───────────────────────────────────────────────────────────────

@dataclass
class SensitiveDataFinding:
    finding_id: str
    sensitive_category: str       # racial_ethnic_origin | health_data | biometric_data | ...
    category_label: str
    lgpd_article: str
    description: str
    confidence: str               # confirmed | probable | possible | inconclusive
    page_url: str
    source: str                   # network | datalayer | storage | url_param | form
    field_name: str
    redacted_value: str
    consent_state: str            # before | rejected | accepted | unknown
    destination_domain: str
    first_or_third_party: str
    technical_evidence: str
    legal_note: str
    high_risk_combination: Optional[str] = None
    risk_level: str = "critical"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "findingId": self.finding_id,
            "sensitiveCategory": self.sensitive_category,
            "categoryLabel": self.category_label,
            "lgpdArticle": self.lgpd_article,
            "description": self.description,
            "confidence": self.confidence,
            "pageUrl": self.page_url,
            "source": self.source,
            "fieldName": self.field_name,
            "redactedValue": self.redacted_value,
            "consentState": self.consent_state,
            "destinationDomain": self.destination_domain,
            "firstOrThirdParty": self.first_or_third_party,
            "technicalEvidence": self.technical_evidence,
            "legalNote": self.legal_note,
            "highRiskCombination": self.high_risk_combination,
            "riskLevel": self.risk_level,
        }


# ─── Scanner ──────────────────────────────────────────────────────────────────

def classify_sensitive_data(
    scan_result: Any,
    url: str,
    timestamp: str,
    consent_state: str = "unknown",
    personal_data_findings: Optional[list] = None,
) -> List[SensitiveDataFinding]:
    """
    Classify LGPD Art. 5 X sensitive personal data signals.

    Args:
        scan_result: BrowserScanResult object
        url: Scanned page URL
        timestamp: ISO timestamp
        consent_state: 'before' | 'rejected' | 'accepted' | 'unknown'
        personal_data_findings: Already-detected personal data findings (for combination detection)

    Returns:
        List of SensitiveDataFinding objects with redacted values.
    """
    from audit_engine.personal_data_detector import classify_domain, redact_value
    from urllib.parse import urlparse, parse_qs

    findings: List[SensitiveDataFinding] = []
    seen: set = set()
    counter = [0]

    parsed_site = urlparse(url)
    first_party_domain = parsed_site.netloc.lower().replace("www.", "")

    def _make_id() -> str:
        counter[0] += 1
        return f"sd_{counter[0]:04d}"

    def _add(
        category: str,
        field_name: str,
        source: str,
        raw_value: str,
        destination_domain: str,
        evidence: str,
        confidence: str,
        first_third: str = "unknown",
    ) -> None:
        key = (category, field_name.lower(), source)
        if key in seen:
            return
        seen.add(key)

        cat_def = SENSITIVE_CATEGORIES.get(category, {})
        combo = None
        if first_third == "third_party" and consent_state in ("before", "unknown"):
            combo = "sensitive_transmitted_no_consent"
        elif consent_state == "before":
            combo = "sensitive_before_consent"

        findings.append(SensitiveDataFinding(
            finding_id=_make_id(),
            sensitive_category=category,
            category_label=cat_def.get("label", category),
            lgpd_article=cat_def.get("lgpd_article", "Art. 5 X da LGPD"),
            description=cat_def.get("description", "Dado sensível detectado"),
            confidence=confidence,
            page_url=url,
            source=source,
            field_name=field_name,
            redacted_value=redact_value("generic", raw_value),
            consent_state=consent_state,
            destination_domain=destination_domain,
            first_or_third_party=first_third,
            technical_evidence=evidence,
            legal_note=(
                f"Detectado via '{field_name}'. "
                f"Dados sensíveis ({cat_def.get('lgpd_article','Art. 5 X da LGPD')}) "
                "requerem verificação de base legal e consentimento específico. "
                "Este é um sinal técnico — não constitui conclusão jurídica."
            ),
            high_risk_combination=combo,
            risk_level=cat_def.get("risk", "critical"),
        ))

    def _scan_keys(d: Any, source: str, dest_domain: str, first_third: str, depth: int = 0) -> None:
        if depth > 4 or not isinstance(d, dict):
            return
        for k, v in d.items():
            k_str = str(k)
            v_str = str(v) if v is not None else ""
            for cat, cat_def in SENSITIVE_CATEGORIES.items():
                key_re = cat_def.get("key_patterns")
                val_re = cat_def.get("value_patterns")
                matched = False
                confidence = "probable"
                if key_re and key_re.search(k_str):
                    matched = True
                elif val_re and v_str and val_re.search(v_str):
                    matched = True
                    confidence = "possible"  # value match only — lower confidence
                if matched:
                    _add(
                        category=cat,
                        field_name=k_str,
                        source=source,
                        raw_value=v_str,
                        destination_domain=dest_domain,
                        evidence=f"Key '{k_str}' in {source} matches sensitive data pattern '{cat}'",
                        confidence=confidence,
                        first_third=first_third,
                    )
            if isinstance(v, dict):
                _scan_keys(v, source, dest_domain, first_third, depth + 1)
            elif isinstance(v, list):
                for item in v[:10]:
                    if isinstance(item, dict):
                        _scan_keys(item, source, dest_domain, first_third, depth + 1)

    # ── 1. dataLayer ──────────────────────────────────────────────────────────
    try:
        datalayer = getattr(scan_result, "datalayer_raw", []) or []
        for event in datalayer[:100]:
            if isinstance(event, dict):
                _scan_keys(event, "datalayer", first_party_domain, "first_party")
    except Exception:
        pass

    # ── 2. Network request parameters ─────────────────────────────────────────
    try:
        intercepted = getattr(scan_result, "intercepted_requests", []) or []
        for req in intercepted[:200]:
            req_url_str = getattr(req, "url", "") or ""
            req_domain = getattr(req, "domain", "") or ""
            if not req_url_str:
                continue
            domain_info = classify_domain(req_domain, first_party_domain)
            first_third = "first_party" if domain_info["type"] == "first_party" else "third_party"

            try:
                from urllib.parse import urlparse as _up
                pq = _up(req_url_str)
                params = parse_qs(pq.query, keep_blank_values=True)
                fake_dict = {k: v[0] if v else "" for k, v in params.items()}
                _scan_keys(fake_dict, "network", req_domain or pq.netloc, first_third)
            except Exception:
                pass

            # POST body
            post_data = getattr(req, "post_data", "") or ""
            if post_data:
                try:
                    import json as _json
                    data = _json.loads(post_data)
                    if isinstance(data, dict):
                        _scan_keys(data, "network_post", req_domain, first_third)
                except Exception:
                    pass
    except Exception:
        pass

    # ── 3. URL params ─────────────────────────────────────────────────────────
    try:
        page_params = parse_qs(parsed_site.query, keep_blank_values=True)
        fake_dict = {k: v[0] if v else "" for k, v in page_params.items()}
        _scan_keys(fake_dict, "url_param", first_party_domain, "first_party")
    except Exception:
        pass

    # ── 4. localStorage / sessionStorage ──────────────────────────────────────
    for attr_name, src_label in [("local_storage", "local_storage"), ("session_storage", "session_storage")]:
        try:
            storage = getattr(scan_result, attr_name, {}) or {}
            if isinstance(storage, dict):
                _scan_keys(storage, src_label, first_party_domain, "first_party")
        except Exception:
            pass

    return findings
