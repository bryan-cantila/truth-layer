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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
