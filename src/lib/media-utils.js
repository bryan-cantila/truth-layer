/* Truth Layer — media-utils.js
 *
 * Pure helpers shared by the media-scanner content script and the popup.
 * No chrome.* APIs, no network access, no DOM. Safe to load in content
 * scripts, popup/analyzer pages, and plain node for unit tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TL_mediaUtils = api;
}(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Absolutize a possibly-relative URL against a base. Returns '' when invalid.
  function absolutize(url, base) {
    try {
      return new URL(String(url).trim(), base).href;
    } catch (e) {
      return '';
    }
  }

  // rect = {top, bottom, left, right}; vw/vh = viewport size in CSS pixels.
  function rectInViewport(rect, vw, vh) {
    if (!rect || !isFinite(vw) || !isFinite(vh)) return false;
    return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
  }

  function shortHost(src) {
    try {
      var h = new URL(src).hostname;
      return h || '(unknown host)';
    } catch (e) {
      return '(unknown host)';
    }
  }

  function dimsText(w, h) {
    w = Number(w) || 0;
    h = Number(h) || 0;
    return (w > 0 && h > 0) ? (w + '\u00d7' + h) : 'size unknown';
  }

  // Compact inline verdict built from the analyzer pipeline outputs
  // (TL_metadata.analyzeImageMetadata + TL_c2pa.detectC2PA).
  // Returns [{cls, text}] where cls is 'ok' | 'warn' | 'hit' | 'muted'.
  function summarizeAnalysis(meta, c2pa) {
    var lines = [];
    if (c2pa && c2pa.present) {
      lines.push({ cls: 'ok', text: 'C2PA manifest found. ' + (c2pa.detail || '') });
      if (c2pa.generator) {
        lines.push({ cls: 'muted', text: 'Claim generator hint: ' + c2pa.generator });
      }
    } else {
      lines.push({ cls: 'warn', text: 'No provenance manifest. Most images online carry none.' });
    }
    var hits = (meta && meta.aiIndicators) || [];
    hits.forEach(function (hit) {
      lines.push({ cls: 'hit', text: 'AI-generator tag "' + hit.match + '" in ' + hit.field + '.' });
    });
    if (hits.length === 0) {
      lines.push({ cls: 'muted', text: 'No AI fingerprints in metadata. Not proof of authenticity.' });
    }
    return lines;
  }

  return {
    absolutize: absolutize,
    rectInViewport: rectInViewport,
    shortHost: shortHost,
    dimsText: dimsText,
    summarizeAnalysis: summarizeAnalysis
  };
}));
