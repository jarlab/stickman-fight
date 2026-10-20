// src/pickup-art.js on a recording context, and the renderer's consumable hooks into it: the
// ground pickups and the E seal target, the use pose and item track, the weapon stow, flung and
// knocked items, the consume sparkle, the censer field and prop, timed buffs and the despawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { Renderer } from '../src/renderer.js';
import { WEAPON_ART } from '../src/weapon-art.js';
import { CONSUMABLES, CP_ORBS, CP_STILL, CP_SPARKLE_TIME, drawConsumable, drawConsumableItem, consumePose, drawConsumeHeld, consumeStow,
  consumeFling, drawFlung, drawConsumeSparkle, consumableFade, drawDespawnPuff, drawIncenseAura, drawConsumableBuff } from '../src/pickup-art.js';
import { recordingContext, fakeCanvas } from './fake-canvas.js';

const STEP = 1 / 120;
const KINDS = Object.keys(CONSUMABLES);
const ELEMENTS = ['air', 'water', 'earth', 'fire'];
const SPARK_DASH = [4.5, 3.5];
const AURA_DASH = [10, 8];
const stance = () => ({ hip: [0, -27], shoulder: [-4, -45], head: [-3, -57], rearKnee: [-13, -12], rearFoot: [-20, -1], frontKnee: [16, -12],
  frontFoot: [21, -1], rearElbow: [-15, -34], rearHand: [-5, -44], elbow: [18, -30], hand: [29, -35], weaponAngle: -1.24 });

function setup(options = {}) {
  const { canvas, ctx } = fakeCanvas();
  const renderer = new Renderer(canvas);
  renderer.background = () => ({});
  const game = new Game({ element: 'air', arena: 'air', mode: 'survival', seed: 7, ...options });
  game.start();
  Object.assign(game.state, { enemies: [], projectiles: [], effects: [], particles: [], floaters: [], weapons: [], corpses: [], auras: [],
    banner: '', bannerTime: 0, waveDelay: 999, weaponTimer: 999 });
  Object.assign(game.state.player, { x: 400, depth: 560, y: 560, invulnerable: 0, facing: 1 });
  return { renderer, game, ctx, s: game.state };
}
// The real clock with a real draw every 60 fps frame (as main.js does).
function play(game, renderer, seconds, options = {}, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    game.tick(input, STEP);
    game.tick(input, STEP);
    renderer.draw(game.state, options);
  }
}
const dashes = (ctx, dash) => ctx.calls.filter(c => c.name === 'setLineDash' && c.args[0].length === 2 && c.args[0][0] === dash[0] && c.args[0][1] === dash[1]).length;

test('every pickup drawing runs in every state with finite numbers, no text and a balanced save stack', () => {
  const ctx = recordingContext();
  for (const kind of KINDS) {
    for (const variant of ELEMENTS) {
      for (const life of [20, 4.2, 1, 0.2, 0]) for (const reduced of [false, true]) {
        assert.equal(drawConsumable(ctx, { kind, variant, x: 100, y: 200, life, seed: 1.2 }, reduced ? 0 : 1.3, life === 20, reduced), true);
      }
      for (const flags of [0, CP_STILL, 1]) drawConsumableItem(ctx, kind, 1.1, variant, flags, .5);
      for (let p = 0; p <= 1.0001; p += .05) {
        const pose = consumePose(stance(), kind, p, [40, 8]);
        drawConsumeHeld(ctx, kind, variant, pose, 1.4);
        for (const weapon of ['staff', 'crate']) for (const point of consumeStow(pose, weapon)) assert.ok(point.every(Number.isFinite));
        for (const knocked of [false, true]) {
          const fling = consumeFling(pose, kind, variant, 300, 500, 1, -1, knocked);
          if (fling) for (const age of [0, .1, .3, .6, 1]) drawFlung(ctx, fling, age, 1);
        }
      }
      for (const p of [0, .1, .3, .5, .8, .99]) for (const reduced of [false, true]) drawConsumeSparkle(ctx, kind, variant, 300, 500, p, 66, -1, reduced);
    }
  }
  for (const r of [1, .6, .1, .01]) drawIncenseAura(ctx, 300, 500, 1.2, r);
  for (const kind of ['pill', 'gourd', 'incense']) for (const r of [1, .5, .1]) for (const layer of [0, 1]) drawConsumableBuff(ctx, kind, 300, 500, 66, 2.1, r, layer);
  for (const p of [0, .3, .9]) drawDespawnPuff(ctx, 10, 10, p);
  assert.equal(ctx.depth, 0);
  assert.ok(!ctx.calls.some(c => c.name === 'fillText' || c.name === 'strokeText' || c.name.startsWith('create')), 'no text, no gradients');
  assert.equal(drawConsumable(ctx, { kind: 'staff', x: 0, y: 0 }, 1), false, 'weapons are not consumables');
});

test('the item track hands off without a jump: floor -> hand on the first frame, the plant spot equals the world censer', () => {
  for (const kind of KINDS) {
    const spec = CONSUMABLES[kind];
    const first = consumePose(stance(), kind, 0, [40, 8]).item;
    assert.equal(first[0], 1, `${kind}: shown from the start`);
    assert.ok(Math.hypot(first[1] - (40 + spec.grip[0] + spec.seat[0]), first[2] - (8 + spec.grip[1] + spec.seat[1] - spec.hover - spec.bob * .5)) < .05, `${kind} starts where it lay`);
    assert.equal(consumePose(stance(), kind, 1, [40, 8]).item[0], 0, `${kind}: gone by the end`);
  }
  const it = consumePose(stance(), 'incense', CONSUMABLES.incense.applyAt - 1e-6, [40, 8]).item;
  assert.ok(Math.hypot(it[1] - CONSUMABLES.incense.grip[0] * it[4] - 26, it[2] - CONSUMABLES.incense.grip[1] * it[4]) < .05, 'censer hand-off at the plant spot');
});

test('only the item the player\'s E would take shows its seal', () => {
  const { renderer, game, ctx, s } = setup();
  const near = [];
  const draw = renderer.drawWeaponPickup.bind(renderer);
  renderer.drawWeaponPickup = (w, t, rm, isNear) => { near.push([w.kind, !!isNear]); return draw(w, t, rm, isNear); };
  s.weapons = [{ kind: 'bun', x: 700, y: 560, depth: 560, life: 20 }, { kind: 'peach', x: 440, y: 570, depth: 570, life: 20 },
    { kind: 'heal', x: 380, y: 560, depth: 560, life: 20 }];
  renderer.draw(s);
  // Intentional change (Arenas review): E takes the nearest item in reach, no longer the first
  // listed, so the seal sits on the heal tonic underfoot rather than the peach at the edge.
  assert.deepEqual(near.sort(), [['bun', false], ['heal', true], ['peach', false]], 'the nearest in reach (Game.pickup choice)');
  near.length = 0;
  s.player.consume = { kind: 'heal', t: .1, duration: .5, from: [20, 0] };
  renderer.draw(s);
  assert.ok(near.every(([, isNear]) => !isNear), 'no seal while a use plays');
  s.player.consume = null;
  // A weapon's E badge follows the same rule: on the target only.
  s.weapons = [{ kind: 'staff', x: 420, y: 560, depth: 560, life: 20 }, { kind: 'spear', x: 450, y: 560, depth: 560, life: 20 },
    { kind: 'heal', x: 380, y: 560, depth: 560, life: 20 }];
  const badges = () => {
    near.length = 0;
    ctx.calls.length = 0;
    renderer.draw(s);
    return ctx.calls.filter(c => c.name === 'fillText' && c.args[0] === 'E').length;
  };
  assert.equal(badges(), 1, 'one E badge, on the staff');
  assert.deepEqual(near.sort(), [['heal', false], ['spear', false], ['staff', true]]);
  // None mid-air (E does nothing there), and none when E would grab a dizzy opponent instead.
  Object.assign(s.player, { grounded: false, z: 30 });
  badges();
  assert.ok(near.every(([, isNear]) => !isNear), 'no prompt in the air');
  Object.assign(s.player, { grounded: true, z: 0 });
  const foe = game.makeFighter('enemy', 'earth', 440, 560);
  Object.assign(foe, { facing: -1, stun: .8, hitType: 'dizzy', invulnerable: 0, spawnReveal: 0 });
  s.enemies.push(foe);
  assert.equal(badges(), 0, 'E grabs the dizzy foe: no pickup prompt');
  assert.ok(near.every(([, isNear]) => !isNear));
  // Armed, E cannot grab: the pickup in reach is the target again.
  Object.assign(s.player, { weapon: 'knives', weaponHits: 9 });
  badges();
  assert.deepEqual(near.filter(([, isNear]) => isNear), [['staff', true]]);
});

test('a consuming fighter draws its use pose; a held weapon is stowed behind the body, an upright one as a pack, short ones in the sash', () => {
  const { renderer, game, s } = setup();
  const p = s.player;
  const held = [];
  renderer.drawHeldWeapon = (kind, start, end) => held.push({ kind, start, end });
  for (const weapon of ['staff', 'crate']) {
    held.length = 0;
    Object.assign(p, { weapon, weaponHits: 5, consume: null });
    s.weapons = [{ kind: 'bun', x: p.x + 30, y: p.depth, depth: p.depth, life: 20 }];
    game.pickup(p);
    play(game, renderer, .1);
    const pose = renderer.fighterAnimations.get(p).pose;
    assert.equal(pose.item[0], 1, 'the use pose carries the item');
    const [a, b] = WEAPON_ART[weapon].upright ? (() => { const [c, d] = consumeStow(pose, 'crate'); const cx = (c[0] + d[0]) / 2, cy = (c[1] + d[1]) / 2; return [[cx - 23, cy], [cx + 29, cy]]; })() : consumeStow(pose, weapon);
    assert.deepEqual(held.at(-1), { kind: weapon, start: a, end: b }, `${weapon} stowed`);
    assert.ok(held.at(-1).start[0] < 0, `${weapon} rides behind the body`);
    if (weapon === 'crate') near(Math.hypot(b[0] - a[0], b[1] - a[1]), 52, 1e-9, 'a full-size pack');
    play(game, renderer, .4);
    assert.equal(p.consume, null);
    held.length = 0;
    renderer.draw(s);
    assert.ok(held.length && held.at(-1).start[0] > 0, `${weapon} back in hand`);
  }
  // The short one-hand carries ride in the sash, clear of the torso line (on the back line the
  // knife pair and a stone hid behind the body): the knives at the back, blades out behind,
  // the stone at the front like a pouch. Both keep a full-size 52-unit axis.
  for (const weapon of ['knives', 'stone']) {
    held.length = 0;
    Object.assign(p, { weapon, weaponHits: 5, consume: null });
    s.weapons = [{ kind: 'heal', x: p.x + 30, y: p.depth, depth: p.depth, life: 20 }];
    game.pickup(p);
    play(game, renderer, .2);
    const { hip, shoulder } = renderer.fighterAnimations.get(p).pose;
    const { start: a, end: b } = held.at(-1);
    near(Math.hypot(b[0] - a[0], b[1] - a[1]), 52, 1e-9, `${weapon}: full size`);
    const grip = [a[0] + (b[0] - a[0]) * 23 / 52, a[1] + (b[1] - a[1]) * 23 / 52];
    const tx = shoulder[0] - hip[0], ty = shoulder[1] - hip[1], l = Math.hypot(tx, ty);
    const off = ((grip[0] - hip[0]) * ty - (grip[1] - hip[1]) * tx) / l; // > 0 behind the spine
    const along = ((grip[0] - hip[0]) * tx + (grip[1] - hip[1]) * ty) / l;
    assert.ok(along > 0 && along < 8, `${weapon}: at the sash, just above the hip (${along})`);
    if (weapon === 'knives') {
      assert.ok(off > 6, `knives tucked in at the back (${off})`);
      assert.ok(b[0] < grip[0] - 20, 'blades out behind');
    } else assert.ok(off < -10, `the stone rides at the front (${off})`);
    play(game, renderer, .5);
    assert.equal(p.consume, null);
  }
});
function near(actual, expected, tolerance, message) { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`); }

test('flung vessels: a drained flask leaves the hand once and shatters; a blow knocks the item out; reduced motion flings nothing', () => {
  const { renderer, game, s } = setup();
  const p = s.player;
  s.weapons = [{ kind: 'heal', x: p.x + 30, y: p.depth, depth: p.depth, life: 20 }];
  renderer.draw(s);
  game.pickup(p);
  play(game, renderer, CONSUMABLES.heal.useTime + .1);
  assert.deepEqual(renderer.flung.map(f => [f.kind, f.mode]), [['heal', 'shatter']], 'one flung flask');
  const fling = renderer.flung[0];
  assert.ok(Math.abs(fling.x - p.x) < 60 && fling.floor === p.y, 'from the hand, onto the floor line');
  play(game, renderer, 1.5);
  assert.equal(renderer.flung.length, 0, 'pruned once it has played out');
  // Knocked out: a blow mid-use flings the item from where it was last drawn.
  s.weapons = [{ kind: 'orb', variant: 'fire', x: p.x + 30, y: p.depth, depth: p.depth, life: 20 }];
  game.pickup(p);
  play(game, renderer, .15);
  game.damage(p, 5, -1, null, { knockback: 100 });
  renderer.draw(s);
  assert.deepEqual(renderer.flung.map(f => [f.kind, f.mode]), [['orb', 'puff']], 'the orb bursts out of the hand');
  // Reduced motion: no flung objects at all.
  const still = setup();
  still.s.weapons = [{ kind: 'energy', x: 430, y: 560, depth: 560, life: 20 }];
  still.renderer.draw(still.s, { reducedMotion: true });
  still.game.pickup(still.s.player);
  play(still.game, still.renderer, 1, { reducedMotion: true });
  assert.equal(still.renderer.flung.length, 0);
});

test('the consume sparkle, the censer field and prop, and the timed buffs draw from game state', () => {
  const { renderer, game, ctx, s } = setup();
  const p = s.player;
  s.weapons = [{ kind: 'incense', x: p.x + 30, y: p.depth, depth: p.depth, life: 20 }];
  game.pickup(p);
  for (let i = 0; i < 300 && !s.auras.length; i += 1) game.tick({}, STEP);
  assert.equal(s.auras.length, 1);
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.ok(dashes(ctx, SPARK_DASH) > 0, 'the converging dashed sparkle ring');
  assert.ok(dashes(ctx, AURA_DASH) > 0, 'the censer field ring');
  assert.ok(ctx.calls.some(c => c.name === 'fill' && c.fill === '#a8844d'), 'the bronze censer prop');
  ctx.calls.length = 0;
  renderer.draw(s, { reducedMotion: true });
  assert.equal(dashes(ctx, SPARK_DASH), 0, 'reduced motion keeps only the pulse ring and badge');
  // Buffs: the elixir's gold ring in two layers, the qi ribbon.
  play(game, renderer, 1);
  Object.assign(p, { power: 4, qiFlow: 0 });
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.ok(ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#a8771f') && ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#dfae3d'), 'elixir ring, far and near halves');
  Object.assign(p, { power: 0, qiFlow: 4 });
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.ok(ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#3a8fd0'), 'qi ribbon');
  assert.ok(p.censerRegen > 0 && ctx.calls.some(c => c.name === 'stroke' && c.stroke === '#4fa35c'), 'censer regen crosses');
  // The prop's ground shadow fades and shrinks with it over its last CENSER_FADE (0.8 s).
  const shadow = life => {
    s.auras[0].life = life;
    ctx.calls.length = 0;
    renderer.draw(s);
    return ctx.calls.find(c => c.name === 'ellipse' && c.args[0] === s.auras[0].x && c.args[1] === s.auras[0].depth + 2);
  };
  const full = shadow(5);
  near(full.args[2], CONSUMABLES.incense.shadow, 1e-9, 'full size');
  const half = shadow(.4);
  near(half.args[2], CONSUMABLES.incense.shadow * .7, 1e-9, 'shrinking');
  near(half.alpha, full.alpha / 2, 1e-9, 'fading');
  assert.equal(shadow(0), undefined, 'gone with the prop');
  // The field burns out and the prop goes with it.
  play(game, renderer, 10);
  ctx.calls.length = 0;
  renderer.draw(s);
  assert.equal(s.auras.length, 0);
  assert.equal(dashes(ctx, AURA_DASH), 0);
});

test('pickups blink out over their last 5 s and dissolve; weapons too; reduced motion fades steadily', () => {
  assert.equal(consumableFade(20), 1);
  assert.equal(consumableFade(4.2), .3, 'blink off');
  assert.equal(consumableFade(4.0), 1, 'blink on');
  near(consumableFade(.2), .2 / .35, 1e-9, 'dissolving');
  assert.equal(consumableFade(0), 0);
  near(consumableFade(2.4, true), .45 + .55 * (2.4 - .35) / (5 - .35), 1e-9, 'reduced: steady fade');
  const { renderer, ctx } = setup();
  for (const [life, alpha] of [[20, 1], [4.2, .3], [4.0, 1]]) {
    ctx.calls.length = 0;
    renderer.drawWeaponPickup({ x: 500, y: 560, kind: 'staff', life }, 1);
    assert.ok(ctx.calls.filter(c => c.name === 'fill' && c.fill !== '#fffbe9' && c.fill !== '#263b3c').every(c => Math.abs(c.alpha - alpha) < 1e-9), `staff at life ${life}`);
  }
  ctx.calls.length = 0;
  renderer.drawWeaponPickup({ x: 500, y: 560, kind: 'staff', life: .2 }, 1);
  assert.ok(ctx.calls.some(c => c.name === 'fill' && c.fill === '#fffdf1'), 'the paper-wash dissolve');
  ctx.calls.length = 0;
  renderer.drawWeaponPickup({ x: 500, y: 560, kind: 'staff', life: .2 }, 0, true);
  assert.ok(!ctx.calls.some(c => c.name === 'fill' && c.fill === '#fffdf1'), 'no dissolve puff under reduced motion');
  // The shadow shrinks with the blink; a consumable's shadow radius is its own.
  for (const [kind, life, r] of [['heal', 20, CONSUMABLES.heal.shadow], ['heal', 4.2, CONSUMABLES.heal.shadow * .4], ['orb', 20, CONSUMABLES.orb.shadow], ['staff', 4.2, WEAPON_ART.staff.shadow * .4]]) {
    ctx.calls.length = 0;
    renderer.drawGroundShadow({ x: 500, y: 560, depth: 560, kind, life }, 'pickup');
    near(ctx.calls.find(c => c.name === 'ellipse').args[2], r, 1e-9, `${kind} shadow at ${life}`);
  }
  assert.ok(CP_ORBS.fire && CP_SPARKLE_TIME === .7);
});
