/* Truth Layer — tools/make-icons.js
 * Generates icons/icon{16,48,128}.png with zero dependencies.
 * Design: dark navy rounded square, teal shield, white check.
 * Run: node tools/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- CRC32 (zlib has no public crc32) ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// --- vector helpers (unit coords 0..1, y down) ---
function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const SHIELD = [[0.28, 0.20], [0.72, 0.20], [0.72, 0.46], [0.63, 0.64], [0.50, 0.78], [0.37, 0.64], [0.28, 0.46]];
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const NAVY = [13, 21, 38, 255];
const TEAL = [45, 212, 191, 255];
const WHITE = [255, 255, 255, 255];

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  // supersample 2x for smooth edges
  const SS = 2, n = size * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = (y + (sy + 0.5) / SS) / size;
          let col = null;
          if (inRoundedRect(ux, uy, 0.22)) col = NAVY;
          if (col && inPoly(ux, uy, SHIELD)) col = TEAL;
          if (col === TEAL) {
            const d = Math.min(
              distSeg(ux, uy, 0.40, 0.485, 0.472, 0.565),
              distSeg(ux, uy, 0.472, 0.565, 0.615, 0.375)
            );
            if (d < 0.038) col = WHITE;
          }
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += col[3]; cnt++; }
        }
      }
      const o = (y * size + x) * 4;
      if (cnt) { px[o] = r / cnt; px[o + 1] = g / cnt; px[o + 2] = b / cnt; px[o + 3] = a / cnt; }
    }
  }
  // PNG: filter-0 scanlines, deflate
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  return png;
}

const outDir = path.join(__dirname, '..', 'icons');
[16, 48, 128].forEach(s => {
  const p = path.join(outDir, 'icon' + s + '.png');
  fs.writeFileSync(p, drawIcon(s));
  console.log('wrote', p, fs.statSync(p).size + ' bytes');
});
