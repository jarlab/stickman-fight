import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { BOSSES } from '../src/bosses.js';

const OFFSET = 2200;

function arena(offset = OFFSET) {
  const game = new Game({ mode: 'survival', element: 'air', seed: 42 });
  game.start();
  Object.assign(game.state, {
    bounds: { left: 30 + offset, right: 1250 + offset },
    enemies: [], projectiles: [], weapons: [], bossHazards: [],
  });
  Object.assign(game.state.player, {
    x: 500 + offset, depth: 560, y: 560, invulnerable: 0,
  });
  return game;
}

function opponent(game, x, options = {}) {
  const enemy = game.spawnEnemy({ dummy: true, element: 'air', x, depth: 560, ...options });
  Object.assign(enemy, { invulnerable: 0, hp: 1000, maxHp: 1000 });
  return enemy;
}

test('grabbed fighters stay beside the holder and respect translated encounter walls', () => {
  for (const direction of [-1, 1]) {
    const game = arena(), player = game.state.player;
    const target = opponent(game, player.x + direction * 50);
    Object.assign(player, { facing: direction });
    Object.assign(target, { stun: 1, hitType: 'dizzy' });
    assert.ok(game.grapples.tryGrab(game, player));
    assert.equal(target.x, player.x + direction * 38, 'grip does not snap the target to the first screen');
    const { left, right } = game.state.bounds;
    player.x = direction > 0 ? right - player.w / 2 : left + player.w / 2;
    game.grapples.control(game, player, {}, 1 / 120);
    assert.equal(target.x, direction > 0 ? right - target.w / 2 : left + target.w / 2);
    assert.equal(target.grabbedBy, player.id);
  }
});

test('a thrown body hits the crowd beyond the first screen and only lands at the current wall', () => {
  const game = arena(), player = game.state.player;
  const body = opponent(game, player.x + 50);
  const bystander = opponent(game, player.x + 135);
  Object.assign(body, { stun: 1, hitType: 'dizzy' });
  assert.ok(game.grapples.tryGrab(game, player));
  player.buffer = { kind: 'throw', direction: 1, depthDirection: 0 };
  game.grapples.control(game, player, {}, .21);
  assert.ok(body.thrown);
  assert.equal(body.thrown.previous.x, player.x + 38);

  // Sweep a flight segment through the second row in world coordinates.
  Object.assign(body, { x: player.x + 180, z: 40, grounded: false });
  game.grapples.update(game, 1 / 30);
  assert.ok(bystander.hp < bystander.maxHp);
  assert.ok(bystander.knockdown > 0);
  assert.equal(body.hp, body.maxHp, 'being past x=1250 is not a wall impact');
  assert.ok(body.thrown, 'the body is still flying after hitting the crowd');
  const crowdHP = bystander.hp;

  body.x = game.state.bounds.right - body.w / 2;
  game.grapples.update(game, 1 / 30);
  assert.equal(body.thrown, null);
  assert.ok(body.hp < body.maxHp, 'the current encounter wall causes landing injury');
  const bodyHP = body.hp;
  game.grapples.update(game, 1 / 30);
  assert.equal(body.hp, bodyHP, 'wall injury happens once');
  assert.equal(bystander.hp, crowdHP, 'the body contacts each crowd fighter once');
});

for (const [element, spec] of Object.entries(BOSSES)) {
  test(`${element} boss attacks retain their geometry and movement in later scrolling encounters`, () => {
    for (const move of spec.moves) {
      for (const bossX of [80, 600, 1200]) {
        const patterns = [0, OFFSET].map(offset => {
          const game = arena(offset), player = game.state.player;
          const direction = bossX > 1000 ? -1 : 1;
          player.x = bossX + offset + direction * 100;
          const boss = opponent(game, bossX + offset, { boss: true, element });
          const action = {
            move, direction, windup: .8, name: move, hint: '', stage: 'windup',
            t: 0, activeUntil: 1.5, duration: 2, originX: boss.x, originDepth: boss.depth,
          };
          const hazards = game.bosses.pattern(game, boss, player, action);
          assert.ok(hazards.every(h => h.x >= game.state.bounds.left + 15 &&
            h.x <= game.state.bounds.right - 15));
          if (action.destinationX != null) {
            assert.ok(action.destinationX >= game.state.bounds.left + 35 &&
              action.destinationX <= game.state.bounds.right - 35);
            boss.bossAction = action;
            game.bosses.updateFighter(game, boss, 1.2);
          }
          return {
            hazards: hazards.map(h => ({ ...h, x: h.x - offset })),
            destination: action.destinationX == null ? null : action.destinationX - offset,
            bossX: boss.x - offset,
          };
        });
        assert.deepEqual(patterns[1], patterns[0], `${move} at x=${bossX} must translate without changing its reach or timing`);
      }
    }
  });
}

test('a later-stage boss warning damages the player at its world position after its telegraph', () => {
  const game = arena(), player = game.state.player;
  player.x = OFFSET + 720;
  const boss = opponent(game, OFFSET + 600, { boss: true, element: 'earth' });
  assert.ok(game.bosses.tryStart(game, boss));
  const hp = player.hp, windup = boss.bossAction.windup;
  game.bosses.updateHazards(game, windup - .01);
  assert.equal(player.hp, hp);
  game.bosses.updateHazards(game, .02);
  assert.ok(player.hp < hp, 'the translated quake contacts the translated player');
});
