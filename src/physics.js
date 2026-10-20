export const GRAVITY = 1800;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const ARENA_BOUNDS = { left: 30, right: 1250 };

// Ground depth and jump height are independent. The projected feet are depth-z,
// so changing lanes never counts as a jump or makes a distant fighter hittable.
export function moveFighter(f, dt, bounds = ARENA_BOUNDS) {
  f.x = clamp(f.x + f.vx * dt, bounds.left + f.w / 2, bounds.right - f.w / 2);
  f.depth = clamp(f.depth + f.vDepth * dt, 395, 650);
  f.z -= f.vy * dt;
  f.grounded = false;
  if (f.z <= 0 && f.vy >= 0) {
    f.z = 0;
    f.vy = 0;
    f.grounded = true;
    f.jumps = 0;
    f.dashUsed = false;
  }
  f.y = f.depth - f.z;
}
