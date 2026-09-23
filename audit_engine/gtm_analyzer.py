"""
audit_engine.gtm_analyzer — GTM implementation quality checks.

Inspects:
- Container IDs (GTM-XXXXX) and count
- noscript fallback presence
- dataLayer initialization order
- GTM snippet placement (head vs body)
- overwritten dataLayer (window.dataLayer = [] after GTM load)
- GTM loaded multiple times
"""
import re
from typing import List
from .models import GTMQualityFinding, GTMQualityResult, CONFIDENCE_HIGH, CONFIDENCE_MEDIUM


_GTM_ID_RE      = re.compile(r"GTM-[A-Z0-9]{6,8}", re.IGNORECASE)
_GTM_SCRIPT_RE  = re.compile(r"googletagmanager\.com/gtm\.js", re.IGNORECASE)
_GTM_NOSCRIPT   = re.compile(r"<noscript[^>]*>[\s\S]*?googletagmanager\.com/ns\.html", re.IGNORECASE)
_DL_INIT_RE     = re.compile(r"window\s*\.\s*dataLayer\s*=\s*\[\s*\]", re.IGNORECASE)


def analyze_gtm(html: str) -> GTMQualityResult:
    result = GTMQualityResult()

    # ── Container IDs ────────────────────────────────────────────────────────
    container_ids = list(dict.fromkeys(_GTM_ID_RE.findall(html)))  # unique, order-preserved
    result.containers = container_ids
    result.container_count = len(container_ids)

    if result.container_count == 0:
        # No GTM found at all — not an error here, caller decides significance
        result.findings.append(GTMQualityFinding(
            check="gtm_not_detected",
            label="GTM Container",
            status="warning",
            description="No Google Tag Manager container was detected in the HTML source.",
            recommendation="Implement Google Tag Manager to centralise tag management and consent orchestration.",
            confidence=CONFIDENCE_HIGH,
        ))
        return result

    # ── Multiple containers ──────────────────────────────────────────────────
    if result.container_count > 1:
        result.gtm_loaded_multiple_times = True
        result.findings.append(GTMQualityFinding(
            check="multiple_gtm_containers",
            label="Multiple GTM Containers",
            status="warning",
            description=f"{result.container_count} GTM containers detected ({', '.join(container_ids)}). "
                        "Multiple containers increase page load time and risk duplicate tag firing.",
            evidence=", ".join(container_ids),
            recommendation="Consolidate all tags into a single GTM container if possible.",
            confidence=CONFIDENCE_HIGH,
        ))
    else:
        result.findings.append(GTMQualityFinding(
            check="single_gtm_container",
            label="GTM Container",
            status="ok",
            description=f"Single GTM container detected: {container_ids[0]}.",
            evidence=container_ids[0],
            confidence=CONFIDENCE_HIGH,
        ))

    # ── GTM script occurrences in source (detect duplicates) ────────────────
    gtm_script_matches = _GTM_SCRIPT_RE.findall(html)
    if len(gtm_script_matches) > 1:
        result.gtm_loaded_multiple_times = True
        result.findings.append(GTMQualityFinding(
            check="gtm_script_duplicated",
            label="GTM Script Duplicated",
            status="critical",
            description=f"The GTM JS snippet was found {len(gtm_script_matches)} times in the HTML source. "
                        "This causes all GTM-managed tags to fire multiple times.",
            evidence=f"googletagmanager.com/gtm.js found {len(gtm_script_matches)}×",
            recommendation="Remove duplicate GTM snippet. Keep only one instance in the <head>.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── noscript fallback ────────────────────────────────────────────────────
    has_noscript = bool(_GTM_NOSCRIPT.search(html))
    result.has_noscript = has_noscript
    result.findings.append(GTMQualityFinding(
        check="noscript_present" if has_noscript else "noscript_missing",
        label="GTM noscript Fallback",
        status="ok" if has_noscript else "warning",
        description=(
            "GTM <noscript> fallback found. Users without JavaScript will still be tracked via the pixel."
            if has_noscript else
            "GTM <noscript> iframe fallback is missing. "
            "While not critical, Google recommends placing it immediately after <body> for completeness."
        ),
        recommendation=None if has_noscript else
            "Add the GTM <noscript> snippet immediately after the <body> opening tag.",
        confidence=CONFIDENCE_HIGH,
    ))

    # ── dataLayer initialization order ──────────────────────────────────────
    dl_init_match = _DL_INIT_RE.search(html)
    gtm_script_match = _GTM_SCRIPT_RE.search(html)
    if dl_init_match and gtm_script_match:
        result.datalayer_init_before_gtm = dl_init_match.start() < gtm_script_match.start()
        if result.datalayer_init_before_gtm:
            result.findings.append(GTMQualityFinding(
                check="datalayer_init_order_ok",
                label="dataLayer Initialization Order",
                status="ok",
                description="window.dataLayer = [] is initialized before the GTM script tag. Correct order.",
                confidence=CONFIDENCE_HIGH,
            ))
        else:
            result.findings.append(GTMQualityFinding(
                check="datalayer_init_after_gtm",
                label="dataLayer Initialization Order",
                status="critical",
                description="dataLayer is initialized AFTER the GTM snippet. This can cause race conditions "
                            "where pre-GTM pushes are lost.",
                evidence=f"dataLayer init at position ~{dl_init_match.start()}, "
                         f"GTM script at ~{gtm_script_match.start()}",
                recommendation="Move window.dataLayer = window.dataLayer || [] to before the GTM <script> tag.",
                confidence=CONFIDENCE_HIGH,
            ))
    elif dl_init_match and not gtm_script_match:
        result.datalayer_init_before_gtm = True  # standalone dataLayer usage
        result.findings.append(GTMQualityFinding(
            check="datalayer_found_no_gtm_script",
            label="dataLayer Without GTM Script",
            status="warning",
            description="dataLayer is initialized but no GTM script tag was found. "
                        "The dataLayer may be used by a GTM server-side implementation or another tag system.",
            confidence=CONFIDENCE_MEDIUM,
        ))

    # ── Overwritten dataLayer ────────────────────────────────────────────────
    dl_inits_all = list(_DL_INIT_RE.finditer(html))
    if len(dl_inits_all) > 1:
        result.datalayer_overwritten = True
        result.findings.append(GTMQualityFinding(
            check="datalayer_overwritten",
            label="dataLayer Overwritten",
            status="critical",
            description=f"window.dataLayer = [] found {len(dl_inits_all)} times. "
                        "Re-assigning the dataLayer array after pushes have occurred will discard all prior data.",
            evidence=f"Appears {len(dl_inits_all)} times in source",
            recommendation="Use window.dataLayer = window.dataLayer || [] to avoid overwriting. "
                           "Only initialise once before the GTM snippet.",
            confidence=CONFIDENCE_HIGH,
        ))

    # ── GTM placement (in <head>?) ───────────────────────────────────────────
    head_match = re.search(r"<head[\s>]", html, re.IGNORECASE)
    body_match = re.search(r"<body[\s>]", html, re.IGNORECASE)
    if head_match and gtm_script_match:
        in_head = gtm_script_match.start() > head_match.start() and (
            not body_match or gtm_script_match.start() < body_match.start()
        )
        result.gtm_in_head = in_head
        if in_head:
            result.findings.append(GTMQualityFinding(
                check="gtm_placement_head",
                label="GTM Snippet Placement",
                status="ok",
                description="GTM script tag is placed within <head>. This is the recommended placement for accurate event capture.",
                confidence=CONFIDENCE_HIGH,
            ))
        else:
            result.findings.append(GTMQualityFinding(
                check="gtm_placement_body_or_late",
                label="GTM Snippet Placement",
                status="warning",
                description="GTM script tag appears to be outside <head> (in <body> or later). "
                            "This may cause missed events on fast page interactions.",
                recommendation="Move the GTM script to as high in <head> as possible, ideally as the first script.",
                confidence=CONFIDENCE_MEDIUM,
            ))

    return result
