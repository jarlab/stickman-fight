import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFighterBody, clothDrive, KO_POSE, KO_BOX, INK, PAPER, FLASH } from '../src/fighter-art.js';
import { ELEMENTS } from '../src/data.js';

// Records every call and checks that all path coordinates stay finite.
function recordingContext(pxPerUnit = 1) {
  const calls = [];
  let depth = 0;
  let maxDepth = 0;
  const ctx = { calls, get depth() { return depth; }, get maxDepth() { return maxDepth; } };
  for (const name of ['beginPath', 'closePath', 'fill', 'stroke', 'translate', 'rotate', 'scale', 'moveTo', 'lineTo', 'arc', 'ellipse', 'quadraticCurveTo']) {
    ctx[name] = (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} got ${value}`);
      calls.push(name);
    };
  }
  ctx.save = () => { depth += 1; maxDepth = Math.max(maxDepth, depth); calls.push('save'); };
  ctx.restore = () => { depth -= 1; calls.push('restore'); };
  ctx.getTransform = () => ({ a: pxPerUnit, b: 0, c: 0, d: pxPerUnit, e: 0, f: 0 });
  return ctx;
}

const IDLE = {
  hip: [-0.9, -27], shoulder: [-3, -45], head: [-2, -57], rearKnee: [-10, -15], rearFoot: [-18, -1],
  frontKnee: [8, -15], frontFoot: [17, -1], rearElbow: [-15, -32], rearHand: [-17, -42], elbow: [17, -35], hand: [26, -44], weaponAngle: -1.24,
};

test('fighter art shares the game palette constants', () => {
  assert.equal(INK, '#263b3c');
  assert.equal(PAPER, '#fff8e8');
  assert.equal(FLASH, '#fffdf1');
});

test('every element, boss phase, flash and knockdown draws with balanced state and finite paths', () => {
  for (const element of Object.keys(ELEMENTS)) {
    const color = ELEMENTS[element].color;
    for (const variant of [{}, { isBoss: true }, { isBoss: true, empowered: true }, { bodyColor: FLASH }, { ko: true, recoil: 1 }, { dizzy: true }, { stroke: 1, speed: -1 }]) {
      for (const px of [1, 2]) {
        const ctx = recordingContext(px);
        const pose = variant.ko ? KO_POSE : IDLE;
        const metrics = drawFighterBody(ctx, pose, { element, color, flutter: 1.3, ...variant });
        assert.equal(ctx.depth, 0, `${element} ${JSON.stringify(variant)} restores everything it saves`);
        assert.ok(ctx.calls.filter(call => call === 'fill' || call === 'stroke').length <= 40, 'stays within the fill/stroke budget');
        for (const key of ['top', 'left', 'right', 'torso', 'headX', 'headY', 'headR']) assert.ok(Number.isFinite(metrics[key]), `${key} is finite`);
        assert.ok(metrics.top < metrics.headY - metrics.headR, `${element}: headgear top sits above the head`);
        assert.ok(metrics.left < metrics.headX && metrics.right > metrics.headX);
      }
    }
  }
});

test('regular fighters keep their headgear below the HP bar in the idle stance', () => {
  for (const element of Object.keys(ELEMENTS)) {
    const metrics = drawFighterBody(recordingContext(), IDLE, { element, color: ELEMENTS[element].color });
    // The non-boss bar sits at y - h - 15 = -81 with a 6px gap required above the headgear.
    assert.ok(metrics.top - 6 >= -81, `${element} top ${metrics.top.toFixed(1)} clears the HP bar`);
  }
});

test('a held weapon is drawn after the head and before the front arm', () => {
  const ctx = recordingContext();
  let at = -1;
  drawFighterBody(ctx, IDLE, { element: 'earth', color: ELEMENTS.earth.color, beforeFrontArm: () => { at = ctx.calls.length; ctx.calls.push('weapon'); } });
  assert.ok(at > 0, 'callback runs');
  const after = ctx.calls.slice(at + 1);
  assert.ok(after.includes('fill'), 'the front arm and fist are drawn over the weapon');
  assert.ok(ctx.calls.slice(0, at).filter(call => call === 'fill').length > 5, 'body and head are drawn first');
});

test('cloth drive lifts less when backpedalling and saturates at 1', () => {
  assert.ok(clothDrive(-1, 0, 0) < clothDrive(1, 0, 0));
  assert.equal(clothDrive(1, 1, 1), 1);
  assert.equal(clothDrive(0, 0, 0), 0);
});

// Tracks the transform stack and the extent of everything drawn (in the caller's units).
function boundsContext() {
  const ctx = recordingContext();
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, fills: [] };
  const mark = (x, y, r = 0) => {
    const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5];
    const s = Math.hypot(m[0], m[1]) * r;
    box.x0 = Math.min(box.x0, px - s); box.x1 = Math.max(box.x1, px + s);
    box.y0 = Math.min(box.y0, py - s); box.y1 = Math.max(box.y1, py + s);
  };
  const mul = (a, b, c, d, e, f) => {
    m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  };
  const { save, restore } = ctx;
  ctx.save = () => { save(); stack.push(m); };
  ctx.restore = () => { restore(); m = stack.pop(); };
  ctx.translate = (x, y) => mul(1, 0, 0, 1, x, y);
  ctx.scale = (x, y) => mul(x, 0, 0, y, 0, 0);
  ctx.rotate = a => mul(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0);
  ctx.moveTo = ctx.lineTo = (x, y) => mark(x, y);
  ctx.quadraticCurveTo = (cx, cy, x, y) => { mark(cx, cy); mark(x, y); };
  ctx.arc = (x, y, r) => mark(x, y, r);
  ctx.ellipse = (x, y, rx, ry) => mark(x, y, Math.max(rx, ry));
  const fill = ctx.fill;
  ctx.fill = () => { fill(); box.fills.push(ctx.fillStyle); };
  ctx.box = box;
  return ctx;
}

test('the KO layer box holds every knocked-down build, boss and flash variant', () => {
  for (const element of Object.keys(ELEMENTS)) {
    for (const variant of [{}, { isBoss: true }, { isBoss: true, empowered: true }, { bodyColor: FLASH }, { drive: 1 }, { drive: 0 }]) {
      const ctx = boundsContext();
      drawFighterBody(ctx, KO_POSE, { element, color: ELEMENTS[element].color, ko: true, recoil: 1, flutter: 0.7, ...variant });
      const { x0, y0, x1, y1 } = ctx.box;
      const tag = `${element} ${JSON.stringify(variant)}`;
      assert.ok(x0 >= KO_BOX[0] && y0 >= KO_BOX[1] && x1 <= KO_BOX[2] && y1 <= KO_BOX[3],
        `${tag}: drawn [${[x0, y0, x1, y1].map(v => v.toFixed(1))}] fits KO_BOX`);
    }
  }
});

test('frozen cloth hangs inside the overlay extents, so the ice block covers it', () => {
  for (const element of Object.keys(ELEMENTS)) {
    for (const variant of [{}, { isBoss: true }, { isBoss: true, empowered: true }]) {
      const ctx = boundsContext();
      const metrics = drawFighterBody(ctx, IDLE, { element, color: ELEMENTS[element].color, frozen: true, ...variant });
      // The renderer's ice block reaches 4 units past metrics.left/right (and 22+ either way).
      const left = Math.min(-22 * (variant.isBoss ? 1.14 : 1), metrics.left - 4);
      assert.ok(ctx.box.x0 >= left - 1.5, `${element} ${JSON.stringify(variant)}: cloth x ${ctx.box.x0.toFixed(1)} stays inside ${left.toFixed(1)}`);
    }
  }
});

test('hit flash outlines cloth in ink like the limbs', () => {
  const plain = boundsContext();
  drawFighterBody(plain, IDLE, { element: 'air', color: ELEMENTS.air.color, isBoss: true });
  const flash = boundsContext();
  drawFighterBody(flash, IDLE, { element: 'air', color: ELEMENTS.air.color, isBoss: true, bodyColor: FLASH });
  const inkFills = ctx => ctx.box.fills.filter(fill => fill === INK).length;
  // Cape (2 ribbons), streamers (2), sleeve flaps and sleeves (4) each gain an ink pass.
  assert.ok(inkFills(flash) >= inkFills(plain) + 8, `${inkFills(flash)} ink fills in flash vs ${inkFills(plain)}`);
});

test('bad inputs never leak canvas state or produce NaN paths', () => {
  for (const element of ['constructor', '__proto__', 'toString', 'hasOwnProperty', undefined]) {
    const ctx = recordingContext();
    const metrics = drawFighterBody(ctx, IDLE, { element, color: '#459d91' });
    assert.equal(ctx.depth, 0, `${element} restores state`);
    assert.ok(Number.isFinite(metrics.top));
  }
  // recordingContext asserts every path coordinate is finite.
  for (const bad of [NaN, Infinity, -Infinity]) {
    drawFighterBody(recordingContext(), IDLE, { element: 'air', color: '#459d91', drive: bad, flutter: bad, stroke: bad, recoil: bad, speed: bad });
  }
  const ctx = recordingContext();
  assert.throws(() => drawFighterBody(ctx, IDLE, { element: 'fire', color: '#dc7251', beforeFrontArm: () => { throw new Error('weapon'); } }), /weapon/);
  assert.equal(ctx.depth, 0, 'a throwing weapon callback still restores the save stack');
  // Non-hex and 8-digit colours still draw.
  for (const color of ['rgb(1,2,3)', '#459d91ff', '#abc']) drawFighterBody(recordingContext(), IDLE, { element: 'earth', color });
});
