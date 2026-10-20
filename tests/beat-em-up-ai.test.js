import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

const STEP = 1 / 120;
function arena(difficulty = 'normal', offset = 0) {
  const game = new Game({ mode: 'survival', element: 'earth', difficulty, seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], waveDelay: 999,
    bounds: { left: 30 + offset, right: 1250 + offset } });
  Object.assign(game.state.player, { x: 640 + offset, depth: 550, y: 550,
    vx: 0, vDepth: 0, invulnerable: 999, facing: -1 });
  return game;
}

function enemy(game, x, depth = 550, element = 'fire') {
  const foe = game.spawnEnemy({ element, x, depth });
  Object.assign(foe, { aiTimer: 999, invulnerable: 0, facing: 1 });
  return foe;
}

function think(game, dt = .4) {
  game.state.time += dt;
  game.enemyAI.update(game, dt);
}

test('a large approaching group sends only two flankers and keeps its main body together', () => {
  const game = arena();
  for (let i = 0; i < 8; i++) enemy(game, 160 + i * 35, 440 + i * 20);
  think(game);
  assert.equal(game.state.enemies.filter(e => e.ai.side === 1).length, 2);
  assert.equal(game.state.enemies.filter(e => e.ai.side === -1).length, 6);
  assert.equal(game.state.enemies.filter(e => e.ai.permit).length, 2);
});

test('the first two reserves keep compact ranks independent of active attackers', () => {
  const game = arena('crazy');
  const left = [580, 550, 520, 490, 460, 430].map(x => enemy(game, x));
  for (const x of [710, 740]) enemy(game, x);
  think(game);
  const reserves = left.filter(e => !e.ai.permit).sort((a, b) => a.ai.rank - b.ai.rank);
  assert.ok(left.filter(e => e.ai.permit).length >= 2);
  assert.deepEqual(reserves.slice(0, 2).map(e => e.ai.rank), [0, 1]);
  // At the proposed second-row positions, reserves should stay in the group,
  // rather than retreating to a wide duel ring or another depth lane.
  reserves.slice(0, 2).forEach((e, rank) => {
    Object.assign(e, { x: 640 - (55 + 28 + rank * 24), depth: 550 + (rank ? 24 : -16) });
    e.ai.detourUntil = 0;
  });
  // Remove unrelated blockers: the test is about the formation target itself.
  game.state.enemies = reserves.slice(0, 2);
  for (const e of game.state.enemies) {
    const input = game.enemyAI.input(game, e);
    assert.ok(!input.left && !input.right && !input.up && !input.down);
    assert.ok(!input.attack, 'a nearby reserve does not bypass the attack limit');
  }
});

test('encounter bounds translate formation and corner behavior into world coordinates', () => {
  for (const playerX of [80, 640, 1200]) {
    const inputs = [], sides = [];
    for (const offset of [0, 1800]) {
      const game = arena('normal', offset);
      game.state.player.x = playerX + offset;
      const foes = [300, 390, 730, 810].map((x, i) => enemy(game, x + offset, 490 + i * 25));
      think(game);
      inputs.push(foes.map(e => game.enemyAI.input(game, e)));
      sides.push(foes.map(e => e.ai.side));
    }
    assert.deepEqual(sides[1], sides[0], 'corners are relative to this encounter');
    assert.deepEqual(inputs[1], inputs[0], 'translated enemies pursue equivalent formation targets');
  }
});

test('reserves keep closing during a remembered jab rhythm but still defend a visible strike', () => {
  const game = arena();
  const front = [enemy(game, 575), enemy(game, 700)];
  const reserve = enemy(game, 525, 532, 'earth');
  for (let i = 0; i < 2; i++) {
    game.state.player.action = { kind: 'melee', t: .3, activeUntil: .2 };
    think(game);
  }
  game.random = () => 0;
  game.state.player.action = null;
  assert.equal(reserve.ai.permit, false);
  assert.equal(reserve.ai.meleePressure, true);
  assert.ok(!game.enemyAI.input(game, reserve).guard,
    'the whole nearby crowd must not freeze into an anticipatory guard');
  assert.equal(game.enemyAI.input(game, front[0]).guard, true);
  reserve.ai.think = 0;
  game.state.player.action = { kind: 'melee', t: .25, activeUntil: .35, connected: false };
  assert.equal(game.enemyAI.input(game, reserve).guard, true,
    'a reserve threatened by an actual attack retains its own defense');
});

test('a reserve does not detour around a teammate standing beyond its destination', () => {
  const game = arena();
  const reserve = enemy(game, 530, 534);
  enemy(game, 585);
  think(game);
  Object.assign(reserve.ai, { permit: false, rank: 0 });
  const input = game.enemyAI.input(game, reserve);
  assert.equal(input.right, true);
  assert.ok(!input.up && !input.down, 'the second row can close without an unnecessary trip out of the lane');
  assert.equal(reserve.ai.detourUntil, 0);
});

test('a naturally approaching pack can take a single grounded strike together', () => {
  const game = arena();
  for (let i = 0; i < 6; i++) enemy(game, 280 + i * 35, 490 + i * 20);
  let grouped = false;
  for (let frame = 0; frame < 120 * 12; frame++) {
    game.tick({}, STEP);
    const p = game.state.player;
    grouped = game.state.enemies.filter(e => e.x < p.x && p.x - e.x < 100 &&
      Math.abs(e.depth - p.depth) < 23).length >= 2;
    if (grouped) break;
  }
  assert.ok(grouped, 'ordinary approach movement presents a crowd opening');
  const hp = game.state.enemies.map(e => e.hp);
  for (let frame = 0; frame < 90; frame++) game.tick(frame === 0 ? { attack: true, attackDirection: -1 } : {}, STEP);
  assert.ok(game.state.enemies.filter((e, index) => e.hp < hp[index]).length >= 2,
    'one ordinary strike reaches multiple opponents without bigger hitboxes or weaker health');
});
