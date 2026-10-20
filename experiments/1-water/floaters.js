// Floating bodies and spray for experiment 1.
// Bodies ride the CPU wave grid (buoyancy spring + slope-driven pitch/roll) and give energy back
// to both fields, so a crate that bobs hard launches real ripples. Spray is a pooled point cloud.
import * as THREE from "three";
import { rand } from "../shared/lab.js";

function crateTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#7b5433"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 60 | 0},${12 + Math.random() * 30 | 0},8,${0.05 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 40, 1 + Math.random() * 3);
  }
  g.strokeStyle = "rgba(40,24,12,0.85)"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
  g.strokeStyle = "rgba(190,150,100,0.35)"; g.lineWidth = 2; g.strokeRect(9, 9, 110, 110);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createFloaters(scene, { wave, sim, pool, count = 7 } = {}) {
  const wood = crateTexture();
  const bodies = [];
  const geoms = {
    crate: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(0.5, 28, 20),
    barrel: new THREE.CylinderGeometry(0.42, 0.42, 1.1, 22),
  };
  const mats = {
    crate: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78, metalness: 0.05 }),
    ball: new THREE.MeshStandardMaterial({ color: 0xd8e6f2, roughness: 0.16, metalness: 0.85, envMapIntensity: 1.2 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.42, metalness: 0.6 }),
  };
  const kinds = ["crate", "ball", "barrel", "crate", "ball", "crate", "barrel"];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const mesh = new THREE.Mesh(geoms[kind], mats[kind]);
    const s = kind === "crate" ? rand(0.7, 1.25) : kind === "ball" ? rand(0.5, 0.95) : rand(0.8, 1.05);
    mesh.scale.setScalar(s);
    mesh.castShadow = true;
    mesh.position.set(rand(-pool.w / 2 + 2, pool.w / 2 - 2), 0, rand(-pool.d / 2 + 2, pool.d / 2 - 2));
    scene.add(mesh);
    bodies.push({
      kind, mesh, s,
      pos: mesh.position.clone(),
      vy: 0, pitch: 0, roll: 0, wpitch: 0, wroll: 0,
      draft: kind === "ball" ? 0.34 : kind === "barrel" ? 0.55 : 0.42,
      mass: kind === "ball" ? 0.55 : 1,
      phase: rand(0, 6.28),
      splashCool: 0,
    });
  }
  return {
    bodies,
    update(dt, { buoy = 26, surge = 0.5, splash = 1 } = {}) {
      const half = pool.w / 2 - 0.8;
      for (const b of bodies) {
        const h = wave.sample(b.pos.x, b.pos.z);
        const sl = wave.slope(b.pos.x, b.pos.z, b.s * 0.7);
        // buoyancy: a spring toward the surface line at the body's draft
        const target = h - b.draft * b.s;
        const f = (target - b.pos.y) * buoy / b.mass - b.vy * 3.4;
        b.vy += f * dt;
        b.pos.y += b.vy * dt;
        // gentle drift on the wave orbital motion
        b.pos.x += sl.x * -surge * dt * 2.2;
        b.pos.z += sl.z * -surge * dt * 2.2;
        if (Math.abs(b.pos.x) > half) { b.pos.x = Math.sign(b.pos.x) * half; b.pos.x += -Math.sign(b.pos.x) * 0.05; }
        if (Math.abs(b.pos.z) > half) { b.pos.z = Math.sign(b.pos.z) * half; b.pos.z += -Math.sign(b.pos.z) * 0.05; }
        // pitch/roll follows the local slope, damped
        const kp = 9, kd = 3.2;
        b.wpitch += ((sl.z * 1.1 - b.pitch) * kp - b.wpitch * kd) * dt;
        b.wroll += ((-sl.x * 1.1 - b.roll) * kp - b.wroll * kd) * dt;
        b.pitch += b.wpitch * dt; b.roll += b.wroll * dt;
        b.mesh.position.copy(b.pos);
        b.mesh.rotation.set(b.pitch, b.phase += dt * 0.05, b.roll);
        // the body drives the field: vertical motion pushes water (throttled per body)
        b.splashCool -= dt;
        const push = Math.max(-0.02, Math.min(0.02, -b.vy * 0.0012 * splash * b.s * b.s));
        if (Math.abs(push) > 1e-5) {
          wave.splat(b.pos.x, b.pos.z, b.s * 0.85, push);
          if (b.splashCool <= 0 && Math.abs(b.vy) > 0.9) {
            b.splashCool = 0.12;
            sim.splat((b.pos.x / pool.w) + 0.5, 0.5 - b.pos.z / pool.d, b.s * 1.1, pool.w,
              { strength: Math.min(0.5, Math.abs(b.vy) * 0.09) * Math.sign(-b.vy), foam: Math.min(0.5, Math.abs(b.vy) * 0.12) });
          }
        }
      }
      return bodies;
    },
  };
}

/** Pooled additive spray droplets (splash, burst, rain kickback). */
export function createSpray(scene, { count = 2400, color = 0xbfe6ff, size = 0.14 } = {}) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3 + 1] = -999; seed[i] = Math.random(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
  geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uPixel: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aLife; attribute float aSeed;
      uniform float uSize, uPixel;
      varying float vLife; varying float vSeed;
      void main(){
        vLife = aLife; vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, uSize * uPixel * (1.0 + aSeed) * (300.0 / max(0.001, -mv.z)) * clamp(aLife, 0.0, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uColor;
      varying float vLife; varying float vSeed;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (vLife <= 0.0 || d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * clamp(vLife, 0.0, 1.0);
        gl_FragColor = vec4(uColor * (0.7 + 0.6 * vSeed), a * 0.9);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0, alive = 0;
  return {
    points, material: mat,
    burst(p, n = 26, speed = 2.6, spread = 0.5, up = 2.4) {
      for (let k = 0; k < n; k++) {
        const i = cursor = (cursor + 1) % count;
        const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
        pos[i * 3] = p.x + Math.cos(a) * r;
        pos[i * 3 + 1] = p.y + 0.05;
        pos[i * 3 + 2] = p.z + Math.sin(a) * r;
        const s = speed * (0.4 + Math.random() * 0.8);
        vel[i * 3] = Math.cos(a) * s * 0.5;
        vel[i * 3 + 1] = up * (0.5 + Math.random());
        vel[i * 3 + 2] = Math.sin(a) * s * 0.5;
        life[i] = 1;
      }
    },
    update(dt, gravity = 9.5) {
      alive = 0;
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * 0.9;
        vel[i * 3 + 1] -= gravity * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < -0.4) life[i] = 0;
        if (life[i] > 0) alive++;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      return alive;
    },
  };
}
