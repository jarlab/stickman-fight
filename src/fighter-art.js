// "Wuxia Silhouettes" fighter art: brush-stroke stick fighters. Limbs are tapered capsules
// unioned into one nonzero fill per chain (no seams). Each element has its own build and
// head shape so it reads from outline alone; element colour lives only in cloth.
//
// drawFighterBody(ctx, pose, o) -> metrics
//   pose: fighterPose() joints in pose units (feet origin, -y up, facing +x); the caller
//     applies translate/scale (and the facing flip) before calling.
//   o.element, o.color, o.bodyColor (FLASH on hit flash), o.isBoss, o.empowered (boss phase 2),
//   o.flutter (s; 0 = static cloth), o.speed (0..1, negative = backpedalling), o.stroke, o.recoil,
//   o.drive   optional smoothed 0..1 cloth drive; when given it replaces the speed/stroke/recoil mix,
//   o.dizzy, o.ko (knocked down: X eye, kasa knocked askew; use with KO_POSE),
//   o.frozen (cloth hangs still against the body, so it stays inside the ice block),
//   o.beforeFrontArm(ctx) (callback that draws a held weapon under the front fist, on the ctx
//     it is given; it must not call drawFighterBody itself, since the per-draw state is shared).
//   o.color must be a palette constant (#rgb / #rrggbb[aa]); tints are cached per colour.
// Returns a reused metrics object in pose units (feet origin, facing +x):
//   top (highest headgear y), left/right (x extent incl. headgear and fists), torso (shoulder
//   half-width), headX/headY/headR. The caller uses it to place HP bar, dizzy stars, armour, ice.
//   It is overwritten by the next call, so read it before drawing another fighter.
//
// Performance: no gradients or shadowBlur; tints are cached per colour, per-draw state, limb
// segment lists and cloth buffers are module-level and reused; sub-pixel details only draw at
// >= 1.3 device px per pose unit (read from the current transform).
import { ELEMENTS } from './data.js';

export const INK = '#263b3c';
export const PAPER = '#fff8e8';
export const FLASH = '#fffdf1'; // hit-flash cloth/skin colour
const INK_REAR = '#4f625f';
const GOLD = '#d9a93f';
const GOLD_HOT = '#ffcf4d';
const TAU = Math.PI * 2;
// Half-widths in pose units: leg [hip, knee, ankle], arm [shoulder, elbow, wrist], torso
// [shoulder, hip]. neck moves the head centre along the spine (+ = longer neck).
const BUILDS = {
  air:   { leg: [2.5, 2.05, 1.65], arm: [2.05, 1.7, 1.45], torso: [3.0, 2.4], head: 8.6, neck: 1.6,  hand: 3.0, foot: 5.5 },
  water: { leg: [3.1, 2.6, 2.0],   arm: [2.6, 2.2, 1.8],   torso: [4.1, 3.2], head: 8.9, neck: 0.4,  hand: 2.9, foot: 5.5 },
  earth: { leg: [4.6, 3.9, 3.3],   arm: [4.4, 3.7, 3.1],   torso: [7.4, 4.8], head: 9.4, neck: -1.6, hand: 4.9, foot: 6.5 },
  fire:  { leg: [3.0, 2.5, 2.1],   arm: [2.9, 2.35, 2.0],  torso: [5.2, 2.8], head: 8.6, neck: -0.4, hand: 3.7, foot: 5.5 },
};
// Knocked-down / corpse skeleton. Drawn upright, the caller rotates it +-90deg (with the
// facing flip) exactly like drawCorpse; local +x then faces the floor.
export const KO_POSE = {
  hip: [8, -12], shoulder: [8, -31], head: [7, -43],
  frontKnee: [12, -1], frontFoot: [12, 10], rearKnee: [2, -1], rearFoot: [6, 10],
  elbow: [12, -22], hand: [13, -13], rearElbow: [3, -40], rearHand: [5, -54], weaponAngle: 0,
};
// [x0, y0, x1, y1] around everything drawn for KO_POSE (laid cloth, askew kasa, boss crown),
// in pose units, with a margin. Callers use it to size an offscreen layer.
export const KO_BOX = [-24, -76, 34, 24];
// Fire hair spikes: [angle (x PI), length past the skull, backward sweep].
const FIRE_SPIKES = [[-0.27, 6.5, 0.3], [-0.47, 8.5, 0.36], [-0.67, 11, 0.38], [-0.86, 11.5, 0.32], [-1.04, 7.5, 0.24]];
const len2 = (x, y) => Math.sqrt(x * x + y * y); // Math.hypot is slow and allocates in hot loops
const fin = v => (Number.isFinite(v) ? v : 0);
function wxHex(c) {
  if (typeof c !== 'string' || c[0] !== '#') return null;
  let h = c.slice(1);
  if (h.length === 3 || h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  else if (h.length === 8) h = h.slice(0, 6); // #rrggbbaa: tint the colour, ignore alpha
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function wxMix(a, b, t) {
  const pa = wxHex(a), pb = wxHex(b);
  if (!pa || !pb) return a;
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
// Tints are built once per element colour (module scope), never per frame.
const WX_TINTS = new Map();
function wxTints(color) {
  let s = WX_TINTS.get(color);
  if (!s) {
    if (WX_TINTS.size >= 32) WX_TINTS.clear(); // bounded even if a caller animates colours
    s = { rear: wxMix(color, INK, 0.3), deep: wxMix(color, INK, 0.52), cape: wxMix(color, INK, 0.4),
      capeIn: wxMix(color, INK, 0.64), rib: wxMix(color, INK, 0.42), light: wxMix(color, PAPER, 0.4) };
    WX_TINTS.set(color, s);
  }
  return s;
}
for (const spec of Object.values(ELEMENTS)) wxTints(spec.color);
let wxLay = false; // knocked down or frozen: cloth lies along the body toward the feet
let wxOutline = false; // hit flash: cloth gets the same ink outline as the limbs
const WX_XS = new Float64Array(16), WX_YS = new Float64Array(16);
const WX_S = { A: [0, 0, 0], L: [0, 0, 0], T: [0, 0] }; // per-draw state, reused
const WX_M = { top: 0, left: 0, right: 0, torso: 0, headX: 0, headY: 0, headR: 0 };
// Limb chains as capsule lists (endpoint refs + radii), refilled in place every draw.
const WX_REAR = { p: new Array(10), r: new Float64Array(10), n: 0 };
const WX_FRONT = { p: new Array(10), r: new Float64Array(10), n: 0 };
const WX_ARM = { p: new Array(4), r: new Float64Array(4), n: 0 };
const WX_FRONT_TOE = [0, 0], WX_REAR_TOE = [0, 0], WX_HEAD = [0, 0];
const WX_Q0 = [0, 0], WX_Q1 = [0, 0]; // scratch capsule endpoints, consumed immediately

// Tapered capsule subpath a(radius ar) -> b(radius br). Every capsule winds the same way,
// so a single nonzero fill unions a whole limb chain without seams, also when mirrored.
function wxCapsule(ctx, a, ar, b, br) {
  const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.moveTo(b[0] + Math.cos(th - Math.PI / 2) * br, b[1] + Math.sin(th - Math.PI / 2) * br);
  ctx.arc(b[0], b[1], br, th - Math.PI / 2, th + Math.PI / 2);
  ctx.arc(a[0], a[1], ar, th + Math.PI / 2, th + Math.PI * 1.5);
  ctx.closePath();
}
function wxSeg(list, a, ar, b, br) {
  const i = list.n;
  list.p[i] = a; list.r[i] = ar; list.p[i + 1] = b; list.r[i + 1] = br;
  list.n = i + 2;
}
function wxShape(ctx, list, grow, fill) {
  ctx.beginPath();
  const { p, r, n } = list;
  for (let i = 0; i < n; i += 2) wxCapsule(ctx, p[i], r[i] + grow, p[i + 1], r[i + 1] + grow);
  ctx.fillStyle = fill;
  ctx.fill();
}
// Tapered cloth/hair ribbon: a travelling sine runs down its length and droop bends it
// along body-down. ang = root direction in radians (y down). Cloth lives in the body frame,
// so on a knocked-down (rotated) body it lies along the back instead of poking into the floor.
function wxTail(ctx, x, y, ang, len, w0, w1, phase, amp, droop, fill, n = 8, bulge = 0) {
  if (wxLay) { ang = wxToward(ang, Math.PI * 0.45, 0.85); amp *= 0.4; }
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const gy = droop * len;
  const xs = WX_XS, ys = WX_YS;
  for (let i = 0; i <= n; i += 1) {
    const u = i / n, wave = Math.sin(phase - u * 5.2) * amp * u;
    xs[i] = x + dx * len * u + px * wave;
    ys[i] = y + dy * len * u + py * wave + gy * u * u;
  }
  if (wxOutline) wxRibbon(ctx, n, w0, w1, bulge, 1.3, INK);
  wxRibbon(ctx, n, w0, w1, bulge, 0, fill);
}
function wxRibbon(ctx, n, w0, w1, bulge, grow, fill) {
  const xs = WX_XS, ys = WX_YS;
  ctx.beginPath();
  for (let pass = 0; pass < 2; pass += 1) {
    for (let j = 0; j <= n; j += 1) {
      const i = pass ? n - j : j;
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      const nx = -(ys[b] - ys[a]), ny = xs[b] - xs[a];
      const l = len2(nx, ny) || 1;
      const w = ((w0 + (w1 - w0) * (i / n)) * (1 + bulge * Math.sin(Math.PI * i / n)) + grow) * (pass ? -1 : 1) / l;
      if (j === 0 && !pass) ctx.moveTo(xs[i] + nx * w, ys[i] + ny * w);
      else ctx.lineTo(xs[i] + nx * w, ys[i] + ny * w);
    }
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function wxAlong(a, b, u, out) { out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; return out; }
function wxPoint(out, x, y) { out[0] = x; out[1] = y; return out; }
function wxToward(a, target, f) {
  let d = target - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * f;
}
function wxToe(knee, foot, len, out) {
  let sx = foot[0] - knee[0], sy = foot[1] - knee[1];
  const sl = len2(sx, sy) || 1;
  sx /= sl; sy /= sl;
  // Grounded feet point forward; lifted feet flex perpendicular to the shin (sole leads).
  const lift = Math.max(0, Math.min(1, (-foot[1] - 2) / 10));
  const dx = 1 + (sy - 1) * lift, dy = -sx * lift;
  const dl = len2(dx, dy) || 1;
  out[0] = foot[0] + dx / dl * len; out[1] = foot[1] + dy / dl * len;
  return out;
}
function wxExtend(M, x, pad) {
  if (x - pad < M.left) M.left = x - pad;
  if (x + pad > M.right) M.right = x + pad;
}

// How hard the cloth is driven (0..1) by signed travel speed, strike and recoil. Backpedalling
// (negative speed) lifts it less. Callers may smooth this and pass it back as o.drive.
export function clothDrive(speed, stroke, recoil) {
  return Math.min(1, Math.max(0, speed) * 0.85 + Math.max(0, -speed) * 0.2 + stroke * 0.45 + recoil * 0.3);
}

export function drawFighterBody(ctx, pose, o) {
  const S = WX_S;
  const el = Object.hasOwn(BUILDS, o.element) ? o.element : 'air';
  const B = BUILDS[el];
  const color = o.color || ELEMENTS.air.color;
  const cloth = o.bodyColor || color;
  const flash = cloth !== color;
  const boss = Boolean(o.isBoss);
  const k = boss ? 1.14 : 1;
  const tint = wxTints(color);
  const m = ctx.getTransform();
  S.el = el; S.B = B; S.k = k; S.boss = boss; S.empowered = boss && Boolean(o.empowered);
  S.flash = flash; S.cloth = cloth; S.tint = tint;
  S.clothRear = flash ? cloth : tint.rear;
  S.clothDeep = flash ? cloth : tint.deep;
  S.gold = flash ? FLASH : S.empowered ? GOLD_HOT : GOLD;
  S.fine = len2(m.a, m.b) >= 1.3; // sub-pixel detail only when it can render
  S.t = fin(o.flutter); S.stroke = fin(o.stroke); S.recoil = fin(o.recoil);
  S.ko = Boolean(o.ko); S.dizzy = Boolean(o.dizzy);
  S.drive = Number.isFinite(o.drive) ? Math.max(0, Math.min(1, o.drive)) : clothDrive(fin(o.speed), S.stroke, S.recoil);
  S.wav = S.t * 7;
  wxLay = S.ko || Boolean(o.frozen);
  wxOutline = flash;
  const drive = S.drive, wav = S.wav;
  const { hip, shoulder, head, rearKnee, rearFoot, frontKnee, frontFoot, rearElbow, rearHand, elbow, hand } = pose;
  const ink = flash ? FLASH : INK;
  const inkRear = flash ? FLASH : INK_REAR;

  // Spine frame: t = up the spine, n = towards the facing side.
  let tx = shoulder[0] - hip[0], ty = shoulder[1] - hip[1];
  const tl = len2(tx, ty) || 1;
  tx /= tl; ty /= tl;
  const nx = -ty, ny = tx;
  const tilt = Math.atan2(shoulder[0] - hip[0], hip[1] - shoulder[1]);
  const hr = B.head * (boss ? 1.05 : 1);
  const hx = head[0] + tx * B.neck, hy = head[1] + ty * B.neck;
  const ht = Math.max(-0.5, Math.min(0.5, tilt * 0.45));
  const hc = Math.cos(ht), hs = Math.sin(ht);
  S.hr = hr; S.ht = ht;
  const A = S.A, L = S.L, T = S.T;
  for (let i = 0; i < 3; i += 1) { A[i] = B.arm[i] * k; L[i] = B.leg[i] * k; }
  T[0] = B.torso[0] * k; T[1] = B.torso[1] * k;
  const frontToe = wxToe(frontKnee, frontFoot, B.foot * k, WX_FRONT_TOE);
  const rearToe = wxToe(rearKnee, rearFoot, B.foot * k, WX_REAR_TOE);
  let top;

  ctx.save(); // keeps the caller's lineCap/lineJoin/fill state untouched
  try {
    // ---- 1. back layer: boss cape, then element cloth/hair behind the body ----
    if (boss) {
      const cx = shoulder[0] - nx * T[0] * 0.85, cy = shoulder[1] - ny * T[0] * 0.85 + 1;
      const fl = 0.6 + drive * 0.36;
      // Down, the cape tucks under the body and ends around the knees instead of a full slab.
      const cl = S.ko ? 0.62 : 1, cw = S.ko ? 0.72 : 1;
      const len = ((S.empowered ? 35 : 32) + drive * 5) * cl;
      wxTail(ctx, cx, cy, Math.PI * (fl - 0.06), len - 4 * cl, 3.6 * cw, 8 * cw, wav * 0.6 + 1.4, 2.2 + drive, 0.16 - drive * 0.12, flash ? cloth : tint.capeIn, 9);
      if (S.empowered) wxTail(ctx, cx, cy, Math.PI * (fl + 0.07), len + 2.6 * cl, 5.4 * cw, 11.4 * cw, wav * 0.6, 2.8 + drive * 1.5, 0.18 - drive * 0.14, S.gold, 10);
      wxTail(ctx, cx, cy, Math.PI * (fl + 0.07), len, 4.6 * cw, 9.6 * cw, wav * 0.6, 2.8 + drive * 1.5, 0.18 - drive * 0.14, flash ? cloth : tint.cape, 10);
    }
    if (el === 'air') {
      // Headband knot streamers: thin, light, at head height.
      const ux = -hr * 0.97, uy = -hr * 0.3;
      const kx = hx + ux * hc - uy * hs, ky = hy + ux * hs + uy * hc;
      const base = Math.PI - 0.6 + drive * 0.5;
      wxTail(ctx, kx, ky, base + 0.24, 17 + drive * 6, 2.0, 0.35, wav + 1.7, 2 + drive, 0.18 - drive * 0.14, S.clothRear, 7);
      wxTail(ctx, kx, ky, base, 26 + drive * 9, 2.5, 0.45, wav, 2.4 + drive * 1.3, 0.16 - drive * 0.14, cloth, 8);
    } else if (el === 'water') {
      // Long, heavy low ponytail from the nape down to the hips.
      const ux = -hr * 0.66, uy = hr * 0.42;
      const px = hx + ux * hc - uy * hs, py = hy + ux * hs + uy * hc;
      const pa = Math.PI * (0.57 + drive * 0.26);
      wxTail(ctx, px, py, pa, 29 + drive * 4, 3.3 * k, 0.9, wav * 0.8, 1.2 + drive * 1.8, 0.1 - drive * 0.08, ink, 10, 0.35);
      // element-colour tie band a little way down the tail
      const bx = px + Math.cos(pa) * 6, by = py + Math.sin(pa) * 6, qx = -Math.sin(pa) * 3 * k, qy = Math.cos(pa) * 3 * k;
      wxBand(ctx, wxPoint(WX_Q0, bx - qx, by - qy), wxPoint(WX_Q1, bx + qx, by + qy), 1.15, cloth, flash);
    }

    // ---- 2. rear limbs ----
    const rear = WX_REAR;
    rear.n = 0;
    wxSeg(rear, shoulder, A[0], rearElbow, A[1]);
    wxSeg(rear, rearElbow, A[1], rearHand, A[2]);
    wxSeg(rear, hip, L[0], rearKnee, L[1]);
    wxSeg(rear, rearKnee, L[1], rearFoot, L[2]);
    wxSeg(rear, rearFoot, L[2], rearToe, L[2] * 0.85);
    if (flash) wxShape(ctx, rear, 1.3, INK);
    wxShape(ctx, rear, 0, inkRear);
    wxArmGear(ctx, S, shoulder, rearElbow, rearHand, true);
    wxHand(ctx, S, rearHand, rearElbow, true);
    if (el === 'water') {
      // Sash tails from the back of the waist.
      const sx = hip[0] + tx * 3.4, sy = hip[1] + ty * 3.4;
      const half = T[1] + (T[0] - T[1]) * 0.2 + 1.2;
      const bx = sx - nx * half, by = sy - ny * half;
      wxTail(ctx, bx, by, Math.PI * 0.64 + drive * 0.45, 11 + drive * 5, 2.3, 0.5, wav + 2.3, 1.2 + drive, 0.12, S.clothRear, 6);
      wxTail(ctx, bx, by, Math.PI * 0.56 + drive * 0.5, 15 + drive * 6, 2.8, 0.6, wav + 0.4, 1.6 + drive, 0.12, cloth, 7);
    }

    // ---- 3. front leg + torso + neck ----
    const front = WX_FRONT;
    front.n = 0;
    wxSeg(front, hip, L[0], frontKnee, L[1]);
    wxSeg(front, frontKnee, L[1], frontFoot, L[2]);
    wxSeg(front, frontFoot, L[2], frontToe, L[2] * 0.85);
    wxSeg(front, hip, T[1], shoulder, T[0]);
    wxSeg(front, shoulder, A[0] * 0.75, wxPoint(WX_HEAD, hx, hy), A[0] * 0.75);
    if (flash) wxShape(ctx, front, 1.3, INK);
    wxShape(ctx, front, 0, ink);

    // ---- 4. belts and boss clasp ----
    if (el === 'water' || el === 'earth') {
      const up = el === 'earth' ? 3.2 : 3.4;
      const sx = hip[0] + tx * up, sy = hip[1] + ty * up;
      const half = T[1] + (T[0] - T[1]) * 0.2 + (el === 'earth' ? 0.6 : 0.9);
      const r = el === 'earth' ? 2.9 : 2.3;
      ctx.beginPath();
      wxCapsule(ctx, wxPoint(WX_Q0, sx - nx * half, sy - ny * half), r, wxPoint(WX_Q1, sx + nx * half, sy + ny * half), r);
      ctx.fillStyle = el === 'earth' && !flash ? tint.light : cloth; // straw obi stands apart from the bracers
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    if (boss) {
      const bx = shoulder[0] + nx * T[0] * 0.1 - tx * 2.2, by = shoulder[1] + ny * T[0] * 0.1 - ty * 2.2;
      if (S.empowered) {
        // Phase 2: a gold mantle bar across the shoulders.
        ctx.beginPath();
        wxCapsule(ctx, wxPoint(WX_Q0, bx - nx * (T[0] + 2.5), by - ny * (T[0] + 2.5)), 1.9, wxPoint(WX_Q1, bx + nx * (T[0] + 1.5), by + ny * (T[0] + 1.5)), 1.9);
        ctx.fillStyle = S.gold;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(bx, by, S.empowered ? 3.3 : 2.7, 0, TAU);
      ctx.fillStyle = S.gold;
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }

    // ---- 5. head ----
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ht);
    if (flash) { ctx.beginPath(); ctx.arc(0, 0, hr + 1.2, 0, TAU); ctx.fillStyle = INK; ctx.fill(); }
    ctx.beginPath();
    ctx.arc(0, 0, hr, 0, TAU);
    ctx.fillStyle = flash ? FLASH : PAPER;
    ctx.fill();
    ctx.lineWidth = 2.3 * k;
    ctx.strokeStyle = INK;
    ctx.stroke();
    top = wxHeadgear(ctx, S);
    ctx.restore();

    // ---- 6. front arm (caller may slip a held weapon in underneath the fist) ----
    if (o.beforeFrontArm) o.beforeFrontArm(ctx);
    const arm = WX_ARM;
    arm.n = 0;
    wxSeg(arm, shoulder, A[0], elbow, A[1]);
    wxSeg(arm, elbow, A[1], hand, A[2]);
    if (flash) wxShape(ctx, arm, 1.3, INK);
    wxShape(ctx, arm, 0, ink);
    wxArmGear(ctx, S, shoulder, elbow, hand, false);
    wxHand(ctx, S, hand, elbow, false);
  } finally {
    ctx.restore();
    wxLay = false;
    wxOutline = false;
  }

  // ---- metrics for overlays ----
  const M = WX_M;
  const back = el === 'earth' ? hr * 1.9 : el === 'fire' ? hr + 12 : hr + 1.5;
  const front = el === 'earth' ? hr * 1.9 : hr + 1;
  M.left = hx - back; M.right = hx + front;
  const fist = B.hand * k + 1;
  wxExtend(M, hand[0], fist); wxExtend(M, rearHand[0], fist);
  wxExtend(M, frontToe[0], 3); wxExtend(M, rearToe[0], 3); wxExtend(M, frontKnee[0], 3); wxExtend(M, rearKnee[0], 3);
  wxExtend(M, elbow[0], 3); wxExtend(M, rearElbow[0], 3); wxExtend(M, hip[0], 3);
  M.top = hy + top; M.torso = T[0];
  M.headX = hx; M.headY = hy; M.headR = hr;
  return M;
}

// Small cloth band (water hair tie); in hit flash it gets the limbs' ink outline.
function wxBand(ctx, a, b, r, fill, outline) {
  if (outline) {
    ctx.beginPath();
    wxCapsule(ctx, a, r + 1.3, b, r + 1.3);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  ctx.beginPath();
  wxCapsule(ctx, a, r, b, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Hair, hats and crowns, drawn in the head's own rotated frame. Returns the top y offset.
function wxHeadgear(ctx, S) {
  const { el, hr, k, cloth, flash } = S;
  let top = -hr - 1;
  if (el === 'water') {
    // Ink hair cap over the back-top of the skull, plus a bun with a hairpin.
    ctx.beginPath();
    ctx.arc(0, 0, hr + 0.5, Math.PI * 0.68, Math.PI * 1.82);
    ctx.quadraticCurveTo(-hr * 0.05, -hr * 0.32, -hr * 0.7, hr * 0.62);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-hr * 0.5, -hr * 0.86, 3.7 * k, 0, TAU);
    ctx.fill();
    if (S.fine) {
      // hairpin through the bun (detail only)
      ctx.beginPath();
      ctx.moveTo(-hr * 0.5 - 4.4, -hr * 0.86 + 1.4);
      ctx.lineTo(-hr * 0.5 + 3.6, -hr * 0.86 - 2.4);
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = PAPER;
      ctx.stroke();
    }
    top = -hr * 0.86 - 3.7 * k - 0.5;
    wxFace(ctx, S);
  } else if (el === 'air') {
    // Bare head: a small windswept crest and the headband.
    ctx.beginPath();
    ctx.moveTo(hr * 0.42, -hr * 0.9);
    ctx.quadraticCurveTo(-hr * 0.2, -hr * 1.4, -hr * 1.45, -hr * 1.08);
    ctx.quadraticCurveTo(-hr * 0.7, -hr * 1.02, -hr * 0.55, -hr * 0.84);
    ctx.quadraticCurveTo(-hr * 0.95, -hr * 0.78, -hr * 1.28, -hr * 0.52);
    ctx.lineTo(-hr * 0.9, -hr * 0.42);
    ctx.arc(0, 0, hr + 0.4, Math.PI * 1.13, Math.PI * 1.64);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-hr * 1.02, -hr * 0.22);
    ctx.quadraticCurveTo(0, -hr * 0.74, hr * 1.0, -hr * 0.42);
    ctx.lineWidth = 3.1;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = cloth;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-hr * 0.97, -hr * 0.3, 2, 0, TAU);
    ctx.fillStyle = cloth;
    ctx.fill();
    top = -hr * 1.22;
    wxFace(ctx, S);
  } else if (el === 'earth') {
    wxFace(ctx, S);
    // Kasa: wide shallow straw cone, slightly concave, worn low over the brow.
    ctx.save();
    if (S.ko) ctx.rotate(-0.45); // knocked askew, still on
    const by = -hr * 0.3, W = hr * 1.9, ay = -hr * 1.78, sx = 1;
    ctx.beginPath();
    ctx.moveTo(sx - W, by);
    ctx.quadraticCurveTo(sx - W * 0.42, by - 4.2, sx, ay);
    ctx.quadraticCurveTo(sx + W * 0.42, by - 4.2, sx + W, by);
    ctx.quadraticCurveTo(sx, by + 2.6, sx - W, by);
    ctx.closePath();
    ctx.fillStyle = cloth;
    ctx.fill();
    ctx.lineWidth = 1.8 * k;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.fine) {
      ctx.beginPath();
      for (const f of [-0.55, -0.15, 0.3, 0.68]) { ctx.moveTo(sx + f * 2.4, ay + 3); ctx.lineTo(sx + W * f, by + 0.9); }
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = flash ? INK : S.tint.rib;
      ctx.stroke();
    }
    top = ay;
    if (S.boss) {
      // Masters: gold brim band and a pagoda finial instead of a guan.
      ctx.beginPath();
      ctx.moveTo(sx - W + 1.5, by + 0.5);
      ctx.quadraticCurveTo(sx, by + 3.2, sx + W - 1.5, by + 0.5);
      ctx.lineWidth = S.empowered ? 2.6 : 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = S.gold;
      ctx.stroke();
      const fh = S.empowered ? 9.5 : 7;
      ctx.beginPath();
      ctx.moveTo(sx - 2.6, ay + 1.2);
      ctx.lineTo(sx - 1.2, ay - fh * 0.45);
      ctx.lineTo(sx, ay - fh);
      ctx.lineTo(sx + 1.2, ay - fh * 0.45);
      ctx.lineTo(sx + 2.6, ay + 1.2);
      ctx.closePath();
      ctx.fillStyle = S.gold;
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, ay - fh * 0.42, S.empowered ? 2.7 : 2.2, 0, TAU);
      ctx.fillStyle = S.gold;
      ctx.fill();
      ctx.stroke();
      top = ay - fh;
    } else {
      ctx.beginPath();
      ctx.arc(sx, ay, 1.6, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.restore();
  } else {
    // Flame hair: a cap over the crown with swept-back spikes. Tips are clamped so the
    // hair never rises more than hr+8 above the head centre (clear of the HP bar).
    const lim = hr + 8;
    ctx.beginPath();
    const a0 = -0.13 * Math.PI, ae = -1.2 * Math.PI;
    ctx.moveTo(Math.cos(a0) * (hr + 0.6), Math.sin(a0) * (hr + 0.6));
    for (let i = 0; i < FIRE_SPIKES.length; i += 1) {
      const spike = FIRE_SPIKES[i];
      const a = spike[0], len = spike[1], sweep = spike[2];
      const flick = Math.sin(S.t * 13 + i * 1.9) * 0.8 + S.stroke * 1.0;
      const ta = a * Math.PI - sweep;
      let R = hr + len + flick;
      const up = -Math.sin(ta + S.ht);
      if (up > 0) R = Math.min(R, lim / up);
      ctx.lineTo(Math.cos(ta) * R, Math.sin(ta) * R);
      const va = (a - 0.1) * Math.PI;
      ctx.lineTo(Math.cos(va) * (hr + 1.4), Math.sin(va) * (hr + 1.4));
    }
    ctx.lineTo(Math.cos(ae) * (hr + 0.6), Math.sin(ae) * (hr + 0.6));
    ctx.quadraticCurveTo(-hr * 0.1, -hr * 0.42, Math.cos(a0) * (hr + 0.6), Math.sin(a0) * (hr + 0.6));
    ctx.closePath();
    ctx.fillStyle = cloth;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
    top = -lim;
    wxFace(ctx, S);
    if (S.boss) {
      // Masters: a gold fillet across the brow with a flame jewel (a guan would be lost in the spikes).
      ctx.beginPath();
      ctx.moveTo(-hr * 0.98, -hr * 0.16);
      ctx.quadraticCurveTo(0, -hr * 0.62, hr * 0.99, -hr * 0.36);
      ctx.lineWidth = S.empowered ? 3.4 : 2.7;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = S.empowered ? 2.2 : 1.6;
      ctx.strokeStyle = S.gold;
      ctx.stroke();
      const jx = hr * 0.55, jy = -hr * 0.52, js = S.empowered ? 1.3 : 1;
      ctx.beginPath();
      ctx.moveTo(jx - 2.6 * js, jy + 1);
      ctx.quadraticCurveTo(jx - 2 * js, jy - 4 * js, jx + 0.4, jy - 6.5 * js);
      ctx.quadraticCurveTo(jx + 2.8 * js, jy - 3 * js, jx + 2.6 * js, jy + 1);
      ctx.closePath();
      ctx.fillStyle = S.gold;
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    return top;
  }
  if (S.boss && el !== 'earth') {
    // Gold guan (hair crown) for air/water masters, larger and brighter in phase 2.
    const g = S.empowered ? 1.28 : 1;
    const cx = el === 'water' ? -hr * 0.12 : 0.5, cy = el === 'water' ? -hr - 1.2 : -hr * 1.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(g, g);
    ctx.beginPath();
    ctx.moveTo(-4.5, 1.5);
    ctx.lineTo(-5.5, -4);
    ctx.lineTo(-2, -1.8);
    ctx.lineTo(0.5, -6.5);
    ctx.lineTo(3, -1.8);
    ctx.lineTo(6, -4);
    ctx.lineTo(5, 1.5);
    ctx.closePath();
    ctx.fillStyle = S.gold;
    ctx.fill();
    ctx.lineWidth = 1.2 / g;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    top = Math.min(top, cy - 6.5 * g);
  }
  return top;
}

function wxArmGear(ctx, S, sh, e, h, rear) {
  const { el, A } = S;
  const fill = rear ? S.clothRear : S.cloth;
  if (el === 'air') {
    // Loose bell sleeve: covers the lower upper-arm, flares open at the elbow and drops a
    // short flap from there. The forearm and fist stay bare ink, so nothing near the hand
    // reads as a held blade, and in guard the flaps hang below the elbows, clear of the face.
    const ua = Math.atan2(e[1] - sh[1], e[0] - sh[0]);
    const ang = wxToward(ua, Math.PI / 2, 0.62);
    wxTail(ctx, e[0], e[1] + A[1] * 0.5, ang, 6.5 + S.drive * 3, 2.1, 0.4, S.wav + (rear ? 2.5 : 0.9), 0.7 + S.drive * 0.6, 0.12, fill, 5);
    const s0 = wxAlong(sh, e, 0.5, WX_Q0), s1 = wxAlong(e, h, 0.12, WX_Q1);
    if (S.flash) {
      ctx.beginPath();
      wxCapsule(ctx, s0, A[0] + 1.5, s1, A[1] + 2.8);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.beginPath();
    wxCapsule(ctx, s0, A[0] + 0.2, s1, A[1] + 1.5);
    ctx.fillStyle = fill;
    ctx.fill();
  } else if (el === 'earth') {
    ctx.beginPath();
    wxCapsule(ctx, wxAlong(e, h, 0.36, WX_Q0), A[1] + 0.9, wxAlong(e, h, 0.82, WX_Q1), A[2] + 1.0);
    ctx.fillStyle = rear ? S.clothDeep : S.cloth;
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = INK;
    ctx.stroke();
  } else if (el === 'fire') {
    // Hand wraps on the last ~40% of the forearm only.
    ctx.beginPath();
    wxCapsule(ctx, wxAlong(e, h, 0.58, WX_Q0), A[1] + 0.3, wxAlong(e, h, 0.9, WX_Q1), A[2] + 0.8);
    ctx.fillStyle = rear ? S.clothDeep : S.cloth;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.fine && !rear) {
      let dx = h[0] - e[0], dy = h[1] - e[1];
      const dl = len2(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const p = wxAlong(e, h, 0.74, WX_Q0), w = A[2] + 0.5;
      ctx.beginPath();
      ctx.moveTo(p[0] - dy * w - dx * 1.1, p[1] + dx * w - dy * 1.1);
      ctx.lineTo(p[0] + dy * w + dx * 1.1, p[1] - dx * w + dy * 1.1);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,248,232,0.75)';
      ctx.stroke();
    }
  }
}

function wxHand(ctx, S, p, from, rear) {
  const { el } = S;
  const r = S.B.hand * S.k * (rear ? 0.94 : 1);
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, TAU);
  ctx.fillStyle = S.flash ? FLASH : PAPER;
  ctx.fill();
  ctx.lineWidth = el === 'earth' ? 2 : 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (el === 'fire') {
    // Paper fist with a red knuckle band on the striking side.
    const a = Math.atan2(p[1] - from[1], p[0] - from[0]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], r * 0.5, a - 1.15, a + 1.15);
    ctx.lineWidth = r * 0.55;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rear ? S.clothDeep : S.cloth;
    ctx.stroke();
  } else if (el === 'earth' && S.fine) {
    ctx.beginPath();
    ctx.arc(p[0] - r * 0.15, p[1] + r * 0.15, r * 0.5, -Math.PI * 0.4, Math.PI * 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function wxFace(ctx, S) {
  const { el, hr, recoil, stroke } = S;
  const ey = el === 'earth' ? 1.2 : -0.4;
  const ex = hr * 0.48;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  if (S.ko) {
    ctx.beginPath();
    ctx.moveTo(ex - 1.7, ey - 1.7); ctx.lineTo(ex + 1.7, ey + 1.7);
    ctx.moveTo(ex + 1.7, ey - 1.7); ctx.lineTo(ex - 1.7, ey + 1.7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (S.dizzy) {
    ctx.beginPath();
    ctx.arc(ex, ey, 1.9, 0, Math.PI * 1.6);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  } else if (recoil > 0.3) {
    ctx.beginPath();
    ctx.moveTo(ex - 1.6, ey - 1.6);
    ctx.lineTo(ex + 0.9, ey);
    ctx.lineTo(ex - 1.6, ey + 1.6);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    if (stroke > 0.6) ctx.ellipse(ex, ey, 1.6, 0.9, 0, 0, TAU);
    else ctx.arc(ex, ey, 1.3, 0, TAU);
    ctx.fill();
  }
  if (el !== 'earth') {
    // Brush brow: slants down toward the nose for a focused look.
    ctx.beginPath();
    ctx.moveTo(ex - 2.6, ey - 3.4 + (recoil > 0.3 || S.ko ? -0.8 : 0));
    ctx.lineTo(ex + 2.0, ey - (S.boss ? 1.6 : 2.3));
    ctx.lineWidth = S.boss ? 1.6 : 1.2;
    ctx.stroke();
  }
  if (!S.fine) return; // a mouth at 1x reads as a second eye
  ctx.beginPath();
  if (stroke > 0.6 || recoil > 0.3 || S.ko) {
    ctx.ellipse(hr * 0.56, 4.2, 1.3, recoil > 0.3 ? 1.5 : 1.1, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.moveTo(hr * 0.38, 4.3);
    ctx.lineTo(hr * 0.7, 4.0);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#6b6653';
    ctx.stroke();
  }
}
