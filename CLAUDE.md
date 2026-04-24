# CLAUDE.md

Project orientation for Claude Code sessions.

## What this is

First-person Frogger browser game — single-player MVP scaffold. Read in this order when resuming:

1. [`frogger-fps-spec.md`](./frogger-fps-spec.md) — the design vision (tone, multiplayer stretch, river level).
2. [`PLAN.md`](./PLAN.md) — the MVP build spec with a 10-phase checklist. Before making changes, check the boxes against the actual state of `src/` to see what's done.
3. `src/config.js` — all tunable numbers live here.

## Stack (locked — don't revisit)

- Vite + npm + plain JavaScript (no TypeScript).
- three.js via npm, ES modules.
- In-engine primitives only (`BoxGeometry`, `CylinderGeometry`) — no GLTF, no Blender pipeline.
- Procedural Web Audio API (no WAV assets). Audio context is created/resumed on the overlay-click user gesture.
- No test framework, no linter config. Add only if pain emerges.

## Coordinate system (easy to misread, pin it down)

- +Y up, +X right, −Z is **forward / toward the goal**.
- "Rows" index a fine sub-row grid: each lane contains `SUB_ROWS_PER_LANE` (=8) rows. World Z = `-row * SUB_ROW_DEPTH` where `SUB_ROW_DEPTH = LANE_WIDTH / SUB_ROWS_PER_LANE = 0.5m`.
- Row 0 = start (back edge of the start median, on the lip of lane 0). Goal row = `laneCount * SUB_ROWS_PER_LANE + 1` and is computed per-level.
- Strafe uses `cellX`: world X = `cellX * CELL_WIDTH`, clamped to `±STRAFE_MAX`.
- Vehicle stored as `{ lane, direction, x, z, wheelRows, wheels[] }`. `wheelRows` is two sub-row indices (the two wheel-path lines); `z` is their midpoint. Each entry in `wheels[]` is a wheel's vehicle-local position.
- Helpers: `rowToZ`, `cellXToWorldX`, `laneFirstRow`, `laneCountForLevel`, `goalRowForLevel`, `buildLanesForLevel` in `config.js`.

## Level progression and lane layout

- Lane count grows with level: `laneCountForLevel(level) = clamp(ceil(level / 2), 1, MAX_LANES)`. So levels 1–2 → 1 lane, 3–4 → 2, …, 15+ → 8 (capped).
- Direction follows American convention but flattened: east lanes are placed contiguously starting at `laneIndex 0`, then west lanes contiguously. East count comes from a same-direction-pair count (size 2, last pair may be 1).
  - `1: E   2: EE   3: EEW   4: EEWW   5: EEEWW   6: EEEEWW   7: EEEEWWW   8: EEEEWWWW`
- The LAST sub-row of every lane sits exactly on the white between-lane stripe and is **safe ground** — `spawner.js` constrains wheel placements so the lane's final row never has a wheel. The frog can rest on a stripe between lanes.
- Past the cap (level > `CAPPED_AT_LEVEL` = 16), `buildLanesForLevel` applies two chaos modifiers: each lane has a per-level probability of being direction-flipped (scrambling the contiguous E/W blocks), and `spawnInterval` is multiplied down (denser traffic). Both ramp slowly with level.
- The world is **rebuilt every crossing**. `Game._buildLevel(level)` disposes the old scene, creates a new `Frog`, `Spawner`, and `Scene` for the new lane count. The camera survives the rebuild (it's just re-parented), so player yaw/pitch persist across transitions.

## Design decisions worth remembering

- **Hard-commit input.** Frog rejects keypresses while `state !== 'IDLE'`. No input buffer. This is intentional — matches "once you commit, you're committed" from the design doc. Don't add queuing.
- **Wheels kill, not bodies.** Collision is a continuous AABB check against each vehicle's 4 wheel positions in world space (`collision.js`). The strip between the front and rear axle is a survivable gap — the frog can hop into it and out the other side. **Do not** restore the old "row-match = dead" or "mid-air = invincible" rules; the new model is intentional and the playtest confirmed it.
- **Hop arc stays under wheel-top.** `HOP_HEIGHT` is tuned so the frog never visually clips through the body during a wheel-row pass — keep it small if you re-tune.
- **Near plane is 0.02m** because the camera is 5cm off the ground. Not a mistake; don't raise it.
- **Engine audio is the gameplay cue.** Doppler pitch/gain is load-bearing for fairness — a silent approaching truck is unplayable. Tune before deleting.
- **Audio suspends with the game.** `AudioManager.suspend()` is called on pointer-lock loss so engines don't keep humming under the pause overlay.
- **Cinematic intro fires once per session.** First pointer-lock acquisition triggers a top-down → frog-eye descent (`Game._beginIntro` / `_finishIntro`). Resuming from pause skips it.
- **No user-visible frog mesh.** The camera *is* the frog. Don't add a body unless explicitly requested.

## How to extend

- **New vehicle type:** add an entry to `VEHICLE_TYPES` in `config.js` (set `wheelRowSpread` so two wheel lines fit within `SUB_ROWS_PER_LANE`) and reference it in a lane's `mix`. Update `ENGINE_BASE_FREQ` in `audio.js` if you want a distinct engine pitch.
- **New lane:** push to the `LANES` array in `config.js` and bump `LANE_COUNT_MVP`. Each lane is identified by its 0-based `laneIndex`; sub-rows are derived via `laneFirstRow(laneIndex)`. `GOAL_ROW` recomputes automatically.
- **New SFX:** add a method to `AudioManager` that synthesizes via oscillators/buffers — follow `playHop` / `playSquish` / `playWin` as patterns.

## Verify changes

```sh
npm run build     # catches module errors, no-test smoke
npm run dev       # playtest in a browser — pointer lock required
```

There are no automated tests. UI and audio changes can only be confirmed by playing in a browser; say so explicitly when a task depends on that and you can't do it.

## Out of scope (deferred until MVP ships)

Multiplayer, river level, level progression, ragdoll deaths, top-down death replay, chiptune music, CRT/vertex-jitter filters, mobile, VR, leaderboards. See `PLAN.md` §10. Each is its own plan when the time comes.
