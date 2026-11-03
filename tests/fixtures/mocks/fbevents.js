// Mock of connect.facebook.net/en_US/fbevents.js used ONLY by local test fixtures.
(function () {
  var n = window._fbq || window.fbq;
  if (!n) return;
  var pixel = null;
  function handle(args) {
    if (args[0] === 'init') { pixel = args[1]; return; }
    if ((args[0] === 'track' || args[0] === 'trackCustom') && pixel) {
      var extra = '';
      if (args[2] && typeof args[2] === 'object') {
        for (var k in args[2]) extra += '&cd[' + k + ']=' + encodeURIComponent(args[2][k]);
      }
      var img = new Image();
      img.src = 'https://www.facebook.com/tr/?id=' + pixel + '&ev=' + encodeURIComponent(args[1]) + '&dl=' + encodeURIComponent(location.href) + extra;
    }
  }
  n.callMethod = function () { handle(Array.prototype.slice.call(arguments)); };
  var q = n.queue || [];
  for (var i = 0; i < q.length; i++) handle(Array.prototype.slice.call(q[i]));
  n.queue = [];
})();
