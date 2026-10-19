import * as THREE from "three";
import { asphaltTexture, gridTexture } from "../shared/textures.js";

// Scrolling track: an asphalt ribbon with neon edge strips, instanced lane dashes and
// glowing pylons that slide toward the player and get recycled. The road and ground
// textures scroll with the same distance, so speed reads in the whole frame.
const DASHES = 48;
const POSTS = 26;
const DASH_SPAN = 96;
const POST_SPAN = 78;
const ROAD_TILE = 8;      // metres of road per asphalt tile
const GROUND_TILE = 12;

export function createTrack(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const roadTex = asphaltTexture({ base: "#171d27", speckle: 0.7, size: 512 }).clone();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(1.6, 140 / ROAD_TILE);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 140),
    new THREE.MeshStandardMaterial({
      color: 0x2a3342, map: roadTex, roughness: 0.72, metalness: 0.24,
      emissive: 0x1b3350, emissiveMap: roadTex, emissiveIntensity: 0.35,
    })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -56);
  group.add(road);

  // neon edge strips: the lane is unmistakable, and bloom makes them hum
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x7fe3ff, toneMapped: false });
  for (const x of [-3.55, 3.55]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 140), edgeMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.012, -56);
    group.add(strip);
  }
  // magenta inner lane lines, so three lanes read at a glance
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xff5fa8, toneMapped: false, transparent: true, opacity: 0.55 });
  for (const x of [-1.1, 1.1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 140), laneMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.011, -56);
    group.add(strip);
  }

  const groundTex = gridTexture({
    base: "#0a111c", line: "rgba(70,150,220,0.18)", major: "rgba(120,210,255,0.26)", pool: null,
  }).clone();
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(26, 640 / GROUND_TILE);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 640),
    new THREE.MeshStandardMaterial({
      color: 0x0d1420, map: groundTex, roughness: 0.7, metalness: 0.3,
      emissive: 0x14304e, emissiveMap: groundTex, emissiveIntensity: 0.35,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  // long enough to reach past the fog, so there is no hard line at the horizon
  ground.position.set(0, -0.05, -250);
  group.add(ground);

  // Lane dashes down the middle boundaries (x = ±1.1).
  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1, 0.04, 1.5),
    new THREE.MeshBasicMaterial({ color: 0xdceeff, toneMapped: false }),
    DASHES
  );
  const dashX = [], dashZ = [];
  const boundaries = [-1.1, 1.1];
  for (let i = 0; i < DASHES; i++) {
    dashX.push(boundaries[i % boundaries.length]);
    dashZ.push(-Math.floor(i / boundaries.length) * (DASH_SPAN / (DASHES / boundaries.length)));
  }
  group.add(dashMesh);

  // Pylons with a glowing cap, alternating sides.
  const postMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 1.15, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x2b3a4e, roughness: 0.4, metalness: 0.7 }),
    POSTS
  );
  const capMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.16, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffb45c, toneMapped: false }),
    POSTS
  );
  const postX = [], postZ = [];
  for (let i = 0; i < POSTS; i++) {
    postX.push(i % 2 ? 4.4 : -4.4);
    postZ.push(-(i * POST_SPAN) / POSTS);
  }
  group.add(postMesh, capMesh);

  const dummy = new THREE.Object3D();
  function refresh() {
    for (let i = 0; i < DASHES; i++) {
      dummy.position.set(dashX[i], 0.02, dashZ[i]);
      dummy.updateMatrix();
      dashMesh.setMatrixAt(i, dummy.matrix);
    }
    dashMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < POSTS; i++) {
      dummy.position.set(postX[i], 0.58, postZ[i]);
      dummy.updateMatrix();
      postMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(postX[i], 1.24, postZ[i]);
      dummy.updateMatrix();
      capMesh.setMatrixAt(i, dummy.matrix);
    }
    postMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
  }

  function update(move) {
    if (!move) return;
    // one texture tile covers ROAD_TILE / GROUND_TILE metres, and UV offset is in tiles
    roadTex.offset.y -= move / ROAD_TILE;
    groundTex.offset.y -= move / GROUND_TILE;
    for (let i = 0; i < DASHES; i++) {
      dashZ[i] += move;
      if (dashZ[i] > 12) dashZ[i] -= DASH_SPAN;
    }
    for (let i = 0; i < POSTS; i++) {
      postZ[i] += move;
      if (postZ[i] > 12) postZ[i] -= POST_SPAN;
    }
    refresh();
  }

  refresh();

  return { group, update };
}
