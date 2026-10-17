/* Truth Layer — metadata.js
 *
 * Reads image metadata locally: JPEG EXIF (Make/Model/Software/UserComment),
 * JPEG XMP blocks, and PNG tEXt/iTXt chunks. Flags values that match known
 * AI-generator tags. Pure JS, no dependencies, no network, no DOM.
 *
 * Honest limits (surfaced to the user, not hidden):
 *  - Compressed PNG text chunks (zTXt) are skipped: no inflater without deps.
 *  - Absence of metadata proves nothing: most platforms strip EXIF on upload.
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
  else root.TL_metadata = api;
}(typeof self !== 'undefined' ? self : globalThis, function (LISTS) {
  'use strict';

  function ascii(bytes, off, len) {
    var s = '';
    for (var i = 0; i < len && off + i < bytes.length; i++) {
      var c = bytes[off + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  function u16(bytes, off, le) {
    return le ? (bytes[off] | (bytes[off + 1] << 8)) : ((bytes[off] << 8) | bytes[off + 1]);
  }

  function u32(bytes, off, le) {
    if (le) {
      return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
    }
    return (((bytes[off] << 8) | bytes[off + 1]) << 16 | ((bytes[off + 2] << 8) | bytes[off + 3])) >>> 0;
  }

  var EXIF_TAGS = { 0x010F: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x9286: 'UserComment' };

  // Parse one TIFF IFD. Returns {fields, nextIfdOffset}.
  function parseIfd(bytes, tiffStart, ifdOff, fields) {
    if (ifdOff < 0 || tiffStart + ifdOff + 2 > bytes.length) return;
    var le = bytes[tiffStart] === 0x49; // 'II' little-endian, 'MM' big-endian
    var count = u16(bytes, tiffStart + ifdOff, le);
    for (var i = 0; i < count; i++) {
      var e = tiffStart + ifdOff + 2 + i * 12;
      if (e + 12 > bytes.length) break;
      var tag = u16(bytes, e, le);
      var type = u16(bytes, e + 2, le);
      var cnt = u32(bytes, e + 4, le);
      var name = EXIF_TAGS[tag];
      var valOff = e + 8;
      if (type === 2 && name) { // ASCII
        var str;
        if (cnt <= 4) {
          str = ascii(bytes, valOff, cnt);
        } else {
          var dataOff = tiffStart + u32(bytes, valOff, le);
          str = ascii(bytes, dataOff, Math.min(cnt, 256));
        }
        if (str) fields[name] = str;
      } else if (tag === 0x9286 && type === 7 && name) { // UNDEFINED UserComment
        var cOff = cnt <= 4 ? valOff : tiffStart + u32(bytes, valOff, le);
        // first 8 bytes are character code; comment follows
        var comment = ascii(bytes, cOff + 8, Math.min(cnt > 8 ? cnt - 8 : 0, 256));
        if (comment) fields[name] = comment;
      } else if (tag === 0x8769 && (type === 3 || type === 4)) { // ExifIFD pointer: recurse
        var sub = tiffStart + u32(bytes, valOff, le);
        parseIfd(bytes, tiffStart, sub - tiffStart, fields);
      }
    }
  }

  function parseExifApp1(seg, fields, notes) {
    // seg: APP1 payload AFTER the 2-byte length; starts with 'Exif\0\0'
    if (seg.length < 14 || ascii(seg, 0, 4) !== 'Exif') return;
    var tiffStart = 6;
    var order = ascii(seg, tiffStart, 2);
    if (order !== 'II' && order !== 'MM') { notes.push('EXIF header has an unknown byte order; skipped.'); return; }
    var le = order === 'II';
    if (u16(seg, tiffStart + 2, le) !== 42) { notes.push('EXIF header failed validation; skipped.'); return; }
    var ifd0 = u32(seg, tiffStart + 4, le);
    parseIfd(seg, tiffStart, ifd0, fields);
  }

  function findAiTags(text, field, out) {
    var low = String(text).toLowerCase();
    for (var i = 0; i < LISTS.AI_GENERATOR_TAGS.length; i++) {
      var tag = LISTS.AI_GENERATOR_TAGS[i];
      if (low.indexOf(tag) !== -1) {
        out.push({ field: field, match: tag, value: String(text).slice(0, 140) });
        return; // one hit per field is enough
      }
    }
  }

  function analyzeImageMetadata(input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    var result = { format: 'unknown', fields: {}, aiIndicators: [], notes: [] };

    // --- JPEG ---
    if (bytes.length > 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
      result.format = 'jpeg';
      var pos = 2;
      var foundExif = false;
      while (pos + 4 < bytes.length) {
        if (bytes[pos] !== 0xFF) break;
        var marker = bytes[pos + 1];
        while (marker === 0xFF && pos + 2 < bytes.length) { pos++; marker = bytes[pos + 1]; }
        if (marker === 0xD9 || marker === 0xDA) break; // EOI or SOS: stop
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { pos += 2; continue; }
        var segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
        if (segLen < 2) break;
        var seg = bytes.slice(pos + 4, pos + 2 + segLen);
        if (marker === 0xE1) {
          if (seg.length > 6 && ascii(seg, 0, 4) === 'Exif') {
            foundExif = true;
            parseExifApp1(seg, result.fields, result.notes);
          } else if (ascii(seg, 0, 28).indexOf('ns.adobe.com/xap/1.0/') !== -1) {
            var xmp = ascii(seg, 29, Math.min(seg.length - 29, 4000));
            result.fields.XMP = xmp.slice(0, 300);
            findAiTags(xmp, 'XMP', result.aiIndicators);
          }
        }
        pos += 2 + segLen;
      }
      if (!foundExif && !result.fields.XMP) {
        result.notes.push('No EXIF or XMP metadata found. Most platforms strip metadata on upload, so this proves nothing either way.');
      }
    }
    // --- PNG ---
    else if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      result.format = 'png';
      var p = 8, textFound = false;
      while (p + 12 <= bytes.length) {
        var len = (((bytes[p] << 8) | bytes[p + 1]) << 16) | ((bytes[p + 2] << 8) | bytes[p + 3]);
        len = len >>> 0;
        var type = ascii(bytes, p + 4, 4);
        if (p + 8 + len > bytes.length) break;
        var data = bytes.slice(p + 8, p + 8 + len);
        if (type === 'tEXt') {
          textFound = true;
          var nul = data.indexOf(0);
          var kw = ascii(data, 0, nul < 0 ? data.length : nul);
          var txt = ascii(data, (nul < 0 ? data.length : nul) + 1, Math.min(data.length, 400));
          result.fields['PNG:' + kw] = txt.slice(0, 200);
          findAiTags(txt, 'PNG:' + kw, result.aiIndicators);
        } else if (type === 'iTXt') {
          textFound = true;
          var n1 = data.indexOf(0);
          var kw2 = ascii(data, 0, n1 < 0 ? 0 : n1);
          if (n1 >= 0 && data.length > n1 + 5 && data[n1 + 1] === 0) { // uncompressed
            var o = n1 + 3;
            var n2 = data.indexOf(0, o); // language tag
            o = (n2 < 0 ? data.length : n2) + 1;
            var n3 = data.indexOf(0, o); // translated keyword
            o = (n3 < 0 ? data.length : n3) + 1;
            var txt2 = ascii(data, o, Math.min(data.length - o, 400));
            result.fields['PNG:' + kw2] = txt2.slice(0, 200);
            findAiTags(txt2, 'PNG:' + kw2, result.aiIndicators);
          } else {
            result.notes.push('A compressed PNG text chunk was skipped (no inflater bundled).');
          }
        } else if (type === 'zTXt') {
          result.notes.push('A compressed PNG text chunk (zTXt) was skipped (no inflater bundled).');
        } else if (type === 'IEND') {
          break;
        }
        p += 12 + len;
      }
      if (!textFound) {
        result.notes.push('No PNG text chunks found. AI generators sometimes sign their output here; absence proves nothing.');
      }
    } else {
      result.notes.push('Unrecognized image format (not JPEG or PNG); metadata analysis skipped.');
    }

    // Final AI-tag sweep over collected fields not already checked inline.
    Object.keys(result.fields).forEach(function (k) {
      if (k === 'XMP' || k.indexOf('PNG:') === 0) return; // already checked during parsing
      findAiTags(result.fields[k], k, result.aiIndicators);
    });

    return result;
  }

  return { analyzeImageMetadata: analyzeImageMetadata, AI_SOURCE: 'local-metadata' };
}));
