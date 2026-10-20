// The asset pack's leftovers: team stay/move bubbles from the AI, breaking a villager's cangue,
// the eat and porcelain-smash sounds and the volume slider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { CAPTIVE } from '../src/data.js';
import { GameAudio } from '../src/game-audio.js';
import { MIX, SFX } from '../src/audio.js';
import { fakeCtx } from './fake-audio.js';

const STEP = 1 / 120;

function arena(options = {}) {
  const game = new Game({ element: 'earth', arena: 'air', mode: 'survival', difficulty: 'normal', seed: 7, ...options });
  game.start();
  const s = game.state;
  Object.assign(s, { enemies: [], captives: [], projectiles: [], weapons: [], effects: [], particles: [], floaters: [], corpses: [], sounds: [], waveDelay: 999, weaponTimer: 999 });
  Object.assign(s.player, { x: 500, depth: 540, y: 540, invulnerable: 0, facing: 1 });
  return { game, s, p: s.player };
}
const icons = (s, fx) => s.effects.filter(e => e.kind === 'vfx' && e.fx === fx);
const reveal = (game, f) => {
  game.state.effects = game.state.effects.filter(fx => fx.targetId !== f.id);
  return Object.assign(f, { spawnReveal: 0, spawnHold: false, invulnerable: 0 });
};

test('a fighter rotated out of the fight raises a stay bubble, at most once per gap', () => {
  const { game, s } = arena();
  const e = reveal(game, game.spawnEnemy({ element: 'fire', x: 700, depth: 540 }));
  game.enemyAI.update(game, STEP);
  Object.assign(e.ai, { permitSince: s.time - 5 });
  e.action = null; e.buffer = null;
  game.enemyAI.update(game, STEP);
  assert.equal(icons(s, 'iconStay').length, 1, 'stay bubble over the rotated fighter');
  assert.equal(icons(s, 'iconStay')[0].followId, e.id);
  e.ai.permitSince = s.time - 5;
  game.enemyAI.update(game, STEP);
  assert.equal(icons(s, 'iconStay').length, 1, 'no second bubble inside the gap');
});

test('a fighter sent to the other side raises a move bubble; none while hidden in its swirl', () => {
  const { game, s } = arena();
  const crowd = [];
  for (let i = 0; i < 4; i++) crowd.push(reveal(game, game.spawnEnemy({ element: 'air', x: 760 + i * 40, depth: 520 + i * 10 })));
  for (let t = 0; t < 1.5; t += STEP) game.enemyAI.update(game, STEP);
  assert.ok(icons(s, 'iconMove').length >= 1, 'a crowd stacked on one side rebalances with a move bubble');
  const { game: g2, s: s2 } = arena();
  for (let i = 0; i < 4; i++) Object.assign(reveal(g2, g2.spawnEnemy({ element: 'air', x: 760 + i * 40, depth: 520 + i * 10 })), { spawnReveal: 1 });
  for (let t = 0; t < .3; t += STEP) g2.enemyAI.update(g2, STEP);
  assert.equal(icons(s2, 'iconMove').length, 0);
});

test('three player blows break a villager\'s cangue and free him unhurt', () => {
  const { game, s, p } = arena();
  const c = reveal(game, game.spawnCaptive(560, 540));
  const hp = c.hp;
  for (let i = 1; i <= CAPTIVE.breakHits; i++) {
    const r = game.damage(c, 10, 1, p, { contact: true });
    assert.ok(r, 'the blow is spent on the cangue');
    assert.equal(c.hp, hp, 'the villager takes no damage');
    assert.equal(c.freed, i === CAPTIVE.breakHits, `freed only on crack ${CAPTIVE.breakHits}`);
  }
  assert.ok(s.weapons.some(w => w.kind === 'heal'), 'the rescue reward drops');
  assert.ok(game.targets(p).includes(c) === false, 'a freed villager is no longer a target');
});

test('a bandit still hurts a bound villager', () => {
  const { game } = arena();
  const c = reveal(game, game.spawnCaptive(560, 540));
  const bandit = reveal(game, game.spawnEnemy({ archetype: 'bandit', x: 620, depth: 540 }));
  const hp = c.hp;
  game.damage(c, 10, -1, bandit, { contact: true });
  assert.ok(c.hp < hp);
  assert.ok(!c.cangueHits);
});

test('food bites with the eat sound; a tonic knocked from the hand smashes', () => {
  const { game, s, p } = arena();
  s.weapons = [{ x: p.x + 20, y: p.depth, depth: p.depth, kind: 'bun', life: 20 }];
  game.pickup(p);
  for (let t = 0; t < 1; t += STEP) game.tick({}, STEP);
  assert.deepEqual(s.sounds.filter(c => c.name === 'eat').map(c => c.params.part), ['gulp', 'chime']);
  assert.ok(!s.sounds.some(c => c.name === 'drink'));
  s.sounds = [];
  p.hp = 40;
  s.weapons = [{ x: p.x + 20, y: p.depth, depth: p.depth, kind: 'heal', life: 20 }];
  game.pickup(p);
  game.tick({}, STEP);
  game.cancelConsume(p);
  assert.ok(s.sounds.some(c => c.name === 'smash'));
  for (const name of ['eat', 'smash']) {
    const ctx = fakeCtx();
    const end = SFX[name](ctx, ctx.destination, 1, {});
    assert.ok(end > 1 && end <= 1.6, `${name} ends within 0.6 s`);
  }
});

test('the volume slider scales the master; sound off still silences it', () => {
  const audio = new GameAudio({ enabled: true, volume: .5, random: () => .5, createContext: () => fakeCtx() });
  audio.unlock();
  assert.ok(Math.abs(audio.mix.volume.gain.target - MIX.volume * .5) < 1e-9, 'starts at the saved volume');
  audio.setVolume(.25);
  assert.ok(Math.abs(audio.mix.volume.gain.target - MIX.volume * .25) < 1e-9);
  audio.setEnabled(false);
  assert.equal(audio.mix.volume.gain.target, 0);
  audio.setVolume(1);
  assert.equal(audio.mix.volume.gain.target, 0, 'a slider move while off stays silent');
  audio.setEnabled(true);
  assert.ok(Math.abs(audio.mix.volume.gain.target - MIX.volume) < 1e-9, 'back on at the new volume');
  audio.setVolume(Number.NaN);
  assert.equal(audio.volume, 1);
});
