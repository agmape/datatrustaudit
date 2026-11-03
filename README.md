# DataTrust Audit

Public, evidence-first audit of a website's tracking and privacy behavior.

You enter a URL. The scanner visits the site in a real headless browser, executes JavaScript, observes network requests, cookies, storage, `dataLayer`, `gtag()`/`fbq()` calls and the consent banner — in three isolated contexts (no interaction, after **Reject all**, after **Accept all**) — and reports **only what was observed**, each claim linked to the evidence that supports it.

**The scanner never invents data.** When something cannot be observed, the report says *not observed*, *not verifiable in this type of scan*, *insufficient evidence* or *requires manual verification*. No simulated tags, cookies, events or IDs; no estimated fines; no guessed scores.

**The basic single-page audit is public — no login, no paywall.** Accounts (Supabase Auth) add quota-backed usage, saved history and, on Pro/Premium, the multi-page scan. See [PLANS.md](PLANS.md) and [AUTH_AND_ADMIN.md](AUTH_AND_ADMIN.md). Reports are rendered for managers (**Visão do gestor**) and for technicians (**Visão técnica**) from the same findings, in pt-BR (default), English or Spanish (falls back to English).

## What it analyzes (when observable)

GTM · Google tag (gtag.js) · GA4 · Google Ads · Floodlight · Meta Pixel · TikTok Pixel · LinkedIn Insight · Microsoft UET · Pinterest · X · Hotjar · Microsoft Clarity · FullStory · Segment · Amplitude · Mixpanel · Heap · Adobe Analytics / Launch · Optimizely · VWO · Criteo · Taboola · Outbrain · HubSpot · Klaviyo · CMPs (Cookiebot, OneTrust, Didomi, Usercentrics, CookieYes, iubenda, AdOpt, Termly, Quantcast, TrustArc, Osano, CookieFirst, Axeptio, Sourcepoint, Complianz) · Consent Mode (order, v2 signals, `gcs`) · dataLayer events · GA4 recommended-event parameters · cookies · storage · observable personal data (redacted) · duplicates · initialization order · privacy/cookie policy links · behavior before/after consent.

See [ACCURACY_AND_LIMITATIONS.md](ACCURACY_AND_LIMITATIONS.md) for what it can and cannot prove.

## Run locally

Requirements: Python 3.11+ and Node 18+.

```powershell
# backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r req.txt
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000

# frontend (dev, proxies /api to :8000)
cd static
npm install
npm run dev          # http://localhost:8080
```

Production: `cd static && npm run build`, then FastAPI serves `static/dist` on port 8000.

Environment (`.env`, see `.env.example`):

* Accounts (optional — the public scan works without them): `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (server) and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public key only; never put a secret in a `VITE_*` variable).
* `DATABASE_URL` — `sqlite:///var/datatrust.db` by default (development). Production: PostgreSQL (`psycopg[binary]`). Migrations in `datatrust/migrations` run on startup.
* Plans: `FREE_MAX_SCANS`, `PRO_MAX_SCANS`, `PREMIUM_MAX_SCANS`; reference prices `PRICE_PRO_BRL`, `PRICE_PREMIUM_BRL` (display only).
* `GOOGLE_API_KEY` (assistant LLM mode; deterministic otherwise), `DATATRUST_MAX_CONCURRENT_SCANS`, `DATATRUST_RATE_LIMIT_SCANS`, `DATATRUST_RATE_WINDOW_S`, `DATATRUST_DEEP_MAX_PAGES`, `DATATRUST_CORS_ORIGINS`, `DATATRUST_TRUST_PROXY`.

Grant the administrator role (after that account signed in once): `python scripts/grant_admin.py --email datatrustaudit@gmail.com`.

## Documentation

* [ARCHITECTURE.md](ARCHITECTURE.md) — the single pipeline, modules, API, statuses
* [EVIDENCE_MODEL.md](EVIDENCE_MODEL.md) — Evidence / Finding / Tag schemas, redaction
* [SCORING.md](SCORING.md) — versioned formulas, weights, coverage, confidence
* [ACCURACY_AND_LIMITATIONS.md](ACCURACY_AND_LIMITATIONS.md)
* [RAG_SOURCES.md](RAG_SOURCES.md) — official corpus and citations
* [PLANS.md](PLANS.md) — plan matrix, quotas, credit policy, admin simulation/testing
* [AUTH_AND_ADMIN.md](AUTH_AND_ADMIN.md) — JWT verification, routes, admin bootstrap, pending configuration
* [TESTING.md](TESTING.md)

## Deployment notes

Run the scanner in an isolated container whose egress firewall blocks private, loopback, link-local, CGNAT and cloud-metadata ranges (defense in depth on top of the application-level SSRF guard). Put it behind a reverse proxy and set `DATATRUST_TRUST_PROXY=1` so rate limiting sees client IPs.
