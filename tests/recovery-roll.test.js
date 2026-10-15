import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

const STEP = 1 / 120;

function arena(element = 'air') {
  const game = new Game({ element, mode: 'survival', difficulty: 'normal', seed: 952 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], weapons: [], waveDelay: 999 });
  const player = game.state.player;
  Object.assign(player, { x: 500, depth: 540, y: 540, z: 0, vx: 0, vy: 0, vDepth: 0,
    invulnerable: 0, hp: 2000, maxHp: 2000, facing: 1 });
  const enemy = game.spawnEnemy({ dummy: true, element: 'air', x: 1000, depth: 540 });
  Object.assign(enemy, { aiTimer: 999, hp: 2000, maxHp: 2000, invulnerable: 0 });
  let enemyIntent = {};
  game.enemyInput = () => enemyIntent;
  const tick = (input = {}, opposingInput = {}, dt = STEP) => {
    enemyIntent = opposingInput;
    game.tick(input, dt);
    enemyIntent = {};
  };
  return { game, player, enemy, tick };
}

function advance(fixture, frames, input = {}) {
  for (let frame = 0; frame < frames; frame++) fixture.tick(input);
}

function until(fixture, predicate, message, frames = 360) {
  for (let frame = 0; frame < frames && !predicate(); frame++) fixture.tick();
  assert.ok(predicate(), message);
}

function knockDown(fixture) {
  const { game, player, enemy } = fixture;
  assert.equal(game.damage(player, 8, 1, enemy,
    { knockdown: true, heavy: true, knockback: 0, lift: 240 }), true);
  assert.ok(player.knockdown > 0 && !player.grounded, 'a real hit starts an airborne knockdown');
}

function land(fixture) {
  knockDown(fixture);
  until(fixture, () => fixture.player.grounded, 'the knocked-down player reaches the floor');
}

function roll(fixture, input = { dash: true, right: true }) {
  land(fixture);
  advance(fixture, 18);
  fixture.tick(input);
  assert.ok(fixture.player.recoveryRoll, 'Shift after the landing lock starts a recovery roll');
  return fixture.player.recoveryRoll;
}

function throwPlayer(fixture) {
  const { player, enemy, tick } = fixture;
  Object.assign(enemy, { x: 550, depth: 540, y: 540, facing: -1 });
  Object.assign(player, { stun: 1, hitType: 'dizzy' });
  tick({}, { interact: true });
  assert.equal(player.grabbedBy, enemy.id);
  tick({}, { throw: true });
  until(fixture, () => !!player.thrown, 'the enemy completes its throw');
  return player.hp;
}

test('a grounded knockdown accepts Shift after a short landing lock and rolls without energy', () => {
  const fixture = arena();
  const { player, tick } = fixture;
  land(fixture);
  player.energy = 0;
  const x = player.x;
  tick({ dash: true, right: true });
  assert.ok(!player.recoveryRoll, 'the first grounded frame retains a readable landing impact');
  until(fixture, () => !!player.recoveryRoll, 'a recent grounded Shift waits for the landing lock', 30);
  assert.ok(player.x > x, 'recovery changes position instead of only skipping the get-up pose');
  assert.ok(player.energy < 3, 'the roll works without the normal dash energy requirement');
  assert.equal(player.dashTime, 0, 'the recovery is distinct from an ordinary air dash');
  assert.equal(player.grounded, true);
  assert.equal(player.z, 0);
});

test('roll direction is chosen once and opposite movement cannot turn or cancel it', () => {
  const fixture = arena();
  const { player, tick } = fixture;
  const action = roll(fixture);
  const start = player.x;
  for (let frame = 0; frame < 10; frame++) tick({ left: true, down: true, guard: true });
  assert.equal(player.recoveryRoll, action);
  assert.equal(action.direction, 1);
  assert.equal(action.depthDirection, 0);
  assert.ok(player.x > start, 'opposite input cannot reverse the committed recovery');
  assert.equal(player.depth, 540, 'depth input cannot redirect a horizontal roll mid-action');
  assert.equal(player.guard, false);
});

test('directional recovery can escape into another depth lane while staying on the floor', () => {
  const fixture = arena();
  const { player } = fixture;
  const action = roll(fixture, { dash: true, up: true });
  const x = player.x, depth = player.depth;
  advance(fixture, 10);
  assert.equal(action.depthDirection, -1);
  assert.equal(action.direction, 0);
  assert.ok(player.depth < depth);
  assert.ok(Math.abs(player.x - x) < 1, 'a depth-only roll does not drift horizontally');
  assert.equal(player.z, 0);
  assert.equal(player.grounded, true);
});

test('protection covers the start of a roll but ends so recovery cannot grant lasting immunity', () => {
  const fixture = arena();
  const { game, player, enemy } = fixture;
  roll(fixture);
  const hp = player.hp;
  assert.equal(game.damage(player, 10, -1, enemy, { light: true, knockback: 0, lift: 0 }), false);
  assert.equal(player.hp, hp);
  until(fixture, () => !player.recoveryRoll, 'the roll has a finite duration');
  assert.equal(player.knockdown, 0);
  assert.equal(player.invulnerable, 0, 'normal get-up protection must not be added to the completed roll');
  assert.equal(game.damage(player, 10, -1, enemy, { light: true, knockback: 0, lift: 0 }), true);
  assert.ok(player.hp < hp, 'the recovered fighter is attackable again');
});

test('an attack can punish the vulnerable end of a roll and interrupt its remaining motion', () => {
  const fixture = arena();
  const { game, player, enemy } = fixture;
  roll(fixture);
  until(fixture, () => player.recoveryRoll && player.invulnerable <= 0,
    'the roll exposes a brief vulnerable recovery tail');
  const hp = player.hp;
  assert.equal(game.damage(player, 10, -1, enemy, { light: true, knockback: 160, lift: 0 }), true);
  assert.ok(player.hp < hp);
  assert.ok(!player.recoveryRoll, 'a successful punish cancels roll motion instead of retaining protected control');
  assert.ok(player.stun > 0);
  assert.equal(player.buffer, null);
});

test('a roll passes a crowd body and an early strike, but a timed melee attack punishes its ending', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  land(fixture);
  advance(fixture, 18);
  Object.assign(enemy, { x: player.x + 70, facing: -1 });
  tick({}, { attack: true });
  const earlyStrike = enemy.action;
  until(fixture, () => earlyStrike.t >= earlyStrike.windup - .04,
    'the nearby opponent commits a strike before the player recovers');
  tick({ dash: true, right: true });
  assert.ok(player.recoveryRoll);
  const hp = player.hp;
  until(fixture, () => player.recoveryRoll?.t >= .1,
    'the player rolls through the first strike during protection');
  assert.equal(player.hp, hp, 'the committed early attack fails to pin the recovering player');
  assert.equal(earlyStrike.connected, false);

  const punisher = game.spawnEnemy({ dummy: true, element: 'air', x: player.x + 150, depth: player.depth });
  Object.assign(punisher, { aiTimer: 999, facing: -1 });
  assert.equal(game.startAction(punisher, 'melee'), true);
  const lateStrike = punisher.action;
  until(fixture, () => player.x > enemy.x + player.w,
    'the roll gets beyond the first body instead of crowd separation pushing it back');
  assert.equal(player.hp, hp, 'the passage through the close body is still protected');
  until(fixture, () => player.hp < hp, 'the second opponent times its actual melee into the vulnerable tail');
  assert.equal(lateStrike.connected, true);
  assert.ok(!player.recoveryRoll && player.stun > 0, 'a real melee punish interrupts the remaining recovery');
});

test('a recovery roll rejects attacks, powers, jumps, grabs and queued commands through its end', () => {
  const fixture = arena();
  const { game, player, enemy, tick } = fixture;
  const action = roll(fixture);
  const hp = enemy.hp;
  const intents = [
    { attack: true }, { special: true }, { burst: true }, { jump: true },
    { interact: true }, { throw: true }, { special: true, command: true },
  ];
  for (const input of intents) {
    tick(input);
    assert.equal(player.recoveryRoll, action, 'other actions do not cancel early recovery');
    assert.equal(player.action, null);
    assert.ok(!player.grabTarget);
  }
  until(fixture, () => !player.recoveryRoll, 'the committed recovery ends normally');
  advance(fixture, 100);
  assert.equal(player.action, null);
  assert.equal(player.buffer, null, 'no command saved during a roll fires on the first free frame');
  assert.equal(player.z, 0);
  assert.equal(enemy.hp, hp);
  assert.equal(game.state.projectiles.length, 0);
});

test('repeated Shift presses cannot restart a roll or lengthen one knockdown recovery', () => {
  const fixture = arena();
  const { game, player, tick } = fixture;
  const action = roll(fixture);
  const start = game.state.time;
  for (let frame = 0; frame < 240 && player.recoveryRoll; frame++) {
    tick({ dash: true, left: true });
    assert.ok(!player.recoveryRoll || player.recoveryRoll === action, 'one fall supplies only one recovery action');
  }
  assert.ok(!player.recoveryRoll, 'repeated inputs cannot keep the fighter rolling');
  assert.ok(game.state.time - start < 1, 'the short recovery remains bounded');
  assert.equal(player.buffer, null, 'spam is discarded instead of triggering a post-roll dash');
});

test('an early airborne Shift expires without rolling in midair or auto-rolling after a long fall', () => {
  const fixture = arena();
  const { player, tick } = fixture;
  knockDown(fixture);
  until(fixture, () => player.hitLag <= 0, 'the hit pause completes');
  tick({ dash: true, right: true });
  assert.ok(!player.recoveryRoll && !player.grounded);
  for (let frame = 0; frame < 180; frame++) {
    tick();
    assert.ok(!player.recoveryRoll, 'an early tap does not become a persistent recovery command');
  }
  assert.equal(player.knockdown, 0, 'ordinary get-up still follows the landing');
  assert.equal(player.dashTime, 0, 'an expired recovery input never turns into an ordinary dash');
});

test('a near-landing Shift buffers recovery after an ordinary knockdown without skipping impact', () => {
  const fixture = arena();
  const { game, player, tick } = fixture;
  knockDown(fixture);
  until(fixture, () => !player.grounded && player.vy > 0 && player.z < 8,
    'the falling player enters a short pre-landing input window');
  const previousImpact = game.state.lastImpact?.id || 0;
  tick({ dash: true, left: true });
  assert.ok(!player.recoveryRoll, 'buffering is not an airborne escape');
  until(fixture, () => !!player.recoveryRoll, 'the buffered Shift reaches the first grounded recovery window', 40);
  assert.ok(game.state.impacts.some(impact => impact.id > previousImpact && impact.kind === 'land'),
    'the floor impact still occurs before the roll');
  assert.equal(player.recoveryRoll.direction, -1);
});

test('a near-landing Shift after an enemy throw preserves landing injury before recovery starts', () => {
  const fixture = arena();
  const { player, tick } = fixture;
  const hp = throwPlayer(fixture);
  until(fixture, () => !!player.thrown && !player.grounded && player.vy > 0 && player.z < 8,
    'the thrown player approaches the floor');
  tick({ dash: true, right: true });
  assert.ok(!player.recoveryRoll, 'a thrown player cannot roll in midair');
  until(fixture, () => !!player.recoveryRoll, 'the throw landing accepts the recent Shift after impact', 50);
  assert.ok(player.hp < hp, 'recovery never cancels the pending throw landing injury');
  assert.ok(!player.thrown && !player.grabbedBy, 'the throw lifecycle ends before recovery begins');
  const afterImpact = player.hp;
  until(fixture, () => !player.recoveryRoll, 'the recovery completes');
  advance(fixture, 180);
  assert.equal(player.hp, afterImpact, 'the rolled player cannot receive the same landing injury twice');
});

test('a fighter who does not request a roll still gets up from normal knockdowns and throws', () => {
  for (const kind of ['knockdown', 'throw']) {
    const fixture = arena();
    const { player } = fixture;
    if (kind === 'throw') throwPlayer(fixture);
    else knockDown(fixture);
    for (let frame = 0; frame < 360; frame++) {
      fixture.tick();
      assert.ok(!player.recoveryRoll, 'recovery requires an input');
    }
    assert.ok(player.grounded && player.knockdown === 0 && !player.thrown, `${kind} normal recovery completes`);
  }
});

test('recovery rolls pause with the match and resume from the same motion state', () => {
  const fixture = arena();
  const { game, player } = fixture;
  const action = roll(fixture);
  const before = { t: action.t, x: player.x, depth: player.depth, time: game.state.time };
  game.state.status = 'paused';
  advance(fixture, 100, { dash: true, left: true });
  assert.deepEqual({ t: action.t, x: player.x, depth: player.depth, time: game.state.time }, before);
  game.state.status = 'playing';
  until(fixture, () => !player.recoveryRoll, 'the paused roll finishes after play resumes');
});

test('placement, respawn and final defeat clear roll motion and queued recovery state', () => {
  for (const reset of ['placement', 'respawn', 'final defeat']) {
    const fixture = arena();
    const { game, player, tick } = fixture;
    roll(fixture);
    if (reset === 'placement') game.placePlayer();
    else {
      if (reset === 'final defeat') game.state.lives = 1;
      player.hp = 0;
      tick();
    }
    assert.ok(!player.recoveryRoll, reset);
    assert.equal(player.buffer, null);
    assert.equal(player.knockdown, 0);
    const hp = player.hp;
    advance(fixture, 120);
    assert.equal(player.hp, hp);
    assert.ok(!player.recoveryRoll);
  }
});

test('corner rolls stay inside arena bounds even at the maximum simulation step', () => {
  const fixture = arena();
  const { player, tick } = fixture;
  land(fixture);
  advance(fixture, 18);
  Object.assign(player, { x: 1215, depth: 640, y: 640 });
  tick({ dash: true, right: true, down: true }, {}, 1 / 30);
  assert.ok(player.recoveryRoll);
  for (let frame = 0; frame < 30; frame++) tick({}, {}, 1 / 30);
  assert.ok(player.x <= 1250 - player.w / 2 && player.depth <= 650);
  assert.ok(player.x >= 30 + player.w / 2 && player.depth >= 395);
  assert.equal(player.z, 0);
  assert.ok([player.x, player.depth, player.vx, player.vDepth].every(Number.isFinite));
});

test('ordinary jump and air dash controls retain their energy cost outside knockdown recovery', () => {
  const fixture = arena();
  const { player, tick } = fixture;
  tick({ jump: true });
  advance(fixture, 5);
  const energy = player.energy;
  tick({ dash: true, right: true });
  assert.ok(player.dashTime > 0 && !player.grounded);
  assert.ok(player.energy < energy - 7);
  assert.ok(!player.recoveryRoll);
});
