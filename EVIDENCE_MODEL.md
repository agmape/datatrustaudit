# Evidence Model

Every important claim in a report references one or more `Evidence` ids. If a claim cannot answer *"where exactly was this observed?"*, it is not shown as fact.

## Evidence

| Field | Meaning |
|---|---|
| `id` | `ev-00001`… unique within the scan |
| `source_type` | `network`, `script_url`, `html_source`, `rendered_dom`, `runtime_js`, `datalayer`, `gtag`, `fbq`, `cookie`, `local_storage`, `session_storage`, `cmp`, `consent_mode`, `policy_link`, `console`, `navigation` |
| `phase` | `static` (HTML only), `baseline`, `reject`, `accept` |
| `page_url` | page the evidence belongs to (deep scan keeps origin per page) |
| `timestamp` / `t_ms` | UTC time / ms since phase navigation start (dataLayer: poll-based, ±150 ms) |
| `confidence` | reliability of the detection (`high`/`medium`/`low`) — never legal certainty |
| `vendor_hint` | catalog vendor matched by this evidence |
| `request_url`, `request_method`, `resource_type`, `domain`, `third_party` | network data (URL **sanitized**) |
| `after_interaction` | `true`/`false` relative to the consent click (browser clock); `null` when unknown |
| `html_line`, `snippet`, `script_url` | source location (snippet redacted, ≤400 chars) |
| `cookie_name`, `cookie_domain`, `cookie_attributes` | attributes incl. `secure`, `httpOnly`, `sameSite`, `session`, `expires`, `value_length`, `stage` (`before_interaction`/`end`). **No value.** |
| `storage_key` | key only; `parsed.value_length`, `parsed.value_pii_kinds`. **No value.** |
| `datalayer_event`, `gtag_call`, `fbq_call` | sanitized payloads |
| `cmp_signal`, `consent_state` | CMP detection/interaction; `google_tag_data.ics` |
| `parsed` | parsed hit data (e.g. `ga4_events[{tid,en,params,items,gcs}]`, `meta{pixel_id,event}`, `beacon_vendors`, `ids`) |
| `redaction` | `{redacted, kinds, fields, truncated}` |

## Redaction rules (`datatrust/redaction.py`)

* Applied **before** an Evidence object exists. Raw captures live only in memory during the scan.
* Query strings, URL paths, fragments (removed), POST bodies (url-encoded, GA4 batches, JSON), dataLayer/gtag/fbq payloads, storage values (classified only), console messages.
* `email=joao@email.com` → `email=[REDACTED_EMAIL]`. Client IDs (`cid`, `uid`, `_fbp`…) → `[REDACTED_ID]`. Credentials → `[REDACTED_CREDENTIAL]`. Hashes under `em`/`ph` → `[HASHED_VALUE]`.
* PII-suggestive keys whose values do **not** match a validated pattern → value withheld as `[WITHHELD_<KIND>]`.

### `PII_KEY_PATTERN` vs `OBSERVED_PII_VALUE`

| Classification | Meaning | Example |
|---|---|---|
| `PII_KEY_PATTERN` | key name suggests personal data; value did not validate | `user_email=not_provided` |
| `OBSERVED_PII_VALUE` | value matched a validated pattern | e-mail syntax (excluding `logo@2x.png`), CPF with valid check digits, phone with formatting or key context, card number passing Luhn with separators or context |

## Finding

| Field | Meaning |
|---|---|
| `rule_id`, `title`, `description`, `category` | rule and human text |
| `status` | `OBSERVED` · `INFERRED` · `NOT_OBSERVED` · `UNVERIFIABLE` (an `OBSERVED` finding without evidence raises an error at construction) |
| `severity` | technical risk: `info`, `low`, `medium`, `high`, `critical`, `needs_manual_review` |
| `confidence` | detection reliability |
| `evidence_ids`, `pages` | provenance |
| `recommendation`, `how_to_verify`, `limitations` | guidance |
| `legal_context` | cautious context with frameworks, `requires_manual_review: true`. **Separate** from the technical finding; never a conclusion. |

## Tag

`vendor_id`, `technology`, `ids` (only IDs extracted from vendor endpoints/code calls; placeholders such as `G-XXXXXXXX` listed separately), `detection_methods` (`network_collection_request`, `script_loaded`, `rendered_dom_script`, `html_script_tag`, `html_code_signature`, `runtime_global`, `gtag_call`, `gtag_config_call`, `fbq_call`, `cmp_runtime_signal`), `confidence`, `observed_firing` (`true` = collection request seen; `false` = runtime ran and none seen; `null` = not verifiable), `pages`, `evidence_ids`.

## Event

Distinguishes: found in code only (`code_candidates`, INFERRED — "implementation candidate detected; runtime firing not confirmed") · observed in `dataLayer` · observed in `gtag()` · **sent to GA4** (network hit). Validation of required parameters only on OBSERVED events.
