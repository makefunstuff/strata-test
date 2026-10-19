// Voxel structures + rigid bodies for experiment 2.
// Rapier (WASM, pinned CDN, inlined base64) runs the blocks: a box collider each, asleep until
// something disturbs them. The blocks are drawn as one InstancedMesh with per-instance colour, so
// 800 voxels stay one draw call. Shooting the bottom row wakes the row above, so walls collapse.
import * as THREE from "three";

export async function makePhysics({ gravity = -22 } = {}) {
  const RAPIER = await import("rapier3d");
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
  world.timestep = 1 / 60;
  world.integrationParameters.numSolverIterations = 6;
  world.integrationParameters.numAdditionalFrictionIterations = 2;
  return { RAPIER, world };
}

const PALETTE = ["#b6543a", "#a94b33", "#c4643f", "#8f452e", "#c97a4e", "#9c4d33", "#d08a5d", "#8a4130"];
const WOOD = ["#8a6a3c", "#6f5530", "#9a7a48", "#5e4626"];
const STONE = ["#9a978e", "#8b887f", "#a8a49a", "#7e7b73"];

/** Builder catalogue: each returns an array of {x,y,z,sx,sy,sz,color}. */
export const STRUCTURES = {
  wall: "brick wall, 20 x 10 x 2",
  house: "house with a doorway and a roof",
  tower: "siege tower, 6 x 6 x 18",
  arch: "arch bridge with parapets",
};

function put(list, x, y, z, color, sx = 1, sy = 1, sz = 1) {
  list.push({ x, y, z, sx, sy, sz, color });
}

export function buildBlocks(kind = "wall") {
  const L = [];
  const brick = (x, y, z, sz = 1) => put(L, x, y, z, PALETTE[(Math.abs(x * 7 + y * 13 + z * 3) * 2654435761 >>> 0) % PALETTE.length], 1, 0.5, sz);
  if (kind === "wall") {
    const W = 20, H = 20, D = 2;
    for (let y = 0; y < H; y++) {
      const off = y % 2 ? 0.5 : 0;
      for (let x = -W / 2; x < W / 2 - 0.5; x++) {
        const bx = x * 1 + off;
        if (bx > W / 2 - 0.5) continue;
        for (let z = 0; z < D; z++) brick(bx, y * 0.5 + 0.25, z * 1 - (D - 1) / 2, 1);
      }
    }
    // stone footing and cap
    for (let x = -W / 2 - 0.5; x <= W / 2; x += 1) {
      put(L, x, -0.35, 0, STONE[Math.abs(x * 31) % 4], 1, 0.7, 2.2);
      put(L, x, H * 0.5 + 0.3, 0, STONE[Math.abs(x * 17) % 4], 1, 0.6, 2.4);
    }
  } else if (kind === "house") {
    const W = 13, D = 11, H = 14, t = 1;
    const inWall = (x, z) => (Math.abs(x) <= W / 2 && Math.abs(z) <= D / 2) &&
      (Math.abs(x) > W / 2 - t || Math.abs(z) > D / 2 - t);
    for (let y = 0; y < H; y++) {
      for (let x = -W / 2; x < W / 2; x++) {
        for (let z = -D / 2; z < D / 2; z++) {
          if (!inWall(x + 0.5, z + 0.5)) continue;
          const door = z < -D / 2 + t && Math.abs(x + 0.5) < 1.2 && y < 5;
          const window = Math.abs(x + 0.5) > 2 && Math.abs(x + 0.5) < 3.2 && y > 5 && y < 9 && Math.abs(z + 0.5) > D / 2 - t;
          if (door || window) continue;
          brick(x + 0.5, y * 0.5 + 0.25, z + 0.5, t);
        }
      }
    }
    // roof: layered slabs that overhang
    for (let i = 0; i <= D; i++) {
      const z = -D / 2 - 0.5 + i;
      for (let x = -W / 2 - 0.5; x < W / 2 + 0.5; x += 1) {
        put(L, x, H * 0.5 + 0.28, z, WOOD[Math.abs(x * 5 + i * 3) % 4], 1, 0.55, 1);
      }
    }
  } else if (kind === "tower") {
    const S = 6, H = 34;
    for (let y = 0; y < H; y++) {
      for (let x = -S / 2; x < S / 2; x++) {
        for (let z = -S / 2; z < S / 2; z++) {
          const edge = Math.abs(x + 0.5) > S / 2 - 1 || Math.abs(z + 0.5) > S / 2 - 1;
          const corner = Math.abs(x + 0.5) > S / 2 - 1 && Math.abs(z + 0.5) > S / 2 - 1;
          const level = y % 8;
          const open = level >= 3 && level <= 5;          // window bands
          if (!edge || (open && !corner)) continue;
          brick(x + 0.5, y * 0.5 + 0.25, z + 0.5, 1);
        }
      }
    }
    for (let x = -S / 2 - 0.5; x < S / 2 + 0.5; x++) {
      for (let z = -S / 2 - 0.5; z < S / 2 + 0.5; z++) put(L, x, H * 0.5 + 0.3, z, WOOD[Math.abs(x * 3 + z * 7) % 4], 1, 0.6, 1);
    }
  } else if (kind === "arch") {
    const span = 22, rise = 9, thick = 2;
    for (let x = -span / 2; x < span / 2; x++) {
      const t = (x / (span / 2));
      const archY = rise * (1 - t * t);
      for (let z = 0; z < thick; z++) {
        for (let y = 0; y < Math.floor(archY * 2); y++) {
          if (y > archY * 2 - 2 && Math.abs(x) > span / 2 - 3) continue;
          brick(x, y * 0.5 + 0.25, z - (thick - 1) / 2, 1);
        }
        // deck on top of the arch
        for (let y = Math.ceil(archY * 2); y < rise * 2 + 4; y++) brick(x, y * 0.5 + 0.25, z - (thick - 1) / 2, 1);
        // parapet
        brick(x, rise * 2 * 0.5 + 2.6, z - (thick - 1) / 2, 1);
      }
    }
  }
  return L;
}

/** One InstancedMesh for every block, plus the Rapier bodies that drive it. */
export function makeVoxelField(scene, { RAPIER, world, blocks, friction = 1.0, restitution = 0.02, density = 1.4 }) {
  const n = blocks.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.04, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const col = new THREE.Color();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const items = [];
  const grid = new Map();
  const key = (x, y, z) => `${Math.round(x * 4)},${Math.round(y * 4)},${Math.round(z * 4)}`;

  for (let i = 0; i < n; i++) {
    const b = blocks[i];
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(b.x, b.y, b.z)
      .setCanSleep(true)
      .setLinearDamping(0.03)
      .setAngularDamping(0.08);
    const body = world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(b.sx / 2 * 0.985, b.sy / 2 * 0.985, b.sz / 2 * 0.985)
      .setFriction(friction).setRestitution(restitution).setDensity(density)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = world.createCollider(cd, body);
    body.sleep();
    col.set(b.color);
    mesh.setColorAt(i, col);
    m.compose(p.set(b.x, b.y, b.z), q, s.set(b.sx, b.sy, b.sz));
    mesh.setMatrixAt(i, m);
    const item = { i, body, collider, home: new THREE.Vector3(b.x, b.y, b.z), size: [b.sx, b.sy, b.sz], color: col.clone(), dead: false, grid: key(b.x, b.y, b.z), mass: body.mass() };
    items.push(item);
    grid.set(item.grid, item);
    collider.userData = 0;
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const byHandle = new Map();
  for (const it of items) byHandle.set(it.collider.handle, it);

  return {
    mesh, items, grid, byHandle, count: n,
    handle(it) { return it.collider.handle; },
    /** copy the simulated poses into the instance matrices; returns [moved, awake] */
    sync() {
      let moved = 0, awake = 0;
      for (const it of items) {
        if (it.dead) continue;
        const t = it.body.translation(), r = it.body.rotation();
        p.set(t.x, t.y, t.z);
        q.set(r.x, r.y, r.z, r.w);
        m.compose(p, q, s.set(it.size[0], it.size[1], it.size[2]));
        mesh.setMatrixAt(it.i, m);
        if (!it.body.isSleeping()) awake++;
        if (Math.abs(t.x - it.home.x) + Math.abs(t.y - it.home.y) + Math.abs(t.z - it.home.z) > 0.35) moved++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      return [moved, awake];
    },
    /** destroy a block: remove the body, hide the instance, wake the block above so it falls */
    destroy(it, { shatter = true } = {}) {
      if (it.dead) return;
      it.dead = true;
      world.removeRigidBody(it.body);
      m.makeScale(0, 0, 0);
      mesh.setMatrixAt(it.i, m);
      mesh.instanceMatrix.needsUpdate = true;
      grid.delete(it.grid);
      const [gx, gy, gz] = it.grid.split(",").map((v) => +v / 4);
      for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const up = grid.get(key(gx + dx, gy + 0.5, gz + dz));
        if (up && !up.dead) up.body.wakeUp();
      }
    },
    wakeNear(pos, radius = 2.2) {
      for (const it of items) {
        if (it.dead) continue;
        const t = it.body.translation();
        if (Math.abs(t.x - pos.x) < radius && Math.abs(t.y - pos.y) < radius && Math.abs(t.z - pos.z) < radius) it.body.wakeUp();
      }
    },
    dispose() {
      for (const it of items) if (!it.dead) world.removeRigidBody(it.body);
      scene.remove(mesh);
      geo.dispose(); mat.dispose();
    },
  };
}
