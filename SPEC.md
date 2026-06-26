# Husky Farm Tycoon — Module Contract (authoritative)

A single-page HTML5 **Canvas** tycoon game, **vanilla ES modules**, no build step, no frameworks,
no network. Served over HTTP (a dev server); `file://` won't work because of ES modules.
`Math.random` is fine. Top-down 2D. Cozy snowy husky farm.

Files live under `src/`. **Each module owns exactly one file.** Do not edit files you don't own.
Match these signatures EXACTLY — `game.js` calls them by name and other modules import them.

## Dependency rule (prevents import cycles)
```
util.js        -> (nothing)
config.js      -> util
state.js       -> config, util
economy.js     -> state, config, util
dogs.js        -> state, config, util
buildings.js   -> state, config, util
missions.js    -> state, config, util, economy, dogs
entities.js    -> state, config, util
render.js      -> state, config, util            (+ may read config building/breed defs)
input.js       -> state, config, util, buildings (+ writes state.ui only)
ui.js          -> state, config, util, economy, dogs, buildings, missions
game.js        -> everything (orchestrator)
```
LEAF LOGIC (`economy`, `dogs`, `buildings`, `entities`) must NOT import `ui`, `input`, `render`,
`missions`, or each other. Cross-module coordination for UI happens **only through `state.ui`**:
`input.js` writes `state.ui` (selection, hover, build choice, assign team) and `ui.js`/`render.js`
read it. Never call into `ui.js` from logic modules — set `S.ui.dirty = true` instead.

## config.js (already-defined shape — authored separately, assume it exists)
Exports:
- `GRID = { cols, rows, tile }` — world is `cols*tile` × `rows*tile` pixels.
- `PALETTE` — hex colors: `snow, snowShade, snowLit, ice, path, night (overlay rgba), brand, ...`.
- `ECONOMY = { startingCash, startingReputation, startingFood, tickSeconds, dayLengthSeconds,
   foodPerDogPerDay, foodUnitCost, touristBase, touristPerAppeal, touristSpend, payPerTourist,
   upkeepGrace, ... }` (extra tuning fields allowed; read defensively with `?? default`).
- `BREEDS` — map `key -> { key, name, rarity, price, baseStats:{speed,stamina,strength,temperament},
   colors:{coat,belly,mask,eye}, flavor, unlocked }`. Stats are on a **1–100** scale.
- `BUILDINGS` — map `key -> { key, name, category, cost, size:{w,h}, capacity, appeal, upkeep,
   effects:{...}, color, accent, flavor, unlocked, desc }`. `category` ∈
   `house|kennel|food|training|breeding|tourist|decor`.
- `MISSIONS` — map `key -> { key, name, type, difficulty, requirements:{minSpeed?,minStamina?,
   minStrength?,minTemperament?,teamSize}, durationSec, energyCost, reward:{cash,rep,xp}, flavor, unlocked }`.
- `MILESTONES` — array `[{ key, name, desc, check:(S)=>bool, apply:(S)=>void }]`.
- `TIPS` — string[]. `FLAVOR` — `{ missionWin:[], missionLose:[], breed:[], ... }`.
- Lookups: `breed(key)`, `building(key)`, `mission(key)` return the def or undefined.

## state.js (already implemented — DO NOT MODIFY; just use it)
Exports the live singleton `S` plus: `newGame()`, `saveGame()`, `loadGame()`, `hasSave()`,
`clearSave()`, `idx/inBounds/cellAt`, `dogById/buildingById/activeMissionById`,
`buildingsByCategory(cat)`, `hasBuilding(key)`, `isUnlocked(kind,key)`, `unlock(kind,key)`,
`setPanel/setBuildSelection/clearBuildSelection/select`, `toast(msg,kind,life)`,
`pushFx(x,y,text,color,life)`, `grantXp(amount)`, `xpForLevel(lvl)`.
Key `S` fields: `cash, reputation, appeal, xp, level, food, time{day,tod,elapsed}, speed, paused,
grid{cols,rows,tile,cells[]}, buildings[], dogs[], tourists[], missions{available[],active[],
wonCount,lostCount,lastRollDay}, unlocks{buildings[],breeds[],missions[]}, milestones{done[]},
ui{panel,buildSelection,selected,hoverTile,assignTeam,assignMission,toasts[],dirty},
fx[], stats{}`.
**Toasts:** `kind` ∈ `info|good|warn|bad`. **kind colors** are styled in CSS.
**Coordinates:** world pixels. A grid cell (gx,gy) covers pixels `gx*tile..(gx+1)*tile`.

---

## economy.js — money + appeal + tourist income
- `canAfford(amount) -> bool`
- `spend(amount, label?) -> bool` — deduct if affordable, update `S.stats.totalSpent`, return success.
- `earn(amount, opts?) -> void` — add cash, `S.stats.totalEarned`; if `opts={x,y}` given, `pushFx`
  a `+$` coin pop at that world point.
- `computeAppeal() -> number` — recompute farm appeal from buildings (`appeal` fields, tourist
  buildings), dog count & average happiness; store in `S.appeal`; nudge `S.reputation` toward it.
- `tickEconomy(dt) -> void` — called every fixed sim tick (`dt` = in-game seconds). Generate tourist
  income proportional to appeal/reputation, active tourist count and dog happiness; pay out
  gradually (small coin pops are fine but throttle). Deduct any continuous costs here if used.
- `dailyUpkeep() -> void` — called once per in-game day rollover: charge food + building upkeep;
  consume `S.food` for dogs (auto-buy food if stock low, deducting cash); if cash can't cover,
  apply a happiness/reputation penalty (never hard-crash the player — warn via toast).
- `sellPrice(dog) -> number`, `dogMarketValue(dog) -> number` may live here or in dogs.js; if here,
  export them. (Pick one home; don't duplicate.)

## dogs.js — dog model, lifecycle, training, breeding
Dog shape (createDog returns this):
```
{ id, name, breedKey, sex:'M'|'F', ageDays, stage:'puppy'|'adult',
  stats:{ speed, stamina, strength, temperament },   // 1..100, current/effective
  potential:{ speed,stamina,strength,temperament },  // soft caps growth approaches
  hunger, happiness, health, energy,                 // 0..100
  missionId:null, breedCooldownDay:0,
  x, y, vx, vy, facing, animPhase, wanderTarget,      // visual fields for entities/render
  color:{coat,belly,mask,eye}, bornDay }
```
- `createDog(breedKey, { age?, name?, sex?, statBias? }) -> dog` — roll stats from breed baseStats
  with variation; puppies start lower with higher potential. Place `x,y` near the house/center.
- `buyPuppy(breedKey) -> dog|null` — checks unlock + capacity + cash via economy.spend; adds to
  `S.dogs`; toast; returns dog or null with a reason toast.
- `feedDog(dog)`, `playWithDog(dog)` — small cash/food cost, raise hunger satiation/happiness.
- `trainDog(dog, stat) -> bool` — costs cash + energy; nudges `stats[stat]` toward `potential[stat]`;
  needs a Training Yard built; respects energy.
- `canBreed(a,b) -> {ok, reason}` , `breedDogs(a,b) -> dog|null` — needs a Breeding Den; both adult,
  opposite sex, off cooldown, capacity available; child blends parent potentials + variation; sets
  cooldowns; `S.stats.dogsBred++`; toast a flavor line.
- `sellDog(dog) -> void` — remove from S.dogs (not if on a mission), `economy.earn` the sell price.
- `dogCapacity() -> number` — total kennel capacity from built kennels (sum of capacity).
- `housedCount() -> number` — `S.dogs.length`.
- `teamPower(dogs) -> {speed,stamina,strength,temperament,overall}` — average effective stats of a team.
- `tickDogs(dt) -> void` — per sim tick: age dogs (ageDays += dt/dayLen), promote puppy->adult at
  threshold (toast), drift hunger down, energy regen when home & not on mission, happiness from
  hunger/health/being fed, slow stat growth toward potential when well-cared-for.

## buildings.js — grid placement + building behavior
- `footprintCells(gx,gy,w,h) -> cells[]|null` — cells if all in-bounds & unoccupied, else null.
- `canPlace(key, gx, gy) -> {ok, reason}` — unlocked, affordable, in-bounds, not overlapping; the
  first house may be required before other builds (enforce: if no `category==='house'` exists, only
  a house may be placed) — return a clear reason.
- `placeBuilding(key, gx, gy) -> building|null` — validate, `economy.spend(cost)`, mark cells'
  `occupant`, push to `S.buildings`, set dust fx + toast, mark some neighbor cells as `path` terrain
  for tourist/kennel types if you like; return the building.
- `removeBuilding(id) -> void` — free cells, refund a fraction via economy.earn, remove (block if a
  house is the only one and dogs exist? keep simple: allow, warn).
- `centerOf(building) -> {x,y}` world pixel center; `doorOf(building) -> {x,y}` a sensible entry point.
- `touristAttractions() -> building[]` — category `tourist`.
- Helpers other modules use for spawning/pathing tourists and placing dogs near home.

## missions.js — the active money engine
- `rollAvailable() -> void` — populate `S.missions.available` with a few unlocked missions (respect
  unlocks; vary by reputation/level). Call on new day if `lastRollDay !== day`.
- `eligibleDogs() -> dog[]` — adults, not on a mission, energy above the mission minimum.
- `canStart(missionKey, dogIds) -> {ok, reason, successChance}` — team size matches requirements,
  dogs eligible, team stats vs requirements => a success probability (0..1).
- `startMission(missionKey, dogIds) -> instance|null` — move it to `S.missions.active` with
  `{ id, key, dogIds, startedDay, duration (real game-seconds = durationSec), elapsed:0,
  successChance }`; mark dogs `missionId`; toast.
- `tickMissions(dt) -> void` — advance `elapsed`; when complete, roll success vs chance, pay
  `economy.earn(reward.cash)`, `S.reputation += reward.rep`, `grantXp(reward.xp)`, drain dog energy
  by `energyCost`, free dogs (`missionId=null`), update won/lost counts, toast a FLAVOR line, pushFx.
- `missionStatus(instance) -> {pct, remaining}` for the UI.

## entities.js — visual life (dogs wandering + tourists)
- `spawnTourist() -> void` / `tickTourists(dt)` — tourists enter from an edge, wander toward
  attractions, linger, leave; population scales with appeal (cap it). Store in `S.tourists`
  as `{id,x,y,vx,vy,kind,color,t,life,state}`.
- `tickDogVisuals(dt) -> void` — wander idle dogs around their home/farm (gentle), update
  `x,y,facing,animPhase`; dogs on missions can be hidden or shown near the gate.
- `tickEntities(dt) -> void` — convenience that calls tourist + dog visual updates. game.js calls this.
- Keep counts performant (cap tourists ~ a few dozen).

## render.js — draw a frame (no state mutation except its own caches)
- `initRender(canvas) -> void` — grab 2d context, set up resize handling (canvas backing store =
  world size `cols*tile × rows*tile`; CSS scales to fit). Provide `screenToWorld(clientX,clientY)`
  on the exported object OR export a helper `screenToWorld(canvas, cx, cy)` for input.js.
- `render(now) -> void` — draw, in order: snow ground (per-cell tone variation), build-mode grid +
  placement ghost (valid/invalid tint from `S.ui.buildSelection`+`hoverTile`), buildings (sorted by
  gy for depth), dogs & tourists (sorted by y), selection highlight (`S.ui.selected`), particles
  (falling snow), floating `S.fx` texts, and a day/night tint from `S.time.tod`.
- Provide cute canvas-drawn huskies (per-breed coat/mask/eye colors, puppy vs adult size, simple
  idle/walk animation via `animPhase`), wooden cabins/sheds per building category & color, small
  tourists. Follow the ART direction in DESIGN.md.
- export `worldToScreen`/`screenToWorld` so input.js maps the mouse correctly under CSS scaling.

## input.js — pointer + keyboard (writes state.ui only)
- `initInput(canvas) -> void` — pointermove updates `S.ui.hoverTile` (during placement);
  click: if `S.ui.buildSelection` set, call `buildings.placeBuilding` at hover tile (stay in
  placement mode for chaining unless out of cash); else hit-test dogs/buildings and `select(...)`.
  Right-click / Escape: `clearBuildSelection()` or clear selection. Keyboard: `1..4` switch panels,
  `space` pause, `+/-` speed. Use render's `screenToWorld` for accurate mapping.

## ui.js — DOM HUD + panels (the only DOM-heavy module)
DOM containers exist in index.html: `#topbar`, `#sidebar`, `#bottombar`, `#toasts`, `#modal-root`.
- `initUI() -> void` — build the static structure & event handlers (panel tabs in `#bottombar`,
  speed/pause/save controls + resources in `#topbar`).
- `refreshUI() -> void` — called each frame when `S.ui.dirty` (clear it after). Re-render `#topbar`
  resources (cash, day, reputation, dogs x/cap, food, level), the active `#sidebar` panel:
  - BUILD: categorized palette of unlocked buildings w/ cost + lock/affordability state; clicking
    one calls `setBuildSelection(key)`.
  - DOGS: roster cards (name, breed, stage, stats bars, hunger/energy/happiness) + actions
    feed/train/breed/sell; selecting two enables breed.
  - MARKET: unlocked breeds w/ price + buy button (`dogs.buyPuppy`).
  - MISSIONS: available missions (requirements, reward, success chance) + a team picker
    (`S.ui.assignTeam` via clicks) + Launch; active missions w/ progress bars.
  - Also render the selected-entity detail when `S.ui.selected` is set.
- `renderToasts() -> void` — render `S.ui.toasts` into `#toasts` (game.js ages/removes them, or do
  it here with a timer; keep it simple and don't depend on missing fields).
- Keep handlers idempotent; rebuild innerHTML on refresh is acceptable for this scale, but preserve
  input focus where it matters (e.g. don't nuke an open text field every frame — only refresh on dirty).

## game.js — orchestrator (already implemented by the spine author)
Drives: start screen, fixed-step sim loop (`tickDogs, tickBuildings(if any), tickEconomy,
tickMissions` advanced by `speed`), day rollover (`economy.dailyUpkeep`, `missions.rollAvailable`,
milestone checks via `config.MILESTONES`), per-frame `tickEntities` + `render` + `refreshUI`,
autosave. Build agents do not edit game.js.

## Quality bar
Deterministic-free is fine. No console errors. Defensive reads (`?? default`) so missing optional
config fields don't crash. Cohesive, readable, commented like the surrounding code. The game must
actually be playable: build a house, buy/raise/breed dogs, run missions, earn from tourists, unlock
via milestones, save/reload.
