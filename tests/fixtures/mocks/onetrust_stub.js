// Mock of cdn.cookielaw.org/scripttemplates/otSDKStub.js used ONLY by local test fixtures.
(function () {
  var banner;
  window.OnetrustActiveGroups = ',C0001,';
  var closed = false;
  function finish(accept) {
    closed = true;
    window.OnetrustActiveGroups = accept ? ',C0001,C0002,C0003,C0004,' : ',C0001,';
    if (banner) banner.style.display = 'none';
    window.dispatchEvent(new Event(accept ? 'otAccept' : 'otReject'));
  }
  window.OneTrust = {
    RejectAll: function () { finish(false); },
    AllowAll: function () { finish(true); },
    IsAlertBoxClosed: function () { return closed; }
  };
  function render() {
    banner = document.createElement('div');
    banner.id = 'onetrust-banner-sdk';
    banner.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;background:#fff;padding:24px;z-index:9999');
    banner.innerHTML = '<p>We use cookies.</p><button id="onetrust-reject-all-handler">Reject All</button> ' +
      '<button id="onetrust-accept-btn-handler">Accept All Cookies</button>';
    document.body.appendChild(banner);
    banner.querySelector('#onetrust-reject-all-handler').addEventListener('click', function () { finish(false); });
    banner.querySelector('#onetrust-accept-btn-handler').addEventListener('click', function () { finish(true); });
    if (typeof window.OptanonWrapper === 'function') window.OptanonWrapper();
  }
  if (document.body) render(); else document.addEventListener('DOMContentLoaded', render);
})();
