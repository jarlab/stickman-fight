import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

function arena(difficulty = 'normal') {
  const game = new Game({ mode: 'survival', element: 'air', difficulty, seed: 42 });
  game.start();
  game.state.enemies = [];
  game.state.projectiles = [];
  game.state.waveDelay = 999;
  Object.assign(game.state.player, { x: 640, depth: 560, y: 560, z: 0,
    vx: 0, vy: 0, vDepth: 0, invulnerable: 0, hp: 1000, maxHp: 1000 });
  return game;
}

function enemy(game, x = 595, element = 'earth') {
  const fighter = game.spawnEnemy({ element, x, depth: 560 });
  Object.assign(fighter, { aiTimer: 0, invulnerable: 0, hp: 1000, maxHp: 1000 });
  return fighter;
}

function dizzy(game) {
  Object.assign(game.state.player, { grounded: true, stun: 1, hitType: 'dizzy' });
}

function think(game, seconds = .4) {
  game.state.time += seconds;
  game.enemyAI.update(game, seconds);
}

function attacks(input) {
  return ['attack', 'special', 'burst', 'throw', 'interact'].filter(key => input[key]);
}

test('an enemy reacts before grabbing a nearby dizzy player', () => {
  const game = arena();
  const foe = enemy(game);
  dizzy(game);
  think(game, 0);
  assert.equal(game.enemyAI.input(game, foe).interact, undefined);
  think(game);
  assert.deepEqual(attacks(game.enemyAI.input(game, foe)), ['interact']);
});

test('a dizzy opening overrides recovery retreat to approach before grabbing', () => {
  const game = arena();
  const foe = enemy(game, 560);
  dizzy(game);
  think(game);
  foe.ai.rotationUntil = game.state.time + 2;
  foe.aiTimer = 3;
  think(game);
  const approach = game.enemyAI.input(game, foe);
  assert.equal(approach.right, true, 'move from jab range into actual grabbing range');
  assert.deepEqual(attacks(approach), [], 'do not turn the dizzy opening into another jab');
  foe.x = 595;
  think(game);
  assert.equal(game.enemyAI.input(game, foe).interact, true,
    'the previous combo cooldown does not consume the entire grab opportunity');
});

for (const [label, patch] of [
  ['hit immunity', { invulnerable: .2 }],
  ['airborne player', { grounded: false, z: 20 }],
  ['frozen player', { frozen: .2 }],
  ['normal hit stun', { hitType: 'stagger' }],
  ['wrong depth lane', { depth: 590 }],
]) {
  test(`enemies cannot grab through ${label}`, () => {
    const game = arena();
    const foe = enemy(game);
    dizzy(game);
    Object.assign(game.state.player, patch);
    think(game);
    assert.notEqual(game.enemyAI.input(game, foe).interact, true);
  });
}

test('an armed enemy keeps its ordinary fighting options instead of attempting a grab', () => {
  const game = arena();
  const foe = enemy(game);
  foe.weapon = { kind: 'staff', durability: 3 };
  dizzy(game);
  think(game);
  assert.notEqual(game.enemyAI.input(game, foe).interact, true);
});

test('a combo stops queuing jabs when it has created a grab opening', () => {
  const game = arena();
  const foe = enemy(game);
  dizzy(game);
  foe.action = { kind: 'melee', connected: true, duration: .4, t: .35 };
  think(game);
  assert.deepEqual(attacks(game.enemyAI.input(game, foe)), []);
  assert.notEqual(foe.action.followupQueued, true);
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty} holders pause, punch once and wait for recovery before throwing`, () => {
    const game = arena(difficulty);
    const foe = enemy(game);
    const p = game.state.player;
    foe.grabTarget = p.id;
    p.grabbedBy = foe.id;
    think(game, 0);
    assert.deepEqual(attacks(game.enemyAI.input(game, foe)), []);
    think(game, .15);
    assert.deepEqual(attacks(game.enemyAI.input(game, foe)), []);
    think(game, .3);
    assert.deepEqual(attacks(game.enemyAI.input(game, foe)), ['attack']);
    foe.action = { kind: 'grabPunch' };
    think(game, .7);
    assert.deepEqual(attacks(game.enemyAI.input(game, foe)), [], 'punch recovery is never cancelled');
    foe.action = null;
    assert.deepEqual(attacks(game.enemyAI.input(game, foe)), ['throw']);
    assert.deepEqual(attacks(game.enemyAI.input(game, foe)), [], 'one throw request per grip');
  });
}

test('a fresh grab starts a fresh punch sequence after the previous hold ends', () => {
  const game = arena();
  const foe = enemy(game);
  const p = game.state.player;
  foe.grabTarget = p.id;
  p.grabbedBy = foe.id;
  think(game, 0);
  game.enemyAI.input(game, foe);
  think(game);
  assert.equal(game.enemyAI.input(game, foe).attack, true);
  foe.grabTarget = p.grabbedBy = null;
  think(game);
  foe.grabTarget = p.id;
  p.grabbedBy = foe.id;
  assert.deepEqual(attacks(game.enemyAI.input(game, foe)), []);
  think(game);
  assert.equal(game.enemyAI.input(game, foe).attack, true);
});

for (const state of ['held', 'thrown']) {
  test(`bystanders clear queued attacks and only reposition while the player is ${state}`, () => {
    const game = arena('hard');
    const holder = enemy(game, 595);
    const other = enemy(game, 715, 'fire');
    if (state === 'held') {
      holder.grabTarget = game.state.player.id;
      game.state.player.grabbedBy = holder.id;
    } else game.state.player.thrown = { sourceId: holder.id };
    other.buffer = { kind: 'attack' };
    think(game);
    assert.equal(other.buffer, null);
    assert.deepEqual(attacks(game.enemyAI.input(game, other)), []);
    other.action = { kind: 'melee', connected: true, duration: .4, t: .35 };
    assert.deepEqual(attacks(game.enemyAI.input(game, other)), [], 'do not extend an existing combo');
  });
}

test('grabbing and held strikes occupy the same limited crowd attack slots as normal attacks', () => {
  const game = arena('easy');
  const holder = enemy(game, 595);
  const other = enemy(game, 715, 'fire');
  for (const patch of [
    { grabTarget: game.state.player.id, action: null, buffer: null },
    { grabTarget: null, action: { kind: 'grabPunch' }, buffer: null },
    { grabTarget: null, action: { kind: 'bodyThrow' }, buffer: null },
    { grabTarget: null, action: null, buffer: { kind: 'interact' } },
  ]) {
    Object.assign(holder, patch);
    think(game);
    assert.equal(game.enemyAI.occupied(game), 1);
    assert.equal(other.ai.permit, false);
    assert.deepEqual(attacks(game.enemyAI.input(game, other)), []);
  }
});

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} naturally combos an idle player into a grab, one held punch and a throw`, () => {
    const game = arena();
    const foe = enemy(game, 580, element);
    const p = game.state.player;
    let sawDizzy = false, grabbedAt = null, punchAt = null, hpBeforePunch = null;
    let punchActions = 0, thrownAt = null, landed = false;
    const seen = new Set();
    for (let frame = 0; frame < 120 * 6 && !landed; frame++) {
      game.tick({}, 1 / 120);
      sawDizzy ||= p.stun > 0 && p.hitType === 'dizzy' && p.grabbedBy == null;
      if (p.grabbedBy === foe.id && grabbedAt == null) {
        assert.ok(sawDizzy, 'the AI earns its grab through actual combat pressure');
        grabbedAt = game.state.time;
        hpBeforePunch = p.hp;
      }
      if (foe.action?.kind === 'grabPunch' && !seen.has(foe.action)) {
        seen.add(foe.action);
        punchActions++;
        punchAt = game.state.time;
      }
      if (p.thrown && thrownAt == null) {
        thrownAt = game.state.time;
        assert.ok(p.hp < hpBeforePunch, 'the held punch deals damage before the throw');
        assert.equal(p.grabbedBy, null, 'release detaches the victim before flight');
      }
      if (thrownAt != null && !p.thrown && p.grounded) landed = true;
    }
    assert.ok(grabbedAt != null, 'a real combo produces a grab without injecting a dizzy state');
    assert.equal(punchActions, 1, 'enemy grips deliberately contain one punch');
    assert.ok(punchAt - grabbedAt >= .3, 'the enemy pauses visibly before the held strike');
    assert.ok(thrownAt > punchAt + .5, 'the throw follows completed punch recovery');
    assert.ok(landed, 'the player lands, takes impact damage, and leaves the linked states');
    assert.equal(foe.grabTarget, null);
    assert.equal(p.grabbedBy, null);
    assert.ok(p.hp > 0);
  });
}

for (const element of ['earth', 'air']) {
  test(`a normal survival spawn can close a real dizzy opening against an idle ${element} player`, () => {
    // Keep the actual menu defaults, spawn locations and health. Starting an
    // opponent already at grabbing distance missed this approach regression.
    const game = new Game({ element, mode: 'survival', difficulty: 'normal', enemyCount: 1, seed: 61721 });
    game.start();
    let dizzyAction = null, grabbed = false, punched = false, thrown = false;
    for (let frame = 0; frame < 120 * 8 && !thrown; frame++) {
      game.tick({}, 1 / 120);
      const p = game.state.player, foe = game.state.enemies[0];
      if (p.hitType === 'dizzy' && p.stun > 0 && foe.action?.kind === 'melee') dizzyAction = foe.action;
      if (p.grabbedBy === foe.id && !grabbed) {
        assert.ok(dizzyAction, 'a fresh opponent reaches and stuns the player through normal combat');
        assert.ok(dizzyAction.t >= dizzyAction.duration, 'closing the gap does not cancel jab recovery');
        grabbed = true;
      }
      punched ||= foe.action?.kind === 'grabPunch';
      thrown ||= p.thrown != null;
    }
    assert.ok(grabbed, 'the opponent must not stall on the edge of its grabbing range');
    assert.ok(punched);
    assert.ok(thrown, 'a complete enemy grapple sequence is reachable from a fresh run');
    assert.equal(game.state.lives, 3, 'the first sequence happens before a player respawn');
  });
}
