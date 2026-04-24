import { FROG_HITBOX } from './config.js';

// AABB overlap on X within the frog's current lane.
// Z-axis is trivially overlapping when rows match (both at -row*LANE_WIDTH) and
// the vehicle is wider than the frog's hitbox — so only the X test is load-bearing.
// Returns the first overlapping vehicle, or null. Mid-hop the frog is invincible
// (state !== IDLE → return null), which gives the "barely made it" feel the spec wants.
export function checkCollision(frog, vehicles) {
  if (frog.state !== 'IDLE') return null;
  const frogX = frog.group.position.x;
  const fHalf = FROG_HITBOX / 2;
  for (const v of vehicles) {
    if (v.row !== frog.row) continue;
    if (Math.abs(v.x - frogX) < v.length / 2 + fHalf) return v;
  }
  return null;
}
