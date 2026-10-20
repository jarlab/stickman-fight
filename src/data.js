import { ARENA_PACK } from './arena-art.js';

export const WIDTH = 1280;
export const HEIGHT = 720;

export const ELEMENTS = {
  air: { name: 'Air', title: 'The wanderer', color: '#388e8b', description: 'Circle and evade. Rising palms lead into three aerial strikes and a descending heel.', special: 'Wind bolt', burst: 'Cyclone', speed: 210, hp: 100, damage: 14, knockback: 460, specialCost: 14, specialCooldown: 0.48, burstCost: 45, burstCooldown: 5 },
  water: { name: 'Water', title: 'The tidekeeper', color: '#397fbe', description: 'Yield and redirect. Draw foes into a rising sweep, then send them away with flowing palms.', special: 'Ice shard', burst: 'Healing tide', speed: 185, hp: 115, damage: 15, knockback: 320, specialCost: 18, specialCooldown: 0.6, burstCost: 45, burstCooldown: 6 },
  earth: { name: 'Earth', title: 'The sentinel', color: '#9a7935', description: 'Rooted power. An armored uppercut leads to a heavy air hammer and downward smash.', special: 'Boulder', burst: 'Seismic slam', speed: 160, hp: 145, damage: 22, knockback: 540, specialCost: 24, specialCooldown: 0.85, burstCost: 50, burstCooldown: 6 },
  fire: { name: 'Fire', title: 'The spark', color: '#c5573f', description: 'Direct pressure. A driving uppercut links into advancing flying kicks and a blazing heel.', special: 'Ember fan', burst: 'Flare nova', speed: 195, hp: 105, damage: 18, knockback: 380, specialCost: 18, specialCooldown: 0.46, burstCost: 50, burstCooldown: 5.5 },
};

// Original arena-scale speeds informed by LF2's walk/run ratios. Running
// commits forward: its depth steering is slower than walking (see investigation).
export const MOVEMENT = {
  runMultiplier: 1.8, walkDepth: .5, runDepth: .32,
  dashSpeed: 510, airDashSpeed: 620, recoveryRollSpeed: 560,
};

// Frame rhythms adapted from the LF2 investigation; simulation stays at 120 Hz.
// These are original moves, scaled for our arena, not imported character data.
const tick = 1 / 30;
const strike = (windup, active, recovery, reach, step, damage, knockback, stun, extra = {}) => ({ windup, active, recovery, reach, step, damage, knockback, stun, ...extra });
export const COMBAT = {
  air: { name: 'Rising wind', steps: [
    strike(2*tick, 2*tick, 4*tick, 84, 7, .85, 60, .30, { followThrough: 8, fall: 20 }),
    strike(2*tick, 2*tick, 4*tick, 93, 9, .95, 65, .33, { followThrough: 9, fall: 20 }),
    strike(3*tick, 3*tick, 7*tick, 106, 18, 1.3, 155, .55, { lift: 560, launcher: true, fall: 25 }),
  ] },
  water: { name: 'Tidal counter', steps: [
    strike(3*tick, 3*tick, 4*tick, 96, 6, .9, 55, .35, { followThrough: 4, fall: 20 }),
    strike(3*tick, 3*tick, 4*tick, 108, 7, 1, -105, .39, { followThrough: 3, fall: 20 }),
    strike(4*tick, 3*tick, 7*tick, 116, 12, 1.3, 160, .65, { freeze: .8, fall: 20 }),
  ] },
  earth: { name: 'Mountain breaker', steps: [
    strike(5*tick, 2*tick, 5*tick, 90, 7, .9, 65, .43, { followThrough: 4, fall: 25 }),
    strike(6*tick, 3*tick, 6*tick, 100, 9, 1.1, 75, .49, { armor: true, followThrough: 5, fall: 25 }),
    strike(7*tick, 3*tick, 9*tick, 120, 16, 1.65, 720, .65, { armor: true, knockdown: true, guardBreak: true, lift: 270, spike: 480, fall: 70 }),
  ] },
  fire: { name: 'Blazing rush', steps: [
    strike(2*tick, 3*tick, 4*tick, 80, 12, .85, 65, .31, { followThrough: 10, fall: 20 }),
    strike(2*tick, 3*tick, 4*tick, 92, 16, 1, 75, .34, { followThrough: 12, fall: 20 }),
    strike(4*tick, 3*tick, 7*tick, 108, 34, 1.5, 650, .55, { knockdown: true, lift: 210, fall: 70 }),
  ] },
};

// Original aerial routes informed by LF2's separate jump/dash attacks and
// authored launch/carry/downward vectors. Budgets and jump cancels are ours.
Object.assign(COMBAT.air, {
  launcher: strike(3*tick, 3*tick, 8*tick, 98, 12, 1.05, 75, .8, { pose: 'airLift', lift: 680, launcher: true, fall: 25 }),
  aerial: [
    strike(2*tick, 3*tick, 3*tick, 102, 10, .85, 45, .45, { pose: 'airPalm', lift: 360, selfLift: 340, fall: 0 }),
    strike(2*tick, 3*tick, 3*tick, 112, 12, .95, 60, .45, { pose: 'airHeel', lift: 340, selfLift: 320, fall: 0 }),
    strike(3*tick, 3*tick, 6*tick, 118, 14, 1.35, 180, .55, { pose: 'airHeel', spike: 680, knockdown: true, fall: 70 }),
  ],
});
Object.assign(COMBAT.water, {
  launcher: strike(4*tick, 3*tick, 8*tick, 112, 7, 1, -45, .85, { pose: 'waterLift', lift: 650, launcher: true, fall: 25 }),
  aerial: [
    strike(3*tick, 3*tick, 3*tick, 118, 4, 1, -55, .5, { pose: 'waterPalm', lift: 350, selfLift: 320, fall: 0 }),
    strike(3*tick, 3*tick, 6*tick, 126, 6, 1.5, 420, .55, { pose: 'waterSweep', lift: 160, knockdown: true, fall: 70 }),
  ],
});
Object.assign(COMBAT.earth, {
  launcher: strike(6*tick, 3*tick, 9*tick, 104, 10, 1.2, 60, .9, { pose: 'earthLift', armor: true, lift: 690, launcher: true, fall: 25 }),
  aerial: [
    strike(4*tick, 3*tick, 4*tick, 115, 8, 1.1, 55, .55, { pose: 'earthHammer', lift: 390, selfLift: 360, fall: 0 }),
    strike(4*tick, 3*tick, 7*tick, 124, 12, 1.65, 160, .65, { pose: 'earthSpike', spike: 900, knockdown: true, guardBreak: true, fall: 70 }),
  ],
});
Object.assign(COMBAT.fire, {
  launcher: strike(3*tick, 3*tick, 8*tick, 96, 23, 1.1, 120, .8, { pose: 'fireLift', lift: 650, launcher: true, fall: 25 }),
  aerial: [
    strike(2*tick, 3*tick, 3*tick, 106, 20, .9, 105, .45, { pose: 'fireKick', lift: 350, selfLift: 330, fall: 0 }),
    strike(2*tick, 3*tick, 3*tick, 114, 22, 1, 120, .45, { pose: 'fireKick', lift: 330, selfLift: 310, fall: 0 }),
    strike(3*tick, 3*tick, 6*tick, 122, 26, 1.4, 600, .55, { pose: 'fireHeel', lift: 180, knockdown: true, fall: 70 }),
  ],
});

// Every arena names its element: the four sanctuaries are their own element, and the pack stages
// (src/arena-art.js: bamboo, rampart, market, keep) carry one, so a stage key is never read as
// an element where the engine wants one (the third-wave spirit orb, a story guardian). Use
// arenaElement(key), never the key itself.
export const ARENAS = {
  air: { name: 'Sky monastery', subtitle: 'Above the clouds', element: 'air', sky: '#e8eee5', ink: '#425c57', accent: '#71a397' },
  water: { name: 'Moonlit harbor', subtitle: 'Between the tides', element: 'water', sky: '#e2eaf1', ink: '#426177', accent: '#719dc1' },
  earth: { name: 'Jade courtyard', subtitle: 'Rooted in stone', element: 'earth', sky: '#eeeadb', ink: '#5c644d', accent: '#9d9d67' },
  fire: { name: 'Ember caldera', subtitle: 'At the edge of the flame', element: 'fire', sky: '#f0e3d6', ink: '#77584b', accent: '#c78667' },
  ...ARENA_PACK,
};
// The element an arena stands for ('air' for an unknown key).
export const arenaElement = key => (Object.hasOwn(ARENAS, key) && ELEMENTS[ARENAS[key].element] ? ARENAS[key].element : 'air');

export const MODES = {
  survival: { name: 'Survival', description: 'Endless crowds. A guardian every third wave.', objective: 'Survive the waves. Guardians arrive every 3 waves.' },
  training: { name: 'Training', description: 'Practice movement, combos and parries. Unlimited lives.', objective: 'Practice on the sparring partner. Health regenerates.' },
  tournament: { name: 'Tournament', description: 'Three guardians. One champion.', objective: 'Defeat 3 elemental guardians.' },
  challenge: { name: 'Challenge', description: 'Clear 12 opponents with a single life.', objective: 'Defeat 12 opponents. One life, no time limit.' },
  story: { name: 'Journey', description: 'A side-scrolling beat-em-up through four elemental roads. Clear the crowds, follow GO, and defeat each guardian.', objective: 'Clear the road through four elemental stages.' },
};

export const DIFFICULTIES = {
  easy: { name: 'Easy' },
  normal: { name: 'Normal' },
  hard: { name: 'Hard' },
  crazy: { name: 'Crazy' },
};

// Weapons and items (drawn by src/weapon-art.js). name: display name; short: the HUD and floater
// label. hits: durability (melee swings; for the worn bracer, frontal hits absorbed). reach: melee
// reach in px (null keeps the wielder's own strike reach). damage: melee bonus over the fist.
// windup: melee windup multiplier. walk: walking speed while carried. melee false: the attack
// button throws it. lanes: melee depth band (default 32). slash: the swing's brush slash (the
// guandao and the jian sweep the light arc, as in the approved arena frames).
// burst: explosion scale where it breaks when thrown (none for the jian and the lantern's own
// burst). spawn: relative pickup weight; 0 never spawns (the frost jian is the relic the Water
// guardian drops, relic = its element). throw: the projectile it becomes (vx, vy, gravity,
// life, damage, knockback, r, plus pierce, volley, noKnockdown, freeze, roll seconds, blast,
// returnAt seconds). Thrown weapons fly at 900 px/s, vy -90, gravity 240 by default, and break
// where they hit, land, reach an arena wall or run out of flight time.
export const WEAPON_ORDER = ['staff', 'spear', 'crate', 'knives', 'guandao', 'stone', 'millstone', 'lantern', 'chakram', 'jian', 'bracer'];
export const WEAPON_SPECS = {
  staff: { name: 'Waxwood staff', short: 'Staff', hits: 20, reach: 118, damage: 9, slash: 'slashLight', burst: .42, spawn: 2.5,
    throw: { vx: 900, damage: 32, knockback: 560, r: 14 } },
  spear: { name: 'Red-tassel spear', short: 'Spear', hits: 14, reach: 142, damage: 9, slash: 'slashThrust', thrust: true, burst: .42, spawn: 2.5,
    throw: { vx: 900, damage: 34, knockback: 560, r: 14, pierce: 1 } },
  crate: { name: 'Sealed crate', short: 'Crate', hits: 1, reach: null, damage: 9, heavy: true, smash: true, slash: 'slashHeavy', burst: .6, spawn: 2,
    throw: { vx: 620, damage: 48, knockback: 800, r: 25 } },
  knives: { name: 'Twin moth knives', short: 'Knives', hits: 16, reach: 86, damage: 6, windup: .8, slash: 'slashLight', burst: .5, spawn: 2.5,
    throw: { vx: 900, damage: 14, volley: 2, knockback: 260, r: 13, noKnockdown: true } },
  guandao: { name: 'Iron crescent guandao', short: 'Guandao', hits: 10, reach: 158, damage: 16, windup: 1.4, walk: .85, heavy: true, guardBreak: true, lanes: 48,
    slash: 'slashLight', burst: .8, spawn: 1.5, throw: { vx: 560, damage: 44, knockback: 640, r: 18 } },
  stone: { name: 'River stone', short: 'Stone', hits: 1, reach: null, damage: 4, slash: 'slashLight', burst: .45, spawn: 2.5,
    throw: { vx: 1050, damage: 18, knockback: 300, r: 9, noKnockdown: true } },
  millstone: { name: 'Mill stone', short: 'Mill stone', hits: 1, melee: false, walk: .7, burst: .9, spawn: 1.5,
    throw: { vx: 560, vy: -60, gravity: 900, damage: 52, knockback: 700, r: 13, roll: 1.1 } },
  lantern: { name: 'Thunder lantern', short: 'Lantern', hits: 1, melee: false, fuse: 4, spawn: 1.5,
    throw: { vx: 700, vy: -220, gravity: 640, damage: 0, knockback: 0, r: 11, blast: { radius: 70, damage: 30, knockback: 420 } } },
  chakram: { name: 'Gale chakram', short: 'Chakram', hits: 12, reach: 96, damage: 7, slash: 'slashLight', burst: .5, spawn: 2,
    throw: { vx: 900, vy: 0, gravity: 0, life: 2.4, damage: 22, knockback: 300, r: 12, noKnockdown: true, returnAt: .55 } },
  jian: { name: 'Frost jian', short: 'Frost jian', hits: 18, reach: 126, damage: 10, chill: .4, freezeEvery: 3, freeze: .6, slash: 'slashLight', relic: 'water',
    breakSound: 'shatter', spawn: 0, throw: { vx: 900, vy: 0, gravity: 0, damage: 36, knockback: 300, r: 12, noKnockdown: true, freeze: .6 } },
  bracer: { name: 'Jade bracer', short: 'Bracer', hits: 6, worn: true, front: .5, spawn: 1.5 },
};
// Consumables (drawn by src/pickup-art.js, whose CONSUMABLES table holds each one's use style,
// use time, effect point applyAt, rarity and spawn weight). E starts a use: the fighter plays it
// for CONSUMABLES[kind].useTime seconds without moving, guarding or attacking (a held weapon is
// stowed on the back) and the effect lands once at applyAt. A hit before then knocks the item
// out of the hand and it is lost.
//   hp / en: health / energy restored. cleanse: also clears burn and slow (a freeze cuts a use
//   short before its effect, so it is never there to clear).
//   flow: seconds of qi flow at flowRate energy per second. power: seconds of the elixir's
//   damage and knockback multipliers. field: the planted censer's regen field for the placer's
//   team (life seconds, radius r, rate health per second; its depth radius is 0.31 r).
//   own: the spirit orb's energy when it matches the fighter's element (it also clears the
//   burst cooldown).
export const ITEM_EFFECTS = {
  heal: { hp: 40 },
  energy: { en: 55 },
  bun: { hp: 15 },
  gourd: { en: 20, flow: 8, flowRate: 6 },
  incense: { field: { life: 10, r: 90, rate: 4 } },
  peach: { hp: 80, cleanse: true },
  pill: { power: 8, damage: 1.3, knockback: 1.2 },
  orb: { en: 50, own: 100 },
};
// Relative weights of the consumable roll (CONSUMABLES[kind].weight). Together the consumables
// take ITEM_SHARE of the 12-second drops beside the weapons' 20 (about two in five of them);
// the drop at the start of a wave is always a weapon (or the bracer). The spirit orb is never
// rolled: it drops at a guardian's phase break and at the start of every third wave. A broken
// crate spills CRATE_BUNS steamed buns.
export const ITEM_SPAWN = { heal: 22, energy: 18, bun: 26, gourd: 12, incense: 8, peach: 4, pill: 4 };
export const ITEM_SHARE = 13;
export const CRATE_BUNS = 2;
// What E reaches (Game.pickup, and the renderer's E seal on that same item): a pickup within
// x px across and depth px of lane.
export const PICKUP_REACH = { x: 70, depth: 35 };
// The index of the pickup E takes at (x, depth), or -1: the nearest one in reach, measured as
// |dx| / reach.x + |ddepth| / reach.depth (the earlier one on a tie), so the item a fighter
// stands on wins over one at the edge of reach.
export function pickupIndex(weapons, x, depth) {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < weapons.length; i += 1) {
    const w = weapons[i];
    const dx = Math.abs(w.x - x);
    const dDepth = Math.abs((w.depth ?? w.y) - depth);
    if (dx >= PICKUP_REACH.x || dDepth >= PICKUP_REACH.depth) continue;
    const distance = dx / PICKUP_REACH.x + dDepth / PICKUP_REACH.depth;
    if (distance < bestDistance) { best = i; bestDistance = distance; }
  }
  return best;
}

// Enemy archetypes: seven original non-elemental foes (drawn by src/enemy-art.js, whose ARCHETYPES
// table holds their names, colours and heights). A fighter with f.archetype has no element
// (f.element null) and type 'archetype'; read its numbers through fighterSpec / fighterCombat.
//   hp, speed, damage (base strike damage), knockback, w (body width): as ELEMENTS.
//   specialCost / specialCooldown, burstCost / burstCooldown: the archetype's moves (ARCHETYPE_MOVES;
//   no move: an unreachable cost). grab: catches a dizzy opponent like an elemental enemy (the
//   others never grab). score: points for the KO. swing: the whoosh voice of its strikes.
// Like the elements, the numbers are the same on every difficulty: difficulty only changes how
// well the archetype chooses (src/enemy-ai.js).
export const ARCHETYPE_KINDS = ['bandit', 'hunter', 'brute', 'sorcerer', 'guard', 'monk', 'captive'];
export const ARCHETYPE_STATS = {
  bandit: { hp: 70, speed: 200, damage: 14, knockback: 380, w: 26, specialCost: 0, specialCooldown: 1, burstCost: Infinity, burstCooldown: 0, grab: true, score: 120, swing: null },
  hunter: { hp: 75, speed: 185, damage: 12, knockback: 300, w: 28, specialCost: 10, specialCooldown: .9, burstCost: Infinity, burstCooldown: 0, grab: false, score: 120, swing: null },
  brute: { hp: 220, speed: 130, damage: 22, knockback: 560, w: 40, specialCost: 16, specialCooldown: 3.5, burstCost: 30, burstCooldown: 5.5, grab: true, score: 300, swing: 'crate' },
  sorcerer: { hp: 80, speed: 165, damage: 11, knockback: 260, w: 28, specialCost: 14, specialCooldown: 1.2, burstCost: 0, burstCooldown: 6, grab: false, score: 150, swing: null },
  guard: { hp: 140, speed: 150, damage: 17, knockback: 420, w: 30, specialCost: 12, specialCooldown: 2.6, burstCost: Infinity, burstCooldown: 0, grab: false, score: 150, swing: 'jian' },
  monk: { hp: 120, speed: 175, damage: 16, knockback: 400, w: 28, specialCost: 15, specialCooldown: 5, burstCost: Infinity, burstCooldown: 0, grab: true, score: 150, swing: 'staff' },
  captive: { hp: 40, speed: 115, damage: 0, knockback: 0, w: 26, specialCost: Infinity, specialCooldown: 0, burstCost: Infinity, burstCooldown: 0, grab: false, score: 300, swing: null },
};
// Melee strings (the strike() format of COMBAT). Archetypes never launch or fight in the air;
// signature: the index of the step the AI asks for with a launcher press (the bandit's Cleaver
// Drop, the monk's Crescent Thrust), otherwise the string runs in order.
export const ARCHETYPE_COMBAT = {
  bandit: { steps: [
    strike(2*tick, 2*tick, 5*tick, 72, 10, .9, 70, .32, { followThrough: 6, fall: 20 }),
    // Cleaver Drop: the cleaver goes up behind the head (the tell), then a leaping overhead chop.
    strike(6*tick, 2*tick, 9*tick, 84, 26, 1.55, 420, .5, { knockdown: true, lift: 200, fall: 70 }),
  ], signature: 1 },
  hunter: { steps: [strike(3*tick, 2*tick, 6*tick, 66, 4, .8, 260, .35, { fall: 30 })], signature: null },
  // Chain Lash: armoured through its wind-up (no flinch), 80 units of chain.
  brute: { steps: [strike(7*tick, 3*tick, 9*tick, 116, 8, 1.3, 560, .55, { armor: true, knockdown: true, lift: 220, fall: 70 })], signature: null },
  sorcerer: { steps: [strike(3*tick, 2*tick, 6*tick, 74, 6, .85, 160, .35, { fall: 20 })], signature: null },
  // The cut over the shield, from the rear-hand jian.
  guard: { steps: [strike(5*tick, 2*tick, 7*tick, 98, 8, 1.15, 260, .45, { fall: 30 })], signature: null },
  monk: { steps: [
    strike(3*tick, 2*tick, 5*tick, 96, 8, .9, 90, .34, { followThrough: 4, fall: 20 }),
    // Crescent Thrust: a long staff poke (76 units past the fist).
    strike(5*tick, 3*tick, 8*tick, 122, 18, 1.4, 460, .55, { fall: 45 }),
  ], signature: 1 },
  captive: { steps: [], signature: null },
};
for (const combat of Object.values(ARCHETYPE_COMBAT)) Object.assign(combat, { aerial: [], launcher: null });
// Special (K) and burst (L) moves. type: what fires at the end of the wind-up (src/engine.js
// archetypeMove): 'smoke' pellet, 'arrow' (every third a 'volley'), chain 'hook', homing
// 'talisman', iron 'bell' stance; a melee move (melee: true) strikes through its active frames
// instead: the guard's shield 'rush' and the brute's meteor 'whirl' (around: hits on both sides).
// The heal channel is not a move: the priest starts it directly (Game.startChannel).
// windup / recovery are the same readable commitment on every difficulty.
export const ARCHETYPE_MOVES = {
  // The smoke throw is armoured through its wind-up (armor: a light blow does not cut it short).
  bandit: { special: { type: 'smoke', windup: .2, recovery: .2, armor: true } },
  hunter: { special: { type: 'arrow', windup: .42, recovery: .2, volleyWindup: .6 } },
  brute: {
    special: { type: 'hook', windup: .45, recovery: .35 },
    burst: { type: 'whirl', melee: true, variant: 'whirl', windup: .55, active: .45, recovery: .35, reach: 70, step: 0, damage: 1.2, knockback: 600, stun: .5,
      armor: true, knockdown: true, lift: 240, fall: 70, around: true },
  },
  sorcerer: { special: { type: 'talisman', windup: .4, recovery: .2 } },
  guard: { special: { type: 'rush', melee: true, variant: 'rush', windup: .28, active: .2, recovery: .3, reach: 72, step: 110, damage: .8, knockback: 560, stun: .45, fall: 40 } },
  monk: { special: { type: 'bell', windup: .12, recovery: .1 } },
};
// Archetype projectiles and states.
//   arrow: flat shot, no gravity, gone at range px. volley: every third shot, count arrows 45deg
//   up under gravity, landing spread px apart around the aim point; they stick in the floor for
//   stuck s. talisman: slow homing slip (turn rad/s) that seals the victim's specials for seal s.
//   hook: the brute's chain hook; it reels its victim in at reel px/s to pullTo px in front of him. smoke: the
//   pellet (thrown below smokeAt of health, once: a throw cut short by a heavy blow can be tried
//   again) is dashed down at his feet (vx px/s ahead, vy px/s downward, under gravity) and bursts into a puff of
//   radius r for life s; the bandit holds still inside it, hidden (no HP bar, nothing can hit him)
//   for hide s, then flees for flee s.
//   channel: the priest heals an ally below threshold of its health within range px by rate per
//   second for time s; a landed blow cuts it. bell: the monk's Iron Bell lasts time s, nullifies
//   the next hit and leaves the attacker dizzy for dizzy s; it rings for ring s.
//   shield: the warden blocks frontal blows and shots (not guard-breaks, throws, blasts or
//   signature bursts); he braces when an opponent stands in front within brace px, and turns to
//   one behind him only after turn s.
//   staffDrop: chance the fallen monk's staff lands as a real staff pickup.
//   steal: the bandit snatches a consumable this far ahead of the player (px) and runs for flee s.
export const ARCHETYPE_RULES = {
  arrow: { speed: 900, range: 520, damage: 14, knockback: 260, r: 9 },
  volley: { count: 3, gravity: 1400, spread: 34, damage: 10, knockback: 200, r: 8, stuck: 4 },
  talisman: { speed: 300, turn: 2.4, life: 2.4, damage: 8, knockback: 120, r: 10, seal: 2 },
  hook: { speed: 640, range: 380, damage: 8, knockback: 0, r: 10, pullTo: 62, reel: 1100 },
  smoke: { smokeAt: .25, vx: 0, vy: 150, gravity: 1400, r: 40, life: 1, hide: 1, flee: 1.6 },
  channel: { rate: 10, time: 2, range: 380, threshold: .7 },
  bell: { time: 2.4, dizzy: .9, ring: .6 },
  shield: { brace: 220, turn: .35 },
  staffDrop: .35,
  steal: { lead: 40, range: 340, flee: 2.2 },
};
// The bound villager: a rescue objective (team 'neutral'). Only bandits can hurt him. reach: how
// close the player stands to work the cangue (x px across, depth px of lane); hold: seconds E is
// held to free him (E held on from a press further off starts it on stepping into reach); near:
// within this of him E drops nothing (an item in reach is still taken). Freed, he drops a herbal
// tonic, scores reward, cheers for cheer s and hobbles off the nearest edge. He calls for help
// every callEvery s while a bandit closes in, never while the player stands within reach.
export const CAPTIVE = { reach: { x: 72, depth: 30 }, near: { x: 140, depth: 60 }, hold: .6, breakHits: 3, reward: 300, cheer: 1.2, callEvery: 4 };
// How far above a fighter's height (f.y - f.h) its command bubble ('come', 'join' ...) sits: a
// guardian's bar is taller, and an archetype's bar rides on its drawn headgear (the renderer's
// drawFighterHealth), so the bubble clears both.
export const headIconLift = f => (f.type === 'boss' ? 34 : f.archetype ? 28 : 20);
// An archetype or an elemental fighter's spec and strike table.
export const fighterSpec = f => (f?.archetype ? ARCHETYPE_STATS[f.archetype] : ELEMENTS[f?.element]) || ELEMENTS.air;
export const fighterCombat = f => (f?.archetype ? ARCHETYPE_COMBAT[f.archetype] : COMBAT[f?.element]) || COMBAT.air;
