(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};

/* Proven startChain timings kept (mirror interval, relapse 12s warn, reveal 500ms). */
W.startChain = function (skipElfSend) {
  W.uiLog('WK Autoloader by X-F1REBALL-X', 'success');
  try {
    W.resetTiming();
    W.markTiming('jb_start');
    var ac = (typeof applicationCache !== 'undefined') ? applicationCache : null;
    var st = ac ? ac.status : -1;
    /* 1 = IDLE (master entry already in AppCache). */
    W.uiLog('[time] page_from_cache status=' + st + (st === 1 ? ' IDLE' : ''), 'info');
  } catch (eT0) {}
  if (W.els.statusMsg) { W.els.statusMsg.textContent = ''; W.els.statusMsg.style.display = 'none'; }
  W.updateProgress(0, W.t('jailbreakStarted'));
  W.startProgressDriver();
  W.startElapsed();
  W.startStallWatch();
  W.state.runStage = 'early';

  W.state.autoloadPending = true;
  W.state.finished = false;
  W.state.progressDone = false;
  W.state.launcherHttpOpenStarted = false;

  if (!W.state.autoloadMsgBound) {
    W.state.autoloadMsgBound = true;
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || data.type !== 'wkal') return;
      if (data.kind === 'autoload') {
        W.state.runStage = 'armed';
        W.launcher.onAutoloadResult(data);
      }
    });
  }

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

  /* Known console mirror => chain skips the bundled ELF, mirror is sent after JB.
     Never for Payload Manager: forceAutoloadName=pldmgr.elf keeps the same Relapse/umtx2 path. */
  var wantPm = (W.state.forceAutoloadName === 'pldmgr.elf')
    || (W.state.launcherChoice === W.CHOICE_PAYLOAD_MANAGER)
    || (W.getLauncherChoice && W.getLauncherChoice() === W.CHOICE_PAYLOAD_MANAGER);
  if (wantPm) {
    W.state.forceAutoloadName = 'pldmgr.elf';
    W.state.elMirrorFirst = false;
    W.state.elfHttpAlreadyUp = false;
  } else {
    W.state.elMirrorFirst = !skipElfSend && !W.state.forceAutoloadName && !W.state.elfHttpAlreadyUp
      && !!(W.elauto && W.elauto.mirrorFirstOk(picked));
  }
  /* Where the Elf Launcher that ends up on :1000 comes from (no-downgrade check). */
  W.state.elRunSrc = wantPm ? 'pldmgr' : (W.state.elfHttpAlreadyUp ? 'preexisting' : (W.state.elMirrorFirst ? 'mirror' : 'bundled'));
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

  if (wantPm) {
    W.uiLog('Post-JB launcher: Payload Manager (send ' + autoloadName + ' then open :8084)', 'info');
  } else {
    W.uiLog('Post-JB launcher: ' + (W.state.elfHttpAlreadyUp
      ? 'Elf Launcher Hybrid (open :1000 only)'
      : W.state.elMirrorFirst
        ? 'Elf Launcher console mirror ' + W.elauto.mirrorLabel() + ' (bundled ' + W.BUNDLED_ELFLAUNCHER_VER + ' = fallback)'
        : 'Elf Launcher Hybrid (send ' + autoloadName + ' ' + W.BUNDLED_ELFLAUNCHER_VER + ' then open :1000)'), 'info');
  }
  W.uiLog('Chain: ' + picked + ' (autoload=' + autoloadName + ')', 'info');

  if (W.els.splash) {
    W.els.splash.classList.add('hide');
    W.els.splash.hidden = true;
    if (W.els.loader) W.els.loader.hidden = false;
  }

  /* Slower iframe scrape = less main-thread work while WebKit/kernel run. */
  var mirrorMs = picked === 'p2jb' ? 1500 : 1200;
  function armMirrorTimer(ms) {
    if (W.state.mirrorTimer) {
      clearInterval(W.state.mirrorTimer);
      W.state.mirrorTimer = 0;
    }
    W.state.mirrorTimer = setInterval(function () {
      if (W.mirrors && W.mirrors.mirrorExploit) W.mirrors.mirrorExploit();
      /* Mark armed once progress moves past early webkit stage. */
      if (W.state.progressPct >= 32 && W.state.runStage === 'early') {
        W.state.runStage = 'armed';
        /* Relapse: once armed, pause fake progress creep (host-only). */
        if (picked === 'relapse' && W.enterKernelQuiet) W.enterKernelQuiet();
      }
      /* Optionally slow mirror polling during Relapse kernel quiet (500ms -> 1500ms). */
      if (picked === 'relapse' && W.state.progressKernelQuiet && mirrorMs < 2000) {
        mirrorMs = 2000;
        armMirrorTimer(mirrorMs);
      }
    }, ms);
  }
  armMirrorTimer(mirrorMs);

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
  try {
    if (!W.els.exploit) throw new Error('missing #exploit iframe');
    try {
      W.els.exploit.onload = function () {
        try { W.markTiming('iframe_load'); } catch (eL) {}
      };
    } catch (eOn) {}
    W.els.exploit.src = W.state.EXPLOIT_URL;
    try { W.markTiming('iframe_request'); } catch (eR) {}
    /* Real milestone: exploit document requested (quiet UI has no fake creep). */
    if (W.bumpProgressFloor) W.bumpProgressFloor(5);
    W.uiLog('Exploit iframe: ' + W.state.EXPLOIT_URL, 'info');
  } catch (e2) {
    W.uiLog('Failed to start exploit iframe: ' + (e2 && e2.message ? e2.message : e2), 'error');
    W.finishProgressFail(W.t('jailbreakFail'));
    return;
  }

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
  W.state.elMirrorFirst = false;
  W.state.elRefreshRan = false;
  W.state.launcherChoice = W.getLauncherChoice ? W.getLauncherChoice() : W.CHOICE_ELF_LAUNCHER;

  if (W.state.pendingSelfUpdate || W.state.updateOnlyMode) {
    W.state.updateOnlyMode = true;
    /* Respect splash launcher choice on update-only / pendingSelfUpdate.
       PM: never force Elf Hybrid / :1000-only; always full chain + pldmgr.elf.
       Elf: only then probe :1000 / force elf-launcher.elf for WK install. */
    var wantPmUpdate = (W.state.launcherChoice === W.CHOICE_PAYLOAD_MANAGER)
      || (W.state.forceAutoloadName === 'pldmgr.elf')
      || (W.getLauncherChoice && W.getLauncherChoice() === W.CHOICE_PAYLOAD_MANAGER);
    if (wantPmUpdate) {
      W.state.forceAutoloadName = 'pldmgr.elf';
      W.state.elfHttpAlreadyUp = false;
      W.state.elMirrorFirst = false;
      W.uiLog('[update] Payload Manager selected - full chain with pldmgr.elf (not Elf Hybrid)', 'info');
      W.startChain(false);
      return;
    }
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

  /* Payload Manager: same JB chain as Elf Launcher; only the post-JB ELF differs. */
  var wantPm = W.state.launcherChoice === W.CHOICE_PAYLOAD_MANAGER;
  if (wantPm) {
    W.state.forceAutoloadName = 'pldmgr.elf';
    W.state.elfHttpAlreadyUp = false;
    W.state.elMirrorFirst = false;
    W.uiLog('Post-JB target: Payload Manager (pldmgr.elf -> :8084)', 'info');
  } else {
    W.state.forceAutoloadName = W.state.forceAutoloadName || '';
  }

  /* Start immediately after countdown. Short probe only - never wait seconds. */
  var started = false;
  function arm(up) {
    if (started) return;
    started = true;
    /* PM never uses Elf Hybrid open-only; always run full chain + send pldmgr. */
    if (wantPm) {
      W.state.elfHttpAlreadyUp = false;
      W.startChain(false);
      return;
    }
    W.state.elfHttpAlreadyUp = !!up;
    if (up) {
      W.uiLog(':1000 is up, Hybrid open-only (no ELF send).', 'success');
      W.startChain(true);
    } else {
      W.uiLog('Starting chain, will send elf-launcher.elf after JB if needed.', 'info');
      W.startChain(false);
    }
  }
  if (!wantPm && W.launcher && W.launcher.probeQuick) {
    W.launcher.probeQuick(function (up) { arm(!!up); });
  }
  setTimeout(function () { arm(false); }, wantPm ? 0 : 250);
};

window.wkalAfterLangChange = function () {
  W.ui.syncChainUi();
  var go = document.getElementById('startJailbreak');
  var cancel = document.getElementById('cancelAutoStart');
  if (go && !W.state.chainStarted && !go.disabled) go.textContent = W.t('startJailbreak');
  if (cancel) cancel.textContent = W.t('cancel');
  if (W.state.selfUpdateInfo && W.selfupd && W.selfupd.paint) W.selfupd.paint();
  if (W.els.elapsedMsg && !W.state.elapsedTimer) {
    if (W.state.elapsedStart && W.paintElapsedLine) {
      W.paintElapsedLine(W.formatElapsed(Date.now() - W.state.elapsedStart));
    } else {
      W.els.elapsedMsg.textContent = W.t('elapsed', { t: '0:00' });
    }
  }
  if (W.ui && W.ui.applyLauncherChoice) W.ui.applyLauncherChoice(W.getLauncherChoice());
};

window.addEventListener('load', function () {
  var t0 = Date.now();
  W.bindEls();
  if (window.WKAL_I18N && typeof window.WKAL_I18N.bindLangUi === 'function') {
    window.WKAL_I18N.bindLangUi();
  }
  W.ui.bindTheme();
  W.ui.bindToast();
  /* Choice first so a later bindHome throw cannot leave Start/choice dead. */
  try { if (W.ui.bindLauncherChoice) W.ui.bindLauncherChoice(); } catch (eChoice) {}
  try { W.ui.bindHome(); } catch (eHome) {}
  try { if (W.selfupd && W.selfupd.bind) W.selfupd.bind(); } catch (eUpd) {}

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
  /* Elf Launcher latest (for the post-JB mirror refresh). Splash only. */
  setTimeout(function () {
    if (W.elauto && W.elauto.prefetch && !W.state.chainStarted) W.elauto.prefetch();
  }, 900);
  try {
    var ac = (typeof applicationCache !== 'undefined') ? applicationCache : null;
    var st = ac ? ac.status : -1;
    W.uiLog('[boot] ui ready in ' + (Date.now() - t0) + 'ms; AppCache status=' + st
      + (st === 1 ? ' (IDLE/cached)' : ''), 'info');
  } catch (e) {}
});
})(typeof window !== 'undefined' ? window : this);
