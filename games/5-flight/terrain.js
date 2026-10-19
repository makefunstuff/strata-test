// Terrain in chunks, recycled rather than rebuilt: a pool of 25 meshes whose geometry
// buffers are refilled as the plane crosses into a new cell, so flying forever costs no
// allocation and the draw-call count stays flat.
import * as THREE from "three";
import { heightAt, value, SEA } from "./noise.js";

export const CHUNK = 46;
export const SEG = 22;
export const RADIUS = 2;              // 5 x 5 cells around the plane: 25 draw calls
const SPAN = (RADIUS * 2 + 1) * (RADIUS * 2 + 1);

const C_SEA = new THREE.Color("#22364a");
const C_SAND = new THREE.Color("#cbb489");
const C_GRASS = new THREE.Color("#3f7d46");
const C_GRASS_HI = new THREE.Color("#2c5a33");
const C_ROCK = new THREE.Color("#6d727b");
const C_SNOW = new THREE.Color("#f0f6fd");
const tmp = new THREE.Color();

function colourFor(h, x, z, out) {
  const jitter = 0.9 + value(x * 0.09, z * 0.09) * 0.2;
  if (h < -1.2) out.copy(C_SEA);
  else if (h < 1.6) out.copy(C_SAND).lerp(C_GRASS, Math.max(0, (h + 1.2) / 2.8) * 0.4);
  else if (h < 18) out.copy(C_GRASS).lerp(C_GRASS_HI, ((h - 1.6) / 16.4) * 0.75);
  else if (h < 34) out.copy(C_GRASS).lerp(C_ROCK, Math.min(1, (h - 18) / 16));
  else out.copy(C_ROCK).lerp(C_SNOW, Math.min(1, (h - 34) / 16));
  out.multiplyScalar(jitter);
  return out;
}

export function createTerrain(scene) {
  const template = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
  template.rotateX(-Math.PI / 2);       // grid lies in XZ, displacement goes into y

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.94, metalness: 0.02, envMapIntensity: 0.6,
  });

  const pool = [];
  const live = new Map();

  function make() {
    const geo = template.clone();
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    return mesh;
  }

  function fill(mesh, cx, cz) {
    const pos = mesh.geometry.attributes.position;
    const cols = mesh.geometry.attributes.color;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    for (let i = 0; i < pos.count; i++) {
      const x = ox + pos.getX(i), z = oz + pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      colourFor(h, x, z, tmp);
      cols.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true;
    cols.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    mesh.position.set(ox, 0, oz);
    mesh.updateMatrix();
    mesh.visible = true;
  }

  // water: one large sheet that follows the plane, so the sea is one draw call
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUNK * 9, CHUNK * 9),
    new THREE.MeshStandardMaterial({
      color: 0x1b4d76, transparent: true, opacity: 0.84, roughness: 0.1, metalness: 0.55,
      envMapIntensity: 1.4,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA - 0.35;
  scene.add(water);

  function update(px, pz) {
    const cx0 = Math.round(px / CHUNK), cz0 = Math.round(pz / CHUNK);
    const want = new Set();
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const cx = cx0 + dx, cz = cz0 + dz, k = cx + "," + cz;
        want.add(k);
        if (!live.has(k)) {
          const m = pool.pop() ?? make();
          fill(m, cx, cz);
          live.set(k, m);
        }
      }
    }
    if (live.size > want.size) {
      for (const [k, m] of live) {
        if (want.has(k)) continue;
        m.visible = false;
        live.delete(k);
        pool.push(m);
      }
    }
    water.position.x = px;
    water.position.z = pz;
  }

  return {
    update, live, pool, water, mat,
    get drawn() { return live.size; },
    ground: heightAt,
    // the floor under a point: terrain where there is land, the sea where there is not
    floor(x, z) { const h = heightAt(x, z); return h > SEA - 0.4 ? h : SEA; },
  };
}
