"""
Vendor catalog.

Signature classes (and the strength of the claim each one supports):

* ``beacon``  — a network request to a known *collection* endpoint.
                Supports: "data collection request observed" (observed_firing = True).
* ``script``  — a known library/container URL was requested/loaded.
                Supports: "script present/loaded". Does NOT prove data was sent.
* ``html``    — a specific code signature in HTML source (e.g. ``fbq('init', ...)``).
                Supports: "implementation code present in source" (medium confidence).
* ``globals`` — a JS global defined at runtime (e.g. ``window.fbq``). Medium confidence.

Generic words (a vendor name appearing in page text, a link to vendor.com ...)
are deliberately NOT signatures.

Each entry also lists ``id_from`` extractors that only pull identifiers from
places where they are unambiguous (URL parameters of the vendor's own endpoints
or code calls), never from arbitrary text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Pattern, Tuple

CATEGORIES = {
    "tag_manager": "Tag manager",
    "google_tag": "Google tag (gtag.js)",
    "analytics": "Analytics",
    "advertising": "Advertising / conversion",
    "session_replay": "Session replay / heatmap",
    "experimentation": "A/B testing / personalization",
    "marketing_automation": "Marketing automation / CRM",
    "cdp": "Customer data platform",
    "cmp": "Consent management platform",
}


@dataclass
class Vendor:
    id: str
    name: str
    company: str
    category: str
    script: List[str] = field(default_factory=list)
    beacon: List[str] = field(default_factory=list)
    html: List[str] = field(default_factory=list)
    globals: List[str] = field(default_factory=list)
    # (where, regex, prefix) where ∈ {"url", "html"}; group(1) is the id; prefix prepended when set
    id_from: List[Tuple[str, str, str]] = field(default_factory=list)
    docs: Optional[str] = None
    # compiled
    _script: List[Pattern] = field(default_factory=list, repr=False)
    _beacon: List[Pattern] = field(default_factory=list, repr=False)
    _html: List[Pattern] = field(default_factory=list, repr=False)
    _ids: List[Tuple[str, Pattern, str]] = field(default_factory=list, repr=False)

    def compile(self) -> "Vendor":
        self._script = [re.compile(p, re.I) for p in self.script]
        self._beacon = [re.compile(p, re.I) for p in self.beacon]
        self._html = [re.compile(p, re.I) for p in self.html]
        self._ids = [(w, re.compile(p, re.I if w == "url" else 0), pre) for w, p, pre in self.id_from]
        return self

    def match_script(self, url: str) -> bool:
        return any(p.search(url) for p in self._script)

    def match_beacon(self, url: str) -> bool:
        return any(p.search(url) for p in self._beacon)

    def html_matches(self, html: str):
        for p in self._html:
            for m in p.finditer(html):
                yield p.pattern, m

    def extract_ids(self, text: str, where: str) -> List[str]:
        out = []
        for w, p, pre in self._ids:
            if w != where:
                continue
            for m in p.finditer(text):
                val = (m.group(1) if m.groups() else m.group(0)).strip()
                if val:
                    val = (pre + val) if pre and not val.upper().startswith(pre.upper()) else val
                    if val not in out:
                        out.append(val)
        return out


_GA4_ID = r"(G-[A-Z0-9]{6,12})"

VENDORS: List[Vendor] = [
    Vendor("gtm", "Google Tag Manager", "Google", "tag_manager",
           script=[r"googletagmanager\.com/gtm\.js", r"/gtm\.js\?(?:[^#]*&)?id=GTM-"],
           html=[r"googletagmanager\.com/gtm\.js", r"googletagmanager\.com/ns\.html\?id=GTM-"],
           # window.google_tag_manager is also created by gtag.js, so it is NOT a GTM signature by itself;
           # GTM container ids are read from its keys at runtime instead (see collector/normalize).
           id_from=[("url", r"[?&]id=(GTM-[A-Z0-9]{4,10})\b", ""),
                    ("html", r"googletagmanager\.com/(?:gtm\.js|ns\.html)\?id=(GTM-[A-Z0-9]{4,10})\b", ""),
                    ("html", r"\(\s*window\s*,\s*document\s*,\s*['\"]script['\"]\s*,\s*['\"]dataLayer['\"]\s*,\s*['\"](GTM-[A-Z0-9]{4,10})['\"]", "")],
           docs="https://developers.google.com/tag-platform/tag-manager"),
    Vendor("google_tag", "Google tag (gtag.js)", "Google", "google_tag",
           script=[r"googletagmanager\.com/gtag/js", r"/gtag/js\?(?:[^#]*&)?id=(?:G|AW|DC|GT)-"],
           html=[r"googletagmanager\.com/gtag/js", r"gtag\s*\(\s*['\"]config['\"]"],
           globals=["gtag"],
           id_from=[("url", r"/gtag/js\?(?:[^#]*&)?id=((?:G|AW|DC|GT)-[A-Z0-9\-]{4,14})\b", "")],
           docs="https://developers.google.com/tag-platform/gtagjs"),
    Vendor("ga4", "Google Analytics 4", "Google", "analytics",
           script=[r"/gtag/js\?(?:[^#]*&)?id=G-"],
           beacon=[r"/g/collect\?(?:[^#]*&)?tid=G-", r"(?:^|[/.])(?:region\d+\.)?(?:google-analytics|analytics\.google)\.com/g/collect",
                   # GA4 hits sent through a first-party path (Google tag gateway / server-side GTM),
                   # e.g. https://www.site.com/abc123/ag/g/c?v=2&tid=G-XXXX&en=page_view
                   r"\?v=2&(?:[^#]*&)?tid=G-[A-Z0-9]{6,12}(?:&|$)"],
           html=[r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"]G-[A-Z0-9]{6,12}['\"]"],
           id_from=[("url", r"[?&]tid=" + _GA4_ID + r"\b", ""),
                    ("url", r"/gtag/js\?(?:[^#]*&)?id=" + _GA4_ID + r"\b", ""),
                    ("html", r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"]" + _GA4_ID + r"['\"]", "")],
           docs="https://developers.google.com/analytics/devguides/collection/ga4"),
    Vendor("universal_analytics", "Universal Analytics (legacy)", "Google", "analytics",
           script=[r"google-analytics\.com/analytics\.js", r"google-analytics\.com/ga\.js"],
           beacon=[r"google-analytics\.com/(?:r/)?collect\?(?:[^#]*&)?v=1\b", r"google-analytics\.com/__utm\.gif"],
           html=[r"ga\s*\(\s*['\"]create['\"]\s*,\s*['\"]UA-\d{4,10}-\d{1,3}['\"]"],
           id_from=[("url", r"[?&]tid=(UA-\d{4,10}-\d{1,3})\b", ""),
                    ("html", r"ga\s*\(\s*['\"]create['\"]\s*,\s*['\"](UA-\d{4,10}-\d{1,3})['\"]", "")],
           docs="https://support.google.com/analytics/answer/11583528"),
    Vendor("google_ads", "Google Ads", "Google", "advertising",
           script=[r"googleadservices\.com/pagead/conversion(?:_async)?\.js", r"/gtag/js\?(?:[^#]*&)?id=AW-"],
           beacon=[r"googleads\.g\.doubleclick\.net/pagead/(?:viewthroughconversion|conversion)/",
                   r"google\.[a-z.]+/pagead/1p-(?:conversion|user-list)/",
                   r"googleadservices\.com/pagead/conversion/",
                   r"google\.com/ccm/collect"],
           html=[r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"]AW-\d{6,12}['\"]"],
           id_from=[("url", r"/(?:viewthroughconversion|conversion|1p-conversion|1p-user-list)/(\d{6,12})/", "AW-"),
                    ("url", r"/gtag/js\?(?:[^#]*&)?id=(AW-\d{6,12})\b", ""),
                    ("html", r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"](AW-\d{6,12})['\"]", "")],
           docs="https://support.google.com/google-ads/answer/7548399"),
    Vendor("floodlight", "Google Floodlight (Campaign Manager 360)", "Google", "advertising",
           beacon=[r"(?:\d+\.)?fls\.doubleclick\.net/activity", r"ad\.doubleclick\.net/activity"],
           html=[r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"]DC-\d{6,12}['\"]"],
           id_from=[("url", r"[;?&]src=(\d{5,12})", "DC-")],
           docs="https://support.google.com/campaignmanager/answer/7554821"),
    Vendor("meta_pixel", "Meta Pixel", "Meta", "advertising",
           script=[r"connect\.facebook\.net/[a-z_A-Z]+/fbevents\.js", r"connect\.facebook\.net/signals/config/\d+"],
           beacon=[r"(?:www\.)?facebook\.com/tr/?\?", r"(?:www\.)?facebook\.com/tr/?$"],
           html=[r"fbq\s*\(\s*['\"]init['\"]\s*,\s*['\"]\d{8,20}['\"]", r"connect\.facebook\.net/[a-z_A-Z]+/fbevents\.js"],
           globals=["fbq"],
           id_from=[("url", r"facebook\.com/tr/?\?(?:[^#]*&)?id=(\d{8,20})\b", ""),
                    ("url", r"connect\.facebook\.net/signals/config/(\d{8,20})", ""),
                    ("html", r"fbq\s*\(\s*['\"]init['\"]\s*,\s*['\"](\d{8,20})['\"]", "")],
           docs="https://developers.facebook.com/docs/meta-pixel"),
    Vendor("tiktok_pixel", "TikTok Pixel", "TikTok", "advertising",
           script=[r"analytics\.tiktok\.com/i18n/pixel/(?:events|sdk)\.js"],
           beacon=[r"analytics\.tiktok\.com/api/v\d/(?:pixel|monitor)"],
           html=[r"ttq\.load\s*\(\s*['\"][A-Z0-9]{10,30}['\"]"],
           globals=["ttq"],
           id_from=[("url", r"[?&]sdkid=([A-Z0-9]{10,30})\b", ""),
                    ("html", r"ttq\.load\s*\(\s*['\"]([A-Z0-9]{10,30})['\"]", "")],
           docs="https://ads.tiktok.com/help/article/tiktok-pixel"),
    Vendor("linkedin_insight", "LinkedIn Insight Tag", "LinkedIn", "advertising",
           script=[r"snap\.licdn\.com/li\.lms-analytics/insight\.(?:min\.)?js"],
           beacon=[r"px\.ads\.linkedin\.com/(?:collect|wa|attribution_trigger)", r"dc\.ads\.linkedin\.com/collect"],
           html=[r"_linkedin_partner_id\s*=\s*['\"]?\d+"],
           globals=["lintrk"],
           id_from=[("url", r"[?&]pid=(\d{3,12})\b", ""),
                    ("html", r"_linkedin_partner_id\s*=\s*['\"]?(\d{3,12})", "")],
           docs="https://www.linkedin.com/help/lms/answer/a418880"),
    Vendor("microsoft_uet", "Microsoft Advertising UET", "Microsoft", "advertising",
           script=[r"bat\.bing\.com/bat\.js"],
           beacon=[r"bat\.bing\.com/action/"],
           html=[r"new\s+UET\s*\(", r"bat\.bing\.com/bat\.js"],
           id_from=[("url", r"bat\.bing\.com/action/0\?(?:[^#]*&)?ti=(\d{4,12})\b", "")],
           docs="https://help.ads.microsoft.com/#apex/ads/en/56682/2"),
    Vendor("pinterest_tag", "Pinterest Tag", "Pinterest", "advertising",
           script=[r"s\.pinimg\.com/ct/core\.js"], beacon=[r"ct\.pinterest\.com/(?:v3|user)/"],
           html=[r"pintrk\s*\(\s*['\"]load['\"]"], globals=["pintrk"],
           docs="https://help.pinterest.com/en/business/article/install-the-pinterest-tag"),
    Vendor("x_pixel", "X (Twitter) Pixel", "X", "advertising",
           script=[r"static\.ads-twitter\.com/uwt\.js"], beacon=[r"(?:analytics\.twitter\.com|t\.co)/i/adsct", r"ads-api\.x\.com/"],
           html=[r"twq\s*\(\s*['\"](?:init|config)['\"]"], globals=["twq"],
           docs="https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites"),
    Vendor("hotjar", "Hotjar", "Contentsquare", "session_replay",
           script=[r"static\.hotjar\.com/c/hotjar-\d+\.js", r"script\.hotjar\.com/modules"],
           beacon=[r"(?:^|//)(?:in|insights|vc|content|metrics)\.hotjar\.(?:com|io)/", r"(?:^|//)ws\d*\.hotjar\.com/"],
           html=[r"hjid\s*:\s*\d{4,}", r"static\.hotjar\.com/c/hotjar-"],
           globals=["hj"],
           id_from=[("url", r"static\.hotjar\.com/c/hotjar-(\d{4,})\.js", ""), ("html", r"hjid\s*:\s*(\d{4,})", "")],
           docs="https://help.hotjar.com/hc/en-us/articles/115009336727"),
    Vendor("clarity", "Microsoft Clarity", "Microsoft", "session_replay",
           script=[r"(?:www\.)?clarity\.ms/tag/[a-z0-9]+", r"scripts\.clarity\.ms/"],
           beacon=[r"[a-z]\.clarity\.ms/collect"],
           html=[r"clarity\.ms/tag/['\"]?\s*\+?\s*", r"\(\s*window\s*,\s*document\s*,\s*['\"]clarity['\"]\s*,\s*['\"]script['\"]\s*,\s*['\"][a-z0-9]{6,}['\"]"],
           globals=["clarity"],
           id_from=[("url", r"clarity\.ms/tag/([a-z0-9]{6,})", ""),
                    ("html", r"['\"]clarity['\"]\s*,\s*['\"]script['\"]\s*,\s*['\"]([a-z0-9]{6,})['\"]", "")],
           docs="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup"),
    Vendor("fullstory", "FullStory", "FullStory", "session_replay",
           script=[r"edge\.fullstory\.com/s/fs\.js", r"fullstory\.com/s/fs\.js"],
           beacon=[r"rs\.fullstory\.com/rec/"], html=[r"window\['_fs_org'\]\s*=", r"_fs_org\s*="],
           docs="https://developer.fullstory.com/browser/getting-started/"),
    Vendor("segment", "Segment", "Twilio", "cdp",
           script=[r"cdn\.segment\.com/analytics\.js/v1/[A-Za-z0-9]+/analytics(?:\.min)?\.js", r"cdn\.segment\.com/analytics-next/"],
           beacon=[r"api\.segment\.io/v1/(?:t|p|i|g|track|page|identify|batch|m)\b"],
           html=[r"analytics\.load\s*\(\s*['\"][A-Za-z0-9]{10,}['\"]"],
           id_from=[("url", r"cdn\.segment\.com/analytics\.js/v1/([A-Za-z0-9]{10,})/", "")],
           docs="https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/"),
    Vendor("amplitude", "Amplitude", "Amplitude", "analytics",
           script=[r"cdn\.amplitude\.com/(?:libs|script)/"],
           beacon=[r"api2?\.amplitude\.com/(?:2/httpapi|batch)?", r"api\.eu\.amplitude\.com/"],
           html=[r"amplitude\.(?:getInstance\(\)\.init|init)\s*\(\s*['\"][a-f0-9]{32}['\"]"],
           docs="https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2"),
    Vendor("mixpanel", "Mixpanel", "Mixpanel", "analytics",
           script=[r"cdn4?\.mxpnl\.com/libs/mixpanel", r"cdn\.mxpnl\.com/libs/"],
           beacon=[r"api(?:-js)?(?:\.eu)?\.mixpanel\.com/(?:track|engage|groups|record)"],
           html=[r"mixpanel\.init\s*\(\s*['\"][a-f0-9]{32}['\"]"], globals=["mixpanel"],
           docs="https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript"),
    Vendor("heap", "Heap", "Contentsquare", "analytics",
           script=[r"cdn\.heapanalytics\.com/js/heap-\d+\.js"], beacon=[r"heapanalytics\.com/(?:h|api/track)"],
           html=[r"heap\.load\s*\(\s*['\"]\d+['\"]"],
           docs="https://developers.heap.io/docs/web"),
    Vendor("adobe_launch", "Adobe Experience Platform Tags (Launch)", "Adobe", "tag_manager",
           script=[r"assets\.adobedtm\.com/"], html=[r"assets\.adobedtm\.com/"], globals=["_satellite"],
           docs="https://experienceleague.adobe.com/en/docs/experience-platform/tags/home"),
    Vendor("adobe_analytics", "Adobe Analytics", "Adobe", "analytics",
           script=[r"/AppMeasurement(?:\.min)?\.js"],
           beacon=[r"\.(?:omtrdc\.net|2o7\.net)/b/ss/", r"/b/ss/[^/]+/\d+/"],
           html=[r"s_gi\s*\(\s*['\"][^'\"]+['\"]\s*\)"], globals=["s_c_il"],
           docs="https://experienceleague.adobe.com/en/docs/analytics/implementation/home"),
    Vendor("optimizely", "Optimizely", "Optimizely", "experimentation",
           script=[r"cdn\.optimizely\.com/js/\d+\.js", r"cdn\.optimizely\.com/public/"],
           beacon=[r"logx\.optimizely\.com/"], globals=["optimizely"],
           id_from=[("url", r"cdn\.optimizely\.com/js/(\d+)\.js", "")],
           docs="https://docs.developers.optimizely.com/web-experimentation/docs"),
    Vendor("vwo", "VWO", "Wingify", "experimentation",
           script=[r"dev\.visualwebsiteoptimizer\.com/(?:j|lib|settings|tag)"],
           beacon=[r"\.visualwebsiteoptimizer\.com/(?:ee|c|l)\.gif", r"dev\.visualwebsiteoptimizer\.com/events/"],
           html=[r"_vwo_code\s*=", r"window\._vwo_code"], globals=["_vwo_code"],
           docs="https://developers.vwo.com/"),
    Vendor("criteo", "Criteo OneTag", "Criteo", "advertising",
           script=[r"static\.criteo\.net/js/ld/ld\.js", r"dynamic\.criteo\.com/js/ld/"],
           beacon=[r"(?:sslwidget|widget|dis|gum)\.criteo\.com/"],
           html=[r"window\.criteo_q\s*=\s*window\.criteo_q", r"criteo_q\.push\s*\("],
           docs="https://help.criteo.com/kb/guide/en/all-criteo-onetag-events-and-parameters-vZbzbEeY86/"),
    Vendor("taboola", "Taboola Pixel", "Taboola", "advertising",
           script=[r"cdn\.taboola\.com/libtrc/"], beacon=[r"trc(?:-events)?\.taboola\.com/"],
           html=[r"window\._tfa\s*=\s*window\._tfa"],
           docs="https://help.taboola.com/hc/en-us/articles/360003290913"),
    Vendor("outbrain", "Outbrain Pixel", "Outbrain", "advertising",
           script=[r"amplify\.outbrain\.com/cp/obtp\.js"], beacon=[r"tr\.outbrain\.com/"],
           html=[r"obApi\s*\(\s*['\"]track['\"]", r"OB_ADV_ID\s*="],
           docs="https://www.outbrain.com/help/advertisers/outbrain-pixel/"),
    Vendor("hubspot", "HubSpot tracking code", "HubSpot", "marketing_automation",
           script=[r"js(?:-[a-z0-9]+)?\.hs-scripts\.com/\d+\.js", r"js(?:-[a-z0-9]+)?\.hs-analytics\.net/analytics/"],
           beacon=[r"track(?:-[a-z0-9]+)?\.hubspot\.com/__pt?\.gif"],
           html=[r"js(?:-[a-z0-9]+)?\.hs-scripts\.com/\d+\.js"], globals=["_hsq"],
           id_from=[("url", r"hs-scripts\.com/(\d+)\.js", ""), ("html", r"hs-scripts\.com/(\d+)\.js", "")],
           docs="https://knowledge.hubspot.com/reports/install-the-hubspot-tracking-code"),
    Vendor("klaviyo", "Klaviyo", "Klaviyo", "marketing_automation",
           script=[r"static(?:-tracking)?\.klaviyo\.com/onsite/js/"],
           beacon=[r"a\.klaviyo\.com/(?:api/|client/)?(?:track|identify|events|profiles)"],
           html=[r"klaviyo\.js\?company_id=[A-Za-z0-9]+"], globals=["klaviyo"],
           id_from=[("url", r"company_id=([A-Za-z0-9]{4,10})\b", "")],
           docs="https://developers.klaviyo.com/en/docs/javascript_api"),
    # ── consent management platforms ────────────────────────────────────────
    Vendor("cookiebot", "Cookiebot", "Usercentrics", "cmp",
           script=[r"consent(?:cdn)?\.cookiebot\.(?:com|eu)/"], html=[r"consent\.cookiebot\.(?:com|eu)/uc\.js"],
           globals=["Cookiebot"], docs="https://www.cookiebot.com/en/developer/"),
    Vendor("onetrust", "OneTrust", "OneTrust", "cmp",
           script=[r"cdn\.cookielaw\.org/", r"optanon\.blob\.core\.windows\.net/", r"cookie-cdn\.cookiepro\.com/"],
           html=[r"cdn\.cookielaw\.org/scripttemplates/otSDKStub\.js", r"function\s+OptanonWrapper\s*\("],
           globals=["OneTrust", "Optanon"], docs="https://developer.onetrust.com/onetrust/docs"),
    Vendor("didomi", "Didomi", "Didomi", "cmp",
           script=[r"sdk\.privacy-center\.org/"], html=[r"sdk\.privacy-center\.org/", r"window\.didomiConfig\s*="],
           globals=["Didomi"], docs="https://developers.didomi.io/"),
    Vendor("usercentrics", "Usercentrics", "Usercentrics", "cmp",
           script=[r"app\.usercentrics\.eu/", r"web\.cmp\.usercentrics\.eu/"],
           html=[r"app\.usercentrics\.eu/browser-ui/", r"web\.cmp\.usercentrics\.eu/"],
           globals=["UC_UI", "__ucCmp"], docs="https://docs.usercentrics.com/"),
    Vendor("cookieyes", "CookieYes", "CookieYes", "cmp",
           script=[r"cdn-cookieyes\.com/"], html=[r"cdn-cookieyes\.com/client_data/"],
           docs="https://www.cookieyes.com/documentation/"),
    Vendor("iubenda", "iubenda", "iubenda", "cmp",
           script=[r"cdn\.iubenda\.com/cs/"], html=[r"_iub\.csConfiguration\s*="], globals=["_iub"],
           docs="https://www.iubenda.com/en/help/1205-how-to-configure-your-cookie-solution-advanced-guide"),
    Vendor("adopt", "AdOpt", "AdOpt", "cmp",
           script=[r"tag\.goadopt\.io/"], html=[r"tag\.goadopt\.io/injector\.js"],
           docs="https://goadopt.io/"),
    Vendor("termly", "Termly", "Termly", "cmp",
           script=[r"app\.termly\.io/(?:embed|resource-blocker)"], docs="https://help.termly.io/"),
    Vendor("quantcast_choice", "Quantcast Choice", "Quantcast", "cmp",
           script=[r"cmp\.quantcast\.com/choice/"], docs="https://help.quantcast.com/hc/en-us/categories/360002940873"),
    Vendor("trustarc", "TrustArc", "TrustArc", "cmp",
           script=[r"consent\.trustarc\.com/"], docs="https://trustarc.com/"),
    Vendor("osano", "Osano", "Osano", "cmp",
           script=[r"cmp\.osano\.com/"], globals=["Osano"], docs="https://developers.osano.com/"),
    Vendor("cookiefirst", "CookieFirst", "CookieFirst", "cmp",
           script=[r"consent\.cookiefirst\.com/"], docs="https://support.cookiefirst.com/"),
    Vendor("axeptio", "Axeptio", "Axeptio", "cmp",
           script=[r"static\.axept\.io/"], docs="https://developers.axeptio.eu/"),
    Vendor("sourcepoint", "Sourcepoint", "Sourcepoint", "cmp",
           script=[r"cdn\.privacy-mgmt\.com/"], docs="https://docs.sourcepoint.com/"),
    Vendor("complianz", "Complianz (WordPress)", "Complianz", "cmp",
           script=[r"/wp-content/plugins/complianz-gdpr(?:-premium)?/"], html=[r"complianz-gdpr(?:-premium)?/cookiebanner/"],
           docs="https://complianz.io/docs/"),
]

for _v in VENDORS:
    _v.compile()

BY_ID: Dict[str, Vendor] = {v.id: v for v in VENDORS}

# placeholder / example identifiers that must never be reported as real IDs
_PLACEHOLDER_ID_RE = re.compile(
    r"^(?:G|GTM|AW|UA|DC|GT)-(?:X+|0+|1234567890?|YOUR\w*|[A-Z0-9]*XXXX[A-Z0-9]*)(?:-\d+)?$|^(\d)\1{7,}$",
    re.I,
)


def is_placeholder_id(value: str) -> bool:
    if not value:
        return True
    v = value.strip().upper()
    if _PLACEHOLDER_ID_RE.match(v):
        return True
    core = re.sub(r"^(?:G|GTM|AW|UA|DC|GT)-", "", v)
    return len(set(core.replace("-", ""))) <= 1


TRACKING_CATEGORIES = {"analytics", "advertising", "session_replay", "experimentation",
                       "marketing_automation", "cdp"}


def vendors_for_url(url: str) -> List[Tuple[Vendor, str]]:
    """Return [(vendor, 'beacon'|'script')] matches for a request URL. Beacon wins over script."""
    out = []
    for v in VENDORS:
        if v.match_beacon(url):
            out.append((v, "beacon"))
        elif v.match_script(url):
            out.append((v, "script"))
    return out
