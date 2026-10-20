// src/weapon-art.js on a recording context, and the renderer's weapon hooks into it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { Renderer } from '../src/renderer.js';
import { WEAPON_ORDER } from '../src/data.js';
import { cueParams } from '../src/game-audio.js';
import { WEAPON_ART, WEAPON_SHARDS, drawWeaponPickupArt, drawHeldWeaponArt, drawWornArmorArt, drawThrownWeaponArt,
  drawWeaponShardArt, drawWeaponBreakPuff, drawLanternBurst } from '../src/weapon-art.js';
import { CONSUMABLES } from '../src/pickup-art.js';
import { recordingContext, fakeCanvas } from './fake-canvas.js';

const JADE = '#5fa48a';

test('every weapon draws in every state with finite numbers and a balanced save stack', () => {
  const ctx = recordingContext();
  for (const kind of WEAPON_ORDER) {
    for (const time of [0, 1.3]) assert.equal(typeof drawWeaponPickupArt(ctx, kind, time, 7), 'number');
    if (!WEAPON_ART[kind].bob) assert.equal(drawWeaponPickupArt(ctx, kind, 1.3, 7), 0, `${kind}: heavy and planted pickups never bob`);
    else assert.equal(drawWeaponPickupArt(ctx, kind, 0, 7), drawWeaponPickupArt(ctx, kind, 0, 7), `${kind}: a still clock holds the bob`);
    for (const end of [[30, -60], [-10, -80]]) drawHeldWeaponArt(ctx, kind, [-20, -50], end, 1);
    for (const [vx, vy] of [[900, -60], [-900, 40], [520, 0]]) drawThrownWeaponArt(ctx, kind, .5, 1, vx, vy);
    WEAPON_SHARDS[kind].forEach((_, i) => drawWeaponShardArt(ctx, kind, i));
    assert.equal(ctx.depth, 0, kind);
  }
  for (const element of ['air', 'water', 'earth', 'fire']) for (const flash of [false, true]) drawWornArmorArt(ctx, 'bracer', [14, -35], [26, -44], 1, flash, element, 1.14);
  for (const p of [0, .1, .5, .99]) { drawWeaponBreakPuff(ctx, p); drawLanternBurst(ctx, p); }
  assert.equal(ctx.depth, 0);
  assert.ok(ctx.calls.length > 1000);
});

function setup() {
  const { canvas, ctx } = fakeCanvas();
  const renderer = new Renderer(canvas);
  renderer.background = () => ({});
  const game = new Game({ element: 'air', arena: 'air', mode: 'training' });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], floaters: [], weapons: [], corpses: [], banner: '', bannerTime: 0 });
  Object.assign(game.state.player, { x: 300, depth: 600, y: 600, invulnerable: 0 });
  return { renderer, game, ctx, s: game.state };
}

test('held weapons get the fighter clock (still under reduced motion) and the knives rest lower', () => {
  const { renderer, s } = setup();
  const held = [];
  renderer.drawHeldWeapon = (kind, start, end, ctx, t) => held.push({ kind, angle: Math.atan2(end[1] - start[1], end[0] - start[0]), t });
  for (const [kind, rest] of [['knives', -.9], ['staff', -1.24], ['lantern', -1.24]]) {
    s.player.weapon = kind;
    s.time += .5;
    renderer.draw(s);
    renderer.draw(s, { reducedMotion: true });
    const [moving, still] = held.splice(0);
    assert.equal(moving.kind, kind);
    assert.ok(Math.abs(moving.angle - rest) < 1e-9, `${kind} idles at ${rest}`);
    assert.ok(moving.t > 0, 'tassels and fuses move on the fighter clock');
    assert.equal(still.t, 0, 'reduced motion stills them');
  }
});

test('a worn bracer draws on the lead forearm; pickups and shadows use the weapon art', () => {
  const { renderer, ctx, s } = setup();
  renderer.draw(s);
  assert.ok(!ctx.calls.some(c => c.fill === JADE), 'no jade without the bracer');
  ctx.calls.length = 0;
  s.player.armorItem = 'bracer';
  renderer.draw(s);
  assert.ok(ctx.calls.some(c => c.name === 'fill' && c.fill === JADE), 'the jade cuff is drawn');

  ctx.calls.length = 0;
  renderer.drawWeaponPickup({ x: 500, y: 560, kind: 'chakram' }, 1, false, true);
  assert.ok(ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#388e8b'), 'the chakram wrap in air teal');
  assert.ok(ctx.calls.some(c => c.name === 'fillText' && c.args[0] === 'E'), 'with its E badge as the item E would take');
  // Like a consumable's E seal, the badge shows only on the item E would take (an intentional
  // change with the consumables: one prompt, on the one item E takes).
  ctx.calls.length = 0;
  renderer.drawWeaponPickup({ x: 500, y: 560, kind: 'chakram' }, 1);
  assert.ok(!ctx.calls.some(c => c.name === 'fillText'), 'no badge out of reach');
  ctx.calls.length = 0;
  // The heal pickup is restyled as the herbal tonic (src/pickup-art.js), a celadon flask.
  renderer.drawWeaponPickup({ x: 500, y: 560, kind: 'heal' }, 1);
  assert.ok(ctx.calls.some(c => c.name === 'fill' && c.fill === '#a9c9a0'), 'the heal pickup is the celadon tonic');
  for (const kind of ['crate', 'millstone', 'stone', 'heal']) {
    ctx.calls.length = 0;
    renderer.drawGroundShadow({ x: 500, y: 560, depth: 560, kind }, 'pickup');
    const ellipse = ctx.calls.find(c => c.name === 'ellipse');
    assert.equal(ellipse.args[2], CONSUMABLES[kind]?.shadow ?? WEAPON_ART[kind]?.shadow ?? 17, `${kind} shadow`);
  }
});

test('thrown weapons aim and mirror themselves; debris drops out under reduced motion', () => {
  const { renderer, ctx } = setup();
  const shot = { x: 500, y: 500, depth: 560, z: 60, vx: -900, vy: 0, vDepth: 0, r: 14, kind: 'weapon', weapon: 'spear', element: 'air' };
  renderer.drawProjectile(shot, 1, false);
  const rotateBeforeArt = ctx.calls.findIndex(c => c.name === 'rotate');
  const mirror = ctx.calls.findIndex(c => c.name === 'scale' && c.args[0] === -1 && c.args[1] === 1);
  assert.ok(mirror >= 0, 'leftward flight is mirrored');
  assert.ok(rotateBeforeArt < 0 || rotateBeforeArt > mirror, 'never rotated half a turn first');
  ctx.calls.length = 0;
  renderer.drawProjectile({ ...shot, vx: 900 }, 1, false);
  assert.ok(!ctx.calls.some(c => c.name === 'scale' && c.args[0] === -1), 'rightward is not');

  const shard = { kind: 'shard', weapon: 'crate', index: 1, x: 500, y: 540, rot: .4, flip: -1, life: .5, maxLife: .9 };
  ctx.calls.length = 0;
  renderer.drawParticle(shard, true);
  assert.equal(ctx.calls.length, 0, 'reduced motion drops flying debris');
  renderer.drawParticle(shard, false);
  assert.ok(ctx.calls.some(c => c.name === 'fill'), 'otherwise the piece draws');
  for (const kind of ['breakPuff', 'lanternBurst']) {
    ctx.calls.length = 0;
    renderer.drawParticle({ kind, x: 500, y: 520, life: .2, maxLife: .6 }, true);
    assert.ok(ctx.calls.some(c => c.name === 'stroke' || c.name === 'fill'), `${kind} still plays`);
  }
});

test('the engine’s weapon state renders end to end: pickups, carries, flights, debris and bursts', () => {
  const { renderer, game, ctx, s } = setup();
  for (const [i, kind] of WEAPON_ORDER.entries()) s.weapons.push({ x: 80 + i * 110, y: 560, depth: 560, kind, life: 20 });
  s.player.weapon = 'guandao';
  s.player.armorItem = 'bracer';
  s.player.armorHits = 6;
  for (const kind of ['chakram', 'millstone', 'lantern', 'jian']) {
    s.player.weapon = kind;
    s.player.weaponHits = 9;
    game.throwWeapon(s.player);
  }
  game.updateProjectiles(1 / 60);
  game.shatterWeapon('knives', 700, 500, 560, -1, .2);
  game.lanternBlast({ x: 900, y: 520, depth: 560, z: 30, team: 'player', source: s.player });
  renderer.draw(s);
  renderer.draw(s, { reducedMotion: true });
  assert.equal(ctx.depth, 0);
});

test('newer weapons borrow the sound bank’s nearest weapon voice', () => {
  assert.deepEqual(cueParams('whoosh', { weapon: 'guandao', strength: 1.3 }), { weapon: 'crate', strength: 1.3 });
  assert.deepEqual(cueParams('whoosh', { weapon: 'jian', strength: .8 }), { weapon: 'spear', strength: .8 });
  assert.deepEqual(cueParams('pickupWeapon', { kind: 'millstone' }), { kind: 'crate' });
  assert.deepEqual(cueParams('weaponBreak', { kind: 'millstone' }), { kind: 'crate' });
  const staff = { weapon: 'staff', strength: .8 };
  assert.equal(cueParams('whoosh', staff), staff, 'the bank’s own voices pass through');
  const knives = { kind: 'knives' };
  assert.equal(cueParams('weaponBreak', knives), knives);
  assert.deepEqual(cueParams('throw', {}), {});
});

test('a knocked-down fighter keeps its held weapon and worn bracer in the drawing', () => {
  const { renderer, ctx, s } = setup();
  const held = [];
  renderer.drawHeldWeapon = (kind, start, end, target, t) => held.push({ kind, start, end, t });
  Object.assign(s.player, { weapon: 'lantern', weaponFuse: 3, armorItem: 'bracer', armorHits: 4, knockdown: .6, hitDirection: 1, z: 0, grounded: true });
  renderer.draw(s);
  assert.deepEqual(held.map(h => h.kind), ['lantern'], 'the lit lantern stays in view');
  const [{ start, end }] = held;
  assert.ok(Math.abs(Math.hypot(end[0] - start[0], end[1] - start[1]) - 52) < 1e-9, 'at its full length');
  assert.ok(ctx.calls.some(c => c.name === 'fill' && c.fill === JADE), 'the bracer is drawn');
  held.length = 0;
  ctx.calls.length = 0;
  Object.assign(s.player, { weapon: null, armorItem: null });
  renderer.draw(s);
  assert.equal(held.length, 0);
  assert.ok(!ctx.calls.some(c => c.fill === JADE));
});
