(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
W.ui = W.ui || {};

W.ui.applyTheme = function (id) {
  var h = document.documentElement;
  if (!id) {
    h.removeAttribute('data-theme');
    h.className = (h.className || '').replace(/\bdark\b/g, '').replace(/\s+/g, ' ').trim();
  } else {
    h.setAttribute('data-theme', id);
    if (id === 'gold' || id === 'black') {
      if (!/\bdark\b/.test(h.className)) h.className = (h.className + ' dark').trim();
    } else {
      h.className = (h.className || '').replace(/\bdark\b/g, '').replace(/\s+/g, ' ').trim();
    }
  }
  W.lsSet(W.LS_THEME_KEY, id || '');
};

W.ui.bindTheme = function () {
  var saved = W.lsGet(W.LS_THEME_KEY, '');
  if (/^(gray|white|gold|black)$/.test(saved)) W.ui.applyTheme(saved);
  else W.ui.applyTheme('');
  function paintOn() {
    var cur = W.lsGet(W.LS_THEME_KEY, '') || '';
    var opts = document.querySelectorAll('.themeopt');
    var i;
    for (i = 0; i < opts.length; i++) {
      var th = opts[i].getAttribute('data-theme') || '';
      if (th === cur) opts[i].classList.add('on');
      else opts[i].classList.remove('on');
    }
  }
  paintOn();
  var opts = document.querySelectorAll('.themeopt');
  var i;
  for (i = 0; i < opts.length; i++) {
    opts[i].addEventListener('click', function () {
      W.ui.applyTheme(this.getAttribute('data-theme') || '');
      paintOn();
    });
  }
};

W.ui.bindSettings = function () {
  var btn = document.getElementById('settingsBtn');
  var panel = document.getElementById('settingsPanel');
  if (!btn || !panel) return;
  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('drawer-open', open);
  }
  btn.addEventListener('click', function () { setOpen(panel.hidden); });
  var x = document.getElementById('settingsClose');
  if (x) x.addEventListener('click', function () { setOpen(false); btn.focus(); });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && !panel.hidden) setOpen(false);
  });
};

W.ui.toast = function (title, body, kind) {
  var box = document.getElementById('toast');
  if (!box) return;
  var t = document.getElementById('toastTitle');
  var b = document.getElementById('toastBody');
  var s = box.querySelector('s');
  if (t) t.textContent = title || '';
  if (b) b.textContent = body || '';
  box.className = 'show' + (kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : kind === 'warn' ? ' warn' : '');
  if (s) { if (kind === 'ok') s.innerHTML = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.12em"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; else s.textContent = (kind === 'warn' || kind === 'bad') ? '!' : '\u2022'; }
  clearTimeout(W.ui._toastT);
  W.ui._toastT = setTimeout(function () { box.className = ''; }, 5000);
};

W.ui.bindToast = function () {
  var x = document.getElementById('toastx');
  if (x) x.onclick = function () {
    var box = document.getElementById('toast');
    if (box) box.className = '';
  };
};

W.ui.soundOn = function () { return false; };

W.ui.feedback = function (ok) {
  if (!W.ui.soundOn()) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      var ctx = W.ui._ac || (W.ui._ac = new Ctx());
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.06;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(function () { try { o.stop(); } catch (e) {} }, ok ? 140 : 220);
    }
  } catch (e0) {}
  try {
    if (navigator.getGamepads) {
      var pads = navigator.getGamepads();
      var i, p;
      for (i = 0; i < pads.length; i++) {
        p = pads[i];
        if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
          p.vibrationActuator.playEffect('dual-rumble', {
            duration: ok ? 80 : 160,
            strongMagnitude: ok ? 0.3 : 0.6,
            weakMagnitude: ok ? 0.2 : 0.5
          });
        }
      }
    }
  } catch (e1) {}
};

W.ui.renderHistory = function () {
  var list = W.els.historyList;
  var empty = W.els.historyEmpty;
  if (!list) return;
  var arr = W.loadHistory();
  list.innerHTML = '';
  if (!arr.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  var i, e, row, left, right, cls;
  for (i = 0; i < Math.min(arr.length, 6); i++) {
    e = arr[i];
    row = document.createElement('div');
    row.className = 'hrow';
    left = document.createElement('span');
    left.textContent = (e.chain || '-') + (e.stage && e.stage !== 'done' && e.stage !== 'fail' ? ' · ' + e.stage : '');
    if (e.ts) {
      var dt = new Date(e.ts), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      if (!isNaN(dt.getTime())) {
        var ds = document.createElement('span');
        ds.className = 'hdate';
        ds.textContent = p2(dt.getDate()) + '/' + p2(dt.getMonth() + 1) + ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes());
        left.appendChild(ds);
      }
    }
    right = document.createElement('span');
    cls = e.result === 'ok' ? 'ok' : e.result === 'hang' ? 'hang' : 'fail';
    right.className = cls;
    right.textContent = (e.result === 'ok' ? 'OK' : e.result === 'hang' ? 'STALL' : 'FAIL')
      + (e.ms != null ? (' ' + e.ms + 'ms') : (e.duration ? (' ' + e.duration) : ''));
    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  }

};

W.ui.renderHomeInfo = function () {
  var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v || '-'; };
  var fw = null, chain = null;
  try { fw = W.detectFirmware(); } catch (e) {}
  try {
    if (!fw || W.recommendChain(fw)) {
      chain = W.state && W.state.exploitMode ? W.state.exploitMode : W.getChainPref();
    }
  } catch (e2) {}
  set('hiFw', fw && fw.str ? fw.str : '-');
  set('hiChain', chain ? chain.charAt(0).toUpperCase() + chain.slice(1) : '-');
  set('ldFw', fw && fw.str ? fw.str : '-');
  set('ldChain', chain ? chain.charAt(0).toUpperCase() + chain.slice(1) : '-');

  /* Model: live → cached CFI. Never '-' if we have a saved value. */
  var showModel = function (raw) {
    var p = raw ? W.parseCfi(raw) : null;
    if (!p && W.getCachedCfi) p = W.getCachedCfi();
    var label = '';
    if (p) {
      if (p.kind !== 'PS5') label = p.code + ' \u00b7 ' + p.kind + (p.media && p.kind !== 'Pro' ? ' ' + p.media : '');
      else label = p.code || '';
    } else if (raw) label = String(raw).slice(0, 32);
    else {
      var rawCached = W.lsGet(W.LS_CFI_KEY, '') || '';
      if (rawCached) label = String(rawCached).slice(0, 32);
    }
    set('hiModel', label || '-');
    set('ldModel', label || '-');
  };
  if (W.state && W.state.hwModel) showModel(W.state.hwModel);
  else showModel('');

  /* IP: live → localStorage. Never '-' if saved. */
  var ip = (W.state && W.state.lanIp) ? W.state.lanIp : (W.lsGet(W.LS_IP_KEY, '') || '');
  set('hiIp', ip || '-');
  set('ldIp', ip || '-');

  if (!W.ui._sysinfoAsked) {
    W.ui._sysinfoAsked = true;
    try {
      var sx = new XMLHttpRequest();
      sx.open('GET', 'http://127.0.0.1:1022/api/sysinfo?t=' + Date.now(), true);
      sx.timeout = 3000;
      sx.onload = function () {
        try {
          var j = JSON.parse(sx.responseText || '{}');
          var m = j && typeof j.model === 'string' ? j.model.replace(/[^\x20-\x7e]/g, '').trim() : '';
          if (m) {
            if (W.state) W.state.hwModel = m;
            if (W.parseCfi(m)) W.setCachedCfi(m); else W.lsSet(W.LS_CFI_KEY, m);
            showModel(m);
          }
          if (j && j.ip && /^\d+\.\d+\.\d+\.\d+$/.test(j.ip) && j.ip.indexOf('127.') !== 0) {
            if (W.state) W.state.lanIp = j.ip;
            W.lsSet(W.LS_IP_KEY, j.ip);
            set('hiIp', j.ip); set('ldIp', j.ip);
          }
        } catch (e5) {}
      };
      sx.send();
    } catch (e6) {}
  }
  if (!W.ui._netinfoAsked) {
    W.ui._netinfoAsked = true;
    try {
      var x = new XMLHttpRequest();
      x.open('GET', 'http://127.0.0.1:1022/api/netinfo?t=' + Date.now(), true);
      x.timeout = 3000;
      x.onload = function () {
        try {
          var j = JSON.parse(x.responseText || '{}');
          if (j && j.ip && /^\d+\.\d+\.\d+\.\d+$/.test(j.ip) && j.ip.indexOf('127.') !== 0) {
            if (W.state) W.state.lanIp = j.ip;
            W.lsSet(W.LS_IP_KEY, j.ip);
            set('hiIp', j.ip); set('ldIp', j.ip);
          }
        } catch (e4) {}
      };
      x.send();
    } catch (e3) {}
  }
  var a = document.getElementById('autoJailbreak');
  set('hiAuto', a ? (a.checked ? 'On' : 'Off') : '-');
};

W.ui.syncChainUi = function () {
  try { W.ui.renderHomeInfo(); } catch (eh) {}
  var fw = W.detectFirmware();
  var pref = W.getChainPref();
  var rec = fw ? W.recommendChain(fw) : null;
  var chip = W.els.detectChip;
  var unsup = W.els.unsupportedMsg;
  var umtx = document.getElementById('chainUmtx2');
  var poops = document.getElementById('chainPoops');
  var relapse = document.getElementById('chainRelapse');
  var auto = document.getElementById('chainAuto');
  var hint = W.els.chainHint;
  var start = document.getElementById('startJailbreak');

  /* Always show every chain with its FW range; grey out the ones that
   * cannot run on the detected firmware (unknown FW = leave all enabled). */
  function gate(btn, chain) {
    if (!btn) return;
    var ok = !fw || W.fwSupports(chain, fw);
    btn.hidden = false;
    btn.disabled = !ok;
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    btn.title = ok ? '' : W.t('chainOff');
    if (ok) btn.classList.remove('off'); else btn.classList.add('off');
  }
  /* umtx2 / Poops removed from UI; never show. */
  if (umtx) { umtx.hidden = true; umtx.disabled = true; }
  gate(relapse, 'relapse');
  if (poops) { poops.hidden = true; poops.disabled = true; }
  if (auto) { auto.hidden = true; auto.disabled = true; }

  var opts = document.querySelectorAll('#chainRow .opt');
  var i;
  for (i = 0; i < opts.length; i++) {
    var c = opts[i].getAttribute('data-chain');
    if (c === pref) opts[i].classList.add('on');
    else opts[i].classList.remove('on');
  }

  var unsupported = fw && fw.num >= 6.0 && fw.num < 7.0;
  if (unsup) unsup.hidden = !unsupported;
  if (start) start.disabled = !!unsupported || W.state.chainStarted;

  if (chip) {
    if (!fw) {
      chip.textContent = W.t('consoleNotDetected');
      chip.className = 'chip bad';
    } else if (unsupported) {
      chip.textContent = W.t('fwUnsupported', { fw: fw.str });
      chip.className = 'chip bad';
    } else {
      var show = pref === 'auto' ? (rec || 'auto') : pref;
      var cfi = W.getCachedCfi && W.getCachedCfi();
      if (cfi) {
        chip.textContent = W.t('fwModelChain', {
          fw: fw.str,
          model: cfi.code + ' · ' + cfi.label,
          chain: W.formatChainLabel(show)
        });
        chip.title = cfi.code + ' · ' + cfi.label;
      } else {
        chip.textContent = W.t('fwChain', {
          fw: fw.str,
          chain: W.formatChainLabel(show)
        });
        chip.title = '';
      }
      chip.className = 'chip ok';
    }
  }
  if (hint) {
    if (pref === 'auto' && rec) hint.textContent = W.t('chainAutoPicks', { chain: W.formatChainLabel(rec) });
    else if (pref === 'poops') hint.textContent = W.t('chainPoopsHint');
    else if (pref === 'relapse') hint.textContent = W.t('chainRelapseHint');
    else if (pref === 'umtx2') hint.textContent = W.t('chainUmtx2Desc');
    else hint.textContent = '';
  }
  /* Prefetch recommended chain entry for faster arm (no exploit run). */
  if (rec) W.preloadChainFiles(rec);
};

W.ui.showStall = function (allowRestart) {
  var el = W.els.stallMsg;
  if (!el) return;
  el.hidden = false;
  el.innerHTML = '';
  var p = document.createElement('p');
  p.textContent = W.t('stallHint');
  el.appendChild(p);
  if (allowRestart) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'restart';
    btn.textContent = W.t('restartPage');
    btn.onclick = function () { try { location.reload(); } catch (e) {} };
    el.appendChild(btn);
  } else {
    var p2 = document.createElement('p');
    p2.className = 'hint';
    p2.textContent = W.t('stallSensitive');
    el.appendChild(p2);
  }
  W.recordRun('hang');
};

W.ui.hideStall = function () {
  var el = W.els.stallMsg;
  if (el) { el.hidden = true; el.innerHTML = ''; }
};


W.ui.refreshCfiFromLauncher = function () {
  if (W.persistCfiFromLauncher) W.persistCfiFromLauncher(function () {});
};

W.ui.bindHome = function () {
  if (W.ui.bindSettings) W.ui.bindSettings();
  var go = document.getElementById('startJailbreak');
  var cancel = document.getElementById('cancelAutoStart');
  var auto = document.getElementById('autoJailbreak');
  var delay = document.getElementById('startDelay');
  var retry = document.getElementById('retryCount');
  var delayVal = document.getElementById('startDelayVal');
  var retryVal = document.getElementById('retryCountVal');
  var sound = document.getElementById('soundToggle');
  var openOnly = document.getElementById('openLauncherOnly');
  var autoTimer = 0;
  var remaining = 0;
  var delayCur = 3;

  function delaySec() {
    var n = parseFloat(delayCur);
    if (isNaN(n)) n = 3;
    return Math.round(Math.min(3, Math.max(0, n)));
  }
  function retryN() {
    var n = retry ? parseInt(retry.value, 10) : 1;
    if (isNaN(n) || n < 0) n = 0;
    if (n > 3) n = 3;
    return n;
  }
  function paintSliders() {
    if (delay) {
      var db = delay.querySelectorAll('.opt[data-delay]'), k;
      for (k = 0; k < db.length; k++) {
        if (Number(db[k].getAttribute('data-delay')) === delaySec()) db[k].classList.add('on');
        else db[k].classList.remove('on');
      }
    }
    if (retryVal) retryVal.textContent = String(retryN());
  }

  /* Auto-start ON by default (first visit). */
  var savedAuto = W.lsGet(W.LS_AUTO_KEY, '1');
  if (auto) auto.checked = savedAuto !== '0';
  function paintAuto() {
    var tile = document.getElementById('autoStartTile');
    var st = document.getElementById('autoStartState');
    var on = !!(auto && auto.checked);
    if (tile) { if (on) tile.classList.add('on'); else tile.classList.remove('on'); }
    if (st) st.textContent = on ? 'On' : 'Off';
    try { W.ui.renderHomeInfo(); } catch (eh) {}
  }
  paintAuto();
  if (delay) { var dv = parseFloat(W.lsGet(W.LS_DELAY_KEY, '3')); if (isNaN(dv)) dv = 3; delayCur = Math.round(Math.min(3, Math.max(0, dv))); }
  if (retry) { var rv = parseInt(W.lsGet(W.LS_RETRY_KEY, '1'), 10); if (isNaN(rv)) rv = 1; retry.value = String(Math.min(3, Math.max(0, rv))); }
  if (sound) sound.checked = W.ui.soundOn();
  paintSliders();

  function cancelCountdown() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
    W.state.runStage = 'idle';
    if (go && !W.state.chainStarted) {
      go.disabled = false;
      go.classList.remove('is-cancel');
      go.textContent = W.t('startJailbreak');
    }
    if (cancel) cancel.hidden = true;
    if (W.els.countdownHint) W.els.countdownHint.textContent = '';
  }

  function beginJailbreak() {
    if (W.state.chainStarted) return;
    cancelCountdown();
    if (go) { go.disabled = true; go.classList.remove('is-cancel'); go.textContent = W.t('starting'); }
    W.state.safeRetryLeft = retryN();
    W.state.launcherChoice = W.getLauncherChoice ? W.getLauncherChoice() : W.CHOICE_ELF_LAUNCHER;
    if (W.start) W.start();
  }

  function startCountdown() {
    if (W.state.chainStarted || autoTimer || !go) return;
    var fw = W.detectFirmware();
    if (fw && fw.num >= 6.0 && fw.num < 7.0) return;
    remaining = delaySec();
    W.state.runStage = 'countdown';
    if (remaining <= 0) { beginJailbreak(); return; }
    go.disabled = false;
    go.classList.add('is-cancel');
    go.textContent = W.t('cancel') + ' · ' + remaining;
    if (cancel) cancel.hidden = true;
    if (W.els.countdownHint) W.els.countdownHint.textContent = '';
    autoTimer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(autoTimer); autoTimer = 0;
        if (cancel) cancel.hidden = true;
        beginJailbreak();
        return;
      }
      go.textContent = W.t('cancel') + ' · ' + remaining;
    }, 1000);
  }

  var chainBtns = document.querySelectorAll('#chainRow .opt');
  var i;
  for (i = 0; i < chainBtns.length; i++) {
    chainBtns[i].addEventListener('click', function () {
      W.setChainPref('relapse');
      W.ui.syncChainUi();
    });
  }
  if (auto) auto.addEventListener('change', function () {
    W.lsSet(W.LS_AUTO_KEY, auto.checked ? '1' : '0');
    paintAuto();
    if (auto.checked) startCountdown();
    else cancelCountdown();
  });
  function onDelayMove() {
    W.lsSet(W.LS_DELAY_KEY, String(delaySec()));
    paintSliders();
  }
  function onRetryMove() {
    W.lsSet(W.LS_RETRY_KEY, String(retryN()));
    paintSliders();
  }
  if (delay) {
    delay.addEventListener('click', function (ev) {
      var b = ev.target;
      while (b && b !== delay && !(b.getAttribute && b.getAttribute('data-delay'))) b = b.parentNode;
      if (!b || b === delay) return;
      delayCur = Number(b.getAttribute('data-delay'));
      if (isNaN(delayCur)) delayCur = 3;
      onDelayMove();
    });
  }
  if (retry) {
    retry.addEventListener('input', onRetryMove);
    retry.addEventListener('change', onRetryMove);
    retry.addEventListener('mousemove', onRetryMove);
    retry.addEventListener('touchmove', onRetryMove);
  }
  if (sound) sound.addEventListener('change', function () {
    W.lsSet(W.LS_SOUND_KEY, sound.checked ? '1' : '0');
  });
  if (cancel) cancel.addEventListener('click', cancelCountdown);
  if (go) {
    var goLock = 0;
    function onGo(e) {
      if (goLock) return;
      goLock = 1;
      setTimeout(function () { goLock = 0; }, 400);
      if (e) {
        try { e.preventDefault(); } catch (e0) {}
        try { e.stopPropagation(); } catch (e1) {}
      }
      if (W.state.chainStarted) return;
      /* Same button: Start -> Cancel during countdown -> Start. */
      if (autoTimer) { cancelCountdown(); return; }
      startCountdown();
    }
    /* Click only: mousedown+click both fired onGo and cancelled the countdown. */
    go.onclick = onGo;
    go.onmousedown = null;
    go.ontouchend = null;
  }
  if (openOnly) {
    openOnly.onclick = function () {
      if (W.launcher && W.launcher.openNow) W.launcher.openNow();
    };
  }

  if (W.detectCfiPreJb) W.detectCfiPreJb();
  W.ui.syncChainUi();
  W.ui.renderHistory();

  /* Quick non-blocking probe: if Elf already up, show Open button. */
  if (W.launcher && W.launcher.probeQuick) {
    W.launcher.probeQuick(function (up) {
      if (openOnly) openOnly.hidden = !up;
      if (up) W.ui.refreshCfiFromLauncher();
    });
  }

  if (auto && auto.checked) startCountdown();

  W.ui._cancelCountdown = cancelCountdown;
  W.ui._startCountdown = startCountdown;
};

W.ui.applyLauncherChoice = function (choice) {
  var isPm = choice === W.CHOICE_PAYLOAD_MANAGER;
  var pickElf = document.getElementById('pickElf');
  var pickPm = document.getElementById('pickPm');
  var sub = document.getElementById('homeSubShort');
  var heroIco = document.getElementById('heroIco');
  if (pickElf) {
    if (isPm) pickElf.classList.remove('on');
    else pickElf.classList.add('on');
  }
  if (pickPm) {
    if (isPm) pickPm.classList.add('on');
    else pickPm.classList.remove('on');
  }
  if (sub) {
    if (isPm) {
      sub.removeAttribute('data-i18n');
      sub.textContent = (W.t('afterJb') || 'After jailbreak, open') + ' ' + (W.t('payloadManager') || 'Payload Manager');
    } else {
      sub.setAttribute('data-i18n', 'homeSubShort');
      sub.textContent = W.t('homeSubShort') || 'Then opens Elf Launcher';
    }
  }
  if (heroIco) heroIco.src = 'elf-launcher-icon.png';
  var oo = document.getElementById('openLauncherOnly');
  if (oo && !isPm) {
    /* keep existing probe-driven visibility for Elf Launcher */
  } else if (oo && isPm) {
    oo.hidden = true;
  }
};

W.ui.bindLauncherChoice = function () {
  var pickElf = document.getElementById('pickElf');
  var pickPm = document.getElementById('pickPm');
  function bind(el, choice) {
    if (!el) return;
    function pick(e) {
      if (e) {
        try { e.preventDefault(); } catch (e0) {}
        try { e.stopPropagation(); } catch (e1) {}
      }
      W.setLauncherChoice(choice);
    }
    /* Click only: mousedown+click double-fires on PS5 WebKit. */
    el.onclick = pick;
    el.onmousedown = null;
    el.ontouchend = null;
  }
  bind(pickElf, W.CHOICE_ELF_LAUNCHER);
  bind(pickPm, W.CHOICE_PAYLOAD_MANAGER);
  W.ui.applyLauncherChoice(W.getLauncherChoice());
};
})(typeof window !== 'undefined' ? window : this);