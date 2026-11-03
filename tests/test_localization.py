"""pt-BR / en localization of the report: no English leakage, stable identifiers, complete rulebook."""
import copy
import json
import re
from pathlib import Path

import pytest

from datatrust.i18n import localize_report
from datatrust.i18n.rulebook import RULES, STATUS_LABELS, normalize_lang, render_rule

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = json.loads((Path(__file__).parent / "golden" / "fixtures.json").read_text(encoding="utf-8"))
CASES = [k for k in GOLDEN if not k.startswith("_")]
ENGLISH = re.compile(r"\b(the|and|was|were|with|without|before|after|not|observed|request|requests|sent|for|this|that|from|which|may|could|should|because)\b", re.I)
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


def human_texts(r):
    """Every sentence a manager can read, excluding technical identifiers."""
    out = []
    for f in r["findings"]:
        L = f["localized"]
        out += [L["title"], L["found"], L["impact_observed"], L["impact_possible"], L["ask"], L["confirm"],
                L["status_label"], L["status_condition"], L["priority"], L["priority_reason"], L["owner_label"]]
        out += f.get("limitations", [])
        if f.get("legal_context"):
            out.append(f["legal_context"]["text"])
    out += r["limitations"] + [r.get("message") or "", r.get("disclaimer") or ""]
    out += [t["observed_firing_note"] for t in r["tags"]]
    for e in r["events"]["events"]:
        out += [e.get("note") or "", e["glossary"]["label"], e["glossary"]["explanation"], e["glossary"]["caveat"]]
    out += [c["note"] for c in r["events"]["code_candidates"]]
    out += [(r["consent"]["consent_mode"] or {}).get("note") or ""] if r.get("consent") else []
    out += [r["scores"]["overall"].get("null_reason") or ""]
    for ax in r["scores"]["axes"].values():
        out += [ax.get("null_reason") or ""] + [c["label"] + " " + (c.get("reason") or "") for c in ax["checks"]]
    return [t for t in out if t]


@pytest.mark.parametrize("name", CASES)
def test_portuguese_report_has_no_english_leakage(name, scanned):
    r = localize_report(scanned(name, GOLDEN[name].get("consent", False)), "pt-BR")
    assert r["i18n"]["untranslated"] == [], r["i18n"]["untranslated"]
    for t in human_texts(r):
        assert not ENGLISH.search(t), f"English leaked into pt-BR: {t!r}"
        assert not PLACEHOLDER.search(t), f"unresolved placeholder: {t!r}"
    for f in r["findings"]:
        assert "—" not in f["localized"]["title"], f["localized"]["title"]


@pytest.mark.parametrize("name", ["onetrust.html", "pii_runtime_value.html", "ecommerce_purchase_missing_params.html", "ga4_basic.html"])
def test_english_report_has_no_unresolved_placeholders_and_keeps_identifiers(name, scanned):
    raw = scanned(name, GOLDEN[name].get("consent", False))
    pt, en = localize_report(raw, "pt-BR"), localize_report(raw, "en")
    assert [f["rule_id"] for f in pt["findings"]] == [f["rule_id"] for f in en["findings"]]
    assert [f["evidence_ids"] for f in pt["findings"]] == [f["evidence_ids"] for f in en["findings"]]
    assert [t["ids"] for t in pt["tags"]] == [t["ids"] for t in en["tags"]]
    assert [e["name"] for e in pt["events"]["events"]] == [e["name"] for e in en["events"]["events"]]
    for t in human_texts(en):
        assert not PLACEHOLDER.search(t), t
    assert any(f["localized"]["title"] != g["localized"]["title"] for f, g in zip(pt["findings"], en["findings"]))


def test_event_and_id_names_are_never_translated(scanned):
    r = localize_report(scanned("ecommerce_purchase_valid.html"), "pt-BR")
    names = [e["name"] for e in r["events"]["events"]]
    assert "purchase" in names and "compra" not in " ".join(names).lower()
    purchase = next(e for e in r["events"]["events"] if e["name"] == "purchase")
    assert purchase["glossary"]["label"] == "Registro de compra"            # explanation beside, name untouched
    assert r["tags"][0]["ids"] == ["G-ECOMOK1234"]


def test_localize_is_pure_and_deterministic(scanned):
    raw = scanned("onetrust.html", True)
    snapshot = copy.deepcopy(raw)
    a, b = localize_report(raw, "pt-BR"), localize_report(raw, "pt-BR")
    assert raw == snapshot and a == b
    assert "localized" not in raw["findings"][0]


def test_rulebook_covers_every_rule_the_engine_can_emit():
    emitted = set()
    for p in (ROOT / "datatrust").glob("*.py"):
        emitted |= set(re.findall(r'Finding\(\s*(?:f)?"([A-Z0-9_]+?)(?:_\{[^"]*)?"', p.read_text(encoding="utf-8")))
    emitted.discard("CONSENT")                                                       # prefix of the f-string rule below
    emitted |= {f"CONSENT_{a}_MANUAL_VERIFICATION" for a in ("REJECT", "ACCEPT")}      # built with an f-string
    emitted -= {"X"}
    missing = sorted(r for r in emitted if r not in RULES)
    assert missing == [], f"rules without a rulebook entry: {missing}"


def test_rulebook_is_complete_and_bilingual_with_matching_placeholders():
    fields = {"title", "found", "observed", "possible", "ask", "confirm"}
    ph = lambda s: set(re.findall(r"\{([a-z_]+)\}", s))
    for rid, spec in RULES.items():
        assert spec["owner"] in ("marketing", "agency", "development", "privacy"), rid
        assert set(spec["pt"]) == fields and set(spec["en"]) == fields, rid
        for f in fields:
            assert ph(spec["pt"][f]) == ph(spec["en"][f]), f"{rid}.{f} placeholder mismatch"
        for f in ("title", "found", "ask", "confirm"):
            assert spec["pt"][f].strip() and spec["en"][f].strip(), f"{rid}.{f} empty"


def test_status_vocabulary_matches_product_language():
    assert STATUS_LABELS["pt-BR"] == {"OBSERVED": "Confirmado", "INFERRED": "Suspeita", "NOT_OBSERVED": "Não observado",
                                      "UNVERIFIABLE": "Não verificado", "NOT_APPLICABLE": "Não aplicável"}


def test_copy_request_is_actionable_and_references_evidence(scanned):
    r = localize_report(scanned("onetrust.html", True), "pt-BR")
    f = next(x for x in r["findings"] if x["rule_id"] == "TRACKING_AFTER_REJECT")
    c = f["localized"]["copy_request"]
    assert f["localized"]["title"] in c and f["localized"]["ask"] in c and f["evidence_ids"][0] in c and "Responsável sugerido" in c
    assert "multa" not in c.lower()


def test_manager_facts_come_from_evidence_not_invented(scanned):
    """Counts and vendors shown to the manager must equal what the engine recorded."""
    raw = scanned("onetrust.html", True)
    r = localize_report(raw, "pt-BR")
    f = next(x for x in r["findings"] if x["rule_id"] == "TRACKING_BEFORE_CONSENT_INTERACTION")
    assert f["data"]["vendors"] and all(v in f["localized"]["found"] for v in f["data"]["vendors"])
    assert str(f["data"]["requests"]) in f["localized"]["found"]


def test_spanish_falls_back_explicitly_to_english(scanned):
    r = localize_report(scanned("onetrust.html", True), "es")
    assert r["language"] == "es" and r["i18n"]["fallback"] is True
    assert all(f["localized"]["translation_fallback"] for f in r["findings"])


def test_language_normalization():
    assert normalize_lang(None) == "pt-BR" and normalize_lang("pt") == "pt-BR" and normalize_lang("pt_BR".replace("_", "-")) == "pt-BR"
    assert normalize_lang("en-US") == "en" and normalize_lang("fr") == "pt-BR"


def test_no_monetary_or_legal_conclusions_in_manager_text(scanned):
    for name in ("onetrust.html", "pii_runtime_value.html", "ga4_basic.html"):
        r = localize_report(scanned(name, GOLDEN[name].get("consent", False)), "pt-BR")
        blob = " ".join(human_texts(r)).lower()
        for banned in ("multa estimada", "multa de", "r$", "viola a lgpd", "está violando", "ilegal", "dano presumido", "indenização", "prejuízo de"):
            assert banned not in blob, banned
