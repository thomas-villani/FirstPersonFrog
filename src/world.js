import * as THREE from 'three';
import {
  LANE_WIDTH,
  LANE_COUNT_MVP,
  ROAD_LENGTH,
  ROAD_COLOR,
  GRASS_COLOR,
  STRIPE_COLOR,
  SKY_COLOR,
  FOG_START,
  FOG_END,
  rowToZ,
} from './config.js';

// Builds the static scene: road, medians, stripes, fog, lights.
// Returns the THREE.Scene so the Game can add dynamic objects to it.
export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, FOG_START, FOG_END);

  // Lights.
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  // The "rows" coordinate: row 0 = start median, rows 1..N = road, row N+1 = end median.
  // Road covers Z from (rowToZ(1) + LANE_WIDTH/2) down to (rowToZ(N) - LANE_WIDTH/2).
  const roadZFront = rowToZ(1) + LANE_WIDTH / 2;       // +Z side of the road
  const roadZBack = rowToZ(LANE_COUNT_MVP) - LANE_WIDTH / 2;
  const roadDepth = roadZFront - roadZBack;            // positive number
  const roadZCenter = (roadZFront + roadZBack) / 2;

  // Medians (grass). Placed flush next to the road — no overlap, no z-fighting.
  const startMedianDepth = LANE_WIDTH;
  const startMedianZCenter = rowToZ(0);
  const endMedianDepth = LANE_WIDTH;
  const endMedianZCenter = rowToZ(LANE_COUNT_MVP + 1);

  scene.add(makeGround(ROAD_LENGTH, startMedianDepth, GRASS_COLOR, 0, startMedianZCenter));
  scene.add(makeGround(ROAD_LENGTH, roadDepth, ROAD_COLOR, 0, roadZCenter));
  scene.add(makeGround(ROAD_LENGTH, endMedianDepth, GRASS_COLOR, 0, endMedianZCenter));

  // Lane stripes: solid white lines at the Z-boundary between adjacent road lanes,
  // plus at the outer road edges. Lifted to y = 0.01 to avoid z-fighting with the road.
  const stripeWidth = 0.15;
  const stripeY = 0.01;

  // Outer edges (road/median boundary).
  scene.add(makeStripe(ROAD_LENGTH, stripeWidth, stripeY, roadZFront));
  scene.add(makeStripe(ROAD_LENGTH, stripeWidth, stripeY, roadZBack));

  // Between-lane dividers (solid for MVP; dashed can come later).
  for (let r = 1; r < LANE_COUNT_MVP; r++) {
    const z = rowToZ(r) - LANE_WIDTH / 2; // boundary between row r and row r+1
    scene.add(makeStripe(ROAD_LENGTH, stripeWidth, stripeY, z));
  }

  return scene;
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
