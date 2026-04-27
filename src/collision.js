import { FROG_HITBOX, GRAZE_RADIUS, SUB_ROWS_PER_LANE } from './config.js';

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
//   THREADED — at the MOMENT of a hop, the frog's row-span crossed one of the
//              vehicle's wheel-row Z lines AND the vehicle's wheelbase X was
//              over the frog. Span covers single-step hops (start or end on a
//              wheel-row) AND long-jumps (endpoints on opposite sides of a
//              wheel-row, skipping over it). The X gate is strict — the wheels
//              must straddle the frog at hop time, which is the "between the
//              front and rear wheels" requirement.
//   UNDER    — vehicle body footprint over the frog AND frog Z strictly between
//              the wheel-row lines. Passive: small bonus for the body driving
//              over you while you're in the safe Z gap.
//   GRAZED   — any wheel within frog hitbox edge + GRAZE_RADIUS. Suppressed
//              when frog is on safe ground (start, goal, or a between-lane
//              stripe), since stripes are designed to be wheel-free.
//
// Each frame we compute approachingSign = (v.x - frog.x) * -v.direction.
//   > 0: approaching   <= 0: at/past
// We track each vehicle's max base tier during the approach plus a separate
// `threadedHop` flag, and fire one event per approach when the sign transitions
// positive → non-positive. THREADED supersedes any base tier when set.

const TIER_RANK = { GRAZED: 1, UNDER: 2 };

function tierRank(t) {
  return t ? TIER_RANK[t] : 0;
}

// Frog is on safe ground when not in a wheel-row sub-row: the start row, the
// goal row, or any between-lane stripe (last sub-row of each lane, where
// `row % SUB_ROWS_PER_LANE === 0`). Mirrors the inTraffic check in game.js.
function isOnSafeGround(frog) {
  return (
    frog.row <= 0 ||
    frog.row >= frog.goalRow ||
    frog.row % SUB_ROWS_PER_LANE === 0
  );
}

function evaluateTier(frog, v, onSafeGround) {
  const fx = frog.group.position.x;
  const fz = frog.group.position.z;
  const fHalf = FROG_HITBOX / 2;

  // UNDER — vehicle body over the frog AND frog Z strictly between the two
  // wheel-row lines (i.e., in the no-wheel strip). Body width matches wheel-track
  // span, so the Z check IS "between the wheel-row lines".
  const bodyHalfL = v.length / 2;
  const bodyHalfW = v.width / 2;
  if (Math.abs(v.x - fx) < bodyHalfL && Math.abs(v.z - fz) < bodyHalfW) {
    return 'UNDER';
  }

  // GRAZED — any wheel within hitbox edge + GRAZE_RADIUS. Inflated AABB check
  // mirrors the kill-AABB in checkCollision so a kill-near-miss has the same
  // metric basis as the kill itself. Suppressed on safe ground because the
  // between-lane stripe is wheel-free by design and shouldn't pay out for
  // adjacent-lane wheels passing close.
  if (!onSafeGround) {
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
  }

  return null;
}

// Returns null or an array of fired events (one per vehicle that passed this
// frame), each shaped { tier, vehicle }. Caller feeds them into
// score.addNearMiss — the vehicle is needed because per-type scoring lets
// smaller vehicles pay more for THREADED.
export function detectNearMisses(frog, vehicles) {
  if (frog.state === 'DEAD') return null;
  const fx = frog.group.position.x;
  const onSafeGround = isOnSafeGround(frog);
  let fired = null;

  for (const v of vehicles) {
    const sign = (v.x - fx) * -v.direction;
    const wasApproaching = v.nearMiss.lastSign > 0;
    const isApproaching = sign > 0;

    // Evaluate tier while approaching, plus the pass-through frame itself
    // (so a body crossover that completes exactly when sign hits 0 still counts).
    if (isApproaching || wasApproaching) {
      const cur = evaluateTier(frog, v, onSafeGround);
      if (cur && tierRank(cur) > tierRank(v.nearMiss.tier)) {
        v.nearMiss.tier = cur;
      }
      // THREADED detection: at hop-time, frog's row span crosses one of THIS
      // vehicle's wheel-row Z lines AND the wheelbase X is over the frog X.
      // Spanning covers both single-step hops (start or end on a wheel-row)
      // and long-jumps (endpoints on opposite sides, skipping the wheel-row).
      // The X gate is strict so a hop in the gap when the vehicle is far
      // away doesn't pay out — the wheels must currently be straddling the
      // frog. Both gates are checked at hop-time only; sit-still and
      // sideways-in-gap hops never satisfy the row-span requirement.
      if (frog.state === 'HOPPING') {
        const wheelbaseHalfL = v.wheelbaseHalfL;
        if (wheelbaseHalfL > 0 && Math.abs(v.x - fx) < wheelbaseHalfL) {
          const lo = Math.min(frog.prevRow, frog.row);
          const hi = Math.max(frog.prevRow, frog.row);
          for (const wr of v.wheelRows) {
            if (lo <= wr && wr <= hi) {
              v.nearMiss.threadedHop = true;
              break;
            }
          }
        }
      }
    }

    // Fire on transition from approaching → past, then re-arm. THREADED wins
    // outright when set — the frog earned the active skill bonus regardless
    // of whatever passive tier was also tracked.
    if (wasApproaching && !isApproaching) {
      let firedTier = null;
      if (v.nearMiss.threadedHop) firedTier = 'THREADED';
      else if (v.nearMiss.tier) firedTier = v.nearMiss.tier;
      if (firedTier) {
        if (!fired) fired = [];
        fired.push({ tier: firedTier, vehicle: v });
      }
      v.nearMiss.tier = null;
      v.nearMiss.threadedHop = false;
    }

    v.nearMiss.lastSign = sign;
  }

  return fired;
}
