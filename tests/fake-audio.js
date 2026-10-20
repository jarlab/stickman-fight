// A recording fake AudioContext for node tests of src/audio.js and src/game-audio.js. It
// records every node, param automation event, start/stop time and connection, so tests can
// check the bank's contracts without a browser. currentTime only moves when a test sets it.
export class Param {
  constructor(v = 0) { this.value = v; this.events = []; }
  _ev(type, v, t) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new Error(`${type}: non-finite ${v} @ ${t}`);
    if (type === 'exp' && v <= 0) throw new Error(`exponentialRamp to ${v}`);
    this.events.push({ type, v, t });
    return this;
  }
  setValueAtTime(v, t) { return this._ev('set', v, t); }
  linearRampToValueAtTime(v, t) { return this._ev('lin', v, t); }
  exponentialRampToValueAtTime(v, t) { return this._ev('exp', v, t); }
  setTargetAtTime(v, t) { return this._ev('target', v, t); }
  cancelScheduledValues(t) { this.events = this.events.filter(e => e.t < t); return this; }
  // The value a param is heading to: the last scheduled target, else its static value.
  get target() { return this.events.length ? this.events.at(-1).v : this.value; }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outs = new Set(); ctx.nodes.push(this); }
  connect(dst) { if (!dst) throw new Error(`${this.kind}.connect(undefined)`); this.outs.add(dst); return dst; }
  disconnect() { this.outs.clear(); this.disconnected = true; }
}
class Source extends Node {
  constructor(ctx, kind) { super(ctx, kind); this.onended = null; ctx.sources.push(this); }
  start(t = 0) { this.startAt = t; }
  stop(t = 0) { this.stopAt = t; }
}
export function fakeCtx({ sampleRate = 48000, state = 'running' } = {}) {
  const ctx = { sampleRate, currentTime: 0, nodes: [], sources: [], state };
  ctx.destination = new Node(ctx, 'destination');
  const gainNode = () => Object.assign(new Node(ctx, 'gain'), { gain: new Param(1) });
  Object.assign(ctx, {
    createGain: gainNode,
    createOscillator: () => Object.assign(new Source(ctx, 'osc'), { type: 'sine', frequency: new Param(440), detune: new Param() }),
    createBufferSource: () => Object.assign(new Source(ctx, 'buffer'), { buffer: null, loop: false, playbackRate: new Param(1) }),
    createBiquadFilter: () => Object.assign(new Node(ctx, 'biquad'), { type: 'lowpass', frequency: new Param(350), Q: new Param(1), gain: new Param() }),
    createWaveShaper: () => Object.assign(new Node(ctx, 'shaper'), { curve: null, oversample: 'none' }),
    createStereoPanner: () => Object.assign(new Node(ctx, 'panner'), { pan: new Param() }),
    createConvolver: () => Object.assign(new Node(ctx, 'convolver'), { buffer: null, normalize: true }),
    createDynamicsCompressor: () => Object.assign(new Node(ctx, 'comp'), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(k => [k, new Param()]))),
    createBuffer: (ch, n, sr) => { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, length: n, sampleRate: sr, getChannelData: i => data[i] }; },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
  });
  return ctx;
}
