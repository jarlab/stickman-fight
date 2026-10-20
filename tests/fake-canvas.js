import assert from 'node:assert/strict';

// A recording 2D context for Node tests. Every method call is logged with its arguments and
// the drawing state at that moment; numeric arguments must stay finite. Style properties
// (globalAlpha, fillStyle ...) live on a save/restore stack like a real context.
const STYLE = ['globalAlpha', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'font', 'textAlign', 'imageSmoothingEnabled'];

export function recordingContext() {
  let state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start', imageSmoothingEnabled: true };
  const stack = [];
  const calls = [];
  let depth = 0;
  const special = {
    save() { stack.push({ ...state }); depth += 1; },
    restore() { if (stack.length) state = stack.pop(); depth -= 1; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    measureText(text) { return { width: String(text).length * 6 }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  const ctx = new Proxy({}, {
    get(_, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'depth') return depth;
      if (STYLE.includes(prop)) return state[prop];
      return (...args) => {
        for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${String(prop)} got ${value}`);
        calls.push({ name: prop, args, alpha: state.globalAlpha, fill: state.fillStyle, stroke: state.strokeStyle });
        return special[prop]?.(...args);
      };
    },
    set(_, prop, value) {
      if (prop === 'globalAlpha') assert.ok(Number.isFinite(value), `globalAlpha got ${value}`);
      state[prop] = value;
      return true;
    },
  });
  return ctx;
}

export function fakeCanvas() {
  const ctx = recordingContext();
  return { ctx, canvas: { width: 0, height: 0, getContext: () => ctx } };
}
