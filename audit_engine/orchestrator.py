"""
audit_engine.orchestrator — Main audit pipeline.

Coordinates all analyzers and assembles the final AuditResult.
Accepts a BrowserScanResult (from browser_fetcher) so every analyzer
can use both rendered HTML and runtime data (network requests, dataLayer, etc.).
"""
from datetime import datetime
from typing import List, Optional

from .models import AuditResult, DataQualityNote, TagFinding
from .browser_fetcher import BrowserScanResult
from .tag_detector import detect_tags
from .gtm_analyzer import analyze_gtm
from .event_auditor import audit_events
from .datalayer_auditor import audit_datalayer
from .consent_auditor import audit_consent
from .privacy_analyzer import detect_jurisdiction, analyze_privacy
from .duplicate_detector import detect_duplicates
from .score_engine import compute_scores
from .recommendation_engine import generate_recommendations
from .personal_data_detector import detect_personal_data
from .sensitive_data_classifier import classify_sensitive_data


def _build_data_quality_notes(
    scan: BrowserScanResult,
    tags: list,
    events_result,
) -> List[DataQualityNote]:
    """Emit honest limitations about what this scan cannot observe."""
    notes = []

    if scan.fallback_used:
        notes.append(DataQualityNote(
            limitation="Static HTML scan only (browser unavailable)",
            reason="The headless browser was unavailable or failed, so only the initial HTML "
                   "source was scanned. Tags loaded dynamically via JavaScript (GTM triggers, "
                   "deferred scripts, SPA events) may not be detected. "
                   + (f"Browser error: {scan.error}" if scan.error else ""),
            affected_areas=["events", "ecommerce", "dynamic_tags", "consent"],
        ))
    else:
        notes.append(DataQualityNote(
            limitation="Single-page browser scan",
            reason="This audit navigates to the requested URL in a headless browser and waits "
                   "for network activity to settle. Events fired on subsequent pages (checkout, "
                   "thank-you), after user interactions, or behind authentication are not captured.",
            affected_areas=["events", "ecommerce", "purchase events"],
        ))

    notes.append(DataQualityNote(
        limitation="Backend and server-side events not observable",
        reason="Server-side tagging (GTM server-side, Measurement Protocol, CAPI) fires from "
               "your server — invisible to any browser-based scanner, including this one.",
        affected_areas=["events", "ga4", "conversions"],
    ))

    # Warn if no tags were found at all
    if not tags and not scan.intercepted_requests:
        notes.append(DataQualityNote(
            limitation="⚠️ No tracking data detected — possible reasons",
            reason=(
                "The scanner found no tracking tags or network requests. This can happen when:\n"
                "• The site uses bot detection that blocks headless browsers\n"
                "• All tracking is server-side (no client-side scripts)\n"
                "• Consent is required before any scripts load\n"
                "• The site is behind a login wall\n"
                "• Scripts are lazy-loaded after user interaction (scroll, click)\n"
                "Try the 'Upload' tab to analyse a GTM container JSON export directly."
            ),
            affected_areas=["tags", "events", "consent", "privacy"],
        ))

    has_gtm = any(getattr(t, "id", None) == "gtm" for t in tags)
    total_events = events_result.total_events if events_result else 0
    if has_gtm and total_events == 0:
        notes.append(DataQualityNote(
            limitation="GTM detected but no inline events visible",
            reason="Google Tag Manager is present but events appear to fire after page load "
                   "via GTM triggers. GA4 hit data captured via network interception is shown "
                   "in the Events tab where available.",
            affected_areas=["events", "dataLayer"],
        ))

    notes.append(DataQualityNote(
        limitation="Findings are indicative, not legal conclusions",
        reason="All compliance assessments are based on publicly observable technical signals "
               "and do not constitute legal advice. Consult a qualified privacy professional "
               "for formal compliance certification.",
        affected_areas=["compliance", "violations", "risk_exposure"],
    ))

    return notes


def _find_tags_before_consent(html: str, tags: List[TagFinding]) -> List[TagFinding]:
    """Identify tags that appear BEFORE the first CMP signal in the HTML source."""
    import re
    cmp_signals = [
        r"consent\.cookiebot\.com",
        r"cdn\.cookielaw\.org",
        r"sdk\.privacy-center\.org",
        r"app\.usercentrics\.eu",
        r"OptanonWrapper",
        r"CookieConsent",
        r"Didomi\.ready",
        r"gtag\s*\(\s*['\"]consent",
    ]
    cmp_pos = None
    for pat in cmp_signals:
        m = re.search(pat, html, re.IGNORECASE)
        if m and (cmp_pos is None or m.start() < cmp_pos):
            cmp_pos = m.start()

    if cmp_pos is None:
        return []

    before = []
    for tag in tags:
        if tag.type == "consent":
            continue
        if tag.type in ("analytics", "advertising", "heatmap", "marketing") and tag.position is not None:
            if tag.position < cmp_pos:
                before.append(tag)
    return before


def _build_regulatory_exposure(
    jurisdiction: dict,
    privacy_result,
    personal_data_findings: list,
    sensitive_data_findings: list,
    consent_result,
) -> dict:
    """
    Build a regulatory exposure summary.

    IMPORTANT: This provides technical exposure indicators only — NOT legal conclusions.
    Language is factual and cautious, not predictive.
    No fine calculator or fine estimate is produced.
    """
    law = jurisdiction.get("law", "General Privacy")
    law_full = jurisdiction.get("law_full", "General Privacy")
    region = jurisdiction.get("region", "Global / Unknown")

    violations = getattr(privacy_result, "violations", []) if privacy_result else []
    total_violations = len(violations)
    has_sensitive = len(sensitive_data_findings) > 0
    has_personal = len(personal_data_findings) > 0
    has_cmp = getattr(consent_result, "cmp_detected", False) if consent_result else False

    # Exposure level based on observable technical signals
    if has_sensitive and not has_cmp and total_violations >= 2:
        exposure_level = "CRITICAL"
        exposure_label = "Crítico — sinais técnicos de alta exposição"
    elif (has_sensitive or total_violations >= 3) and not has_cmp:
        exposure_level = "HIGH"
        exposure_label = "Alto — múltiplos sinais de risco identificados"
    elif total_violations >= 1 or has_personal:
        exposure_level = "MODERATE"
        exposure_label = "Moderado — sinais de risco presentes"
    else:
        exposure_level = "LOW"
        exposure_label = "Baixo — nenhum sinal crítico identificado"

    # Regulatory context — cautious, factual, not prescriptive
    lgpd_context = []
    if law == "LGPD" or "Brazil" in region:
        lgpd_context = [
            {
                "type": "informational",
                "title": "Contexto regulatório — LGPD (Lei 13.709/2018)",
                "content": (
                    "A Lei Geral de Proteção de Dados (LGPD) confere à ANPD competência para "
                    "aplicar sanções administrativas a empresas que tratam dados pessoais em "
                    "desconformidade com a lei. As sanções previstas incluem advertência, multa "
                    "simples de até 2% do faturamento do último exercício (limitada a R$ 50 milhões "
                    "por infração), entre outras. Esta informação é de natureza legal geral e "
                    "NÃO representa uma avaliação de risco específica para esta empresa."
                ),
            },
            {
                "type": "disclaimer",
                "title": "Limitações desta análise",
                "content": (
                    "Esta análise detecta sinais técnicos observáveis publicamente em uma única "
                    "página da aplicação. Não substitui uma auditoria jurídica ou de privacidade "
                    "formal. Não constitui aconselhamento jurídico. Para avaliação de conformidade "
                    "com a LGPD, consulte um profissional de privacidade ou advogado especializado."
                ),
            },
        ]
    elif law in ("GDPR", "UK GDPR"):
        lgpd_context = [
            {
                "type": "informational",
                "title": f"Contexto regulatório — {law}",
                "content": (
                    f"O {law} prevê sanções administrativas aplicadas pelas autoridades de proteção "
                    "de dados do país membro relevante. As penalidades máximas variam conforme a "
                    "categoria de infração. Esta é uma informação legal geral — não constitui "
                    "avaliação de risco para esta organização específica."
                ),
            },
        ]
    elif law == "CCPA/CPRA":
        lgpd_context = [
            {
                "type": "informational",
                "title": "Contexto regulatório — CCPA/CPRA",
                "content": (
                    "A CCPA/CPRA confere à California Privacy Protection Agency competência "
                    "regulatória sobre privacidade do consumidor na Califórnia. "
                    "Esta é uma informação legal geral — não constitui avaliação de risco."
                ),
            },
        ]

    # Technical signals summary
    signals = []
    if not has_cmp:
        signals.append({
            "signal": "Ausência de plataforma de gestão de consentimento (CMP)",
            "severity": "high",
            "technical_basis": "Nenhuma CMP conhecida detectada no HTML e nas solicitações de rede",
        })
    if has_sensitive:
        signals.append({
            "signal": f"{len(sensitive_data_findings)} sinal(is) de dados sensíveis (Art. 5 X da LGPD) identificado(s)",
            "severity": "critical",
            "technical_basis": "Chaves ou padrões de dados sensíveis detectados em parâmetros técnicos",
        })
    if has_personal:
        signals.append({
            "signal": f"{len(personal_data_findings)} sinal(is) de dados pessoais identificado(s)",
            "severity": "high",
            "technical_basis": "Parâmetros ou chaves associados a dados pessoais detectados",
        })
    for v in violations[:5]:
        v_dict = v.to_dict() if hasattr(v, "to_dict") else (v if isinstance(v, dict) else {})
        signals.append({
            "signal": v_dict.get("violation", "Sinal de conformidade identificado"),
            "severity": v_dict.get("severity", "medium"),
            "technical_basis": v_dict.get("description", ""),
        })

    return {
        "jurisdiction": region,
        "law": law,
        "law_full": law_full,
        "exposure_level": exposure_level,
        "exposure_label": exposure_label,
        "personal_data_signals": len(personal_data_findings),
        "sensitive_data_signals": len(sensitive_data_findings),
        "compliance_signals": total_violations,
        "has_consent_mechanism": has_cmp,
        "regulatory_context": lgpd_context,
        "technical_signals": signals,
        "disclaimer": (
            "Esta seção apresenta indicadores técnicos observáveis e contexto regulatório geral. "
            "Não constitui conclusão jurídica, avaliação formal de conformidade, nem aconselhamento "
            "legal. Consulte um profissional de privacidade qualificado para avaliação de conformidade."
        ),
    }


def run_audit(
    url: str,
    scan: "BrowserScanResult",  # accepts BrowserScanResult OR plain html string (backward compat)
    use_view_source: bool = False,
) -> AuditResult:
    """
    Main audit pipeline. Accepts a BrowserScanResult from browser_fetcher.
    All analyzers receive both rendered HTML and runtime data.
    Errors within individual analyzers are caught to prevent cascading failures.
    """
    # Backward compatibility: if a plain html string is passed, wrap it
    if isinstance(scan, str):
        from .browser_fetcher import BrowserScanResult as BSR
        html_str = scan
        scan = BSR(url=url, html=html_str, scan_method="html_fallback", fallback_used=True)

    html = scan.html
    timestamp = datetime.now().isoformat()

    # ── 1. Tag detection ──────────────────────────────────────────────────────
    try:
        tags = detect_tags(html, scan=scan)
    except Exception as e:
        print(f"[audit_engine] Tag detection error: {e}")
        import traceback; traceback.print_exc()
        tags = []

    # ── 2. Tags before consent ────────────────────────────────────────────────
    try:
        tags_before_consent = _find_tags_before_consent(html, tags)
    except Exception:
        tags_before_consent = []

    # ── 3. GTM quality ────────────────────────────────────────────────────────
    try:
        gtm_quality = analyze_gtm(html)
    except Exception as e:
        print(f"[audit_engine] GTM analyzer error: {e}")
        gtm_quality = None

    # ── 4. Event auditing ─────────────────────────────────────────────────────
    try:
        events_result = audit_events(html, scan=scan)
    except Exception as e:
        print(f"[audit_engine] Event auditor error: {e}")
        import traceback; traceback.print_exc()
        events_result = None

    # ── 5. DataLayer audit ────────────────────────────────────────────────────
    try:
        datalayer_findings = audit_datalayer(html)
    except Exception as e:
        print(f"[audit_engine] DataLayer auditor error: {e}")
        datalayer_findings = []

    # ── 6. Consent audit ─────────────────────────────────────────────────────
    try:
        tags_before_consent_names = [t.name for t in tags_before_consent]
        consent_result = audit_consent(html, tags_before_consent_names, scan=scan)
    except Exception as e:
        print(f"[audit_engine] Consent auditor error: {e}")
        consent_result = None

    # ── 7. Privacy / compliance analysis ─────────────────────────────────────
    try:
        jurisdiction = detect_jurisdiction(html, url)
        has_consent_tool = consent_result.cmp_detected if consent_result else False
        privacy_result = analyze_privacy(tags, has_consent_tool, tags_before_consent, jurisdiction)
    except Exception as e:
        print(f"[audit_engine] Privacy analyzer error: {e}")
        jurisdiction = {"law": "General Privacy", "region": "Unknown", "law_full": "General Privacy"}
        privacy_result = None

    # ── 8. Duplication detection ──────────────────────────────────────────────
    try:
        events_list = events_result.events if events_result else []
        duplicates = detect_duplicates(html, tags, events_list)
    except Exception as e:
        print(f"[audit_engine] Duplicate detector error: {e}")
        duplicates = []

    # ── 9. Scoring ────────────────────────────────────────────────────────────
    try:
        scores = compute_scores(tags, gtm_quality, events_result, datalayer_findings,
                                consent_result, privacy_result, duplicates)
    except Exception as e:
        print(f"[audit_engine] Score engine error: {e}")
        scores = None

    # ── 10. Recommendations ───────────────────────────────────────────────────
    try:
        recommendations = generate_recommendations(
            tags, gtm_quality, events_result, datalayer_findings,
            consent_result, privacy_result, duplicates, jurisdiction,
        )
    except Exception as e:
        print(f"[audit_engine] Recommendation engine error: {e}")
        recommendations = []

    # ── 11. Data quality notes ────────────────────────────────────────────────
    try:
        dq_notes = _build_data_quality_notes(scan, tags, events_result)
    except Exception:
        dq_notes = []

    # ── 12. Personal data detection ──────────────────────────────────────────
    try:
        # Determine consent state for timing context
        _has_cmp = consent_result.cmp_detected if consent_result else False
        _consent_state = "unknown" if not _has_cmp else "accepted"  # conservative default
        personal_data_findings = detect_personal_data(
            scan_result=scan,
            url=url,
            timestamp=timestamp,
            consent_state=_consent_state,
        )
    except Exception as e:
        print(f"[audit_engine] Personal data detector error: {e}")
        import traceback; traceback.print_exc()
        personal_data_findings = []

    # ── 13. Sensitive data classification ─────────────────────────────────
    try:
        sensitive_data_findings = classify_sensitive_data(
            scan_result=scan,
            url=url,
            timestamp=timestamp,
            consent_state=_consent_state,
            personal_data_findings=personal_data_findings,
        )
    except Exception as e:
        print(f"[audit_engine] Sensitive data classifier error: {e}")
        import traceback; traceback.print_exc()
        sensitive_data_findings = []

    # ── 14. Regulatory exposure ───────────────────────────────────────────────
    try:
        regulatory_exposure = _build_regulatory_exposure(
            jurisdiction=jurisdiction,
            privacy_result=privacy_result,
            personal_data_findings=personal_data_findings,
            sensitive_data_findings=sensitive_data_findings,
            consent_result=consent_result,
        )
    except Exception as e:
        print(f"[audit_engine] Regulatory exposure error: {e}")
        regulatory_exposure = None

    scan_method = scan.scan_method if not use_view_source else "view_source"
    if use_view_source:
        scan_method = "view_source"

    return AuditResult(
        url=url,
        timestamp=timestamp,
        tags=tags,
        gtm_quality=gtm_quality,
        events=events_result,
        datalayer_findings=datalayer_findings,
        consent=consent_result,
        privacy=privacy_result,
        duplicates=duplicates,
        scores=scores,
        recommendations=recommendations,
        data_quality_notes=dq_notes,
        scan_method=scan_method,
        personal_data_findings=personal_data_findings,
        sensitive_data_findings=sensitive_data_findings,
        regulatory_exposure=regulatory_exposure,
    )
