"""Golden-expectation tests against controlled local fixtures (real Chromium, offline mocks)."""
import json
from pathlib import Path

import pytest

GOLDEN = json.loads((Path(__file__).parent / "golden" / "fixtures.json").read_text(encoding="utf-8"))
CASES = [k for k in GOLDEN if not k.startswith("_")]


def _rules(r):
    return {f["rule_id"] for f in r["findings"]}


@pytest.mark.parametrize("name", CASES)
def test_fixture_golden(name, scanned):
    exp = GOLDEN[name]
    r = scanned(name, exp.get("consent", False))
    assert r["success"] is True, r.get("message")
    assert r["capabilities"]["runtime_js"] is True
    tags = {t["vendor_id"]: t for t in r["tags"]}
    if "tags_exact" in exp:
        assert set(tags) == set(exp["tags_exact"]), f"tags {sorted(tags)} != {exp['tags_exact']}"
    for vid, ids in exp.get("ids", {}).items():
        assert tags[vid]["ids"] == ids
    for vid, firing in exp.get("firing", {}).items():
        assert tags[vid]["observed_firing"] is firing
    rules = _rules(r)
    for rid in exp.get("rules_present", []):
        assert rid in rules, f"{rid} missing; got {sorted(rules)}"
    for rid in exp.get("rules_absent", []):
        assert rid not in rules, f"{rid} must not be reported (false positive)"
    by_rule = {}
    for f in r["findings"]:
        by_rule.setdefault(f["rule_id"], f)
    for rid, sev in exp.get("severity", {}).items():
        assert by_rule[rid]["severity"] == sev
    for rid, st in exp.get("status", {}).items():
        assert by_rule[rid]["status"] == st
    events = {e["name"]: e for e in r["events"]["events"]}
    if "events_exact" in exp:
        assert set(events) == set(exp["events_exact"])
    for en in exp.get("events_sent", []):
        assert events[en]["sent_to_ga4"] is True
    for en in exp.get("events_present", []):
        assert en in events
    for en in exp.get("events_not_sent", []):
        assert en not in events or events[en]["sent_to_ga4"] is False
    cands = {c["name"] for c in r["events"]["code_candidates"]}
    for en in exp.get("code_candidates", []):
        assert en in cands
        c = next(c for c in r["events"]["code_candidates"] if c["name"] == en)
        assert c["status"] == "INFERRED" and "runtime firing not confirmed" in c["note"]
    if "missing_contains" in exp:
        miss = [m for f in r["findings"] if f["rule_id"] == "EVENT_MISSING_REQUIRED_PARAMS" for m in f["data"]["missing"]]
        for m in exp["missing_contains"]:
            assert m in miss, miss
    if "interactions" in exp:
        for a, st in exp["interactions"].items():
            assert r["capabilities"]["consent_interaction"][a] == st
    if "consent_mode_v2" in exp:
        assert r["consent"]["consent_mode"]["v2_signals"] is exp["consent_mode_v2"]
    if exp.get("overall_score_null"):
        assert r["scores"]["overall"]["score"] is None
        assert r["scores"]["overall"]["null_reason"]
    for cname, phases in exp.get("cookie_phases", {}).items():
        c = next(c for c in r["cookies"] if c["name"] == cname)
        assert c["observed_in"] == phases
    blob = json.dumps(r, ensure_ascii=False)
    for s in exp.get("forbidden_strings", []):
        assert s not in blob, f"raw personal data leaked into report: {s!r}"
    if "blocked_hosts" in exp:
        got = {b["host"] for b in r["network"]["blocked_by_guard"]}
        assert set(exp["blocked_hosts"]) <= got


@pytest.mark.parametrize("name", CASES)
def test_every_observed_finding_cites_existing_evidence(name, scanned):
    """'Where exactly was this observed?' must always have an answer."""
    r = scanned(name, GOLDEN[name].get("consent", False))
    ids = {e["id"] for e in r["evidence"]}
    for f in r["findings"]:
        if f["status"] == "OBSERVED":
            assert f["evidence_ids"], f["rule_id"]
        for eid in f["evidence_ids"]:
            assert eid in ids, f"{f['rule_id']} cites unknown evidence {eid}"
    for t in r["tags"]:
        assert t["evidence_ids"], t["vendor_id"]
        for eid in t["evidence_ids"]:
            assert eid in ids
        if t["observed_firing"] is True:
            assert any((e.get("parsed") or {}).get("beacon_vendors") and t["vendor_id"] in e["parsed"]["beacon_vendors"]
                       for e in r["evidence"] if e["id"] in set(t["evidence_ids"]))


@pytest.mark.parametrize("name", CASES)
def test_no_fines_no_raw_cookie_values(name, scanned):
    r = scanned(name, GOLDEN[name].get("consent", False))
    blob = json.dumps(r, ensure_ascii=False).lower()
    for banned in ("estimatedfine", "estimated_fine", "multa estimada", "r$ ", "dano presumido", "dano material"):
        assert banned not in blob
    for e in r["evidence"]:
        if e["source_type"] == "cookie":
            assert "value" not in e and "value" not in (e.get("cookie_attributes") or {})
    # GA4 client id must never be stored raw
    assert "1234567.7654321" not in blob
