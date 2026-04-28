import * as THREE from 'three';
import { buildWorld, disposeScene, placeObstaclesForLevel } from './world.js';
import { Frog } from './frog.js';
import { Input } from './input.js';
import { Spawner } from './spawner.js';
import { Hud } from './hud.js';
import { AudioManager } from './audio.js';
import { checkCollision, detectNearMisses } from './collision.js';
import { Score } from './score.js';
import { DeathCutscene } from './death.js';
import { RecombCutscene } from './recomb.js';
import { Skills, BRANCH_META, BRANCH_ORDER } from './skills.js';
import { BugManager } from './bugs.js';
import { Tongue } from './tongue.js';
import {
  FOV,
  NEAR_PLANE,
  FAR_PLANE,
  CAMERA_EYE_HEIGHT,
  INTRO_DURATION,
  INTRO_START_POS,
  SPEED_RAMP_PER_LEVEL,
  SUB_ROWS_PER_LANE,
  WORLD_TIME_SCALE_FOCUS,
  SKILL_POINT_CAP_LEVEL,
  laneCountForLevel,
  goalRowForLevel,
  buildLanesForLevel,
  pickThemeForLevel,
} from './config.js';

// State machine:
//   'PAUSED'         — overlay shown, no updates running.
//   'INTRO'          — first-time cinematic flythrough from top-down to frog POV.
//   'PLAYING'        — normal gameplay.
//   'SKILLPICK'      — between-crossings skill picker modal. World frozen; only
//                      keyboard 1–4 input fires (via input.js). Once the queued
//                      picks are spent, the deferred crossing transition runs.
//   'DYING'          — 3rd-person splat cutscene after a fatal hit (lives > 0).
//                      World is frozen for the duration; cutscene owns the camera.
//   'RECOMBOBULATING'— splat → unsplat cutscene after a fatal hit absorbed by a
//                      recomb charge. World keeps rolling; cutscene owns the camera;
//                      frog row/cellX are preserved so play resumes at the impact.
//   'GAMEOVER'       — out of lives; overlay shown with final score; click for new run.
//
// Each successful crossing tears down the world and rebuilds it for the new level —
// `_buildLevel` reconstructs the scene, frog, and spawner so lane count and direction
// patterns can grow with progression. The camera survives the rebuild (it's just
// re-parented), so the player's yaw/pitch persist across level transitions.
export class Game {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(
      FOV,
      window.innerWidth / window.innerHeight,
      NEAR_PLANE,
      FAR_PLANE
    );

    this.audio = new AudioManager();
    this.hud = new Hud();
    this.hud.renderMuted(this.audio.muted);
    this.input = new Input(this.camera, this);

    this.score = new Score();
    this.hud.renderHighScore(this.score.highScore);
    this.hud.renderLives(this.score.lives);
    this.hud.renderFrogLevel(this.score.frogLevel, this.score.xp);

    // Debug-menu cheat flags. Persist across deaths/runs (toggled from the
    // pause overlay). Honored by the collision check + cheatSetAllSkills.
    this.cheatInvuln = false;
    this.cheatAllSkills = false;

    // Skills + bug + tongue subsystems. Skills must be seeded BEFORE Tongue is
    // constructed, since Tongue captures the skills reference for tier lookups.
    // The constructor pre-spends Tongue Fu T1 so a basic tongue works from the
    // first hop of every fresh run.
    this.skills = new Skills();
    this.hud.renderSkillBadges(this.skills.tiersSnapshot());
    this.bugs = new BugManager();
    this.tongue = new Tongue(
      this.camera,
      this.bugs,
      this.skills,
      this.audio,
      (bug) => this._handleBugCollect(bug),
    );
    // Spaced-out level-up toast queue — drained from update(dt) so multiple
    // toasts in one crossing don't visually stack.
    this._levelUpToastQueue = [];
    this._levelUpToastTimer = 0;
    // Picker queue: FIFO of frog levels still owed a spend. Populated when a
    // crossing banks across thresholds; drained one-per-key-press in
    // onPickSkill. While non-empty, state is SKILLPICK and the crossing
    // transition (hud.onWin + audio.playWin + _buildLevel) is deferred.
    this._pendingLevelUps = [];
    this._pendingNextWorldLevel = null;

    // BANK_PARADE: a brief frozen-world phase between crossing-bank and either
    // SKILLPICK or the next _buildLevel. Holds the world still while the
    // bonus/level-up toasts queued by bankCrossing actually render — without
    // this, SKILLPICK's update() early-return would prevent the toast pumps
    // from ever firing, so the picker would slap up before the player saw what
    // they earned.
    this._paradeTimer = 0;
    this._paradePendsPicker = false;

    this.state = 'PAUSED';
    this.hasIntroPlayed = false;
    this._introElapsed = 0;
    this._introLook = new THREE.Vector3();
    this._introFrogMesh = null;
    this.deathCutscene = null;
    this.recombCutscene = null;
    this._pendingGameOver = false;

    // Frog Focus: rising/falling-edge tracking + DOM tint handle.
    this._focusActive = false;
    this.fxFocusEl = document.getElementById('focus-tint');

    this._buildLevel(1);

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // Build / rebuild the world for the given level. Disposes the prior scene's GPU resources.
  _buildLevel(level) {
    if (this.spawner) this.spawner.disposeAll();
    if (this.frog) this.frog.group.remove(this.camera);
    if (this.scene) {
      disposeScene(this.scene);
      this.scene = null;
    }

    this.level = level;
    const laneCount = laneCountForLevel(level);
    const goalRow = goalRowForLevel(level);
    this.theme = pickThemeForLevel(level);

    this.scene = buildWorld(laneCount, this.theme);
    this.obstacles = placeObstaclesForLevel(level, this.scene, laneCount);
    this.frog = new Frog(this.scene, this.camera, goalRow, this.skills);
    this.frog.isBlocked = (row, cellX) => {
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (o.row === row && o.cellX === cellX) return true;
      }
      return false;
    };
    const { lanes, rushHour } = buildLanesForLevel(level);
    this.spawner = new Spawner(this.scene, lanes, this.audio);
    this.spawner.setSpeedMultiplier(1 + SPEED_RAMP_PER_LEVEL * (level - 1));
    if (rushHour !== null) {
      this.hud.showMilestoneToast(
        rushHour > 0 ? 'RUSH HOUR — EASTBOUND' : 'RUSH HOUR — WESTBOUND'
      );
    }

    // Seed the road with traffic from level 2 onward — level 1 stays a clean intro,
    // but later levels should already feel busy when the new world fades in. Early
    // levels (2-4) used to start near-empty because spawns drift in from off-screen
    // over ~10 s; this floor pushes them straight to "feels alive" density. By
    // level 4 we're at the cap. Cap stays at 4/lane to keep within the spacing
    // guard on a 200m road.
    const prePopulate = level <= 1 ? 0 : Math.min(4, Math.floor(level / 2) + 2);
    this.spawner.prePopulate(prePopulate);

    // Place collectible bugs for this level. Must run AFTER prePopulate so the
    // wheel-row layout exists, after `this.scene` is rebuilt above, and after
    // obstacles so bugs can't spawn on a blocked cell.
    if (this.bugs) this.bugs.placeBugsForLevel(level, this.scene, this.obstacles);

    this.frog.onLand = () => {
      if (this.state !== 'PLAYING') return;
      this.audio.playHop();
      // Mercy auto-collect: any bug at the frog's exact landing cell is grabbed
      // automatically. Ensures the player never gets stuck on a bug under-foot.
      const bug = this.bugs.tryCollectAt(this.frog.row, this.frog.cellX);
      if (bug) this._handleBugCollect(bug);
    };
    this.frog.onBlocked = () => {
      if (this.state !== 'PLAYING') return;
      this.audio.playBlocked();
    };

    this._refillRecombCharges();
  }

  onLockAcquired() {
    // Coming back from game-over: wipe run state and rebuild level 1 before play.
    // The intro flag is already true (or doesn't matter for retry — we skip it).
    if (this.state === 'GAMEOVER') {
      this.score.reset();
      this.skills.reset();
      this._pendingLevelUps.length = 0;
      this._pendingNextWorldLevel = null;
      this._levelUpToastQueue.length = 0;
      this._levelUpToastTimer = 0;
      this._paradeTimer = 0;
      this._paradePendsPicker = false;
      this._focusActive = false;
      if (this.fxFocusEl) this.fxFocusEl.style.opacity = '0';
      this.hud.resetForNewRun();
      this.hud.renderHighScore(this.score.highScore);
      this.hud.renderSkillBadges(this.skills.tiersSnapshot());
      this._buildLevel(1);
      this.state = 'PLAYING';
      return;
    }
    // Picker survives a lock loss/regain cycle — don't clobber state back to
    // PLAYING under it, the player still owes a pick.
    if (this.state === 'SKILLPICK') return;
    if (!this.hasIntroPlayed) this._beginIntro();
    else this.state = 'PLAYING';
  }

  onLockLost() {
    // Game-over state was set in `update()` before the pointer-lock exit fired —
    // don't clobber it back to PAUSED, and leave the GAME OVER overlay text intact.
    // If we lose pointer lock mid-cutscene, snap to its end so resume goes
    // straight back to PLAYING from the start row (or impact row, for recomb)
    // instead of resuming a half-finished cutscene with a detached camera.
    if (this.state === 'DYING') this._finishDeathCutscene();
    else if (this.state === 'RECOMBOBULATING') this._finishRecombCutscene();
    // Drop focus on lock loss so the world isn't stuck in slow-mo on resume.
    if (this._focusActive) this._setFocusActive(false);
    // SKILLPICK and GAMEOVER own their own overlays — don't paint the pause
    // overlay over them.
    if (this.state !== 'GAMEOVER' && this.state !== 'SKILLPICK') {
      this.state = 'PAUSED';
      this.hud.showPause();
    }
    this.audio.suspend();
  }

  _beginIntro() {
    this.state = 'INTRO';
    this._introElapsed = 0;

    this.frog.group.remove(this.camera);
    this.scene.add(this.camera);
    this.camera.position.set(INTRO_START_POS[0], INTRO_START_POS[1], INTRO_START_POS[2]);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(this.frog.group.position);

    this._introFrogMesh = buildIntroFrogMesh();
    this.frog.group.add(this._introFrogMesh);
  }

  _finishIntro() {
    if (this._introFrogMesh) {
      this.frog.group.remove(this._introFrogMesh);
      this._introFrogMesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this._introFrogMesh = null;
    }

    this.scene.remove(this.camera);
    this.frog.group.add(this.camera);
    this.camera.position.set(0, CAMERA_EYE_HEIGHT, 0);
    this.camera.rotation.set(0, 0, 0);
    this.input.resetLook();
    this.hasIntroPlayed = true;
    this.state = 'PLAYING';
  }

  // Centralizes Frog Focus on/off transitions so all the side-effects (audio
  // sweep, score flag, DOM tint, SFX sting) stay in lockstep with `_focusActive`.
  _setFocusActive(active) {
    if (this._focusActive === active) return;
    this._focusActive = active;
    this.score.setFocusActive(active);
    this.audio.setFocusFilter(active, this.spawner.vehicles);
    if (this.fxFocusEl) this.fxFocusEl.style.opacity = active ? '1' : '0';
    if (active) this.audio.playFocusOn();
    else this.audio.playFocusOff();
  }

  // F key handler. Toggle on press: engage if unlocked + meter has fuel; or
  // disengage immediately if already on. Press while locked / empty silently
  // no-ops (the meter HUD is the indicator of why nothing happened).
  // Auto-disengage on empty meter happens in update() — pressing F again after
  // a refill is required, so toggling doesn't sneakily re-engage on a sliver.
  toggleFocus() {
    if (this.state !== 'PLAYING') return;
    if (this._focusActive) {
      this._setFocusActive(false);
      return;
    }
    if (!this.skills.canFrogFocus()) return;
    if (this.score.focusMeter <= 0) return;
    this._setFocusActive(true);
  }

  // --- Skill picker ---
  // Enter the SKILLPICK modal for the level at the head of `_pendingLevelUps`.
  // World freezes (state-gated in update). If every branch is already maxed
  // (cheat-all-skills path, or 27 picks already spent), short-circuit straight
  // to _exitSkillPick — no point showing a modal with no actionable options.
  _enterSkillPick() {
    if (this.skills.allMaxed()) {
      this._pendingLevelUps.length = 0;
      this._exitSkillPick();
      return;
    }
    this.state = 'SKILLPICK';
    if (this._focusActive) this._setFocusActive(false);
    // Quiet the world while the player decides: ramp every live engine to 0
    // (updateEngines doesn't run during SKILLPICK, so without this they'd
    // hold their last frame's gain) and start a chiptune loop on the picker.
    this.audio.silenceEngines(this.spawner.vehicles);
    this.audio.playSkillPickMusic();
    const frogLevel = this._pendingLevelUps[0];
    this.hud.showSkillPicker({
      frogLevel,
      tiers: this.skills.tiersSnapshot(),
      branchOrder: BRANCH_ORDER,
      branchMeta: BRANCH_META,
    });
  }

  // Called from input.js on Digit1-4 while in SKILLPICK. Branch-tier-already-
  // maxed picks silently no-op so a misclick doesn't burn the player's point.
  onPickSkill(branchId) {
    if (this.state !== 'SKILLPICK') return;
    if (this.skills.isMaxed(branchId)) return;
    this.skills.spend(branchId);
    const newTier = this.skills.tier(branchId);
    const meta = BRANCH_META[branchId];
    const label = meta.tierLabels[newTier] ?? `T${newTier}`;
    this.hud.showLevelUpToast(`+1 ${meta.icon} ${meta.name} T${newTier} — ${label}`);
    this.hud.renderSkillBadges(this.skills.tiersSnapshot());
    this.audio.playLevelUp();
    this._pendingLevelUps.shift();
    if (this._pendingLevelUps.length > 0 && !this.skills.allMaxed()) {
      // Re-render the picker for the next queued level — the previous spend
      // may have changed which branches are available / what their next-tier
      // labels read as.
      const frogLevel = this._pendingLevelUps[0];
      this.hud.showSkillPicker({
        frogLevel,
        tiers: this.skills.tiersSnapshot(),
        branchOrder: BRANCH_ORDER,
        branchMeta: BRANCH_META,
      });
      return;
    }
    this._pendingLevelUps.length = 0;
    this._exitSkillPick();
  }

  _exitSkillPick() {
    this.audio.stopSkillPickMusic();
    this.hud.hideSkillPicker();
    const targetLevel = this._pendingNextWorldLevel ?? this.level + 1;
    this._pendingNextWorldLevel = null;
    this.state = 'PLAYING';
    const newLevel = this.hud.onWin();
    this.audio.playWin();
    // Trust hud.onWin's increment as the source-of-truth world level (it
    // tracks +1 per crossing internally). We staged _pendingNextWorldLevel
    // for symmetry; reconcile if the hud counter ever drifts.
    this._buildLevel(newLevel);
    void targetLevel; // reserved for future cross-check
  }

  // Centralized bug-pickup routing. Regular bugs feed score + audio + focus
  // meter (via score.addBugPickup); extra-life bugs grant +1 life and a
  // distinct toast/SFX, with no combo bump or meter fill — the reward is the
  // life itself, not score chaining.
  _handleBugCollect(bug) {
    if (bug.kind === 'extraLife') {
      this.score.lives++;
      this.hud.renderLives(this.score.lives);
      this.hud.showMilestoneToast('+1 LIFE!');
      this.audio.playLevelUp();
      return;
    }
    this.score.addBugPickup();
    this.audio.playPickup();
  }

  // Refill Recombobulation charges to the tier cap. Called once per game-level
  // build, so each crossing starts with a full set. (Earlier the grant was
  // one-shot at frog-level tier-up, but per-game-level felt better in playtest.)
  _refillRecombCharges() {
    const cap = this.skills.recombCap();
    this.score.recombCharges = cap;
    this.hud.renderRecombCharges(cap, cap > 0);
  }

  // --- Debug-menu cheats (DebugMenu wires DOM controls to these) ---

  cheatSetInvuln(on) {
    this.cheatInvuln = !!on;
  }

  // "ALL SKILLS UNLOCKED" — snap every branch to T7 (or back to fresh-run
  // baseline on toggle-off). We mutate Skills directly rather than threading
  // a "as-if max" view through every helper, because per-mechanic gating is
  // already in the helpers themselves.
  cheatSetAllSkills(on) {
    this.cheatAllSkills = !!on;
    if (on) this.skills.cheatMaxAll();
    else    this.skills.cheatReset();
    this.hud.renderSkillBadges(this.skills.tiersSnapshot());
    this._refillRecombCharges();
  }

  cheatWarpToLevel(level) {
    if (!Number.isFinite(level) || level < 1) return;
    if (this._focusActive) this._setFocusActive(false);
    if (this.deathCutscene) this._finishDeathCutscene();
    if (this.recombCutscene) this._finishRecombCutscene();
    this._buildLevel(level);
    this.hud.setLevel(level);
  }

  _beginRecombCutscene() {
    this.state = 'RECOMBOBULATING';
    // Drop focus immediately if it was active — slow-mo through the cutscene
    // would feel wrong, and the falling-edge audio sweep should fire now.
    if (this._focusActive) this._setFocusActive(false);
    // Wipe per-vehicle near-miss state — same correctness need as the death
    // cutscene path: a half-built approach shouldn't pay out after un-splat.
    for (const v of this.spawner.vehicles) {
      v.nearMiss.tier = null;
      v.nearMiss.threadedHop = false;
      v.nearMiss.threadedRows = 0;
      v.nearMiss.lastSign = 0;
    }
    this.recombCutscene = new RecombCutscene(this.scene, this.camera, this.frog);
    this.audio.playRecombobulate();
    this.hud.showMilestoneToast('RECOMBOBULATED!');
    this.hud.renderRecombCharges(this.score.recombCharges, this.skills.recombCap() > 0);
  }

  _finishRecombCutscene() {
    if (!this.recombCutscene) return;
    this.recombCutscene.cleanup();
    this.recombCutscene = null;
    this.input.resetLook();
    // Frog row/cellX never changed. If the hit happened mid-hop the group is
    // partway through an arc — snap it back to the committed cell so the
    // reattached camera sits at the right height.
    this.frog.resumeAtRest();
    this.state = 'PLAYING';
  }

  _beginDeathCutscene(vehicle, isGameOver) {
    this.state = 'DYING';
    this._pendingGameOver = isGameOver;
    // Drop focus immediately so the engine lowpass + tint don't linger through
    // the splat. score.onDeath already wiped the meter; this clears side-effects.
    if (this._focusActive) this._setFocusActive(false);
    // score.onDeath has already cleared the combo to 1; force the HUD to
    // reflect it immediately so the multiplier doesn't visibly linger across
    // the splat (DYING short-circuits the regular renderCombo at end of update).
    this.hud.renderCombo(1);
    // Wipe per-vehicle near-miss tracking so a half-built approach doesn't
    // pay out after respawn. Without this, lastSign frozen at >0 from the
    // kill frame would resolve to a transition on the first PLAYING frame
    // post-cutscene and fire a stale GRAZED.
    for (const v of this.spawner.vehicles) {
      v.nearMiss.tier = null;
      v.nearMiss.threadedHop = false;
      v.nearMiss.threadedRows = 0;
      v.nearMiss.lastSign = 0;
    }
    this.deathCutscene = new DeathCutscene(this.scene, this.camera, this.frog, vehicle);
  }

  _finishDeathCutscene() {
    if (!this.deathCutscene) return;
    this.deathCutscene.cleanup();
    this.deathCutscene = null;
    if (this._pendingGameOver) {
      this._pendingGameOver = false;
      this.state = 'GAMEOVER';
      this.hud.showGameOver(this.score.banked, this.score.highScore);
      if (document.exitPointerLock) document.exitPointerLock();
    } else {
      this.frog.resetToStart();
      this.input.resetLook();
      this.state = 'PLAYING';
    }
  }

  update(dt) {
    if (this.state === 'PAUSED' || this.state === 'GAMEOVER') return;
    // Skill picker fully freezes the world — vehicles, spawner, audio, focus,
    // bug drift, the whole loop. Only keyboard 1–4 (handled in input.js)
    // mutates state; on the last spend, _exitSkillPick runs the deferred
    // crossing transition and flips back to PLAYING.
    if (this.state === 'SKILLPICK') return;

    // Brief post-crossing frozen-world phase. Vehicles/frog/audio engines are
    // not ticked, but milestone + level-up toast pumps continue so the player
    // sees what they earned (UNTOUCHABLE, FROG LEVEL N, etc.) before the
    // picker modal — or the next world level — takes over.
    if (this.state === 'BANK_PARADE') {
      const toasts = this.score.drainToasts();
      if (toasts) for (const t of toasts) this.hud.showMilestoneToast(t);
      this._pumpLevelUpToasts(dt);
      this._paradeTimer -= dt;
      if (this._paradeTimer <= 0) {
        if (this._paradePendsPicker) {
          this._paradePendsPicker = false;
          this._enterSkillPick();
        } else {
          this.state = 'PLAYING';
          const newLevel = this.hud.onWin();
          this.audio.playWin();
          this._buildLevel(newLevel);
        }
      }
      return;
    }

    if (this.state === 'DYING') {
      // Frog is frozen, but traffic keeps rolling past the splat — sells the
      // gag (cars don't care). Engines keep doppler-tracking the frog's last
      // position. Cutscene drives the camera and ticks its own splat animation.
      this.spawner.update(dt);
      this.audio.updateEngines(this.frog, this.spawner.vehicles);
      const done = this.deathCutscene.update(dt);
      if (done) this._finishDeathCutscene();
      return;
    }

    if (this.state === 'RECOMBOBULATING') {
      // World keeps rolling: vehicles continue, engines audible. The cutscene
      // owns the camera and animates a placeholder splat → unsplat. When done,
      // the frog reappears at the unchanged row/cellX.
      this.spawner.update(dt);
      this.audio.updateEngines(this.frog, this.spawner.vehicles);
      const done = this.recombCutscene.update(dt);
      if (done) this._finishRecombCutscene();
      return;
    }

    if (this.state === 'INTRO') {
      this._introElapsed += dt;
      const t = Math.min(this._introElapsed / INTRO_DURATION, 1);
      const ease = easeInOutCubic(t);

      this.camera.position.x = INTRO_START_POS[0] * (1 - ease);
      this.camera.position.y =
        INTRO_START_POS[1] * (1 - ease) + CAMERA_EYE_HEIGHT * ease;
      this.camera.position.z = INTRO_START_POS[2] * (1 - ease);

      this._introLook.set(
        0,
        0 * (1 - ease) + CAMERA_EYE_HEIGHT * ease,
        -10 * ease
      );
      this.camera.lookAt(this._introLook);

      this.spawner.update(dt);
      this.audio.updateEngines(this.frog, this.spawner.vehicles);

      if (t >= 1) this._finishIntro();
      return;
    }

    // PLAYING
    // Frog + tongue + input + score combo decay run at full speed (the player's
    // edge during Frog Focus). Spawner + bugs + audio engines run at scaled dt.
    const focusUnlocked = this.skills.canFrogFocus();
    // Focus toggles on/off via toggleFocus() (F key). The only implicit
    // transition is "auto-disengage when meter empties" — re-engage requires
    // another F press after a refill, so a sliver of meter doesn't sneak focus
    // back on while the player isn't asking for it.
    if (this._focusActive && this.score.focusMeter <= 0) this._setFocusActive(false);
    const scale = this._focusActive ? WORLD_TIME_SCALE_FOCUS : 1;
    const dtScaled = dt * scale;

    this.frog.update(dt);
    this.spawner.update(dtScaled);
    this.bugs.update(dtScaled, this.frog, this.skills);
    this.tongue.update(dt);
    this._pumpLevelUpToasts(dt);

    // Drain the focus meter at REAL time — the cost should bite even though
    // the world is slowed. When it hits 0, the auto-disengage check above
    // fires on the next frame.
    if (this._focusActive) {
      const dur = this.skills.focusDuration() || 6;
      this.score.drainFocusMeter(dt, dur);
    }
    this.hud.renderFocusMeter(this.score.focusMeter, focusUnlocked);

    // In-traffic = on a wheel-row sub-row. Excludes start (row 0), goal, the
    // safe between-lane stripes (every SUB_ROWS_PER_LANE-th row), and DEAD frame.
    const inTraffic =
      this.frog.state !== 'DEAD' &&
      this.frog.row > 0 &&
      this.frog.row < this.frog.goalRow &&
      this.frog.row % SUB_ROWS_PER_LANE !== 0;
    this.score.update(dt, inTraffic);

    const toasts = this.score.drainToasts();
    if (toasts) for (const t of toasts) this.hud.showMilestoneToast(t);

    // Collision check FIRST. A fatal hit short-circuits near-miss processing
    // for this frame — getting wheel-killed shouldn't also pay out a GRAZED.
    // _beginDeathCutscene wipes per-vehicle near-miss state too, so stale
    // approaches don't resolve on the first frame after respawn.
    const hit = this.cheatInvuln ? null : checkCollision(this.frog, this.spawner.vehicles);
    if (hit) {
      // Recombobulation intercepts a fatal hit if the player has charges. No
      // life lost; cutscene plays splat → unsplat; frog resumes at impact.
      if (this.score.consumeRecombCharge()) {
        this._beginRecombCutscene();
      } else {
        const isGameOver = this.score.onDeath();
        this.frog.die();
        this.audio.playSquish();
        this.hud.onDeath();
        this.hud.renderLives(this.score.lives);
        this.hud.renderHighScore(this.score.highScore);
        // Always run the splat cutscene — even on the final life. The GAMEOVER
        // overlay is shown by _finishDeathCutscene once the splat completes.
        this._beginDeathCutscene(hit, isGameOver);
      }
    } else {
      // Near-miss events fire one per vehicle on the approach→pass transition.
      const nearMisses = detectNearMisses(this.frog, this.spawner.vehicles);
      if (nearMisses) {
        for (const { tier, vehicle, daredevil } of nearMisses) {
          const before = this.score.pending;
          this.score.addNearMiss(tier, vehicle, { daredevil });
          const earned = this.score.pending - before;
          this.hud.onNearMiss();
          const label =
            daredevil          ? `DAREDEVIL!! +${earned.toLocaleString()}` :
            tier === 'THREADED' ? `THREADED! +${earned.toLocaleString()}` :
            tier === 'UNDER'    ? `DOWN UNDER +${earned.toLocaleString()}` :
            tier === 'GRAZED'   ? `GRAZED +${earned.toLocaleString()}` : null;
          if (label) this.hud.showMilestoneToast(label);
        }
      }
      if (this.frog.row === this.frog.goalRow && this.frog.state === 'IDLE') {
        // Drop focus before the bank — bankCrossing wipes the meter, so a
        // 1-frame stale `_focusActive` would otherwise straddle the level rebuild.
        if (this._focusActive) this._setFocusActive(false);
        const { untouchableBonus } = this.score.bankCrossing(this.level);
        // Untouchable refills the focus meter to full as part of its perk —
        // gated on the skill being unlocked (no point filling a hidden meter).
        if (untouchableBonus > 0 && this.skills.canFrogFocus()) {
          this.score.focusMeter = 1;
        }
        // Drain any frog-level-ups the bank just produced. Every level-up
        // fires a "FROG LEVEL N" toast + the level-up sting; only those
        // at-or-below the skill cap also enqueue a picker spend.
        const levelUps = this.score.drainLevelUps() || [];
        if (levelUps.length > 0) {
          for (const newLevel of levelUps) {
            this._levelUpToastQueue.push(`FROG LEVEL ${newLevel}`);
          }
          this.audio.playLevelUp();
          const spendable = levelUps.filter((lv) => lv <= SKILL_POINT_CAP_LEVEL);
          const pendsPicker = spendable.length > 0;
          if (pendsPicker) {
            // Defer hud.onWin / audio.playWin / _buildLevel until the picker
            // queue empties — _exitSkillPick runs the crossing transition.
            this._pendingLevelUps.push(...spendable);
            this._pendingNextWorldLevel = this.level + 1;
          }
          // Enter BANK_PARADE so the queued toasts (UNTOUCHABLE bonus + the
          // FROG LEVEL N sequence) render before the picker modal — or the
          // next-level rebuild — takes over. Parade duration covers whichever
          // sequence runs longest:
          //   - milestone toast (UNTOUCHABLE / SURVIVED) = 1.1 s
          //   - level-up toast queue = 0.45 s spacing × queueLength + 1.4 s tail
          const luQueueLen = this._levelUpToastQueue.length;
          const milestoneDur = 1.1;
          const luSequenceDur = luQueueLen > 0 ? (luQueueLen - 1) * 0.45 + 1.4 : 0;
          this._paradeTimer = Math.max(milestoneDur, luSequenceDur);
          this._paradePendsPicker = pendsPicker;
          this.state = 'BANK_PARADE';
          // Engines hold their last gain when not ticked — silence them so the
          // parade phase isn't an unmoving hum under the toasts.
          this.audio.silenceEngines(this.spawner.vehicles);
          return;
        }
        // No level-ups: snap-rebuild as before. The UNTOUCHABLE toast (if any)
        // queues into score._toastQueue and renders during the next level's
        // first frames; no parade needed.
        const newLevel = this.hud.onWin();
        this.audio.playWin();
        this._buildLevel(newLevel);
      }
    }

    this.hud.renderScore(this.score.totalScore());
    this.hud.renderCombo(this.score.combo);
    this.hud.renderFrogLevel(this.score.frogLevel, this.score.xp);
    this.audio.updateEngines(this.frog, this.spawner.vehicles, scale);
  }

  // Show queued level-up toasts one at a time, spaced 0.45s apart so multiple
  // unlocks on a single crossing read as a sequence instead of overwriting.
  _pumpLevelUpToasts(dt) {
    if (this._levelUpToastQueue.length === 0) return;
    this._levelUpToastTimer -= dt;
    if (this._levelUpToastTimer > 0) return;
    const text = this._levelUpToastQueue.shift();
    this.hud.showLevelUpToast(text);
    this._levelUpToastTimer = 0.45;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Stylized frog placeholder shown only during the cinematic intro.
function buildIntroFrogMesh() {
  const group = new THREE.Group();
  const bodyGeom = new THREE.BoxGeometry(0.5, 0.3, 0.55);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.15;
  group.add(body);

  const eyeGeom = new THREE.SphereGeometry(0.08, 10, 8);
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const dx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(eyeGeom, eyeMat);
    eye.position.set(dx, 0.34, -0.18);
    group.add(eye);
  }
  return group;
}
