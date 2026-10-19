import * as THREE from "three";
import { asphaltTexture, gridTexture, glowTexture } from "../shared/textures.js";

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
      color: 0x1c2431, map: roadTex, roughness: 0.72, metalness: 0.24,
      emissive: 0x14263c, emissiveMap: roadTex, emissiveIntensity: 0.22,
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
      color: 0x0a1019, map: groundTex, roughness: 0.75, metalness: 0.25,
      emissive: 0x0f2340, emissiveMap: groundTex, emissiveIntensity: 0.12,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  // long enough to reach past the fog, so there is no hard line at the horizon
  ground.position.set(0, -0.05, -250);
  group.add(ground);

  // ---- far skyline: a band of dark towers with lit windows, so the horizon band is a place
  // and not a gradient, and speed has something to be measured against. Two instanced meshes
  // (one draw call each), no per-frame work, and both are inside the fog so they dissolve.
  const towers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x0b1830, fog: false }), 90);   // at the horizon: outside the fog by design, a silhouette
  const windows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.55, 0.4),
    new THREE.MeshBasicMaterial({
      color: 0xffcf7a, transparent: true, opacity: 0.45, toneMapped: false, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }), 90);
  const d = new THREE.Object3D();
  for (let i = 0; i < 90; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (10 + Math.random() * 48);
    const z = -150 - Math.random() * 92;
    const h = 6 + Math.random() * 26;
    d.position.set(x, h / 2 - 0.2, z);
    d.scale.set(3 + Math.random() * 6, h, 3);
    d.updateMatrix();
    towers.setMatrixAt(i, d.matrix);
    d.position.set(x, h * 0.62, z + 1.55);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    windows.setMatrixAt(i, d.matrix);
  }
  towers.frustumCulled = windows.frustumCulled = false;
  group.add(towers, windows);

  // a low sun sitting in the haze band, which is where the road dissolves
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(52, 52),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffb45c, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
  sun.position.set(24, 7, -238);
  group.add(sun);

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
