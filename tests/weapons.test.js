// Weapons and throwables (WEAPON_SPECS in src/data.js, art in src/weapon-art.js): spawning,
// pickup and wear, per-kind melee, per-kind flight, breaking debris, relics and the bracer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { COMBAT, ELEMENTS, WEAPON_ORDER, WEAPON_SPECS, ITEM_SPAWN } from '../src/data.js';
import { WEAPON_ART, WEAPON_SHARDS } from '../src/weapon-art.js';

const STEP = 1 / 120;
const advance = (game, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / STEP - 1e-9); i += 1) game.tick(input, STEP); };
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const EARTH = .86; // an earth target takes 86% damage
const lcg = seed => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

// Survival with nothing scheduled: no training regeneration, no wave or pickup timers.
function fixture(options = {}) {
  const game = new Game({ element: 'air', arena: 'air', mode: 'survival', difficulty: 'normal', seed: 7, ...options });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], weapons: [], floaters: [], sounds: [], waveDelay: 999, weaponTimer: 999 });
  Object.assign(game.state.player, { x: 400, depth: 560, z: 0, y: 560, vx: 0, vy: 0, vDepth: 0, facing: 1, grounded: true, invulnerable: 0 });
  return game;
}
// A passive earth dummy (2000 hp) standing in the player's lane, facing the player.
function foe(game, x, options = {}) {
  const e = game.spawnEnemy({ dummy: true, element: 'earth', x, depth: options.depth ?? 560 });
  Object.assign(e, { x, depth: 560, z: 0, invulnerable: 0, spawnReveal: 0, spawnHold: false, facing: -1, aiTimer: 1e3, hp: 2000, maxHp: 2000, ...options });
  e.y = e.depth - e.z;
  game.state.effects = [];
  return e;
}
const lost = e => e.maxHp - e.hp;
const cues = (game, name) => game.state.sounds.filter(c => c.name === name);
const shards = (game, kind) => game.state.particles.filter(p => p.kind === 'shard' && (!kind || p.weapon === kind));
// One real melee swing on its first active frame.
function swing(game, f) {
  f.action = null;
  f.cooldowns.attack = 0;
  assert.ok(game.startAction(f, 'melee'), 'the swing starts');
  f.action.t = f.action.windup;
  game.melee(f);
}
function arm(game, kind, hits = WEAPON_SPECS[kind].hits) {
  Object.assign(game.state.player, { weapon: kind, weaponHits: hits });
}
function flyUntil(game, done, seconds = 3) {
  for (let i = 0; i < seconds / STEP && !done(); i += 1) game.tick({}, STEP);
  assert.ok(done(), 'the flight finished in time');
}

test('every weapon kind has specs, art and debris; only relics never drop between waves', () => {
  assert.deepEqual(Object.keys(WEAPON_SPECS), WEAPON_ORDER);
  for (const kind of WEAPON_ORDER) {
    const spec = WEAPON_SPECS[kind];
    assert.ok(WEAPON_ART[kind], `${kind} has art hints`);
    assert.ok(WEAPON_SHARDS[kind]?.length >= 3, `${kind} breaks into pieces`);
    assert.ok(spec.hits > 0 && spec.name, `${kind} has a name and durability`);
    assert.ok(spec.worn || spec.throw, `${kind} is either worn or thrown`);
    assert.ok(!Object.keys(spec).some(key => /lf2/i.test(key)), 'no borrowed reference data');
  }
  assert.equal(WEAPON_SPECS.jian.spawn, 0);
  assert.equal(WEAPON_SPECS.jian.relic, 'water');
  const seen = new Set(), seenWeaponOnly = new Set();
  for (let seed = 1; seed < 600; seed += 1) {
    for (const weaponOnly of [false, true]) {
      const game = fixture({ seed });
      game.seed = seed * 7919 >>> 0;
      const before = game.seed;
      game.state.weapons = [];
      game.spawnWeapon(weaponOnly);
      assert.equal(game.seed, lcg(lcg(lcg(before))), 'a drop still takes exactly three random numbers');
      (weaponOnly ? seenWeaponOnly : seen).add(game.state.weapons[0].kind);
    }
  }
  const spawnable = WEAPON_ORDER.filter(kind => WEAPON_SPECS[kind].spawn > 0);
  assert.deepEqual([...seenWeaponOnly].sort(), [...spawnable].sort(), 'wave-start drops are weapons (and the bracer) only');
  assert.deepEqual([...seen].sort(), [...spawnable, ...Object.keys(ITEM_SPAWN)].sort(), 'later drops add the gourd and the qi orb');
  assert.ok(!seen.has('jian') && !seenWeaponOnly.has('jian'));
});

test('pickups arm each weapon at its durability; the bracer is worn, leaving the fists free', () => {
  for (const kind of WEAPON_ORDER.filter(k => !WEAPON_SPECS[k].worn)) {
    const game = fixture();
    game.state.weapons = [{ x: 430, y: 560, depth: 560, kind, life: 20 }];
    game.tick({ interact: true }, STEP);
    const p = game.state.player;
    assert.equal(p.weapon, kind);
    assert.equal(p.weaponHits, WEAPON_SPECS[kind].hits, `${kind} durability`);
    assert.equal(p.weaponFuse != null, kind === 'lantern', 'only the lantern lights a fuse');
    assert.deepEqual(cues(game, 'pickupWeapon').map(c => c.params), [{ kind }]);
  }
  const game = fixture();
  const p = game.state.player;
  arm(game, 'staff', 12);
  game.state.weapons = [{ x: 430, y: 560, depth: 560, kind: 'bracer', life: 20 }];
  game.tick({ interact: true }, STEP);
  assert.deepEqual([p.armorItem, p.armorHits, p.weapon, p.weaponHits], ['bracer', 6, 'staff', 12]);
  // E with nothing in reach: the weapon goes first, then the bracer tumbles off and lands.
  game.tick({ interact: true }, STEP);
  assert.equal(p.weapon, null);
  assert.deepEqual(game.state.weapons.map(w => [w.kind, w.uses]), [['staff', 12]]);
  p.armorHits = 4;
  game.state.weapons = [];
  game.tick({ interact: true }, STEP);
  assert.equal(p.armorItem, null);
  const toss = game.state.projectiles.find(s => s.toss);
  assert.equal(toss?.weapon, 'bracer', 'taken off, the bracer tumbles through the air');
  advance(game, .7);
  assert.equal(game.state.projectiles.length, 0);
  assert.deepEqual(game.state.weapons.map(w => [w.kind, w.uses]), [['bracer', 4]], 'it lands as a pickup with its hits left');
  assert.ok(game.state.weapons[0].x > p.x + 40, 'a short toss ahead');
});

test('melee reach, windup and walking pace follow the weapon', () => {
  for (const [kind, reach] of [['knives', 86], ['chakram', 96], ['staff', 118], ['jian', 126], ['spear', 142], ['guandao', 158]]) {
    for (const [dx, hit] of [[reach + 12, true], [reach + 16, false]]) {
      const game = fixture();
      arm(game, kind, 99);
      const e = foe(game, 400 + dx);
      swing(game, game.state.player);
      assert.equal(lost(e) > 0, hit, `${kind} at ${dx} px`);
    }
  }
  // Stone and crate keep the fist's own reach.
  for (const kind of ['stone', 'crate']) {
    const game = fixture();
    arm(game, kind);
    const e = foe(game, 400 + COMBAT.air.steps[0].reach + 12);
    swing(game, game.state.player);
    assert.ok(lost(e) > 0, `${kind} reaches as far as the fist`);
  }
  const base = COMBAT.air.steps[0].windup;
  for (const [kind, scale] of [['staff', 1], ['knives', .8], ['guandao', 1.4]]) {
    const game = fixture();
    arm(game, kind);
    game.startAction(game.state.player, 'melee');
    near(game.state.player.action.windup, base * scale, 1e-9, `${kind} windup`);
  }
  for (const [kind, walk] of [[null, 1], ['staff', 1], ['guandao', .85], ['millstone', .7]]) {
    const game = fixture();
    if (kind) arm(game, kind);
    advance(game, 1, { right: true });
    near(game.state.player.vx, ELEMENTS.air.speed * walk, .5, `walking with ${kind}`);
  }
});

test('weapon blows: per-kind damage, the crate smash, and the guandao breaking guards across a wider band', () => {
  for (const [kind, bonus] of [['staff', 9], ['knives', 6], ['guandao', 16], ['stone', 4], ['chakram', 7], ['jian', 10]]) {
    const game = fixture();
    arm(game, kind, 99);
    const e = foe(game, 460);
    swing(game, game.state.player);
    near(lost(e), (ELEMENTS.air.damage + bonus) * COMBAT.air.steps[0].damage * EARTH, 1e-9, `${kind} damage`);
  }
  const smash = fixture();
  arm(smash, 'crate');
  const smashed = foe(smash, 460);
  swing(smash, smash.state.player);
  assert.ok(smashed.knockdown > 0, 'the crate smash knocks down');
  assert.equal(smash.state.player.weapon, null, 'and the crate is spent');
  assert.equal(shards(smash, 'crate').length, 4, 'it shatters in the hand');

  for (const [kind, broken] of [['staff', false], ['guandao', true]]) {
    const game = fixture();
    arm(game, kind, 99);
    const e = foe(game, 460, { guard: true, energy: 100 });
    swing(game, game.state.player);
    assert.equal(game.state.floaters.some(f => f.text === 'GUARD BREAK'), broken, `${kind} vs a raised guard`);
    assert.equal(e.guard, !broken);
  }
  for (const [kind, hit] of [['staff', false], ['guandao', true]]) {
    const game = fixture();
    arm(game, kind, 99);
    const e = foe(game, 460, { depth: 600 });
    swing(game, game.state.player);
    assert.equal(lost(e) > 0, hit, `${kind} 40 px off the lane`);
  }
});

test('attacking with a mill stone or a lantern throws it; a staff still swings', () => {
  for (const [kind, action] of [['millstone', 'throw'], ['lantern', 'throw'], ['staff', 'melee']]) {
    const game = fixture();
    arm(game, kind);
    game.tick({ attack: true }, STEP);
    assert.equal(game.state.player.action?.kind, action, kind);
    advance(game, .2);
    assert.equal(game.state.projectiles.some(s => s.weapon === kind), action === 'throw');
  }
});

test('a thrown spear runs through its first body and breaks on the second; a staff stops at the first', () => {
  for (const [kind, damage, both] of [['spear', 34, true], ['staff', 32, false]]) {
    const game = fixture();
    arm(game, kind);
    const first = foe(game, 520), second = foe(game, 660);
    game.throwWeapon(game.state.player);
    flyUntil(game, () => !game.state.projectiles.length);
    near(lost(first), damage * EARTH, 1e-9, `${kind} damage`);
    assert.equal(lost(second) > 0, both, `${kind} reaches the second body`);
    assert.equal(cues(game, 'weaponBreak').length, 1, 'it breaks once');
    assert.equal(shards(game, kind).length, WEAPON_SHARDS[kind].length);
  }
});

test('thrown knives land two blows of 14; knives and stones stagger without a knockdown', () => {
  const game = fixture();
  arm(game, 'knives');
  const e = foe(game, 520);
  game.throwWeapon(game.state.player);
  flyUntil(game, () => !game.state.projectiles.length);
  near(lost(e), 2 * 14 * EARTH, 1e-9, 'two knives');
  assert.equal(e.knockdown, 0);
  const numbers = game.state.floaters.filter(f => f.text === String(Math.ceil(14 * EARTH)));
  assert.equal(numbers.length, 2, 'two damage numbers');
  assert.ok(numbers[1].y < numbers[0].y, 'the second stacks above the first');

  const stone = fixture();
  arm(stone, 'stone');
  const hit = foe(stone, 560);
  stone.throwWeapon(stone.state.player);
  assert.equal(stone.state.projectiles[0].vx, 1050, 'the fastest throw');
  flyUntil(stone, () => !stone.state.projectiles.length);
  near(lost(hit), 18 * EARTH, 1e-9, 'stone damage');
  assert.equal(hit.knockdown, 0);
  assert.ok(hit.stun > 0, 'it staggers');
  assert.equal(shards(stone, 'stone').length, 3, 'three chips');
});

test('a thrown mill stone lands, rolls about 1.1 s down the lane, then splits in four', () => {
  const game = fixture();
  arm(game, 'millstone');
  game.throwWeapon(game.state.player);
  const shot = game.state.projectiles[0];
  flyUntil(game, () => shot.rollLeft > 0);
  const landed = { time: game.state.time, x: shot.x, vx: shot.vx };
  assert.equal(shot.z, 13, 'it rolls on its rim');
  assert.ok(game.state.effects.some(e => e.fx === 'dustLand'), 'landing dust');
  flyUntil(game, () => !game.state.projectiles.length);
  near(game.state.time - landed.time, WEAPON_SPECS.millstone.throw.roll, 2 * STEP, 'roll time');
  assert.ok(shot.x - landed.x > 200, `it rolls on (${(shot.x - landed.x).toFixed(0)} px)`);
  assert.ok(Math.abs(shot.vx) < landed.vx * .25, 'slowing to a stop');
  assert.equal(shards(game, 'millstone').length, 4);
  assert.deepEqual(cues(game, 'weaponBreak').map(c => c.params), [{ kind: 'millstone' }]);

  const struck = fixture();
  arm(struck, 'millstone');
  const e = foe(struck, 730);
  struck.throwWeapon(struck.state.player);
  flyUntil(struck, () => !struck.state.projectiles.length);
  assert.ok(struck.state.projectiles.length === 0 && e.knockdown > 0, 'what it rolls into goes down');
  near(lost(e), 52 * EARTH, 1e-9, 'mill stone damage');
});

test('a thrown lantern bursts on contact: fire and burn within 70 px, nobody beyond', () => {
  const game = fixture();
  arm(game, 'lantern');
  game.state.player.weaponFuse = 4;
  const hit = foe(game, 550), beside = foe(game, 590), far = foe(game, 720);
  game.throwWeapon(game.state.player);
  flyUntil(game, () => !game.state.projectiles.length);
  for (const e of [hit, beside]) {
    near(lost(e), 30 * EARTH, 1e-9, 'blast damage');
    assert.ok(e.burn > 0 && e.knockdown > 0, 'burning and knocked down');
  }
  assert.equal(lost(far), 0, 'beyond the blast');
  const burst = game.state.particles.find(p => p.kind === 'lanternBurst');
  assert.ok(burst && burst.maxLife === .6, 'the ink fireball plays for 0.6 s');
  assert.equal(cues(game, 'burstFire').length, 1);
  assert.equal(game.state.weapons.length, 0);
});

test('a lantern held past its 4 s fuse bursts in the hand; dropped, its fuse waits', () => {
  const game = fixture();
  const p = game.state.player;
  game.state.weapons = [{ x: 430, y: 560, depth: 560, kind: 'lantern', life: 20 }];
  game.tick({ interact: true }, STEP);
  const e = foe(game, 440, { facing: 1 });
  advance(game, 3.9);
  assert.equal(p.weapon, 'lantern');
  near(p.weaponFuse, .1, 2 * STEP, 'fuse left');
  advance(game, .2);
  assert.equal(p.weapon, null, 'it burst');
  near(p.maxHp - p.hp, 30, 1e-9, 'the holder is caught in the blast');
  near(lost(e), 30 * EARTH, 1e-9, 'and so is the foe beside them');

  const drop = fixture();
  drop.state.weapons = [{ x: 430, y: 560, depth: 560, kind: 'lantern', life: 20 }];
  drop.tick({ interact: true }, STEP);
  advance(drop, 1);
  drop.tick({ interact: true }, STEP);
  const [lantern] = drop.state.weapons;
  near(lantern.fuse, 3, 3 * STEP, 'the dropped lantern keeps its fuse');
  advance(drop, 5);
  assert.equal(drop.state.weapons.length, 1, 'unlit on the floor');
  assert.equal(drop.state.particles.filter(q => q.kind === 'lanternBurst').length, 0);
});

test('the gale chakram cuts out and back, then returns to its thrower\'s hand', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'chakram');
  const e = foe(game, 600);
  game.throwWeapon(p);
  const shot = game.state.projectiles[0];
  advance(game, .5);
  assert.ok(shot.vx > 0 && !shot.back, 'still on the way out');
  near(lost(e), 22 * EARTH, 1e-9, 'cut on the way out');
  assert.equal(e.knockdown, 0, 'a cut, not a knockdown');
  advance(game, .1);
  assert.ok(shot.back && shot.vx < 0, 'turned after 0.55 s');
  flyUntil(game, () => p.weapon === 'chakram');
  near(lost(e), 2 * 22 * EARTH, 1e-9, 'cut again on the way back');
  assert.equal(p.weaponHits, WEAPON_SPECS.chakram.hits - 2, 'each cut wears it');
  assert.equal(game.state.projectiles.length, 0);

  // A thrower with full hands cannot catch it: it flies on and lands as a pickup.
  const busy = fixture();
  arm(busy, 'chakram');
  busy.throwWeapon(busy.state.player);
  busy.state.player.weapon = 'staff';
  flyUntil(busy, () => !busy.state.projectiles.length);
  assert.deepEqual(busy.state.weapons.map(w => [w.kind, w.uses]), [['chakram', 12]]);
});

test('the frost jian chills every blow and freezes on every third; thrown, it freezes and melts away', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'jian');
  const e = foe(game, 470);
  for (let hit = 1; hit <= 3; hit += 1) {
    Object.assign(e, { invulnerable: 0, slow: 0, frozen: 0, stagger: 0, hitLag: 0, iceFx: 0 });
    swing(game, p);
    assert.ok(lost(e) > 0);
    near(e.slow, .4, 1e-9, `blow ${hit} chills`);
    assert.equal(e.frozen, hit === 3 ? .6 : 0, `blow ${hit}`);
  }
  assert.equal(p.weaponStreak, 3);

  const thrown = fixture();
  arm(thrown, 'jian');
  const target = foe(thrown, 600);
  thrown.throwWeapon(thrown.state.player);
  assert.equal(thrown.state.projectiles[0].gravity, 0, 'a straight flight');
  flyUntil(thrown, () => !thrown.state.projectiles.length);
  near(lost(target), 36 * EARTH, 1e-9, 'jian damage');
  assert.ok(target.frozen > 0 && target.knockdown === 0, 'frozen in place');
  assert.deepEqual(shards(thrown, 'jian').map(s => s.maxLife), [.55, .55, .55, .55], 'ice shards melt sooner');
  assert.deepEqual(cues(thrown, 'shatter').map(c => c.params), [{ kind: 'jian' }]);
  assert.equal(thrown.state.effects.filter(fx => fx.fx === 'explosion').length, 0, 'ice shatters, it does not explode');

  // Missed, it shatters on the arena edge instead of leaving the screen.
  const missed = fixture();
  arm(missed, 'jian');
  missed.throwWeapon(missed.state.player);
  flyUntil(missed, () => !missed.state.projectiles.length);
  assert.equal(shards(missed, 'jian').length, 4, 'it shatters instead of leaving the screen');
  assert.ok(shards(missed, 'jian').every(s => s.x > 1180), 'at the right edge');
});

test('only the Water guardian leaves the frost jian, and it travels between story chapters', () => {
  for (const [element, relic] of [['water', true], ['fire', false], ['earth', false], ['air', false]]) {
    const game = fixture();
    const boss = game.spawnEnemy({ boss: true, element, x: 800, depth: 520 });
    boss.hp = 0;
    game.resolveDeaths();
    assert.deepEqual(game.state.weapons.map(w => [w.kind, w.relic, w.x, w.depth]), relic ? [['jian', true, 800, 520]] : [], element);
  }
  const story = new Game({ mode: 'story', seed: 3 });
  story.start();
  story.state.enemies = [];
  story.state.weapons = [{ x: 500, y: 560, depth: 560, kind: 'jian', life: 30, relic: true }, { x: 700, y: 560, depth: 560, kind: 'staff', life: 20 }];
  story.beginWave();
  assert.deepEqual(story.state.weapons.filter(w => w.relic).map(w => w.kind), ['jian']);
  assert.ok(!story.state.weapons.some(w => w.kind === 'staff' && w.x === 700), 'ordinary pickups stay behind');
});

test('the jade bracer halves frontal hits, never lets a guard chip and breaks on its sixth', () => {
  const game = fixture();
  const p = game.state.player;
  const attacker = foe(game, 450);
  const reset = () => Object.assign(p, { invulnerable: 0, stagger: 0, knockdown: 0, hitLag: 0, hp: p.maxHp, guard: false, energy: 100 });
  Object.assign(p, { armorItem: 'bracer', armorHits: 6 });
  reset();
  game.damage(p, 20, -1, attacker, { knockback: 0 });
  near(p.maxHp - p.hp, 20 * .72 * .5, 1e-9, 'a frontal hit is halved');
  assert.equal(p.armorHits, 5);
  reset();
  game.damage(p, 20, 1, attacker, { knockback: 0 });
  near(p.maxHp - p.hp, 20 * .72, 1e-9, 'a hit from behind is not');
  assert.equal(p.armorHits, 5);
  reset();
  p.guard = true;
  game.damage(p, 20, -1, attacker, { knockback: 0 });
  assert.equal(p.hp, p.maxHp, 'a blocked hit never chips through it');
  assert.equal(p.energy, 90);
  assert.equal(p.armorHits, 5);
  p.armorHits = 1;
  reset();
  game.state.sounds = [];
  game.damage(p, 20, -1, attacker, { knockback: 0 });
  assert.equal(p.armorItem, null, 'the last hit breaks it');
  assert.deepEqual(cues(game, 'weaponBreak').map(c => c.params), [{ kind: 'bracer' }]);
  assert.equal(shards(game, 'bracer').length, 4);
});

test('broken weapon debris: one puff, each piece from where it sat (mirrored leftward), settling on the floor', () => {
  const game = fixture();
  const seed = game.seed;
  game.shatterWeapon('staff', 600, 500, 560, -1, 0);
  const [puff, ...pieces] = game.state.particles;
  assert.equal(puff.kind, 'breakPuff');
  assert.equal(pieces.length, WEAPON_SHARDS.staff.length);
  pieces.forEach((piece, i) => {
    const [ox, oy] = WEAPON_SHARDS.staff[i];
    assert.equal(piece.x, 600 - ox, 'mirrored for a leftward weapon');
    assert.equal(piece.y, 500 + oy);
    assert.equal(piece.flip, -1);
    if (ox) assert.equal(Math.sign(piece.vx), -Math.sign(ox), 'flung outward');
    assert.ok(piece.vy < -100, 'kicked upward');
  });
  game.state.particles = [];
  game.shatterWeapon('spear', 600, 500, 560, 1, Math.PI / 2);
  const tip = game.state.particles[1];
  near(tip.x, 600, 1e-9, 'turned with the weapon');
  near(tip.y, 500 + WEAPON_SHARDS.spear[0][0], 1e-9, 'the head sits along the shaft');
  for (let t = 0; t < .76; t += STEP) game.updateVisuals(STEP);
  for (const piece of game.state.particles.filter(p => p.kind === 'shard')) {
    assert.ok(piece.y <= piece.floor + 1e-9 && piece.y > piece.floor - 1, 'resting on its floor line');
    assert.equal(piece.vy, 0);
  }
  for (let t = 0; t < .15; t += STEP) game.updateVisuals(STEP);
  assert.equal(game.state.particles.length, 0, 'gone after 0.9 s');
  assert.equal(game.seed, seed, 'debris never draws from the simulation stream');
});

test('weapon throws, flights and breaks never draw from the simulation random stream', () => {
  for (const kind of WEAPON_ORDER.filter(k => !WEAPON_SPECS[k].worn)) {
    const game = fixture();
    arm(game, kind);
    foe(game, 560);
    const seed = game.seed;
    game.throwWeapon(game.state.player);
    advance(game, 2.5);
    assert.equal(game.seed, seed, kind);
  }
});

test('enemies never dodge or guard a bracer tossed off; a thrown weapon in the same place they do', () => {
  for (const toss of [true, false]) {
    const game = fixture({ difficulty: 'normal' });
    const e = foe(game, 600, { element: 'earth', facing: -1, energy: 100, grounded: true });
    e.ai = { defenseAfter: 0, guardAfter: 0, side: 1 };
    const shot = { x: 520, y: 524, depth: 560, z: 36, vDepth: 0, vx: 300, vy: 0, gravity: 0, r: 10, kind: 'weapon', weapon: toss ? 'bracer' : 'staff', toss,
      team: 'player', life: 1, damage: toss ? 0 : 32, knockback: 0, source: game.state.player };
    game.state.projectiles = [shot];
    game.enemyAI.projectileSeen.set(shot, game.state.time - 1);
    const reaction = game.enemyAI.defenseInput(game, e, { reaction: .17, defense: 1 });
    assert.equal(reaction == null, toss, toss ? 'the toss is ignored' : 'a thrown staff is defended against');
  }
});

test('a mill stone that rolls to a stop splits in dust; one that hits a body bursts', () => {
  const game = fixture();
  arm(game, 'millstone');
  game.throwWeapon(game.state.player);
  flyUntil(game, () => !game.state.projectiles.length);
  assert.equal(game.state.effects.filter(e => e.fx === 'explosion').length, 0, 'no blast where it stopped');
  const [dust] = game.state.effects.filter(e => e.fx === 'dustLand'); // the landing dust is long gone
  const puff = game.state.particles.find(p => p.kind === 'breakPuff');
  assert.ok(dust && dust.x === puff.x, 'dust where it split');
  const struck = fixture();
  arm(struck, 'millstone');
  foe(struck, 730);
  struck.throwWeapon(struck.state.player);
  flyUntil(struck, () => !struck.state.projectiles.length);
  assert.equal(struck.state.effects.filter(e => e.fx === 'explosion')[0]?.p.scale, WEAPON_SPECS.millstone.burst);
});

// Review fixes: walls, flight time, floor breaks, the parried chakram, the jian's count, the
// knife pair's second sound, the holder's own lantern, the lantern's pieces and a clean release.
const BREAK_CUES = ['weaponBreak', 'shatter', 'burstFire'];
const breaks = game => game.state.sounds.filter(c => BREAK_CUES.includes(c.name));

test('a thrown weapon that misses never leaves through an arena wall: it breaks, bursts or splits on it', () => {
  for (const kind of WEAPON_ORDER.filter(k => !WEAPON_SPECS[k].worn && k !== 'chakram')) {
    for (const [x, facing] of [[1200, 1], [900, 1], [80, -1], [360, -1]]) {
      const game = fixture();
      arm(game, kind);
      Object.assign(game.state.player, { x, facing });
      game.throwWeapon(game.state.player);
      flyUntil(game, () => !game.state.projectiles.length);
      assert.equal(breaks(game).length, 1, `${kind} from ${x}: it breaks once`);
      const debris = game.state.particles.filter(p => p.kind === 'shard' || p.kind === 'breakPuff' || p.kind === 'lanternBurst');
      assert.ok(debris.length > 0, `${kind} from ${x}: its pieces show`);
      for (const p of debris) assert.ok(p.x >= 0 && p.x <= 1280, `${kind} from ${x}: on the canvas (${p.x.toFixed(0)})`);
      const burst = debris.find(p => p.kind === 'lanternBurst' || p.kind === 'breakPuff');
      assert.ok(burst.x >= 30 && burst.x <= 1250, `${kind} from ${x}: inside the walls`);
    }
  }
  // A body pinned at the wall is still hit, and the lantern's blast reaches it there.
  for (const kind of ['staff', 'lantern']) {
    const game = fixture();
    arm(game, kind);
    game.state.player.x = 1120;
    game.state.player.weaponFuse = 4;
    const e = foe(game, 1235);
    game.throwWeapon(game.state.player);
    flyUntil(game, () => !game.state.projectiles.length);
    assert.ok(lost(e) > 0, `${kind} hits the body at the wall`);
  }
  // A bracer tossed off at the wall drops down it and lands in the arena.
  const toss = fixture();
  Object.assign(toss.state.player, { x: 1230, armorItem: 'bracer', armorHits: 3 });
  toss.tick({ interact: true }, STEP);
  flyUntil(toss, () => !toss.state.projectiles.length);
  assert.deepEqual(toss.state.weapons.map(w => [w.kind, w.uses]), [['bracer', 3]]);
  assert.ok(toss.state.weapons[0].x <= 1250);
});

test('a weapon whose flight time runs out in the air still breaks where it is', () => {
  for (const kind of ['crate', 'guandao']) {
    const game = fixture();
    const p = game.state.player;
    arm(game, kind);
    Object.assign(p, { x: 200, z: 118, grounded: false });
    p.y = p.depth - p.z;
    game.throwWeapon(p);
    const shot = game.state.projectiles[0];
    for (let i = 0; i < 3 / STEP && game.state.projectiles.length; i += 1) { p.z = 118; p.vy = 0; game.tick({}, STEP); }
    assert.ok(shot.z > 5 && shot.x < 1250, `${kind} expired in the air, short of the wall`);
    assert.equal(cues(game, 'weaponBreak').length, 1, `${kind} breaks`);
    assert.equal(shards(game, kind).length, WEAPON_SHARDS[kind].length);
  }
});

test('a weapon breaking on the floor flings its pieces up and out before they settle', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'staff');
  p.x = 100;
  game.throwWeapon(p);
  const shot = game.state.projectiles[0];
  flyUntil(game, () => !game.state.projectiles.length);
  assert.ok(shot.z < 0 && shot.x < 1200, 'it landed on open floor');
  const pieces = shards(game, 'staff').map(piece => ({ piece, x: piece.x, y: piece.y, top: piece.y }));
  assert.equal(pieces.length, 4);
  for (const item of pieces) assert.ok(item.y < item.piece.floor - 3, 'each piece starts above its floor line');
  for (let t = 0; t < .2; t += STEP) {
    game.tick({}, STEP);
    for (const item of pieces) item.top = Math.min(item.top, item.piece.y);
  }
  for (const item of pieces) assert.ok(item.top < item.y - 5, 'it flies up first');
  advance(game, .6);
  const travel = pieces.map(item => Math.abs(item.piece.x - item.x));
  assert.ok(travel.filter(d => d >= 12).length >= 3, `the pieces fly out (${travel.map(d => d.toFixed(0))} px)`);
  for (const item of pieces) assert.ok(Math.abs(item.piece.y - item.piece.floor) < 1 && item.piece.vy === 0, 'then rest on the floor');
});

test('a parried chakram flies straight on and breaks: the parrier never catches it', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'chakram');
  const e = foe(game, 520);
  game.enemyInput = () => ({ guard: true });
  game.throwWeapon(p);
  advance(game, .1);
  assert.ok(game.state.floaters.some(f => f.text === 'PARRY'), 'the throw is parried');
  const shot = game.state.projectiles[0];
  assert.ok(shot && shot.team === 'enemy' && shot.returnAt == null && shot.vx < 0, 'turned back without a return');
  flyUntil(game, () => !game.state.projectiles.length);
  advance(game, .5);
  assert.equal(e.weapon, null, 'the parrier is never armed');
  assert.equal(p.weapon, null);
  assert.equal(cues(game, 'weaponBreak').length, 1, 'it breaks');
  assert.ok(lost(p) > 0, 'on the thrower');
  assert.equal(game.state.weapons.length, 0);
});

test('a chakram thrown into the wall from beside it comes straight back to the hand', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'chakram', 7);
  p.x = 1232;
  game.throwWeapon(p);
  flyUntil(game, () => p.weapon === 'chakram', 1);
  assert.equal(p.weaponHits, 7);
  assert.equal(game.state.weapons.length, 0, 'never dropped on the floor');
});

test('the frost jian counts its blows afresh with every weapon taken in hand', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'jian');
  const e = foe(game, 470);
  const blow = () => { Object.assign(e, { invulnerable: 0, frozen: 0, stagger: 0, hitLag: 0, iceFx: 0 }); swing(game, p); };
  blow();
  blow();
  assert.equal(p.weaponStreak, 2);
  game.pickup(p); // E with nothing in reach drops it
  assert.equal(p.weapon, null);
  assert.equal(p.weaponStreak, 0);
  game.state.weapons = [{ x: 430, y: 560, depth: 560, kind: 'jian', life: 20 }];
  p.weaponStreak = 2; // even a stale count never carries over
  game.pickup(p);
  assert.equal(p.weapon, 'jian');
  assert.equal(p.weaponStreak, 0);
  blow();
  assert.equal(e.frozen, 0, 'the first blow of a fresh jian only chills');
  blow();
  blow();
  assert.equal(e.frozen, .6, 'its third freezes');
  // Thrown or caught back, the count starts over too.
  game.throwWeapon(p);
  assert.equal(p.weaponStreak, 0);
});

test('the second knife of a thrown pair sounds a beat after the first, so both are heard', () => {
  const game = fixture();
  arm(game, 'knives');
  foe(game, 520);
  game.throwWeapon(game.state.player);
  game.state.impacts = [];
  flyUntil(game, () => !game.state.projectiles.length);
  const hits = game.state.impacts.filter(i => i.kind === 'hit');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].delay, undefined);
  near(hits[1].delay, .06, 1e-9, 'the second blow');
});

test('a lantern bursting in the hand gets through the holder\'s bracer; its pieces fly without a snap puff', () => {
  const game = fixture();
  const p = game.state.player;
  arm(game, 'lantern');
  Object.assign(p, { weaponFuse: .05, armorItem: 'bracer', armorHits: 6 });
  advance(game, .1);
  near(lost(p), 30, 1e-9, 'the full blast');
  assert.equal(p.armorHits, 6, 'and the bracer is not worn by it');
  assert.equal(shards(game, 'lantern').length, WEAPON_SHARDS.lantern.length, 'caps, paper and glow scrap');
  assert.equal(game.state.particles.filter(q => q.kind === 'breakPuff').length, 0);
  assert.ok(game.state.floaters.find(f => f.text === 'LANTERN BURST').y < p.y - p.h - 40, 'its label clears the damage numbers');
});

test('throws release cleanly, labels use display names, and a mill stone raises a small puff of dust', () => {
  const game = fixture();
  arm(game, 'staff');
  game.throwWeapon(game.state.player);
  assert.equal(game.state.particles.length, 0, 'no dust dots at the chest');
  game.state.weapons = [{ x: 430, y: 560, depth: 560, kind: 'millstone', life: 20 }];
  game.tick({ interact: true }, STEP);
  assert.ok(game.state.floaters.some(f => f.text === 'MILL STONE EQUIPPED'));
  game.state.projectiles = [];
  game.throwWeapon(game.state.player);
  flyUntil(game, () => !game.state.projectiles.length);
  const dust = game.state.effects.filter(e => e.fx === 'dustLand');
  assert.ok(dust.length >= 1 && dust.every(e => e.p.scale < .5), 'stone-sized dust, not a body-sized ring');
  for (const kind of WEAPON_ORDER) assert.ok(WEAPON_SPECS[kind].short && WEAPON_SPECS[kind].short.length <= 10, `${kind} short name`);
});
