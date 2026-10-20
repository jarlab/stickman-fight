import { clamp } from './physics.js';
import { ARCHETYPE_STATS, CAPTIVE } from './data.js';

const fighters = game => [game.state.player, ...game.state.enemies];
const find = (game, id) => fighters(game).find(f => f.id === id);
const alive = f => f && !f.dead && f.hp > 0;
// Archetypes: only those with ARCHETYPE_STATS[kind].grab catch a dizzy opponent; the Chain Ox is
// too heavy to be caught and a bound villager is no opponent.
const canGrab = f => !f.archetype || !!ARCHETYPE_STATS[f.archetype]?.grab;
export const canBeGrabbed = f => f.archetype !== 'brute' && f.archetype !== 'captive';

// The dizzy opponent an interact press would grab (the nearest in front, in reach), or null.
// Pure: Grapples.tryGrab acts on it, and the renderer's E-seal target defers to it.
export function grabCandidate(holder, targets) {
  if (!alive(holder) || holder.weapon || !holder.grounded || holder.z > 8 || holder.guard || holder.action ||
      holder.stun > 0 || holder.frozen > 0 || holder.knockdown > 0 || holder.dashTime > 0 ||
      holder.grabTarget != null || holder.grabbedBy != null || !canGrab(holder)) return null;
  let best = null;
  for (const f of targets) {
    if (alive(f) && canBeGrabbed(f) && f.grabbedBy == null &&
      f.grabTarget == null && f.grounded && f.z <= 8 && f.knockdown <= 0 && f.frozen <= 0 && f.invulnerable <= 0 &&
      f.stun > 0 && f.hitType === 'dizzy' && (f.x - holder.x) * holder.facing > 0 &&
      Math.abs(f.x - holder.x) <= 84 && Math.abs(f.depth - holder.depth) < 28 &&
      (!best || Math.abs(f.x - holder.x) < Math.abs(best.x - holder.x))) best = f;
  }
  return best;
}

// The bound villager the player's E would start freeing (CAPTIVE.reach, either side), or null:
// none while E would grab instead (the caller checks that first), in the air, stunned, knocked
// down, frozen, holding or held, or during a use. Pure: Game.startRescue and the renderer's
// rescue prompt both read it.
export function rescueCandidate(player, captives) {
  if (!captives?.length || !alive(player) || !player.grounded || player.z > 8 || player.consume || player.action ||
      player.stun > 0 || player.frozen > 0 || player.knockdown > 0 || player.grabTarget != null || player.grabbedBy != null) return null;
  let best = null;
  for (const c of captives) {
    if (!alive(c) || c.freed || c.spawnReveal > 0) continue;
    const dx = Math.abs(c.x - player.x);
    if (dx >= CAPTIVE.reach.x || Math.abs(c.depth - player.depth) >= CAPTIVE.reach.depth) continue;
    if (!best || dx < Math.abs(best.x - player.x)) best = c;
  }
  return best;
}

// Original adaptation of LF2's linked catch states, finite grip and separate
// falling-body contacts / landing injury. State uses IDs, never cyclic links.
export class Grapples {
  tryGrab(game, holder) {
    const target = grabCandidate(holder, game.targets(holder));
    if (!target) return false;
    game.clearCombatInput(holder);
    game.clearCombatInput(target);
    game.endAction(target);
    // A grab takes a consumable out of the hand like a blow (never a dizzy target in practice).
    game.cancelConsume(target);
    holder.grabTarget = target.id;
    holder.grabTime = target.type === 'boss' ? .9 : 1.8;
    target.grabbedBy = holder.id;
    for (const f of [holder, target]) {
      Object.assign(f, { vx: 0, vy: 0, vDepth: 0, guard: false, guardHeld: false,
        parryTimer: 0, armor: false, running: false, hitLag: 0, hitReact: 0, pull: null });
    }
    this.sync(holder, target);
    game.sound('grab', target.x);
    game.floater(target.x, target.y - target.h - 14,
      holder.team === 'player' ? 'J PUNCH · U THROW' : 'GRABBED!', '#9a7935');
    return true;
  }

  sync(holder, target) {
    target.x = clamp(holder.x + holder.facing * (target.type === 'boss' ? 49 : 38), 30 + target.w / 2, 1250 - target.w / 2);
    target.depth = holder.depth;
    target.z = 0;
    target.y = target.depth;
    target.facing = -holder.facing;
    target.vx = target.vDepth = target.vy = 0;
    target.grounded = true;
  }

  release(game, participant) {
    const holder = participant.grabTarget != null ? participant : find(game, participant.grabbedBy);
    if (!holder) { participant.grabbedBy = null; return; }
    const target = find(game, holder.grabTarget);
    holder.grabTarget = null;
    holder.grabTime = 0;
    if (['bodyThrow', 'grabPunch'].includes(holder.action?.kind)) game.endAction(holder);
    game.clearCombatInput(holder);
    if (target) {
      target.grabbedBy = null;
      target.stun = Math.max(target.stun, .12);
      target.stagger = 0;
      target.hitType = 'stagger';
      target.aiTimer = Math.max(target.aiTimer, .35);
      game.clearCombatInput(target);
    }
  }

  control(game, holder, input, dt) {
    const target = find(game, holder.grabTarget);
    if (!alive(target) || holder.stun > 0 || holder.frozen > 0 || holder.knockdown > 0) {
      this.release(game, holder);
      return;
    }
    holder.vx = holder.vDepth = holder.vy = 0;
    holder.guard = holder.running = holder.armor = false;
    const queued = holder.buffer;
    // Keep a late J/U through recovery, using the ordinary world-clock buffer.
    // Powers and mobility cannot become an attack after the grip ends.
    if (queued && (!['attack', 'throw', 'interact'].includes(queued.kind) || queued.command)) holder.buffer = null;
    if (queued?.kind === 'interact') { this.release(game, holder); return; }
    if (!holder.action) {
      const facing = Number(!!input.right) - Number(!!input.left);
      if (facing) holder.facing = facing;
      if (holder.buffer?.kind === 'attack') {
        holder.buffer = null;
        holder.action = { kind: 'grabPunch', t: 0, windup: 6 / 30, activeUntil: 7 / 30,
          duration: 11 / 30, done: false };
        holder.attackKind = 'grabPunch';
        holder.attackTimer = holder.cooldowns.attack = 11 / 30;
        holder.tell = 6 / 30;
      } else if (holder.buffer?.kind === 'throw') {
        holder.buffer = null;
        if (queued.direction) holder.facing = queued.direction;
        holder.action = { kind: 'bodyThrow', t: 0, windup: .2, activeUntil: .25,
          duration: .48, done: false, depthDirection: queued.depthDirection };
        holder.attackKind = 'bodyThrow';
        holder.attackTimer = .48;
        holder.cooldowns.attack = .48;
      }
    }
    this.sync(holder, target);
    if (holder.action?.kind === 'grabPunch') {
      const action = holder.action;
      action.t += dt;
      if (!action.done && action.t >= action.windup) {
        action.done = true;
        action.connected = game.damage(target, 15, holder.facing, holder, { grabPunch: true, contact: true });
        if (target.hp <= 0) { this.release(game, holder); return; }
      }
      if (action.t >= action.duration) game.endAction(holder);
    }
    if (holder.action?.kind === 'bodyThrow') {
      const action = holder.action;
      action.t += dt;
      if (action.t >= action.windup) {
        const direction = holder.facing;
        this.release(game, holder);
        // Keep the thrower's recovery even though the linked grip has ended.
        holder.action = action;
        holder.attackKind = 'bodyThrow';
        holder.attackTimer = action.duration - action.t;
        action.done = true;
        Object.assign(target, { vx: direction * (target.type === 'boss' ? 550 : 760),
          vy: -420, vDepth: action.depthDirection * 140, z: 10, grounded: false,
          stun: 0, knockdown: .7, invulnerable: 0, hitType: 'slam', hitDirection: direction });
        target.y = target.depth - target.z;
        target.thrown = { sourceId: holder.id,
          source: { id: holder.id, team: holder.team, type: holder.type, element: holder.element, archetype: holder.archetype },
          hitIds: [], life: 1.5, direction,
          previous: { x: target.x, depth: target.depth, z: target.z } };
        game.floater(target.x, target.y - target.h, 'THROW', '#9a7935');
        game.sound('throw', holder.x);
      }
    }
  }

  update(game, dt) {
    for (const holder of fighters(game)) {
      if (holder.grabTarget == null) continue;
      const target = find(game, holder.grabTarget);
      holder.grabTime -= dt;
      if (!alive(holder) || !alive(target) || target.grabbedBy !== holder.id ||
          holder.stun > 0 || holder.knockdown > 0 || holder.frozen > 0 || holder.grabTime <= 0) {
        this.release(game, holder);
      } else this.sync(holder, target);
    }
    for (const body of fighters(game)) {
      const flight = body.thrown;
      if (!flight) continue;
      const source = find(game, flight.sourceId) || flight.source;
      if (!alive(body)) { body.thrown = null; continue; }
      flight.life -= dt;
      const previous = flight.previous;
      // Sweep along the flight segment so a fast body cannot skip a fighter.
      for (const target of game.targets(source)) {
        if (target === body || !alive(target) || flight.hitIds.includes(target.id)) continue;
        const travel = body.x - previous.x;
        const fraction = travel ? clamp((target.x - previous.x) / travel, 0, 1) : 0;
        const x = previous.x + travel * fraction;
        const depth = previous.depth + (body.depth - previous.depth) * fraction;
        const z = previous.z + (body.z - previous.z) * fraction;
        if (Math.abs(target.x - x) > (target.w + body.w) / 2 + 12 ||
            Math.abs(target.depth - depth) >= 28 || Math.abs(target.z + target.h / 2 - z - body.h / 2) > 60) continue;
        flight.hitIds.push(target.id);
        game.damage(target, 22, flight.direction, source, { knockdown: true, heavy: true,
          knockback: 420, lift: 200, element: source.element, thrownBody: true });
      }
      const wall = body.x <= 30 + body.w / 2 || body.x >= 1250 - body.w / 2;
      if (body.grounded || wall || flight.life <= 0) {
        game.damage(body, 18, flight.direction, source, { throwLanding: true,
          unblockable: true, knockdown: true, heavy: true, knockback: 0, lift: 0 });
        body.thrown = null;
      } else flight.previous = { x: body.x, depth: body.depth, z: body.z };
    }
  }
}
