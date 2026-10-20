import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

for (const mode of ['survival', 'training', 'tournament', 'story', 'challenge']) {
  test(`${mode} respects the selected total enemy count, including guardians`, () => {
    for (const enemyCount of [1, 3, 12]) {
      const game = new Game({ mode, enemyCount });
      game.start();
      for (let wave = 1; wave <= (mode === 'training' ? 1 : 3); wave++) {
        assert.equal(game.state.enemies.length, enemyCount);
        if (mode === 'tournament' || mode === 'survival' && wave === 3) {
          assert.equal(game.state.enemies.filter(e => e.type === 'boss').length, 1);
        }
        if (wave < 3 && mode !== 'training') { game.state.enemies = []; game.beginWave(); }
      }
    }
  });
}
test('Auto keeps existing wave sizes; malformed enemy counts fall back safely', () => {
  for (const enemyCount of ['auto', undefined, null, '3', -1, 0, 13, 1.5, Infinity]) {
    const game = new Game({ enemyCount }); game.start();
    assert.equal(game.state.settings.enemyCount, 'auto');
    assert.equal(game.state.enemies.length, 5);
  }
});
test('training replenishes defeated partners to the requested count', () => {
  const game = new Game({ mode: 'training', enemyCount: 3 }); game.start();
  game.state.enemies[0].hp = 0;
  game.tick({}, 1 / 120);
  assert.equal(game.state.enemies.length, 3);
  assert.ok(game.state.enemies.every(e => e.hp > 0 && e.type === 'dummy'));
});
test('training replacements use the vacated position instead of stacking on a survivor', () => {
  const game = new Game({ mode: 'training', enemyCount: 4 }); game.start();
  game.state.enemies[0].hp = 0;
  game.tick({}, 1 / 120);
  const occupied = game.state.enemies.map(e => `${Math.round(e.x)},${Math.round(e.depth)}`);
  assert.equal(new Set(occupied).size, 4);
});
