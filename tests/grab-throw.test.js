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
  const player = game.state.player;
  Object.assign(player, { x: 500, depth: 560, y: 560, z: 0, vx: 0, vy: 0, vDepth: 0, invulnerable: 0 });
  const target = opponent(game, 550);
  return { game, player, target };
}

function opponent(game, x, depth = 560, options = {}) {
  const fighter = game.spawnEnemy({ dummy: true, element: 'air', x, depth, ...options });
  Object.assign(fighter, { aiTimer: 100, hp: 2000, maxHp: 2000, invulnerable: 0 });
  return fighter;
}

function advance(game, frames, input = {}, dt = STEP) {
  for (let frame = 0; frame < frames; frame++) game.tick(input, dt);
}

function until(game, condition, message, frames = 360) {
  for (let frame = 0; frame < frames && !condition(); frame++) game.tick({}, STEP);
  assert.ok(condition(), message);
}

function grip(game, player, target) {
  Object.assign(target, { stun: 1, hitType: 'dizzy', stagger: 60 });
  game.tick({ interact: true }, STEP);
  assert.equal(player.grabTarget, target.id, 'E grips the nearby vulnerable opponent');
  assert.equal(target.grabbedBy, player.id, 'the opponent is held by this player');
}

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} can turn a naturally earned dizzy opening into a grab`, () => {
    const { game, player, target } = arena(element);
    const jabs = element === 'earth' ? 2 : 3;
    for (let strike = 0; strike < jabs; strike++) {
      const previousContacts = game.state.combo;
      game.tick({ attack: true }, STEP);
      until(game, () => game.state.combo > previousContacts, 'the jab makes contact without repositioning');
      until(game, () => !player.action && player.hitLag <= 0, 'the ordinary jab finishes recovery');
    }
    assert.equal(target.hitType, 'dizzy');
    assert.ok(target.stun > 0, 'the real combo leaves a live opening');
    game.tick({ interact: true }, STEP);
    assert.equal(player.grabTarget, target.id, 'the opening is reachable without moving either fighter in the test');
    assert.equal(target.grabbedBy, player.id);
    assert.equal(target.action, null);
  });
}

test('grabs require a grounded, nearby, frontal dizzy target in the same lane', () => {
  const scenarios = [
    { name: 'ordinary flinch', patch: { hitType: 'stagger' } },
    { name: 'recovered opponent', patch: { stun: 0 } },
    { name: 'opponent behind', patch: { x: 450 } },
    { name: 'opponent out of reach', patch: { x: 610 } },
    { name: 'different lane', patch: { depth: 600, y: 600 } },
    { name: 'airborne opponent', patch: { z: 35, y: 525, grounded: false, vy: -80 } },
    { name: 'knocked down opponent', patch: { knockdown: .5 } },
    { name: 'frozen opponent', patch: { frozen: 1 } },
    { name: 'defeated opponent', patch: { hp: 0 } },
  ];
  for (const { name, patch } of scenarios) {
    const { game, player, target } = arena();
    Object.assign(target, { stun: 1, hitType: 'dizzy' }, patch);
    game.tick({ interact: true }, STEP);
    assert.ok(!player.grabTarget, name);
    assert.ok(!target.grabbedBy, name);
  }
});

test('a grab input waits for the current jab to finish rather than cancelling recovery', () => {
  const { game, player, target } = arena('earth');
  target.x = 1000;
  game.tick({ attack: true }, STEP);
  const action = player.action;
  until(game, () => action.t >= action.duration - .1, 'the jab reaches its late input window');
  Object.assign(target, { x: player.x + 45, stun: 1, hitType: 'dizzy' });
  game.tick({ interact: true }, STEP);
  assert.equal(player.action, action);
  assert.ok(!player.grabTarget, 'E cannot skip the remaining recovery');
  until(game, () => player.grabTarget === target.id, 'the buffered grab starts at the first free transition');
  assert.ok(action.t >= action.duration - STEP);
});

test('a grip holds both fighters in place, permits turning, and prevents queued attacks or powers', () => {
  const { game, player, target } = arena();
  grip(game, player, target);
  const x = player.x, depth = player.depth, energy = player.energy;
  advance(game, 24, { left: true, up: true, run: true, jump: true, dash: true, attack: true, special: true, burst: true, command: true, guard: true });
  assert.equal(player.facing, -1, 'direction chooses the throw facing');
  assert.ok(Math.abs(player.x - x) < 1 && Math.abs(player.depth - depth) < 1, 'holding a fighter plants the grabber');
  assert.equal(player.z, 0);
  assert.equal(player.guard, false, 'a grab is a commitment rather than an invulnerable defense');
  assert.equal(player.action, null);
  assert.equal(target.action, null);
  assert.ok(target.x < player.x, 'turning moves the held opponent to the new front');
  assert.ok(player.energy >= energy, 'grip-time abilities do not spend resources');
  game.tick({ interact: true }, STEP);
  advance(game, 80);
  assert.ok(!player.grabTarget && !target.grabbedBy);
  assert.equal(player.action, null, 'discarded grip-time commands cannot fire after release');
  assert.equal(game.state.projectiles.length, 0);
});

test('E voluntarily releases the opponent without launching or dealing throw damage', () => {
  const { game, player, target } = arena();
  grip(game, player, target);
  const hp = target.hp;
  game.tick({ interact: true }, STEP);
  assert.ok(!player.grabTarget && !target.grabbedBy);
  assert.ok(!target.thrown);
  assert.equal(target.hp, hp);
  assert.ok(Math.abs(target.vx) < 100, 'release is not a projectile throw');
});

test('ordinary opponents escape a finite hold and guardians break free sooner', () => {
  for (const boss of [false, true]) {
    const { game, player, target } = arena();
    if (boss) target.type = 'boss';
    grip(game, player, target);
    const started = game.state.time;
    until(game, () => !player.grabTarget, 'the hold has a finite escape time', 300);
    const heldFor = game.state.time - started;
    assert.ok(heldFor > (boss ? .5 : 1), 'the player has time to choose a throw');
    assert.ok(heldFor < (boss ? 1.3 : 2.3), 'the hold cannot lock the target indefinitely');
    assert.ok(!target.grabbedBy);
    assert.ok(!target.thrown);
    game.tick({ interact: true }, STEP);
    assert.ok(!player.grabTarget, 'escape consumes the old dizzy opening instead of allowing an immediate re-grab');
  }
});

test('an unblocked hit on either participant breaks the grab', () => {
  for (const hitHolder of [true, false]) {
    const { game, player, target } = arena();
    grip(game, player, target);
    const attacker = opponent(game, 700);
    const recipient = hitHolder ? player : target;
    recipient.invulnerable = 0;
    assert.equal(game.damage(recipient, 4, -1, attacker, { light: true, knockback: 30 }), true);
    game.tick({}, STEP);
    assert.ok(!player.grabTarget && !target.grabbedBy, `${hitHolder ? 'grabber' : 'victim'} damage releases both links`);
    assert.ok(!target.thrown, 'interruption does not accidentally finish a pending throw');
  }
});

test('defeat, respawn and wave placement leave no orphaned held fighters', () => {
  for (const interruption of ['victim KO', 'player respawn', 'player final KO', 'placement']) {
    const { game, player, target } = arena();
    grip(game, player, target);
    if (interruption === 'victim KO') target.hp = 0;
    else if (interruption === 'placement') game.placePlayer();
    else {
      player.hp = 0;
      if (interruption === 'player final KO') game.state.lives = 1;
    }
    game.tick({}, STEP);
    assert.ok(!player.grabTarget && !target.grabbedBy, interruption);
    assert.doesNotThrow(() => JSON.stringify(game.state), 'grab state remains serializable');
  }
});

test('ongoing fire damage can defeat either participant without leaving an orphaned grip', () => {
  for (const burnHolder of [false, true]) {
    const { game, player, target } = arena();
    grip(game, player, target);
    const burning = burnHolder ? player : target;
    Object.assign(burning, { hp: 2, burn: 1, burnTick: .08 });
    advance(game, 60);
    assert.ok(!player.grabTarget && !target.grabbedBy, 'burn defeat releases both linked fighters');
    if (burnHolder) assert.equal(game.state.lives, 2, 'the grabber respawns normally');
    else assert.equal(game.state.kills, 1, 'the held opponent is defeated normally');
  }
});

test('U gives a readable throw windup, then launches in the chosen direction', () => {
  for (const direction of [-1, 1]) {
    const { game, player, target } = arena();
    grip(game, player, target);
    game.tick({ throw: true, left: direction < 0, right: direction > 0 }, STEP);
    assert.equal(player.action?.kind, 'bodyThrow');
    assert.equal(target.grabbedBy, player.id, 'the victim remains held during windup');
    advance(game, 8);
    assert.equal(target.grabbedBy, player.id, 'the throw is not instantaneous');
    until(game, () => !!target.thrown, 'the throw releases its victim');
    assert.ok(!player.grabTarget && !target.grabbedBy);
    assert.ok(target.vx * direction > 300);
    assert.ok(target.vy < 0 && target.knockdown > 0, 'the body flies in a knockdown pose');
  }
});

test('a thrown body damages a crowd once per fighter and ignores another depth lane', () => {
  const { game, player, target } = arena();
  const near = opponent(game, 635);
  const far = opponent(game, 710);
  const offLane = opponent(game, 670, 625);
  const playerHP = player.hp;
  grip(game, player, target);
  game.tick({ throw: true }, STEP);
  until(game, () => near.hp < near.maxHp && far.hp < far.maxHp, 'one thrown enemy knocks through both aligned opponents');
  assert.ok(near.knockdown > 0 && far.knockdown > 0);
  const nearHP = near.hp, farHP = far.hp;
  advance(game, 200);
  assert.equal(near.hp, nearHP, 'continuing overlap cannot hit the same target twice');
  assert.equal(far.hp, farHP);
  assert.equal(offLane.hp, offLane.maxHp, 'depth separation matters for thrown bodies');
  assert.equal(player.hp, playerHP, 'the projectile body does not damage its thrower');
  assert.ok(target.hp < target.maxHp, 'the thrown victim pays landing damage');
  assert.ok(!target.thrown && !target.grabbedBy && !player.grabTarget, 'landing removes throw and grip state');
});

test('crowd collisions remain reliable at the largest supported simulation step', () => {
  const { game, player, target } = arena();
  const crowd = opponent(game, 640);
  grip(game, player, target);
  game.tick({ throw: true }, 1 / 30);
  advance(game, 45, {}, 1 / 30);
  assert.ok(crowd.hp < crowd.maxHp, 'a fast body cannot skip a bystander between frames');
  for (const fighter of [player, target, crowd]) {
    assert.ok([fighter.x, fighter.depth, fighter.z, fighter.vx, fighter.vy].every(Number.isFinite));
  }
});

test('a nearly defeated body still hits the crowd before its landing or wall impact causes a KO', () => {
  for (const nearWall of [false, true]) {
    const { game, player, target } = arena();
    if (nearWall) { player.x = 1190; target.x = 1230; }
    target.hp = 1;
    const bystander = opponent(game, nearWall ? 1220 : 640);
    grip(game, player, target);
    game.tick({ throw: true }, STEP);
    let launchedAlive = false;
    for (let frame = 0; frame < 180; frame++) {
      game.tick({}, STEP);
      launchedAlive ||= !!target.thrown && target.hp > 0;
    }
    assert.ok(launchedAlive, 'throwing does not remove the projectile body before it travels');
    assert.ok(bystander.hp < bystander.maxHp, 'the body still damages a bystander');
    assert.equal(target.hp, 0, 'the final impact deals the thrown victim damage');
    assert.equal(game.state.kills, 1, 'impact injury can award only one KO for the thrown body');
    assert.ok(!target.thrown && !player.grabTarget && !target.grabbedBy);
  }
});

test('being hit during throw preparation cancels the release instead of throwing later', () => {
  const { game, player, target } = arena();
  grip(game, player, target);
  game.tick({ throw: true }, STEP);
  advance(game, 4);
  const attacker = opponent(game, 700);
  game.damage(player, 3, -1, attacker, { light: true, knockback: 40 });
  advance(game, 120);
  assert.ok(!target.thrown && !target.grabbedBy && !player.grabTarget);
  assert.ok(target.grounded, 'the interrupted release does not launch the held opponent');
});

test('armed interaction and weapon throwing still use the existing E and U controls', () => {
  const { game, player, target } = arena();
  Object.assign(target, { x: 1000, stun: 1, hitType: 'dizzy' });
  player.weapon = 'staff';
  player.weaponHits = 12;
  game.tick({ throw: true }, STEP);
  until(game, () => game.state.projectiles.some(shot => shot.kind === 'weapon'), 'U still throws the equipped weapon');
  assert.equal(player.weapon, null);
  assert.ok(!player.grabTarget && !target.grabbedBy);

  const second = arena();
  Object.assign(second.target, { stun: 1, hitType: 'dizzy' });
  second.player.weapon = 'spear';
  second.player.weaponHits = 9;
  second.game.tick({ interact: true }, STEP);
  assert.ok(!second.player.grabTarget, 'an equipped weapon must be freed before grabbing');
  assert.equal(second.player.weapon, null);
  assert.ok(second.game.state.weapons.some(weapon => weapon.kind === 'spear'), 'E keeps its existing drop behavior');
});
