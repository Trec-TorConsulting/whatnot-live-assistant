// Draws the extension icon (yellow rounded square with a dark bookmark) as PNGs, no dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const png = (size, pixel) => {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) row.set(pixel(x + 0.5, y + 0.5, size), 1 + x * 4);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const YELLOW = [245, 197, 24, 255];
const DARK = [20, 22, 27, 255];
const CLEAR = [0, 0, 0, 0];

const insideRounded = (x, y, s, r) => {
  const cx = Math.min(Math.max(x, r), s - r);
  const cy = Math.min(Math.max(y, r), s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// Bookmark: a rectangle with a V notch cut from the bottom edge.
const insideBookmark = (x, y, s) => {
  const left = s * 0.3;
  const right = s * 0.7;
  const top = s * 0.2;
  const bottom = s * 0.8;
  if (x < left || x > right || y < top || y > bottom) return false;
  const mid = (left + right) / 2;
  const notchDepth = s * 0.16;
  const notchY = bottom - notchDepth * (1 - Math.abs(x - mid) / ((right - left) / 2));
  return y <= notchY;
};

const pixel = (x, y, s) => {
  if (!insideRounded(x, y, s, s * 0.22)) return CLEAR;
  return insideBookmark(x, y, s) ? DARK : YELLOW;
};

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 48, 128]) writeFileSync(`public/icons/icon-${size}.png`, png(size, pixel));
console.log('icons written to public/icons');
