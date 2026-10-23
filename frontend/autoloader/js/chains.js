(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};

W.buildExploitUrls = function (autoloadName) {
  return {
    umtx2: 'umtx2/index.html?autoload=' + autoloadName + '&v=1',
    p2jb: 'slopkit/slopkit/p2jb.html?go=1&auto=1&production=1&log=debug&payload=1&autoload=' + autoloadName + '&v=final',
    relapse: 'relapse/index.html?autoload=' + autoloadName + '&v=1',
    /* Must match poops.html PRODUCTION_QUERY / tools/gen_file_registry.py poops_iframe_url. */
    poops: 'slopkit/slopkit/poops.html?go=1&auto=1&production=1&trigger=netcontrol'
      + '&attempts=8&only=ps0_preflight,ps1_prepare,ps3_stage0,ps4_validate,'
      + 'ps5_stage1,ps6_stage2,ps8_stage3,ps9_stage4,ps10_stage5'
      + '&log=debug&payload=1&autoload=' + autoloadName + '&v=final'
  };
};

W.fwSupports = function (chain, fw) {
  if (!fw) return false;
  if (chain === 'umtx2') {
    return W.UMTX2_FIRMWARES.indexOf(fw.str) !== -1 || (fw.num >= 1.0 && fw.num < 6.0);
  }
  if (chain === 'poops') {
    return W.POOPS_FIRMWARES.indexOf(fw.str) !== -1 || (fw.num >= 7.0 && fw.num <= 12.0);
  }
  if (chain === 'relapse') {
    return W.RELAPSE_FIRMWARES.indexOf(fw.str) !== -1 || (fw.num >= 7.0 && fw.num <= 13.60);
  }
  if (chain === 'p2jb') return W.P2JB_FIRMWARES.indexOf(fw.str) !== -1;
  return false;
};

W.loadHistory = function () {
  try {
    var raw = W.lsGet(W.LS_HISTORY_KEY, '[]');
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
};

W.saveHistoryEntry = function (entry) {
  var arr = W.loadHistory();
  if (entry && !entry.ts) entry.ts = Date.now();
  arr.unshift(entry);
  if (arr.length > 12) arr = arr.slice(0, 12);
  try { W.lsSet(W.LS_HISTORY_KEY, JSON.stringify(arr)); } catch (e) {}
  if (W.ui && W.ui.renderHistory) W.ui.renderHistory();
};

W.historyScore = function (chain) {
  var arr = W.loadHistory(), i, e, ok = 0, fail = 0;
  for (i = 0; i < arr.length; i++) {
    e = arr[i];
    if (!e || e.chain !== chain) continue;
    if (e.result === 'ok') ok++;
    else fail++;
  }
  return ok - fail;
};

/* Auto: umtx2 1-5.50; 6.xx unsupported; Relapse default 7-13.60.
   Poops is optional alt on 7-12 (offline-capable). History may prefer Poops
   when it clearly wins locally - Relapse stays default otherwise.
   Relapse is NOT treated as network-required. */
W.recommendChain = function (fw) {
  if (!fw) return null;
  if (fw.num >= 1.0 && fw.num < 6.0) return 'umtx2';
  if (fw.num >= 6.0 && fw.num < 7.0) return null; /* unsupported */
  if (fw.num >= 7.0 && fw.num <= 13.60) {
    if (fw.num <= 12.0) {
      var ps = W.historyScore('poops');
      var rs = W.historyScore('relapse');
      if (ps > rs && ps > 0) return 'poops';
    }
    return 'relapse';
  }
  return null;
};

W.getChainPref = function () {
  /* Relapse is the only selectable chain; any stored value (incl. legacy 'auto') coerces to relapse. */
  var v = W.lsGet(W.LS_CHAIN_KEY, 'relapse');
  if (v !== 'relapse') { try { W.lsSet(W.LS_CHAIN_KEY, 'relapse'); } catch (e) {} }
  return 'relapse';
};

W.setChainPref = function (v) {
  v = 'relapse';
  W.lsSet(W.LS_CHAIN_KEY, v);
};

W.pickExploit = function () {
  var fw = W.detectFirmware();
  var forced = null;
  try {
    var q = new URLSearchParams(window.location.search).get('force');
    if (q === 'umtx2' || q === 'p2jb' || q === 'relapse' || q === 'poops') forced = q;
  } catch (e) {}
  if (forced) {
    W.uiLog('[force] using ' + forced + ' on firmware ' + (fw ? fw.str : 'unknown'), 'warning');
    return forced;
  }
  if (W.EXPLOIT_MODE === 'umtx2' || W.EXPLOIT_MODE === 'p2jb'
    || W.EXPLOIT_MODE === 'relapse' || W.EXPLOIT_MODE === 'poops') {
    W.uiLog('[force] using ' + W.EXPLOIT_MODE + ' on firmware ' + (fw ? fw.str : 'unknown'), 'warning');
    return W.EXPLOIT_MODE;
  }
  if (!fw) {
    W.uiLog('[ERROR] Not a PlayStation 5 browser.', 'error');
    return null;
  }
  var pref = W.getChainPref();
  if (pref !== 'auto') {
    if (W.fwSupports(pref, fw)) return pref;
    W.uiLog('Saved chain ' + pref + ' not for FW ' + fw.str + ', using firmware default', 'warning');
  }
  var rec = W.recommendChain(fw);
  if (rec) return rec;
  W.uiLog('Unsupported firmware ' + fw.str, 'error');
  return null;
};

/* Preload chain entry HTML only (no exploit run). Speeds first paint of iframe. */
W.preloadChainFiles = function (chain) {
  if (!chain) return;
  var urls = W.buildExploitUrls('wkal-skip');
  var u = urls[chain];
  if (!u) return;
  try {
    var l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = u.split('?')[0];
    document.head.appendChild(l);
  } catch (e) {}
  try {
    var x = new XMLHttpRequest();
    x.open('GET', u.split('?')[0], true);
    x.timeout = 4000;
    x.send();
  } catch (e2) {}
};

W.startStallWatch = function () {
  /* Quiet UI: stall counter off - Relapse retries/kernel quiet look like hangs. */
  W.state.lastProgressAt = Date.now();
  if (W.state.stallTimer) { clearInterval(W.state.stallTimer); W.state.stallTimer = 0; }
};

W.recordRun = function (result) {
  var dur = W.state.elapsedStart ? Date.now() - W.state.elapsedStart : 0;
  var marks = (W.state.timing && W.state.timing.marks) ? W.state.timing.marks : {};
  var totalMs = W.state.timing ? (Date.now() - W.state.timing.t0) : dur;
  W.saveHistoryEntry({
    chain: W.state.exploitMode || '-',
    result: result,
    duration: W.formatElapsed(dur),
    ms: totalMs,
    timing: marks,
    stage: W.state.runStage || '-',
    fw: (W.detectFirmware() || {}).str || '-',
    at: Date.now()
  });
};
})(typeof window !== 'undefined' ? window : this);
