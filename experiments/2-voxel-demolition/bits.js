// Debris, dust, trails and camera shake for experiment 2 — all pooled, all instanced/point-based,
// so an impact can spray hundreds of chips and puffs without touching the garbage collector.
import * as THREE from "three";
import { rand } from "../shared/lab.js";

const scratchM = new THREE.Matrix4();
const scratchQ = new THREE.Quaternion();
const scratchP = new THREE.Vector3();
const scratchS = new THREE.Vector3();
const scratchE = new THREE.Euler();

/** Small chipped-off voxel fragments: cheap JS physics, instanced, fading out. */
export function makeDebris(scene, { count = 600, gravity = -22 } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02, transparent: true, opacity: 0.96, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const pos = [], vel = [], rot = [], av = [], life = new Float32Array(count), size = [], tint = [];
  const col = new THREE.Color(0x888888);
  for (let i = 0; i < count; i++) { pos.push(new THREE.Vector3(0, -999, 0)); vel.push(new THREE.Vector3()); rot.push(new THREE.Euler()); av.push(new THREE.Vector3()); size.push(0.15); tint.push(col.clone()); }
  let cur = 0, alive = 0;
  const hide = (i) => { scratchM.makeScale(0, 0, 0); mesh.setMatrixAt(i, scratchM); };
  for (let i = 0; i < count; i++) hide(i);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.setColorAt(0, col);
  return {
    mesh,
    spawn(p, n = 10, { color = "#b6543a", speed = 5, size: s0 = 0.18, spread = 0.4, life: ttl = 2.6 } = {}) {
      for (let k = 0; k < n; k++) {
        const i = cur = (cur + 1) % count;
        pos[i].set(p.x + rand(-spread, spread), p.y + rand(-spread, spread), p.z + rand(-spread, spread));
        vel[i].set(rand(-speed, speed), rand(speed * 0.3, speed * 1.4), rand(-speed, speed));
        rot[i].set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
        av[i].set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        size[i] = s0 * rand(0.45, 1.5);
        tint[i].set(color).offsetHSL(0, 0, rand(-0.08, 0.08));
        mesh.setColorAt(i, tint[i]);
        life[i] = ttl * rand(0.7, 1.25);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt, { floor = 0.0, drag = 0.15 } = {}) {
      alive = 0;
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { hide(i); continue; }
        alive++;
        vel[i].y += gravity * dt;
        vel[i].multiplyScalar(1 - drag * dt);
        pos[i].addScaledVector(vel[i], dt);
        if (pos[i].y < floor + size[i] * 0.5) { pos[i].y = floor + size[i] * 0.5; vel[i].y = Math.abs(vel[i].y) * 0.28; vel[i].x *= 0.7; vel[i].z *= 0.7; av[i].multiplyScalar(0.5); }
        scratchE.set(rot[i].x + av[i].x * dt, rot[i].y + av[i].y * dt, rot[i].z + av[i].z * dt);
        rot[i].copy(scratchE);
        const k = Math.min(1, life[i] * 1.6);
        scratchQ.setFromEuler(rot[i]);
        scratchM.compose(scratchP.copy(pos[i]), scratchQ, scratchS.setScalar(size[i] * k));
        mesh.setMatrixAt(i, scratchM);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return alive;
    },
    get alive() { return alive; },
  };
}

/** Soft dust puffs and projectile trails: one additive point cloud, wind-driven. */
export function makeDust(scene, { count = 1600, color = 0xd8cbb8 } = {}) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const size = new Float32Array(count);
  const tint = new Float32Array(count * 3);
  const decay = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3 + 1] = -999; life[i] = 0; tint[i * 3] = 1; tint[i * 3 + 1] = 1; tint[i * 3 + 2] = 1; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aTint", new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: 1 }, uBase: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute float aLife; attribute float aSize; attribute vec3 aTint;
      uniform float uPixel;
      varying float vLife; varying vec3 vTint;
      void main(){
        vLife = aLife; vTint = aTint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uPixel * (420.0 / max(0.001, -mv.z)) * (0.35 + 0.65 * (1.0 - aLife)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float; uniform vec3 uBase; varying float vLife; varying vec3 vTint;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (vLife <= 0.0 || d > 0.5) discard;
        float a = smoothstep(0.5, 0.02, d) * clamp(vLife, 0.0, 1.0) * 0.62;
        gl_FragColor = vec4(uBase * vTint, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let cur = 0, alive = 0;
  const c = new THREE.Color();
  return {
    points, material: mat,
    puff(p, n = 12, { color = 0xd8cbb8, speed = 2.4, rise = 1.4, size: s = 0.9, life: ttl = 1.6, spread = 0.5 } = {}) {
      c.set(color);
      for (let k = 0; k < n; k++) {
        const i = cur = (cur + 1) % count;
        pos[i * 3] = p.x + rand(-spread, spread);
        pos[i * 3 + 1] = p.y + rand(-spread, spread);
        pos[i * 3 + 2] = p.z + rand(-spread, spread);
        const a = rand(0, 6.28), sp = speed * rand(0.3, 1);
        vel[i * 3] = Math.cos(a) * sp;
        vel[i * 3 + 1] = rise * rand(0.3, 1.4);
        vel[i * 3 + 2] = Math.sin(a) * sp;
        size[i] = s * rand(0.6, 1.6);
        life[i] = 1;
        decay[i] = 1 / (ttl * rand(0.8, 1.2));
        tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
      }
      geo.attributes.aTint.needsUpdate = true;
    },
    update(dt, wind = { x: 0, z: 0 }) {
      alive = 0;
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * decay[i];
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        alive++;
        vel[i * 3] += wind.x * dt; vel[i * 3 + 2] += wind.z * dt;
        vel[i * 3 + 1] *= (1 - 0.6 * dt);
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      return alive;
    },
    get alive() { return alive; },
  };
}

/** Camera shake: a decaying impulse added to the orbit camera's position each frame. */
export function makeShake(camera, base) {
  let amp = 0, phase = 0;
  const off = new THREE.Vector3();
  return {
    add(amount) { amp = Math.min(1.4, amp + amount); },
    update(dt, t) {
      amp *= Math.exp(-dt * 5.5);
      phase += dt * 34;
      const a = amp * 0.42;
      off.set(Math.sin(phase * 1.13) * a, Math.sin(phase * 0.91 + 1.3) * a * 0.8, Math.cos(phase * 1.27) * a * 0.6);
      camera.position.copy(base).add(off);
      return amp;
    },
    get amp() { return amp; },
  };
}
