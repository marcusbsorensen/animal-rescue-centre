/* Progressive enhancement only: the page works without it. */
(function () {
  var c = window.ARC_CONFIG || {};
  if (c.PLAY_URL) {
    document.querySelectorAll('[data-play]').forEach(function (a) { a.href = c.PLAY_URL; });
  }
  if (c.APP_STORE_URL) {
    document.querySelectorAll('[data-app-link]').forEach(function (a) { a.href = c.APP_STORE_URL; });
    document.querySelectorAll('[data-app]').forEach(function (el) { el.hidden = false; });
  }
})();
