import { FROG_HITBOX } from './config.js';

// Continuous AABB collision against each vehicle's 4 wheels.
// Mid-hop is NOT invincible — a wheel passing through the frog's actual world position
// kills it whether it's airborne or not (hop arc is too low to clear a wheel anyway).
// What protects the frog is the BODY GAP: between the front and rear axles, no wheel
// occupies the wheel-row strip, so a hop timed into that gap survives the pass-through.
export function checkCollision(frog, vehicles) {
  if (frog.state === 'DEAD') return null;
  const fx = frog.group.position.x;
  const fz = frog.group.position.z;
  const fHalf = FROG_HITBOX / 2;
  for (const v of vehicles) {
    // Cheap reject: if vehicle z is far from frog z, no wheel can possibly overlap.
    if (Math.abs(v.z - fz) > v.width) continue;
    const wxHalf = v.type.wheelRadius;
    const wzHalf = v.type.wheelWidth / 2;
    for (const w of v.wheels) {
      const wxWorld = v.x + w.localX;
      const wzWorld = v.z + w.localZ;
      if (
        Math.abs(wxWorld - fx) < wxHalf + fHalf &&
        Math.abs(wzWorld - fz) < wzHalf + fHalf
      ) {
        return v;
      }
    }
  }
  return null;
}
