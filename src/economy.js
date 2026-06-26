// economy.js — money, farm appeal, tourist income, and daily upkeep.
// Leaf-logic module: imports only state/config/util.

import { S, toast, pushFx } from './state.js';
import * as C from './config.js';
import { clamp, sum } from './util.js';

const E = C.ECONOMY;

export function canAfford(amount) { return S.cash >= amount; }

export function spend(amount, label) {
  if (S.cash < amount) return false;
  S.cash -= amount;
  S.stats.totalSpent += amount;
  S.ui.dirty = true;
  return true;
}

export function earn(amount, opts = {}) {
  S.cash += amount;
  S.stats.totalEarned += amount;
  if (opts.x != null && opts.y != null) pushFx(opts.x, opts.y, `+$${Math.round(amount)}`, C.PALETTE.gold);
  S.ui.dirty = true;
}

// Total food-cost discount from Larders (stacks, capped at 30%).
function foodDiscount() {
  const d = sum(S.buildings, (b) => C.BUILDINGS[b.key]?.foodDiscount || 0);
  return clamp(d, 0, 0.3);
}

// Product of every building's tourist spend multiplier.
function spendMultiplier() {
  let m = 1;
  for (const b of S.buildings) { const mult = C.BUILDINGS[b.key]?.spendMult; if (mult) m *= mult; }
  return m;
}

// Recompute farm appeal from buildings + dogs and store it on S.appeal.
export function computeAppeal() {
  let structural = E.appealBase;
  let decor = 0;
  for (const b of S.buildings) {
    const def = C.BUILDINGS[b.key]; if (!def) continue;
    if (def.category === 'decor') decor += def.appeal || 0;
    else structural += def.appeal || 0;
  }
  decor = Math.min(decor, E.appealDecorCap);
  // Dogs add charm based on how happy they are and their breed charisma.
  let charm = 0;
  for (const d of S.dogs) {
    const breed = C.BREEDS[d.breedKey];
    if (!breed) continue;
    charm += (d.happiness / 100) * breed.charisma * 1.6 * (d.illness ? 0.4 : 1);
  }
  S.appeal = Math.round(structural + decor + charm);
  return S.appeal;
}

export const isDaytime = () => S.time.tod < E.dayFraction;

// Gross tourist income for a full day at current farm state.
export function incomePerDay() {
  const appeal = S.appeal;
  const adults = S.dogs.filter((d) => d.stage === 'adult').length;
  const repBonus = 1 + S.reputation / 120;
  const dogFactor = 1 + 0.5 * Math.min(adults, 12) / 12;
  const avgHappy = S.dogs.length ? sum(S.dogs, (d) => d.happiness) / S.dogs.length : 70;
  const happyFactor = clamp(avgHappy / 70, 0.3, 1.15);
  return appeal * E.touristYield * repBonus * dogFactor * happyFactor * spendMultiplier();
}

// Net daily rate shown in the HUD (tourist income minus average daily costs).
export function netPerDay() {
  const upkeep = sum(S.buildings, (b) => C.BUILDINGS[b.key]?.upkeep || 0);
  const food = S.dogs.length * E.foodPerDogPerDay * (1 - foodDiscount()) * E.foodUnitCost;
  return incomePerDay() - upkeep - food;
}

let _coinAcc = 0;
// Continuous tourist income, paid only during daylight.
export function tickEconomy(dt) {
  computeAppeal();
  if (!isDaytime()) return;
  const daySeconds = E.dayLengthSeconds * E.dayFraction;
  const perSec = incomePerDay() / daySeconds;
  const gain = perSec * dt;
  if (gain <= 0) return;
  S.cash += gain;
  S.stats.totalEarned += gain;
  S.stats.touristIncome += gain;
  // Pop a coin near a random tourist every ~$8 earned, throttled.
  _coinAcc += gain;
  if (_coinAcc >= 8 && S.tourists.length) {
    _coinAcc = 0;
    const t = S.tourists[Math.floor(Math.random() * S.tourists.length)];
    if (t) pushFx(t.x, t.y - 10, '+$', C.PALETTE.gold, 0.9);
  }
}

// Charged once per in-game day rollover.
export function dailyUpkeep() {
  // Building upkeep.
  const upkeep = sum(S.buildings, (b) => C.BUILDINGS[b.key]?.upkeep || 0);
  if (upkeep > 0) {
    if (S.cash >= upkeep) { S.cash -= upkeep; }
    else { S.cash = 0; toast('Upkeep is outpacing income. Run a mission for cash.', 'warn'); }
  }

  // Food: dogs eat from the stock; auto-buy if short and affordable.
  const need = Math.ceil(S.dogs.length * E.foodPerDogPerDay * (1 - foodDiscount()));
  if (need > 0) {
    if (S.food < need) {
      const shortBy = need - S.food;
      const cost = shortBy * E.foodUnitCost;
      if (S.cash >= cost) { S.cash -= cost; S.food += shortBy; }
    }
    if (S.food >= need) {
      S.food -= need;
      // Well-fed: top up hunger, small happiness lift.
      for (const d of S.dogs) { d.hunger = clamp(d.hunger + 55, 0, 100); d.happiness = clamp(d.happiness + 3, 0, 100); }
    } else {
      // Not enough food: dogs go hungry.
      S.food = 0;
      for (const d of S.dogs) { d.hunger = clamp(d.hunger - 18, 0, 100); d.happiness = clamp(d.happiness - 8, 0, 100); }
      if (S.dogs.length) toast('The dogs went hungry. Buy more food.', 'bad');
    }
  }

  // A little reputation drifts in from happy visitors.
  S.reputation += clamp(S.appeal / 60, 0, 2.5);
  S.ui.dirty = true;
}

// ---- dog valuation ------------------------------------------------------
export function dogMarketValue(dog) {
  const breed = C.BREEDS[dog.breedKey]; if (!breed) return 50;
  const statTotal = dog.stats.speed + dog.stats.stamina + dog.stats.strength + dog.stats.temperament;
  const quality = clamp(statTotal / 280, 0.7, 1.4);
  const ageFactor = dog.stage === 'puppy' ? 0.7 : 1;
  return Math.round((breed.price || 150) * quality * ageFactor);
}
export function sellPrice(dog) { return Math.round(dogMarketValue(dog) * E.dogSellFrac); }

// Buy a batch of food from the HUD control.
export function buyFood(units = C.ECONOMY.foodBuyBatch) {
  const cost = Math.round(units * E.foodUnitCost);
  if (!spend(cost)) { toast('Not enough cash for food.', 'warn'); return false; }
  S.food += units;
  toast(`Bought ${units} food for $${cost}.`, 'good');
  return true;
}
