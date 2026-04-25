# FIRST PERSON FROG

First-person Frogger in the browser. Camera 5cm off the asphalt. Trucks the size of buildings. You are the frog now.

## Requirements

- Node.js 18 or newer
- A modern desktop browser (Chrome, Firefox, or Edge — pointer lock is required)

## Install

```sh
npm install
```

## Run (development)

```sh
npm run dev
```

Vite serves the game at `http://localhost:5173`. Click the overlay to grab pointer lock and start.

## Build

```sh
npm run build     # writes dist/
npm run preview   # serve the built bundle
```

## Controls

| Input | Action |
|---|---|
| W / ↑ | Hop forward (toward where you're looking) |
| S / ↓ | Hop backward |
| A / ← | Strafe left |
| D / → | Strafe right |
| Mouse | Look around |
| Left click / Space | Tongue flick (unlocks at Frog Level 2) |
| Esc | Release pointer lock (pause) |

WASD is **camera-relative**: the yaw is snapped to one of four cardinal grid quadrants, with an ~18% bias toward the forward/back axis so a partial head-turn toward oncoming traffic doesn't flip W into a strafe. Each hop is committed — keypresses during a hop are dropped.

## What the game is

Cross every lane to advance. Lane count grows with the game level (1–8 lanes); past level 16 lane direction starts randomly flipping and spawn density ramps up. Each crossing rebuilds the world for the new lane count.

The strip between a vehicle's front and rear axles is a **survivable body-gap** — the frog can land between axles. Wheels kill, bodies don't.

Scoring: each near-miss (THREADED, GRAZED, UNDER) builds a combo multiplier; bugs scattered each level give pickups; surviving in traffic for 30/60/90/120/150/180 seconds yields milestone bonuses. Banked points double as XP — frog levels unlock skills (currently the tongue flick, with longer-range tiers as the frog levels). You start with 5 lives; high score persists in `localStorage`.

## Tuning

Everything playtest-tunable lives in [`src/config.js`](./src/config.js) — hop duration and arc, camera FOV, fog range, vehicle dimensions, per-lane spawn tables, scoring constants, audio doppler.

## Project layout

```
src/
  main.js         bootstrap + RAF loop
  game.js         state machine; owns world, frog, spawner, audio, hud, score
  config.js       all tunables and per-level builders
  world.js        static scene (road, medians, stripes, pebbles, garbage, pond, trees)
  frog.js         state machine, hop animation, head-bob
  input.js        keyboard, pointer-lock, mouse-look, facing-relative WASD
  vehicles.js     Vehicle class + 4-wheel hitbox model
  spawner.js      per-lane spawn timers + car-following
  collision.js    AABB collision and near-miss tier detection
  audio.js        procedural Web Audio (one-shots + per-vehicle engine doppler)
  bugs.js         collectible bug placement and capsule hit-test
  tongue.js       first-person tongue flick projectile
  score.js        lives, points, combo, XP, frog level, milestones, high score
  skills.js       per-level skill unlock registry
  hud.js          DOM HUD (score, lives, XP bar, toasts, overlays, damage flash)
  death.js        third-person splat cutscene on a fatal hit
```

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — module reference, per-frame data flow, state machine. Read this before changing how systems fit together.
- [`frogger-fps-spec.md`](./frogger-fps-spec.md) — design vision (tone, scale, multiplayer stretch).
- [`PLAN.md`](./PLAN.md) — original MVP build spec; phases 1–10 shipped.
- [`PLAN_SCORING.md`](./PLAN_SCORING.md) — scoring and skills system spec; partially in flight.
- [`CLAUDE.md`](./CLAUDE.md) — orientation for AI-assisted sessions, including locked-in design decisions.

## Status

MVP shipped. Scoring, lives, XP, skills (tongue flick), bugs, and the death cutscene have been layered on top — see `PLAN_SCORING.md` for the in-progress slice. Multiplayer, the river level, and additional vehicle types remain deferred (`PLAN.md` §10).
