import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardInput } from '../src/input.js';
import { Game } from '../src/engine.js';

test('an attack is a press edge, with no held-key or browser-repeat auto attack', () => {
  const keys = new KeyboardInput();
  keys.press('KeyJ', 0);
  assert.equal(keys.read().attack, true);
  assert.equal(keys.read().attack, false);
  keys.press('KeyJ', 500, { repeat: true });
  keys.press('KeyJ', 600);
  assert.equal(keys.read().attack, false);
  keys.release('KeyJ');
  keys.press('KeyJ', 700);
  assert.equal(keys.read().attack, true);
});

for (const [direction, action, facing, depth] of [
  ['KeyD', 'special', 1, 0], ['ArrowLeft', 'special', -1, 0], ['KeyW', 'burst', 0, -1],
]) {
  test(`guard → ${direction} → attack remains valid across pauses between presses`, () => {
    const keys = new KeyboardInput();
    keys.press('KeyI', 0);
    keys.release('KeyI');
    keys.read();
    keys.press(direction, 3000);
    keys.release(direction);
    keys.read();
    keys.press('KeyJ', 10000);
    const input = keys.read();
    assert.equal(input[action], true);
    assert.equal(input.attack, false);
    assert.equal(input.command, true);
    assert.equal(input.attackDirection, facing);
    assert.equal(input.attackDepthDirection, depth);
    assert.equal(keys.read()[action], false, 'one completed command casts once');
  });
}

test('an incompatible gameplay press cancels the pending command', () => {
  for (const interrupt of ['KeyS', 'Space', 'ShiftLeft', 'KeyK', 'KeyL', 'KeyE', 'KeyU']) {
    const keys = new KeyboardInput();
    keys.press('KeyI', 0);
    keys.release('KeyI');
    keys.press('KeyD', 10);
    keys.release('KeyD');
    keys.press(interrupt, 20);
    keys.release(interrupt);
    keys.read();
    keys.press('KeyJ', 30);
    const input = keys.read();
    assert.equal(input.attack, true, `${interrupt} breaks the command`);
    assert.equal(input.special, false);
    assert.equal(input.burst, false);
  }
});

test('a second direction invalidates a command instead of changing its destination', () => {
  const keys = new KeyboardInput();
  keys.press('KeyI', 0);
  keys.release('KeyI');
  keys.press('KeyD', 10);
  keys.release('KeyD');
  keys.press('KeyA', 20);
  keys.press('KeyJ', 30);
  const input = keys.read();
  assert.equal(input.attack, true);
  assert.equal(input.special, false);
});

test('a fresh guard press restarts a partial command', () => {
  const keys = new KeyboardInput();
  keys.press('KeyI', 0);
  keys.release('KeyI');
  keys.press('KeyD', 10);
  keys.release('KeyD');
  keys.press('KeyI', 20);
  keys.press('KeyW', 30);
  keys.press('KeyJ', 40);
  const input = keys.read();
  assert.equal(input.burst, true);
  assert.equal(input.special, false);
  assert.equal(input.guard, true, 'command recognition preserves the physical guard key');
  assert.equal(keys.read().guard, true, 'guard remains physically held afterward');
});

test('attack facing survives a quick direction release and opposite movement before the tick', () => {
  const keys = new KeyboardInput();
  keys.press('KeyD', 0);
  keys.press('KeyJ', 10);
  keys.release('KeyD');
  keys.press('KeyA', 20);
  const input = keys.read();
  assert.equal(input.left, true);
  assert.equal(input.right, false);
  assert.equal(input.attackDirection, 1);
  assert.equal(keys.read().attackDirection, undefined, 'the old facing does not leak into another tick');
});

test('simultaneous movement actions and attacks remain available in the same tick', () => {
  for (const [code, action] of [['Space', 'jump'], ['ShiftRight', 'dash']]) {
    const keys = new KeyboardInput();
    keys.press('KeyA', 0);
    keys.press('KeyW', 1);
    keys.press(code, 10);
    keys.press('KeyJ', 11);
    keys.release('KeyA');
    keys.release('KeyW');
    const input = keys.read();
    assert.equal(input.attack, true);
    assert.equal(input[action], true);
    assert.equal(input.attackDirection, -1);
    assert.equal(input.command, false);
    assert.equal(input.attackDepthDirection, -1);
  }
});

test('direct elemental shortcuts emit one cast with the pressed facing', () => {
  for (const [code, action] of [['KeyK', 'special'], ['KeyL', 'burst']]) {
    const keys = new KeyboardInput();
    keys.press('KeyA', 0);
    keys.press(code, 10);
    keys.release('KeyA');
    const input = keys.read();
    assert.equal(input[action], true);
    assert.equal(input.attackDirection, -1);
    assert.equal(keys.read()[action], false);
  }
});

test('running requires a second horizontal press within 250 ms and stops on release', () => {
  const keys = new KeyboardInput();
  keys.press('KeyD', 0);
  assert.equal(keys.read().run, false);
  keys.release('KeyD');
  keys.press('KeyD', 250);
  assert.equal(keys.read().run, true);
  keys.release('KeyD');
  assert.equal(keys.read().run, false);
  keys.press('KeyD', 501);
  assert.equal(keys.read().run, false);
});

test('a second key for an already-held direction does not count as a running double tap', () => {
  const keys = new KeyboardInput();
  keys.press('KeyD', 0);
  keys.press('ArrowRight', 10);
  assert.equal(keys.read().run, false);
  keys.release('KeyD');
  assert.equal(keys.read().right, true);
});

test('clearing input discards edges, held keys, commands, and running history', () => {
  const keys = new KeyboardInput();
  keys.press('KeyI', 0);
  keys.press('KeyD', 10);
  keys.press('Space', 20);
  keys.clear();
  const cleared = keys.read();
  assert.equal(cleared.guard, false);
  assert.equal(cleared.right, false);
  assert.equal(cleared.jump, false);
  keys.press('KeyD', 30);
  keys.press('KeyJ', 40);
  const input = keys.read();
  assert.equal(input.run, false);
  assert.equal(input.attack, true);
  assert.equal(input.special, false);
});

test('hurt cancellation can invalidate a partial command without dropping held movement', () => {
  const keys = new KeyboardInput();
  keys.press('KeyI', 0);
  keys.release('KeyI');
  keys.press('KeyD', 10);
  keys.clearCommand();
  keys.press('KeyJ', 20);
  const input = keys.read();
  assert.equal(input.right, true);
  assert.equal(input.attack, true);
  assert.equal(input.special, false);
});

test('only fresh gameplay presses invalidate a command waiting inside the game', () => {
  const keys = new KeyboardInput();
  assert.equal(keys.read().freshInput, false);
  keys.press('KeyD', 0);
  assert.equal(keys.read().freshInput, true);
  assert.equal(keys.read().freshInput, false);
  keys.press('KeyD', 500, { repeat: true });
  keys.press('KeyD', 600);
  keys.press('F5', 700);
  assert.equal(keys.read().freshInput, false);
  keys.release('KeyD');
  assert.equal(keys.read().freshInput, false, 'releasing a key is not a new command stage');
  keys.press('KeyI', 800);
  assert.equal(keys.read().freshInput, true);
});

test('a new gameplay press cancels a completed command even before the next simulation tick', () => {
  const keys = new KeyboardInput();
  keys.press('KeyI', 0);
  keys.press('KeyD', 10);
  keys.press('KeyJ', 20);
  keys.press('KeyA', 30);
  const input = keys.read();
  assert.equal(input.special, false);
  assert.equal(input.freshInput, true);
  assert.equal(input.left, true);
});

test('hurt can cancel an unread completed command while preserving held movement', () => {
  const keys = new KeyboardInput();
  keys.press('KeyI', 0);
  keys.press('KeyD', 10);
  keys.press('KeyJ', 20);
  keys.clearCommand();
  const input = keys.read();
  assert.equal(input.special, false);
  assert.equal(input.right, true);
});

function guardedGame() {
  const game = new Game({ element: 'air', mode: 'survival', difficulty: 'normal' });
  game.start();
  game.state.enemies = [];
  const keys = new KeyboardInput();
  const tick = (count = 1) => {
    for (let frame = 0; frame < count; frame++) game.tick(keys.read(), 1 / 120);
  };
  keys.press('KeyI', 0);
  tick(70);
  assert.equal(game.state.player.parryTimer, 0, 'the original timed parry has expired');
  return { game, keys, tick, player: game.state.player };
}

for (const rejection of ['insufficient energy', 'cooldown']) {
  test(`a command with ${rejection} preserves held guard without renewing its parry`, () => {
    const { keys, tick, player } = guardedGame();
    if (rejection === 'insufficient energy') player.energy = 0;
    else player.cooldowns.special = 1;
    keys.press('KeyD', 600);
    keys.release('KeyD');
    keys.press('KeyJ', 610);
    tick();
    assert.equal(player.guard, true, 'a command that cannot execute does not drop guard');
    assert.equal(player.action, null);
    tick(2);
    assert.equal(player.guard, true);
    assert.equal(player.parryTimer, 0, 'an uninterrupted held key cannot generate another parry');
  });
}

test('an available command casts through held guard without fabricating a new guard press', () => {
  const { game, keys, tick, player } = guardedGame();
  keys.press('KeyD', 600);
  keys.release('KeyD');
  keys.press('KeyJ', 610);
  tick();
  assert.equal(player.action?.kind, 'special');
  assert.equal(player.guard, false, 'the engine lowers guard for the accepted action');
  tick(40);
  assert.ok(game.state.projectiles.length > 0);
  assert.equal(player.guard, true, 'held guard returns after the action');
  assert.equal(player.parryTimer, 0, 'finishing a cast does not create a new physical press');
  keys.release('KeyI');
  tick();
  keys.press('KeyI', 900);
  tick();
  assert.ok(player.parryTimer > 0, 'a real release and repress starts a new timed parry');
});
