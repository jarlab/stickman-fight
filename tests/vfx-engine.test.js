import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ELEMENTS, COMBAT } from '../src/data.js';
import { VFX } from '../src/vfx-art.js';

const STEP = 1 / 120;
const advance = (game, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / STEP - 1e-9); i += 1) game.tick(input, STEP); };
const vfx = (game, key) => game.state.effects.filter(e => e.kind === 'vfx' && (!key || e.fx === key));

function fixture(options = {}) {
  const game = new Game({ element: 'air', arena: 'air', mode: 'training', difficulty: 'normal', ...options });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], weapons: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: 500, depth: 560, z: 0, y: 560, vx: 0, vy: 0, vDepth: 0, facing: 1, grounded: true, invulnerable: 0 });
  return game;
}
function foe(game, x = 560, options = {}) {
  const enemy = game.spawnEnemy({ dummy: true, element: 'earth', x, depth: 560, ...options });
  // The fixture clears the spawn swirl, so the body is revealed at once too.
  Object.assign(enemy, { x, depth: 560, y: 560, z: 0, invulnerable: 0, spawnReveal: 0, facing: -1, aiTimer: 100, hp: 2000, maxHp: 2000 });
  game.state.effects = [];
  return enemy;
}

test('a light hit spawns the attacker element layer under a light spark on the target floor line', () => {
  const game = fixture({ element: 'water' });
  const enemy = foe(game);
  const seed = game.seed;
  game.damage(enemy, 10, 1, game.state.player, { element: 'water', light: true, contact: true });
  const [layer, spark] = vfx(game);
  assert.equal(layer.fx, 'water', 'the element layer comes first so the spark draws over it');
  assert.equal(spark.fx, 'hitLight');
  const y = enemy.y - enemy.h * .55;
  for (const e of [layer, spark]) {
    assert.equal(e.y, y);
    assert.equal(e.x, enemy.x - 10, 'centred just in front of the target, toward the attacker');
    assert.equal(e.p.dir, 1);
    assert.equal(e.p.floor, enemy.depth - y, 'debris lands on the target floor line');
    assert.equal(e.depth, enemy.depth);
    assert.ok(Number.isInteger(e.p.seed) && e.p.seed > 0, 'each spawn carries an integer seed');
  }
  assert.equal(spark.life, VFX.hitLight.life);
  assert.equal(spark.maxLife, VFX.hitLight.life);
  assert.equal(spark.p.element, 'water');
  assert.equal(layer.p.heavy, false);
  assert.equal(game.state.particles.length, 0, 'the old dot burst is gone');
  assert.equal(game.seed, seed, 'effects never draw from the simulation random stream');
  assert.ok(!game.state.effects.some(e => e.kind === 'impact'));
});

test('a heavy hit uses the heavy burst and a scaled element layer', () => {
  const game = fixture({ element: 'fire' });
  const enemy = foe(game);
  game.damage(enemy, 10, -1, game.state.player, { element: 'fire', heavy: true, knockback: 0, lift: 0 });
  const [layer, spark] = vfx(game);
  assert.equal(layer.fx, 'fire');
  assert.equal(layer.p.heavy, true);
  assert.equal(spark.fx, 'hitHeavy');
  assert.equal(spark.p.dir, -1);
  assert.equal(spark.x, enemy.x + 10);
});

test('a block shows a guard spark and hides the guard bubble for exactly its life, through hit lag', () => {
  const game = fixture();
  const enemy = foe(game, 560, { element: 'water' });
  Object.assign(enemy, { guard: true, facing: -1, energy: 100 });
  game.damage(enemy, 10, 1, game.state.player, { element: 'air', contact: true });
  const [guard] = vfx(game);
  assert.equal(guard.fx, 'guard');
  assert.equal(guard.p.element, 'water', 'the ward shows the defender element');
  assert.equal(guard.p.dir, 1, 'pushed away from the attacker');
  assert.equal(enemy.guardFx, VFX.guard.life);
  assert.ok(enemy.hitLag > 0, 'the defender is held by the contact pause');
  advance(game, VFX.guard.life / 2);
  assert.ok(Math.abs(enemy.guardFx - VFX.guard.life / 2) < STEP * 1.5, 'guardFx runs on the world clock, not the held fighter clock');
  advance(game, VFX.guard.life / 2 + STEP);
  assert.equal(enemy.guardFx, 0);
  assert.equal(vfx(game, 'guard').length, 0, 'the spark and the bubble suppression end together');
});

test('a parry replaces the white particle burst with a parry flash pointed at the attacker', () => {
  const game = fixture();
  const enemy = foe(game, 440, { element: 'fire' });
  Object.assign(game.state.player, { guard: true, parryTimer: .1, facing: -1 });
  enemy.facing = 1;
  game.damage(game.state.player, 10, 1, enemy, { element: 'fire', contact: true });
  const flashes = vfx(game, 'parry');
  assert.equal(flashes.length, 1);
  assert.equal(flashes[0].p.dir, 1);
  assert.equal(game.state.player.guardFx, VFX.parry.life);
  assert.equal(game.state.particles.length, 0);
  assert.equal(game.state.lastImpact.kind, 'parry', 'the sound cue is unchanged');
});

test('a knockdown landing kicks up heavy landing dust instead of the shockwave ring', () => {
  const game = fixture();
  const enemy = foe(game);
  game.damage(enemy, 10, 1, game.state.player, { element: 'air', knockdown: true });
  game.state.effects = [];
  assert.equal(enemy.grounded, false, 'the knockdown launches the body');
  for (let i = 0; i < 240 && !enemy.grounded; i += 1) game.tick({}, STEP);
  assert.equal(enemy.grounded, true);
  const dust = vfx(game, 'dustLand');
  assert.equal(dust.length, 1);
  assert.equal(dust[0].p.heavy, true);
  assert.equal(dust[0].y, dust[0].depth, 'ground effects anchor at the floor point');
  assert.ok(!game.state.effects.some(e => e.kind === 'shockwave'));
});

test('running leaves rear-foot dust every 0.12 s; dash, jump and recovery roll kick off dust', () => {
  const game = fixture();
  const p = game.state.player;
  advance(game, .1, { right: true, run: true });
  game.state.effects = [];
  const seen = new Set();
  for (let i = 0; i < 72; i += 1) { game.tick({ right: true, run: true }, STEP); for (const e of vfx(game, 'dustRun')) seen.add(e); }
  const dust = [...seen];
  assert.ok(p.running, 'the player is running');
  assert.ok(dust.length === 5 || dust.length === 6, `${dust.length} puffs over 0.6 s of running`);
  assert.ok(vfx(game, 'dustRun').length <= 3, 'each puff lives 0.35 s');
  for (const puff of dust) assert.equal(puff.p.dir, 1);
  const last = dust.at(-1);
  assert.ok(last.x < p.x, 'the puff is behind the runner');
  game.state.effects = [];
  advance(game, .5);
  game.state.effects = [];
  game.tick({ dash: true, right: true }, STEP);
  assert.equal(vfx(game, 'dustRun').length, 1, 'a grounded dash kicks off dust');
  advance(game, 1);
  game.state.effects = [];
  game.tick({ jump: true }, STEP);
  assert.equal(vfx(game, 'dustRun').length, 1, 'a ground jump kicks off dust');
  const enemy = foe(game, 700);
  Object.assign(enemy, { knockdown: .55, downTime: .1, grounded: true, buffer: { kind: 'recover', ttl: 1, direction: 1, depthDirection: 0 } });
  game.state.effects = [];
  assert.equal(game.tryRecoveryRoll(enemy), true);
  assert.equal(vfx(game, 'dustRun').length, 1, 'a recovery roll kicks off dust');
});

test('burn ticks puff warm smoke instead of particles', () => {
  const game = fixture();
  const enemy = foe(game);
  Object.assign(enemy, { burn: 1, burnTick: 0 });
  game.tick({}, STEP);
  const smoke = vfx(game, 'smokeBurn');
  assert.equal(smoke.length, 1);
  assert.equal(smoke[0].p.variant, 'burn');
  assert.ok(smoke[0].y < enemy.y - enemy.h * .6, 'it rises from the head');
  assert.equal(game.state.particles.length, 0);
  advance(game, .46);
  assert.equal(vfx(game, 'smokeBurn').length, 2, 'one puff per 0.45 s burn tick');
});

test('a freeze raises an ice column that holds the target until a shatter or thaw cracks it', () => {
  const game = fixture({ element: 'water' });
  const enemy = foe(game);
  game.damage(enemy, 10, 1, game.state.player, { element: 'water', freeze: .8 });
  const [column] = vfx(game, 'iceColumn');
  assert.ok(column, 'the freeze raises a column');
  assert.equal(column.targetId, enemy.id);
  assert.equal(column.x, enemy.x);
  assert.equal(column.y, enemy.depth);
  assert.equal(enemy.iceFx, VFX.iceColumn.life, 'the renderer frozen block waits while the column holds');
  advance(game, .2);
  assert.ok(enemy.frozen > 0 && column.life > column.maxLife * .32, 'still held in the rising column');
  assert.ok(game.damage(enemy, 10, 1, game.state.player, { element: 'air' }));
  assert.equal(enemy.frozen, 0, 'the second hit shatters the ice');
  assert.equal(enemy.iceFx, 0);
  assert.ok(column.life <= column.maxLife * (1 - .68) + 1e-9, 'the column jumps to its crack');
  // A guardian thaws early (45% freeze): its column cracks when the thaw comes.
  const boss = game.spawnEnemy({ boss: true, element: 'fire', x: 800, depth: 560 });
  Object.assign(boss, { invulnerable: 0, facing: -1, aiTimer: 100 });
  game.damage(boss, 10, 1, game.state.player, { element: 'water', freeze: .8 });
  const bossColumn = vfx(game, 'iceColumn').find(e => e.targetId === boss.id);
  assert.equal(bossColumn.p.scale, 1.25);
  advance(game, .5);
  assert.equal(boss.frozen, 0);
  assert.ok(bossColumn.life <= bossColumn.maxLife * .32, 'the thaw cracks the column before its natural end');
});

test('a KO bursts in the finishing element on the body, and the corpse dissolves into smoke', () => {
  const game = fixture({ element: 'fire', mode: 'survival' });
  const enemy = foe(game, 560, { element: 'water' });
  enemy.hp = 5;
  game.damage(enemy, 10, 1, game.state.player, { element: 'fire', knockdown: true });
  game.state.effects = [];
  game.resolveDeaths();
  const [ko] = vfx(game, 'ko');
  assert.ok(ko);
  assert.equal(ko.p.element, 'fire', 'the seal carries the attacker element');
  assert.equal(ko.p.dir, 1);
  assert.equal(ko.y, enemy.y - enemy.h * .5);
  assert.equal(ko.p.floor, enemy.depth - ko.y);
  assert.equal(game.state.corpses.length, 1);
  advance(game, 2.4);
  assert.equal(vfx(game, 'smoke').length, 1, 'one pale puff as the corpse fades');
});

test('a burn tick KO uses the fire seal', () => {
  const game = fixture({ mode: 'survival' });
  const enemy = foe(game, 700, { element: 'water' });
  Object.assign(enemy, { hp: 2, burn: 1, burnTick: 0 });
  game.tick({}, STEP);
  assert.equal(vfx(game, 'ko')[0]?.p.element, 'fire');
});

test('enemies arrive through a spawn swirl that reveals the body at 60% of its life', () => {
  const game = fixture();
  const enemy = game.spawnEnemy({ element: 'air', x: 900, depth: 500 });
  const [swirl] = vfx(game, 'spawn');
  assert.equal(swirl.x, 900);
  assert.equal(swirl.y, 500);
  assert.equal(swirl.p.element, 'air');
  assert.ok(Math.abs(enemy.spawnReveal - VFX.spawn.life * .6) < 1e-9);
  assert.ok(enemy.spawnReveal < enemy.invulnerable, 'the body is visible again before its spawn guard ends');
  assert.equal(game.state.particles.length, 0);
  advance(game, .37);
  assert.equal(enemy.spawnReveal, 0);
});

test('projectiles reaching the floor: a thrown weapon explodes (a staff or spear smaller), others raise dust', () => {
  const game = fixture();
  const shot = (extra) => ({ x: 600, y: 558, depth: 560, z: 1, vDepth: 0, vx: 300, vy: 400, r: 10, team: 'player', life: 1, gravity: 0, source: game.state.player, ...extra });
  game.state.projectiles = [shot({ kind: 'weapon', weapon: 'crate', element: 'air' }), shot({ element: 'fire' }), shot({ element: 'earth' }), shot({ kind: 'weapon', weapon: 'spear', element: 'air', vx: -300 })];
  game.updateProjectiles(STEP);
  assert.deepEqual(vfx(game).map(e => e.fx), ['explosion', 'dustLand', 'dustLand', 'explosion']);
  const [crate, spear] = vfx(game, 'explosion');
  assert.equal(crate.p.scale, .6); // the in-use crate cell: smaller than the lantern burst
  assert.ok(spear.p.scale < crate.p.scale, 'a thrown spear bursts smaller than a crate');
  assert.equal(spear.p.dir, -1, 'the burst leans along the throw');
  for (const e of [crate, spear]) assert.equal(e.y, 560, 'on the floor under the weapon');
  // Weapons phase: the broken weapons leave their own debris (a snap puff and four pieces
  // each), never the old dot burst; the energy shots leave no particles at all.
  assert.deepEqual(game.state.particles.map(p => p.kind === 'shard' ? `${p.weapon}:${p.index}` : p.kind),
    ['breakPuff', 'crate:0', 'crate:1', 'crate:2', 'crate:3', 'breakPuff', 'spear:0', 'spear:1', 'spear:2', 'spear:3']);
});

test('real fire shots fly level and never reach the floor, so they leave no burning patch', () => {
  const game = fixture({ element: 'fire' });
  const p = game.state.player;
  p.action = { kind: 'special', t: 0, windup: 0, activeUntil: 0, duration: 1, done: true, hitIds: [] };
  game.shoot(p);
  const [shot] = game.state.projectiles;
  assert.ok(shot, 'a real fire shot');
  const z = shot.z;
  advance(game, .6);
  assert.equal(shot.z, z, 'no gravity, no drop');
  assert.equal(vfx(game, 'groundBurn').length, 0);
});

test('a thrown weapon that hits a fighter explodes at the impact point', () => {
  const game = fixture();
  const enemy = foe(game, 600);
  game.state.projectiles = [{ x: 590, y: 525, depth: 560, z: 35, vDepth: 0, vx: 620, vy: 0, r: 25, kind: 'weapon', weapon: 'crate', element: 'air', team: 'player', life: 1, damage: 48, knockback: 800, gravity: 0, source: game.state.player }];
  game.updateProjectiles(STEP);
  assert.ok(enemy.hp < enemy.maxHp);
  const [boom] = vfx(game, 'explosion');
  assert.ok(boom, 'the crate bursts');
  assert.equal(boom.y, 560, 'on the floor under the impact');
});

test('a fire finisher knockdown leaves its victim on a burning floor patch', () => {
  for (const [element, expected] of [['fire', 1], ['earth', 0]]) {
    const game = fixture({ element, mode: 'survival' });
    const enemy = foe(game, 580);
    const p = game.state.player;
    p.comboIndex = 3;
    p.action = { kind: 'melee', t: 0, windup: 0, activeUntil: 1, duration: 1, hitIds: [], move: { ...COMBAT[element].steps[2] }, connected: false };
    game.melee(p);
    assert.equal(enemy.knockdown > 0, true, `${element} finisher knocks down`);
    advance(game, 1.5);
    assert.equal(vfx(game, 'groundBurn').length, expected, `${element}: ${expected ? 'a' : 'no'} burning patch on landing`);
  }
});

test('brush slashes replace the attack trail by weapon and trail style, once per swing', () => {
  const game = fixture({ element: 'earth' });
  const p = game.state.player;
  const slashOf = (set, kind = 'melee', launcher = false) => {
    Object.assign(p, { weapon: null, grounded: true, z: 0, running: false, comboIndex: 0, comboTimer: 0, airChain: 0, action: null, energy: 100, ...set });
    p.cooldowns = { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 };
    assert.ok(game.startAction(p, kind, launcher));
    return p.action.slash;
  };
  assert.equal(slashOf({ weapon: 'staff' }), 'slashLight');
  assert.equal(slashOf({ weapon: 'spear' }), 'slashThrust');
  assert.equal(slashOf({ weapon: 'crate' }), 'slashHeavy');
  assert.equal(slashOf({}, 'melee', true), 'slashRise', 'earth uppercut launcher');
  assert.equal(slashOf({ grounded: false, z: 40 }), 'slashDrop', 'earth hammer aerial');
  assert.equal(slashOf({ grounded: false, z: 40, airChain: 1 }), 'slashDrop', 'earth spike aerial');
  assert.equal(slashOf({}), null, 'an ordinary earth jab keeps its stone-fist trail');
  assert.equal(slashOf({ running: true }), null, 'the unarmed running rush keeps its trail');
  assert.equal(slashOf({ running: true, weapon: 'staff' }), 'slashHeavy', 'a running staff charge cleaves');
  assert.equal(slashOf({ running: true, weapon: 'spear' }), 'slashThrust', 'a running spear still thrusts');
  assert.equal(slashOf({}, 'special'), null);
  p.element = 'water';
  assert.equal(slashOf({}), 'slashSpin', 'the sweeping first water palm');
  assert.equal(slashOf({ comboTimer: 1, comboIndex: 1 }), null, 'the second water palm keeps its ribbon');
  p.element = 'air';
  assert.equal(slashOf({ grounded: false, z: 40, airChain: 2 }), 'slashDrop', 'the descending heel dive');
  assert.equal(slashOf({ grounded: false, z: 40 }), null, 'an air palm keeps its crescent');
  p.element = 'fire';
  assert.equal(slashOf({}, 'melee', true), 'slashRise', 'fire uppercut launcher');
  for (const element of ['air', 'water', 'earth', 'fire']) {
    assert.equal(game.slashFor({ ...p, element, comboIndex: 3, weapon: null, grounded: true, running: false }, COMBAT[element].steps[2], false, false), null,
      `the ${element} finisher keeps its elemental trail`);
  }

  // Emission: once, at the first active frame, anchored at the shoulder and following.
  const enemy = foe(game, 900);
  slashOf({ weapon: 'staff', weaponHits: 20, x: 500, facing: 1 });
  game.state.effects = []; game.state.particles = [];
  advance(game, p.action.windup + STEP * 2);
  advance(game, .02);
  const slashes = vfx(game, 'slashLight');
  assert.equal(slashes.length, 1, 'one slash per swing');
  const slash = slashes[0];
  assert.equal(slash.followId, p.id);
  assert.equal(slash.dx, 6);
  assert.equal(slash.dy, -40);
  assert.equal(slash.p.dir, 1);
  assert.equal(slash.p.element, 'fire');
  assert.equal(game.state.particles.length, 0, 'the swing puff is replaced by the slash');
  assert.equal(enemy.hp, enemy.maxHp);
});

test('guardian waves release their world effects', () => {
  const game = fixture();
  Object.assign(game.state.player, { x: 100, depth: 650, y: 650 });
  const boss = game.spawnEnemy({ boss: true, element: 'fire', x: 900, depth: 520 });
  game.state.effects = [];
  const hazard = extra => ({ id: 1, ownerId: boss.id, element: 'fire', x: 700, depth: 520, rx: 65, rd: 46, shape: 'ellipse', height: 125,
    delay: STEP / 2, warningTime: 1, life: .22, maxLife: .22, hitIds: [], released: false, direction: -1, damage: 1, knockback: 0, ...extra });
  game.state.bossHazards = [hazard({ move: 'triple-eruption' }), hazard({ id: 2, move: 'ice-lance', element: 'water', rx: 220, shape: 'lane' })];
  game.bosses.updateHazards(game, STEP);
  assert.deepEqual(vfx(game).map(e => e.fx), ['explosion', 'groundBurn', 'iceColumn', 'iceColumn', 'iceColumn']);
  const columns = vfx(game, 'iceColumn');
  const xs = columns.map(c => c.x);
  assert.ok(Math.abs(xs[0] - (700 + 136.4)) < 1e-9 && xs[1] === 700 && Math.abs(xs[2] - (700 - 136.4)) < 1e-9, 'spread along the lane from the guardian side');
  assert.deepEqual(columns.map(c => +(c.life - c.maxLife).toFixed(3)), [0, .06, .12], 'columns rise one after another along the lane');
  // Phase change: the guardian is wreathed in a summoning swirl instead of a particle burst.
  game.state.effects = []; game.state.particles = [];
  game.state.bossHazards = [];
  Object.assign(boss, { hp: boss.maxHp * .4, grounded: true, stun: 0, hitLag: 0, action: null, bossAction: null });
  assert.equal(game.bosses.updatePhase(game, boss), true);
  assert.equal(vfx(game, 'spawn')[0]?.p.scale, 1.3);
  assert.equal(game.state.particles.length, 0);
});

test('command icons are a head-layer capability that follows its fighter', () => {
  const game = fixture();
  const p = game.state.player;
  const icon = game.commandIcon(p, 'stay');
  assert.equal(icon.fx, 'iconStay');
  assert.equal(icon.followId, p.id);
  assert.equal(icon.p.color, ELEMENTS.air.color);
  assert.equal(icon.life, 1.2);
  for (const command of ['come', 'move', 'join']) assert.equal(game.commandIcon(p, command).fx, `icon${command[0].toUpperCase()}${command.slice(1)}`);
  assert.equal(game.commandIcon(p, 'dance'), null);
});

test('the effect list is capped, ambient dust and smoke first', () => {
  const game = fixture();
  for (let i = 0; i < 400; i += 1) game.vfx('dustRun', 0, 500);
  assert.equal(game.state.effects.length, 100, 'ambient effects stop at 100');
  for (let i = 0; i < 400; i += 1) game.vfx('hitLight', 0, 500);
  assert.equal(game.state.effects.length, 160, 'nothing exceeds 160 live effects');
  assert.equal(game.vfx('dustRun', 0, 500), null);
});

test('a delayed effect waits before its clock starts', () => {
  const game = fixture();
  const e = game.vfx('iceColumn', 600, 500, {}, { delay: .1 });
  assert.equal(e.maxLife, VFX.iceColumn.life);
  assert.ok(Math.abs(e.life - (VFX.iceColumn.life + .1)) < 1e-9);
});

test('losing a life bursts the KO seal and the player reappears through a spawn swirl', () => {
  const game = fixture({ mode: 'survival' });
  const enemy = foe(game, 700, { element: 'earth' });
  game.state.player.hp = 1;
  game.damage(game.state.player, 10, 1, enemy, { element: 'earth' });
  game.state.effects = [];
  game.resolveDeaths();
  assert.equal(game.state.lives, 2);
  assert.equal(vfx(game, 'ko')[0]?.p.element, 'earth');
  const swirl = vfx(game, 'spawn')[0];
  assert.equal(swirl.x, game.state.player.x);
  assert.equal(swirl.y, game.state.player.depth);
});

test('the same fight produces identical effects, and effects never shift the simulation', () => {
  const run = () => {
    const game = new Game({ element: 'fire', arena: 'fire', mode: 'survival', difficulty: 'hard', seed: 77 });
    game.start();
    const trace = [];
    for (let frame = 0; frame < 120 * 8; frame += 1) {
      game.tick({ right: frame % 300 < 140, left: frame % 300 > 200, run: frame % 600 < 120, attack: frame % 21 === 0,
        special: frame % 130 === 0, jump: frame % 211 === 0, guard: frame % 250 > 225 }, STEP);
      if (frame % 40 === 0) trace.push(JSON.stringify(game.state.effects.map(e => [e.fx || e.kind, +e.x.toFixed(3), +e.y.toFixed(3), +e.life.toFixed(4), e.p?.seed])));
    }
    return { trace, seed: game.seed, player: [game.state.player.x, game.state.player.hp], kills: game.state.kills };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.trace.some(entry => entry.includes('hit')), 'the fight produced hit effects');
});

test('wave arrivals hold still inside their swirl and step out of it when revealed', () => {
  for (const difficulty of ['normal', 'crazy']) for (const seed of [9, 11, 42]) {
    const game = new Game({ seed, difficulty, mode: 'survival', enemyCount: 8 });
    game.start();
    const swirls = new Map(vfx(game, 'spawn').map(e => [e.targetId, e]));
    const start = new Map(game.state.enemies.map(e => [e.id, { x: e.x, depth: e.depth }]));
    assert.equal(swirls.size, game.state.enemies.length, 'one swirl per arrival');
    const placed = game.spawnEnemy({ element: 'air', x: 640, depth: 500 });
    assert.equal(placed.spawnHold, false, 'a placed fighter is not a wave arrival');
    game.state.enemies.pop();
    const revealedAt = new Map();
    for (let i = 0; i < 160; i += 1) {
      const dust = new Set(vfx(game, 'dustRun'));
      game.tick({}, STEP);
      for (const e of game.state.enemies) {
        if (e.spawnReveal > 0) {
          assert.equal(e.action, null, 'no attack while hidden');
          assert.ok(e.invulnerable > 0, 'the spawn guard outlasts the hidden time');
          assert.deepEqual({ x: e.x, depth: e.depth }, start.get(e.id), 'held on its spot');
        } else if (!revealedAt.has(e.id)) revealedAt.set(e.id, e);
      }
      for (const puff of vfx(game, 'dustRun')) if (!dust.has(puff)) {
        assert.ok(!game.state.enemies.some(e => e.spawnReveal > 0 && Math.abs(e.depth - puff.depth) < 1e-9 && Math.abs(e.x - puff.x) < 12), 'no dust from a hidden body');
      }
    }
    assert.equal(revealedAt.size, swirls.size, 'every arrival is revealed');
    for (const [id] of revealedAt) {
      const swirl = swirls.get(id), at = start.get(id);
      assert.ok(Math.hypot(at.x - swirl.x, at.depth - swirl.depth) < 1e-9, 'the body is revealed at its swirl centre');
    }
  }
});

test('arrivals queued at one edge step later and further in, so their swirls do not stack', () => {
  const game = fixture({ mode: 'survival' });
  const arrivals = Array.from({ length: 8 }, () => game.spawnEnemy());
  for (const side of [true, false]) {
    const group = arrivals.filter(e => e.x > 640 === side);
    group.forEach((e, k) => {
      const swirl = vfx(game, 'spawn').find(s => s.targetId === e.id);
      const delay = swirl.life - swirl.maxLife;
      assert.ok(Math.abs(delay - k * .08) < 1e-9, `arrival ${k} waits ${k * .08} s`);
      assert.ok(Math.abs(e.spawnReveal - (delay + VFX.spawn.life * .6)) < 1e-9, 'revealed by its own swirl');
      assert.equal(e.x, (side ? 1170 : 110) + (side ? -1 : 1) * (k % 3) * 34, 'a step further in, cycling');
    });
  }
  const placed = game.spawnEnemy({ x: 1170, depth: 500 });
  assert.equal(vfx(game, 'spawn').at(-1).life, VFX.spawn.life, 'a placed fighter never queues');
  assert.equal(placed.x, 1170);
});

test('a placed fighter that moves while hidden keeps its swirl under it until it steps out', () => {
  const game = fixture();
  const enemy = game.spawnEnemy({ dummy: true, element: 'water', x: 800, depth: 520 });
  const swirl = vfx(game, 'spawn')[0];
  enemy.x = 840; enemy.depth = 540;
  game.tick({}, STEP);
  assert.equal(swirl.x, 840);
  assert.equal(swirl.depth, 540);
  assert.equal(swirl.y, 540, 'a ground effect sits on the floor point');
  advance(game, .4);
  assert.equal(enemy.spawnReveal, 0);
  const left = swirl.x;
  enemy.x += 60;
  game.tick({}, STEP);
  assert.equal(swirl.x, left, 'after the reveal the swirl stays where the body stepped out');
});

test('effect-linked flags are set only when their effect exists (the 160-effect cap)', () => {
  const game = fixture();
  const enemy = foe(game, 560);
  game.state.effects = Array.from({ length: 160 }, () => ({ kind: 'vfx', fx: 'hitLight', x: 0, y: 0, life: 9, maxLife: 9, p: {} }));
  const late = game.spawnEnemy({ element: 'air', x: 900, depth: 500 });
  assert.equal(late.spawnReveal, 0, 'no swirl, so the body is not hidden');
  game.impact(enemy, game.state.player, .3, false, 'block', 1);
  assert.equal(enemy.guardFx, 0, 'no guard spark, so the guard bubble stays');
  game.impact(enemy, game.state.player, .3, false, 'parry', 1);
  assert.equal(enemy.guardFx, 0);
  game.damage(enemy, 5, 1, game.state.player, { element: 'water', freeze: .8, contact: true });
  assert.ok(enemy.frozen > 0);
  assert.equal(enemy.iceFx, 0, 'no ice column, so the frozen block draws');
});

test('a fire finisher burn waits where the knockdown slide leaves the victim', () => {
  const game = fixture({ element: 'fire', mode: 'survival' });
  const enemy = foe(game, 580);
  const p = game.state.player;
  p.comboIndex = 3;
  p.action = { kind: 'melee', t: 0, windup: 0, activeUntil: 1, duration: 1, hitIds: [], move: { ...COMBAT.fire.steps[2] }, connected: false };
  game.melee(p);
  let burn, landedAt;
  for (let i = 0; i < 240 && !burn; i += 1) { game.tick({}, STEP); burn = vfx(game, 'groundBurn')[0]; landedAt = enemy.x; }
  assert.ok(burn, 'the patch appears on landing');
  advance(game, .5);
  assert.ok(Math.abs(enemy.x - landedAt) > 20, 'the body slides on after landing');
  assert.ok(Math.abs(enemy.x - burn.x) < 6, `the body rests in the flames (${Math.abs(enemy.x - burn.x).toFixed(1)} px off)`);
});

test('a freezing blow that kills raises no ice column, and a dying frozen fighter cracks its column', () => {
  const game = fixture({ element: 'water', mode: 'survival' });
  const enemy = foe(game, 540);
  enemy.hp = 3;
  game.damage(enemy, 10, 1, game.state.player, { element: 'water', freeze: .8, contact: true });
  game.resolveDeaths();
  assert.equal(vfx(game, 'iceColumn').length, 0, 'no column over the flying corpse');
  const other = foe(game, 700);
  game.damage(other, 5, 1, game.state.player, { element: 'water', freeze: .8, contact: true });
  const [column] = vfx(game, 'iceColumn');
  other.hp = 0;
  game.resolveDeaths();
  assert.ok(column.life <= column.maxLife * (1 - .68) + 1e-9, 'jumps to its crack');
});

test('crowd separation pushes past a frozen fighter instead of sliding it out of its ice', () => {
  const game = fixture({ element: 'water' });
  const frozen = foe(game, 600);
  const other = foe(game, 610);
  Object.assign(frozen, { frozen: .8 });
  for (let i = 0; i < 30; i += 1) game.separateFighters(STEP);
  assert.equal(frozen.x, 600, 'the frozen fighter stays in its column');
  assert.ok(other.x > 610, 'the other fighter takes the push');
});

test('the run-ending fall gets its KO burst, and effects play out behind the result screen', () => {
  const game = new Game({ seed: 3, mode: 'challenge' });
  game.start();
  game.state.player.hp = 0;
  game.resolveDeaths();
  assert.equal(game.state.status, 'lost');
  const [ko] = vfx(game, 'ko');
  assert.ok(ko, 'the final fall has its KO burst');
  const life = ko.life;
  game.tick({}, STEP);
  assert.equal(ko.life, life, 'the simulation tick stays stopped');
  game.settleVisuals(.25);
  assert.ok(Math.abs(ko.life - (life - 1 / 30)) < 1e-9, 'settling ages effects one bounded step');
  for (let i = 0; i < 40; i += 1) game.settleVisuals(1 / 30);
  assert.equal(vfx(game, 'ko').length, 0, 'the burst finishes instead of freezing');
  const live = fixture();
  live.vfx('ko', 500, 500, {});
  live.settleVisuals(.1);
  assert.equal(vfx(live, 'ko')[0].life, VFX.ko.life, 'no settling while the run is live');
});

test('a new story chapter starts without the last sanctuary\'s effects', () => {
  const game = new Game({ seed: 4, mode: 'story', element: 'fire' });
  game.start();
  game.state.enemies = [];
  game.vfx('groundBurn', 500, 560, { radius: 34, life: VFX.groundBurn.life });
  game.effect(500, 500, '#fff', 4);
  game.beginWave();
  assert.equal(game.state.wave, 2);
  assert.equal(vfx(game, 'groundBurn').length, 0, 'the burn stays in the last chapter');
  assert.equal(game.state.particles.length, 0);
  assert.ok(vfx(game, 'spawn').length > 0, 'the new chapter still summons through swirls');
});

test('a thrown staff or spear that hits a fighter bursts smaller than a crate', () => {
  for (const [weapon, scale] of [['crate', .6], ['spear', .42], ['staff', .42]]) {
    const game = fixture();
    const enemy = foe(game, 600);
    game.state.projectiles = [{ x: 590, y: 525, depth: 560, z: 35, vDepth: 0, vx: -620, vy: 0, r: 14, kind: 'weapon', weapon, element: 'air', team: 'player', life: 1, damage: 32, knockback: 560, gravity: 0, source: game.state.player }];
    game.updateProjectiles(STEP);
    assert.ok(enemy.hp < enemy.maxHp, `${weapon} hits`);
    const [boom] = vfx(game, 'explosion');
    assert.equal(boom?.p.scale, scale, `${weapon} burst scale`);
    assert.equal(boom.p.dir, -1);
  }
});
