import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ELEMENTS, WIDTH } from '../src/data.js';

const dt = 1 / 120;
function advance(game, seconds, input = {}) {
  for (let i = 0; i < seconds / dt; i++) game.tick(input, dt);
}
function journey(config = {}) {
  const game = new Game({ mode: 'story', enemyCount: 1, ...config });
  game.start();
  return game;
}
function clear(game) {
  game.state.enemies.forEach(e => { e.hp = 0; });
  game.tick({}, dt);
}
function walkToNext(game) {
  const stage = game.state.stage, encounter = stage.encounter;
  for (let i = 0; i < 1800 && game.state.stage === stage &&
    stage.encounter === encounter && game.state.status === 'playing'; i++) {
    game.tick({ right: true, run: true }, dt);
  }
}

test('Journey previews its first stage independently of the saved arena selection', () => {
  const game = new Game({ mode: 'story', arena: 'fire' });
  assert.equal(game.state.arena, 'air');
  assert.equal(game.state.settings.arena, 'fire', 'the separate arena preference stays available');
  game.start();
  assert.equal(game.state.arena, 'air');
});

test('Journey gates forward progress until the crowd is defeated, then scrolls on foot', () => {
  const game = journey(), s = game.state;
  s.enemies[0].frozen = 100;
  advance(game, 7, { right: true, run: true });
  assert.equal(s.stage.phase, 'fight');
  assert.equal(s.stage.encounter, 0);
  assert.equal(s.cameraX, 0);
  assert.ok(s.player.x <= s.bounds.right - s.player.w / 2);
  clear(game);
  const x = s.player.x;
  advance(game, 3);
  assert.equal(s.stage.phase, 'advance', 'time alone cannot start the next fight');
  assert.equal(s.stage.encounter, 0);
  assert.ok(Math.abs(s.player.x - x) < 40, 'clearing never teleports the player');
  advance(game, .3, { right: true });
  assert.ok(s.cameraX > 0, 'camera follows traversal');
  walkToNext(game);
  assert.equal(s.stage.encounter, 1);
  assert.equal(s.stage.phase, 'fight');
  assert.ok(s.bounds.left > 1000 && s.player.x > 1500);
  assert.ok(s.player.x - s.cameraX > 350 && s.player.x - s.cameraX < 650);
  assert.ok(s.enemies.every(e => e.x > s.bounds.left && e.x < s.bounds.right));
});

test('four stages each require two crowd encounters, a guardian, and walking through the exit', () => {
  const game = journey(), s = game.state;
  const visited = [];
  for (const element of ['air', 'water', 'earth', 'fire']) {
    assert.equal(s.arena, element);
    assert.equal(s.stage.chapter, visited.length / 3 + 1);
    assert.equal(s.cameraX, 0);
    for (let encounter = 0; encounter < 3; encounter++) {
      assert.equal(s.stage.encounter, encounter);
      assert.equal(s.enemies.length, 1);
      assert.equal(s.enemies[0].type, encounter === 2 ? 'boss' : 'fighter');
      assert.equal(s.enemies[0].element, element);
      if (encounter < 2) assert.equal(s.enemies[0].maxHp, ELEMENTS[element].hp);
      visited.push(`${element}:${encounter}`);
      clear(game);
      assert.equal(s.stage.phase, encounter === 2 ? 'exit' : 'advance');
      advance(game, 3);
      assert.equal(s.status, 'playing', 'killing the boss does not auto-skip the exit');
      walkToNext(game);
    }
  }
  assert.equal(visited.length, 12);
  assert.equal(s.status, 'won');
  assert.equal(s.wave, 4);
  assert.equal(s.kills, 12);
});

test('enemy count includes the boss and applies to every scrolling encounter', () => {
  for (const count of [1, 3, 12]) {
    const game = journey({ enemyCount: count });
    for (let encounter = 0; encounter < 3; encounter++) {
      assert.equal(game.state.enemies.length, count);
      assert.equal(game.state.enemies.filter(e => e.type === 'boss').length, encounter === 2 ? 1 : 0);
      clear(game);
      walkToNext(game);
    }
  }
});

test('respawning returns to the active checkpoint with camera and surviving enemies intact', () => {
  const game = journey(), s = game.state;
  clear(game); walkToNext(game);
  clear(game); walkToNext(game);
  const boss = s.enemies[0];
  boss.hp -= 40;
  const before = boss.hp;
  s.player.hp = 0;
  game.tick({}, dt);
  assert.equal(s.lives, 2);
  assert.equal(s.player.x, s.stage.checkpointX);
  assert.equal(s.player.hp, s.player.maxHp);
  assert.equal(s.stage.encounter, 2);
  assert.equal(boss.hp, before);
  assert.ok(s.player.x > 2500);
  assert.ok(s.player.x > s.cameraX && s.player.x < s.cameraX + WIDTH);
  assert.equal(s.stage.phase, 'fight');
});

test('later encounters support walking, rolling and projectiles beyond the old arena wall', () => {
  const game = journey({ element: 'fire' }), s = game.state, p = s.player;
  clear(game); walkToNext(game);
  s.enemies[0].frozen = 100;
  const start = p.x;
  advance(game, .5, { right: true });
  assert.ok(p.x > start + 50 && p.x > 1250);
  Object.assign(p, { knockdown: .55, downTime: .1 });
  game.tick({ dash: true, attackDirection: 1 }, dt);
  assert.ok(p.recoveryRoll);
  const before = p.x;
  advance(game, .45);
  assert.ok(p.x > before + 100);
  game.tick({ special: true }, dt);
  advance(game, .25);
  assert.ok(s.projectiles.some(shot => shot.x > 1250 && shot.team === 'player'));
  assert.ok(s.weapons.every(w => w.x >= s.bounds.left && w.x <= s.bounds.right));
});

test('clear rewards apply once and pausing freezes traversal and stage progress', () => {
  const game = journey(), s = game.state;
  s.player.hp = 30;
  clear(game);
  const hp = s.player.hp;
  advance(game, 4);
  assert.equal(s.player.hp, hp);
  advance(game, 1, { right: true });
  game.togglePause();
  const before = structuredClone(s);
  advance(game, 2, { right: true, run: true });
  assert.deepEqual(s, before);
});

test('defeating the guardian at the right wall still requires walking through the opened exit', () => {
  const game = journey(), s = game.state;
  clear(game); walkToNext(game);
  clear(game); walkToNext(game);
  s.player.x = s.bounds.right - s.player.w / 2;
  s.player.vx = 0;
  clear(game);
  advance(game, 3);
  assert.equal(s.wave, 1);
  assert.equal(s.stage.phase, 'exit');
  assert.ok(s.stage.nextX > s.player.x, 'the exit was unreachable behind the closed boss gate');
  walkToNext(game);
  assert.equal(s.wave, 2);
});

test('jumping through the next checkpoint starts its encounter without resetting the jump', () => {
  const game = journey(), s = game.state;
  clear(game);
  Object.assign(s.player, { x: s.stage.nextX - 1, vx: 200, z: 80, y: s.player.depth - 80,
    vy: -100, grounded: false, jumps: 1 });
  game.tick({ right: true }, dt);
  assert.equal(s.stage.encounter, 1);
  assert.equal(s.stage.phase, 'fight');
  assert.ok(s.player.z > 80 && !s.player.grounded);
  assert.equal(s.player.jumps, 1);
});

test('arena modes retain a single fixed screen and their existing progression', () => {
  for (const mode of ['survival', 'training', 'tournament', 'challenge']) {
    const game = new Game({ mode });
    game.start();
    assert.equal(game.state.stage, null);
    assert.equal(game.state.cameraX, 0);
    assert.deepEqual(game.state.bounds, { left: 30, right: 1250 });
  }
});
