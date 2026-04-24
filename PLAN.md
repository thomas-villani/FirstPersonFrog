# First-Person Frogger — MVP Build Spec

## Context

Greenfield browser game. The design doc at `frogger-fps-spec.md` (read it first for tone and full vision) lays out a first-person Frogger: camera 5cm off the asphalt, blocky PS1-era aesthetic, grid-based hopping across lanes of comically oversized vehicles. The joke is the perspective shift, not mechanical complexity.

This document scopes the **single-player MVP** from §11 of the design doc: 3 lanes, sedan + truck, randomized spawning, death + instant respawn, blocky primitives, minimal SFX. Goal: get a playable build in the browser so we can feel the scale mismatch and iterate. Multiplayer (§13) and the river level (§8 stretch) are out of scope here — they'll be their own plans later.

This spec is written to be picked up across multiple Claude Code sessions. Later sessions should read this file, check `src/` state against the phase checklist in §7, and continue from the next unchecked step.

---

## 1. Stack & locked decisions

- **Build:** Vite + npm, plain JavaScript (no TypeScript).
- **Renderer:** three.js (npm package, imported as ES modules).
- **Art:** pure in-engine primitives (`BoxGeometry`, `CylinderGeometry`). No GLTF, no Blender pipeline in MVP.
- **Audio:** Web Audio API directly (not three.js `PositionalAudio`). SFX via jsfxr or similar retro generators.
- **Target:** desktop browser (Chrome/Firefox/Edge). Mobile and itch.io deploy come later.
- **No TypeScript, no linter config, no test framework in MVP.** Add only if pain emerges.

---

## 2. File layout

```
FirstPersonFrogger/
  index.html              # canvas, CSS reset, click-to-start overlay
  package.json            # vite, three
  vite.config.js
  frogger-fps-spec.md     # design doc (existing)
  src/
    main.js               # bootstrap: renderer, Game, RAF loop
    game.js               # Game class: owns world/frog/spawner/collider; update+render tick
    config.js             # ALL tunables: dimensions, speeds, spawn tables, colors
    world.js              # static scene: road, lane stripes, medians, fog, lights
    frog.js               # frog state machine + mesh + camera rig + head-bob
    input.js              # keyboard, pointer-lock, mouse-look
    vehicles.js           # Vehicle class + VEHICLE_TYPES registry (sedan, truck)
    spawner.js            # per-lane spawn loops driven by LaneConfig[]
    collision.js          # AABB frog-vs-vehicle on current lane
    audio.js              # AudioManager: one-shots + pooled engine loops
    hud.js                # DOM-based death counter + level text
  public/
    sfx/                  # hop.wav, squish.wav, engine-loop.wav (generated)
```

Rationale for fewer files: `vehicles.js` holds both the class and the type registry, so "add a bus" is one object entry. `config.js` is the pressure-relief valve — anything tweakable in playtests lives there, not buried in classes. `world.js` is the only place touching road geometry, so the river level later swaps it cleanly.

---

## 3. Coordinate system & lane model

- **Axes:** three.js default, +Y up. **Goal is at −Z** so "hop forward" = −Z (matches camera's default −Z forward, avoids a coordinate flip).
- **Units:** 1 world unit = 1 meter.
- **`LANE_WIDTH = 4`** m (vehicles ~3m wide with margin). Forward/back hop distance = `LANE_WIDTH`.
- **`CELL_WIDTH = 2`** m. Strafe hop (A/D) moves by `CELL_WIDTH` within the current lane.
- **Frog grid position:** `{ laneIndex: int, cellX: int }`. World pos derived: `x = cellX * CELL_WIDTH`, `z = -laneIndex * LANE_WIDTH`.
- **Vehicle position:** scalar `x` along its lane + `laneIndex` + `direction ∈ {-1, +1}`. World transform computed each frame from those.
- **Camera eye height:** `0.05` m (5 cm) above frog's grounded Y.

---

## 4. Game loop

Single `requestAnimationFrame`. **Capped variable dt:**

```js
dt = Math.min((now - last) / 1000, 1/30);
game.update(dt);
game.render();
```

No fixed-timestep accumulator — no physics integrator, no networking, determinism not required. Hop animation uses normalized `t = elapsed / HOP_DURATION` with easing, which is frame-rate independent. Vehicles advance `pos += speed * dt`.

---

## 5. Core systems

### Frog state machine

States: `IDLE | HOPPING | DEAD`. (Respawn is a 1-frame transition back to IDLE — instant per design doc.)

**Hard-commit inputs, drop mid-hop presses.** Input handler only reads when `state === IDLE`. No buffer. This matches "once you commit, you're committed" and avoids the "queued hop into a truck" bug class.

Hop tick: store `origin`, `target`, `elapsed`. Position lerped with easing. **Arc height:** `y = HOP_HEIGHT * sin(π * t)`. On `t >= 1`: snap to target, fire `onLanded` (hop SFX, head-bob impulse, collision check against any vehicle already overlapping — covers "landed directly into a truck").

### Collision

AABB on the XZ plane. Only test vehicles with `laneIndex === frog.laneIndex` **and** only when `frog.y < GROUND_THRESHOLD` (mid-air frog is invincible — gives the "barely made it" moments the design doc wants). Frog hitbox is a small fixed AABB (~0.3m cube). Vehicle hitboxes come from their `BoxGeometry` dimensions.

### Vehicle spawning

Per-lane configs in `config.js`:

```js
LANES = [
  { index: 0, direction: +1, speedRange: [8, 12],  spawnInterval: [1.2, 2.5], mix: [['sedan', 0.7], ['truck', 0.3]] },
  { index: 1, direction: -1, speedRange: [10, 14], spawnInterval: [0.8, 2.0], mix: [['sedan', 0.5], ['truck', 0.5]] },
  { index: 2, direction: +1, speedRange: [6, 9],   spawnInterval: [2.0, 3.5], mix: [['truck', 1.0]] },
]
```

`Spawner` keeps one timer per lane. On expiry: pick vehicle type by weighted roll, spawn at lane's off-screen edge, speed from range. **Minimum spacing guard:** reject spawn if last vehicle in lane is closer than `vehicle.length + safety` (prevents overlapping trucks).

Adding a lane = push to array. Adding a vehicle type = add entry to `VEHICLE_TYPES` + reference in a mix.

### Camera

- `PerspectiveCamera(95, aspect, 0.02, 200)`. **Near plane 0.02** (2cm) is critical — camera is 5cm off ground and will clip asphalt otherwise. Far plane matched to fog end for natural fade-in.
- Camera is a child of the frog group (position follows hop arc). **Yaw/pitch stored separately** and applied to the camera's local rotation — do NOT rotate the frog mesh with mouse look; only the camera.
- **Pointer lock:** requested on a click-to-start overlay (browsers require user gesture). Listen for `pointerlockchange` and pause the loop when lock is lost. Show a "click to resume" overlay on Escape.
- Pitch clamped to ±85°.
- **Head-bob:** on landing, push camera local Y by a small impulse, decay over ~150ms (damped sine or exp). Do not bob during hop arc — arc already gives motion.

### Audio

`AudioManager` owns a single `AudioContext`, **resumed on the same user-gesture click that requests pointer lock** (autoplay policy).

- **One-shots** (hop splat, squish): decoded `AudioBuffer`, new `BufferSourceNode` per play.
- **Engines** (one per live vehicle, pooled, cap ~8 concurrent): looping `BufferSourceNode` → `GainNode` → destination. Per-frame update:
  - `distance = |vehicle.x - frog.x|` on the lane.
  - `approachingSign = sign((vehicle.x - frog.x) * -vehicle.direction)` (positive when closing in).
  - `playbackRate = 1 + APPROACH_PITCH * approachingSign * clamp(1 - distance/MAX_AUDIBLE, 0, 1)`.
  - `gain = 1 / (1 + distance * k)`, clamped.
  - Off-screen vehicles release their node back to the pool.

---

## 6. Config tunables (initial guesses — tune in playtest)

In `src/config.js`:

| Constant | Value | Notes |
|---|---|---|
| `LANE_WIDTH` | 4 | m |
| `CELL_WIDTH` | 2 | m (strafe) |
| `CAMERA_EYE_HEIGHT` | 0.05 | m |
| `HOP_DURATION` | 0.4 | s |
| `HOP_HEIGHT` | 0.6 | m (arc apex) |
| `HEAD_BOB_AMPLITUDE` | 0.04 | m |
| `HEAD_BOB_DECAY_MS` | 150 | ms |
| `NEAR_PLANE` | 0.02 | m |
| `FAR_PLANE` | 200 | m |
| `FOV` | 95 | degrees |
| `FOG_START` / `FOG_END` | 15 / 80 | m |
| `SEDAN_SIZE` | `{L:4.5, W:1.8, H:1.5}` | building-sized to frog |
| `TRUCK_SIZE` | `{L:12, W:2.5, H:3.5}` | skyscraper-sized |
| `FROG_HITBOX` | 0.3 | cube m |
| `LANE_COUNT_MVP` | 3 | |

---

## 7. Implementation phases

Each phase ends in a runnable build. Later sessions resume from the first unchecked box.

- [x] **Phase 1 — Vite skeleton.** `npm create vite@latest` (vanilla JS), strip boilerplate, `npm i three`. `src/main.js` creates a renderer with a cleared sky-blue color. Verify `npm run dev` shows a colored canvas.
- [x] **Phase 2 — Static world.** `world.js` builds: large road plane, 3 lane stripe quads (lifted to y=0.01 to avoid z-fighting), start/end median cubes, `scene.fog = new THREE.Fog(...)`, ambient + directional light. Camera at start position, 5cm high, facing −Z. Sanity-check near plane.
- [x] **Phase 3 — Frog + keyboard hop.** `frog.js` state machine. Frog is a simple green box group. WASD triggers hop. Camera is a child of frog group. No mouse look yet. **This is the feel-check** — tune `HOP_DURATION` and `HOP_HEIGHT` until it feels good.
- [x] **Phase 4 — Pointer-lock mouse look.** Click-to-start overlay element. Request pointer lock on click. Accumulate yaw/pitch from `mousemove` deltas, clamp pitch. Pause loop on `pointerlockchange` when lock is lost; show "click to resume" overlay.
- [x] **Phase 5 — One hand-placed vehicle.** `vehicles.js` with Vehicle class and `VEHICLE_TYPES` registry (sedan + truck). Body = BoxGeometry, wheels = 4× CylinderGeometry. Spawn one truck manually, move across lane, loop off-screen. **Verify scale** — a truck should look MASSIVE from 5cm eye level. Resize if not.
- [x] **Phase 6 — Spawner + LaneConfig.** `spawner.js` reads the `LANES` config. Replace hand-placed vehicle. All 3 lanes active with weighted mixes and min-spacing guard.
- [x] **Phase 7 — AABB collision + death/respawn.** `collision.js` AABB check. On hit: frog → `DEAD`, 0.5s delay, red screen flash (CSS overlay opacity), reset to start, increment death counter. No ragdoll in MVP.
- [x] **Phase 8 — Audio one-shots.** `audio.js` `AudioManager`. AudioContext resumed on start-overlay click (same gesture as pointer lock). Hop splat on every landing, squish on death. Generate the two SFX with jsfxr and drop into `public/sfx/`.
- [x] **Phase 9 — Engine doppler.** Per-vehicle looping engine with the distance/approach gain+pitch formula from §5. Cap concurrent engines (~8). **Without this the game is unfair** — engine sound is the gameplay cue for "car approaching."
- [x] **Phase 10 — HUD + polish.** DOM death counter (top-right), "LEVEL 1" text (top-center), head-bob on landing, tune fog so vehicles materialize out of haze. MVP ships.

---

## 8. Risks & gotchas (non-obvious ones)

1. **Near-plane clipping at 5cm eye height.** Must use `near: 0.02` or the player sees through the road. Also: shadow maps hate tiny near planes — stay unshadowed for MVP.
2. **Z-fighting between road plane and lane stripes.** Lift stripes to `y = 0.01` and/or set `polygonOffset: true` on the road material. Check at grazing angles.
3. **Audio autoplay policy.** `AudioContext` must be created or resumed inside a user-gesture handler. Bind it to the same click that requests pointer lock — one ritual, two wins.
4. **Pointer-lock UX.** Escape silently drops the lock. Without a visible "click to resume" overlay, the player thinks the game froze. Listen for `pointerlockchange` and pause the loop when lock is lost.
5. **`MeshBasicMaterial` and fog.** Basic material *does* honor fog in modern three.js but explicitly set `material.fog = true` to avoid a version-bump surprise. Fog fade-in is load-bearing for gameplay read (vehicles appearing out of haze) — confirm it's working in Phase 2. Basic material ignores lights, so if headlight beams are needed later, those vehicle bodies need `MeshLambertMaterial`.
6. **Scale intuition fails in dev.** Everything looks fine on a 27" monitor and feels absurd on a phone. Tune truck size in Phase 5 against the actual target viewport.

---

## 9. Verification (end of MVP)

- `npm run dev` launches the game in the browser without console errors.
- Click-to-start overlay requests pointer lock and resumes the audio context.
- WASD hops on a grid with ~0.4s animation; mouse looks freely; Escape pauses.
- 3 lanes of sedans and trucks spawn with varied timing, move at varied speeds, never overlap within a lane.
- Colliding with a vehicle triggers a red flash, a squish SFX, and a respawn at start; death counter increments.
- Approaching vehicles are audible via engine pitch/volume before they're visible through fog.
- Crossing all 3 lanes lands on the far median (MVP has no "level complete" screen yet — just reaching the median is the win state).

No automated tests in MVP. Verification is by playing.

---

## 10. Out of scope (explicitly deferred)

- Multiplayer (design doc §13).
- River level (§8 stretch).
- Ragdoll / varied death animations.
- Top-down death replay screen.
- Chiptune music, horn SFX, near-miss stings.
- CRT filter, vertex jitter, affine texture warping.
- Rear-view mirror toggle.
- Leaderboards, VR, mobile.

Each of these is its own plan when the time comes.

## 11. Future improvements (post-playtest)

Open items uncovered during playtests of the MVP scaffold. Each is small enough to fold into a session, but is intentionally NOT in §7 because the MVP shipped without them.

- **Crossing rewards beyond the level toast.** Currently a successful crossing bumps a level counter, plays a chime, ramps speeds, and rebuilds the world for the new lane count. Could add: per-level palette/fog tint shifts, new vehicle types, intermittent "rush hour" spawn bursts.
- **Doppler/HUD danger indicator.** Engine doppler is audio-only today (`audio.js` updates pitch + gain on approach). Optional visual cue: a peripheral DOM blip or screen-edge flash when a fast vehicle is closing from behind, since the camera can't see backwards without the player turning.
