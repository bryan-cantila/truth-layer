/* Truth Layer — tests/run.js
 * Node assert-based unit tests for src/lib/url-heuristics.js.
 * Run: node tests/run.js   (from the extension root)
 * Exits non-zero on any failure.
 */
'use strict';
const assert = require('assert');
const H = require('../src/lib/url-heuristics');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function reasonsContain(v, substr) {
  assert.ok(v.reasons.some(r => r.toLowerCase().includes(substr.toLowerCase())),
    'expected a reason containing "' + substr + '", got: ' + JSON.stringify(v.reasons));
}

console.log('url-heuristics tests');

t('safe control: github.com scores 100, Looks safe, no reasons', () => {
  const v = H.scoreUrl('https://www.github.com/');
  assert.strictEqual(v.score, 100);
  assert.strictEqual(v.band, 'Looks safe');
  assert.deepStrictEqual(v.reasons, []);
});

t('safe control with www subdomain: paypal.com untouched', () => {
  const v = H.scoreUrl('https://www.paypal.com/signin');
  assert.strictEqual(v.score, 100, JSON.stringify(v));
});

t('punycode host flagged with encoded-chars reason', () => {
  const v = H.scoreUrl('https://xn--pple-43d.com/login');
  // -40 punycode, -10 urgency language on /login => 50, Suspicious
  assert.strictEqual(v.score, 50);
  assert.strictEqual(v.band, 'Suspicious');
  reasonsContain(v, 'xn--');
});

t('typosquat paypa1.com is Suspicious or worse, mimics reason', () => {
  const v = H.scoreUrl('https://paypa1.com/login');
  assert.ok(v.score <= 65, 'score=' + v.score);
  assert.ok(v.band === 'Suspicious' || v.band === 'Dangerous', v.band);
  reasonsContain(v, 'mimics');
});

t('brand-as-subdomain trick flagged', () => {
  const v = H.scoreUrl('https://paypal.com.verify-login.xyz/');
  assert.ok(v.score <= 65, 'score=' + v.score);
  reasonsContain(v, 'subdomain');
});

t('mangled brand as subdomain flagged (faceb00k)', () => {
  const v = H.scoreUrl('https://faceb00k.com.login.verify.tk/');
  assert.ok(v.score < 80, 'score=' + v.score);
  reasonsContain(v, 'subdomain');
});

t('shortener deducts 15 with expand reason', () => {
  const v = H.scoreUrl('https://bit.ly/3abcXYZ');
  assert.strictEqual(v.score, 85);
  assert.strictEqual(v.band, 'Looks safe');
  reasonsContain(v, 'short link');
});

t('IP literal host flagged', () => {
  const v = H.scoreUrl('http://192.0.2.44/login');
  assert.ok(v.score < 80, 'score=' + v.score);
  reasonsContain(v, 'IP address');
});

t('@ redirect trick flagged', () => {
  const v = H.scoreUrl('https://paypal.com@evil-example.com/');
  assert.ok(v.score <= 75, 'score=' + v.score);
  reasonsContain(v, '@');
});

t('plain http deducts 10', () => {
  const v = H.scoreUrl('http://example.com/');
  assert.strictEqual(v.score, 90);
  assert.strictEqual(v.band, 'Looks safe');
  reasonsContain(v, 'http');
});

t('suspicious TLD .zip flagged', () => {
  const v = H.scoreUrl('https://invoice-update.zip/download');
  assert.ok(v.score <= 80, 'score=' + v.score);
  reasonsContain(v, 'top-level domain');
});

t('urgency words only count with other risk signals', () => {
  const clean = H.scoreUrl('https://accounts.google.com/signin/verify');
  assert.strictEqual(clean.score, 100, JSON.stringify(clean));
  const risky = H.scoreUrl('http://secure-login-verify.tk/account');
  // -20 suspicious TLD, -10 http, -10 urgency => 60, Caution
  assert.strictEqual(risky.score, 60);
  assert.strictEqual(risky.band, 'Caution');
  reasonsContain(risky, 'urgency');
});

t('many subdomains flagged', () => {
  const v = H.scoreUrl('https://a.b.c.d.e.f.example.com/');
  assert.ok(v.score < 100, 'score=' + v.score);
  reasonsContain(v, 'complex');
});

t('invalid URL scores 0 Dangerous', () => {
  const v = H.scoreUrl('not a url at all');
  assert.strictEqual(v.score, 0);
  assert.strictEqual(v.band, 'Dangerous');
});

t('non-web scheme scored Dangerous', () => {
  const v = H.scoreUrl('ftp://example.com/file');
  assert.strictEqual(v.band, 'Dangerous');
});

t('band boundaries', () => {
  assert.strictEqual(H.bandFor(80), 'Looks safe');
  assert.strictEqual(H.bandFor(79), 'Caution');
  assert.strictEqual(H.bandFor(60), 'Caution');
  assert.strictEqual(H.bandFor(59), 'Suspicious');
  assert.strictEqual(H.bandFor(35), 'Suspicious');
  assert.strictEqual(H.bandFor(34), 'Dangerous');
  assert.strictEqual(H.bandFor(100), 'Looks safe');
  assert.strictEqual(H.bandFor(0), 'Dangerous');
});

t('levenshtein sanity', () => {
  assert.strictEqual(H.levenshtein('paypal', 'paypal'), 0);
  assert.strictEqual(H.levenshtein('paypa1', 'paypal'), 1);
  assert.strictEqual(H.levenshtein('kitten', 'sitting'), 3);
});

console.log('media-utils tests');
const MU = require('../src/lib/media-utils');

t('absolutize resolves relative URLs against the base', () => {
  assert.strictEqual(MU.absolutize('/img/a.jpg', 'https://example.com/p/'), 'https://example.com/img/a.jpg');
  assert.strictEqual(MU.absolutize('https://cdn.x/y.png', 'https://example.com/'), 'https://cdn.x/y.png');
  assert.strictEqual(MU.absolutize('a/b.jpg', 'https://example.com/p/q.html'), 'https://example.com/p/a/b.jpg');
});

t('absolutize returns empty string for invalid URLs', () => {
  assert.strictEqual(MU.absolutize('http://exa mple.com/x', 'https://example.com/'), '');
  assert.strictEqual(MU.absolutize('', 'not a base'), '');
});

t('rectInViewport detects overlap with the viewport', () => {
  assert.strictEqual(MU.rectInViewport({ top: 10, bottom: 100, left: 10, right: 100 }, 800, 600), true);
  assert.strictEqual(MU.rectInViewport({ top: -50, bottom: 10, left: 10, right: 100 }, 800, 600), true); // partial
  assert.strictEqual(MU.rectInViewport({ top: 700, bottom: 900, left: 10, right: 100 }, 800, 600), false); // below
  assert.strictEqual(MU.rectInViewport({ top: 10, bottom: 100, left: 900, right: 1100 }, 800, 600), false); // right
  assert.strictEqual(MU.rectInViewport(null, 800, 600), false);
});

t('shortHost extracts the hostname, safely', () => {
  assert.strictEqual(MU.shortHost('https://sub.example.com/x.jpg'), 'sub.example.com');
  assert.strictEqual(MU.shortHost('notaurl'), '(unknown host)');
});

t('dimsText formats dimensions or reports unknown', () => {
  assert.strictEqual(MU.dimsText(1280, 720), '1280×720');
  assert.strictEqual(MU.dimsText(0, 0), 'size unknown');
  assert.strictEqual(MU.dimsText(undefined, 100), 'size unknown');
});

t('summarizeAnalysis reports C2PA presence and generator hint', () => {
  const lines = MU.summarizeAnalysis(
    { aiIndicators: [] },
    { present: true, detail: 'manifest v1', generator: 'Adobe Photoshop' }
  );
  assert.strictEqual(lines[0].cls, 'ok');
  assert.ok(lines[0].text.includes('C2PA manifest found'));
  assert.ok(lines.some(l => l.text.includes('Adobe Photoshop')));
});

t('summarizeAnalysis is honest when nothing is found', () => {
  const lines = MU.summarizeAnalysis({ aiIndicators: [] }, { present: false });
  assert.ok(lines.some(l => l.cls === 'warn' && l.text.includes('No provenance manifest')));
  assert.ok(lines.some(l => l.cls === 'muted' && l.text.includes('Not proof of authenticity')));
});

t('summarizeAnalysis surfaces AI-generator tags', () => {
  const lines = MU.summarizeAnalysis(
    { aiIndicators: [{ field: 'EXIF', match: 'midjourney', value: 'Midjourney v6' }] },
    { present: false }
  );
  assert.ok(lines.some(l => l.cls === 'hit' && l.text.includes('midjourney') && l.text.includes('EXIF')));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
