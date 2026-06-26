// ui.js — DOM HUD + side panels. The only DOM-heavy module. Reads everything,
// drives actions via a single delegated click handler. Imports the action modules.

import { S, setPanel, setBuildSelection, clearBuildSelection, select, saveGame, newGame, toast, isUnlocked } from './state.js';
import * as C from './config.js';
import { clamp, fmtMoney, fmtTime, titleize } from './util.js';
import { netPerDay, buyFood, dogMarketValue, sellPrice } from './economy.js';
import { buyDog, feedDog, playWithDog, feedAll, playWithAll, trainDog, breedDogs, canBreed, sellDog, dogCapacity, canTrain, canBreedHere, treatDog, treatAllSick, treatCost, hasClinic, sickDogs } from './dogs.js';
import { placeBuilding, removeBuilding, hasHouse } from './buildings.js';
import { startMission, canStart, eligibleDogs, missionStatus, successChanceFor } from './missions.js';

const $ = (id) => document.getElementById(id);
const STAT_LABEL = { speed: 'Speed', stamina: 'Stamina', strength: 'Strength', temperament: 'Temper' };

function ensureUiState() {
  S.ui.buildCat ||= 'house';
  S.ui.breedPick ||= [];
}

// ---- small html helpers -------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function statBar(label, val, cls = '') {
  const v = clamp(val, 0, 100);
  return `<div class="statline"><span class="lbl">${label}</span><div class="bar"><div class="bar-fill ${cls}" style="width:${v}%"></div></div><span class="num">${Math.round(val)}</span></div>`;
}
const breedName = (k) => C.BREEDS[k]?.name || titleize(k);

// Find a human hint for what unlocks a still-locked def.
function unlockHint(kind, key) {
  const m = C.MILESTONES.find((ms) => ms.unlocks?.[kind]?.includes(key));
  return m ? m.desc : 'Locked';
}

// ======================================================================
// TOP BAR + BOTTOM TABS
// Built ONCE, then updated in place. Rebuilding innerHTML every frame
// destroyed the button under the cursor between mousedown and mouseup, so
// real mouse clicks on the speed/pause/tab buttons never fired.
// ======================================================================
let chromeBuilt = false;
function buildChrome() {
  $('topbar').innerHTML = `
    <div class="title">🐺 Husky Farm <span class="pawn">Tycoon</span></div>
    <div class="chip money"><span class="chip-ico">💰</span><span class="chip-val" id="hud-cash"></span></div>
    <div class="chip"><span class="chip-ico">⭐</span><span class="chip-val" id="hud-rep"></span><span class="chip-label">rep</span></div>
    <div class="chip"><span class="chip-ico">✨</span><span class="chip-val" id="hud-appeal"></span><span class="chip-label">appeal</span></div>
    <div class="chip"><span class="chip-ico">🐶</span><span class="chip-val" id="hud-dogs"></span></div>
    <div class="chip"><span class="chip-ico">🦴</span><span class="chip-val" id="hud-food"></span><button class="btn btn-sm" data-act="buyfood" title="Buy ${C.ECONOMY.foodBuyBatch} food">+food</button></div>
    <div class="chip"><span class="chip-ico" id="hud-dayico">☀️</span><span class="chip-val" id="hud-day"></span></div>
    <div class="chip" title="Net cash per day at current farm"><span class="chip-ico">📈</span><span class="chip-val" id="hud-net"></span></div>
    <div class="spacer"></div>
    <div class="row">
      <button class="btn btn-sm" data-act="pause" id="spd-pause" title="Pause (Space)">⏸</button>
      <button class="btn btn-sm" data-act="speed:1" id="spd-1" title="1x speed">▶</button>
      <button class="btn btn-sm" data-act="speed:2" id="spd-2" title="2x speed">▶▶</button>
      <button class="btn btn-sm" data-act="speed:3" id="spd-3" title="3x speed">▶▶▶</button>
      <button class="btn btn-sm" data-act="help" title="How to play">？</button>
      <button class="btn btn-sm" data-act="save" title="Save (auto every day)">💾</button>
      <button class="btn btn-sm" data-act="reset" title="New farm">↻</button>
    </div>`;
  $('bottombar').innerHTML = `
    <button class="tab" data-act="panel:build" id="tab-build"><span class="ico">🏗️</span>Build</button>
    <button class="tab" data-act="panel:dogs" id="tab-dogs"><span class="ico">🐶</span>Dogs<span class="badge" id="badge-dogs" style="display:none">!</span></button>
    <button class="tab" data-act="panel:market" id="tab-market"><span class="ico">🛒</span>Market</button>
    <button class="tab" data-act="panel:missions" id="tab-missions"><span class="ico">🛷</span>Missions<span class="badge" id="badge-missions" style="display:none"></span></button>`;
  chromeBuilt = true;
}

const txt = (id, v) => { const e = $(id); if (e) e.textContent = v; };
const tip = (id, on, cls = 'btn-primary') => { const e = $(id); if (e) e.classList.toggle(cls, on); };

// Update HUD values + active states in place (no element replacement → clicks survive).
function updateChrome() {
  if (!chromeBuilt) buildChrome();
  const cap = dogCapacity(), net = netPerDay();
  txt('hud-cash', fmtMoney(S.cash));
  txt('hud-rep', Math.round(S.reputation));
  txt('hud-appeal', Math.round(S.appeal));
  const dEl = $('hud-dogs'); if (dEl) { dEl.textContent = `${S.dogs.length}/${cap}`; dEl.style.color = S.dogs.length > cap ? 'var(--bad)' : S.dogs.length === cap ? 'var(--warn)' : ''; }
  const fLow = S.food < S.dogs.length * C.ECONOMY.foodPerDogPerDay; const fEl = $('hud-food'); if (fEl) { fEl.textContent = Math.round(S.food); fEl.style.color = fLow ? 'var(--warn)' : ''; }
  txt('hud-dayico', S.time.tod < 0.06 ? '🌅' : S.time.tod < C.ECONOMY.dayFraction ? '☀️' : '🌙');
  txt('hud-day', `Day ${S.time.day}`);
  const nEl = $('hud-net'); if (nEl) { nEl.textContent = `${net >= 0 ? '+' : ''}${fmtMoney(net)}/d`; nEl.style.color = net >= 0 ? 'var(--good)' : 'var(--bad)'; }
  tip('spd-pause', S.paused);
  tip('spd-1', !S.paused && S.speed === 1);
  tip('spd-2', !S.paused && S.speed === 2);
  tip('spd-3', !S.paused && S.speed === 3);
  for (const k of ['build', 'dogs', 'market', 'missions']) tip('tab-' + k, S.ui.panel === k, 'active');
  const needCare = S.dogs.some((d) => d.hunger < 30 || d.health < 35 || (d.energy < 25 && !d.missionId));
  const bd = $('badge-dogs'); if (bd) bd.style.display = needCare ? '' : 'none';
  const active = S.missions.active.length; const bm = $('badge-missions'); if (bm) { bm.textContent = active || ''; bm.style.display = active ? '' : 'none'; }
  // Live mission timers/progress (elements persist between dirty refreshes).
  if (S.ui.panel === 'missions') {
    for (const inst of S.missions.active) {
      const st = missionStatus(inst);
      const t = $('msn-time-' + inst.id); if (t) t.textContent = fmtTime(st.remaining);
      const b = $('msn-bar-' + inst.id); if (b) b.style.width = `${Math.round(st.pct * 100)}%`;
    }
  }
}

// ======================================================================
// PANELS
// ======================================================================
function panelShell(title, sub, body) {
  return `<div class="panel"><div class="panel-head"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="panel-body">${body}</div></div>`;
}

function buildPanel() {
  ensureUiState();
  const cats = C.CATEGORIES;
  let chips = '<div class="row" style="flex-wrap:wrap;gap:5px;margin-bottom:10px">';
  for (const c of cats) chips += `<button class="btn btn-sm ${S.ui.buildCat === c.key ? 'btn-primary' : ''}" data-act="buildcat:${c.key}">${c.ico} ${c.label}</button>`;
  chips += '</div>';

  let banner = '';
  if (!hasHouse()) banner = `<div class="card" style="border-color:var(--brand)"><b>Welcome, Keeper!</b><div class="muted">Build the Keeper's Cabin to open the farm. Pick it below, then click the snow to place it.</div></div>`;

  const defs = Object.values(C.BUILDINGS).filter((b) => b.category === S.ui.buildCat);
  let cards = '';
  for (const def of defs) {
    const built = def.key === 'keepers_cabin' && S.buildings.some((b) => b.key === 'keepers_cabin');
    const unlocked = isUnlocked('buildings', def.key);
    const afford = S.cash >= def.cost;
    const sel = S.ui.buildSelection === def.key;
    const locked = !unlocked || built;
    const tag = built ? '<span class="tag">Built ✓</span>' : `<span class="price ${afford ? '' : 'cant'}">${def.cost ? fmtMoney(def.cost) : 'Free'}</span>`;
    const note = built ? ' · already built' : (locked ? ` · 🔒 ${unlockHint('buildings', def.key)}` : '');
    cards += `<div class="card ${sel ? 'sel' : ''} ${locked ? 'locked' : ''}" ${locked ? '' : `data-act="buildsel:${def.key}"`}>
      <div class="card-row">
        <div class="swatch">${def.glyph || '🏗️'}</div>
        <div style="flex:1">
          <div class="row"><span class="name">${def.name}</span><span class="spacer"></span>${tag}</div>
          <div class="desc">${def.desc || def.flavor}</div>
          <div class="muted">${def.size.w}×${def.size.h} tiles${def.upkeep ? ` · upkeep $${def.upkeep}/day` : ''}${note}</div>
        </div>
      </div></div>`;
  }
  const hint = S.ui.buildSelection ? `<div class="help">Placing <b>${C.BUILDINGS[S.ui.buildSelection].name}</b>. Click the farm to place. Right-click or Esc to cancel.</div>` : '<div class="help">Pick a building, then click the snowy farm to place it.</div>';
  return panelShell('Build', 'Grow Lantern Hollow', banner + chips + cards + hint);
}

function dogCardActions(d) {
  const yard = canTrain(), den = canBreedHere();
  const picked = S.ui.breedPick.includes(d.id);
  let trainRow = '';
  if (d.stage === 'adult') {
    trainRow = '<div class="row" style="flex-wrap:wrap;gap:4px;margin-top:6px">';
    for (const s of ['speed', 'stamina', 'strength', 'temperament']) {
      const maxed = d.stats[s] >= d.potential[s];
      trainRow += `<button class="btn btn-sm ${yard && !maxed ? '' : 'disabled'}" ${yard && !maxed ? `data-act="train:${d.id}:${s}"` : ''} title="${yard ? `Train ${s} ($${C.ECONOMY.trainCostBase})` : 'Build a Practice Yard'}">▲${s.slice(0, 3)}</button>`;
    }
    trainRow += '</div>';
  }
  return `<div class="row" style="gap:5px;margin-top:7px;flex-wrap:wrap">
      <button class="btn btn-sm" data-act="feed:${d.id}">🦴 Feed</button>
      <button class="btn btn-sm" data-act="play:${d.id}">❤ Play</button>
      <button class="btn btn-sm ${picked ? 'btn-primary' : ''} ${den ? '' : 'disabled'}" ${den ? `data-act="breedpick:${d.id}"` : ''} title="${den ? 'Select for breeding' : 'Build a Whelping Den'}">💕 Breed</button>
      <button class="btn btn-sm btn-danger" data-act="sell:${d.id}">Sell $${sellPrice(d)}</button>
    </div>${trainRow}`;
}

function dogsPanel() {
  ensureUiState();
  const cap = dogCapacity();
  if (!S.dogs.length) {
    return panelShell('Dogs', `0 / ${cap}`, `<div class="empty">No huskies yet.<br><br><button class="btn btn-primary" data-act="panel:market">Visit the Market 🛒</button></div>`);
  }
  // needs-care first
  const dogs = [...S.dogs].sort((a, b) => careScore(a) - careScore(b));
  const sick = sickDogs();
  let body = `<div class="row" style="gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <button class="btn btn-sm" data-act="feedall">🦴 Feed All</button>
      <button class="btn btn-sm" data-act="playall">❤ Play All</button>
      ${sick.length && !hasClinic() ? `<button class="btn btn-sm btn-danger" data-act="treatall">🚑 Treat All (${sick.length})</button>` : ''}
    </div>`;
  // breeding action bar
  if (S.ui.breedPick.length === 2) {
    const [a, b] = S.ui.breedPick.map((id) => S.dogs.find((d) => d.id === id));
    const ck = a && b ? canBreed(a, b) : { ok: false, reason: 'Pick two dogs' };
    body += `<div class="card" style="border-color:var(--brand)"><div class="row"><b>💕 Breed ${a?.name} × ${b?.name}</b><span class="spacer"></span>
      <button class="btn btn-sm ${ck.ok ? 'btn-primary' : 'disabled'}" ${ck.ok ? 'data-act="breedgo"' : ''}>Breed</button>
      <button class="btn btn-sm" data-act="breedclear">✕</button></div>${ck.ok ? '' : `<div class="muted">${ck.reason}</div>`}</div>`;
  }
  for (const d of dogs) {
    const sel = S.ui.selected?.type === 'dog' && S.ui.selected.id === d.id;
    const away = d.missionId ? '<span class="tag">🛷 on mission</span>' : '';
    const ageTxt = d.stage === 'puppy' ? `Puppy (${Math.floor((C.ECONOMY.puppyToAdultDays - d.ageDays))}d to grow)` : 'Adult';
    body += `<div class="card ${sel ? 'sel' : ''}" data-act="selectdog:${d.id}">
      <div class="row"><span class="name">${esc(d.name)}</span> <span class="tag">${d.sex === 'M' ? '♂' : '♀'} ${breedName(d.breedKey)}</span> <span class="spacer"></span>${away}<span class="muted">${ageTxt}</span></div>
      ${statBar(STAT_LABEL.speed, d.stats.speed)}${statBar(STAT_LABEL.stamina, d.stats.stamina)}${statBar(STAT_LABEL.strength, d.stats.strength)}${statBar(STAT_LABEL.temperament, d.stats.temperament)}
      <div class="statline"><span class="lbl">Hunger</span><div class="bar"><div class="bar-fill hunger" style="width:${d.hunger}%"></div></div><span class="num"></span></div>
      <div class="statline"><span class="lbl">Energy</span><div class="bar"><div class="bar-fill energy" style="width:${d.energy}%"></div></div><span class="num"></span></div>
      <div class="statline"><span class="lbl">Happy</span><div class="bar"><div class="bar-fill happy" style="width:${d.happiness}%"></div></div><span class="num"></span></div>
      ${d.illness ? sickBanner(d) : ''}
      ${d.missionId ? '' : dogCardActions(d)}
    </div>`;
  }
  return panelShell('Dogs', `${S.dogs.length} / ${cap}`, body);
}
function careScore(d) { return (d.illness ? -200 : 0) + (d.hunger < 30 ? -100 : 0) + (d.health < 35 ? -50 : 0) + (d.energy < 25 ? -20 : 0) + d.happiness; }

function sickBanner(d) {
  const ill = C.illness(d.illness.key); if (!ill) return '';
  const clinic = hasClinic();
  return `<div class="card" style="margin:7px 0 0;border-color:var(--bad);background:rgba(224,84,78,.10)">
    <div class="row"><span>${ill.glyph} <b>${ill.name}</b></span><span class="spacer"></span>
      ${clinic ? '<span class="muted">Dr. Park on-site ✓</span>'
        : `<button class="btn btn-sm btn-primary" data-act="treat:${d.id}">Call Dr. Park ($${treatCost(d)})</button>`}</div>
    <div class="muted">${esc(d.name)} has ${ill.blurb}.</div></div>`;
}

function marketPanel() {
  let body = `<div class="card"><div class="row"><b>🦴 Food Supplies</b><span class="spacer"></span><span class="muted">Stock: ${Math.round(S.food)}</span></div>
    <div class="muted">Dogs eat ${C.ECONOMY.foodPerDogPerDay}/day each.</div>
    <button class="btn btn-sm btn-primary" data-act="buyfood" style="margin-top:6px">Buy ${C.ECONOMY.foodBuyBatch} food ($${Math.round(C.ECONOMY.foodBuyBatch * C.ECONOMY.foodUnitCost)})</button></div>
    <div class="section-title">Adopt a Husky</div>`;
  const room = S.dogs.length < dogCapacity();
  for (const breed of Object.values(C.BREEDS)) {
    const unlocked = isUnlocked('breeds', breed.key);
    const locked = !unlocked;
    const statline = `SPD ${breed.baseStats.speed} · STA ${breed.baseStats.stamina} · STR ${breed.baseStats.strength} · TMP ${breed.baseStats.temperament}`;

    if (breed.oneOnly) {
      const got = S.elvisAcquired;
      body += `<div class="card ${locked && !got ? 'locked' : ''}" style="${unlocked && !got ? 'border-color:var(--gold)' : ''}">
        <div class="row"><span class="swatch" style="background:${C.COATS[breed.coat]?.base || '#fff'}">⭐</span>
          <div style="flex:1">
            <div class="row"><span class="name">${breed.name}</span><span class="spacer"></span><span class="tag">Legendary · one only</span></div>
            <div class="muted">${breed.flavor}</div>
            <div class="muted">${statline}${locked && !got ? ' · 🔒 Finish the Serum Run to unlock' : ''}</div>
          </div></div>
        ${got ? '<div class="muted" style="margin-top:7px">The one and only Elvis is already home. 🐾</div>'
          : unlocked ? `<button class="btn btn-sm ${room && S.cash >= breed.price ? 'btn-primary' : 'disabled'}" ${room && S.cash >= breed.price ? `data-act="buy:${breed.key}:adult"` : ''} style="margin-top:7px;width:100%">${room ? `Adopt Elvis ($${breed.price})` : 'No free kennel'}</button>` : ''}
      </div>`;
      continue;
    }

    const pup = breed.price, adult = Math.round(breed.price * 1.7);
    body += `<div class="card ${locked ? 'locked' : ''}">
      <div class="row"><span class="swatch" style="background:${C.COATS[breed.coat]?.base || '#888'}">🐶</span>
        <div style="flex:1">
          <div class="row"><span class="name">${breed.name}</span><span class="spacer"></span><span class="tag">${titleize(breed.rarity)}</span></div>
          <div class="muted">${breed.flavor}</div>
          <div class="muted">${statline}${locked ? ` · 🔒 ${unlockHint('breeds', breed.key)}` : ''}</div>
        </div></div>
      ${locked ? '' : `<div class="row" style="gap:6px;margin-top:7px">
        <button class="btn btn-sm ${room && S.cash >= pup ? 'btn-primary' : 'disabled'}" ${room && S.cash >= pup ? `data-act="buy:${breed.key}:pup"` : ''}>Pup $${pup}</button>
        <button class="btn btn-sm ${room && S.cash >= adult ? '' : 'disabled'}" ${room && S.cash >= adult ? `data-act="buy:${breed.key}:adult"` : ''}>Adult $${adult}</button>
        ${room ? '' : '<span class="lock">No free kennel</span>'}
      </div>`}</div>`;
  }
  return panelShell('Market', 'Stock you can adopt', body);
}

function missionsPanel() {
  ensureUiState();
  let body = '';
  // active
  if (S.missions.active.length) {
    body += '<div class="section-title">On the trail</div>';
    for (const inst of S.missions.active) {
      const def = C.MISSIONS[inst.key]; const st = missionStatus(inst);
      const team = inst.dogIds.map((id) => S.dogs.find((d) => d.id === id)?.name || '?').join(', ');
      body += `<div class="card"><div class="row"><b>🛷 ${def.name}</b><span class="spacer"></span><span class="muted" id="msn-time-${inst.id}">${fmtTime(st.remaining)}</span></div>
        <div class="bar" style="margin:6px 0"><div class="bar-fill prog" id="msn-bar-${inst.id}" style="width:${Math.round(st.pct * 100)}%"></div></div>
        <div class="muted">Team: ${esc(team)}</div></div>`;
    }
  }
  // assemble flow
  if (S.ui.assignMission) {
    const def = C.MISSIONS[S.ui.assignMission];
    const team = S.ui.assignTeam.map((id) => S.dogs.find((d) => d.id === id)).filter(Boolean);
    const chk = canStart(S.ui.assignMission, S.ui.assignTeam);
    body += `<div class="card" style="border-color:var(--brand)">
      <div class="row"><b>Assemble: ${def.name}</b><span class="spacer"></span><button class="btn btn-sm" data-act="cancelassemble">✕</button></div>
      <div class="muted">${def.flavor}</div>
      <div class="muted" style="margin:6px 0">Team ${S.ui.assignTeam.length}/${def.teamSize} · Focus: ${Object.keys(def.focus).map((s) => s.slice(0, 3).toUpperCase()).join(' ')}</div>
      <div class="row" style="flex-wrap:wrap;gap:5px">`;
    const elig = eligibleDogs();
    if (!elig.length) body += '<span class="muted">No rested adult dogs available. Rest and feed your dogs.</span>';
    for (const d of elig) {
      const on = S.ui.assignTeam.includes(d.id);
      body += `<button class="btn btn-sm ${on ? 'btn-primary' : ''}" data-act="teampick:${d.id}">${esc(d.name)} ·${Math.round(d.energy)}⚡</button>`;
    }
    body += `</div>
      <div class="row" style="margin-top:8px"><span class="muted">Success chance</span><span class="spacer"></span><b style="color:${chk.successChance > 0.6 ? 'var(--good)' : chk.successChance > 0.35 ? 'var(--warn)' : 'var(--bad)'}">${Math.round((chk.successChance || 0) * 100)}%</b></div>
      <button class="btn ${chk.ok ? 'btn-primary' : 'disabled'}" style="width:100%;margin-top:8px" ${chk.ok ? `data-act="launch:${S.ui.assignMission}"` : ''}>${chk.ok ? `Launch (reward ${fmtMoney(def.reward.cash)})` : (chk.reason || 'Pick your team')}</button>
    </div>`;
  }
  // available
  body += '<div class="section-title">The Trailhead Board</div>';
  const avail = Object.values(C.MISSIONS).filter((m) => isUnlocked('missions', m.key));
  for (const def of avail) {
    const reqStats = Object.entries(def.focus).map(([s, w]) => `${s.slice(0, 3).toUpperCase()}`).join('/');
    const capstone = def.key === 'serum_run';
    body += `<div class="card" ${capstone ? 'style="border-color:var(--gold)"' : ''}>
      <div class="row"><b>${capstone ? '⭐ ' : '🛷 '}${def.name}</b><span class="spacer"></span><span class="price">${fmtMoney(def.reward.cash)}</span></div>
      <div class="muted">${def.flavor}</div>
      <div class="muted" style="margin-top:4px">Team of ${def.teamSize} · ${reqStats} · ${fmtTime(def.durationSec)} · ⭐+${def.reward.rep}</div>
      <button class="btn btn-sm" style="margin-top:7px" data-act="assemble:${def.key}">Assemble team ▸</button></div>`;
  }
  // locked teaser
  const nextLocked = Object.values(C.MISSIONS).find((m) => !isUnlocked('missions', m.key));
  if (nextLocked) body += `<div class="card locked"><b>🔒 ${nextLocked.name}</b><div class="muted">${unlockHint('missions', nextLocked.key)}</div></div>`;
  return panelShell('Missions', 'Send a team, earn the big money', body);
}

// ---- building inspector modal ------------------------------------------
function renderModal() {
  const root = $('modal-root');
  const sel = S.ui.selected;
  if (sel?.type === 'building') {
    const b = S.buildings.find((x) => x.id === sel.id); const def = b && C.BUILDINGS[b.key];
    if (def) {
      const refund = Math.round(def.cost * C.ECONOMY.sellRefundFrac);
      root.innerHTML = `<div class="modal-scrim" data-act="closemodal"><div class="modal" data-stop>
        <div class="modal-head"><b>${def.glyph || ''} ${def.name}</b></div>
        <div class="modal-body"><div class="muted">${def.flavor}</div><div style="margin-top:8px">${def.desc || ''}</div>
        ${def.upkeep ? `<div class="muted" style="margin-top:6px">Upkeep $${def.upkeep}/day</div>` : ''}</div>
        <div class="modal-foot"><button class="btn btn-danger" data-act="removebld:${b.id}">Remove (+$${refund})</button><button class="btn" data-act="closemodal">Close</button></div>
      </div></div>`;
      return;
    }
  }
  root.innerHTML = '';
}

// ---- public -------------------------------------------------------------
export function refreshHud() { ensureUiState(); updateChrome(); }

export function refreshUI() {
  ensureUiState();
  updateChrome();
  const host = $('sidebar');
  switch (S.ui.panel) {
    case 'dogs': host.innerHTML = dogsPanel(); break;
    case 'market': host.innerHTML = marketPanel(); break;
    case 'missions': host.innerHTML = missionsPanel(); break;
    case 'build': default: host.innerHTML = buildPanel(); break;
  }
  renderModal();
  S.ui.dirty = false;
}

let toastClock = 0;
export function renderToasts(dt) {
  toastClock += dt;
  let changed = false;
  for (let i = S.ui.toasts.length - 1; i >= 0; i--) { S.ui.toasts[i].t += dt; if (S.ui.toasts[i].t >= S.ui.toasts[i].life) { S.ui.toasts.splice(i, 1); changed = true; } }
  const root = $('toasts');
  if (!root) return;
  const html = S.ui.toasts.slice().reverse().map((t) => `<div class="toast ${t.kind}">${esc(t.msg)}</div>`).join('');
  if (root.dataset.sig !== html) { root.innerHTML = html; root.dataset.sig = html; }
}

function showHelp() {
  const tips = C.TIPS.map((t) => `<li>${esc(t)}</li>`).join('');
  $('modal-root').innerHTML = `<div class="modal-scrim" data-act="closemodal"><div class="modal" data-stop>
    <div class="modal-head"><b>How to play</b></div>
    <div class="modal-body"><ul style="margin:0;padding-left:18px;line-height:1.7">${tips}</ul>
    <div class="help" style="margin-top:10px">Keys: 1-4 panels · Space pause · +/- speed · Esc cancel</div></div>
    <div class="modal-foot"><button class="btn btn-primary" data-act="closemodal">Got it</button></div></div></div>`;
}

// ---- delegated click handling ------------------------------------------
export function initUI() {
  ensureUiState();
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const [act, a, b] = el.dataset.act.split(':');
    // For the modal scrim, only close when the backdrop itself (or a close button) is the target.
    if (act === 'closemodal' && e.target !== el) return;
    handle(act, a, b, e);
    S.ui.dirty = true;
    refreshUI();
  });
  refreshUI();
}

function dog(id) { return S.dogs.find((d) => d.id === id); }

function handle(act, a, b, e) {
  switch (act) {
    case 'panel': setPanel(a === S.ui.panel ? null : a); break;
    case 'speed': S.speed = +a; S.paused = false; break;
    case 'pause': S.paused = !S.paused; break;
    case 'save': if (saveGame()) toast('Saved ✓', 'good', 1.6); break;
    case 'help': showHelp(); break;
    case 'reset': if (confirm('Start a brand-new farm? This clears your current save.')) { newGame(); setPanel('build'); } break;
    case 'buyfood': buyFood(); break;
    case 'buildcat': S.ui.buildCat = a; clearBuildSelection(); break;
    case 'buildsel': setBuildSelection(a); break;
    case 'buy': buyDog(a, b === 'adult'); break;
    case 'feed': feedDog(dog(a)); break;
    case 'play': playWithDog(dog(a)); break;
    case 'feedall': feedAll(); break;
    case 'playall': playWithAll(); break;
    case 'treat': treatDog(dog(a)); break;
    case 'treatall': treatAllSick(); break;
    case 'train': trainDog(dog(a), b); break;
    case 'sell': { const d = dog(a); if (d && confirm(`Sell ${d.name} for $${sellPrice(d)}?`)) sellDog(d); break; }
    case 'selectdog': select('dog', a); break;
    case 'breedpick': {
      const i = S.ui.breedPick.indexOf(a);
      if (i >= 0) S.ui.breedPick.splice(i, 1);
      else { S.ui.breedPick.push(a); if (S.ui.breedPick.length > 2) S.ui.breedPick.shift(); }
      break;
    }
    case 'breedgo': { const [x, y] = S.ui.breedPick.map(dog); if (breedDogs(x, y)) S.ui.breedPick = []; break; }
    case 'breedclear': case 'breedclr': S.ui.breedPick = []; break;
    case 'assemble': S.ui.assignMission = a; S.ui.assignTeam = []; break;
    case 'cancelassemble': S.ui.assignMission = null; S.ui.assignTeam = []; break;
    case 'teampick': {
      const def = C.MISSIONS[S.ui.assignMission]; if (!def) break;
      const i = S.ui.assignTeam.indexOf(a);
      if (i >= 0) S.ui.assignTeam.splice(i, 1);
      else if (S.ui.assignTeam.length < def.teamSize) S.ui.assignTeam.push(a);
      break;
    }
    case 'launch': startMission(a, S.ui.assignTeam); break;
    case 'removebld': removeBuilding(a); select(null); break;
    case 'closemodal': select(null); $('modal-root').innerHTML = ''; break;
  }
}
