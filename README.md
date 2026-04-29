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

Cross every lane to advance. Lane count grows with the game level — `ceil(level / 2)`, uncapped. Past level 16 lane directions start randomly flipping and spawn density ramps up. Past level 30 a rush-hour override may force every lane in one direction. Each crossing rebuilds the world.

The strip between a vehicle's front and rear axles is a **survivable body-gap** — the frog can land between axles. Wheels kill, bodies don't.

Scoring: each near-miss (THREADED, GRAZED, UNDER) builds a combo multiplier; bugs scattered each level give pickups; surviving in traffic for 30/60/90/120/150/180 seconds yields milestone bonuses. Banked points double as XP — frog levels unlock skills (currently the tongue flick, with longer-range tiers as the frog levels). You start with 5 lives; high score persists in `localStorage`.

## Tuning

Everything playtest-tunable lives in [`src/config.js`](./src/config.js) — hop duration and arc, camera FOV, fog range, vehicle dimensions, per-lane spawn tables, scoring constants, audio doppler. See [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) for a category-by-category tour of every knob and what it does.

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

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — module reference, per-frame data flow, state machine. Read this before changing how systems fit together.
- [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) — every tunable in `src/config.js` explained, grouped by category.
- [`docs/frogger-fps-spec.md`](./docs/frogger-fps-spec.md) — design vision (tone, scale, multiplayer stretch).
- [`docs/PLAN.md`](./docs/PLAN.md) — original MVP build spec; phases 1–10 shipped.
- [`docs/PLAN_SCORING.md`](./docs/PLAN_SCORING.md) — scoring and skills system spec; partially in flight.
- [`docs/instructions.md`](./docs/instructions.md) — in-game how-to-play reference.
- [`CHANGELOG.md`](./CHANGELOG.md) — versioned release notes (Keep a Changelog format).
- [`CLAUDE.md`](./CLAUDE.md) — orientation for AI-assisted sessions, including locked-in design decisions.

## Releasing

Versions are managed with [`bump-my-version`](https://callowayproject.github.io/bump-my-version/). The config in `.bumpversion.toml` updates `package.json`, `package-lock.json`, the `[Unreleased]` section header in `CHANGELOG.md`, and the changelog compare links — then commits and tags `vX.Y.Z`.

```sh
# Add bullets under ## [Unreleased] in CHANGELOG.md, stage them, then:
bump-my-version bump patch    # 0.1.0 → 0.1.1
bump-my-version bump minor    # 0.1.0 → 0.2.0
bump-my-version bump major    # 0.1.0 → 1.0.0
git push --follow-tags
```

Pass `--dry-run --verbose` first if you want to see the diff without writing.

## Status

MVP shipped. Scoring, lives, XP, skills (tongue flick), bugs, biome themes, the cinematic intro, the death cutscene, and a top-10 leaderboard have been layered on top. The game is live at <https://thomas-villani.github.io/FirstPersonFrog/>.

## Coming soon

Things that are sketched but not yet shipped — roughly the order they're likely to land. Each is its own scoped plan when the time comes:

- **More skills wired up.** A few branch tiers from `docs/PLAN_SCORING.md` are arrays-only right now: Plague of Frogs (Q), Echolocation visualization, Psychedelic Sight road tint, late-tier Hip Hopping speed bumps, Ribbit Roar's brake hook on the spawner.
- **Nails on the road.** Tires blow out, vehicles swerve off the road and explode dramatically. Pure polish/comedy moment.
- **Legend Mode.** 1-life run variant with its own leaderboard.
- **River level.** The §8 stretch goal from the design doc — log-hopping at frog-eye level, water below.
- **Crossing recap.** End-of-level screen with points breakdown, bugs collected, threading count.
- **Sloppy drivers at high levels.** Lane-line riders, sinusoidal swervers, texters drifting then snapping back. Currently lanes are perfectly behaved.
- **Weather, night levels, sun glare at sunset.** Atmospheric variety past the existing four biomes.
- **Multiplayer.** From the original design doc §13 — the longest deferred. Its own plan when the single-player loop is fully done.

See `docs/PLAN.md` §10–§11 for the full deferred list, and the design doc (`docs/frogger-fps-spec.md`) for the underlying vision.
