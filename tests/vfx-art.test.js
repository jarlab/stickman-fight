import test from 'node:test';
import assert from 'node:assert/strict';
import { VFX, fxSlash, fxHitHeavy, fxExplosion, fxIceColumn, fxGroundBurn, fxProjectileTrail } from '../src/vfx-art.js';
import { recordingContext } from './fake-canvas.js';

const ELEMENT_LIST = ['air', 'water', 'earth', 'fire', undefined];
const AGES = [0, 0.03, 0.1, 0.2, 0.33, 0.5, 0.66, 0.8, 0.95, 1];
const count = (ctx, name) => ctx.calls.filter(call => call.name === name).length;

test('the VFX table lists every effect with the approved life, anchor and render layer', () => {
  const expected = {
    hitLight: [0.22, 'body', 'top'], hitHeavy: [0.3, 'body', 'top'], guard: [0.22, 'body', 'top'], parry: [0.32, 'body', 'top'],
    air: [0.3, 'body', 'top'], water: [0.36, 'body', 'top'], earth: [0.4, 'body', 'top'], fire: [0.36, 'body', 'top'],
    slashLight: [0.2, 'attacker', 'top'], slashHeavy: [0.26, 'attacker', 'top'], slashRise: [0.22, 'attacker', 'top'],
    slashDrop: [0.24, 'attacker', 'top'], slashSpin: [0.3, 'attacker', 'split'], slashThrust: [0.18, 'attacker', 'top'],
    explosion: [0.75, 'ground', 'split'], iceColumn: [0.9, 'ground', 'split'], groundBurn: [2.4, 'ground', 'split'],
    smoke: [0.6, 'any', 'top'], smokeBurn: [0.6, 'any', 'top'], dustLand: [0.45, 'ground', 'top'], dustRun: [0.35, 'ground', 'top'],
    ko: [0.8, 'body', 'top'], spawn: [0.6, 'ground', 'top'], projectileTrail: [0.4, 'projectile', 'attached'],
    iconCome: [1.2, 'head', 'head'], iconStay: [1.2, 'head', 'head'], iconMove: [1.2, 'head', 'head'], iconJoin: [1.2, 'head', 'head'],
  };
  assert.deepEqual(Object.keys(VFX).sort(), Object.keys(expected).sort());
  for (const [key, [life, anchor, layer]] of Object.entries(expected)) {
    assert.ok(Math.abs(VFX[key].life - life) < 1e-9, `${key} lives ${life} s`);
    assert.equal(VFX[key].anchor, anchor, `${key} anchor`);
    assert.equal(VFX[key].layer, layer, `${key} layer`);
    assert.equal(typeof VFX[key].draw, 'function');
  }
  assert.equal(VFX.smokeBurn.p.variant, 'burn');
  for (const [key, variant] of [['slashLight', 'light'], ['slashHeavy', 'heavy'], ['slashRise', 'rise'], ['slashDrop', 'drop'], ['slashSpin', 'spin'], ['slashThrust', 'thrust']]) {
    assert.equal(VFX[key].p.variant, variant);
  }
});

test('every effect draws at every age, element, direction and layer with balanced state and finite paths', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('fx draw code must not call Math.random'); };
  try {
    for (const [key, def] of Object.entries(VFX)) {
      for (const element of ELEMENT_LIST) {
        for (const dir of [1, -1]) {
          for (const layer of def.layer === 'split' ? [undefined, 'back', 'front'] : [undefined]) {
            for (const reduced of [false, true]) {
              for (const t of AGES) {
                const ctx = recordingContext();
                ctx.globalAlpha = 0.8;
                def.draw(ctx, 100, 200, t, { ...def.p, element, dir, layer, reduced, heavy: dir < 0, seed: 7, floor: 40,
                  color: '#388e8b', vx: 500 * dir, vy: 40, r: 10, turn: dir * 0.6, life: def.life, radius: 34 });
                assert.equal(ctx.depth, 0, `${key} t=${t} restores everything it saves`);
                assert.equal(ctx.globalAlpha, 0.8, `${key} leaves the caller's alpha untouched`);
              }
            }
          }
        }
      }
    }
  } finally {
    Math.random = random;
  }
});

test('inked effects are fully drawn at birth and gone (or nearly) at the end of their life', () => {
  for (const [key, def] of Object.entries(VFX)) {
    if (def.layer === 'attached' || def.layer === 'head') continue;
    const at = t => { const ctx = recordingContext(); def.draw(ctx, 0, 0, t, { ...def.p, element: 'fire', dir: 1, seed: 3 }); return count(ctx, 'fill') + count(ctx, 'stroke'); };
    const peak = Math.max(at(0.05), at(0.15), at(0.3));
    assert.ok(peak > 0, `${key} draws while alive`);
    assert.ok(at(1) < peak, `${key} has shrunk away by t = 1`);
  }
});

test('split effects separate their back and front layers around a body', () => {
  for (const [draw, t] of [[fxExplosion, 0.3], [fxIceColumn, 0.35], [fxGroundBurn, 0.4]]) {
    const fills = layer => { const ctx = recordingContext(); draw(ctx, 0, 0, t, { seed: 2, layer, life: 2.4 }); return count(ctx, 'fill'); };
    const back = fills('back'), front = fills('front'), whole = fills(undefined);
    assert.ok(back > 0 && front > 0, `${draw.name} draws on both sides of the body`);
    assert.ok(whole >= Math.max(back, front), `${draw.name} draws everything without a layer`);
  }
  // The spin sweep clips the same arc into a far half (before) and a near half (after).
  for (const layer of ['back', 'front']) {
    const ctx = recordingContext();
    fxSlash(ctx, 0, 0, 0.25, { variant: 'spin', element: 'water', dir: 1, layer });
    assert.ok(ctx.calls.some(call => call.name === 'clip'), `spin ${layer} half is clipped`);
  }
});

test('reduced motion keeps the readable core but drops debris and flecks', () => {
  for (const [key, def] of Object.entries(VFX)) {
    const calls = reduced => { const ctx = recordingContext(); def.draw(ctx, 0, 0, 0.3, { ...def.p, element: 'earth', dir: 1, seed: 5, heavy: true, reduced, vx: 400, r: 10, life: def.life }); return ctx.calls.length; };
    assert.ok(calls(true) <= calls(false), `${key} draws no more under reduced motion`);
    assert.ok(calls(true) > 0, `${key} still draws under reduced motion`);
  }
});

test('the per-spawn seed varies an effect without randomness', () => {
  const path = seed => { const ctx = recordingContext(); fxHitHeavy(ctx, 0, 0, 0.2, { element: 'air', dir: 1, seed }); return JSON.stringify(ctx.calls.map(call => call.args)); };
  assert.equal(path(4), path(4), 'the same seed draws the same burst');
  assert.notEqual(path(4), path(5), 'another seed draws a different burst');
});

test('the projectile trail bends with steering and sheds element motes on its loop phase', () => {
  const spread = turn => {
    const ctx = recordingContext();
    fxProjectileTrail(ctx, 0, 0, 0.4, { vx: 500, vy: 0, element: 'air', r: 9, turn });
    return Math.max(...ctx.calls.filter(c => c.name === 'lineTo').map(c => Math.abs(c.args[1])));
  };
  assert.ok(spread(1.2) > spread(0) + 10, 'a steering ball trail curves away from the straight line');
  const colors = element => { const ctx = recordingContext(); fxProjectileTrail(ctx, 0, 0, 0.4, { vx: 500, element, r: 9 }); return new Set(ctx.calls.map(c => c.fill)); };
  assert.ok(colors('fire').has('#ec8a45'), 'fire sheds flame licks');
  assert.ok(colors('earth').has('#cdb67b'), 'earth sheds grit');
  const motes = phase => { const ctx = recordingContext(); fxProjectileTrail(ctx, 0, 0, phase, { vx: 500, element: 'water', r: 9 }); return JSON.stringify(ctx.calls.slice(-6).map(c => c.args)); };
  assert.notEqual(motes(0.1), motes(0.6), 'motes move along the trail as the phase loops');
});
