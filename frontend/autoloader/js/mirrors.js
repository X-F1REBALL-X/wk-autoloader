(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
W.mirrors = W.mirrors || {};
W._maybeApply = function (reason) {
  if (W.selfupd && typeof W.selfupd.maybeApplyPending === 'function') W.selfupd.maybeApplyPending(reason);
};
var umtx2MirroredLines = 0, umtx2LastEntry = null, umtx2LastText = '';
var relapseMirroredLines = 0, relapseSawConsole = false;
var p2jbStats = null, p2jbMirroredLines = 0, p2jbLastStageText = '', p2jbLastStageCls = '';
var p2jbLastSummaryText = '', p2jbEarlyLinesLogged = 0, p2jbLastPhaseStep = '', p2jbComplete = false;

  function mirrorSlopkit() {
    var doc;
    try {
      doc = W.els.exploit.contentDocument;
    } catch (e) {
      return;
    }
    if (!doc) return;

    /* Detect iframe navigation/reload: reset the mirror so a fresh document
       (or a crash restore) streams its log from the top. */
    var frameUrl = '';
    try {
      frameUrl = W.els.exploit.contentWindow.location.href;
    } catch (e) { }
    if (frameUrl !== W.state.lastFrameUrl) {
      W.state.lastFrameUrl = frameUrl;
      W.state.mirroredLines = 0;
      W.state.lastStageText = '';
      W.state.lastStageCls = '';
      W.state.lastSummaryText = '';
      W.state.earlyLinesLogged = 0;
    }
    /* The iframe is intentionally empty until the chain is armed - nothing
       to mirror yet. */
    if (!W.state.chainStarted) return;

    var scr = doc.getElementById('scr');
    if (!scr) {
      /* #scr is static HTML in poops.html - while it parses, #cat (earlier in
         the DOM) and <title> are already present, so a poll can briefly see
         "slopkit page without its screen". Same for the blank pre-navigation
         document. Never warn or re-arm during these windows: re-arming
         reloads the exploit a second time (and the log doubles). */
      var isArmedUrl = frameUrl.length > W.state.EXPLOIT_URL.length &&
        frameUrl.slice(-W.state.EXPLOIT_URL.length) === W.state.EXPLOIT_URL;
      if (frameUrl === 'about:blank' || doc.readyState !== 'complete'
        || isArmedUrl) {
        return;
      }
      /* Only reached when the iframe settled on a *different* page: slopkit's
         landing page (RUN button), a not-armed poops.html, or a 404. */
      var arm = doc.getElementById('arm');
      var cat = doc.getElementById('cat');
      var start = doc.getElementById('start');
      var title = doc.title || '';
      if (mirrorSlopkit.warned !== frameUrl) {
        mirrorSlopkit.warned = frameUrl;
        if (start) {
          W.uiLog('[iframe] slopkit landing page loaded (RUN button) - chain not started.', 'warning');
        } else if (arm && !arm.hidden) {
          W.uiLog('[iframe] slopkit page is NOT armed (?go=1 missing) - nothing will run.', 'warning');
        } else if (cat && title.indexOf('slopkit') !== -1) {
          W.uiLog('[iframe] slopkit page loaded without its screen (title="' + title + '").', 'warning');
        } else {
          W.uiLog('[iframe] page has no slopkit screen: title="' + title + '"', 'warning');
        }
      }
      /* Re-arm only for a wrong *slopkit* page (landing page or not-armed
         poops.html) - never for the armed URL itself. */
      var isSlopkitPage = !!start || (arm && !arm.hidden);
      if (W.state.chainStarted && isSlopkitPage && W.state.repairCount < 5) {
        W.state.repairCount++;
        W.uiLog('[iframe] re-arming (attempt ' + W.state.repairCount + '): ' + W.state.EXPLOIT_URL, 'info');
        try {
          W.els.exploit.src = W.state.EXPLOIT_URL;
        } catch (e) {
          W.uiLog('[iframe] re-arm failed: ' + (e && e.message ? e.message : e), 'error');
        }
      } else if (W.state.chainStarted && isSlopkitPage) {
        W.uiLog('[iframe] giving up after ' + W.state.repairCount + ' re-arm attempts.', 'error');
      }
      return;
    }

    var lines = scr.textContent.split('\n');
    /* If the screen shrank (slopkit caps its log at SCREEN_LINES and drops
       the oldest lines, or a fresh document replaced it), re-anchor the
       counter WITHOUT re-logging - the remaining lines were already streamed,
       and re-streaming them would double the log. A fresh document starts
       empty, so its new lines stream normally from here on. */
    if (lines.length < W.state.mirroredLines) {
      W.state.mirroredLines = lines.length;
    }
    for (; W.state.mirroredLines < lines.length; W.state.mirroredLines++) {
      var line = lines[W.state.mirroredLines].trim();
      if (!line) continue;
      /* Curated release log: surface the per-row progress ("> "), the
         milestone marks (STAGE / POOPS / LATCH / OFFSETS / ...), and
         anything that looks like a failure - never the full raw stream
         (that floods the UI and hides the actual result). */
      if (/^>/.test(line) || /^\[\+\]/.test(line)
        || /^(STAGE[0-5]|ALLPROC-CHECK|ALIASES-REPAIRED|POOPS-COMPLETE|POOPS-VERDICT|LATCH-HELD|LATCH-READ|OFFSETS-READY|WEBKIT-BASE|MODULE-BASES|SOCKETS|SPAWN|WAKEGATE)/.test(line)) {
        W.uiLog('[log] ' + line, 'info');
        W.startProgressDriver();
        if (/^STAGE0|^POOPS-COMPLETE/.test(line)) W.bumpProgressFloor(18);
        else if (/^STAGE1/.test(line)) W.bumpProgressFloor(32);
        else if (/^STAGE2/.test(line)) W.bumpProgressFloor(46);
        else if (/^STAGE3/.test(line)) W.bumpProgressFloor(60);
        else if (/^STAGE4/.test(line)) W.bumpProgressFloor(74);
        else if (/^STAGE5|^SPAWN|^POOPS-VERDICT/.test(line)) W.bumpProgressFloor(88);
      } else if (/FAIL|ERROR|REFUSED|REBOOT|failed|panic|exception/i.test(line)
        || /^\[-\]/.test(line)) {
        W.uiLog('[log] ' + line, 'error');
      }
    }

    var stage = doc.getElementById('stage');
    if (stage && stage.textContent !== W.state.lastStageText) {
      W.state.lastStageText = stage.textContent;
      W.state.lastStageCls = stage.className || '';
      if (W.els.progressLabel) W.els.progressLabel.textContent = W.state.lastStageText;
      W.startProgressDriver();
      var st = W.state.lastStageText || '';
      /* "SUCCESS -- N PASS / 0 FAIL" contains the word FAIL. That is a pass
         summary, not a terminal failure - do not set W.state.finished on it.
         A real fail line that also says "0 FAIL" (reboot required, FAILED)
         still counts. */
      var passSummary = /SUCCESS\s*--/i.test(st)
        || (/PASS\s*\/\s*0\s*FAIL/i.test(st)
            && !/reboot|FAILED\b|boot failed|autoload failed|refused|error|unlucky/i.test(st));
      if (!passSummary && (/fail|reboot|error|refus|unlucky/i.test(st) || W.state.lastStageCls.indexOf('bad') !== -1)) {
        W.uiLog('[stage] ' + W.state.lastStageText, 'error');
        /* While waiting for wkal autoload postMessage, do not lock W.state.finished -
           transient FAIL in stage text would block opening :1000/:8084. */
        if (!W.state.finished && !W.state.autoloadPending) {
          W.state.finished = true;
          W.finishProgressFail(W.t('jailbreakFail'));
        }
      } else if (/jailbreak completed|completed successfully|elf loader ready/i.test(st)) {
        W.uiLog('[stage] ' + W.state.lastStageText, 'success');
        W.bumpProgressFloor(94);
      } else if (/stage\s*5|ps10|payload|autoload|elfldr/i.test(st)) {
        W.bumpProgressFloor(82);
        W.uiLog('[stage] ' + W.state.lastStageText, 'info');
      } else if (/stage\s*4|ps9/i.test(st)) {
        W.bumpProgressFloor(70);
        W.uiLog('[stage] ' + W.state.lastStageText, 'info');
      } else if (/stage\s*3|ps8/i.test(st)) {
        W.bumpProgressFloor(58);
        W.uiLog('[stage] ' + W.state.lastStageText, 'info');
      } else if (/stage\s*[12]|ps[56]/i.test(st)) {
        W.bumpProgressFloor(40);
        W.uiLog('[stage] ' + W.state.lastStageText, 'info');
      } else if (/stage\s*0|prepare|preflight|validate|Jailbreak in progress/i.test(st)) {
        W.bumpProgressFloor(18);
        W.uiLog('[stage] ' + W.state.lastStageText, 'info');
      } else {
        W.uiLog('[stage] ' + W.state.lastStageText, 'info');
      }
    }

    /* Mirror the summary block (verdict/reboot details) when it changes. */
    var summary = doc.getElementById('summary');
    if (summary && summary.textContent && summary.textContent !== W.state.lastSummaryText) {
      var summaryLines = summary.textContent.split('\n');
      for (var i = 0; i < summaryLines.length; i++) {
        var sline = summaryLines[i].trim();
        if (sline && /FAIL|ERROR|REFUSED|REBOOT|failed|panic/i.test(sline)) {
          W.uiLog('[summary] ' + sline, 'error');
        }
      }
      W.state.lastSummaryText = summary.textContent;
    }

    /* Mirror the #early log (errors/notices written before the module chain
       runs - the earliest thing slopkit produces). slopkit only ever appends
       to #early, so log just the new tail - re-logging the whole buffer on
       every change doubled every early line. */
    var early = doc.getElementById('early');
    if (early && early.textContent) {
      var earlyLines = early.textContent.split('\n');
      if (earlyLines.length < W.state.earlyLinesLogged) {
        W.state.earlyLinesLogged = 0;
      }
      for (; W.state.earlyLinesLogged < earlyLines.length; W.state.earlyLinesLogged++) {
        var eline = earlyLines[W.state.earlyLinesLogged].trim();
        if (eline) {
          W.uiLog('[early] ' + eline, /ERROR|FAIL/i.test(eline) ? 'error' : 'info');
        }
      }
    }
  }

  function mirrorUmtx2() {
    var doc;
    try {
      doc = W.els.exploit.contentDocument;
    } catch (e) {
      return;
    }
    if (!doc || !W.state.chainStarted) return;
    var lines = doc.querySelectorAll('#console > div');
    if (lines.length < umtx2MirroredLines) {
      /* Iframe reloaded (#console recreated) - restart from a fresh document. */
      umtx2MirroredLines = lines.length;
      umtx2LastEntry = null;
      umtx2LastText = '';
    }
    for (; umtx2MirroredLines < lines.length; umtx2MirroredLines++) {
      var el = lines[umtx2MirroredLines];
      var text = (el.textContent || '').trim();
      if (!text) continue;
      var cls = el.className || '';
      var entry;
      if (/LOG-ERROR/.test(cls)) {
        entry = W.uiLog('[umtx2] ' + text, 'error');
      } else if (/LOG-WARN/.test(cls)) {
        entry = W.uiLog('[umtx2] ' + text, 'warning');
      } else if (/LOG-SUCCESS/.test(cls)) {
        entry = W.uiLog('[umtx2] ' + text, 'success');
      } else {
        entry = W.uiLog('[umtx2] ' + text, 'info');
      }
      umtx2LastEntry = entry;
      umtx2LastText = text;
    }
    /* Live-update the last mirrored line when umtx2 rewrites it in place. */
    if (lines.length > 0 && umtx2LastEntry
      && umtx2LastEntry === W.els.logContainer.lastChild) {
      var last = lines[lines.length - 1];
      var lastText = (last.textContent || '').trim();
      if (lastText && lastText !== umtx2LastText) {
        umtx2LastEntry.textContent = '[umtx2] ' + lastText;
        umtx2LastText = lastText;
      }
    }
  }

  function p2jbStatsDom() {
    if (!p2jbStats) {
      var root = document.getElementById('p2jbStats');
      if (!root) return null;
      p2jbStats = {
        root: root,
        stepChip: document.getElementById('p2jbStepChip'),
        clocks: document.getElementById('p2jbClocks'),
        status: document.getElementById('p2jbStatus'),
        detail: document.getElementById('p2jbDetail'),
        groupsBox: document.getElementById('p2jbGroups'),
        cells: null,
        phaseName: document.getElementById('p2jbPhaseName'),
        phasePct: document.getElementById('p2jbPhasePct'),
        phaseFill: document.getElementById('p2jbPhaseFill'),
        phaseMeta: document.getElementById('p2jbPhaseMeta'),
        overallPct: document.getElementById('p2jbOverallPct'),
        overallFill: document.getElementById('p2jbOverallFill'),
        overallMeta: document.getElementById('p2jbOverallMeta')
      };
    }
    return p2jbStats.root ? p2jbStats : null;
  }

  function statText(el, v) {
    if (el && el.textContent !== v) el.textContent = v;
  }

  function statFill(el, frac) {
    /* Quantize to 0.1% (upstream's reporting granularity): stable strings
       for the change-guard, no float noise like scaleX(0.4379999...). */
    var t = 'scaleX(' + Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 1000 + ')';
    if (el.__transform !== t) {
      el.__transform = t;
      el.style.transform = t;
    }
  }

  function parseLivestat(text) {
    var out = {};
    var lines = text.split('\n');
    var head = /^P2JB\s+total\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\d{2}:\d{2}:\d{2})/
      .exec(lines[0] || '');
    if (head) {
      out.total = head[1];
      out.phaseKey = head[2];
      out.phaseTime = head[3];
    }
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/^OVERALL\s+\[[#.]*\]/.test(line)) {
        var mo = /OVERALL\s+\[[#.]*\]\s+(\d+(?:\.\d+)?)%\s+step\s+(\d+)\/(\d+)\s+\((\w+)\)\s+~(\d{2}:\d{2}:\d{2})\s+left(?:\s+done\s+~(\d{2}:\d{2}))?/.exec(line);
        if (mo) {
          out.overallPct = parseFloat(mo[1]);
          out.stepNum = parseInt(mo[2], 10);
          out.stepDen = parseInt(mo[3], 10);
          out.stepKey = mo[4];
          out.left = mo[5];
          out.doneClockOverall = mo[6] || '';
        }
      } else if (/^\[[#.]*\]\s+\d/.test(line)) {
        var mp = /\[[#.]*\]\s+(\d+(?:\.\d+)?)%(?:\s+(\d+(?:\.\d+)?)%\/min)?(?:\s+ETA\s+(\S+))?(?:\s+done\s+~(\S+))?(?:\s+\(no progress for (\d+)s\))?/.exec(line);
        if (mp) {
          out.phasePct = mp[1];
          out.ratePerMin = mp[2];
          out.eta = mp[3];
          out.doneClockPhase = mp[4];
          out.stallSecs = mp[5];
        }
      } else if (out.status === undefined) {
        out.status = line;
      } else {
        /* A "label: v v v ..." line of >= 2 percentages is a per-worker
           track (upstream's leak-feed "per-core:" line); anything else is
           detail text. */
        var mg = /^([A-Za-z][\w-]*)\s*:\s*(.+)$/.exec(line);
        if (mg) {
          var pcts = [];
          var gre = /(\d{1,3}(?:\.\d+)?)%/g;
          var gm = gre.exec(mg[2]);
          while (gm !== null) {
            pcts.push(parseFloat(gm[1]));
            gm = gre.exec(mg[2]);
          }
          if (pcts.length >= 2) {
            out.groups = pcts.slice(0, 24);
            continue;
          }
        }
        (out.details = out.details || []).push(line);
      }
    }
    return out;
  }

  function renderP2jbStats(text) {
    var d = p2jbStatsDom();
    if (!d) return;
    var s = parseLivestat(text);

    /* First real data: reveal the panel and shrink the log to the top half
       (body.p2jb-stats in style.css). */
    if (d.root.hidden) {
      d.root.hidden = false;
      document.body.classList.add('p2jb-stats');
    }

    statText(d.clocks, 'total ' + (s.total || '--:--:--')
      + (s.phaseKey ? ' · ' + s.phaseKey + ' ' + s.phaseTime : ''));
    statText(d.stepChip, 'STEP ' + (s.stepNum || '-') + '/' + (s.stepDen || 7));
    statText(d.status, s.status || '…');
    statText(d.phaseName, (s.phaseKey || 'phase').toUpperCase());
    statText(d.phasePct, s.phasePct !== undefined ? s.phasePct + '%' : '-');

    var meta = [];
    if (s.ratePerMin) meta.push(s.ratePerMin + '%/min');
    if (s.eta) meta.push('ETA ' + s.eta);
    if (s.doneClockPhase) meta.push('done ~' + s.doneClockPhase);
    if (s.stallSecs) meta.push('no progress for ' + s.stallSecs + 's');
    var metaCls = 'stats-meta' + (s.stallSecs ? ' stalled' : '');
    statText(d.phaseMeta, meta.join(' · ') || 'ETA --:--:--');
    if (d.phaseMeta.className !== metaCls) d.phaseMeta.className = metaCls;

    statText(d.overallPct, s.overallPct !== undefined
      ? s.overallPct.toFixed(1) + '%' : '-');
    var ometa = [];
    if (s.left) ometa.push('~' + s.left + ' left');
    if (s.doneClockOverall) ometa.push('done ~' + s.doneClockOverall);
    statText(d.overallMeta, ometa.join(' · ') || '- left');

    if (s.phasePct !== undefined) statFill(d.phaseFill, parseFloat(s.phasePct) / 100);
    if (s.overallPct !== undefined) statFill(d.overallFill, s.overallPct / 100);

    renderP2jbDetail(d, s.details);
    renderP2jbGroups(d, s.groups);

    if (s.stepKey && s.stepNum !== undefined) {
      var phaseStep = s.stepNum + '/' + (s.stepDen || 7) + ' ' + s.stepKey;
      if (phaseStep !== p2jbLastPhaseStep) {
        p2jbLastPhaseStep = phaseStep;
        W.uiLog('[p2jb] phase ' + s.stepKey + ' (step ' + s.stepNum
          + '/' + (s.stepDen || 7) + ') - overall ' + (s.overallPct !== undefined
            ? s.overallPct.toFixed(1) + '%' : '-')
          + (s.left ? ', ~' + s.left + ' left' : ''), 'info');
      }
    }
  }

  function renderP2jbDetail(d, details) {
    var text = details && details.length ? details.join('\n') : '';
    if (!text) {
      if (!d.detail.hidden) d.detail.hidden = true;
      return;
    }
    if (d.detail.hidden) d.detail.hidden = false;
    statText(d.detail, text);
  }

  function renderP2jbGroups(d, groups) {
    if (!groups || !groups.length) {
      d.cells = null;
      if (!d.groupsBox.hidden) d.groupsBox.hidden = true;
      return;
    }
    if (d.groupsBox.hidden) d.groupsBox.hidden = false;
    if (!d.cells || d.cells.length !== groups.length) {
      d.groupsBox.textContent = '';
      d.cells = [];
      for (var i = 0; i < groups.length; i++) {
        var cell = document.createElement('span');
        cell.className = 'group';
        var track = document.createElement('span');
        track.className = 'gtrack';
        var fill = document.createElement('span');
        fill.className = 'stats-fill';
        var pct = document.createElement('span');
        pct.className = 'gpct';
        track.appendChild(fill);
        track.appendChild(pct);
        cell.appendChild(track);
        d.groupsBox.appendChild(cell);
        d.cells.push({ fill: fill, pct: pct });
      }
    }
    for (var j = 0; j < d.cells.length; j++) {
      statFill(d.cells[j].fill, (groups[j] || 0) / 100);
      statText(d.cells[j].pct, (groups[j] || 0).toFixed(1) + '%');
    }
  }

  function completeP2jbStats() {
    var d = p2jbStatsDom();
    if (!d) return;
    document.body.classList.add('p2jb-done');
    d.status.className = 'stats-status';
    statText(d.status, 'ELF LOADER READY');
    statText(d.phaseName, 'COMPLETE');
    statText(d.phasePct, '100%');
    statText(d.overallPct, '100%');
    statText(d.phaseMeta, '');
    statText(d.overallMeta, 'elfldr ready - sending payload…');
    statFill(d.phaseFill, 1);
    statFill(d.overallFill, 1);
  }

  function collapseP2jbStats() {
    document.body.classList.remove('p2jb-stats');
    document.body.classList.remove('p2jb-done');
    if (p2jbStats && p2jbStats.root && !p2jbStats.root.hidden) {
      p2jbStats.root.hidden = true;
    }
  }

  function mirrorP2jb() {
    var doc;
    try {
      doc = W.els.exploit.contentDocument;
    } catch (e) {
      return;
    }
    if (!doc) return;

    /* Detect iframe navigation/reload: reset the mirrors so a fresh document
       (or a crash restore) streams its log from the top. */
    var frameUrl = '';
    try {
      frameUrl = W.els.exploit.contentWindow.location.href;
    } catch (e) { }
    if (frameUrl !== W.state.lastFrameUrl) {
      W.state.lastFrameUrl = frameUrl;
      p2jbMirroredLines = 0;
      p2jbLastStageText = '';
      p2jbLastStageCls = '';
      p2jbLastSummaryText = '';
      p2jbEarlyLinesLogged = 0;
      p2jbLastPhaseStep = '';
      p2jbComplete = false;
    }
    /* The iframe is intentionally empty until the chain is armed - nothing
       to mirror yet. */
    if (!W.state.chainStarted) return;

    var scr = doc.getElementById('scr');
    if (!scr) {
      /* #scr is static HTML in p2jb.html - while it parses, earlier elements
         and <title> are already present, so a poll can briefly see "p2jb
         page without its screen". Same for the blank pre-navigation
         document. Never warn or re-arm during these windows: re-arming
         reloads the exploit a second time (and the log doubles). */
      var isArmedUrl = frameUrl.length > W.state.EXPLOIT_URL.length &&
        frameUrl.slice(-W.state.EXPLOIT_URL.length) === W.state.EXPLOIT_URL;
      if (frameUrl === 'about:blank' || doc.readyState !== 'complete'
        || isArmedUrl) {
        return;
      }
      /* Only reached when the iframe settled on a *different* page: slopkit's
         landing page, a not-armed p2jb.html, or a 404. */
      var arm = doc.getElementById('arm');
      var runP2jb = doc.getElementById('run-p2jb');
      var title = doc.title || '';
      if (mirrorP2jb.warned !== frameUrl) {
        mirrorP2jb.warned = frameUrl;
        if (runP2jb) {
          W.uiLog('[iframe] slopkit landing page loaded - chain not started.', 'warning');
        } else if (arm && !arm.hidden) {
          W.uiLog('[iframe] p2jb page is NOT armed (?go=1 missing) - nothing will run.', 'warning');
        } else if (title.indexOf('slopkit') !== -1) {
          W.uiLog('[iframe] p2jb page loaded without its screen (title="' + title + '").', 'warning');
        } else {
          W.uiLog('[iframe] page has no p2jb screen: title="' + title + '"', 'warning');
        }
      }
      /* Re-arm only for a wrong *slopkit* page (landing page or not-armed
         p2jb.html) - never for the armed URL itself. */
      var isSlopkitPage = !!runP2jb || (arm && !arm.hidden);
      if (W.state.chainStarted && isSlopkitPage && W.state.repairCount < 5) {
        W.state.repairCount++;
        W.uiLog('[iframe] re-arming (attempt ' + W.state.repairCount + '): ' + W.state.EXPLOIT_URL, 'info');
        try {
          W.els.exploit.src = W.state.EXPLOIT_URL;
        } catch (e) {
          W.uiLog('[iframe] re-arm failed: ' + (e && e.message ? e.message : e), 'error');
        }
      } else if (W.state.chainStarted && isSlopkitPage) {
        W.uiLog('[iframe] giving up after ' + W.state.repairCount + ' re-arm attempts.', 'error');
      }
      return;
    }

    /* Live progress: mirror #livestat into our native stats panel. The
       element only exists once the first real phase starts; before that the
       stage text carries the status. Upstream's 1 Hz ticker keeps repainting
       #livestat even after the win, so stop once the chain is complete and
       let the stage/autoload messages own the UI again. */
    var live = doc.getElementById('livestat');
    if (live && live.textContent && !p2jbComplete) {
      var statsRoot = document.getElementById('p2jbStats');
      /* Quiet UI keeps #p2jbStats hidden. Un-hiding and repainting it every
         tick only thrashes the thread the exploit is running on. */
      if (statsRoot && !statsRoot.hidden) renderP2jbStats(live.textContent);
    }

    var lines = scr.textContent.split('\n');
    /* If the screen shrank (p2jb caps its log at 12 lines and drops the
       oldest ones, or a fresh document replaced it), re-anchor the counter
       WITHOUT re-logging - the remaining lines were already streamed. */
    if (lines.length < p2jbMirroredLines) {
      p2jbMirroredLines = lines.length;
    }
    for (; p2jbMirroredLines < lines.length; p2jbMirroredLines++) {
      var line = lines[p2jbMirroredLines].trim();
      if (!line) continue;
      /* Curated release log: milestone marks and failures only. The verbose
         debug stream (LEAK-/SPRAY-/TRIPLET/PROGRESS every 15 s, ...) stays
         off our log - the livestat bar above carries the live progress. */
      if (/^(POOPS-BOOT|OFFSETS-READY|TRIGGER-ARMED|TRIGGER-FIRED|LATCH-SET|LATCH-ESCALATE|LATCH-CLEAR|LATCH-HELD|LATCH-RELEASED|POOPS-LATCHED|POOPS-STALLED|BOOT-STALLED|CHAIN-DEAD|STAGE5-DONE|POOPS-COMPLETE|POOPS-FAILED|ELFLDR-MENU-VISIBLE|ELFLDR-UP|ELF-SENT|ELF-SEND-FAILED|ELF-SENDER-BLOCKED|KEXP-JOIN|KEXP-JOIN-PRE|KEXP-SPAWN|KEXP-ELF|AUTOLOAD-OK|AUTOLOAD-FAILED)/.test(line)) {
        W.uiLog('[log] ' + line, 'info');
      } else if (/FAIL|ERROR|REFUSED|REBOOT|failed|panic|exception/i.test(line)
        || /^\[-\]/.test(line)) {
        W.uiLog('[log] ' + line, 'error');
      }
    }

    var stage = doc.getElementById('stage');
    if (stage && stage.textContent !== p2jbLastStageText) {
      p2jbLastStageText = stage.textContent;
      p2jbLastStageCls = stage.className || '';
      /* The panel owns progress while it is up (the slim bar is hidden via
         body.p2jb-stats); before livestat exists (early boot) and after the
         collapse, mirror the stage text into our label instead. */
      if (!live || p2jbComplete) {
        W.els.progressLabel.textContent = p2jbLastStageText;
      }
      /* showWin() fires on every win path (KEXP-JOIN detection and the
         already-jailbroken shortcut) - latch completion here so the
         autoload flow owns the UI from this point on. */
      if (!p2jbComplete && p2jbLastStageText.indexOf('ELF LOADER READY') !== -1) {
        p2jbComplete = true;
        W.bumpProgressFloor(95);
        W.uiLog('[p2jb] exploit complete - elfldr ready.', 'success');
        W._maybeApply('p2jb-elfldr');
        /* Pin the panel green at 100% until the autoload result lands, then
           onAutoloadResult collapses back to the classic full-height log.
           The iframe stays loaded - it holds the ROP workers/threads. */
        completeP2jbStats();
      }
      if (p2jbLastStageCls.indexOf('bad') !== -1) {
        W.uiLog('[stage] ' + p2jbLastStageText, 'error');
        /* Tint the panel status red so a mid-run failure is visible there
           too (the panel stays up for diagnostics on failures). */
        if (p2jbStats && p2jbStats.status) {
          p2jbStats.status.className = 'stats-status bad';
        }
      } else if (p2jbLastStageCls.indexOf('ok') !== -1) {
        W.uiLog('[stage] ' + p2jbLastStageText, 'success');
      } else {
        W.uiLog('[stage] ' + p2jbLastStageText, 'info');
      }
    }

    /* Mirror the summary block (verdict details) when it changes. */
    var summary = doc.getElementById('summary');
    if (summary && summary.textContent && summary.textContent !== p2jbLastSummaryText) {
      var summaryLines = summary.textContent.split('\n');
      for (var i = 0; i < summaryLines.length; i++) {
        var sline = summaryLines[i].trim();
        if (sline && /FAIL|ERROR|REFUSED|REBOOT|failed|panic/i.test(sline)) {
          W.uiLog('[summary] ' + sline, 'error');
        }
      }
      p2jbLastSummaryText = summary.textContent;
    }

    /* Mirror the #early log (errors/notices written before the module chain
       runs). p2jb only ever appends to #early, so log just the new tail. */
    var early = doc.getElementById('early');
    if (early && early.textContent) {
      var earlyLines = early.textContent.split('\n');
      if (earlyLines.length < p2jbEarlyLinesLogged) {
        p2jbEarlyLinesLogged = 0;
      }
      for (; p2jbEarlyLinesLogged < earlyLines.length; p2jbEarlyLinesLogged++) {
        var eline = earlyLines[p2jbEarlyLinesLogged].trim();
        if (eline) {
          W.uiLog('[early] ' + eline, /ERROR|FAIL/i.test(eline) ? 'error' : 'info');
        }
      }
    }
  }

  function setRelapseStatus(text) {
    if (!W.els.statusMsg || !text) return;
    var shown = text.replace(/^\[[+*-]\]\s*/, '');
    if (W.els.statusMsg.textContent !== shown) W.els.statusMsg.textContent = shown;
  }

  function mirrorRelapse() {
    var doc;
    try {
      doc = W.els.exploit.contentDocument;
    } catch (e) {
      return;
    }
    if (!doc || !W.state.chainStarted) return;
    var frameUrl = '';
    try { frameUrl = W.els.exploit.contentWindow.location.href; } catch (eU) { }
    if (frameUrl && frameUrl !== 'about:blank' && doc.readyState === 'complete'
      && frameUrl.indexOf('relapse/') === -1 && !mirrorRelapse.badUrl) {
      mirrorRelapse.badUrl = frameUrl;
      setRelapseStatus('Kernel iframe did not load');
      W.uiLog('[iframe] expected relapse/index.html, got ' + frameUrl, 'error');
    }
    var lines = doc.querySelectorAll('#console > div');
    if (lines.length < relapseMirroredLines) {
      relapseMirroredLines = 0;
    }
    for (; relapseMirroredLines < lines.length; relapseMirroredLines++) {
      var el = lines[relapseMirroredLines];
      var textLine = (el.textContent || '').trim();
      if (!textLine) continue;
      relapseSawConsole = true;
      var kind = 'info';
      if (/^\[-\]/.test(textLine) || /error|fail/i.test(textLine)) kind = 'error';
      else if (/^\[\+\]/.test(textLine) || /success|complete|listening/i.test(textLine)) kind = 'success';
      else if (/warning|warn/i.test(textLine)) kind = 'warning';
      setRelapseStatus(textLine);
      if (/Offsets ready|Firmware:/.test(textLine)) W.bumpProgressFloor(10);
      else if (/Starting WebKit/.test(textLine)) W.bumpProgressFloor(18);
      else if (/ARW ready|WebKit base/.test(textLine)) W.bumpProgressFloor(32);
      else if (/Worker/.test(textLine)) W.bumpProgressFloor(48);
      else if (/kernel/.test(textLine)) W.bumpProgressFloor(70);
      else if (/elfldr|listening on port 9021/.test(textLine)) {
        W.bumpProgressFloor(88);
        W._maybeApply('relapse-elfldr');
      }
      W.uiLog('[relapse] ' + textLine, kind);
    }
  }

function mirrorExploit() {
    if (W.state.exploitMode === 'umtx2') { mirrorUmtx2(); return; }
    if (W.state.exploitMode === 'relapse') { mirrorRelapse(); return; }
    if (W.state.exploitMode === 'poops') { mirrorSlopkit(); return; }
    if (W.state.exploitMode === 'p2jb') { mirrorP2jb(); return; }
  }

W.mirrors.mirrorExploit = mirrorExploit;
W.mirrors.collapseP2jbStats = collapseP2jbStats;
W.mirrors.relapseSawConsole = function () { return relapseSawConsole; };
W.mirrors.setRelapseStatus = setRelapseStatus;
})(typeof window !== 'undefined' ? window : this);
