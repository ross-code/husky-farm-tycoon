// buildings.js — grid placement, removal, and spatial helpers.
// Imports state/config/util + economy. Never imports ui/render/input.

import { S, cellAt, inBounds, inLand, toast, pushFx, isUnlocked } from './state.js';
import * as C from './config.js';
import { uid, rand } from './util.js';
import { spend, earn, canAfford } from './economy.js';

const T = () => S.grid.tile;

export const hasHouse = () => S.buildings.some((b) => C.BUILDINGS[b.key]?.category === 'house');

// Return the cells a footprint would cover, or null if any is out-of-bounds or occupied.
export function footprintCells(gx, gy, w, h) {
  const cells = [];
  for (let y = gy; y < gy + h; y++) {
    for (let x = gx; x < gx + w; x++) {
      if (!inBounds(x, y)) return null;
      const c = cellAt(x, y);
      if (!c || c.occupant) return null;
      cells.push(c);
    }
  }
  return cells;
}

export function canPlace(key, gx, gy) {
  const def = C.BUILDINGS[key];
  if (!def) return { ok: false, reason: 'Unknown building.' };
  if (!isUnlocked('buildings', key)) return { ok: false, reason: 'Not unlocked yet.' };
  if (def.category !== 'house' && !hasHouse()) return { ok: false, reason: "Build the Keeper's Cabin first." };
  if (key === 'keepers_cabin' && S.buildings.some((b) => b.key === 'keepers_cabin')) return { ok: false, reason: 'You already have a cabin.' };
  if (!footprintCells(gx, gy, def.size.w, def.size.h)) return { ok: false, reason: 'Blocked or out of bounds.' };
  for (let y = gy; y < gy + def.size.h; y++) for (let x = gx; x < gx + def.size.w; x++) if (!inLand(x, y)) return { ok: false, reason: 'That land is not yours yet. Buy property to expand.' };
  if (!canAfford(def.cost)) return { ok: false, reason: `Need $${def.cost}.` };
  return { ok: true };
}

// ---- property (land expansion) -----------------------------------------
export const nextProperty = () => C.PROPERTY[S.landLevel + 1] || null;

export function buyProperty() {
  const tier = nextProperty();
  if (!tier) { toast('You already own all the land.', 'info'); return false; }
  if (!spend(tier.cost)) { toast(`Buying that land costs $${tier.cost}.`, 'warn'); return false; }
  S.landLevel += 1;
  S.land = { cols: tier.cols, rows: tier.rows };
  toast(`Property expanded to ${tier.cols} × ${tier.rows}. Room to grow!`, 'good', 4);
  S.ui.dirty = true;
  return true;
}

export function placeBuilding(key, gx, gy) {
  const def = C.BUILDINGS[key];
  const check = canPlace(key, gx, gy);
  if (!check.ok) { toast(check.reason, 'warn'); return null; }
  if (!spend(def.cost)) { toast(`Need $${def.cost}.`, 'warn'); return null; }

  const building = { id: uid('bld'), key, gx, gy, w: def.size.w, h: def.size.h, builtDay: S.time.day };
  const cells = footprintCells(gx, gy, def.size.w, def.size.h);
  for (const c of cells) { c.occupant = building.id; if (def.category === 'decor' && key === 'path_tile') c.terrain = 'path'; }
  S.buildings.push(building);

  const c = centerOf(building);
  pushFx(c.x, c.y - 8, def.glyph || '✓', C.PALETTE.brand, 1.2);
  const isHouse = def.category === 'house';
  toast(`${def.name} built${isHouse ? '. Welcome home, Keeper!' : ` (-$${def.cost})`}`, isHouse ? 'good' : 'info');
  S.ui.dirty = true;
  return building;
}

export function removeBuilding(id) {
  const i = S.buildings.findIndex((b) => b.id === id);
  if (i < 0) return;
  const b = S.buildings[i];
  const def = C.BUILDINGS[b.key];
  // Free the cells.
  for (let y = b.gy; y < b.gy + b.h; y++) {
    for (let x = b.gx; x < b.gx + b.w; x++) {
      const c = cellAt(x, y);
      if (c && c.occupant === id) { c.occupant = null; if (c.terrain === 'path') c.terrain = 'snow'; }
    }
  }
  S.buildings.splice(i, 1);
  if (S.ui.selected?.type === 'building' && S.ui.selected.id === id) S.ui.selected = null;
  const refund = Math.round((def?.cost || 0) * C.ECONOMY.sellRefundFrac);
  earn(refund);
  toast(`${def?.name || 'Building'} removed (+$${refund} refund).`, 'info');
  S.ui.dirty = true;
}

// ---- spatial helpers ----------------------------------------------------
export function centerOf(b) { return { x: (b.gx + b.w / 2) * T(), y: (b.gy + b.h / 2) * T() }; }
export function doorOf(b) { return { x: (b.gx + b.w / 2) * T(), y: (b.gy + b.h) * T() - 4 }; }

export const touristAttractions = () => S.buildings.filter((b) => C.BUILDINGS[b.key]?.category === 'tourist');
export const housesBuilt = () => S.buildings.filter((b) => C.BUILDINGS[b.key]?.category === 'house');

// Where tourists enter the farm: just below the house door, else bottom-centre.
export function gatePoint() {
  const house = housesBuilt()[0];
  if (house) { const d = doorOf(house); return { x: d.x, y: Math.min(d.y + T(), S.land.rows * T() - 6) }; }
  return { x: (S.land.cols / 2) * T(), y: S.land.rows * T() - 6 };
}

// Hit-test a world point against placed buildings; returns the building or null.
export function buildingAt(x, y) {
  const t = T();
  for (let i = S.buildings.length - 1; i >= 0; i--) {
    const b = S.buildings[i];
    if (x >= b.gx * t && x < (b.gx + b.w) * t && y >= b.gy * t && y < (b.gy + b.h) * t) return b;
  }
  return null;
}
