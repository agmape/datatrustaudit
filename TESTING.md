# Testing

```powershell
# Python (unit + SSRF + real-Chromium fixtures + API + scoring regression)
.\.venv\Scripts\python.exe -m pytest -q

# Frontend
cd static
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Fixture tests launch real headless Chromium against local HTTP servers. No internet is needed: every third-party request is answered by local mocks **after** it has passed the SSRF guard, and DNS is a deterministic test resolver.

## Commands

```powershell
.\.venv\Scripts\python.exe -m pytest -q                 # everything (backend + i18n + contract + real-browser e2e)
.\.venv\Scripts\python.exe -m pytest -q -m "not e2e"    # without the Node/Chromium UI tests
.\.venv\Scripts\python.exe -m pytest -q tests/e2e       # UI only (starts Vite + uvicorn on free ports)
```

## Suites

| File | What it proves |
|---|---|
| `tests/test_redaction.py` | e-mail/phone/CPF/card detection, false positives (`logo@2x.png`, timestamps, SKUs, GA4 IDs, invalid CPFs, Luhn-failing numbers), key-pattern vs observed value, URL/body/object sanitization |
| `tests/test_units.py` | beacon vs script classification, generic vendor words are not signatures, server-side GA4 endpoints, placeholder IDs, crawler never invents URLs and filters logout/admin/assets/query explosion |
| `tests/test_ssrf.py` | private/loopback/link-local/metadata/IPv6/IPv4-mapped/decimal/hex targets rejected; DNS rebinding (hostname → loopback; mixed records; pinning defeats flip); redirects to private and metadata blocked; browser sub-requests to private networks blocked; no `--disable-web-security` |
| `tests/test_fixtures_golden.py` | golden expectations for 15 fixtures (exact tag sets, IDs, firing, required/forbidden findings, statuses, severities, events, cookies by phase); every OBSERVED finding cites existing evidence; no fines, no raw cookie values, no raw client IDs |
| `tests/test_failure_no_invention.py` | browser failure → static fallback is `partial`, no tags firing, no cookies, no events sent, no Measurement IDs invented, no fines, global score `null`; total failure returns empty report |
| `tests/test_api.py` | scan is public (no auth/plan), legacy endpoints gone, RAG returns citations with metadata or `insufficient_sources`, degrades without corpus, chat refuses fines and cites finding IDs, rate limit 429 |
| `tests/test_scoring.py` | hand-derived score expectations per fixture (`SCORING_VERSION` pinned), unmeasurable axes never penalize |
| `tests/test_auth.py` | JWT: HS256, ES256/RS256 via JWKS, rotation/outage, expired/forged/issuer/audience/anon/service, `alg=none`, algorithm confusion |
| `tests/test_accounts.py` | migrations ↔ ORM sync, launch offer in cents (0/9700/24700 BRL, 30/70/100%, 3/30/150, 1/5/30 domains), Free 1/day + 1 domain + 3/month, distinct domains, **45 concurrent reservations never exceed 30** (file DB), credit policy, calendar-month renewal (America/Sao_Paulo), subscription period, deleting history never refunds, admin unmetered role, admin test context with separate resettable balance and scenarios, versioned config validation, isolated plan tests |
| `tests/test_accounts_api.py` | over HTTP: analyses require an account (401) and a verified e-mail, daily/domain/monthly 429s, reopen/language never consume, server-side visibility with no leakage and nested sets on reopen, test context applied to API/reopen without touching real data, simulation header ignored, plan config publish/validation, billing disabled, 401 (never anonymous) on bad tokens, quota 429 on direct API calls, deep-scan 403, history/ownership (404 for other users), simulation, admin 403/200, role & subscription management, interrupted-audit recovery, grant-admin CLI |
| `tests/test_localization.py` | pt-BR with **no English leakage** on every fixture, complete bilingual rulebook (covers every rule the engine can emit), identifiers never translated, no fines/legal conclusions |
| `tests/test_i18n_parity.py` | UI dictionaries: same keys + placeholders in pt-BR/en/es, every `t('key')` exists, dynamic key families complete |
| `tests/test_visibility.py` | plan visibility on the server: 10 findings → 3/7/10, rounding for 0/1/3 (never fabricates), priority order + nesting Free ⊂ Pro ⊂ Premium, withheld ids/evidence never shipped, Premium returns the untouched reference report |
| `tests/test_contract.py` | the v1.0 report contract holds for all fixtures/languages and rejects broken reports; nulls stay null |
| `tests/e2e/test_ui.py` | real Chromium vs real Vite + real backend: login form (Supabase **mocked**), protected-route redirect and return-to-page, expired-token sign-out, quota/history/reopen by URL, language persistence, manager vs technical numbers, admin 403 → admin tools, plan simulation banner, real file downloads (CSV BOM, formula neutralisation, JSON), mobile overflow, keyboard reachability |

## Fixtures (`tests/fixtures/`)

`clean_no_tracking` (false-positive bait: vendor names in text, commented snippets, `G-XXXXXXXXXX` in `<pre>`, contact e-mail/phone) · `ga4_basic` · `gtm_basic` · `meta_pixel` · `gtm_ga4` · `consent_mode_v2_correct` · `consent_mode_v2_wrong_order` · `cookiebot` (correct gating) · `onetrust` (fires before consent and after reject) · `pii_key_without_value` · `pii_runtime_value` · `duplicate_gtm` · `ecommerce_purchase_valid` · `ecommerce_purchase_missing_params` · `ssrf_subrequests`.

Vendor libraries are replaced by small mocks in `tests/fixtures/mocks/` (Cookiebot, OneTrust, fbevents, gtm.js) and beacons are emitted by `tests/fixtures/_hit.js`, so the expected ground truth of each page is exactly known.

## Adding a fixture

1. Create `tests/fixtures/<name>.html` (use `__dt.ga4/meta/setCookie` helpers).
2. Add expectations to `tests/golden/fixtures.json` (`tags_exact`, `rules_present`, `rules_absent`, …).
3. If scores change, update `tests/test_scoring.py` with hand-derived values and `SCORING.md`.

## Not covered by automated tests

* **Real Supabase sign-in/sign-up/recovery e-mails** — the project host in `.env` does not resolve from this environment; the e2e suite mocks the Supabase HTTP endpoints at the browser level.
* PostgreSQL (tests use SQLite; no driver installed here).

* Real-world sites (results depend on the live internet, bot protection and geography) — use manual smoke tests.
* Didomi/Usercentrics/CookieYes/iubenda/Complianz/AdOpt adapters (only Cookiebot and OneTrust have fixtures).
* The LLM path of the assistant (tests force deterministic mode); the post-check is unit-tested.
