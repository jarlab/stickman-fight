import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { COMBAT } from '../src/data.js';

const DT = 1 / 120;
function arena(element = 'air') {
  const game = new Game({ element, mode: 'survival', seed: 718 });
  game.start();
  game.state.enemies = [];
  const p = game.state.player;
  Object.assign(p, { x: 500, depth: 560, y: 560, invulnerable: 0 });
  const target = game.spawnEnemy({ dummy: true, element: 'air', x: 555, depth: 560 });
  Object.assign(target, { invulnerable: 0, hp: 2000, maxHp: 2000 });
  return { game, p, target };
}
function until(game, condition, message, seconds = 3) {
  for (let i = 0; i < seconds / DT && !condition(); i++) game.tick({}, DT);
  assert.ok(condition(), message);
}

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} launches and completes its own aerial chain through real input and physics`, () => {
    const { game, p, target } = arena(element);
    game.tick({ attack: true, attackDepthDirection: -1 }, DT);
    assert.equal(p.action?.variant, 'launcher');
    until(game, () => p.action?.launched, 'the launcher hits a grounded enemy');
    assert.ok(target.vy < -450);
    assert.equal(target.knockdown, 0);
    const launcher = p.action;
    until(game, () => p.hitLag === 0 && launcher.t >= launcher.chainAt - DT, 'reach jump follow-up window');
    game.tick({ jump: true, attack: true }, DT);
    until(game, () => p.action?.variant === 'aerial', 'paired jump and attack chases the launch');
    for (let i = 0; i < COMBAT[element].aerial.length; i++) {
      const action = p.action;
      assert.equal(action.airIndex, i);
      until(game, () => action.connected, `air hit ${i + 1} reaches the naturally moving target`);
      assert.ok(p.z > 0 && target.z > 0);
      if (i < COMBAT[element].aerial.length - 1) {
        until(game, () => p.hitLag === 0 && action.t >= action.duration - .08, 'late aerial buffer');
        game.tick({ attack: true, right: true }, DT);
        until(game, () => p.action && p.action !== action, 'next aerial starts after recovery');
      }
    }
    assert.ok(target.knockdown > 0, 'the ender closes the juggle');
    assert.equal(game.state.combo, 1 + COMBAT[element].aerial.length);
    if (element === 'earth' || element === 'air') assert.ok(target.vy > 0, 'a downward ender spikes');
    until(game, () => p.grounded, 'attacker returns to the floor');
    assert.equal(p.airChain, 0, 'landing resets aerial move budget');
  });
}

test('a launcher whiff cannot jump-cancel and a blocked launcher does not grant a chase', () => {
  for (const blocked of [false, true]) {
    const { game, p, target } = arena('earth');
    if (!blocked) target.x = 1000;
    else { target.guard = true; target.parryTimer = 0; target.facing = -1; }
    game.tick({ attack: true, launcher: true }, DT);
    const action = p.action;
    // Maintain the defender's guard using normal fighter inputs.
    for (let i = 0; i < 70 && action.t < action.chainAt; i++) {
      if (blocked) { target.guard = true; target.parryTimer = 0; }
      game.tick({}, DT);
    }
    game.tick({ jump: true }, DT);
    assert.equal(p.action, action);
    assert.equal(p.grounded, true);
    assert.ok(!action.launched);
  }
});

test('aerial attacks cannot be renewed by mashing or double jumping', () => {
  const { game, p, target } = arena('air');
  target.x = 1000;
  game.tick({ jump: true, attack: true }, DT);
  const first = p.action;
  game.tick({ attack: true }, DT);
  assert.equal(p.action, first, 'early taps do not cancel recovery');
  p.airChain = COMBAT.air.aerial.length;
  until(game, () => !p.action, 'whiff finishes');
  game.tick({ jump: true, attack: true }, DT);
  assert.equal(p.action, null, 'double jump does not refill the per-flight attack budget');
  until(game, () => p.grounded, 'land to regain attacks');
  game.tick({ jump: true, attack: true }, DT);
  assert.equal(p.action?.airIndex, 0);
});

test('breaking an exhausted guard earns the same launcher chase as a clean hit', () => {
  const { game, p, target } = arena('earth');
  target.energy = 0;
  game.tick({ attack: true, launcher: true }, DT);
  const action = p.action;
  for (let i = 0; i < 120 && !action.connected; i++) {
    target.guard = true;
    target.facing = -1;
    target.parryTimer = 0;
    game.tick({}, DT);
  }
  assert.equal(target.hitType, 'launch');
  assert.ok(action.launched, 'successful guard break grants the launch-confirm window');
  until(game, () => p.hitLag === 0 && action.t >= action.chainAt - DT, 'reach chase window');
  game.tick({ jump: true, attack: true }, DT);
  until(game, () => p.action?.variant === 'aerial', 'chase the broken guard');
});

test('launchers respect energy, cooldowns and lane separation', () => {
  const { game, p, target } = arena('water');
  p.energy = 0;
  game.tick({ attack: true, launcher: true }, DT);
  assert.equal(p.action, null);
  p.energy = 100;
  target.depth += 70;
  game.tick({ attack: true, launcher: true }, DT);
  const hp = target.hp;
  until(game, () => !p.action, 'out-of-lane launcher recovers');
  assert.equal(target.hp, hp);
  game.tick({ attack: true, launcher: true }, DT);
  assert.equal(p.action, null, 'launcher reuse cooldown still applies');
});

test('a juggle has diminishing damage and cannot relaunch a knocked-down victim', () => {
  const { game, p, target } = arena();
  Object.assign(target, { z: 160, y: 400, grounded: false });
  const losses = [];
  for (let i = 0; i < 4; i++) {
    target.invulnerable = 0;
    const before = target.hp;
    assert.equal(game.damage(target, 10, 1, p, { launcher: true, lift: 300, knockback: 0 }), true);
    losses.push(before - target.hp);
  }
  assert.ok(losses[0] > losses[1] && losses[1] > losses[2]);
  assert.ok(target.knockdown > 0);
  target.invulnerable = 0;
  assert.equal(game.damage(target, 10, 1, p, { launcher: true }), false);
});

test('landing terminates an aerial attack before it can become a standing hitbox', () => {
  const { game, p } = arena('earth');
  Object.assign(p, { z: 1, y: p.depth - 1, vy: 500, grounded: false });
  game.tick({ attack: true }, DT);
  assert.equal(p.grounded, true);
  assert.equal(p.action, null);
  assert.equal(p.airChain, 0);
});

test('weak standing jabs cannot renew a launched victim, but dedicated air strikes can', () => {
  for (const inAir of [false, true]) {
    const { game, p, target } = arena('air');
    Object.assign(target, { z: 35, y: 525, grounded: false, vy: -80, juggle: 1, stun: .5 });
    if (inAir) Object.assign(p, { z: 35, y: 525, grounded: false, vy: -80 });
    const hp = target.hp;
    game.tick({ attack: true }, DT);
    for (let i = 0; i < 18; i++) game.tick({}, DT);
    assert.equal(target.hp < hp, inAir, 'only a qualified aerial follow-up connects during the launch');
  }
});
