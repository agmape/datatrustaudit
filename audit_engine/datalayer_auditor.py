"""
audit_engine.datalayer_auditor — dataLayer structure and PII exposure detection.

Inspects all dataLayer.push() calls for:
- PII keys (email, phone, CPF, etc.)
- eCommerce items array structure
- Initialization order issues
"""
import re
import json
from typing import Any, Dict, List, Optional
from .models import DataLayerFinding, CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW

_DL_PUSH_RE = re.compile(
    r"dataLayer\s*\.\s*push\s*\(\s*(\{[\s\S]{0,2000}?\})\s*\)",
    re.IGNORECASE,
)
_DL_INIT_RE = re.compile(r"window\s*\.\s*dataLayer\s*=\s*\[\s*\]", re.IGNORECASE)

PII_KEYS = {
    "email":       "critical",
    "e-mail":      "critical",
    "cpf":         "critical",
    "password":    "critical",
    "senha":       "critical",
    "phone":       "high",
    "telefone":    "high",
    "celular":     "high",
    "nome":        "high",
    "name":        "medium",
    "birth":       "high",
    "nascimento":  "high",
    "user_id":     "medium",
    "uid":         "medium",
    "address":     "high",
    "endereco":    "high",
    "cep":         "high",
    "rg":          "critical",
    "cnpj":        "high",
}


def _safe_parse(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    try:
        cleaned = re.sub(r"'([^']*)'", r'"\1"', text)
        cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
        cleaned = re.sub(r'(?<=[{,\s])(\w+)\s*:', r'"\1":', cleaned)
        return json.loads(cleaned)
    except Exception:
        return None


def _scan_keys_for_pii(keys: List[str]) -> List[tuple]:
    """Return list of (key, severity) for keys that match known PII patterns."""
    found = []
    for key in keys:
        key_lower = key.lower().strip()
        for pii_key, severity in PII_KEYS.items():
            if pii_key in key_lower:
                found.append((key, severity))
                break
    return found


def _flatten_keys(obj: Any, prefix: str = "") -> List[str]:
    """Recursively collect all keys from a nested dict/list structure."""
    keys = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            full = f"{prefix}.{k}" if prefix else k
            keys.append(full)
            keys.extend(_flatten_keys(v, full))
    elif isinstance(obj, list):
        for item in obj:
            keys.extend(_flatten_keys(item, prefix))
    return keys


def audit_datalayer(html: str) -> List[DataLayerFinding]:
    findings: List[DataLayerFinding] = []
    seen_pii: set = set()

    for m in _DL_PUSH_RE.finditer(html):
        raw = m.group(1)
        parsed = _safe_parse(raw)

        if parsed:
            all_keys = _flatten_keys(parsed)
            pii_found = _scan_keys_for_pii(all_keys)

            for key, severity in pii_found:
                if key in seen_pii:
                    continue
                seen_pii.add(key)
                findings.append(DataLayerFinding(
                    type="pii_exposure",
                    severity=severity,
                    keys=[key],
                    snippet=raw[:120] + ("..." if len(raw) > 120 else ""),
                    description=f"PII key '{key}' detected in dataLayer.push(). "
                                "All scripts loaded on the page can read this value.",
                    confidence=CONFIDENCE_HIGH,
                ))

            # Check ecommerce.items structure (GA4 enhanced ecommerce)
            ecommerce = parsed.get("ecommerce")
            if isinstance(ecommerce, dict):
                items = ecommerce.get("items") or ecommerce.get("products")
                if items is None:
                    findings.append(DataLayerFinding(
                        type="ecommerce_malformed",
                        severity="high",
                        keys=list(ecommerce.keys()),
                        snippet=raw[:120],
                        description="ecommerce object detected in dataLayer.push() but 'items' array is missing. "
                                    "GA4 enhanced ecommerce requires an 'items' array.",
                        confidence=CONFIDENCE_HIGH,
                    ))
                elif isinstance(items, list) and items:
                    # Validate first item structure
                    first = items[0] if isinstance(items[0], dict) else {}
                    required_item_keys = {"item_id", "item_name"}
                    present = {k.lower() for k in first.keys()}
                    missing = required_item_keys - present
                    if missing:
                        findings.append(DataLayerFinding(
                            type="ecommerce_malformed",
                            severity="medium",
                            keys=list(missing),
                            snippet=raw[:120],
                            description=f"ecommerce.items detected but items are missing required fields: "
                                        f"{', '.join(missing)}.",
                            confidence=CONFIDENCE_MEDIUM,
                        ))
        else:
            # Could not parse — do a raw text PII scan on the snippet
            raw_lower = raw.lower()
            for pii_key, severity in PII_KEYS.items():
                if pii_key in raw_lower and pii_key not in seen_pii:
                    seen_pii.add(pii_key)
                    findings.append(DataLayerFinding(
                        type="pii_exposure",
                        severity=severity,
                        keys=[pii_key],
                        snippet=raw[:120] + "...",
                        description=f"Possible PII key '{pii_key}' detected in dataLayer.push() "
                                    "(parsed with low confidence — JS object could not be fully parsed).",
                        confidence=CONFIDENCE_LOW,
                    ))

    # Check for dataLayer re-initialization (overwrite risk)
    init_matches = list(_DL_INIT_RE.finditer(html))
    if len(init_matches) > 1:
        findings.append(DataLayerFinding(
            type="init_order_issue",
            severity="high",
            keys=[],
            snippet=f"window.dataLayer = [] appears {len(init_matches)} times",
            description=f"window.dataLayer = [] is assigned {len(init_matches)} times in the source. "
                        "Reassigning the array after GTM loads discards previously pushed data.",
            confidence=CONFIDENCE_HIGH,
        ))

    return findings
