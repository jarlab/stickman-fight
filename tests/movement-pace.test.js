import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

const STEP = 1 / 120;
const elements = ['air', 'water', 'earth', 'fire'];

function arena(element) {
  const game = new Game({ element, mode: 'survival', seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], weapons: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: 400, depth: 590, y: 590, vx: 0, vDepth: 0, invulnerable: 0 });
  return game;
}

function advance(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds / STEP); frame++) game.tick(input, STEP);
}

test('one second of movement leaves room to position, with running distinct from walking', () => {
  const distances = {};
  for (const element of elements) {
    const walk = arena(element), run = arena(element);
    advance(walk, 1, { right: true });
    advance(run, 1, { right: true, run: true });
    const walking = walk.state.player.x - 400, running = run.state.player.x - 400;
    assert.ok(walking >= 140 && walking <= 200, `${element} walking covers about 11–16% of the arena per second`);
    assert.ok(running >= 260 && running <= 360, `${element} running stays below 30% of the arena per second`);
    assert.ok(running > walking * 1.7, 'running still closes a meaningful gap');
    distances[element] = walking;
    const stopX = run.state.player.x;
    advance(run, .25);
    assert.ok(run.state.player.x - stopX < 30, 'releasing run settles within roughly one body width');
    assert.ok(Math.abs(run.state.player.vx) < 20, 'the slower pace does not introduce sluggish braking');
  }
  assert.ok(distances.air > distances.fire && distances.fire > distances.water && distances.water > distances.earth,
    'elemental mobility identities survive the slowdown');
});

test('a diagonal run commits forward with shallower lane steering than a diagonal walk', () => {
  for (const element of elements) {
    const walk = arena(element), run = arena(element);
    advance(walk, 1, { right: true, up: true });
    advance(run, 1, { right: true, up: true, run: true });
    const walkDepth = 590 - walk.state.player.depth, runDepth = 590 - run.state.player.depth;
    assert.ok(walkDepth > 45 && walkDepth < 75, 'walking permits deliberate lane changes');
    assert.ok(runDepth > 25 && runDepth < walkDepth * .7, 'running cannot also accelerate depth strafing');
    assert.ok(run.state.player.x > walk.state.player.x, 'shallower steering retains the forward run advantage');
  }
});

test('shorter grounded dodges clear melee space without crossing a large part of the arena', () => {
  const travel = {};
  for (const element of elements) {
    const game = arena(element);
    game.tick({ dash: true, right: true }, STEP);
    advance(game, .5);
    travel[element] = game.state.player.x - 400;
    assert.ok(travel[element] > 115 && travel[element] < 165, `${element} dodge travels roughly two fighter heights`);
    assert.equal(game.state.player.dashTime, 0);
    assert.equal(game.state.player.invulnerable, 0, 'the move ends with ordinary vulnerability');
    assert.ok(game.state.player.cooldowns.dash > 0, 'a short hop is not a freely repeatable teleport');
  }
  assert.ok(travel.air > travel.fire, 'Air retains its longer evasive step');
});

test('the shorter recovery roll still clears a body and finishes vulnerable at a bounded distance', () => {
  const game = arena('earth'), player = game.state.player;
  Object.assign(player, { knockdown: .9, downTime: .1, stun: .5, invulnerable: 0 });
  const blocker = game.spawnEnemy({ dummy: true, element: 'earth', x: 470, depth: 590 });
  game.tick({ dash: true, right: true }, STEP);
  assert.ok(player.recoveryRoll);
  advance(game, .42);
  assert.equal(player.recoveryRoll, null);
  assert.ok(player.x > blocker.x + player.w, 'recovery escapes the nearby body');
  assert.ok(player.x > 535 && player.x < 555, 'recovery stays near its intended 147-unit travel');
  assert.equal(player.invulnerable, 0, 'the vulnerable finish remains punishable');
});
