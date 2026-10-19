import * as THREE from "three";
import { streakTexture } from "./textures.js";

// Additive speed streaks lying along the direction of travel: the faster the game goes,
// the more of them appear. Used by the runner and the flight game.
export function createSpeedLines(scene, { count = 30, spread = 7, minY = 0.05, maxY = 5, near = 12, far = -70 } = {}) {
  const geo = new THREE.PlaneGeometry(0.22, 4);
  geo.rotateX(-Math.PI / 2);            // lie flat, stretched along z
  const mat = new THREE.MeshBasicMaterial({
    map: streakTexture(), color: 0xbfe6ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const x = [], y = [], z = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < count; i++) {
    x.push(rand(-spread, spread));
    y.push(rand(minY, maxY));
    z.push(rand(far, near));
  }

  const dummy = new THREE.Object3D();
  function draw(intensity) {
    for (let i = 0; i < count; i++) {
      dummy.position.set(x[i], y[i], z[i]);
      dummy.scale.set(1, 1, 0.4 + intensity * 1.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt, speed, running = true) {
    const intensity = running ? THREE.MathUtils.clamp((speed - 8) / 24, 0, 1) : 0;
    mat.opacity = intensity * 0.5;
    if (!intensity) return;
    const move = speed * 1.6 * dt;
    for (let i = 0; i < count; i++) {
      z[i] += move;
      if (z[i] > near) z[i] = far;
    }
    draw(intensity);
  }

  draw(0);
  return { update, mesh };
}
