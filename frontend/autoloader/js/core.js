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
  progressDisplay: 0,
  progressDone: false,
  progressTimer: 0,
  elapsedTimer: 0,
  elapsedStart: 0,
  launcherHttpOpenStarted: false,
  elfHttpAlreadyUp: false,
  elMirrorFirst: false,  /* boot sends console mirror EL, bundled only as fallback */
  elRefreshRan: false,
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
  progressPaused: false, /* true during Relapse kernel: no 50ms creep / ring thrash */
  progressKernelQuiet: false,
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
W.CHOICE_PAYLOAD_MANAGER = 'payload-manager';

W.getLauncherChoice = function () {
  /* Payload Manager removed from UI; always Elf Launcher. */
  return W.CHOICE_ELF_LAUNCHER;
};

W.setLauncherChoice = function (choice) {
  var v = W.CHOICE_ELF_LAUNCHER;
  W.lsSet(W.LS_LAUNCHER_KEY, v);
  W.state.launcherChoice = v;
  if (W.ui && W.ui.applyLauncherChoice) W.ui.applyLauncherChoice(v);
  return v;
};

W.BUNDLED_ELFLAUNCHER_SHA = '1b4494e669ef07525c77036777d36a20f1eb81a708fe8262b26ffffa9452f547';
W.BUNDLED_ELFLAUNCHER_VER = 'tip';
W.CONSOLE_MIRROR_URI = 'file:///data/elf-launcher/mirror/elf-launcher.elf';
W.STALL_MS = 18000;

W.UMTX2_FIRMWARES = ["1.00","1.01","1.02","1.05","1.10","1.11","1.12","1.13","1.14","2.00","2.20","2.25","2.26","2.30","2.50","2.70","3.00","3.10","3.20","3.21","4.00","4.02","4.03","4.50","4.51","5.00","5.02","5.10","5.50"];
W.P2JB_FIRMWARES = ["12.02","12.20","12.40","12.60","12.70"];
W.RELAPSE_FIRMWARES = ["7.00","7.01","7.20","7.40","7.60","7.61","8.00","8.20","8.40","8.60","9.00","9.20","9.40","9.60","10.00","10.01","10.20","10.40","10.60","11.00","11.20","11.60","12.00","12.02","12.20","12.40","12.60","12.70","13.00","13.20","13.40","13.42","13.60"];
/* Poops range 7.00-12.00 inclusive. Optional alt to Relapse; Relapse stays default. */
W.POOPS_FIRMWARES = ["7.00","7.01","7.20","7.40","7.60","7.61","8.00","8.20","8.40","8.60","9.00","9.20","9.40","9.60","10.00","10.01","10.20","10.40","10.60","11.00","11.20","11.60","12.00"];

W.EXPLOIT_MODE = 'auto';
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

/* Local wall-clock for the JB run (English digits, no new i18n keys). */
W.formatLocalDateTime = function (ms) {
  var d = new Date(typeof ms === 'number' ? ms : Date.now());
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

/* Elapsed line: only "Elapsed 0:42". Date/time lives in Recent jailbreaks. */
W.paintElapsedLine = function (elapsedStr) {
  if (!W.els.elapsedMsg) return;
  W.els.elapsedMsg.textContent = W.t('elapsed', { t: elapsedStr || '0:00' });
};

W.lsGet = function (k, d) {
  try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; }
};
W.lsSet = function (k, v) {
  try { localStorage.setItem(k, v); } catch (e) {}
};

W.uiLog = function (message, type) {
  /* Quiet UI: no debug lines on screen. */
  return null;
};

W.touchProgress = function () {
  W.state.lastProgressAt = Date.now();
  if (W.ui && W.ui.hideStall) W.ui.hideStall();
};

W.applyProgressVisual = function (display, message) {
  /* v25: no step or % text; bar and ring only. */
  if (display < 0) display = 0;
  if (display > 100) display = 100;
  W.state.progressDisplay = display;
  var bar = W.els.progressBar;
  if (bar) {
    var pct = (display / 100 * 100).toFixed(1) + '%';
    if (bar.__w !== pct) {
      bar.__w = pct;
      bar.style.width = pct;
      bar.style.webkitTransform = 'none';
      bar.style.transform = 'none';
    }
  }
  var pctEl = W.els.progressPct;
  if (pctEl) {
    var pctText = 'Jailbreak';
    if (pctEl.textContent !== pctText) pctEl.textContent = pctText;
  }
  var ring = W.els.progressRing;
  if (ring) {
    var deg = Math.round(display * 3.6);
    var bg = 'conic-gradient(var(--pri) ' + deg + 'deg, var(--card2) 0)';
    if (ring.__bg !== bg) {
      ring.__bg = bg;
      ring.style.background = bg;
    }
  }
  /* Quiet JB: no status/label text while the chain runs; % alone is enough. */
  if (W.els.progressLabel) {
    try { W.els.progressLabel.textContent = ''; } catch (eL) {}
  }
};

W.updateProgress = function (percent, message, snap) {
  percent = Math.max(0, Math.min(100, +percent));
  if (!W.state.progressDone && percent < W.state.progressPct && percent !== 0) {
  } else {
    W.state.progressPct = percent;
  }
  W.touchProgress();
  if (W.state.progressDisplay > W.state.progressPct) {
    W.state.progressDisplay = W.state.progressPct;
  }
  /* Always snap: one paint per real event, no eased intermediate paints. */
  W.state.progressDisplay = W.state.progressPct;
  W.applyProgressVisual(W.state.progressPct, null);
  if (W.state.progressPct >= 100 && W.state.progressDisplay >= 99.2) {
    W.applyProgressVisual(100, message);
    W.state.progressDone = true;
    try { document.body.className = 'done'; } catch (e) {}
    if (W.els.statusMsg) W.els.statusMsg.style.display = 'none';
  }
};

W.bumpProgressFloor = function (floor) {
  if (W.state.progressDone) return;
  if (floor > W.state.progressPct) {
    /* Real floor: snap the visible bar/ring immediately. Do not depend on the
       50ms driver (paused during Relapse kernel quiet). Stay quiet if already. */
    W.updateProgress(floor, null, true);
  }
};

W.pauseProgressDriver = function () {
  W.state.progressPaused = true;
  if (W.state.progressTimer) {
    clearInterval(W.state.progressTimer);
    W.state.progressTimer = 0;
  }
};

W.resumeProgressDriver = function () {
  W.state.progressPaused = false;
  W.startProgressDriver();
};

W.enterKernelQuiet = function () {
  /* Relapse kernel stage: stop 50ms creep + conic-gradient thrash on #progressRing. */
  if (W.state.progressKernelQuiet) return;
  W.state.progressKernelQuiet = true;
  W.pauseProgressDriver();
};

W.leaveKernelQuiet = function () {
  if (!W.state.progressKernelQuiet) return;
  W.state.progressKernelQuiet = false;
  if (!W.state.progressDone) W.resumeProgressDriver();
};

W.startProgressDriver = function () {
  /* Quiet JB: no 50ms fake creep / conic-gradient thrash during the chain.
     Percent updates only from real mirror floors (bumpProgressFloor / snap). */
  if (W.state.progressTimer) {
    clearInterval(W.state.progressTimer);
    W.state.progressTimer = 0;
  }
};

W.stopElapsed = function () {
  if (W.state.elapsedTimer) {
    clearInterval(W.state.elapsedTimer);
    W.state.elapsedTimer = 0;
  }
  /* Freeze final elapsed + start date/time on the same line. */
  if (W.els.elapsedMsg && W.state.elapsedStart) {
    W.paintElapsedLine(W.formatElapsed(Date.now() - W.state.elapsedStart));
  }
};

W.startElapsed = function () {
  if (W.state.elapsedTimer) return;
  W.state.elapsedStart = Date.now();
  W.state.jbStartedAt = W.state.elapsedStart;
  W.paintElapsedLine('0:00');
  W.state.elapsedTimer = setInterval(function () {
    if (!W.els.elapsedMsg) return;
    W.paintElapsedLine(W.formatElapsed(Date.now() - W.state.elapsedStart));
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


W.uiSetPayload = function (id, tag, on) {
  var li = document.getElementById(id);
  var tg = document.getElementById(id + 'Tag');
  var t = String(tag || (on ? 'READY' : 'WAIT'));
  if (li) {
    li.classList.remove('off', 'ok', 'warn');
    var tl = t.toLowerCase();
    if (!on || tl === 'wait') li.classList.add('off');
    else if (tl === 'ready' || tl === 'open') li.classList.add('ok');
    else li.classList.add('warn');
  }
  if (tg) tg.textContent = t;
};

W.finishProgressSuccess = function (message) {
  W.state.progressDone = true;
  W.state.runStage = 'done';
  W.state.progressKernelQuiet = false;
  W.state.progressPaused = false;
  W.stopElapsed();
  if (W.state.progressTimer) { clearInterval(W.state.progressTimer); W.state.progressTimer = 0; }
  if (W.state.stallTimer) { clearInterval(W.state.stallTimer); W.state.stallTimer = 0; }
  if (message && W.els.progressLabel) W.els.progressLabel.textContent = message;
  /* Jump straight to 100% - do not ease from a lagged display during kernel quiet. */
  W.state.progressPct = 100;
  W.state.progressDisplay = 100;
  W.applyProgressVisual(100, message || W.t('jailbreakSuccess'));
  try { document.body.className = 'done'; } catch (e) {}
  try { if (W.uiSetPayload) { W.uiSetPayload('plElfldr','READY',true); } if (W.ui) { W.ui._sysinfoAsked = false; W.ui._netinfoAsked = false; if (W.ui.renderHomeInfo) W.ui.renderHomeInfo(); if (W.ui.renderHistory) W.ui.renderHistory(); } } catch (eP) {}
  if (W.els.successMsg) {
    W.els.successMsg.textContent = 'Jailbroken';
    W.els.successMsg.hidden = false;
  }
  if (W.els.nextTile) W.els.nextTile.hidden = true;
  if (W.ui && W.ui.toast) {
    var wantPm = (W.state.forceAutoloadName === 'pldmgr.elf')
      || (W.state.launcherChoice === W.CHOICE_PAYLOAD_MANAGER);
    W.ui.toast(W.t('jailbreakSuccess'), wantPm ? 'Opening Payload Manager...' : W.t('openingElf'), 'ok');
  }
  if (W.ui && W.ui.feedback) W.ui.feedback(true);
};

W.finishProgressFail = function (message) {
  W.state.progressDone = true;
  W.state.runStage = 'fail';
  W.state.progressKernelQuiet = false;
  W.state.progressPaused = false;
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
W.LS_IP_KEY = 'wkal_lan_ip';

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
  var m = ua.match(/CFI-?\d{4}[A-Z0-9]*/i);
  if (m) return W.setCachedCfi(m[0]);
  try {
    var p = String(navigator.platform || '');
    m = p.match(/CFI-?\d{4}[A-Z0-9]*/i);
    if (m) return W.setCachedCfi(m[0]);
  } catch (e) {}
  return W.getCachedCfi(); /* fallback: saved from a prior JB */
};

/* After JB / when :1000 is up - persist model for next splash. */
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
        var m = blob.match(/CFI-?\d{4}[A-Z0-9]*/i);
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
  else parts.push('FW -');
  if (cfi) parts.push(cfi.code + ' · ' + cfi.label);
  return parts.join(' · ');
};

g.uiLog = function (m, t) { return W.uiLog(m, t); };
g.updateProgress = function (p, m) { return W.updateProgress(p, m); };
})(typeof window !== 'undefined' ? window : this);
