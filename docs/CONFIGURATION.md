# Configuration

Every gameplay-tunable number lives in [`src/config.js`](../src/config.js). This doc is a tour of what's in there, grouped by what you'd actually want to change. The file itself has more inline detail per constant — this is the map.

If you're running the dev server (`npm run dev`), Vite hot-reloads `config.js` on save: most tweaks are visible the moment you save the file. Some changes (vehicle dimensions, lane count math) only take effect on the next world rebuild — i.e., the next crossing or game restart.

---

## How to tune safely

- **Tweak one thing at a time.** Half the constants couple to others. If you bump `LANE_WIDTH` you also affect hop math, vehicle scale, near-miss radii, and audio rolloff distance.
- **Numbers in meters.** The world is metric. Vehicles are intentionally building-sized at 5cm eye height — that's the joke, not a bug. Resist the urge to "right-size" vehicles.
- **Some constants are load-bearing for fairness.** They're called out below.
- **A few things are NOT in `config.js`** because changing them would break the design intent — read the "Things not to relitigate" section of [`ARCHITECTURE.md`](./ARCHITECTURE.md) before reaching for the engine.

---

## Spatial units

```js
LANE_WIDTH        = 4     // depth of one road lane (m)
SUB_ROWS_PER_LANE = 8     // grid points across a lane
SUB_ROW_DEPTH     = 0.5   // forward hop distance (derived)
CELL_WIDTH        = 1.2   // strafe hop distance (m)
ROAD_LENGTH       = 200   // visible X stretch (m)
STRAFE_MAX        = 8     // max |cellX|, ~9.6m sideways
```

Each lane is divided into 8 sub-rows. The frog hops one sub-row per forward hop (0.5m). The **last sub-row of every lane is the safe between-lane stripe** — the spawner constrains wheels so they can never land on it. Don't change `SUB_ROWS_PER_LANE` casually: vehicle wheel-row spreads are tuned against it.

---

## Camera

```js
CAMERA_EYE_HEIGHT = 0.05  // 5 cm — the entire premise
FOV               = 95
NEAR_PLANE        = 0.02  // load-bearing — see ARCHITECTURE.md
FAR_PLANE         = 200
PITCH_CLAMP       = ±85°
```

`NEAR_PLANE = 0.02` is intentional. Raise it and the camera clips through asphalt at grazing angles. Don't.

---

## Frog physics

```js
HOP_DURATION    = 0.22    // seconds per sub-row hop
HOP_HEIGHT      = 0.18    // arc apex (m) — must stay UNDER vehicle bodies
FROG_HITBOX     = 0.3     // AABB cube
GROUND_THRESHOLD = 0.05   // y above which frog reads as airborne
```

`HOP_HEIGHT` is the trickiest one. If you raise it, the frog visually clips through truck bodies on a wheel-row pass. The wheel-only collision model already lets the frog survive between axles; the arc just needs to stay below vehicle clearance.

`HOP_DURATION` directly controls how punishing the wheel-row windows feel. Faster = easier; slower = more tense.

Head-bob (`HEAD_BOB_AMPLITUDE`, `HEAD_BOB_DECAY_MS`) is purely cosmetic.

---

## Level progression

```js
LEVELS_PER_LANE_STEP = 2       // 2 levels per lane added
CHAOS_START_LEVEL    = 16      // chaos modifiers start ramping
RUSH_HOUR_MIN_LEVEL  = 30      // single-direction rush hour can fire
RUSH_HOUR_BIDIR_LEVEL = 50     // both directions in the rush-hour roll
RUSH_HOUR_PROB_SINGLE = 0.25
RUSH_HOUR_PROB_BIDIR  = 0.35
SPEED_RAMP_PER_LEVEL = 0.10    // speeds × 1.10 each crossing
```

Lane count is `ceil(level / LEVELS_PER_LANE_STEP)`, **uncapped**. Levels 1–2 → 1 lane, 31–32 → 16 lanes, 49–50 → 25 lanes, ad infinitum.

`CHAOS_START_LEVEL` gates two ramps:
- per-lane direction-flip probability (up to 65%)
- spawn-interval shrink (down to 30% of base)

Both ramp linearly with `level - CHAOS_START_LEVEL`. To make the ramp gentler, raise `CHAOS_START_LEVEL`; to make it brutal earlier, lower it.

Rush-hour is a per-crossing roll past level 30 that forces every lane in one direction. `pickRushHour(level)` is where the roll lives if you want different probabilities or directions.

---

## Vehicle types

`VEHICLE_TYPES` is a registry. To add a vehicle, add an entry; reference it from a lane template's `mix`.

Required fields per type:
- `size: { L, W, H }` — meters
- `color` — hex
- `wheelRadius`, `wheelWidth`
- `wheelRowSpread` — how many sub-rows between the two wheel-path lines (constrains the wheelbase Z gap)
- `scoreThreaded` — payout when the frog threads this vehicle's wheelbase

Optional fields:
- `axleXs` — array of local-X axle positions for >2 axles (road trains)
- `singleTrack` — true for motorbikes (1 wheel per axle, on lane centerline)
- `bodyWidth` — visual override
- `bodyParts` — array of `{length, gap, color, height}` for multi-section bodies (cab + trailers)

The five built-in types: `sedan`, `truck`, `boxVan`, `motorcycle`, `doubleTrailer`.

**Wheel-row spread tuning:** with `SUB_ROWS_PER_LANE = 8`, a lane has 7 deadly sub-rows + 1 safe stripe. Sedan/boxVan use spread=3, truck=4, doubleTrailer=5. Motorcycle is `singleTrack` and collapses to one centerline. If you change a spread, verify the lane templates that include it still cover every deadly sub-row — otherwise you create a "safe middle row" exploit.

---

## Lane templates

`LANE_TEMPLATES` is a list of per-lane traffic flavors. `buildLanesForLevel(level)` cycles through them so each lane in a multi-lane level feels different.

Each template:
```js
{
  speedRange:    [min, max],   // m/s
  spawnInterval: [min, max],   // seconds between spawns
  mix: [['sedan', 0.7], ['truck', 0.3]],   // weighted picker
}
```

Template 0–4 are the original MVP feel. Templates 5–6 (industrial freight, fast bike+sedan) only show up once levels reach lane index 5+. Adding a new template = pushing to the array.

---

## Scoring

Near-miss tiers and combo:
```js
SCORE_THREADED         = 300    // fallback; per-vehicle scoreThreaded overrides
SCORE_UNDER            = 25     // passive, no combo bump
SCORE_GRAZED           = 100
SCORE_DAREDEVIL_BONUS  = 750    // threading both wheel-rows in one approach
SCORE_BUG_BASE         = 100
CROSSING_BASE_BONUS    = 250    // × level

COMBO_BUMP_THREADED = 2.0
COMBO_BUMP_GRAZED   = 1.5
COMBO_BUMP_BUG      = 1.5
COMBO_CAP           = 8
COMBO_DECAY_DELAY   = 5.0       // seconds idle before decay starts
COMBO_DECAY_TAU     = 2.5       // exponential decay time constant
```

The combo multiplier applies to the **next** event, not the current one. UNDER is a passive flat bonus — it does **not** apply or bump combo by design (otherwise sitting in a safe Z gap while traffic streams overhead would farm combo for free).

Survival milestones (timer ticks only on wheel-row sub-rows, not on safe stripes):
```js
SURVIVAL_MILESTONES = [30, 60, 90, 120, 150, 180]   // seconds in traffic
SURVIVAL_PAYOUTS    = [500, 1000, 2000, 4000, 8000, 16000]
```

Untouchable bonus (no death + no Recombobulation use during the level):
```js
UNTOUCHABLE_BONUS_BASE   = 1000
UNTOUCHABLE_STREAK_BONUS = 250    // added per consecutive Untouchable beyond the first
```

`GRAZE_RADIUS = 0.5` controls how generously a wheel near-miss is tagged.

---

## XP and frog level

```js
XP_PER_LEVEL_BASE      = 1000   // cumulative-to-level-N: BASE × N × (N-1) / 2
FROG_LEVEL_CAP         = 99     // level keeps climbing for score/identity
SKILL_POINT_CAP_LEVEL  = 28     // last level that earns a skill point
```

So Lv 1 = 0 XP, Lv 2 = 1,000, Lv 3 = 3,000, Lv 4 = 6,000, …

The two caps are deliberately separate. Frog level keeps climbing for identity and score; skill points stop at 28 (by which point the optimal player has all four 7-tier branches at T7). Levels 29–99 still toast but skip the picker.

To make leveling faster, drop `XP_PER_LEVEL_BASE`. To compress the skill curve, drop `SKILL_POINT_CAP_LEVEL` (this changes how many spends are needed to max out, so make sure it stays consistent with 4 branches × 7 tiers − 1 free = 27).

---

## Bugs

```js
BUGS_PER_LEVEL_BASE = 4
BUG_RISK_WEIGHT     = 0.7    // chance a bug spawns on a deadly sub-row
bugCountForLevel(level) = BUGS_PER_LEVEL_BASE + laneCountForLevel(level)
```

70% of bugs land on wheel-paths by design — collecting one is a real risk expression. Drop `BUG_RISK_WEIGHT` to make bug runs friendlier.

---

## Skills (per-tier mechanic arrays)

Each branch has 7 tiers + index 0 (unspent baseline). All arrays are length 8 so `array[tier]` indexes directly. The source of truth for what each tier should do is `docs/PLAN_SCORING.md` §11.

**🥋 Tongue Fu** (T1 pre-spent on every fresh run):
- `TONGUE_RANGE_BY_TIER` — cells of reach
- `BUG_MAGNET_RADIUS_BY_TIER` — meters; 0 below T3
- `BUG_SCORE_MULT_BY_TIER`
- `ROAR_USES_BY_TIER`, `ROAR_BRAKE_DURATION_BY_TIER`

**🐰 Hip Hopping**:
- `HOP_DURATION_MULT_BY_TIER` — multiplier on `HOP_DURATION` (lower = faster hops)
- `LONG_JUMP_MULT_BY_TIER` — distance multiplier (1, 2, 4)
- `LONG_JUMP_TIME_MULT_BY_DISTANCE` — time scale per distance multiplier (`{1:1, 2:1.6, 4:3}`); long jumps are slower per-meter so they don't trivialize wheel rows

**🧘 Frogcentration**:
- `FOCUS_DURATION_BY_TIER` — seconds at full meter
- `FOCUS_PASSIVE_RECHARGE_BY_TIER` — units/s when not focused
- `ECHO_TIER_BY_TIER` — 0 off, 1/2/3 echolocation levels

**🎩 Hocus Croakus**:
- `RECOMB_CAP_BY_TIER` — Recombobulation charges
- `SIGHT_TIER_BY_TIER` — psychedelic sight levels

Feature code reads through helpers in `skills.js` (`skills.tongueRange()`, `skills.recombCap()`, etc.) — if you add a new tier or rebalance, just update the array.

Related Frog Focus tunables:
```js
WORLD_TIME_SCALE_FOCUS  = 0.35   // world slowdown while focused
FOCUS_NEAR_MISS_MULT    = 2      // base score mult on near-miss while focused
FOCUS_FILL_THREADED     = 0.4
FOCUS_FILL_GRAZED       = 0.2
FOCUS_FILL_BUG          = 0.30
FOCUS_ENGINE_LOWPASS_HZ = 350    // engine LP cutoff while focused
```

Tongue flick visuals:
```js
TONGUE_CAPSULE_RADIUS  = 0.5
TONGUE_COOLDOWN        = 0.32
TONGUE_FLICK_DURATION  = 0.18
BUG_MAGNET_DRIFT_SPEED = 0.5
```

Recombobulation cutscene:
```js
RECOMB_CUTSCENE_DURATION = 1.5
RECOMB_SQUASH_DURATION   = 0.35
RECOMB_HOLD_DURATION     = 0.30
```

---

## Audio

```js
APPROACH_PITCH        = 0.35   // max playbackRate bump for a closing vehicle
MAX_AUDIBLE_DISTANCE  = 60     // beyond this engine gain is 0
ENGINE_POOL_SIZE      = 8      // hard cap on simultaneous engine voices
```

Engine doppler is **load-bearing for fairness** — a silent approaching truck is unplayable. If you raise traffic density, you may need to raise the engine pool too.

---

## Visuals: fog, biomes, decorations

Fog is biome-driven; baseline `FOG_START / FOG_END` are overridden by the picked theme each level rebuild.

```js
SKY_COLOR  = 0x87ceeb
FOG_START  = 15
FOG_END    = 80
```

`THEMES` defines four biomes (meadow, suburb, mountain, desert). Each carries sky color, grass color, fog range, tree count, and toggles for buildings/mountains/cacti. Level 1 is locked to `meadow` so the cinematic intro stays consistent. Add a biome by adding a `THEMES` entry; `pickThemeForLevel` will roll it in.

Road decoration knobs:
- `PEBBLE_*` — Bott's-dot markers between lanes (one per cellX, low so they don't occlude oncoming traffic)
- `GARBAGE_COUNT` / `GARBAGE_TYPES` — flattened decorative litter
- `ROCK_COUNT_*`, `ROCK_RADIUS_RANGE` — 3D rocks on/off road
- `OBSTACLE_TYPES`, `OBSTACLES_PER_LEVEL_*` — **blocking** litter on safe stripes (these reserve cells; the frog has to strafe around them)

Off-road scenery:
- `FAR_GRASS_*`, `POND_*`, `TREE_*`, `TREE_COUNT_PER_SIDE`

Central guardrail (≥4-lane roads, decorative — collision ignores it):
- `DIVIDER_RAIL_*`, `DIVIDER_POST_*`

---

## Cutscenes

Intro flythrough (top-down → frog-eye, fires once per session):
```js
INTRO_DURATION  = 2.6
INTRO_START_POS = [0, 28, 9]
```

Death cutscene (3rd-person splat replay, plays when lives remain):
```js
DEATH_CUTSCENE_DURATION = 1.4
DEATH_CAM_HEIGHT        = 1.6
DEATH_CAM_RADIUS        = 1.9
DEATH_CAM_ORBIT         = π/8
DEATH_BLOOD_COLOR       = 0xb01818
DEATH_DROPLET_COUNT     = 14
```

---

## Persistence keys

```js
HIGH_SCORE_KEY       = 'frogger.highscore'   // legacy single-value
HIGH_SCORE_LIST_KEY  = 'frogger.scores'      // top-N leaderboard, JSON
LEADERBOARD_SIZE     = 10
MUTE_KEY             = 'frogger.muted'
```

Change these only if you want to reset all browsers' high scores at once (or namespace a fork).

---

## Helper functions exported from `config.js`

These are the level→world functions. If you fork the difficulty curve, this is where the math lives:

- `rowToZ(row)` — sub-row index → world Z
- `cellXToWorldX(cellX)` — strafe cell → world X
- `laneFirstRow(laneIndex)` — first sub-row owned by a lane
- `laneCountForLevel(level)` — how many lanes at level N
- `totalSubRowsForLevel(level)`
- `goalRowForLevel(level)` — the row that triggers a crossing
- `eastCountForLanes(n)` — how many lanes are eastbound in a level with `n` lanes
- `bugCountForLevel(level)`
- `pickThemeForLevel(level)`
- `buildLanesForLevel(level)` — returns `{ lanes, rushHour }`; the per-crossing world spec
