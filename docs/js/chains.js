(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};

W.buildExploitUrls = function (autoloadName) {
  return {
    relapse: 'relapse/index.html?autoload=' + autoloadName + '&v=1'
  };
};

W.fwSupports = function (chain, fw) {
  if (!fw) return false;
  if (chain === 'relapse') {
    return W.RELAPSE_FIRMWARES.indexOf(fw.str) !== -1 || (fw.num >= 7.0 && fw.num <= 13.60);
  }
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
  arr.unshift(entry);
  if (arr.length > 50) arr = arr.slice(0, 50);
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

/* Relapse only. FW 6.xx unsupported. */
W.recommendChain = function (fw) {
  if (!fw) return null;
  if (fw.num >= 6.0 && fw.num < 7.0) return null;
  if (fw.num >= 7.0 && fw.num <= 13.60) return 'relapse';
  return null;
};

W.getChainPref = function () { return 'relapse'; };
W.setChainPref = function () { W.lsSet(W.LS_CHAIN_KEY, 'relapse'); };

W.pickExploit = function () {
  var fw = W.detectFirmware();
  try {
    var q = new URLSearchParams(window.location.search).get('force');
    if (q && q !== 'relapse') {
      W.uiLog('[force] ignored ' + q + ' - Relapse only', 'warning');
    }
  } catch (e) {}
  if (!fw) {
    W.uiLog('[ERROR] Not a PlayStation 5 browser.', 'error');
    return null;
  }
  if (W.fwSupports('relapse', fw)) return 'relapse';
  W.uiLog('Unsupported firmware ' + fw.str, 'error');
  return null;
};

W.preloadChainFiles = function (chain) {
  if (!chain) return;
  try {
    var urls = W.buildExploitUrls('wkal-skip');
    var u = urls[chain];
    if (!u) return;
    var l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = u.split('?')[0];
    document.head.appendChild(l);
  } catch (e) {}
};

W.startStallWatch = function () {
  if (W.state.stallTimer) return;
  W.state.stallTimer = setInterval(function () {
    if (!W.state.chainStarted || W.state.progressDone || W.state.finished) return;
    var idle = Date.now() - (W.state.lastProgressAt || Date.now());
    if (idle > 45000 && W.ui && W.ui.showStall) W.ui.showStall();
  }, 1000);
};

W.recordRun = function (result, note) {
  var dur = W.state.elapsedStart ? Date.now() - W.state.elapsedStart : 0;
  var entry = {
    chain: W.state.exploitMode || 'relapse',
    result: result,
    duration: W.formatElapsed(dur),
    stage: W.state.runStage || '-',
    fw: (W.detectFirmware() || {}).str || '-',
    note: note ? String(note).slice(0, 140) : '',
    at: Date.now()
  };
  if (W.state.runRecorded) {
    if (W.state.runRecordedResult !== 'hang' || result === 'hang') return;
    var arr = W.loadHistory();
    if (arr.length && arr[0].at === W.state.runRecordedAt) {
      arr[0] = entry;
      try { W.lsSet(W.LS_HISTORY_KEY, JSON.stringify(arr)); } catch (e) {}
      W.state.runRecordedResult = result;
      if (W.ui && W.ui.renderHistory) W.ui.renderHistory();
      return;
    }
    return;
  }
  W.state.runRecorded = true;
  W.state.runRecordedResult = result;
  W.state.runRecordedAt = entry.at;
  W.saveHistoryEntry(entry);
};

W.clearHistory = function () {
  try { W.lsSet(W.LS_HISTORY_KEY, '[]'); } catch (e) {}
  if (W.ui && W.ui.renderHistory) W.ui.renderHistory();
};
})(typeof window !== 'undefined' ? window : this);
