(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
W.launcher = W.launcher || {};

W.launcher.httpResponseReady = function (xhr, label) {
  if (!xhr || xhr.status !== 200) return false;
  var body = xhr.responseText || '';
  if (label === 'elf-launcher') {
    if (body.length < 8000) return false;
    return /<title>\s*ELF Launcher\s*<\/title>/i.test(body)
      && (/id=["']banner["']|id=["']ftitle["']/i.test(body) || body.length > 20000);
  }
  if (body.length < 256) return false;
  return /<html|Payload|PLDMGR|payload/i.test(body);
};

W.launcher.navigateLocalHttp = function (url, label, portHint) {
  var navUrl = (label === 'elf-launcher') ? url : W.withCacheBust(url);
  if (label === 'elf-launcher') {
    try {
      var wkv = W.selfupd && W.selfupd.currentAppVersion ? W.selfupd.currentAppVersion() : '';
      if (wkv) navUrl = String(navUrl).split('#')[0] + '#wkver=' + encodeURIComponent(wkv);
    } catch (eV) {}
  }
  W.uiLog('Opening ' + label + ' at ' + navUrl + ' ...', 'info');
  var target = window;
  try { if (window.top && window.top !== window) target = window.top; } catch (eTop) { target = window; }
  try { target.location.replace(navUrl); return; } catch (e1) {}
  try { target.location.href = navUrl; return; } catch (e2) {}
  try { window.open(navUrl, '_top'); } catch (e3) {
    W.uiLog('Could not open browser to :' + portHint + ' - open ' + label + ' manually.', 'warning');
  }
};

W.launcher.revealLogPanel = function () {
  try {
    var wrap = document.getElementById('logWrapper');
    if (wrap) wrap.hidden = false;
  } catch (eR) {}
};

W.launcher.requestResendAutoload = function (name) {
  name = name || W.autoloadElfName();
  W.uiLog('Re-send requested: ' + name + ' -> elfldr :9021', 'info');
  try {
    var w = W.els.exploit && W.els.exploit.contentWindow;
    if (w) {
      w.postMessage({ type: 'wkal', kind: 'resend-autoload', name: name }, '*');
      return true;
    }
  } catch (e) {}
  W.uiLog('Could not reach exploit iframe for re-send', 'warning');
  return false;
};

/* Proven openWhenHttpReady timings kept intact. */
W.launcher.openWhenHttpReady = function (url, label, portHint, maxWaitMs, firstDelayMs, settleMs, allowAutoResend) {
  var started = Date.now();
  var minWait = typeof firstDelayMs === 'number' ? firstDelayMs : 2000;
  var settle = typeof settleMs === 'number' ? settleMs : 0;
  var opened = false;
  var done = false;
  var autoResendUsed = allowAutoResend === false;
  var waitSec = Math.max(1, Math.round(maxWaitMs / 1000));
  W.uiLog('Waiting for ' + label + ' HTTP :' + portHint + ' (max ' + waitSec + 's) ...', 'info');

  function offerRetry(reason) {
    if (done && opened) return;
    done = true;
    W.launcher.revealLogPanel();
    W.uiLog(label + ' HTTP :' + portHint + ' not ready after ' + waitSec
      + 's (' + reason + '). Jailbreak still succeeded.', 'warning');
    if (W.els.statusMsg) {
      try { W.els.statusMsg.textContent = W.t('pageNotOpen', { label: label }); } catch (eS) {}
    }
    if (W.els.successMsg) {
      try {
        W.els.successMsg.hidden = false;
        W.els.successMsg.textContent = W.t('jbOkNoAnswer', { label: label, port: portHint });
      } catch (eOk) {}
    }
    try {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = W.t('retrySendOpen', { label: label, port: portHint });
      btn.className = 'ghost';
      btn.onclick = function () {
        try { btn.disabled = true; btn.textContent = W.t('resending'); } catch (eB) {}
        W.launcher.requestResendAutoload();
        setTimeout(function () {
          W.launcher.openWhenHttpReady(url, label, portHint, maxWaitMs, 3000, settle, false);
        }, 6000);
      };
      if (W.els.logContainer) W.els.logContainer.appendChild(btn);
    } catch (eBtn) {}
  }

  function lastChanceNavigate(reason) {
    if (opened) return;
    W.uiLog(label + ' opening :' + portHint + ' (' + reason + ') ...', 'warning');
    opened = true; done = true;
    W.launcher.navigateLocalHttp(url, label, portHint);
  }

  function onGiveUp(reason) {
    if (opened || done) return;
    if (label === 'elf-launcher') {
      if (W.state.elfHttpAlreadyUp) { lastChanceNavigate(reason); return; }
      if (!autoResendUsed) {
        autoResendUsed = true;
        W.uiLog('Auto-retry: re-sending elf-launcher.elf to :9021 ...', 'warning');
        W.launcher.requestResendAutoload('elf-launcher.elf');
        started = Date.now();
        setTimeout(attempt, 4000);
        return;
      }
      offerRetry(reason);
      return;
    }
    offerRetry(reason);
  }

  function doNavigate() {
    if (opened || done) return;
    opened = true; done = true;
    W.launcher.navigateLocalHttp(url, label, portHint);
  }

  function scheduleNavigate() {
    if (opened || done) return;
    if (settle > 0) {
      W.uiLog(label + ' HTTP ready - settling ' + settle + 'ms before open ...', 'info');
      setTimeout(function () { doNavigate(); }, settle);
    } else doNavigate();
  }

  function attempt() {
    if (opened || done) return;
    var elapsed = Date.now() - started;
    var giveUp = elapsed >= maxWaitMs;
    try {
      var xhr = new XMLHttpRequest();
      xhr.timeout = label === 'elf-launcher' ? 1000 : 5000;
      xhr.open('GET', W.withCacheBust(url), true);
      try { xhr.setRequestHeader('Cache-Control', 'no-cache'); } catch (eHdr) {}
      xhr.onload = function () {
        if (opened || done) return;
        if (W.launcher.httpResponseReady(xhr, label)) scheduleNavigate();
        else if (giveUp) onGiveUp('no ready document');
        else setTimeout(attempt, label === 'elf-launcher' ? 125 : 600);
      };
      xhr.onerror = function () {
        if (opened || done) return;
        if (giveUp) onGiveUp('connection failed');
        else setTimeout(attempt, label === 'elf-launcher' ? 125 : 600);
      };
      xhr.ontimeout = xhr.onerror;
      xhr.send();
    } catch (e) {
      if (opened || done) return;
      if (giveUp) onGiveUp('probe error');
      else setTimeout(attempt, label === 'elf-launcher' ? 125 : 600);
    }
  }
  setTimeout(attempt, minWait);
};

/* Quick probe for splash (3s, non-blocking). Prefer tiny /version then /auto-list. */
W.launcher.probeElfLauncherHttp = function (cb) {
  var done = false;
  function fin(up) {
    if (done) return;
    done = true;
    try { cb(!!up); } catch (e) {}
  }
  function tryFetch(url) {
    try {
      fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
        .then(function () { fin(true); })
        .catch(function () { /* try next */ });
      return true;
    } catch (e) { return false; }
  }
  if (!tryFetch('http://127.0.0.1:1000/version?t=' + Date.now())) {
    fin(false); return;
  }
  setTimeout(function () {
    if (done) return;
    tryFetch('http://127.0.0.1:1000/auto-list?t=' + Date.now());
  }, 400);
  setTimeout(function () { fin(false); }, 400);
};


/* Elf Launcher "open page after jailbreak" Off => still start process, no browser navigate. */
W.launcher.browserWantsOpen = function (cb) {
  var done = false;
  function fin(open) { if (done) return; done = true; try { cb(!!open); } catch (e) {} }
  /* Cookie / localStorage shared with Elf Launcher on same console. */
  var v = '';
  try { v = localStorage.getItem('ps5elfs-browser') || ''; } catch (e0) {}
  if (!v) {
    try {
      var parts = String(document.cookie || '').split(';'), i, c;
      for (i = 0; i < parts.length; i++) {
        c = parts[i].replace(/^\s+/, '');
        if (c.indexOf('ps5elfs-browser=') === 0) v = decodeURIComponent(c.substring(17));
      }
    } catch (e1) {}
  }
  if (v === 'closed') { fin(false); return; }
  if (v === 'open') { fin(true); return; }
  /* Ask live launcher when up (CORS may allow). Default open if unknown. */
  try {
    fetch('http://127.0.0.1:1000/browser-pref?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && typeof j.open === 'boolean') {
          try { localStorage.setItem('ps5elfs-browser', j.open ? 'open' : 'closed'); } catch (e2) {}
          fin(j.open);
        } else fin(true);
      })
      .catch(function () { fin(true); });
  } catch (e3) { fin(true); return; }
  setTimeout(function () { fin(true); }, 900);
};

W.launcher.ensureRunning = function (cb) {
  /* Make sure :1000 is up (send mirror/tip if needed). Never requires page navigate. */
  W.launcher.probeElfLauncherHttp(function (up) {
    if (up) { W.state.elfHttpAlreadyUp = true; if (cb) cb(true); return; }
    W.uiLog('Ensuring Elf Launcher process via console mirror ...', 'info');
    W.launcher.sendUrlToElfldr(W.CONSOLE_MIRROR_URI, function () {
      W.launcher.probeElfLauncherHttp(function (up2) {
        if (up2) { W.state.elfHttpAlreadyUp = true; if (cb) cb(true); return; }
        W.uiLog('Mirror miss, resend bundled tip elf-launcher.elf', 'info');
        W.launcher.requestResendAutoload('elf-launcher.elf');
        setTimeout(function () {
          W.launcher.probeElfLauncherHttp(function (up3) {
            W.state.elfHttpAlreadyUp = !!up3;
            if (cb) cb(!!up3);
          });
        }, 4000);
      });
    });
  });
};


W.launcher.probeQuick = function (cb) {
  var done = false;
  function fin(up) { if (done) return; done = true; try { cb(!!up); } catch (e) {} }
  try {
    fetch('http://127.0.0.1:1000/version?t=' + Date.now(), { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .then(function () { fin(true); })
      .catch(function () { fin(false); });
  } catch (e) { fin(false); return; }
  setTimeout(function () { fin(false); }, 250);
};

W.autoloadElfName = function () {
  /* Elf Launcher only: open-only when :1000 up; else tip ELF name for chain autoload. */
  if (W.state.elfHttpAlreadyUp) return 'wkal-skip';
  return 'elf-launcher.elf';
};

/* Send console mirror via elfldr ?uri=file://… (reuse Image/iframe helper). */
W.launcher.sendUrlToElfldr = function (fileUrl, cb) {
  var target = 'http://127.0.0.1:9021/?uri=' + encodeURIComponent(fileUrl);
  var done = false;
  function fin(ok) { if (done) return; done = true; if (typeof cb === 'function') cb(!!ok); }
  function ping(n) {
    var src = target + (target.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now() + 'n' + n;
    try {
      var img = new Image();
      img.onload = function () { fin(true); };
      img.onerror = function () { fin(true); };
      img.src = src;
    } catch (e0) {}
    try {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:-9999px;visibility:hidden';
      iframe.src = src;
      (document.body || document.documentElement).appendChild(iframe);
      setTimeout(function () {
        try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (e1) {}
      }, 8000);
    } catch (e2) {}
  }
  ping(0);
  setTimeout(function () { ping(1); }, 350);
  setTimeout(function () { ping(2); }, 900);
  setTimeout(function () { fin(true); }, 1600);
};

W.launcher.openElfLauncherPage = function () {
  if (W.state.launcherHttpOpenStarted) return;
  W.state.launcherHttpOpenStarted = true;

  function triggerAuto() {
    try {
      fetch('http://127.0.0.1:1000/trigger-auto?t=' + Date.now(), {
        method: 'GET', mode: 'no-cors', cache: 'no-store'
      }).catch(function () {});
    } catch (eTrig) {}
  }

  function maybeNavigate(alreadyUp) {
    W.launcher.browserWantsOpen(function (wantOpen) {
      if (!wantOpen) {
        W.uiLog('Elf Launcher :1000 ready, open-after-JB is Off (home tile / URL still work)', 'success');
        if (W.els.nextTile) {
          try {
            W.els.nextTile.hidden = false;
            var d = W.els.nextTile.querySelector('.d');
            if (d) d.textContent = 'http://127.0.0.1:1000  ·  ' + W.t('openLaterHint');
          } catch (eN) {}
        }
        if (W.ui && W.ui.toast) W.ui.toast(W.t('elfReady'), W.t('openLaterHint'), 'ok');
        var oo = document.getElementById('openLauncherOnly');
        if (oo) oo.hidden = false;
        return;
      }
      if (alreadyUp) {
        W.uiLog('Elf Launcher :1000 already up - trigger Auto then open ...', 'success');
        triggerAuto();
        W.launcher.openWhenHttpReady(W.consoleHttpBase(1000), 'elf-launcher', '1000',
          12000, 400, 400, false);
      } else {
        W.uiLog('elf-launcher.elf path - opening :1000 when ready ...', 'success');
        W.launcher.openWhenHttpReady(W.consoleHttpBase(1000), 'elf-launcher', '1000',
          25000, 2500, 800, true);
      }
    });
  }

  if (W.state.elfHttpAlreadyUp) {
    maybeNavigate(true);
    return;
  }
  W.uiLog('Trying console mirror ' + W.CONSOLE_MIRROR_URI + ' ...', 'info');
  W.launcher.sendUrlToElfldr(W.CONSOLE_MIRROR_URI, function () {
    W.launcher.probeElfLauncherHttp(function (up) {
      if (up) {
        W.state.elfHttpAlreadyUp = true;
        W.uiLog('Console mirror brought :1000 up', 'success');
        maybeNavigate(true);
        return;
      }
      W.uiLog('Mirror miss, tip / resend path for bundled elf-launcher.elf', 'info');
      maybeNavigate(false);
    });
  });
};

W.launcher.openNow = function () {
  W.state.launcherHttpOpenStarted = false;
  W.launcher.probeElfLauncherHttp(function (up) {
    W.state.elfHttpAlreadyUp = !!up;
    if (up) W.launcher.openElfLauncherPage();
    else if (W.ui && W.ui.toast) W.ui.toast(W.t('elfNotRunning'), W.t('startJailbreak'), 'warn');
  });
};

W.launcher.onAutoloadResult = function (data) {
  W.state.autoloadPending = false;
  if (W.state.finished && !(data && data.ok)) return;
  W.state.finished = true;
  if (data.ok && W.state.mirrorTimer) {
    clearInterval(W.state.mirrorTimer);
    W.state.mirrorTimer = 0;
  }
  if (W.mirrors && W.mirrors.collapseP2jbStats) W.mirrors.collapseP2jbStats();
  if (data.ok) {
    if (W.els.failMsg) {
      try { W.els.failMsg.hidden = true; W.els.failMsg.textContent = ''; } catch (e0) {}
    }
    var name = W.autoloadElfName();
    if (data.skipped || name === 'wkal-skip') {
      W.uiLog('No post-JB ELF sent (wkal-skip).', 'info');
    } else if (!(Number(data.bytes) > 0)) {
      W.uiLog('Autoload ok but send missing/skipped (bytes=' + String(data.bytes) + ')', 'warning');
    } else {
      W.uiLog('Sent ' + name + ' to elfldr :9021 (' + data.bytes + ' bytes).', 'success');
    }
    W.finishProgressSuccess(W.t('jailbreakSuccess'));
    W.recordRun('ok');
    if (W.selfupd && W.selfupd.maybeApplyPending) W.selfupd.maybeApplyPending('autoload-ok');
  } else {
    W.uiLog('[ERROR] Autoload failed: ' + (data.why || 'unknown error'), 'error');
    W.finishProgressFail(W.t('jailbreakFail'));
    W.recordRun('fail');
    /* Safe retry only if early stage. */
    if (W.state.safeRetryLeft > 0 && W.state.progressPct < 32) {
      W.state.safeRetryLeft -= 1;
      W.uiLog('Safe retry left: ' + W.state.safeRetryLeft, 'warning');
      setTimeout(function () {
        try { location.reload(); } catch (e) {}
      }, 800);
    }
  }
  setTimeout(function () {
    if (!data.ok) return;
    if (W.state.updateOnlyMode || W.state.pendingSelfUpdate) {
      W.uiLog('[update] skipping companion open - WK install only', 'info');
      return;
    }
    W.launcher.openElfLauncherPage();
    /* Save CFI after JB when launcher is up - shown from the next splash. */
    setTimeout(function () {
      if (W.persistCfiFromLauncher) W.persistCfiFromLauncher(function () {});
    }, 3500);
  }, 0);
};

})(typeof window !== 'undefined' ? window : this);
