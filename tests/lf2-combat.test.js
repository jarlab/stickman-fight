import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

const STEP = 1 / 120;

function advance(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.ceil(seconds / STEP); frame++) game.tick(input, STEP);
}

function until(game, predicate, message, seconds = 3) {
  for (let frame = 0; frame < Math.ceil(seconds / STEP) && !predicate(); frame++) game.tick({}, STEP);
  assert.ok(predicate(), message);
}

function fixture(element = 'air') {
  const game = new Game({ element, mode: 'survival', difficulty: 'normal', seed: 618 });
  game.start();
  game.state.enemies = [];
  game.state.projectiles = [];
  const player = game.state.player;
  Object.assign(player, { x: 500, y: 560, depth: 560, z: 0, vx: 0, vy: 0, vDepth: 0, invulnerable: 0 });
  const target = opponent(game, 570);
  return { game, player, target };
}

function opponent(game, x, options = {}) {
  const enemy = game.spawnEnemy({ dummy: true, element: 'air', x, depth: 560, ...options });
  Object.assign(enemy, { invulnerable: 0, aiTimer: 100, hp: 2000, maxHp: 2000 });
  return enemy;
}

function pose(fighter) {
  return { x: fighter.x, depth: fighter.depth, z: fighter.z, vx: fighter.vx, vy: fighter.vy, vDepth: fighter.vDepth };
}

function firstContact(game, target) {
  const hp = target.hp;
  game.tick({ attack: true }, STEP);
  until(game, () => target.hp < hp, 'the opening strike connects');
}

test('melee hit lag freezes its participants while another fighter and projectile keep moving', () => {
  const { game, player, target } = fixture();
  const bystander = opponent(game, 1000, { depth: 640 });
  Object.assign(bystander, { z: 100, y: 540, grounded: false, facing: -1 });
  game.shoot(bystander);
  const projectile = game.state.projectiles[0];
  firstContact(game, target);
  assert.ok(player.hitLag > STEP && target.hitLag > STEP, 'contact pauses both fighters');
  const before = { player: pose(player), target: pose(target), bystander: pose(bystander), shot: projectile.x };
  game.tick({}, STEP);
  assert.deepEqual(pose(player), before.player, 'the attacker holds its contact pose');
  assert.deepEqual(pose(target), before.target, 'the victim holds its reaction pose');
  assert.notDeepEqual(pose(bystander), before.bystander, 'an unrelated fighter still obeys gravity');
  assert.notEqual(projectile.x, before.shot, 'a distant projectile continues through the arena');
});

test('hit lag preserves action, cooldown, stun and queued-input time until participants resume', () => {
  const { game, player, target } = fixture();
  player.cooldowns.special = 1;
  firstContact(game, target);
  const action = player.action;
  const before = { actionTime: action.t, cooldown: player.cooldowns.special, stun: target.stun, stagger: target.stagger };
  game.tick({ attack: true }, STEP);
  assert.equal(player.buffer?.kind, 'attack', 'an input edge during contact is retained');
  const ttl = player.buffer.ttl;
  game.tick({}, STEP);
  assert.equal(player.buffer.ttl, ttl, 'freeze does not consume the input window');
  assert.equal(action.t, before.actionTime);
  assert.equal(player.cooldowns.special, before.cooldown);
  assert.equal(target.stun, before.stun);
  assert.equal(target.stagger, before.stagger, 'pressure does not decay during contact freeze');
  const hp = target.hp;
  until(game, () => player.action && player.action !== action, 'the queued follow-up starts after the freeze');
  until(game, () => target.hp < hp, 'the queued follow-up reaches the naturally recoiling target');
});

test('melee participants resume together regardless of their order in the fighter update', () => {
  for (const enemyAttacks of [false, true]) {
    const { game, player, target } = fixture();
    const attacker = enemyAttacks ? target : player;
    const victim = enemyAttacks ? player : target;
    const hp = victim.hp;
    game.startAction(attacker, 'melee');
    until(game, () => victim.hp < hp, 'the opening strike connects');
    const actionTime = attacker.action.t;
    const targetX = victim.x;
    until(game, () => attacker.action.t !== actionTime || victim.x !== targetX, 'the contact pause ends');
    assert.ok(attacker.action.t > actionTime, 'the attacker resumes on the first active step');
    assert.notEqual(victim.x, targetX, 'the victim resumes on the same active step');
  }
});

test('a projectile hit pauses the victim without pausing its remote caster', () => {
  const { game, player, target } = fixture();
  target.x = 800;
  game.shoot(player);
  const hp = target.hp;
  until(game, () => target.hp < hp, 'the projectile reaches its target');
  assert.ok(target.hitLag > STEP, 'the ranged victim has a readable contact pause');
  assert.equal(player.hitLag, 0, 'a remote caster receives no melee contact pause');
  const targetPose = pose(target);
  const playerX = player.x;
  game.tick({ right: true }, STEP);
  assert.deepEqual(pose(target), targetPose);
  assert.ok(player.x > playerX, 'the caster can reposition immediately');
});

test('a parry interrupts a contact attacker but leaves a remote caster free to act', () => {
  for (const contact of [true, false]) {
    const { game, player, target } = fixture();
    if (!contact) target.x = 800;
    Object.assign(target, { guard: true, facing: -1, parryTimer: .15 });
    game.startAction(player, 'melee');
    const action = player.action;
    const hp = target.hp;
    const landed = game.damage(target, 10, 1, player, { light: true, contact });
    assert.equal(landed, false);
    assert.equal(target.hp, hp, 'the parry prevents damage');
    assert.ok(target.hitLag > 0, 'the defender receives a readable parry pause');
    if (contact) {
      assert.equal(player.action, null, 'a parried melee strike is interrupted');
      assert.ok(player.stun > 0 && player.hitLag > 0);
    } else {
      assert.equal(player.action, action, 'a projectile parry does not cancel an action elsewhere in the arena');
      assert.equal(player.stun, 0);
      assert.equal(player.vx, 0, 'the remote caster receives no physical recoil');
      assert.equal(player.hitLag, 0);
    }
  }
});

test('separating overlapping fighters cannot drag a participant out of hit lag', () => {
  const { game, player, target } = fixture();
  firstContact(game, target);
  opponent(game, player.x + 5);
  const before = pose(player);
  game.tick({}, STEP);
  assert.deepEqual(pose(player), before, 'crowd separation respects the held contact pose');
});

test('crowd separation holds the contact pose through the final frozen update', () => {
  const { game, player, target } = fixture();
  firstContact(game, target);
  opponent(game, player.x + 5);
  const frozenPose = pose(player);
  const actionTime = player.action.t;
  until(game, () => player.hitLag === 0, 'the hit-lag countdown finishes');
  assert.equal(player.action.t, actionTime, 'the final frozen update has not advanced the action');
  assert.deepEqual(pose(player), frozenPose, 'separation cannot move the fighter before its action resumes');
  game.tick({}, STEP);
  assert.ok(player.action.t > actionTime, 'the next update resumes the action normally');
});

test('a contact pose stays inside the arena after an attack advances into its boundary', () => {
  const { game, player, target } = fixture();
  const rightBoundary = 1250 - player.w / 2;
  Object.assign(player, { x: rightBoundary, facing: 1 });
  Object.assign(target, { x: rightBoundary, z: 60, y: target.depth - 60, grounded: false });
  firstContact(game, target);
  assert.ok(player.hitLag > 0, 'the boundary strike enters contact freeze');
  assert.ok(player.x <= rightBoundary, 'attack advance is clamped before holding the contact pose');
  const contactX = player.x;
  game.tick({}, STEP);
  assert.equal(player.x, contactX);
});

test('light-hit pressure decays between exchanges and recovers fully without further hits', () => {
  const { game, player, target } = fixture();
  game.damage(target, 1, 1, player, { light: true, knockback: 0, fall: 30, contact: true });
  assert.ok(target.stagger > 0, 'a small HP loss can still create pressure');
  until(game, () => target.hitLag === 0, 'the contact pause expires');
  const pressure = target.stagger;
  advance(game, .2);
  assert.ok(target.stagger > 0 && target.stagger < pressure, 'spacing out an exchange removes pressure gradually');
  advance(game, 2);
  assert.equal(target.stagger, 0);
});

test('repeated light pressure escalates from flinch through dizzy to knockdown independently of HP', () => {
  const { game, player, target } = fixture();
  const hp = target.hp;
  const hit = () => game.damage(target, 1, 1, player, { light: true, knockback: 0, stun: .1, fall: 20, contact: true });
  assert.equal(hit(), true);
  const flinch = target.stun;
  assert.equal(target.knockdown, 0);
  until(game, () => target.invulnerable === 0 && target.hitLag === 0, 'the second hit becomes legal');
  assert.equal(hit(), true);
  assert.equal(target.knockdown, 0);
  until(game, () => target.invulnerable === 0 && target.hitLag === 0, 'the third hit becomes legal');
  assert.equal(hit(), true);
  assert.ok(target.stun > flinch, 'accumulated pressure causes a longer dizzy reaction');
  assert.equal(target.knockdown, 0, 'dizzy leaves a follow-up opportunity');
  until(game, () => target.invulnerable === 0 && target.hitLag === 0, 'the fourth hit becomes legal');
  assert.equal(hit(), true);
  assert.ok(target.knockdown > 0, 'the final pressure hit forces a recoverable knockdown');
  assert.ok(target.hp >= hp - 4, 'this transition depends on pressure rather than lethal damage');
  assert.ok(target.vy < 0 || target.grounded, 'the victim remains in a valid knockdown state');
});

test('blocking adds no fall pressure and armor resists light-hit pressure', () => {
  const normal = fixture();
  const blocked = fixture();
  const armored = fixture();
  Object.assign(blocked.target, { guard: true, facing: -1, parryTimer: 0 });
  armored.target.armor = true;
  for (const { game, player, target } of [normal, blocked, armored]) {
    game.damage(target, 1, 1, player, { light: true, knockback: 0, fall: 25, contact: true });
  }
  assert.equal(blocked.target.stagger, 0, 'guard protects the pressure meter');
  assert.ok(armored.target.stagger < normal.target.stagger, 'armor reduces pressure from a light interruption');
  assert.equal(armored.target.knockdown, 0);
});

test('bosses recover from a pressure hit instead of entering an ordinary fighter knockdown loop', () => {
  const { game, player, target } = fixture();
  Object.assign(target, { type: 'boss', hp: 4000, maxHp: 4000 });
  game.damage(target, 1, 1, player, { light: true, knockback: 0, stun: .1, fall: 100, contact: true });
  assert.equal(target.knockdown, 0);
  assert.ok(target.stun < .5, 'boss stagger has a bounded reaction window');
  advance(game, .8);
  assert.equal(target.hitLag, 0);
  assert.equal(target.stun, 0, 'the boss regains control after the exchange');
});

test('earth finisher drives an airborne opponent down and recovery begins after landing', () => {
  const { game, player, target } = fixture('earth');
  Object.assign(player, { comboIndex: 2, comboTimer: 1 });
  Object.assign(target, { z: 60, y: target.depth - 60, vy: -200, grounded: false });
  firstContact(game, target);
  assert.equal(player.comboIndex, 3);
  assert.ok(target.z > 20, 'the finisher catches an opponent in the air');
  assert.ok(target.vy > 0, 'the impact redirects the opponent toward the ground');
  assert.ok(target.knockdown > 0);
  const recovery = target.knockdown;
  until(game, () => target.grounded, 'the spiked opponent lands');
  assert.equal(target.knockdown, recovery, 'airtime does not spend the grounded recovery window');
  assert.equal(game.state.lastImpact.kind, 'land', 'the landing creates its own impact feedback');
  advance(game, .1);
  assert.ok(target.knockdown > 0 && target.knockdown < recovery);
  until(game, () => target.knockdown === 0, 'the opponent can recover after landing');
});

test('a connected strike follows through in recovery while a whiff does not gain a pursuing step', () => {
  const connected = fixture();
  const missed = fixture();
  missed.target.depth += 65;
  missed.target.y = missed.target.depth;
  for (const { game, player } of [connected, missed]) game.tick({ attack: true }, STEP);
  const distances = [];
  for (const { game, player } of [connected, missed]) {
    until(game, () => player.action?.t >= player.action?.activeUntil && player.hitLag === 0, 'the strike enters recovery');
    const startX = player.x;
    until(game, () => !player.action, 'the strike completes');
    distances.push(player.x - startX);
  }
  assert.ok(distances[0] > 1, 'confirmed contact supplies a small recovery advance for the next link');
  assert.ok(Math.abs(distances[1]) < .1, 'a missed strike retains its committed range');
});
