// Game-side sound: the bridge between the engine's cues and the src/audio.js bank.
// The engine only records data (state.impacts and state.sounds, each with a growing id); this
// module reads both by id cursor every animation frame, maps them to bank sounds panned by arena
// x, and steers the two music loops (calm during stage waves, boss while a guardian fights and
// throughout a tournament). Nothing is created, scheduled or played while sound is off: no
// AudioContext exists until unlock() runs with sound on, from a user gesture.
import { createMixer, createMusicPlayer, crossfade, SONGS, MIX } from './audio.js';

const clampVolume = v => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

// Sounds start a hair after "now", so every envelope begins on its own first sample.
const LEAD = .01;
// A context that unlock() has just created or resumed may still report 'suspended' until its
// audio device starts (the spec's behaviour, and Firefox's and Safari's). For this long (wall
// clock) it still takes sounds: they wait on its stopped clock and play as it starts. A context
// that stays suspended longer drops cues instead of piling them up.
export const START_GRACE = .3;
// Sound off: once the master has faded, the music fade (.35 s) and the 1.1 s courtyard reverb
// tail are over (audio clock), the context is suspended so the audio thread idles.
export const SUSPEND_AFTER = 1.5;
export const MUSIC_FADES = { pause: .35, end: 1.2, toBoss: 1.2, toCalm: 1.5, start: .02 };
// Engine impacts carry strength 0..1; the bank reads 0..1.5. Below .6 a hit would sound limp.
const STRENGTH = [.6, 1.5];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// One engine impact (state.impacts) -> the bank sound and params that voice it.
export function impactCue(impact) {
  const strength = clamp(Number.isFinite(impact.strength) ? impact.strength : 1, STRENGTH[0], STRENGTH[1]);
  if (impact.kind === 'parry') return { name: 'parry', params: {} };
  if (impact.kind === 'block') return { name: 'block', params: { strength } };
  if (impact.kind === 'land') return { name: 'land', params: { heavy: !!impact.heavy, strength } };
  const name = impact.kick ? 'kick' : impact.heavy ? 'punchHeavy' : 'punchLight';
  return { name, params: { element: impact.element, strength } };
}

// The bank voices three weapon families (src/audio.js): the staff and spear swing long and clack,
// the crate swings heavy, thonks and splinters low; any other kind sounds like a fist swing and a
// wooden clack. The newer weapons borrow the nearest family: the guandao swings heavy, the frost
// jian long, and a mill stone lands in the hand and breaks like the crate.
export const WEAPON_VOICES = {
  whoosh: { guandao: 'crate', jian: 'spear' },
  item: { millstone: 'crate' },
};
export function cueParams(name, params = {}) {
  const swing = name === 'whoosh' && WEAPON_VOICES.whoosh[params.weapon];
  if (swing) return { ...params, weapon: swing };
  const item = (name === 'pickupWeapon' || name === 'weaponBreak') && WEAPON_VOICES.item[params.kind];
  return item ? { ...params, kind: item } : params;
}

// The loop a game state wants: none outside a running fight, the boss loop while a guardian is
// standing (and for a whole tournament), otherwise the calm loop.
export function songFor(state) {
  if (!state || state.status !== 'playing') return null;
  if (state.settings?.mode === 'tournament') return 'boss';
  return (state.enemies || []).some(e => e.type === 'boss' && !e.dead && e.hp > 0) ? 'boss' : 'calm';
}

// Arena x (0..1280) -> the bank's -1..1 pan (the bank narrows it to +-0.6 itself).
export const panFor = x => (Number.isFinite(x) ? x / 640 - 1 : 0);

const defaultContext = () => {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  return AudioContext ? new AudioContext() : null;
};
const wallClock = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()) / 1000;

export class GameAudio {
  constructor({ createContext = defaultContext, random = Math.random, now = wallClock, enabled = false, music = true, volume = 1 } = {}) {
    this.createContext = createContext;
    this.random = random;
    this.now = now;        // wall clock in seconds, for the start-up grace window
    this.startUntil = -Infinity;
    this.suspendAt = null; // audio-clock time a Sound-off context goes idle
    this.suspending = false;
    this.enabled = !!enabled;
    this.musicOn = !!music;
    this.volume = clampVolume(volume); // the player's volume slider, 0..1, scaling MIX.volume
    this.ctx = null;
    this.mix = null;
    this.players = null;
    this.song = null;      // the loop currently playing (or fading in)
    this.state = null;     // the game state whose cues the cursors follow
    this.musicState = null;
    this.rewind = true;    // the next loop to start begins at bar 1 (a fresh run)
    this.impactCursor = 0;
    this.soundCursor = 0;
    this.played = 0;
  }

  // True while sounds can be scheduled: sound on, context created and running, or still starting
  // up after unlock() (the sound then plays as the clock starts).
  get live() {
    if (!this.enabled || !this.mix) return false;
    const state = this.ctx.state;
    return state === 'running' || (state === 'suspended' && this.now() < this.startUntil);
  }

  // Resumes a suspended context (from a user gesture) and opens the start-up grace window.
  wake() {
    this.suspendAt = null;
    // A suspend() still in flight reports 'running' until it settles; resume() queues after it.
    if (this.ctx.state !== 'suspended' && !this.suspending) return;
    this.startUntil = this.now() + START_GRACE;
    this.ctx.resume()?.catch?.(() => {});
  }

  // Call from a user gesture. Creates the context and mixer once (only with sound on), resumes it.
  unlock() {
    if (!this.enabled) return false;
    try {
      if (!this.ctx) {
        const ctx = this.createContext();
        if (!ctx) return false;
        this.ctx = ctx;
        this.mix = createMixer(ctx);
        const make = key => createMusicPlayer(ctx, this.mix.music, SONGS[key], { key, send: this.mix.musicSend });
        this.players = { calm: make('calm'), boss: make('boss') };
        if (!this.musicOn) this.mix.setVolume('music', 0);
        if (this.volume !== 1) this.mix.setVolume('master', MIX.volume * this.volume);
      }
      this.wake();
    } catch {
      // Audio is optional, including on browsers without Web Audio support.
      return false;
    }
    return true;
  }

  // The Sound preference. Off silences the master at once and fades the music, then suspends the
  // context (see SUSPEND_AFTER); no cue is played (or built) until it is on again. On resumes it,
  // which works because the toggle is a click.
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.mix) return;
    this.mix.setVolume('master', this.enabled ? MIX.volume * this.volume : 0);
    if (this.enabled) this.wake();
    else this.suspendAt = this.ctx.currentTime + SUSPEND_AFTER;
    this.steerMusic();
  }

  // The volume slider (0..1): scales the master; Sound off still silences it.
  setVolume(v) {
    this.volume = clampVolume(v);
    if (this.mix && this.enabled) this.mix.setVolume('master', MIX.volume * this.volume);
  }

  // The Music preference: the loops fade out (or back in at the beat they left) independently of SFX.
  setMusic(on) {
    this.musicOn = !!on;
    if (!this.mix) return;
    this.mix.setVolume('music', this.musicOn ? MIX.music : 0);
    this.steerMusic();
  }

  // A menu sound (menuMove {step}, menuOk, menuCancel, menuJoin). Unlocks on the way, since every
  // menu sound comes from a click or key press.
  ui(name, params = {}) {
    if (!this.enabled) return 0;
    this.unlock();
    return this.play(name, params);
  }

  play(name, params = {}, x = 640, delay = 0) {
    if (!this.live) return 0;
    const end = this.mix.play(name, this.ctx.currentTime + LEAD + delay, { vary: this.random(), pan: panFor(x), ...params });
    if (end) this.played++;
    return end;
  }

  // Every animation frame: plays the cues recorded since the last call, then steers the music.
  update(state) {
    if (state !== this.state) {
      // A new game object (preview, retry, back to menu): its cues start from id 1.
      this.state = state;
      this.impactCursor = 0;
      this.soundCursor = 0;
    }
    if (!state) return;
    const audible = this.live && state.status !== 'ready';
    for (const impact of state.impacts || []) {
      if (!(impact.id > this.impactCursor)) continue;
      this.impactCursor = impact.id;
      if (!audible) continue;
      const cue = impactCue(impact);
      // delay: a blow landing in the same tick as another (the second of a thrown knife pair)
      // sounds a beat later, past the mixer's per-sound rate limit.
      this.play(cue.name, cue.params, impact.x, impact.delay || 0);
    }
    for (const cue of state.sounds || []) {
      if (!(cue.id > this.soundCursor)) continue;
      this.soundCursor = cue.id;
      if (audible) this.play(cue.name, cueParams(cue.name, cue.params), cue.x);
    }
    this.steerMusic(state);
  }

  steerMusic(state = this.state) {
    if (!this.players) return;
    const t = this.ctx.currentTime;
    if (this.suspendAt != null && !this.enabled && t >= this.suspendAt && this.ctx.state === 'running') {
      this.suspendAt = null;
      this.suspending = true;
      const settle = () => { this.suspending = false; };
      try { Promise.resolve(this.ctx.suspend()).then(settle, settle); } catch { settle(); }
    }
    if (state !== this.musicState) {
      // Every run starts its music from bar 1, whatever the last one left playing.
      this.musicState = state;
      this.rewind = true;
      if (this.song) { this.players[this.song].stop(t, MUSIC_FADES.pause); this.song = null; }
    }
    const want = this.enabled && this.musicOn && this.ctx.state === 'running' ? songFor(state) : null;
    if (want !== this.song) {
      const from = this.song && this.players[this.song];
      const to = want && this.players[want];
      if (from && to) {
        // Each guardian fight opens the boss loop at bar 1; the calm loop picks up where it paused.
        if (want === 'boss') crossfade(from, to, t, MUSIC_FADES.toBoss, { from: 0 });
        else crossfade(from, to, t, MUSIC_FADES.toCalm);
      } else if (from) {
        const over = state && (state.status === 'won' || state.status === 'lost');
        from.stop(t, over ? MUSIC_FADES.end : MUSIC_FADES.pause);
      } else if (to) {
        if (this.rewind) for (const p of Object.values(this.players)) p.rewind();
        to.start(t + .05, { fade: this.rewind ? MUSIC_FADES.start : MUSIC_FADES.pause });
      }
      if (to) this.rewind = false;
      this.song = want;
    }
    for (const p of Object.values(this.players)) p.update(t);
  }
}
