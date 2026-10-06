#!/usr/bin/env node
/* global __dirname, Buffer */
/**
 * Sarh brand icons — derived ONLY by cropping / scaling the master artwork
 * (`assets/brand/sarh-icon-master.png`: white waves on the black rounded tile).
 *
 * The waves are lifted from the master as an alpha layer (luminance over the
 * tile black) and composited back in their sampled white, so shape and colour
 * stay identical. No redraw, no recolour.
 *
 * - Full-bleed icons (iOS/Expo `icon`, web, PWA, favicons): the tile interior is
 *   cropped to a square and filled edge-to-edge with the reference black, so the
 *   OS mask applies the only rounding (no double corners, no rim).
 * - Android adaptive foreground: waves on transparent, tile mapped to the 72dp
 *   visible area of the 108dp layer (waves sit inside the 66dp safe circle);
 *   background colour = reference black.
 * - Notification icon: white silhouette of the waves on transparent.
 *
 * Usage: `npm run sync:icons` (from app/).
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const APP = path.resolve(__dirname, '..');
const REPO = path.resolve(APP, '..');
const MASTER = path.join(APP, 'assets', 'brand', 'sarh-icon-master.png');

/** Tile interior black measured from the master (dominant #020202 with #010101). */
const REFERENCE_BLACK = [2, 2, 2];
/** Wave white measured from the master. */
const WAVE_WHITE = [251, 251, 251];
const SILHOUETTE_WHITE = [255, 255, 255];

const master = PNG.sync.read(fs.readFileSync(MASTER));
const W = master.width;
const H = master.height;
const px = master.data;
const maxCh = (x, y) => {
  const i = (y * W + x) * 4;
  return Math.max(px[i], px[i + 1], px[i + 2]);
};

/** Rim = thin dark-grey outline (not black, not wave white). */
const isRim = (v) => v > 0x18 && v < 0xc0;

function detectTile() {
  const midY = Math.floor(H / 2);
  const midX = Math.floor(W / 2);
  let left = -1;
  let right = -1;
  let top = -1;
  let bottom = -1;
  for (let x = 0; x < W; x++) if (isRim(maxCh(x, midY))) { left = x; break; }
  for (let x = W - 1; x >= 0; x--) if (isRim(maxCh(x, midY))) { right = x; break; }
  for (let y = 0; y < H; y++) if (isRim(maxCh(midX, y))) { top = y; break; }
  for (let y = H - 1; y >= 0; y--) if (isRim(maxCh(midX, y))) { bottom = y; break; }
  if ([left, right, top, bottom].some((v) => v < 0)) throw new Error('tile rim not found');
  const side = right - left + 1;
  return { cx: (left + right + 1) / 2, cy: (top + bottom + 1) / 2, side };
}

function detectWaves() {
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (maxCh(x, y) > 0xc0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const tile = detectTile();
const waves = detectWaves();

/** Wave coverage (0..1), only inside the waves box (+margin) so the rim never leaks in. */
const MARGIN = 6;
const alpha = new Float64Array(W * H);
for (let y = Math.max(0, waves.minY - MARGIN); y <= Math.min(H - 1, waves.maxY + MARGIN); y++) {
  for (let x = Math.max(0, waves.minX - MARGIN); x <= Math.min(W - 1, waves.maxX + MARGIN); x++) {
    const a = (maxCh(x, y) - REFERENCE_BLACK[0]) / (WAVE_WHITE[0] - REFERENCE_BLACK[0]);
    alpha[y * W + x] = Math.min(1, Math.max(0, a));
  }
}

/** Summed-area table → exact box-filter area sampling at any scale. */
const SW = W + 1;
const sat = new Float64Array(SW * (H + 1));
for (let y = 0; y < H; y++) {
  let row = 0;
  for (let x = 0; x < W; x++) {
    row += alpha[y * W + x];
    sat[(y + 1) * SW + (x + 1)] = sat[y * SW + (x + 1)] + row;
  }
}
function satAt(x, y) {
  const cx = Math.min(W, Math.max(0, x));
  const cy = Math.min(H, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(W, x0 + 1);
  const y1 = Math.min(H, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const a = sat[y0 * SW + x0];
  const b = sat[y0 * SW + x1];
  const c = sat[y1 * SW + x0];
  const d = sat[y1 * SW + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
function coverage(x0, y0, x1, y1) {
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  const s = satAt(x1, y1) - satAt(x0, y1) - satAt(x1, y0) + satAt(x0, y0);
  return Math.min(1, Math.max(0, s / area));
}

/** Anti-aliased circle coverage for a pixel (4×4 supersampling). */
function circleCoverage(u, v, size) {
  const r = size / 2;
  let hit = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const dx = u + (sx + 0.5) / 4 - r;
      const dy = v + (sy + 0.5) / 4 - r;
      if (dx * dx + dy * dy <= r * r) hit++;
    }
  }
  return hit / 16;
}

/**
 * Render a square image.
 * @param size     output px
 * @param window   master-space square { cx, cy, side } that maps to `fill` of the output
 * @param fill     fraction of the output side covered by `window`
 * @param bg       [r,g,b] or null (transparent)
 * @param ink      wave colour
 * @param mask     'none' | 'circle'
 */
function render({ size, window, fill, bg, ink = WAVE_WHITE, mask = 'none' }) {
  const out = new PNG({ width: size, height: size });
  const outSide = size * fill;
  const k = window.side / outSide; // master px per output px
  const ox = window.cx - (size / 2) * k;
  const oy = window.cy - (size / 2) * k;
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const a = coverage(ox + u * k, oy + v * k, ox + (u + 1) * k, oy + (v + 1) * k);
      const m = mask === 'circle' ? circleCoverage(u, v, size) : 1;
      const i = (v * size + u) * 4;
      if (bg) {
        for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(bg[c] * (1 - a) + ink[c] * a);
        out.data[i + 3] = Math.round(255 * m);
      } else {
        for (let c = 0; c < 3; c++) out.data[i + c] = ink[c];
        out.data[i + 3] = Math.round(255 * a * m);
      }
    }
  }
  return out;
}

function encode(png, opaque) {
  return PNG.sync.write(png, { colorType: opaque ? 2 : 6, deflateLevel: 9 });
}
function save(rel, png, opaque) {
  const file = path.join(APP, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode(png, opaque));
  console.log('  ', rel, `${png.width}x${png.height}`, opaque ? 'RGB' : 'RGBA');
}

const TILE_WINDOW = { cx: tile.cx, cy: tile.cy, side: tile.side };
/** Waves box squared around its own centre (notification silhouette). */
const WAVES_WINDOW = {
  cx: (waves.minX + waves.maxX + 1) / 2,
  cy: (waves.minY + waves.maxY + 1) / 2,
  side: Math.max(waves.maxX - waves.minX + 1, waves.maxY - waves.minY + 1),
};
/** 72dp visible area of the 108dp adaptive layer. */
const ADAPTIVE_FILL = 72 / 108;
/** 24dp notification icon with a 2dp margin each side. */
const NOTIFICATION_FILL = 20 / 24;

const fullBleed = (size) => render({ size, window: TILE_WINDOW, fill: 1, bg: REFERENCE_BLACK });
const adaptiveForeground = (size) => render({ size, window: TILE_WINDOW, fill: ADAPTIVE_FILL, bg: null });
const legacyLauncher = (size, mask) =>
  render({ size, window: TILE_WINDOW, fill: ADAPTIVE_FILL, bg: REFERENCE_BLACK, mask });
const notification = (size) =>
  render({ size, window: WAVES_WINDOW, fill: NOTIFICATION_FILL, bg: null, ink: SILHOUETTE_WHITE });

/** ICO with PNG-compressed entries (supported by every current browser). */
function writeIco(file, sizes) {
  const images = sizes.map((s) => encode(fullBleed(s), false));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, n) => {
    const e = 6 + n * 16;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[n].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[n].length;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...images]));
  console.log('  ', path.relative(APP, file), sizes.join('/'), 'ICO');
}

const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

console.log('master', `${W}x${H}`, 'tile', tile, 'waves', waves);
console.log('Expo / iOS / web');
save('assets/images/icon.png', fullBleed(1024), true);
save('assets/images/adaptive-icon.png', adaptiveForeground(1024), false);
save('assets/images/favicon.png', fullBleed(120), true);
save('assets/images/notification-icon.png', notification(96), false);
save('public/icon-192.png', fullBleed(192), true);
save('public/icon-512.png', fullBleed(512), true);
save('public/apple-touch-icon.png', fullBleed(180), true);

console.log('Android native');
for (const [d, scale] of Object.entries(DENSITIES)) {
  save(`${RES}/mipmap-${d}/ic_launcher.png`, legacyLauncher(48 * scale, 'none'), true);
  save(`${RES}/mipmap-${d}/ic_launcher_round.png`, legacyLauncher(48 * scale, 'circle'), false);
  save(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, adaptiveForeground(108 * scale), false);
  save(`${RES}/drawable-${d}/notification_icon.png`, notification(24 * scale), false);
}

console.log('Admin panel');
writeIco(path.join(REPO, 'admin-panel', 'src', 'app', 'favicon.ico'), [16, 32, 48]);

console.log('done');
