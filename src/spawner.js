import { Vehicle, spawnXForDirection } from './vehicles.js';
import {
  VEHICLE_TYPES,
  MIN_SPAWN_SPACING,
  SUB_ROWS_PER_LANE,
  ROAD_LENGTH,
  FOLLOW_GAP,
  MIN_GAP,
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
  // unlikely with the spread we pick). Speeds are independent random picks — the
  // car-following pass in `update` keeps faster vehicles from overlapping slower
  // ones in the same lane.
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
    // Car-following: set each vehicle's speed for this frame based on its leader.
    // Then advance and cull. Then enforce a hard min-gap as a safety against any
    // residual encroachment when speeds change abruptly.
    this._resolveFollowing();

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt);
      if (v.isOffRoad()) {
        if (this.audio) this.audio.detachEngine(v);
        v.dispose();
        this.vehicles.splice(i, 1);
      }
    }

    this._enforceMinGap();

    // Per-lane spawn timers.
    for (let li = 0; li < this.lanesConfig.length; li++) {
      this.waits[li] -= dt;
      if (this.waits[li] > 0) continue;
      const lane = this.lanesConfig[li];
      this._trySpawn(lane);
      this.waits[li] = randomInRange(lane.spawnInterval);
    }
  }

  // Group vehicles by lane+direction, sort leader-first along travel, and let each
  // follower match the leader's speed when within FOLLOW_GAP. Leaders cruise at
  // their desiredSpeed.
  _resolveFollowing() {
    const groups = this._groupByLaneDir();
    for (const arr of groups.values()) {
      const dir = arr[0].direction;
      arr.sort((a, b) => (dir > 0 ? b.x - a.x : a.x - b.x));
      arr[0].speed = arr[0].desiredSpeed;
      for (let i = 1; i < arr.length; i++) {
        const leader = arr[i - 1];
        const me = arr[i];
        const gap = bumperGap(leader, me, dir);
        me.speed = gap < FOLLOW_GAP
          ? Math.min(me.desiredSpeed, leader.speed)
          : me.desiredSpeed;
      }
    }
  }

  // Safety net: if any follower's gap dropped below MIN_GAP after the move (e.g.,
  // a cascading slowdown didn't propagate fast enough), push it back to the floor.
  _enforceMinGap() {
    const groups = this._groupByLaneDir();
    for (const arr of groups.values()) {
      const dir = arr[0].direction;
      arr.sort((a, b) => (dir > 0 ? b.x - a.x : a.x - b.x));
      for (let i = 1; i < arr.length; i++) {
        const leader = arr[i - 1];
        const me = arr[i];
        const gap = bumperGap(leader, me, dir);
        if (gap < MIN_GAP) {
          me.x -= dir * (MIN_GAP - gap);
          me.group.position.x = me.x;
        }
      }
    }
  }

  _groupByLaneDir() {
    const groups = new Map();
    for (const v of this.vehicles) {
      const key = `${v.lane.laneIndex}:${v.direction}`;
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(v);
    }
    return groups;
  }

  // Spawns one vehicle in `lane` at world X. Defaults to the off-screen spawn edge,
  // but pre-population passes mid-road X values to seed traffic.
  //
  // Speed is an independent random pick from lane.speedRange — fast vehicles CAN
  // spawn behind slow ones. The runtime car-following pass (see _resolveFollowing)
  // makes the catcher match the leader's speed as the gap closes, so they never
  // visually overlap.
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

    const speed = randomInRange(lane.speedRange) * this.speedMultiplier;

    const vehicle = new Vehicle(this.scene, typeName, lane, spawnX, wheelRows);
    vehicle.desiredSpeed = speed;
    vehicle.speed = speed;
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

// Bumper-to-bumper distance from leader's rear to follower's front along travel direction.
// Negative if they overlap.
function bumperGap(leader, follower, dir) {
  const leaderRear = leader.x - dir * leader.length / 2;
  const followerFront = follower.x + dir * follower.length / 2;
  return dir > 0 ? leaderRear - followerFront : followerFront - leaderRear;
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
