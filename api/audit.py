import asyncio
import ipaddress
import re
import socket

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter


from fastapi.responses import JSONResponse
from pydantic import BaseModel


from audit_engine.browser_fetcher import browser_scan
from audit_engine.url_security import UnsafeURLError, validate_public_url
from audit_engine.orchestrator import run_audit
from audit_engine.credit_rules import get_evidence_count




router = APIRouter(prefix="/api/audit", tags=["Audit"])


# ── Timeouts ────────────────────────────────────────────────────────────────
# Browser Playwright timeout: 60s — domcontentloaded + 10s networkidle2 cap
# Outer asyncio.wait_for guard: 90s — dá 30s de margem para setup/teardown
FETCH_TIMEOUT_MS   = 60_000   # ms → passado para browser_scan
OUTER_TIMEOUT_S    = 90.0     # segundos para asyncio.wait_for


class AuditRequest(BaseModel):
    url: str
    view_source: Optional[bool] = True

def _friendly_message(code: str) -> str:
    messages = {
        "INVALID_URL": "Please enter a valid website URL.",
        "FETCH_FAILED": "We could not access this website. Please check the URL and try again.",
        "BLOCKED": "The website may have blocked the scan. Basic or partial results are shown when available.",
        "TIMEOUT": "The website took too long to respond. Please try again.",
        "PROTOCOL_ERROR": "The runtime scan was interrupted by a protocol failure. No confirmed runtime findings were generated.",
        "DNS_FAILURE": "Could not resolve the website domain. Please check the URL.",
    }
    return messages.get(code, messages["FETCH_FAILED"])


def normalize_url(raw_url: str) -> str:
    """Validate a user-supplied scan target and reject SSRF/private-network targets."""
    try:
        return validate_public_url(raw_url)
    except UnsafeURLError as exc:
        raise ValueError("INVALID_URL") from exc


def _safe_dict(value: Any) -> Any:
    if value is None:
        return None
    if is_dataclass(value):
        if hasattr(value, "to_dict"):
            return value.to_dict()
        return {k: _safe_dict(v) for k, v in asdict(value).items()}
    if isinstance(value, list):
        return [_safe_dict(item) for item in value]
    if isinstance(value, tuple):
        return [_safe_dict(item) for item in value]
    if isinstance(value, dict):
        return {k: _safe_dict(v) for k, v in value.items()}
    if hasattr(value, "to_dict"):
        return value.to_dict()
    return value


def _dedupe_strings(values: List[str]) -> List[str]:
    seen = set()
    out = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def _risk_from_privacy(privacy: Dict[str, Any], law: str) -> Optional[str]:
    if not privacy:
        return None
    violations = privacy.get("violations") or []
    if any(v.get("severity") == "critical" for v in violations if isinstance(v, dict)):
        return "critical"
    if any(v.get("severity") == "high" for v in violations if isinstance(v, dict)):
        return "high"
    if violations:
        return "medium"
    if law and privacy.get("hasConsentTool") is False:
        return "needs_manual_verification"
    return "low"


def _issue_from_recommendation(rec: Dict[str, Any], locked: bool = False) -> Dict[str, Any]:
    severity = rec.get("severity") or rec.get("priority") or "info"
    return {
        "severity": severity if severity in {"critical", "high", "medium", "low", "info"} else "info",
        "title": rec.get("title") or rec.get("category") or "Audit recommendation",
        "description": rec.get("detail") or rec.get("description") or "",
        "impact": rec.get("impact") or "May affect analytics data quality, privacy compliance, or debugging reliability.",
        "howToFix": rec.get("fix") or rec.get("recommendation") or "Review the implementation in GTM, GA4, CMP, and site source.",
        "confidence": rec.get("confidence") or "medium",
        "accessRequirement": null,
    }


def _build_debugging(scan: Any, audit: Dict[str, Any]) -> Dict[str, Any]:
    datalayer = audit.get("datalayer_findings") or audit.get("datalayerFindings") or []
    scripts = getattr(scan, "all_script_urls", []) or []
    network = getattr(scan, "intercepted_requests", []) or []
    network_hints = []
    for req in network[:50]:
        req_dict = _safe_dict(req) if req else {}
        network_hints.append({
            "url": req_dict.get("url"),
            "domain": req_dict.get("domain"),
            "resourceType": req_dict.get("resource_type") or req_dict.get("resourceType"),
            "status": "detected",
            "verification": "Detected from browser/network scan" if not getattr(scan, "fallback_used", False) else "Unavailable in static scan",
        })

    return {
        "scriptsInspected": scripts[:100],
        "dataLayerPushes": datalayer if isinstance(datalayer, list) else [],
        "javascriptErrors": [],
        "networkHints": network_hints,
        "spaBehaviorHints": [
            {
                "status": "needs_manual_verification",
                "message": "Single-page app route changes and authenticated flows may require manual verification or a deeper multi-page scan.",
            }
        ],
    }


def _normalize_audit_response(url: str, scan: Any, audit_result: Any) -> Dict[str, Any]:
    audit = _safe_dict(audit_result) or {}
    tags = audit.get("tags") or []
    events = audit.get("events") or {}
    privacy = audit.get("privacy") or {}
    consent = audit.get("consent") or {}
    gtm_quality = audit.get("gtm_quality") or audit.get("gtmQuality") or {}
    scores = audit.get("scores") or {}
    recommendations = audit.get("recommendations") or []
    duplicates = audit.get("duplicates") or []
    datalayer = audit.get("datalayer_findings") or audit.get("datalayerFindings") or []
    # New privacy engine fields
    personal_data_findings_raw = []
    sensitive_data_findings_raw = []
    regulatory_exposure_raw = None
    try:
        _pdf = getattr(audit_result, "personal_data_findings", None)
        if _pdf:
            personal_data_findings_raw = [f.to_dict() if hasattr(f, "to_dict") else f for f in _pdf]
        _sdf = getattr(audit_result, "sensitive_data_findings", None)
        if _sdf:
            sensitive_data_findings_raw = [f.to_dict() if hasattr(f, "to_dict") else f for f in _sdf]
        regulatory_exposure_raw = getattr(audit_result, "regulatory_exposure", None)
    except Exception:
        pass

    ga4_ids = _dedupe_strings([
        tag.get("tagId") for tag in tags
        if isinstance(tag, dict) and (tag.get("id") == "ga4" or tag.get("type") == "analytics")
        and isinstance(tag.get("tagId"), str) and tag.get("tagId", "").startswith("G-")
    ])
    gtm_ids = _dedupe_strings([
        tag.get("tagId") for tag in tags
        if isinstance(tag, dict) and (tag.get("id") == "gtm" or tag.get("type") == "tag_manager")
        and isinstance(tag.get("tagId"), str) and tag.get("tagId", "").startswith("GTM-")
    ] + (gtm_quality.get("containers") or []))

    event_items = events.get("events") if isinstance(events, dict) else []
    privacy_violations = privacy.get("violations") if isinstance(privacy, dict) else []
    issue_items = [_issue_from_recommendation(rec) for rec in recommendations if isinstance(rec, dict)]

    score = scores.get("auditScore") or scores.get("overall") or audit.get("score")
    score_available = score is not None
    normalized_score = int(max(0, min(100, score))) if score_available else None

    # Cookie names must come from browser evidence, never from vendor assumptions.
    observed_cookies = sorted(list((getattr(scan, "cookies", {}) or {}).keys()))

    visible_tags = tags

    response = {
        "success": True,
        "status": "completed" if not getattr(scan, "error", None) else "partial",
        "access": "full",
        "url": url,
        "score": normalized_score,
        "scoreAvailable": score_available,
        "summary": {
            "totalTags": len(tags),
            "totalEvents": events.get("totalEvents", len(event_items)) if isinstance(events, dict) else len(event_items or []),
            "totalViolations": privacy.get("totalViolations", len(privacy_violations or [])) if isinstance(privacy, dict) else 0,
            "totalRecommendations": len(recommendations),
            "consentDetected": bool(consent.get("cmpDetected") or privacy.get("hasConsentTool")) if isinstance(consent, dict) else False,
            "hasUniversalAnalytics": bool(privacy.get("hasUniversalAnalytics")) if isinstance(privacy, dict) else False,
            "violationsCount": privacy.get("totalViolations", len(privacy_violations or [])) if isinstance(privacy, dict) else 0,
            "estimatedFine": privacy.get("estimatedRiskExposure") if isinstance(privacy, dict) else None,
            "eventsDetected": events.get("totalEvents", len(event_items)) if isinstance(events, dict) else len(event_items or []),
            "duplicatesDetected": len(duplicates),
            "piiExposureCount": len(personal_data_findings_raw),
            "sensitiveDataCount": len(sensitive_data_findings_raw),
            "securityIssuesCount": 0,
        },
        "tags": visible_tags,
        "events": event_items or [],
        "violations": privacy_violations or [],
        "recommendations": issue_items,
        "privacy": {
            "jurisdiction": privacy.get("jurisdiction") if isinstance(privacy, dict) else "Unknown",
            "framework": privacy.get("framework") or privacy.get("law_full") if isinstance(privacy, dict) else "General Privacy",
            "confidenceLevel": privacy.get("confidenceLevel") if isinstance(privacy, dict) else "Static scan confidence only",
            "violations": privacy_violations or [],
            "totalViolations": privacy.get("totalViolations", len(privacy_violations or [])) if isinstance(privacy, dict) else 0,
            "hasConsentTool": bool(consent.get("cmpDetected") or privacy.get("hasConsentTool")) if isinstance(consent, dict) else False,
            "hasUniversalAnalytics": bool(privacy.get("hasUniversalAnalytics")) if isinstance(privacy, dict) else False,
            "estimatedRiskExposure": privacy.get("estimatedRiskExposure") if isinstance(privacy, dict) else None,
            "complianceScore": privacy.get("complianceScore") if isinstance(privacy, dict) else None,
            "scoreBasis": privacy.get("scoreBasis") if isinstance(privacy, dict) else None,
            "scoreDeductions": privacy.get("scoreDeductions", []) if isinstance(privacy, dict) else [],
            "gdprRisk": _risk_from_privacy(privacy, "GDPR"),
            "lgpdRisk": _risk_from_privacy(privacy, "LGPD"),
            "cookieConsentDetected": bool(consent.get("cmpDetected")) if isinstance(consent, dict) else None,
            "cmpDetected": bool(consent.get("cmpDetected") or privacy.get("hasConsentTool")) if isinstance(consent, dict) else None,
            "cmpName": consent.get("cmpName") if isinstance(consent, dict) else None,
            "consentModeDetected": bool(consent.get("consentModeV2")) if isinstance(consent, dict) else None,
            "tagsBeforeConsent": consent.get("tagsBeforeConsent", []) if isinstance(consent, dict) else [],
            "observedCookies": observed_cookies,
            "cookieObservationNote": (
                "Cookie names are reported only when observed in the browser context. "
                "The scanner does not infer cookie presence from a vendor tag."
            ),
            "manualVerification": [
                "Data retention, GA4 reporting identity, custom dimensions, server-side tagging, and authenticated funnels need manual verification.",
            ],
        },
        "ga4": {
            "detected": bool(ga4_ids),
            "measurementIds": ga4_ids,
            "events": event_items or [],
            "parameters": [],
            "keyEvents": [],
            "issues": [],
            "manualVerification": [
                "DebugView readiness, key events, attribution reports, and GA4 retention are unavailable in static scans.",
            ],
        },
        "gtm": {
            "detected": bool(gtm_ids),
            "containerIds": gtm_ids,
            "tags": visible_tags,
            "triggers": [],
            "variables": [],
            "issues": gtm_quality.get("findings", []) if isinstance(gtm_quality, dict) else [],
            "manualVerification": [
                "GTM triggers, variables, and unpublished workspace configuration require container export or authenticated access.",
            ],
        },
        "debugging": _build_debugging(scan, audit),
        "errors": ([{"code": "PARTIAL_SCAN", "message": str(getattr(scan, "error", ""))}] if getattr(scan, "error", None) else []),
        "scanMethod": audit.get("scan_method") or getattr(scan, "scan_method", "html_fallback"),
        "dataQualityNotes": audit.get("data_quality_notes") or audit.get("dataQualityNotes") or [],
        "duplicates": duplicates,
        "gtmQuality": gtm_quality,
        "consent": consent,
        "datalayerFindings": datalayer,
        "scores": scores,
        "disclaimer": audit.get("disclaimer"),
        # New privacy engine
        "personalDataFindings": personal_data_findings_raw,
        "sensitiveDataFindings": sensitive_data_findings_raw,
        "regulatoryExposure": regulatory_exposure_raw,
        # Scan metadata
        "scan_id": __import__("uuid").uuid4().hex,
        "observability": {
            "scan_method": audit.get("scan_method") or getattr(scan, "scan_method", "html_fallback"),
            "browser_success": not bool(getattr(scan, "fallback_used", False)),
            "static_fallback": bool(getattr(scan, "static_fallback_attempted", False) or getattr(scan, "fallback_used", False)),
            "pages_scanned": 1,
            "requests_intercepted": len(getattr(scan, "intercepted_requests", []) or []),
            "scripts_detected": len(getattr(scan, "all_script_urls", []) or []),
            "findings_count": (
                len(tags) + len(privacy_violations or []) + len(personal_data_findings_raw)
                + len(sensitive_data_findings_raw) + len(recommendations)
            ),
            "errors": list(getattr(scan, "errors", []) or []) + ([str(getattr(scan, "error", ""))] if getattr(scan, "error", None) else []),
            "warnings": list(getattr(scan, "warnings", []) or []),
            "duration_ms": getattr(scan, "load_time_ms", None),
            "started_at": getattr(scan, "started_at", None),
            "finished_at": getattr(scan, "finished_at", None),
        },
        "scan_status": getattr(scan, "scan_status", "completed") if not getattr(scan, "error", None) else getattr(scan, "scan_status", "partial"),
        "failure_reason": getattr(scan, "failure_reason", None),
        "browser_attempts": getattr(scan, "browser_attempts", 1),
        "static_fallback_used": getattr(scan, "static_fallback_attempted", False) or getattr(scan, "fallback_used", False),
        "final_url": getattr(scan, "final_url", None),
        "started_at": getattr(scan, "started_at", None),
        "finished_at": getattr(scan, "finished_at", None),
        "warnings": getattr(scan, "warnings", []),
    }

    # Determine credit consumption
    response["evidence_count"] = get_evidence_count(response)

    return response


def _failed_response(code: str, errors: Optional[List[Dict[str, Any]]] = None, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        {
            "success": False,
            "status": "failed",
            "errorCode": code,
            "message": _friendly_message(code),
            "errors": errors or [],
        },
        status_code=status_code,
    )


@router.post("")
@router.post("/")
async def run_direct_audit(payload: AuditRequest):
    # ── 1. Valida e sanitiza URL ─────────────────────────────────────────────
    try:
        url = normalize_url(payload.url)
    except ValueError:
        return _failed_response("INVALID_URL", status_code=400)

    # ── 2. Public full-access mode ───────────────────────────────────────────
    # No login, subscription, quota, plan or database persistence is required.

    # ── 3. Browser scan with graceful degradation ─────────────────────────────
    scan = None
    try:
        scan = await asyncio.wait_for(
            asyncio.to_thread(browser_scan, url, FETCH_TIMEOUT_MS),
            timeout=OUTER_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        # Outer guard expirou (90s) — sem dados do browser, tenta fallback estático
        print(f"[api/audit] asyncio.TimeoutError para {url} — tentando fallback estático")
        try:
            from audit_engine.browser_fetcher import _static_fallback
            scan = _static_fallback(url, error="Outer asyncio timeout (90s)")
            scan.partial_scan = True
            scan.scan_status = "partial"
            scan.failure_reason = "outer_timeout_static_fallback"
            scan.warnings = scan.warnings or []
            scan.warnings.append(
                "O site demorou mais de 90s. Resultados baseados em fallback estático (sem JS/runtime)."
            )
        except Exception as fb_exc:
            return _failed_response("TIMEOUT", [{
                "message": f"Timeout de 90s e fallback estático também falhou: {fb_exc}"
            }])

    except UnsafeURLError as exc:
        return _failed_response("INVALID_URL", [{"message": str(exc)}], status_code=400)
    except (socket.gaierror, OSError) as exc:
        return _failed_response("FETCH_FAILED", [{"message": str(exc)}])
    except Exception as exc:
        return _failed_response("FETCH_FAILED", [{"message": str(exc)}])

    # ── 4. Motor de auditoria ─────────────────────────────────────────────────
    try:
        audit_result = run_audit(url, scan, use_view_source=True)
        response = _normalize_audit_response(url, scan, audit_result)

        # ── 5. Enriquece resposta com flags de scan parcial ──────────────────
        is_partial = getattr(scan, "partial_scan", False)
        if is_partial:
            response["partial_scan"] = True
            response["status"] = "partial"
            response["success"] = True   # parcial ≠ falha — frontend deve renderizar o que tiver

        scan_status = getattr(scan, "scan_status", "completed")
        if not getattr(scan, "html", ""):
            # Sem HTML mas pode ter dados de rede — verifica se vale a pena retornar parcial
            has_network_evidence = bool(getattr(scan, "intercepted_requests", []))
            if is_partial and has_network_evidence:
                # Tem evidências forenses mesmo sem HTML — retorna partial
                response["success"] = True
                response["status"] = "partial"
                response["partial_scan"] = True
            else:
                response["success"] = False
                response["status"] = scan_status if scan_status != "completed" else "failed"
                if scan_status == "protocol_error":
                    response["errorCode"] = "PROTOCOL_ERROR"
                    response["message"] = _friendly_message("PROTOCOL_ERROR")
                elif scan_status == "blocked":
                    response["errorCode"] = "BLOCKED"
                    response["message"] = _friendly_message("BLOCKED")
                elif scan_status in ("timeout", "partial"):
                    response["errorCode"] = "TIMEOUT"
                    response["message"] = _friendly_message("TIMEOUT")
                else:
                    response["errorCode"] = "FETCH_FAILED"
                    response["message"] = _friendly_message("FETCH_FAILED")
        return JSONResponse(response)

    except Exception as exc:
        print(f"[api/audit] Erro no motor de auditoria: {exc}")
        return _failed_response("FETCH_FAILED", [{"message": str(exc)}])
