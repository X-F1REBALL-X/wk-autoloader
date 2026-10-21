(function (g) {
'use strict';
/* IgniKey Store build: local only. Upstream GitHub update checker removed. */
var W = g.WKAL = g.WKAL || {};
W.selfupd = W.selfupd || {};

function currentAppVersion() {
  var el = document.getElementById('appVer');
  var txt = el ? String(el.textContent || '') : '';
  var m = /^v?\s*(\d+)\.(\d+)(?:\.(\d+))?/.exec(txt);
  if (!m) return '';
  return [m[1], m[2], m[3] || '0'].join('.');
}

W.selfupd.currentAppVersion = currentAppVersion;
W.selfupd.maybeApplyPending = function () {};
W.selfupd.bind = function () {
  var box = document.getElementById('selfupd');
  if (box) box.style.display = 'none';
};
W.selfupd.paint = function () {};
W.selfupd.check = function () {};
})(typeof window !== 'undefined' ? window : this);
