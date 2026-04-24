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
// Position along the lane tracked as scalar `x`; world transform applied each frame.
export class Vehicle {
  constructor(scene, typeName, laneConfig, x) {
    this.typeName = typeName;
    this.type = VEHICLE_TYPES[typeName];
    this.row = laneConfig.row;
    this.direction = laneConfig.direction;
    this.speed = 0; // set by spawner after construction
    this.x = x;
    this.length = this.type.size.L;
    this.width = this.type.size.W;
    this.height = this.type.size.H;

    this.group = buildMesh(this.type);
    this.group.position.set(this.x, 0, rowToZ(this.row));
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

function buildMesh(type) {
  const group = new THREE.Group();
  const { L, W, H } = type.size;
  const wheelY = type.wheelRadius;
  const bodyY = wheelY + H / 2;

  // Body.
  const bodyGeom = new THREE.BoxGeometry(L, H, W);
  const bodyMat = new THREE.MeshLambertMaterial({ color: type.color });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.set(0, bodyY, 0);
  group.add(body);

  // Wheels.
  const wheelGeom = new THREE.CylinderGeometry(
    type.wheelRadius,
    type.wheelRadius,
    type.wheelWidth,
    10
  );
  const wheelMat = new THREE.MeshLambertMaterial({ color: WHEEL_COLOR });
  const wheelInset = type.wheelRadius * 2;
  const wheelXs = [L / 2 - wheelInset, -L / 2 + wheelInset];
  const wheelZs = [W / 2, -W / 2];
  for (const wx of wheelXs) {
    for (const wz of wheelZs) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.rotation.x = Math.PI / 2; // axle along Z
      wheel.position.set(wx, wheelY, wz);
      group.add(wheel);
    }
  }

  return group;
}
