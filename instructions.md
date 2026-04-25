# How to play

A first-person Frogger. You are a frog at asphalt level. Cross the road, do it again, score points, level up your skills, survive on five lives.

---

## The basics

**Goal.** Hop forward across the road to the far median. Each crossing rebuilds the world with one more lane (every 2 levels, capped at 8) and slightly faster traffic.

**Lives.** You start with 5. Each death costs one. At zero, the run is over and your score is final — high scores persist across sessions, but everything else (XP, skills, charges) wipes.

**Controls.**

| Input | What it does |
|---|---|
| `W` / `↑` | Hop forward |
| `S` / `↓` | Hop backward (always available) |
| `A` / `←` · `D` / `→` | Strafe left / right |
| Mouse | Look around |
| `Space` / Left-click | Tongue Flick (Lv 2+) |
| `F` | Toggle Frog Focus (Lv 3+) |
| `Shift` + WASD | Long Jump (Lv 5+) |
| `Click` overlay | Start / resume (also unlocks audio) |
| `ESC` | Pause (release pointer lock) |

Hops are camera-relative — `W` always means "the way you're facing." Snap your head sideways to read the lane and `W` still hops away from start.

> **Hard commit.** Once you press a hop key, you're committed — keys pressed mid-hop are dropped, not buffered. Don't fire-and-forget; time the press.

---

## How vehicles kill you (and don't)

Collision is **per-wheel**, not per-vehicle. A vehicle has four wheels and a body. The wheels kill you. The strip between the front and rear axles is **survivable space** — if you hop into the wheelbase as a vehicle is passing, you're inside the body but safely between the wheels, and you can hop out the other side.

This is the central mechanic. Threading the wheelbase as a truck rolls overhead is the highest-reward play in the game.

You are **not** invincible mid-hop. A wheel passing through your position kills you whether you're airborne or grounded.

The white between-lane stripes are safe ground. So is the start row and the goal row. Standing on stripes earns no points.

---

## Scoring

Points come from risk. Sitting on a safe stripe earns nothing.

### Near-misses

Each time a vehicle passes your column, the highest-tier proximity event you achieved fires once:

| Event | Base | Combo bump | Notes |
|---|---|---|---|
| **THREADED** | 300–500 | ×2.0 | Hopped into the wheelbase as it passed |
| **GRAZED** | 100 | ×1.5 | A wheel came within ~0.5 m, didn't hit |
| **UNDER** | 25 (flat) | — | Sat between wheel rows passively (no combo) |

THREADED base scales by vehicle type — sedans pay 500 (smaller wheelbase, harder to thread), trucks pay 300 (more forgiving target).

### Combo multiplier

Each near-miss bumps a multiplier (capped at ×8). The next event's points are scaled by it. Bug pickups (×1.5) keep it alive when there's no traffic. After 5 s of inactivity it decays back toward ×1.

### Survival milestones

Time spent on a wheel-row sub-row (not stripes, not start, not goal) ticks up. Crossing thresholds pay big:

`30 s → +500` · `60 s → +1000` · `90 s → +2000` · `120 s → +4000` · `150 s → +8000` · `180 s → +16000`

### Bugs

Yellow beetle dots are scattered each level — about 70% on deadly wheel-path rows, 30% on safe stripes. Worth `100 × current combo`.

Three ways to collect:
1. Land directly on one (mercy auto-collect).
2. Tongue-flick it from a distance (Lv 2+).
3. Stand close enough that Bug Magnet drifts it to you (Lv 12).

### Crossing bonus + bank

Reaching the goal pays `250 × current world level` and **banks** all your earned points into the run total. Banked points are also XP — see below.

A death forfeits everything you haven't banked yet.

---

## Two kinds of level

The HUD shows two numbers, and they mean different things:

- **WORLD Lv N** — top-center. The road. Increments on every crossing. Adds lanes, ramps speed.
- **FROG Lv N** — top-left, with an XP bar. Your skill progression. Levels up when banked points cross thresholds.

These diverge: a high-skill player reaches FROG Lv 10 in fewer crossings than a cautious one. Take risks → earn skills faster.

XP requirements are quadratic: Lv 2 = 500, Lv 3 = 1500, Lv 4 = 3000, Lv 5 = 5000, Lv 10 = 22500, Lv 17 = 68000.

Level cap is FROG Lv 17. All progression resets on game over.

---

## Skills

You earn one skill (or tier-up) at each frog level. Skills change how the next crossings play.

### Currently implemented

| Frog Lv | Skill | What it does |
|---|---|---|
| 1 | (baseline) | Hop, strafe, backward hop. Mouse-look. |
| **2** | **Tongue Flick T1** — `Space` | Fires a sticky tongue 1 cell forward in your look direction. Collects any bug it hits. ~0.3 s cooldown. |
| **3** | **Frog Focus T1** — press `F` to toggle | Slows the world to 35% (vehicles, engine pitch, spawn timers). You stay full-speed. Near-miss base score doubles while active. Meter fills on near-misses + bug pickups; drains over 6 s of full-meter uptime. Press `F` again to disengage; auto-disengages when meter empties (re-engaging requires another `F` press after a refill). Can't engage on an empty meter. |
| **4** | **Recombobulation T1** — passive | Absorbs one fatal hit. You splat, briefly hold as a puddle, then *un*-splat and resume at the same row + cellX. No life lost. 1 charge cap, granted on unlock. |
| **5** | **Long Jump T1** — hold `Shift` + hop | Hops 2× the distance (rows or cells, in the direction you press). Same hop duration → faster effective velocity, taller arc. Clamps to the playfield edge instead of overshooting. |
| 6 | Tongue Flick T2 | Tongue range 2 cells. |
| 12 | Tongue Flick T3 + Bug Magnet | Range 3 cells. Bugs within ~3 m drift toward your column passively while you're idle. |

### Coming later

Frog Focus T2/T3 (longer durations + Psychedelic Sight road-tint heat-map), Recombobulation T2/T3 (+2 / +3 charges on tier-up, capped 2 / 3), Long Jump T2/T3 (3× / 4× range; T3 also speeds up every hop by 15%), Echolocation (radar panel, T1 Lv 7 → T3 Lv 17), Ribbit Roar (E key, slows nearest vehicle, Lv 9), Plague of Frogs (Q key, hard-stops all traffic for 1.5 s, Lv 17).

### Recombobulation charges in detail

- Charges are awarded **only on tier-up**, capped at the new tier's max. T1 unlock = +1, T2 unlock = +2, T3 unlock = +3.
- Once used, gone — no top-up bug, no per-crossing refill. The next charge comes at the next tier-up.
- A fatal hit absorbed by a charge does **not** consume a life.
- The cutscene is ~1.5 s; vehicles keep moving during it. You may pop out into a wheel that wasn't there when you got hit. Sometimes the road wins twice.

### Why use Frog Focus

The big one. Hit `F` going into traffic to:
- See gaps clearly,
- Time tongue flicks at moving bugs,
- Double the score of a THREADED you would've landed anyway.

The meter is the cost: you can't sustain it forever, and you can't fill it sitting on a stripe. Earn it from risk, spend it on bigger risk. Hit `F` again to disengage early and save the rest for a tighter spot.

---

## HUD reference

```
Top-left:  LIVES: 🐸🐸🐸🐸🐸           ─ remaining lives
           FROG Lv 5 (3,200 / 5,000)   ─ frog level + XP toward next
           [████████░░░░░░] (XP bar)
           RECOMB 🪲                    ─ held recomb charges (when unlocked)

Top-center: WORLD LV 8                  ─ road / lane count

Top-right: SCORE: 12,345                ─ banked + pending
           HI: 47,200                   ─ best run on this machine
           COMBO: x3.5                  ─ visible when > x1
           NEAR-MISSES: 24              ─ lifetime counter for the run

Bottom:    [████████░░░░░░] FOCUS       ─ visible from Lv 3
```

Center-screen toasts: skill unlocks (gold), survival milestones + THREADED notifications (yellow), level transitions (green), "RECOMBOBULATED!" on charge use.

---

## Tips

- The first earned skill is at Lv 2 (Tongue). Lv 1 is the empty baseline — the first 500 XP feels slow, then unlocks come quickly.
- Bugs on deadly rows are worth more risk per visit than safe-stripe bugs (combo multiplier).
- Don't strafe pointlessly — strafing on a safe stripe doesn't farm anything.
- Frog Focus with a near-full meter just before a busy lane is the right call. Burning Focus on an empty road wastes meter and earns nothing — toggle off (press `F`) the moment you're past the danger.
- A wheel-killed run forfeits **pending** points only — banked is safe until game over. If your combo is high, banking by reaching the goal locks it in.
- The road past WORLD Lv 16 starts scrambling lane directions and densifying spawns. Eight lanes is the cap; the chaos is how it stays interesting.

---

## Verifying / reporting bugs

```sh
npm run dev      # playtest in a browser (pointer lock required)
npm run build    # catches module errors
```

There are no automated tests. UI / audio behavior can only be confirmed in a browser session.
