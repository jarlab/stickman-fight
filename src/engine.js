import { ELEMENTS, MOVEMENT, COMBAT, ARENAS, MODES, DIFFICULTIES } from './data.js';
import { GRAVITY, clamp, moveFighter } from './physics.js';
import { EnemyAI } from './enemy-ai.js';
import { Grapples } from './grapples.js';
import { BossDirector } from './bosses.js';

const elements = Object.keys(ELEMENTS);
const COMBAT_TICK = 1 / 30;
const INPUT_WINDOW = 5 * COMBAT_TICK;
const countdowns = ['invulnerable', 'stun', 'parryTimer', 'parryCooldown', 'dashTime', 'slow', 'burn', 'attackTimer', 'tell', 'aiTimer', 'jumpTimer', 'comboTimer', 'hitReact', 'frozen', 'counterReady'];
const stories = ['The wind has gone silent.', 'The harbor has frozen over.', 'The stone guardians have awakened.', 'One final flame. Restore the balance.'];

export class Game {
  constructor(config = {}) {
    const settings = {
      element: Object.hasOwn(ELEMENTS, config.element) ? config.element : 'air',
      arena: config.arena in ARENAS ? config.arena : 'air',
      mode: config.mode in MODES ? config.mode : 'survival',
      difficulty: config.difficulty in DIFFICULTIES ? config.difficulty : 'normal',
      enemyCount: Number.isInteger(config.enemyCount) && config.enemyCount >= 1 && config.enemyCount <= 12 ? config.enemyCount : 'auto',
    };
    this.seed = config.seed ?? 61721;
    this.nextId = 0;
    this.enemyAI = new EnemyAI();
    this.grapples = new Grapples();
    this.bosses = new BossDirector();
    this.state = {
      settings, status: 'ready', time: 0, wave: 0, kills: 0, score: 0,
      lives: settings.mode === 'challenge' ? 1 : 3,
      player: null, enemies: [], projectiles: [], particles: [], effects: [],
      floaters: [], corpses: [], weapons: [],
      bossHazards: [],
      arena: settings.arena, shake: 0, slowMotion: 0,
      banner: 'Find your element', bannerTime: 0, objective: MODES[settings.mode].objective,
      waveDelay: -1, weaponTimer: 10, combo: 0, comboTimer: 0, lastImpact: null, impacts: [],
    };
    this.state.player = this.makeFighter('player', settings.element, 610, 560);
    this.placePlayer();
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  makeFighter(team, element, x, y, type = 'fighter') {
    const spec = ELEMENTS[element];
    const boss = type === 'boss';
    // Ordinary opponents use the same elemental health as a playable fighter.
    // Difficulty changes decisions, not fighter stats or action clocks.
    const hp = boss ? 320 + this.state.wave * 32
      : type === 'dummy' ? 180 : spec.hp;
    return {
      id: ++this.nextId, team, type, element, x, y, depth: y, z: 0, vDepth: 0, vx: 0, vy: 0,
      w: boss ? 46 : 28, h: boss ? 104 : 66, hp, maxHp: hp,
      energy: 100, maxEnergy: 100, facing: team === 'player' ? 1 : -1,
      grounded: true, jumps: 0, attackTimer: 0, attackKind: '',
      guard: false, guardHeld: false, parryTimer: 0, parryCooldown: 0, invulnerable: 0,
      stun: 0, cooldowns: { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 },
      weapon: null, weaponHits: 0, dead: false, aiTimer: 0.8 + this.random(),
      bossPhase: 1, tell: 0, action: null,
      dashTime: 0, dashUsed: false, slow: 0, burn: 0, jumpTimer: 0, burnTick: 0,
      comboIndex: 0, comboTimer: 0, comboCount: 0, running: false, knockdown: 0,
      finisherWindow: 0, finisherTarget: null, inputRevision: 0,
      buffer: null, armor: false, frozen: 0, counterReady: 0, juggle: 0,
      hitLag: 0, hitLagAt: -1, stagger: 0,
      hitReact: 0, hitMax: 0, hitDirection: 1, hitStrength: 0, hitType: 'stagger',
      grabTarget: null, grabbedBy: null, grabTime: 0, thrown: null,
      recoveryRoll: null, downTime: 0, airChain: 0,
    };
  }

  start() {
    if (this.state.status !== 'ready') return;
    this.state.status = 'playing';
    this.state.player.invulnerable = 1.2;
    this.beginWave();
  }

  togglePause() {
    if (this.state.status === 'playing') { this.state.status = 'paused'; this.state.player.buffer = null; }
    else if (this.state.status === 'paused') this.state.status = 'playing';
  }

  placePlayer() {
    const s = this.state;
    this.grapples.release(this, s.player);
    Object.assign(s.player, { x: 590, y: 555, depth: 555, z: 0, vDepth: 0, vx: 0, vy: 0, grounded: true, jumps: 0, dashUsed: false, dashTime: 0, stun: 0, burn: 0, slow: 0, action: null, guard: false, parryTimer: 0, attackTimer: 0, tell: 0, knockdown: 0, comboIndex: 0, comboTimer: 0 });
    Object.assign(s.player, { buffer: null, armor: false, frozen: 0, counterReady: 0, juggle: 0, hitReact: 0, running: false, guardHeld: false, hitLag: 0, stagger: 0, thrown: null, recoveryRoll: null, downTime: 0, airChain: 0 });
    this.clearCombatInput(s.player);
  }

  spawnEnemy({ boss = false, dummy = false, element, x, y, depth } = {}) {
    const s = this.state;
    const side = this.random() > 0.5;
    const e = this.makeFighter('enemy', element || elements[Math.floor(this.random() * 4)], x ?? (side ? 1170 : 110), depth ?? y ?? (425 + this.random() * 200), boss ? 'boss' : dummy ? 'dummy' : 'fighter');
    e.invulnerable = 0.4;
    s.enemies.push(e);
    this.effect(e.x, e.y - e.h / 2, ELEMENTS[e.element].color, 16);
    return e;
  }

  beginWave() {
    const s = this.state;
    s.wave++;
    s.waveDelay = -1;
    const mode = s.settings.mode;
    const countOverride = s.settings.enemyCount === 'auto' ? null : s.settings.enemyCount;
    if (mode === 'story') {
      s.arena = elements[s.wave - 1];
      s.projectiles = [];
      s.bossHazards = [];
      s.weapons = [];
      s.corpses = [];
      this.placePlayer();
      s.player.invulnerable = 1.5;
      s.objective = stories[s.wave - 1];
    }
    if (mode === 'training') {
      for (let i = 0; i < (countOverride ?? 1); i++) this.spawnTrainingEnemy(i);
      this.banner('Training grounds');
    } else if (mode === 'tournament') {
      this.spawnEnemy({ boss: true, element: elements[(s.wave + elements.indexOf(s.settings.element)) % 4] });
      for (let i = 1; i < (countOverride ?? 1); i++) this.spawnEnemy();
      this.banner(`Guardian ${s.wave} / 3`);
    } else if (mode === 'story') {
      this.spawnEnemy({ boss: true, element: s.arena });
      for (let i = 1; i < (countOverride ?? 3); i++) this.spawnEnemy({ element: s.arena });
      this.banner(`Chapter ${s.wave} · ${ARENAS[s.arena].name}`);
    } else {
      const bossWave = mode === 'survival' && s.wave % 3 === 0;
      const count = countOverride ?? (mode === 'challenge' ? 4 : Math.min(4 + s.wave, 13));
      const ordinaryCount = bossWave ? (countOverride == null ? Math.max(2, count - 3) : count - 1) : count;
      for (let i = 0; i < ordinaryCount; i++) this.spawnEnemy();
      if (bossWave) this.spawnEnemy({ boss: true });
      this.banner(mode === 'challenge' ? `Trial ${s.wave} / 3` : `Wave ${s.wave}${bossWave ? ' · Guardian approaches' : ''}`);
    }
    if (s.wave > 1) {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 22);
      s.player.energy = Math.min(100, s.player.energy + 25);
    }
    this.spawnWeapon(true);
  }

  banner(text) { this.state.banner = text; this.state.bannerTime = 2.7; }

  spawnTrainingEnemy(index = 0) {
    const s = this.state;
    while (s.enemies.some(e => e.trainingSlot === index)) index++;
    const solo = s.settings.enemyCount === 'auto' || s.settings.enemyCount === 1;
    const enemy = this.spawnEnemy({ dummy: true, element: 'earth',
      x: solo ? clamp(s.player.x + (s.player.x < 640 ? 190 : -190), 80, 1200) : 120 + index % 6 * 208,
      depth: solo ? s.player.depth : 460 + Math.floor(index / 6) * 145 });
    enemy.trainingSlot = index;
  }

  spawnWeapon(weaponOnly = false) {
    const s = this.state;
    if (s.weapons.length >= 3) return;
    const depth = 440 + this.random() * 180;
    const kinds = weaponOnly ? ['staff', 'spear', 'crate'] : ['staff', 'spear', 'crate', 'heal', 'energy'];
    const kind = kinds[Math.floor(this.random() * kinds.length)];
    s.weapons.push({ x: 220 + this.random() * 840, y: depth, depth, kind, life: 28 });
  }

  tick(input = {}, dt = 1 / 120) {
    const s = this.state;
    if (s.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    // LF2 ages recent button presses on the world clock, even during hit lag.
    // Completed directional commands instead wait for an available transition.
    for (const f of [s.player, ...s.enemies]) {
      if (f.buffer?.ttl != null && (f.buffer.ttl -= dt) < 1e-9) f.buffer = null;
    }
    this.bufferInput(s.player, input);
    s.time += dt;
    s.shake = Math.max(0, s.shake - dt * 24);
    s.slowMotion = Math.max(0, s.slowMotion - dt);
    const step = s.slowMotion > 0 ? dt * 0.5 : dt;
    s.bannerTime = Math.max(0, s.bannerTime - dt);
    s.comboTimer = Math.max(0, s.comboTimer - dt);
    if (!s.comboTimer) s.combo = 0;
    this.updateVisuals(step);

    this.updateFighter(s.player, input, step);
    this.enemyAI.update(this, step);
    for (const e of s.enemies) {
      if (e.dead || e.hp <= 0) continue;
      if (e.type === 'boss' && this.bosses.updatePhase(this, e) && e.ai) e.ai.bossCommitted = true;
      this.updateFighter(e, e.hitLag > 0 ? {} : this.enemyInput(e), step);
    }
    this.grapples.update(this, step);
    this.separateFighters(step);
    this.updateProjectiles(step);
    this.bosses.updateHazards(this, step);
    this.resolveDeaths();
    if (s.status !== 'playing') return;
    if (s.settings.mode === 'training') {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + dt * 18);
      s.player.energy = Math.min(100, s.player.energy + dt * 15);
      const count = s.settings.enemyCount === 'auto' ? 1 : s.settings.enemyCount;
      if (s.enemies.length < count) this.spawnTrainingEnemy();
    } else if (!s.enemies.length) {
      if (s.waveDelay < 0) {
        s.waveDelay = 2.2;
        this.banner('Arena cleared · breathe');
      } else {
        s.waveDelay -= dt;
        if (s.waveDelay <= 0) {
          const final = ({ tournament: 3, challenge: 3, story: 4 })[s.settings.mode];
          if (final && s.wave >= final) {
            s.status = 'won';
            s.objective = s.settings.mode === 'story' ? 'Balance restored across the four sanctuaries.' : 'Every opponent defeated. The arena is yours.';
          } else this.beginWave();
        }
      }
    }
    s.weaponTimer -= dt;
    if (s.weaponTimer <= 0) { this.spawnWeapon(); s.weaponTimer = 12; }
  }

  updateFighter(f, input, dt) {
    if (f.dead) return;
    // Landing commitment ages through contact pauses, so a recent recovery
    // input can survive the throw's landing hitlag. Airborne time never counts.
    f.downTime = f.knockdown > 0 && f.grounded && !f.thrown ? f.downTime + dt : 0;
    // LF2 holds participants, including their physics and action clocks.
    // Projectiles and the rest of the crowd continue on the world clock.
    if (f.hitLag > 0) {
      // A contact earlier in this same tick must not shorten the victim's hold
      // simply because its update comes after the attacker's in the array.
      if (f.hitLagAt !== this.state.time) f.hitLag = Math.max(0, f.hitLag - dt);
      f.hitLagAt = this.state.time;
      return;
    }
    const spec = ELEMENTS[f.element];
    this.updateFinisherWindow(f, dt);
    f.stagger = Math.max(0, f.stagger - dt * 30);
    for (const key of countdowns) f[key] = Math.max(0, (f[key] || 0) - dt);
    for (const key of Object.keys(f.cooldowns)) f.cooldowns[key] = Math.max(0, f.cooldowns[key] - dt);
    if (f.team === 'enemy') this.bufferInput(f, input);
    f.armor = !!((f.action?.move?.armor && f.action.t < f.action.activeUntil ||
      f.bossAction?.armor && f.bossAction.t < f.bossAction.windup &&
      (f.bossAction.poise == null || (f.bossAction.poiseHits ?? 0) < f.bossAction.poise)) && f.grounded);
    f.energy = Math.min(f.maxEnergy, f.energy + dt * (f.guard ? 2 : f.team === 'player' ? 14 : 18));
    if (f.burn > 0) {
      f.burnTick -= dt;
      if (f.burnTick <= 0) {
        f.hp = Math.max(0, f.hp - 3);
        f.burnTick = 0.45;
        this.effect(f.x, f.y - f.h / 2, '#cf7041', 3);
      }
    }
    if (f.hp <= 0) { this.endAction(f); f.buffer = null; f.guard = false; return; }
    if (f.grabbedBy != null) { f.buffer = null; return; }
    if (f.grabTarget != null) { this.grapples.control(this, f, input, dt); return; }
    if (f.recoveryRoll || this.tryRecoveryRoll(f)) {
      this.updateRecoveryRoll(f, dt);
      return;
    }
    if (f.bossAction && this.bosses.updateFighter(this, f, dt)) return;
    if (f.knockdown > 0 && f.grounded) {
      f.knockdown = Math.max(0, f.knockdown - dt);
      if (!f.knockdown) {
        f.invulnerable = Math.max(f.invulnerable, .28);
        f.juggle = f.stagger = f.downTime = 0;
        if (f.buffer?.kind === 'recover') f.buffer = null;
      }
    }
    const disabled = f.stun > 0 || f.knockdown > 0 || f.frozen > 0;
    if (!disabled && input.guard && f.action?.connected && f.action.t >= f.action.chainAt && !f.buffer) this.endAction(f);
    const guardPressed = !!input.guard && !f.guardHeld;
    f.guardHeld = !!input.guard;
    const power = ['special', 'burst'].includes(f.buffer?.kind) ? f.buffer.kind : null;
    const readyPower = power && f.cooldowns[power] <= 0 && f.energy >= spec[`${power}Cost`];
    f.guard = !!input.guard && !disabled && f.dashTime <= 0 && !f.action && !readyPower;
    if (f.guard && guardPressed && f.parryCooldown <= 0) {
      f.parryTimer = 0.17;
      f.parryCooldown = 0.48;
    }
    if (!disabled) {
      const direction = Number(!!input.right) - Number(!!input.left);
      const depthDirection = Number(!!input.down) - Number(!!input.up);
      if (direction && !f.action) f.facing = direction;
      let speed = spec.speed;
      f.running = !!input.run && !!direction && f.grounded && !f.guard && !f.action;
      if (direction && depthDirection) speed *= Math.SQRT1_2;
      if (f.slow > 0) speed *= 0.5;
      if (f.guard) speed *= 0.32;
      if (f.action) speed *= 0.5;
      if (f.dashTime <= 0) {
        const forwardSpeed = speed * (f.running ? MOVEMENT.runMultiplier : 1);
        const depthSpeed = speed * (f.running ? MOVEMENT.runDepth : MOVEMENT.walkDepth);
        f.vx += (direction * forwardSpeed - f.vx) * Math.min(1, dt * (f.grounded ? 12 : 6));
        f.vDepth += (depthDirection * depthSpeed - f.vDepth) * Math.min(1, dt * 12);
      }
      this.consumeBuffer(f);
    } else {
      // Small recoil keeps linking hits in reach; launches retain their momentum.
      f.vx *= Math.exp(-dt * (f.thrown ? .15 : f.knockdown > 0 ? (f.grounded ? 8 : 1.3) : f.z > 20 ? 2 : 15));
      f.vDepth *= Math.exp(-dt * (f.thrown ? .15 : 5));
      if (f.frozen > 0) { f.vx = 0; f.vDepth = 0; }
      f.action = null;
      f.armor = false;
      f.guard = false;
      f.tell = 0;
    }

    if (f.action) {
      const action = f.action;
      const previousTime = action.t;
      action.t += dt;
      if (action.move && action.t <= action.activeUntil) f.x += f.facing * action.move.step * dt / action.activeUntil;
      if (action.connected && action.move?.followThrough && action.t > action.activeUntil) {
        const recoveryTime = Math.min(action.t, action.duration) - Math.max(previousTime, action.activeUntil);
        f.x += f.facing * action.move.followThrough * recoveryTime / action.move.recovery;
      }
      if (action.kind === 'melee' && action.t >= action.windup && action.t <= action.activeUntil) {
        action.done = true;
        this.melee(f);
      } else if (action.kind !== 'melee' && !action.done && action.t >= action.windup) {
        action.done = true;
        if (action.kind === 'throw') this.throwWeapon(f);
        else if (action.kind === 'special') this.shoot(f);
        else if (action.kind === 'burst') this.burst(f);
      }
      if (f.action && action.t >= action.duration) this.endAction(f);
    }
    if (f.hitLag > 0) {
      f.x = clamp(f.x, 30 + f.w / 2, 1250 - f.w / 2);
      return;
    }
    if (f.dashTime <= 0) {
      f.vy += GRAVITY * dt;
    }
    f.vy = Math.min(f.vy, 1200);
    const wasAirborne = !f.grounded;
    const landingVelocity = f.vy;
    moveFighter(f, dt);
    if (wasAirborne && f.grounded) {
      f.airChain = 0;
      if (f.action?.variant === 'aerial') this.endAction(f);
      if (f.knockdown > 0) {
        this.impact(f, null, Math.max(.6, landingVelocity / 900), true, 'land');
        this.state.effects.push({ x: f.x, y: f.depth, r: 42, life: .25, maxLife: .25, color: '#b2a58a', kind: 'shockwave' });
      } else f.juggle = 0;
    }
  }

  bufferInput(f, input) {
    if (f.recoveryRoll) { f.buffer = null; return; }
    if (f.knockdown > 0 && input.dash) {
      f.buffer = { kind: 'recover', ttl: INPUT_WINDOW,
        direction: input.attackDirection ?? Number(!!input.right) - Number(!!input.left),
        depthDirection: input.attackDepthDirection ?? Number(!!input.down) - Number(!!input.up) };
      return;
    }
    if (input.freshInput && f.buffer?.command) f.buffer = null;
    const kind = ['burst', 'special', 'throw', 'attack', 'dash', 'jump', 'interact'].find(key => input[key]);
    if (kind) f.buffer = {
      kind, command: !!input.command, ttl: input.command ? null : INPUT_WINDOW,
      launcher: kind === 'attack' && (input.launcher || (input.attackDepthDirection ?? Number(!!input.down) - Number(!!input.up)) < 0),
      direction: input.attackDirection ?? Number(!!input.right) - Number(!!input.left),
      depthDirection: input.attackDepthDirection ?? Number(!!input.down) - Number(!!input.up),
      // A jump/dash and a strike can arrive in the same browser frame.
      // Keep that pair as one intent instead of silently discarding the movement.
      mobility: ['attack', 'special', 'burst', 'throw'].includes(kind) ? input.dash ? 'dash' : input.jump ? 'jump' : null : null,
    };
  }

  tryRecoveryRoll(f) {
    const queued = f.buffer;
    if (queued?.kind !== 'recover' || f.knockdown <= 0 || !f.grounded || f.thrown ||
        f.downTime < .05 || f.frozen > 0 || f.grabbedBy != null || f.grabTarget != null) return false;
    const direction = queued.direction || (queued.depthDirection ? 0 : f.facing);
    const depthDirection = queued.depthDirection || 0;
    this.clearCombatInput(f);
    this.endAction(f);
    Object.assign(f, { recoveryRoll: { t: 0, duration: .42, direction, depthDirection },
      knockdown: 0, downTime: 0, stun: 0, stagger: 0, juggle: 0, hitReact: 0,
      guard: false, guardHeld: false, parryTimer: 0, running: false, dashTime: 0,
      z: 0, vy: 0, invulnerable: Math.max(f.invulnerable, .3) });
    if (direction) f.facing = direction;
    f.cooldowns.dash = Math.max(f.cooldowns.dash, .48);
    this.effect(f.x, f.depth - 4, '#b2a58a', 8);
    return true;
  }

  updateRecoveryRoll(f, dt) {
    const roll = f.recoveryRoll;
    const next = Math.min(roll.duration, roll.t + dt);
    const progress = (roll.t + next) / (2 * roll.duration);
    const speed = MOVEMENT.recoveryRollSpeed * (1 - .75 * progress);
    const diagonal = roll.direction && roll.depthDirection ? Math.SQRT1_2 : 1;
    f.vx = roll.direction * speed * diagonal;
    f.vDepth = roll.depthDirection * speed * .62 * diagonal;
    f.vy = 0;
    moveFighter(f, next - roll.t);
    roll.t = next;
    if (next >= roll.duration) {
      f.recoveryRoll = null;
      f.vx = f.vDepth = 0;
      this.clearCombatInput(f);
    }
  }

  endAction(f) {
    if (f.type === 'boss') this.bosses.cancel(this, f);
    f.action = null; f.armor = false; f.tell = 0; f.attackTimer = 0;
  }

  clearCombatInput(f) {
    f.buffer = null;
    f.comboTimer = 0;
    f.comboCount = 0;
    f.finisherWindow = 0;
    f.finisherTarget = null;
    f.inputRevision++;
  }

  inFinisherLane(f, target) {
    return !target.dead && target.hp > 0 && target.knockdown <= 0 &&
      (target.x - f.x) * f.facing >= -12 && Math.abs(target.depth - f.depth) < 32 &&
      Math.abs(target.z + target.h / 2 - f.z - f.h / 2) < 70;
  }

  updateFinisherWindow(f, dt = 0) {
    f.finisherWindow = Math.max(0, f.finisherWindow - dt);
    const reach = COMBAT[f.element].steps[2].reach;
    const target = this.targets(f).find(target => this.inFinisherLane(f, target) &&
      target.stun > 0 && target.hitType === 'dizzy' && Math.abs(target.x - f.x) < reach + target.w / 2);
    if (target) {
      // Inspired by kind-6 vulnerability contacts and LF2's three-tick marker.
      // Our original arena retains frontal targeting and its wider lane scale.
      f.finisherTarget = target.id;
      f.finisherWindow = 3 * COMBAT_TICK;
    } else if (f.finisherWindow < 1e-9) f.finisherTarget = null;
  }

  consumeBuffer(f) {
    const queued = f.buffer;
    if (!queued || f.dashTime > 0) return;
    if (queued.kind === 'recover') { f.buffer = null; return; }
    if (queued.afterDash) { queued.afterDash = false; queued.ttl = INPUT_WINDOW; }
    const kind = queued.kind;
    const skill = kind === 'special' || kind === 'burst';
    if (skill && f.energy < ELEMENTS[f.element][`${kind}Cost`]) {
      if (f.team === 'player') this.floater(f.x, f.y - 90, 'Need energy', '#64736b');
      f.buffer = null;
      return;
    }
    const action = f.action;
    if (action) {
      const launchChase = action.launched && (kind === 'jump' || queued.mobility === 'jump');
      const mobility = launchChase || (kind === 'jump' && f.element === 'air' && action.variant !== 'launcher') || (kind === 'dash' && ['air', 'fire'].includes(f.element));
      // Basic jabs finish recovery. Only our authored power/mobility links cancel.
      if (action.kind !== 'melee' || !action.connected || action.t < action.chainAt || !(skill || mobility)) return;
      if (queued.mobility === 'jump' && f.element !== 'air' && !launchChase) return;
      if (queued.mobility === 'dash' && !['air', 'fire'].includes(f.element)) return;
      if (skill && (f.cooldowns[kind] > 0 || f.energy < ELEMENTS[f.element][`${kind}Cost`])) return;
      if (kind === 'jump' && !f.grounded && f.jumps >= 2) return;
      if (kind === 'dash' && (f.cooldowns.dash > 0 || f.dashUsed || f.energy < 8)) return;
      this.endAction(f);
      if (mobility) f.cooldowns.attack = 0;
    }
    if (queued.mobility) {
      const movement = queued.mobility;
      queued.mobility = null;
      if (this.performMobility(f, movement, queued) && movement === 'dash') {
        // Simultaneous dash + strike is an explicit paired move in our game.
        // The strike's short input window starts when that dash completes.
        queued.afterDash = true;
        queued.ttl = null;
        return;
      }
    }
    if (kind === 'jump' || kind === 'dash') {
      if (this.performMobility(f, kind, queued)) f.buffer = null;
    } else if (kind === 'interact') {
      if (!this.grapples.tryGrab(this, f) && f.team === 'player') this.pickup(f);
      f.buffer = null;
    } else if (!f.guard) {
      if (queued.direction) f.facing = queued.direction;
      if (this.startAction(f, kind === 'attack' ? 'melee' : kind, queued.launcher)) f.buffer = null;
    }
  }

  performMobility(f, kind, queued) {
    if (kind === 'jump') {
      if (!f.grounded && f.jumps >= 2) return false;
      this.jump(f);
    } else if (kind === 'dash') {
      if (f.cooldowns.dash > 0 || f.dashUsed || f.energy < 8) return false;
      const { direction, depthDirection } = queued;
      f.dashTime = .17;
      f.dashUsed = true;
      f.cooldowns.dash = f.element === 'air' ? .55 : .85;
      f.invulnerable = Math.max(f.invulnerable, .22);
      const speed = f.element === 'air' ? MOVEMENT.airDashSpeed : MOVEMENT.dashSpeed;
      f.vx = (direction || (depthDirection ? 0 : f.facing)) * speed;
      f.vDepth = depthDirection * speed * .55;
      if (direction && depthDirection) { f.vx *= Math.SQRT1_2; f.vDepth *= Math.SQRT1_2; }
      f.vy = 0;
      f.energy -= 8;
      f.guard = false;
      this.effect(f.x, f.y - 30, ELEMENTS[f.element].color, 10);
    }
    return true;
  }

  jump(f) {
    if (f.grounded || f.jumps < 2) {
      if (f.grounded) f.jumps = 0;
      f.jumps++;
      f.vy = -(f.element === 'air' ? 660 : 600);
      this.effect(f.x, f.y, ELEMENTS[f.element].color, f.jumps === 2 ? 10 : 5);
    } else return;
    f.grounded = false;
    f.jumpTimer = 0.22;
  }

  startAction(f, kind, requestLauncher = false) {
    if (f.recoveryRoll || f.grabbedBy != null || f.grabTarget != null) return false;
    const spec = ELEMENTS[f.element];
    const basic = kind === 'melee' || kind === 'throw';
    const aerial = kind === 'melee' && !f.grounded;
    const launcher = kind === 'melee' && f.grounded && !f.weapon && requestLauncher;
    if (aerial && f.airChain >= COMBAT[f.element].aerial.length) return false;
    if (launcher && f.cooldowns.launcher > 0) return false;
    const key = basic ? 'attack' : kind;
    if (kind === 'throw' && !f.weapon) return false;
    if (f.cooldowns[key] > 0) return false;
    const cost = launcher ? 8 : basic ? 0 : spec[`${kind}Cost`];
    if (f.energy < cost) {
      if (f.team === 'player') this.floater(f.x, f.y - 90, 'Need energy', '#64736b');
      return false;
    }
    f.energy -= cost;
    if (kind === 'melee') {
      this.updateFinisherWindow(f);
      const target = this.targets(f).find(target => target.id === f.finisherTarget);
      const finish = !f.weapon && !f.running && f.finisherWindow > 0 && target && this.inFinisherLane(f, target);
      f.comboIndex = finish ? 3 : f.comboTimer > 0 && f.comboIndex === 1 ? 2 : 1;
      f.comboCount = f.comboTimer > 0 ? f.comboCount + 1 : 1;
      f.comboTimer = 1.05;
      if (finish) { f.finisherWindow = 0; f.finisherTarget = null; }
    }
    const airIndex = f.airChain;
    const move = kind === 'melee' ? { ...(aerial ? COMBAT[f.element].aerial[airIndex] : launcher ? COMBAT[f.element].launcher : COMBAT[f.element].steps[f.comboIndex - 1]) } : null;
    if (aerial) f.airChain++;
    if (launcher) { f.cooldowns.launcher = .8; f.running = false; }
    let windup = move?.windup ?? (kind === 'burst' ? .2 : .1);
    if (f.team === 'enemy') {
      // The same attack always has the same readable commitment. Difficulty
      // controls the AI's choice of when and where to use it.
      windup = kind === 'melee' ? windup + (aerial ? .035 : .10) : kind === 'burst' ? .85 : .55;
    }
    const activeUntil = windup + (move?.active ?? .07);
    const duration = activeUntil + (move?.recovery ?? (kind === 'burst' ? .23 : .1));
    f.action = { kind, variant: aerial ? 'aerial' : launcher ? 'launcher' : null, airIndex: aerial ? airIndex : null,
      t: 0, windup, activeUntil, duration, chainAt: activeUntil + COMBAT_TICK, done: false, connected: false, hitIds: [], move, weapon: f.weapon };
    f.cooldowns[key] = basic ? duration : spec[`${kind}Cooldown`];
    f.armor = !!move?.armor && f.grounded;
    if (kind === 'melee' && f.counterReady > 0) { f.action.counter = true; f.counterReady = 0; }
    f.attackKind = kind === 'melee' && !f.grounded ? 'aerial' : kind === 'melee' && f.running ? 'runAttack' : kind;
    f.attackTimer = f.action.duration;
    f.tell = windup;
    return true;
  }

  targets(f) { return f.team === 'player' ? this.state.enemies : [this.state.player]; }

  melee(f) {
    const spec = ELEMENTS[f.element];
    const action = f.action;
    const move = action?.move ?? COMBAT[f.element].steps[Math.max(0, f.comboIndex - 1)];
    const weapon = action?.weapon ?? f.weapon;
    const reach = weapon === 'spear' ? 142 : weapon === 'staff' ? 118 : f.type === 'boss' ? move.reach + 28 : move.reach;
    const heavy = action?.variant ? !!(move.knockdown || move.launcher) : f.comboIndex === 3 || f.attackKind === 'runAttack' || weapon === 'crate';
    const running = f.attackKind === 'runAttack';
    for (const target of this.targets(f)) {
      const dx = target.x - f.x;
      if (action?.hitIds.includes(target.id)) continue;
      if (!target.dead && Math.abs(target.depth - f.depth) < 32 && dx * f.facing > -12 && Math.abs(dx) < reach + target.w / 2 + (running ? 24 : 0) && Math.abs((target.z + target.h / 2) - (f.z + f.h / 2)) < (action?.variant === 'aerial' ? 96 : 70)) {
        const guarded = target.guard && target.facing === -f.facing;
        const landed = this.damage(target, (spec.damage + (weapon ? 9 : 0)) * (running ? 1.45 : move.damage) * (action?.counter ? 1.5 : 1), f.facing, f, {
          knockback: running ? spec.knockback * 1.5 : weapon === 'crate' ? 650 : move.knockback,
          element: f.element, knockdown: running || weapon === 'crate' || move.knockdown,
          heavy, light: !heavy, stun: move.stun, lift: running ? 270 : move.lift,
          launcher: !running && move.launcher, aerial: action?.variant === 'aerial', freeze: running ? 0 : action?.counter ? .6 : move.freeze,
          guardBreak: move.guardBreak, contact: true, fall: move.fall, spike: move.spike,
        });
        if (landed && action) {
          action.connected = true;
          action.hitIds.push(target.id);
          const blocked = guarded && target.guard;
          if (!blocked && target.hitType === 'launch' && target.vy < 0) action.launched = true;
          // A finite per-flight string earns hang time only on actual contact.
          if (!blocked && move.selfLift && !action.sustained && !f.grounded) {
            f.vy = -move.selfLift;
            action.sustained = true;
          }
        }
        if (f.action !== action) return; // A parry interrupts every remaining active frame.
      }
    }
    if (!action?.spentWeapon) {
      this.effect(f.x + f.facing * reach * .65, f.y - f.h * .55, spec.color, 5);
      if (action) action.spentWeapon = true;
      if (f.weapon && --f.weaponHits <= 0) {
        f.weapon = null;
        this.floater(f.x, f.y - 90, 'Weapon broke', '#7c7260');
      }
    }
  }

  shoot(f) {
    const spec = ELEMENTS[f.element];
    const params = {
      air: { speed: 930, r: 20, damage: 19, knockback: 760, gravity: 0 },
      water: { speed: 720, r: 15, damage: 25, knockback: 300, gravity: 0 },
      earth: { speed: 610, r: 24, damage: 38, knockback: 570, gravity: 160 },
      fire: { speed: 800, r: 12, damage: 20, knockback: 290, gravity: 0 },
    }[f.element];
    const angles = f.element === 'fire' ? [-0.15, 0, 0.15] : [0];
    const target = f.team === 'enemy' ? this.state.player : null;
    const aim = target ? clamp((target.depth - f.depth) / Math.max(160, Math.abs(target.x - f.x)), -0.18, 0.18) : 0;
    for (const angle of angles) {
      this.state.projectiles.push({ x: f.x + f.facing * 36, y: f.y - f.h * 0.55, depth: f.depth, z: f.z + f.h * 0.55, vDepth: params.speed * (angle + aim), vx: f.facing * params.speed, vy: f.element === 'earth' ? -50 : 0, r: params.r, element: f.element, team: f.team, life: 1.5, damage: params.damage, knockback: params.knockback, gravity: params.gravity, source: f });
    }
    this.effect(f.x + f.facing * 34, f.y - f.h * 0.55, spec.color, 10);
  }

  burst(f) {
    const spec = ELEMENTS[f.element];
    const radius = f.type === 'boss' ? 320 : f.element === 'air' ? 280 : 235;
    const s = this.state;
    s.effects.push({ x: f.x, y: f.y - 30, r: radius, life: 0.55, maxLife: 0.55,
      color: spec.color, kind: 'signature', element: f.element, groundY: f.depth });
    if (f.element === 'water') {
      f.hp = Math.min(f.maxHp, f.hp + (f.team === 'player' ? 28 : 12));
      this.floater(f.x, f.y - 100, '+ healing tide', spec.color);
    }
    if (f.element === 'air') { f.dashUsed = false; f.cooldowns.dash = 0; }
    if (f.element === 'earth') f.invulnerable = 0.65;
    for (const target of this.targets(f)) {
      if (Math.hypot(target.x - f.x, (target.depth - f.depth) * 1.4, target.z - f.z) > radius || target.dead) continue;
      const direction = Math.sign(target.x - f.x) || f.facing;
      const damage = { air: 30, water: 24, earth: 52, fire: 48 }[f.element];
      if (this.damage(target, damage, direction, f, { knockback: f.element === 'air' ? 950 : 650, element: f.element, knockdown: true })) {
        target.vy = f.element === 'air' ? -610 : -380;
        if (f.element === 'water') target.slow = 3.5;
        if (f.element === 'earth') target.stun = Math.max(target.stun, 0.7);
      }
    }
    this.effect(f.x, f.y - 30, spec.color, 36);
    s.shake = Math.max(s.shake, 7);
  }

  damage(target, amount, direction, source, options = {}) {
    const s = this.state;
    const landing = options.throwLanding && target.thrown;
    const recoveryRequest = landing && target.buffer?.kind === 'recover' ? target.buffer : null;
    const gripHit = options.grabPunch && source?.action?.kind === 'grabPunch' &&
      source.grabTarget === target.id && target.grabbedBy === source.id;
    if (options.grabPunch && !gripHit) return false;
    if (target.dead || (!landing && !gripHit && (target.invulnerable > 0 || target.knockdown > 0)) || target.hp <= 0) return false;
    // LF2 gates ordinary low-fall contact on falling victims. Our qualified
    // aerial routes replace that gate while keeping weak standing jabs out.
    if (options.contact && !target.grounded && target.juggle > 0 && (options.fall ?? 20) < 41 &&
        !options.aerial && !options.launcher && !options.freeze && !options.knockdown) return false;
    let knockback = options.knockback ?? 350;
    let heavy = !!(options.heavy || options.knockdown);
    let blocked = false;
    let guardBroken = false;
    const front = target.facing === -direction;
    if (target.guard && front && !options.unblockable) {
      if (target.parryTimer > 0) {
        if (options.contact && source && source !== target && source.cooldowns) {
          source.stun = .65;
          this.clearCombatInput(source);
          this.endAction(source);
          source.vx = -direction * 260;
          Object.assign(source, { hitReact: .24, hitMax: .24, hitDirection: -direction, hitStrength: .6, hitType: 'stagger' });
        }
        target.energy = Math.min(100, target.energy + 12);
        target.invulnerable = .16;
        if (target.element === 'water') target.counterReady = 1.5;
        this.floater(target.x, target.y - target.h - 12, target.element === 'water' ? 'TIDAL COUNTER' : 'PARRY', '#397d77');
        this.effect(target.x, target.y - target.h / 2, '#fffdf0', 18);
        this.impact(target, source, .7, false, 'parry');
        this.contactPause(target, options.contact ? source : null, 3);
        if (target.team === 'player') s.score += 25;
        return false;
      }
      if (target.energy >= 10 && !options.guardBreak) {
        blocked = true;
        target.energy -= 10;
        amount *= .2;
        knockback *= .25;
        this.floater(target.x, target.y - target.h - 8, 'BLOCK', '#718b8b');
      } else {
        guardBroken = true;
        target.guard = false;
        target.energy = Math.max(0, target.energy - 20);
        this.floater(target.x, target.y - target.h - 8, 'GUARD BREAK', '#bd6a45');
      }
    }
    const shatter = target.frozen > 0 && !blocked;
    if (shatter) {
      target.frozen = 0;
      amount *= 1.25;
      heavy = true;
      knockback = Math.max(knockback, 480);
      this.floater(target.x, target.y - target.h - 16, 'SHATTER', '#419da6');
    }
    if (source?.team === 'enemy') amount *= source.type === 'boss' ? 1.25 : 0.72;
    if (!blocked && !landing && !gripHit && !target.grounded && target.juggle > 0) amount /= 1 + target.juggle * .2;
    if (target.element === 'earth') { amount *= 0.86; knockback *= 0.75; }
    if (target.type === 'boss') knockback *= 0.55;
    const armored = target.armor && !heavy && !guardBroken;
    if (armored && target.bossAction?.poise != null) {
      target.bossAction.poiseHits = (target.bossAction.poiseHits ?? 0) + 1;
      target.armor = target.bossAction.poiseHits < target.bossAction.poise;
    }
    const guardedCounter = blocked && !guardBroken && target.bossAction?.move === 'tide-counter';
    if (!gripHit && !blocked && !armored && (target.grabTarget != null || target.grabbedBy != null)) this.grapples.release(this, target);
    if (armored) amount *= .6;
    if (!gripHit && !blocked && !armored) {
      // Fall pressure is independent of health damage. Bands preserve pressure
      // between quick hits; backing away lets it drain. Elemental finishers keep
      // their launch/freeze behavior, and bosses retain their shorter reactions.
      const pressure = target.stagger + (options.fall ?? 20);
      target.stagger = pressure > 40 ? 60 : pressure > 20 ? 40 : pressure > 0 ? 20 : 0;
      if (pressure > 60 && target.grounded && !options.launcher && !options.freeze && target.type !== 'boss') {
        options = { ...options, knockdown: true };
        heavy = true;
      }
    }
    target.hp = Math.max(0, target.hp - amount);
    target.invulnerable = target.team === 'player' ? .28 : .075;
    if (gripHit) {
      this.endAction(target);
      this.clearCombatInput(target);
      Object.assign(target, { vx: 0, vy: 0, vDepth: 0, hitReact: .22, hitMax: .22,
        hitDirection: direction, hitStrength: .75, hitType: 'grabHit' });
    } else if (!armored) {
      target.recoveryRoll = null;
      if (!guardedCounter) this.endAction(target);
      if (!blocked) this.clearCombatInput(target);
      if (recoveryRequest) target.buffer = recoveryRequest;
      target.vx = direction * knockback;
      const airborne = !target.grounded && (target.z > 8 || target.juggle > 0);
      if (!blocked && (options.launcher || airborne)) target.juggle++;
      const knockedDown = !blocked && target.type !== 'boss' && (options.knockdown || shatter || target.juggle >= 4);
      const dizzy = !blocked && !knockedDown && !options.launcher && !options.freeze && target.stagger >= 60;
      const lift = blocked || (options.freeze && !shatter) ? 0 : shatter ? 270 : options.lift ?? (knockedDown ? 220 : options.light ? (airborne ? 160 : 0) : 190 + Math.abs(knockback) * .12);
      if (lift > 0) { target.vy = -lift; target.grounded = false; }
      if (!blocked && airborne && options.spike) target.vy = options.spike;
      const stun = blocked ? .1 : guardBroken || dizzy ? .65 : options.stun ?? 7 * COMBAT_TICK;
      target.stun = guardedCounter ? 0 : Math.max(target.stun, target.type === 'boss' && !guardBroken ? Math.min(stun, .28) : stun);
      if (knockedDown) {
        // Recovery starts on the floor, so a launched fighter never gets up midair.
        target.knockdown = .55;
        target.downTime = 0;
        target.stagger = 0;
        if (!shatter) this.floater(target.x, target.y - target.h - 14, 'KNOCKDOWN', '#7b6554');
      } else if (dizzy && target.type !== 'boss') {
        this.floater(target.x, target.y - target.h - 14, 'STAGGER', '#9a7935');
      }
      if (!blocked && options.freeze && !shatter && !knockedDown) {
        target.frozen = target.type === 'boss' ? options.freeze * .45 : options.freeze;
        target.vx = 0;
        target.burn = 0;
        this.floater(target.x, target.y - target.h - 14, 'FROZEN', '#419da6');
      }
      const react = heavy ? .28 : .18;
      Object.assign(target, {
        hitReact: react, hitMax: react, hitDirection: direction,
        hitStrength: heavy ? 1 : blocked ? .25 : .55,
        hitType: target.frozen > 0 ? 'freeze' : knockedDown ? 'slam' : options.launcher ? 'launch' : dizzy || guardBroken ? 'dizzy' : 'stagger',
      });
      if (!blocked) {
        target.guard = false;
        if (options.element === 'water') target.slow = 1.8;
        if (options.element === 'fire') { target.burn = 1.8; target.burnTick = .4; }
      }
    } else {
      this.floater(target.x, target.y - target.h - 12, 'ARMOR', '#8b7a42');
    }
    if (source?.team === 'player' && !blocked) {
      source.energy = Math.min(100, source.energy + (source.attackKind === 'melee' ? 5 : 1));
      s.combo++;
      s.comboTimer = 2;
    }
    this.floater(target.x, target.y - target.h, `${Math.ceil(amount)}`, ELEMENTS[source?.element || target.element].color);
    this.effect(target.x, target.y - target.h / 2, ELEMENTS[target.element].color, heavy ? 18 : 7);
    this.impact(target, source, blocked || armored ? .3 : heavy ? 1 : .55, heavy && !blocked, blocked || armored ? 'block' : 'hit');
    this.contactPause(target, options.contact ? source : null, blocked || armored ? 5 : 3);
    return true;
  }

  contactPause(target, source, victimTicks) {
    target.hitLag = Math.max(target.hitLag, victimTicks * COMBAT_TICK);
    target.hitLagAt = this.state.time;
    if (source && source !== target) {
      source.hitLag = Math.max(source.hitLag, 3 * COMBAT_TICK);
      source.hitLagAt = this.state.time;
    }
  }

  impact(target, source, strength, heavy, kind = 'hit') {
    const s = this.state;
    const element = source?.element || target.element;
    strength = clamp(strength, 0, 1);
    s.lastImpact = { id: (s.lastImpact?.id || 0) + 1, element, heavy, kind, team: target.team, strength };
    s.impacts.push(s.lastImpact);
    if (s.impacts.length > 16) s.impacts.shift();
    s.shake = Math.max(s.shake, kind === 'land' ? 2.5 : heavy ? 8 : kind === 'parry' ? 4 : 3 * strength);
    if (kind !== 'land') s.effects.push({
      x: target.x, y: target.y - target.h * .55, life: heavy ? .28 : .22,
      maxLife: heavy ? .28 : .22, color: kind === 'parry' ? '#fffdf0' : ELEMENTS[element].color,
      r: heavy ? 34 : 22, kind: 'impact', direction: target.hitDirection, heavy, element, impactKind: kind,
    });
  }

  pickup(f) {
    if (!f.grounded) return;
    const index = this.state.weapons.findIndex(w => Math.abs((w.depth ?? w.y) - f.depth) < 35 && Math.abs(w.x - f.x) < 70);
    if (index < 0) {
      if (f.weapon) {
        this.state.weapons.push({ x: f.x + f.facing * 30, y: f.depth, depth: f.depth, kind: f.weapon, life: 20, uses: f.weaponHits });
        f.weapon = null;
        f.weaponHits = 0;
      }
      return;
    }
    const [weapon] = this.state.weapons.splice(index, 1);
    if (weapon.kind === 'heal' || weapon.kind === 'energy') {
      if (weapon.kind === 'heal') f.hp = Math.min(f.maxHp, f.hp + 40);
      else f.energy = Math.min(f.maxEnergy, f.energy + 55);
      this.floater(f.x, f.y - 95, weapon.kind === 'heal' ? '+ HEALTH' : '+ ENERGY', weapon.kind === 'heal' ? '#56905d' : '#427fa7');
      this.effect(f.x, f.y - 30, '#8fbca0', 14);
      return;
    }
    if (f.weapon) this.state.weapons.push({ x: f.x - f.facing * 35, y: f.depth, depth: f.depth, kind: f.weapon, life: 20, uses: f.weaponHits });
    f.weapon = weapon.kind;
    f.weaponHits = weapon.uses ?? (weapon.kind === 'staff' ? 20 : weapon.kind === 'crate' ? 1 : 14);
    this.floater(f.x, f.y - 100, `${weapon.kind.toUpperCase()} EQUIPPED`, '#6e6856');
  }

  throwWeapon(f) {
    if (!f.weapon) return;
    const crate = f.weapon === 'crate';
    this.state.projectiles.push({ x: f.x + f.facing * 38, y: f.y - 35, depth: f.depth, z: f.z + 35, vDepth: 0, vx: f.facing * (crate ? 620 : 900), vy: -90, r: crate ? 25 : 14, kind: 'weapon', weapon: f.weapon, element: f.element, team: f.team, life: 1.5, damage: crate ? 48 : 32, knockback: crate ? 800 : 560, gravity: 240, source: f });
    this.effect(f.x + f.facing * 35, f.y - 35, '#b99459', 8);
    f.weapon = null;
    f.weaponHits = 0;
  }

  enemyInput(e) {
    const p = this.state.player;
    const dx = p.x - e.x;
    const lane = p.depth - e.depth;
    const input = {};
    // The controller also chooses recovery rolls while knocked down. Let it
    // see disabled fighters; updateFighter still enforces every action gate.
    if (e.bossAction) return input;
    if (e.type === 'dummy') {
      if (!e.action) e.facing = dx >= 0 ? 1 : -1;
      if (!p.dead && p.hp > 0 && p.knockdown <= 0 && Math.abs(dx) < 100 && Math.abs(lane) < 30 && e.aiTimer <= 0) { input.attack = true; e.aiTimer = 2.2; }
      return input;
    }
    return this.enemyAI.input(this, e);
  }

  separateFighters(dt) {
    const fighters = [this.state.player, ...this.state.enemies];
    for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i], b = fighters[j];
      if (a.grabTarget === b.id || b.grabTarget === a.id || a.thrown || b.thrown || a.recoveryRoll || b.recoveryRoll) continue;
      if (a.dead || b.dead || a.dashTime > 0 || b.dashTime > 0 || Math.abs(a.depth - b.depth) > 24 || Math.abs(a.z - b.z) > 45) continue;
      const dx = b.x - a.x;
      const distance = (a.w + b.w) / 2;
      if (Math.abs(dx) < distance) {
        const push = Math.sign(dx || (b.id - a.id)) * (distance - Math.abs(dx)) * Math.min(0.25, dt * 8);
        if (a.hitLag <= 0 && a.hitLagAt !== this.state.time) a.x -= push;
        if (b.hitLag <= 0 && b.hitLagAt !== this.state.time) b.x += push;
      }
    }
  }

  updateProjectiles(dt) {
    const s = this.state;
    for (const shot of s.projectiles) {
      shot.life -= dt;
      shot.vy += (shot.gravity || 0) * dt;
      shot.x += shot.vx * dt;
      shot.depth ??= shot.y + 35;
      shot.z ??= 35;
      shot.depth += (shot.vDepth || 0) * dt;
      shot.z -= shot.vy * dt;
      shot.y = shot.depth - shot.z;
      if (shot.z < 0) { shot.life = 0; this.effect(shot.x, shot.depth, ELEMENTS[shot.element].color, 5); }
      if (shot.life <= 0) continue;
      const targets = shot.team === 'player' ? s.enemies : [s.player];
      for (const target of targets) {
        if (target.dead || target.hp <= 0 || target.invulnerable > 0 || Math.abs(target.depth - shot.depth) > 28) continue;
        const nearestX = clamp(shot.x, target.x - target.w / 2, target.x + target.w / 2);
        const nearestY = clamp(shot.y, target.y - target.h, target.y);
        if (Math.hypot(shot.x - nearestX, shot.y - nearestY) < shot.r) {
          const direction = Math.sign(shot.vx);
          const reflect = target.guard && target.parryTimer > 0 && target.facing === -direction;
          this.damage(target, shot.damage, direction, shot.source, { knockback: shot.knockback, element: shot.element, knockdown: shot.kind === 'weapon' || shot.element === 'earth' });
          if (reflect) {
            shot.vx *= -1;
            shot.vy *= -1;
            shot.vDepth = -(shot.vDepth || 0);
            shot.team = target.team;
            shot.source = target;
            shot.x = target.x + target.facing * (shot.r + target.w / 2 + 6);
            shot.life = 1.2;
          } else shot.life = 0;
          break;
        }
      }
    }
    s.projectiles = s.projectiles.filter(p => p.life > 0 && p.x > -100 && p.x < 1380 && p.y < 900);
  }

  resolveDeaths() {
    const s = this.state;
    for (const e of s.enemies) {
      if (!e.dead && e.hp > 0) continue;
      this.grapples.release(this, e);
      e.dead = true;
      s.kills++;
      s.score += e.type === 'boss' ? 1000 : 100;
      // The body topples away from the blow (fall = the side its head goes, as in a knockdown)
      // and settles lying flat; one already lying keeps lying the same way.
      const vx = e.vx || (e.facing * -180);
      const down = e.knockdown > 0;
      const fall = (down && Math.sign(e.hitDirection || 0)) || (vx < 0 ? -1 : 1);
      s.corpses.push({ x: e.x, y: e.y, depth: e.depth, z: e.z, vx, vy: Math.min(e.vy, -260), fall, rotation: fall * Math.PI * (down && e.grounded ? 0.5 : 0.2),
        settle: 4 + this.random() * 6, life: 2.8, element: e.element, h: e.h, type: e.type, bossPhase: e.bossPhase });
      this.floater(e.x, Math.min(e.y - e.h, 640), e.type === 'boss' ? 'GUARDIAN FALLEN' : 'KO', ELEMENTS[e.element].color);
      if (e.type === 'boss') { s.slowMotion = 0.7; s.shake = 10; }
      s.player.energy = Math.min(100, s.player.energy + 8);
    }
    s.enemies = s.enemies.filter(e => !e.dead);
    const p = s.player;
    if (p.hp > 0) return;
    s.bossHazards = [];
    for (const enemy of s.enemies) if (enemy.type === 'boss') this.bosses.cancel(this, enemy);
    this.grapples.release(this, p);
    p.thrown = null;
    p.recoveryRoll = null;
    p.downTime = 0;
    const training = s.settings.mode === 'training';
    if (!training) s.lives--;
    if (s.lives <= 0) {
      p.dead = true;
      s.status = 'lost';
      s.objective = 'Your journey continues. Try another element or take a breath and retry.';
      return;
    }
    this.placePlayer();
    p.hp = p.maxHp;
    p.energy = 100;
    p.invulnerable = 2.5;
    p.weapon = null;
    p.weaponHits = 0;
    p.cooldowns = { attack: 0, special: 0, burst: 0, dash: 0, launcher: 0 };
    s.projectiles = s.projectiles.filter(shot => shot.team === 'player');
    this.banner(training ? 'Keep practicing' : `${s.lives} ${s.lives === 1 ? 'life' : 'lives'} remaining`);
  }

  effect(x, y, color, count) {
    const s = this.state;
    for (let i = 0; i < count && s.particles.length < 350; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 50 + this.random() * 230;
      const life = 0.2 + this.random() * 0.4;
      s.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size: 2 + this.random() * 4 });
    }
  }

  floater(x, y, text, color) {
    if (this.state.floaters.length < 40) this.state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  updateVisuals(dt) {
    const s = this.state;
    for (const p of s.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; }
    s.particles = s.particles.filter(p => p.life > 0);
    for (const f of s.floaters) { f.life -= dt; f.y -= dt * 36; }
    s.floaters = s.floaters.filter(f => f.life > 0);
    for (const e of s.effects) e.life -= dt;
    s.effects = s.effects.filter(e => e.life > 0);
    for (const c of s.corpses) {
      c.life -= dt;
      c.vy += 1100 * dt;
      c.x = clamp(c.x + c.vx * dt, 40, 1240);
      c.z -= c.vy * dt;
      if (c.z < 0) { c.z = 0; c.vy *= -0.3; c.vx *= 0.65; }
      c.y = c.depth - c.z;
      // Ease toward lying flat with the limbs to the floor (the renderer flips the body by fall).
      c.rotation += (c.fall * Math.PI / 2 - c.rotation) * (1 - Math.exp(-c.settle * dt));
    }
    s.corpses = s.corpses.filter(c => c.life > 0 && c.y < 1000);
    for (const w of s.weapons) w.life -= dt;
    s.weapons = s.weapons.filter(w => w.life > 0);
  }
}
