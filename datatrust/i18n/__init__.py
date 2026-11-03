"""
Report localization + contract stamping.

``localize_report(report, lang)`` returns a COPY of the canonical (language-neutral, English
diagnostic) report with human text rendered in ``lang``:
  * each finding gets ``localized`` = {title, found, impact_observed, impact_possible, ask, confirm,
    owner, owner_label, status_label, status_condition, priority, priority_reason, copy_request};
  * static engine messages are translated; unknown English leaks are listed in ``i18n.untranslated``;
  * technical identifiers (rule_id, event names, IDs, URLs, parameters) are NEVER translated.
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List

from . import messages as M
from .events import explain_event
from .rulebook import (OWNER_LABELS, PRIORITY_LABELS, PRIORITY_REASON, STATUS_CONDITION, STATUS_LABELS,
                       normalize_lang, render_rule)

CONTRACT_VERSION = "1.0"
DISPLAY_TZ = "America/Sao_Paulo"


def _join(vals, n: int = 8) -> str:
    vals = [str(v) for v in vals if v not in (None, "")]
    uniq = list(dict.fromkeys(vals))
    return ", ".join(uniq[:n]) + (f" (+{len(uniq) - n})" if len(uniq) > n else "")


def params_for(f: Dict[str, Any], ev_index: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    d = dict(f.get("data") or {})
    ids, cookies, domains = [], [], []
    for eid in (f.get("evidence_ids") or [])[:80]:
        e = ev_index.get(eid) or {}
        p = e.get("parsed") or {}
        ids += list(p.get("ids") or [])
        if e.get("cookie_name"):
            cookies.append(e["cookie_name"])
        if e.get("domain") and e.get("third_party"):
            domains.append(e["domain"])
    kp = d.get("key_patterns") or []
    keys = [k for item in kp for k in (item.get("keys") or [])]
    params = {
        "n": d.get("n", len(f.get("evidence_ids") or [])),
        "requests": d.get("requests", len(f.get("evidence_ids") or [])),
        "vendors": _join(d.get("vendors") or []) or "—",
        "only_after": _join(d.get("only_after_accept") or []) or "—",
        "domains": _join(d.get("domains") or domains) or "—",
        "ids": _join(d.get("ids") or ids) or "—",
        "event": d.get("event") or "—",
        "missing": _join(d.get("missing") or []) or "—",
        "kind": str(d.get("kind") or "—").upper(),
        "times": d.get("times", "—"), "container": d.get("container", "—"), "pixel": d.get("pixel", "—"),
        "tid": d.get("tid", "—"), "phase": d.get("phase", "—"),
        "cookies": _join(d.get("cookies") or cookies) or "—",
        "events": _join(d.get("events") or []) or "—",
        "granted": _join(d.get("granted") or []) or "—",
        "technology": d.get("technology", "—"), "status": d.get("status", "—"),
        "hosts": _join(d.get("hosts") or []) or "—",
        "keys": _join(d.get("keys") or keys) or "—",
        "http_status": d.get("http_status", "—"),
    }
    return params


def _copy_request(loc: Dict[str, Any], f: Dict[str, Any], lang: str, url: str) -> str:
    ids = ", ".join((f.get("evidence_ids") or [])[:6]) or "—"
    if lang == "pt-BR":
        return (f"Assunto: {loc['title']}\nSite: {url}\nResponsável sugerido: {loc['owner_label']} | Prioridade: {loc['priority']} | "
                f"Estado: {loc['status_label']}\n\nO que encontramos: {loc['found']}\n\nO que pedimos: {loc['ask']}\n\n"
                f"Como confirmar a correção: {loc['confirm']}\n\nReferência técnica: achado {f.get('id')} ({f.get('rule_id')}); evidências {ids}.")
    return (f"Subject: {loc['title']}\nSite: {url}\nSuggested owner: {loc['owner_label']} | Priority: {loc['priority']} | "
            f"State: {loc['status_label']}\n\nWhat we found: {loc['found']}\n\nWhat we ask: {loc['ask']}\n\n"
            f"How to confirm the fix: {loc['confirm']}\n\nTechnical reference: finding {f.get('id')} ({f.get('rule_id')}); evidence {ids}.")


def localize_report(report: Dict[str, Any], lang: str = "pt-BR") -> Dict[str, Any]:
    nl = normalize_lang(lang)
    key = "pt-BR" if nl == "pt-BR" else "en"
    r = copy.deepcopy(report)
    missing: List[str] = []
    ev_index = {e["id"]: e for e in (r.get("evidence") or [])}
    url = (r.get("target") or {}).get("final_url") or (r.get("target") or {}).get("url") or ""

    for f in r.get("findings") or []:
        rendered = render_rule(f["rule_id"], nl, params_for(f, ev_index))
        if rendered is None:
            missing.append(f"rule:{f['rule_id']}")
            rendered = {"title": f.get("title", f["rule_id"]), "found": f.get("description", ""),
                        "impact_observed": "", "impact_possible": "", "ask": f.get("recommendation") or "",
                        "confirm": f.get("how_to_verify") or "", "owner": "development", "translation_fallback": True}
        loc = dict(rendered)
        loc["owner_label"] = OWNER_LABELS[key][loc["owner"]]
        loc["status_label"] = STATUS_LABELS[key][f["status"]]
        loc["status_condition"] = STATUS_CONDITION[key][f["status"]]
        loc["priority"] = PRIORITY_LABELS[key][f["severity"]]
        loc["priority_reason"] = PRIORITY_REASON[key][f["severity"]]
        loc["copy_request"] = _copy_request(loc, f, key, url)
        f["localized"] = loc
        # engine English kept only as a technical diagnostic, never as the displayed text
        f["diagnostic_en"] = {"title": f.get("title"), "description": f.get("description")}
        f["title"], f["description"] = loc["title"], loc["found"]
        for k in ("recommendation", "how_to_verify"):
            f.pop(k, None)
        if f.get("limitations"):
            f["limitations"] = [M.translate_static(x, key, missing) for x in f["limitations"]]
        if f.get("legal_context"):
            f["legal_context"]["text"] = _legal(f["legal_context"]["text"], key)

    r["limitations"] = [M.translate_static(x, key, missing) for x in r.get("limitations") or []]
    for k in ("message", "disclaimer"):
        if r.get(k):
            r[k] = M.translate_static(r[k], key, missing)
    for p in r.get("pages") or []:
        if p.get("limitations"):
            p["limitations"] = [M.translate_static(x, key, missing) for x in p["limitations"]]
    for t in r.get("tags") or []:
        t["observed_firing_note"] = M.translate_static(t.get("observed_firing_note"), key, missing)
    for e in (r.get("events") or {}).get("events", []):
        e["note"] = M.translate_static(e.get("note"), key, missing)
        e["glossary"] = explain_event(e["name"], key)
    for c in (r.get("events") or {}).get("code_candidates", []):
        c["note"] = M.translate_static(c.get("note"), key, missing)
    cm = ((r.get("consent") or {}).get("consent_mode")) or {}
    if cm.get("note"):
        cm["note"] = M.translate_static(cm["note"], key, missing)
    for ph in ((r.get("consent") or {}).get("phases") or {}).values():
        it = ph.get("interaction")
        if it and it.get("detail"):
            it["detail"] = M.translate_static(it["detail"], key, missing)
    if (r.get("privacy") or {}).get("note"):
        r["privacy"]["note"] = M.translate_static(r["privacy"]["note"], key, missing)
    if (r.get("network") or {}).get("note"):
        r["network"]["note"] = M.translate_static(r["network"]["note"], key, missing)
    sc = r.get("scores") or {}
    ov = sc.get("overall") or {}
    if ov.get("null_reason"):
        ov["null_reason"] = M.translate_static(ov["null_reason"], key, missing)
    for ax in (sc.get("axes") or {}).values():
        if ax.get("null_reason"):
            ax["null_reason"] = M.translate_static(ax["null_reason"], key, missing)
        ax["checks"] = [M.translate_check(c, key, missing) for c in ax.get("checks") or []]

    r["language"] = nl
    r["timezone"] = DISPLAY_TZ
    r["contract_version"] = CONTRACT_VERSION
    r["i18n"] = {"untranslated": sorted(set(missing)), "fallback": nl == "es"}
    return r


_LEGAL_PT = {
    "LC_CONSENT": "Quando o consentimento é a base legal escolhida pelo controlador, a LGPD (arts. 7º, I e 8º) exige que ele seja livre, informado e inequívoco, e o guia da ANPD sobre cookies trata do consentimento para cookies não essenciais. Na UE, aplicam-se a Diretiva ePrivacy (art. 5(3)) e o art. 7 do GDPR. Um teste público não conhece a base legal definida pelo controlador; este comportamento pode exigir análise de finalidade e base legal.",
    "LC_PII": "Dados pessoais enviados a terceiros podem caracterizar uso compartilhado e, conforme o destinatário, transferência internacional (LGPD, arts. 7º, 26 e 33; GDPR, arts. 6, 28 e 44 e seguintes). A licitude depende de finalidade, base legal, contratos e transparência, que um teste público não avalia. Requer revisão jurídica/manual.",
    "LC_PINGS": "A adequação de pings sem cookies antes do consentimento depende da análise jurídica do controlador; autoridades não têm entendimento uniforme.",
}


def _legal(text: str, lang: str) -> str:
    if lang != "pt-BR":
        return text
    if text.startswith("Where consent is the legal basis"):
        return _LEGAL_PT["LC_CONSENT"]
    if text.startswith("Personal data sent to third parties"):
        return _LEGAL_PT["LC_PII"]
    if text.startswith("Whether cookieless pings"):
        return _LEGAL_PT["LC_PINGS"]
    return text
