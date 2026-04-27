import * as THREE from 'three';
import {
  VEHICLE_TYPES,
  ROAD_LENGTH,
  SPAWN_MARGIN,
  DESPAWN_MARGIN,
  rowToZ,
} from './config.js';

const WHEEL_COLOR = 0x111111;

// One live vehicle on the road. Owns a Group holding the body box(es) + wheel cylinders.
// Vehicle z is determined by the two `wheelRows` it spawned with — those two sub-rows
// are the wheel-path lines. Each wheel is a discrete AABB in world coords; the strip
// of body BETWEEN the front and rear axle is safe space the frog can survive in.
//
// Generalized model:
//   - `axleXs` (optional) declares N axle local-X positions (default: 2 axles inset
//     from the body ends by 2*wheelRadius). doubleTrailer uses 8.
//   - `singleTrack` (optional) collapses both wheel-rows to one wheel per axle,
//     centered between the two row lines. motorcycle uses this.
//   - `bodyParts` (optional) stacks multiple body boxes along X with declared gaps,
//     so a road-train can show a cab + 2 trailers as separate boxes.
export class Vehicle {
  constructor(scene, typeName, lane, x, wheelRows) {
    this.typeName = typeName;
    this.type = VEHICLE_TYPES[typeName];
    this.lane = lane;
    this.direction = lane.direction;
    this.desiredSpeed = 0; // cruise speed; set by spawner. Vehicle.speed is clamped down
    this.speed = 0;        // by Spawner each frame when following a slower leader.
    this.x = x;
    this.length = this.type.size.L;
    this.height = this.type.size.H;

    this.wheelRows = wheelRows;
    this.z = (rowToZ(wheelRows[0]) + rowToZ(wheelRows[1])) / 2;

    const singleTrack = !!this.type.singleTrack;
    // Wheel-row Z offsets in vehicle-local space.
    const wheelZsLocal = singleTrack
      ? [0]
      : [rowToZ(wheelRows[0]) - this.z, rowToZ(wheelRows[1]) - this.z];

    // Axle X positions. Default: 2 axles inset from L/2 by 2*wheelRadius.
    const wheelInset = this.type.wheelRadius * 2;
    const axleXs = this.type.axleXs ?? [
      this.length / 2 - wheelInset,
      -this.length / 2 + wheelInset,
    ];

    // Visual body Z-width. Defaults to wheel-track (matches old sedan/truck behavior).
    const wheelTrack = singleTrack
      ? 0
      : Math.abs(wheelZsLocal[1] - wheelZsLocal[0]);
    this.width = this.type.bodyWidth ?? (wheelTrack > 0 ? wheelTrack : this.type.size.W);

    // Wheel positions in vehicle-local space.
    this.wheels = [];
    for (const ax of axleXs) {
      for (const wz of wheelZsLocal) {
        this.wheels.push({ localX: ax, localZ: wz });
      }
    }

    // Threaded near-miss check uses the half-width of the actual wheelbase, not
    // the body length. With 8 axles spread across the road-train, this is what
    // we want (the frog must be between the FIRST and LAST axle).
    let minAx = axleXs[0], maxAx = axleXs[0];
    for (let i = 1; i < axleXs.length; i++) {
      if (axleXs[i] < minAx) minAx = axleXs[i];
      if (axleXs[i] > maxAx) maxAx = axleXs[i];
    }
    this.wheelbaseHalfL = (maxAx - minAx) / 2;

    this.group = buildMesh(this.type, this.width, this.wheels);
    this.group.position.set(this.x, 0, this.z);
    scene.add(this.group);
    this._scene = scene;

    // Near-miss substate (read/written by collision.detectNearMisses).
    //   tier:               highest base tier seen during current approach
    //                       (UNDER | GRAZED | null)
    //   lastSign:           previous frame's approachingSign — used to detect
    //                       approach→pass transition and fire one event per pass.
    //   threadedHopArmed:   the frog made a hop spanning one of this vehicle's
    //                       wheel-row Z lines during the current approach.
    //                       Set without an X-overlap gate so entry hops count.
    //   threadedHop:        armed AND the wheelbase later overlapped the frog
    //                       in X. Fires THREADED instead of the base tier.
    // All four reset on the firing frame so the next approach starts fresh.
    this.nearMiss = {
      tier: null,
      lastSign: 0,
      threadedHopArmed: false,
      threadedHop: false,
    };
  }

  update(dt) {
    this.x += this.speed * this.direction * dt;
    this.group.position.x = this.x;
  }

  isOffRoad() {
    const half = ROAD_LENGTH / 2;
    return (
      this.x > half + DESPAWN_MARGIN ||
      this.x < -half - DESPAWN_MARGIN
    );
  }

  dispose() {
    this._scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}

// Utility: off-road spawn X for a lane in the given direction.
export function spawnXForDirection(direction) {
  const half = ROAD_LENGTH / 2;
  return direction > 0 ? -(half + SPAWN_MARGIN) : half + SPAWN_MARGIN;
}

function buildMesh(type, bodyWidth, wheels) {
  const group = new THREE.Group();
  const wheelY = type.wheelRadius;

  // Body: either multi-section (bodyParts) or a single box.
  if (type.bodyParts && type.bodyParts.length > 0) {
    let cursor = type.size.L / 2;
    for (let i = 0; i < type.bodyParts.length; i++) {
      const part = type.bodyParts[i];
      if (i > 0) cursor -= part.gap ?? 0;
      const centerX = cursor - part.length / 2;
      cursor -= part.length;
      const partH = part.height ?? type.size.H;
      const geom = new THREE.BoxGeometry(part.length, partH, bodyWidth);
      const mat = new THREE.MeshLambertMaterial({ color: part.color ?? type.color });
      const box = new THREE.Mesh(geom, mat);
      box.position.set(centerX, wheelY + partH / 2, 0);
      group.add(box);
    }
  } else {
    const geom = new THREE.BoxGeometry(type.size.L, type.size.H, bodyWidth);
    const mat = new THREE.MeshLambertMaterial({ color: type.color });
    const body = new THREE.Mesh(geom, mat);
    body.position.set(0, wheelY + type.size.H / 2, 0);
    group.add(body);
  }

  // Wheels — match the local positions used for collision.
  const wheelGeom = new THREE.CylinderGeometry(
    type.wheelRadius,
    type.wheelRadius,
    type.wheelWidth,
    10
  );
  const wheelMat = new THREE.MeshLambertMaterial({ color: WHEEL_COLOR });
  for (const w of wheels) {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.rotation.x = Math.PI / 2; // axle along Z
    wheel.position.set(w.localX, wheelY, w.localZ);
    group.add(wheel);
  }

  return group;
}
