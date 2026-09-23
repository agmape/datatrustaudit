"""
audit_engine.browser_fetcher — Real browser-based page scanner.

Uses Playwright (headless Chromium) to:
1. Execute JavaScript like a real browser
2. Intercept network requests to tracking endpoints
3. Capture live window.dataLayer state
4. Read consent signals from JS globals
5. Return fully rendered HTML + all runtime data

Stealth mode: spoofs navigator.webdriver, rotates UA, sets real browser fingerprint.
Falls back to requests.get() if Playwright unavailable.

v2 — 2026-09 changes:
  - timeout_ms raised to 60000ms (browser) / 90000ms (outer ThreadPool guard)
  - wait_until: domcontentloaded + best-effort networkidle2 (8s cap)
  - Stealth: hides webdriver cue, sets realistic browser fingerprint args
  - UA rotation: 4 modern Chrome/Edge strings
  - Graceful degradation: TimeoutError → partial BrowserScanResult (not crash)
  - URL sanitisation: auto-prefix https:// before Playwright navigation
"""
import asyncio
import json
import re
import time
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


# ─── Stealth User-Agents (updated Dec 2024) ──────────────────────────────────
_USER_AGENTS = [
    # Chrome 131 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36",
    # Chrome 131 macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36",
    # Edge 131 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    # Chrome 129 Linux (CI-friendly)
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/129.0.0.0 Safari/537.36",
]


# ─── Tracking endpoint patterns for network interception ─────────────────────
TRACKING_DOMAINS = [
    # Google
    r"google-analytics\.com",
    r"analytics\.google\.com",
    r"googletagmanager\.com",
    r"googletagservices\.com",
    r"googleads\.g\.doubleclick\.net",
    r"doubleclick\.net",
    r"googlesyndication\.com",
    r"google\.com/pagead",
    # Meta / Facebook
    r"connect\.facebook\.net",
    r"facebook\.com/tr",
    r"facebook\.com/signals",
    # TikTok
    r"analytics\.tiktok\.com",
    r"ads\.tiktok\.com",
    # Twitter / X
    r"static\.ads-twitter\.com",
    r"t\.co/i/adsct",
    r"analytics\.twitter\.com",
    # LinkedIn
    r"snap\.licdn\.com",
    r"px\.ads\.linkedin\.com",
    # Hotjar
    r"static\.hotjar\.com",
    r"vars\.hotjar\.com",
    r"insights\.hotjar\.com",
    # Microsoft Clarity
    r"clarity\.ms",
    # Segment
    r"cdn\.segment\.com",
    r"api\.segment\.io",
    # Amplitude
    r"cdn\.amplitude\.com",
    r"api\.amplitude\.com",
    # Mixpanel
    r"cdn\.mxpnl\.com",
    r"api\.mixpanel\.com",
    # Criteo
    r"static\.criteo\.net",
    r"sslwidget\.criteo\.com",
    r"dis\.criteo\.com",
    # Taboola
    r"cdn\.taboola\.com",
    # Outbrain
    r"amplify\.outbrain\.com",
    # Snapchat
    r"sc-static\.net",
    r"tr\.snapchat\.com",
    # Pinterest
    r"s\.pinimg\.com",
    r"ct\.pinterest\.com",
    # HubSpot
    r"js\.hs-scripts\.com",
    r"js\.hs-analytics\.net",
    r"track\.hubspot\.com",
    # Intercom
    r"widget\.intercom\.io",
    r"nexus\.intercom\.io",
    # FullStory
    r"fullstory\.com",
    r"edge\.fullstory\.com",
    # Mouseflow
    r"cdn\.mouseflow\.com",
    # VWO / Optimizely
    r"dev\.visualwebsiteoptimizer\.com",
    r"cdn\.optimizely\.com",
    # Adobe
    r"omtrdc\.net",
    r"adobedtm\.com",
    # Klaviyo
    r"static\.klaviyo\.com",
    # Any beacon / collect endpoint
    r"/collect\?",
    r"/tr\?",
    r"/pixel\?",
    r"/beacon",
]

_TRACKING_RE = re.compile("|".join(TRACKING_DOMAINS), re.IGNORECASE)


@dataclass
class InterceptedRequest:
    """A captured network request to a tracking endpoint."""
    url: str
    method: str
    domain: str
    path: str
    post_data: Optional[str] = None
    resource_type: str = "unknown"
    timestamp: float = field(default_factory=time.time)


@dataclass
class BrowserScanResult:
    """Full result from a browser-based page scan."""
    url: str
    html: str
    scan_method: str = "browser"

    # Network data
    intercepted_requests: List[InterceptedRequest] = field(default_factory=list)
    all_script_urls: List[str] = field(default_factory=list)

    # Runtime JS state
    datalayer_raw: List[Dict[str, Any]] = field(default_factory=list)
    gtag_configs: List[Dict[str, Any]] = field(default_factory=list)
    fbq_calls: List[Dict[str, Any]] = field(default_factory=list)
    consent_signals: Dict[str, Any] = field(default_factory=dict)

    # Browser storage
    cookies: Dict[str, str] = field(default_factory=dict)
    local_storage: Dict[str, str] = field(default_factory=dict)
    session_storage: Dict[str, str] = field(default_factory=dict)

    # Before-consent snapshot
    before_consent_snapshot: Dict[str, Any] = field(default_factory=dict)
    before_consent_requests: List[InterceptedRequest] = field(default_factory=list)

    # Meta
    page_title: str = ""
    load_time_ms: int = 0
    error: Optional[str] = None
    fallback_used: bool = False

    # Scan metadata
    scan_status: str = "completed"
    failure_reason: Optional[str] = None
    stages: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    final_url: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    browser_attempts: int = 0
    static_fallback_attempted: bool = False
    partial_scan: bool = False  # v2: explicit flag for graceful degradation


# ─── JavaScript injected BEFORE page load to intercept calls ─────────────────
_INTERCEPT_SCRIPT = """
(function() {
    window.__auditCapture = {
        dataLayerEvents: [],
        gtagCalls: [],
        fbqCalls: [],
    };

    // Intercept dataLayer.push
    const _origDL = window.dataLayer;
    window.dataLayer = _origDL || [];
    const _origPush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = function() {
        for (var i = 0; i < arguments.length; i++) {
            try { window.__auditCapture.dataLayerEvents.push(JSON.parse(JSON.stringify(arguments[i]))); } catch(e) {}
        }
        return _origPush.apply(this, arguments);
    };

    // Intercept gtag calls
    const _origGtag = window.gtag;
    window.gtag = function() {
        try {
            var args = Array.prototype.slice.call(arguments);
            window.__auditCapture.gtagCalls.push(args);
        } catch(e) {}
        if (_origGtag) return _origGtag.apply(this, arguments);
    };

    // Intercept fbq calls
    const _origFbq = window.fbq;
    window.fbq = function() {
        try {
            var args = Array.prototype.slice.call(arguments);
            window.__auditCapture.fbqCalls.push(args);
        } catch(e) {}
        if (_origFbq) return _origFbq.apply(this, arguments);
    };
})();
"""

# ─── Stealth JS: masks navigator.webdriver and other automation signals ───────
_STEALTH_SCRIPT = """
// Mask navigator.webdriver (primary Cloudflare/bot-check signal)
Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });

// Mask Chrome automation properties
if (window.chrome) {
    Object.defineProperty(window, 'chrome', {
        value: { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} },
        writable: false,
    });
}

// Fake realistic plugin list
Object.defineProperty(navigator, 'plugins', {
    get: () => [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
    ],
});

// Fake languages
Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });

// Remove Playwright-specific globals
try { delete window.__playwright; } catch(e) {}
try { delete window.__pw_manual; } catch(e) {}
try { delete window._playwright; } catch(e) {}
"""

# ─── JavaScript evaluated AFTER page load to collect state ───────────────────
_COLLECT_SCRIPT = """
(function() {
    var result = {
        dataLayer: [],
        capturedDL: [],
        capturedGtag: [],
        capturedFbq: [],
        consentSignals: {},
        windowKeys: [],
        localStorage: {},
        sessionStorage: {},
    };

    try {
        if (window.dataLayer && Array.isArray(window.dataLayer)) {
            result.dataLayer = JSON.parse(JSON.stringify(window.dataLayer.slice(0, 200)));
        }
    } catch(e) {}

    try {
        if (window.__auditCapture) {
            result.capturedDL   = window.__auditCapture.dataLayerEvents || [];
            result.capturedGtag = window.__auditCapture.gtagCalls || [];
            result.capturedFbq  = window.__auditCapture.fbqCalls || [];
        }
    } catch(e) {}

    try { result.consentSignals.hasTcf = typeof window.__tcfapi === 'function'; } catch(e) {}
    try { result.consentSignals.hasCmp = typeof window.__cmp === 'function'; } catch(e) {}
    try { result.consentSignals.cookiebotStatus = window.Cookiebot ? window.Cookiebot.consent : null; } catch(e) {}
    try { result.consentSignals.oneTrustLoaded = typeof window.OneTrust !== 'undefined'; } catch(e) {}
    try { result.consentSignals.didomiLoaded = typeof window.Didomi !== 'undefined'; } catch(e) {}
    try { result.consentSignals.consentModeState = window.google_tag_data ? window.google_tag_data.ics : null; } catch(e) {}

    var trackingKeywords = ['gtag','ga','fbq','ttq','twq','lintrk','_hsq','hj','clarity','amplitude','mixpanel','analytics'];
    try {
        trackingKeywords.forEach(function(k) {
            if (typeof window[k] !== 'undefined') result.windowKeys.push(k);
        });
    } catch(e) {}

    try {
        for (var i = 0; i < Math.min(localStorage.length, 50); i++) {
            var k = localStorage.key(i);
            if (k) result.localStorage[k] = (localStorage.getItem(k) || '').substring(0, 100);
        }
    } catch(e) {}

    try {
        for (var i = 0; i < Math.min(sessionStorage.length, 50); i++) {
            var k = sessionStorage.key(i);
            if (k) result.sessionStorage[k] = (sessionStorage.getItem(k) || '').substring(0, 100);
        }
    } catch(e) {}

    return result;
})();
"""

# ─── Before-consent snapshot JS ──────────────────────────────────────────────
_BEFORE_CONSENT_SCRIPT = """
(function() {
    var snapshot = {
        dataLayer: [],
        cookies: document.cookie,
        trackingLoaded: {},
        consentUiVisible: false,
        timestamp: Date.now(),
    };
    try {
        if (window.dataLayer && Array.isArray(window.dataLayer)) {
            snapshot.dataLayer = JSON.parse(JSON.stringify(window.dataLayer.slice(0, 50)));
        }
    } catch(e) {}
    var trackingGlobals = ['ga','gtag','fbq','ttq','twq','_hsq','hj','clarity'];
    trackingGlobals.forEach(function(k) {
        try { snapshot.trackingLoaded[k] = typeof window[k] !== 'undefined'; } catch(e) {}
    });
    try {
        var consentSelectors = [
            '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]',
            '[id*="gdpr"]', '[class*="gdpr"]', '[id*="lgpd"]', '[class*="lgpd"]',
            '[id*="optanon"]', '[id*="cookiebot"]', '[id*="didomi"]',
        ];
        snapshot.consentUiVisible = consentSelectors.some(function(sel) {
            try { var el = document.querySelector(sel); return el && el.offsetParent !== null; } catch(e) { return false; }
        });
    } catch(e) {}
    return snapshot;
})();
"""


def _sanitize_url(url: str) -> str:
    """
    Garantia de URL válida antes de injectar no browser headless.
    Auto-prefixo https:// se em falta. Lança ValueError para URLs inválidas.
    """
    value = (url or "").strip()
    if not value:
        raise ValueError("URL vazia")
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = f"https://{value}"
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc or "." not in (parsed.hostname or ""):
        raise ValueError(f"URL inválida após sanitização: {value!r}")
    return value


async def _browser_scan_async(url: str, timeout_ms: int = 60_000) -> BrowserScanResult:
    """
    Playwright scan assíncrono com stealth mode e graceful degradation.

    timeout_ms: timeout da navegação Playwright (default 60s).
    Se ocorrer TimeoutError, devolve dados parciais (não lança excepção).
    """
    from playwright.async_api import async_playwright, TimeoutError as PwTimeout

    # ── Sanitiza URL antes de qualquer operação de rede ──────────────────────
    try:
        url = _sanitize_url(url)
    except ValueError as exc:
        r = BrowserScanResult(url=url, html="", scan_status="failed", failure_reason=str(exc))
        r.errors.append(str(exc))
        return r

    result = BrowserScanResult(url=url, html="")
    intercepted: List[InterceptedRequest] = []
    script_urls: List[str] = []

    # Rota User-Agent aleatório a cada chamada (anti-fingerprinting)
    chosen_ua = random.choice(_USER_AGENTS)
    print(f"[browser_fetcher] UA: {chosen_ua[:60]}… | timeout={timeout_ms}ms | url={url}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                # Segurança / sandbox
                "--no-sandbox",
                "--disable-setuid-sandbox",
                # Stealth: remove sinais de automação
                "--disable-blink-features=AutomationControlled",
                # Desempenho
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                # Simula perfil real
                "--lang=pt-BR",
                "--window-size=1440,900",
            ],
        )

        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            user_agent=chosen_ua,
            extra_http_headers={
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            },
            # Simula permissões reais de browser
            permissions=["geolocation"],
            java_script_enabled=True,
            bypass_csp=True,  # Necessário para injectar _INTERCEPT_SCRIPT em sites com CSP rígida
        )

        # ── Stealth: mascara navigator.webdriver ANTES de qualquer script do site ──
        await context.add_init_script(_STEALTH_SCRIPT)
        # ── Intercepta dataLayer/gtag/fbq ANTES dos scripts do site ─────────────
        await context.add_init_script(_INTERCEPT_SCRIPT)

        page = await context.new_page()

        # ── Interceptação de rede ─────────────────────────────────────────────
        def _on_request(request):
            req_url = request.url
            if request.resource_type == "script" and req_url.startswith("http"):
                script_urls.append(req_url)
            if _TRACKING_RE.search(req_url):
                parsed = urlparse(req_url)
                post_data_str = None
                try:
                    raw = request.post_data_buffer
                    if raw:
                        post_data_str = raw[:500].decode("utf-8", errors="replace")
                except Exception:
                    pass
                intercepted.append(InterceptedRequest(
                    url=req_url,
                    method=request.method,
                    domain=parsed.netloc,
                    path=parsed.path,
                    post_data=post_data_str,
                    resource_type=request.resource_type,
                ))

        page.on("request", _on_request)

        # ── Navegação com graceful degradation ───────────────────────────────
        t0 = time.time()
        nav_timed_out = False
        try:
            # domcontentloaded: não espera JS pesado, iframes, vídeos, etc.
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)

            # Tentativa de networkidle2 com cap de 10s (não bloqueia se falhar)
            try:
                await page.wait_for_load_state("networkidle", timeout=10_000)
            except PwTimeout:
                result.warnings.append("networkidle não atingido — dados parciais de rede podem estar incompletos")

        except PwTimeout:
            # ── GRACEFUL DEGRADATION: timeout não é erro fatal ────────────────
            # Colectamos tudo o que capturámos até agora e marcamos partial_scan
            nav_timed_out = True
            result.error = "Timeout de navegação — dados parciais recolhidos"
            result.scan_status = "partial"
            result.failure_reason = "navigation_timeout"
            result.partial_scan = True
            print(f"[browser_fetcher] ⏱ Timeout ({timeout_ms}ms) — collecting partial data for {url}")

        except Exception as exc:
            err_str = str(exc)
            result.error = err_str
            if any(sig in err_str.lower() for sig in ["http2", "protocol error", "protocol_error", "err_http2", "net::err_"]):
                result.scan_status = "protocol_error"
                result.failure_reason = "http2_protocol_failure"
            elif "timeout" in err_str.lower():
                result.scan_status = "partial"
                result.failure_reason = "navigation_timeout"
                result.partial_scan = True
                nav_timed_out = True
            elif any(sig in err_str.lower() for sig in ["403", "forbidden", "blocked", "access denied", "cloudflare"]):
                result.scan_status = "blocked"
                result.failure_reason = "site_blocked_access"
            else:
                result.scan_status = "partial"
                result.failure_reason = err_str[:200]
                result.partial_scan = True

        # ── Scroll para activar lazy-loaded tags (melhor dados mesmo em partial) ──
        try:
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
            await asyncio.sleep(0.8)
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(0.5)
        except Exception:
            pass

        # ── Snapshot before-consent ───────────────────────────────────────────
        try:
            before_snapshot = await page.evaluate(_BEFORE_CONSENT_SCRIPT)
            result.before_consent_snapshot = before_snapshot or {}
            result.before_consent_requests = list(intercepted)
        except Exception as exc:
            print(f"[browser_fetcher] Before-consent snapshot error: {exc}")

        await asyncio.sleep(0.3)

        # ── HTML renderizado ──────────────────────────────────────────────────
        try:
            result.html = await page.content()
        except Exception as exc:
            result.error = (result.error or "") + f" | content() error: {exc}"

        # ── Estado JS ─────────────────────────────────────────────────────────
        try:
            js_state = await page.evaluate(_COLLECT_SCRIPT)
            if js_state:
                dl_static   = js_state.get("dataLayer", [])
                dl_captured = js_state.get("capturedDL", [])
                seen_dl = set()
                combined = []
                for item in dl_static + dl_captured:
                    key = json.dumps(item, sort_keys=True, default=str)[:200]
                    if key not in seen_dl:
                        seen_dl.add(key)
                        combined.append(item)
                result.datalayer_raw    = combined
                result.gtag_configs     = js_state.get("capturedGtag", [])
                result.fbq_calls        = js_state.get("capturedFbq", [])
                result.consent_signals  = js_state.get("consentSignals", {})
                result.local_storage    = js_state.get("localStorage", {})
                result.session_storage  = js_state.get("sessionStorage", {})
        except Exception as exc:
            print(f"[browser_fetcher] JS collection error: {exc}")

        # ── Cookies ───────────────────────────────────────────────────────────
        try:
            cookies_list = await context.cookies()
            result.cookies = {c["name"]: c.get("value", "")[:50] for c in cookies_list[:100]}
        except Exception:
            pass

        # ── Título e metadados ────────────────────────────────────────────────
        try:
            result.page_title = await page.title()
        except Exception:
            pass

        try:
            result.final_url = page.url
        except Exception:
            pass

        result.load_time_ms = int((time.time() - t0) * 1000)
        result.intercepted_requests = intercepted
        result.all_script_urls = list(dict.fromkeys(script_urls))

        if nav_timed_out:
            result.warnings.append(
                f"Scan parcial: timeout após {result.load_time_ms}ms. "
                f"Capturadas {len(intercepted)} requisições de rastreio e {len(script_urls)} scripts."
            )

        await browser.close()

    return result


def browser_scan(url: str, timeout_ms: int = 60_000, deep_scan: bool = False) -> BrowserScanResult:
    """
    Ponto de entrada público. Executa o scan com múltiplas tentativas e fallback estático.

    Tentativa 1: Chromium stealth, domcontentloaded + networkidle2
    Tentativa 2: Retry com UA diferente (para sites que bloqueiam o primeiro)
    Tentativa 3: Static HTTP fallback

    timeout_ms padrão: 60 000ms (browser). O ThreadPoolExecutor usa timeout_ms + 30s.

    IMPORTANTE: TimeoutError gera dados parciais — nunca um crash.
    """
    import concurrent.futures
    from datetime import datetime

    started_at = datetime.now().isoformat()

    # Sanitiza URL uma vez no ponto de entrada público
    try:
        url = _sanitize_url(url)
    except ValueError as exc:
        r = BrowserScanResult(url=url, html="", scan_status="failed", failure_reason=str(exc))
        r.errors.append(str(exc))
        r.started_at = started_at
        r.finished_at = datetime.now().isoformat()
        return r

    def _run_in_thread() -> BrowserScanResult:
        """Executa dentro de uma thread com event loop próprio."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(_browser_scan_async(url, timeout_ms))
        finally:
            loop.close()

    # Guarda externo: timeout_ms (browser) + 30s de margem para setup/teardown
    outer_timeout_s = (timeout_ms / 1000) + 30
    max_browser_attempts = 2
    last_error = None

    for attempt in range(1, max_browser_attempts + 1):
        try:
            import playwright  # noqa — só para verificar disponibilidade
            print(f"[browser_fetcher] Tentativa {attempt}/{max_browser_attempts} — {url}")
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_run_in_thread)
                result = future.result(timeout=outer_timeout_s)
                result.browser_attempts = attempt
                result.started_at = started_at
                result.finished_at = datetime.now().isoformat()

                # Retorna se temos HTML suficiente OU dados parciais com evidências
                if result.html and len(result.html) > 100:
                    if result.error and result.scan_status == "completed":
                        result.scan_status = "partial"
                    return result

                # Dados parciais com evidências de rede? Também retorna — não perde informação
                if result.partial_scan and (result.intercepted_requests or result.datalayer_raw):
                    print(f"[browser_fetcher] Retornando dados parciais com {len(result.intercepted_requests)} requests")
                    return result

                # Erro de protocolo: não tenta de novo com browser, vai para fallback
                if result.scan_status == "protocol_error":
                    last_error = result.failure_reason or result.error
                    break

                last_error = result.error

        except ImportError:
            print("[browser_fetcher] Playwright não instalado — fallback estático")
            last_error = "Playwright not installed"
            break

        except concurrent.futures.TimeoutError:
            # ThreadPoolExecutor timeout (outer guard) — graceful degradation
            last_error = f"Outer timeout (tentativa {attempt}) após {outer_timeout_s:.0f}s"
            print(f"[browser_fetcher] ⏱ {last_error}")
            # Ainda tenta o fallback estático em vez de devolver erro fatal

        except Exception as exc:
            print(f"[browser_fetcher] Tentativa {attempt} falhou: {exc}")
            last_error = str(exc)

    # ── Todas as tentativas browser falharam → fallback estático ─────────────
    print(f"[browser_fetcher] Fallback estático para {url}")
    result = _static_fallback(url, error=last_error)
    result.browser_attempts = max_browser_attempts
    result.static_fallback_attempted = True
    result.started_at = started_at
    result.finished_at = datetime.now().isoformat()

    if result.html and len(result.html) > 100:
        result.scan_status = "partial"
        result.failure_reason = "browser_failed_static_fallback_used"
        result.partial_scan = True
    else:
        if last_error and any(sig in str(last_error).lower() for sig in ["http2", "protocol"]):
            result.scan_status = "protocol_error"
            result.failure_reason = "http2_protocol_failure"
        else:
            result.scan_status = "failed"
            result.failure_reason = last_error or "all_scan_methods_failed"

    return result


def _static_fallback(url: str, error: Optional[str] = None) -> BrowserScanResult:
    """Fallback estático com múltiplos User-Agents para sites que bloqueiam o browser headless."""
    import requests

    last_err = error
    for ua in _USER_AGENTS:
        try:
            resp = requests.get(
                url,
                headers={
                    "User-Agent": ua,
                    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                },
                timeout=25,
                allow_redirects=True,
            )
            resp.encoding = resp.apparent_encoding or "utf-8"

            html = resp.text if resp.status_code == 200 else ""

            script_urls = re.findall(r'<script[^>]+src=["\'"]([^"\'"\>]+)["\']', html, re.IGNORECASE)
            title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
            page_title = title_match.group(1).strip() if title_match else ""

            result = BrowserScanResult(
                url=url,
                html=html,
                scan_method="static_fallback",
                fallback_used=True,
                error=error,
                page_title=page_title,
                all_script_urls=script_urls[:100],
                final_url=resp.url,
                static_fallback_attempted=True,
                partial_scan=True,
            )
            result.warnings = [
                "Fallback estático — comportamento JS em tempo de execução não verificado",
                "Estado de cookies, pushes de dataLayer e interacções de consentimento não capturados",
            ]
            return result

        except Exception as exc:
            last_err = str(exc)

    return BrowserScanResult(
        url=url, html="", scan_method="static_fallback",
        fallback_used=True, error=last_err,
        scan_status="failed",
        failure_reason=last_err,
        static_fallback_attempted=True,
    )
