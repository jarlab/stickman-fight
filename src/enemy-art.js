// Fourfold enemy archetypes (src/enemy-art.js): the drawing code of the seven non-elemental
// foes, ported from the approved preview block (output/asset-previews/enemies-assets.js, between
// its ASSETS START / END markers). The geometry, palette and performance characteristics are the
// preview's; the only change is that the construction helpers the preview mirrored one-to-one
// (capsule, cloth ribbon, toe, along/toward, extent, colour mix) are imported from
// src/fighter-art.js instead of copied, as the integration notes ask.
import { INK, PAPER, FLASH, KO_POSE, clothDrive, wxClothState, wxMix as arMix, wxCapsuleXY as arCapsule, wxTail as arTail,
  wxAlong as arAlong, wxToward as arToward, wxToe as arToe, wxExtend as arExtend } from './fighter-art.js';

// Fourfold enemy archetypes: seven original non-elemental foes in the "Wuxia Silhouettes"
// style. Bodies use the same construction as drawFighterBody (tapered capsules unioned into
// one nonzero fill per limb chain, ink limbs, paper head and fists, 2.3 head stroke, 1.4 fist
// stroke). They do not call drawFighterBody itself because its element headgear (crest,
// bun, kasa, flame hair) is each element's identity; archetypes get their own heads and gear
// so they never read as a fifth colourway of an element.
//
// drawArchetypeBody(ctx, pose, o) -> metrics (same contract as drawFighterBody)
//   pose: fighterPose() joints (feet origin, -y up, facing +x); the caller applies
//     translate/scale and the facing flip. pose.weaponAngle aims the archetype's weapon.
//     Passing fighter-art's KO_POSE with o.ko swaps in the archetype's own KO skeleton.
//   o.archetype  'bandit' | 'hunter' | 'brute' | 'sorcerer' | 'guard' | 'monk' | 'captive'
//   o.bodyColor  hit flash only when it is FLASH (or differs from o.color): Renderer.drawFighter
//     passes color/bodyColor = elementColor(undefined) (air teal) for element-less fighters, and
//     that must NOT read as a flash. o.flutter (s), o.speed, o.stroke, o.recoil, o.drive, o.ko,
//     o.dizzy, o.frozen as drawFighterBody;
//   o.draw   hunter bow draw 0..1 (string + nocked arrow follow the rear hand)
//   o.spin   brute chain whirls overhead instead of hanging from the fist
//   o.cast   sorcerer: orbiting talismans rise into a crown (heal / summon)
//   o.brace  guard 0..1: shield-rim glint while an attacker is in front (frontal block tell)
//   o.freed  captive: cangue, lashings and notice slip are gone (draw a 'freedBurst' once)
//   o.dropped  KO only: the weapon became a real pickup (monk staff), so the corpse has none
// Returns a reused metrics object in pose units: top, left, right, torso, headX, headY, headR,
// gearTop (highest drawn point incl. raised weapons / slips).
//
// drawArchetypeTrail(ctx, kind, pose, stroke, reducedMotion, variant)  local pose units, after
//   the body: the archetype's swing trail in its accent colour (replaces drawAttackTrail, which
//   is element-coloured). variant 'whirl' (brute: the body draws its own orbit) | 'bash'
//   (guard shield rush).
// drawEnemyProjectile(ctx, p, time, reducedMotion)  world space; p.kind 'arrow' | 'talisman' |
//   'chainHook' | 'smokePellet', p.x/p.y/p.vx/p.vy (and p.ox/p.oy, the thrower's fist, for
//   'chainHook'). drawEnemyProjectileShadow(ctx, p) puts its floor shadow at p.depth.
// drawEnemyEffect(ctx, e, time, reducedMotion)  world space; e.kind 'healSigil' | 'stuckArrow' |
//   'smokePuff' (ground pass) | 'healTether' | 'ironBell' | 'shieldClang' | 'freedBurst' (post
//   pass, see ENEMY_POST_EFFECTS); e.life/e.maxLife fade it.
// ironBellSize(metrics, scale) + drawIronBell(ctx, x, y, size, k, ring, time, reducedMotion):
//   the monk's Iron Bell sized around everything he draws (staff included).
// drawRescuePrompt(ctx, x, y, time, text, reducedMotion)  bobbing "free the captive" tag.
//
// Performance: no gradients, no shadowBlur; tints and mixes are cached / module constants;
// capsule lists, ribbon buffers, scratch points and metrics are module-level and reused (no
// per-draw arrays or closures); sub-pixel details only draw at >= 1.3 device px per pose unit.

const AR_TAU = Math.PI * 2;
const AR_INK_REAR = '#4f625f';
const AR_STEEL = '#e4eae5';
const AR_STEEL_MID = '#a9b5b1';
const AR_IRON = '#55636a';
const AR_IRON_DK = '#3a474c';
const AR_WOOD = '#caa36b';
const AR_WOOD_DK = '#8f6a3e';
const AR_ROPE = '#bf9c62';
const AR_LEATHER = '#6e5439';
const AR_SILVER = '#e2ddcf';
const AR_SLIP = '#f1df92';
const AR_SEAL = '#b4483d';
const AR_BEAD = '#e9d9aa';
const AR_BRASS = '#c6a04e';
const AR_TASSEL = '#9c3a44';
const AR_ARMOR = '#9aa8b0';
const AR_HELM = '#b5c0c4';
const AR_SKIN = '#efe3c9'; // brute's bare torso: toned paper so it is not the brightest thing on screen
const AR_SKIN_BACK = '#d8c6a2'; // its rear (back) half; faces up when he lies face down
const AR_PUTTEE = '#cbbfa3', AR_PUTTEE_REAR = '#8e866f', AR_PUTTEE_LINE = '#857d68';

// Identity colours sit in the hue gaps between the elements (air 178deg, water 210deg,
// earth 40deg, fire 10deg): moss, violet, plum, wine, rust, plus neutral steel and hemp.
// color = cloth; bar = HP-bar fill (lighter: >= 3.2:1 against the INK frame, like the element
//   bars' 2.7-3.0:1, and >= 22 deltaE from every other bar incl. the four elements);
// accent = swing trails, guard bubble, gather/launch trails (replaces elementColor);
// pad = poseBox() pad for drawBody's alpha layer (the brute's chain reaches ~86 units).
export const ARCHETYPES = {
  bandit:   { name: 'Road Cutthroat',  color: '#8a5577', bar: '#b67cb6', accent: '#a7b2ae', h: 64, hpClass: 'Light',   pad: 50 },
  hunter:   { name: 'Reed Archer',     color: '#5d8a3c', bar: '#76a24a', accent: '#76a24a', h: 66, hpClass: 'Light',   pad: 50 },
  brute:    { name: 'Chain Ox',        color: '#8a5038', bar: '#c4896a', accent: '#7b858a', h: 82, hpClass: 'Heavy',   pad: 92 },
  sorcerer: { name: 'Talisman Priest', color: '#6c5aa8', bar: '#8c84dc', accent: '#8c84dc', h: 68, hpClass: 'Light',   pad: 54 },
  guard:    { name: 'Gate Warden',     color: '#7d8e98', bar: '#a9bdc6', accent: '#a9bdc6', h: 68, hpClass: 'Medium+', pad: 50 },
  monk:     { name: 'Mendicant Monk',  color: '#93425a', bar: '#d0627e', accent: '#c6a04e', h: 66, hpClass: 'Medium',  pad: 60 },
  captive:  { name: 'Bound Villager',  color: '#cbbb92', bar: '#d6c79c', accent: '#bf9c62', h: 60, hpClass: 'Fragile', pad: 50 },
};

// Half-widths in pose units (same meaning as fighter-art BUILDS).
const AR_BUILDS = {
  bandit:   { leg: [2.6, 2.15, 1.7], arm: [2.3, 1.9, 1.55], torso: [3.8, 2.7], head: 8.3, neck: 0.2,  hand: 3.0, foot: 5.4, jut: 1.5 },
  hunter:   { leg: [2.8, 2.3, 1.85], arm: [2.4, 2.0, 1.6],  torso: [4.0, 3.0], head: 8.5, neck: 0.8,  hand: 2.9, foot: 5.5 },
  brute:    { leg: [5.0, 4.3, 3.5],  arm: [5.2, 4.4, 3.6],  torso: [10.0, 6.0], head: 8.0, neck: 0.6, hand: 5.2, foot: 6.8, jut: 5.0 },
  sorcerer: { leg: [2.4, 2.0, 1.6],  arm: [2.2, 1.85, 1.5], torso: [3.5, 3.2], head: 8.4, neck: 1.4,  hand: 2.8, foot: 5.2 },
  guard:    { leg: [3.4, 2.9, 2.4],  arm: [3.2, 2.7, 2.2],  torso: [5.4, 3.8], head: 8.8, neck: -0.6, hand: 3.4, foot: 6.0 },
  monk:     { leg: [3.2, 2.7, 2.2],  arm: [3.0, 2.5, 2.1],  torso: [5.0, 3.7], head: 9.2, neck: -0.4, hand: 3.4, foot: 5.6 },
  captive:  { leg: [2.3, 1.95, 1.6], arm: [2.1, 1.75, 1.45], torso: [3.4, 2.6], head: 8.4, neck: 0.8, hand: 2.7, foot: 5.0 },
};

// Pose overrides in the FIGHTING_STANCES / COMBO_POSES format (poseWith semantics: lean/drop
// rebuild hip/shoulder/head, any named joint replaces the base joint). stance = idle,
// run = arm/weapon carry over the shared run cycle, wind/strike = the signature attack,
// special = the archetype's secondary state (smoke escape, volley, whirl, heal, bash, bell, freed),
// hit = optional weapon angle while recoiling (keeps long weapons out of the floor).
export const ARCHETYPE_POSES = {
  bandit: {
    stance: { lean: 7, drop: 5, rearFoot: [-19, -1], frontFoot: [17, -1], rearKnee: [-13, -14], frontKnee: [16, -15], rearElbow: [-3, -33], rearHand: [9, -36], elbow: [17, -36], hand: [24, -45], weaponAngle: -0.85 },
    run: { lean: 11, drop: 3, elbow: [3, -36], hand: [-7, -43], weaponAngle: -2.55, rearElbow: [14, -34], rearHand: [23, -38] },
    wind: { lean: -4, drop: 3, elbow: [-3, -53], hand: [-7, -64], weaponAngle: -2.5, rearElbow: [11, -36], rearHand: [21, -40], rearFoot: [-19, -1], frontFoot: [19, -1] },
    strike: { lean: 14, drop: 8, elbow: [26, -40], hand: [38, -33], weaponAngle: 0.6, rearElbow: [-9, -36], rearHand: [-20, -31], rearFoot: [-25, -1], frontFoot: [25, -1], frontKnee: [22, -15], rearKnee: [-15, -12] },
    special: { lean: -8, drop: 2, rearElbow: [5, -31], rearHand: [15, -22], elbow: [-6, -45], hand: [-15, -52], weaponAngle: -2.3, frontFoot: [15, -1], rearFoot: [-23, -5], rearKnee: [-14, -15] },
  },
  hunter: {
    stance: { lean: -2, rearFoot: [-15, -1], frontFoot: [16, -1], elbow: [13, -35], hand: [22, -37], rearElbow: [-8, -33], rearHand: [1, -36], weaponAngle: 0.45 },
    run: { lean: 7, elbow: [11, -35], hand: [17, -29], weaponAngle: 1.0, rearElbow: [-14, -35], rearHand: [-19, -29] },
    wind: { lean: -3, rearFoot: [-17, -1], frontFoot: [18, -1], elbow: [17, -45], hand: [31, -47], rearElbow: [-13, -47], rearHand: [1, -47], weaponAngle: 0 },
    strike: { lean: -1, rearFoot: [-17, -1], frontFoot: [18, -1], elbow: [17, -45], hand: [32, -47], rearElbow: [-15, -49], rearHand: [-25, -51], weaponAngle: 0 },
    special: { lean: -7, rearFoot: [-17, -1], frontFoot: [17, -1], elbow: [13, -53], hand: [24, -62], rearElbow: [-10, -45], rearHand: [4, -43], weaponAngle: -0.75 },
  },
  brute: {
    stance: { lean: 4, drop: 5, rearFoot: [-22, -1], frontFoot: [21, -1], rearKnee: [-15, -13], frontKnee: [16, -14], rearElbow: [-17, -30], rearHand: [-12, -20], elbow: [20, -31], hand: [27, -24], weaponAngle: 1.15 },
    run: { lean: 9, drop: 4, elbow: [5, -34], hand: [-5, -27], rearElbow: [16, -36], rearHand: [26, -31], weaponAngle: 2.6 },
    hit: { weaponAngle: 2.2 },
    wind: { lean: -6, drop: 3, elbow: [5, -55], hand: [-3, -67], rearElbow: [11, -36], rearHand: [19, -34], weaponAngle: -2.35, rearFoot: [-22, -1], frontFoot: [22, -1] },
    strike: { lean: 13, drop: 6, elbow: [26, -40], hand: [40, -38], rearElbow: [-12, -34], rearHand: [-22, -28], weaponAngle: 0.08, rearFoot: [-25, -1], frontFoot: [25, -1], frontKnee: [21, -14] },
    special: { lean: -2, drop: 4, elbow: [10, -58], hand: [6, -74], rearElbow: [-17, -34], rearHand: [-14, -24], weaponAngle: 0, rearFoot: [-23, -1], frontFoot: [22, -1] },
  },
  sorcerer: {
    stance: { lean: -2, rearFoot: [-12, -1], frontFoot: [13, -1], rearKnee: [-8, -15], frontKnee: [8, -15], rearElbow: [-8, -35], rearHand: [-1, -41], elbow: [15, -40], hand: [25, -46] },
    run: { lean: 6, elbow: [5, -35], hand: [-4, -30], rearElbow: [-14, -35], rearHand: [-24, -32] },
    wind: { lean: -6, drop: 2, rearElbow: [-14, -40], rearHand: [-19, -52], elbow: [4, -49], hand: [11, -60] },
    strike: { lean: 8, drop: 1, elbow: [24, -44], hand: [40, -46], rearElbow: [-10, -36], rearHand: [-18, -30], frontFoot: [18, -1], rearFoot: [-15, -1] },
    special: { lean: -3, elbow: [16, -53], hand: [20, -67], rearElbow: [-14, -47], rearHand: [-19, -60] },
  },
  guard: {
    stance: { lean: 1, drop: 3, rearFoot: [-18, -1], frontFoot: [18, -1], rearKnee: [-12, -14], frontKnee: [14, -14], elbow: [14, -33], hand: [20, -40], rearElbow: [-15, -41], rearHand: [-11, -52], weaponAngle: -1.4 },
    run: { lean: 6, elbow: [16, -34], hand: [23, -39], rearElbow: [-14, -38], rearHand: [-19, -45], weaponAngle: -2.3 },
    wind: { lean: -4, drop: 3, elbow: [14, -33], hand: [20, -40], rearElbow: [-8, -51], rearHand: [-2, -65], weaponAngle: -2.35 },
    strike: { lean: 9, drop: 5, elbow: [13, -32], hand: [18, -38], rearElbow: [15, -45], rearHand: [31, -47], weaponAngle: 0.28, frontFoot: [21, -1], rearFoot: [-20, -1] },
    special: { lean: 12, drop: 5, elbow: [22, -38], hand: [32, -41], rearElbow: [-12, -41], rearHand: [-14, -52], weaponAngle: -1.6, frontFoot: [22, -1], rearFoot: [-24, -1] },
  },
  monk: {
    stance: { lean: 0, drop: 3, rearFoot: [-17, -1], frontFoot: [17, -1], rearKnee: [-12, -14], frontKnee: [12, -14], elbow: [14, -32], hand: [21, -36], rearElbow: [3, -37], rearHand: [9, -47], weaponAngle: -1.42 },
    run: { lean: 7, elbow: [11, -33], hand: [17, -33], weaponAngle: 0.2, rearElbow: [-12, -34], rearHand: [-18, -28] },
    wind: { lean: -5, drop: 3, elbow: [-4, -40], hand: [-10, -43], rearElbow: [10, -37], rearHand: [17, -42], weaponAngle: 0.04 },
    strike: { lean: 12, drop: 4, elbow: [24, -42], hand: [36, -44], rearElbow: [10, -39], rearHand: [19, -43], weaponAngle: 0.03, frontFoot: [24, -1], rearFoot: [-22, -1] },
    // Iron Bell: deep horse stance, staff planted upright close to the body (butt on the floor)
    // so the bell can close around everything; rear palm raised in a one-hand salute.
    special: { lean: 0, drop: 9, rearFoot: [-22, -1], frontFoot: [22, -1], rearKnee: [-15, -12], frontKnee: [15, -12], elbow: [8, -25], hand: [12, -32], rearElbow: [-3, -30], rearHand: [4, -43], weaponAngle: -1.5708 },
    hit: { weaponAngle: -0.3 },
  },
  captive: {
    stance: { hip: [-3, -16], shoulder: [1, -33], head: [3, -45], frontKnee: [8, -3], frontFoot: [-9, -1], rearKnee: [1, -3], rearFoot: [-15, -1], elbow: [9, -28], hand: [14, -33], rearElbow: [4, -28], rearHand: [10, -33] },
    run: { lean: 6, drop: 3, rearFoot: [-9, -5], frontFoot: [9, -1], rearKnee: [-6, -16], frontKnee: [7, -16], elbow: [11, -37], hand: [15, -43], rearElbow: [6, -37], rearHand: [11, -42] },
    wind: { lean: -7, drop: 4, elbow: [7, -39], hand: [9, -45], rearElbow: [1, -38], rearHand: [5, -44], rearFoot: [-16, -1], frontFoot: [10, -1] },
    strike: { lean: 3, drop: 1, head: [6, -59], elbow: [11, -37], hand: [15, -43], rearElbow: [6, -37], rearHand: [11, -42], rearFoot: [-10, -1], frontFoot: [11, -1] },
    special: { lean: -2, drop: -1, elbow: [12, -53], hand: [18, -65], rearElbow: [-10, -53], rearHand: [-16, -65], rearFoot: [-12, -1], frontFoot: [12, -1] },
  },
};

// Knocked-down skeletons, one per archetype, in fighter-art's KO_POSE frame (drawn upright and
// rotated +-90deg by drawCorpse: local +x faces the floor, which is at local x = +15). Built
// once at load. drawArchetypeBody swaps them in when it is handed KO_POSE with o.ko.
function arKo(ov) {
  const p = {};
  for (const key of Object.keys(KO_POSE)) {
    const v = Object.hasOwn(ov, key) ? ov[key] : KO_POSE[key];
    p[key] = Array.isArray(v) ? [v[0], v[1]] : v;
  }
  return p;
}
export const ARCHETYPE_KO = {
  // sprawled, front arm flung out along the floor past the head; the cleaver lies beyond it
  bandit: arKo({ elbow: [13, -33], hand: [13, -47], rearElbow: [4, -25], rearHand: [9, -16], frontKnee: [13, -2], frontFoot: [13, 9], rearKnee: [1, -3], rearFoot: [8, 9] }),
  // flat, both arms down; the bow lies under him
  hunter: arKo({ elbow: [12, -23], hand: [13, -12] }),
  // face down (his shaded back faces the sky), arm stretched toward the ball and chain
  brute: arKo({ hip: [7, -12], shoulder: [7, -31], head: [9, -43], elbow: [13, -18], hand: [13, -5], rearElbow: [1, -40], rearHand: [6, -52], frontKnee: [13, 0], frontFoot: [12, 11] }),
  // cap knocked off beyond the head, slips scattered
  sorcerer: arKo({ rearElbow: [5, -38], rearHand: [11, -47] }),
  // slumped across his own shield, sword dropped past his head
  guard: arKo({ hip: [6, -12], shoulder: [5, -31], head: [6, -43], elbow: [11, -24], hand: [13, -15] }),
  // laid along his staff
  monk: arKo({ elbow: [12, -24], hand: [13, -14], rearElbow: [4, -38], rearHand: [10, -46] }),
  // curled up, knees to chest, hands over the face
  captive: arKo({ hip: [8, -12], shoulder: [7, -31], head: [7, -43], frontKnee: [13, -25], frontFoot: [13, -10], rearKnee: [8, -24], rearFoot: [9, -9], elbow: [13, -29], hand: [11, -39], rearElbow: [6, -35], rearHand: [6, -44] }),
};
// [x0, y0, x1, y1] around every archetype KO drawing incl. dropped gear (pose units, margin).
export const ARCHETYPE_KO_BOX = [-26, -86, 36, 36];

const AR_S = { A: [0, 0, 0], L: [0, 0, 0], T: [0, 0] }; // per-draw state, reused
const AR_M = { top: 0, left: 0, right: 0, torso: 0, headX: 0, headY: 0, headR: 0 };
const AR_SEG = new Float64Array(6 * 8);
let arSegN = 0;
const AR_P = [0, 0], AR_Q = [0, 0], AR_R = [0, 0], AR_U = [0, 0]; // scratch points
const AR_FTOE = [0, 0], AR_RTOE = [0, 0];
let arOutline = false; // hit flash: gear strokes take the limbs' ink outline (cloth: wxClothState)
const AR_DASH = [5, 4], AR_NODASH = [];

// ---- shared construction helpers -------------------------------------------------------
// The capsule, cloth ribbon (with its optional ink edge), toe, along/toward, extent and colour
// mix helpers are fighter-art's own (imported above as ar* aliases), so stroke weights and the
// flash outline cannot drift apart. What stays here is archetype-only: the flat segment buffer
// (arSeg/arSegFill), gear bands, the spine frame point, the tint cache (its own mixes: deep 0.5,
// light 0.45), the talisman slip and the chain.
const arLen = (x, y) => Math.sqrt(x * x + y * y);
const arFin = v => (Number.isFinite(v) ? v : 0);
const arClamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const AR_TINTS = new Map();
function arTints(color) {
  let s = AR_TINTS.get(color);
  if (!s) {
    if (AR_TINTS.size >= 32) AR_TINTS.clear();
    s = { rear: arMix(color, INK, 0.3), deep: arMix(color, INK, 0.5), light: arMix(color, PAPER, 0.45) };
    AR_TINTS.set(color, s);
  }
  return s;
}
for (const spec of Object.values(ARCHETYPES)) arTints(spec.color);
// Fixed mixes, computed once at load (never per draw).
const AR_ARMOR_DK = arMix(AR_ARMOR, INK, 0.25);
const AR_HEMP_DK = arMix(ARCHETYPES.captive.color, INK, 0.2);

function arSeg(a, ar, b, br) {
  const i = arSegN * 6;
  AR_SEG[i] = a[0]; AR_SEG[i + 1] = a[1]; AR_SEG[i + 2] = ar;
  AR_SEG[i + 3] = b[0]; AR_SEG[i + 4] = b[1]; AR_SEG[i + 5] = br;
  arSegN += 1;
}
function arSegFill(ctx, grow, fill) {
  ctx.beginPath();
  for (let i = 0; i < arSegN * 6; i += 6) arCapsule(ctx, AR_SEG[i], AR_SEG[i + 1], AR_SEG[i + 2] + grow, AR_SEG[i + 3], AR_SEG[i + 4], AR_SEG[i + 5] + grow);
  ctx.fillStyle = fill;
  ctx.fill();
}
// One gear capsule (belt, bracer, wrap): filled, ink-stroked.
function arBand(ctx, ax, ay, ar, bx, by, br, fill, lw = 1.1) {
  ctx.beginPath();
  arCapsule(ctx, ax, ay, ar, bx, by, br);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
}
// base + t * up + n * fwd in the spine frame
function arTP(S, base, up, fwd, out) { out[0] = base[0] + S.tx * up + S.nx * fwd; out[1] = base[1] + S.ty * up + S.ny * fwd; return out; }
// Talisman slip centred on (x, y): yellow paper, ink border, one script stroke, cinnabar seal.
function arSlip(ctx, x, y, rot, w, h, fine, flash) {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hh = h / 2;
  ctx.beginPath();
  ctx.moveTo(x - hw * c + hh * s, y - hw * s - hh * c);
  ctx.lineTo(x + hw * c + hh * s, y + hw * s - hh * c);
  ctx.lineTo(x + hw * c - hh * s, y + hw * s + hh * c);
  ctx.lineTo(x - hw * c - hh * s, y - hw * s + hh * c);
  ctx.closePath();
  ctx.fillStyle = flash ? FLASH : AR_SLIP;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + hh * 0.62 * s, y - hh * 0.62 * c);
  ctx.lineTo(x - hh * 0.2 * s, y + hh * 0.2 * c);
  if (fine) {
    ctx.moveTo(x - hw * 0.5 * c + hh * 0.3 * s, y - hw * 0.5 * s - hh * 0.3 * c);
    ctx.lineTo(x + hw * 0.5 * c + hh * 0.3 * s, y + hw * 0.5 * s - hh * 0.3 * c);
  }
  ctx.lineWidth = fine ? 0.8 : 1;
  ctx.stroke();
  if (!flash) {
    ctx.beginPath();
    ctx.arc(x - hh * 0.58 * s, y + hh * 0.58 * c, Math.max(0.9, w * 0.2), 0, AR_TAU);
    ctx.fillStyle = AR_SEAL;
    ctx.fill();
  }
}
// Chain of iron links along a quadratic a -> (cx, cy) -> b; one path, one stroke.
function arChain(ctx, ax, ay, cx, cy, bx, by, link, lw) {
  const est = arLen(cx - ax, cy - ay) + arLen(bx - cx, by - cy);
  const n = Math.max(2, Math.min(18, Math.round(est / link)));
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const u = (i + 0.5) / n, v = 1 - u;
    const x = v * v * ax + 2 * v * u * cx + u * u * bx;
    const y = v * v * ay + 2 * v * u * cy + u * u * by;
    const gx = 2 * v * (cx - ax) + 2 * u * (bx - cx), gy = 2 * v * (cy - ay) + 2 * u * (by - cy);
    const r = Math.atan2(gy, gx);
    const rx = link * 0.62, ry = i % 2 ? link * 0.18 : link * 0.36;
    ctx.moveTo(x + Math.cos(r) * rx, y + Math.sin(r) * rx);
    ctx.ellipse(x, y, rx, ry, r, 0, AR_TAU);
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function drawArchetypeBody(ctx, pose, o) {
  const S = AR_S;
  const kind = Object.hasOwn(AR_BUILDS, o.archetype) ? o.archetype : 'bandit';
  const B = AR_BUILDS[kind];
  const spec = ARCHETYPES[kind];
  // Flash only on FLASH (or a bodyColor that differs from the colour the caller passed). The
  // stock renderer passes color = bodyColor = elementColor(undefined) for element-less bodies;
  // comparing against spec.color would turn every archetype permanently white.
  const flash = typeof o.bodyColor === 'string' && (o.bodyColor === FLASH || (typeof o.color === 'string' && o.bodyColor !== o.color));
  const tint = arTints(spec.color);
  const m = ctx.getTransform();
  S.kind = kind; S.B = B; S.flash = flash;
  S.cloth = flash ? FLASH : spec.color;
  S.clothRear = flash ? FLASH : tint.rear;
  S.clothDeep = flash ? FLASH : tint.deep;
  S.clothLight = flash ? FLASH : tint.light;
  S.fine = arLen(m.a, m.b) >= 1.3;
  S.t = arFin(o.flutter); S.wav = S.t * 7;
  S.stroke = arFin(o.stroke); S.recoil = arFin(o.recoil);
  S.ko = Boolean(o.ko); S.dizzy = Boolean(o.dizzy);
  S.draw = arClamp(arFin(o.draw)); S.spin = Boolean(o.spin); S.cast = Boolean(o.cast); S.freed = Boolean(o.freed);
  S.brace = arClamp(arFin(o.brace)); S.dropped = Boolean(o.dropped);
  S.drive = Number.isFinite(o.drive) ? arClamp(o.drive) : clothDrive(arFin(o.speed), S.stroke, S.recoil);
  S.ink = flash ? FLASH : INK;
  S.inkRear = flash ? FLASH : AR_INK_REAR;
  S.paper = flash ? FLASH : PAPER;
  wxClothState(S.ko || Boolean(o.frozen), flash);
  arOutline = flash;
  // drawCorpse passes fighter-art's KO_POSE: swap in this archetype's own KO skeleton.
  const P = S.ko && pose === KO_POSE ? ARCHETYPE_KO[kind] : pose;
  const { hip, shoulder, head, rearKnee, rearFoot, frontKnee, frontFoot, rearElbow, rearHand, elbow, hand } = P;
  let tx = shoulder[0] - hip[0], ty = shoulder[1] - hip[1];
  const tl = arLen(tx, ty) || 1;
  tx /= tl; ty /= tl;
  S.tx = tx; S.ty = ty; S.nx = -ty; S.ny = tx;
  const tilt = Math.atan2(shoulder[0] - hip[0], hip[1] - shoulder[1]);
  S.hr = B.head;
  const jut = B.jut || 0; // hunched builds carry the head forward of the shoulders
  S.hx = head[0] + tx * B.neck + S.nx * jut; S.hy = head[1] + ty * B.neck + S.ny * jut;
  S.ht = Math.max(-0.5, Math.min(0.5, tilt * 0.45));
  S.hc = Math.cos(S.ht); S.hs = Math.sin(S.ht);
  for (let i = 0; i < 3; i += 1) { S.A[i] = B.arm[i]; S.L[i] = B.leg[i]; }
  S.T[0] = B.torso[0]; S.T[1] = B.torso[1];
  const A = S.A, L = S.L, T = S.T;
  const fToe = arToe(frontKnee, frontFoot, B.foot, AR_FTOE);
  const rToe = arToe(rearKnee, rearFoot, B.foot, AR_RTOE);
  AR_X0 = Infinity; AR_X1 = -Infinity; AR_Y0 = Infinity; AR_YT = Infinity;
  let top = -S.hr - 1;

  ctx.save();
  try {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // ---- 0. KO: dropped gear lies on the floor under the body ----
    if (S.ko) arDropped(ctx, S, P);
    // ---- 1. back layer ----
    arBack(ctx, S, P);
    // ---- 2. rear limbs ----
    arSegN = 0;
    arSeg(shoulder, A[0], rearElbow, A[1]);
    arSeg(rearElbow, A[1], rearHand, A[2]);
    arSeg(hip, L[0], rearKnee, L[1]);
    arSeg(rearKnee, L[1], rearFoot, L[2]);
    arSeg(rearFoot, L[2], rToe, L[2] * 0.85);
    if (flash) arSegFill(ctx, 1.3, INK);
    arSegFill(ctx, 0, S.inkRear);
    arRear(ctx, S, P);
    arHand(ctx, S, rearHand, rearElbow, true);
    // ---- 3. front leg + torso + neck ----
    arSegN = 0;
    arSeg(hip, L[0], frontKnee, L[1]);
    arSeg(frontKnee, L[1], frontFoot, L[2]);
    arSeg(frontFoot, L[2], fToe, L[2] * 0.85);
    AR_U[0] = S.hx; AR_U[1] = S.hy;
    const bare = kind === 'brute'; // bare paper torso, outlined like the head and fists
    if (!bare) { arSeg(hip, T[1], shoulder, T[0]); arSeg(shoulder, A[0] * 0.75, AR_U, A[0] * 0.75); }
    if (flash) arSegFill(ctx, 1.3, INK);
    arSegFill(ctx, 0, S.ink);
    if (bare) {
      arSegN = 0;
      arSeg(hip, T[1], shoulder, T[0]);
      arSeg(shoulder, 4.4, AR_U, 4.4);
      arSegFill(ctx, 1.7, INK);
      arSegFill(ctx, 0, flash ? FLASH : AR_SKIN);
      if (!flash) {
        // Back half in a deeper tone (stays inside the torso: offset + radius = T at each end).
        arSegN = 0;
        arSeg(arTP(S, hip, 0, -T[1] * 0.5, AR_P), T[1] * 0.5, arTP(S, shoulder, -1, -T[0] * 0.5, AR_Q), T[0] * 0.5);
        arSegFill(ctx, 0, AR_SKIN_BACK);
      }
    }
    arTorso(ctx, S, P);
    // ---- 4. head ----
    ctx.save();
    ctx.translate(S.hx, S.hy);
    ctx.rotate(S.ht);
    if (flash) { ctx.beginPath(); ctx.arc(0, 0, S.hr + 1.2, 0, AR_TAU); ctx.fillStyle = INK; ctx.fill(); }
    ctx.beginPath();
    ctx.arc(0, 0, S.hr, 0, AR_TAU);
    ctx.fillStyle = S.paper;
    ctx.fill();
    ctx.lineWidth = 2.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    top = arHead(ctx, S);
    ctx.restore();
    // ---- 5. weapon under the front fist, front arm ----
    if (!S.ko) arWeapon(ctx, S, P);
    arSegN = 0;
    arSeg(shoulder, A[0], elbow, A[1]);
    arSeg(elbow, A[1], hand, A[2]);
    if (flash) arSegFill(ctx, 1.3, INK);
    arSegFill(ctx, 0, S.ink);
    arArmGear(ctx, S, shoulder, elbow, hand, false);
    arHand(ctx, S, hand, elbow, false);
    // ---- 6. front layer: shield, cangue, pauldron, front talismans ----
    arFront(ctx, S, P);
  } finally {
    ctx.restore();
    wxClothState(false, false);
    arOutline = false;
  }

  const M = AR_M;
  M.left = S.hx - S.hr - 2; M.right = S.hx + S.hr + 1;
  const pad = B.hand + 1;
  arExtend(M, hand[0], pad); arExtend(M, rearHand[0], pad);
  arExtend(M, fToe[0], 3); arExtend(M, rToe[0], 3); arExtend(M, frontKnee[0], 3); arExtend(M, rearKnee[0], 3);
  arExtend(M, elbow[0], 3); arExtend(M, rearElbow[0], 3);
  if (AR_X1 > AR_X0) { arExtend(M, AR_X0, 1); arExtend(M, AR_X1, 1); }
  M.top = Math.min(S.hy + top, AR_YT); M.torso = T[0]; // a cast crown of slips lifts the HP bar
  M.gearTop = Math.min(M.top, AR_Y0); // highest point incl. raised weapons/slips (layout only)
  M.headX = S.hx; M.headY = S.hy; M.headR = S.hr;
  return M;
}
// Weapon / gear extents in pose units, for metrics (layout, culling).
let AR_X0 = Infinity, AR_X1 = -Infinity, AR_Y0 = Infinity, AR_YT = Infinity;
function arReach(x, y) {
  if (x < AR_X0) AR_X0 = x;
  if (x > AR_X1) AR_X1 = x;
  if (y < AR_Y0) AR_Y0 = y;
}

// ---------------------------------------------------------------- layers per archetype
function arBack(ctx, S, P) {
  const { kind, hr, drive, wav } = S;
  if (kind === 'bandit') {
    // Head-wrap knot: two short stubby tails (air's streamers are long and at the brow).
    const kx = S.hx + (-hr * 0.92) * S.hc - (-hr * 0.12) * S.hs, ky = S.hy + (-hr * 0.92) * S.hs + (-hr * 0.12) * S.hc;
    const base = Math.PI - 0.35 + drive * 0.35;
    arTail(ctx, kx, ky, base + 0.55, 7 + drive * 3, 2.3, 0.9, wav + 1.3, 0.8 + drive, 0.12, S.clothRear, 5);
    arTail(ctx, kx, ky, base, 9 + drive * 4, 2.6, 1.0, wav, 1 + drive, 0.1, S.cloth, 5);
  } else if (kind === 'hunter') {
    // Quiver across the back with three fletched shafts past the shoulder.
    const q0 = arTP(S, P.hip, 5, -(S.T[1] + 2.2), AR_P), q1 = arTP(S, P.shoulder, 7, -(S.T[0] + 4.2), AR_Q);
    const dx = q1[0] - q0[0], dy = q1[1] - q0[1], dl = arLen(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = (i - 1) * 0.22, c = Math.cos(a), s = Math.sin(a);
      const vx = ux * c - uy * s, vy = ux * s + uy * c;
      ctx.moveTo(q1[0], q1[1]);
      ctx.lineTo(q1[0] + vx * 9, q1[1] + vy * 9);
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      const a = (i - 1) * 0.22, c = Math.cos(a), s = Math.sin(a);
      const vx = ux * c - uy * s, vy = ux * s + uy * c;
      const ex = q1[0] + vx * 9.5, ey = q1[1] + vy * 9.5;
      ctx.beginPath();
      ctx.moveTo(ex + vx * 1.5, ey + vy * 1.5);
      ctx.lineTo(ex - vx * 3.5 - vy * 2.1, ey - vy * 3.5 + vx * 2.1);
      ctx.lineTo(ex - vx * 2.4, ey - vy * 2.4);
      ctx.lineTo(ex - vx * 3.5 + vy * 2.1, ey - vy * 3.5 - vx * 2.1);
      ctx.closePath();
      ctx.fillStyle = S.paper;
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    arBand(ctx, q0[0], q0[1], 2.6, q1[0], q1[1], 3.1, S.flash ? FLASH : AR_LEATHER, 1.2);
    if (!S.flash) {
      // a moss cap band on the quiver mouth
      arBand(ctx, q1[0] - ux * 2.4, q1[1] - uy * 2.4, 3.0, q1[0] - ux * 0.4, q1[1] - uy * 0.4, 3.2, S.cloth, 1);
    }
  } else if (kind === 'sorcerer') {
    // Rear robe panel and talismans on the far side of their orbit.
    const w0 = arTP(S, P.hip, 2, -S.T[1] * 0.7, AR_P);
    arTail(ctx, w0[0], w0[1], Math.PI * (0.54 + drive * 0.18), 24, 3.0, 5.6, wav * 0.6 + 1, 0.8 + drive, 0.05, S.clothDeep, 7, 0, 1);
    if (!S.ko) arTalismans(ctx, S, P, -1);
  } else if (kind === 'guard') {
    // Helmet tassel streaming back, and the rear lamellar tasset.
    const sx = S.hx + (0.2) * S.hc - (-S.hr - 4.2) * S.hs, sy = S.hy + (0.2) * S.hs + (-S.hr - 4.2) * S.hc;
    arTail(ctx, sx, sy, Math.PI * (0.9 + drive * 0.06), 11 + drive * 5, 2.2, 0.7, wav + 0.5, 1 + drive, 0.22 - drive * 0.15, S.flash ? FLASH : AR_TASSEL, 6);
    const w0 = arTP(S, P.hip, 2.5, -S.T[1] * 0.6, AR_P);
    arTail(ctx, w0[0], w0[1], Math.PI * (0.55 + drive * 0.08), 12, 3.4, 3.2, wav * 0.3, 0.3, 0.02, S.flash ? FLASH : AR_ARMOR_DK, 4, 0, 1.1);
  } else if (kind === 'monk') {
    const w0 = arTP(S, P.hip, 2.2, -S.T[1] * 0.6, AR_P);
    arTail(ctx, w0[0], w0[1], Math.PI * (0.56 + drive * 0.16), 14, 3.4, 4.2, wav * 0.4 + 1, 0.5 + drive * 0.5, 0.03, S.clothDeep, 5, 0, 1);
  } else if (kind === 'captive') {
    // Lank, hanging hair strands at the nape.
    for (let i = 0; i < 3; i += 1) {
      const a = Math.PI * (0.62 + i * 0.12);
      const x = S.hx + Math.cos(a + S.ht) * hr * 0.9, y = S.hy + Math.sin(a + S.ht) * hr * 0.9;
      arTail(ctx, x, y, Math.PI * (0.55 + i * 0.06), 6 + i * 1.5, 1.6, 0.4, wav * 0.4 + i, 0.4, 0.1, S.ink, 4);
    }
  }
}

// KO only: the archetype's gear lying on the floor (local x = 15) under / beside the body.
const AR_DROP = { hand: [0, 0], rearHand: [0, 0], weaponAngle: 0 };
const AR_HALF_PI = Math.PI / 2;
function arDropped(ctx, S, P) {
  const { kind } = S;
  const D = AR_DROP;
  if (kind === 'bandit') {
    // cleaver flat on its edge, just beyond the outstretched hand
    D.hand[0] = 4.6; D.hand[1] = -52; D.weaponAngle = -AR_HALF_PI;
    arWeapon(ctx, S, D);
  } else if (kind === 'hunter') {
    D.hand[0] = 13; D.hand[1] = -20; D.weaponAngle = 0;
    D.rearHand[0] = 13; D.rearHand[1] = -20;
    arWeapon(ctx, S, D);
  } else if (kind === 'brute') {
    // the chain runs from the fist along the floor to the iron ball past his feet
    const h = P.hand, bx = 15 - 6.2, by = 27;
    arChain(ctx, h[0], h[1], 14, (h[1] + by) / 2, bx, by - 5.5, 3.6, 1.5);
    ctx.beginPath();
    ctx.arc(bx, by, 6.2, 0, AR_TAU);
    ctx.fillStyle = S.flash ? FLASH : AR_IRON_DK;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  } else if (kind === 'sorcerer') {
    // cap rolled off past the head, lying on its front; two slips on the floor
    ctx.save();
    ctx.translate(8.6, -60);
    ctx.rotate(0.5);
    arPriestCap(ctx, S, S.B.head, S.flash);
    ctx.restore();
    arSlip(ctx, 13.2, -4, AR_HALF_PI + 0.25, 4.2, 9, S.fine, S.flash);
    arSlip(ctx, 13.4, 16, AR_HALF_PI - 0.4, 4.2, 9, S.fine, S.flash);
  } else if (kind === 'guard') {
    // sword past the head, shield flat under the torso (he slumps across it)
    D.rearHand[0] = 13.2; D.rearHand[1] = -52;
    arJian(ctx, S, D.rearHand, -AR_HALF_PI);
    ctx.beginPath();
    ctx.ellipse(12.2, -22, 3.4, 17.5, 0, 0, AR_TAU);
    ctx.fillStyle = S.flash ? FLASH : '#62757e';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(12.2, -22, 2.2, 16.2, 0, 0, AR_TAU);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = S.flash ? INK : PAPER;
    ctx.stroke();
  } else if (kind === 'monk' && !S.dropped) {
    // staff along the floor under him (o.dropped: it became a real staff pickup instead)
    D.hand[0] = 12.6; D.hand[1] = -14; D.weaponAngle = -AR_HALF_PI;
    arWeapon(ctx, S, D);
  } else if (kind === 'captive' && !S.freed) {
    arSlip(ctx, 13.3, -60, AR_HALF_PI + 0.3, 4.6, 9.6, S.fine, S.flash);
  }
}

function arRear(ctx, S, P) {
  const { kind } = S;
  if (kind === 'sorcerer') arArmGear(ctx, S, P.shoulder, P.rearElbow, P.rearHand, true);
  else if (kind === 'brute') arArmGear(ctx, S, P.shoulder, P.rearElbow, P.rearHand, true);
  else if (kind === 'monk') arPuttee(ctx, S, P.rearKnee, P.rearFoot, true);
  else if (kind === 'guard' && !S.ko) arJian(ctx, S, P.rearHand, arFin(P.weaponAngle));
}

// Straight sword (jian): in the guard's rear hand behind the body, or dropped on KO.
function arJian(ctx, S, h, a) {
  const c = Math.cos(a), s = Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(h[0] - c * 5, h[1] - s * 5);
  ctx.lineTo(h[0] + c * 3, h[1] + s * 3);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const bx = h[0] + c * 3.5, by = h[1] + s * 3.5, L = 27;
  ctx.beginPath();
  ctx.moveTo(bx - s * 1.5, by + c * 1.5);
  ctx.lineTo(bx + c * (L - 3) - s * 1.1, by + s * (L - 3) + c * 1.1);
  ctx.lineTo(bx + c * L, by + s * L);
  ctx.lineTo(bx + c * (L - 3) + s * 1.1, by + s * (L - 3) - c * 1.1);
  ctx.lineTo(bx + s * 1.5, by - c * 1.5);
  ctx.closePath();
  ctx.fillStyle = S.flash ? FLASH : AR_STEEL;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx - s * 4, by + c * 4);
  ctx.lineTo(bx + s * 4, by - c * 4);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = S.flash ? FLASH : AR_BRASS;
  ctx.stroke();
  arReach(bx + c * L, by + s * L);
}

function arTorso(ctx, S, P) {
  const { kind, T, drive, wav } = S;
  const hip = P.hip, sh = P.shoulder;
  if (kind === 'bandit') {
    // Plum sash with a hanging end and a tucked knife hilt.
    const a = arTP(S, hip, 3.2, -(T[1] + 0.9), AR_P), b = arTP(S, hip, 3.2, T[1] + 0.9, AR_Q);
    arBand(ctx, a[0], a[1], 2.3, b[0], b[1], 2.3, S.cloth, 1.2);
    const e = arTP(S, hip, 2.4, T[1] * 0.4, AR_R);
    arTail(ctx, e[0], e[1], Math.PI * (0.47 - drive * 0.12), 9 + drive * 3, 2.2, 1.4, wav + 0.6, 0.8 + drive, 0.08, S.clothRear, 5, 0, 0.9);
    const k = arTP(S, hip, 4.5, -T[1] * 0.4, AR_U);
    ctx.beginPath();
    ctx.moveTo(k[0], k[1]);
    ctx.lineTo(k[0] - S.nx * 4.5 + S.tx * 4, k[1] - S.ny * 4.5 + S.ty * 4);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = S.flash ? FLASH : AR_WOOD;
    ctx.stroke();
  } else if (kind === 'hunter') {
    const a = arTP(S, hip, 3.2, -(T[1] + 0.9), AR_P), b = arTP(S, hip, 3.2, T[1] + 0.9, AR_Q);
    arBand(ctx, a[0], a[1], 1.9, b[0], b[1], 1.9, S.clothDeep, 1.1);
    // pouch on the front hip
    const p = arTP(S, hip, 1.4, T[1] + 0.6, AR_R);
    arBand(ctx, p[0], p[1] - 0.6, 2.2, p[0] + S.tx * -3.2, p[1] + S.ty * -3.2, 2.6, S.cloth, 1);
  } else if (kind === 'brute') {
    // Bare torso: pec line and navel, then the iron collar, slate sash and front flap.
    const pc = arTP(S, sh, -4, T[0] * 0.05, AR_R), pm = arTP(S, sh, -10.5, T[0] * 0.5, AR_U);
    ctx.beginPath();
    ctx.moveTo(pc[0], pc[1]);
    ctx.quadraticCurveTo(pm[0], pm[1], sh[0] - S.tx * 4.5 + S.nx * T[0] * 0.92, sh[1] - S.ty * 4.5 + S.ny * T[0] * 0.92);
    if (S.fine) {
      const q0 = arTP(S, sh, -12, -T[0] * 0.55, AR_R), q1 = arTP(S, sh, -16, -T[0] * 0.15, AR_U);
      ctx.moveTo(q0[0], q0[1]);
      ctx.quadraticCurveTo(q1[0], q1[1], hip[0] + S.tx * 9 - S.nx * 1, hip[1] + S.ty * 9 - S.ny * 1);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.fine) {
      const m = arTP(S, hip, 8.5, T[1] * 0.6, AR_R);
      ctx.beginPath();
      ctx.arc(m[0], m[1], 0.8, 0, AR_TAU);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    const n0 = arTP(S, sh, 3.4, -6.4, AR_P), n1 = arTP(S, sh, 1.6, 3.2, AR_Q);
    const fl = arTP(S, hip, 2.4, T[1] * 0.35, AR_R);
    arTail(ctx, fl[0], fl[1], Math.PI * (0.48 - drive * 0.1), 13 + drive * 2, 4.4, 3.6, wav * 0.5, 0.5 + drive * 0.6, 0.04, S.clothDeep, 5, 0, 1.1);
    const a = arTP(S, hip, 3.6, -(T[1] + 1.2), AR_P), b = arTP(S, hip, 3.6, T[1] + 1.2, AR_Q);
    arBand(ctx, a[0], a[1], 3.6, b[0], b[1], 3.6, S.cloth, 1.4);
    arBand(ctx, n0[0], n0[1], 2.7, n1[0], n1[1], 2.7, S.flash ? FLASH : AR_IRON, 1.4);
  } else if (kind === 'sorcerer') {
    // Cross collar (paper under-robe), violet sash and the front robe panel.
    const c0 = arTP(S, sh, 1.5, -1, AR_P), c1 = arTP(S, sh, -9, T[0] * 0.75, AR_Q);
    ctx.beginPath();
    ctx.moveTo(c0[0], c0[1]);
    ctx.lineTo(c1[0], c1[1]);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = S.clothLight;
    ctx.stroke();
    const w0 = arTP(S, hip, 2, S.T[1] * 0.55, AR_R);
    const ang = Math.PI * (0.47 - drive * 0.12) + arClamp((P.frontKnee[0] - P.hip[0]) * 0.006, -0.15, 0.15);
    arTail(ctx, w0[0], w0[1], ang, 25, 3.2, 6.2, wav * 0.6, 0.7 + drive, 0.04, S.cloth, 7, 0, 1);
    const a = arTP(S, hip, 3.4, -(T[1] + 0.9), AR_P), b = arTP(S, hip, 3.4, T[1] + 0.9, AR_Q);
    arBand(ctx, a[0], a[1], 2.2, b[0], b[1], 2.2, S.clothDeep, 1.1);
  } else if (kind === 'guard') {
    // Lamellar vest: steel shell with ink lace rows, front tasset, leather belt.
    const v0 = arTP(S, hip, 1, 0, AR_P), v1 = arTP(S, sh, -1.5, 0, AR_Q);
    const fill = S.flash ? FLASH : AR_ARMOR;
    arBand(ctx, v0[0], v0[1], T[1] + 1.4, v1[0], v1[1], T[0] + 1.1, fill, 1.2);
    const rows = S.fine ? 5 : 3;
    ctx.beginPath();
    for (let i = 1; i <= rows; i += 1) {
      const u = i / (rows + 1), w = (T[1] + 1.4) + ((T[0] + 1.1) - (T[1] + 1.4)) * u - 0.8;
      const cx = v0[0] + (v1[0] - v0[0]) * u, cy = v0[1] + (v1[1] - v0[1]) * u;
      ctx.moveTo(cx - S.nx * w, cy - S.ny * w);
      ctx.lineTo(cx + S.nx * w, cy + S.ny * w);
    }
    ctx.lineWidth = S.fine ? 0.8 : 1;
    ctx.strokeStyle = arOutline ? INK : '#4e5f66';
    ctx.stroke();
    const w0 = arTP(S, hip, 2.5, S.T[1] * 0.5, AR_R);
    arTail(ctx, w0[0], w0[1], Math.PI * (0.46 - drive * 0.06), 12, 3.6, 3.3, wav * 0.3 + 1, 0.3, 0.02, fill, 4, 0, 1.1);
    const a = arTP(S, hip, 3.4, -(T[1] + 1.5), AR_P), b = arTP(S, hip, 3.4, T[1] + 1.5, AR_Q);
    arBand(ctx, a[0], a[1], 1.8, b[0], b[1], 1.8, S.flash ? FLASH : '#6b5338', 1.1);
  } else if (kind === 'monk') {
    arPuttee(ctx, S, P.frontKnee, P.frontFoot, false);
    // Kasaya: a broad wine sash from the front shoulder to the back hip.
    const k0 = arTP(S, sh, -0.6, T[0] * 0.55, AR_P), k1 = arTP(S, hip, 3.5, -T[1] * 0.75, AR_Q);
    arBand(ctx, k0[0], k0[1], 2.8, k1[0], k1[1], 3.1, S.cloth, 1.1);
    const a = arTP(S, hip, 3.3, -(T[1] + 0.8), AR_P), b = arTP(S, hip, 3.3, T[1] + 0.8, AR_Q);
    arBand(ctx, a[0], a[1], 1.7, b[0], b[1], 1.7, S.clothDeep, 1);
    // Kasaya skirt: the wine robe hangs over the front thigh.
    const ks = arTP(S, hip, 2.2, T[1] * 0.35, AR_R);
    const ka = arToward(Math.atan2(P.frontKnee[1] - P.hip[1], P.frontKnee[0] - P.hip[0]), Math.PI / 2, 0.45);
    arTail(ctx, ks[0], ks[1], ka, 15, 3.6, 4.6, wav * 0.4, 0.5 + drive * 0.5, 0.03, S.cloth, 5, 0, 1);
  } else if (kind === 'captive') {
    // Hemp tunic over the torso, rope belt, short skirt.
    const v0 = arTP(S, hip, -1, 0, AR_P), v1 = arTP(S, sh, -1, 0, AR_Q);
    const w0 = arTP(S, hip, 1.5, S.T[1] * 0.3, AR_R);
    const sa = arToward(Math.atan2(P.frontKnee[1] - P.hip[1], P.frontKnee[0] - P.hip[0]), Math.PI / 2, 0.35);
    arTail(ctx, w0[0], w0[1], sa, 10, 3.8, 4.4, wav * 0.4, 0.5, 0.02, S.cloth, 4, 0, 1);
    arBand(ctx, v0[0], v0[1], T[1] + 1.4, v1[0], v1[1], T[0] + 1.0, S.cloth, 1.1);
    if (S.fine && !S.flash) {
      const p = arTP(S, sh, -8, T[0] * 0.3, AR_U);
      ctx.fillStyle = AR_HEMP_DK;
      ctx.fillRect(p[0] - 1.6, p[1] - 1.4, 3.2, 2.8);
    }
    const a = arTP(S, hip, 3, -(T[1] + 1.5), AR_P), b = arTP(S, hip, 3, T[1] + 1.5, AR_Q);
    arBand(ctx, a[0], a[1], 1.2, b[0], b[1], 1.2, S.flash ? FLASH : AR_ROPE, 0.9);
  }
}

// Leg wraps in warm grey, barely wider than the shin, so the leg still reads as one limb.
function arPuttee(ctx, S, knee, foot, rear) {
  const a = arAlong(knee, foot, 0.34, AR_P), b = arAlong(knee, foot, 0.84, AR_Q);
  arBand(ctx, a[0], a[1], S.L[1] + 0.3, b[0], b[1], S.L[2] + 0.45, S.flash ? FLASH : rear ? AR_PUTTEE_REAR : AR_PUTTEE, rear ? 0 : 0.9);
  if (S.fine && !rear) {
    ctx.beginPath();
    for (let i = 1; i < 4; i += 1) {
      const p = arAlong(a, b, i / 4, AR_R);
      const dx = b[0] - a[0], dy = b[1] - a[1], l = arLen(dx, dy) || 1, w = S.L[1] + 0.3;
      ctx.moveTo(p[0] - dy / l * w + dx / l * 1.2, p[1] + dx / l * w + dy / l * 1.2);
      ctx.lineTo(p[0] + dy / l * w - dx / l * 1.2, p[1] - dx / l * w - dy / l * 1.2);
    }
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = AR_PUTTEE_LINE;
    ctx.stroke();
  }
}

function arArmGear(ctx, S, sh, e, h, rear) {
  const { kind, A } = S;
  if (kind === 'brute') {
    // Iron bracer at the wrist separates the paper fist from the bare paper forearm.
    const a = arAlong(e, h, 0.55, AR_P), b = arAlong(e, h, 0.86, AR_Q);
    arBand(ctx, a[0], a[1], A[1] + 0.6, b[0], b[1], A[2] + 0.9, S.flash ? FLASH : rear ? AR_IRON_DK : AR_IRON, 1.3);
  } else if (kind === 'sorcerer') {
    // Long hanging "cloud" sleeve: covers the forearm and drapes well below the wrist.
    const a = arAlong(e, h, 0.05, AR_P), b = arAlong(e, h, 0.82, AR_Q);
    const fill = rear ? S.clothRear : S.cloth;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    arTail(ctx, mx, my, arToward(Math.atan2(b[1] - a[1], b[0] - a[0]), Math.PI / 2, 0.85), 11 + S.drive * 4, 4.4, 1.2, S.wav + (rear ? 2 : 0.5), 0.8 + S.drive, 0.06, fill, 5, 0.25, 1);
    arBand(ctx, a[0], a[1], A[1] + 1.3, b[0], b[1], A[2] + 2.6, fill, 1);
  }
}

function arHand(ctx, S, p, from, rear) {
  const r = S.B.hand * (rear ? 0.94 : 1);
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, AR_TAU);
  ctx.fillStyle = S.paper;
  ctx.fill();
  ctx.lineWidth = S.kind === 'brute' ? 2 : 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// Head gear in the head's rotated frame. Returns the top y offset.
function arHead(ctx, S) {
  const { kind, hr, flash } = S;
  let top = -hr - 1;
  if (kind === 'bandit') {
    arFace(ctx, S, 'scowl');
    // Head wrap over crown and nape.
    ctx.beginPath();
    ctx.arc(0, 0, hr + 0.7, Math.PI * 0.74, Math.PI * 1.8);
    ctx.quadraticCurveTo(hr * 0.05, -hr * 0.62, -hr * 0.62, hr * 0.62);
    ctx.closePath();
    ctx.fillStyle = S.cloth;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Knot.
    ctx.beginPath();
    ctx.arc(-hr * 0.92, -hr * 0.12, 2.2, 0, AR_TAU);
    ctx.fillStyle = S.clothRear;
    ctx.fill();
    ctx.stroke();
    // Cloth mask over the lower face with a bandana point under the chin.
    ctx.beginPath();
    ctx.arc(0, 0, hr + 0.4, Math.PI * 0.05, Math.PI * 0.62);
    ctx.lineTo(-hr * 0.42, hr * 0.15);
    ctx.quadraticCurveTo(hr * 0.35, hr * 0.32, hr + 0.4, hr * 0.15);
    ctx.closePath();
    ctx.moveTo(hr * 0.98, hr * 0.32);
    ctx.lineTo(hr * 0.78, hr * 1.55);
    ctx.lineTo(hr * 0.12, hr * 0.98);
    ctx.closePath();
    ctx.fillStyle = S.clothDeep;
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.stroke();
    top = -hr - 0.7;
  } else if (kind === 'hunter') {
    arFace(ctx, S, 'focus');
    // Hood with a pointed tail, opening framing the face; a pale feather on top.
    const R = hr + 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(-Math.PI * 0.3) * R, Math.sin(-Math.PI * 0.3) * R);
    ctx.arc(0, 0, R, -Math.PI * 0.3, Math.PI * 0.82, true);
    ctx.lineTo(-R * 1.55, R * 0.95);
    ctx.lineTo(-R * 0.35, R * 1.02);
    ctx.lineTo(R * 0.08, R * 1.1);
    ctx.quadraticCurveTo(R * 0.12, R * 0.05, Math.cos(-Math.PI * 0.3) * R, Math.sin(-Math.PI * 0.3) * R);
    ctx.closePath();
    ctx.fillStyle = S.cloth;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // feather
    const fx = -R * 0.45, fy = -R * 0.86, fa = -2.15, fl = 12;
    const ux = Math.cos(fa), uy = Math.sin(fa);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + ux * fl * 0.5 - uy * 3, fy + uy * fl * 0.5 + ux * 3, fx + ux * fl, fy + uy * fl);
    ctx.quadraticCurveTo(fx + ux * fl * 0.5 + uy * 2.2, fy + uy * fl * 0.5 - ux * 2.2, fx, fy);
    ctx.closePath();
    ctx.fillStyle = S.paper;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
    if (S.fine) {
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + ux * fl * 0.9, fy + uy * fl * 0.9);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    top = Math.min(-R, fy + uy * fl);
  } else if (kind === 'brute') {
    arFace(ctx, S, 'brute');
    // Shaved head with an ink topknot, a short chin beard and sideburn; the face stays paper.
    ctx.beginPath();
    ctx.arc(0, 0, hr + 0.4, Math.PI * 1.0, Math.PI * 1.62);
    ctx.quadraticCurveTo(-hr * 0.2, -hr * 0.62, -hr * 0.98, -hr * 0.05);
    ctx.closePath();
    ctx.fillStyle = S.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-hr * 0.45, -hr * 1.05, 2.7, 0, AR_TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-hr * 0.55, -hr * 1.18);
    ctx.quadraticCurveTo(-hr * 1.1, -hr * 1.45, -hr * 1.35, -hr * 0.9);
    ctx.quadraticCurveTo(-hr * 1.0, -hr * 1.1, -hr * 0.6, -hr * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hr * 0.92, hr * 0.48);
    ctx.quadraticCurveTo(hr * 1.02, hr * 1.1, hr * 0.62, hr * 1.42);
    ctx.quadraticCurveTo(hr * 0.2, hr * 1.25, -hr * 0.18, hr * 0.78);
    ctx.lineTo(-hr * 0.05, hr * 0.55);
    ctx.quadraticCurveTo(hr * 0.4, hr * 0.85, hr * 0.92, hr * 0.48);
    ctx.closePath();
    ctx.fill();
    if (flash) { ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke(); }
    top = -hr * 1.05 - 2.7;
  } else if (kind === 'sorcerer') {
    arFace(ctx, S, 'calm');
    // Long silver elder's beard: pale against the ink torso, it sways with travel.
    const sway = Math.sin(S.t * 3) * 0.8 - S.drive * 2.5;
    ctx.beginPath();
    ctx.moveTo(hr * 0.86, hr * 0.42);
    ctx.quadraticCurveTo(hr * 1.12 + sway * 0.5, hr * 1.45, hr * 0.7 + sway, hr * 2.45);
    ctx.quadraticCurveTo(hr * 0.42 + sway * 0.4, hr * 1.5, hr * 0.02, hr * 0.92);
    ctx.quadraticCurveTo(hr * 0.45, hr * 0.78, hr * 0.86, hr * 0.42);
    ctx.closePath();
    ctx.fillStyle = flash ? FLASH : AR_SILVER;
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.fine) {
      ctx.beginPath();
      ctx.moveTo(hr * 0.55, hr * 1.0);
      ctx.quadraticCurveTo(hr * 0.72 + sway * 0.3, hr * 1.5, hr * 0.66 + sway * 0.8, hr * 2.05);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    if (S.ko) {
      // cap knocked off (arDropped draws it beyond the head): a neat ink hair cap and bun
      ctx.beginPath();
      ctx.arc(0, 0, hr + 0.5, Math.PI * 0.95, Math.PI * 1.75);
      ctx.quadraticCurveTo(-hr * 0.1, -hr * 0.55, -hr * 0.98, -hr * 0.1);
      ctx.closePath();
      ctx.moveTo(-hr * 0.2 + 2.6, -hr - 1.2);
      ctx.arc(-hr * 0.2, -hr - 1.2, 2.6, 0, AR_TAU);
      ctx.fillStyle = S.ink;
      ctx.fill();
      top = -hr - 3.8;
    }
    else { arPriestCap(ctx, S, hr, flash); top = -hr - 10.6; }
  } else if (kind === 'guard') {
    arFace(ctx, S, 'stern');
    // Steel helmet: dome, jutting brim, flared neck guard, spike and brass knob.
    const R = hr + 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, R, Math.PI * 0.94, Math.PI * 1.9);
    ctx.lineTo(R * 0.98 + 3.2, -R * 0.2);
    ctx.lineTo(R * 0.55, -R * 0.12);
    ctx.quadraticCurveTo(-R * 0.15, -R * 0.2, -R * 0.55, R * 0.12);
    ctx.lineTo(-R * 1.28, R * 0.72);
    ctx.lineTo(-R * 0.72, R * 0.86);
    ctx.lineTo(-R * 0.98, R * 0.2);
    ctx.closePath();
    ctx.fillStyle = flash ? FLASH : AR_HELM;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.fine) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.62, R * 0.44);
      ctx.lineTo(-R * 1.05, R * 0.62);
      ctx.moveTo(0.4, -R);
      ctx.quadraticCurveTo(R * 0.5, -R * 0.8, R * 0.72, -R * 0.2);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -R + 0.5);
    ctx.lineTo(0.3, -R - 4.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.3, -R - 4.6, 1.7, 0, AR_TAU);
    ctx.fillStyle = flash ? FLASH : AR_BRASS;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
    top = -R - 6.3;
  } else if (kind === 'monk') {
    arFace(ctx, S, 'serene');
    if (S.fine) {
      // ordination marks and an ear
      ctx.fillStyle = INK;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.arc(-hr * 0.42 + (i % 3) * hr * 0.3, -hr * 0.66 - (i < 3 ? 0 : hr * 0.17) + Math.abs((i % 3) - 1) * hr * 0.05, 0.62, 0, AR_TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(-hr * 0.2, hr * 0.12, 2, Math.PI * 0.55, Math.PI * 1.6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    top = -hr - 1.2;
  } else {
    arFace(ctx, S, 'worried');
    // Unkempt ink hair cap.
    ctx.beginPath();
    ctx.arc(0, 0, hr + 0.6, Math.PI * 0.72, Math.PI * 1.78);
    ctx.lineTo(hr * 0.4, -hr * 0.5);
    ctx.lineTo(hr * 0.15, -hr * 0.62);
    ctx.lineTo(-hr * 0.05, -hr * 0.4);
    ctx.quadraticCurveTo(-hr * 0.45, -hr * 0.25, -hr * 0.6, hr * 0.6);
    ctx.closePath();
    ctx.fillStyle = S.ink;
    ctx.fill();
    top = -hr - 0.8;
  }
  return top;
}

// Tall flat-topped priest cap (violet band, jade bead) in the head's frame.
function arPriestCap(ctx, S, hr, flash) {
  // Tall flat-topped priest cap with a violet band and a jade bead.
  ctx.beginPath();
  ctx.moveTo(-hr * 0.86, -hr * 0.48);
  ctx.lineTo(-hr * 1.02, -hr - 9.2);
  ctx.lineTo(hr * 0.62, -hr - 10.4);
  ctx.lineTo(hr * 0.66, -hr * 0.74);
  ctx.quadraticCurveTo(-hr * 0.1, -hr * 0.92, -hr * 0.86, -hr * 0.48);
  ctx.closePath();
  ctx.fillStyle = S.ink;
  ctx.fill();
  if (flash) { ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke(); }
  ctx.beginPath();
  ctx.moveTo(-hr * 0.88, -hr * 0.56);
  ctx.quadraticCurveTo(-hr * 0.1, -hr * 1.0, hr * 0.66, -hr * 0.82);
  ctx.lineTo(hr * 0.64, -hr * 1.22);
  ctx.quadraticCurveTo(-hr * 0.12, -hr * 1.38, -hr * 0.93, -hr * 0.98);
  ctx.closePath();
  ctx.fillStyle = S.cloth;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hr * 0.1, -hr - 4.6, 1.5, 0, AR_TAU);
  ctx.fillStyle = flash ? FLASH : '#cfe3c7';
  ctx.fill();
}

function arFace(ctx, S, mood) {
  const { hr, recoil, stroke } = S;
  const ex = hr * 0.5, ey = -0.4;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (S.ko) {
    ctx.moveTo(ex - 1.7, ey - 1.7); ctx.lineTo(ex + 1.7, ey + 1.7);
    ctx.moveTo(ex + 1.7, ey - 1.7); ctx.lineTo(ex - 1.7, ey + 1.7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (S.dizzy) {
    ctx.arc(ex, ey, 1.9, 0, Math.PI * 1.6);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  } else if (recoil > 0.3) {
    ctx.moveTo(ex - 1.6, ey - 1.6); ctx.lineTo(ex + 0.9, ey); ctx.lineTo(ex - 1.6, ey + 1.6);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (mood === 'serene' && stroke < 0.5) {
    // closed, downturned eye
    ctx.arc(ex, ey - 1.2, 1.8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = 1.3;
    ctx.stroke();
  } else {
    if (stroke > 0.6) ctx.ellipse(ex, ey, 1.6, 0.9, 0, 0, AR_TAU);
    else ctx.arc(ex, ey, mood === 'brute' ? 1.1 : 1.3, 0, AR_TAU);
    ctx.fill();
  }
  // Brow carries the temperament.
  ctx.beginPath();
  const up = recoil > 0.3 || S.ko ? -0.8 : 0;
  if (mood === 'scowl') { ctx.moveTo(ex - 2.9, ey - 4.0 + up); ctx.lineTo(ex + 2.2, ey - 1.7); ctx.lineWidth = 1.6; }
  else if (mood === 'brute') { ctx.moveTo(ex - 3.2, ey - 3.4 + up); ctx.lineTo(ex + 2.6, ey - 1.5); ctx.lineWidth = 2.1; }
  else if (mood === 'worried') { ctx.moveTo(ex - 2.6, ey - 2.4); ctx.lineTo(ex + 2.0, ey - 3.9 + up); ctx.lineWidth = 1.2; }
  else if (mood === 'serene') { ctx.moveTo(ex - 2.8, ey - 3.2); ctx.quadraticCurveTo(ex, ey - 4.6, ex + 2.4, ey - 3.0); ctx.lineWidth = 1.5; }
  else if (mood === 'calm') { ctx.moveTo(ex - 3.0, ey - 2.9); ctx.lineTo(ex + 2.0, ey - 3.2 + up); ctx.lineWidth = 1.2; }
  else if (mood !== 'stern') { ctx.moveTo(ex - 2.6, ey - 3.4 + up); ctx.lineTo(ex + 2.0, ey - 2.3); ctx.lineWidth = 1.2; }
  ctx.stroke();
  if (!S.fine || S.kind === 'bandit' || S.kind === 'brute') return; // mask / beard cover the mouth
  ctx.beginPath();
  if (stroke > 0.6 || recoil > 0.3 || S.ko || mood === 'worried') {
    ctx.ellipse(hr * 0.56, 4.2, 1.1, recoil > 0.3 || mood === 'worried' ? 1.4 : 1, 0, 0, AR_TAU);
    ctx.fill();
  } else if (S.kind !== 'sorcerer') {
    ctx.moveTo(hr * 0.38, 4.3);
    ctx.lineTo(hr * 0.7, 4.0);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#6b6653';
    ctx.stroke();
  }
}

// Weapon held in the front hand, drawn under the front arm so the fist closes on it.
function arWeapon(ctx, S, P) {
  const { kind } = S;
  const h = P.hand, a = arFin(P.weaponAngle), c = Math.cos(a), s = Math.sin(a);
  if (kind === 'bandit') {
    // Butcher's cleaver: short wooden grip and a broad, square chopper with a hanging hole near
    // the spine. Edge leads the chop (+perp side); the ink spine sits on the grip line.
    ctx.beginPath();
    ctx.moveTo(h[0] - c * 6, h[1] - s * 6);
    ctx.lineTo(h[0] + c * 2, h[1] + s * 2);
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = S.flash ? FLASH : AR_WOOD_DK;
    ctx.stroke();
    const bx = h[0] + c * 2.2, by = h[1] + s * 2.2, px = -s, py = c;
    const L = 16.5, W = 9.4;
    ctx.beginPath();
    ctx.moveTo(bx - px * 1.3, by - py * 1.3);
    ctx.lineTo(bx + c * L - px * 1.3, by + s * L - py * 1.3);
    ctx.lineTo(bx + c * (L + 0.9) + px * (W - 0.6), by + s * (L + 0.9) + py * (W - 0.6));
    ctx.quadraticCurveTo(bx + c * (L * 0.5) + px * (W + 1.6), by + s * (L * 0.5) + py * (W + 1.6), bx + c * 0.6 + px * (W - 0.4), by + s * 0.6 + py * (W - 0.4));
    ctx.closePath();
    ctx.fillStyle = S.flash ? FLASH : AR_STEEL;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - px * 1.0, by - py * 1.0);
    ctx.lineTo(bx + c * L - px * 1.0, by + s * L - py * 1.0);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // hanging hole
    ctx.beginPath();
    ctx.arc(bx + c * (L - 3) + px * 2.2, by + s * (L - 3) + py * 2.2, 1.3, 0, AR_TAU);
    ctx.fillStyle = INK;
    ctx.fill();
    if (S.fine) {
      ctx.beginPath();
      ctx.moveTo(bx + c * 1.8 + px * (W - 2.6), by + s * 1.8 + py * (W - 2.6));
      ctx.lineTo(bx + c * (L - 0.6) + px * (W - 2.9), by + s * (L - 0.6) + py * (W - 2.9));
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = AR_STEEL_MID;
      ctx.stroke();
    }
    arReach(bx + c * (L + 0.9) + px * W, by + s * (L + 0.9) + py * W); arReach(bx + c * L - px * 1.5, by + s * L - py * 1.5);
    arReach(bx + px * (W + 1), by + py * (W + 1)); arReach(h[0] - c * 7, h[1] - s * 7);
  } else if (kind === 'hunter') {
    // Recurve bow: limbs sweep back toward the archer and flick forward at the tips.
    const px = -s, py = c, L = 20;
    const t0x = h[0] - px * L - c * 4.5, t0y = h[1] - py * L - s * 4.5;
    const t1x = h[0] + px * L - c * 4.5, t1y = h[1] + py * L - s * 4.5;
    ctx.beginPath();
    ctx.moveTo(t0x + c * 2.6 - px * 1.2, t0y + s * 2.6 - py * 1.2);
    ctx.quadraticCurveTo(t0x - c * 0.4, t0y - s * 0.4, t0x + px * 1.8, t0y + py * 1.8);
    ctx.quadraticCurveTo(h[0] - px * 11 + c * 2.5, h[1] - py * 11 + s * 2.5, h[0] + c * 0.8, h[1] + s * 0.8);
    ctx.quadraticCurveTo(h[0] + px * 11 + c * 2.5, h[1] + py * 11 + s * 2.5, t1x - px * 1.8, t1y - py * 1.8);
    ctx.quadraticCurveTo(t1x - c * 0.4, t1y - s * 0.4, t1x + c * 2.6 + px * 1.2, t1y + s * 2.6 + py * 1.2);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = S.flash ? FLASH : '#a57b45';
    ctx.stroke();
    // String: straight, or pulled to the rear hand while drawing.
    const sx0 = t0x + px * 1.6, sy0 = t0y + py * 1.6, sx1 = t1x - px * 1.6, sy1 = t1y - py * 1.6;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    if (S.draw > 0.05) {
      const rx = P.rearHand[0], ry = P.rearHand[1];
      const mx = (sx0 + sx1) / 2, my = (sy0 + sy1) / 2;
      ctx.lineTo(mx + (rx - mx) * S.draw, my + (ry - my) * S.draw);
    }
    ctx.lineTo(sx1, sy1);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.draw > 0.25) {
      const rx = P.rearHand[0], ry = P.rearHand[1];
      const ex = h[0] + c * 8, ey = h[1] + s * 8;
      arArrowShape(ctx, rx, ry, ex, ey, S.flash, S.fine, S.cloth);
      arReach(ex + c * 4, ey + s * 4);
    }
    arReach(t0x, t0y); arReach(t1x, t1y);
  } else if (kind === 'brute') {
    // Meteor chain: links from the fist to an iron weight. Hangs (sags to the floor),
    // whips straight when swung, or whirls overhead (o.spin).
    let bx, by, cx, cy;
    const len = 40;
    if (S.spin) {
      const ph = S.t * 9;
      bx = h[0] + Math.cos(ph) * 38; by = h[1] - 3 + Math.sin(ph) * 7;
      cx = (h[0] + bx) / 2; cy = (h[1] + by) / 2;
      ctx.beginPath();
      ctx.ellipse(h[0], h[1] - 3, 38, 7, 0, ph - 2.4, ph - 0.25);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(38,59,60,0.35)';
      ctx.stroke();
    } else {
      bx = h[0] + c * len; by = h[1] + s * len;
      const floor = -6.5;
      let sag = S.stroke > 0.5 ? 1 : 6;
      if (by > floor) {
        const drop = floor - h[1];
        const run = Math.sqrt(Math.max(0, len * len - drop * drop)) * 0.85;
        bx = h[0] + (c >= 0 ? 1 : -1) * Math.max(6, run); by = floor;
        sag = 3;
      }
      cx = (h[0] + bx) / 2; cy = Math.min(-2, (h[1] + by) / 2 + sag);
    }
    arChain(ctx, h[0], h[1], cx, cy, bx, by, 3.6, 1.5);
    ctx.beginPath();
    ctx.arc(bx, by, 6.2, 0, AR_TAU);
    ctx.fillStyle = S.flash ? FLASH : AR_IRON_DK;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (!S.flash) {
      ctx.beginPath();
      ctx.arc(bx - 1, by - 1, 3.6, Math.PI * 1.05, Math.PI * 1.55);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(255,248,232,0.7)';
      ctx.stroke();
    }
    arReach(bx - 6.5, by - 6.5); arReach(bx + 6.5, by);
    if (S.spin) { arReach(h[0] - 39, h[1] - 10); arReach(h[0] + 39, h[1] - 10); }
  } else if (kind === 'monk') {
    // Crescent-and-spade staff: spade on the leading end, crescent on the trailing end.
    const f = 38, b = 31, px = -s, py = c;
    const ex = h[0] + c * f, ey = h[1] + s * f, kx = h[0] - c * b, ky = h[1] - s * b;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(ex, ey);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = S.flash ? FLASH : AR_WOOD;
    ctx.stroke();
    const steel = S.flash ? FLASH : AR_STEEL;
    // spade
    ctx.beginPath();
    ctx.moveTo(ex - c * 1 + px * 2.4, ey - s * 1 + py * 2.4);
    ctx.lineTo(ex + c * 7.5 + px * 5.0, ey + s * 7.5 + py * 5.0);
    ctx.quadraticCurveTo(ex + c * 6.2, ey + s * 6.2, ex + c * 7.5 - px * 5.0, ey + s * 7.5 - py * 5.0);
    ctx.lineTo(ex - c * 1 - px * 2.4, ey - s * 1 - py * 2.4);
    ctx.closePath();
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // crescent (horns point away from the hand)
    const ux = -c, uy = -s;
    ctx.beginPath();
    ctx.moveTo(kx + ux * 6.5 + px * 6.5, ky + uy * 6.5 + py * 6.5);
    ctx.quadraticCurveTo(kx - ux * 5.5, ky - uy * 5.5, kx + ux * 6.5 - px * 6.5, ky + uy * 6.5 - py * 6.5);
    ctx.quadraticCurveTo(kx + ux * 1.2, ky + uy * 1.2, kx + ux * 6.5 + px * 6.5, ky + uy * 6.5 + py * 6.5);
    ctx.closePath();
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.stroke();
    arReach(ex + c * 8 + px * 5, ey + s * 8 + py * 5); arReach(ex + c * 8 - px * 5, ey + s * 8 - py * 5);
    arReach(kx + ux * 7 + px * 7, ky + uy * 7 + py * 7); arReach(kx + ux * 7 - px * 7, ky + uy * 7 - py * 7);
  }
}

function arArrowShape(ctx, x0, y0, x1, y1, flash, fine, fletch, head = true) {
  const dx = x1 - x0, dy = y1 - y0, l = arLen(dx, dy) || 1, ux = dx / l, uy = dy / l;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * 2, y1 - uy * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = flash ? FLASH : AR_WOOD;
  ctx.stroke();
  if (head) {
  ctx.beginPath();
  ctx.moveTo(x1 + ux * 3.5, y1 + uy * 3.5);
  ctx.lineTo(x1 - ux * 2 - uy * 2.4, y1 - uy * 2 + ux * 2.4);
  ctx.lineTo(x1 - ux * 0.8, y1 - uy * 0.8);
  ctx.lineTo(x1 - ux * 2 + uy * 2.4, y1 - uy * 2 - ux * 2.4);
  ctx.closePath();
  ctx.fillStyle = flash ? FLASH : AR_STEEL_MID;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x0 + ux * 5, y0 + uy * 5);
  ctx.lineTo(x0 + ux * 0.5 - uy * 2.6, y0 + uy * 0.5 + ux * 2.6);
  ctx.lineTo(x0 + ux * 1.6, y0 + uy * 1.6);
  ctx.lineTo(x0 + ux * 0.5 + uy * 2.6, y0 + uy * 0.5 - ux * 2.6);
  ctx.closePath();
  ctx.fillStyle = flash ? FLASH : fletch;
  ctx.fill();
  if (fine) { ctx.lineWidth = 0.7; ctx.stroke(); }
}

// Talismans orbiting the priest: side = -1 draws the far half (behind), +1 the near half.
function arTalismans(ctx, S, P, side) {
  const n = 3;
  const cx = P.shoulder[0] - 3, cy = P.shoulder[1] + 3;
  for (let i = 0; i < n; i += 1) {
    const ph = S.t * 1.7 + i * (AR_TAU / n);
    const depth = Math.sin(ph);
    if ((depth < 0 ? -1 : 1) !== side) continue;
    let x, y, rot;
    if (S.cast) {
      x = S.hx + Math.cos(ph) * 15; y = S.hy - S.hr - 14 + depth * 3;
      rot = Math.cos(ph) * 0.25;
    } else {
      x = cx + Math.cos(ph) * 23; y = cy + depth * 6 + Math.sin(S.t * 2.3 + i * 2) * 2;
      rot = Math.sin(S.t * 3 + i) * 0.35;
    }
    const sc = 0.82 + depth * 0.14;
    arSlip(ctx, x, y, rot, 4.6 * sc, 9.6 * sc, S.fine, S.flash);
    arReach(x - 3.5, y - 6); arReach(x + 3.5, y + 6);
    if (S.cast && y - 6 < AR_YT) AR_YT = y - 6;
  }
}

function arFront(ctx, S, P) {
  const { kind } = S;
  if (kind === 'sorcerer') {
    if (!S.ko) {
      // the slip held between the front fingers
      const h = P.hand;
      arSlip(ctx, h[0] + 1.5, h[1] - 7, 0.15, 4.6, 9.8, S.fine, S.flash);
    }
    if (!S.ko) arTalismans(ctx, S, P, 1);
  } else if (kind === 'monk') {
    // Bodhi-seed prayer beads draped down the chest, drawn over the front arm so the pale loop
    // always reads; beads that would sit on the face are skipped. Wine mother bead + tassel.
    const T = S.T, sh = P.shoulder, hip = P.hip;
    const b0 = arTP(S, sh, 2.5, T[0] * 0.1, AR_P), bc = arTP(S, sh, -7, T[0] + 3.4, AR_Q), b2 = arTP(S, hip, 8, T[1] * 0.55, AR_R);
    const n = 9, br = 2.0, hx = S.hx, hy = S.hy, hr = S.hr + br;
    for (let i = 0; i <= n; i += 1) {
      const u = i / n, v = 1 - u;
      const x = v * v * b0[0] + 2 * v * u * bc[0] + u * u * b2[0];
      const y = v * v * b0[1] + 2 * v * u * bc[1] + u * u * b2[1];
      if ((x - hx) * (x - hx) + (y - hy) * (y - hy) < hr * hr) continue;
      ctx.beginPath();
      ctx.arc(x, y, i === n ? br * 1.45 : br, 0, AR_TAU);
      ctx.fillStyle = S.flash ? FLASH : i === n ? S.cloth : AR_BEAD;
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    arTail(ctx, b2[0], b2[1] + 2.4, Math.PI * 0.5, 5.5 + S.drive, 1.4, 0.5, S.wav, 0.5, 0, S.cloth, 3);
  } else if (kind === 'guard') {
    // Pauldron over the front shoulder.
    const p = arTP(S, P.shoulder, -1.2, S.T[0] * 0.35, AR_P);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.6, Math.PI * 0.95 + S.ht, Math.PI * 2.08 + S.ht);
    ctx.closePath();
    ctx.fillStyle = S.flash ? FLASH : AR_ARMOR;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.ko) return;
    // Round shield strapped to the front forearm, seen near edge-on (tall ellipse).
    const c = arAlong(P.elbow, P.hand, 0.6, AR_Q);
    const sx = c[0] + 3.5, sy = c[1] - 1;
    const rot = S.ht * 0.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 7, 17.5, rot, 0, AR_TAU);
    ctx.fillStyle = S.flash ? FLASH : '#62757e';
    ctx.fill();
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5.6, 16.1, rot, 0, AR_TAU);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = S.flash ? INK : S.paper;
    ctx.stroke();
    if (S.fine && !S.flash) {
      ctx.fillStyle = PAPER;
      for (let i = 0; i < 6; i += 1) {
        const a = i * AR_TAU / 6 + 0.3;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(a) * 3.6, sy + Math.sin(a) * 11.5, 0.55, 0, AR_TAU);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.ellipse(sx + 1.6, sy, 2.4, 3.6, rot, 0, AR_TAU);
    ctx.fillStyle = S.flash ? FLASH : AR_BRASS;
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.brace > 0 && !S.flash) {
      // Frontal-block tell: a paper glint runs along the leading rim with a star at its top,
      // so players learn to go round the back before the first clang.
      const pulse = 0.65 + 0.35 * Math.sin(S.t * 6), ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * S.brace * pulse;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 7.4, 17.9, rot, -1.25, 1.05);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = PAPER;
      ctx.stroke();
      const gx = sx + Math.cos(-1.25) * 7.4, gy = sy + Math.sin(-1.25) * 17.9, g = 3.4 + pulse * 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy - g); ctx.lineTo(gx + g * 0.28, gy - g * 0.28); ctx.lineTo(gx + g, gy);
      ctx.lineTo(gx + g * 0.28, gy + g * 0.28); ctx.lineTo(gx, gy + g); ctx.lineTo(gx - g * 0.28, gy + g * 0.28);
      ctx.lineTo(gx - g, gy); ctx.lineTo(gx - g * 0.28, gy - g * 0.28);
      ctx.closePath();
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.globalAlpha = ga;
    }
    arReach(sx + 7.5, sy - 18);
  } else if (kind === 'captive' && !S.freed && !S.ko) {
    // Cangue: a heavy wooden board locked around the neck, rope lashings and a notice tag.
    const nk = arAlong(P.shoulder, P.head, 0.44, AR_P);
    const half = 20, th = 3.9;
    const ax = S.nx * half, ay = S.ny * half, bx = S.tx * th, by = S.ty * th;
    ctx.beginPath();
    ctx.moveTo(nk[0] - ax - bx, nk[1] - ay - by);
    ctx.lineTo(nk[0] + ax - bx, nk[1] + ay - by);
    ctx.lineTo(nk[0] + ax + bx, nk[1] + ay + by);
    ctx.lineTo(nk[0] - ax + bx, nk[1] - ay + by);
    ctx.closePath();
    ctx.fillStyle = S.flash ? FLASH : '#ab8a5c';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (S.fine) {
      ctx.beginPath();
      ctx.moveTo(nk[0] - ax * 0.9 + S.tx * 0.6, nk[1] - ay * 0.9 + S.ty * 0.6);
      ctx.lineTo(nk[0] + ax * 0.9 + S.tx * 0.6, nk[1] + ay * 0.9 + S.ty * 0.6);
      ctx.moveTo(nk[0] - S.tx * th, nk[1] - S.ty * th);
      ctx.lineTo(nk[0] + S.tx * th, nk[1] + S.ty * th);
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#6f5636';
      ctx.stroke();
    }
    // notice tag hanging from the front half
    const tgx = nk[0] - S.nx * 8 - bx, tgy = nk[1] - S.ny * 8 - by;
    const sw = Math.sin(S.t * 2.2) * 0.12;
    arSlip(ctx, tgx - Math.sin(sw) * 5.2, tgy + 5.2, sw, 5, 10, S.fine, S.flash);
    // rope lashings binding the two halves of the board, with a short frayed tail in front
    ctx.beginPath();
    for (let j = -1; j <= 1; j += 2) {
      const u = 0.62 * j, lx = nk[0] + ax * u, ly = nk[1] + ay * u;
      ctx.moveTo(lx - bx * 1.35 - S.nx * 0.8, ly - by * 1.35 - S.ny * 0.8);
      ctx.lineTo(lx + bx * 1.35 + S.nx * 0.8, ly + by * 1.35 + S.ny * 0.8);
    }
    const rx = nk[0] + ax * 0.62 - bx, ry = nk[1] + ay * 0.62 - by;
    const swing = Math.sin(S.t * 1.8) * 1.5;
    ctx.moveTo(rx, ry);
    ctx.quadraticCurveTo(rx + 2 + swing, ry + 5, rx + 1 + swing * 1.6, ry + 10);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = S.flash ? FLASH : AR_ROPE;
    ctx.stroke();
    arReach(nk[0] - ax - 1, nk[1] - ay - 4); arReach(nk[0] + ax + 1, nk[1] + ay - 4);
  }
}

// ---------------------------------------------------------------- routing tables
// Kinds the renderer hands to this block. Ground effects draw in the stock pre-object effect
// pass (under the feet); post effects must draw after the depth-sorted bodies, with impact/slash.
export const ENEMY_PROJECTILES = new Set(['arrow', 'talisman', 'chainHook', 'smokePellet']);
export const ENEMY_GROUND_EFFECTS = new Set(['healSigil', 'stuckArrow']);
export const ENEMY_POST_EFFECTS = new Set(['healTether', 'ironBell', 'shieldClang', 'smokePuff', 'freedBurst']);

// ---------------------------------------------------------------- swing trails (local pose units)
// The archetype's attack trail in ARCHETYPES[kind].accent (steel blades, brass staff, iron chain,
// violet slip, moss bowstring), drawn in the fighter's local transform right after the body,
// where Renderer.drawAttackTrail runs for elements. stroke 0..1 as fighterPose returns it.
export function drawArchetypeTrail(ctx, kind, pose, stroke, reducedMotion = false, variant = '') {
  if (!(stroke >= 0.035) || !Object.hasOwn(ARCHETYPES, kind) || kind === 'captive') return;
  if (variant === 'whirl') return; // the meteor whirl's orbit is part of the body drawing
  const col = ARCHETYPES[kind].accent;
  const guard = kind === 'guard' && variant !== 'bash';
  const h = guard ? pose.rearHand : pose.hand; // the warden cuts with the rear-hand jian
  const a = arFin(pose.weaponAngle), c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
  ctx.save();
  ctx.globalAlpha *= stroke * (reducedMotion ? 0.6 : 0.9);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (reducedMotion) {
    // contact chevron only, as drawAttackTrail does under reduced motion
    const x = h[0] + c * 16, y = h[1] + s * 16;
    ctx.moveTo(x + 4, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x + 4, y + 7);
    ctx.lineWidth = 4;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.restore();
    return;
  }
  let wide = 7;
  if (kind === 'bandit' || guard || kind === 'brute' || kind === 'sorcerer') {
    // Overhead chop / over-shield cut / chain lash / slip throw: a tapered crescent about the
    // shoulder that swells toward the working part (cleaver body, sword tip, iron ball, hand).
    const reach = kind === 'bandit' ? 11 : guard ? 26 : kind === 'brute' ? 40 : 0;
    const tx = h[0] + c * reach, ty = h[1] + s * reach;
    const sx = pose.shoulder[0], sy = pose.shoulder[1];
    const r = arLen(tx - sx, ty - sy);
    const end = Math.atan2(ty - sy, tx - sx), span = kind === 'bandit' ? 2.0 : guard ? 1.15 : kind === 'brute' ? 1.25 : 1.3;
    const hw = (kind === 'bandit' ? 8 : guard ? 5 : kind === 'brute' ? 8 : 4) * 0.5, N = 12;
    for (let i = 0; i <= N; i += 1) {
      const u = i / N, an = end - span + span * u, w = hw * Math.sqrt(u);
      const x = sx + Math.cos(an) * (r + w), y = sy + Math.sin(an) * (r + w);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    for (let i = N; i >= 0; i -= 1) {
      const u = i / N, an = end - span + span * u, w = hw * Math.sqrt(u);
      ctx.lineTo(sx + Math.cos(an) * (r - w), sy + Math.sin(an) * (r - w));
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, r, end - span * 0.55, end - 0.02);
    ctx.lineWidth = guard || kind === 'sorcerer' ? 1.3 : 2.2;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
    ctx.restore();
    return;
  } else if (kind === 'guard') {
    // Shield Rush: impact arcs ahead of the shield and speed lines behind the body.
    const fx = pose.hand[0] + 9, fy = pose.hand[1] + 2;
    ctx.arc(fx - 6, fy, 15, -0.95, 0.95);
    ctx.moveTo(fx + 5 + 15 * Math.cos(-0.7), fy + 15 * Math.sin(-0.7));
    ctx.arc(fx + 5, fy, 15, -0.7, 0.7);
    for (let j = 0; j < 3; j += 1) {
      const y = pose.shoulder[1] + 2 + j * 10;
      ctx.moveTo(pose.hip[0] - 14 - j * 3, y);
      ctx.lineTo(pose.hip[0] - 34 - j * 5, y);
    }
    wide = 2.6;
  } else if (kind === 'monk') {
    // Crescent Thrust: speed lines trailing the spade just outside its blade, and a pop ahead.
    const tx = h[0] + c * 46, ty = h[1] + s * 46;
    for (let j = -1; j <= 1; j += 2) {
      ctx.moveTo(tx - c * 9 + px * j * 6.8, ty - s * 9 + py * j * 6.8);
      ctx.lineTo(tx - c * 27 + px * j * 5.6, ty - s * 27 + py * j * 5.6);
    }
    ctx.moveTo(tx + c * 2 + Math.cos(a - 0.9) * 7, ty + s * 2 + Math.sin(a - 0.9) * 7);
    ctx.arc(tx + c * 2, ty + s * 2, 7, a - 0.9, a + 0.9);
    wide = 2;
  } else {
    // hunter release: the bowstring twang either side of the grip, and the arrow's line
    ctx.moveTo(h[0] - 9, h[1] - 15); ctx.quadraticCurveTo(h[0] - 14, h[1], h[0] - 9, h[1] + 15);
    ctx.moveTo(h[0] - 14, h[1] - 12); ctx.quadraticCurveTo(h[0] - 19, h[1], h[0] - 14, h[1] + 12);
    ctx.moveTo(h[0] + 10, h[1]); ctx.lineTo(h[0] + 30, h[1]);
    wide = 2.6;
  }
  ctx.lineWidth = wide;
  ctx.strokeStyle = col;
  ctx.stroke();
  if (wide >= 4) {
    ctx.lineWidth = wide > 6 ? 2.4 : 1.6;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- iron bell (monk)
// Size the bell around everything the monk draws (metrics in pose units from the same draw;
// read them before the next body draw reuses the object). Returns a reused { h, w } in world px.
// The hanging loop's top is IRON_BELL_CROWN * h above the feet: lift the HP bar above it.
export const IRON_BELL_CROWN = 1.12;
const AR_BELL = { h: 72, w: 36 };
export function ironBellSize(M, scale = 1) {
  const top = Math.min(arFin(M.gearTop), arFin(M.top));
  const h = Math.max(72, 10 - top) * scale;
  const half = (Math.max(-arFin(M.left), arFin(M.right)) + 6) * scale;
  AR_BELL.h = h;
  AR_BELL.w = Math.max(h * 0.5, half);
  return AR_BELL;
}
// Brushed-brass bell shell around the meditating monk, feet at (x, y). k 0..1 fades it,
// ring 0..1 adds sound ripples on impact.
export function drawIronBell(ctx, x, y, b, k = 1, ring = 0, time = 0, reducedMotion = false) {
  const h = b.h, w = b.w;
  const fade = arClamp(k * 2);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // dome profile: round shoulders (the staff tip sits at ~0.9h, where the bell is still 0.58w wide)
  ctx.beginPath();
  ctx.moveTo(x - w, y + 1);
  ctx.bezierCurveTo(x - w * 0.92, y - h * 0.5, x - w * 0.82, y - h * 1.04, x, y - h * 1.04);
  ctx.bezierCurveTo(x + w * 0.82, y - h * 1.04, x + w * 0.92, y - h * 0.5, x + w, y + 1);
  ctx.closePath();
  ctx.globalAlpha = 0.16 * fade;
  ctx.fillStyle = '#f3e3b0';
  ctx.fill();
  ctx.globalAlpha = 0.85 * fade;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a98b49';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y + 1, w, 4.5, 0, 0, Math.PI);
  ctx.moveTo(x - w * 0.86, y - h * 0.3);
  ctx.quadraticCurveTo(x, y - h * 0.25, x + w * 0.86, y - h * 0.3);
  ctx.moveTo(x - 4, y - h * 1.04);
  ctx.lineTo(x - 3, y - h * 1.12);
  ctx.lineTo(x + 3, y - h * 1.12);
  ctx.lineTo(x + 4, y - h * 1.04);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (!reducedMotion) {
    // a slow highlight sweeping round the dome
    const u = (time * 0.35) % 1, gx = x - w * 0.62 + u * w * 1.24;
    ctx.globalAlpha = 0.35 * fade * Math.sin(u * Math.PI);
    ctx.beginPath();
    ctx.moveTo(gx, y - h * 0.86);
    ctx.quadraticCurveTo(gx + w * 0.06, y - h * 0.6, gx, y - h * 0.4);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
  }
  if (ring > 0) {
    const cy = y - h * 0.55;
    ctx.strokeStyle = '#a98b49';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i += 1) {
      const rr = w + 6 + i * 6 + (1 - ring) * 10;
      const ex = rr * Math.cos(0.5), ey = rr * Math.sin(0.5);
      ctx.globalAlpha = ring * (0.7 - i * 0.2) * fade;
      ctx.beginPath();
      ctx.moveTo(x + ex, cy - ey);
      ctx.arc(x, cy, rr, -0.5, 0.5);
      ctx.moveTo(x - ex, cy + ey); // arc(PI - 0.5 ..) starts below the centre line
      ctx.arc(x, cy, rr, Math.PI - 0.5, Math.PI + 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- projectiles (world space)
// Floor shadow for an enemy projectile at its depth (call it in the shadow pass).
export function drawEnemyProjectileShadow(ctx, p) {
  const d = Number.isFinite(p.depth) ? p.depth : p.y;
  const z = Math.max(0, arFin(p.z));
  const w = p.kind === 'arrow' ? 14 : p.kind === 'chainHook' ? 9 : 6;
  const k = 1 / (1 + z / 140);
  ctx.save();
  ctx.globalAlpha = 0.07 + 0.13 * k;
  ctx.beginPath();
  ctx.ellipse(p.x, d + 1, w * k, 2.3 * k, 0, 0, AR_TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
}

export function drawEnemyProjectile(ctx, p, time = 0, reducedMotion = false) {
  const ang = Math.atan2(p.vy || 0, p.vx || 1);
  const t = reducedMotion ? 0 : time;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.kind === 'arrow') {
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    if (!reducedMotion) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(-34, -2.5); ctx.lineTo(-20, -2.5);
      ctx.moveTo(-40, 2.5); ctx.lineTo(-24, 2.5);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    arArrowShape(ctx, -18, 0, 13, 0, false, true, ARCHETYPES.hunter.color);
  } else if (p.kind === 'talisman') {
    // Homing slip: it tumbles (x scale flips) and sheds violet sparks.
    const col = ARCHETYPES.sorcerer.color;
    ctx.translate(p.x, p.y);
    const back = Math.atan2(-(p.vy || 0), -(p.vx || 1)), bc = Math.cos(back), bs = Math.sin(back);
    for (let i = 1; i <= 3; i += 1) {
      const d = i * 8, wob = Math.sin(t * 14 + i * 1.7) * 3;
      const x = bc * d - bs * wob, y = bs * d + bc * wob;
      const r = 3.2 - i * 0.6;
      ctx.globalAlpha = 0.85 - i * 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
    // lilac glow with a faint ink rim so it holds on the pale floors
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, AR_TAU);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.rotate(ang + Math.PI / 2 + Math.sin(t * 9) * 0.35);
    if (!reducedMotion) ctx.scale(0.35 + 0.65 * Math.abs(Math.cos(t * 7)), 1);
    arSlip(ctx, 0, 0, 0, 8, 16, true, false);
  } else if (p.kind === 'chainHook') {
    // Thrown chain hook: links run back to the brute's fist (p.ox, p.oy).
    const ox = Number.isFinite(p.ox) ? p.ox : p.x - Math.cos(ang) * 60;
    const oy = Number.isFinite(p.oy) ? p.oy : p.y - Math.sin(ang) * 60;
    arChain(ctx, ox, oy, (ox + p.x) / 2, (oy + p.y) / 2 + 4, p.x - Math.cos(ang) * 5, p.y - Math.sin(ang) * 5, 4.4, 1.7);
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.arc(-5, 0, 2.6, 0, AR_TAU);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(-3, 0);
      ctx.quadraticCurveTo(6, side * 1, 7, side * 8);
      ctx.quadraticCurveTo(5, side * 4, 1, side * 3.8);
    }
    ctx.moveTo(-3, 0);
    ctx.lineTo(10, 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = AR_IRON;
    ctx.stroke();
  } else if (p.kind === 'smokePellet') {
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, AR_TAU);
    ctx.fillStyle = '#3d4447';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1.5, -4.5);
    ctx.quadraticCurveTo(4, -8, 2.5, -10);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const f = reducedMotion ? 1 : 0.7 + Math.abs(Math.sin(t * 30)) * 0.6;
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2 + t * 6;
      ctx.moveTo(2.5, -10);
      ctx.lineTo(2.5 + Math.cos(a) * 3.2 * f, -10 + Math.sin(a) * 3.2 * f);
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#f2b54f';
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- effects (world space)
// Smoke puff cluster: [dx, dy, r] as fractions of e.r, feet-origin (dy up is negative).
const AR_PUFF = new Float32Array([
  -0.80, -0.34, 0.40,
  0.82, -0.32, 0.38,
  -0.32, -0.30, 0.50,
  0.34, -0.36, 0.50,
  -0.62, -0.98, 0.44,
  0.60, -1.00, 0.46,
  0.00, -0.80, 0.60,
  -0.18, -1.44, 0.42,
  0.36, -1.40, 0.36,
]);
// One nonzero path of every puff (so overlaps never double up).
function arPuffs(ctx, x, y, r, spread, size, grow, ox, oy, t) {
  ctx.beginPath();
  for (let i = 0; i < AR_PUFF.length; i += 3) {
    const wob = t ? Math.sin(t * 2.3 + i * 0.57) * 0.05 : 0;
    const px = x + (AR_PUFF[i] + wob) * r * spread + ox;
    const py = y + AR_PUFF[i + 1] * r * spread + oy;
    const pr = Math.max(0, AR_PUFF[i + 2] * r * size + grow);
    ctx.moveTo(px + pr, py);
    ctx.arc(px, py, pr, 0, AR_TAU);
  }
}

export function drawEnemyEffect(ctx, e, time = 0, reducedMotion = false) {
  const life = Number.isFinite(e.life) ? e.life : 1;
  const k = arClamp(life / (e.maxLife || 1)); // 1 fresh -> 0 gone
  const p = 1 - k;
  const t = reducedMotion ? 0 : time;
  if (e.kind === 'ironBell') {
    AR_BELL.h = e.h || 72; AR_BELL.w = e.w || AR_BELL.h * 0.5;
    drawIronBell(ctx, e.x, e.y, AR_BELL, k, arFin(e.ring), time, reducedMotion);
    return;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (e.kind === 'healSigil') {
    // Octagonal ward under the healed ally: slips at the corners, motes rising.
    const col = ARCHETYPES.sorcerer.color, r = e.r || 30, sq = 0.36;
    const fade = Math.min(1, k * 3);
    ctx.globalAlpha = 0.14 * fade;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r, r * sq, 0, 0, AR_TAU);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 0.9 * fade;
    const rot = t * 0.7;
    ctx.beginPath();
    for (let i = 0; i <= 8; i += 1) {
      const a = rot + i * AR_TAU / 8;
      const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r * sq;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r * 0.62, r * 0.62 * sq, 0, 0, AR_TAU);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (let i = 0; i < 8; i += 2) {
      const a = rot + i * AR_TAU / 8;
      arSlip(ctx, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * sq - 4, 0, 3.6, 7.2, false, false);
    }
    for (let i = 0; i < 6; i += 1) {
      const u = reducedMotion ? 0.2 + (i % 3) * 0.25 : ((time * 0.9 + i / 6) % 1);
      const x = e.x + Math.cos(i * 2.4) * r * 0.55, y = e.y - u * 46;
      ctx.globalAlpha = fade * (1 - u) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y - 3); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 2, y);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? col : AR_SLIP;
      ctx.fill();
    }
  } else if (e.kind === 'healTether') {
    // Dashed violet thread from the priest's slip hand to the ally being healed, over a faint
    // ink under-stroke so it holds on pale floors.
    const col = ARCHETYPES.sorcerer.color;
    const mx = (e.x + e.tx) / 2, my = Math.min(e.y, e.ty) - 26;
    const fade = Math.min(1, k * 3);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(mx, my, e.tx, e.ty);
    ctx.globalAlpha = 0.22 * fade;
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.globalAlpha = 0.85 * fade;
    ctx.setLineDash(AR_DASH);
    ctx.lineDashOffset = -t * 24;
    ctx.lineWidth = 2;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.setLineDash(AR_NODASH);
    ctx.globalAlpha = fade;
    arSlip(ctx, mx * 0.5 + (e.x + e.tx) * 0.25, my * 0.5 + (e.y + e.ty) * 0.25, Math.sin(t * 4) * 0.3, 4.4, 9, false, false);
  } else if (e.kind === 'shieldClang') {
    // Blocked hit on the warden's shield: a paper star, ink chevrons, steel sparks.
    const s = (e.r || 12) * (0.7 + p * 0.6), dir = e.direction < 0 ? -1 : 1;
    ctx.translate(e.x, e.y);
    ctx.scale(dir, 1);
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4 + 0.2, r = i % 2 ? s * 0.32 : s;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 1; i += 1) {
      const a = Math.PI + i * 0.55;
      ctx.moveTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2);
      ctx.lineTo(Math.cos(a) * s * 1.75, Math.sin(a) * s * 1.75);
    }
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -1.2 + i * 0.6, r0 = s * 0.8 + p * 10, r1 = r0 + 4;
      ctx.moveTo(-Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(-Math.cos(a) * r1, Math.sin(a) * r1);
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#d8b25a';
    ctx.stroke();
  } else if (e.kind === 'smokePuff') {
    // Ink-wash smoke bomb, big enough to swallow a bandit (default r 40: ~96 x 78 px at peak).
    // It bursts out over the first quarter, holds, then the puffs shrink away as they rise
    // (dissolving instead of fading, so the ink rim never shows through a translucent body).
    const r = e.r || 40;
    const burst = 1 - (1 - Math.min(1, p * 4)) ** 2;
    const spread = 0.72 + 0.28 * burst;
    const thin = p < 0.5 ? 1 : 1 - ((p - 0.5) / 0.5) ** 1.4;
    const size = (0.5 + 0.5 * burst) * thin;
    const lift = -p * r * 0.32;
    // The rim thins out first (p 0.55 -> 0.85) while the wash is still opaque over it, then the
    // last small puffs fade: the body is never translucent over a strong rim.
    const rimA = p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.3);
    const bodyA = p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25);
    if (rimA > 0) {
      ctx.globalAlpha = rimA;
      arPuffs(ctx, e.x, e.y, r, spread, size, 1.6, 0, lift, t);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.globalAlpha = bodyA;
    arPuffs(ctx, e.x, e.y, r, spread, size, 0, 0, lift, t);
    ctx.fillStyle = '#a2a69d';
    ctx.fill();
    arPuffs(ctx, e.x, e.y, r, spread, size * 0.74, 0, -r * 0.08, lift - r * 0.1, t);
    ctx.fillStyle = '#d2d3c8';
    ctx.fill();
    ctx.globalAlpha = 1;
    if (thin > 0.45) {
      // paper curls on the big puffs and two ink wisps peeling off the edge
      const cx = e.x, cy = e.y + lift, q = r * spread, z = r * size;
      ctx.beginPath();
      ctx.arc(cx - q * 0.1, cy - q * 0.84, z * 0.26, Math.PI * 1.0, Math.PI * 1.7);
      ctx.moveTo(cx - q * 0.62 - z * 0.2, cy - q * 1.02);
      ctx.arc(cx - q * 0.62, cy - q * 1.02, z * 0.2, Math.PI, Math.PI * 1.65);
      ctx.moveTo(cx + q * 0.54 - z * 0.18, cy - q * 0.4);
      ctx.arc(cx + q * 0.54, cy - q * 0.4, z * 0.18, Math.PI * 1.05, Math.PI * 1.75);
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = PAPER;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + q * 1.1, cy - q * 0.9);
      ctx.quadraticCurveTo(cx + q * 1.32, cy - q * 1.2, cx + q * 1.16, cy - q * 1.38);
      ctx.moveTo(cx - q * 1.08, cy - q * 1.24);
      ctx.quadraticCurveTo(cx - q * 1.3, cy - q * 1.5, cx - q * 1.1, cy - q * 1.66);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  } else if (e.kind === 'freedBurst') {
    // Cangue splits in two and tumbles away; rope bits and the notice tag flutter down.
    const x = e.x, y = e.y, hgt = e.h || 60, s = hgt / 66;
    const by = y - 40 * s;
    const py = Math.min(y - 3, by - 26 * p + 70 * p * p); // little hop, then down to the floor
    for (let side = -1; side <= 1; side += 2) {
      const px = x + side * (9 + p * 34) * s;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(side * p * 2.6);
      ctx.beginPath();
      ctx.rect(-8 * s, -3 * s, 16 * s, 6 * s);
      ctx.fillStyle = '#ab8a5c';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * -8 * s, 0, 2.2 * s, -Math.PI / 2, Math.PI / 2, side > 0);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const rx = x + (i - 1) * 14 * s + Math.sin(i * 3 + p * 5) * 3, ry = Math.min(y - 2, by + 6 + p * 40 + i * 4);
      ctx.moveTo(rx - 3, ry);
      ctx.quadraticCurveTo(rx, ry - 3, rx + 3.5, ry + 1);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = AR_ROPE;
    ctx.stroke();
    arSlip(ctx, x + 6 + Math.sin(p * 9) * 8, Math.min(y - 5, by + p * 34), Math.sin(p * 11) * 0.8, 5, 10, false, false);
    if (p < 0.35) {
      ctx.globalAlpha = 1 - p / 0.35;
      ctx.beginPath();
      ctx.arc(x, by, 12 + p * 50, 0, AR_TAU);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = PAPER;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  } else if (e.kind === 'stuckArrow') {
    // A volley arrow (ballistic, so it comes down steeply) stuck in the flagstones. e.angle is
    // the screen-space flight angle at impact, atan2(vy, vx) with +y down; it is forced to
    // point into the floor at >= 52deg so it never reads as a dropped stick. Head and the front
    // of the shaft are buried; it quivers for 0.3 s after landing.
    let a = Number.isFinite(e.angle) ? e.angle : 1.15;
    if (Math.sin(a) < 0) a = -a;
    const MIN = 0.9;
    if (a < MIN) a = MIN; else if (a > Math.PI - MIN) a = Math.PI - MIN;
    const age = (e.maxLife || 1) - life;
    if (!reducedMotion && age >= 0 && age < 0.3) a += Math.sin(age * 75) * 0.16 * (1 - age / 0.3);
    const ux = Math.cos(a), uy = Math.sin(a), side = ux < 0 ? -1 : 1;
    ctx.globalAlpha = Math.min(1, k * 2.5);
    // entry chip: split flagstone lips, a crack, and grit thrown back toward the archer
    ctx.beginPath();
    ctx.moveTo(e.x - 6, e.y + 0.8); ctx.lineTo(e.x - 2, e.y);
    ctx.moveTo(e.x + 2, e.y); ctx.lineTo(e.x + 6.5, e.y + 1.2);
    ctx.moveTo(e.x + side * 0.8, e.y + 0.6); ctx.lineTo(e.x + side * 2.6, e.y + 3);
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(e.x - side * 5.5 - 0.6, e.y - 2.6, 1.3, 1.3);
    ctx.fillRect(e.x - side * 8 - 0.5, e.y - 1.2, 1.1, 1.1);
    arArrowShape(ctx, e.x - ux * 17, e.y - uy * 17, e.x + ux * 1.2, e.y + uy * 1.2, false, false, ARCHETYPES.hunter.color, false);
  }
  ctx.restore();
}

// "Free the captive" prompt: a small ink-edged paper tag pointing at the captive, bobbing.
const AR_TEXT_W = new Map(); // measured label widths (the font never changes)
export function drawRescuePrompt(ctx, x, y, time = 0, text = 'E · FREE', reducedMotion = false) {
  const bob = reducedMotion ? 0 : Math.sin(time * 4) * 2;
  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let tw = AR_TEXT_W.get(text);
  if (tw === undefined) {
    if (AR_TEXT_W.size > 16) AR_TEXT_W.clear();
    tw = ctx.measureText(text).width;
    AR_TEXT_W.set(text, tw);
  }
  const w = tw + 14, hh = 8.5;
  const x0 = x - w / 2, yy = y + bob;
  ctx.beginPath();
  ctx.moveTo(x0, yy - hh);
  ctx.lineTo(x0 + w, yy - hh);
  ctx.lineTo(x0 + w, yy + hh);
  ctx.lineTo(x + 4, yy + hh);
  ctx.lineTo(x, yy + hh + 5);
  ctx.lineTo(x - 4, yy + hh);
  ctx.lineTo(x0, yy + hh);
  ctx.closePath();
  ctx.fillStyle = '#fbf5e9';
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#775723';
  ctx.fillText(text, x, yy + 0.5);
  ctx.restore();
}
