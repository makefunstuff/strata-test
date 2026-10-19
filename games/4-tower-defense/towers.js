// Towers: a base, a pillar and a head that turns to the nearest enemy in range, plus a pool
// of visible projectiles. Everything is pooled; the loop allocates nothing.
import * as THREE from "three";
import { world, N, RANGE } from "./grid.js";
export { RANGE };
import { glowTexture, brushedMetal } from "../shared/textures.js";

export const DAMAGE = 12;
const COOLDOWN = 0.42;
const SPEED = 15;
const MAX_SHOTS = 40;

export function createTowers(scene, { camera, enemies, fx, audio }) {
  const metal = brushedMetal({ top: "#33507a", bottom: "#16222f" });
  metal.repeat.set(1, 1);
  const list = [];
  const baseGeo = new THREE.CylinderGeometry(0.34, 0.42, 0.16, 14);
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.42, 12);
  const headGeo = new THREE.BoxGeometry(0.34, 0.24, 0.34);
  const barrelGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.46, 10);
  // a hairline ring fringes red/cyan through the CRT's per-pixel RGB sampling, so the
  // range circle is a band: thin high-contrast curves are exactly what the tube splits apart
  const ringGeo = new THREE.RingGeometry(RANGE - 0.14, RANGE, 72);
  ringGeo.rotateX(-Math.PI / 2);

  function build(c, r) {
    const p = world(c, r);
    const g = new THREE.Group();
    g.position.set(p.x, 0.08, p.z);
    const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x2b3d55, map: metal, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.1 }));
    base.castShadow = true;
    const pillar = new THREE.Mesh(pillarGeo, base.material);
    pillar.position.y = 0.28;
    pillar.castShadow = true;
    const head = new THREE.Group();
    head.position.y = 0.56;
    const shell = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x16283a, emissive: 0x35d0ff, emissiveIntensity: 0.95, roughness: 0.4, metalness: 0.6 }));
    shell.castShadow = true;
    const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({ color: 0x2b3d55, map: metal, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.2 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, 0.34);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false }),
    );
    eye.position.set(0, 0.16, 0.16);
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xbfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    flash.position.set(0, 0, 0.62);
    head.add(shell, barrel, eye, flash);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7fd7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    ring.position.y = -0.02;
    g.add(base, pillar, head, ring);
    scene.add(g);
    const t = { col: c, row: r, group: g, head, flash: flash.material, ring: ring.material, eye: eye.material, cd: 0, target: null, show: 0, hideAt: 0 };
    list.push(t);
    return t;
  }

  const shots = [];
  const shotGeo = new THREE.SphereGeometry(0.085, 8, 6);
  for (let i = 0; i < MAX_SHOTS; i++) {
    // a plain bright sphere: the bloom threshold turns it into a tracer without a trail mesh
    const m = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xdff4ff, toneMapped: false }));
    m.visible = false;
    scene.add(m);
    shots.push({ mesh: m, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, target: null });
  }

  function fire(t, e) {
    const shot = shots.find((s) => !s.active);
    if (!shot) return;
    const p = t.group.position;
    // lead the target so fast enemies are actually hittable by a projectile with travel time
    const dx = e.x - p.x, dz = e.z - p.z;
    const eta = Math.hypot(dx, dz) / SPEED;
    const ex = e.x + Math.sin(e.dir) * e.speed * eta * 0.6;
    const ez = e.z + Math.cos(e.dir) * e.speed * eta * 0.6;
    const d = Math.hypot(ex - p.x, ez - p.z) || 1;
    shot.active = true;
    shot.mesh.visible = true;
    shot.x = p.x; shot.y = 0.72; shot.z = p.z;
    shot.vx = ((ex - p.x) / d) * SPEED;
    shot.vy = 0;
    shot.vz = ((ez - p.z) / d) * SPEED;
    shot.life = 1.6;
    shot.target = e;
    shot.mesh.position.set(shot.x, shot.y, shot.z);
    t.flash.opacity = 1;
    audio.sfx.laser();
  }

  function update(dt, elapsed) {
    for (const t of list) {
      t.cd = Math.max(0, t.cd - dt);
      // nearest enemy in range
      let best = null, bestD = RANGE * RANGE;
      for (const e of enemies.live) {
        const dx = e.x - t.group.position.x, dz = e.z - t.group.position.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = e; }
      }
      t.target = best;
      if (best) {
        const want = Math.atan2(best.x - t.group.position.x, best.z - t.group.position.z);
        let d = want - t.head.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        t.head.rotation.y += d * Math.min(1, dt * 10);
        if (t.cd <= 0) { t.cd = COOLDOWN; fire(t, best); }
      }
      t.flash.opacity = Math.max(0, t.flash.opacity - dt * 6);
      t.eye.emissiveIntensity = best ? 1.6 : 0.6;
        const ringWant = t.show && elapsed > t.hideAt ? 0 : (t.show ? 0.17 : 0);
      t.ring.opacity += (ringWant - t.ring.opacity) * Math.min(1, dt * 8);
    }

    for (const s of shots) {
      if (!s.active) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.rotation.y = Math.atan2(s.vx, s.vz);
      let done = s.life <= 0;
      for (const e of enemies.live) {
        if (Math.abs(e.x - s.x) < 0.34 && Math.abs(e.z - s.z) < 0.34) {
          const dead = enemies.hit(e, DAMAGE);
          fx.sparks.spawn(s.mesh.position, { n: 6, speed: 2.4, spread: 1, size: 0.35, life: 0.24, color: 0xffe6a8 });
          audio.sfx.hit();
          if (dead) audio.sfx.coin();
          done = true;
          break;
        }
      }
      if (done) { s.active = false; s.mesh.visible = false; }
    }
  }

  function showRange(t, on = true) { t.show = on ? 1 : 0; }
  function clear() {
    for (const t of list) { scene.remove(t.group); }
    list.length = 0;
    for (const s of shots) { s.active = false; s.mesh.visible = false; }
  }
  return { build, update, showRange, clear, list, RANGE, DAMAGE };
}
