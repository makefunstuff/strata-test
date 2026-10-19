// Reusable effects: spark bursts, brick shatter, impact rings, one travelling impact light.
import * as THREE from "three";

const sparkVert = /* glsl */`
  attribute float aLife;
  attribute float aSize;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (240.0 / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;

const sparkFrag = /* glsl */`
  uniform sampler2D map;
  uniform vec3 color;
  varying float vLife;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(color * (0.6 + vLife), t.a * vLife);
  }`;

/**
 * A pool of additive glow points. spawn() throws n sparks from a point; update()
 * integrates gravity and fade. No allocation per frame.
 */
export function createSparks(scene, { texture, count = 600, gravity = -6, drag = 1.4 }) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const size = new Float32Array(count);
  const dur = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setDrawRange(0, count);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, color: { value: new THREE.Color(0xffffff) } },
    vertexShader: sparkVert,
    fragmentShader: sparkFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  function spawn(p, { n = 12, speed = 3, spread = 1, size: s = 0.5, life: l = 0.5, color, up = 0.5 } = {}) {
    if (color) mat.uniforms.color.value.set(color);
    for (let i = 0; i < n; i++) {
      const k = cursor;
      cursor = (cursor + 1) % count;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() ** 0.6;
      vel[k * 3] = Math.cos(a) * r * speed * spread;
      vel[k * 3 + 1] = (0.3 + Math.random()) * speed * up;
      vel[k * 3 + 2] = Math.sin(a) * r * speed * spread;
      life[k] = 1;
      dur[k] = l * (0.6 + Math.random() * 0.8);
      size[k] = s * (0.6 + Math.random() * 0.9);
    }
  }

  function update(dt) {
    for (let k = 0; k < count; k++) {
      if (life[k] <= 0) continue;
      life[k] -= dt / dur[k];
      if (life[k] <= 0) { life[k] = 0; size[k] = 0; continue; }
      vel[k * 3 + 1] += gravity * dt;
      const d = Math.max(0, 1 - drag * dt);
      vel[k * 3] *= d; vel[k * 3 + 1] *= d; vel[k * 3 + 2] *= d;
      pos[k * 3] += vel[k * 3] * dt;
      pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
      pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aLife.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  function clear() {
    for (let k = 0; k < count; k++) { life[k] = 0; size[k] = 0; }
    geo.attributes.aLife.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  return { spawn, update, clear, object: points };
}

/** Chunky debris: instanced glowing shards that fly, spin and settle. */
export function createShatter(scene, { count = 260, geometry, color = 0xffffff }) {
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geometry, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) { mesh.setColorAt(i, col.set(color)); }
  scene.add(mesh);

  const st = [];
  for (let i = 0; i < count; i++) {
    st.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: 1, life: 0, dur: 1 });
  }
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
  mesh.instanceMatrix.needsUpdate = true;
  let cursor = 0;

  function burst(p, { n = 14, color: c = 0xffffff, speed = 4, scale = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = st[cursor];
      cursor = (cursor + 1) % count;
      s.alive = true;
      s.p.copy(p);
      s.v.set((Math.random() - 0.5) * speed, 1 + Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.s = scale * (0.5 + Math.random() * 0.9);
      s.life = 1;
      s.dur = 0.7 + Math.random() * 0.5;
      mesh.setColorAt(cursor, col.set(c).multiplyScalar(1.35));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function update(dt) {
    for (let i = 0; i < count; i++) {
      const s = st[i];
      if (!s.alive) continue;
      s.life -= dt / s.dur;
      if (s.life <= 0) {
        s.alive = false;
        mesh.setMatrixAt(i, zero);
        continue;
      }
      s.v.y -= 12 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0) { s.p.y = 0; s.v.y = -s.v.y * 0.35; s.v.x *= 0.7; s.v.z *= 0.7; }
      s.r.x += dt * 6; s.r.z += dt * 4;
      dummy.position.copy(s.p);
      dummy.rotation.copy(s.r);
      const k = s.s * Math.min(1, s.life * 2.2);
      dummy.scale.setScalar(k);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    for (const s of st) s.alive = false;
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { burst, update, clear };
}

/** Expanding neon rings, one slot per concurrent impact. */
export function createRings(scene, { slots = 10, inner = 0.18, outer = 0.26 }) {
  const geo = new THREE.RingGeometry(inner, outer, 48);
  const list = [];
  for (let i = 0; i < slots; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    list.push({ mesh: m, life: 0, dur: 0.5, from: 1, to: 6 });
  }
  let cursor = 0;
  function burst(p, { color = 0xffffff, from = 1, to = 6, dur = 0.5 } = {}) {
    const r = list[cursor];
    cursor = (cursor + 1) % slots;
    r.life = 1; r.dur = dur; r.from = from; r.to = to;
    r.mesh.position.set(p.x, p.y, p.z);
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
  }
  function update(dt) {
    for (const r of list) {
      if (r.life <= 0) continue;
      r.life -= dt / r.dur;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life;
      const s = r.from + (r.to - r.from) * (1 - r.life * r.life);
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = Math.min(1, r.life * 1.4);
    }
  }
  function clear() { for (const r of list) { r.life = 0; r.mesh.visible = false; } }
  return { burst, update, clear };
}

/** A single coloured impact light that fades out (cheap: one dynamic point light). */
export function createImpactLight(scene, { distance = 7, decay = 2 } = {}) {
  const light = new THREE.PointLight(0xffffff, 0, distance, decay);
  light.position.set(0, 0.4, 0);
  scene.add(light);
  let peak = 0, life = 0;
  function flash(p, { color = 0xffffff, power = 26, dur = 0.35 } = {}) {
    light.color.set(color);
    light.position.set(p.x, p.y + 0.25, p.z);
    peak = power; life = 1;
  }
  function update(dt) {
    if (life > 0) {
      life = Math.max(0, life - dt / 0.35);
      light.intensity = peak * life * life;
    }
  }
  function clear() { life = 0; light.intensity = 0; }
  return { flash, update, clear, light };
}
