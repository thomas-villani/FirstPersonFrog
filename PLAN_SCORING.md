# Scoring & Skills — Plan

## Context

The MVP shipped (see `PLAN.md` §7 phases 1–10): a runnable first-person Frogger with hop, mouse-look, wheel-collision, level progression, audio doppler, and a death counter. This plan adds the **scoring + XP-driven skill systems** that turn it from a tech demo into a game with a goal worth chasing.

The "wheel-only collision" rule (added during MVP playtest) means **the strip between the front and rear axles is survivable space** — a hop timed into the wheelbase clears a passing vehicle. That mechanic is the **scoring centerpiece**: threading the wheelbase is the highest-reward skill expression in the game.

This plan was reshaped after live playtest. The skill system is now a **tree of tiered unlocks**: seven skill branches, each with up to three tiers, gated behind a frog-level progression that runs on XP earned during play. Skills you unlock change how subsequent crossings play.

Read order when picking this up across sessions:
1. `frogger-fps-spec.md` — original design doc (tone, multiplayer/river stretch goals).
2. `PLAN.md` — MVP build spec; the existing scaffold this plan extends.
3. `CLAUDE.md` — locked design decisions for the live codebase.
4. **This doc** — scoring, XP, and skills design.

---

## 1. Locked design decisions

### Scoring & lives
- **Score banks on crossing.** Each successful crossing adds the level's earned points to your run total. In-progress points (combo + uncollected milestones) are forfeit on death.
- **Banked points are XP.** Every banked point also feeds the XP pool that levels up the frog (see §1.5).
- **5 lives per run.** Death consumes one life and respawns at start. Out of lives = game over → run total is final → reset to a fresh run.
- **Score wipes on game over.** No banked score across runs. The high-score number is "best single run." (Classic arcade.)
- **Risk pays.** All scoring rewards traffic exposure: near-miss combos, in-traffic survival milestones, bugs placed in deadly rows. Standing on a safe stripe earns nothing.

### Skills & progression
- **Per-run progression.** Frog Level + unlocked skills reset on game over. Each run starts as a base frog. (Arcade feel, no persistent power creep.)
- **Two separate "level" concepts.** *World Level* (lane count + traffic difficulty) advances on each crossing — unchanged from MVP. *Frog Level* (skill tree progression) advances when banked XP crosses thresholds. These can — and should — diverge: high-skill players reach Frog Lv 17 in fewer crossings than low-skill players.
- **Fixed unlock table.** Each Frog Level grants exactly one tier-up on a specific skill (occasionally two, late game). No player choice; the order is curated for pacing. Cap: Frog Lv 17.
- **Backward Hop is the Lv 1 unlock.** A fresh frog can only hop forward / strafe. The first level-up enables `S` / `↓`.
- **Active Tongue Flick.** Tongue is bound to **Spacebar**, fires in the player's look direction (yaw projected onto the ground plane), reach scales with tier (1 / 2 / 3 cells).
- **Bug Magnet is Tongue T3.** Once unlocked, bugs within ~3 m of the frog drift toward your `cellX` (passive, alongside the active flick).
- **Plague of Frogs is Ribbit Roar T3.** Bound to its own key (Q) with its own per-level use counter, so you save it for emergencies.
- **Psychedelic Sight unlocks alongside Frog Focus T3.** Passive lane heat-map: each lane's road surface tints red based on imminent danger (vehicles within ~1.5 s of crossing your column).
- **Recombobulation is a leveled skill, not a unique collectible.** Charges scale by tier (1 / 2 / 3). The every-5-levels glowing bug stays as an in-run **top-up** that adds one charge (capped at the player's current tier max).

### FX & visual decisions
- **Frog Focus visual = chromatic aberration + cyan/green tint.** The only post-processing pass.
- **Plague of Frogs visual = brief frog-rain particle burst + green screen tint** (~0.4 s). Sprite layer; no new shader.
- **Bugs are placed at level start** — not a mid-level trickle. Position is fixed for that level instance.

---

## 1.5 XP & frog leveling

**Banked points are XP.** XP accumulates across crossings within a run and is wiped on game over. XP is not consumed on level-up; thresholds are cumulative.

**XP thresholds (cumulative).** Quadratic curve so early levels come fast, late levels demand sustained skilled play. Formula: `XP_FOR(N) = XP_PER_LEVEL_BASE * N * (N-1) / 2` with `XP_PER_LEVEL_BASE = 500`.

```
Frog Lv 2 :    500 XP (cumulative)
Frog Lv 3 :   1500
Frog Lv 4 :   3000
Frog Lv 5 :   5000
Frog Lv 6 :   7500
Frog Lv 7 :  10500
Frog Lv 8 :  14000
Frog Lv 9 :  18000
Frog Lv 10:  22500
Frog Lv 11:  27500
Frog Lv 12:  33000
Frog Lv 13:  39000
Frog Lv 14:  45500
Frog Lv 15:  52500
Frog Lv 16:  60000
Frog Lv 17:  68000
```

**Level-up moment.** When banking on a crossing causes XP to cross a threshold, fire a level-up flow: brief HUD flash, "FROG LEVEL 5 — Long Jump unlocked!" toast, audio sting (`playLevelUp`). Multiple level-ups per crossing are possible (a high-combo crossing can pop several at once).

**HUD.** `FROG Lv 5  (3,200 / 5,000)` next to `WORLD Lv 8`. Small XP progress bar under it.

---

## 2. File layout additions

```
src/
  main.js            # (existing)
  game.js            # extends: lives, score wiring, XP/level wiring, skill update loop
  config.js          # extends: scoring/XP/skills tunables
  world.js           # (existing) — Psychedelic Sight road-tint hook lives here
  frog.js            # extends: long-jump support, recombobulation hook
  input.js           # extends: Space (tongue), Shift/Ctrl/E/Q bindings, backward-hop skill check
  vehicles.js        # extends: nearMiss substate per vehicle
  spawner.js         # extends: ribbit-roar braking hook, plague hard-stop hook
  collision.js       # extends: detectNearMisses() returning fired events
  audio.js           # extends: playPickup, playTongueFlick, playRoar, playPlague, playFocus, playLevelUp, playRecombobulate
  hud.js             # extends: score, combo, lives, focus meter, frog-level + XP bar, skill state, milestone flashes
  score.js           # NEW — run state: score, XP, frog level, combo, milestones, lives, banking
  bugs.js            # NEW — bug entity, level-start placement, recombob top-up bug, magnet drift
  skills.js          # NEW — skill registry, fixed unlock table, per-skill tier state, queries
  tongue.js          # NEW — directional flick projection, capsule hit-test, visual cylinder
  fx.js              # NEW — post-processing pass (CA + tint), screen shake, milestone toast, plague flash, level-up flash
```

`score.js`, `skills.js`, `bugs.js`, `tongue.js`, `fx.js` are the new modules. Everything else is extension.

---

## 3. Coordinate / data model

No coordinate-system changes. Bugs use the existing sub-row grid (`{ row, cellX }`). Vehicles gain a `nearMiss` substate (`{ minWheelDist, minBodyDist, threadedAtSomePoint, fired }`), reset on spawn, evaluated each frame, fired when the vehicle's X passes the frog's X.

Tongue flick uses a world-space capsule from the camera position along yaw-projected forward (pitch ignored).

---

## 4. Score model

### 4.1 Combo near-miss multiplier

Each frame, for every vehicle within proximity of the frog, evaluate:

- **THREADED** — vehicle body overlaps frog X **and** frog Z is strictly between the two wheel-row Z values for the vehicle. Worth most.
- **GRAZED** — closest wheel center within `GRAZE_RADIUS` (~0.5 m) of frog hitbox edge, not killed. Mid tier.
- **CLOSE** — vehicle body center within `CLOSE_RADIUS` (~1.5 m) of frog X, no wheel within graze. Low tier.

Detection writes to `vehicle.nearMiss`. When the vehicle's X crosses the frog's X (sign flip of `(v.x - frog.x) * v.direction`), or the vehicle exits proximity, the **highest tier achieved** during that approach fires as one event.

| Event | Base points | Combo multiplier bump |
|---|---|---|
| THREADED | 300 | ×2 |
| GRAZED | 100 | ×1.5 |
| CLOSE | 25 | ×1.2 (capped at ×3 from this tier alone) |

Combo cap ×8. Decays exponentially toward ×1 after `COMBO_DECAY_DELAY` (3 s) of no near-miss with rate `COMBO_DECAY_TAU` (~1 s).

### 4.2 In-traffic survival milestones

Track `inTrafficSeconds` — accumulates only while the frog's row is **not** the start median, **not** the goal median, and **not** a safe divider stripe (the lane's last sub-row). Resets on death or banking.

Milestones at `[30, 60, 90, 120, 150, 180]` s with payouts `[500, 1000, 2000, 4000, 8000, 16000]` (doubling). HUD: chunky toast for 1 s.

### 4.3 Bug pickups

Base 100 points × current combo multiplier × current milestone tier multiplier (1×, 2×, 4×, 8×… mirroring the milestone tiers).

Bug pickup also bumps the combo multiplier ×1.5 (same as GRAZED) — keeps the combo alive when there's no traffic.

### 4.4 Crossing bonus

`CROSSING_BASE_BONUS × world_level` on each crossing. All currently-earned points are then **banked into the run total AND the XP pool**. After banking, run XP-threshold check; fire level-up flow if any thresholds crossed.

### 4.5 Lives & game over

`STARTING_LIVES = 5`. Death decrements lives and respawns at start. When `lives === 0`:
- Banked run total finalized as score; compared against `localStorage` high score.
- Frog Level + unlocked skills + XP all reset to 0.
- Reset to a fresh run on next pointer-lock acquire.

A Recombobulation charge consumed during a hit does NOT decrement lives.

---

## 5. Bugs

### 5.1 Placement

`bugs.js#placeBugsForLevel(level)` runs during `Game._buildLevel` after `Spawner.prePopulate`. Places `BUGS_PER_LEVEL` (3–5, scales mildly with world level) regular bugs, plus one Recombobulation top-up bug if `level % RECOMB_TOP_UP_BUG_INTERVAL === 0`.

Risk-weighted placement:
- 70 %: bug on a wheel-path sub-row of a random lane (deadly row).
- 30 %: bug on a safe sub-row (lane's last sub-row, divider stripe).
- Random `cellX` uniform in `[-STRAFE_MAX, STRAFE_MAX]`.
- No two bugs on the same `(row, cellX)` cell.

The Recombobulation top-up bug always lands on a wheel-path row of the most-trafficked lane.

### 5.2 Visual

- Regular bug: `BoxGeometry(0.18, 0.06, 0.18)`, dark-brown `MeshLambertMaterial`, slight Y rotation per bug. Sits at `y = 0.03` so it's visible from 5 cm POV. Add a faint emissive component so it doesn't disappear on dark asphalt.
- Recombob top-up bug: `SphereGeometry(0.12, 8, 6)`, emissive magenta/cyan oscillating material. Slow Y bob and rotation. Subtle point-light below it.

### 5.3 Collection

- **Mercy auto-collect:** any bug at the frog's exact `(row, cellX)` is collected on landing. Catches the easy case so the player isn't stuck on an under-foot bug.
- **Tongue Flick (active):** Spacebar fires the tongue (§6.3) — primary collection mechanic at tier 2+.
- **Bug Magnet (Tongue T3 passive):** bugs within `BUG_MAGNET_RADIUS` (3 m) drift toward `frog.cellX` at `BUG_MAGNET_DRIFT_SPEED` (0.5 m/s) while the frog is `IDLE`.

On collection: `bugCollected` event into `score.js`. `playPickup()`. Dispose mesh.
On Recombob top-up: push onto `score.recombobulationCharges` (capped at current tier max). `playRecombobulate()`. Dispose mesh. (No-op on charge add if already capped — bug is still consumed and grants regular bug points.)

---

## 6. Skills framework

### 6.1 Key bindings

| Input | Skill |
|---|---|
| WASD / arrows | Hop (existing) |
| Mouse | Look (existing) |
| **S / ↓** | Backward Hop (gated on Frog Lv 1) |
| **Space (press)** | Tongue Flick (gated on Frog Lv 2) |
| **Shift (hold)** | Frog Focus (gated on Frog Lv 3) |
| **Ctrl + WASD** | Long Jump modifier (gated on Frog Lv 5) |
| **E (press)** | Ribbit Roar (gated on Frog Lv 9) |
| **Q (press)** | Plague of Frogs (gated on Frog Lv 17) |
| (passive) | Recombobulation charges (Frog Lv 4+) |
| (passive) | Echolocation (Frog Lv 7+) |
| (passive) | Bug Magnet (Frog Lv 12+, sub-tier of Tongue) |
| (passive) | Psychedelic Sight (Frog Lv 15+, sub-tier of Focus) |

### 6.2 Unlock table

```
Frog Lv 1 : Backward Hop enabled.
Frog Lv 2 : Tongue Flick T1 (1-cell reach).
Frog Lv 3 : Frog Focus T1 (3 s slow-mo).
Frog Lv 4 : Recombobulation T1 (1 charge cap).
Frog Lv 5 : Long Jump T1 (2× distance).
Frog Lv 6 : Tongue Flick T2 (2-cell reach).
Frog Lv 7 : Echolocation T1 (rear-cone blips).
Frog Lv 8 : Frog Focus T2 (4 s).
Frog Lv 9 : Ribbit Roar T1 (1 use/level, ~25 m radius).
Frog Lv 10: Recombobulation T2 (2 charges cap).
Frog Lv 11: Long Jump T2 (3× distance).
Frog Lv 12: Tongue Flick T3 (3-cell reach) + Bug Magnet (passive cellX drift).
Frog Lv 13: Echolocation T2 (direction arrows + reddened approach).
Frog Lv 14: Ribbit Roar T2 (2 uses/level, ~35 m radius).
Frog Lv 15: Frog Focus T3 (5 s) + Psychedelic Sight (passive lane heat-map).
Frog Lv 16: Long Jump T3 (4× distance, base hop 15 % faster) + Recombobulation T3 (3 charges cap).
Frog Lv 17: Plague of Frogs (Ribbit Roar T3, on Q, 1 use/level) + Echolocation T3 (ETA shading).
```

`skills.js` owns this table as a static array. `Skills.update(frogLevel)` toggles enabled state and tier whenever a level-up fires.

### 6.3 Tongue Flick (active, Spacebar)

Pressing Space fires the tongue in the player's **horizontal look direction** (camera yaw projected onto the XZ plane — pitch ignored, so looking up doesn't shoot the tongue into the sky).

Mechanics:
- Tongue is a capsule from camera position offset 0.1 m forward, extending `range = tier * CELL_WIDTH` meters along yaw-forward. Capsule radius `TONGUE_CAPSULE_RADIUS` (0.5 m).
- Any bug intersecting the capsule is collected. Closest first if multiple.
- Flick fires regardless of frog state (works while `IDLE` or `HOPPING`). Cooldown `TONGUE_COOLDOWN` (~0.3 s) between flicks.
- Visual: bright pink `CylinderGeometry` shoots out from camera POV along yaw-forward, scaled to range, retracts in 80 ms.
- Audio: `playTongueFlick()` — short whip.

Tiers:
- **T1 (Frog Lv 2):** 1 cell reach (~1 m).
- **T2 (Frog Lv 6):** 2 cells reach (~2 m).
- **T3 (Frog Lv 12):** 3 cells reach (~3 m). Also unlocks **Bug Magnet** passive (see §5.3).

Mercy auto-collect on `(row, cellX)` exact match still applies regardless of tier — never let the player get stuck on an under-foot bug.

### 6.4 Frog Focus (Shift hold)

- Meter `[0, 1]` fills from near-miss events (THREADED +0.4, GRAZED +0.2, CLOSE +0.05) and bug pickups (+0.15). Caps at 1.
- Renders as a thin horizontal bar bottom-center.
- While Shift is held AND meter > 0:
  - World time scale `WORLD_TIME_SCALE_FOCUS` (0.35) applied to vehicle motion + spawner timers + audio engine pitch (proportional). Frog hop and input run at normal speed.
  - Meter drains at `1 / focusDuration` per second (focusDuration = 3 / 4 / 5 s by tier).
  - FX: `fx.setFocusActive(true)` enables CA + cyan/green tint pass. Audio engines low-pass at 350 Hz.
- On release or empty: `fx.setFocusActive(false)`, time returns to 1.
- **Score multiplier during Focus:** near-miss events worth ×2.

**T3 also enables Psychedelic Sight passive** (§6.10).

### 6.5 Long Jump (Ctrl + hop)

- Ctrl held + hop key = target offset multiplied by current Long Jump tier (2 / 3 / 4 effective rows or cells).
- Clamps to playfield edges (partial long jumps land at the boundary — won't fall off the map).
- Same `HOP_DURATION` for the long-jump itself, so effective hop velocity scales by tier. Arc height scales by `sqrt(tier)`.

**T3 (Frog Lv 16):** base `HOP_DURATION` reduced 15 % globally (`LONG_JUMP_T3_HOP_SPEEDUP = 0.85`) — *every* hop lands faster, not just long jumps. Subtle but felt across a long crossing.

No score bonus for long-jumping. Tradeoff: longer commit window, harder to land on a safe stripe.

### 6.6 Echolocation (passive once unlocked)

Bottom-right DOM canvas, ~120 px square, semi-transparent.

- **T1 (Lv 7):** for each vehicle within `ECHO_RADIUS` (~30 m), draw a white dot. Size ~ vehicle size. Position = frog-relative `(X, Z)` (forward = top of panel).
- **T2 (Lv 13):** dots get short directional arrows. Approaching vehicles redden.
- **T3 (Lv 17):** dot brightness encodes ETA-to-frog (faint = far, bright = imminent).

2D `<canvas>` overlay. Re-render each frame; cheap.

### 6.7 Ribbit Roar (E press)

- HUD: `🐸 ROAR x1` (Lv 9) or `x2` (Lv 14+). Resets to max on each crossing.
- On press (uses > 0): pick the closest oncoming vehicle within `ROAR_RADIUS` (25 m at T1, 35 m at T2). Apply `roarBrakeTimer` (~1 s); during it, vehicle's effective speed × 0.5.
- Audio: `playRoar()` — sawtooth + noise, ~80 Hz, 0.4 s envelope, low-pass.
- Visual: brief screen shake (60 ms); target's wheels flash red emissive.

### 6.8 Plague of Frogs (Q press, Ribbit Roar T3)

Unlocks at Frog Lv 17 on its own key (Q), with its own per-level use counter — separate from base Roar so the player saves it for an emergency.

- HUD: `🐸🐸🐸 PLAGUE x1`. Resets to 1 on each crossing.
- On press: every vehicle in the world has speed × 0 for `PLAGUE_DURATION` (1.5 s). Resumes at full speed afterward.
- Visual: ~30 small green frog quads rain from `y = 8` to `y = 0` with random `x` over 0.4 s, then despawn. Pool-recycled. Plus a green tint pulse via `fx.flashPlague()`.
- Audio: `playPlague()` — chorus of 8 detuned ribbits + 40 Hz rumble, 0.6 s.
- 1 use per level only; no within-level repeat.

### 6.9 Recombobulation (passive, leveled)

Charges held in `score.recombobulationCharges`. Tier-gated cap: T1 = 1 (Lv 4), T2 = 2 (Lv 10), T3 = 3 (Lv 16).

When `checkCollision` would kill the frog AND `charges > 0`:
- Decrement charges (don't decrement lives).
- Frog enters `RECOMBOBULATING` state for 1.5 s. Mesh invisible; "puddle" mesh (flattened green disc) at impact point.
- At t = 1.0 s, puddle slides backward 1 row in the frog's last hop direction.
- At t = 1.5 s, frog reappears at that row (cellX preserved), state → IDLE.

**Top-up bug:** every `RECOMB_TOP_UP_BUG_INTERVAL` (5) world levels, a glowing bug spawns. Collecting it adds +1 charge, capped at the player's current tier max (no-op overflow, but bug still grants regular points).

**Init:** when Recombob T1 first unlocks (mid-run), the player is granted 1 charge immediately so the unlock feels like a reward, not just a future-tense capability.

HUD: row of glowing-bug icons matching held charges.

### 6.10 Psychedelic Sight (passive, unlocks with Frog Focus T3)

Passive at Frog Lv 15. Each lane's road surface tints toward red based on **imminent danger to the frog at their current `cellX`**:

- For each lane, find the closest vehicle whose path will cross the frog's column.
- Compute `eta = abs(v.x - frog.x) / (v.speed * world_speed_multiplier)`.
- If `eta < SIGHT_DANGER_WINDOW` (1.5 s), tint that lane's road material toward `SIGHT_TINT_COLOR` with opacity `1 - eta / SIGHT_DANGER_WINDOW`.
- Implementation: per-lane road-surface emissive offset, updated each frame. One material per lane.

Distinct from Echolocation (where vehicles ARE) — Sight shows where it's UNSAFE TO STAND.

### 6.11 Backward Hop (passive, Frog Lv 1)

Pure input gate. `frog.tryHop` already accepts negative `dRow` (`frog.js:75-92`); the gate is at the input layer:

```js
case 'KeyS': case 'ArrowDown':
  if (this.game.skills.has('backwardHop')) frog.tryHop(-1, 0);
  break;
```

Pressing `S` / `↓` before Frog Lv 1 is reached is silently ignored (matches the "drop mid-hop input" tone — no error feedback).

---

## 7. HUD additions

```
Top-left:    LIVES: 🐸🐸🐸🐸🐸                       (existing extension)
             FROG Lv 5  (3,200 / 5,000)              (new — XP bar under it)
Top-center:  WORLD Lv N                               (renamed from LEVEL N)
Top-right:   SCORE: 12,345                            (existing extension)
             COMBO: x3.5 ↑ (when active)
             HI: 47,200    (high score from localStorage)
Mid-bottom:  [████████░░░░░░] FOCUS METER             (only when Frog Focus unlocked)
                              ROAR x2 / PLAGUE x1     (when those skills unlocked)
                              🪲🪲 (recombob charges)
Bottom-right: ECHOLOCATION CANVAS                     (when unlocked)
Center toasts: "+500 SURVIVED 30s", "THREADED! +900",
              "FROG LEVEL 5 — Long Jump unlocked!",
              "RECOMBOBULATED!", existing "WORLD Lv N"
```

`hud.js` grows but stays DOM-only. No three.js HUD layer.

---

## 8. Audio additions

All procedural, follow `playHop` / `playSquish` / `playWin` patterns:

- `playPickup()` — short crunch (filtered noise burst, ~60 ms) + faint blip.
- `playTongueFlick()` — short whip (highpass-filtered noise descending, ~80 ms).
- `playRecombobulate()` — descending arpeggio over 0.6 s.
- `playRoar()` — ~80 Hz sawtooth + noise, 0.4 s, low-pass filtered.
- `playPlague()` — chorus of 8 detuned ribbits + 40 Hz rumble, 0.6 s.
- `playFocusOn()` / `playFocusOff()` — short whoosh; while active, `setEngineLowpass(350)` and pitch-multiply by `WORLD_TIME_SCALE_FOCUS`.
- `playLevelUp()` — chiptune ascending 4-note arpeggio with a sparkle.
- `playMilestoneFlash()` — chunky 3-note major arpeggio.
- `playNearMiss(tier)` — bell ping (CLOSE), sting (GRAZED), record-scratch (THREADED).

---

## 9. FX layer

`fx.js` — minimal `EffectComposer`:
- `RenderPass` → `ShaderPass` (custom — combined CA + color tint, ~30 lines).
- Two persistent modes: `off`, `focus`. Set via `fx.setMode(name)`.
- **Plague flash:** transient green-tint pulse via the same shader (uniform-driven), plus a frog-rain sprite layer in the scene (separate from post-processing).
- **Level-up flash:** transient gold-tint pulse, 0.3 s.
- **Screen shake:** transient camera-position offset, 60 ms decay (existing approach).

CA shader samples R/G/B at three slightly offset UVs based on distance from screen center.

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

// --- XP / Frog Level ---
export const XP_PER_LEVEL_BASE = 500;     // XP for Lv N = base * N * (N-1) / 2
export const FROG_LEVEL_CAP = 17;

// --- Bugs ---
export const BUGS_PER_LEVEL = 4;
export const BUG_RISK_WEIGHT = 0.7;

// --- Tongue Flick ---
export const TONGUE_TIER_RANGES = [0, 1, 2, 3];      // cells, indexed by tier (0 = locked)
export const TONGUE_CAPSULE_RADIUS = 0.5;             // m
export const TONGUE_COOLDOWN = 0.3;                   // s
export const TONGUE_FLICK_DURATION = 0.08;            // s (visual + collision window)
export const BUG_MAGNET_RADIUS = 3.0;                 // m (Tongue T3 passive)
export const BUG_MAGNET_DRIFT_SPEED = 0.5;            // m/s

// --- Frog Focus ---
export const FOCUS_DURATIONS = [0, 3, 4, 5];          // s by tier
export const WORLD_TIME_SCALE_FOCUS = 0.35;
export const FOCUS_FILL_THREADED = 0.4;
export const FOCUS_FILL_GRAZED = 0.2;
export const FOCUS_FILL_CLOSE = 0.05;
export const FOCUS_FILL_BUG = 0.15;

// --- Long Jump ---
export const LONG_JUMP_TIERS = [1, 2, 3, 4];          // multiplier by tier
export const LONG_JUMP_T3_HOP_SPEEDUP = 0.85;         // base HOP_DURATION multiplier at T3

// --- Echolocation ---
export const ECHO_RADIUS = 30;                        // m

// --- Ribbit Roar ---
export const ROAR_USES_BY_TIER = [0, 1, 2];           // by tier
export const ROAR_RADIUS_BY_TIER = [0, 25, 35];       // m by tier
export const ROAR_BRAKE_DURATION = 1.0;               // s
export const ROAR_BRAKE_FACTOR = 0.5;

// --- Plague of Frogs ---
export const PLAGUE_USES_PER_LEVEL = 1;
export const PLAGUE_DURATION = 1.5;                   // s of full vehicle stop

// --- Recombobulation ---
export const RECOMB_CHARGES_BY_TIER = [0, 1, 2, 3];
export const RECOMB_TOP_UP_BUG_INTERVAL = 5;          // world levels
export const RECOMB_RESPAWN_DELAY = 1.5;              // s

// --- Psychedelic Sight ---
export const SIGHT_DANGER_WINDOW = 1.5;               // s ETA for max red
export const SIGHT_TINT_COLOR = 0xff3333;
```

---

## 11. Implementation phases

Each phase ends in a runnable build. Pick up at the first unchecked box.

- [x] **Phase S1 — Score core + lives.** `score.js` with combo, milestones, banking; HUD shows score / combo / lives; `localStorage` high score; game-over flow on lives = 0.
- [x] **Phase S2 — Near-miss detection.** `vehicles.js` `nearMiss` substate; `collision.detectNearMisses()` returns events; wired to `score.js`.
- [ ] **Phase S3 — XP + frog-level scaffolding.** `score.js` adds `xp`, `frogLevel`, threshold check on bank. `skills.js` registry with the unlock table. HUD shows `FROG Lv N (xp/threshold)`. Level-up toast + `playLevelUp` sting on threshold cross. **No skill effects yet** — just the registry. **Verify** XP accumulates, level-ups fire on threshold, game over wipes XP and skills.
- [ ] **Phase S4 — Backward Hop (Lv 1) + Bugs (regular only) + Tongue Flick T1 (Lv 2).** `input.js` skill-gates `S`/`↓`. `bugs.js` placement (regular bugs only — no top-up yet). `tongue.js` capsule from camera yaw, visual cylinder, `playTongueFlick`. **Verify** fresh frog can't hop back; first level-up adds it; Spacebar grabs bugs in front.
- [ ] **Phase S5 — Frog Focus (Lv 3).** Meter, Shift binding, time-scale on `Spawner.update` + audio. Score multiplier during Focus. Use a flat DOM-overlay tint as placeholder until S14.
- [ ] **Phase S6 — Recombobulation T1 (Lv 4).** Hook into collision flow before `frog.die()`. Grant 1 charge on unlock. Puddle mesh + reform animation. No top-up bug yet.
- [ ] **Phase S7 — Long Jump T1 (Lv 5).** Ctrl modifier in `input.js`. Frog clamps long-hops to playfield. Arc height scales with tier.
- [ ] **Phase S8 — Tongue T2/T3 + Bug Magnet (Lv 6, 12).** Range scaling. Bug Magnet drift logic in `bugs.js`.
- [ ] **Phase S9 — Echolocation T1 (Lv 7).** Bottom-right canvas, blips for in-range vehicles.
- [ ] **Phase S10 — Frog Focus T2/T3 + Psychedelic Sight (Lv 8, 15).** Tier scaling. Sight road-tint hook in `world.js`.
- [ ] **Phase S11 — Ribbit Roar T1/T2 (Lv 9, 14).** E binding, closest-oncoming target, brake timer, screen shake, wheel-flash. Use counter resets per crossing.
- [ ] **Phase S12 — Recombobulation T2/T3 + top-up bug (Lv 10, 16, every 5).** Tier-cap charge bumps. Top-up bug spawn + collection.
- [ ] **Phase S13 — Long Jump T2/T3 (Lv 11, 16).** Includes `LONG_JUMP_T3_HOP_SPEEDUP` global hop speed-up.
- [ ] **Phase S14 — Echolocation T2/T3 (Lv 13, 17).** Direction arrows + ETA shading.
- [ ] **Phase S15 — Plague of Frogs (Lv 17, on Q).** Separate use counter. All-vehicle hard stop. Frog-rain sprite layer + green flash + `playPlague`.
- [ ] **Phase S16 — FX layer (post-processing).** `EffectComposer` + CA/tint shader. Wire Frog Focus (replace S5 placeholder) and Plague flash and level-up flash.
- [ ] **Phase S17 — Audio polish.** All near-miss stings, tongue flick, plague chorus, focus sweeps, level-up sting, recombob chime. Tune volumes against engine bus.
- [ ] **Phase S18 — Polish & tuning.** XP curve, bug placement weights, near-miss radii, combo bump curve. Confirm scoring + leveling rewards risk and not safety. CSS pass on HUD.

---

## 12. Risks & gotchas

1. **Time scale on engine audio.** Web Audio doesn't have a global time scale. Frog Focus needs engines to sound slowed AND doppler updates to use the slowed `dt`. Pass effective `dt` to `audio.updateEngines`, not wall-clock.
2. **Spawner timer drift under Focus.** `Spawner.update(dt * scale)` slows lane spawn timers correctly. **Don't** also slow the frog's hop tick or the player loses Focus's whole point. Only vehicles + spawner + audio scale; frog and input do not.
3. **Near-miss event firing on vehicle X-crossover.** Easy off-by-one: the moment X crosses, the vehicle is right next to the frog so any near-miss tier should already be set. Test: spawn a vehicle alongside the frog (pre-pop) and verify it fires correctly when it passes — the approach side may have been < 1 frame and need an "already-overlapping at spawn" path.
4. **Long Jump clamping.** Ctrl + W from row 5 with tier-3 (4× = 4 rows) should hop to row 9 — but if `goalRow = 8`, the player crosses, bypassing rows 6–7 traffic. That's a feature, not a bug — long-jumping the goal is an intentional reward — but it interacts oddly with combo decay (no near-misses to score). Note in playtest.
5. **Tongue flick yaw projection.** Camera uses `YXZ` rotation order; pitch is `rotation.x`, yaw is `rotation.y`. Forward direction in world = `new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)`, then zero out Y and renormalize. Test: aim straight up — tongue should still fire horizontally in look direction.
6. **Plague hard-stop and resume.** Vehicles' speed must restore to original after `PLAGUE_DURATION`, not to whatever speed-multiplier was active when Plague fired. Store original speeds; restore from snapshot.
7. **XP overflow / multiple level-ups per crossing.** Banking 50 k points on a single high-combo crossing may cross several thresholds. `score.applyBank()` must loop on threshold check, fire `Skills.update(N)` for each level reached, and queue toasts (not stack them visually — show first, queue rest with 0.4 s gap).
8. **Recombobulation racing the death tween.** `Frog.die` sets state = DEAD and starts a 0.5 s tween; recombob must intercept *before* `die()` is called (in `game.js#checkCollision`), or the tween steals state.
9. **Psychedelic Sight perf with many lanes.** At World Lv 15+ with 8 lanes, per-frame ETA scan of every vehicle in every lane is `O(lanes × vehicles)` — fine at MVP scale (~24 vehicles total) but flag for profiling. Closest-vehicle-per-lane cache invalidates on spawn/despawn.
10. **HUD getting busy.** Frog Lv + XP bar + score + combo + lives + focus meter + roar count + plague count + recombob icons + echolocation panel = a LOT. Budget for a CSS pass at S18; DOM HUD is cheap to rearrange but easy to make ugly.

---

## 13. Verification (end of plan)

- Score increments on near misses; combo multiplier rises and decays as expected; bank-on-crossing flow works.
- 5 lives, game over wipes score + Frog Level + XP + skills; high score persists in `localStorage`.
- XP accumulates on banking; level-ups fire on threshold cross; multiple level-ups in one crossing show a toast queue.
- Bugs spawn at level start, weighted toward deadly rows. Recombob top-up bug appears every 5 world levels and adds a charge (capped at current Recombob tier).
- Backward Hop blocked at Frog Lv 0; enabled at Lv 1.
- Spacebar fires tongue in look direction; reach scales 1 / 2 / 3 cells with tier; Bug Magnet drift visible at T3.
- Frog Focus slows traffic + audio (frog stays full-speed); CA tint visible at S16+; meter drains and refills only from action; Psychedelic Sight road-tint visible at T3.
- Long Jump (Ctrl) extends hops by tier; T3 makes every hop snappier.
- Echolocation panel shows nearby traffic; tier upgrades add direction arrows and ETA shading.
- Ribbit Roar slows nearest oncoming vehicle ~1 s; uses reset on crossing; T2 has bigger radius.
- Plague of Frogs (Q at Lv 17) hard-stops all traffic 1.5 s with frog-rain visual; 1 use/level.
- Recombobulation absorbs a fatal hit without losing a life; charges shown in HUD.
- All skills unlock at the listed levels and tier-up at the listed levels.
- No console errors. `npm run build` clean.

---

## 14. Out of scope (deferred to their own plans)

- **Lick Thyself.** The original "ghost-vehicle preview at +0.5 s" toggle. Cut because Echolocation T2/T3 + Psychedelic Sight already cover predictive information, and the vaporwave FX shader is heavy work for a redundant skill.
- **Like an Ox.** Active inflate-to-block-a-lane skill from initial brainstorm. Saved for a future "ultimates" expansion.
- **Storm of the Aztec.** Active rain-slows-traffic skill. Same — future ultimates expansion.
- **Acidic Tongue.** Active grab-and-drag-vehicle-off-road skill. Same — future ultimates expansion.
- **Persistent skill tree across runs.** Roguelite progression deferred. Per-run only for now.
- **Skill rebinding UI / pause-menu loadout.** Locked keys for v1.
- **Nails on the road** (later-level offensive item — tires blow out, vehicles swerve and explode). Polish phase.
- **Legend Mode** (1-life run variant, separate high score).
- **Score persistence across sessions / leaderboards / multi-run profiles.** Local high score only.
- **Mobile touch bindings.**

Each is its own plan when the time comes.
