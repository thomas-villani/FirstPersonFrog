import * as THREE from 'three';
import { buildWorld, disposeScene } from './world.js';
import { Frog } from './frog.js';
import { Input } from './input.js';
import { Spawner } from './spawner.js';
import { Hud } from './hud.js';
import { AudioManager } from './audio.js';
import { checkCollision, detectNearMisses } from './collision.js';
import { Score } from './score.js';
import { DeathCutscene } from './death.js';
import {
  FOV,
  NEAR_PLANE,
  FAR_PLANE,
  CAMERA_EYE_HEIGHT,
  INTRO_DURATION,
  INTRO_START_POS,
  SPEED_RAMP_PER_LEVEL,
  SUB_ROWS_PER_LANE,
  laneCountForLevel,
  goalRowForLevel,
  buildLanesForLevel,
} from './config.js';

// State machine:
//   'PAUSED'   — overlay shown, no updates running.
//   'INTRO'    — first-time cinematic flythrough from top-down to frog POV.
//   'PLAYING'  — normal gameplay.
//   'DYING'    — 3rd-person splat cutscene after a fatal hit (lives > 0). World
//                is frozen for the duration; cutscene owns the camera.
//   'GAMEOVER' — out of lives; overlay shown with final score; click for new run.
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
    this.input = new Input(this.camera, this);

    this.score = new Score();
    this.hud.renderHighScore(this.score.highScore);
    this.hud.renderLives(this.score.lives);

    this.state = 'PAUSED';
    this.hasIntroPlayed = false;
    this._introElapsed = 0;
    this._introLook = new THREE.Vector3();
    this._introFrogMesh = null;
    this.deathCutscene = null;
    this._pendingGameOver = false;

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

    this.scene = buildWorld(laneCount);
    this.frog = new Frog(this.scene, this.camera, goalRow);
    this.spawner = new Spawner(this.scene, buildLanesForLevel(level), this.audio);
    this.spawner.setSpeedMultiplier(1 + SPEED_RAMP_PER_LEVEL * (level - 1));

    // Seed the road with traffic from level 2 onward — level 1 stays a clean intro,
    // but later levels should already feel busy when the new world fades in.
    // Cap at 4/lane so we don't spawn more vehicles than the spacing guard can fit.
    const prePopulate = level <= 1 ? 0 : Math.min(4, Math.floor(level / 2) + 1);
    this.spawner.prePopulate(prePopulate);

    this.frog.onLand = () => {
      if (this.state === 'PLAYING') this.audio.playHop();
    };
  }

  onLockAcquired() {
    // Coming back from game-over: wipe run state and rebuild level 1 before play.
    // The intro flag is already true (or doesn't matter for retry — we skip it).
    if (this.state === 'GAMEOVER') {
      this.score.reset();
      this.hud.resetForNewRun();
      this.hud.renderHighScore(this.score.highScore);
      this._buildLevel(1);
      this.state = 'PLAYING';
      return;
    }
    if (!this.hasIntroPlayed) this._beginIntro();
    else this.state = 'PLAYING';
  }

  onLockLost() {
    // Game-over state was set in `update()` before the pointer-lock exit fired —
    // don't clobber it back to PAUSED, and leave the GAME OVER overlay text intact.
    // If we lose pointer lock mid-cutscene, snap to its end so resume goes
    // straight back to PLAYING from the start row instead of resuming a
    // half-finished splat with a detached camera.
    if (this.state === 'DYING') this._finishDeathCutscene();
    if (this.state !== 'GAMEOVER') {
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

  _beginDeathCutscene(vehicle, isGameOver) {
    this.state = 'DYING';
    this._pendingGameOver = isGameOver;
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
    this.frog.update(dt);
    this.spawner.update(dt);

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
    const hit = checkCollision(this.frog, this.spawner.vehicles);
    if (hit) {
      const isGameOver = this.score.onDeath();
      this.frog.die();
      this.audio.playSquish();
      this.hud.onDeath();
      this.hud.renderLives(this.score.lives);
      this.hud.renderHighScore(this.score.highScore);
      // Always run the splat cutscene — even on the final life. The GAMEOVER
      // overlay is shown by _finishDeathCutscene once the splat completes.
      this._beginDeathCutscene(hit, isGameOver);
    } else {
      // Near-miss events fire one per vehicle on the approach→pass transition.
      const nearMisses = detectNearMisses(this.frog, this.spawner.vehicles);
      if (nearMisses) {
        for (const { tier, vehicle } of nearMisses) {
          const before = this.score.pending;
          this.score.addNearMiss(tier, vehicle);
          const earned = this.score.pending - before;
          this.hud.onNearMiss();
          const label =
            tier === 'THREADED' ? `THREADED! +${earned.toLocaleString()}` :
            tier === 'UNDER'    ? `UNDER +${earned.toLocaleString()}` :
            tier === 'GRAZED'   ? `GRAZED +${earned.toLocaleString()}` : null;
          if (label) this.hud.showMilestoneToast(label);
        }
      }
      if (this.frog.row === this.frog.goalRow && this.frog.state === 'IDLE') {
        this.score.bankCrossing(this.level);
        const newLevel = this.hud.onWin();
        this.audio.playWin();
        this._buildLevel(newLevel);
      }
    }

    this.hud.renderScore(this.score.totalScore());
    this.hud.renderCombo(this.score.combo);
    this.audio.updateEngines(this.frog, this.spawner.vehicles);
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
