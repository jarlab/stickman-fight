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
  for (const wave of [1, 3]) {
    const game = new Game({ element: 'fire', mode: 'survival', difficulty: 'crazy', enemyCount: 12, seed: 42 });
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

const difficulties = ['easy', 'normal', 'hard', 'crazy'];

test('the same enemy inputs produce identical movement, health and damage on every difficulty', () => {
  for (const element of elements) {
    const results = difficulties.map(difficulty => {
      const { game, foe } = arena(element, difficulty);
      foe.x = 250;
      const positions = [];
      // Supply identical visible decisions directly: this isolates the shared
      // movement rules from the controller's deliberately different tactics.
      for (const input of [{ right: true }, { right: true, run: true }, { up: true },
        { right: true, down: true, run: true }, { dash: true, right: true }]) {
        for (let frame = 0; frame < 36; frame++) {
          game.updateFighter(foe, { ...input, dash: input.dash && frame === 0 }, STEP);
        }
        positions.push([foe.x, foe.depth, foe.z, foe.vx, foe.vDepth, foe.energy]);
      }
      const player = game.state.player;
      player.invulnerable = 0;
      const hp = player.hp;
      assert.equal(game.damage(player, 20, -1, foe, { light: true, knockback: 0, lift: 0 }), true);
      return { positions, maxHp: foe.maxHp, damage: hp - player.hp };
    });
    assert.ok(results[0].positions[0][0] > 250 && results[0].damage > 0);
    for (let index = 1; index < results.length; index++) {
      assert.deepEqual(results[index], results[0], `${element}: ${difficulties[index]} changes decisions, not physical advantages`);
    }
  }
});

test('difficulty never shortens an ordinary move, its attack cooldown or its completed recovery', () => {
  for (const element of elements) {
    for (const variant of ['melee', 'launcher', 'aerial', 'special', 'burst']) {
      const results = difficulties.map(difficulty => {
        const { game, foe } = arena(element, difficulty);
        foe.x = 150;
        if (variant === 'aerial') Object.assign(foe, { grounded: false, z: 500, y: 40 });
        const kind = ['launcher', 'aerial'].includes(variant) ? 'melee' : variant;
        assert.equal(game.startAction(foe, kind, variant === 'launcher'), true);
        const action = foe.action;
        const timing = { windup: action.windup, activeUntil: action.activeUntil,
          duration: action.duration, cooldowns: { ...foe.cooldowns }, tell: foe.tell };
        let frames = 0;
        while (foe.action === action && frames < 240) {
          game.updateFighter(foe, {}, STEP);
          frames++;
        }
        assert.notEqual(foe.action, action, 'the committed move actually finishes');
        assert.ok(action.t >= action.duration, 'a missed move retains its full recovery');
        return { ...timing, frames };
      });
      for (let index = 1; index < results.length; index++) {
        assert.deepEqual(results[index], results[0], `${element} ${variant}: ${difficulties[index]} keeps the same move timing`);
      }
    }
  }
});

test('boss health, damage, warnings and technique reuse remain equal across difficulties and phases', () => {
  for (const element of elements) {
    for (const scenario of [{ distance: 120, phase: 1 }, { distance: 280, phase: 1 }, { distance: 120, phase: 2 }]) {
      const results = difficulties.map(difficulty => {
        const { game, foe: boss } = arena(element, difficulty, true);
        game.state.player.x = boss.x + scenario.distance;
        boss.bossPhase = scenario.phase;
        if (element === 'air' && scenario.distance === 120) game.startAction(game.state.player, 'melee');
        assert.equal(game.bosses.tryStart(game, boss), true);
        const action = boss.bossAction;
        const player = game.state.player;
        player.invulnerable = 0;
        const hp = player.hp;
        assert.equal(game.damage(player, 20, -1, boss, { light: true, knockback: 0, lift: 0 }), true);
        return { hp: boss.maxHp, damage: hp - player.hp, move: action.move,
          windup: action.windup, activeUntil: action.activeUntil, duration: action.duration,
          nextTechniqueAt: boss.bossMoveAfter,
          hazards: game.state.bossHazards.map(h => ({ delay: h.delay, life: h.life, damage: h.damage,
            x: h.x, depth: h.depth, rx: h.rx, rd: h.rd, height: h.height })) };
      });
      assert.ok(results[0].hazards.length > 0 && results[0].damage > 0);
      for (let index = 1; index < results.length; index++) {
        assert.deepEqual(results[index], results[0], `${element} phase ${scenario.phase}: ${difficulties[index]} keeps honest boss counterplay`);
      }
    }
  }
});
