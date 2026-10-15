import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { BOSSES, BossDirector, isCommitted } from '../src/bosses.js';

function arena(element = 'fire', difficulty = 'normal', distance = 120) {
  const game = new Game({ element: 'air', mode: 'survival', difficulty, seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], bossHazards: [], waveDelay: 999 });
  const player = game.state.player;
  Object.assign(player, { x: 600 + distance, depth: 540, y: 540, z: 0,
    hp: 1000, maxHp: 1000, invulnerable: 0, facing: -1, grounded: true });
  const boss = game.spawnEnemy({ boss: true, element, x: 600, depth: 540 });
  Object.assign(boss, { invulnerable: 0, aiTimer: 0, energy: 100, facing: 1 });
  const director = new BossDirector();
  return { game, player, boss, director };
}

function advanceHazards(game, director, seconds) {
  for (let frame = 0; frame < Math.ceil(seconds * 120); frame++) director.updateHazards(game, 1 / 120);
}

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} boss chooses two distinct attacks from visible combat geometry`, () => {
    const moves = new Set();
    for (const distance of [120, 280]) {
      const { game, player, boss, director } = arena(element, 'hard', distance);
      if (element === 'air' && distance === 120) player.action = { kind: 'melee' };
      assert.ok(director.tryStart(game, boss));
      moves.add(boss.bossAction.move);
      assert.ok(boss.energy < 100, 'boss techniques spend a real resource');
      assert.ok(isCommitted(boss, game.state), 'warnings reserve the attack slot before damage');
      assert.ok(game.state.bossHazards.every(h => h.delay >= .5 && h.damage <= 25));
      if (boss.bossAction.move === 'stone-columns') {
        assert.ok(game.state.bossHazards.every(h => h.delay >= .8), 'vertical pillars retain a readable Hard telegraph');
      }
    }
    assert.equal(moves.size, 2);
    assert.deepEqual([...moves].sort(), BOSSES[element].moves.slice(0, 2).sort());
  });
}

test('a committed warning does not track the player after they sidestep', () => {
  const { game, player, boss, director } = arena('fire', 'normal', 260);
  assert.ok(director.tryStart(game, boss));
  const hazard = game.state.bossHazards[0];
  const geometry = { x: hazard.x, depth: hazard.depth, rx: hazard.rx, rd: hazard.rd };
  player.depth += 90;
  const hp = player.hp;
  advanceHazards(game, director, 1.2);
  assert.equal(player.hp, hp, 'leaving the marked lane avoids actual damage');
  assert.deepEqual({ x: hazard.x, depth: hazard.depth, rx: hazard.rx, rd: hazard.rd }, geometry);
});

test('a grounded quake waits out its full warning, hits once, and can be jumped', () => {
  for (const airborne of [false, true]) {
    const { game, player, boss, director } = arena('earth');
    assert.ok(director.tryStart(game, boss));
    const warning = boss.bossAction.windup;
    const hp = player.hp;
    if (airborne) { player.z = 65; player.grounded = false; }
    advanceHazards(game, director, warning - .04);
    assert.equal(player.hp, hp, 'telegraph geometry deals no early damage');
    advanceHazards(game, director, .1);
    if (airborne) assert.equal(player.hp, hp, 'jump height clears the ground wave');
    else {
      assert.ok(player.hp < hp);
      const after = player.hp;
      player.invulnerable = 0;
      advanceHazards(game, director, .1);
      assert.equal(player.hp, after, 'an active wave cannot hit the same body each update');
    }
  }
});

test('a frontal lane technique uses ordinary guard damage reduction', () => {
  const losses = [];
  for (const guard of [false, true]) {
    const { game, player, boss, director } = arena('water', 'normal', 280);
    player.guard = guard;
    player.parryTimer = 0;
    director.tryStart(game, boss);
    const hp = player.hp;
    advanceHazards(game, director, 1);
    losses.push(hp - player.hp);
  }
  assert.ok(losses[0] > 0);
  assert.ok(losses[1] > 0 && losses[1] <= losses[0] * .21);
});

test('interrupting a windup cancels unreleased warnings but not an already emitted wave', () => {
  const { game, boss, director } = arena();
  director.tryStart(game, boss);
  director.cancel(game, boss);
  assert.equal(boss.bossAction, null);
  assert.equal(game.state.bossHazards.length, 0);
  assert.ok(!isCommitted(boss, game.state));
  boss.bossMoveAfter = 0;
  director.tryStart(game, boss);
  advanceHazards(game, director, boss.bossAction.windup + .01);
  const released = game.state.bossHazards[0];
  assert.ok(released.released);
  director.cancel(game, boss);
  assert.ok(game.state.bossHazards.includes(released));
  assert.ok(isCommitted(boss, game.state));
});

test('boss death or player defeat removes warnings and active hazards', () => {
  for (const loser of ['boss', 'player']) {
    const state = arena();
    state.director.tryStart(state.game, state.boss);
    state[loser].hp = 0;
    state.director.updateHazards(state.game, 1 / 120);
    assert.equal(state.game.state.bossHazards.length, 0);
  }
});

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} enters a named second phase once, without healing, then uses a distinct signature`, () => {
    const { game, boss, director } = arena(element);
    boss.hp = boss.maxHp * .5;
    const hp = boss.hp;
    assert.ok(director.updatePhase(game, boss));
    assert.equal(boss.bossAction.stage, 'transition');
    assert.equal(boss.bossAction.name, BOSSES[element].phases[1]);
    assert.equal(boss.bossPhase, 2);
    assert.equal(boss.hp, hp);
    assert.equal(game.state.bossHazards.length, 0, 'the phase announcement is not an unmarked attack');
    for (let frame = 0; frame < 110; frame++) director.updateFighter(game, boss, 1 / 120);
    assert.equal(boss.bossAction, null);
    game.state.time += 1.2;
    assert.ok(director.tryStart(game, boss));
    assert.equal(boss.bossAction.move, BOSSES[element].moves[2]);
    assert.ok(game.state.bossHazards.length >= 3);
    assert.ok(new Set(game.state.bossHazards.map(h => h.delay)).size >= 3,
      'the phase technique unfolds in readable steps');
    assert.equal(director.updatePhase(game, boss), false);
    assert.equal(boss.hp, hp);
  });
}

test('phase changes wait for existing commitments, hit lag, stun and airborne recovery', () => {
  for (const patch of [{ action: { kind: 'melee' } }, { hitLag: .1 }, { stun: .2 },
    { grounded: false, z: 50 }, { frozen: .2 }]) {
    const { game, boss, director } = arena();
    boss.hp = boss.maxHp * .4;
    Object.assign(boss, patch);
    assert.equal(director.updatePhase(game, boss), false);
    assert.equal(boss.bossPhase, 1);
  }
});

test('Earth commits armor to startup and exposes a full unarmored recovery window', () => {
  const { game, boss, director } = arena('earth');
  director.tryStart(game, boss);
  const action = boss.bossAction;
  director.updateFighter(game, boss, .1);
  assert.ok(boss.armor);
  director.updateFighter(game, boss, action.activeUntil);
  assert.equal(action.stage, 'recovery');
  assert.equal(boss.armor, false);
  assert.ok(action.duration - action.t > .8, 'a heavy commitment leaves meaningful time to retaliate');
  assert.equal(director.tryStart(game, boss), false, 'the boss cannot cancel recovery into another technique');
});

test('boss techniques respect energy, incapacitation and their reuse timer', () => {
  for (const patch of [{ energy: 0 }, { stun: .4 }, { grounded: false }, { bossMoveAfter: 10 }]) {
    const { game, boss, director } = arena();
    Object.assign(boss, patch);
    assert.equal(director.tryStart(game, boss), false);
    assert.equal(game.state.bossHazards.length, 0);
  }
});

test('contact hit lag pauses an armored windup and its warning together', () => {
  const { game, boss, director } = arena('earth');
  director.tryStart(game, boss);
  const action = boss.bossAction, warning = game.state.bossHazards[0];
  const delay = warning.delay;
  boss.hitLag = .1;
  director.updateFighter(game, boss, .05);
  director.updateHazards(game, .05);
  assert.equal(boss.bossAction, action);
  assert.equal(action.t, 0);
  assert.equal(warning.delay, delay, 'the attack cannot release while its owner remains frozen in contact');
  boss.hitLag = 0;
  director.updateFighter(game, boss, .05);
  director.updateHazards(game, .05);
  assert.equal(action.t, .05);
  assert.equal(warning.delay, delay - .05);
});

for (const element of ['air', 'water', 'earth', 'fire']) {
  test(`${element} starts its techniques and second-phase signature through the real game loop`, () => {
    const { game, boss } = arena(element, 'normal', 120);
    let firstMove = null;
    for (let frame = 0; frame < 120 * 4 && !firstMove; frame++) {
      game.tick({}, 1 / 120);
      firstMove = boss.bossAction?.move;
    }
    assert.ok(BOSSES[element].moves.includes(firstMove));
    boss.hp = boss.maxHp * .45;
    const hp = boss.hp;
    let announced = false, signature = false;
    for (let frame = 0; frame < 120 * 9 && !signature; frame++) {
      game.tick({}, 1 / 120);
      announced ||= boss.bossAction?.stage === 'transition';
      signature ||= boss.bossAction?.move === BOSSES[element].moves[2];
    }
    assert.ok(announced && signature, 'ordinary AI scheduling reaches the phase announcement and its new move');
    assert.equal(boss.hp, hp);
  });
}

test('a boss warning and active hazard keep their place in the shared crowd attack limit', () => {
  const { game, boss, player } = arena('fire', 'normal', 120);
  player.invulnerable = 999;
  for (const [index, element] of ['air', 'water', 'earth', 'fire'].entries()) {
    const foe = game.spawnEnemy({ element, x: index % 2 ? 780 : 650, depth: 530 + index * 8 });
    foe.aiTimer = 0;
  }
  let sawBoss = false;
  for (let frame = 0; frame < 120 * 8; frame++) {
    game.tick({}, 1 / 120);
    sawBoss ||= isCommitted(boss, game.state);
    const committed = game.state.enemies.filter(e => e.action || e.buffer || e.grabTarget != null ||
      e.ai?.airChasing || isCommitted(e, game.state));
    assert.ok(committed.length <= 2, 'boss hazards cannot bypass Normal’s two simultaneous attackers');
  }
  assert.ok(sawBoss);
});

test('a lethal boss pulse clears the entire technique before the player respawns', () => {
  const { game, player, boss } = arena('fire');
  game.bosses.tryStart(game, boss);
  const hazard = game.state.bossHazards[0];
  Object.assign(player, { x: hazard.x, depth: hazard.depth, y: hazard.depth, hp: 1 });
  const lives = game.state.lives;
  for (let frame = 0; frame < 180 && game.state.lives === lives; frame++) game.tick({}, 1 / 120);
  assert.equal(game.state.lives, lives - 1);
  assert.ok(player.hp > 0, 'the normal life system has respawned the player');
  assert.equal(game.state.bossHazards.length, 0, 'no last active pulse survives into the next life');
  assert.equal(boss.bossAction, null);
});

test('a real guarded hit does not cancel Water’s committed returning tide', () => {
  const { game, boss, player } = arena('water');
  game.bosses.tryStart(game, boss);
  const action = boss.bossAction;
  game.tick({}, 1 / 120);
  assert.ok(boss.guard);
  game.damage(boss, 10, -1, player, { element: 'air', knockback: 30, contact: true, light: true });
  assert.equal(boss.bossAction, action);
  let released = false;
  for (let frame = 0; frame < 160; frame++) {
    game.tick({}, 1 / 120);
    released ||= game.state.bossHazards.some(h => h.ownerId === boss.id && h.released);
  }
  assert.ok(released, 'blocking the bait must lead into the promised tide attack');
});

test('Air retreats during its counter warning instead of standing still until release', () => {
  const { game, boss, player, director } = arena('air');
  player.action = { kind: 'melee' };
  director.tryStart(game, boss);
  const start = boss.x;
  director.updateFighter(game, boss, boss.bossAction.windup / 2);
  assert.equal(boss.bossAction.stage, 'windup');
  assert.ok(boss.x < start - 45);
  assert.equal(game.state.bossHazards[0].x, start, 'the promised counter footprint remains at the original stance');
});

test('Fire sweep has one startup poise contact and no armor during its punishable recovery', () => {
  const { game, boss, director } = arena('fire');
  director.tryStart(game, boss);
  const action = boss.bossAction;
  assert.equal(action.move, 'flame-sweep');
  assert.equal(action.poise, 1);
  director.updateFighter(game, boss, .1);
  assert.ok(boss.armor);
  action.poiseHits = 1;
  director.updateFighter(game, boss, .01);
  assert.equal(boss.armor, false, 'a second light strike is allowed to interrupt');
  action.poiseHits = 0;
  director.updateFighter(game, boss, action.activeUntil);
  assert.equal(action.stage, 'recovery');
  assert.equal(boss.armor, false);
  assert.ok(action.duration - action.t >= .75, 'the close sweep leaves a visible retaliation window');
});

test('a phase announcement waits while other enemies fill the attack limit', () => {
  const { game, boss, director } = arena('earth', 'normal');
  boss.hp = boss.maxHp * .45;
  const others = ['air', 'fire'].map(element => game.spawnEnemy({ element, x: 770, depth: 540 }));
  for (const other of others) game.startAction(other, 'melee');
  assert.equal(director.updatePhase(game, boss), false);
  game.endAction(others[0]);
  assert.equal(director.updatePhase(game, boss), true, 'the transition begins as soon as a commitment slot opens');
});

test('Fire startup absorbs one real light hit, while a second light hit or a heavy hit interrupts', () => {
  for (const heavy of [false, true]) {
    const { game, boss, player } = arena('fire');
    game.bosses.tryStart(game, boss);
    const action = boss.bossAction;
    game.damage(boss, 10, -1, player, { element: 'air', contact: true, light: !heavy, heavy });
    if (!heavy) {
      assert.equal(boss.bossAction, action);
      assert.equal(action.poiseHits, 1);
      for (let frame = 0; frame < 90 && (boss.hitLag > 0 || boss.invulnerable > 0); frame++) game.tick({}, 1 / 120);
      assert.equal(boss.bossAction?.stage, 'windup');
      game.damage(boss, 10, -1, player, { element: 'air', contact: true, light: true });
    }
    assert.equal(boss.bossAction, null);
    assert.equal(game.state.bossHazards.length, 0, 'an earned interruption removes the unfinished sweep');
  }
});
