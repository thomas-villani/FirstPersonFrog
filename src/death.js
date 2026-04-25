import * as THREE from 'three';
import {
  CAMERA_EYE_HEIGHT,
  DEATH_CUTSCENE_DURATION,
  DEATH_CAM_HEIGHT,
  DEATH_CAM_RADIUS,
  DEATH_CAM_ORBIT,
  DEATH_BLOOD_COLOR,
  DEATH_DROPLET_COUNT,
} from './config.js';

const FROG_BODY_COLOR = 0x4caf50;
const FROG_EYE_COLOR = 0x111111;
const GRAVITY = 9.8;
const SPLAT_Y = 0.013; // just above lane stripes (0.01) and garbage (0.012)

// 3rd-person death cutscene. Lifetime owned by Game: constructed on a fatal
// collision, ticked each frame in the DYING state, and torn down before the
// frog respawns. The camera is yanked out of the frog group, parked above the
// impact, and orbits slightly while the frog mesh squashes and blood spreads.
//
// Vehicles and the frog state machine are paused for the duration — the camera
// is no longer attached to the frog group, so frog.update() must NOT run (it
// would silently move our reference point out from under the cutscene).
export class DeathCutscene {
  constructor(scene, camera, frog, vehicle) {
    this.scene = scene;
    this.camera = camera;
    this.frog = frog;
    this.vehicle = vehicle;
    this.elapsed = 0;
    this.duration = DEATH_CUTSCENE_DURATION;

    this.impactX = frog.group.position.x;
    this.impactZ = frog.group.position.z;

    // Camera baseline angle: place behind the frog (toward +Z, the start side)
    // so the player keeps mental orientation. Vehicle moves along ±X, so this
    // gives a broadside view of the killer truck parked over the splat.
    this._baseAngle = 0;

    this._buildSplat();
    this._setupCamera();
  }

  _buildSplat() {
    this.group = new THREE.Group();
    this.group.position.set(this.impactX, 0, this.impactZ);
    this.scene.add(this.group);

    // Frog body — same dimensions as the intro placeholder so the player
    // recognizes "that's me." Squashes flat over the first ~0.12s.
    const bodyGeom = new THREE.BoxGeometry(0.5, 0.3, 0.55);
    const bodyMat = new THREE.MeshLambertMaterial({ color: FROG_BODY_COLOR });
    this.body = new THREE.Mesh(bodyGeom, bodyMat);
    this.body.position.y = 0.15;
    this.group.add(this.body);

    // Eyes pop off and tumble. Random initial velocities, simple ballistic.
    const eyeGeom = new THREE.SphereGeometry(0.08, 8, 6);
    const eyeMat = new THREE.MeshLambertMaterial({ color: FROG_EYE_COLOR });
    this.eyes = [];
    for (const baseDx of [-0.13, 0.13]) {
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      eye.position.set(baseDx, 0.34, -0.18);
      eye.userData.vx = baseDx * 4 + (Math.random() - 0.5) * 1.0;
      eye.userData.vy = 2.2 + Math.random() * 1.2;
      eye.userData.vz = (Math.random() - 0.3) * 1.4;
      eye.userData.landed = false;
      this.group.add(eye);
      this.eyes.push(eye);
    }

    // Central blood pool — flat circle on the asphalt that grows from a point.
    const diskGeom = new THREE.CircleGeometry(0.85, 16);
    diskGeom.rotateX(-Math.PI / 2);
    const diskMat = new THREE.MeshBasicMaterial({ color: DEATH_BLOOD_COLOR });
    diskMat.fog = true;
    this.disk = new THREE.Mesh(diskGeom, diskMat);
    this.disk.position.y = SPLAT_Y;
    this.disk.scale.setScalar(0.05);
    this.group.add(this.disk);

    // Droplets — chunky red cubes thrown radially with gravity. They land on
    // the asphalt and freeze, leaving a scattered splatter pattern.
    const dropGeom = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const dropMat = new THREE.MeshLambertMaterial({ color: DEATH_BLOOD_COLOR });
    this.droplets = [];
    for (let i = 0; i < DEATH_DROPLET_COUNT; i++) {
      const drop = new THREE.Mesh(dropGeom, dropMat);
      drop.position.set(0, 0.2, 0);
      const angle = (i / DEATH_DROPLET_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.8 + Math.random() * 2.6;
      drop.userData.vx = Math.cos(angle) * speed;
      drop.userData.vz = Math.sin(angle) * speed;
      drop.userData.vy = 1.6 + Math.random() * 2.2;
      drop.userData.landed = false;
      this.group.add(drop);
      this.droplets.push(drop);
    }
  }

  _setupCamera() {
    this.frog.group.remove(this.camera);
    this.scene.add(this.camera);
    // YXZ rotation order is set by Input; lookAt overwrites it each frame so
    // the cached yaw/pitch from gameplay don't bleed in.
    this._positionCamera(0);
  }

  _positionCamera(t) {
    // Slight orbit + small dolly-in. Starts behind the impact (+Z), sweeps
    // toward +X side. Heightens the "circling the corpse" cinematic feel.
    const angle = this._baseAngle + t * DEATH_CAM_ORBIT;
    const radius = DEATH_CAM_RADIUS - t * 0.35;
    const cx = this.impactX + Math.sin(angle) * radius;
    const cz = this.impactZ + Math.cos(angle) * radius;
    const cy = DEATH_CAM_HEIGHT - t * 0.35;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.impactX, 0.15, this.impactZ);
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.duration, 1);

    // Body squash — eased over the first 0.12s, then held flat.
    const squashT = Math.min(this.elapsed / 0.12, 1);
    const ease = squashT * squashT;
    const yScale = 1 - ease * 0.94;
    const xzScale = 1 + ease * 0.7;
    this.body.scale.set(xzScale, yScale, xzScale);
    this.body.position.y = 0.15 * yScale;

    // Eyes — ballistic until ground, then friction-stop.
    for (const eye of this.eyes) {
      if (eye.userData.landed) continue;
      eye.position.x += eye.userData.vx * dt;
      eye.position.y += eye.userData.vy * dt;
      eye.position.z += eye.userData.vz * dt;
      eye.userData.vy -= GRAVITY * dt;
      if (eye.position.y <= 0.08) {
        eye.position.y = 0.08;
        eye.userData.vx *= 0.25;
        eye.userData.vz *= 0.25;
        eye.userData.vy = 0;
        eye.userData.landed = true;
      }
    }

    // Blood disk grows fast at first, then eases out.
    const diskT = Math.min(this.elapsed / 0.32, 1);
    const diskEase = 1 - Math.pow(1 - diskT, 2);
    this.disk.scale.setScalar(0.05 + diskEase * 0.95);

    // Droplets — same ballistic+freeze as eyes.
    for (const d of this.droplets) {
      if (d.userData.landed) continue;
      d.position.x += d.userData.vx * dt;
      d.position.y += d.userData.vy * dt;
      d.position.z += d.userData.vz * dt;
      d.userData.vy -= GRAVITY * dt;
      if (d.position.y <= 0.045) {
        d.position.y = 0.045;
        d.userData.landed = true;
      }
    }

    this._positionCamera(t);
    return t >= 1;
  }

  cleanup() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    this.scene.remove(this.camera);
    this.frog.group.add(this.camera);
    this.camera.position.set(0, CAMERA_EYE_HEIGHT, 0);
    this.camera.rotation.set(0, 0, 0);
  }
}
