(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};

/* Proven startChain timings kept (mirror interval, relapse 12s warn, reveal 500ms). */
W.startChain = function (skipElfSend) {
  W.uiLog('WK Autoloader by X-F1REBALL-X', 'success');
  if (W.els.statusMsg) W.els.statusMsg.textContent = W.t('jailbreakStarted');
  W.updateProgress(0, W.t('jailbreakStarted'));
  W.startProgressDriver();
  W.startElapsed();
  W.startStallWatch();
  W.state.runStage = 'early';

  W.state.autoloadPending = true;
  W.state.finished = false;
  W.state.progressDone = false;
  W.state.launcherHttpOpenStarted = false;

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'wkal') return;
    if (data.kind === 'autoload') {
      W.state.runStage = 'armed';
      W.launcher.onAutoloadResult(data);
    }
  });

  var fw = W.detectFirmware();
  var picked = W.pickExploit();
  if (!picked) {
    W.setMeta(fw ? fw.str : '-', 'unsupported');
    W.finishProgressFail(W.t('jailbreakFail'));
    return;
  }
  W.state.exploitMode = picked;
  W.setMeta(fw ? fw.str : '-', picked);
  if (W.els.detectChip) {
    W.els.detectChip.textContent = W.t('fwChain', { fw: fw ? fw.str : '-', chain: W.formatChainLabel(picked) });
    W.els.detectChip.className = 'chip ok';
  }

  var autoloadName = W.state.forceAutoloadName || (skipElfSend ? 'wkal-skip' : W.autoloadElfName());
  var urls = W.buildExploitUrls(autoloadName);
  W.state.UMTX2_URL = urls.umtx2;
  W.state.P2JB_URL = urls.p2jb;
  W.state.RELAPSE_URL = urls.relapse;
  W.state.POOPS_URL = urls.poops;
  W.state.EXPLOIT_URL = picked === 'umtx2' ? urls.umtx2
    : picked === 'p2jb' ? urls.p2jb
    : picked === 'poops' ? urls.poops
    : urls.relapse;

  W.uiLog('Post-JB launcher: ' + (W.state.elfHttpAlreadyUp
    ? 'Elf Launcher Hybrid (open :1000 only)'
    : 'Elf Launcher Hybrid (send ' + autoloadName + ' then open :1000)'), 'info');
  W.uiLog('Chain: ' + picked, 'info');

  if (W.els.splash) {
    W.els.splash.classList.add('hide');
    setTimeout(function () {
      W.els.splash.hidden = true;
      if (W.els.loader) W.els.loader.hidden = false;
    }, 480);
  }

  W.state.mirrorTimer = setInterval(function () {
    if (W.mirrors && W.mirrors.mirrorExploit) W.mirrors.mirrorExploit();
    /* Mark armed once progress moves past early webkit stage. */
    if (W.state.progressPct >= 32 && W.state.runStage === 'early') W.state.runStage = 'armed';
  }, picked === 'p2jb' ? 1000 : 500);

  try {
    if (picked === 'umtx2') {
      sessionStorage.setItem('on_load_autorun', 'kernel');
      sessionStorage.setItem('wkal_autoload', autoloadName);
    } else if (picked === 'relapse') {
      sessionStorage.removeItem('on_load_autorun');
      sessionStorage.setItem('wkal_autoload', autoloadName);
    } else if (picked === 'poops') {
      sessionStorage.removeItem('on_load_autorun');
      sessionStorage.setItem('wkal_autoload', autoloadName);
      W.clearSlopkitState();
    } else {
      sessionStorage.removeItem('on_load_autorun');
      sessionStorage.removeItem('wkal_autoload');
    }
  } catch (e) {}

  W.state.chainStarted = true;
  if (picked === 'p2jb') W.clearSlopkitState();
  try { W.els.exploit.src = W.state.EXPLOIT_URL; } catch (e2) {}

  if (picked === 'relapse') {
    setTimeout(function () {
      if (W.state.progressDone) return;
      if (W.mirrors && W.mirrors.relapseSawConsole && W.mirrors.relapseSawConsole()) return;
      if (W.mirrors && W.mirrors.setRelapseStatus) {
        W.mirrors.setRelapseStatus('Kernel chain produced no log - iframe or module may have failed to load');
      }
    }, 12000);
  }
};

W.start = function () {
  if (!W.state.pendingSelfUpdate) {
    try {
      var box = document.getElementById('selfupd');
      if (box) box.classList.remove('show');
    } catch (e) {}
  }
  W.state.launcherHttpOpenStarted = false;
  W.state.elfHttpAlreadyUp = false;
  W.state.launcherChoice = W.CHOICE_ELF_LAUNCHER;

  if (W.state.pendingSelfUpdate || W.state.updateOnlyMode) {
    W.state.updateOnlyMode = true;
    W.launcher.probeElfLauncherHttp(function (up) {
      W.state.elfHttpAlreadyUp = !!up;
      if (up) {
        W.uiLog('[update] :1000 up - jailbreak only, WK via Elf Launcher', 'info');
        W.startChain(true);
      } else {
        W.uiLog('[update] :1000 down - send elf-launcher.elf so it can install WK', 'info');
        W.state.forceAutoloadName = 'elf-launcher.elf';
        W.startChain(false);
      }
    });
    return;
  }

  /* Start immediately after countdown. Short probe only - never wait seconds. */
  var started = false;
  function arm(up) {
    if (started) return;
    started = true;
    W.state.elfHttpAlreadyUp = !!up;
    if (up) {
      W.uiLog(':1000 is up, Hybrid open-only (no ELF send).', 'success');
      W.startChain(true);
    } else {
      W.uiLog('Starting chain, will send elf-launcher.elf after JB if needed.', 'info');
      W.startChain(false);
    }
  }
  if (W.launcher && W.launcher.probeQuick) {
    W.launcher.probeQuick(function (up) { arm(!!up); });
  }
  setTimeout(function () { arm(false); }, 250);
};

window.wkalAfterLangChange = function () {
  W.ui.syncChainUi();
  var go = document.getElementById('startJailbreak');
  var cancel = document.getElementById('cancelAutoStart');
  if (go && !W.state.chainStarted && !go.disabled) go.textContent = W.t('startJailbreak');
  if (cancel) cancel.textContent = W.t('cancel');
  if (W.state.selfUpdateInfo && W.selfupd && W.selfupd.paint) W.selfupd.paint();
  if (W.els.elapsedMsg && !W.state.elapsedTimer) {
    W.els.elapsedMsg.textContent = W.t('elapsed', { t: '0:00' });
  }
};

window.addEventListener('load', function () {
  var t0 = Date.now();
  W.bindEls();
  if (window.WKAL_I18N && typeof window.WKAL_I18N.bindLangUi === 'function') {
    window.WKAL_I18N.bindLangUi();
  }
  W.ui.bindTheme();
  W.ui.bindToast();
  W.ui.bindHome();
  if (W.selfupd && W.selfupd.bind) W.selfupd.bind();

  /* Keep top-bar version in sync with the same string self-update reads. */
  try {
    var ver = (W.selfupd && W.selfupd.currentAppVersion) ? W.selfupd.currentAppVersion() : '';
    var appVer = document.getElementById('appVer');
    if (ver && appVer && (appVer.textContent||'').indexOf('[[') >= 0) appVer.textContent = 'v' + ver;
  } catch (eV) {}

  /* Defer GitHub self-update check so splash stays snappy. */
  setTimeout(function () {
    if (W.selfupd && W.selfupd.check && !W.state.chainStarted) W.selfupd.check();
  }, 2500);
  try {
    W.uiLog('[boot] ui ready in ' + (Date.now() - t0) + 'ms', 'info');
  } catch (e) {}
  try { console.log('[wkal] splash ready', Date.now() - t0, 'ms'); } catch (e2) {}
});
})(typeof window !== 'undefined' ? window : this);
