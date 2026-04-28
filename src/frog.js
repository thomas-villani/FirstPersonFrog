import * as THREE from 'three';
import {
  HOP_DURATION,
  HOP_HEIGHT,
  CAMERA_EYE_HEIGHT,
  HEAD_BOB_AMPLITUDE,
  HEAD_BOB_DECAY_MS,
  STRAFE_MAX,
  START_ROW,
  rowToZ,
  cellXToWorldX,
} from './config.js';

const DEATH_DURATION = 0.5;
const BOB_DURATION = HEAD_BOB_DECAY_MS / 1000;

// State machine: IDLE | HOPPING | DEAD.
// Hard-commit: inputs are only accepted when state === IDLE. Mid-hop presses are dropped.
export class Frog {
  constructor(scene, camera, goalRow, skills = null) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Camera is a child of the frog group — it follows the hop arc automatically.
    this.camera = camera;
    camera.position.set(0, CAMERA_EYE_HEIGHT, 0);
    this.group.add(camera);

    this.row = START_ROW;
    this.prevRow = START_ROW;
    this.cellX = 0;
    this.goalRow = goalRow;
    this.state = 'IDLE';
    this.skills = skills;

    // Hop tween state. _hopDuration is recomputed at each tryHop start so the
    // Hip Hopping speed-bump tier scales the tween without caching stale values.
    this._hopStart = new THREE.Vector3();
    this._hopEnd = new THREE.Vector3();
    this._hopElapsed = 0;
    this._hopDuration = HOP_DURATION;
    this._hopArcMultiplier = 1; // sqrt(longjump multiplier) — taller arc on longer hops
    this._deadElapsed = 0;
    this._bobElapsed = BOB_DURATION; // start "finished"

    // Optional callback fired each time a hop completes.
    this.onLand = null;
    // Optional predicate: if set, returning true rejects a hop into that cell.
    // Used for blocking road obstacles (soda cans etc).
    this.isBlocked = null;
    // Optional callback fired when an attempted hop is rejected because the
    // target cell is blocked OR clamped to the same cell at a playfield edge.
    // Fires only from IDLE — mid-hop input is silently dropped (hard-commit).
    this.onBlocked = null;

    this._applyGridPosition();
  }

  die() {
    if (this.state === 'DEAD') return;
    this.state = 'DEAD';
    this._deadElapsed = 0;
  }

  _respawn() {
    this.row = START_ROW;
    this.prevRow = START_ROW;
    this.cellX = 0;
    this._applyGridPosition();
    this.state = 'IDLE';
  }

  // Reset to start without a death (e.g. after crossing).
  resetToStart() {
    this.row = START_ROW;
    this.prevRow = START_ROW;
    this.cellX = 0;
    this._applyGridPosition();
    this.state = 'IDLE';
  }

  // Snap to the current row/cellX without changing them. Used when a hop is
  // interrupted by Recombobulation: row/cellX were committed at hop start, but
  // group.position is partway through the arc. Force IDLE + snap to grid so
  // the camera reattaches at the right height.
  resumeAtRest() {
    this._applyGridPosition();
    this.state = 'IDLE';
    this._hopElapsed = 0;
    this._hopArcMultiplier = 1;
    this._bobElapsed = BOB_DURATION; // skip the landing bob
  }

  _applyGridPosition() {
    this.group.position.set(cellXToWorldX(this.cellX), 0, rowToZ(this.row));
  }

  // dRow: +1 forward (toward -Z / goal), -1 backward.
  // dCell: +1 right (+X), -1 left.
  // multiplier: Long Jump tier multiplier (default 1). Multiplies the dRow/dCell
  //   step. Long hops CLAMP to playfield edges (so a partial long-hop lands at
  //   the boundary instead of being rejected). The hop arc height scales with
  //   sqrt(multiplier) so 2× distance feels noticeably bouncier without going
  //   over the vehicle-clearance ceiling at the regular tier.
  tryHop(dRow, dCell, multiplier = 1) {
    if (this.state !== 'IDLE') return false;
    let newRow = this.row + dRow * multiplier;
    let newCell = this.cellX + dCell * multiplier;
    // Clamp instead of reject. Equivalent to the old reject behavior at single-
    // step hops (clamp + same-cell check still returns false), but lets long
    // jumps land at the edge instead of failing entirely.
    if (newRow < 0) newRow = 0;
    if (newRow > this.goalRow) newRow = this.goalRow;
    if (newCell < -STRAFE_MAX) newCell = -STRAFE_MAX;
    if (newCell > STRAFE_MAX) newCell = STRAFE_MAX;
    if (newRow === this.row && newCell === this.cellX) {
      if (this.onBlocked) this.onBlocked();
      return false;
    }
    if (this.isBlocked && this.isBlocked(newRow, newCell)) {
      if (this.onBlocked) this.onBlocked();
      return false;
    }

    this._hopStart.set(cellXToWorldX(this.cellX), 0, rowToZ(this.row));
    this._hopEnd.set(cellXToWorldX(newCell), 0, rowToZ(newRow));
    this._hopElapsed = 0;
    const durMult = this.skills?.hopDurationMult?.() ?? 1;
    this._hopDuration = HOP_DURATION * durMult;
    this._hopArcMultiplier = multiplier > 1 ? Math.sqrt(multiplier) : 1;
    this.prevRow = this.row;
    this.row = newRow;
    this.cellX = newCell;
    this.state = 'HOPPING';
    return true;
  }

  update(dt) {
    if (this.state === 'HOPPING') {
      this._hopElapsed += dt;
      const t = Math.min(this._hopElapsed / this._hopDuration, 1);
      const ease = easeInOutQuad(t);
      this.group.position.x = this._hopStart.x + (this._hopEnd.x - this._hopStart.x) * ease;
      this.group.position.z = this._hopStart.z + (this._hopEnd.z - this._hopStart.z) * ease;
      this.group.position.y = HOP_HEIGHT * this._hopArcMultiplier * Math.sin(Math.PI * t);
      if (t >= 1) {
        this.group.position.copy(this._hopEnd);
        this.state = 'IDLE';
        this._hopArcMultiplier = 1;
        this._bobElapsed = 0;
        if (this.onLand) this.onLand();
      }
    } else if (this.state === 'DEAD') {
      this._deadElapsed += dt;
      if (this._deadElapsed >= DEATH_DURATION) this._respawn();
    }

    this._updateHeadBob(dt);
  }

  _updateHeadBob(dt) {
    this._bobElapsed += dt;
    let bob = 0;
    if (this._bobElapsed < BOB_DURATION) {
      const t = this._bobElapsed / BOB_DURATION;
      // Damped quick dip: head drops on landing, springs back.
      bob = -HEAD_BOB_AMPLITUDE * Math.exp(-t * 5) * Math.cos(t * Math.PI * 2.2);
    }
    this.camera.position.y = CAMERA_EYE_HEIGHT + bob;
  }
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
