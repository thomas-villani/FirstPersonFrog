# Scoring & Skills — Plan

## Context

The MVP shipped (see `PLAN.md` §7 phases 1–10): a runnable first-person Frogger with hop, mouse-look, wheel-collision, level progression, audio doppler, and a death counter. This plan adds the **scoring + XP-driven skill systems** that turn it from a tech demo into a game with a goal worth chasing.

The "wheel-only collision" rule (added during MVP playtest) means **the strip between the front and rear axles is survivable space** — a hop timed into the wheelbase clears a passing vehicle. That mechanic is the **scoring centerpiece**: threading the wheelbase is the highest-reward skill expression in the game.

This plan was reshaped twice. The original design auto-unlocked skills on a fixed table per frog level. The current design is **RPG-style branch investment**: 4 themed skill branches (🥋 Tongue Fu, 🐰 Hip Hopping, 🧘 Frogcentration, 🎩 Hocus Croakus), each with 7 sequential tiers. Each frog-level-up earns the player one skill point; spend it on a branch to advance to its next tier. Tongue Fu T1 is pre-spent at run start so the player always has a basic tongue from the first hop.

Read order when picking this up across sessions:
1. `frogger-fps-spec.md` — original design doc (tone, multiplayer/river stretch goals).
2. `PLAN.md` — MVP build spec; the existing scaffold this plan extends.
3. `CLAUDE.md` — locked design decisions for the live codebase.
4. **This doc** — scoring, XP, and skill-tree design.

---

## 1. Locked design decisions

### Scoring & lives
- **Score banks on crossing.** Each successful crossing adds the level's earned points to your run total. In-progress points (combo + uncollected milestones) are forfeit on death.
- **Banked points are XP.** Every banked point also feeds the XP pool that levels up the frog (see §1.5).
- **5 lives per run.** Death consumes one life and respawns at start. Out of lives = game over → run total is final → reset to a fresh run.
- **Score wipes on game over.** No banked score across runs. The high-score number is "best single run." (Classic arcade.)
- **Risk pays.** All scoring rewards traffic exposure: near-miss combos, in-traffic survival milestones, bugs placed in deadly rows. Standing on a safe stripe earns nothing.

### Skills & progression
- **Per-run progression.** Branch tiers + earned skill points reset on game over. Each run starts as a base frog with Tongue Fu T1 pre-spent.
- **Two separate "level" concepts.** *World Level* (lane count + traffic difficulty) advances on each crossing. *Frog Level* (skill points earned) advances when banked XP crosses thresholds. They diverge — high-skill players hit Frog Lv 28 in fewer crossings.
- **One point per frog level.** Each frog-level-up grants exactly one skill point. The player chooses which branch to spend it on.
- **Forced sequential within a branch.** No tier skipping. Each branch is a 1→7 ladder; spending a point on a branch advances by one tier.
- **Tongue Fu T1 is pre-spent at run start.** A fresh run already has the basic 1-cell Tongue Flick on Spacebar, so the player has *something* interactive from the first hop. The first earnable point is at Frog Lv 2.
- **Frog Level cap = 28.** 27 earnable points + the free Tongue Fu T1 = exactly enough to max all four 7-tier branches. Beyond Lv 28, XP keeps banking but no further unlocks.
- **Skill picker is a between-crossings modal.** When level-up(s) fire, world freezes, modal shows the four branches' next available tier; player presses 1–4 to spend. Multiple queued points show the modal once per point. World resumes when queue empty.
- **Backward Hop is always available** (not gated, not in any branch). A single direction key isn't an interesting unlock.
- **Branch tier is the source of truth in `skills.js`.** Per-mechanic queries are exposed as helpers (`skills.tongueRange()`, `skills.canPlague()`, `skills.recombCap()`). Feature code never compares branch tiers to magic numbers.

### Key bindings

| Input | Mechanic | Branch / tier |
|---|---|---|
| WASD / arrows | Hop | (always) |
| Mouse | Look | (always) |
| **S / ↓** | Backward Hop | (always) |
| **Space** | Tongue Flick | Tongue Fu T1+ (free) |
| **F (toggle)** | Frog Focus | Frogcentration T1+ |
| **Shift + WASD** | Long Jump | Hip Hopping T3+ |
| **E** | Ribbit Roar | Tongue Fu T5+ |
| **Q** | Plague of Frogs | Hocus Croakus T7 |
| (passive) | Recombobulation | Hocus Croakus T1+ |
| (passive) | Bug Magnet | Tongue Fu T3+ |
| (passive) | Echolocation | Frogcentration T5+ |
| (passive) | Psychedelic Sight | Hocus Croakus T4+ |
| (passive) | Hop Speed bonus | Hip Hopping T1, T2, T4, T5, T6 |

### FX & visual decisions
- **Frog Focus visual = chromatic aberration + cyan/green tint.** The only post-processing pass.
- **Plague of Frogs visual = brief frog-rain particle burst + green screen tint** (~0.4 s). Sprite layer; no new shader.
- **Bugs are placed at level start** — not a mid-level trickle. Position is fixed for that level instance.
- **Skill picker is a DOM modal.** No three.js HUD layer; modal sits over the locked canvas.

---

## 1.5 XP & frog leveling

**Banked points are XP.** XP accumulates across crossings within a run and is wiped on game over. XP is not consumed on level-up; thresholds are cumulative.

**XP thresholds (cumulative).** Quadratic curve: `XP_FOR(N) = XP_PER_LEVEL_BASE * N * (N-1) / 2` with `XP_PER_LEVEL_BASE = 500`.

```
Frog Lv  2:    500 XP    → 1st earnable point
Frog Lv  5:  5,000
Frog Lv 10: 22,500
Frog Lv 15: 52,500
Frog Lv 20: 95,000
Frog Lv 25: 150,000
Frog Lv 28: 189,000      → fully maxed (27 earned + 1 free Tongue Fu T1)
```

The curve is unchanged from the prior plan; only the cap moved (17 → 28). Late-run grind to max may need re-tuning post-playtest — at high tiers the player has all the survival tools and crossings get more lucrative, so growth probably accelerates fine.

**Level-up flow.** When `bankCrossing` causes XP to cross one or more thresholds:
1. Score queues the new levels onto `_levelUpQueue`.
2. Game checks the queue; if non-empty, enters `SKILLPICK` state (world frozen).
3. For each queued level: show picker modal, wait for 1–4 input, call `skills.spend(branchId)`, fire `playLevelUp()` sting + toast.
4. When queue empty: hide modal, advance to PLAYING, `_buildLevel(newWorldLevel)`.

Multiple level-ups on a high-combo crossing produce a sequence of modals — the player chooses each one in turn.

**HUD.** `FROG Lv 5  (3,200 / 5,000)` next to `WORLD Lv 8`. A small permanent badge row showing branch tiers: `🥋 3  🐰 1  🧘 0  🎩 0`.

---

## 2. File layout

The skill rewrite is mostly contained to `skills.js` + the picker UI in `hud.js` + the SKILLPICK state in `game.js`. No new modules.

```
src/
  main.js
  game.js            # adds SKILLPICK state + picker flow
  config.js          # tier-indexed arrays for each mechanic
  world.js           # Psychedelic Sight road-tint hook
  frog.js            # long-jump support, hop-speed scaling, recomb hook
  input.js           # F/E/Q/Shift bindings, picker 1-4 keys
  vehicles.js        # nearMiss substate (existing)
  spawner.js         # ribbit-roar brake hook, plague hard-stop hook
  collision.js       # detectNearMisses (existing)
  audio.js           # tongue, roar, plague, focus, level-up, recomb stings
  hud.js             # FROG Lv + XP bar, branch badges, picker modal,
                     #   focus meter, roar/plague counts, recomb charges,
                     #   echolocation canvas
  score.js           # XP, frog level, level-up queue (existing)
  bugs.js            # placement + magnet drift (existing)
  skills.js          # branches, tier state, spend(), helpers
  tongue.js          # capsule projection + visual (existing)
  fx.js              # NEW — post-processing CA+tint + plague flash + level-up flash
```

`fx.js` is the only new module. `skills.js`, `hud.js`, and `game.js` all need substantial extension.

---

## 3. Coordinate / data model

No coordinate-system changes. Bugs use the existing sub-row grid (`{ row, cellX }`). Vehicles' `nearMiss` substate (`{ tier, threadedHop, lastSign }`) already exists from S2.

Tongue flick uses a world-space capsule from the camera position along yaw-projected forward (pitch ignored — already wired in S4).

---

## 4. Score model

### 4.1 Combo near-miss multiplier
Each frame, for every vehicle within proximity of the frog, evaluate:
- **THREADED** — vehicle body overlaps frog X **and** frog Z is strictly between the two wheel-row Z values **and** the player was airborne (active hop into the wheelbase). Highest reward.
- **UNDER** — same Z geometry as THREADED but the frog was on the ground (passive — no hop). Small consolation payout.
- **GRAZED** — closest wheel center within `GRAZE_RADIUS` (~0.5 m) of frog hitbox edge, not killed. Mid tier.

Detection writes to `vehicle.nearMiss`. Event fires on the vehicle's X-crossover of the frog's X (sign flip of `(v.x - frog.x) * v.direction`).

| Event | Base points | Combo bump |
|---|---|---|
| THREADED | type-specific (300–800; see `VEHICLE_TYPES.scoreThreaded`) | ×2 |
| UNDER | 25 (× current combo, no bump) | none |
| GRAZED | 100 | ×1.5 |

Combo cap ×8. Decays exponentially toward ×1 after `COMBO_DECAY_DELAY` (5 s) of no near-miss with rate `COMBO_DECAY_TAU` (~2.5 s).

### 4.2 In-traffic survival milestones
Track `inTrafficSeconds` — accumulates only while the frog is on a wheel-row sub-row. Resets on death or banking.

Milestones at `[30, 60, 90, 120, 150, 180]` s with payouts `[500, 1000, 2000, 4000, 8000, 16000]` (doubling).

### 4.3 Bug pickups
Base `SCORE_BUG_BASE × bugScoreMult × current combo`. `bugScoreMult` is 1.0 by default and 1.5 once Tongue Fu T4 is reached (Bug Magnet upgrade tier).

Bug pickup also bumps the combo multiplier ×1.5 (same as GRAZED) — keeps the combo alive when there's no traffic.

### 4.4 Crossing bonus
`CROSSING_BASE_BONUS × world_level` on each crossing. All currently-earned points are then **banked into the run total AND the XP pool**.

### 4.5 Untouchable bonus
If the player neither died nor consumed a Recombobulation charge during the level just completed: `UNTOUCHABLE_BONUS_BASE × world_level` is awarded on the bank, and the Frog Focus meter (if unlocked) refills to full. Toast: `UNTOUCHABLE +N`.

### 4.6 Lives & game over
`STARTING_LIVES = 5`. Death decrements lives and respawns at start. When `lives === 0`:
- Banked run total finalized; compared against `localStorage` high score.
- All branch tiers + XP + Frog Level reset.
- Tongue Fu T1 pre-spent again on the new run.

A Recombobulation charge consumed during a hit does NOT decrement lives, but it does disqualify the level from the Untouchable bonus.

---

## 5. Bugs

### 5.1 Placement
`bugs.placeBugsForLevel(level, scene, obstacles)` runs during `Game._buildLevel` after `Spawner.prePopulate`. Places `bugCountForLevel(level)` regular bugs, plus an extra-life bug at fixed intervals (every 10 levels per current code).

Risk-weighted placement:
- 70 % (`BUG_RISK_WEIGHT`): bug on a wheel-path sub-row of a random lane (deadly row).
- 30 %: bug on a safe sub-row (lane's last sub-row, divider stripe).
- Random `cellX` uniform in `[-STRAFE_MAX, STRAFE_MAX]`.
- No two bugs on the same `(row, cellX)` cell; obstacle cells excluded.

### 5.2 Visual
- Regular bug: `BoxGeometry(0.18, 0.06, 0.18)`, dark-brown `MeshLambertMaterial`. Sits at `y = 0.03`. Faint emissive so it doesn't disappear on dark asphalt.
- Extra-life bug: glowing emissive — sphere with point light below. Already wired.

### 5.3 Collection
- **Mercy auto-collect:** any bug at the frog's exact `(row, cellX)` is collected on landing.
- **Tongue Flick (active, all tiers):** Spacebar fires the tongue (§7.1) — primary collection mechanic.
- **Bug Magnet (Tongue Fu T3+ passive):** bugs within `bugMagnetRadius()` (3 m / 5 m at T4) drift toward `frog.cellX` at `BUG_MAGNET_DRIFT_SPEED` (0.5 m/s) while the frog is `IDLE`.

On collection: regular bug → `score.addBugPickup()` + `playPickup()`. Extra-life bug → `score.lives++` + `playLevelUp()` + toast.

---

## 6. Skill branches

Four branches, 7 tiers each. 1 skill point per tier. Forced sequential.

### 6.1 🥋 Tongue Fu — Tongue + Bug Magnet + Ribbit Roar

| Tier | Effect |
|---|---|
| **1** *(free at run start)* | **Tongue Flick T1** — Spacebar fires tongue 1 cell forward in look direction; collects any bug in capsule path. |
| 2 | **Tongue Flick T2** — reach 2 cells. |
| 3 | **Tongue Flick T3** — reach 3 cells; **Bug Magnet** passive: bugs within 3 m drift toward `frog.cellX`. |
| 4 | **Bug Magnet upgrade** — magnet radius 5 m; bugs award ×1.5 score. |
| 5 | **Ribbit Roar T1** — E key, 1 use/crossing, ~25 m radius. Closest oncoming vehicle's effective speed × 0.5 for 1.0 s. |
| 6 | **Roar T2** — brake duration 2.0 s (still 1 use). |
| 7 | **Roar T3** — 2 uses/crossing (still 2.0 s brake). |

### 6.2 🐰 Hip Hopping — Hop Speed + Long Jump

| Tier | Effect |
|---|---|
| 1 | **Hop Speed +5%** (`HOP_DURATION × 0.95` cumulative). |
| 2 | **Hop Speed +5%** (cumulative — total 0.95² ≈ 10% faster). |
| 3 | **Long Jump unlocked** — Shift + WASD = 2× hop distance. Same `HOP_DURATION` → effective velocity scales; arc apex scales by `√2`. |
| 4 | **Hop Speed +5%** (cumulative ≈ 14% faster). |
| 5 | **Hop Speed +5%** (cumulative ≈ 19% faster). |
| 6 | **Hop Speed +5%** (cumulative ≈ 23% faster). |
| 7 | **Double Long Jump** — Long Jump distance doubled (4× normal hop). |

> *Open question for playtest:* "Double Long Jump" could alternatively mean "chain a second long jump while mid-air on the first" (platformer double-jump style). Current spec is the simpler "4× distance" interpretation; flag for review when it's actually wired.

### 6.3 🧘 Frogcentration — Frog Focus + Echolocation

| Tier | Effect |
|---|---|
| 1 | **Frog Focus enabled** — F toggles slow-mo (world × 0.35; frog & input run full-speed). 6 s duration at full meter. Meter fills on near-miss (THREADED +0.4, GRAZED +0.2) and bug pickup (+0.30). |
| 2 | **Focus duration +2 s** (8 s total). |
| 3 | **Focus duration +2 s** (10 s total); **Passive Recharge** — meter fills 0.025/s while idle (40 s to refill from empty). |
| 4 | **Focus duration +2 s** (12 s total); passive recharge doubles to 0.05/s (20 s to refill). |
| 5 | **Echolocation L1** — bottom-right canvas. Current row's lane + immediately-forward lane. White blip per vehicle within ~15 m. |
| 6 | **Echolocation L2** — radius 25 m, current ± 2 lanes. Blips get directional arrows; approaching vehicles redden. |
| 7 | **Echolocation L3** — radius 40 m, all lanes. Blip brightness encodes ETA-to-frog (faint = far, bright = imminent). |

### 6.4 🎩 Hocus Croakus — Recombobulation + Psychedelic Sight + Plague of Frogs

| Tier | Effect |
|---|---|
| 1 | **Recombobulation T1** — 1 charge cap. Charges refill on each World Level build. A charge absorbs a fatal hit (splat→unsplat cutscene, no life lost). |
| 2 | **Recombobulation T2** — 2 charge cap. |
| 3 | **Recombobulation T3** — 3 charge cap. |
| 4 | **Psychedelic Sight L1** — current lane + immediately-forward lane tint red when a vehicle is within 1.5 s ETA of frog's column. Binary danger/safe (no shading). |
| 5 | **Psychedelic Sight L2** — current ± 2 lanes; ETA-shaded (faint→strong red as ETA shrinks within the 1.5 s window). |
| 6 | **Psychedelic Sight L3** — all visible lanes; ETA window extended to 2.5 s. |
| 7 | **Plague of Frogs** — Q key, 1 use/crossing. Every vehicle's speed × 0 for 1.5 s. Frog-rain particle burst + green tint pulse + chorus audio. |

### 6.5 `skills.js` API

Branch tier is the only stored state. Mechanics derive from tier via helpers. All `tongueRange()`-style helpers are arrays indexed by branch tier (`[T0, T1, T2, ..., T7]` — index 0 = unspent baseline).

```js
class Skills {
  constructor() {
    this._tiers = { tongueFu: 1, hipHopping: 0, frogcentration: 0, hocusCroakus: 0 };
  }

  reset() { /* Tongue Fu starts at 1 (pre-spent), others at 0 */ }

  tier(branchId) { return this._tiers[branchId] ?? 0; }
  isMaxed(branchId) { return this.tier(branchId) >= 7; }
  spend(branchId) {
    if (this.isMaxed(branchId)) throw new Error(`branch ${branchId} maxed`);
    this._tiers[branchId]++;
  }
  totalEarnedPoints() {
    // Sum of branch tiers minus the 1 free Tongue Fu T1.
    return Object.values(this._tiers).reduce((a, b) => a + b, 0) - 1;
  }

  // --- Tongue Fu helpers ---
  tongueRange()        { return TONGUE_RANGE_BY_TIER[this.tier('tongueFu')]; }      // cells
  bugMagnetRadius()    { return BUG_MAGNET_RADIUS_BY_TIER[this.tier('tongueFu')]; } // m
  bugScoreMult()       { return BUG_SCORE_MULT_BY_TIER[this.tier('tongueFu')]; }
  canRibbitRoar()      { return this.tier('tongueFu') >= 5; }
  roarUses()           { return ROAR_USES_BY_TIER[this.tier('tongueFu')]; }
  roarBrakeDuration()  { return ROAR_BRAKE_DURATION_BY_TIER[this.tier('tongueFu')]; }

  // --- Hip Hopping helpers ---
  hopDurationMult()    { return HOP_DURATION_MULT_BY_TIER[this.tier('hipHopping')]; }
  canLongJump()        { return this.tier('hipHopping') >= 3; }
  longJumpMult()       { return LONG_JUMP_MULT_BY_TIER[this.tier('hipHopping')]; }

  // --- Frogcentration helpers ---
  canFrogFocus()       { return this.tier('frogcentration') >= 1; }
  focusDuration()      { return FOCUS_DURATION_BY_TIER[this.tier('frogcentration')]; }
  focusPassiveRecharge() { return FOCUS_PASSIVE_RECHARGE_BY_TIER[this.tier('frogcentration')]; }
  echoTier()           { return ECHO_TIER_BY_TIER[this.tier('frogcentration')]; } // 0..3

  // --- Hocus Croakus helpers ---
  recombCap()          { return RECOMB_CAP_BY_TIER[this.tier('hocusCroakus')]; }
  sightTier()          { return SIGHT_TIER_BY_TIER[this.tier('hocusCroakus')]; }   // 0..3
  canPlague()          { return this.tier('hocusCroakus') >= 7; }
}
```

Branch IDs (`tongueFu`, `hipHopping`, `frogcentration`, `hocusCroakus`) are stable strings used by the picker, the HUD badges, and the helper map. Don't rename without updating all three.

### 6.6 Skill picker modal flow

After `bankCrossing` returns, if `score.drainLevelUps()` yields any new levels:

1. Game enters `SKILLPICK` state (a new game-state alongside PAUSED/INTRO/PLAYING/etc). The update loop pauses everything except the picker. Pointer lock is *not* released — modal renders over the locked canvas, keyboard-only.
2. HUD displays the picker centered on screen:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🐸  FROG LEVEL 5  —  Choose a skill point
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

     [1]  🥋 Tongue Fu          T1 → T2
          Longer tongue (2 cells)

     [2]  🐰 Hip Hopping        T0 → T1
          Hop speed +5%

     [3]  🧘 Frogcentration     T0 → T1
          Frog Focus enabled (F)

     [4]  🎩 Hocus Croakus      T0 → T1
          Recombobulation (1 charge)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
   Branches at T7 are greyed out and their key is dead.
3. Player presses 1, 2, 3, or 4 → `skills.spend(branchId)`. Toast: `+1 🥋 Tongue Fu T2 — Longer tongue`.
4. If `_levelUpQueue` still has entries, modal updates with the new tier descriptions (since prior spends may have changed the "next tier" preview) and waits again.
5. When queue empty: hide modal, transition to PLAYING, `_buildLevel(newWorldLevel)` (which also calls `_refillRecombCharges()` reflecting the new tier).

If pointer lock is lost during SKILLPICK (alt-tab, etc.): the picker stays as a top-level modal; on resume (pointer lock reacquired) the picker is still showing. Don't show the regular pause overlay underneath.

---

## 7. Skill mechanics in detail

### 7.1 Tongue Flick (Tongue Fu T1+)

Pressing Space fires the tongue in the player's **horizontal look direction** (camera yaw projected onto XZ; pitch ignored — looking up doesn't shoot the tongue at the sky).

Mechanics:
- Capsule from camera position offset 0.1 m forward, extending `range = tongueRange() * CELL_WIDTH` meters along yaw-forward. Capsule radius `TONGUE_CAPSULE_RADIUS` (0.5 m).
- Any bug intersecting the capsule is collected. Closest first if multiple.
- Flick fires regardless of frog state (works while `IDLE` or `HOPPING`). Cooldown `TONGUE_COOLDOWN` (~0.32 s).
- Visual: bright pink `CylinderGeometry` shoots out from camera POV along yaw-forward. Phases: extend (0..0.35) → hold (0.35..0.65) → retract (0.65..1.0) over `TONGUE_FLICK_DURATION` (0.18 s).
- Audio: `playTongueFlick()` — short whip.

Range by `tongueFu` tier: `[0, 1, 2, 3, 3, 3, 3, 3]` cells (T1 = 1, T2 = 2, T3+ = 3).

Mercy auto-collect on `(row, cellX)` exact match still applies regardless of tongue tier — never let the player get stuck on an under-foot bug.

### 7.2 Bug Magnet (Tongue Fu T3+)

Passive. Bugs within `bugMagnetRadius()` of the frog drift toward `frog.cellX` at `BUG_MAGNET_DRIFT_SPEED` (0.5 m/s) while the frog is `IDLE`. Drift is along X only; Z (row) is fixed.

Radius by `tongueFu` tier: `[0, 0, 0, 3, 5, 5, 5, 5]` m.
Bug score multiplier by `tongueFu` tier: `[1, 1, 1, 1, 1.5, 1.5, 1.5, 1.5]`.

T4's score-mult kicks in alongside the radius bump — risk-priced bugs become more profitable as you specialize into the branch.

### 7.3 Ribbit Roar (Tongue Fu T5+, E key)

- HUD: `🐸 ROAR ×N` where N = uses remaining this crossing.
- On press (uses > 0): pick the closest oncoming vehicle within `ROAR_RADIUS` (25 m flat). Apply `roarBrakeTimer = roarBrakeDuration()`; during it, vehicle's effective speed × 0.5.
- Audio: `playRoar()` — ~80 Hz sawtooth + noise, 0.4 s envelope, low-pass.
- Visual: brief screen shake (60 ms); target's wheels flash red emissive.

Uses by `tongueFu` tier: `[0, 0, 0, 0, 0, 1, 1, 2]`.
Brake duration by tier: `[0, 0, 0, 0, 0, 1.0, 2.0, 2.0]` s.
Radius is constant at 25 m across all roar tiers.

### 7.4 Hop Speed (Hip Hopping T1, T2, T4–T6)

Each speed-bump tier multiplies `HOP_DURATION` by 0.95 (5% faster). Cumulative: a player at Hip Hopping T6 has hopped through five speed bumps, so their effective HOP_DURATION = `HOP_DURATION × 0.95⁵ ≈ HOP_DURATION × 0.774` (~23% faster).

`hopDurationMult()` by `hipHopping` tier:

```
T0: 1.0      T4: 0.857
T1: 0.95     T5: 0.815
T2: 0.9025   T6: 0.774
T3: 0.9025   T7: 0.774
```

(T3 is "Long Jump unlocked" — no hop-speed bump that tier. T7 is "Double Long Jump" — likewise.)

Frog applies the multiplier in its hop tween: `actualDuration = HOP_DURATION * skills.hopDurationMult()`. Recompute each hop start (don't cache).

### 7.5 Long Jump (Hip Hopping T3+, Shift + WASD)

- Shift held + hop key = target offset multiplied by `longJumpMult()`.
- Same `HOP_DURATION` for the long-jump itself, so effective velocity scales by multiplier. Arc height scales by `√mult`.
- Long hops clamp to playfield edges (partial long jumps land at the boundary — won't fall off the map).

`longJumpMult()` by `hipHopping` tier: `[1, 1, 1, 2, 2, 2, 2, 4]`.

(Was originally Ctrl + WASD — but Ctrl+W closes the browser tab and pages can't preventDefault on OS-level shortcuts. Shift is the binding.)

No score bonus for long-jumping. Tradeoff: longer commit window, harder to land on a safe stripe.

### 7.6 Frog Focus (Frogcentration T1+, F toggle)

- Meter `[0, 1]` fills from near-miss events (THREADED +0.4, GRAZED +0.2) and bug pickups (+0.30). Caps at 1.
- **Passive recharge (T3+):** meter fills `focusPassiveRecharge()` per second while focus is NOT active.
- Renders as a thin horizontal bar bottom-center.
- F toggles: press → engage if unlocked + meter > 0; press again → disengage. While active:
  - World time scale `WORLD_TIME_SCALE_FOCUS` (0.35) applied to vehicle motion + spawner timers + audio engine pitch (proportional). Frog hop and input run at normal speed.
  - Meter drains at `1 / focusDuration()` per second (`focusDuration` = 6/8/10/12 s by tier).
  - FX: `fx.setFocusActive(true)` enables CA + cyan/green tint pass. Audio engines low-pass at 350 Hz.
- On meter empty: auto-disengage. Re-engage requires another F press after refill.
- **Score multiplier during Focus:** near-miss events worth ×2.

`focusDuration()` by `frogcentration` tier: `[0, 6, 8, 10, 12, 12, 12, 12]` s.
`focusPassiveRecharge()` by tier: `[0, 0, 0, 0.025, 0.05, 0.05, 0.05, 0.05]` per second.

### 7.7 Echolocation (Frogcentration T5+)

Bottom-right DOM canvas, ~120 px square, semi-transparent.

- **L1 (T5):** radius 15 m. Blips for vehicles in current row's lane + the lane immediately ahead. White dots only.
- **L2 (T6):** radius 25 m. Includes current ± 2 lanes. Each blip gets a short directional arrow showing travel direction. Vehicles closing on the frog's column redden.
- **L3 (T7):** radius 40 m. All lanes. Blip brightness encodes ETA-to-frog (faint = far, bright = imminent).

2D `<canvas>` overlay, re-rendered each frame. Cheap.

`echoTier()` by `frogcentration` tier: `[0, 0, 0, 0, 0, 1, 2, 3]`.

### 7.8 Recombobulation (Hocus Croakus T1+, passive)

Charges held in `score.recombCharges`. Cap = `recombCap()`.

When `checkCollision` would kill the frog AND `charges > 0`:
- `score.consumeRecombCharge()` returns true; charges decremented; lives unchanged.
- Frog enters `RECOMBOBULATING` state for `RECOMB_CUTSCENE_DURATION` (1.5 s). Splat → unsplat cutscene plays; world keeps rolling.
- Frog reappears at the same `(row, cellX)` it died on. State → IDLE.

Charges refill to `recombCap()` on each `_buildLevel` (per crossing), so each new level starts fresh. Burning a charge disqualifies the level from the Untouchable bonus.

`recombCap()` by `hocusCroakus` tier: `[0, 1, 2, 3, 3, 3, 3, 3]`.

HUD: row of glowing-bug icons matching held charges.

### 7.9 Psychedelic Sight (Hocus Croakus T4+, passive)

Each lane within scope tints toward red based on **imminent danger to the frog at their current `cellX`**:

- For each in-scope lane, find the closest vehicle whose path will cross the frog's column.
- Compute `eta = abs(v.x - frog.x) / (v.speed * world_speed_multiplier)`.
- Within the level's window (1.5 s at L1/L2, 2.5 s at L3), set lane tint:
  - **L1:** binary — fully red below threshold, off above.
  - **L2/L3:** alpha = `1 - eta / window`.

Per-lane road material owns its own emissive offset; updated each frame. One material per lane.

`sightTier()` by `hocusCroakus` tier: `[0, 0, 0, 0, 1, 2, 3, 3]`.
Lane scope by sight tier: L1 = current + next forward, L2 = current ± 2, L3 = all visible.
ETA window by sight tier: L1 = 1.5 s, L2 = 1.5 s, L3 = 2.5 s.

Distinct from Echolocation (where vehicles ARE) — Sight shows where it's UNSAFE TO STAND.

### 7.10 Plague of Frogs (Hocus Croakus T7, Q key)

Unlocks at the Hocus Croakus capstone. Bound to Q with its own per-crossing use counter (separate from Roar).

- HUD: `🐸🐸🐸 PLAGUE ×1`. Resets to 1 on each crossing build.
- On press: every vehicle in the world has speed × 0 for `PLAGUE_DURATION` (1.5 s). Resumes at full original speed afterward (snapshot speeds before zeroing — don't multiply against whatever speed-mult was active when Plague fired).
- Visual: ~30 small green frog quads rain from `y = 8` to `y = 0` with random `x` over 0.4 s, then despawn. Pool-recycled. Plus a green tint pulse via `fx.flashPlague()`.
- Audio: `playPlague()` — chorus of 8 detuned ribbits + 40 Hz rumble, 0.6 s.

### 7.11 Backward Hop (always-on)

Backward hop is unconditional. `frog.tryHop` accepts negative `dRow` and `input.js` calls it on `S` / `↓` with no skill check. Earlier drafts gated this on Frog Lv 1; the gate was dropped — a single direction key isn't an interesting unlock.

---

## 8. HUD additions

```
Top-left:    LIVES: 🐸🐸🐸🐸🐸
             FROG Lv 5  (3,200 / 5,000)        ← XP bar under it
             🥋 3  🐰 1  🧘 0  🎩 0           ← branch badges (always shown)
Top-center:  WORLD Lv N
Top-right:   SCORE: 12,345
             COMBO: x3.5 ↑
             HI: 47,200
Mid-bottom:  [████████░░░░░░] FOCUS METER       (when Frogcentration ≥ T1)
                              ROAR x2 / PLAGUE x1
                              🪲🪲 (recomb charges)
Bottom-right: ECHOLOCATION CANVAS               (when Frogcentration ≥ T5)
Center toasts: "+500 SURVIVED 30s", "THREADED! +900",
              "UNTOUCHABLE +5000",
              "RECOMBOBULATED!", "WORLD Lv N"
Center modal: SKILL PICKER (during SKILLPICK state — see §6.6)
```

`hud.js` grows but stays DOM-only. No three.js HUD layer. The picker modal is a positioned `<div>` that visibility-toggles.

---

## 9. Audio additions

All procedural, follow `playHop` / `playSquish` / `playWin` patterns:

- `playPickup()` — short crunch (filtered noise burst, ~60 ms) + faint blip. *(existing)*
- `playTongueFlick()` — short whip (highpass noise descending, ~80 ms). *(existing)*
- `playRecombobulate()` — descending arpeggio over 0.6 s. *(existing)*
- `playRoar()` — ~80 Hz sawtooth + noise, 0.4 s, low-pass.
- `playPlague()` — chorus of 8 detuned ribbits + 40 Hz rumble, 0.6 s.
- `playFocusOn()` / `playFocusOff()` — short whoosh; while active, `setEngineLowpass(350)` and pitch-multiply by `WORLD_TIME_SCALE_FOCUS`. *(existing)*
- `playLevelUp()` — chiptune ascending 4-note arpeggio with a sparkle. *(existing)*
- `playSkillPick()` — soft chime when the player commits a branch choice in the picker.
- `playMilestoneFlash()` — chunky 3-note major arpeggio.
- `playNearMiss(tier)` — bell ping (CLOSE/UNDER), sting (GRAZED), record-scratch (THREADED).

---

## 10. FX layer

`fx.js` — minimal `EffectComposer`:
- `RenderPass` → `ShaderPass` (custom — combined CA + color tint, ~30 lines).
- Persistent modes: `off`, `focus`. Set via `fx.setMode(name)`.
- **Plague flash:** transient green-tint pulse via the same shader (uniform-driven), plus a frog-rain sprite layer in the scene (separate from post-processing).
- **Level-up flash:** transient gold-tint pulse, 0.3 s, fired alongside picker-modal appearance.
- **Screen shake:** transient camera-position offset, 60 ms decay (existing approach).

CA shader samples R/G/B at three slightly offset UVs based on distance from screen center.

---

## 11. Config tunables

Add to `config.js` (existing constants like `STARTING_LIVES`, `SCORE_THREADED`, `XP_PER_LEVEL_BASE` already in place — only new/changed values listed):

```js
// --- Frog level ---
export const FROG_LEVEL_CAP = 28;            // bumped from 17

// --- Tongue Fu (indexed by tongueFu tier 0..7) ---
export const TONGUE_RANGE_BY_TIER       = [0, 1, 2, 3, 3, 3, 3, 3];     // cells
export const BUG_MAGNET_RADIUS_BY_TIER  = [0, 0, 0, 3, 5, 5, 5, 5];     // m
export const BUG_SCORE_MULT_BY_TIER     = [1, 1, 1, 1, 1.5, 1.5, 1.5, 1.5];
export const ROAR_USES_BY_TIER          = [0, 0, 0, 0, 0, 1, 1, 2];
export const ROAR_BRAKE_DURATION_BY_TIER= [0, 0, 0, 0, 0, 1.0, 2.0, 2.0]; // s
export const ROAR_RADIUS = 25;               // m, constant across tiers
export const ROAR_BRAKE_FACTOR = 0.5;

// --- Hip Hopping (indexed by hipHopping tier 0..7) ---
export const HOP_DURATION_MULT_BY_TIER  = [1.0, 0.95, 0.9025, 0.9025, 0.857, 0.815, 0.774, 0.774];
export const LONG_JUMP_MULT_BY_TIER     = [1, 1, 1, 2, 2, 2, 2, 4];

// --- Frogcentration (indexed by frogcentration tier 0..7) ---
export const FOCUS_DURATION_BY_TIER     = [0, 6, 8, 10, 12, 12, 12, 12];   // s
export const FOCUS_PASSIVE_RECHARGE_BY_TIER = [0, 0, 0, 0.025, 0.05, 0.05, 0.05, 0.05]; // /s
export const ECHO_TIER_BY_TIER          = [0, 0, 0, 0, 0, 1, 2, 3];
export const ECHO_RADIUS_BY_LEVEL       = [0, 15, 25, 40];                 // m by echo level

// --- Hocus Croakus (indexed by hocusCroakus tier 0..7) ---
export const RECOMB_CAP_BY_TIER         = [0, 1, 2, 3, 3, 3, 3, 3];
export const SIGHT_TIER_BY_TIER         = [0, 0, 0, 0, 1, 2, 3, 3];
export const SIGHT_WINDOW_BY_LEVEL      = [0, 1.5, 1.5, 2.5];              // s ETA window
// Lane scope by sight level: 1=current+next, 2=current±2, 3=all visible.

// --- Plague ---
export const PLAGUE_USES_PER_CROSSING = 1;
export const PLAGUE_DURATION = 1.5;          // s of all-vehicle stop

// --- Recombobulation ---
export const RECOMB_TOP_UP_BUG_INTERVAL = 5; // world levels (existing)

// --- Psychedelic Sight tint ---
export const SIGHT_TINT_COLOR = 0xff3333;
```

The existing tier arrays already in `config.js` (`TONGUE_TIER_RANGES`, `FOCUS_DURATIONS`, `LONG_JUMP_TIERS`, `RECOMB_CHARGES_BY_TIER`) get either renamed to match the branch convention above, or kept as the source-of-truth backing array for the corresponding `_BY_TIER` indexing — pick one naming during the S5 refactor and stick with it.

---

## 12. Implementation phases

Each phase ends in a runnable build. Pick up at the first unchecked box.

### Phases already complete (carry forward as-is)

- [x] **Phase S1 — Score core + lives.** `score.js` with combo, milestones, banking; HUD shows score / combo / lives; `localStorage` high score; game-over flow on lives = 0.
- [x] **Phase S2 — Near-miss detection.** `vehicles.js` `nearMiss` substate; `collision.detectNearMisses()` returns events; wired to `score.js`.
- [x] **Phase S3 — XP + frog-level scaffolding.** `score.js` adds `xp`, `frogLevel`, threshold check on bank. HUD shows `FROG Lv N (xp/threshold)`. Level-up toast + `playLevelUp` sting on threshold cross.
- [x] **Phase S4 — Bugs (regular + extra-life) + Tongue Flick T1/T2/T3 ranges.** `bugs.js` placement. `tongue.js` capsule from camera yaw with tier-scaled range, visual cylinder, `playTongueFlick`.
- [x] **Phase S5a — Frog Focus T1 (auto-unlock).** Meter, F binding, time-scale, score multiplier. (Was previously gated to auto-unlock at frog level 3 — to be rewired in S5 below.)
- [x] **Phase S6a — Recombobulation T1 (auto-unlock).** Charge cap, refill on level build, splat→unsplat cutscene, life preserved. (Currently gated to auto-unlock at frog level 4 — to be rewired in S5 below.)

### New phases — branch system rewrite

- [ ] **Phase S5 — Skill picker + branch infrastructure.** Refactor `skills.js` to the branch-tier model (`tongueFu`, `hipHopping`, `frogcentration`, `hocusCroakus`) with tier 0..7 each, `spend(branchId)` method, and the helper API (`tongueRange()`, `recombCap()`, etc.). Initialize with `tongueFu = 1` pre-spent. Refactor existing call sites in `game.js`, `tongue.js`, `score.js`, `hud.js` to use the new helpers instead of the old `skills.has(name)` / `skills.tier(name)` calls. Add SKILLPICK game state. Implement picker modal in `hud.js` (DOM, keyboard 1-4). Wire `Game._levelUpQueue` → SKILLPICK → `skills.spend()` → resume PLAYING. Bump `FROG_LEVEL_CAP` to 28. **End of phase: existing skills (Tongue T1-T3, Focus T1, Recomb T1) work, but only when the player chooses them via the picker. The other branches' first-tier picks are no-ops until their phases land.**
- [ ] **Phase S6 — Hip Hopping T1+T2+T3 (Hop Speed + Long Jump unlock).** `Frog` applies `skills.hopDurationMult()` per hop. `input.js` reads Shift modifier; long-hop targets multiplied by `skills.longJumpMult()`. Clamp long hops to playfield. Picker now has a meaningful pick on Hip Hopping.
- [ ] **Phase S7 — Tongue Fu T4 (Bug Magnet upgrade).** Update `bugs.js` to use `skills.bugMagnetRadius()` and `skills.bugScoreMult()`. Score helper applies the multiplier on pickup.
- [ ] **Phase S8 — Frogcentration T2/T3/T4 (duration + passive recharge).** Replace `FOCUS_DURATIONS` index lookups with `skills.focusDuration()`. Add passive recharge in `score.update()` when `!focusActive` using `skills.focusPassiveRecharge()`.
- [ ] **Phase S9 — Hocus Croakus T2/T3 (Recomb 2/3 charge cap).** `_refillRecombCharges` already reads `RECOMB_CHARGES_BY_TIER` — refactor to `skills.recombCap()`.
- [ ] **Phase S10 — Tongue Fu T5/T6/T7 (Ribbit Roar).** `input.js` E-key handler. `spawner.js` brake hook (per-vehicle `roarBrakeTimer`, speed × 0.5 while > 0). Use counter resets per crossing. Screen shake + wheel-flash visual. `playRoar()`.
- [ ] **Phase S11 — Hip Hopping T4-T7 (more hop speed + Double Long Jump).** Cumulative speed bumps already wired in S6 via `hopDurationMult()` array — just confirm tier 4-6 indices return the expected values. T7's "Double Long Jump" wires to the longJumpMult tier-7 entry (4×). *Decide here:* if the user picks the chain interpretation instead, refactor input/frog to allow a second long-jump-mid-air.
- [ ] **Phase S12 — Frogcentration T5-T7 (Echolocation L1/L2/L3).** Bottom-right `<canvas>`. Render level-scoped vehicle list each frame. L2 adds direction arrows + reddening. L3 adds ETA brightness.
- [ ] **Phase S13 — Hocus Croakus T4-T6 (Psychedelic Sight L1/L2/L3).** Per-lane road material. Each frame: per in-scope lane, find closest crossing-path vehicle, compute ETA, set tint. Lane scope + ETA window by sight level.
- [ ] **Phase S14 — Hocus Croakus T7 (Plague of Frogs).** Q key, separate use counter, snapshot all vehicle speeds → zero → restore after `PLAGUE_DURATION`. Frog-rain sprite layer + green flash + `playPlague()`.
- [ ] **Phase S15 — FX layer (post-processing).** `EffectComposer` + CA/tint shader. Wire Frog Focus (replace the existing DOM `#focus-tint` placeholder), Plague flash, level-up flash.
- [ ] **Phase S16 — Audio polish.** All near-miss stings, tongue flick, plague chorus, focus sweeps, level-up sting, recomb chime, skill-pick chime. Tune volumes against engine bus.
- [ ] **Phase S17 — Polish & tuning.** XP curve (does Lv 28 feel reachable but not trivial?), branch balance (does any branch get skipped consistently?), picker UX (modal readability, key feedback). CSS pass on HUD + branch-tier badge bar.

---

## 13. Risks & gotchas

1. **Refactoring existing skill call sites in S5 is the biggest blast radius.** The current `skills.js` uses `has(name)` / `tier(name)` keyed by mechanic name (`tongueFlick`, `frogFocus`, `recombobulation`, `longJump`). Game, tongue, and score all reference these. The rewrite needs every call site updated atomically. Grep for `skills.has` and `skills.tier` before starting — and add the new helpers (`canFrogFocus`, `tongueRange`, etc.) before deleting the old ones, so the build never breaks mid-refactor.

2. **Time scale on engine audio.** Web Audio doesn't have a global time scale. Frog Focus needs engines to sound slowed AND doppler updates to use the slowed `dt`. Pass effective `dt` to `audio.updateEngines`, not wall-clock. (Already wired — don't break in S15.)

3. **Spawner timer drift under Focus.** `Spawner.update(dt * scale)` slows lane spawn timers correctly. **Don't** also slow the frog's hop tick or the player loses Focus's whole point. Only vehicles + spawner + audio scale; frog and input do not. (Already correct in `game.js#update`.)

4. **Picker modal interacts with pointer lock.** Showing a DOM modal over the locked canvas means the modal can't be clicked (pointer is captured). Keyboard input (1-4) works fine — that's the intended UX. If the user alt-tabs out (lock loss) during SKILLPICK, the modal stays visible; on lock reacquire, picker takes priority over the regular pause overlay. Verify in `Game.onLockLost` / `Game.onLockAcquired`.

5. **Tongue Fu T1 pre-spent on every reset.** `score.reset()` and `Skills` constructor must both initialize `tongueFu = 1`. A bug here would mean the player has no tongue at all on the first crossing of a fresh run.

6. **`skills.totalEarnedPoints()` vs. `score.frogLevel - 1`.** These should always match (one earned point per frog level above 1). Useful as a debug invariant — log a warning if they ever diverge.

7. **Multi-level bank.** Banking 50k points on a single high-combo crossing can cross several thresholds. The picker queue must handle this — show one modal per queued level, not one stacked modal. `Score._levelUpQueue` is already FIFO; just make sure SKILLPICK loops on it correctly.

8. **Picker preview text changes per spend.** If the player has Hip Hopping at T0 and picks Hip Hopping for level-up #1, then on level-up #2 the preview should show "Hip Hopping T1 → T2". Don't compute the modal text once at queue start — recompute on each modal show.

9. **Recombobulation racing the death tween.** `Frog.die` sets state = DEAD and starts a 0.5 s tween; recomb must intercept *before* `die()` is called (in `game.js#update` collision branch), or the tween steals state. (Already correct — preserve in S9.)

10. **Long Jump clamping.** Shift + W from row 5 with multiplier 4 (Double Long Jump) hops to row 9 — but if `goalRow = 8`, the player crosses, bypassing rows 6–7 traffic. That's a feature, not a bug — long-jumping the goal is an intentional reward — but it interacts oddly with combo decay (no near-misses to score). Note in playtest.

11. **Tongue flick yaw projection.** Camera uses `YXZ` rotation order; pitch is `rotation.x`, yaw is `rotation.y`. Forward direction in world = `new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)`, then zero out Y and renormalize. (Already correct.)

12. **Plague hard-stop and resume.** Vehicles' speed must restore to original after `PLAGUE_DURATION`, not to whatever speed-multiplier was active when Plague fired. Store original speeds; restore from snapshot.

13. **Psychedelic Sight perf with many lanes.** At World Lv 50+ with 25 lanes, per-frame ETA scan is `O(lanes × vehicles)` — flag for profiling. Closest-vehicle-per-lane cache invalidates on spawn/despawn.

14. **HUD getting busy.** Frog Lv + XP bar + branch badges + score + combo + lives + focus meter + roar count + plague count + recomb icons + echolocation panel = a LOT. Budget for a CSS pass at S17; DOM HUD is cheap to rearrange but easy to make ugly.

15. **Picker accessibility.** Keys 1-4 are the only input. Greyed-out maxed branches must visually communicate their unavailability AND silently no-op (don't accidentally close the modal). Also consider: what if all 4 branches are maxed (Lv 28 → Lv 29 banking edge case shouldn't happen since cap is 28, but defensive: if no branches available, skip the modal entirely and just resume).

---

## 14. Verification (end of plan)

- Score increments on near misses; combo multiplier rises and decays as expected; bank-on-crossing flow works.
- 5 lives, game over wipes score + branch tiers + XP + skills; high score persists in `localStorage`.
- New runs start with Tongue Fu T1 pre-spent (basic tongue active from first hop); other branches at T0.
- XP accumulates on banking; level-ups fire on threshold cross; multiple level-ups in one crossing show a sequence of picker modals (one per point).
- Skill picker modal: keys 1-4 spend a point on the corresponding branch; maxed branches greyed and non-responsive; toast + chime on commit.
- Bugs spawn at level start, weighted toward deadly rows. Bug Magnet drift visible at Tongue Fu T3+; bigger radius + score mult at T4.
- Spacebar fires tongue in look direction; reach scales 1 / 2 / 3 cells with Tongue Fu tier.
- Frog Focus (F) slows traffic + audio; meter drains with action; passive recharge visible at Frogcentration T3+; CA tint visible at S15+.
- Long Jump (Shift) at Hip Hopping T3+ extends hops by 2×; T7 extends to 4×. Hop speed bumps cumulatively visible across T1, T2, T4-T6.
- Echolocation panel shows nearby traffic; tier upgrades widen radius, add direction arrows, add ETA brightness.
- Ribbit Roar (E) at Tongue Fu T5+ slows nearest oncoming vehicle 1-2 s; uses reset on crossing; T7 has 2 uses.
- Plague of Frogs (Q at Hocus Croakus T7) hard-stops all traffic 1.5 s with frog-rain visual; 1 use/crossing.
- Recombobulation absorbs a fatal hit without losing a life; charges shown in HUD; cap = 1/2/3 at Hocus Croakus T1/T2/T3.
- Psychedelic Sight at Hocus Croakus T4+ tints lanes red based on vehicle ETA; tier upgrades widen lane scope and ETA window.
- All 4 branches reach T7 by Frog Lv 28 (sum of branch tiers = 28; one was pre-spent so 27 picker actions over the run).
- No console errors. `npm run build` clean.

---

## 15. Out of scope (deferred to their own plans)

- **Lick Thyself.** The original "ghost-vehicle preview at +0.5 s" toggle. Cut because Echolocation L2/L3 + Psychedelic Sight already cover predictive information.
- **Like an Ox / Storm of the Aztec / Acidic Tongue.** Active skills from the initial brainstorm. Saved for a future "ultimates" expansion (a 5th branch?).
- **Persistent skill tree across runs.** Roguelite progression deferred. Per-run only for now.
- **Skill rebinding UI / pause-menu loadout.** Locked keys for v1.
- **Re-spec / refund.** Once spent, a point is locked into its branch. A "reset skill points" UI is its own feature.
- **Branch unlock requirements.** All 4 branches are pickable from Lv 2. Future variant: gate Hocus Croakus T7 (Plague) behind some achievement, etc.
- **Nails on the road** (later-level offensive item — tires blow out, vehicles swerve and explode). Polish phase.
- **Legend Mode** (1-life run variant, separate high score).
- **Score persistence across sessions / leaderboards / multi-run profiles.** Local high score only.
- **Mobile touch bindings.**

Each is its own plan when the time comes.
