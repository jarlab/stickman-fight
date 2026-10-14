import { COMBAT, ELEMENTS } from './data.js';
import { clamp } from './physics.js';

// LF2-informed individual decisions; formation, turns and detours are our
// original adaptations for readable crowds in this smaller arena.
const LEVELS = {
  easy: { attackers: 1, reaction: .25, attackChance: .7, guardChance: .06 },
  normal: { attackers: 2, reaction: .17, attackChance: .84, guardChance: .18 },
  hard: { attackers: 3, reaction: .11, attackChance: .96, guardChance: .32 },
};
const STYLES = {
  air: { range: 72, shotRange: 380, shotChance: .16, retreat: .35 },
  water: { range: 84, shotRange: 460, shotChance: .28, retreat: .65 },
  earth: { range: 66, shotRange: 310, shotChance: .07, retreat: .7 },
  fire: { range: 55, shotRange: 300, shotChance: .09, retreat: .3 },
};
const alive = f => !f.dead && f.hp > 0;
const disabled = f => f.stun > 0 || f.knockdown > 0 || f.frozen > 0 || f.grabbedBy != null;
const offensive = f => ['melee', 'special', 'burst', 'throw', 'grabPunch', 'bodyThrow'].includes(f.action?.kind);
const pending = f => ['attack', 'special', 'burst', 'throw', 'interact'].includes(f.buffer?.kind);
const committed = f => f.grabTarget != null || offensive(f) || pending(f);
const grabOpening = f => alive(f) && f.grabbedBy == null && f.grabTarget == null &&
  f.grounded && f.z <= 8 && f.knockdown <= 0 && f.frozen <= 0 && f.stun > 0 && f.hitType === 'dizzy';
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.depth - b.depth) * 1.4;

export class EnemyAI {
  constructor() {
    this.cornerSide = 0;
  }

  update(game, dt) {
    const { state: s } = game;
    const foes = s.enemies.filter(e => alive(e) && e.type !== 'dummy');
    const level = LEVELS[s.settings.difficulty];
    const p = s.player;
    const corner = p.x < 115 ? 1 : p.x > 1165 ? -1 : 0;
    let rebalance = !!this.cornerSide && !corner;
    this.cornerSide = corner;
    for (const e of foes) {
      if (!e.ai) {
        const side = e.x < p.x ? -1 : 1;
        rebalance = true;
        e.ai = { side, targetId: p.id, think: level.reaction * (.8 + game.random() * .4),
          lastAttack: -1, lastTurn: -1, permitSince: null, rotationUntil: 0, guardUntil: 0, guardAfter: 0,
          shotAfter: 0, mustClose: false, route: 0, detourUntil: 0,
          detour: 0, hadAction: false, rank: 0, permit: false };
      }
      const ai = e.ai;
      ai.think = Math.max(0, ai.think - dt);
      // There is one human target. Keep it while valid; do not pursue a corpse.
      ai.targetId = alive(p) ? p.id : null;
      if ((!alive(p) || p.knockdown > 0 || p.grabbedBy != null || p.thrown) &&
          e.grabTarget !== p.id && pending(e)) e.buffer = null;
      if (e.grabTarget == null) ai.grip = null;
      if (corner) { ai.side = corner; ai.route = 0; }
      if (ai.permitSince != null && s.time - ai.permitSince > 4 && !committed(e)) {
        ai.lastTurn = s.time;
        ai.rotationUntil = s.time + .6;
      }
      if (ai.hadAction && !e.action && !e.buffer) {
        ai.rotationUntil = s.time + STYLES[e.element].retreat;
      }
      ai.hadAction = !!e.action;
      if (Math.abs(p.x - e.x) < 110 && Math.abs(p.depth - e.depth) < 30) ai.mustClose = false;
      ai.permit = committed(e);
    }
    if (rebalance && !corner) {
      for (const side of [-1, 1]) {
        const members = foes.filter(e => e.ai.side === side);
        members.filter(e => !committed(e)).sort((a, b) => distance(b, p) - distance(a, p))
          .slice(0, Math.max(0, members.length - Math.ceil(foes.length / 2)))
          .forEach(e => { e.ai.side = -side; e.ai.route = 0; });
      }
    }
    const occupied = foes.filter(committed).length;
    const waiting = foes.filter(e => !committed(e) && !disabled(e) &&
      (e.ai.rotationUntil <= s.time || (!e.weapon && e.grounded && grabOpening(p))))
      .sort((a, b) => a.ai.lastTurn - b.ai.lastTurn || distance(a, p) - distance(b, p) || a.id - b.id);
    for (const e of waiting.slice(0, Math.max(0, level.attackers - occupied))) e.ai.permit = true;
    for (const e of foes) e.ai.permitSince = e.ai.permit ? (e.ai.permitSince ?? s.time) : null;
    // Stable sides, then the oldest waiting fighter gets the nearest position.
    for (const side of [-1, 1]) {
      foes.filter(e => e.ai.side === side).sort((a, b) => Number(b.ai.permit) - Number(a.ai.permit) ||
        a.ai.lastTurn - b.ai.lastTurn || a.id - b.id).forEach((e, rank) => { e.ai.rank = rank; });
    }
  }

  clearShot(game, e, target) {
    const low = Math.min(e.x, target.x), high = Math.max(e.x, target.x);
    return !game.state.enemies.some(ally => ally !== e && alive(ally) && ally.knockdown <= 0 &&
      ally.x > low + 12 && ally.x < high - 12 && Math.abs(ally.depth - e.depth) < 34 &&
      Math.abs(ally.z - e.z) < 65);
  }

  input(game, e) {
    const { state: s } = game;
    const p = s.player, ai = e.ai;
    if (!ai || !ai.targetId || disabled(e)) return {};
    const level = LEVELS[s.settings.difficulty], style = STYLES[e.element];
    const dx = p.x - e.x, lane = p.depth - e.depth;
    const absX = Math.abs(dx), absLane = Math.abs(lane);
    const facing = dx >= 0 ? 1 : -1;
    const boss = e.type === 'boss';
    const input = {};
    if (e.grabTarget != null) return this.gripInput(game, e, p, level);
    const targetUp = alive(p) && p.knockdown <= 0 && p.grabbedBy == null && !p.thrown;
    // The same opening that permits a player grab gives an unarmed enemy a
    // reason to stop its combo and step in. Catching still waits out hit immunity.
    const canApproachGrab = !e.weapon && e.grounded && e.z <= 8 && grabOpening(p);
    if (e.action) {
      // A late follow-up is committed to the existing facing and lane.
      if (targetUp && !canApproachGrab && e.action.kind === 'melee' && e.action.connected && !e.action.followupQueued &&
          e.comboIndex !== 3 && e.comboCount < (s.settings.difficulty === 'easy' && !boss ? 2 : 4) &&
          e.action.t >= e.action.duration - .1 && absLane < 26 && dx * e.facing > 0 && absX < 140 &&
          Math.abs(p.z - e.z) < 70) {
        input.attack = true;
        input.attackDirection = e.facing;
        e.action.followupQueued = true;
        e.aiTimer = .65 * game.difficulty.aggression;
      }
      // A confirmed dizzy hit can be followed with a small approach during its
      // recovery. Keep the committed facing and finish the whole action before
      // catching; this makes a grab reachable from normal jab spacing.
      if (canApproachGrab && e.action.kind === 'melee' && e.action.connected &&
          e.action.t >= e.action.activeUntil && dx * e.facing > 0) {
        input.left = absX > 44 && e.facing < 0;
        input.right = absX > 44 && e.facing > 0;
        input.up = lane < -4;
        input.down = lane > 4;
      }
      return input;
    }

    const rotating = ai.rotationUntil > s.time;
    const front = ai.permit && (!rotating || canApproachGrab) && targetUp;
    const radius = front && canApproachGrab ? 40 :
      style.range + (boss ? 18 : 0) + (front ? 0 : 68 + ai.rank * 40);
    let goalX = clamp(p.x + ai.side * radius, 50, 1230);
    let goalDepth = clamp(p.depth + (front ? 0 : (ai.rank % 2 ? 1 : -1) * (35 + ai.rank * 12)), 405, 640);
    // Crossing the target's front is done in a separate lane, not through its body.
    if ((e.x - p.x) * ai.side < -18 && !ai.route) {
      ai.route = p.depth > 574 ? -(ai.side > 0 ? 92 : 152) :
        p.depth < 471 ? (ai.side > 0 ? 92 : 152) : ai.side * 100;
    }
    if (ai.route) {
      goalDepth = clamp(p.depth + ai.route, 405, 640);
      if (absLane < 48 && (e.x - p.x) * ai.side < 45) goalX = e.x;
      if ((e.x - p.x) * ai.side > radius - 12) ai.route = 0;
    }
    // Teammates queue with space and briefly move around a blocked approach.
    const moveSign = Math.sign(goalX - e.x);
    const blocker = game.state.enemies.find(ally => ally !== e && alive(ally) &&
      (ally.x - e.x) * moveSign > 0 && Math.abs(ally.x - e.x) < 65 && Math.abs(ally.depth - e.depth) < 34);
    if (blocker && ai.detourUntil <= s.time &&
        (e.id > blocker.id || blocker.action || Math.abs(blocker.vx) < 20)) {
      const away = Math.sign(e.depth - blocker.depth) || (e.id > blocker.id ? 1 : -1);
      ai.detour = clamp(e.depth + away * 52, 405, 640);
      if (Math.abs(ai.detour - e.depth) < 30) ai.detour = clamp(e.depth - away * 52, 405, 640);
      ai.detourUntil = s.time + .7;
    }
    if (ai.detourUntil > s.time) goalDepth = ai.detour;
    const closingGrab = front && canApproachGrab;
    const projectedX = e.x + e.vx * (closingGrab ? .04 : .1);
    const projectedDepth = e.depth + e.vDepth * (closingGrab ? .04 : .1);
    // Ordinary formation tolerance is too wide for a catch: it settles exactly
    // at the grab boundary and can consume the remaining dizzy window.
    const toleranceX = closingGrab ? 3 : 10, toleranceDepth = closingGrab ? 3 : 7;
    input.left = goalX - projectedX < -toleranceX;
    input.right = goalX - projectedX > toleranceX;
    input.up = goalDepth - projectedDepth < -toleranceDepth;
    input.down = goalDepth - projectedDepth > toleranceDepth;
    input.run = Math.abs(goalX - e.x) > (e.element === 'fire' ? 180 : 300) && Math.abs(goalDepth - e.depth) < 30;
    if (ai.guardUntil > s.time) return { guard: true };
    if (ai.think > 0) return input;
    ai.think = level.reaction * (.8 + game.random() * .4);
    if (!targetUp || ai.route || (rotating && !canApproachGrab)) return input;

    if (front && canApproachGrab && p.invulnerable <= 0 && absX <= 50 && absLane < 15 &&
        !e.guard && this.occupied(game) < level.attackers) {
      e.facing = facing;
      ai.lastTurn = s.time;
      e.aiTimer = .5;
      return { interact: true, attackDirection: facing };
    }
    // Finish the approach instead of automatically spending the opening on a
    // fourth strike. A player can still recover or be protected by another hit.
    if (front && canApproachGrab) return input;

    if (p.action?.kind === 'melee' && absX < 125 && absLane < 30 && ai.guardAfter <= s.time &&
        p.action.t > .06 && e.facing === facing && p.facing === -facing && game.random() < level.guardChance + (e.element === 'water' ? .2 : 0)) {
      ai.guardUntil = s.time + .24;
      ai.guardAfter = s.time + 1.2;
      e.facing = facing;
      return { guard: true };
    }
    if (front && p.z > 75 && absX < 145 && absLane < 30 && e.grounded && e.jumpTimer <= 0 &&
        (e.element === 'air' || game.random() < .3)) input.jump = true;
    if (!front || e.aiTimer > 0 || this.occupied(game) >= level.attackers) return input;
    const spec = ELEMENTS[e.element];
    const ready = kind => e.cooldowns[kind] <= 0 && e.energy >= spec[`${kind}Cost`];
    let attack;
    if (e.element === 'water' && e.hp < e.maxHp * .55 && ready('burst') && absX < 280) attack = 'burst';
    else if (boss && absX < 210 && absLane < 36 && Math.abs(p.z - e.z) < 80 && ready('burst') &&
        game.random() < .35) attack = 'burst';
    else if (absLane < 24 && Math.abs(p.z - e.z) < 68 && e.cooldowns.attack <= .03 &&
        Math.abs(dx - e.vx * .067) < COMBAT[e.element].steps[0].reach + (boss ? 20 : 5) &&
        game.random() < level.attackChance) attack = 'attack';
    else if (absX > 145 && absX < style.shotRange && absLane < 22 && Math.abs(p.z - e.z) < 55 &&
        !ai.mustClose && s.time >= ai.shotAfter && ready('special') && this.clearShot(game, e, p) &&
        game.random() < style.shotChance) attack = e.weapon ? 'throw' : 'special';
    if (!attack) return input;
    input[attack] = true;
    input.attackDirection = facing;
    // Stop before striking; direction is carried by the attack, not a chase step.
    input.left = input.right = input.up = input.down = input.run = false;
    ai.lastAttack = ai.lastTurn = s.time;
    e.aiTimer = (.55 + game.random() * .55) * game.difficulty.aggression * (e.bossPhase === 2 ? .7 : 1);

    if (attack === 'special' || attack === 'throw') { ai.shotAfter = s.time + 3; ai.mustClose = true; }
    return input;
  }

  gripInput(game, e, target, level) {
    const { time } = game.state;
    if (e.grabTarget !== target.id || target.grabbedBy !== e.id || !alive(target)) return {};
    const ai = e.ai;
    if (!ai.grip || ai.grip.targetId !== target.id) {
      ai.grip = { targetId: target.id, nextAt: time + level.reaction + .14,
        punched: false, throwRequested: false };
    }
    if (e.action || e.buffer || time < ai.grip.nextAt) return {};
    if (!ai.grip.punched) {
      ai.grip.punched = true;
      ai.grip.nextAt = time + .6;
      return { attack: true, attackDirection: e.facing };
    }
    if (!ai.grip.throwRequested) {
      ai.grip.throwRequested = true;
      return { throw: true, attackDirection: e.facing };
    }
    return {};
  }

  occupied(game) {
    return game.state.enemies.filter(e => alive(e) && committed(e)).length;
  }
}
