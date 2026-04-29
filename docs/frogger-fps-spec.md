# First-Person Frogger — Game Design Document

**Working Title:** FIRST PERSON FROG  
**Genre:** First-person arcade / comedy horror  
**Tagline:** *"You are the frog now."*

---

## 1. Concept

Classic Frogger, but you're on the ground looking through the frog's eyes. The camera sits roughly 2 inches off the asphalt. Trucks, cars, and buses are building-sized monsters screaming past you. The game is mechanically simple but viscerally overwhelming — the comedy comes from the absurd scale mismatch between you and everything trying to kill you.

The entire aesthetic is intentionally low-poly and blocky, evoking PS1-era 3D or early arcade polygons. Nothing should look "good" — it should look *chunky, loud, and ridiculous*.

---

## 2. Core Gameplay Loop

1. You start at the bottom of a multi-lane road.
2. You hop forward one lane at a time.
3. Vehicles barrel through each lane at varying speeds and intervals.
4. You time your hops to cross safely.
5. Reach the other side to complete the level.
6. Repeat with increasing difficulty (more lanes, faster traffic, new vehicle types).

**That's it.** The genius is in the perspective shift, not mechanical complexity.

### Controls

| Input | Action |
|---|---|
| W / Up / Tap | Hop forward one lane |
| A / Left | Hop left (strafe) |
| D / Right | Hop right (strafe) |
| S / Down | Hop backward |
| Mouse / Gyro | Look around freely |

Each hop is a discrete, committed movement — you press, the frog leaps, and you land one lane over. No continuous movement. This preserves the Frogger grid feel and creates tension: once you commit, you're committed.

**Hop duration:** ~0.4 seconds. Fast enough to feel responsive, slow enough that a mistimed jump is fatal.

---

## 3. Camera & Perspective

- **Camera height:** ~5cm off the road surface (frog eye level).
- **FOV:** Wide (90–100°) to exaggerate the sense of speed and scale.
- **Head bob:** Subtle bounce on each hop landing.
- **Free look:** The player can look around freely (including up at the underside of passing trucks), but movement is always grid-locked.
- **No rear view by default.** You can turn around to look, but you can't see behind you while facing forward. This is a deliberate design choice — it makes the game scarier and funnier.

### Camera Effects

- **Screen shake** when a vehicle passes within one lane of you.
- **Motion blur** on vehicles at high speed.
- **Wind rush** audio + slight camera push from air displacement of large vehicles.
- **Chromatic aberration / lens distortion** on near-misses.

---

## 4. Vehicles

All vehicles are comically oversized from the frog's perspective. A sedan is a two-story building. A semi truck is a skyscraper on wheels.

| Vehicle | Relative Size (to frog) | Speed | Behavior |
|---|---|---|---|
| Sedan | 2-story building | Medium | Steady, single lane |
| Pickup truck | 2.5-story building | Medium-fast | Slight lane wobble |
| Semi truck | 4-story skyscraper | Slow-medium | Casts long shadow, loud horn |
| Bus | Wide 3-story wall | Slow | Takes up visual width, blocks view of next lane |
| Motorcycle | 1-story shed | Fast | Quiet approach, hard to see coming |
| Sports car | Low 2-story building | Very fast | Appears suddenly, engine scream |

### Vehicle Details

- Vehicles should have visible, chunky wheels at the frog's eye level — the tread pattern should be terrifyingly clear.
- Headlights should cast actual light beams, especially in night levels.
- Undersides of vehicles should be modeled (pipes, axles, exhaust) since the player will see them from below during near-misses.
- Each vehicle type gets a distinct, exaggerated engine sound.

---

## 5. Visual Style

### Aesthetic: "PS1 Nightmare Arcade"

- **Low-poly everything.** Vehicles are 50–200 triangles max. The frog's hands (visible in first person) are blocky mittens.
- **Vertex jitter.** Subtle polygon wobble to mimic PS1-era vertex snapping.
- **Affine texture warping.** Textures warp slightly like PS1 hardware. Optional but adds authenticity.
- **Limited color palette.** Bold, flat, saturated colors. No realistic textures — think solid color with maybe one detail texture per object.
- **Draw distance fog.** Vehicles materialize out of fog/haze at a set distance, adding to the dread.
- **CRT filter (optional).** Scanlines, slight bloom, vignette.

### Road Design

- Thick white lane dividers (they're shin-height walls to the frog).
- Asphalt texture is chunky and visible — you can see individual pebbles as boulders.
- Road markings, cracks, and painted arrows are at mural scale.
- The "safe zone" median strip has oversized grass blades and maybe a discarded bottle cap the size of a manhole cover.

---

## 6. Audio Design

Audio is critical for gameplay (listening for approaching vehicles) and comedy.

### Sound Effects

- **Frog hop:** A wet, meaty *splat* on each landing.
- **Frog idle:** Occasional nervous ribbit, throat bubble sounds.
- **Vehicle approach:** Doppler-shifted engine noise. Should be audible 2–3 seconds before arrival.
- **Vehicle pass:** Massive bass rumble, wind rush, screen shake.
- **Near miss:** Record scratch or sharp musical sting + frog panic croak.
- **Death:** Comically wet squish, brief silence, then a sad trombone or deflating balloon sound.
- **Semi truck horn:** Earth-shattering. Shakes the entire screen. Should make the player flinch IRL.

### Music

- Upbeat chiptune that gets more frantic as you progress through lanes.
- Tempo increases slightly with each lane crossed.
- Music cuts to silence for a beat on death before the sad trombone.

---

## 7. Death & Respawn

Death should be **frequent, instant, and funny** — never frustrating.

- **On hit:** Brief ragdoll or splat animation (0.5 sec), then smash cut to black.
- **Death screen:** Shows a top-down classic Frogger-style replay of your death with a dotted line showing your path. This momentary genre switch is a recurring joke.
- **Respawn:** Instant. Back at the start of the current road. No loading, no menus.
- **Death counter:** Prominently displayed. This is a badge of honor, not a punishment.
- **Death variety:** Different vehicles could produce different death animations/sounds (pancaked by truck vs. launched by sports car vs. clipped by motorcycle).

---

## 8. Level Progression

### Structure

Each level is one road crossing. Complexity increases through:

1. **More lanes** (start with 2, scale to 6+).
2. **Faster vehicles.**
3. **Mixed vehicle types** (hard to judge gaps when a motorcycle is followed by a truck).
4. **Reduced audio cues** (electric vehicles in later levels — silent and deadly).
5. **Environmental hazards** (rain making the road reflective and harder to read, night levels with headlights in your eyes, fog reducing visibility).

### Stretch Goal: The River

The classic Frogger second half — hopping on logs and lily pads over a river. In first person, this means standing on a log watching another log float toward you and timing a jump. The water below looks like an abyss from frog height.

---

## 9. UI / HUD

Minimal. The comedy and immersion come from the perspective — don't clutter it.

- **Lives:** Small frog icons, bottom-left.
- **Level indicator:** Top-center, small text.
- **Death counter:** Top-right, constantly incrementing.
- **No minimap.** The whole point is you can't see the full picture.
- **Optional toggle:** A tiny rear-view mirror in the corner (unlockable? cheat code?) that shows a sliver of what's behind you.

---

## 10. Tone & Personality

The game should feel like a horror game that knows it's ridiculous. It's *Frogger meets Untitled Goose Game meets a PS1 fever dream*.

- Loading screen tips: *"Look both ways."* / *"Trucks cannot be reasoned with."* / *"You are 3 centimeters tall."*
- The frog's visible hands tremble when a vehicle is close.
- Pause menu shows the classic top-down Frogger view of your current position — a moment of "oh, that's where I am."

---

## 11. Technical Scope

### MVP (Minimum Viable Prototype)

- One level, 3 lanes, 2 vehicle types (sedan + truck).
- First-person camera with grid-based hopping.
- Basic vehicle spawning with randomized timing.
- Death + instant respawn.
- Blocky low-poly art, basic sound effects.

### Target Stack

| Component | Recommended |
|---|---|
| Engine | Godot 4 (lightweight, good 3D, easy to prototype) or Three.js (browser-based, shareable) |
| Art | Blender (low-poly modeling), or primitive-based (cubes/cylinders in-engine) |
| Audio | Audacity + sfxr/jsfxr for retro sound effects |
| Music | Chiptune tracker (FamiTracker, Bosca Ceoil) |
| Platform | Web (itch.io) for easy sharing, or desktop builds |

### Estimated MVP Timeline (Solo Dev, Evenings/Weekends)

| Phase | Time |
|---|---|
| Core movement + camera | 1 weekend |
| Vehicle spawning + collision | 1 weekend |
| Art pass (blocky vehicles, road) | 1 weekend |
| Audio + juice (screen shake, effects) | 1 weekend |
| Polish + 3 levels | 1–2 weekends |
| **Total MVP** | **5–6 weekends** |

---

## 12. Open Questions

- **Leaderboards?** Speedrun times per level. Fewest deaths. Most deaths (anti-leaderboard).
- **VR?** This concept in VR would be genuinely terrifying. Could be a stretch goal or separate build.
- **Mobile?** Tap-to-hop works naturally. Gyro for look. Could be a strong mobile game.

---

## 13. Multiplayer: Frog vs. Drivers

### Concept

Asymmetric multiplayer. One player is the frog (first-person, on the ground). Everyone else drives vehicles trying to hit them. It's hide-and-seek meets demolition derby meets Frogger.

### Player Roles

**The Frog (1 player)**
- First-person, ground-level camera (same as single-player).
- Grid-based hopping.
- Goal: cross the road and reach the safe zone.
- Can see and hear vehicles, but has no overview of the full road.
- Gets a limited number of lives (3–5) per round.

**The Drivers (1–4 players)**
- Top-down or third-person camera — they see the road from the *classic Frogger perspective*. This is the key asymmetry: the drivers have the god-view, the frog doesn't.
- Each driver controls one vehicle, locked to a lane (or small set of lanes).
- Can adjust speed: accelerate, brake, coast. Steering is limited — no free-roam, they're bound to their lane(s) to preserve the Frogger structure.
- Goal: splat the frog before it crosses.

### The Perspective Asymmetry

This is the whole joke and the whole game. The drivers are playing classic Frogger — looking down at a tiny frog on a grid. The frog player is living inside a horror game, hearing engines rev and seeing headlights fill the screen. Same game, completely different experience.

### Driver Mechanics

- **Lane switching:** Drivers can shift between 1–2 adjacent lanes, but not instantly — there's a lane-change animation that costs time. This prevents drivers from just covering the whole road.
- **Speed control:** Accelerate / brake / reverse. Top speed is capped per vehicle type.
- **Horn:** Honk to intimidate (or accidentally give away your timing).
- **Vehicle assignment:** Drivers get randomly assigned vehicle types each round. A motorcycle is fast but narrow (easy to dodge). A bus is slow but covers tons of width.

### Round Structure

1. **Setup phase (5 sec):** Drivers see the road and pick starting positions. Frog sees a countdown.
2. **Active phase:** Frog tries to cross. Drivers try to hit them. Time limit of 60–90 seconds.
3. **Round end:** Frog either crosses (frog wins) or runs out of lives (drivers win).
4. **Role rotation:** Players rotate who plays the frog each round.
5. **Match:** First to X frog-wins, or best survival time across rounds.

### Social / Party Game Elements

- **Voice chat chaos.** The frog player screaming while the drivers laugh is the core experience.
- **Kill cam.** On each death, everyone sees the splat from both perspectives — the driver's calm top-down view and the frog's terrified first-person angle, side by side.
- **Driver taunting.** Drivers can flash headlights or rev engines. Purely psychological.
- **Frog's revenge round.** Bonus round where the frog is giant and the drivers are tiny. Roles reversed. Pure chaos.

### Multiplayer Tech Considerations

- Networked multiplayer (WebSocket or WebRTC for browser-based, or Godot's built-in networking).
- Low data requirements — only need to sync frog position (grid cell), vehicle positions, and speed. No physics sync needed.
- Could prototype as local multiplayer first: one player on keyboard (frog), others on controllers (drivers), split-screen with the frog on one half and the top-down driver view on the other.
