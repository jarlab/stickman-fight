// src/game-audio.js: the Sound preference gate, cue dispatch by id cursor and the music steering,
// driven by real Game states on the recording fake AudioContext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { GameAudio, impactCue, songFor, panFor, MUSIC_FADES, START_GRACE, SUSPEND_AFTER } from '../src/game-audio.js';
import { MIX, SFX } from '../src/audio.js';
import { fakeCtx } from './fake-audio.js';

const STEP = 1 / 120;

function rig({ enabled = true, music = true, game: options = {} } = {}) {
  const contexts = [];
  const audio = new GameAudio({ enabled, music, random: () => .5, createContext: () => { const ctx = fakeCtx(); contexts.push(ctx); return ctx; } });
  const game = new Game({ element: 'air', mode: 'survival', difficulty: 'normal', seed: 21, ...options });
  return { audio, game, contexts };
}
// Records every mixer request (before its rate limit) and every loop start/stop.
function spy(audio) {
  const plays = [], music = [];
  const play = audio.mix.play;
  audio.mix.play = (name, when, params) => { plays.push({ name, when, params }); return play(name, when, params); };
  for (const [key, p] of Object.entries(audio.players)) {
    const start = p.start.bind(p), stop = p.stop.bind(p);
    p.start = (at, o = {}) => { const r = start(at, o); music.push({ key, op: 'start', at, fade: o.fade, position: p.position }); return r; };
    p.stop = (at, fade) => { music.push({ key, op: 'stop', at, fade }); return stop(at, fade); };
  }
  return { plays, music };
}
// One 60 Hz animation frame: two simulation ticks, then the audio update (as main.js does).
function frames(game, audio, seconds, input = {}) {
  for (let f = 0; f < Math.round(seconds * 60); f++) {
    game.tick(input, STEP);
    game.tick(input, STEP);
    if (audio.ctx) audio.ctx.currentTime += 1 / 60;
    audio.update(game.state);
  }
}

test('impacts map onto the bank: parry, block, landing, kick, heavy and light hits', () => {
  assert.deepEqual(impactCue({ kind: 'parry', strength: .7 }), { name: 'parry', params: {} });
  assert.deepEqual(impactCue({ kind: 'block', strength: .3 }), { name: 'block', params: { strength: .6 } }, 'strength floors at .6');
  assert.deepEqual(impactCue({ kind: 'land', heavy: true, strength: 1 }), { name: 'land', params: { heavy: true, strength: 1 } });
  assert.deepEqual(impactCue({ kind: 'hit', heavy: true, element: 'fire', strength: 1 }), { name: 'punchHeavy', params: { element: 'fire', strength: 1 } });
  assert.deepEqual(impactCue({ kind: 'hit', heavy: false, element: 'air', strength: .55 }), { name: 'punchLight', params: { element: 'air', strength: .6 } });
  assert.deepEqual(impactCue({ kind: 'hit', heavy: true, kick: true, element: 'fire', strength: 1 }).name, 'kick');
  assert.deepEqual(impactCue({ kind: 'hit', strength: NaN }).params.strength, 1);
  for (const kind of ['parry', 'block', 'land', 'hit']) assert.ok(SFX[impactCue({ kind }).name]);
  assert.equal(panFor(0), -1);
  assert.equal(panFor(640), 0);
  assert.equal(panFor(1280), 1);
  assert.equal(panFor(undefined), 0);
});

test('sound off: no AudioContext is ever created and nothing is scheduled, whatever the game does', () => {
  const { audio, game, contexts } = rig({ enabled: false });
  assert.equal(audio.unlock(), false);
  assert.equal(audio.ui('menuOk'), 0);
  game.start();
  frames(game, audio, 3, { attack: true });
  audio.setMusic(false);
  audio.setMusic(true);
  assert.ok(game.state.sounds.length > 0 && game.state.impacts.length > 0, 'the engine still records its cues');
  assert.equal(contexts.length, 0, 'no context while sound is off');
  assert.equal(audio.ctx, null);
  assert.equal(audio.played, 0);
});

test('sound on: one context, mixer and two loops; cues recorded while off are never replayed', () => {
  const { audio, game, contexts } = rig({ enabled: false });
  game.start();
  frames(game, audio, 2, { attack: true });
  const backlog = game.state.sounds.length + game.state.impacts.length;
  assert.ok(backlog > 0);
  audio.setEnabled(true);
  assert.equal(audio.unlock(), true);
  assert.equal(audio.unlock(), true);
  assert.equal(contexts.length, 1, 'unlocking twice reuses the context');
  assert.deepEqual(Object.keys(audio.players), ['calm', 'boss']);
  const { plays } = spy(audio);
  audio.update(game.state);
  assert.deepEqual(plays.filter(p => p.name !== 'menuOk'), [], 'the backlog from before sound was on stays silent');
  frames(game, audio, .5, { attack: true });
  assert.ok(plays.length > 0, 'new cues play');
});

test('each cue plays once, panned by its arena x, through the mixer', () => {
  const { audio, game } = rig();
  audio.unlock();
  const { plays } = spy(audio);
  audio.update(game.state);
  assert.equal(plays.length, 0, 'a preview game (ready) has nothing to say');
  game.start();
  audio.update(game.state);
  assert.deepEqual(plays.map(p => p.name), ['waveGong']);
  assert.equal(plays[0].params.pan, 0);
  assert.equal(plays[0].params.vary, .5);
  assert.ok(Math.abs(plays[0].when - .01) < 1e-9, 'scheduled a hair after now');
  audio.update(game.state);
  assert.equal(plays.length, 1, 'no replays without new cues');
  const p = game.state.player;
  game.sound('jump', 0);
  game.impact(p, null, .8, true, 'land');
  audio.update(game.state);
  assert.deepEqual(plays.slice(1).map(c => [c.name, c.params.pan]), [['land', panFor(p.x)], ['jump', -1]]);
  assert.deepEqual(plays[1].params, { vary: .5, pan: panFor(p.x), heavy: true, strength: .8 });
});

test('a new game object restarts the cursors, so a retry is heard from its first cue', () => {
  const { audio } = rig();
  audio.unlock();
  const { plays } = spy(audio);
  for (let run = 0; run < 2; run++) {
    const game = new Game({ element: 'fire', mode: 'survival', seed: 3 });
    audio.update(game.state);
    game.start();
    frames(game, audio, .2);
  }
  assert.equal(plays.filter(p => p.name === 'waveGong').length, 2);
});

test('music: calm from bar 1 on a run, pause fades it and resume continues on the beat', () => {
  const { audio, game } = rig();
  audio.unlock();
  const { music } = spy(audio);
  audio.update(game.state);
  assert.equal(audio.song, null, 'the menu is quiet');
  game.start();
  frames(game, audio, 3);
  assert.equal(audio.song, 'calm');
  assert.deepEqual(music.map(m => [m.key, m.op, m.position]), [['calm', 'start', 0]]);
  assert.ok(audio.players.calm.playing);
  game.togglePause();
  audio.update(game.state);
  assert.deepEqual(music.at(-1), { key: 'calm', op: 'stop', at: audio.ctx.currentTime, fade: MUSIC_FADES.pause });
  const beat = audio.players.calm.position;
  assert.ok(beat > 0 && beat % 4 === 0, `paused on beat step ${beat}`);
  frames(game, audio, 1);
  game.togglePause();
  frames(game, audio, .1);
  assert.deepEqual(music.at(-1).key + music.at(-1).op + music.at(-1).position, `calmstart${beat}`, 'resumes where it paused');
  assert.equal(songFor(game.state), 'calm');
});

test('music: a guardian crossfades to the boss loop at bar 1, and its fall crossfades back', () => {
  const { audio, game } = rig();
  audio.unlock();
  const { music } = spy(audio);
  game.start();
  frames(game, audio, 2);
  game.state.wave = 2;
  game.beginWave();
  frames(game, audio, 1 / 60);
  assert.equal(audio.song, 'boss');
  assert.deepEqual(music.slice(-2).map(m => [m.key, m.op, m.fade]), [['calm', 'stop', MUSIC_FADES.toBoss], ['boss', 'start', MUSIC_FADES.toBoss]]);
  assert.equal(music.at(-1).position, 0, 'every guardian fight opens the boss loop at bar 1');
  const calmBeat = audio.players.calm.position;
  for (const e of game.state.enemies) if (e.type === 'boss') e.hp = 0;
  frames(game, audio, 1 / 60);
  assert.equal(audio.song, 'calm');
  assert.deepEqual(music.slice(-2).map(m => [m.key, m.op, m.fade]), [['boss', 'stop', MUSIC_FADES.toCalm], ['calm', 'start', MUSIC_FADES.toCalm]]);
  assert.equal(music.at(-1).position, calmBeat, 'the calm loop picks up where the guardian interrupted it');
});

test('music: the tournament fights to the boss loop; a lost run fades out, a new run rewinds', () => {
  const { audio, game } = rig({ game: { mode: 'tournament' } });
  audio.unlock();
  const { music } = spy(audio);
  game.start();
  frames(game, audio, 1);
  assert.equal(audio.song, 'boss');
  game.state.status = 'lost';
  audio.update(game.state);
  assert.deepEqual(music.at(-1), { key: 'boss', op: 'stop', at: audio.ctx.currentTime, fade: MUSIC_FADES.end });
  assert.equal(audio.song, null);
  const next = new Game({ element: 'air', mode: 'survival', seed: 2 });
  next.start();
  frames(next, audio, .1);
  assert.deepEqual([music.at(-1).key, music.at(-1).op, music.at(-1).position], ['calm', 'start', 0]);
  assert.equal(audio.players.boss.position, 0, 'the other loop is rewound for this run too');
});

test('turning sound off mid-run silences the master and stops the loop; music off leaves the effects', () => {
  const { audio, game } = rig();
  audio.unlock();
  const { plays, music } = spy(audio);
  game.start();
  frames(game, audio, 1);
  audio.setMusic(false);
  assert.equal(audio.song, null);
  assert.equal(music.at(-1).op, 'stop');
  assert.equal(audio.mix.music.gain.target, 0, 'the music bus ramps to 0');
  const before = plays.length;
  frames(game, audio, 1, { attack: true });
  assert.ok(plays.length > before, 'effects keep playing with music off');
  assert.equal(audio.song, null);
  audio.setMusic(true);
  assert.equal(audio.mix.music.gain.target, MIX.music);
  assert.equal(audio.song, 'calm', 'music comes back on the beat it left');
  audio.setEnabled(false);
  assert.equal(audio.mix.volume.gain.target, 0, 'the master ramps to 0 at once');
  assert.equal(audio.song, null);
  const silent = plays.length;
  frames(game, audio, 1, { attack: true });
  assert.equal(audio.ui('menuMove', { step: 1 }), 0);
  assert.equal(plays.length, silent, 'nothing is built or played while sound is off');
  audio.setEnabled(true);
  assert.equal(audio.mix.volume.gain.target, MIX.volume);
  frames(game, audio, .1);
  assert.equal(audio.song, 'calm');
});

test('menu sounds play through the mixer at the centre once sound is on', () => {
  const { audio, contexts } = rig();
  assert.ok(audio.ui('menuMove', { step: 3 }) > 0, 'the first menu sound unlocks the context from its click');
  assert.equal(contexts.length, 1);
  const { plays } = spy(audio);
  audio.ctx.currentTime = 1;
  audio.ui('menuOk');
  audio.ui('menuCancel');
  assert.deepEqual(plays.map(p => [p.name, p.params.pan]), [['menuOk', 0], ['menuCancel', 0]]);
  const suspended = rig();
  suspended.audio.createContext = () => fakeCtx({ state: 'suspended' });
  suspended.audio.unlock();
  assert.equal(suspended.audio.ctx.state, 'running', 'unlock resumes a suspended context');
});

test('a context still starting up takes cues on its stopped clock; one that stays suspended drops them', () => {
  // As the spec (and Firefox, Safari) have it: a new context reports 'suspended' until its device starts.
  const clock = { t: 10 };
  let resumes = 0;
  const audio = new GameAudio({ enabled: true, random: () => .5, now: () => clock.t, createContext: () => {
    const ctx = fakeCtx({ state: 'suspended' });
    ctx.resume = () => { resumes++; return new Promise(() => {}); };
    return ctx;
  } });
  const game = new Game({ element: 'air', mode: 'survival', seed: 21 });
  assert.ok(audio.ui('menuOk') > 0, 'the Sound-on confirm is scheduled while the context starts');
  assert.equal(audio.ctx.state, 'suspended');
  assert.equal(resumes, 1);
  const { plays } = spy(audio);
  audio.update(game.state);
  game.start();
  clock.t += 1 / 60;
  audio.update(game.state);
  assert.deepEqual(plays.map(p => p.name), ['waveGong'], 'the first wave gong a frame later is kept too');
  assert.ok(Math.abs(plays[0].when - .01) < 1e-9, 'on the stopped clock, so it plays as the clock starts');
  assert.equal(audio.song, null, 'the music waits for a running clock');
  clock.t += START_GRACE;
  game.sound('jump', 300);
  audio.update(game.state);
  assert.deepEqual(plays.map(p => p.name), ['waveGong'], 'a context that stays suspended drops game cues; nothing piles up');
  assert.ok(audio.ui('menuMove', { step: 2 }) > 0, 'a new click asks to resume again and opens a new window');
  assert.equal(resumes, 2);
  audio.ctx.state = 'running';
  game.sound('jump', 300);
  frames(game, audio, .1);
  assert.ok(plays.some(p => p.name === 'jump' && p.when > .01), 'cues play once the context runs');
  assert.equal(audio.song, 'calm');
});

test('Sound off suspends the context once its fades are over; Sound on resumes it from the click', async () => {
  const { audio, game } = rig();
  audio.unlock();
  const ctx = audio.ctx;
  let suspends = 0, resumes = 0;
  const suspend = ctx.suspend, resume = ctx.resume;
  ctx.suspend = () => { suspends++; return suspend(); };
  ctx.resume = () => { resumes++; return resume(); };
  const { plays } = spy(audio);
  game.start();
  frames(game, audio, 1);
  assert.equal(audio.song, 'calm');
  audio.setEnabled(false);
  frames(game, audio, SUSPEND_AFTER - .1, { attack: true });
  assert.equal(ctx.state, 'running', 'the master and music fade out and the reverb tail rings out first');
  assert.equal(suspends, 0);
  frames(game, audio, .2, { attack: true });
  assert.equal(ctx.state, 'suspended', 'then the audio thread idles');
  assert.equal(suspends, 1);
  await Promise.resolve(); // the suspend() promise settles
  frames(game, audio, 1);
  assert.equal(suspends, 1, 'suspended once');
  const silent = plays.length;
  audio.setEnabled(true);
  assert.equal(resumes, 1, 'the Sound button click resumes it');
  assert.equal(ctx.state, 'running');
  assert.equal(audio.mix.volume.gain.target, MIX.volume);
  frames(game, audio, .5, { attack: true });
  assert.ok(plays.length > silent, 'cues play again');
  assert.equal(audio.song, 'calm');
  // Off and straight back on before the fades end: the context never stops.
  audio.setEnabled(false);
  frames(game, audio, .5);
  audio.setEnabled(true);
  frames(game, audio, SUSPEND_AFTER + .5);
  assert.equal(suspends, 1);
  assert.equal(ctx.state, 'running');
  assert.equal(resumes, 1, 'nothing to resume');
  // Sound back on while a suspend() is still settling (state still reads 'running'): resume queues after it.
  let settle;
  ctx.suspend = () => { suspends++; return new Promise(done => { settle = () => { ctx.state = 'suspended'; done(); }; }); };
  audio.setEnabled(false);
  frames(game, audio, SUSPEND_AFTER + .1);
  assert.equal(suspends, 2);
  assert.equal(ctx.state, 'running', 'the suspend has not settled yet');
  audio.setEnabled(true);
  assert.equal(resumes, 2, 'resume is still asked for, so the context does not end up suspended with sound on');
});

test('a blow recorded with a delay (the second thrown knife) plays that much later, past the rate limit', () => {
  const { audio, game } = rig();
  audio.unlock();
  game.start();
  audio.update(game.state);
  const { plays } = spy(audio);
  const p = game.state.player;
  game.impact(p, null, .6, false, 'hit');
  game.impact(p, null, .6, false, 'hit');
  game.state.lastImpact.delay = .06;
  audio.update(game.state);
  const punches = plays.filter(c => c.name === 'punchLight');
  assert.equal(punches.length, 2);
  assert.ok(Math.abs(punches[1].when - punches[0].when - .06) < 1e-9, 'a beat apart');
  assert.ok(.06 > MIX.minGap);
  assert.equal(audio.mix.stats.limited, 0, 'neither is dropped');
});
