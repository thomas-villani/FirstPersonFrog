# Scoring & Skills — Plan

## Context

The MVP shipped (see `PLAN.md` §7 phases 1–10): a runnable first-person Frogger with hop, mouse-look, wheel-collision, level progression, audio doppler, and a death counter. This plan adds the **scoring + skill systems** that turn it from a tech demo into a game with a goal worth chasing.

Read order when picking this up across sessions:
1. `frogger-fps-spec.md` — original design doc (tone, multiplayer/river stretch goals).
2. `PLAN.md` — MVP build spec; the existing scaffold this plan extends.
3. `CLAUDE.md` — locked design decisions for the live codebase.
4. **This doc** — scoring & skills design and phased build.

The MVP added a "wheel-only collision" rule and a continuous AABB collision check. The single-most-important consequence is that **the strip between the front and rear axles is survivable space** — a hop timed into the wheelbase clears a passing vehicle. This document treats that mechanic as the **scoring centerpiece**: threading the wheelbase is the highest-reward skill expression in the game.

---

## 1. Locked design decisions

- **Score banks on crossing.** Each successful crossing adds the level's earned points to your run total. In-progress points (combo + uncollected milestones) are forfeit on death.
- **5 lives per run.** Death consumes one life and respawns at start. Out of lives = game over → run total is final → reset to a fresh run.
- **Score wipes on game over.** No banked score across runs. The high-score number is "best single run." (Classic arcade.)
- **Risk pays.** All scoring rewards traffic exposure: near-miss combos, in-traffic survival milestones, bugs placed in deadly rows. Standing on a safe stripe earns nothing.
- **Skills always-on, level-gated.** Once unlocked, a skill is bound to its key permanently. No equip menu. Six total skills + one consumable.
- **Recombobulation is a rare collectible**, not a leveled skill. A glowing special bug spawns every 5 levels on a high-risk row. Collecting it stocks a charge that auto-consumes on what would otherwise be a fatal hit.
- **Bugs are placed at level start** — not a mid-level trickle. Position is fixed for that level instance.
- **Frog Focus visual = chromatic aberration** + cyan/green tint. Lick Thyself = full vaporwave treatment. Both reuse a shared post-processing pass.

---

## 2. File layout additions

```
src/
  main.js            # (existing)
  game.js            # extends: lives, score wiring, skill update loop
  config.js          # extends: scoring/skills tunables
  world.js           # (existing) — bugs added in score system, not world
  frog.js            # extends: long-jump support, recombobulation hook
  input.js           # extends: Shift/Ctrl/Q/E bindings, modifier on hop
  vehicles.js        # extends: nearMiss substate per vehicle
  spawner.js         # extends: ribbit-roar braking hook, lick-thyself trail data
  collision.js       # extends: detectNearMisses() returning fired events
  audio.js           # extends: playPickup, playRoar, playFocus, playLick, playRecombobulate
  hud.js             # extends: score, combo, lives, focus meter, skill state, milestone flashes
  score.js           # NEW — run state: score, combo, milestones, lives, banking
  bugs.js            # NEW — bug entity, level-start placement, collection, recombobulation pickup
  skills.js          # NEW — skill registry, unlock/upgrade table, per-skill state
  fx.js              # NEW — post-processing pass (CA + tint), screen-shake, milestone toast
public/
  (no new assets — all procedural)
```

`score.js`, `skills.js`, `bugs.js`, `fx.js` are the four new modules. Everything else is extension.

---

## 3. Coordinate / data model

No coordinate-system changes. Bug placement reuses the existing sub-row grid (bug at `{ row, cellX }`). Vehicles gain a `nearMiss` substate (`{ minWheelDist, minBodyDist, threadedAtSomePoint, fired }`), reset on spawn, evaluated each frame, fired when the vehicle's X passes the frog's X.

---

## 4. Score model

### 4.1 Combo near-miss multiplier

Each frame, for every vehicle within proximity of the frog, evaluate:

- **THREADED** — vehicle body overlaps frog X **and** frog Z is strictly between the two wheel-row Z values for the vehicle (i.e., inside the wheelbase). Worth most.
- **GRAZED** — closest wheel center within `GRAZE_RADIUS` (~0.5 m) of frog hitbox edge, not killed. Mid tier.
- **CLOSE** — vehicle body center within `CLOSE_RADIUS` (~1.5 m) of frog X, no wheel within graze. Low tier.

Detection writes to `vehicle.nearMiss`. When the vehicle's X crosses the frog's X (sign flip of `(v.x - frog.x) * v.direction`), or the vehicle exits proximity, the **highest tier achieved** during that approach fires as one event. THREADED supersedes GRAZED supersedes CLOSE.

| Event | Base points | Combo multiplier bump |
|---|---|---|
| THREADED | 300 | ×2 |
| GRAZED | 100 | ×1.5 |
| CLOSE | 25 | ×1.2 (capped at ×3 from this tier alone) |

The combo multiplier itself stacks: each event multiplies the running multiplier by its bump value, capped at ×8. The current multiplier scales the *next* event's payout.

**Combo decay:** the multiplier exponentially decays back toward ×1 after `COMBO_DECAY_DELAY` (3 s) of no near-miss. Decay rate `COMBO_DECAY_TAU` (~1 s).

**HUD:** "x3.5" rendered next to the score, pulses when bumped, fades color toward red as it nears the cap.

### 4.2 In-traffic survival milestones

Track `inTrafficSeconds` — accumulates only while the frog's row is **not** the start median, **not** the goal median, **and not** a safe divider stripe (the lane's last sub-row). Resets when the frog dies or banks (crossing).

Milestone bonuses fire at thresholds `[30, 60, 90, 120, 150, 180]` seconds with payouts `[500, 1000, 2000, 4000, 8000, 16000]` (doubling). HUD: chunky "+500 SURVIVED 30s" toast for 1 s.

### 4.3 Bug pickups

Base 100 points × current combo multiplier × current milestone tier multiplier (1×, 2×, 4×, 8×… mirroring the milestone tiers).

A **bug pickup also bumps the combo multiplier ×1.5** (same as GRAZED) — keeps the combo alive when there's no traffic to thread.

### 4.4 Crossing bonus

`CROSSING_BASE_BONUS × level` on each successful crossing. All currently-earned points are then **banked into the run total** and the in-progress score resets to 0.

### 4.5 Lives & game over

`STARTING_LIVES = 5`. Death decrements lives and respawns at start (existing flow). When `lives === 0`:
- Banked run total is finalized as score.
- Compare against `localStorage` high score; if higher, save it.
- Reset to a fresh run on next pointer-lock acquire (rebuild level 1, restore 5 lives, score 0).

A Recombobulation charge consumed during a hit does NOT decrement lives.

---

## 5. Bugs

### 5.1 Placement

`bugs.js#placeBugsForLevel(level)` runs during `Game._buildLevel` after `Spawner.prePopulate`. Places `BUGS_PER_LEVEL` (3–5, scales mildly with level) regular bugs, plus one Recombobulation bug if `level % RECOMBOBULATION_INTERVAL === 0` (every 5).

**Placement rule** — risk-weighted:
- 70% chance: bug placed on a wheel-path sub-row of a random lane (the deadly rows).
- 30% chance: bug placed on a safe sub-row (lane's last sub-row, divider stripe).
- Random `cellX` uniformly in `[-STRAFE_MAX, STRAFE_MAX]`.
- No two bugs on the same `(row, cellX)` cell.

Recombobulation bug is **always** on a wheel-path row of the most-trafficked lane.

### 5.2 Visual

- Regular bug: `BoxGeometry(0.18, 0.06, 0.18)`, dark-brown `MeshLambertMaterial`. Slight Y rotation per bug for variety. Sits at `y = 0.03` so it pokes off the asphalt visibly from 5 cm POV.
- Recombobulation bug: `SphereGeometry(0.12, 8, 6)`, emissive magenta/cyan oscillating material. Slow Y bob and rotation. Subtle point-light below it for an unmistakable glow.

### 5.3 Collection

Per frame, check every bug against the frog's tongue reach (see §6.3 — Tongue Grab). On collection:
- Regular bug → fire a `bugCollected` event into `score.js`. Audio `playPickup()` (chomp + faint ribbit). Dispose mesh.
- Recombobulation bug → push onto `score.recombobulationCharges` (max 3). Audio `playRecombobulate()` (descending chime). Dispose mesh.

---

## 6. Skills framework

### 6.1 Key bindings (locked)

| Input | Skill |
|---|---|
| WASD / arrows | Hop (existing) |
| Mouse | Look (existing) |
| **Shift (hold)** | Frog Focus |
| **Ctrl + WASD** | Long Jump modifier |
| **Q (press)** | Ribbit Roar |
| **E (toggle)** | Lick Thyself |
| (passive) | Tongue Grab — auto on landing/standing |
| (passive) | Echolocation — radar always-rendered once unlocked |

### 6.2 Unlock & upgrade table

```
Lv 1–2 : Tongue base only.
Lv 3   : Frog Focus unlocks (3 s max duration).
Lv 5   : Long Jump unlocks (+1 row / +1 strafe cell).
Lv 6   : Frog Focus → 4 s.
Lv 7   : Echolocation tier 1 (blips only, rear cone).
Lv 9   : Ribbit Roar unlocks (1 use/level). Long Jump → +2.
Lv 11  : Lick Thyself unlocks (3 s). Frog Focus → 5 s.
Lv 13  : Tongue tier 2 (±1 strafe-cell reach). Echolocation tier 2 (direction arrows).
Lv 15  : Long Jump → +3. Ribbit Roar → 2 uses/level.
Lv 17+ : (chaos mode) Top-tier upgrades: Tongue tier 3, Lick Thyself 5 s, Echolocation tier 3 (ETA shading).
```

Skills module owns this table as a single static array; `Skills.update(level)` toggles enabled state and tier on each level rebuild.

### 6.3 Tongue Grab (passive, base always-on)

- **Tier 1 (base, always):** auto-collects any bug whose `(row, cellX)` matches the frog's current `(row, cellX)` while idle. Effectively means a bug landed on is instantly collected; a bug spawned beneath a stationary frog is also instantly collected.
- **Tier 2 (Lv 13):** also collects bugs on the frog's current row at `cellX ± 1`. Visual: a quick tongue-flick line from frog POV (small cylinder shooting outward and retracting in ~80 ms).
- **Tier 3 (Lv 17+):** ±2 strafe cells **and** +1 forward row.

Audio: `playPickup` already covers all tiers — flick visual is the differentiator.

### 6.4 Frog Focus (Shift hold)

- Meter `[0, 1]` fills from near-miss events (THREADED +0.4, GRAZED +0.2, CLOSE +0.05) and bug pickups (+0.15). Caps at 1.
- Meter renders as a thin horizontal bar bottom-center.
- While Shift is held AND meter > 0:
  - World time scale `WORLD_TIME_SCALE_FOCUS = 0.35` applied to vehicle motion + spawner timers + audio engine pitch (proportional). Frog hop and input run at normal speed.
  - Meter drains at `1 / focusDuration` per second (where focusDuration = 3/4/5 s by tier).
  - FX: `fx.setFocusActive(true)` enables CA pass + cyan/green color tint. Audio engines get a low-pass at 350 Hz and pitch-down to match time scale.
- On release or empty meter: `fx.setFocusActive(false)`, time returns to 1.
- **Score multiplier during Focus:** near-miss events worth ×2.

### 6.5 Long Jump (Ctrl + hop)

- If Ctrl is held when a hop key is pressed, target row/cell offset is multiplied by current Long Jump tier (2/3/4 effective rows or cells).
- Clamps to playfield edges (won't shoot off into nothing — partial long jumps land at the boundary).
- Same `HOP_DURATION` — so effective hop velocity is doubled/tripled. Arc height bumped proportionally (`HOP_HEIGHT * sqrt(tier)`).
- Tradeoff: longer commit window, higher overshoot risk, harder to land precisely on a safe stripe. No score bonus for long-jumping.

### 6.6 Echolocation (passive once unlocked)

- DOM panel bottom-right: ~120 px square, semi-transparent.
- **Tier 1 (Lv 7):** for each vehicle within `ECHO_RADIUS` (~30 m) of the frog, draw a dot. Dot size proportional to vehicle size, X mapped to frog-relative X, Y mapped to frog-relative Z (so "forward" = top of panel). Color: white.
- **Tier 2 (Lv 13):** dots gain a short directional arrow showing motion vector. Approaching vehicles redden.
- **Tier 3 (Lv 17+):** dot brightness encodes ETA-to-frog (faint = far, bright = imminent impact).

Use a 2D `<canvas>` overlaid via DOM — keep three.js scene clean. Re-render each frame; cheap.

### 6.7 Ribbit Roar (Q press)

- Use counter shown in HUD: `🐸 ROAR x1` (Lv 9) or `x2` (Lv 15+). Resets to max on each crossing.
- On press (if uses > 0): pick the closest oncoming vehicle (vehicle.direction sign and vehicle distance to frog) within `ROAR_RADIUS` (~25 m), apply `roarBrakeTimer` to it (~1 s); during that timer the vehicle's effective speed is multiplied by 0.5.
- Audio: massive low-pitched frog ROAR (procedural — sawtooth + noise, ~80 Hz, 0.4 s envelope).
- Visual: brief screen shake (60 ms), the targeted vehicle's wheels render with a temporary red emissive flash.

### 6.8 Lick Thyself (E toggle)

- Press E to activate; auto-deactivates after `LICK_DURATION` (3/4/5 s by tier). Cooldown `LICK_COOLDOWN` (5 s) before next activation.
- During: each vehicle renders a translucent ghost copy of its mesh at its position +0.5 s in the future (`v.x + v.speed * v.direction * 0.5`).
- FX layer: full vaporwave treatment — base color shift to pink/cyan, chromatic aberration cranked higher than Focus, slight wobble (UV displacement noise), engine audio gets reverb wash.
- No score multiplier — this is information, not action.
- Audio: slow descending pitch sweep on activate, ascending sweep on deactivate.

### 6.9 Recombobulation (collectible, auto-consume)

- Up to 3 charges held in `score.recombobulationCharges`.
- When `checkCollision` would kill the frog AND charges > 0:
  - Decrement charges (don't decrement lives).
  - Frog enters a `RECOMBOBULATING` state for 1.5 s. During this state, frog mesh is invisible; a small "puddle" mesh (flattened green disc) is drawn at the impact point.
  - At t=1.0 s, puddle slides backward 1 row in the frog's last hop direction.
  - At t=1.5 s, frog reappears at that row (cellX preserved), state → IDLE, full control restored.
- Audio: gurgling pop on splat, reverse chime on reform.
- HUD shows a row of glowing-bug icons matching held charges.

---

## 7. HUD additions

```
Top-left:    LIVES: 🐸🐸🐸🐸🐸
Top-center:  LEVEL N
Top-right:   SCORE: 12,345    (deaths counter moves under it, smaller)
             COMBO: x3.5 ↑    (when active)
             HI: 47,200       (high score from localStorage)
Mid-bottom:  [████████░░░░░░] FOCUS METER  (only when Frog Focus unlocked)
                              ROAR x2 (when Ribbit Roar unlocked)
                              🪲🪲 (recombobulation charges, when held)
Bottom-right: ECHOLOCATION CANVAS (when unlocked)
Center toasts: "+500 SURVIVED 30s", "THREADED! +900", "RECOMBOBULATED!", existing "LEVEL N"
```

`hud.js` grows but stays DOM-only. No three.js HUD layer.

---

## 8. Audio additions

All procedural, follow `playHop` / `playSquish` / `playWin` patterns:

- `playPickup()` — short crunch (filtered noise burst, ~60 ms) + faint blip.
- `playRecombobulate()` — descending arpeggio over 0.6 s.
- `playRoar()` — ~80 Hz sawtooth + noise, 0.4 s, low-pass filtered.
- `playFocusOn()` / `playFocusOff()` — short whoosh; while active, `setEngineLowpass(350)` and pitch-multiply by `WORLD_TIME_SCALE_FOCUS` on the running engine voices.
- `playLickOn()` / `playLickOff()` — slow descending/ascending sweeps. While active, route engine bus through a reverb send.
- `playMilestoneFlash()` — chunky chiptune sting (3-note ascending major arpeggio).
- Combo events: `playNearMiss(tier)` — small bell ping for CLOSE, sting for GRAZED, dramatic record-scratch for THREADED.

---

## 9. FX layer

`fx.js` — minimal `EffectComposer` setup:
- `RenderPass` → `ShaderPass` (custom — combined CA + color tint + optional UV wobble).
- Three modes: `off`, `focus`, `lick`. Set via `fx.setMode(name)`. Game switches based on active skills (lick supersedes focus).
- Screen shake: not a post-process — applied as a transient camera-position offset, decay over 60 ms.

The CA shader is ~30 lines: sample R, G, B at three slightly offset UVs based on distance from screen center.

---

## 10. Config tunables

Add to `config.js`:

```js
// --- Lives ---
export const STARTING_LIVES = 5;

// --- Score ---
export const SCORE_THREADED = 300;
export const SCORE_GRAZED = 100;
export const SCORE_CLOSE = 25;
export const COMBO_BUMP_THREADED = 2.0;
export const COMBO_BUMP_GRAZED = 1.5;
export const COMBO_BUMP_CLOSE = 1.2;
export const COMBO_BUMP_BUG = 1.5;
export const COMBO_CAP = 8;
export const COMBO_DECAY_DELAY = 3.0;     // s
export const COMBO_DECAY_TAU = 1.0;        // s

export const GRAZE_RADIUS = 0.5;          // m beyond hitbox
export const CLOSE_RADIUS = 1.5;          // m

export const SURVIVAL_MILESTONES = [30, 60, 90, 120, 150, 180];
export const SURVIVAL_PAYOUTS = [500, 1000, 2000, 4000, 8000, 16000];

export const SCORE_BUG_BASE = 100;
export const FOCUS_NEAR_MISS_MULT = 2;

export const CROSSING_BASE_BONUS = 250;

// --- Bugs ---
export const BUGS_PER_LEVEL = 4;
export const BUG_RISK_WEIGHT = 0.7;
export const RECOMBOBULATION_INTERVAL = 5;
export const RECOMBOBULATION_MAX_CHARGES = 3;
export const RECOMBOBULATION_RESPAWN_DELAY = 1.5;

// --- Frog Focus ---
export const FOCUS_DURATIONS = { 3: 3, 6: 4, 11: 5 };  // unlock-level → seconds
export const WORLD_TIME_SCALE_FOCUS = 0.35;
export const FOCUS_FILL_THREADED = 0.4;
export const FOCUS_FILL_GRAZED = 0.2;
export const FOCUS_FILL_CLOSE = 0.05;
export const FOCUS_FILL_BUG = 0.15;

// --- Long Jump ---
export const LONG_JUMP_TIERS = { 5: 2, 9: 3, 15: 4 };  // unlock-level → multiplier

// --- Echolocation ---
export const ECHO_RADIUS = 30;

// --- Ribbit Roar ---
export const ROAR_USES_BY_LEVEL = { 9: 1, 15: 2 };
export const ROAR_RADIUS = 25;
export const ROAR_BRAKE_DURATION = 1.0;
export const ROAR_BRAKE_FACTOR = 0.5;

// --- Lick Thyself ---
export const LICK_DURATIONS = { 11: 3, 17: 5 };
export const LICK_COOLDOWN = 5;
export const LICK_TRAIL_AHEAD = 0.5;  // s

// --- Tongue ---
export const TONGUE_TIERS = { 1: 0, 13: 1, 17: 2 };  // strafe reach
```

---

## 11. Implementation phases

Each phase ends in a runnable build. Pick up at the first unchecked box.

- [x] **Phase S1 — Score core + lives.** `score.js` with combo, milestones, banking. `hud.js` shows score, combo, lives. Game over flow on lives=0; `localStorage` high score. **Verify** by playing: combo decays, milestones fire, death loses a life, game over wipes score.
- [ ] **Phase S2 — Near-miss detection.** `vehicles.js` gains `nearMiss` substate. `collision.js#detectNearMisses` returns fired events per frame. Wire to `score.js`. **Verify** combo builds when threading wheelbases; CLOSE/GRAZED/THREADED stings fire correctly.
- [ ] **Phase S3 — Bugs (regular only, no Recombobulation yet).** `bugs.js` with risk-weighted level-start placement. Tongue base auto-collects current cell. `playPickup` audio. **Verify** bugs spawn in deadly rows mostly, give points, bump combo.
- [ ] **Phase S4 — Skills framework + unlock table.** `skills.js` with the level-driven enable/tier table. No skill implementations yet — just the registry and HUD reflecting unlocks/tiers. **Verify** correct skills "light up" in HUD on level transitions.
- [ ] **Phase S5 — Frog Focus.** Meter, Shift binding, time-scale on `Spawner.update` and audio engine voices. Score multiplier during Focus. **No FX shader yet** — use a flat color tint via DOM overlay opacity for now.
- [ ] **Phase S6 — Long Jump.** Ctrl modifier in `input.js`. Frog clamps long-hops to playfield. Arc height scales with tier.
- [ ] **Phase S7 — Echolocation tier 1.** Bottom-right canvas, blips for in-range vehicles. Update each frame, no shader work.
- [ ] **Phase S8 — Ribbit Roar.** Q binding. Targets closest oncoming vehicle. `playRoar` + brake timer. HUD use-counter resets per crossing.
- [ ] **Phase S9 — Lick Thyself (no FX yet).** E toggle, ghost-vehicle render (semi-transparent clones at +0.5 s position), DOM-overlay tint for now.
- [ ] **Phase S10 — Recombobulation.** Special bug spawn every 5 levels. `score.recombobulationCharges`. Hook into `checkCollision` flow: if charges > 0, frog enters RECOMBOBULATING instead of DEAD. Puddle mesh, reform animation.
- [ ] **Phase S11 — FX layer (post-processing).** `fx.js` with `EffectComposer` + custom CA/tint shader. Wire Frog Focus and Lick Thyself to it. Replace S5/S9 DOM-overlay placeholders.
- [ ] **Phase S12 — Audio polish.** All near-miss stings, milestone flash, focus/lick sweeps, recombobulate chime. Tune volumes against engine bus.
- [ ] **Phase S13 — Skill upgrade tiers.** Wire all the level-N tier upgrades from §6.2 (Tongue tier 2, Frog Focus 4 s/5 s, Echo tier 2, Long Jump +2/+3, Lick 5 s).
- [ ] **Phase S14 — Polish & tuning.** Tune values from playtest. Adjust bug placement weights, near-miss radii, combo bump curve. Confirm scoring rewards risk and not safety.

---

## 12. Risks & gotchas

1. **Time scale on engine audio.** Web Audio nodes don't have a global "time scale." Frog Focus needs the engine voices to sound slowed AND the engine doppler updates to use the slowed `dt`. Pass an effective dt to `audio.updateEngines` rather than wall-clock dt.
2. **Spawner timer drift.** When Frog Focus slows world time, `Spawner.update(dt * scale)` advances internal lane spawn timers correspondingly. **Don't** also slow the frog's hop tick or the player loses Focus's whole point. Only vehicles + spawner + audio scale; frog and input do not.
3. **Near-miss event firing on vehicle X-crossover.** Easy off-by-one: the moment X crosses, the vehicle is right next to the frog so any near-miss tier should already be set. Test: spawn a vehicle alongside the frog (pre-pop) and verify it fires correctly when it passes — the approach side may have been < 1 frame and need an "already-overlapping at spawn" path.
4. **Long Jump clamping.** A Ctrl+W from row 5 with tier-3 should hop to row 8 — but if `goalRow` is 8 the player crosses, which bypasses any traffic in rows 6 and 7 entirely. That's a feature, not a bug, but note it: long-jumping the goal is an intentional reward for unlocking the skill.
5. **Post-processing pass with `near=0.02`.** `EffectComposer`'s render targets must use a depth texture compatible with the tiny near plane. Test the CA pass against the existing road from a 5 cm POV — if depth-aware effects are added later (DOF, fog blending) they'll be sensitive to this.
6. **Bug-on-stripe vs. bug-on-wheel-row visibility.** A small dark cube on dark asphalt may be invisible from 5 cm. Tweak: add a faint emissive component or a tiny halo. Test against the actual game POV, not a top-down editor view.
7. **Recombobulation racing the death tween.** The existing `Frog.die` triggers a 0.5 s death tween; recombobulation needs to intercept *before* `die()` is called (i.e., in the collision-resolution branch in `game.js`), or the tween will steal the state machine. Add a third pre-death branch: `if (charges > 0) recombobulate(); else frog.die()`.
8. **Skills HUD getting busy.** Six skill states + score + combo + lives + focus meter + roar count + recombobulation icons + echolocation panel = a LOT in the corners. Budget for a CSS pass once the systems land — DOM HUD is cheap to rearrange but easy to make ugly.

---

## 13. Verification (end of plan)

- Score increments on near misses; combo multiplier rises and decays as expected; bank-on-crossing flow works.
- 5 lives, game over wipes score, high score persists in `localStorage`.
- Bugs spawn at level start, weighted toward deadly rows. Recombobulation bug appears on levels 5/10/15 and saves the frog from one fatal hit.
- Frog Focus slows traffic + audio (frog stays full-speed); CA tint visible; meter drains and refills only from action.
- Long Jump (Ctrl) extends hops by tier amount with a higher arc.
- Echolocation panel shows nearby traffic; upgrade adds direction arrows.
- Ribbit Roar slows nearest oncoming vehicle for ~1 s; uses reset on crossing.
- Lick Thyself shows ghost trails; vaporwave visual unmistakable.
- All skills unlock at the listed levels and tier-up at the listed levels.
- No console errors. `npm run build` clean.

---

## 14. Out of scope (deferred to their own plans)

- **Nails on the road** (later-level offensive item — tires blow out, vehicles swerve and explode dramatically). Polish phase.
- **Legend Mode** (1 life run variant, separate high score table).
- **Additional skills** (Thick Hide, screen-shake-as-skill, Bug Magnet, etc.).
- **Score persistence across sessions / leaderboards / multi-run profiles.** Local high score only for now.
- **Skill rebinding UI.** Locked keys for v1.
- **Mobile touch bindings** for skills. Desktop keyboard only.
- **Difficulty tiers within a run** (Frog Focus tuning per run, etc.).

Each is its own plan when the time comes.
