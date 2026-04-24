// All tunable constants live here. Iterate freely.

// --- Spatial units (meters) ---
export const LANE_WIDTH = 4;          // depth of one road lane (vehicles live in this strip)
export const SUB_ROWS_PER_LANE = 8;   // number of frog grid points across the lane's depth
export const SUB_ROW_DEPTH = LANE_WIDTH / SUB_ROWS_PER_LANE; // forward hop distance = 0.5m
export const CELL_WIDTH = 1.2;        // strafe hop distance (parallel to traffic)
export const ROAD_LENGTH = 200;       // X-axis length of the road (visible stretch)
export const STRAFE_MAX = 8;          // max |cellX| — play area along X is ±9.6m (~1.6× truck length)

// --- Camera ---
export const CAMERA_EYE_HEIGHT = 0.05; // 5 cm off the asphalt
export const FOV = 95;
export const NEAR_PLANE = 0.02;
export const FAR_PLANE = 200;
export const PITCH_CLAMP = Math.PI / 2 * (85 / 90); // ±85°

// --- Frog ---
export const HOP_DURATION = 0.22;      // seconds (sub-row hops are short, so the tween is quick)
export const HOP_HEIGHT = 0.18;        // arc apex in meters — must stay UNDER vehicle body clearances
export const FROG_HITBOX = 0.3;        // AABB cube edge
export const GROUND_THRESHOLD = 0.05;  // y above which frog is considered airborne (invincible)

// --- Head bob ---
export const HEAD_BOB_AMPLITUDE = 0.025;
export const HEAD_BOB_DECAY_MS = 130;

// --- Fog / visibility ---
export const SKY_COLOR = 0x87ceeb;
export const FOG_START = 15;
export const FOG_END = 80;

// --- Colors ---
export const ROAD_COLOR = 0x2a2a2e;
export const GRASS_COLOR = 0x4a7c3a;
export const STRIPE_COLOR = 0xf2f2f2;
export const STRIPE_WIDTH_OUTER = 0.18;   // start/end of road
export const STRIPE_WIDTH_DIVIDER = 0.34; // safe between-lane stripe — wider so it reads from 5cm POV

// --- Lane layout ---
// Frog row index N maps to world Z = -N * SUB_ROW_DEPTH.
// Row 0 = start (back edge of start median, on the lip of lane 0).
// Lane L has sub-rows L*SUB_ROWS_PER_LANE+1 .. (L+1)*SUB_ROWS_PER_LANE.
// Goal row = laneCount * SUB_ROWS_PER_LANE + 1.
//
// The LAST sub-row of every lane sits exactly on the white between-lane stripe (safe ground):
// `spawner.js` constrains wheel rows to the lane's first..secondToLast, so the frog can rest
// on the stripe without being hit. Vehicle bodies also stay strictly inside the lane.
//
// Lane count grows with level: ceil(level/2), capped at MAX_LANES.
//   levels 1–2 → 1 lane    levels 9–10 → 5 lanes
//   levels 3–4 → 2 lanes   levels 11–12 → 6 lanes
//   levels 5–6 → 3 lanes   levels 13–14 → 7 lanes
//   levels 7–8 → 4 lanes   levels 15+   → 8 lanes (capped)
//
// Direction follows a divided-road convention: east lanes contiguously near the start,
// then west lanes contiguously near the goal. East count = ceil(laneCount / 2).
//   1: E         2: EW        3: EEW        4: EEWW
//   5: EEEWW     6: EEEWWW    7: EEEEWWW    8: EEEEWWWW
//
// Once we hit MAX_LANES, further level-ups stop adding lanes and instead start applying
// random direction flips to individual lanes (so the contiguous E/W blocks get scrambled
// the deeper you go) and densify spawns. See `buildLanesForLevel` below.
export const START_ROW = 0;
export const MAX_LANES = 8;
export const LEVELS_PER_LANE_STEP = 2; // 2 levels per lane added

// --- Vehicle types ---
// Dimensions in meters. From a 5cm eye, these should feel MASSIVE.
// `wheelRowSpread` = number of sub-rows between the two wheel-path lines (left vs right wheels).
//   Sedan spread=4 → 2.0m wheel-track. Truck spread=5 → 2.5m wheel-track.
//   Wheels never land on the lane's last sub-row (that's the safe between-lane stripe).
export const VEHICLE_TYPES = {
  sedan: {
    size: { L: 4.5, W: 2.0, H: 1.5 },
    color: 0xcc3344,
    wheelRadius: 0.35,
    wheelWidth: 0.25,
    wheelRowSpread: 4,
  },
  truck: {
    size: { L: 12, W: 2.5, H: 3.5 },
    color: 0x3355aa,
    wheelRadius: 0.55,
    wheelWidth: 0.35,
    wheelRowSpread: 5,
  },
};

// --- Per-lane traffic templates ---
// `buildLanesForLevel` cycles through these to give each lane in the level a different feel.
const LANE_TEMPLATES = [
  { speedRange: [7, 10], spawnInterval: [1.6, 3.0], mix: [['sedan', 0.75], ['truck', 0.25]] },
  { speedRange: [10, 14], spawnInterval: [1.2, 2.4], mix: [['sedan', 0.5], ['truck', 0.5]] },
  { speedRange: [8, 12], spawnInterval: [1.4, 2.6], mix: [['sedan', 0.6], ['truck', 0.4]] },
  { speedRange: [11, 15], spawnInterval: [1.0, 2.2], mix: [['sedan', 0.4], ['truck', 0.6]] },
  { speedRange: [6, 9], spawnInterval: [2.0, 3.5], mix: [['truck', 1.0]] },
];

// --- Spawn geometry ---
export const SPAWN_MARGIN = 8;               // spawn this far past the road edge
export const DESPAWN_MARGIN = 8;             // despawn this far past opposite edge
export const MIN_SPAWN_SPACING = 2;          // extra meters beyond vehicle length

// --- Difficulty ramp ---
export const SPEED_RAMP_PER_LEVEL = 0.10;    // each crossing multiplies speed by 1 + this

// --- Audio ---
export const APPROACH_PITCH = 0.35;          // max playbackRate bump for a closing vehicle
export const MAX_AUDIBLE_DISTANCE = 60;      // meters, beyond this engine gain is 0
export const ENGINE_POOL_SIZE = 8;

// --- Intro flythrough ---
export const INTRO_DURATION = 2.6;           // seconds for the top-down → frog-eye descent
export const INTRO_START_POS = [0, 28, 9];   // world-space camera start (high & slightly behind)

// --- Derived helpers ---
export function rowToZ(row) {
  return -row * SUB_ROW_DEPTH;
}
export function cellXToWorldX(cellX) {
  return cellX * CELL_WIDTH;
}
// First sub-row index (1-based, total) belonging to this lane.
export function laneFirstRow(laneIndex) {
  return laneIndex * SUB_ROWS_PER_LANE + 1;
}

// --- Level → world parameters ---
export function laneCountForLevel(level) {
  return Math.max(1, Math.min(MAX_LANES, Math.ceil(level / LEVELS_PER_LANE_STEP)));
}
export function totalSubRowsForLevel(level) {
  return laneCountForLevel(level) * SUB_ROWS_PER_LANE;
}
export function goalRowForLevel(level) {
  return totalSubRowsForLevel(level) + 1;
}
// First level at which the lane count is capped — beyond this we apply chaos modifiers.
export const CAPPED_AT_LEVEL = MAX_LANES * LEVELS_PER_LANE_STEP; // 16

// East lane count for a given total lane count. East lanes go at low laneIndex; west
// lanes fill the remainder.
function eastCountForLanes(n) {
  return Math.max(0, Math.ceil(n / 2));
}

// --- Build the LANES config for a given level ---
// Levels 1..CAPPED_AT_LEVEL: clean East-then-West pattern with templates cycled per lane.
// Levels > CAPPED_AT_LEVEL: lane count stays at MAX_LANES, but:
//   - each lane's direction has a flipProbability of being inverted (chaos),
//   - spawnInterval shrinks (denser traffic).
export function buildLanesForLevel(level) {
  const count = laneCountForLevel(level);
  const east = eastCountForLanes(count);

  const excess = Math.max(0, level - CAPPED_AT_LEVEL);
  const flipProbability = Math.min(0.45, excess * 0.04); // 0%..45% per lane
  const densityMult = excess > 0 ? Math.max(0.4, 1 - excess * 0.04) : 1;

  const lanes = [];
  for (let i = 0; i < count; i++) {
    let direction = i < east ? +1 : -1;
    if (flipProbability > 0 && Math.random() < flipProbability) direction = -direction;

    const tpl = LANE_TEMPLATES[i % LANE_TEMPLATES.length];
    lanes.push({
      laneIndex: i,
      direction,
      speedRange: tpl.speedRange,
      spawnInterval: [
        tpl.spawnInterval[0] * densityMult,
        tpl.spawnInterval[1] * densityMult,
      ],
      mix: tpl.mix,
    });
  }
  return lanes;
}
