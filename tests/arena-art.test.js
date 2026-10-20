import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/engine.js';
import { Renderer } from '../src/renderer.js';
import { ARENAS, ELEMENTS, arenaElement } from '../src/data.js';
import { ARENA_PACK, ARENA_PACK_PALETTES, AP_CARD_TOP, drawArenaPackBackground, drawArenaPackScenery, drawArenaPackAmbient,
  drawArenaPackTitleCard } from '../src/arena-art.js';
import { fakeCanvas, recordingContext } from './fake-canvas.js';

const PACK = { bamboo: 'air', rampart: 'earth', market: 'fire', keep: 'water' };
const STEP = 1 / 120;

// A recording context that also logs property writes (shadowBlur, fillStyle ...).
function spyContext() {
  const ctx = recordingContext();
  const sets = [];
  return new Proxy(ctx, {
    get: (target, prop) => (prop === 'sets' ? sets : target[prop]),
    set: (target, prop, value) => { sets.push(prop); target[prop] = value; return true; },
  });
}
const has = (calls, name, args) => calls.some(c => c.name === name && args.every((v, i) => c.args[i] === v));
const sameCalls = calls => calls.map(c => `${c.name}(${c.args.map(a => (typeof a === 'number' ? a.toFixed(3) : String(a))).join(',')})@${c.alpha}`);

// A real Renderer on a recording context. With `cache`, background() really builds its cached
// canvas (on a recording context); otherwise the blit is skipped as in the other renderer tests.
function setup(arena, { mode = 'survival', cache = false } = {}) {
  const { canvas, ctx } = fakeCanvas();
  const renderer = new Renderer(canvas);
  const built = [];
  if (cache) {
    renderer.createCanvas = () => { const c = fakeCanvas(); built.push(c.ctx); return c.canvas; };
    globalThis.document = { createElement: () => renderer.createCanvas() };
  } else renderer.background = () => ({});
  const game = new Game({ element: 'air', arena, mode, seed: 4242 });
  return { renderer, game, ctx, s: game.state, built };
}
function emptyStage(s, time) {
  Object.assign(s, { status: 'playing', time, enemies: [], projectiles: [], effects: [], particles: [], floaters: [], weapons: [], corpses: [], auras: [], banner: '', bannerTime: 0, shake: 0 });
  s.player.dead = true;
}

test('the four pack stages join ARENAS, each naming the element the engine uses for it', () => {
  for (const [key, element] of Object.entries(PACK)) {
    assert.equal(ARENAS[key], ARENA_PACK[key], `${key} is the pack entry`);
    assert.ok(ARENAS[key].name && ARENAS[key].subtitle, `${key} has a name and subtitle`);
    assert.equal(arenaElement(key), element);
    for (const field of ['sky', 'horizon', 'far', 'mid', 'near', 'stone', 'side', 'accent', 'floor', 'edge']) {
      assert.match(ARENA_PACK_PALETTES[key][field], /^#[0-9a-f]{6}$/, `${key}.${field}`);
    }
  }
  for (const [key, arena] of Object.entries(ARENAS)) assert.ok(ELEMENTS[arena.element], `${key} names a real element`);
  for (const element of Object.keys(ELEMENTS)) assert.equal(arenaElement(element), element, 'a sanctuary is its own element');
  for (const odd of ['toString', 'constructor', undefined, 'nowhere']) assert.equal(arenaElement(odd), 'air');
});

test('a run keeps a pack arena it is given; inherited names are refused', () => {
  for (const key of Object.keys(PACK)) {
    const game = new Game({ arena: key });
    assert.equal(game.state.settings.arena, key);
    assert.equal(game.state.arena, key);
  }
  for (const odd of ['toString', 'constructor', '__proto__']) assert.equal(new Game({ arena: odd }).state.arena, 'air');
});

test("the third-wave spirit orb takes the arena's element, not its key", () => {
  for (const [key, element] of Object.entries({ ...PACK, water: 'water' })) {
    for (const mode of ['survival', 'challenge']) {
      const game = new Game({ arena: key, mode, seed: 7 });
      game.start();
      game.beginWave();
      game.beginWave();
      assert.equal(game.state.wave, 3);
      const orb = game.state.weapons.find(w => w.kind === 'orb');
      assert.ok(orb, `${mode} wave 3 on ${key} drops an orb`);
      assert.equal(orb.variant, element, `${key} -> ${element}`);
    }
  }
});

test('story chapters stay in the four sanctuaries whatever arena was picked', () => {
  for (const key of Object.keys(PACK)) {
    const game = new Game({ arena: key, mode: 'story', seed: 3 });
    game.start();
    const s = game.state;
    for (const [i, element] of ['air', 'water', 'earth', 'fire'].entries()) {
      if (i) { s.enemies = []; game.beginWave(); }
      assert.equal(s.arena, element);
      assert.equal(s.enemies.some(e => e.type === 'boss'), false, 'Journey opens with a crowd');
      // Intentional change (Enemies phase): from chapter 2 an archetype (no element) takes one
      // of the guardian's supporting slots; every elemental foe is still the sanctuary's element.
      assert.ok(s.enemies.every(e => e.archetype || e.element === element));
      assert.equal(s.enemies.some(e => e.archetype), i > 0);
      assert.equal(s.banner, `Stage ${i + 1} · ${ARENAS[element].name}`);
      // Intentional change (Arenas review): every chapter brings its guardian, whose DOM health
      // bar would hang over the card, so no chapter shows one (and none is on a pack stage).
      assert.equal(s.stageCard, false, 'a guardian chapter shows no stage card');
    }
  }
});

test('the arena never changes the simulation: same seed and inputs, same fight on every stage', () => {
  const run = arena => {
    const game = new Game({ element: 'fire', arena, mode: 'survival', difficulty: 'hard', seed: 991 });
    game.start();
    for (let frame = 0; frame < 900; frame += 1) {
      game.tick({ right: frame % 240 < 80, left: frame % 240 >= 160, up: frame % 90 < 20, attack: frame % 23 === 0, jump: frame % 150 === 40 }, STEP);
    }
    const s = game.state;
    const body = f => [f.x, f.depth, f.z, f.hp, f.energy, f.element].map(v => (typeof v === 'number' ? v.toFixed(6) : v)).join(',');
    return JSON.stringify({ seed: game.seed, wave: s.wave, kills: s.kills, score: s.score, player: body(s.player), enemies: s.enemies.map(body), weapons: s.weapons.map(w => `${w.kind}@${w.x.toFixed(3)},${w.depth.toFixed(3)}`) });
  };
  const reference = run('air');
  for (const key of ['water', ...Object.keys(PACK)]) assert.equal(run(key), reference, `${key} plays exactly like the sky monastery`);
});

test('pack backgrounds keep the original playfield geometry: ledge, floor, front edge, inset, emblem and post footings', () => {
  const reference = recordingContext();
  const renderer = new Renderer(fakeCanvas().canvas);
  renderer.drawCourtyard(reference, ARENA_PACK_PALETTES.bamboo, 'air');
  const shared = [
    ['fillRect', [0, 351, 1280, 19]], ['fillRect', [0, 348, 1280, 7]], ['fillRect', [0, 365, 1280, 355]],
    ['fillRect', [0, 681, 1280, 39]], ['fillRect', [0, 681, 1280, 9]], ['rect', [0, 366, 1280, 315]],
    ['translate', [640, 518]], ['scale', [1, 0.44]], ['arc', [0, 0, 116]], ['arc', [0, 0, 106]],
    ['moveTo', [30, 395]], ['lineTo', [1250, 395]], ['moveTo', [30, 650]], ['lineTo', [1250, 650]], ['lineTo', [30, 650]], ['lineTo', [1250, 650]],
  ];
  for (const x of [20, 1260]) shared.push(['fillRect', [x - 17, 340, 34, 9]], ['fillRect', [x - 20, 349, 40, 6]]);
  for (const [name, args] of shared) assert.ok(has(reference.calls, name, args), `drawCourtyard ${name}(${args})`);
  for (const key of Object.keys(PACK)) {
    const ctx = recordingContext();
    drawArenaPackBackground(ctx, key);
    for (const [name, args] of shared) assert.ok(has(ctx.calls, name, args), `${key} ${name}(${args})`);
    for (const y of [386, 413, 448, 492, 548, 614, 681]) assert.ok(has(ctx.calls, 'lineTo', [1280, y]), `${key} floor row ${y}`);
    assert.equal(ctx.depth, 0, `${key} balances save/restore`);
  }
});

test('per-frame scenery and ambient passes use no gradients or shadows and keep air particles above the ledge', () => {
  for (const key of Object.keys(PACK)) {
    for (const t of [0, 1.3, 2.35, 7.7, 33.3, 123.4, 1000.01]) {
      for (const pass of [drawArenaPackScenery, drawArenaPackAmbient]) {
        const ctx = spyContext();
        pass(ctx, key, t);
        const label = `${key} ${pass.name} t=${t}`;
        assert.ok(!ctx.calls.some(c => /Gradient|Pattern|getImageData|drawImage/.test(c.name)), `${label}: no gradients or images`);
        assert.ok(!ctx.sets.some(p => /shadow|filter/.test(p)), `${label}: no shadowBlur or filters`);
        assert.equal(ctx.depth, 0, `${label}: save/restore balanced`);
        assert.ok(ctx.calls.length > 0, `${label}: draws something`);
        if (pass === drawArenaPackAmbient) {
          for (const c of ctx.calls) {
            if (c.name === 'moveTo' || c.name === 'fillRect') assert.ok(c.args[1] >= 0 && c.args[1] <= 340, `${label}: ${c.name} y ${c.args[1]} stays above the floor`);
          }
        }
      }
    }
  }
});

test('the renderer caches a pack background once and draws its scenery before the shake, its air inside it', () => {
  const { renderer, game, ctx, s, built } = setup('market', { cache: true });
  try {
    const bg = renderer.background('market');
    assert.equal(built.length, 1);
    assert.ok(has(built[0].calls, 'fillRect', [0, 351, 1280, 19]), 'pack floor drawn into the cache');
    assert.ok(!has(built[0].calls, 'arc', [1000, 130, 60]), 'not the sanctuary sky');
    assert.equal(renderer.background('market'), bg, 'cached');
    assert.equal(built.length, 1);

    game.start();
    emptyStage(s, 2.35);
    s.shake = 10;
    s.player.dead = false;
    renderer.draw(s);
    const calls = ctx.calls;
    const blit = calls.findIndex(c => c.name === 'drawImage' && c.args[0] === bg);
    const shake = calls.findIndex(c => c.name === 'translate' && c.args[0] === Math.sin(2.35 * 173) * 10 && c.args[1] === Math.cos(2.35 * 137) * 10 * 0.65);
    const paperLantern = calls.findIndex(c => c.name === 'fill' && c.fill === ARENA_PACK_PALETTES.market.paperLantern);
    const mote = calls.findIndex(c => c.name === 'fillRect' && c.fill === '#fff4dc');
    assert.ok(blit >= 0 && shake > blit, 'background blit, then the shake');
    assert.ok(paperLantern > blit && paperLantern < shake, 'lanterns hang with the unshaken background');
    assert.ok(mote > shake, 'free motes shake with the fighters');
  } finally {
    delete globalThis.document;
  }
});

test('reduced motion holds every pack stage still; full motion moves it', () => {
  for (const key of Object.keys(PACK)) {
    const frames = (reducedMotion) => [1, 4.2].map(time => {
      const { renderer, s, ctx } = setup(key);
      emptyStage(s, time);
      renderer.draw(s, { reducedMotion });
      return sameCalls(ctx.calls);
    });
    const [a, b] = frames(true);
    assert.deepEqual(a, b, `${key}: reduced motion draws the same frame at any time`);
    const [c, d] = frames(false);
    assert.notDeepEqual(c, d, `${key}: full motion animates`);
  }
});

test('arenaKey picks the pack stage by its own key before any element fallback', () => {
  const renderer = new Renderer(fakeCanvas().canvas);
  for (const key of Object.keys(PACK)) {
    assert.equal(renderer.arenaKey({ arena: key }), key);
    assert.equal(renderer.arenaKey({ arena: 'elsewhere', settings: { arena: key } }), key);
    assert.equal(renderer.arenaKey({ arena: ARENAS[key] }), key, 'object form maps to its key, not its element');
    assert.equal(renderer.arenaKey({ arena: ARENAS[key], settings: { arena: 'air' } }), key, "the state's own arena object wins over settings.arena");
  }
  assert.equal(renderer.arenaKey({ arena: ARENAS.water }), 'water');
  assert.equal(renderer.arenaKey({ arena: { element: 'fire' } }), 'fire');
  assert.equal(renderer.arenaKey({ arena: 'toString' }), 'air');
  assert.equal(renderer.arenaKey({}), 'air');
});

test('the stage card hangs under the banner that opens a pack stage and fades with it', () => {
  const cardName = (ctx, name) => ctx.calls.find(c => c.name === 'fillText' && c.args[0] === name.toUpperCase() && c.args[2] === AP_CARD_TOP + 23);
  const cardSub = (ctx, sub) => ctx.calls.find(c => c.name === 'fillText' && c.args[0] === sub && c.args[2] === AP_CARD_TOP + 22);
  for (const mode of ['survival', 'challenge', 'training']) {
    const { renderer, game, ctx, s } = setup('market', { mode });
    game.start();
    assert.equal(s.stageCard, true, `${mode} wave 1 opens the stage`);
    renderer.draw(s);
    assert.ok(cardName(ctx, 'Lantern market') && cardSub(ctx, 'After the last bell'), `${mode}: card under the wave-1 banner`);
    // A later banner in the same wave (a lost life, a guardian's phase) gets no card.
    game.banner('2 lives remaining');
    assert.equal(s.stageCard, false);
    ctx.calls.length = 0;
    renderer.draw(s);
    assert.ok(!cardSub(ctx, 'After the last bell'), `${mode}: no card under a later banner`);
  }
  // Wave 2 is not a new stage.
  const { renderer, game, ctx, s } = setup('keep');
  game.start();
  s.enemies = [];
  game.beginWave();
  assert.equal(s.stageCard, false);
  renderer.draw(s);
  assert.ok(!cardSub(ctx, 'Behind the sea gate'));
  // The card fades with the banner.
  const fade = setup('bamboo');
  fade.game.start();
  fade.s.bannerTime = 0.25;
  fade.renderer.draw(fade.s);
  const sub = cardSub(fade.ctx, 'Where the wind bends');
  assert.ok(sub && cardName(fade.ctx, 'Bamboo grove'));
  assert.equal(sub.alpha, 0.5, 'alpha = min(1, bannerTime * 2)');
  // The subtitle-only variant (kept in src/arena-art.js for story chapters on pack stages, which
  // the game does not have yet) drops the name.
  const subOnly = recordingContext();
  drawArenaPackTitleCard(subOnly, 'bamboo', 1, AP_CARD_TOP, true);
  assert.ok(cardSub(subOnly, 'Where the wind bends') && !cardName(subOnly, 'Bamboo grove'), 'subtitle only');
  // A sanctuary has no stage card.
  const sky = setup('air');
  sky.game.start();
  sky.renderer.draw(sky.s);
  assert.ok(!sky.ctx.calls.some(c => c.name === 'fillText' && c.args[2] === AP_CARD_TOP + 22));
  // The card is drawn within its strip, under the banner plaque (y 70-117).
  const strip = recordingContext();
  drawArenaPackTitleCard(strip, 'rampart', 1);
  const ys = strip.calls.filter(c => c.name === 'moveTo' || c.name === 'lineTo').map(c => c.args[1]).filter(y => y > 100);
  assert.ok(Math.min(...ys) >= AP_CARD_TOP && Math.max(...ys) <= AP_CARD_TOP + 34);
});

test('a run that opens with a guardian (every Tournament) shows no stage card under its boss HUD', () => {
  const cardSub = ctx => ctx.calls.some(c => c.name === 'fillText' && c.args[0] === 'Behind the sea gate' && c.args[2] === AP_CARD_TOP + 22);
  const { renderer, game, ctx, s } = setup('keep', { mode: 'tournament' });
  game.start();
  assert.equal(s.wave, 1);
  assert.ok(s.enemies.some(e => e.type === 'boss'), 'Tournament round 1 brings a guardian');
  assert.equal(s.stageCard, false);
  renderer.draw(s);
  assert.ok(s.bannerTime > 0 && !cardSub(ctx), 'banner without the card');
  // The same arena in Survival (no guardian on wave 1) shows it.
  const survival = setup('keep');
  survival.game.start();
  survival.renderer.draw(survival.s);
  assert.equal(survival.s.stageCard, true);
  assert.ok(cardSub(survival.ctx));
});

test('a pack background is cached at the device pixel ratio and blitted over the 1280x720 frame', () => {
  const saved = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  try {
    const { renderer, game, ctx, s, built } = setup('market', { cache: true });
    assert.equal(renderer.pixelRatio, 2);
    const bg = renderer.background('market');
    assert.deepEqual([bg.width, bg.height], [2560, 1440], 'device-pixel cache, like the approved preview glue');
    const first = built[0].calls.findIndex(c => c.name === 'fillRect' || c.name === 'fill' || c.name === 'stroke');
    const scale = built[0].calls.findIndex(c => c.name === 'scale' && c.args[0] === 2 && c.args[1] === 2);
    assert.ok(scale >= 0 && scale < first, 'scaled before anything is drawn');
    assert.ok(has(built[0].calls, 'fillRect', [0, 351, 1280, 19]), 'drawn in 1280x720 units');
    game.start();
    emptyStage(s, 1.5);
    renderer.draw(s);
    assert.ok(ctx.calls.some(c => c.name === 'drawImage' && c.args[0] === bg && c.args.slice(1).join() === '0,0,1280,720'), 'blitted onto the frame');
    // A sanctuary keeps its 1280x720 cache; only the latest pack stage keeps its device-pixel one.
    const sky = renderer.background('air');
    assert.deepEqual([sky.width, sky.height], [1280, 720]);
    const keep = renderer.background('keep');
    assert.deepEqual([...renderer.backgrounds.keys()].sort(), ['air', 'keep']);
    assert.notEqual(renderer.background('market'), bg, 'an evicted pack stage is rebuilt');
    assert.ok(!renderer.backgrounds.has('keep') && renderer.backgrounds.has('air'));
    assert.equal(keep.width, 2560);
  } finally {
    delete globalThis.document;
    if (saved === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = saved;
  }
});

test('the arena menu offers every arena, labelled with its name', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const select = html.match(/<select id="arena-select">(.*?)<\/select>/s)[1];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(options.map(o => o[0]), Object.keys(ARENAS));
  for (const [key, label] of options) assert.equal(label, ARENAS[key].name);
});
