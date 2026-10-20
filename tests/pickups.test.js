// Consumables (CONSUMABLES in src/pickup-art.js, ITEM_EFFECTS in src/data.js): spawning, the
// timed use (E -> startConsume -> updateConsume -> applyConsumable), each effect, interrupts,
// the planted censer field, the elixir and qi-flow buffs, orb and crate drops, sounds and
// determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ITEM_EFFECTS, ITEM_SPAWN, ITEM_SHARE, CRATE_BUNS, WEAPON_SPECS, PICKUP_REACH, pickupIndex } from '../src/data.js';
import { CONSUMABLES, CP_PLANT_X, CP_SPARKLE_TIME } from '../src/pickup-art.js';
import { Renderer } from '../src/renderer.js';
import { fakeCanvas } from './fake-canvas.js';

const STEP = 1 / 120;
const advance = (game, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / STEP - 1e-9); i += 1) game.tick(input, STEP); };
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const KINDS = ['heal', 'energy', 'bun', 'gourd', 'incense', 'peach', 'pill', 'orb'];

// Survival with nothing scheduled: no training regeneration, no wave or pickup timers.
function fixture(options = {}) {
  const game = new Game({ element: 'air', arena: 'air', mode: 'survival', difficulty: 'normal', seed: 7, ...options });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], weapons: [], floaters: [], sounds: [], auras: [], waveDelay: 999, weaponTimer: 999 });
  Object.assign(game.state.player, { x: 400, depth: 560, z: 0, y: 560, vx: 0, vy: 0, vDepth: 0, facing: 1, grounded: true, invulnerable: 0 });
  return game;
}
// Puts a consumable dx ahead of the player (in screen x) and presses E for one tick.
function take(game, kind, { dx = 30, variant = 'water', lane = 0 } = {}) {
  const p = game.state.player;
  game.state.weapons.push({ kind, variant, x: p.x + dx, y: p.depth + lane, depth: p.depth + lane, life: 20 });
  game.tick({ interact: true }, STEP);
  return p;
}
// Runs a started use to the tick its effect lands; returns the player before and after that tick.
function toEffect(game, input = {}) {
  const p = game.state.player;
  let before = null;
  for (let i = 0; i < 240 && p.consume && !p.consume.applied; i += 1) {
    before = { hp: p.hp, energy: p.energy, t: game.state.time };
    game.tick(input, STEP);
  }
  assert.ok(p.consume?.applied || !p.consume, 'the effect landed');
  return { before, after: { hp: p.hp, energy: p.energy, t: game.state.time } };
}

test('consumables share the 12-second drops by their weights; the spirit orb never rolls', () => {
  for (const [kind, spec] of Object.entries(CONSUMABLES)) {
    if (spec.weight > 0) assert.equal(ITEM_SPAWN[kind], spec.weight, `${kind} weight`);
    else assert.ok(!(kind in ITEM_SPAWN), `${kind} is drop only`);
  }
  assert.equal(CONSUMABLES.orb.weight, 0);
  const counts = {};
  const N = 6000;
  const game = fixture();
  for (let i = 0; i < N; i += 1) {
    game.state.weapons = [];
    game.seed = (Math.imul(i + 1, 2654435761) >>> 0) || 1;
    game.spawnWeapon(false);
    const item = game.state.weapons[0];
    counts[item.kind] = (counts[item.kind] || 0) + 1;
    if (CONSUMABLES[item.kind]) assert.ok(Number.isFinite(item.seed), 'a consumable carries its bob phase');
  }
  const weaponTotal = Object.values(WEAPON_SPECS).reduce((sum, spec) => sum + (spec.spawn || 0), 0);
  const itemShare = Object.keys(ITEM_SPAWN).reduce((sum, kind) => sum + (counts[kind] || 0), 0) / N;
  near(itemShare, ITEM_SHARE / (ITEM_SHARE + weaponTotal), .025, 'consumables keep their share of the drops');
  const weights = Object.values(ITEM_SPAWN).reduce((a, b) => a + b, 0);
  for (const [kind, weight] of Object.entries(ITEM_SPAWN)) near((counts[kind] || 0) / N, weight / weights * itemShare, .02, `${kind} rate`);
  assert.ok(!counts.orb, 'no spirit orb from the field roll');
});

test('E starts a use: the item leaves the floor, the fighter turns to it and holds still until the effect lands once', () => {
  const game = fixture();
  const p = game.state.player;
  p.hp = 50;
  // The tonic lies behind the player: they turn to face it.
  take(game, 'heal', { dx: -40, lane: 6 });
  assert.equal(game.state.weapons.length, 0, 'the item left the floor');
  assert.equal(p.facing, -1, 'turned to the item');
  assert.deepEqual(p.consume && { kind: p.consume.kind, duration: p.consume.duration, from: p.consume.from },
    { kind: 'heal', duration: CONSUMABLES.heal.useTime, from: [40, 6] });
  const x0 = p.x, depth0 = p.depth;
  // Steps, attacks, guard and jumps are all held while the use plays.
  const { before, after } = toEffect(game, { right: true, down: true, attack: true, guard: true, jump: true });
  assert.equal(before.hp, 50, 'no health before the effect point');
  assert.equal(after.hp, 90, '+40 health once');
  assert.equal(p.action, null, 'no attack started');
  assert.equal(p.guard, false, 'no guard');
  assert.ok(p.grounded && p.z === 0, 'no jump');
  assert.equal(p.x, x0);
  assert.equal(p.depth, depth0);
  advance(game, CONSUMABLES.heal.useTime);
  assert.equal(p.consume, null, 'the use ends after its use time');
  assert.equal(p.hp, 90, 'the effect landed only once');
  // The effect lands at applyAt of the use time.
  const timing = fixture();
  const q = take(timing, 'energy');
  q.energy = 0;
  // The use clock starts on the tick after E (like an action's), so it lands within a tick.
  const start = timing.state.time;
  const { after: done } = toEffect(timing);
  near(done.t - start, CONSUMABLES.energy.applyAt * CONSUMABLES.energy.useTime, STEP + 1e-9, 'the jar lands at p 0.66');
});

test('each consumable applies its effect: health, energy, cleansing, qi flow, power, the censer field and spirit orbs', () => {
  const dt = STEP * 14; // the player's energy regeneration during the effect tick
  for (const [kind, hp, energy] of [['heal', 40, 0], ['bun', 15, 0], ['peach', 80, 0], ['energy', 0, 55], ['gourd', 0, 20], ['orb', 0, 50]]) {
    const game = fixture();
    const p = game.state.player;
    Object.assign(p, { hp: 10, energy: 0 });
    take(game, kind, { variant: 'fire' });
    const { before, after } = toEffect(game);
    near(after.hp - before.hp, hp, 1e-9, `${kind} health`);
    near(after.energy - before.energy, energy + dt, 1e-9, `${kind} energy`);
  }
  // The longevity peach also clears burn and slow (a freeze cuts the use short, see below).
  const peach = fixture();
  const p = peach.state.player;
  take(peach, 'peach');
  Object.assign(p, { burn: 1.5, burnTick: 9, slow: 2 });
  toEffect(peach);
  assert.deepEqual([p.burn, p.slow], [0, 0]);
  assert.ok(peach.state.floaters.some(f => f.text === '+ HEALTH · CLEANSED'));
  // An orb of the fighter's own element gives 100 and clears the burst cooldown.
  const own = fixture();
  const o = own.state.player;
  Object.assign(o, { energy: 0 });
  o.cooldowns.burst = 4;
  take(own, 'orb', { variant: 'air' });
  const orb = toEffect(own);
  assert.ok(orb.before.energy < 10 && ITEM_EFFECTS.orb.own === 100);
  assert.equal(orb.after.energy, o.maxEnergy, 'own orb: +100 energy (full)');
  assert.equal(o.cooldowns.burst, 0, 'burst ready');
  // Gourd: qi flow tops energy up by 6/s for 8 s (measured while guarding, regeneration 2/s).
  const gourd = fixture();
  const g = gourd.state.player;
  take(gourd, 'gourd');
  toEffect(gourd);
  assert.equal(g.qiFlow, ITEM_EFFECTS.gourd.flow);
  advance(gourd, 1);
  g.energy = 0;
  advance(gourd, 1, { guard: true });
  near(g.energy, 2 + ITEM_EFFECTS.gourd.flowRate, .15, 'guarding with qi flow (the first tick still regenerates unguarded)');
  advance(gourd, 6.2);
  assert.equal(g.qiFlow, 0, 'the flow ends after 8 s');
  g.energy = 0;
  advance(gourd, 1, { guard: true });
  near(g.energy, 2, .15, 'guarding without qi flow');
});

test('the golden elixir: blows land x1.3 harder and throw x1.2 further for 8 s, never on oneself', () => {
  const game = fixture();
  const p = game.state.player;
  const dummy = game.makeFighter('enemy', 'fire', 600, 560);
  game.state.enemies.push(dummy);
  const blow = () => {
    Object.assign(dummy, { hp: 100, invulnerable: 0, knockdown: 0, stun: 0, vx: 0, hitLag: 0 });
    game.damage(dummy, 10, 1, p, { knockback: 300 });
    return [100 - dummy.hp, dummy.vx];
  };
  const plain = blow();
  take(game, 'pill');
  toEffect(game);
  near(p.power, ITEM_EFFECTS.pill.power, 1e-9, 'power seconds');
  const strong = blow();
  near(strong[0], plain[0] * ITEM_EFFECTS.pill.damage, 1e-9, 'damage');
  near(strong[1], plain[1] * ITEM_EFFECTS.pill.knockback, 1e-9, 'knockback');
  // A lantern bursting in the holder's own hand is not boosted.
  Object.assign(p, { hp: 100, invulnerable: 0, hitLag: 0 });
  game.damage(p, 10, 1, p, { knockback: 300, unblockable: true });
  near(100 - p.hp, 10, 1e-9, 'no boost on oneself');
  advance(game, ITEM_EFFECTS.pill.power + .1);
  assert.equal(p.power, 0, 'the elixir wears off');
  assert.deepEqual(blow(), plain);
});

test('a planted censer heals its team inside its field for 10 s', () => {
  const game = fixture();
  const p = game.state.player;
  take(game, 'incense');
  toEffect(game);
  const [aura] = game.state.auras;
  assert.ok(aura, 'a field is planted');
  near(aura.x, p.x + CP_PLANT_X, 1e-9, 'where the use pose set the censer down');
  assert.deepEqual([aura.depth, aura.team, aura.r, aura.rate, aura.maxLife], [p.depth, 'player', 90, 4, 10]);
  // Inside: +4 HP/s and the censerRegen flag. An enemy inside is not healed.
  const foe = game.makeFighter('enemy', 'earth', aura.x + 20, aura.depth);
  Object.assign(foe, { hp: 50, aiTimer: 1e3 });
  game.state.enemies.push(foe);
  p.hp = 50;
  advance(game, 1);
  near(p.hp, 54, .05, 'player regenerates');
  assert.ok(p.censerRegen > 0 && p.censerRegen < 1);
  assert.equal(foe.hp, 50, 'opponents gain nothing');
  // Outside the ellipse (r 90 across, 0.31 r deep): nothing.
  p.depth = p.y = aura.depth + 30;
  advance(game, .5);
  near(p.hp, 54, 1e-9, 'out of the field (depth)');
  assert.equal(p.censerRegen, 0);
  advance(game, 10);
  assert.equal(game.state.auras.length, 0, 'the field burns out after 10 s');
});

test('a blow before the effect knocks the item out: it is lost; a blow after keeps the effect', () => {
  const game = fixture();
  const p = game.state.player;
  p.hp = 50;
  take(game, 'heal');
  advance(game, .1);
  assert.ok(p.consume && !p.consume.applied);
  game.damage(p, 5, -1, null, { knockback: 100 });
  assert.equal(p.consume, null, 'the use is cut short');
  assert.deepEqual({ kind: p.consumeLost.kind, applied: p.consumeLost.applied }, { kind: 'heal', applied: false });
  assert.ok(p.hp < 50, 'no health from the tonic');
  assert.equal(game.state.weapons.length, 0, 'the item is lost, not dropped');
  const serial = p.consumeLost.serial;
  advance(game, 1.5);
  Object.assign(p, { hp: 50, invulnerable: 0 });
  take(game, 'heal');
  toEffect(game);
  game.damage(p, 5, -1, null, { knockback: 100 });
  assert.equal(p.consume, null);
  assert.ok(p.consumeLost.serial > serial && p.consumeLost.applied, 'cut after the effect');
  assert.ok(p.hp > 80, 'the tonic already landed');
});

test('a held weapon stays in hand through a use, and the next E works again', () => {
  const game = fixture();
  const p = game.state.player;
  Object.assign(p, { weapon: 'lantern', weaponHits: 1, weaponFuse: 3, armorItem: 'bracer', armorHits: 4 });
  take(game, 'bun');
  assert.deepEqual([p.weapon, p.armorItem], ['lantern', 'bracer'], 'stowed, not dropped');
  advance(game, CONSUMABLES.bun.useTime + STEP);
  assert.equal(p.consume, null);
  assert.deepEqual([p.weapon, p.armorItem, p.armorHits], ['lantern', 'bracer', 4]);
  assert.ok(p.weaponFuse < 3, 'a lantern fuse keeps burning');
  // E while a use plays does nothing more.
  p.weaponFuse = 3;
  take(game, 'heal', { dx: 25 });
  assert.ok(p.consume);
  game.state.weapons.push({ kind: 'staff', x: p.x + 20, y: p.depth, depth: p.depth, life: 20 });
  game.pickup(p);
  assert.equal(p.weapon, 'lantern', 'no pickup during a use');
  assert.equal(game.state.weapons.length, 1, 'the staff stays on the floor');
});

test('a second E during a use does nothing, even pressed in its last moments', () => {
  // Through game.tick and its input buffer: a late E must not carry past the use and drop the
  // held weapon, toss the bracer or take the next item as the use ends.
  const lateE = (game, kind, lateBy) => {
    const p = game.state.player;
    while (p.consume && p.consume.t < CONSUMABLES[kind].useTime - lateBy - 1e-9) game.tick({}, STEP);
    assert.ok(p.consume, `still using ${kind} as E is pressed`);
    game.tick({ interact: true }, STEP);
    advance(game, .3);
    assert.equal(p.consume, null, 'the use ended');
  };
  for (const lateBy of [.08, STEP]) {
    const game = fixture();
    const p = game.state.player;
    Object.assign(p, { weapon: 'staff', weaponHits: 14 });
    take(game, 'bun');
    lateE(game, 'bun', lateBy);
    assert.equal(p.weapon, 'staff', `E ${lateBy}s before the end: the staff stays in hand`);
    assert.deepEqual(game.state.weapons, [], 'nothing dropped');
  }
  const worn = fixture();
  Object.assign(worn.state.player, { armorItem: 'bracer', armorHits: 4 });
  take(worn, 'heal');
  lateE(worn, 'heal', .05);
  assert.deepEqual([worn.state.player.armorItem, worn.state.weapons.length], ['bracer', 0], 'the bracer stays on');
  // Another item in reach stays on the floor; the next E after the use takes it.
  const next = fixture();
  const q = next.state.player;
  take(next, 'bun');
  next.state.weapons.push({ kind: 'spear', x: q.x + 20, y: q.depth, depth: q.depth, life: 20 });
  lateE(next, 'bun', .1);
  assert.deepEqual([q.weapon, next.state.weapons.map(w => w.kind)], [null, ['spear']]);
  next.tick({ interact: true }, STEP);
  assert.equal(q.weapon, 'spear', 'E after the use works again');
});

test('a use stops a run where it stands', () => {
  const game = fixture();
  const p = game.state.player;
  advance(game, .5, { right: true, run: true });
  assert.ok(p.running && p.vx > 300, 'running');
  take(game, 'heal', { dx: 40 });
  assert.ok(p.consume);
  assert.deepEqual([p.vx, p.vDepth, p.running], [0, 0, false], 'no momentum carried into the use');
  const x0 = p.x;
  while (p.consume) game.tick({}, STEP);
  assert.equal(p.x, x0, 'no slide during the use');
});

test('a use still playing as a Story chapter begins finishes at once, where the player now stands', () => {
  // Without the use, the same chapter change: the difference is the tonic's +40 alone.
  const chapter = kind => {
    const game = fixture({ mode: 'story' });
    const s = game.state;
    const p = s.player;
    p.hp = 20;
    if (kind) take(game, kind);
    else game.tick({}, STEP);
    s.waveDelay = STEP * 1.5;
    const wave = s.wave;
    for (let i = 0; i < 4 && s.wave === wave; i += 1) game.tick({}, STEP);
    assert.equal(s.wave, wave + 1, 'the next chapter began');
    return game;
  };
  const plain = chapter(null).state.player.hp;
  const game = chapter('heal');
  const p = game.state.player;
  assert.deepEqual([p.consume, p.consumeLost], [null, null], 'finished, not knocked away');
  near(p.hp - plain, 40, 1e-9, 'the tonic landed');
  assert.deepEqual(game.state.sounds.filter(c => c.name === 'drink').map(c => c.params.part), ['chime'], 'with its chime');
  // A censer is planted in the new sanctuary, beside the placed player.
  const censer = chapter('incense');
  const [aura] = censer.state.auras;
  assert.ok(aura, 'the censer field is planted');
  near(aura.x, censer.state.player.x + CP_PLANT_X * censer.state.player.facing, 1e-9, 'beside the player as placed');
  assert.equal(aura.depth, censer.state.player.depth);
});

test('a stun, freeze, knockdown or leaving the floor without a blow cuts a use short, as does a grab; a frozen fighter starts none', () => {
  const cases = [['stun', p => { p.stun = .3; }], ['freeze', p => { p.frozen = 1; }], ['knockdown', p => { p.knockdown = .5; }],
    ['airborne', p => { Object.assign(p, { grounded: false, z: 12, vy: -200 }); }]];
  for (const [name, apply] of cases) {
    const game = fixture();
    const p = game.state.player;
    Object.assign(p, { hp: 50, burn: 1.5, burnTick: 9, slow: 2 });
    take(game, 'peach');
    advance(game, .1);
    assert.ok(p.consume && !p.consume.applied);
    const serial = game.state.itemSerial;
    apply(p);
    game.tick({}, STEP);
    assert.equal(p.consume, null, `${name}: the use is cut short`);
    assert.deepEqual(p.consumeLost, { kind: 'peach', variant: 'water', applied: false, serial: serial + 1 }, `${name}: the peach is knocked away`);
    assert.equal(p.hp, 50, `${name}: no health`);
    assert.ok(p.burn > 0 && p.slow > 0, `${name}: nothing cleansed`);
  }
  // A grab takes the item out of the hand like a blow (grapples.tryGrab).
  const game = fixture();
  const p = game.state.player;
  const foe = game.makeFighter('enemy', 'earth', p.x + 40, p.depth);
  Object.assign(foe, { facing: -1, aiTimer: 1e3, invulnerable: 0, spawnReveal: 0 });
  game.state.enemies.push(foe);
  p.hp = 50;
  take(game, 'heal');
  advance(game, .1);
  const serial = game.state.itemSerial;
  Object.assign(p, { stun: .5, hitType: 'dizzy' });
  Object.assign(foe, { x: p.x + 40, facing: -1 });
  assert.ok(game.grapples.tryGrab(game, foe), 'grabbed');
  assert.equal(p.consume, null);
  assert.deepEqual(p.consumeLost, { kind: 'heal', variant: 'water', applied: false, serial: serial + 1 });
  assert.equal(p.hp, 50, 'the tonic never landed');
  // Frozen, E takes nothing: the peach stays on the floor.
  const ice = fixture();
  ice.state.player.frozen = 1;
  take(ice, 'peach');
  advance(ice, .2);
  assert.equal(ice.state.player.consume, null);
  assert.deepEqual(ice.state.weapons.map(w => w.kind), ['peach']);
});

test('spirit orbs drop at a guardian phase break and every third wave; a broken crate spills two buns', () => {
  // Phase break: an orb of the guardian's element on the player's side of it.
  const game = fixture({ seed: 3 });
  const s = game.state;
  s.player.x = 300;
  const boss = game.spawnEnemy({ boss: true, element: 'water', x: 700, depth: 560 });
  Object.assign(boss, { spawnReveal: 0, invulnerable: 0, hp: boss.maxHp * .4 });
  for (let i = 0; i < 60 && boss.bossPhase < 2; i += 1) game.tick({}, STEP);
  assert.equal(boss.bossPhase, 2);
  const orb = s.weapons.find(w => w.kind === 'orb');
  assert.ok(orb && orb.variant === 'water', 'the guardian sheds an orb of its element');
  assert.ok(orb.x < 700, 'on the challenger\'s side');
  // Third waves (any mode but training) open with an orb of the sanctuary's element.
  for (const mode of ['survival', 'challenge', 'tournament']) {
    const waves = new Game({ element: 'fire', arena: 'earth', mode, seed: 5 });
    waves.start();
    for (const wave of [2, 3]) {
      waves.state.weapons = [];
      waves.state.wave = wave - 1;
      waves.beginWave();
      const orbs = waves.state.weapons.filter(w => w.kind === 'orb');
      assert.deepEqual(orbs.map(w => [w.variant, w.x]), wave === 3 ? [['earth', 640]] : [], `${mode} wave ${wave}`);
    }
  }
  // Drops never touch the simulation's random stream.
  const seed = game.seed;
  game.dropOrb('fire', 500, 560);
  game.spillBuns(500, 560);
  assert.equal(game.seed, seed);
  // A thrown crate breaking on the floor and a crate breaking in the hand both spill buns.
  const thrown = fixture();
  Object.assign(thrown.state.player, { weapon: 'crate', weaponHits: 1 });
  thrown.throwWeapon(thrown.state.player);
  advance(thrown, 1.5);
  assert.deepEqual(thrown.state.weapons.map(w => w.kind), Array(CRATE_BUNS).fill('bun'));
  const held = fixture();
  Object.assign(held.state.player, { weapon: 'crate', weaponHits: 1 });
  held.breakHeld(held.state.player);
  assert.deepEqual(held.state.weapons.map(w => w.kind), Array(CRATE_BUNS).fill('bun'));
});

test('E takes the nearest item in reach: the third-wave orb underfoot wins over the wave-start weapon beside it', () => {
  // Lantern market, Survival wave 3: beginWave lays the wave-start weapon, then the fire orb at
  // the arena's heart. The weapon lies at the edge of reach, the player stands on the orb.
  const game = fixture({ arena: 'market' });
  const s = game.state;
  s.wave = 2;
  game.beginWave();
  Object.assign(s, { enemies: [], waveDelay: 999, weaponTimer: 999 });
  const [weapon, orb] = s.weapons;
  assert.ok(WEAPON_SPECS[weapon.kind] && orb.kind === 'orb' && orb.variant === 'fire', 'weapon first, then the fire orb');
  Object.assign(weapon, { x: 615, y: 527, depth: 527 });
  Object.assign(s.player, { x: 635, depth: 555, y: 555 });
  assert.equal(pickupIndex(s.weapons, 635, 555), 1, 'both in reach, the orb is nearer');
  // The renderer's prompt marks the item E will take.
  const renderer = new Renderer(fakeCanvas().canvas);
  renderer.background = () => ({});
  const near = [];
  const draw = renderer.drawWeaponPickup.bind(renderer);
  renderer.drawWeaponPickup = (w, time, rm, isNear) => { near.push([w.kind, !!isNear]); return draw(w, time, rm, isNear); };
  renderer.draw(s);
  assert.deepEqual(near.filter(([, isNear]) => isNear), [['orb', true]]);
  game.tick({ interact: true }, STEP);
  assert.equal(s.player.consume?.kind, 'orb', 'the orb is absorbed');
  assert.equal(s.player.weapon, null);
  assert.deepEqual(s.weapons, [weapon], 'the weapon stays on the floor');
  // Alone in reach, the weapon is taken as before; out of reach, nothing is.
  assert.equal(pickupIndex([weapon], 635, 555), 0);
  assert.equal(pickupIndex([weapon], 615 + PICKUP_REACH.x, 527), -1);
  assert.equal(pickupIndex([weapon], 615, 527 + PICKUP_REACH.depth), -1);
  // Equal distances keep the earlier item; the choice never draws from the random stream.
  const a = { kind: 'staff', x: 380, depth: 560 };
  const b = { kind: 'spear', x: 420, depth: 560 };
  assert.equal(pickupIndex([a, b], 400, 560), 0);
  assert.equal(pickupIndex([b, a], 400, 560), 0);
});

test('use sounds: drinks and food gulp during the use and chime on the effect; the elixir, orb and censer sparkle on it', () => {
  for (const kind of KINDS) {
    const game = fixture();
    const p = game.state.player;
    take(game, kind);
    // at: the clock on the tick each cue was recorded (the E tick included: the bun gulps at once).
    const at = {};
    const mark = () => { for (const cue of game.state.sounds) at[`${cue.name}:${cue.params.part ?? ''}`] ??= game.state.time; };
    mark();
    let effectAt = null;
    for (let i = 0; i < 200 && p.consume; i += 1) {
      const applied = p.consume.applied;
      game.tick({}, STEP);
      if (!applied && (p.consume?.applied || !p.consume) && effectAt == null) effectAt = game.state.time;
      mark();
    }
    const spec = CONSUMABLES[kind];
    const gulp = ['drink', 'jar', 'eat'].includes(spec.use);
    // Food bites ('eat'); drinks gulp ('drink'). Both share the part timing.
    const sfx = spec.use === 'eat' ? 'eat' : 'drink';
    assert.deepEqual(game.state.sounds.map(c => [c.name, c.params]),
      gulp ? [[sfx, { part: 'gulp' }], [sfx, { part: 'chime' }]] : [['energyPickup', {}]], kind);
    if (gulp) {
      near(at[`${sfx}:chime`], effectAt, 1e-9, `${kind}: the chime sounds on the effect tick`);
      near(effectAt - at[`${sfx}:gulp`], Math.min(.24, spec.applyAt * spec.useTime), STEP + 1e-9, `${kind}: the gulps lead the effect by the bank's gulp-to-chime spacing`);
    } else near(at['energyPickup:'], effectAt, 1e-9, `${kind}: the sparkle sounds with the effect`);
  }
  // A use cut short before its gulp is silent; one cut after the gulp but before the effect
  // gulped but never chimes (no restore chime for a heal that never landed).
  const early = fixture();
  take(early, 'peach');
  early.damage(early.state.player, 5, -1, null, {});
  advance(early, 1);
  assert.deepEqual(early.state.sounds.map(c => c.name).filter(n => n === 'drink' || n === 'eat'), []);
  const late = fixture();
  const q = late.state.player;
  q.hp = 40;
  take(late, 'heal');
  for (let i = 0; i < 200 && !late.state.sounds.length; i += 1) late.tick({}, STEP);
  assert.ok(q.consume && !q.consume.applied, 'gulping, the effect still to come');
  late.damage(q, 5, -1, null, {});
  advance(late, 1);
  assert.deepEqual(late.state.sounds.filter(c => c.name === 'drink').map(c => c.params), [{ part: 'gulp' }], 'the gulp only');
  assert.ok(q.hp < 40, 'the tonic never landed');
});

test('the consume sparkle follows its user; a lost life ends the use and the buffs', () => {
  const game = fixture();
  const p = game.state.player;
  take(game, 'gourd');
  toEffect(game);
  const sparkle = game.state.effects.find(e => e.kind === 'consume');
  assert.deepEqual(sparkle && { item: sparkle.item, followId: sparkle.followId, life: sparkle.life, maxLife: sparkle.maxLife },
    { item: 'gourd', followId: p.id, life: CP_SPARKLE_TIME, maxLife: CP_SPARKLE_TIME });
  advance(game, CP_SPARKLE_TIME + .05);
  assert.ok(!game.state.effects.some(e => e.kind === 'consume'), 'the sparkle plays out');
  p.power = 5;
  take(game, 'heal', { dx: 20 });
  assert.ok(p.consume);
  p.hp = 0;
  game.tick({}, STEP);
  assert.deepEqual([p.consume, p.power, p.qiFlow], [null, 0, 0]);
  assert.equal(game.state.lives, 2);
});

test('uses are deterministic and never draw from the simulation random stream', () => {
  const run = () => {
    const game = fixture({ seed: 11 });
    const p = game.state.player;
    const trace = [];
    const seeds = [];
    for (const kind of KINDS) {
      const seed = game.seed;
      take(game, kind, { variant: 'air' });
      advance(game, CONSUMABLES[kind].useTime + .1, { right: true });
      seeds.push(game.seed === seed);
      trace.push([kind, p.hp, p.energy, p.x, p.power, p.qiFlow, game.state.auras.length]);
    }
    return { trace, seeds };
  };
  const a = run(), b = run();
  assert.deepEqual(a.trace, b.trace);
  assert.ok(a.seeds.every(Boolean), 'no this.random() draws while using items');
});
