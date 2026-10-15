import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

function arena(difficulty, element = 'fire') {
  const game = new Game({ mode: 'survival', element: 'earth', difficulty, seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: 640, depth: 540, y: 540, z: 0, vx: 0, vy: 0,
    vDepth: 0, invulnerable: 0, facing: -1 });
  const foe = game.spawnEnemy({ element, x: 560, depth: 540 });
  Object.assign(foe, { id: 42, aiTimer: 0, invulnerable: 0, facing: 1 });
  game.random = () => 0;
  advance(game, .4);
  return { game, foe, player: game.state.player };
}

function advance(game, dt) {
  game.state.time += dt;
  game.enemyAI.update(game, dt);
}

function spread(game, foe, player) {
  for (const depth of [540, 505]) {
    game.state.projectiles.push({ x: foe.x + 200, depth, z: 35, vx: -500,
      vy: 0, vDepth: 0, gravity: 0, r: 15, life: 2, team: 'player',
      element: 'air', source: player, damage: 19, knockback: 100 });
  }
  game.enemyAI.update(game, 0);
}

test('difficulty changes decisions without shortening neutral attack or turn cadence', () => {
  const cadences = [];
  for (const difficulty of ['easy', 'normal', 'hard', 'crazy']) {
    const { game, foe } = arena(difficulty);
    assert.equal(game.enemyAI.input(game, foe).attack, true);
    const attackWait = foe.aiTimer;
    foe.ai.hadAction = true;
    advance(game, .01);
    cadences.push([attackWait, foe.ai.rotationUntil - game.state.time]);
  }
  for (const cadence of cadences) assert.deepEqual(cadence, cadences[0]);
  assert.ok(cadences[0][0] > 0 && cadences[0][1] > 0);
});

test('Crazy evaluates the escape lane of an observed spread instead of dodging into its second bolt', () => {
  for (const difficulty of ['hard', 'crazy']) {
    const { game, foe, player } = arena(difficulty, 'air');
    foe.aiTimer = 999;
    spread(game, foe, player);
    advance(game, .02);
    game.enemyAI.input(game, foe);
    assert.equal(foe.ai.evadeUntil, 0, 'newly visible shots cannot trigger an instant dodge');
    advance(game, .15);
    const input = game.enemyAI.input(game, foe);
    assert.equal(!!input.down, difficulty === 'crazy');
    assert.equal(!!input.up, difficulty === 'hard');
    assert.ok(foe.ai.evadeUntil >= game.state.time + .48,
      'slower walking must keep the escape commitment through predicted contact');
    const hp = foe.hp;
    for (let frame = 0; frame < 72; frame++) game.tick({}, 1 / 120);
    if (difficulty === 'crazy') assert.equal(foe.hp, hp, 'the chosen clear lane prevents actual damage');
    else assert.ok(foe.hp < hp, 'the simpler one-projectile dodge can be caught by a visible spread');
  }
});

test('Crazy recognizes a visible guard-breaking stance and spends an ordinary dash to leave its lane', () => {
  for (const difficulty of ['hard', 'crazy']) {
    const { game, foe, player } = arena(difficulty, 'earth');
    foe.aiTimer = 999;
    player.action = { kind: 'melee', t: .01, windup: .3, activeUntil: .4,
      duration: .7, connected: false, move: { guardBreak: true, reach: 120 } };
    assert.ok(!game.enemyAI.input(game, foe).dash, 'the windup must first become observable');
    player.action.t = .12;
    advance(game, .2);
    const input = game.enemyAI.input(game, foe);
    if (difficulty === 'crazy') {
      assert.ok(input.dash && (input.up || input.down) && !input.guard);
      const energy = foe.energy;
      game.updateFighter(foe, input, 1 / 120);
      assert.ok(foe.energy < energy - 7 && foe.cooldowns.dash > 0,
        'tactical avoidance uses the same energy and cooldown as player mobility');
    } else assert.equal(input.guard, true, 'Hard still favors its elemental guard against a frontal strike');
  }
});

test('Crazy cannot cancel a committed strike or invent a free dash to evade guard break', () => {
  const { game, foe, player } = arena('crazy', 'earth');
  player.action = { kind: 'melee', t: .12, windup: .3, activeUntil: .4,
    duration: .7, move: { guardBreak: true, reach: 120 } };
  game.startAction(foe, 'melee');
  const action = foe.action;
  assert.ok(!game.enemyAI.input(game, foe).dash);
  assert.equal(foe.action, action);
  foe.action = null;
  foe.cooldowns.dash = .5;
  const input = game.enemyAI.input(game, foe);
  assert.ok(!input.dash && !input.guard && (input.up || input.down), 'a spent dash leaves only an ordinary sidestep');
});
