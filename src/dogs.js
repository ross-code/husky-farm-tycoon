// dogs.js — the dog model: creation, lifecycle/vitals, training, breeding, buy/sell.
// Imports state/config/util + economy (for money ops). Never imports missions/ui/render.

import { S, toast, pushFx, dogById } from './state.js';
import * as C from './config.js';
import { clamp, rand, randInt, choice, chance, uid, approach, sum, avg } from './util.js';
import { spend, earn, dogMarketValue, sellPrice } from './economy.js';

const E = C.ECONOMY;
const STATS = ['speed', 'stamina', 'strength', 'temperament'];

// A sensible spawn point: near the Keeper's Cabin if built, else farm centre.
function homeAnchor() {
  const house = S.buildings.find((b) => C.BUILDINGS[b.key]?.category === 'house');
  const { cols, rows, tile } = S.grid;
  if (house) {
    const def = C.BUILDINGS[house.key];
    return { x: (house.gx + def.size.w / 2) * tile + rand(-30, 30), y: (house.gy + def.size.h + 0.4) * tile + rand(-10, 20) };
  }
  return { x: (cols / 2) * tile + rand(-40, 40), y: (rows / 2) * tile + rand(-30, 30) };
}

function pickName() {
  const used = new Set(S.dogs.map((d) => d.name));
  const free = C.DOG_NAMES.filter((n) => !used.has(n));
  return free.length ? choice(free) : choice(C.DOG_NAMES) + ' ' + randInt(2, 9);
}

export function dogCapacity() { return sum(S.buildings, (b) => C.BUILDINGS[b.key]?.capacity || 0); }
export function housedCount() { return S.dogs.length; }
export const hasRoom = () => housedCount() < dogCapacity();

// Create a dog of a breed. Adults sit just below potential; puppies start low and grow.
export function createDog(breedKey, opts = {}) {
  const breed = C.BREEDS[breedKey] || C.BREEDS.alaskan_husky;
  const stage = opts.stage || 'adult';
  const coat = C.COATS[breed.coat] || C.COATS.gray;
  const potential = {}, stats = {};
  for (const s of STATS) {
    potential[s] = Math.round(clamp((opts.potential?.[s] ?? breed.baseStats[s]) + rand(-7, 7), 18, 100));
    stats[s] = stage === 'puppy'
      ? Math.round(clamp(potential[s] * rand(0.38, 0.55), 8, 100))
      : Math.round(clamp(potential[s] - rand(2, 14), 10, 100));
  }
  let eye = coat.eye;
  if (eye === 'hetero') eye = 'hetero';
  else if (!C.EYE_COLORS[eye]) eye = 'brown';
  const anchor = homeAnchor();
  return {
    id: uid('dog'),
    name: opts.name || pickName(),
    breedKey: breed.key,
    sex: opts.sex || (chance(0.5) ? 'M' : 'F'),
    ageDays: stage === 'puppy' ? rand(0, 1) : rand(8, 20),
    stage,
    stats, potential,
    hunger: 82, happiness: 78, health: 100, energy: 92,
    missionId: null, breedCooldownDay: 0,
    bornDay: S.time.day,
    coatId: breed.coat, maskId: opts.maskId || choice(C.MASKS), eyeColor: eye,
    // visual fields used by entities/render
    x: anchor.x, y: anchor.y, vx: 0, vy: 0, facing: 1, animPhase: rand(0, 6.28), wanderTarget: null, restUntil: 0,
  };
}

// Buy a dog from the market (puppy by default; adult costs ~1.7x).
export function buyDog(breedKey, asAdult = false) {
  const breed = C.BREEDS[breedKey];
  if (!breed) return null;
  if (!S.unlocks.breeds.includes(breedKey)) { toast(`${breed.name} is not available yet.`, 'warn'); return null; }
  if (!hasRoom()) { toast('No free kennel. Build more housing first.', 'warn'); return null; }
  const price = Math.round(breed.price * (asAdult ? 1.7 : 1));
  if (!spend(price)) { toast(`You need $${price} for a ${breed.name}.`, 'warn'); return null; }
  const dog = createDog(breedKey, { stage: asAdult ? 'adult' : 'puppy' });
  S.dogs.push(dog);
  S.stats.dogsBought++;
  pushFx(dog.x, dog.y - 16, '🐾', C.PALETTE.brand, 1.1);
  toast(C.FLAVOR.adopt[randInt(0, C.FLAVOR.adopt.length - 1)].replace('{name}', dog.name), 'good');
  S.ui.dirty = true;
  return dog;
}

export function feedDog(dog) {
  if (!dog) return;
  if (S.food < 2 && !spend(3)) { toast('No food and no cash to feed.', 'warn'); return; }
  if (S.food >= 2) S.food -= 2;
  dog.hunger = clamp(dog.hunger + 32, 0, 100);
  dog.happiness = clamp(dog.happiness + E.happyPerFeed, 0, 100);
  pushFx(dog.x, dog.y - 16, '❤', C.PALETTE.teal, 0.9);
  S.ui.dirty = true;
}

export function playWithDog(dog) {
  if (!dog) return;
  dog.happiness = clamp(dog.happiness + 12, 0, 100);
  dog.energy = clamp(dog.energy - 4, 0, 100);
  pushFx(dog.x, dog.y - 16, '❤', '#FF8FA3', 0.9);
  S.ui.dirty = true;
}

export const canTrain = () => S.buildings.some((b) => C.BUILDINGS[b.key]?.enables === 'train');

export function trainDog(dog, stat) {
  if (!dog || !STATS.includes(stat)) return false;
  if (!canTrain()) { toast('Build a Practice Yard to train dogs.', 'warn'); return false; }
  if (dog.stage !== 'adult') { toast('Puppies are too young to train hard.', 'warn'); return false; }
  if (dog.energy < E.trainEnergyCost) { toast(`${dog.name} is too tired to train.`, 'warn'); return false; }
  if (dog.stats[stat] >= dog.potential[stat]) { toast(`${dog.name} has maxed ${stat}.`, 'info'); return false; }
  if (!spend(E.trainCostBase)) { toast(`Training costs $${E.trainCostBase}.`, 'warn'); return false; }
  const room = 1 - dog.stats[stat] / dog.potential[stat];
  const happyMult = 0.5 + dog.happiness / 100;
  const gain = Math.max(1, Math.round(E.trainGainBase * room * happyMult));
  dog.stats[stat] = clamp(dog.stats[stat] + gain, 0, dog.potential[stat]);
  dog.energy = clamp(dog.energy - E.trainEnergyCost, 0, 100);
  pushFx(dog.x, dog.y - 16, `+${gain} ${stat.slice(0, 3).toUpperCase()}`, C.PALETTE.brand, 1.1);
  S.ui.dirty = true;
  return true;
}

export const canBreedHere = () => S.buildings.some((b) => C.BUILDINGS[b.key]?.enables === 'breed');

export function canBreed(a, b) {
  if (!a || !b || a.id === b.id) return { ok: false, reason: 'Pick two different dogs.' };
  if (!canBreedHere()) return { ok: false, reason: 'Build a Whelping Den first.' };
  if (a.stage !== 'adult' || b.stage !== 'adult') return { ok: false, reason: 'Both dogs must be adults.' };
  if (a.sex === b.sex) return { ok: false, reason: 'Need one male and one female.' };
  if (S.time.day < a.breedCooldownDay || S.time.day < b.breedCooldownDay) return { ok: false, reason: 'A parent is still on breeding cooldown.' };
  if (a.missionId || b.missionId) return { ok: false, reason: 'A parent is away on a mission.' };
  if (!hasRoom()) return { ok: false, reason: 'No free kennel for a puppy.' };
  return { ok: true };
}

export function breedDogs(a, b) {
  const check = canBreed(a, b);
  if (!check.ok) { toast(check.reason, 'warn'); return null; }
  const potential = {};
  const crossbreed = a.breedKey !== b.breedKey;
  for (const s of STATS) {
    const base = (a.potential[s] + b.potential[s]) / 2;
    const variation = rand(-8, 8) + (crossbreed ? 3 : 0);
    potential[s] = Math.round(clamp(base + variation, 18, 100));
  }
  if (chance(0.02)) { const s = choice(STATS); potential[s] = clamp(potential[s] + 12, 0, 100); } // prodigy
  const childBreed = chance(0.5) ? a.breedKey : b.breedKey;
  const pup = createDog(childBreed, { stage: 'puppy', potential });
  pup.x = a.x + rand(-12, 12); pup.y = a.y + rand(6, 18);
  S.dogs.push(pup);
  S.stats.dogsBred++;
  a.breedCooldownDay = b.breedCooldownDay = S.time.day + E.breedCooldownDays;
  a.energy = clamp(a.energy - 15, 0, 100); b.energy = clamp(b.energy - 15, 0, 100);
  pushFx(pup.x, pup.y - 18, '🐾 New Puppy!', C.PALETTE.teal, 1.6);
  toast(C.FLAVOR.breed[randInt(0, C.FLAVOR.breed.length - 1)].replace('{a}', a.name).replace('{b}', b.name).replace('{pup}', pup.name), 'good');
  S.ui.dirty = true;
  return pup;
}

export function sellDog(dog) {
  if (!dog) return;
  if (dog.missionId) { toast(`${dog.name} is away on a mission.`, 'warn'); return; }
  const price = sellPrice(dog);
  const i = S.dogs.findIndex((d) => d.id === dog.id);
  if (i < 0) return;
  S.dogs.splice(i, 1);
  if (S.ui.selected?.id === dog.id) S.ui.selected = null;
  S.ui.assignTeam = S.ui.assignTeam.filter((id) => id !== dog.id);
  if (S.ui.breedPick) S.ui.breedPick = S.ui.breedPick.filter((id) => id !== dog.id);
  earn(price);
  toast(`Sold ${dog.name} for $${price}.`, 'info');
  S.ui.dirty = true;
}

// Award the legendary Elvis (from the Serum Run).
export function awardElvis() {
  if (S.dogs.some((d) => d.breedKey === 'elvis')) return null;
  const elvis = createDog('elvis', { stage: 'adult', name: 'Elvis', sex: 'M' });
  elvis.happiness = 100; elvis.health = 100; elvis.energy = 100;
  S.dogs.push(elvis);
  toast(C.FLAVOR.elvis[0], 'good', 7);
  pushFx(elvis.x, elvis.y - 20, '★ Elvis ★', C.PALETTE.gold, 2.2);
  S.ui.dirty = true;
  return elvis;
}

// Team strength helpers for the missions module/UI.
export function teamPower(dogs) {
  const r = { speed: 0, stamina: 0, strength: 0, temperament: 0, overall: 0 };
  if (!dogs.length) return r;
  for (const s of STATS) r[s] = avg(dogs, (d) => d.stats[s]);
  r.overall = (r.speed + r.stamina + r.strength + r.temperament) / 4;
  return r;
}

// Per-tick lifecycle. dt = in-game seconds.
export function tickDogs(dt) {
  const fday = dt / E.dayLengthSeconds;
  const kennelBonus = S.buildings.some((b) => C.BUILDINGS[b.key]?.category === 'kennel') ? E.kennelRegenBonus : 0;
  const auraTotal = sum(S.buildings, (b) => C.BUILDINGS[b.key]?.happyAura || 0);
  const night = S.time.tod >= E.dayFraction;

  for (const d of S.dogs) {
    // Aging + puppy growth.
    d.ageDays += fday;
    if (d.stage === 'puppy') {
      const growRate = (fday / E.puppyToAdultDays);
      for (const s of STATS) d.stats[s] = clamp(d.stats[s] + (d.potential[s] - d.stats[s]) * growRate * 1.4, 0, d.potential[s]);
      if (d.ageDays >= E.puppyToAdultDays) {
        d.stage = 'adult';
        for (const s of STATS) d.stats[s] = clamp(Math.max(d.stats[s], d.potential[s] - rand(4, 12)), 0, d.potential[s]);
        toast(C.FLAVOR.growup[0].replace('{name}', d.name), 'good');
      }
    }

    if (d.missionId) continue; // missions handle energy/hunger for away dogs

    // Hunger always drifts down.
    d.hunger = clamp(d.hunger - E.hungerDecayPerDay * fday, 0, 100);
    // Energy recovers at home, faster at night and with kennels.
    const regen = E.energyRegenPerDay * (1 + kennelBonus) * (night ? 1.25 : 1);
    d.energy = clamp(d.energy + regen * fday, 0, 100);
    // Health: recover if fed, suffer if starving.
    if (d.hunger < 18) d.health = clamp(d.health - 14 * fday, 0, 100);
    else d.health = clamp(d.health + 6 * fday, 0, 100);
    // Happiness drifts toward a target set by hunger + health, plus kennel auras.
    const target = clamp(38 + d.hunger * 0.42 + (d.health - 50) * 0.2, 0, 100);
    d.happiness = approach(d.happiness, target, E.happyDriftPerDay * fday);
    if (auraTotal) d.happiness = clamp(d.happiness + auraTotal * fday, 0, 100);
  }
}
