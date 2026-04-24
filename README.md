# FROGGER: ROAD VIEW

First-person Frogger in the browser. Camera 5cm off the asphalt. Trucks the size of buildings. You are the frog now.

This repo contains the single-player MVP — a playable prototype for feel-checking the core perspective joke before expanding. See [`frogger-fps-spec.md`](./frogger-fps-spec.md) for the full design vision and [`PLAN.md`](./PLAN.md) for the build spec and phase checklist.

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

Vite opens the game in your default browser at `http://localhost:5173`. Click the overlay to grab pointer lock and start.

## Build

```sh
npm run build     # writes dist/
npm run preview   # serve the built bundle
```

## Controls

| Input | Action |
|---|---|
| W / ArrowUp | Hop forward |
| S / ArrowDown | Hop backward |
| A / ArrowLeft | Strafe left |
| D / ArrowRight | Strafe right |
| Mouse | Look around |
| Esc | Release pointer lock (pause) |

Each hop is committed — keypresses during a hop are dropped.

## Tuning

Everything playtest-tunable lives in [`src/config.js`](./src/config.js) — hop duration and height, camera FOV and eye height, fog range, vehicle sizes, per-lane spawn tables, audio doppler constants.

## Project layout

```
src/
  main.js         bootstrap + RAF loop
  game.js         owns world, frog, spawner, audio, hud
  config.js       all tunables
  world.js        static scene (road, medians, stripes, fog, lights)
  frog.js         state machine, hop animation, head-bob
  input.js        keyboard, pointer-lock, mouse-look
  vehicles.js     Vehicle class + VEHICLE_TYPES registry
  spawner.js      per-lane spawn timers
  collision.js    AABB frog-vs-vehicle
  audio.js        procedural Web Audio (hop, squish, engine doppler)
  hud.js          DOM death counter, flash, toast
```

## Status

MVP scaffold, phases 1–10 of `PLAN.md` complete. Not yet playtested — expect to tune numbers in `src/config.js` after first run. Multiplayer, the river level, and additional vehicle types are deferred (see PLAN.md §10).
