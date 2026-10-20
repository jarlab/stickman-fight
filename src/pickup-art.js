// Fourfold consumables and pickups art (Wuxia ink style, see src/fighter-art.js): the ground
// pickup treatment (bob, glint, rarity ring, category pip, E seal, despawn blink and dissolve),
// the six use poses with their item track, the weapon stow while consuming, flung and knocked
// items, the consume sparkle, the planted censer field and the timed-buff overlays.
// Ported unchanged from the approved pickups preview (output/asset-previews/pickups-assets.js,
// its ASSETS block). Its only outside dependencies are INK and PAPER. No DOM, gradients,
// shadowBlur or text; keyframes, tracks, dashes and shard tables are module constants.
// CONSUMABLES is the item spec the engine reads (use time, effect point, spawn weight, rarity);
// the effect amounts live in src/data.js (ITEM_EFFECTS). The renderer wires the drawing in.
import { INK, PAPER } from './fighter-art.js';

// Consumables & pickups, "Wuxia ink" set. Original designs: porcelain, clay, bamboo, bronze,
// lacquer and paper drawn with the fighters' ink outline (1.2-1.6 px at 1x) on the pale floor.
// Pure canvas functions (ctx, params): no DOM, no gradients, no shadowBlur, no text, and no
// allocation in the per-frame draw paths (keyframes, dashes and scratch points are module
// constants). consumePose returns a fresh pose (like the renderer's own poseWith/blendPose)
// and consumeFling allocates one object per fling event.
// Item space: origin = ground contact point (bottom centre), -y up, 1 unit = 1 px at 1x.
// Pose space: fighter feet origin, facing +x (the renderer's drawFighter transform).
//
//  drawConsumable(ctx, item, time, near, reduced)  ground pickup (state.weapons entry
//      {x, y, kind, life, variant?, seed?}): bob, glint, rarity ring, category pip, last-5 s blink
//      + countdown arc + paper-wash dissolve, E seal only when near (the item E would take).
//      Returns false when item.kind is not a consumable (draw it as a weapon).
//  drawConsumableItem(ctx, kind, t, variant, flags, k)  bare item at the current transform.
//      flags: CP_HELD (in-hand form: bun on its paper, pill alone), CP_STILL (no steam/smoke/orbit).
//      k: 0..1 use progress (jar cap off, bites taken).
//  consumePose(base, kind, p, from, out?)  use pose (fresh object unless `out` is passed):
//      base -> lift -> use -> recover -> base over p = 0..1 (CONSUMABLES[kind].useTime). Keys
//      are additive to the base stance. pose.item = [shown, x, y, angle, scale, k] places the
//      item's grip point in pose space on a continuous track (ground spot -> hand -> mouth/
//      floor/chest); pose.release[0] = 1 once a vessel has been let go (spawn consumeFling).
//      from = [dx, dy] ground spot of the item relative to the feet, pose space (default [24, 0]).
//  drawConsumeHeld(ctx, kind, variant, pose, t)  the item where consumePose put it; call from
//      drawFighterBody's beforeFrontArm (under the front fist). Replaces the weapon callback
//      while consuming; the weapon is stowed on the back (consumeStow) instead.
//  consumeStow(pose, weapon) -> [start, end]  back-slung line for drawHeldWeapon (behind body).
//  consumeFling(pose, kind, variant, x, y, scale, facing, knocked) / drawFlung(ctx, fling, age)
//      tossed empty vessel (shatters or bounces) or an item knocked out of the hand by a hit.
//  drawConsumeSparkle(ctx, kind, variant, x, y, p, h, facing, reduced)  consume burst over a
//      fighter (x, y = feet), p = 0..1 over CP_SPARKLE_TIME.
//  consumableFade(life, reduced) / drawDespawnPuff(ctx, x, y, p)  despawn alpha and dissolve.
//  drawIncenseAura(ctx, x, y, t, remaining, color)  planted-censer regen field (ground layer).
//  drawConsumableBuff(ctx, kind, x, y, h, t, remaining, layer)  timed-buff overlay at the torso;
//      layer 0 before the body (far half), layer 1 after it (near half).
const CP_TAU = Math.PI * 2;
const CP_HELD = 1, CP_STILL = 4;
const CP_SPARKLE_TIME = 0.7;
const CP_BLINK_START = 5;
const CP_DISSOLVE = 0.35;
const CP_GRAV = 1300;
const CP_FLING_LIFE = 1.3; // upper bound for pruning flung items (s)
const CP_PLANT_X = 26; // planted censer origin, pose space x (engine: f.x + facing * CP_PLANT_X)
const CP_WHITE = '#fffdf1';
const CP_SEAL = '#b8432f';
const CP_GOLD = '#dfae3d';
const CP_GOLD_HOT = '#ffd35c';
const CP_GOLD_DEEP = '#a8771f';
const CP_JADE = '#5f9884';
const CP_CORK = '#b58b58';
const CP_CELADON = '#a9c9a0';
const CP_CELADON_DEEP = '#7fa577';
const CP_HEAL = '#56905d';
const CP_HEAL_HI = '#4fa35c';
const CP_QI = '#427fa7';
const CP_QI_HI = '#3a8fd0';
const CP_CLAY = '#c79967';
const CP_CLAY_DEEP = '#9c6e46';
const CP_CLOTH = '#4f86a6';
const CP_WINE = '#e2b65a';
const CP_PEACH = '#f5d3ab';
const CP_BLUSH = '#e8877e';
const CP_CREASE = '#bd635b';
const CP_FLESH = '#fbe3b2';
const CP_LEAF = '#6f9a5c';
const CP_LEAF_LIGHT = '#a7c88c';
const CP_BAMBOO = '#c9a368';
const CP_BAMBOO_TOP = '#dec28b';
const CP_BAMBOO_DEEP = '#9f7b45';
const CP_LINER = '#e3cf9c';
const CP_BUN = '#fdf6e4';
const CP_BUN_SHADE = '#e2d0aa';
const CP_BUN_PLEAT = '#c7b28c';
const CP_STEAM = '#97aba8';
const CP_GOURD = '#d3bd86';
const CP_GOURD_DEEP = '#a38b56';
const CP_LACQUER = '#a6402f';
const CP_LACQUER_DEEP = '#7a2e24';
const CP_LACQUER_IN = '#86342a';
const CP_BRONZE = '#a8844d';
const CP_BRONZE_DEEP = '#7a5d35';
const CP_STICK = '#8a5a3a';
const CP_EMBER = '#e2603c';
const CP_SMOKE = '#8c9e9a';
const CP_ORBS = {
  air: { c: '#388e8b', tint: '#d3e6e1', deep: '#2b6d6a' },
  water: { c: '#397fbe', tint: '#d5e3f1', deep: '#2c6497' },
  earth: { c: '#9a7935', tint: '#ebdfc1', deep: '#76592a' },
  fire: { c: '#c5573f', tint: '#f3d4c8', deep: '#9b4130' },
};
const CP_DASH = [3, 4];
const CP_SPARK_DASH = [4.5, 3.5];
const CP_AURA_DASH = [10, 8];
const CP_NO_DASH = [];

// Gameplay spec. cat = category cue (hp green cross, en blue diamond, pow gold star).
// weight = relative spawn weight in spawnWeapon's consumable roll (0 = drop only).
// applyAt = use progress at which the engine applies the effect (and plants the censer).
// shadow = ground-shadow radius; hover/bob = px above the floor; h = drawn height;
// grip = item point that the hand (or a flight) carries; seat = where that held form sits in the
// ground drawing (bun on its steamer, pill over its dish); held = scale in the hand;
// hold = extra fist offset for this kind (the bun sits on top of the fist, not behind it);
// rad = rest radius around the grip for a flung item; fling = toss after use (null = none).
const CONSUMABLES = {
  heal: { name: 'Herbal tonic', use: 'drink', cat: 'hp', color: CP_HEAL, spark: CP_HEAL_HI, rarity: 'common', weight: 22,
    useTime: 0.5, applyAt: 0.66, effect: 'Restore health', amount: '+40 HP', duration: 'instant', source: 'Field spawn',
    shadow: 13, hover: 2, bob: 3, h: 34, grip: [0, -10], seat: [0, 0], held: 0.6, rad: 8, glint: [-6.5, -15],
    fling: { vx: 70, vy: 90, spin: 7, mode: 'shatter' }, shard: [CP_CELADON, PAPER] },
  energy: { name: 'Qi wine jar', use: 'jar', cat: 'en', color: CP_QI, spark: CP_QI_HI, rarity: 'common', weight: 18,
    useTime: 0.6, applyAt: 0.66, effect: 'Restore energy', amount: '+55 EN', duration: 'instant', source: 'Field spawn',
    shadow: 15, hover: 2, bob: 3, h: 30, grip: [0, -12], seat: [0, 0], held: 0.68, rad: 10, glint: [-8, -14],
    fling: { vx: 60, vy: 140, spin: 4, mode: 'shatter' }, shard: [CP_CLAY, CP_CLAY_DEEP] },
  bun: { name: 'Steamed bun', use: 'eat', cat: 'hp', color: '#6f9a55', spark: '#5aa452', rarity: 'common', weight: 26,
    useTime: 0.3, applyAt: 0.66, effect: 'Small, fast heal (shortest use time)', amount: '+15 HP', duration: 'instant', source: 'Field spawn; 2 from broken crates',
    shadow: 14, hover: 1.5, bob: 2, h: 18, grip: [0, -5], seat: [0, -6.6], hold: [-1, -3.5], held: 0.85, rad: 6, glint: [-5.5, -14], fling: null },
  gourd: { name: 'Ginseng tea gourd', use: 'drink', cat: 'en', color: '#3f86a8', spark: CP_QI_HI, rarity: 'uncommon', weight: 12,
    useTime: 0.5, applyAt: 0.66, effect: 'Qi flow: energy now, then energy over time', amount: '+20 EN, then +6 EN/s', duration: '8 s', source: 'Field spawn',
    shadow: 11, hover: 2, bob: 3, h: 28, grip: [0, -15], seat: [0, 0], held: 0.62, rad: 7, glint: [-4.5, -10],
    fling: { vx: 85, vy: -160, spin: 10, mode: 'bounce' } },
  incense: { name: 'Sandalwood censer', use: 'plant', cat: 'hp', color: '#b07a3c', spark: CP_HEAL_HI, rarity: 'uncommon', weight: 8,
    useTime: 0.7, applyAt: 0.42, effect: 'Plants a regen field (r 90) for the placer\'s team', amount: '+4 HP/s', duration: '10 s', source: 'Field spawn',
    shadow: 13, hover: 1, bob: 1.5, h: 30, grip: [7, -16], seat: [0, 0], held: 0.7, rad: 9, glint: [-6, -9], fling: null },
  peach: { name: 'Longevity peach', use: 'eat', cat: 'hp', color: '#d0675f', spark: '#dc6a62', rarity: 'rare', weight: 4,
    useTime: 0.55, applyAt: 0.66, effect: 'Big heal; clears burn, slow and freeze', amount: '+80 HP', duration: 'instant', source: 'Field spawn (rare); story shrines',
    shadow: 13, hover: 3, bob: 3, h: 25, grip: [0, -10], seat: [0, 0], held: 0.6, rad: 9, glint: [-5.5, -15], fling: null },
  pill: { name: 'Golden elixir pill', use: 'pill', cat: 'pow', color: '#c9932c', spark: '#e2a526', rarity: 'rare', weight: 4,
    useTime: 0.45, applyAt: 0.66, effect: 'Power: +30% damage, +20% knockback', amount: 'x1.3 dmg, x1.2 kb', duration: '8 s', source: 'Field spawn (rare)',
    shadow: 12, hover: 1, bob: 2, h: 23, grip: [0, 0], seat: [0, -15], held: 0.75, rad: 5, glint: [-2.6, -19.5], fling: null },
  orb: { name: 'Spirit orb', use: 'absorb', cat: 'en', color: '#388e8b', spark: null, rarity: 'rare', weight: 0,
    useTime: 0.5, applyAt: 0.66, effect: 'Burst energy; own element also clears burst cooldown', amount: '+50 EN (own: +100)', duration: 'instant', source: 'Guardian phase break; every 3rd wave',
    shadow: 9, hover: 20, bob: 4, h: 22, grip: [0, -11], seat: [0, 0], held: 0.85, rad: 8, glint: [-3, -14], fling: null },
};
const CP_KNOCK = { vx: -100, vy: -190, spin: 11 };
// Shatter layout: shard spread along the floor, hop height and size (irregular on purpose).
const CP_SHARD_D = [-15, -7.5, -2.5, 3.5, 9.5, 16.5], CP_SHARD_H = [6, 10, 4, 8, 5, 9], CP_SHARD_R = [2.6, 3.5, 2.2, 3.1, 2.4, 3.7];

function cpPaint(ctx, fill, stroke, width) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function cpDisc(ctx, x, y, r, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r > 0 ? r : 0, 0, CP_TAU);
  cpPaint(ctx, fill, stroke, width);
}
function cpLine(ctx, x0, y0, x1, y1, color, width) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function cpRect(ctx, x0, y0, x1, y1, fill, stroke, width) {
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  cpPaint(ctx, fill, stroke, width);
}
// Four-point brush sparkle (concave star).
function cpStar(ctx, x, y, r, fill) {
  if (!(r > 0.2)) return;
  const k = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function cpCross(ctx, x, y, r, color, width) {
  ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function cpDiamond(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.68, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.68, y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function cpBolt(ctx, x, y, m, color) {
  ctx.beginPath();
  ctx.moveTo(x + m * 0.25, y - m * 1.2); ctx.lineTo(x - m * 0.7, y + m * 0.1); ctx.lineTo(x - m * 0.05, y + m * 0.1);
  ctx.lineTo(x - m * 0.35, y + m * 1.2); ctx.lineTo(x + m * 0.75, y - m * 0.25); ctx.lineTo(x + m * 0.1, y - m * 0.25);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}
function cpLeaf(ctx, x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / l * w, ny = dx / l * w, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1);
  ctx.quadraticCurveTo(mx - nx, my - ny, x0, y0);
  ctx.closePath();
  cpPaint(ctx, CP_LEAF, INK, 1.1);
  cpLine(ctx, x0, y0, mx + dx * 0.25, my + dy * 0.25, CP_LEAF_LIGHT, 0.9);
}
// Rising S-curl of steam or smoke; u = 0..1 rise phase. Alpha is saved and assigned back
// (never multiplied then divided), so float32 globalAlpha cannot drift.
function cpWisp(ctx, x, y, u, len, color, width, alpha) {
  const a = Math.sin(u * Math.PI) * alpha;
  if (a <= 0.02) return;
  const y0 = y - u * len, s = 2 + u * 1.5;
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * a;
  ctx.beginPath();
  ctx.moveTo(x, y0 + 5);
  ctx.quadraticCurveTo(x + s, y0 + 2.5, x, y0);
  ctx.quadraticCurveTo(x - s, y0 - 2.5, x + 0.5, y0 - 5);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = g;
}
function cpClamp(v) { return v <= 0 ? 0 : v >= 1 ? 1 : v; }
function cpSmooth(v) { const t = cpClamp(v); return t * t * (3 - 2 * t); }
// Clip away a bite disc (rect minus circle; call once per bite, clips intersect).
function cpBiteClip(ctx, x, y, r) {
  ctx.beginPath();
  ctx.rect(-40, -50, 80, 80);
  ctx.arc(x, y, r, 0, CP_TAU, true);
  ctx.clip();
}
// Exposed flesh band and ink rim along a bite edge (call inside the item's own clip).
function cpBiteEdge(ctx, x, y, r) {
  if (!(r > 0.3)) return;
  ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, CP_TAU);
  ctx.strokeStyle = CP_FLESH; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r, 0, CP_TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
}

// ---- items ----
// Herbal tonic (restyled heal): celadon pear flask, cork, red cord, paper label with a green cross.
function cpTonic(ctx) {
  ctx.beginPath();
  ctx.moveTo(-2.8, -29); ctx.lineTo(-2.8, -32); ctx.quadraticCurveTo(0, -34.4, 2.8, -32); ctx.lineTo(2.8, -29);
  ctx.closePath();
  cpPaint(ctx, CP_CORK, INK, 1.2);
  ctx.beginPath();
  ctx.moveTo(-4.4, -29.2); ctx.lineTo(4.4, -29.2); ctx.lineTo(4.4, -27.4);
  ctx.quadraticCurveTo(2.7, -26.8, 2.7, -23);
  ctx.bezierCurveTo(2.7, -17.5, 10, -15.5, 10, -8);
  ctx.bezierCurveTo(10, -3.4, 8.2, -1.2, 6, 0);
  ctx.lineTo(-6, 0);
  ctx.bezierCurveTo(-8.2, -1.2, -10, -3.4, -10, -8);
  ctx.bezierCurveTo(-10, -15.5, -2.7, -17.5, -2.7, -23);
  ctx.quadraticCurveTo(-2.7, -26.8, -4.4, -27.4);
  ctx.closePath();
  cpPaint(ctx, CP_CELADON, INK, 1.6);
  cpLine(ctx, -5.2, -1.9, 5.2, -1.9, CP_CELADON_DEEP, 1.2);
  ctx.beginPath(); ctx.moveTo(-7.2, -13.8); ctx.quadraticCurveTo(-8.6, -10.6, -8, -6.4);
  ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 1.5; ctx.stroke();
  cpLine(ctx, -2.9, -25.3, 2.9, -25.3, CP_SEAL, 1.8);
  cpLine(ctx, 2.6, -25.1, 5.4, -20.2, CP_SEAL, 1.1);
  cpDisc(ctx, 5.5, -19.7, 1.25, CP_SEAL);
  cpRect(ctx, -4.6, -13.8, 4.6, -4.4, PAPER, INK, 1);
  cpCross(ctx, 0, -9.1, 2.7, CP_HEAL, 2.3);
}
// Qi wine jar (restyled energy): squat clay jar, blue cloth cap tied with cord, bolt label.
// k: cap lifted off (0 capped .. 1 gone), open mouth shows from k 0.3.
function cpJarPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-5, -22); ctx.lineTo(5, -22);
  ctx.bezierCurveTo(9, -21, 12, -17, 12, -12);
  ctx.bezierCurveTo(12, -6, 9.5, -2, 7.5, 0);
  ctx.lineTo(-7.5, 0);
  ctx.bezierCurveTo(-9.5, -2, -12, -6, -12, -12);
  ctx.bezierCurveTo(-12, -17, -9, -21, -5, -22);
  ctx.closePath();
}
function cpJar(ctx, k) {
  cpJarPath(ctx);
  cpPaint(ctx, CP_CLAY, null);
  ctx.beginPath();
  ctx.moveTo(-11.4, -7.4); ctx.quadraticCurveTo(0, -5.2, 11.4, -7.4);
  ctx.bezierCurveTo(10.6, -3.6, 9, -1.5, 7.5, 0);
  ctx.lineTo(-7.5, 0);
  ctx.bezierCurveTo(-9, -1.5, -10.6, -3.6, -11.4, -7.4);
  ctx.closePath();
  cpPaint(ctx, CP_CLAY_DEEP, null);
  cpJarPath(ctx);
  cpPaint(ctx, null, INK, 1.6);
  ctx.beginPath(); ctx.moveTo(-9.6, -16.5); ctx.quadraticCurveTo(-10.8, -13.4, -10.4, -10.2);
  ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 1.5; ctx.stroke();
  if (k > 0.3) {
    ctx.beginPath(); ctx.ellipse(0, -22, 5.2, 1.7, 0, 0, CP_TAU);
    cpPaint(ctx, '#5a3b2a', INK, 1.3);
  }
  if (k < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - cpClamp(k); // inside save/restore, so restore puts it back exactly
    ctx.translate(k * 7, -k * 10);
    ctx.rotate(k * 0.9);
    ctx.beginPath();
    ctx.moveTo(-7.4, -21.4);
    ctx.bezierCurveTo(-9.2, -25.4, -5.8, -29.6, 0, -29.6);
    ctx.bezierCurveTo(5.8, -29.6, 9.2, -25.4, 7.4, -21.4);
    ctx.lineTo(9.6, -17.6); ctx.lineTo(5.6, -19.6); ctx.lineTo(3, -17.8); ctx.lineTo(-0.4, -19.8);
    ctx.lineTo(-4.2, -18); ctx.lineTo(-6.2, -19.8); ctx.lineTo(-9.6, -17.8);
    ctx.closePath();
    cpPaint(ctx, CP_CLOTH, INK, 1.4);
    ctx.beginPath(); ctx.moveTo(-3.6, -27.4); ctx.quadraticCurveTo(-1, -28.6, 2.2, -28.2);
    ctx.strokeStyle = '#87b3cc'; ctx.lineWidth = 1.2; ctx.stroke();
    cpLine(ctx, -6.6, -22, 6.6, -22, CP_SEAL, 1.9);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(0, -17.6); ctx.lineTo(5.6, -12); ctx.lineTo(0, -6.4); ctx.lineTo(-5.6, -12);
  ctx.closePath();
  cpPaint(ctx, PAPER, INK, 1);
  cpBolt(ctx, 0.1, -12, 3.2, CP_QI);
}
// Longevity peach: blushed peach with a pointed tip and two leaves at the base.
// k: bites from the side that faces the mouth (-x): first bite by k 0.45, second by k 1.
function cpPeachPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(1.5, -24.5);
  ctx.bezierCurveTo(5.5, -21, 11, -19.5, 11, -11.5);
  ctx.bezierCurveTo(11, -4.2, 6, -0.4, 0, -0.4);
  ctx.bezierCurveTo(-6, -0.4, -11, -4.2, -11, -11.5);
  ctx.bezierCurveTo(-11, -18.4, -5, -21.5, 1.5, -24.5);
  ctx.closePath();
}
function cpPeach(ctx, k) {
  const r1 = k > 0 ? 6.4 * cpClamp(k / 0.45) : 0, r2 = k > 0.45 ? 6.8 * cpClamp((k - 0.45) / 0.55) : 0;
  cpLeaf(ctx, -1.5, -1.6, -12.8, -4.6, 3.6);
  cpLeaf(ctx, 1.5, -1.2, 11.8, 0.8, 3.1);
  const bitten = r1 > 0.3;
  if (bitten) {
    ctx.save();
    cpBiteClip(ctx, -10.2, -15, r1);
    if (r2 > 0.3) cpBiteClip(ctx, -10.8, -6.6, r2);
  }
  cpPeachPath(ctx);
  cpPaint(ctx, CP_PEACH, null);
  ctx.beginPath();
  ctx.moveTo(1.5, -24.5);
  ctx.bezierCurveTo(5.5, -21, 11, -19.5, 11, -11.5);
  ctx.bezierCurveTo(11, -6.8, 8.6, -3.4, 5.4, -2.2);
  ctx.bezierCurveTo(3.4, -8.4, 0.8, -16.2, 1.5, -24.5);
  ctx.closePath();
  cpPaint(ctx, CP_BLUSH, null);
  cpPeachPath(ctx);
  cpPaint(ctx, null, INK, 1.6);
  ctx.beginPath(); ctx.moveTo(1.4, -23.4); ctx.bezierCurveTo(-2.6, -17.4, -2.8, -8.4, 0.4, -2.2);
  ctx.strokeStyle = CP_CREASE; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6.6, -17.2); ctx.quadraticCurveTo(-8.8, -14.2, -8.6, -10.6);
  ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 1.5; ctx.stroke();
  if (bitten) {
    cpPeachPath(ctx);
    ctx.clip();
    cpBiteEdge(ctx, -10.2, -15, r1);
    cpBiteEdge(ctx, -10.8, -6.6, r2);
    ctx.restore();
  }
}
// Steamed bun. Ground: on a small bamboo steamer with a paper tag. CP_HELD: on its paper liner.
function cpSteamer(ctx) {
  ctx.beginPath();
  ctx.moveTo(-11.5, -6.5); ctx.lineTo(-11.5, -2.6);
  ctx.ellipse(0, -2.6, 11.5, 2.6, 0, Math.PI, 0, true);
  ctx.lineTo(11.5, -6.5);
  ctx.closePath();
  cpPaint(ctx, CP_BAMBOO, INK, 1.4);
  ctx.beginPath();
  for (let x = -7; x <= 7; x += 4.66) { ctx.moveTo(x, -5.4); ctx.lineTo(x, -1.2 + Math.abs(x) * 0.06); }
  ctx.strokeStyle = CP_BAMBOO_DEEP; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -6.5, 11.5, 2.9, 0, 0, CP_TAU);
  cpPaint(ctx, CP_BAMBOO_TOP, INK, 1.2);
  ctx.beginPath(); ctx.ellipse(0, -6.5, 8.4, 1.8, 0, 0, CP_TAU);
  ctx.strokeStyle = CP_BAMBOO_DEEP; ctx.lineWidth = 0.9; ctx.stroke();
}
function cpBunPath(ctx, by) {
  ctx.beginPath();
  ctx.moveTo(-8.6, by);
  ctx.bezierCurveTo(-9.4, by - 6.6, -4.8, by - 10.8, 0, by - 10.8);
  ctx.bezierCurveTo(4.8, by - 10.8, 9.4, by - 6.6, 8.6, by);
  ctx.quadraticCurveTo(0, by + 1.8, -8.6, by);
  ctx.closePath();
}
function cpBun(ctx, t, flags, k) {
  const held = flags & CP_HELD;
  if (held) {
    // Paper liner: a tan base that separates the white bun from the white fist.
    ctx.beginPath();
    ctx.moveTo(-10.4, 1.8); ctx.lineTo(10.4, 1.8); ctx.lineTo(8.6, -1.4); ctx.lineTo(-8.6, -1.4);
    ctx.closePath();
    cpPaint(ctx, CP_LINER, INK, 1.1);
  } else {
    cpSteamer(ctx);
  }
  const by = held ? 0 : -6.6;
  const r1 = k > 0 ? 4.9 * cpClamp(k / 0.45) : 0, r2 = k > 0.45 ? 5.2 * cpClamp((k - 0.45) / 0.55) : 0;
  const bitten = r1 > 0.3;
  if (bitten) {
    ctx.save();
    cpBiteClip(ctx, -8.4, by - 6.8, r1);
    if (r2 > 0.3) cpBiteClip(ctx, -8.2, by - 1.6, r2);
  }
  cpBunPath(ctx, by);
  cpPaint(ctx, CP_BUN, INK, 1.5);
  ctx.beginPath(); ctx.arc(0, by - 3.6, 6.6, 0.2, 1.45);
  ctx.strokeStyle = CP_BUN_SHADE; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4.4, by - 6.8); ctx.quadraticCurveTo(-2.6, by - 9.4, 0, by - 10.2);
  ctx.moveTo(4.4, by - 7); ctx.quadraticCurveTo(2.6, by - 9.4, 0.3, by - 10.2);
  ctx.moveTo(-0.6, by - 6.4); ctx.quadraticCurveTo(-0.2, by - 8.6, 0.1, by - 10);
  ctx.strokeStyle = CP_BUN_PLEAT; ctx.lineWidth = 1; ctx.stroke();
  cpDisc(ctx, 0.2, by - 9.8, 1.7, CP_SEAL);
  if (bitten) {
    cpBunPath(ctx, by);
    ctx.clip();
    cpBiteEdge(ctx, -8.4, by - 6.8, r1);
    cpBiteEdge(ctx, -8.2, by - 1.6, r2);
    ctx.restore();
  }
  if (!(flags & CP_STILL)) {
    for (let i = 0; i < 3; i += 1) {
      const u = (t * 0.7 + i / 3) % 1;
      cpWisp(ctx, -4 + i * 4 + Math.sin(u * 5 + i) * 1.2, by - 13, u, 13, CP_STEAM, 1.3, 0.75);
    }
  }
}
// Ginseng tea gourd: straw calabash, stopper, blue waist cord and tassel, paper seal with a bolt.
function cpGourd(ctx) {
  cpRect(ctx, -1.6, -28, 1.6, -24.4, CP_CORK, INK, 1);
  ctx.beginPath();
  ctx.moveTo(0, -24.8);
  ctx.bezierCurveTo(3.4, -24.8, 5.4, -22.5, 5.4, -19.6);
  ctx.bezierCurveTo(5.4, -17.2, 3.3, -16, 3.3, -14.8);
  ctx.bezierCurveTo(3.3, -14, 8.6, -13, 8.6, -7.6);
  ctx.bezierCurveTo(8.6, -2.8, 4.7, 0, 0, 0);
  ctx.bezierCurveTo(-4.7, 0, -8.6, -2.8, -8.6, -7.6);
  ctx.bezierCurveTo(-8.6, -13, -3.3, -14, -3.3, -14.8);
  ctx.bezierCurveTo(-3.3, -16, -5.4, -17.2, -5.4, -19.6);
  ctx.bezierCurveTo(-5.4, -22.5, -3.4, -24.8, 0, -24.8);
  ctx.closePath();
  cpPaint(ctx, CP_GOURD, INK, 1.6);
  ctx.beginPath(); ctx.arc(0, -7.6, 6.4, -0.55, 1.25);
  ctx.strokeStyle = CP_GOURD_DEEP; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -19.6, 3.7, -0.5, 1.1);
  ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -7.8, 5.8, 3.55, 4.35);
  ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 1.4; ctx.stroke();
  cpLine(ctx, -3.5, -14.8, 3.5, -14.8, CP_CLOTH, 2);
  cpLine(ctx, 3.2, -14.6, 6, -11.2, CP_CLOTH, 1.1);
  ctx.beginPath();
  ctx.moveTo(5, -11.6); ctx.lineTo(7.1, -11.6); ctx.lineTo(7.9, -6.4); ctx.lineTo(4.4, -6.4);
  ctx.closePath();
  cpPaint(ctx, CP_CLOTH, null);
  cpDisc(ctx, -1.6, -7.2, 3.7, PAPER, INK, 0.9);
  cpBolt(ctx, -1.5, -7.2, 2.2, CP_QI);
}
// Golden elixir pill: a large gold pill floating over a flat red-lacquer dish, with a brush halo
// and a spark that passes behind and in front of it. CP_HELD: the pill alone.
function cpDish(ctx) {
  cpRect(ctx, -4.6, -1.8, 4.6, 0, CP_LACQUER_DEEP, INK, 1.1);
  ctx.beginPath();
  ctx.moveTo(-11.5, -5);
  ctx.quadraticCurveTo(-10, -1.6, -5, -1.6);
  ctx.lineTo(5, -1.6);
  ctx.quadraticCurveTo(10, -1.6, 11.5, -5);
  ctx.closePath();
  cpPaint(ctx, CP_LACQUER, INK, 1.3);
  ctx.beginPath(); ctx.ellipse(0, -5, 11.5, 2.7, 0, 0, CP_TAU);
  cpPaint(ctx, CP_LACQUER_IN, INK, 1.3);
  ctx.beginPath(); ctx.ellipse(0, -5, 8.4, 1.6, 0, 0.15, Math.PI - 0.15);
  ctx.strokeStyle = CP_GOLD; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8.6, -3.1); ctx.quadraticCurveTo(0, -1.6, 8.6, -3.1);
  ctx.strokeStyle = CP_GOLD_DEEP; ctx.lineWidth = 0.9; ctx.stroke();
}
function cpPillBall(ctx, py) {
  cpDisc(ctx, 0, py, 6.2, CP_GOLD, INK, 1.4);
  ctx.beginPath(); ctx.arc(0, py, 4.6, 0.25, 1.95);
  ctx.strokeStyle = CP_GOLD_DEEP; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(0.4, py + 0.2, 2.6, 3.6, 5.2);
  ctx.strokeStyle = CP_GOLD_HOT; ctx.lineWidth = 1.1; ctx.stroke();
  cpDisc(ctx, -2.2, py - 2.3, 1.6, CP_WHITE);
}
function cpPill(ctx, t, flags) {
  if (flags & CP_HELD) { cpPillBall(ctx, 0); return; }
  cpDish(ctx);
  const still = flags & CP_STILL;
  const py = -15 + (still ? 0 : Math.sin(t * 4.2) * 1.2);
  const g = ctx.globalAlpha;
  // warm reflection of the pill on the lacquer
  ctx.globalAlpha = g * 0.6;
  ctx.beginPath(); ctx.ellipse(0, -5, 4.8, 1.1, 0, 0, CP_TAU);
  ctx.fillStyle = CP_GOLD_HOT; ctx.fill();
  ctx.globalAlpha = g;
  // brush halo: two short gold arcs hugging the pill, slowly turning, and one orbiting spark
  const a = still ? 2.2 : t * 3.2, h = still ? 0.6 : t * 0.9;
  const sx = Math.cos(a) * 9.6, sy = py + Math.sin(a) * 3;
  if (Math.sin(a) < 0) cpStar(ctx, sx, sy, 2.2, CP_GOLD_DEEP);
  ctx.beginPath();
  ctx.arc(0, py, 8.8, h + 3.5, h + 4.6);
  ctx.moveTo(Math.cos(h + 0.36) * 8.8, py + Math.sin(h + 0.36) * 8.8);
  ctx.arc(0, py, 8.8, h + 0.36, h + 1.46);
  ctx.strokeStyle = PAPER; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = CP_GOLD; ctx.lineWidth = 1.3; ctx.stroke();
  cpPillBall(ctx, py);
  if (Math.sin(a) >= 0) { cpStar(ctx, sx, sy, 3.4, CP_WHITE); cpStar(ctx, sx, sy, 2.5, CP_GOLD_HOT); }
}
// Sandalwood censer: bronze tripod with three lit sticks, drifting smoke, paper cartouche.
function cpCenser(ctx, t, flags) {
  const still = flags & CP_STILL;
  ctx.beginPath();
  ctx.moveTo(-2.6, -13.5); ctx.lineTo(-3.8, -26.4);
  ctx.moveTo(0.4, -13.5); ctx.lineTo(0.6, -29);
  ctx.moveTo(3.2, -13.5); ctx.lineTo(4.6, -25.4);
  ctx.strokeStyle = CP_STICK; ctx.lineWidth = 1.2; ctx.stroke();
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * (still ? 1 : 0.75 + Math.sin(t * 9) * 0.25);
  cpDisc(ctx, -3.8, -26.4, 1.3, CP_EMBER);
  cpDisc(ctx, 0.6, -29, 1.3, CP_EMBER);
  cpDisc(ctx, 4.6, -25.4, 1.3, CP_EMBER);
  ctx.globalAlpha = g;
  if (!still) {
    for (let i = 0; i < 3; i += 1) {
      const u = (t * 0.55 + i * 0.37) % 1;
      const x = i === 0 ? -3.8 : i === 1 ? 0.6 : 4.6;
      cpWisp(ctx, x + Math.sin(u * 4 + i) * 1.5, (i === 1 ? -29 : -26) - 5, u, 14, CP_SMOKE, 1.2, 0.7);
    }
  }
  cpLine(ctx, -6, -5, -8.6, 0, INK, 2.3);
  cpLine(ctx, 6, -5, 8.6, 0, INK, 2.3);
  cpLine(ctx, 0, -4.4, 0, -0.6, '#4f625f', 2);
  ctx.beginPath();
  ctx.moveTo(-9.6, -13); ctx.lineTo(9.6, -13);
  ctx.bezierCurveTo(9.6, -7.2, 6.2, -4, 0, -4);
  ctx.bezierCurveTo(-6.2, -4, -9.6, -7.2, -9.6, -13);
  ctx.closePath();
  cpPaint(ctx, CP_BRONZE, INK, 1.5);
  cpRect(ctx, -10.8, -14.8, 10.8, -12.6, CP_BRONZE_DEEP, INK, 1.2);
  ctx.beginPath();
  ctx.moveTo(-8.8, -14.6); ctx.lineTo(-8.8, -18.4); ctx.lineTo(-5.4, -18.4); ctx.lineTo(-5.4, -14.6);
  ctx.moveTo(8.8, -14.6); ctx.lineTo(8.8, -18.4); ctx.lineTo(5.4, -18.4); ctx.lineTo(5.4, -14.6);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7.6, -11.4); ctx.quadraticCurveTo(-7.4, -8.4, -5.6, -6.6);
  ctx.strokeStyle = '#d9c08e'; ctx.lineWidth = 1.2; ctx.stroke();
  cpRect(ctx, -3.4, -11.6, 3.4, -5.8, PAPER, INK, 0.9);
  cpCross(ctx, 0, -8.7, 1.9, CP_HEAL, 1.6);
}
// Elemental glyph (stroke only) at (x, y), radius r.
function cpGlyph(ctx, element, x, y, r, color, width) {
  ctx.beginPath();
  if (element === 'water') {
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.75, y - r * 0.05, x + r * 0.64, y + r * 0.32);
    ctx.arc(x, y + r * 0.32, r * 0.64, 0, Math.PI);
    ctx.quadraticCurveTo(x - r * 0.75, y - r * 0.05, x, y - r);
  } else if (element === 'earth') {
    ctx.moveTo(x - r * 0.9, y + r * 0.62); ctx.lineTo(x - r * 0.22, y - r * 0.66); ctx.lineTo(x + r * 0.14, y - r * 0.02);
    ctx.lineTo(x + r * 0.42, y - r * 0.36); ctx.lineTo(x + r * 0.9, y + r * 0.62); ctx.closePath();
  } else if (element === 'fire') {
    ctx.moveTo(x, y - r);
    ctx.bezierCurveTo(x + r * 0.35, y - r * 0.45, x + r * 0.78, y - r * 0.12, x + r * 0.58, y + r * 0.42);
    ctx.quadraticCurveTo(x + r * 0.36, y + r * 0.88, x, y + r * 0.88);
    ctx.quadraticCurveTo(x - r * 0.36, y + r * 0.88, x - r * 0.58, y + r * 0.42);
    ctx.bezierCurveTo(x - r * 0.72, y, x - r * 0.3, y - r * 0.2, x - r * 0.12, y - r * 0.5);
    ctx.quadraticCurveTo(x - r * 0.02, y - r * 0.7, x, y - r);
  } else {
    ctx.moveTo(x - r * 0.9, y - r * 0.18); ctx.lineTo(x + r * 0.3, y - r * 0.18);
    ctx.arc(x + r * 0.3, y - r * 0.5, r * 0.32, Math.PI / 2, -Math.PI * 0.75, true);
    ctx.moveTo(x - r * 0.6, y + r * 0.42); ctx.lineTo(x + r * 0.62, y + r * 0.42);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
// Small element-shaped mote (pebble, droplet, ember, wind arc).
function cpMote(ctx, element, x, y, s, color) {
  if (element === 'earth') cpRect(ctx, x - s, y - s, x + s, y + s, color, null);
  else if (element === 'fire') {
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.8); ctx.lineTo(x + s, y + s * 0.6); ctx.lineTo(x - s, y + s * 0.6); ctx.closePath();
    cpPaint(ctx, color, null);
  } else if (element === 'air') {
    ctx.beginPath(); ctx.arc(x, y + s * 1.4, s * 2, -2.5, -0.65);
    ctx.strokeStyle = color; ctx.lineWidth = s * 0.85; ctx.stroke();
  } else cpDisc(ctx, x, y, s, color);
}
// Spirit orb (centre at origin): paper sphere, element ring and glyph, three orbiting motes.
function cpOrb(ctx, t, element, flags) {
  const E = CP_ORBS[element] || CP_ORBS.air;
  const spin = flags & CP_STILL ? 0.8 : t * 2.2;
  for (let pass = 0; pass < 2; pass += 1) {
    if (pass === 1) {
      cpDisc(ctx, 0, 0, 9.2, PAPER, INK, 1.3);
      cpDisc(ctx, 0, 0, 7.2, E.tint, E.c, 2);
      cpGlyph(ctx, element, 0, 0.3, 4.4, E.deep, 1.5);
      ctx.beginPath(); ctx.arc(0, 0, 5.4, 3.65, 4.45);
      ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 1.4; ctx.stroke();
    }
    for (let i = 0; i < 3; i += 1) {
      const a = spin + i * CP_TAU / 3;
      const depth = Math.sin(a);
      if ((depth >= 0) !== (pass === 1)) continue;
      cpMote(ctx, element, Math.cos(a) * 13.5, depth * 4.4 - Math.cos(a) * 2.2, 1.6 + depth * 0.4, E.c);
    }
  }
}
function drawConsumableItem(ctx, kind, t, variant, flags = 0, k = 0) {
  if (kind === 'heal') cpTonic(ctx);
  else if (kind === 'energy') cpJar(ctx, k);
  else if (kind === 'peach') cpPeach(ctx, k);
  else if (kind === 'bun') cpBun(ctx, t, flags, k);
  else if (kind === 'gourd') cpGourd(ctx);
  else if (kind === 'pill') cpPill(ctx, t, flags);
  else if (kind === 'incense') cpCenser(ctx, t, flags);
  else if (kind === 'orb') { ctx.translate(0, -11); cpOrb(ctx, t, variant, flags); ctx.translate(0, 11); }
}

// ---- ground pickup ----
// Despawn alpha: steady, then blinks between full and 30% (2.5 -> 4 -> 7 blinks/s), then
// dissolves. Reduced motion: no blink, a steady fade to 45% (the countdown arc still runs).
function consumableFade(life, reduced = false) {
  if (!(life < CP_BLINK_START)) return 1;
  if (life <= 0) return 0;
  if (life < CP_DISSOLVE) return (reduced ? 0.45 : 1) * life / CP_DISSOLVE;
  if (reduced) return 0.45 + 0.55 * (life - CP_DISSOLVE) / (CP_BLINK_START - CP_DISSOLVE);
  const rate = life > 3 ? 2.5 : life > 1.5 ? 4 : 7;
  return Math.floor(life * rate * 2) % 2 ? 0.3 : 1;
}
function cpGlint(ctx, kind, spec, time, seed, rare) {
  const period = rare ? 1.7 : 2.6;
  let ph = (time + seed * 0.61) % period;
  if (ph < 0) ph += period;
  if (ph > 0.5) return;
  const s = Math.sin(ph / 0.5 * Math.PI);
  const gx = spec.glint[0], gy = spec.glint[1];
  if (kind === 'bun') cpStar(ctx, gx, gy, 5.8 * s, CP_BUN_PLEAT); // dark rim so it reads on white
  cpStar(ctx, gx, gy, 4.6 * s, CP_WHITE);
  cpDisc(ctx, gx, gy, 1.1 * s, CP_WHITE);
  if (rare) cpStar(ctx, gx - 5.5, gy - 6.5, 2.8 * s, CP_GOLD);
}
// Category pip above the item: green cross (HP), blue diamond (EN), gold star (power), each on
// a paper under-stroke so it reads on every floor.
function cpPip(ctx, cat, x, y) {
  if (cat === 'hp') { cpCross(ctx, x, y, 3, PAPER, 4.4); cpCross(ctx, x, y, 2.6, CP_HEAL_HI, 2); }
  else if (cat === 'en') { cpDiamond(ctx, x, y, 4.4, PAPER); cpDiamond(ctx, x, y, 3.2, CP_QI_HI); }
  else { cpStar(ctx, x, y, 5.2, PAPER); cpStar(ctx, x, y, 3.9, CP_GOLD); }
}
// Ink-wash dissolve: paper-white wash (low alpha per disc, so overlaps never go opaque) with
// thin ink curls drifting out.
function drawDespawnPuff(ctx, x, y, p) {
  if (!(p > 0 && p < 1)) return;
  const e = 1 - (1 - p) * (1 - p), fade = 1 - p;
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * 0.34 * fade;
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.09 + 0.5;
    cpDisc(ctx, x + Math.cos(a) * 6 * e, y + Math.sin(a) * 3.5 * e - 4 * e, 5 + 6 * e, CP_WHITE);
  }
  ctx.globalAlpha = g * 0.75 * fade;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.09 + 1.2;
    const cx = x + Math.cos(a) * (5 + 9 * e), cy = y + Math.sin(a) * (3 + 4 * e) - 8 * e, r = 1.4 + 2.4 * e;
    ctx.beginPath(); ctx.arc(cx, cy, r, a + 0.9, a + 0.9 + 4.4);
    ctx.stroke();
  }
  ctx.globalAlpha = g;
}
// E prompt drawn with strokes (no text call): an ink seal tile under the item.
function cpSealTile(ctx) {
  ctx.beginPath();
  ctx.moveTo(-5, 8.5); ctx.lineTo(5, 8.5); ctx.quadraticCurveTo(6.5, 8.5, 6.5, 10);
  ctx.lineTo(6.5, 19); ctx.quadraticCurveTo(6.5, 20.5, 5, 20.5); ctx.lineTo(-5, 20.5);
  ctx.quadraticCurveTo(-6.5, 20.5, -6.5, 19); ctx.lineTo(-6.5, 10); ctx.quadraticCurveTo(-6.5, 8.5, -5, 8.5);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2.8, 11.4); ctx.lineTo(-2.3, 11.4); ctx.lineTo(-2.3, 17.6); ctx.lineTo(2.8, 17.6);
  ctx.moveTo(-2.3, 14.5); ctx.lineTo(2, 14.5);
  ctx.strokeStyle = PAPER; ctx.lineWidth = 1.7; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.stroke();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}
// near = this is the item Game.pickup would take (the first in reach); only it shows the E seal.
function drawConsumable(ctx, item, time, near = false, reduced = false) {
  const spec = CONSUMABLES[item.kind];
  if (!spec) return false;
  const life = Number.isFinite(item.life) ? item.life : 99;
  const fade = consumableFade(life, reduced);
  if (fade <= 0) return true;
  const seed = Number.isFinite(item.seed) ? item.seed : item.x * 0.013;
  const variant = item.variant || 'air';
  const rare = spec.rarity === 'rare';
  const dissolve = life < CP_DISSOLVE && !reduced ? 1 - life / CP_DISSOLVE : 0;
  const lift = spec.hover + (Math.sin(time * 3 + seed) * 0.5 + 0.5) * spec.bob;
  const ringColor = item.kind === 'orb' ? (CP_ORBS[variant] || CP_ORBS.air).c : rare ? CP_GOLD : CP_JADE;
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Ground layer (does not bob): paper halo, rarity ring, countdown arc.
  ctx.globalAlpha = base * 0.2 * fade;
  cpDisc(ctx, 0, -lift - spec.h * 0.45, spec.h * 0.5 + 9, '#fffbe9');
  if (spec.rarity !== 'common') {
    ctx.globalAlpha = base * (rare ? 0.8 : 0.5) * fade;
    ctx.beginPath();
    ctx.ellipse(0, 1, 17, 5.2, 0, 0, CP_TAU);
    if (rare) { ctx.setLineDash(CP_DASH); ctx.lineDashOffset = -time * 8; }
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    if (rare) ctx.setLineDash(CP_NO_DASH);
  }
  if (life < CP_BLINK_START) {
    ctx.globalAlpha = base * 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 1, 20, 6.4, 0, -Math.PI / 2, -Math.PI / 2 + CP_TAU * Math.max(0, life) / CP_BLINK_START);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  // Item layer.
  ctx.save();
  ctx.globalAlpha = base * fade;
  ctx.translate(0, -lift);
  if (dissolve > 0) {
    const s = 1 - dissolve * 0.45, c = -spec.h * 0.5;
    ctx.translate(0, c);
    ctx.scale(s, s);
    ctx.translate(0, -c);
  }
  drawConsumableItem(ctx, item.kind, time + seed, variant, reduced ? CP_STILL : 0, 0);
  if (fade > 0.5 && !dissolve) {
    if (!reduced) cpGlint(ctx, item.kind, spec, time, seed, rare);
    cpPip(ctx, spec.cat, 10.5, -spec.h - 1);
  }
  ctx.restore();
  if (dissolve > 0) drawDespawnPuff(ctx, 0, -lift - spec.h * 0.5, dissolve);
  if (near) {
    ctx.globalAlpha = base * Math.min(1, fade + 0.3);
    cpSealTile(ctx);
  }
  ctx.restore();
  return true;
}

// ---- use poses ----
// Three body keyframes per use style (lift, use, recover), blended base -> lift -> use (held)
// -> recover -> base. Keys are additive to the base stance: lean/drop move hip, shoulder and
// head from the stance, nod offsets the head, and listed arm joints are authored for the neutral
// stance and carried with the stance's shoulder. A key with full: 1 (it overrides legs) is a
// whole-body pose: its torso is placed from neutral and its joints are absolute.
const CP_USE_KEYS = {
  drink: [
    { lean: -1, elbow: [15, -34], hand: [20, -47] },
    { lean: -6, nod: [1, 1], elbow: [12, -50], hand: [9, -62], rearElbow: [-15, -33], rearHand: [-11, -25] },
    { lean: 3, elbow: [18, -37], hand: [27, -36], rearElbow: [-15, -33], rearHand: [-10, -27] },
  ],
  jar: [
    { lean: -1, drop: 1, elbow: [16, -33], hand: [20, -40], rearElbow: [4, -33], rearHand: [12, -37] },
    { lean: -6, drop: -1, nod: [0, 2], elbow: [21, -56], hand: [23, -73], rearElbow: [2, -62], rearHand: [12, -78] },
    { lean: 4, drop: 2, elbow: [16, -38], hand: [24, -40], rearElbow: [6, -36], rearHand: [16, -41] },
  ],
  eat: [
    { elbow: [15, -35], hand: [20, -46] },
    { lean: 2, nod: [1, 0.5], elbow: [16, -38], hand: [17, -45] },
    { elbow: [14, -35], hand: [19, -42] },
  ],
  pill: [
    { elbow: [15, -39], hand: [21, -51] },
    { lean: -6, nod: [1, 1], elbow: [15, -48], hand: [16, -60] },
    { full: 1, lean: 2, drop: 4, elbow: [12, -27], hand: [9, -34], rearElbow: [-12, -28], rearHand: [-5, -33],
      rearKnee: [-12, -13], frontKnee: [13, -13], rearFoot: [-18, -1], frontFoot: [18, -1] },
  ],
  plant: [
    { lean: 3, elbow: [16, -35], hand: [26, -37] },
    { full: 1, lean: 9, drop: 13, nod: [3, 0], elbow: [24, -25], hand: [CP_PLANT_X + 7, -16], rearElbow: [-5, -27], rearHand: [3, -20],
      frontKnee: [17, -13], frontFoot: [19, -1], rearKnee: [-6, -4], rearFoot: [-17, -1] },
    { lean: -1, elbow: [14, -37], hand: [12, -46], rearElbow: [-1, -36], rearHand: [9, -45] },
  ],
  absorb: [
    { lean: 3, elbow: [20, -40], hand: [28, -46], rearElbow: [14, -36], rearHand: [26, -38] },
    { lean: -2, drop: 2, elbow: [16, -32], hand: [14, -40], rearElbow: [8, -32], rearHand: [11, -35] },
    { full: 1, lean: -3, drop: -2, elbow: [17, -52], hand: [28, -63], rearElbow: [-17, -52], rearHand: [-28, -63],
      rearFoot: [-17, -1], frontFoot: [17, -1] },
  ],
};
// Item tracks: [p, anchor, x, y, angle, scale, k, ease]. The item's grip point is placed at
// anchor + (x, y) and blended between consecutive keys in absolute pose space, so it never jumps:
// FROM = where it lay on the ground (then it hops into the hand), HAND = front fist, HEAD = head
// joint (+6, +3 is the mouth), CHEST = shoulder joint, GONE = consumed/handed off (not drawn),
// FLING = released as a flung vessel (pose.release holds the release point).
// scale 0 = spec.held. k = use progress drawn on the item. ease = into this key (0 smooth,
// 1 out/decelerate, 2 in/accelerate).
const CP_AT_GONE = 0, CP_AT_HAND = 1, CP_AT_HEAD = 2, CP_AT_CHEST = 3, CP_AT_POSE = 4, CP_AT_FROM = 5, CP_AT_FLING = 6;
const CP_TRACKS = {
  drink: [
    [0, CP_AT_FROM, 0, 0, 0, 1, 0, 0],
    [0.16, CP_AT_HAND, 0, 0, 0, 0, 0, 0],
    [0.42, CP_AT_HAND, 0, 0, -2.5, 0, 0, 0],
    [0.66, CP_AT_HAND, 0, 0, -2.55, 0, 0, 0],
    [0.82, CP_AT_HAND, 0, 0, 0.9, 0, 0, 0],
    [0.82, CP_AT_FLING, 0, 0, 0, 0, 0, 0],
  ],
  jar: [
    [0, CP_AT_FROM, 0, 0, 0, 1, 0, 0],
    [0.16, CP_AT_HAND, -3, 0, 0, 0, 0, 0],
    [0.3, CP_AT_HAND, -6, 1, -1.3, 0, 1, 0],
    [0.42, CP_AT_HAND, -11, 1, -2.65, 0, 1, 0],
    [0.66, CP_AT_HAND, -11, 1, -2.75, 0, 1, 0],
    [0.82, CP_AT_HAND, -5, 2, -0.3, 0, 1, 0],
    [0.82, CP_AT_FLING, 0, 0, 0, 0, 0, 0],
  ],
  eat: [
    [0, CP_AT_FROM, 0, 0, 0, 1, 0, 0],
    [0.16, CP_AT_HAND, 1.5, -4.5, 0, 0, 0, 0],
    [0.4, CP_AT_HAND, 1.5, -4.5, 0, 0, 0, 0],
    [0.44, CP_AT_HAND, 1.5, -4.5, 0.08, 0, 0.45, 0],
    [0.52, CP_AT_HAND, 1.5, -4.5, 0.08, 0, 0.45, 0],
    [0.56, CP_AT_HAND, 1.5, -4.5, 0.12, 0, 1, 0],
    [0.6, CP_AT_HAND, 1.5, -4.5, 0.12, 0, 1, 0],
    [0.66, CP_AT_HEAD, 6, 3, 0.3, 0.18, 1, 2],
    [0.66, CP_AT_GONE, 0, 0, 0, 0, 0, 0],
  ],
  pill: [
    [0, CP_AT_FROM, 0, 0, 0, 1, 0, 0],
    [0.16, CP_AT_HAND, 2.5, -4, 0, 0, 0, 0],
    [0.3, CP_AT_HAND, 2.5, -4, 0, 0, 0, 0],
    [0.47, CP_AT_HEAD, 4, -26, 0, 0.9, 0, 1],
    [0.62, CP_AT_HEAD, 6, 3, 0, 0.5, 0, 2],
    [0.62, CP_AT_GONE, 0, 0, 0, 0, 0, 0],
  ],
  plant: [
    [0, CP_AT_FROM, 0, 0, 0, 1, 0, 0],
    [0.16, CP_AT_HAND, 0, 0, 0, 0, 0, 0],
    [0.42, CP_AT_HAND, 0, 0, 0, 1, 0, 0],
    [0.42, CP_AT_GONE, 0, 0, 0, 0, 0, 0], // handed to the world censer the engine plants at applyAt
  ],
  absorb: [
    [0, CP_AT_FROM, 0, 0, 0, 1, 0, 0],
    [0.18, CP_AT_HAND, 6, 4, 0, 0, 0, 0],
    [0.42, CP_AT_CHEST, 7, 9, 0, 0.55, 0, 0],
    [0.6, CP_AT_CHEST, 3, 10, 0, 0.12, 0, 2],
    [0.6, CP_AT_GONE, 0, 0, 0, 0, 0, 0],
  ],
};
const CP_JOINTS = ['hip', 'shoulder', 'head', 'rearKnee', 'rearFoot', 'frontKnee', 'frontFoot', 'rearElbow', 'rearHand', 'elbow', 'hand'];
const CP_SEG = [0, 0.18, 0.42, 0.66, 0.82, 1];
const CP_SEG_KEY = [-1, 0, 1, 1, 2, -1];
const CP_N_HIP = [0, -27], CP_N_SHOULDER = [0, -45], CP_N_HEAD = [1, -57];
const CP_FROM_DEFAULT = [24, 0];
const CP_PA = [0, 0], CP_PB = [0, 0], CP_PC = [0, 0], CP_QA = [0, 0], CP_QB = [0, 0];
function cpKeyJoint(base, key, j, out) {
  const b = base[j];
  if (!key) { out[0] = b[0]; out[1] = b[1]; return; }
  const full = key.full === 1;
  if (j === 'hip' || j === 'shoulder' || j === 'head') {
    const lean = key.lean || 0, drop = key.drop || 0;
    const ref = full ? (j === 'hip' ? CP_N_HIP : j === 'head' ? CP_N_HEAD : CP_N_SHOULDER) : b;
    out[0] = ref[0] + (j === 'hip' ? lean * 0.3 : lean);
    out[1] = ref[1] + drop;
    if (j === 'head' && key.nod) { out[0] += key.nod[0]; out[1] += key.nod[1]; }
    return;
  }
  const o = key[j];
  if (!o) { out[0] = b[0]; out[1] = b[1]; return; }
  if (!full && (j === 'elbow' || j === 'hand' || j === 'rearElbow' || j === 'rearHand')) {
    out[0] = o[0] + base.shoulder[0] - CP_N_SHOULDER[0];
    out[1] = o[1] + base.shoulder[1] - CP_N_SHOULDER[1];
    return;
  }
  out[0] = o[0]; out[1] = o[1];
}
function cpJointAt(base, keys, j, q, out) {
  let i = 0;
  while (i < 4 && q > CP_SEG[i + 1]) i += 1;
  const A = CP_SEG_KEY[i] < 0 ? null : keys[CP_SEG_KEY[i]];
  const B = CP_SEG_KEY[i + 1] < 0 ? null : keys[CP_SEG_KEY[i + 1]];
  const u = cpSmooth((q - CP_SEG[i]) / (CP_SEG[i + 1] - CP_SEG[i]));
  cpKeyJoint(base, A, j, CP_PA);
  cpKeyJoint(base, B, j, CP_PB);
  out[0] = CP_PA[0] + (CP_PB[0] - CP_PA[0]) * u;
  out[1] = CP_PA[1] + (CP_PB[1] - CP_PA[1]) * u;
}
function cpEase(mode, u) {
  const v = cpClamp(u);
  return mode === 1 ? 1 - (1 - v) * (1 - v) : mode === 2 ? v * v : v * v * (3 - 2 * v);
}
// Anchor point of item key K at progress q (the current pose when q is the pose's own q).
function cpAnchor(pose, base, keys, spec, K, q, now, from, out) {
  const an = K[1];
  if (an === CP_AT_FROM) {
    const f = from || CP_FROM_DEFAULT;
    out[0] = f[0] + spec.grip[0] + spec.seat[0] + K[2];
    out[1] = f[1] + spec.grip[1] + spec.seat[1] - spec.hover - spec.bob * 0.5 + K[3];
    return;
  }
  if (an === CP_AT_POSE) { out[0] = K[2]; out[1] = K[3]; return; }
  const j = an === CP_AT_HAND ? 'hand' : an === CP_AT_HEAD ? 'head' : 'shoulder';
  let src = pose[j];
  if (!now) { cpJointAt(base, keys, j, q, CP_PC); src = CP_PC; }
  const hold = an === CP_AT_HAND && spec.hold;
  out[0] = src[0] + K[2] + (hold ? hold[0] : 0);
  out[1] = src[1] + K[3] + (hold ? hold[1] : 0);
}
function cpPlace(out, pose, base, keys, spec, A, B, u, q, now, from) {
  cpAnchor(pose, base, keys, spec, A, q, now, from, CP_QA);
  let x = CP_QA[0], y = CP_QA[1], a = A[4], s = A[5] || spec.held, k = A[6];
  if (B) {
    cpAnchor(pose, base, keys, spec, B, q, now, from, CP_QB);
    x += (CP_QB[0] - x) * u; y += (CP_QB[1] - y) * u;
    a += (B[4] - a) * u; s += ((B[5] || spec.held) - s) * u; k += (B[6] - k) * u;
  }
  out[0] = 1; out[1] = x; out[2] = y; out[3] = a; out[4] = s; out[5] = k;
}
function cpNewPose() {
  return { hip: [0, 0], shoulder: [0, 0], head: [0, 0], rearKnee: [0, 0], rearFoot: [0, 0], frontKnee: [0, 0],
    frontFoot: [0, 0], rearElbow: [0, 0], rearHand: [0, 0], elbow: [0, 0], hand: [0, 0], weaponAngle: -1.24,
    q: 0, item: [0, 0, 0, 0, 1, 0], release: [0, 0, 0, 0, 1, 0], remnant: [0, 0, 0] };
}
function consumePose(base, kind, p, from = null, out = null) {
  const spec = CONSUMABLES[kind] || CONSUMABLES.heal;
  const keys = CP_USE_KEYS[spec.use] || CP_USE_KEYS.drink;
  const track = CP_TRACKS[spec.use] || CP_TRACKS.drink;
  const pose = out || cpNewPose();
  const q = cpClamp(p);
  for (let j = 0; j < CP_JOINTS.length; j += 1) cpJointAt(base, keys, CP_JOINTS[j], q, pose[CP_JOINTS[j]]);
  pose.weaponAngle = Number.isFinite(base.weaponAngle) ? base.weaponAngle : -1.24;
  pose.q = q;
  // Item track.
  const it = pose.item, rel = pose.release;
  it[0] = 0; rel[0] = 0;
  let k = 0;
  while (k + 1 < track.length && q >= track[k + 1][0]) k += 1;
  const K = track[k];
  if (K[1] === CP_AT_GONE || K[1] === CP_AT_FLING) {
    if (K[1] === CP_AT_FLING && k > 0) cpPlace(rel, pose, base, keys, spec, track[k - 1], null, 0, K[0], false, from);
  } else {
    const N = track[k + 1];
    const live = N && N[1] !== CP_AT_GONE && N[1] !== CP_AT_FLING;
    const u = live ? cpEase(N[7], (q - K[0]) / (N[0] - K[0])) : 0;
    cpPlace(it, pose, base, keys, spec, K, live ? N : null, u, q, true, from);
  }
  // Steamer / dish left on the floor fades out as the bun or pill is lifted from it.
  const rm = pose.remnant;
  rm[2] = 0;
  if ((kind === 'bun' || kind === 'pill') && q < 0.22) {
    const f = from || CP_FROM_DEFAULT;
    rm[0] = f[0]; rm[1] = f[1] - spec.hover - spec.bob * 0.5; rm[2] = 1 - q / 0.22;
  }
  return pose;
}
// Wine stream from the tipped jar mouth to the drinker's mouth: ink edge, amber core, highlight.
function cpPour(ctx, spec, it, head, t) {
  const a = it[3], s = it[4], ca = Math.cos(a), sa = Math.sin(a);
  const lx = -spec.grip[0], ly = -22.5 - spec.grip[1];
  const mx = it[1] + (lx * ca - ly * sa) * s, my = it[2] + (lx * sa + ly * ca) * s;
  const tx = head[0] + 6.5, ty = head[1] + 2.5;
  const cx = mx + Math.sin(a) * 3, cy = my - Math.cos(a) * 3;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.quadraticCurveTo(cx, cy, tx, ty);
  ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = CP_WINE; ctx.lineWidth = 2.9; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx + 0.6, my + 0.4);
  ctx.quadraticCurveTo(cx + 0.6, cy + 0.4, (mx + tx) / 2 + 0.6, (my + ty) / 2 + 0.6);
  ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 0.9; ctx.stroke();
  for (let i = 0; i < 2; i += 1) {
    const u = (t * 6 + i * 0.5) % 1;
    cpDisc(ctx, tx + 2.5 + i * 2, ty + 1 + u * 5, 1.1 * (1 - u) + 0.3, CP_WINE, INK, 0.6);
  }
}
function drawConsumeHeld(ctx, kind, variant, pose, t) {
  const spec = CONSUMABLES[kind];
  if (!spec || !pose || !pose.item) return;
  const it = pose.item, rm = pose.remnant;
  if (!it[0] && !(rm && rm[2] > 0)) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (rm && rm[2] > 0) {
    const g = ctx.globalAlpha;
    ctx.globalAlpha = g * rm[2];
    ctx.translate(rm[0], rm[1]);
    if (kind === 'bun') cpSteamer(ctx); else cpDish(ctx);
    ctx.translate(-rm[0], -rm[1]);
    ctx.globalAlpha = g;
  }
  if (it[0]) {
    if (kind === 'energy' && it[5] >= 0.99 && it[3] < -2.2) cpPour(ctx, spec, it, pose.head, t);
    ctx.translate(it[1], it[2]);
    ctx.rotate(it[3]);
    ctx.scale(it[4], it[4]);
    ctx.translate(-spec.grip[0], -spec.grip[1]);
    drawConsumableItem(ctx, kind, t, variant, kind === 'bun' || kind === 'pill' ? CP_HELD : 0, it[5]);
  }
  ctx.restore();
}
// Weapon stowed across the back while consuming (draw it with drawHeldWeapon BEFORE the body,
// in the same pose transform): staff and spear diagonal from behind the hip to above the head,
// spear tip up; the crate rides on the back like a pack.
function consumeStow(pose, weapon) {
  const h = pose.hip, s = pose.shoulder;
  let tx = s[0] - h[0], ty = s[1] - h[1];
  const l = Math.sqrt(tx * tx + ty * ty) || 1;
  tx /= l; ty /= l;
  const nx = ty, ny = -tx; // towards the back
  if (weapon === 'crate') {
    const cx = h[0] * 0.45 + s[0] * 0.55 + nx * 10, cy = h[1] * 0.45 + s[1] * 0.55 + ny * 10;
    return [[cx - 1, cy], [cx + 1, cy]];
  }
  const ax = h[0] + nx * 13 - tx * 3, ay = h[1] + ny * 13 - ty * 3;
  const c = Math.cos(0.5), sn = Math.sin(0.5);
  const dx = tx * c - nx * sn, dy = ty * c - ny * sn; // spine tipped forward 0.5 rad
  return [[ax, ay], [ax + dx * 52, ay + dy * 52]];
}

// ---- flung vessels and knocked items ----
// consumeFling: world-space fling from the pose's release point (or, knocked = true, from the
// item in hand when a hit cancels the use). Allocated once per event; drawFlung is a pure
// function of age: flight under gravity, then shatter (tonic, jar), bounce and fade (gourd,
// food, censer), or burst (orb). Returns false once finished.
function consumeFling(pose, kind, variant, x, y, scale, facing, knocked = false) {
  const spec = CONSUMABLES[kind];
  if (!spec || !pose) return null;
  const src = knocked ? pose.item : pose.release;
  if (!src || !src[0] || (!knocked && !spec.fling)) return null;
  const F = knocked ? CP_KNOCK : spec.fling;
  const mode = kind === 'orb' && knocked ? 'puff' : spec.fling && spec.fling.mode === 'shatter' ? 'shatter' : 'bounce';
  return { kind, variant, k: src[5], x: x + facing * scale * src[1], y: y + scale * src[2], a: src[3], s: src[4] * scale,
    vx: F.vx * facing, vy: F.vy, spin: F.spin, floor: y, facing, mode };
}
function cpShard(ctx, x, y, r, a, fill) {
  const c = Math.cos(a) * r, s = Math.sin(a) * r;
  ctx.beginPath();
  ctx.moveTo(x + c, y + s);
  ctx.lineTo(x - s * 0.8 - c * 0.3, y + c * 0.8 - s * 0.3);
  ctx.lineTo(x - c * 0.7 + s * 0.5, y - s * 0.7 - c * 0.5);
  ctx.closePath();
  cpPaint(ctx, fill, INK, 1);
}
function drawFlung(ctx, f, age, t = 0) {
  if (!f || !(age >= 0)) return false;
  const spec = CONSUMABLES[f.kind];
  if (!spec) return false;
  const g0 = ctx.globalAlpha;
  if (f.mode === 'puff') {
    const p = age / 0.45;
    if (p >= 1) return false;
    const E = CP_ORBS[f.variant] || CP_ORBS.air, e = 1 - (1 - p) * (1 - p), r = 6 + 16 * e;
    drawDespawnPuff(ctx, f.x, f.y + 6, p);
    ctx.globalAlpha = g0 * (1 - p);
    ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.86, 0, 0, CP_TAU);
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3.4 * (1 - p) + 1; ctx.stroke();
    ctx.strokeStyle = E.c; ctx.lineWidth = 2 * (1 - p) + 0.6; ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      const a = i * 1.047 + 0.3, d = 8 + 18 * e;
      cpMote(ctx, f.variant, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.8 - 6 * p, 2, E.c);
    }
    cpStar(ctx, f.x, f.y, 8 * (1 - e), CP_WHITE);
    ctx.globalAlpha = g0;
    return true;
  }
  const rest = spec.rad * f.s;
  const drop = Math.max(0, f.floor - rest - f.y);
  const tl = (-f.vy + Math.sqrt(f.vy * f.vy + 2 * CP_GRAV * drop)) / CP_GRAV;
  let x, y, a, alpha = 1;
  if (age < tl) {
    x = f.x + f.vx * age; y = f.y + f.vy * age + 0.5 * CP_GRAV * age * age; a = f.a + f.spin * age;
  } else {
    const la = age - tl, xl = f.x + f.vx * tl;
    if (f.mode === 'shatter') {
      if (la > 0.75) return false;
      const e = 1 - (1 - cpClamp(la / 0.32)) * (1 - cpClamp(la / 0.32));
      drawDespawnPuff(ctx, xl, f.floor - 3, cpClamp(la / 0.42) * 0.99);
      ctx.globalAlpha = g0 * (1 - cpClamp((la - 0.32) / 0.43));
      const sh = spec.shard || CP_ORBS.earth;
      for (let i = 0; i < 6; i += 1) {
        const d = CP_SHARD_D[i] + f.vx * 0.05;
        const hop = Math.sin(Math.PI * cpClamp(la / (0.18 + CP_SHARD_H[i] * 0.006))) * CP_SHARD_H[i];
        cpShard(ctx, xl + d * e, f.floor - 1.5 + (i % 3) * 0.8 - hop, CP_SHARD_R[i], i * 1.9 + (1 - e) * 7, i % 2 ? sh[1] : sh[0]);
      }
      ctx.globalAlpha = g0;
      return true;
    }
    const vyl = f.vy + CP_GRAV * tl, vb = vyl * 0.3, tb = 2 * vb / CP_GRAV, vx2 = f.vx * 0.4;
    if (la < tb) {
      x = xl + vx2 * la; y = f.floor - rest - vb * la + 0.5 * CP_GRAV * la * la; a = f.a + f.spin * (tl + la * 0.6);
    } else {
      const r = la - tb;
      alpha = 1 - cpClamp((r - 0.2) / 0.3);
      if (alpha <= 0) return false;
      x = xl + vx2 * tb + vx2 * 0.35 * Math.min(r, 0.25); y = f.floor - rest;
      a = f.a + f.spin * (tl + tb * 0.6 + Math.min(r, 0.25) * 0.4);
    }
  }
  ctx.save();
  ctx.globalAlpha = g0 * alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(x, y);
  ctx.scale(f.facing, 1);
  ctx.rotate(a);
  ctx.scale(f.s, f.s);
  ctx.translate(-spec.grip[0], -spec.grip[1]);
  drawConsumableItem(ctx, f.kind, t, f.variant, (f.kind === 'bun' || f.kind === 'pill' ? CP_HELD : 0) | CP_STILL, f.k);
  ctx.restore();
  return true;
}

// ---- consume burst ----
// Kind badge: paper disc with the item's mark.
function cpBadge(ctx, kind, variant, x, y, r, color) {
  cpDisc(ctx, x, y, r, PAPER, INK, 1.2);
  ctx.beginPath(); ctx.arc(x, y, r - 1.8, 0, CP_TAU);
  ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
  const m = r * 0.48;
  if (kind === 'heal' || kind === 'bun' || kind === 'peach' || kind === 'incense') {
    const w = kind === 'bun' ? 1.6 : 2.3, k = kind === 'bun' ? m * 0.75 : m;
    cpCross(ctx, x, y, k, color, w);
    if (kind === 'peach') { cpCross(ctx, x + k + 1.6, y - k + 0.8, 1.4, CP_GOLD, 1.2); }
    if (kind === 'incense') { cpDisc(ctx, x + k + 1.2, y - k + 0.4, 1, CP_EMBER); }
  } else if (kind === 'energy') {
    cpBolt(ctx, x, y, m, color);
  } else if (kind === 'gourd') {
    ctx.beginPath(); ctx.arc(x, y, m, 0.3, 4.6); ctx.arc(x + m * 0.2, y - m * 0.2, m * 0.42, 4.6, 1.2, true);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  } else if (kind === 'pill') {
    cpDisc(ctx, x, y, m * 0.85, CP_GOLD, INK, 1);
    cpDisc(ctx, x - m * 0.3, y - m * 0.3, m * 0.28, CP_WHITE);
  } else if (kind === 'orb') {
    cpGlyph(ctx, variant, x, y + 0.3, m * 1.05, color, 1.5);
  }
}
// Kind-shaped mote on a paper under-stroke: crosses (HP), diamonds (EN), curls (qi flow), gold
// stars (power), element motes (orbs).
function cpSparkMote(ctx, kind, variant, x, y, color) {
  const cat = CONSUMABLES[kind].cat;
  if (kind === 'gourd') {
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0.4, 4.4);
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
  } else if (kind === 'orb') {
    cpDisc(ctx, x, y, 3.2, PAPER);
    cpMote(ctx, variant, x, y, 2, color);
  } else if (cat === 'hp') {
    cpCross(ctx, x, y, 2.6, PAPER, 4); cpCross(ctx, x, y, 2.4, color, 1.7);
  } else if (cat === 'en') {
    cpDiamond(ctx, x, y, 4.2, PAPER); cpDiamond(ctx, x, y, 3, color);
  } else {
    cpStar(ctx, x, y, 4.4, PAPER); cpStar(ctx, x, y, 3.3, color);
  }
}
// Consume burst, read as "drawn in" rather than a hit: a dashed ring and six sparks converge on
// the chest (p < 0.32), then a soft ring pulses out, motes spiral up the body and the kind badge
// rises beside the head on the back side (clear of the player marker and enemy HP bar). Every
// coloured stroke sits on a paper under-stroke, so it reads on every element's body colour.
function drawConsumeSparkle(ctx, kind, variant, x, y, p, h = 66, facing = 1, reduced = false) {
  const spec = CONSUMABLES[kind];
  if (!spec || !(p >= 0 && p < 1)) return;
  const color = kind === 'orb' ? (CP_ORBS[variant] || CP_ORBS.air).c : spec.spark;
  const cy = y - h * 0.55;
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p < 0.32 && !reduced) {
    const u = p / 0.32, r = 28 - 20 * u * u;
    ctx.globalAlpha = base * (0.5 + 0.5 * u);
    ctx.beginPath(); ctx.ellipse(x, cy, r, r * 0.86, 0, 0, CP_TAU);
    ctx.setLineDash(CP_SPARK_DASH); ctx.lineDashOffset = -u * 12;
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3.4 + 1.2 * u; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5 + 1.2 * u; ctx.stroke();
    ctx.setLineDash(CP_NO_DASH);
    for (let i = 0; i < 6; i += 1) {
      const a = i * CP_TAU / 6 + 0.5 + u * 0.9;
      const sx = x + Math.cos(a) * r, sy = cy + Math.sin(a) * r * 0.86;
      cpStar(ctx, sx, sy, 5.6, PAPER);
      cpStar(ctx, sx, sy, 4.2, color);
      cpStar(ctx, sx, sy, 1.8, CP_WHITE);
    }
  }
  if (p > 0.26) {
    const u = (p - 0.26) / 0.74, e = 1 - (1 - u) * (1 - u), r = 9 + 21 * e;
    ctx.globalAlpha = base * (1 - u) * (1 - u) * 0.9;
    ctx.beginPath(); ctx.ellipse(x, cy, r, r * 0.86, 0, 0, CP_TAU);
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3 + 2 * (1 - u); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.2 + 2 * (1 - u); ctx.stroke();
  }
  const core = Math.sin(Math.min(1, p / 0.5) * Math.PI);
  if (core > 0.02 && !reduced) {
    ctx.globalAlpha = base;
    cpStar(ctx, x, cy, 10 * core, PAPER);
    cpStar(ctx, x, cy, 8.5 * core, color);
    cpStar(ctx, x, cy, 5.5 * core, CP_WHITE);
  }
  if (!reduced) {
    for (let i = 0; i < 5; i += 1) {
      const u = (p - 0.24 - i * 0.06) / 0.62;
      if (u <= 0 || u >= 1) continue;
      const a = u * 5.5 + i * 1.3;
      const mx = x + Math.cos(a) * (15 - 5 * u), my = y - 8 - u * (h + 2);
      ctx.globalAlpha = base * Math.sin(u * Math.PI);
      cpSparkMote(ctx, kind, variant, mx, my, color);
    }
  }
  if (p > 0.3) {
    const u = (p - 0.3) / 0.7;
    ctx.globalAlpha = base * Math.min(1, u * 5) * Math.min(1, (1 - u) * 3);
    const rise = reduced ? 0.5 : 1 - (1 - u) * (1 - u);
    cpBadge(ctx, kind, variant, x - facing * 29, y - h + 4 - 12 * rise, 8, color);
  }
  ctx.restore();
}

// ---- planted censer field and timed-buff overlays ----
function drawIncenseAura(ctx, x, y, t, remaining, color = CP_HEAL) {
  const k = Math.min(1, remaining * 6, (1 - remaining) * 12 + 0.25);
  if (!(k > 0)) return;
  const rx = 90 * (0.75 + 0.25 * Math.min(1, (1 - remaining) * 12)), ry = rx * 0.31;
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = base * 0.1 * k;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, CP_TAU);
  ctx.fillStyle = '#c99a5c'; ctx.fill();
  ctx.globalAlpha = base * 0.6 * k;
  ctx.setLineDash(CP_AURA_DASH);
  ctx.lineDashOffset = -t * 14;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash(CP_NO_DASH);
  ctx.globalAlpha = base * 0.5 * k;
  ctx.beginPath(); ctx.ellipse(x, y, rx * 0.9, ry * 0.9, 0, 0, CP_TAU);
  ctx.strokeStyle = CP_WHITE; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.globalAlpha = base * k;
  for (let i = 0; i < 7; i += 1) {
    const a = i * CP_TAU / 7 + t * 0.25;
    const u = (t * 0.45 + i * 0.29) % 1;
    cpWisp(ctx, x + Math.cos(a) * rx * 0.86, y + Math.sin(a) * ry * 0.86 - 4, u, 26, CP_SMOKE, 1.3, 0.55);
  }
  for (let i = 0; i < 4; i += 1) {
    const u = (t * 0.6 + i * 0.25) % 1;
    const px = x + Math.cos(i * 1.9 + 0.6) * rx * 0.5, py = y + Math.sin(i * 1.9 + 0.6) * ry * 0.5 - u * 24;
    ctx.globalAlpha = base * k * Math.sin(u * Math.PI) * 0.85;
    cpCross(ctx, px, py, 2.4, color, 1.6);
  }
  ctx.restore();
}
// Ellipse arc of the countdown ring split into far (layer 0, behind the body) and near (layer 1)
// halves. The visible arc (remaining * full turn) stays centred on the near side.
function cpOrbitArc(ctx, x, y, rx, ry, remaining, layer) {
  const half = remaining * Math.PI, lo = Math.PI / 2 - half, hi = Math.PI / 2 + half;
  ctx.beginPath();
  if (layer === 1) {
    ctx.ellipse(x, y, rx, ry, 0, Math.max(0, lo), Math.min(Math.PI, hi));
  } else {
    if (hi > Math.PI) ctx.ellipse(x, y, rx, ry, 0, Math.PI, hi);
    if (lo < 0) { ctx.moveTo(x + rx * Math.cos(lo), y + ry * Math.sin(lo)); ctx.ellipse(x, y, rx, ry, 0, lo + CP_TAU, CP_TAU); }
  }
}
// Timed buffs at the torso, clear of the feet (where the player's element ring sits).
// pill: a gold countdown ring orbiting the waist with two stars and rising gold flecks.
// gourd: a qi ribbon spiralling up the torso (it loses turns as the buff runs out) and qi curls.
// incense: rising green crosses while standing in a censer field.
function drawConsumableBuff(ctx, kind, x, y, h, t, remaining = 1, layer = 1) {
  const base = ctx.globalAlpha;
  const left = cpClamp(remaining);
  const low = left < 0.2 ? (Math.floor(t * 6) % 2 ? 0.45 : 1) : 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'pill') {
    const cy = y - h * 0.4, rx = 19, ry = 5.5;
    ctx.globalAlpha = base * 0.9 * low;
    cpOrbitArc(ctx, x, cy, rx, ry, left, layer);
    ctx.strokeStyle = PAPER; ctx.lineWidth = layer ? 3.6 : 3; ctx.stroke();
    ctx.strokeStyle = layer ? CP_GOLD : CP_GOLD_DEEP; ctx.lineWidth = layer ? 1.9 : 1.5; ctx.stroke();
    for (let i = 0; i < 2; i += 1) {
      const a = t * 3 + i * Math.PI, depth = Math.sin(a);
      if ((depth >= 0) !== (layer === 1)) continue;
      const sx = x + Math.cos(a) * rx, sy = cy + depth * ry;
      ctx.globalAlpha = base * (0.7 + depth * 0.3);
      cpStar(ctx, sx, sy, 5.4, PAPER);
      cpStar(ctx, sx, sy, 4.2, CP_GOLD_HOT);
    }
    if (layer === 1) {
      for (let i = 0; i < 3; i += 1) {
        const u = (t * 1.3 + i / 3) % 1;
        ctx.globalAlpha = base * Math.sin(u * Math.PI) * 0.9;
        cpMote(ctx, 'fire', x + (i - 1) * 11, cy - 8 - u * h * 0.55, 1.7, CP_GOLD);
      }
    }
  } else if (kind === 'gourd') {
    // One qi ribbon spiralling up from the hip; it loses turns as the buff runs out.
    const y0 = y - h * 0.2, y1 = y - h * 0.86, rx = 17, ry = 5;
    const turns = 0.45 + 0.8 * left;
    ctx.globalAlpha = base * 0.9 * low;
    const a0 = t * 2.6;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 16; i += 1) {
      const u = i / 16, a = a0 + u * turns * CP_TAU;
      const px = x + Math.cos(a) * rx * (1 - u * 0.3), py = y0 + (y1 - y0) * u * turns / 1.25 + Math.sin(a) * ry;
      if ((Math.sin(a) >= 0) === (layer === 1)) { if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; } }
      else pen = false;
    }
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3.6; ctx.stroke();
    ctx.strokeStyle = layer ? CP_QI_HI : CP_QI; ctx.lineWidth = 1.8; ctx.stroke();
    if (layer === 1) {
      for (let i = 0; i < 2; i += 1) {
        const u = (t * 0.8 + i * 0.5) % 1;
        const px = x + (i ? 12 : -12), py = y1 + 4 - u * 16;
        ctx.globalAlpha = base * Math.sin(u * Math.PI) * 0.9;
        ctx.beginPath(); ctx.arc(px, py, 3, 0.4, 4.6); ctx.arc(px + 0.7, py - 0.7, 1.3, 4.6, 1.4, true);
        ctx.strokeStyle = PAPER; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.strokeStyle = CP_QI_HI; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  } else if (kind === 'incense' && layer === 1) {
    for (let i = 0; i < 3; i += 1) {
      const u = (t * 0.7 + i / 3) % 1;
      const px = x + (i - 1) * 12, py = y - 10 - u * h * 0.8;
      ctx.globalAlpha = base * Math.sin(u * Math.PI) * 0.9;
      cpCross(ctx, px, py, 2.6, PAPER, 4);
      cpCross(ctx, px, py, 2.4, CP_HEAL_HI, 1.7);
    }
  }
  ctx.restore();
}

export {
  CONSUMABLES, CP_ORBS, CP_HELD, CP_STILL, CP_SPARKLE_TIME, CP_BLINK_START, CP_DISSOLVE, CP_FLING_LIFE, CP_PLANT_X,
  CP_USE_KEYS, CP_TRACKS, drawConsumable, drawConsumableItem, consumePose, drawConsumeHeld, consumeStow,
  consumeFling, drawFlung, drawConsumeSparkle, consumableFade, drawDespawnPuff, drawIncenseAura, drawConsumableBuff, cpBadge,
};
