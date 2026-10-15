import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

const STEP = 1 / 120;

function arena(element = 'air') {
  const game = new Game({ element, mode: 'survival', difficulty: 'normal', seed: 912 });
  game.start();
  game.state.enemies = [];
  game.state.projectiles = [];
  game.state.weapons = [];
  game.state.waveDelay = 999;
  const player = game.state.player;
  Object.assign(player, { x: 500, depth: 560, y: 560, z: 0, vx: 0, vy: 0, vDepth: 0,
    hp: 2000, maxHp: 2000, invulnerable: 0, facing: 1 });
  const enemy = game.spawnEnemy({ dummy: true, element: 'fire', x: 550, depth: 560 });
  Object.assign(enemy, { aiTimer: 100, hp: 2000, maxHp: 2000, invulnerable: 0, facing: -1 });
  // Supply exact enemy intents through the same updateFighter path used by AI.
  // AI decision policy is covered separately; these cases isolate grapple physics.
  let enemyInput = {};
  game.enemyInput = () => enemyInput;
  function tick(playerInput = {}, opposingInput = {}) {
    enemyInput = opposingInput;
    game.tick(playerInput, STEP);
    enemyInput = {};
  }
  return { game, player, enemy, tick };
}

function advance(fixture, frames, input = {}) {
  for (let frame = 0; frame < frames; frame++) fixture.tick(input);
}

function until(fixture, condition, message, frames = 360) {
  for (let frame = 0; frame < frames && !condition(); frame++) fixture.tick();
  assert.ok(condition(), message);
}

function grip(fixture, enemyHolds = false) {
  const { player, enemy, tick } = fixture;
  const holder = enemyHolds ? enemy : player;
  const target = enemyHolds ? player : enemy;
  Object.assign(target, { stun: 1, hitType: 'dizzy', stagger: 60 });
  tick(enemyHolds ? {} : { interact: true }, enemyHolds ? { interact: true } : {});
  assert.equal(holder.grabTarget, target.id, 'the interacting fighter grips a dizzy opponent');
  assert.equal(target.grabbedBy, holder.id);
  return { holder, target };
}

test('J during a grip winds up one held punch, keeps both fighters planted, and then recovers', () => {
  const fixture = arena();
  const { player, enemy, tick } = fixture;
  grip(fixture);
  const hp = enemy.hp, x = player.x, depth = player.depth;
  tick({ attack: true });
  assert.equal(player.action?.kind, 'grabPunch');
  assert.equal(enemy.hp, hp, 'starting the punch does not skip its windup');
  until(fixture, () => enemy.hp < hp, 'the punch connects before the hold expires');
  assert.equal(player.grabTarget, enemy.id, 'a linked punch does not break its own hold');
  assert.equal(enemy.grabbedBy, player.id);
  assert.ok(enemy.hitReact > 0 && enemy.hitLag > 0, 'the held enemy visibly reacts and pauses on impact');
  assert.ok(player.hitLag > 0, 'the punch pauses its attacker on contact');
  assert.equal(player.x, x);
  assert.equal(player.depth, depth);
  assert.equal(enemy.z, 0);
  assert.equal(enemy.knockdown, 0, 'ordinary fall pressure does not knock a held target out of the grip');
  const afterContact = enemy.hp;
  until(fixture, () => !player.action, 'the held punch returns to its holding pose');
  advance(fixture, 15);
  assert.equal(enemy.hp, afterContact, 'one punch input cannot repeatedly damage its held target');
  assert.equal(player.grabTarget, enemy.id);
});

test('a late J buffers the next held punch without cancelling the first recovery', () => {
  const fixture = arena();
  const { player, enemy, tick } = fixture;
  grip(fixture);
  tick({ attack: true });
  const first = player.action;
  until(fixture, () => first.t >= first.duration - .08 && player.hitLag <= 0,
    'the first punch reaches its late recovery window');
  const afterFirst = enemy.hp;
  tick({ attack: true });
  assert.equal(player.action, first, 'the second press cannot cancel active recovery');
  until(fixture, () => player.action?.kind === 'grabPunch' && player.action !== first,
    'the queued punch starts at the next available transition');
  assert.ok(first.t >= first.duration - STEP, 'the first punch completes its full action');
  until(fixture, () => enemy.hp < afterFirst, 'the buffered punch makes a new single contact');
  assert.equal(player.grabTarget, enemy.id);
});

test('a late U buffers a throw after held-punch recovery instead of discarding the input', () => {
  const fixture = arena();
  const { player, enemy, tick } = fixture;
  grip(fixture);
  tick({ attack: true });
  const punch = player.action;
  until(fixture, () => punch.t >= punch.duration - .08 && player.hitLag <= 0,
    'the punch enters its late recovery window');
  tick({ throw: true });
  assert.equal(player.action, punch);
  assert.equal(enemy.grabbedBy, player.id);
  until(fixture, () => player.action?.kind === 'bodyThrow', 'U waits until the punch has recovered');
  assert.ok(punch.t >= punch.duration - STEP);
  until(fixture, () => !!enemy.thrown, 'the queued throw completes its own windup');
  assert.ok(!player.grabTarget && !enemy.grabbedBy);
});

test('punching does not refresh the finite grip or turn a hold into an infinite stun lock', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  grip(fixture);
  const start = game.state.time, hp = enemy.hp;
  for (let frame = 0; frame < 480 && player.grabTarget != null; frame++) {
    tick(player.action ? {} : { attack: true });
  }
  assert.ok(enemy.hp < hp, 'the hold included a successful punch');
  assert.ok(game.state.time - start < 2.3, 'contacts never reset the hold lifetime');
  assert.ok(!player.grabTarget && !enemy.grabbedBy);
  assert.notEqual(player.action?.kind, 'grabPunch', 'expiry cancels any unfinished held punch');
  assert.equal(player.buffer, null, 'expiry drops buffered follow-up attacks');
});

test('a third-party hit during a held-punch windup breaks the grip and prevents delayed damage', () => {
  for (const strikeHolder of [false, true]) {
    const fixture = arena();
    const { game, player, enemy, tick } = fixture;
    grip(fixture);
    tick({ attack: true });
    advance(fixture, 4);
    const attacker = game.spawnEnemy({ dummy: true, element: 'air', x: 1000, depth: 600 });
    attacker.aiTimer = 100;
    const hit = strikeHolder ? player : enemy;
    hit.invulnerable = 0;
    assert.equal(game.damage(hit, 3, -1, attacker, { light: true, knockback: 0 }), true);
    const hp = enemy.hp;
    advance(fixture, 80);
    assert.ok(!player.grabTarget && !enemy.grabbedBy);
    assert.notEqual(player.action?.kind, 'grabPunch');
    assert.equal(enemy.hp, hp, 'the cancelled held punch never connects later');
  }
});

test('held punches can defeat an opponent without leaving a live grip or stale action', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  grip(fixture);
  enemy.hp = 1;
  tick({ attack: true });
  until(fixture, () => enemy.dead, 'held strike damage can finish its opponent');
  assert.equal(game.state.kills, 1);
  assert.ok(!player.grabTarget && !enemy.grabbedBy);
  assert.notEqual(player.action?.kind, 'grabPunch');
  advance(fixture, 100);
  assert.equal(game.state.kills, 1, 'the completed held punch cannot award repeated knockouts');
});

test('enemy interaction can grab a dizzy player, punch once, and preserve the paired hold', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  grip(fixture, true);
  const hp = player.hp;
  tick({}, { attack: true });
  assert.equal(enemy.action?.kind, 'grabPunch');
  until(fixture, () => player.hp < hp, 'an enemy-held punch damages the player');
  assert.equal(player.grabbedBy, enemy.id);
  assert.equal(enemy.grabTarget, player.id);
  assert.equal(player.knockdown, 0);
  assert.ok(player.hitReact > 0, 'the player gets the same readable held reaction');
  const after = player.hp;
  until(fixture, () => !enemy.action, 'the enemy punch completes its recovery');
  advance(fixture, 10);
  assert.equal(player.hp, after, 'an enemy punch also damages only once');
  assert.doesNotThrow(() => JSON.stringify(game.state), 'bidirectional holds stay serializable');
});

test('enemy interaction does not pick up weapons when no grab is available', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  player.x = 900;
  game.state.weapons.push({ kind: 'spear', x: enemy.x, depth: enemy.depth, y: enemy.y, life: 20 });
  tick({}, { interact: true });
  assert.equal(enemy.weapon, null);
  assert.equal(game.state.weapons.length, 1);
  assert.ok(!enemy.grabTarget);
});

test('an enemy throw launches the player and applies landing injury exactly once', () => {
  const fixture = arena();
  const { player, enemy, tick } = fixture;
  grip(fixture, true);
  const hp = player.hp;
  tick({}, { throw: true });
  assert.equal(enemy.action?.kind, 'bodyThrow');
  assert.equal(player.grabbedBy, enemy.id, 'enemy throws also expose a windup');
  until(fixture, () => !!player.thrown, 'the enemy releases its held player into flight');
  assert.ok(player.vx < -300 && player.vy < 0 && player.knockdown > 0);
  assert.ok(!enemy.grabTarget && !player.grabbedBy);
  assert.equal(player.hp, hp, 'throwing separates flight from landing injury');
  until(fixture, () => !player.thrown, 'the thrown player reaches a landing or wall impact');
  assert.ok(player.hp < hp, 'the player suffers impact damage');
  const afterLanding = player.hp;
  advance(fixture, 150);
  assert.equal(player.hp, afterLanding, 'the settled body cannot pay landing injury twice');
});

test('a thrown player still lands normally if the thrower is defeated or removed mid-flight', () => {
  for (const removal of ['defeated', 'removed']) {
    const fixture = arena();
    const { game, player, enemy, tick } = fixture;
    grip(fixture, true);
    tick({}, { throw: true });
    until(fixture, () => !!player.thrown, 'the player is already airborne');
    const hp = player.hp;
    if (removal === 'defeated') enemy.hp = 0;
    else game.state.enemies = [];
    until(fixture, () => !player.thrown, 'a missing thrower cannot orphan the flight');
    assert.ok(player.hp < hp, `${removal} throwers retain one pending landing injury`);
    const afterLanding = player.hp;
    advance(fixture, 180);
    assert.equal(player.hp, afterLanding);
    assert.ok([player.x, player.depth, player.z, player.vx, player.vy].every(Number.isFinite));
  }
});

test('respawn and arena placement clear player flight so old throws cannot damage the new life', () => {
  for (const reset of ['respawn', 'placement', 'final defeat']) {
    const fixture = arena();
    const { game, player, enemy, tick } = fixture;
    grip(fixture, true);
    tick({}, { throw: true });
    until(fixture, () => !!player.thrown, 'the player enters flight');
    if (reset === 'placement') game.placePlayer();
    else {
      if (reset === 'final defeat') game.state.lives = 1;
      player.hp = 0;
      tick();
    }
    assert.ok(!player.thrown && !player.grabbedBy && !enemy.grabTarget, reset);
    const hp = player.hp;
    advance(fixture, 240);
    assert.equal(player.hp, hp, 'no deferred throw injury reaches the next life or arena');
  }
});

test('player attack and power inputs while held cannot leak into attacks after release', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  grip(fixture, true);
  const hp = enemy.hp;
  tick({ attack: true });
  tick({ special: true });
  tick({ burst: true });
  tick({ throw: true });
  assert.equal(player.buffer, null);
  game.grapples.release(game, enemy);
  advance(fixture, 100);
  assert.equal(enemy.hp, hp);
  assert.equal(player.action, null);
  assert.equal(game.state.projectiles.length, 0);
});

test('disabled holders cannot start grabs and invulnerable targets cannot be caught', () => {
  for (const patch of [{ stun: .5 }, { frozen: .5 }, { knockdown: .5 }, { dashTime: .15 }, { hp: 0 }, { dead: true }]) {
    const fixture = arena();
    const { game, player, enemy } = fixture;
    Object.assign(player, { stun: 1, hitType: 'dizzy' });
    Object.assign(enemy, patch);
    assert.equal(game.grapples.tryGrab(game, enemy), false, JSON.stringify(patch));
    assert.ok(!enemy.grabTarget && !player.grabbedBy);
  }
  for (const protectedTarget of ['player', 'enemy']) {
    const fixture = arena();
    const { game, player, enemy } = fixture;
    const target = protectedTarget === 'player' ? player : enemy;
    const holder = protectedTarget === 'player' ? enemy : player;
    Object.assign(target, { stun: 1, hitType: 'dizzy', invulnerable: .5 });
    assert.equal(game.grapples.tryGrab(game, holder), false, `${protectedTarget} protection remains effective`);
    assert.ok(!holder.grabTarget && !target.grabbedBy);
  }
});
