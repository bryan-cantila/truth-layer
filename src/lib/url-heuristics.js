/* Truth Layer — url-heuristics.js
 *
 * Pure functions. No chrome.* APIs, no network access, no DOM.
 * Safe to load in the MV3 service worker (via importScripts), content
 * scripts, popup/analyzer pages, and plain node for unit tests.
 *
 * Scoring: start at 100, deduct per rule, clamp to 0–100.
 * Bands: 80+ "Looks safe" · 60–79 "Caution" · 35–59 "Suspicious" · <35 "Dangerous".
 * Every deduction appends a plain-language reason.
 */
(function (root, factory) {
  var dep = null;
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    dep = require('./domain-lists');
  } else {
    dep = root.TL_lists;
  }
  var api = factory(dep);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TL_heuristics = api;
}(typeof self !== 'undefined' ? self : globalThis, function (LISTS) {
  'use strict';

  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    var prev = new Array(bl + 1), cur = new Array(bl + 1);
    for (var j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      cur[0] = i;
      for (var k = 1; k <= bl; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[bl];
  }

  function bandFor(score) {
    if (score >= 80) return 'Looks safe';
    if (score >= 60) return 'Caution';
    if (score >= 35) return 'Suspicious';
    return 'Dangerous';
  }

  // Crude registrable-domain approximation (last two labels).
  // Good enough for heuristic use; documented as such.
  function registrable(host) {
    var parts = String(host).toLowerCase().split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : host;
  }

  function scoreUrl(urlString) {
    var reasons = [];
    var score = 100;
    function deduct(points, reason) { score -= points; reasons.push(reason); }

    var u;
    try {
      u = new URL(String(urlString).trim());
    } catch (e) {
      return { score: 0, band: 'Dangerous', reasons: ['The address is not a valid URL.'] };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { score: 20, band: 'Dangerous', reasons: ['Non-web address (' + u.protocol.replace(':', '') + ').'] };
    }

    var host = u.hostname.toLowerCase();
    var reg = registrable(host);
    var labels = host.split('.');
    var pathAndQuery = (u.pathname + u.search).toLowerCase();

    // 1. Punycode / IDN homograph disguise.
    if (host.indexOf('xn--') !== -1) {
      deduct(40, 'Uses encoded characters (xn--) to disguise the real domain.');
    }

    // 2a. Trusted brand name used as a subdomain of an unrelated site,
    //     e.g. paypal.com.evil-verify.xyz — exact or near-miss spelling (faceb00k).
    var brandHit = null;
    var subLabels = labels.slice(0, -2);
    outer:
    for (var i = 0; i < LISTS.POPULAR_DOMAINS.length; i++) {
      var brand = LISTS.POPULAR_DOMAINS[i].split('.')[0];
      if (brand.length < 4) continue; // skip tiny brands to avoid false positives
      for (var j = 0; j < subLabels.length; j++) {
        if (subLabels[j] === brand || levenshtein(subLabels[j], brand) <= 2) {
          brandHit = LISTS.POPULAR_DOMAINS[i];
          break outer;
        }
      }
    }
    if (brandHit) {
      deduct(35, 'Uses the name of a well-known site (' + brandHit + ') as a subdomain of an unrelated address.');
    }

    // 2b. Typosquat on the registrable domain (skipped for exact popular domains).
    if (!brandHit && LISTS.POPULAR_DOMAINS.indexOf(reg) === -1) {
      for (var k = 0; k < LISTS.POPULAR_DOMAINS.length; k++) {
        var pop = LISTS.POPULAR_DOMAINS[k];
        if (levenshtein(reg, pop) <= 2) {
          deduct(35, 'Closely mimics a well-known site (' + pop + ').');
          break;
        }
      }
    }

    // 3. Raw IP literal instead of a domain name.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(':') !== -1) {
      deduct(30, 'Uses a raw IP address instead of a domain name.');
    }

    // 4. URL shortener hides the destination.
    if (LISTS.URL_SHORTENERS.indexOf(host) !== -1 || LISTS.URL_SHORTENERS.indexOf(reg) !== -1) {
      deduct(15, 'Hides the real destination behind a short link — expand it before trusting it.');
    }

    // 5. High-risk TLD.
    var tld = labels[labels.length - 1];
    if (LISTS.SUSPICIOUS_TLDS.indexOf(tld) !== -1) {
      deduct(20, 'Uses a high-risk top-level domain (.' + tld + ').');
    }

    // 6. The @ redirect trick: https://trusted.com@evil.com/
    if (u.username) {
      deduct(25, 'Contains an @ redirect trick — everything before @ is ignored by the browser.');
    }

    // 7. Unencrypted.
    if (u.protocol === 'http:') {
      deduct(10, 'Not encrypted (plain http).');
    }

    // 8. Overly complex or random-looking host.
    var subCount = Math.max(0, labels.length - 2);
    var digitRatio = host.replace(/[^0-9]/g, '').length / Math.max(1, host.length);
    var randomish = host.length > 40 && (/[bcdfghjklmnpqrstvwxz]{5}/i.test(host) || digitRatio > 0.35);
    if (subCount > 4 || randomish) {
      deduct(10, 'Overly complex or random-looking address.');
    }

    // 9. Urgency language combined with other risk signals.
    if (score < 100 && /(log-?in|sign-?in|verify|verification|secure|update|account|suspend|urgent|confirm|billing|password)/i.test(pathAndQuery)) {
      deduct(10, 'Uses urgency language (login / verify / secure) alongside other risk signs.');
    }

    if (score < 0) score = 0;
    if (score > 100) score = 100;
    return { score: score, band: bandFor(score), reasons: reasons };
  }

  return {
    scoreUrl: scoreUrl,
    bandFor: bandFor,
    levenshtein: levenshtein,
    registrable: registrable
  };
}));
