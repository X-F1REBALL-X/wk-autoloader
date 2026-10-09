(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
W.selfupd = W.selfupd || {};

  var SELFUPD_DISMISS_KEY = 'wkal-selfupd-dismiss';
  var SELFUPD_GH_LATEST = 'https://api.github.com/repos/X-F1REBALL-X/wk-autoloader/releases/latest';
  var SELFUPD_RELEASES_URL = 'https://github.com/X-F1REBALL-X/wk-autoloader/releases/latest';
  var SELFUPD_ASSET = 'wk-dual-payload.elf';
  /* state in W.state */
  
  
  
  
  

  function semverParts(v) {
    v = String(v || '').replace(/^\s+|\s+$/g, '').replace(/^[vV]/, '');
    var m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v);
    if (!m) return null;
    return [parseInt(m[1], 10) || 0, parseInt(m[2], 10) || 0, parseInt(m[3] || '0', 10) || 0];
  }

  /* Base semver compare; -dev / -pre suffixes are ignored. */
  function cmpSemver(a, b) {
    var A = semverParts(a) || [0, 0, 0];
    var B = semverParts(b) || [0, 0, 0];
    var i;
    for (i = 0; i < 3; i++) {
      if (A[i] > B[i]) return 1;
      if (A[i] < B[i]) return -1;
    }
    return 0;
  }

  /* Running app version, or '' when the page is unbuilt (placeholder). */
  function currentAppVersion() {
    var ids = ['appVer'], el, txt, i, parts;
    var sv = document.querySelector ? document.querySelector('.splash-ver') : null;
    for (i = 0; i < ids.length; i++) {
      el = document.getElementById(ids[i]);
      txt = el ? String(el.textContent || '') : '';
      parts = semverParts(txt);
      if (parts) return parts.join('.');
    }
    txt = sv ? String(sv.textContent || '') : '';
    parts = semverParts(txt);
    return parts ? parts.join('.') : '';
  }

  function hideSelfUpdateBanner() {
    var box = document.getElementById('selfupd');
    if (box) box.classList.remove('show');
    if (W.state.selfUpdateMsgTimer) { clearTimeout(W.state.selfUpdateMsgTimer); W.state.selfUpdateMsgTimer = 0; }
  }

  function setSelfUpdateDir(box) {
    var info = null;
    try {
      if (window.WKAL_I18N && window.WKAL_I18N.langInfo) {
        info = window.WKAL_I18N.langInfo(window.WKAL_I18N.getLang());
      }
    } catch (e) { }
    if (info && info.rtl) box.setAttribute('dir', 'rtl');
    else box.removeAttribute('dir');
  }

  function paintSelfUpdateBanner() {
    var box = document.getElementById('selfupd');
    var txt = document.getElementById('selfupdtxt');
    var dl = document.getElementById('selfupddl');
    var dx = document.getElementById('selfupdx');
    if (!box || !txt || !W.state.selfUpdateInfo) return;
    setSelfUpdateDir(box);
    txt.textContent = W.t('selfUpdate', { ver: W.state.selfUpdateInfo.version });
    if (dl) dl.textContent = W.t('update');
    if (dx) dx.textContent = W.t('selfUpdateLater');
  }

  function showSelfUpdateBanner(info) {
    var box = document.getElementById('selfupd');
    var dl = document.getElementById('selfupddl');
    if (!box || !info || !info.version) return;
    W.state.selfUpdateInfo = info;
    paintSelfUpdateBanner();
    if (dl) dl.disabled = false;
    box.classList.add('show');
  }

  function selfUpdateMessage(text, hideAfterMs) {
    var txt = document.getElementById('selfupdtxt');
    if (txt) txt.textContent = text;
    W.uiLog('[update] ' + text, 'info');
    if (W.state.selfUpdateMsgTimer) { clearTimeout(W.state.selfUpdateMsgTimer); W.state.selfUpdateMsgTimer = 0; }
    if (hideAfterMs) W.state.selfUpdateMsgTimer = setTimeout(hideSelfUpdateBanner, hideAfterMs);
  }

  function rememberSelfUpdateDismiss(ver) {
    try { localStorage.setItem(SELFUPD_DISMISS_KEY, String(ver || '')); } catch (e) { }
  }

  function dismissSelfUpdate() {
    if (W.state.selfUpdateInfo && W.state.selfUpdateInfo.version) rememberSelfUpdateDismiss(W.state.selfUpdateInfo.version);
    hideSelfUpdateBanner();
  }

  function fetchJsonText(url, cb) {
    var done = false;
    function fin(err, text) { if (done) return; done = true; cb(err, text); }
    if (typeof fetch === 'function') {
      fetch(url, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) { fin(null, text); })
        .catch(function (e) { fin(e || new Error('fetch failed')); });
      return;
    }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 8000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) fin(null, xhr.responseText);
        else fin(new Error('HTTP ' + xhr.status));
      };
      xhr.onerror = function () { fin(new Error('network')); };
      xhr.ontimeout = function () { fin(new Error('timeout')); };
      xhr.send();
    } catch (e2) { fin(e2); }
  }

  /* GitHub Releases latest -> banner when newer than the running UI. */
  function checkSelfUpdate() {
    var cur = currentAppVersion();
    if (!cur || W.state.chainStarted) return;
    fetchJsonText(SELFUPD_GH_LATEST, function (err, text) {
      var j, tag, assets, i, a, url = '', dismissed = '', asha = '', asize = 0;
      if (err || W.state.chainStarted) return;
      try { j = JSON.parse(text); } catch (e) { return; }
      if (!j || j.draft || j.prerelease) return;
      tag = String(j.tag_name || j.name || '').replace(/^\s+|\s+$/g, '').replace(/^[vV]/, '');
      if (!semverParts(tag) || cmpSemver(tag, cur) <= 0) { hideSelfUpdateBanner(); return; }
      assets = j.assets || [];
      for (i = 0; i < assets.length; i++) {
        a = assets[i] || {};
        if (String(a.name || '').toLowerCase() === SELFUPD_ASSET) { url = a.browser_download_url || ''; asha = String(a.digest || '').replace(/^sha256:/i, ''); asize = a.size || 0; break; }
      }
      if (!url) {
        for (i = 0; i < assets.length; i++) {
          a = assets[i] || {};
          if (/^wk-dual-payload.*\.elf$/i.test(String(a.name || ''))) { url = a.browser_download_url || ''; asha = String(a.digest || '').replace(/^sha256:/i, ''); asize = a.size || 0; break; }
        }
      }
      try { dismissed = localStorage.getItem(SELFUPD_DISMISS_KEY) || ''; } catch (e2) { }
      if (dismissed && cmpSemver(dismissed, tag) >= 0) return;
      showSelfUpdateBanner({
        version: semverParts(tag).join('.'),
        tag: tag,
        url: url,
        sha256: /^[0-9a-f]{64}$/i.test(asha) ? asha : '',
        size: asize,
        page: j.html_url || SELFUPD_RELEASES_URL
      });
    });
  }

  function ensureSelfUpdateBannerVisible() {
    var box = document.getElementById('selfupd');
    if (box) box.classList.add('show');
  }

  /* Elf-style: Image + hidden iframe GET to elfldr. Mixed-content safe on
     https Pages; on http :1022 WebKit often rejects fetch(no-cors) even when
     elfldr is up, so never treat network failure as "elfldr not running". */
  

  /* Reliable path: Elf Launcher :1000 downloads the release asset natively
     (follows GitHub redirects, checks sha256) then pushes raw bytes to
     elfldr via /run. Real errors are reported; elfldr ?uri= is fallback only. */
  var SELFUPD_DISK_NAME = 'wk-dual-payload.elf';
  function waitForElfLauncher(maxTries, cb) {
    var n = 0;
    function tick() {
      n++;
      W.launcher.probeElfLauncherHttp(function (up) {
        if (up) { cb(true); return; }
        if (n >= maxTries) { cb(false); return; }
        setTimeout(tick, 1000);
      });
    }
    tick();
  }
  function installWkViaLauncher(info, cb) {
    var base = 'http://127.0.0.1:1000';
    var q = base + '/update?path=' + encodeURIComponent(SELFUPD_DISK_NAME) +
      '&url=' + encodeURIComponent(info.url) +
      '&sha256=' + encodeURIComponent(info.sha256) +
      (info.size ? '&size=' + encodeURIComponent(String(info.size | 0)) : '') +
      '&t=' + Date.now();
    W.uiLog('[update] Elf Launcher :1000 downloading WK ' + info.version + ' ...', 'info');
    fetch(q, { cache: 'no-store' }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { }
        return { ok: r.ok, j: j, txt: txt };
      });
    }).then(function (u) {
      if (!u.ok || !(u.j && u.j.ok)) {
        cb(false, (u.j && u.j.message) || u.txt || 'download failed');
        return;
      }
      W.uiLog('[update] downloaded ' + u.j.bytes + ' bytes - sending to elfldr ...', 'success');
      /* /run text reply has no CORS header: no-cors still delivers the POST. */
      fetch(base + '/run?path=' + encodeURIComponent(SELFUPD_DISK_NAME) + '&t=' + Date.now(),
        { method: 'POST', mode: 'no-cors', cache: 'no-store' })
        .then(function () { cb(true); })
        .catch(function (e) { cb(false, 'run: ' + (e && e.message || e)); });
    }).catch(function (e) {
      cb(false, ':1000 ' + (e && e.message || e));
    });
  }

  function waitForNewWkAndReload(ver) {
    var tries = 0;
    var maxTries = 80;
    ensureSelfUpdateBannerVisible();
    selfUpdateMessage(W.t('selfUpdateInstalling', { ver: ver }));
    W.uiLog('[update] waiting for installer ' + ver + ' on :1022 ...', 'info');
    function tick() {
      tries++;
      function again() {
        if (tries >= maxTries) {
          selfUpdateMessage(W.t('selfUpdateFail', { msg: 'install timeout' }));
          return;
        }
        setTimeout(tick, 1500);
      }
      var url = 'http://127.0.0.1:1022/version';
      if (typeof fetch === 'function') {
        fetch(url, { cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (body) {
            body = String(body || '').replace(/^\s+|\s+$/g, '');
            if (body && (cmpSemver(body, ver) >= 0 || body.indexOf(ver) === 0)) {
              rememberSelfUpdateDismiss(ver);
              selfUpdateMessage(W.t('selfUpdateReloading', { ver: ver }));
              W.uiLog('[update] :1022 reports ' + body + ' - reloading', 'success');
              setTimeout(function () {
                try { location.href = 'http://127.0.0.1:1022/?v=' + encodeURIComponent(ver); }
                catch (e) { try { location.reload(); } catch (e2) { } }
              }, 900);
              return;
            }
            again();
          })
          .catch(again);
        return;
      }
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 4000;
        xhr.onload = function () {
          var body = String(xhr.responseText || '').replace(/^\s+|\s+$/g, '');
          if (xhr.status >= 200 && xhr.status < 300 && body &&
              (cmpSemver(body, ver) >= 0 || body.indexOf(ver) === 0)) {
            rememberSelfUpdateDismiss(ver);
            selfUpdateMessage(W.t('selfUpdateReloading', { ver: ver }));
            setTimeout(function () {
              try { location.href = 'http://127.0.0.1:1022/?v=' + encodeURIComponent(ver); }
              catch (e) { try { location.reload(); } catch (e2) { } }
            }, 900);
            return;
          }
          again();
        };
        xhr.onerror = again;
        xhr.ontimeout = again;
        xhr.send();
      } catch (e3) { again(); }
    }
    setTimeout(tick, 2500);
  }

  function applySelfUpdateNow(reason) {
    var info = W.state.selfUpdateInfo;
    var btn = document.getElementById('selfupddl');
    if (!info || !info.url || W.state.selfUpdateSent) return;
    W.state.selfUpdateSent = true;
    W.state.pendingSelfUpdate = false;
    W.state.updateOnlyMode = true;
    ensureSelfUpdateBannerVisible();
    if (btn) btn.disabled = true;
    selfUpdateMessage(W.t('selfUpdating', { ver: info.version }));
    W.uiLog('[update] applying ' + info.version + (reason ? ' (' + reason + ')' : '') + ' - WK ELF only', 'info');
    function legacy() {
      W.uiLog('[update] fallback: elfldr ?uri= (no :1000 / no sha256)', 'warning');
      W.launcher.sendUrlToElfldr(info.url, function () {
        if (btn) btn.disabled = false;
        selfUpdateMessage(W.t('selfUpdated', { ver: info.version }));
        waitForNewWkAndReload(info.version);
      });
    }
    if (!info.sha256 || typeof fetch !== 'function') { legacy(); return; }
    function go() {
      installWkViaLauncher(info, function (ok, msg) {
        if (btn) btn.disabled = false;
        if (!ok) {
          W.state.selfUpdateSent = false;
          W.uiLog('[update] failed: ' + msg, 'error');
          selfUpdateMessage(W.t('selfUpdateFail', { msg: msg }));
          return;
        }
        selfUpdateMessage(W.t('selfUpdated', { ver: info.version }));
        waitForNewWkAndReload(info.version);
      });
    }
    function failNoLauncher() {
      if (btn) btn.disabled = false;
      W.state.selfUpdateSent = false;
      W.uiLog('[update] Elf Launcher :1000 did not start - cannot download WK', 'error');
      selfUpdateMessage(W.t('selfUpdateFail', { msg: 'Elf Launcher :1000 not running' }));
    }
    /* Chain already sent elf-launcher.elf this session: just wait for :1000. */
    if (W.state.forceAutoloadName === 'elf-launcher.elf') {
      W.uiLog('[update] waiting for Elf Launcher :1000 ...', 'info');
      waitForElfLauncher(30, function (upA) { if (upA) go(); else failNoLauncher(); });
      return;
    }
    waitForElfLauncher(5, function (up) {
      if (up) { go(); return; }
      /* JB already done in this page: ask the exploit iframe to send the
         bundled elf-launcher.elf to elfldr, then wait for :1000. */
      W.uiLog('[update] :1000 down - sending elf-launcher.elf first ...', 'info');
      var asked = false;
      try {
        var w = W.els.exploit && W.els.exploit.contentWindow;
        if (w) { w.postMessage({ type: 'wkal', kind: 'resend-autoload', name: 'elf-launcher.elf' }, '*'); asked = true; }
      } catch (eW) { }
      if (!asked) { failNoLauncher(); return; }
      waitForElfLauncher(30, function (up2) {
        if (up2) go(); else failNoLauncher();
      });
    });
  }

  /* After JB / elfldr ready: flush a queued Update click once. */
  function maybeApplyPendingSelfUpdate(reason) {
    if (!W.state.pendingSelfUpdate || !W.state.selfUpdateInfo || !W.state.selfUpdateInfo.url || W.state.selfUpdateSent) return;
    if (W.state.autoloadPending && reason !== 'autoload-ok') return;
    applySelfUpdateNow(reason || 'after-jb');
  }

  function downloadSelfUpdate() {
    var info = W.state.selfUpdateInfo;
    var btn = document.getElementById('selfupddl');
    if (!info) return;
    if (/PlayStation/i.test(navigator.userAgent) && info.url) {
      W.state.pendingSelfUpdate = true;
      W.state.updateOnlyMode = true;
      W.state.selfUpdateSent = false;
      ensureSelfUpdateBannerVisible();
      if (btn) btn.disabled = true;
      /* Already jailbroken this session: send WK only. */
      if (W.state.finished) {
        applySelfUpdateNow('manual');
        return;
      }
      /* Start JB with wkal-skip (no tip). Apply runs after elfldr ready. */
      selfUpdateMessage(W.t('selfUpdateStartJb', { ver: info.version }));
      W.uiLog('[update] starting jailbreak for WK ' + info.version + ' install only', 'info');
      if (!W.state.chainStarted) {
        try {
          var go = document.getElementById('startJailbreak');
          if (go) go.disabled = true;
        } catch (e0) { }
        W.start();
      } else {
        selfUpdateMessage(W.t('selfUpdateAfterJb'));
      }
      return;
    }
    try { window.open(info.url || info.page || SELFUPD_RELEASES_URL, '_blank'); } catch (e) { }
    rememberSelfUpdateDismiss(info.version);
    selfUpdateMessage(W.t('selfUpdateOpened', { ver: info.version }), 6000);
  }

  function bindSelfUpdateUi() {
    var dl = document.getElementById('selfupddl');
    var dx = document.getElementById('selfupdx');
    if (dl) dl.onclick = function () { downloadSelfUpdate(); return false; };
    if (dx) dx.onclick = function () { dismissSelfUpdate(); return false; };
    setTimeout(checkSelfUpdate, 900);
  }


W.selfupd.currentAppVersion = currentAppVersion;
W.selfupd.maybeApplyPending = maybeApplyPendingSelfUpdate;
W.selfupd.bind = bindSelfUpdateUi;
W.selfupd.paint = paintSelfUpdateBanner;
W.selfupd.check = checkSelfUpdate;
})(typeof window !== 'undefined' ? window : this);
