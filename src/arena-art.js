// Fourfold arena pack: Bamboo grove, Dusk rampart, Lantern market and Tidewater keep (ink-on-
// paper stages drawn in code). Ported unchanged from the approved arenas preview
// (output/asset-previews/arenas-assets.js, its ASSETS block). No imports, no DOM, no text
// outside the title card. The renderer wires it in (src/renderer.js):
//   - background(key) draws drawArenaPackBackground once into its cached canvas (1280x720 at the
//     device pixel ratio, like the approved preview glue);
//   - draw() calls drawArenaPackScenery right after blitting that cache and BEFORE the shake
//     translate, so banners, lanterns, chains, sprays, drips and smoke stay on their anchors;
//   - drawAmbient() calls drawArenaPackAmbient (free air particles) inside the shake;
//   - the stage card hangs under the wave-1 banner (state.stageCard: no guardian on the field)
//     via drawArenaPackTitleCard.
// src/data.js merges ARENA_PACK into ARENAS; each entry's `element` is the arena's element for
// the engine's element uses (arenaElement in src/data.js). Playfield geometry is identical to
// the original arenas (Renderer.drawCourtyard and physics bounds).

// === ASSETS START ===
// Fourfold arena pack: four original 1280x720 stages in the ink-on-paper style.
//
//   ARENA_PACK[key]           ARENAS-shaped entry: { name, subtitle, element, sky, ink, accent }
//   ARENA_PACK_PALETTES[key]  PALETTES-shaped superset: sky, horizon, far, mid, near, stone, side,
//                             accent (+ floor, edge and per-stage extras)
//   drawArenaPackBackground(ctx, key)  static layers + walkable floor. Draw ONCE into a cached
//                             1280x720 canvas (exactly like Renderer.background()).
//   drawArenaPackScenery(ctx, key, t)  per-frame moving parts that are ATTACHED to the static
//                             background (banners on poles, lanterns on strings, chains on rings,
//                             leaf sprays on stalks, drips from stalactites, smoke from the beacon,
//                             far birds and sky lanterns). Call it right after the cached background
//                             is blitted and BEFORE the screen-shake translate, so it never drifts
//                             off its anchors when the arena shakes.
//   drawArenaPackAmbient(ctx, key, t)  per-frame free-floating air particles (falling leaves,
//                             wind streaks, dust, motes). Call it where Renderer.drawAmbient runs:
//                             inside the shake transform, before ground shadows.
//   drawArenaPackTitleCard(ctx, key, alpha, top, subtitleOnly)  stage name strip that hangs just
//                             under the engine's banner plaque (banner is y 70-117; card 126-160).
//   Both per-frame passes take t = state.time (0 for reduced motion) and are allocation-free,
//   with no gradients and no shadowBlur.
//
// Playfield geometry is identical to Renderer.drawCourtyard: back ledge 348-370 (rim line at
// y=350, ticks every 78px from x=50), floor plane 365-681 with row lines at 386/413/448/492/548/
// 614/681 and joints converging on x=640, front edge 681-720, depth inset 30..1250 x 395..650
// with diamond corners, floor emblem ellipse at (640, 518), edge posts inside x=20/1260 +-22,
// y 200-355. Nothing is drawn in front of the fighters.
const AP_W = 1280;
const AP_H = 720;
const AP_ROWS = [386, 413, 448, 492, 548, 614, 681];

export const ARENA_PACK = {
  bamboo: { name: 'Bamboo grove', subtitle: 'Where the wind bends', element: 'air', sky: '#e1eadf', ink: '#425c52', accent: '#6fa08f' },
  rampart: { name: 'Dusk rampart', subtitle: 'Along the endless wall', element: 'earth', sky: '#efe0d2', ink: '#5f5546', accent: '#a98d5f' },
  market: { name: 'Lantern market', subtitle: 'After the last bell', element: 'fire', sky: '#e9dccb', ink: '#5e4b44', accent: '#c47b5d' },
  keep: { name: 'Tidewater keep', subtitle: 'Behind the sea gate', element: 'water', sky: '#dfe8ea', ink: '#43606d', accent: '#6f9db1' },
};

export const ARENA_PACK_PALETTES = {
  bamboo: {
    // Stalks and leaves are warm, pale yellow-greens so air-team teal (#388e8b) keeps >= 2.3:1 on them.
    sky: '#e2eadc', horizon: '#f5f1dd', far: '#d9e2d2', mid: '#c7d3b5', near: '#d0d6ae', stone: '#e2dcc0',
    side: '#aab79c', accent: '#5b9381', floor: '#f3f0dd', edge: '#4f6b5e',
    haze: '#e8ede0', wall: '#eef0e3', farLeaf: '#d3ddca', midLeaf: '#bccca8', nearLeaf: '#c4cd9e', nearNode: '#b3bd8e', fence: '#cfd3ab', fenceShade: '#adb58e', moss: '#c3d0b0',
  },
  rampart: {
    sky: '#e4d0c6', horizon: '#f8e4c4', far: '#e3cfc0', mid: '#d6bdab', near: '#c4a790', stone: '#e3d1b0',
    side: '#ae9a7e', accent: '#8f7348', floor: '#f4eadb', edge: '#5e5444',
    sun: '#f8d6a0', wall: '#ecdfc5', wallShade: '#d4c09f', slit: '#bea58a', farWall: '#d1b9a9', banner: '#b98a53', bannerHi: '#ecd5a6', wood: '#977f63',
  },
  market: {
    // A dusk wash, not a night sky: the darkest value stays well above INK. Lanterns are mostly
    // paper and ochre; the few red ones are a grey maroon that cannot pass for fire VFX.
    sky: '#a3a7ba', dusk: '#c3bcc2', horizon: '#f2ddbd', far: '#b2aebb', mid: '#cdbcb2', near: '#a5918a', stone: '#e5cdaa',
    side: '#b39479', accent: '#b5684d', floor: '#f5e5c7', edge: '#5f4b41',
    roof: '#a39aa1', farRoof: '#a3a0b0', window: '#f2d7a2', stall: '#f6e4c0', counter: '#c79e7f', awnA: '#d49b7d', awnB: '#e5cba7',
    wood: '#8e7464', lantern: '#8c5d55', ochreLantern: '#d8b47a', paperLantern: '#f2dcb0', lanternCap: '#6d5148', glow: '#fbe4b2', string: '#7f7174',
  },
  keep: {
    sky: '#d3dfe2', horizon: '#eef3ed', far: '#c3d4d9', mid: '#b4c6cb', near: '#9ab2ba', stone: '#e3e6df',
    side: '#9db2b7', accent: '#548ca0', floor: '#eff1e8', edge: '#4b6470',
    // Sea rock is a warm algae grey-green (not blue-white), so the cave reads wet, not frozen.
    rock: '#c2c9bd', rockShade: '#b1baa7', rockLip: '#a7b39a', masonry: '#d8dfd9', joint: '#bdc9c6', open: '#f3f1e3', sea: '#b9d5dc', seaDeep: '#a8c7d1',
    cell: '#b9cace', iron: '#869ea6', weed: '#9db4a3', channel: '#bcd6dc',
  },
};

// --- tiny helpers (allocation only in the one-off static pass) ---
function apNoise(i) {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function apPoly(ctx, pts, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function apLine(ctx, pts, color, width = 2) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
function apCircle(ctx, x, y, r, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function apRect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}
// Lanceolate leaf added to the current path (no transform, no allocation).
function apLeaf(ctx, x, y, len, wid, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const mx = x + c * len * 0.42, my = y + s * len * 0.42;
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx - s * wid, my + c * wid, x + c * len, y + s * len);
  ctx.quadraticCurveTo(mx + s * wid, my - c * wid, x, y);
}
// x of a floor joint line (top at y=365, bottom X at y=710) at height y: same family as drawCourtyard.
function apJointX(X, y) {
  const top = AP_W / 2 + (X - AP_W / 2) * 0.36;
  return top + (X - top) * ((y - 365) / 345);
}
// Curved roof eave with upturned tips, centred on cx.
function apEave(ctx, cx, y, half, depth, lift, fill) {
  ctx.beginPath();
  ctx.moveTo(cx - half - 6, y - lift);
  ctx.quadraticCurveTo(cx - half * 0.72, y + 1, cx - half * 0.4, y + 1);
  ctx.lineTo(cx + half * 0.4, y + 1);
  ctx.quadraticCurveTo(cx + half * 0.72, y + 1, cx + half + 6, y - lift);
  ctx.quadraticCurveTo(cx + half * 0.5, y - depth * 0.35, cx + half * 0.34, y - depth);
  ctx.lineTo(cx - half * 0.34, y - depth);
  ctx.quadraticCurveTo(cx - half * 0.5, y - depth * 0.35, cx - half - 6, y - lift);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  // ridge with small upturned ends
  ctx.fillRect(cx - half * 0.34 - 3, y - depth - 2, half * 0.68 + 6, 2.5);
}
function apSky(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, 370);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, AP_W, 372);
}

// ---------------------------------------------------------------- shared playfield
function apFloor(ctx, key, p) {
  // Back ledge: same rects, rim line and tick rhythm as drawCourtyard.
  apRect(ctx, 0, 351, AP_W, 19, p.side);
  apRect(ctx, 0, 348, AP_W, 7, p.stone);
  apLine(ctx, [[0, 350], [AP_W, 350]], p.accent, 2);
  for (let x = 50; x < AP_W; x += 78) apLine(ctx, [[x, 355], [x, 367]], p.accent, 1);

  const floor = ctx.createLinearGradient(0, 365, 0, 710);
  floor.addColorStop(0, p.floor);
  floor.addColorStop(1, p.stone);
  ctx.fillStyle = floor;
  ctx.fillRect(0, 365, AP_W, 355);

  // Front edge: same bands and rule lines.
  apRect(ctx, 0, 681, AP_W, 39, p.side);
  apRect(ctx, 0, 681, AP_W, 9, p.stone);
  apLine(ctx, [[0, 682], [AP_W, 682]], p.edge, 2);
  apLine(ctx, [[0, 692], [AP_W, 692]], '#ffffff45', 2);
  apFrontDetail(ctx, key, p);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 366, AP_W, 315);
  ctx.clip();
  apFloorPattern(ctx, key, p);
  ctx.restore();

  // Depth inset, identical placement to the original arenas.
  ctx.save();
  ctx.globalAlpha = 0.27;
  apLine(ctx, [[30, 395], [1250, 395]], p.accent, 2);
  apLine(ctx, [[30, 650], [1250, 650]], p.accent, 2);
  apLine(ctx, [[30, 395], [30, 650]], p.accent, 2);
  apLine(ctx, [[1250, 395], [1250, 650]], p.accent, 2);
  for (const x of [30, 1250]) for (const y of [395, 650]) apPoly(ctx, [[x, y - 5], [x + 8, y], [x, y + 5], [x - 8, y]], p.accent);
  ctx.translate(640, 518);
  ctx.scale(1, 0.44);
  apCircle(ctx, 0, 0, 116, null, p.accent, 2);
  apCircle(ctx, 0, 0, 106, null, p.accent, 1);
  apEmblem(ctx, key, p.accent, 47);
  ctx.restore();
}

function apFloorPattern(ctx, key, p) {
  ctx.globalAlpha = 0.22;
  for (const y of AP_ROWS) {
    apLine(ctx, [[0, y], [AP_W, y]], p.accent, 1.2);
    apLine(ctx, [[0, y + 2], [AP_W, y + 2]], '#fffced', 1);
  }
  if (key === 'bamboo' || key === 'rampart') {
    // Staggered paving: joints follow the original perspective family, offset every other row.
    const step = key === 'rampart' ? 116 : 155;
    let top = 365;
    for (let r = 0; r < AP_ROWS.length; r += 1) {
      const bottom = AP_ROWS[r];
      const offset = r % 2 ? step / 2 : 0;
      for (let X = -900 + offset; X <= 2200; X += step) {
        apLine(ctx, [[apJointX(X, top + 2), top + 2], [apJointX(X, bottom), bottom]], p.accent, 1.1);
      }
      top = bottom;
    }
  } else {
    for (let x = -900; x <= 2200; x += 155) {
      const top = AP_W / 2 + (x - AP_W / 2) * 0.36;
      apLine(ctx, [[top, 365], [x, 710]], p.accent, 1.1);
    }
  }
  ctx.globalAlpha = 1;
  if (key === 'bamboo') {
    // Moss in the joints and a few settled leaves, kept on the margins of the inset.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = p.moss;
    for (let i = 0; i < 70; i += 1) {
      const r = Math.floor(apNoise(i + 400) * AP_ROWS.length);
      const y = AP_ROWS[r] + 1;
      const x = apNoise(i + 470) * AP_W;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + apNoise(i + 520) * 9, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const side = i % 2;
      const x = side ? 1100 + apNoise(i + 600) * 170 : 10 + apNoise(i + 600) * 170;
      const y = 372 + apNoise(i + 640) * 300;
      apLeaf(ctx, x, y, 9, 2.2, apNoise(i + 680) * 6.28);
    }
    ctx.fillStyle = p.midLeaf;
    ctx.fill();
  } else if (key === 'rampart') {
    // Worn centre of the wall walk and grit at the parapet feet.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = p.wallShade;
    for (let i = 0; i < 26; i += 1) {
      const y = AP_ROWS[i % AP_ROWS.length] - 4 - apNoise(i + 30) * 12;
      ctx.fillRect(apNoise(i + 40) * AP_W, y, 3 + apNoise(i + 50) * 22, 1.5);
    }
  } else if (key === 'market') {
    // Lantern light pooled along the back of the street (very soft, outside the inset).
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = p.glow;
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.ellipse(70 + i * 142, 378, 62, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.2;
    apLine(ctx, [[0, 668], [AP_W, 668]], p.side, 3);
  } else if (key === 'keep') {
    // Wet sheen: thin bright streaks along the back flags and fine cracks (no blobs that
    // could read as ground shadows or hazards).
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 9; i += 1) {
      const x = 40 + apNoise(i + 90) * 1180, y = 420 + apNoise(i + 120) * 230;
      apLine(ctx, [[x, y], [x + 8, y + 5], [x + 6, y + 13], [x + 13, y + 19]], p.near, 1);
    }
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 12; i += 1) {
      const x = 60 + apNoise(i + 210) * 1160;
      apLine(ctx, [[x, 373 + (i % 3) * 3], [x + 14 + apNoise(i) * 20, 373 + (i % 3) * 3]], '#ffffff', 1.5);
    }
  }
  ctx.globalAlpha = 1;
}

// Front-edge detail stays clear of the drawEdgeDetails labels (arena name bottom-left, motto
// bottom-right, y 680-705), so it only runs between x=AP_LABEL_L and x=AP_LABEL_R.
const AP_LABEL_L = 156;
const AP_LABEL_R = 1124;
function apFrontDetail(ctx, key, p) {
  ctx.save();
  if (key === 'rampart') {
    // Coursed brick on the near parapet coping.
    ctx.globalAlpha = 0.3;
    apLine(ctx, [[AP_LABEL_L, 705], [AP_LABEL_R, 705]], p.edge, 1);
    for (let x = AP_LABEL_L; x <= AP_LABEL_R; x += 52) {
      apLine(ctx, [[x, 693], [x, 704]], p.edge, 1);
      if (x + 26 < AP_LABEL_R) apLine(ctx, [[x + 26, 706], [x + 26, 719]], p.edge, 1);
    }
  } else if (key === 'market') {
    // Street gutter with drain slots.
    ctx.globalAlpha = 0.28;
    for (let x = 178; x + 26 <= AP_LABEL_R; x += 96) apLine(ctx, [[x, 709], [x + 26, 709]], p.edge, 2);
  } else if (key === 'keep') {
    // Quay coping with iron mooring studs.
    ctx.globalAlpha = 0.35;
    for (let x = 200; x < AP_LABEL_R; x += 220) apCircle(ctx, x, 706, 2.5, null, p.edge, 1.2);
  } else {
    ctx.globalAlpha = 0.25;
    for (let x = 196; x + 40 <= AP_LABEL_R; x += 156) apLine(ctx, [[x, 700], [x + 40, 700]], p.edge, 1);
  }
  ctx.restore();
}

// Floor emblems: each stage has its own motif in the original ring.
function apEmblem(ctx, key, color, r) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  if (key === 'bamboo') {
    // A bamboo sprig: one stalk segment with two nodes and a pair of leaves off the upper node.
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(-r * 0.06, r * 0.85);
    ctx.lineTo(r * 0.06, -r * 0.85);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.32); ctx.lineTo(r * 0.16, r * 0.32);
    ctx.moveTo(-r * 0.16, -r * 0.28); ctx.lineTo(r * 0.2, -r * 0.28);
    ctx.stroke();
    ctx.beginPath();
    apLeaf(ctx, r * 0.06, -r * 0.3, r * 0.92, r * 0.17, 0.42);
    apLeaf(ctx, r * 0.02, -r * 0.26, r * 0.8, r * 0.15, Math.PI - 0.62);
    ctx.fill();
  } else if (key === 'rampart') {
    // Eight-point compass of the watchtowers.
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4;
      const len = i % 2 ? r * 0.55 : r;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + 0.3) * r * 0.2, Math.sin(a + 0.3) * r * 0.2);
      ctx.lineTo(Math.cos(a - 0.3) * r * 0.2, Math.sin(a - 0.3) * r * 0.2);
      ctx.closePath();
      ctx.stroke();
    }
    apCircle(ctx, 0, 0, r * 0.18, null, color, 1.2);
  } else if (key === 'market') {
    // Old cash coin: ring with a square hole and four marks.
    apCircle(ctx, 0, 0, r, null, color, 1.2);
    ctx.strokeRect(-r * 0.24, -r * 0.24, r * 0.48, r * 0.48);
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
      ctx.stroke();
    }
  } else {
    // Tide mark: a spiral eye with a wave rolling out of it on each side (no grate or hole).
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 4.2; a += 0.2) {
      const rr = r * 0.04 + a * r * 0.026;
      if (a === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let s = -1; s <= 1; s += 2) {
      ctx.moveTo(s * r * 0.4, 0);
      ctx.bezierCurveTo(s * r * 0.55, -r * 0.28, s * r * 0.72, r * 0.22, s * r * 0.86, -r * 0.08);
      ctx.moveTo(s * r * 0.34, r * 0.3);
      ctx.bezierCurveTo(s * r * 0.5, r * 0.08, s * r * 0.62, r * 0.5, s * r * 0.78, r * 0.3);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Bamboo grove
function apStalk(ctx, x, base, top, lean, w, color, node, seed) {
  const cx = x + lean * 0.15, cy = (base + top) / 2, ex = x + lean;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(cx, cy, ex, top);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'butt';
  ctx.stroke();
  const len = base - top;
  const gap = 34 + w * 4;
  ctx.fillStyle = node;
  for (let d = gap * (0.3 + apNoise(seed) * 0.7); d < len; d += gap) {
    const s = d / len;
    const px = (1 - s) * (1 - s) * x + 2 * (1 - s) * s * cx + s * s * ex;
    const py = base - d;
    ctx.fillRect(px - w * 0.62, py - 0.8, w * 1.24, 1.6);
  }
}
// Leaf spray: a short twig off the stalk with a hand of slender leaves hanging down-wind.
// Leaf angles run from down-right to straight down (0.5..1.7 rad), so sprays droop like real
// bamboo instead of pointing sideways.
function apSpray(ctx, x, y, count, len, seed, sway = 0) {
  const tx = x + len * 0.36, ty = y - len * 0.2;
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.lineTo(tx, ty + 1.1);
  ctx.lineTo(x, y + 1.1);
  const spread = count > 1 ? 1.15 / (count - 1) : 0;
  for (let k = 0; k < count; k += 1) {
    const a = 0.52 + k * spread + (apNoise(seed + k) - 0.5) * 0.34 + sway * (1 + k * 0.25);
    const along = k % 2 ? 0.5 : 1;
    apLeaf(ctx, x + (tx - x) * along, y + (ty - y) * along, len * (0.6 + apNoise(seed + k + 9) * 0.55), len * 0.105, a);
  }
}

// The grove stands on both sides; the centre is an open misty clearing behind the jump arc
// (no stalks in x 300-980 between y 110 and the wall), so airborne fighters read on plain mist.
function apGroveX(side, i, n) {
  return side ? 986 + i * (300 / n) + apNoise(i + 17) * 14 : -14 + i * (300 / n) + apNoise(i + 3) * 14;
}

function bambooBackdrop(ctx, p) {
  apSky(ctx, [[0, p.sky], [0.72, p.horizon], [1, p.haze]]);
  apCircle(ctx, 858, 112, 46, '#f8f2da');
  apCircle(ctx, 858, 112, 56, null, '#f9f4e180', 1);

  // Misty far ridge with a second, paler range behind it filling the clearing.
  ctx.fillStyle = '#e4ebdf';
  ctx.beginPath();
  ctx.moveTo(-20, 360);
  ctx.lineTo(-20, 210);
  ctx.bezierCurveTo(200, 176, 330, 206, 470, 188);
  ctx.bezierCurveTo(640, 166, 760, 204, 900, 186);
  ctx.bezierCurveTo(1060, 168, 1180, 196, 1300, 186);
  ctx.lineTo(1300, 360);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dbe4d6';
  ctx.beginPath();
  ctx.moveTo(-20, 360);
  ctx.lineTo(-20, 236);
  ctx.bezierCurveTo(140, 196, 250, 232, 380, 220);
  ctx.bezierCurveTo(520, 206, 610, 250, 760, 230);
  ctx.bezierCurveTo(900, 212, 1010, 246, 1140, 222);
  ctx.bezierCurveTo(1220, 210, 1260, 220, 1300, 226);
  ctx.lineTo(1300, 360);
  ctx.closePath();
  ctx.fill();

  // Far stalks: 11 a side, pale, leaning with the wind; the ones nearest the clearing fade into the mist.
  const n = 11;
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = apGroveX(side, i, n);
      const inner = side ? i < 3 : i > n - 4;
      const w = 2.2 + apNoise(i + 50 + side * 20) * 1.8;
      apStalk(ctx, x, 352, -20, 8 + apNoise(i + 70 + side * 20) * 20, w, inner ? '#e1e8db' : p.far, p.haze, i + 3 + side * 30);
    }
  }
  ctx.beginPath();
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = apGroveX(side, i, n);
      const lean = 8 + apNoise(i + 70 + side * 20) * 20;
      const inner = side ? i < 3 : i > n - 4;
      const sprays = i % 3 === 0 ? 2 : 1;
      for (let k = 0; k < sprays; k += 1) {
        const y = 14 + apNoise(i * 3 + k + 200 + side * 40) * (inner ? 90 : 200);
        const s = (352 - y) / 372;
        apSpray(ctx, x + lean * s * s, y, 3 + (k + i) % 2, 16 + apNoise(i + k + 260) * 6, i * 7 + k + side * 50);
      }
    }
  }
  ctx.fillStyle = p.farLeaf;
  ctx.fill();

  // Mist veil pushes the far grove back.
  ctx.globalAlpha = 0.5;
  apRect(ctx, 0, 150, AP_W, 210, p.haze);
  ctx.globalAlpha = 0.35;
  apRect(ctx, 0, 262, AP_W, 98, p.horizon);
  ctx.globalAlpha = 1;

  // Garden wall with a moon gate, centred behind the arena.
  const wl = 432, wr = 848;
  ctx.fillStyle = p.wall;
  ctx.beginPath();
  ctx.rect(wl, 244, wr - wl, 108);
  ctx.moveTo(640 + 48, 300);
  ctx.arc(640, 300, 48, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  // Through the gate: paler mist and two far stalks.
  ctx.save();
  ctx.beginPath();
  ctx.arc(640, 300, 48, 0, Math.PI * 2);
  ctx.clip();
  apRect(ctx, 590, 250, 100, 100, '#f2f2e4');
  apStalk(ctx, 620, 352, 250, 6, 2.2, p.far, '#f2f2e4', 11);
  apStalk(ctx, 664, 352, 250, 9, 3, p.far, '#f2f2e4', 12);
  apRect(ctx, 590, 336, 100, 16, '#e3e9da');
  ctx.restore();
  apCircle(ctx, 640, 300, 48, null, p.mid, 2);
  apCircle(ctx, 640, 300, 53, null, '#dfe4d2', 3);
  // Tile coping and wall posts.
  apPoly(ctx, [[wl - 10, 246], [wl - 2, 236], [wr + 2, 236], [wr + 10, 246]], '#bccab0');
  apLine(ctx, [[wl - 2, 236], [wr + 2, 236]], '#a7b79c', 2);
  for (let x = wl + 8; x < wr; x += 13) apLine(ctx, [[x, 238], [x, 245]], '#a7b79c', 1);
  // Leak windows (lattice) either side of the gate.
  for (const x of [520, 760]) {
    ctx.fillStyle = '#f2f2e4';
    ctx.fillRect(x - 17, 268, 34, 30);
    ctx.strokeStyle = p.mid;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 17, 268, 34, 30);
    ctx.beginPath();
    ctx.moveTo(x - 17, 283); ctx.lineTo(x, 268); ctx.lineTo(x + 17, 283); ctx.lineTo(x, 298); ctx.closePath();
    ctx.moveTo(x, 268); ctx.lineTo(x, 298);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  apRect(ctx, wl, 340, wr - wl, 12, '#e3e6d4');
  for (const x of [wl, wr]) {
    apRect(ctx, x - 7, 240, 14, 112, '#e6e9d9');
    apRect(ctx, x - 9, 232, 18, 8, '#bccab0');
  }

  // Mid stalks: three a side, a step warmer. The inner ones only carry sprays high up, where
  // they arch over the clearing as a light canopy.
  for (let i = 0; i < AP_MID_STALKS.length; i += 1) {
    const x = AP_MID_STALKS[i];
    apStalk(ctx, x, 352, -20, 10 + apNoise(i + 310) * 22, 5 + apNoise(i + 300) * 3, p.mid, '#dde4cf', i + 40);
  }
  ctx.beginPath();
  for (let i = 0; i < AP_MID_STALKS.length; i += 1) {
    const x = AP_MID_STALKS[i];
    const lean = 10 + apNoise(i + 310) * 22;
    const inner = x > 200 && x < 1080;
    for (let k = 0; k < 3; k += 1) {
      const y = inner ? 6 + k * 34 + apNoise(i * 5 + k + 330) * 24 : 16 + k * 74 + apNoise(i * 5 + k + 330) * 50;
      const s = (352 - y) / 372;
      apSpray(ctx, x + lean * s * s, y, 4 + (k % 2), 23 + apNoise(i + k + 350) * 6, i * 11 + k + 90);
    }
  }
  ctx.fillStyle = p.midLeaf;
  ctx.fill();

  // Near stalks hug the frame edges; their leaf sprays sway in the scenery pass.
  for (const [x, w, lean] of AP_NEAR_STALKS) {
    apStalk(ctx, x, 352, -20, lean, w, p.near, p.nearNode, x);
    apLine(ctx, [[x - w * 0.22, 350], [x - w * 0.22 + lean, -20]], '#e2e6c8', 1.5);
  }

  // Mossy bank at the foot of the fence.
  ctx.fillStyle = p.moss;
  ctx.beginPath();
  ctx.moveTo(0, 352);
  for (let x = 0; x <= AP_W; x += 40) ctx.lineTo(x, 340 + apNoise(x * 0.1 + 7) * 7);
  ctx.lineTo(AP_W, 352);
  ctx.closePath();
  ctx.fill();

  // Lashed bamboo railing on the back ledge (posts on the ledge tick rhythm).
  for (let x = 50; x < AP_W; x += 78) {
    apRect(ctx, x - 3, 318, 6, 32, p.fence);
    apRect(ctx, x + 1.5, 318, 1.5, 32, p.fenceShade);
    apRect(ctx, x - 3.5, 316, 7, 3, p.fenceShade);
  }
  for (const y of [326, 338]) {
    apRect(ctx, 0, y, AP_W, 4, p.fence);
    apRect(ctx, 0, y + 3, AP_W, 1, p.fenceShade);
  }
  ctx.fillStyle = '#939f7e';
  for (let x = 50; x < AP_W; x += 78) {
    ctx.fillRect(x - 4, 327, 8, 2);
    ctx.fillRect(x - 4, 339, 8, 2);
  }
}
const AP_MID_STALKS = [140, 184, 232, 1052, 1098, 1142];
const AP_NEAR_STALKS = [[66, 12, 8], [108, 9, 12], [1172, 11, 10], [1214, 13, 6]];

function bambooPost(ctx, x, p) {
  // Cut bamboo pole with a hanging tablet.
  apRect(ctx, x - 8, 214, 16, 128, '#c3cca4');
  apRect(ctx, x - 6, 214, 3, 128, '#dfe3c4');
  apRect(ctx, x + 4, 214, 4, 128, '#a9b48e');
  apPoly(ctx, [[x - 8, 216], [x + 8, 206], [x + 8, 212], [x - 8, 222]], '#e8e8cc', p.edge, 1);
  for (const y of [244, 290, 326]) {
    apRect(ctx, x - 9, y, 18, 2.5, '#97a57e');
    apRect(ctx, x - 8, y + 2.5, 16, 1, '#e6e8cc');
  }
  apLine(ctx, [[x - 9, 236], [x + 9, 233]], '#8d7a55', 2.5);
  apLine(ctx, [[x - 3, 236], [x - 1, 252]], '#8d7a55', 1);
  apLine(ctx, [[x + 3, 235], [x + 1, 252]], '#8d7a55', 1);
  apRect(ctx, x - 11, 252, 22, 31, '#f1e7c3');
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 11, 252, 22, 31);
  ctx.save();
  ctx.translate(x, 267);
  apEmblem(ctx, 'bamboo', p.accent, 9);
  ctx.restore();
  apRect(ctx, x - 17, 340, 34, 9, p.accent);
  apRect(ctx, x - 20, 349, 40, 6, p.accent);
}

// ---------------------------------------------------------------- Dusk rampart
// Ridge heights sampled once; the far wall rides along them.
function apRidge(seedBase, y0, amp, step) {
  const pts = [];
  for (let x = -40; x <= AP_W + 40; x += step) {
    const n = apNoise(seedBase + x * 0.013);
    const roll = Math.sin(x * 0.006 + seedBase) * 0.5 + 0.5;
    pts.push([x, y0 - amp * (0.35 * n + 0.65 * roll)]);
  }
  return pts;
}
function apWallOnRidge(ctx, pts, color, width, merlonGap, towerEvery, towerW, towerH, roof) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1] - width / 2);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1] - width / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    for (let x = x0; x < x1; x += merlonGap) {
      const y = y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
      ctx.fillRect(x, y - width - width * 0.7, merlonGap * 0.5, width * 0.7);
    }
    if (i % towerEvery === towerEvery - 1) {
      ctx.fillRect(x1 - towerW / 2, y1 - towerH, towerW, towerH);
      if (roof) apPoly(ctx, [[x1 - towerW * 0.75, y1 - towerH], [x1, y1 - towerH - towerW * 0.45], [x1 + towerW * 0.75, y1 - towerH]], color);
    }
  }
}

const AP_RIDGE_A = apRidge(3, 262, 52, 64);
const AP_RIDGE_B = apRidge(9, 318, 58, 80);

function rampartBackdrop(ctx, p) {
  apSky(ctx, [[0, p.sky], [0.5, '#f0dcc9'], [0.8, p.horizon], [1, p.far]]);
  // Long dusk cloud bars.
  for (const [x, y, w, h] of [[60, 92, 330, 7], [420, 128, 210, 5], [700, 66, 380, 8], [980, 176, 300, 6], [180, 196, 240, 4]]) {
    ctx.fillStyle = '#e0c3b8';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 3, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8ebdc';
    ctx.beginPath();
    ctx.ellipse(x + w / 2 - 8, y, w / 2 - 6, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Low sun sinking behind the far ridge.
  apCircle(ctx, 910, 236, 66, p.sun);
  apCircle(ctx, 910, 236, 79, null, '#f9e2bd90', 1.5);

  // Palest distant range.
  ctx.fillStyle = '#ead8cb';
  ctx.beginPath();
  ctx.moveTo(-20, 300);
  for (let x = -20; x <= AP_W + 20; x += 90) ctx.lineTo(x, 214 + Math.sin(x * 0.011 + 1.3) * 18 + apNoise(x + 5) * 16);
  ctx.lineTo(AP_W + 20, 300);
  ctx.closePath();
  ctx.fill();
  // Far ridge A with the endless wall riding its crest.
  apPoly(ctx, [...AP_RIDGE_A, [AP_W + 40, 360], [-40, 360]], p.far);
  apWallOnRidge(ctx, AP_RIDGE_A, '#d6c0b0', 2.5, 8, 3, 7, 10, false);
  // Ridge B, closer, with roofed towers and a beacon tower.
  apPoly(ctx, [...AP_RIDGE_B, [AP_W + 40, 360], [-40, 360]], p.mid);
  apWallOnRidge(ctx, AP_RIDGE_B, p.farWall, 4, 12, 3, 13, 15, true);
  const beacon = AP_RIDGE_B[5];
  apRect(ctx, beacon[0] - 9, beacon[1] - 30, 18, 30, p.farWall);
  for (let k = 0; k < 3; k += 1) apRect(ctx, beacon[0] - 9 + k * 7, beacon[1] - 34, 4, 4, p.farWall);

  // Our watchtower straddles the walkway on the right.
  const tx = 1112;
  apRect(ctx, tx - 58, 200, 116, 150, '#e2cfb2');
  apRect(ctx, tx + 34, 200, 24, 150, p.wallShade);
  for (let x = tx - 58; x < tx + 58; x += 20) apRect(ctx, x, 188, 12, 13, '#e2cfb2');
  apRect(ctx, tx - 60, 199, 120, 3, p.wallShade);
  apRect(ctx, tx - 34, 168, 68, 20, '#ead9bd');
  apRect(ctx, tx - 38, 166, 5, 22, p.near);
  apRect(ctx, tx + 33, 166, 5, 22, p.near);
  apRect(ctx, tx - 3, 166, 6, 22, p.near);
  apEave(ctx, tx, 168, 48, 22, 7, p.near);
  ctx.fillStyle = p.slit;
  for (const x of [tx - 30, tx + 18]) ctx.fillRect(x, 226, 6, 16);
  ctx.beginPath();
  ctx.moveTo(tx - 15, 350);
  ctx.lineTo(tx - 15, 292);
  ctx.arc(tx, 292, 15, Math.PI, 0);
  ctx.lineTo(tx + 15, 350);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  for (let y = 214; y < 340; y += 14) apLine(ctx, [[tx - 56, y], [tx + 32, y]], p.wallShade, 1);
  ctx.globalAlpha = 1;

  // Back parapet with merlons and arrow slits (behind the ledge, so feet never reach it).
  apRect(ctx, 0, 324, AP_W, 26, p.wall);
  for (let x = 4; x < AP_W; x += 64) {
    apRect(ctx, x, 306, 40, 19, p.wall);
    apRect(ctx, x, 304, 40, 3, p.wallShade);
    apRect(ctx, x + 18, 311, 4, 9, p.slit);
  }
  apRect(ctx, 0, 323, AP_W, 2, p.wallShade);
  ctx.globalAlpha = 0.4;
  apLine(ctx, [[0, 337], [AP_W, 337]], p.wallShade, 1);
  for (let x = 20; x < AP_W; x += 46) {
    apLine(ctx, [[x, 326], [x, 336]], p.wallShade, 1);
    apLine(ctx, [[x + 23, 338], [x + 23, 347]], p.wallShade, 1);
  }
  ctx.globalAlpha = 1;
}

function rampartPost(ctx, x, p) {
  // Banner pole on a stone footing; the banner cloth flutters in the ambient pass.
  apRect(ctx, x - 16, 328, 32, 13, '#dccaa8');
  apRect(ctx, x - 3, 200, 6, 130, p.wood);
  apRect(ctx, x - 2, 200, 1.5, 130, '#b7a17f');
  apPoly(ctx, [[x - 4, 201], [x, 186], [x + 4, 201]], '#7d6a52');
  const dir = x < AP_W / 2 ? 1 : -1;
  apLine(ctx, [[x, 213], [x + dir * 22, 213]], p.wood, 3);
  apCircle(ctx, x + dir * 22, 213, 2, '#7d6a52');
  apRect(ctx, x - 17, 340, 34, 9, p.accent);
  apRect(ctx, x - 20, 349, 40, 6, p.accent);
}

// ---------------------------------------------------------------- Lantern market
// Lantern anchors along the two street strings, sampled once (Float32Array: x, y pairs).
function apCatenary(x0, y0, x1, y1, sag, count) {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const s = (i + 0.5) / count;
    out[i * 2] = x0 + (x1 - x0) * s;
    out[i * 2 + 1] = y0 + (y1 - y0) * s + sag * 4 * s * (1 - s);
  }
  return out;
}
// Strings sit high (lowest lantern tassel ~y 136) so nothing glows in the y 150-250 band where
// back-row jumps, launchers and fire aerial VFX play over the centre of the arena.
const AP_STRING_A = [-10, 38, 1290, 56, 34];
const AP_STRING_B = [-10, 84, 1290, 72, 30];
const AP_LANTERNS_A = apCatenary(...AP_STRING_A, 8);
const AP_LANTERNS_B = apCatenary(...AP_STRING_B, 7);
// Shophouse rhythm along the back of the street: [left, width, roof y].
const AP_SHOPS = [[-20, 150, 214], [130, 128, 228], [258, 170, 206], [428, 136, 222], [564, 152, 210], [716, 140, 226], [856, 170, 204], [1026, 128, 224], [1154, 150, 212]];
// Eave lanterns only on the two outer shophouses (x ~148 and ~1136), away from the centre.
const AP_EAVE_LANTERNS = new Float32Array(4);
[1, 7].forEach((s, i) => { const [l, w, y] = AP_SHOPS[s]; AP_EAVE_LANTERNS[i * 2] = l + (i % 2 ? w - 18 : 18); AP_EAVE_LANTERNS[i * 2 + 1] = y + 3; });
const AP_POST_LANTERNS = new Float32Array([40, 222, 1240, 222]);
// Lantern colour per anchor: 0 paper, 1 ochre, 2 grey maroon (3 of 19 lanterns, all high up).
const AP_LANTERN_TONES_A = new Uint8Array([2, 0, 1, 0, 0, 1, 0, 2]);
const AP_LANTERN_TONES_B = new Uint8Array([0, 1, 0, 2, 0, 1, 0]);
const AP_LANTERN_TONES_EAVE = new Uint8Array([0, 1]);
const AP_LANTERN_TONES_POST = new Uint8Array([0, 0]);
// Sky lanterns: x, rise speed (px/s), phase (0..1), size. Spread out so no two pair up.
const AP_SKY_LANTERNS = new Float32Array([372, 6.2, 0.05, 3.4, 566, 4.4, 0.62, 4.6, 742, 5.6, 0.31, 3.0, 918, 4.0, 0.83, 4.1, 1104, 5.1, 0.47, 3.6]);
const AP_PAGODA_X = 318;

function marketBackdrop(ctx, p) {
  apSky(ctx, [[0, p.sky], [0.36, p.dusk], [0.62, '#e8d3bd'], [0.8, p.horizon], [1, p.horizon]]);
  ctx.fillStyle = '#f7f1e2';
  for (let i = 0; i < 30; i += 1) {
    const x = apNoise(i + 900) * AP_W, y = 8 + apNoise(i + 940) * 140;
    ctx.globalAlpha = 0.4 + apNoise(i + 980) * 0.5;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  apCircle(ctx, 1062, 150, 34, '#f7efdc');
  apCircle(ctx, 1062, 150, 43, null, '#f7efdc80', 1.5);

  // Hillside town and pagoda, cool and far.
  ctx.fillStyle = p.far;
  ctx.beginPath();
  ctx.moveTo(-20, 360);
  ctx.lineTo(-20, 196);
  ctx.bezierCurveTo(120, 170, 260, 200, 380, 214);
  ctx.bezierCurveTo(560, 236, 700, 226, 860, 212);
  ctx.bezierCurveTo(1000, 200, 1150, 186, 1300, 196);
  ctx.lineTo(1300, 360);
  ctx.closePath();
  ctx.fill();
  // Pagoda: a wide plinth and base storey, five tapering tiers above, spire with rings and a pearl.
  const px = AP_PAGODA_X;
  apRect(ctx, px - 34, 204, 68, 8, p.far);
  apRect(ctx, px - 40, 210, 80, 4, p.farRoof);
  let y = 204;
  for (let k = 0; k < 6; k += 1) {
    const h = k === 0 ? 20 : 15 - k;
    const half = k === 0 ? 40 : 31 - k * 4.4;
    const top = y - h;
    apRect(ctx, px - half * 0.6, top, half * 1.2, h, p.far);
    apEave(ctx, px, top + 2, half, 7 - k * 0.4, 4.5 - k * 0.3, p.farRoof);
    if (k % 2 === 0) apRect(ctx, px - 1.5, top + 6 + (k === 0 ? 5 : 0), 3, 4, p.window);
    y = top - 3;
  }
  apLine(ctx, [[px, y + 2], [px, y - 20]], p.farRoof, 2);
  for (let k = 0; k < 3; k += 1) apRect(ctx, px - 3.5 + k * 0.6, y - 4 - k * 5, 7 - k * 1.2, 1.6, p.farRoof);
  apCircle(ctx, px, y - 22, 2.4, p.farRoof);
  for (let i = 0; i < 22; i += 1) {
    const x = 340 + i * 44 + apNoise(i + 20) * 20;
    if (Math.abs(x - px) < 40) continue;
    const hy = 214 + apNoise(i + 60) * 14 - (x > 900 ? 12 : 0);
    apRect(ctx, x - 16, hy, 32, 18, p.far);
    apEave(ctx, x, hy + 2, 18, 7, 3, p.farRoof);
    if (apNoise(i + 100) > 0.35) apRect(ctx, x - 6 + apNoise(i) * 8, hy + 7, 4, 5, p.window);
  }

  // Glow of the street rising into the haze.
  ctx.globalAlpha = 0.45;
  apRect(ctx, 0, 228, AP_W, 130, p.horizon);
  ctx.globalAlpha = 1;

  // Lantern strings (cords only; lanterns sway in the scenery pass).
  for (const [x0, y0, x1, y1, sag] of [AP_STRING_A, AP_STRING_B]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1);
    ctx.strokeStyle = p.string;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Shophouses with lit stalls.
  AP_SHOPS.forEach(([l, w, roofY], i) => {
    const body = i % 2 ? p.mid : '#d4c4b8';
    apRect(ctx, l + 6, roofY, w - 12, 352 - roofY, body);
    // upper window lattice, lit
    apRect(ctx, l + w / 2 - 22, roofY + 14, 44, 22, p.window);
    ctx.strokeStyle = p.near;
    ctx.lineWidth = 1;
    ctx.strokeRect(l + w / 2 - 22, roofY + 14, 44, 22);
    ctx.beginPath();
    for (let k = 1; k < 4; k += 1) { ctx.moveTo(l + w / 2 - 22 + k * 11, roofY + 14); ctx.lineTo(l + w / 2 - 22 + k * 11, roofY + 36); }
    ctx.moveTo(l + w / 2 - 22, roofY + 25); ctx.lineTo(l + w / 2 + 22, roofY + 25);
    ctx.stroke();
    apEave(ctx, l + w / 2, roofY + 2, w / 2, 16, 8, p.roof);
    // stall opening, awning and counter
    apRect(ctx, l + 14, 268, w - 28, 80, p.stall);
    const awn = i % 3 === 0 ? p.awnA : i % 3 === 1 ? p.awnB : '#c8b4b2';
    apPoly(ctx, [[l + 8, 258], [l + w - 8, 258], [l + w - 2, 274], [l + 2, 274]], awn);
    ctx.globalAlpha = 0.35;
    for (let x = l + 18; x < l + w - 10; x += 20) apRect(ctx, x, 259, 8, 15, '#fff6e2');
    ctx.globalAlpha = 1;
    apRect(ctx, l + 14, 326, w - 28, 22, p.counter);
    apRect(ctx, l + 14, 326, w - 28, 3, '#dcb898');
    // goods on the counter: bowls, jars and baskets in a loose rhythm
    ctx.fillStyle = '#b98f76';
    ctx.beginPath();
    for (let x = l + 26, k = i; x < l + w - 24; x += 19 + apNoise(x) * 8, k += 1) {
      const kind = k % 3;
      if (kind === 0) { ctx.moveTo(x + 7, 326); ctx.ellipse(x, 326, 7, 5, 0, 0, Math.PI, true); }
      else if (kind === 1) { ctx.rect(x - 4, 315, 8, 11); ctx.rect(x - 2, 312, 4, 3); }
      else { ctx.moveTo(x - 8, 318); ctx.lineTo(x + 8, 318); ctx.lineTo(x + 5, 326); ctx.lineTo(x - 5, 326); ctx.closePath(); }
    }
    ctx.fill();
    // hanging signboard (abstract brush marks, no lettering)
    if (i % 2 === 0) {
      const sx = l + (i % 4 ? w - 30 : 22);
      apRect(ctx, sx, 280, 12, 36, p.wood);
      ctx.fillStyle = '#efdcb8';
      for (let k = 0; k < 3; k += 1) ctx.fillRect(sx + 3, 285 + k * 10, 6, 2.5);
    }
  });
  // Wok on the counter of the steam stall.
  ctx.fillStyle = '#7f665b';
  ctx.beginPath();
  ctx.ellipse(790, 323, 13, 6, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillRect(803, 321, 9, 2);
}

function marketPost(ctx, x, p) {
  // Lamp post with a bracket arm; the lantern itself sways in the ambient pass.
  const dir = x < AP_W / 2 ? 1 : -1;
  apRect(ctx, x - 4, 210, 8, 132, p.wood);
  apRect(ctx, x - 3, 210, 2, 132, '#b0927f');
  apPoly(ctx, [[x - 7, 212], [x, 202], [x + 7, 212]], p.lanternCap);
  apLine(ctx, [[x, 222], [x + dir * 20, 222]], p.wood, 3);
  apLine(ctx, [[x, 236], [x + dir * 12, 223]], p.wood, 2);
  apRect(ctx, x - 17, 340, 34, 9, p.accent);
  apRect(ctx, x - 20, 349, 40, 6, p.accent);
}

// ---------------------------------------------------------------- Tidewater keep
const AP_ARCH = { cx: 640, top: 214, r: 150, bottom: 334 }; // straight jambs from top to bottom
const AP_CELLS = [126, 300, 980, 1154];
const AP_DRIPS = new Float32Array([96, 58, 2.1, 418, 70, 2.7, 452, 64, 1.7, 868, 66, 2.4, 1006, 54, 1.9, 1196, 62, 2.9]);

function apArchPath(ctx, inset = 0) {
  const { cx, top, r, bottom } = AP_ARCH;
  ctx.moveTo(cx - r + inset, bottom);
  ctx.lineTo(cx - r + inset, top);
  ctx.arc(cx, top, r - inset, Math.PI, 0);
  ctx.lineTo(cx + r - inset, bottom);
  ctx.closePath();
}

// Lower edge of the overhang, as a smooth curve through the midpoints of noisy samples.
function apRockEdge(ctx, dy) {
  const yAt = x => 34 + apNoise(x * 0.07 + 2) * 26 + (Math.abs(x - 640) < 180 ? -10 : 0) + dy;
  ctx.moveTo(-10, yAt(-10));
  for (let x = -10; x <= AP_W + 20; x += 32) {
    const nx = x + 32;
    ctx.quadraticCurveTo(x, yAt(x), (x + nx) / 2, (yAt(x) + yAt(nx)) / 2);
  }
}
// A rounded, blunt drip lobe hanging to y=tip (added to the current path).
function apDripLobe(ctx, x, tip, half) {
  const r = 3.6;
  ctx.moveTo(x - half * 1.2, tip - 32);
  ctx.bezierCurveTo(x - half * 0.95, tip - 12, x - r * 2, tip - r * 1.8, x - r, tip - r);
  ctx.arc(x, tip - r, r, Math.PI, 0, true);
  ctx.bezierCurveTo(x + r * 2, tip - r * 1.8, x + half * 0.95, tip - 12, x + half * 1.2, tip - 32);
  ctx.closePath();
}

function keepBackdrop(ctx, p) {
  // Masonry wall fills the frame.
  apRect(ctx, 0, 0, AP_W, 352, p.masonry);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = p.joint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 0, y = 54; y < 334; r += 1, y += 26) {
    ctx.moveTo(0, y); ctx.lineTo(AP_W, y);
    for (let x = (r % 2) * 38 - 38; x < AP_W; x += 76) {
      const w = x + apNoise(r * 31 + x) * 10;
      ctx.moveTo(w, y); ctx.lineTo(w, y + 26);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Sea gate: open sky, sea and stacks, framed by voussoirs and a raised portcullis.
  ctx.save();
  ctx.beginPath();
  apArchPath(ctx);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 60, 0, 270);
  g.addColorStop(0, '#e9efe9');
  g.addColorStop(1, p.open);
  ctx.fillStyle = g;
  ctx.fillRect(480, 50, 320, 300);
  apCircle(ctx, 724, 156, 26, '#fbf7e8');
  ctx.globalAlpha = 0.7;
  for (const [x, y, w] of [[520, 140, 90], [650, 112, 70], [700, 196, 80]]) apRect(ctx, x, y, w, 3, '#f8f7ee');
  ctx.globalAlpha = 1;
  apPoly(ctx, [[490, 266], [520, 252], [560, 256], [600, 262], [620, 266]], '#c5d8dc');
  apPoly(ctx, [[540, 268], [552, 226], [566, 220], [576, 240], [586, 268]], '#b5cdd3');
  apPoly(ctx, [[700, 268], [708, 236], [720, 230], [734, 246], [744, 268]], '#b5cdd3');
  apRect(ctx, 480, 266, 320, 70, p.sea);
  apRect(ctx, 480, 266, 320, 2, '#d4e6e8');
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 9; i += 1) apRect(ctx, 490 + apNoise(i + 700) * 280, 276 + i * 6, 18 + apNoise(i + 730) * 40, 1.5, '#e9f4f1');
  ctx.globalAlpha = 1;
  // Raised portcullis teeth in the crown of the arch.
  ctx.fillStyle = p.iron;
  for (let x = 498; x < 790; x += 20) {
    ctx.fillRect(x, 50, 3, 52);
    ctx.beginPath();
    ctx.moveTo(x - 2, 102); ctx.lineTo(x + 1.5, 112); ctx.lineTo(x + 5, 102);
    ctx.fill();
  }
  ctx.fillRect(490, 84, 300, 3);
  ctx.fillRect(490, 62, 300, 3);
  ctx.restore();
  // Voussoir ring.
  ctx.beginPath();
  ctx.arc(AP_ARCH.cx, AP_ARCH.top, AP_ARCH.r + 9, Math.PI, 0);
  ctx.strokeStyle = '#c9d6d8';
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.strokeStyle = p.joint;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += Math.PI / 13) {
    ctx.moveTo(AP_ARCH.cx + Math.cos(a) * AP_ARCH.r, AP_ARCH.top + Math.sin(a) * AP_ARCH.r);
    ctx.lineTo(AP_ARCH.cx + Math.cos(a) * (AP_ARCH.r + 18), AP_ARCH.top + Math.sin(a) * (AP_ARCH.r + 18));
  }
  ctx.stroke();
  apRect(ctx, AP_ARCH.cx - 12, AP_ARCH.top - AP_ARCH.r - 20, 24, 24, '#dfe6e4');
  apRect(ctx, AP_ARCH.cx - AP_ARCH.r - 18, AP_ARCH.top, 18, 120, '#c9d6d8');
  apRect(ctx, AP_ARCH.cx + AP_ARCH.r, AP_ARCH.top, 18, 120, '#c9d6d8');

  // Upper gallery ledge with rings and swagged chains.
  for (const [l, r] of [[0, 462], [818, AP_W]]) {
    apRect(ctx, l, 176, r - l, 9, '#e3e9e6');
    apRect(ctx, l, 185, r - l, 4, p.rockShade);
    ctx.beginPath();
    for (let x = l + 30; x < r - 60; x += 116) {
      ctx.moveTo(x, 192);
      ctx.quadraticCurveTo(x + 40, 222, x + 80, 192);
    }
    ctx.strokeStyle = p.iron;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let x = l + 30; x < r - 60; x += 116) {
      apCircle(ctx, x, 192, 3, null, p.iron, 1.3);
      apCircle(ctx, x + 80, 192, 3, null, p.iron, 1.3);
    }
  }

  // Barred cells set into the wall.
  for (const cx of AP_CELLS) {
    ctx.fillStyle = '#c9d6d8';
    ctx.beginPath();
    ctx.moveTo(cx - 48, 334); ctx.lineTo(cx - 48, 262); ctx.arc(cx, 262, 48, Math.PI, 0); ctx.lineTo(cx + 48, 334);
    ctx.fill();
    ctx.fillStyle = p.cell;
    ctx.beginPath();
    ctx.moveTo(cx - 38, 334); ctx.lineTo(cx - 38, 262); ctx.arc(cx, 262, 38, Math.PI, 0); ctx.lineTo(cx + 38, 334);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = p.iron;
    for (let x = cx - 32; x <= cx + 32; x += 12.8) ctx.fillRect(x - 1.5, 220, 3, 120);
    ctx.fillRect(cx - 40, 270, 80, 3);
    ctx.fillRect(cx - 40, 312, 80, 3);
    ctx.restore();
    apRect(ctx, cx - 10, 206, 20, 9, '#e6ebe7');
    apRect(ctx, cx - 7, 209, 14, 1.5, p.joint);
  }

  // Cave rock overhang: a lumpy, rounded lip of wet sea rock (curves through the midpoints of
  // the sampled edge, so there are no ice-like spikes), with rounded drip lobes and an algae line.
  ctx.fillStyle = p.rock;
  ctx.beginPath();
  apRockEdge(ctx, 0);
  ctx.lineTo(AP_W + 20, -10);
  ctx.lineTo(-10, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < AP_DRIPS.length; i += 3) apDripLobe(ctx, AP_DRIPS[i], AP_DRIPS[i + 1], 10);
  apDripLobe(ctx, 162, 66, 9);
  apDripLobe(ctx, 1090, 62, 8);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -3);
  ctx.beginPath();
  apRockEdge(ctx, 0);
  ctx.strokeStyle = p.rockLip;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 0.5;
  apLine(ctx, [[0, 34], [180, 42], [380, 30], [460, 38]], p.rockShade, 2);
  apLine(ctx, [[820, 36], [1000, 44], [1280, 32]], p.rockShade, 2);
  ctx.globalAlpha = 1;

  // Light shaft from a crack in the rock, falling short of the floor.
  ctx.globalAlpha = 0.22;
  apPoly(ctx, [[300, 36], [338, 36], [470, 334], [380, 334]], '#fffbea');
  ctx.globalAlpha = 1;

  // Weed strands draped from the gallery ledge.
  ctx.strokeStyle = p.weed;
  ctx.lineCap = 'round';
  for (const x of [44, 238, 410, 852, 1060, 1240]) {
    for (let k = 0; k < 5; k += 1) {
      const sx = x - 8 + k * 4;
      const len = 12 + apNoise(x + k * 13) * 22;
      ctx.lineWidth = 2.6 - k * 0.25;
      ctx.beginPath();
      ctx.moveTo(sx, 188);
      ctx.quadraticCurveTo(sx + (k % 2 ? 4 : -4), 188 + len * 0.5, sx + (k - 2) * 1.5, 188 + len);
      ctx.stroke();
    }
  }

  // Tide channel between the wall foot and the quay.
  apRect(ctx, 0, 334, AP_W, 15, p.channel);
  apRect(ctx, 0, 332, AP_W, 3, p.rockShade);
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 14; i += 1) apRect(ctx, apNoise(i + 760) * AP_W, 338 + (i % 3) * 3, 16 + apNoise(i + 790) * 30, 1.2, '#eef7f2');
  ctx.globalAlpha = 1;
}

function keepPost(ctx, x, p) {
  // Mooring pillar with an iron ring; the chain swings in the ambient pass.
  apRect(ctx, x - 12, 236, 24, 106, '#d8dfdc');
  apRect(ctx, x + 5, 236, 7, 106, '#bccacb');
  apRect(ctx, x - 16, 226, 32, 11, '#e6ebe7');
  apRect(ctx, x - 16, 236, 32, 2, p.joint);
  apCircle(ctx, x, 262, 6, null, p.iron, 2.2);
  ctx.globalAlpha = 0.6;
  apLine(ctx, [[x - 12, 300], [x + 12, 300]], p.joint, 1);
  ctx.globalAlpha = 1;
  apRect(ctx, x - 17, 340, 34, 9, p.accent);
  apRect(ctx, x - 20, 349, 40, 6, p.accent);
}

// ---------------------------------------------------------------- public draw entry points
const AP_BACKDROPS = { bamboo: bambooBackdrop, rampart: rampartBackdrop, market: marketBackdrop, keep: keepBackdrop };
const AP_POSTS = { bamboo: bambooPost, rampart: rampartPost, market: marketPost, keep: keepPost };

export function drawArenaPackBackground(ctx, key) {
  const p = ARENA_PACK_PALETTES[key];
  if (!p) return;
  ctx.save();
  AP_BACKDROPS[key](ctx, p);
  apFloor(ctx, key, p);
  AP_POSTS[key](ctx, 20, p);
  AP_POSTS[key](ctx, 1260, p);
  // Paper grain, same density as the original arenas.
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 450; i += 1) {
    ctx.fillStyle = i % 2 ? '#fff8e8' : p.accent;
    ctx.fillRect(apNoise(i * 3) * AP_W, apNoise(i * 3 + 1) * AP_H, 1, 1);
  }
  ctx.restore();
}

// Stage name strip. It hangs just under the engine's banner plaque (Renderer.drawBanner draws
// y 70-117) in the same slanted paper shape and ink, so the two read as one stacked caption:
//      [ WAVE 1 ]                                  <- engine banner, y 70-117
//   [ (o) BAMBOO GROVE -- Where the wind bends ]   <- this card, y 126-160
// Draw it while state.bannerTime > 0 on the first banner of a run, with
// alpha = Math.min(1, state.bannerTime * 2) so it fades out together with the banner.
// subtitleOnly drops the name for story chapters, whose banner already reads
// "Chapter n · <arena name>". measureText only runs while the card is on screen.
export const AP_CARD_TOP = 126;
export function drawArenaPackTitleCard(ctx, key, alpha = 1, top = AP_CARD_TOP, subtitleOnly = false) {
  const a = ARENA_PACK[key], p = ARENA_PACK_PALETTES[key];
  if (!a || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let wName = 0;
  if (!subtitleOnly) {
    ctx.font = '800 16px system-ui, sans-serif';
    wName = ctx.measureText(a.name.toUpperCase()).width;
  }
  ctx.font = 'italic 500 13px system-ui, sans-serif';
  const wSub = ctx.measureText(a.subtitle).width;
  const h = 34;
  const w = Math.round(50 + (subtitleOnly ? 0 : wName + 36) + wSub + 20);
  const x = Math.round((AP_W - w) / 2), cy = top + h / 2;
  apPoly(ctx, [[x - 6, top], [x + w + 6, top], [x + w, top + h], [x, top + h]], '#fbf5e9ed', '#263b3c', 1.5);
  apCircle(ctx, x + 25, cy, 12, null, p.accent, 1.3);
  ctx.translate(x + 25, cy);
  apEmblem(ctx, key, p.accent, 8.5);
  ctx.translate(-(x + 25), -cy);
  let tx = x + 47;
  if (!subtitleOnly) {
    ctx.fillStyle = '#263b3c';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillText(a.name.toUpperCase(), tx, top + 23);
    tx += wName + 10;
    apLine(ctx, [[tx, cy + 1], [tx + 16, cy + 1]], p.accent, 1.5);
    tx += 26;
  }
  ctx.fillStyle = p.edge;
  ctx.font = 'italic 500 13px system-ui, sans-serif';
  ctx.fillText(a.subtitle, tx, top + 22);
  ctx.restore();
}

// Ambient seeds (module scope, built once).
const AP_SEED = new Float32Array(96);
for (let i = 0; i < AP_SEED.length; i += 1) AP_SEED[i] = apNoise(i * 7 + 1234);
const AP_EDGE_X = [20, 1260];
const AP_CHAIN_DASH = [3.2, 1.6];
const AP_NO_DASH = [];

// Small free-floating motes kept above the floor plane (y 110-340), so ground shadows never cover them.
function apMotes(ctx, t, color, count, drift, alpha, size) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const x = ((AP_SEED[i] * 1360 + t * (drift + AP_SEED[i + 10] * drift)) % 1360) - 40;
    const y = 110 + AP_SEED[i + 20] * 220 + Math.sin(t * 0.9 + i) * 10;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

// ---- Bamboo grove
function bambooScenery(ctx, t, p) {
  // Near sprays hang off the edge stalks and sway on the gusts (anchored to the stalk curve).
  const gust = Math.sin(t * 0.7) * 0.08;
  ctx.fillStyle = p.nearLeaf;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const st = AP_NEAR_STALKS[(i < 4 ? 0 : 2) + (i % 2)];
    const y = 30 + (i % 4) * 54 + AP_SEED[i] * 16;
    const s = (352 - y) / 372;
    const sway = Math.sin(t * 1.4 + i * 1.9) * 0.1 + gust;
    apSpray(ctx, st[0] + st[2] * s * s + st[1] * 0.3, y, 5, 25 + AP_SEED[i + 10] * 8, i * 13 + 500, sway);
  }
  ctx.fill();
}
function bambooAmbient(ctx, t, p) {
  // Falling leaves carried right on the wind; each fades out before it reaches the ledge.
  for (let i = 0; i < 12; i += 1) {
    const a = AP_SEED[i + 20], b = AP_SEED[i + 40], c = AP_SEED[i + 60];
    const x = ((b * 1500 + t * (34 + a * 40)) % 1500) - 110;
    const y = 16 + ((c * 320 + t * (10 + a * 10)) % 320) + Math.sin(t * 2.1 + i) * 8;
    const fade = Math.min(1, (334 - y) / 48, (y - 8) / 24);
    if (fade <= 0) continue;
    ctx.globalAlpha = 0.65 * fade;
    ctx.fillStyle = i % 2 ? p.midLeaf : p.nearNode;
    ctx.beginPath();
    apLeaf(ctx, x, y, 10 + a * 4, 2.3, 0.6 + Math.sin(t * 2.6 + i * 1.3) * 0.9);
    ctx.fill();
  }
  // Wind streaks.
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = '#fffdf0';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const x = ((AP_SEED[i + 80] * 1400 + t * 90) % 1400) - 60;
    const y = 90 + AP_SEED[i + 86] * 230 + Math.sin(t + i) * 6;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34, y);
    ctx.quadraticCurveTo(x + 46, y, x + 48, y - 5);
  }
  ctx.stroke();
}

// ---- Dusk rampart
function rampartScenery(ctx, t, p) {
  // War banners on the edge poles: swallowtail cloth with a pale head band and a compass star.
  for (let e = 0; e < 2; e += 1) {
    const x = AP_EDGE_X[e];
    const dir = x < AP_W / 2 ? 1 : -1;
    const x0 = x + dir * 2, x1 = x + dir * 21;
    ctx.beginPath();
    ctx.moveTo(x0, 215);
    for (let k = 0; k <= 6; k += 1) {
      const y = 215 + k * 11;
      ctx.lineTo(x1 + dir * Math.sin(t * 3.1 + k * 0.7 + x) * (1 + k * 0.7), y);
    }
    ctx.lineTo((x0 + x1) / 2 + dir * Math.sin(t * 3.1 + 5 + x) * 4, 272);
    for (let k = 6; k >= 0; k -= 1) {
      const y = 215 + k * 11;
      ctx.lineTo(x0 + dir * Math.sin(t * 3.1 + k * 0.7 + x - 0.5) * (k * 0.5), y);
    }
    ctx.closePath();
    ctx.fillStyle = p.banner;
    ctx.fill();
    ctx.fillStyle = p.bannerHi;
    const fx = Math.sin(t * 3.1 + 0.7 + x) * 1.7;
    ctx.beginPath();
    ctx.moveTo(x0 + dir * 1, 221);
    ctx.lineTo(x1 + dir * (fx - 1), 221);
    ctx.lineTo(x1 + dir * (fx - 1), 224);
    ctx.lineTo(x0 + dir * 1, 224);
    ctx.closePath();
    const mx = (x0 + x1) / 2 + dir * Math.sin(t * 3.1 + 2 + x) * 2;
    for (let k = 0; k < 8; k += 1) {
      const ang = k * Math.PI / 4 - Math.PI / 2;
      const rr = k % 2 ? 1.6 : 5.6;
      const sx = mx + Math.cos(ang) * rr, sy = 243 + Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Geese in a V, crossing slowly far off.
  const lead = ((t * 15 + 760) % 1800) - 260;
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#9d877b';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < 7; k += 1) {
    const j = Math.ceil(k / 2), side = k % 2 ? -1 : 1;
    const bx = lead - j * 15, by = 132 + Math.sin(t * 0.4) * 5 + side * j * 8;
    const flap = 1 + Math.sin(t * 6.5 + k) * 2.5;
    ctx.moveTo(bx - 6, by - flap);
    ctx.quadraticCurveTo(bx - 2, by - flap * 0.3, bx, by);
    ctx.quadraticCurveTo(bx + 2, by - flap * 0.3, bx + 6, by - flap);
    ctx.moveTo(bx - 1, by);
    ctx.lineTo(bx + 4, by + 0.5); // body and outstretched neck, flying right
  }
  ctx.stroke();
  // Beacon smoke: one continuous plume that rises straight, then bends down-wind (two stacked
  // low-alpha bands, denser at the source), with a few soft puffs breaking off its tip.
  const bx = AP_RIDGE_B[5][0], by = AP_RIDGE_B[5][1] - 34;
  ctx.fillStyle = '#c7ad9e';
  ctx.globalAlpha = 0.14;
  for (let band = 0; band < 2; band += 1) {
    const reach = band ? 0.5 : 1;
    ctx.beginPath();
    for (let k = 0; k <= 12; k += 1) {
      const u = (k / 12) * reach;
      ctx.lineTo(bx + u * 12 + u * u * 70 + Math.sin(u * 7 - t * 1.4) * 5 * u - (1.5 + u * 10), by - u * 96 + u * u * 8);
    }
    // Rounded end: curve around the plume tip along its direction of travel.
    const ex = bx + reach * 12 + reach * reach * 70 + Math.sin(reach * 7 - t * 1.4) * 5 * reach;
    const ey = by - reach * 96 + reach * reach * 15;
    const dx = 12 + 140 * reach, dy = -96 + 30 * reach, dl = Math.sqrt(dx * dx + dy * dy);
    ctx.quadraticCurveTo(ex + dx / dl * (6 + reach * 16), ey + dy / dl * (6 + reach * 16), ex + 1.5 + reach * 10, by - reach * 96 + reach * reach * 22);
    for (let k = 12; k >= 0; k -= 1) {
      const u = (k / 12) * reach;
      ctx.lineTo(bx + u * 12 + u * u * 70 + Math.sin(u * 7 - t * 1.4) * 5 * u + (1.5 + u * 10), by - u * 96 + u * u * 22);
    }
    ctx.closePath();
    ctx.fill();
  }
  for (let k = 0; k < 4; k += 1) {
    const age = (t * 0.17 + k / 4) % 1;
    const r = 9 + age * 8;
    ctx.globalAlpha = (1 - age) * Math.min(1, age * 5) * 0.13;
    ctx.beginPath();
    ctx.ellipse(bx + 82 + age * 46 + Math.sin(t * 1.1 + k) * 3, by - 82 - age * 22 + 6, r * 1.4, r * 0.6, -0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function rampartAmbient(ctx, t) {
  apMotes(ctx, t, '#c4a27a', 10, 12, 0.35, 2);
}

// ---- Lantern market
// One set of lanterns in a handful of batched paths: glow, one body fill per tone, ink cords/caps,
// rib highlight. tones[i]: 0 paper, 1 ochre, 2 grey maroon.
function apLanternSet(ctx, anchors, tones, t, phase, cord, rx, ry, p) {
  const n = anchors.length / 2;
  // glows: two stacked discs fake a falloff without a gradient
  ctx.fillStyle = p.glow;
  for (let pass = 0; pass < 2; pass += 1) {
    const rr = ry * (pass ? 1.45 : 2.1);
    ctx.globalAlpha = pass ? 0.15 : 0.09;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const a = Math.sin(t * 1.5 + i * 0.9 + phase) * 0.12;
      const x = anchors[i * 2] + Math.sin(a) * (cord + ry), y = anchors[i * 2 + 1] + Math.cos(a) * (cord + ry);
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, rr, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let tone = 0; tone < 3; tone += 1) {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      if (tones[i] !== tone) continue;
      any = true;
      const a = Math.sin(t * 1.5 + i * 0.9 + phase) * 0.12;
      const x = anchors[i * 2] + Math.sin(a) * (cord + ry), y = anchors[i * 2 + 1] + Math.cos(a) * (cord + ry);
      ctx.moveTo(x + rx, y);
      ctx.ellipse(x, y, rx, ry, -a, 0, Math.PI * 2);
    }
    if (!any) continue;
    ctx.fillStyle = tone === 0 ? p.paperLantern : tone === 1 ? p.ochreLantern : p.lantern;
    ctx.fill();
  }
  // cords, caps and tassels in one ink-brown stroke
  ctx.strokeStyle = p.lanternCap;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const a = Math.sin(t * 1.5 + i * 0.9 + phase) * 0.12;
    const s = Math.sin(a), c = Math.cos(a);
    const ax = anchors[i * 2], ay = anchors[i * 2 + 1];
    const x = ax + s * (cord + ry), y = ay + c * (cord + ry);
    ctx.moveTo(ax, ay);
    ctx.lineTo(x - s * ry, y - c * ry);
    // caps as short bars perpendicular to the hang direction
    ctx.moveTo(x - s * ry - c * rx * 0.55, y - c * ry + s * rx * 0.55);
    ctx.lineTo(x - s * ry + c * rx * 0.55, y - c * ry - s * rx * 0.55);
    ctx.moveTo(x + s * ry - c * rx * 0.55, y + c * ry + s * rx * 0.55);
    ctx.lineTo(x + s * ry + c * rx * 0.55, y + c * ry - s * rx * 0.55);
    ctx.moveTo(x + s * ry, y + c * ry);
    ctx.lineTo(x + s * (ry + 5), y + c * (ry + 5));
  }
  ctx.lineWidth = 2;
  ctx.stroke();
  // centre rib highlight
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = '#fff3d6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const a = Math.sin(t * 1.5 + i * 0.9 + phase) * 0.12;
    const s = Math.sin(a), c = Math.cos(a);
    const x = anchors[i * 2] + s * (cord + ry), y = anchors[i * 2 + 1] + c * (cord + ry);
    ctx.moveTo(x - s * ry * 0.7, y - c * ry * 0.7);
    ctx.lineTo(x + s * ry * 0.7, y + c * ry * 0.7);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function marketScenery(ctx, t, p) {
  // Sky lanterns rising from just above the rooftops (y 182) into the dusk; they fade in over
  // their first 24px, so they spend almost no time in the y 150-250 combat band.
  for (let i = 0; i < AP_SKY_LANTERNS.length; i += 4) {
    const span = 196;
    const rise = (t * AP_SKY_LANTERNS[i + 1] + AP_SKY_LANTERNS[i + 2] * span) % span;
    const x = AP_SKY_LANTERNS[i] + Math.sin(t * 0.3 + i) * 10 + rise * 0.12;
    const y = 182 - rise;
    const s = AP_SKY_LANTERNS[i + 3];
    const fade = Math.min(1, (span - rise) / 60, rise / 24);
    ctx.globalAlpha = 0.13 * fade;
    ctx.fillStyle = p.glow;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9 * fade;
    ctx.fillStyle = '#f4d9a6';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.75, y + s * 1.2);
    ctx.lineTo(x - s, y - s * 0.6);
    ctx.quadraticCurveTo(x, y - s * 1.9, x + s, y - s * 0.6);
    ctx.lineTo(x + s * 0.75, y + s * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9a866';
    ctx.fillRect(x - s * 0.5, y + s * 0.7, s, s * 0.5);
  }
  ctx.globalAlpha = 1;
  // Steam wisps off the wok.
  ctx.strokeStyle = '#fbf3e3';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k += 1) {
    const age = (t * 0.45 + k / 3) % 1;
    const x = 786 + k * 5, y = 316 - age * 46;
    ctx.globalAlpha = Math.sin(age * Math.PI) * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 6, y - 6, x + 6, y - 10, x, y - 16);
    ctx.stroke();
  }
  // A few faint cream sparks off the wok (short-lived, never above y 266).
  ctx.fillStyle = '#efcf9e';
  for (let k = 0; k < 5; k += 1) {
    const age = (t * 0.6 + AP_SEED[k + 30]) % 1;
    ctx.globalAlpha = (1 - age) * 0.55;
    ctx.fillRect(790 + Math.sin(age * 9 + k * 2) * 7 + (AP_SEED[k + 40] - 0.5) * 12, 316 - age * 48, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  apLanternSet(ctx, AP_LANTERNS_A, AP_LANTERN_TONES_A, t, 0, 4, 7, 9, p);
  apLanternSet(ctx, AP_LANTERNS_B, AP_LANTERN_TONES_B, t, 2, 4, 6.5, 8.5, p);
  apLanternSet(ctx, AP_EAVE_LANTERNS, AP_LANTERN_TONES_EAVE, t, 4, 3, 5.5, 7, p);
  apLanternSet(ctx, AP_POST_LANTERNS, AP_LANTERN_TONES_POST, t, 1, 5, 6, 8, p);
}
function marketAmbient(ctx, t) {
  apMotes(ctx, t, '#fff4dc', 8, 6, 0.45, 1.6);
}

// ---- Tidewater keep
function keepScenery(ctx, t, p) {
  // Drips from the overhang into the tide channel, each on its own period.
  ctx.fillStyle = '#8db4c2';
  ctx.strokeStyle = '#eaf5f2';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < AP_DRIPS.length; i += 3) {
    const x = AP_DRIPS[i], tip = AP_DRIPS[i + 1], period = AP_DRIPS[i + 2];
    const ph = ((t + i * 0.37) % period) / period;
    if (ph < 0.6) {
      const f = ph / 0.6;
      const y = tip + f * f * (340 - tip);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.9, 3 + f * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const f = (ph - 0.6) / 0.4;
      ctx.globalAlpha = (1 - f) * 0.9;
      ctx.beginPath();
      ctx.ellipse(x, 341, 2 + f * 12, 1 + f * 2.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Swell through the sea gate.
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#eef7f3';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const x = 496 + ((AP_SEED[i + 50] * 270 + t * (8 + i * 2)) % 270);
    const y = 280 + i * 9;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 7, y - 3, x + 14 + i, y);
  }
  ctx.stroke();
  // Gulls gliding across the opening, faded near the jambs.
  ctx.strokeStyle = '#7f989f';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i += 1) {
    const span = 260;
    const u = ((t * (11 + i * 5) + i * 130) % span) / span;
    const x = 510 + u * span, y = 150 + i * 46 + Math.sin(t * 0.8 + i * 2) * 8;
    ctx.globalAlpha = Math.min(1, u * 6, (1 - u) * 6) * 0.8;
    const flap = 2 + Math.sin(t * 3 + i) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - flap);
    ctx.quadraticCurveTo(x - 3, y - flap - 2, x, y);
    ctx.quadraticCurveTo(x + 3, y - flap - 2, x + 7, y - flap);
    ctx.stroke();
  }
  // Channel glints sliding along the quay.
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#f4fbf7';
  for (let i = 0; i < 8; i += 1) {
    const x = ((AP_SEED[i + 60] * 1320 + t * (10 + AP_SEED[i + 70] * 8)) % 1320) - 20;
    ctx.fillRect(x, 337 + (i % 3) * 3.5, 10 + AP_SEED[i + 80] * 14, 1.2);
  }
  // Mooring chains hang from the pillar rings and pool on the ledge, swinging slightly.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.iron;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'butt';
  ctx.setLineDash(AP_CHAIN_DASH);
  ctx.beginPath();
  for (let e = 0; e < 2; e += 1) {
    const x = AP_EDGE_X[e];
    const dir = x < AP_W / 2 ? 1 : -1;
    const swing = Math.sin(t * 1.3 + x) * 3;
    ctx.moveTo(x, 268);
    ctx.quadraticCurveTo(x + dir * 9 + swing, 300, x + dir * 15, 336);
  }
  ctx.stroke();
  ctx.setLineDash(AP_NO_DASH);
}
function keepAmbient(ctx, t) {
  apMotes(ctx, t, '#ffffff', 8, 5, 0.5, 1.8);
}

const AP_SCENERY = { bamboo: bambooScenery, rampart: rampartScenery, market: marketScenery, keep: keepScenery };
const AP_AMBIENT = { bamboo: bambooAmbient, rampart: rampartAmbient, market: marketAmbient, keep: keepAmbient };

// Anchored moving scenery. Call right after the cached background is drawn, BEFORE the
// screen-shake translate, so it stays locked to the static poles, strings, rings and stalks.
export function drawArenaPackScenery(ctx, key, t) {
  const p = ARENA_PACK_PALETTES[key];
  if (!p) return;
  ctx.save();
  AP_SCENERY[key](ctx, t, p);
  ctx.restore();
}

// Free air particles. Call where Renderer.drawAmbient runs (inside the shake, before shadows).
export function drawArenaPackAmbient(ctx, key, t) {
  const p = ARENA_PACK_PALETTES[key];
  if (!p) return;
  ctx.save();
  AP_AMBIENT[key](ctx, t, p);
  ctx.restore();
}
// === ASSETS END ===
