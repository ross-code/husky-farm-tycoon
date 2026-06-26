// game.js — orchestrator: start screen, the main loop, in-game time, day rollover,
// milestone checks, and autosave. Wires every module together.

import { S, newGame, loadGame, hasSave, saveGame, toast } from './state.js';
import * as C from './config.js';
import { tickEconomy, dailyUpkeep, computeAppeal } from './economy.js';
import { tickDogs } from './dogs.js';
import { tickMissions, rollAvailable } from './missions.js';
import { tickEntities } from './entities.js';
import { initRender, render } from './render.js';
import { initInput } from './input.js';
import { initUI, refreshUI, refreshHud, renderToasts } from './ui.js';

const DAY = () => C.ECONOMY.dayLengthSeconds;
let last = 0, running = false, autosaveAcc = 0;

function onNewDay() {
  dailyUpkeep();
  rollAvailable();
  saveGame();
}

function checkMilestones() {
  for (const m of C.MILESTONES) {
    if (S.milestones.done.includes(m.key)) continue;
    if (!m.check(S)) continue;
    S.milestones.done.push(m.key);
    const u = m.unlocks || {};
    let unlockedMission = false;
    for (const kind of ['buildings', 'breeds', 'missions']) {
      for (const key of (u[kind] || [])) {
        if (!S.unlocks[kind].includes(key)) { S.unlocks[kind].push(key); if (kind === 'missions') unlockedMission = true; }
      }
    }
    if (unlockedMission) rollAvailable();
    if (m.toast) toast(m.toast, 'good', 6);
    S.ui.dirty = true;
  }
}

function advance(dt) {
  S.time.elapsed += dt;
  const targetDay = Math.floor(S.time.elapsed / DAY()) + 1;
  while (S.time.day < targetDay) { S.time.day++; onNewDay(); }
  S.time.tod = (S.time.elapsed % DAY()) / DAY();

  tickEconomy(dt);
  tickDogs(dt);
  tickMissions(dt);
  tickEntities(dt);
  checkMilestones();
}

function loop(now) {
  if (!running) return;
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (S.started && !S.paused) advance(dt * (S.speed || 1));

  render(now);
  if (S.ui.dirty) refreshUI(); else refreshHud();
  renderToasts(dt);

  // periodic autosave (every ~20s of real time)
  autosaveAcc += dt;
  if (autosaveAcc > 20) { autosaveAcc = 0; if (S.started) saveGame(); }

  requestAnimationFrame(loop);
}

function start() {
  document.getElementById('start')?.classList.add('gone');
  computeAppeal();
  rollAvailable();
  checkMilestones();
  initRender(document.getElementById('game'));
  initInput(document.getElementById('game'));
  initUI();
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
}

function boot() {
  const cont = document.getElementById('btn-continue');
  if (cont) { if (!hasSave()) { cont.disabled = true; cont.classList.add('disabled'); } else cont.addEventListener('click', () => { if (loadGame()) start(); else { newGame(); start(); } }); }
  document.getElementById('btn-new')?.addEventListener('click', () => {
    if (hasSave() && !confirm('Start a new farm? This replaces your saved game.')) return;
    newGame(); start();
  });
  // fade boot splash
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 200)));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// save on tab hide
window.addEventListener('visibilitychange', () => { if (document.hidden && S.started) saveGame(); });
