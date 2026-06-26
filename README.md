# 🐺❄️ Husky Farm Tycoon

Build a snowed-in homestead at the edge of the North, raise and breed a yard full of huskies you
genuinely care about, and watch the world fall in love with them too. It is **Dinosaur Park
Tycoon, but a husky farm**: start with a blank plot, build your cabin, adopt dogs, keep them fed
and happy, and earn money two ways. **Tourists** wander in and pay to meet your dogs (passive
income that scales with your farm's appeal), and **sled teams** you send out on missions and races
pay in bursts, all the way up to the legendary **Serum Run**.

A cozy sibling to [elvis-escape](https://github.com/ross-code/elvis-escape),
[elvis-fpv](https://github.com/ross-code/elvis-fpv),
[paws-of-fury](https://github.com/ross-code/paws-of-fury), and
[elvis-sled-racing](https://github.com/ross-code/elvis-sled-racing). Top-down 2D, drawn entirely
with HTML5 Canvas (no image assets), vanilla JS, no build step. Just open it.

**▶ Play:** _(enable GitHub Pages on this repo, see below)_

---

## How to play

1. **Build the Keeper's Cabin.** It is your HQ and your first required build. Pick it in the Build
   panel, then click the snowy farm to place it.
2. **Adopt a husky** from the Market. Puppies are cheaper and grow into their potential; adults
   cost more but can work right away.
3. **Care for your dogs.** Keep them fed (buy food, the farm auto-feeds daily) and happy. Happy
   dogs draw bigger crowds and train faster.
4. **Open for tourists.** Build an Overlook Deck and other attractions to raise your farm's appeal.
   Tourists pay you passively all day, which covers the bills.
5. **Run missions.** Send a rested team from the Missions board. Success depends on your team's
   stats versus the mission's demands, plus a little luck. Missions are how you actually grow.
6. **Grow the Hollow.** Earn reputation to unlock breeding, training, rare breeds, grand
   attractions, and harder races, ending with the **Serum Run** (finish it to welcome **Elvis**,
   the Legend of the Hollow, to your farm).

It is cozy by design. Nobody starves, nobody is lost. The worst that happens is a grumpy dog and a
slow tourist day.

### The four dog stats
- **Speed** wins sprints and races.
- **Stamina** carries the long expeditions (and your tired-est dog drags the whole team, so keep
  the roster balanced).
- **Strength** hauls the heavy freight jobs.
- **Temperament** makes a dog easy to train and a tourist favorite.

### Controls

| Action | Mouse | Keyboard |
|---|---|---|
| Switch panels (Build / Dogs / Market / Missions) | click the bottom tabs | `1` `2` `3` `4` |
| Place a building | pick it, then click the farm | — |
| Cancel placement / deselect | right-click | `Esc` |
| Select a dog or building | click it on the farm | — |
| Pause / resume | the ⏸ button | `Space` |
| Game speed (1× / 2× / 3×) | the ▶ buttons | `+` / `-` |
| Save | the 💾 button | (also autosaves daily) |

Paths and lantern posts support **click-drag** to paint a run of tiles.

---

## Run it locally

It is static files, no dependencies needed to play. ES modules must be served over HTTP, so opening
`index.html` directly via `file://` will not work. Any static server works:

```bash
npm run dev          # -> http://localhost:5174
# or
npx serve .
```

Then open the printed URL.

## Deploy (GitHub Pages)

1. Push to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`,
   folder `/ (root)`.
3. The game will be live at `https://<user>.github.io/husky-farm-tycoon/`.

---

## Project layout

```
index.html          # shell: canvas + HUD/panel containers + start screen
css/style.css        # all UI chrome (HUD, panels, cards, toasts, modal)
src/
  config.js          # all game DATA + tuning: breeds, buildings, missions, milestones, copy, palette
  state.js           # the single state object, new-game setup, localStorage save/load, UI/FX helpers
  util.js            # math/format helpers (no game state)
  economy.js         # money, farm appeal, tourist income, daily upkeep, dog valuation
  dogs.js            # dog model, vitals/aging, training, breeding, buy/sell
  buildings.js       # grid placement, removal, spatial helpers
  missions.js        # assemble a team, resolve success/fail, pay out
  entities.js        # visual life: tourists arriving/wandering, idle dogs roaming
  render.js          # draws the whole farm: snow, cabins, huskies, tourists, day/night, effects
  input.js           # pointer + keyboard
  ui.js              # DOM HUD + the four side panels
  game.js            # orchestrator: start screen, main loop, time, milestones, autosave
SPEC.md              # the module contract
DESIGN.md            # full game design (mechanics, economy, art, canon)
```

## Roadmap

The foundation is built to extend: path-connectivity puzzles for tourist routing, a Genetics Lab
for chasing a perfect dog, weather events (blizzard / aurora), staff, plot expansion, and more
rotating expeditions after the Serum Run.

## Credits

Set in **Lantern Hollow**, in the same cold country as the Snow Run. Inspired by the 1925 serum run
to Nome (Balto and Togo). Starring **Elvis** 🐺. Made with HTML5 Canvas and vanilla JavaScript.
