// The sound bank's contracts (ported from the approved preview tests, output/asset-previews/
// audio-bank.test.mjs), run against src/audio.js with the recording fake AudioContext:
//   - every SFX returns its end time and stops every source before when + 0.6 s
//   - every source is held (has onended), and when they all end the sound's bus disconnects itself
//   - automation is valid (exponential targets > 0, times never go backwards per param)
//   - node budget per sound, music compile/scheduler behaviour, mixer rate limit and voice cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/audio.js';
import { fakeCtx } from './fake-audio.js';

const SFX_NAMES = Object.keys(A.SFX);
const VARIANTS = [{}, { strength: 0 }, { strength: 1.5 }, { element: 'air' }, { element: 'earth' }, { weapon: 'staff' }, { weapon: 'crate' },
  { kind: 'crate' }, { heavy: true, strength: 1.5 }, { step: 5 }, { pan: -1 }, { pan: 1 }, { vary: 0 }, { vary: 1 }];

test('every SFX ends before when + 0.6 s and returns its end time', () => {
  for (const name of SFX_NAMES) for (const params of VARIANTS) {
    const ctx = fakeCtx(), when = 1.25;
    const end = A.SFX[name](ctx, ctx.destination, when, params);
    assert.ok(end > when && end <= when + 0.6 + 1e-9, `${name} ${JSON.stringify(params)} returned ${end}`);
    const lastStop = Math.max(...ctx.sources.map(s => s.stopAt));
    assert.ok(lastStop < when + 0.6, `${name} ${JSON.stringify(params)} stops a source at +${(lastStop - when).toFixed(3)} s`);
    assert.ok(ctx.sources.every(s => s.startAt >= when && s.stopAt > s.startAt), `${name}: source scheduled before when or with no length`);
  }
});

test('every source is held and the bus disconnects itself when the last one ends', () => {
  for (const name of SFX_NAMES) {
    const ctx = fakeCtx(), send = ctx.createGain();
    A.SFX[name](ctx, ctx.destination, 0.5, { pan: 0.3, send });
    assert.ok(ctx.sources.length > 0);
    assert.ok(ctx.sources.every(s => typeof s.onended === 'function'), `${name}: a source has no onended (would leak its bus)`);
    const bus = ctx.nodes.filter(n => n.outs.has(ctx.destination));
    assert.equal(bus.length, 1, `${name}: exactly one node feeds the destination`);
    const [busOut] = bus;
    for (const s of ctx.sources.slice(0, -1)) s.onended();
    assert.ok(!busOut.disconnected, `${name}: bus disconnected before its last voice ended`);
    ctx.sources.at(-1).onended();
    assert.ok(busOut.disconnected, `${name}: bus still connected after every voice ended`);
    assert.ok(ctx.nodes.filter(n => n.outs.has(send)).every(n => n.disconnected), `${name}: reverb send left connected`);
  }
});

test('node budget: 6-30 nodes per sound, panner always present, clipper oversampled', () => {
  for (const name of SFX_NAMES) {
    const ctx = fakeCtx();
    A.SFX[name](ctx, ctx.destination, 0, {});
    const count = ctx.nodes.length - 1; // minus destination
    assert.ok(count >= 6 && count <= 30, `${name}: ${count} nodes`);
    assert.equal(ctx.nodes.filter(n => n.kind === 'panner').length, 1, `${name}: one panner per sound, even at pan 0 (same pan law everywhere)`);
    const shapers = ctx.nodes.filter(n => n.kind === 'shaper');
    assert.equal(shapers.length, A.SATURATED.has(name) ? 1 : 0, `${name}: clipper only on SATURATED sounds`);
    for (const w of shapers) assert.equal(w.oversample, '2x');
  }
});

test('voice clipper curve never exceeds ceiling * sqrt(2) and is linear below the knee', () => {
  const ctx = fakeCtx();
  A.SFX.punchLight(ctx, ctx.destination, 0, {});
  const { curve } = ctx.nodes.find(n => n.kind === 'shaper'), { ceiling, knee, range } = A.CLIP.voice;
  const max = Math.max(...curve.map(Math.abs));
  assert.ok(max <= ceiling * Math.SQRT2 + 1e-6, `curve max ${max}`);
  const mid = (curve.length - 1) / 2, x = 0.3 * ceiling; // inside the linear region
  const i = Math.round(mid + x / (ceiling * range) * mid);
  assert.ok(Math.abs(curve[i] / Math.SQRT2 - x) < 1e-3, 'linear region is unity (after the pan lift)');
  assert.ok(knee < 1);
});

test('levels tables cover every sound', () => {
  for (const name of SFX_NAMES) {
    assert.ok(Number.isFinite(A.SFX_LEVELS[name]), `SFX_LEVELS.${name}`);
    assert.ok(Number.isFinite(A.SFX_SEND[name]), `SFX_SEND.${name}`);
  }
  for (const key of Object.keys(A.SONGS)) assert.ok(Number.isFinite(A.MUSIC_LEVELS[key]));
});

test('songs: 16-step bars, known instruments, sane notes, ties across bar lines', () => {
  for (const [key, song] of Object.entries(A.SONGS)) {
    for (const tr of song.tracks) for (const bar of tr.bars) assert.equal(bar.length, 16, `${key}/${tr.inst}: "${bar}"`);
    const notes = A.songNotes(song);
    assert.ok(notes.length > 50, `${key}: ${notes.length} notes`);
    for (const nt of notes) {
      assert.equal(typeof nt.inst, 'function', `${key}: unknown instrument on track ${nt.ti}`);
      assert.ok(nt.step + nt.len <= song.bars * 16);
      if (song.tracks[nt.ti].base) assert.ok(nt.f > 40 && nt.f < 2500, `${key}: note at ${nt.f} Hz`);
    }
  }
  const sheng = A.SONGS.calm.tracks.findIndex(t => t.inst === 'sheng');
  const pedal = A.songNotes(A.SONGS.calm).filter(nt => nt.ti === sheng);
  assert.equal(pedal[0].len, 8 * 16, 'calm pedal holds through the whole A section');
  assert.equal(A.SONGS.calm.bars, 16);
});

test('music player: fresh session per start, resume at the stopped beat, rewind, cleanup', () => {
  const ctx = fakeCtx(), song = A.SONGS.calm, stepDur = 60 / song.bpm / 4;
  const p = A.createMusicPlayer(ctx, ctx.destination, song, { key: 'calm' });
  p.start(0, { fade: 0.02 });
  for (let t = 0; t < 3; t += 1 / 60) { ctx.currentTime = t; p.update(t); }
  const first = ctx.nodes.filter(n => n.kind === 'gain' && n.outs.has(p.input));
  assert.equal(first.length, 1);
  p.stop(3, 0.3);
  const stepAtStop = Math.floor(3 / stepDur);
  assert.equal(p.position, Math.floor(stepAtStop / 4) * 4, 'resume point is the beat that was playing');
  assert.ok(p.position > 0);
  const fadeEvents = first[0].gain.events;
  assert.equal(fadeEvents.at(-1).v, 0, 'stop fades the session to 0');
  for (let t = 3; t < 3.2; t += 1 / 60) p.update(t);
  assert.ok(!first[0].disconnected, 'not dropped mid-fade');
  p.update(3.5);
  assert.ok(first[0].disconnected, 'old session disconnected after its fade');
  const before = ctx.sources.length;
  p.start(4);
  const second = ctx.nodes.filter(n => n.kind === 'gain' && n.outs.has(p.input));
  assert.equal(second.length, 1, 'restart opens a new session gain');
  assert.notEqual(second[0], first[0]);
  const resumed = ctx.sources.slice(before).filter(s => s.startAt >= 4 - 0.01);
  assert.ok(resumed.length > 0 && resumed.every(s => s.startAt >= 4 - 0.01), 'nothing is scheduled before the restart time');
  p.stop(5, 0.2); p.rewind(); assert.equal(p.position, 0);
});

test('music player catches up after a stalled tab instead of bursting', () => {
  const ctx = fakeCtx(), p = A.createMusicPlayer(ctx, ctx.destination, A.SONGS.boss, { key: 'boss' });
  p.start(0);
  p.update(0.1);
  const before = ctx.sources.length;
  p.update(30); // 30 s later
  const burst = ctx.sources.slice(before);
  assert.ok(burst.every(s => s.startAt >= 29.8), 'no notes scheduled in the past');
  assert.ok(burst.length < 80, `${burst.length} sources in one update`);
});

test('mixer: one instance per name per 35 ms, voice cap keeps priority sounds', () => {
  const ctx = fakeCtx(), mix = A.createMixer(ctx, ctx.destination);
  assert.ok(mix.play('punchLight', 1.0) > 0);
  assert.equal(mix.play('punchLight', 1.02), 0, 'rate limited');
  assert.ok(mix.play('punchLight', 1.04) > 0);
  assert.ok(mix.play('kick', 1.04) > 0, 'other names are independent');
  // A pile-up: every sound in the bank twice within 40 ms (68 requests, all different names per pass).
  const t = 5, names = [...SFX_NAMES].sort((a, b) => (A.SFX_PRIORITY[a] ?? 2) - (A.SFX_PRIORITY[b] ?? 2));
  for (const name of names) mix.play(name, t);
  const afterFirst = mix.voices(t);
  assert.equal(afterFirst, Math.min(32, names.length) - 0, `first pass: ${afterFirst} voices`);
  for (const name of names) mix.play(name, t + 0.04);
  assert.ok(mix.voices(t + 0.04) <= 32, `${mix.voices(t + 0.04)} voices`);
  assert.ok(mix.stats.capped > 0, 'cap engaged');
  const mix2 = A.createMixer(fakeCtx());
  for (let i = 0; i < 24; i++) mix2.play('ko', 1 + i * 0.036 * 0); // same name: rate limited to 1
  assert.equal(mix2.voices(1), 1);
  const mix3 = A.createMixer(fakeCtx());
  const must = names.filter(nm => (A.SFX_PRIORITY[nm] ?? 2) === 2);
  for (let i = 0; i < 24; i++) assert.ok(mix3.play(must[i % must.length], 2 + Math.floor(i / must.length) * 0.036) > 0);
  assert.equal(mix3.voices(2.04), 24);
  assert.equal(mix3.play('jump', 2.04), 0, 'priority-0 sound dropped at the soft cap');
  assert.ok(mix3.play('waveGong', 2.08) > 0, 'priority-2 sound still plays above the soft cap');
  const shapers = ctx.nodes.filter(n => n.kind === 'shaper' && n.outs.has(ctx.destination));
  assert.equal(shapers.length, 1, 'the 0.9 ceiling is the last node before the destination');
});

test('drink in parts: the gulps alone, then the chime alone from its own start, together the whole sound', () => {
  // The game voices a use's gulps during the use and its restore chime as the effect lands
  // (src/engine.js), so a vessel knocked away mid-gulp never chimes. The default is unchanged.
  const record = params => {
    const ctx = fakeCtx(), when = 1;
    const end = A.drink(ctx, ctx.destination, when, params);
    return { end, starts: ctx.sources.map(s => +(s.startAt - when).toFixed(6)), stops: ctx.sources.map(s => s.stopAt - when), nodes: ctx.nodes.length - 1 };
  };
  const whole = record({ vary: 0.3 }), gulp = record({ vary: 0.3, part: 'gulp' }), chime = record({ vary: 0.3, part: 'chime' });
  assert.deepEqual(whole.starts, [...gulp.starts, ...chime.starts.map(t => +(t + 0.24).toFixed(6))], 'the same sources, the chime shifted to its own start');
  assert.ok(Math.max(...gulp.starts) < 0.2 && Math.max(...gulp.stops) <= gulp.end - 1 + 1e-9, 'the gulps end by their returned end');
  assert.ok(Math.min(...chime.starts) === 0 && Math.max(...chime.stops) <= chime.end - 1 + 1e-9, 'the chime starts at when');
  assert.ok(gulp.nodes >= 6 && chime.nodes >= 6 && gulp.nodes + chime.nodes > whole.nodes, 'each part is a full voice (bus and panner of its own)');
  assert.ok(Math.abs(whole.end - 1 - 0.59) < 1e-9, 'the whole sound is unchanged');
  // The mixer's rate limit counts a sound's parts apart (a stalled clock can give both one `when`).
  const mix = A.createMixer(fakeCtx());
  assert.ok(mix.play('drink', 1, { part: 'gulp' }) > 0 && mix.play('drink', 1, { part: 'chime' }) > 0, 'gulp and chime both play');
  assert.equal(mix.play('drink', 1.01, { part: 'chime' }), 0, 'a part is still rate limited against itself');
  assert.ok(mix.play('drink', 1.02) > 0, 'the whole sound has its own key');
  assert.equal(mix.play('drink', 1.03), 0, 'and is rate limited against itself');
});
