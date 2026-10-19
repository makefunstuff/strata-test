// The 12 x 12 field: tiles, rock layout, BFS route from entrance to exit, placement rules,
// and picking. Enemies walk the route; towers occupy tiles; a placement that would leave no
// route is refused, and the route is repainted when it changes so re-routing is visible.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { grassTexture, noiseTexture, stoneTexture, stripesTexture, glowTexture } from "../shared/textures.js";

export const N = 12;
export const TILE = 1;
export const ENTRANCE = [0, 2];
export const EXIT = [11, 9];
export const COST = 25;
export const RANGE = 2.4;          // tower range, in tiles: the cursor ring and the towers agree on this
export const START_MONEY = 100;

// rock gardens: cover, not a sealed maze — every row keeps a gap
export const ROCKS = [
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 5], [3, 6], [3, 7],
  [6, 3], [6, 4], [6, 5], [6, 6], [6, 8], [6, 9], [6, 10],
  [9, 1], [9, 2], [9, 3], [9, 6], [9, 7], [9, 8], [9, 9],
  [1, 7], [5, 10], [8, 11], [10, 4],
];

export const idx = (c, r) => r * N + c;
export const inBounds = (c, r) => c >= 0 && r >= 0 && c < N && r < N;
export const world = (c, r) => ({ x: (c - (N - 1) / 2) * TILE, z: (r - (N - 1) / 2) * TILE });
export const isGate = (c, r) => (c === ENTRANCE[0] && r === ENTRANCE[1]) || (c === EXIT[0] && r === EXIT[1]);

/** Breadth-first shortest route over walkable tiles, 4-neighbourhood. */
function bfs(blocked) {
  const prev = new Int16Array(N * N).fill(-1);
  const seen = new Uint8Array(N * N);
  const start = idx(...ENTRANCE), goal = idx(...EXIT);
  const queue = [start];
  seen[start] = 1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const c = cur % N, r = (cur - c) / N;
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (!inBounds(nc, nr)) continue;
      const k = idx(nc, nr);
      if (seen[k] || blocked.has(k)) continue;
      seen[k] = 1;
      prev[k] = cur;
      queue.push(k);
    }
  }
  if (!seen[goal]) return null;
  const path = [];
  for (let k = goal; k !== -1; k = prev[k]) path.push([k % N, (k - (k % N)) / N]);
  path.reverse();
  return path;
}

export function createGrid(scene) {
  const rocks = new Set(ROCKS.map(([c, r]) => idx(c, r)));
  const towers = new Set();

  // The board is the brightest thing on the tube, and the path tint multiplied by a green grass
// map comes out olive, so the lane you must read is the least readable thing in the frame.
// Darker, cooler turf, and the path tint pushed warm and bright so the lane separates.
const grass = grassTexture({ base: "#25462c" });
  grass.repeat.set(N / 2, N / 2);
  const rough = noiseTexture({ size: 256, octaves: 3, contrast: 1.2, base: 0.62 });
  rough.repeat.set(N / 2, N / 2);

  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE * 0.97, 0.16, TILE * 0.97),
    new THREE.MeshStandardMaterial({ map: grass, roughnessMap: rough, roughness: 0.92, metalness: 0.04, envMapIntensity: 0.5 }),
    N * N,
  );
  tiles.receiveShadow = true;
  tiles.name = "tiles";
  const dummy = new THREE.Object3D();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = world(c, r);
      dummy.position.set(p.x, 0, p.z);
      dummy.updateMatrix();
      tiles.setMatrixAt(idx(c, r), dummy.matrix);
    }
  }
  scene.add(tiles);

  const TINT = {
    grass: new THREE.Color("#3c7448"),
    path: new THREE.Color("#e6c184"),
    rock: new THREE.Color("#59636f"),
    gate: new THREE.Color("#ff3fa4"),
    exit: new THREE.Color("#3dff8b"),
    tower: new THREE.Color("#7fd7ff"),
  };

  // rock blocks: merged, one draw call, each jittered so the row is not a wall of cubes
  const rockGeoms = [];
  const stone = stoneTexture({ base: "#5c6672", cracks: 120 });
  stone.repeat.set(1, 1);
  for (const [c, r] of ROCKS) {
    const p = world(c, r);
    const g = new THREE.BoxGeometry(TILE * 0.82, 0.55 + ((c * 7 + r * 13) % 5) * 0.05, TILE * 0.82);
    g.translate(p.x, 0.34, p.z);
    rockGeoms.push(g);
  }
  const rockMesh = new THREE.Mesh(
    mergeGeometries(rockGeoms),
    new THREE.MeshStandardMaterial({ color: 0x8a94a2, map: stone, roughness: 0.75, metalness: 0.15, envMapIntensity: 0.7 }),
  );
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  // entrance and exit: an arch each, so the flow of the lane is obvious at a glance
  function gate([c, r], color) {
    const p = world(c, r);
    const g = new THREE.Group();
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.075, 10, 28, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x12202c, emissive: color, emissiveIntensity: 1.5, roughness: 0.4, metalness: 0.5 }),
    );
    arch.position.set(p.x, 0.1, p.z);
    arch.castShadow = true;
    g.add(arch);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9),
      new THREE.MeshBasicMaterial({
        map: stripesTexture({ a: `#${color.toString(16).padStart(6, "0")}`, b: "#120a14", bands: 6 }),
        transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(p.x, 0.09, p.z);
    g.add(floor);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(p.x, 0.12, p.z);
    g.add(halo);
    scene.add(g);
    return { group: g, halo: halo.material, arch: arch.material };
  }
  const entrance = gate(ENTRANCE, 0xff3fa4);
  const exitGate = gate(EXIT, 0x3dff8b);

  // the keyboard/mouse cursor: a frame on the ground plus a range ring
  const cursor = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.RingGeometry(TILE * 0.42, TILE * 0.48, 4, 1, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  frame.rotation.x = -Math.PI / 2;
  frame.rotation.z = Math.PI / 4;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RANGE - 0.14, RANGE, 64),
    new THREE.MeshBasicMaterial({ color: 0x7fd7ff, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  cursor.add(frame, ring);
  cursor.position.y = 0.1;
  scene.add(cursor);

  let routeCache = bfs(rocks);
  const blockedScratch = new Set();

  function paint() {
    const onRoute = new Set((routeCache ?? []).map(([c, r]) => idx(c, r)));
    const col = new THREE.Color();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const k = idx(c, r);
        if (isGate(c, r)) col.copy(c === ENTRANCE[0] ? TINT.gate : TINT.exit);
        else if (rocks.has(k)) col.copy(TINT.rock);
        else if (towers.has(k)) col.copy(TINT.tower);
        else if (onRoute.has(k)) col.copy(TINT.path);
        else {
          // deterministic per-tile tint, so the meadow has patches instead of one flat swatch
          const h = ((((c * 73856093) ^ (r * 19349663)) >>> 8) % 100) / 100;
          col.copy(TINT.grass).offsetHSL(0.02 * (h - 0.5), 0.08 * (h - 0.5), 0.075 * (h - 0.5));
        }
        tiles.setColorAt(k, col);
      }
    }
    tiles.instanceColor.needsUpdate = true;
  }
  paint();

  function route() { return routeCache; }

  function canPlace(c, r) {
    if (!inBounds(c, r)) return { ok: false, why: "off the field" };
    const k = idx(c, r);
    if (rocks.has(k)) return { ok: false, why: "rock here" };
    if (towers.has(k)) return { ok: false, why: "tower here" };
    if (isGate(c, r)) return { ok: false, why: "that is a gate" };
    blockedScratch.clear();
    for (const k of rocks) blockedScratch.add(k);
    for (const t of towers) blockedScratch.add(t);
    blockedScratch.add(k);
    if (!bfs(blockedScratch)) return { ok: false, why: "that would seal the lane" };
    return { ok: true };
  }

  function place(c, r) {
    towers.add(idx(c, r));
    routeCache = bfs(rocks);
    paint();
  }

  function show(c, r, afford) {
    const p = world(c, r);
    cursor.position.set(p.x, 0.1, p.z);
    frame.material.color.set(afford ? 0x8dffc4 : 0xff5a6e);
    ring.material.color.set(afford ? 0x7fd7ff : 0xff5a6e);
  }
  function hide() { cursor.visible = false; }
  function showCursor() { cursor.visible = true; }

  return {
    tiles, rocks, towers, route, paint, canPlace, place, show, hide, showCursor,
    entrance, exitGate,
    pick(raycaster) {
      const hits = raycaster.intersectObject(tiles, false);
      if (!hits.length) return null;
      const k = hits[0].instanceId;
      return { col: k % N, row: (k - (k % N)) / N };
    },
  };
}
