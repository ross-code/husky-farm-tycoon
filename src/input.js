// input.js — pointer + keyboard. Writes S.ui (selection, hover, build choice),
// drives placement, and pans/zooms the camera. Imports state/config/util + buildings + render.

import { S, clearBuildSelection, setPanel, select, toast } from './state.js';
import * as C from './config.js';
import { clamp, dist } from './util.js';
import { placeBuilding, buildingAt } from './buildings.js';
import { screenToWorld } from './render.js';

let mouseDown = false, panning = false, panAnchor = null, moved = 0, downAt = null;
const PANEL_KEYS = { '1': 'build', '2': 'dogs', '3': 'market', '4': 'missions', b: 'build', d: 'dogs', m: 'market', r: 'missions' };

function tileFor(worldX, worldY) {
  const { cols, rows, tile } = S.grid;
  const key = S.ui.buildSelection;
  const def = key ? C.BUILDINGS[key] : null;
  if (def) {
    return {
      gx: clamp(Math.round(worldX / tile - def.size.w / 2), 0, cols - def.size.w),
      gy: clamp(Math.round(worldY / tile - def.size.h / 2), 0, rows - def.size.h),
    };
  }
  return { gx: clamp(Math.floor(worldX / tile), 0, cols - 1), gy: clamp(Math.floor(worldY / tile), 0, rows - 1) };
}

function dogAt(x, y) {
  let best = null, bestD = 22;
  for (const d of S.dogs) {
    if (d.missionId) continue;
    const dd = dist(x, y, d.x, d.y - 8);
    if (dd < bestD) { bestD = dd; best = d; }
  }
  return best;
}

function place() {
  const hov = S.ui.hoverTile;
  if (!hov) return;
  const b = placeBuilding(S.ui.buildSelection, hov.gx, hov.gy);
  if (b) { const def = C.BUILDINGS[S.ui.buildSelection]; if (def.category === 'house' || S.cash < def.cost) clearBuildSelection(); }
}

export function zoomBy(factor, cx, cy) {
  const before = screenToWorld(cx, cy);
  S.cam.zoom = clamp(S.cam.zoom * factor, 0.1, 3);
  const after = screenToWorld(cx, cy);
  S.cam.x += before.x - after.x; S.cam.y += before.y - after.y;
}

export function initInput(canvas) {
  const center = () => { const r = canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  canvas.addEventListener('pointermove', (e) => {
    const w = screenToWorld(e.clientX, e.clientY);
    if (panning && panAnchor) {
      S.cam.x += panAnchor.x - w.x; S.cam.y += panAnchor.y - w.y; // grab-pan: keep anchor under cursor
      return;
    }
    if (S.ui.buildSelection) {
      S.ui.hoverTile = tileFor(w.x, w.y);
      const def = C.BUILDINGS[S.ui.buildSelection];
      if (mouseDown && def && def.size.w === 1 && def.size.h === 1) place();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    mouseDown = true; moved = 0; downAt = { x: e.clientX, y: e.clientY };
    const w = screenToWorld(e.clientX, e.clientY);
    if (S.ui.buildSelection) { S.ui.hoverTile = tileFor(w.x, w.y); place(); return; }
    const dog = dogAt(w.x, w.y);
    if (dog) { select('dog', dog.id); setPanel('dogs'); return; }
    const b = buildingAt(w.x, w.y);
    if (b) { select('building', b.id); return; }
    // empty ground: begin a grab-pan (becomes a deselect if it was just a click)
    panning = true; panAnchor = w;
  });

  window.addEventListener('pointerup', (e) => {
    if (panning && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) select(null);
    mouseDown = false; panning = false; panAnchor = null;
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (S.ui.buildSelection) clearBuildSelection(); else select(null);
  });

  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const pan = 60 / S.cam.zoom;
    if (k === 'escape') { if (S.ui.buildSelection) clearBuildSelection(); else select(null); return; }
    if (k === ' ') { e.preventDefault(); S.paused = !S.paused; S.ui.dirty = true; toast(S.paused ? 'Paused' : 'Resumed', 'info', 1.2); return; }
    if (k === '+' || k === '=') { S.speed = Math.min(4, (S.speed || 1) + 1); S.ui.dirty = true; return; }
    if (k === '-' || k === '_') { S.speed = Math.max(1, (S.speed || 1) - 1); S.ui.dirty = true; return; }
    if (k === 'arrowleft') S.cam.x -= pan;
    else if (k === 'arrowright') S.cam.x += pan;
    else if (k === 'arrowup') S.cam.y -= pan;
    else if (k === 'arrowdown') S.cam.y += pan;
    else if (k === 'z') { const c = center(); zoomBy(1.15, c.x, c.y); }
    else if (k === 'x') { const c = center(); zoomBy(0.87, c.x, c.y); }
    else if (PANEL_KEYS[k]) setPanel(PANEL_KEYS[k]);
  });
}
