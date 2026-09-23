"""
audit_engine.tag_detector — Multi-method tracking tag detection engine.

Detection methods (in order of confidence):
1. script_url   → exact domain/path match in <script src="..."> (HIGH)
2. source       → regex pattern in raw HTML (MEDIUM-HIGH based on specificity)
3. script_pattern → inline JS code signature (MEDIUM)
4. network      → intercepted network request to vendor domain (HIGH — tag actually fired)
5. window_key   → JS global present in window object (MEDIUM)
"""
import re
from typing import List, Optional, TYPE_CHECKING
from bs4 import BeautifulSoup
from .models import TagFinding, CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW, DETECT_SOURCE, DETECT_SCRIPT_URL, DETECT_PATTERN

if TYPE_CHECKING:
    from .browser_fetcher import BrowserScanResult

DETECT_NETWORK = "network_request"
DETECT_WINDOW  = "window_global"


# ─────────────────────────────────────────────
# Vendor catalog
# Each entry defines the vendor and its detection signatures.
# "url_patterns" → checked against external script src attrs → HIGH confidence
# "source_patterns" → checked in raw HTML → MEDIUM confidence
# "id_pattern" → regex to extract the vendor's tracking ID
# ─────────────────────────────────────────────

VENDOR_CATALOG = {
    "gtm": {
        "name": "Google Tag Manager",
        "vendor": "Google",
        "type": "tag_manager",
        "privacy_risk": "medium",
        "data_collected": ["Custom events", "User interactions", "E-commerce data"],
        "url_patterns": [r"googletagmanager\.com/gtm\.js"],
        "source_patterns": [r"GTM-[A-Z0-9]{6,8}", r"google_tag_manager"],
        "id_pattern": r"GTM-[A-Z0-9]{6,8}",
    },
    "ga4": {
        "name": "Google Analytics 4",
        "vendor": "Google",
        "type": "analytics",
        "privacy_risk": "high",
        "data_collected": ["IP address", "Browsing behaviour", "Geographic location", "Demographics"],
        "url_patterns": [r"googletagmanager\.com/gtag/js", r"google-analytics\.com/g/collect"],
        "source_patterns": [r"G-[A-Z0-9]{10,12}", r"gtag\s*\(\s*['\"]config['\"]"],
        "id_pattern": r"G-[A-Z0-9]{10,12}",
    },
    "ua": {
        "name": "Universal Analytics (Deprecated)",
        "vendor": "Google",
        "type": "analytics",
        "privacy_risk": "critical",
        "data_collected": ["IP address", "Browsing behaviour", "Persistent cookies"],
        "url_patterns": [r"google-analytics\.com/analytics\.js"],
        "source_patterns": [r"UA-\d{6,10}-\d{1,3}", r"ga\s*\(\s*['\"]create['\"]"],
        "id_pattern": r"UA-\d{6,10}-\d{1,3}",
    },
    "meta_pixel": {
        "name": "Meta Pixel (Facebook)",
        "vendor": "Meta",
        "type": "advertising",
        "privacy_risk": "critical",
        "data_collected": ["Browser fingerprint", "Purchase behaviour", "Cross-site remarketing"],
        "url_patterns": [r"connect\.facebook\.net.*fbevents\.js"],
        "source_patterns": [r"fbq\s*\(\s*['\"]init['\"]", r"facebook\.net/en_US/fbevents"],
        "id_pattern": r"fbq\s*\(\s*['\"]init['\"][\s\S]*?['\"](\d{15,16})['\"]",
    },
    "google_ads": {
        "name": "Google Ads Conversion",
        "vendor": "Google",
        "type": "advertising",
        "privacy_risk": "high",
        "data_collected": ["Conversions", "Remarketing data", "Custom audiences"],
        "url_patterns": [r"googleads\.g\.doubleclick\.net"],
        "source_patterns": [r"AW-\d{9,11}", r"gtag\s*\(\s*['\"]event['\"][\s\S]*?['\"]conversion['\"]"],
        "id_pattern": r"AW-\d{9,11}",
    },
    "floodlight": {
        "name": "Google Floodlight",
        "vendor": "Google",
        "type": "advertising",
        "privacy_risk": "high",
        "data_collected": ["Conversions", "Remarketing"],
        "url_patterns": [r"fls\.doubleclick\.net", r"ad\.doubleclick\.net/ddm"],
        "source_patterns": [r"DC-\d{7,12}", r"doubleclick\.net/pagead/conversion"],
        "id_pattern": r"DC-\d{7,12}",
    },
    "hotjar": {
        "name": "Hotjar",
        "vendor": "Hotjar",
        "type": "heatmap",
        "privacy_risk": "critical",
        "data_collected": ["Session recordings", "Heatmaps", "Form data"],
        "url_patterns": [r"static\.hotjar\.com"],
        "source_patterns": [r"hjid\s*:", r"hj\s*\(\s*['\"]trigger['\"]", r"hotjar\.com"],
        "id_pattern": r"hjid\s*:\s*(\d{5,})",
    },
    "clarity": {
        "name": "Microsoft Clarity",
        "vendor": "Microsoft",
        "type": "heatmap",
        "privacy_risk": "high",
        "data_collected": ["Session recordings", "Click maps", "Scroll depth"],
        "url_patterns": [r"clarity\.ms/tag"],
        "source_patterns": [r"clarity\s*\(\s*['\"]set['\"]", r"clarity\.ms"],
        "id_pattern": r"clarity\s*\(\s*['\"]set['\"][\s\S]*?['\"]([a-z0-9]{10,})['\"]",
    },
    "tiktok_pixel": {
        "name": "TikTok Pixel",
        "vendor": "TikTok",
        "type": "advertising",
        "privacy_risk": "critical",
        "data_collected": ["Conversion events", "Remarketing", "Audiences"],
        "url_patterns": [r"analytics\.tiktok\.com"],
        "source_patterns": [r"ttq\.track", r"ttq\.identify", r"ttq\.load"],
        "id_pattern": None,
    },
    "linkedin_insight": {
        "name": "LinkedIn Insight Tag",
        "vendor": "LinkedIn",
        "type": "advertising",
        "privacy_risk": "high",
        "data_collected": ["B2B conversions", "Professional remarketing"],
        "url_patterns": [r"snap\.licdn\.com", r"linkedin\.com/px"],
        "source_patterns": [r"_linkedin_partner_id"],
        "id_pattern": r"_linkedin_partner_id\s*=\s*['\"]?(\d+)",
    },
    "pinterest": {
        "name": "Pinterest Tag",
        "vendor": "Pinterest",
        "type": "advertising",
        "privacy_risk": "high",
        "data_collected": ["Conversions", "Remarketing", "Interest audiences"],
        "url_patterns": [r"s\.pinimg\.com/ct/core\.js"],
        "source_patterns": [r"pintrk\s*\(", r"pinterest\.com/ct/"],
        "id_pattern": None,
    },
    "twitter_x_pixel": {
        "name": "Twitter/X Pixel",
        "vendor": "Twitter/X",
        "type": "advertising",
        "privacy_risk": "high",
        "data_collected": ["Conversions", "Tailored audiences", "Remarketing"],
        "url_patterns": [r"static\.ads-twitter\.com"],
        "source_patterns": [r"twq\s*\(", r"twitter\.com/i/adsct"],
        "id_pattern": None,
    },
    "snapchat_pixel": {
        "name": "Snapchat Pixel",
        "vendor": "Snapchat",
        "type": "advertising",
        "privacy_risk": "high",
        "data_collected": ["Conversions", "Remarketing", "Snapchat audiences"],
        "url_patterns": [r"sc-static\.net/scevent\.min\.js"],
        "source_patterns": [r"snaptr\s*\(", r"tr\.snapchat\.com"],
        "id_pattern": None,
    },
    "segment": {
        "name": "Segment",
        "vendor": "Twilio",
        "type": "analytics",
        "privacy_risk": "high",
        "data_collected": ["Custom events", "User identity", "Navigation properties"],
        "url_patterns": [r"cdn\.segment\.com"],
        "source_patterns": [r"analytics\.identify\s*\(", r"analytics\.track\s*\("],
        "id_pattern": None,
    },
    "amplitude": {
        "name": "Amplitude",
        "vendor": "Amplitude",
        "type": "analytics",
        "privacy_risk": "high",
        "data_collected": ["Product events", "Cohorts", "User journey"],
        "url_patterns": [r"cdn\.amplitude\.com"],
        "source_patterns": [r"amplitude\.getInstance", r"amplitude\.logEvent"],
        "id_pattern": None,
    },
    "mixpanel": {
        "name": "Mixpanel",
        "vendor": "Mixpanel",
        "type": "analytics",
        "privacy_risk": "high",
        "data_collected": ["Product events", "User profile", "Funnels"],
        "url_patterns": [r"cdn\.mxpnl\.com"],
        "source_patterns": [r"mixpanel\.init\s*\(", r"mixpanel\.track\s*\("],
        "id_pattern": None,
    },
    "fullstory": {
        "name": "FullStory",
        "vendor": "FullStory",
        "type": "heatmap",
        "privacy_risk": "critical",
        "data_collected": ["High-fidelity session recordings", "Console logs"],
        "url_patterns": [r"fullstory\.com/s/fs\.js", r"edge\.fullstory\.com"],
        "source_patterns": [r"FS\.identify\s*\(", r"_fs_debug"],
        "id_pattern": None,
    },
    "mouseflow": {
        "name": "Mouseflow",
        "vendor": "Mouseflow",
        "type": "heatmap",
        "privacy_risk": "critical",
        "data_collected": ["Screen recording", "Mouse movement", "Keystrokes"],
        "url_patterns": [r"cdn\.mouseflow\.com"],
        "source_patterns": [r"mouseflow\s*\(", r"_mfq\.push"],
        "id_pattern": None,
    },
    "heap": {
        "name": "Heap Analytics",
        "vendor": "Heap",
        "type": "analytics",
        "privacy_risk": "critical",
        "data_collected": ["Auto-tracking of all events", "Sessions", "User behaviour"],
        "url_patterns": [r"heapanalytics\.com"],
        "source_patterns": [r"heap\.load\s*\(", r"heap-analytics\.com"],
        "id_pattern": None,
    },
    "hubspot": {
        "name": "HubSpot",
        "vendor": "HubSpot",
        "type": "marketing",
        "privacy_risk": "high",
        "data_collected": ["Leads", "Forms", "Email tracking", "Chat"],
        "url_patterns": [r"js\.hs-scripts\.com", r"js\.hs-analytics\.net"],
        "source_patterns": [r"hbspt\.forms", r"hubspot"],
        "id_pattern": None,
    },
    "intercom": {
        "name": "Intercom",
        "vendor": "Intercom",
        "type": "support",
        "privacy_risk": "high",
        "data_collected": ["Chat messages", "Email", "User name", "Navigation data"],
        "url_patterns": [r"widget\.intercom\.io"],
        "source_patterns": [r"Intercom\s*\(", r"intercomSettings"],
        "id_pattern": None,
    },
    "cookiebot": {
        "name": "Cookiebot",
        "vendor": "Usercentrics",
        "type": "consent",
        "privacy_risk": "none",
        "data_collected": ["Consent preferences"],
        "url_patterns": [r"consent\.cookiebot\.com"],
        "source_patterns": [r"Cookiebot", r"CookieConsent"],
        "id_pattern": None,
    },
    "onetrust": {
        "name": "OneTrust",
        "vendor": "OneTrust",
        "type": "consent",
        "privacy_risk": "none",
        "data_collected": ["Consent preferences"],
        "url_patterns": [r"cdn\.cookielaw\.org", r"optanon\.net"],
        "source_patterns": [r"OptanonWrapper", r"OneTrust"],
        "id_pattern": None,
    },
    "didomi": {
        "name": "Didomi",
        "vendor": "Didomi",
        "type": "consent",
        "privacy_risk": "none",
        "data_collected": ["Consent preferences"],
        "url_patterns": [r"sdk\.privacy-center\.org"],
        "source_patterns": [r"Didomi\.ready", r"didomiConfig"],
        "id_pattern": None,
    },
    "usercentrics": {
        "name": "Usercentrics",
        "vendor": "Usercentrics",
        "type": "consent",
        "privacy_risk": "none",
        "data_collected": ["Consent preferences"],
        "url_patterns": [r"app\.usercentrics\.eu"],
        "source_patterns": [r"UC_UI", r"usercentrics\.eu"],
        "id_pattern": None,
    },
    "vwo": {
        "name": "VWO (Visual Website Optimizer)",
        "vendor": "Wingify",
        "type": "ab_testing",
        "privacy_risk": "high",
        "data_collected": ["Test variations", "Click recordings", "Visitor ID"],
        "url_patterns": [r"dev\.visualwebsiteoptimizer\.com"],
        "source_patterns": [r"_vwo_uuid", r"vwo\.event"],
        "id_pattern": None,
    },
    "optimizely": {
        "name": "Optimizely",
        "vendor": "Optimizely",
        "type": "ab_testing",
        "privacy_risk": "high",
        "data_collected": ["Experiments", "Event data", "User attributes"],
        "url_patterns": [r"cdn\.optimizely\.com"],
        "source_patterns": [r"optimizely\s*\(", r"window\.optimizely"],
        "id_pattern": None,
    },
    "crazyegg": {
        "name": "Crazy Egg",
        "vendor": "Crazy Egg",
        "type": "heatmap",
        "privacy_risk": "high",
        "data_collected": ["Heatmaps", "Session recordings"],
        "url_patterns": [r"script\.crazyegg\.com"],
        "source_patterns": [r"crazyegg"],
        "id_pattern": None,
    },
    "adobe_analytics": {
        "name": "Adobe Analytics",
        "vendor": "Adobe",
        "type": "analytics",
        "privacy_risk": "high",
        "data_collected": ["Pageviews", "Events", "eVars", "Props"],
        "url_patterns": [r"omtrdc\.net", r"sc\.omtrdc\.net"],
        "source_patterns": [r"AppMeasurement", r"s\.t\s*\(\)"],
        "id_pattern": None,
    },
    "zendesk": {
        "name": "Zendesk",
        "vendor": "Zendesk",
        "type": "support",
        "privacy_risk": "medium",
        "data_collected": ["Support tickets", "Email", "Chat history"],
        "url_patterns": [r"static\.zdassets\.com"],
        "source_patterns": [r"zE\s*\(", r"zESettings"],
        "id_pattern": None,
    },
    "criteo": {
        "name": "Criteo",
        "vendor": "Criteo",
        "type": "advertising",
        "privacy_risk": "critical",
        "data_collected": ["Retargeting", "Purchase behaviour", "Products viewed"],
        "url_patterns": [r"static\.criteo\.net", r"criteo\.com"],
        "source_patterns": [r"criteo_q\.push", r"Criteo\.events"],
        "id_pattern": None,
    },
    "klaviyo": {
        "name": "Klaviyo",
        "vendor": "Klaviyo",
        "type": "marketing",
        "privacy_risk": "high",
        "data_collected": ["E-commerce data", "Purchase behaviour tracking"],
        "url_patterns": [r"static\.klaviyo\.com"],
        "source_patterns": [r"klaviyo\s*\(", r"_learnq\.push"],
        "id_pattern": None,
    },
    "braze": {
        "name": "Braze",
        "vendor": "Braze",
        "type": "marketing",
        "privacy_risk": "high",
        "data_collected": ["Push notifications", "User attributes", "App events"],
        "url_patterns": [r"sdk\.braze\.com", r"braze\.com/api"],
        "source_patterns": [r"appboy\.initialize", r"braze\.initialize"],
        "id_pattern": None,
    },
    "pardot": {
        "name": "Salesforce Pardot",
        "vendor": "Salesforce",
        "type": "marketing",
        "privacy_risk": "high",
        "data_collected": ["B2B leads", "Scoring", "Email tracking"],
        "url_patterns": [r"pi\.pardot\.com"],
        "source_patterns": [r"piAId", r"pardot\.com/pd\.js"],
        "id_pattern": None,
    },
    "drift": {
        "name": "Drift",
        "vendor": "Drift",
        "type": "support",
        "privacy_risk": "high",
        "data_collected": ["Chat conversations", "Company identification (IP)"],
        "url_patterns": [r"js\.driftt\.com"],
        "source_patterns": [r"driftt\.push", r"drift\.on"],
        "id_pattern": None,
    },
}


def _extract_id(html: str, pattern: Optional[str]) -> Optional[str]:
    """Extract a vendor tracking ID from HTML using the vendor's ID pattern."""
    if not pattern:
        return None
    m = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
    if m:
        try:
            return m.group(1)
        except IndexError:
            return m.group(0)[:40]
    return None


def _find_line_number(html: str, position: int) -> int:
    return html[:position].count("\n") + 1


def _extract_source_block(html_lines: List[str], line_number: int, context: int = 3) -> Optional[str]:
    """Extract ± context lines around a given line number. Returns None if not possible."""
    if not html_lines or line_number < 1:
        return None
    start = max(0, line_number - 1 - context)
    end   = min(len(html_lines), line_number + context)
    return "\n".join(html_lines[start:end])


def detect_tags(html: str, scan=None) -> List[TagFinding]:
    """
    Multi-method tag detection engine.
    Returns de-duplicated list of TagFinding objects ordered by source position.

    Layers:
      1. HTML script src URL match (HIGH)
      2. HTML source pattern match (MEDIUM)
      3. Network request interception (HIGH) — from BrowserScanResult
      4. Window global key detection (MEDIUM) — from BrowserScanResult
    """
    if not html:
        html = ""

    soup = BeautifulSoup(html, "html.parser")
    html_lines = html.split("\n")

    # Collect all external script src attributes
    script_srcs: List[tuple] = []  # (src, position_in_html, line_number)
    for script in soup.find_all("script", src=True):
        src = script.get("src", "")
        escaped = re.escape(src[:50])
        m = re.search(escaped, html)
        pos = m.start() if m else 0
        line = _find_line_number(html, pos)
        script_srcs.append((src, pos, line))

    # Also add browser-captured script URLs (loaded dynamically)
    if scan and hasattr(scan, "all_script_urls"):
        for src in scan.all_script_urls:
            script_srcs.append((src, 0, None))

    findings: dict[str, TagFinding] = {}   # keyed by vendor id

    for vendor_id, vendor in VENDOR_CATALOG.items():
        best_confidence = None
        best_method = None
        best_position = 0
        best_line = None
        best_block = None
        best_pattern_matched = None
        occurrence_count = 0

        # ── 1. URL-based detection (HIGH confidence) ─────────────────────────
        for url_pat in vendor.get("url_patterns", []):
            for src, pos, line in script_srcs:
                if re.search(url_pat, src, re.IGNORECASE):
                    occurrence_count += 1
                    if best_confidence != CONFIDENCE_HIGH:
                        best_confidence = CONFIDENCE_HIGH
                        best_method = DETECT_SCRIPT_URL
                        best_position = pos
                        best_line = line
                        best_block = _extract_source_block(html_lines, line) if line else None
                        best_pattern_matched = src[:80]

        # ── 2. Source pattern detection (MEDIUM confidence) ───────────────────
        for src_pat in vendor.get("source_patterns", []):
            matches = list(re.finditer(src_pat, html, re.IGNORECASE))
            if matches:
                for m in matches:
                    pos = m.start()
                    line = _find_line_number(html, pos)
                    occurrence_count += 1
                    if best_confidence is None:
                        best_confidence = CONFIDENCE_MEDIUM
                        best_method = DETECT_SOURCE
                        best_position = pos
                        best_line = line
                        best_block = _extract_source_block(html_lines, line)
                        best_pattern_matched = m.group(0)[:80]

        # ── 3. Network request detection (HIGH confidence) ────────────────────
        if scan and hasattr(scan, "intercepted_requests"):
            for req in scan.intercepted_requests:
                for url_pat in vendor.get("url_patterns", []):
                    if re.search(url_pat, req.url, re.IGNORECASE):
                        occurrence_count += 1
                        # Network = conclusive proof the tag fired — always HIGH
                        best_confidence = CONFIDENCE_HIGH
                        best_method = DETECT_NETWORK
                        if not best_pattern_matched:
                            best_pattern_matched = req.url[:80]
                        break

        # Skip if no match found at all
        if best_confidence is None:
            continue

        # Deduplicate occurrence_count
        occurrence_count = max(1, occurrence_count // 2 if occurrence_count > 2 else occurrence_count)

        # Extract tag ID from HTML
        tag_id = _extract_id(html, vendor.get("id_pattern"))

        finding = TagFinding(
            id=vendor_id,
            name=vendor["name"],
            vendor=vendor["vendor"],
            type=vendor["type"],
            confidence=best_confidence,
            detection_method=best_method,
            occurrence_count=occurrence_count,
            line_number=best_line,
            source_block=best_block,
            matched_pattern=best_pattern_matched,
            tag_id=tag_id,
            data_collected=vendor["data_collected"],
            privacy_risk=vendor["privacy_risk"],
            position=best_position,
        )

        findings[vendor_id] = finding

    # Sort by source position (network-intercepted go after HTML-detected)
    return sorted(findings.values(), key=lambda f: f.position)

