import * as THREE from 'three';
import {
  VEHICLE_TYPES,
  ROAD_LENGTH,
  SPAWN_MARGIN,
  DESPAWN_MARGIN,
  rowToZ,
} from './config.js';

const WHEEL_COLOR = 0x111111;

// One live vehicle on the road. Owns a Group holding the body box + 4 wheel cylinders.
// Vehicle z is determined by the two `wheelRows` it spawned with — those two sub-rows
// are the wheel-path lines. Each wheel is a discrete AABB in world coords; the strip
// of body BETWEEN the front and rear axle is safe space the frog can survive in.
export class Vehicle {
  constructor(scene, typeName, lane, x, wheelRows) {
    this.typeName = typeName;
    this.type = VEHICLE_TYPES[typeName];
    this.lane = lane;
    this.direction = lane.direction;
    this.speed = 0; // set by spawner after construction
    this.x = x;
    this.length = this.type.size.L;
    this.width = this.type.size.W;
    this.height = this.type.size.H;

    this.wheelRows = wheelRows;
    this.z = (rowToZ(wheelRows[0]) + rowToZ(wheelRows[1])) / 2;

    // Wheel positions in vehicle-local space. Two axles (front/rear in X) × two wheel-rows in Z.
    const wheelZsLocal = wheelRows.map((r) => rowToZ(r) - this.z);
    const wheelInset = this.type.wheelRadius * 2;
    const wheelXs = [this.length / 2 - wheelInset, -this.length / 2 + wheelInset];
    this.wheels = [];
    for (const wx of wheelXs) {
      for (const wz of wheelZsLocal) {
        this.wheels.push({ localX: wx, localZ: wz });
      }
    }

    this.group = buildMesh(this.type, wheelZsLocal, this.wheels);
    this.group.position.set(this.x, 0, this.z);
    scene.add(this.group);
    this._scene = scene;
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

function buildMesh(type, wheelZsLocal, wheels) {
  const group = new THREE.Group();
  const { L, H } = type.size;
  const wheelY = type.wheelRadius;
  const bodyY = wheelY + H / 2;

  // Body width = the wheel-track (so wheels sit flush with body edges).
  const bodyW = Math.abs(wheelZsLocal[1] - wheelZsLocal[0]);
  const bodyGeom = new THREE.BoxGeometry(L, H, bodyW);
  const bodyMat = new THREE.MeshLambertMaterial({ color: type.color });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.set(0, bodyY, 0);
  group.add(body);

  // Wheel meshes — match the local positions used for collision.
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
