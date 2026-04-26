import * as THREE from 'three';
import {
  LANE_WIDTH,
  ROAD_LENGTH,
  ROAD_COLOR,
  STRIPE_COLOR,
  STRIPE_WIDTH_OUTER,
  STRIPE_WIDTH_DIVIDER,
  CELL_WIDTH,
  STRAFE_MAX,
  SUB_ROWS_PER_LANE,
  FAR_GRASS_DEPTH,
  FAR_GRASS_WIDTH,
  POND_COLOR,
  POND_RADIUS_X,
  POND_RADIUS_Z,
  POND_Z_OFFSET,
  TREE_TRUNK_COLOR,
  TREE_FOLIAGE_COLOR,
  PEBBLE_COLOR,
  PEBBLE_SIZE,
  PEBBLE_HEIGHT,
  GARBAGE_COUNT,
  GARBAGE_TYPES,
  ROCK_COUNT_ON_ROAD,
  ROCK_COUNT_OFF_ROAD,
  ROCK_COLORS,
  ROCK_RADIUS_RANGE,
  DIVIDER_MIN_LANES,
  DIVIDER_RAIL_OFFSET,
  DIVIDER_RAIL_THICKNESS,
  DIVIDER_RAIL_HEIGHT,
  DIVIDER_RAIL_SECOND_HEIGHT,
  DIVIDER_POST_SPACING,
  DIVIDER_POST_HEIGHT,
  DIVIDER_POST_THICKNESS,
  DIVIDER_RAIL_COLOR,
  DIVIDER_POST_COLOR,
  OBSTACLE_TYPES,
  OBSTACLES_PER_LEVEL_BASE,
  OBSTACLES_PER_LEVEL_CAP,
  THEMES,
  eastCountForLanes,
  goalRowForLevel,
  rowToZ,
  cellXToWorldX,
} from './config.js';

// Builds the static scene for a given lane count and biome theme.
//   - Start median: world Z from 0 to +2*LANE_WIDTH (BEHIND the frog at row 0).
//   - Road: world Z from 0 to -laneCount * LANE_WIDTH.
//   - Goal median: from the road's far edge onward.
// Stripes between lanes are widened (`STRIPE_WIDTH_DIVIDER`) so the safe-rest stripe is
// visually distinct from a 5cm POV. Decorations: Bott's-dot pebbles on the safe stripes
// at each cellX (X reference), flattened garbage scattered on the road, distant pond
// and trees on the goal-side bank, optional buildings/mountains/cacti by theme,
// optional central guardrail when laneCount >= DIVIDER_MIN_LANES.
export function buildWorld(laneCount, theme = THEMES.meadow) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, theme.fogStart, theme.fogEnd);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  const grassColor = theme.grass;
  const roadZNear = 0;
  const roadZFar = -laneCount * LANE_WIDTH;
  const roadDepth = roadZNear - roadZFar;
  const roadZCenter = (roadZNear + roadZFar) / 2;

  const startMedianDepth = LANE_WIDTH * 2;
  const startMedianZCenter = roadZNear + startMedianDepth / 2;
  const goalMedianDepth = LANE_WIDTH * 2;
  const goalMedianZCenter = roadZFar - goalMedianDepth / 2;

  scene.add(makeGround(ROAD_LENGTH, startMedianDepth, grassColor, 0, startMedianZCenter));
  scene.add(makeGround(ROAD_LENGTH, roadDepth, ROAD_COLOR, 0, roadZCenter));
  scene.add(makeGround(ROAD_LENGTH, goalMedianDepth, grassColor, 0, goalMedianZCenter));

  // Far grass extending past each median so the horizon isn't a void of sky-on-grass.
  const farGrassY = -0.005; // sit slightly below the medians to avoid z-fighting at the seam
  const startFarZCenter = roadZNear + startMedianDepth + FAR_GRASS_DEPTH / 2;
  const goalFarZCenter = roadZFar - goalMedianDepth - FAR_GRASS_DEPTH / 2;
  scene.add(makeGround(FAR_GRASS_WIDTH, FAR_GRASS_DEPTH, grassColor, 0, startFarZCenter, farGrassY));
  scene.add(makeGround(FAR_GRASS_WIDTH, FAR_GRASS_DEPTH, grassColor, 0, goalFarZCenter, farGrassY));

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
  addRoadRocks(scene, laneCount);
  if (laneCount >= DIVIDER_MIN_LANES) addGuardrail(scene, laneCount);

  if (theme.pond) addPond(scene, roadZFar - goalMedianDepth);
  if (theme.trees > 0) {
    addTrees(
      scene,
      roadZNear + startMedianDepth,
      roadZFar - goalMedianDepth,
      theme.trees,
      theme.treeFoliage ?? TREE_FOLIAGE_COLOR,
      theme.pond ? roadZFar - goalMedianDepth : null,
    );
  }
  if (theme.buildings > 0) {
    addBuildings(scene, roadZNear + startMedianDepth, roadZFar - goalMedianDepth, theme.buildings);
  }
  if (theme.mountains > 0) {
    addMountains(scene, roadZFar - goalMedianDepth, theme.mountains);
  }
  if (theme.cacti > 0) {
    addCacti(scene, roadZNear + startMedianDepth, roadZFar - goalMedianDepth, theme.cacti);
  }
  addBankRocks(scene, roadZNear + startMedianDepth, roadZFar - goalMedianDepth);

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

// Small 3D rocks on the road surface — pure visual texture (collision ignores
// these like flat garbage). Uses one shared geometry per rock; size jitter via
// per-mesh scale so the pile feels varied without N geometries.
function addRoadRocks(scene, laneCount) {
  const roadZNear = 0;
  const roadZFar = -laneCount * LANE_WIDTH;
  const halfX = ROAD_LENGTH / 2 - 1;
  const baseGeom = new THREE.SphereGeometry(1, 6, 5);
  for (let i = 0; i < ROCK_COUNT_ON_ROAD; i++) {
    const r = randInRange(ROCK_RADIUS_RANGE[0], ROCK_RADIUS_RANGE[1]);
    const color = ROCK_COLORS[Math.floor(Math.random() * ROCK_COLORS.length)];
    const mat = new THREE.MeshLambertMaterial({ color });
    mat.fog = true;
    const m = new THREE.Mesh(baseGeom, mat);
    m.scale.set(r * (0.9 + Math.random() * 0.4), r * 0.5, r * (0.9 + Math.random() * 0.4));
    m.position.set(
      (Math.random() * 2 - 1) * halfX,
      r * 0.5,
      roadZNear + Math.random() * (roadZFar - roadZNear),
    );
    scene.add(m);
  }
}

// Off-road bank rocks, half on/half off the verge. Same shared geometry pattern.
function addBankRocks(scene, startBankZ, goalBankZ) {
  const baseGeom = new THREE.SphereGeometry(1, 6, 5);
  const place = (bankSign, nearZ) => {
    for (let i = 0; i < ROCK_COUNT_OFF_ROAD; i++) {
      const r = randInRange(ROCK_RADIUS_RANGE[0] * 1.5, ROCK_RADIUS_RANGE[1] * 2.5);
      const color = ROCK_COLORS[Math.floor(Math.random() * ROCK_COLORS.length)];
      const mat = new THREE.MeshLambertMaterial({ color });
      mat.fog = true;
      const m = new THREE.Mesh(baseGeom, mat);
      m.scale.set(r * (0.9 + Math.random() * 0.4), r * 0.6, r * (0.9 + Math.random() * 0.4));
      const sideX = Math.random() < 0.5 ? -1 : 1;
      const x = sideX * (8 + Math.random() * 50);
      const z = nearZ + bankSign * (1 + Math.random() * (FAR_GRASS_DEPTH - 5));
      m.position.set(x, r * 0.5, z);
      scene.add(m);
    }
  };
  place(+1, startBankZ);
  place(-1, goalBankZ);
}

// Two parallel rails framing the central safe stripe between the east and west
// halves of the road, with vertical posts on the stripe centerline. Pure visual
// — no collision. Frog rests on the centerline between the rails (rail offset
// 0.12m vs frog hitbox half-width 0.15m → camera passes between rails without
// overlapping any divider mesh).
function addGuardrail(scene, laneCount) {
  const east = eastCountForLanes(laneCount);
  if (east <= 0 || east >= laneCount) return;
  const z = -east * LANE_WIDTH;

  const railGeom = new THREE.BoxGeometry(ROAD_LENGTH, DIVIDER_RAIL_THICKNESS, DIVIDER_RAIL_THICKNESS);
  const railMat = new THREE.MeshLambertMaterial({ color: DIVIDER_RAIL_COLOR });
  railMat.fog = true;

  // Two rails per side (top + waist) for the highway-guardrail read.
  for (const side of [-1, +1]) {
    for (const h of [DIVIDER_RAIL_HEIGHT, DIVIDER_RAIL_SECOND_HEIGHT]) {
      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set(0, h, z + side * DIVIDER_RAIL_OFFSET);
      scene.add(rail);
    }
  }

  const postGeom = new THREE.BoxGeometry(
    DIVIDER_POST_THICKNESS,
    DIVIDER_POST_HEIGHT,
    DIVIDER_POST_THICKNESS,
  );
  const postMat = new THREE.MeshLambertMaterial({ color: DIVIDER_POST_COLOR });
  postMat.fog = true;
  const halfX = ROAD_LENGTH / 2;
  for (let x = -halfX + DIVIDER_POST_SPACING / 2; x <= halfX; x += DIVIDER_POST_SPACING) {
    const post = new THREE.Mesh(postGeom, postMat);
    post.position.set(x, DIVIDER_POST_HEIGHT / 2, z);
    scene.add(post);
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
// `pondGoalZ` (or null) lets the helper skip the pond ellipse on the goal side.
function addTrees(scene, startBankZ, goalBankZ, countPerSide, foliageColor, pondGoalZ) {
  const trunkGeom = new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: TREE_TRUNK_COLOR });
  const foliageGeom = new THREE.ConeGeometry(1.0, 2.4, 8);
  const foliageMat = new THREE.MeshLambertMaterial({ color: foliageColor });
  trunkMat.fog = true;
  foliageMat.fog = true;

  const place = (bankSign, nearZ) => {
    // bankSign: +1 = start side (z increases away from road), -1 = goal side
    for (let i = 0; i < countPerSide; i++) {
      const sideX = Math.random() < 0.5 ? -1 : 1;
      const x = sideX * (12 + Math.random() * 60);
      const zDist = 4 + Math.random() * (FAR_GRASS_DEPTH - 20);
      const z = nearZ + bankSign * zDist;
      // Skip if inside pond footprint (goal side only).
      if (bankSign < 0 && pondGoalZ !== null) {
        const dx = x / POND_RADIUS_X;
        const dz = (z - (pondGoalZ - POND_Z_OFFSET)) / POND_RADIUS_Z;
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

// Suburban / industrial silhouette boxes scattered on both banks. Tall thin
// boxes with a flat colored roof block — boxy retro silhouette.
function addBuildings(scene, startBankZ, goalBankZ, countPerSide) {
  const palette = [0x686060, 0x807260, 0x504848, 0x9a8870, 0x6e6258];
  const place = (bankSign, nearZ) => {
    for (let i = 0; i < countPerSide; i++) {
      const sideX = Math.random() < 0.5 ? -1 : 1;
      const x = sideX * (24 + Math.random() * 70);
      const zDist = 8 + Math.random() * (FAR_GRASS_DEPTH - 25);
      const z = nearZ + bankSign * zDist;
      const w = 4 + Math.random() * 6;
      const d = 4 + Math.random() * 4;
      const h = 6 + Math.random() * 14;
      const color = palette[Math.floor(Math.random() * palette.length)];
      const geom = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshLambertMaterial({ color });
      mat.fog = true;
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, h / 2, z);
      scene.add(m);
      // Simple flat roof slab in a muted color for variety from a distance.
      const roofGeom = new THREE.BoxGeometry(w * 1.05, 0.3, d * 1.05);
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
      roofMat.fog = true;
      const roof = new THREE.Mesh(roofGeom, roofMat);
      roof.position.set(x, h + 0.15, z);
      scene.add(roof);
    }
  };
  place(+1, startBankZ);
  place(-1, goalBankZ);
}

// Distant mountain cones on the goal-side horizon. Big, sparse, dark — fog
// fades them so they read as silhouette.
function addMountains(scene, goalBankZ, count) {
  for (let i = 0; i < count; i++) {
    const sideX = Math.random() < 0.5 ? -1 : 1;
    const x = sideX * (40 + Math.random() * 90);
    const zDist = 60 + Math.random() * (FAR_GRASS_DEPTH - 60);
    const z = goalBankZ - zDist;
    const radius = 22 + Math.random() * 28;
    const height = 26 + Math.random() * 28;
    const color = 0x3a3e4a;
    const geom = new THREE.ConeGeometry(radius, height, 5);
    const mat = new THREE.MeshLambertMaterial({ color });
    mat.fog = true;
    const cone = new THREE.Mesh(geom, mat);
    cone.position.set(x, height / 2, z);
    cone.rotation.y = Math.random() * Math.PI;
    scene.add(cone);
  }
}

// Saguaro-style cacti scattered on both banks. Trunk cylinder + 1–2
// perpendicular arm cylinders. Green; reads as desert from a distance.
function addCacti(scene, startBankZ, goalBankZ, countPerSide) {
  const trunkGeom = new THREE.CylinderGeometry(0.35, 0.45, 1.8, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3e });
  trunkMat.fog = true;
  const armGeom = new THREE.CylinderGeometry(0.22, 0.25, 1.0, 8);
  const place = (bankSign, nearZ) => {
    for (let i = 0; i < countPerSide; i++) {
      const sideX = Math.random() < 0.5 ? -1 : 1;
      const x = sideX * (10 + Math.random() * 60);
      const z = nearZ + bankSign * (3 + Math.random() * (FAR_GRASS_DEPTH - 15));
      const trunk = new THREE.Mesh(trunkGeom, trunkMat);
      trunk.position.set(x, 0.9, z);
      scene.add(trunk);
      const armCount = 1 + Math.floor(Math.random() * 2);
      for (let a = 0; a < armCount; a++) {
        const arm = new THREE.Mesh(armGeom, trunkMat);
        const armSide = Math.random() < 0.5 ? -1 : 1;
        arm.position.set(x + armSide * 0.45, 1.2 + Math.random() * 0.3, z);
        arm.rotation.z = armSide * (Math.PI / 2);
        scene.add(arm);
        // Vertical extension on top of the arm.
        const armTop = new THREE.Mesh(armGeom, trunkMat);
        armTop.position.set(x + armSide * 0.85, 1.7, z);
        armTop.scale.y = 0.6;
        scene.add(armTop);
      }
    }
  };
  place(+1, startBankZ);
  place(-1, goalBankZ);
}

// --- Blocking obstacles ---
//
// Place soda cans / bottles / trash bags on safe between-lane stripes. Each
// obstacle reserves a (row, cellX) cell that the frog cannot hop into.
// Returns [{ row, cellX, kind, mesh }] so the caller can pass exclusion
// info to bug placement and store the list for hop-rejection.
//
// Excludes:
//   - row 0 (start), goalRow, and any row with row % SUB_ROWS_PER_LANE !== 0 (those are wheel-path rows)
//   - cellX = 0 (don't punish the natural straight-line path)
//   - the divider stripe row (the guardrail posts already occupy it)
export function placeObstaclesForLevel(level, scene, laneCount) {
  const out = [];
  if (laneCount < 2) return out; // no inter-lane safe stripes to use
  const goalRow = goalRowForLevel(level);

  const stripeRows = [];
  for (let L = 1; L < laneCount; L++) stripeRows.push(L * SUB_ROWS_PER_LANE);
  const dividerRow = laneCount >= DIVIDER_MIN_LANES
    ? eastCountForLanes(laneCount) * SUB_ROWS_PER_LANE
    : -1;
  const candidateRows = stripeRows.filter((r) => r > 0 && r < goalRow && r !== dividerRow);
  if (candidateRows.length === 0) return out;

  const target = Math.min(
    OBSTACLES_PER_LEVEL_CAP,
    OBSTACLES_PER_LEVEL_BASE + Math.floor(level / 2),
  );

  const used = new Set();
  let attempts = 0;
  const maxAttempts = target * 12;
  while (out.length < target && attempts < maxAttempts) {
    attempts++;
    const row = candidateRows[Math.floor(Math.random() * candidateRows.length)];
    let cellX = Math.floor(Math.random() * (2 * STRAFE_MAX - 1)) - (STRAFE_MAX - 1);
    if (cellX === 0) continue;
    const key = `${row}:${cellX}`;
    if (used.has(key)) continue;
    used.add(key);
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const mesh = buildObstacleMesh(type);
    mesh.position.set(cellXToWorldX(cellX), type.height / 2, rowToZ(row));
    scene.add(mesh);
    out.push({ row, cellX, kind: type.kind, mesh });
  }
  return out;
}

function buildObstacleMesh(type) {
  const mat = new THREE.MeshLambertMaterial({ color: type.color });
  mat.fog = true;
  let geom;
  if (type.geom === 'cylinder') {
    geom = new THREE.CylinderGeometry(type.radius, type.radius, type.height, 12);
  } else if (type.geom === 'sphere') {
    geom = new THREE.SphereGeometry(type.radius, 10, 8);
  } else {
    geom = new THREE.BoxGeometry(type.radius * 2, type.height, type.radius * 2);
  }
  return new THREE.Mesh(geom, mat);
}

function randInRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}
