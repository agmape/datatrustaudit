# Scoring — version `2026.10.1`

Implemented in `datatrust/scoring.py`; regression-tested in `tests/test_scoring.py`. Changing a rule requires bumping `SCORING_VERSION`, this document and the tests together.

## Principles

1. Each axis = `passed_checks / applicable_checks × 100`.
2. A check is **applicable** only if the scanner had the capability *and* the precondition evidence. Not observable ⇒ not applicable ⇒ **no penalty**.
3. Zero applicable checks ⇒ axis `score: null` with `null_reason`.
4. Each axis reports `coverage` (`applicable / defined checks`) and `confidence`.
5. **Global score** = weighted mean of non-null axes, only if the browser runtime was observed **and** weighted coverage ≥ 50 %. Otherwise `null` with reason.
6. No monetary estimate, fine or "damage" figure exists anywhere.

## Weights

| Axis | Weight | Defined checks |
|---|---|---|
| `tracking_implementation` | 0.30 | 7 |
| `event_data_quality` | 0.20 | one per observed recommended event (+ duplicate purchase) |
| `consent_integrity` | 0.30 | 5 |
| `privacy_exposure` | 0.20 | 3 |

## Checks

### tracking_implementation
| Check | Applicable when | Passes when |
|---|---|---|
| `fires:ga4`, `fires:meta_pixel` | runtime observed and (no CMP observed or accept performed) | collection request observed |
| `gtm_single_load` | GTM loaded at runtime | no container loaded twice (network or rendered-DOM script elements) |
| `ga4_single_page_view` | a GA4 page_view hit observed | no duplicate page_view for same tid/location |
| `meta_no_duplicates` | Meta Pixel observed at runtime | no duplicate init / PageView |
| `no_legacy_ua` | any analytics/tag manager observed | Universal Analytics absent |
| `no_placeholder_ids` | any tag observed | no `G-XXXX`-style IDs in code |
| `ga4_config_collects` | GA4 observed and gating testable | `GA4_CONFIGURED_NO_COLLECTION_OBSERVED` absent |

Only GA4 and Meta are used for "fires" checks: they send an HTTP beacon on every page load. Vendors using WebSockets or interaction-triggered beacons would produce false "not firing" results.

### event_data_quality
One check per **observed** GA4 recommended event (network hit, gtag call or dataLayer ecommerce push): passes if all required parameters per the official reference are present. Coverage = evaluated recommended events / observed GA4 events.

### consent_integrity
| Check | Applicable when |
|---|---|
| `no_tracking_before_interaction` | runtime + CMP observed |
| `reject_blocks_requests` | reject interaction **performed and verified** |
| `reject_blocks_cookies` | reject performed |
| `consent_mode_default_first` | a `consent default` command observed |
| `consent_mode_denied_after_reject` | reject performed and GA4 hits with `gcs` in reject phase |

No CMP observed ⇒ the axis is usually `null` ("may require analysis of purpose and legal basis") — absence of a CMP is **not** penalized.

### privacy_exposure
`no_pii_to_third_parties`, `no_pii_in_datalayer`, `no_pii_in_storage` — applicable whenever runtime was observed; they fail only on `OBSERVED_PII_VALUE` findings (never on key patterns).

## Example (regression fixture `duplicate_gtm.html`)

Tracking: fires:ga4 ✔, gtm_single_load ✖, ga4_single_page_view ✖, no_legacy_ua ✔, no_placeholder ✔, ga4_config_collects ✔ → 4/6 = **67**. Privacy 3/3 = 100. Events/consent null. Global = (0.3×67 + 0.2×100)/0.5 = **80**, coverage 50 %.
