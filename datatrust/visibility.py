"""
Plan visibility (30% / 70% / 100%) applied on the SERVER to a finished report.

The collection is never degraded for smaller plans: the full report is produced and stored; this
module decides how many DETAILED records each viewer may read. Withheld records are removed from
the payload (not blurred client-side), so they cannot leak through HTML attributes, tooltips,
network responses, exports or shared links built from the payload.

Rule (per protected list, computed over the whole audit before any filter/pagination):
    released = min(N, max(1, floor(N * p)))  for N > 0;   0 for N = 0.
Each list is sorted by a STABLE priority order (then by ID), and the released set is a prefix of
that order, so Free ⊂ Pro ⊂ Premium for the same audit and IDs never change. Aggregated counts,
scope, execution status, limitations and scores stay visible to every authorised viewer.
"""
from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List, Optional, Tuple

from .plans import entitlements, released_count

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "needs_manual_review": 3, "low": 4, "info": 5}
STATUS_RANK = {"OBSERVED": 0, "INFERRED": 1, "UNVERIFIABLE": 2, "NOT_OBSERVED": 3}
CONF_RANK = {"high": 0, "medium": 1, "low": 2}

RULE_TEXT = {
    "pt-BR": "Para N registros e percentual p, são liberados min(N, max(1, floor(N×p))) detalhes; com N = 0, nenhum. "
             "Em listas pequenas o arredondamento e a amostra mínima de 1 fazem o percentual real diferir do nominal.",
    "en": "For N records and percentage p, min(N, max(1, floor(N×p))) details are released; with N = 0, none. "
          "In small lists rounding and the minimum sample of 1 make the real share differ from the nominal one.",
}


def _k_finding(f: Dict[str, Any]) -> Tuple:
    return (SEVERITY_RANK.get(f.get("severity"), 9), STATUS_RANK.get(f.get("status"), 9), str(f.get("id")))


def _k_tag(t: Dict[str, Any]) -> Tuple:
    return (0 if t.get("observed_firing") else 1, CONF_RANK.get(t.get("confidence"), 9),
            str(t.get("vendor_id") or t.get("vendor")), ",".join(map(str, t.get("ids") or [])))


def _k_event(e: Dict[str, Any]) -> Tuple:
    return (STATUS_RANK.get(e.get("status"), 9), 0 if e.get("sent_to_ga4") else 1, str(e.get("name")))


def _k_cookie(c: Dict[str, Any]) -> Tuple:
    return (0 if c.get("known_tracking_cookie") else 1, str(c.get("name")), str(c.get("domain")))


def _k_domain(d: Dict[str, Any]) -> Tuple:
    return (0 if d.get("collection_requests") else 1, 0 if d.get("third_party") else 1, str(d.get("domain")))


def _k_generic(x: Any) -> Tuple:
    if isinstance(x, dict):
        return (str(x.get("id") or x.get("key") or x.get("name") or x.get("url") or x.get("kind") or ""), str(sorted(x.items()))[:200])
    return (str(x), "")


# (label, getter, setter, sort key) — every protected list of the report contract
def _lists(r: Dict[str, Any]) -> List[Tuple[str, Callable[[], Any], Callable[[Any], None], Callable]]:
    ev = r.get("events") if isinstance(r.get("events"), dict) else None
    net = r.get("network") if isinstance(r.get("network"), dict) else None
    priv = r.get("privacy") if isinstance(r.get("privacy"), dict) else None
    out = [
        ("findings", lambda: r.get("findings"), lambda v: r.__setitem__("findings", v), _k_finding),
        ("tags", lambda: r.get("tags"), lambda v: r.__setitem__("tags", v), _k_tag),
        ("cookies", lambda: r.get("cookies"), lambda v: r.__setitem__("cookies", v), _k_cookie),
        ("storage", lambda: r.get("storage"), lambda v: r.__setitem__("storage", v), _k_generic),
        ("policy_links", lambda: r.get("policy_links"), lambda v: r.__setitem__("policy_links", v), _k_generic),
    ]
    if ev is not None:
        out += [("events", lambda: ev.get("events"), lambda v: ev.__setitem__("events", v), _k_event),
                ("code_candidates", lambda: ev.get("code_candidates"), lambda v: ev.__setitem__("code_candidates", v), _k_generic)]
    if net is not None:
        out += [("network_domains", lambda: net.get("domains"), lambda v: net.__setitem__("domains", v), _k_domain)]
    if priv is not None:
        out += [("pii_key_patterns", lambda: priv.get("pii_key_patterns"), lambda v: priv.__setitem__("pii_key_patterns", v), _k_generic),
                ("observed_pii_values", lambda: priv.get("observed_pii_values"), lambda v: priv.__setitem__("observed_pii_values", v), _k_generic)]
    return out


def _evidence_refs(item: Any) -> List[str]:
    if not isinstance(item, dict):
        return []
    refs = list(item.get("evidence_ids") or [])
    if item.get("evidence_id"):
        refs.append(item["evidence_id"])
    return [str(x) for x in refs]


def apply_visibility(report: Dict[str, Any], plan_id: str, language: str = "pt-BR") -> Dict[str, Any]:
    """Return a COPY of ``report`` containing only the details the plan may read, plus a
    ``visibility`` block with real counts. Ratio 1.0 returns everything (still annotated)."""
    ent = entitlements(plan_id)
    ratio = float(ent["visibility"])
    r = copy.deepcopy(report)
    lists_meta: Dict[str, Dict[str, int]] = {}
    released_refs: set = set()
    released_finding_ids: set = set()
    total_all = released_all = 0

    for name, get, put, key in _lists(r):
        items = get()
        if not isinstance(items, list):
            continue
        n = len(items)
        k = released_count(n, ratio)
        # priority decides WHICH records are released; the original order is preserved
        chosen = set(sorted(range(n), key=lambda i: (key(items[i]), i))[:k])
        keep = [it for i, it in enumerate(items) if i in chosen]
        if k < n:
            put(keep)
        lists_meta[name] = {"total": n, "released": k, "hidden": n - k}
        total_all += n
        released_all += k
        for it in keep:
            released_refs.update(_evidence_refs(it))
            if name == "findings" and isinstance(it, dict):
                released_finding_ids.add(str(it.get("id")))

    # evidence: only what released records cite (+ navigation records that describe the scope)
    evid = r.get("evidence")
    if isinstance(evid, list):
        n = len(evid)
        if ratio >= 1.0:
            keep_ev = evid
        else:
            keep_ev = [e for e in evid if isinstance(e, dict) and
                       (str(e.get("id")) in released_refs or e.get("source_type") == "navigation")]
        r["evidence"] = keep_ev
        lists_meta["evidence"] = {"total": n, "released": len(keep_ev), "hidden": n - len(keep_ev)}

    # per-page finding references must not reveal withheld finding IDs
    if ratio < 1.0:
        for pg in r.get("pages") or []:
            if isinstance(pg, dict) and isinstance(pg.get("finding_ids"), list):
                ids = pg["finding_ids"]
                pg["finding_ids_total"] = len(ids)
                pg["finding_ids"] = [i for i in ids if str(i) in released_finding_ids]

    lang = "pt-BR" if str(language).lower().startswith("pt") else "en"
    r["visibility"] = {
        "plan": ent["plan"], "plan_name": ent["plan_name"], "ratio": ratio,
        "percent": ent["visibility_percent"], "full": ratio >= 1.0,
        "lists": lists_meta, "total_details": total_all, "released_details": released_all,
        "hidden_details": total_all - released_all,
        "rule": RULE_TEXT[lang],
        "label": "Visibilidade do plano" if lang == "pt-BR" else "Plan visibility",
        "scope_note": ("Visibilidade do plano é a parte dos detalhes desta auditoria que o plano libera. Não é a cobertura da "
                       "auditoria nem a condição da mensuração. 100% significa todos os detalhes desta auditoria, não certeza sobre "
                       "todas as configurações internas do site.") if lang == "pt-BR" else
                      ("Plan visibility is the share of this audit's details the plan releases. It is not the audit coverage nor the "
                       "measurement condition. 100% means every detail of this audit, not certainty about all internal site settings."),
    }
    return r
