import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { COMBAT } from '../src/data.js';

function arena(element = 'air', difficulty = 'hard') {
  const game = new Game({ mode: 'survival', element: 'fire', difficulty, seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: 640, depth: 540, y: 540, z: 0, vx: 0, vy: 0,
    vDepth: 0, invulnerable: 0, facing: -1, hp: 1000, maxHp: 1000 });
  const foe = game.spawnEnemy({ element, x: 560, depth: 540 });
  Object.assign(foe, { aiTimer: 0, invulnerable: 0, facing: 1 });
  return { game, foe, player: game.state.player };
}

function think(game, seconds = .4) {
  game.state.time += seconds;
  game.enemyAI.update(game, seconds);
}

function incoming(game, foe, patch = {}) {
  const shot = { x: foe.x + 250, depth: foe.depth, z: 35, vx: -500, vy: 0,
    vDepth: 0, gravity: 0, r: 15, life: 1, team: 'player', ...patch };
  game.state.projectiles.push(shot);
  return shot;
}

const offensive = input => !!(input.attack || input.special || input.burst || input.interact || input.throw);

test('air fighters recognize an approaching projectile after a reaction delay and commit to a lane escape', () => {
  const { game, foe, player } = arena();
  think(game);
  foe.aiTimer = 2;
  incoming(game, foe);
  think(game, 1 / 120);
  let input = game.enemyAI.input(game, foe);
  assert.ok(!input.guard && !input.dash, 'a new projectile must not trigger an immediate perfect defense');
  think(game, .14);
  input = game.enemyAI.input(game, foe);
  assert.ok(input.up || input.down, 'the fighter leaves the predicted impact lane');
  assert.ok(!offensive(input), 'defense owns the decision instead of simultaneously attacking');
  const direction = input.down ? 1 : -1;
  player.depth += direction * 70;
  think(game, .03);
  input = game.enemyAI.input(game, foe);
  assert.equal(input.down ? 1 : -1, direction, 'a short escape commitment prevents lane jitter');
});

test('earth can guard a visible frontal projectile but does not react to departing or high shots', () => {
  const { game, foe } = arena('earth');
  think(game);
  foe.aiTimer = 2;
  incoming(game, foe);
  think(game, .01);
  game.enemyAI.input(game, foe);
  think(game, .2);
  assert.equal(game.enemyAI.input(game, foe).guard, true);
  for (const patch of [{ vx: 500 }, { z: 180 }]) {
    const other = arena('earth');
    think(other.game);
    other.foe.aiTimer = 2;
    incoming(other.game, other.foe, patch);
    think(other.game, .01);
    other.game.enemyAI.input(other.game, other.foe);
    think(other.game, .3);
    const input = other.game.enemyAI.input(other.game, other.foe);
    assert.ok(!input.guard && !input.dash && !input.up && !input.down);
  }
});

for (const element of ['earth', 'water']) {
  test(`${element} maintains a projectile guard until a slower visible shot actually arrives`, () => {
    const { game, foe, player } = arena(element);
    foe.aiTimer = 999;
    think(game);
    incoming(game, foe, { x: foe.x + 180, vx: -300, r: 12, life: 2,
      element: 'air', damage: 19, knockback: 100, source: player });
    game.enemyAI.update(game, 0);
    // The projectile is already visible when this decision is made. Advancing
    // its observation age isolates guard duration from initial reaction delay.
    think(game, .2);
    const hp = foe.hp;
    let guarded = false;
    for (let frame = 0; frame < 120; frame++) {
      game.tick({}, 1 / 120);
      guarded ||= foe.guard;
    }
    assert.ok(guarded);
    assert.ok(hp - foe.hp <= 4, 'a .6-second impact must not arrive just after an arbitrary .5-second guard cap');
  });
}

test('a visible whiff is punished instead of waiting out the ordinary between-attack delay', () => {
  const { game, foe, player } = arena('fire', 'normal');
  think(game);
  foe.aiTimer = .5;
  game.startAction(player, 'melee');
  player.action.t = player.action.activeUntil + .04;
  player.action.connected = false;
  game.random = () => .99;
  const input = game.enemyAI.input(game, foe);
  assert.equal(input.attack, true, 'the AI takes a real recovery opening even when ordinary attack RNG would fail');
});

test('an established pursuit leads a moving target by a bounded distance', () => {
  const { game, foe, player } = arena('fire');
  foe.x = 700;
  foe.facing = -1;
  player.vx = 350;
  think(game);
  foe.aiTimer = 2;
  const input = game.enemyAI.input(game, foe);
  assert.equal(input.right, true, 'the flanking fighter intercepts the visible movement instead of chasing the old feet position');
});

test('a confirmed launcher jumps after contact, while a missed launcher pays its full recovery', () => {
  for (const connected of [true, false]) {
    const { game, foe, player } = arena('earth');
    think(game);
    Object.assign(player, { grounded: false, z: 70, vy: -300, stun: .5, hitType: 'launch' });
    foe.action = { kind: 'melee', variant: 'launcher', connected, launched: connected, chainAt: .25,
      activeUntil: .2, t: .27, duration: .5, followupQueued: false };
    const input = game.enemyAI.input(game, foe);
    assert.equal(!!input.jump, connected, 'only earned contact unlocks the pursuit jump');
  }
});

test('air pursuit attacks a reachable rising target despite the ground-combo cooldown', () => {
  const { game, foe, player } = arena('air');
  think(game);
  Object.assign(foe, { grounded: false, z: 65, vy: -200, aiTimer: .8 });
  Object.assign(player, { grounded: false, z: 85, vy: -100, stun: .4, hitType: 'launch' });
  foe.ai.airChaseUntil = game.state.time + 1;
  assert.equal(game.enemyAI.input(game, foe).attack, true);
});

test('a committed melee attack is never cancelled to dodge a new projectile', () => {
  const { game, foe } = arena();
  think(game);
  incoming(game, foe);
  game.startAction(foe, 'melee');
  const action = foe.action;
  think(game, .4);
  const input = game.enemyAI.input(game, foe);
  assert.ok(!input.dash && !input.guard && !input.up && !input.down);
  assert.equal(foe.action, action);
});

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} avoids or blocks a real incoming bolt on Normal`, () => {
    const { game, foe, player } = arena(element, 'normal');
    Object.assign(player, { x: 900, invulnerable: 999, element: 'air' });
    Object.assign(foe, { x: 420, aiTimer: 999 });
    for (let frame = 0; frame < 30; frame++) game.tick({}, 1 / 120);
    const hp = foe.hp;
    game.shoot(player);
    let protectedItself = false;
    for (let frame = 0; frame < 120; frame++) {
      game.tick({}, 1 / 120);
      protectedItself ||= foe.guard || foe.dashTime > 0;
    }
    assert.ok(hp - foe.hp < 5, 'defense must reduce actual bolt damage, not just request a late ineffective dodge');
    assert.ok(protectedItself, 'the bolt is survived using the ordinary player-visible defense mechanics');
  });
}

test('Air yields diagonally to a visible strike while Earth anchors behind its guard', () => {
  for (const element of ['air', 'earth']) {
    const { game, foe, player } = arena(element);
    think(game);
    player.action = { kind: 'melee', t: .2, activeUntil: .3, duration: .5, connected: false };
    game.random = () => 0;
    const input = game.enemyAI.input(game, foe);
    if (element === 'air') {
      assert.ok(input.left && (input.up || input.down), 'Air steps away and out of the strike lane');
      assert.ok(!input.guard && !offensive(input));
    } else {
      assert.equal(input.guard, true);
      assert.ok(!input.left && !input.right && !input.up && !input.down, 'Earth holds its position');
    }
  }
});

test('Fire rushes into a distant engagement while Air keeps a wider approach', () => {
  const positions = {};
  for (const element of ['air', 'fire']) {
    const { game, foe } = arena(element, 'normal');
    foe.x = 320;
    foe.aiTimer = 99;
    for (let frame = 0; frame < 120; frame++) game.tick({}, 1 / 120);
    positions[element] = foe.x;
  }
  assert.ok(positions.fire > positions.air + 35, 'Fire takes ground rapidly while Air stays outside the pocket');
});

test('Water guards a strike and spends the return opening on a counter instead of retreating', () => {
  const { game, foe, player } = arena('water');
  think(game);
  game.random = () => 0;
  foe.aiTimer = 2;
  player.action = { kind: 'melee', t: .2, activeUntil: .3, duration: .5, connected: false };
  assert.equal(game.enemyAI.input(game, foe).guard, true);
  player.action = null;
  think(game, .3);
  assert.equal(game.enemyAI.input(game, foe).attack, true, 'a guarded exchange grants a short tactical counter opportunity');
});

test('Earth holds its anchor while its attack turn rotates to a teammate', () => {
  const { game, foe } = arena('earth');
  think(game);
  foe.ai.rotationUntil = game.state.time + .3;
  foe.aiTimer = 2;
  const input = game.enemyAI.input(game, foe);
  assert.ok(!input.left && !input.right && !offensive(input));
});

test('Normal enemies can recover on the floor but never roll out of a throw in flight', () => {
  for (const airborne of [true, false]) {
    const { game, foe } = arena('fire', 'normal');
    think(game);
    Object.assign(foe, { knockdown: .55, downTime: .3, grounded: !airborne,
      z: airborne ? 50 : 0, thrown: airborne ? { sourceId: game.state.player.id } : null });
    const input = game.enemyAI.input(game, foe);
    assert.equal(!!input.dash, !airborne);
    if (!airborne) {
      game.updateFighter(foe, input, 1 / 120);
      assert.ok(foe.recoveryRoll, 'the chosen input actually starts the shared recovery mechanic');
    }
  }
});

test('Easy enemies keep the slower floor recovery instead of copying Hard defense', () => {
  const { game, foe } = arena('fire', 'easy');
  think(game);
  Object.assign(foe, { knockdown: .55, downTime: .3, grounded: true });
  assert.ok(!game.enemyAI.input(game, foe).dash);
});

test('the world tick delivers enemy recovery input instead of filtering out knocked-down fighters', () => {
  const { game, foe } = arena('fire', 'normal');
  think(game);
  Object.assign(foe, { knockdown: .55, downTime: .31, grounded: true, stun: .2 });
  game.tick({}, 1 / 120);
  assert.ok(foe.recoveryRoll, 'normal gameplay must reach the controller recovery decision');
});

test('a reachable fighter takes an attack turn before distant opponents with older turns', () => {
  const { game, foe } = arena('fire', 'normal');
  const distant = [80, 1200].map(x => game.spawnEnemy({ element: 'earth', x, depth: 420 }));
  think(game);
  distant.forEach(e => { e.ai.lastTurn = -5; });
  foe.ai.lastTurn = game.state.time - .5;
  game.enemyAI.update(game, .01);
  assert.equal(foe.ai.permit, true);
});

test('repeated visible casts trigger a flanking approach, and the memory expires', () => {
  const { game, foe, player } = arena('fire', 'normal');
  Object.assign(foe, { x: 290, aiTimer: 99 });
  for (let i = 0; i < 2; i++) {
    player.action = { kind: 'special', t: .3 };
    think(game, .4);
  }
  const input = game.enemyAI.input(game, foe);
  assert.ok(input.up || input.down, 'the approach leaves the repeated firing lane');
  assert.ok(!input.special, 'the response closes space rather than trading projectiles');
  player.action = null;
  think(game, 4.1);
  assert.equal(foe.ai.rangedPressure, false);
});

test('a single held cast does not count as repeated attacks', () => {
  const { game, foe, player } = arena('fire', 'normal');
  player.action = { kind: 'special', t: .4 };
  for (let i = 0; i < 5; i++) think(game, .2);
  assert.equal(foe.ai.rangedPressure, false);
});

test('a pursuer spends an ordinary dash to intercept a retreat and pays the energy cost', () => {
  const { game, foe, player } = arena('fire', 'normal');
  Object.assign(foe, { x: 340, energy: 50 });
  player.vx = 200;
  think(game);
  const input = game.enemyAI.input(game, foe);
  assert.equal(input.dash, true);
  game.updateFighter(foe, input, 1 / 120);
  assert.ok(foe.dashTime > 0 && foe.energy < 50);
});

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} AI follows an earned launcher with real aerial hits and keeps its crowd reservation`, () => {
    const { game, foe, player } = arena(element);
    foe.x = 575;
    game.startAction(foe, 'melee', true);
    const connected = new Set();
    let pursued = false;
    for (let frame = 0; frame < 300; frame++) {
      game.tick({}, 1 / 120);
      if (foe.ai.airChasing) {
        pursued = true;
        assert.ok(game.enemyAI.occupied(game) >= 1, 'the jump between attacks cannot release an offensive crowd slot');
      }
      if (foe.action?.variant === 'aerial' && foe.action.connected) connected.add(foe.action);
    }
    assert.ok(pursued, 'confirmed contact starts an actual chase');
    assert.equal(connected.size, COMBAT[element].aerial.length,
      'the controller completes the element-specific chain against natural launch physics');
    assert.ok(player.hp < player.maxHp);
  });
}
