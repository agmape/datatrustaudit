// Fixture helper (first-party). Emulates what vendor libraries send, so tests know the exact ground truth.
window.__dt = {
  ga4: function (tid, en, extra, gcs) {
    var u = 'https://region1.google-analytics.com/g/collect?v=2&tid=' + tid + '&cid=1234567.7654321&en=' + en +
      '&dl=' + encodeURIComponent(location.href) + (gcs ? '&gcs=' + gcs : '') + (extra || '');
    fetch(u, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(function () {});
  },
  meta: function (pid, ev, extra) {
    var img = new Image();
    img.src = 'https://www.facebook.com/tr/?id=' + pid + '&ev=' + ev + '&dl=' + encodeURIComponent(location.href) + (extra || '');
  },
  setCookie: function (name, value) {
    document.cookie = name + '=' + value + '; path=/; max-age=31536000; SameSite=Lax';
  }
};
