import { Vehicle, spawnXForDirection } from './vehicles.js';
import {
  VEHICLE_TYPES,
  MIN_SPAWN_SPACING,
  SUB_ROWS_PER_LANE,
  ROAD_LENGTH,
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

  setSpeedMultiplier(m) {
    this.speedMultiplier = m;
  }

  // Seed the road with `perLane` vehicles already in motion across each lane.
  // Higher levels call this so the player isn't gifted a free 10-second head start
  // while the first off-screen-spawned vehicle drives on. Vehicles are jittered
  // around evenly-spaced X positions and rejected on spacing collision (which is
  // unlikely with the spread we pick).
  prePopulate(perLane) {
    if (perLane <= 0) return;
    const half = ROAD_LENGTH / 2;
    const span = 2 * half;
    for (const lane of this.lanesConfig) {
      const segWidth = span / (perLane + 1);
      for (let k = 0; k < perLane; k++) {
        const baseX = -half + (k + 1) * segWidth;
        const jitter = (Math.random() - 0.5) * segWidth * 0.6;
        this._trySpawn(lane, baseX + jitter);
      }
    }
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

  // Spawns one vehicle in `lane` at world X. Defaults to the off-screen spawn edge,
  // but pre-population passes mid-road X values to seed traffic.
  _trySpawn(lane, spawnX = spawnXForDirection(lane.direction)) {
    const typeName = pickWeighted(lane.mix);
    const type = VEHICLE_TYPES[typeName];

    // Spacing guard against any other vehicle in this lane (regardless of direction
    // of approach — pre-populated vehicles can be on either side).
    const newLength = type.size.L;
    for (const v of this.vehicles) {
      if (v.lane.laneIndex !== lane.laneIndex || v.direction !== lane.direction) continue;
      const minRequired = (v.length + newLength) / 2 + MIN_SPAWN_SPACING;
      if (Math.abs(v.x - spawnX) < minRequired) return;
    }

    // Wheels are forbidden from the lane's LAST sub-row — that row sits on the
    // between-lane white stripe, which is "safe" ground the frog can rest on.
    const spread = type.wheelRowSpread;
    const validPlacements = SUB_ROWS_PER_LANE - 1 - spread;
    if (validPlacements < 1) return;
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
