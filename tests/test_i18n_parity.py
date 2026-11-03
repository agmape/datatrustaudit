"""Frontend i18n integrity: key/placeholder parity across languages and no dangling keys in the source."""
import json
import re
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "static" / "src"
LANGS = {"pt-BR": "pt-BR.json", "en": "en.json", "es": "es.json"}


def load(lang):
    return json.loads((SRC / "i18n" / LANGS[lang]).read_text(encoding="utf-8"))


def flatten(o, prefix=""):
    out = {}
    if isinstance(o, dict):
        for k, v in o.items():
            out.update(flatten(v, f"{prefix}{k}."))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            out.update(flatten(v, f"{prefix}{i}."))
    else:
        out[prefix[:-1]] = o
    return out


FLAT = {l: flatten(load(l)) for l in LANGS}
PH = lambda s: set(re.findall(r"\{(\w+)\}", s)) if isinstance(s, str) else set()


def test_same_keys_in_all_languages():
    base = set(FLAT["pt-BR"])
    for lang in ("en", "es"):
        missing, extra = base - set(FLAT[lang]), set(FLAT[lang]) - base
        assert not missing and not extra, f"{lang}: missing={sorted(missing)[:10]} extra={sorted(extra)[:10]}"


def test_placeholders_and_non_empty_values_match():
    for key, v in FLAT["pt-BR"].items():
        assert isinstance(v, str) and v.strip(), f"pt-BR {key} empty"
        for lang in ("en", "es"):
            o = FLAT[lang][key]
            assert isinstance(o, str) and o.strip(), f"{lang} {key} empty"
            assert PH(v) == PH(o), f"{lang} {key}: placeholders {PH(o)} != {PH(v)}"


def test_no_language_just_copies_portuguese_for_user_facing_sentences():
    """A long sentence identical to pt-BR in en/es is almost certainly an untranslated leftover."""
    same = [k for k, v in FLAT["pt-BR"].items() if len(v) > 40 and (FLAT["en"][k] == v or FLAT["es"][k] == v)]
    assert not same, same[:10]


def _sources():
    for p in SRC.rglob("*.ts*"):
        if "i18n" in p.parts or p.name.endswith(".d.ts") or "components/ui" in p.as_posix():
            continue
        yield p, p.read_text(encoding="utf-8")


def test_every_literal_translation_key_exists():
    missing = []
    for p, text in _sources():
        for m in re.finditer(r"\bt\(\s*'([A-Za-z0-9_.]+)'", text):
            key = m.group(1)
            if key not in FLAT["pt-BR"] and not any(k.startswith(key + ".") for k in FLAT["pt-BR"]):
                missing.append(f"{p.name}: t('{key}')")
    assert not missing, missing


def test_every_dictionary_property_access_exists():
    """s.foo.bar / s.statusLabel[...] roots used by components must exist."""
    roots = set(load("pt-BR").keys())
    missing = []
    for p, text in _sources():
        # only components that take `s` from useI18n() (other files use `s` for unrelated locals)
        if p.name == "I18nContext.tsx" or not re.search(r"\bs\b[^}]*\}\s*=\s*useI18n\(\)", text):
            continue
        for m in re.finditer(r"\bs\.([A-Za-z_][A-Za-z0-9_]*)", text):
            name = m.group(1)
            if name not in roots:
                missing.append(f"{p.name}: s.{name}")
    assert not missing, sorted(set(missing))


def test_dynamic_key_families_complete():
    """Keys built at runtime (t(`prefix.${x}`)) must exist for every value the UI can produce."""
    pt = FLAT["pt-BR"]
    for st in ("completed", "partial", "blocked", "timeout", "protocol_error", "failed", "timed_out", "running"):
        assert f"report.state.{st}" in pt
    for st in ("completed", "partial", "blocked", "timeout", "protocol_error", "failed"):
        assert f"report.stateExplain.{st}" in pt, st
    for p in ("anonymous", "free", "pro", "premium", "admin"):
        assert f"plans.{p}" in pt
    for sub in ("none", "active", "expired", "canceled", "past_due"):
        assert f"settings.subStates.{sub}" in pt
    for code in ("INVALID_URL", "BLOCKED_TARGET", "DNS_FAILURE", "TIMEOUT", "RATE_LIMITED", "QUOTA_EXCEEDED", "PLAN_FEATURE_UNAVAILABLE",
                 "BUSY", "SCAN_ERROR", "AUTH_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED", "FORBIDDEN", "NOT_FOUND", "HISTORY_LIMIT", "NETWORK", "UNKNOWN",
                 "EMAIL_NOT_VERIFIED", "DAILY_LIMIT", "DOMAIN_LIMIT"):
        assert f"errors.{code}" in pt, code
    for mode in ("signin", "signup", "recover"):
        pass
    for k in ("tracking", "consent", "events", "privacy", "implementation", "policy", "scan"):
        assert f"report.categories.{k}" in pt
    for k in ("gtm", "ga4", "datalayer", "cmp", "consentmode", "tag", "trigger", "evidence", "gcs", "pixel", "measurementid"):
        assert f"glossary.{k}" in pt
    for k in ("health", "audits", "credits", "plans", "testing", "billing", "users", "log"):
        assert f"admin.tabs.{k}" in pt
    for q in ("available", "exhausted"):
        assert f"admin.testing.quota.{q}" in pt
    for s in ("active", "expired", "payment_failed"):
        assert f"admin.testing.sub.{s}" in pt
    for r in ("expired", "payment_failed"):
        assert f"banner.reasons.{r}" in pt
    for k in ("name", "price", "visibility", "analyses_per_month", "domains_per_period", "seats", "daily_limit", "deep_scan", "max_deep_pages", "history_limit"):
        assert f"admin.plans.fields.{k}" in pt
    for k in ("status", "user", "site", "plan", "duration", "error", "when"):
        assert f"admin.audits.{k}" in pt
    for k in ("actor", "action", "target", "when"):
        assert f"admin.log.{k}" in pt
    for k in ("scan_basic", "evidence_full", "report_views", "export_json_csv", "history", "deep_scan", "export_xlsx_pdf", "gtm_import", "comparison", "integrations"):
        assert f"plans.features.{k}" in pt
    for k in ("invalid_credentials", "email_not_confirmed", "user_already_exists", "weak_password", "over_request_rate_limit", "default"):
        assert f"auth.supabase.{k}" in pt


def test_portuguese_dictionary_has_no_english_marketing_leftovers():
    english = re.compile(r"\b(the|and|with|your|please|loading|error|sign in|log in)\b", re.I)
    bad = [(k, v) for k, v in FLAT["pt-BR"].items()
           if english.search(v) and not re.search(r"(VITE_|Supabase|Consent Mode|dataLayer|Pixel|RAG|JWKS|SSRF|Chromium|Tag Manager|Analytics)", v)]
    assert not bad, bad[:5]
