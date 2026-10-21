/* WK Autoloader i18n - English only. */
(function (global) {
'use strict';

var LANGS = [{"code": "en", "name": "English"}];
var I18N = {"en": {"chainOff": "Not for this firmware", "detecting": "Detecting…", "consoleNotDetected": "Console not detected", "fwChain": "PS5 FW {fw} · chain {chain}", "fwUnsupported": "PS5 FW {fw} · not supported", "afterJb": "After jailbreak, open", "payloadManager": "Payload Manager", "elfLauncher": "Elf Launcher", "autoStartJb": "Auto-start", "startJailbreak": "Start Jailbreak", "cancel": "Cancel", "jailbreakStarted": "Jailbreak started", "jailbreakSuccess": "Done", "jailbreakFail": "Jailbreak failed - restart your console", "jailbreakInProgress": "Jailbreak in progress", "elapsed": "Elapsed {t}", "metaFwChain": "FW {fw} · chain {chain}", "metaFwUnsupported": "FW {fw} · not supported", "starting": "Starting…", "pageNotOpen": "{label} page not open yet - Retry below", "jbOkNoAnswer": "JB OK. {label} did not answer on :{port} in time.", "retrySendOpen": "Retry send + open {label} (:{port})", "resending": "Re-sending...", "installing": "Installing…", "update": "Update", "selfUpdate": "WK Autoloader {ver} is available", "selfUpdateLater": "Later", "selfUpdating": "Sending WK Autoloader {ver} to elfldr...", "selfUpdated": "Sent WK Autoloader {ver} to elfldr (:9021).", "selfUpdateOpened": "Opened the WK Autoloader {ver} download.", "selfUpdateFail": "WK Autoloader update failed: {msg}", "selfUpdateAfterJb": "Update will run after jailbreak", "selfUpdateStartJb": "Jailbreaking to install WK Autoloader {ver}…", "selfUpdateInstalling": "Installing WK Autoloader {ver}…", "selfUpdateReloading": "Opening WK Autoloader {ver}…", "startJailbreakTitle": "Start jailbreak", "openLauncherOnly": "Open Elf Launcher", "chainAuto": "Auto", "chainAutoPicks": "Auto picks {chain}", "chainRelapseHint": "Relapse (default for this firmware)", "chainPoopsHint": "Poops: optional offline-capable chain", "chainUmtx2Desc": "FW 1.00–5.50", "recommended": "Best", "timingTitle": "Timing", "startDelay": "Delay", "retryCount": "Retries", "historyTitle": "Recent jailbreaks", "historyEmpty": "No runs yet", "fwUnsupportedLong": "This firmware is not supported. No WebKit chain for 6.xx.", "openingElf": "Opening Elf Launcher…", "stallHint": "No progress for a while. The chain may be stuck.", "stallSensitive": "Sensitive stage: close the browser or restart the console. Do not retry from here.", "restartPage": "Restart page", "theme": "Theme", "countdownHint": "Cancel keeps auto-start on", "fwModelChain": "PS5 FW {fw} · {model} · {chain}", "elfReady": "Elf Launcher ready", "openLaterHint": "Open via home tile or http://127.0.0.1:1000", "elfNotRunning": "Elf Launcher not running", "settings": "Options", "chainTitle": "Chain", "homeSubShort": "Then opens Elf Launcher"}};
var LANG = 'en';
var LS_LANG_KEY = 'ps5elfs-lang';

function langInfo() { return LANGS[0]; }

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

function readLang() { return 'en'; }

function forceEn() {
  try { localStorage.setItem(LS_LANG_KEY, 'en'); } catch (e) { }
  try { sessionStorage.setItem(LS_LANG_KEY, 'en'); } catch (e2) { }
}

function applyStaticI18n() {
  var nodes, i, k;
  try { document.documentElement.setAttribute('lang', 'en'); document.documentElement.removeAttribute('dir'); } catch (e) { }
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

function setLang() { LANG = 'en'; applyStaticI18n(); }

function bindLangUi() { LANG = 'en'; forceEn(); applyStaticI18n(); }

global.WKAL_I18N = {
  LANGS: LANGS,
  I18N: I18N,
  t: t,
  setLang: setLang,
  readLang: readLang,
  applyStaticI18n: applyStaticI18n,
  bindLangUi: bindLangUi,
  langInfo: langInfo,
  getLang: function () { return LANG; }
};
global.t = t;
})(typeof window !== 'undefined' ? window : this);
