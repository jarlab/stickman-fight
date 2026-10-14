import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

const STEP = 1 / 120;

function frames(game, count, input = {}) {
  for (let frame = 0; frame < count; frame++) game.tick(input, STEP);
}

function until(game, predicate, message, limit = 360) {
  for (let frame = 0; frame < limit && !predicate(); frame++) game.tick({}, STEP);
  assert.ok(predicate(), message);
}

function fixture(element = 'air') {
  const game = new Game({ element, mode: 'survival', difficulty: 'normal', seed: 912 });
  game.start();
  game.state.enemies = [];
  game.state.projectiles = [];
  const player = game.state.player;
  Object.assign(player, { x: 500, depth: 560, y: 560, z: 0, vx: 0, vy: 0, vDepth: 0, invulnerable: 0 });
  const target = game.spawnEnemy({ dummy: true, element: 'air', x: 550, depth: 560 });
  Object.assign(target, { aiTimer: 100, hp: 2000, maxHp: 2000, invulnerable: 0 });
  return { game, player, target };
}

function beginJab(game, player) {
  game.tick({ attack: true }, STEP);
  until(game, () => !!player.action, 'the new attack becomes actionable', 3);
  assert.equal(player.action?.kind, 'melee');
  return player.action;
}

test('ordinary input has a five-tick world-time window even while its fighter is frozen', () => {
  const { game, player } = fixture();
  Object.assign(player, { hitLag: .5, stun: 1 });
  game.tick({ attack: true }, STEP);
  frames(game, 18);
  assert.equal(player.buffer?.kind, 'attack', 'the input is still valid one simulation step inside five 30 Hz ticks');
  frames(game, 2);
  assert.equal(player.buffer, null, 'the input is gone one simulation step outside the five-tick window');
  assert.ok(player.hitLag > 0, 'expiration happened during the local contact pause');
});

test('an early quick tap expires before a long jab recovery becomes actionable', () => {
  const { game, player, target } = fixture('earth');
  target.x = 1000;
  const first = beginJab(game, player);
  until(game, () => first.t >= first.duration - (5 / 30 + 2 * STEP), 'the jab reaches just outside the input window');
  game.tick({ attack: true }, STEP);
  const actions = new Set([first]);
  for (let frame = 0; frame < 120; frame++) {
    game.tick({}, STEP);
    if (player.action) actions.add(player.action);
  }
  assert.equal(actions.size, 1, 'an old tap cannot produce a delayed attack after release');
});

test('a late quick tap waits through full jab recovery before starting its follow-up', () => {
  const { game, player } = fixture();
  const first = beginJab(game, player);
  until(game, () => first.t >= first.duration - .1 && player.hitLag === 0, 'the connected jab reaches late recovery');
  assert.equal(first.connected, true);
  game.tick({ attack: true }, STEP);
  assert.equal(player.action, first, 'contact does not permit an early basic-attack cancel');
  until(game, () => player.action && player.action !== first, 'the late tap starts its follow-up');
  assert.ok(first.t >= first.duration - STEP, 'the previous action completed its recovery');
});

test('several late taps queue one follow-up without continuing to attack after release', () => {
  const { game, player } = fixture();
  const first = beginJab(game, player);
  until(game, () => first.t >= first.duration - .1 && player.hitLag === 0, 'the jab reaches its input window');
  for (let press = 0; press < 4; press++) game.tick({ attack: true }, STEP);
  const actions = new Set([first]);
  if (player.action) actions.add(player.action);
  for (let frame = 0; frame < 180; frame++) {
    game.tick({}, STEP);
    if (player.action) actions.add(player.action);
  }
  assert.equal(actions.size, 2);
  assert.equal(player.action, null);
});

test('repeated whiffs alternate ordinary jabs without unlocking a finisher', () => {
  const { game, player, target } = fixture();
  target.x = 1000;
  const variants = [];
  for (let strike = 0; strike < 6; strike++) {
    beginJab(game, player);
    variants.push(player.comboIndex);
    until(game, () => !player.action, 'the missed attack recovers');
  }
  assert.deepEqual(variants, [1, 2, 1, 2, 1, 2]);
  assert.equal(target.hp, target.maxHp);
});

test('a guarded exchange keeps ordinary jabs and never earns a finisher from button count', () => {
  const { game, player, target } = fixture();
  Object.assign(target, { guard: true, guardHeld: true, parryCooldown: 100 });
  game.enemyInput = () => ({ guard: true });
  const variants = [];
  for (let strike = 0; strike < 5; strike++) {
    beginJab(game, player);
    variants.push(player.comboIndex);
    until(game, () => !player.action, 'the guarded attack recovers');
  }
  assert.deepEqual(variants, [1, 2, 1, 2, 1]);
  assert.ok(target.hp < target.maxHp, 'the fixture includes real blocked contacts');
  assert.equal(target.stagger, 0, 'blocking denies the reaction needed for a finisher');
});

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} earns its distinct finisher from a naturally reacting opponent`, () => {
    const { game, player, target } = fixture(element);
    const expected = element === 'earth' ? [1, 2, 3] : [1, 2, 1, 3];
    const variants = [];
    for (let strike = 0; strike < expected.length; strike++) {
      const previousContacts = game.state.combo;
      beginJab(game, player);
      variants.push(player.comboIndex);
      until(game, () => game.state.combo > previousContacts, `strike ${strike + 1} connects without repositioning either fighter`);
      if (strike < expected.length - 1) {
        assert.equal(target.knockdown, 0, 'ordinary jabs keep the exchange available');
        until(game, () => !player.action, 'the jab finishes its full recovery');
      }
    }
    assert.deepEqual(variants, expected);
    if (element === 'air') {
      assert.ok(target.vy < -300, 'air turns the dizzy opening into a launcher');
      assert.equal(target.knockdown, 0);
    } else if (element === 'water') assert.ok(target.frozen > 0, 'water freezes the opened target');
    else assert.ok(target.knockdown > 0, `${element} ends the opening in a knockdown`);
  });
}

test('a finisher requires a live dizzy opening in front and in the same lane', () => {
  const cases = [
    { name: 'front opening', patch: {}, eligible: true },
    { name: 'behind the fighter', patch: { x: 450 }, eligible: false },
    { name: 'adjacent lane boundary', patch: { depth: 592, y: 592 }, eligible: false },
    { name: 'inside the lane boundary', patch: { depth: 591, y: 591 }, eligible: true },
    { name: 'vertical boundary', patch: { z: 70, y: 490, grounded: false }, eligible: false },
    { name: 'expired stun', patch: { stun: 0 }, eligible: false },
    { name: 'ordinary flinch', patch: { hitType: 'stagger' }, eligible: false },
    { name: 'knocked down', patch: { knockdown: .5 }, eligible: false },
    { name: 'defeated', patch: { hp: 0 }, eligible: false },
  ];
  for (const scenario of cases) {
    const { game, player, target } = fixture();
    Object.assign(target, { hitType: 'dizzy', stun: 1 }, scenario.patch);
    beginJab(game, player);
    assert.equal(player.comboIndex === 3, scenario.eligible, scenario.name);
  }
});

test('a late queued attack remembers its direction without turning the current strike', () => {
  const { game, player } = fixture();
  const first = beginJab(game, player);
  until(game, () => first.t >= first.duration - .1 && player.hitLag === 0, 'the jab reaches late recovery');
  game.tick({ attack: true, left: true }, STEP);
  assert.equal(player.action, first);
  assert.equal(player.facing, 1, 'the current strike remains committed');
  until(game, () => player.action && player.action !== first, 'the queued strike starts');
  assert.equal(player.facing, -1, 'the new strike uses the direction from its input edge');
});

test('a recognized special command survives beyond the ordinary input window during long recovery', () => {
  const { game, player, target } = fixture('earth');
  target.x = 1000;
  const first = beginJab(game, player);
  game.tick({ special: true, command: true }, STEP);
  frames(game, 22);
  assert.equal(player.action, first, 'the long whiff is still recovering');
  until(game, () => player.action?.kind === 'special', 'the recognized command executes when the fighter is ready');
  assert.ok(first.t >= first.duration - STEP);
});

test('an interrupting hit or newer attack clears a recognized command', () => {
  for (const interruption of ['hit', 'new attack']) {
    const { game, player, target } = fixture('earth');
    target.x = 1000;
    const first = beginJab(game, player);
    game.tick({ special: true, command: true }, STEP);
    if (interruption === 'hit') {
      assert.equal(game.damage(player, 1, -1, target, { light: true, stun: .3, knockback: 0 }), true);
    } else {
      until(game, () => first.t >= first.duration - .1, 'a newer attack arrives during late recovery');
      game.tick({ attack: true, freshInput: true }, STEP);
    }
    let cast = false;
    let newAttack = false;
    for (let frame = 0; frame < 180; frame++) {
      game.tick({}, STEP);
      cast ||= player.action?.kind === 'special';
      newAttack ||= player.action?.kind === 'melee' && player.action !== first;
    }
    assert.equal(cast, false, `${interruption} prevents the old command from reappearing`);
    if (interruption === 'new attack') assert.equal(newAttack, true, 'the newer action replaces the command');
  }
});

test('a recent opening grants only a brief finisher range grace', () => {
  for (const elapsedFrames of [10, 14]) {
    const { game, player, target } = fixture();
    Object.assign(target, { hitType: 'dizzy', stun: 1 });
    game.tick({}, STEP);
    assert.ok(player.finisherWindow > 0, 'the nearby dizzy target opens a finisher window');
    target.x = 1000;
    frames(game, elapsedFrames);
    beginJab(game, player);
    assert.equal(player.comboIndex === 3, elapsedFrames < 12, 'range grace lasts three eligible 30 Hz ticks');
  }
  const { game, player, target } = fixture();
  Object.assign(target, { hitType: 'dizzy', stun: 1 });
  game.tick({}, STEP);
  const grace = player.finisherWindow;
  target.x = 1000;
  player.hitLag = .2;
  frames(game, 18);
  assert.equal(player.finisherWindow, grace, 'contact freeze does not consume the fighter-time finisher grace');
});
