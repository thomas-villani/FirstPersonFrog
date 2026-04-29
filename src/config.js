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

// --- Landscape (decorative scenery beyond the medians) ---
export const FAR_GRASS_DEPTH = 220;       // how deep the off-road grass extends past each median
export const FAR_GRASS_WIDTH = 400;       // X-axis width of the off-road grass plane
export const POND_COLOR = 0x2e5a8a;
export const POND_RADIUS_X = 28;          // ellipse half-extent along X
export const POND_RADIUS_Z = 14;          // ellipse half-extent along Z
export const POND_Z_OFFSET = 22;          // distance past the goal median's far edge
export const TREE_TRUNK_COLOR = 0x4a3220;
export const TREE_FOLIAGE_COLOR = 0x2f6b2a;
export const TREE_COUNT_PER_SIDE = 14;    // trees scattered on each off-road bank

// --- Central guardrail (≥4-lane roads) ---
// Two parallel rails framing the central safe stripe + vertical posts on the
// stripe centerline. Pure decoration; collision ignores it. Frog hitbox is
// 0.3m wide (±0.15m); rails sit at ±DIVIDER_RAIL_OFFSET so they never overlap
// the frog AABB at any cellX. The post (centered on the stripe) is
// DIVIDER_POST_THICKNESS thick — under the 0.34m stripe width but tall enough
// to read as imposing from a 5cm POV.
export const DIVIDER_MIN_LANES = 4;
export const DIVIDER_RAIL_OFFSET = 0.12;     // m, each rail offset from stripe centerline
export const DIVIDER_RAIL_THICKNESS = 0.06;
export const DIVIDER_RAIL_HEIGHT = 1.05;     // top edge above asphalt (lower of two rails sits below)
export const DIVIDER_RAIL_SECOND_HEIGHT = 0.55; // lower rail height
export const DIVIDER_POST_SPACING = 5;       // m between posts along the road
export const DIVIDER_POST_HEIGHT = 1.6;
export const DIVIDER_POST_THICKNESS = 0.10;
export const DIVIDER_RAIL_COLOR = 0xb8b8c0;
export const DIVIDER_POST_COLOR = 0x404040;

// --- Road decorations ---
// Bott's-dot style markers on the safe stripes — one per cellX position so the
// player has a visible X reference while crossing.
export const PEBBLE_COLOR = 0xeae0c8;
export const PEBBLE_SIZE = 0.22;          // diameter of each marker (fits within STRIPE_WIDTH_DIVIDER)
export const PEBBLE_HEIGHT = 0.04;        // low enough not to occlude oncoming traffic from 5cm POV

// Flattened road garbage — purely decorative texture, scattered randomly on the road.
export const GARBAGE_COUNT = 60;
export const GARBAGE_TYPES = [
  { color: 0xb0b0b0, w: 0.16, l: 0.22 }, // crushed can
  { color: 0xc8b48a, w: 0.30, l: 0.22 }, // paper bag
  { color: 0xeeeeee, w: 0.12, l: 0.16 }, // cup
  { color: 0x8a6a3a, w: 0.36, l: 0.28 }, // cardboard scrap
  { color: 0x5a4a3a, w: 0.18, l: 0.12 }, // unidentifiable smear
];

// 3D decorative rocks — small SphereGeometry chunks scattered on the road and
// off-road banks. Pure decoration; collision ignores them.
export const ROCK_COUNT_ON_ROAD = 25;
export const ROCK_COUNT_OFF_ROAD = 35;
export const ROCK_COLORS = [0x6a6058, 0x807060, 0x4a4238, 0x9a8a78];
export const ROCK_RADIUS_RANGE = [0.04, 0.14];

// --- Blocking road obstacles ---
// Litter on the safe between-lane stripes that blocks the frog's hop. Strafe
// around them. Each obstacle reserves its (row, cellX) cell.
export const OBSTACLE_TYPES = [
  { kind: 'sodaCanRed',    radius: 0.10, height: 0.22, color: 0xcc1111, geom: 'cylinder' },
  { kind: 'sodaCanSilver', radius: 0.10, height: 0.22, color: 0xc0c0c0, geom: 'cylinder' },
  { kind: 'sodaBottle',    radius: 0.07, height: 0.32, color: 0x2a8a3a, geom: 'cylinder' },
  { kind: 'trashBag',      radius: 0.32, height: 0.45, color: 0x4a4a52, geom: 'sphere' },
];
export const OBSTACLES_PER_LEVEL_BASE = 1;
export const OBSTACLES_PER_LEVEL_CAP = 4;

// --- Biome themes ---
// Each level rebuild picks a theme; world.js applies sky/fog/grass and gates
// the optional decoration helpers (buildings, mountains, cacti). Level 1
// is locked to "meadow" so the cinematic intro stays consistent.
export const THEMES = {
  meadow: {
    sky: 0x87ceeb, grass: 0x4a7c3a, fogStart: 15, fogEnd: 80,
    trees: 14, pond: true, buildings: 0, mountains: 0, cacti: 0,
  },
  suburb: {
    sky: 0x9bc3df, grass: 0x6a8a44, fogStart: 14, fogEnd: 75,
    trees: 8, pond: false, buildings: 10, mountains: 0, cacti: 0,
  },
  mountain: {
    sky: 0xb8c8d8, grass: 0x5a7034, fogStart: 18, fogEnd: 90,
    trees: 6, treeFoliage: 0x255028, pond: true,
    buildings: 0, mountains: 8, cacti: 0,
  },
  desert: {
    sky: 0xeac98a, grass: 0xb89868, fogStart: 12, fogEnd: 70,
    trees: 0, pond: false, buildings: 0, mountains: 4, cacti: 12,
  },
};
export function pickThemeForLevel(level) {
  if (level <= 1) return THEMES.meadow;
  const keys = Object.keys(THEMES);
  return THEMES[keys[Math.floor(Math.random() * keys.length)]];
}

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
// Lane count grows with level: ceil(level/2), uncapped — the road keeps getting
// absurdly wider forever.
//   levels 1–2 → 1 lane     levels 31–32 → 16 lanes
//   levels 3–4 → 2 lanes    levels 49–50 → 25 lanes
//   ... etc, ad infinitum
//
// Direction follows a divided-road convention: east lanes contiguously near the start,
// then west lanes contiguously near the goal. East count = ceil(laneCount / 2).
//   1: E         2: EW        3: EEW        4: EEWW
//   5: EEEWW     6: EEEWWW    7: EEEEWWW    8: EEEEWWWW
//
// At CHAOS_START_LEVEL (16, the level we used to plateau at 8 lanes), per-lane
// direction flips and denser spawn intervals start ramping in. At level 30+ the
// rush-hour override can fire, forcing every lane in one direction for a crossing.
// See `buildLanesForLevel` below.
export const START_ROW = 0;
export const LEVELS_PER_LANE_STEP = 2; // 2 levels per lane added

// --- Vehicle types ---
// Dimensions in meters. From a 5cm eye, these should feel MASSIVE.
// `wheelRowSpread` = number of sub-rows between the two wheel-path lines (left vs right wheels).
//   With SUB_ROWS_PER_LANE=8, the lane has 7 deadly sub-rows + 1 safe stripe.
//   Sedan/boxVan use spread=3 (1.5m wt, pairs {1,4},{2,5},{3,6},{4,7}) — a single
//   type covers every deadly row, so no "safe middle row" exists in any mixed lane.
//   Truck uses spread=4 (2.0m wt, pairs {1,5},{2,6},{3,7}) — covers 6/7 deadly rows
//   (misses row 4); pure-truck lanes mix a narrower vehicle to keep row 4 lethal.
//   doubleTrailer keeps spread=5 (its template always mixes in narrower vehicles).
//   Wheels never land on the lane's last sub-row (that's the safe between-lane stripe).
// `scoreThreaded` overrides SCORE_THREADED per type — shorter wheelbases are
// harder to thread, so smaller vehicles pay more.
//
// Optional fields (used by the new vehicle generalization):
//   axleXs     — array of local-X axle positions. Default [+L/2-2r, -L/2+2r] (2 axles).
//                Use to model 8-axle road-trains, etc.
//   singleTrack— true → 1 wheel per axle, on the lane's wheel-row centerline (motorbikes).
//   bodyWidth  — visual body Z-width override (default = wheel-track).
//   bodyParts  — array of {length, gap, color, height?} laid along X to model multi-section
//                bodies (cab + 2 trailers). Total length+gaps must equal size.L.
export const VEHICLE_TYPES = {
  sedan: {
    size: { L: 4.5, W: 1.5, H: 1.5 },
    color: 0xcc3344,
    wheelRadius: 0.35,
    wheelWidth: 0.25,
    wheelRowSpread: 3,
    scoreThreaded: 500,
  },
  truck: {
    size: { L: 12, W: 2.5, H: 3.5 },
    color: 0x3355aa,
    wheelRadius: 0.55,
    wheelWidth: 0.35,
    wheelRowSpread: 4,
    bodyWidth: 2.5,
    scoreThreaded: 300,
  },
  boxVan: {
    size: { L: 7, W: 1.8, H: 2.8 },
    color: 0xc8a050,
    wheelRadius: 0.4,
    wheelWidth: 0.28,
    wheelRowSpread: 3,
    bodyWidth: 1.8,
    scoreThreaded: 400,
  },
  motorcycle: {
    // Single-track: wheelRowSpread=1 reserves a 2-sub-row footprint for spacing
    // bookkeeping, but `singleTrack` collapses both wheel-rows onto one centerline.
    size: { L: 2.2, W: 0.5, H: 1.2 },
    color: 0x202020,
    wheelRadius: 0.32,
    wheelWidth: 0.18,
    wheelRowSpread: 1,
    singleTrack: true,
    bodyWidth: 0.5,
    scoreThreaded: 800,
  },
  doubleTrailer: {
    // Cab 4m + gap 0.5 + trailer 8.5 + gap 0.5 + trailer 8.5 = 22m total.
    // 8 axles: 2 under the cab, 3 under each trailer.
    size: { L: 22, W: 2.5, H: 3.5 },
    color: 0x808088,
    wheelRadius: 0.55,
    wheelWidth: 0.35,
    wheelRowSpread: 5,
    axleXs: [10.0, 8.5, 2.0, 1.0, 0.0, -7.0, -8.0, -9.0],
    bodyParts: [
      { length: 4.0, gap: 0.0, color: 0x4a4a52, height: 2.6 }, // cab
      { length: 8.5, gap: 0.5, color: 0x808088, height: 3.5 }, // trailer 1
      { length: 8.5, gap: 0.5, color: 0x9a8a72, height: 3.5 }, // trailer 2
    ],
    scoreThreaded: 250,
  },
};

// --- Per-lane traffic templates ---
// `buildLanesForLevel` cycles through these to give each lane in the level a different feel.
// First 5 templates kept verbatim from the MVP so the early levels still feel
// like the cinematic intro; new "industrial" + "fast" templates (using boxVan,
// motorcycle, doubleTrailer) cycle in once levels reach lane index 5+.
const LANE_TEMPLATES = [
  { speedRange: [7, 10], spawnInterval: [1.6, 3.0], mix: [['sedan', 0.75], ['truck', 0.25]] },
  { speedRange: [10, 14], spawnInterval: [1.2, 2.4], mix: [['sedan', 0.5], ['truck', 0.5]] },
  { speedRange: [8, 12], spawnInterval: [1.4, 2.6], mix: [['sedan', 0.6], ['truck', 0.4]] },
  { speedRange: [11, 15], spawnInterval: [1.0, 2.2], mix: [['sedan', 0.4], ['truck', 0.6]] },
  // Heavy slow lane — mostly trucks, occasional sedan so the middle sub-row
  // (which truck wheel-tracks can't reach with spread=4) still gets visited.
  { speedRange: [6, 9], spawnInterval: [2.0, 3.5], mix: [['truck', 0.8], ['sedan', 0.2]] },
  // Industrial: heavy mixed freight. doubleTrailer caps the wheelbase, so
  // spawnInterval is generous to keep gaps for threading.
  { speedRange: [7, 10], spawnInterval: [2.0, 3.4],
    mix: [['boxVan', 0.35], ['truck', 0.4], ['doubleTrailer', 0.25]] },
  // Fast: bikes weaving with sedans.
  { speedRange: [13, 18], spawnInterval: [0.9, 2.0],
    mix: [['motorcycle', 0.45], ['sedan', 0.55]] },
];

// --- Spawn geometry ---
export const SPAWN_MARGIN = 8;               // spawn this far past the road edge
export const DESPAWN_MARGIN = 8;             // despawn this far past opposite edge
export const MIN_SPAWN_SPACING = 2;          // extra meters beyond vehicle length

// Car-following: a vehicle whose bumper-to-bumper gap to its same-lane leader is below
// FOLLOW_GAP matches the leader's speed instead of catching up. MIN_GAP is the hard
// floor enforced after movement to prevent any visible overlap if speeds change abruptly.
export const FOLLOW_GAP = 3.0;
export const MIN_GAP = 0.4;

// --- Difficulty ramp ---
export const SPEED_RAMP_PER_LEVEL = 0.10;    // each crossing multiplies speed by 1 + this

// --- Lives & score ---
export const STARTING_LIVES = 5;

// Per-near-miss base points and combo bumps. The combo multiplier applies to the
// NEXT event's payout (not the current one); the bump compounds on top of the
// running multiplier and is capped at COMBO_CAP.
//
// THREADED requires an ACTIVE hop into the vehicle's wheelbase as it passes —
// the player has to time a jump between the wheels. SCORE_THREADED is the
// fallback for types that don't define `scoreThreaded` (see VEHICLE_TYPES);
// smaller vehicles override with a higher payout because their wheelbase gap
// is harder to land in.
//
// UNDER is the passive cousin: the frog was sitting between the wheel rows when
// the vehicle drove overhead. No hop required, so the bonus is small.
export const SCORE_THREADED = 300;
export const SCORE_UNDER = 25;
export const SCORE_GRAZED = 100;
// Daredevil: extra points layered on top of THREADED when the frog threads
// BOTH wheel-row lines of the same vehicle during a single approach (e.g.,
// hop in to under, then hop again out the other side). Flat bonus added to
// the THREADED base before the combo multiplier, so it still scales with
// streaks and Frog Focus.
export const SCORE_DAREDEVIL_BONUS = 750;
export const COMBO_BUMP_THREADED = 2.0;
export const COMBO_BUMP_GRAZED = 1.5;
export const COMBO_BUMP_BUG = 1.5;
export const COMBO_CAP = 8;
export const COMBO_DECAY_DELAY = 5.0;        // seconds idle before decay starts
export const COMBO_DECAY_TAU = 2.5;          // exponential decay time constant

// In-traffic survival milestones — only ticks while frog is on a wheel row
// (not start, not goal, not the safe between-lane stripe).
export const SURVIVAL_MILESTONES = [30, 60, 90, 120, 150, 180];
export const SURVIVAL_PAYOUTS = [500, 1000, 2000, 4000, 8000, 16000];

export const SCORE_BUG_BASE = 100;
export const CROSSING_BASE_BONUS = 250;       // bonus per level on bank

// Untouchable: awarded on a crossing if the player neither died nor used a
// Recombobulation charge during the level just completed. Flat base reward;
// consecutive Untouchable crossings add UNTOUCHABLE_STREAK_BONUS per step
// beyond the first (so 2nd in a row = base + 250, 3rd = base + 500, etc.).
// A break (death or recomb) resets the streak. If the Frog Focus skill is
// unlocked, the focus meter is also refilled to full.
export const UNTOUCHABLE_BONUS_BASE = 1000;
export const UNTOUCHABLE_STREAK_BONUS = 250;

// Near-miss proximity (used by collision.detectNearMisses).
export const GRAZE_RADIUS = 0.5;             // m beyond frog/wheel hitbox edges

export const HIGH_SCORE_KEY = 'frogger.highscore';   // legacy single-value (migrated into list on first load)
export const HIGH_SCORE_LIST_KEY = 'frogger.scores'; // top-N leaderboard, JSON array
export const LEADERBOARD_SIZE = 10;
export const MUTE_KEY = 'frogger.muted';

// --- XP / Frog level ---
// Cumulative XP to BE at level N: XP_PER_LEVEL_BASE * N * (N-1) / 2.
// So Lv 1 = 0 XP, Lv 2 = 1000, Lv 3 = 3000, Lv 4 = 6000, ...
// Banked points double as XP. Game-over wipes XP and frog level.
//
// Two distinct caps: frog level keeps climbing for score/identity all the way
// to FROG_LEVEL_CAP (the game is infinite), but skill points stop accruing
// after SKILL_POINT_CAP_LEVEL — by which point a player who picked optimally
// has 27 spent + 1 free Tongue Fu T1 = all four 7-tier branches at T7.
// Frog levels above SKILL_POINT_CAP_LEVEL still tick up + fire a "FROG LEVEL N"
// toast, but no skill picker.
export const XP_PER_LEVEL_BASE = 1000;
export const FROG_LEVEL_CAP = 99;
export const SKILL_POINT_CAP_LEVEL = 28;

// --- Bugs ---
// Placed at level start in `bugs.placeBugsForLevel`. BUG_RISK_WEIGHT = chance a
// given bug lands on a wheel-path sub-row (deadly) instead of a safe stripe.
// Count tracks lane count one-for-one — early-level players want more bugs to
// hunt while traffic is sparse, late levels still scale up through the lane
// growth curve. The base ensures even a 1-lane level (level 1) has 5 bugs.
export const BUGS_PER_LEVEL_BASE = 4;
export const BUG_RISK_WEIGHT = 0.7;
export function bugCountForLevel(level) {
  return BUGS_PER_LEVEL_BASE + laneCountForLevel(level);
}

// --- Skill branches: tier-indexed mechanic arrays ---
// Each branch has 7 tiers. Arrays are length 8 so [tier] indexes directly,
// with index 0 = unspent baseline. PLAN_SCORING.md §11 is the source of truth.

// 🥋 Tongue Fu: tongue + bug magnet + ribbit roar.
// T1 is pre-spent on every fresh run, so a baseline tongue (1 cell) is always
// active before the first picker spend.
export const TONGUE_RANGE_BY_TIER         = [0, 1, 2, 3, 3, 3, 3, 3];     // cells
export const BUG_MAGNET_RADIUS_BY_TIER    = [0, 0, 0, 3, 5, 5, 5, 5];     // m (T3+ unlocks, T4 widens)
export const BUG_SCORE_MULT_BY_TIER       = [1, 1, 1, 1, 1.5, 1.5, 1.5, 1.5];
export const ROAR_USES_BY_TIER            = [0, 0, 0, 0, 0, 1, 1, 2];     // E key uses per crossing
export const ROAR_BRAKE_DURATION_BY_TIER  = [0, 0, 0, 0, 0, 1.0, 2.0, 2.0]; // s

// 🐰 Hip Hopping: hop speed + long jump.
// Speed bumps stack at T1, T2, T4, T5, T6 (T3 spends its tier on Long Jump,
// T7 on Double Long Jump). Cumulative: 0.95^N gets faster each step.
export const HOP_DURATION_MULT_BY_TIER    = [1.0, 0.95, 0.9025, 0.9025, 0.857, 0.815, 0.774, 0.774];
export const LONG_JUMP_MULT_BY_TIER       = [1, 1, 1, 2, 2, 2, 2, 4];
// Long jumps cost more wall-clock time than a single hop so the frog isn't
// invulnerable for the same window while crossing 2× / 4× the distance.
// Keyed by LONG_JUMP_MULT (1 / 2 / 4) → time multiplier on HOP_DURATION.
export const LONG_JUMP_TIME_MULT_BY_DISTANCE = { 1: 1, 2: 1.6, 4: 3 };

// 🧘 Frogcentration: frog focus + echolocation.
export const FOCUS_DURATION_BY_TIER       = [0, 6, 8, 10, 12, 12, 12, 12]; // s at full meter
export const FOCUS_PASSIVE_RECHARGE_BY_TIER = [0, 0, 0, 0.025, 0.05, 0.05, 0.05, 0.05]; // /s when not focused
export const ECHO_TIER_BY_TIER            = [0, 0, 0, 0, 0, 1, 2, 3];     // 0=off, 1/2/3=L1/L2/L3

// 🎩 Hocus Croakus: recombobulation + psychedelic sight + plague of frogs.
export const RECOMB_CAP_BY_TIER           = [0, 1, 2, 3, 3, 3, 3, 3];     // charge refill cap
export const SIGHT_TIER_BY_TIER           = [0, 0, 0, 0, 1, 2, 3, 3];     // 0=off, 1/2/3=L1/L2/L3

// --- Tongue flick (visual + capsule constants) ---
export const TONGUE_CAPSULE_RADIUS = 0.5;
export const TONGUE_COOLDOWN = 0.32;
export const TONGUE_FLICK_DURATION = 0.18;     // extend (0..0.35) → hold (0.35..0.65) → retract (0.65..1.0)
// Bug Magnet drift speed (radius is per-tier above):
export const BUG_MAGNET_DRIFT_SPEED = 0.5;

// --- Frog Focus (FX + meter constants — duration is per-tier above) ---
// Press-F-to-toggle time-slow. Vehicles, spawner, and engine pitch slow to
// WORLD_TIME_SCALE_FOCUS; frog hop and input run at normal speed (the player's edge).
// Meter fills on near-miss / bug events and drains while focus is engaged. When
// the meter empties, focus auto-disengages and the player must press F again
// after refilling.
export const WORLD_TIME_SCALE_FOCUS = 0.35;
export const FOCUS_NEAR_MISS_MULT = 2;       // base score multiplier on near-miss while focused
export const FOCUS_FILL_THREADED = 0.4;
export const FOCUS_FILL_GRAZED = 0.2;
// Bugs are deliberately placed on deadly rows (~70%), so collecting one is a
// real risk expression — bumped from the original 0.15 so a level's worth of
// bugs (typically 4) can get a careful player to a full meter on its own.
export const FOCUS_FILL_BUG = 0.30;
export const FOCUS_ENGINE_LOWPASS_HZ = 350;  // engine voices LP cutoff while focused (default 800)

// --- Recombobulation (cutscene timings — cap is per-tier above) ---
// Charges absorb a fatal hit instead of consuming a life. Splat → unsplat cutscene
// plays; frog resumes at the same row+cellX it died on. Charges refill to the
// tier cap at the start of every game level — unused charges don't carry over.
export const RECOMB_CUTSCENE_DURATION = 1.5;          // s — total cutscene length
export const RECOMB_SQUASH_DURATION  = 0.35;          // s — splat-down phase
export const RECOMB_HOLD_DURATION    = 0.30;          // s — flat hold

// --- Long Jump (binding constants — multiplier is per-tier above) ---
// Shift + WASD multiplies hop distance via skills.longJumpMult().
// Hop duration scales by LONG_JUMP_TIME_MULT_BY_DISTANCE (1× → 1, 2× → 1.6, 4× → 3),
// so a long jump isn't strictly faster — it covers more ground per hop but the
// vulnerable window grows too, keeping the skill from trivializing wheel rows.
// Arc height scales by sqrt(distance multiplier).
// Long hops clamp to playfield edges instead of being rejected.
// (Was originally Ctrl + WASD — but Ctrl+W closes the browser tab and pages
// can't preventDefault on OS-level shortcuts, so we use Shift instead.)

// --- Audio ---
export const APPROACH_PITCH = 0.35;          // max playbackRate bump for a closing vehicle
export const MAX_AUDIBLE_DISTANCE = 60;      // meters, beyond this engine gain is 0
export const ENGINE_POOL_SIZE = 8;

// --- Intro flythrough ---
export const INTRO_DURATION = 2.6;           // seconds for the top-down → frog-eye descent
export const INTRO_START_POS = [0, 28, 9];   // world-space camera start (high & slightly behind)

// --- Death cutscene ---
// 3rd-person splat replay shown after a killing collision (when lives remain).
// Camera detaches from the frog, snaps to a 3/4 aerial view of the impact, and
// orbits slightly while the frog mesh squashes flat and blood spreads.
export const DEATH_CUTSCENE_DURATION = 1.4;   // total seconds for the cutscene
export const DEATH_CAM_HEIGHT = 1.6;          // initial camera Y above the splat
export const DEATH_CAM_RADIUS = 1.9;          // initial camera distance from impact (XZ)
export const DEATH_CAM_ORBIT = Math.PI / 8;   // radians swept during the cutscene
export const DEATH_BLOOD_COLOR = 0xb01818;
export const DEATH_DROPLET_COUNT = 14;

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
  return Math.max(1, Math.ceil(level / LEVELS_PER_LANE_STEP));
}
export function totalSubRowsForLevel(level) {
  return laneCountForLevel(level) * SUB_ROWS_PER_LANE;
}
export function goalRowForLevel(level) {
  return totalSubRowsForLevel(level) + 1;
}
// First level at which chaos modifiers start kicking in. Used to be the lane-count
// cap; now lanes scale forever and this just gates the chaos ramp.
export const CHAOS_START_LEVEL = 16;

// Rush-hour override: at level 30+, each crossing has a chance of forcing every
// lane in one direction. Levels 30–49 always pick eastbound (single option in
// the roll); level 50+ rolls eastbound or westbound (both options).
export const RUSH_HOUR_MIN_LEVEL = 30;
export const RUSH_HOUR_BIDIR_LEVEL = 50;
export const RUSH_HOUR_PROB_SINGLE = 0.25;
export const RUSH_HOUR_PROB_BIDIR  = 0.35;

// East lane count for a given total lane count. East lanes go at low laneIndex; west
// lanes fill the remainder.
export function eastCountForLanes(n) {
  return Math.max(0, Math.ceil(n / 2));
}

// Picks a rush-hour direction for the given level, or null if it doesn't fire.
// Returns +1 (eastbound) or -1 (westbound).
function pickRushHour(level) {
  if (level < RUSH_HOUR_MIN_LEVEL) return null;
  if (level >= RUSH_HOUR_BIDIR_LEVEL) {
    if (Math.random() >= RUSH_HOUR_PROB_BIDIR) return null;
    return Math.random() < 0.5 ? +1 : -1;
  }
  if (Math.random() >= RUSH_HOUR_PROB_SINGLE) return null;
  return +1;
}

// --- Build the LANES config for a given level ---
// Returns { lanes, rushHour }. `rushHour` is +1/-1 if the rush-hour override
// fired (every lane forced to that direction, chaos flips suppressed), else null.
//
// Levels 1..CHAOS_START_LEVEL-1: clean East-then-West pattern, templates cycled per lane.
// Levels >= CHAOS_START_LEVEL:
//   - each lane's direction has a flipProbability of being inverted (chaos),
//   - spawnInterval shrinks (denser traffic).
// Levels >= RUSH_HOUR_MIN_LEVEL: rush-hour override may fire (see pickRushHour).
export function buildLanesForLevel(level) {
  const count = laneCountForLevel(level);
  const east = eastCountForLanes(count);

  const excess = Math.max(0, level - CHAOS_START_LEVEL);
  const flipProbability = Math.min(0.65, excess * 0.04); // 0%..65% per lane
  const densityMult = excess > 0 ? Math.max(0.30, 1 - excess * 0.04) : 1;

  const rushHour = pickRushHour(level);

  const lanes = [];
  for (let i = 0; i < count; i++) {
    let direction;
    if (rushHour !== null) {
      direction = rushHour;
    } else {
      direction = i < east ? +1 : -1;
      if (flipProbability > 0 && Math.random() < flipProbability) direction = -direction;
    }

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
  return { lanes, rushHour };
}
