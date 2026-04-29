# Changelog

All notable changes to **First Person Frog** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are bumped with [`bump-my-version`](https://callowayproject.github.io/bump-my-version/) — see [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) for game tuning, and `.bumpversion.toml` for the release config.

## [Unreleased]

## [0.1.0] - 2026-04-29

First tagged release. The MVP shipped, the scoring + RPG-style skill tree was layered on top, and the game is live at <https://thomas-villani.github.io/FirstPersonFrog/>.

### Added

- **Core gameplay.** First-person frog at 5cm eye height, three.js renderer, blocky in-engine primitives. Hard-commit hop input (W/A/S/D + arrows) on a sub-row grid; pointer-lock mouse-look with camera-relative WASD biased toward the forward axis; 5 lives; high-score persistence in `localStorage`.
- **Wheel-only collision.** AABB hitbox per wheel, not per body. The strip between the front and rear axles is survivable space — the frog can land between axles and hop out the other side. Mid-hop is **not** invincible.
- **Level progression.** Lane count grows with the game level (`ceil(level / 2)`), uncapped. Each crossing rebuilds the world; the camera survives the rebuild so yaw/pitch persist. Past level 16 (`CHAOS_START_LEVEL`) per-lane direction flips and spawn density start ramping in. Past level 30 a rush-hour override may force every lane in one direction (eastbound only at 30–49; either direction at 50+).
- **Vehicles.** Five types: `sedan`, `truck`, `boxVan`, `motorcycle` (single-track), `doubleTrailer` (cab + 2 trailers, 8 axles). Per-lane traffic templates cycle through different speed/spawn/mix flavors; car-following keeps followers at a leader's speed within `FOLLOW_GAP`; `MIN_GAP` floor prevents same-lane overlap.
- **Audio.** Per-vehicle engine doppler (sawtooth + lowpass + gain, distance-based pitch and volume) — load-bearing for fairness. One-shot SFX (hop, squish, pickup, tongue flick, level up, win, blocked-jump, mute) synthesized from oscillators/noise. Audio context resumed on the same overlay click that requests pointer lock. Engines suspend when the game pauses. M-key mute.
- **Scoring.** Three near-miss tiers: `THREADED` (active hop through the wheelbase), `UNDER` (passive — sit between axles while the vehicle drives over), `GRAZED` (wheel within hitbox + `GRAZE_RADIUS`). Combo multiplier capped at ×8, decays after 5s of idleness. **Daredevil bonus** (+750) for threading both wheel-row lines of one vehicle in a single approach. **Untouchable bonus** (1000 + 250 per consecutive streak) for crossings without dying or using a Recombobulation. Six in-traffic survival milestones at 30/60/90/120/150/180s (500 → 16,000 points). Bug pickups + crossing bonus.
- **XP and frog levels.** Banked points double as XP. Frog level cap = 99 (the game is infinite). Skill points stop accruing at level 28 (4 branches × 7 tiers − 1 free Tongue Fu T1 pre-spent). Levels 29–99 still toast.
- **RPG-style skill tree.** Four branches, 7 sequential tiers each, picked with a 1–4 modal between crossings:
  - 🥋 **Tongue Fu** — Tongue Flick (Space / left-click), Bug Magnet, Ribbit Roar (E)
  - 🐰 **Hip Hopping** — hop-speed bumps + Long Jump (Shift + WASD, 2× / 4× distance)
  - 🧘 **Frogcentration** — Frog Focus (F-toggle, world-time-slow), Echolocation
  - 🎩 **Hocus Croakus** — Recombobulation (charges that absorb fatal hits + cutscene revive), Psychedelic Sight, Plague of Frogs
- **Bugs.** Scattered each level (~70% land on deadly wheel-paths by `BUG_RISK_WEIGHT`); count grows with lane count. Mercy auto-collect on landing; tongue capsule hit-test for ranged grabs. Special **extra-life bug** spawns on even-numbered levels.
- **Blocking obstacles.** Soda cans (red, silver), bottles, and trash bags placed on safe stripes. Reserve their cell — the frog has to strafe around them. Audible blocked-jump SFX.
- **Biome themes.** Four biomes (`meadow`, `suburb`, `mountain`, `desert`) rolled per crossing, each with their own sky/fog/grass/decoration mix. Level 1 locked to `meadow` so the cinematic intro stays consistent.
- **Scenery.** Bott's-dot pebble markers between lanes (one per cellX for an X reference), flattened road garbage, 3D rocks on/off road, off-road grass, pond, trees, and a central guardrail (rails + posts) on roads with ≥4 lanes. Pure decoration — collision ignores all of it.
- **Cinematic intro.** Top-down → frog-eye descent on the first pointer-lock acquisition of a session; `INTRO_DURATION` 2.6s. Subsequent pause/resume skips it.
- **Death cutscene.** Third-person splat replay (`DEATH_CUTSCENE_DURATION` 1.4s): camera detaches, orbits the impact, frog squashes flat, blood disk spreads with ballistic droplets.
- **HUD.** DOM-rendered: lives icons, frog level + XP bar, per-branch skill badges, combo, score, high-score, near-miss counter, rush-hour banner, milestone toasts, level-up toasts, damage flash, skill picker modal.
- **Title screen + how-to-play panel.** Front-of-house UX before the first run.
- **Top-10 leaderboard with name entry.** Persists in `localStorage` (`frogger.scores`, JSON array). Migrated forward from a legacy single-value high-score key.
- **GitHub Pages deploy workflow.** Auto-deploys `main` to <https://thomas-villani.github.io/FirstPersonFrog/>.
- **SVG favicon** mirroring the cinematic intro frog.
- **Documentation.** `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md` (per-tunable tour of `src/config.js`), `docs/PLAN.md`, `docs/PLAN_SCORING.md`, `docs/frogger-fps-spec.md`, `docs/instructions.md`, plus `README.md` and `CLAUDE.md` at root.

### Changed

- **Lane direction layout** is now divided-road style: east lanes contiguous at low `laneIndex`, west lanes at high — `1: E`, `2: EW`, `3: EEW`, `4: EEWW`, … East count = `ceil(laneCount / 2)`.
- **Last sub-row of every lane is safe ground.** The spawner constrains wheels to the lane's first..second-to-last rows, so the frog can rest on the between-lane stripe without being hit.
- **Pre-populated traffic** seeds vehicles already in motion across each lane from level 2 onward, so a fresh level isn't a free 10-second head start. Level 1 stays clean to match the cinematic intro.
- **THREADED detection** tightened to require active wheelbase X overlap during the hop, so passive drift no longer pays the active bonus.
- **Middle-row safe-spot closed.** Vehicle wheel-row spreads were re-tuned (sedan/boxVan = 3, truck = 4, doubleTrailer = 5, motorcycle single-track) so no mixed lane has an unreachable "free" sub-row.
- **Long Jump time scales with distance** (`{1: 1, 2: 1.6, 4: 3}` multiplier on hop duration) so a 4× long jump isn't 4× as fast — the vulnerable window grows with the distance covered.
- **Focus rebound to F (toggle)**, Long Jump rebound to **Shift + WASD** (Ctrl + W closed the browser tab and pages can't preventDefault on OS shortcuts).
- **Focus meter persists across crossings.** The bug-pickup focus fill was bumped (a level's bug count can now top a careful player's meter on its own).
- **Recombobulation refills** to the tier cap at the start of every game level — unused charges don't carry over.
- **Skill picker** is now gated behind any pending Untouchable / milestone toasts so the screen doesn't stack.
- **XP base** raised to 1000/level so the curve matches the new combo + Daredevil + survival economy.
- **Project layout reshuffle.** Public docs moved to `docs/`; `README.md` and `CLAUDE.md` stay at the project root.

### Fixed

- **Same-lane vehicle catch-up overlap** prevented (car-following + a hard `MIN_GAP` floor enforced after each frame's movement).

[Unreleased]: https://github.com/thomas-villani/FirstPersonFrog/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/thomas-villani/FirstPersonFrog/releases/tag/v0.1.0
