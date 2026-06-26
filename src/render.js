// render.js — draws the whole farm to the canvas each frame.
// Imports state/config/util + buildings (geometry). Reads S.ui for ghost/selection.
// Only mutates its own caches (ground layer, snow particles) and ages S.fx.

import { S, cellAt } from './state.js';
import * as C from './config.js';
import { clamp, hexToRgb, withAlpha, lerp } from './util.js';
import { footprintCells } from './buildings.js';

const P = C.PALETTE;
let canvas, ctx, ground, gctx, W, H, lastNow = 0;
const snow = [];

const col = (token) => P[token] || token;

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// deterministic hash -> [0,1)
function hash(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function screenToWorld(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left) * (canvas.width / r.width), y: (cy - r.top) * (canvas.height / r.height) };
}
export function worldToScreen(x, y) {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + x * (r.width / canvas.width), y: r.top + y * (r.height / canvas.height) };
}

export function initRender(cv) {
  canvas = cv;
  ctx = canvas.getContext('2d');
  W = S.grid.cols * S.grid.tile;
  H = S.grid.rows * S.grid.tile;
  canvas.width = W; canvas.height = H;
  buildGround();
  for (let i = 0; i < 70; i++) snow.push(newFlake(true));
}

function newFlake(spread) {
  const near = Math.random() < 0.35;
  return {
    x: Math.random() * W, y: spread ? Math.random() * H : -6,
    r: near ? 1.6 + Math.random() * 1.6 : 0.6 + Math.random(),
    sp: near ? 22 + Math.random() * 20 : 10 + Math.random() * 10,
    drift: (Math.random() - 0.5) * 14, ph: Math.random() * 6.28, near,
  };
}

// Cache the static snowy ground (drift shading + sparkle) once.
function buildGround() {
  ground = document.createElement('canvas');
  ground.width = W; ground.height = H;
  gctx = ground.getContext('2d');
  gctx.fillStyle = col('snow'); gctx.fillRect(0, 0, W, H);
  const t = S.grid.tile;
  // Soft rolling drifts via large low-alpha radial gradients (no visible tile seams).
  for (let i = 0; i < 16; i++) {
    const cx = hash(i * 12.9, 7.1) * W, cy = hash(i * 4.3, 19.7) * H, rad = 90 + hash(i * 2.1, 3.3) * 170;
    const light = i % 2 === 0;
    const c2 = light ? col('snowHi') : col('snowShade');
    const g = gctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, withAlpha(c2, light ? 0.10 : 0.13));
    g.addColorStop(1, withAlpha(c2, 0));
    gctx.fillStyle = g; gctx.fillRect(0, 0, W, H);
  }
  // Sparse sparkle grain so the snow reads as texture, not flat.
  for (let gy = 0; gy < S.grid.rows; gy++) {
    for (let gx = 0; gx < S.grid.cols; gx++) {
      const dots = 2 + Math.floor(hash(gx, gy) * 4);
      for (let k = 0; k < dots; k++) {
        const hx = hash(gx + k * 3.1, gy + k * 1.7), hy = hash(gx - k * 2.3, gy + k * 5.9);
        gctx.fillStyle = withAlpha(k % 3 === 0 ? col('snowShade') : col('snowHi'), 0.45);
        gctx.beginPath();
        gctx.arc(gx * t + hx * t, gy * t + hy * t, 0.8 + hash(hx, hy) * 0.9, 0, 7);
        gctx.fill();
      }
    }
  }
}

// ---- buildings ----------------------------------------------------------
const isNight = () => S.time.tod >= C.ECONOMY.dayFraction;
const sign = (g, cx, cy, size) => { if (!g) return; ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, cx, cy); };

// Dispatch each building to a type-specific drawer so they read distinctly.
function drawBuilding(b) {
  const def = C.BUILDINGS[b.key]; if (!def) return;
  const t = S.grid.tile;
  const x = b.gx * t, y = b.gy * t, w = b.w * t, h = b.h * t;

  if (def.category === 'decor') {
    if (b.key === 'path_tile') return; // drawn in drawPaths
    return drawDecor(b, def, x, y, w, h);
  }

  // shared apron + contact shadow ground every structure
  ctx.fillStyle = withAlpha(col('snowShadeDeep'), 0.5);
  roundRect(ctx, x + 3, y + h * 0.34, w - 6, h * 0.66 + 4, 8); ctx.fill();
  ctx.fillStyle = withAlpha('#2A3550', 0.18);
  roundRect(ctx, x + 6, y + h - 8, w - 8, 10, 6); ctx.fill();

  switch (def.category) {
    case 'training': return drawYard(x, y, w, h, def);
    case 'kennel': return drawKennel(x, y, w, h, def);
    case 'food': return drawBarn(x, y, w, h, def);
    case 'medical': return drawClinic(x, y, w, h, def);
    case 'breeding': return drawCabin(x, y, w, h, def, { signGlyph: '💕' });
    case 'house': return drawCabin(x, y, w, h, def, { chimney: true, flag: true });
    case 'tourist':
      if (def.key === 'overlook_deck') return drawDeck(x, y, w, h, def);
      if (def.key === 'storytellers_fire') return drawFirepit(x, y, w, h, def);
      if (def.key === 'pawprint_point') return drawPhotoSpot(x, y, w, h, def);
      if (def.key === 'trading_post') return drawShop(x, y, w, h, def);
      if (def.key === 'cocoa_cabin') return drawCabin(x, y, w, h, def, { steam: true });
      return drawCabin(x, y, w, h, def);
    default: return drawCabin(x, y, w, h, def);
  }
}

// A log cabin (house / breeding den / cafe / generic). opts: {chimney, flag, steam, signGlyph}
function drawCabin(x, y, w, h, def, opts = {}) {
  const wallTop = y + h * 0.42, wallH = h * 0.58 - 6;
  ctx.fillStyle = col('wood'); roundRect(ctx, x + 5, wallTop, w - 10, wallH, 6); ctx.fill();
  ctx.fillStyle = withAlpha(col('woodHi'), 0.5); roundRect(ctx, x + 5, wallTop, w - 10, wallH * 0.4, 6); ctx.fill();
  ctx.strokeStyle = withAlpha(col('woodDk'), 0.4); ctx.lineWidth = 1;
  for (let ly = wallTop + 8; ly < wallTop + wallH - 4; ly += 8) { ctx.beginPath(); ctx.moveTo(x + 7, ly); ctx.lineTo(x + w - 7, ly); ctx.stroke(); }
  // gable roof
  ctx.fillStyle = col(def.roof || 'roofBlue');
  ctx.beginPath(); ctx.moveTo(x + 1, wallTop + 4); ctx.lineTo(x + w / 2, y + h * 0.06); ctx.lineTo(x + w - 1, wallTop + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.18);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + h * 0.06); ctx.lineTo(x + w - 1, wallTop + 4); ctx.lineTo(x + w * 0.7, wallTop + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col('roofSnow');
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + h * 0.06); ctx.lineTo(x + w / 2 + 7, y + h * 0.10); ctx.lineTo(x + w / 2 - 7, y + h * 0.10); ctx.closePath(); ctx.fill();
  if (opts.chimney) {
    ctx.fillStyle = col('stone'); roundRect(ctx, x + w * 0.68, y + h * 0.08, 8, h * 0.3, 2); ctx.fill();
    if (isNight()) { ctx.fillStyle = withAlpha('#cfd6df', 0.35); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + w * 0.68 + 4, y + h * 0.06 - i * 5, 3 - i * 0.6, 0, 7); ctx.fill(); } }
  }
  if (opts.flag) {
    const fx = x + w / 2, fy = y + h * 0.06;
    ctx.strokeStyle = col('woodDk'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 13); ctx.stroke();
    ctx.fillStyle = col('brand'); ctx.beginPath(); ctx.moveTo(fx, fy - 13); ctx.lineTo(fx + 9, fy - 10); ctx.lineTo(fx, fy - 7); ctx.closePath(); ctx.fill();
  }
  if (opts.steam) { ctx.fillStyle = withAlpha('#fff', 0.4); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + w * 0.3 + i * 3, wallTop - 4 - i * 4, 3 - i * 0.6, 0, 7); ctx.fill(); } }
  // door
  const dw = Math.min(14, w * 0.22); ctx.fillStyle = col('woodDk');
  roundRect(ctx, x + w / 2 - dw / 2, wallTop + wallH - 18, dw, 18, 3); ctx.fill();
  // windows
  ctx.fillStyle = isNight() ? withAlpha(col('gold'), 0.9) : '#BFE0F0';
  roundRect(ctx, x + 9, wallTop + 8, 8, 8, 2); ctx.fill();
  if (w > 70) { roundRect(ctx, x + w - 17, wallTop + 8, 8, 8, 2); ctx.fill(); }
  ctx.fillStyle = col('ink');
  sign(opts.signGlyph || def.glyph, x + w / 2, y + h * 0.28, Math.min(22, w * 0.3));
}

// Training: a fenced play yard with a ramp, a jump hoop, and weave poles. No roof.
function drawYard(x, y, w, h, def) {
  const top = y + h * 0.3, inH = h - (top - y) - 6;
  ctx.fillStyle = withAlpha(col('path'), 0.22); roundRect(ctx, x + 4, top, w - 8, inH, 8); ctx.fill();
  // A-frame ramp (left)
  ctx.fillStyle = col('roofGreen');
  ctx.beginPath(); ctx.moveTo(x + 12, y + h - 10); ctx.lineTo(x + 23, top + 10); ctx.lineTo(x + 34, y + h - 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = withAlpha('#fff', 0.45); ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) { const ry = top + 10 + (y + h - 10 - (top + 10)) * (i / 4); ctx.beginPath(); ctx.moveTo(x + 12 + (23 - 12) * (i / 4), ry); ctx.lineTo(x + 34 - (34 - 23) * (i / 4), ry); ctx.stroke(); }
  // jump hoop (right)
  ctx.strokeStyle = col('brand'); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x + w - 24, y + h - 24, 9, 11, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = col('brandDeep'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w - 24, y + h - 13); ctx.lineTo(x + w - 24, y + h - 7); ctx.stroke();
  // weave poles (center)
  ctx.fillStyle = col('teal'); for (let i = 0; i < 3; i++) { roundRect(ctx, x + w / 2 - 9 + i * 7, y + h - 26, 3, 19, 1.5); ctx.fill(); }
  // perimeter fence
  drawFence(x + 3, top - 2, w - 6, inH + 2);
  ctx.fillStyle = col('ink'); sign(def.glyph, x + w / 2, y + h * 0.15, Math.min(15, w * 0.16));
}

function drawFence(x, y, w, h) {
  ctx.strokeStyle = col('woodDk'); ctx.lineWidth = 2;
  for (let px = x; px <= x + w + 1; px += 12) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
  ctx.lineWidth = 1.5;
  for (const ry of [y + 3, y + h * 0.55]) { ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + w, ry); ctx.stroke(); }
}

// Kennel: a row of little gabled dog houses with arched doorways.
function drawKennel(x, y, w, h, def) {
  const n = w > 80 ? 2 : 1, gw = (w - 12) / n;
  for (let i = 0; i < n; i++) {
    const hx = x + 6 + i * gw, hy = y + h * 0.46, hh = h * 0.46;
    ctx.fillStyle = col('wood'); roundRect(ctx, hx + 3, hy, gw - 8, hh, 5); ctx.fill();
    ctx.fillStyle = col(def.roof || 'roofBlue');
    ctx.beginPath(); ctx.moveTo(hx + 1, hy + 3); ctx.lineTo(hx + gw / 2, hy - hh * 0.45); ctx.lineTo(hx + gw - 5, hy + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1209'; ctx.beginPath(); ctx.arc(hx + gw / 2 - 1, hy + hh, (gw - 10) * 0.28, Math.PI, 0); ctx.fill();
  }
  ctx.fillStyle = col('ink'); sign(def.glyph, x + w / 2, y + h * 0.18, Math.min(15, w * 0.15));
}

// Food store: a green barn with a big braced door.
function drawBarn(x, y, w, h, def) {
  const wallTop = y + h * 0.4, wallH = h * 0.6 - 6;
  ctx.fillStyle = col('roofGreen'); roundRect(ctx, x + 5, wallTop, w - 10, wallH, 6); ctx.fill();
  ctx.fillStyle = withAlpha('#fff', 0.12); roundRect(ctx, x + 5, wallTop, w - 10, wallH * 0.4, 6); ctx.fill();
  ctx.fillStyle = col('woodDk');
  ctx.beginPath(); ctx.moveTo(x + 2, wallTop + 2); ctx.lineTo(x + w * 0.5, y + h * 0.1); ctx.lineTo(x + w - 2, wallTop + 2); ctx.closePath(); ctx.fill();
  const dw = w * 0.4, dx = x + w / 2 - dw / 2, dh = h * 0.4, dy = y + h - dh - 6;
  ctx.fillStyle = col('wood'); roundRect(ctx, dx, dy, dw, dh, 3); ctx.fill();
  ctx.strokeStyle = withAlpha(col('woodHi'), 0.7); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy + dh); ctx.moveTo(dx + dw, dy); ctx.lineTo(dx, dy + dh); ctx.stroke();
  ctx.fillStyle = col('ink'); sign(def.glyph, x + w / 2, wallTop + 10, Math.min(18, w * 0.2));
}

// Vet clinic: white walls, blue roof band, red cross.
function drawClinic(x, y, w, h, def) {
  const wallTop = y + h * 0.36, wallH = h * 0.64 - 6;
  ctx.fillStyle = '#F4F7FA'; roundRect(ctx, x + 5, wallTop, w - 10, wallH, 6); ctx.fill();
  ctx.fillStyle = withAlpha('#cdd9e6', 0.5); roundRect(ctx, x + 5, wallTop + wallH * 0.55, w - 10, wallH * 0.45, 6); ctx.fill();
  ctx.fillStyle = col('roofBlue'); roundRect(ctx, x + 3, wallTop - 6, w - 6, 10, 4); ctx.fill();
  const cs = Math.min(w, h) * 0.15, cx = x + w / 2, cy = wallTop + wallH * 0.36;
  ctx.fillStyle = col('danger');
  roundRect(ctx, cx - cs * 0.18, cy - cs, cs * 0.36, cs * 2, 2); ctx.fill();
  roundRect(ctx, cx - cs, cy - cs * 0.18, cs * 2, cs * 0.36, 2); ctx.fill();
  ctx.fillStyle = '#9fb3d4'; roundRect(ctx, cx - 7, wallTop + wallH - 16, 14, 16, 2); ctx.fill();
  ctx.fillStyle = isNight() ? withAlpha(col('gold'), 0.9) : '#BFE0F0';
  roundRect(ctx, x + 9, wallTop + 8, 7, 7, 1.5); ctx.fill(); if (w > 70) { roundRect(ctx, x + w - 16, wallTop + 8, 7, 7, 1.5); ctx.fill(); }
}

// Viewing deck: a raised, railed wooden platform.
function drawDeck(x, y, w, h, def) {
  const deckTop = y + h * 0.5, deckH = h * 0.34;
  ctx.fillStyle = col('wood'); roundRect(ctx, x + 5, deckTop, w - 10, deckH, 5); ctx.fill();
  ctx.fillStyle = withAlpha(col('woodHi'), 0.5); roundRect(ctx, x + 5, deckTop, w - 10, deckH * 0.4, 5); ctx.fill();
  ctx.strokeStyle = withAlpha(col('woodDk'), 0.4); ctx.lineWidth = 1;
  for (let lx = x + 11; lx < x + w - 8; lx += 8) { ctx.beginPath(); ctx.moveTo(lx, deckTop); ctx.lineTo(lx, deckTop + deckH); ctx.stroke(); }
  const ry = deckTop - h * 0.2;
  ctx.strokeStyle = col('woodDk'); ctx.lineWidth = 2;
  for (let px = x + 9; px <= x + w - 7; px += 12) { ctx.beginPath(); ctx.moveTo(px, deckTop); ctx.lineTo(px, ry); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x + 8, ry); ctx.lineTo(x + w - 7, ry); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 11, deckTop + deckH); ctx.lineTo(x + 11, y + h - 6); ctx.moveTo(x + w - 11, deckTop + deckH); ctx.lineTo(x + w - 11, y + h - 6); ctx.stroke();
  ctx.fillStyle = col('ink'); sign(def.glyph, x + w / 2, ry - 9, Math.min(15, w * 0.16));
}

// Gift shop: striped awning over a little storefront.
function drawShop(x, y, w, h, def) {
  const wallTop = y + h * 0.42, wallH = h * 0.58 - 6;
  ctx.fillStyle = col('wood'); roundRect(ctx, x + 5, wallTop, w - 10, wallH, 6); ctx.fill();
  const ax = x + 4, ay = wallTop - 2, aw = w - 8, ah = h * 0.14;
  for (let i = 0; i * 10 < aw; i++) { ctx.fillStyle = i % 2 ? col('roofRed') : '#fff'; ctx.fillRect(ax + i * 10, ay, Math.min(10, aw - i * 10), ah); }
  ctx.fillStyle = col('roofRed'); for (let i = 0; i * 10 < aw; i++) { ctx.beginPath(); ctx.arc(ax + Math.min(i * 10 + 5, aw - 1), ay + ah, 5, 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = col('woodDk'); roundRect(ctx, x + w / 2 - 7, wallTop + wallH - 16, 14, 16, 2); ctx.fill();
  ctx.fillStyle = isNight() ? withAlpha(col('gold'), 0.9) : '#BFE0F0'; roundRect(ctx, x + 9, wallTop + 6, 10, 8, 2); ctx.fill();
  ctx.fillStyle = col('ink'); sign(def.glyph, x + w - 16, wallTop + 10, Math.min(16, w * 0.2));
}

// Storyteller's fire: a stone ring with flickering flames and log benches.
function drawFirepit(x, y, w, h, def) {
  const cx = x + w / 2, cy = y + h * 0.6;
  ctx.fillStyle = col('woodDk');
  roundRect(ctx, x + 4, cy + 6, w * 0.3, 5, 2); ctx.fill();
  roundRect(ctx, x + w * 0.66, cy + 6, w * 0.3, 5, 2); ctx.fill();
  if (isNight()) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 42); g.addColorStop(0, withAlpha(col('gold'), 0.35)); g.addColorStop(1, withAlpha(col('gold'), 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 42, 0, 7); ctx.fill(); }
  ctx.fillStyle = col('stone');
  for (let a = 0; a < 6; a++) { const ang = a / 6 * 6.28; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 6, 3.5, 0, 7); ctx.fill(); }
  const f = 1 + Math.sin(performance.now() / 120) * 0.16;
  ctx.fillStyle = col('brandDeep'); ctx.beginPath(); ctx.moveTo(cx - 7, cy + 2); ctx.quadraticCurveTo(cx, cy - 16 * f, cx + 7, cy + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col('gold'); ctx.beginPath(); ctx.moveTo(cx - 4, cy + 1); ctx.quadraticCurveTo(cx, cy - 10 * f, cx + 4, cy + 1); ctx.closePath(); ctx.fill();
}

// Photo spot: an empty picture frame on two posts.
function drawPhotoSpot(x, y, w, h, def) {
  ctx.fillStyle = col('woodDk');
  roundRect(ctx, x + w * 0.22, y + h * 0.42, 4, h * 0.5, 2); ctx.fill();
  roundRect(ctx, x + w * 0.78 - 4, y + h * 0.42, 4, h * 0.5, 2); ctx.fill();
  const fx = x + w * 0.18, fy = y + h * 0.16, fw = w * 0.64, fh = h * 0.42;
  ctx.fillStyle = col('brand'); roundRect(ctx, fx, fy, fw, fh, 4); ctx.fill();
  ctx.fillStyle = withAlpha('#bfe0f0', 0.5); roundRect(ctx, fx + 4, fy + 4, fw - 8, fh - 8, 3); ctx.fill();
  ctx.fillStyle = col('ink'); sign(def.glyph, fx + fw / 2, fy + fh / 2, Math.min(18, fw * 0.4));
}

function drawDecor(b, def, x, y, w, h) {
  ctx.font = `${Math.min(26, w * 0.7)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // small shadow
  ctx.fillStyle = withAlpha('#2A3550', 0.16);
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 6, w * 0.3, 4, 0, 0, 7); ctx.fill();
  ctx.fillText(def.glyph || '🌲', x + w / 2, y + h / 2);
}

function drawPaths() {
  const t = S.grid.tile;
  for (const c of S.grid.cells) {
    if (c.terrain !== 'path') continue;
    ctx.fillStyle = col('path');
    roundRect(ctx, c.gx * t + 2, c.gy * t + 2, t - 4, t - 4, 7); ctx.fill();
    ctx.fillStyle = withAlpha(col('pathHi'), 0.5);
    roundRect(ctx, c.gx * t + 2, c.gy * t + 2, t - 4, (t - 4) * 0.4, 7); ctx.fill();
  }
}

// ---- husky --------------------------------------------------------------
function eyeHex(d, side) {
  if (d.eyeColor === 'hetero') return side === 'L' ? C.EYE_COLORS.blue : C.EYE_COLORS.brown;
  return C.EYE_COLORS[d.eyeColor] || C.EYE_COLORS.brown;
}

function drawDog(d, now) {
  const coat = C.COATS[d.coatId] || C.COATS.gray;
  const S0 = (d.stage === 'puppy' ? 0.62 : 1) * 0.92;
  const headMul = d.stage === 'puppy' ? 1.25 : 1;
  const mood = clamp((d.happiness * 0.6 + d.energy * 0.25 + d.health * 0.15) / 100, 0, 1);
  const tired = d.energy < 30;
  const sick = d.health < 35;
  const gait = Math.sin(d.animPhase * 6.28);
  const breathe = 1 + Math.sin(now / 600 + d.animPhase) * 0.03;

  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(d.facing, 1);

  // contact shadow + selection ring
  ctx.fillStyle = withAlpha(col('snowShadeDeep'), 0.28);
  ctx.beginPath(); ctx.ellipse(2, 4, 15 * S0, 6 * S0, 0, 0, 7); ctx.fill();
  if (S.ui.selected?.type === 'dog' && S.ui.selected.id === d.id) {
    ctx.strokeStyle = col('brand'); ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -now / 60;
    ctx.beginPath(); ctx.ellipse(0, 3, 19 * S0, 8 * S0, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }

  const S1 = S0;
  // tail (sways with happiness)
  const wag = Math.sin(now / (mood > 0.6 ? 90 : 260) + d.animPhase) * (mood > 0.5 ? 0.5 : 0.15);
  ctx.save(); ctx.translate(-12 * S1, -6 * S1); ctx.rotate(tired ? 0.5 : wag);
  ctx.strokeStyle = coat.base; ctx.lineWidth = 6 * S1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-8 * S1, -4 * S1, -12 * S1, -10 * S1); ctx.stroke();
  ctx.strokeStyle = coat.belly; ctx.lineWidth = 3 * S1;
  ctx.beginPath(); ctx.moveTo(-9 * S1, -7 * S1); ctx.quadraticCurveTo(-11 * S1, -9 * S1, -12 * S1, -10 * S1); ctx.stroke();
  ctx.restore();

  // legs (gait)
  ctx.fillStyle = coat.saddle;
  const lo = tired ? 0 : gait * 2.4 * S1;
  for (const [lx, off] of [[-7, lo], [7, -lo]]) { roundRect(ctx, lx * S1 - 2, -2 * S1 + off, 4 * S1, 9 * S1, 2); ctx.fill(); }

  // body
  ctx.save(); ctx.scale(1, breathe);
  ctx.fillStyle = coat.base;
  ctx.beginPath(); ctx.ellipse(0, -8 * S1, 17 * S1, 11 * S1, 0, 0, 7); ctx.fill();
  // saddle (darker back)
  ctx.fillStyle = withAlpha(coat.saddle, 0.9);
  ctx.beginPath(); ctx.ellipse(-2 * S1, -11 * S1, 13 * S1, 7 * S1, 0, 0, 7); ctx.fill();
  // belly patch
  ctx.fillStyle = coat.belly;
  ctx.beginPath(); ctx.ellipse(4 * S1, -5 * S1, 10 * S1, 6 * S1, 0, 0, 7); ctx.fill();
  ctx.restore();

  // front legs
  ctx.fillStyle = coat.base;
  for (const [lx, off] of [[3, -lo], [10, lo]]) { roundRect(ctx, lx * S1 - 2, -1 * S1 + off, 4 * S1, 9 * S1, 2); ctx.fill(); }

  // head group
  const hx = 12 * S1 * headMul * 0.6, hy = -14 * S1;
  ctx.save(); ctx.translate(hx, hy);
  const hs = S1 * headMul;
  // ears (mood: up when happy, back when sad/tired)
  const earUp = lerp(0.5, 0.0, mood) + (tired ? 0.4 : 0);
  ctx.fillStyle = coat.saddle;
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(sgn * 7 * hs, -7 * hs); ctx.rotate(sgn * (0.3 + earUp));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4 * hs, -10 * hs); ctx.lineTo(7 * hs, 1 * hs); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E9A9A9'; ctx.beginPath(); ctx.moveTo(2 * hs, -1 * hs); ctx.lineTo(4 * hs, -6 * hs); ctx.lineTo(5.5 * hs, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = coat.saddle; ctx.restore();
  }
  // head
  ctx.fillStyle = coat.base;
  ctx.beginPath(); ctx.ellipse(0, 0, 10 * hs, 9 * hs, 0, 0, 7); ctx.fill();
  // mask
  drawMask(d, coat, hs);
  // muzzle + nose
  ctx.fillStyle = coat.belly;
  ctx.beginPath(); ctx.ellipse(3 * hs, 4 * hs, 5 * hs, 4 * hs, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2A2A2E';
  ctx.beginPath(); ctx.ellipse(6 * hs, 4 * hs, 2 * hs, 1.6 * hs, 0, 0, 7); ctx.fill();
  // eyes
  if (tired || (sick && Math.random() < 0.3)) {
    ctx.strokeStyle = '#23252b'; ctx.lineWidth = 1.4 * hs; ctx.lineCap = 'round';
    for (const ex of [-2, 4]) { ctx.beginPath(); ctx.arc(ex * hs, -1 * hs, 2 * hs, 0.2, Math.PI - 0.2); ctx.stroke(); }
  } else {
    for (const [ex, side] of [[-2, 'L'], [4, 'R']]) {
      ctx.fillStyle = eyeHex(d, side);
      ctx.beginPath(); ctx.ellipse(ex * hs, -1 * hs, 2.1 * hs, 2.6 * hs, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1E1E22'; ctx.beginPath(); ctx.arc(ex * hs, -1 * hs, 1.2 * hs, 0, 7); ctx.fill();
      ctx.fillStyle = withAlpha('#fff', 0.85); ctx.beginPath(); ctx.arc(ex * hs - 0.6 * hs, -1.6 * hs, 0.6 * hs, 0, 7); ctx.fill();
    }
  }
  // happy tongue
  if (mood > 0.78) { ctx.fillStyle = '#E98A8A'; roundRect(ctx, 3 * hs, 6.5 * hs, 3 * hs, 3 * hs, 1.5); ctx.fill(); }
  ctx.restore();

  ctx.restore();

  // attention icon (drawn unscaled, upright)
  let icon = null;
  if (d.illness) icon = C.illness(d.illness.key)?.glyph || '🤒';
  else if (d.hunger < 30) icon = '🍖'; else if (sick) icon = '❤️‍🩹'; else if (tired) icon = '💤';
  if (icon && !d.missionId) {
    ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const bob = Math.sin(now / 300) * 2;
    ctx.fillText(icon, d.x, d.y - 30 + bob);
  }
}

function drawMask(d, coat, hs) {
  ctx.fillStyle = coat.belly;
  switch (d.maskId) {
    case 'bandit':
      ctx.fillStyle = coat.saddle; roundRect(ctx, -8 * hs, -3 * hs, 16 * hs, 4 * hs, 2); ctx.fill(); break;
    case 'brows':
      ctx.fillStyle = coat.belly;
      ctx.beginPath(); ctx.ellipse(-3 * hs, -4 * hs, 1.4 * hs, 1 * hs, 0, 0, 7); ctx.ellipse(4 * hs, -4 * hs, 1.4 * hs, 1 * hs, 0, 0, 7); ctx.fill(); break;
    case 'splitface':
      ctx.fillStyle = coat.belly; ctx.beginPath(); ctx.moveTo(0, -9 * hs); ctx.lineTo(0, 9 * hs); ctx.lineTo(11 * hs, 4 * hs); ctx.lineTo(8 * hs, -7 * hs); ctx.closePath(); ctx.fill(); break;
    case 'open':
      ctx.fillStyle = coat.belly; ctx.beginPath(); ctx.ellipse(1 * hs, 3 * hs, 7 * hs, 6 * hs, 0, 0, 7); ctx.fill(); break;
    default: // classic: white blaze up the forehead
      ctx.fillStyle = coat.belly;
      ctx.beginPath(); ctx.moveTo(1 * hs, 5 * hs); ctx.lineTo(-2 * hs, -8 * hs); ctx.lineTo(4 * hs, -8 * hs); ctx.closePath(); ctx.fill();
  }
}

// ---- tourists -----------------------------------------------------------
function drawTourist(t, now) {
  const wad = Math.sin(t.phase) * 0.12;
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(wad);
  ctx.fillStyle = withAlpha('#2A3550', 0.16);
  ctx.beginPath(); ctx.ellipse(0, 6, 6, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = t.color; roundRect(ctx, -5, -7, 10, 14, 5); ctx.fill();
  ctx.fillStyle = t.skin; ctx.beginPath(); ctx.arc(0, -9, 4, 0, 7); ctx.fill();
  if (t.hat) { ctx.fillStyle = withAlpha('#ffffff', 0.85); ctx.beginPath(); ctx.arc(0, -10, 4.2, Math.PI, 0); ctx.fill(); if (t.pom) { ctx.beginPath(); ctx.arc(0, -13.5, 1.6, 0, 7); ctx.fill(); } }
  if (t.phone && Math.abs(t.vx) < 1) { ctx.fillStyle = '#222'; roundRect(ctx, 4, -6, 3, 4, 1); ctx.fill(); if (Math.random() < 0.1) { ctx.fillStyle = withAlpha('#fff', 0.8); ctx.beginPath(); ctx.arc(8, -4, 2, 0, 7); ctx.fill(); } }
  ctx.restore();
  if (t.balloon) { ctx.strokeStyle = withAlpha('#fff', 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(t.x, t.y - 13); ctx.lineTo(t.x + Math.sin(now / 500) * 3, t.y - 24); ctx.stroke(); ctx.fillStyle = t.balloon; ctx.beginPath(); ctx.arc(t.x + Math.sin(now / 500) * 3, t.y - 27, 4, 0, 7); ctx.fill(); }
}

// ---- fx, weather, tint, ghost ------------------------------------------
function drawFx(dt, now) {
  for (let i = S.fx.length - 1; i >= 0; i--) {
    const f = S.fx[i];
    f.t += dt; f.y += f.vy * dt;
    if (f.t >= f.life) { S.fx.splice(i, 1); continue; }
    const a = 1 - f.t / f.life;
    ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.font = 'bold 15px ' + 'system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

function drawSnow(dt, now) {
  ctx.fillStyle = withAlpha('#ffffff', 0.7);
  for (const f of snow) {
    f.y += f.sp * dt; f.x += Math.sin(now / 1000 + f.ph) * f.drift * dt;
    if (f.y > H + 4) { Object.assign(f, newFlake(false)); }
    ctx.globalAlpha = f.near ? 0.7 : 0.4;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function dayNightOverlay() {
  const tod = S.time.tod, dayEnd = C.ECONOMY.dayFraction;
  let color = null, alpha = 0;
  if (tod < 0.06) { color = '#FFC489'; alpha = 0.16 * (1 - tod / 0.06); }
  else if (tod < dayEnd - 0.06) { return; }
  else if (tod < dayEnd) { color = '#FF8A5C'; alpha = 0.2 * ((tod - (dayEnd - 0.06)) / 0.06); }
  else {
    const nf = (tod - dayEnd) / (1 - dayEnd);
    let a = 0.46;
    if (nf < 0.18) a = 0.2 + 0.26 * (nf / 0.18);
    else if (nf > 0.82) a = 0.46 * (1 - (nf - 0.82) / 0.18);
    color = '#243A6E'; alpha = clamp(a, 0, 0.5);
  }
  if (!color || alpha <= 0) return;
  ctx.fillStyle = withAlpha(color, alpha); ctx.fillRect(0, 0, W, H);
}

function drawGhost() {
  const key = S.ui.buildSelection, hov = S.ui.hoverTile;
  if (!key || !hov) return;
  const def = C.BUILDINGS[key]; if (!def) return;
  const t = S.grid.tile;
  // grid overlay
  ctx.strokeStyle = withAlpha('#ffffff', 0.18); ctx.lineWidth = 1;
  for (let gx = 0; gx <= S.grid.cols; gx++) { ctx.beginPath(); ctx.moveTo(gx * t, 0); ctx.lineTo(gx * t, H); ctx.stroke(); }
  for (let gy = 0; gy <= S.grid.rows; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * t); ctx.lineTo(W, gy * t); ctx.stroke(); }
  const ok = !!footprintCells(hov.gx, hov.gy, def.size.w, def.size.h) && S.cash >= def.cost;
  const x = hov.gx * t, y = hov.gy * t, w = def.size.w * t, h = def.size.h * t;
  ctx.fillStyle = ok ? 'rgba(45,182,165,0.30)' : 'rgba(224,84,78,0.32)';
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6); ctx.fill();
  ctx.strokeStyle = ok ? col('teal') : col('danger'); ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6); ctx.stroke();
  ctx.font = `${Math.min(26, w * 0.5)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.85; ctx.fillText(def.glyph || '🏗️', x + w / 2, y + h / 2); ctx.globalAlpha = 1;
  if (!ok) { ctx.fillStyle = col('danger'); ctx.font = 'bold 18px system-ui'; ctx.fillText('✕', x + w / 2, y + h / 2); }
}

// ---- main frame ---------------------------------------------------------
export function render(now) {
  if (!ctx) return;
  const dt = clamp((now - lastNow) / 1000, 0, 0.1); lastNow = now;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(ground, 0, 0);
  drawPaths();

  // y-sorted entity pass
  const items = [];
  for (const b of S.buildings) items.push({ y: (b.gy + b.h) * S.grid.tile, kind: 'b', ref: b });
  for (const d of S.dogs) if (!d.missionId) items.push({ y: d.y, kind: 'd', ref: d });
  for (const t of S.tourists) items.push({ y: t.y, kind: 't', ref: t });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.kind === 'b') drawBuilding(it.ref);
    else if (it.kind === 'd') drawDog(it.ref, now);
    else drawTourist(it.ref, now);
  }

  drawFx(dt, now);
  drawSnow(dt, now);
  dayNightOverlay();
  drawGhost();
}
