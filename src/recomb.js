import * as THREE from 'three';
import {
  CAMERA_EYE_HEIGHT,
  RECOMB_CUTSCENE_DURATION,
  RECOMB_SQUASH_DURATION,
  RECOMB_HOLD_DURATION,
} from './config.js';

const FROG_BODY_COLOR = 0x4caf50;
const FROG_RED_COLOR = 0xff5566;
const FROG_EYE_COLOR = 0x111111;
const SPLAT_Y = 0.013; // matches DeathCutscene so the visual sits on the same plane

// Recombobulation cutscene — reversible cousin of DeathCutscene. When a hit is
// absorbed by a recomb charge, the camera yanks out, a placeholder frog body
// squashes flat, holds, then pops back up with an overshoot bounce. Frog group
// position is unchanged throughout, so on cleanup the camera reattaches and
// play resumes at the exact impact row/cellX.
//
// Vocabulary is deliberately different from death: no eyes flying, no blood,
// no droplets. Cartoon squash-and-stretch only. The gag is "frog turns to
// puddle and snaps back," not "frog dies."
export class RecombCutscene {
  constructor(scene, camera, frog) {
    this.scene = scene;
    this.camera = camera;
    this.frog = frog;
    this.elapsed = 0;
    this.duration = RECOMB_CUTSCENE_DURATION;

    this.impactX = frog.group.position.x;
    this.impactZ = frog.group.position.z;

    this._buildBody();
    this._setupCamera();
  }

  _buildBody() {
    this.group = new THREE.Group();
    this.group.position.set(this.impactX, 0, this.impactZ);
    this.scene.add(this.group);

    // Body — same dimensions as the death/intro frog so the player recognizes
    // "that's me." Material is per-instance so we can lerp color without
    // mutating the death cutscene's shared material.
    const bodyGeom = new THREE.BoxGeometry(0.5, 0.3, 0.55);
    this.bodyMat = new THREE.MeshLambertMaterial({ color: FROG_BODY_COLOR });
    this.body = new THREE.Mesh(bodyGeom, this.bodyMat);
    this.body.position.y = 0.15;
    this.group.add(this.body);

    // Two simple eye spheres parented to the body so they squash with it.
    // No userData / ballistics — recomb's gag is squash-and-stretch only.
    const eyeGeom = new THREE.SphereGeometry(0.08, 8, 6);
    const eyeMat = new THREE.MeshLambertMaterial({ color: FROG_EYE_COLOR });
    this.eyeMat = eyeMat;
    this.eyes = [];
    for (const dx of [-0.13, 0.13]) {
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      eye.position.set(dx, 0.34, -0.18);
      this.body.add(eye);
      this.eyes.push(eye);
    }
  }

  _setupCamera() {
    // Detach camera from the frog group → park it 3rd-person behind the impact.
    // Skip the orbit/dolly used by DeathCutscene; recomb's joke lands better
    // with a static camera locked on the splat.
    this.frog.group.remove(this.camera);
    this.scene.add(this.camera);
    this.camera.position.set(this.impactX, 1.4, this.impactZ + 1.7);
    this.camera.lookAt(this.impactX, 0.15, this.impactZ);
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.duration, 1);

    // Phase boundaries.
    const squashEnd = RECOMB_SQUASH_DURATION;
    const holdEnd = squashEnd + RECOMB_HOLD_DURATION;

    let yScale, xzScale, colorMix;
    if (this.elapsed < squashEnd) {
      // Squash: ease-in quadratic for a satisfying "splat."
      const u = this.elapsed / squashEnd;
      const ease = u * u;
      yScale = 1 - ease * 0.94;
      xzScale = 1 + ease * 0.7;
      colorMix = ease;
    } else if (this.elapsed < holdEnd) {
      // Hold flat — the deliberate "I am a puddle" beat.
      yScale = 0.06;
      xzScale = 1.7;
      colorMix = 1;
    } else {
      // Unsplat with damped overshoot bounce. `u` runs 0..1 over the unsplat
      // window. The damped-cosine envelope gives a comic squash-and-stretch
      // settle — overshoots ~1.0 then rings back to 1.
      const unsplatLen = this.duration - holdEnd;
      const u = (this.elapsed - holdEnd) / unsplatLen;
      const bounce = 1 - Math.exp(-u * 5) * Math.cos(u * Math.PI * 3);
      yScale = 0.06 + (1 - 0.06) * bounce;
      xzScale = 1.7 + (1 - 1.7) * bounce;
      // Inverse y-stretch on rebound: when y is taller than rest, x/z pull in
      // (preserve volume). Clamp so the body never inverts.
      xzScale = Math.max(0.7, xzScale);
      colorMix = Math.max(0, 1 - u);
    }

    this.body.scale.set(xzScale, Math.max(0.01, yScale), xzScale);
    this.body.position.y = 0.15 * yScale + SPLAT_Y * (1 - yScale);

    // Lerp body color toward red while squashed, back to green on rebound.
    this.bodyMat.color.set(FROG_BODY_COLOR);
    if (colorMix > 0) {
      this.bodyMat.color.lerp(_tmpRed.set(FROG_RED_COLOR), colorMix);
    }

    return t >= 1;
  }

  cleanup() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    // Reattach camera to frog.group at standard eye position. frog.group never
    // moved, so play resumes at the same row/cellX it died at.
    this.scene.remove(this.camera);
    this.frog.group.add(this.camera);
    this.camera.position.set(0, CAMERA_EYE_HEIGHT, 0);
    this.camera.rotation.set(0, 0, 0);
  }
}

const _tmpRed = new THREE.Color();
