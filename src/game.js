import * as THREE from 'three';
import { buildWorld, disposeScene } from './world.js';
import { Frog } from './frog.js';
import { Input } from './input.js';
import { Spawner } from './spawner.js';
import { Hud } from './hud.js';
import { AudioManager } from './audio.js';
import { checkCollision } from './collision.js';
import {
  FOV,
  NEAR_PLANE,
  FAR_PLANE,
  CAMERA_EYE_HEIGHT,
  INTRO_DURATION,
  INTRO_START_POS,
  SPEED_RAMP_PER_LEVEL,
  laneCountForLevel,
  goalRowForLevel,
  buildLanesForLevel,
} from './config.js';

// State machine:
//   'PAUSED'  — overlay shown, no updates running.
//   'INTRO'   — first-time cinematic flythrough from top-down to frog POV.
//   'PLAYING' — normal gameplay.
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

    this.state = 'PAUSED';
    this.hasIntroPlayed = false;
    this._introElapsed = 0;
    this._introLook = new THREE.Vector3();
    this._introFrogMesh = null;

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
    if (!this.hasIntroPlayed) this._beginIntro();
    else this.state = 'PLAYING';
  }

  onLockLost() {
    this.state = 'PAUSED';
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

  update(dt) {
    if (this.state === 'PAUSED') return;

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
    const hit = checkCollision(this.frog, this.spawner.vehicles);
    if (hit) {
      this.frog.die();
      this.audio.playSquish();
      this.hud.onDeath();
    } else if (this.frog.row === this.frog.goalRow && this.frog.state === 'IDLE') {
      const newLevel = this.hud.onWin();
      this.audio.playWin();
      this._buildLevel(newLevel);
    }
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
