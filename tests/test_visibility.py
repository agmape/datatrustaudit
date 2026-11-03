"""Plan visibility applied on the server: 3/7/10 of ten, rounding for 0/1/3, nesting, no leakage,
and Premium returns the untouched report (presentation never changes technical conclusions)."""
import copy
import json

import pytest

from datatrust.visibility import apply_visibility

SEV = ["critical", "high", "high", "medium", "medium", "low", "low", "info", "info", "info"]


def ten():
    return {
        "findings": [{"id": f"F{i:02d}", "severity": s, "status": "OBSERVED", "evidence_ids": [f"ev-{i}"]}
                     for i, s in enumerate(SEV)],
        "evidence": [{"id": f"ev-{i}", "source_type": "network"} for i in range(10)]
                    + [{"id": "nav-1", "source_type": "navigation"}],
        "pages": [{"url": "https://a.example", "finding_ids": [f"F{i:02d}" for i in range(10)]}],
        "summary": {"findings": 10},
    }


@pytest.mark.parametrize("plan,expected", [("free", 3), ("pro", 7), ("premium", 10), ("admin", 10)])
def test_ten_findings_release_3_7_10(plan, expected):
    out = apply_visibility(ten(), plan)
    assert len(out["findings"]) == expected
    assert out["visibility"]["lists"]["findings"] == {"total": 10, "released": expected, "hidden": 10 - expected}
    assert out["summary"]["findings"] == 10                                # real aggregate stays visible


def test_priority_order_releases_most_severe_first_and_nested():
    f = {p: [x["id"] for x in apply_visibility(ten(), p)["findings"]] for p in ("free", "pro", "premium")}
    assert f["free"] == ["F00", "F01", "F02"]
    assert set(f["free"]) <= set(f["pro"]) <= set(f["premium"])


@pytest.mark.parametrize("n,free,pro,prem", [(0, 0, 0, 0), (1, 1, 1, 1), (3, 1, 2, 3)])
def test_small_lists_rounding_never_fabricates(n, free, pro, prem):
    rep = {"findings": [{"id": f"x{i}", "severity": "low"} for i in range(n)]}
    got = [len(apply_visibility(rep, p)["findings"]) for p in ("free", "pro", "premium")]
    assert got == [free, pro, prem]
    assert "min(N, max(1, floor(N×p)))" in apply_visibility(rep, "free")["visibility"]["rule"]


def test_withheld_records_do_not_leak_anywhere():
    out = apply_visibility(ten(), "free")
    raw = json.dumps(out)
    for i in range(3, 10):
        assert f'"F{i:02d}"' not in raw and f'"ev-{i}"' not in raw
    assert out["pages"][0]["finding_ids"] == ["F00", "F01", "F02"] and out["pages"][0]["finding_ids_total"] == 10
    assert {e["id"] for e in out["evidence"]} == {"ev-0", "ev-1", "ev-2", "nav-1"}


def test_input_is_not_mutated_and_premium_is_identical():
    src = ten()
    snapshot = copy.deepcopy(src)
    out = apply_visibility(src, "premium")
    assert src == snapshot
    out.pop("visibility")
    assert out == snapshot


def test_real_reference_report_premium_keeps_everything_free_is_subset(scanned):
    rep = scanned("onetrust.html", True)
    prem = apply_visibility(rep, "premium")
    prem.pop("visibility")
    assert prem == rep                                                      # same evidence and conclusions
    free = apply_visibility(rep, "free")
    for lst in ("findings", "tags", "cookies"):
        ids = lambda xs: [json.dumps(x, sort_keys=True) for x in xs]
        assert set(ids(free[lst])) <= set(ids(rep[lst]))
    cited = {e for f in free["findings"] for e in f.get("evidence_ids") or []}
    assert cited <= {e["id"] for e in free["evidence"]}
