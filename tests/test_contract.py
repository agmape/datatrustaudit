"""The versioned report contract holds for every fixture, in every language, and rejects broken reports."""
import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from datatrust.contract import CONTRACT_VERSION, validate_report
from datatrust.i18n import localize_report

GOLDEN = json.loads((Path(__file__).parent / "golden" / "fixtures.json").read_text(encoding="utf-8"))
CASES = [k for k in GOLDEN if not k.startswith("_")]


@pytest.mark.parametrize("name", CASES)
@pytest.mark.parametrize("lang", ["pt-BR", "en"])
def test_every_fixture_report_satisfies_the_contract(name, lang, scanned):
    r = localize_report(scanned(name, GOLDEN[name].get("consent", False)), lang)
    c = validate_report(r)
    assert c.contract_version == CONTRACT_VERSION and c.language == lang and c.timezone == "America/Sao_Paulo"


def test_not_observable_stays_null_never_false(scanned):
    r = localize_report(scanned("gtm_basic.html"), "pt-BR")
    gtm = next(t for t in r["tags"] if t["vendor_id"] == "gtm")
    assert gtm["observed_firing"] is None                      # a loader has no collection endpoint: not "false"
    assert r["scores"]["axes"]["event_data_quality"]["score"] is None and r["scores"]["axes"]["event_data_quality"]["null_reason"]


def test_contract_rejects_observed_without_evidence_and_dangling_references(scanned):
    base = localize_report(scanned("onetrust.html", True), "pt-BR")
    bad = copy.deepcopy(base)
    obs = next(f for f in bad["findings"] if f["status"] == "OBSERVED")
    obs["evidence_ids"] = []
    with pytest.raises(ValidationError):
        validate_report(bad)
    bad = copy.deepcopy(base)
    bad["findings"][0]["evidence_ids"] = ["ev-99999"]
    with pytest.raises(ValidationError):
        validate_report(bad)
    bad = copy.deepcopy(base)
    bad["scores"]["overall"].update({"score": None, "null_reason": None})
    with pytest.raises(ValidationError):
        validate_report(bad)
    bad = copy.deepcopy(base)
    bad["evidence"].append(copy.deepcopy(bad["evidence"][0]))
    with pytest.raises(ValidationError):
        validate_report(bad)


def test_counts_are_unique_findings_not_double_counted(scanned):
    r = localize_report(scanned("onetrust.html", True), "pt-BR")
    ids = [f["id"] for f in r["findings"]]
    assert len(ids) == len(set(ids))
    keys = [(f["rule_id"], tuple(f["pages"]), json.dumps(f.get("data", {}).get("event", ""), sort_keys=True)) for f in r["findings"]]
    assert len(keys) == len(set(keys))                           # the same failure is not listed twice
