const edgeKeys = { Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyJ: 'attack', KeyK: 'special', KeyL: 'burst', KeyE: 'interact', KeyU: 'throw' };
const directionKeys = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
const actionPriority = ['burst', 'special', 'throw', 'attack', 'dash', 'jump', 'interact'];
export const PLAY_KEYS = new Set([...Object.keys(directionKeys), 'KeyI', ...Object.keys(edgeKeys)]);

// Physical key state is independent of the fixed-step game's one-shot intents.
export class KeyboardInput {
  constructor() { this.clear(); }

  clear() {
    this.held = new Set();
    this.presses = new Map();
    this.lastDirectionTap = { left: -Infinity, right: -Infinity };
    this.runDirection = null;
    this.command = null;
    this.freshInput = false;
  }

  clearCommand() {
    this.command = null;
    for (const [action, press] of this.presses) if (press.command) this.presses.delete(action);
  }

  directionHeld(direction) {
    return Object.entries(directionKeys).some(([code, value]) => value === direction && this.held.has(code));
  }

  axes() {
    return {
      direction: Number(this.directionHeld('right')) - Number(this.directionHeld('left')),
      depthDirection: Number(this.directionHeld('down')) - Number(this.directionHeld('up')),
    };
  }

  press(code, now, { repeat = false } = {}) {
    if (!PLAY_KEYS.has(code) || repeat || this.held.has(code)) return;
    this.freshInput = true;
    // Several browser events can precede one simulation tick. A later press
    // must invalidate an already-completed command in that interval too.
    for (const [action, press] of this.presses) if (press.command) this.presses.delete(action);
    const direction = directionKeys[code];
    if (direction === 'left' || direction === 'right') {
      if (!this.directionHeld(direction)) {
        this.runDirection = now - this.lastDirectionTap[direction] <= 250 ? direction : null;
        this.lastDirectionTap[direction] = now;
        this.lastDirectionTap[direction === 'left' ? 'right' : 'left'] = -Infinity;
      }
      if (this.runDirection && this.runDirection !== direction) this.runDirection = null;
    }
    this.held.add(code);

    // LF2's command stages persist until a compatible press advances them or
    // another gameplay press interrupts them. They have no elapsed-time limit.
    if (code === 'KeyI') {
      this.command = 'guard';
    } else if (this.command === 'guard' && ['left', 'right', 'up'].includes(direction)) {
      this.command = direction;
    } else if (code === 'KeyJ' && ['left', 'right', 'up'].includes(this.command)) {
      const upward = this.command === 'up';
      this.presses.delete('attack');
      this.presses.set(upward ? 'burst' : 'special', {
        direction: upward ? this.axes().direction : this.command === 'left' ? -1 : 1,
        depthDirection: upward ? -1 : 0,
        command: true,
      });
      this.command = null;
      return;
    } else {
      this.command = null;
    }
    if (edgeKeys[code]) this.presses.set(edgeKeys[code], this.axes());
  }

  release(code) {
    this.held.delete(code);
    if (this.runDirection && !this.directionHeld(this.runDirection)) this.runDirection = null;
  }

  read() {
    const input = {
      left: this.directionHeld('left'),
      right: this.directionHeld('right'),
      up: this.directionHeld('up'),
      down: this.directionHeld('down'),
      guard: this.held.has('KeyI'),
      // E held down (freeing a bound villager takes a held E).
      interactHeld: this.held.has('KeyE'),
      freshInput: this.freshInput,
      run: Boolean(this.runDirection && this.directionHeld(this.runDirection) && !this.directionHeld(this.runDirection === 'left' ? 'right' : 'left')),
    };
    for (const action of actionPriority) input[action] = this.presses.has(action);
    const press = this.presses.get(actionPriority.find(action => this.presses.has(action)));
    if (press) {
      input.attackDirection = press.direction;
      input.attackDepthDirection = press.depthDirection;
      input.command = !!press.command;
    }
    this.presses.clear();
    this.freshInput = false;
    return input;
  }
}
