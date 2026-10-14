import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ELEMENTS } from '../src/data.js';

const STEP = 1 / 120;

function arena(difficulty = 'normal', seed = 42) {
  const game = new Game({ mode: 'survival', element: 'air', difficulty, seed });
  game.start();
  game.state.enemies = [];
  game.state.projectiles = [];
  game.state.waveDelay = 999;
  Object.assign(game.state.player, {
    x: 640, depth: 560, y: 560, z: 0, vx: 0, vy: 0, vDepth: 0,
    invulnerable: 999, hp: 1000, maxHp: 1000,
  });
  return game;
}

function enemy(game, element = 'fire', x = 570, depth = 560, options = {}) {
  const fighter = game.spawnEnemy({ element, x, depth, ...options });
  Object.assign(fighter, { aiTimer: 0, invulnerable: 0, hp: 1000, maxHp: 1000 });
  return fighter;
}

function advance(game, seconds, inspect = () => {}, input = {}) {
  for (let frame = 0; frame < Math.ceil(seconds / STEP); frame++) {
    game.tick(input, STEP);
    inspect();
  }
}

function watchActions(game) {
  const actions = [];
  const seen = new Set();
  return {
    actions,
    sample() {
      for (const fighter of game.state.enemies) {
        if (!fighter.action || seen.has(fighter.action)) continue;
        seen.add(fighter.action);
        actions.push({ fighter, action: fighter.action, time: game.state.time });
      }
    },
  };
}

test('a crowd approaching from one side eventually threatens both sides of the player', () => {
  const game = arena();
  for (let index = 0; index < 6; index++) {
    enemy(game, ['air', 'water', 'earth', 'fire'][index % 4], 100 + index * 32, 425 + index * 35);
  }
  let surrounded = false;
  advance(game, 12, () => {
    const player = game.state.player;
    const nearby = game.state.enemies.filter(fighter =>
      Math.abs(fighter.x - player.x) < 240 && Math.abs(fighter.depth - player.depth) < 85);
    surrounded ||= nearby.some(fighter => fighter.x < player.x - 25) &&
      nearby.some(fighter => fighter.x > player.x + 25);
  });
  assert.ok(surrounded, 'enemies route around the player instead of forming a single chasing column');
});

test('a follower leaves an occupied approach lane and returns to attacking range', () => {
  const game = arena();
  const blocker = enemy(game, 'earth', 505, 560, { dummy: true });
  blocker.aiTimer = 999;
  const follower = enemy(game, 'fire', 420, 560);
  let detoured = false;
  let attacked = false;
  advance(game, 12, () => {
    detoured ||= Math.abs(follower.depth - blocker.depth) > 28;
    attacked ||= follower.action?.kind === 'melee' && Math.abs(follower.x - game.state.player.x) < 125;
  });
  assert.ok(detoured, 'a blocked fighter makes a visible lane detour');
  assert.ok(attacked, 'the detour does not strand the fighter outside the fight');
});

for (const [difficulty, maximum] of [['easy', 1], ['normal', 2], ['hard', 3]]) {
  test(`${difficulty} crowds leave openings instead of committing every enemy at once`, () => {
    const game = arena(difficulty);
    for (let index = 0; index < 6; index++) {
      enemy(game, ['air', 'water', 'earth', 'fire'][index % 4], index < 3 ? 560 : 720, 546 + index % 3 * 14);
    }
    const observations = watchActions(game);
    let largestAttackGroup = 0;
    advance(game, 8, () => {
      observations.sample();
      largestAttackGroup = Math.max(largestAttackGroup, game.state.enemies.filter(fighter => fighter.action).length);
    });
    assert.ok(largestAttackGroup <= maximum, `${largestAttackGroup} opponents committed together; expected at most ${maximum}`);
    assert.ok(observations.actions.length >= 4, 'spacing must still produce sustained pressure');
    assert.ok(new Set(observations.actions.map(entry => entry.fighter.id)).size >= 3, 'reserve fighters eventually join the attack');
  });
}

test('all four styles reacquire a player who escapes to another part of the arena', () => {
  for (const element of Object.keys(ELEMENTS)) {
    const game = arena('easy');
    const fighter = enemy(game, element, 170, 415);
    advance(game, 3);
    Object.assign(game.state.player, { x: 1040, depth: 625, y: 625, vx: 0, vDepth: 0 });
    let reached = false;
    advance(game, 16, () => {
      reached ||= Math.abs(fighter.x - game.state.player.x) < 125 && Math.abs(fighter.depth - game.state.player.depth) < 35;
    });
    assert.ok(reached, `${element} resumes a useful approach after the target escapes`);
  }
});

test('enemies reposition without starting new attacks while the player is knocked down', () => {
  const game = arena();
  const fighter = enemy(game, 'fire', 350, 420);
  game.state.player.knockdown = 6;
  const before = Math.hypot(fighter.x - 640, fighter.depth - 560);
  const observations = watchActions(game);
  advance(game, 3, observations.sample);
  assert.equal(observations.actions.length, 0, 'a grounded knockdown is not an attack opportunity');
  assert.ok(Math.hypot(fighter.x - game.state.player.x, fighter.depth - game.state.player.depth) < before,
    'enemies may improve their position while waiting for the player to get up');
});

test('a defeated target produces no offensive input before respawn', () => {
  for (const patch of [{ dead: true }, { hp: 0 }]) {
    const game = arena();
    const fighter = enemy(game);
    Object.assign(game.state.player, patch);
    const input = game.enemyInput(fighter);
    assert.ok(!input.attack && !input.special && !input.burst, 'defeated targets cannot trigger a new attack');
  }
});

test('a newly encountered close target leaves a short reaction window before an enemy commits', () => {
  const game = arena('normal');
  enemy(game, 'fire', 570);
  const observations = watchActions(game);
  advance(game, 1 / 30, observations.sample);
  assert.equal(observations.actions.length, 0, 'the AI does not attack on its first simulation update');
  advance(game, 2, observations.sample);
  assert.ok(observations.actions.length > 0, 'reaction time cannot become permanent hesitation');
});

test('hard enemies do not instantly parry a newly appearing attack from behind', () => {
  const game = arena('hard');
  const fighter = enemy(game, 'earth', 570);
  fighter.aiTimer = 100;
  advance(game, .25);
  Object.assign(game.state.player, { x: fighter.x - 70, depth: fighter.depth, y: fighter.depth, facing: 1 });
  fighter.aiTimer = .3;
  game.startAction(game.state.player, 'melee');
  game.tick({}, STEP);
  assert.equal(fighter.guard, false, 'turning toward a new threat must not also grant an immediate perfect defense');
  assert.equal(fighter.parryTimer, 0);
});

test('a lane dodge escapes a committed attack while the enemy completes its recovery', () => {
  const game = arena();
  const fighter = enemy(game, 'fire', 575);
  for (let frame = 0; frame < 240 && fighter.action?.kind !== 'melee'; frame++) game.tick({}, STEP);
  assert.equal(fighter.action?.kind, 'melee', 'the nearby opponent begins a melee attack');
  const action = fighter.action;
  const facing = fighter.facing;
  Object.assign(game.state.player, { depth: 640, y: 640 });
  let changedFacing = false;
  for (let frame = 0; frame < 240 && fighter.action === action; frame++) {
    game.tick({}, STEP);
    changedFacing ||= fighter.facing !== facing;
  }
  assert.equal(action.connected, false, 'the attack does not track a player into a different lane');
  assert.equal(changedFacing, false, 'the attack keeps its committed facing');
  assert.ok(action.t >= action.duration - STEP, 'a whiff still pays its recovery');
});

test('an AI choosing a projectile can spend its element-specific cost', () => {
  for (const element of Object.keys(ELEMENTS)) {
    const game = arena();
    const fighter = enemy(game, element, 200);
    // Choose the ranged opportunity when it is available, so this checks the
    // resource gate rather than requiring every style to shoot on every approach.
    game.random = () => 0;
    let cast = false;
    for (let frame = 0; frame < 360 && !cast; frame++) {
      fighter.energy = ELEMENTS[element].specialCost;
      game.tick({}, STEP);
      cast = fighter.action?.kind === 'special';
    }
    assert.ok(cast, `${element} can cast with its actual ${ELEMENTS[element].specialCost} energy cost`);
  }
});

test('AI never starts a projectile it cannot afford', () => {
  for (const element of Object.keys(ELEMENTS)) {
    const game = arena();
    const fighter = enemy(game, element, 200);
    for (let frame = 0; frame < 240; frame++) {
      fighter.energy = ELEMENTS[element].specialCost - 2;
      game.tick({}, STEP);
      assert.notEqual(fighter.action?.kind, 'special', `${element} waits until it can pay for the projectile`);
    }
  }
});

test('a ranged fighter does not choose to cast through an ally occupying its firing lane', () => {
  const game = arena();
  const shooter = enemy(game, 'water', 240);
  const ally = enemy(game, 'earth', 430, 560, { dummy: true });
  ally.aiTimer = 999;
  let screenedCast = false;
  const seen = new Set();
  advance(game, 3, () => {
    const action = shooter.action;
    if (action?.kind !== 'special' || seen.has(action)) return;
    seen.add(action);
    const player = game.state.player;
    const between = (ally.x - shooter.x) * (player.x - ally.x) > 0;
    const fraction = (ally.x - shooter.x) / (player.x - shooter.x);
    const firingDepth = shooter.depth + fraction * (player.depth - shooter.depth);
    screenedCast ||= between && Math.abs(ally.depth - firingDepth) < 24;
  });
  assert.equal(screenedCast, false, 'the shooter repositions or waits instead of firing through its teammate');
});

test('the reaction window lets a rapidly retreating player escape an immediate jab', () => {
  const game = arena();
  enemy(game, 'earth', 560);
  game.state.player.vx = ELEMENTS.air.speed;
  const observations = watchActions(game);
  advance(game, .3, observations.sample, { right: true });
  assert.equal(observations.actions.filter(entry => entry.action.kind === 'melee').length, 0,
    'the enemy reacts to the escaped player instead of jabbing at the initial close position');
});

test('crowds keep attacking near the depth boundary instead of blocking each other indefinitely', () => {
  const game = arena('normal', 1);
  Object.assign(game.state.player, { depth: 405, y: 405 });
  for (let index = 0; index < 6; index++) {
    enemy(game, ['air', 'water', 'earth', 'fire'][index % 4], 100 + index * 30, 425 + index * 35);
  }
  const observations = watchActions(game);
  advance(game, 18, observations.sample);
  assert.ok(observations.actions.some(entry => entry.time > 12),
    'a crowded boundary cannot create a permanent ceasefire after the initial approach');
  assert.ok(new Set(observations.actions.map(entry => entry.fighter.id)).size >= 3,
    'fighters waiting behind a blocked approach eventually get an opportunity');
});

test('enemies surround again after the player leaves a corner for the center', () => {
  const game = arena('normal', 4);
  game.state.player.x = 80;
  for (let index = 0; index < 6; index++) {
    enemy(game, ['air', 'water', 'earth', 'fire'][index % 4], 300 + index * 45, 425 + index * 35);
  }
  advance(game, 6);
  Object.assign(game.state.player, { x: 640, depth: 560, y: 560, vx: 0, vDepth: 0 });
  let surrounded = false;
  advance(game, 18, () => {
    if (game.state.time < 18) return;
    const player = game.state.player;
    const nearLane = game.state.enemies.filter(fighter => Math.abs(fighter.depth - player.depth) < 32);
    surrounded ||= nearLane.some(fighter => player.x - fighter.x > 25 && player.x - fighter.x < 200) &&
      nearLane.some(fighter => fighter.x - player.x > 25 && fighter.x - player.x < 200);
  });
  assert.ok(surrounded, 'a corner escape does not permanently send the entire crowd to the same side');
});
