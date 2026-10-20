import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { ARCHETYPE_STATS, ARCHETYPE_RULES as R, CAPTIVE, ARCHETYPE_KINDS, DIFFICULTIES } from '../src/data.js';
import { ARCHETYPES } from '../src/enemy-art.js';
import { grabCandidate, rescueCandidate } from '../src/grapples.js';
import { isCommitted } from '../src/bosses.js';

const STEP = 1 / 120;
const HP = { bandit: 70, hunter: 75, brute: 220, sorcerer: 80, guard: 140, monk: 120, captive: 40 };

// A cleared survival arena: the player stands at (500, 540); nothing spawns on its own.
function arena(options = {}) {
  const game = new Game({ element: 'earth', arena: 'air', mode: 'survival', difficulty: 'normal', seed: 7, ...options });
  game.start();
  const s = game.state;
  Object.assign(s, { enemies: [], captives: [], projectiles: [], weapons: [], effects: [], particles: [], floaters: [], corpses: [], waveDelay: 999, weaponTimer: 999 });
  Object.assign(s.player, { x: 500, depth: 540, y: 540, invulnerable: 0, facing: 1 });
  return { game, s, p: s.player };
}
// A revealed archetype (no swirl left) at x, depth.
function spawn(game, archetype, x, depth = 540, set = {}) {
  const e = game.spawnEnemy({ archetype, x, depth });
  game.state.effects = game.state.effects.filter(fx => fx.targetId !== e.id);
  return Object.assign(e, { spawnReveal: 0, spawnHold: false, invulnerable: 0 }, set);
}
function villager(game, x, depth = 540, set = {}) {
  const c = game.spawnCaptive(x, depth);
  game.state.effects = game.state.effects.filter(fx => fx.targetId !== c.id);
  return Object.assign(c, { spawnReveal: 0, invulnerable: 0 }, set);
}
const quiet = game => { game.enemyInput = () => ({}); return game; }; // mechanics without the AI
const advance = (game, seconds, input = {}) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP) game.tick(typeof input === 'function' ? input() : input, STEP);
};
const kinds = s => s.enemies.filter(e => e.archetype).map(e => e.archetype);
// Ticks for seconds and reports whether seen(state) was ever true along the way.
const watch = (game, seconds, seen, input = {}) => {
  let saw = false;
  for (let t = 0; t < seconds - 1e-9; t += STEP) { game.tick(input, STEP); saw ||= !!seen(game.state); }
  return saw;
};

test('archetypes carry their own health and size, no element, and the same numbers on every difficulty', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const game = new Game({ difficulty });
    for (const kind of ARCHETYPE_KINDS) {
      const f = game.makeFighter('enemy', null, 300, 540, 'archetype', kind);
      assert.equal(f.archetype, kind);
      assert.equal(f.type, 'archetype');
      assert.equal(f.element, null);
      assert.equal(f.maxHp, HP[kind], `${kind} health on ${difficulty}`);
      assert.equal(f.hp, HP[kind]);
      assert.equal(f.h, ARCHETYPES[kind].h);
      assert.equal(f.w, ARCHETYPE_STATS[kind].w);
    }
  }
  assert.equal(new Game().makeFighter('enemy', null, 0, 540, 'archetype', 'brute').w, 40);
  // An unknown kind is an ordinary fighter of the given element.
  const plain = new Game().makeFighter('enemy', 'fire', 0, 540, 'archetype', 'pirate');
  assert.equal(plain.archetype, null);
  assert.equal(plain.element, 'fire');
});

test('survival mixes two archetypes into wave 2 and three from wave 5, keeping every wave total', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const game = new Game({ mode: 'survival', seed });
    game.start();
    const s = game.state;
    assert.deepEqual(kinds(s), [], 'wave 1 is all elemental');
    const sizes = { 1: 5, 2: 6, 3: 5, 4: 8, 5: 9, 6: 8, 7: 11 };
    for (let wave = 2; wave <= 7; wave += 1) {
      s.enemies = [];
      game.beginWave();
      assert.equal(s.wave, wave);
      assert.equal(s.enemies.length, sizes[wave], `wave ${wave} total`);
      const mix = kinds(s);
      assert.equal(mix.length, wave >= 5 ? 3 : 2, `wave ${wave} archetypes`);
      assert.ok(s.enemies.some(e => e.element && e.type !== 'boss'), 'at least one elemental foe remains');
      assert.ok(mix.filter(k => k === 'brute').length <= 1 && mix.filter(k => k === 'sorcerer').length <= 1);
      if (wave < 4) assert.ok(!mix.includes('brute'), 'the Chain Ox waits for wave 4');
      assert.ok(!mix.includes('captive'));
      if (wave % 3 === 0) assert.equal(s.enemies.filter(e => e.type === 'boss').length, 1);
    }
  }
  // Custom counts keep their totals; a lone opponent stays elemental.
  for (const [count, expected] of [[1, 0], [2, 1], [3, 2], [12, 2]]) {
    const game = new Game({ mode: 'survival', enemyCount: count, seed: 3 });
    game.start();
    game.state.enemies = [];
    game.beginWave();
    assert.equal(game.state.enemies.length, count);
    assert.equal(kinds(game.state).length, expected, `count ${count}`);
  }
});

test('challenge trials, story chapters, training and the tournament take their own mixes', () => {
  const challenge = new Game({ mode: 'challenge', seed: 4 });
  challenge.start();
  for (let trial = 1; trial <= 3; trial += 1) {
    if (trial > 1) { challenge.state.enemies = []; challenge.beginWave(); }
    assert.equal(challenge.state.enemies.length, 4);
    assert.equal(kinds(challenge.state).length, trial, `trial ${trial}`);
  }
  for (const [enemyCount, expected] of [['auto', [0, 1, 2, 2]], [6, [0, 1, 2, 2]]]) {
    const story = new Game({ mode: 'story', seed: 4, ...(enemyCount === 'auto' ? {} : { enemyCount }) });
    story.start();
    for (let chapter = 1; chapter <= 4; chapter += 1) {
      if (chapter > 1) { story.state.enemies = []; story.beginWave(); }
      assert.equal(kinds(story.state).length, expected[chapter - 1], `story chapter ${chapter} (${enemyCount})`);
      assert.equal(story.state.enemies.filter(e => e.type === 'boss').length, 0);
      story.state.enemies = [];
      story.stages.engage(story, 2);
      assert.equal(story.state.enemies.filter(e => e.type === 'boss').length, 1);
    }
  }
  const training = new Game({ mode: 'training', enemyCount: 6 });
  training.start();
  assert.ok(training.state.enemies.every(e => e.type === 'dummy'), 'training keeps its sparring partners');
  const tournament = new Game({ mode: 'tournament', enemyCount: 4 });
  tournament.start();
  for (let round = 1; round <= 3; round += 1) {
    if (round > 1) { tournament.state.enemies = []; tournament.beginWave(); }
    assert.deepEqual(kinds(tournament.state), [], 'the tournament keeps its guardians and elemental supporters');
    assert.equal(tournament.state.captives.length, 0);
  }
});

test('a bound villager kneels on the far side of a captive wave; he is no enemy and never holds the wave', () => {
  const game = new Game({ mode: 'survival', seed: 9 });
  game.start();
  const s = game.state;
  assert.equal(s.captives.length, 0, 'not on wave 1');
  s.enemies = [];
  game.beginWave();
  assert.equal(s.wave, 2);
  assert.equal(s.captives.length, 1, 'survival wave 2 brings a villager');
  const c = s.captives[0];
  assert.equal(c.team, 'neutral');
  assert.equal(c.archetype, 'captive');
  assert.equal(c.maxHp, 40);
  assert.ok(!s.enemies.includes(c));
  assert.ok(kinds(s).filter(k => k === 'bandit').length >= 2, 'the bandits who left him are in the wave');
  assert.ok(Math.abs(c.x - s.player.x) > 400, 'on the far side of the arena');
  // The wave clears without him and the next wave does not bring a second one while he waits.
  for (const e of s.enemies) e.hp = 0;
  s.player.invulnerable = 999;
  advance(game, 3);
  assert.equal(s.wave, 3);
  assert.equal(s.captives.filter(v => !v.freed).length, 1);
  // Story chapter 3 and the second trial bring one too.
  const story = new Game({ mode: 'story', seed: 9 });
  story.start();
  story.state.enemies = []; story.beginWave();
  story.state.enemies = []; story.beginWave();
  assert.equal(story.state.wave, 3);
  assert.equal(story.state.captives.length, 1);
});

test('holding E for 0.6 s frees the villager: the cangue bursts, a tonic drops, the rescue scores, he cheers and leaves', () => {
  const { game, s, p } = arena();
  quiet(game);
  const c = villager(game, 550, 540, { facing: -1 });
  const score = s.score;
  assert.equal(rescueCandidate(p, s.captives), c);
  game.tick({ interact: true, interactHeld: true }, STEP);
  assert.equal(p.rescue?.id, c.id, 'E starts the rescue');
  advance(game, CAPTIVE.hold - 0.06, { interactHeld: true });
  assert.ok(!c.freed && p.rescue, 'still working the cangue');
  const x = p.x;
  advance(game, 0.08, { interactHeld: true, right: true });
  assert.ok(c.freed, 'freed after 0.6 s of held E');
  assert.ok(Math.abs(p.x - x) < 1, 'the player stood still while freeing him');
  assert.equal(p.rescue, null);
  assert.equal(s.score - score, CAPTIVE.reward);
  assert.ok(s.effects.some(e => e.kind === 'freedBurst'));
  assert.ok(s.effects.some(e => e.fx === 'iconJoin'), 'his join bubble');
  assert.deepEqual(s.weapons.map(w => w.kind), ['heal'], 'a herbal tonic drops beside him');
  assert.ok(s.floaters.some(f => f.text === `RESCUED +${CAPTIVE.reward}`));
  assert.equal(rescueCandidate(p, s.captives), null, 'a freed villager takes no more E');
  advance(game, CAPTIVE.cheer - 0.1);
  assert.ok(Math.abs(c.x - 550) < 1, 'he cheers in place first');
  for (let t = 0; t < 12 && s.captives.length; t += STEP) game.tick({}, STEP);
  assert.equal(s.captives.length, 0, 'then hobbles off the nearest edge');
  assert.ok(c.x < 60, 'the nearer (left) edge');
  assert.ok(s.effects.some(e => e.fx === 'spawn' && e.p.reverse), 'and vanishes in a reversed swirl');
});

test('letting go of E, a blow or stepping out of reach ends the rescue; E beside him never drops the held weapon', () => {
  const { game, s, p } = arena();
  quiet(game);
  const c = villager(game, 550);
  p.weapon = 'staff';
  p.weaponHits = 20;
  game.tick({ interact: true, interactHeld: true }, STEP);
  advance(game, 0.3, { interactHeld: true });
  game.tick({}, STEP);
  assert.equal(p.rescue, null, 'letting go ends it');
  assert.ok(!c.freed);
  assert.equal(p.weapon, 'staff', 'E took the villager, not the weapon');
  game.tick({ interact: true, interactHeld: true }, STEP);
  advance(game, 0.4, { interactHeld: true });
  game.damage(p, 5, 1, null, {});
  assert.equal(p.rescue, null, 'a blow ends it');
  advance(game, 0.3, { interactHeld: true });
  assert.equal(p.rescue, null);
  assert.ok(!c.freed);
  advance(game, 1);
  game.tick({ interact: true, interactHeld: true }, STEP);
  assert.ok(p.rescue, 'a fresh press starts over');
  c.x = 650;
  game.tick({ interactHeld: true }, STEP);
  assert.equal(p.rescue, null, 'out of reach ends it');
});

test('only bandits can hurt a bound villager, and one cut down is lost', () => {
  const { game, s, p } = arena();
  quiet(game);
  const c = villager(game, 560);
  // The player's strike and shot pass him by.
  p.facing = 1;
  game.startAction(p, 'melee');
  advance(game, 0.5);
  game.startAction(p, 'special');
  advance(game, 1);
  assert.equal(c.hp, 40);
  // A bandit's chop lands, but never throws him around.
  const b = spawn(game, 'bandit', 615, 540, { facing: -1 });
  game.startAction(b, 'melee');
  advance(game, 0.3);
  assert.ok(c.hp < 40, 'the bandit hurts him');
  assert.ok(Math.abs(c.x - 560) < 1 && c.z === 0, 'he kneels in place');
  c.hp = 0;
  advance(game, STEP);
  assert.equal(s.captives.length, 0);
  const corpse = s.corpses.find(k => k.archetype === 'captive');
  assert.ok(corpse, 'curled up on the floor');
  assert.ok(s.floaters.some(f => f.text === 'CAPTIVE LOST'));
  assert.equal(s.score, 0, 'a lost rescue scores nothing');
});

test('a bandit goes for a villager left alone, and leaves him be while the player stands by him', () => {
  for (const near of [false, true]) {
    const { game, s, p } = arena({ difficulty: 'hard' });
    const c = villager(game, 1000, 560);
    spawn(game, 'bandit', 820, 520);
    Object.assign(p, near ? { x: 930, depth: 560, y: 560 } : { x: 150 }, { invulnerable: 999 });
    let calls = 0;
    for (let t = 0; t < 8; t += STEP) {
      game.tick({}, STEP);
      if (s.effects.some(e => e.fx === 'iconCome' && e.maxLife - e.life < STEP * 1.5)) calls += 1;
    }
    if (near) assert.equal(c.hp, 40, 'with the player beside him the bandit fights the player');
    else {
      assert.ok(c.hp < 40, `a lone villager is attacked (hp ${c.hp})`);
      assert.ok(calls >= 1, 'he calls for help as the bandit closes in');
    }
  }
});

test('the Reed Archer: flat arrows fly level and vanish at range; every third shot is a volley that sticks where it lands', () => {
  const { game, s, p } = arena();
  quiet(game);
  const h = spawn(game, 'hunter', 200, 540, { facing: 1 });
  Object.assign(p, { x: 600, invulnerable: 999 });
  game.fireArrow(h);
  const arrow = s.projectiles[0];
  assert.equal(arrow.kind, 'arrow');
  assert.equal(Math.abs(arrow.vx), R.arrow.speed);
  assert.equal(arrow.gravity, 0);
  assert.ok(Math.abs(arrow.life - R.arrow.range / R.arrow.speed) < 1e-9);
  const z = arrow.z;
  advance(game, 0.3);
  assert.equal(arrow.z, z, 'flat shots fly level');
  advance(game, 0.4);
  assert.equal(s.projectiles.length, 0, 'gone at range');
  assert.ok(!s.effects.some(e => e.kind === 'stuckArrow'), 'flat shots never stick');
  // The second shot is flat, the third a volley.
  h.cooldowns.special = 0;
  game.startAction(h, 'special');
  assert.equal(h.action.variant, 'arrow');
  advance(game, 1.2);
  h.cooldowns.special = 0;
  h.energy = 100;
  game.startAction(h, 'special');
  assert.equal(h.shots, 2);
  assert.equal(h.action.variant, 'volley', 'every third shot is a volley');
  s.projectiles = [];
  advance(game, R.volley && 0.62);
  const volley = s.projectiles.filter(sh => sh.lob);
  assert.equal(volley.length, R.volley.count);
  advance(game, 2);
  const stuck = s.effects.filter(e => e.kind === 'stuckArrow');
  assert.equal(stuck.length, R.volley.count, 'each volley arrow sticks in the floor');
  for (const e of stuck) {
    assert.ok(Math.sin(e.angle) > 0, 'pointing into the floor');
    assert.ok(Math.abs(e.x - p.x) <= R.volley.spread + 6, `lands round the target (x ${e.x.toFixed(1)})`);
    assert.equal(e.maxLife, R.volley.stuck);
  }
  // A volley arrow coming down on the player hits.
  p.invulnerable = 0;
  const hp = p.hp;
  h.shots = 2;
  s.projectiles = [];
  game.fireVolley(h);
  for (const sh of s.projectiles) assert.ok(Math.abs(sh.vx + sh.vy) < 1e-9 && sh.vy < 0, 'loosed 45 degrees up');
  advance(game, 1.5);
  assert.ok(p.hp < hp, 'the volley lands on a target standing still');
});

test('the Road Cutthroat smokes out once below a quarter of his health: hidden, untouchable, then fleeing', () => {
  const { game, s, p } = arena();
  const b = spawn(game, 'bandit', 600, 540, { facing: -1 });
  quiet(game);
  b.hp = 30;
  assert.equal(game.startAction(b, 'special'), false, 'not while healthy');
  b.hp = 17;
  assert.equal(game.startAction(b, 'special'), true);
  advance(game, 0.8);
  const puff = s.effects.find(e => e.kind === 'smokePuff');
  assert.ok(puff, 'the pellet bursts into smoke');
  assert.equal(puff.r, R.smoke.r);
  assert.equal(puff.maxLife, R.smoke.life);
  assert.ok(Math.abs(puff.x - b.x) < 40, 'at his feet');
  assert.ok(b.smokeTimer > 0 && b.invulnerable > 0, 'hidden');
  assert.equal(game.damage(b, 10, -1, p, {}), false, 'nothing can hit him in the smoke');
  b.cooldowns.special = 0;
  assert.equal(game.startAction(b, 'special'), false, 'only once');
  // With the AI on, he runs from the player.
  delete game.enemyInput;
  const x = b.x;
  advance(game, 1.2);
  assert.ok(b.x > x + 40, `he flees (x ${x.toFixed(0)} -> ${b.x.toFixed(0)})`);
});

test('the Chain Ox: armoured wind-up, no grab, a whirl that strikes behind him and a hook that yanks', () => {
  const { game, s, p } = arena();
  quiet(game);
  const ox = spawn(game, 'brute', 600, 540, { facing: -1 });
  game.startAction(ox, 'melee');
  advance(game, 0.05);
  assert.equal(ox.armor, true, 'armoured through the wind-up');
  const hp = ox.hp;
  game.damage(ox, 10, -1, p, { light: true });
  assert.ok(Math.abs(hp - ox.hp - 6) < 1e-6, 'an armoured blow does 60%');
  assert.ok(ox.action, 'and does not interrupt the lash');
  // Dizzy, he still cannot be caught; a dizzy elemental can.
  advance(game, 1);
  Object.assign(ox, { stun: 1, hitType: 'dizzy', grounded: true, z: 0, invulnerable: 0, x: 560 });
  Object.assign(p, { x: 500, facing: 1, knockdown: 0, stun: 0, action: null, grounded: true, z: 0, vy: 0, hp: 145 });
  assert.equal(grabCandidate(p, [ox]), null);
  const fire = game.spawnEnemy({ element: 'fire', x: 560, depth: 540 });
  Object.assign(fire, { stun: 1, hitType: 'dizzy', invulnerable: 0, spawnReveal: 0 });
  assert.equal(grabCandidate(p, [fire]), fire);
  s.enemies = [ox];
  // The meteor whirl strikes behind him as well as ahead.
  Object.assign(ox, { stun: 0, x: 600, facing: 1, energy: 100 });
  ox.cooldowns.burst = 0;
  Object.assign(p, { x: 545, invulnerable: 0, hp: 145 });
  assert.equal(game.startAction(ox, 'burst'), true);
  assert.equal(ox.action.variant, 'whirl');
  advance(game, 0.9);
  assert.ok(p.hp < 145 && p.knockdown > 0, 'the whirl knocks down a foe behind him');
  assert.ok(p.x < 545, 'away from him');
  // The hook yanks its victim in front of him.
  advance(game, 2.5);
  Object.assign(p, { x: 900, depth: 540, y: 540, z: 0, invulnerable: 0, knockdown: 0, stun: 0, vx: 0 });
  Object.assign(ox, { x: 600, facing: 1, energy: 100 });
  ox.cooldowns.special = 0;
  game.startAction(ox, 'special');
  advance(game, 1.5);
  assert.ok(s.floaters.some(f => f.text === 'HOOKED'));
  assert.ok(Math.abs(p.x - ox.x - R.hook.pullTo) < 1, `pulled to ${R.hook.pullTo} px in front (gap ${(p.x - ox.x).toFixed(1)})`);
  assert.ok(Math.abs(p.depth - ox.depth) < 1, 'into his lane');
});

test('the Talisman Priest heals a hurt ally through a tether for 2 s, and a landed blow cuts it', () => {
  const { game, s, p } = arena();
  quiet(game);
  const priest = spawn(game, 'sorcerer', 300, 520);
  const ally = game.spawnEnemy({ element: 'water', x: 520, depth: 560 });
  Object.assign(ally, { spawnReveal: 0, hp: 50 });
  Object.assign(p, { x: 1100 });
  assert.equal(game.startChannel(priest, ally), true);
  assert.ok(priest.channel);
  const sigil = s.effects.find(e => e.kind === 'healSigil'), tether = s.effects.find(e => e.kind === 'healTether');
  assert.ok(sigil && tether);
  assert.equal(sigil.x, ally.x);
  assert.equal(tether.tx, ally.x);
  advance(game, R.channel.time + 0.02);
  assert.ok(Math.abs(ally.hp - 50 - R.channel.rate * R.channel.time) < 0.2, `+20 health (now ${ally.hp.toFixed(1)})`);
  assert.equal(priest.channel, null);
  assert.equal(game.startChannel(priest, ally), false, 'the heal takes its cooldown');
  priest.cooldowns.burst = 0;
  ally.hp = 50;
  game.startChannel(priest, ally);
  advance(game, 0.5);
  game.damage(priest, 5, 1, p, {});
  assert.equal(priest.channel, null, 'a blow cuts the channel');
  assert.ok(Math.abs(ally.hp - 55) < 0.3);
  assert.ok(s.effects.filter(e => e.kind === 'healSigil' || e.kind === 'healTether').every(e => e.life <= 0.15), 'its ward and tether fade at once');
  priest.cooldowns.burst = 0;
  ally.hp = ally.maxHp;
  assert.equal(game.startChannel(priest, ally), false, 'nobody to heal');
  ally.hp = 50;
  ally.x = 300 + R.channel.range + 20;
  assert.equal(game.startChannel(priest, ally), false, 'out of range');
});

test('a homing talisman turns toward its target and seals the shot and signature for 2 s', () => {
  const { game, s, p } = arena();
  quiet(game);
  const priest = spawn(game, 'sorcerer', 200, 480, { facing: 1 });
  Object.assign(p, { x: 520, depth: 600, y: 600, energy: 100 });
  game.throwTalisman(priest);
  const slip = s.projectiles[0];
  assert.equal(slip.vDepth, 0);
  advance(game, 0.3);
  assert.ok(slip.vDepth > 0, 'it turns toward the target lane');
  for (let t = 0; t < 3 && !(p.sealed > 0); t += STEP) game.tick({}, STEP);
  assert.ok(Math.abs(p.sealed - R.talisman.seal) < 0.02, `sealed for 2 s (${p.sealed})`);
  assert.ok(s.floaters.some(f => f.text === 'SEALED'));
  p.cooldowns.special = 0;
  advance(game, 0.3);
  game.tick({ special: true }, STEP);
  assert.ok(!p.action, 'K does nothing while sealed');
  advance(game, R.talisman.seal);
  assert.equal(p.sealed, 0);
  game.tick({ special: true }, STEP);
  assert.equal(p.action?.kind, 'special', 'K works once the seal lifts');
});

test('the Gate Warden blocks frontal blows and shots; his back, guard breaks, throws and blasts get through', () => {
  const { game, s, p } = arena();
  quiet(game);
  const w = spawn(game, 'guard', 590, 540, { facing: -1 });
  Object.assign(p, { x: 520, facing: 1 });
  game.tick({}, STEP);
  assert.equal(w.brace, 1, 'braced with a foe in front');
  game.startAction(p, 'melee');
  const clang = watch(game, 0.4, st => st.effects.some(e => e.kind === 'shieldClang') && st.floaters.some(f => f.text === 'BLOCK'));
  assert.equal(w.hp, 140, 'a frontal strike is blocked');
  assert.ok(clang, 'it clangs on the shield (BLOCK)');
  // A frontal shot stops on the shield.
  advance(game, 1);
  game.startAction(p, 'special');
  advance(game, 0.8);
  assert.equal(w.hp, 140, 'a frontal shot is blocked');
  assert.equal(s.projectiles.length, 0);
  for (const [why, options, direction] of [['a guard break', { guardBreak: true }, 1], ['a body throw', { thrownBody: true }, 1],
    ['a blast', { blast: true }, 1], ['a signature burst', { aoe: true }, 1], ['a blow from behind', {}, -1]]) {
    Object.assign(w, { invulnerable: 0, hp: 140, stun: 0, knockdown: 0, facing: -1, grounded: true, z: 0 });
    game.damage(w, 10, direction, null, options);
    assert.ok(w.hp < 140, `${why} gets through`);
  }
  // He turns to a foe behind him only after a beat.
  Object.assign(w, { stun: 0, knockdown: 0, hitReact: 0, hitLag: 0, invulnerable: 0, facing: -1, x: 590, z: 0, vy: 0, vx: 0, grounded: true });
  Object.assign(p, { x: 700 });
  advance(game, R.shield.turn - 0.05);
  assert.equal(w.facing, -1, 'still facing the other way');
  assert.equal(w.brace, 0);
  advance(game, 0.1);
  assert.equal(w.facing, 1, 'turned');
});

test('the Mendicant Monk\'s Iron Bell nullifies the next blow and leaves the striker dizzy', () => {
  const { game, s, p } = arena();
  quiet(game);
  const m = spawn(game, 'monk', 570, 540, { facing: -1 });
  Object.assign(p, { x: 510, facing: 1 });
  game.startAction(m, 'special');
  advance(game, 0.3);
  assert.ok(m.bellTimer > 0, 'the bell is up');
  game.startAction(p, 'melee');
  advance(game, 0.3);
  assert.equal(m.hp, 120, 'the blow is nullified');
  assert.equal(m.bellTimer, 0, 'and rings the bell');
  const ring = s.effects.find(e => e.kind === 'ironBell');
  assert.ok(ring && ring.ring > 0 && ring.ring <= 1);
  assert.ok(p.stun > 0.5 && p.hitType === 'dizzy', 'the striker reels');
  // Untouched it stands for R.bell.time, then drops.
  advance(game, 6);
  m.cooldowns.special = 0;
  game.startAction(m, 'special');
  advance(game, 0.2);
  assert.ok(m.bellTimer > 0);
  advance(game, R.bell.time);
  assert.equal(m.bellTimer, 0);
  // A shot on the bell: nullified, nobody dizzy.
  m.cooldowns.special = 0;
  game.startAction(m, 'special');
  advance(game, 0.2);
  Object.assign(p, { stun: 0, hitType: 'stagger' });
  game.damage(m, 20, 1, p, {});
  assert.equal(m.hp, 120);
  assert.equal(p.stun, 0);
});

test('a fallen monk drops his staff as a real pickup about a third of the time', () => {
  for (const [roll, dropped] of [[0.2, true], [0.5, false]]) {
    const { game, s } = arena();
    const m = spawn(game, 'monk', 600, 540);
    m.hp = 0;
    game.random = () => roll;
    game.resolveDeaths();
    const corpse = s.corpses.find(c => c.archetype === 'monk');
    assert.equal(corpse.dropped, dropped);
    assert.equal(s.weapons.filter(w => w.kind === 'staff').length, dropped ? 1 : 0);
  }
  assert.equal(R.staffDrop, 0.35);
});

test('a bandit snatches a consumable he reaches first, runs with it, and drops it where he falls', () => {
  const { game, s, p } = arena({ difficulty: 'crazy' });
  const b = spawn(game, 'bandit', 760, 540, { facing: -1 });
  Object.assign(p, { x: 400, invulnerable: 999 });
  s.weapons.push({ kind: 'heal', x: 700, y: 540, depth: 540, life: 28, seed: 1 });
  const stolen = watch(game, 1.5, st => st.floaters.some(f => f.text === 'STOLEN!'));
  assert.deepEqual(b.stolen, { kind: 'heal', variant: null }, 'he took the tonic');
  assert.equal(s.weapons.length, 0);
  assert.ok(stolen);
  b.hp = 0;
  advance(game, STEP);
  assert.deepEqual(s.weapons.map(w => w.kind), ['heal'], 'it drops where he falls');
  // He only runs a race he wins by R.steal.lead plus his reaction: 100 px against the player's
  // 170, a sharp (Crazy) bandit goes for it, a slow (Easy) one leaves it.
  for (const [reaction, steals] of [[0.075, true], [0.25, false]]) {
    const race = arena();
    const thief = spawn(race.game, 'bandit', 800, 540, { facing: -1 });
    Object.assign(race.p, { x: 530 });
    race.s.weapons.push({ kind: 'bun', x: 700, y: 540, depth: 540, life: 28, seed: 1 });
    const errand = race.game.enemyAI.stealInput(race.game, thief, race.p, { reaction });
    assert.equal(!!errand?.left, steals, `reaction ${reaction}: ${steals ? 'goes for it' : 'leaves it'}`);
  }
});

test('archetype difficulty changes decisions, never the numbers: the same inputs move and hit the same', () => {
  for (const kind of ['bandit', 'brute', 'guard', 'monk']) {
    const results = Object.keys(DIFFICULTIES).map(difficulty => {
      const { game, p } = arena({ difficulty });
      const f = spawn(game, kind, 300, 540, { facing: 1 });
      const trace = [];
      for (const input of [{ right: true }, { right: true, run: true }, { up: true }, { down: true, left: true }]) {
        for (let frame = 0; frame < 36; frame += 1) { game.updateFighter(f, input, STEP); trace.push(f.x.toFixed(3), f.depth.toFixed(3)); }
      }
      Object.assign(p, { x: f.x + 60, depth: f.depth, y: f.depth, invulnerable: 0, hp: 145 });
      f.facing = 1;
      f.cooldowns.attack = 0;
      game.startAction(f, 'melee');
      for (let frame = 0; frame < 120; frame += 1) game.updateFighter(f, {}, STEP);
      return JSON.stringify({ trace, hp: p.hp.toFixed(3), windup: 0 });
    });
    assert.equal(new Set(results).size, 1, `${kind} is identical on every difficulty`);
  }
  // The archer's volley leads a moving target as far as his skill reads it.
  const lead = {};
  for (const difficulty of ['easy', 'crazy']) {
    const { game, s, p } = arena({ difficulty });
    const h = spawn(game, 'hunter', 200, 540, { facing: 1 });
    Object.assign(p, { x: 520, invulnerable: 999 });
    for (let t = 0; t < 6 && !(h.aimLead >= 0 && h.shots); t += STEP) game.tick({}, STEP);
    lead[difficulty] = h.aimLead;
    assert.ok(h.shots > 0, `${difficulty} archer shoots`);
    assert.ok(s.projectiles.length >= 0);
  }
  assert.equal(lead.easy, 0);
  assert.equal(lead.crazy, 1);
});

test('a wave with archetypes keeps the crowd limits and plays out deterministically', () => {
  const run = difficulty => {
    const game = new Game({ element: 'water', mode: 'survival', difficulty, seed: 21 });
    game.start();
    game.state.enemies = [];
    game.state.wave = 4;
    game.beginWave();
    game.state.player.invulnerable = 999;
    const limit = { easy: 1, normal: 2, hard: 3, crazy: 4 }[difficulty];
    let peak = 0, errands = 0;
    for (let frame = 0; frame < 120 * 12; frame += 1) {
      game.tick({ attack: frame % 50 === 0, right: frame % 300 < 100, left: frame % 300 >= 200 }, STEP);
      const active = game.state.enemies.filter(e => e.action || e.buffer || e.grabTarget != null || e.ai?.airChasing || isCommitted(e, game.state));
      // An errand's commitment (the smoke throw, a steal, a chop at the villager: ai.errand) is
      // not an attack on the player; only archetypes run errands.
      for (const e of active) if (e.ai?.errand) { assert.ok(e.archetype, 'an elemental foe runs no errand'); errands += 1; }
      const onPlayer = active.filter(e => !e.ai?.errand);
      peak = Math.max(peak, onPlayer.length);
    }
    const s = game.state;
    for (const f of [s.player, ...s.enemies, ...s.captives]) for (const key of ['hp', 'x', 'depth', 'z', 'vx', 'vy']) assert.ok(Number.isFinite(f[key]), `${f.archetype || f.element} ${key}`);
    return { peak, limit, errands, json: JSON.stringify({ kills: s.kills, score: s.score, hp: s.player.hp, enemies: s.enemies.map(e => [e.archetype || e.element, e.x.toFixed(3), e.hp.toFixed(3)]) }) };
  };
  for (const difficulty of ['easy', 'normal', 'crazy']) {
    const a = run(difficulty), b = run(difficulty);
    assert.equal(a.json, b.json, `${difficulty} is deterministic`);
    assert.ok(a.peak <= a.limit, `${difficulty}: ${a.peak} commitments on the player against a limit of ${a.limit}`);
    assert.ok(a.errands > 0, `${difficulty}: the wave runs errands beside its attacks`);
  }
});

test('the smoke pellet lands at the bandit\'s feet and he stays inside the puff for as long as he is hidden, then flees', () => {
  const { game, s, p } = arena();
  const b = spawn(game, 'bandit', 600, 540, { facing: -1, hp: 17 });
  Object.assign(p, { x: 300, invulnerable: 999 });
  let puff = null, hidden = 0;
  for (let t = 0; t < 2.6; t += STEP) {
    game.tick({}, STEP);
    puff ||= s.effects.find(e => e.kind === 'smokePuff');
    if (b.smokeTimer > 0) {
      hidden += 1;
      assert.ok(game.inSmoke(b, puff.x, puff.depth), `inside the puff while hidden (${(b.x - puff.x).toFixed(1)} px off)`);
      assert.ok(Math.abs(b.x - puff.x) < 12 && Math.abs(b.depth - puff.depth) < 4, 'he holds still in it');
    }
  }
  assert.ok(puff, 'the AI threw his pellet');
  assert.ok(Math.abs(puff.x - 600) < 12, `at his feet (${puff.x.toFixed(1)})`);
  assert.ok(hidden >= R.smoke.hide / STEP - 2, `hidden for the whole ${R.smoke.hide} s (${hidden} ticks)`);
  assert.ok(b.x - puff.x > 60, `then he flees from the player (${(b.x - puff.x).toFixed(0)} px out)`);
});

test('a light blow cannot cut the smoke throw short; a heavy one, or being knocked out of the puff, leaves the escape for another try', () => {
  {
    const { game, s, p } = arena();
    quiet(game);
    const b = spawn(game, 'bandit', 560, 540, { facing: -1, hp: 17 });
    assert.equal(game.startAction(b, 'special'), true);
    advance(game, 0.05);
    assert.ok(b.armor, 'armoured through the wind-up');
    game.damage(b, 1, 1, p, { contact: true });
    assert.equal(b.action?.variant, 'smoke', 'a jab does not stop him');
    assert.ok(s.floaters.some(f => f.text === 'ARMOR'));
    assert.equal(b.smokeUsed, false, 'not spent until the pellet leaves his hand');
    advance(game, 0.6);
    assert.ok(b.smokeUsed && b.smokeTimer > 0, 'thrown and hidden');
  }
  {
    const { game, p } = arena();
    quiet(game);
    const b = spawn(game, 'bandit', 560, 540, { facing: -1, hp: 17 });
    game.startAction(b, 'special');
    advance(game, 0.05);
    game.damage(b, 1, 1, p, { contact: true, knockdown: true, heavy: true });
    assert.equal(b.action, null, 'a heavy blow cuts it short');
    assert.equal(b.smokeUsed, false, 'the escape is not spent');
    advance(game, 2);
    assert.equal(game.startAction(b, 'special'), true, 'he can try again');
  }
  {
    const { game, s } = arena();
    quiet(game);
    const b = spawn(game, 'bandit', 560, 540, { facing: -1, hp: 17 });
    game.startAction(b, 'special');
    advance(game, R.smoke.vy > 0 ? 0.21 : 0.25);
    assert.ok(b.smokeUsed && s.projectiles.some(shot => shot.kind === 'smokePellet'), 'the pellet is out');
    b.x += 120; // knocked away before it bursts
    advance(game, 0.4);
    assert.ok(s.effects.some(e => e.kind === 'smokePuff'), 'it still bursts');
    assert.equal(b.smokeTimer, 0, 'but he is not in it, so not hidden');
    assert.equal(b.smokeUsed, false, 'and may try again');
  }
  // The AI holds a cut-short throw until its cooldown allows another.
  const { game } = arena();
  const b = spawn(game, 'bandit', 560, 540, { facing: -1, hp: 17 });
  game.enemyAI.update(game, STEP);
  b.cooldowns.special = 0.5;
  assert.equal(game.enemyAI.archetypeErrand(game, b, { reaction: 0.17 })?.special, undefined);
  b.cooldowns.special = 0;
  assert.equal(game.enemyAI.archetypeErrand(game, b, { reaction: 0.17 })?.special, true);
});

test('the Iron Bell takes a signature burst whole: the monk stays grounded, unslowed and unstunned', () => {
  for (const element of ['air', 'water', 'earth', 'fire']) {
    const { game, p } = arena({ element });
    quiet(game);
    const m = spawn(game, 'monk', 680, 540, { facing: -1 });
    game.startAction(m, 'special');
    advance(game, 0.3);
    assert.ok(m.bellTimer > 0);
    Object.assign(p, { x: 600, energy: 100 });
    game.burst(p);
    assert.equal(m.hp, 120, `${element}: no damage`);
    assert.equal(m.bellTimer, 0, `${element}: the bell rang`);
    assert.ok(m.vy >= 0 && m.grounded, `${element}: not launched`);
    assert.equal(m.slow, 0, `${element}: not slowed`);
    assert.equal(m.stun, 0, `${element}: not stunned`);
    advance(game, 0.25);
    assert.equal(m.z, 0, `${element}: still on the floor`);
  }
});

test('a parried talisman seals neither a shield it struck nor a ringing Iron Bell', () => {
  for (const kind of ['guard', 'monk']) {
    const { game, s, p } = arena();
    quiet(game);
    const foe = spawn(game, kind, 700, 540, { facing: -1 });
    if (kind === 'monk') { game.startAction(foe, 'special'); advance(game, 0.3); }
    s.projectiles.push({ kind: 'talisman', x: 640, y: 490, depth: 540, z: 50, vx: R.talisman.speed, vy: 0, vDepth: 0, gravity: 0, r: R.talisman.r,
      team: 'player', life: 2, damage: R.talisman.damage, knockback: R.talisman.knockback, element: null, source: p });
    advance(game, 0.4);
    assert.equal(foe.hp, foe.maxHp, `${kind}: the blow was taken whole`);
    assert.equal(foe.sealed, 0, `${kind}: not sealed`);
    assert.ok(!s.floaters.some(f => f.text === 'SEALED'), `${kind}: no SEALED`);
  }
  // A slip that lands still seals.
  const { game, s, p } = arena();
  quiet(game);
  const priest = spawn(game, 'sorcerer', 700, 540, { facing: -1 });
  s.projectiles.push({ kind: 'talisman', x: 640, y: 490, depth: 540, z: 50, vx: R.talisman.speed, vy: 0, vDepth: 0, gravity: 0, r: R.talisman.r,
    team: 'player', life: 2, damage: R.talisman.damage, knockback: R.talisman.knockback, element: null, source: p });
  advance(game, 0.4);
  assert.ok(priest.sealed > 0);
});

test('an archetype\'s blows are plain ink: no element layer, an untinted spark, and an ink KO burst', () => {
  const { game, s, p } = arena({ element: 'fire' });
  quiet(game);
  const b = spawn(game, 'bandit', 540, 540, { facing: -1 });
  game.damage(p, 5, -1, b, { contact: true, element: b.element });
  assert.equal(s.lastImpact.element, null);
  const fx = s.effects.filter(e => e.kind === 'vfx');
  assert.ok(!fx.some(e => e.fx === 'fire'), 'no fire layer');
  const spark = fx.find(e => e.fx === 'hitLight' || e.fx === 'hitHeavy');
  assert.ok(spark && !spark.p.element, 'an untinted spark');
  // The player knocked out by an archetype: an ink KO burst.
  advance(game, 1);
  Object.assign(p, { hp: 1, invulnerable: 0, knockdown: 0 });
  s.effects = [];
  game.damage(p, 50, -1, b, { contact: true, element: b.element });
  game.resolveDeaths();
  const ko = s.effects.find(e => e.fx === 'ko');
  assert.ok(ko, 'the KO burst');
  assert.equal(ko.p.element ?? null, null, 'plain ink, not the player\'s fire');
  // An archetype knocked out by the fire player bursts in fire.
  const foe = spawn(game, 'guard', 700, 540, { facing: 1, hp: 1 });
  s.effects = [];
  game.damage(foe, 10, 1, p, { contact: true, element: 'fire' });
  game.resolveDeaths();
  assert.equal(s.effects.find(e => e.fx === 'ko')?.p.element, 'fire');
});

test('a bandit snatches the consumable in reach even with a weapon lying nearer, and never a planted censer', () => {
  const { game, s } = arena();
  quiet(game);
  const b = spawn(game, 'bandit', 590, 540, { facing: 1 });
  s.weapons.push({ kind: 'staff', x: 588, y: 540, depth: 540, life: 20 }, { kind: 'heal', x: 620, y: 540, depth: 540, life: 28, seed: 1 });
  assert.equal(game.steal(b), true);
  assert.deepEqual(b.stolen, { kind: 'heal', variant: null });
  assert.deepEqual(s.weapons.map(w => w.kind), ['staff']);
  const other = spawn(game, 'bandit', 300, 540);
  s.weapons.push({ kind: 'incense', x: 300, y: 540, depth: 540, life: 28, seed: 1 });
  assert.equal(game.steal(other), false);
  // The AI's race ends in a steal, not a stall beside the nearer weapon.
  const race = arena();
  const thief = spawn(race.game, 'bandit', 400, 540, { facing: 1 });
  Object.assign(race.p, { x: 1100, invulnerable: 999 });
  race.s.weapons.push({ kind: 'staff', x: 585, y: 540, depth: 540, life: 20 }, { kind: 'heal', x: 600, y: 540, depth: 540, life: 28, seed: 1 });
  advance(race.game, 3);
  assert.deepEqual(thief.stolen, { kind: 'heal', variant: null });
});

test('E held on from a press further off frees the villager on stepping up to him; near him E never drops the weapon', () => {
  const { game, s, p } = arena();
  quiet(game);
  const c = villager(game, 620);
  Object.assign(p, { weapon: 'staff', weaponHits: 20 });
  game.tick({ interact: true, interactHeld: true }, STEP);
  assert.equal(p.rescue, null, 'out of reach');
  assert.equal(p.weapon, 'staff', 'the press dropped nothing');
  assert.equal(s.weapons.length, 0);
  let started = false;
  for (let t = 0; t < 2 && !c.freed; t += STEP) {
    game.tick({ interactHeld: true, right: !p.rescue }, STEP);
    started ||= !!p.rescue;
  }
  assert.ok(started, 'stepping into reach started the rescue');
  assert.ok(c.freed, 'and held E freed him');
  assert.equal(p.weapon, 'staff');
  // Letting go between the press and the step: no rescue.
  const again = arena();
  quiet(again.game);
  const v = villager(again.game, 620);
  again.game.tick({ interact: true, interactHeld: true }, STEP);
  for (let t = 0; t < 1; t += STEP) again.game.tick({ right: !(Math.abs(v.x - again.p.x) < 50) }, STEP);
  for (let t = 0; t < 0.2; t += STEP) again.game.tick({ interactHeld: true }, STEP);
  assert.equal(again.p.rescue, null, 'a hold that was let go does not start it');
  // Far from any villager E still drops the weapon.
  const far = arena();
  quiet(far.game);
  villager(far.game, 1100);
  Object.assign(far.p, { weapon: 'staff', weaponHits: 20 });
  far.game.tick({ interact: true, interactHeld: true }, STEP);
  assert.equal(far.p.weapon, null);
  assert.deepEqual(far.s.weapons.map(w => w.kind), ['staff']);
});

test('a villager does not call for help while the player stands by him, and a call already up fades out', () => {
  const { game, s, p } = arena();
  quiet(game);
  const c = villager(game, 560);
  spawn(game, 'bandit', 700, 540, { facing: -1 });
  game.commandIcon(c, 'come');
  const icon = s.effects.find(e => e.fx === 'iconCome');
  game.tick({}, STEP);
  assert.ok(icon.life <= icon.maxLife * 0.14 + 1e-9, 'the bubble jumps to its fade-out');
  let calls = 0;
  for (let t = 0; t < 6; t += STEP) {
    game.tick({}, STEP);
    if (s.effects.some(e => e.fx === 'iconCome' && e.maxLife - e.life < STEP * 1.5)) calls += 1;
  }
  assert.equal(calls, 0, 'no call with the player beside him');
  p.x = 200;
  for (let t = 0; t < 1; t += STEP) game.tick({}, STEP);
  assert.ok(s.effects.some(e => e.fx === 'iconCome'), 'he calls again once the player leaves');
});

test('an archetype\'s ice column grows to his height; floaters clear the villager\'s bubble and the striker\'s DIZZY', () => {
  const { game, s, p } = arena({ element: 'water' });
  quiet(game);
  const ox = spawn(game, 'brute', 700, 540);
  game.damage(ox, 1, 1, p, { freeze: 1.2 });
  const column = s.effects.find(e => e.fx === 'iceColumn' && e.targetId === ox.id);
  assert.ok(Math.abs(column.p.scale - ARCHETYPES.brute.h / 66) < 1e-9, `scale ${column.p.scale}`);
  const bandit = spawn(game, 'bandit', 900, 540);
  game.damage(bandit, 1, 1, p, { freeze: 1.2 });
  assert.equal(s.effects.find(e => e.fx === 'iceColumn' && e.targetId === bandit.id).p.scale, 1);
  // RESCUED rises over the join bubble; BELL RINGS over DIZZY.
  const c = villager(game, 300);
  game.freeCaptive(c);
  const rescued = s.floaters.find(f => f.text.startsWith('RESCUED'));
  assert.ok(rescued.y <= c.y - c.h - 28 - 36, 'above the join bubble');
  const m = spawn(game, 'monk', 560, 540, { facing: -1 });
  game.raiseBell(m);
  Object.assign(p, { x: 500, facing: 1 });
  game.damage(m, 5, 1, p, { contact: true });
  const rings = s.floaters.find(f => f.text === 'BELL RINGS'), dizzy = s.floaters.find(f => f.text === 'DIZZY');
  assert.ok(rings.y < dizzy.y - 20, `BELL RINGS (${rings.y}) over DIZZY (${dizzy.y})`);
});
