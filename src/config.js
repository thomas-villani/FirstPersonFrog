// All tunable constants live here. Iterate freely.

// --- Spatial units (meters) ---
export const LANE_WIDTH = 4;          // depth of one road lane (and forward hop distance)
export const CELL_WIDTH = 2;          // strafe hop distance (inside a lane)
export const ROAD_LENGTH = 200;       // X-axis length of the road (visible stretch)
export const STRAFE_MAX = 2;          // max |cellX| — play area is cellX ∈ [-2, 2]

// --- Camera ---
export const CAMERA_EYE_HEIGHT = 0.05; // 5 cm off the asphalt
export const FOV = 95;
export const NEAR_PLANE = 0.02;
export const FAR_PLANE = 200;
export const PITCH_CLAMP = Math.PI / 2 * (85 / 90); // ±85°

// --- Frog ---
export const HOP_DURATION = 0.4;       // seconds
export const HOP_HEIGHT = 0.6;         // arc apex in meters
export const FROG_HITBOX = 0.3;        // AABB cube edge
export const GROUND_THRESHOLD = 0.05;  // y above which frog is considered airborne (invincible)

// --- Head bob ---
export const HEAD_BOB_AMPLITUDE = 0.04;
export const HEAD_BOB_DECAY_MS = 150;

// --- Fog / visibility ---
export const SKY_COLOR = 0x87ceeb;
export const FOG_START = 15;
export const FOG_END = 80;

// --- Colors ---
export const ROAD_COLOR = 0x2a2a2e;
export const GRASS_COLOR = 0x4a7c3a;
export const STRIPE_COLOR = 0xf2f2f2;

// --- Lane layout ---
// Rows: 0 = start median, 1..LANE_COUNT_MVP = road lanes, LANE_COUNT_MVP+1 = end median.
export const LANE_COUNT_MVP = 3;
export const START_ROW = 0;
export const GOAL_ROW = LANE_COUNT_MVP + 1;

// --- Vehicle types ---
// Dimensions in meters. From a 5cm eye, these should feel MASSIVE.
export const VEHICLE_TYPES = {
  sedan: {
    size: { L: 4.5, W: 1.8, H: 1.5 },
    color: 0xcc3344,
    wheelRadius: 0.35,
    wheelWidth: 0.25,
  },
  truck: {
    size: { L: 12, W: 2.5, H: 3.5 },
    color: 0x3355aa,
    wheelRadius: 0.55,
    wheelWidth: 0.35,
  },
};

// --- Per-lane spawning ---
// `row` = frog row index this lane occupies (road lanes are rows 1..LANE_COUNT_MVP).
// `direction` = +1 traffic moves in +X, -1 traffic moves in -X.
// `speedRange` = uniform m/s range.
// `spawnInterval` = uniform seconds range between spawn attempts.
// `mix` = weighted vehicle type roll.
export const LANES = [
  {
    row: 1,
    direction: +1,
    speedRange: [8, 12],
    spawnInterval: [1.2, 2.5],
    mix: [['sedan', 0.7], ['truck', 0.3]],
  },
  {
    row: 2,
    direction: -1,
    speedRange: [10, 14],
    spawnInterval: [0.8, 2.0],
    mix: [['sedan', 0.5], ['truck', 0.5]],
  },
  {
    row: 3,
    direction: +1,
    speedRange: [6, 9],
    spawnInterval: [2.0, 3.5],
    mix: [['truck', 1.0]],
  },
];

// --- Spawn geometry ---
export const SPAWN_MARGIN = 8;               // spawn this far past the road edge
export const DESPAWN_MARGIN = 8;             // despawn this far past opposite edge
export const MIN_SPAWN_SPACING = 2;          // extra meters beyond vehicle length

// --- Audio ---
export const APPROACH_PITCH = 0.35;          // max playbackRate bump for a closing vehicle
export const MAX_AUDIBLE_DISTANCE = 60;      // meters, beyond this engine gain is 0
export const ENGINE_POOL_SIZE = 8;

// --- Derived helpers ---
export function rowToZ(row) {
  return -row * LANE_WIDTH;
}
export function cellXToWorldX(cellX) {
  return cellX * CELL_WIDTH;
}
