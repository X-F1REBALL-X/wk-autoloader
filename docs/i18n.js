/* IgniKey i18n - English only. Any stored language value is ignored. */
(function (global) {
'use strict';
var I18N = {"en": {"supportedFw": "Supported firmware: 1.00-5.50, 7.00-13.60. 6.xx not supported", "chainOff": "Not for this firmware", "credit": "Developed by X-F1REBALL-X", "supportTitle": "Supported FW 1.00-5.50 / 7.00-13.60", "detecting": "Detecting...", "consoleNotDetected": "Console not detected", "fwChain": "PS5 FW {fw} - chain {chain}", "fwUnsupported": "PS5 FW {fw} - not supported", "afterJb": "After jailbreak, open", "payloadManager": "Payload Manager", "payloadManagerDesc": "HTTP Manager on :8084", "elfLauncher": "Elf Launcher", "elfLauncherDesc": "Open :1000, or send console mirror / tip ELF", "autoStartJb": "Auto-start", "startJailbreak": "START", "cancel": "Cancel", "choiceSaved": "Settings are saved on this console", "elfLauncherPage": "Elf Launcher page", "jailbreakStarted": "Jailbreak started", "jailbreakSuccess": "Done", "jailbreakFail": "Jailbreak failed - restart your console", "jailbreakInProgress": "Jailbreak in progress", "elapsed": "Elapsed {t}", "metaFwChain": "FW {fw} - chain {chain}", "metaFwUnsupported": "FW {fw} - not supported", "startingIn": "Starting in {n}...", "starting": "Starting...", "pageNotOpen": "{label} page not open yet - Retry below", "jbOkNoAnswer": "JB OK. {label} did not answer on :{port} in time.", "retrySendOpen": "Retry send + open {label} (:{port})", "resending": "Re-sending...", "installing": "Installing...", "installSuccess": "Updated successfully\nOpening IgniKey...", "update": "Update", "selfUpdate": "IgniKey {ver} is available", "selfUpdateLater": "Later", "selfUpdating": "Sending IgniKey {ver} to elfldr...", "selfUpdated": "Sent IgniKey {ver} to elfldr (:9021).", "selfUpdateOpened": "Opened the IgniKey {ver} download.", "selfUpdateFail": "IgniKey update failed: {msg}", "selfUpdateNoElfldr": "elfldr :9021 is not running - jailbreak first", "selfUpdateAfterJb": "Update will run after jailbreak", "selfUpdateStartJb": "Jailbreaking to install IgniKey {ver}...", "selfUpdateInstalling": "Installing IgniKey {ver}...", "selfUpdateReloading": "Opening IgniKey {ver}...", "jailbreakHost": "Jailbreak host", "startJailbreakTitle": "Start jailbreak", "homeSub": "Loads the exploit, then opens Elf Launcher. Nothing else.", "openLauncherOnly": "Open Elf Launcher", "chainAuto": "Auto", "chainAutoDesc": "Firmware + history", "chainAutoPicks": "Auto picks {chain}", "chainRelapseDesc": "FW 7.00-13.60", "chainRelapseHint": "Relapse (default for this firmware)", "chainPoopsDesc": "FW 7.00-12.00 - offline-capable", "chainPoopsHint": "Poops: optional offline-capable chain", "chainUmtx2Desc": "FW 1.00-5.50", "recommended": "Best", "timingTitle": "Timing", "startDelay": "Delay", "retryCount": "Retries", "historyTitle": "Jailbreak log", "historyEmpty": "No runs yet", "fwUnsupportedLong": "This firmware is not supported. No WebKit chain for 6.xx.", "openingElf": "Opening Elf Launcher...", "stallHint": "No progress for a while. The chain may be stuck.", "stallSensitive": "Sensitive stage: close the browser or restart the console. Do not retry from here.", "restartPage": "Restart page", "soundFeedback": "Sound & vibration", "countdownHint": "Cancel keeps auto-start on", "fwModelChain": "PS5 FW {fw} - {model} - {chain}", "modelAfterJb": "model after JB", "elfReady": "Elf Launcher ready", "openLaterHint": "Open via home tile or http://127.0.0.1:1000", "elfNotRunning": "Elf Launcher not running", "back": "Back", "clearLog": "Clear log", "settings": "Settings", "chainTitle": "Chain", "homeSubShort": "PS5 Jailbreak Host"}};
var LANG = 'en';

function t(key, vars) {
  var s = I18N.en[key];
  if (s == null) s = key;
  if (vars) {
    s = String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? String(vars[k]) : m;
    });
  }
  return s;
}

function applyStaticI18n() {
  var nodes, i, k;
  try {
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.removeAttribute('dir');
  } catch (e) { }
  nodes = document.querySelectorAll('[data-i18n]');
  for (i = 0; i < nodes.length; i++) {
    k = nodes[i].getAttribute('data-i18n');
    if (!k) continue;
    if (nodes[i].getAttribute('data-i18n-html') === '1') {
      nodes[i].innerHTML = t(k).replace(/\n/g, '<br>');
    } else {
      nodes[i].textContent = t(k);
    }
  }
}

global.WKAL_I18N = {
  I18N: I18N,
  t: t,
  setLang: function () { applyStaticI18n(); },
  readLang: function () { return 'en'; },
  applyStaticI18n: applyStaticI18n,
  bindLangUi: applyStaticI18n,
  getLang: function () { return LANG; }
};
global.t = t;
})(typeof window !== 'undefined' ? window : this);
