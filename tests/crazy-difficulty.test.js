import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ELEMENTS, MODES } from '../src/data.js';
import { BOSSES, isCommitted } from '../src/bosses.js';

const STEP = 1 / 120;
const elements = Object.keys(ELEMENTS);
const committed = game => game.state.enemies.filter(e =>
  e.action || e.buffer || e.grabTarget != null || e.ai?.airChasing || isCommitted(e, game.state));

function assertFinite(game) {
  for (const f of [game.state.player, ...game.state.enemies]) {
    for (const key of ['hp', 'maxHp', 'energy', 'x', 'depth', 'z', 'vx', 'vy', 'vDepth']) {
      assert.ok(Number.isFinite(f[key]), `${f.element} ${key} remains finite`);
    }
  }
}

function arena(element, difficulty, boss = false) {
  const game = new Game({ element: 'air', mode: 'survival', difficulty, seed: 42 });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], weapons: [], waveDelay: 999 });
  Object.assign(game.state.player, { x: boss ? 720 : 640, depth: 540, y: 540, invulnerable: 999 });
  const foe = game.spawnEnemy({ element, boss, x: boss ? 600 : 570, depth: 540 });
  foe.aiTimer = 0;
  return { game, foe };
}

test('Crazy runs every mode and keeps ordinary opponents at playable elemental health', () => {
  for (const mode of Object.keys(MODES)) {
    for (const element of elements) {
      const game = new Game({ element, mode, difficulty: 'crazy', enemyCount: 4, seed: 42 });
      game.start();
      assert.equal(game.state.settings.difficulty, 'crazy', `${mode} must not fall back to Normal`);
      assert.equal(game.state.player.maxHp, ELEMENTS[element].hp);
      // All four ordinary body types retain health parity, even in a mode whose
      // native opening encounter contains only a guardian or training dummies.
      for (const type of elements) {
        assert.equal(game.makeFighter('enemy', type, 100, 540).maxHp, ELEMENTS[type].hp);
      }
      for (const enemy of game.state.enemies.filter(e => e.type === 'fighter')) {
        assert.equal(enemy.maxHp, ELEMENTS[enemy.element].hp);
      }
      game.state.player.invulnerable = 999;
      for (let frame = 0; frame < 360; frame++) {
        game.tick({ right: frame < 120, down: frame >= 120 && frame < 240,
          jump: frame === 120, attack: frame % 48 === 0 }, STEP);
        assertFinite(game);
      }
      assert.equal(game.state.status, 'playing');
    }
  }
});

test('natural twelve-enemy Crazy waves reach four commitments without exceeding them, including a boss', () => {
  for (const [wave, seed] of [[1, 1], [3, 42]]) {
    const game = new Game({ element: 'fire', mode: 'survival', difficulty: 'crazy', enemyCount: 12, seed });
    game.state.wave = wave - 1;
    game.start();
    game.state.player.invulnerable = 999;
    let peak = 0, bossTechnique = false;
    const attackers = new Set();
    for (let frame = 0; frame < 120 * 25; frame++) {
      game.tick({}, STEP);
      const active = committed(game);
      peak = Math.max(peak, active.length);
      assert.ok(active.length <= 4, `wave ${wave} has ${active.length} simultaneous commitments`);
      for (const foe of active) attackers.add(foe.id);
      bossTechnique ||= game.state.enemies.some(e => e.type === 'boss' && isCommitted(e, game.state));
    }
    assert.equal(peak, 4, `wave ${wave} actually uses Crazy's fourth attack slot`);
    assert.ok(attackers.size >= 8, 'the crowd rotates attackers rather than permanently starving its reserves');
    if (wave === 3) assert.ok(bossTechnique, 'the guardian participates through its real technique scheduler');
    assertFinite(game);
  }
});

test('each Crazy guardian naturally attacks, changes phase, and uses its signature alongside a full crowd', () => {
  for (const element of elements) {
    const { game, foe: boss } = arena(element, 'crazy', true);
    for (const [index, type] of elements.entries()) {
      const add = game.spawnEnemy({ element: type, x: index % 2 ? 790 : 650, depth: 520 + index * 12 });
      add.aiTimer = 0;
    }
    let firstMove = false, announced = false, signature = false, peak = 0;
    for (let frame = 0; frame < 120 * 20; frame++) {
      if (frame === 480) boss.hp = boss.maxHp * .45;
      game.tick({}, STEP);
      const count = committed(game).length;
      peak = Math.max(peak, count);
      assert.ok(count <= 4, `${element} warnings and phase announcements share the crowd limit`);
      firstMove ||= frame < 480 && BOSSES[element].moves.includes(boss.bossAction?.move);
      announced ||= boss.bossAction?.stage === 'transition';
      signature ||= boss.bossAction?.move === BOSSES[element].moves[2];
    }
    assert.ok(firstMove && announced && signature, `${element} reaches ordinary attacks and its second-phase signature`);
    assert.equal(boss.bossPhase, 2);
    assert.equal(boss.hp, boss.maxHp * .45, 'changing phase does not heal the guardian');
    assert.ok(peak >= 3, 'Crazy must not fall back to Normal crowd scheduling around a boss');
    assertFinite(game);
  }
});

test('Crazy reacts and resumes pressure sooner than Hard while completing each missed strike', () => {
  const results = {};
  for (const difficulty of ['hard', 'crazy']) {
    const { game, foe } = arena('fire', difficulty);
    game.random = () => .5;
    let previous = null;
    const starts = [];
    for (let frame = 0; frame < 360 && starts.length < 3; frame++) {
      game.tick({}, STEP);
      if (foe.action && foe.action !== previous) {
        starts.push({ time: game.state.time, action: foe.action });
      }
      previous = foe.action;
    }
    assert.equal(starts.length, 3, `${difficulty} sustains actual melee pressure`);
    assert.ok(starts[0].time > STEP, 'newly perceived proximity retains a reaction delay');
    for (let index = 0; index < 2; index++) {
      assert.equal(starts[index].action.connected, false, 'the protected target makes this a whiff-recovery comparison');
      assert.ok(starts[index + 1].time - starts[index].time >= starts[index].action.duration - STEP,
        'higher difficulty cannot skip the visible recovery of a missed attack');
    }
    results[difficulty] = starts.map(s => s.time);
  }
  assert.ok(results.crazy[0] < results.hard[0], 'Crazy initiates its first real strike sooner');
  assert.ok(results.crazy[1] - results.crazy[0] < results.hard[1] - results.hard[0],
    'Crazy re-engages sooner after the same missed strike');
});
