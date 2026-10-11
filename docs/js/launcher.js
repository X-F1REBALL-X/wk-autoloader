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
  /* Leave only after the background mirror refresh answered (bounded), so
     Elf Launcher never writes its /update reply to a page that is gone. */
  if (label === 'elf-launcher' && W.elauto && !W.state.elRefreshRan) {
    W.state.elRefreshRan = true;
    W.elauto.refresh(function () { W.launcher.navigateLocalHttp(url, label, portHint); });
    return;
  }
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
  name = name || (W.state.elMirrorFirst ? 'elf-launcher.elf' : W.autoloadElfName());
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
  /* Console mirror goes first (sent after JB by openElfLauncherPage). */
  if (W.state.elMirrorFirst) return 'wkal-skip';
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

  function maybeNavigate(alreadyUp, freshMirror) {
    W.launcher.browserWantsOpen(function (wantOpen) {
      if (!wantOpen) {
        if (W.elauto && !W.state.elRefreshRan) { W.state.elRefreshRan = true; W.elauto.refresh(); }
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
      if (freshMirror) {
        /* Fresh start like the bundled path: Elf runs its own AutoPayload. */
        W.uiLog('Console mirror Elf Launcher up - opening :1000 ...', 'success');
        W.launcher.openWhenHttpReady(W.consoleHttpBase(1000), 'elf-launcher', '1000',
          25000, 400, 800, false);
      } else if (alreadyUp) {
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
  if (!W.state.elMirrorFirst) {
    /* Chain already sent the bundled ELF (no known console mirror yet). */
    W.uiLog('Sent bundled Elf Launcher ' + W.BUNDLED_ELFLAUNCHER_VER + ' (no console mirror yet)', 'info');
    maybeNavigate(false);
    return;
  }
  W.uiLog('Launching console mirror ' + W.CONSOLE_MIRROR_URI + ' ...', 'info');
  W.elauto.sendMirror();
  W.elauto.waitUp(10000, function (up) {
    if (up) {
      W.state.elfHttpAlreadyUp = true;
      W.uiLog('Elf Launcher from console mirror is up (' + W.elauto.mirrorLabel() + ')', 'success');
      maybeNavigate(true, true);
      return;
    }
    W.uiLog('Mirror miss, sending bundled Elf Launcher ' + W.BUNDLED_ELFLAUNCHER_VER, 'warning');
    W.elauto.forgetMirror();
    W.launcher.requestResendAutoload('elf-launcher.elf');
    W.state.elMirrorFirst = false;
    maybeNavigate(false);
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
    if (W.state.elMirrorFirst && (data.skipped || name === 'wkal-skip')) {
      W.uiLog('Chain skipped bundled ELF - console mirror goes next.', 'info');
    } else if (data.skipped || name === 'wkal-skip') {
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


/* ---- Elf Launcher auto-latest: no WK rebuild per Elf Launcher release ----
   Boot (Relapse/Poops/p2jb elfldr reads local paths over HTTP GET):
     console mirror /data/elf-launcher/mirror/elf-launcher.elf first,
     bundled payloads/elf-launcher.elf only when no mirror is known or it misses.
   After :1000 is up: compare the mirror sha (Elf /file_meta) with the GitHub
   latest release digest; if different, Elf Launcher downloads it natively and
   sha256-verifies it into the mirror (/update). Used from the next boot.
   umtx2 (FW <= 5.50) keeps the old bundled path: its elfldr has no HTTP GET. */
W.EL_GH_LATEST = 'https://api.github.com/repos/X-F1REBALL-X/elf-launcher/releases/latest';
W.EL_MIRROR_GET = 'http://127.0.0.1:9021/data/elf-launcher/mirror/elf-launcher.elf';
W.LS_EL_MIRROR = 'wkal_el_mirror';  /* {sha,size,tag,at} mirror last seen by Elf */
W.LS_EL_LATEST = 'wkal_el_latest';  /* {tag,sha,url,size,at} or {fail:1,at} */
W.elauto = W.elauto || {};

function elJson(k) {
  try { var v = JSON.parse(W.lsGet(k, '') || 'null'); return (v && typeof v === 'object') ? v : null; } catch (e) { return null; }
}
function elSave(k, o) { W.lsSet(k, o ? JSON.stringify(o) : ''); }
function elSha(v) { v = String(v || '').toLowerCase().replace(/^sha256:/, ''); return /^[0-9a-f]{64}$/.test(v) ? v : ''; }

function elXhrJson(url, timeoutMs, cb) {
  var done = false;
  function fin(err, j) { if (done) return; done = true; try { cb(err, j); } catch (e) {} }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs;
    xhr.onload = function () {
      var j = null;
      try { j = JSON.parse(xhr.responseText || 'null'); } catch (eP) {}
      if (xhr.status >= 200 && xhr.status < 300 && j) fin(null, j);
      else fin(new Error((j && j.message) || ('HTTP ' + xhr.status)), j);
    };
    xhr.onerror = function () { fin(new Error('network')); };
    xhr.ontimeout = function () { fin(new Error('timeout')); };
    xhr.send();
  } catch (e) { fin(e); }
  setTimeout(function () { fin(new Error('timeout')); }, timeoutMs + 500);
}

W.elauto.mirrorLabel = function () {
  var m = elJson(W.LS_EL_MIRROR);
  if (!m) return 'unknown';
  return (m.tag ? m.tag + ' ' : '') + (m.sha ? m.sha.substring(0, 12) : 'no sha');
};

/* Mirror first only when Elf saw a real file there and the chain's elfldr can load it. */
W.elauto.mirrorFirstOk = function (chain) {
  if (chain !== 'relapse' && chain !== 'poops' && chain !== 'p2jb') return false;
  var m = elJson(W.LS_EL_MIRROR);
  return !!(m && (m.size | 0) > 4096);
};

W.elauto.forgetMirror = function () { elSave(W.LS_EL_MIRROR, null); };

/* One plain GET: elfldr maps the path to file:///data/... and spawns it.
   Exactly one request (no Image+iframe retries), a second one would start a second Elf. */
W.elauto.sendMirror = function () {
  try {
    var img = new Image();
    img.src = W.EL_MIRROR_GET;
    W.elauto._img = img;
  } catch (e) {
    W.uiLog('Mirror send failed: ' + (e && e.message ? e.message : e), 'warning');
  }
};

W.elauto.waitUp = function (maxMs, cb) {
  var until = Date.now() + maxMs;
  (function tick() {
    W.launcher.probeElfLauncherHttp(function (up) {
      if (up) { cb(true); return; }
      if (Date.now() >= until) { cb(false); return; }
      setTimeout(tick, 500);
    });
  })();
};

/* Splash only (before the chain): remember GitHub latest. Never blocks anything. */
W.elauto.prefetch = function (cb) {
  var c = elJson(W.LS_EL_LATEST);
  function fin(x) { if (typeof cb === 'function') try { cb(x); } catch (e) {} }
  if (c && c.at && Date.now() - c.at < (c.fail ? 30 : 10) * 60000) { fin(c); return; }
  elXhrJson(W.EL_GH_LATEST + '?_=' + Date.now(), 4000, function (err, j) {
    var i, a, info = null;
    if (!err && j && !j.draft && j.assets) {
      for (i = 0; i < j.assets.length; i++) {
        a = j.assets[i] || {};
        if (String(a.name || '').toLowerCase() === 'elf-launcher.elf' && elSha(a.digest) && a.browser_download_url) {
          info = { tag: String(j.tag_name || ''), sha: elSha(a.digest), url: a.browser_download_url, size: a.size | 0, at: Date.now() };
          break;
        }
      }
    }
    if (!info) info = { fail: 1, at: Date.now() };
    elSave(W.LS_EL_LATEST, info);
    fin(info);
  });
};

/* Post-JB, :1000 up. Calls cb once (capped at ~35s, normally <0.5s). */
W.elauto.refresh = function (cb) {
  var done = false;
  function fin() { if (done) return; done = true; if (typeof cb === 'function') try { cb(); } catch (e) {} }
  setTimeout(function () {
    if (!done) W.uiLog('[el] mirror refresh still running - continuing', 'warning');
    fin();
  }, 35000);
  function withLatest(next) {
    var c = elJson(W.LS_EL_LATEST);
    if (c && c.sha) { next(c); return; }
    if (c && c.fail && Date.now() - c.at < 30 * 60000) { next(null); return; }
    W.elauto.prefetch(function (x) { next(x && x.sha ? x : null); });
  }
  elXhrJson('http://127.0.0.1:1000/file_meta?path=elf-launcher.elf&t=' + Date.now(), 2000, function (err, meta) {
    if (err || !meta || !meta.ok) {
      W.uiLog('[el] mirror check skipped (' + (err ? err.message : 'no answer') + ')', 'info');
      fin();
      return;
    }
    var old = elJson(W.LS_EL_MIRROR);
    var msha = elSha(meta.checksum);
    var have = !!(meta.exists && (meta.size | 0) > 4096);
    if (have) elSave(W.LS_EL_MIRROR, { sha: msha, size: meta.size | 0, tag: (old && old.sha === msha) ? old.tag : '', at: Date.now() });
    else W.elauto.forgetMirror();
    withLatest(function (latest) {
      if (!latest) {
        W.uiLog('[el] GitHub latest unknown (offline?) - mirror kept: ' + (have ? W.elauto.mirrorLabel() : 'none'), 'info');
        fin();
        return;
      }
      if (have && msha === latest.sha) {
        elSave(W.LS_EL_MIRROR, { sha: msha, size: meta.size | 0, tag: latest.tag, at: Date.now() });
        W.uiLog('[el] console mirror is latest Elf Launcher ' + latest.tag, 'info');
        fin();
        return;
      }
      W.uiLog('[el] Elf Launcher ' + latest.tag + ' -> console mirror (sha256 ' + latest.sha.substring(0, 12) + ') ...', 'info');
      var q = 'http://127.0.0.1:1000/update?path=elf-launcher.elf'
        + '&url=' + encodeURIComponent(latest.url)
        + '&sha256=' + latest.sha
        + (latest.size ? '&size=' + latest.size : '');
      elXhrJson(q, 30000, function (e2, u) {
        if (!e2 && u && u.ok && elSha(u.sha256) === latest.sha) {
          elSave(W.LS_EL_MIRROR, { sha: latest.sha, size: (u.bytes | 0) || latest.size, tag: latest.tag, at: Date.now() });
          W.uiLog('[el] mirror updated to Elf Launcher ' + latest.tag + ' - used from next boot', 'success');
        } else {
          W.uiLog('[el] mirror update failed: ' + (e2 ? e2.message : (u && u.message) || 'bad reply'), 'warning');
        }
        fin();
      });
    });
  });
};

})(typeof window !== 'undefined' ? window : this);
