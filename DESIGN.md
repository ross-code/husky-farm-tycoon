# Husky Farm Tycoon — Design

Synthesized from five design passes (mechanics, economy, art, UX, canon). This documents what the
game actually ships; all tunable values live in `src/config.js`.

## Premise
You are the new keeper of **Lantern Hollow**, a snowed-in homestead in the same cold country as the
Snow Run sled trails. Turn an empty plot into the most beloved husky farm in the North: build a
home, raise and breed huskies, draw tourists, and send teams down the trail.

## Core loop
Check dog vitals → feed/play/train the ones who need it → glance at tourist income ticking up → if
a team is rested, launch a mission → spend the payout on a building or a new dog → optimize → repeat.
Two income engines feed each other: **tourists** (passive, scales with appeal; covers upkeep) and
**missions** (bursts; the real growth engine, gated by dog energy so they can't be spammed).

## Time
1 sim tick = 1 in-game second. 1 day = 120 in-game seconds (~2 real minutes at 1×). First 62% of a
day is daylight (tourists pay); night dims the world and dogs rest faster. Speed: pause / 1× / 2× / 3×.

## Economy (starting cash $600, cabin $250)
- **Tourist income/day** = appeal × yield × repBonus × dogFactor × happyFactor × spendMult, paid
  continuously during daylight. Appeal = base + building appeal (decor capped at +30) + dog charm.
- **Upkeep/day** = building upkeep + food (6 units/dog/day, discounted by Larders). Net-per-day is
  shown live in the HUD so over-building is felt immediately.
- Anti-stuck: cheap always-available missions, fail-consolation cash, and food auto-buy keep the
  player from a dead end. Soft caps (decor, dog count, happiness factor) stop tourists alone from
  winning the game.

## Dogs (stats 1–100: Speed, Stamina, Strength, Temperament)
Eight breeds, each with a stat personality, charisma (tourist charm), rarity and price:
Alaskan Husky, Siberian Husky, Samoyed, Alaskan Malamute, Greenland Dog, Chinook, Eurohound, and
the legendary **Elvis** (awarded for finishing the Serum Run). Puppies start low and grow toward
their inherited potential; adults train toward potential at the Practice Yard. Breeding two adult
opposite-sex dogs at the Whelping Den blends parent potentials with variation (rare prodigy rolls),
on a cooldown.

## Buildings (7 categories)
House (Keeper's Cabin, Grand Lodge), Kennels (The Snug, Cedar Kennels, Aurora Lodge), Food (The
Larder), Training (Practice Yard), Breeding (Whelping Den), Tourism (Overlook Deck, Pawprint Point,
Trading Post, Cocoa Cabin, Storyteller's Fire) and Decor (Lantern Post, Path Tile, Balto's Bench,
Snow Garden). House first; capacity gates how many dogs you can own.

## Missions (real-seconds at 1×; success = team stats vs difficulty + luck)
The Trailhead Board, The Mailbag Trot, Frostberry Gather, Lantern Loop, The Whistling Pass,
Timberline Haul, The Moonlit Mail, Aurora Dash, The Iron Ridge, Blizzard Relay, and the capstone
**The Serum Run** (Nenana to Nome). Each focuses different stats; teams return tired and must rest.

## Milestones (reputation spine, with action gates)
M0 build the cabin · M1 rep 30 (training, food store, photo spot, uncommon breeds) · M2 rep 90 + 2
adults (breeding, gift shop, freight missions) · M3 rep 180 + 3 wins (cafe, amphitheater, rare
breeds, festival races) · M4 rep 350 + 6 dogs (grand lodge, Eurohound, endurance races) · M5 rep
600 (the Serum Run).

## Art (top-down 2D canvas, no image assets)
Cozy, soft, rounded; light from top-left. Snow drawn with soft radial drifts + sparkle grain.
Huskies built from ellipses with per-breed coat/mask/eye colors and a mood rig (ears, tail-sway,
eyes, gait). Wooden cabins per building category, small upright tourists, falling snow, a continuous
day/night tint, and juicy feedback (coin pops, hearts, sparkles, floating text).
