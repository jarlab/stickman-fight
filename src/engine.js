import { ELEMENTS, MOVEMENT, COMBAT, ARENAS, arenaElement, MODES, DIFFICULTIES, WIDTH, WEAPON_SPECS, ITEM_SPAWN, ITEM_SHARE, ITEM_EFFECTS,
  CRATE_BUNS, pickupIndex, PICKUP_REACH, headIconLift, ARCHETYPE_STATS, ARCHETYPE_COMBAT, ARCHETYPE_MOVES, ARCHETYPE_RULES, CAPTIVE, fighterSpec, fighterCombat } from './data.js';
import { GRAVITY, ARENA_BOUNDS, clamp, moveFighter } from './physics.js';
import { EnemyAI } from './enemy-ai.js';
import { Grapples, rescueCandidate } from './grapples.js';
import { BossDirector } from './bosses.js';
import { StageDirector } from './stages.js';
import { VFX } from './vfx-art.js';
import { WEAPON_SHARDS } from './weapon-art.js';
import { CONSUMABLES, CP_PLANT_X, CP_SPARKLE_TIME } from './pickup-art.js';
import { ARCHETYPES } from './enemy-art.js';

const elements = Object.keys(ELEMENTS);
// A wave arrival still inside its spawn swirl: it holds still and is not in the crowd yet.
const arriving = f => !!f.spawnHold && f.spawnReveal > 0;
const COMBAT_TICK = 1 / 30;
const INPUT_WINDOW = 5 * COMBAT_TICK;
const countdowns = ['invulnerable', 'stun', 'parryTimer', 'parryCooldown', 'dashTime', 'slow', 'burn', 'attackTimer', 'tell', 'aiTimer', 'jumpTimer', 'comboTimer', 'hitReact', 'frozen', 'counterReady', 'power',
  'sealed', 'smokeTimer', 'bellTimer'];
// Enemy archetypes (ARCHETYPE_* in src/data.js, drawn by src/enemy-art.js). The colour of an
// archetype's numbers, sparks and KO floater is its cloth; an elemental fighter's its element.
const R = ARCHETYPE_RULES;
const fighterColor = f => (f?.archetype ? ARCHETYPES[f.archetype]?.color : ELEMENTS[f?.element]?.color) || ELEMENTS.air.color;
const hitColor = (source, target) => fighterColor(source && (source.element || source.archetype) ? source : target);
// Archetype projectiles and effects (src/enemy-art.js ENEMY_PROJECTILES / ENEMY_*_EFFECTS).
const ENEMY_SHOTS = new Set(['arrow', 'talisman', 'chainHook', 'smokePellet']);
// An archetype strike reads as heavy (heavy spark, heavy punch) when it knocks down or hits hard.
const archetypeHeavy = move => !!(move?.knockdown || move?.damage >= 1.3);
// damage() returns this (truthy: the blow was spent on it) when the Iron Bell or the Gate
// Warden's shield took the blow whole: nothing landed, so no follow-up effect (a burst's lift,
// slow or stun, a talisman's seal, a hook's pull) may apply.
const NULLIFIED = 'nullified';
// lastHitElement of a blow from an archetype: it carries no element, so its KO burst is plain ink.
const INK_HIT = 'ink';
// The element a fallen fighter's KO burst (and its KO sound) takes: the finishing blow's, or
// its own when none was recorded; null (plain ink) after an archetype's blow.
const koElement = f => (f.lastHitElement === INK_HIT ? null : f.lastHitElement || f.element);
// The ringing Iron Bell's size for a monk of scale 1 (the shell drawIronBell sizes around his
// planted-staff stance: ironBellSize of that pose).
const BELL_H = 88;
const BELL_W = 44;
const NO_INPUT = Object.freeze({});
// A command bubble's fade-out: its last 14% of life (fxIconBegin in src/vfx-art.js).
const ICON_FADE = .14;
const WALK_LEFT = Object.freeze({ left: true });
const WALK_RIGHT = Object.freeze({ right: true });
// Ink effects (src/vfx-art.js) are visual state: they never touch this.random(), so emitting
// them cannot shift the simulation's random stream. Ambient dust and smoke stop spawning at a
// lower count, leaving room for hits, KOs and world effects in a 13-fighter brawl.
const MAX_EFFECTS = 160;
const AMBIENT_EFFECT_CAP = 100;
const AMBIENT_VFX = new Set(['dustRun', 'smoke', 'smokeBurn']);
const RUN_DUST_INTERVAL = .12;
// Queued edge arrivals in one wave: each starts this much later and further in than the last.
const SPAWN_STEP_TIME = .08;
const SPAWN_STEP_X = 34;
// Grounded knockdown slide decay (per second); a fighter sliding at vx comes to rest vx / it on.
const KNOCKDOWN_FRICTION = 8;
// Weapons (WEAPON_SPECS in src/data.js). A weapon kind outside the table (a scripted or test
// value) swings as a plain +9 weapon at the wielder's own reach, as every weapon used to.
const PLAIN_WEAPON = { damage: 9, reach: null };
const weaponSpec = kind => (kind ? WEAPON_SPECS[kind] || PLAIN_WEAPON : null);
// Floater text for a weapon: its short display name ('MILL STONE', 'FROST JIAN').
const weaponLabel = kind => (WEAPON_SPECS[kind]?.short || kind).toUpperCase();
// Item drops: one this.random() draw picks from the cumulative weights (WEAPON_SPECS[kind].spawn,
// then the consumables: ITEM_SPAWN scaled to ITEM_SHARE). Relics (spawn 0) only drop from their
// guardian, the spirit orb only at a phase break or a third wave.
function spawnPool(entries) {
  let total = 0;
  const kinds = [], edges = [];
  for (const [kind, weight] of entries) { if (!(weight > 0)) continue; total += weight; kinds.push(kind); edges.push(total); }
  return { kinds, edges, total };
}
const pick = (pool, r) => { const x = r * pool.total; const i = pool.edges.findIndex(edge => x < edge); return pool.kinds[i < 0 ? pool.kinds.length - 1 : i]; };
const WEAPON_POOL = spawnPool(Object.entries(WEAPON_SPECS).map(([kind, spec]) => [kind, spec.spawn]));
const ITEM_WEIGHT = Object.values(ITEM_SPAWN).reduce((sum, weight) => sum + weight, 0);
const ITEM_POOL = spawnPool([...Object.entries(WEAPON_SPECS).map(([kind, spec]) => [kind, spec.spawn]),
  ...Object.entries(ITEM_SPAWN).map(([kind, weight]) => [kind, weight * ITEM_SHARE / ITEM_WEIGHT])]);
const RELICS = {};
for (const [kind, spec] of Object.entries(WEAPON_SPECS)) if (spec.relic) (RELICS[spec.relic] ??= []).push(kind);
const RELIC_LIFE = 30;
// Consumables (CONSUMABLES in src/pickup-art.js, ITEM_EFFECTS in src/data.js). A floor drop lies
// ITEM_LIFE seconds (it blinks out over its last 5, see consumableFade); a spirit orb ORB_LIFE.
const ITEM_LIFE = 28;
const ORB_LIFE = 28;
const MAX_AURAS = 4;
// Use sounds (src/audio.js bank). Drinks gulp and food bites ('drink' / 'eat', part 'gulp') GULP_LEAD
// before their effect (the bank's own gulp-to-chime spacing) and chime (part 'chime') as it
// lands; the elixir pill, a spirit orb and a planted censer sparkle ('energyPickup') as their
// effect lands. A use cut short before its effect never chimes; before its gulp it is silent.
// USE_GULP: the gulp cue point (fraction of the use time) of the drinks and food.
const GULP_LEAD = .24;
// Food bites ('eat'), everything else gulps ('drink'); a porcelain vessel knocked from the hand
// smashes ('smash').
const useSound = kind => CONSUMABLES[kind]?.use === 'eat' ? 'eat' : 'drink';
const PORCELAIN = new Set(['heal', 'energy']);
const USE_GULP = {};
for (const [kind, spec] of Object.entries(CONSUMABLES)) {
  if (spec.use === 'drink' || spec.use === 'jar' || spec.use === 'eat') USE_GULP[kind] = Math.max(0, spec.applyAt - GULP_LEAD / spec.useTime);
}
// The floater raised as a use lands (text, colour).
const ITEM_FLOATERS = {
  heal: ['+ HEALTH', '#56905d'], bun: ['+ HEALTH', '#56905d'], peach: ['+ HEALTH', '#56905d'],
  energy: ['+ ENERGY', '#427fa7'], gourd: ['+ ENERGY · QI FLOW', '#427fa7'], orb: ['+ ENERGY', '#427fa7'],
  pill: ['ELIXIR POWER', '#a8771f'], incense: ['CENSER PLANTED', '#56905d'],
};
// Inside a planted censer's field: (dx / r)^2 + (dDepth / (FIELD_DEPTH r))^2 <= 1.
const FIELD_DEPTH = .31;
// Broken weapons (visual particles; never this.random()): an ink snap puff, then each piece of
// WEAPON_SHARDS[kind] thrown outward at 50-70 px/s with an upward kick, spinning, under gravity,
// bouncing once onto the floor line. The frost jian's ice shards melt sooner.
const MAX_PARTICLES = 350;
const PUFF_LIFE = .3;
const LANTERN_BURST_LIFE = .6;
const SHARD_LIFE = .9;
const SHARD_MELT_LIFE = .55;
const SHARD_KICK = 150;
const SHARD_GRAVITY = 1200;
// A break on (or just above) the floor starts its pieces at least this far above the floor
// line, so they still fly up and out before they settle. Pieces bounce off the canvas edges.
const SHARD_FLOOR_CLEAR = 12;
const STATIC_PARTICLES = new Set(['breakPuff', 'lanternBurst']);
// Thrown weapons stop at the arena walls (the fighters' own bounds): one still flying there is
// checked against the bodies at the wall, then breaks (or bursts, or splits) on it. A returning
// chakram turns at the edge instead, and a bracer tossed off drops down the wall.
// The second knife of a thrown pair lands its blow in the same tick; its punch sound plays this
// much later so the mixer's per-sound rate limit lets both be heard.
const VOLLEY_BEAT = .06;
// A thrown mill stone rolls on its rim (12.4 px disc) once it lands, slowing by this per second.
// Its landing and its split at the end of the roll raise a small puff of dust (scale), not the
// body-sized knockdown ring.
const ROLL_Z = 13;
const ROLL_DECAY = 1.6;
const ROLL_DUST = .45;
// A returning chakram is caught when it reaches its thrower's body in the thrower's lane.
const CATCH_X = 28;
const CATCH_DEPTH = 30;
// Ice columns crack from this normalised age; an early thaw or shatter jumps straight to it.
const ICE_CRACK_T = .68;
// Brush slash per attack: weapon swings (WEAPON_SPECS[kind].slash; a running weapon charge
// cleaves heavy, a spear always thrusts), then the unarmed trail styles the slash replaces.
// Unarmed finishers keep their elemental trail, as in the approved previews.
const POSE_SLASH = { earthLift: 'slashRise', fireLift: 'slashRise', earthHammer: 'slashDrop',
  earthSpike: 'slashDrop', airDiveHeel: 'slashDrop', waterPalm: 'slashSpin' };
// Sound cues (names from the src/audio.js bank). The engine only records them in state.sounds;
// src/game-audio.js plays them. Like ink effects they never touch this.random().
const MAX_SOUNDS = 48;
// A swing's whoosh starts this long before its active frames, so it peaks as the strike lands.
const WHOOSH_LEAD = .09;
// Foot strikes (aerial heels and flying kicks; Air's rising kick and Fire's kick finisher on the
// ground) sound as kicks rather than punches.
const KICK_POSES = new Set(['airHeel', 'fireKick', 'fireHeel']);
const KICK_FINISHERS = new Set(['air', 'fire']);
const SPECIAL_SFX = { air: 'specialAir', water: 'specialWater', earth: 'specialEarth', fire: 'specialFire' };
const BURST_SFX = { air: 'burstAir', water: 'burstWater', earth: 'burstEarth', fire: 'burstFire' };
// An ordinary jump landing (not a knockdown) thuds softly once it falls faster than this.
const SOFT_LANDING_SPEED = 240;

export class Game {
  constructor(config = {}) {
    const settings = {
      element: Object.hasOwn(ELEMENTS, config.element) ? config.element : 'air',
      arena: Object.hasOwn(ARENAS, config.arena) ? config.arena : 'air',
      mode: config.mode in MODES ? config.mode : 'survival',
      difficulty: config.difficulty in DIFFICULTIES ? config.difficulty : 'normal',
      enemyCount: Number.isInteger(config.enemyCount) && config.enemyCount >= 1 && config.enemyCount <= 12 ? config.enemyCount : 'auto',
    };
    this.seed = config.seed ?? 61721;
    this.visualSeed = (this.seed ^ 0x5bd1e995) >>> 0;
    this.nextId = 0;
    this.enemyAI = new EnemyAI();
    this.grapples = new Grapples();
    this.bosses = new BossDirector();
    this.stages = new StageDirector();
    this.state = {
      settings, status: 'ready', time: 0, wave: 0, kills: 0, score: 0,
      lives: settings.mode === 'challenge' ? 1 : 3,
      player: null, enemies: [], projectiles: [], particles: [], effects: [],
      floaters: [], corpses: [], weapons: [],
      // captives: bound villagers (archetype 'captive', team 'neutral'), the rescue objective.
      captives: [],
      // auras: planted censer fields ({ x, depth, team, facing, scale, life, maxLife, r, rate }).
      bossHazards: [], auras: [], itemSerial: 0,
      bounds: { ...ARENA_BOUNDS }, cameraX: 0, stage: null,
      arena: settings.mode === 'story' ? 'air' : settings.arena, shake: 0, slowMotion: 0,
      // stageCard: the banner on screen opens the run's stage (wave 1) with no guardian on the
      // field, so the renderer hangs the arena's name card under it; any later banner clears it.
      // A guardian wave (every Tournament wave, every story chapter) skips the card: the DOM boss
      // HUD hangs over it at laptop and phone sizes.
      banner: 'Find your element', bannerTime: 0, stageCard: false, objective: MODES[settings.mode].objective,
      waveDelay: -1, weaponTimer: 10, combo: 0, comboTimer: 0, lastImpact: null, impacts: [],
      vfxSerial: 0, sounds: [], soundSerial: 0,
    };
    this.state.player = this.makeFighter('player', settings.element, 610, 560);
    this.placePlayer();
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  // An archetype (type 'archetype', archetype a kind of ARCHETYPE_STATS) has no element.
  makeFighter(team, element, x, y, type = 'fighter', archetype = null) {
    const arch = type === 'archetype' && Object.hasOwn(ARCHETYPE_STATS, archetype) ? archetype : null;
    const spec = arch ? ARCHETYPE_STATS[arch] : ELEMENTS[element];
    const boss = type === 'boss';
    // Ordinary opponents use the same elemental health as a playable fighter.
    // Difficulty changes decisions, not fighter stats or action clocks.
    const hp = boss ? 320 + this.state.wave * 32
      : type === 'dummy' ? 180 : spec.hp;
    return {
      id: ++this.nextId, team, type, element: arch ? null : element, archetype: arch, x, y, depth: y, z: 0, vDepth: 0, vx: 0, vy: 0,
      w: boss ? 46 : arch ? spec.w : 28, h: boss ? 104 : arch ? ARCHETYPES[arch].h : 66, hp, maxHp: hp,
      energy: 100, maxEnergy: 100, facing: team === 'player' ? 1 : -1,
      grounded: true, jumps: 0, attackTimer: 0, attackKind: '',
      guard: false, guardHeld: false, parryTimer: 0, parryCooldown: 0, invulnerable: 0,
      stun: 0, cooldowns: { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 },
      // weaponFuse: a carried lantern's fuse (null while unlit); weaponStreak: landed frost-jian
      // hits; armorItem/armorHits: the worn bracer and the frontal hits it has left.
      weapon: null, weaponHits: 0, weaponFuse: null, weaponStreak: 0, armorItem: null, armorHits: 0, dead: false, aiTimer: 0.8 + this.random(),
      bossPhase: 1, tell: 0, action: null,
      dashTime: 0, dashUsed: false, slow: 0, burn: 0, jumpTimer: 0, burnTick: 0,
      comboIndex: 0, comboTimer: 0, comboCount: 0, running: false, knockdown: 0,
      finisherWindow: 0, finisherTarget: null, inputRevision: 0,
      buffer: null, armor: false, frozen: 0, counterReady: 0, juggle: 0,
      hitLag: 0, hitLagAt: -1, stagger: 0,
      hitReact: 0, hitMax: 0, hitDirection: 1, hitStrength: 0, hitType: 'stagger',
      grabTarget: null, grabbedBy: null, grabTime: 0, thrown: null,
      recoveryRoll: null, downTime: 0, airChain: 0,
      guardFx: 0, iceFx: 0, spawnReveal: 0, spawnHold: false, dustTimer: 0, scorch: false, lastHitElement: null, burnSide: 1,
      // consume: the use in progress ({ kind, variant, t, duration, from, applied, sounded });
      // consumeLost: the last use a hit cut short ({ kind, variant, serial }). power / qiFlow:
      // seconds left of the elixir and of the gourd's qi flow; censerRegen: the time left
      // (0..1) of the censer field the fighter stands in, 0 outside one.
      consume: null, consumeLost: null, power: 0, qiFlow: 0, censerRegen: 0,
      // Archetype state: sealed (a talisman blocks K/L), the priest's heal channel, the monk's
      // Iron Bell, the bandit's smoke (hidden) and stolen item, arrows loosed (every third is a
      // volley), the warden's brace (0..1) and turn, a captive's freedom, cheer and call for
      // help, the player's rescue in progress ({ id, t }) and a chain hook reeling one in (pull).
      sealed: 0, channel: null, bellTimer: 0, smokeTimer: 0, smokeUsed: false, stolen: null, shots: 0, brace: 0, turnTimer: 0,
      freed: false, cheer: 0, callTimer: 0, calling: 0, rescue: null, aimLead: 0, pull: null,
      // seekRescue: E has been held since a press near a bound villager (stepping into reach
      // with it still held starts freeing him).
      seekRescue: false,
    };
  }

  start() {
    if (this.state.status !== 'ready') return;
    this.state.status = 'playing';
    this.state.player.invulnerable = 1.2;
    this.beginWave();
  }

  togglePause() {
    if (this.state.status === 'playing') { this.state.status = 'paused'; this.state.player.buffer = null; }
    else if (this.state.status === 'paused') this.state.status = 'playing';
  }

  placePlayer() {
    const s = this.state;
    this.grapples.release(this, s.player);
    const use = s.player.consume;
    Object.assign(s.player, { x: s.stage?.checkpointX ?? 590, y: 555, depth: 555, z: 0, vDepth: 0, vx: 0, vy: 0, grounded: true, jumps: 0, dashUsed: false, dashTime: 0, stun: 0, burn: 0, slow: 0, action: null, guard: false, parryTimer: 0, attackTimer: 0, tell: 0, knockdown: 0, comboIndex: 0, comboTimer: 0 });
    Object.assign(s.player, { buffer: null, armor: false, frozen: 0, counterReady: 0, juggle: 0, hitReact: 0, running: false, guardHeld: false, hitLag: 0, stagger: 0, thrown: null, recoveryRoll: null, downTime: 0, airChain: 0 });
    Object.assign(s.player, { guardFx: 0, iceFx: 0, spawnReveal: 0, spawnHold: false, dustTimer: 0, scorch: false, consume: null, rescue: null, seekRescue: false, pull: null, sealed: 0 });
    if (s.stage) s.cameraX = clamp(s.player.x - 460, 0, s.stage.width - WIDTH);
    this.clearCombatInput(s.player);
    // A use still playing as a Story chapter begins finishes at once, where the player now
    // stands: its effect lands if it had not (a censer is planted in the new sanctuary).
    if (use && !use.applied) this.landUse(s.player, use);
  }

  // archetype: an ARCHETYPE_STATS kind instead of an element (no element is drawn for it).
  spawnEnemy({ boss = false, dummy = false, element, archetype = null, x, y, depth } = {}) {
    const s = this.state;
    const side = this.random() > 0.5;
    // A wave arrival enters at an arena edge and queues behind swirls still playing there: a
    // step later and a little further in, so a wave reads as separate summonings, not one coil.
    const edge = x == null;
    const queued = edge ? s.enemies.filter(o => o.spawnHold && o.spawnReveal > 0 && o.x > (s.bounds.left + s.bounds.right) / 2 === side).length : 0;
    const spawnX = x ?? (side ? s.bounds.right - 80 : s.bounds.left + 80) + (side ? -1 : 1) * (queued % 3) * SPAWN_STEP_X;
    const arch = !boss && !dummy && Object.hasOwn(ARCHETYPE_STATS, archetype) && archetype !== 'captive' ? archetype : null;
    const e = this.makeFighter('enemy', arch ? null : element || elements[Math.floor(this.random() * 4)], spawnX, depth ?? y ?? (425 + this.random() * 200),
      boss ? 'boss' : dummy ? 'dummy' : arch ? 'archetype' : 'fighter', arch);
    e.invulnerable = 0.4;
    s.enemies.push(e);
    // The summoning swirl reveals the body at 60% of its life. A wave arrival holds its spot
    // until then (no AI, no crowd push) inside its spawn guard; a placed fighter (training
    // slots, scripted spots) acts at once and its swirl tracks the hidden body instead.
    const delay = queued * SPAWN_STEP_TIME;
    if (this.vfx('spawn', e.x, e.depth, { element: e.element, scale: e.type === 'boss' ? 1.3 : 1 }, { delay, targetId: e.id })) {
      e.spawnReveal = delay + VFX.spawn.life * .6;
      e.spawnHold = edge;
      if (edge) e.invulnerable = Math.max(e.invulnerable, e.spawnReveal + .04);
    }
    // A guardian's drums sound as it steps out of its swirl (updateFighterVisuals), or at once.
    if (e.type === 'boss' && !(e.spawnReveal > 0)) this.sound('bossDrum', e.x);
    return e;
  }

  beginWave() {
    const s = this.state;
    s.wave++;
    s.waveDelay = -1;
    this.sound('waveGong', 640);
    const mode = s.settings.mode;
    const countOverride = s.settings.enemyCount === 'auto' ? null : s.settings.enemyCount;
    if (mode === 'story') {
      this.stages.begin(this);
      return;
    }
    if (mode === 'training') {
      for (let i = 0; i < (countOverride ?? 1); i++) this.spawnTrainingEnemy(i);
      this.banner('Training grounds');
    } else if (mode === 'tournament') {
      this.spawnEnemy({ boss: true, element: elements[(s.wave + elements.indexOf(s.settings.element)) % 4] });
      for (let i = 1; i < (countOverride ?? 1); i++) this.spawnEnemy();
      this.banner(`Guardian ${s.wave} / 3`);
    } else {
      const bossWave = mode === 'survival' && s.wave % 3 === 0;
      const count = countOverride ?? (mode === 'challenge' ? 4 : Math.min(4 + s.wave, 13));
      const ordinaryCount = bossWave ? (countOverride == null ? Math.max(2, count - 3) : count - 1) : count;
      const mix = this.archetypeMix(ordinaryCount);
      for (let i = 0; i < ordinaryCount - mix.length; i++) this.spawnEnemy();
      for (const archetype of mix) this.spawnEnemy({ archetype });
      if (bossWave) this.spawnEnemy({ boss: true });
      this.banner(mode === 'challenge' ? `Trial ${s.wave} / 3` : `Wave ${s.wave}${bossWave ? ' · Guardian approaches' : ''}`);
    }
    s.stageCard = s.wave === 1 && !s.enemies.some(e => e.type === 'boss');
    // Now and then the bandits of a wave leave a bound villager behind: free him (hold E) before
    // they cut him down.
    if (this.captiveWave() && s.enemies.some(e => e.archetype === 'bandit') && !(s.captives ??= []).some(c => !c.freed)) {
      this.spawnCaptive(s.player.x < 640 ? 1040 : 240, 600);
    }
    if (s.wave > 1) {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 22);
      s.player.energy = Math.min(100, s.player.energy + 25);
    }
    this.spawnWeapon(true);
    // Every third wave opens with a spirit orb of the arena's element at its heart.
    if (mode !== 'training' && s.wave % 3 === 0) this.dropOrb(arenaElement(s.arena), 640, 560);
  }

  banner(text) { this.state.banner = text; this.state.bannerTime = 2.7; this.state.stageCard = false; }

  // The archetypes that take some of a wave's ordinary slots (the rest stay elemental; at least
  // one always does). Survival from wave 2: two, three from wave 5; Challenge: one per trial
  // number, up to three; Story from chapter 2: one or two. Training keeps its sparring partner and
  // the Tournament its guardians (and elemental supporters). The kinds come from this.random():
  // the Chain Ox only from Survival wave 4 or the last trial, at most one Ox and one priest, and
  // a captive wave's mix opens with two bandits (the villager is theirs).
  archetypeMix(slots) {
    const s = this.state, mode = s.settings.mode, wave = s.wave;
    const wanted = mode === 'survival' ? (wave >= 5 ? 3 : wave >= 2 ? 2 : 0)
      : mode === 'challenge' ? Math.min(3, wave) : mode === 'story' ? (wave >= 3 ? 2 : wave >= 2 ? 1 : 0) : 0;
    const n = Math.max(0, Math.min(wanted, slots - 1));
    if (!n) return [];
    const mix = [];
    if (this.captiveWave()) for (let i = 0; i < Math.min(2, n); i++) mix.push('bandit');
    const pool = (mode === 'survival' && wave >= 4) || (mode === 'challenge' && wave >= 3)
      ? ['bandit', 'hunter', 'guard', 'monk', 'sorcerer', 'brute'] : ['bandit', 'hunter', 'guard', 'monk', 'sorcerer'];
    while (mix.length < n) {
      let kind = pool[Math.floor(this.random() * pool.length)];
      // One Chain Ox and one priest at most: the next kind round the pool instead.
      for (let i = 0; i < pool.length && (kind === 'brute' || kind === 'sorcerer') && mix.includes(kind); i++) {
        kind = pool[(pool.indexOf(kind) + 1) % pool.length];
      }
      mix.push(kind);
    }
    return mix;
  }

  // Survival waves 2, 5, 8 ..., the second trial and the third chapter bring a bound villager.
  captiveWave() {
    const { mode } = this.state.settings, wave = this.state.wave;
    return mode === 'survival' ? wave >= 2 && wave % 3 === 2 : mode === 'challenge' ? wave === 2 : mode === 'story' ? wave === 3 : false;
  }

  // A bound villager kneels at (x, depth), revealed by a summoning swirl like the wave. He calls
  // for help (the 'come' bubble) when a bandit closes in.
  spawnCaptive(x, depth) {
    const c = this.makeFighter('neutral', null, x, depth, 'archetype', 'captive');
    c.facing = x < (this.state.bounds.left + this.state.bounds.right) / 2 ? 1 : -1;
    c.invulnerable = .4;
    c.callTimer = 1;
    (this.state.captives ??= []).push(c);
    if (this.vfx('spawn', c.x, c.depth, {}, { targetId: c.id })) c.spawnReveal = VFX.spawn.life * .6;
    return c;
  }

  spawnTrainingEnemy(index = 0) {
    const s = this.state;
    while (s.enemies.some(e => e.trainingSlot === index)) index++;
    const solo = s.settings.enemyCount === 'auto' || s.settings.enemyCount === 1;
    const enemy = this.spawnEnemy({ dummy: true, element: 'earth',
      x: solo ? clamp(s.player.x + (s.player.x < 640 ? 190 : -190), 80, 1200) : 120 + index % 6 * 208,
      depth: solo ? s.player.depth : 460 + Math.floor(index / 6) * 145 });
    enemy.trainingSlot = index;
  }

  spawnWeapon(weaponOnly = false) {
    const s = this.state;
    if (s.weapons.length >= 3) return;
    const depth = 440 + this.random() * 180;
    // Weighted by WEAPON_SPECS[kind].spawn (and ITEM_SPAWN): still one draw per choice, so a drop
    // takes the same three numbers from the random stream as before.
    const kind = pick(weaponOnly ? WEAPON_POOL : ITEM_POOL, this.random());
    const left = s.stage ? Math.max(s.bounds.left + 190, s.cameraX + 150) : 220;
    const right = s.stage ? Math.min(s.bounds.right - 190, s.cameraX + 1130) : 1060;
    const item = { x: left + this.random() * Math.max(0, right - left), y: depth, depth, kind, life: ITEM_LIFE };
    // A consumable's bob and glint phase (visual stream: it never shifts this.random()).
    if (CONSUMABLES[kind]) item.seed = Math.round(this.visualRandom() * 1000) / 100;
    s.weapons.push(item);
  }

  // A spirit orb (variant = its element) floating over the floor, whatever the pickup cap.
  dropOrb(variant, x, depth) {
    const d = clamp(depth, 440, 640);
    const orb = { x: clamp(x, this.state.bounds.left + 50, this.state.bounds.right - 50), y: d, depth: d, kind: 'orb', variant: ELEMENTS[variant] ? variant : 'air', life: ORB_LIFE,
      seed: Math.round(this.visualRandom() * 1000) / 100 };
    this.state.weapons.push(orb);
    return orb;
  }

  // A broken crate spills its steamed buns on the floor where it broke, whatever the pickup cap.
  spillBuns(x, depth) {
    const d = clamp(depth, 395, 650);
    for (let i = 0; i < CRATE_BUNS; i += 1) {
      const dx = (i - (CRATE_BUNS - 1) / 2) * 34;
      this.state.weapons.push({ x: clamp(x + dx, this.state.bounds.left + 30, this.state.bounds.right - 30), y: d, depth: d, kind: 'bun', life: 20, seed: i * 1.7 + 0.4 });
    }
  }

  tick(input = {}, dt = 1 / 120) {
    const s = this.state;
    if (s.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    // LF2 ages recent button presses on the world clock, even during hit lag.
    // Completed directional commands instead wait for an available transition.
    for (const f of [s.player, ...s.enemies]) {
      if (f.buffer?.ttl != null && (f.buffer.ttl -= dt) < 1e-9) f.buffer = null;
    }
    this.bufferInput(s.player, input);
    s.time += dt;
    s.shake = Math.max(0, s.shake - dt * 24);
    s.slowMotion = Math.max(0, s.slowMotion - dt);
    const step = s.slowMotion > 0 ? dt * 0.5 : dt;
    s.bannerTime = Math.max(0, s.bannerTime - dt);
    s.comboTimer = Math.max(0, s.comboTimer - dt);
    if (!s.comboTimer) s.combo = 0;
    this.updateVisuals(step);

    this.updateFighter(s.player, input, step);
    this.enemyAI.update(this, step);
    for (const e of s.enemies) {
      if (e.dead || e.hp <= 0) continue;
      if (e.type === 'boss' && this.bosses.updatePhase(this, e) && e.ai) e.ai.bossCommitted = true;
      this.updateFighter(e, e.hitLag > 0 || arriving(e) ? {} : this.enemyInput(e), step);
    }
    this.updateCaptives(step);
    this.grapples.update(this, step);
    this.separateFighters(step);
    this.updateProjectiles(step);
    this.updateAuras(step);
    this.bosses.updateHazards(this, step);
    this.resolveDeaths();
    if (s.status !== 'playing') return;
    if (s.stage) {
      this.stages.tick(this, dt);
    } else if (s.settings.mode === 'training') {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + dt * 18);
      s.player.energy = Math.min(100, s.player.energy + dt * 15);
      const count = s.settings.enemyCount === 'auto' ? 1 : s.settings.enemyCount;
      if (s.enemies.length < count) this.spawnTrainingEnemy();
    } else if (!s.enemies.length) {
      if (s.waveDelay < 0) {
        s.waveDelay = 2.2;
        this.banner('Arena cleared · breathe');
      } else {
        s.waveDelay -= dt;
        if (s.waveDelay <= 0) {
          const final = ({ tournament: 3, challenge: 3 })[s.settings.mode];
          if (final && s.wave >= final) {
            s.status = 'won';
            s.objective = 'Every opponent defeated. The arena is yours.';
          } else this.beginWave();
        }
      }
    }
    s.weaponTimer -= dt;
    if (s.weaponTimer <= 0) { this.spawnWeapon(); s.weaponTimer = 12; }
  }

  updateFighter(f, input, dt) {
    if (f.dead) return;
    if (f.seekRescue && !input.interactHeld) f.seekRescue = false;
    this.updateCarried(f, dt);
    // Landing commitment ages through contact pauses, so a recent recovery
    // input can survive the throw's landing hitlag. Airborne time never counts.
    f.downTime = f.knockdown > 0 && f.grounded && !f.thrown ? f.downTime + dt : 0;
    // LF2 holds participants, including their physics and action clocks.
    // Projectiles and the rest of the crowd continue on the world clock.
    if (f.hitLag > 0) {
      // A contact earlier in this same tick must not shorten the victim's hold
      // simply because its update comes after the attacker's in the array.
      if (f.hitLagAt !== this.state.time) f.hitLag = Math.max(0, f.hitLag - dt);
      f.hitLagAt = this.state.time;
      return;
    }
    const spec = fighterSpec(f);
    this.updateFinisherWindow(f, dt);
    f.stagger = Math.max(0, f.stagger - dt * 30);
    for (const key of countdowns) f[key] = Math.max(0, (f[key] || 0) - dt);
    for (const key of Object.keys(f.cooldowns)) f.cooldowns[key] = Math.max(0, f.cooldowns[key] - dt);
    if (f.team === 'enemy') this.bufferInput(f, input);
    f.armor = !!(((f.action?.move?.armor || f.action?.armored) && f.action.t < f.action.activeUntil ||
      f.bossAction?.armor && f.bossAction.t < f.bossAction.windup &&
      (f.bossAction.poise == null || (f.bossAction.poiseHits ?? 0) < f.bossAction.poise)) && f.grounded);
    f.energy = Math.min(f.maxEnergy, f.energy + dt * (f.guard ? 2 : f.team === 'player' ? 14 : 18));
    // The gourd's qi flow tops energy up on the fighter's own clock.
    if (f.qiFlow > 0) {
      const flow = Math.min(dt, f.qiFlow);
      f.qiFlow -= flow;
      f.energy = Math.min(f.maxEnergy, f.energy + flow * ITEM_EFFECTS.gourd.flowRate);
    }
    if (f.burn > 0) {
      f.burnTick -= dt;
      if (f.burnTick <= 0) {
        f.hp = Math.max(0, f.hp - 3);
        f.burnTick = 0.45;
        f.lastHitElement = 'fire';
        // Successive puffs alternate sides of the head so they read as separate wisps.
        f.burnSide = f.burnSide < 0 ? 1 : -1;
        this.vfx('smokeBurn', f.x + f.burnSide * 5, f.y - f.h * .78, {}, { depth: f.depth });
        this.sound('burn', f.x);
      }
    }
    if (f.consume && this.useBroken(f)) this.cancelConsume(f);
    if (f.channel) this.updateChannel(f, dt);
    if (f.archetype === 'guard') this.updateBrace(f, dt);
    if (f.hp <= 0) { this.endAction(f); f.buffer = null; f.guard = false; return; }
    if (f.grabbedBy != null) { f.buffer = null; return; }
    if (f.grabTarget != null) { this.grapples.control(this, f, input, dt); return; }
    if (f.recoveryRoll || this.tryRecoveryRoll(f)) {
      this.updateRecoveryRoll(f, dt);
      return;
    }
    if (f.bossAction && this.bosses.updateFighter(this, f, dt)) return;
    if (f.knockdown > 0 && f.grounded) {
      f.knockdown = Math.max(0, f.knockdown - dt);
      if (!f.knockdown) {
        f.invulnerable = Math.max(f.invulnerable, .28);
        f.juggle = f.stagger = f.downTime = 0;
        f.scorch = false;
        if (f.buffer?.kind === 'recover') f.buffer = null;
      }
    }
    const disabled = f.stun > 0 || f.knockdown > 0 || f.frozen > 0;
    if (disabled && f.bellTimer > 0) f.bellTimer = 0;
    // A use in progress (f.consume) holds the fighter: no steps, guard, jumps or attacks; so do
    // freeing a captive (f.rescue), the priest's heal channel and the monk's Iron Bell stance.
    const consuming = !!f.consume || !!f.rescue || !!f.channel || f.bellTimer > 0;
    if (!disabled && input.guard && f.action?.connected && f.action.t >= f.action.chainAt && !f.buffer) this.endAction(f);
    const guardPressed = !!input.guard && !f.guardHeld;
    f.guardHeld = !!input.guard;
    const power = ['special', 'burst'].includes(f.buffer?.kind) ? f.buffer.kind : null;
    const readyPower = power && f.cooldowns[power] <= 0 && f.energy >= spec[`${power}Cost`];
    f.guard = !!input.guard && !disabled && !consuming && f.dashTime <= 0 && !f.action && !readyPower;
    if (f.guard && guardPressed && f.parryCooldown <= 0) {
      f.parryTimer = 0.17;
      f.parryCooldown = 0.48;
    }
    if (!disabled) {
      const direction = consuming ? 0 : Number(!!input.right) - Number(!!input.left);
      const depthDirection = consuming ? 0 : Number(!!input.down) - Number(!!input.up);
      // The warden backs off still facing his foe; he turns only slowly (updateBrace).
      if (direction && !f.action && f.archetype !== 'guard') f.facing = direction;
      // Heavy carries (the guandao, a mill stone) slow every step, running included.
      let speed = spec.speed * (weaponSpec(f.weapon)?.walk ?? 1);
      f.running = !!input.run && !!direction && f.grounded && !f.guard && !f.action;
      if (direction && depthDirection) speed *= Math.SQRT1_2;
      if (f.slow > 0) speed *= 0.5;
      if (f.guard) speed *= 0.32;
      if (f.action) speed *= 0.5;
      if (f.dashTime <= 0) {
        const forwardSpeed = speed * (f.running ? MOVEMENT.runMultiplier : 1);
        const depthSpeed = speed * (f.running ? MOVEMENT.runDepth : MOVEMENT.walkDepth);
        f.vx += (direction * forwardSpeed - f.vx) * Math.min(1, dt * (f.grounded ? 12 : 6));
        f.vDepth += (depthDirection * depthSpeed - f.vDepth) * Math.min(1, dt * 12);
      }
      if (f.rescue) this.updateRescue(f, input, dt);
      else if (f.consume) {
        // A further E during a use does nothing, however late: it never carries past the use
        // (it would drop the held weapon, toss the bracer or take the next item).
        if (f.buffer?.kind === 'interact') f.buffer = null;
        this.updateConsume(f, dt);
      } else if (!consuming) {
        // E held on since a press (f.seekRescue): stepping into a bound villager's reach starts
        // freeing him, as a fresh press there would.
        if (!(f.seekRescue && !f.buffer && this.startRescue(f))) this.consumeBuffer(f);
      }
    } else {
      // Small recoil keeps linking hits in reach; launches retain their momentum.
      f.vx *= Math.exp(-dt * (f.thrown ? .15 : f.knockdown > 0 ? (f.grounded ? KNOCKDOWN_FRICTION : 1.3) : f.z > 20 ? 2 : 15));
      f.vDepth *= Math.exp(-dt * (f.thrown ? .15 : 5));
      if (f.frozen > 0) { f.vx = 0; f.vDepth = 0; }
      // A chain hook reels its victim in at R.hook.reel px/s and sets it down exactly in place.
      if (f.pull) {
        const dx = f.pull.x - f.x, dd = f.pull.depth - f.depth, d = Math.hypot(dx, dd), step = R.hook.reel * dt;
        if (f.knockdown > 0 || f.frozen > 0 || f.thrown || d <= step) {
          if (!(f.knockdown > 0 || f.frozen > 0 || f.thrown)) { f.x = f.pull.x; f.depth = f.pull.depth; }
          f.pull = null;
          f.vx = 0;
          f.vDepth = 0;
        } else { f.vx = dx / d * R.hook.reel; f.vDepth = dd / d * R.hook.reel; }
      }
      f.rescue = null;
      f.action = null;
      f.armor = false;
      f.guard = false;
      f.tell = 0;
    }

    if (f.action) {
      const action = f.action;
      const previousTime = action.t;
      action.t += dt;
      if (action.move && action.t <= action.activeUntil) f.x += f.facing * action.move.step * dt / action.activeUntil;
      if (action.connected && action.move?.followThrough && action.t > action.activeUntil) {
        const recoveryTime = Math.min(action.t, action.duration) - Math.max(previousTime, action.activeUntil);
        f.x += f.facing * action.move.followThrough * recoveryTime / action.move.recovery;
      }
      if (action.kind === 'melee' && !action.whooshed && action.t >= action.windup - WHOOSH_LEAD) {
        action.whooshed = true;
        const move = action.move;
        const heavy = f.archetype ? archetypeHeavy(move) : action.variant ? !!(move?.knockdown || move?.launcher) : f.comboIndex === 3 || f.attackKind === 'runAttack' || !!weaponSpec(action.weapon)?.heavy;
        this.sound('whoosh', f.x, { weapon: action.weapon || (f.archetype ? ARCHETYPE_STATS[f.archetype].swing : null), strength: heavy ? 1.3 : .8 });
      }
      if (action.kind === 'melee' && action.t >= action.windup && action.t <= action.activeUntil) {
        action.done = true;
        this.melee(f);
      } else if (action.kind !== 'melee' && !action.done && action.t >= action.windup) {
        action.done = true;
        if (action.kind === 'throw') this.throwWeapon(f);
        else if (f.archetype) this.archetypeMove(f, action);
        else if (action.kind === 'special') this.shoot(f);
        else if (action.kind === 'burst') this.burst(f);
      }
      if (f.action && action.t >= action.duration) this.endAction(f);
    }
    if (f.hitLag > 0) {
      f.x = clamp(f.x, this.state.bounds.left + f.w / 2, this.state.bounds.right - f.w / 2);
      return;
    }
    if (f.dashTime <= 0) {
      f.vy += GRAVITY * dt;
    }
    f.vy = Math.min(f.vy, 1200);
    const wasAirborne = !f.grounded;
    const landingVelocity = f.vy;
    moveFighter(f, dt, this.state.bounds);
    if (wasAirborne && f.grounded) {
      f.airChain = 0;
      if (f.action?.variant === 'aerial') this.endAction(f);
      if (f.knockdown > 0) {
        this.impact(f, null, Math.max(.6, landingVelocity / 900), true, 'land');
        this.vfx('dustLand', f.x, f.depth, { heavy: true, scale: f.type === 'boss' ? 1.3 : 1 });
        // The burn waits where the slide will leave the body, so the victim lies in the flames.
        if (f.scorch) this.scorchFloor(f, clamp(f.x + f.vx / KNOCKDOWN_FRICTION, this.state.bounds.left + f.w / 2, this.state.bounds.right - f.w / 2));
      } else {
        f.juggle = 0;
        if (landingVelocity > SOFT_LANDING_SPEED) this.sound('land', f.x, { strength: .4 });
      }
    }
    this.updateRunDust(f, dt);
  }

  // Kick-off dust at the rear foot as a run starts, then every RUN_DUST_INTERVAL of running.
  updateRunDust(f, dt) {
    if (!f.running || !f.grounded || f.stun > 0 || f.knockdown > 0 || f.spawnReveal > 0 || Math.abs(f.vx) < 60) { f.dustTimer = 0; return; }
    f.dustTimer -= dt;
    if (f.dustTimer > 0) return;
    f.dustTimer += RUN_DUST_INTERVAL;
    if (f.dustTimer <= 0) f.dustTimer = RUN_DUST_INTERVAL;
    this.footDust(f, Math.sign(f.vx) || f.facing);
  }

  footDust(f, direction) {
    if (f.spawnReveal > 0) return; // no dust from a body the swirl still hides
    const dir = direction < 0 ? -1 : 1;
    this.vfx('dustRun', f.x - dir * 10, f.depth, { dir });
  }

  // A fire finisher leaves its knocked-down victim on a burning floor patch.
  scorchFloor(f, x = f.x) {
    f.scorch = false;
    this.vfx('groundBurn', x, f.depth, { radius: 34, life: VFX.groundBurn.life });
  }

  bufferInput(f, input) {
    if (f.recoveryRoll) { f.buffer = null; return; }
    if (f.knockdown > 0 && input.dash) {
      f.buffer = { kind: 'recover', ttl: INPUT_WINDOW,
        direction: input.attackDirection ?? Number(!!input.right) - Number(!!input.left),
        depthDirection: input.attackDepthDirection ?? Number(!!input.down) - Number(!!input.up) };
      return;
    }
    if (input.freshInput && f.buffer?.command) f.buffer = null;
    const kind = ['burst', 'special', 'throw', 'attack', 'dash', 'jump', 'interact'].find(key => input[key]);
    if (kind) f.buffer = {
      kind, command: !!input.command, ttl: input.command ? null : INPUT_WINDOW,
      // A launcher press: up + J (or an AI's launcher request); an archetype's special asks for its
      // alternative with it (the archer's lobbed volley).
      launcher: kind === 'attack' ? !!(input.launcher || (input.attackDepthDirection ?? Number(!!input.down) - Number(!!input.up)) < 0)
        : kind === 'special' && !!input.launcher,
      direction: input.attackDirection ?? Number(!!input.right) - Number(!!input.left),
      depthDirection: input.attackDepthDirection ?? Number(!!input.down) - Number(!!input.up),
      // A jump/dash and a strike can arrive in the same browser frame.
      // Keep that pair as one intent instead of silently discarding the movement.
      mobility: ['attack', 'special', 'burst', 'throw'].includes(kind) ? input.dash ? 'dash' : input.jump ? 'jump' : null : null,
    };
  }

  tryRecoveryRoll(f) {
    const queued = f.buffer;
    if (queued?.kind !== 'recover' || f.knockdown <= 0 || !f.grounded || f.thrown ||
        f.downTime < .05 || f.frozen > 0 || f.grabbedBy != null || f.grabTarget != null) return false;
    const direction = queued.direction || (queued.depthDirection ? 0 : f.facing);
    const depthDirection = queued.depthDirection || 0;
    this.clearCombatInput(f);
    this.endAction(f);
    Object.assign(f, { recoveryRoll: { t: 0, duration: .42, direction, depthDirection },
      knockdown: 0, downTime: 0, stun: 0, stagger: 0, juggle: 0, hitReact: 0,
      guard: false, guardHeld: false, parryTimer: 0, running: false, dashTime: 0,
      z: 0, vy: 0, invulnerable: Math.max(f.invulnerable, .3) });
    if (direction) f.facing = direction;
    f.cooldowns.dash = Math.max(f.cooldowns.dash, .48);
    this.footDust(f, direction || f.facing);
    this.sound('dash', f.x);
    return true;
  }

  updateRecoveryRoll(f, dt) {
    const roll = f.recoveryRoll;
    const next = Math.min(roll.duration, roll.t + dt);
    const progress = (roll.t + next) / (2 * roll.duration);
    const speed = MOVEMENT.recoveryRollSpeed * (1 - .75 * progress);
    const diagonal = roll.direction && roll.depthDirection ? Math.SQRT1_2 : 1;
    f.vx = roll.direction * speed * diagonal;
    f.vDepth = roll.depthDirection * speed * .62 * diagonal;
    f.vy = 0;
    moveFighter(f, next - roll.t, this.state.bounds);
    roll.t = next;
    if (next >= roll.duration) {
      f.recoveryRoll = null;
      f.vx = f.vDepth = 0;
      this.clearCombatInput(f);
    }
  }

  endAction(f) {
    if (f.type === 'boss') this.bosses.cancel(this, f);
    f.action = null; f.armor = false; f.tell = 0; f.attackTimer = 0;
  }

  clearCombatInput(f) {
    f.buffer = null;
    f.comboTimer = 0;
    f.comboCount = 0;
    f.finisherWindow = 0;
    f.finisherTarget = null;
    f.inputRevision++;
  }

  inFinisherLane(f, target) {
    return !target.dead && target.hp > 0 && target.knockdown <= 0 &&
      (target.x - f.x) * f.facing >= -12 && Math.abs(target.depth - f.depth) < 32 &&
      Math.abs(target.z + target.h / 2 - f.z - f.h / 2) < 70;
  }

  updateFinisherWindow(f, dt = 0) {
    f.finisherWindow = Math.max(0, f.finisherWindow - dt);
    // Archetypes (and a bound villager) have no elemental finisher.
    if (f.archetype) { f.finisherWindow = 0; f.finisherTarget = null; return; }
    const reach = COMBAT[f.element].steps[2].reach;
    const target = this.targets(f).find(target => this.inFinisherLane(f, target) &&
      target.stun > 0 && target.hitType === 'dizzy' && Math.abs(target.x - f.x) < reach + target.w / 2);
    if (target) {
      // Inspired by kind-6 vulnerability contacts and LF2's three-tick marker.
      // Our original arena retains frontal targeting and its wider lane scale.
      f.finisherTarget = target.id;
      f.finisherWindow = 3 * COMBAT_TICK;
    } else if (f.finisherWindow < 1e-9) f.finisherTarget = null;
  }

  consumeBuffer(f) {
    const queued = f.buffer;
    if (!queued || f.dashTime > 0) return;
    if (queued.kind === 'recover') { f.buffer = null; return; }
    if (queued.afterDash) { queued.afterDash = false; queued.ttl = INPUT_WINDOW; }
    const kind = queued.kind;
    const skill = kind === 'special' || kind === 'burst';
    // A priest's talisman seals the victim's shot and signature for a while.
    if (skill && f.sealed > 0) {
      if (f.team === 'player') this.floater(f.x, f.y - 90, 'SEALED', ARCHETYPES.sorcerer.color);
      f.buffer = null;
      return;
    }
    if (skill && f.energy < fighterSpec(f)[`${kind}Cost`]) {
      if (f.team === 'player') this.floater(f.x, f.y - 90, 'Need energy', '#64736b');
      f.buffer = null;
      return;
    }
    const action = f.action;
    if (action) {
      const launchChase = action.launched && (kind === 'jump' || queued.mobility === 'jump');
      const mobility = launchChase || (kind === 'jump' && f.element === 'air' && action.variant !== 'launcher') || (kind === 'dash' && ['air', 'fire'].includes(f.element));
      // Basic jabs finish recovery. Only our authored power/mobility links cancel.
      if (action.kind !== 'melee' || !action.connected || action.t < action.chainAt || !(skill || mobility)) return;
      if (queued.mobility === 'jump' && f.element !== 'air' && !launchChase) return;
      if (queued.mobility === 'dash' && !['air', 'fire'].includes(f.element)) return;
      if (skill && (f.cooldowns[kind] > 0 || f.energy < fighterSpec(f)[`${kind}Cost`])) return;
      if (kind === 'jump' && !f.grounded && f.jumps >= 2) return;
      if (kind === 'dash' && (f.cooldowns.dash > 0 || f.dashUsed || f.energy < 8)) return;
      this.endAction(f);
      if (mobility) f.cooldowns.attack = 0;
    }
    if (queued.mobility) {
      const movement = queued.mobility;
      queued.mobility = null;
      if (this.performMobility(f, movement, queued) && movement === 'dash') {
        // Simultaneous dash + strike is an explicit paired move in our game.
        // The strike's short input window starts when that dash completes.
        queued.afterDash = true;
        queued.ttl = null;
        return;
      }
    }
    if (kind === 'jump' || kind === 'dash') {
      if (this.performMobility(f, kind, queued)) f.buffer = null;
    } else if (kind === 'interact') {
      // E: a dizzy opponent first, then a bound villager, then the nearest item (or a drop).
      // A press short of a bound villager keeps looking for him while E is held (seekRescue),
      // and near him (CAPTIVE.near) it takes an item in reach but never drops anything.
      // A bandit's E snatches a consumable instead.
      if (!this.grapples.tryGrab(this, f)) {
        if (f.team === 'player') {
          if (!this.startRescue(f)) {
            f.seekRescue = this.boundCaptives().length > 0;
            if (!this.captiveNear(f) || pickupIndex(this.state.weapons, f.x, f.depth) >= 0) this.pickup(f);
          }
        } else if (f.archetype === 'bandit') this.steal(f);
      }
      f.buffer = null;
    } else if (!f.guard) {
      // The warden strikes the way his shield faces (he turns only slowly, see updateBrace).
      if (queued.direction && f.archetype !== 'guard') f.facing = queued.direction;
      if (this.startAction(f, kind === 'attack' ? 'melee' : kind, queued.launcher)) f.buffer = null;
    }
  }

  performMobility(f, kind, queued) {
    if (kind === 'jump') {
      if (!f.grounded && f.jumps >= 2) return false;
      this.jump(f);
    } else if (kind === 'dash') {
      if (f.cooldowns.dash > 0 || f.dashUsed || f.energy < 8) return false;
      const { direction, depthDirection } = queued;
      f.dashTime = .17;
      f.dashUsed = true;
      f.cooldowns.dash = f.element === 'air' ? .55 : .85;
      f.invulnerable = Math.max(f.invulnerable, .22);
      const speed = f.element === 'air' ? MOVEMENT.airDashSpeed : MOVEMENT.dashSpeed;
      f.vx = (direction || (depthDirection ? 0 : f.facing)) * speed;
      f.vDepth = depthDirection * speed * .55;
      if (direction && depthDirection) { f.vx *= Math.SQRT1_2; f.vDepth *= Math.SQRT1_2; }
      f.vy = 0;
      f.energy -= 8;
      f.guard = false;
      this.sound('dash', f.x);
      if (f.grounded) this.footDust(f, Math.sign(f.vx) || f.facing);
      else this.effect(f.x, f.y - 30, fighterColor(f), 10);
    }
    return true;
  }

  jump(f) {
    if (f.grounded || f.jumps < 2) {
      if (f.grounded) f.jumps = 0;
      f.jumps++;
      this.sound('jump', f.x);
      f.vy = -(f.element === 'air' ? 660 : 600);
      if (f.grounded) this.footDust(f, Math.sign(f.vx) || f.facing);
      else this.effect(f.x, f.y, fighterColor(f), f.jumps === 2 ? 10 : 5);
    } else return;
    f.grounded = false;
    f.jumpTimer = 0.22;
  }

  startAction(f, kind, requestLauncher = false) {
    if (f.recoveryRoll || f.grabbedBy != null || f.grabTarget != null) return false;
    if (f.archetype) return this.startArchetypeAction(f, kind, requestLauncher);
    const spec = ELEMENTS[f.element];
    // A mill stone or a lit lantern is no club: the attack button throws it.
    if (kind === 'melee' && weaponSpec(f.weapon)?.melee === false) kind = 'throw';
    const basic = kind === 'melee' || kind === 'throw';
    const aerial = kind === 'melee' && !f.grounded;
    const launcher = kind === 'melee' && f.grounded && !f.weapon && requestLauncher;
    if (aerial && f.airChain >= COMBAT[f.element].aerial.length) return false;
    if (launcher && f.cooldowns.launcher > 0) return false;
    const key = basic ? 'attack' : kind;
    if (kind === 'throw' && !f.weapon) return false;
    if (f.cooldowns[key] > 0) return false;
    const cost = launcher ? 8 : basic ? 0 : spec[`${kind}Cost`];
    if (f.energy < cost) {
      if (f.team === 'player') this.floater(f.x, f.y - 90, 'Need energy', '#64736b');
      return false;
    }
    f.energy -= cost;
    if (kind === 'melee') {
      this.updateFinisherWindow(f);
      const target = this.targets(f).find(target => target.id === f.finisherTarget);
      const finish = !f.weapon && !f.running && f.finisherWindow > 0 && target && this.inFinisherLane(f, target);
      f.comboIndex = finish ? 3 : f.comboTimer > 0 && f.comboIndex === 1 ? 2 : 1;
      f.comboCount = f.comboTimer > 0 ? f.comboCount + 1 : 1;
      f.comboTimer = 1.05;
      if (finish) { f.finisherWindow = 0; f.finisherTarget = null; }
    }
    const airIndex = f.airChain;
    const move = kind === 'melee' ? { ...(aerial ? COMBAT[f.element].aerial[airIndex] : launcher ? COMBAT[f.element].launcher : COMBAT[f.element].steps[f.comboIndex - 1]) } : null;
    if (aerial) f.airChain++;
    if (launcher) { f.cooldowns.launcher = .8; f.running = false; }
    let windup = move?.windup ?? (kind === 'burst' ? .2 : .1);
    // Twin knives strike sooner (x0.8), the guandao winds up longer (x1.4).
    if (kind === 'melee') windup *= weaponSpec(f.weapon)?.windup ?? 1;
    if (f.team === 'enemy') {
      // The same attack always has the same readable commitment. Difficulty
      // controls the AI's choice of when and where to use it.
      windup = kind === 'melee' ? windup + (aerial ? .035 : .10) : kind === 'burst' ? .85 : .55;
    }
    const activeUntil = windup + (move?.active ?? .07);
    const duration = activeUntil + (move?.recovery ?? (kind === 'burst' ? .23 : .1));
    f.action = { kind, variant: aerial ? 'aerial' : launcher ? 'launcher' : null, airIndex: aerial ? airIndex : null,
      t: 0, windup, activeUntil, duration, chainAt: activeUntil + COMBAT_TICK, done: false, connected: false, hitIds: [], move, weapon: f.weapon,
      slash: kind === 'melee' ? this.slashFor(f, move, aerial, launcher, airIndex) : null };
    f.cooldowns[key] = basic ? duration : spec[`${kind}Cooldown`];
    f.armor = !!move?.armor && f.grounded;
    if (kind === 'melee' && f.counterReady > 0) { f.action.counter = true; f.counterReady = 0; }
    f.attackKind = kind === 'melee' && !f.grounded ? 'aerial' : kind === 'melee' && f.running ? 'runAttack' : kind;
    f.attackTimer = f.action.duration;
    f.tell = windup;
    return true;
  }

  // An archetype's strike or move (ARCHETYPE_COMBAT / ARCHETYPE_MOVES). Archetypes strike from
  // the floor and carry nothing to throw. melee runs the string in order (a launcher press asks
  // for its signature step); special / burst start the archetype's move, whose wind-up and
  // recovery are fixed per move. A melee move (shield rush, meteor whirl) becomes a melee action
  // with that move; the others fire at the end of the wind-up (archetypeMove).
  startArchetypeAction(f, kind, signature = false) {
    const spec = ARCHETYPE_STATS[f.archetype], combat = ARCHETYPE_COMBAT[f.archetype];
    if (!f.grounded || f.bellTimer > 0 || f.channel || f.consume || kind === 'throw') return false;
    let move, windup, active, recovery, variant = null, key = 'attack', cost = 0;
    if (kind === 'melee') {
      if (!combat.steps.length || f.cooldowns.attack > 0) return false;
      f.comboIndex = signature && combat.signature != null ? combat.signature + 1
        : f.comboTimer > 0 && f.comboIndex < combat.steps.length ? f.comboIndex + 1 : 1;
      f.comboCount = f.comboTimer > 0 ? f.comboCount + 1 : 1;
      f.comboTimer = 1.05;
      move = { ...combat.steps[f.comboIndex - 1] };
      // The same readable commitment as an elemental enemy's strike.
      windup = move.windup + (f.team === 'enemy' ? .10 : 0);
      active = move.active;
      recovery = move.recovery;
    } else {
      const m = ARCHETYPE_MOVES[f.archetype]?.[kind];
      cost = spec[`${kind}Cost`];
      if (!m || f.cooldowns[kind] > 0 || !(f.energy >= cost)) return false;
      // The bandit's smoke is his escape: once (spent when the pellet leaves his hand, see
      // throwPellet), and only once he is badly hurt.
      if (m.type === 'smoke' && (f.smokeUsed || f.hp > f.maxHp * R.smoke.smokeAt)) return false;
      key = kind;
      // Every third arrow is a volley; a launcher press lobs one at once.
      variant = m.type === 'arrow' && (f.shots % 3 === 2 || signature) ? 'volley' : m.type;
      windup = variant === 'volley' ? m.volleyWindup : m.windup;
      active = m.active ?? .07;
      recovery = m.recovery;
      if (m.melee) move = { windup, active, recovery, reach: m.reach, step: m.step, damage: m.damage, knockback: m.knockback, stun: m.stun,
        armor: !!m.armor, knockdown: !!m.knockdown, lift: m.lift, fall: m.fall, around: !!m.around };
      f.cooldowns[kind] = spec[`${kind}Cooldown`];
    }
    f.energy -= cost;
    const melee = !!move;
    const activeUntil = windup + active;
    const duration = activeUntil + recovery;
    f.running = false;
    // armored: a non-melee move armoured through its wind-up (the bandit's smoke throw).
    const armored = !melee && !!ARCHETYPE_MOVES[f.archetype]?.[kind]?.armor;
    f.action = { kind: melee ? 'melee' : kind, variant, airIndex: null, t: 0, windup, activeUntil, duration, chainAt: activeUntil + COMBAT_TICK,
      done: false, connected: false, hitIds: [], move: move || null, weapon: null, slash: null, armored };
    if (key === 'attack') f.cooldowns.attack = duration;
    f.armor = (!!move?.armor || armored) && f.grounded;
    f.attackKind = f.action.kind;
    f.attackTimer = duration;
    f.tell = windup;
    return true;
  }

  // The brush slash that replaces this melee action's attack trail (null keeps the trail).
  slashFor(f, move, aerial, launcher, airIndex = 0) {
    const running = f.grounded && f.running;
    if (f.weapon) {
      const arm = weaponSpec(f.weapon);
      return running && !arm.thrust ? 'slashHeavy' : arm.slash || 'slashLight';
    }
    if (running) return null; // the unarmed running rush keeps its own trail
    if (aerial || launcher) {
      const pose = move?.pose === 'airHeel' && airIndex >= 2 ? 'airDiveHeel' : move?.pose;
      return POSE_SLASH[pose] || null;
    }
    // Water's first palm is the 'sweep' trail style: a spin swirls round the body.
    return f.element === 'water' && f.comboIndex === 1 ? 'slashSpin' : null;
  }

  // Anchored at the attacker's shoulder (6 px ahead, 40 px above the feet) and following it.
  emitSlash(f, key) {
    const scale = (f.h || 66) / 66;
    const dx = 6 * f.facing * scale, dy = -40 * scale;
    this.vfx(key, f.x + dx, f.y + dy, { dir: f.facing, element: f.element, scale, floor: 40 * scale + (f.z || 0) },
      { depth: f.depth, followId: f.id, dx, dy });
  }

  // A bandit's blows also find a bound villager (the only foe who can hurt him).
  targets(f) {
    const s = this.state;
    // The player's blows also find a bound villager's cangue (three cracks break it: freeCaptive).
    if (f.team === 'player') return s.captives?.some(c => !c.freed && !c.dead) ? [...s.enemies, ...this.boundCaptives()] : s.enemies;
    if (f.archetype === 'bandit' && s.captives?.some(c => !c.freed && !c.dead)) return [s.player, ...s.captives.filter(c => !c.freed && !c.dead)];
    return [s.player];
  }

  melee(f) {
    const spec = fighterSpec(f);
    const action = f.action;
    const move = action?.move ?? fighterCombat(f).steps[Math.max(0, f.comboIndex - 1)];
    if (!move) return;
    const weapon = action?.weapon ?? f.weapon;
    const arm = weaponSpec(weapon);
    const reach = arm?.reach ?? (f.type === 'boss' ? move.reach + 28 : move.reach);
    const heavy = f.archetype ? archetypeHeavy(move) : action?.variant ? !!(move.knockdown || move.launcher) : f.comboIndex === 3 || f.attackKind === 'runAttack' || !!arm?.heavy;
    const running = f.attackKind === 'runAttack';
    // The guandao's sweep reaches a wider depth band than a fist or a pole.
    const lanes = arm?.lanes ?? 32;
    if (action?.slash && !action.slashed) {
      action.slashed = true;
      this.emitSlash(f, action.slash);
    }
    for (const target of this.targets(f)) {
      const dx = target.x - f.x;
      if (action?.hitIds.includes(target.id)) continue;
      // A whirling chain (move.around) strikes both sides, pushing every body away from it.
      const toward = move.around ? Math.sign(dx) || f.facing : f.facing;
      if (!target.dead && Math.abs(target.depth - f.depth) < lanes && (move.around || dx * f.facing > -12) && Math.abs(dx) < reach + target.w / 2 + (running ? 24 : 0) && Math.abs((target.z + target.h / 2) - (f.z + f.h / 2)) < (action?.variant === 'aerial' ? 96 : 70)) {
        const guarded = target.guard && target.facing === -toward;
        // The frost jian chills every blow and freezes on every third that lands.
        const relicFreeze = arm?.freezeEvery && ((f.weaponStreak || 0) + 1) % arm.freezeEvery === 0 ? arm.freeze : 0;
        const landed = this.damage(target, (spec.damage + (arm ? arm.damage : 0)) * (running ? 1.45 : move.damage) * (action?.counter ? 1.5 : 1), toward, f, {
          knockback: running ? spec.knockback * 1.5 : arm?.smash ? 650 : move.knockback,
          element: f.element, knockdown: running || !!arm?.smash || move.knockdown,
          heavy, light: !heavy, stun: move.stun, lift: running ? 270 : move.lift,
          launcher: !running && move.launcher, aerial: action?.variant === 'aerial', freeze: running ? 0 : action?.counter ? .6 : relicFreeze || move.freeze,
          guardBreak: move.guardBreak || !!arm?.guardBreak, contact: true, fall: move.fall, spike: move.spike, chill: arm?.chill,
          scorch: f.element === 'fire' && !running && !weapon && !!move.knockdown,
          kick: !weapon && !running && (KICK_POSES.has(move.pose) || (!action?.variant && f.comboIndex === 3 && KICK_FINISHERS.has(f.element))),
        });
        if (landed && action) {
          action.connected = true;
          action.hitIds.push(target.id);
          const blocked = (guarded && target.guard) || landed === NULLIFIED;
          if (!blocked && arm?.freezeEvery) f.weaponStreak = (f.weaponStreak || 0) + 1;
          if (!blocked && target.hitType === 'launch' && target.vy < 0) action.launched = true;
          // A finite per-flight string earns hang time only on actual contact.
          if (!blocked && move.selfLift && !action.sustained && !f.grounded) {
            f.vy = -move.selfLift;
            action.sustained = true;
          }
        }
        if (f.action !== action) return; // A parry interrupts every remaining active frame.
      }
    }
    if (!action?.spentWeapon) {
      if (!action?.slash && !move.around) this.effect(f.x + f.facing * reach * .65, f.y - f.h * .55, fighterColor(f), 5);
      if (action) action.spentWeapon = true;
      if (f.weapon && --f.weaponHits <= 0) this.breakHeld(f);
    }
  }

  // A weapon worn out in the hand snaps at the fist: its pieces fly from where it was swung.
  breakHeld(f) {
    const kind = f.weapon, scale = (f.h || 66) / 66;
    this.sound(weaponSpec(kind).breakSound || 'weaponBreak', f.x, { kind });
    this.shatterWeapon(kind, f.x + f.facing * 40 * scale, f.y - 40 * scale, f.depth, f.facing, -.08, scale);
    if (kind === 'crate') this.spillBuns(f.x + f.facing * 40 * scale, f.depth);
    f.weapon = null;
    f.weaponHits = 0;
    f.weaponFuse = null;
    f.weaponStreak = 0;
    this.floater(f.x, f.y - 90, 'Weapon broke', '#7c7260');
  }

  shoot(f) {
    const spec = ELEMENTS[f.element];
    const params = {
      air: { speed: 930, r: 20, damage: 19, knockback: 760, gravity: 0 },
      water: { speed: 720, r: 15, damage: 25, knockback: 300, gravity: 0 },
      earth: { speed: 610, r: 24, damage: 38, knockback: 570, gravity: 160 },
      fire: { speed: 800, r: 12, damage: 20, knockback: 290, gravity: 0 },
    }[f.element];
    const angles = f.element === 'fire' ? [-0.15, 0, 0.15] : [0];
    const target = f.team === 'enemy' ? this.state.player : null;
    const aim = target ? clamp((target.depth - f.depth) / Math.max(160, Math.abs(target.x - f.x)), -0.18, 0.18) : 0;
    for (const angle of angles) {
      this.state.projectiles.push({ x: f.x + f.facing * 36, y: f.y - f.h * 0.55, depth: f.depth, z: f.z + f.h * 0.55, vDepth: params.speed * (angle + aim), vx: f.facing * params.speed, vy: f.element === 'earth' ? -50 : 0, r: params.r, element: f.element, team: f.team, life: 1.5, damage: params.damage, knockback: params.knockback, gravity: params.gravity, source: f });
    }
    this.effect(f.x + f.facing * 34, f.y - f.h * 0.55, spec.color, 10);
    this.sound(SPECIAL_SFX[f.element], f.x);
  }

  burst(f) {
    const spec = ELEMENTS[f.element];
    const radius = f.type === 'boss' ? 320 : f.element === 'air' ? 280 : 235;
    const s = this.state;
    s.effects.push({ x: f.x, y: f.y - 30, r: radius, life: 0.55, maxLife: 0.55,
      color: spec.color, kind: 'signature', element: f.element, groundY: f.depth });
    this.sound(BURST_SFX[f.element], f.x);
    if (f.element === 'water') {
      f.hp = Math.min(f.maxHp, f.hp + (f.team === 'player' ? 28 : 12));
      this.floater(f.x, f.y - 100, '+ healing tide', spec.color);
    }
    if (f.element === 'air') { f.dashUsed = false; f.cooldowns.dash = 0; }
    if (f.element === 'earth') f.invulnerable = 0.65;
    for (const target of this.targets(f)) {
      if (Math.hypot(target.x - f.x, (target.depth - f.depth) * 1.4, target.z - f.z) > radius || target.dead) continue;
      const direction = Math.sign(target.x - f.x) || f.facing;
      const damage = { air: 30, water: 24, earth: 52, fire: 48 }[f.element];
      const hit = this.damage(target, damage, direction, f, { knockback: f.element === 'air' ? 950 : 650, element: f.element, knockdown: true, aoe: true });
      // An Iron Bell takes the burst whole: no lift, slow or stun follows it.
      if (hit && hit !== NULLIFIED) {
        target.vy = f.element === 'air' ? -610 : -380;
        if (f.element === 'water') target.slow = 3.5;
        if (f.element === 'earth') target.stun = Math.max(target.stun, 0.7);
      }
    }
    this.effect(f.x, f.y - 30, spec.color, 36);
    s.shake = Math.max(s.shake, 7);
  }

  damage(target, amount, direction, source, options = {}) {
    const s = this.state;
    const landing = options.throwLanding && target.thrown;
    const recoveryRequest = landing && target.buffer?.kind === 'recover' ? target.buffer : null;
    const gripHit = options.grabPunch && source?.action?.kind === 'grabPunch' &&
      source.grabTarget === target.id && target.grabbedBy === source.id;
    if (options.grabPunch && !gripHit) return false;
    if (target.dead || (!landing && !gripHit && (target.invulnerable > 0 || target.knockdown > 0)) || target.hp <= 0) return false;
    // LF2 gates ordinary low-fall contact on falling victims. Our qualified
    // aerial routes replace that gate while keeping weak standing jabs out.
    if (options.contact && !target.grounded && target.juggle > 0 && (options.fall ?? 20) < 41 &&
        !options.aerial && !options.launcher && !options.freeze && !options.knockdown) return false;
    // The Iron Bell takes the next blow whole and rings; the Gate Warden's shield stops a frontal
    // one. Either way the blow lands on nothing (NULLIFIED: truthy, the blow was spent and a shot
    // stops there, but no follow-up effect may apply).
    if (target.bellTimer > 0 && !landing && !gripHit) { this.ringBell(target, source, direction, options); return NULLIFIED; }
    if (target.archetype === 'guard' && this.shieldBlocks(target, direction, options, landing, gripHit)) {
      this.shieldClang(target, source, direction, options);
      return NULLIFIED;
    }
    // The player's blow lands on a bound villager's cangue, never on him: CAPTIVE.breakHits
    // cracks break it and free him, as holding E does.
    if (target.archetype === 'captive' && source?.team === 'player' && !target.freed) {
      this.crackCangue(target);
      return NULLIFIED;
    }
    // A bound villager kneels in his cangue: blows hurt him but never throw him around.
    if (target.archetype === 'captive') options = { ...options, knockback: 0, lift: 0, knockdown: false, launcher: false, freeze: 0, fall: 0, light: true };
    let knockback = options.knockback ?? 350;
    // The golden elixir: its taker's blows land harder and throw further (not on themselves).
    if (source && source !== target && source.power > 0) {
      amount *= ITEM_EFFECTS.pill.damage;
      knockback *= ITEM_EFFECTS.pill.knockback;
    }
    let heavy = !!(options.heavy || options.knockdown);
    let blocked = false;
    let guardBroken = false;
    const front = target.facing === -direction;
    if (target.guard && front && !options.unblockable) {
      if (target.parryTimer > 0) {
        if (options.contact && source && source !== target && source.cooldowns) {
          source.stun = .65;
          this.clearCombatInput(source);
          this.endAction(source);
          source.vx = -direction * 260;
          Object.assign(source, { hitReact: .24, hitMax: .24, hitDirection: -direction, hitStrength: .6, hitType: 'stagger' });
        }
        target.energy = Math.min(100, target.energy + 12);
        target.invulnerable = .16;
        if (target.element === 'water') target.counterReady = 1.5;
        this.floater(target.x, target.y - target.h - 12, target.element === 'water' ? 'TIDAL COUNTER' : 'PARRY', '#397d77');
        this.impact(target, source, .7, false, 'parry', direction);
        this.contactPause(target, options.contact ? source : null, 3);
        if (target.team === 'player') s.score += 25;
        return false;
      }
      if (target.energy >= 10 && !options.guardBreak) {
        blocked = true;
        target.energy -= 10;
        amount *= .2;
        knockback *= .25;
        this.floater(target.x, target.y - target.h - 8, 'BLOCK', '#718b8b');
      } else {
        guardBroken = true;
        target.guard = false;
        target.energy = Math.max(0, target.energy - 20);
        this.floater(target.x, target.y - target.h - 8, 'GUARD BREAK', '#bd6a45');
      }
    }
    const shatter = target.frozen > 0 && !blocked;
    if (shatter) {
      target.frozen = 0;
      this.crackIce(target);
      amount *= 1.25;
      heavy = true;
      knockback = Math.max(knockback, 480);
      this.floater(target.x, target.y - target.h - 16, 'SHATTER', '#419da6');
      this.sound('shatter', target.x);
    }
    if (source?.team === 'enemy') amount *= source.type === 'boss' ? 1.25 : 0.72;
    if (!blocked && !landing && !gripHit && !target.grounded && target.juggle > 0) amount /= 1 + target.juggle * .2;
    if (target.element === 'earth') { amount *= 0.86; knockback *= 0.75; }
    if (target.type === 'boss') knockback *= 0.55;
    const armored = target.armor && !heavy && !guardBroken;
    if (armored && target.bossAction?.poise != null) {
      target.bossAction.poiseHits = (target.bossAction.poiseHits ?? 0) + 1;
      target.armor = target.bossAction.poiseHits < target.bossAction.poise;
    }
    const guardedCounter = blocked && !guardBroken && target.bossAction?.move === 'tide-counter';
    if (!gripHit && !blocked && !armored && (target.grabTarget != null || target.grabbedBy != null)) this.grapples.release(this, target);
    if (armored) amount *= .6;
    // A worn jade bracer takes frontal blows on the forearm: half damage, and a blocked blow
    // never chips through it. Each frontal hit it takes wears it; the sixth breaks it. What no
    // guard can stop (a lantern bursting in the holder's own hand) it cannot stop either.
    const braced = target.armorItem === 'bracer' && target.armorHits > 0 && front && !gripHit && !landing && !options.unblockable;
    if (braced) amount *= blocked ? 0 : WEAPON_SPECS.bracer.front;
    if (!gripHit && !blocked && !armored) {
      // Fall pressure is independent of health damage. Bands preserve pressure
      // between quick hits; backing away lets it drain. Elemental finishers keep
      // their launch/freeze behavior, and bosses retain their shorter reactions.
      const pressure = target.stagger + (options.fall ?? 20);
      target.stagger = pressure > 40 ? 60 : pressure > 20 ? 40 : pressure > 0 ? 20 : 0;
      if (pressure > 60 && target.grounded && !options.launcher && !options.freeze && target.type !== 'boss') {
        options = { ...options, knockdown: true };
        heavy = true;
      }
    }
    // A blow that lands knocks a use in progress out of the hand, ends freeing a villager and
    // cuts a heal channel.
    this.cancelConsume(target);
    target.rescue = null;
    if (!blocked && !armored) this.cancelChannel(target);
    target.hp = Math.max(0, target.hp - amount);
    target.invulnerable = target.team === 'player' ? .28 : .075;
    if (braced && !blocked && --target.armorHits <= 0) this.breakArmor(target);
    if (gripHit) {
      this.endAction(target);
      this.clearCombatInput(target);
      Object.assign(target, { vx: 0, vy: 0, vDepth: 0, hitReact: .22, hitMax: .22,
        hitDirection: direction, hitStrength: .75, hitType: 'grabHit' });
    } else if (!armored) {
      target.recoveryRoll = null;
      if (!guardedCounter) this.endAction(target);
      if (!blocked) this.clearCombatInput(target);
      if (recoveryRequest) target.buffer = recoveryRequest;
      target.vx = direction * knockback;
      const airborne = !target.grounded && (target.z > 8 || target.juggle > 0);
      if (!blocked && (options.launcher || airborne)) target.juggle++;
      const knockedDown = !blocked && target.type !== 'boss' && (options.knockdown || shatter || target.juggle >= 4);
      const dizzy = !blocked && !knockedDown && !options.launcher && !options.freeze && target.stagger >= 60;
      const lift = blocked || (options.freeze && !shatter) ? 0 : shatter ? 270 : options.lift ?? (knockedDown ? 220 : options.light ? (airborne ? 160 : 0) : 190 + Math.abs(knockback) * .12);
      if (lift > 0) { target.vy = -lift; target.grounded = false; }
      if (!blocked && airborne && options.spike) target.vy = options.spike;
      const stun = blocked ? .1 : guardBroken || dizzy ? .65 : options.stun ?? 7 * COMBAT_TICK;
      target.stun = guardedCounter ? 0 : Math.max(target.stun, target.type === 'boss' && !guardBroken ? Math.min(stun, .28) : stun);
      if (knockedDown) {
        // Recovery starts on the floor, so a launched fighter never gets up midair.
        target.knockdown = .55;
        target.scorch = !!options.scorch;
        target.downTime = 0;
        target.stagger = 0;
        if (!shatter) this.floater(target.x, target.y - target.h - 14, 'KNOCKDOWN', '#7b6554');
      } else if (dizzy && target.type !== 'boss') {
        this.floater(target.x, target.y - target.h - 14, 'STAGGER', '#9a7935');
      }
      if (!blocked && options.freeze && !shatter && !knockedDown) {
        target.frozen = target.type === 'boss' ? options.freeze * .45 : options.freeze;
        target.vx = 0;
        target.burn = 0;
        // The ice column holds the fighter; the renderer's frozen block waits until it cracks.
        // A freezing blow that kills raises no column over the flying corpse.
        if ((target.z || 0) < 12 && target.hp > 0 &&
            this.vfx('iceColumn', target.x, target.depth, { scale: target.type === 'boss' ? 1.25 : Math.max(1, (target.h || 66) / 66) }, { targetId: target.id })) {
          target.iceFx = VFX.iceColumn.life;
        }
        this.floater(target.x, target.y - target.h - 14, 'FROZEN', '#419da6');
        if (target.hp > 0) this.sound('freeze', target.x);
      }
      const react = heavy ? .28 : .18;
      Object.assign(target, {
        hitReact: react, hitMax: react, hitDirection: direction,
        hitStrength: heavy ? 1 : blocked ? .25 : .55,
        hitType: target.frozen > 0 ? 'freeze' : knockedDown ? 'slam' : options.launcher ? 'launch' : dizzy || guardBroken ? 'dizzy' : 'stagger',
      });
      if (!blocked) {
        target.guard = false;
        // An archetype's blow carries no element: its KO burst is plain ink.
        target.lastHitElement = options.element || source?.element || (source?.archetype ? INK_HIT : target.element);
        if (options.element === 'water') target.slow = 1.8;
        if (options.chill) target.slow = Math.max(target.slow || 0, options.chill);
        if (options.element === 'fire') { target.burn = 1.8; target.burnTick = .4; }
      }
    } else {
      this.floater(target.x, target.y - target.h - 12, 'ARMOR', '#8b7a42');
    }
    if (source?.team === 'player' && !blocked) {
      source.energy = Math.min(100, source.energy + (source.attackKind === 'melee' ? 5 : 1));
      s.combo++;
      s.comboTimer = 2;
    }
    // floatLift stacks a follow-up blow's number (the second thrown knife) above the first.
    if (!(braced && blocked)) this.floater(target.x, target.y - target.h - (options.floatLift || 0), `${Math.ceil(amount)}`, hitColor(source, target));
    this.impact(target, source, blocked || armored ? .3 : heavy ? 1 : .55, heavy && !blocked, blocked || armored ? 'block' : 'hit', direction, !!options.kick);
    this.contactPause(target, options.contact ? source : null, blocked || armored ? 5 : 3);
    return true;
  }

  contactPause(target, source, victimTicks) {
    target.hitLag = Math.max(target.hitLag, victimTicks * COMBAT_TICK);
    target.hitLagAt = this.state.time;
    if (source && source !== target) {
      source.hitLag = Math.max(source.hitLag, 3 * COMBAT_TICK);
      source.hitLagAt = this.state.time;
    }
  }

  // direction: the push direction of the blow (the attacker stands on its -direction side).
  // kick: the blow landed with a foot. x places the impact's sound in the stereo field.
  impact(target, source, strength, heavy, kind = 'hit', direction = target.hitDirection, kick = false) {
    const s = this.state;
    // An archetype's blow is plain ink: no element layer, an untinted spark, a neutral sound.
    const element = source?.archetype ? null : source?.element || target.element;
    strength = clamp(strength, 0, 1);
    s.lastImpact = { id: (s.lastImpact?.id || 0) + 1, element, heavy, kind, team: target.team, strength, x: target.x, kick: !!kick };
    s.impacts.push(s.lastImpact);
    if (s.impacts.length > 16) s.impacts.shift();
    s.shake = Math.max(s.shake, kind === 'land' ? 2.5 : heavy ? 8 : kind === 'parry' ? 4 : 3 * strength);
    if (kind === 'land') return;
    const dir = direction < 0 ? -1 : 1;
    const y = target.y - target.h * .55;
    const at = { depth: target.depth };
    if (kind === 'parry') {
      if (this.vfx('parry', target.x - dir * 10, y, { dir }, at)) target.guardFx = VFX.parry.life;
    } else if (kind === 'block') {
      if (this.vfx('guard', target.x - dir * 8, y, { dir, element: target.element }, at)) target.guardFx = VFX.guard.life;
    } else {
      // The element layer goes under the spark; debris lands on the target's floor line.
      const floor = target.depth - y;
      if (element) this.vfx(element, target.x - dir * 10, y, { dir, heavy, floor }, at);
      this.vfx(heavy ? 'hitHeavy' : 'hitLight', target.x - dir * 10, y, { dir, element, floor }, at);
    }
  }

  // Spawns an ink effect (VFX key from src/vfx-art.js). p: draw params (dir, element, heavy,
  // floor, scale, variant ...). options: depth (floor y for depth sorting; default y), delay
  // (seconds before it starts), followId (fighter it stays anchored to, with dx/dy offsets),
  // targetId (fighter it acts on), life (override). Returns the effect, or null when capped.
  vfx(key, x, y, p = {}, options = {}) {
    const def = VFX[key];
    const s = this.state;
    if (!def || s.effects.length >= (AMBIENT_VFX.has(key) ? AMBIENT_EFFECT_CAP : MAX_EFFECTS)) return null;
    const life = options.life ?? def.life;
    s.vfxSerial = (s.vfxSerial || 0) % 9973 + 1;
    const effect = { kind: 'vfx', fx: key, x, y, depth: options.depth ?? y,
      life: life + (options.delay || 0), maxLife: life, p: { ...def.p, seed: s.vfxSerial, ...p } };
    if (options.followId != null) Object.assign(effect, { followId: options.followId, dx: options.dx || 0, dy: options.dy || 0 });
    if (options.targetId != null) effect.targetId = options.targetId;
    s.effects.push(effect);
    return effect;
  }

  // Records a sound cue for src/game-audio.js: name is an SFX of the src/audio.js bank, x the
  // arena position it pans to, params its draw-free variant data (strength, kind, weapon ...).
  // A short ring buffer read by id cursor, like impacts; it never draws from this.random().
  sound(name, x = 640, params = {}) {
    const s = this.state;
    s.soundSerial = (s.soundSerial || 0) + 1;
    (s.sounds ??= []).push({ id: s.soundSerial, name, x, params });
    if (s.sounds.length > MAX_SOUNDS) s.sounds.shift();
  }

  // Team command bubble over a fighter's head ('come', 'stay', 'move', 'join'); it follows the
  // fighter (headIconLift above its height, clear of its health bar). The bound villager calls
  // and cheers with them; the renderer draws whatever is spawned.
  commandIcon(f, command) {
    if (!command) return null;
    const key = `icon${command[0].toUpperCase()}${command.slice(1)}`;
    if (VFX[key]?.layer !== 'head') return null;
    return this.vfx(key, f.x, f.y - f.h - headIconLift(f),
      { color: fighterColor(f), dir: f.facing }, { depth: f.depth, followId: f.id });
  }

  // An archetype effect (src/enemy-art.js kinds: healSigil, stuckArrow, healTether, ironBell,
  // shieldClang, smokePuff, freedBurst), a plain state.effects entry under the shared cap.
  enemyFx(effect) {
    const s = this.state;
    if (s.effects.length >= MAX_EFFECTS) return null;
    s.effects.push(effect);
    return effect;
  }

  // ---- archetype mechanics -------------------------------------------------------------
  // The move that fires at the end of an archetype's wind-up (ARCHETYPE_MOVES type).
  archetypeMove(f, action) {
    if (action.variant === 'smoke') this.throwPellet(f);
    else if (action.variant === 'arrow') this.fireArrow(f);
    else if (action.variant === 'volley') this.fireVolley(f);
    else if (action.variant === 'hook') this.throwHook(f);
    else if (action.variant === 'talisman') this.throwTalisman(f);
    else if (action.variant === 'bell') this.raiseBell(f);
  }

  // The Reed Archer's flat shot: level from the bow, fast, no gravity; it is gone at range.
  fireArrow(f) {
    const A = R.arrow, scale = f.h / 66, target = f.team === 'enemy' ? this.state.player : null;
    const aim = target ? clamp((target.depth - f.depth) / Math.max(160, Math.abs(target.x - f.x)), -0.18, 0.18) : 0;
    this.state.projectiles.push({ kind: 'arrow', x: f.x + f.facing * 30 * scale, y: f.y - 47 * scale, depth: f.depth, z: f.z + 47 * scale,
      vx: f.facing * A.speed, vy: 0, vDepth: A.speed * aim, gravity: 0, r: A.r, team: f.team, life: A.range / A.speed,
      damage: A.damage, knockback: A.knockback, element: null, source: f });
    f.shots += 1;
    this.sound('whoosh', f.x, { strength: .6 });
  }

  // Three-Reed Volley: three arrows loosed 45 degrees up, landing a line apart around the target's
  // feet (led by its movement as far as the archer's skill reads it: f.aimLead 0..1). Each lands
  // exactly where its launch speed says: from height z0, range R needs u = R sqrt(g / 2(R + z0)).
  fireVolley(f) {
    const V = R.volley, scale = f.h / 66, s = this.state, p = f.team === 'enemy' ? s.player : null;
    const x0 = f.x + f.facing * 24 * scale, z0 = f.z + 58 * scale;
    const reach = target => Math.max(80, (target - x0) * f.facing);
    let tx = p ? p.x : x0 + f.facing * 300, td = p ? p.depth : f.depth;
    if (p && f.aimLead > 0) {
      const flight = reach(tx) / (reach(tx) * Math.sqrt(V.gravity / (2 * (reach(tx) + z0))));
      tx += (p.vx || 0) * flight * f.aimLead;
      td += (p.vDepth || 0) * flight * f.aimLead;
    }
    td = clamp(td, 395, 650);
    for (let i = 0; i < V.count; i += 1) {
      const range = Math.max(60, reach(tx) + (i - (V.count - 1) / 2) * V.spread);
      const u = range * Math.sqrt(V.gravity / (2 * (range + z0)));
      const t = range / u;
      s.projectiles.push({ kind: 'arrow', lob: true, x: x0, y: f.depth - z0, depth: f.depth, z: z0, vx: f.facing * u, vy: -u,
        vDepth: (td - f.depth) / t, gravity: V.gravity, r: V.r, team: f.team, life: t + .5, damage: V.damage, knockback: V.knockback,
        element: null, source: f });
    }
    f.shots += 1;
    this.sound('whoosh', f.x, { strength: 1.1 });
  }

  // The Chain Ox's hook: thrown level at the target's lane; on a hit it yanks the victim in.
  throwHook(f) {
    const H = R.hook, scale = f.h / 66, target = f.team === 'enemy' ? this.state.player : null;
    const aim = target ? clamp((target.depth - f.depth) / Math.max(160, Math.abs(target.x - f.x)), -0.18, 0.18) : 0;
    const shot = { kind: 'chainHook', x: f.x + f.facing * 34 * scale, y: f.y - 42 * scale, depth: f.depth, z: f.z + 42 * scale,
      vx: f.facing * H.speed, vy: 0, vDepth: H.speed * aim, gravity: 0, r: H.r, team: f.team, life: H.range / H.speed,
      damage: H.damage, knockback: H.knockback, element: null, source: f };
    this.anchorHook(shot);
    this.state.projectiles.push(shot);
    this.sound('throw', f.x);
  }

  // The chain runs back to the thrower's fist (p.ox, p.oy); with its thrower down it drops.
  anchorHook(shot) {
    const src = shot.source;
    if (!src || src.dead || !(src.hp > 0) || src.knockdown > 0) { shot.life = 0; return; }
    const scale = src.h / 66;
    shot.ox = src.x + src.facing * 38 * scale;
    shot.oy = src.y - 40 * scale;
  }

  // A hooked victim is reeled in at R.hook.reel px/s to R.hook.pullTo px in front of the Ox, in
  // his lane (f.pull, see updateFighter), held for the reel and a beat after it.
  hookPull(shot, target, direction) {
    const src = shot.source;
    if (!src || src.dead) return;
    const x = clamp(src.x + direction * R.hook.pullTo, this.state.bounds.left + target.w / 2, this.state.bounds.right - target.w / 2);
    const travel = Math.hypot(x - target.x, src.depth - target.depth);
    target.pull = { x, depth: src.depth };
    target.vx = 0;
    target.vDepth = 0;
    target.stun = Math.max(target.stun, travel / R.hook.reel + .15);
    this.floater(target.x, target.y - target.h - 30, 'HOOKED', ARCHETYPES.brute.color);
  }

  // The Talisman Priest's slip: slow, homing on the target's chest; it seals specials (sealHit).
  throwTalisman(f) {
    const T = R.talisman, scale = f.h / 66;
    this.state.projectiles.push({ kind: 'talisman', x: f.x + f.facing * 30 * scale, y: f.y - 50 * scale, depth: f.depth, z: f.z + 50 * scale,
      vx: f.facing * T.speed, vy: 0, vDepth: 0, gravity: 0, r: T.r, team: f.team, life: T.life, damage: T.damage, knockback: T.knockback,
      element: null, source: f });
    this.sound('whoosh', f.x, { strength: .5 });
  }

  // Homing: the slip turns at most R.talisman.turn rad/s toward its target in the floor plane and
  // eases to its chest height. A parried (player-team) slip flies straight.
  steerTalisman(shot, dt) {
    if (shot.team !== 'enemy') return;
    const p = this.state.player;
    if (!p || p.dead || !(p.hp > 0)) return;
    const speed = Math.hypot(shot.vx, shot.vDepth || 0) || R.talisman.speed;
    const heading = Math.atan2(shot.vDepth || 0, shot.vx);
    let turn = Math.atan2(p.depth - shot.depth, p.x - shot.x) - heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const step = clamp(turn, -R.talisman.turn * dt, R.talisman.turn * dt);
    shot.vx = Math.cos(heading + step) * speed;
    shot.vDepth = Math.sin(heading + step) * speed;
    shot.z += (p.z + p.h * .55 - shot.z) * Math.min(1, dt * 3);
  }

  sealHit(target) {
    target.sealed = Math.max(target.sealed || 0, R.talisman.seal);
    this.floater(target.x, target.y - target.h - 30, 'SEALED', ARCHETYPES.sorcerer.color);
  }

  // The Road Cutthroat's smoke pellet, dropped at his feet (R.smoke.vx / vy): his one escape
  // is spent as it leaves his hand. He holds still until it bursts (EnemyAI.archetypeErrand).
  throwPellet(f) {
    const S = R.smoke, scale = f.h / 66;
    f.smokeUsed = true;
    this.state.projectiles.push({ kind: 'smokePellet', x: f.x + f.facing * 8 * scale, y: f.y - 30 * scale, depth: f.depth, z: f.z + 30 * scale,
      vx: f.facing * S.vx, vy: S.vy, vDepth: 0, gravity: S.gravity, r: 5, team: f.team, life: 2, damage: 0, knockback: 0,
      element: null, source: f });
    this.sound('throw', f.x);
  }

  // The pellet bursts where it lands: a smoke puff that swallows the bandit, who holds still in it,
  // hidden (no HP bar, nothing can hit him), for R.smoke.hide s and then flees. Knocked out of
  // its reach before it burst, he is not hidden and may try again.
  smokeBurst(shot) {
    const S = R.smoke, s = this.state;
    this.enemyFx({ kind: 'smokePuff', x: shot.x, y: shot.depth, depth: shot.depth, r: S.r, life: S.life, maxLife: S.life });
    this.sound('dash', shot.x);
    const f = shot.source;
    if (!f || f.dead || !(f.hp > 0)) return;
    if (!this.inSmoke(f, shot.x, shot.depth)) { f.smokeUsed = false; return; }
    f.smokeTimer = S.hide;
    f.invulnerable = Math.max(f.invulnerable, S.hide);
    if (f.ai) f.ai.fleeUntil = s.time + S.hide + S.flee;
  }

  // Whether a body at its feet stands inside a smoke puff burst at (x, depth): the puff
  // (R.smoke.r, about 96 x 78 px at its peak) swallows a 64 px bandit within half its radius.
  inSmoke(f, x, depth) {
    return Math.abs(f.x - x) <= R.smoke.r * .5 && Math.abs(f.depth - depth) <= 20 && (f.z || 0) < 20;
  }

  // The Mendicant Monk plants his staff: the Iron Bell stands for R.bell.time s.
  raiseBell(f) {
    f.bellTimer = R.bell.time;
    f.vx = 0;
    f.vDepth = 0;
    this.floater(f.x, f.y - f.h - 32, 'IRON BELL', '#a98b49');
    this.sound('block', f.x, { strength: .5 });
  }

  // A blow on the Iron Bell is nullified: the bell rings out (the 'ironBell' effect, its ripples
  // spreading as it fades) and a striker in contact reels dizzy for R.bell.dizzy s.
  ringBell(target, source, direction, options) {
    const s = this.state, scale = (target.h || 66) / 66;
    target.bellTimer = 0;
    target.invulnerable = Math.max(target.invulnerable, .2);
    this.enemyFx({ kind: 'ironBell', x: target.x, y: target.depth, depth: target.depth, h: BELL_H * scale, w: BELL_W * scale,
      ring: 1, life: R.bell.ring, maxLife: R.bell.ring });
    this.sound('parry', target.x);
    // BELL RINGS replaces his IRON BELL label (still rising if the bell went up just now) and
    // sits above a reeling striker's DIZZY beside him.
    s.floaters = s.floaters.filter(f => !(f.text === 'IRON BELL' && Math.abs(f.x - target.x) < 1));
    this.floater(target.x, target.y - target.h - 50, 'BELL RINGS', '#a98b49');
    s.shake = Math.max(s.shake, 4);
    if (options.contact && source && source !== target && source.cooldowns && !source.dead && source.hp > 0) {
      this.clearCombatInput(source);
      this.endAction(source);
      source.stun = Math.max(source.stun, R.bell.dizzy);
      source.stagger = 0;
      source.vx = -direction * 120;
      Object.assign(source, { hitReact: .24, hitMax: .24, hitDirection: -direction, hitStrength: .6, hitType: 'dizzy' });
      this.floater(source.x, source.y - source.h - 14, 'DIZZY', '#9a7935');
    }
    this.contactPause(target, options.contact ? source : null, 4);
  }

  // The Gate Warden's shield takes a frontal blow or shot, unless it breaks guards, is a body
  // throw or a throw's landing, a blast or a signature burst, or he is down, stunned, frozen or held.
  shieldBlocks(target, direction, options, landing, gripHit) {
    return target.facing === -direction && !landing && !gripHit && !options.guardBreak && !options.thrownBody &&
      !options.unblockable && !options.blast && !options.aoe && target.grounded && !(target.stun > 0) && !(target.knockdown > 0) &&
      !(target.frozen > 0) && target.grabbedBy == null && target.grabTarget == null;
  }

  shieldClang(target, source, direction, options) {
    const scale = (target.h || 66) / 66;
    this.enemyFx({ kind: 'shieldClang', x: target.x + target.facing * 17 * scale, y: target.y - 40 * scale, depth: target.depth,
      r: 11, direction: target.facing, life: .22, maxLife: .22 });
    this.floater(target.x, target.y - target.h - 8, 'BLOCK', '#6b7c86');
    this.sound('block', target.x, { strength: 1 });
    target.brace = 1;
    if (options.contact && source && source !== target && source.cooldowns) source.vx = -direction * 160;
    this.contactPause(target, options.contact ? source : null, 4);
  }

  // The warden braces (the shield-rim glint, f.brace) while his foe stands in front, and turns to
  // a foe behind him only after R.shield.turn s, so getting behind him (or over him) opens him up.
  updateBrace(f, dt) {
    const p = this.state.player;
    const live = p && !p.dead && p.hp > 0;
    const dx = live ? p.x - f.x : 0;
    const able = !(f.stun > 0 || f.knockdown > 0 || f.frozen > 0) && f.grabbedBy == null;
    f.brace = able && live && dx * f.facing > 0 && Math.abs(dx) < R.shield.brace && Math.abs(p.depth - f.depth) < 60 ? 1 : 0;
    const behind = able && live && !f.action && dx * f.facing < -6 && Math.abs(dx) < 420;
    f.turnTimer = behind ? f.turnTimer + dt : 0;
    if (f.turnTimer >= R.shield.turn) { f.facing = -f.facing; f.turnTimer = 0; }
  }

  // The Talisman Priest's heal: R.channel.time s through a tether, R.channel.rate health per
  // second to one hurt ally in range. It takes the burst cooldown; a landed blow cuts it.
  startChannel(f, ally) {
    if (f.archetype !== 'sorcerer' || f.channel || f.action || !f.grounded || f.hp <= 0 || f.cooldowns.burst > 0 ||
        f.stun > 0 || f.knockdown > 0 || f.frozen > 0 || f.grabbedBy != null || f.grabTarget != null) return false;
    if (!ally || ally === f || ally.dead || !(ally.hp > 0) || ally.team !== f.team || ally.hp >= ally.maxHp ||
        Math.abs(ally.x - f.x) > R.channel.range) return false;
    const time = R.channel.time;
    f.channel = { targetId: ally.id, t: 0, time, sigil: null, tether: null };
    f.cooldowns.burst = ARCHETYPE_STATS.sorcerer.burstCooldown;
    Object.assign(f, { vx: 0, vDepth: 0, running: false, guard: false });
    if (Math.abs(ally.x - f.x) > 4) f.facing = ally.x > f.x ? 1 : -1;
    f.channel.sigil = this.enemyFx({ kind: 'healSigil', x: ally.x, y: ally.depth, depth: ally.depth, r: 30 * ally.h / 66, life: time, maxLife: time });
    f.channel.tether = this.enemyFx({ kind: 'healTether', x: f.x, y: f.y, tx: ally.x, ty: ally.y, depth: f.depth, life: time, maxLife: time });
    this.placeTether(f, ally);
    this.sound('energyPickup', f.x);
    return true;
  }

  // The sigil lies under the ally; the tether runs from the priest's slip hand to its chest.
  placeTether(f, ally) {
    const c = f.channel, scale = f.h / 66;
    if (c.sigil) { c.sigil.x = ally.x; c.sigil.y = c.sigil.depth = ally.depth; }
    if (c.tether) {
      Object.assign(c.tether, { x: f.x + f.facing * 22 * scale, y: f.y - 60 * scale, tx: ally.x, ty: ally.y - ally.h * .62,
        depth: Math.max(f.depth, ally.depth) });
    }
  }

  updateChannel(f, dt) {
    const c = f.channel;
    const ally = this.state.enemies.find(e => e.id === c.targetId);
    if (!ally || ally.dead || !(ally.hp > 0) || f.hp <= 0 || f.action || f.stun > 0 || f.knockdown > 0 || f.frozen > 0 ||
        f.grabbedBy != null || Math.abs(ally.x - f.x) > R.channel.range * 1.25) { this.cancelChannel(f); return; }
    const step = Math.min(dt, c.time - c.t);
    ally.hp = Math.min(ally.maxHp, ally.hp + R.channel.rate * step);
    c.t += step;
    f.vx = 0;
    f.vDepth = 0;
    this.placeTether(f, ally);
    if (c.t >= c.time - 1e-9) f.channel = null;
  }

  // A cut channel: the ward and the tether fade at once.
  cancelChannel(f) {
    const c = f.channel;
    if (!c) return;
    f.channel = null;
    if (c.sigil) c.sigil.life = Math.min(c.sigil.life, .15);
    if (c.tether) c.tether.life = Math.min(c.tether.life, .15);
  }

  // A bandit's E: he snatches the consumable at his feet (the nearest in pickup reach, a weapon
  // lying nearer or a planted censer aside, as EnemyAI.stealInput picks it) and runs off with it
  // (it drops where he falls). One at a time.
  steal(f) {
    const s = this.state;
    if (f.stolen || !f.grounded) return false;
    let index = -1, best = Infinity;
    for (let i = 0; i < s.weapons.length; i += 1) {
      const w = s.weapons[i];
      if (!CONSUMABLES[w.kind] || w.kind === 'incense') continue;
      const dx = Math.abs(w.x - f.x), dDepth = Math.abs((w.depth ?? w.y) - f.depth);
      if (dx >= PICKUP_REACH.x || dDepth >= PICKUP_REACH.depth) continue;
      const distance = dx / PICKUP_REACH.x + dDepth / PICKUP_REACH.depth;
      if (distance < best) { index = i; best = distance; }
    }
    if (index < 0) return false;
    const [item] = s.weapons.splice(index, 1);
    f.stolen = { kind: item.kind, variant: item.variant ?? null };
    this.floater(f.x, f.y - f.h - 20, 'STOLEN!', ARCHETYPES.bandit.color);
    this.sound('grab', f.x);
    if (f.ai) f.ai.fleeUntil = s.time + R.steal.flee;
    return true;
  }

  // E beside a bound villager starts freeing him (rescueCandidate in src/grapples.js).
  startRescue(f) {
    const c = rescueCandidate(f, this.state.captives);
    if (!c) return false;
    f.rescue = { id: c.id, t: 0 };
    f.seekRescue = false;
    Object.assign(f, { vx: 0, vDepth: 0, running: false, guard: false });
    if (Math.abs(c.x - f.x) > 4) f.facing = c.x > f.x ? 1 : -1;
    this.sound('grab', c.x);
    return true;
  }

  // Bound villagers still waiting on the field (revealed, alive, not yet freed).
  boundCaptives() {
    return (this.state.captives || []).filter(c => !c.dead && !c.freed && c.hp > 0 && !(c.spawnReveal > 0));
  }

  // A bound villager close to f (CAPTIVE.near): E there drops nothing.
  captiveNear(f) {
    return this.boundCaptives().some(c => Math.abs(c.x - f.x) < CAPTIVE.near.x && Math.abs(c.depth - f.depth) < CAPTIVE.near.depth);
  }

  // Held E works the cangue for CAPTIVE.hold s; letting go, a blow, being pushed out of reach or
  // the villager falling ends it (and the progress); a new press starts over.
  updateRescue(f, input, dt) {
    const r = f.rescue;
    const c = this.state.captives?.find(v => v.id === r.id);
    if (!c || c.freed || !(c.hp > 0) || !input.interactHeld || !f.grounded || f.action || f.consume ||
        Math.abs(c.x - f.x) >= CAPTIVE.reach.x || Math.abs(c.depth - f.depth) >= CAPTIVE.reach.depth) { f.rescue = null; return; }
    r.t = Math.min(CAPTIVE.hold, r.t + dt);
    if (r.t >= CAPTIVE.hold - 1e-9) {
      f.rescue = null;
      this.freeCaptive(c);
    }
  }

  // A player's blow on the cangue: a woody crack and splinters; the last crack frees him.
  crackCangue(c) {
    c.cangueHits = (c.cangueHits || 0) + 1;
    this.sound('weaponBreak', c.x, { kind: 'crate' });
    this.vfx('hitLight', c.x, c.y - c.h * .55, { dir: c.facing }, { depth: c.depth });
    if (c.cangueHits >= CAPTIVE.breakHits) this.freeCaptive(c);
    else this.floater(c.x, c.y - c.h - 46, `CANGUE ${c.cangueHits}/${CAPTIVE.breakHits}`, '#8a6a3a');
  }

  // Freed: the cangue bursts off (freedBurst), a herbal tonic drops beside him, the rescue
  // scores, and he cheers ('join' bubble), then hobbles off the nearest edge.
  freeCaptive(c) {
    const s = this.state;
    Object.assign(c, { freed: true, cheer: CAPTIVE.cheer, calling: 0, stun: 0, hitReact: 0 });
    this.enemyFx({ kind: 'freedBurst', x: c.x, y: c.depth, depth: c.depth, h: c.h, life: 1, maxLife: 1 });
    const d = clamp(c.depth, 440, 640);
    s.weapons.push({ x: clamp(c.x + c.facing * 34, s.bounds.left + 30, s.bounds.right - 30), y: d, depth: d, kind: 'heal', life: ITEM_LIFE,
      seed: Math.round(this.visualRandom() * 1000) / 100 });
    s.score += CAPTIVE.reward;
    // Over his join bubble (commandIcon), not on it.
    this.floater(c.x, c.y - c.h - 72, `RESCUED +${CAPTIVE.reward}`, '#56905d');
    this.sound('weaponBreak', c.x, { kind: 'crate' });
    this.sound('energyPickup', c.x);
    this.commandIcon(c, 'join');
  }

  // Bound villagers kneel (a bandit closing in makes them call for help, the 'come' bubble, but
  // not while the player stands within reach: his rescue tag and gauge take that spot, so a
  // bubble already up there fades out); freed ones cheer, then hobble to the nearest edge and
  // vanish in a reversed swirl. One cut down by the bandits lies curled up: the rescue is lost.
  updateCaptives(dt) {
    const s = this.state;
    if (!s.captives?.length) return;
    const p = s.player;
    for (const c of s.captives) {
      if (c.dead) continue;
      if (!(c.hp > 0)) { this.loseCaptive(c); continue; }
      let input = NO_INPUT;
      if (c.freed) {
        c.cheer = Math.max(0, c.cheer - dt);
        if (!c.cheer) {
          const left = c.x < (s.bounds.left + s.bounds.right) / 2;
          if (left ? c.x <= s.bounds.left + c.w / 2 + 1 : c.x >= s.bounds.right - c.w / 2 - 1) {
            c.dead = true;
            this.vfx('spawn', c.x, c.depth, { reverse: true });
            continue;
          }
          input = left ? WALK_LEFT : WALK_RIGHT;
        }
      } else {
        c.calling = Math.max(0, c.calling - dt);
        c.callTimer -= dt;
        const helped = p && !p.dead && p.hp > 0 && (p.rescue?.id === c.id ||
          (Math.abs(p.x - c.x) < CAPTIVE.reach.x && Math.abs(p.depth - c.depth) < CAPTIVE.reach.depth));
        if (helped) this.hushCall(c);
        else if (c.callTimer <= 0 && !(c.spawnReveal > 0) && s.enemies.some(e => e.archetype === 'bandit' && !e.dead &&
            Math.abs(e.x - c.x) < 260 && Math.abs(e.depth - c.depth) < 90)) {
          c.callTimer = CAPTIVE.callEvery;
          c.calling = .9;
          this.commandIcon(c, 'come');
        }
      }
      if (!(c.spawnReveal > 0)) this.updateFighter(c, input, dt);
    }
    s.captives = s.captives.filter(c => !c.dead);
  }

  // A villager's call for help ('come' bubble) jumps to its fade-out.
  hushCall(c) {
    c.calling = 0;
    for (const e of this.state.effects) {
      if (e.kind === 'vfx' && e.fx === 'iconCome' && e.followId === c.id) e.life = Math.min(e.life, e.maxLife * ICON_FADE);
    }
  }

  loseCaptive(c) {
    const s = this.state;
    c.dead = true;
    s.corpses.push(this.corpseOf(c));
    this.floater(c.x, Math.min(c.y - c.h, 640), 'CAPTIVE LOST', '#8b6a4a');
    this.koBurst(c);
    this.sound('enemyDown', c.x);
  }

  // Jumps a fighter's ice column to its crack (a shatter, or a thaw before the column ends).
  crackIce(f) {
    f.iceFx = 0;
    for (const e of this.state.effects) {
      if (e.kind === 'vfx' && e.fx === 'iceColumn' && e.targetId === f.id) e.life = Math.min(e.life, e.maxLife * (1 - ICE_CRACK_T));
    }
  }

  // E: picks up the nearest item in reach (pickupIndex in src/data.js): a weapon into the fists,
  // the bracer onto the lead forearm; a consumable starts its use, see startConsume. With nothing
  // in reach it drops the weapon, or else tosses the bracer off; both land as pickups that keep
  // their wear (and a lantern its fuse).
  pickup(f) {
    if (!f.grounded || f.consume) return;
    const s = this.state;
    const index = pickupIndex(s.weapons, f.x, f.depth);
    if (index < 0) {
      if (f.weapon) {
        s.weapons.push(this.droppedWeapon(f, f.facing * 30));
        f.weapon = null;
        f.weaponHits = 0;
        f.weaponFuse = null;
        f.weaponStreak = 0;
      } else if (f.armorItem) this.tossArmor(f);
      return;
    }
    const [item] = s.weapons.splice(index, 1);
    if (CONSUMABLES[item.kind]) { this.startConsume(f, item); return; }
    const spec = weaponSpec(item.kind);
    if (spec.worn) {
      // Worn armour leaves the fists free: a held weapon stays in hand.
      if (f.armorItem) this.tossArmor(f);
      f.armorItem = item.kind;
      f.armorHits = item.uses ?? spec.hits;
    } else {
      if (f.weapon) s.weapons.push(this.droppedWeapon(f, -f.facing * 35));
      f.weapon = item.kind;
      f.weaponHits = item.uses ?? spec.hits ?? 14;
      // A lantern's fuse lights as it is lifted and keeps burning only while carried.
      f.weaponFuse = spec.fuse ? item.fuse ?? spec.fuse : null;
      // A frost jian counts its own landed blows: every weapon in the hand starts a fresh count.
      f.weaponStreak = 0;
    }
    this.sound('pickupWeapon', f.x, { kind: item.kind });
    this.floater(f.x, f.y - 100, `${weaponLabel(item.kind)} ${spec.worn ? 'WORN' : 'EQUIPPED'}`, '#6e6856');
  }

  // A consumable taken up: its use starts (CONSUMABLES[kind].useTime, effect at applyAt; see
  // updateConsume). The fighter turns to the item, which hops from where it lay (from, in the
  // fighter's pose units: across in its facing, and the lane offset) into the hand. A held weapon
  // stays in hand, stowed on the back while the use plays.
  startConsume(f, item) {
    const spec = CONSUMABLES[item.kind];
    const scale = (f.h || 66) / 66;
    const dx = item.x - f.x;
    if (Math.abs(dx) > 6) f.facing = dx > 0 ? 1 : -1;
    f.consume = { kind: item.kind, variant: item.variant ?? null, t: 0, duration: spec.useTime,
      from: [dx * f.facing / scale, ((item.depth ?? item.y) - f.depth) / scale], applied: false, sounded: false };
    // The fighter stops where it stands: a run does not slide on through the use.
    f.vx = 0;
    f.vDepth = 0;
    f.guard = false;
    f.running = false;
    f.parryTimer = 0;
    this.useCue(f);
  }

  // Anything that takes the body out of its stance cuts a use short (a hit already has).
  useBroken(f) {
    return f.stun > 0 || f.knockdown > 0 || f.frozen > 0 || f.grabbedBy != null || f.grabTarget != null || !!f.thrown ||
      !!f.recoveryRoll || !f.grounded || f.hp <= 0 || !!f.action || !!f.bossAction;
  }

  // A use cut short: the item is knocked out of the hand and lost (consumeLost tells the renderer
  // to send it flying); an effect that already landed stays.
  cancelConsume(f) {
    const c = f.consume;
    if (!c) return;
    f.consume = null;
    const s = this.state;
    s.itemSerial = (s.itemSerial || 0) + 1;
    f.consumeLost = { kind: c.kind, variant: c.variant, applied: c.applied, serial: s.itemSerial };
    if (PORCELAIN.has(c.kind)) this.sound('smash', f.x);
  }

  updateConsume(f, dt) {
    const c = f.consume;
    const spec = CONSUMABLES[c.kind];
    c.t = Math.min(c.duration, c.t + dt);
    this.useCue(f);
    if (!c.applied && c.t >= spec.applyAt * c.duration - 1e-9) this.landUse(f, c);
    if (c.t >= c.duration - 1e-9) f.consume = null;
  }

  // A drink's or food's gulp, once, at its cue point (USE_GULP).
  useCue(f) {
    const c = f.consume;
    const at = USE_GULP[c.kind];
    if (at == null || c.sounded || c.t < at * c.duration - 1e-9) return;
    c.sounded = true;
    this.sound(useSound(c.kind), f.x, { part: 'gulp' });
  }

  // The effect point of a use: the effect, with the restore chime or the sparkle.
  landUse(f, c) {
    c.applied = true;
    this.applyConsumable(f, c);
    if (USE_GULP[c.kind] != null) this.sound(useSound(c.kind), f.x, { part: 'chime' });
    else this.sound('energyPickup', f.x);
  }

  // The effect of a use, once, at its applyAt (ITEM_EFFECTS): health, energy, cleansing, the
  // gourd's qi flow, the elixir's power, a planted censer field, or a spirit orb's energy (its
  // own element's orb gives more and clears the burst cooldown). Then the floater and the
  // consume sparkle (a 'consume' effect following the fighter).
  applyConsumable(f, c) {
    const s = this.state;
    const E = ITEM_EFFECTS[c.kind] || {};
    const own = c.kind === 'orb' && c.variant === f.element;
    if (E.hp) f.hp = Math.min(f.maxHp, f.hp + E.hp);
    const energy = own ? E.own : E.en;
    if (energy) f.energy = Math.min(f.maxEnergy, f.energy + energy);
    if (own) f.cooldowns.burst = 0;
    // The peach clears burn and slow. Never freeze: a frozen fighter cannot start a use, and a
    // freeze cuts one short (useBroken) before its effect.
    let cleansed = false;
    if (E.cleanse) {
      cleansed = f.burn > 0 || f.slow > 0;
      f.burn = 0;
      f.slow = 0;
    }
    if (E.flow) f.qiFlow = E.flow;
    if (E.power) f.power = E.power;
    if (E.field) this.plantCenser(f, E.field);
    const [text, color] = ITEM_FLOATERS[c.kind] || ['+', '#263b3c'];
    this.floater(f.x, f.y - 95, own ? '+ ENERGY · BURST READY' : cleansed ? '+ HEALTH · CLEANSED' : text, own ? ELEMENTS[f.element].color : color);
    if (s.effects.length < MAX_EFFECTS) {
      s.effects.push({ kind: 'consume', item: c.kind, variant: c.variant, followId: f.id, x: f.x, y: f.y, depth: f.depth,
        h: f.h, facing: f.facing, life: CP_SPARKLE_TIME, maxLife: CP_SPARKLE_TIME });
    }
  }

  // The censer is set down CP_PLANT_X ahead of the feet (where the use pose lowered it): its
  // field regenerates the placer's team. The oldest field goes past MAX_AURAS.
  plantCenser(f, field) {
    const s = this.state;
    const scale = (f.h || 66) / 66;
    (s.auras ??= []).push({ x: f.x + f.facing * CP_PLANT_X * scale, depth: f.depth, team: f.team, facing: f.facing, scale,
      life: field.life, maxLife: field.life, r: field.r, rate: field.rate });
    if (s.auras.length > MAX_AURAS) s.auras.shift();
  }

  // Censer fields burn down; each heals its team's living fighters inside it (an ellipse r across
  // and FIELD_DEPTH r deep) by rate per second. censerRegen marks who stands in one.
  updateAuras(dt) {
    const s = this.state;
    const fighters = [s.player, ...s.enemies];
    for (const f of fighters) if (f) f.censerRegen = 0;
    if (!s.auras?.length) return;
    for (const a of s.auras) {
      a.life -= dt;
      if (!(a.life > 0)) continue;
      for (const f of fighters) {
        if (!f || f.team !== a.team || f.dead || f.hp <= 0) continue;
        const dx = (f.x - a.x) / a.r, dd = (f.depth - a.depth) / (FIELD_DEPTH * a.r);
        if (dx * dx + dd * dd > 1) continue;
        f.hp = Math.min(f.maxHp, f.hp + a.rate * dt);
        f.censerRegen = Math.max(f.censerRegen, a.life / a.maxLife);
      }
    }
    s.auras = s.auras.filter(a => a.life > 0);
  }

  droppedWeapon(f, dx) {
    const item = { x: f.x + dx, y: f.depth, depth: f.depth, kind: f.weapon, life: 20, uses: f.weaponHits };
    if (f.weaponFuse != null) item.fuse = f.weaponFuse;
    return item;
  }

  // The bracer is never thrown: taken off, it tumbles a short way (a harmless 'toss' shot drawn
  // in flight) and lands as a pickup again with the hits it has left.
  tossArmor(f) {
    const scale = (f.h || 66) / 66;
    this.state.projectiles.push({ x: f.x + f.facing * 14 * scale, y: f.y - 40 * scale, depth: f.depth, z: f.z + 40 * scale, vDepth: 0,
      vx: f.facing * 150, vy: -240, gravity: 1400, r: 10, kind: 'weapon', weapon: f.armorItem, toss: true, uses: f.armorHits,
      element: f.element, team: f.team, life: 1.5, damage: 0, knockback: 0, source: f });
    f.armorItem = null;
    f.armorHits = 0;
  }

  // The worn bracer's last frontal hit cracks it off the forearm.
  breakArmor(f) {
    const kind = f.armorItem, scale = (f.h || 66) / 66;
    f.armorItem = null;
    f.armorHits = 0;
    this.sound('weaponBreak', f.x, { kind });
    this.shatterWeapon(kind, f.x + f.facing * 22 * scale, f.y - 38 * scale, f.depth, f.facing, 0, scale);
    this.floater(f.x, f.y - f.h - 30, 'BRACER BROKE', '#5fa48a');
  }

  // A carried thunder lantern's fuse burns on the world clock (through contact pauses too).
  // Held past it, the lantern bursts in the hand and catches its holder in the blast.
  updateCarried(f, dt) {
    if (f.weapon !== 'lantern') { f.weaponFuse = null; return; }
    f.weaponFuse = (f.weaponFuse ?? WEAPON_SPECS.lantern.fuse) - dt;
    if (f.weaponFuse > 0) return;
    const scale = (f.h || 66) / 66;
    f.weapon = null;
    f.weaponHits = 0;
    f.weaponFuse = null;
    // Above the knockdown and damage floaters the blast raises on the holder.
    this.floater(f.x, f.y - f.h - 48, 'LANTERN BURST', '#c5573f');
    this.lanternBlast({ x: f.x + f.facing * 16 * scale, y: f.y - 40 * scale, depth: f.depth, z: f.z + 40 * scale, team: f.team, source: f }, f);
  }

  throwWeapon(f) {
    const arm = weaponSpec(f.weapon);
    if (!arm || arm.worn) return;
    const T = arm.throw || WEAPON_SPECS.staff.throw;
    const shot = { x: f.x + f.facing * 38, y: f.y - 35, depth: f.depth, z: f.z + 35, vDepth: 0, vx: f.facing * T.vx, vy: T.vy ?? -90,
      r: T.r, kind: 'weapon', weapon: f.weapon, element: f.element, team: f.team, life: T.life ?? 1.5, damage: T.damage,
      knockback: T.knockback, gravity: T.gravity ?? 240, source: f };
    // Per-kind flight (see WEAPON_SPECS): a spear runs through its first body, the knife pair
    // lands two blows, a stone or blade staggers without a knockdown, the jian freezes and
    // shatters on the arena edge, a mill stone rolls on, a lantern bursts, a chakram returns.
    if (T.pierce) shot.pierce = T.pierce;
    if (T.volley) shot.volley = T.volley;
    if (T.noKnockdown) shot.noKnockdown = true;
    if (T.freeze) shot.freeze = T.freeze;
    if (T.roll) shot.roll = T.roll;
    if (T.blast) { shot.blast = true; shot.fuse = f.weaponFuse ?? WEAPON_SPECS.lantern.fuse; }
    if (T.returnAt) { shot.returnAt = T.returnAt; shot.age = 0; shot.uses = f.weaponHits; }
    this.state.projectiles.push(shot);
    // A clean release (no dust dots at the chest): the thrown art draws its own speed lines.
    this.sound('throw', f.x);
    f.weapon = null;
    f.weaponHits = 0;
    f.weaponFuse = null;
    f.weaponStreak = 0;
  }

  enemyInput(e) {
    const p = this.state.player;
    const dx = p.x - e.x;
    const lane = p.depth - e.depth;
    const input = {};
    // The controller also chooses recovery rolls while knocked down. Let it
    // see disabled fighters; updateFighter still enforces every action gate.
    if (e.bossAction) return input;
    if (e.type === 'dummy') {
      if (!e.action) e.facing = dx >= 0 ? 1 : -1;
      if (!p.dead && p.hp > 0 && p.knockdown <= 0 && Math.abs(dx) < 100 && Math.abs(lane) < 30 && e.aiTimer <= 0) { input.attack = true; e.aiTimer = 2.2; }
      return input;
    }
    return this.enemyAI.input(this, e);
  }

  separateFighters(dt) {
    const time = this.state.time;
    // Contact pauses and ice hold a fighter in place; the other one takes the push.
    // A captive kneels in his cangue (or walks off): bodies step round him, he never shifts.
    const rooted = f => f.hitLag > 0 || f.hitLagAt === time || f.frozen > 0 || f.archetype === 'captive';
    const captives = this.state.captives;
    const fighters = captives?.length ? [this.state.player, ...this.state.enemies, ...captives] : [this.state.player, ...this.state.enemies];
    for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i], b = fighters[j];
      if (a.grabTarget === b.id || b.grabTarget === a.id || a.thrown || b.thrown || a.recoveryRoll || b.recoveryRoll) continue;
      if (arriving(a) || arriving(b)) continue;
      if (a.dead || b.dead || a.dashTime > 0 || b.dashTime > 0 || Math.abs(a.depth - b.depth) > 24 || Math.abs(a.z - b.z) > 45) continue;
      const dx = b.x - a.x;
      const distance = (a.w + b.w) / 2;
      if (Math.abs(dx) < distance) {
        const push = Math.sign(dx || (b.id - a.id)) * (distance - Math.abs(dx)) * Math.min(0.25, dt * 8);
        if (!rooted(a)) a.x -= push;
        if (!rooted(b)) b.x += push;
      }
    }
  }

  updateProjectiles(dt) {
    const s = this.state;
    for (const shot of s.projectiles) {
      shot.life -= dt;
      if (shot.kind === 'weapon' && !this.steerWeapon(shot, dt)) continue;
      if (shot.kind === 'talisman') this.steerTalisman(shot, dt);
      else if (shot.kind === 'chainHook') this.anchorHook(shot);
      shot.vy += (shot.gravity || 0) * dt;
      shot.x += shot.vx * dt;
      shot.depth ??= shot.y + 35;
      shot.z ??= 35;
      shot.depth += (shot.vDepth || 0) * dt;
      shot.z -= shot.vy * dt;
      shot.y = shot.depth - shot.z;
      // A thrown weapon reaching an arena wall stops there (see this.state.bounds.left): a bracer tossed off
      // drops down it; anything else still meets the bodies at the wall, then breaks on it.
      const walled = shot.kind === 'weapon' && shot.returnAt == null && (shot.x < this.state.bounds.left || shot.x > this.state.bounds.right);
      if (walled) {
        shot.x = clamp(shot.x, this.state.bounds.left, this.state.bounds.right);
        if (shot.toss) shot.vx = 0;
      }
      if (shot.z < 0) {
        if (shot.roll > 0 && !walled) this.startRoll(shot);
        else { shot.life = 0; this.shotLanded(shot); }
      }
      // A tossed bracer and the bandit's smoke pellet touch nobody.
      if (shot.life <= 0 || shot.toss || shot.kind === 'smokePellet') continue;
      const targets = shot.team === 'player' ? s.enemies : [s.player];
      for (const target of targets) {
        if (target.dead || target.hp <= 0 || target.invulnerable > 0 || Math.abs(target.depth - shot.depth) > 28) continue;
        if (shot.hitIds?.includes(target.id)) continue;
        const nearestX = clamp(shot.x, target.x - target.w / 2, target.x + target.w / 2);
        const nearestY = clamp(shot.y, target.y - target.h, target.y);
        if (Math.hypot(shot.x - nearestX, shot.y - nearestY) < shot.r) {
          const direction = Math.sign(shot.vx) || 1;
          const reflect = target.guard && target.parryTimer > 0 && target.facing === -direction;
          // A lantern bursts on contact; its blast deals the damage (a parry still returns it).
          if (shot.blast && !reflect) { shot.life = 0; this.lanternBlast(shot); break; }
          const guarded = target.guard && target.facing === -direction;
          const landed = this.damage(target, shot.damage, direction, shot.source, { knockback: shot.knockback, element: shot.element,
            knockdown: shot.kind === 'weapon' ? !shot.noKnockdown : shot.element === 'earth', freeze: shot.freeze,
            ...(ENEMY_SHOTS.has(shot.kind) ? { lift: 0, light: true } : null) });
          // A talisman that lands seals; a chain hook that lands yanks its victim in (not one the
          // Iron Bell or the warden's shield took whole).
          if (landed && landed !== NULLIFIED && !reflect && !guarded && target.hp > 0) {
            if (shot.kind === 'talisman') this.sealHit(target);
            else if (shot.kind === 'chainHook') this.hookPull(shot, target, direction);
          }
          if (shot.volley > 1 && !reflect) this.volleyHits(shot, target, direction);
          if (reflect && shot.kind === 'chainHook') shot.life = 0; // a parried hook falls slack
          else if (reflect) {
            shot.vx *= -1;
            shot.vy *= -1;
            shot.vDepth = -(shot.vDepth || 0);
            shot.team = target.team;
            shot.source = target;
            shot.x = target.x + target.facing * (shot.r + target.w / 2 + 6);
            shot.life = 1.2;
            // A parried chakram loses its return: it flies straight on (level, in its lane) and
            // breaks like any thrown weapon, so the parrier never catches it.
            if (shot.returnAt != null) { shot.returnAt = null; shot.vDepth = 0; }
          } else if (shot.kind === 'weapon') this.weaponHit(shot, target, direction);
          else shot.life = 0;
          break;
        }
      }
      if (walled && shot.life > 0) { shot.life = 0; this.weaponBurst(shot, shot.vx); }
    }
    s.projectiles = s.projectiles.filter(p => p.life > 0 && p.x > s.bounds.left - 130 && p.x < s.bounds.right + 130 && p.y < 900);
  }

  // A thrown weapon's body hit: a spear runs on through its first body and a chakram cuts
  // through every body on each leg (wearing a use per hit); anything else breaks on the body.
  weaponHit(shot, target, direction) {
    if (shot.returnAt != null) {
      (shot.hitIds ??= []).push(target.id);
      if (--shot.uses <= 0) { shot.life = 0; this.weaponBurst(shot, direction); }
      return;
    }
    if (shot.pierce > 0) {
      shot.pierce -= 1;
      (shot.hitIds ??= []).push(target.id);
      return;
    }
    shot.life = 0;
    this.weaponBurst(shot, direction);
  }

  // The rest of a thrown knife pair: each knife lands its own blow, a beat behind the first
  // (its number stacks above, its punch sounds VOLLEY_BEAT later).
  volleyHits(shot, target, direction) {
    const s = this.state;
    for (let i = 1; i < shot.volley; i += 1) {
      if (target.dead || target.hp <= 0 || target.knockdown > 0) return;
      target.invulnerable = 0;
      const before = s.lastImpact;
      this.damage(target, shot.damage, direction, shot.source, { knockback: shot.knockback, element: shot.element,
        knockdown: !shot.noKnockdown, floatLift: 14 * i });
      if (s.lastImpact && s.lastImpact !== before) s.lastImpact.delay = VOLLEY_BEAT * i;
    }
  }

  // Per-kind flight before a thrown weapon moves: a lit lantern's fuse, the mill stone's roll,
  // the chakram's turn and return. False once it ended. A flight that runs out of time in the
  // air still ends on screen: a chakram or a tossed bracer drops as a pickup, anything else breaks.
  steerWeapon(shot, dt) {
    if (shot.fuse != null && (shot.fuse -= dt) <= 0) { shot.life = 0; this.lanternBlast(shot); return false; }
    if (shot.rollLeft > 0) {
      shot.vx *= Math.exp(-dt * ROLL_DECAY);
      shot.rollLeft -= dt;
      if (shot.rollLeft <= 0 || shot.x < this.state.bounds.left + 10 || shot.x > this.state.bounds.right - 10) { shot.life = 0; this.weaponBurst(shot, shot.vx, true); return false; }
    }
    if (shot.returnAt != null) this.steerChakram(shot, dt);
    if (shot.life > 0) return true;
    if (shot.returnAt != null || shot.toss) { if (!shot.caught) this.dropShot(shot); }
    else this.weaponBurst(shot, shot.vx);
    return false;
  }

  // The gale chakram flies out level, turns after returnAt seconds (or at the arena edge) and
  // homes back on its thrower's lane and hand, cutting fresh on the way back; its thrower
  // catches it in lane. Missed (or with nobody free to catch it) it drops as a pickup.
  steerChakram(shot, dt) {
    shot.age = (shot.age || 0) + dt;
    const home = this.chakramHome(shot);
    if (!shot.back) {
      if (shot.age < shot.returnAt && shot.x > this.state.bounds.left + 10 && shot.x < this.state.bounds.right - 10) return;
      shot.back = true;
      shot.hitIds = [];
      const toward = home ? Math.sign(home.x - shot.x) : 0;
      shot.vx = (toward || -Math.sign(shot.vx) || 1) * Math.abs(shot.vx);
      return;
    }
    // Past an edge and still heading out (nobody turned it home): it drops there. Thrown from
    // beside a wall, it turned at once and is still flying back in.
    if ((shot.x < this.state.bounds.left + 10 && shot.vx < 0) || (shot.x > this.state.bounds.right - 10 && shot.vx > 0)) { shot.life = 0; return; }
    if (!home) return;
    shot.vDepth = clamp((home.depth - shot.depth) * 6, -320, 320);
    shot.z += (home.z + 35 - shot.z) * Math.min(1, dt * 6);
    if (Math.abs(home.x - shot.x) < CATCH_X && Math.abs(home.depth - shot.depth) < CATCH_DEPTH) {
      shot.life = 0;
      shot.caught = true;
      home.weapon = shot.weapon;
      home.weaponHits = shot.uses;
      home.weaponStreak = 0;
      this.sound('pickupWeapon', home.x, { kind: shot.weapon });
    }
  }

  chakramHome(shot) {
    const f = shot.source;
    return f && f.team === shot.team && !f.dead && f.hp > 0 && !f.weapon && f.grabbedBy == null && f.grabTarget == null && !(f.knockdown > 0) ? f : null;
  }

  // A thrown weapon that ends whole (a missed chakram, a tossed bracer) lands as a pickup.
  dropShot(shot) {
    shot.life = 0;
    this.state.weapons.push({ x: clamp(shot.x, this.state.bounds.left + 30, this.state.bounds.right - 30), y: shot.depth, depth: shot.depth, kind: shot.weapon, life: 20, uses: shot.uses });
  }

  // A mill stone that reaches the floor lands in dust and rolls on its rim down the lane.
  startRoll(shot) {
    shot.rollLeft = shot.roll;
    shot.roll = 0;
    shot.z = ROLL_Z;
    shot.y = shot.depth - shot.z;
    shot.vy = 0;
    shot.gravity = 0;
    shot.vDepth = 0;
    shot.life = Math.max(shot.life, shot.rollLeft + .1);
    this.vfx('dustLand', shot.x, shot.depth, { heavy: true, scale: ROLL_DUST });
    this.sound('land', shot.x, { heavy: true, strength: .8 });
  }

  // The thunder lantern bursts: an ink fireball (the 'lanternBurst' particle) throwing the
  // lantern's own pieces (caps, burnt paper, glow scrap; no snap puff under the fireball), and 30
  // fire damage with burn to every opponent of its thrower within 70 px; bursting in the hand it
  // catches its holder too (no guard or bracer saves them). at: { x, y, depth, z, team, source }.
  lanternBlast(at, holder = null) {
    const s = this.state, B = WEAPON_SPECS.lantern.throw.blast;
    if (s.particles.length < MAX_PARTICLES) {
      s.particles.push({ kind: 'lanternBurst', x: at.x, y: Math.min(at.y, at.depth - 22), life: LANTERN_BURST_LIFE, maxLife: LANTERN_BURST_LIFE });
    }
    const dir = holder ? holder.facing : at.vx < 0 ? -1 : 1;
    this.shatterWeapon('lantern', at.x, at.y, at.depth, dir, 0, holder ? (holder.h || 66) / 66 : 1, false);
    s.shake = Math.max(s.shake, 6);
    this.sound('burstFire', at.x, { strength: .8 });
    const z = Math.max(0, at.z || 0);
    const victims = holder ? [holder, ...this.targets(holder)] : at.team === 'player' ? s.enemies : [s.player];
    for (const target of victims) {
      if (target.dead || target.hp <= 0) continue;
      const dx = Math.max(0, Math.abs(target.x - at.x) - target.w / 2);
      const dz = clamp(z, target.z, target.z + target.h) - z;
      if (Math.hypot(dx, (target.depth - at.depth) * 1.4, dz) > B.radius) continue;
      const own = target === holder;
      const direction = Math.sign(target.x - at.x) || (own ? -holder.facing : 1);
      this.damage(target, B.damage, direction, own ? null : at.source, { element: 'fire', knockdown: true, heavy: true, knockback: B.knockback, unblockable: own, blast: true });
    }
  }

  // A projectile reaching the floor: a thrown weapon bursts (a tossed bracer just lands), anything
  // else (a falling earth boulder) kicks up landing dust. Energy shots fly level, so only earth lands.
  // A volley arrow sticks in the floor (stuckArrow, pointing the way it flew); the bandit's smoke
  // pellet bursts into its puff.
  shotLanded(shot) {
    if (shot.toss) this.dropShot(shot);
    else if (shot.kind === 'weapon') this.weaponBurst(shot, shot.vx);
    else if (shot.kind === 'arrow') {
      const life = R.volley.stuck;
      this.enemyFx({ kind: 'stuckArrow', x: shot.x, y: shot.depth, depth: shot.depth, angle: Math.atan2((shot.vy || 0) + (shot.vDepth || 0), shot.vx || 1),
        life, maxLife: life });
    } else if (shot.kind === 'smokePellet') this.smokeBurst(shot);
    else if (!ENEMY_SHOTS.has(shot.kind)) this.vfx('dustLand', shot.x, shot.depth, {});
  }

  // A thrown weapon breaking, on a body or on the floor: an explosion on the floor under it
  // (WEAPON_SPECS[kind].burst: full for a crate, smaller for poles and blades, none for the
  // jian's ice), its pieces flying from where they sat, and its break sound. A lantern bursts.
  // settled: a mill stone that rolled to a stop splits in a puff of dust, without the blast.
  weaponBurst(shot, direction, settled = false) {
    if (shot.blast) { this.lanternBlast(shot); return; }
    const spec = weaponSpec(shot.weapon) || WEAPON_SPECS.staff;
    const dir = direction < 0 ? -1 : 1;
    if (settled) this.vfx('dustLand', shot.x, shot.depth, { heavy: true, scale: ROLL_DUST });
    else if (spec.burst) this.vfx('explosion', shot.x, shot.depth, { dir, scale: spec.burst });
    this.shatterWeapon(shot.weapon, shot.x, shot.y, shot.depth, dir, Math.atan2((shot.vy || 0) + (shot.vDepth || 0), Math.abs(shot.vx) || 1));
    if (shot.weapon === 'crate') this.spillBuns(shot.x, shot.depth);
    this.sound(spec.breakSound || 'weaponBreak', shot.x, { kind: shot.weapon });
  }

  // Debris of a broken weapon (visual particles, never this.random()): one ink snap puff (puff
  // false: none), then each piece of WEAPON_SHARDS[kind] from where it sat in the weapon
  // (mirrored for a leftward weapon, turned by its angle) flung outward and up; it spins, falls
  // and settles on the floor. A weapon breaking on the floor breaks just above it (y is clamped
  // SHARD_FLOOR_CLEAR above the floor line), so its pieces still fly before they settle.
  shatterWeapon(kind, x, y, floor, dir = 1, angle = 0, scale = 1, puff = true) {
    const s = this.state;
    const pieces = WEAPON_SHARDS[kind];
    if (!pieces) return;
    dir = dir < 0 ? -1 : 1;
    y = Math.min(y, floor - SHARD_FLOOR_CLEAR * scale);
    if (puff && s.particles.length < MAX_PARTICLES) s.particles.push({ kind: 'breakPuff', x, y, life: PUFF_LIFE, maxLife: PUFF_LIFE, scale });
    const c = Math.cos(angle), sn = Math.sin(angle);
    const life = kind === 'jian' ? SHARD_MELT_LIFE : SHARD_LIFE;
    for (let index = 0; index < pieces.length && s.particles.length < MAX_PARTICLES; index += 1) {
      const [ox, oy] = pieces[index];
      const wx = dir * (ox * c - oy * sn) * scale, wy = (ox * sn + oy * c) * scale;
      const len = Math.hypot(wx, wy);
      const ux = len ? wx / len : (index % 2 ? .7 : -.7) * dir, uy = len ? wy / len : 0;
      const speed = 50 + (index % 3) * 10;
      s.particles.push({ kind: 'shard', weapon: kind, index, x: clamp(x + wx, (this.state.bounds.left - 24), (this.state.bounds.right + 24)), y: y + wy, vx: ux * speed, vy: uy * speed * .6 - SHARD_KICK,
        rot: angle, rot0: angle, vr: (index % 2 ? 1 : -1) * (9 + index * 1.5), flip: dir, scale,
        floor: floor + (2 - index * 1.5) * scale, life, maxLife: life });
    }
  }

  // A guardian's relic (WEAPON_SPECS[kind].relic = the guardian's element: the frost jian for
  // the Water guardian) lands where it fell, whatever the pickup cap.
  dropRelic(boss) {
    for (const kind of RELICS[boss.element] || []) {
      const depth = clamp(boss.depth, 395, 650);
      this.state.weapons.push({ x: clamp(boss.x, this.state.bounds.left + 50, this.state.bounds.right - 50), y: depth, depth, kind, life: RELIC_LIFE, relic: true });
      this.floater(boss.x, boss.y - boss.h - 40, WEAPON_SPECS[kind].name.toUpperCase(), ELEMENTS[boss.element].color);
    }
  }

  // The body topples away from the blow (fall = the side its head goes, as in a knockdown) and
  // settles lying flat; one already lying keeps lying the same way. An archetype's corpse lies in
  // its own KO silhouette (archetype; dropped once its gear became a pickup).
  corpseOf(e) {
    const vx = e.vx || (e.facing * -180);
    const down = e.knockdown > 0;
    const fall = (down && Math.sign(e.hitDirection || 0)) || (vx < 0 ? -1 : 1);
    return { x: e.x, y: e.y, depth: e.depth, z: e.z, vx, vy: Math.min(e.vy, -260), fall, rotation: fall * Math.PI * (down && e.grounded ? 0.5 : 0.2),
      settle: 4 + this.visualRandom() * 6, life: 2.8, element: e.element, archetype: e.archetype || null, dropped: false, h: e.h, type: e.type, bossPhase: e.bossPhase };
  }

  // KO burst at the body centre in the finishing element; droplets splat on its floor line.
  koBurst(f) {
    const y = f.y - f.h * .5;
    this.vfx('ko', f.x, y, { dir: Math.sign(f.hitDirection || 0) || -f.facing || 1,
      element: koElement(f), floor: f.depth - y, scale: f.type === 'boss' ? 1.3 : 1 }, { depth: f.depth });
  }

  resolveDeaths() {
    const s = this.state;
    const fallen = [];
    for (const e of s.enemies) {
      if (!e.dead && e.hp > 0) continue;
      fallen.push(e);
      this.grapples.release(this, e);
      this.crackIce(e);
      this.cancelChannel(e);
      e.dead = true;
      s.kills++;
      s.score += e.type === 'boss' ? 1000 : e.archetype ? ARCHETYPE_STATS[e.archetype].score : 100;
      const corpse = this.corpseOf(e);
      s.corpses.push(corpse);
      // A fallen monk's staff lands as a real staff pickup now and then (the corpse lies without
      // it); a bandit drops what he stole.
      if (e.archetype === 'monk' && this.random() < R.staffDrop) {
        corpse.dropped = true;
        const d = clamp(e.depth, 395, 650);
        s.weapons.push({ x: clamp(e.x - corpse.fall * 26 * e.h / 66, s.bounds.left + 30, s.bounds.right - 30), y: d, depth: d, kind: 'staff', life: 20 });
      }
      if (e.stolen) {
        const d = clamp(e.depth, 395, 650);
        s.weapons.push({ x: clamp(e.x, s.bounds.left + 30, s.bounds.right - 30), y: d, depth: d, kind: e.stolen.kind, ...(e.stolen.variant ? { variant: e.stolen.variant } : null),
          life: 20, seed: Math.round(this.visualRandom() * 1000) / 100 });
        e.stolen = null;
      }
      this.floater(e.x, Math.min(e.y - e.h, 640), e.type === 'boss' ? 'GUARDIAN FALLEN' : 'KO', fighterColor(e));
      this.koBurst(e);
      if (e.scorch) this.scorchFloor(e);
      if (e.type === 'boss') { s.slowMotion = 0.7; s.shake = 10; this.dropRelic(e); }
      s.player.energy = Math.min(100, s.player.energy + 8);
    }
    s.enemies = s.enemies.filter(e => !e.dead);
    // Ordinary kills thud; a guardian's fall and the last kill of a wave ring the KO bowl.
    const cleared = !s.enemies.length && s.settings.mode !== 'training';
    fallen.forEach((e, i) => this.sound(e.type === 'boss' || (cleared && i === fallen.length - 1) ? 'ko' : 'enemyDown', e.x,
      { element: koElement(e) }));
    const p = s.player;
    if (p.hp > 0) return;
    s.bossHazards = [];
    for (const enemy of s.enemies) if (enemy.type === 'boss') this.bosses.cancel(this, enemy);
    this.grapples.release(this, p);
    p.thrown = null;
    p.recoveryRoll = null;
    p.downTime = 0;
    // A fall ends any use in progress and the elixir and qi flow with it.
    p.consume = null;
    p.power = 0;
    p.qiFlow = 0;
    this.crackIce(p);
    // Every fall gets its KO burst, the run-ending one too (settleVisuals plays it out).
    this.koBurst(p);
    this.sound('ko', p.x);
    const training = s.settings.mode === 'training';
    if (!training) s.lives--;
    if (s.lives <= 0) {
      p.dead = true;
      s.status = 'lost';
      s.objective = 'Your journey continues. Try another element or take a breath and retry.';
      return;
    }
    this.placePlayer();
    this.vfx('spawn', p.x, p.depth, { element: p.element });
    p.hp = p.maxHp;
    p.energy = 100;
    p.invulnerable = 2.5;
    p.weapon = null;
    p.weaponHits = 0;
    p.weaponFuse = null;
    p.armorItem = null;
    p.armorHits = 0;
    p.cooldowns = { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 };
    s.projectiles = s.projectiles.filter(shot => shot.team === 'player');
    this.banner(training ? 'Keep practicing' : `${s.lives} ${s.lives === 1 ? 'life' : 'lives'} remaining`);
  }

  // Visual-only randomness on its own seeded stream: particle bursts can be added or removed
  // without shifting the simulation's this.random() sequence.
  visualRandom() {
    this.visualSeed = (Math.imul(this.visualSeed, 1664525) + 1013904223) >>> 0;
    return this.visualSeed / 4294967296;
  }

  effect(x, y, color, count) {
    const s = this.state;
    for (let i = 0; i < count && s.particles.length < MAX_PARTICLES; i++) {
      const angle = this.visualRandom() * Math.PI * 2;
      const speed = 50 + this.visualRandom() * 230;
      const life = 0.2 + this.visualRandom() * 0.4;
      s.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size: 2 + this.visualRandom() * 4 });
    }
  }

  floater(x, y, text, color) {
    if (this.state.floaters.length < 40) this.state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  // After a run ends the simulation stops, but its effects (the final KO burst, sparks, smoke)
  // keep playing out behind the result screen instead of freezing on one frame.
  settleVisuals(dt) {
    const s = this.state;
    if ((s.status !== 'won' && s.status !== 'lost') || !Number.isFinite(dt) || dt <= 0) return;
    this.updateVisuals(Math.min(dt, 1 / 30));
  }

  updateFighterVisuals(f, dt) {
    if (f.guardFx > 0) f.guardFx = Math.max(0, f.guardFx - dt);
    if (f.spawnReveal > 0) {
      // The swirl stays centred on the hidden body, then stays where the body steps out.
      for (const e of this.state.effects) {
        if (e.fx === 'spawn' && e.targetId === f.id) { e.x = f.x; e.y = e.depth = f.depth; }
      }
      f.spawnReveal = Math.max(0, f.spawnReveal - dt);
      // The arrival drum belongs to a live fight; a swirl still settling behind the result
      // screen (settleVisuals) finishes silently.
      if (!f.spawnReveal && f.type === 'boss' && this.state.status === 'playing') this.sound('bossDrum', f.x);
    }
    if (f.iceFx > 0) {
      f.iceFx = Math.max(0, f.iceFx - dt);
      if (!(f.frozen > 0)) this.crackIce(f);
    }
  }

  updateVisuals(dt) {
    const s = this.state;
    for (const p of s.particles) {
      p.life -= dt;
      if (STATIC_PARTICLES.has(p.kind)) continue; // a break puff or lantern burst stays put
      if (p.kind === 'shard') {
        // Weapon debris falls hard, bounces once off its floor line, then lies still.
        p.vy += SHARD_GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if ((p.x < (this.state.bounds.left - 24) && p.vx < 0) || (p.x > (this.state.bounds.right + 24) && p.vx > 0)) p.vx *= -.4;
        // A piece only lands while falling: one still rising from below its floor line flies on.
        if (p.y > p.floor && p.vy > 0) {
          p.y = p.floor;
          if (!p.bounced && p.vy > 140) { p.bounced = true; p.vy *= -.3; p.vx *= .5; p.vr *= .5; } else { p.vy = 0; p.vx = 0; p.vr = 0; }
        }
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt;
    }
    s.particles = s.particles.filter(p => p.life > 0);
    for (const f of s.floaters) { f.life -= dt; f.y -= dt * 36; }
    s.floaters = s.floaters.filter(f => f.life > 0);
    for (const e of s.effects) {
      e.life -= dt;
      // A struck Iron Bell's ripples spread as it fades (drawIronBell's ring 1 -> 0).
      if (e.kind === 'ironBell') e.ring = Math.max(0, e.life / (e.maxLife || 1));
    }
    s.effects = s.effects.filter(e => e.life > 0);
    // Effect-linked fighter flags run on the world clock, like the effects they follow.
    if (s.player) this.updateFighterVisuals(s.player, dt);
    for (const e of s.enemies) this.updateFighterVisuals(e, dt);
    if (s.captives) for (const c of s.captives) this.updateFighterVisuals(c, dt);
    for (const c of s.corpses) {
      c.life -= dt;
      // The body dissolves into a pale ink puff as it fades out.
      if (!c.smoked && c.life <= .45) { c.smoked = true; this.vfx('smoke', c.x, c.depth - 6, {}, { depth: c.depth }); }
      c.vy += 1100 * dt;
      c.x = clamp(c.x + c.vx * dt, this.state.bounds.left + 10, this.state.bounds.right - 10);
      c.z -= c.vy * dt;
      if (c.z < 0) { c.z = 0; c.vy *= -0.3; c.vx *= 0.65; }
      c.y = c.depth - c.z;
      // Ease toward lying flat with the limbs to the floor (the renderer flips the body by fall).
      c.rotation += (c.fall * Math.PI / 2 - c.rotation) * (1 - Math.exp(-c.settle * dt));
    }
    s.corpses = s.corpses.filter(c => c.life > 0 && c.y < 1000);
    for (const w of s.weapons) w.life -= dt;
    s.weapons = s.weapons.filter(w => w.life > 0);
  }
}
