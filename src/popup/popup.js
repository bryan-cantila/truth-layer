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

  function scanPage() {    var box = $('pageResult');
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

  /* --- Scan page media: videos being watched + photos in view --- */

  var SVG_VIDEO = '<svg viewBox="0 0 24 24" class="mi-icon" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/></svg>';
  var SVG_IMAGE = '<svg viewBox="0 0 24 24" class="mi-icon" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="M4 18l5-5 3 3 3-3 5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function withActiveTab(cb) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        cb(tabs && tabs[0] && tabs[0].id != null ? tabs[0].id : null);
      });
    } catch (e) { cb(null); }
  }

  function scanMedia() {
    var box = $('mediaResult');
    $('mediaSummary').textContent = 'Scanning…';
    box.classList.remove('hidden');
    $('mediaList').textContent = '';
    withActiveTab(function (tabId) {
      if (tabId == null) {
        $('mediaSummary').textContent = 'Could not reach the current tab.';
        return;
      }
      chrome.tabs.sendMessage(tabId, { cmd: 'tl-scan-media' }, function (res) {
        if (chrome.runtime.lastError || !res || !res.ok) {
          $('mediaSummary').textContent = 'The media scanner is not running on this page (try reloading it).';
          return;
        }
        renderMedia(tabId, res);
      });
    });
  }

  function renderMedia(tabId, res) {
    var items = res.items || [];
    var nv = items.filter(function (i) { return i.type === 'video'; }).length;
    var ni = items.length - nv;
    var sum = nv + ' video' + (nv === 1 ? '' : 's') + ' · ' +
              ni + ' photo' + (ni === 1 ? '' : 's') + ' found';
    if (res.embedded) {
      sum += ' · ' + res.embedded + ' embedded image' + (res.embedded === 1 ? '' : 's') + ' skipped';
    }
    $('mediaSummary').textContent = sum + '.';
    var list = $('mediaList');
    list.textContent = '';
    if (items.length === 0) {
      var li = document.createElement('li');
      li.style.cssText = 'font-size:12px;color:var(--muted);';
      li.textContent = 'No videos or in-viewport photos found on this page.';
      list.appendChild(li);
      return;
    }
    items.forEach(function (item) { list.appendChild(mediaRow(tabId, item)); });
  }

  function mediaRow(tabId, item) {
    var li = document.createElement('li');
    li.className = 'media-row';

    var icon = document.createElement('span');
    icon.innerHTML = item.type === 'video' ? SVG_VIDEO : SVG_IMAGE;
    li.appendChild(icon);

    var meta = document.createElement('div');
    meta.className = 'mi-meta';

    var title = document.createElement('div');
    title.className = 'mi-title';
    title.appendChild(document.createTextNode(item.type === 'video' ? 'Video' : 'Photo'));
    if (item.playing) {
      var b = document.createElement('span');
      b.className = 'play-badge';
      b.textContent = 'PLAYING';
      title.appendChild(b);
    }
    meta.appendChild(title);

    var host = document.createElement('div');
    host.className = 'mi-host';
    host.textContent = TL_mediaUtils.dimsText(item.width, item.height) + ' · ' +
                       TL_mediaUtils.shortHost(item.src);
    meta.appendChild(host);

    var verdict = document.createElement('div');
    verdict.className = 'mi-verdict';
    verdict.style.display = 'none';
    meta.appendChild(verdict);
    li.appendChild(meta);

    var btn = document.createElement('button');
    btn.className = 'mi-analyze';
    btn.textContent = item.type === 'video' ? 'Capture frame & analyze' : 'Analyze';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      if (item.type === 'video') captureAndAnalyze(tabId, item, verdict, btn);
      else analyzeImage(item.src, verdict, btn);
    });
    li.appendChild(btn);
    return li;
  }

  function showVerdictLines(box, lines) {
    box.textContent = '';
    box.style.display = '';
    lines.forEach(function (l) {
      var p = document.createElement('p');
      p.className = l.cls;
      p.textContent = l.text;
      box.appendChild(p);
    });
  }

  function showNote(box, text) {
    box.textContent = '';
    box.style.display = '';
    var p = document.createElement('p');
    p.className = 'mi-note';
    p.textContent = text;
    box.appendChild(p);
  }

  // Image → same pipeline the analyzer uses: fetch bytes, run metadata + C2PA.
  function analyzeImage(src, verdictBox, btn) {
    fetch(src).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var meta = TL_metadata.analyzeImageMetadata(buf);
      var c2pa = TL_c2pa.detectC2PA(buf);
      showVerdictLines(verdictBox, TL_mediaUtils.summarizeAnalysis(meta, c2pa));
    }).catch(function () {
      showNote(verdictBox, 'Could not fetch this image — the site blocks cross-origin reads. ' +
        'Save the image and use the file picker in the full analyzer; analysis stays on your device.');
    }).then(function () { btn.disabled = false; });
  }

  // Video → capture the current frame in the page, hand it to the analyzer.
  function captureAndAnalyze(tabId, item, verdictBox, btn) {
    chrome.tabs.sendMessage(tabId, { cmd: 'tl-capture-frame', idx: item.vidx }, function (res) {
      btn.disabled = false;
      if (chrome.runtime.lastError || !res) {
        showNote(verdictBox, 'Could not reach the page to capture the frame.');
        return;
      }
      if (res.error === 'tainted') {
        showNote(verdictBox, 'This site blocks frame capture — save the video frame as an image and use the file picker in the full analyzer.');
        return;
      }
      if (!res.ok || !res.dataUrl) {
        showNote(verdictBox, 'Could not capture a frame from this video (it may not have loaded yet).');
        return;
      }
      try {
        chrome.storage.session.set({ tl_pending_image: res.dataUrl }, function () {
          chrome.tabs.create({ url: chrome.runtime.getURL('src/analyzer/analyzer.html') + '?frame=1' });
        });
      } catch (e) {
        showNote(verdictBox, 'Could not hand the frame to the analyzer.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('checkBtn').addEventListener('click', function () { checkUrl($('urlInput').value.trim()); });
    $('urlInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') checkUrl($('urlInput').value.trim());
    });
    $('scanPageBtn').addEventListener('click', scanPage);
    $('scanMediaBtn').addEventListener('click', scanMedia);

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
