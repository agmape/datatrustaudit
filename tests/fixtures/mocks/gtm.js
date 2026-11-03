// Mock of googletagmanager.com/gtm.js used ONLY by local test fixtures.
// If the page defines window.__gtmGa4, emulate a GA4 configuration tag inside the container.
(function () {
  window.google_tag_manager = window.google_tag_manager || {};
  if (window.__gtmGa4 && window.__dt) {
    var send = function () { window.__dt.ga4(window.__gtmGa4, 'page_view'); };
    if (document.readyState === 'complete') send(); else window.addEventListener('load', send);
  }
})();
