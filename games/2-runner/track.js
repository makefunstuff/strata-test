import * as THREE from "three";

// Scrolling track: a static road plane plus instanced lane dashes and side posts
// that slide toward the player and are recycled, so the motion is visible.
const DASHES = 56;
const POSTS = 22;
const DASH_SPAN = 90;
const POST_SPAN = 70;

export function createTrack(scene) {
  const group = new THREE.Group();
  // The group was never added to the scene, so the whole track (road, ground,
  // dashes, posts) was invisible and only the player/obstacles rendered.
  scene.add(group);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(6.8, 120),
    new THREE.MeshLambertMaterial({ color: 0x232a35 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -50);
  group.add(road);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 220),
    new THREE.MeshLambertMaterial({ color: 0x141a22 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.04, -60);
  group.add(ground);

  // Lane boundary dashes (x = -3.3, -1.1, 1.1, 3.3).
  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.09, 0.03, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x8fa3bd }),
    DASHES
  );
  const dashX = [], dashZ = [];
  const boundaries = [-3.3, -1.1, 1.1, 3.3];
  for (let i = 0; i < DASHES; i++) {
    dashX.push(boundaries[i % boundaries.length]);
    dashZ.push(-(i / boundaries.length) * (DASH_SPAN / (DASHES / boundaries.length)));
  }
  group.add(dashMesh);

  // Side posts.
  const postMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.25, 1.1, 0.25),
    new THREE.MeshLambertMaterial({ color: 0x3d4a5c }),
    POSTS
  );
  const postX = [], postZ = [];
  for (let i = 0; i < POSTS; i++) {
    postX.push(i % 2 ? 3.8 : -3.8);
    postZ.push(-(i * POST_SPAN) / POSTS);
  }
  group.add(postMesh);

  const dummy = new THREE.Object3D();
  function refresh(mesh, xs, zs) {
    for (let i = 0; i < xs.length; i++) {
      dummy.position.set(xs[i], 0.02, zs[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function update(move) {
    if (!move) return;
    for (let i = 0; i < DASHES; i++) {
      dashZ[i] += move;
      if (dashZ[i] > 12) dashZ[i] -= DASH_SPAN;
    }
    for (let i = 0; i < POSTS; i++) {
      postZ[i] += move;
      if (postZ[i] > 12) postZ[i] -= POST_SPAN;
    }
    refresh(dashMesh, dashX, dashZ);
    refresh(postMesh, postX, postZ);
  }

  refresh(dashMesh, dashX, dashZ);
  refresh(postMesh, postX, postZ);

  return { group, update };
}
