import { COMBAT, ELEMENTS } from './data.js';
import { clamp } from './physics.js';
import { isCommitted as bossCommitted } from './bosses.js';

// LF2-informed individual decisions; formation, turns and detours are our
// original adaptations for readable crowds in this smaller arena.
const LEVELS = {
  easy: { attackers: 1, reaction: .25, attackChance: .7, guardChance: .06, defense: .18, lead: 0, tempo: 1 },
  normal: { attackers: 2, reaction: .17, attackChance: .92, guardChance: .34, defense: .8, lead: .12, tempo: .65 },
  hard: { attackers: 3, reaction: .11, attackChance: 1, guardChance: .55, defense: 1, lead: .18, tempo: .43 },
};
const STYLES = {
  air: { range: 108, shotRange: 380, shotChance: .16, retreat: .55, runAt: 350 },
  water: { range: 84, shotRange: 460, shotChance: .28, retreat: .5, runAt: 280 },
  earth: { range: 66, shotRange: 310, shotChance: .07, retreat: .35, runAt: 320 },
  fire: { range: 55, shotRange: 300, shotChance: .09, retreat: .16, runAt: 110 },
};
const alive = f => !f.dead && f.hp > 0;
const disabled = f => f.stun > 0 || f.knockdown > 0 || f.frozen > 0 || f.grabbedBy != null;
const offensive = f => ['melee', 'special', 'burst', 'throw', 'grabPunch', 'bodyThrow'].includes(f.action?.kind);
const pending = f => ['attack', 'special', 'burst', 'throw', 'interact'].includes(f.buffer?.kind);
const committed = f => f.grabTarget != null || offensive(f) || pending(f) || f.ai?.airChasing || f.ai?.bossCommitted;
const grabOpening = f => alive(f) && f.grabbedBy == null && f.grabTarget == null &&
  f.grounded && f.z <= 8 && f.knockdown <= 0 && f.frozen <= 0 && f.stun > 0 && f.hitType === 'dizzy';
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.depth - b.depth) * 1.4;

export class EnemyAI {
  constructor() {
    this.cornerSide = 0;
    this.projectileSeen = new WeakMap();
    this.observedActions = new WeakSet();
    this.recentAttacks = [];
    this.guardSince = null;
  }

  update(game, dt) {
    const { state: s } = game;
    const foes = s.enemies.filter(e => alive(e) && e.type !== 'dummy');
    const level = LEVELS[s.settings.difficulty];
    const p = s.player;
    // Remember completed, visible commitments rather than reading player keys.
    // Repeated casting creates a short-lived reason to flank and close distance.
    if (p.action && p.action.t >= level.reaction && !this.observedActions.has(p.action)) {
      this.observedActions.add(p.action);
      this.recentAttacks.push({ kind: p.action.kind, time: s.time });
    }
    this.recentAttacks = this.recentAttacks.filter(a => s.time - a.time < 4);
    const rangedPressure = this.recentAttacks.filter(a => a.kind === 'special' || a.kind === 'throw').length >= 2;
    const meleePressure = this.recentAttacks.filter(a => a.kind === 'melee').length >= 2;
    this.guardSince = p.guard ? (this.guardSince ?? s.time) : null;
    for (const shot of s.projectiles) {
      if (!this.projectileSeen.has(shot)) this.projectileSeen.set(shot, s.time);
    }
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
          detour: 0, hadAction: false, rank: 0, permit: false,
          evadeUntil: 0, evadeDirection: 0, evadeX: 0, defenseAfter: 0, airChaseUntil: 0,
          probeAfter: s.time + 1.2, probeUntil: 0, counterUntil: 0,
          motion: { vx: p.vx, vDepth: p.vDepth }, observeAt: s.time + level.reaction };
      }
      const ai = e.ai;
      ai.bossCommitted = e.type === 'boss' && bossCommitted(e, s);
      ai.rangedPressure = s.settings.difficulty !== 'easy' && rangedPressure;
      ai.meleePressure = s.settings.difficulty !== 'easy' && meleePressure;
      ai.think = Math.max(0, ai.think - dt);
      ai.airChasing = ai.airChaseUntil > s.time && alive(p) && p.z > 20 &&
        p.knockdown <= 0 && !p.thrown && p.grabbedBy == null && !disabled(e) &&
        (!e.grounded || e.action?.launched);
      // Sample visible movement, not held keys. Bounded velocity lead makes a
      // moving target interceptable without knowing the next player command.
      if (s.time >= ai.observeAt) {
        ai.motion = { vx: p.vx, vDepth: p.vDepth };
        ai.observeAt = s.time + level.reaction;
      }
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
        ai.rotationUntil = s.time + STYLES[e.element].retreat * level.tempo;
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
      .sort((a, b) => {
        // Expected time to engage plus bounded waiting credit. Far-away foes
        // no longer reserve every slot while a nearby fighter watches.
        const priority = e => distance(e, p) / 220 - Math.min(4, s.time - e.ai.lastTurn) * .45;
        return priority(a) - priority(b) || a.id - b.id;
      });
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
    if (!ai || !ai.targetId) return {};
    const level = LEVELS[s.settings.difficulty], style = STYLES[e.element];
    const dx = p.x - e.x, lane = p.depth - e.depth;
    const absX = Math.abs(dx), absLane = Math.abs(lane);
    const facing = dx >= 0 ? 1 : -1;
    const boss = e.type === 'boss';
    const input = {};
    if (disabled(e)) {
      if (s.settings.difficulty !== 'easy' && e.knockdown > 0 && e.grounded &&
          !e.thrown && e.frozen <= 0 && e.grabbedBy == null && e.downTime > level.reaction + .1) {
        return { dash: true, attackDirection: -facing,
          attackDepthDirection: e.depth > 550 ? -1 : 1 };
      }
      return input;
    }
    if (e.grabTarget != null) return this.gripInput(game, e, p, level);
    if (e.bossAction || ai.bossCommitted) return input;
    const targetUp = alive(p) && p.knockdown <= 0 && p.grabbedBy == null && !p.thrown;
    // The same opening that permits a player grab gives an unarmed enemy a
    // reason to stop its combo and step in. Catching still waits out hit immunity.
    const canApproachGrab = !e.weapon && e.grounded && e.z <= 8 && grabOpening(p);
    if (e.action) {
      if (targetUp && e.action.launched &&
          e.action.t >= e.action.chainAt && !e.action.followupQueued &&
          absX < 155 && absLane < 30 && p.z > 15 && e.grounded &&
          s.settings.difficulty !== 'easy') {
        e.action.followupQueued = true;
        ai.airChaseUntil = s.time + 1.2;
        return { jump: true, attackDirection: e.facing };
      }
      // A late follow-up is committed to the existing facing and lane.
      if (targetUp && !canApproachGrab && e.action.kind === 'melee' && e.action.connected && !e.action.followupQueued &&
          !(e.grounded && !p.grounded && p.juggle > 0) &&
          (e.action.variant === 'aerial' ? e.airChain < COMBAT[e.element].aerial.length :
            e.action.variant !== 'launcher' && e.comboIndex !== 3 && e.comboCount < (s.settings.difficulty === 'easy' && !boss ? 2 : 4)) &&
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
    const front = ai.permit && (!rotating || canApproachGrab || ai.airChasing) && targetUp;
    if (front && e.element === 'air' && s.time >= ai.probeAfter) {
      ai.probeUntil = s.time + .8;
      ai.probeAfter = s.time + 2.2;
    }
    const overextended = p.action?.kind === 'melee' && !p.action.connected &&
      p.action.t > Math.max(p.action.activeUntil, level.reaction);
    const preferredRange = e.element === 'air' && (ai.probeUntil > s.time || overextended) ? 72 : style.range;
    const radius = front && canApproachGrab ? 40 :
      preferredRange + (boss ? 18 : 0) + (front ? 0 : 68 + ai.rank * 40);
    const leadX = canApproachGrab ? 0 : clamp(ai.motion.vx * level.lead, -65, 65);
    const leadDepth = canApproachGrab ? 0 : clamp(ai.motion.vDepth * level.lead, -24, 24);
    let goalX = clamp(p.x + leadX + ai.side * radius, 50, 1230);
    let goalDepth = clamp(p.depth + leadDepth + (front ? 0 : (ai.rank % 2 ? 1 : -1) * (35 + ai.rank * 12)), 405, 640);
    if (front && ai.rangedPressure && absX > 165 && !ai.route) {
      const flank = p.depth > 570 ? -1 : p.depth < 470 ? 1 : (e.id % 2 ? 1 : -1);
      goalDepth = clamp(p.depth + flank * 68, 405, 640);
      goalX = clamp(p.x + leadX + ai.side * 110, 50, 1230);
    }
    if (e.element === 'earth' && rotating && !canApproachGrab && absX < 140 && absLane < 30) goalX = e.x;
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
    const escaping = ai.motion.vx * facing > 120 && absX > 155;
    input.run = Math.abs(goalX - e.x) > ((escaping || ai.rangedPressure) ? 115 : style.runAt) && Math.abs(goalDepth - e.depth) < 30;
    if (ai.guardUntil > s.time) return { guard: true };
    if (ai.evadeUntil > s.time) return { up: ai.evadeDirection < 0, down: ai.evadeDirection > 0,
      left: ai.evadeX < 0, right: ai.evadeX > 0 };
    const defense = this.defenseInput(game, e, level);
    if (defense) return defense;
    if (ai.think > 0) return input;
    ai.think = level.reaction * (.8 + game.random() * .4);
    if (!targetUp || ai.route || (rotating && !canApproachGrab && !ai.airChasing)) return input;

    // A remembered jab rhythm warrants a deliberate defensive beat before the
    // next strike. This is fallible prediction: it also guards if the player
    // stops attacking, and it cannot interrupt our own committed attack.
    if (ai.meleePressure && !canApproachGrab && e.grounded && absX < 130 && absLane < 32 &&
        p.facing === -facing && e.facing === facing && ai.guardAfter <= s.time && e.energy >= 20) {
      ai.guardAfter = s.time + (e.element === 'earth' ? .8 : 1.05);
      ai.counterUntil = s.time + .95;
      if (e.element === 'air') {
        ai.evadeX = -facing;
        ai.evadeDirection = e.depth > 550 ? -1 : 1;
        ai.evadeUntil = s.time + .22;
        return { left: facing > 0, right: facing < 0, up: ai.evadeDirection < 0, down: ai.evadeDirection > 0 };
      }
      ai.guardUntil = s.time + .32;
      return { guard: true };
    }

    // A reserved pursuer can spend its ordinary dash to cut a retreat or close
    // along a flanking lane after repeated ranged attacks. No hidden speed warp.
    if (front && s.settings.difficulty !== 'easy' && !boss && e.grounded &&
        !e.action && e.cooldowns.dash <= 0 && e.energy >= 18 &&
        absX > 210 && absX < 480 && absLane < 90 &&
        (escaping || (ai.rangedPressure && absLane > 38))) {
      return { ...input, dash: true, attackDirection: facing,
        attackDepthDirection: 0 };
    }

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

    const incomingMelee = p.action?.kind === 'melee' &&
      (p.action.t <= p.action.activeUntil || p.action.connected) && p.action.t > level.reaction && p.facing === -facing;
    const approaching = ai.motion.vx * facing < -90 && absX > 85 && absX < 155 && absLane < 30;
    if ((incomingMelee || (e.element === 'earth' && approaching)) &&
        absX < 125 && absLane < 30 && ai.guardAfter <= s.time &&
        e.facing === facing && e.energy >= 15 && game.random() <
        level.guardChance + (e.element === 'water' || e.element === 'earth' ? .25 : e.element === 'fire' ? -.22 : 0)) {
      if (e.element === 'air') {
        ai.evadeX = -facing;
        ai.evadeDirection = e.depth > 550 ? -1 : 1;
        ai.evadeUntil = s.time + .24;
        ai.guardAfter = s.time + .75;
        ai.counterUntil = s.time + .8;
        return { left: facing > 0, right: facing < 0, up: ai.evadeDirection < 0, down: ai.evadeDirection > 0 };
      }
      ai.counterUntil = s.time + (e.element === 'water' ? 1 : .7);
      ai.guardUntil = s.time + .24;
      ai.guardAfter = s.time + (e.element === 'earth' ? .75 : 1.2);
      e.facing = facing;
      return { guard: true };
    }
    const chase = ai.airChaseUntil > s.time && !e.grounded && p.z > 20;
    const whiff = s.settings.difficulty !== 'easy' && p.action?.kind === 'melee' &&
      !p.action.connected && p.action.t > Math.max(p.action.activeUntil, level.reaction);
    const landing = s.settings.difficulty !== 'easy' && !p.grounded && p.vy > 140 && p.z < 60;
    const punish = whiff || landing || chase || ai.counterUntil > s.time;
    if (front && (p.z > 75 || (p.juggle > 0 && p.z > 20)) && p.vy < 180 && absX < 145 && absLane < 30 && e.grounded && e.jumpTimer <= 0 &&
        (e.element === 'air' || (p.stun > 0 && s.settings.difficulty !== 'easy'))) {
      input.jump = true;
      ai.airChaseUntil = s.time + 1.2;
      return input;
    }
    if (!front || (e.aiTimer > 0 && !punish) ||
        this.occupied(game) - Number(!!ai.airChasing) >= level.attackers) return input;
    if (boss && game.bosses.tryStart(game, e)) {
      ai.lastAttack = ai.lastTurn = s.time;
      ai.bossCommitted = true;
      return {};
    }
    const spec = ELEMENTS[e.element];
    const ready = kind => e.cooldowns[kind] <= 0 && e.energy >= spec[`${kind}Cost`];
    // Utility ranking lets the same limited attack slot choose the best visible
    // opportunity. Costs/range remain hard gates; small seeded variation avoids
    // identical fighters making identical decisions at every reconsideration.
    const choices = [];
    const add = (kind, score) => choices.push({ kind, score: score + game.random() * .08 });
    const inReach = absLane < 24 && Math.abs(p.z - e.z) < 68 && e.cooldowns.attack <= .03 &&
      Math.abs(dx - e.vx * .067) < COMBAT[e.element].steps[0].reach + (boss ? 20 : 5);
    if (inReach && (punish || game.random() < level.attackChance)) add('attack', .7 + (punish ? .65 : 0));
    if (inReach && e.grounded && !e.weapon && p.grounded && p.stun <= 0 &&
        s.settings.difficulty !== 'easy' && e.energy >= 8 && e.cooldowns.launcher <= 0 &&
        (whiff || (p.guard && e.element === 'earth'))) add('launcher', 1.25 + (whiff ? .3 : 0));
    if (!boss && e.element === 'water' && e.hp < e.maxHp * .55 && ready('burst') && absX < 280) add('burst', 1.5);
    if (!boss && ['earth', 'fire'].includes(e.element) && this.guardSince != null &&
        s.time - this.guardSince > .65 && absX < 180 && absLane < 30 && ready('burst')) add('burst', 1.6);
    if (absX > 145 && absX < style.shotRange && absLane < 22 && Math.abs(p.z - e.z) < 55 &&
        !ai.mustClose && s.time >= ai.shotAfter && ready('special') && this.clearShot(game, e, p) &&
        game.random() < style.shotChance * (s.settings.difficulty === 'easy' ? 1 : 2.2)) add(e.weapon ? 'throw' : 'special', .8);
    const attack = choices.sort((a, b) => b.score - a.score)[0]?.kind;
    if (!attack) return input;
    input[attack === 'launcher' ? 'attack' : attack] = true;
    if (attack === 'launcher') input.launcher = true;
    input.attackDirection = facing;
    // Stop before striking; direction is carried by the attack, not a chase step.
    input.left = input.right = input.up = input.down = input.run = false;
    ai.lastAttack = ai.lastTurn = s.time;
    e.aiTimer = (.55 + game.random() * .55) * level.tempo * game.difficulty.aggression * (e.bossPhase === 2 ? .7 : 1);

    if (attack === 'special' || attack === 'throw') { ai.shotAfter = s.time + 3; ai.mustClose = true; }
    return input;
  }

  defenseInput(game, e, level) {
    const { time, projectiles } = game.state, ai = e.ai;
    if (ai.defenseAfter > time || !e.grounded || e.energy < 8) return null;
    let threat = null;
    for (const shot of projectiles) {
      const seenAt = this.projectileSeen.get(shot);
      if (shot.team === e.team || shot.life <= 0 || seenAt == null || time - seenAt < level.reaction) continue;
      const impactIn = (e.x - shot.x) / (shot.vx - e.vx);
      if (!(impactIn > 0 && impactIn < .65)) continue;
      const depth = shot.depth + shot.vDepth * impactIn;
      const height = shot.z - shot.vy * impactIn - .5 * shot.gravity * impactIn * impactIn;
      if (Math.abs(depth - e.depth) > shot.r + 18 || Math.abs(height - e.z - e.h * .55) > shot.r + e.h * .45) continue;
      if (!threat || impactIn < threat.impactIn) threat = { shot, impactIn, depth };
    }
    if (!threat) return null;
    ai.defenseAfter = time + (level.reaction > .2 ? 1.3 : .65);
    if (game.random() >= level.defense) return null;
    const frontal = (threat.shot.x - e.x) * e.facing > 0;
    if (frontal && ['earth', 'water'].includes(e.element) && e.energy >= 18 && ai.guardAfter <= time) {
      // The threat scan accepts impacts up to .65 seconds away. Keep protection
      // through that predicted contact instead of dropping a slower shot at .5.
      ai.guardUntil = time + clamp(threat.impactIn + .08, .18, .73);
      ai.guardAfter = time + .8;
      ai.counterUntil = time + .9;
      return { guard: true };
    }
    // Keep the lane choice for the whole dodge, including when a target changes
    // direction. Prefer space away from the projectile and avoid arena edges.
    ai.evadeDirection = e.depth < 445 ? 1 : e.depth > 610 ? -1 :
      Math.sign(e.depth - threat.depth) || (e.id % 2 ? 1 : -1);
    ai.evadeX = 0;
    ai.evadeUntil = time + .32;
    return { up: ai.evadeDirection < 0, down: ai.evadeDirection > 0,
      dash: threat.impactIn < .28 && e.cooldowns.dash <= 0 && !e.dashUsed,
      attackDirection: 0, attackDepthDirection: ai.evadeDirection };
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
