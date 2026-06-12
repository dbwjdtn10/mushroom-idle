// PWA 아이콘 생성기 — 의존성 없이 순수 Node(zlib)로 버섯 아이콘 PNG 생성
// 사용법: node tests/make-icons.js  (프로젝트 루트에 icon-192.png, icon-512.png 생성)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG 인코더 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, pixels /* RGBA Uint8Array */) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // 필터 없음
    pixels.copy ? null : null;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 드로잉 ---------- */
function hex(c) { return [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)]; }
function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const put = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const al = a === undefined ? 255 : a;
    px[i] = rgb[0]; px[i+1] = rgb[1]; px[i+2] = rgb[2]; px[i+3] = al;
  };
  const BG = hex('#3b2f55'), BG2 = hex('#2b2438');
  const CAP = hex('#e84a42'), CAP_D = hex('#c63832');
  const DOT = hex('#fff6e8');
  const STEM = hex('#ffeed2'), STEM_D = hex('#e8d4b0');
  const EYE = hex('#5a4a3a');

  const u = size / 100; // 100×100 좌표계
  const inRRect = (x, y, r) => {
    const d = r;
    if (x >= d && x <= size-d) return y >= 0 && y <= size;
    if (y >= d && y <= size-d) return x >= 0 && x <= size;
    const cx = x < d ? d : size-d, cy = y < d ? d : size-d;
    return (x-cx)**2 + (y-cy)**2 <= d*d;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 배경 (라운드 사각형 + 위아래 그라데이션)
      if (inRRect(x, y, 18*u)) {
        const t = y / size;
        put(x, y, [
          BG[0]*(1-t) + BG2[0]*t,
          BG[1]*(1-t) + BG2[1]*t,
          BG[2]*(1-t) + BG2[2]*t,
        ]);
      }
      const fx = x/u, fy = y/u; // 0~100
      // 줄기 (라운드 기둥)
      if (fx >= 38 && fx <= 62 && fy >= 48 && fy <= 80) {
        const edge = Math.min(fx-38, 62-fx);
        if (fy <= 76 || edge > 4 - (fy-76)) put(x, y, edge < 2.5 ? STEM_D : STEM);
      }
      // 갓 (반타원 돔)
      const dx = (fx-50)/34, dy = (fy-46)/30;
      if (dx*dx + dy*dy <= 1 && fy <= 50) {
        put(x, y, fy > 44 ? CAP_D : CAP);
      }
      // 갓 흰 점
      for (const [px2, py2, r] of [[36,32,6],[60,24,7],[64,40,5]]) {
        if ((fx-px2)**2 + (fy-py2)**2 <= r*r) {
          const ddx = (fx-50)/34, ddy = (fy-46)/30;
          if (ddx*ddx + ddy*ddy <= 1 && fy <= 50) put(x, y, DOT);
        }
      }
      // 눈
      for (const ex of [44, 56]) {
        if ((fx-ex)**2 + (fy-60)**2 <= 2.2*2.2) put(x, y, EYE);
      }
      // 입 (작은 호)
      if (fy >= 65 && fy <= 67 && fx >= 47 && fx <= 53) put(x, y, EYE);
    }
  }
  return Buffer.from(px.buffer);
}

const outDir = path.join(__dirname, '..');
for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png = encodePng(size, new Uint8Array(pixels));
  const file = path.join(outDir, 'icon-' + size + '.png');
  fs.writeFileSync(file, png);
  console.log('생성:', file, png.length, 'bytes');
}
