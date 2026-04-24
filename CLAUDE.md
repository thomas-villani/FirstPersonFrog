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
- "Rows" index the grid: row 0 = start median, rows 1..N = road lanes, row N+1 = goal median. World Z = `-row * LANE_WIDTH`.
- Strafe uses `cellX`: world X = `cellX * CELL_WIDTH`, clamped to `±STRAFE_MAX`.
- Vehicle stored as `{ row, direction, x }` — world transform computed each frame.
- Helpers: `rowToZ`, `cellXToWorldX` in `config.js`.

## Design decisions worth remembering

- **Hard-commit input.** Frog rejects keypresses while `state !== 'IDLE'`. No input buffer. This is intentional — matches "once you commit, you're committed" from the design doc. Don't add queuing.
- **Mid-air invincibility.** Collision checks only run when the frog is in `IDLE` state, so hopping over a lane timed with a passing car is a legitimate near-miss. Don't "fix" this.
- **Near plane is 0.02m** because the camera is 5cm off the ground. Not a mistake; don't raise it.
- **Engine audio is the gameplay cue.** Doppler pitch/gain is load-bearing for fairness — a silent approaching truck is unplayable. Tune before deleting.
- **No user-visible frog mesh.** The camera *is* the frog. Don't add a body unless explicitly requested.

## How to extend

- **New vehicle type:** add an entry to `VEHICLE_TYPES` in `config.js` and reference it in a lane's `mix`. Update `ENGINE_BASE_FREQ` in `audio.js` if you want a distinct engine pitch.
- **New lane:** push to the `LANES` array in `config.js`. Rows are indexed from the start; the goal row is `LANE_COUNT_MVP + 1`, so bump `LANE_COUNT_MVP` too.
- **New SFX:** add a method to `AudioManager` that synthesizes via oscillators/buffers — follow `playHop` / `playSquish` as patterns.

## Verify changes

```sh
npm run build     # catches module errors, no-test smoke
npm run dev       # playtest in a browser — pointer lock required
```

There are no automated tests. UI and audio changes can only be confirmed by playing in a browser; say so explicitly when a task depends on that and you can't do it.

## Out of scope (deferred until MVP ships)

Multiplayer, river level, level progression, ragdoll deaths, top-down death replay, chiptune music, CRT/vertex-jitter filters, mobile, VR, leaderboards. See `PLAN.md` §10. Each is its own plan when the time comes.
