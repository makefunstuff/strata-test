// Ring gates: glowing hoops placed ahead of the plane, facing the way it is coming from.
// Fly through one, it scores, bursts, and is re-placed downrange, so the run never ends.
import * as THREE from "three";
import { glowTexture } from "../shared/textures.js";

export const RING_R = 9;

export function createGates(scene, { count = 6, floor = () => 0 } = {}) {
  const ringGeo = new THREE.TorusGeometry(RING_R, 0.55, 8, 40);
  const haloGeo = new THREE.TorusGeometry(RING_R, 2.1, 6, 32);
  const discGeo = new THREE.CircleGeometry(RING_R - 0.5, 28);
  const gates = [];

  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
      color: 0x0e1a26, emissive: 0xffcf5c, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.35,
    }));
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0.09, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    group.add(ring, halo, disc);
    group.visible = false;
    scene.add(group);
    gates.push({ group, ring, halo: halo.material, disc: disc.material, taken: false, phase: i });
  }

  const nrm = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  /** Put a gate downrange of `from` along `dir`: ahead, off to one side, above the ground. */
  function place(gate, from, dir, rng) {
    nrm.set(dir.x, 0, dir.z).normalize();
    // gates sit near the heading, not off in the middle of the map: a ring you can never
    // line up with is scenery, not a goal
    const ahead = 130 + rng() * 140;
    const side = (rng() - 0.5) * 110;
    const x = from.x + nrm.x * ahead - nrm.z * side;
    const z = from.z + nrm.z * ahead + nrm.x * side;
    const y = floor(x, z) + 24 + rng() * 26;
    gate.group.position.set(x, y, z);
    gate.group.lookAt(from.x, from.y, from.z);
    gate.group.visible = true;
    gate.taken = false;
  }

  /** The gate whose disc the plane is inside, if any. */
  function check(pos) {
    for (const g of gates) {
      if (!g.group.visible || g.taken) continue;
      if (g.group.position.distanceTo(pos) < RING_R) { g.taken = true; return g; }
    }
    return null;
  }

  function update(dt, elapsed) {
    for (const g of gates) {
      if (!g.group.visible) continue;
      const p = 0.16 + 0.1 * Math.sin(elapsed * 2.4 + g.phase);
      g.disc.opacity = p;
      g.halo.opacity = 0.18 + 0.12 * Math.sin(elapsed * 1.7 + g.phase * 1.4);
      g.ring.material.emissiveIntensity = 1.3 + 0.5 * Math.sin(elapsed * 3.1 + g.phase);
    }
  }

  function hideAll() { for (const g of gates) g.group.visible = false; }

  /** Re-place gates the plane has flown past, so the run is endless. */
  function recycle(pos, dir, rng) {
    for (const g of gates) {
      if (!g.group.visible) continue;
      const d = tmpV.subVectors(g.group.position, pos);
      if (d.x * dir.x + d.z * dir.z < -25) place(g, pos, dir, rng);
    }
  }

  return { gates, place, check, update, recycle, hideAll, R: RING_R };
}
