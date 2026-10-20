import { ARENAS, ELEMENTS, ITEM_EFFECTS, pickupIndex, ARCHETYPE_RULES, CAPTIVE, headIconLift } from './data.js';
import { drawFighterBody, clothDrive, KO_POSE, KO_BOX, INK, PAPER, FLASH } from './fighter-art.js';
import { VFX, fxProjectileTrail, fxSlash, fxDustLand, fxGuardSpark, fxParryFlash, fxHitLight, fxHitHeavy } from './vfx-art.js';
import { WEAPON_ART, drawWeaponPickupArt, drawHeldWeaponArt, drawWornArmorArt, drawThrownWeaponArt, drawWeaponShardArt,
  drawWeaponBreakPuff, drawLanternBurst } from './weapon-art.js';
import { CONSUMABLES, CP_STILL, CP_DISSOLVE, CP_FLING_LIFE, CP_SPARKLE_TIME, drawConsumable, drawConsumableItem, consumePose,
  drawConsumeHeld, consumeStow, consumeFling, drawFlung, drawConsumeSparkle, consumableFade, drawDespawnPuff, drawIncenseAura,
  drawConsumableBuff } from './pickup-art.js';
import { grabCandidate, rescueCandidate, canBeGrabbed } from './grapples.js';
import { ARCHETYPES, ARCHETYPE_POSES, ARCHETYPE_KO_BOX, ENEMY_PROJECTILES, ENEMY_GROUND_EFFECTS, ENEMY_POST_EFFECTS, IRON_BELL_CROWN,
  drawArchetypeBody, drawArchetypeTrail, drawEnemyProjectile, drawEnemyProjectileShadow, drawEnemyEffect, drawRescuePrompt,
  ironBellSize, drawIronBell } from './enemy-art.js';
import { ARENA_PACK_PALETTES, AP_CARD_TOP, drawArenaPackBackground, drawArenaPackScenery, drawArenaPackAmbient,
  drawArenaPackTitleCard } from './arena-art.js';

const WIDTH = 1280;
const HEIGHT = 720;
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

function isArenaKey(key) {
  return typeof key === 'string' && (Object.hasOwn(PALETTES, key) || Object.hasOwn(ARENA_PACK_PALETTES, key));
}

function elementColor(element) {
  return ELEMENTS[element]?.color || COLORS[element] || COLORS.air;
}
// An archetype's accent (src/enemy-art.js ARCHETYPES) stands in for the element colour at every
// element-coloured fighter site: the guard bubble, player marker, gather, recovery and launch trails.
function fighterColor(fighter) {
  return fighter?.archetype ? ARCHETYPES[fighter.archetype]?.accent || COLORS.air : elementColor(fighter?.element);
}

function groundDepth(entity) {
  return Number.isFinite(entity.depth) ? entity.depth : (entity.y || 0) + (entity.z || 0);
}

// Legacy effect kinds drawn after the depth-sorted objects (the rest go in the ground pass).
// kind 'vfx' effects route by VFX[fx].layer instead (see Renderer.draw).
// The archetype post effects (src/enemy-art.js: tether, Iron Bell, shield clang, smoke, freed
// burst) draw with them, over the bodies, so the smoke covers the bandit; the heal sigil and stuck
// arrows (ENEMY_GROUND_EFFECTS) draw in the ground pass, under the feet.
const POST_EFFECT_KINDS = new Set(['impact', 'slash', 'consume', ...ENEMY_POST_EFFECTS]);
// Consumables (src/pickup-art.js). A planted censer field takes its team's colour; the censer
// prop fades over CENSER_FADE seconds once its field is nearly out, its sticks burnt down (no
// smoke) for the last CENSER_EMBERS. At most MAX_FLUNG flung vessels or knocked items at once.
const AURA_COLORS = { player: '#56905d', enemy: '#c5573f' };
const CENSER_FADE = .8;
// Where the short one-hand carries ride during a use (Renderer.stowAxis): in the sash, pose
// units behind (back; negative is in front) and above (up) the hip, the axis tipped tip rad
// below straight back. The knife pair is tucked in at the back, blades out behind; a throwing
// stone rides at the front like a pouch (upright art keeps it level whatever the axis), where
// neither the back arm nor the legs cover it.
const SASH_STOW = { knives: { back: 7, up: 4, tip: 0.3 }, stone: { back: -12, up: 2, tip: 0 } };
const CENSER_EMBERS = 1.2;
const MAX_FLUNG = 16;
// The pickup the player's E would take now (Game.consumeBuffer: a grab first, then Game.pickup's
// grounded test and its nearest-in-reach choice, pickupIndex), if any: none mid-air, while stunned, knocked down,
// frozen, held or holding, during a use, or with a dizzy opponent E would grab instead.
// A bound villager E would start freeing (rescue) takes E before any item.
function pickupTarget(player, weapons, enemies, rescue = null) {
  if (!player || player.dead || !(player.hp > 0) || player.consume || !player.grounded ||
      player.stun > 0 || player.knockdown > 0 || player.frozen > 0 || player.grabTarget != null || player.grabbedBy != null) return null;
  if (rescue || player.rescue || grabCandidate(player, enemies)) return null;
  const index = pickupIndex(weapons, player.x, player.depth);
  return index < 0 ? null : weapons[index];
}
const EFFECT_PARTICLE_KINDS = new Set(['ring', 'shockwave', 'impact', 'slash', 'vfx']);
// Weapon debris and bursts spawned as particles by the engine (drawn with src/weapon-art.js).
const WEAPON_PARTICLE_KINDS = new Set(['shard', 'breakPuff', 'lanternBurst']);
// Boss waves whose release is drawn by a vfx (ice columns, eruptions) instead of the hazard art.
const VFX_HAZARD_MOVES = new Set(['ice-lance', 'triple-eruption']);
// Top-layer vfx anchors drawn in depth order with the objects (the rest draw over them).
const DEPTH_SORTED_ANCHORS = new Set(['ground', 'any']);
// One reused params object for every fx draw call (no per-frame allocation).
const VFX_KEYS = ['dir', 'element', 'scale', 'heavy', 'seed', 'color', 'variant', 'floor', 'radius', 'life', 'reverse', 'vx', 'vy', 'r', 'len', 'turn'];
const VFX_P = { layer: undefined, reduced: false };
const NO_PARAMS = {};
function vfxParams(src, defaults, layer, reduced) {
  for (const key of VFX_KEYS) VFX_P[key] = src[key] !== undefined ? src[key] : defaults[key];
  VFX_P.layer = layer;
  VFX_P.reduced = reduced;
  return VFX_P;
}
const TRAIL_P = { vx: 1, vy: 0, element: 'air', r: 9, turn: 0, reduced: false };
// The trail keeps its approved size (r 9, an earth boulder 10) whatever the ball's body radius,
// so its curls, drips, grit and licks stay legible; it starts that far inside the body's rim.
const TRAIL_R = { earth: 10 };
const TRAIL_R_DEFAULT = 9;

function hazardPath(ctx, hazard) {
  ctx.beginPath();
  if (hazard.shape === 'lane') ctx.rect(-hazard.rx, -hazard.rd, hazard.rx * 2, hazard.rd * 2);
  else ctx.ellipse(0, 0, hazard.rx, hazard.rd, 0, 0, Math.PI * 2);
}

const POSE_JOINTS = ['hip', 'shoulder', 'head', 'rearKnee', 'rearFoot', 'frontKnee', 'frontFoot', 'rearElbow', 'rearHand', 'elbow', 'hand'];
const POSE_BOX = [0, 0, 0, 0];
// Pose-unit box around a drawn body: its joints plus room for cloth, headgear, fists and a
// held weapon (a spear tip reaches ~45 units past the fist).
function poseBox(pose, pad = 50) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const key of POSE_JOINTS) {
    const p = pose[key];
    if (!p) continue;
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  POSE_BOX[0] = x0 - pad; POSE_BOX[1] = y0 - pad; POSE_BOX[2] = x1 + pad; POSE_BOX[3] = y1 + pad;
  return POSE_BOX;
}
// A knocked-down fighter keeps what it carries: the held weapon lies along the body from the
// front fist (KO_POSE.hand, the fist 23/52 along the axis), so it rests on the floor beside it.
const KO_WEAPON_ANGLE = -Math.PI / 2 - 0.12;
const KO_WEAPON = [[KO_POSE.hand[0] - Math.cos(KO_WEAPON_ANGLE) * 23, KO_POSE.hand[1] - Math.sin(KO_WEAPON_ANGLE) * 23],
  [KO_POSE.hand[0] + Math.cos(KO_WEAPON_ANGLE) * 29, KO_POSE.hand[1] + Math.sin(KO_WEAPON_ANGLE) * 29]];
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

// Authored silhouettes inspired by circular, yielding, rooted and driving martial movement.
// Every aerial move names its contact limb so its elemental trail follows the strike.
const MARTIAL_POSES = {
  airLift: { trail: 'rise', wind: { lean: -9, drop: 8, elbow: [-10, -23], hand: [-5, -17], rearHand: [15, -43], frontFoot: [20, -1], rearFoot: [-21, -1] },
    strike: { lean: 6, drop: -3, elbow: [19, -48], hand: [27, -70], rearElbow: [-13, -35], rearHand: [-20, -27], frontKnee: [15, -18], frontFoot: [20, -1], rearFoot: [-20, -1] } },
  airPalm: { trail: 'palm', wind: { lean: -11, elbow: [-12, -40], hand: [-15, -48], rearElbow: [10, -38], rearHand: [21, -51], frontKnee: [13, -30], frontFoot: [5, -21], rearKnee: [-13, -26], rearFoot: [-21, -13] },
    strike: { lean: 10, drop: -3, elbow: [28, -43], hand: [45, -42], rearElbow: [-9, -38], rearHand: [-22, -30], frontKnee: [12, -23], frontFoot: [24, -12], rearKnee: [-16, -26], rearFoot: [-26, -16] } },
  airHeel: { trail: 'wheel', contact: 'frontFoot', wind: { lean: -8, elbow: [12, -43], hand: [20, -52], rearHand: [-22, -42], frontKnee: [-1, -33], frontFoot: [-20, -27], rearKnee: [-12, -22], rearFoot: [-23, -10] },
    strike: { lean: -12, drop: -2, elbow: [5, -39], hand: [15, -51], rearElbow: [-24, -34], rearHand: [-35, -29], frontKnee: [19, -42], frontFoot: [47, -49], rearKnee: [-11, -23], rearFoot: [-20, -9] } },
  airDiveHeel: { trail: 'dive', contact: 'frontFoot', wind: { lean: -10, frontKnee: [13, -45], frontFoot: [26, -70], rearKnee: [-11, -22], rearFoot: [-21, -9], hand: [16, -49], rearHand: [-24, -30] },
    strike: { lean: 12, drop: 4, elbow: [19, -35], hand: [28, -46], rearElbow: [-12, -29], rearHand: [-23, -22], frontKnee: [25, -15], frontFoot: [37, 7], rearKnee: [-12, -22], rearFoot: [-25, -15] } },
  waterLift: { trail: 'redirect', wind: { lean: -9, drop: 7, elbow: [19, -24], hand: [33, -16], rearElbow: [-16, -32], rearHand: [-5, -45], frontKnee: [17, -12], frontFoot: [25, -1], rearFoot: [-24, -1] },
    strike: { lean: -3, drop: -2, elbow: [20, -47], hand: [33, -65], rearElbow: [3, -31], rearHand: [20, -36], frontKnee: [16, -14], frontFoot: [24, -1], rearFoot: [-23, -1] } },
  waterPalm: { trail: 'sweep', wind: { lean: -9, drop: 3, elbow: [-14, -29], hand: [-8, -43], rearElbow: [17, -36], rearHand: [27, -48], frontKnee: [14, -29], frontFoot: [9, -18], rearKnee: [-13, -25], rearFoot: [-23, -12] },
    strike: { lean: 3, drop: 1, elbow: [24, -34], hand: [43, -37], rearElbow: [9, -28], rearHand: [24, -25], frontKnee: [15, -26], frontFoot: [25, -14], rearKnee: [-14, -24], rearFoot: [-22, -9] } },
  waterSweep: { trail: 'flow', contact: 'rearHand', wind: { lean: -7, rearElbow: [-15, -42], rearHand: [-4, -58], elbow: [19, -33], hand: [29, -41], frontKnee: [12, -29], frontFoot: [6, -16], rearKnee: [-13, -23], rearFoot: [-22, -8] },
    strike: { lean: 8, drop: 3, rearElbow: [27, -29], rearHand: [45, -24], elbow: [3, -37], hand: [12, -51], frontKnee: [20, -25], frontFoot: [31, -15], rearKnee: [-15, -22], rearFoot: [-27, -11] } },
  earthLift: { trail: 'uppercut', angle: -Math.PI / 2, wind: { lean: -3, drop: 10, elbow: [-15, -21], hand: [-6, -28], rearHand: [17, -36], frontKnee: [19, -11], frontFoot: [27, -1], rearKnee: [-18, -12], rearFoot: [-27, -1] },
    strike: { lean: 8, drop: 1, elbow: [18, -45], hand: [22, -67], rearElbow: [-14, -31], rearHand: [-9, -40], frontKnee: [18, -13], frontFoot: [27, -1], rearKnee: [-17, -13], rearFoot: [-27, -1] } },
  earthHammer: { trail: 'hammer', angle: Math.PI / 3, wind: { lean: -8, drop: -3, elbow: [-13, -51], hand: [-3, -71], rearElbow: [10, -51], rearHand: [4, -68], frontKnee: [16, -25], frontFoot: [15, -13], rearKnee: [-17, -24], rearFoot: [-23, -12] },
    strike: { lean: 14, drop: 8, elbow: [25, -28], hand: [40, -16], rearElbow: [15, -31], rearHand: [34, -20], frontKnee: [19, -19], frontFoot: [24, -6], rearKnee: [-17, -22], rearFoot: [-28, -11] } },
  earthSpike: { trail: 'spike', angle: Math.PI / 2, wind: { lean: -4, drop: -3, elbow: [-9, -55], hand: [2, -75], rearElbow: [14, -52], rearHand: [8, -73], frontKnee: [16, -29], frontFoot: [8, -17], rearKnee: [-16, -26], rearFoot: [-20, -15] },
    strike: { lean: 18, drop: 12, head: [22, -42], elbow: [25, -17], hand: [28, 3], rearElbow: [15, -17], rearHand: [22, 2], frontKnee: [21, -18], frontFoot: [30, -4], rearKnee: [-15, -20], rearFoot: [-27, -11] } },
  fireLift: { trail: 'uppercut', angle: -Math.PI / 2, wind: { lean: -8, drop: 6, elbow: [-11, -27], hand: [-7, -36], rearHand: [18, -46], frontKnee: [15, -12], frontFoot: [22, -1], rearFoot: [-24, -1] },
    strike: { lean: 15, drop: -2, elbow: [25, -46], hand: [32, -67], rearElbow: [-7, -35], rearHand: [5, -46], frontKnee: [21, -27], frontFoot: [14, -13], rearKnee: [-12, -17], rearFoot: [-21, -1] } },
  fireKick: { trail: 'kick', contact: 'frontFoot', wind: { lean: -8, frontKnee: [13, -34], frontFoot: [5, -23], rearKnee: [-13, -23], rearFoot: [-25, -14], elbow: [12, -39], hand: [20, -50], rearHand: [-10, -34] },
    strike: { lean: -10, drop: -1, frontKnee: [25, -32], frontFoot: [51, -31], rearKnee: [-13, -24], rearFoot: [-24, -12], elbow: [8, -39], hand: [16, -50], rearElbow: [-22, -36], rearHand: [-29, -26] } },
  fireSwitchKick: { trail: 'kick', contact: 'rearFoot', wind: { lean: -4, rearKnee: [-7, -33], rearFoot: [-16, -23], frontKnee: [18, -24], frontFoot: [27, -14], elbow: [14, -39], hand: [23, -50], rearHand: [-16, -37] },
    strike: { lean: -10, drop: -3, rearKnee: [25, -38], rearFoot: [51, -44], frontKnee: [-5, -25], frontFoot: [-18, -13], elbow: [5, -39], hand: [16, -51], rearElbow: [-24, -38], rearHand: [-34, -30] } },
  fireHeel: { trail: 'heel', contact: 'frontFoot', wind: { lean: -14, drop: -3, frontKnee: [6, -35], frontFoot: [-14, -43], rearKnee: [-13, -23], rearFoot: [-26, -10], elbow: [8, -40], hand: [21, -51], rearHand: [-24, -39] },
    strike: { lean: -15, drop: -2, frontKnee: [25, -34], frontFoot: [55, -28], rearKnee: [-15, -23], rearFoot: [-29, -12], elbow: [6, -40], hand: [19, -50], rearElbow: [-25, -38], rearHand: [-37, -30] } },
};

const DEFAULT_AERIAL_POSE = { air: 'airPalm', water: 'waterPalm', earth: 'earthHammer', fire: 'fireKick' };

const BOSS_POSES = {
  air: { trail: 'cast', wind: { lean: -8, drop: 3, rearElbow: [-20, -36], rearHand: [-26, -51], elbow: [13, -35], hand: [17, -57], rearFoot: [-25, -1], frontFoot: [24, -1] }, strike: { lean: 12, elbow: [28, -43], hand: [45, -46], rearElbow: [22, -28], rearHand: [39, -32], frontFoot: [28, -1], rearFoot: [-26, -1] } },
  water: { trail: 'cast', wind: { lean: -9, drop: 6, rearElbow: [-18, -26], rearHand: [-7, -16], elbow: [12, -47], hand: [24, -59], rearFoot: [-27, -1], frontFoot: [26, -1] }, strike: { lean: 7, drop: 2, elbow: [27, -35], hand: [43, -31], rearElbow: [14, -49], rearHand: [31, -57], rearFoot: [-27, -1], frontFoot: [27, -1] } },
  earth: { trail: 'slam', wind: { lean: -3, drop: 5, rearElbow: [-20, -46], rearHand: [-15, -65], elbow: [18, -48], hand: [17, -69], rearFoot: [-29, -1], frontFoot: [29, -1] }, strike: { lean: 14, drop: 14, rearElbow: [10, -20], rearHand: [24, -8], elbow: [29, -19], hand: [38, -3], rearKnee: [-20, -10], frontKnee: [23, -10], rearFoot: [-30, -1], frontFoot: [30, -1] } },
  fire: { trail: 'cast', wind: { lean: -9, drop: 4, rearElbow: [9, -35], rearHand: [19, -48], elbow: [-16, -36], hand: [-17, -53], rearFoot: [-27, -1], frontFoot: [23, -1] }, strike: { lean: 18, drop: 2, elbow: [32, -39], hand: [48, -42], rearElbow: [-10, -30], rearHand: [-19, -27], rearFoot: [-29, -1], frontFoot: [30, -1] } },
};
const BOSS_MOVE_POSES = {
  'gale-counter': MARTIAL_POSES.airLift,
  'cyclone-ring': { trail: 'cast', wind: { drop: 4, elbow: [8, -41], hand: [-1, -52], rearElbow: [-9, -40], rearHand: [2, -49], rearFoot: [-27, -1], frontFoot: [27, -1] }, strike: { drop: -3, elbow: [24, -49], hand: [42, -55], rearElbow: [-24, -49], rearHand: [-42, -55], rearFoot: [-28, -1], frontFoot: [28, -1] } },
  'tide-counter': MARTIAL_POSES.waterLift,
  'ice-lance': CAST_POSES.water,
  'stone-columns': { trail: 'cast', wind: { drop: 11, elbow: [22, -20], hand: [24, -9], rearElbow: [-22, -20], rearHand: [-24, -9], rearKnee: [-20, -10], frontKnee: [22, -10], rearFoot: [-30, -1], frontFoot: [30, -1] }, strike: { drop: -2, elbow: [20, -47], hand: [22, -66], rearElbow: [-20, -47], rearHand: [-22, -66], rearFoot: [-29, -1], frontFoot: [29, -1] } },
  'flame-sweep': COMBO_POSES.fire[2],
  'triple-eruption': BOSS_POSES.earth,
};

// Archetype poses (src/enemy-art.js ARCHETYPE_POSES): the stance replaces the element stance,
// a moving body layers .run (its arms and weapon carry; feet and knees stay the shared stride)
// over the stride, and each action takes { wind, strike } by variant: the string and the ranged
// throws use wind -> strike; the warden's rush leans from his stance into .special; the volley,
// the meteor whirl and the Iron Bell hold .special; the smoke throw winds into it. The Chain Ox's
// hook throw winds like his lash, then flings the arm out with the meteor chain left hanging
// from the fist to the floor (the stance's chain angle): the hook's own chain flies out level.
const ARCH_RUN = {};
const ARCH_STYLES = {};
for (const [kind, P] of Object.entries(ARCHETYPE_POSES)) {
  const run = {};
  for (const key of Object.keys(P.run)) if (!/Foot|Knee/.test(key)) run[key] = P.run[key];
  ARCH_RUN[kind] = run;
  const melee = { wind: P.wind, strike: P.strike };
  const hook = { wind: P.wind, strike: { ...P.strike, weaponAngle: P.stance.weaponAngle ?? P.strike.weaponAngle } };
  ARCH_STYLES[kind] = { melee, arrow: melee, hook, talisman: melee, rush: { wind: P.stance, strike: P.special },
    volley: { wind: P.special, strike: P.special }, whirl: { wind: P.special, strike: P.special }, bell: { wind: P.special, strike: P.special },
    smoke: { wind: P.wind, strike: P.special } };
}
// The talisman slip drawn by a sealed fighter's head (src/enemy-art.js talisman art, reused).
const SEAL_SLIP = { kind: 'talisman', x: 0, y: 0, vx: 1, vy: 0 };
// An archetype shot handed to drawEnemyProjectile: the art aims along (vx, vy), and on screen a
// shot also moves down by its depth travel (vy + vDepth, as the elemental shots and the stuck
// arrow's angle read it). Reused for every draw.
const ENEMY_SHOT = { kind: '', x: 0, y: 0, vx: 1, vy: 0, ox: undefined, oy: undefined };
// While a captive is freed by the player, the player reaches for the cangue.
const RESCUE_POSE = { lean: 6, drop: 6, elbow: [18, -31], hand: [29, -35], rearElbow: [13, -31], rearHand: [26, -38], rearFoot: [-15, -1], frontFoot: [14, -1] };

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
  const consume = fighter.consume;
  // A fighter using a consumable stands in its stance (it cannot step while the use plays).
  const speed = frozen || consume ? 0 : Math.min(1, Math.hypot(fighter.vx || 0, fighter.vDepth || fighter.vd || 0) / 240);
  const phase = time * (fighter.running ? 14 : 10) + (Number(fighter.id) || 0);
  const stride = fighter.grounded && !fighter.stun && !frozen ? Math.sin(phase) * speed : 0;
  const bob = reducedMotion || frozen ? 0 : Math.sin(time * 3.5) * (speed < 0.1 ? 0.7 : 0);
  const lean = speed * 4;
  let rest = {
    hip: [lean * 0.3, -27 + bob], shoulder: [lean, -45 + bob], head: [lean + 1, -57 + bob],
    rearFoot: fighter.grounded ? [-11 - stride * 11, -1] : [-15, -14], frontFoot: fighter.grounded ? [11 + stride * 11, -1] : [12, -9],
    rearKnee: [-10 - stride * 3, -15 - Math.abs(stride) * 3], frontKnee: [8 + stride * 5, -15],
    rearElbow: [-14 - stride * 3, -32], rearHand: [-9 - stride * 5, -27], elbow: [14 + stride * 3, -35], hand: [19 - stride * 4, -42],
    // Idle carry angle per weapon (the twin knives rest lower, WEAPON_ART.knives.restAngle).
    weaponAngle: WEAPON_ART[fighter.weapon]?.restAngle ?? -1.24,
  };
  const arch = fighter.archetype ? ARCHETYPE_POSES[fighter.archetype] : null;
  if (arch) {
    // A bound villager kneels in his cangue; freed he stands and hobbles.
    if ((fighter.grounded && speed < 0.15) || (fighter.archetype === 'captive' && !fighter.freed)) rest = poseWith(rest, arch.stance);
    else if (fighter.grounded) rest = poseWith(rest, ARCH_RUN[fighter.archetype]);
  } else if (fighter.grounded && speed < 0.15) rest = poseWith(rest, FIGHTING_STANCES[fighter.element] || FIGHTING_STANCES.air);
  // The use pose (src/pickup-art.js) keys over the stance and carries the item track
  // (pose.item, pose.release, pose.remnant); a fresh pose, safe to keep in fighterAnimations.
  if (consume) {
    const pose = consumePose(rest, consume.kind, clamp01((consume.t || 0) / (consume.duration || 1)), consume.from);
    return { pose, stroke: 0, style: null, recoil: 0, speed: 0 };
  }
  if (fighter.recoveryRoll) {
    const progress = clamp01(fighter.recoveryRoll.t / fighter.recoveryRoll.duration);
    const tuck = poseWith(rest, { hip: [-4, -17], shoulder: [-8, -29], head: [5, -33],
      rearKnee: [8, -13], rearFoot: [4, -5], frontKnee: [15, -23], frontFoot: [17, -8],
      rearElbow: [1, -32], rearHand: [11, -20], elbow: [11, -28], hand: [13, -15] });
    const amount = smooth(progress / 0.12) * (1 - smooth((progress - 0.82) / 0.18));
    return { pose: blendPose(rest, tuck, amount), stroke: 0, style: null, recoil: 0, speed };
  }
  if (fighter.guard) rest = poseWith(rest, { lean: -2, drop: 2, rearElbow: [6, -39], rearHand: [14, -51], elbow: [12, -35], hand: [16, -51], rearFoot: [-15, -1], frontFoot: [13, -1] });
  if (fighter.rescue) rest = poseWith(rest, RESCUE_POSE);
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
    if (kind === 'aerial' && !fighter.weapon) style = MARTIAL_POSES[DEFAULT_AERIAL_POSE[fighter.element] || 'airPalm'];
    if (kind === 'throw' || kind === 'bodyThrow') style = { trail: 'throw', wind: { lean: -8, elbow: [-12, -49], hand: [-17, -64], weaponAngle: -1.8 }, strike: { lean: 12, elbow: [25, -49], hand: [43, -51], weaponAngle: -0.2, frontFoot: [23, -1] } };
    if (kind === 'grabPunch') style = { trail: 'body',
      wind: { lean: -3, drop: 3, elbow: [-7, -34], hand: [-9, -43], rearElbow: [20, -33], rearHand: [33, -38] },
      strike: { lean: 10, drop: 5, elbow: [24, -32], hand: [39, -34], rearElbow: [20, -33], rearHand: [33, -38], frontFoot: [20, -1] } };
    if (kind === 'special' || kind === 'burst') style = CAST_POSES[fighter.element] || CAST_POSES.air;
    if (arch && (kind === 'melee' || kind === 'special' || kind === 'burst')) style = ARCH_STYLES[fighter.archetype][action?.variant] || ARCH_STYLES[fighter.archetype].melee;
    if (!fighter.weapon && (action?.variant === 'launcher' || action?.variant === 'aerial')) {
      let poseKey = action.move?.pose;
      if (poseKey === 'airHeel' && action.airIndex >= 2) poseKey = 'airDiveHeel';
      if (poseKey === 'fireKick' && action.airIndex % 2 === 1) poseKey = 'fireSwitchKick';
      style = MARTIAL_POSES[poseKey] || style;
    }
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

  // Held archetype states: the priest's heal channel and the monk's Iron Bell (.special), a
  // freed villager's cheer (.special) and his call for help (.strike: head up).
  if (arch && !action) {
    const hold = fighter.channel || fighter.bellTimer > 0 || (fighter.freed && fighter.cheer > 0) ? arch.special
      : fighter.calling > 0 && !fighter.freed ? arch.strike : null;
    if (hold) { pose = poseWith(rest, hold); stroke = 0; style = null; }
  }

  const bossAction = fighter.bossAction;
  if (bossAction) {
    style = BOSS_MOVE_POSES[bossAction.move] || BOSS_POSES[fighter.element] || BOSS_POSES.air;
    const prepared = poseWith(rest, style.wind);
    const contact = poseWith(rest, style.strike);
    if (bossAction.stage === 'transition') {
      pose = poseWith(rest, { drop: -3, elbow: [22, -49], hand: [28, -68], rearElbow: [-22, -49], rearHand: [-28, -68], rearFoot: [-28, -1], frontFoot: [28, -1] });
      stroke = 0;
      style = null;
    } else if (bossAction.stage === 'windup') {
      pose = blendPose(rest, prepared, smooth(bossAction.t / Math.max(0.08, Math.min(0.25, bossAction.windup * 0.35))));
      stroke = 0;
    } else if (bossAction.stage === 'active') {
      pose = blendPose(prepared, contact, smooth((bossAction.t - bossAction.windup) / 0.1));
      stroke = Math.max(0.3, 1 - (bossAction.t - bossAction.windup) * 2);
    } else {
      pose = blendPose(contact, rest, smooth((bossAction.t - bossAction.activeUntil) / Math.max(0.08, bossAction.duration - bossAction.activeUntil)));
      stroke = 0;
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
    // An archetype's long weapon swings clear of the floor while it reels (.hit.weaponAngle).
    if (arch?.hit?.weaponAngle !== undefined) pose.weaponAngle = mix(pose.weaponAngle, arch.hit.weaponAngle, Math.min(1, recoil * 2));
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
    // Flung vessels and knocked-out items (consumeFling entries + t0): cosmetic, renderer-owned.
    this.flung = [];
    this.flungUses = new WeakSet();
    // Live fighters by id for effects that follow one (slashes, command icons); refreshed per frame.
    this.fighterById = new Map();
  }

  // The arena drawn: a sanctuary (PALETTES) or a pack stage (src/arena-art.js). The state's own
  // arena wins, as a key or as an ARENAS entry, over settings.arena; a pack stage is matched by
  // its own key before any element fallback: it carries an element, but its art is its own.
  arenaKey(state) {
    const arena = state.arena;
    if (isArenaKey(arena)) return arena;
    if (arena && typeof arena === 'object') for (const key in ARENAS) if (ARENAS[key] === arena && isArenaKey(key)) return key;
    if (isArenaKey(state.settings?.arena)) return state.settings.arena;
    if (PALETTES[arena?.element]) return arena.element;
    if (PALETTES[arena?.id]) return arena.id;
    return 'air';
  }

  // The cached static layers of an arena; draw() blits them over the 1280x720 frame.
  background(key) {
    if (this.backgrounds.has(key)) return this.backgrounds.get(key);
    const canvas = document.createElement('canvas');
    // A pack stage draws its own floor, edge posts and grain on the same playfield geometry. Its
    // cache is built at the device pixel ratio (as the approved preview glue does), so its fine
    // strings, stars and roof edges stay as sharp on a 2x screen as the scenery drawn live over
    // it. Only the latest pack stage keeps its cache (about 14.7 MB at 2x); going back to an
    // earlier one rebuilds it once.
    if (ARENA_PACK_PALETTES[key]) {
      const pr = this.pixelRatio;
      canvas.width = WIDTH * pr;
      canvas.height = HEIGHT * pr;
      const ctx = canvas.getContext('2d');
      ctx.scale(pr, pr);
      drawArenaPackBackground(ctx, key);
      for (const other of [...this.backgrounds.keys()]) if (ARENA_PACK_PALETTES[other]) this.backgrounds.delete(other);
      this.backgrounds.set(key, canvas);
      return canvas;
    }
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
    if (state.settings?.mode === 'story') this.drawStageBackground(state, key);
    else ctx.drawImage(this.background(key), 0, 0, WIDTH, HEIGHT);
    // A pack stage's anchored moving parts (banners, lanterns, chains, sprays, drips, smoke) go
    // with the unshaken background, so a heavy hit never shakes them off their poles and strings.
    if (!state.stage && ARENA_PACK_PALETTES[key]) drawArenaPackScenery(ctx, key, reducedMotion ? 0 : time);
    ctx.save();
    const shake = reducedMotion ? 0 : Math.min(12, state.shake || 0);
    if (shake > 0) ctx.translate(Math.sin(time * 173) * shake, Math.cos(time * 137) * shake * 0.65);

    this.drawAmbient(time, key, reducedMotion);
    ctx.translate(-(state.cameraX || 0), 0);
    if (state.stage) this.drawStageGates(state, key);
    this.time = time;
    // Bound (and freed) villagers draw with the fighters.
    const captives = state.captives || [];
    const living = [...(state.enemies || []), ...captives, state.player].filter(fighter => fighter && !fighter.dead);
    this.fighterById.clear();
    for (const fighter of living) this.fighterById.set(fighter.id, fighter);
    // A summoned enemy stays hidden until its spawn swirl reveals it.
    const fighters = living.filter(fighter => !(fighter.spawnReveal > 0));
    const corpses = state.corpses || [];
    const weapons = state.weapons || [];
    const projectiles = state.projectiles || [];
    const effects = state.effects || [];
    const auras = state.auras || [];
    // E's target: a dizzy opponent, else a bound villager (his rescue prompt), else the nearest item.
    const player = state.player;
    this.rescueTarget = player?.rescue ? captives.find(c => c.id === player.rescue.id) || null
      : player && !grabCandidate(player, state.enemies || []) ? rescueCandidate(player, captives) : null;
    const target = pickupTarget(player, weapons, state.enemies || [], this.rescueTarget);
    // Flung vessels live on the game clock (they pause with it); a new run (clock reset) drops them.
    this.flung = this.flung.filter(f => !f.done && time >= f.t0 && time - f.t0 <= CP_FLING_LIFE);
    // Planted censer fields lie on the floor, under every shadow.
    for (const aura of auras) {
      drawIncenseAura(ctx, aura.x, aura.depth, reducedMotion ? 0 : time, clamp01(aura.life / aura.maxLife), AURA_COLORS[aura.team] || AURA_COLORS.player);
    }
    for (const fighter of fighters) this.drawGroundShadow(fighter, 'fighter');
    for (const corpse of corpses) this.drawGroundShadow(corpse, 'corpse');
    for (const weapon of weapons) this.drawGroundShadow(weapon, 'pickup', reducedMotion);
    // The planted censer's shadow fades and shrinks with the prop (drawCenser's CENSER_FADE).
    for (const aura of auras) {
      const fade = clamp01(aura.life / CENSER_FADE);
      if (fade > 0) this.drawGroundShadow({ x: aura.x, y: aura.depth, depth: aura.depth, kind: 'incense', fade }, 'pickup');
    }
    for (const projectile of projectiles) {
      if (projectile.kind === 'weapon') this.drawGroundShadow(projectile, 'projectile');
      else if (ENEMY_PROJECTILES.has(projectile.kind)) drawEnemyProjectileShadow(ctx, projectile);
    }
    for (const effect of effects) if (effect.kind !== 'vfx' && !POST_EFFECT_KINDS.has(effect.kind)) this.drawEffect(effect, reducedMotion);
    const labeledBosses = new Set();
    for (const hazard of state.bossHazards || []) {
      const label = hazard.delay > 0 && !labeledBosses.has(hazard.ownerId);
      this.drawBossHazard(hazard, time, reducedMotion, label, state.cameraX || 0);
      if (label) labeledBosses.add(hazard.ownerId);
    }
    const objects = [];
    for (const entity of fighters) objects.push({ entity, kind: 'fighter', depth: groundDepth(entity) });
    for (const entity of corpses) objects.push({ entity, kind: 'corpse', depth: groundDepth(entity) });
    for (const entity of weapons) objects.push({ entity, kind: 'pickup', depth: groundDepth(entity) });
    for (const entity of projectiles) objects.push({ entity, kind: 'projectile', depth: groundDepth(entity) });
    // The planted censer sorts just in front of its planter; a flung item by its floor line.
    for (const entity of auras) objects.push({ entity, kind: 'censer', depth: entity.depth + 1 });
    for (const entity of this.flung) objects.push({ entity, kind: 'flung', depth: entity.floor });
    // Split effects sandwich whoever stands on their floor point: the back layer just behind
    // that depth, the front layer just in front. Floor-sorted top effects (dust, spawn, smoke)
    // sit just in front of their floor point, so they never paint over fighters nearer the
    // camera. Hit sparks and KO bursts stay over everything (see DEPTH_SORTED_ANCHORS).
    for (const entity of effects) {
      const def = entity.kind === 'vfx' && VFX[entity.fx];
      if (!def) continue;
      const depth = this.vfxDepth(entity);
      if (def.layer === 'split') {
        objects.push({ entity, kind: 'vfx', layer: 'back', depth: depth - 0.01 });
        objects.push({ entity, kind: 'vfx', layer: 'front', depth: depth + 0.01 });
      } else if (def.layer === 'top' && DEPTH_SORTED_ANCHORS.has(def.anchor)) objects.push({ entity, kind: 'vfx', layer: undefined, depth: depth + 0.01 });
    }
    objects.sort((a, b) => a.depth - b.depth);
    for (const { entity, kind, layer } of objects) {
      if (kind === 'fighter') this.drawFighter(entity, time, reducedMotion, state.player);
      else if (kind === 'corpse') this.drawCorpse(entity);
      else if (kind === 'pickup') this.drawWeaponPickup(entity, reducedMotion ? 0 : time, reducedMotion, entity === target);
      else if (kind === 'censer') this.drawCenser(entity, time, reducedMotion);
      else if (kind === 'flung') {
        ctx.globalAlpha = 1;
        if (!drawFlung(ctx, entity, time - entity.t0, time)) entity.done = true;
      } else if (kind === 'vfx') this.drawVfx(entity, layer, reducedMotion);
      else this.drawProjectile(entity, time, reducedMotion);
    }
    for (const effect of effects) {
      if (effect.kind === 'vfx') {
        const def = VFX[effect.fx];
        if (def?.layer === 'top' && !DEPTH_SORTED_ANCHORS.has(def.anchor)) this.drawVfx(effect, undefined, reducedMotion);
      } else if (POST_EFFECT_KINDS.has(effect.kind)) this.drawEffect(effect, reducedMotion);
    }
    for (const particle of state.particles || []) this.drawParticle(particle, reducedMotion);
    for (const floater of state.floaters || []) this.drawFloater(floater);
    // Command icons float over everything, re-anchored to their fighter's head each frame.
    for (const effect of effects) if (effect.kind === 'vfx' && VFX[effect.fx]?.layer === 'head') this.drawVfx(effect, undefined, reducedMotion);
    ctx.restore();

    this.drawEdgeDetails(state, key);
    if (state.stage) this.drawStageDirection(state, reducedMotion);
    if (state.banner && state.bannerTime > 0) {
      this.drawBanner(state.banner, state.bannerTime);
      // A pack stage's name card hangs under the banner that opens it (state.stageCard: wave 1
      // with no guardian) and fades with it. Story chapters visit only the four sanctuaries and
      // always bring a guardian, so they never show it; drawArenaPackTitleCard's subtitle-only
      // variant is there for story chapters on pack stages, should they come.
      if (state.stageCard && ARENA_PACK_PALETTES[key]) {
        drawArenaPackTitleCard(ctx, key, Math.min(1, state.bannerTime * 2), AP_CARD_TOP);
      }
    }
  }

  // The fighter an effect follows (attacker for slashes, owner for command icons), if alive.
  vfxOwner(effect) {
    return effect.followId != null ? this.fighterById.get(effect.followId) || null : null;
  }

  vfxDepth(effect) {
    const owner = this.vfxOwner(effect);
    return owner ? groundDepth(owner) : Number.isFinite(effect.depth) ? effect.depth : effect.y || 0;
  }

  // Draws a kind 'vfx' effect (VFX[fx] from src/vfx-art.js) at t = 1 - life / maxLife.
  // layer: 'back' | 'front' for split effects, undefined for the whole effect. A delayed
  // effect (life above maxLife) is not drawn yet. Inked effects draw at full alpha.
  drawVfx(effect, layer, reducedMotion = false) {
    const def = VFX[effect.fx];
    if (!def) return;
    const maxLife = effect.maxLife || def.life;
    const t = 1 - (effect.life ?? 0) / maxLife;
    if (!(t >= 0 && t <= 1)) return;
    const owner = this.vfxOwner(effect);
    let x = effect.x, y = effect.y;
    if (owner && def.layer === 'head') {
      x = owner.x;
      y = owner.y - (owner.h || 66) - headIconLift(owner);
    } else if (owner) {
      x = owner.x + (effect.dx || 0);
      y = owner.y + (effect.dy || 0);
    }
    this.ctx.globalAlpha = 1;
    def.draw(this.ctx, x, y, t, vfxParams(effect.p || NO_PARAMS, def.p || NO_PARAMS, layer, reducedMotion));
  }

  drawStageBackground(state, key) {
    const ctx = this.ctx, palette = PALETTES[key];
    const camera = state.cameraX || 0;
    const sky = ctx.createLinearGradient(0, 0, 0, 365);
    sky.addColorStop(0, palette.sky);
    sky.addColorStop(1, palette.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    circle(ctx, 1000 - camera * .05, 125, 58, key === 'fire' ? '#f9d8a5' : '#faf4df');
    for (let i = -1; i < 9; i++) {
      const x = i * 440 - camera * .15;
      polygon(ctx, [[x - 210, 365], [x + 35, 180 + noise(i + 31) * 95], [x + 290, 365]], palette.far);
      cloud(ctx, x + 160, 95 + noise(i + 7) * 80, .7 + noise(i + 4) * .5, '#fffaf075');
    }
    for (let i = -1; i < 8; i++) {
      const x = i * 530 - camera * .35;
      polygon(ctx, [[x - 210, 370], [x + 25, 265 + noise(i + 42) * 45], [x + 360, 370]], palette.mid);
    }
    if (key === 'water') {
      ctx.fillStyle = '#a6c9d1';
      ctx.fillRect(0, 325, WIDTH, 40);
      for (let i = 0; i < 24; i++) {
        const x = ((i * 133 - camera * .45) % (WIDTH + 150) + WIDTH + 150) % (WIDTH + 150) - 75;
        line(ctx, [[x, 332 + noise(i) * 26], [x + 46, 332 + noise(i) * 26]], '#eff5ec80', 2);
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = 160 + i * 780 - camera * .65;
      if (x < -180 || x > WIDTH + 180) continue;
      temple(ctx, x, 350, .8 + noise(i + 2) * .35, palette);
    }
    const floor = ctx.createLinearGradient(0, 365, 0, 710);
    floor.addColorStop(0, '#f3efdc');
    floor.addColorStop(1, palette.stone);
    ctx.fillStyle = palette.side;
    ctx.fillRect(0, 350, WIDTH, 20);
    ctx.fillStyle = floor;
    ctx.fillRect(0, 365, WIDTH, 355);
    ctx.fillStyle = palette.side;
    ctx.fillRect(0, 681, WIDTH, 39);
    ctx.fillStyle = palette.stone;
    ctx.fillRect(0, 681, WIDTH, 9);
    line(ctx, [[0, 350], [WIDTH, 350]], palette.accent, 2);
    line(ctx, [[0, 682], [WIDTH, 682]], palette.accent, 2);
    ctx.save();
    ctx.translate(-camera, 0);
    ctx.globalAlpha = .2;
    for (const y of [395, 448, 510, 580, 650]) {
      line(ctx, [[camera, y], [camera + WIDTH, y]], palette.accent, 1);
      for (let x = Math.floor(camera / 140) * 140 - 140; x < camera + WIDTH + 140; x += 140) {
        const offset = y === 448 || y === 580 ? 70 : 0;
        line(ctx, [[x + offset, y], [x + offset + 24, Math.min(681, y + 53)]], palette.accent, 1);
      }
    }
    ctx.globalAlpha = 1;
    // Wayside banners and floor emblems stay in world space as the route scrolls.
    for (let i = 0; i < 7; i++) {
      const x = 145 + i * 530;
      if (x < camera - 100 || x > camera + WIDTH + 100) continue;
      line(ctx, [[x, 350], [x, 253]], palette.accent, 5);
      polygon(ctx, [[x + 3, 258], [x + 43, 258], [x + 43, 301], [x + 23, 291], [x + 3, 301]], palette.accent);
      elementGlyph(ctx, key, x + 23, 276, 8, PAPER, 1.4);
    }
    for (let i = 0; i < 3; i++) {
      const x = 650 + i * 1100;
      ctx.save();
      ctx.translate(x, 523);
      ctx.scale(1, .44);
      ctx.globalAlpha = .16;
      circle(ctx, 0, 0, 85, null, palette.accent, 2);
      elementGlyph(ctx, key, 0, 0, 35, palette.accent, 1.5);
      ctx.restore();
    }
    ctx.restore();
  }

  drawStageGates(state, key) {
    if (state.stage.phase !== 'fight') return;
    const ctx = this.ctx, color = PALETTES[key].accent;
    ctx.save();
    for (const x of [state.bounds.left, state.bounds.right]) {
      ctx.globalAlpha = .7;
      line(ctx, [[x, 395], [x, 650]], color, 3);
      for (let y = 400; y < 650; y += 30) {
        polygon(ctx, [[x - 5, y], [x, y + 5], [x + 5, y], [x, y - 5]], color);
      }
      ctx.globalAlpha = .18;
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, 395, 12, 255);
    }
    ctx.restore();
  }

  drawStageDirection(state, reducedMotion) {
    const ctx = this.ctx, stage = state.stage;
    ctx.save();
    const x = WIDTH - 36, y = 152;
    if (stage.phase !== 'fight' && state.status === 'playing') {
      const nudge = reducedMotion ? 0 : Math.sin(state.time * 5) * 4;
      ctx.translate(nudge, 0);
      polygon(ctx, [[x - 110, y - 27], [x - 22, y - 27], [x + 4, y], [x - 22, y + 27], [x - 110, y + 27]], PAPER, INK, 1.5);
      ctx.fillStyle = INK;
      ctx.font = '900 25px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GO', x - 58, y + 8);
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(stage.phase === 'exit' ? stage.chapter === 4 ? 'EXIT →' : 'NEXT STAGE →' : 'MOVE RIGHT →', x, y + 46);
    }
    ctx.restore();
  }

  drawAmbient(time, element, reducedMotion) {
    const ctx = this.ctx;
    const t = reducedMotion ? 0 : time;
    // A pack stage has its own free air particles (falling leaves, wind, dust, motes).
    if (ARENA_PACK_PALETTES[element]) {
      drawArenaPackAmbient(ctx, element, t);
      return;
    }
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

  drawBossHazard(hazard, time, reducedMotion, showLabel, cameraX = 0) {
    const ctx = this.ctx;
    const warning = hazard.delay > 0;
    const color = elementColor(hazard.element);
    const progress = warning ? clamp01(1 - hazard.delay / Math.max(0.001, hazard.warningTime)) : 1;
    const fade = warning ? 1 : Math.min(1, Math.max(0, hazard.life / Math.max(0.001, hazard.maxLife)) * 3);
    ctx.save();
    ctx.translate(hazard.x, hazard.depth);
    hazardPath(ctx, hazard);
    ctx.fillStyle = warning ? '#c57535' : color;
    ctx.globalAlpha = warning ? 0.12 : 0.18 * fade;
    ctx.fill();
    // The boundary always shows the full collision footprint; its size never pulses.
    ctx.globalAlpha = warning ? 0.9 : fade;
    ctx.strokeStyle = '#fff9e7';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = warning ? '#9d4d2b' : color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.save();
    hazardPath(ctx, hazard);
    ctx.clip();
    ctx.globalAlpha = warning ? 0.24 : 0.3 * fade;
    for (let x = -hazard.rx - hazard.rd; x < hazard.rx + hazard.rd; x += 28) {
      line(ctx, [[x - hazard.rd, hazard.rd], [x + hazard.rd, -hazard.rd]], warning ? '#9d4d2b' : color, 2);
    }
    ctx.restore();
    if (warning) {
      ctx.globalAlpha = 1;
      circle(ctx, 0, -3, 12, '#fff8e8', '#9d4d2b', 1.5);
      ctx.fillStyle = '#8a3e27';
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, 3);
      ctx.fillStyle = '#72523c';
      ctx.fillRect(-24, 15, 48, 5);
      ctx.fillStyle = '#ffe6a4';
      ctx.fillRect(-23, 16, 46 * progress, 3);
    } else if (!VFX_HAZARD_MOVES.has(hazard.move)) {
      // Ice-lance columns and eruptions are drawn by their vfx, in reduced motion too, so the
      // released footprint is their only other cue.
      ctx.globalAlpha = fade * (reducedMotion ? 0.65 : 0.85);
      if (reducedMotion) {
        elementGlyph(ctx, hazard.element, 0, -Math.min(hazard.height * 0.45, 36), 14, color, 2.5);
        line(ctx, [[0, 0], [0, -hazard.height]], color, 2);
        line(ctx, [[-8, -hazard.height], [8, -hazard.height]], color, 2);
      } else this.drawBossHazardElement(hazard, time);
    }
    ctx.restore();
    if (showLabel) {
      ctx.save();
      ctx.font = '800 11px system-ui, sans-serif';
      const name = hazard.name.toUpperCase();
      const hint = hazard.hint;
      const width = Math.min(390, Math.max(ctx.measureText(name).width, ctx.measureText(hint).width) + 24);
      const x = Math.max(cameraX + width / 2 + 12, Math.min(cameraX + WIDTH - width / 2 - 12, hazard.x));
      const y = Math.max(306, hazard.depth - hazard.rd - 34);
      ctx.fillStyle = '#fff8e8';
      ctx.fillRect(x - width / 2, y - 14, width, 35);
      ctx.strokeStyle = '#9d4d2b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - width / 2, y - 14, width, 35);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#93472c';
      ctx.fillText(name, x, y - 1, width - 12);
      ctx.fillStyle = INK;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(hint, x, y + 14, width - 12);
      ctx.restore();
    }
  }

  drawBossHazardElement(hazard, time) {
    const ctx = this.ctx;
    const { rx, rd, height, element } = hazard;
    const count = Math.max(3, Math.min(7, Math.ceil(rx / 60)));
    if (element === 'air') {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        const turn = time * 6 + i;
        ctx.ellipse(0, -height * (i + 0.3) / 3, rx * (0.74 + i * 0.08), Math.min(rd, 10 + rd * 0.4), 0, turn, turn + Math.PI * 1.65);
        ctx.strokeStyle = i % 2 ? '#fffdf0' : '#6cae9e';
        ctx.lineWidth = 5 - i;
        ctx.stroke();
      }
    } else if (element === 'water') {
      for (let i = 0; i < count; i += 1) {
        const x = (i / (count - 1) - 0.5) * rx * 1.65;
        if (hazard.move === 'ice-lance') {
          polygon(ctx, [[x - 10, 0], [x - 5, -height * 0.72], [x + 2, -height], [x + 12, -height * 0.23], [x + 10, 0]], '#a1d9e7', '#4b93b2', 1.5);
          line(ctx, [[x + 1, -height * 0.86], [x + 4, -10]], '#f2ffff', 2);
        } else {
          ctx.beginPath();
          ctx.moveTo(x - 22, 0);
          ctx.bezierCurveTo(x - 15, -height * 0.5, x - 8, -height, x + 8, -height);
          ctx.bezierCurveTo(x + 24, -height, x + 25, -height * 0.35, x + 14, -height * 0.35);
          ctx.strokeStyle = '#4c9abb';
          ctx.lineWidth = 8;
          ctx.stroke();
          ctx.strokeStyle = '#d7f8ed';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    } else if (element === 'earth') {
      for (let i = 0; i < count; i += 1) {
        const x = (i / (count - 1) - 0.5) * rx * 1.6;
        const width = Math.min(18, rx / (count + 1));
        polygon(ctx, [[x - width, 0], [x - width * 0.7, -height * 0.8], [x + 1, -height], [x + width, -height * 0.66], [x + width, 0]], '#b39b68', '#77754e', 2);
        polygon(ctx, [[x + 1, -height], [x + width, -height * 0.66], [x + width, 0], [x + 2, 0]], '#95865e');
        line(ctx, [[x - width * 0.5, -height * 0.75], [x, -height * 0.86]], '#eddfad', 2);
      }
    } else {
      for (let i = 0; i < count; i += 1) {
        const x = (i / (count - 1) - 0.5) * rx * 1.7;
        const width = Math.min(22, rx / (count + 1));
        const sway = Math.sin(time * 14 + i * 1.7) * 5;
        ctx.beginPath();
        ctx.moveTo(x - width, 0);
        ctx.bezierCurveTo(x - width * 1.2, -height * 0.4, x + sway, -height * 0.7, x + sway, -height);
        ctx.bezierCurveTo(x + width * 1.4, -height * 0.63, x + width * 0.4, -height * 0.3, x + width, 0);
        ctx.fillStyle = '#d96e40';
        ctx.fill();
        polygon(ctx, [[x - width * 0.55, 0], [x + sway * 0.4, -height * 0.64], [x + width * 0.55, 0]], '#ffd383');
      }
    }
  }

  // A pickup's shadow shrinks with its despawn blink (consumableFade); a consumable's radius is
  // CONSUMABLES[kind].shadow, a weapon's WEAPON_ART[kind].shadow.
  drawGroundShadow(entity, kind, reducedMotion = false) {
    const ctx = this.ctx;
    const depth = groundDepth(entity);
    const height = Math.max(0, entity.z || depth - entity.y || 0);
    const scale = (entity.h || 66) / 66;
    // entity.fade (0..1): an extra fade-out (the planted censer's), on alpha and size.
    const extra = entity.fade ?? 1;
    const radius = kind === 'pickup'
      ? (CONSUMABLES[entity.kind]?.shadow ?? WEAPON_ART[entity.kind]?.shadow ?? 17) * Math.max(0.4, consumableFade(Number.isFinite(entity.life) ? entity.life : 99, reducedMotion) * (0.4 + 0.6 * extra))
      : kind === 'projectile' ? 14 : (entity.recoveryRoll ? 25 : entity.knockdown > 0 || kind === 'corpse' ? 31 : 22) * scale;
    const fade = Math.max(0.08, 0.2 - height / 1500);
    ctx.save();
    ctx.globalAlpha = fade * extra * (kind === 'corpse' ? Math.min(1, entity.life || 1) : 1);
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

  // A pickup on the floor. Consumables are src/pickup-art.js drawings (bob, glint, rarity ring,
  // category pip); weapons and the bracer are src/weapon-art.js drawings (light items bob; time
  // 0, the reduced-motion clock, stills the bob and twinkle). Only near, the item the player's E
  // would take, shows its prompt: a consumable's stroked E seal, a weapon's "E" badge. Every
  // pickup blinks out over its last 5 s and dissolves in a paper wash (consumableFade; reduced
  // motion: a steady fade).
  drawWeaponPickup(weapon, time, reducedMotion = false, near = false) {
    const ctx = this.ctx;
    if (drawConsumable(ctx, weapon, time, near, reducedMotion)) return;
    const life = Number.isFinite(weapon.life) ? weapon.life : 99;
    const fade = consumableFade(life, reducedMotion);
    if (!(fade > 0)) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(weapon.x, weapon.y);
    ctx.translate(0, drawWeaponPickupArt(ctx, weapon.kind, time, weapon.x));
    if (near) {
      ctx.globalAlpha = Math.min(1, fade + 0.3);
      ctx.fillStyle = INK;
      ctx.fillRect(-7, 8, 14, 14);
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = PAPER;
      ctx.fillText('E', 0, 19);
    }
    ctx.restore();
    if (!reducedMotion && life < CP_DISSOLVE) drawDespawnPuff(ctx, weapon.x, weapon.y - 14, 1 - life / CP_DISSOLVE);
  }

  // A planted censer (an entry of state.auras) at its plant spot, mirrored and scaled like the
  // planter's pose so the hand-off from the hand is seamless. It fades as its field runs out.
  drawCenser(aura, time, reducedMotion = false) {
    const ctx = this.ctx;
    const fade = clamp01(aura.life / CENSER_FADE);
    if (!(fade > 0)) return;
    const scale = aura.scale || 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(aura.x, aura.depth);
    ctx.scale((aura.facing < 0 ? -1 : 1) * scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawConsumableItem(ctx, 'incense', reducedMotion ? 0 : time, null, reducedMotion || aura.life < CENSER_EMBERS ? CP_STILL : 0, 0);
    ctx.restore();
    if (!reducedMotion && aura.life < CP_DISSOLVE) drawDespawnPuff(ctx, aura.x, aura.depth - 15 * scale, 1 - aura.life / CP_DISSOLVE);
  }

  // start/end: the weapon axis in pose units (the fist sits 23/52 along it); t: the fighter's
  // animation clock (tassels, streamer, frost motes, the lantern fuse), 0 to hold them still.
  drawHeldWeapon(kind, start, end, ctx = this.ctx, t = 0) {
    drawHeldWeaponArt(ctx, kind, start, end, t);
  }

  // The stowed weapon's axis while a consumable is used (consumeStow): poles and blades slung
  // diagonally across the back; an upright carry (crate, mill stone, lantern) rides on the back
  // like a pack; the knife pair and a throwing stone ride in the sash (SASH_STOW). Every axis is
  // 52 units with the fist point 23/52 along (drawHeldWeaponArt's grip), so the art draws at full
  // size.
  stowAxis(pose, kind) {
    const sash = SASH_STOW[kind];
    if (sash) {
      // Short one-hand carries would hide behind the torso on the back line: they ride in the
      // sash instead (SASH_STOW), clear of the torso and the legs.
      const h = pose.hip, s = pose.shoulder;
      let tx = s[0] - h[0], ty = s[1] - h[1];
      const l = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= l; ty /= l;
      const nx = ty, ny = -tx; // towards the back
      const gx = h[0] + nx * sash.back + tx * sash.up, gy = h[1] + ny * sash.back + ty * sash.up;
      const c = Math.cos(sash.tip), sn = Math.sin(sash.tip);
      const dx = nx * c - tx * sn, dy = ny * c - ty * sn;
      return [[gx - dx * 23, gy - dy * 23], [gx + dx * 29, gy + dy * 29]];
    }
    if (!WEAPON_ART[kind]?.upright) return consumeStow(pose, kind);
    const [a, b] = consumeStow(pose, 'crate');
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    return [[cx - 23, cy], [cx + 29, cy]];
  }

  // Flung vessels and knocked-out items (world objects drawn by drawFlung, depth-sorted on their
  // floor line). A drained vessel leaves the hand when its pose first releases it; when a hit cuts
  // a use short (the engine's consumeLost) the item flies out of the hand it was last drawn in.
  // A new one draws at once, so the hand-off has no empty frame. Reduced motion: none.
  trackFlings(fighter, previous, usePose, scale, facing, time) {
    const c = fighter.consume;
    if (c && usePose?.release?.[0] && !this.flungUses.has(c)) {
      this.flungUses.add(c);
      this.addFling(consumeFling(usePose, c.kind, c.variant, fighter.x, fighter.y, scale, facing, false), time);
    }
    const lost = fighter.consumeLost;
    const was = previous?.consume;
    if (lost && previous && previous.lost !== lost.serial && was && was.kind === lost.kind && previous.usePose?.item?.[0]) {
      this.addFling(consumeFling(previous.usePose, was.kind, was.variant, previous.x, previous.y, scale, previous.facing ?? facing, true), time);
    }
  }

  addFling(fling, time) {
    if (!fling) return;
    fling.t0 = time;
    this.flung.push(fling);
    if (this.flung.length > MAX_FLUNG) this.flung.shift();
    this.ctx.globalAlpha = 1;
    drawFlung(this.ctx, fling, 0, time);
  }

  // Timed buffs at the torso (drawConsumableBuff): the elixir's gold ring, the gourd's qi
  // ribbon, a censer field's rising crosses. layer 0 before the body (far half), 1 after it.
  drawBuffs(fighter, h, t, layer) {
    const ctx = this.ctx;
    if (fighter.power > 0) drawConsumableBuff(ctx, 'pill', fighter.x, fighter.y, h, t, fighter.power / ITEM_EFFECTS.pill.power, layer);
    if (fighter.qiFlow > 0) drawConsumableBuff(ctx, 'gourd', fighter.x, fighter.y, h, t, fighter.qiFlow / ITEM_EFFECTS.gourd.flow, layer);
    if (fighter.censerRegen > 0) drawConsumableBuff(ctx, 'incense', fighter.x, fighter.y, h, t, fighter.censerRegen, layer);
  }

  // The consume sparkle over the fighter who used the item (a 'consume' effect).
  drawConsumeEffect(effect, reducedMotion = false) {
    const maxLife = effect.maxLife || CP_SPARKLE_TIME;
    const p = 1 - (effect.life ?? 0) / maxLife;
    if (!(p >= 0 && p < 1)) return;
    const f = effect.followId != null ? this.fighterById.get(effect.followId) : null;
    const x = f ? f.x : effect.x, y = f ? f.y : effect.y;
    const facing = (f ? f.facing : effect.facing) < 0 ? -1 : 1;
    this.ctx.globalAlpha = 1;
    drawConsumeSparkle(this.ctx, effect.item, effect.variant, x, y, p, (f ? f.h : effect.h) || 66, facing, reducedMotion);
  }

  drawFighter(fighter, time, reducedMotion, player) {
    const ctx = this.ctx;
    const h = fighter.h || 66;
    const scale = h / 66;
    const color = fighterColor(fighter);
    const arch = fighter.archetype || null;
    const facing = (fighter.recoveryRoll?.direction || fighter.facing) < 0 ? -1 : 1;
    const previous = this.fighterAnimations.get(fighter);
    const hitLag = (fighter.hitLag || 0) > 0;
    // Action timers pause in the simulation; this clock also holds idle motion,
    // cloth and status effects for the participants without freezing the arena.
    const visualTime = previous ? previous.visualTime + (hitLag ? 0 : Math.max(0, time - previous.time)) : time;
    const sameAction = previous?.action === fighter.action;
    const transitionFrom = sameAction ? previous?.transitionFrom : fighter.action && previous?.action && time - previous.time < 0.15 ? previous.pose : null;
    const { pose, stroke, style, recoil, speed } = fighterPose(fighter, visualTime, reducedMotion, transitionFrom);
    // Signed travel: negative while backpedalling, so cloth lifts less. The cloth drive eases
    // towards its target on the visual clock so it does not snap when stroke or recoil jumps.
    const travel = (fighter.vx || 0) * facing < 0 ? -speed : speed;
    const knockedDown = (fighter.knockdown || 0) > 0 && !fighter.recoveryRoll;
    const downAirborne = knockedDown && (fighter.z || 0) > 4;
    // A knocked-down body's cloth streams while it flies and settles once it lands.
    const driveTarget = knockedDown ? (downAirborne ? 0.8 : 0) : clothDrive(travel, stroke, recoil);
    const drive = Number.isFinite(previous?.drive)
      ? mix(previous.drive, driveTarget, 1 - Math.exp(-(visualTime - previous.visualTime) * 12)) : driveTarget;
    const consume = fighter.consume || null;
    // The warden's brace glint eases in and out on the visual clock, like the cloth drive.
    const brace = arch === 'guard' ? (Number.isFinite(previous?.brace)
      ? mix(previous.brace, fighter.brace || 0, 1 - Math.exp(-(visualTime - previous.visualTime) * 10)) : fighter.brace || 0) : 0;
    this.fighterAnimations.set(fighter, { action: fighter.action, time, visualTime, pose, transitionFrom, drive, brace,
      consume, usePose: consume ? pose : null, lost: fighter.consumeLost?.serial ?? null, x: fighter.x, y: fighter.y, facing });
    if (!reducedMotion) this.trackFlings(fighter, previous, consume ? pose : null, scale, facing, time);
    const guarding = Boolean(fighter.guard);
    const dizzy = (fighter.stun || 0) > 0 && fighter.hitType === 'dizzy' && fighter.grabbedBy == null;
    const frozen = (fighter.frozen || 0) > 0;
    const isBoss = fighter.type === 'boss';
    const isPlayer = fighter.team === 'player';
    const hitAge = (fighter.hitMax || 0.35) - (fighter.hitReact || 0);
    const flash = !reducedMotion && fighter.hitReact > 0 && hitAge < 0.045;
    const bodyColor = flash ? FLASH : color;
    const flutter = reducedMotion || frozen ? 0 : visualTime;
    const contactShake = !reducedMotion && hitLag && fighter.hitReact > 0 ? (Math.floor(time * 30) % 2 ? 2 : -2) : 0;

    if (fighter.recoveryRoll) this.drawRecoveryTrail(fighter, reducedMotion);
    else this.drawLaunchTrail(fighter, visualTime, reducedMotion);
    if (isBoss) this.drawBossAura(fighter, visualTime, reducedMotion);

    if (knockedDown) {
      const prone = downAirborne ? 1 : smooth(fighter.knockdown / 0.18);
      // One side for the whole knockdown (contact, flight, landing, getting up): the body falls
      // away from the hit, so the head never swaps ends between frames.
      const fall = Math.sign(fighter.hitDirection || 0) || facing;
      const rotation = downAirborne ? Math.PI * 0.38 * fall + (reducedMotion ? 0 : Math.sin(visualTime * 9) * 0.18) : Math.PI / 2 * fall * prone;
      // Live knockdowns are opaque; only corpses are ghosted.
      this.drawCorpse({ x: fighter.x + contactShake, y: fighter.y, z: fighter.z, h, rotation, fall, alpha: 1,
        element: fighter.element, archetype: arch, type: fighter.type, bossPhase: fighter.bossPhase, flutter, drive,
        weapon: fighter.weapon, armorItem: fighter.armorItem });
      if (isPlayer) polygon(ctx, [[fighter.x - 5, fighter.y - 36], [fighter.x + 5, fighter.y - 36], [fighter.x, fighter.y - 30]], color, INK, 1);
      this.drawFighterHealth(fighter, downAirborne ? h : 28);
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

    // A guard spark or parry flash replaces the bubble while it plays.
    if (guarding && !(fighter.guardFx > 0)) {
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
    this.drawBuffs(fighter, h, flutter, 0);

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
    const { hip, shoulder, hand } = pose;
    // While a consumable is used the item rides under the front fist (its track) and a held
    // weapon is stowed on the back, behind the body.
    if (consume && fighter.weapon) {
      const [start, end] = this.stowAxis(pose, fighter.weapon);
      this.drawHeldWeapon(fighter.weapon, start, end, ctx, flutter);
    }
    const holding = consume ? target => drawConsumeHeld(target, consume.kind, consume.variant, pose, flutter)
      : fighter.weapon ? target => {
        const ax = Math.cos(pose.weaponAngle), ay = Math.sin(pose.weaponAngle);
        this.drawHeldWeapon(fighter.weapon, [hand[0] - ax * 23, hand[1] - ay * 23], [hand[0] + ax * 29, hand[1] + ay * 29], target, flutter);
      } : null;
    const action = fighter.action;
    const metrics = this.drawBody(pose, {
      element: fighter.element, color, bodyColor, isBoss, empowered: fighter.bossPhase > 1,
      flutter, speed: travel, stroke, recoil, drive, dizzy, frozen, beforeFrontArm: holding,
      // Archetype extras (src/enemy-art.js): the archer's bow draw through a shot's wind-up, the
      // Ox's chain whirling overhead, the priest's crown of slips while he heals, the warden's
      // brace glint, a freed villager without his cangue.
      archetype: arch, draw: arch === 'hunter' && action?.kind === 'special' && action.t < action.windup ? smooth(action.t / action.windup) : 0,
      spin: arch === 'brute' && action?.variant === 'whirl' && action.t < action.activeUntil, cast: !!fighter.channel, brace,
      freed: !!fighter.freed,
    }, ctx.globalAlpha, arch ? poseBox(pose, ARCHETYPES[arch].pad) : poseBox(pose));
    // The monk's Iron Bell is sized around everything his body drew (read before the next body
    // draw reuses the metrics). It fades in as it goes up and out over its last 0.3 s.
    let bellH = 0, bellW = 0;
    if (fighter.bellTimer > 0) {
      const bell = ironBellSize(metrics, scale);
      bellH = bell.h;
      bellW = bell.w;
    }
    // Metrics are in pose units and reused by the next fighter: convert to world space now.
    const bodyTop = fighter.y + metrics.top * scale;
    const bodyLeft = fighter.x + (facing > 0 ? metrics.left : -metrics.right) * scale;
    const bodyRight = fighter.x + (facing > 0 ? metrics.right : -metrics.left) * scale;
    const headX = fighter.x + contactShake + metrics.headX * scale * facing;
    const headR = metrics.headR * (fighter.element === 'earth' ? 1.9 : 1);
    // A worn jade bracer hugs the lead forearm, over the body like the armour plates.
    if (fighter.armorItem) drawWornArmorArt(ctx, fighter.armorItem, pose.elbow, pose.hand, flutter, flash, fighter.element, isBoss ? 1.14 : 1);
    // Armour plates (an elemental fighter's armoured strike); the Chain Ox's armoured lash keeps
    // its approved look: no overlay, the ARMOR floater tells a blow it shrugged off.
    if (fighter.armor && !arch) {
      const plate = metrics.torso + 3;
      line(ctx, [[shoulder[0] - plate, shoulder[1] + 1], [shoulder[0] - plate, shoulder[1] + 11]], '#d9b65e', 3);
      line(ctx, [[shoulder[0] + plate, shoulder[1] + 1], [shoulder[0] + plate, shoulder[1] + 11]], '#d9b65e', 3);
      circle(ctx, hip[0], hip[1] - 8, 3, '#ecd08b', INK, 1);
    }
    if ((fighter.counterReady || 0) > 0) {
      ctx.save();
      ctx.globalAlpha *= reducedMotion ? 0.8 : 0.7 + Math.sin(visualTime * 9) * 0.2;
      circle(ctx, hand[0], hand[1], 10, null, '#f9df96', 2.5);
      polygon(ctx, [[hand[0] + 12, hand[1] - 6], [hand[0] + 15, hand[1] - 11], [hand[0] + 18, hand[1] - 6], [hand[0] + 15, hand[1] - 1]], '#d6aa4e');
      ctx.restore();
    }
    if (arch) {
      // The archetype's own swing trail in its accent ('whirl': the body draws the orbit; 'bash':
      // the shield rush), at 35% once the strike has connected. The bell, the smoke throw and the
      // hook throw (its chain is the shot) have none.
      const variant = action?.variant;
      if (style && variant !== 'bell' && variant !== 'smoke' && variant !== 'hook') {
        ctx.save();
        if (action?.connected) ctx.globalAlpha *= 0.35;
        drawArchetypeTrail(ctx, arch, pose, stroke, reducedMotion, variant === 'whirl' ? 'whirl' : variant === 'rush' ? 'bash' : '');
        ctx.restore();
      }
    } else this.drawAttackTrail(fighter, pose, style, stroke, reducedMotion);
    ctx.restore();
    this.drawBuffs(fighter, h, flutter, 1);
    let barTop = bodyTop;
    if (arch) {
      barTop = bodyTop - 7;
      if (bellH > 0) {
        const age = ARCHETYPE_RULES.bell.time - fighter.bellTimer;
        drawIronBell(ctx, fighter.x + contactShake, fighter.y, { h: bellH, w: bellW }, Math.min(1, age / 0.15, fighter.bellTimer / 0.3), 0, visualTime, reducedMotion);
        barTop = Math.min(barTop, fighter.y - bellH * IRON_BELL_CROWN - 3);
      }
    }

    // While an ice column holds the fighter it is the ice; the block returns once it cracks.
    if (frozen && !(fighter.iceFx > 0)) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      // The block keeps its old shape and grows only where the drawn body (kasa brim, flame
      // spikes, fists) would poke out of it.
      const left = Math.max(22 * scale, fighter.x - bodyLeft + 4);
      const right = Math.max(23 * scale, bodyRight - fighter.x + 4);
      const top = Math.min(fighter.y - h - 6, bodyTop - 5);
      const tall = fighter.y - top - 6;
      polygon(ctx, [[fighter.x - left * 19 / 22, fighter.y + 1], [fighter.x - left, fighter.y - tall * 0.55], [fighter.x - left * 12 / 22, top],
        [fighter.x + right * 12 / 23, top + 5], [fighter.x + right, fighter.y - tall * 0.48], [fighter.x + right * 19 / 23, fighter.y + 1]], '#c5eafb', '#5f9fb5', 2);
      ctx.globalAlpha = 0.8;
      line(ctx, [[fighter.x - 12 * scale, fighter.y - h * 0.5], [fighter.x - 2 * scale, fighter.y - h * 0.78]], '#efffff', 2);
      line(ctx, [[fighter.x + 7 * scale, fighter.y - 8], [fighter.x + 13 * scale, fighter.y - h * 0.4]], '#efffff', 2);
      ctx.restore();
    }

    if (dizzy && !frozen) {
      ctx.save();
      ctx.fillStyle = '#dfab4d';
      // Orbit just above the drawn head(gear), wide enough to clear a kasa brim.
      const orbit = Math.max(15, headR + 6) * scale;
      for (let i = 0; i < 3; i += 1) {
        const angle = (reducedMotion ? 0 : visualTime * 4) + i * 2.1;
        const x = headX + Math.cos(angle) * orbit;
        const y = bodyTop - 6 + Math.sin(angle) * 5;
        polygon(ctx, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], '#d6a047');
      }
      ctx.restore();
      if (!isPlayer && player && !player.weapon && player.grabTarget == null && fighter.grounded && canBeGrabbed(fighter) &&
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
    let barY = null;
    if (fighter.recoveryRoll) barY = this.drawFighterHealth(fighter, h * 0.62);
    else barY = this.drawFighterHealth(fighter, h, barTop);
    // A bound villager the player's E would free carries the rescue tag (above his bar), and a
    // gauge fills over it while E is held.
    if (arch === 'captive' && !fighter.freed && this.rescueTarget === fighter) {
      let tagY = Math.min(fighter.y - h - 22, bodyTop - 18);
      if (barY != null) tagY = Math.min(tagY, barY - 16);
      drawRescuePrompt(ctx, fighter.x, tagY, visualTime, 'E · FREE', reducedMotion);
      const rescue = player?.rescue?.id === fighter.id ? player.rescue : null;
      if (rescue) {
        // The gauge rides on top of the tag (his HP bar sits under its pointer).
        const k = clamp01(rescue.t / CAPTIVE.hold);
        ctx.save();
        ctx.fillStyle = INK;
        ctx.fillRect(fighter.x - 18, tagY - 16, 36, 5);
        ctx.fillStyle = '#56905d';
        ctx.fillRect(fighter.x - 17, tagY - 15, 34 * k, 3);
        ctx.restore();
      }
    }
    // A sealed fighter carries the priest's slip by the head until the seal lifts (on the side
    // away from a villager's rescue tag beside the player).
    if (fighter.sealed > 0) {
      const side = isPlayer && this.rescueTarget ? (this.rescueTarget.x > fighter.x ? -1 : 1) : facing;
      SEAL_SLIP.x = fighter.x + side * 16 * scale;
      SEAL_SLIP.y = bodyTop - 10;
      SEAL_SLIP.vx = facing;
      ctx.save();
      ctx.globalAlpha = Math.min(1, fighter.sealed * 3);
      drawEnemyProjectile(ctx, SEAL_SLIP, visualTime, reducedMotion);
      ctx.restore();
    }
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
      ctx.strokeStyle = i === 0 ? fighterColor(fighter) : '#c2b48a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBossAura(fighter, time, reducedMotion) {
    const action = fighter.bossAction;
    if (fighter.bossPhase < 2 && !action) return;
    const ctx = this.ctx;
    const h = fighter.h || 104;
    const color = elementColor(fighter.element);
    const transition = action?.stage === 'transition';
    const charge = action?.stage === 'windup' ? clamp01(action.t / Math.max(0.001, action.windup)) : 0;
    ctx.save();
    ctx.globalAlpha = transition ? 0.75 : action ? 0.6 : 0.35;
    const span = h * (transition ? 0.5 : 0.36);
    const rise = reducedMotion ? 0 : Math.sin(time * 3) * 3;
    for (const side of [-1, 1]) {
      elementGlyph(ctx, fighter.element, fighter.x + side * span, fighter.y - h * 0.77 + rise, transition ? 11 : 7 + charge * 3, color, 1.6);
    }
    if (transition) {
      ctx.strokeStyle = '#e6c77c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(fighter.x, fighter.y - h * 0.57, h * 0.6, h * 0.73, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGather(fighter, pose, reducedMotion) {
    const bossCharge = fighter.bossAction?.stage === 'windup';
    const action = bossCharge ? fighter.bossAction : fighter.action;
    // An archetype's wind-up pose is its tell (the bow drawn, the slips gathered, the chain
    // swung back): no elemental gather over it.
    if (fighter.archetype) return;
    if (!action || (!bossCharge && !['special', 'burst'].includes(action.kind)) || action.t >= action.windup) return;
    const ctx = this.ctx;
    const color = fighterColor(fighter);
    const charge = clamp01(action.t / action.windup);
    const radius = 9 + charge * (bossCharge || action.kind === 'burst' ? 16 : 8);
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
      line(ctx, [[x - direction * (length + i * 6), y + lift], [x - direction * 10, y]], i === 1 ? '#fffaf0' : fighterColor(fighter), i === 1 ? 4 : 2);
    }
    ctx.restore();
  }

  drawAttackTrail(fighter, pose, style, stroke, reducedMotion) {
    // A brush slash (engine action.slash, drawn as a vfx) replaces the trail, including every
    // weapon swing.
    if (!style || stroke < 0.035 || fighter.action?.slash || style.trail === 'weapon') return;
    const ctx = this.ctx;
    const color = fighterColor(fighter);
    const contact = pose[style.contact || 'hand'];
    const [x, y] = contact;
    const cast = style.trail === 'cast';
    ctx.save();
    // Contact rule: the trail drops to 35% once the strike has landed (hit or block), so it
    // never stacks over the impact spark.
    ctx.globalAlpha *= stroke * (reducedMotion ? 0.6 : fighter.action?.kind === 'grabPunch' ? 0.65 : 0.9) * (fighter.action?.connected ? 0.35 : 1);
    if (style.angle) {
      ctx.translate(x, y);
      ctx.rotate(style.angle);
      ctx.translate(-x, -y);
    }
    if (style.trail === 'throw') {
      if (!reducedMotion) line(ctx, [[x - 24, y + 3], [x - 5, y]], '#fff8e8', 4);
    } else if (reducedMotion) {
      // Preserve the element and contact cue, without streaming ribbons or orbiting debris.
      if (cast) elementGlyph(ctx, fighter.element, x + 10, y, 11, color, 2);
      else line(ctx, [[x + 4, y - 8], [x + 8, y], [x + 4, y + 7]], color, 4);
    } else if (fighter.element === 'air') {
      // Broad, open crescents follow the palm or rising foot.
      ctx.beginPath();
      if (style.trail === 'rise') {
        ctx.moveTo(-17, -14);
        ctx.bezierCurveTo(45, -13, 48, -53, x, y);
      } else if (style.trail === 'wheel') {
        ctx.moveTo(-29, -17);
        ctx.bezierCurveTo(-38, -70, 29, -84, x, y);
      } else if (style.trail === 'dive') {
        ctx.moveTo(x - 15, y - 68);
        ctx.bezierCurveTo(x + 20, y - 64, x + 28, y - 15, x, y);
      }
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
      if (style.trail === 'redirect') {
        ctx.moveTo(-21, -12);
        ctx.bezierCurveTo(-27, -43, 36, -26, x + 1, y);
      } else if (style.trail === 'flow') {
        ctx.moveTo(-11, -59);
        ctx.bezierCurveTo(27, -67, 65, -44, x + 3, y + 3);
      } else if (style.trail === 'pull') {
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

  // top: optional world y of the drawn headgear; the bar stays at least 6px above it.
  // An archetype's bar takes its own bar colour (the Chain Ox's is 48 px wide); a bandit hidden
  // in his smoke shows none. Returns the bar's top, or null when none is drawn.
  drawFighterHealth(fighter, h, top = Infinity) {
    const ctx = this.ctx;
    const isBoss = fighter.type === 'boss';
    const arch = fighter.archetype ? ARCHETYPES[fighter.archetype] : null;
    if (arch && fighter.smokeTimer > 0) return null;
    if (fighter.team !== 'player' && fighter.maxHp > 0 && (fighter.hp < fighter.maxHp || isBoss)) {
      const width = isBoss ? 72 : fighter.archetype === 'brute' ? 48 : 36;
      const barY = Math.min(fighter.y - h - (isBoss ? 33 : 15), top - 6);
      ctx.fillStyle = INK;
      ctx.fillRect(fighter.x - width / 2, barY, width, 5);
      ctx.fillStyle = arch ? arch.bar : elementColor(fighter.element);
      ctx.fillRect(fighter.x - width / 2 + 1, barY + 1, (width - 2) * Math.max(0, fighter.hp / fighter.maxHp), 3);
      return barY;
    }
    return null;
  }

  drawProjectile(projectile, time, reducedMotion = false) {
    const ctx = this.ctx;
    // Archetype shots (arrows, talisman, chain hook, smoke pellet) are src/enemy-art.js drawings;
    // their floor shadow went in the shadow pass.
    if (ENEMY_PROJECTILES.has(projectile.kind)) {
      ctx.globalAlpha = 1;
      ENEMY_SHOT.kind = projectile.kind;
      ENEMY_SHOT.x = projectile.x;
      ENEMY_SHOT.y = projectile.y;
      ENEMY_SHOT.vx = projectile.vx;
      ENEMY_SHOT.vy = (projectile.vy || 0) + (projectile.vDepth || 0);
      ENEMY_SHOT.ox = projectile.ox;
      ENEMY_SHOT.oy = projectile.oy;
      drawEnemyProjectile(ctx, ENEMY_SHOT, time, reducedMotion);
      return;
    }
    const r = projectile.r || 9;
    const color = elementColor(projectile.element);
    // Screen-space velocity: depth travel moves the ball down the screen too.
    const vx = projectile.vx || 1;
    const vy = (projectile.vy || 0) + (projectile.vDepth || 0);
    const angle = Math.atan2(vy, vx);
    if (projectile.kind !== 'weapon') {
      // The inked element trail (bends by projectile.turn for steering balls) replaces the
      // body's own tail bits.
      const trailR = Math.min(r, TRAIL_R[projectile.element] ?? TRAIL_R_DEFAULT);
      const back = r - trailR;
      TRAIL_P.vx = vx; TRAIL_P.vy = vy; TRAIL_P.element = projectile.element; TRAIL_P.r = trailR;
      TRAIL_P.turn = projectile.turn || 0; TRAIL_P.reduced = reducedMotion;
      ctx.globalAlpha = 1;
      fxProjectileTrail(ctx, projectile.x - Math.cos(angle) * back, projectile.y - Math.sin(angle) * back,
        reducedMotion ? 0 : (time * 2.5) % 1, TRAIL_P);
    }
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    if (projectile.kind === 'weapon') {
      // The art aims itself along the screen velocity and mirrors leftward flight (blades and
      // tassels stay upright, a rolling mill stone turns the way it rolls); spin is the
      // accumulated WEAPON_ART[kind].spin, stilled under reduced motion.
      const art = WEAPON_ART[projectile.weapon] ? projectile.weapon : 'staff';
      drawThrownWeaponArt(ctx, art, reducedMotion ? 0 : (projectile.spin0 || 0) + time * WEAPON_ART[art].spin,
        reducedMotion ? 0 : time, vx, vy);
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    ctx.globalAlpha = 0.16;
    circle(ctx, 0, 0, r * 2.2, color);
    ctx.globalAlpha = 1;
    if (projectile.element === 'earth') {
      if (!reducedMotion) ctx.rotate(time * 5);
      polygon(ctx, [[-r, -r * 0.6], [-r * 0.2, -r], [r * 0.85, -r * 0.7], [r, r * 0.2], [r * 0.3, r], [-r * 0.8, r * 0.8]], '#aab27a', INK, 2);
      line(ctx, [[-r * 0.5, -r * 0.4], [r * 0.2, -r * 0.55], [r * 0.5, 0]], '#e5dfb7', 2);
    } else if (projectile.element === 'fire') {
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
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-i * 6, 0, r * (0.8 + i * 0.23), -1.05, 1.05);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawParticle(particle, reducedMotion = false) {
    if (EFFECT_PARTICLE_KINDS.has(particle.kind)) {
      this.drawEffect(particle, reducedMotion);
      return;
    }
    const ctx = this.ctx;
    if (WEAPON_PARTICLE_KINDS.has(particle.kind)) {
      // Broken weapons (src/weapon-art.js): the snap puff and the lantern burst play out from
      // their life; debris pieces spin about their middles and fade over their last 40%.
      // Reduced motion keeps the puff and the burst and drops the flying debris.
      if (particle.kind === 'shard' && reducedMotion) return;
      const p = clamp01(1 - particle.life / (particle.maxLife || 1));
      ctx.save();
      ctx.translate(particle.x, particle.y);
      if (particle.scale && particle.scale !== 1) ctx.scale(particle.scale, particle.scale);
      if (particle.kind === 'shard') {
        if (particle.flip < 0) ctx.scale(-1, 1);
        ctx.rotate(particle.rot || 0);
        ctx.globalAlpha = clamp01(particle.life / ((particle.maxLife || 1) * 0.4));
        drawWeaponShardArt(ctx, particle.weapon, particle.index);
      } else if (particle.kind === 'lanternBurst') drawLanternBurst(ctx, p);
      else drawWeaponBreakPuff(ctx, p);
      ctx.restore();
      return;
    }
    const alpha = Math.min(1, Math.max(0, particle.life / (particle.maxLife || 0.6)));
    const size = particle.size || 3;
    ctx.save();
    ctx.globalAlpha = alpha;
    circle(ctx, particle.x, particle.y, size * (0.5 + alpha * 0.5), particle.color || PAPER);
    ctx.restore();
  }

  drawEffect(effect, reducedMotion = false) {
    if (effect.kind === 'vfx') {
      this.drawVfx(effect, undefined, reducedMotion);
      return;
    }
    if (effect.kind === 'consume') {
      this.drawConsumeEffect(effect, reducedMotion);
      return;
    }
    if (ENEMY_GROUND_EFFECTS.has(effect.kind) || ENEMY_POST_EFFECTS.has(effect.kind)) {
      this.ctx.globalAlpha = 1;
      drawEnemyEffect(this.ctx, effect, this.time || 0, reducedMotion);
      return;
    }
    const ctx = this.ctx;
    const remaining = Math.min(1, Math.max(0, effect.life / (effect.maxLife || 0.6)));
    if (effect.kind === 'signature') {
      this.drawSignature(effect, remaining, reducedMotion);
      return;
    }
    if (effect.kind === 'impact' || effect.kind === 'slash' || effect.kind === 'shockwave') {
      this.drawLegacyEffect(effect, 1 - remaining, reducedMotion);
      return;
    }
    // Generic expanding ring (kind 'ring' and any unknown kind).
    const radius = effect.r || effect.radius || 80;
    const expansion = radius * (0.25 + (1 - remaining) * 0.75);
    ctx.save();
    ctx.globalAlpha = remaining * 0.13;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion, expansion, 0, 0, Math.PI * 2);
    ctx.fillStyle = effect.color || COLORS.air;
    ctx.fill();
    ctx.globalAlpha = remaining * 0.85;
    ctx.strokeStyle = effect.color || COLORS.air;
    ctx.lineWidth = remaining * 5 + 1;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion, expansion, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = remaining * 0.5;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion * 0.8, expansion * 0.8, 0, 0, Math.PI * 2);
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

  // Pre-vfx effect kinds keep working through the ink set: 'impact' (impactKind hit / block /
  // parry, with the element layer under hit sparks), 'slash' and 'shockwave' (landing dust).
  drawLegacyEffect(effect, t, reducedMotion) {
    const ctx = this.ctx;
    const p = vfxParams({ dir: effect.direction < 0 ? -1 : 1, element: effect.element, heavy: !!effect.heavy,
      seed: effect.seed || 0, variant: effect.heavy ? 'heavy' : 'light' }, NO_PARAMS, undefined, reducedMotion);
    ctx.globalAlpha = 1;
    if (effect.kind === 'shockwave') {
      p.heavy = true;
      fxDustLand(ctx, effect.x, effect.y, t, p);
    } else if (effect.kind === 'slash') fxSlash(ctx, effect.x, effect.y, t, p);
    else if (effect.impactKind === 'block') fxGuardSpark(ctx, effect.x, effect.y, t, p);
    else if (effect.impactKind === 'parry') fxParryFlash(ctx, effect.x, effect.y, t, p);
    else {
      const layer = VFX[effect.element];
      if (layer) layer.draw(ctx, effect.x, effect.y, t, p);
      (effect.heavy ? fxHitHeavy : fxHitLight)(ctx, effect.x, effect.y, t, p);
    }
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

  // Corpses and knockdowns: the fighter's own build lying down. fall (+-1) is the side the
  // head falls towards. The body is flipped by it, so at rotation fall * PI/2 its limbs and
  // cloth (local +x) face the floor, and it is lifted and shifted by how far it lies, so a
  // lying body rests on the floor centred over its shadow. Corpses are ghosted (alpha <= 0.85).
  drawCorpse(corpse) {
    const ctx = this.ctx;
    const scale = (corpse.h || 66) / 66;
    const fall = corpse.fall < 0 ? -1 : 1;
    const rotation = corpse.rotation || 0;
    const lie = clamp01(Math.sin(rotation) * fall);
    const alpha = corpse.alpha ?? Math.min(0.85, Math.max(0, corpse.life));
    if (!(alpha > 0)) return;
    // Cloth streams while the body is up in the air and settles as it comes down (no snap).
    const drive = Number.isFinite(corpse.drive) ? corpse.drive : 0.8 * clamp01(((corpse.z || 0) - 2) / 18);
    ctx.save();
    ctx.translate(corpse.x - fall * 13 * lie * scale, corpse.y - (8 + 7 * lie) * scale);
    ctx.rotate(rotation);
    ctx.scale(scale * fall, scale);
    // A live knockdown (weapon, armorItem) keeps its held weapon under the front fist and its
    // worn bracer on the forearm; a lit lantern stays visible while its fuse burns.
    const flutter = corpse.flutter || 0, isBoss = corpse.type === 'boss';
    if (corpse.archetype) {
      // An archetype lies in its own KO silhouette (the body swaps in ARCHETYPE_KO for KO_POSE),
      // with its gear on the floor unless it became a pickup (dropped).
      this.drawBody(KO_POSE, { archetype: corpse.archetype, color: fighterColor(corpse), ko: true, recoil: 1, flutter, drive,
        dropped: !!corpse.dropped }, alpha, ARCHETYPE_KO_BOX);
      ctx.restore();
      return;
    }
    const holding = corpse.weapon ? target => this.drawHeldWeapon(corpse.weapon, KO_WEAPON[0], KO_WEAPON[1], target, flutter) : null;
    this.drawBody(KO_POSE, {
      element: corpse.element, color: elementColor(corpse.element), isBoss, empowered: corpse.bossPhase > 1,
      ko: true, recoil: 1, flutter, drive, beforeFrontArm: holding,
    }, alpha, KO_BOX);
    if (corpse.armorItem) drawWornArmorArt(ctx, corpse.armorItem, KO_POSE.elbow, KO_POSE.hand, flutter, false, corpse.element, isBoss ? 1.14 : 1);
    ctx.restore();
  }

  // Draws a fighter body at the current transform. A translucent body (invulnerability blink,
  // ghosted corpse) is drawn opaque into one reused offscreen layer and composited once: drawn
  // directly, each of its ~20 overlapping fills would blend on its own and the parts would show
  // through each other (the neck through the face, joints doubled). box: [x0, y0, x1, y1]
  // around the body in the current local (pose) units. Returns drawFighterBody's metrics.
  drawBody(pose, options, alpha, box) {
    const ctx = this.ctx;
    const drawBodyArt = options.archetype ? drawArchetypeBody : drawFighterBody;
    if (alpha >= 1 || typeof document === 'undefined') return drawBodyArt(ctx, pose, options);
    const m = ctx.getTransform();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i += 1) {
      const x = i & 1 ? box[2] : box[0], y = i & 2 ? box[3] : box[1];
      const px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.canvas.width, Math.ceil(x1)); y1 = Math.min(this.canvas.height, Math.ceil(y1));
    const w = x1 - x0, hgt = y1 - y0;
    if (w <= 0 || hgt <= 0) return drawBodyArt(ctx, pose, options); // off screen: metrics only
    if (!this.layer) {
      this.layer = document.createElement('canvas');
      this.layerCtx = this.layer.getContext('2d');
    }
    const layer = this.layer, lc = this.layerCtx;
    if (layer.width < w) layer.width = w;
    if (layer.height < hgt) layer.height = hgt;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1;
    lc.clearRect(0, 0, w, hgt);
    lc.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    const metrics = drawBodyArt(lc, pose, options);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, 0, w, hgt, x0, y0, w, hgt);
    ctx.restore();
    return metrics;
  }

  drawEdgeDetails(state, key) {
    if (state.settings?.mode === 'story' && !state.stage) return;
    const ctx = this.ctx;
    const arena = typeof state.arena === 'object' ? state.arena : ARENAS[key];
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = INK;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    if (!state.stage) ctx.fillText((arena?.name || 'Elemental sanctuary').toUpperCase(), 23, HEIGHT - 20);
    ctx.textAlign = 'right';
    const stage = state.stage;
    if (!stage) ctx.fillText('FIND YOUR OPENING', WIDTH - 23, HEIGHT - 20);
    if (stage) {
      const start = WIDTH / 2 - 90, end = WIDTH / 2 + 90, y = HEIGHT - 23;
      ctx.globalAlpha = .45;
      line(ctx, [[start, y], [end, y]], INK, 2);
      for (let i = 0; i < stage.encounters; i++) {
        const complete = i < stage.encounter || i === stage.encounter && stage.phase !== 'fight';
        circle(ctx, start + i * 90, y, 5, complete ? INK : PAPER, INK, 1.5);
      }
      ctx.globalAlpha = 1;
      const progress = clamp01((state.player.x - 30) / Math.max(1, stage.width - 60));
      polygon(ctx, [[start + progress * 180, y - 13], [start + progress * 180 - 4, y - 20], [start + progress * 180 + 4, y - 20]], INK);
    }
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
