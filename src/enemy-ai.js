import { COMBAT, ELEMENTS, MOVEMENT, ARCHETYPE_STATS, ARCHETYPE_COMBAT, ARCHETYPE_RULES, PICKUP_REACH, fighterSpec, fighterCombat } from './data.js';
import { CONSUMABLES } from './pickup-art.js';
import { clamp } from './physics.js';
import { isCommitted as bossCommitted } from './bosses.js';

// LF2-informed individual decisions; formation, turns and detours are our
// original adaptations for readable crowds in this smaller arena.
const LEVELS = {
  easy: { attackers: 1, reaction: .25, attackChance: .7, guardChance: .06, defense: .18, lead: 0 },
  normal: { attackers: 2, reaction: .17, attackChance: .92, guardChance: .34, defense: .8, lead: .12 },
  hard: { attackers: 3, reaction: .11, attackChance: 1, guardChance: .55, defense: 1, lead: .18 },
  crazy: { attackers: 4, reaction: .075, attackChance: 1, guardChance: .7, defense: 1, lead: .23 },
};
const STYLES = {
  air: { range: 108, shotRange: 380, shotChance: .16, retreat: .55, runAt: 350 },
  water: { range: 84, shotRange: 460, shotChance: .28, retreat: .5, runAt: 280 },
  earth: { range: 66, shotRange: 310, shotChance: .07, retreat: .35, runAt: 320 },
  fire: { range: 55, shotRange: 300, shotChance: .09, retreat: .16, runAt: 110 },
};
// Enemy archetypes (src/data.js ARCHETYPE_*): their own spacing and defence. range: preferred
// distance; keepAway: a back-liner that holds that distance on the target's lane and backs off
// when rushed; heavy: never runs or dashes; defense: 'evade' (sidestep threats like Air),
// 'shield' (the warden's shield takes frontal threats: no dodge, no guard), 'bell' (the monk
// answers threats with his Iron Bell), 'none' (the Chain Ox's armour). shotRange / shotLane:
// the ranged move's window. Difficulty never changes these, only how sharply they are used.
const ARCH_STYLES = {
  bandit: { range: 58, retreat: .3, runAt: 150, defense: 'evade' },
  hunter: { range: 330, retreat: .2, runAt: 150, defense: 'evade', keepAway: true, shotRange: [170, 560], shotLane: 22 },
  brute: { range: 96, retreat: .5, runAt: Infinity, defense: 'none', heavy: true, shotRange: [150, 380], shotLane: 22 },
  sorcerer: { range: 320, retreat: .4, runAt: 200, defense: 'evade', keepAway: true, shotRange: [150, 520], shotLane: 60 },
  guard: { range: 82, retreat: .45, runAt: Infinity, defense: 'shield', heavy: true },
  monk: { range: 92, retreat: .4, runAt: 260, defense: 'bell' },
  captive: { range: 0, retreat: 0, runAt: Infinity, defense: 'none', heavy: true },
};
const styleOf = e => (e.archetype ? ARCH_STYLES[e.archetype] : STYLES[e.element]) || STYLES.air;
const canGrab = e => !e.archetype || !!ARCHETYPE_STATS[e.archetype]?.grab;
const alive = f => !f.dead && f.hp > 0;
const disabled = f => f.stun > 0 || f.knockdown > 0 || f.frozen > 0 || f.grabbedBy != null;
const offensive = f => ['melee', 'special', 'burst', 'throw', 'grabPunch', 'bodyThrow'].includes(f.action?.kind);
const pending = f => ['attack', 'special', 'burst', 'throw', 'interact'].includes(f.buffer?.kind);
const committed = f => f.grabTarget != null || offensive(f) || pending(f) || f.ai?.airChasing || f.ai?.bossCommitted;
const grabOpening = f => alive(f) && f.grabbedBy == null && f.grabTarget == null &&
  f.grounded && f.z <= 8 && f.knockdown <= 0 && f.frozen <= 0 && f.stun > 0 && f.hitType === 'dizzy';
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.depth - b.depth) * 1.4;
const R = ARCHETYPE_RULES;
const HOLD = Object.freeze({});
// A team command bubble ('stay' when rotated out, 'move' when sent to the other side), at most one
// per fighter every ICON_GAP s and never while it is still hidden in its spawn swirl. Purely visual.
const ICON_GAP = 5;
function teamIcon(game, e, command) {
  const s = game.state;
  if (e.spawnReveal > 0 || !alive(e) || s.time < (e.ai.iconAt ?? -Infinity)) return;
  e.ai.iconAt = s.time + ICON_GAP;
  game.commandIcon?.(e, command);
}

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
    // A wave arrival still inside its spawn swirl joins the plan once it is revealed.
    const foes = s.enemies.filter(e => alive(e) && e.type !== 'dummy' && !(e.spawnHold && e.spawnReveal > 0));
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
    const bounds = s.bounds ?? { left: 30, right: 1250 };
    const corner = p.x < bounds.left + 85 ? 1 : p.x > bounds.right - 85 ? -1 : 0;
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
          probeAfter: s.time + 1.2, probeUntil: 0, counterUntil: 0, fleeUntil: 0, harassAt: 0, lobAfter: 0, errand: false,
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
        // Rotated out of the fight: it holds back for another fighter's turn.
        teamIcon(game, e, 'stay');
      }
      if (ai.hadAction && !e.action && !e.buffer) {
        ai.rotationUntil = s.time + styleOf(e).retreat * .65;
      }
      ai.hadAction = !!e.action;
      if (Math.abs(p.x - e.x) < 110 && Math.abs(p.depth - e.depth) < 30) ai.mustClose = false;
      ai.permit = committed(e);
    }
    if (rebalance && !corner) {
      // Keep an approaching pack together. A few flankers supply rear pressure
      // without sending half the encounter on a long trip around the player.
      const flankers = Math.min(2, Math.floor(foes.length / 3));
      for (const side of [-1, 1]) {
        const members = foes.filter(e => e.ai.side === side);
        members.filter(e => !committed(e)).sort((a, b) => distance(b, p) - distance(a, p))
          .slice(0, Math.max(0, flankers - (foes.length - members.length)))
          .forEach(e => { e.ai.side = -side; e.ai.route = 0; teamIcon(game, e, 'move'); });
      }
    }
    const occupied = foes.filter(committed).length;
    // An archetype holding its heal channel or Iron Bell, hidden in smoke or fleeing takes no turn.
    const busy = e => !!e.channel || e.bellTimer > 0 || e.smokeTimer > 0 || e.ai.fleeUntil > s.time;
    const waiting = foes.filter(e => !committed(e) && !disabled(e) && !busy(e) &&
      (e.ai.rotationUntil <= s.time || (!e.weapon && e.grounded && grabOpening(p))))
      .sort((a, b) => {
        // Expected time to engage plus bounded waiting credit. Far-away foes
        // no longer reserve every slot while a nearby fighter watches.
        const priority = e => distance(e, p) / 220 - Math.min(4, s.time - e.ai.lastTurn) * .45;
        return priority(a) - priority(b) || a.id - b.id;
      });
    for (const e of waiting.slice(0, Math.max(0, level.attackers - occupied))) e.ai.permit = true;
    for (const e of foes) e.ai.permitSince = e.ai.permit ? (e.ai.permitSince ?? s.time) : null;
    // Reserve rows are independent of the number already attacking. Disabled
    // fighters do not occupy a standing reserve's close position.
    for (const side of [-1, 1]) {
      let rank = 0;
      foes.filter(e => e.ai.side === side).sort((a, b) => Number(b.ai.permit) - Number(a.ai.permit) ||
        a.ai.lastTurn - b.ai.lastTurn || a.id - b.id).forEach(e => {
          e.ai.rank = e.ai.permit || disabled(e) ? 0 : rank++;
        });
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
    const level = LEVELS[s.settings.difficulty], style = styleOf(e);
    const bounds = s.bounds ?? { left: 30, right: 1250 };
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
    const canApproachGrab = !e.weapon && e.grounded && e.z <= 8 && grabOpening(p) && canGrab(e);
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
        e.aiTimer = .65;
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
    // An archetype's own errands come first: holding a stance, fleeing, stealing, healing or
    // going for a bound villager. ai.errand marks a commitment one starts (the smoke throw, a
    // steal, a chop at the villager): it is not an attack on the target.
    ai.errand = false;
    if (e.archetype) {
      const errand = this.archetypeErrand(game, e, level);
      if (errand) {
        ai.errand = !!(errand.attack || errand.special || errand.interact);
        return errand;
      }
    }

    const rotating = ai.rotationUntil > s.time;
    const front = ai.permit && (!rotating || canApproachGrab || ai.airChasing) && targetUp;
    if (front && e.element === 'air' && s.time >= ai.probeAfter) {
      ai.probeUntil = s.time + .8;
      ai.probeAfter = s.time + 2.2;
    }
    const overextended = p.action?.kind === 'melee' && !p.action.connected &&
      p.action.t > Math.max(p.action.activeUntil, level.reaction);
    let preferredRange = e.element === 'air' && (ai.probeUntil > s.time || overextended) ? 72 : style.range;
    // A back-liner pinned near a wall with its target close fights where it stands.
    const cornered = style.keepAway && absX < 150 && (e.x < bounds.left + 100 || e.x > bounds.right - 100) && (p.x - e.x) * (e.x < (bounds.left + bounds.right) / 2 ? 1 : -1) > 0;
    if (cornered) preferredRange = 50;
    else if (style.keepAway && absX < 200) preferredRange += 40; // rushed: back off further
    const reserveRange = ai.rank < 2 ? 28 + ai.rank * 24 : 92 + (ai.rank - 2) * 32;
    const reserveDepth = (ai.rank % 2 ? 1 : -1) * (ai.rank < 2 ? 16 + ai.rank * 8 : 50 + (ai.rank - 2) * 12);
    const radius = front && canApproachGrab ? 40 :
      preferredRange + (boss ? 18 : 0) + (front || style.keepAway ? 0 : reserveRange);
    const leadX = canApproachGrab ? 0 : clamp(ai.motion.vx * level.lead, -65, 65);
    const leadDepth = canApproachGrab ? 0 : clamp(ai.motion.vDepth * level.lead, -24, 24);
    let goalX = clamp(p.x + leadX + ai.side * radius, bounds.left + 20, bounds.right - 20);
    let goalDepth = clamp(p.depth + leadDepth + (front ? 0 : reserveDepth), 405, 640);
    if (front && ai.rangedPressure && absX > 165 && !ai.route) {
      const flank = p.depth > 570 ? -1 : p.depth < 470 ? 1 : (e.id % 2 ? 1 : -1);
      goalDepth = clamp(p.depth + flank * 68, 405, 640);
      goalX = clamp(p.x + leadX + ai.side * 110, bounds.left + 20, bounds.right - 20);
    }
    if (e.element === 'earth' && rotating && !canApproachGrab && absX < 140 && absLane < 30) goalX = e.x;
    // Crossing the target's front is done in a separate lane, not through its body.
    if ((e.x - p.x) * ai.side < -18 && !ai.route) {
      ai.route = p.depth > 574 ? -(ai.side > 0 ? 92 : 152) :
        p.depth < 471 ? (ai.side > 0 ? 92 : 152) : ai.side * 100;
    }
    if (ai.route && absX < 145 && absLane < 35 &&
        (p.action?.kind === 'melee' || Math.hypot(ai.motion.vx, ai.motion.vDepth) > 60)) {
      // Do not insist on crossing sides while the player follows the route.
      // Take the close engagement from this side instead of circling forever.
      ai.side = Math.sign(e.x - p.x) || -facing;
      ai.route = 0;
      goalX = clamp(p.x + leadX + ai.side * radius, bounds.left + 20, bounds.right - 20);
      goalDepth = clamp(p.depth + leadDepth, 405, 640);
    }
    if (ai.route) {
      goalDepth = clamp(p.depth + ai.route, 405, 640);
      if (absLane < 48 && (e.x - p.x) * ai.side < 45) goalX = e.x;
      if ((e.x - p.x) * ai.side > radius - 12) ai.route = 0;
    }
    // Teammates queue with space and briefly move around a blocked approach.
    const moveSign = Math.sign(goalX - e.x);
    const blocker = game.state.enemies.find(ally => ally !== e && alive(ally) &&
      (ally.x - e.x) * moveSign > 0 && Math.abs(ally.x - e.x) < 65 && Math.abs(ally.depth - e.depth) < 34 &&
      Math.abs(ally.x - e.x) < Math.abs(goalX - e.x) + (ally.w + e.w) / 2);
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
    if (style.heavy) input.run = false;
    // A rushed back-liner runs for its distance.
    else if (style.keepAway && !cornered && absX < 200 && Math.abs(goalX - e.x) > 40) input.run = Math.abs(goalDepth - e.depth) < 30;
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
    if (front && ai.meleePressure && !canApproachGrab && e.grounded && absX < 130 && absLane < 32 &&
        p.facing === -facing && e.facing === facing && ai.guardAfter <= s.time && e.energy >= 20 &&
        (!e.archetype || style.defense === 'evade' || style.defense === 'bell')) {
      if (style.defense === 'bell') {
        // The monk answers a jab rhythm with his Iron Bell (when it is ready).
        ai.guardAfter = s.time + 1.05;
        if (this.bellReady(e)) return { special: true, attackDirection: facing };
        return input;
      }
      ai.guardAfter = s.time + (e.element === 'earth' ? .8 : 1.05);
      ai.counterUntil = s.time + .95;
      if (e.element === 'air' || style.defense === 'evade') {
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
    if (front && s.settings.difficulty !== 'easy' && !boss && e.grounded && !style.heavy && !style.keepAway &&
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
    // The monk reads a blow coming and plants his staff; the warden and the Ox take it on the
    // shield or the armour (they never guard). The rest guard or sidestep below.
    if (e.archetype && style.defense !== 'evade') {
      if (style.defense === 'bell' && incomingMelee && absX < 125 && absLane < 30 && ai.guardAfter <= s.time && this.bellReady(e) &&
          game.random() < level.guardChance + .3) {
        ai.guardAfter = s.time + 1.2;
        ai.counterUntil = s.time + .8;
        return { special: true, attackDirection: facing };
      }
    } else
    if ((incomingMelee || (e.element === 'earth' && approaching)) &&
        absX < 125 && absLane < 30 && ai.guardAfter <= s.time &&
        e.facing === facing && e.energy >= 15 && game.random() <
        level.guardChance + (e.element === 'water' || e.element === 'earth' ? .25 : e.element === 'fire' ? -.22 : 0)) {
      if (e.element === 'air' || style.defense === 'evade') {
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
    if (front && !e.archetype && (p.z > 75 || (p.juggle > 0 && p.z > 20)) && p.vy < 180 && absX < 145 && absLane < 30 && e.grounded && e.jumpTimer <= 0 &&
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
    if (e.archetype) return this.archetypeAttack(game, e, input, level, { p, dx, absX, absLane, facing, punish, whiff });
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
    e.aiTimer = (.55 + game.random() * .55) * .65;

    if (attack === 'special' || attack === 'throw') { ai.shotAfter = s.time + 3; ai.mustClose = true; }
    return input;
  }

  defenseInput(game, e, level) {
    const { time, projectiles, player: p, settings } = game.state, ai = e.ai;
    // The warden's shield and the Ox's armour take what comes; the monk answers with his bell.
    const mode = e.archetype ? styleOf(e).defense : null;
    if (mode === 'none' || mode === 'shield') return null;
    if (ai.defenseAfter > time || !e.grounded || e.energy < 8) return null;
    const expert = settings.difficulty === 'crazy';
    const observed = [];
    for (const shot of projectiles) {
      const seenAt = this.projectileSeen.get(shot);
      // A bracer tossed off (shot.toss) is harmless: it only lands as a pickup.
      if (shot.team === e.team || shot.toss || shot.life <= 0 || seenAt == null || time - seenAt < level.reaction) continue;
      const impactIn = (e.x - shot.x) / (shot.vx - e.vx);
      if (!(impactIn > 0 && impactIn < .65)) continue;
      const depth = shot.depth + shot.vDepth * impactIn;
      const height = shot.z - shot.vy * impactIn - .5 * shot.gravity * impactIn * impactIn;
      if (Math.abs(height - e.z - e.h * .55) > shot.r + e.h * .45) continue;
      observed.push({ shot, impactIn, depth });
    }
    const threat = observed.filter(t => Math.abs(t.depth - e.depth) <= t.shot.r + 18)
      .sort((a, b) => a.impactIn - b.impactIn)[0];
    // An experienced fighter recognizes a committed, visible breaking stance.
    // This reads the animated move after its observation delay, never inputs.
    const action = p.action;
    const guardBreak = expert && action?.kind === 'melee' && action.move?.guardBreak &&
      action.t >= level.reaction && action.t < action.activeUntil &&
      (e.x - p.x) * p.facing > 0 && Math.abs(p.x - e.x) < action.move.reach + 36 &&
      Math.abs(p.depth - e.depth) < 36 && Math.abs(p.z - e.z) < 70;
    if (!threat && !guardBreak) return null;
    ai.defenseAfter = time + (level.reaction > .2 ? 1.3 : .65);
    if (game.random() >= level.defense) return null;
    if (mode === 'bell' && this.bellReady(e)) return { special: true, attackDirection: e.facing };
    const frontal = threat && (threat.shot.x - e.x) * e.facing > 0;
    const crossfire = expert && observed.some(t => Math.abs(t.depth - e.depth) <= t.shot.r + 18 &&
      (t.shot.x - e.x) * e.facing < 0);
    if (!guardBreak && !crossfire && frontal && ['earth', 'water'].includes(e.element) && e.energy >= 18 && ai.guardAfter <= time) {
      // The threat scan accepts impacts up to .65 seconds away. Keep protection
      // through that predicted contact instead of dropping a slower shot at .5.
      ai.guardUntil = time + clamp(threat.impactIn + .08, .18, .73);
      ai.guardAfter = time + .8;
      ai.counterUntil = time + .9;
      return { guard: true };
    }
    // Keep the lane choice for the whole dodge, including when a target changes
    // direction. Prefer space away from the projectile and avoid arena edges.
    const impactIn = guardBreak ? Math.max(0, action.windup - action.t) : threat.impactIn;
    const dash = impactIn < .28 && e.cooldowns.dash <= 0 && !e.dashUsed;
    ai.evadeDirection = e.depth < 445 ? 1 : e.depth > 610 ? -1 :
      Math.sign(e.depth - (threat?.depth ?? p.depth)) || (e.id % 2 ? 1 : -1);
    if (expert && observed.length > 1) {
      // Compare both escape lanes against the whole observed spread. Predict
      // ordinary movement conservatively, including acceleration and boundaries.
      const risk = direction => observed.reduce((sum, t) => {
        const walking = fighterSpec(e).speed * MOVEMENT.walkDepth * Math.max(0, t.impactIn - .08);
        const travel = dash ? Math.min(.17, t.impactIn) *
          (e.element === 'air' ? MOVEMENT.airDashSpeed : MOVEMENT.dashSpeed) * .55 +
          Math.max(0, t.impactIn - .17) * fighterSpec(e).speed * MOVEMENT.walkDepth : walking;
        const depth = clamp(e.depth + direction * travel, 405, 640);
        return sum + Math.max(0, t.shot.r + 23 - Math.abs(depth - t.depth));
      }, 0);
      if (risk(-ai.evadeDirection) < risk(ai.evadeDirection)) ai.evadeDirection *= -1;
    }
    ai.evadeX = 0;
    ai.evadeUntil = time + clamp((guardBreak ? action.activeUntil - action.t : impactIn) + .12, .32, .77);
    if (guardBreak) ai.counterUntil = ai.evadeUntil + .35;
    return { up: ai.evadeDirection < 0, down: ai.evadeDirection > 0,
      dash,
      attackDirection: 0, attackDepthDirection: ai.evadeDirection };
  }

  // ---- archetypes -----------------------------------------------------------------------
  // The monk's Iron Bell (ARCHETYPE_MOVES.monk.special) can go up now.
  bellReady(e) {
    return e.archetype === 'monk' && e.grounded && !e.action && !(e.bellTimer > 0) && e.cooldowns.special <= 0 &&
      e.energy >= ARCHETYPE_STATS.monk.specialCost;
  }

  // What an archetype does before (instead of) taking its place in the crowd, or null: hold its
  // heal channel or Iron Bell; a badly hurt bandit throws his smoke (retrying after its cooldown
  // when a blow cut the throw short) and holds still in it; flee after the smoke or a theft; a bandit races the player to a consumable or goes for a bound villager left alone;
  // the priest walks to a hurt ally and heals it.
  archetypeErrand(game, e, level) {
    const s = game.state, p = s.player, ai = e.ai, kind = e.archetype;
    if (e.channel || e.bellTimer > 0) return HOLD;
    if (kind === 'bandit') {
      // He holds still while his pellet falls and inside its smoke (hidden), then flees.
      if (e.smokeTimer > 0 || s.projectiles.some(shot => shot.kind === 'smokePellet' && shot.source === e)) return HOLD;
      if (!e.smokeUsed && e.hp <= e.maxHp * R.smoke.smokeAt && e.grounded && e.cooldowns.special <= 0) {
        return { special: true, attackDirection: e.facing };
      }
    }
    if (ai.fleeUntil > s.time) return this.fleeInput(e, p);
    if (kind === 'bandit') return this.stealInput(game, e, p, level) || this.harassInput(game, e, p, level);
    if (kind === 'sorcerer') return this.healInput(game, e, p, level);
    return null;
  }

  // Run from the target; pinned at a wall, break out along the depth instead.
  fleeInput(e, p) {
    const away = alive(p) ? (e.x < p.x ? -1 : 1) : (e.x < (game.state.bounds.left + game.state.bounds.right) / 2 ? 1 : -1);
    const wall = (away < 0 && e.x < 90) || (away > 0 && e.x > 1190);
    const lane = alive(p) ? (e.depth >= p.depth ? (e.depth > 625 ? -1 : 1) : (e.depth < 420 ? 1 : -1)) : 0;
    return { left: !wall && away < 0, right: !wall && away > 0, up: lane < 0, down: lane > 0, run: !wall };
  }

  // A consumable the bandit reaches first (by R.steal.lead px, plus his reaction: a slower bandit
  // only goes for a race he wins easily) within R.steal.range: run for it, E on it.
  stealInput(game, e, p, level) {
    if (e.stolen || !e.grounded) return null;
    const margin = R.steal.lead + level.reaction * 200;
    let best = null, bestDistance = Infinity;
    for (const w of game.state.weapons) {
      if (!CONSUMABLES[w.kind] || w.kind === 'incense') continue;
      const depth = w.depth ?? w.y;
      const mine = Math.abs(w.x - e.x) + Math.abs(depth - e.depth) * 1.4;
      const theirs = alive(p) ? Math.abs(w.x - p.x) + Math.abs(depth - p.depth) * 1.4 : Infinity;
      if (mine > R.steal.range || mine + margin > theirs || mine >= bestDistance) continue;
      best = w;
      bestDistance = mine;
    }
    if (!best) return null;
    const dx = best.x - e.x, dd = (best.depth ?? best.y) - e.depth;
    if (Math.abs(dx) < PICKUP_REACH.x * .5 && Math.abs(dd) < PICKUP_REACH.depth * .5) return { interact: true };
    return { left: dx < -6, right: dx > 6, up: dd < -5, down: dd > 5, run: Math.abs(dx) > 120 && Math.abs(dd) < 30 };
  }

  // A bound villager left alone (the player over 300 px away): the nearest free bandit walks over
  // and chops at him, slowly (a beat of 1.1 s plus his reaction), so there is time to come back.
  harassInput(game, e, p, level) {
    const s = game.state;
    const c = s.captives?.find(v => !v.freed && !v.dead && v.hp > 0 && !(v.spawnReveal > 0));
    if (!c) return null;
    if (alive(p) && Math.abs(p.x - c.x) < 300 && Math.abs(p.depth - c.depth) < 120) return null;
    let nearest = null;
    for (const b of s.enemies) {
      if (b.archetype !== 'bandit' || !alive(b) || b.ai?.fleeUntil > s.time || b.smokeTimer > 0 || b.spawnReveal > 0) continue;
      if (!nearest || distance(b, c) < distance(nearest, c)) nearest = b;
    }
    if (nearest !== e) return null;
    const ai = e.ai, toward = c.x > e.x ? 1 : -1;
    const dx = c.x - toward * 52 - e.x, dd = c.depth - e.depth;
    // He chops from a step away (40-72 px), not from on top of the kneeling man.
    if (Math.abs(c.x - e.x) >= 40 && Math.abs(c.x - e.x) < 72 && Math.abs(dd) < 18) {
      if (e.cooldowns.attack <= 0 && s.time >= ai.harassAt) {
        ai.harassAt = s.time + 1.1 + level.reaction * 2;
        return { attack: true, attackDirection: toward };
      }
      return HOLD;
    }
    return { left: dx < -6, right: dx > 6, up: dd < -4, down: dd > 4, run: Math.abs(dx) > 160 && Math.abs(dd) < 30 };
  }

  // A hurt ally (below R.channel.threshold, guardians aside) in reach of the priest: walk to it
  // on the far side from the target and channel. An easy priest takes the first hurt ally it
  // sees; a sharper one the most hurt, and never kneels with the target at his throat.
  healInput(game, e, p, level) {
    if (e.cooldowns.burst > 0 || e.action || !e.grounded) return null;
    if (level.defense > .5 && alive(p) && Math.abs(p.x - e.x) < 130 && Math.abs(p.depth - e.depth) < 40) return null;
    let best = null;
    for (const a of game.state.enemies) {
      if (a === e || !alive(a) || a.type === 'boss' || a.spawnReveal > 0 || a.hp >= a.maxHp * R.channel.threshold) continue;
      if (Math.abs(a.x - e.x) > R.channel.range * 1.6) continue;
      if (!best || (level.lead > 0 && a.hp / a.maxHp < best.hp / best.maxHp)) best = a;
    }
    if (!best) return null;
    if (Math.abs(best.x - e.x) <= R.channel.range * .8 && Math.abs(best.depth - e.depth) < 160 && game.startChannel(e, best)) return HOLD;
    const side = alive(p) ? (best.x < p.x ? -1 : 1) : (e.x < best.x ? -1 : 1);
    const dx = clamp(best.x + side * 160, game.state.bounds.left + 20, game.state.bounds.right - 20) - e.x, dd = best.depth - e.depth;
    return { left: dx < -8, right: dx > 8, up: dd < -6, down: dd > 6, run: Math.abs(dx) > 200 && Math.abs(dd) < 30 };
  }

  // An archetype's attack choice in its permitted turn (the same utility ranking as the elements):
  // its string, its signature strike (a launcher press), its ranged move in its window (the
  // archer's flat shot needs a clear lane, a volley only rough alignment; the Ox's hook, the
  // priest's homing slip; a lob is a volley asked for with a launcher press) and its close moves (the Ox's whirl, the warden's shield rush).
  archetypeAttack(game, e, input, level, { p, dx, absX, absLane, facing, punish }) {
    const s = game.state, ai = e.ai, kind = e.archetype, style = ARCH_STYLES[kind];
    // The warden only strikes over his shield: with his foe behind him he waits for his turn.
    if (kind === 'guard' && e.facing !== facing) return input;
    const spec = ARCHETYPE_STATS[kind], combat = ARCHETYPE_COMBAT[kind];
    const ready = key => e.cooldowns[key] <= 0 && e.energy >= spec[`${key}Cost`];
    const choices = [];
    const add = (key, score) => choices.push({ kind: key, score: score + game.random() * .08 });
    const level3 = Math.abs(p.z - e.z) < 68;
    const reach = Math.abs(dx - e.vx * .067);
    const first = combat.steps[0], signature = combat.signature != null ? combat.steps[combat.signature] : null;
    if (first && absLane < 24 && level3 && e.cooldowns.attack <= .03 && reach < first.reach + 5 &&
        (punish || game.random() < level.attackChance)) add('attack', .7 + (punish ? .65 : 0));
    if (signature && absLane < 24 && level3 && e.cooldowns.attack <= .03 && reach < signature.reach + 5 && reach > first.reach * .6 &&
        game.random() < .5 + (punish ? .3 : 0)) add('signature', .85 + (punish ? .5 : 0));
    const [near, far] = style.shotRange || [0, 0];
    const shotWindow = absX > near && absX < far && Math.abs(p.z - e.z) < 70 && s.time >= ai.shotAfter && ready('special');
    if (kind === 'hunter' && shotWindow) {
      // Every third shot is a volley; a sharper archer lined up behind his own crowd lobs one
      // over it instead of waiting for a clear flat shot.
      const aligned = absLane < style.shotLane;
      const clear = aligned && this.clearShot(game, e, p);
      if (e.shots % 3 === 2 ? absLane < 150 : clear) add('special', 1.1);
      else if (aligned && s.settings.difficulty !== 'easy' && s.time >= ai.lobAfter) add('lob', .95);
    } else if (kind === 'brute') {
      if (shotWindow && absLane < style.shotLane && this.clearShot(game, e, p)) add('special', .9 + (p.guard ? .3 : 0));
      if (absX < 100 && absLane < 34 && ready('burst') && (p.guard || punish || game.random() < .3)) add('burst', 1.2);
    } else if (kind === 'sorcerer') {
      if (shotWindow && absLane < style.shotLane) add('special', 1);
    } else if (kind === 'guard') {
      if (absX > 96 && absX < 230 && absLane < 20 && ready('special')) add('special', 1 + (p.guard ? .4 : 0));
    } else if (kind === 'monk') {
      // He plants the bell ahead of a target closing in to strike: always against a jab rhythm,
      // otherwise as often as his defence reads it.
      if (this.bellReady(e) && absX < 150 && absLane < 34 && p.facing === -facing &&
          (ai.meleePressure || game.random() < .2 + level.defense * .25)) add('special', .9);
    }
    const attack = choices.sort((a, b) => b.score - a.score)[0]?.kind;
    if (!attack) return input;
    input[attack === 'signature' ? 'attack' : attack === 'lob' ? 'special' : attack] = true;
    if (attack === 'signature' || attack === 'lob') input.launcher = true;
    input.attackDirection = facing;
    input.left = input.right = input.up = input.down = input.run = false;
    // The volley leads a moving target as far as the archer's skill reads it (Crazy: fully).
    e.aimLead = level.lead / LEVELS.crazy.lead;
    ai.lastAttack = ai.lastTurn = s.time;
    e.aiTimer = (.55 + game.random() * .55) * .65;
    if ((attack === 'special' || attack === 'lob') && style.shotRange) ai.shotAfter = s.time + (kind === 'hunter' ? 1 : 2) + level.reaction * 4;
    if (attack === 'lob') ai.lobAfter = s.time + 4;
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

  capacity(game) {
    return LEVELS[game.state.settings.difficulty].attackers;
  }
}
