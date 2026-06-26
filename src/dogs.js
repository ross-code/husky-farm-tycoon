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
  return { x: (S.land.cols / 2) * tile + rand(-40, 40), y: (S.land.rows / 2) * tile + rand(-30, 30) };
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
    missionId: null, breedCooldownDay: 0, illness: null,
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
  if (breed.oneOnly) {
    asAdult = true;
    if (S.elvisAcquired || S.dogs.some((d) => d.breedKey === breedKey)) { toast(`There is only one ${breed.name}.`, 'warn'); return null; }
  }
  if (!hasRoom()) { toast('No free kennel. Build more housing first.', 'warn'); return null; }
  const price = breed.oneOnly ? breed.price : Math.round(breed.price * (asAdult ? 1.7 : 1));
  if (!spend(price)) { toast(`You need $${price} for ${breed.oneOnly ? breed.name : 'a ' + breed.name}.`, 'warn'); return null; }
  const dog = createDog(breedKey, { stage: asAdult ? 'adult' : 'puppy', name: breed.oneOnly ? breed.name : undefined });
  if (breed.oneOnly) { S.elvisAcquired = true; dog.happiness = 100; dog.health = 100; dog.energy = 100; }
  S.dogs.push(dog);
  S.stats.dogsBought++;
  pushFx(dog.x, dog.y - 16, breed.oneOnly ? '★' : '🐾', breed.oneOnly ? C.PALETTE.gold : C.PALETTE.brand, breed.oneOnly ? 2 : 1.1);
  toast(breed.oneOnly ? C.FLAVOR.elvis[0] : C.FLAVOR.adopt[randInt(0, C.FLAVOR.adopt.length - 1)].replace('{name}', dog.name), 'good', breed.oneOnly ? 6 : 4);
  S.ui.dirty = true;
  return dog;
}

// Food units needed to fully top a dog off.
export const feedCost = (dog) => Math.max(0, Math.ceil((100 - dog.hunger) * E.foodPerHunger));

// Feed a dog. amount: a number of hunger points, 'max' to top off, or undefined for a snack (+30).
export function feedDog(dog, amount) {
  if (!dog) return;
  let want = amount === 'max' ? (100 - dog.hunger) : (typeof amount === 'number' ? amount : 30);
  want = clamp(want, 0, 100 - dog.hunger);
  if (want <= 0) { if (amount) toast(`${dog.name} is already full.`, 'info', 1.2); return; }
  const need = Math.max(1, Math.ceil(want * E.foodPerHunger));
  if (S.food >= need) { S.food -= need; }
  else { // buy the shortfall with cash
    const cashCost = Math.ceil((need - S.food) * E.foodUnitCost);
    if (!spend(cashCost)) { toast('Not enough food or cash to feed.', 'warn'); return; }
    S.food = 0;
  }
  dog.hunger = clamp(dog.hunger + want, 0, 100);
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

// Whole-pack convenience actions.
export function feedAll() {
  if (!S.dogs.length) { toast('No dogs to feed yet.', 'info', 1.4); return; }
  let n = 0;
  for (const d of S.dogs) { const before = d.hunger; feedDog(d, 'max'); if (d.hunger > before) n++; }
  if (n) toast(`Topped off ${n} dog${n > 1 ? 's' : ''}.`, 'good', 1.6);
}
export function playWithAll() {
  if (!S.dogs.length) { toast('No dogs to play with yet.', 'info', 1.4); return; }
  for (const d of S.dogs) playWithDog(d);
  toast('Played with the whole pack. Tails everywhere.', 'good', 1.6);
}

// ---- medical: Dr. Sophie Park -------------------------------------------
export const hasClinic = () => S.buildings.some((b) => C.BUILDINGS[b.key]?.onsiteVet);
export const sickDogs = () => S.dogs.filter((d) => d.illness);

function clearIllness(dog) {
  dog.illness = null;
  dog.happiness = clamp(dog.happiness + 12, 0, 100);
  dog.health = clamp(dog.health + 20, 0, 100);
  if (dog.energy < 40) dog.energy = clamp(dog.energy + 15, 0, 100);
}

// What a single house call / treatment costs right now (for UI labels).
export function treatCost(dog) {
  if (!dog?.illness) return 0;
  const ill = C.illness(dog.illness.key);
  return (ill?.fee || 0) + (hasClinic() ? 0 : C.ECONOMY.vetHouseCall);
}

// Call Dr. Sophie Park out to treat one dog.
export function treatDog(dog) {
  if (!dog || !dog.illness) return false;
  const cost = treatCost(dog);
  if (!spend(cost)) { toast(`Dr. Park's visit for ${dog.name} costs $${cost}.`, 'warn'); return false; }
  pushFx(dog.x, dog.y - 16, '➕', C.PALETTE.teal, 1.2);
  clearIllness(dog);
  toast(C.FLAVOR.treated[randInt(0, C.FLAVOR.treated.length - 1)].replace('{name}', dog.name), 'good');
  S.ui.dirty = true;
  return true;
}

export function treatAllSick() {
  const sick = sickDogs();
  if (!sick.length) return;
  let n = 0;
  for (const d of sick) { if (treatDog(d)) n++; else break; }
  if (n) toast(`Dr. Sophie Park made the rounds: ${n} treated.`, 'good', 2);
}

// Once per in-game day: the clinic auto-treats; otherwise dogs may fall ill.
export function dailyHealthCheck() {
  const clinic = hasClinic();
  if (clinic) for (const d of S.dogs) if (d.illness) clearIllness(d);
  if (S.time.day <= C.ECONOMY.sicknessGraceDays) return;
  for (const d of S.dogs) {
    if (d.illness || d.missionId) continue;
    if (!chance(C.ECONOMY.sicknessChancePerDay)) continue;
    const ill = choice(C.ILLNESSES);
    d.illness = { key: ill.key, sinceDay: S.time.day };
    d.happiness = clamp(d.happiness - 12, 0, 100);
    if (ill.severe) d.energy = clamp(d.energy - 20, 0, 100);
    if (clinic) clearIllness(d); // on-site vet catches it the same day
    else toast(C.FLAVOR.sick[randInt(0, C.FLAVOR.sick.length - 1)].replace('{name}', d.name).replace('{illness}', ill.name), 'bad', 5);
  }
  S.ui.dirty = true;
}

export const canTrain = () => S.buildings.some((b) => C.BUILDINGS[b.key]?.enables === 'train');

export function trainDog(dog, stat) {
  if (!dog || !STATS.includes(stat)) return false;
  if (!canTrain()) { toast('Build a Practice Yard to train dogs.', 'warn'); return false; }
  if (dog.stage !== 'adult') { toast('Puppies are too young to train hard.', 'warn'); return false; }
  if (dog.energy < E.trainEnergyCost) { toast(`${dog.name} is too tired to train.`, 'warn'); return false; }
  if (dog.stats[stat] >= dog.potential[stat]) { toast(`${dog.name} has maxed ${stat}.`, 'info'); return false; }
  const costCut = S.buildings.reduce((m, b) => Math.max(m, C.BUILDINGS[b.key]?.trainCostCut || 0), 0);
  const cost = Math.round(E.trainCostBase * (1 - costCut));
  if (!spend(cost)) { toast(`Training costs $${cost}.`, 'warn'); return false; }
  const facilityBonus = 1 + S.buildings.reduce((m, b) => m + (C.BUILDINGS[b.key]?.trainBonus || 0), 0);
  const room = 1 - dog.stats[stat] / dog.potential[stat];
  const happyMult = 0.5 + dog.happiness / 100;
  const gain = Math.max(1, Math.round(E.trainGainBase * room * happyMult * facilityBonus));
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

// Each breeding den auto-produces a pup every config.autoBreedDays, given an eligible
// pair and free housing. This makes the dens passively useful and scales to a big pack.
export function autoBreedTick() {
  const dens = S.buildings.filter((b) => C.BUILDINGS[b.key]?.enables === 'breed').length;
  if (!dens) return;
  if (S.time.day - (S.lastAutoBreedDay || 0) < C.ECONOMY.autoBreedDays) return;
  S.lastAutoBreedDay = S.time.day;
  for (let i = 0; i < dens; i++) {
    if (!hasRoom()) break;
    const ready = (sex) => S.dogs.filter((d) => d.stage === 'adult' && d.sex === sex && !d.missionId && !d.illness && S.time.day >= d.breedCooldownDay);
    const males = ready('M'), females = ready('F');
    if (!males.length || !females.length) break;
    breedDogs(choice(males), choice(females));
  }
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
    // Illness wears a dog down until Dr. Park treats it.
    if (d.illness) {
      d.happiness = clamp(d.happiness - 6 * fday, 0, 100);
      if (C.illness(d.illness.key)?.severe) d.health = clamp(d.health - 4 * fday, 0, 100);
    }
  }
}
