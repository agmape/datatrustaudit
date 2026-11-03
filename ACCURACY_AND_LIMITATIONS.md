# Accuracy and Limitations

DataTrust Audit is a **public, unauthenticated, browser-based** scanner. It can only report what a fresh visitor's browser observably does during a short window. Precision is prioritized over the number of results: *"could not verify"* is always preferred to a guess.

## What it can prove (with evidence)

| Claim | Evidence required |
|---|---|
| A vendor library was loaded | `script_url` network request or rendered-DOM script element |
| A vendor **sent data** | `network` request to a known collection endpoint (`observed_firing: true`) |
| An ID belongs to a tag | ID extracted from the vendor's own endpoint/parameter or code call (`gtag('config', ...)`, `fbq('init', ...)`) |
| A GA4 event was sent | `/g/collect` hit with `en=<event>` |
| An event was pushed | `dataLayer.push` / `gtag()` / `fbq()` captured at runtime |
| Tracking happened before consent interaction | collection request in the BASELINE context (no click) |
| Tracking happened after "reject all" | collection request with `after_interaction: true` in the REJECT context, after a **verified** click |
| A cookie was set | cookie present in the browser context (with stage `before_interaction`/`end`) |
| Personal data was exposed | value matched a validated pattern (`OBSERVED_PII_VALUE`) — the value is never stored |
| Consent Mode order | dataLayer order of `consent default` vs `config`/`event` |

## What it cannot prove

* GA4/GTM internal configuration (unpublished workspaces, triggers, data retention, custom dimensions, key events).
* Server-side tracking: server-side GTM, Measurement Protocol, Meta Conversions API, offline conversions.
* Anything behind login, in post-login funnels, or after actions (add to cart, checkout, form submit) — unless it fires on page load.
* The controller's **legal basis**. A missing CMP is reported as *not observed*, never as a violation.
* Legal compliance, fines, damages. No monetary estimate is produced.
* What visitors in other regions see (the scanner's IP/location may not trigger geo-targeted banners/tags).
* Events firing later than the observation window, on scroll, on click, or on SPA route changes not triggered by the scan (baseline never scrolls or clicks, because some CMPs treat scrolling as consent).

## Known accuracy limits (honest list)

* **Source order ≠ execution order.** "Script appears before CMP in HTML source" is INFERRED and explicitly says it does not prove execution before consent.
* **dataLayer timing** is captured by polling every 150 ms (wrapping `push` breaks GTM). Before/after-click attribution flushes the poller at the click, so attribution is exact; absolute `t_ms` is approximate.
* **Request timing** uses Chromium's request start time vs the in-page click time (same browser clock).
* **CMP interaction**: only adapters for Cookiebot, OneTrust, Didomi, Usercentrics, CookieYes, iubenda, Complianz, AdOpt and a strict generic text matcher. When a click cannot be performed **and verified** (banner hidden or CMP state read), the result is `manual_verification_required` and no post-interaction claim is made.
* **WebSocket traffic** (e.g. Hotjar recording) is guarded but not parsed; such vendors are reported by script presence, with `observed_firing` based only on HTTP beacons.
* **Third-party detection** uses an approximate registrable-domain (eTLD+1) rule without the full Public Suffix List.
* **Bot protection**: sites may serve challenge pages; HTTP 401/403/429/503 produce a `POSSIBLE_BOT_PROTECTION` finding.
* **Static fallback** (browser failed): status `partial`, message *"Runtime JavaScript, cookies and network behavior were not verified."*, tags only from HTML (medium confidence), `observed_firing: null`, privacy/consent axes `null`, global score `null`.

## SSRF residual risk

Target host DNS is validated (all records public) and pinned in Chromium; every browser request, redirect and WebSocket is re-validated. Residual risk: Chromium re-resolves third-party sub-request hostnames itself (time-of-check/time-of-use). **Production must run the scanner in a container/network namespace whose egress firewall drops private, loopback, link-local, CGNAT and cloud-metadata ranges.**

## Language rules

Reports and the assistant use "not observed in this scan", "technical risk", "may require analysis of purpose and legal basis", "requires legal/manual review". They never state that a company violates a law, never estimate fines, never say data was transferred illegally.
