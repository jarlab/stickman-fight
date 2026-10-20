// The engine's sound cues (state.sounds) and impact data that src/game-audio.js voices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { COMBAT } from '../src/data.js';
import { SFX } from '../src/audio.js';
import { VFX } from '../src/vfx-art.js';

const STEP = 1 / 120;
const advance = (game, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / STEP - 1e-9); i += 1) game.tick(input, STEP); };
const cues = (game, name) => game.state.sounds.filter(c => !name || c.name === name);
const names = game => game.state.sounds.map(c => c.name);
const clear = game => { game.state.sounds = []; };

function fixture(options = {}) {
  const game = new Game({ element: 'air', arena: 'air', mode: 'training', difficulty: 'normal', ...options });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], weapons: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: 500, depth: 560, z: 0, y: 560, vx: 0, vy: 0, vDepth: 0, facing: 1, grounded: true, invulnerable: 0 });
  clear(game);
  return game;
}
function foe(game, x = 560, options = {}) {
  const enemy = game.spawnEnemy({ dummy: true, element: 'earth', x, depth: 560, ...options });
  Object.assign(enemy, { x, depth: 560, y: 560, z: 0, invulnerable: 0, spawnReveal: 0, facing: -1, aiTimer: 100, hp: 2000, maxHp: 2000 });
  game.state.effects = [];
  clear(game);
  return enemy;
}

test('every cue the engine records names a sound in the bank, with a growing id and an arena x', () => {
  const game = new Game({ element: 'fire', mode: 'survival', difficulty: 'crazy', seed: 6 });
  game.start();
  const seen = new Set();
  let last = 0;
  for (let i = 0; i < 120 * 40 && game.state.status === 'playing'; i++) {
    game.tick(i % 50 < 4 ? { attack: true, right: i % 400 < 200, left: i % 400 >= 200 } : i % 211 === 0 ? { special: true } : i % 307 === 0 ? { jump: true } : {}, STEP);
    for (const cue of game.state.sounds) {
      if (cue.id <= last) continue;
      last = cue.id;
      seen.add(cue.name);
      assert.ok(SFX[cue.name], `${cue.name} is a bank sound`);
      assert.ok(Number.isFinite(cue.x) && cue.x >= 0 && cue.x <= 1280, `${cue.name} at x ${cue.x}`);
    }
  }
  for (const name of ['waveGong', 'whoosh', 'enemyDown', 'specialFire', 'jump']) assert.ok(seen.has(name), `a crazy brawl records ${name}`);
  assert.ok(game.state.sounds.length <= 48, 'the cue ring stays short');
});

test('cues never draw from the simulation random stream: the same seeded fight records the same cues', () => {
  const run = () => {
    const game = new Game({ element: 'water', mode: 'survival', difficulty: 'hard', seed: 77 });
    game.start();
    const log = [];
    let last = 0;
    for (let i = 0; i < 120 * 12; i++) {
      game.tick(i % 40 < 3 ? { attack: true } : {}, STEP);
      for (const c of game.state.sounds) if (c.id > last) { last = c.id; log.push(`${c.name}@${c.x.toFixed(1)}`); }
    }
    return { log, seed: game.seed };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  const game = fixture();
  const seed = game.seed;
  for (let i = 0; i < 60; i++) game.sound('whoosh', 300);
  assert.equal(game.seed, seed, 'recording a cue never advances this.random()');
  assert.equal(game.state.sounds.length, 48, 'the ring keeps the newest 48 cues');
  assert.equal(game.state.sounds.at(-1).id - game.state.sounds[0].id, 47);
});

test('a wave rings its gong; a guardian drums as it steps out of its swirl, not before', () => {
  const game = new Game({ element: 'air', mode: 'survival', seed: 11 });
  game.start();
  assert.deepEqual(cues(game, 'waveGong').map(c => c.x), [640], 'wave 1 gong, centred');
  game.state.wave = 2;
  clear(game);
  game.beginWave();
  assert.equal(game.state.wave, 3);
  const boss = game.state.enemies.find(e => e.type === 'boss');
  assert.ok(boss && boss.spawnReveal > 0);
  assert.deepEqual(names(game).filter(n => n === 'waveGong' || n === 'bossDrum'), ['waveGong'], 'the drum waits for the reveal');
  let revealedAt = null;
  for (let t = 0; t < 2 && revealedAt == null; t += STEP) {
    game.tick({}, STEP);
    if (cues(game, 'bossDrum').length) revealedAt = boss.spawnReveal;
  }
  assert.equal(revealedAt, 0, 'the drum sounds on the tick the swirl reveals the guardian');
  assert.ok(Math.abs(cues(game, 'bossDrum')[0].x - boss.x) < 4, 'where the guardian stepped out');
});

test('a guardian still in its swirl when the run is lost steps out silently behind the result screen', () => {
  const game = new Game({ element: 'air', mode: 'survival', seed: 11 });
  game.start();
  game.state.wave = 2;
  game.beginWave();
  const boss = game.state.enemies.find(e => e.type === 'boss');
  assert.ok(boss.spawnReveal > .5);
  Object.assign(game.state, { lives: 1 });
  game.state.player.hp = 0;
  clear(game);
  game.tick({}, STEP);
  assert.equal(game.state.status, 'lost');
  assert.deepEqual(names(game), ['ko'], 'the final KO is recorded on the tick that ends the run');
  assert.ok(boss.spawnReveal > 0, 'the swirl is still hiding the guardian');
  for (let f = 0; f < 90; f++) game.settleVisuals(1 / 60);
  assert.equal(boss.spawnReveal, 0, 'the swirl still plays out');
  assert.deepEqual(names(game), ['ko'], 'no arrival drum on the result screen');
});

test('jumps, double jumps, dodges and recovery rolls record their movement sounds', () => {
  const game = fixture();
  const p = game.state.player;
  game.tick({ jump: true }, STEP);
  assert.deepEqual(names(game), ['jump']);
  advance(game, .12);
  game.tick({ jump: true }, STEP);
  assert.equal(cues(game, 'jump').length, 2, 'the double jump has its own flap');
  advance(game, 1.2);
  assert.ok(p.grounded);
  assert.deepEqual(cues(game, 'land').map(c => c.params), [{ strength: .4 }], 'an ordinary landing thuds softly');
  clear(game);
  advance(game, 1);
  game.tick({ dash: true, right: true }, STEP);
  assert.deepEqual(names(game), ['dash']);
  clear(game);
  Object.assign(p, { knockdown: .55, grounded: true, downTime: .1, buffer: { kind: 'recover', ttl: .2, direction: 1, depthDirection: 0 } });
  game.tick({}, STEP);
  assert.ok(p.recoveryRoll, 'the roll starts');
  assert.deepEqual(names(game), ['dash'], 'a recovery roll uses the dash scuff');
});

test('each swing whooshes once, just before its active frames, voiced by weapon and weight', () => {
  const game = fixture({ element: 'earth' });
  const p = game.state.player;
  game.tick({ attack: true }, STEP);
  const action = p.action;
  assert.equal(action.kind, 'melee');
  const tickOf = () => Math.round(action.t / STEP);
  while (!cues(game, 'whoosh').length) game.tick({}, STEP);
  assert.ok(action.t >= action.windup - .09 - 1e-9 && action.t < action.windup - .09 + STEP + 1e-9, `whoosh at ${action.t.toFixed(3)} for windup ${action.windup}`);
  assert.ok(tickOf() >= 1);
  assert.deepEqual(cues(game, 'whoosh')[0].params, { weapon: null, strength: .8 });
  advance(game, .6);
  assert.equal(cues(game, 'whoosh').length, 1, 'one whoosh per swing');
  clear(game);
  Object.assign(p, { weapon: 'spear', weaponHits: 14 });
  game.tick({ attack: true }, STEP);
  advance(game, .6);
  assert.deepEqual(cues(game, 'whoosh').map(c => c.params), [{ weapon: 'spear', strength: .8 }]);
  clear(game);
  Object.assign(p, { weapon: 'crate', weaponHits: 1, cooldowns: { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 } });
  game.tick({ attack: true }, STEP);
  advance(game, .3);
  assert.deepEqual(cues(game, 'whoosh').map(c => c.params), [{ weapon: 'crate', strength: 1.3 }], 'a crate swing is a heavy one');
  assert.deepEqual(cues(game, 'weaponBreak').map(c => c.params), [{ kind: 'crate' }], 'its single use breaks it');
});

test('foot strikes mark their impacts as kicks; every impact carries the target x', () => {
  const game = fixture({ element: 'fire' });
  const p = game.state.player;
  const enemy = foe(game, 560);
  game.tick({ attack: true }, STEP);
  advance(game, .2);
  const jab = game.state.impacts.at(-1);
  assert.equal(jab.kind, 'hit');
  assert.equal(jab.kick, false, 'a jab is a punch');
  assert.ok(Math.abs(jab.x - 560) < 2, 'where the target stood when it was hit');
  Object.assign(enemy, { invulnerable: 0 });
  game.damage(enemy, 1, 1, p, { light: true });
  assert.equal(game.state.impacts.at(-1).x, enemy.x);
  advance(game, .6);
  // A real aerial flying kick (fireKick) on a target at chest height.
  Object.assign(p, { grounded: false, z: 60, y: 500, vy: 0, action: null, cooldowns: { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 }, airChain: 0 });
  Object.assign(enemy, { x: p.x + 60, z: 50, y: 510, grounded: false, juggle: 1, invulnerable: 0, hitLag: 0, knockdown: 0 });
  assert.ok(game.startAction(p, 'melee'));
  assert.equal(p.action.move.pose, 'fireKick');
  p.action.t = p.action.windup;
  game.melee(p);
  const kick = game.state.impacts.at(-1);
  assert.equal(kick.kick, true, 'the flying kick sounds as a kick');
  assert.equal(COMBAT.fire.steps[2].knockdown, true);
});

test('grounded Air and Fire third-hit finishers sound as kicks; Earth, Water, run attacks and armed strikes do not', () => {
  // A real finisher: the target is dizzy in the lane, so startAction opens the third ground step.
  const strike = (element, setup = () => {}) => {
    const game = fixture({ element });
    const p = game.state.player;
    const enemy = foe(game, 560);
    Object.assign(enemy, { stun: .6, hitType: 'dizzy' });
    setup(game, p, enemy);
    assert.ok(game.startAction(p, 'melee'), `${element} strike starts`);
    p.action.t = p.action.windup;
    game.melee(p);
    const hit = game.state.impacts.at(-1);
    assert.ok(hit && hit.kind === 'hit', `${element} strike lands`);
    return { p, hit };
  };
  for (const element of ['air', 'fire']) {
    const { p, hit } = strike(element);
    assert.equal(p.comboIndex, 3, `${element}: the dizzy target opens the finisher`);
    assert.equal(p.action.variant, null, 'a ground strike');
    assert.equal(hit.kick, true, `${element} finisher is a kick`);
  }
  for (const element of ['earth', 'water']) {
    const { p, hit } = strike(element);
    assert.equal(p.comboIndex, 3);
    assert.equal(hit.kick, false, `${element} finisher is a punch`);
  }
  // A Fire run attack into the same dizzy target is a charge, not a kick.
  const run = strike('fire', (game, p) => Object.assign(p, { running: true, vx: 400 }));
  assert.equal(run.p.attackKind, 'runAttack');
  assert.equal(run.hit.kick, false, 'a run attack is not a kick');
  // The flying kick swung with a staff in hand is a weapon blow (unarmed, the same move kicks).
  for (const weapon of [null, 'staff']) {
    const aerial = strike('fire', (game, p, enemy) => {
      Object.assign(p, { grounded: false, z: 60, y: 500, vy: 0, airChain: 0, weapon, weaponHits: weapon ? 14 : 0 });
      Object.assign(enemy, { z: 50, y: 510, grounded: false, juggle: 1, stun: 0, hitType: null });
    });
    assert.equal(aerial.p.action.move.pose, 'fireKick');
    assert.equal(aerial.hit.kick, !weapon, weapon ? 'an armed flying kick is not a kick' : 'the unarmed flying kick is');
  }
});

test('pickups: a weapon clacks by kind, drinks and food gulp, the elixir and the spirit orb sparkle', () => {
  // Consumables are now used over a short animation (src/pickup-art.js CONSUMABLES), so their
  // sound comes during the use, not on E: the heal and energy items are now a tonic and a wine
  // jar that are drunk, and the spirit orb has the sparkle. A drink or food voices the bank's
  // drink sound (food: the eat sound) in two parts, the gulps or bites during the use and the restore chime as the effect lands.
  const game = fixture();
  const p = game.state.player;
  for (const [kind, name, params] of [['staff', 'pickupWeapon', { kind: 'staff' }], ['crate', 'pickupWeapon', { kind: 'crate' }]]) {
    clear(game);
    game.state.weapons = [{ x: p.x + 20, y: p.depth, depth: p.depth, kind, life: 20 }];
    game.pickup(p);
    assert.deepEqual(cues(game).map(c => [c.name, c.params]), [[name, params]], kind);
    assert.equal(cues(game)[0].x, p.x);
    p.weapon = null;
  }
  const drink = [['drink', { part: 'gulp' }], ['drink', { part: 'chime' }]];
  const eat = [['eat', { part: 'gulp' }], ['eat', { part: 'chime' }]];
  const sparkle = [['energyPickup', {}]];
  for (const [kind, expected] of [['heal', drink], ['energy', drink], ['bun', eat], ['peach', eat], ['gourd', drink],
    ['pill', sparkle], ['incense', sparkle], ['orb', sparkle]]) {
    clear(game);
    game.state.weapons = [{ x: p.x + 20, y: p.depth, depth: p.depth, kind, variant: 'fire', life: 20 }];
    game.pickup(p);
    advance(game, 1);
    assert.deepEqual(cues(game).map(c => [c.name, c.params]), expected, kind);
    assert.ok(cues(game).every(c => c.x === p.x));
  }
});

test('a thrown weapon heaves on release and splinters where it bursts', () => {
  const game = fixture();
  const p = game.state.player;
  Object.assign(p, { x: 300, weapon: 'staff', weaponHits: 20 });
  game.tick({ throw: true }, STEP);
  advance(game, .2);
  assert.deepEqual(names(game).filter(n => n !== 'whoosh'), ['throw']);
  advance(game, 1.5);
  assert.deepEqual(cues(game, 'weaponBreak').map(c => c.params), [{ kind: 'staff' }], 'it bursts on the floor');
});

test('elemental shots and signatures sound on release, not at the start of the windup', () => {
  for (const element of ['air', 'water', 'earth', 'fire']) {
    const cap = element[0].toUpperCase() + element.slice(1);
    const game = fixture({ element });
    const p = game.state.player;
    const enemy = game.spawnEnemy({ element: 'air', x: 900, depth: 560 });
    Object.assign(enemy, { aiTimer: 100, facing: 1 }); // its bolt flies away from the player
    clear(game);
    assert.ok(game.startAction(enemy, 'special'), 'an enemy cast has a long windup');
    for (let t = 0; t < enemy.action.windup - STEP * 2; t += STEP) game.updateFighter(enemy, {}, STEP);
    assert.equal(cues(game, 'specialAir').length, 0, `${element}: silent during the windup`);
    for (let i = 0; i < 6; i++) game.updateFighter(enemy, {}, STEP);
    assert.equal(cues(game, 'specialAir').length, 1, 'the bolt sounds as it leaves the palm');
    clear(game);
    p.energy = 100;
    game.tick({ special: true }, STEP);
    advance(game, .5);
    assert.deepEqual(names(game).filter(n => n.startsWith('special')), [`special${cap}`]);
    clear(game);
    p.energy = 100;
    game.tick({ burst: true }, STEP);
    advance(game, .5);
    assert.deepEqual(names(game).filter(n => n.startsWith('burst')), [`burst${cap}`]);
  }
});

test('freeze, shatter and burn ticks record their status sounds', () => {
  const game = fixture({ element: 'water' });
  const enemy = foe(game, 560, { element: 'air' });
  game.damage(enemy, 5, 1, game.state.player, { element: 'water', freeze: .8 });
  assert.deepEqual(cues(game, 'freeze').map(c => c.x), [enemy.x]);
  clear(game);
  Object.assign(enemy, { invulnerable: 0, hitLag: 0 });
  game.damage(enemy, 5, 1, game.state.player, { element: 'air' });
  assert.equal(cues(game, 'shatter').length, 1, 'a hit on the frozen fighter shatters it');
  assert.equal(game.state.impacts.at(-1).heavy, true, 'the shattering blow is also a heavy hit');
  clear(game);
  Object.assign(enemy, { burn: 1.8, burnTick: .4, frozen: 0, hitLag: 0, stun: 0, knockdown: 0 });
  advance(game, 1.4);
  assert.equal(cues(game, 'burn').length, 3, 'one crackle per 0.45 s burn tick');
  const kill = fixture({ element: 'water' });
  const victim = foe(kill, 560, { element: 'air' });
  victim.hp = 1;
  kill.damage(victim, 50, 1, kill.state.player, { element: 'water', freeze: .8 });
  assert.equal(cues(kill, 'freeze').length, 0, 'a freezing blow that kills raises no ice, so no freeze sound');
});

test('kills: ordinary ones thud, the last of a wave and a guardian ring the KO bowl, a lost life too', () => {
  const game = new Game({ element: 'air', mode: 'survival', seed: 5 });
  game.start();
  const [a, b, c] = game.state.enemies;
  game.state.enemies = [a, b, c];
  clear(game);
  a.hp = 0; a.lastHitElement = 'fire';
  game.resolveDeaths();
  assert.deepEqual(cues(game).map(c => [c.name, c.params.element]), [['enemyDown', 'fire']]);
  clear(game);
  b.hp = 0; c.hp = 0;
  game.resolveDeaths();
  assert.deepEqual(names(game), ['enemyDown', 'ko'], 'two fall together: the last of the wave gets the bowl');
  clear(game);
  const boss = game.spawnEnemy({ boss: true, element: 'earth', x: 600, depth: 540 });
  game.spawnEnemy({ element: 'air', x: 300, depth: 540 });
  clear(game);
  boss.hp = 0;
  game.resolveDeaths();
  assert.deepEqual(names(game), ['ko'], 'a guardian always gets the bowl');
  clear(game);
  game.state.player.hp = 0;
  game.resolveDeaths();
  assert.deepEqual(cues(game).map(c => [c.name, c.x]), [['ko', 590]], 'losing a life records the KO where the player fell');
  const training = fixture();
  const dummy = foe(training);
  dummy.hp = 0;
  training.resolveDeaths();
  assert.deepEqual(names(training), ['enemyDown'], 'training partners respawn: no wave ever clears');
});

test('grabs rustle and body throws heave', () => {
  const game = fixture();
  const p = game.state.player;
  const enemy = foe(game, 545, { element: 'air' });
  Object.assign(enemy, { stun: 1, hitType: 'dizzy', stagger: 60 });
  game.tick({ interact: true }, STEP);
  assert.equal(p.grabTarget, enemy.id);
  assert.deepEqual(cues(game).map(c => [c.name, c.x]), [['grab', enemy.x]]);
  clear(game);
  game.tick({ throw: true }, STEP);
  advance(game, .3);
  assert.deepEqual(names(game).slice(0, 1), ['throw']);
});

test('a guardian drums at every tell and phase change; its released waves sound by pattern', () => {
  const game = new Game({ element: 'air', mode: 'survival', seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], bossHazards: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: 900, depth: 540, y: 540, hp: 1000, maxHp: 1000, invulnerable: 0, facing: -1 });
  const boss = game.spawnEnemy({ boss: true, element: 'fire', x: 600, depth: 540 });
  Object.assign(boss, { invulnerable: 0, energy: 100, facing: 1, spawnReveal: 0 });
  clear(game);
  assert.ok(game.bosses.tryStart(game, boss));
  assert.equal(boss.bossAction.move, 'flame-rush');
  assert.deepEqual(names(game), ['bossDrum']);
  clear(game);
  for (let i = 0; i < 120; i++) game.bosses.updateHazards(game, STEP);
  assert.deepEqual(names(game), ['specialFire'], 'the charge lane releases with the element special');
  clear(game);
  game.state.bossHazards = [];
  Object.assign(boss, { bossAction: null, hp: boss.maxHp * .4, energy: 100, bossMoveAfter: 0 });
  assert.ok(game.bosses.updatePhase(game, boss));
  assert.deepEqual(names(game), ['bossDrum'], 'the phase change drums too');
  clear(game);
  Object.assign(boss, { bossAction: null, bossMoves: 0, energy: 100, bossMoveAfter: 0 });
  assert.ok(game.bosses.tryStart(game, boss));
  assert.equal(boss.bossAction.move, 'triple-eruption');
  for (let i = 0; i < 240; i++) game.bosses.updateHazards(game, STEP);
  assert.deepEqual(names(game), ['bossDrum', 'burstFire', 'burstFire', 'burstFire'], 'each Wildfire mark erupts with the flare nova');
  assert.ok(VFX.explosion);
});
