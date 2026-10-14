import { ELEMENTS, ARENAS, MODES, DIFFICULTIES } from './data.js';
import { GRAVITY, clamp, moveFighter } from './physics.js';

const elements = Object.keys(ELEMENTS);
const countdowns = ['invulnerable', 'stun', 'parryTimer', 'parryCooldown', 'dashTime', 'slow', 'burn', 'attackTimer', 'tell', 'aiTimer', 'jumpTimer', 'comboTimer', 'knockdown'];
const stories = ['The wind has gone silent.', 'The harbor has frozen over.', 'The stone guardians have awakened.', 'One final flame. Restore the balance.'];

export class Game {
  constructor(config = {}) {
    const settings = {
      element: config.element in ELEMENTS ? config.element : 'air',
      arena: config.arena in ARENAS ? config.arena : 'air',
      mode: config.mode in MODES ? config.mode : 'survival',
      difficulty: config.difficulty in DIFFICULTIES ? config.difficulty : 'normal',
    };
    this.seed = config.seed ?? 61721;
    this.nextId = 0;
    this.difficulty = DIFFICULTIES[settings.difficulty];
    this.state = {
      settings, status: 'ready', time: 0, wave: 0, kills: 0, score: 0,
      lives: settings.mode === 'challenge' ? 1 : 3,
      player: null, enemies: [], projectiles: [], particles: [], effects: [],
      floaters: [], corpses: [], weapons: [],
      arena: settings.arena, shake: 0, slowMotion: 0, hitStop: 0,
      banner: 'Find your element', bannerTime: 0, objective: MODES[settings.mode].objective,
      waveDelay: -1, weaponTimer: 10, combo: 0, comboTimer: 0,
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
    const hp = team === 'player' ? spec.hp : (boss ? 320 + this.state.wave * 32 : type === 'dummy' ? 180 : 48 + this.state.wave * 4) * this.difficulty.health;
    return {
      id: ++this.nextId, team, type, element, x, y, depth: y, z: 0, vDepth: 0, vx: 0, vy: 0,
      w: boss ? 46 : 28, h: boss ? 104 : 66, hp, maxHp: hp,
      energy: 100, maxEnergy: 100, facing: team === 'player' ? 1 : -1,
      grounded: true, jumps: 0, attackTimer: 0, attackKind: '',
      guard: false, parryTimer: 0, parryCooldown: 0, invulnerable: 0,
      stun: 0, cooldowns: { attack: 0, special: 0, burst: 0, dash: 0 },
      weapon: null, weaponHits: 0, dead: false, aiTimer: 0.8 + this.random(),
      bossPhase: 1, tell: 0, action: null,
      dashTime: 0, dashUsed: false, slow: 0, burn: 0, jumpTimer: 0, burnTick: 0,
      comboIndex: 0, comboTimer: 0, running: false, knockdown: 0,
    };
  }

  start() {
    if (this.state.status !== 'ready') return;
    this.state.status = 'playing';
    this.state.player.invulnerable = 1.2;
    this.beginWave();
  }

  togglePause() {
    if (this.state.status === 'playing') this.state.status = 'paused';
    else if (this.state.status === 'paused') this.state.status = 'playing';
  }

  placePlayer() {
    const s = this.state;
    Object.assign(s.player, { x: 590, y: 555, depth: 555, z: 0, vDepth: 0, vx: 0, vy: 0, grounded: true, jumps: 0, dashUsed: false, dashTime: 0, stun: 0, burn: 0, slow: 0, action: null, guard: false, parryTimer: 0, attackTimer: 0, tell: 0, knockdown: 0, comboIndex: 0, comboTimer: 0 });
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
    if (mode === 'story') {
      s.arena = elements[s.wave - 1];
      s.projectiles = [];
      s.weapons = [];
      s.corpses = [];
      this.placePlayer();
      s.player.invulnerable = 1.5;
      s.objective = stories[s.wave - 1];
    }
    if (mode === 'training') {
      this.spawnEnemy({ dummy: true, element: 'earth', x: s.player.x + 190, y: s.player.y });
      this.banner('Training grounds');
    } else if (mode === 'tournament') {
      this.spawnEnemy({ boss: true, element: elements[(s.wave + elements.indexOf(s.settings.element)) % 4] });
      this.banner(`Guardian ${s.wave} / 3`);
    } else if (mode === 'story') {
      this.spawnEnemy({ boss: true, element: s.arena });
      for (let i = 0; i < 2; i++) this.spawnEnemy({ element: s.arena });
      this.banner(`Chapter ${s.wave} · ${ARENAS[s.arena].name}`);
    } else {
      const bossWave = mode === 'survival' && s.wave % 3 === 0;
      const count = mode === 'challenge' ? 4 : Math.min(4 + s.wave, 13);
      for (let i = 0; i < (bossWave ? Math.max(2, count - 3) : count); i++) this.spawnEnemy();
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
    s.time += dt;
    s.shake = Math.max(0, s.shake - dt * 24);
    s.slowMotion = Math.max(0, s.slowMotion - dt);
    s.hitStop = Math.max(0, s.hitStop - dt);
    const step = s.slowMotion > 0 ? dt * 0.5 : dt;
    s.bannerTime = Math.max(0, s.bannerTime - dt);
    s.comboTimer = Math.max(0, s.comboTimer - dt);
    if (!s.comboTimer) s.combo = 0;
    this.updateVisuals(step);
    if (s.hitStop > 0) return;

    this.updateFighter(s.player, input, step);
    for (const e of s.enemies) {
      if (e.dead || e.hp <= 0) continue;
      this.updateFighter(e, this.enemyInput(e), step);
    }
    this.separateFighters(step);
    this.updateProjectiles(step);
    this.resolveDeaths();
    if (s.status !== 'playing') return;
    if (s.settings.mode === 'training') {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + dt * 18);
      s.player.energy = Math.min(100, s.player.energy + dt * 15);
      if (!s.enemies.length) this.spawnEnemy({ dummy: true, element: 'earth', x: s.player.x < 640 ? 850 : 430, y: 400 });
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
    const spec = ELEMENTS[f.element];
    for (const key of countdowns) f[key] = Math.max(0, (f[key] || 0) - dt);
    for (const key of Object.keys(f.cooldowns)) f.cooldowns[key] = Math.max(0, f.cooldowns[key] - dt);
    f.energy = Math.min(f.maxEnergy, f.energy + dt * (f.guard ? 2 : f.team === 'player' ? 14 : 18));
    if (f.burn > 0) {
      f.burnTick -= dt;
      if (f.burnTick <= 0) {
        f.hp = Math.max(0, f.hp - 3);
        f.burnTick = 0.45;
        this.effect(f.x, f.y - f.h / 2, '#cf7041', 3);
      }
    }
    if (f.hp <= 0) { f.action = null; f.guard = false; return; }
    const disabled = f.stun > 0 || f.knockdown > 0;
    const wasGuarding = f.guard;
    f.guard = !!input.guard && !disabled && f.dashTime <= 0 && !f.action;
    if (f.guard && !wasGuarding && f.parryCooldown <= 0) {
      f.parryTimer = 0.17;
      f.parryCooldown = 0.48;
    }
    if (!disabled) {
      const direction = Number(!!input.right) - Number(!!input.left);
      const depthDirection = Number(!!input.down) - Number(!!input.up);
      if (direction && !f.action) f.facing = direction;
      let speed = spec.speed * (f.team === 'enemy' ? 0.65 * this.difficulty.speed : 1);
      f.running = !!input.run && !!direction && f.grounded && !f.guard && !f.action;
      if (f.running) speed *= 1.65;
      if (direction && depthDirection) speed *= Math.SQRT1_2;
      if (f.slow > 0) speed *= 0.5;
      if (f.guard) speed *= 0.32;
      if (f.action) speed *= 0.5;
      if (f.dashTime <= 0) {
        f.vx += (direction * speed - f.vx) * Math.min(1, dt * (f.grounded ? 12 : 6));
        f.vDepth += (depthDirection * speed * 0.58 - f.vDepth) * Math.min(1, dt * 12);
      }
      if (input.jump) this.jump(f);
      if (input.dash && f.cooldowns.dash <= 0 && !f.dashUsed && f.energy >= 8) {
        f.dashTime = 0.17;
        f.dashUsed = true;
        f.cooldowns.dash = f.element === 'air' ? 0.55 : 0.85;
        f.invulnerable = 0.22;
        const dashSpeed = f.element === 'air' ? 1000 : 820;
        f.vx = (direction || (depthDirection ? 0 : f.facing)) * dashSpeed;
        f.vDepth = depthDirection * dashSpeed * 0.55;
        if (direction && depthDirection) { f.vx *= Math.SQRT1_2; f.vDepth *= Math.SQRT1_2; }
        f.vy = 0;
        f.energy -= 8;
        f.guard = false;
        this.effect(f.x, f.y - 30, spec.color, 10);
      }
      if (!f.guard && !f.action && f.dashTime <= 0) {
        if (input.throw) this.startAction(f, 'throw');
        else if (input.burst) this.startAction(f, 'burst');
        else if (input.special) this.startAction(f, 'special');
        else if (input.attack) this.startAction(f, 'melee');
      }
      if (input.interact && f.team === 'player') this.pickup(f);
    } else {
      f.vx *= Math.exp(-dt * 1.5);
      f.vDepth *= Math.exp(-dt * 5);
      f.action = null;
      f.guard = false;
      f.tell = 0;
    }

    if (f.action) {
      f.action.t += dt;
      if (!f.action.done && f.action.t >= f.action.windup) {
        f.action.done = true;
        if (f.action.kind === 'melee') this.melee(f);
        else if (f.action.kind === 'throw') this.throwWeapon(f);
        else if (f.action.kind === 'special') this.shoot(f);
        else this.burst(f);
      }
      if (f.action && f.action.t >= f.action.duration) f.action = null;
    }
    if (f.dashTime <= 0) {
      f.vy += GRAVITY * dt;
    }
    f.vy = Math.min(f.vy, 1200);
    moveFighter(f, dt);
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

  startAction(f, kind) {
    const spec = ELEMENTS[f.element];
    const basic = kind === 'melee' || kind === 'throw';
    const key = basic ? 'attack' : kind;
    if (kind === 'throw' && !f.weapon) return false;
    if (f.cooldowns[key] > 0) return false;
    const cost = basic ? 0 : spec[`${kind}Cost`];
    if (f.energy < cost) {
      if (f.team === 'player') this.floater(f.x, f.y - 90, 'Need energy', '#64736b');
      return false;
    }
    f.energy -= cost;
    f.cooldowns[key] = basic ? spec.attackSpeed : spec[`${kind}Cooldown`];
    const windup = f.team === 'player' ? (kind === 'burst' ? 0.2 : kind === 'melee' ? 0.065 : 0.1) : (kind === 'burst' ? 0.85 : kind === 'melee' ? 0.36 : 0.55) * this.difficulty.aggression;
    f.action = { kind, t: 0, windup, duration: windup + (kind === 'burst' ? 0.3 : 0.17), done: false };
    if (kind === 'melee') {
      f.comboIndex = f.comboTimer > 0 ? f.comboIndex % 3 + 1 : 1;
      f.comboTimer = 0.95;
    }
    f.attackKind = kind === 'melee' && !f.grounded ? 'aerial' : kind === 'melee' && f.running ? 'runAttack' : kind;
    f.attackTimer = f.action.duration;
    f.tell = windup;
    return true;
  }

  targets(f) { return f.team === 'player' ? this.state.enemies : [this.state.player]; }

  melee(f) {
    const spec = ELEMENTS[f.element];
    const reach = f.weapon === 'spear' ? 142 : f.weapon === 'staff' ? 112 : f.type === 'boss' ? 110 : 78;
    const heavy = f.comboIndex === 3 || f.attackKind === 'runAttack' || f.weapon === 'crate';
    const running = f.attackKind === 'runAttack';
    for (const target of this.targets(f)) {
      const dx = target.x - f.x;
      if (!target.dead && Math.abs(target.depth - f.depth) < 32 && dx * f.facing > -16 && Math.abs(dx) < reach + target.w / 2 + (running ? 24 : 0) && Math.abs((target.z + target.h / 2) - (f.z + f.h / 2)) < 64) {
        this.damage(target, (spec.damage + (f.weapon ? 9 : 0)) * (heavy ? 1.5 : 1), f.facing, f, { knockback: heavy ? spec.knockback * 1.6 : spec.knockback * 0.36, element: f.element, knockdown: heavy, light: !heavy });
      }
    }
    this.effect(f.x + f.facing * reach * 0.65, f.y - f.h * 0.55, spec.color, 5);
    if (f.weapon && --f.weaponHits <= 0) {
      f.weapon = null;
      this.floater(f.x, f.y - 90, 'Weapon broke', '#7c7260');
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
    s.effects.push({ x: f.x, y: f.y - 30, r: radius, life: 0.55, maxLife: 0.55, color: spec.color, kind: f.element === 'earth' ? 'shockwave' : 'ring' });
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
    if (target.dead || target.invulnerable > 0 || target.hp <= 0) return false;
    let knockback = options.knockback ?? 350;
    const front = target.facing === -direction;
    if (target.guard && front && !options.unblockable) {
      if (target.parryTimer > 0) {
        if (source && source !== target && source.cooldowns) { source.stun = 0.8; source.action = null; source.tell = 0; source.vx = -direction * 260; }
        target.energy = Math.min(100, target.energy + 12);
        target.invulnerable = 0.16;
        this.floater(target.x, target.y - target.h - 12, 'PARRY', '#397d77');
        this.effect(target.x, target.y - target.h / 2, '#fffdf0', 18);
        s.hitStop = 0.055;
        if (target.team === 'player') s.score += 25;
        return false;
      }
      if (target.energy >= 10) {
        target.energy -= 10;
        amount *= 0.2;
        knockback *= 0.25;
        this.floater(target.x, target.y - target.h - 8, 'BLOCK', '#718b8b');
      } else {
        target.guard = false;
        target.stun = 0.65;
        this.floater(target.x, target.y - target.h - 8, 'GUARD BREAK', '#bd6a45');
      }
    }
    if (source?.team === 'enemy') amount *= this.difficulty.damage * (source.type === 'boss' ? 1.25 : 0.72);
    if (target.element === 'earth') { amount *= 0.86; knockback *= 0.75; }
    if (target.type === 'boss') knockback *= 0.55;
    target.hp = Math.max(0, target.hp - amount);
    target.vx = direction * knockback;
    target.vy = Math.min(target.vy, options.light ? -70 : -190 - knockback * 0.12);
    target.grounded = false;
    target.stun = Math.max(target.stun, target.type === 'boss' ? 0.12 : options.element === 'earth' ? 0.35 : 0.2);
    target.invulnerable = target.team === 'player' ? 0.34 : 0.09;
    if (options.knockdown && target.type !== 'boss' && !target.guard) {
      target.knockdown = 0.8;
      target.invulnerable = 1.05;
      this.floater(target.x, target.y - target.h - 14, 'KNOCKDOWN', '#7b6554');
    }
    if (options.element === 'water') target.slow = 1.8;
    if (options.element === 'fire' && !target.guard) { target.burn = 1.8; target.burnTick = 0.4; }
    if (source?.team === 'player') {
      source.energy = Math.min(100, source.energy + (source.attackKind === 'melee' ? 5 : 1));
      s.combo++;
      s.comboTimer = 2;
    }
    this.floater(target.x, target.y - target.h, `${Math.ceil(amount)}`, ELEMENTS[source?.element || target.element].color);
    this.effect(target.x, target.y - target.h / 2, ELEMENTS[target.element].color, 12);
    s.shake = Math.max(s.shake, target.team === 'player' ? 6 : 3);
    s.hitStop = 0.035;
    return true;
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
    if (e.stun > 0 || e.knockdown > 0) return input;
    const boss = e.type === 'boss';
    if (!e.action) e.facing = dx >= 0 ? 1 : -1;
    if (boss && e.hp < e.maxHp * 0.5 && e.bossPhase === 1) {
      e.bossPhase = 2;
      e.energy = 100;
      e.aiTimer = 0.3;
      this.banner(`${ELEMENTS[e.element].name} guardian · unleashed`);
      this.effect(e.x, e.y - 50, ELEMENTS[e.element].color, 22);
    }
    if (e.type === 'dummy') {
      if (Math.abs(dx) < 100 && Math.abs(lane) < 30 && e.aiTimer <= 0) { input.attack = true; e.aiTimer = 2.2; }
      return input;
    }
    // Opponents form a loose crowd around the player's lane rather than
    // overlapping into one indistinguishable stack. Their attacks stay committed.
    const flank = (e.id % 3 - 1) * 14;
    const laneGap = lane + flank;
    if (!e.action) {
      input.up = laneGap < -10;
      input.down = laneGap > 10;
      if (Math.abs(dx) > (boss ? 92 : 61)) {
        input.left = dx < 0;
        input.right = dx > 0;
      }
      input.run = Math.abs(dx) > 360 && Math.abs(lane) < 45;
      if (p.z > 75 && Math.abs(dx) < 150 && Math.abs(lane) < 35 && e.grounded && e.jumpTimer <= 0) input.jump = true;
    }
    if (e.aiTimer <= 0 && !e.action) {
      const distance = Math.hypot(dx, lane * 1.4);
      if (boss && distance < 300 && e.energy >= 50 && e.cooldowns.burst <= 0) input.burst = true;
      else if (Math.abs(dx) < (boss ? 115 : 92) && Math.abs(lane) < 28 && Math.abs(p.z - e.z) < 70) input.attack = true;
      else if (Math.abs(dx) > 130 && Math.abs(dx) < 700 && Math.abs(lane) < 35 && e.cooldowns.special <= 0 && e.energy >= 25) input.special = true;
      if (input.attack || input.special || input.burst) e.aiTimer = (0.55 + this.random() * 0.65) * this.difficulty.aggression * (e.bossPhase === 2 ? 0.65 : 1);
    }
    if (this.state.settings.difficulty === 'hard' && p.action?.kind === 'melee' && Math.abs(dx) < 120 && Math.abs(lane) < 35 && e.aiTimer < 0.5) input.guard = true;
    return input;
  }

  separateFighters(dt) {
    const fighters = [this.state.player, ...this.state.enemies];
    for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i], b = fighters[j];
      if (a.dead || b.dead || a.dashTime > 0 || b.dashTime > 0 || Math.abs(a.depth - b.depth) > 24 || Math.abs(a.z - b.z) > 45) continue;
      const dx = b.x - a.x;
      const distance = (a.w + b.w) / 2;
      if (Math.abs(dx) < distance) {
        const push = Math.sign(dx || (b.id - a.id)) * (distance - Math.abs(dx)) * Math.min(0.25, dt * 8);
        a.x -= push;
        b.x += push;
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
      e.dead = true;
      s.kills++;
      s.score += e.type === 'boss' ? 1000 : 100;
      s.corpses.push({ x: e.x, y: e.y, depth: e.depth, z: e.z, vx: e.vx || (e.facing * -180), vy: Math.min(e.vy, -260), rotation: 0, spin: (this.random() - 0.5) * 12, life: 2.8, element: e.element, h: e.h });
      this.floater(e.x, Math.min(e.y - e.h, 640), e.type === 'boss' ? 'GUARDIAN FALLEN' : 'KO', ELEMENTS[e.element].color);
      if (e.type === 'boss') { s.slowMotion = 0.7; s.shake = 10; }
      s.player.energy = Math.min(100, s.player.energy + 8);
    }
    s.enemies = s.enemies.filter(e => !e.dead);
    const p = s.player;
    if (p.hp > 0) return;
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
    p.cooldowns = { attack: 0, special: 0, burst: 0, dash: 0 };
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
      if (c.z < 0) { c.z = 0; c.vy *= -0.3; c.vx *= 0.65; c.spin *= 0.7; }
      c.y = c.depth - c.z;
      c.rotation += c.spin * dt;
    }
    s.corpses = s.corpses.filter(c => c.life > 0 && c.y < 1000);
    for (const w of s.weapons) w.life -= dt;
    s.weapons = s.weapons.filter(w => w.life > 0);
  }
}
