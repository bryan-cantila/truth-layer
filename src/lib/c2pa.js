/* Truth Layer — c2pa.js
 *
 * Minimal C2PA (Coalition for Content Provenance and Authenticity) detector.
 * Scans raw file bytes for JUMBF ('jumb') boxes carrying a 'c2pa' manifest
 * store. Pure JS, no dependencies, no network, no DOM.
 *
 * Honest scope for v1: this confirms PRESENCE of a manifest. It does not
 * parse CBOR claim structures, validate signatures, or extract the full
 * assertion list — that is documented future work. Absence of a manifest
 * is reported as "no provenance found", never as "fake".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TL_c2pa = api;
}(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function findAscii(bytes, word) {
    var hits = [];
    var w = [];
    for (var i = 0; i < word.length; i++) w.push(word.charCodeAt(i));
    outer:
    for (var i = 0; i + w.length <= bytes.length; i++) {
      for (var j = 0; j < w.length; j++) {
        if (bytes[i + j] !== w[j]) continue outer;
      }
      hits.push(i);
    }
    return hits;
  }

  // Try to pull a human-readable generator string from near a manifest hit.
  function sniffGenerator(bytes, at) {
    var start = Math.max(0, at - 2048);
    var end = Math.min(bytes.length, at + 2048);
    var s = '';
    for (var i = start; i < end; i++) {
      var c = bytes[i];
      s += (c >= 32 && c < 127) ? String.fromCharCode(c) : ' ';
      if (s.length > 4096) break;
    }
    var m = s.match(/claim_generator[^A-Za-z0-9]{0,8}([A-Za-z0-9 .\-_\/]{2,60})/i) ||
            s.match(/(Adobe Firefly|Midjourney|DALL-E|Stable Diffusion|Photoshop|Lightroom)[^A-Za-z]/i);
    return m ? m[1].trim() : null;
  }

  function detectC2PA(input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

    var c2paHits = findAscii(bytes, 'c2pa');
    var jumbHits = findAscii(bytes, 'jumb');

    if (c2paHits.length === 0) {
      return {
        present: false,
        detail: 'No C2PA/JUMBF manifest boxes found in this file. Most images online carry no provenance data — this is normal and proves nothing about authenticity.',
        generator: null
      };
    }

    // A real manifest store lives inside JUMBF boxes; require proximity
    // so a stray 'c2pa' string in XMP text is not misreported.
    var nearJumb = jumbHits.some(function (j) {
      return c2paHits.some(function (c) { return Math.abs(c - j) < 8192; });
    });

    if (!nearJumb) {
      return {
        present: false,
        detail: 'Found the text "c2pa" but not inside a JUMBF box structure — treated as absent. (v1 is conservative by design.)',
        generator: null
      };
    }

    var generator = sniffGenerator(bytes, c2paHits[0]);
    return {
      present: true,
      detail: 'C2PA manifest store detected (' + c2paHits.length + ' marker' +
        (c2paHits.length === 1 ? '' : 's') + ' inside JUMBF boxes). v1 confirms presence only; full claim parsing and signature validation are future work.',
      generator: generator
    };
  }

  return { detectC2PA: detectC2PA };
}));
