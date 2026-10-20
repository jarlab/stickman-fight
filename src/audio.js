// Fourfold procedural sound bank: 34 original SFX and two pentatonic music loops, all built
// in WebAudio from oscillators, one cached noise buffer and one cached crackle buffer (no audio
// files). No DOM access and no timers: each SFX is a pure function
// sfx(ctx, destination, when, params) -> endTime that builds a short-lived graph (6-26 nodes)
// on an AudioContext or an OfflineAudioContext. Music is pattern data plus a small look-ahead
// scheduler pumped from the animation frame. createMixer() is the single route to the
// speakers: volumes, rate limiting, voice cap, reverb send, limiter and ceiling.
// src/game-audio.js wires this bank to the game; nothing here knows about the engine.
// The block between the markers is the approved preview bank (output/asset-previews/audio-bank.js),
// ported unchanged but for one addition: drink's optional `part` (its gulps or its chime alone),
// which the mixer's rate limit counts apart.

// === ASSETS START ===

const FLOOR = 0.0001;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dbToGain = db => Math.pow(10, db / 20);

// ---------- headroom & pan law ----------
// params.pan is -1 (screen left) .. 1 (screen right) and maps onto a +-0.6 panner position, so edge
// fighters are clearly placed but never hard-panned. StereoPanner's equal-power law sits 3 dB down
// at the centre, so every voice is lifted by sqrt(2): centre = unity on both channels, power stays
// constant across the field, and the louder channel at full pan is +2.6 dB (x1.345). Each sound
// peaks <= 0.66 at the centre, so no channel passes 0.89 anywhere in the field.
export const PAN_WIDTH = 0.6;
const PAN_COMP = Math.SQRT2;
// Soft clippers: linear below knee*ceiling, tanh knee above it, never past the ceiling. `range`
// is how far over the ceiling the curve still shapes smoothly (x2 = +6 dB) before it flattens.
export const CLIP = {
  voice: { ceiling: 0.66, knee: 0.6, range: 2 },  // per-sound bus, before the panner
  music: { ceiling: 0.66, knee: 0.6, range: 2 },  // per-song bus
  master: { ceiling: 0.9, knee: 0.7, range: 2 },  // last node before the speakers
};
function kneeCurve({ ceiling, knee, range }, post = 1) {
  const n = 2049, c = new Float32Array(n), k = ceiling * knee, span = ceiling - k, X = ceiling * range;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) * 2 - 1) * X, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= k ? a : k + span * Math.tanh((a - k) / span)) * post;
  }
  return c;
}
const VOICE_CURVE = kneeCurve(CLIP.voice, PAN_COMP);  // the panner's sqrt(2) lift is folded into the curve
const MUSIC_CURVE = kneeCurve(CLIP.music);
const MASTER_CURVE = kneeCurve(CLIP.master);
const VOICE_IN = 1 / (CLIP.voice.ceiling * CLIP.voice.range);
function shaper(ctx, curve) {
  const w = ctx.createWaveShaper();
  w.curve = curve;
  w.oversample = '2x'; // the knee only bends the first few ms of a hit, but keep its harmonics from folding back
  return w;
}

// Output trim per sound in dB. Calibrated offline (see audio.html) so every sound lands on its
// loudness target (K-weighted stereo, loudest 100 ms) with a centre peak <= 0.66 and at most
// 2 dB of drive into its soft clipper.
export const SFX_LEVELS = {
  punchLight: -0.8, punchHeavy: -3.2, kick: -0.5, whoosh: -2.7, block: 1.1, parry: -6.1, grab: 0.3,
  throw: -1.0, land: -2.0, jump: 2.0, dash: -0.6, pickupWeapon: 1.7, weaponBreak: 1.3, drink: -0.7, eat: -0.7, smash: -1.5,
  energyPickup: -3.0, specialAir: 2.3, specialWater: -3.6, specialEarth: -2.6, specialFire: 0.2,
  burstAir: 7.2, burstWater: -1.3, burstEarth: -3.9, burstFire: -3.7, freeze: 2.1, shatter: 0.9,
  burn: -3.6, enemyDown: -3.0, ko: -2.4, waveGong: -2.9, bossDrum: -1.5, menuMove: -0.3, menuOk: -5.1,
  menuCancel: -2.5, menuJoin: -5.5,
};
export const MUSIC_LEVELS = { calm: -4.7, boss: -2.7 };
// Sounds whose bus runs through the voice soft clipper (transient-heavy hits and slams).
export const SATURATED = new Set(['punchLight', 'punchHeavy', 'kick', 'block', 'land', 'pickupWeapon', 'weaponBreak',
  'shatter', 'enemyDown', 'ko', 'bossDrum', 'burstEarth', 'burstFire']);
// Reverb send per sound (post-pan, into createMixer's courtyard reverb). Hits stay nearly dry.
export const SFX_SEND = {
  punchLight: 0.04, punchHeavy: 0.08, kick: 0.05, whoosh: 0.04, block: 0.04, parry: 0.22, grab: 0.03, throw: 0.06,
  land: 0.05, jump: 0.03, dash: 0.04, pickupWeapon: 0.08, weaponBreak: 0.1, drink: 0.18, eat: 0.14, smash: 0.16, energyPickup: 0.22,
  specialAir: 0.16, specialWater: 0.2, specialEarth: 0.12, specialFire: 0.14,
  burstAir: 0.3, burstWater: 0.32, burstEarth: 0.24, burstFire: 0.26,
  freeze: 0.2, shatter: 0.18, burn: 0.04, enemyDown: 0.1, ko: 0.34, waveGong: 0.4, bossDrum: 0.32,
  menuMove: 0.06, menuOk: 0.1, menuCancel: 0.06, menuJoin: 0.16,
};
// Voice-cap priority: 0 = frequent motion/ambience (dropped first), 1 = contact, 2 = always play.
export const SFX_PRIORITY = {
  jump: 0, dash: 0, whoosh: 0, burn: 0, grab: 1, block: 1, land: 1, punchLight: 1, kick: 1, throw: 1,
  pickupWeapon: 1, eat: 1, smash: 1, specialAir: 1, specialWater: 1, specialEarth: 1, specialFire: 1, freeze: 1,
};

// Element pitch tint used by hits (same ordering as the game's old impact tones).
const EL_PITCH = { air: 1.16, water: 0.93, earth: 0.8, fire: 1.05 };

// ---------- cached source buffers: one of each per AudioContext ----------
const NOISE = new WeakMap();
const CRACKLE = new WeakMap();
const ROOM = new WeakMap();
function xorshift(seed) {
  let s = seed | 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function noiseBuffer(ctx) {
  let b = NOISE.get(ctx);
  if (!b) {
    const n = ctx.sampleRate | 0, r = xorshift(0x2f6b1d3);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    NOISE.set(ctx, b);
  }
  return b;
}
// Sparse decaying grains: fire crackle, gravel, ice forming. Played looped from any offset.
function crackleBuffer(ctx) {
  let b = CRACKLE.get(ctx);
  if (!b) {
    const sr = ctx.sampleRate, n = sr | 0, r = xorshift(0x51ed270b);
    b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      if (r() < 70 / sr) {
        const amp = (0.2 + 0.8 * r() * r()) * (r() < 0.5 ? -1 : 1), len = (0.0005 + 0.0025 * r()) * sr;
        for (let k = 0; k < len * 5 && i + k < n; k++) d[i + k] += amp * Math.exp(-k / len) * (r() * 2 - 1);
      }
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] /= peak || 1;
    CRACKLE.set(ctx, b);
  }
  return b;
}
// Courtyard impulse response (1.1 s, RT60 about 1 s): early reflections off plaster walls, then
// a diffuse tail that darkens as it ages. Unit energy per channel, decorrelated L/R.
function roomImpulse(ctx) {
  let b = ROOM.get(ctx);
  if (!b) {
    const sr = ctx.sampleRate, n = Math.round(sr * 1.1);
    b = ctx.createBuffer(2, n, sr);
    const taps = [[0.011, 0.5], [0.019, 0.38], [0.027, 0.3], [0.037, 0.26], [0.049, 0.2], [0.063, 0.16]];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch), r = xorshift(0x1f2e3d + ch * 977);
      let lp = 0, e = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, a = 0.25 + 0.7 * Math.min(1, t / 0.9);
        lp += (1 - a) * ((r() * 2 - 1) - lp);
        d[i] = lp * 3 * Math.exp(-t / 0.15) * Math.min(1, t / 0.012);
      }
      for (const [t, g] of taps) d[Math.round((t + ch * 0.0031) * sr)] += g * (ch ? -1 : 1);
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const s = 1 / Math.sqrt(e || 1);
      for (let i = 0; i < n; i++) d[i] *= s;
    }
    ROOM.set(ctx, b);
  }
  return b;
}

// ---------- voice plumbing ----------
// Every SFX opens one bus: trim * params.gain -> [voice clipper] -> panner -> destination (+ reverb send).
// The bus disconnects itself once its last voice ends, so finished sounds leave nothing in the graph.
function open(ctx, out, name, p) {
  const g = ctx.createGain(), sat = SATURATED.has(name), panOk = !!ctx.createStereoPanner;
  const level = dbToGain(SFX_LEVELS[name] || 0) * (p.gain ?? 1);
  const pan = panOk ? ctx.createStereoPanner() : ctx.createGain();
  if (panOk) pan.pan.value = clamp(p.pan || 0, -1, 1) * PAN_WIDTH;
  else pan.gain.value = 1 / PAN_COMP; // no panner: mono upmix is already unity, undo the lift
  g.gain.value = sat ? level * VOICE_IN : level * PAN_COMP;
  const nodes = [g, pan];
  if (sat) { const w = shaper(ctx, VOICE_CURVE); g.connect(w); w.connect(pan); nodes.push(w); } else g.connect(pan);
  pan.connect(out);
  const send = p.send ? (p.sendLevel ?? SFX_SEND[name] ?? 0) : 0;
  if (send > 0) { const s = ctx.createGain(); s.gain.value = send; pan.connect(s); s.connect(p.send); nodes.push(s); }
  g.__live = 0;
  g.__nodes = nodes;
  return g;
}
function hold(b, src) {
  if (b.__live === undefined) return src; // long-lived music bus: nothing to clean up
  b.__live++;
  src.onended = () => { if (--b.__live === 0) for (let i = 0; i < b.__nodes.length; i++) b.__nodes[i].disconnect(); };
  return src;
}
// Attack, optional hold at the peak, exponential decay. A short hold adds body without adding peak.
function env(param, t, a, peak, d, h = 0) {
  const pk = Math.max(peak, FLOOR * 2);
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(pk, t + a);
  if (h > 0) param.setValueAtTime(pk, t + a + h);
  param.exponentialRampToValueAtTime(FLOOR, t + a + h + d);
}
// f: Hz | [start, end] | [start, atPeak, end]
function path(param, t, a, d, f) {
  if (typeof f === 'number') { param.setValueAtTime(f, t); return; }
  param.setValueAtTime(f[0], t);
  if (f.length === 2) param.exponentialRampToValueAtTime(f[1], t + a + d);
  else { param.exponentialRampToValueAtTime(f[1], t + a); param.exponentialRampToValueAtTime(f[2], t + a + d); }
}
// Oscillator with pitch path + attack/exp-decay envelope.
function tn(ctx, b, t, type, f, a, d, peak, h = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  path(o.frequency, t, a, d + h, f);
  env(g.gain, t, a, peak, d, h);
  o.connect(g); g.connect(b);
  o.start(t); o.stop(t + a + h + d + 0.01);
  hold(b, o);
  return o;
}
// Filtered noise (or crackle) burst with a filter-frequency path. Returns the filter.
function nz(ctx, b, t, type, f, q, a, d, peak, off = 0, buf = null) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf || noiseBuffer(ctx);
  s.loop = true;
  fl.type = type; fl.Q.value = q;
  path(fl.frequency, t, a, d, f);
  env(g.gain, t, a, peak, d);
  s.connect(fl); fl.connect(g); g.connect(b);
  s.start(t, (off - Math.floor(off)) * 0.9);
  s.stop(t + a + d + 0.01);
  hold(b, s);
  return fl;
}
// Two-operator FM bell: inharmonic ratios give gongs and metal, integer ratios give chimes.
function bell(ctx, b, t, f, ratio, index, d, peak, glide = 1, atk = 0.003) {
  const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  c.frequency.setValueAtTime(f, t);
  m.frequency.setValueAtTime(f * ratio, t);
  if (glide !== 1) {
    c.frequency.exponentialRampToValueAtTime(f * glide, t + d * 0.45);
    m.frequency.exponentialRampToValueAtTime(f * ratio * glide, t + d * 0.45);
  }
  const dev = f * ratio * index;
  mg.gain.setValueAtTime(dev, t);
  mg.gain.exponentialRampToValueAtTime(dev * 0.03 + 0.01, t + d);
  env(g.gain, t, atk, peak, d);
  m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(b);
  const end = t + d + 0.01;
  m.start(t); c.start(t); m.stop(end); c.stop(end);
  hold(b, m); hold(b, c);
  return c;
}
// Plucked string (guzheng-like): sawtooth through a closing low-pass, optional press-bend.
function pluck(ctx, b, t, f, d, peak, bright = 7, bend = 0) {
  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  if (bend) { o.frequency.setValueAtTime(f * (1 - bend), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); }
  else o.frequency.setValueAtTime(f, t);
  lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(Math.min(f * bright, 14000), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.05, 60), t + d * 0.7);
  env(g.gain, t, 0.002, peak, d);
  o.connect(lp); lp.connect(g); g.connect(b);
  o.start(t); o.stop(t + d + 0.012);
  hold(b, o);
  return o;
}
// Low-frequency modulator onto any AudioParam (filter sweep swirl, vibrato).
function lfo(ctx, b, t, end, rate, rate1, depth, param) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(rate, t);
  if (rate1 !== rate) o.frequency.linearRampToValueAtTime(rate1, end);
  g.gain.setValueAtTime(depth, t);
  o.connect(g); g.connect(param);
  o.start(t); o.stop(end);
  hold(b, o);
  return o;
}
// Quiet layer about an octave above a sub-heavy body, kept in the 140-300 Hz band that laptop
// speakers still reproduce, so a thud keeps its weight without the sub (see laptop delta in audio.html).
function weight(ctx, b, t, f0, f1, d, peak) { return tn(ctx, b, t, 'triangle', [f0, f1], 0.004, d, peak); }
const vf = p => 1 + ((p.vary ?? 0.5) - 0.5) * 0.08; // +-4 % pitch from params.vary (0..1)
const vo = p => (p.vary ?? 0.5) * 0.73 + 0.11;       // noise read offset

// ---------- strikes & contact ----------
// Components are staggered by 2-6 ms (click, then slap, then body) like a real impact: the peaks do
// not stack, so hits reach their loudness with little clipper drive. strength (engine 0..1, up to
// 1.5) mostly changes timbre: brighter slap, deeper body drop, an extra sub layer on big hits.
export function punchLight(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'punchLight', p), s = clamp(p.strength ?? 0.7, 0, 1.5), k = vf(p) * (EL_PITCH[p.element] || 1), o = vo(p);
  const w = 0.86 + 0.14 * s, br = 0.72 + 0.42 * s;
  nz(ctx, b, when, 'highpass', 3400 * br, 0.7, 0.0005, 0.008 + 0.005 * s, (0.07 + 0.15 * s) * w, o + 0.3);   // knuckle click
  nz(ctx, b, when + 0.002, 'bandpass', [1700 * k * br, 720 * k], 0.8, 0.0015, 0.055 + 0.03 * s, (0.42 + 0.17 * s) * w, o); // cloth slap
  tn(ctx, b, when + 0.004, 'sine', [(140 + 45 * s) * k, (72 - 14 * s) * k], 0.003, 0.08 + 0.03 * s, (0.7 - 0.07 * s) * w, 0.006); // body
  if (s > 0.85) tn(ctx, b, when + 0.014, 'sine', [95 * k, 50 * k], 0.006, 0.1, (s - 0.85) * 0.45 * w);       // big-hit sub
  return when + 0.15;
}
function heavyBody(ctx, b, t, k, s, o, gain = 1) {
  const w = (0.82 + 0.18 * s) * gain, br = 0.82 + 0.25 * s;
  nz(ctx, b, t, 'highpass', 2500 * br, 0.7, 0.0008, 0.02, (0.3 + 0.2 * s) * w, o);                         // crack
  nz(ctx, b, t + 0.002, 'bandpass', [1450 * k * br, 470 * k], 0.8, 0.002, 0.1, 0.55 * w, o + 0.2);        // slap
  tn(ctx, b, t + 0.003, 'triangle', [270 * k, 80 * k], 0.001, 0.11, 0.4 * w);                             // knock
  tn(ctx, b, t + 0.006, 'sine', [(108 + 22 * s) * k, 40 * k], 0.003, 0.24, 0.9 * w);                      // body
  weight(ctx, b, t + 0.012, 280 * k, 170 * k, 0.17, 0.32 * w);                                            // speaker weight
  tn(ctx, b, t + 0.014, 'sine', [58, 36], 0.005, 0.26, (0.25 + 0.2 * s) * w);                            // sub tail
}
export function punchHeavy(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'punchHeavy', p), s = clamp(p.strength ?? 1, 0, 1.5), k = vf(p) * (EL_PITCH[p.element] || 1);
  heavyBody(ctx, b, when, k, s, vo(p));
  return when + 0.3;
}
export function kick(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'kick', p), s = clamp(p.strength ?? 0.8, 0, 1.5), k = vf(p) * (EL_PITCH[p.element] || 1), o = vo(p);
  const w = 0.86 + 0.14 * s, br = 0.72 + 0.42 * s, t = when + 0.035;
  nz(ctx, b, when, 'bandpass', [900, 3400 * br], 1.6, 0.03, 0.03, 0.3 * w, o + 0.5);                     // leg whip
  nz(ctx, b, t, 'highpass', 3200 * br, 0.7, 0.0005, 0.012, (0.07 + 0.16 * s) * w, o + 0.2);              // heel crack
  nz(ctx, b, t + 0.002, 'bandpass', [1150 * k * br, 420 * k], 0.8, 0.0015, 0.08, (0.44 + 0.15 * s) * w, o); // slap
  tn(ctx, b, t + 0.005, 'sine', [(125 + 35 * s) * k, (52 - 6 * s) * k], 0.003, 0.14 + 0.02 * s, 0.68 * w, 0.008); // body
  weight(ctx, b, t + 0.016, 300 * k, 170 * k, 0.11, 0.28 * w);
  return when + 0.22;
}
// Attack swing. params.weapon: 'staff' | 'spear' | 'crate' lengthen and darken it.
export function whoosh(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'whoosh', p), s = clamp(p.strength ?? 0.8, 0, 1.5), k = vf(p), o = vo(p);
  const wpn = p.weapon, heavy = wpn === 'crate', long = wpn === 'staff' || wpn === 'spear';
  const len = 0.15 + 0.08 * s + (long ? 0.05 : 0) + (heavy ? 0.1 : 0);
  const fk = k * (heavy ? 0.55 : long ? 0.8 : 1), a = len * 0.42;
  nz(ctx, b, when, 'bandpass', [520 * fk, 2500 * fk, 650 * fk], long ? 2.4 : 1.4, a, len - a, 0.75, o);
  nz(ctx, b, when + a * 0.6, 'highpass', 4200, 0.7, a * 0.4, len * 0.35, 0.16, o + 0.4);
  if (long) tn(ctx, b, when, 'triangle', [150 * k, 210 * k, 120 * k], a, len - a, 0.14);
  return when + len;
}
export function block(ctx, out, when, p = {}) { // strength scales level too (a hard block is louder) and brightens the clack
  const b = open(ctx, out, 'block', p), s = clamp(p.strength ?? 0.6, 0, 1.5), k = vf(p), o = vo(p);
  const w = 0.76 + 0.24 * s;
  nz(ctx, b, when, 'bandpass', 2500 * k * (0.85 + 0.25 * s), 3, 0.0006, 0.016, (0.38 + 0.16 * s) * w, o);
  tn(ctx, b, when + 0.001, 'sine', [940 * k, 720 * k], 0.001, 0.04, 0.2 * w);
  tn(ctx, b, when + 0.002, 'triangle', [640 * k, 380 * k], 0.001, 0.07, 0.55 * w);
  tn(ctx, b, when + 0.004, 'sine', [150, 84], 0.002, 0.09, 0.5 * w);
  return when + 0.1;
}
// Perfect-guard "ting": a fifth-apart bell pair, bright and short.
export function parry(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'parry', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'highpass', 5200, 0.7, 0.0005, 0.01, 0.4, o);
  bell(ctx, b, when, 1568 * k, 1.41, 1.6, 0.48, 0.5, 1, 0.0015);
  tn(ctx, b, when + 0.004, 'sine', 2349 * k, 0.001, 0.34, 0.22);
  tn(ctx, b, when + 0.008, 'sine', 3136 * k, 0.001, 0.18, 0.09);
  return when + 0.5;
}
export function grab(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'grab', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', [2800 * k, 1700 * k], 1.2, 0.006, 0.05, 0.5, o);
  nz(ctx, b, when + 0.05, 'bandpass', [1900 * k, 1100 * k], 1, 0.008, 0.07, 0.45, o + 0.25);
  tn(ctx, b, when + 0.04, 'sine', [210 * k, 118 * k], 0.003, 0.07, 0.6);
  return when + 0.14;
}
export function throwSfx(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'throw', p), k = vf(p), o = vo(p);
  tn(ctx, b, when, 'triangle', [135 * k, 160 * k, 92 * k], 0.03, 0.12, 0.38);
  nz(ctx, b, when + 0.04, 'bandpass', [480 * k, 1900 * k, 300 * k], 1.2, 0.12, 0.25, 0.7, o);
  nz(ctx, b, when + 0.1, 'highpass', 3600, 0.7, 0.08, 0.12, 0.16, o + 0.5);
  return when + 0.42;
}
// Landing thud. params.heavy (knockdown / big fall) adds a sub tail and is ~4 dB louder on purpose.
export function land(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'land', p), s = clamp(p.strength ?? 0.7, 0, 1.5), k = vf(p), o = vo(p);
  const w = 0.6 + 0.4 * s, heavy = !!p.heavy;
  nz(ctx, b, when, 'bandpass', 1400 * k, 1.5, 0.001, 0.03, 0.22 * w, o + 0.3);
  nz(ctx, b, when + 0.001, 'lowpass', [760, 150], 0.7, 0.002, heavy ? 0.16 : 0.1, 0.5 * w, o);
  tn(ctx, b, when + 0.004, 'sine', [95 * k, 34 * k], 0.003, heavy ? 0.2 : 0.13, 0.9 * w);
  weight(ctx, b, when + 0.012, (heavy ? 250 : 270) * k, 160 * k, heavy ? 0.16 : 0.1, (heavy ? 0.42 : 0.32) * w);
  if (heavy) tn(ctx, b, when + 0.012, 'sine', [52, 30], 0.005, 0.26, 0.45 * w);
  return when + (heavy ? 0.28 : 0.16);
}
export function jump(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'jump', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', [600 * k, 1900 * k], 1.3, 0.04, 0.09, 0.45, o);         // cloth flap
  tn(ctx, b, when, 'sine', [120 * k, 80 * k], 0.002, 0.05, 0.4);                         // push-off
  nz(ctx, b, when, 'bandpass', 1500 * k, 1.5, 0.001, 0.02, 0.2, o + 0.4);
  return when + 0.14;
}
export function dash(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'dash', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', 1400 * k, 1.2, 0.001, 0.025, 0.35, o + 0.2);              // foot scuff
  nz(ctx, b, when + 0.01, 'bandpass', [1600 * k, 3400 * k, 900 * k], 1.8, 0.05, 0.14, 0.6, o);
  nz(ctx, b, when + 0.02, 'highpass', 5000, 0.7, 0.04, 0.08, 0.16, o + 0.5);
  return when + 0.2;
}

// ---------- items ----------
// params.kind: 'staff' | 'spear' (two wooden clacks) or 'crate' (hollow box thonk).
export function pickupWeapon(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'pickupWeapon', p), k = vf(p), o = vo(p);
  if (p.kind === 'crate') {
    nz(ctx, b, when, 'bandpass', 900 * k, 2.5, 0.002, 0.05, 0.28, o);
    tn(ctx, b, when + 0.002, 'triangle', [310 * k, 210 * k], 0.002, 0.11, 0.42);
    tn(ctx, b, when + 0.005, 'sine', [150 * k, 110 * k], 0.003, 0.14, 0.36);
    nz(ctx, b, when + 0.09, 'bandpass', [1300 * k, 700 * k], 4, 0.02, 0.08, 0.17, o + 0.3); // creak
  } else {
    nz(ctx, b, when, 'bandpass', 2300 * k, 4, 0.0008, 0.022, 0.26, o);
    tn(ctx, b, when + 0.002, 'triangle', [840 * k, 640 * k], 0.0015, 0.065, 0.5);
    nz(ctx, b, when + 0.07, 'bandpass', 2900 * k, 4, 0.0008, 0.022, 0.22, o + 0.4);
    tn(ctx, b, when + 0.072, 'triangle', [1060 * k, 800 * k], 0.0015, 0.07, 0.45);
    nz(ctx, b, when + 0.02, 'bandpass', [700, 1800], 1.4, 0.05, 0.06, 0.16, o + 0.6); // grip swish
  }
  return when + 0.2;
}
// Splintering weapon (staff/spear snap, crate burst).
const SPLINTERS = [[0.03, 1500, 0.34], [0.065, 1150, 0.3], [0.11, 1720, 0.24], [0.165, 920, 0.2], [0.24, 1330, 0.15], [0.31, 1050, 0.1]];
export function weaponBreak(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'weaponBreak', p), k = vf(p) * (p.kind === 'crate' ? 0.7 : 1), o = vo(p);
  nz(ctx, b, when, 'highpass', 1800, 0.7, 0.0015, 0.05, 0.4, o);
  tn(ctx, b, when + 0.002, 'triangle', [480 * k, 190 * k], 0.001, 0.08, 0.48);
  tn(ctx, b, when + 0.005, 'sine', [160 * k, 70 * k], 0.003, 0.11, 0.42);
  for (let i = 0; i < SPLINTERS.length; i++) {
    const s = SPLINTERS[i];
    tn(ctx, b, when + s[0], 'triangle', [s[1] * k, s[1] * 0.8 * k], 0.0008, 0.03, s[2]);
  }
  nz(ctx, b, when + 0.02, 'bandpass', [3000, 1600], 1.2, 0.01, 0.25, 0.22, o + 0.4, crackleBuffer(ctx));
  return when + 0.36;
}
// Gourd sip (heal pickup): two rising gulps, then a soft two-note restore chime.
// p.part (game addition): 'gulp' plays only the gulps, 'chime' only the chime, from `when`; the
// same nodes and levels as the whole sound, so the game can voice a use's halves apart.
export function drink(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'drink', p), k = vf(p), o = vo(p);
  if (p.part !== 'chime') {
    tn(ctx, b, when, 'sine', [250 * k, 540 * k], 0.006, 0.07, 0.6);
    nz(ctx, b, when, 'lowpass', 900, 1, 0.004, 0.05, 0.18, o);
    tn(ctx, b, when + 0.12, 'sine', [300 * k, 640 * k], 0.006, 0.07, 0.6);
    nz(ctx, b, when + 0.12, 'lowpass', 1000, 1, 0.004, 0.05, 0.18, o + 0.3);
    if (p.part === 'gulp') return when + 0.22;
  }
  const at = p.part === 'chime' ? when - 0.24 : when;
  bell(ctx, b, at + 0.24, 784, 2, 0.6, 0.3, 0.26);
  bell(ctx, b, at + 0.3, 1175, 2, 0.5, 0.28, 0.22);
  return at + 0.59;
}
// Bun / peach bite (food pickup): two soft muffled chomps with a chew, then the same restore
// chime as a drink. p.part 'gulp' plays only the bites, 'chime' only the chime (as drink).
export function eat(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'eat', p), k = vf(p), o = vo(p);
  if (p.part !== 'chime') {
    for (const [dt, f] of [[0, 1], [0.13, 0.9]]) {
      nz(ctx, b, when + dt, 'lowpass', 700 * f * k, 0.8, 0.003, 0.06, 0.55, o + dt);
      tn(ctx, b, when + dt, 'sine', [190 * f * k, 120 * f * k], 0.002, 0.06, 0.4);
      nz(ctx, b, when + dt + 0.03, 'bandpass', 1800 * f * k, 1.4, 0.004, 0.04, 0.14, o + dt + 0.2);
    }
    if (p.part === 'gulp') return when + 0.22;
  }
  const at = p.part === 'chime' ? when - 0.24 : when;
  bell(ctx, b, at + 0.24, 784, 2, 0.6, 0.3, 0.26);
  bell(ctx, b, at + 0.3, 1175, 2, 0.5, 0.28, 0.22);
  return at + 0.59;
}
// Porcelain smash (a tonic bottle or wine jar knocked from the hand): a bright glassy crack,
// inharmonic shard rings and a short tinkle of falling pieces.
const PORCELAIN_SHARDS = [[0, 2793, 0.28], [0.012, 3951, 0.2], [0.05, 3322, 0.15], [0.12, 4699, 0.1]];
export function smash(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'smash', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'highpass', 2600, 0.7, 0.001, 0.06, 0.5, o);
  nz(ctx, b, when, 'bandpass', 5200 * k, 2, 0.002, 0.12, 0.26, o + 0.3);
  for (const [dt, f, peak] of PORCELAIN_SHARDS) bell(ctx, b, when + dt, f * k, 1.41, 0.9, 0.16, peak);
  return when + 0.4;
}
// Qi orb (energy pickup): a quick rising pentatonic sparkle.
const SPARKLE = [1319, 1568, 1760, 2349];
export function energyPickup(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'energyPickup', p), k = vf(p);
  for (let i = 0; i < SPARKLE.length; i++) bell(ctx, b, when + i * 0.05, SPARKLE[i] * k, 2, 0.8, 0.22 + i * 0.04, 0.3 - i * 0.03);
  nz(ctx, b, when, 'highpass', [5000, 8000], 0.7, 0.12, 0.12, 0.08, vo(p));
  return when + 0.42;
}

// ---------- elements: special (projectile cast) and burst ----------
export function specialAir(ctx, out, when, p = {}) { // Wind bolt
  const b = open(ctx, out, 'specialAir', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', [700 * k, 2900 * k, 1500 * k], 3, 0.05, 0.25, 0.75, o);
  tn(ctx, b, when, 'sine', [1100 * k, 1950 * k, 1450 * k], 0.04, 0.22, 0.1);
  nz(ctx, b, when + 0.01, 'highpass', 5200, 0.7, 0.02, 0.12, 0.16, o + 0.4);
  return when + 0.32;
}
export function burstAir(ctx, out, when, p = {}) { // Cyclone: LFO-swirled noise, accelerating
  const b = open(ctx, out, 'burstAir', p), k = vf(p), o = vo(p);
  const f = nz(ctx, b, when, 'bandpass', [700 * k, 1300 * k, 900 * k], 2.6, 0.18, 0.38, 0.8, o);
  lfo(ctx, b, when, when + 0.57, 7, 15, 520 * k, f.frequency);
  nz(ctx, b, when, 'lowpass', [260, 520, 200], 0.7, 0.12, 0.42, 0.4, o + 0.3);
  const w = tn(ctx, b, when, 'triangle', [480 * k, 1150 * k, 900 * k], 0.22, 0.32, 0.06);
  lfo(ctx, b, when, when + 0.55, 7, 15, 60, w.frequency);
  return when + 0.58;
}
export function specialWater(ctx, out, when, p = {}) { // Ice shard
  const b = open(ctx, out, 'specialWater', p), k = vf(p), o = vo(p);
  tn(ctx, b, when, 'sine', [3300 * k, 1400 * k], 0.003, 0.12, 0.22);
  bell(ctx, b, when, 2637 * k, 1.5, 1.1, 0.3, 0.32);
  bell(ctx, b, when + 0.05, 1976 * k, 1.5, 0.9, 0.28, 0.28);
  nz(ctx, b, when, 'highpass', [7200, 4000], 0.7, 0.005, 0.18, 0.24, o);
  return when + 0.36;
}
export function burstWater(ctx, out, when, p = {}) { // Healing tide: wave swell + soft triad
  const b = open(ctx, out, 'burstWater', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'lowpass', [300, 2300, 480], 0.7, 0.22, 0.35, 0.8, o);
  nz(ctx, b, when + 0.08, 'highpass', 3200, 0.7, 0.16, 0.22, 0.14, o + 0.4);
  tn(ctx, b, when, 'sine', 392 * k, 0.16, 0.4, 0.13);
  tn(ctx, b, when + 0.03, 'sine', 494 * k, 0.15, 0.39, 0.11);
  tn(ctx, b, when + 0.06, 'sine', 587 * k, 0.14, 0.38, 0.1);
  return when + 0.58;
}
export function specialEarth(ctx, out, when, p = {}) { // Boulder: crack, grind, heave
  const b = open(ctx, out, 'specialEarth', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', 1200 * k, 1, 0.001, 0.03, 0.6, o);
  nz(ctx, b, when, 'bandpass', [520 * k, 300 * k], 2, 0.04, 0.3, 0.45, o + 0.3);
  nz(ctx, b, when + 0.02, 'lowpass', 1100, 0.7, 0.03, 0.28, 0.5, o, crackleBuffer(ctx));
  tn(ctx, b, when, 'sine', [92 * k, 58 * k], 0.01, 0.3, 0.6);
  tn(ctx, b, when, 'triangle', [220 * k, 140 * k], 0.002, 0.08, 0.38);
  weight(ctx, b, when + 0.03, 240 * k, 170 * k, 0.22, 0.32);                               // heave, audible on small speakers
  return when + 0.34;
}
export function burstEarth(ctx, out, when, p = {}) { // Seismic slam
  const b = open(ctx, out, 'burstEarth', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'highpass', 1500, 0.7, 0.001, 0.04, 0.55, o);
  tn(ctx, b, when + 0.002, 'triangle', [185 * k, 60 * k], 0.002, 0.18, 0.48);
  tn(ctx, b, when + 0.005, 'sine', [72 * k, 28 * k], 0.004, 0.5, 0.95);
  weight(ctx, b, when + 0.014, 270 * k, 160 * k, 0.3, 0.4);
  nz(ctx, b, when + 0.003, 'lowpass', [640, 90], 0.7, 0.01, 0.5, 0.65, o + 0.3);
  nz(ctx, b, when + 0.06, 'bandpass', [1900, 900], 1, 0.04, 0.34, 0.5, o + 0.6, crackleBuffer(ctx));
  return when + 0.56;
}
export function specialFire(ctx, out, when, p = {}) { // Ember fan: fwoomp + crackle
  const b = open(ctx, out, 'specialFire', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', [600 * k, 2300 * k, 900 * k], 0.9, 0.06, 0.26, 0.72, o);
  nz(ctx, b, when, 'lowpass', [300, 950, 250], 0.7, 0.05, 0.25, 0.38, o + 0.4);
  nz(ctx, b, when + 0.02, 'highpass', 2500, 0.7, 0.02, 0.3, 0.42, o, crackleBuffer(ctx));
  tn(ctx, b, when, 'sine', [300 * k, 120 * k], 0.002, 0.05, 0.3);
  return when + 0.34;
}
export function burstFire(ctx, out, when, p = {}) { // Flare nova: blast + boom + crackle tail
  const b = open(ctx, out, 'burstFire', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'lowpass', [6000, 2600, 180], 0.5, 0.004, 0.5, 0.8, o);
  tn(ctx, b, when + 0.005, 'sine', [132 * k, 38 * k], 0.004, 0.4, 0.85);
  weight(ctx, b, when + 0.01, 280 * k, 160 * k, 0.24, 0.2);
  nz(ctx, b, when + 0.03, 'highpass', 1800, 0.7, 0.03, 0.45, 0.5, o + 0.2, crackleBuffer(ctx));
  return when + 0.55;
}

// ---------- status ----------
export function freeze(ctx, out, when, p = {}) { // ice forming: accelerating crackle + glassy ring
  const b = open(ctx, out, 'freeze', p), k = vf(p), o = vo(p);
  const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = crackleBuffer(ctx); s.loop = true;
  s.playbackRate.setValueAtTime(0.6, when); s.playbackRate.linearRampToValueAtTime(1.8, when + 0.32);
  hp.type = 'highpass'; hp.frequency.value = 3600; hp.Q.value = 0.7;
  env(g.gain, when, 0.06, 0.6, 0.32);
  s.connect(hp); hp.connect(g); g.connect(b);
  s.start(when, o * 0.8); s.stop(when + 0.4);
  hold(b, s);
  tn(ctx, b, when, 'sine', [2600 * k, 900 * k], 0.005, 0.25, 0.12);
  nz(ctx, b, when, 'highpass', 6200, 0.7, 0.1, 0.25, 0.2, o + 0.3);
  bell(ctx, b, when + 0.18, 2093 * k, 2.76, 0.9, 0.32, 0.22);
  return when + 0.5;
}
const SHARDS = [[0.004, 3520, 0.2], [0.02, 2794, 0.18], [0.05, 4186, 0.15], [0.09, 2349, 0.14], [0.14, 3951, 0.11], [0.2, 3136, 0.08]];
export function shatter(ctx, out, when, p = {}) { // frozen target broken by a hit
  const b = open(ctx, out, 'shatter', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'highpass', 2500, 0.7, 0.002, 0.11, 0.58, o);                     // glass burst
  for (let i = 0; i < SHARDS.length; i++) {
    const s = SHARDS[i];
    tn(ctx, b, when + s[0], 'sine', s[1] * k, 0.001, 0.14 + i * 0.012, s[2]);
  }
  nz(ctx, b, when + 0.003, 'bandpass', 3000, 0.9, 0.006, 0.2, 0.46, o + 0.4, crackleBuffer(ctx));
  tn(ctx, b, when + 0.006, 'sine', [180, 90], 0.003, 0.06, 0.3);                      // crunch
  return when + 0.42;
}
export function burn(ctx, out, when, p = {}) { // burn damage tick (fires every 0.45 s)
  const b = open(ctx, out, 'burn', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'highpass', [3000, 5200], 0.7, 0.02, 0.2, 0.36, o);
  nz(ctx, b, when, 'bandpass', 2400, 0.8, 0.01, 0.22, 0.5, o + 0.2, crackleBuffer(ctx));
  tn(ctx, b, when, 'sine', [520 * k, 220 * k], 0.004, 0.05, 0.2);
  return when + 0.24;
}

// ---------- ceremony ----------
// An enemy that is not the last of its wave goes down: a solid hit and a deflating sigh, no bell.
export function enemyDown(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'enemyDown', p), k = vf(p) * (EL_PITCH[p.element] || 1), o = vo(p);
  nz(ctx, b, when, 'highpass', 2400, 0.7, 0.0008, 0.018, 0.4, o);
  nz(ctx, b, when + 0.002, 'bandpass', [1300 * k, 420 * k], 0.8, 0.002, 0.09, 0.5, o + 0.2);
  tn(ctx, b, when + 0.006, 'sine', [115 * k, 42 * k], 0.003, 0.2, 0.8);
  weight(ctx, b, when + 0.012, 270 * k, 160 * k, 0.15, 0.34);
  tn(ctx, b, when + 0.05, 'triangle', [360 * k, 120 * k], 0.03, 0.24, 0.12);         // falling sigh
  nz(ctx, b, when + 0.06, 'bandpass', [1100, 260], 1, 0.04, 0.26, 0.24, o + 0.5);   // air leaving
  return when + 0.36;
}
// Final blow (player loses a life, boss dies, last kill of a wave): heavy hit + temple bowl + sigh.
export function ko(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'ko', p), k = vf(p), o = vo(p);
  heavyBody(ctx, b, when, k, 1.1, o, 0.82);
  bell(ctx, b, when + 0.045, 196 * k, 1.41, 2, 0.54, 0.48);                      // the bowl rings after the blow
  tn(ctx, b, when + 0.04, 'triangle', [440 * k, 110 * k], 0.02, 0.45, 0.24);
  nz(ctx, b, when + 0.05, 'bandpass', [1400, 300], 1, 0.05, 0.45, 0.38, o + 0.4);
  return when + 0.59;
}
// Wave start: a small opera gong whose pitch rises after the strike ("tang~").
export function waveGong(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'waveGong', p), k = vf(p), o = vo(p);
  nz(ctx, b, when, 'bandpass', 2600, 1, 0.001, 0.025, 0.5, o);
  bell(ctx, b, when, 520 * k, 1.48, 3, 0.58, 0.6, 1.13, 0.0015);
  tn(ctx, b, when, 'sine', [784 * k, 900 * k], 0.002, 0.45, 0.2);
  tn(ctx, b, when, 'sine', [1310 * k, 1490 * k], 0.002, 0.3, 0.1);
  return when + 0.6;
}
// Boss warning: two tanggu (barrel drum) strikes over a low swell.
export function bossDrum(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'bossDrum', p), k = vf(p), o = vo(p);
  tn(ctx, b, when, 'sine', 41.2, 0.2, 0.36, 0.32);
  for (let i = 0; i < 2; i++) {
    const t = when + i * 0.24, v = i ? 1.08 : 1;
    nz(ctx, b, t, 'lowpass', 1300, 0.7, 0.001, 0.04 + i * 0.005, 0.38 * v, o + i * 0.4);
    tn(ctx, b, t + 0.002, 'triangle', [200 * k, 95 * k], 0.001, 0.08, 0.3 * v);
    tn(ctx, b, t + 0.005, 'sine', [(118 - 6 * i) * k, (52 - 5 * i) * k], 0.003, 0.24 + i * 0.08, 0.66 * v, 0.01);
    weight(ctx, b, t + 0.022, 260 * k, 165 * k, 0.2, 0.4 * v);
  }
  return when + 0.58;
}

// ---------- menu (D major pentatonic plucks) ----------
const MENU = [587.3, 659.3, 740, 880, 987.8, 1174.7];
export function menuMove(ctx, out, when, p = {}) { // params.step picks the note (cursor index)
  const b = open(ctx, out, 'menuMove', p);
  const i = ((p.step ?? 2) % MENU.length + MENU.length) % MENU.length;
  const f = MENU[i], level = Math.pow(10, -(i - 2) * 0.014); // equal loudness up the scale
  pluck(ctx, b, when, f, 0.12, 0.5 * level, 5);
  tn(ctx, b, when, 'sine', f * 2, 0.001, 0.05, 0.08 * level);
  return when + 0.13;
}
export function menuOk(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'menuOk', p);
  pluck(ctx, b, when, 880, 0.18, 0.45, 6);
  pluck(ctx, b, when + 0.07, 1174.7, 0.24, 0.5, 6, 0.02);
  tn(ctx, b, when, 'sine', [1300, 1220], 0.0008, 0.05, 0.25); // woodblock tick
  return when + 0.32;
}
export function menuCancel(ctx, out, when, p = {}) {
  const b = open(ctx, out, 'menuCancel', p);
  pluck(ctx, b, when, 659.3, 0.14, 0.45, 3);
  pluck(ctx, b, when + 0.07, 440, 0.18, 0.5, 2.5);
  return when + 0.26;
}
export function menuJoin(ctx, out, when, p = {}) { // a player joins: arpeggio + finger cymbal
  const b = open(ctx, out, 'menuJoin', p);
  tn(ctx, b, when, 'sine', [1300, 1220], 0.0008, 0.05, 0.22);
  pluck(ctx, b, when, 587.3, 0.2, 0.4, 6);
  pluck(ctx, b, when + 0.05, 740, 0.2, 0.4, 6);
  pluck(ctx, b, when + 0.1, 880, 0.22, 0.42, 6);
  pluck(ctx, b, when + 0.15, 1174.7, 0.28, 0.45, 6, 0.02);
  bell(ctx, b, when + 0.15, 2637, 2.41, 0.5, 0.3, 0.12);
  return when + 0.46;
}

export const SFX = {
  punchLight, punchHeavy, kick, whoosh, block, parry, grab, throw: throwSfx, land, jump, dash,
  pickupWeapon, weaponBreak, drink, eat, smash, energyPickup,
  specialAir, burstAir, specialWater, burstWater, specialEarth, burstEarth, specialFire, burstFire,
  freeze, shatter, burn, enemyDown, ko, waveGong, bossDrum, menuMove, menuOk, menuCancel, menuJoin,
};
export const ELEMENT_SFX = {
  air: { special: specialAir, burst: burstAir }, water: { special: specialWater, burst: burstWater },
  earth: { special: specialEarth, burst: burstEarth }, fire: { special: specialFire, burst: burstFire },
};

// ---------- mixer: the single route to the speakers ----------
// sfx + music (each with its own volume and reverb send) -> master volume -> limiter -> 0.9 ceiling.
// Volumes sit BEFORE the limiter, so no volume setting can push a sample past the ceiling.
export const MIX = { volume: 0.6, sfx: 1, music: 0.85, wet: 0.55, minGap: 0.035, softCap: 24, hardCap: 32 };
// DynamicsCompressorNode applies an automatic makeup gain of (1/curve(1.0))^0.6. `makeup` is that
// gain at these settings (measured in audio.html); the mixer divides it back out, so the limiter is
// exactly unity below its threshold.
export const LIMITER = { threshold: -6, knee: 6, ratio: 12, attack: 0.002, release: 0.15, makeup: 1.2784 };
export function createMixer(ctx, destination = ctx.destination, opts = {}) {
  const o = { ...MIX, ...opts }, gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const sfx = gain(o.sfx), sfxSend = gain(o.sfx), music = gain(o.music), musicSend = gain(o.music);
  const volume = gain(o.volume), wet = gain(o.wet), trim = gain(1 / (LIMITER.makeup * CLIP.master.ceiling * CLIP.master.range));
  const reverb = ctx.createConvolver(), comp = ctx.createDynamicsCompressor(), ceiling = shaper(ctx, MASTER_CURVE);
  reverb.normalize = false; reverb.buffer = roomImpulse(ctx);
  for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) comp[key].value = LIMITER[key];
  sfx.connect(volume); music.connect(volume);
  sfxSend.connect(reverb); musicSend.connect(reverb); reverb.connect(wet); wet.connect(volume);
  volume.connect(comp); comp.connect(trim); trim.connect(ceiling); ceiling.connect(destination);
  const ramp = (param, v, at) => { param.cancelScheduledValues(at); param.setTargetAtTime(v, at, 0.03); };
  // Rate limit (one instance per name per minGap; a sound's parts, params.part, count apart) and
  // voice cap. `when` must not go backwards.
  const last = Object.create(null), ends = new Float64Array(o.hardCap), stats = { played: 0, limited: 0, capped: 0 };
  let live = 0;
  function play(name, when = ctx.currentTime, params = {}) {
    const fn = SFX[name];
    if (!fn) return 0;
    const id = params.part ? `${name}.${params.part}` : name;
    if (Math.abs(when - (last[id] ?? -1e9)) < o.minGap) { stats.limited++; return 0; }
    let n = 0;
    for (let i = 0; i < live; i++) if (ends[i] > when) ends[n++] = ends[i];
    live = n;
    if (live >= o.hardCap || (live >= o.softCap && (SFX_PRIORITY[name] ?? 2) < 2)) { stats.capped++; return 0; }
    last[id] = when;
    const end = fn(ctx, sfx, when, params.send === undefined ? { ...params, send: sfxSend } : params);
    ends[live++] = end;
    stats.played++;
    return end;
  }
  return {
    sfx, sfxSend, music, musicSend, volume, compressor: comp, output: ceiling, play, stats,
    voices(at = ctx.currentTime) { let n = 0; for (let i = 0; i < live; i++) if (ends[i] > at) n++; return n; },
    // kind: 'master' | 'sfx' | 'music'; the send follows its channel so muted SFX leave no reverb behind
    setVolume(kind, v, at = ctx.currentTime) {
      v = clamp(v, 0, 1);
      if (kind === 'master') ramp(volume.gain, v, at);
      else if (kind === 'sfx') { ramp(sfx.gain, v, at); ramp(sfxSend.gain, v, at); }
      else if (kind === 'music') { ramp(music.gain, v, at); ramp(musicSend.gain, v, at); }
    },
  };
}

// ---------- music ----------
// Patterns: 16 steps per bar. Digits/letters = scale degree (base36, 5 per octave), '-' holds the
// previous note (also across bar lines), '.' rests. Drums: X strong, x medium, o ghost.
const INST = {
  zheng(ctx, b, t, f, dur, vel, e, loop) {
    const long = dur > 0.55;
    if (long && loop % 2 === 1) pluck(ctx, b, t - 0.045, f * (e.next || 1.122), 0.12, vel * 0.35, 6); // grace note on repeats
    const len = Math.min(1.7, dur + 0.55), o = pluck(ctx, b, t, f, len, vel, 6.5, long ? 0.012 : 0);
    if (long) {
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.frequency.value = 5.2;
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(0, t + 0.25); vg.gain.linearRampToValueAtTime(f * 0.009, t + 0.6);
      v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + len);
    }
  },
  zhengLow(ctx, b, t, f, dur, vel) { // low zheng strings shadowing the melody (heterophony)
    pluck(ctx, b, t, f, Math.min(1.4, dur + 0.4), vel, 3.4, 0.008);
    tn(ctx, b, t, 'sine', f, 0.004, Math.min(1, dur + 0.2), vel * 0.55);
  },
  bassDrive(ctx, b, t, f, dur, vel) {
    pluck(ctx, b, t, f, 0.2, vel, 4.5);
    tn(ctx, b, t, 'triangle', f, 0.003, 0.16, vel * 0.55);
  },
  dizi(ctx, b, t, f, dur, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain(), end = t + dur;
    o.type = 'triangle'; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(FLOOR, t); g.gain.linearRampToValueAtTime(vel, t + 0.08);
    g.gain.linearRampToValueAtTime(vel * 0.78, end); g.gain.exponentialRampToValueAtTime(FLOOR, end + 0.28);
    o.connect(g); g.connect(b); o.start(t); o.stop(end + 0.3);
    const v = ctx.createOscillator(), vg = ctx.createGain();
    v.frequency.value = 5.1;
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(0, t + 0.3); vg.gain.linearRampToValueAtTime(f * 0.01, t + 0.8);
    v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(end + 0.3);
    nz(ctx, b, t, 'bandpass', f * 2, 1.5, 0.01, 0.07, vel * 0.25, t * 3.7);                // chiff
    nz(ctx, b, t, 'bandpass', f * 1.5, 3, 0.1, dur + 0.15, vel * 0.08, t * 1.3);            // breath
  },
  erhu(ctx, b, t, f, dur, vel) {
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + dur;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.944, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    bp.type = 'bandpass'; bp.frequency.value = Math.min(f * 2.2, 5000); bp.Q.value = 0.8;
    lp.type = 'lowpass'; lp.frequency.value = 3400;
    g.gain.setValueAtTime(FLOOR, t); g.gain.linearRampToValueAtTime(vel, t + 0.06);
    g.gain.linearRampToValueAtTime(vel * 0.72, end); g.gain.exponentialRampToValueAtTime(FLOOR, end + 0.12);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(b);
    o.start(t); o.stop(end + 0.14);
    if (dur > 0.25) {
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.frequency.value = 6.2;
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(0, t + 0.12); vg.gain.linearRampToValueAtTime(f * 0.013, t + 0.42);
      v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(end + 0.14);
    }
  },
  drone(ctx, b, t, f, dur, vel) { // root + fifth, slow swell
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), end = t + dur, v = i ? vel * 0.55 : vel;
      o.frequency.value = i ? f * 1.498 : f;
      g.gain.setValueAtTime(FLOOR, t); g.gain.linearRampToValueAtTime(v, t + 0.5);
      g.gain.setValueAtTime(v, end - 0.1); g.gain.exponentialRampToValueAtTime(FLOOR, end + 0.5);
      o.connect(g); g.connect(b); o.start(t); o.stop(end + 0.52);
    }
  },
  sheng(ctx, b, t, f, dur, vel) { // mouth-organ pedal: reedy root, fifth and octave under a soft low-pass
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + dur;
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0;
    g.gain.setValueAtTime(FLOOR, t); g.gain.linearRampToValueAtTime(vel, t + 0.8);
    g.gain.setValueAtTime(vel, Math.max(t + 0.8, end - 0.2)); g.gain.exponentialRampToValueAtTime(FLOOR, end + 0.9);
    lp.connect(g); g.connect(b);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = i < 2 ? 'triangle' : 'sine';
      o.frequency.value = f * (i === 0 ? 1 : i === 1 ? 1.498 : 2.003);
      og.gain.value = i === 0 ? 1 : i === 1 ? 0.6 : 0.35;
      o.connect(og); og.connect(lp); o.start(t); o.stop(end + 0.95);
    }
  },
  tanggu(ctx, b, t, f, dur, vel) { // barrel drum: deep skin, pitch drop, a little ring
    tn(ctx, b, t, 'sine', [105, 46], 0.002, 0.42, vel);
    tn(ctx, b, t, 'sine', [210, 96], 0.003, 0.2, vel * 0.22);
    tn(ctx, b, t, 'triangle', [180, 90], 0.001, 0.12, vel * 0.3);
    nz(ctx, b, t, 'lowpass', 1400, 0.7, 0.001, 0.035, vel * 0.4, t * 13.37);
  },
  bangu(ctx, b, t, f, dur, vel) { // clapper drum: very high, very dry "da"
    nz(ctx, b, t, 'bandpass', 3400, 5, 0.0005, 0.035, vel, t * 7.1);
    tn(ctx, b, t, 'triangle', [1500, 1200], 0.0008, 0.03, vel * 0.45);
  },
  naobo(ctx, b, t, f, dur, vel) { // cymbal pair: a trashy "chah" with clangy partials
    nz(ctx, b, t, 'highpass', 2800, 0.7, 0.001, 0.5, vel, t * 4.1);
    nz(ctx, b, t, 'bandpass', [5200, 3800], 1.2, 0.001, 0.32, vel * 0.7, t * 6.7);
    bell(ctx, b, t, 523, 1.53, 5, 0.45, vel * 0.25);
  },
  woodblock(ctx, b, t, f, dur, vel) {
    tn(ctx, b, t, 'sine', [1300, 1220], 0.0008, 0.06, vel);
    tn(ctx, b, t, 'triangle', [2600, 2500], 0.0008, 0.02, vel * 0.22);
    nz(ctx, b, t, 'bandpass', 2600, 8, 0.0005, 0.012, vel * 0.45, t * 5.3);
  },
  handdrum(ctx, b, t, f, dur, vel) {
    tn(ctx, b, t, 'sine', [190, 125], 0.002, 0.2, vel);
    nz(ctx, b, t, 'lowpass', 900, 0.7, 0.001, 0.025, vel * 0.4, t * 9.1);
  },
  gong(ctx, b, t, f, dur, vel) {
    bell(ctx, b, t, 196, 1.47, 2.2, 2.4, vel, 0.985);
    bell(ctx, b, t, 311, 1.41, 1.2, 1.8, vel * 0.4);
    nz(ctx, b, t, 'bandpass', [1200, 2600, 900], 0.6, 0.02, 1.2, vel * 0.3, t * 2.9);
  },
  ting(ctx, b, t, f, dur, vel) {
    bell(ctx, b, t, 2637, 2.41, 0.5, 1.6, vel);
    bell(ctx, b, t, 3951, 1.5, 0.3, 1, vel * 0.35);
  },
};

const G = 'X...............', R16 = '................', TIE = '----------------';
export const SONGS = {
  calm: {
    name: 'Paper Lantern Courtyard', bpm: 86, bars: 16, scale: [0, 2, 4, 7, 9], // G gong mode
    sections: [['A', 0], ['B', 8]],
    tracks: [
      { inst: 'zheng', base: 392, vel: 0.36, pan: -0.2, bars: [
        '3-----4.3.2.1---', '2---3.2.1.0-----', '1.2.3---4.5.4.3.', '2---1-----012345',
        '5-----4.5.6.5.4.', '3---4.3.2---1---', '2.3.4---3.2.1.2.', '0-----------1.2.',
        '7-------6-5-6---', '5---4---3-------', '4-5-6---7---6-5-', '4---------------',
        '3---4---5---6---', '7-----8-7-6-5---', '6---5-4-3---2---', '1-----2-1-0-----'] },
      { inst: 'zhengLow', base: 98, vel: 0.3, pan: 0.15, bars: [
        '3-------2---1---', '2-------1-0-----', '1---3---4---3---', '2---1-------0---',
        '5-------5---4---', '3---4---2---1---', '2---4---3---1---', '0---------------',
        '7-------6-------', '5-------3-------', '4-------7---5---', '4---------------',
        '3-------5-------', '7-------7---5---', '6-------3---2---', '1-------0-------'] },
      { inst: 'sheng', base: 98, vel: 0.05, pan: 0, bars: [
        '0---------------', TIE, TIE, TIE, TIE, TIE, TIE, TIE,
        '0---------------', TIE, TIE, TIE, '3---------------', TIE, '0---------------', '------------....'] },
      { inst: 'dizi', base: 392, vel: 0.2, pan: 0.3, bars: [R16, R16, R16, R16,
        '2-------3-------', '1---------------', '3-------2-------', '0-----------....',
        R16, R16, R16, R16, '5---------------', '7-------5-------', '6-------3-------', '1-------0---....'] },
      { inst: 'handdrum', vel: 0.32, pan: -0.1, bars: [
        'X.........x.....', 'X.........x.....', 'X.........x.....', 'X.........x.x.x.',
        'X.........x.....', 'X.........x.....', 'X.........x.....', 'X.........x.x.x.',
        'X...............', '..........x.....', 'X.......x.......', 'X...............',
        'X.........x.....', 'X.........x.....', 'X.......x.x.....', 'X.....x...x.x.x.'] },
      { inst: 'woodblock', vel: 0.16, pan: 0.35, bars: [
        '....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.xo',
        '....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.xo',
        '........x.......', '........x.......', '........x.......', '........x...x.xo',
        '....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.xo'] },
      { inst: 'ting', vel: 0.1, pan: 0.2, bars: [G, R16, R16, R16, R16, R16, R16, R16, G, R16, R16, R16, 'x...............', R16, R16, R16] },
    ],
  },
  boss: {
    name: 'Ink Storm', bpm: 132, bars: 8, scale: [0, 3, 5, 7, 10], // E yu mode
    sections: [['A', 0], ['B', 4]],
    tracks: [
      { inst: 'erhu', base: 329.63, vel: 0.24, pan: 0.1, bars: [R16, '5-------4---3---', '5---6-5-4-3-----', '3-------2---1---',
        '0---1-2-3---4---', '5---6---7-------', '8---7-6-5---4---', '5-----------....'] },
      { inst: 'bassDrive', base: 82.41, vel: 0.36, pan: 0, bars: ['0.0.5.0.0.4.0.3.', '0.0.5.0.0.4.0.3.', '0.0.5.0.0.4.0.3.', '0.0.5.0.0.4.0.3.',
        '2.2.7.2.2.6.2.5.', '2.2.7.2.2.6.2.5.', '4.4.9.4.4.8.4.7.', '3.3.8.3.3.7.3.6.'] },
      { inst: 'drone', base: 82.41, vel: 0.07, pan: 0, bars: ['0---------------', TIE, TIE, TIE, '2---------------', TIE, '4---------------', '3-----------....'] },
      { inst: 'tanggu', vel: 0.5, pan: -0.05, bars: ['X.....x.X...x...', 'X.....x.X...x...', 'X.....x.X...x...', 'X.....x.X.x.x.x.',
        'X.....x.X...x...', 'X.....x.X...x...', 'X.....x.X...x...', 'X..xX..xX.xxXxXx'] },
      { inst: 'bangu', vel: 0.14, pan: -0.35, bars: ['..x...x...x...x.', '..x...x...x.o.x.'] },
      { inst: 'gong', vel: 0.16, pan: -0.2, bars: [G, R16, R16, R16] },
      { inst: 'naobo', vel: 0.12, pan: 0.3, bars: [G, R16, R16, R16, 'x...............', R16, R16, '........x...X...'] },
    ],
  },
};

const COMPILED = new WeakMap();
function degHz(base, deg, scale) {
  const o = Math.floor(deg / scale.length), i = deg - o * scale.length;
  return base * Math.pow(2, o + scale[i] / 12);
}
// Flattens a song into one event list per step (built once per song). Ties run across bar lines.
function compile(song) {
  let c = COMPILED.get(song);
  if (c) return c;
  const n = song.bars * 16, steps = [], notes = [];
  for (let i = 0; i < n; i++) steps.push([]);
  song.tracks.forEach((tr, ti) => {
    let pat = '';
    for (let bar = 0; bar < song.bars; bar++) pat += tr.bars[bar % tr.bars.length];
    for (let i = 0; i < n; i++) {
      const ch = pat[i];
      if (ch === '.' || ch === '-' || ch === undefined) continue;
      let len = 1;
      while (i + len < n && pat[i + len] === '-') len++;
      let deg = 0, vel = tr.vel;
      if (ch === 'x') vel *= 0.6; else if (ch === 'o') vel *= 0.35; else if (ch !== 'X') deg = parseInt(ch, 36);
      const f = tr.base ? degHz(tr.base, deg, song.scale) : 0;
      const ev = { inst: INST[tr.inst], ti, step: i, len, deg, vel, f, next: tr.base ? degHz(tr.base, deg + 1, song.scale) / f : 1 };
      steps[i].push(ev);
      notes.push(ev);
    }
  });
  c = { steps, notes };
  COMPILED.set(song, c);
  return c;
}
// Every note of a song as {ti, step, len, deg, vel, f}: for score views and tests.
export function songNotes(song) { return compile(song).notes; }
export function songDuration(song) { return (60 / song.bpm / 4) * song.bars * 16; }
function playStep(ctx, session, steps, index, t, stepDur) {
  const n = steps.length, loop = Math.floor(index / n), ev = steps[index % n];
  // Deterministic humanising: a few ms of push/drag per step, never on the downbeat.
  const jitter = index % 4 === 0 ? 0 : (((index * 7919) % 13) - 6) * 0.0006;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    e.inst(ctx, session.tracks[e.ti], t + jitter, e.f, e.len * stepDur, e.vel, e, loop);
  }
}

// Look-ahead scheduler. Call update() every animation frame; it schedules ~0.2 s ahead.
// Every start() opens a fresh session gain (with one panner per track) and stop() fades only that
// session, so tails and look-ahead notes from a stopped session can never come back on a restart.
// stop() remembers the beat it stopped on and start() resumes there; start({from: 0}) rewinds.
export function createMusicPlayer(ctx, destination, song, opts = {}) {
  const { steps } = compile(song), n = steps.length, stepDur = 60 / song.bpm / 4, ahead = opts.lookahead ?? 0.2;
  const panOk = !!ctx.createStereoPanner;
  const input = ctx.createGain(), clip = shaper(ctx, MUSIC_CURVE);
  input.gain.value = dbToGain(MUSIC_LEVELS[opts.key] || 0) * (opts.gain ?? 1) * (panOk ? PAN_COMP : 1) / (CLIP.music.ceiling * CLIP.music.range);
  input.connect(clip); clip.connect(destination);
  if (opts.send) { const s = ctx.createGain(); s.gain.value = opts.sendLevel ?? 0.32; clip.connect(s); s.connect(opts.send); }
  let session = null, origin = 0, next = 0, pos = 0, playing = false;
  const retired = [];
  function openSession(at, fade) {
    const g = ctx.createGain(), tracks = [];
    // value 0 until the ramp, so a grace note or jittered step a few ms before `at` stays silent
    if (fade > 0) { g.gain.value = 0; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + fade); } else g.gain.value = 1;
    g.connect(input);
    for (const tr of song.tracks) {
      if (!panOk) { tracks.push(g); continue; }
      const p = ctx.createStereoPanner();
      p.pan.value = tr.pan || 0;
      p.connect(g);
      tracks.push(p);
    }
    return { g, tracks, t0: at, t1: at + Math.max(fade, 0), end: Infinity };
  }
  function sweep(now) { // a faded session is disconnected once its fade is over
    for (let i = retired.length - 1; i >= 0; i--) {
      const r = retired[i];
      if (r.end > now) continue;
      r.g.disconnect();
      for (const p of r.tracks) if (p !== r.g) p.disconnect();
      retired.splice(i, 1);
    }
  }
  const player = {
    stepDur, loopDuration: stepDur * n, input,
    get playing() { return playing; },
    get position() { return pos; }, // step a resume starts from
    get sessions() { return retired.length + (session ? 1 : 0); },
    start(at = ctx.currentTime + 0.05, o = {}) {
      if (playing) return player;
      if (o.from !== undefined) pos = Math.max(0, Math.round(o.from * 16));
      session = openSession(at, o.fade ?? 0.02);
      origin = at - pos * stepDur; next = pos; playing = true;
      if (!o.manual) player.update(at);
      return player;
    },
    update(now = ctx.currentTime) {
      if (retired.length) sweep(now);
      if (!playing) return;
      if (origin + next * stepDur < now - 0.1) next = Math.ceil((now - origin) / stepDur); // tab was asleep
      player.schedule(now + ahead);
    },
    schedule(until) {
      while (playing && origin + next * stepDur < until) { playStep(ctx, session, steps, next, origin + next * stepDur, stepDur); next++; }
    },
    stop(at = ctx.currentTime, fade = 0.5) {
      if (!playing) return player;
      playing = false;
      const s = session, g = s.g.gain, v = at >= s.t1 ? 1 : clamp((at - s.t0) / (s.t1 - s.t0), 0, 1);
      fade = Math.max(0.005, fade);
      g.cancelScheduledValues(at); g.setValueAtTime(v, at); g.linearRampToValueAtTime(0, at + fade);
      s.end = at + fade + 0.05;
      retired.push(s);
      session = null;
      pos = Math.max(0, Math.floor((at - origin) / stepDur / 4) * 4); // the beat that was playing
      return player;
    },
    rewind() { pos = 0; return player; },
  };
  return player;
}
// Swap songs: fade one out while the other fades in (either may be null).
export function crossfade(from, to, at, dur = 1, o = {}) {
  if (from) from.stop(at, dur);
  return to ? to.start(at, { fade: dur, ...o }) : null;
}
// Offline helper: schedule `loops` full passes of a song from bar 1 at `when` (for rendering/tests).
export function renderSong(ctx, destination, song, when = 0, loops = 1, key, opts = {}) {
  const p = createMusicPlayer(ctx, destination, song, { ...opts, key });
  p.start(when, { from: 0, fade: 0, manual: true });
  p.schedule(when + p.loopDuration * loops - 1e-6);
  return when + p.loopDuration * loops;
}

// === ASSETS END ===
