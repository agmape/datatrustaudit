"""
Grounded assistant for the AI chat.

Context = ONLY the scan report produced by the canonical pipeline, reduced to
findings/tags with their epistemic status, plus citations retrieved from the
official RAG corpus. The model is instructed (and post-checked) to:
  * never present INFERRED / NOT_OBSERVED / UNVERIFIABLE as facts,
  * never claim a legal violation or estimate fines/damages,
  * answer "not observed in this scan" when the context has no answer.
Works without an LLM (deterministic fallback).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

_MONEY_RE = re.compile(r"(R\$\s?\d|US\$\s?\d|€\s?\d|\$\s?\d[\d.,]*\s*(mil|milh|million|thousand)?|multa\s+(de|estimada)|estimated\s+fine)", re.I)
_VIOLATION_RE = re.compile(r"\b(viola(?:ção|ções|ndo|m)?\s+(?:a|da)\s+lgpd|is\s+violating|violates\s+(?:the\s+)?(?:lgpd|gdpr)|ilegal(?:mente)?|illegal(?:ly)?)\b", re.I)


def build_context(report: Dict[str, Any]) -> Dict[str, Any]:
    findings = []
    for f in (report.get("findings") or [])[:60]:
        findings.append({k: f.get(k) for k in ("id", "rule_id", "title", "status", "severity", "confidence", "description")}
                        | {"evidence_count": len(f.get("evidence_ids") or [])})
    tags = [{k: t.get(k) for k in ("technology", "ids", "observed_firing", "confidence", "detection_methods")}
            for t in (report.get("tags") or [])[:60]]
    scores = report.get("scores") or {}
    return {
        "url": (report.get("target") or {}).get("final_url") or (report.get("target") or {}).get("url"),
        "scan_status": report.get("status"),
        "capabilities": report.get("capabilities"),
        "limitations": (report.get("limitations") or [])[:12],
        "tags": tags,
        "findings": findings,
        "overall_score": (scores.get("overall") or {}).get("score"),
        "overall_score_null_reason": (scores.get("overall") or {}).get("null_reason"),
    }


def opening_summary(ctx: Dict[str, Any], language: str = "pt-BR") -> str:
    obs = [f for f in ctx["findings"] if f["status"] == "OBSERVED" and f["severity"] not in ("info",)]
    inf = [f for f in ctx["findings"] if f["status"] == "INFERRED"]
    unv = [f for f in ctx["findings"] if f["status"] in ("UNVERIFIABLE",)]
    if language.startswith("pt"):
        return (f"Escaneei {ctx['url']} (status: {ctx['scan_status']}). Tecnologias com evidência: {len(ctx['tags'])}. "
                f"Achados técnicos OBSERVADOS (não informativos): {len(obs)}; INFERIDOS: {len(inf)}; "
                f"não verificáveis: {len(unv)}. Nada disto é conclusão jurídica.")
    return (f"I scanned {ctx['url']} (status: {ctx['scan_status']}). Technologies with evidence: {len(ctx['tags'])}. "
            f"OBSERVED technical findings (non-info): {len(obs)}; INFERRED: {len(inf)}; unverifiable: {len(unv)}. "
            "None of this is a legal conclusion.")


def _deterministic(message: str, ctx: Dict[str, Any], sources: List[Dict[str, Any]], language: str) -> str:
    q = message.lower()
    words = {w for w in re.findall(r"[a-z0-9_]{4,}", q)}
    rel = [f for f in ctx["findings"] if words & set(re.findall(r"[a-z0-9_]{4,}", (f["title"] + " " + f["rule_id"]).lower()))]
    lines = [opening_summary(ctx, language)]
    if any(w in q for w in ("multa", "fine", "penal", "sanç", "sanc")):
        lines.append("Não estimo multas ou sanções: um scan público não tem contexto (faturamento, base legal, histórico) "
                     "para isso. Consulte um profissional jurídico." if language.startswith("pt") else
                     "I don't estimate fines or sanctions: a public scan lacks the context needed. Consult a legal professional.")
    for f in (rel or ctx["findings"][:5]):
        lines.append(f"- [{f['id']}] {f['title']} — status {f['status']}, severidade técnica {f['severity']}, "
                     f"{f['evidence_count']} evidência(s).")
    if sources:
        lines.append("Fontes oficiais relacionadas: " + "; ".join(f"{s['document_title']} ({s['section']}) {s['source_url']}" for s in sources[:3]))
    return "\n".join(lines)


def answer(message: str, report: Dict[str, Any], language: str = "pt-BR") -> Dict[str, Any]:
    ctx = build_context(report or {})
    if not ctx["findings"] and not ctx["tags"] and not report:
        return {"answer": "Nenhum relatório foi fornecido; não há o que responder sobre o site." if language.startswith("pt")
                else "No report provided; nothing can be said about the site.", "grounded": True, "citations": [], "mode": "none"}
    try:
        from .rag import retrieve
        sources = retrieve(message, k=4)
    except Exception:
        sources = []
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"answer": _deterministic(message, ctx, sources, language), "grounded": True, "citations": sources,
                "mode": "deterministic"}
    system = (
        "You are the DataTrust Audit assistant. Answer ONLY from CONTEXT (a scan report) and SOURCES (official "
        "documentation excerpts). Rules: (1) Every claim about the website must cite a finding id like [F-001]. "
        "(2) Findings with status INFERRED, NOT_OBSERVED or UNVERIFIABLE must be described as such, never as facts. "
        "(3) Never say the company violates a law, never estimate fines, damages or penalties, never say data was "
        "transferred illegally. Use cautious language: 'technical risk', 'may require legal review'. "
        "(4) If CONTEXT does not answer the question, say it was not observed in this scan. "
        "(5) Cite documentation as [S1], [S2] from SOURCES; do not cite anything else. "
        f"Reply in {'Brazilian Portuguese' if language.startswith('pt') else ('Spanish' if language.startswith('es') else 'English')}."
    )
    src_block = "\n".join(f"[S{i + 1}] {s['document_title']} — {s['section']} ({s['source_url']}): {s['excerpt']}"
                          for i, s in enumerate(sources))
    prompt = f"CONTEXT:\n{json.dumps(ctx, ensure_ascii=False)[:24000]}\n\nSOURCES:\n{src_block or '(none)'}\n\nQUESTION: {message}"
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite"), contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system, temperature=0.1, max_output_tokens=900))
        text = (resp.text or "").strip()
    except Exception as exc:
        return {"answer": _deterministic(message, ctx, sources, language), "grounded": True, "citations": sources,
                "mode": "deterministic", "note": f"LLM unavailable ({exc.__class__.__name__})"}
    if _MONEY_RE.search(text) or _VIOLATION_RE.search(text):
        return {"answer": _deterministic(message, ctx, sources, language), "grounded": True, "citations": sources,
                "mode": "deterministic", "note": "LLM answer discarded by safety post-check (legal conclusion / monetary estimate)."}
    return {"answer": text, "grounded": True, "citations": sources, "mode": "llm"}
