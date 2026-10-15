import { ARENAS, ELEMENTS } from './data.js';

const WIDTH = 1280;
const HEIGHT = 720;
const INK = '#263b3c';
const PAPER = '#fff8e8';
const COLORS = { air: '#459d91', water: '#4c8fc1', earth: '#82964e', fire: '#dc7251' };
const PALETTES = {
  air: { sky: '#e7eee5', horizon: '#f7eed8', far: '#d1ddd3', mid: '#b3c9bd', near: '#88ab9c', stone: '#e4ddbd', side: '#a7b4a0', accent: '#5a9380' },
  water: { sky: '#daeaf0', horizon: '#eef6ee', far: '#c4dce3', mid: '#a5c7d5', near: '#83acbf', stone: '#e7eeee', side: '#9ebac5', accent: '#568ea4' },
  earth: { sky: '#e4e8d1', horizon: '#f6ecd0', far: '#d3d9b8', mid: '#b5c59c', near: '#8fa577', stone: '#d9d0a8', side: '#9eaa81', accent: '#6b8650' },
  fire: { sky: '#f1dfd0', horizon: '#f8e8ce', far: '#e8c9b6', mid: '#d4af98', near: '#b88c78', stone: '#e5c7a2', side: '#b5927b', accent: '#a9654e' },
};

function polygon(ctx, points, fill, stroke = null, lineWidth = 1) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function circle(ctx, x, y, radius, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(ctx, points, color, width = 2) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function noise(i) {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function elementColor(element) {
  return ELEMENTS[element]?.color || COLORS[element] || COLORS.air;
}

function groundDepth(entity) {
  return Number.isFinite(entity.depth) ? entity.depth : (entity.y || 0) + (entity.z || 0);
}

const POSE_JOINTS = ['hip', 'shoulder', 'head', 'rearKnee', 'rearFoot', 'frontKnee', 'frontFoot', 'rearElbow', 'rearHand', 'elbow', 'hand'];
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const pointMix = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

const FIGHTING_STANCES = {
  air: { lean: -3, rearFoot: [-18, -1], frontFoot: [17, -1], rearHand: [-17, -42], rearElbow: [-15, -32], elbow: [17, -35], hand: [26, -44] },
  water: { lean: -4, drop: 4, rearFoot: [-20, -1], frontFoot: [21, -1], rearKnee: [-13, -12], frontKnee: [16, -12], rearElbow: [-15, -34], rearHand: [-5, -44], elbow: [18, -30], hand: [29, -35] },
  earth: { lean: 1, drop: 5, rearFoot: [-23, -1], frontFoot: [24, -1], rearKnee: [-16, -11], frontKnee: [18, -11], rearElbow: [-15, -29], rearHand: [-9, -37], elbow: [20, -30], hand: [21, -40] },
  fire: { lean: 5, drop: 1, rearFoot: [-21, -1], frontFoot: [17, -1], rearElbow: [-6, -34], rearHand: [8, -47], elbow: [21, -35], hand: [28, -45] },
};

const CAST_POSES = {
  air: { trail: 'cast', wind: { lean: -8, rearHand: [-20, -48], hand: [-7, -57], elbow: [-11, -38] }, strike: { lean: 9, elbow: [25, -42], hand: [40, -45], rearElbow: [20, -29], rearHand: [36, -32], rearFoot: [-23, -1], frontFoot: [23, -1] } },
  water: { trail: 'cast', wind: { lean: -9, drop: 6, hand: [-17, -33], elbow: [-19, -21], rearHand: [3, -54], rearFoot: [-24, -1], frontFoot: [25, -1] }, strike: { lean: 8, drop: 3, elbow: [24, -40], hand: [40, -45], rearHand: [28, -28], rearFoot: [-24, -1], frontFoot: [25, -1] } },
  earth: { trail: 'cast', wind: { lean: -5, drop: 8, elbow: [-15, -25], hand: [-13, -38], rearHand: [4, -42], frontFoot: [27, -1], rearFoot: [-26, -1] }, strike: { lean: 14, drop: 8, elbow: [29, -31], hand: [44, -33], rearHand: [-12, -29], frontFoot: [29, -1], rearFoot: [-26, -1] } },
  fire: { trail: 'cast', wind: { lean: -8, elbow: [-12, -39], hand: [-13, -51], rearHand: [17, -46], rearFoot: [-23, -1] }, strike: { lean: 15, elbow: [28, -41], hand: [44, -43], rearHand: [-13, -30], frontFoot: [24, -1], rearFoot: [-26, -1] } },
};

// Original combat silhouettes: every class has its own preparation and contact poses.
const COMBO_POSES = {
  air: [
    { trail: 'palm', wind: { lean: -5, elbow: [-7, -41], hand: [-11, -45], rearHand: [14, -46] }, strike: { lean: 9, elbow: [25, -43], hand: [41, -44], rearHand: [-8, -31], frontFoot: [17, -1] } },
    { trail: 'palm', contact: 'rearHand', wind: { lean: -3, rearElbow: [-12, -36], rearHand: [-11, -44], hand: [18, -49] }, strike: { lean: 7, rearElbow: [24, -39], rearHand: [42, -36], elbow: [10, -40], hand: [16, -51], frontFoot: [18, -1] } },
    { trail: 'rise', contact: 'frontFoot', wind: { lean: -4, drop: 4, frontKnee: [14, -20], frontFoot: [12, -7], hand: [15, -48] }, strike: { lean: -8, drop: -2, frontKnee: [18, -43], frontFoot: [29, -66], rearFoot: [-8, -1], rearHand: [-18, -33], elbow: [7, -38], hand: [17, -50] } },
  ],
  water: [
    { trail: 'sweep', wind: { lean: -6, hand: [-9, -57], elbow: [-11, -44], rearHand: [19, -35] }, strike: { lean: 6, drop: 5, elbow: [19, -25], hand: [38, -22], rearHand: [-18, -37], frontFoot: [19, -1], rearFoot: [-17, -1] } },
    { trail: 'pull', wind: { lean: 8, elbow: [25, -35], hand: [43, -32], rearHand: [23, -49] }, strike: { lean: -9, drop: 3, elbow: [-8, -35], hand: [6, -43], rearElbow: [-17, -31], rearHand: [-23, -36], frontFoot: [19, -1], rearFoot: [-19, -1] } },
    { trail: 'freeze', wind: { lean: -6, hand: [-9, -43], elbow: [-12, -34], rearHand: [-3, -53] }, strike: { lean: 7, elbow: [23, -44], hand: [40, -45], rearElbow: [12, -31], rearHand: [28, -33], frontFoot: [19, -1], rearFoot: [-18, -1] } },
  ],
  earth: [
    { trail: 'punch', wind: { lean: -3, drop: 4, hand: [-7, -42], elbow: [-11, -33], frontFoot: [21, -1], rearFoot: [-20, -1] }, strike: { lean: 7, drop: 3, elbow: [23, -42], hand: [38, -41], rearHand: [-10, -35], frontFoot: [22, -1], rearFoot: [-21, -1] } },
    { trail: 'body', wind: { lean: -6, drop: 7, elbow: [-12, -28], hand: [-8, -34], frontFoot: [22, -1], rearFoot: [-22, -1] }, strike: { lean: 13, drop: 8, elbow: [26, -28], hand: [42, -29], rearHand: [-6, -43], frontFoot: [24, -1], rearFoot: [-22, -1] } },
    { trail: 'slam', wind: { lean: -4, drop: -1, elbow: [-13, -53], hand: [-10, -70], rearElbow: [12, -53], rearHand: [14, -70], frontFoot: [23, -1], rearFoot: [-22, -1] }, strike: { lean: 12, drop: 14, elbow: [21, -18], hand: [29, -4], rearElbow: [8, -21], rearHand: [20, -9], frontKnee: [18, -11], rearKnee: [-16, -10], frontFoot: [25, -1], rearFoot: [-22, -1] } },
  ],
  fire: [
    { trail: 'punch', wind: { lean: -4, elbow: [-7, -36], hand: [-5, -47], rearHand: [17, -41] }, strike: { lean: 10, elbow: [26, -44], hand: [43, -44], rearHand: [-9, -32], frontFoot: [17, -1], rearFoot: [-18, -1] } },
    { trail: 'cross', wind: { lean: -8, elbow: [-13, -39], hand: [-12, -48], rearHand: [19, -45] }, strike: { lean: 13, drop: 1, elbow: [29, -41], hand: [46, -48], rearElbow: [-9, -32], rearHand: [-15, -27], frontFoot: [23, -1], rearFoot: [-23, -1] } },
    { trail: 'kick', contact: 'frontFoot', wind: { lean: -6, drop: 3, frontKnee: [15, -26], frontFoot: [6, -15], hand: [15, -48] }, strike: { lean: 4, drop: -2, frontKnee: [28, -29], frontFoot: [51, -29], rearKnee: [-12, -20], rearFoot: [-23, -7], elbow: [10, -40], hand: [18, -51], rearHand: [-19, -29] } },
  ],
};

function poseWith(base, overrides) {
  const pose = {};
  for (const key of POSE_JOINTS) pose[key] = [...base[key]];
  pose.weaponAngle = base.weaponAngle;
  const lean = overrides.lean || 0;
  const drop = overrides.drop || 0;
  pose.hip = [lean * 0.3, -27 + drop];
  pose.shoulder = [lean, -45 + drop];
  pose.head = [lean + 1, -57 + drop];
  for (const key of POSE_JOINTS) if (overrides[key]) pose[key] = [...overrides[key]];
  if (overrides.weaponAngle !== undefined) pose.weaponAngle = overrides.weaponAngle;
  return pose;
}

function blendPose(a, b, amount) {
  const pose = {};
  for (const key of POSE_JOINTS) pose[key] = pointMix(a[key], b[key], amount);
  pose.weaponAngle = mix(a.weaponAngle, b.weaponAngle, amount);
  return pose;
}

function fighterPose(fighter, time, reducedMotion, transitionFrom = null) {
  const frozen = fighter.frozen > 0;
  const speed = frozen ? 0 : Math.min(1, Math.hypot(fighter.vx || 0, fighter.vDepth || fighter.vd || 0) / 240);
  const phase = time * (fighter.running ? 18 : 14) + (Number(fighter.id) || 0);
  const stride = fighter.grounded && !fighter.stun && !frozen ? Math.sin(phase) * speed : 0;
  const bob = reducedMotion || frozen ? 0 : Math.sin(time * 3.5) * (speed < 0.1 ? 0.7 : 0);
  const lean = speed * 4;
  let rest = {
    hip: [lean * 0.3, -27 + bob], shoulder: [lean, -45 + bob], head: [lean + 1, -57 + bob],
    rearFoot: fighter.grounded ? [-11 - stride * 11, -1] : [-15, -14], frontFoot: fighter.grounded ? [11 + stride * 11, -1] : [12, -9],
    rearKnee: [-10 - stride * 3, -15 - Math.abs(stride) * 3], frontKnee: [8 + stride * 5, -15],
    rearElbow: [-14 - stride * 3, -32], rearHand: [-9 - stride * 5, -27], elbow: [14 + stride * 3, -35], hand: [19 - stride * 4, -42], weaponAngle: -1.24,
  };
  if (fighter.grounded && speed < 0.15) rest = poseWith(rest, FIGHTING_STANCES[fighter.element] || FIGHTING_STANCES.air);
  if (fighter.recoveryRoll) {
    const progress = clamp01(fighter.recoveryRoll.t / fighter.recoveryRoll.duration);
    const tuck = poseWith(rest, { hip: [-4, -17], shoulder: [-8, -29], head: [5, -33],
      rearKnee: [8, -13], rearFoot: [4, -5], frontKnee: [15, -23], frontFoot: [17, -8],
      rearElbow: [1, -32], rearHand: [11, -20], elbow: [11, -28], hand: [13, -15] });
    const amount = smooth(progress / 0.12) * (1 - smooth((progress - 0.82) / 0.18));
    return { pose: blendPose(rest, tuck, amount), stroke: 0, style: null, recoil: 0, speed };
  }
  if (fighter.guard) rest = poseWith(rest, { lean: -2, drop: 2, rearElbow: [6, -39], rearHand: [14, -51], elbow: [12, -35], hand: [16, -51], rearFoot: [-15, -1], frontFoot: [13, -1] });
  if (fighter.grabTarget != null) rest = poseWith(rest, { lean: 5, drop: 3,
    elbow: [22, -38], hand: [34, -39], rearElbow: [16, -31], rearHand: [30, -33],
    rearFoot: [-18, -1], frontFoot: [17, -1] });
  let pose = rest;
  let stroke = 0;
  let style = null;
  const action = fighter.action;
  if (action || fighter.attackTimer > 0) {
    const kind = fighter.attackKind || action?.kind || 'melee';
    const combo = Math.max(0, Math.min(2, (fighter.comboIndex || 1) - 1));
    style = COMBO_POSES[fighter.element]?.[combo] || COMBO_POSES.air[combo];
    if (fighter.weapon && kind !== 'special' && kind !== 'burst') {
      style = { trail: 'weapon', wind: { lean: -7, elbow: [-11, -43], hand: [-14, -55], weaponAngle: -2 }, strike: { lean: 11, elbow: [23, -38], hand: [37, -40], weaponAngle: -0.08, frontFoot: [21, -1], rearFoot: [-18, -1] } };
    }
    if (kind === 'runAttack') style = { trail: 'rush', wind: { lean: 3, drop: 6, hand: [8, -44] }, strike: { lean: 17, drop: 3, elbow: [30, -38], hand: [46, -38], rearFoot: [-25, -4], frontFoot: [20, -1], weaponAngle: -0.08 } };
    if (kind === 'aerial') style = { trail: fighter.element === 'air' ? 'rise' : 'kick', contact: 'frontFoot', wind: { lean: -6, frontKnee: [13, -30], frontFoot: [6, -21], hand: [15, -48] }, strike: { lean: -8, frontKnee: [24, -30], frontFoot: [45, -24], rearFoot: [-19, -14], hand: [16, -49] } };
    if (kind === 'throw' || kind === 'bodyThrow') style = { trail: 'throw', wind: { lean: -8, elbow: [-12, -49], hand: [-17, -64], weaponAngle: -1.8 }, strike: { lean: 12, elbow: [25, -49], hand: [43, -51], weaponAngle: -0.2, frontFoot: [23, -1] } };
    if (kind === 'grabPunch') style = { trail: 'body',
      wind: { lean: -3, drop: 3, elbow: [-7, -34], hand: [-9, -43], rearElbow: [20, -33], rearHand: [33, -38] },
      strike: { lean: 10, drop: 5, elbow: [24, -32], hand: [39, -34], rearElbow: [20, -33], rearHand: [33, -38], frontFoot: [20, -1] } };
    if (kind === 'special' || kind === 'burst') style = CAST_POSES[fighter.element] || CAST_POSES.air;
    const windup = Math.max(0.035, action?.windup || 0.11);
    const activeUntil = Math.max(windup + 0.025, action?.activeUntil || windup + 0.07);
    const duration = Math.max(activeUntil + 0.04, action?.duration || activeUntil + 0.18);
    const t = action ? Math.max(0, action.t || 0) : Math.max(0, duration - fighter.attackTimer);
    const prepared = poseWith(rest, style.wind);
    const contact = poseWith(rest, style.strike);
    const follow = blendPose(contact, rest, 0.1);
    const anticipationEnd = windup * 0.58;
    if (t < anticipationEnd) {
      pose = blendPose(transitionFrom || rest, prepared, smooth(t / anticipationEnd));
    } else if (t < windup) {
      const extension = clamp01((t - anticipationEnd) / (windup - anticipationEnd));
      pose = blendPose(prepared, contact, 1 - (1 - extension) ** 3);
      stroke = extension * 0.55;
    } else if (t < activeUntil) {
      pose = blendPose(contact, follow, smooth((t - windup) / (activeUntil - windup)));
      stroke = 1;
    } else {
      const recovery = smooth((t - activeUntil) / (duration - activeUntil));
      pose = blendPose(follow, rest, recovery);
      stroke = Math.max(0, 0.85 - recovery * 2.4);
    }
  }

  const hitRatio = clamp01((fighter.hitReact || 0) / (fighter.hitMax || 0.35));
  const strength = clamp01(fighter.hitStrength ?? 0.5);
  const recoil = hitRatio ** 0.65 * (0.5 + strength * 0.5);
  const hitDirection = (fighter.hitDirection || -(fighter.facing || 1)) * (fighter.facing < 0 ? -1 : 1);
  if (fighter.stun > 0 && !frozen) {
    const recovering = smooth(fighter.stun / 0.12);
    if (fighter.hitType === 'dizzy') {
      const hunched = poseWith(rest, {
        lean: 11, drop: 8, head: [16, -43], shoulder: [11, -36],
        rearElbow: [-5, -24], rearHand: [3, -15], elbow: [20, -24], hand: [19, -13],
        rearKnee: [-11, -13], frontKnee: [11, -12], rearFoot: [-16, -1], frontFoot: [17, -1],
      });
      pose = blendPose(pose, hunched, 0.95 * recovering * (1 - recoil));
    } else {
      pose = blendPose(pose, poseWith(rest, { lean: -5, drop: 2, elbow: [10, -33], hand: [20, -28] }), 0.5 * recovering * (1 - recoil));
    }
  }
  if (fighter.grabbedBy != null) {
    pose = poseWith(rest, { lean: 9, drop: 7, head: [12, -45], shoulder: [9, -36],
      elbow: [16, -24], hand: [14, -15], rearElbow: [-6, -27], rearHand: [2, -17],
      rearFoot: [-13, -1], frontFoot: [14, -1] });
    stroke = 0;
    style = null;
  }
  if (recoil > 0) {
    const compression = (fighter.hitType === 'slam' ? 13 : fighter.hitType === 'launch' ? -3 : 6) * recoil;
    for (const key of ['hip', 'shoulder', 'head', 'rearElbow', 'rearHand', 'elbow', 'hand']) {
      const force = key === 'hip' ? 4 : key === 'head' ? 23 : 16;
      pose[key] = [pose[key][0] + hitDirection * force * recoil, pose[key][1] + compression];
    }
    pose.rearKnee[0] += hitDirection * 5 * recoil;
    pose.frontKnee[0] += hitDirection * 5 * recoil;
    pose.elbow = pointMix(pose.elbow, [hitDirection * 24, -29 + compression], recoil);
    pose.hand = pointMix(pose.hand, [hitDirection * 36, -21 + compression], recoil);
    stroke *= 1 - recoil;
  }
  return { pose, stroke, style, recoil, speed };
}

function cloud(ctx, x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-68, 13);
  ctx.bezierCurveTo(-86, 12, -84, -10, -57, -10);
  ctx.bezierCurveTo(-54, -39, -9, -41, 3, -15);
  ctx.bezierCurveTo(28, -35, 57, -19, 57, 0);
  ctx.bezierCurveTo(88, -5, 96, 12, 75, 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function temple(ctx, x, y, scale, palette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = palette.far;
  ctx.fillRect(-43, -54, 86, 54);
  ctx.fillStyle = palette.mid;
  ctx.fillRect(-29, -47, 10, 47);
  ctx.fillRect(19, -47, 10, 47);
  ctx.fillRect(-8, -32, 16, 32);
  polygon(ctx, [[-62, -49], [-38, -62], [0, -86], [38, -62], [62, -49], [34, -53], [-34, -53]], palette.near);
  polygon(ctx, [[-37, -85], [0, -109], [37, -85], [21, -87], [-21, -87]], palette.near);
  ctx.fillStyle = palette.far;
  ctx.fillRect(-20, -84, 40, 15);
  ctx.fillStyle = palette.near;
  ctx.fillRect(-48, 0, 96, 6);
  ctx.fillRect(-55, 7, 110, 5);
  ctx.restore();
}

function elementGlyph(ctx, element, x, y, radius, color, width = 2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radius / 12, radius / 12);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (element === 'water') {
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.bezierCurveTo(-3, -4, -9, 0, -8, 5);
    ctx.bezierCurveTo(-6, 13, 8, 13, 8, 4);
    ctx.bezierCurveTo(8, 0, 2, -7, 0, -11);
    ctx.stroke();
  } else if (element === 'earth') {
    polygon(ctx, [[-10, 8], [-6, -9], [6, -9], [10, 8]], null, color, width);
    line(ctx, [[-4, 3], [0, -3], [4, 3]], color, width);
  } else if (element === 'fire') {
    ctx.beginPath();
    ctx.moveTo(1, -12);
    ctx.bezierCurveTo(11, -1, 12, 6, 4, 10);
    ctx.bezierCurveTo(-7, 14, -14, 3, -6, -4);
    ctx.lineTo(-3, 2);
    ctx.quadraticCurveTo(3, -2, 1, -12);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-11, -5);
    ctx.lineTo(5, -5);
    ctx.bezierCurveTo(15, -5, 12, -15, 6, -10);
    ctx.moveTo(-8, 1);
    ctx.lineTo(9, 1);
    ctx.moveTo(-11, 7);
    ctx.lineTo(2, 7);
    ctx.bezierCurveTo(10, 7, 8, 14, 3, 12);
    ctx.stroke();
  }
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = WIDTH * this.pixelRatio;
    canvas.height = HEIGHT * this.pixelRatio;
    this.backgrounds = new Map();
    this.fighterAnimations = new WeakMap();
  }

  arenaKey(state) {
    const arena = state.arena;
    if (typeof arena === 'string' && PALETTES[arena]) return arena;
    if (PALETTES[state.settings?.arena]) return state.settings.arena;
    if (PALETTES[arena?.element]) return arena.element;
    if (PALETTES[arena?.id]) return arena.id;
    return 'air';
  }

  background(key) {
    if (this.backgrounds.has(key)) return this.backgrounds.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const palette = PALETTES[key];
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, palette.sky);
    sky.addColorStop(0.72, palette.horizon);
    sky.addColorStop(1, palette.mid);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The scenery uses a restrained palette so combat silhouettes remain readable.
    circle(ctx, 1000, 130, 60, key === 'fire' ? '#f9d8a5' : '#faf4df');
    circle(ctx, 1000, 130, 71, null, '#faf5e280', 1);
    cloud(ctx, 155, 118, 1.25, '#fffaf070');
    cloud(ctx, 545, 85, 0.8, '#fffaf085');
    cloud(ctx, 1090, 232, 1.4, '#fffaf060');

    const peaks = key === 'earth'
      ? [[-80, 560], [90, 248], [155, 223], [240, 560], [345, 280], [391, 261], [472, 560], [590, 193], [655, 213], [732, 560], [862, 288], [907, 275], [1010, 560], [1130, 180], [1200, 213], [1360, 560]]
      : [[-50, 510], [104, 297], [225, 454], [355, 230], [520, 452], [677, 282], [795, 433], [948, 252], [1120, 452], [1250, 275], [1350, 490]];
    polygon(ctx, [...peaks, [WIDTH + 30, HEIGHT], [-30, HEIGHT]], palette.far);
    polygon(ctx, [[-50, 570], [145, 361], [285, 536], [420, 392], [613, 568], [770, 367], [968, 563], [1126, 353], [1350, 600], [1350, 720], [-50, 720]], palette.mid);

    if (key === 'water') {
      polygon(ctx, [[74, 338], [104, 297], [150, 356], [111, 341], [102, 325]], '#eef4e8');
      polygon(ctx, [[306, 295], [355, 230], [411, 306], [366, 285], [349, 263], [334, 291]], '#eef4e8');
      polygon(ctx, [[907, 308], [948, 252], [1000, 320], [956, 299], [939, 284]], '#eef4e8');
      ctx.fillStyle = '#a6c9d180';
      ctx.fillRect(0, 319, WIDTH, 160);
      for (let i = 0; i < 26; i += 1) {
        const x = noise(i + 10) * WIDTH;
        const y = 322 + noise(i + 30) * 90;
        line(ctx, [[x, y], [x + 35 + noise(i) * 90, y]], '#eff5ec70', 2);
      }
      temple(ctx, 192, 352, 0.88, palette);
      temple(ctx, 1050, 354, 1.15, palette);
    } else if (key === 'earth') {
      temple(ctx, 624, 352, 1.12, palette);
      for (let side = 0; side < 2; side += 1) {
        for (let i = 0; i < 5; i += 1) {
          const x = side ? WIDTH - 15 - i * 23 : 12 + i * 25;
          const top = 285 + noise(i) * 110;
          line(ctx, [[x, 720], [x - 5, top]], palette.near, 7);
          for (let y = top + 40; y < 720; y += 55) {
            line(ctx, [[x - 6, y], [x + 3, y]], palette.mid, 3);
            if (y < 520) {
              polygon(ctx, [[x, y], [x + 35, y - 20], [x + 17, y]], palette.near);
              polygon(ctx, [[x - 2, y + 8], [x - 33, y - 8], [x - 18, y + 14]], palette.near);
            }
          }
        }
      }
    } else if (key === 'fire') {
      polygon(ctx, [[479, 491], [650, 286], [693, 292], [845, 498]], palette.near);
      polygon(ctx, [[633, 306], [650, 286], [693, 292], [712, 319], [680, 311], [664, 314]], '#c7765a');
      ctx.globalAlpha = 0.25;
      cloud(ctx, 674, 255, 0.6, palette.near);
      cloud(ctx, 703, 219, 0.9, palette.near);
      cloud(ctx, 746, 184, 1.2, palette.near);
      ctx.globalAlpha = 1;
      temple(ctx, 193, 350, 1.05, palette);
      temple(ctx, 1085, 350, 1.05, palette);
    } else {
      // Monasteries sit on distant ridges, well beyond the courtyard.
      polygon(ctx, [[90, 365], [165, 327], [270, 327], [334, 365]], palette.mid);
      polygon(ctx, [[925, 365], [988, 330], [1080, 330], [1163, 365]], palette.mid);
      temple(ctx, 211, 327, 1, palette);
      temple(ctx, 1038, 330, 0.92, palette);
      cloud(ctx, 380, 335, 1.5, '#f1f1dd80');
      cloud(ctx, 866, 346, 1.6, '#f1f1dd80');
    }

    this.drawCourtyard(ctx, palette, key);
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 450; i += 1) {
      ctx.fillStyle = i % 2 ? '#fff8e8' : palette.accent;
      ctx.fillRect(noise(i * 3) * WIDTH, noise(i * 3 + 1) * HEIGHT, 1, 1);
    }
    ctx.globalAlpha = 1;
    this.backgrounds.set(key, canvas);
    return canvas;
  }

  drawCourtyard(ctx, palette, element) {
    // All visible floor tiles are on the same continuous walkable plane.
    ctx.fillStyle = palette.side;
    ctx.fillRect(0, 351, WIDTH, 19);
    ctx.fillStyle = palette.stone;
    ctx.fillRect(0, 348, WIDTH, 7);
    line(ctx, [[0, 350], [WIDTH, 350]], palette.accent, 2);
    for (let x = 50; x < WIDTH; x += 78) {
      line(ctx, [[x, 355], [x, 367]], palette.accent, 1);
    }

    const floor = ctx.createLinearGradient(0, 365, 0, 710);
    floor.addColorStop(0, '#f3efdc');
    floor.addColorStop(1, palette.stone);
    ctx.fillStyle = floor;
    ctx.fillRect(0, 365, WIDTH, 355);
    ctx.fillStyle = palette.side;
    ctx.fillRect(0, 681, WIDTH, 39);
    ctx.fillStyle = palette.stone;
    ctx.fillRect(0, 681, WIDTH, 9);
    line(ctx, [[0, 682], [WIDTH, 682]], '#52665a', 2);
    line(ctx, [[0, 692], [WIDTH, 692]], '#ffffff45', 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 366, WIDTH, 315);
    ctx.clip();
    ctx.globalAlpha = 0.22;
    for (const y of [386, 413, 448, 492, 548, 614, 681]) {
      line(ctx, [[0, y], [WIDTH, y]], palette.accent, 1.2);
      line(ctx, [[0, y + 2], [WIDTH, y + 2]], '#fffced', 1);
    }
    for (let x = -900; x <= 2200; x += 155) {
      const top = WIDTH / 2 + (x - WIDTH / 2) * 0.36;
      line(ctx, [[top, 365], [x, 710]], palette.accent, 1.1);
    }
    ctx.restore();

    // An inset boundary marks depth limits without implying ledges or platforms.
    ctx.save();
    ctx.globalAlpha = 0.27;
    line(ctx, [[30, 395], [1250, 395]], palette.accent, 2);
    line(ctx, [[30, 650], [1250, 650]], palette.accent, 2);
    line(ctx, [[30, 395], [30, 650]], palette.accent, 2);
    line(ctx, [[1250, 395], [1250, 650]], palette.accent, 2);
    for (const x of [30, 1250]) {
      for (const y of [395, 650]) {
        polygon(ctx, [[x, y - 5], [x + 8, y], [x, y + 5], [x - 8, y]], palette.accent);
      }
    }
    ctx.translate(640, 518);
    ctx.scale(1, 0.44);
    circle(ctx, 0, 0, 116, null, palette.accent, 2);
    circle(ctx, 0, 0, 106, null, palette.accent, 1);
    elementGlyph(ctx, element, 0, 0, 47, palette.accent, 1);
    ctx.restore();

    // Architectural accents stand behind the back wall, outside the combat area.
    for (const x of [20, 1260]) {
      ctx.fillStyle = palette.side;
      ctx.fillRect(x - 11, 228, 22, 121);
      ctx.fillStyle = palette.stone;
      ctx.fillRect(x - 7, 228, 10, 121);
      polygon(ctx, [[x - 22, 229], [x - 12, 217], [x + 12, 217], [x + 22, 229]], palette.accent, '#52665a', 1);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(x - 17, 340, 34, 9);
      ctx.fillRect(x - 20, 349, 40, 6);
      ctx.fillStyle = '#f1e7c3';
      ctx.fillRect(x - 11, 252, 22, 31);
      elementGlyph(ctx, element, x, 267, 7, palette.accent, 2);
    }
  }

  draw(state, { reducedMotion = false } = {}) {
    if (!state) return;
    const ctx = this.ctx;
    const key = this.arenaKey(state);
    const time = state.time || 0;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.background(key), 0, 0);
    ctx.save();
    const shake = reducedMotion ? 0 : Math.min(12, state.shake || 0);
    if (shake > 0) ctx.translate(Math.sin(time * 173) * shake, Math.cos(time * 137) * shake * 0.65);

    this.drawAmbient(time, key, reducedMotion);
    const fighters = [...(state.enemies || []), state.player].filter(fighter => fighter && !fighter.dead);
    const corpses = state.corpses || [];
    const weapons = state.weapons || [];
    const projectiles = state.projectiles || [];
    for (const fighter of fighters) this.drawGroundShadow(fighter, 'fighter');
    for (const corpse of corpses) this.drawGroundShadow(corpse, 'corpse');
    for (const weapon of weapons) this.drawGroundShadow(weapon, 'pickup');
    for (const projectile of projectiles) if (projectile.kind === 'weapon') this.drawGroundShadow(projectile, 'projectile');
    for (const effect of state.effects || []) if (effect.kind !== 'impact' && effect.kind !== 'slash') this.drawEffect(effect, reducedMotion);
    const objects = [
      ...fighters.map(entity => ({ entity, kind: 'fighter' })),
      ...corpses.map(entity => ({ entity, kind: 'corpse' })),
      ...weapons.map(entity => ({ entity, kind: 'pickup' })),
      ...projectiles.map(entity => ({ entity, kind: 'projectile' })),
    ].sort((a, b) => groundDepth(a.entity) - groundDepth(b.entity));
    for (const { entity, kind } of objects) {
      if (kind === 'fighter') this.drawFighter(entity, time, reducedMotion, state.player);
      else if (kind === 'corpse') this.drawCorpse(entity);
      else if (kind === 'pickup') this.drawWeaponPickup(entity, reducedMotion ? 0 : time);
      else this.drawProjectile(entity, time, reducedMotion);
    }
    for (const effect of state.effects || []) if (effect.kind === 'impact' || effect.kind === 'slash') this.drawEffect(effect, reducedMotion);
    for (const particle of state.particles || []) this.drawParticle(particle, reducedMotion);
    for (const floater of state.floaters || []) this.drawFloater(floater);
    ctx.restore();

    this.drawEdgeDetails(state, key);
    if (state.banner && state.bannerTime > 0) this.drawBanner(state.banner, state.bannerTime);
  }

  drawAmbient(time, element, reducedMotion) {
    const ctx = this.ctx;
    const t = reducedMotion ? 0 : time;
    ctx.save();
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 11; i += 1) {
      const x = (noise(i + 61) * WIDTH + t * (element === 'air' ? 17 : 4)) % WIDTH;
      const y = 110 + noise(i + 93) * 470 + Math.sin(t + i) * 8;
      if (element === 'air') {
        line(ctx, [[x, y], [x + 26, y], [x + 34, y - 3]], '#fffdf0', 2);
      } else if (element === 'fire') {
        circle(ctx, x, y - (t * 4) % 60, 1.7, '#d98855');
      } else if (element === 'earth') {
        polygon(ctx, [[x, y], [x + 7, y - 3], [x + 5, y + 3]], '#718b5a');
      } else {
        circle(ctx, x, y, 2, '#ffffff');
      }
    }
    ctx.restore();
  }

  drawGroundShadow(entity, kind) {
    const ctx = this.ctx;
    const depth = groundDepth(entity);
    const height = Math.max(0, entity.z || depth - entity.y || 0);
    const scale = (entity.h || 66) / 66;
    const radius = kind === 'pickup' ? (entity.kind === 'crate' ? 25 : 17) : kind === 'projectile' ? 14 : (entity.recoveryRoll ? 25 : entity.knockdown > 0 ? 31 : 22) * scale;
    const fade = Math.max(0.08, 0.2 - height / 1500);
    ctx.save();
    ctx.globalAlpha = fade * (kind === 'corpse' ? Math.min(1, entity.life || 1) : 1);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(entity.x, depth + 2, radius * Math.max(0.65, 1 - height / 700), radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    if (entity.team === 'player') {
      ctx.globalAlpha = height > 8 ? 0.7 : 0.4;
      ctx.beginPath();
      ctx.ellipse(entity.x, depth + 2, 26 * scale, 8 * scale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = elementColor(entity.element);
      ctx.lineWidth = height > 8 ? 2 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWeaponPickup(weapon, time) {
    const ctx = this.ctx;
    const bob = Math.sin(time * 3 + weapon.x) * 3;
    ctx.save();
    ctx.translate(weapon.x, weapon.y + (weapon.kind === 'crate' ? 0 : bob));
    ctx.globalAlpha = 0.18;
    circle(ctx, 0, -14, 25, '#fffbe9');
    ctx.globalAlpha = 1;
    if (weapon.kind === 'crate') {
      polygon(ctx, [[-20, -33], [14, -33], [21, -27], [21, 0], [-14, 0], [-20, -6]], '#b89160', INK, 2);
      polygon(ctx, [[-20, -33], [14, -33], [21, -27], [-14, -27]], '#d7bb85', INK, 1.5);
      polygon(ctx, [[-20, -33], [-14, -27], [-14, 0], [-20, -6]], '#9b774f', INK, 1.5);
      line(ctx, [[-10, -22], [17, -5]], '#dfc394', 4);
      line(ctx, [[-10, -5], [17, -22]], '#dfc394', 4);
      for (const x of [-9, 16]) for (const y of [-21, -6]) circle(ctx, x, y, 1.5, INK);
    } else if (weapon.kind === 'heal' || weapon.kind === 'energy') {
      const healing = weapon.kind === 'heal';
      const color = healing ? '#739762' : '#548fae';
      ctx.fillStyle = '#c5ac7e';
      ctx.fillRect(-4, -31, 8, 7);
      polygon(ctx, [[-6, -26], [6, -26], [6, -20], [11, -14], [11, -4], [7, 0], [-7, 0], [-11, -4], [-11, -14], [-6, -20]], '#f8f2d9', INK, 2);
      ctx.fillStyle = color;
      ctx.fillRect(-8, -14, 16, 11);
      circle(ctx, 0, -9, 6, color);
      if (healing) {
        line(ctx, [[-4, -9], [4, -9]], PAPER, 2.5);
        line(ctx, [[0, -13], [0, -5]], PAPER, 2.5);
      } else {
        polygon(ctx, [[1, -15], [-4, -8], [0, -8], [-2, -3], [5, -10], [1, -10]], PAPER);
      }
      line(ctx, [[-6, -19], [-7, -16]], '#ffffff', 2);
    } else {
      this.drawHeldWeapon(weapon.kind, [-20, -1], [22, -27]);
    }
    ctx.fillStyle = INK;
    ctx.fillRect(-7, 8, 14, 14);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = PAPER;
    ctx.fillText('E', 0, 19);
    ctx.restore();
  }

  drawHeldWeapon(kind, start, end) {
    const ctx = this.ctx;
    if (kind === 'crate') {
      const x = (start[0] + end[0]) / 2;
      const y = (start[1] + end[1]) / 2;
      polygon(ctx, [[x - 14, y - 15], [x + 12, y - 15], [x + 16, y - 10], [x + 16, y + 13], [x - 10, y + 13], [x - 14, y + 8]], '#b89160', INK, 2);
      line(ctx, [[x - 8, y - 8], [x + 10, y + 7]], '#e6c799', 4);
      line(ctx, [[x + 10, y - 8], [x - 8, y + 7]], '#e6c799', 4);
      return;
    }
    line(ctx, [start, end], INK, 6);
    line(ctx, [start, end], '#caa36b', 3);
    if (kind === 'spear') {
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      polygon(ctx, [[end[0] + ux * 13, end[1] + uy * 13], [end[0] - uy * 5 - ux * 4, end[1] + ux * 5 - uy * 4], [end[0] + uy * 5 - ux * 4, end[1] - ux * 5 - uy * 4]], '#e6eeeb', INK, 1.5);
    } else {
      circle(ctx, start[0], start[1], 3, '#e6dbb3');
      circle(ctx, end[0], end[1], 3, '#e6dbb3');
    }
  }

  drawFighter(fighter, time, reducedMotion, player) {
    const ctx = this.ctx;
    const h = fighter.h || 66;
    const scale = h / 66;
    const color = elementColor(fighter.element);
    const facing = (fighter.recoveryRoll?.direction || fighter.facing) < 0 ? -1 : 1;
    const previous = this.fighterAnimations.get(fighter);
    const hitLag = (fighter.hitLag || 0) > 0;
    // Action timers pause in the simulation; this clock also holds idle motion,
    // cloth and status effects for the participants without freezing the arena.
    const visualTime = previous ? previous.visualTime + (hitLag ? 0 : Math.max(0, time - previous.time)) : time;
    const sameAction = previous?.action === fighter.action;
    const transitionFrom = sameAction ? previous?.transitionFrom : fighter.action && previous?.action && time - previous.time < 0.15 ? previous.pose : null;
    const { pose, stroke, style, recoil, speed } = fighterPose(fighter, visualTime, reducedMotion, transitionFrom);
    this.fighterAnimations.set(fighter, { action: fighter.action, time, visualTime, pose, transitionFrom });
    const guarding = Boolean(fighter.guard);
    const dizzy = (fighter.stun || 0) > 0 && fighter.hitType === 'dizzy' && fighter.grabbedBy == null;
    const frozen = (fighter.frozen || 0) > 0;
    const isBoss = fighter.type === 'boss';
    const isPlayer = fighter.team === 'player';
    const hitAge = (fighter.hitMax || 0.35) - (fighter.hitReact || 0);
    const flash = !reducedMotion && fighter.hitReact > 0 && hitAge < 0.045;
    const bodyColor = flash ? '#fffdf1' : color;
    const flutter = reducedMotion || frozen ? 0 : visualTime;
    const contactShake = !reducedMotion && hitLag && fighter.hitReact > 0 ? (Math.floor(time * 30) % 2 ? 2 : -2) : 0;

    if (fighter.recoveryRoll) this.drawRecoveryTrail(fighter, reducedMotion);
    else this.drawLaunchTrail(fighter, visualTime, reducedMotion);

    if ((fighter.knockdown || 0) > 0 && !fighter.recoveryRoll) {
      const airborne = (fighter.z || 0) > 4;
      const prone = airborne ? 1 : smooth(fighter.knockdown / 0.18);
      const rotation = airborne ? Math.PI * 0.38 * (fighter.hitDirection || facing) + (reducedMotion ? 0 : Math.sin(visualTime * 9) * 0.18) : Math.PI / 2 * facing * prone;
      this.drawCorpse({ ...fighter, x: fighter.x + contactShake - (airborne ? 0 : facing * 13 * prone), y: fighter.y - 8 - 7 * prone, rotation, life: 1 });
      if (isPlayer) polygon(ctx, [[fighter.x - 5, fighter.y - 36], [fighter.x + 5, fighter.y - 36], [fighter.x, fighter.y - 30]], color, INK, 1);
      this.drawFighterHealth(fighter, airborne ? h : 28);
      return;
    }

    ctx.save();

    if (fighter.tell && !isPlayer) {
      ctx.globalAlpha = reducedMotion ? 0.24 : 0.3 + Math.sin(visualTime * 16) * 0.12;
      circle(ctx, fighter.x, fighter.y - h * 0.52, h * 0.68, '#f3a863', '#ba522e', 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#a53b25';
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', fighter.x, fighter.y - h - 21);
    }

    if (isPlayer) {
      ctx.globalAlpha = 0.8;
      const markerHeight = fighter.recoveryRoll ? h * 0.62 : h;
      polygon(ctx, [[fighter.x - 5, fighter.y - markerHeight - 19], [fighter.x + 5, fighter.y - markerHeight - 19], [fighter.x, fighter.y - markerHeight - 13]], color, INK, 1);
      ctx.globalAlpha = 1;
    }

    if (guarding) {
      const parrying = (fighter.parryTimer || 0) > 0;
      ctx.save();
      ctx.globalAlpha = parrying ? 0.25 : 0.13;
      circle(ctx, fighter.x, fighter.y - h * 0.48, h * 0.62, color);
      ctx.globalAlpha = parrying ? 0.95 : 0.65;
      ctx.beginPath();
      ctx.arc(fighter.x, fighter.y - h * 0.48, h * 0.62, facing < 0 ? Math.PI * 0.52 : -Math.PI * 0.48, facing < 0 ? Math.PI * 1.48 : Math.PI * 0.48);
      ctx.strokeStyle = parrying ? '#fffdf0' : color;
      ctx.lineWidth = parrying ? 6 : 3;
      ctx.stroke();
      ctx.restore();
    }

    if ((fighter.slow || 0) > 0) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 3; i += 1) {
        const x = fighter.x + (i - 1) * 10;
        polygon(ctx, [[x - 5, fighter.y + 1], [x - 1, fighter.y - 12 - i * 2], [x + 5, fighter.y + 1]], '#b4dbe8', '#6e9ead', 1);
      }
      ctx.restore();
    }
    if ((fighter.burn || 0) > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 3; i += 1) {
        const x = fighter.x + (i - 1) * 9;
        const y = fighter.y - 8 - (flutter * 27 + i * 11) % 39;
        polygon(ctx, [[x - 3, y + 5], [x, y - 6], [x + 4, y + 4]], '#e88b42');
      }
      ctx.restore();
    }

    ctx.translate(fighter.x + contactShake, fighter.y);
    ctx.scale(scale * facing, scale);
    if (fighter.recoveryRoll && !reducedMotion) {
      const progress = clamp01(fighter.recoveryRoll.t / fighter.recoveryRoll.duration);
      ctx.translate(0, -22);
      ctx.rotate(Math.PI * 2 * smooth((progress - 0.12) / 0.7));
      ctx.translate(0, 22);
    }
    if ((fighter.invulnerable || 0) > 0) ctx.globalAlpha = reducedMotion ? 0.8 : 0.74 + Math.sin(visualTime * 18) * 0.1;
    this.drawGather(fighter, pose, reducedMotion);
    const { hip, shoulder, head, rearFoot, frontFoot, rearKnee, frontKnee, rearElbow, rearHand, elbow, hand } = pose;
    line(ctx, [hip, rearKnee, rearFoot], '#415451', 7);
    line(ctx, [[rearFoot[0] - 2, rearFoot[1]], [rearFoot[0] + 5, rearFoot[1]]], INK, 6);
    line(ctx, [hip, frontKnee, frontFoot], INK, 7);
    line(ctx, [[frontFoot[0] - 1, frontFoot[1]], [frontFoot[0] + 6, frontFoot[1]]], INK, 6);

    line(ctx, [shoulder, rearElbow, rearHand], '#415451', 6);
    circle(ctx, rearHand[0], rearHand[1], 3, PAPER, INK, 1.4);
    line(ctx, [hip, shoulder], INK, isBoss ? 12 : 9);

    if (fighter.element === 'earth') {
      polygon(ctx, [[shoulder[0] - 8, shoulder[1] - 2], [shoulder[0] + 8, shoulder[1] - 2], [hip[0] + 9, hip[1]], [hip[0] - 9, hip[1]]], bodyColor, INK, 2);
      line(ctx, [[hip[0] - 7, hip[1] - 2], [hip[0] + 7, hip[1] - 2]], '#dfd6a0', 3);
    } else if (fighter.element === 'water') {
      polygon(ctx, [[shoulder[0] - 6, shoulder[1]], [shoulder[0] + 6, shoulder[1]], [hip[0] + 10, hip[1] + 5], [hip[0] - 10, hip[1] + 5]], bodyColor, INK, 2);
      line(ctx, [[shoulder[0] - 5, shoulder[1] + 1], [hip[0] + 6, hip[1] + 1]], '#e6f1e7', 3);
    } else {
      polygon(ctx, [[shoulder[0] - 5, shoulder[1] - 1], [shoulder[0] + 6, shoulder[1]], [hip[0] + 6, hip[1]], [hip[0] - 7, hip[1]]], bodyColor, INK, 2);
      line(ctx, [[shoulder[0] - 4, shoulder[1] + 1], [hip[0] + 4, hip[1] - 2]], '#f4dbab', 3);
    }

    // Headwear and silhouettes distinguish the four premade fighters.
    circle(ctx, head[0], head[1], 9.5, PAPER, INK, 2.6);
    if (fighter.element === 'air') {
      line(ctx, [[head[0] - 9, head[1] - 3], [head[0] + 8, head[1] - 3]], color, 4);
      line(ctx, [[head[0] - 9, head[1] - 3], [head[0] - 16, head[1] - 6 + Math.sin(flutter * 8) * 2]], color, 3);
      line(ctx, [[shoulder[0] - 4, shoulder[1] + 2], [shoulder[0] - 17 - speed * 6, shoulder[1] + Math.sin(flutter * 7) * 3]], color, 4);
    } else if (fighter.element === 'water') {
      ctx.beginPath();
      ctx.arc(head[0], head[1] - 1, 10, Math.PI, Math.PI * 1.95);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.stroke();
      line(ctx, [[head[0] - 7, head[1] + 7], [head[0] + 7, head[1] + 7]], '#d8e6e3', 5);
      line(ctx, [[head[0] - 7, head[1] + 7], [head[0] - 15, head[1] + 14 + Math.sin(flutter * 6) * 2]], color, 5);
    } else if (fighter.element === 'earth') {
      polygon(ctx, [[head[0] - 11, head[1] - 3], [head[0] - 7, head[1] - 12], [head[0] + 7, head[1] - 12], [head[0] + 11, head[1] - 3]], color, INK, 2);
      line(ctx, [[head[0] - 12, head[1] - 3], [head[0] + 11, head[1] - 3]], INK, 2);
    } else {
      polygon(ctx, [[head[0] - 9, head[1] - 1], [head[0] - 10, head[1] - 7], [head[0] - 3, head[1] - 12], [head[0] + 5, head[1] - 10], [head[0] + 9, head[1] - 4]], INK);
      circle(ctx, head[0] - 4, head[1] - 14, 4, INK);
      line(ctx, [[head[0] - 7, head[1] - 10], [head[0] - 1, head[1] - 10]], color, 3);
    }
    if (recoil > 0.3) line(ctx, [[head[0] + 2, head[1] - 1], [head[0] + 5, head[1] + 1]], INK, 1.5);
    else circle(ctx, head[0] + 4, head[1], 1.3, INK);
    line(ctx, [[head[0] + 2, head[1] + 4], [head[0] + 5, head[1] + 4]], '#6b6653', 1);

    if (fighter.weapon) {
      const axis = [Math.cos(pose.weaponAngle), Math.sin(pose.weaponAngle)];
      this.drawHeldWeapon(fighter.weapon, [hand[0] - axis[0] * 23, hand[1] - axis[1] * 23], [hand[0] + axis[0] * 29, hand[1] + axis[1] * 29]);
    }
    line(ctx, [shoulder, elbow, hand], INK, 6);
    line(ctx, [[elbow[0] + 1, elbow[1]], [hand[0] - 2, hand[1]]], bodyColor, 4);
    circle(ctx, hand[0], hand[1], 3.5, PAPER, INK, 1.5);
    if (!fighter.weapon && stroke > 0.3 && (fighter.element === 'air' || fighter.element === 'water')) line(ctx, [[hand[0] + 1, hand[1] - 4], [hand[0] + 1, hand[1] + 4]], PAPER, 3);
    if (fighter.armor) {
      line(ctx, [[shoulder[0] - 10, shoulder[1] + 1], [shoulder[0] - 10, shoulder[1] + 11]], '#d9b65e', 3);
      line(ctx, [[shoulder[0] + 10, shoulder[1] + 1], [shoulder[0] + 10, shoulder[1] + 11]], '#d9b65e', 3);
      circle(ctx, hip[0], hip[1] - 8, 3, '#ecd08b', INK, 1);
    }
    if ((fighter.counterReady || 0) > 0) {
      ctx.save();
      ctx.globalAlpha *= reducedMotion ? 0.8 : 0.7 + Math.sin(visualTime * 9) * 0.2;
      circle(ctx, hand[0], hand[1], 10, null, '#f9df96', 2.5);
      polygon(ctx, [[hand[0] + 12, hand[1] - 6], [hand[0] + 15, hand[1] - 11], [hand[0] + 18, hand[1] - 6], [hand[0] + 15, hand[1] - 1]], '#d6aa4e');
      ctx.restore();
    }
    this.drawAttackTrail(fighter, pose, style, stroke, reducedMotion);
    if (isBoss) {
      polygon(ctx, [[head[0] - 7, head[1] - 14], [head[0] - 10, head[1] - 21], [head[0] - 3, head[1] - 18], [head[0] + 1, head[1] - 24], [head[0] + 5, head[1] - 18], [head[0] + 11, head[1] - 21], [head[0] + 8, head[1] - 14]], '#e8bf68', INK, 1.5);
    }
    ctx.restore();

    if (frozen) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      polygon(ctx, [[fighter.x - 19 * scale, fighter.y + 1], [fighter.x - 22 * scale, fighter.y - h * 0.55], [fighter.x - 12 * scale, fighter.y - h - 6], [fighter.x + 12 * scale, fighter.y - h - 1], [fighter.x + 23 * scale, fighter.y - h * 0.48], [fighter.x + 19 * scale, fighter.y + 1]], '#c5eafb', '#5f9fb5', 2);
      ctx.globalAlpha = 0.8;
      line(ctx, [[fighter.x - 12 * scale, fighter.y - h * 0.5], [fighter.x - 2 * scale, fighter.y - h * 0.78]], '#efffff', 2);
      line(ctx, [[fighter.x + 7 * scale, fighter.y - 8], [fighter.x + 13 * scale, fighter.y - h * 0.4]], '#efffff', 2);
      ctx.restore();
    }

    if (dizzy && !frozen) {
      ctx.save();
      ctx.fillStyle = '#dfab4d';
      for (let i = 0; i < 3; i += 1) {
        const angle = (reducedMotion ? 0 : visualTime * 4) + i * 2.1;
        const x = fighter.x + Math.cos(angle) * 17 * scale;
        const y = fighter.y - h - 7 + Math.sin(angle) * 5;
        polygon(ctx, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], '#d6a047');
      }
      ctx.restore();
      if (!isPlayer && player && !player.weapon && player.grabTarget == null && fighter.grounded &&
          Math.abs(fighter.depth - player.depth) < 28 && Math.abs(fighter.x - player.x) <= 84 &&
          (fighter.x - player.x) * player.facing > 0) {
        ctx.save();
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#775723';
        ctx.fillText('E · GRAB', fighter.x, fighter.y - h - 21);
        ctx.restore();
      }
    }
    this.drawFighterHealth(fighter, fighter.recoveryRoll ? h * 0.62 : h);
  }

  drawRecoveryTrail(fighter, reducedMotion) {
    if (reducedMotion) return;
    const ctx = this.ctx;
    const roll = fighter.recoveryRoll;
    const progress = clamp01(roll.t / roll.duration);
    const direction = roll.direction || 0;
    const depthDirection = roll.depthDirection || 0;
    ctx.save();
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.4;
    for (let i = 0; i < 3; i += 1) {
      const offset = 15 + i * 12;
      const x = fighter.x - direction * offset;
      const y = fighter.depth - depthDirection * offset * 0.45 + 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 8 - i, 2 + i, 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = i === 0 ? elementColor(fighter.element) : '#c2b48a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGather(fighter, pose, reducedMotion) {
    const action = fighter.action;
    if (!action || !['special', 'burst'].includes(action.kind) || action.t >= action.windup) return;
    const ctx = this.ctx;
    const color = elementColor(fighter.element);
    const charge = clamp01(action.t / action.windup);
    const radius = 9 + charge * (action.kind === 'burst' ? 16 : 8);
    const [x, y] = pose.hand;
    ctx.save();
    ctx.globalAlpha *= 0.3 + charge * 0.3;
    circle(ctx, x, y, radius, color);
    ctx.globalAlpha *= 1.5;
    elementGlyph(ctx, fighter.element, x, y, radius * 0.7, '#fff8e8', 2);
    if (!reducedMotion) {
      const turn = charge * Math.PI;
      for (let i = 0; i < 3; i += 1) {
        const angle = turn + i * Math.PI * 2 / 3;
        const distance = radius + (1 - charge) * 18;
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;
        if (fighter.element === 'earth') polygon(ctx, [[px - 3, py + 2], [px - 2, py - 4], [px + 4, py - 1], [px + 2, py + 3]], '#aa9565', INK, 1);
        else line(ctx, [[px, py], [x + Math.cos(angle - 0.3) * (distance + 9), y + Math.sin(angle - 0.3) * (distance + 9)]], color, 3);
      }
    }
    ctx.restore();
  }

  drawLaunchTrail(fighter, time, reducedMotion) {
    if (reducedMotion || fighter.z < 8 || (!fighter.hitReact && !fighter.knockdown && !fighter.juggle) || fighter.frozen > 0) return;
    const ctx = this.ctx;
    const direction = Math.sign(fighter.vx || fighter.hitDirection || 1);
    const length = Math.min(68, 18 + Math.abs(fighter.vx || 0) * 0.07);
    const lift = Math.max(-18, Math.min(18, (fighter.vz || -(fighter.vy || 0)) * 0.025));
    const scale = (fighter.h || 66) / 66;
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 3; i += 1) {
      const x = fighter.x - direction * 12 * scale;
      const y = fighter.y - (17 + i * 15) * scale;
      line(ctx, [[x - direction * (length + i * 6), y + lift], [x - direction * 10, y]], i === 1 ? '#fffaf0' : elementColor(fighter.element), i === 1 ? 4 : 2);
    }
    ctx.restore();
  }

  drawAttackTrail(fighter, pose, style, stroke, reducedMotion) {
    if (!style || stroke < 0.035) return;
    const ctx = this.ctx;
    const color = elementColor(fighter.element);
    const contact = pose[style.contact || 'hand'];
    const [x, y] = contact;
    const cast = style.trail === 'cast';
    ctx.save();
    ctx.globalAlpha *= stroke * (reducedMotion ? 0.6 : fighter.action?.kind === 'grabPunch' ? 0.65 : 0.9);
    if (style.trail === 'throw') {
      if (!reducedMotion) line(ctx, [[x - 24, y + 3], [x - 5, y]], '#fff8e8', 4);
    } else if (reducedMotion) {
      // Preserve the element and contact cue, without streaming ribbons or orbiting debris.
      if (cast) elementGlyph(ctx, fighter.element, x + 10, y, 11, color, 2);
      else line(ctx, [[x + 4, y - 8], [x + 8, y], [x + 4, y + 7]], color, 4);
    } else if (style.trail === 'weapon') {
      ctx.beginPath();
      ctx.arc(16, -41, 49, -1.15, 0.55);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#fff8e8';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (fighter.element === 'air') {
      // Broad, open crescents follow the palm or rising foot.
      ctx.beginPath();
      if (style.trail === 'rise') ctx.arc(1, -29, 43, 0.55, -1.2, true);
      else {
        ctx.moveTo(x - 40, y + 16);
        ctx.bezierCurveTo(x + 20, y + 20, x + 21, y - 23, x - 31, y - 17);
      }
      ctx.strokeStyle = '#c8eee2';
      ctx.lineWidth = cast ? 12 : 9;
      ctx.stroke();
      ctx.strokeStyle = '#fffdf0';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - 7, y - 1, cast ? 26 : 21, -1.05, 1.1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      line(ctx, [[x - 49, y - 5], [x - 23, y - 5]], color, 2);
      line(ctx, [[x - 42, y + 8], [x - 19, y + 8]], '#fffdf0', 3);
      if (cast) {
        ctx.beginPath();
        ctx.arc(3, -30, 43, 2.35, 4.65);
        ctx.strokeStyle = '#fffdf0';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    } else if (fighter.element === 'water') {
      // A continuous ribbon bends around the fighter, then snaps toward the hand.
      ctx.beginPath();
      if (style.trail === 'pull') {
        ctx.moveTo(45, -19);
        ctx.bezierCurveTo(66, -45, 24, -65, x + 2, y);
      } else {
        ctx.moveTo(-23, -15);
        ctx.bezierCurveTo(-43, -56, 23, -70, x + 3, y + 4);
      }
      ctx.strokeStyle = '#3586b5';
      ctx.lineWidth = cast ? 11 : 8;
      ctx.stroke();
      ctx.strokeStyle = '#b8e7ee';
      ctx.lineWidth = cast ? 6 : 4;
      ctx.stroke();
      ctx.strokeStyle = '#f0fcf5';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (style.trail === 'freeze') {
        for (let i = 0; i < 3; i += 1) {
          const px = x + 5 + i * 5;
          const py = y + (i - 1) * 11;
          polygon(ctx, [[px - 4, py], [px + 3, py - 8], [px + 10, py], [px + 3, py + 5]], '#d8f1fa', color, 1.5);
        }
      } else {
        for (let i = 0; i < 3; i += 1) {
          const px = x + 8 + i * 5;
          const py = y - 14 + i * 12;
          circle(ctx, px, py, 3 - i * 0.4, '#c9eff3', color, 1);
        }
      }
    } else if (fighter.element === 'earth') {
      if (style.trail === 'slam') {
        ctx.beginPath();
        ctx.ellipse(x, 0, 38, 11, 0, Math.PI, Math.PI * 2);
        ctx.strokeStyle = '#c4b176';
        ctx.lineWidth = 7;
        ctx.stroke();
        line(ctx, [[x - 37, 1], [x - 18, 6], [x - 4, 2], [x + 13, 7], [x + 39, 2]], '#8b794e', 2);
        for (let i = 0; i < 5; i += 1) {
          const px = x - 33 + i * 16;
          const height = 11 + (i % 3) * 6;
          polygon(ctx, [[px - 6, -2], [px - 4, -height], [px + 2, -height - 3], [px + 7, -8], [px + 6, -1]], '#b59f65', '#7b7951', 1.5);
        }
      } else {
        polygon(ctx, [[x - 13, y - 10], [x + 6, y - 11], [x + 14, y - 2], [x + 9, y + 9], [x - 13, y + 7], [x - 20, y - 1]], '#b9a475', '#77794d', 1.5);
        line(ctx, [[x - 9, y - 6], [x + 4, y - 6], [x + 8, y - 1]], '#f2dfac', 3);
        line(ctx, [[x - 11, y + 1], [x - 1, y + 2], [x + 3, y + 7]], '#8b794e', 1.5);
        for (let i = 0; i < 3; i += 1) {
          const px = x - 25 - i * 9;
          const py = y + (i % 2 ? -10 : 10);
          polygon(ctx, [[px - 3, py], [px, py - 4], [px + 5, py - 1], [px + 2, py + 4]], '#b9a475', '#8b794e', 1);
        }
      }
      if (cast) line(ctx, [[-27, 0], [-15, -3], [-2, 1], [11, -2], [29, 0]], '#9b8a59', 3);
    } else {
      // Sharp flame tongues trail the limb, with a small bright contact core.
      ctx.beginPath();
      ctx.moveTo(x + 14, y);
      ctx.bezierCurveTo(x + 6, y - 17, x - 24, y - 10, x - 46, y - 22);
      ctx.lineTo(x - 30, y - 5);
      ctx.lineTo(x - 53, y + 2);
      ctx.lineTo(x - 27, y + 8);
      ctx.lineTo(x - 39, y + 19);
      ctx.bezierCurveTo(x - 15, y + 10, x + 6, y + 16, x + 14, y);
      ctx.fillStyle = '#d95d36';
      ctx.fill();
      polygon(ctx, [[x + 10, y], [x - 10, y - 9], [x - 27, y - 8], [x - 17, y - 1], [x - 36, y + 5], [x - 7, y + 7]], '#f3a34f');
      polygon(ctx, [[x + 7, y], [x - 4, y - 4], [x - 19, y + 1], [x - 4, y + 4]], '#fff3ba');
      if (style.trail === 'kick') {
        ctx.beginPath();
        ctx.arc(7, -30, 38, 1.1, -0.65, true);
        ctx.strokeStyle = '#ed9b47';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      for (let i = 0; i < 3; i += 1) {
        const px = x - 33 - i * 10;
        const py = y + (i % 2 ? 19 : -17);
        line(ctx, [[px, py], [px - 5, py + (i % 2 ? 3 : -3)]], '#d96c3f', 2);
      }
    }
    ctx.restore();
  }

  drawFighterHealth(fighter, h) {
    const ctx = this.ctx;
    const isBoss = fighter.type === 'boss';
    if (fighter.team !== 'player' && fighter.maxHp > 0 && (fighter.hp < fighter.maxHp || isBoss)) {
      const width = isBoss ? 72 : 36;
      const barY = fighter.y - h - (isBoss ? 33 : 15);
      ctx.fillStyle = '#263b3c';
      ctx.fillRect(fighter.x - width / 2, barY, width, 5);
      ctx.fillStyle = elementColor(fighter.element);
      ctx.fillRect(fighter.x - width / 2 + 1, barY + 1, (width - 2) * Math.max(0, fighter.hp / fighter.maxHp), 3);
    }
  }

  drawProjectile(projectile, time, reducedMotion = false) {
    const ctx = this.ctx;
    const r = projectile.r || 9;
    const color = elementColor(projectile.element);
    const angle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);
    if (projectile.kind === 'weapon') {
      ctx.rotate(reducedMotion ? 0 : time * (projectile.weapon === 'spear' ? 0 : 9));
      this.drawHeldWeapon(projectile.weapon || 'staff', [-23, 0], [23, 0]);
      ctx.restore();
      return;
    }
    ctx.globalAlpha = 0.16;
    circle(ctx, 0, 0, r * 2.2, color);
    ctx.globalAlpha = 1;
    if (projectile.element === 'earth') {
      if (!reducedMotion) {
        for (let i = 0; i < 3; i += 1) {
          const x = -r * (1.8 + i * 0.7);
          const y = (i % 2 ? -1 : 1) * r * 0.5;
          polygon(ctx, [[x - 3, y], [x, y - 4], [x + 3, y], [x, y + 3]], '#b7aa78');
        }
        ctx.rotate(time * 5);
      }
      polygon(ctx, [[-r, -r * 0.6], [-r * 0.2, -r], [r * 0.85, -r * 0.7], [r, r * 0.2], [r * 0.3, r], [-r * 0.8, r * 0.8]], '#aab27a', INK, 2);
      line(ctx, [[-r * 0.5, -r * 0.4], [r * 0.2, -r * 0.55], [r * 0.5, 0]], '#e5dfb7', 2);
    } else if (projectile.element === 'fire') {
      polygon(ctx, [[r, 0], [-r * 0.6, -r], [-r * 2.6, -r * 0.5], [-r * 1.8, 0], [-r * 3, r * 0.5], [-r * 0.6, r]], color);
      circle(ctx, 0, 0, r * 0.83, '#edaa5a', '#b95138', 1.5);
      circle(ctx, r * 0.2, 0, r * 0.48, '#fff1b9');
    } else if (projectile.element === 'water') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-r * 2.6, 0);
      ctx.bezierCurveTo(-r, -r, r, -r * 1.6, r, 0);
      ctx.bezierCurveTo(r, r * 1.6, -r, r, -r * 2.6, 0);
      ctx.fill();
      line(ctx, [[-r * 0.6, -r * 0.35], [r * 0.3, -r * 0.45]], '#e8f7f0', 2);
      circle(ctx, -r * 3.3, 0, 2, color);
      if (!reducedMotion) {
        ctx.beginPath();
        ctx.moveTo(-r * 4.2, r * 0.3);
        ctx.bezierCurveTo(-r * 3, -r * 0.9, -r * 2.5, r * 0.8, -r * 1.4, 0);
        ctx.strokeStyle = '#90cbdc';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-i * 6, 0, r * (0.8 + i * 0.23), -1.05, 1.05);
        ctx.stroke();
      }
      line(ctx, [[-r * 2.6, -r * 0.35], [-r * 1.2, -r * 0.35]], '#faffef', 2);
      line(ctx, [[-r * 3, r * 0.4], [-r * 1.6, r * 0.4]], color, 2);
    }
    ctx.restore();
  }

  drawParticle(particle, reducedMotion = false) {
    if (['ring', 'shockwave', 'impact', 'slash'].includes(particle.kind)) {
      this.drawEffect(particle, reducedMotion);
      return;
    }
    const ctx = this.ctx;
    const alpha = Math.min(1, Math.max(0, particle.life / (particle.maxLife || 0.6)));
    const size = particle.size || 3;
    ctx.save();
    ctx.globalAlpha = alpha;
    circle(ctx, particle.x, particle.y, size * (0.5 + alpha * 0.5), particle.color || PAPER);
    ctx.restore();
  }

  drawEffect(effect, reducedMotion = false) {
    const ctx = this.ctx;
    const remaining = Math.min(1, Math.max(0, effect.life / (effect.maxLife || 0.6)));
    if (effect.kind === 'signature') {
      this.drawSignature(effect, remaining, reducedMotion);
      return;
    }
    if (effect.kind === 'impact' || effect.kind === 'slash') {
      const radius = (effect.r || effect.radius || 19) * (effect.heavy ? 1.3 : 1);
      const size = radius * (reducedMotion ? 0.7 : 0.6 + (1 - remaining) * 0.8);
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.scale(effect.direction < 0 ? -1 : 1, 1);
      ctx.globalAlpha = remaining * (reducedMotion ? 0.7 : 0.95);
      if (effect.kind === 'impact' && effect.element && effect.impactKind === 'hit' && !reducedMotion) {
        this.drawElementImpact(effect.element, size, remaining, effect.heavy);
      }
      if (effect.kind === 'slash') {
        ctx.beginPath();
        ctx.arc(-size * 0.6, 0, size, -1, 1);
        ctx.strokeStyle = effect.color || '#edba5a';
        ctx.lineWidth = effect.heavy ? 6 : 3;
        ctx.stroke();
      } else {
        const rays = [];
        for (let i = 0; i < 16; i += 1) {
          const angle = i * Math.PI / 8;
          const distance = size * (i % 2 ? 0.23 : 0.75 + (i % 4 === 0 ? 0.35 : 0));
          rays.push([Math.cos(angle) * distance * 1.2, Math.sin(angle) * distance]);
        }
        polygon(ctx, rays, effect.color || '#d99c4f');
        if (!reducedMotion) {
          circle(ctx, 0, 0, size * 0.28 * remaining, '#fffdf0');
          for (let i = 0; i < 3; i += 1) {
            const angle = (i - 1) * 0.65;
            const start = size * 0.9;
            const end = size * (1.35 + (1 - remaining) * 0.5);
            line(ctx, [[Math.cos(angle) * start, Math.sin(angle) * start], [Math.cos(angle) * end, Math.sin(angle) * end]], effect.color || '#d99c4f', effect.heavy ? 3 : 2);
          }
        }
      }
      ctx.restore();
      return;
    }
    const radius = effect.r || effect.radius || 80;
    const expansion = radius * (0.25 + (1 - remaining) * 0.75);
    ctx.save();
    ctx.globalAlpha = remaining * 0.13;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion, effect.kind === 'shockwave' ? expansion * 0.42 : expansion, 0, 0, Math.PI * 2);
    ctx.fillStyle = effect.color || COLORS.air;
    ctx.fill();
    ctx.globalAlpha = remaining * 0.85;
    ctx.strokeStyle = effect.color || COLORS.air;
    ctx.lineWidth = remaining * 5 + 1;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion, effect.kind === 'shockwave' ? expansion * 0.42 : expansion, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = remaining * 0.5;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion * 0.8, expansion * (effect.kind === 'shockwave' ? 0.33 : 0.8), 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#fffbea';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawSignature(effect, remaining, reducedMotion) {
    const ctx = this.ctx;
    const element = effect.element;
    const color = elementColor(element);
    const radius = effect.r || 235;
    const age = 1 - remaining;
    const reach = radius * (reducedMotion ? 0.9 : 0.25 + smooth(age) * 0.75);
    const groundY = effect.groundY ?? effect.y + 30;
    ctx.save();
    ctx.translate(effect.x, groundY);
    ctx.globalAlpha = remaining * 0.8;
    if (reducedMotion) {
      ctx.beginPath();
      ctx.ellipse(0, 0, reach, reach * 0.42, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      elementGlyph(ctx, element, 0, -90, 21, color, 2);
    } else if (element === 'air') {
      // Open, rising rings make the cyclone legible without filling its center.
      for (let i = 0; i < 4; i += 1) {
        const width = reach * (0.56 + i * 0.13);
        const turn = age * 3.3 + i * 0.8;
        ctx.beginPath();
        ctx.ellipse(0, -8 - i * 25, width, 16 + width * 0.2, -0.07, turn, turn + Math.PI * 1.65);
        ctx.strokeStyle = i % 2 ? '#fffdf0' : '#88c5b4';
        ctx.lineWidth = 8 - i;
        ctx.stroke();
        ctx.strokeStyle = i % 2 ? '#7db8a8' : '#f8fff0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      for (const direction of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(direction * reach * 0.55, 12);
        ctx.bezierCurveTo(direction * reach, -24, direction * reach * 0.22, -52, direction * reach * 0.87, -96);
        ctx.strokeStyle = '#e7f9e9';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    } else if (element === 'water') {
      ctx.beginPath();
      ctx.ellipse(0, 1, reach, reach * 0.35, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#8bc9df';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#effff6';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const direction of [-1, 1]) {
        ctx.save();
        ctx.scale(direction, 1);
        ctx.beginPath();
        ctx.moveTo(reach * 0.15, 12);
        ctx.bezierCurveTo(reach * 0.44, 20, reach * 0.55, -50, reach * 0.87, -56);
        ctx.bezierCurveTo(reach * 1.08, -64, reach * 1.01, -23, reach * 0.84, -29);
        ctx.bezierCurveTo(reach * 0.76, -33, reach * 0.84, -43, reach * 0.9, -39);
        ctx.strokeStyle = '#398bb8';
        ctx.lineWidth = 13;
        ctx.stroke();
        ctx.strokeStyle = '#9addeb';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = '#f0fff8';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < 3; i += 1) circle(ctx, reach * (0.7 + i * 0.11), -67 - i % 2 * 10, 3 + i, '#d7f6ee', '#62aecb', 1);
        ctx.restore();
      }
    } else if (element === 'earth') {
      ctx.beginPath();
      ctx.ellipse(0, 0, reach, reach * 0.38, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#b4a06a';
      ctx.lineWidth = 6;
      ctx.stroke();
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4;
        const x = Math.cos(angle) * reach * 0.86;
        const y = Math.sin(angle) * reach * 0.34;
        const height = (36 + i % 3 * 17) * Math.min(1, age * 7 + 0.3);
        const width = 11 + i % 2 * 4;
        line(ctx, [[x * 0.62, y * 0.6 + 4], [x * 0.8 + 7, y * 0.75], [x, y]], '#8e8053', 2);
        polygon(ctx, [[x - width, y], [x - width * 0.7, y - height * 0.8], [x - 1, y - height], [x + width, y - height * 0.68], [x + width + 3, y]], '#b6a170', '#7c794f', 2);
        polygon(ctx, [[x - 1, y - height], [x + width, y - height * 0.68], [x + width + 3, y], [x + 1, y]], '#9b8a5e');
        line(ctx, [[x - width * 0.6, y - height * 0.75], [x - 1, y - height * 0.9]], '#e8d7a5', 3);
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(0, -2, reach, reach * 0.42, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#ed9a48';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = '#ffedb0';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let i = 0; i < 10; i += 1) {
        const angle = i * Math.PI / 5;
        const x = Math.cos(angle) * reach * 0.94;
        const y = Math.sin(angle) * reach * 0.4;
        const height = 27 + i % 3 * 9;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(-10, 5);
        ctx.bezierCurveTo(-22, -12, -3, -height * 0.6, 2, -height);
        ctx.bezierCurveTo(15, -height * 0.7, 4, -12, 16, -16);
        ctx.bezierCurveTo(17, 3, 5, 11, -10, 5);
        ctx.fillStyle = '#db653a';
        ctx.fill();
        polygon(ctx, [[-6, 3], [-4, -11], [3, -height * 0.6], [7, -9], [9, 2], [1, 6]], '#f4ad54');
        line(ctx, [[0, 2], [2, -11]], '#fff0b7', 3);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawElementImpact(element, size, remaining, heavy) {
    const ctx = this.ctx;
    const color = elementColor(element);
    const age = 1 - remaining;
    ctx.save();
    ctx.globalAlpha *= 0.85;
    if (element === 'air') {
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        ctx.ellipse(size * 0.15, 0, size * (0.8 + i * 0.25), size * (1 + i * 0.4), -0.3, -1.3, 1.3);
        ctx.strokeStyle = i ? color : '#f8fff2';
        ctx.lineWidth = i ? 2 : heavy ? 5 : 3;
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < (heavy ? 5 : 4); i += 1) {
        const angle = (i - (heavy ? 2 : 1.5)) * 0.72;
        const distance = size * (0.85 + age * 0.7);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + (element === 'earth' ? age * 2 : 0));
        if (element === 'water') {
          const r = (heavy ? 6 : 4) * remaining + 2;
          ctx.beginPath();
          ctx.moveTo(-r * 2, 0);
          ctx.bezierCurveTo(r, -r * 1.5, r * 2, r * 1.5, -r * 2, 0);
          ctx.fillStyle = '#87c8df';
          ctx.fill();
          line(ctx, [[-r * 0.3, -r * 0.2], [r * 0.4, -r * 0.2]], '#f0fcf5', 2);
        } else if (element === 'earth') {
          const r = heavy ? 7 : 5;
          polygon(ctx, [[-r, -r * 0.6], [r * 0.2, -r], [r, 0], [r * 0.4, r * 0.8], [-r * 0.8, r * 0.5]], '#b5a371', '#817e51', 1.2);
          line(ctx, [[-r * 0.4, -r * 0.4], [r * 0.2, -r * 0.6]], '#e9d8a1', 2);
        } else {
          const r = heavy ? 9 : 6;
          polygon(ctx, [[r * 1.6, 0], [-r * 0.9, -r * 0.6], [-r * 0.3, 0], [-r, r * 0.5]], '#e2743d');
          line(ctx, [[-r * 0.2, 0], [r * 0.8, 0]], '#ffdfa0', 2);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawFloater(floater) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, floater.life * 2));
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff9e8';
    ctx.strokeText(floater.text, floater.x, floater.y);
    ctx.fillStyle = floater.color || INK;
    ctx.fillText(floater.text, floater.x, floater.y);
    ctx.restore();
  }

  drawCorpse(corpse) {
    const ctx = this.ctx;
    const color = elementColor(corpse.element);
    const scale = (corpse.h || 66) / 66;
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, Math.max(0, corpse.life));
    ctx.translate(corpse.x, corpse.y);
    ctx.rotate(corpse.rotation || 0);
    ctx.scale(scale, scale);
    line(ctx, [[0, -12], [-11, -1], [-16, 8]], INK, 6);
    line(ctx, [[0, -12], [10, 1], [17, 4]], INK, 6);
    line(ctx, [[0, -32], [-15, -28], [-20, -36]], INK, 5);
    line(ctx, [[0, -32], [14, -24], [22, -29]], INK, 5);
    line(ctx, [[0, -12], [0, -32]], INK, 9);
    line(ctx, [[0, -15], [0, -30]], color, 6);
    circle(ctx, 0, -43, 9, PAPER, INK, 2.5);
    line(ctx, [[-8, -46], [7, -46]], color, 3);
    line(ctx, [[2, -43], [5, -40]], INK, 1);
    line(ctx, [[5, -43], [2, -40]], INK, 1);
    ctx.restore();
  }

  drawEdgeDetails(state, key) {
    const ctx = this.ctx;
    const arena = typeof state.arena === 'object' ? state.arena : ARENAS[key];
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = INK;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText((arena?.name || 'Elemental sanctuary').toUpperCase(), 23, HEIGHT - 20);
    ctx.textAlign = 'right';
    ctx.fillText('FIND YOUR OPENING', WIDTH - 23, HEIGHT - 20);
    ctx.globalAlpha = 0.28;
    line(ctx, [[23, HEIGHT - 33], [67, HEIGHT - 33]], INK, 1);
    line(ctx, [[WIDTH - 67, HEIGHT - 33], [WIDTH - 23, HEIGHT - 33]], INK, 1);
    ctx.restore();
  }

  drawBanner(text, remaining) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, remaining * 2);
    ctx.font = '800 27px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const width = Math.min(620, ctx.measureText(text).width + 76);
    const x = (WIDTH - width) / 2;
    polygon(ctx, [[x - 8, 70], [x + width + 8, 70], [x + width, 117], [x, 117]], '#fbf5e9ed', '#263b3c', 1.5);
    ctx.fillStyle = INK;
    ctx.fillText(text, WIDTH / 2, 102);
    ctx.restore();
  }
}
