import { Vehicle, spawnXForDirection } from './vehicles.js';
import { VEHICLE_TYPES, MIN_SPAWN_SPACING } from './config.js';

// Owns every live vehicle on the road. One spawn timer per lane.
export class Spawner {
  constructor(scene, lanesConfig, audio = null) {
    this.scene = scene;
    this.lanesConfig = lanesConfig;
    this.audio = audio;
    this.waits = lanesConfig.map((l) => randomInRange(l.spawnInterval));
    this.vehicles = [];
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

    // Spacing guard: reject if the new spawn would overlap (or be too close to)
    // a vehicle already on the road in this lane.
    const newLength = type.size.L;
    for (const v of this.vehicles) {
      if (v.row !== lane.row || v.direction !== lane.direction) continue;
      const dist = (v.x - spawnX) * lane.direction;
      if (dist < 0) continue;
      const minRequired = (v.length + newLength) / 2 + MIN_SPAWN_SPACING;
      if (dist < minRequired) return; // skip this attempt, try again next cycle
    }

    const vehicle = new Vehicle(this.scene, typeName, lane, spawnX);
    vehicle.speed = randomInRange(lane.speedRange);
    this.vehicles.push(vehicle);
    if (this.audio) this.audio.attachEngine(vehicle);
  }

  disposeAll() {
    for (const v of this.vehicles) v.dispose();
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
