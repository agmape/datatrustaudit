# RAG Sources

The explanation layer (`datatrust/rag/`) retrieves passages from a small, versioned corpus of **official** sources. It never participates in detection: it receives findings already produced by the deterministic pipeline and returns guidance **with citations**. If no passage passes the relevance threshold, it returns `insufficient_sources` and generates nothing.

## Architecture decision

The product is public and stateless (no database is required to scan). Adding Supabase/pgvector only for ~460 passages would add an external dependency to a path that must keep working when it is down. The corpus is therefore a versioned JSON file (`datatrust/rag/corpus.json`) built by `scripts/build_rag_corpus.py`, with **lexical BM25 retrieval** restricted, per rule, to the relevant documents. Embeddings / pgvector can be added later behind the same `explain_findings()` interface if the corpus grows.

The audit works identically when the corpus is missing: `/api/explain` answers `{available: false}`.

## Corpus (built 2026-10-27, 457 chunks, 0 failed sources)

| doc_id | Publisher | Jurisdiction | Document | Chunks |
|---|---|---|---|---|
| `lgpd` | Presidência da República (Planalto) | BR | Lei 13.709/2018 (LGPD), compiled text — arts. 1–3, 5–12, 16, 18, 26, 33, 37, 41, 46, 50 | 32 |
| `anpd_cookies` | ANPD | BR | Guia Orientativo — Cookies e Proteção de Dados Pessoais | 59 |
| `gdpr` | EUR-Lex | EU | Regulation (EU) 2016/679 — arts. 4, 5, 6, 7, 13, 25, 28, 44, 46 | 27 |
| `eprivacy` | EUR-Lex | EU | Directive 2002/58/EC (consolidated 2009-12-19) — art. 5 | 2 |
| `edpb_consent` | EDPB | EU | Guidelines 05/2020 on consent (v1.1) | 93 |
| `edpb_art53` | EDPB | EU | Guidelines 2/2023 on technical scope of art. 5(3) ePrivacy (v2.0) | 37 |
| `google_consent_mode` | Google Tag Platform | vendor | Consent mode overview | 19 |
| `google_consent_setup` | Google Tag Platform | vendor | Set up consent mode on websites | 33 |
| `ga4_events_ref` | Google Analytics | vendor | GA4 recommended events reference | 75 |
| `ga4_ecommerce` | Google Analytics | vendor | Measure ecommerce | 19 |
| `gtm_datalayer` | Google Tag Manager | vendor | The data layer | 18 |
| `gtm_install` | Google Tag Manager | vendor | Google Tag Manager for web | 4 |
| `ga_pii` | Google Analytics Help | vendor | Best practices to avoid sending PII | 7 |
| `ua_sunset` | Google Analytics Help | vendor | Universal Analytics replaced by GA4 | 19 |
| `meta_pixel_conversion` | Meta for Developers | vendor | Meta Pixel — conversion tracking | 11 |
| `meta_advanced_matching` | Meta for Developers | vendor | Meta Pixel — advanced matching | 2 |

Exact URLs are in `scripts/build_rag_corpus.py` and in every chunk.

## Chunk metadata

`chunk_id`, `doc_id`, `source_url`, `publisher`, `jurisdiction`, `document_title`, `version`, `retrieved_at`, `section` (article / heading / PDF page), `content_hash` (`sha256:` of the text), `text`.

## Citations

Each explanation returns up to 4 citations with `source_url`, `publisher`, `jurisdiction`, `document_title`, `version`, `section`, `retrieved_at`, `content_hash`, a **verbatim excerpt** (≤420 chars) and a relevance score. The `how_to_verify` / `how_to_fix` texts are product methodology and are only displayed together with citations.

## Rebuilding

```powershell
.\.venv\Scripts\python.exe scripts\build_rag_corpus.py
```

EUR-Lex serves a JavaScript challenge to plain HTTP clients, so those documents are rendered with Playwright. Failures are recorded in `failed_sources` — text is never written from memory or paraphrased. Re-run periodically (laws are amended; vendor docs change) and review the diff of `content_hash` values.

## Assistant (chat)

`/api/chat` retrieves passages for the user's question and sends the model only: the reduced report (findings/tags with status) + the retrieved passages. The system prompt forbids legal conclusions and monetary estimates; a post-check discards answers that contain them and falls back to a deterministic, grounded summary. Without `GOOGLE_API_KEY`, the deterministic mode is used.
