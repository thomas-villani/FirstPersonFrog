import { Vehicle, spawnXForDirection } from './vehicles.js';
import {
  VEHICLE_TYPES,
  MIN_SPAWN_SPACING,
  SUB_ROWS_PER_LANE,
  laneFirstRow,
} from './config.js';

// Owns every live vehicle on the road. One spawn timer per lane.
// Each spawn picks a random pair of wheel-row sub-rows within the lane (constrained by the
// vehicle type's wheelRowSpread), so vehicles in the same lane don't share wheel paths.
export class Spawner {
  constructor(scene, lanesConfig, audio = null) {
    this.scene = scene;
    this.lanesConfig = lanesConfig;
    this.audio = audio;
    this.waits = lanesConfig.map((l) => randomInRange(l.spawnInterval));
    this.vehicles = [];
    this.speedMultiplier = 1;
  }

  // Difficulty knob: spawn speeds are scaled by this on creation.
  setSpeedMultiplier(m) {
    this.speedMultiplier = m;
  }

  update(dt) {
    // Advance and cull.
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt);
      if (v.isOffRoad()) {
        if (this.audio) this.audio.detachEngine(v);
        v.dispose();
        this.vehicles.splice(i, 1);
      }
    }

    // Per-lane spawn timers.
    for (let li = 0; li < this.lanesConfig.length; li++) {
      this.waits[li] -= dt;
      if (this.waits[li] > 0) continue;
      const lane = this.lanesConfig[li];
      this._trySpawn(lane);
      this.waits[li] = randomInRange(lane.spawnInterval);
    }
  }

  _trySpawn(lane) {
    const typeName = pickWeighted(lane.mix);
    const type = VEHICLE_TYPES[typeName];
    const spawnX = spawnXForDirection(lane.direction);

    // Spacing guard: reject if a vehicle behind would clip the new spawn.
    const newLength = type.size.L;
    for (const v of this.vehicles) {
      if (v.lane.laneIndex !== lane.laneIndex || v.direction !== lane.direction) continue;
      const dist = (v.x - spawnX) * lane.direction;
      if (dist < 0) continue;
      const minRequired = (v.length + newLength) / 2 + MIN_SPAWN_SPACING;
      if (dist < minRequired) return; // skip this attempt, try again next cycle
    }

    // Pick a random valid pair of wheel-rows within the lane.
    // Wheels are forbidden from the lane's LAST sub-row — that row sits on the
    // between-lane white stripe, which is "safe" ground the frog can rest on.
    // So r2 = r1 + spread must satisfy r2 <= firstRow + SUB_ROWS_PER_LANE - 2
    // (i.e. second-to-last row), giving validPlacements = SUB_ROWS_PER_LANE - 1 - spread.
    const spread = type.wheelRowSpread;
    const validPlacements = SUB_ROWS_PER_LANE - 1 - spread;
    if (validPlacements < 1) return; // type wider than the lane — config error, skip
    const firstRow = laneFirstRow(lane.laneIndex);
    const r1 = firstRow + Math.floor(Math.random() * validPlacements);
    const wheelRows = [r1, r1 + spread];

    const vehicle = new Vehicle(this.scene, typeName, lane, spawnX, wheelRows);
    vehicle.speed = randomInRange(lane.speedRange) * this.speedMultiplier;
    this.vehicles.push(vehicle);
    if (this.audio) this.audio.attachEngine(vehicle);
  }

  disposeAll() {
    for (const v of this.vehicles) {
      if (this.audio) this.audio.detachEngine(v);
      v.dispose();
    }
    this.vehicles.length = 0;
  }
}

function randomInRange([lo, hi]) {
  return lo + Math.random() * (hi - lo);
}

function pickWeighted(mix) {
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of mix) {
    r -= w;
    if (r <= 0) return name;
  }
  return mix[mix.length - 1][0];
}
