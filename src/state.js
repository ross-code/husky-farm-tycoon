// state.js — the single source of truth. Owns the canonical state shape, new-game setup,
// localStorage persistence, and small UI/FX queue helpers. Imports ONLY config + util
// (never economy/dogs/buildings/missions) to keep the dependency graph acyclic.

import * as C from './config.js';
import { uid, rand, clamp } from './util.js';

export const SAVE_KEY = 'huskyFarmTycoon.save.v1';
export const STATE_VERSION = 1;

// The live game state. Every module imports this object and mutates it in place.
export const S = freshState();

function freshState() {
  return {
    version: STATE_VERSION,
    started: false,          // has the player begun (passed the start screen)?
    paused: false,
    speed: 1,                // 1 | 2 | 3 game-speed multiplier
    over: false,
    won: false,              // has the player hit a win condition (sandbox continues after)
    elvisAcquired: false,    // the one and only Elvis can be obtained once, ever

    time: { day: 1, tod: 0.28, elapsed: 0 }, // tod = fraction of day [0,1); start mid-morning

    cam: { x: 0, y: 0, zoom: 1 },        // world-space camera (set in newGame)
    land: { cols: 0, rows: 0 },          // buildable area (grows by buying property)
    landLevel: 0,                        // index into config.PROPERTY
    loan: { owed: 0, missedDays: 0 },    // bank debt + how long it has been unservable
    coachStep: -1,                       // current onboarding objective index (-1 = none yet)
    lastAutoBreedDay: 0,                 // throttles auto-breeding from dens

    cash: 0,
    reputation: 0,           // 0..100 appeal/reputation that drives tourist traffic
    appeal: 0,               // derived each tick from buildings + dogs (cache for UI/render)
    xp: 0,
    level: 1,
    food: 0,                 // food stock (units). Dogs eat from this daily.

    grid: null,              // { cols, rows, tile, cells:[{gx,gy,occupant,terrain,tone}] }

    buildings: [],           // [{ id, key, gx, gy, w, h, builtDay }]
    dogs: [],                // see dogs.js createDog() for shape
    tourists: [],            // visual-only entities (entities.js)

    missions: { available: [], active: [], wonCount: 0, lostCount: 0, lastRollDay: 0 },

    unlocks: { buildings: [], breeds: [], missions: [] }, // unlocked def keys
    milestones: { done: [] },

    ui: {
      panel: 'build',        // 'build' | 'dogs' | 'market' | 'missions' | null
      buildSelection: null,  // building key chosen in the build palette (placement mode)
      selected: null,        // { type:'dog'|'building', id } clicked on the canvas
      hoverTile: null,       // { gx, gy } under the cursor while placing
      assignTeam: [],        // dog ids selected for the mission being assigned
      assignMission: null,   // mission instance id being staffed
      toasts: [],            // [{ id, msg, kind, t, life }]
      dirty: true,           // request a UI refresh
    },

    fx: [],                  // floating texts: [{ x, y, vy, text, color, t, life }]
    stats: { totalEarned: 0, totalSpent: 0, dogsBred: 0, dogsBought: 0, missionsWon: 0, touristIncome: 0 },
  };
}

// Build the snowy grid with subtle per-tile tone variation for the renderer.
function buildGrid() {
  const { cols, rows, tile } = C.GRID;
  const cells = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      cells.push({ gx, gy, occupant: null, terrain: 'snow', tone: rand(0, 1) });
    }
  }
  return { cols, rows, tile, cells };
}

// Start a brand-new farm. Mutates S in place so existing imported references stay valid.
export function newGame() {
  const fresh = freshState();
  Object.assign(S, fresh);
  S.grid = buildGrid();
  S.landLevel = 0;
  S.land = { cols: C.PROPERTY[0].cols, rows: C.PROPERTY[0].rows };
  fitCamToLand();
  S.cash = C.ECONOMY.startingCash;
  S.reputation = C.ECONOMY.startingReputation ?? 5;
  S.food = C.ECONOMY.startingFood ?? 0;
  // Seed unlocks from defs flagged `unlocked: true`.
  S.unlocks.buildings = Object.values(C.BUILDINGS).filter((b) => b.unlocked).map((b) => b.key);
  S.unlocks.breeds = Object.values(C.BREEDS).filter((b) => b.unlocked).map((b) => b.key);
  S.unlocks.missions = Object.values(C.MISSIONS).filter((m) => m.unlocked).map((m) => m.key);
  S.started = true;
  S.ui.dirty = true;
  return S;
}

// ---- grid helpers -------------------------------------------------------
export const idx = (gx, gy) => gy * S.grid.cols + gx;
export const inBounds = (gx, gy) => gx >= 0 && gy >= 0 && gx < S.grid.cols && gy < S.grid.rows;
export const cellAt = (gx, gy) => (inBounds(gx, gy) ? S.grid.cells[idx(gx, gy)] : null);
// Only the owned land (which grows as you buy property) is buildable.
export const inLand = (gx, gy) => gx >= 0 && gy >= 0 && gx < S.land.cols && gy < S.land.rows;

// Center the camera on the owned land so it fits the viewport.
export function fitCamToLand() {
  const t = C.GRID.tile;
  const lw = S.land.cols * t, lh = S.land.rows * t;
  const z = Math.min(C.VIEW.w / lw, C.VIEW.h / lh);
  S.cam.zoom = clamp(z, 0.3, 2.2);
  S.cam.x = (lw - C.VIEW.w / S.cam.zoom) / 2;
  S.cam.y = (lh - C.VIEW.h / S.cam.zoom) / 2;
}

// ---- lookups by id ------------------------------------------------------
export const dogById = (id) => S.dogs.find((d) => d.id === id) || null;
export const buildingById = (id) => S.buildings.find((b) => b.id === id) || null;
export const activeMissionById = (id) => S.missions.active.find((m) => m.id === id) || null;

export const buildingsByCategory = (cat) => S.buildings.filter((b) => C.BUILDINGS[b.key]?.category === cat);
export const hasBuilding = (key) => S.buildings.some((b) => b.key === key);

// ---- unlock helpers -----------------------------------------------------
export const isUnlocked = (kind, key) => S.unlocks[kind]?.includes(key);
export function unlock(kind, key) {
  if (!S.unlocks[kind].includes(key)) { S.unlocks[kind].push(key); S.ui.dirty = true; }
}

// ---- UI state mutators (input + ui both go through these) ---------------
export function setPanel(name) { S.ui.panel = name; S.ui.buildSelection = null; S.ui.dirty = true; }
export function setBuildSelection(key) { S.ui.buildSelection = key; S.ui.panel = 'build'; S.ui.dirty = true; }
export function clearBuildSelection() { S.ui.buildSelection = null; S.ui.hoverTile = null; S.ui.dirty = true; }
export function select(type, id) { S.ui.selected = type ? { type, id } : null; S.ui.dirty = true; }

// ---- toasts + floating fx ----------------------------------------------
export function toast(msg, kind = 'info', life = 4) {
  S.ui.toasts.push({ id: uid('toast'), msg, kind, t: 0, life });
  if (S.ui.toasts.length > 6) S.ui.toasts.shift();
  S.ui.dirty = true;
}
export function pushFx(x, y, text, color = '#ffffff', life = 1.1) {
  S.fx.push({ x, y, vy: -26, text, color, t: 0, life });
  if (S.fx.length > 60) S.fx.shift();
}

// ---- persistence --------------------------------------------------------
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }

export function saveGame() {
  try {
    // Strip transient UI/FX so saves stay small and reload clean.
    const snapshot = { ...S, ui: undefined, fx: [] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) { console.warn('save failed', e); return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== STATE_VERSION) return false;
    const uiBackup = freshState().ui;
    Object.assign(S, data);
    S.ui = uiBackup;      // always start with a clean UI shell
    S.fx = [];
    S.paused = false;
    // ---- migrate older saves to the current (bigger) world + new fields ----
    if (!S.grid || S.grid.cols !== C.GRID.cols || S.grid.rows !== C.GRID.rows) {
      S.grid = buildGrid();
      for (const b of (S.buildings || [])) {
        for (let y = b.gy; y < b.gy + b.h; y++) for (let x = b.gx; x < b.gx + b.w; x++) { const c = cellAt(x, y); if (c) { c.occupant = b.id; if (b.key === 'path_tile') c.terrain = 'path'; } }
      }
    }
    if (!S.land || !S.land.cols) { S.landLevel = S.landLevel || 0; S.land = { cols: C.PROPERTY[S.landLevel].cols, rows: C.PROPERTY[S.landLevel].rows }; }
    if (!S.cam) S.cam = { x: 0, y: 0, zoom: 1 };
    if (!S.loan) S.loan = { owed: 0, missedDays: 0 };
    if (S.coachStep === undefined) S.coachStep = -1;
    if (S.won === undefined) S.won = false;
    if (S.lastAutoBreedDay === undefined) S.lastAutoBreedDay = 0;
    fitCamToLand();
    S.ui.dirty = true;
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}

export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

// Convenience: leveling curve (XP needed to reach a given level).
export const xpForLevel = (lvl) => Math.round(80 * lvl ** 1.45);
export function grantXp(amount) {
  S.xp += amount;
  while (S.xp >= xpForLevel(S.level + 1)) { S.xp -= xpForLevel(S.level + 1); S.level += 1; toast(`Level up! You are now level ${S.level}`, 'good'); }
}
