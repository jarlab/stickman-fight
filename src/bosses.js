import { ELEMENTS } from './data.js';
import { clamp } from './physics.js';

// Authored encounters built on LF2's readable commitment/recovery rhythm.
// The named phases and fixed warning geometry are original Fourfold rules.
export const BOSSES = {
  air: { name: 'Zephyr, the Unbound', phases: ['Circling wind', 'Eye of the storm'],
    moves: ['wind-lane', 'gale-counter', 'cyclone-ring'] },
  water: { name: 'Neris, the Deep Current', phases: ['Still water', 'Rising tide'],
    moves: ['tide-counter', 'ice-lance', 'tidal-pools'] },
  earth: { name: 'Boros, the Mountain', phases: ['Stone stance', 'Fault awakened'],
    moves: ['stone-quake', 'stone-columns', 'faultline'] },
  fire: { name: 'Cinder, the Blazing Fist', phases: ['Kindled fury', 'Wildfire'],
    moves: ['flame-rush', 'flame-sweep', 'triple-eruption'] },
};

const MOVES = {
  'wind-lane': { name: 'Cutting wind', hint: 'STEP OUT OF THE LANE', windup: .65, recovery: .8, cost: 24 },
  'gale-counter': { name: 'Empty palm', hint: 'JUMP THE GUST', windup: .55, recovery: .85, cost: 24 },
  'cyclone-ring': { name: 'Eye of the storm', hint: 'MOVE BETWEEN THE CYCLONES', windup: .9, recovery: 1, cost: 36 },
  'tide-counter': { name: 'Returning tide', hint: 'JUMP THE PULL · FLANK THE GUARD', windup: .7, recovery: .85, cost: 24 },
  'ice-lance': { name: 'Piercing current', hint: 'STEP OUT OF THE LANE', windup: .8, recovery: .85, cost: 26 },
  'tidal-pools': { name: 'Rising tide', hint: 'CHANGE LANES · JUMP THE POOLS', windup: .9, recovery: 1, cost: 36 },
  'stone-quake': { name: 'Mountain stance', hint: 'JUMP THE QUAKE', windup: .8, recovery: 1.05, cost: 28 },
  'stone-columns': { name: 'Stone pillars', hint: 'LEAVE THE MARKED GROUND', windup: .95, recovery: 1, cost: 28 },
  faultline: { name: 'Fault awakened', hint: 'STEP BETWEEN THE FRACTURES', windup: 1, recovery: 1.1, cost: 38 },
  'flame-rush': { name: 'Blazing charge', hint: 'SIDESTEP THE CHARGE', windup: .7, recovery: .85, cost: 24 },
  'flame-sweep': { name: 'Dragon sweep', hint: 'JUMP THE FLAME', windup: .65, recovery: .9, cost: 26 },
  'triple-eruption': { name: 'Wildfire', hint: 'LEAVE THE THREE MARKS', windup: .9, recovery: 1.1, cost: 36 },
};

const living = f => f && !f.dead && f.hp > 0;
const unavailable = e => !e.grounded || e.hitLag > 0 || e.stun > 0 || e.frozen > 0 ||
  e.knockdown > 0 || e.grabbedBy != null || e.grabTarget != null || e.thrown || e.recoveryRoll;

export function isCommitted(e, state) {
  return !!e.bossAction || (state.bossHazards ?? []).some(h => h.ownerId === e.id && h.life > 0);
}

export class BossDirector {
  constructor() { this.nextId = 1; }

  updatePhase(game, e) {
    if (e.type !== 'boss' || !living(e) || e.bossPhase >= 2 || e.hp > e.maxHp * .5 ||
        unavailable(e) || e.action || isCommitted(e, game.state)) return false;
    const capacity = game.enemyAI.capacity(game);
    if (game.enemyAI.occupied(game) >= capacity) return false;
    this.cancel(game, e);
    e.bossPhase = 2;
    e.buffer = null;
    e.action = null;
    e.bossAction = { name: BOSSES[e.element].phases[1], move: 'transition', stage: 'transition',
      t: 0, windup: .9, activeUntil: .9, duration: .9 };
    e.bossMoves = 0;
    e.bossMoveAfter = game.state.time + 1.15;
    e.guard = e.armor = false;
    e.vx = e.vDepth = 0;
    game.banner(`${BOSSES[e.element].name} · ${BOSSES[e.element].phases[1]}`);
    game.effect(e.x, e.depth - 45, ELEMENTS[e.element].color, 18);
    return true;
  }

  tryStart(game, e) {
    const s = game.state, target = s.player;
    if (e.type !== 'boss' || !living(e) || !living(target) || unavailable(e) ||
        e.action || e.buffer || isCommitted(e, s) || (e.bossMoveAfter ?? 0) > s.time ||
        target.knockdown > 0 || target.grabbedBy != null || target.thrown || target.recoveryRoll) return false;
    const distance = Math.abs(target.x - e.x), lane = Math.abs(target.depth - e.depth);
    if (distance > 560 || lane > 105) return false;
    const signature = e.bossPhase === 2 && (e.bossMoves ?? 0) % 3 === 0;
    let move;
    if (signature) move = BOSSES[e.element].moves[2];
    else if (e.element === 'air') move = distance < 170 && target.action?.kind === 'melee' ? 'gale-counter' : 'wind-lane';
    else if (e.element === 'water') move = distance < 180 ? 'tide-counter' : 'ice-lance';
    else if (e.element === 'earth') move = distance < 200 && lane < 65 ? 'stone-quake' : 'stone-columns';
    else move = distance > 150 ? 'flame-rush' : 'flame-sweep';
    if (['wind-lane', 'ice-lance', 'flame-rush'].includes(move) && lane > 32) return false;
    const spec = MOVES[move];
    if (e.energy < spec.cost) return false;
    const adjustment = { easy: .18, normal: 0, hard: -.05, crazy: -.1 }[s.settings.difficulty];
    const windup = Math.max(.5, spec.windup + adjustment);
    const direction = Math.sign(target.x - e.x) || e.facing;
    const action = { name: spec.name, move, hint: spec.hint, stage: 'windup', t: 0, windup,
      activeUntil: 0, duration: 0, originX: e.x, originDepth: e.depth, direction,
      armor: e.element === 'earth' || move === 'flame-sweep',
      poise: move === 'flame-sweep' ? 1 : null, poiseHits: 0 };
    const hazards = this.pattern(game, e, target, action);
    action.activeUntil = Math.max(...hazards.map(h => h.delay + h.life));
    action.duration = action.activeUntil + spec.recovery;
    e.bossAction = action;
    e.bossMoves = (e.bossMoves ?? 0) + 1;
    const respite = e.bossPhase === 2 ? 1.05 : 1.6;
    e.bossMoveAfter = s.time + action.duration + respite * (s.settings.difficulty === 'crazy' ? .7 : 1);
    e.energy -= spec.cost;
    e.facing = direction;
    e.vx = e.vDepth = 0;
    e.guard = e.running = false;
    e.tell = windup;
    e.attackKind = 'boss';
    e.armor = action.armor;
    (s.bossHazards ??= []).push(...hazards);
    return true;
  }

  pattern(game, e, target, action) {
    const { move, direction, windup } = action;
    const make = (x, depth, rx, rd, extra = {}) => ({ id: this.nextId++, ownerId: e.id,
      element: e.element, move, name: action.name, hint: action.hint,
      x: clamp(x, 45, 1235), depth: clamp(depth, 405, 640), rx, rd,
      shape: 'ellipse', height: 40, delay: windup, warningTime: windup,
      life: .22, maxLife: .22, hitIds: [], released: false, direction,
      damage: 22, knockback: 380, ...extra });
    let hazards;
    if (move === 'flame-rush') {
      action.destinationX = clamp(e.x + direction * clamp(Math.abs(target.x - e.x) + 65, 180, 430), 65, 1215);
      const length = Math.abs(action.destinationX - e.x);
      hazards = [make((e.x + action.destinationX) / 2, e.depth, length / 2 + 30, 26,
        { shape: 'lane', height: 105, damage: 24, knockback: 520 })];
    } else if (move === 'flame-sweep') {
      hazards = [make(e.x + direction * 90, e.depth, 175, 65, { height: 36, damage: 23 })];
    } else if (move === 'triple-eruption') {
      hazards = [-1, 0, 1].map((offset, index) => make(target.x + offset * 140, target.depth,
        65, 46, { height: 125, delay: windup + index * .28, damage: 23 }));
    } else if (move === 'wind-lane' || move === 'ice-lance') {
      hazards = [make(e.x + direction * 220, e.depth, 220, 25,
        { shape: 'lane', height: 100, damage: move === 'wind-lane' ? 19 : 23,
          knockback: move === 'wind-lane' ? 620 : 330 })];
    } else if (move === 'gale-counter') {
      action.destinationX = clamp(e.x - direction * 115, 65, 1215);
      action.travelDuringWindup = true;
      action.travelDuration = .14;
      hazards = [make(e.x, e.depth, 155, 70, { height: 42, damage: 20, knockback: 600 })];
    } else if (move === 'cyclone-ring') {
      if (Math.abs(target.x - e.x) < 180) {
        action.destinationX = clamp(e.x - direction * 135, 65, 1215);
        action.travelDuringWindup = true;
        action.travelDuration = .16;
      }
      hazards = [-1, 0, 1].map((offset, index) => make(target.x + offset * 165,
        target.depth + (index % 2 ? -55 : 35), 58, 38,
        { height: 125, delay: windup + index * .25, damage: 20, knockback: 500 }));
    } else if (move === 'tide-counter') {
      action.destinationX = clamp(e.x - direction * 75, 65, 1215);
      action.travelDuringWindup = true;
      hazards = [make(e.x + direction * 65, e.depth, 165, 68,
        { height: 36, damage: 20, knockback: -230 })];
    } else if (move === 'tidal-pools') {
      hazards = [0, 1, 2].map(index => make(target.x + (index - 1) * 125,
        clamp(target.depth + (index % 2 ? -65 : 45), 430, 615), 95, 34,
        { height: 35, delay: windup + index * .34, damage: 20, knockback: -180 }));
    } else if (move === 'stone-quake') {
      hazards = [make(e.x, e.depth, 220, 85, { height: 35, damage: 25, knockback: 520 })];
    } else if (move === 'stone-columns') {
      hazards = [-1, 1].map((side, index) => make(target.x + side * 65, target.depth,
        48, 42, { height: 135, delay: windup + index * .22, damage: 24, knockback: 410 }));
    } else {
      hazards = [0, 1, 2, 3].map(index => make(e.x + direction * (80 + index * 105), e.depth,
        42, 65, { height: 110, delay: windup + index * .22, damage: 23, knockback: 420 }));
    }
    for (const hazard of hazards) hazard.warningTime = hazard.delay;
    return hazards;
  }

  updateFighter(game, e, dt) {
    const action = e.bossAction;
    if (!action) return false;
    if (e.hitLag > 0) return true;
    if (!living(e) || !living(game.state.player) || unavailable(e)) {
      this.cancel(game, e);
      return false;
    }
    action.t += dt;
    e.buffer = null;
    e.vx = e.vDepth = 0;
    e.running = false;
    e.guard = action.move === 'tide-counter' && action.t < action.windup;
    e.armor = !!action.armor && action.t < action.windup &&
      (action.poise == null || action.poiseHits < action.poise);
    e.tell = Math.max(0, action.windup - action.t);
    if (action.stage !== 'transition') {
      action.stage = action.t < action.windup ? 'windup' : action.t < action.activeUntil ? 'active' : 'recovery';
      if (action.destinationX != null) {
        const progress = action.travelDuringWindup ? action.t / (action.travelDuration ?? action.windup) : (action.t - action.windup) / .22;
        e.x = action.originX + (action.destinationX - action.originX) * clamp(progress, 0, 1);
      }
    }
    if (action.t >= action.duration) {
      e.bossAction = null;
      e.tell = 0;
      e.guard = e.armor = false;
      e.aiTimer = Math.max(e.aiTimer, .18);
    }
    return true;
  }

  updateHazards(game, dt) {
    const s = game.state, player = s.player;
    for (const hazard of s.bossHazards ?? []) {
      const owner = s.enemies.find(e => e.id === hazard.ownerId);
      if (!living(owner) || !living(player)) { hazard.life = 0; continue; }
      if (!hazard.released && owner.hitLag > 0) continue;
      let activeDt = dt;
      if (hazard.delay > 0) {
        hazard.delay -= dt;
        if (hazard.delay > 0) continue;
        activeDt = -hazard.delay;
        hazard.delay = 0;
        hazard.released = true;
        game.effect(hazard.x, hazard.depth - Math.min(45, hazard.height / 2), ELEMENTS[hazard.element].color, 12);
      }
      hazard.life -= activeDt;
      if (hazard.life <= 0 || hazard.hitIds.includes(player.id) || player.z > hazard.height ||
          player.grabbedBy != null || player.thrown || player.knockdown > 0) continue;
      const dx = Math.abs(player.x - hazard.x) / (hazard.rx + player.w / 2);
      const depth = Math.abs(player.depth - hazard.depth) / hazard.rd;
      if (hazard.shape === 'lane' ? dx > 1 || depth > 1 : dx * dx + depth * depth > 1) continue;
      // A single wave contacts a fighter once. The normal damage path owns
      // guard, parry, invulnerability, health scaling and recovery protection.
      hazard.hitIds.push(player.id);
      game.damage(player, hazard.damage, hazard.direction, owner,
        { element: hazard.element, knockback: hazard.knockback, heavy: true, stun: .3, fall: 35 });
    }
    s.bossHazards = (s.bossHazards ?? []).filter(h => h.life > 0);
  }

  cancel(game, e) {
    if (e.bossAction) {
      e.bossAction = null;
      e.tell = 0;
      e.armor = e.guard = false;
    }
    game.state.bossHazards = (game.state.bossHazards ?? []).filter(h => h.ownerId !== e.id || h.released);
  }
}
