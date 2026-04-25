import { FROG_HITBOX, GRAZE_RADIUS, CLOSE_RADIUS, LANE_WIDTH } from './config.js';

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

// --- Near-miss detection (PLAN_SCORING §4.1) -------------------------------
//
// Three tiers, in descending value:
//   THREADED — frog inside the vehicle's body footprint, strict (between front/rear
//              axles in X AND strictly between the two wheel-track rows in Z).
//              This is the "wheelbase thread" — the survivable gap.
//   GRAZED   — any wheel within frog hitbox edge + GRAZE_RADIUS.
//   CLOSE    — body-center within CLOSE_RADIUS in X AND within ~one lane-width in Z.
//
// Each frame we compute approachingSign = (v.x - frog.x) * -v.direction.
//   > 0: approaching   <= 0: at/past
// We track each vehicle's max tier during the current approach, and fire one event
// per approach when the sign transitions positive → non-positive. Tier is then
// reset, so a frog who hops sideways back into a passed vehicle's path can earn a
// fresh near-miss on the second pass.

const TIER_RANK = { CLOSE: 1, GRAZED: 2, THREADED: 3 };

function tierRank(t) {
  return t ? TIER_RANK[t] : 0;
}

function evaluateTier(frog, v) {
  const fx = frog.group.position.x;
  const fz = frog.group.position.z;
  const fHalf = FROG_HITBOX / 2;

  // THREADED — inside body footprint, strict. Body width matches wheel-track
  // span, so this is equivalent to "between the wheel-row lines in Z".
  const bodyHalfL = v.length / 2;
  const bodyHalfW = v.width / 2;
  if (Math.abs(v.x - fx) < bodyHalfL && Math.abs(v.z - fz) < bodyHalfW) {
    return 'THREADED';
  }

  // GRAZED — any wheel within hitbox edge + GRAZE_RADIUS. Inflated AABB check
  // mirrors the kill-AABB in checkCollision so a kill-near-miss has the same
  // metric basis as the kill itself.
  const wxHalf = v.type.wheelRadius;
  const wzHalf = v.type.wheelWidth / 2;
  for (const w of v.wheels) {
    const dx = Math.abs(v.x + w.localX - fx);
    const dz = Math.abs(v.z + w.localZ - fz);
    if (
      dx < wxHalf + fHalf + GRAZE_RADIUS &&
      dz < wzHalf + fHalf + GRAZE_RADIUS
    ) {
      return 'GRAZED';
    }
  }

  // CLOSE — body center near frog X, with a Z gate so a vehicle three lanes away
  // doesn't fire CLOSE every time it whooshes past on the X axis.
  if (Math.abs(v.x - fx) < CLOSE_RADIUS && Math.abs(v.z - fz) < LANE_WIDTH) {
    return 'CLOSE';
  }

  return null;
}

// Returns null or an array of fired tier strings (one per vehicle that passed
// this frame). Caller feeds them into score.addNearMiss.
export function detectNearMisses(frog, vehicles) {
  if (frog.state === 'DEAD') return null;
  const fx = frog.group.position.x;
  let fired = null;

  for (const v of vehicles) {
    const sign = (v.x - fx) * -v.direction;
    const wasApproaching = v.nearMiss.lastSign > 0;
    const isApproaching = sign > 0;

    // Evaluate tier while approaching, plus the pass-through frame itself
    // (so a body crossover that completes exactly when sign hits 0 still counts).
    if (isApproaching || wasApproaching) {
      const cur = evaluateTier(frog, v);
      if (cur && tierRank(cur) > tierRank(v.nearMiss.tier)) {
        v.nearMiss.tier = cur;
      }
    }

    // Fire on transition from approaching → past, then re-arm.
    if (wasApproaching && !isApproaching) {
      if (v.nearMiss.tier) {
        if (!fired) fired = [];
        fired.push(v.nearMiss.tier);
      }
      v.nearMiss.tier = null;
    }

    v.nearMiss.lastSign = sign;
  }

  return fired;
}
