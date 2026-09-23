# DataTrust Audit — Technical Audit

**Audit scope:** repository `agmape/datatrustaudit`  
**Purpose:** establish what the product actually observes, what is heuristic, what was simulated, what is incomplete, and what cannot be established by an external website scan.

> The governing principle for this review is evidence-first: a function name, UI label, vendor signature, regex match, or AI statement is not proof by itself. Technical observation and legal determination are kept separate.

---

## 1. Executive Summary

DataTrust Audit contains a legitimate technical auditing core, especially in the newer `audit_engine/` + `api/audit.py` path. It can perform real HTTP/browser collection, inspect rendered HTML, observe network requests, read runtime `dataLayer`, cookies and Web Storage, detect tracker/vendor signatures, analyze event structures, classify privacy-related technical signals, and produce a deterministic technical score.

However, the repository also contained a substantial legacy frontend/backend layer that overstated what was known. Confirmed examples included synthetic scripts/events generated on fetch failure, `Math.random()` data presented as real evidence, hardcoded monetary fine ranges, an assumed company size, inferred "proof of damage", automatic "LGPD violation" language, vendor/event-name-based sensitive-data classification, and legacy HTML heuristics presented as runtime facts.

The highest-risk misleading paths have been neutralized in this audit. The primary production path remains `POST /api/audit`.

The main production architecture limitation is infrastructure: browser auditing with Chromium/Playwright is compute-heavy and operationally fragile inside a serverless request lifecycle. Vercel is appropriate for the frontend and lightweight API/orchestration, but a durable production scanner should run in a dedicated browser worker backed by PostgreSQL and a queue.

The product can credibly be positioned as a **technical privacy/data-governance evidence scanner**. It cannot credibly certify LGPD compliance, determine the legal basis for processing, prove legal violations, determine organizational practices, calculate an actual ANPD fine, or infer company revenue from a public site.

---

## 2. Architecture Overview

### Current primary path

```text
React/Vite frontend
      |
      | POST /api/audit
      v
FastAPI
      |
      +--> URL / SSRF validation
      |
      +--> Playwright browser scan (when runtime supports it)
      |      - rendered HTML
      |      - requests
      |      - scripts
      |      - dataLayer
      |      - cookies
      |      - local/session storage
      |      - consent globals
      |
      +--> static HTTP fallback
      |
      v
audit_engine orchestrator
      |
      +--> tag detector
      +--> event auditor
      +--> dataLayer auditor
      +--> consent auditor
      +--> privacy/personal-data classifiers
      +--> duplicate/GTM quality analysis
      +--> deterministic heuristic score
      |
      v
structured API response
      |
      v
React result UI
```

### Secondary/legacy paths

The repository still contains legacy endpoints and compatibility code in `main.py` and older frontend utilities. They are not the authoritative audit engine and must remain clearly separated from the primary path. During this audit, legacy simulation and monetary/legal overclaims were removed or neutralized.

---

## 3. What Actually Works

### Real technical collection

- HTTP requests to public targets.
- SSRF-aware URL validation before scans.
- Playwright-based browser navigation when Chromium is available.
- Rendered HTML collection.
- Runtime script URL collection.
- Network-request interception for known tracking patterns.
- Runtime `dataLayer` capture.
- Interception of `gtag` and `fbq` calls.
- Browser cookies, localStorage and sessionStorage collection.
- Consent-related browser-global inspection.
- Static HTML fallback when browser execution fails.
- Redirect-aware SSRF validation in the static fallback.
- Tag/vendor signature detection.
- GTM and GA4 ID extraction.
- Structured event analysis.
- Duplicate detection.
- DataLayer quality findings.
- Technical consent/CMP indicators.
- Personal-data signal detection with values redacted.
- Sensitive-data signal classification.
- Technical score calculation with fixed weights.
- Backend plan entitlement resolution.
- Local/Supabase-style authentication paths.
- Mercado Pago preference creation when configured.
- Mercado Pago payment verification and plan activation.
- PDF/XLSX/report generation paths, subject to the accuracy of their source findings.

### Evidence quality rule

A real collection mechanism does not make every conclusion derived from it "confirmed". For example, finding a Meta script in HTML is real evidence that the signature exists, but it does not prove every possible field that Meta received. The distinction between source evidence and inferred risk must remain visible.

---

## 4. What Is Simulated

### Confirmed historical simulation found

The audit found legacy code that:

- generated plausible tracker scripts when a real fetch failed;
- generated plausible analytics/ecommerce events using random conditions;
- marked those synthetic items as `realScript: true` / `realEvent: true`;
- created a random Google Analytics report URL;
- contained hardcoded mock audit fixtures.

### Remediation applied

Production-compatible legacy modules now fail closed:

- no synthetic script fallback;
- no synthetic event fallback;
- no mock evidence fallback;
- no fabricated analytics URL;
- historical mock utility returns no production data;
- browser-side public proxy collection has been disabled;
- the legacy `simulateAudit` entry point now refuses to run and instructs callers to use `POST /api/audit`.

**Current status:** the confirmed simulated-evidence fallbacks identified in this review have been removed from production behavior.

---

## 5. What Is Partially Implemented

- Browser scan reliability in Vercel/serverless: functional in principle, but Chromium availability, cold starts, memory and function duration make it operationally fragile.
- Consent analysis: can observe CMP signatures and Consent Mode/browser signals, but cannot establish whether consent is legally valid.
- "Before consent" analysis: strong when backed by actual runtime request ordering; weaker when inferred from static HTML.
- Event validation: can compare observed event/parameter structures, but cannot know business requirements that are not supplied.
- Deep scan: product/UI references exist historically, but production plan flags currently disable it.
- Continuous monitoring: not implemented as a production monitoring worker.
- History: depends on persistent database configuration; serverless `/tmp` is not durable.
- Exports: technically implemented, but usefulness depends on persisted real scan data and should only use technical-risk language.
- Premium source mapping: can expose observed source hints/lines in some scan modes, but cannot inspect unpublished GTM workspaces without authorized GTM/container data.
- AI chat: useful as an explanation layer, but only safe when grounded in structured findings.

---

## 6. What Is Impossible to Determine Externally

An external scanner cannot establish with certainty:

- whether an organization is legally compliant with the LGPD as a whole;
- whether a specific processing operation has a valid legal basis;
- contractual relationships with processors/subprocessors;
- internal retention/deletion practices;
- governance policies that are not public;
- internal security controls not observable from the public application;
- the purpose assigned internally to a processing activity;
- whether consent was obtained through another channel/context;
- exact GA4/GTM workspace configuration without authorized access/export;
- unpublished GTM changes;
- internal data warehouse/CRM processing after data reaches the organization;
- organization revenue;
- actual ANPD sanction value;
- civil damages;
- "proof of damage";
- whether every page, authenticated flow, SPA route or post-login behavior behaves like the sampled page.

Product language should use:
- observed technical evidence;
- indicator;
- possible risk;
- not observed during this scan;
- requires manual verification;
- confidence;
- evidence unavailable externally.

---

## 7. Critical Bugs

### Corrected in this audit

1. **Synthetic findings presented as real** — corrected.
2. **Fake monetary fine ranges** — corrected in audited legacy frontend paths and legacy privacy backend path.
3. **Assumed company size** — removed.
4. **Inferred proof of damage** — removed.
5. **Generic 15–16 digit Meta Pixel detector** — removed from legacy detector; Meta now requires contextual evidence.
6. **No-CMP => automatically "fired before consent"** — removed from legacy detector.
7. **Payment endpoint returned fake checkout success when Mercado Pago was absent** — removed; now fails closed.
8. **Mercado Pago webhook accepted unsigned notifications** — corrected with HMAC verification.
9. **Legacy browser fetch disabled TLS verification and followed redirects without SSRF revalidation** — corrected.
10. **Duplicate root/health routes in `main.py`** — removed.
11. **Backend API invented fallback score 70/50** — removed; score is unavailable when scoring evidence is unavailable.
12. **UI displayed missing score as real zero** — UI now carries a `scoreAvailable` flag and displays N/A in the principal result view.

### Remaining architectural bug/debt

`main.py` is still too large and mixes current app composition with historical endpoint logic. This is maintainability debt and creates a risk of future semantic divergence. The safe long-term direction is to move legacy endpoints into explicitly deprecated routers, then remove them after confirming no consumers remain.

---

## 8. Security Findings

### SSRF

**Status: substantially hardened.**

`audit_engine/url_security.py`:
- accepts only HTTP(S);
- rejects embedded credentials;
- blocks localhost/internal suffixes and cloud metadata hostnames;
- resolves DNS;
- requires resolved IPs to be globally routable;
- rejects loopback/private/link-local/reserved/unspecified/multicast ranges.

The browser fetcher additionally validates HTTP(S) subrequests and aborts unsafe targets. The static fallback revalidates every redirect. Legacy `smart_fetch` was updated to the same redirect-validation model.

### Authentication

Local JWT no longer uses a production default secret. If `SECRET_KEY` is absent, local JWT issuance is unavailable instead of silently signing with a known string. Development admin mode is disabled in Vercel/production.

### CORS

Production no longer defaults to wildcard credentials. Allowed origins are configured using `ALLOWED_ORIGINS`.

### Payments

The Mercado Pago webhook now verifies the signed manifest using HMAC-SHA256 and constant-time comparison. Checkout fails closed when provider configuration is missing.

### Remaining security work

- Add rate limiting / abuse controls to expensive scan endpoints.
- Add per-user and per-IP concurrency caps.
- Consider egress policy at the worker/container level in addition to application SSRF validation.
- Minimize captured request payload data; keep redaction before persistence/logging.
- Configure production secret rotation and secret-management policy.
- Add security headers at the edge.
- Add webhook replay/idempotency observability beyond database payment de-duplication.

---

## 9. LGPD / Regulatory Accuracy Review

The platform should be described as a technical evidence and risk-prioritization system, not an automated legal authority.

### Corrected overclaims

Historical code used phrases such as:
- "violation LGPD";
- "proof of damage";
- monetary fine estimates;
- assumed company size;
- automatic sensitive-data classification from vendor/event names.

These have been removed or softened in the audited production/compatibility paths.

### Appropriate output model

A privacy-related finding should contain:
- technical evidence;
- evidence source/type;
- confidence;
- technical risk description;
- relevant legal context when appropriate;
- explicit statement that legal applicability requires contextual assessment.

An LGPD article may provide context, but the scanner must not state that the article was legally violated solely from a script signature.

---

## 10. Scanner Accuracy Review

### Stronger evidence

**High confidence candidates**
- actual intercepted request to a known vendor endpoint;
- explicit GTM/GA4 IDs in executed/source code;
- runtime dataLayer entry captured;
- runtime cookie/storage key observed;
- explicit `gtag('event', ...)` or `fbq('track', ...)` captured;
- explicit Consent Mode runtime state.

### Medium confidence candidates
- known tracker script URL in HTML;
- explicit vendor initialization call in static HTML;
- CMP library signature in source.

### Low/heuristic candidates
- text-only consent words;
- vendor name without execution;
- generic field-name PII signals without value/context;
- source-code order used to infer runtime execution order.

### Corrected false-positive risks
- unrelated 15-digit numbers no longer imply Meta Pixel in the legacy detector.
- vendor/event name alone no longer implies sensitive personal data.
- no CMP signature no longer automatically proves pre-consent tracking.

### False-negative risks that remain
- trackers loaded after user interaction;
- SPA route transitions;
- delayed/lazy tags;
- iframe-contained trackers;
- anti-bot/CDN blocking;
- authenticated pages;
- server-side tagging;
- consent state depending on geography;
- cookies inaccessible to JavaScript;
- encrypted/obfuscated payloads;
- CAPI/server-to-server flows.

---

## 11. False Positive Risks

Remaining important sources of false positives:

- regex/string signatures in static HTML;
- data field names such as `email` appearing in documentation/code but not in transmitted data;
- a CMP library existing without being active;
- duplicate-looking scripts that are intentionally isolated by configuration;
- consent-related DOM text that does not represent a functional consent mechanism;
- vendor presence being interpreted too broadly as a specific data category.

Mitigation:
- prioritize runtime/network evidence;
- preserve `confidence` and `evidence_type`;
- never upgrade heuristic evidence to verified without corroboration.

---

## 12. False Negative Risks

- headless browser blocked;
- scanner timing window too short;
- tracker loads after scroll/click/login;
- consent geo-targeting;
- SPA client navigation;
- service workers;
- iframe isolation;
- dynamically generated endpoints;
- server-side collection invisible to the browser;
- obfuscated/minified logic;
- content loaded only for real user fingerprints.

Mitigation requires multi-step browser workflows and, eventually, a dedicated scanner worker.

---

## 13. Database Review

### Current state

- SQLAlchemy models support users, subscriptions, scans, findings and payments.
- SQLite is acceptable for local development.
- On Vercel without `DATABASE_URL`, the app uses `/tmp/gtmaudit.db` only as an emergency boot fallback.

### Production requirement

**PostgreSQL is mandatory before production persistence is considered reliable.**

Without persistent PostgreSQL:
- users may disappear across function instances;
- subscription state is unsafe;
- history is unsafe;
- scan state is unsafe;
- payment-derived entitlements are unsafe.

### Recommended next DB work
- introduce Alembic migrations;
- use transaction boundaries for entitlement/payment changes;
- configure production pooling compatible with serverless access;
- add unique/idempotency constraints for provider payment IDs;
- store structured evidence separately from presentation output.

---

## 14. Vercel / Infrastructure Review

### Appropriate for Vercel
- React/Vite frontend;
- CDN/static assets;
- lightweight FastAPI endpoints;
- authentication/orchestration;
- checkout endpoints;
- short database/API operations.

### Weak fit for Vercel request lifecycle
- long Playwright scans;
- Chromium-heavy multi-page scanning;
- continuous monitoring;
- scheduled/repeated browser audits;
- high-concurrency scanning.

### Recommended production architecture

```text
Vercel
  React/Vite frontend
  FastAPI orchestration/API
        |
        v
Persistent PostgreSQL
        |
        +--> jobs table / queue
        |
        v
Dedicated scanner worker
  container/VM/service
  Chromium + Playwright
  controlled egress
  longer timeouts
  bounded concurrency
        |
        v
audit_engine
        |
        v
PostgreSQL findings/evidence
        |
        v
Vercel API -> UI/report/AI explanation
```

A queue can be implemented through a managed queue or a PostgreSQL-backed job model initially. The important architectural boundary is to remove Chromium lifecycle from the user-facing serverless request.

---

## 15. Frontend vs Backend Reality Check

| UI/Product claim | Reality |
|---|---|
| Single-page technical audit | Implemented |
| Tracker/tag detection | Implemented, evidence quality varies |
| Runtime network inspection | Implemented when browser runtime succeeds |
| DataLayer inspection | Implemented, limited to observed runtime |
| Cookie/storage inspection | Implemented when browser runtime succeeds |
| Privacy technical findings | Implemented |
| Exact legal LGPD compliance determination | Impossible externally |
| Actual ANPD fine calculation | Impossible externally |
| Proof of damage | Impossible externally |
| Deep Scan multi-page | Not enabled in production plan flags |
| Continuous monitoring | Not implemented |
| Persistent history | Requires production PostgreSQL |
| External product API/webhook feature | Not implemented as a customer product feature |
| AI explanation | Implemented, must remain downstream of evidence |

Plan marketing was updated so unavailable deep scan/monitoring/history/API features are no longer listed as currently delivered Premium features.

---

## 16. AI Usage Review

### Correct architecture

```text
scanner
  -> evidence
  -> deterministic/heuristic analysis
  -> findings + confidence
  -> score
  -> AI explanation
```

### Prohibited architecture

```text
URL
  -> LLM
  -> invented findings
```

Current direction is correct when Gemini receives the structured scan context. AI must never create new vendor detections, PII findings, consent states or legal violations that are absent from structured evidence.

Remaining recommendation:
- define a strict schema for AI context;
- tag every AI claim with source finding IDs when practical;
- exclude raw secrets/PII values from prompts;
- keep legal language constrained to general context and disclaimers.

---

## 17. Changes Applied

During this audit:

1. Removed synthetic tracker/event fallback from `enhancedRealDataService`.
2. Removed fake fallback from `preciseAnalysisService`.
3. Removed synthetic evidence from `realDataAnalysisUtils`.
4. Disabled production mock fixtures.
5. Replaced hardcoded fine estimates with "not estimable externally".
6. Removed assumed medium company size.
7. Removed inferred proof-of-damage output.
8. Corrected personal vs sensitive-data keyword classification.
9. Removed fabricated analytics report URLs.
10. Reworked legacy script analysis to technical indicators.
11. Reworked legacy "violation" adapter to technical risk semantics.
12. Reworded recommendations to avoid legal determinations.
13. Updated legacy types to permit unknown company size.
14. Replaced legacy legal-risk UI with a technical privacy-risk UI.
15. Disabled browser-side public CORS proxy scanning.
16. Disabled the historical `simulateAudit` production path.
17. Made HTML-only analyzer explicit and conservative.
18. Removed arbitrary backend 70/50 score fallback.
19. Added `scoreAvailable` so missing score can be shown as N/A.
20. Removed unimplemented Premium feature promises.
21. Removed generic 15–16 digit Meta Pixel legacy pattern.
22. Stopped treating absent CMP as proof that all trackers fired before consent.
23. Removed legacy monetary exposure calculation.
24. Hardened legacy static fetch with SSRF-safe redirect checks and TLS verification.
25. Removed duplicate root/health routes.
26. Added Mercado Pago webhook HMAC verification.
27. Removed fake Mercado Pago checkout fallback.
28. Added Mercado Pago signature tests.
29. Added score determinism/semantic tests.
30. Preserved and confirmed centralized SSRF protection.

---

## 18. Remaining Limitations

- Chromium reliability on Vercel still needs real production runtime validation per deployment.
- Long scans should move to a dedicated worker.
- PostgreSQL must be configured for durable production state.
- Rate limiting/concurrency management is not yet a complete production subsystem.
- Legacy `main.py` remains oversized and should be decomposed.
- Legacy endpoints should be formally deprecated after telemetry confirms no usage.
- Multi-page deep scan is not production-ready.
- Continuous monitoring is not implemented.
- Authenticated-flow scanning is not implemented.
- GTM internal workspace inspection requires authorization/export and is not part of external scan.
- Geo-specific consent behavior is not comprehensively tested.
- Static signatures still create some medium-confidence heuristic findings.

---

## 19. Recommended Production Architecture

### Phase 1 — current stabilization
- Vercel: frontend + lightweight API.
- PostgreSQL: users, subscriptions, scans, findings, jobs.
- Current single-page static/browser scan, with explicit evidence quality.
- Mercado Pago verified webhooks.
- Strict no-simulation policy.

### Phase 2 — scanner separation
- Dedicated containerized Playwright worker.
- Queue/jobs.
- Per-target/domain concurrency.
- egress controls.
- scan timeout/cancellation.
- evidence artifact retention policy.

### Phase 3 — verified deep scan
- crawl budget;
- same-origin URL policy;
- route/page sampling;
- user-interaction recipes;
- before/after consent comparisons;
- multi-page aggregation;
- confidence per finding.

### Phase 4 — enterprise integrations
Only after authorization:
- GTM container export/API analysis;
- GA4 admin/config metadata;
- CMP configuration exports;
- customer-provided policies/RoPA/vendor inventories.

This allows the platform to distinguish **external observation** from **customer-authorized internal evidence**.

---

## 20. Roadmap

### P0 — production blockers/security
- [x] stop synthetic evidence;
- [x] remove fake checkout fallback;
- [x] verify Mercado Pago webhook signature;
- [x] enforce SSRF validation and safe redirects;
- [x] remove insecure TLS bypass;
- [ ] configure persistent PostgreSQL;
- [ ] add rate limiting and scan concurrency limits.

### P1 — trustworthiness
- [x] remove monetary fine calculation;
- [x] remove proof-of-damage inference;
- [x] remove assumed company size;
- [x] remove generic Meta false positive;
- [x] stop absent-CMP => pre-consent inference;
- [x] remove arbitrary score fallback;
- [x] align current plan marketing with implementation;
- [ ] finish retiring old "violation" names in API schemas where compatibility permits.

### P2 — scanner
- [ ] dedicated Playwright worker;
- [ ] multi-page job architecture;
- [ ] interaction-aware scans;
- [ ] stronger runtime consent comparison;
- [ ] worker-level egress restrictions.

### P3 — data/API
- [ ] Alembic;
- [ ] durable scan jobs;
- [ ] production DB pooling;
- [ ] structured evidence IDs;
- [ ] formal API versioning.

### P4 — UX
- [ ] show evidence type/confidence consistently on every finding;
- [ ] show N/A instead of false zero/green states when evidence is missing;
- [ ] clearly label static fallback vs browser runtime;
- [ ] replace remaining "violation" UI labels with "indicator/finding".

### P5 — architecture/maintenance
- [ ] split `main.py`;
- [ ] remove deprecated legacy frontend audit modules after dependency search;
- [ ] remove deprecated legacy routes;
- [ ] centralize schemas shared by backend/frontend.

---

## Feature Status Matrix

| Feature | Status | Evidence | Accuracy | Problem | Action |
|---|---|---|---|---|---|
| HTTP page fetch | REAL | HTTP response | High for returned bytes | Can be blocked | Preserve |
| Playwright browser scan | REAL_BUT_LIMITED | Rendered browser runtime | High when successful | Serverless reliability | Move to worker |
| Static HTTP fallback | REAL_BUT_LIMITED | HTML response | Medium | No JS runtime | Label partial |
| Network interception | REAL_BUT_LIMITED | Browser requests | High for observed requests | Timing/blocked browser | Preserve |
| dataLayer runtime capture | REAL_BUT_LIMITED | Browser JS state | High for observed state | Snapshot only | Preserve |
| Cookie observation | REAL_BUT_LIMITED | Browser context | High for observed cookies | HttpOnly/context/timing limits | Preserve |
| local/session storage | REAL_BUT_LIMITED | Browser context | High for observed values | Timing/route limits | Preserve |
| GTM detection | REAL_BUT_LIMITED | HTML/network/signature | High with ID/request | Can miss dynamic/blocked load | Preserve |
| GA4 detection | REAL_BUT_LIMITED | HTML/network/gtag | High with ID/request | server-side cases invisible | Preserve |
| Meta Pixel detection | REAL_BUT_LIMITED | contextual fbq/script/network | High/Medium | Generic number false positive corrected | Preserve |
| CMP detection | HEURISTIC | library/global/DOM signals | Medium | Presence != legal validity | Label correctly |
| Consent Mode state | REAL_BUT_LIMITED | runtime Google consent state/source | High when observed | absence not proof | Preserve |
| Pre-consent firing | REAL_BUT_LIMITED | runtime request order | High with runtime | static order is weak | Prefer runtime |
| PII detection | HEURISTIC | field/value patterns, request/dataLayer | Medium/High depending evidence | context false positives | Keep confidence |
| Sensitive-data classification | HEURISTIC | explicit category patterns | Medium | cannot infer from vendor name | Corrected |
| Duplicate detection | HEURISTIC | repeated signatures/events | Medium | intentional duplicates possible | Keep evidence |
| Technical score | HEURISTIC | fixed weighted findings | Reproducible | weights are product model | Document weights |
| LGPD compliance certification | IMPOSSIBLE_EXTERNALLY | N/A | N/A | requires legal/org context | Never claim |
| Legal violation determination | IMPOSSIBLE_EXTERNALLY | N/A | N/A | scanner lacks full facts | Use risk indicator |
| Fine calculation | IMPOSSIBLE_EXTERNALLY | N/A | N/A | revenue/regulatory facts unknown | Removed |
| Proof of damage | IMPOSSIBLE_EXTERNALLY | N/A | N/A | legal/factual question | Removed |
| Company size inference | IMPOSSIBLE_EXTERNALLY | N/A | N/A | not derivable reliably | Removed |
| Gemini explanations | REAL_BUT_LIMITED | structured findings context | Depends on grounding | hallucination risk | Evidence-first only |
| Local auth | REAL_BUT_LIMITED | signed JWT | Good if secret configured | disabled safely without secret | Preserve |
| Supabase token path | REAL_BUT_LIMITED | JWT validation | Config-dependent | secret/config required | Validate production |
| Mercado Pago checkout | REAL_BUT_LIMITED | provider API | High when configured | provider/env dependency | Fail closed |
| Mercado Pago webhook | REAL | signed notification + provider lookup | High | replay/ops monitoring remains | Signature fixed |
| SQLite local DB | REAL | local file | Good locally | not production durable | Dev only |
| Vercel /tmp SQLite | PARTIAL | ephemeral file | Not durable | loses state | PostgreSQL required |
| PostgreSQL support | REAL_BUT_LIMITED | DATABASE_URL/SQLAlchemy | Architecture ready | deployment config required | Configure |
| PDF/XLSX export | REAL_BUT_LIMITED | scan result | Source-dependent | legacy labels must stay technical | Continue cleanup |
| Free/Pro/Premium gating | REAL_BUT_LIMITED | backend identity/plan | Backend authoritative | UI gating not security | Keep backend source |
| Deep Scan | BROKEN | flags disabled | N/A | not production feature | Worker roadmap |
| Continuous monitoring | BROKEN | flags disabled | N/A | no scheduler/worker | Worker roadmap |
| Persistent history | PARTIAL | DB-backed routes/models | Depends on DB | no persistence without Postgres | Configure DB |
| Browser-side public proxy scan | BROKEN | legacy proxies | Unreliable/privacy issue | leaks target/weak evidence | Disabled |
| Legacy mock audit | SIMULATED | synthetic code | Invalid as evidence | fabricated findings | Disabled |

---

## Final assessment

The technically defensible product is not "an AI that declares whether a company violates LGPD." It is:

> **A technical data-governance and privacy evidence platform that observes website behavior, classifies measurable tracking/data signals, assigns confidence, prioritizes technical risk, and identifies what must be manually/legal-reviewed.**

That positioning is both stronger technically and easier to defend commercially because every serious output can point back to evidence.

The next production-critical dependency is **persistent PostgreSQL**, followed by **moving Playwright to a dedicated scanner worker**.
