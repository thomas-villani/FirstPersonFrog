# Architecture

Runtime reference for First-Person Frog. Read this when you need to understand how the modules fit together before changing one. For build-time decisions and design vision, see [`PLAN.md`](./PLAN.md), [`PLAN_SCORING.md`](./PLAN_SCORING.md), and [`frogger-fps-spec.md`](./frogger-fps-spec.md). For locked-in decisions worth not relitigating, see [`CLAUDE.md`](../CLAUDE.md). For per-tunable explanations of `src/config.js`, see [`CONFIGURATION.md`](./CONFIGURATION.md).

## Game state machine

`Game` in `game.js` is the top-level owner. Five states:

| State | Updates | Camera owner | Triggered by |
|---|---|---|---|
| `PAUSED` | none | frog | initial load, Esc release, lock loss |
| `INTRO` | spawner + audio + intro tween | scene (animated) | first pointer-lock acquisition only |
| `PLAYING` | everything | frog | normal gameplay |
| `DYING` | spawner + audio + cutscene | `DeathCutscene` | fatal hit while lives > 0 |
| `GAMEOVER` | none | frog (frozen) | fatal hit on last life |

Transitions:
- `PAUSED → INTRO` on first pointer-lock; `PAUSED → PLAYING` on subsequent acquires.
- `INTRO → PLAYING` after the `INTRO_DURATION` (2.6s) top-down → frog-eye descent finishes.
- `PLAYING → DYING` when `checkCollision` returns a vehicle.
- `DYING → PLAYING` on cutscene completion if lives remain; `DYING → GAMEOVER` if `score.onDeath()` flagged the final life.
- `GAMEOVER → PLAYING` on overlay click — `Game` wipes run state, rebuilds level 1.

The cinematic intro fires **once per session**. Resuming from pause skips it.

## Per-frame update flow (PLAYING)

```
Game.update(dt)
  frog.update(dt)                        # tween hop, head-bob, dead-timer
  spawner.update(dt)                     # car-following, spawn, despawn
  bugs.update(dt)                        # rotate beetle bodies
  tongue.update(dt)                      # animate flick, decay cooldown
  _pumpLevelUpToasts(dt)                 # drain queued unlock toasts

  score.update(dt, inTraffic)            # combo decay + survival milestones

  hit = checkCollision(frog, vehicles)
  if hit:
    score.onDeath() → _beginDeathCutscene
  else:
    nearMisses = detectNearMisses(...)   # one event per vehicle on transition
    score.addNearMiss(...) per event
    if frog.row === goalRow:
      score.bankCrossing(level)          # bank pending, accrue XP
      drainLevelUps() → toasts; if any ≤ SKILL_POINT_CAP_LEVEL:
        state = SKILLPICK; show picker; defer until 1-4 spent
      _buildLevel(level + 1)             # rebuild scene; camera survives

  hud.renderScore / renderCombo / renderFrogLevel
  audio.updateEngines(frog, vehicles)    # per-vehicle doppler
```

`Game.render()` runs after `update()` each frame. The RAF loop with capped variable dt lives in `main.js` (`dt = min((now - last)/1000, 1/30)`).

## Coordinate system

Canonical reference is in [`CLAUDE.md`](../CLAUDE.md). Quick recap:

- +Y up, +X right, **−Z forward** (toward the goal).
- Each lane has `SUB_ROWS_PER_LANE = 8` sub-rows; world Z = `-row * SUB_ROW_DEPTH` (0.5m per sub-row).
- Frog X = `cellX * CELL_WIDTH`, clamped to `±STRAFE_MAX`.
- Vehicles store two `wheelRows` (the wheel-path Z lines); `z` is their midpoint. The strip between the two rows is a **survivable body-gap** — the frog can land between axles.
- The last sub-row of every lane sits exactly on the between-lane safe stripe. `spawner` constrains wheels to never occupy it.

## Modules

### Foundation

- **`main.js`** — bootstraps `Game` and runs the RAF loop.
- **`config.js`** — every tunable plus the per-level builders: `laneCountForLevel`, `goalRowForLevel`, `buildLanesForLevel`. Lane count is uncapped (`ceil(level / 2)`). At level 16 (`CHAOS_START_LEVEL`), per-lane direction flips and denser spawn intervals start ramping in. At level 30+ the rush-hour override may fire (every lane forced to one direction); `buildLanesForLevel` returns `{ lanes, rushHour }`.
- **`game.js`** — owns the state machine, the scene rebuild on every crossing (`_buildLevel`), the intro tween, and the death-cutscene handoff. The camera is created once and re-parented across rebuilds, so player yaw/pitch persist across level transitions.

### Player

- **`frog.js`** — `IDLE | HOPPING | DEAD` state machine. Hop is `HOP_HEIGHT * sin(π·t)` arc + eased XZ lerp over `HOP_DURATION`. Hard-commit input: `tryHop` rejects mid-hop. The camera is parented to the frog group, so the arc moves the eye automatically. Head-bob is a damped impulse on landing — not during the arc itself.
- **`input.js`** — keyboard, pointer-lock, mouse-look. WASD direction is derived from `_facingAxes()`: yaw is snapped to the nearest 90° quadrant, with `FACING_Z_BIAS = 0.18` widening the −Z and +Z zones to ~53° on each side so a partial head-turn doesn't flip forward intent into strafing.
- **`tongue.js`** — first-person tongue projectile. Range = `skills.tongueRange() * CELL_WIDTH`; capsule hit-test against `BugManager.tryCollectInCapsule`. Renders with `depthTest=false` and `renderOrder=999` so it draws over everything (HUD-like). Animation phases inside `TONGUE_FLICK_DURATION`: extend (0–0.35), hold (0.35–0.65), retract (0.65–1.0). `TONGUE_COOLDOWN` between flicks.

### World

- **`world.js`** — `buildWorld(laneCount)` + `disposeScene(scene)`. Builds road, start/goal medians, lane stripes (lifted to `y = 0.01` to avoid z-fighting), pebble dot-markers (placed at half-cell offsets so the frog always lands **between** dots), random flat garbage, pond ellipse, trees, fog, and lights.
- **`vehicles.js`** — `Vehicle` mesh = body box + 4 wheel cylinders. The 4 wheels' world AABBs **are** the kill hitboxes; the body just provides visual mass and bounds the safe Z gap. `nearMiss` substate (`tier`, `lastSign`, `threadedHop`) is mutated by `collision.detectNearMisses`.
- **`spawner.js`** — per-lane spawn timers; weighted vehicle-type rolls; car-following (a vehicle whose bumper-to-bumper gap to its leader is below `FOLLOW_GAP` matches the leader's speed instead of catching up); a hard `MIN_GAP` floor enforced after each frame's movement. `prePopulate(perLane)` seeds the road from level 2 onward so a fresh level isn't a free 10-second head start. Level 1 stays clean (matches the cinematic intro).
- **`collision.js`** — two pure functions, both stateless except for what they mutate on `vehicle.nearMiss`:
  - `checkCollision(frog, vehicles)` — AABB frog vs. each of the 4 wheels per vehicle. Returns the offending vehicle or `null`. Mid-hop is **not** invincible.
  - `detectNearMisses(frog, vehicles)` — stateful per-vehicle approach tracker. Fires one event per approach→pass transition (when `approachingSign` flips from positive to ≤0). `THREADED` supersedes `UNDER`/`GRAZED` if the frog actively hopped through a wheel-row line within the wheelbase. `GRAZED` is suppressed on safe ground.

### Items & UX

- **`bugs.js`** — `BugManager.placeBugsForLevel(level, scene)` scatters `BUGS_PER_LEVEL` beetles across the level with `BUG_RISK_WEIGHT` favoring wheel-path placement (dangerous). Each bug is a Group of meshes (body + head + eyes + legs + antennae) that spins slowly so it's visible from a 5cm POV. `tryCollectAt(row, cellX)` is the mercy auto-collect on landing; `tryCollectInCapsule(origin, dir, length, radius)` is the tongue's hit-test.
- **`score.js`** — lives, two score buckets (`pending` per-level, `banked` cumulative), combo multiplier, in-traffic survival timer, XP, frog level. `bankCrossing(level)` moves pending into banked and accrues XP; level-ups are queued for the HUD/skills to drain. `onDeath()` returns `true` on the final life. High score persists in `localStorage` under `HIGH_SCORE_KEY`.
- **`skills.js`** — RPG branch tree: 4 branches (`tongueFu`, `hipHopping`, `frogcentration`, `hocusCroakus`) × 7 tiers each. State = `{ branchId → tier 0..7 }`; `tongueFu = 1` is pre-spent on every fresh run. `spend(branchId)` advances by one tier (forced sequential). Per-mechanic helpers (`tongueRange`, `canFrogFocus`, `recombCap`, `longJumpMult`, …) hide the branch-tier → array-lookup wiring; feature code never compares tiers to magic numbers. `BRANCH_META`/`BRANCH_ORDER` exports drive the picker UI. Game-over calls `reset()` to restore the fresh-run baseline.
- **`hud.js`** — DOM HUD wrapping every `#`-selector in `index.html`. Score, high score, combo, lives icons, frog level + XP bar, near-miss counter, milestone toasts, level-up toasts, damage flash, overlay text. State lives in the DOM; `Hud` is a thin renderer.
- **`death.js`** — `DeathCutscene` instance, owned by `Game` for the duration of the splat. Detaches camera from the frog group, orbits it around the impact, animates body squash + ballistic eyes + spreading blood disk + ballistic droplets. `update(dt)` returns `true` when finished. Lasts `DEATH_CUTSCENE_DURATION`.
- **`audio.js`** — `AudioManager`. Single `AudioContext`, resumed on the overlay click (the same gesture that requests pointer lock). One-shots are layered noise + oscillators (no asset files). Engines are pooled (cap `ENGINE_POOL_SIZE = 8`) sawtooth oscillators per vehicle; `updateEngines(frog, vehicles)` ticks per-vehicle distance-based gain and approach-sign pitch shift.

## Scoring at a glance

| Event | Base | Combo bump | Notes |
|---|---|---|---|
| `THREADED` | per-vehicle (`scoreThreaded`) | ×2.0 | active hop **through** the wheelbase Z gap |
| `UNDER` | 25 | none | passive — sit between axles, vehicle drives over |
| `GRAZED` | 100 | ×1.5 | wheel within hitbox + `GRAZE_RADIUS` |
| Bug pickup | 100 | ×1.5 | mercy auto-collect or tongue hit |
| Survival | 500 / 1k / 2k / 4k / 8k / 16k | none | at 30 / 60 / 90 / 120 / 150 / 180s in traffic |
| Crossing | 250 × level | combo resets to 1× | bonus banked into the pending bucket first |

Combo is capped at `COMBO_CAP = 8`, decays exponentially after `COMBO_DECAY_DELAY = 5s` of idleness with time constant `COMBO_DECAY_TAU = 2.5s`. Multiplier applies to the **next** event — so the first near-miss in a chain pays its base value, not a bumped one.

`UNDER` is a passive flat bonus and intentionally does **not** apply or bump the combo: without that, sitting in a safe Z gap while traffic streams overhead would farm combo for free.

XP equals banked points. Cumulative XP to be at level N: `XP_PER_LEVEL_BASE × N × (N-1) / 2` with base = 750. So Lv 1 = 0, Lv 2 = 750, Lv 3 = 2,250, Lv 4 = 4,500…. Frog level is capped at `FROG_LEVEL_CAP` (99) — the game is infinite, the level just keeps climbing for score/identity. **Skill points** stop at `SKILL_POINT_CAP_LEVEL` (28); levels 29–99 still toast but skip the picker. Game-over wipes XP, frog level, and branch tiers (Tongue Fu T1 is re-pre-spent on every new run).

## Audio architecture

- One shared `AudioContext`, created/resumed on the user-gesture overlay click. `audio.suspend()` is called on pointer-lock loss so engines don't hum under the pause overlay.
- One-shots (`playHop`, `playSquish`, `playPickup`, `playTongueFlick`, `playLevelUp`, `playWin`) build short noise/oscillator graphs from scratch each call — no buffer caching, the graphs are tiny.
- Per-vehicle engines: a single sawtooth oscillator → lowpass filter → gain → master, attached on spawn (`audio.attachEngine`), detached on cull. The pool cap is hard — over the cap, new vehicles spawn silent (rare in practice).
- Each frame in `updateEngines(frog, vehicles)`:
  - `distance = |vehicle.x - frog.x|` along the lane.
  - `approachingSign = sign((vehicle.x - frog.x) * -vehicle.direction)`.
  - `playbackRate = 1 + APPROACH_PITCH × approachingSign × clamp(1 - distance / MAX_AUDIBLE_DISTANCE, 0, 1)`.
  - `gain` rolls off with distance, capped low.

Engine doppler is **load-bearing for fairness** — silent approaching trucks are unplayable. Tune before deleting.

## DOM HUD

`index.html` defines the slots; `hud.js` writes to them. IDs:

- `#canvas` — render target.
- `#overlay`, `#flash` — full-screen overlays (start/pause/game-over, damage flash).
- `#left-hud` — `LIVES` label + `#lives-icons`, `#frog-level`, `#xp-bar` containing `#xp-bar-fill`, `#skill-badges` (per-branch tier counters), `#recomb-row` (when unlocked).
- `#hud` (top-right) — `#score`, `#high-score`, `#combo` (inside `#combo-row`), `#near-miss-count`.
- `#level` — top-center "LEVEL N".
- `#toast`, `#milestone-toast`, `#level-up-toast` — the three toast slots, animated separately so multiple events don't visually stack.
- `#skill-picker` — modal shown during SKILLPICK state. `.sp-option` rows are keyed 1–4; greyed-out at T7. Hidden via `.hidden` class.

## Adding things

The summary version (full version in `CLAUDE.md` under "How to extend"):

- **New vehicle type:** add an entry to `VEHICLE_TYPES` in `config.js` and reference it from a lane's `mix`. `wheelRowSpread` must fit inside `SUB_ROWS_PER_LANE`. Add an `ENGINE_BASE_FREQ` entry in `audio.js` if a distinct engine pitch is wanted.
- **New skill tier mechanic:** edit the relevant `_BY_TIER` array in `config.js` and update the helper in `skills.js` if a new helper is needed. Update the matching `BRANCH_META.tierLabels[]` entry so the picker reads correctly. Feature code reads through helpers (`skills.tongueRange()`, `skills.recombCap()`, etc.) rather than referencing tiers directly.
- **New SFX:** add a `playFoo` method to `AudioManager` synthesizing via oscillators/noise — follow `playHop`, `playSquish`, `playWin` as patterns.
- **New HUD element:** add the slot to `index.html` and a `renderFoo`/`onFoo` method to `Hud`.
- **New lane behaviour:** lanes are built from `LANE_TEMPLATES` cycled per lane in `config.js`. Add a template entry, or change `buildLanesForLevel` for level-dependent behaviour.

## Things not to relitigate

These have been decided and playtested. Don't undo them without a fresh playtest and a written reason.

- **Hard-commit input.** No buffering of mid-hop keypresses. Once committed, the player is committed.
- **Wheels kill, bodies don't.** Mid-air is not invincible. The body gap between axles is intentionally survivable.
- **Hop arc stays under wheel-top.** `HOP_HEIGHT` is tuned so the frog never visually clips through a vehicle body during a wheel-row pass.
- **Near plane is 0.02m.** The camera is 5cm off the ground; raising the near plane causes asphalt clipping.
- **Engine audio is the gameplay cue.** A silent approaching truck is unplayable.
- **No user-visible frog mesh during play.** The camera *is* the frog. The intro is the only time the frog mesh is rendered.
