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
function drawBuilding(b) {
  const def = C.BUILDINGS[b.key]; if (!def) return;
  const t = S.grid.tile;
  const x = b.gx * t, y = b.gy * t, w = b.w * t, h = b.h * t;

  if (def.category === 'decor' && (b.key === 'path_tile')) {
    // path tiles drawn separately in drawPaths
    return;
  }

  // apron (dug-out ring grounds the building)
  ctx.fillStyle = withAlpha(col('snowShadeDeep'), 0.5);
  roundRect(ctx, x + 3, y + h * 0.34, w - 6, h * 0.66 + 4, 8); ctx.fill();

  if (def.category === 'decor') return drawDecor(b, def, x, y, w, h);

  // contact shadow
  ctx.fillStyle = withAlpha('#2A3550', 0.18);
  roundRect(ctx, x + 6, y + h - 8, w - 8, 10, 6); ctx.fill();

  // walls
  const wallTop = y + h * 0.42;
  const wallH = h * 0.58 - 6;
  ctx.fillStyle = col('wood');
  roundRect(ctx, x + 5, wallTop, w - 10, wallH, 6); ctx.fill();
  ctx.fillStyle = withAlpha(col('woodHi'), 0.5);
  roundRect(ctx, x + 5, wallTop, w - 10, wallH * 0.4, 6); ctx.fill();
  // log seams
  ctx.strokeStyle = withAlpha(col('woodDk'), 0.4); ctx.lineWidth = 1;
  for (let ly = wallTop + 8; ly < wallTop + wallH - 4; ly += 8) { ctx.beginPath(); ctx.moveTo(x + 7, ly); ctx.lineTo(x + w - 7, ly); ctx.stroke(); }

  // roof (gable)
  const roofC = col(def.roof || 'roofBlue');
  ctx.fillStyle = roofC;
  ctx.beginPath();
  ctx.moveTo(x + 1, wallTop + 4);
  ctx.lineTo(x + w / 2, y + h * 0.06);
  ctx.lineTo(x + w - 1, wallTop + 4);
  ctx.closePath(); ctx.fill();
  // roof sun edge + snow cap
  ctx.fillStyle = withAlpha('#ffffff', 0.18);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + h * 0.06); ctx.lineTo(x + w - 1, wallTop + 4); ctx.lineTo(x + w * 0.7, wallTop + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col('roofSnow');
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + h * 0.06); ctx.lineTo(x + w / 2 + 7, y + h * 0.10); ctx.lineTo(x + w / 2 - 7, y + h * 0.10); ctx.closePath(); ctx.fill();

  // door
  const dw = Math.min(14, w * 0.22);
  ctx.fillStyle = col('woodDk');
  roundRect(ctx, x + w / 2 - dw / 2, wallTop + wallH - 18, dw, 18, 3); ctx.fill();
  // window glow (warm at night)
  const lit = S.time.tod >= C.ECONOMY.dayFraction;
  ctx.fillStyle = lit ? withAlpha(col('gold'), 0.9) : '#BFE0F0';
  roundRect(ctx, x + 9, wallTop + 8, 8, 8, 2); ctx.fill();
  if (w > 70) { roundRect(ctx, x + w - 17, wallTop + 8, 8, 8, 2); ctx.fill(); }

  // category sign glyph
  if (def.glyph) {
    ctx.font = `${Math.min(22, w * 0.32)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, x + w / 2, y + h * 0.30);
  }
  // chimney smoke for houses
  if (def.category === 'house' && Math.random() < 0.4) { /* light puffs handled by fx ambience */ }
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
  if (d.hunger < 30) icon = '🍖'; else if (sick) icon = '❤️‍🩹'; else if (tired) icon = '💤';
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
