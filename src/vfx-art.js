// Fourfold ink VFX set. Pure draw functions: no DOM, no Math.random, no gradients, no
// shadowBlur, no per-frame arrays. Each effect is fx(ctx, x, y, t, p):
//   t  0..1 normalised age (0 = spawn, 1 = gone). In the engine: t = 1 - life / maxLife.
//   p  { dir: +-1 (hit/facing direction), element: 'air'|'water'|'earth'|'fire', scale: 1,
//        heavy: bool, seed: int (per-instance variation), color: team colour for icons,
//        variant: slash / smoke style, layer: 'back'|'front' (split effects; omit = both),
//        floor: px from a body anchor down to the floor (debris lands there; default 36),
//        reduced: reducedMotion }
// Body effects take (x, y) at the hit point; ground effects take (x, y) at the floor point.
// Fade rule: every shape with an ink rim stays at full alpha and exits by shrinking, thinning
// or eroding; only single plain fills and strokes fade with alpha. So no doubled rims or muddy
// stacks while an effect dies. Draw at ctx.globalAlpha = 1 (a caller alpha brings them back).
//
// The VFX table at the end maps each engine effect key to its draw function, life, anchor and
// render layer. The engine spawns { kind: 'vfx', fx: key, x, y, life, maxLife, p } (see
// Game.vfx) and the renderer routes it by VFX[fx].layer.

const FX_INK = '#263b3c';
const FX_INK_SOFT = '#4f625f';
const FX_PAPER = '#fff8e8';
const FX_WHITE = '#fffdf1';
const FX_GOLD = '#d9a93f';
const FX_GOLD_HOT = '#ffcf4d';
const FX_SEAL = '#b8402f';
const FX_TAU = Math.PI * 2;
// Per-element ramps: deep (rim), base (game colour), light, pale (highlight).
const FX_EL = {
  air: { deep: '#1f5c59', base: '#388e8b', light: '#9fd8c6', pale: '#e6f7ee' },
  water: { deep: '#24527f', base: '#397fbe', light: '#8fcae6', pale: '#e4f4f8' },
  earth: { deep: '#5c4824', base: '#9a7935', light: '#cdb67b', pale: '#efe3bf' },
  fire: { deep: '#7d3322', base: '#c5573f', light: '#ef9a52', pale: '#ffe7ad' },
};
const FX_NEUTRAL = { deep: FX_INK, base: '#7d8a83', light: '#cfd6cc', pale: FX_PAPER };
const FX_DUST = { fill: '#e6d8b4', edge: '#9a875c', dark: '#7f6d47', grit: '#6f5f3f' };
const FX_SMOKE = { fill: '#ebe5d6', edge: '#948b76', top: '#f8f4ea', dark: '#8f887a', darkEdge: '#5d5a50', darkTop: '#b2ab9c' };
const FX_BURN = { fill: '#ad9e8b', edge: '#6e4636', top: '#d6c8b4', ember: '#f2a457', hot: '#ffd27e' };
const FX_ICE = { fill: '#d9f2f8', face: '#a3d5e5', edge: '#3d7e9b', glint: '#f8ffff', frost: '#e8f6f8', frostEdge: '#7fbcd0' };
const FX_FLAME = { outer: '#c5573f', mid: '#ec8a45', core: '#ffd27e', hot: '#fff3c4', rim: '#7d3322', ember: '#f2a457' };
const FX_DEFAULT = {};
// Shared scratch point for fxBallistic / fxTrailPt (written, read at once; never allocated).
const FX_PT = { x: 0, y: 0, a: 0, rest: 0 };

const fxEl = element => FX_EL[element] || FX_NEUTRAL;
const fxClamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const fxSeg = (t, a, b) => fxClamp((t - a) / (b - a));
const fxOut = v => 1 - (1 - v) * (1 - v);
const fxOut3 = v => { const q = 1 - v; return 1 - q * q * q; };
const fxBack = v => { const q = v - 1; return v <= 0 ? 0 : 1 + 2.7 * q * q * q + 1.7 * q * q; };
const fxBell = v => (v <= 0 || v >= 1 ? 0 : Math.sin(Math.PI * v));
// Floor line below a body-anchored effect, in its local units (p.floor = target.depth - y).
const fxFloor = p => (p.floor ?? 36) / (p.scale || 1);
// Deterministic 0..1 noise per (seed, index): stable shapes, no Math.random in draw code.
function fxHash(seed, i) {
  const n = Math.sin(seed * 91.37 + i * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}
// Brush pressure along a stroke: rises from b0 to 1 at peak, falls to b1 at the end.
function fxProfile(u, peak, b0, b1) {
  return u < peak ? b0 + (1 - b0) * Math.sin(u / peak * Math.PI / 2)
    : b1 + (1 - b1) * Math.cos((u - peak) / (1 - peak) * Math.PI / 2);
}
// Ink outline for any filled path: stroke it twice the rim width, then fill over the inner
// half. Unions of overlapping sub-paths keep only their outer outline. Full alpha only.
function fxInked(ctx, fill, rim, width) {
  if (rim && width > 0) { ctx.strokeStyle = rim; ctx.lineWidth = width * 2; ctx.stroke(); }
  ctx.fillStyle = fill;
  ctx.fill();
}
// Ballistic debris that stops on the floor line fl: start (x0, y0), velocity (vx, vy) per unit
// k, gravity g per k^2. Writes FX_PT.x / y and FX_PT.rest (k since landing; 0 while flying).
function fxBallistic(x0, y0, vx, vy, g, k, fl) {
  const c = y0 - fl;
  let kc = 1e9;
  if (c >= 0) kc = 0;
  else if (g > 0) kc = (-vy + Math.sqrt(vy * vy - 4 * g * c)) / (2 * g);
  else if (vy > 0) kc = -c / vy;
  const kk = k < kc ? k : kc;
  FX_PT.x = x0 + vx * kk;
  FX_PT.y = k < kc ? y0 + vy * k + g * k * k : fl;
  FX_PT.rest = k < kc ? 0 : k - kc;
  return FX_PT;
}
// Tapered brush crescent along an (optionally squashed) arc from a0 to a1. The sample count
// follows the arc length and the angle, so long strokes (KO enso, spin sweep) and small rings
// (join icon) both stay round.
function fxCrescentPath(ctx, cx, cy, r, a0, a1, w, peak, b0, b1, sy) {
  const da = Math.abs(a1 - a0);
  const n = Math.max(6, Math.min(48, Math.ceil(Math.max(da * 5, da * (r + w) / 5))));
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const u = i / n, a = a0 + (a1 - a0) * u, rr = r + fxProfile(u, peak, b0, b1) * w * 0.6;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * sy;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = n; i >= 0; i -= 1) {
    const u = i / n, a = a0 + (a1 - a0) * u, rr = r - fxProfile(u, peak, b0, b1) * w * 0.4;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy);
  }
  ctx.closePath();
}
// Thin arc stroke (bristle streaks, rings).
function fxArc(ctx, cx, cy, r, a0, a1, sy, color, width) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, r), Math.max(0.01, r * sy), 0, Math.min(a0, a1), Math.max(a0, a1));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
// Needle / brush dab: blunt back at (x, y), sharp tip len along ang, half-width w.
function fxNeedlePath(ctx, x, y, ang, len, w) {
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x - c * w * 0.7, y - s * w * 0.7);
  ctx.lineTo(x + c * len * 0.22 - s * w, y + s * len * 0.22 + c * w);
  ctx.lineTo(x + c * len, y + s * len);
  ctx.lineTo(x + c * len * 0.22 + s * w, y + s * len * 0.22 - c * w);
  ctx.closePath();
}
// Burst star (n points), elongated toward +x by fwd, spike lengths jittered by seed.
function fxStarPath(ctx, n, r0, r1, jitter, seed, fwd) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i += 1) {
    const a = i * Math.PI / n + 0.2;
    const c = Math.cos(a), s = Math.sin(a);
    const stretch = 1 + fwd * (c > 0 ? c : 0);
    const r = i % 2 ? r0 : r1 * (1 - jitter * fxHash(seed, i)) * stretch;
    if (i === 0) ctx.moveTo(c * r, s * r); else ctx.lineTo(c * r, s * r);
  }
  ctx.closePath();
}
// Four-point glint as one simple polygon (arm h up/down, w left/right, waist thin).
function fxGlintPath(ctx, x, y, h, w, thin) {
  const d = thin * 0.7;
  ctx.beginPath();
  ctx.moveTo(x, y - h); ctx.lineTo(x + d, y - d); ctx.lineTo(x + w, y); ctx.lineTo(x + d, y + d);
  ctx.lineTo(x, y + h); ctx.lineTo(x - d, y + d); ctx.lineTo(x - w, y); ctx.lineTo(x - d, y - d);
  ctx.closePath();
}
// Ink-wash puff: a union of lobes around (x, y), each lobe radius + grow. flat > 0 squashes
// the lobes onto a floor.
function fxPuffPath(ctx, x, y, r, lobes, seed, flat, grow = 0) {
  ctx.beginPath();
  ctx.moveTo(x + r * 0.62 + grow, y);
  ctx.arc(x, y, r * 0.62 + grow, 0, FX_TAU);
  for (let i = 0; i < lobes; i += 1) {
    const a = (i / lobes) * FX_TAU + seed * 0.7;
    const lr = r * (0.42 + 0.2 * fxHash(seed, i)) + grow;
    const lx = x + Math.cos(a) * r * 0.52, ly = y + Math.sin(a) * r * (0.42 - flat * 0.2);
    ctx.moveTo(lx + lr, ly);
    ctx.arc(lx, ly, lr, 0, FX_TAU);
  }
}
// Puff as two plain fills at full alpha: the rim union (grown by grow and nudged by dx, dy
// for an ink-wash shadow), then the body. Callers shrink r to make it dissipate.
function fxPuff(ctx, x, y, r, lobes, seed, flat, fill, rim, grow, dx, dy) {
  fxPuffPath(ctx, x + dx, y + dy, r, lobes, seed, flat, grow);
  ctx.fillStyle = rim;
  ctx.fill();
  fxPuffPath(ctx, x, y, r, lobes, seed, flat, 0);
  ctx.fillStyle = fill;
  ctx.fill();
}
// Teardrop droplet travelling along ang (round head at (x, y), tail behind it).
function fxDropPath(ctx, x, y, ang, r, tail) {
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x - c * (r + tail), y - s * (r + tail));
  ctx.lineTo(x - s * r, y + c * r);
  ctx.arc(x, y, r, ang + Math.PI / 2, ang - Math.PI / 2, true);
  ctx.closePath();
}
// Flat splat where a droplet or ink drop met the floor.
function fxSplat(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.7, r * 0.5, 0, 0, FX_TAU);
  ctx.fillStyle = color;
  ctx.fill();
}
// Flame tongue sub-path (caller begins the path, so several tongues fill as one body):
// base at (x, y) width w, tip len along ang, swaying sideways by sway.
function fxFlamePath(ctx, x, y, ang, len, w, sway) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = x + c * len - s * sway, ty = y + s * len + c * sway;
  ctx.moveTo(x - s * w, y + c * w);
  ctx.quadraticCurveTo(x + c * len * 0.5 - s * (w * 1.1 + sway * 0.2), y + s * len * 0.5 + c * (w * 1.1 + sway * 0.2), tx, ty);
  ctx.quadraticCurveTo(x + c * len * 0.45 + s * w * 0.9, y + s * len * 0.45 - c * w * 0.9, x + s * w, y - c * w);
  ctx.arc(x, y, w, ang - Math.PI / 2, ang + Math.PI / 2, true);
  ctx.closePath();
}
// Angular rock: 5 jittered vertices around (x, y), rotated by rot.
function fxRockPath(ctx, x, y, r, rot, seed) {
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = rot + i * FX_TAU / 5 + fxHash(seed, i + 7) * 0.5;
    const rr = r * (0.7 + fxHash(seed, i + 13) * 0.45);
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
// Brush stroke sub-path along a constant polyline [x0, y0, x1, y1, ...], half-width easing
// from w0 to w1, offset (ox, oy), x mirrored by sx. Quads plus round joints, all wound the same
// way as arc(), so one fill paints their union (fades cleanly, no inner seams).
function fxBrushPath(ctx, pts, w0, w1, ox, oy, sx) {
  const n = pts.length / 2;
  for (let i = 0; i < n; i += 1) {
    const x0 = pts[i * 2] * sx + ox, y0 = pts[i * 2 + 1] + oy;
    const ha = w0 + (w1 - w0) * i / (n - 1);
    ctx.moveTo(x0 + ha, y0);
    ctx.arc(x0, y0, ha, 0, FX_TAU);
    if (i === n - 1) break;
    const x1 = pts[i * 2 + 2] * sx + ox, y1 = pts[i * 2 + 3] + oy;
    const hb = w0 + (w1 - w0) * (i + 1) / (n - 1);
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    ctx.moveTo(x0 - nx * ha, y0 - ny * ha);
    ctx.lineTo(x1 - nx * hb, y1 - ny * hb);
    ctx.lineTo(x1 + nx * hb, y1 + ny * hb);
    ctx.lineTo(x0 + nx * ha, y0 + ny * ha);
    ctx.closePath();
  }
}
function fxBegin(ctx, x, y, p, flip) {
  const s = p.scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip && p.dir < 0 ? -s : s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return ctx.globalAlpha;
}

// ---- Strikes -----------------------------------------------------------------------------

// Light hit spark: a small paper star with an ink rim, three needles flicked along the blow,
// and an open ink bracket. Pairs with an element layer (fxAirGust ...). ~0.22 s.
export function fxHitLight(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = fxEl(p.element), seed = p.seed || 0;
  // The star pops, then its spikes retract and it shrinks away (no alpha fade).
  const g = (0.72 + 0.4 * fxOut(fxSeg(t, 0, 0.12))) * (1 - fxOut(fxSeg(t, 0.12, 0.55)));
  if (g > 0.08) {
    fxStarPath(ctx, 7, 3.6 * g + 0.5, 14 * g, 0.45, seed, 0.7);
    fxInked(ctx, FX_PAPER, FX_INK, 0.45 + 0.85 * Math.min(1, g));
    ctx.beginPath();
    ctx.arc(1, 0, 3.4 * g, 0, FX_TAU);
    ctx.fillStyle = el.base;
    ctx.fill();
  }
  if (!p.reduced) {
    for (let i = 0; i < 3; i += 1) {
      const k = fxSeg(t, 0.04 + i * 0.05, 0.72 + i * 0.06);
      if (k <= 0 || k >= 1) continue;
      const ang = (i - 1) * 0.62 + (fxHash(seed, i) - 0.5) * 0.3;
      const d = 9 + 19 * fxOut(k);
      ctx.globalAlpha = A * (1 - k);
      fxNeedlePath(ctx, Math.cos(ang) * d, Math.sin(ang) * d, ang, 11 * (1 - k) + 4, 2.3 * (1 - k) + 0.7);
      ctx.fillStyle = i === 1 ? FX_INK : el.base;
      ctx.fill();
    }
    for (let i = 0; i < 2; i += 1) {
      const k = fxSeg(t, 0.06, 0.6);
      if (k <= 0 || k >= 1) break;
      const ang = -2.0 + i * 0.9 + fxHash(seed, i + 4) * 0.4;
      const d = 7 + 13 * fxOut(k);
      ctx.globalAlpha = A * (1 - k);
      fxNeedlePath(ctx, Math.cos(ang) * d, Math.sin(ang) * d, ang, 6 * (1 - k) + 2, 1.2);
      ctx.fillStyle = FX_INK;
      ctx.fill();
    }
  }
  const ring = fxSeg(t, 0.12, 1);
  if (ring > 0 && ring < 1) {
    ctx.globalAlpha = A * (1 - ring) * 0.9;
    fxArc(ctx, 4 + 6 * ring, 0, 9 + 13 * fxOut(ring), -1.15, 1.15, 1.25, FX_INK, 2 * (1 - ring) + 0.5);
  }
  ctx.restore();
}

// Heavy hit burst: an element-deep splat with element and paper cores (the deep layer erodes
// first, then the element, then the paper), a forward shock crescent, needles, ink drops that
// splat on the floor, and speed strokes behind the blow. ~0.30 s.
export function fxHitHeavy(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = fxEl(p.element), seed = p.seed || 0;
  const base = 0.72 + 0.36 * fxOut(fxSeg(t, 0, 0.12));
  const gDeep = base * (1 - fxOut(fxSeg(t, 0.12, 0.38)));
  const gEl = base * (1 - fxOut(fxSeg(t, 0.15, 0.46)));
  const gPaper = base * (1 - fxOut(fxSeg(t, 0.18, 0.54)));
  if (gDeep > 0.06) {
    fxStarPath(ctx, 9, 10 * gDeep, 30 * gDeep, 0.42, seed, 0.45);
    ctx.fillStyle = el.deep;
    ctx.fill();
  }
  if (gEl > 0.06) {
    fxStarPath(ctx, 9, 7 * gEl, 21 * gEl, 0.4, seed + 3, 0.45);
    ctx.fillStyle = el.base;
    ctx.fill();
  }
  if (gPaper > 0.06) {
    fxStarPath(ctx, 6, 4.5 * gPaper, 12 * gPaper, 0.25, seed + 5, 0.3);
    ctx.fillStyle = FX_PAPER;
    ctx.fill();
  }
  const speed = fxSeg(t, 0, 0.55);
  if (speed < 1 && !p.reduced) {
    ctx.globalAlpha = A * (1 - speed) * 0.85;
    for (let i = 0; i < 3; i += 1) {
      const yy = (i - 1) * 9 + (fxHash(seed, i + 20) - 0.5) * 4;
      fxNeedlePath(ctx, -14 - speed * 8, yy, Math.PI, 22 + 10 * fxHash(seed, i + 21) - speed * 8, 1.6);
      ctx.fillStyle = i === 1 ? el.base : el.deep;
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  // Shock crescent: thins and shortens away instead of fading.
  const shock = fxSeg(t, 0.06, 0.72);
  if (shock > 0 && shock < 1) {
    const r = 16 + 22 * fxOut(shock), w = 7.5 * (1 - fxOut(shock)), half = 1.25 - 0.5 * shock;
    if (w > 0.4) {
      fxCrescentPath(ctx, -4 + 10 * shock, 0, r, -half, half, w, 0.5, 0, 0, 1.2);
      fxInked(ctx, el.light, FX_INK, Math.min(1.1, 0.3 + w * 0.16));
    }
    ctx.globalAlpha = A * (1 - shock);
    fxArc(ctx, -4 + 10 * shock, 0, r + 6, -0.9, 0.9, 1.2, el.deep, 1.4 * (1 - shock) + 0.4);
    ctx.globalAlpha = A;
  }
  if (!p.reduced) {
    for (let i = 0; i < 5; i += 1) {
      const k = fxSeg(t, 0.06 + i * 0.03, 0.75 + i * 0.04);
      if (k <= 0 || k >= 1) continue;
      const ang = (i - 2) * 0.42 + (fxHash(seed, i + 9) - 0.5) * 0.25;
      const d = 18 + 34 * fxOut(k);
      ctx.globalAlpha = A * (1 - k);
      fxNeedlePath(ctx, Math.cos(ang) * d, Math.sin(ang) * d, ang, 15 * (1 - k) + 4, 2.8 * (1 - k) + 0.6);
      ctx.fillStyle = i % 2 ? el.base : el.deep;
      ctx.fill();
    }
    ctx.globalAlpha = A;
    const fl = fxFloor(p);
    for (let i = 0; i < 4; i += 1) {
      const k = fxSeg(t, 0.1, 1);
      if (k <= 0 || k >= 1) break;
      const ang = -1.1 + i * 0.55 + fxHash(seed, i + 30) * 0.3;
      const v = 40 + 18 * fxHash(seed, i + 31);
      const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
      const b = fxBallistic(0, 0, vx, vy, 46, k, fl);
      if (b.rest > 0) {
        const sr = 2.2 * (1 - fxSeg(b.rest, 0.05, 0.35));
        if (sr > 0.25) fxSplat(ctx, b.x, fl, sr, FX_INK);
      } else {
        const r = (2.4 - k) * (1 - fxSeg(k, 0.8, 1));
        if (r < 0.3) continue;
        fxDropPath(ctx, b.x, b.y, Math.atan2(vy + 92 * k, vx), r, 4.5);
        ctx.fillStyle = FX_INK;
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// Guard / block spark: a paper ward crescent on the attacker's side, a gold contact gleam and
// sparks glancing off it. dir = the push direction (attacker on -dir). ~0.22 s.
export function fxGuardSpark(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = fxEl(p.element), seed = p.seed || 0;
  const k = fxSeg(t, 0, 1), die = fxOut(fxSeg(t, 0.3, 1));
  const r = 19 + 6 * fxOut(k), w = 8 * (1 - k * 0.35) * (1 - die), half = 1.2 - 0.5 * die;
  if (w > 0.4) {
    fxCrescentPath(ctx, 6, 0, r, Math.PI - half, Math.PI + half, w, 0.5, 0, 0, 1.1);
    fxInked(ctx, FX_PAPER, FX_INK, Math.min(1.2, 0.3 + w * 0.14));
    fxArc(ctx, 6, 0, r - 1.2, Math.PI - half * 0.66, Math.PI + half * 0.66, 1.1, el.base, Math.min(1.6, w * 0.3));
  }
  const g = 10 * (0.6 + fxOut(fxSeg(t, 0, 0.1)) * 0.4) * (1 - fxOut(fxSeg(t, 0.1, 0.5)));
  if (g > 0.6) {
    fxGlintPath(ctx, -13, 0, g, g * 0.8, 1.8 * Math.min(1, g / 6));
    fxInked(ctx, FX_GOLD_HOT, FX_INK, 0.9 * Math.min(1, g / 5));
  }
  if (!p.reduced) {
    for (let i = 0; i < 6; i += 1) {
      const s = fxSeg(t, 0.02 + i * 0.02, 0.7 + i * 0.03);
      if (s <= 0 || s >= 1) continue;
      const up = i % 2 ? 1 : -1;
      const ang = Math.PI + up * (0.75 + 0.6 * fxHash(seed, i));
      const v = 30 + 14 * fxHash(seed, i + 6);
      const px = -13 + Math.cos(ang) * v * fxOut(s), py = Math.sin(ang) * v * fxOut(s) + 16 * s * s;
      ctx.globalAlpha = A * (1 - s);
      fxNeedlePath(ctx, px, py, ang + up * 0.2 * s + Math.PI, 7 * (1 - s) + 2, 1.3);
      ctx.fillStyle = i % 3 ? FX_GOLD : FX_GOLD_HOT;
      ctx.fill();
    }
  }
  ctx.restore();
}

// Parry flash: a tilted blade glint (one long arm, one short), an off-centre brush ring and
// gold sparks thrown back at the attacker, then a small late 'ding' sparkle. Deliberately
// lopsided so it never reads as a compass rose. dir = push direction. ~0.32 s.
export function fxParryFlash(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), seed = p.seed || 0;
  const ring = fxSeg(t, 0.05, 0.62);
  if (ring > 0 && ring < 1) {
    const r = 10 + 26 * fxOut3(ring), w = 5.5 * (1 - fxOut(ring));
    if (w > 0.35) {
      fxCrescentPath(ctx, 3, 0, r, Math.PI - 1.55, Math.PI + 1.0, w, 0.4, 0.15, 0.1, 1.05);
      fxInked(ctx, FX_PAPER, FX_INK, Math.min(1, 0.25 + w * 0.15));
    }
  }
  const ticks = fxSeg(t, 0.03, 0.6);
  if (ticks > 0 && ticks < 1 && !p.reduced) {
    ctx.globalAlpha = A * (1 - ticks);
    for (let i = 0; i < 5; i += 1) {
      const a = Math.PI - 1.15 + i * 0.5 + (fxHash(seed, i) - 0.5) * 0.2;
      const d = 13 + (14 + 6 * fxHash(seed, i + 5)) * fxOut(ticks);
      fxNeedlePath(ctx, Math.cos(a) * d, Math.sin(a) * d, a, 8 * (1 - ticks) + 2, 1.4);
      ctx.fillStyle = i % 2 ? FX_GOLD : FX_GOLD_HOT;
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  const g = (0.45 + 0.55 * fxOut(fxSeg(t, 0, 0.1))) * (1 - fxOut(fxSeg(t, 0.22, 0.78)));
  if (g > 0.05) {
    ctx.save();
    ctx.rotate(0.62 + (fxHash(seed, 1) - 0.5) * 0.16);
    fxGlintPath(ctx, 0, 0, 30 * g, 8.5 * g, 2.4 * g + 0.3);
    fxInked(ctx, FX_WHITE, FX_INK, 0.4 + 0.7 * Math.min(1, g));
    fxGlintPath(ctx, 0, 0, 12 * g, 3.6 * g, 1.2 * g);
    ctx.fillStyle = FX_GOLD_HOT;
    ctx.fill();
    ctx.restore();
  }
  const ding = fxSeg(t, 0.14, 0.58);
  if (ding > 0 && ding < 1) {
    const d = 6 * fxBell(ding);
    if (d > 0.8) {
      fxGlintPath(ctx, 14, -16, d, d * 0.85, d * 0.22);
      fxInked(ctx, FX_GOLD_HOT, FX_INK, 0.7 * Math.min(1, d / 3));
    }
  }
  ctx.restore();
}

// ---- Element impact layers (drawn with fxHitLight / fxHitHeavy) ---------------------------

// Air: two wind crescents wheel round the hit, two vortex rings travel forward, and a gust
// streak above and below curls away from the blow.
export function fxAirGust(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = FX_EL.air, seed = p.seed || 0;
  const R = p.heavy ? 27 : 20;
  const k = fxSeg(t, 0, 1), e = fxOut(k), thin = 1 - fxOut(fxSeg(t, 0.3, 0.85));
  for (let i = 0; i < 2; i += 1) {
    const w = (p.heavy ? 7 : 5) * (1 - k * 0.3) * thin;
    if (w < 0.35) break;
    const turn = -1.7 + e * 2.3 + i * Math.PI, span = 2.2 * (0.55 + 0.45 * thin);
    fxCrescentPath(ctx, 2, 0, R * (0.6 + 0.32 * e) + i * 3, turn, turn + span, w, 0.7, 0, 0.2, 0.72);
    fxInked(ctx, i ? FX_PAPER : el.base, i ? el.base : el.deep, Math.min(0.9, 0.2 + w * 0.15));
  }
  for (let j = 0; j < 2; j += 1) {
    const rk = fxSeg(t, j * 0.14, 0.75 + j * 0.15);
    if (rk <= 0 || rk >= 1) continue;
    const ry = (7 + 15 * fxOut(rk) + j * 4) * (p.heavy ? 1.2 : 1);
    ctx.globalAlpha = A * (1 - rk);
    ctx.beginPath();
    ctx.ellipse(10 + 20 * fxOut(rk) + j * 5, 0, ry * 0.32, ry, 0, 0, FX_TAU);
    ctx.strokeStyle = el.light;
    ctx.lineWidth = 3 * (1 - rk) + 1;
    ctx.stroke();
    ctx.strokeStyle = el.deep;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  if (!p.reduced) {
    for (let i = 0; i < 2; i += 1) {
      const s = fxSeg(t, 0.04 + i * 0.07, 0.7 + i * 0.07);
      if (s <= 0 || s >= 1) continue;
      const side = i ? 1 : -1;
      const yy = side * (R * 0.62 + 2) + (fxHash(seed, i) - 0.5) * 3;
      const x0 = -14 + 20 * fxOut(s), x1 = x0 + 12 + 5 * fxHash(seed, i + 3);
      ctx.globalAlpha = A * fxBell(s);
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.arc(x1, yy + side * 3.2, 3.2, -side * Math.PI / 2, side > 0 ? -Math.PI * 0.15 : Math.PI * 0.15, side < 0);
      ctx.strokeStyle = el.deep;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Water: a splash blob, a curling wave lip, spray mist and a crown of droplets on gravity
// arcs that splat on the floor.
export function fxWaterSplash(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = FX_EL.water, seed = p.seed || 0;
  const big = p.heavy ? 1.3 : 1;
  const g = (0.6 + fxOut(fxSeg(t, 0, 0.12)) * 0.5) * (1 - fxOut(fxSeg(t, 0.1, 0.45))) * big;
  if (g > 0.1) {
    fxPuff(ctx, 2, 0, 11 * g, 6, seed, 0, el.light, el.deep, 1.1, 0, 0);
    ctx.beginPath();
    ctx.arc(-1, -3 * g, 2.6 * g, 0, FX_TAU);
    ctx.fillStyle = el.pale;
    ctx.fill();
  }
  const wave = fxSeg(t, 0.04, 0.85);
  if (wave > 0 && wave < 1) {
    const r = (12 + 11 * fxOut(wave)) * big, w = 6.5 * (1 - fxOut(wave)) * big;
    if (w > 0.4) {
      fxCrescentPath(ctx, 0, 3, r, -2.6 + wave * 0.4, -0.35 + wave * 0.7, w, 0.62, 0, 0.35, 1);
      fxInked(ctx, el.base, el.deep, Math.min(0.9, 0.25 + w * 0.12));
      fxArc(ctx, 0, 3, r - 1, -2.2 + wave * 0.4, -0.5 + wave * 0.7, 1, el.pale, Math.min(1.3, w * 0.3));
    }
  }
  const mist = fxSeg(t, 0.05, 0.6);
  if (mist > 0 && mist < 1 && !p.reduced) {
    ctx.globalAlpha = A * (1 - mist);
    ctx.fillStyle = el.light;
    for (let i = 0; i < 6; i += 1) {
      const a = -0.9 + i * 0.36 + (fxHash(seed, i + 20) - 0.5) * 0.2;
      const d = (10 + (12 + 8 * fxHash(seed, i + 21)) * fxOut(mist)) * big;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.3, 0, FX_TAU);
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  if (!p.reduced) {
    const fl = fxFloor(p);
    for (let i = 0; i < (p.heavy ? 7 : 5); i += 1) {
      const k = fxSeg(t, 0.02 + i * 0.015, 0.95);
      if (k <= 0 || k >= 1) continue;
      const ang = 0.15 - i * 0.48 + (fxHash(seed, i) - 0.5) * 0.3;
      const v = (95 + 40 * fxHash(seed, i + 5)) * big;
      const vx = Math.cos(ang) * v * 0.45, vy = Math.sin(ang) * v;
      const b = fxBallistic(0, 0, vx, vy, 200, k, fl);
      const size = 0.8 + fxHash(seed, i + 11) * 0.5;
      if (b.rest > 0) {
        const sr = 2.2 * size * (1 - fxSeg(b.rest, 0, 0.3));
        if (sr > 0.3) fxSplat(ctx, b.x, fl, sr, el.base);
        continue;
      }
      const r = (2.8 - k * 1.2) * size * (1 - fxSeg(k, 0.8, 1));
      if (r < 0.3) continue;
      fxDropPath(ctx, b.x, b.y, Math.atan2(vy + 400 * k, vx), r, r * 1.8);
      fxInked(ctx, el.base, el.deep, 0.6);
      ctx.beginPath();
      ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.35, 0, FX_TAU);
      ctx.fillStyle = el.pale;
      ctx.fill();
    }
  }
  ctx.restore();
}

// Earth: brief ink cracks, a dust puff, and angular rock shards that hop out, land on the
// floor and settle into it.
export function fxEarthRubble(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = FX_EL.earth, seed = p.seed || 0;
  const big = p.heavy ? 1.3 : 1;
  const crack = fxSeg(t, 0, 0.45);
  if (crack < 1) {
    ctx.globalAlpha = A * (1 - crack);
    ctx.strokeStyle = FX_INK;
    ctx.lineWidth = 1.7 * (1 - crack) + 0.4;
    for (let i = 0; i < 4; i += 1) {
      const a = -1.9 + i * 1.3 + fxHash(seed, i) * 0.5;
      const len = (11 + 6 * fxHash(seed, i + 2)) * big * (0.7 + 0.3 * fxOut(fxSeg(t, 0, 0.1)));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      ctx.lineTo(Math.cos(a + 0.35) * len * 0.5, Math.sin(a + 0.35) * len * 0.5);
      ctx.lineTo(Math.cos(a - 0.1) * len, Math.sin(a - 0.1) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = A;
  }
  const dust = fxSeg(t, 0.03, 1);
  if (dust > 0 && dust < 1) {
    const r = (8 + 11 * fxOut(dust)) * big * (1 - fxOut(fxSeg(dust, 0.45, 1)));
    if (r > 1) fxPuff(ctx, 3 - 4 * dust, -3 * dust, r, 5, seed, 0, el.pale, FX_DUST.edge, 0.4, 1, 1.4);
  }
  if (!p.reduced) {
    const fl = fxFloor(p);
    for (let i = 0; i < (p.heavy ? 6 : 5); i += 1) {
      const k = fxSeg(t, 0.02 + i * 0.02, 1);
      if (k <= 0 || k >= 1) continue;
      const ang = 0.2 - i * 0.5 + (fxHash(seed, i + 4) - 0.5) * 0.3;
      const v = (70 + 40 * fxHash(seed, i + 8)) * big * 0.8;
      const b = fxBallistic(0, 0, Math.cos(ang) * v, Math.sin(ang) * v, 150, k, fl);
      const r0 = (3.6 + 2.6 * fxHash(seed, i + 12)) * big;
      const r = r0 * (1 - fxSeg(b.rest, 0.06, 0.3)) * (1 - fxSeg(k, 0.9, 1));
      if (r < 0.5) continue;
      const px = b.x, py = b.rest > 0 ? fl - r * 0.55 : b.y;
      const rot = (fxHash(seed, i + 14) - 0.5) * 9 * (k - b.rest);
      fxRockPath(ctx, px, py, r, rot, seed + i);
      fxInked(ctx, el.light, el.deep, 0.75);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(rot + 0.6) * r, py + Math.sin(rot + 0.6) * r);
      ctx.lineTo(px + Math.cos(rot + 1.9) * r * 0.9, py + Math.sin(rot + 1.9) * r * 0.9);
      ctx.closePath();
      ctx.fillStyle = el.base;
      ctx.fill();
    }
  }
  ctx.restore();
}

// Fire: one merged flame body fans up from a white-hot core, bends upward and shrinks away
// as it lifts; embers rise and two warm smoke curls drift off.
export function fxFireBurst(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), seed = p.seed || 0;
  const big = p.heavy ? 1.3 : 1;
  const grow = fxOut(fxSeg(t, 0, 0.2)), die = fxSeg(t, 0.22, 0.85), dieE = fxOut(die);
  if (die < 1) {
    const lift = -10 * die * big;
    for (let layer = 0; layer < 3; layer += 1) {
      const lk = layer === 0 ? 1 : layer === 1 ? 0.66 : 0.36;
      ctx.beginPath();
      for (let i = 0; i < 9; i += 1) {
        const low = i > 6;
        const a0 = low ? (i === 7 ? 0.55 : Math.PI - 0.55) : -Math.PI / 2 + (i - 3) * 0.47 + 0.18;
        const a = a0 + (-Math.PI / 2 - a0) * 0.5 * die;
        const fan = low ? 0.45 * (1 - die) * (1 - die) : 1 - 0.3 * Math.abs(i - 3) / 3;
        const len = ((12 + 8 * fxHash(seed, i + 3)) * fan * grow * (1 - dieE * 0.9) * big + 2 * (1 - dieE)) * lk;
        const w = (3.3 + fxHash(seed, i + 6) * 1.2) * big * (0.4 + 0.6 * lk) * (1 - dieE * 0.85);
        if (w < 0.3) continue;
        const d = (2 + 4 * grow) * big * (1 - dieE * 0.5);
        fxFlamePath(ctx, Math.cos(a0) * d, lift + Math.sin(a0) * d, a, len, w, Math.sin(t * 26 + i * 1.7) * 2 * (1 - dieE));
      }
      if (layer === 0) fxInked(ctx, FX_FLAME.outer, FX_FLAME.rim, 0.9 * (1 - dieE * 0.5));
      else { ctx.fillStyle = layer === 1 ? FX_FLAME.mid : FX_FLAME.core; ctx.fill(); }
    }
    const core = 1 - fxSeg(t, 0.06, 0.36);
    if (core > 0) {
      ctx.beginPath();
      ctx.arc(0, lift, (5 + 3 * grow) * core * big, 0, FX_TAU);
      ctx.fillStyle = FX_FLAME.hot;
      ctx.fill();
    }
  }
  if (!p.reduced) {
    for (let i = 0; i < 6; i += 1) {
      const k = fxSeg(t, 0.06 + i * 0.04, 1);
      if (k <= 0 || k >= 1) continue;
      const sx = (fxHash(seed, i + 9) - 0.5) * 2;
      ctx.globalAlpha = A * (1 - k);
      ctx.beginPath();
      ctx.arc(sx * (8 + 16 * k) + Math.sin(k * 9 + i) * 2.5, -8 - k * (26 + 14 * fxHash(seed, i + 10)) * big, 1.7 - k * 0.7, 0, FX_TAU);
      ctx.fillStyle = i % 2 ? FX_FLAME.ember : FX_FLAME.outer;
      ctx.fill();
    }
    ctx.globalAlpha = A;
    const smoke = fxSeg(t, 0.4, 1);
    if (smoke > 0 && smoke < 1) {
      for (let i = 0; i < 2; i += 1) {
        const r = (3 + 4.5 * fxOut(smoke)) * big * (1 - fxOut(fxSeg(smoke, 0.5 + i * 0.1, 1)));
        if (r < 0.6) continue;
        fxPuff(ctx, (i ? 7 : -5) + smoke * 3, -16 - smoke * 18 - i * 6, r, 4, seed + i, 0, FX_BURN.fill, FX_BURN.edge, 0.5, 0.8, 1.2);
      }
    }
  }
  ctx.restore();
}

// ---- World effects -----------------------------------------------------------------------

// Fireball lobes (x, y, r) in units of S px: a flat skirt of small lobes on the floor, bigger
// billows above, leaning toward +x. Tongues (x, y, angle, len, w) break the upper rim. Smoke
// lobes (x, y, r, delay) roll in over the top and cut into the fire from t ~0.25.
const FX_BOOM = [
  -0.92, -0.27, 0.3, -0.48, -0.36, 0.4, 0.06, -0.4, 0.45, 0.6, -0.35, 0.4, 1.0, -0.25, 0.27,
  -0.6, -0.9, 0.5, 0.12, -1.0, 0.6, 0.76, -0.86, 0.43, -0.2, -1.5, 0.52, 0.5, -1.44, 0.45,
];
const FX_BOOM_TONGUE = [
  -0.98, -0.7, -2.75, 0.55, 0.19, -0.66, -1.42, -2.2, 0.66, 0.22, 0.14, -1.86, -1.6, 0.74, 0.24,
  0.84, -1.36, -1.0, 0.6, 0.2, 1.16, -0.62, -0.38, 0.46, 0.16,
];
const FX_BOOM_SMOKE = [
  -0.5, -1.55, 0.44, 0, 0.25, -1.85, 0.5, 0.03, 0.88, -1.4, 0.4, 0.06, -0.98, -1.02, 0.3, 0.09, 0.5, -1.08, 0.34, 0.12,
  -0.12, -1.22, 0.32, 0.05, 0.66, -1.86, 0.3, 0.08,
];
// Adds the fireball's lobes and floor skirt to the current path. The whole mass shrinks as
// one (positions and radii both scale by live, toward the unit point (mx, my)), so it never
// breaks into separate dots; sc / rk give the smaller offset inner layers.
function fxBoomLobes(ctx, S, mx, my, sc, rk, live, grow, seed, skirt) {
  for (let i = 0; i < 10; i += 1) {
    const lv = i === 0 || i === 4 ? live * live : live; // the outer skirt lobes retire first
    const r = FX_BOOM[i * 3 + 2] * rk * S * lv * (0.9 + 0.2 * fxHash(seed, i));
    if (r < 0.5) continue;
    const q = sc * live;
    const lx = (mx + (FX_BOOM[i * 3] - mx) * q) * S, ly = (my + (FX_BOOM[i * 3 + 1] - my) * q) * S;
    ctx.moveTo(lx + r + grow, ly);
    ctx.arc(lx, ly, r + grow, 0, FX_TAU);
  }
  if (skirt && live > 0.02) {
    const cx = (mx + (0.05 - mx) * live) * S, cy = (my + (-0.14 - my) * live) * S;
    ctx.moveTo(cx + 1.12 * S * live + grow, cy);
    ctx.ellipse(cx, cy, 1.12 * S * live + grow, 0.2 * S * live + grow, 0, 0, FX_TAU);
  }
}
// Flame tongues breaking the upper rim (filled on their own: their winding differs from the
// lobe arcs, so sharing one path with them would punch holes).
function fxBoomTongues(ctx, S, t, grow, seed) {
  const live = 1 - fxOut(fxSeg(t, 0.2, 0.46));
  if (live <= 0.02) return;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const j = i * 5;
    const len = FX_BOOM_TONGUE[j + 3] * S * live * (0.7 + 0.5 * fxHash(seed, i + 40)) + grow * 1.3;
    const w = FX_BOOM_TONGUE[j + 4] * S * (0.55 + 0.45 * live) + grow;
    fxFlamePath(ctx, FX_BOOM_TONGUE[j] * S, FX_BOOM_TONGUE[j + 1] * S, FX_BOOM_TONGUE[j + 2], len, w, Math.sin(t * 30 + i * 1.9) * 1.5);
  }
  ctx.fill();
}
// Smoke cloud at scale S: grows in lobe by lobe, rises and spreads, then contracts as one mass
// (positions shrink with the radii, so it never splits into balls). grow and (dx, dy) give
// the ink-wash edge. curls: instead of lobes, add billow strokes on the upper lobes.
function fxBoomSmoke(ctx, S, t, grow, dx, dy, curls) {
  const rise = -26 * fxOut(fxSeg(t, 0.28, 1)), spread = 1 + 0.3 * fxSeg(t, 0.3, 0.75);
  const shrink = 1 - 0.6 * fxOut(fxSeg(t, 0.68, 1));
  for (let i = 0; i < 7; i += 1) {
    const j = i * 4, d = FX_BOOM_SMOKE[j + 3];
    const up = fxOut(fxSeg(t, 0.24 + d, 0.56 + d));
    if (up <= 0) continue;
    const r = FX_BOOM_SMOKE[j + 2] * S * (0.4 + 0.75 * up) * spread * shrink;
    if (r < 0.6) continue;
    const q = spread * shrink;
    const lx = (0.2 + (FX_BOOM_SMOKE[j] - 0.2) * q) * S + dx, ly = (-1.45 + (FX_BOOM_SMOKE[j + 1] + 1.45) * q) * S + rise + dy;
    if (curls) {
      if (i > 2) continue;
      ctx.moveTo(lx - r * 0.55, ly + r * 0.1);
      ctx.arc(lx - r * 0.05, ly + r * 0.1, r * 0.5, Math.PI, Math.PI * 1.62);
    } else {
      ctx.moveTo(lx + r + grow, ly);
      ctx.arc(lx, ly, r + grow, 0, FX_TAU);
    }
  }
}

// Explosion (ground point; dir = which way it leans): a burst-star flash, a bottom-heavy
// lopsided fireball with flame tongues breaking its rim and an offset hot core, dark smoke
// rolling in over it, ink debris that lands, a broken dust ring and a scorch. ~0.75 s.
// p.layer 'back' = scorch + ring (ground pass), 'front' = the rest.
export function fxExplosion(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), seed = p.seed || 0;
  const back = p.layer !== 'front', front = p.layer !== 'back';
  if (back) {
    const scorch = fxSeg(t, 0.12, 0.3) * (1 - fxSeg(t, 0.8, 1));
    if (scorch > 0) {
      ctx.globalAlpha = A * scorch * 0.2;
      ctx.beginPath();
      ctx.ellipse(2, 0, 34, 8.5, 0, 0, FX_TAU);
      ctx.fillStyle = FX_INK;
      ctx.fill();
      ctx.globalAlpha = A;
    }
    const ring = fxSeg(t, 0, 0.5);
    const rr = 14 + 48 * fxOut(ring), rw = 4.5 * (1 - fxOut(ring));
    if (rw > 0.3) {
      ctx.fillStyle = FX_DUST.edge;
      for (let i = 0; i < 4; i += 1) {
        const a0 = i * FX_TAU / 4 + 0.25 + fxHash(seed, i + 50) * 0.3;
        fxCrescentPath(ctx, 2, 0, rr, a0, a0 + 1.0 + 0.3 * fxHash(seed, i + 51), rw, 0.5, 0.1, 0.1, 0.28);
        ctx.fill();
      }
    }
  }
  if (!front) { ctx.restore(); return; }
  // Debris first, so the pieces still inside the fireball stay hidden behind it.
  if (!p.reduced) {
    ctx.fillStyle = FX_INK;
    for (let i = 0; i < 7; i += 1) {
      const k = fxSeg(t, 0.05, 0.95);
      if (k <= 0 || k >= 1) break;
      const ang = -Math.PI / 2 + (i - 3) * 0.44 + (fxHash(seed, i + 21) - 0.5) * 0.3;
      const v = 100 + 50 * fxHash(seed, i + 22);
      const b = fxBallistic(Math.cos(ang) * 18, -22 + Math.sin(ang) * 14, Math.cos(ang) * v * 0.6, Math.sin(ang) * v * 0.6, 125, k, 0);
      if (i % 2) {
        const r = (2.6 + fxHash(seed, i) * 1.6) * (1 - fxSeg(b.rest, 0.05, 0.35)) * (1 - fxSeg(k, 0.9, 1));
        if (r < 0.4) continue;
        fxRockPath(ctx, b.x, b.rest > 0 ? -r * 0.5 : b.y, r, (k - b.rest) * 8 + i, seed + i);
        ctx.fill();
      } else if (b.rest <= 0) {
        fxNeedlePath(ctx, b.x, b.y, Math.atan2(Math.sin(ang) * v * 0.6 + 250 * k, Math.cos(ang) * v * 0.6) + Math.PI, 9 * (1 - k * 0.5), 1.5);
        ctx.fill();
      }
    }
  }
  const S = 24 * (0.35 + 0.65 * fxOut(fxSeg(t, 0.02, 0.2)));
  const live = 1 - fxOut(fxSeg(t, 0.3, 0.64));
  if (live > 0.03) {
    ctx.save();
    ctx.translate(0, -5 * fxSeg(t, 0.15, 0.6));
    ctx.fillStyle = FX_FLAME.rim;
    ctx.beginPath();
    fxBoomLobes(ctx, S, 0.1, -0.45, 1, 1, live, 1.6, seed, true);
    ctx.fill();
    fxBoomTongues(ctx, S, t, 1.4, seed);
    ctx.fillStyle = FX_FLAME.outer;
    ctx.beginPath();
    fxBoomLobes(ctx, S, 0.1, -0.45, 1, 1, live, 0, seed, true);
    ctx.fill();
    fxBoomTongues(ctx, S, t, 0, seed);
    const mid = 1 - fxOut(fxSeg(t, 0.18, 0.44));
    if (mid > 0.05) {
      ctx.beginPath();
      fxBoomLobes(ctx, S, 0.3, -1.0, 0.6, 0.62, mid, 0, seed + 1, false);
      ctx.fillStyle = FX_FLAME.mid;
      ctx.fill();
    }
    const core = 1 - fxOut(fxSeg(t, 0.08, 0.32));
    if (core > 0.05) {
      ctx.beginPath();
      ctx.ellipse(0.36 * S, -1.04 * S, 0.42 * S * core, 0.34 * S * core, -0.4, 0, FX_TAU);
      ctx.fillStyle = FX_FLAME.core;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.4 * S, -1.1 * S, 0.17 * S * core, 0, FX_TAU);
      ctx.fillStyle = FX_FLAME.hot;
      ctx.fill();
    }
    ctx.restore();
  }
  // Smoke rolls in over the fire and cuts into its top, rises, contracts and thins away; the
  // edge pass retires before the final alpha fade so no rim shows through the body.
  if (t > 0.24) {
    const edge = 1 - fxSeg(t, 0.66, 0.8), fade = fxSeg(t, 0.8, 1);
    if (edge > 0) {
      ctx.beginPath();
      fxBoomSmoke(ctx, 24, t, 1.4 * edge, 1 * edge, 1.4 * edge, false);
      ctx.fillStyle = FX_SMOKE.darkEdge;
      ctx.fill();
    }
    ctx.globalAlpha = A * (1 - fade);
    ctx.beginPath();
    fxBoomSmoke(ctx, 24, t, 0, 0, 0, false);
    ctx.fillStyle = FX_SMOKE.dark;
    ctx.fill();
    ctx.beginPath();
    fxBoomSmoke(ctx, 24, t, 0, 0, 0, true);
    ctx.strokeStyle = FX_SMOKE.darkTop;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalAlpha = A;
  }
  if (!p.reduced) {
    for (let i = 0; i < 5; i += 1) {
      const k = fxSeg(t, 0.12 + i * 0.05, 0.7 + i * 0.05);
      if (k <= 0 || k >= 1) continue;
      ctx.globalAlpha = A * (1 - k);
      ctx.beginPath();
      ctx.arc((fxHash(seed, i + 60) - 0.4) * 44 + Math.sin(k * 8 + i) * 3, -30 - k * (30 + 16 * fxHash(seed, i + 61)), 1.8 - k, 0, FX_TAU);
      ctx.fillStyle = i % 2 ? FX_FLAME.ember : FX_FLAME.core;
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  const flash = (0.55 + 0.6 * fxOut(fxSeg(t, 0, 0.05))) * (1 - fxOut(fxSeg(t, 0.05, 0.17)));
  if (flash > 0.08) {
    ctx.save();
    ctx.translate(3, -20);
    fxStarPath(ctx, 10, 11 * flash, 32 * flash, 0.42, seed, 0.15);
    fxInked(ctx, FX_WHITE, FX_INK, 0.5 + 0.9 * Math.min(1, flash));
    ctx.restore();
  }
  ctx.restore();
}

// Ice column eruption (ground point): a frost ring, five crystal prisms that spring up with
// overshoot, a glint climbing the tallest, then a shatter into fragments that land and melt
// away. ~0.9 s. p.layer 'back' = the tall middle trio (draw before the target), 'front' = the
// short outer pair, ring and fragments (draw after); omit to draw everything.
const FX_ICE_SHARDS = [-22, 50, 8, -0.2, -10, 80, 10.5, -0.07, 2, 102, 12, 0.02, 14, 73, 10, 0.1, 25, 45, 8, 0.22];
const FX_ICE_ORDER = [1, 3, 2, 0, 4];
export function fxIceColumn(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, false), seed = p.seed || 0;
  const back = p.layer !== 'front', front = p.layer !== 'back';
  const ring = fxSeg(t, 0, 0.22), melt = fxOut(fxSeg(t, 0.78, 1));
  if (back) {
    const rx = (12 + 30 * fxOut(ring)) * (1 - melt);
    if (rx > 1) {
      ctx.beginPath();
      ctx.ellipse(2, 0, rx, rx * 0.3, 0, 0, FX_TAU);
      fxInked(ctx, FX_ICE.frost, FX_ICE.frostEdge, 0.8);
      ctx.fillStyle = FX_ICE.face;
      for (let i = 0; i < 9; i += 1) {
        const a = i / 9 * FX_TAU + 0.3;
        const px = 2 + Math.cos(a) * rx * 0.92, py = Math.sin(a) * rx * 0.28;
        const h = (3 + 3 * fxHash(seed, i)) * fxOut(ring) * (1 - melt);
        ctx.beginPath();
        ctx.moveTo(px - 2, py);
        ctx.lineTo(px, py - h);
        ctx.lineTo(px + 2, py);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  const crack = fxSeg(t, 0.68, 0.86), sink = fxOut(fxSeg(t, 0.84, 1));
  for (let n = 0; n < 5; n += 1) {
    const i = FX_ICE_ORDER[n];
    if (i === 1 || i === 2 || i === 3 ? !back : !front) continue;
    const sx = FX_ICE_SHARDS[i * 4], sh = FX_ICE_SHARDS[i * 4 + 1], sw = FX_ICE_SHARDS[i * 4 + 2], tilt = FX_ICE_SHARDS[i * 4 + 3];
    const rise = fxBack(fxSeg(t, 0.02 + n * 0.03, 0.2 + n * 0.03));
    const h = sh * rise * (1 - crack * 0.72) * (1 - sink);
    const ww = sw * (1 - sink * 0.6);
    if (h < 1) continue;
    ctx.save();
    ctx.translate(sx, 0);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(-ww, 1);
    ctx.lineTo(-ww * 0.9, -h * 0.76);
    ctx.lineTo(-ww * 0.1, -h);
    ctx.lineTo(ww * 0.82, -h * 0.82);
    ctx.lineTo(ww, 1);
    ctx.closePath();
    fxInked(ctx, FX_ICE.fill, FX_ICE.edge, 0.9);
    ctx.beginPath();
    ctx.moveTo(-ww * 0.1, -h);
    ctx.lineTo(ww * 0.82, -h * 0.82);
    ctx.lineTo(ww, 1);
    ctx.lineTo(ww * 0.1, 1);
    ctx.closePath();
    ctx.fillStyle = FX_ICE.face;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-ww * 0.55, -h * 0.72);
    ctx.lineTo(-ww * 0.25, -h * 0.9);
    ctx.moveTo(-ww * 0.55, -h * 0.55);
    ctx.lineTo(-ww * 0.5, -h * 0.18);
    ctx.strokeStyle = FX_ICE.glint;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (crack > 0) {
      ctx.beginPath();
      ctx.moveTo(-ww * 0.9, -h * 0.6);
      ctx.lineTo(0, -h * 0.45);
      ctx.lineTo(ww * 0.3, -h * 0.7);
      ctx.strokeStyle = FX_ICE.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (back) {
    const glint = fxSeg(t, 0.26, 0.62);
    if (glint > 0 && glint < 1) {
      const g = fxBell(glint) * 7;
      if (g > 0.8) {
        fxGlintPath(ctx, 1 - glint * 1.5, -24 - 66 * glint, g, g * 0.8, 1.3);
        fxInked(ctx, FX_ICE.glint, FX_ICE.edge, 0.6);
      }
    }
  }
  if (front && crack > 0) {
    for (let i = 0; i < 5; i += 1) {
      const sx = FX_ICE_SHARDS[i * 4], sh = FX_ICE_SHARDS[i * 4 + 1], sw = FX_ICE_SHARDS[i * 4 + 2], tilt = FX_ICE_SHARDS[i * 4 + 3];
      for (let j = 0; j < 3; j += 1) {
        const k = fxSeg(t, 0.7 + j * 0.02, 1);
        if (k <= 0 || k >= 1) continue;
        const side = sx === 2 ? (j - 1) : Math.sign(sx);
        const v = 30 + 30 * fxHash(seed, i * 3 + j);
        const top = -sh * (0.5 + j * 0.15);
        const b = fxBallistic(sx + Math.sin(tilt) * -top, top, side * v * 0.8, -40, 150, k, 0);
        const r = sw * (0.45 + 0.2 * fxHash(seed, i * 3 + j + 40)) * (1 - fxSeg(b.rest, 0, 0.18)) * (1 - fxSeg(k, 0.88, 1));
        if (r < 0.5) continue;
        const px = b.x, py = b.rest > 0 ? -r * 0.4 : b.y;
        const rot = (k - b.rest) * (j % 2 ? 7 : -6) + i;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(rot) * r, py + Math.sin(rot) * r);
        ctx.lineTo(px + Math.cos(rot + 2.3) * r * 0.8, py + Math.sin(rot + 2.3) * r * 0.8);
        ctx.lineTo(px + Math.cos(rot + 4.1) * r * 0.6, py + Math.sin(rot + 4.1) * r * 0.6);
        ctx.closePath();
        fxInked(ctx, FX_ICE.fill, FX_ICE.edge, 0.7);
      }
    }
    ctx.globalAlpha = A * fxBell(fxSeg(t, 0.72, 1)) * 0.75;
    fxPuffPath(ctx, 2, -10, 22, 6, seed, 0.5);
    ctx.fillStyle = FX_ICE.frost;
    ctx.fill();
  }
  ctx.restore();
}

// Smoke puff: three ink-wash lobed puffs drift up and apart, grow, then erode to nothing; a
// thin curl lifts off the top. p.variant 'burn' (burn ticks): warm grey with a scorched edge
// and ember flecks; default 'pale' (dust, despawn, crate smoke).
export function fxSmokePuff(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), seed = p.seed || 0;
  const burn = p.variant === 'burn', pal = burn ? FX_BURN : FX_SMOKE;
  for (let i = 0; i < 3; i += 1) {
    const k = fxSeg(t, i * 0.08, 0.8 + i * 0.07);
    if (k <= 0 || k >= 1) continue;
    const e = fxOut(k);
    const r = (5 + 8.5 * e - i) * (1 - fxOut(fxSeg(k, 0.5, 1)));
    if (r < 0.6) continue;
    const px = (i - 1) * (5 + 9 * e) + (fxHash(seed, i) - 0.5) * 4, py = -e * 24 - i * 3 - (i === 1 ? 4 : 0);
    fxPuff(ctx, px, py, r, 4, seed + i, 0, pal.fill, pal.edge, 0.6, 1, 1.5);
    if (r > 3) {
      // A billow curl (brush highlight stroke), not a shaded blob, so puffs stay flat ink-wash.
      ctx.beginPath();
      ctx.arc(px - r * 0.12, py - r * 0.02, r * 0.5, Math.PI * 1.05, Math.PI * 1.65);
      ctx.strokeStyle = pal.top;
      ctx.lineWidth = Math.min(1.4, r * 0.16);
      ctx.stroke();
    }
  }
  if (burn && !p.reduced) {
    for (let i = 0; i < 3; i += 1) {
      const k = fxSeg(t, i * 0.12, 0.62 + i * 0.12);
      if (k <= 0 || k >= 1) continue;
      ctx.globalAlpha = A * (1 - k);
      ctx.beginPath();
      ctx.arc((fxHash(seed, i + 30) - 0.5) * 16 + Math.sin(k * 10 + i) * 2, -4 - k * (22 + 10 * fxHash(seed, i + 31)), 1.6 - k * 0.6, 0, FX_TAU);
      ctx.fillStyle = i % 2 ? FX_BURN.hot : FX_BURN.ember;
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  const curl = fxSeg(t, 0.25, 1);
  if (curl > 0 && curl < 1 && !p.reduced) {
    ctx.globalAlpha = A * fxBell(curl) * 0.5;
    const top = -28 - curl * 14;
    ctx.beginPath();
    ctx.moveTo(1, top + 6);
    ctx.bezierCurveTo(7, top + 2, -4, top - 4, 3, top - 9);
    ctx.strokeStyle = burn ? FX_BURN.edge : FX_INK_SOFT;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();
}

// Landing dust (ground point): a floor ring, two lobed puffs sliding out along the floor and
// eroding, skid strokes and hopping grit. Knockdown and heavy jump landings. ~0.45 s.
export function fxDustLand(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, false), seed = p.seed || 0;
  const big = p.heavy ? 1.3 : 1;
  const ring = fxSeg(t, 0, 0.6);
  if (ring < 1) {
    ctx.globalAlpha = A * (1 - ring) * 0.85;
    fxArc(ctx, 0, 0, (10 + 32 * fxOut(ring)) * big, 0, FX_TAU, 0.28, FX_DUST.edge, 2.4 * (1 - ring) + 0.4);
    ctx.globalAlpha = A;
  }
  if (t < 0.92) {
    for (let pass = 0; pass < 2; pass += 1) {
      const grow = pass ? 0 : 0.6, dx = pass ? 0 : 0.8, dy = pass ? 0 : 1.3;
      ctx.beginPath();
      for (let side = -1; side <= 1; side += 2) {
        for (let j = 0; j < 3; j += 1) {
          const k = fxSeg(t, j * 0.05, 0.9);
          if (k <= 0 || k >= 1) continue;
          const e = fxOut(k);
          const r = (6.5 - j * 1.4) * (0.55 + 0.6 * e) * big * (1 - fxOut(fxSeg(k, 0.4 + j * 0.06, 1)));
          if (r < 0.4) continue;
          const px = side * (7 + 26 * e + j * 6) * big + dx, py = -r * 0.55 - j * 1.5 - 5 * k + dy;
          ctx.moveTo(px + r + grow, py);
          ctx.arc(px, py, r + grow, 0, FX_TAU);
        }
      }
      ctx.fillStyle = pass ? FX_DUST.fill : FX_DUST.edge;
      ctx.fill();
    }
  }
  if (!p.reduced) {
    const skid = fxSeg(t, 0, 0.7);
    if (skid < 1) {
      ctx.globalAlpha = A * (1 - skid) * 0.8;
      ctx.fillStyle = FX_DUST.edge;
      for (let side = -1; side <= 1; side += 2) {
        fxNeedlePath(ctx, side * 12 * big, 2, side > 0 ? 0 : Math.PI, (14 + 16 * fxOut(skid)) * big, 1.1);
        ctx.fill();
      }
    }
    ctx.fillStyle = FX_DUST.grit;
    for (let i = 0; i < 4; i += 1) {
      const k = fxSeg(t, 0.02, 0.7 + i * 0.05);
      if (k <= 0 || k >= 1) continue;
      const side = i % 2 ? 1 : -1;
      const px = side * (6 + (16 + 10 * fxHash(seed, i)) * k) * big, py = -(14 + 6 * fxHash(seed, i + 3)) * 2 * k * (1 - k);
      ctx.globalAlpha = A * (1 - k);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }
  ctx.restore();
}

// Run / dash kick-off dust (ground point at the rear foot; dir = running direction): a dark
// skid tick at the foot, a small puff trail rolling backward and two speed streaks. ~0.35 s;
// spawn every ~0.12 s of running.
export function fxDustRun(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), seed = p.seed || 0;
  const tick = fxSeg(t, 0, 0.45);
  if (tick < 1) {
    ctx.globalAlpha = A * (1 - tick);
    fxNeedlePath(ctx, 2, 0.6, Math.PI, 9 + 6 * fxOut(tick), 1.1);
    ctx.fillStyle = FX_DUST.dark;
    ctx.fill();
    ctx.globalAlpha = A;
  }
  if (t < 0.9) {
    for (let pass = 0; pass < 2; pass += 1) {
      const grow = pass ? 0 : 0.6, dx = pass ? 0 : 0.6, dy = pass ? 0 : 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const k = fxSeg(t, i * 0.07, 0.8 + i * 0.06);
        if (k <= 0 || k >= 1) continue;
        const e = fxOut(k);
        const r = (3 + 5.2 * e) * (1 - i * 0.16) * (1 - fxOut(fxSeg(k, 0.4, 1)));
        if (r < 0.4) continue;
        const px = -3 - 17 * e - i * 6 + dx, py = -r * 0.6 - 8 * k - i * 1.5 + dy;
        ctx.moveTo(px + r + grow, py);
        ctx.arc(px, py, r + grow, 0, FX_TAU);
      }
      ctx.fillStyle = pass ? FX_DUST.fill : FX_DUST.dark;
      ctx.fill();
    }
  }
  if (!p.reduced) {
    const s = fxSeg(t, 0, 0.6);
    if (s < 1) {
      ctx.globalAlpha = A * (1 - s) * 0.8;
      ctx.fillStyle = FX_DUST.edge;
      for (let i = 0; i < 2; i += 1) {
        fxNeedlePath(ctx, -4 - s * 6, -2 - i * 6, Math.PI, 12 + 8 * s + i * 3, 0.9);
        ctx.fill();
      }
    }
    ctx.fillStyle = FX_DUST.grit;
    for (let i = 0; i < 2; i += 1) {
      const k = fxSeg(t, 0.03, 0.6);
      if (k <= 0 || k >= 1) break;
      ctx.globalAlpha = A * (1 - k);
      ctx.fillRect(-6 - (12 + 6 * fxHash(seed, i)) * k - 1, -18 * k * (1 - k) * (1.5 + i) - 1, 2, 2);
    }
  }
  ctx.restore();
}

// Slash arcs (attacker anchored; dir = facing). The blunt brush head sweeps out fast, the
// tapered tail chases and catches it, dry-brush streaks show paper through. Variants: light
// (flat sweep), heavy (diagonal cleave + ink flecks), rise (uppercut), drop (overhead hammer),
// spin (ground sweep; split it with p.layer 'back' / 'front' round the body) and thrust
// (straight stab streak for spear jabs). (x, y) = shoulder height. life = seconds.
const FX_SLASH = {
  light: { cx: 6, cy: 4, r: 36, a0: -1.75, a1: 1.05, w: 7, sy: 0.5, streaks: 1, rot: 0.08, life: 0.2 },
  heavy: { cx: -2, cy: 4, r: 44, a0: -2.0, a1: 1.15, w: 12, sy: 1, streaks: 3, rot: 0.15, life: 0.26 },
  rise: { cx: 0, cy: -4, r: 40, a0: 1.75, a1: -1.85, w: 9, sy: 1, streaks: 2, rot: 0, life: 0.22 },
  drop: { cx: 4, cy: 8, r: 42, a0: -2.6, a1: 1.3, w: 10, sy: 1, streaks: 2, rot: 0, life: 0.24 },
  spin: { cx: 0, cy: 18, r: 44, a0: -1.2, a1: -1.2 + FX_TAU * 0.93, w: 9, sy: 0.34, streaks: 1, rot: 0, life: 0.3, ground: true },
  thrust: { x0: 16, cy: -3, len: 64, w: 4.2, life: 0.18, thrust: true },
};
// Straight stab streak: a wedge head shoots out along +x past the weapon tip, a long thin tail
// tapers back to the hand and chases it.
function fxThrust(ctx, t, v, el, seed, reduced) {
  const head = v.x0 + v.len * fxOut3(fxSeg(t, 0, 0.38));
  const tail = v.x0 + v.len * 0.9 * fxOut(fxSeg(t, 0.1, 0.84));
  const len = head - tail;
  if (len < 3) return;
  const w = v.w * (1 - 0.6 * fxSeg(t, 0.3, 0.9)) * Math.min(1, len / 18), cy = v.cy;
  const sh = head - Math.min(len * 0.28, 12);
  ctx.beginPath();
  ctx.moveTo(head + 4, cy);
  ctx.quadraticCurveTo(head - 1, cy - w * 0.95, sh, cy - w);
  ctx.quadraticCurveTo(tail + len * 0.3, cy - w * 0.55, tail, cy - 0.5);
  ctx.lineTo(tail, cy + 0.5);
  ctx.quadraticCurveTo(tail + len * 0.3, cy + w * 0.55, sh, cy + w);
  ctx.quadraticCurveTo(head - 1, cy + w * 0.95, head + 4, cy);
  ctx.closePath();
  fxInked(ctx, el.base, FX_INK, Math.min(1, 0.4 + w * 0.15));
  ctx.beginPath();
  ctx.moveTo(head + 0.5, cy - w * 0.15);
  ctx.quadraticCurveTo(sh, cy - w * 0.55, tail + len * 0.25, cy - w * 0.2);
  ctx.quadraticCurveTo(sh, cy - w * 0.05, head + 0.5, cy - w * 0.15);
  ctx.fillStyle = el.pale;
  ctx.fill();
  if (!reduced) {
    const s = fxSeg(t, 0.05, 0.75);
    if (s > 0 && s < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - s;
      ctx.fillStyle = FX_INK;
      for (let i = 0; i < 2; i += 1) {
        const yy = cy + (i ? 1 : -1) * (w + 3 + 2 * fxHash(seed, i));
        fxNeedlePath(ctx, tail + len * (0.25 + 0.15 * i), yy, 0, len * (0.5 - 0.12 * i), 0.9);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  const glint = (1 - fxSeg(t, 0.3, 0.55)) * fxOut(fxSeg(t, 0.12, 0.28));
  if (glint > 0.1) {
    fxGlintPath(ctx, head + 4, cy, 6.5 * glint, 5 * glint, 1);
    fxInked(ctx, FX_WHITE, FX_INK, 0.6);
  }
}
export function fxSlash(ctx, x, y, t, p = FX_DEFAULT) {
  const v = FX_SLASH[p.variant] || FX_SLASH.light;
  const A = fxBegin(ctx, x, y, p, true), el = fxEl(p.element), seed = p.seed || 0;
  if (v.thrust) { fxThrust(ctx, t, v, el, seed, p.reduced); ctx.restore(); return; }
  if (v.rot) ctx.rotate(v.rot);
  if (v.ground && p.layer) {
    // Far half (above the sweep's centre line) before the body, near half after it.
    ctx.beginPath();
    if (p.layer === 'back') ctx.rect(-300, v.cy - 300, 600, 300); else ctx.rect(-300, v.cy, 600, 300);
    ctx.clip();
  }
  const head = v.a0 + (v.a1 - v.a0) * fxOut3(fxSeg(t, 0, 0.36));
  const tail = v.a0 + (v.a1 - v.a0) * fxOut(fxSeg(t, 0.12, 0.86));
  const span = head - tail;
  if (Math.abs(span) > 0.08) {
    const w = v.w * (1 - 0.7 * fxSeg(t, 0.3, 0.9));
    fxCrescentPath(ctx, v.cx, v.cy, v.r, tail, head, w, 0.82, 0, 0.5, v.sy);
    fxInked(ctx, el.base, FX_INK, Math.min(1, 0.4 + w * 0.1));
    fxCrescentPath(ctx, v.cx, v.cy, v.r - w * 0.12, tail + span * 0.2, head - span * 0.03, w * 0.38, 0.8, 0, 0.4, v.sy);
    ctx.fillStyle = el.pale;
    ctx.fill();
    for (let i = 0; i < v.streaks; i += 1) {
      const off = (i - (v.streaks - 1) / 2) * w * 0.26 + w * 0.12;
      const from = tail + span * (0.05 + 0.12 * fxHash(seed, i)), to = tail + span * (0.55 + 0.25 * fxHash(seed, i + 3));
      fxArc(ctx, v.cx, v.cy, v.r + off, from, to, v.sy, el.pale, 0.9);
    }
  }
  if (p.variant === 'heavy' && !p.reduced) {
    const k = fxSeg(t, 0.3, 0.9);
    if (k > 0 && k < 1) {
      ctx.globalAlpha = A * (1 - k);
      const fl = (p.floor ?? 40) / (p.scale || 1);
      for (let i = 0; i < 4; i += 1) {
        const a = v.a1 - 0.25 - i * 0.12;
        const tx = -Math.sin(a), ty = Math.cos(a);
        const d = 10 + (16 + 10 * fxHash(seed, i + 6)) * fxOut(k);
        const px = v.cx + Math.cos(a) * (v.r + 3) + tx * d, py = Math.min(fl - 2, v.cy + Math.sin(a) * (v.r + 3) + ty * d + 18 * k * k);
        fxDropPath(ctx, px, py, Math.atan2(ty, tx), 2 - k * 0.8, 3);
        ctx.fillStyle = FX_INK;
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// The KO seal's mark: the attacker's element as a few paper strokes in a 9 px box.
function fxSealMark(ctx, element) {
  ctx.beginPath();
  if (element === 'air') {
    ctx.moveTo(-4, -1.5); ctx.lineTo(1.5, -1.5); ctx.arc(1.5, -3.2, 1.7, Math.PI / 2, -Math.PI * 0.7, true);
    ctx.moveTo(-4, 2); ctx.lineTo(3, 2); ctx.arc(3, 0.6, 1.4, Math.PI / 2, -Math.PI * 0.6, true);
  } else if (element === 'water') {
    ctx.moveTo(-4.2, -1); ctx.quadraticCurveTo(-2.1, -3.6, 0, -1); ctx.quadraticCurveTo(2.1, 1.6, 4.2, -1);
    ctx.moveTo(-4.2, 2.5); ctx.quadraticCurveTo(-2.1, -0.1, 0, 2.5); ctx.quadraticCurveTo(2.1, 5.1, 4.2, 2.5);
  } else if (element === 'earth') {
    ctx.moveTo(-4.4, 3.4); ctx.lineTo(-1, -3.4); ctx.lineTo(1.2, 0.4); ctx.lineTo(2.4, -1.4); ctx.lineTo(4.4, 3.4); ctx.closePath();
  } else if (element === 'fire') {
    ctx.moveTo(0, -4.4); ctx.quadraticCurveTo(3.8, -0.5, 2.6, 2.2); ctx.quadraticCurveTo(1.4, 4.2, 0, 4);
    ctx.quadraticCurveTo(-3.2, 3.6, -2.6, 0.6); ctx.quadraticCurveTo(-2, -1.4, 0, -4.4);
    ctx.moveTo(0, 0.4); ctx.lineTo(0, 3);
  } else {
    ctx.moveTo(-3.5, -3); ctx.lineTo(3.5, 3); ctx.moveTo(3.5, -3); ctx.lineTo(-3.5, 3);
  }
  ctx.strokeStyle = FX_PAPER;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

// KO burst (finishing blow, target body centre): a paper flash star, ink focus lines, a
// brushed enso (round brush head) that dries away from its start, element droplets, and a
// red seal stamping down with the attacker's element mark. ~0.8 s.
export function fxKoBurst(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, true), el = fxEl(p.element), seed = p.seed || 0;
  const flash = (0.5 + 0.6 * fxOut(fxSeg(t, 0, 0.06))) * (1 - fxOut(fxSeg(t, 0.07, 0.22)));
  if (flash > 0.08) {
    fxStarPath(ctx, 12, 14 * flash, 40 * flash, 0.45, seed + 1, 0.25);
    fxInked(ctx, FX_WHITE, FX_INK, 0.5 + 0.8 * Math.min(1, flash));
    fxStarPath(ctx, 7, 6 * flash, 17 * flash, 0.3, seed + 2, 0.25);
    ctx.fillStyle = el.light;
    ctx.fill();
  }
  const focus = fxSeg(t, 0.03, 0.55);
  if (focus > 0 && focus < 1 && !p.reduced) {
    ctx.globalAlpha = A * fxBell(Math.min(0.999, focus * 1.6 + 0.2));
    ctx.fillStyle = FX_INK;
    for (let i = 0; i < 18; i += 1) {
      const a = i / 18 * FX_TAU + fxHash(seed, i) * 0.2;
      const r0 = 76 + 8 * fxHash(seed, i + 1) - 6 * focus;
      fxNeedlePath(ctx, Math.cos(a) * r0, Math.sin(a) * r0 * 0.9, a + Math.PI, 16 + 10 * fxHash(seed, i + 2), 1.5);
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  const enso = fxSeg(t, 0.06, 0.4), dry = fxOut(fxSeg(t, 0.68, 0.94));
  if (enso > 0 && dry < 0.9) {
    const a0 = -2.3 + fxHash(seed, 9) * 0.3;
    const a1 = a0 + FX_TAU * 0.9 * fxOut3(enso);
    const s0 = a0 + (a1 - a0) * dry, w = 10 * (1 - 0.45 * dry), b0 = 0.6;
    fxCrescentPath(ctx, 0, 0, 44, s0, a1, w, 0.12, b0, 0.06, 1);
    // Round brush head at the stroke's start (part of the same union path).
    const mid = 44 + b0 * w * 0.1, hr = b0 * w * 0.5;
    ctx.moveTo(Math.cos(s0) * mid + hr, Math.sin(s0) * mid);
    ctx.arc(Math.cos(s0) * mid, Math.sin(s0) * mid, hr, 0, FX_TAU);
    ctx.fillStyle = FX_INK;
    ctx.fill();
    for (let i = 0; i < 3; i += 1) {
      const from = s0 + (a1 - s0) * (0.22 + i * 0.07), to = s0 + (a1 - s0) * (0.58 + i * 0.05);
      fxArc(ctx, 0, 0, 44 + (i - 1) * 2.4 * (1 - 0.45 * dry), from, to, 1, FX_PAPER, 0.9);
    }
  }
  if (!p.reduced) {
    const fl = fxFloor(p);
    for (let i = 0; i < 8; i += 1) {
      const k = fxSeg(t, 0.05 + i * 0.01, 0.8);
      if (k <= 0 || k >= 1) continue;
      const a = i / 8 * FX_TAU + 0.3 + fxHash(seed, i + 4) * 0.4;
      const b = fxBallistic(Math.cos(a) * 16, Math.sin(a) * 16, Math.cos(a) * 40, Math.sin(a) * 40, 22, k, fl);
      if (b.rest > 0) {
        const sr = 2.6 * (1 - fxSeg(b.rest, 0, 0.3));
        if (sr > 0.3) fxSplat(ctx, b.x, fl, sr, el.base);
        continue;
      }
      const r = (3.2 - k * 1.5) * (1 - fxSeg(k, 0.8, 1));
      if (r < 0.4) continue;
      fxDropPath(ctx, b.x, b.y, Math.atan2(Math.sin(a) * 40 + 44 * k, Math.cos(a) * 40), r, 4);
      fxInked(ctx, i % 2 ? el.base : el.light, el.deep, 0.6);
    }
  }
  const stamp = fxSeg(t, 0.3, 0.4), fade = fxSeg(t, 0.82, 1);
  if (stamp > 0 && fade < 1) {
    const sc = 1.6 - 0.6 * fxOut(stamp);
    ctx.save();
    ctx.translate(34, -34);
    ctx.rotate(-0.12);
    ctx.scale(p.dir < 0 ? -sc : sc, sc); // un-mirror, so the mark reads the same both ways
    ctx.globalAlpha = A * stamp * (1 - fade);
    ctx.beginPath();
    ctx.roundRect(-8.5, -8.5, 17, 17, 2.5);
    ctx.fillStyle = FX_SEAL;
    ctx.fill();
    ctx.strokeStyle = FX_PAPER;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-6.2, -6.2, 12.4, 12.4);
    fxSealMark(ctx, p.element);
    ctx.restore();
  }
  ctx.restore();
}

// Spawn / teleport swirl (ground point): an inked summoning ring with element arcs, ribbons
// spiralling in and up, element motes converging, then a light column as the body lands.
// p.reverse plays it as a vanish. ~0.6 s; reveal the fighter at t ~ 0.6.
export function fxSpawnSwirl(ctx, x, y, t, p = FX_DEFAULT) {
  if (p.reverse) t = 1 - t;
  const A = fxBegin(ctx, x, y, p, false), el = fxEl(p.element), seed = p.seed || 0;
  const open = fxOut(fxSeg(t, 0, 0.25)), close = fxOut(fxSeg(t, 0.76, 1));
  const rx = 32 * open * (1 - close * 0.35);
  if (rx > 1 && close < 0.98) {
    ctx.globalAlpha = A * (1 - close);
    fxArc(ctx, 0, 0, rx, 0, FX_TAU, 0.32, FX_INK, 1.3);
    ctx.globalAlpha = A;
    const w = 5 * (1 - close);
    for (let i = 0; i < 2; i += 1) {
      const a = (p.reduced ? 0.6 : t * 7) + i * Math.PI;
      if (w < 0.4) break;
      fxCrescentPath(ctx, 0, 0, rx + 3, a, a + 2.1, w, 0.6, 0, 0.2, 0.32);
      fxInked(ctx, i ? el.light : el.base, el.deep, Math.min(0.6, w * 0.15));
    }
    ctx.globalAlpha = A * (1 - close);
    ctx.fillStyle = el.deep;
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      fxNeedlePath(ctx, Math.cos(a) * (rx + 2), Math.sin(a) * (rx + 2) * 0.32, a, 6, 1.4);
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  const swirl = fxSeg(t, 0.04, 0.62);
  if (swirl > 0 && swirl < 1) {
    const thin = 1 - fxOut(fxSeg(t, 0.46, 0.64));
    for (let i = 0; i < 4; i += 1) {
      const w = (6 - i) * thin;
      if (w < 0.35) break;
      const r = (30 - 17 * fxOut(swirl)) * (1 - i * 0.1);
      const hy = -8 - i * 17 - 14 * swirl;
      const a = swirl * 9 + i * 1.7;
      fxCrescentPath(ctx, 0, hy, r, a, a + 3.3, w, 0.65, 0, 0.15, 0.34);
      fxInked(ctx, i % 2 ? FX_PAPER : el.base, i % 2 ? el.base : el.deep, Math.min(0.7, w * 0.15));
    }
    if (!p.reduced) {
      for (let i = 0; i < 8; i += 1) {
        const k = fxSeg(swirl, i * 0.04, 0.8 + i * 0.02);
        if (k <= 0 || k >= 1) continue;
        const a = i / 8 * FX_TAU + k * 2.6;
        const d = 46 * (1 - fxOut(k)) + 3;
        ctx.globalAlpha = A * fxBell(k);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, -34 + Math.sin(a) * d * 0.5 - 8 * fxHash(seed, i), 2, 0, FX_TAU);
        ctx.fillStyle = i % 2 ? el.base : el.light;
        ctx.fill();
      }
      ctx.globalAlpha = A;
    }
  }
  const column = fxSeg(t, 0.48, 0.82);
  if (column > 0 && column < 1) {
    const w = 13 * fxBell(column) + 1;
    const top = -110 + 20 * column;
    ctx.globalAlpha = A * fxBell(Math.min(1, column * 1.2)) * 0.6;
    ctx.beginPath();
    ctx.moveTo(-w, 1);
    ctx.lineTo(-w * 0.75, top + 26);
    ctx.lineTo(0, top);
    ctx.lineTo(w * 0.75, top + 26);
    ctx.lineTo(w, 1);
    ctx.closePath();
    ctx.fillStyle = el.light;
    ctx.fill();
    ctx.globalAlpha = A * fxBell(Math.min(1, column * 1.2));
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, 1);
    ctx.lineTo(0, top + 12);
    ctx.lineTo(w * 0.32, 1);
    ctx.closePath();
    ctx.fillStyle = FX_WHITE;
    ctx.fill();
    fxArc(ctx, 0, 0, w + 4, 0, FX_TAU, 0.3, el.deep, 1.2);
    ctx.globalAlpha = A;
  }
  const puff = fxSeg(t, 0.62, 1);
  if (puff > 0 && puff < 1 && !p.reduced) {
    const r = (4 + 5 * fxOut(puff)) * (1 - fxOut(fxSeg(puff, 0.45, 1)));
    if (r > 0.6) {
      for (let side = -1; side <= 1; side += 2) {
        fxPuff(ctx, side * (10 + 16 * fxOut(puff)), -5 - 5 * puff, r, 3, seed + side, 0.5, FX_DUST.fill, FX_DUST.edge, 0.5, 0.8, 1.2);
      }
    }
  }
  ctx.restore();
}

// Burning floor patch (ground point; p.radius ~34, p.life seconds for the flicker clock,
// default 2.4): an ink-wash scorch and a smouldering bed, a ring of flickering flame tongues
// that die down from t ~0.65, embers and a warm smoke wisp. p.layer 'back' = scorch + far
// tongues (before the bodies), 'front' = near tongues, embers and smoke (after).
export function fxGroundBurn(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, false), seed = p.seed || 0;
  const R = p.radius || 34, life = p.life || 2.4, ph = p.reduced ? 0 : t * life * 25;
  const back = p.layer !== 'front', front = p.layer !== 'back';
  const on = fxOut(fxSeg(t, 0, 0.08)), off = fxSeg(t, 0.7, 1);
  if (back) {
    ctx.globalAlpha = A * 0.2 * on * (1 - off * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (0.7 + 0.35 * on), R * 0.3, 0, 0, FX_TAU);
    ctx.fillStyle = FX_INK;
    ctx.fill();
    const bed = on * (1 - off);
    if (bed > 0.02) {
      ctx.globalAlpha = A * 0.5 * bed;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.78, R * 0.2, 0, 0, FX_TAU);
      ctx.fillStyle = FX_FLAME.outer;
      ctx.fill();
      ctx.globalAlpha = A * 0.6 * bed * (0.8 + 0.2 * Math.sin(ph * 0.7));
      ctx.beginPath();
      ctx.ellipse(3, 0, R * 0.45, R * 0.11, 0, 0, FX_TAU);
      ctx.fillStyle = FX_FLAME.core;
      ctx.fill();
    }
    ctx.globalAlpha = A;
  }
  for (let layer = 0; layer < 3; layer += 1) {
    const lk = layer === 0 ? 1 : layer === 1 ? 0.62 : 0.3;
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const a = (i + 0.5) / 9 * FX_TAU + (seed % 7) * 0.37, s = Math.sin(a);
      if (s < 0 ? !back : !front) continue;
      const env = on * (1 - fxOut(fxSeg(t, 0.62 + 0.06 * fxHash(seed, i), 0.97)));
      const flick = 0.72 + 0.2 * Math.sin(ph + i * 2.1) + 0.08 * Math.sin(ph * 1.9 + i * 0.7);
      const tall = i % 3 === 0 ? 1.35 : 1;
      const h = (9 + 9 * fxHash(seed, i + 3)) * tall * env * flick * (0.85 + 0.15 * s) * lk;
      const w = (4.6 + 1.8 * fxHash(seed, i + 5)) * (0.25 + 0.75 * env) * (0.4 + 0.6 * lk);
      if (h < 1.2 || w < 0.4) continue;
      fxFlamePath(ctx, Math.cos(a) * R * 0.66, s * R * 0.19, -Math.PI / 2 + Math.sin(ph * 0.6 + i) * 0.14, h, w, Math.sin(ph + i * 1.3) * 1.6);
      any = true;
    }
    if (!any) continue;
    if (layer === 0) fxInked(ctx, FX_FLAME.outer, FX_FLAME.rim, 0.85);
    else { ctx.fillStyle = layer === 1 ? FX_FLAME.mid : FX_FLAME.core; ctx.fill(); }
  }
  if (front && !p.reduced) {
    const env = on * (1 - off);
    for (let i = 0; i < 4; i += 1) {
      const k = (t * life * 1.3 + fxHash(seed, i + 20)) % 1;
      ctx.globalAlpha = A * env * (1 - k);
      ctx.beginPath();
      ctx.arc((fxHash(seed, i + 21) - 0.5) * R * 1.3 + Math.sin(k * 9 + i) * 2.5, -6 - k * 34, 1.6 - k * 0.7, 0, FX_TAU);
      ctx.fillStyle = i % 2 ? FX_FLAME.ember : FX_FLAME.core;
      ctx.fill();
    }
    ctx.globalAlpha = A;
    const k = (t * life * 0.7 + 0.3) % 1, r = (3 + 5 * fxOut(k)) * (1 - fxOut(fxSeg(k, 0.5, 1))) * env;
    if (r > 0.6) fxPuff(ctx, 4 + 6 * k, -22 - 26 * k, r, 4, seed + 1, 0, FX_BURN.fill, FX_BURN.edge, 0.5, 0.8, 1.2);
  }
  ctx.restore();
}

// Projectile / chase-ball trail, attached to a live projectile and drawn just before its body.
// (x, y) = the ball's centre, t = a looping phase for the shed motes (e.g. (time * 2.5) % 1).
// p: { vx, vy, element, r: ball radius, len: trail length px (~5r), turn: how far the trail
// bends over its length in rad (a homing ball's steering; 0 = straight) }.
function fxTrailPt(s, b, turn, len) {
  if (Math.abs(turn) < 0.001) { FX_PT.x = Math.cos(b) * s * len; FX_PT.y = Math.sin(b) * s * len; }
  else {
    const k = len / turn;
    FX_PT.x = k * (Math.sin(b + turn * s) - Math.sin(b));
    FX_PT.y = k * (Math.cos(b) - Math.cos(b + turn * s));
  }
  FX_PT.a = b + turn * s;
  return FX_PT;
}
// Ribbon outline along the trail, half-width hw * (1 - s)^0.85, shifted off-centre by side.
function fxTrailPath(ctx, b, turn, len, hw, s0, side) {
  const n = 12;
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const s = s0 + (1 - s0) * i / n, q = fxTrailPt(s, b, turn, len), h = hw * Math.pow(1 - s, 0.85);
    const nx = -Math.sin(q.a), ny = Math.cos(q.a);
    if (i === 0) ctx.moveTo(q.x + nx * h * (1 + side), q.y + ny * h * (1 + side)); else ctx.lineTo(q.x + nx * h * (1 + side), q.y + ny * h * (1 + side));
  }
  for (let i = n; i >= 0; i -= 1) {
    const s = s0 + (1 - s0) * i / n, q = fxTrailPt(s, b, turn, len), h = hw * Math.pow(1 - s, 0.85);
    const nx = -Math.sin(q.a), ny = Math.cos(q.a);
    ctx.lineTo(q.x - nx * h * (1 - side), q.y - ny * h * (1 - side));
  }
  ctx.closePath();
}
export function fxProjectileTrail(ctx, x, y, t, p = FX_DEFAULT) {
  const A = fxBegin(ctx, x, y, p, false), el = fxEl(p.element), seed = p.seed || 0;
  const r = p.r || 9, len = p.len || r * 5.5, turn = p.turn || 0;
  const b = Math.atan2(p.vy || 0, p.vx || 1) + Math.PI;
  fxTrailPath(ctx, b, turn, len, r * 0.95, 0, 0);
  fxInked(ctx, el.base, el.deep, 0.8);
  fxTrailPath(ctx, b, turn, len * 0.8, r * 0.45, 0.04, -0.6);
  ctx.fillStyle = el.pale;
  ctx.fill();
  if (!p.reduced) {
    for (let i = 0; i < 3; i += 1) {
      const s = (i + t) / 3, q = fxTrailPt(0.15 + s * 0.85, b, turn, len), fade = 1 - s;
      const qx = q.x, qy = q.y, qa = q.a, nx = -Math.sin(qa), ny = Math.cos(qa), side = i % 2 ? 1 : -1;
      if (p.element === 'air') {
        ctx.globalAlpha = A * fade;
        const cx = qx + nx * side * r * 0.9, cy = qy + ny * side * r * 0.9;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2 + 2 * fade, qa + (side > 0 ? 0.4 : -2.6), qa + (side > 0 ? 3.2 : 0.2));
        ctx.strokeStyle = el.deep;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else if (p.element === 'water') {
        const dx = qx + nx * side * r * 0.5, dy = qy + ny * side * r * 0.5 + 9 * s * s;
        const dr = 1.2 + 1.4 * fade;
        fxDropPath(ctx, dx, dy, Math.PI / 2 + (qa - Math.PI / 2) * 0.3, dr, dr * 1.6);
        fxInked(ctx, el.base, el.deep, 0.5);
      } else if (p.element === 'earth') {
        const gr = 1.4 + 2 * fade;
        fxRockPath(ctx, qx + nx * side * r * 0.75, qy + ny * side * r * 0.75 + 5 * s * s, gr, t * 9 + i * 2, seed + i);
        fxInked(ctx, el.light, el.deep, 0.6);
      } else if (p.element === 'fire') {
        ctx.beginPath();
        fxFlamePath(ctx, qx + nx * side * r * 0.45, qy + ny * side * r * 0.45, qa + side * 0.5, 4 + 7 * fade, 1.2 + 1.6 * fade, side * 1.2);
        fxInked(ctx, FX_FLAME.mid, FX_FLAME.rim, 0.6);
        ctx.globalAlpha = A * fade;
        ctx.beginPath();
        ctx.arc(qx - nx * side * r * 0.8, qy - ny * side * r * 0.8 - 6 * s, 1.4, 0, FX_TAU);
        ctx.fillStyle = FX_FLAME.ember;
        ctx.fill();
      } else {
        ctx.globalAlpha = A * fade;
        ctx.beginPath();
        ctx.arc(qx, qy, 1.5 + fade, 0, FX_TAU);
        ctx.fillStyle = FX_INK;
        ctx.fill();
      }
      ctx.globalAlpha = A;
    }
  }
  ctx.restore();
}

// ---- Team command / emote icons --------------------------------------------------------
// Paper speech bubble with an ink rim; (x, y) = the tail tip, just above the head. Pops in
// with overshoot, bobs, fades. p.color = team / element colour accent. ~1.2 s. Pictograms are
// tapered brush strokes (fxBrushPath) in ink plus one team-colour accent.
function fxBubblePath(ctx, g) {
  const r = 8 + g;
  ctx.moveTo(0, -32 - g);
  ctx.arcTo(14 + g, -32 - g, 14 + g, -7 + g, r);
  ctx.arcTo(14 + g, -7 + g, 4.5 + g, -7 + g, r);
  ctx.lineTo(4.5 + g * 1.2, -7 + g);
  ctx.lineTo(0, g * 1.6);
  ctx.lineTo(-4.5 - g * 1.2, -7 + g);
  ctx.arcTo(-14 - g, -7 + g, -14 - g, -32 - g, r);
  ctx.arcTo(-14 - g, -32 - g, 0, -32 - g, r);
  ctx.closePath();
}
// Ink rim as an even-odd ring and the paper face inside it: no two fills overlap, so the
// bubble fades cleanly with globalAlpha (no inner seam, no doubled rim).
function fxBubble(ctx, A) {
  ctx.globalAlpha = A;
  ctx.beginPath();
  fxBubblePath(ctx, 1.5);
  fxBubblePath(ctx, 0);
  ctx.fillStyle = FX_INK;
  ctx.fill('evenodd');
  ctx.beginPath();
  fxBubblePath(ctx, 0);
  ctx.fillStyle = FX_PAPER;
  ctx.fill();
}
function fxIconBegin(ctx, x, y, t, p) {
  const s = (p.scale || 1) * fxBack(fxSeg(t, 0, 0.16));
  const bob = t > 0.16 && !p.reduced ? Math.sin((t - 0.16) * FX_TAU * 2.2) * 1.3 : 0;
  const A = ctx.globalAlpha * (1 - fxSeg(t, 0.86, 1));
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(Math.max(0.001, s), Math.max(0.001, s));
  const ring = fxSeg(t, 0.06, 0.4);
  if (ring > 0 && ring < 1 && !p.reduced) {
    ctx.globalAlpha = A * (1 - ring) * 0.7;
    fxArc(ctx, 0, -19, 16 + 9 * fxOut(ring), 0, FX_TAU, 1, FX_INK, 1);
  }
  fxBubble(ctx, A);
  return A;
}
const FX_ICON_CHEV = [-11, -26, -7.6, -22.2, -6.2, -19.5, -7.6, -16.8, -11, -13];
const FX_ICON_MOVE = [-6.5, -26, -1, -19.5, -6.5, -13];
const FX_ICON_DASH = [-12.2, -19.5, -9.2, -19.5];
const FX_ICON_POLE = [-3.2, -29.6, -3.2, -11.6];
const FX_ICON_MOUND = [-10.8, -10.4, -5.5, -12.2, 0.5, -12.6, 6.5, -12, 10.8, -10.2];
// Come here: two brush chevrons pulling in toward a team-coloured dot.
export function fxIconCome(ctx, x, y, t, p = FX_DEFAULT) {
  fxIconBegin(ctx, x, y, t, p);
  const pull = p.reduced ? 0 : Math.sin(t * FX_TAU * 3) * 1.2;
  ctx.beginPath();
  ctx.arc(0, -19.5, 3, 0, FX_TAU);
  ctx.fillStyle = p.color || FX_GOLD;
  ctx.fill();
  ctx.beginPath();
  fxBrushPath(ctx, FX_ICON_CHEV, 1.55, 0.6, pull, 0, 1);
  fxBrushPath(ctx, FX_ICON_CHEV, 1.55, 0.6, -pull, 0, -1);
  ctx.fillStyle = FX_INK;
  ctx.fill();
  ctx.restore();
}
// Stay / hold: a pennant planted in a ground mound (team-colour flag, ink pole).
export function fxIconStay(ctx, x, y, t, p = FX_DEFAULT) {
  fxIconBegin(ctx, x, y, t, p);
  const flap = p.reduced ? 0 : Math.sin(t * FX_TAU * 3.2);
  ctx.beginPath();
  ctx.moveTo(-2.4, -29.6);
  ctx.quadraticCurveTo(3.5, -28.8 + flap * 0.7, 10.5, -26.6 + flap * 1.3);
  ctx.quadraticCurveTo(4.2, -24.6 - flap * 0.4, -2.4, -22.2);
  ctx.closePath();
  ctx.fillStyle = p.color || FX_GOLD;
  ctx.fill();
  ctx.beginPath();
  fxBrushPath(ctx, FX_ICON_POLE, 0.85, 1.45, 0, 0, 1);
  fxBrushPath(ctx, FX_ICON_MOUND, 1.5, 0.55, 0, 0, 1);
  ctx.fillStyle = FX_INK;
  ctx.fill();
  ctx.restore();
}
// Move / advance: a team-colour and an ink brush chevron along p.dir, with a speed dash.
export function fxIconMove(ctx, x, y, t, p = FX_DEFAULT) {
  fxIconBegin(ctx, x, y, t, p);
  if (p.dir < 0) ctx.scale(-1, 1);
  const push = p.reduced ? 0 : Math.sin(t * FX_TAU * 3) * 1.2;
  ctx.beginPath();
  fxBrushPath(ctx, FX_ICON_MOVE, 1.55, 0.65, push, 0, 1);
  ctx.fillStyle = p.color || FX_GOLD;
  ctx.fill();
  ctx.beginPath();
  fxBrushPath(ctx, FX_ICON_MOVE, 1.55, 0.65, push + 7.5, 0, 1);
  fxBrushPath(ctx, FX_ICON_DASH, 1.2, 0.5, push, 0, 1);
  ctx.fillStyle = FX_INK;
  ctx.fill();
  ctx.restore();
}
// Join / team up: two interlocked brush rings (enso), ink and team colour.
export function fxIconJoin(ctx, x, y, t, p = FX_DEFAULT) {
  fxIconBegin(ctx, x, y, t, p);
  const sway = p.reduced ? 0 : Math.sin(t * FX_TAU * 2.2) * 0.7;
  const ax = -4 - sway, bx = 4 + sway, cy = -19.5, r = 5.3, w = 2.5;
  // Near-closed brush rings: a small dry gap where the brush lifted (upper left on the ink
  // ring, lower right on the team ring), away from the two crossings.
  fxCrescentPath(ctx, ax, cy, r, -2.2, -2.2 + FX_TAU * 0.95, w, 0.3, 0.85, 0.5, 1);
  ctx.fillStyle = FX_INK;
  ctx.fill();
  fxCrescentPath(ctx, bx, cy, r, 0.9, 0.9 + FX_TAU * 0.95, w, 0.3, 0.85, 0.5, 1);
  ctx.fillStyle = p.color || FX_GOLD;
  ctx.fill();
  // Interlock: the ink ring passes over the team ring at the top crossing.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-3.4, cy - 10, 6.8, 8.6);
  ctx.clip();
  fxCrescentPath(ctx, ax, cy, r, -2.2, -2.2 + FX_TAU * 0.95, w, 0.3, 0.85, 0.5, 1);
  ctx.fillStyle = FX_INK;
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// Spawn table: life (s), anchor, render pass and fixed params. layer: 'top' = after the
// depth-sorted objects; 'split' = call with p.layer 'back' before the target / objects and
// 'front' after; 'attached' = drawn by drawProjectile; 'head' = top pass, re-anchored to the
// fighter every frame. Spawn: { kind: 'vfx', fx: key, x, y, life, maxLife: life, ...VFX[key].p }.
export const VFX = {
  hitLight: { draw: fxHitLight, life: 0.22, anchor: 'body', layer: 'top' },
  hitHeavy: { draw: fxHitHeavy, life: 0.3, anchor: 'body', layer: 'top' },
  guard: { draw: fxGuardSpark, life: 0.22, anchor: 'body', layer: 'top' },
  parry: { draw: fxParryFlash, life: 0.32, anchor: 'body', layer: 'top' },
  air: { draw: fxAirGust, life: 0.3, anchor: 'body', layer: 'top' },
  water: { draw: fxWaterSplash, life: 0.36, anchor: 'body', layer: 'top' },
  earth: { draw: fxEarthRubble, life: 0.4, anchor: 'body', layer: 'top' },
  fire: { draw: fxFireBurst, life: 0.36, anchor: 'body', layer: 'top' },
  slashLight: { draw: fxSlash, life: FX_SLASH.light.life, anchor: 'attacker', layer: 'top', p: { variant: 'light' } },
  slashHeavy: { draw: fxSlash, life: FX_SLASH.heavy.life, anchor: 'attacker', layer: 'top', p: { variant: 'heavy' } },
  slashRise: { draw: fxSlash, life: FX_SLASH.rise.life, anchor: 'attacker', layer: 'top', p: { variant: 'rise' } },
  slashDrop: { draw: fxSlash, life: FX_SLASH.drop.life, anchor: 'attacker', layer: 'top', p: { variant: 'drop' } },
  slashSpin: { draw: fxSlash, life: FX_SLASH.spin.life, anchor: 'attacker', layer: 'split', p: { variant: 'spin' } },
  slashThrust: { draw: fxSlash, life: FX_SLASH.thrust.life, anchor: 'attacker', layer: 'top', p: { variant: 'thrust' } },
  explosion: { draw: fxExplosion, life: 0.75, anchor: 'ground', layer: 'split' },
  iceColumn: { draw: fxIceColumn, life: 0.9, anchor: 'ground', layer: 'split' },
  groundBurn: { draw: fxGroundBurn, life: 2.4, anchor: 'ground', layer: 'split' },
  smoke: { draw: fxSmokePuff, life: 0.6, anchor: 'any', layer: 'top' },
  smokeBurn: { draw: fxSmokePuff, life: 0.6, anchor: 'any', layer: 'top', p: { variant: 'burn' } },
  dustLand: { draw: fxDustLand, life: 0.45, anchor: 'ground', layer: 'top' },
  dustRun: { draw: fxDustRun, life: 0.35, anchor: 'ground', layer: 'top' },
  ko: { draw: fxKoBurst, life: 0.8, anchor: 'body', layer: 'top' },
  spawn: { draw: fxSpawnSwirl, life: 0.6, anchor: 'ground', layer: 'top' },
  projectileTrail: { draw: fxProjectileTrail, life: 0.4, anchor: 'projectile', layer: 'attached' },
  iconCome: { draw: fxIconCome, life: 1.2, anchor: 'head', layer: 'head' },
  iconStay: { draw: fxIconStay, life: 1.2, anchor: 'head', layer: 'head' },
  iconMove: { draw: fxIconMove, life: 1.2, anchor: 'head', layer: 'head' },
  iconJoin: { draw: fxIconJoin, life: 1.2, anchor: 'head', layer: 'head' },
};
