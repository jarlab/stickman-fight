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
    for (const effect of state.effects || []) this.drawEffect(effect);
    const objects = [
      ...fighters.map(entity => ({ entity, kind: 'fighter' })),
      ...corpses.map(entity => ({ entity, kind: 'corpse' })),
      ...weapons.map(entity => ({ entity, kind: 'pickup' })),
      ...projectiles.map(entity => ({ entity, kind: 'projectile' })),
    ].sort((a, b) => groundDepth(a.entity) - groundDepth(b.entity));
    for (const { entity, kind } of objects) {
      if (kind === 'fighter') this.drawFighter(entity, time, reducedMotion);
      else if (kind === 'corpse') this.drawCorpse(entity);
      else if (kind === 'pickup') this.drawWeaponPickup(entity, reducedMotion ? 0 : time);
      else this.drawProjectile(entity, time);
    }
    for (const particle of state.particles || []) this.drawParticle(particle);
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
    const radius = kind === 'pickup' ? (entity.kind === 'crate' ? 25 : 17) : kind === 'projectile' ? 14 : (entity.knockdown > 0 ? 31 : 22) * scale;
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

  drawFighter(fighter, time, reducedMotion) {
    const ctx = this.ctx;
    const h = fighter.h || 66;
    const scale = h / 66;
    const color = elementColor(fighter.element);
    const facing = fighter.facing < 0 ? -1 : 1;
    const speed = Math.min(1, Math.hypot(fighter.vx || 0, fighter.vd || 0) / 210);
    const grounded = Boolean(fighter.grounded);
    const attacking = (fighter.attackTimer || 0) > 0;
    const windingUp = fighter.action && fighter.action.t < fighter.action.windup;
    const casting = attacking && (fighter.attackKind === 'special' || fighter.attackKind === 'burst');
    const runningAttack = attacking && fighter.attackKind === 'runAttack';
    const aerialAttack = attacking && fighter.attackKind === 'aerial';
    const throwing = attacking && fighter.attackKind === 'throw';
    const kick = attacking && !windingUp && (fighter.comboIndex === 3 || aerialAttack) && !casting && !throwing;
    const guarding = Boolean(fighter.guard);
    const stunned = (fighter.stun || 0) > 0;
    const isBoss = fighter.type === 'boss';
    const isPlayer = fighter.team === 'player';
    const cycle = time * 14 + Number(fighter.id || 0);
    const stride = grounded && !stunned ? Math.sin(Number.isFinite(cycle) ? cycle : time * 14) * speed : 0;
    const idle = reducedMotion ? 0 : Math.sin(time * 3.5) * (speed < 0.1 ? 1 : 0);

    if ((fighter.knockdown || 0) > 0) {
      const airborne = (fighter.z || 0) > 4;
      this.drawCorpse({ ...fighter, x: fighter.x - (airborne ? 0 : facing * 13), y: fighter.y - 15, rotation: airborne ? time * 11 * facing : Math.PI / 2 * facing, life: 1 });
      if (isPlayer) polygon(ctx, [[fighter.x - 5, fighter.y - 36], [fighter.x + 5, fighter.y - 36], [fighter.x, fighter.y - 30]], color, INK, 1);
      this.drawFighterHealth(fighter, airborne ? h : 28);
      return;
    }

    ctx.save();

    if (fighter.tell) {
      ctx.globalAlpha = 0.3 + Math.sin(time * 16) * 0.12;
      circle(ctx, fighter.x, fighter.y - h * 0.52, h * 0.68, '#f3a863', '#ba522e', 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#a53b25';
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', fighter.x, fighter.y - h - 21);
    }

    if (isPlayer) {
      ctx.globalAlpha = 0.8;
      polygon(ctx, [[fighter.x - 5, fighter.y - h - 19], [fighter.x + 5, fighter.y - h - 19], [fighter.x, fighter.y - h - 13]], color, INK, 1);
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
        const y = fighter.y - 8 - (time * 27 + i * 11) % 39;
        polygon(ctx, [[x - 3, y + 5], [x, y - 6], [x + 4, y + 4]], '#e88b42');
      }
      ctx.restore();
    }

    ctx.translate(fighter.x, fighter.y);
    ctx.scale(scale * facing, scale);
    if ((fighter.invulnerable || 0) > 0) ctx.globalAlpha = reducedMotion ? 0.8 : 0.64 + Math.sin(time * 30) * 0.18;
    const lean = stunned ? -11 : windingUp ? -6 : runningAttack ? 12 : kick ? -5 : attacking ? 5 : speed * 4;
    const hip = [lean * 0.3, -27 + idle];
    const shoulder = [lean, -45 + idle];
    const head = [lean + 1, -57 + idle];
    let rearFoot = grounded ? [-11 - stride * 11, -1] : [-15, -14];
    let frontFoot = grounded ? [11 + stride * 11, -1] : [12, -9];
    let rearKnee = [-10 - stride * 3, -15 + Math.abs(stride) * -3];
    let frontKnee = [8 + stride * 5, -15];
    if (kick) {
      rearFoot = aerialAttack ? [-19, -13] : [-10, -1];
      frontFoot = [43, aerialAttack ? -26 : -31];
      frontKnee = [22, -30];
      rearKnee = [-11, -16];
    } else if (runningAttack && !windingUp) {
      rearFoot = [-23, -5];
      rearKnee = [-13, -16];
      frontFoot = [18, -1];
      frontKnee = [16, -15];
    }
    line(ctx, [hip, rearKnee, rearFoot], '#415451', 7);
    line(ctx, [[rearFoot[0] - 2, rearFoot[1]], [rearFoot[0] + 5, rearFoot[1]]], INK, 6);
    line(ctx, [hip, frontKnee, frontFoot], INK, 7);
    line(ctx, [[frontFoot[0] - 1, frontFoot[1]], [frontFoot[0] + 6, frontFoot[1]]], INK, 6);

    const rearElbow = guarding ? [7, -40] : [-14 - stride * 3, -32];
    const rearHand = guarding ? [14, -51] : [-9 - stride * 5, -27];
    line(ctx, [shoulder, rearElbow, rearHand], '#415451', 6);
    circle(ctx, rearHand[0], rearHand[1], 3, PAPER, INK, 1.4);
    line(ctx, [hip, shoulder], INK, isBoss ? 12 : 9);

    if (fighter.element === 'earth') {
      polygon(ctx, [[shoulder[0] - 8, -47 + idle], [shoulder[0] + 8, -47 + idle], [hip[0] + 9, -27 + idle], [hip[0] - 9, -27 + idle]], color, INK, 2);
      line(ctx, [[hip[0] - 7, -29 + idle], [hip[0] + 7, -29 + idle]], '#dfd6a0', 3);
    } else if (fighter.element === 'water') {
      polygon(ctx, [[shoulder[0] - 6, -45 + idle], [shoulder[0] + 6, -45 + idle], [hip[0] + 10, -22 + idle], [hip[0] - 10, -22 + idle]], color, INK, 2);
      line(ctx, [[shoulder[0] - 5, -44 + idle], [hip[0] + 6, -26 + idle]], '#e6f1e7', 3);
    } else {
      polygon(ctx, [[shoulder[0] - 5, -46 + idle], [shoulder[0] + 6, -45 + idle], [hip[0] + 6, -27 + idle], [hip[0] - 7, -27 + idle]], color, INK, 2);
      line(ctx, [[shoulder[0] - 4, -44 + idle], [hip[0] + 4, -29 + idle]], '#f4dbab', 3);
    }

    // Headwear and silhouettes distinguish the four premade fighters.
    circle(ctx, head[0], head[1], 9.5, PAPER, INK, 2.6);
    if (fighter.element === 'air') {
      line(ctx, [[head[0] - 9, head[1] - 3], [head[0] + 8, head[1] - 3]], color, 4);
      line(ctx, [[head[0] - 9, head[1] - 3], [head[0] - 16, head[1] - 6 + Math.sin(time * 8) * 2]], color, 3);
      line(ctx, [[shoulder[0] - 4, -43], [-17 - speed * 6, -45 + Math.sin(time * 7) * 3]], color, 4);
    } else if (fighter.element === 'water') {
      ctx.beginPath();
      ctx.arc(head[0], head[1] - 1, 10, Math.PI, Math.PI * 1.95);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.stroke();
      line(ctx, [[head[0] - 7, head[1] + 7], [head[0] + 7, head[1] + 7]], '#d8e6e3', 5);
      line(ctx, [[head[0] - 7, head[1] + 7], [head[0] - 15, head[1] + 14 + Math.sin(time * 6) * 2]], color, 5);
    } else if (fighter.element === 'earth') {
      polygon(ctx, [[head[0] - 11, head[1] - 3], [head[0] - 7, head[1] - 12], [head[0] + 7, head[1] - 12], [head[0] + 11, head[1] - 3]], color, INK, 2);
      line(ctx, [[head[0] - 12, head[1] - 3], [head[0] + 11, head[1] - 3]], INK, 2);
    } else {
      polygon(ctx, [[head[0] - 9, head[1] - 1], [head[0] - 10, head[1] - 7], [head[0] - 3, head[1] - 12], [head[0] + 5, head[1] - 10], [head[0] + 9, head[1] - 4]], INK);
      circle(ctx, head[0] - 4, head[1] - 14, 4, INK);
      line(ctx, [[head[0] - 7, head[1] - 10], [head[0] - 1, head[1] - 10]], color, 3);
    }
    circle(ctx, head[0] + 4, head[1], 1.3, INK);
    line(ctx, [[head[0] + 2, head[1] + 4], [head[0] + 5, head[1] + 4]], '#6b6653', 1);

    let elbow = [14 + stride * 3, -35];
    let hand = [19 - stride * 4, -42];
    if (guarding) { elbow = [12, -35]; hand = [15, -51]; }
    if (attacking) { elbow = [23, -44]; hand = [36, -43]; }
    if (attacking && fighter.comboIndex === 2) { elbow = [23, -35]; hand = [34, -49]; }
    if (kick) { elbow = [10, -37]; hand = [18, -48]; }
    if (runningAttack) { elbow = [29, -39]; hand = [43, -38]; }
    if (throwing) { elbow = [22, -48]; hand = [37, -52]; }
    if (casting) { elbow = [20, -39]; hand = [30, -48]; }
    if (windingUp) { elbow = [-13, -39]; hand = [-17, -48]; }
    if (stunned) { elbow = [11, -36]; hand = [20, -29]; }
    if (fighter.weapon) {
      if (attacking && !windingUp) this.drawHeldWeapon(fighter.weapon, [8, -40], [61, -46]);
      else this.drawHeldWeapon(fighter.weapon, [hand[0] - 8, hand[1] + 24], [hand[0] + 10, hand[1] - 28]);
    }
    line(ctx, [shoulder, elbow, hand], INK, 6);
    line(ctx, [[elbow[0] + 1, elbow[1]], [hand[0] - 2, hand[1]]], color, 4);
    circle(ctx, hand[0], hand[1], 3.5, PAPER, INK, 1.5);

    if (casting) {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      circle(ctx, hand[0] + 8, hand[1], 16, color);
      ctx.globalAlpha = 0.9;
      elementGlyph(ctx, fighter.element, hand[0] + 8, hand[1], 9, color, 2.5);
      ctx.restore();
    } else if (attacking && !windingUp && !throwing) {
      ctx.save();
      ctx.globalAlpha *= 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = fighter.weapon ? 5 : 4;
      ctx.beginPath();
      ctx.arc(kick ? 9 : 18, kick ? -31 : -40, fighter.weapon ? 49 : kick ? 42 : 30, kick ? -0.75 : -1.05, kick ? 0.5 : 0.85);
      ctx.stroke();
      ctx.globalAlpha *= 0.6;
      ctx.strokeStyle = '#fffbee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(kick ? 9 : 18, kick ? -31 : -40, fighter.weapon ? 54 : kick ? 47 : 35, -0.7, 0.5);
      ctx.stroke();
      ctx.restore();
    }
    if (isBoss) {
      polygon(ctx, [[head[0] - 7, head[1] - 14], [head[0] - 10, head[1] - 21], [head[0] - 3, head[1] - 18], [head[0] + 1, head[1] - 24], [head[0] + 5, head[1] - 18], [head[0] + 11, head[1] - 21], [head[0] + 8, head[1] - 14]], '#e8bf68', INK, 1.5);
    }
    ctx.restore();

    if (stunned) {
      ctx.save();
      ctx.fillStyle = '#dfab4d';
      for (let i = 0; i < 3; i += 1) {
        const angle = time * 4 + i * 2.1;
        const x = fighter.x + Math.cos(angle) * 17 * scale;
        const y = fighter.y - h - 7 + Math.sin(angle) * 5;
        polygon(ctx, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], '#d6a047');
      }
      ctx.restore();
    }
    this.drawFighterHealth(fighter, h);
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

  drawProjectile(projectile, time) {
    const ctx = this.ctx;
    const r = projectile.r || 9;
    const color = elementColor(projectile.element);
    const angle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);
    if (projectile.kind === 'weapon') {
      ctx.rotate(time * (projectile.weapon === 'spear' ? 0 : 9));
      this.drawHeldWeapon(projectile.weapon || 'staff', [-23, 0], [23, 0]);
      ctx.restore();
      return;
    }
    ctx.globalAlpha = 0.16;
    circle(ctx, 0, 0, r * 2.2, color);
    ctx.globalAlpha = 1;
    if (projectile.element === 'earth') {
      ctx.rotate(time * 5);
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

  drawParticle(particle) {
    if (particle.kind === 'ring' || particle.kind === 'shockwave') {
      this.drawEffect(particle);
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

  drawEffect(effect) {
    const ctx = this.ctx;
    const remaining = Math.min(1, Math.max(0, effect.life / (effect.maxLife || 0.6)));
    const radius = effect.r || effect.radius || 80;
    const expansion = radius * (0.25 + (1 - remaining) * 0.75);
    ctx.save();
    ctx.globalAlpha = remaining * 0.13;
    circle(ctx, effect.x, effect.y, expansion, effect.color || COLORS.air);
    ctx.globalAlpha = remaining * 0.85;
    ctx.strokeStyle = effect.color || COLORS.air;
    ctx.lineWidth = remaining * 5 + 1;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, expansion, effect.kind === 'shockwave' ? expansion * 0.42 : expansion, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = remaining * 0.5;
    circle(ctx, effect.x, effect.y, expansion * 0.8, null, '#fffbea', 2);
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
