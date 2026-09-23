"""
audit_engine.duplicate_detector — Tag, pixel, and event duplication detection.

Identifies:
- Same vendor loaded N times from source
- Duplicate GA4 config() calls
- Duplicate page_view events in source
- Hardcoded + GTM overlap inference (medium confidence)
"""
import re
from collections import Counter
from typing import List
from .models import DuplicateFinding, TagFinding, EventFinding, CONFIDENCE_HIGH, CONFIDENCE_MEDIUM

_GA4_CONFIG_RE  = re.compile(r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"]G-[A-Z0-9]+['\"]", re.IGNORECASE)
_GA4_SCRIPT_RE  = re.compile(r"googletagmanager\.com/gtag/js\?id=G-([A-Z0-9]+)", re.IGNORECASE)
_GTM_SNIPPET_RE = re.compile(r"googletagmanager\.com/gtm\.js", re.IGNORECASE)
_META_INIT_RE   = re.compile(r"fbq\s*\(\s*['\"]init['\"]", re.IGNORECASE)
_HOTJAR_RE      = re.compile(r"static\.hotjar\.com", re.IGNORECASE)


def detect_duplicates(
    html: str,
    tags: List[TagFinding],
    events: List[EventFinding],
) -> List[DuplicateFinding]:

    findings: List[DuplicateFinding] = []

    # ── 1. Tag occurrences by vendor ID ──────────────────────────────────────
    # Use the occurrence_count already on each TagFinding
    for tag in tags:
        if tag.occurrence_count > 1:
            findings.append(DuplicateFinding(
                entity_type="tag",
                name=tag.name,
                occurrence_count=tag.occurrence_count,
                severity="critical" if tag.occurrence_count > 2 else "warning",
                recommendation=f"Consolidate {tag.name} to a single implementation. "
                               f"Multiple instances cause duplicate data collection and can inflate metrics.",
                confidence=CONFIDENCE_HIGH,
            ))

    # ── 2. GTM snippet count ──────────────────────────────────────────────────
    gtm_count = len(_GTM_SNIPPET_RE.findall(html))
    if gtm_count > 1:
        findings.append(DuplicateFinding(
            entity_type="tag",
            name="Google Tag Manager Snippet",
            occurrence_count=gtm_count,
            severity="critical",
            recommendation="Remove duplicate GTM script tags. Only one GTM snippet should appear in the page source.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── 3. GA4 config() calls ─────────────────────────────────────────────────
    ga4_configs = _GA4_CONFIG_RE.findall(html)
    if len(ga4_configs) > 1:
        findings.append(DuplicateFinding(
            entity_type="ga4_config",
            name="GA4 Configuration Call",
            occurrence_count=len(ga4_configs),
            severity="critical",
            recommendation=f"GA4 config() is called {len(ga4_configs)} times. "
                           "This causes duplicate page_view events and inflated session counts. "
                           "Keep a single gtag('config', 'G-XXXXXXXX') call.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── 4. GA4 script src duplicates ─────────────────────────────────────────
    ga4_ids = _GA4_SCRIPT_RE.findall(html)
    id_counts = Counter(ga4_ids)
    for ga4_id, count in id_counts.items():
        if count > 1:
            findings.append(DuplicateFinding(
                entity_type="tag",
                name=f"GA4 Script (G-{ga4_id})",
                occurrence_count=count,
                severity="critical",
                recommendation=f"GA4 tracking script for G-{ga4_id} is loaded {count} times. "
                               "Deduplicate to avoid double-counting all analytics data.",
                confidence=CONFIDENCE_HIGH,
            ))

    # ── 5. Meta Pixel init() calls ────────────────────────────────────────────
    meta_inits = len(_META_INIT_RE.findall(html))
    if meta_inits > 1:
        findings.append(DuplicateFinding(
            entity_type="pixel",
            name="Meta Pixel (fbq init)",
            occurrence_count=meta_inits,
            severity="warning",
            recommendation=f"Meta Pixel fbq('init') is called {meta_inits} times. "
                           "Multiple init calls can cause duplicate pixel fires and inflated conversion data.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── 6. Hotjar duplicates ──────────────────────────────────────────────────
    hotjar_count = len(_HOTJAR_RE.findall(html))
    if hotjar_count > 1:
        findings.append(DuplicateFinding(
            entity_type="tag",
            name="Hotjar",
            occurrence_count=hotjar_count,
            severity="warning",
            recommendation="Hotjar script appears to load multiple times. This may cause duplicate session recordings.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── 7. Duplicate events (from event auditor) ──────────────────────────────
    event_counts = Counter(ev.name for ev in events)
    for event_name, count in event_counts.items():
        if count > 1:
            severity = "critical" if event_name in ("purchase", "begin_checkout") else "warning"
            findings.append(DuplicateFinding(
                entity_type="event",
                name=event_name,
                occurrence_count=count,
                severity=severity,
                recommendation=(
                    f"Event '{event_name}' fires {count} times in source. "
                    + (
                        "For purchase/checkout events, duplicate fires cause inflated conversion reporting "
                        "and potential billing errors — this is a critical data quality issue."
                        if event_name in ("purchase", "begin_checkout") else
                        "Check for duplicate dataLayer.push() or gtag() calls triggering the same event."
                    )
                ),
                confidence=CONFIDENCE_HIGH,
                note="Detected in static HTML source only. Server-side or SPA-triggered duplicates are not observable.",
            ))

    # ── 8. Hardcoded + GTM overlap inference ─────────────────────────────────
    # If both a hardcoded GA4 script AND GTM are present, likely loading GA4 twice
    has_gtm = any(t.id == "gtm" for t in tags)
    has_hardcoded_ga4 = bool(re.search(
        r"<script[^>]+googletagmanager\.com/gtag/js", html, re.IGNORECASE
    ))
    has_gtm_with_ga4 = has_gtm and bool(re.search(r"G-[A-Z0-9]{10}", html))

    if has_hardcoded_ga4 and has_gtm_with_ga4:
        findings.append(DuplicateFinding(
            entity_type="tag",
            name="GA4 — Hardcoded + GTM Overlap (Inferred)",
            occurrence_count=2,
            severity="warning",
            recommendation="GA4 appears to be loaded both as a hardcoded script tag and potentially managed via GTM. "
                           "If GTM is also configured with GA4, this may cause duplicate analytics data. "
                           "Audit your GTM container to confirm.",
            confidence=CONFIDENCE_MEDIUM,
            note="Medium-confidence finding — inferred from co-existence of hardcoded gtag/js and GTM container. "
                 "Requires GTM container audit to confirm.",
        ))

    return findings
