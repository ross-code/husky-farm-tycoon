// util.js — pure helpers shared by every module. No game state, no DOM, no imports.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
export const round = (v, p = 0) => { const m = 10 ** p; return Math.round(v * m) / m; };

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

let _id = 0;
export const uid = (prefix = 'id') => `${prefix}_${(++_id).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const avg = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const distSq = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// Axis-aligned grid-rect overlap (in tile units). a,b = {gx,gy,w,h}
export const rectsOverlap = (a, b) =>
  a.gx < b.gx + b.w && a.gx + a.w > b.gx && a.gy < b.gy + b.h && a.gy + a.h > b.gy;

export const fmtMoney = (n) => {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${a.toLocaleString('en-US')}`;
  return `${sign}$${a}`;
};

// seconds -> "Hh Mm" style short clock for mission timers
export const fmtTime = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

// Smooth ease for visual interpolation
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);

// Move a value toward a target by at most `step`.
export const approach = (cur, target, step) => {
  if (cur < target) return Math.min(cur + step, target);
  if (cur > target) return Math.max(cur - step, target);
  return cur;
};

export const deepClone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// Mix two hex colors. t=0 -> a, t=1 -> b.
export const mixHex = (a, b, t) => {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(lerp(pa.r, pb.r, t));
  const g = Math.round(lerp(pa.g, pb.g, t));
  const bl = Math.round(lerp(pa.b, pb.b, t));
  return `rgb(${r},${g},${bl})`;
};
export const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
export const withAlpha = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

// Title-case a key like "siberian_husky" -> "Siberian Husky"
export const titleize = (s) => String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
