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
  CELL_WIDTH,
  STRAFE_MAX,
  FAR_GRASS_DEPTH,
  FAR_GRASS_WIDTH,
  POND_COLOR,
  POND_RADIUS_X,
  POND_RADIUS_Z,
  POND_Z_OFFSET,
  TREE_TRUNK_COLOR,
  TREE_FOLIAGE_COLOR,
  TREE_COUNT_PER_SIDE,
  PEBBLE_COLOR,
  PEBBLE_SIZE,
  PEBBLE_HEIGHT,
  GARBAGE_COUNT,
  GARBAGE_TYPES,
} from './config.js';

// Builds the static scene for a given lane count.
//   - Start median: world Z from 0 to +2*LANE_WIDTH (BEHIND the frog at row 0).
//   - Road: world Z from 0 to -laneCount * LANE_WIDTH.
//   - Goal median: from the road's far edge onward.
// Stripes between lanes are widened (`STRIPE_WIDTH_DIVIDER`) so the safe-rest stripe is
// visually distinct from a 5cm POV. Decorations: Bott's-dot pebbles on the safe stripes
// at each cellX (X reference), flattened garbage scattered on the road, distant pond
// and trees on the goal-side bank.
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

  // Far grass extending past each median so the horizon isn't a void of sky-on-grass.
  const farGrassY = -0.005; // sit slightly below the medians to avoid z-fighting at the seam
  const startFarZCenter = roadZNear + startMedianDepth + FAR_GRASS_DEPTH / 2;
  const goalFarZCenter = roadZFar - goalMedianDepth - FAR_GRASS_DEPTH / 2;
  scene.add(makeGround(FAR_GRASS_WIDTH, FAR_GRASS_DEPTH, GRASS_COLOR, 0, startFarZCenter, farGrassY));
  scene.add(makeGround(FAR_GRASS_WIDTH, FAR_GRASS_DEPTH, GRASS_COLOR, 0, goalFarZCenter, farGrassY));

  const stripeY = 0.01;
  // Outer road edges (decorative).
  scene.add(makeStripe(ROAD_LENGTH, STRIPE_WIDTH_OUTER, stripeY, roadZNear));
  scene.add(makeStripe(ROAD_LENGTH, STRIPE_WIDTH_OUTER, stripeY, roadZFar));
  // Between-lane safe stripes.
  for (let L = 1; L < laneCount; L++) {
    scene.add(makeStripe(ROAD_LENGTH, STRIPE_WIDTH_DIVIDER, stripeY, -L * LANE_WIDTH));
  }

  addPebbles(scene, laneCount);
  addGarbage(scene, laneCount);
  addPond(scene, roadZFar - goalMedianDepth);
  addTrees(scene, roadZNear + startMedianDepth, roadZFar - goalMedianDepth);

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

function makeGround(sizeX, sizeZ, color, x, z, y = 0) {
  const geom = new THREE.PlaneGeometry(sizeX, sizeZ);
  const mat = new THREE.MeshLambertMaterial({ color });
  mat.fog = true;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
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

// Bott's-dot style pebbles on every safe stripe EXCEPT the start outer stripe at z=0.
// The frog spawns on z=0, so a pebble at the same world position would clip the camera.
// Pebbles sit at HALF-cell offsets (cellX + 0.5) so the frog always lands BETWEEN
// two dots — they flank each strafe position instead of being jumped onto.
// Shared geometry/material to keep allocation cheap.
function addPebbles(scene, laneCount) {
  const geom = new THREE.SphereGeometry(PEBBLE_SIZE / 2, 8, 6);
  const mat = new THREE.MeshLambertMaterial({ color: PEBBLE_COLOR });
  mat.fog = true;
  const y = PEBBLE_HEIGHT / 2;
  for (let L = 1; L <= laneCount; L++) {
    const z = -L * LANE_WIDTH;
    for (let cx = -STRAFE_MAX; cx < STRAFE_MAX; cx++) {
      const dot = new THREE.Mesh(geom, mat);
      dot.position.set((cx + 0.5) * CELL_WIDTH, y, z);
      dot.scale.y = PEBBLE_HEIGHT / PEBBLE_SIZE; // squashed sphere → low Bott's dot
      scene.add(dot);
    }
  }
}

// Flattened debris scattered randomly on the road surface for visual texture.
// Pure decoration — collision ignores these. Uses a deterministic-ish seed so the
// pattern feels stable per build but not identical across levels.
function addGarbage(scene, laneCount) {
  const roadZNear = 0;
  const roadZFar = -laneCount * LANE_WIDTH;
  const halfX = ROAD_LENGTH / 2 - 1;
  const y = 0.012; // just above stripe height to avoid z-fighting
  for (let i = 0; i < GARBAGE_COUNT; i++) {
    const t = GARBAGE_TYPES[Math.floor(Math.random() * GARBAGE_TYPES.length)];
    const geom = new THREE.PlaneGeometry(t.l, t.w);
    const mat = new THREE.MeshLambertMaterial({ color: t.color });
    mat.fog = true;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    const x = (Math.random() * 2 - 1) * halfX;
    const z = roadZNear + Math.random() * (roadZFar - roadZNear);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  }
}

// A single elliptical pond on the goal-side bank. Just a flat colored disc — from
// 5cm POV at long range it reads as water.
function addPond(scene, goalMedianFarZ) {
  const geom = new THREE.CircleGeometry(1, 32);
  const mat = new THREE.MeshLambertMaterial({ color: POND_COLOR });
  mat.fog = true;
  const pond = new THREE.Mesh(geom, mat);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(POND_RADIUS_X, POND_RADIUS_Z, 1);
  pond.position.set(0, 0.002, goalMedianFarZ - POND_Z_OFFSET);
  scene.add(pond);
}

// Cylinder-trunk + cone-foliage trees scattered on both off-road banks. Avoids
// dropping any inside the pond footprint or directly on the road's X span.
function addTrees(scene, startBankZ, goalBankZ) {
  const trunkGeom = new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: TREE_TRUNK_COLOR });
  const foliageGeom = new THREE.ConeGeometry(1.0, 2.4, 8);
  const foliageMat = new THREE.MeshLambertMaterial({ color: TREE_FOLIAGE_COLOR });
  trunkMat.fog = true;
  foliageMat.fog = true;

  const place = (bankSign, nearZ) => {
    // bankSign: +1 = start side (z increases away from road), -1 = goal side
    for (let i = 0; i < TREE_COUNT_PER_SIDE; i++) {
      const sideX = Math.random() < 0.5 ? -1 : 1;
      const x = sideX * (12 + Math.random() * 60);
      const zDist = 4 + Math.random() * (FAR_GRASS_DEPTH - 20);
      const z = nearZ + bankSign * zDist;
      // Skip if inside pond footprint (goal side only).
      if (bankSign < 0) {
        const dx = x / POND_RADIUS_X;
        const dz = (z - (goalBankZ - POND_Z_OFFSET)) / POND_RADIUS_Z;
        if (dx * dx + dz * dz < 1.4) continue;
      }
      const trunk = new THREE.Mesh(trunkGeom, trunkMat);
      trunk.position.set(x, 0.8, z);
      scene.add(trunk);
      const foliage = new THREE.Mesh(foliageGeom, foliageMat);
      foliage.position.set(x, 2.6, z);
      scene.add(foliage);
    }
  };
  place(+1, startBankZ);
  place(-1, goalBankZ);
}
