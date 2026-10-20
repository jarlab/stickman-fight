import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { Renderer } from '../src/renderer.js';
import { VFX } from '../src/vfx-art.js';
import { fakeCanvas } from './fake-canvas.js';

// A real Renderer on a recording context (the cached background is skipped in Node).
function setup(options = {}) {
  const { canvas, ctx } = fakeCanvas();
  const renderer = new Renderer(canvas);
  renderer.background = () => ({});
  const game = new Game({ element: 'air', arena: 'air', mode: 'training', ...options });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], floaters: [], weapons: [], corpses: [], banner: '', bannerTime: 0 });
  Object.assign(game.state.player, { x: 300, depth: 600, y: 600, invulnerable: 0 });
  return { renderer, game, ctx, s: game.state };
}
function enemy(game, x, depth, set = {}) {
  const e = game.makeFighter('enemy', set.element || 'earth', x, depth);
  Object.assign(e, { x, depth, y: depth, invulnerable: 0, facing: -1 }, set);
  game.state.enemies.push(e);
  return e;
}
// Swaps VFX draw functions for recorders for the duration of fn.
function spyVfx(keys, log, fn) {
  const real = {};
  for (const key of keys) {
    real[key] = VFX[key].draw;
    VFX[key].draw = (ctx, x, y, t, p) => log.push({ key, x, y, t, layer: p.layer, reduced: p.reduced, p: { ...p } });
  }
  try { fn(); } finally { for (const key of keys) VFX[key].draw = real[key]; }
}

test('split effects sandwich the fighter on their floor point; dust and smoke sort by their floor depth', () => {
  const { renderer, game, s } = setup();
  const target = enemy(game, 600, 500);
  const front = enemy(game, 640, 560);
  game.vfx('iceColumn', 600, 500, {}, { targetId: target.id });
  game.vfx('dustRun', 610, 500, { dir: 1 });
  game.vfx('smokeBurn', 640, 470, {}, { depth: 560 });
  const order = [];
  const drawFighter = renderer.drawFighter.bind(renderer);
  renderer.drawFighter = (f, ...rest) => { order.push(f === target ? 'target' : f === front ? 'front fighter' : 'player'); return drawFighter(f, ...rest); };
  spyVfx(['iceColumn', 'dustRun', 'smokeBurn'], { push: e => order.push(`${e.key}:${e.layer ?? 'whole'}`) }, () => renderer.draw(s));
  assert.deepEqual(order, ['iceColumn:back', 'target', 'iceColumn:front', 'dustRun:whole', 'front fighter', 'smokeBurn:whole', 'player']);
});

test('body effects draw over the objects at t = 1 - life / maxLife, icons over the floaters', () => {
  const { renderer, game, s } = setup();
  const target = enemy(game, 600, 500);
  game.damage(target, 5, 1, s.player, { element: 'air' });
  const icon = game.commandIcon(target, 'come');
  for (const e of s.effects) e.life -= 0.05;
  const order = [];
  const drawFighter = renderer.drawFighter.bind(renderer);
  renderer.drawFighter = (f, ...rest) => { order.push('fighter'); return drawFighter(f, ...rest); };
  const drawFloater = renderer.drawFloater.bind(renderer);
  renderer.drawFloater = f => { order.push('floater'); return drawFloater(f); };
  const log = [];
  spyVfx(['air', 'hitLight', 'iconCome'], { push: e => { log.push(e); order.push(e.key); } }, () => renderer.draw(s));
  assert.deepEqual(order.filter((v, i) => v !== order[i - 1]), ['fighter', 'air', 'hitLight', 'floater', 'iconCome']);
  const spark = log.find(e => e.key === 'hitLight');
  assert.ok(Math.abs(spark.t - 0.05 / VFX.hitLight.life) < 1e-9);
  assert.equal(spark.p.element, 'air', 'the attacker element');
  assert.equal(spark.reduced, false);
  // The icon re-anchors to its fighter's head every frame.
  target.x = 700;
  log.length = 0;
  spyVfx(['iconCome'], log, () => renderer.draw(s));
  assert.equal(log[0].x, 700);
  assert.equal(log[0].y, target.y - target.h - 20);
  assert.ok(icon.life > 0);
});

test('a slash follows its attacker; reduced motion reaches every fx call', () => {
  const { renderer, game, s } = setup();
  const p = s.player;
  p.weapon = 'staff';
  game.startAction(p, 'melee');
  p.action.t = p.action.windup;
  game.melee(p);
  p.x += 30;
  const log = [];
  spyVfx(['slashLight'], log, () => renderer.draw(s, { reducedMotion: true }));
  assert.equal(log.length, 1);
  assert.equal(log[0].x, p.x + 6, 'anchored at the moving shoulder');
  assert.equal(log[0].y, p.y - 40);
  assert.equal(log[0].reduced, true);
});

test('delayed and spawning things wait: no early ice column, no body before the swirl reveals it', () => {
  const { renderer, game, s } = setup();
  game.vfx('iceColumn', 600, 500, {}, { delay: .1 });
  const arrival = game.spawnEnemy({ element: 'fire', x: 900, depth: 500 });
  const drawn = [];
  const drawFighter = renderer.drawFighter.bind(renderer);
  renderer.drawFighter = (f, ...rest) => { drawn.push(f); return drawFighter(f, ...rest); };
  const log = [];
  spyVfx(['iceColumn', 'spawn'], log, () => renderer.draw(s));
  assert.deepEqual(log.map(e => e.key), ['spawn'], 'the delayed column is not drawn yet');
  assert.ok(!drawn.includes(arrival), 'the summoned body is hidden');
  game.updateVisuals(.37);
  drawn.length = 0;
  log.length = 0;
  spyVfx(['iceColumn', 'spawn'], log, () => renderer.draw(s));
  assert.ok(drawn.includes(arrival), 'revealed at 60% of the swirl');
  assert.ok(log.some(e => e.key === 'iceColumn' && e.layer === 'back'));
});

// Fills of the guard bubble disc / frozen block, as recorded by the fake context.
const fillsOf = (ctx, color) => ctx.calls.filter(call => call.name === 'fill' && call.fill === color).length;

test('the guard bubble is skipped while a guard spark or parry flash plays', () => {
  const { renderer, game, ctx } = setup();
  const guard = enemy(game, 600, 500, { element: 'water', guard: true });
  renderer.drawFighter(guard, 1, false, null);
  const disc = ctx.calls.filter(call => call.name === 'arc' && call.args[2] === guard.h * 0.62).length;
  assert.ok(disc >= 2, 'the bubble disc and rim draw while guarding');
  ctx.calls.length = 0;
  guard.guardFx = .1;
  renderer.drawFighter(guard, 1, false, null);
  assert.equal(ctx.calls.filter(call => call.name === 'arc' && call.args[2] === guard.h * 0.62).length, 0, 'no bubble under the spark');
});

test('the frozen block waits while an ice column holds the fighter', () => {
  const { renderer, game, ctx } = setup();
  const frozen = enemy(game, 600, 500, { frozen: .5 });
  renderer.drawFighter(frozen, 1, false, null);
  assert.equal(fillsOf(ctx, '#c5eafb'), 1, 'the frozen block draws');
  ctx.calls.length = 0;
  frozen.iceFx = .4;
  renderer.drawFighter(frozen, 1, false, null);
  assert.equal(fillsOf(ctx, '#c5eafb'), 0, 'the column replaces it');
});

test('attack trails drop to 35% once the strike connects, and slashes replace them', () => {
  const { renderer, game, ctx } = setup({ element: 'fire' });
  const f = enemy(game, 600, 500, { element: 'fire', facing: 1 });
  f.energy = 100;
  game.startAction(f, 'melee');
  const pose = { hand: [40, -45], frontFoot: [20, -1] };
  const style = { trail: 'punch' };
  const alphaOf = () => { ctx.calls.length = 0; ctx.globalAlpha = 1; renderer.drawAttackTrail(f, pose, style, 1, false); return Math.max(...ctx.calls.filter(c => c.name === 'fill').map(c => c.alpha)); };
  assert.ok(Math.abs(alphaOf() - 0.9) < 1e-9);
  f.action.connected = true;
  assert.ok(Math.abs(alphaOf() - 0.9 * 0.35) < 1e-9, 'contact rule');
  f.action.slash = 'slashHeavy';
  ctx.calls.length = 0;
  renderer.drawAttackTrail(f, pose, style, 1, false);
  assert.equal(ctx.calls.length, 0, 'the brush slash replaces the trail');
  f.action.slash = null;
  ctx.calls.length = 0;
  renderer.drawAttackTrail(f, pose, { trail: 'weapon' }, 1, false);
  assert.equal(ctx.calls.length, 0, 'the old weapon arc is gone');
});

test('energy balls draw their inked element trail before the body', () => {
  const { renderer, ctx } = setup();
  renderer.drawProjectile({ x: 500, y: 400, vx: 600, vy: 0, vDepth: 0, r: 15, element: 'water' }, 1, false);
  const rim = ctx.calls.findIndex(c => c.name === 'stroke' && c.stroke === '#24527f');
  const glow = ctx.calls.findIndex(c => c.name === 'fill' && c.alpha === 0.16);
  assert.ok(rim >= 0 && glow > rim, 'trail rim first, then the ball glow and body');
  ctx.calls.length = 0;
  renderer.drawProjectile({ x: 500, y: 400, vx: 600, vy: 0, r: 14, kind: 'weapon', weapon: 'staff', element: 'water' }, 1, false);
  assert.ok(!ctx.calls.some(c => c.stroke === '#24527f'), 'thrown weapons have no energy trail');
});

test('legacy impact, slash and shockwave effects still render through the ink set', () => {
  const { renderer, ctx } = setup();
  for (const effect of [
    { kind: 'impact', impactKind: 'hit', element: 'earth', heavy: true, x: 400, y: 400, life: .1, maxLife: .28, direction: 1 },
    { kind: 'impact', impactKind: 'block', element: 'air', x: 400, y: 400, life: .1, maxLife: .22, direction: -1 },
    { kind: 'impact', impactKind: 'parry', x: 400, y: 400, life: .2, maxLife: .22, direction: 1 },
    { kind: 'slash', x: 400, y: 400, life: .1, maxLife: .2, direction: 1, element: 'fire' },
    { kind: 'shockwave', x: 400, y: 400, life: .2, maxLife: .25 },
    { kind: 'vfx', fx: 'ko', x: 400, y: 400, life: .4, maxLife: .8, p: { element: 'air' } },
  ]) {
    ctx.calls.length = 0;
    renderer.drawParticle(effect, false);
    assert.ok(ctx.calls.filter(c => c.name === 'fill').length > 0, `${effect.kind} ${effect.impactKind || effect.fx || ''} draws`);
    assert.equal(ctx.depth, 0);
  }
});

test('a full brawl frame draws every effect kind with a balanced context', () => {
  const { renderer, game, s, ctx } = setup({ element: 'fire' });
  const a = enemy(game, 600, 500, { element: 'water' });
  const b = enemy(game, 700, 560, { element: 'air', guard: true, facing: -1 });
  game.damage(a, 5, 1, s.player, { element: 'fire', heavy: true });
  game.damage(b, 5, 1, s.player, { element: 'fire', contact: true });
  game.damage(a, 5, 1, s.player, { element: 'water', freeze: .5 });
  for (const [key, x] of [['explosion', 300], ['groundBurn', 400], ['dustLand', 500], ['smoke', 520], ['ko', 560], ['slashSpin', 640], ['iconJoin', 680]]) game.vfx(key, x, 520, { element: 'earth', life: 2.4 });
  game.commandIcon(a, 'move');
  s.projectiles.push({ x: 800, y: 400, depth: 450, z: 50, vx: -500, vy: 0, vDepth: 40, r: 12, element: 'fire', turn: .5 });
  for (const reducedMotion of [false, true]) {
    for (let i = 0; i < 6; i += 1) {
      renderer.draw(s, { reducedMotion });
      assert.equal(ctx.depth, 0, 'every save is restored');
      game.updateVisuals(.07);
    }
  }
});

test('projectile trails keep their approved size at real shot radii and start inside the rim', () => {
  const { renderer, game, ctx } = setup();
  // Real shot radii from Game.shoot(): the trail stays r 9 (earth 10), len 5.5 r, half-width .95 r.
  for (const [element, r, trailR] of [['air', 20, 9], ['water', 15, 9], ['earth', 24, 10], ['fire', 12, 9], ['water', 9, 9]]) {
    ctx.calls.length = 0;
    renderer.drawProjectile({ x: 500, y: 400, vx: 600, vy: 0, vDepth: 0, r, element }, 1, false);
    const origin = ctx.calls.find(c => c.name === 'translate');
    assert.deepEqual(origin.args.map(v => +v.toFixed(6)), [500 - (r - trailR), 400], `${element} r ${r}: trail starts ${r - trailR} px behind the centre`);
    const end = ctx.calls.findIndex(c => c.name === 'closePath');
    const ribbon = ctx.calls.slice(0, end).filter(c => c.name === 'moveTo' || c.name === 'lineTo');
    const length = Math.max(...ribbon.map(c => -c.args[0]));
    const width = Math.max(...ribbon.map(c => Math.abs(c.args[1])));
    assert.ok(Math.abs(length - trailR * 5.5) < 1e-6, `${element}: ${length} px long`);
    assert.ok(Math.abs(width - trailR * .95) < 1e-6, `${element}: ${width} px half-width`);
  }
  // A real shot from the game reaches drawProjectile with the same capped trail.
  const p = game.state.player;
  Object.assign(p, { element: 'earth', facing: 1 });
  game.shoot(p);
  const [shot] = game.state.projectiles;
  assert.equal(shot.r, 24);
  ctx.calls.length = 0;
  renderer.drawProjectile(shot, 1, false);
  const origin = ctx.calls.find(c => c.name === 'translate');
  assert.ok(origin.args[0] < shot.x - 13, 'the boulder trail starts inside its rim');
});

test('released ice-lance and eruption hazards leave their release to the vfx, in both motion modes', () => {
  const { renderer, ctx } = setup();
  const hazard = (move, extra = {}) => ({ id: 1, ownerId: 9, element: move === 'ice-lance' ? 'water' : 'fire', move, name: 'Move', hint: 'hint',
    x: 640, depth: 520, rx: 120, rd: 30, shape: move === 'ice-lance' ? 'lane' : 'ellipse', height: 100,
    delay: 0, warningTime: .6, life: .2, maxLife: .22, hitIds: [], released: true, direction: 1, ...extra });
  const element = [];
  const real = renderer.drawBossHazardElement.bind(renderer);
  renderer.drawBossHazardElement = (h, t) => { element.push(h.move); return real(h, t); };
  for (const reduced of [false, true]) {
    for (const move of ['ice-lance', 'triple-eruption', 'wind-lane', 'stone-quake']) {
      element.length = 0;
      ctx.calls.length = 0;
      renderer.drawBossHazard(hazard(move), 1, reduced, false);
      const vfxMove = move === 'ice-lance' || move === 'triple-eruption';
      assert.equal(element.length, !vfxMove && !reduced ? 1 : 0, `${move}${reduced ? ' (reduced)' : ''}: element art`);
      // The reduced-motion glyph pillar is a vertical line up to the hazard height.
      const pillar = ctx.calls.some(c => c.name === 'lineTo' && c.args[0] === 0 && c.args[1] === -100);
      assert.equal(pillar, reduced && !vfxMove, `${move}${reduced ? ' (reduced)' : ''}: glyph pillar`);
      assert.ok(ctx.calls.some(c => c.name === 'stroke'), 'the footprint boundary always draws');
    }
    // Warnings are unchanged: every move shows its countdown marker.
    for (const move of ['ice-lance', 'triple-eruption', 'wind-lane']) {
      ctx.calls.length = 0;
      renderer.drawBossHazard(hazard(move, { delay: .3, released: false }), 1, reduced, true);
      assert.ok(ctx.calls.some(c => c.name === 'fillText' && c.args[0] === '!'), `${move}: warning mark`);
    }
  }
  assert.equal(ctx.depth, 0, 'balanced save/restore');
});
