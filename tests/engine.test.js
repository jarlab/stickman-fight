import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ELEMENTS, ARENAS, MODES, DIFFICULTIES } from '../src/data.js';

const STEP = 1 / 120;

function advance(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.ceil(seconds / STEP); frame += 1) {
    game.tick(input, STEP);
  }
}

function fixture(options = {}) {
  const game = new Game({ element: 'air', arena: 'air', mode: 'training', difficulty: 'normal', ...options });
  game.start();
  game.state.enemies = [];
  game.state.projectiles = [];
  Object.assign(game.state.player, {
    x: 500, depth: 560, z: 0, y: 560, vDepth: 0, vx: 0, vy: 0,
    facing: 1, grounded: true, jumps: 0, stun: 0, invulnerable: 0, guard: false,
  });
  return game;
}

function opponent(game, x = 555, options = {}) {
  const depth = options.depth ?? 560;
  const enemy = game.spawnEnemy({ dummy: true, element: 'earth', x, depth, ...options });
  Object.assign(enemy, { x, depth, z: 0, y: depth, vDepth: 0, vx: 0, vy: 0, invulnerable: 0, stun: 0, grounded: true });
  return enemy;
}

test('all four classes, arenas, difficulties and modes are immediately available', () => {
  assert.deepEqual(Object.keys(ELEMENTS).sort(), ['air', 'earth', 'fire', 'water']);
  assert.deepEqual(Object.keys(ARENAS).sort(), ['air', 'earth', 'fire', 'water']);
  for (const mode of ['survival', 'training', 'tournament', 'challenge', 'story']) {
    assert.ok(MODES[mode], `${mode} is selectable`);
  }
  for (const difficulty of ['easy', 'normal', 'hard']) assert.ok(DIFFICULTIES[difficulty]);
  assert.equal(new Set(Object.values(ELEMENTS).map(element => element.color)).size, 4);
});

test('the same fixed-step movement inputs produce the same player simulation', () => {
  const games = [fixture(), fixture()];
  for (const game of games) {
    for (let frame = 0; frame < 240; frame += 1) {
      game.tick({ right: frame < 90, left: frame >= 150, jump: frame === 12 || frame === 35, dash: frame === 80 }, STEP);
    }
  }
  const pose = game => {
    const player = game.state.player;
    return { x: player.x, y: player.y, depth: player.depth, z: player.z, vx: player.vx, vy: player.vy, hp: player.hp, energy: player.energy };
  };
  assert.deepEqual(pose(games[0]), pose(games[1]));
  assert.ok(games[0].state.time > 0);
});

test('a fighter can double jump but cannot gain a third midair jump', () => {
  const game = fixture();
  const player = game.state.player;
  game.tick({ jump: true }, STEP);
  assert.ok(player.vy < 0);
  advance(game, 0.18);
  const beforeSecondJump = player.vy;
  game.tick({ jump: true }, STEP);
  assert.ok(player.vy < beforeSecondJump, 'second jump supplies a fresh upward impulse');
  advance(game, 0.04);
  const beforeThirdJump = player.vy;
  game.tick({ jump: true }, STEP);
  assert.ok(player.vy >= beforeThirdJump, 'third press cannot renew upward speed');
  advance(game, 2);
  assert.equal(player.grounded, true);
  game.tick({ jump: true }, STEP);
  assert.ok(player.vy < 0, 'landing restores the ability to jump');
});

test('an air dash moves the fighter and cannot be refreshed during its cooldown', () => {
  const game = fixture();
  const player = game.state.player;
  Object.assign(player, { z: 160, y: 400, grounded: false });
  const startX = player.x;
  game.tick({ dash: true, right: true }, STEP);
  const initialCooldown = player.cooldowns.dash;
  assert.ok(initialCooldown > 0);
  advance(game, 0.1, { right: true });
  assert.ok(player.x > startX + 20);
  game.tick({ dash: true }, STEP);
  assert.ok(player.cooldowns.dash < initialCooldown, 'another press does not reset the active cooldown');
  advance(game, initialCooldown + 0.1);
  game.tick({ dash: true }, STEP);
  assert.ok(player.cooldowns.dash > 0, 'dash becomes available again');
});

test('up and down move through arena depth independently of jumping', () => {
  const game = fixture();
  const player = game.state.player;
  advance(game, 0.4, { up: true });
  assert.ok(player.depth < 530, 'up moves toward the back of the arena');
  assert.equal(player.z, 0, 'moving up does not jump');
  assert.equal(player.y, player.depth);
  advance(game, 0.4, { down: true });
  assert.ok(player.depth > 520, 'down moves toward the front of the arena');
  advance(game, 0.5);
  const depthBeforeJump = player.depth;
  game.tick({ jump: true }, STEP);
  advance(game, 0.15);
  assert.ok(player.z > 0);
  assert.ok(Math.abs(player.depth - depthBeforeJump) < 1, 'jumping does not change the ground lane');
  assert.equal(player.y, player.depth - player.z);
  advance(game, 2);
  assert.equal(player.grounded, true);
  assert.equal(player.z, 0);
  assert.equal(player.y, player.depth);
});

test('the arena keeps fighters inside its horizontal and depth boundaries', () => {
  const game = fixture();
  const player = game.state.player;
  const lives = game.state.lives;
  advance(game, 8, { left: true, up: true, run: true });
  assert.ok(player.x >= 30 && player.x < 100);
  assert.ok(player.depth >= 390 && player.depth < 420);
  advance(game, 8, { right: true, down: true, run: true });
  assert.ok(player.x <= 1250 && player.x > 1150);
  assert.ok(player.depth <= 650 && player.depth > 620);
  assert.equal(game.state.lives, lives, 'walking into an arena boundary never causes a ring-out');
});

test('melee hits in front, leaves a fighter behind unharmed and respects recovery', () => {
  const game = fixture({ element: 'air' });
  const front = opponent(game, 550);
  const back = opponent(game, 450);
  const frontHp = front.hp;
  const backHp = back.hp;
  game.tick({ attack: true }, STEP);
  advance(game, 0.1);
  assert.ok(front.hp < frontHp, 'an opponent within forward reach is hit');
  assert.equal(back.hp, backHp, 'a forward attack does not hit behind the fighter');
  const healthAfterHit = front.hp;
  game.tick({ attack: true }, STEP);
  assert.equal(front.hp, healthAfterHit, 'repeated presses cannot bypass recovery');
});

test('melee requires alignment in depth even when an opponent looks nearby on screen', () => {
  const game = fixture();
  const aligned = opponent(game, 550);
  const adjacent = opponent(game, 550, { depth: 605 });
  const alignedHp = aligned.hp;
  const adjacentHp = adjacent.hp;
  game.tick({ attack: true }, STEP);
  advance(game, 0.12);
  assert.ok(aligned.hp < alignedHp);
  assert.equal(adjacent.hp, adjacentHp, 'an adjacent lane avoids a straight punch');
});

test('elemental projectiles travel in their firing lane and miss adjacent lanes', () => {
  const game = fixture();
  const adjacent = opponent(game, 620, { depth: 605 });
  const aligned = opponent(game, 740);
  const adjacentHp = adjacent.hp;
  const alignedHp = aligned.hp;
  game.tick({ special: true }, STEP);
  advance(game, 0.6);
  assert.equal(adjacent.hp, adjacentHp);
  assert.ok(aligned.hp < alignedHp, 'the shot passes the adjacent fighter and reaches its own lane');
});

test('running covers more ground than walking with the same input duration', () => {
  const walking = fixture();
  const running = fixture();
  advance(walking, 0.6, { right: true });
  advance(running, 0.6, { right: true, run: true });
  assert.ok(running.state.player.x - 500 > (walking.state.player.x - 500) * 1.5);
});

test('three timed melee presses chain into a stronger knockdown finisher', () => {
  const game = fixture();
  const enemy = opponent(game, 550);
  enemy.aiTimer = 100;
  const combo = [];
  for (let hit = 0; hit < 3; hit += 1) {
    Object.assign(enemy, { x: 550, depth: 560, z: 0, y: 560, vx: 0, vy: 0, vDepth: 0, grounded: true, invulnerable: 0, stun: 0 });
    game.tick({ attack: true }, STEP);
    combo.push(game.state.player.comboIndex);
    advance(game, 0.42);
  }
  assert.deepEqual(combo, [1, 2, 3]);
  assert.ok(enemy.knockdown > 0, 'the third strike knocks the opponent down');
});

test('a running attack knocks an aligned opponent back harder than a standing attack', () => {
  const standing = fixture();
  const running = fixture();
  advance(running, 0.25, { right: true, run: true });
  running.state.enemies = [];
  const standingEnemy = opponent(standing, 555);
  const runningEnemy = opponent(running, running.state.player.x + 55);
  standing.tick({ attack: true }, STEP);
  running.tick({ right: true, run: true, attack: true }, STEP);
  advance(standing, 0.12);
  advance(running, 0.12);
  assert.ok(Math.abs(runningEnemy.vx) > Math.abs(standingEnemy.vx));
});

test('interacting collects a nearby weapon but leaves distant pickups in the arena', () => {
  const game = fixture();
  game.state.weapons = [
    { x: 510, y: 560, depth: 560, z: 0, kind: 'staff', life: 30 },
    { x: 1000, y: 560, depth: 560, z: 0, kind: 'spear', life: 30 },
  ];
  game.tick({ interact: true }, STEP);
  assert.equal(game.state.player.weapon, 'staff');
  assert.ok(game.state.player.weaponHits > 0);
  assert.equal(game.state.weapons.length, 1);
  assert.equal(game.state.weapons[0].kind, 'spear');
});

test('throwing an equipped weapon releases it and damages a target in its lane', () => {
  const game = fixture();
  const enemy = opponent(game, 700);
  const initialHp = enemy.hp;
  game.state.player.weapon = 'spear';
  game.state.player.weaponHits = 10;
  game.tick({ throw: true }, STEP);
  advance(game, 0.6);
  assert.equal(game.state.player.weapon, null);
  assert.ok(enemy.hp < initialHp);
});

test('nearby health and energy pickups restore their resource and are consumed', () => {
  const game = fixture();
  const player = game.state.player;
  player.hp = player.maxHp / 2;
  player.energy = 20;
  game.state.weapons = [{ x: 510, depth: 560, y: 560, z: 0, kind: 'heal', life: 30 }];
  const initialHp = player.hp;
  game.tick({ interact: true }, STEP);
  assert.ok(player.hp > initialHp + 5);
  assert.equal(game.state.weapons.length, 0);
  game.state.weapons = [{ x: 510, depth: 560, y: 560, z: 0, kind: 'energy', life: 30 }];
  game.tick({ interact: true }, STEP);
  assert.ok(player.energy > 30);
  assert.equal(game.state.weapons.length, 0);
});

test('an elemental shot spends energy, hits a distant target and has a cooldown', () => {
  const game = fixture({ element: 'fire' });
  const enemy = opponent(game, 700);
  const initialHp = enemy.hp;
  const initialEnergy = game.state.player.energy;
  game.tick({ special: true }, STEP);
  assert.ok(game.state.player.energy < initialEnergy);
  assert.ok(game.state.player.cooldowns.special > 0);
  const firstCostEnergy = game.state.player.energy;
  game.tick({ special: true }, STEP);
  assert.ok(game.state.player.energy >= firstCostEnergy, 'cooldown prevents paying for another shot');
  advance(game, 0.6);
  assert.ok(enemy.hp < initialHp, 'the projectile damages the target it reaches');
});

test('a signature skill spends energy and affects nearby enemies', () => {
  for (const element of Object.keys(ELEMENTS)) {
    const game = fixture({ element });
    const enemy = opponent(game, 550);
    const initialHp = enemy.hp;
    const initialEnergy = game.state.player.energy;
    game.tick({ burst: true }, STEP);
    advance(game, 0.35);
    assert.ok(game.state.player.energy < initialEnergy, `${element} signature costs energy`);
    assert.ok(game.state.player.cooldowns.burst > 0, `${element} signature has recovery`);
    assert.ok(enemy.hp < initialHp || Math.abs(enemy.vx) > 0 || enemy.stun > 0, `${element} signature affects an opponent`);
  }
});

test('a fighter without energy cannot cast a shot or signature', () => {
  const game = fixture();
  game.state.player.energy = 0;
  game.tick({ special: true, burst: true }, STEP);
  assert.equal(game.state.projectiles.filter(projectile => projectile.team === 'player').length, 0);
  assert.equal(game.state.player.cooldowns.special, 0);
  assert.equal(game.state.player.cooldowns.burst, 0);
  assert.ok(game.state.player.energy >= 0);
});

test('raising guard just before a frontal hit parries it, but cannot parry a rear hit', () => {
  const frontalGame = fixture();
  const frontalEnemy = opponent(frontalGame, 550);
  const frontalPlayer = frontalGame.state.player;
  const initialHp = frontalPlayer.hp;
  frontalGame.tick({ guard: true }, STEP);
  frontalGame.damage(frontalPlayer, 25, -1, frontalEnemy);
  assert.equal(frontalPlayer.hp, initialHp, 'a well-timed frontal guard prevents damage');

  const rearGame = fixture();
  const rearEnemy = opponent(rearGame, 450);
  const rearPlayer = rearGame.state.player;
  rearGame.tick({ guard: true }, STEP);
  rearGame.damage(rearPlayer, 25, 1, rearEnemy);
  assert.ok(rearPlayer.hp < rearPlayer.maxHp, 'the same timing does not protect the back');
});

test('holding guard past the parry window reduces a frontal hit without remaining invincible', () => {
  const guardedGame = fixture();
  const enemy = opponent(guardedGame, 550);
  advance(guardedGame, 0.8, { guard: true });
  guardedGame.damage(guardedGame.state.player, 25, -1, enemy);
  const guardedDamage = guardedGame.state.player.maxHp - guardedGame.state.player.hp;

  const unguardedGame = fixture();
  const otherEnemy = opponent(unguardedGame, 550);
  unguardedGame.damage(unguardedGame.state.player, 25, -1, otherEnemy);
  const unguardedDamage = unguardedGame.state.player.maxHp - unguardedGame.state.player.hp;
  assert.ok(guardedDamage > 0, 'held guard does not repeatedly renew parry invulnerability');
  assert.ok(guardedDamage < unguardedDamage, 'held guard still mitigates the frontal hit');
});

test('a timed projectile parry reflects the shot back into its attacker', () => {
  const game = fixture();
  const enemy = opponent(game, 600, { element: 'air' });
  enemy.facing = -1;
  enemy.aiTimer = 100;
  const initialPlayerHp = game.state.player.hp;
  const initialEnemyHp = enemy.hp;
  game.tick({ guard: true }, STEP);
  game.shoot(enemy);
  advance(game, 0.1, { guard: true });
  assert.equal(game.state.player.hp, initialPlayerHp);
  assert.ok(game.state.projectiles.some(projectile => projectile.team === 'player' && projectile.vx > 0));
  advance(game, 0.4, { guard: true });
  assert.ok(enemy.hp < initialEnemyHp, 'the reflected projectile can damage its original attacker');
});

test('zero health consumes one life, resets the fighter, and eventually ends a run', () => {
  const game = fixture({ mode: 'survival' });
  const initialLives = game.state.lives;
  assert.ok(initialLives >= 2);
  for (let lost = 1; lost <= initialLives; lost += 1) {
    game.state.player.hp = 0;
    game.tick({}, STEP);
    assert.equal(game.state.lives, initialLives - lost, 'one knockout costs exactly one life');
    if (lost < initialLives) {
      assert.equal(game.state.status, 'playing');
      assert.ok(game.state.player.depth >= 390 && game.state.player.depth <= 650);
      assert.ok(game.state.player.hp > 0);
      advance(game, 0.05);
      assert.equal(game.state.lives, initialLives - lost, 'respawn does not consume another life');
    }
  }
  assert.equal(game.state.status, 'lost');
});

test('training lets the player recover from lethal damage without ending practice', () => {
  const game = fixture();
  const enemy = opponent(game);
  const lives = game.state.lives;
  game.damage(game.state.player, game.state.player.maxHp * 5, -1, enemy);
  advance(game, 0.5);
  game.state.player.hp = 0;
  advance(game, 0.5);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.lives, lives);
  assert.ok(game.state.player.hp > 0);
  assert.equal(game.state.player.grounded, true);
});

for (const mode of ['tournament', 'challenge', 'story']) {
  test(`${mode} finishes after its finite sequence of encounters`, () => {
    const game = new Game({ element: 'earth', arena: 'earth', mode, difficulty: 'normal' });
    game.start();
    for (let encounter = 0; encounter < 8 && game.state.status === 'playing'; encounter += 1) {
      for (const enemy of game.state.enemies) enemy.hp = 0;
      advance(game, 2.8);
    }
    assert.equal(game.state.status, 'won');
    assert.ok(game.state.wave >= 3);
  });
}

test('survival continues and introduces a boss on its third wave', () => {
  const game = new Game({ element: 'air', arena: 'air', mode: 'survival', difficulty: 'easy' });
  game.start();
  for (let wave = 1; wave < 3; wave += 1) {
    for (const enemy of game.state.enemies) enemy.hp = 0;
    advance(game, 2.8);
  }
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.wave, 3);
  assert.ok(game.state.enemies.some(enemy => enemy.type === 'boss'));
});

test('hard difficulty produces a stronger enemy threat than easy', () => {
  const easy = new Game({ element: 'air', arena: 'air', mode: 'survival', difficulty: 'easy' });
  const hard = new Game({ element: 'air', arena: 'air', mode: 'survival', difficulty: 'hard' });
  easy.start();
  hard.start();
  const totalHp = game => game.state.enemies.reduce((total, enemy) => total + enemy.maxHp, 0);
  assert.ok(totalHp(hard) > totalHp(easy), 'hard enemies require more damage to defeat');
});

test('pausing freezes simulation and resuming restores movement', () => {
  const game = fixture();
  const before = { x: game.state.player.x, time: game.state.time };
  game.togglePause();
  advance(game, 1, { right: true, attack: true });
  assert.equal(game.state.player.x, before.x);
  assert.equal(game.state.time, before.time);
  game.togglePause();
  advance(game, 0.2, { right: true });
  assert.ok(game.state.player.x > before.x);
});

test('a long combat simulation keeps numeric state finite and temporary objects bounded', () => {
  const game = new Game({ element: 'water', arena: 'fire', mode: 'training', difficulty: 'hard' });
  game.start();
  for (let frame = 0; frame < 120 * 90; frame += 1) {
    game.tick({
      left: frame % 400 >= 200, right: frame % 400 < 200,
      jump: frame % 73 === 0, dash: frame % 151 === 0,
      attack: frame % 29 === 0, special: frame % 79 === 0,
      burst: frame % 331 === 0, guard: frame % 200 < 20,
      up: frame % 500 < 120, down: frame % 500 > 350,
      interact: frame % 70 === 0, run: frame % 900 < 300, throw: frame % 233 === 0,
    }, STEP);
    for (const fighter of [game.state.player, ...game.state.enemies]) {
      for (const key of ['x', 'y', 'depth', 'z', 'vDepth', 'vx', 'vy', 'hp', 'energy']) {
        assert.ok(Number.isFinite(fighter[key]), `${key} stays finite at frame ${frame}`);
      }
      assert.ok(fighter.energy >= 0 && fighter.energy <= fighter.maxEnergy);
    }
  }
  for (const key of ['projectiles', 'particles', 'floaters', 'corpses', 'weapons']) {
    assert.ok(game.state[key].length < 1000, `${key} expire instead of growing without bound`);
  }
  assert.equal(game.state.status, 'playing');
});

test('respawning clears motion and knockdown instead of immediately losing another life', () => {
  for (const arena of ['water', 'fire']) {
    const game = new Game({ arena, mode: 'survival' });
    game.start();
    game.state.enemies = [];
    game.state.waveDelay = 999;
    Object.assign(game.state.player, { hp: 0, knockdown: 1, z: 120, vx: 900, vy: 700, vDepth: 300 });
    game.tick({}, STEP);
    assert.equal(game.state.lives, 2);
    advance(game, 1);
    assert.equal(game.state.lives, 2, `${arena}: respawning remains safe`);
    assert.equal(game.state.player.grounded, true);
    assert.equal(game.state.player.knockdown, 0);
  }
});

test('lethal burning interrupts an attack before its hit can resolve', () => {
  const game = fixture({ mode: 'survival' });
  const enemy = opponent(game, 550, { dummy: false, element: 'fire' });
  enemy.facing = -1;
  enemy.aiTimer = 100;
  game.startAction(enemy, 'melee');
  enemy.action.t = enemy.action.windup - STEP / 2;
  Object.assign(enemy, { hp: 2, burn: 1, burnTick: 0 });
  const initialHp = game.state.player.hp;
  game.tick({}, STEP);
  assert.equal(enemy.dead, true);
  assert.equal(game.state.player.hp, initialHp, 'an opponent killed by burning cannot finish its attack');
});

test('a committed enemy attack keeps its telegraphed direction when the player crosses behind it', () => {
  const game = fixture();
  const enemy = opponent(game, 550);
  enemy.facing = -1;
  enemy.aiTimer = 0;
  game.tick({}, STEP);
  assert.ok(enemy.action, 'the nearby opponent begins an attack');
  const attackFacing = enemy.facing;
  game.state.player.x = 600;
  advance(game, 0.12);
  assert.equal(enemy.facing, attackFacing, 'the active windup does not turn to track the player');
});

for (const element of Object.keys(ELEMENTS)) {
  test(`${element} AI approaches a distant player and aligns its attack lane`, () => {
    const game = fixture({ mode: 'survival', difficulty: 'easy' });
    Object.assign(game.state.player, { x: 1050, depth: 625, y: 625, invulnerable: 999 });
    const enemy = opponent(game, 150, { dummy: false, element, depth: 405 });
    let reached = false;
    for (let frame = 0; frame < 20 * 120; frame += 1) {
      game.tick({}, STEP);
      if (Math.abs(enemy.x - game.state.player.x) < 110 && Math.abs(enemy.depth - game.state.player.depth) < 30) {
        reached = true;
        break;
      }
    }
    assert.equal(reached, true);
  });
}

