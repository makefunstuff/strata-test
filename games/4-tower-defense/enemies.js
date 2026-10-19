// Enemies: a fixed pool of chunky walkers that follow the lane, each with a billboard
// health bar. No per-frame allocation: bodies, bars and scratch vectors are created once.
import * as THREE from "three";
import { world as gridPoint } from "./grid.js";

const MAX = 14;

export function createEnemies(scene, { camera, grid, fx, audio, onLeak, onKill, palette = [0xff5a5a, 0xff9f4a, 0xc86bff, 0x5ad1ff] }) {
  const live = [];
  const pool = [];
  const barGeo = new THREE.PlaneGeometry(0.52, 0.075);
  const fillGeo = new THREE.PlaneGeometry(0.5, 0.05);
  fillGeo.translate(0.25, 0, 0);   // scale from the left edge, so the bar drains right-to-left

  for (let i = 0; i < MAX; i++) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x000000, emissiveIntensity: 1, roughness: 0.5, metalness: 0.35,
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.46), bodyMat);
    body.position.y = 0.28;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.18, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x121a24, emissive: 0xff4a5a, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.4 }),
    );
    head.position.set(0, 0.42, 0.16);
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.7, metalness: 0.2 }),
    );
    legs.position.y = 0.08;
    const bar = new THREE.Group();
    const barBg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x0a0f16, transparent: true, opacity: 0.8, toneMapped: false }));
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x3dff8b, toneMapped: false }));
    fill.position.z = 0.001;
    bar.add(barBg, fill);
    bar.position.y = 0.72;
    g.add(body, head, legs, bar);
    g.visible = false;
    scene.add(g);
    pool.push({ group: g, body, head, legs, bar, fill, mat: bodyMat, headMat: head.material, hp: 0, max: 1, active: false, seg: 0, x: 0, z: 0, dir: 0, flash: 0, phase: i });
  }

  const scratch = new THREE.Vector3();
  let spawned = 0;

  function spawn(wave) {
    const slot = pool.find((e) => !e.active);
    if (!slot) return null;
    const path = grid.route();
    if (!path || path.length < 2) return null;
    const [c, r] = path[0];
    const p = gridPoint(c, r);
    slot.active = true;
    slot.group.visible = true;
    slot.seg = 0;
    slot.x = p.x;
    slot.z = p.z;
    slot.max = slot.hp = 26 * Math.pow(1.28, wave - 1);
    slot.speed = 1.45 + 0.07 * wave;
    slot.reward = 3 + wave;
    slot.flash = 0;
    slot.path = path;
    slot.color = palette[(spawned++) % palette.length];
    slot.mat.color.set(slot.color).multiplyScalar(0.85);
    slot.headMat.emissive.set(slot.color);
    slot.group.position.set(slot.x, 0, slot.z);
    live.push(slot);
    return slot;
  }

  /** Re-snap to the new lane after a tower changes the route. */
  function reroute() {
    const path = grid.route();
    if (!path) return;
    for (const e of live) {
      e.path = path;
      let best = 0, bestD = Infinity;
      for (let i = e.seg; i < path.length; i++) {
        const p = gridPoint(path[i][0], path[i][1]);
        const d = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      e.seg = best;
    }
  }

  function hit(e, dmg) {
    if (!e.active) return false;
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.hp <= 0) { kill(e); return true; }
    return false;
  }

  function kill(e) {
    scratch.set(e.x, 0.3, e.z);
    fx.sparks.spawn(scratch, { n: 14, speed: 3, spread: 1.2, size: 0.5, life: 0.5, color: e.color });
    fx.shards.burst(scratch, { n: 8, color: e.color, speed: 3, scale: 0.5 });
    fx.rings.burst(scratch, { color: e.color, from: 0.4, to: 3, dur: 0.35 });
    fx.impact.flash(scratch, { color: e.color, power: 8, dur: 0.25 });
    audio.sfx.explode();
    e.active = false;
    e.group.visible = false;
    const i = live.indexOf(e);
    if (i >= 0) live.splice(i, 1);
    if (onKill) onKill(e);          // the money is the game's business, not the pool's
  }

  function leak(e) {
    scratch.set(e.x, 0.3, e.z);
    fx.rings.burst(scratch, { color: 0xff3040, from: 0.4, to: 3.4, dur: 0.4 });
    audio.sfx.hit();
    e.active = false;
    e.group.visible = false;
    const i = live.indexOf(e);
    if (i >= 0) live.splice(i, 1);
    onLeak();
  }

  function update(dt, elapsed) {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      const path = e.path;
      if (!path) continue;
      let want = e.speed * dt;
      while (want > 0 && e.seg < path.length - 1) {
        const nxt = gridPoint(path[e.seg + 1][0], path[e.seg + 1][1]);
        const dx = nxt.x - e.x, dz = nxt.z - e.z;
        const d = Math.hypot(dx, dz);
        if (d <= want) { e.x = nxt.x; e.z = nxt.z; e.seg++; want -= d; }
        else { e.x += (dx / d) * want; e.z += (dz / d) * want; e.dir = Math.atan2(dx, dz); want = 0; }
      }
      if (e.seg >= path.length - 1) { leak(e); continue; }

      e.group.position.set(e.x, Math.abs(Math.sin(elapsed * 9 + e.phase)) * 0.05, e.z);
      e.group.rotation.y = e.dir;
      e.legs.rotation.x = Math.sin(elapsed * 14 + e.phase) * 0.5;

      const frac = Math.max(0, e.hp / e.max);
      e.fill.scale.x = frac;
      e.fill.material.color.setHex(frac > 0.55 ? 0x3dff8b : frac > 0.25 ? 0xffcf5c : 0xff4a5a);
      e.bar.quaternion.copy(camera.quaternion);

      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt);
        e.mat.emissive.setHex(0xffffff);
        e.mat.emissiveIntensity = e.flash * 6;
      } else {
        e.mat.emissive.copy(e.mat.color);
        e.mat.emissiveIntensity = 0.16;
      }
    }
  }

  function clear() {
    for (const e of live) { e.active = false; e.group.visible = false; }
    live.length = 0;
  }

  return { spawn, update, hit, kill, reroute, clear, live, get count() { return live.length; }, max: MAX };
}
