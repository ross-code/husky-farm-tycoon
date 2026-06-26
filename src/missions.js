// missions.js — the active money engine: send teams out, resolve success/fail, pay out.
// Imports state/config/util + economy + dogs + buildings.

import { S, toast, pushFx, grantXp, dogById, unlock } from './state.js';
import * as C from './config.js';
import { clamp, uid, randInt, choice, sum, avg } from './util.js';
import { earn } from './economy.js';
import { gatePoint } from './buildings.js';

const MIN_MISSION_ENERGY = 25;

// Rebuild the available list from current unlocks (all unlocked missions are runnable).
export function rollAvailable() {
  S.missions.available = Object.values(C.MISSIONS)
    .filter((m) => S.unlocks.missions.includes(m.key))
    .map((m) => m.key);
  S.missions.lastRollDay = S.time.day;
  S.ui.dirty = true;
}

export const eligibleDogs = () =>
  S.dogs.filter((d) => d.stage === 'adult' && !d.missionId && !d.illness && d.energy >= MIN_MISSION_ENERGY);

// Pick the strongest eligible team for a mission (best success chance).
export function bestTeam(missionKey) {
  const def = C.MISSIONS[missionKey]; if (!def) return [];
  const score = (d) => {
    let s = 0;
    for (const [stat, w] of Object.entries(def.focus)) s += w * d.stats[stat];
    return s * (0.55 + 0.45 * d.energy / 100) * (0.7 + 0.3 * d.happiness / 100);
  };
  return [...eligibleDogs()].sort((a, b) => score(b) - score(a)).slice(0, def.teamSize).map((d) => d.id);
}

// Weighted team power for a mission's focus stats, modulated by energy & happiness.
function teamScore(def, dogs) {
  if (!dogs.length) return 0;
  let power = 0;
  for (const [stat, w] of Object.entries(def.focus)) power += w * avg(dogs, (d) => d.stats[stat]);
  power *= dogs.length; // a bigger team pulls harder
  const energyF = 0.55 + 0.45 * (avg(dogs, (d) => d.energy) / 100);
  const happyF = 0.7 + 0.3 * (avg(dogs, (d) => d.happiness) / 100);
  return power * energyF * happyF;
}

export function successChanceFor(def, dogs) {
  const ratio = teamScore(def, dogs) / def.difficulty;
  return clamp(0.12 + 0.8 * (ratio - 0.55), 0.05, 0.95);
}

export function canStart(missionKey, dogIds) {
  const def = C.MISSIONS[missionKey];
  if (!def) return { ok: false, reason: 'Unknown mission.' };
  if (!S.unlocks.missions.includes(missionKey)) return { ok: false, reason: 'Not unlocked.' };
  const dogs = dogIds.map(dogById).filter(Boolean);
  if (dogs.length !== def.teamSize) return { ok: false, reason: `Needs a team of ${def.teamSize}.`, successChance: 0 };
  for (const d of dogs) {
    if (d.stage !== 'adult') return { ok: false, reason: `${d.name} is too young.`, successChance: 0 };
    if (d.missionId) return { ok: false, reason: `${d.name} is already away.`, successChance: 0 };
    if (d.illness) return { ok: false, reason: `${d.name} is sick and needs the vet.`, successChance: 0 };
    if (d.energy < MIN_MISSION_ENERGY) return { ok: false, reason: `${d.name} is too tired.`, successChance: 0 };
  }
  return { ok: true, successChance: successChanceFor(def, dogs) };
}

export function startMission(missionKey, dogIds) {
  const def = C.MISSIONS[missionKey];
  const check = canStart(missionKey, dogIds);
  if (!check.ok) { toast(check.reason, 'warn'); return null; }
  const inst = {
    id: uid('msn'), key: missionKey, dogIds: [...dogIds],
    startedDay: S.time.day, duration: def.durationSec, elapsed: 0,
    successChance: check.successChance,
  };
  for (const id of dogIds) { const d = dogById(id); if (d) d.missionId = inst.id; }
  S.missions.active.push(inst);
  S.ui.assignTeam = [];
  S.ui.assignMission = null;
  toast(`Team away on ${def.name}. Back in ~${def.durationSec}s.`, 'info');
  S.ui.dirty = true;
  return inst;
}

export function missionStatus(inst) {
  const pct = clamp(inst.elapsed / inst.duration, 0, 1);
  return { pct, remaining: Math.max(0, inst.duration - inst.elapsed) };
}

function freeDogs(inst, energyLeft, healthHit = 0) {
  for (const id of inst.dogIds) {
    const d = dogById(id);
    if (!d) continue;
    d.missionId = null;
    d.energy = clamp(energyLeft + randInt(-4, 4), 2, 100);
    d.hunger = clamp(d.hunger - 22, 0, 100);
    d.happiness = clamp(d.happiness - 8, 0, 100);
    if (healthHit) d.health = clamp(d.health - healthHit, 0, 100);
  }
}

function resolve(inst) {
  const def = C.MISSIONS[inst.key];
  const dogs = inst.dogIds.map(dogById).filter(Boolean);
  const lead = dogs[0];
  const r = Math.random();
  const gate = gatePoint();

  if (r < inst.successChance) {
    earn(def.reward.cash, { x: gate.x, y: gate.y - 12 });
    S.reputation += def.reward.rep;
    grantXp(def.reward.xp);
    S.missions.wonCount++;
    // Each dog firms up its strongest focus stat a touch.
    const focusStat = Object.entries(def.focus).sort((a, b) => b[1] - a[1])[0][0];
    for (const d of dogs) d.stats[focusStat] = clamp(d.stats[focusStat] + 1, 0, d.potential[focusStat] + 2);
    freeDogs(inst, 30);
    const line = choice(C.FLAVOR.win).replace('{mission}', def.name).replace('{dog}', lead?.name || 'The lead dog');
    if (def.awardsElvis) { unlock('breeds', 'elvis'); S.stats.serumWon = true; toast(C.FLAVOR.serumWin[0], 'good', 8); }
    else toast(line, 'good');
    pushFx(gate.x, gate.y - 28, '🏆', C.PALETTE.gold, 1.8);
  } else if (r < inst.successChance + 0.25) {
    const cash = Math.round(def.reward.cash * 0.35);
    earn(cash, { x: gate.x, y: gate.y - 12 });
    S.reputation += Math.round(def.reward.rep * 0.4);
    freeDogs(inst, 16);
    toast(`Partial run on ${def.name}: +$${cash}. The team is worn out.`, 'warn');
  } else {
    const cash = Math.round(def.reward.cash * 0.2);
    earn(cash, { x: gate.x, y: gate.y - 12 });
    S.missions.lostCount++;
    freeDogs(inst, 6, 18);
    toast(choice(C.FLAVOR.lose).replace('{dog}', lead?.name || 'The lead dog'), 'bad');
  }
  S.ui.dirty = true;
}

export function tickMissions(dt) {
  if (!S.missions.active.length) return;
  const done = [];
  for (const inst of S.missions.active) {
    inst.elapsed += dt;
    if (inst.elapsed >= inst.duration) done.push(inst);
  }
  for (const inst of done) {
    resolve(inst);
    const i = S.missions.active.indexOf(inst);
    if (i >= 0) S.missions.active.splice(i, 1);
  }
}
