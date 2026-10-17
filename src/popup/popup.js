/* Truth Layer — popup logic. All verdicts computed locally. */
(function () {
  'use strict';

  var BAND_COLOR = {
    'Looks safe': '#6ee7b7',
    'Caution': '#fcd34d',
    'Suspicious': '#fdba74',
    'Dangerous': '#fca5a5'
  };

  function $(id) { return document.getElementById(id); }

  function showVerdict(url, v) {
    var color = BAND_COLOR[v.band] || '#cbd5e1';
    $('result').classList.remove('hidden');
    var badge = $('scoreBadge');
    badge.textContent = v.score;
    badge.style.color = color;
    badge.style.border = '1px solid ' + color;
    var band = $('bandLabel');
    band.textContent = v.band;
    band.style.color = color;
    $('resultUrl').textContent = url;
    var fill = $('scoreFill');
    fill.style.width = v.score + '%';
    fill.style.background = color;
    var list = $('reasonList');
    list.textContent = '';
    if (v.reasons.length === 0) {
      var li = document.createElement('li');
      li.textContent = 'No risk signals found in the address itself. Stay alert to page content too.';
      list.appendChild(li);
    } else {
      v.reasons.forEach(function (r) {
        var item = document.createElement('li');
        item.textContent = r;
        list.appendChild(item);
      });
    }
  }

  function checkUrl(url) {
    if (!url) return;
    var v = TL_heuristics.scoreUrl(url);
    showVerdict(url, v);
  }

  function scanPage() {
    var box = $('pageResult');
    $('pageSummary').textContent = 'Scanning…';
    box.classList.remove('hidden');
    $('pageRiskList').textContent = '';
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs[0] || tabs[0].id == null) {
          $('pageSummary').textContent = 'Could not reach the current tab.';
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TL_SCAN_PAGE' }, function (res) {
          if (chrome.runtime.lastError || !res || !res.ok) {
            $('pageSummary').textContent = 'The scanner is not running on this page (try reloading it).';
            return;
          }
          var n = res.risky.length;
          $('pageSummary').textContent = res.total + ' links checked · ' + n + ' flagged.';
          var list = $('pageRiskList');
          res.risky.slice(0, 12).forEach(function (r) {
            var li = document.createElement('li');
            var b = document.createElement('span');
            b.className = 'rb';
            b.textContent = r.score + ' · ' + r.band;
            b.style.color = BAND_COLOR[r.band] || '#cbd5e1';
            var u = document.createElement('span');
            try {
              u.textContent = new URL(r.url).hostname + ' — ' + r.url.slice(0, 80);
            } catch (e) { u.textContent = r.url.slice(0, 80); }
            li.appendChild(b);
            li.appendChild(u);
            list.appendChild(li);
          });
          if (n > 12) {
            var more = document.createElement('li');
            more.textContent = '…and ' + (n - 12) + ' more.';
            list.appendChild(more);
          }
          if (n === 0) {
            var ok = document.createElement('li');
            ok.textContent = 'No suspicious links found on this page.';
            list.appendChild(ok);
          }
        });
      });
    } catch (e) {
      $('pageSummary').textContent = 'Could not reach the current tab.';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('checkBtn').addEventListener('click', function () { checkUrl($('urlInput').value.trim()); });
    $('urlInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') checkUrl($('urlInput').value.trim());
    });
    $('scanPageBtn').addEventListener('click', scanPage);

    // Settings toggle persisted locally.
    var tgl = $('badgingToggle');
    try {
      chrome.storage.local.get({ tl_badging: true }, function (res) { tgl.checked = !!res.tl_badging; });
      tgl.addEventListener('change', function () {
        chrome.storage.local.set({ tl_badging: tgl.checked });
      });
    } catch (e) { /* storage unavailable: toggle still works for the session */ }

    // Opened from the context-menu fallback with ?url=…
    var m = /[?&]url=([^&]+)/.exec(location.search);
    if (m) {
      var url = decodeURIComponent(m[1]);
      $('urlInput').value = url;
      checkUrl(url);
    }
  });
})();
