// Fourfold weapon and throwable art (Wuxia ink style, see src/fighter-art.js): ground pickups,
// held weapons, thrown flight, the worn jade bracer, broken debris and the thunder-lantern
// burst. Ported unchanged from the approved weapons preview (output/asset-previews/
// weapons-assets.js, its ASSETS block). It only touches the ctx it is given: no DOM, no
// gradients, no shadowBlur, and every shape is a module-level constant, so a frame with many
// weapons allocates nothing beyond one ctx.getTransform() per public call (the detail LOD).
// Gameplay numbers live in src/data.js (WEAPON_SPECS); the renderer wires these into the game.

// Original weapon set drawn in the "Wuxia Silhouettes" ink style (see src/fighter-art.js):
// one ink outline weight (1.2-2 px), muted wood/brass/steel fills, element colour only where
// a weapon is element-forged. Units are pose units = px at 1x (a fighter is 66 tall).
// Like fighter-art, hairline details (grain, node ticks, rope hatching, lacing, frost motes)
// only draw at >= 1.3 device px per pose unit; at 1x they would only mush into noise.
//
// API (every function saves/restores the ctx state it changes)
//   WEAPON_ART[kind]   render hints: { bob, shadow, glint: [x, y, r], spark: [x, y, size], spin,
//                      upright, worn, restAngle }. restAngle = idle weaponAngle for fighterPose
//                      (default -1.24).
//   drawWeaponPickupArt(ctx, kind, time, seed) -> bob
//       ctx at the pickup's ground point. Draws the soft paper glint disc (existing
//       convention), the item (light items bob, heavy/planted ones do not) and a periodic
//       twinkle. time = 0 (the renderer's reduced-motion value) freezes the bob and skips the
//       twinkle. Returns the bob offset so the caller can keep its "E" prompt with the item.
//   drawHeldWeaponArt(ctx, kind, start, end, t)
//       Same contract as Renderer.drawHeldWeapon(kind, start, end) plus t, the fighter's
//       animation clock (drawFighter's `flutter`: visualTime, 0 under reduced motion).
//       fist = start + (end - start) * 23/52, weapon axis = start -> end, pose units, facing
//       flip already applied. Boxes, stones and the lantern stay upright (gravity). Because
//       the points are in pose units they also give the fist height: once the fist rises
//       above the shoulder (y < -48, the throw wind-up) the lantern is whirled out along the
//       arm and the mill stone lifts clear of the head. 'bracer' draws nothing here.
//   drawWornArmorArt(ctx, kind, elbow, hand, t, flash, element, k)
//       Call AFTER drawFighterBody with the same transform (like the existing armour plates).
//       element picks the forearm width (mirrors fighter-art BUILDS); k = 1.14 for bosses.
//   drawThrownWeaponArt(ctx, kind, spin, t, vx, vy)
//       ctx TRANSLATED to the projectile but NOT rotated: the function aims along (vx, vy)
//       itself and mirrors leftward flight, so blades and tassels stay right side up, a
//       positive spin always rolls forward (a mill stone rolling left turns anticlockwise)
//       and highlights stay lit from the upper left. spin = accumulated angle
//       (WEAPON_ART[kind].spin rad/s). Spears and the jian fly point-first and ignore spin.
//   WEAPON_SHARDS[kind]            [[x, y], ...] rest offset of each debris piece in the
//                                  (unmirrored) thrown frame, so pieces spawn where they sat.
//   drawWeaponShardArt(ctx, kind, index)   one debris piece, its bounding box centred on the
//                                  origin (so it spins about its own middle).
//   drawWeaponBreakPuff(ctx, p, color)     p 0..1 snap burst where a weapon broke.
//   drawLanternBurst(ctx, p)               p 0..1 explosion of the thunder lantern (~0.6 s).
const WK = {
  ink: '#263b3c', inkSoft: '#4f625f', paper: '#fff8e8', glint: '#fffbe9', smoke: '#5f6d68',
  wood: '#c49a62', woodDark: '#8f6b42', woodLight: '#e6cb94', woodDeep: '#5e4631', woodGrain: '#b48d5c',
  wax: '#dcbd86', waxSheen: '#fbecc6', wrap: '#f3ead0',
  brass: '#cf9f45', brassLight: '#f0d58e',
  lacquer: '#b4493a', lacquerDark: '#82342b',
  steel: '#a8b6b2', steelDark: '#6d7e7b', steelEdge: '#f1f6f1',
  stone: '#b0b8aa', stoneDark: '#77806f', stoneLight: '#e3e8d8', quartz: '#fdfdf3',
  mill: '#bcb49c', millDark: '#857e69', millLight: '#e2dcc4', hole: '#3d4c4a',
  lantern: '#d4654b', lanternGlow: '#f29a5c', lanternBurnt: '#5a2e24', flame: '#ffd383', flameHot: '#fff1b9', fire: '#e88b42',
  air: '#388e8b', airLight: '#86c3b8', water: '#397fbe', waterDeep: '#2b5f8e',
  ice: '#dcf1f8', iceMid: '#98cbe0', iceDeep: '#5f9fb5',
  jade: '#5fa48a', jadeLight: '#b3dcc6', jadeDark: '#3d7462', jadeHollow: '#2c5246', gold: '#d9a93f',
  straw: '#dcc58e', talisman: '#f6ecc8', seal: '#b4493a',
};
const WK_TAU = Math.PI * 2;
const WK_GRIP = 23 / 52;
const WK_LIGHT = -2.15; // world angle of the key light (upper left), for world-fixed highlights

export const WEAPON_ART = {
  staff:     { bob: true,  shadow: 18, glint: [0, -14, 25], spark: [24, -29, 4.4], spin: 9 },
  spear:     { bob: true,  shadow: 20, glint: [3, -16, 27], spark: [36, -32, 4.4], spin: 0 },
  crate:     { bob: false, shadow: 25, glint: [0, -16, 26], spark: [-15, -29, 4.4], spin: 4, upright: true },
  knives:    { bob: true,  shadow: 15, glint: [1, -14, 21], spark: [12.5, -25, 3.6], spin: 16, restAngle: -0.9 },
  guandao:   { bob: true,  shadow: 24, glint: [2, -18, 30], spark: [37, -37, 4.4], spin: 6 },
  stone:     { bob: true,  shadow: 10, glint: [0, -8, 14],  spark: [-3, -11.5, 2.4], spin: 14, upright: true },
  millstone: { bob: false, shadow: 17, glint: [1, -13, 20], spark: [-7, -22, 3.4], spin: 8, upright: true },
  lantern:   { bob: true,  shadow: 12, glint: [0, -13, 19], spark: [-5, -18, 3], spin: 5, upright: true },
  chakram:   { bob: true,  shadow: 12, glint: [0, -17, 20], spark: [-5, -25, 3.2], spin: 22 },
  jian:      { bob: false, shadow: 15, glint: [0, -22, 23], spark: [1, -36, 3.6], spin: 0 },
  bracer:    { bob: true,  shadow: 14, glint: [0, -12, 18], spark: [11.4, -17.1, 2.8], spin: 7, worn: true },
};

// ---- level of detail: hairlines only when a pose unit covers >= 1.3 device px ----
let wkFine = true;
function wkLod(ctx) {
  const m = ctx.getTransform();
  wkFine = m.a * m.a + m.b * m.b >= 1.69;
}

// ---- primitives (flat constant point lists, no per-call allocation) ----
function wkPath(ctx, p, close) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  if (close !== false) ctx.closePath();
}
function wkPaint(ctx, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function wkShape(ctx, p, fill, lw = 1.4, stroke = WK.ink) { wkPath(ctx, p); wkPaint(ctx, fill, stroke, lw); }
function wkLine(ctx, x0, y0, x1, y1, color, w) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}
function wkDisc(ctx, x, y, r, fill, lw = 0, stroke = WK.ink) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, WK_TAU);
  wkPaint(ctx, fill, stroke, lw);
}
function wkOval(ctx, x, y, rx, ry, fill, lw = 0, stroke = WK.ink) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, WK_TAU);
  wkPaint(ctx, fill, stroke, lw);
}
// Ink-outlined rod along local x (the staff/shaft stroke used by the old drawHeldWeapon).
function wkRod(ctx, x0, x1, r, fill, lw = 1.5) {
  wkLine(ctx, x0, 0, x1, 0, WK.ink, r * 2 + lw * 2);
  wkLine(ctx, x0, 0, x1, 0, fill, r * 2);
}
function wkBand(ctx, x0, x1, w, fill) {
  ctx.lineCap = 'butt';
  wkLine(ctx, x0, 0, x1, 0, WK.ink, w + 2.6);
  wkLine(ctx, x0 + 0.6, 0, x1 - 0.6, 0, fill, w);
  ctx.lineCap = 'round';
}
function wkTick(ctx, x, h, lw = 1.1, color = WK.ink) { wkLine(ctx, x, -h, x, h, color, lw); }
function wkStar(ctx, x, y, s, fill, lw = 0) {
  const q = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + q, y - q); ctx.lineTo(x + s, y); ctx.lineTo(x + q, y + q);
  ctx.lineTo(x, y + s); ctx.lineTo(x - q, y + q); ctx.lineTo(x - s, y); ctx.lineTo(x - q, y - q);
  ctx.closePath();
  wkPaint(ctx, fill, WK.ink, lw);
}
function wkAlpha(ctx, a) { ctx.globalAlpha = a; }
function wkClamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Horsehair tassel tied at x0 on a shaft, streaming back along -x.
function wkTassel(ctx, x0, t, k) {
  const s = Math.sin(t * 5.3 + x0) * 1.3;
  ctx.beginPath();
  ctx.moveTo(x0, -2.3 * k);
  ctx.bezierCurveTo(x0 - 4 * k, -5.4 * k + s, x0 - 9 * k, -4.6 * k + s, x0 - 12.5 * k, -0.8 * k + s * 1.5);
  ctx.bezierCurveTo(x0 - 9.5 * k, 0.6 * k + s, x0 - 8 * k, 2.4 * k + s, x0 - 10.5 * k, 5.4 * k + s * 1.2);
  ctx.bezierCurveTo(x0 - 6 * k, 5.6 * k + s * 0.5, x0 - 2.5 * k, 3.6 * k, x0, 2.3 * k);
  ctx.closePath();
  wkPaint(ctx, WK.lacquer, WK.ink, 1.1);
  if (!wkFine) return;
  ctx.beginPath();
  ctx.moveTo(x0 - 1.5 * k, -0.4 * k);
  ctx.quadraticCurveTo(x0 - 6 * k, 0.4 * k + s, x0 - 9.5 * k, 1.2 * k + s * 1.3);
  ctx.strokeStyle = WK.lacquerDark;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}
// Tapered cloth streamer from (x, y) along angle ang.
function wkStreamer(ctx, x, y, ang, len, t, color) {
  const c = Math.cos(ang), n = Math.sin(ang), s = Math.sin(t * 6.5 + x * 0.7) * 1.7;
  ctx.beginPath();
  ctx.moveTo(x - n * 1.3, y + c * 1.3);
  ctx.quadraticCurveTo(x + c * len * 0.55 - n * (s + 1), y + n * len * 0.55 + c * (s + 1), x + c * len - n * s * 1.6, y + n * len + c * s * 1.6);
  ctx.quadraticCurveTo(x + c * len * 0.5 - n * (s - 0.6), y + n * len * 0.5 + c * (s - 0.6), x + n * 1.3, y - c * 1.3);
  ctx.closePath();
  wkPaint(ctx, color, WK.ink, 0.9);
}

// ---- weapon bodies, local frame: fist at the origin, +x towards the business end,
//      +y = the leading side of a forward swing (edges face +y) ----
function wkStaff(ctx) {
  // pale wax-wood: lighter than the spear's shaft, with a long wax sheen and a cloth grip
  wkRod(ctx, -25, 31, 1.9, WK.wax);
  wkLine(ctx, -21, -0.85, 27, -0.85, WK.waxSheen, 1.2);
  wkBand(ctx, -10.5, 8.5, 4.6, WK.wrap);
  if (wkFine) for (let x = -9.2; x < 7; x += 2.3) wkLine(ctx, x, -2.1, x + 1.3, 2.1, WK.inkSoft, 0.75);
  wkLine(ctx, -25, 0, -22.4, 0, WK.brass, 3.8);
  wkLine(ctx, 28.4, 0, 31, 0, WK.brass, 3.8);
  wkTick(ctx, -21.7, 2.5);
  wkTick(ctx, 27.7, 2.5);
  if (wkFine) { wkTick(ctx, -16, 1.9, 0.9); wkTick(ctx, 15, 1.9, 0.9); wkTick(ctx, 21.5, 1.9, 0.9); }
}

const WK_SPEAR_SOCKET = [26.5, -2.3, 31, -2.9, 31, 2.9, 26.5, 2.3];
const WK_SPEAR_BLADE = [31, -2.2, 34, -4.7, 39, -4.3, 47.5, 0, 39, 4.3, 34, 4.7, 31, 2.2];
function wkSpearHead(ctx) {
  wkShape(ctx, WK_SPEAR_SOCKET, WK.brass, 1.2);
  wkShape(ctx, WK_SPEAR_BLADE, WK.steel, 1.4);
  wkLine(ctx, 32.5, 0, 44, 0, WK.steelDark, 0.9);
  wkLine(ctx, 34.5, -3.1, 39.5, -2.5, WK.steelEdge, 0.9);
}
function wkSpear(ctx, t) {
  wkTassel(ctx, 28.5, t, 1);
  wkRod(ctx, -25, 28, 1.7, WK.wood);
  if (wkFine) wkLine(ctx, -19, -0.7, 24, -0.7, WK.woodLight, 0.9);
  wkLine(ctx, -25, 0, -22.6, 0, WK.brass, 3.4);
  wkTick(ctx, -22, 2.3);
  wkSpearHead(ctx);
}

const WK_GD_SPIKE = [-39, 0, -33, -2.8, -33, 2.8];
const WK_GD_COLLAR = [18, -2.9, 20, -4, 23, -3.7, 23, 3.7, 20, 4, 18, 2.9];
const WK_GD_BLADE = [23, -2.9, 23, 3.7, 27, 7.7, 33, 9.5, 39, 8.3, 43.5, 4.9, 46, 0.6, 46.6, -3.9, 42, -2.9, 37.2, -2.8, 35.6, -6.9, 33.6, -2.8];
const WK_GD_BEVEL = [25.6, 4.7, 32, 7.1, 38.4, 6.3, 42.4, 3.5];
function wkGuandaoHead(ctx) {
  wkShape(ctx, WK_GD_COLLAR, WK.brass, 1.2);
  wkShape(ctx, WK_GD_BLADE, WK.steel, 1.5);
  wkPath(ctx, WK_GD_BEVEL, false);
  wkPaint(ctx, null, WK.steelEdge, 1.1);
  wkLine(ctx, 24.5, -1.2, 40.5, -1.2, WK.steelDark, 1.1);
  wkDisc(ctx, 27.4, 2.6, 1.15, WK.brass, 0.8);
}
function wkGuandao(ctx, t) {
  wkTassel(ctx, 19.5, t, 1.25);
  wkShape(ctx, WK_GD_SPIKE, WK.steel, 1.3);
  wkRod(ctx, -33, 19, 2.15, WK.woodDark);
  if (wkFine) wkLine(ctx, -28, -0.95, 15, -0.95, WK.woodGrain, 0.9);
  wkLine(ctx, -33, 0, -30.4, 0, WK.brass, 4.3);
  wkTick(ctx, -29.8, 2.7);
  if (wkFine) {
    // cord wraps either side of the fist (a two-hander's grip zones)
    wkLine(ctx, -9.8, -2.1, -8.6, 2.1, WK.ink, 0.9);
    wkLine(ctx, -7.6, -2.1, -6.4, 2.1, WK.ink, 0.9);
    wkLine(ctx, 5.4, -2.1, 6.6, 2.1, WK.ink, 0.9);
    wkLine(ctx, 7.6, -2.1, 8.8, 2.1, WK.ink, 0.9);
  }
  wkGuandaoHead(ctx);
}

const WK_KNIFE_BLADE = [3.4, -2.1, 17.5, -2.1, 24.5, -1.3, 22, 1.9, 15.5, 4.1, 7.5, 4.4, 3.4, 3.2];
const WK_KNIFE_GUARD = [1.9, -4.4, 3.5, -3.6, 3.5, 3.4, 1.9, 3.4];
function wkKnifeHilt(ctx, dGuard) {
  // D-shaped knuckle guard on the edge side (held and flying only: on the ground two loops
  // read as scissor handles), then the lacquered grip and quillon.
  if (dGuard) {
    ctx.beginPath();
    ctx.moveTo(2.6, 2.8);
    ctx.bezierCurveTo(2, 8.8, -6.8, 8.6, -6.2, 1.4);
    ctx.strokeStyle = WK.ink; ctx.lineWidth = 3.1; ctx.stroke();
    ctx.strokeStyle = WK.brass; ctx.lineWidth = 1.4; ctx.stroke();
  }
  wkRod(ctx, -5.5, 2, 1.45, WK.lacquer, 1.2);
  wkDisc(ctx, -6.2, 0, 1.6, WK.brass, 1);
  wkShape(ctx, WK_KNIFE_GUARD, WK.brass, 1);
  wkLine(ctx, 2.6, -4.2, 0.6, -5.6, WK.ink, 1.2);
}
function wkKnife(ctx, fill, dGuard = true) {
  wkKnifeHilt(ctx, dGuard);
  wkShape(ctx, WK_KNIFE_BLADE, fill, 1.3);
  if (wkFine) wkLine(ctx, 4.6, -0.6, 17, -0.6, WK.steelDark, 0.8);
  wkLine(ctx, 7.6, 3.2, 15.4, 3, WK.steelEdge, 0.9);
}
function wkKnifePair(ctx) {
  // the second knife fans out behind the first, a darker steel so the pair reads as two
  ctx.save();
  ctx.rotate(-0.34);
  ctx.translate(0.6, -1.3);
  wkShape(ctx, WK_KNIFE_BLADE, WK.steelDark, 1.3);
  wkLine(ctx, 7.6, 3.2, 15.4, 3, WK.steel, 0.9);
  ctx.restore();
  wkKnife(ctx, WK.steel);
}
function wkKnivesOnGround(ctx) {
  // laid side by side, nearly parallel and a little staggered, edges the same way, a red
  // cord binding the grips: a pair of knives, never a pair of (crossed or open) scissors
  ctx.save(); ctx.translate(1.8, -3.5); ctx.rotate(-0.05); wkKnife(ctx, WK.steel, false); ctx.restore();
  ctx.save(); ctx.translate(-1.8, 3.5); ctx.rotate(0.04); wkKnife(ctx, WK.steel, false); ctx.restore();
  ctx.beginPath();
  ctx.ellipse(-2.4, 0, 1.5, 5.4, 0, 0, WK_TAU);
  ctx.moveTo(-3.6, 4.6);
  ctx.quadraticCurveTo(-7.5, 6.2, -9.5, 9.6);
  ctx.strokeStyle = WK.ink; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = WK.lacquer; ctx.lineWidth = 1.2; ctx.stroke();
}

const WK_CK_TAB = [10.3, -2.9, 14.9, -0.4, 10.3, 1.9];
function wkChakram(ctx, t, sx) {
  ctx.save();
  if (sx !== 1) ctx.scale(sx, 1);
  for (let i = 0; i < 4; i += 1) {
    ctx.save();
    ctx.rotate(i * Math.PI / 2 + Math.PI / 4);
    wkShape(ctx, WK_CK_TAB, WK.steel, 1.1);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 8.6, 0, WK_TAU);
  ctx.strokeStyle = WK.ink; ctx.lineWidth = 6.6; ctx.stroke();
  ctx.strokeStyle = WK.steel; ctx.lineWidth = 3.8; ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 9.6, -2.3, -0.7);
  ctx.strokeStyle = WK.steelEdge; ctx.lineWidth = 0.9; ctx.stroke();
  wkChakramWrap(ctx, Math.PI);
  ctx.restore();
}
// air-cloth grip wrap centred on ring angle a (the side that sits in the fist)
function wkChakramWrap(ctx, a) {
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(0, 0, 8.6, a - 0.6, a + 0.6);
  ctx.strokeStyle = WK.ink; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = WK.air; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.lineCap = 'round';
  if (!wkFine) return;
  for (let j = -1; j <= 1; j += 1) {
    const b = a + j * 0.33, c = Math.cos(b), s = Math.sin(b);
    wkLine(ctx, c * 6.8, s * 6.8, c * 10.4, s * 10.4, WK.ink, 0.8);
  }
}

const WK_JIAN_GUARD = [2, -1.7, 2.7, -5.7, 4.7, -2.4, 4.7, 2.4, 2.7, 5.7, 2, 1.7];
const WK_JIAN_BLADE = [4.7, -2.1, 38.5, -1.85, 43.5, 0, 38.5, 1.85, 4.7, 2.1];
const WK_JIAN_PLANTED = [4.7, -2.1, 35, -1.9, 35, 1.9, 4.7, 2.1];
const WK_JIAN_RIME1 = [6.4, -1.9, 8.4, -5, 10.2, -1.9];
const WK_JIAN_RIME2 = [11.4, 1.9, 12.8, 4.3, 14.2, 1.9];
function wkJianHilt(ctx, t, planted) {
  const s = Math.sin(t * 4.6) * 1.4;
  ctx.beginPath();
  if (planted) {
    // hilt up (+x = down): the cord drops off the pommel and hangs straight beside the grip,
    // its tuft stopping just above the guard
    ctx.moveTo(-7.5, 1.1);
    ctx.quadraticCurveTo(-6.6, 3.5, -1.4, 3.8 + s * 0.15);
    ctx.lineTo(1.2, 2.9 + s * 0.2);
    ctx.moveTo(-1.4, 3.8 + s * 0.15);
    ctx.lineTo(1.2, 5 + s * 0.2);
  } else {
    ctx.moveTo(-7.4, 0.4);
    ctx.bezierCurveTo(-10, 1.5 + s, -12, 4 + s, -15.5, 4.6 + s * 1.5);
    ctx.moveTo(-7.4, 0.4);
    ctx.bezierCurveTo(-9.5, 2.5 + s, -10.5, 6 + s, -13.4, 7.6 + s * 1.2);
  }
  ctx.strokeStyle = WK.ink; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = WK.water; ctx.lineWidth = 1.3; ctx.stroke();
  wkRod(ctx, -5.6, 2, 1.45, WK.waterDeep, 1.2);
  if (wkFine) {
    wkLine(ctx, -4.3, -1.3, -3.3, 1.3, WK.iceMid, 0.7);
    wkLine(ctx, -2.1, -1.3, -1.1, 1.3, WK.iceMid, 0.7);
    wkLine(ctx, 0.1, -1.3, 1.1, 1.3, WK.iceMid, 0.7);
  }
  wkDisc(ctx, -6.7, 0, 1.85, WK.iceMid, 1.1);
}
function wkJian(ctx, t, planted) {
  wkJianHilt(ctx, t, planted);
  wkShape(ctx, WK_JIAN_RIME1, WK.ice, 0.9);
  wkShape(ctx, WK_JIAN_RIME2, WK.ice, 0.9);
  wkShape(ctx, planted ? WK_JIAN_PLANTED : WK_JIAN_BLADE, WK.ice, 1.3);
  wkLine(ctx, 5.8, 0, planted ? 34 : 39.5, 0, WK.iceMid, 1);
  wkLine(ctx, 15, -1, 21, -1, '#ffffff', 0.8);
  wkShape(ctx, WK_JIAN_GUARD, WK.iceMid, 1.2);
  if (!wkFine) return;
  // drifting frost motes
  const ga = ctx.globalAlpha;
  for (let i = 0; i < 3; i += 1) {
    const ph = (t * 0.6 + i * 0.37) % 1;
    wkAlpha(ctx, ga * Math.sin(ph * Math.PI) * 0.9);
    wkStar(ctx, 11 + i * 9 + ph * 4, (i % 2 ? -1 : 1) * (4.2 + ph * 4.5), 1.4, WK.iceMid);
  }
  wkAlpha(ctx, ga);
}

function wkStone(ctx, rot) {
  ctx.save();
  ctx.rotate(rot);
  wkOval(ctx, 0, 0, 7.4, 5.4, WK.stone, 1.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.2, 3.6, 0, 3.5, 4.6);
  wkPaint(ctx, null, WK.stoneLight, 1.2);
  wkLine(ctx, -5.1, 2.6, 5.3, -2.3, WK.quartz, 1.3);
  ctx.restore();
}

function wkMillFace(ctx, r, rot, light = WK_LIGHT) {
  wkDisc(ctx, 0, 0, r, WK.mill, 1.6);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, WK_TAU);
  wkPaint(ctx, null, WK.millDark, 0.9);
  for (let i = 0; i < 6; i += 1) {
    const a = rot + i * WK_TAU / 6, c = Math.cos(a), s = Math.sin(a);
    wkLine(ctx, c * r * 0.34, s * r * 0.34, c * r * 0.7 - s * r * 0.14, s * r * 0.7 + c * r * 0.14, WK.millDark, 1.1);
  }
  // highlight stays with the light, not with the spin
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, light - 0.55, light + 0.55);
  wkPaint(ctx, null, WK.millLight, 1.3);
  wkDisc(ctx, 0, 0, r * 0.2, WK.hole, 1.1);
  wkDisc(ctx, Math.cos(rot + 0.5) * r * 0.6, Math.sin(rot + 0.5) * r * 0.6, r * 0.12, WK.woodDark, 0.9);
}

function wkLantern(ctx, t, lit) {
  const ga = ctx.globalAlpha;
  if (lit) {
    wkAlpha(ctx, ga * (0.17 + Math.sin(t * 17) * 0.04));
    wkDisc(ctx, 0, -1, 13.5, WK.flame);
    wkAlpha(ctx, ga);
  }
  const s = Math.sin(t * 4) * 1.2;
  // bottom tassel (gold knot, red cords)
  wkLine(ctx, 0, 9.6, s * 0.7, 15.5, WK.ink, 3);
  wkLine(ctx, 0, 9.6, s * 0.7, 15.5, WK.lacquer, 1.4);
  wkDisc(ctx, 0, 11.2, 1.3, WK.gold, 0.8);
  // paper body with a lit core and bamboo ribs
  wkOval(ctx, 0, 0, 9.3, 7.9, WK.lantern, 1.5);
  wkOval(ctx, 0, 0.3, 5, 6.2, lit ? WK.flame : WK.lanternGlow);
  if (wkFine) {
    wkAlpha(ctx, ga * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.8, 7.9, 0, 0, WK_TAU);
    ctx.moveTo(0, -7.9);
    ctx.lineTo(0, 7.9);
    wkPaint(ctx, null, WK.ink, 0.8);
    wkAlpha(ctx, ga);
  }
  // ink thunder stroke
  ctx.beginPath();
  ctx.moveTo(-2.8, -3.8); ctx.lineTo(1.4, -1.2); ctx.lineTo(-1.6, 1.2); ctx.lineTo(2.9, 4);
  wkPaint(ctx, null, WK.ink, 1.3);
  // wooden caps
  ctx.beginPath(); ctx.rect(-5.4, -10.4, 10.8, 3); wkPaint(ctx, WK.woodDeep, WK.ink, 1);
  ctx.beginPath(); ctx.rect(-5.4, 7.4, 10.8, 3); wkPaint(ctx, WK.woodDeep, WK.ink, 1);
  // fuse
  ctx.beginPath();
  ctx.moveTo(0.5, -10.4);
  ctx.quadraticCurveTo(3.6, -12, 2.4, -15);
  wkPaint(ctx, null, WK.ink, 1.3);
  if (lit) {
    const f = 2.7 + Math.sin(t * 31) * 0.6 + Math.sin(t * 13) * 0.4;
    wkStar(ctx, 2.4, -15.4, f * 1.45, WK.fire);
    wkStar(ctx, 2.4, -15.4, f * 0.75, WK.flameHot);
  }
}

const WK_CRATE = [-14, -13, 14, -13, 14, 13, -14, 13];
function wkTalisman(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.rect(x, y, w, h); wkPaint(ctx, WK.talisman, WK.ink, 0.9);
  wkLine(ctx, x + 1.5, y + 2.6, x + w - 1.5, y + 2.6, WK.ink, 1);
  wkLine(ctx, x + w * 0.5, y + 4.2, x + w * 0.5, y + h * 0.5, WK.ink, 1);
  ctx.beginPath(); ctx.rect(x + 1.4, y + h * 0.62, w - 2.8, w - 2.8); wkPaint(ctx, WK.seal);
}
function wkRope(ctx, x0, y0, x1, y1) {
  ctx.lineCap = 'butt';
  wkLine(ctx, x0, y0, x1, y1, WK.ink, 4.6);
  wkLine(ctx, x0, y0, x1, y1, WK.straw, 2.8);
  ctx.lineCap = 'round';
}
function wkCrateFace(ctx) {
  wkShape(ctx, WK_CRATE, WK.wood, 2);
  wkLine(ctx, -12.5, -4.4, 12.5, -4.4, WK.woodDark, 1.1);
  wkLine(ctx, -12.5, 4.4, 12.5, 4.4, WK.woodDark, 1.1);
  wkLine(ctx, -12, -11.4, 12, -11.4, WK.woodLight, 1);
  wkRope(ctx, -6, -13, -6, 13);
  if (wkFine) for (let y = -9; y <= 9; y += 6) wkLine(ctx, -7.1, y + 1, -4.9, y - 1, WK.ink, 0.7);
  wkTalisman(ctx, 2.5, -10.5, 7, 17);
  wkDisc(ctx, -11.4, -10.4, 0.9, WK.ink);
  wkDisc(ctx, 11.4, 10.4, 0.9, WK.ink);
  wkDisc(ctx, -11.4, 10.4, 0.9, WK.ink);
}
const WK_CRATE_FRONT = [-17, -27, 11, -27, 11, 0, -17, 0];
const WK_CRATE_TOP = [-17, -27, -11, -33, 17, -33, 11, -27];
const WK_CRATE_SIDE = [11, -27, 17, -33, 17, -6, 11, 0];
function wkCratePickup(ctx) {
  wkShape(ctx, WK_CRATE_SIDE, WK.woodDark, 1.6);
  wkShape(ctx, WK_CRATE_TOP, WK.woodLight, 1.6);
  wkShape(ctx, WK_CRATE_FRONT, WK.wood, 2);
  wkLine(ctx, -15.5, -18, 9.5, -18, WK.woodDark, 1.1);
  wkLine(ctx, -15.5, -9, 9.5, -9, WK.woodDark, 1.1);
  wkLine(ctx, 11.8, -18.2, 16.2, -22.6, WK.woodDeep, 0.9);
  wkLine(ctx, 11.8, -9.2, 16.2, -13.6, WK.woodDeep, 0.9);
  wkLine(ctx, -12.6, -30, 13, -30, WK.wood, 0.9);
  wkRope(ctx, -7, -27, -7, 0);
  wkRope(ctx, -7, -27, -1, -33);
  if (wkFine) for (let y = -23; y <= -1; y += 5.5) wkLine(ctx, -8.1, y + 1, -5.9, y - 1, WK.ink, 0.7);
  wkTalisman(ctx, 1, -24, 7, 17.5);
  wkDisc(ctx, -14.6, -24.4, 0.9, WK.ink);
  wkDisc(ctx, 8.6, -2.6, 0.9, WK.ink);
  wkDisc(ctx, -14.6, -2.6, 0.9, WK.ink);
}

// Jade vambrace as an item: long and tapered, the elbow end cut at an angle (the outer side
// runs longer, ending in a point) with its hollow showing, gold rims, centre rib and stud,
// laced along the inner edge. Long axis +x (wrist end), centred on the origin.
const WK_STUD = [-0.5, -2.4, 1.6, -0.3, -0.5, 1.8, -2.6, -0.3];
function wkBracerItem(ctx) {
  ctx.beginPath();
  ctx.moveTo(-15.4, -5.6);
  ctx.quadraticCurveTo(-2, -5.8, 11.6, -3.1);
  ctx.quadraticCurveTo(13.6, 0, 11.6, 3.1);
  ctx.quadraticCurveTo(-1, 5, -10.6, 5.3);
  ctx.quadraticCurveTo(-14.6, 1, -15.4, -5.6);
  wkPaint(ctx, WK.jade, WK.ink, 1.4);
  ctx.beginPath();
  ctx.moveTo(-14.5, -4.5);
  ctx.quadraticCurveTo(-11.2, -0.2, -11.3, 4.5);
  ctx.quadraticCurveTo(-13.9, 0.8, -14.5, -4.5);
  wkPaint(ctx, WK.jadeHollow);
  ctx.beginPath();
  ctx.moveTo(-13.2, -5.4); ctx.quadraticCurveTo(-10.2, -0.6, -9.6, 4.9);
  ctx.moveTo(10.1, -3.2); ctx.quadraticCurveTo(11.9, 0, 10.1, 3.3);
  wkPaint(ctx, null, WK.gold, 1.5);
  ctx.beginPath(); ctx.moveTo(-8.2, -0.5); ctx.quadraticCurveTo(0, -0.9, 8.6, -0.2);
  wkPaint(ctx, null, WK.jadeDark, 1.1);
  wkShape(ctx, WK_STUD, WK.gold, 0.9);
  if (wkFine) {
    wkLine(ctx, -9, -3.7, 8, -2.3, WK.jadeLight, 0.9);
    for (let x = -6.5; x < 7; x += 3.4) {
      wkLine(ctx, x, 3, x + 1.6, 4.8, WK.ink, 0.8);
      wkLine(ctx, x + 1.6, 3, x, 4.8, WK.ink, 0.8);
    }
  }
  ctx.beginPath();
  ctx.moveTo(5.2, 4.2);
  ctx.bezierCurveTo(6.4, 8.2, 9.6, 9.4, 12.4, 8.2);
  ctx.moveTo(6.8, 4);
  ctx.bezierCurveTo(8.6, 6.6, 11.4, 6.8, 13.6, 5.4);
  wkPaint(ctx, null, WK.ink, 1.05);
}

// ---- motion cues ----
function wkSpinSmear(ctx, r, spin, both) {
  const ga = ctx.globalAlpha;
  wkAlpha(ctx, ga * 0.22);
  ctx.strokeStyle = WK.inkSoft;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r, spin - 1.15, spin - 0.18); ctx.stroke();
  if (both) { ctx.beginPath(); ctx.arc(0, 0, r, spin + Math.PI - 1.15, spin + Math.PI - 0.18); ctx.stroke(); }
  wkAlpha(ctx, ga);
}
function wkSpeedLines(ctx, x0, len, spread) {
  const ga = ctx.globalAlpha;
  wkAlpha(ctx, ga * 0.32);
  wkLine(ctx, x0 - len, -spread, x0, -spread, WK.inkSoft, 1.3);
  wkLine(ctx, x0 - len * 1.4, 0, x0 + 2, 0, WK.inkSoft, 1.3);
  wkLine(ctx, x0 - len * 0.8, spread, x0 - 2, spread, WK.inkSoft, 1.3);
  wkAlpha(ctx, ga);
}

// ---- public: pickups ----
export function drawWeaponPickupArt(ctx, kind, time = 0, seed = 0) {
  const A = WEAPON_ART[kind] || WEAPON_ART.staff;
  const bob = A.bob ? Math.sin(time * 3 + seed) * 3 : 0;
  wkLod(ctx);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(0, bob);
  const ga = ctx.globalAlpha;
  wkAlpha(ctx, ga * 0.18);
  wkDisc(ctx, A.glint[0], A.glint[1], A.glint[2], WK.glint);
  wkAlpha(ctx, ga);
  switch (kind) {
    case 'crate': wkCratePickup(ctx); break;
    case 'spear': ctx.translate(-6, -11); ctx.rotate(-0.5); wkSpear(ctx, time); break;
    case 'guandao': ctx.translate(-2, -15); ctx.rotate(-0.42); wkGuandao(ctx, time); break;
    case 'knives': ctx.translate(-8, -9); ctx.rotate(-0.5); wkKnivesOnGround(ctx); break;
    case 'stone': ctx.translate(0, -7); wkStone(ctx, -0.25); break;
    case 'millstone': {
      const cy = -13.2, r = 13;
      wkOval(ctx, 4.4, cy, r * 0.86, r, WK.millDark, 1.5);
      ctx.beginPath(); ctx.rect(0, cy - r, 4.4, r * 2); wkPaint(ctx, WK.millDark);
      wkLine(ctx, 0, cy - r, 4.4, cy - r, WK.ink, 1.5);
      wkLine(ctx, 0, cy + r, 4.4, cy + r, WK.ink, 1.5);
      ctx.save(); ctx.translate(0, cy); ctx.scale(0.86, 1); wkMillFace(ctx, r, 0.3); ctx.restore();
      break;
    }
    case 'lantern': ctx.translate(0, -13); wkLantern(ctx, time, false); break;
    case 'chakram': {
      ctx.translate(0, -17);
      const turn = 0.42 + 0.58 * Math.abs(Math.cos(time * 1.3 + seed));
      wkStreamer(ctx, -9.5 * turn, 1, 2.2, 9, time, WK.air);
      wkChakram(ctx, time, turn);
      break;
    }
    case 'jian':
      // Planted point-down: the Water guardian's relic, frost ring on the ground.
      wkAlpha(ctx, ga * 0.8);
      wkOval(ctx, 0, 1, 17, 4.6, null, 1.6, WK.iceMid);
      wkAlpha(ctx, ga);
      ctx.save(); ctx.translate(-1, 0); ctx.rotate(Math.PI / 2 - 0.1); ctx.translate(-34, 0); wkJian(ctx, time, true); ctx.restore();
      wkShape(ctx, WK_JIAN_ICE_A, WK.ice, 1.1);
      wkShape(ctx, WK_JIAN_ICE_B, WK.iceMid, 1.1);
      wkShape(ctx, WK_JIAN_ICE_C, WK.ice, 1.1);
      break;
    case 'bracer': ctx.translate(0, -12); ctx.rotate(-0.42); wkBracerItem(ctx); break;
    default: ctx.translate(-1, -13); ctx.rotate(-0.55); wkStaff(ctx); break;
  }
  ctx.restore();
  // periodic twinkle on the item's bright edge (none when time is frozen at 0)
  const ph = (time * 0.55 + seed * 0.013) % 1;
  if (time > 0 && ph < 0.16) {
    ctx.save();
    ctx.translate(0, bob);
    wkStar(ctx, A.spark[0], A.spark[1], 0.8 + Math.sin(ph / 0.16 * Math.PI) * A.spark[2], WK.paper, 0.8);
    ctx.restore();
  }
  return bob;
}
const WK_JIAN_ICE_A = [-8, 1.5, -5.6, -6.5, -3.2, 1.5];
const WK_JIAN_ICE_B = [-3.2, 2.2, -1, -3.6, 1.8, 2.2];
const WK_JIAN_ICE_C = [1.5, 1.8, 4.6, -8.2, 7.4, 1.8];

// ---- public: held ----
export function drawHeldWeaponArt(ctx, kind, start, end, t = 0) {
  if (kind === 'bracer') return;
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 52;
  const k = len / 52, ux = dx / len, uy = dy / len;
  const fy = start[1] + dy * WK_GRIP;
  // 0 at shoulder height or below, 1 once the fist is overhead (throw wind-up: y -64)
  const up = wkClamp01((-fy - 48) / 10);
  wkLod(ctx);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(start[0] + dx * WK_GRIP, start[1] + dy * WK_GRIP);
  ctx.scale(k, k);
  if (kind === 'crate') { ctx.translate(2, -2); wkCrateFace(ctx); }
  else if (kind === 'millstone') {
    // carried on the fist; overhead it rides up the arm so the head stays clear
    ctx.translate(2 + ux * 7 * up, -9 + uy * 7 * up);
    wkDisc(ctx, -3, 0, 12.4, WK.millDark, 1.5);
    wkMillFace(ctx, 12.4, 0.4);
  } else if (kind === 'stone') {
    ctx.translate(1.5 + ux * 5 * up, -0.5 + uy * 5 * up);
    wkStone(ctx, -0.3);
    // quartz glint pulses while carried, so the small throwable reads in a crowd
    const ph = (t * 0.9) % 1;
    if (ph < 0.3) wkStar(ctx, 2.2, -2.2, 0.6 + Math.sin(ph / 0.3 * Math.PI) * 2.6, WK.paper, 0.8);
  } else if (kind === 'lantern') {
    // Hangs on its cord; overhead it is whirled out along the arm (top cap to the fist) so it
    // trails above and behind the head instead of dropping over the face.
    const sway = Math.sin(t * 3.1) * 1.6 * (1 - up);
    let ang = Math.PI / 2 - sway * 0.06;
    if (up > 0) {
      let d = Math.atan2(uy, ux) - ang;
      if (d > Math.PI) d -= WK_TAU;
      if (d < -Math.PI) d += WK_TAU;
      ang += d * up;
    }
    const c = Math.cos(ang), s = Math.sin(ang), cord = 7.5 - up;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(c * cord * 0.5 - s * sway * 0.4, s * cord * 0.5 + c * sway * 0.4, c * cord, s * cord);
    wkPaint(ctx, null, WK.ink, 1.3);
    ctx.translate(c * (cord + 10.1), s * (cord + 10.1));
    ctx.rotate(ang - Math.PI / 2);
    wkLantern(ctx, t, true);
  } else {
    ctx.rotate(Math.atan2(dy, dx));
    switch (kind) {
      case 'spear': wkSpear(ctx, t); break;
      case 'guandao': wkGuandao(ctx, t); break;
      case 'knives': wkKnifePair(ctx); break;
      case 'chakram':
        wkStreamer(ctx, -1, 2, 2.3, 8, t, WK.air);
        ctx.translate(9.8, 0);
        wkChakram(ctx, t, 1);
        break;
      case 'jian': wkJian(ctx, t, false); break;
      default: wkStaff(ctx); break;
    }
  }
  ctx.restore();
}

// ---- public: worn armour (after drawFighterBody, same transform) ----
// Forearm half-widths at the elbow and wrist plus the fist radius, per element; these mirror
// BUILDS in src/fighter-art.js (arm[1], arm[2], hand) so the cuff hugs the drawn forearm.
const WK_FOREARM = { air: [1.7, 1.45, 3.0], water: [2.2, 1.8, 2.9], earth: [3.7, 3.1, 4.9], fire: [2.35, 2.0, 3.7] };
export function drawWornArmorArt(ctx, kind, elbow, hand, t = 0, flash = false, element = 'air', k = 1) {
  if (kind !== 'bracer') return;
  const B = WK_FOREARM[element] || WK_FOREARM.air;
  const dx = hand[0] - elbow[0], dy = hand[1] - elbow[1];
  const L = Math.sqrt(dx * dx + dy * dy) || 1;
  // Same convention as fighter-art's own hand wraps: a band only a little wider than the
  // forearm, ending under the fist, with a pointed (chevron) elbow end instead of a second
  // rim, so the forearm itself reads as armoured rather than the fist holding a canister.
  const x0 = L * 0.22, x1 = Math.max(x0 + 5, L - B[2] * k * 0.7);
  const w0 = B[0] * k + 0.6, w1 = B[1] * k + 0.85;
  wkLod(ctx);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(elbow[0], elbow[1]);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(x0, -w0);
  ctx.lineTo(x1, -w1);
  ctx.quadraticCurveTo(x1 + 0.8, 0, x1, w1);
  ctx.lineTo(x0, w0);
  ctx.lineTo(x0 - 2.6, 0);
  ctx.closePath();
  wkPaint(ctx, flash ? WK.paper : WK.jade, WK.ink, 1.1);
  ctx.beginPath();
  ctx.moveTo(x0 + 1, -w0 + 0.4); ctx.lineTo(x0 - 1, 0); ctx.lineTo(x0 + 1, w0 - 0.4);
  wkPaint(ctx, null, WK.gold, 1.2);
  wkLine(ctx, x1 - 0.8, -w1 + 0.5, x1 - 0.8, w1 - 0.5, WK.gold, 1.3);
  if (wkFine) wkLine(ctx, x0 + 2.2, -w0 * 0.42, x1 - 2, -w1 * 0.42, WK.jadeLight, 0.9);
  const mx = x0 + (x1 - x0) * 0.5, sz = Math.min(1.6, w1 * 0.62);
  ctx.beginPath(); ctx.moveTo(mx, -sz); ctx.lineTo(mx + sz, 0); ctx.lineTo(mx, sz); ctx.lineTo(mx - sz, 0); ctx.closePath();
  wkPaint(ctx, WK.gold, WK.ink, 0.8);
  // shimmer travelling along the cuff
  const ph = (t * 0.8) % 1;
  if (t > 0 && ph < 0.3) wkStar(ctx, x0 + (x1 - x0) * (ph / 0.3), -w0 * 0.45, 1.6, WK.paper);
  ctx.restore();
}

// ---- public: in flight ----
export function drawThrownWeaponArt(ctx, kind, spin = 0, t = 0, vx = 1, vy = 0) {
  // Aim along the velocity; leftward flight is the mirror image, never the upside-down one.
  const dir = vx < 0 ? -1 : 1;
  const a = Math.atan2(vy, vx * dir);
  wkLod(ctx);
  ctx.save();
  if (dir < 0) ctx.scale(-1, 1);
  if (a) ctx.rotate(a);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ga = ctx.globalAlpha;
  switch (kind) {
    case 'spear': wkSpeedLines(ctx, -38, 16, 4); ctx.translate(-11, 0); wkSpear(ctx, t * 2.2); break;
    case 'jian':
      wkAlpha(ctx, ga * 0.55);
      wkLine(ctx, -62, 0, -26, 0, WK.ice, 4);
      for (let i = 0; i < 3; i += 1) {
        wkAlpha(ctx, ga * (0.75 - i * 0.22));
        wkStar(ctx, -36 - i * 9, (i % 2 ? -3 : 3), 2.2 - i * 0.4, WK.iceMid);
      }
      wkAlpha(ctx, ga);
      ctx.translate(-18, 0);
      wkJian(ctx, t, false);
      break;
    case 'guandao': wkSpinSmear(ctx, 41, spin, true); ctx.rotate(spin); ctx.translate(-4, 0); wkGuandao(ctx, t); break;
    case 'knives':
      wkSpinSmear(ctx, 27, spin, true);
      ctx.rotate(spin);
      for (let i = 0; i < 2; i += 1) {
        ctx.save(); ctx.rotate(i * Math.PI); ctx.translate(5.5, 0); wkKnife(ctx, WK.steel); ctx.restore();
      }
      break;
    case 'chakram':
      wkAlpha(ctx, ga * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 13, spin - 2.2, spin - 0.2); wkPaint(ctx, null, WK.air, 3.2);
      ctx.beginPath(); ctx.arc(0, 0, 13, spin + Math.PI - 2.2, spin + Math.PI - 0.2); wkPaint(ctx, null, WK.air, 3.2);
      wkAlpha(ctx, ga);
      ctx.rotate(spin);
      wkChakram(ctx, t, 1);
      break;
    case 'stone': wkSpeedLines(ctx, -9, 10, 2.8); ctx.rotate(spin); wkStone(ctx, 0); break;
    case 'millstone': {
      // world-fixed highlight: undo the mirror and the aim for the light direction
      const light = Math.atan2(Math.sin(WK_LIGHT), Math.cos(WK_LIGHT) * dir) - a;
      wkSpinSmear(ctx, 14.5, spin, true);
      wkMillFace(ctx, 12.4, spin, light);
      break;
    }
    case 'lantern':
      for (let i = 0; i < 3; i += 1) {
        wkAlpha(ctx, ga * (0.85 - i * 0.25));
        wkStar(ctx, -14 - i * 7, -4 + Math.sin(t * 23 + i * 2) * 2.5, 2.4 - i * 0.5, i ? WK.fire : WK.flame);
      }
      wkAlpha(ctx, ga);
      ctx.rotate(spin);
      wkLantern(ctx, t, true);
      break;
    case 'bracer': ctx.rotate(spin); wkBracerItem(ctx); break;
    case 'crate': wkSpinSmear(ctx, 20, spin, true); ctx.rotate(spin); wkCrateFace(ctx); break;
    default: wkSpinSmear(ctx, 28, spin, true); ctx.rotate(spin); ctx.translate(-3, 0); wkStaff(ctx); break;
  }
  ctx.restore();
}

// ---- public: broken weapons ----
// Chakram ring arcs: [centre angle, half span, tab angle (NaN: none), centring dx, dy]. The
// arc is cut from the ring around the ring centre, then shifted so its bounding box centre
// sits on the origin.
const WK_CK_SHARDS = [
  [-1.25, 0.72, -Math.PI / 4, -2.82, 7.29],
  [0.95, 0.68, Math.PI / 4, -5.38, -6.66],
  [Math.PI, 0.7, NaN, 8, 0],
];
export const WEAPON_SHARDS = {
  staff: [[-14, 0], [17, 0], [2, -2], [7, 2]],
  spear: [[27, 0], [-13, 0], [10, 0], [3, 2]],
  guandao: [[30, 1], [-16, 0], [-31, 0], [16, -3]],
  crate: [[0, -8], [2, 7], [-10, 0], [6, -2]],
  knives: [[19, 0], [0, 1], [11, 1], [-3, 5]],
  stone: [[-2, -1], [3, 1], [0, 2]],
  millstone: [[-5, -5], [5, -5], [5, 5], [-5, 5]],
  lantern: [[0, -9], [-4, 0], [4, 1], [0, 9]],
  chakram: [[2.8, -7.3], [5.4, 6.7], [-8, 0], [-13, 2]],
  jian: [[33, 0], [20, 0], [10, 2], [-2, 0]],
  bracer: [[-3, -2], [4, 2], [0, -6], [2, 5]],
};
function wkChunk(ctx, x0, x1, r, fill, grain) {
  ctx.beginPath();
  ctx.moveTo(x0, -r);
  ctx.lineTo(x1 - 1, -r); ctx.lineTo(x1 + 1.4, -r * 0.3); ctx.lineTo(x1 - 0.6, r * 0.2); ctx.lineTo(x1 + 0.9, r);
  ctx.lineTo(x0 + 0.8, r); ctx.lineTo(x0 - 1.2, r * 0.4); ctx.lineTo(x0 + 0.6, -r * 0.1); ctx.lineTo(x0 - 0.9, -r * 0.6);
  ctx.closePath();
  wkPaint(ctx, fill, WK.ink, 1.3);
  wkLine(ctx, x0 + 1.6, -r * 0.42, x1 - 1.6, -r * 0.42, grain, 0.9);
}
function wkCap(ctx, x, r, fill) {
  wkLine(ctx, x, 0, x + 2.4, 0, WK.ink, r * 2 + 2.6);
  wkLine(ctx, x, 0, x + 2.4, 0, fill, r * 2);
}
const WK_SPLINTER = [-5, -0.9, 5, -1.6, 3.4, 0.4, -4, 1.2];
const WK_SPLINTER_S = [-3, -0.7, 3, -1.1, 2, 0.9];
const WK_PLANK_L = [-14, -3.2, 12, -3.2, 14, -1, 12.2, 0.6, 14.4, 3.2, -14, 3.2];
const WK_PLANK_S = [-9, -3, 7.5, -3, 9.5, -0.5, 7.8, 1.2, 9, 3, -9, 3];
const WK_CORNER = [-6, -6, 6, -6, 6, -2.5, -2.5, -2.5, -2.5, 6, -6, 6];
const WK_SCRAP = [-3.5, -6, 3.5, -6.5, 4, 4, 1, 6, -1.5, 4.5, -3.8, 6];
const WK_TIP = [-6, -2.1, 1.5, -2.1, 7, -1.3, 4.5, 1.9, -1.5, 3.9, -4.5, 2.4, -3, 0.8, -6, 0.2];
const WK_STUB = [3.4, -2.1, 8.5, -2.1, 7.2, 0, 9, 1.6, 6.5, 4.1, 3.4, 3.2];
const WK_SLIVER = [-3.5, -1.8, 3, -2.4, 4, 1.6, -2, 3.2];
const WK_CHIP_A = [-3.8, -2.6, 1.8, -3.4, 4.2, 0.2, 1.4, 3, -3.4, 2.2];
const WK_CHIP_B = [-2.6, -2, 2.8, -1.6, 2.4, 2.2, -1.8, 2.6];
const WK_CHIP_C = [-1.8, -1.4, 2, -1, 0.8, 1.8];
const WK_MILL_CUTS = [-2.95, -1.35, 0.25, 1.75, 3.33];
const WK_PAPER_A = [-5, -4, 0, -5.6, 5, -3.5, 3.5, 1, 5, 4.5, -1, 3.5, -4.5, 5, -3, 0];
const WK_PAPER_B = [-3, -2.5, 3, -3, 2.2, 1, 3.4, 3, -2.4, 2.6];
const WK_ICE_TIP = [-6, -1.9, 4, -1.6, 9, 0, 4, 1.6, -6, 1.9, -4.5, 0.3];
const WK_ICE_MID = [-7, -2, 6, -1.9, 4.5, -0.2, 7, 1.9, -6.5, 2, -5, 0.5];
const WK_ICE_CHIP = [-2.5, -2.5, 2.8, -1, 0.4, 2.8];
const WK_ICE_STUB = [4.7, -2.1, 9, -2, 7.6, 0, 9.6, 2, 4.7, 2.1];
const WK_JADE_A = [-6, -4, 3, -5, 5, -1, 2, 0.5, 4, 4, -5, 4.6];
const WK_JADE_B = [-3, -3, 3.2, -2.2, 2, 1.4, 3, 3, -2.6, 3.2];
const WK_JADE_C = [-1.8, -1.6, 2, -1.2, 1, 1.8, -1.4, 1.2];
export function drawWeaponShardArt(ctx, kind, index) {
  wkFine = true; // debris is drawn small and moving: keep the cheap fixed detail set
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'staff': case 'spear': case 'guandao': {
      const r = kind === 'guandao' ? 2.15 : kind === 'spear' ? 1.7 : 1.9;
      const fill = kind === 'guandao' ? WK.woodDark : kind === 'staff' ? WK.wax : WK.wood;
      const grain = kind === 'guandao' ? WK.woodGrain : kind === 'staff' ? WK.waxSheen : WK.woodLight;
      if (index === 0 && kind === 'spear') { ctx.translate(-34.2, 0); wkChunk(ctx, 22, 27, r, fill, grain); wkSpearHead(ctx); }
      else if (index === 0 && kind === 'guandao') { ctx.translate(-29.2, -1.3); wkChunk(ctx, 13, 19, r, fill, grain); wkGuandaoHead(ctx); }
      else if (index === 0 || index === 1) {
        const half = index === 0 ? 12 : 9;
        if (index === 1) ctx.scale(-1, 1);
        if (kind === 'guandao' && index === 1) { wkChunk(ctx, -14, 14, r, fill, grain); break; }
        wkChunk(ctx, -half, half, r, fill, grain);
        wkCap(ctx, -half - 1, r, WK.brass);
        if (kind === 'staff') {
          if (index === 0) { ctx.lineCap = 'butt'; wkLine(ctx, 4, 0, half - 1.5, 0, WK.ink, 7.4); wkLine(ctx, 4.6, 0, half - 2, 0, WK.wrap, 4.8); ctx.lineCap = 'round'; }
          wkTick(ctx, -half + 2, r + 0.4, 0.9);
        }
      } else if (index === 2 && kind === 'guandao') {
        ctx.translate(3, 0);
        wkChunk(ctx, -6, 5, r, fill, grain);
        wkLine(ctx, -6, 0, -3.6, 0, WK.brass, r * 2);
        wkTick(ctx, -3.2, r + 0.5);
        wkShape(ctx, WK_GD_SPIKE_SHARD, WK.steel, 1.3);
      } else if (index === 3 && kind === 'guandao') { wkTassel(ctx, 5, 0, 0.8); }
      else wkShape(ctx, index === 2 ? WK_SPLINTER : WK_SPLINTER_S, index === 2 ? fill : WK.woodLight, 1);
      break;
    }
    case 'crate':
      if (index === 0) { wkShape(ctx, WK_PLANK_L, WK.wood, 1.4); wkLine(ctx, -12, -1.4, 10, -1.4, WK.woodLight, 0.9); wkDisc(ctx, -11.2, 0.6, 0.9, WK.ink); }
      else if (index === 1) { wkShape(ctx, WK_PLANK_S, WK.wood, 1.4); wkRope(ctx, -3, -3, -3, 3); wkLine(ctx, -7.5, -1.3, 6, -1.3, WK.woodLight, 0.9); }
      else if (index === 2) { wkShape(ctx, WK_CORNER, WK.woodDark, 1.4); wkDisc(ctx, -4.2, -4.2, 0.9, WK.ink); }
      else {
        wkShape(ctx, WK_SCRAP, WK.talisman, 0.9);
        wkLine(ctx, -2, -4, 2, -4.3, WK.ink, 1);
        ctx.beginPath(); ctx.rect(-1.8, 0, 3.6, 3.4); wkPaint(ctx, WK.seal);
      }
      break;
    case 'knives':
      if (index === 0) { wkShape(ctx, WK_TIP, WK.steel, 1.3); wkLine(ctx, -2.5, 2.6, 2.5, 2.2, WK.steelEdge, 0.9); }
      else if (index === 1) { ctx.translate(-0.6, -1.6); wkKnifeHilt(ctx, true); wkShape(ctx, WK_STUB, WK.steel, 1.3); }
      else if (index === 2) wkShape(ctx, WK_SLIVER, WK.steelDark, 1.2);
      else {
        ctx.translate(0, -2.6);
        ctx.beginPath(); ctx.arc(0, 0, 4.2, 0.3, 2.5);
        ctx.strokeStyle = WK.ink; ctx.lineWidth = 3.1; ctx.stroke();
        ctx.strokeStyle = WK.brass; ctx.lineWidth = 1.4; ctx.stroke();
      }
      break;
    case 'stone':
      if (index === 0) { wkShape(ctx, WK_CHIP_A, WK.stone, 1.3); wkLine(ctx, -2.6, 1.4, 2.8, -1.4, WK.quartz, 1); }
      else wkShape(ctx, index === 1 ? WK_CHIP_B : WK_CHIP_C, index === 1 ? WK.stoneDark : WK.stoneLight, 1.2);
      break;
    case 'millstone': {
      const a0 = WK_MILL_CUTS[index], a1 = WK_MILL_CUTS[index + 1], r = 12.4, mid = (a0 + a1) / 2;
      ctx.translate(-Math.cos(mid) * r * 0.55, -Math.sin(mid) * r * 0.55);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * 2.5, Math.sin(a0) * 2.5);
      ctx.lineTo(Math.cos(a0 + 0.14) * 6.4, Math.sin(a0 + 0.14) * 6.4);
      ctx.lineTo(Math.cos(a0 - 0.05) * 9.2, Math.sin(a0 - 0.05) * 9.2);
      ctx.arc(0, 0, r, a0, a1);
      ctx.lineTo(Math.cos(a1 - 0.1) * 8.2, Math.sin(a1 - 0.1) * 8.2);
      ctx.lineTo(Math.cos(a1 + 0.07) * 5, Math.sin(a1 + 0.07) * 5);
      ctx.arc(0, 0, 2.5, a1, a0, true);
      ctx.closePath();
      wkPaint(ctx, WK.mill, WK.ink, 1.4);
      const c = Math.cos(mid), s = Math.sin(mid);
      wkLine(ctx, c * r * 0.38, s * r * 0.38, c * r * 0.72 - s * r * 0.12, s * r * 0.72 + c * r * 0.12, WK.millDark, 1.1);
      break;
    }
    case 'lantern':
      if (index === 0 || index === 3) {
        ctx.translate(0, index === 0 ? 1.7 : -2.5);
        ctx.beginPath(); ctx.rect(-5.4, -1.5, 10.8, 3); wkPaint(ctx, WK.woodDeep, WK.ink, 1);
        if (index === 0) { ctx.beginPath(); ctx.moveTo(0.5, -1.5); ctx.quadraticCurveTo(3, -3, 2, -5); wkPaint(ctx, null, WK.ink, 1.2); }
        else { wkLine(ctx, 0, 1.5, 0.8, 6.5, WK.ink, 3); wkLine(ctx, 0, 1.5, 0.8, 6.5, WK.lacquer, 1.4); wkDisc(ctx, 0.2, 2.8, 1.2, WK.gold, 0.8); }
      } else if (index === 1) {
        wkShape(ctx, WK_PAPER_A, WK.lantern, 1.1);
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-1, 3.5); ctx.lineTo(3.5, 1); ctx.lineTo(5, 4.5);
        wkPaint(ctx, null, WK.lanternBurnt, 1.2);
        wkLine(ctx, 0, -5, 0.5, 3, WK.ink, 0.7);
      } else wkShape(ctx, WK_PAPER_B, WK.lanternGlow, 1);
      break;
    case 'chakram': {
      if (index === 3) { wkStreamer(ctx, -4.5, 0, 0.15, 9, 0, WK.air); break; }
      const [c0, h, tab, tx, ty] = WK_CK_SHARDS[index];
      ctx.translate(tx, ty);
      if (tab === tab) { ctx.save(); ctx.rotate(tab); wkShape(ctx, WK_CK_TAB, WK.steel, 1.1); ctx.restore(); }
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, 0, 8.6, c0 - h, c0 + h);
      ctx.strokeStyle = WK.ink; ctx.lineWidth = 6.6; ctx.stroke();
      ctx.strokeStyle = WK.steel; ctx.lineWidth = 3.8; ctx.stroke();
      if (index === 2) wkChakramWrap(ctx, c0);
      else { ctx.beginPath(); ctx.arc(0, 0, 9.6, c0 - h + 0.25, c0 + h - 0.25); ctx.strokeStyle = WK.steelEdge; ctx.lineWidth = 0.9; ctx.stroke(); }
      break;
    }
    case 'jian':
      if (index === 0) { ctx.translate(-1.5, 0); wkShape(ctx, WK_ICE_TIP, WK.ice, 1.2); wkLine(ctx, -4.5, 0, 6, 0, WK.iceMid, 1); }
      else if (index === 1) { wkShape(ctx, WK_ICE_MID, WK.ice, 1.2); wkLine(ctx, -5, 0, 4.5, 0, WK.iceMid, 1); }
      else if (index === 2) wkShape(ctx, WK_ICE_CHIP, WK.iceMid, 1);
      else { ctx.translate(3, -0.9); wkJianHilt(ctx, 0); wkShape(ctx, WK_ICE_STUB, WK.ice, 1.2); wkShape(ctx, WK_JIAN_GUARD, WK.iceMid, 1.2); }
      break;
    case 'bracer':
      if (index === 0) { wkShape(ctx, WK_JADE_A, WK.jade, 1.3); wkLine(ctx, -4.6, -3.2, -3.8, 3.6, WK.gold, 1.4); wkLine(ctx, -2, -2.8, 2, -3.4, WK.jadeLight, 1); }
      else if (index === 1) wkShape(ctx, WK_JADE_B, WK.jade, 1.2);
      else if (index === 2) {
        ctx.beginPath(); ctx.arc(0, 5, 6, -2.4, -0.7);
        ctx.strokeStyle = WK.ink; ctx.lineWidth = 2.9; ctx.stroke();
        ctx.strokeStyle = WK.gold; ctx.lineWidth = 1.5; ctx.stroke();
      } else wkShape(ctx, WK_JADE_C, WK.jadeLight, 1);
      break;
    default: break;
  }
  ctx.restore();
}
const WK_GD_SPIKE_SHARD = [-12, 0, -6, -2.8, -6, 2.8];

// ---- public: effects ----
export function drawWeaponBreakPuff(ctx, p, color = WK.paper) {
  const q = 1 - p;
  ctx.save();
  ctx.lineCap = 'round';
  const ga = ctx.globalAlpha;
  wkAlpha(ctx, ga * q);
  ctx.beginPath();
  ctx.arc(0, 0, 6 + p * 18, 0, WK_TAU);
  wkPaint(ctx, null, color, 3.4 * q + 0.6);
  for (let i = 0; i < 6; i += 1) {
    const a = i * WK_TAU / 6 + 0.35, c = Math.cos(a), s = Math.sin(a);
    const r0 = 5 + p * 13, r1 = r0 + 6 * q + 1.5;
    wkLine(ctx, c * r0, s * r0, c * r1, s * r1, WK.ink, 2 * q + 0.6);
  }
  ctx.restore();
}

// Thunder lantern burst. Brushwork, not a comic starburst: a lumpy ink-edged fireball that
// throws up five uneven flame tongues whose tips bend upward and curl (fire rises), a spray
// of lantern paper and bamboo ribs on gravity arcs, an ink-wash smoke cloud that rolls in
// early, and a faint broken wash ripple that marks the 70 px hit radius.
// tongues: [angle, length, width, lean]  (upper fan; lean = extra sideways curl)
const WK_TONGUES = [-1.32, 1, 1, 0.12, -2.2, 0.64, 0.92, 0, -0.62, 0.84, 0.86, 0, -2.92, 0.4, 0.8, 0.08, 0.06, 0.48, 0.76, -0.1];
// fireball rim: 9 lumps of uneven size
const WK_LUMPS = [1, 0.84, 1.08, 0.9, 1.02, 0.8, 0.96, 1.1, 0.86];
// smoke puffs: [x, y, r]
const WK_SMOKE = [-11, -14, 9, 9, -18, 8, -1, -26, 10, 17, -8, 6, -18, -5, 6];
// scraps: [angle, speed, spin, kind 0 paper / 1 talisman / 2 rib]
const WK_SCRAPS = [-2.1, 76, 9, 0, -0.9, 84, -7, 2, -0.2, 64, 6, 0, 0.7, 52, -8, 1, 2.5, 58, 7, 0, -2.9, 70, -6, 2, -1.45, 90, 5, 1, 1.9, 44, 9, 0];
const WK_SCRAP_PAPER = [-2.6, -1.8, 2.2, -2.4, 2.8, 1.4, -1.8, 2.1];
function wkTongue(ctx, L, w, c, fill, lw) {
  // a curved flame along +x: bulb at the root (half-width w), centreline bending to the side
  // as c * s^2, tapering to a sharp tip at (L, c)
  const x1 = L * 0.3, y1 = c * 0.09, h1 = w * 0.98;
  const x2 = L * 0.6, y2 = c * 0.36, h2 = w * 0.59;
  const x3 = L * 0.85, y3 = c * 0.72, h3 = w * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, -w);
  ctx.quadraticCurveTo(x1, y1 - h1, (x1 + x2) * 0.5, (y1 + y2 - h1 - h2) * 0.5);
  ctx.quadraticCurveTo(x2, y2 - h2, (x2 + x3) * 0.5, (y2 + y3 - h2 - h3) * 0.5);
  ctx.quadraticCurveTo(x3, y3 - h3, L, c);
  // the tip hooks back toward the bend, a brush curl
  const g = c < 0 ? -1 : 1;
  ctx.quadraticCurveTo(L * 1.03, c + g * w * 0.55, L * 0.84, c + g * w * 0.62);
  ctx.quadraticCurveTo(x3 + L * 0.02, y3 + h3 + g * w * 0.1, (x2 + x3) * 0.5, (y2 + y3 + h2 + h3) * 0.5);
  ctx.quadraticCurveTo(x2, y2 + h2, (x1 + x2) * 0.5, (y1 + y2 + h1 + h2) * 0.5);
  ctx.quadraticCurveTo(x1, y1 + h1, 0, w);
  ctx.closePath();
  wkPaint(ctx, fill, WK.ink, lw);
}
function wkFireball(ctx, R, wob, fill, lw) {
  // lumpy disc: quadratic bulges between rim points
  const n = WK_LUMPS.length, st = WK_TAU / n;
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = i * st + wob, r = R * WK_LUMPS[i % n];
    const x = Math.cos(a) * r * 0.86, y = Math.sin(a) * r * 0.86;
    if (i === 0) { ctx.moveTo(x, y); continue; }
    const m = a - st * 0.5, rb = R * 1.12 * (WK_LUMPS[i % n] + WK_LUMPS[i - 1]) * 0.5;
    ctx.quadraticCurveTo(Math.cos(m) * rb, Math.sin(m) * rb, x, y);
  }
  ctx.closePath();
  wkPaint(ctx, fill, WK.ink, lw);
}
export function drawLanternBurst(ctx, p) {
  const q = 1 - p;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ga = ctx.globalAlpha;
  // ink-wash smoke rolls in from p 0.1, rising and spreading; one path = one even wash
  if (p > 0.1) {
    const s = (p - 0.1) / 0.9;
    wkAlpha(ctx, ga * 0.36 * Math.min(1, s * 3) * (1 - s * s));
    ctx.beginPath();
    for (let i = 0; i < WK_SMOKE.length; i += 3) {
      const x = WK_SMOKE[i] * (1 + s * 0.6), y = WK_SMOKE[i + 1] * (1 + s * 0.3) - s * 24, r = WK_SMOKE[i + 2] * (0.6 + s);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, WK_TAU);
    }
    ctx.fillStyle = WK.smoke;
    ctx.fill();
  }
  // broken ink-wash ripple out to the hit radius
  wkAlpha(ctx, ga * 0.28 * q);
  ctx.strokeStyle = WK.inkSoft;
  ctx.lineWidth = 0.8 + 2 * q;
  const rr = 20 + p * 50, rot = 0.3 + p * 0.35;
  for (let j = 0; j < 3; j += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, rot + j * 2.09, rot + j * 2.09 + 1.45 - j * 0.2);
    ctx.stroke();
  }
  // flash
  if (p < 0.14) {
    wkAlpha(ctx, ga * (1 - p / 0.14) * 0.9);
    wkDisc(ctx, 0, 0, 9 + p * 90, WK.flameHot);
  }
  const grow = Math.min(1, p / 0.16);
  const fade = p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) / 0.4);
  if (fade > 0) {
    wkAlpha(ctx, ga * fade);
    const lift = p * 18;
    const R = (7 + 11 * grow) * (1 - p * 0.55);
    ctx.save();
    ctx.translate(0, -lift);
    // flame tongues out of the upper rim, tips bending up and curling as they burn out
    for (let i = 0; i < WK_TONGUES.length; i += 4) {
      const a = WK_TONGUES[i], kl = WK_TONGUES[i + 1], kw = WK_TONGUES[i + 2], lean = WK_TONGUES[i + 3];
      const L = (8 + 21 * grow) * kl * (1 - p * 0.2) + R * 0.45;
      const w = (7.2 + 1.6 * q) * kw * (1 - p * 0.4);
      const c = (-Math.cos(a) * (0.26 + p * 0.3) + lean) * L;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(R * 0.55, 0);
      wkTongue(ctx, L, w, c, i % 8 ? WK.lantern : WK.fire, 1.3);
      wkTongue(ctx, L * 0.62, w * 0.5, c * 0.4, WK.flame, 0);
      ctx.restore();
    }
    // the fireball itself over the tongue roots, a hot heart inside
    wkFireball(ctx, R, p * 0.8, WK.fire, 1.4);
    wkFireball(ctx, R * 0.66, 0.4 - p * 0.6, WK.flame, 0);
    wkDisc(ctx, R * 0.08, -R * 0.12, R * 0.34, WK.flameHot);
    ctx.restore();
  }
  // spray of lantern paper, talisman scraps and bamboo ribs on gravity arcs
  wkAlpha(ctx, ga * Math.min(1, q * 2.4));
  for (let i = 0; i < WK_SCRAPS.length; i += 4) {
    const a = WK_SCRAPS[i], sp = WK_SCRAPS[i + 1], kind = WK_SCRAPS[i + 3];
    const d = sp * p * (1.25 - p * 0.45);
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.85 + 70 * p * p);
    ctx.rotate(WK_SCRAPS[i + 2] * p + a);
    if (kind === 2) {
      ctx.beginPath(); ctx.moveTo(-3.6, 0.6); ctx.quadraticCurveTo(0, -1.4, 3.6, 0.4);
      ctx.strokeStyle = WK.ink; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = WK.straw; ctx.lineWidth = 1.2; ctx.stroke();
    } else {
      wkShape(ctx, WK_SCRAP_PAPER, kind ? WK.talisman : WK.lantern, 0.85);
    }
    ctx.restore();
  }
  // a few embers rising off the top
  if (p > 0.08 && p < 0.85) {
    wkAlpha(ctx, ga * (1 - p));
    for (let i = 0; i < 3; i += 1) {
      const e = p - 0.08;
      wkStar(ctx, (i - 1) * 13 + Math.sin(p * 9 + i) * 3, -24 - e * (46 + i * 14), 2 - i * 0.4, i ? WK.fire : WK.flame);
    }
  }
  ctx.restore();
}
