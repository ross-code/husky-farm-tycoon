// input.js — pointer + keyboard. Writes S.ui (selection, hover, build choice) and
// triggers placement. Imports state/config/util + buildings + render geometry.

import { S, clearBuildSelection, setPanel, select, toast } from './state.js';
// (setPanel is used to jump to the Dogs panel when a dog is clicked)
import * as C from './config.js';
import { clamp, dist } from './util.js';
import { placeBuilding, buildingAt } from './buildings.js';
import { screenToWorld } from './render.js';

let mouseDown = false;
const PANEL_KEYS = { '1': 'build', '2': 'dogs', '3': 'market', '4': 'missions', b: 'build', d: 'dogs', m: 'market', r: 'missions' };

function tileFor(worldX, worldY) {
  const { cols, rows, tile } = S.grid;
  const key = S.ui.buildSelection;
  const def = key ? C.BUILDINGS[key] : null;
  if (def) {
    const gx = clamp(Math.round(worldX / tile - def.size.w / 2), 0, cols - def.size.w);
    const gy = clamp(Math.round(worldY / tile - def.size.h / 2), 0, rows - def.size.h);
    return { gx, gy };
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
  // After placing, exit placement if it would be the (single) house or we can't afford another.
  if (b) {
    const def = C.BUILDINGS[S.ui.buildSelection];
    if (def.category === 'house' || S.cash < def.cost) clearBuildSelection();
  }
}

export function initInput(canvas) {
  canvas.addEventListener('pointermove', (e) => {
    const w = screenToWorld(e.clientX, e.clientY);
    if (S.ui.buildSelection) {
      S.ui.hoverTile = tileFor(w.x, w.y);
      const def = C.BUILDINGS[S.ui.buildSelection];
      // drag-paint 1x1 decor/paths
      if (mouseDown && def && def.size.w === 1 && def.size.h === 1) place();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    const w = screenToWorld(e.clientX, e.clientY);
    if (S.ui.buildSelection) { S.ui.hoverTile = tileFor(w.x, w.y); place(); return; }
    // selection
    const dog = dogAt(w.x, w.y);
    if (dog) { select('dog', dog.id); setPanel('dogs'); return; }
    const b = buildingAt(w.x, w.y);
    if (b) { select('building', b.id); return; }
    select(null);
  });

  window.addEventListener('pointerup', () => { mouseDown = false; });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (S.ui.buildSelection) clearBuildSelection();
    else select(null);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (S.ui.buildSelection) clearBuildSelection(); else select(null); return; }
    if (k === ' ') { e.preventDefault(); S.paused = !S.paused; S.ui.dirty = true; toast(S.paused ? 'Paused' : 'Resumed', 'info', 1.2); return; }
    if (k === '+' || k === '=') { S.speed = Math.min(3, (S.speed || 1) + 1); S.ui.dirty = true; return; }
    if (k === '-' || k === '_') { S.speed = Math.max(1, (S.speed || 1) - 1); S.ui.dirty = true; return; }
    if (PANEL_KEYS[k]) { setPanel(PANEL_KEYS[k]); }
  });
}
