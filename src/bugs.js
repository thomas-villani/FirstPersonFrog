import * as THREE from 'three';
import {
  BUGS_PER_LEVEL,
  BUG_RISK_WEIGHT,
  STRAFE_MAX,
  SUB_ROWS_PER_LANE,
  laneFirstRow,
  laneCountForLevel,
  rowToZ,
  cellXToWorldX,
} from './config.js';

// Shared bug geometry + materials. Cheap because every bug looks the same and
// disposal is cheap (we only remove the Group from the scene). Lambert materials
// pick up the world's directional light, so the amber body reads warm against
// the cool grey asphalt.
//
// Body is a flattened sphere ellipsoid — the previous BoxGeometry read as a
// cardboard box. Scaling a unit sphere with non-uniform scale gives a beetle-y
// rounded carapace shape without the per-bug allocation cost of a custom geom.
const BUG_BODY_GEOM = new THREE.SphereGeometry(0.06, 14, 9);
const BUG_BODY_MAT = new THREE.MeshLambertMaterial({
  color: 0xe8a838,
  emissive: 0x402008,
});
const BUG_HEAD_GEOM = new THREE.SphereGeometry(0.038, 8, 6);
const BUG_HEAD_MAT = new THREE.MeshLambertMaterial({ color: 0x3a2210 });
const BUG_EYE_GEOM = new THREE.SphereGeometry(0.013, 6, 5);
const BUG_EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x080808 });
// Legs as thin tapered cylinders (along Y in geometry — rotated to point sideways).
// Translate so y in [0, length], anchored at body side.
const BUG_LEG_GEOM = new THREE.CylinderGeometry(0.008, 0.006, 0.058, 6);
BUG_LEG_GEOM.translate(0, 0.029, 0);
const BUG_LEG_MAT = new THREE.MeshLambertMaterial({ color: 0x180a02 });
const BUG_ANT_GEOM = new THREE.CylinderGeometry(0.0045, 0.003, 0.062, 5);

const BUG_BODY_Y = 0.05;
const BUG_ROT_SPEED = 0.6; // radians/sec — slow Y spin keeps the bug visible from 5cm POV

class Bug {
  constructor(scene, row, cellX) {
    this.row = row;
    this.cellX = cellX;
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.position.set(cellXToWorldX(cellX), 0, rowToZ(row));
    this.group.rotation.y = Math.random() * Math.PI * 2;

    // Amber rounded body — flattened sphere reads as a beetle carapace, not a
    // cardboard box. Scale gives an ellipsoid wider in X/Z than in Y.
    const body = new THREE.Mesh(BUG_BODY_GEOM, BUG_BODY_MAT);
    body.position.y = BUG_BODY_Y;
    body.scale.set(1.5, 0.6, 1.3);
    this.group.add(body);

    // Head — small dark sphere just forward of the body.
    const head = new THREE.Mesh(BUG_HEAD_GEOM, BUG_HEAD_MAT);
    head.position.set(0, BUG_BODY_Y + 0.003, 0.082);
    this.group.add(head);

    // Two tiny eye dots on the head — sells the "creature" read at close range.
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(BUG_EYE_GEOM, BUG_EYE_MAT);
      eye.position.set(sx * 0.018, BUG_BODY_Y + 0.018, 0.108);
      this.group.add(eye);
    }

    // 6 legs (3 per side). Cylinders rotated so they angle outward and
    // slightly downward — leg geometry's +Y axis becomes outward-and-down.
    for (const side of [-1, 1]) {
      for (const dz of [-0.05, 0, 0.05]) {
        const leg = new THREE.Mesh(BUG_LEG_GEOM, BUG_LEG_MAT);
        leg.position.set(side * 0.07, 0.035, dz);
        // -side * (π/2 + 0.25): for right side (+1), rotates +Y down toward
        // +X with a slight downward tilt; mirrored for left side.
        leg.rotation.z = -side * (Math.PI / 2 + 0.25);
        this.group.add(leg);
      }
    }

    // Two short antennae angling forward-and-up off the head.
    for (const sx of [-1, 1]) {
      const ant = new THREE.Mesh(BUG_ANT_GEOM, BUG_LEG_MAT);
      ant.position.set(sx * 0.014, BUG_BODY_Y + 0.04, 0.105);
      ant.rotation.x = -0.6;
      ant.rotation.z = sx * 0.25;
      this.group.add(ant);
    }

    scene.add(this.group);
  }

  update(dt) {
    this.group.rotation.y += BUG_ROT_SPEED * dt;
  }

  worldPos() {
    return this.group.position;
  }

  dispose() {
    this.scene.remove(this.group);
    // Geometries + materials are module-level shared; do NOT dispose them here.
  }
}

// Owns every live bug for the current level. Placement runs once per level
// rebuild and stays fixed for that level instance. Collection paths:
//   - mercy auto-collect on `frog.onLand` if the frog lands exactly on a bug's cell
//   - tongue capsule hit-test from the camera (active, Spacebar)
// Both fire `score.addBugPickup()` upstream — BugManager just removes the bug
// and returns it, leaving scoring/audio to the caller.
export class BugManager {
  constructor() {
    this.bugs = [];
  }

  // Risk-weighted random placement. ~70% on a wheel-path sub-row of a random lane
  // (deadly territory), ~30% on the lane's safe stripe (last sub-row). Ensures no
  // duplicate (row, cellX) cells. `excludeCells` is an optional list of
  // {row, cellX} occupied by blocking obstacles — bugs avoid those.
  placeBugsForLevel(level, scene, excludeCells = null) {
    this.disposeAll();

    const laneCount = laneCountForLevel(level);
    if (laneCount <= 0) return;
    const used = new Set();
    if (excludeCells) {
      for (const c of excludeCells) used.add(`${c.row}:${c.cellX}`);
    }
    let attempts = 0;
    const maxAttempts = BUGS_PER_LEVEL * 12; // failsafe against unlucky cell collisions
    while (this.bugs.length < BUGS_PER_LEVEL && attempts < maxAttempts) {
      attempts++;
      const lane = Math.floor(Math.random() * laneCount);
      const first = laneFirstRow(lane);
      let row;
      if (Math.random() < BUG_RISK_WEIGHT) {
        // Wheel-path row: any sub-row in the lane EXCEPT its last (safe stripe).
        const offset = Math.floor(Math.random() * (SUB_ROWS_PER_LANE - 1));
        row = first + offset;
      } else {
        // Safe stripe: lane's last sub-row.
        row = first + SUB_ROWS_PER_LANE - 1;
      }
      const cellX = randInt(-STRAFE_MAX, STRAFE_MAX);
      const key = `${row}:${cellX}`;
      if (used.has(key)) continue;
      used.add(key);
      this.bugs.push(new Bug(scene, row, cellX));
    }
  }

  update(dt) {
    for (const b of this.bugs) b.update(dt);
  }

  // Mercy auto-collect: if a bug exists at the frog's exact (row, cellX), remove
  // and return it. Catches the under-foot case so the player isn't stuck on a
  // bug they can't tongue from above.
  tryCollectAt(row, cellX) {
    for (let i = 0; i < this.bugs.length; i++) {
      const b = this.bugs[i];
      if (b.row === row && b.cellX === cellX) {
        const bug = this.bugs.splice(i, 1)[0];
        bug.dispose();
        return bug;
      }
    }
    return null;
  }

  // Capsule hit-test for the tongue. `origin` and `dir` are world-space vectors;
  // dir must be unit-length (yaw-projected forward). Returns the closest bug
  // within the capsule (segment of length `length`, radius `radius`), or null.
  // Bugs are treated as points at their group origin — small enough relative to
  // the 0.5m capsule radius that a point check is fine.
  tryCollectInCapsule(origin, dir, length, radius) {
    let bestT = Infinity;
    let bestIdx = -1;
    const r2 = radius * radius;
    for (let i = 0; i < this.bugs.length; i++) {
      const p = this.bugs[i].worldPos();
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      const dz = p.z - origin.z;
      // Project bug onto the capsule axis.
      let t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0 || t > length) continue;
      // Perpendicular distance squared.
      const px = dx - dir.x * t;
      const py = dy - dir.y * t;
      const pz = dz - dir.z * t;
      const d2 = px * px + py * py + pz * pz;
      if (d2 > r2) continue;
      if (t < bestT) {
        bestT = t;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const bug = this.bugs.splice(bestIdx, 1)[0];
      bug.dispose();
      return bug;
    }
    return null;
  }

  disposeAll() {
    for (const b of this.bugs) b.dispose();
    this.bugs.length = 0;
  }
}

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
