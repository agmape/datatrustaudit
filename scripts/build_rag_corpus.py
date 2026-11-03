"""
Build the versioned RAG corpus from OFFICIAL sources only.

    python scripts/build_rag_corpus.py

Writes datatrust/rag/corpus.json. Every chunk carries: source_url, publisher,
jurisdiction, document_title, version/date (when stated), retrieved_at,
section, content_hash. Sources that cannot be fetched are recorded in
"failed_sources" — nothing is written from memory or paraphrased.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

OUT = Path(__file__).resolve().parent.parent / "datatrust" / "rag" / "corpus.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 DataTrustAudit-CorpusBuilder/1.1"

SOURCES = [
    # ── Brazil ──
    {"id": "lgpd", "url": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm",
     "publisher": "Presidência da República (Planalto)", "jurisdiction": "BR",
     "title": "Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD), texto compilado",
     "version": "texto compilado (vigente na data de coleta)", "kind": "law_articles",
     "keep_articles": [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 16, 18, 26, 33, 37, 41, 46, 50]},
    {"id": "anpd_cookies", "url": "https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf/@@display-file/file",
     "publisher": "Autoridade Nacional de Proteção de Dados (ANPD)", "jurisdiction": "BR",
     "title": "Guia Orientativo — Cookies e Proteção de Dados Pessoais", "version": "out/2022", "kind": "pdf"},
    # ── EU ──
    {"id": "gdpr", "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679",
     "publisher": "EUR-Lex (Publications Office of the EU)", "jurisdiction": "EU",
     "title": "Regulation (EU) 2016/679 — General Data Protection Regulation", "version": "OJ L 119, 4.5.2016",
     "kind": "eu_articles", "browser": True, "keep_articles": [4, 5, 6, 7, 13, 25, 28, 44, 46]},
    {"id": "eprivacy", "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02002L0058-20091219",
     "publisher": "EUR-Lex (Publications Office of the EU)", "jurisdiction": "EU",
     "title": "Directive 2002/58/EC (ePrivacy Directive), consolidated 2009-12-19", "version": "consolidated 2009-12-19",
     "kind": "eu_articles", "browser": True, "keep_articles": [5]},
    {"id": "edpb_consent", "url": "https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf",
     "publisher": "European Data Protection Board (EDPB)", "jurisdiction": "EU",
     "title": "Guidelines 05/2020 on consent under Regulation 2016/679", "version": "v1.1, 4 May 2020", "kind": "pdf"},
    {"id": "edpb_art53", "url": "https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf",
     "publisher": "European Data Protection Board (EDPB)", "jurisdiction": "EU",
     "title": "Guidelines 2/2023 on Technical Scope of Art. 5(3) of ePrivacy Directive", "version": "v2.0, 7 Oct 2024", "kind": "pdf"},
    # ── Google ──
    {"id": "google_consent_mode", "url": "https://developers.google.com/tag-platform/security/concepts/consent-mode",
     "publisher": "Google (Tag Platform)", "jurisdiction": "vendor", "title": "Consent mode overview", "kind": "html"},
    {"id": "google_consent_setup", "url": "https://developers.google.com/tag-platform/security/guides/consent",
     "publisher": "Google (Tag Platform)", "jurisdiction": "vendor", "title": "Set up consent mode on websites", "kind": "html"},
    {"id": "ga4_events_ref", "url": "https://developers.google.com/analytics/devguides/collection/ga4/reference/events",
     "publisher": "Google Analytics", "jurisdiction": "vendor", "title": "GA4 recommended events reference", "kind": "html"},
    {"id": "ga4_ecommerce", "url": "https://developers.google.com/analytics/devguides/collection/ga4/ecommerce",
     "publisher": "Google Analytics", "jurisdiction": "vendor", "title": "Measure ecommerce (GA4)", "kind": "html"},
    {"id": "gtm_datalayer", "url": "https://developers.google.com/tag-platform/tag-manager/datalayer",
     "publisher": "Google (Tag Manager)", "jurisdiction": "vendor", "title": "The data layer", "kind": "html"},
    {"id": "gtm_install", "url": "https://developers.google.com/tag-platform/tag-manager/web",
     "publisher": "Google (Tag Manager)", "jurisdiction": "vendor", "title": "Google Tag Manager for web", "kind": "html"},
    {"id": "ga_pii", "url": "https://support.google.com/analytics/answer/6366371?hl=en",
     "publisher": "Google Analytics Help", "jurisdiction": "vendor", "title": "Best practices to avoid sending Personally Identifiable Information (PII)", "kind": "html"},
    {"id": "ua_sunset", "url": "https://support.google.com/analytics/answer/11583528?hl=en",
     "publisher": "Google Analytics Help", "jurisdiction": "vendor", "title": "Universal Analytics has been replaced by Google Analytics 4", "kind": "html"},
    # ── Meta ──
    {"id": "meta_pixel_conversion", "url": "https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking",
     "publisher": "Meta for Developers", "jurisdiction": "vendor", "title": "Meta Pixel — Conversion tracking", "kind": "html"},
    {"id": "meta_advanced_matching", "url": "https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching",
     "publisher": "Meta for Developers", "jurisdiction": "vendor", "title": "Meta Pixel — Advanced matching", "kind": "html"},
]

MAX_CHUNK = 1400


def _clean(t: str) -> str:
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    return t.strip()


def _split(text: str, size: int = MAX_CHUNK):
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 1 > size and buf:
            yield buf
            buf = ""
        while len(p) > size:
            yield p[:size]
            p = p[size:]
        buf = (buf + "\n" + p).strip()
    if buf:
        yield buf


def _html_sections(html: str):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "nav", "footer", "header", "aside", "devsite-toc", "devsite-feedback"]):
        t.decompose()
    main = soup.find("article") or soup.find("main") or soup.body or soup
    section, buf = "Introduction", []
    for el in main.find_all(["h1", "h2", "h3", "p", "li", "td", "pre", "code"]):
        if el.name in ("h1", "h2", "h3"):
            if buf:
                yield section, _clean("\n".join(buf))
            section, buf = _clean(el.get_text(" ")), []
        else:
            txt = el.get_text(" ").strip()
            if txt and (not buf or txt != buf[-1]):
                buf.append(txt)
    if buf:
        yield section, _clean("\n".join(buf))


def _law_articles(text: str, keep, pattern):
    parts = re.split(pattern, text)
    # parts: [pre, num, body, num, body...]
    for i in range(1, len(parts) - 1, 2):
        try:
            n = int(re.sub(r"\D", "", parts[i]))
        except ValueError:
            continue
        if n in keep:
            yield n, _clean(parts[i + 1])


def browser_text(url: str) -> str:
    """EUR-Lex serves a JavaScript challenge to plain HTTP clients; render with Chromium."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(user_agent=UA)
        pg.goto(url, timeout=90000)
        pg.wait_for_timeout(4000)
        t = pg.inner_text("body")
        b.close()
    return t


def fetch(src):
    last = None
    for ua in (UA, "DataTrustAudit-CorpusBuilder/1.1 (+official-sources-only)"):
        r = requests.get(src["url"], headers={"User-Agent": ua, "Accept-Language": "en,pt-BR;q=0.8"}, timeout=40)
        if r.status_code < 400:
            return r
        last = r
    last.raise_for_status()
    return last


def build():
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    chunks, failed, ok = [], [], []
    for src in SOURCES:
        try:
            r = fetch(src) if not src.get("browser") else None
            sections = []
            if src["kind"] == "pdf":
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(r.content))
                for pi, page in enumerate(reader.pages):
                    t = _clean(page.extract_text() or "")
                    if len(t) > 80:
                        sections.append((f"p. {pi + 1}", t))
            elif src["kind"] == "law_articles":
                r.encoding = r.apparent_encoding or "latin-1"
                text = BeautifulSoup(r.text, "html.parser").get_text("\n")
                text = re.sub(r"\s+\n", "\n", text)
                seen = set()
                for n, body in _law_articles(text, set(src["keep_articles"]), r"\n\s*(Art\.\s*\d+)\s*[ºo°]?\.?\s*"):
                    if n in seen:
                        continue   # compiled text may repeat superseded wording; keep first (current) occurrence
                    seen.add(n)
                    sections.append((f"Art. {n}", body[:6000]))
            elif src["kind"] == "eu_articles":
                text = browser_text(src["url"]).replace("\xa0", " ")
                seen = set()
                for n, body in _law_articles(text, set(src["keep_articles"]), r"\n\s*(Article\s+\d+)\s*\n"):
                    if n in seen:
                        continue
                    seen.add(n)
                    sections.append((f"Article {n}", body[:8000]))
            else:
                sections = list(_html_sections(r.text))
            n_before = len(chunks)
            for sec, text in sections:
                for k, part in enumerate(_split(text)):
                    if len(part) < 60:
                        continue
                    h = hashlib.sha256(part.encode("utf-8")).hexdigest()
                    chunks.append({
                        "chunk_id": f"{src['id']}#{len(chunks) - n_before + 1}",
                        "doc_id": src["id"], "source_url": src["url"], "publisher": src["publisher"],
                        "jurisdiction": src["jurisdiction"], "document_title": src["title"],
                        "version": src.get("version"), "retrieved_at": now, "section": sec,
                        "content_hash": f"sha256:{h}", "text": part,
                    })
            added = len(chunks) - n_before
            if added == 0:
                failed.append({"id": src["id"], "url": src["url"], "reason": "no extractable text"})
            else:
                ok.append({"id": src["id"], "chunks": added})
            print(f"[ok] {src['id']}: {added} chunks")
        except Exception as exc:
            failed.append({"id": src["id"], "url": src["url"], "reason": f"{exc.__class__.__name__}: {str(exc)[:160]}"})
            print(f"[fail] {src['id']}: {exc}", file=sys.stderr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"built_at": now, "sources_ok": ok, "failed_sources": failed, "chunks": chunks},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(chunks)} chunks to {OUT}; failed: {len(failed)}")


if __name__ == "__main__":
    build()
