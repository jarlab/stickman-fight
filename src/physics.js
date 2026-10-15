export const GRAVITY = 1800;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Ground depth and jump height are independent. The projected feet are depth-z,
// so changing lanes never counts as a jump or makes a distant fighter hittable.
export function moveFighter(f, dt) {
  f.x = clamp(f.x + f.vx * dt, 30 + f.w / 2, 1250 - f.w / 2);
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
