// Generates PWA icons and a test fixture image with no external dependencies.
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inside(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Rasterises polygons (unit coordinates 0..1) with 4x4 supersampling. */
function render(width, height, background, polys) {
  const buf = Buffer.alloc(width * height * 4);
  const S = 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / width;
          const v = (y + (sy + 0.5) / S) / height;
          let col = background;
          for (const p of polys) if (inside(u, v, p.pts)) col = p.color;
          if (col) {
            r += col[0]; g += col[1]; b += col[2]; a += 255;
          }
        }
      }
      const n = S * S;
      const i = (y * width + x) * 4;
      const alpha = a / n;
      buf[i] = alpha ? Math.round(r / (a / 255)) : 0;
      buf[i + 1] = alpha ? Math.round(g / (a / 255)) : 0;
      buf[i + 2] = alpha ? Math.round(b / (a / 255)) : 0;
      buf[i + 3] = Math.round(alpha);
    }
  }
  return buf;
}

// The motif: a little geometric "illumination" — gold mandorla, lapis and vermilion shards.
const motif = [
  { color: hex('#1f3a8a'), pts: [[0.18, 0.82], [0.5, 0.2], [0.5, 0.82]] },
  { color: hex('#d2412c'), pts: [[0.5, 0.2], [0.82, 0.82], [0.5, 0.82]] },
  { color: hex('#d4a23a'), pts: [[0.5, 0.36], [0.64, 0.6], [0.5, 0.76], [0.36, 0.6]] },
  { color: hex('#efe4c8'), pts: [[0.5, 0.12], [0.56, 0.2], [0.5, 0.28], [0.44, 0.2]] },
];
const shrink = (polys, k) => polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k]) }));
const black = [0, 0, 0];

function write(rel, data) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log('wrote', rel);
}

write('public/icon-192.png', encodePng(192, 192, render(192, 192, black, motif)));
write('public/icon-512.png', encodePng(512, 512, render(512, 512, black, motif)));
// Maskable icons must keep content inside the central 80% safe zone.
write('public/icon-maskable-512.png', encodePng(512, 512, render(512, 512, black, shrink(motif, 0.75))));
write('public/apple-touch-icon.png', encodePng(180, 180, render(180, 180, black, motif)));

const svgPolys = motif
  .map((p) => `<polygon fill="rgb(${p.color.join(',')})" points="${p.pts.map(([x, y]) => `${x * 64},${y * 64}`).join(' ')}"/>`)
  .join('');
write('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000"/>${svgPolys}</svg>\n`);

// Test fixture: a 600×800 "manuscript" with flat colour regions to trace.
const fixture = [
  { color: hex('#e8dcc0'), pts: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  { color: hex('#1f3a8a'), pts: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.5], [0.1, 0.5]] },
  { color: hex('#d4a23a'), pts: [[0.5, 0.15], [0.75, 0.45], [0.25, 0.45]] },
  { color: hex('#7a1f3d'), pts: [[0.2, 0.6], [0.8, 0.6], [0.6, 0.9], [0.4, 0.9]] },
];
write('tests/fixtures/reference.png', encodePng(600, 800, render(600, 800, null, fixture)));
