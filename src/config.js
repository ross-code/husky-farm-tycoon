// config.js — all game DATA and tuning. Synthesized from the design memos
// (mechanics, economy, art, ux, canon). Setting: "Lantern Hollow", a cozy snowed-in
// homestead in the same cold country as the Snow Run sled trails. Change values here to retune.

import { titleize } from './util.js';

// ---- world grid ---------------------------------------------------------
export const GRID = { cols: 20, rows: 13, tile: 48 };   // world = 960 x 624 px

// ---- art palette (from the art-direction memo) --------------------------
export const PALETTE = {
  snow: '#EAF1F7', snowHi: '#F6FAFD', snowShade: '#CBD9E6', snowShadeDeep: '#AEC2D4',
  ice: '#9CC4DB', iceHi: '#CDE6F2', path: '#B98F63', pathHi: '#CDA679', pathEdge: '#8E6A45',
  wood: '#A9743F', woodHi: '#C68C53', woodDk: '#7E5631',
  roofRed: '#B5413A', roofRedHi: '#D2574E', roofSnow: '#E7EEF4',
  roofBlue: '#3E6E8E', roofGreen: '#4E7E5A', roofPurple: '#6E5C9E', stone: '#8C949C',
  brand: '#FF7A3D', brandDeep: '#E2611F', teal: '#2DB6A5', gold: '#FFC447', danger: '#E0544E',
  ink: '#3A3026',
  // day/night overlay tints (rgba strings applied over the world layer)
  night: 'rgba(36,54,110,0.46)', dusk: 'rgba(255,138,92,0.20)', dawn: 'rgba(255,196,137,0.16)',
};

// ---- coats & masks (husky look) -----------------------------------------
export const COATS = {
  gray:       { base: '#8A8F96', belly: '#F3F1EC', saddle: '#5E646C', eye: 'blue' },
  blackwhite: { base: '#454B52', belly: '#F4F2ED', saddle: '#2E343A', eye: 'brown' },
  redcopper:  { base: '#B5784A', belly: '#F2E7D6', saddle: '#8A552E', eye: 'amber' },
  agouti:     { base: '#6E6357', belly: '#D9CFBE', saddle: '#473F35', eye: 'brown' },
  sable:      { base: '#9C7A52', belly: '#EDE0CC', saddle: '#6E5232', eye: 'brown' },
  whitepure:  { base: '#E9ECEF', belly: '#FBFCFD', saddle: '#CDD4DB', eye: 'blue' },
  elvis:      { base: '#6F757C', belly: '#FFFFFF', saddle: '#3D434A', eye: 'hetero' },
};
export const EYE_COLORS = { blue: '#5FB6E6', brown: '#6B4A2B', amber: '#C8862E', green: '#6FA86A' };
export const MASKS = ['classic', 'bandit', 'brows', 'splitface', 'open'];

// ---- economy & tuning ---------------------------------------------------
export const ECONOMY = {
  startingCash: 600,
  startingReputation: 5,
  startingFood: 60,

  tickSeconds: 1,            // one sim tick = 1 in-game second (at 1x)
  dayLengthSeconds: 120,     // one in-game day = 120 in-game seconds (~2 real min @1x)
  dayFraction: 0.62,         // first 62% of a day is daylight; rest is night

  // food
  foodPerDogPerDay: 6,
  foodUnitCost: 1.2,
  foodBuyBatch: 60,

  // tourists / appeal
  appealBase: 5,             // the Keeper's Cabin radiates a little appeal
  appealDecorCap: 30,
  touristYield: 1.05,        // $/appeal/day base
  touristMaxOnFarm: 26,

  // dogs
  puppyToAdultDays: 5,
  veteranDays: 45,
  breedCooldownDays: 2,
  energyRegenPerDay: 42,     // base recovery while idle at home
  kennelRegenBonus: 0.6,     // +60% recovery if kennels exist
  hungerDecayPerDay: 70,     // hunger drops this much/day if not fed
  happyDriftPerDay: 18,      // happiness drifts toward 50 by this much/day
  happyPerFeed: 8,           // happiness gained per manual feed

  // training
  trainCostBase: 55,
  trainEnergyCost: 16,
  trainGainBase: 7,          // points toward potential per train action (scaled near cap)

  // economy nets
  sellRefundFrac: 0.5,       // building refund on remove
  dogSellFrac: 0.6,          // dog resale fraction of market value
  bankruptcyFloor: 30,       // buy buttons block below this
};

// ---- dog breeds (stats on a 1..100 scale; baseStats are the soft potential cap) ----
// charisma multiplies tourist appeal contribution.
export const BREEDS = {
  alaskan_husky:   { key: 'alaskan_husky',   name: 'Alaskan Husky',   rarity: 'common',    price: 180, charisma: 1.0, coat: 'agouti',     baseStats: { speed: 70, stamina: 72, strength: 55, temperament: 58 }, unlocked: true,  flavor: 'The all-rounder racer. A dependable first dog.' },
  siberian_husky:  { key: 'siberian_husky',  name: 'Siberian Husky',  rarity: 'common',    price: 210, charisma: 1.3, coat: 'gray',       baseStats: { speed: 72, stamina: 58, strength: 52, temperament: 80 }, unlocked: true,  flavor: 'Crowd favorite. Big smile, quick feet, easy to train.' },
  samoyed:         { key: 'samoyed',         name: 'Samoyed',         rarity: 'uncommon',  price: 350, charisma: 1.7, coat: 'whitepure',  baseStats: { speed: 48, stamina: 56, strength: 42, temperament: 92 }, unlocked: false, flavor: 'The smile that pays the bills. Weak racer, enormous tourist charm.' },
  alaskan_malamute:{ key: 'alaskan_malamute',name: 'Alaskan Malamute',rarity: 'uncommon',  price: 430, charisma: 1.1, coat: 'blackwhite', baseStats: { speed: 44, stamina: 74, strength: 92, temperament: 60 }, unlocked: false, flavor: 'Freight powerhouse. Slow, but pulls anything.' },
  greenland_dog:   { key: 'greenland_dog',   name: 'Greenland Dog',   rarity: 'rare',      price: 720, charisma: 0.9, coat: 'sable',      baseStats: { speed: 58, stamina: 93, strength: 80, temperament: 42 }, unlocked: false, flavor: 'Iron endurance for the long expeditions. Stubborn to train.' },
  chinook:         { key: 'chinook',         name: 'Chinook',         rarity: 'rare',      price: 820, charisma: 1.2, coat: 'redcopper',  baseStats: { speed: 62, stamina: 78, strength: 78, temperament: 84 }, unlocked: false, flavor: 'A premium team dog: balanced, calm, and willing.' },
  eurohound:       { key: 'eurohound',       name: 'Eurohound',       rarity: 'very_rare', price: 1200,charisma: 1.0, coat: 'blackwhite', baseStats: { speed: 96, stamina: 64, strength: 58, temperament: 60 }, unlocked: false, flavor: 'Pure sprint specialist. The fastest dog on the trail.' },
  elvis:           { key: 'elvis',           name: 'Elvis',           rarity: 'legendary', price: 0,   charisma: 2.0, coat: 'elvis',      baseStats: { speed: 90, stamina: 90, strength: 86, temperament: 99 }, unlocked: false, flavor: 'The Legend of the Hollow. Elite in everything. Earned, never bought.' },
};

// ---- buildings ----------------------------------------------------------
// category: house | kennel | food | training | breeding | tourist | decor
// capacity = dog housing. appeal = tourist appeal. spendMult = tourist spend multiplier.
// enables: 'train' | 'breed'. foodDiscount: fraction off food upkeep. happyAura: +happiness/day to nearby.
export const BUILDINGS = {
  keepers_cabin:   { key: 'keepers_cabin',   name: "The Keeper's Cabin", category: 'house',    cost: 250, size: { w: 3, h: 3 }, capacity: 3, appeal: 6,  upkeep: 2,  roof: 'roofRed',    glyph: '🏠', unlocked: true,  flavor: 'Your home and the heart of the Hollow. Build it first.', desc: 'HQ. +3 dog housing. Unlocks everything.' },
  the_snug:        { key: 'the_snug',        name: 'The Snug',           category: 'kennel',   cost: 150, size: { w: 2, h: 2 }, capacity: 4, appeal: 2,  upkeep: 3,  roof: 'roofBlue',   glyph: '🛖', unlocked: true,  flavor: 'A small warm kennel for tired paws.', desc: '+4 dog housing. Dogs rest here.' },
  cedar_kennels:   { key: 'cedar_kennels',   name: 'Cedar Kennels',      category: 'kennel',   cost: 320, size: { w: 2, h: 2 }, capacity: 7, appeal: 3,  upkeep: 6,  roof: 'roofBlue',   glyph: '🏘️', unlocked: false, flavor: 'Roomier housing as the pack grows.', desc: '+7 dog housing.' },
  aurora_lodge:    { key: 'aurora_lodge',    name: 'Aurora Lodge',       category: 'kennel',   cost: 700, size: { w: 2, h: 2 }, capacity: 6, appeal: 7,  upkeep: 9,  roof: 'roofPurple', glyph: '🏔️', unlocked: false, happyAura: 6, flavor: 'Premium housing. Happy dogs, happy farm.', desc: '+6 housing and a happiness aura.' },
  grand_lodge:     { key: 'grand_lodge',     name: 'Grand Lodge',        category: 'house',    cost: 3000,size: { w: 3, h: 3 }, capacity: 9, appeal: 14, upkeep: 14, roof: 'roofRed',    glyph: '🏰', unlocked: false, flavor: 'A capstone lodge. The Hollow has truly arrived.', desc: '+9 housing and big appeal.' },

  the_larder:      { key: 'the_larder',      name: 'The Larder',         category: 'food',     cost: 300, size: { w: 2, h: 2 }, capacity: 0, appeal: 1,  upkeep: 0,  foodDiscount: 0.15, roof: 'roofGreen', glyph: '🦴', unlocked: false, flavor: 'A stocked food store cuts the feed bill.', desc: '-15% food cost (stacks to -30%).' },
  practice_yard:   { key: 'practice_yard',   name: 'The Practice Yard',  category: 'training', cost: 400, size: { w: 3, h: 3 }, capacity: 0, appeal: 2,  upkeep: 8,  enables: 'train', roof: 'roofGreen', glyph: '🎓', unlocked: false, flavor: 'Where good dogs become great ones.', desc: 'Enables training dog stats.' },
  whelping_den:    { key: 'whelping_den',    name: 'The Whelping Den',   category: 'breeding', cost: 500, size: { w: 3, h: 3 }, capacity: 0, appeal: 2,  upkeep: 6,  enables: 'breed', roof: 'roofPurple', glyph: '💕', unlocked: false, flavor: 'Warm and lantern-lit, where new pups arrive.', desc: 'Enables breeding two adult dogs.' },

  overlook_deck:   { key: 'overlook_deck',   name: 'The Overlook Deck',  category: 'tourist',  cost: 250, size: { w: 2, h: 2 }, capacity: 0, appeal: 12, upkeep: 5,  roof: 'roofBlue',   glyph: '🔭', unlocked: true,  flavor: 'Tourists gather to watch the dogs at play.', desc: '+12 appeal. Your first income.' },
  pawprint_point:  { key: 'pawprint_point',  name: 'Pawprint Point',     category: 'tourist',  cost: 180, size: { w: 1, h: 2 }, capacity: 0, appeal: 7,  upkeep: 3,  roof: 'roofGreen',  glyph: '📸', unlocked: false, flavor: 'A photo spot. Charismatic dogs draw a crowd.', desc: '+7 appeal.' },
  trading_post:    { key: 'trading_post',    name: 'The Trading Post',   category: 'tourist',  cost: 650, size: { w: 2, h: 2 }, capacity: 0, appeal: 18, upkeep: 12, spendMult: 1.2, roof: 'roofRed', glyph: '🛍️', unlocked: false, flavor: 'A gift shop. Visitors love a souvenir.', desc: '+18 appeal and +20% tourist spend.' },
  cocoa_cabin:     { key: 'cocoa_cabin',     name: 'The Cocoa Cabin',    category: 'tourist',  cost: 900, size: { w: 3, h: 2 }, capacity: 0, appeal: 25, upkeep: 18, spendMult: 1.35, roof: 'roofGreen', glyph: '☕', unlocked: false, flavor: 'Hot cocoa keeps the crowd lingering.', desc: '+25 appeal and +35% tourist spend.' },
  storytellers_fire:{key: 'storytellers_fire',name: "Storyteller's Fire", category: 'tourist',  cost: 750, size: { w: 2, h: 2 }, capacity: 0, appeal: 30, upkeep: 10, roof: 'roofRed',   glyph: '🔥', unlocked: false, flavor: 'Tales of Elvis draw a hushed, paying crowd.', desc: '+30 appeal.' },

  lantern_post:    { key: 'lantern_post',    name: 'Lantern Post',       category: 'decor',    cost: 40,  size: { w: 1, h: 1 }, capacity: 0, appeal: 2,  upkeep: 0,  roof: 'gold',       glyph: '🏮', unlocked: true,  flavor: 'The namesake light. Pretty at night.', desc: '+2 appeal (decor capped).' },
  path_tile:       { key: 'path_tile',       name: 'Path Tile',          category: 'decor',    cost: 15,  size: { w: 1, h: 1 }, capacity: 0, appeal: 0.5,upkeep: 0,  roof: 'path',       glyph: '·',  unlocked: true,  flavor: 'Tourists love a tidy trail.', desc: '+0.5 appeal. Walkable.' },
  baltos_bench:    { key: 'baltos_bench',    name: "Balto's Bench",      category: 'decor',    cost: 120, size: { w: 1, h: 1 }, capacity: 0, appeal: 4,  upkeep: 0,  roof: 'roofBlue',   glyph: '🪑', unlocked: false, flavor: 'A little memorial bench by the trailhead.', desc: '+4 appeal.' },
  snow_garden:     { key: 'snow_garden',     name: 'Snow Garden',        category: 'decor',    cost: 400, size: { w: 2, h: 2 }, capacity: 0, appeal: 15, upkeep: 0,  roof: 'teal',       glyph: '🌲', unlocked: false, flavor: 'Spruce, lights, and screenshot magic.', desc: '+15 appeal.' },
};

// ---- missions (duration is REAL seconds at 1x; focus weights sum ~1) -----
export const MISSIONS = {
  trailhead_board: { key: 'trailhead_board', name: 'The Trailhead Board', type: 'errand',   difficulty: 50,  teamSize: 1, focus: { temperament: 0.5, stamina: 0.5 },                         durationSec: 28, energyCost: 18, reward: { cash: 110, rep: 4,  xp: 10 }, unlocked: true,  repeatable: true, flavor: 'Odd jobs posted by passing travelers. Always something to do.' },
  mailbag_trot:    { key: 'mailbag_trot',    name: 'The Mailbag Trot',    type: 'tutorial',  difficulty: 42,  teamSize: 1, focus: { temperament: 0.6, speed: 0.4 },                            durationSec: 24, energyCost: 16, reward: { cash: 100, rep: 6,  xp: 12 }, unlocked: true,  flavor: 'Deliver the morning mail to the next cabin over. Easy money, good practice.' },
  frostberry_gather:{key: 'frostberry_gather',name: 'Frostberry Gather',  type: 'errand',    difficulty: 60,  teamSize: 1, focus: { stamina: 0.7, temperament: 0.3 },                         durationSec: 32, energyCost: 22, reward: { cash: 150, rep: 8,  xp: 14 }, unlocked: false, flavor: 'The berries up the ridge are ripe. Send a calm team to haul them back.' },
  lantern_loop:    { key: 'lantern_loop',    name: 'Lantern Loop',        type: 'race',      difficulty: 78,  teamSize: 2, focus: { speed: 0.8, stamina: 0.2 },                               durationSec: 36, energyCost: 26, reward: { cash: 220, rep: 12, xp: 16 }, unlocked: false, flavor: 'A friendly lap around the Hollow for the weekend crowd.' },
  whistling_pass:  { key: 'whistling_pass',  name: 'The Whistling Pass',  type: 'trail',     difficulty: 110, teamSize: 2, focus: { stamina: 0.5, speed: 0.5 },                               durationSec: 46, energyCost: 32, reward: { cash: 320, rep: 16, xp: 20 }, unlocked: false, flavor: 'Wind sings through the pass. Keep moving and clear it by dusk.' },
  timberline_haul: { key: 'timberline_haul', name: 'Timberline Haul',     type: 'cargo',     difficulty: 150, teamSize: 3, focus: { strength: 0.7, stamina: 0.3 },                            durationSec: 56, energyCost: 40, reward: { cash: 500, rep: 22, xp: 26 }, unlocked: false, flavor: 'A trapper needs lumber moved before the thaw. Heavy load, good pay.' },
  moonlit_mail:    { key: 'moonlit_mail',    name: 'The Moonlit Mail',    type: 'night',     difficulty: 185, teamSize: 3, focus: { temperament: 0.5, stamina: 0.5 },                         durationSec: 60, energyCost: 44, reward: { cash: 640, rep: 28, xp: 30 }, unlocked: false, flavor: 'The mail route, after dark. Steady nerves required.' },
  aurora_dash:     { key: 'aurora_dash',     name: 'Aurora Dash',         type: 'race',      difficulty: 215, teamSize: 3, focus: { speed: 0.6, temperament: 0.4 },                           durationSec: 60, energyCost: 48, reward: { cash: 780, rep: 34, xp: 34 }, unlocked: false, flavor: 'Race under the northern lights while the whole town cheers.' },
  iron_ridge:      { key: 'iron_ridge',      name: 'The Iron Ridge',      type: 'endurance', difficulty: 300, teamSize: 4, focus: { stamina: 0.6, strength: 0.4 },                            durationSec: 80, energyCost: 55, reward: { cash: 1150, rep: 50, xp: 45 }, unlocked: false, flavor: 'Long, cold, and unforgiving. Only seasoned teams finish.' },
  blizzard_relay:  { key: 'blizzard_relay',  name: 'Blizzard Relay',      type: 'hard',      difficulty: 360, teamSize: 4, focus: { speed: 0.25, stamina: 0.25, strength: 0.25, temperament: 0.25 }, durationSec: 92, energyCost: 60, reward: { cash: 1600, rep: 70, xp: 55 }, unlocked: false, flavor: 'Snow so thick you run on trust. The team must be in sync.' },
  serum_run:       { key: 'serum_run',       name: 'THE SERUM RUN',       type: 'capstone',  difficulty: 500, teamSize: 5, focus: { stamina: 0.4, speed: 0.3, strength: 0.2, temperament: 0.1 }, durationSec: 120, energyCost: 72, reward: { cash: 4000, rep: 200, xp: 100 }, unlocked: false, awardsElvis: true, flavor: 'Nenana to Nome. Medicine on the line. The run they still tell stories about.' },
};

// ---- milestones (check is a pure function of S; unlocks applied generically by game.js) ----
const adults = (S) => S.dogs.filter((d) => d.stage === 'adult').length;
export const MILESTONES = [
  { key: 'm0_homestead', name: 'Homestead', desc: 'Build the Keeper\'s Cabin.',
    check: (S) => S.buildings.some((b) => BUILDINGS[b.key]?.category === 'house'),
    unlocks: {}, toast: 'Welcome to Lantern Hollow, Keeper. Now bring home a dog!' },
  { key: 'm1_open', name: 'Open for Visitors', desc: 'Reach reputation 30.',
    check: (S) => S.reputation >= 30,
    unlocks: { buildings: ['the_larder', 'practice_yard', 'pawprint_point', 'cedar_kennels', 'baltos_bench'], breeds: ['samoyed', 'alaskan_malamute'], missions: ['frostberry_gather', 'lantern_loop'] },
    toast: 'Word is spreading. Training, a food store, and new breeds are open.' },
  { key: 'm2_breeders', name: "Breeders' License", desc: 'Reputation 90 and 2 adult dogs.',
    check: (S) => S.reputation >= 90 && adults(S) >= 2,
    unlocks: { buildings: ['whelping_den', 'trading_post'], missions: ['whistling_pass', 'timberline_haul'] },
    toast: 'You can breed your own dogs now, and bigger jobs are posted.' },
  { key: 'm3_destination', name: 'Destination Farm', desc: 'Reputation 180 and 3 mission wins.',
    check: (S) => S.reputation >= 180 && S.missions.wonCount >= 3,
    unlocks: { buildings: ['cocoa_cabin', 'storytellers_fire', 'aurora_lodge', 'snow_garden'], breeds: ['greenland_dog', 'chinook'], missions: ['moonlit_mail', 'aurora_dash'] },
    toast: 'The Hollow is a real attraction. Rare breeds and grand attractions unlocked.' },
  { key: 'm4_outfitter', name: 'Expedition Outfitter', desc: 'Reputation 350 and 6 dogs.',
    check: (S) => S.reputation >= 350 && S.dogs.length >= 6,
    unlocks: { buildings: ['grand_lodge'], breeds: ['eurohound'], missions: ['iron_ridge', 'blizzard_relay'] },
    toast: 'Serious expeditions await. The Grand Lodge and the Eurohound are yours to claim.' },
  { key: 'm5_legend', name: 'Legend of the North', desc: 'Reach reputation 600.',
    check: (S) => S.reputation >= 600,
    unlocks: { missions: ['serum_run'] },
    toast: "Old Pekka leaves a worn map on your porch. 'You're ready for the big one. Nenana to Nome.'" },
];

// ---- copy: dog name pool, tips, flavor (all em-dash-free, publish-safe) ----
export const DOG_NAMES = ['Nanook', 'Saxon', 'Juno', 'Maple', 'Togo', 'Biscuit', 'Cricket', 'Pepper', 'Sergeant', 'Aurora', 'Frost', 'Birch', 'Willow', 'Scout', 'Koda', 'Luna', 'Bandit', 'Cocoa', 'Misty', 'Atlas', 'Sky', 'Tundra', 'Ember', 'Pippin', 'Yukon', 'Clover'];

export const TIPS = [
  'Build the Keeper\'s Cabin first. Everything else opens up once you have a home.',
  'Adopt your first husky from the Market, then keep it fed and happy.',
  'The Overlook Deck brings tourists who pay you passively all day long.',
  'Tourists cover the bills. Missions are how you actually grow. Run them often.',
  'A team is only as strong as its tired-est dog. Rest them between missions.',
  'Train at the Practice Yard to push a dog toward its breed potential.',
  'Two grown dogs you love? The Whelping Den makes pups that take after both.',
];

export const FLAVOR = {
  levelup: ['Word is spreading. The Hollow earned a little more shine.', 'Somewhere, a tourist is telling a friend about your dogs.', 'The Hollow grows. New blueprints unlocked at the cabin.'],
  adopt: ['{name} hopped off the sled, sniffed the snow, and decided this place will do.', 'Welcome home, {name}. Try not to chew the lantern posts.'],
  breed: ['New pup in the den. {a} and {b} are very proud.', '{pup} has {a}\'s speed and {b}\'s stubborn streak. Good luck.'],
  growup: ['{name} is all grown up and ready to pull. They grow so fast.'],
  win: ['The team\'s back, tongues out and tails high. {mission} is done.', 'Crowd went wild at the finish line. Cash and cheers, Keeper.', '{dog} led the whole way home. Give that dog an extra biscuit.'],
  lose: ['Tough run. The team made it home for cocoa and a nap.', 'Came up short this time. The trail will be there tomorrow.', 'No prize today, but {dog} ran their heart out. Rest up.'],
  care: ['{name} is giving you The Look. Probably hungry.', '{name} keeps glancing at the empty bowl. Subtle.'],
  serumWin: ['You ran the Serum Run and finished. They\'ll tell stories about the Hollow for years. Keeper, you did it.'],
  elvis: ['A silver husky trots out of the treeline like he owns the place. The legend himself. Elvis has come home to the Hollow.'],
};

// ---- lookups ------------------------------------------------------------
export const breed = (key) => BREEDS[key];
export const building = (key) => BUILDINGS[key];
export const mission = (key) => MISSIONS[key];
export const colorOf = (coatId) => COATS[coatId] || COATS.gray;
export const buildingName = (key) => BUILDINGS[key]?.name || titleize(key);

export const CATEGORIES = [
  { key: 'house', label: 'Home', ico: '🏠' },
  { key: 'kennel', label: 'Housing', ico: '🛖' },
  { key: 'food', label: 'Care', ico: '🦴' },
  { key: 'training', label: 'Train', ico: '🎓' },
  { key: 'breeding', label: 'Breed', ico: '💕' },
  { key: 'tourist', label: 'Tourism', ico: '🔭' },
  { key: 'decor', label: 'Decor', ico: '🏮' },
];
