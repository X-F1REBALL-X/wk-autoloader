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
  btn.addEventListener('click', function () {
    var open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
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
  if (s) s.textContent = kind === 'ok' ? '✓' : kind === 'warn' ? '!' : kind === 'bad' ? '!' : '•';
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

W.ui.soundOn = function () {
  return W.lsGet(W.LS_SOUND_KEY, '1') !== '0';
};

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
    right = document.createElement('span');
    cls = e.result === 'ok' ? 'ok' : e.result === 'hang' ? 'hang' : 'fail';
    right.className = cls;
    right.textContent = (e.result === 'ok' ? 'OK' : e.result === 'hang' ? 'STALL' : 'FAIL') + ' ' + (e.duration || '');
    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  }
};

W.ui.syncChainUi = function () {
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

  if (umtx) umtx.hidden = !(fw && W.fwSupports('umtx2', fw));
  if (poops) poops.hidden = !(fw && W.fwSupports('poops', fw));
  if (relapse) relapse.hidden = !(fw && W.fwSupports('relapse', fw));

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
      var modelBit = cfi ? (cfi.code + ' · ' + cfi.label) : W.t('modelAfterJb');
      chip.textContent = W.t('fwModelChain', {
        fw: fw.str,
        model: modelBit,
        chain: W.formatChainLabel(show)
      });
      chip.className = 'chip ok';
      chip.title = modelBit;
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

  function delaySec() {
    var n = delay ? parseInt(delay.value, 10) : 3;
    if (isNaN(n) || n < 0) n = 0;
    if (n > 10) n = 10;
    return n;
  }
  function retryN() {
    var n = retry ? parseInt(retry.value, 10) : 1;
    if (isNaN(n) || n < 0) n = 0;
    if (n > 3) n = 3;
    return n;
  }
  function paintSliders() {
    if (delayVal) delayVal.textContent = delaySec() + 's';
    if (retryVal) retryVal.textContent = String(retryN());
  }

  /* Auto-start ON by default (first visit). */
  var savedAuto = W.lsGet(W.LS_AUTO_KEY, '1');
  if (auto) auto.checked = savedAuto !== '0';
  if (delay) delay.value = String(Math.min(10, Math.max(0, parseInt(W.lsGet(W.LS_DELAY_KEY, '3'), 10) || 3)));
  if (retry) retry.value = String(Math.min(3, Math.max(0, parseInt(W.lsGet(W.LS_RETRY_KEY, '1'), 10) || 1)));
  if (sound) sound.checked = W.ui.soundOn();
  paintSliders();

  function cancelCountdown() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
    W.state.runStage = 'idle';
    if (go && !W.state.chainStarted) {
      go.disabled = false;
      go.textContent = W.t('startJailbreak');
    }
    if (cancel) cancel.hidden = true;
    if (W.els.countdownHint) W.els.countdownHint.textContent = '';
  }

  function beginJailbreak() {
    if (W.state.chainStarted) return;
    cancelCountdown();
    if (go) { go.disabled = true; go.textContent = W.t('starting'); }
    W.state.safeRetryLeft = retryN();
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
    go.disabled = true;
    go.textContent = W.t('startingIn', { n: remaining });
    if (cancel) cancel.hidden = false;
    if (W.els.countdownHint) W.els.countdownHint.textContent = W.t('countdownHint');
    autoTimer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(autoTimer); autoTimer = 0;
        if (cancel) cancel.hidden = true;
        beginJailbreak();
        return;
      }
      go.textContent = W.t('startingIn', { n: remaining });
    }, 1000);
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
    W.lsSet(W.LS_AUTO_KEY, auto.checked ? '1' : '0');
    if (auto.checked) startCountdown();
    else cancelCountdown();
  });
  if (delay) delay.addEventListener('input', function () {
    W.lsSet(W.LS_DELAY_KEY, String(delaySec()));
    paintSliders();
  });
  if (retry) retry.addEventListener('input', function () {
    W.lsSet(W.LS_RETRY_KEY, String(retryN()));
    paintSliders();
  });
  if (sound) sound.addEventListener('change', function () {
    W.lsSet(W.LS_SOUND_KEY, sound.checked ? '1' : '0');
  });
  if (cancel) cancel.addEventListener('click', cancelCountdown);
  if (go) go.addEventListener('click', function () {
    if (W.state.chainStarted) return;
    beginJailbreak();
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

  if (auto && auto.checked) startCountdown();

  W.ui._cancelCountdown = cancelCountdown;
  W.ui._startCountdown = startCountdown;
};
})(typeof window !== 'undefined' ? window : this);
