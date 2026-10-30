(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
W.ui = W.ui || {};

/* Midnight is the only theme; any stored theme value is ignored. */
W.ui.applyTheme = function () {
  document.documentElement.setAttribute('data-theme', 'midnight');
  return 'midnight';
};

W.ui.bindTheme = function () {
  return W.ui.applyTheme();
};

W.ui.bindSettings = function () {
  var btn = document.getElementById('settingsBtn');
  var page = document.getElementById('settingsPage');
  var splash = document.getElementById('splash');
  if (!btn || !page) return;
  function setOpen(open) {
    page.hidden = !open;
    page.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (splash) {
      splash.hidden = !!open;
      splash.setAttribute('aria-hidden', open ? 'true' : 'false');
    }
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('settings-open', open);
    document.body.classList.remove('drawer-open');
  }
  setOpen(false);
  btn.addEventListener('click', function () { setOpen(true); });
  var x = document.getElementById('settingsClose');
  if (x) x.addEventListener('click', function () { setOpen(false); btn.focus(); });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && !page.hidden) setOpen(false);
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
  if (s) s.textContent = kind === 'ok' ? 'OK' : kind === 'warn' ? '!' : kind === 'bad' ? '!' : '*';
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

W.ui.fmtLogTime = function (ms) {
  var d = new Date(ms || 0);
  function z(n) { return n < 10 ? '0' + n : String(n); }
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
};

W.ui.renderHistory = function () {
  var list = W.els.historyList;
  var empty = W.els.historyEmpty;
  if (!list) return;
  var arr = W.loadHistory();
  list.innerHTML = '';
  var clr = document.getElementById('clearLog');
  if (clr) clr.hidden = !arr.length;
  if (!arr.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  var i, e, row, left, when, what, right, cls, label;
  for (i = 0; i < arr.length; i++) {
    e = arr[i];
    row = document.createElement('div');
    row.className = 'hrow';
    left = document.createElement('span');
    left.className = 'hleft';
    when = document.createElement('b');
    when.textContent = W.ui.fmtLogTime(e.at);
    what = document.createElement('small');
    what.textContent = (e.chain || '-') + (e.fw && e.fw !== '-' ? ' FW ' + e.fw : '') + (e.note ? ' - ' + e.note : '');
    left.appendChild(when);
    left.appendChild(what);
    right = document.createElement('span');
    cls = e.result === 'ok' ? 'ok' : e.result === 'hang' ? 'hang' : 'fail';
    label = e.result === 'ok' ? 'Success' : e.result === 'hang' ? 'Stalled' : 'Failed';
    right.className = 'hres ' + cls;
    right.textContent = label + ' ' + (e.duration || '');
    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  }
};

W.ui.syncChainUi = function () {
  var pref = 'relapse';
  try { W.setChainPref('relapse'); } catch (e) {}
  var auto = document.getElementById('chainAuto');
  var rel = document.getElementById('chainRelapse');
  var umtx = document.getElementById('chainUmtx2');
  var poops = document.getElementById('chainPoops');
  if (auto) auto.hidden = true;
  if (umtx) umtx.hidden = true;
  if (poops) poops.hidden = true;
  if (rel) {
    rel.hidden = false;
    rel.classList.add('on');
  }
  var hint = document.getElementById('chainHint');
  if (hint) hint.textContent = W.t('chainRelapseHint') || 'Relapse only';
};


W.ui.showStall = function (allowRestart) {
  var el = W.els.stallMsg;
  if (W.setRunStatus) {
    W.setRunStatus(allowRestart ? 'Taking longer than usual. Press Start to retry' : 'Taking longer than usual. Restart the console if stuck');
  }
  if (allowRestart) {
    W.state.stallRestart = true;
    var goS = document.getElementById('startJailbreak');
    if (goS) goS.disabled = false;
  }
  if (!el) { W.recordRun('hang', 'No progress'); return; }
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
  W.recordRun('hang', 'No progress');
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
  var delayVal = document.getElementById('startDelayVal');
  var sound = document.getElementById('soundToggle');
  var openOnly = document.getElementById('openLauncherOnly');
  var autoTimer = 0;
  var remaining = 0;

  function delaySec() {
    var n = delay ? parseFloat(delay.value) : 3;
    if (isNaN(n)) n = 3;
    n = Math.round(Math.min(5, Math.max(0, n)) * 2) / 2;
    return n;
  }
  function paintSliders() {
    if (delayVal) {
      var ds = delaySec();
      delayVal.textContent = ((ds % 1 === 0) ? String(ds | 0) : String(ds)) + 's';
    }
  }

  /* Auto-start OFF by default (first visit / new key). */
  var savedAuto = W.lsGet(W.LS_AUTO_KEY, '0');
  if (auto) auto.checked = savedAuto === '1';
  if (delay) { var dv = parseFloat(W.lsGet(W.LS_DELAY_KEY, '3')); if (isNaN(dv)) dv = 3; delay.value = String(Math.round(Math.min(5, Math.max(0, dv)) * 2) / 2); }
  if (sound) sound.checked = W.ui.soundOn();
  paintSliders();

  function paintGo(label) {
    if (!go) return;
    go.textContent = label || 'START';
  }
  function cancelCountdown() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
    W.state.runStage = 'idle';
    try { document.body.classList.remove('running'); document.body.classList.remove('countdown'); } catch (eR2) {}
    if (go && !W.state.chainStarted) {
      go.disabled = false;
      go.classList.remove('is-cancel');
      paintGo(W.t('startJailbreak'));
    }
    if (cancel) cancel.hidden = true;
    if (W.els.countdownHint) W.els.countdownHint.textContent = '';
  }

  function beginJailbreak() {
    if (W.state.chainStarted) return;
    cancelCountdown();
    if (go) { go.disabled = true; go.classList.remove('is-cancel'); paintGo(W.t('starting')); }
    W.state.safeRetryLeft = 0;
    try { document.body.classList.remove('countdown'); document.body.classList.add('running'); } catch (eR) {}
    W.state.launcherChoice = W.CHOICE_ELF_LAUNCHER;
    W.lsSet(W.LS_LAUNCHER_KEY, W.CHOICE_ELF_LAUNCHER);
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
    try { document.body.classList.add('countdown'); } catch (eCd) {}
    paintGo(W.t('cancel') + ' - ' + remaining);
    if (cancel) cancel.hidden = true;
    if (W.els.countdownHint) W.els.countdownHint.textContent = '';
    autoTimer = setInterval(function () {
      remaining -= 0.5;
      if (remaining <= 0) {
        clearInterval(autoTimer); autoTimer = 0;
        if (cancel) cancel.hidden = true;
        beginJailbreak();
        return;
      }
      paintGo(W.t('cancel') + ' - ' + remaining);
    }, 500);
  }

  var chainBtns = document.querySelectorAll('#chainRow .opt');
  var i;
  for (i = 0; i < chainBtns.length; i++) {
    chainBtns[i].addEventListener('click', function () {
      W.setChainPref(this.getAttribute('data-chain') || 'auto');
      W.ui.syncChainUi();
    });
  }
  if (auto) auto.addEventListener('change', function () {
    /* Save only. Auto-start runs once at page load, never when the box is ticked. */
    W.lsSet(W.LS_AUTO_KEY, auto.checked ? '1' : '0');
    if (!auto.checked) cancelCountdown();
  });
  if (delay) delay.addEventListener('input', function () {
    W.lsSet(W.LS_DELAY_KEY, String(delaySec()));
    paintSliders();
  });
  if (sound) sound.addEventListener('change', function () {
    W.lsSet(W.LS_SOUND_KEY, sound.checked ? '1' : '0');
  });
  var clearBtn = document.getElementById('clearLog');
  if (clearBtn) clearBtn.addEventListener('click', function () { if (W.clearHistory) W.clearHistory(); });
  if (cancel) cancel.addEventListener('click', cancelCountdown);
  if (go) go.addEventListener('click', function () {
    if (W.state.chainStarted) {
      /* v13: after a failed run Start reloads the page for a clean new attempt. No cancel mid-run. */
      if (W.state.runStage === 'fail' || W.state.stallRestart) {
        try { sessionStorage.setItem('wk_start_now', '1'); } catch (eSs) {}
        try { location.reload(); } catch (eRl) {}
      }
      return;
    }
    /* Same button: Start -> Cancel during countdown -> Start. */
    if (autoTimer) { cancelCountdown(); return; }
    startCountdown();
  });
  if (openOnly) openOnly.addEventListener('click', function () {
    if (W.launcher && W.launcher.openNow) W.launcher.openNow();
  });

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

  var startNow = false;
  try { startNow = sessionStorage.getItem('wk_start_now') === '1'; sessionStorage.removeItem('wk_start_now'); } catch (eSn) {}
  if (startNow) setTimeout(beginJailbreak, 400);
  else if (auto && auto.checked) startCountdown();

  W.ui._cancelCountdown = cancelCountdown;
  W.ui._startCountdown = startCountdown;
};
})(typeof window !== 'undefined' ? window : this);
