import { clamp } from './physics.js';

const fighters = game => [game.state.player, ...game.state.enemies];
const find = (game, id) => fighters(game).find(f => f.id === id);
const alive = f => f && !f.dead && f.hp > 0;

// Original adaptation of LF2's linked catch states, finite grip and separate
// falling-body contacts / landing injury. State uses IDs, never cyclic links.
export class Grapples {
  tryGrab(game, holder) {
    if (holder.weapon || !holder.grounded || holder.z > 8 || holder.guard || holder.action) return false;
    const target = game.targets(holder).filter(f => alive(f) && f.grabbedBy == null &&
      f.grabTarget == null && f.grounded && f.z <= 8 && f.knockdown <= 0 && f.frozen <= 0 &&
      f.stun > 0 && f.hitType === 'dizzy' && (f.x - holder.x) * holder.facing > 0 &&
      Math.abs(f.x - holder.x) <= 84 && Math.abs(f.depth - holder.depth) < 28)
      .sort((a, b) => Math.abs(a.x - holder.x) - Math.abs(b.x - holder.x))[0];
    if (!target) return false;
    game.clearCombatInput(holder);
    game.clearCombatInput(target);
    game.endAction(target);
    holder.grabTarget = target.id;
    holder.grabTime = target.type === 'boss' ? .9 : 1.8;
    target.grabbedBy = holder.id;
    for (const f of [holder, target]) {
      Object.assign(f, { vx: 0, vy: 0, vDepth: 0, guard: false, guardHeld: false,
        parryTimer: 0, armor: false, running: false, hitLag: 0, hitReact: 0 });
    }
    this.sync(holder, target);
    game.floater(target.x, target.y - target.h - 14, 'GRABBED · U THROW', '#9a7935');
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
    if (holder.action?.kind === 'bodyThrow') game.endAction(holder);
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
    holder.buffer = null; // Powers and mobility entered during a grip are discarded.
    if (queued?.kind === 'interact') { this.release(game, holder); return; }
    if (!holder.action) {
      const facing = Number(!!input.right) - Number(!!input.left);
      if (facing) holder.facing = facing;
      if (queued?.kind === 'throw') {
        if (queued.direction) holder.facing = queued.direction;
        holder.action = { kind: 'bodyThrow', t: 0, windup: .2, activeUntil: .25,
          duration: .48, done: false, depthDirection: queued.depthDirection };
        holder.attackKind = 'bodyThrow';
        holder.attackTimer = .48;
        holder.cooldowns.attack = .48;
      }
    }
    this.sync(holder, target);
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
        target.thrown = { sourceId: holder.id, hitIds: [], life: 1.5, direction,
          previous: { x: target.x, depth: target.depth, z: target.z } };
        game.floater(target.x, target.y - target.h, 'THROW', '#9a7935');
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
    for (const body of game.state.enemies) {
      const flight = body.thrown;
      if (!flight) continue;
      const source = find(game, flight.sourceId);
      if (!alive(body) || !source) { body.thrown = null; continue; }
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
          knockback: 420, lift: 200, element: source.element });
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
