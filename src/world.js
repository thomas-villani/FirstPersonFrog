import * as THREE from 'three';
import {
  LANE_WIDTH,
  ROAD_LENGTH,
  ROAD_COLOR,
  GRASS_COLOR,
  STRIPE_COLOR,
  STRIPE_WIDTH_OUTER,
  STRIPE_WIDTH_DIVIDER,
  SKY_COLOR,
  FOG_START,
  FOG_END,
} from './config.js';

// Builds the static scene for a given lane count.
//   - Start median: world Z from 0 to +2*LANE_WIDTH (BEHIND the frog at row 0).
//   - Road: world Z from 0 to -laneCount * LANE_WIDTH.
//   - Goal median: from the road's far edge onward.
// Stripes between lanes are widened (`STRIPE_WIDTH_DIVIDER`) so the safe-rest stripe is
// visually distinct from a 5cm POV.
export function buildWorld(laneCount) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, FOG_START, FOG_END);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  const roadZNear = 0;
  const roadZFar = -laneCount * LANE_WIDTH;
  const roadDepth = roadZNear - roadZFar;
  const roadZCenter = (roadZNear + roadZFar) / 2;

  const startMedianDepth = LANE_WIDTH * 2;
  const startMedianZCenter = roadZNear + startMedianDepth / 2;
  const goalMedianDepth = LANE_WIDTH * 2;
  const goalMedianZCenter = roadZFar - goalMedianDepth / 2;

  scene.add(makeGround(ROAD_LENGTH, startMedianDepth, GRASS_COLOR, 0, startMedianZCenter));
  scene.add(makeGround(ROAD_LENGTH, roadDepth, ROAD_COLOR, 0, roadZCenter));
  scene.add(makeGround(ROAD_LENGTH, goalMedianDepth, GRASS_COLOR, 0, goalMedianZCenter));

  const stripeY = 0.01;
  // Outer road edges (decorative).
  scene.add(makeStripe(ROAD_LENGTH, STRIPE_WIDTH_OUTER, stripeY, roadZNear));
  scene.add(makeStripe(ROAD_LENGTH, STRIPE_WIDTH_OUTER, stripeY, roadZFar));
  // Between-lane safe stripes.
  for (let L = 1; L < laneCount; L++) {
    scene.add(makeStripe(ROAD_LENGTH, STRIPE_WIDTH_DIVIDER, stripeY, -L * LANE_WIDTH));
  }

  return scene;
}

// Frees GPU resources held by every mesh in a scene. Call before discarding a scene.
export function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}

function makeGround(sizeX, sizeZ, color, x, z) {
  const geom = new THREE.PlaneGeometry(sizeX, sizeZ);
  const mat = new THREE.MeshLambertMaterial({ color });
  mat.fog = true;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0, z);
  return mesh;
}

function makeStripe(sizeX, sizeZ, y, z) {
  const geom = new THREE.PlaneGeometry(sizeX, sizeZ);
  const mat = new THREE.MeshBasicMaterial({ color: STRIPE_COLOR });
  mat.fog = true;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y, z);
  return mesh;
}
