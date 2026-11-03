// Mock of consent.cookiebot.com/uc.js used ONLY by local test fixtures.
(function () {
  window.Cookiebot = {
    consented: false, declined: false, hasResponse: false,
    consent: { necessary: true, preferences: false, statistics: false, marketing: false },
    decline: function () { done(false); },
    submitCustomConsent: function () { done(true); }
  };
  var dlg;
  function done(accept) {
    var c = window.Cookiebot;
    c.hasResponse = true;
    if (accept) { c.consented = true; c.consent.statistics = true; c.consent.marketing = true; }
    else { c.declined = true; }
    if (dlg) dlg.style.display = 'none';
    window.dispatchEvent(new Event(accept ? 'CookiebotOnAccept' : 'CookiebotOnDecline'));
  }
  function render() {
    dlg = document.createElement('div');
    dlg.id = 'CybotCookiebotDialog';
    dlg.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;background:#fff;padding:24px;z-index:9999;border-top:1px solid #ccc');
    dlg.innerHTML = '<p>Este site usa cookies.</p>' +
      '<button id="CybotCookiebotDialogBodyButtonDecline">Recusar</button> ' +
      '<button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Permitir todos</button>';
    document.body.appendChild(dlg);
    dlg.querySelector('#CybotCookiebotDialogBodyButtonDecline').addEventListener('click', function () { done(false); });
    dlg.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll').addEventListener('click', function () { done(true); });
  }
  if (document.body) render(); else document.addEventListener('DOMContentLoaded', render);
})();
