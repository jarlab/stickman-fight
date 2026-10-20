import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/enemy-art.js';
import * as FA from '../src/fighter-art.js';
import { ELEMENTS, ARCHETYPE_KINDS } from '../src/data.js';

// src/enemy-art.js is the approved preview block (output/asset-previews/enemies-assets.js); these
// are its smoke checks, run against the real module with the renderer's real option shape.
const TEAL = ELEMENTS.air.color;

// Recording mock 2D context: the fill/stroke colours used, every number finite, balanced saves.
function mockCtx(scale = 1) {
  const fills = new Set(), strokes = new Set();
  let calls = 0, bad = null, depth = 0;
  const num = (name, args) => { for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) bad = bad || `${name}(${args.join(',')})`; };
  const st = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1 };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k === 'getTransform') return () => ({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 });
      if (k === 'measureText') return s => ({ width: String(s).length * 6 });
      if (k === 'fill') return () => { calls++; fills.add(t.fillStyle); };
      if (k === 'stroke') return () => { calls++; strokes.add(t.strokeStyle); };
      if (k === 'fillRect') return (...a) => { calls++; num(k, a); fills.add(t.fillStyle); };
      if (k === 'save') return () => { depth++; calls++; };
      if (k === 'restore') return () => { depth--; calls++; };
      if (k in t) return t[k];
      return (...a) => { calls++; num(String(k), a); };
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad = bad || `${String(k)}=${v}`; t[k] = v; return true; },
  });
  return { ctx, fills, strokes, get calls() { return calls; }, get bad() { return bad; }, get depth() { return depth; } };
}

const JOINTS = ['hip', 'shoulder', 'head', 'rearKnee', 'rearFoot', 'frontKnee', 'frontFoot', 'rearElbow', 'rearHand', 'elbow', 'hand'];
const REST = { hip: [0, -27], shoulder: [0, -45], head: [1, -57], rearFoot: [-11, -1], frontFoot: [11, -1], rearKnee: [-10, -15], frontKnee: [8, -15], rearElbow: [-14, -32], rearHand: [-9, -27], elbow: [14, -35], hand: [19, -42], weaponAngle: -1.24 };
function poseWith(base, ov) {
  const pose = {};
  for (const k of JOINTS) pose[k] = [...base[k]];
  pose.weaponAngle = base.weaponAngle;
  const lean = ov.lean || 0, drop = ov.drop || 0;
  pose.hip = [lean * 0.3, -27 + drop]; pose.shoulder = [lean, -45 + drop]; pose.head = [lean + 1, -57 + drop];
  for (const k of JOINTS) if (ov[k]) pose[k] = [...ov[k]];
  if (ov.weaponAngle !== undefined) pose.weaponAngle = ov.weaponAngle;
  return pose;
}

test('the seven archetypes match the data tables, with distinct identity colours', () => {
  assert.deepEqual(Object.keys(A.ARCHETYPES), ARCHETYPE_KINDS);
  for (const kind of ARCHETYPE_KINDS) {
    for (const key of ['stance', 'run', 'wind', 'strike', 'special']) assert.ok(A.ARCHETYPE_POSES[kind][key], `${kind}.${key}`);
    assert.ok(A.ARCHETYPE_KO[kind], `${kind} KO skeleton`);
  }
  assert.equal(new Set(Object.values(A.ARCHETYPES).map(a => a.bar)).size, 7);
  for (const a of Object.values(A.ARCHETYPES)) assert.ok(!Object.values(ELEMENTS).some(e => e.color === a.bar), 'no archetype bar is an element colour');
});

test('every archetype in every state draws finite, balanced, flash-correct and never in air teal', () => {
  let checks = 0;
  for (const kind of ARCHETYPE_KINDS) {
    const spec = A.ARCHETYPES[kind];
    const P = A.ARCHETYPE_POSES[kind];
    const idle = poseWith(REST, P.stance);
    const poses = { idle, run: poseWith(REST, P.run), wind: poseWith(idle, P.wind), strike: poseWith(idle, P.strike), special: poseWith(idle, P.special) };
    for (const [pn, pose] of Object.entries(poses)) {
      for (const fine of [1, 3]) {
        const shapes = {
          rendererFallback: { color: TEAL, bodyColor: TEAL },
          rendererFallbackFlash: { color: TEAL, bodyColor: FA.FLASH },
          integrated: { color: spec.accent, bodyColor: spec.accent },
          integratedFlash: { color: spec.accent, bodyColor: FA.FLASH },
          bare: {},
        };
        for (const [sn, shape] of Object.entries(shapes)) {
          const m = mockCtx(fine);
          const o = { archetype: kind, element: undefined, isBoss: false, empowered: false, flutter: 1.3, speed: pn === 'run' ? 1 : 0, stroke: pn === 'strike' ? 1 : 0, recoil: 0, drive: undefined, dizzy: false, frozen: false, beforeFrontArm: null,
            draw: kind === 'hunter' ? 1 : 0, spin: kind === 'brute' && pn === 'special', cast: kind === 'sorcerer' && pn === 'special', brace: kind === 'guard' ? 1 : 0, freed: kind === 'captive' && pn === 'special', ...shape };
          const M = A.drawArchetypeBody(m.ctx, pose, o);
          assert.equal(m.bad, null, `${kind}/${pn}/${sn}: non-finite ${m.bad}`);
          assert.equal(m.depth, 0, `${kind}/${pn}/${sn}: unbalanced save/restore`);
          for (const key of ['top', 'left', 'right', 'gearTop', 'headX', 'headY', 'headR']) assert.ok(Number.isFinite(M[key]), `${kind}/${pn}/${sn}: metrics.${key}`);
          if (sn.endsWith('Flash')) {
            assert.ok(m.fills.has(FA.FLASH), `${kind}/${pn}/${sn}: flash frame has no FLASH fill`);
            assert.ok(!m.fills.has(spec.color), `${kind}/${pn}/${sn}: flash frame still uses cloth colour`);
          } else {
            assert.ok(!m.fills.has(FA.FLASH), `${kind}/${pn}/${sn}: not a flash frame but FLASH was drawn`);
            const identity = kind === 'guard' ? '#9aa8b0' : spec.color; // the warden's identity is his steel lamellar
            assert.ok(m.fills.has(identity), `${kind}/${pn}/${sn}: identity cloth colour missing`);
          }
          assert.ok(!m.fills.has(TEAL) && !m.strokes.has(TEAL), `${kind}/${pn}/${sn}: air teal leaked into the body`);
          checks++;
        }
      }
      const t = mockCtx(1);
      A.drawArchetypeTrail(t.ctx, kind, pose, 1, false);
      A.drawArchetypeTrail(t.ctx, kind, pose, 0.5, true);
      A.drawArchetypeTrail(t.ctx, kind, pose, 1, false, 'whirl');
      A.drawArchetypeTrail(t.ctx, kind, pose, 1, false, 'bash');
      assert.equal(t.bad, null, `${kind}/${pn} trail non-finite`);
      assert.equal(t.depth, 0);
      assert.ok(!t.strokes.has(TEAL), `${kind} trail teal`);
    }
    // KO via fighter-art's KO_POSE (as drawCorpse passes it): its own skeleton, inside the KO box.
    for (const dropped of [false, true]) {
      const m = mockCtx(1);
      const M = A.drawArchetypeBody(m.ctx, FA.KO_POSE, { archetype: kind, element: undefined, color: TEAL, ko: true, recoil: 1, flutter: 0, drive: 0, dropped });
      assert.equal(m.bad, null, `${kind}/ko non-finite ${m.bad}`);
      assert.ok(!m.fills.has(FA.FLASH), `${kind}/ko flash`);
      assert.ok(M.left >= A.ARCHETYPE_KO_BOX[0] - 1 && M.right <= A.ARCHETYPE_KO_BOX[2] + 1 && M.gearTop >= A.ARCHETYPE_KO_BOX[1] - 1, `${kind}/ko outside KO box: ${M.left} ${M.right} ${M.gearTop}`);
      checks++;
    }
    for (const extra of [{ recoil: 0.9 }, { dizzy: true }, { frozen: true }, { flutter: NaN, speed: Infinity, stroke: undefined, drive: NaN }]) {
      const m = mockCtx(2);
      A.drawArchetypeBody(m.ctx, idle, { archetype: kind, color: TEAL, bodyColor: TEAL, ...extra });
      assert.equal(m.bad, null, `${kind} extra ${JSON.stringify(extra)}: ${m.bad}`);
      checks++;
    }
  }
  assert.ok(checks >= 390, `${checks} checks`);
});

test('the Iron Bell closes round the monk, staff tip and feet included', () => {
  const P = A.ARCHETYPE_POSES.monk;
  const pose = poseWith(poseWith(REST, P.stance), P.special);
  const M = A.drawArchetypeBody(mockCtx(1).ctx, pose, { archetype: 'monk', color: TEAL, bodyColor: TEAL, flutter: 1 });
  const b = A.ironBellSize(M, 1);
  const bz = (a, b2, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b2 + 3 * u * t * t * c + t * t * t * d; };
  const halfAt = y => { let best = 0, err = 1e9; for (let t = 0; t <= 1; t += 0.001) { const yy = bz(0, -0.5 * b.h, -1.04 * b.h, -1.04 * b.h, t); if (Math.abs(yy - y) < err) { err = Math.abs(yy - y); best = -bz(-b.w, -0.92 * b.w, -0.82 * b.w, 0, t); } } return best; };
  const a = pose.weaponAngle, c = Math.cos(a), s = Math.sin(a), h = pose.hand;
  const tip = [h[0] + c * 46, h[1] + s * 46];
  for (const dx of [-5, 5]) {
    const px = tip[0] - s * dx, py = tip[1] + c * dx;
    assert.ok(Math.abs(px) < halfAt(py) - 2, `staff tip (${px.toFixed(1)},${py.toFixed(1)}) outside the bell`);
  }
  assert.ok(Math.abs(M.right) < b.w && Math.abs(M.left) < b.w, 'feet inside the bell');
  // The engine's ringing bell (BELL_H / BELL_W) is this same shell at scale 1.
  assert.ok(Math.abs(b.h - 88) < 0.01 && Math.abs(b.w - 44) < 0.01, `${b.h} x ${b.w}`);
  assert.ok(A.IRON_BELL_CROWN > 1);
});

test('projectiles, effects and the rescue prompt draw finite and balanced in both motion modes', () => {
  for (const rm of [false, true]) {
    for (const kind of A.ENEMY_PROJECTILES) {
      const m = mockCtx(1);
      A.drawEnemyProjectile(m.ctx, { kind, x: 100, y: 100, vx: -300, vy: 200, ox: 20, oy: 90, depth: 140, z: 40 }, 1.7, rm);
      A.drawEnemyProjectileShadow(m.ctx, { kind, x: 100, y: 100, depth: 140, z: 40 });
      assert.equal(m.bad, null, `${kind}: ${m.bad}`);
      assert.equal(m.depth, 0);
    }
    for (const kind of [...A.ENEMY_GROUND_EFFECTS, ...A.ENEMY_POST_EFFECTS]) {
      for (const life of [1, 0.75, 0.5, 0.25, 0.02, 0]) {
        const m = mockCtx(1);
        A.drawEnemyEffect(m.ctx, { kind, x: 100, y: 200, tx: 160, ty: 190, h: 88, w: 44, ring: 0.5, angle: kind === 'stuckArrow' ? 0.2 : undefined, direction: -1, life, maxLife: 1 }, 2.2, rm);
        assert.equal(m.bad, null, `${kind}@${life}: ${m.bad}`);
        assert.equal(m.depth, 0);
      }
    }
    const m = mockCtx(1);
    A.drawRescuePrompt(m.ctx, 50, 50, 3, 'E · FREE', rm);
    assert.equal(m.bad, null);
  }
  for (const k of A.ENEMY_GROUND_EFFECTS) assert.ok(!A.ENEMY_POST_EFFECTS.has(k), `${k} is in one pass only`);
});

test('archetype bodies stay cheap: no more than 270 canvas calls for an idle body', () => {
  for (const kind of ARCHETYPE_KINDS) {
    const m = mockCtx(1);
    A.drawArchetypeBody(m.ctx, poseWith(REST, A.ARCHETYPE_POSES[kind].stance), { archetype: kind, color: TEAL, bodyColor: TEAL, flutter: 1 });
    assert.ok(m.calls <= 270, `${kind}: ${m.calls} calls`);
  }
});

test('fighter-art and enemy-art share their construction state: an archetype draw leaves fighter cloth unchanged', () => {
  // The archetype body sets and clears the shared cloth state (wxClothState): a fighter drawn
  // after a knocked-down or flashing archetype draws exactly as one drawn first.
  const record = () => {
    const log = [];
    const ctx = new Proxy({ fillStyle: '', strokeStyle: '' }, {
      get(t, k) { if (k === 'getTransform') return () => ({ a: 2, b: 0 }); if (k in t) return t[k]; return (...a) => log.push(`${String(k)}(${a.join(',')})${t.fillStyle}`); },
      set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, log };
  };
  const o = { element: 'water', color: ELEMENTS.water.color, bodyColor: ELEMENTS.water.color, flutter: 1.1, speed: 0.4 };
  const first = record();
  FA.drawFighterBody(first.ctx, REST, o);
  A.drawArchetypeBody(record().ctx, FA.KO_POSE, { archetype: 'sorcerer', ko: true, bodyColor: FA.FLASH, color: TEAL });
  const after = record();
  FA.drawFighterBody(after.ctx, REST, o);
  assert.deepEqual(after.log, first.log);
});
