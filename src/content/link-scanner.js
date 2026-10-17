/* Truth Layer — content script: on-page link badging + verdict cards.
 *
 * Scans links, badges Suspicious/Dangerous ones, answers TL_SCAN_PAGE from
 * the popup, and renders TL_SHOW_VERDICT cards from the context menu.
 * All inserted text uses textContent (escaped). No network calls.
 */
(function () {
  'use strict';

  var BADGE_CSS = [
    '.tl-badge{display:inline-flex;align-items:center;gap:3px;margin-left:4px;padding:1px 6px 1px 4px;',
    'border-radius:999px;font:600 10px/16px system-ui,sans-serif;cursor:help;vertical-align:1px;}',
    '.tl-badge.tl-dangerous{background:#3f1d1d;color:#fca5a5;border:1px solid #7f2d2d;}',
    '.tl-badge.tl-suspicious{background:#3a2a12;color:#fdba74;border:1px solid #7c4a1e;}',
    '.tl-badge svg{width:11px;height:11px;flex:none;}',
    '.tl-card{position:fixed;top:16px;right:16px;z-index:2147483647;max-width:340px;',
    'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;',
    'font:14px/1.5 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5);}',
    '.tl-card-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #1e293b;}',
    '.tl-card-body{padding:12px 14px;}',
    '.tl-card-url{font-size:12px;color:#94a3b8;word-break:break-all;margin-bottom:8px;}',
    '.tl-scorebar{height:8px;border-radius:4px;background:#1e293b;overflow:hidden;margin:8px 0;}',
    '.tl-scorebar>div{height:100%;border-radius:4px;}',
    '.tl-reason{font-size:12.5px;color:#cbd5e1;margin:4px 0;padding-left:14px;position:relative;}',
    '.tl-reason:before{content:"–";position:absolute;left:2px;color:#64748b;}',
    '.tl-close{margin-left:auto;background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:2px 6px;}',
    '.tl-band{font-weight:700;font-size:13px;padding:2px 10px;border-radius:999px;}'
  ].join('\n');

  var BAND_STYLE = {
    'Looks safe': '#065f46:#6ee7b7',
    'Caution': '#713f12:#fcd34d',
    'Suspicious': '#7c2d12:#fdba74',
    'Dangerous': '#7f1d1d:#fca5a5'
  };

  var WARN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">' +
    '<path d="M12 3 2.5 20h19L12 3z" stroke-linejoin="round"/>' +
    '<path d="M12 9.5v5" stroke-linecap="round"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor"/></svg>';

  function ensureCss() {
    if (document.getElementById('tl-style')) return;
    var st = document.createElement('style');
    st.id = 'tl-style';
    st.textContent = BADGE_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function bandColors(band) {
    var parts = (BAND_STYLE[band] || '#334155:#cbd5e1').split(':');
    return { bg: parts[0], fg: parts[1] };
  }

  function badgingEnabled(cb) {
    try {
      chrome.storage.local.get({ tl_badging: true }, function (res) { cb(!!res.tl_badging); });
    } catch (e) { cb(true); }
  }

  function scanLinks() {
    var risky = [];
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.dataset.tlScanned) continue;
      a.dataset.tlScanned = '1';
      var href = a.href;
      if (!href || href.indexOf('http') !== 0) continue;
      var v = TL_heuristics.scoreUrl(href);
      if (v.band === 'Suspicious' || v.band === 'Dangerous') {
        risky.push({ el: a, url: href, verdict: v });
      }
    }
    return risky;
  }

  function badgeLink(a, verdict) {
    if (a.querySelector(':scope > .tl-badge')) return;
    var span = document.createElement('span');
    span.className = 'tl-badge ' + (verdict.band === 'Dangerous' ? 'tl-dangerous' : 'tl-suspicious');
    span.innerHTML = WARN_SVG;
    var label = document.createElement('span');
    label.textContent = verdict.band;
    span.appendChild(label);
    var tip = 'Truth Layer: ' + verdict.score + '/100 — ' + verdict.band + '\n' +
      verdict.reasons.slice(0, 3).join('\n');
    span.title = tip;
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', tip);
    a.appendChild(span);
  }

  function applyBadges() {
    badgingEnabled(function (on) {
      if (!on) return;
      ensureCss();
      var risky = scanLinks();
      risky.forEach(function (r) { badgeLink(r.el, r.verdict); });
    });
  }

  function showVerdictCard(url, verdict) {
    ensureCss();
    var old = document.getElementById('tl-verdict-card');
    if (old) old.remove();
    var c = bandColors(verdict.band);

    var card = document.createElement('div');
    card.className = 'tl-card';
    card.id = 'tl-verdict-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', 'Truth Layer link verdict');

    var head = document.createElement('div');
    head.className = 'tl-card-head';
    var title = document.createElement('strong');
    title.textContent = 'Truth Layer';
    var bandEl = document.createElement('span');
    bandEl.className = 'tl-band';
    bandEl.textContent = verdict.score + '/100 · ' + verdict.band;
    bandEl.style.background = c.bg;
    bandEl.style.color = c.fg;
    var close = document.createElement('button');
    close.className = 'tl-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', function () { card.remove(); });
    head.appendChild(title); head.appendChild(bandEl); head.appendChild(close);

    var body = document.createElement('div');
    body.className = 'tl-card-body';
    var urlEl = document.createElement('div');
    urlEl.className = 'tl-card-url';
    urlEl.textContent = url;
    var bar = document.createElement('div');
    bar.className = 'tl-scorebar';
    var fill = document.createElement('div');
    fill.style.width = verdict.score + '%';
    fill.style.background = c.fg;
    bar.appendChild(fill);
    body.appendChild(urlEl); body.appendChild(bar);

    if (verdict.reasons.length === 0) {
      var ok = document.createElement('div');
      ok.className = 'tl-reason';
      ok.textContent = 'No risk signals found in the address itself. Stay alert to page content too.';
      body.appendChild(ok);
    } else {
      verdict.reasons.forEach(function (r) {
        var p = document.createElement('div');
        p.className = 'tl-reason';
        p.textContent = r;
        body.appendChild(p);
      });
    }
    var note = document.createElement('div');
    note.className = 'tl-reason';
    note.style.color = '#64748b';
    note.textContent = 'Heuristic check only — a clean score does not guarantee a page is legitimate.';
    body.appendChild(note);

    card.appendChild(head); card.appendChild(body);
    document.documentElement.appendChild(card);
    setTimeout(function () { if (card.parentNode) card.remove(); }, 20000);
  }

  // Initial scan (debounced) + watch for dynamically added links.
  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(applyBadges, 600);
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'TL_SHOW_VERDICT') {
      showVerdictCard(msg.url, msg.verdict);
      sendResponse({ ok: true });
    } else if (msg && msg.type === 'TL_SCAN_PAGE') {
      ensureCss();
      var risky = scanLinks();
      risky.forEach(function (r) { badgeLink(r.el, r.verdict); });
      sendResponse({
        ok: true,
        total: document.querySelectorAll('a[href]').length,
        risky: risky.map(function (r) {
          return { url: r.url, score: r.verdict.score, band: r.verdict.band };
        })
      });
    }
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan);
  } else {
    scheduleScan();
  }
  try {
    var mo = new MutationObserver(scheduleScan);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* observer unavailable: one-shot scan already ran */ }
})();
