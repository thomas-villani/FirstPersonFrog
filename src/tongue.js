import * as THREE from 'three';
import {
  TONGUE_CAPSULE_RADIUS,
  TONGUE_COOLDOWN,
  TONGUE_FLICK_DURATION,
  CELL_WIDTH,
} from './config.js';

const SHAFT_COLOR = 0xff44a0;
const TIP_COLOR = 0xd6256e;

// Active tongue flick. Press Space → fires a capsule along the player's horizontal
// look direction (yaw projected onto XZ — pitch ignored, so looking up doesn't
// shoot the tongue at the sky). Range scales with tier:
//   T1 (Frog Lv 2): 1 cell
//   T2 (Frog Lv 6): 2 cells
//   T3 (Frog Lv 12): 3 cells (also unlocks Bug Magnet passive — not in this build phase)
// Bugs intersecting the capsule are collected. Closest along the axis wins.
//
// Visual: a tapered pink shaft (thicker at the mouth, thinner at the tip) with a
// slightly-redder spherical sticky-pad at the end. Both are parented to the camera
// in a Group rotated -π/2 around X so geometry-local +Y maps to camera-local -Z
// (forward). The Group sits a few cm below the camera's origin so the player sees
// the TOP of the tongue extending out of view rather than looking down its axis.
//
// Animation curve: 0.0–0.35 extend, 0.35–0.65 hold, 0.65–1.0 retract.
export class Tongue {
  constructor(camera, bugs, skills, audio, onCollect) {
    this.camera = camera;
    this.bugs = bugs;
    this.skills = skills;
    this.audio = audio;
    // Game-owned handler for a captured bug (routes regular vs. extra-life).
    this.onCollect = onCollect;
    this._cooldown = 0;
    this._activeElapsed = 0;
    this._activeRange = 0;
    this._active = false;

    // Group: transforms shared by shaft + tip. Three deliberate choices:
    //
    //  1. Base pushed 15 cm forward of the camera. At the near plane (2 cm) a
    //     1.4 cm shaft would subtend ~120° of view — a screen-wide pink flash.
    //     At 15 cm it subtends ~11° — a thin line.
    //  2. Base dropped to camera-y -0.13 (well below the eye line). The shaft
    //     extends straight forward (rotation.x = -π/2, no extra tilt), and
    //     perspective alone makes the tip rise toward screen center. Reads
    //     as a tongue emerging from the lower jaw.
    //  3. Materials use depthTest: false + renderOrder 999 so the tongue
    //     ALWAYS renders on top of the world. Without this it gets occluded
    //     by ground/vehicles whenever the camera pitches down (the world-space
    //     extent of the shaft plunges below the asphalt). The collision
    //     capsule remains a yaw-projected horizontal — the visual is HUD-like
    //     but the hit-test isn't.
    this.group = new THREE.Group();
    this.group.position.set(0, -0.13, -0.15);
    this.group.rotation.x = -Math.PI / 2;
    this.group.visible = false;
    camera.add(this.group);

    // Shaft: thin cylinder (slightly fatter at the base end). Geometry is
    // unit-length along Y, translated so its base sits at y=0 and its tip at
    // y=+1; mesh.scale.y sets the active reach in meters.
    const shaftGeom = new THREE.CylinderGeometry(0.012, 0.018, 1, 10);
    shaftGeom.translate(0, 0.5, 0);
    this.shaftMat = new THREE.MeshBasicMaterial({
      color: SHAFT_COLOR,
      depthTest: false,
      depthWrite: false,
    });
    this.shaftMesh = new THREE.Mesh(shaftGeom, this.shaftMat);
    this.shaftMesh.scale.y = 0.001;
    this.shaftMesh.renderOrder = 999;
    this.group.add(this.shaftMesh);

    // Tip: sticky-pad sphere at the shaft end. Separate mesh so it doesn't
    // squash with the shaft's length scale. Tip Y tracks shaft length.
    const tipGeom = new THREE.SphereGeometry(0.06, 10, 8);
    this.tipMat = new THREE.MeshBasicMaterial({
      color: TIP_COLOR,
      depthTest: false,
      depthWrite: false,
    });
    this.tipMesh = new THREE.Mesh(tipGeom, this.tipMat);
    this.tipMesh.position.y = 0;
    this.tipMesh.renderOrder = 999;
    this.group.add(this.tipMesh);
  }

  flick() {
    if (this._cooldown > 0) return;
    const range = this.skills.tongueRange() * CELL_WIDTH;
    if (range <= 0) return;

    // World-space yaw-projected forward. Camera quaternion includes pitch; we
    // zero Y after applying it so the tongue stays horizontal in the world.
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    origin.addScaledVector(dir, 0.1);

    const bug = this.bugs.tryCollectInCapsule(origin, dir, range, TONGUE_CAPSULE_RADIUS);

    this.audio.playTongueFlick();
    if (bug && this.onCollect) this.onCollect(bug);

    this._cooldown = TONGUE_COOLDOWN;
    this._active = true;
    this._activeElapsed = 0;
    this._activeRange = range;
    this.group.visible = true;
  }

  update(dt) {
    if (this._cooldown > 0) this._cooldown = Math.max(0, this._cooldown - dt);
    if (!this._active) return;

    this._activeElapsed += dt;
    const t = this._activeElapsed / TONGUE_FLICK_DURATION;
    if (t >= 1) {
      this._active = false;
      this.group.visible = false;
      this.shaftMesh.scale.y = 0.001;
      this.tipMesh.position.y = 0;
      return;
    }
    // Three-segment curve: extend, hold at full reach, retract.
    let shape;
    if (t < 0.35) shape = t / 0.35;
    else if (t < 0.65) shape = 1;
    else shape = 1 - (t - 0.65) / 0.35;
    const len = Math.max(0.001, this._activeRange * shape);
    this.shaftMesh.scale.y = len;
    this.tipMesh.position.y = len;
  }
}
