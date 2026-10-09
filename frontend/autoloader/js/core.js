(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};

W.t = function (key, vars) {
  if (g.WKAL_I18N && typeof g.WKAL_I18N.t === 'function') return g.WKAL_I18N.t(key, vars);
  return key;
};

W.els = {};
W.state = {
  finished: false,
  autoloadPending: false,
  chainStarted: false,
  mirroredLines: 0,
  lastStageText: '',
  lastStageCls: '',
  lastSummaryText: '',
  earlyLinesLogged: 0,
  lastFrameUrl: '',
  repairCount: 0,
  mirrorTimer: 0,
  progressPct: 0,
  progressDone: false,
  progressTimer: 0,
  elapsedTimer: 0,
  elapsedStart: 0,
  launcherHttpOpenStarted: false,
  elfHttpAlreadyUp: false,
  launcherChoice: 'elf-launcher',
  exploitMode: null,
  EXPLOIT_URL: '',
  UMTX2_URL: '',
  P2JB_URL: '',
  RELAPSE_URL: '',
  POOPS_URL: '',
  forceAutoloadName: '',
  pendingSelfUpdate: false,
  selfUpdateSent: false,
  updateOnlyMode: false,
  selfUpdateInfo: null,
  selfUpdateMsgTimer: 0,
  stallTimer: 0,
  lastProgressAt: 0,
  runStage: 'idle', /* idle|countdown|early|armed|done|fail */
  safeRetryLeft: 0,
  historyPrefer: null
};

W.MAX_LOG_LINES = 80;
W.LS_LAUNCHER_KEY = 'wkal_postjb_launcher';
W.LS_ELFLAUNCHER_SHA = 'wkal_elflauncher_sha';
W.LS_ELFLAUNCHER_VER = 'wkal_elflauncher_ver';
W.LS_CHAIN_KEY = 'wkal_chain_pref';
W.LS_AUTO_KEY = 'wkal_auto_jb';
W.LS_DELAY_KEY = 'wkal_start_delay';
W.LS_RETRY_KEY = 'wkal_safe_retries';
W.LS_THEME_KEY = 'wkal-theme';
W.LS_SOUND_KEY = 'wkal_sound';
W.LS_HISTORY_KEY = 'wkal_jb_history';
W.CHOICE_ELF_LAUNCHER = 'elf-launcher';
W.BUNDLED_ELFLAUNCHER_SHA = '0d109ace6701321e00100234304989fa7edbc861695ee70868c9696745d222e5';
W.BUNDLED_ELFLAUNCHER_VER = 'tip';
W.CONSOLE_MIRROR_URI = 'file:///data/elf-launcher/mirror/elf-launcher.elf';
W.STALL_MS = 18000;

W.UMTX2_FIRMWARES = ["1.00","1.01","1.02","1.05","1.10","1.11","1.12","1.13","1.14","2.00","2.20","2.25","2.26","2.30","2.50","2.70","3.00","3.10","3.20","3.21","4.00","4.02","4.03","4.50","4.51","5.00","5.02","5.10","5.50"];
W.P2JB_FIRMWARES = ["12.02","12.20","12.40","12.60","12.70"];
W.RELAPSE_FIRMWARES = ["7.00","7.01","7.20","7.40","7.60","7.61","8.00","8.20","8.40","8.60","9.00","9.20","9.40","9.60","10.00","10.01","10.20","10.40","10.60","11.00","11.20","11.60","12.00","12.02","12.20","12.40","12.60","12.70","13.00","13.20","13.40","13.42","13.60"];
/* Poops range 7.00-12.00 inclusive. Optional alt to Relapse; Relapse stays default. */
W.POOPS_FIRMWARES = ["7.00","7.01","7.20","7.40","7.60","7.61","8.00","8.20","8.40","8.60","9.00","9.20","9.40","9.60","10.00","10.01","10.20","10.40","10.60","11.00","11.20","11.60","12.00"];

W.EXPLOIT_MODE = '[[EXPLOIT_MODE]]';
if (W.EXPLOIT_MODE.indexOf('[[') === 0) W.EXPLOIT_MODE = 'auto';

W.bindEls = function () {
  var d = document;
  W.els.splash = d.getElementById('splash');
  W.els.loader = d.getElementById('loader');
  W.els.logContainer = d.getElementById('logContainer');
  W.els.progressBar = d.getElementById('progressBar');
  W.els.progressLabel = d.getElementById('progressLabel');
  W.els.progressPct = d.getElementById('progressPct');
  W.els.statusMsg = d.getElementById('statusMsg');
  W.els.metaMsg = d.getElementById('metaMsg');
  W.els.elapsedMsg = d.getElementById('elapsedMsg');
  W.els.failMsg = d.getElementById('failMsg');
  W.els.successMsg = d.getElementById('successMsg');
  W.els.exploit = d.getElementById('exploit');
  W.els.stallMsg = d.getElementById('stallMsg');
  W.els.nextTile = d.getElementById('nextTile');
  W.els.detectChip = d.getElementById('detectChip');
  W.els.countdownHint = d.getElementById('countdownHint');
  W.els.chainHint = d.getElementById('chainHint');
  W.els.unsupportedMsg = d.getElementById('unsupportedMsg');
  W.els.historyList = d.getElementById('historyList');
  W.els.historyEmpty = d.getElementById('historyEmpty');
  W.els.progressRing = d.getElementById('progressRing');
  try { if (W.els.exploit) W.els.exploit.src = 'about:blank'; } catch (e) {}
};

W.detectFirmware = function () {
  var m = /PlayStation 5\/(\d+\.\d+)/.exec(navigator.userAgent);
  if (!m) return null;
  return { str: m[1], num: parseFloat(m[1]) };
};

W.formatElapsed = function (ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  s = s % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
};

W.lsGet = function (k, d) {
  try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; }
};
W.lsSet = function (k, v) {
  try { localStorage.setItem(k, v); } catch (e) {}
};

W.uiLog = function (message, type) {
  type = type || 'info';
  var logContainer = W.els.logContainer;
  if (!logContainer) return;
  var wrap = logContainer.parentNode;
  if (!wrap || wrap.hidden) return;
  var entry = document.createElement('div');
  entry.className = 'line ' + type;
  entry.textContent = message;
  logContainer.appendChild(entry);
  while (logContainer.childElementCount > W.MAX_LOG_LINES) {
    logContainer.removeChild(logContainer.firstChild);
  }
  wrap.scrollTop = wrap.scrollHeight;
  return entry;
};

W.touchProgress = function () {
  W.state.lastProgressAt = Date.now();
  if (W.ui && W.ui.hideStall) W.ui.hideStall();
};

W.updateProgress = function (percent, message) {
  percent = Math.max(0, Math.min(100, percent | 0));
  if (!W.state.progressDone && percent < W.state.progressPct && percent !== 0) {
  } else {
    W.state.progressPct = percent;
  }
  W.touchProgress();
  var bar = W.els.progressBar;
  if (bar) {
    var scale = 'scaleX(' + (W.state.progressPct / 100) + ')';
    if (bar.__scale !== scale) {
      bar.__scale = scale;
      bar.style.webkitTransform = scale;
      bar.style.transform = scale;
    }
  }
  var pctEl = W.els.progressPct;
  if (pctEl) {
    var pctText = W.state.progressPct + '%';
    if (pctEl.textContent !== pctText) pctEl.textContent = pctText;
  }
  var ring = W.els.progressRing;
  if (ring) {
    var deg = Math.round(W.state.progressPct * 3.6);
    ring.style.background = 'conic-gradient(var(--pri) ' + deg + 'deg, var(--card2) 0)';
  }
  if (message) {
    if (W.els.progressLabel) W.els.progressLabel.textContent = message;
    W.uiLog(message, 'info');
  }
  if (W.state.progressPct >= 100) {
    W.state.progressDone = true;
    try { document.body.className = 'done'; } catch (e) {}
    if (W.els.statusMsg) W.els.statusMsg.style.display = 'none';
  }
};

W.bumpProgressFloor = function (floor) {
  if (W.state.progressDone) return;
  if (floor > W.state.progressPct) W.updateProgress(floor);
};

W.startProgressDriver = function () {
  if (W.state.progressTimer) return;
  W.state.progressTimer = setInterval(function () {
    if (W.state.progressDone) {
      clearInterval(W.state.progressTimer);
      W.state.progressTimer = 0;
      return;
    }
    if (W.state.progressPct >= 94) return;
    var next = W.state.progressPct + Math.max(0.55, (94 - W.state.progressPct) * 0.055);
    if (next > 94) next = 94;
    var floored = Math.floor(next * 10) / 10;
    if (floored !== W.state.progressPct) W.updateProgress(Math.floor(floored));
  }, 250);
};

W.stopElapsed = function () {
  if (W.state.elapsedTimer) {
    clearInterval(W.state.elapsedTimer);
    W.state.elapsedTimer = 0;
  }
};

W.startElapsed = function () {
  if (W.state.elapsedTimer) return;
  W.state.elapsedStart = Date.now();
  if (W.els.elapsedMsg) W.els.elapsedMsg.textContent = W.t('elapsed', { t: '0:00' });
  W.state.elapsedTimer = setInterval(function () {
    if (!W.els.elapsedMsg) return;
    var elapsedText = W.t('elapsed', { t: W.formatElapsed(Date.now() - W.state.elapsedStart) });
    if (W.els.elapsedMsg.textContent !== elapsedText) W.els.elapsedMsg.textContent = elapsedText;
  }, 1000);
};

W.formatChainLabel = function (chain) {
  if (chain === 'relapse' || chain === 'umtx2' || chain === 'poops' || chain === 'p2jb') return chain;
  return chain || '-';
};

W.setMeta = function (fwStr, chain) {
  if (!W.els.metaMsg) return;
  if (chain === 'research_ul' || chain === 'userland only' || chain === 'unsupported') {
    W.els.metaMsg.textContent = W.t('metaFwUnsupported', { fw: fwStr || '-' });
    return;
  }
  W.els.metaMsg.textContent = W.t('metaFwChain', { fw: fwStr || '-', chain: W.formatChainLabel(chain) });
};

W.finishProgressSuccess = function (message) {
  W.state.progressDone = true;
  W.state.runStage = 'done';
  W.stopElapsed();
  if (W.state.progressTimer) { clearInterval(W.state.progressTimer); W.state.progressTimer = 0; }
  if (W.state.stallTimer) { clearInterval(W.state.stallTimer); W.state.stallTimer = 0; }
  var from = W.state.progressPct;
  var start = Date.now();
  if (message && W.els.progressLabel) W.els.progressLabel.textContent = message;
  var anim = setInterval(function () {
    var p = Math.min(1, (Date.now() - start) / 900);
    W.updateProgress(Math.floor(from + (100 - from) * p));
    if (p >= 1) {
      try { clearInterval(anim); } catch (eA) {}
      W.updateProgress(100, message || W.t('jailbreakSuccess'));
    }
  }, 30);
  try { document.body.className = 'done'; } catch (e) {}
  if (W.els.successMsg) {
    W.els.successMsg.innerHTML = '<span class="check" aria-hidden="true"></span>' + W.t('jailbreakSuccess');
  }
  if (W.els.nextTile) W.els.nextTile.hidden = false;
  if (W.ui && W.ui.toast) W.ui.toast(W.t('jailbreakSuccess'), W.t('openingElf'), 'ok');
  if (W.ui && W.ui.feedback) W.ui.feedback(true);
};

W.finishProgressFail = function (message) {
  W.state.progressDone = true;
  W.state.runStage = 'fail';
  W.stopElapsed();
  if (W.state.progressTimer) { clearInterval(W.state.progressTimer); W.state.progressTimer = 0; }
  if (W.state.stallTimer) { clearInterval(W.state.stallTimer); W.state.stallTimer = 0; }
  try { document.body.className = 'fail'; } catch (e) {}
  if (W.els.failMsg) W.els.failMsg.textContent = message || W.t('jailbreakFail');
  if (W.els.statusMsg) W.els.statusMsg.style.display = 'none';
  W.uiLog(message || W.t('jailbreakFail'), 'error');
  if (W.ui && W.ui.toast) W.ui.toast(W.t('jailbreakFail'), message || '', 'bad');
  if (W.ui && W.ui.feedback) W.ui.feedback(false);
};

W.consoleHttpBase = function (port) { return 'http://127.0.0.1:' + port + '/'; };
W.withCacheBust = function (url) {
  var sep = url.indexOf('?') >= 0 ? '&' : '?';
  return url + sep + '_wkal=' + Date.now();
};

W.clearSlopkitState = function () {
  try {
    sessionStorage.removeItem('slopkit-poops:next');
    sessionStorage.removeItem('slopkit-poops:latch');
  } catch (e) {}
};


W.LS_CFI_KEY = 'wkal_cfi_model';

W.parseCfi = function (raw) {
  var s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  var m = s.match(/CFI-?(\d{4})([A-Z0-9]*)/);
  if (!m) return null;
  var num = m[1];
  var suffix = m[2] || '';
  var code = 'CFI-' + num + suffix;
  var n = parseInt(num, 10);
  var series = Math.floor(n / 100); /* 10,11,12,20,21,70,71... */
  var kind = 'PS5';
  var media = '';
  if (series === 10 || series === 11 || series === 12) {
    kind = 'Fat';
    media = (series === 11) ? 'Digital' : 'Disc';
  } else if (series === 20 || series === 21 || series === 22) {
    kind = 'Slim';
    media = (series === 21) ? 'Digital' : 'Disc';
  } else if (series === 70 || series === 71 || series === 72) {
    kind = 'Pro';
    /* Pro ships with detachable drive; 70xx typically disc-capable bundle, 71xx digital-leaning */
    media = (series === 71) ? 'Digital' : 'Disc';
  } else {
    kind = 'PS5';
    media = (n % 200 >= 100) ? 'Digital' : 'Disc';
  }
  return { code: code, kind: kind, media: media, label: kind + (media ? ' · ' + media : '') };
};

W.getCachedCfi = function () {
  var raw = W.lsGet(W.LS_CFI_KEY, '');
  return raw ? W.parseCfi(raw) : null;
};

W.setCachedCfi = function (raw) {
  var p = W.parseCfi(raw);
  if (!p) return null;
  W.lsSet(W.LS_CFI_KEY, p.code);
  return p;
};


/* Option A: best-effort pre-JB model detect (UA / WebKit quirks). Usually empty. */
W.detectCfiPreJb = function () {
  var ua = String(navigator.userAgent || '');
  var m = ua.match(/CFI-?\\d{4}[A-Z0-9]*/i);
  if (m) return W.setCachedCfi(m[0]);
  try {
    var p = String(navigator.platform || '');
    m = p.match(/CFI-?\\d{4}[A-Z0-9]*/i);
    if (m) return W.setCachedCfi(m[0]);
  } catch (e) {}
  return W.getCachedCfi(); /* fallback: saved from a prior JB */
};

/* After JB / when :1000 is up — persist model for next splash. */
W.persistCfiFromLauncher = function (cb) {
  function done(p) { if (typeof cb === 'function') try { cb(p || null); } catch (e) {} }
  function take(raw, src) {
    var p = W.setCachedCfi(raw);
    if (p) {
      W.uiLog('[model] saved ' + p.code + ' (' + p.label + ') from ' + src + ' for next run', 'success');
      if (W.ui && W.ui.syncChainUi) W.ui.syncChainUi();
      done(p);
      return true;
    }
    return false;
  }
  /* already have one */
  var cached = W.getCachedCfi();
  try {
    fetch('http://127.0.0.1:1000/sysinfo?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j) { done(cached); return; }
        if (take(j.model || j.cfi || j.consoleModel || j.hwModel || '', 'sysinfo')) return;
        if (j.info && take(j.info.model || j.info.cfi || '', 'sysinfo.info')) return;
        /* scan stringified json for CFI-xxxx */
        var blob = '';
        try { blob = JSON.stringify(j); } catch (e2) {}
        var m = blob.match(/CFI-?\\d{4}[A-Z0-9]*/i);
        if (m && take(m[0], 'sysinfo-scan')) return;
        done(cached);
      })
      .catch(function () { done(cached); });
  } catch (e3) { done(cached); }
};

W.consoleLabel = function () {
  var fw = W.detectFirmware();
  var cfi = W.getCachedCfi();
  var parts = [];
  if (fw) parts.push('FW ' + fw.str);
  else parts.push('FW —');
  if (cfi) parts.push(cfi.code + ' · ' + cfi.label);
  else parts.push(W.t ? W.t('modelAfterJb') : 'model after JB');
  return parts.join(' · ');
};

g.uiLog = function (m, t) { return W.uiLog(m, t); };
g.updateProgress = function (p, m) { return W.updateProgress(p, m); };
})(typeof window !== 'undefined' ? window : this);
