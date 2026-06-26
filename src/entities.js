// entities.js — visual life: tourists arriving/wandering/leaving, and idle dogs roaming.
// Imports state/config/util + buildings. Purely cosmetic; never touches money or stats.

import { S } from './state.js';
import * as C from './config.js';
import { rand, randInt, choice, chance, dist, clamp } from './util.js';
import { centerOf, touristAttractions, gatePoint } from './buildings.js';
import { isDaytime } from './economy.js';

const PARKA = ['#D26B6B', '#5E8FCB', '#E0A93F', '#6BB07A', '#9B6FB0', '#4C4C57', '#C9698F'];
const SKIN = ['#F3C9A8', '#D9A878', '#A9774E', '#7A5436'];

// Entities roam the OWNED land only, not the unowned (dark) territory.
const worldW = () => S.land.cols * S.grid.tile;
const worldH = () => S.land.rows * S.grid.tile;

function randomWalkTarget() {
  const t = S.grid.tile;
  return { x: rand(t, worldW() - t), y: rand(t, worldH() - t) };
}

function pickAttractionTarget() {
  const a = touristAttractions();
  if (a.length && chance(0.8)) { const b = choice(a); const c = centerOf(b); return { x: c.x + rand(-22, 22), y: c.y + S.grid.tile * 0.7 + rand(-8, 8) }; }
  return randomWalkTarget();
}

function spawnTourist() {
  const g = gatePoint();
  S.tourists.push({
    id: 't' + Math.floor(rand(1e9)),
    x: g.x + rand(-14, 14), y: g.y + rand(-4, 6), vx: 0, vy: 0,
    color: choice(PARKA), skin: choice(SKIN), hat: chance(0.5), pom: chance(0.4),
    phone: chance(0.18), balloon: chance(0.08) ? choice([C.PALETTE.brand, C.PALETTE.teal, C.PALETTE.gold]) : null,
    target: pickAttractionTarget(), state: 'wander', dwell: 0, life: rand(22, 44), phase: rand(0, 6.28),
  });
}

function moveToward(e, target, speed, dt) {
  const dx = target.x - e.x, dy = target.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed; e.vy = (dy / d) * speed;
  e.x += e.vx * dt; e.y += e.vy * dt;
  return d;
}

function tickTourists(dt) {
  const day = isDaytime();
  const desired = Math.round(clamp(S.appeal / 4, 0, C.ECONOMY.touristMaxOnFarm)) * (day ? 1 : 0.15);
  if (S.tourists.length < desired && Math.random() < dt * 0.9) spawnTourist();

  const g = gatePoint();
  for (let i = S.tourists.length - 1; i >= 0; i--) {
    const t = S.tourists[i];
    t.phase += dt * 6;
    t.life -= dt;
    if (t.state !== 'leaving' && (t.life <= 0 || !day)) { t.state = 'leaving'; t.target = { x: g.x, y: g.y + 10 }; }

    const d = moveToward(t, t.target, t.state === 'leaving' ? 42 : 28, dt);
    if (d < 10) {
      if (t.state === 'leaving') { S.tourists.splice(i, 1); continue; }
      if (t.dwell > 0) { t.dwell -= dt; t.vx = t.vy = 0; }
      else { t.dwell = rand(1.5, 4); t.target = pickAttractionTarget(); }
    }
  }
}

function tickDogVisuals(dt) {
  const t = S.grid.tile;
  const night = !isDaytime();
  for (const d of S.dogs) {
    if (d.missionId) continue; // away dogs aren't drawn on the farm
    // Sleepy low-energy dogs at night just rest.
    if (night && d.energy < 35) { d.vx = d.vy = 0; d.animPhase += dt * 1.5; continue; }

    if (!d.wanderTarget || dist(d.x, d.y, d.wanderTarget.x, d.wanderTarget.y) < 8) {
      if (d.restUntil > 0) { d.restUntil -= dt; d.vx = d.vy = 0; d.animPhase += dt * 2; continue; }
      d.wanderTarget = { x: clamp(d.x + rand(-3 * t, 3 * t), t, worldW() - t), y: clamp(d.y + rand(-3 * t, 3 * t), t, worldH() - t) };
      d.restUntil = rand(0.6, 2.4);
    }
    const speed = 18 + (d.happiness > 70 ? 6 : 0);
    moveToward(d, d.wanderTarget, speed, dt);
    if (Math.abs(d.vx) > 0.5) d.facing = d.vx < 0 ? -1 : 1;
    d.animPhase += (Math.hypot(d.vx, d.vy) * dt) / 6;
  }
}

export function tickEntities(dt) {
  tickTourists(dt);
  tickDogVisuals(dt);
}
