"""
CMP adapters for consent interaction.

Strategy order per phase:
  1. Known adapter UI selectors (real trusted click)            method="ui_click"
  2. Generic button text inside a cookie/consent container       method="ui_click_generic"
  3. Known CMP JavaScript API (only for known CMPs)              method="cmp_api"
If none works -> ``manual_verification_required``. We never claim an
interaction happened unless it was verified (banner hidden or CMP API state).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class CmpAdapter:
    id: str
    detect_js: str                    # JS expression -> truthy when CMP present
    banner_selectors: List[str]
    reject_selectors: List[str]
    accept_selectors: List[str]
    api_reject_js: Optional[str] = None
    api_accept_js: Optional[str] = None
    state_js: Optional[str] = None    # JS expression returning a small JSON-able decision summary


ADAPTERS: List[CmpAdapter] = [
    CmpAdapter(
        id="cookiebot",
        detect_js="typeof window.Cookiebot !== 'undefined'",
        banner_selectors=["#CybotCookiebotDialog"],
        reject_selectors=["#CybotCookiebotDialogBodyButtonDecline", "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll"],
        accept_selectors=["#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "#CybotCookiebotDialogBodyButtonAccept"],
        api_reject_js="window.Cookiebot && window.Cookiebot.decline && window.Cookiebot.decline()",
        api_accept_js="window.Cookiebot && window.Cookiebot.submitCustomConsent && window.Cookiebot.submitCustomConsent(true,true,true)",
        state_js="window.Cookiebot ? {hasResponse: !!Cookiebot.hasResponse, declined: !!Cookiebot.declined, consented: !!Cookiebot.consented, statistics: !!(Cookiebot.consent||{}).statistics, marketing: !!(Cookiebot.consent||{}).marketing} : null",
    ),
    CmpAdapter(
        id="onetrust",
        detect_js="typeof window.OneTrust !== 'undefined' || !!document.querySelector('#onetrust-banner-sdk')",
        banner_selectors=["#onetrust-banner-sdk", "#onetrust-consent-sdk .ot-sdk-container"],
        reject_selectors=["#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler"],
        accept_selectors=["#onetrust-accept-btn-handler", "#accept-recommended-btn-handler"],
        api_reject_js="window.OneTrust && window.OneTrust.RejectAll && window.OneTrust.RejectAll()",
        api_accept_js="window.OneTrust && window.OneTrust.AllowAll && window.OneTrust.AllowAll()",
        state_js="(typeof window.OnetrustActiveGroups === 'string') ? {activeGroups: window.OnetrustActiveGroups, alertClosed: !!(window.OneTrust && OneTrust.IsAlertBoxClosed && OneTrust.IsAlertBoxClosed())} : null",
    ),
    CmpAdapter(
        id="didomi",
        detect_js="typeof window.Didomi !== 'undefined' || !!document.querySelector('#didomi-host')",
        banner_selectors=["#didomi-notice", "#didomi-popup"],
        reject_selectors=["#didomi-notice-disagree-button", ".didomi-continue-without-agreeing"],
        accept_selectors=["#didomi-notice-agree-button"],
        api_reject_js="window.Didomi && window.Didomi.setUserDisagreeToAll && window.Didomi.setUserDisagreeToAll()",
        api_accept_js="window.Didomi && window.Didomi.setUserAgreeToAll && window.Didomi.setUserAgreeToAll()",
        state_js="(window.Didomi && Didomi.getUserStatus) ? (function(s){return {purposesEnabled:(s.purposes&&s.purposes.global&&s.purposes.global.enabled||[]).length, purposesDisabled:(s.purposes&&s.purposes.global&&s.purposes.global.disabled||[]).length}})(Didomi.getUserStatus()) : null",
    ),
    CmpAdapter(
        id="usercentrics",
        detect_js="typeof window.UC_UI !== 'undefined' || typeof window.__ucCmp !== 'undefined' || !!document.querySelector('#usercentrics-root, #usercentrics-cmp-ui')",
        banner_selectors=["#usercentrics-root", "#usercentrics-cmp-ui"],
        reject_selectors=["[data-testid='uc-deny-all-button']", "#deny"],
        accept_selectors=["[data-testid='uc-accept-all-button']", "#accept"],
        api_reject_js="(window.UC_UI && UC_UI.denyAllConsents && UC_UI.denyAllConsents()) || (window.__ucCmp && __ucCmp.denyAllConsents && __ucCmp.denyAllConsents())",
        api_accept_js="(window.UC_UI && UC_UI.acceptAllConsents && UC_UI.acceptAllConsents()) || (window.__ucCmp && __ucCmp.acceptAllConsents && __ucCmp.acceptAllConsents())",
        state_js="(window.UC_UI && UC_UI.areAllConsentsAccepted) ? {allAccepted: !!UC_UI.areAllConsentsAccepted()} : null",
    ),
    CmpAdapter(
        id="cookieyes",
        detect_js="!!document.querySelector('.cky-consent-container, #cookie-law-info-bar')",
        banner_selectors=[".cky-consent-container", "#cookie-law-info-bar"],
        reject_selectors=[".cky-btn-reject", "#cookie_action_close_header_reject"],
        accept_selectors=[".cky-btn-accept", "#cookie_action_close_header"],
    ),
    CmpAdapter(
        id="iubenda",
        detect_js="typeof window._iub !== 'undefined' && !!window._iub.cs",
        banner_selectors=["#iubenda-cs-banner"],
        reject_selectors=[".iubenda-cs-reject-btn"],
        accept_selectors=[".iubenda-cs-accept-btn"],
    ),
    CmpAdapter(
        id="complianz",
        detect_js="!!document.querySelector('.cmplz-cookiebanner')",
        banner_selectors=[".cmplz-cookiebanner"],
        reject_selectors=[".cmplz-cookiebanner .cmplz-deny"],
        accept_selectors=[".cmplz-cookiebanner .cmplz-accept"],
    ),
    CmpAdapter(
        id="adopt",
        detect_js="!!document.querySelector('#adopt-controller-button, #adopt-banner, [id^=adopt]')",
        banner_selectors=["#cookie-banner[class*='adopt-']", "#adopt-banner", "[id^='adopt-'][role='dialog']"],
        reject_selectors=["#adopt-reject-all-button", "[id^='adopt'] button[data-reject]"],
        accept_selectors=["#adopt-accept-all-button", "[id^='adopt'] button[data-accept]"],
    ),
]

# Generic button text (trimmed, case-insensitive). Kept strict on purpose.
REJECT_TEXT_RE = (
    r"^\s*(?:(?:rejeitar|recusar|negar|reject|decline|deny|refuse|rechazar|refuser|ablehnen)"
    r"(?:\s+(?:all|todos|todas|tudo|tout|alle|todo|os|as|cookies|all\s+cookies|opcionais|n[aã]o\s+essenciais|optional\s+cookies|non-essential(?:\s+cookies)?))*"
    r"|(?:apenas|somente|s[oó])\s+(?:os\s+)?(?:necess[aá]rios|essenciais)"
    r"|(?:only|strictly)\s+necessary(?:\s+cookies)?|necessary\s+(?:cookies\s+)?only"
    r"|use\s+necessary\s+cookies\s+only|continuar\s+sem\s+aceitar|continue\s+without\s+accepting)\s*$"
)
ACCEPT_TEXT_RE = (
    r"^\s*(?:(?:aceitar|accept|allow|permitir|aceptar|accepter|akzeptieren|concordo|agree|i\s+agree|aceito)"
    r"(?:\s+(?:all|todos|todas|tudo|tout|alle|todo|os|as|cookies|all\s+cookies|e\s+continuar|and\s+continue|and\s+close))*"
    r"|allow\s+all(?:\s+cookies)?|permitir\s+todos)\s*$"
)
CONSENT_CONTAINER_HINT = r"cookie|consent|cmp|gdpr|lgpd|privacy|privacidade|banner|didomi|onetrust|cybot|usercentrics|adopt|cky|cmplz|iubenda"

# JS that marks the first visible candidate button matching text inside a consent-like container.
# Walks open shadow roots. Returns {found, text} and tags element with data-dt-target.
FIND_GENERIC_BUTTON_JS = r"""
(args) => {
  const textRe = new RegExp(args.textRe, 'i');
  const hintRe = new RegExp(args.hintRe, 'i');
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05;
  };
  const hasHint = (el) => {
    let n = el, depth = 0;
    while (n && depth < 12) {
      const id = (n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : '') + ' ' + (n.getAttribute ? (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('data-testid') || '') : '');
      if (hintRe.test(id)) return true;
      n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
      depth++;
    }
    return false;
  };
  const roots = [document];
  const out = [];
  while (roots.length) {
    const root = roots.shift();
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
      const tag = el.tagName;
      const role = el.getAttribute && el.getAttribute('role');
      if (!(tag === 'BUTTON' || role === 'button' || (tag === 'A' && !el.getAttribute('href')) || (tag === 'INPUT' && /button|submit/i.test(el.type || '')))) continue;
      const txt = ((el.innerText || el.value || el.textContent || '') + '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length > 60) continue;
      if (!textRe.test(txt)) continue;
      if (el.closest && el.closest('form[action]') && !hasHint(el)) continue;
      if (!isVisible(el) || !hasHint(el)) continue;
      out.push({el, txt});
    }
  }
  document.querySelectorAll('[data-dt-target]').forEach(e => e.removeAttribute('data-dt-target'));
  if (!out.length) return {found: false};
  out[0].el.setAttribute('data-dt-target', '1');
  return {found: true, text: out[0].txt};
}
"""

BANNER_VISIBLE_JS = r"""
(sels) => {
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity||'1') > 0.05; };
  for (const s of sels) { try { const el = document.querySelector(s); if (vis(el)) return s; } catch(e) {} }
  return null;
}
"""
