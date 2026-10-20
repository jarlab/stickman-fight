import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { Renderer } from '../src/renderer.js';
import { ELEMENTS, ARCHETYPE_KINDS } from '../src/data.js';
import { ARCHETYPES, IRON_BELL_CROWN } from '../src/enemy-art.js';
import { fakeCanvas } from './fake-canvas.js';

const STEP = 1 / 120;
// A real Renderer on a recording context (the cached background is skipped in Node).
function setup() {
  const { canvas, ctx } = fakeCanvas();
  const renderer = new Renderer(canvas);
  renderer.background = () => ({});
  const game = new Game({ element: 'air', arena: 'air', mode: 'survival', seed: 5 });
  game.start();
  Object.assign(game.state, { enemies: [], captives: [], projectiles: [], effects: [], particles: [], floaters: [], weapons: [], corpses: [], banner: '', bannerTime: 0, waveDelay: 999, weaponTimer: 999 });
  Object.assign(game.state.player, { x: 200, depth: 600, y: 600, invulnerable: 0 });
  return { renderer, game, ctx, s: game.state };
}
function spawn(game, archetype, x, depth = 520, set = {}) {
  const e = game.spawnEnemy({ archetype, x, depth });
  game.state.effects = game.state.effects.filter(fx => fx.targetId !== e.id);
  return Object.assign(e, { spawnReveal: 0, spawnHold: false, invulnerable: 0 }, set);
}
const fills = ctx => new Set(ctx.calls.filter(c => c.name === 'fill' || c.name === 'fillRect').map(c => c.fill));
const bars = (ctx, color) => ctx.calls.filter(c => c.name === 'fillRect' && c.fill === color);

test('archetypes draw their own bodies and HP bars, never an element colour', () => {
  const { renderer, game, ctx, s } = setup();
  const foes = ARCHETYPE_KINDS.filter(k => k !== 'captive').map((kind, i) => spawn(game, kind, 300 + i * 140, 520, { hp: 40 }));
  renderer.draw(s);
  const used = fills(ctx);
  for (const f of foes) {
    const spec = ARCHETYPES[f.archetype];
    assert.ok(used.has(f.archetype === 'guard' ? '#9aa8b0' : spec.color), `${f.archetype} cloth`);
    const bar = bars(ctx, spec.bar);
    assert.equal(bar.length, 1, `${f.archetype} HP bar in its bar colour`);
    const width = f.archetype === 'brute' ? 48 : 36; // the Chain Ox's bar is wider
    assert.ok(Math.abs(bar[0].args[2] - (width - 2) * f.hp / f.maxHp) < 1e-9, `${f.archetype} bar ${width} px`);
  }
  for (const element of ['water', 'earth', 'fire']) assert.ok(!used.has(ELEMENTS[element].color), `no ${element} colour`);
});

test('a bandit hidden in smoke shows no HP bar; the monk\'s Iron Bell lifts his bar above its crown', () => {
  const { renderer, game, ctx, s } = setup();
  spawn(game, 'bandit', 400, 520, { hp: 20, smokeTimer: 0.8 });
  const monk = spawn(game, 'monk', 800, 560, { hp: 60 });
  game.raiseBell(monk);
  monk.bellTimer = 2;
  renderer.draw(s);
  assert.equal(bars(ctx, ARCHETYPES.bandit.bar).length, 0, 'no bar in the smoke');
  assert.ok(ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#a98b49'), 'the bell shell is drawn');
  const bar = bars(ctx, ARCHETYPES.monk.bar)[0];
  assert.ok(bar.args[1] <= monk.y - 88 * IRON_BELL_CROWN - 8, `bar above the bell crown (${bar.args[1]})`);
});

test('archetype ground effects draw under the bodies and post effects (smoke, tether, bell, clang, freed) over them', () => {
  const { renderer, game, s } = setup();
  const bandit = spawn(game, 'bandit', 600, 520);
  s.effects.push({ kind: 'healSigil', x: 600, y: 520, depth: 520, r: 30, life: 1, maxLife: 2 });
  s.effects.push({ kind: 'stuckArrow', x: 640, y: 524, depth: 524, angle: 1.2, life: 3, maxLife: 4 });
  s.effects.push({ kind: 'smokePuff', x: 600, y: 520, depth: 520, r: 40, life: 0.6, maxLife: 1 });
  s.effects.push({ kind: 'shieldClang', x: 620, y: 480, depth: 520, r: 11, direction: 1, life: 0.1, maxLife: 0.2 });
  const order = [];
  const drawFighter = renderer.drawFighter.bind(renderer);
  renderer.drawFighter = (f, ...rest) => { if (f === bandit) order.push('bandit'); return drawFighter(f, ...rest); };
  const drawEffect = renderer.drawEffect.bind(renderer);
  renderer.drawEffect = (e, ...rest) => { order.push(e.kind); return drawEffect(e, ...rest); };
  renderer.draw(s);
  assert.deepEqual(order, ['healSigil', 'stuckArrow', 'bandit', 'smokePuff', 'shieldClang']);
});

test('archetype shots draw as enemy-art shots with their floor shadow, not as element balls', () => {
  const { renderer, game, ctx, s } = setup();
  const hunter = spawn(game, 'hunter', 300, 520, { facing: 1 });
  game.fireArrow(hunter);
  const priest = spawn(game, 'sorcerer', 900, 600, { facing: -1 });
  game.throwTalisman(priest);
  const ox = spawn(game, 'brute', 700, 450, { facing: -1 });
  game.throwHook(ox);
  const order = [];
  const drawProjectile = renderer.drawProjectile.bind(renderer);
  renderer.drawProjectile = (p, ...rest) => { order.push(p.kind); return drawProjectile(p, ...rest); };
  renderer.draw(s);
  assert.deepEqual(order.sort(), ['arrow', 'chainHook', 'talisman']);
  const used = fills(ctx);
  assert.ok(used.has('#f1df92'), 'the talisman slip');
  // No element trail glow: an element ball fills its 2.2 r halo in the element colour.
  assert.ok(!ctx.calls.some(c => c.name === 'fill' && c.fill === ELEMENTS.air.color && c.alpha < 0.2));
});

test('the rescue tag shows only where E would free the villager, with a gauge while E is held', () => {
  const { renderer, game, ctx, s } = setup();
  const c = game.spawnCaptive(700, 600);
  Object.assign(c, { spawnReveal: 0 });
  s.effects = [];
  const tagged = () => ctx.calls.some(k => k.name === 'fillText' && k.args[0] === 'E · FREE');
  renderer.draw(s);
  assert.equal(tagged(), false, 'out of reach: no tag');
  Object.assign(s.player, { x: 650, depth: 600, y: 600 });
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.equal(tagged(), true, 'in reach: the tag');
  game.tick({ interact: true, interactHeld: true }, STEP);
  for (let i = 0; i < 30; i += 1) game.tick({ interactHeld: true }, STEP);
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.equal(tagged(), true);
  const gauge = bars(ctx, '#56905d');
  assert.equal(gauge.length, 1, 'the gauge fills while E is held');
  assert.ok(Math.abs(gauge[0].args[2] - 34 * (31 / 120) / 0.6) < 1, `gauge ${gauge[0].args[2]}`);
  // A weapon beside him shows no E badge: E frees the villager first.
  s.weapons.push({ kind: 'staff', x: 655, y: 600, depth: 600, life: 20 });
  game.tick({}, STEP);
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.equal(ctx.calls.some(k => k.name === 'fillText' && k.args[0] === 'E'), false);
});

test('fallen archetypes lie in their own KO silhouettes; a sealed player carries the slip; reduced motion draws everything', () => {
  for (const reducedMotion of [false, true]) {
    const { renderer, game, ctx, s } = setup();
    const ox = spawn(game, 'brute', 500, 560);
    ox.hp = 0;
    game.resolveDeaths();
    const corpse = s.corpses[0];
    assert.equal(corpse.archetype, 'brute');
    s.player.sealed = 1.5;
    for (const kind of ARCHETYPE_KINDS.filter(k => k !== 'captive')) spawn(game, kind, 300 + ARCHETYPE_KINDS.indexOf(kind) * 150, 470, { hp: 30 });
    game.spawnCaptive(1150, 640).spawnReveal = 0;
    renderer.draw(s, { reducedMotion });
    const used = fills(ctx);
    assert.ok(used.has('#d8c6a2'), 'the Ox lies face down, his shaded back up');
    assert.ok(used.has('#f1df92'), 'the seal slip by the player');
    assert.equal(ctx.depth, 0);
  }
});

test('an archetype shot is drawn along its screen path: depth travel turns a lobbed arrow down the screen', () => {
  const { renderer, game, ctx, s } = setup();
  const hunter = spawn(game, 'hunter', 300, 450, { facing: 1 });
  Object.assign(s.player, { x: 700, depth: 590, y: 590 });
  game.fireVolley(hunter);
  const arrow = s.projectiles[0];
  assert.ok(arrow.vDepth > 0, 'aimed into a lower lane');
  renderer.draw(s);
  const at = ctx.calls.findIndex(c => c.name === 'translate' && c.args[0] === arrow.x && c.args[1] === arrow.y);
  const rotate = ctx.calls.slice(at).find(c => c.name === 'rotate');
  const screen = Math.atan2(arrow.vy + arrow.vDepth, arrow.vx);
  assert.ok(Math.abs(rotate.args[0] - screen) < 1e-9, `drawn at ${rotate.args[0].toFixed(3)} rad, flies at ${screen.toFixed(3)}`);
  assert.equal(arrow.vy, -Math.abs(arrow.vx), 'the shot itself is untouched');
});

test('the Chain Ox throws his hook without the lash trail, and no armour plates sit on an armoured archetype', () => {
  const trail = ARCHETYPES.brute.accent;
  const strike = variantKind => {
    const { renderer, game, ctx, s } = setup();
    const ox = spawn(game, 'brute', 600, 520, { facing: -1 });
    ox.energy = 100;
    assert.equal(game.startAction(ox, variantKind), true);
    const a = ox.action;
    a.t = a.windup + (a.activeUntil - a.windup) * 0.3;
    ox.tell = 0;
    renderer.draw(s);
    return { ox, ctx };
  };
  const lash = strike('melee');
  assert.ok(fills(lash.ctx).has(trail), 'the Chain Lash draws its trail');
  const hook = strike('special');
  assert.equal(hook.ox.action.variant, 'hook');
  assert.ok(!fills(hook.ctx).has(trail), 'the hook throw has none');
  // The lash is armoured through its wind-up: the approved body, no gold plates.
  const { renderer, game, ctx, s } = setup();
  const ox = spawn(game, 'brute', 600, 520, { facing: -1 });
  game.startAction(ox, 'melee');
  ox.action.t = ox.action.windup * 0.58;
  ox.tell = 0;
  game.updateFighter(ox, {}, 0);
  assert.ok(ox.armor);
  renderer.draw(s);
  assert.ok(!ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#d9b65e'), 'no plate bars');
  assert.ok(!fills(ctx).has('#ecd08b'), 'no plate stud');
});

test('the villager\'s command bubble sits clear of his health bar, and a sealed player\'s slip moves off his rescue tag', () => {
  const { renderer, game, ctx, s } = setup();
  const c = game.spawnCaptive(700, 600);
  Object.assign(c, { spawnReveal: 0, hp: 30 });
  s.effects = [];
  game.commandIcon(c, 'come');
  for (const e of s.effects) e.life -= 0.3;
  const log = [];
  const drawVfx = renderer.drawVfx.bind(renderer);
  renderer.drawVfx = (e, ...rest) => { if (e.fx === 'iconCome') log.push(e); return drawVfx(e, ...rest); };
  renderer.draw(s);
  const bar = bars(ctx, ARCHETYPES.captive.bar)[0];
  assert.ok(bar, 'his bar');
  const icon = log[0];
  assert.ok(icon, 'the bubble');
  // The bubble (anchor at its tail tip) is drawn at y - h - 28: above the bar's top.
  const tail = ctx.calls.find(k => k.name === 'translate' && k.args[0] === c.x && k.args[1] < bar.args[1]);
  assert.ok(tail && tail.args[1] <= bar.args[1] - 8, `bubble tail ${tail?.args[1]} over the bar at ${bar.args[1]}`);
  // A sealed player beside him: the slip goes on the side away from the tag.
  Object.assign(s.player, { x: 650, depth: 600, y: 600, facing: 1, sealed: 1.5 });
  s.effects = [];
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.ok(ctx.calls.some(k => k.name === 'fillText' && k.args[0] === 'E · FREE'));
  const slip = ctx.calls.filter(k => k.name === 'translate' && k.args[0] === 650 - 16);
  assert.ok(slip.length > 0, 'the slip hangs behind the player\'s head, away from the villager');
});
