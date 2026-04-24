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
  constructor(scene, camera, goalRow) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Camera is a child of the frog group — it follows the hop arc automatically.
    this.camera = camera;
    camera.position.set(0, CAMERA_EYE_HEIGHT, 0);
    this.group.add(camera);

    this.row = START_ROW;
    this.cellX = 0;
    this.goalRow = goalRow;
    this.state = 'IDLE';

    // Hop tween state.
    this._hopStart = new THREE.Vector3();
    this._hopEnd = new THREE.Vector3();
    this._hopElapsed = 0;
    this._deadElapsed = 0;
    this._bobElapsed = BOB_DURATION; // start "finished"

    // Optional callback fired each time a hop completes.
    this.onLand = null;

    this._applyGridPosition();
  }

  die() {
    if (this.state === 'DEAD') return;
    this.state = 'DEAD';
    this._deadElapsed = 0;
  }

  _respawn() {
    this.row = START_ROW;
    this.cellX = 0;
    this._applyGridPosition();
    this.state = 'IDLE';
  }

  // Reset to start without a death (e.g. after crossing).
  resetToStart() {
    this.row = START_ROW;
    this.cellX = 0;
    this._applyGridPosition();
    this.state = 'IDLE';
  }

  _applyGridPosition() {
    this.group.position.set(cellXToWorldX(this.cellX), 0, rowToZ(this.row));
  }

  // dRow: +1 forward (toward -Z / goal), -1 backward.
  // dCell: +1 right (+X), -1 left.
  tryHop(dRow, dCell) {
    if (this.state !== 'IDLE') return false;
    const newRow = this.row + dRow;
    const newCell = this.cellX + dCell;
    if (newRow < 0 || newRow > this.goalRow) return false;
    if (newCell < -STRAFE_MAX || newCell > STRAFE_MAX) return false;

    this._hopStart.set(cellXToWorldX(this.cellX), 0, rowToZ(this.row));
    this._hopEnd.set(cellXToWorldX(newCell), 0, rowToZ(newRow));
    this._hopElapsed = 0;
    this.row = newRow;
    this.cellX = newCell;
    this.state = 'HOPPING';
    return true;
  }

  update(dt) {
    if (this.state === 'HOPPING') {
      this._hopElapsed += dt;
      const t = Math.min(this._hopElapsed / HOP_DURATION, 1);
      const ease = easeInOutQuad(t);
      this.group.position.x = this._hopStart.x + (this._hopEnd.x - this._hopStart.x) * ease;
      this.group.position.z = this._hopStart.z + (this._hopEnd.z - this._hopStart.z) * ease;
      this.group.position.y = HOP_HEIGHT * Math.sin(Math.PI * t);
      if (t >= 1) {
        this.group.position.copy(this._hopEnd);
        this.state = 'IDLE';
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
