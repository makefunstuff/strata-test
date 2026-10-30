// Everything static, built from the layout: the chunk of earth, the painted land, the wall and its
// towers and gates, the houses, the castle, the cathedral, the market, the bridge, the mill and the
// fields' furniture. Hundreds of placed pieces go into a Batch, which merges them into one mesh per
// material — the whole town is a dozen draw calls.
import * as THREE from "three";
import {
  Batch, box, bayBox, plane, drum, spire, gableRoof, hipRoof, gableTriangle,
  merlons, ribbon, polarGrid, earthSide, mat, col,
} from "./geo.js";
import { SIZE } from "./layout.js";
import { angularFn, Rng, clamp, lerp } from "./rng.js";

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

const _m = new THREE.Matrix4();
const _mm = new THREE.Matrix4();
const _axY = new THREE.Vector3(0, 1, 0);
const _axX = new THREE.Vector3(1, 0, 0);

/** a placement matrix: position, yaw, optional scale */
function at(x, y, z, rot = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(new THREE.Euler(0, rot, 0));
  return _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}
const rotTo = (dx, dz) => Math.atan2(-dz, dx);

// ----------------------------------------------------------------------------------------------
// materials
// ----------------------------------------------------------------------------------------------

export function buildMaterials(tex) {
  const M = {};
  tex.bays.forEach((t, i) => { M["bay" + i] = mat(t, { roughness: 0.95 }); });
  M.plaster0 = mat(tex.plaster[0], { roughness: 0.96 });
  M.plaster1 = mat(tex.plaster[1], { roughness: 0.96 });
  M.stone0 = mat(tex.stone[0], { roughness: 0.93 });
  M.stone1 = mat(tex.stone[1], { roughness: 0.95 });
  M.roofTile = mat(tex.roofTile, { roughness: 0.9, side: THREE.DoubleSide });
  M.roofSlate = mat(tex.roofSlate, { roughness: 0.86, side: THREE.DoubleSide });
  M.roofThatch = mat(tex.roofThatch, { roughness: 0.98, side: THREE.DoubleSide });
  M.wood0 = mat(tex.plank[0], { roughness: 0.92 });
  M.wood1 = mat(tex.plank[1], { roughness: 0.94 });
  M.cloth = mat(null, { color: 0xffffff, roughness: 0.86, side: THREE.DoubleSide });
  M.earth = new THREE.MeshStandardMaterial({
    map: tex.strata, roughness: 1, metalness: 0, vertexColors: true,
    // the cut face points outward and downward, so the sun never reaches it: let the strata
    // light itself, or the whole diorama sits on a black skirt
    emissive: 0xffffff, emissiveMap: tex.strata, emissiveIntensity: 0.26,
  });
  M.glass = mat(null, { color: 0x2a323e, roughness: 0.32, metalness: 0.08 });
  M.ground = mat(null, { roughness: 1 });
  M.foliage = mat(null, { roughness: 0.92, flatShading: true });
  M.tree = mat(null, { roughness: 0.95, flatShading: true });
  return M;
}

/**
 * Trees: four shapes, thousands of copies. One merged low-poly geometry per kind, drawn as an
 * InstancedMesh with a per-instance colour, which is what keeps the phone warm enough to hold.
 */
function buildTrees(city, mats) {
  const group = new THREE.Group();
  group.name = "trees";
  const kinds = { oak: oakGeo, pine: pineGeo, apple: appleGeo, willow: willowGeo };
  for (const [kind, make] of Object.entries(kinds)) {
    const list = city.trees.filter((t) => t.kind === kind);
    if (!list.length) continue;
    const B = new Batch();
    make(B, new Rng(city.seed + "/tree/" + kind));
    const geo = B.merged("tree");
    if (!geo) continue;
    const mesh = new THREE.InstancedMesh(geo, mats.tree, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = "trees:" + kind;
    const m = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const ss = new THREE.Vector3();
    const pp = new THREE.Vector3();
    list.forEach((t, i) => {
      qq.setFromEuler(new THREE.Euler(0, t.rot, 0));
      ss.set(t.s, t.s * (kind === "pine" ? rngLike(i) : 1), t.s);
      pp.set(t.x, t.y - 0.1, t.z);
      mesh.setMatrixAt(i, m.compose(pp, qq, ss));
      const c = col(t.kind === "pine" ? LEAF_PINE : t.kind === "willow" ? LEAF_WILLOW : LEAF_OAK,
        [t.tint * rngLike(i + 3), t.tint * rngLike(i + 7), t.tint * 0.78]);
      mesh.setColorAt(i, new THREE.Color(c[0], c[1], c[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}
// a stable little wobble so crowns are not all the same height, without a second RNG stream
const LEAF_OAK = 0x5b7436, LEAF_PINE = 0x2f4a2b, LEAF_WILLOW = 0x6d8050;
const rngLike = (i) => 0.86 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.28;

function trunk(B, r, h) {
  B.add("tree", drum(r * 0.7, r, h, 6, 0.5), { matrix: at(0, h / 2, 0), color: col(0x53412c, 1) });
}
function blob(B, x, y, z, r, tint) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, 0.7, 1);
  B.add("tree", g, { matrix: at(x, y, z), color: col(0xffffff, tint) });
}
function oakGeo(B, r) {
  trunk(B, 0.34, 2.0);
  // a wide skirt of crown low down and a couple of lumps above: an oak, not a green balloon
  blob(B, 0, 2.25, 0, r.f(1.6, 2.1), r.f(0.78, 0.95));
  for (let i = 0; i < 2 + (r.next() > 0.5 ? 1 : 0); i++) {
    blob(B, r.f(-0.7, 0.7), 3.0 + r.f(-0.3, 0.8), r.f(-0.7, 0.7), r.f(1.0, 1.5), r.f(0.85, 1.08));
  }
}
function pineGeo(B, r) {
  trunk(B, 0.26, 1.3);
  for (let i = 0; i < 3; i++) {
    B.add("tree", spire(1.85 - i * 0.5, 2.1 - i * 0.25, 7, 0.24), { matrix: at(0, 1.15 + i * 1.35, 0), color: col(0xffffff, r.f(0.6, 0.85)) });
  }
}
function appleGeo(B, r) {
  trunk(B, 0.24, 1.2);
  for (let i = 0; i < 3; i++) blob(B, r.f(-0.5, 0.5), 1.6 + r.f(-0.2, 0.4), r.f(-0.5, 0.5), r.f(0.8, 1.1), r.f(0.66, 0.9));
  // a few apples
  for (let i = 0; i < 5; i++) {
    const g = new THREE.IcosahedronGeometry(0.16, 0);
    B.add("tree", g, { matrix: at(r.f(-1, 1), r.f(1.1, 2.2), r.f(-1, 1)), color: col(0xb03a2c, 1) });
  }
}
function willowGeo(B, r) {
  trunk(B, 0.4, 1.6);
  blob(B, 0, 2.3, 0, 1.6, 0.86);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = box(0.34, 1.9, 0.34, 0.3);
    B.add("tree", g, { matrix: at(Math.cos(a) * 1.25, 1.5, Math.sin(a) * 1.25, a), color: col(0xffffff, 0.7) });
  }
}

// ----------------------------------------------------------------------------------------------
// the land, painted top-down on one canvas: fields, furrows, roads, gardens, the shadow of the town
// ----------------------------------------------------------------------------------------------

const COVER = {
  wheat: [0xc9a955, 0xb8933f], pasture: [0x6f8f4a, 0x5d7c3f], fallow: [0x8a7250, 0x745c3e],
  meadow: [0x7d9a52, 0x6a8746], forest: [0x40613a, 0x33502f], orchard: [0x748f4c, 0x5f7a3f],
};

export function paintGround(city, { size = 2048, rng = new Rng(city.seed + "/paint") } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const { R } = city;
  // canvas y runs down, the mesh's v runs with +z, and a CanvasTexture is uploaded flipped: without
  // the negation everything painted here lands mirrored in z, which is invisible for a ring road and
  // brutal for a river, a castle compound and a contact shadow
  const S = (x, z) => [(x / (2 * R) + 0.5) * size, (0.5 - z / (2 * R)) * size];
  const px = (v) => (v / (2 * R)) * size;

  // grass base
  g.fillStyle = "#5c7540";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 26000; i++) {
    const x = rng.f(0, size), y = rng.f(0, size);
    g.fillStyle = rng.chance(0.5) ? `rgba(255,255,220,${rng.f(0.02, 0.07)})` : `rgba(30,50,20,${rng.f(0.03, 0.1)})`;
    g.fillRect(x, y, rng.f(1, 5), rng.f(1, 4));
  }
  // a little variety in the grass: heath, bogs, mown lawns
  for (let i = 0; i < 130; i++) {
    const x = rng.f(0, size), y = rng.f(0, size), r = rng.f(px(6), px(22));
    g.globalAlpha = 0.1;
    g.fillStyle = rng.pick(["#6d8248", "#5a7040", "#8a8f52", "#57683c"]);
    g.beginPath(); g.ellipse(x, y, r, r * rng.f(0.5, 1.2), rng.f(0, 3), 0, 7); g.fill();
  }
  g.globalAlpha = 1;

  // the fields: an annular sector each, hatched with furrows
  for (const [fi, f] of city.fields.entries()) {
    const cols = COVER[f.cover] || COVER.meadow;
    const rMid = (f.r0 + f.r1) / 2;
    g.save();
    g.beginPath();
    g.arc(...S(0, 0), px(f.r1), f.a0, f.a1);
    g.arc(...S(0, 0), px(f.r0), f.a1, f.a0, true);
    g.closePath();
    g.clip();
    const cx = S(0, 0)[0];
    g.fillStyle = cols[0];
    g.fill();
    // every plot gets its own wash, so the ring of fields reads as many hands and not one lawn
    const WASH = ["#c9b06a", "#7d8f4a", "#93a25c", "#8a7450", "#6f8a46", "#bda45e", "#55743f", "#a08a52"];
    g.globalAlpha = 0.26;
    g.fillStyle = WASH[(fi * 5 + Math.abs(Math.round(f.hue * 100))) % WASH.length];
    g.fillRect(cx - px(f.r1), cx - px(f.r1), px(f.r1) * 2, px(f.r1) * 2);
    g.globalAlpha = 0.5;
    g.fillStyle = cols[1];
    g.fillRect(cx - px(f.r1), cx - px(f.r1), px(f.r1) * 2, px(f.r1) * 2);
    g.globalAlpha = 1;
    // furrows / crop rows
    const spacing = f.cover === "wheat" ? px(1.6) : f.cover === "fallow" ? px(2.6) : px(5.5);
    g.strokeStyle = "rgba(0,0,0,0.11)";
    g.lineWidth = Math.max(1, spacing * 0.22);
    const ca = Math.cos(f.furrow), sa = Math.sin(f.furrow);
    const ext = px(f.r1) * 1.1;
    for (let d = -ext; d < ext; d += spacing) {
      g.beginPath();
      g.moveTo(cx + (-sa * ext) + ca * d, cx + (ca * ext) + sa * d);
      g.lineTo(cx + (sa * ext) + ca * d, cx + (-ca * ext) + sa * d);
      g.stroke();
    }
    // patchy colour so no two fields read the same
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = 0.1;
      g.fillStyle = rng.chance(0.4) ? "#e8ddac" : cols[1];
      const a = rng.f(f.a0, f.a1), r = rng.f(f.r0, f.r1);
      const [sx, sy] = S(Math.cos(a) * r, Math.sin(a) * r);
      g.beginPath(); g.ellipse(sx, sy, px(rng.f(3, 9)), px(rng.f(3, 9)), rng.f(0, 3), 0, 7); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // hedgerow shadows baked into the paint, so the field edges stay dark under the hedge geometry
  g.strokeStyle = "rgba(22,36,16,0.5)";
  for (const st of city.props.stocks) {
    if (st.kind !== "hedge") continue;
    g.lineWidth = px(1.9);
    g.beginPath();
    st.pts.forEach((p, i) => { const [sx, sy] = S(p.x, p.z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
    g.stroke();
  }

  // the town: a worn, trodden ground inside the wall
  {
    const [cx, cy] = S(0, 0);
    g.save();
    g.beginPath(); g.arc(cx, cy, px(city.wallR * 1.02), 0, 7); g.clip();
    g.fillStyle = "rgba(126,112,84,0.6)";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rng.chance(0.5) ? `rgba(190,176,140,${rng.f(0.03, 0.1)})` : `rgba(50,44,30,${rng.f(0.03, 0.1)})`;
      g.fillRect(rng.f(0, size), rng.f(0, size), rng.f(1, 6), rng.f(1, 5));
    }
    g.restore();
  }

  // roads: a soft dirt shoulder with a harder worn track, cobbles at the square
  const road = (pts, width, colour = "rgba(140,120,90,0.85)", closed = false) => {
    g.lineJoin = g.lineCap = "round";
    const pass = (w, col, alpha) => {
      g.strokeStyle = col; g.globalAlpha = alpha; g.lineWidth = px(w);
      g.beginPath();
      pts.forEach((p, i) => { const [sx, sy] = S(p.x, p.z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
      if (closed) g.closePath();
      g.stroke();
    };
    pass(width + 1.8, colour, 0.42);
    pass(width + 0.9, "rgba(158,136,102,0.95)", 0.9);
    pass(width * 0.5, "rgba(196,176,140,0.65)", 0.34);
    g.globalAlpha = 1;
    // wheel ruts and stones
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const [sx, sy] = S(p.x, p.z);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = `rgba(${rng.chance(0.5) ? "180,168,140" : "60,52,40"},${rng.f(0.08, 0.3)})`;
        g.fillRect(sx + rng.f(-px(width / 2), px(width / 2)), sy + rng.f(-px(width / 2), px(width / 2)), rng.f(1, 4), rng.f(1, 3));
      }
    }
  };
  for (const s of city.streets) road(s.pts, s.width, "rgba(140,120,90,0.85)", s.kind === "ring" && Math.abs(s.pts[0].x - s.pts[s.pts.length - 1].x) < 0.5);
  // the green in front of the castle, the market place
  {
    const [mx, my] = S(city.market.x, city.market.z);
    const grd = g.createRadialGradient(mx, my, 0, mx, my, px(city.market.r + 2));
    grd.addColorStop(0, "rgba(150,132,96,0.9)");
    grd.addColorStop(0.7, "rgba(126,110,80,0.7)");
    grd.addColorStop(1, "rgba(126,110,80,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(mx, my, px(city.market.r + 2), 0, 7); g.fill();
    for (let i = 0; i < 900; i++) {
      const a = rng.f(0, 7), r = rng.f(0, city.market.r);
      const [sx, sy] = S(city.market.x + Math.cos(a) * r, city.market.z + Math.sin(a) * r);
      g.fillStyle = `rgba(196,186,160,${rng.f(0.1, 0.35)})`;
      g.fillRect(sx, sy, rng.f(2, 5), rng.f(2, 4));
    }
  }

  // gardens and yards behind the houses, and a soft contact shadow under every footprint
  for (const h of city.houses) {
    const [hx, hy] = S(h.x, h.z);
    g.save();
    g.translate(hx, hy);
    g.rotate(-h.rot);
    const w = px(h.w), d = px(h.d);
    // the shadow, feathered outwards
    g.globalAlpha = 0.5;
    for (let k = 2; k >= 1; k--) {
      g.fillStyle = `rgba(26,22,16,${0.075 * k})`;
      const e = px(0.45 * k);
      g.fillRect(-w / 2 - e, -d / 2 - e, w + e * 2, d + e * 2);
    }
    g.globalAlpha = 1;
    // a cropped plot behind
    if (h.garden) {
      g.fillStyle = "rgba(96,110,60,0.5)";
      g.fillRect(-w / 2, d / 2, w, px(3.4));
      for (let i = 0; i < 22; i++) {
        g.fillStyle = `rgba(${rng.chance(0.5) ? "150,180,90" : "120,90,60"},${rng.f(0.2, 0.5)})`;
        g.fillRect(rng.f(-w / 2, w / 2), d / 2 + rng.f(0, px(3.4)), rng.f(2, 5), rng.f(2, 5));
      }
    }
    g.restore();
  }
  // the castle's compound: a trodden courtyard with a track to the gate
  {
    const [cx2, cy2] = S(city.castle.x, city.castle.z);
    const grd = g.createRadialGradient(cx2, cy2, 0, cx2, cy2, px(city.castle.r + 2));
    grd.addColorStop(0, "rgba(122,108,82,0.85)");
    grd.addColorStop(1, "rgba(122,108,82,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx2, cy2, px(city.castle.r + 2), 0, 7); g.fill();
  }

  // the riverbed, so the banks do not glow through the water
  {
    g.lineJoin = g.lineCap = "round";
    const surfaceW = (city.river.half || city.river.width * 0.55) * 2;
    g.strokeStyle = "rgba(52,62,60,0.98)";
    g.lineWidth = px(surfaceW * 1.12);
    g.beginPath();
    city.river.pts.forEach((p, i) => { const [sx, sy] = S(p.x, p.z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
    g.stroke();
    g.strokeStyle = "rgba(86,80,58,0.55)";
    g.lineWidth = px((city.river.wall || city.river.width * 0.7) * 2 * 1.08);
    g.stroke();
    // reeds and shingle along the banks
    for (let i = 0; i < city.river.pts.length; i += 1) {
      const p = city.river.pts[i];
      for (let k = 0; k < 8; k++) {
        const a = rng.f(0, 7), r = surfaceW * rng.f(0.5, 0.8);
        const [sx, sy] = S(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
        g.fillStyle = `rgba(${rng.chance(0.5) ? "98,116,68" : "150,140,116"},${rng.f(0.2, 0.5)})`;
        g.fillRect(sx, sy, rng.f(2, 6), rng.f(2, 4));
      }
    }
  }

  // the rim: soil showing through as the land falls away
  {
    const [cx, cy] = S(0, 0);
    const grd = g.createRadialGradient(cx, cy, px(city.R * 0.86), cx, cy, px(city.R * 1.02));
    grd.addColorStop(0, "rgba(70,56,36,0)");
    grd.addColorStop(0.65, "rgba(70,56,36,0.4)");
    grd.addColorStop(1, "rgba(48,38,24,0.75)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ----------------------------------------------------------------------------------------------
// the chunk of earth
// ----------------------------------------------------------------------------------------------

function buildBase(city, B) {
  const { R, depth } = city;
  const sectors = 168, rings = 54;
  B.add("ground", polarGrid({ rings, sectors, radiusFn: city.outline, heightFn: city.height, size: R * 2 }));
  const wob = angularFn(new Rng(city.seed + "/ew"), { harmonics: [3, 5, 9, 17], amp: 0.035 });
  const wob2 = angularFn(new Rng(city.seed + "/ew2"), { harmonics: [2, 7, 13], amp: 0.05 });
  B.add("earth", earthSide({
    rings: 7, sectors, radiusFn: city.outline, topFn: city.height, depth,
    baseScale: 0.84,
    wobble: (a, t) => wob(a) * t + wob2(a + t * 3) * t * 0.8 - 0.02 * Math.sin(a * 9) * t,
  }));
}

// ----------------------------------------------------------------------------------------------
// the wall, its towers and its gates
// ----------------------------------------------------------------------------------------------

function addTower(B, city, x, z, r, h, { roof = null, merlonsOn = true, posts = 14 } = {}) {
  const gy = city.height(x, z);
  B.add("stone1", drum(r + 0.55, r + 0.8, 2.4, posts, 0.1, { top: false }), { matrix: at(x, gy + 0.9, z) });
  B.add("stone0", drum(r, r * 0.95, h + 1.6, posts, 0.13, { top: true }), { matrix: at(x, gy + (h + 1.6) / 2 - 0.6, z) });
  // a struck-out line of arrow slits
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    B.add("wood1", box(0.35, 1.5, 0.3, 0.4), { matrix: at(x + Math.cos(a) * r * 0.98, gy + h * 0.55, z + Math.sin(a) * r * 0.98, -a) });
  }
  if (merlonsOn) {
    for (const g of merlons({ radius: r * 0.9, count: Math.max(9, Math.round(r * 2.6)), w: 0.85, h: 1.2, d: 0.75, tile: 0.16 })) {
      B.add("stone0", g, { matrix: at(x, gy + h + 1.0, z) });
    }
    B.add("stone1", drum(r * 1.02, r * 1.02, 0.35, posts, 0.14), { matrix: at(x, gy + h + 1.0, z) });
  }
  if (roof) {
    B.add(roof, spire(r * 1.3, r * 2.3, 12, 0.15), { matrix: at(x, gy + h + 1.2, z) });
  }
}

function buildWalls(city, B) {
  const wallH = 8.6, wallT = 2.9;
  const verts = city.wallVerts;
  // where the gatehouses stand, and how much of the curtain they cover: the wall is built the
  // whole way round and only interrupted by the width of a gate, so the circuit never has a hole in it
  const gates = city.gates.map((g) => {
    const roadW = g.road ? g.road.width : 4.2;
    return { x: g.x, z: g.z, half: roadW / 2 + 3.6 * 0.92 + 2.6 };
  });
  const atGate = (x, z) => gates.some((g) => Math.hypot(g.x - x, g.z - z) < g.half);
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    const a = verts[i], b = verts[j];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const ang = rotTo(dx, dz);
    const segs = Math.max(2, Math.round(len / 4));       // short stretches, so the gap can be narrow
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const sx = a.x + dx * (t0 + t1) / 2, sz = a.z + dz * (t0 + t1) / 2;
      if (atGate(sx, sz)) continue;
      const sgy = city.height(sx, sz);
      const sl = len / segs;
      B.add("stone0", box(sl, wallH, wallT, 0.12), { matrix: at(sx, sgy + wallH / 2 - 0.5, sz, ang), color: col(0xffffff, 0.97 + (s % 2) * 0.05) });
      B.add("stone1", box(sl + 0.4, 3.4, wallT + 1.7, 0.1), { matrix: at(sx, sgy + 1.1, sz, ang) });
      B.add("stone1", box(sl, 0.5, wallT * 0.7, 0.12), { matrix: at(sx, sgy + wallH - 0.3, sz, ang) });
      for (const g of merlons({ length: sl, count: Math.max(3, Math.round(sl / 2.2)), w: 1.05, h: 1.45, d: 0.95, tile: 0.16 })) {
        B.add("stone0", g, { matrix: at(sx, sgy + wallH - 0.06, sz, ang) });
      }
    }
    // a tower every couple of stretches, and always at the joints
    if (i % 2 === 1 && !atGate(a.x, a.z)) {
      const r = 4.4 + (i % 3) * 0.35;
      addTower(B, city, a.x, a.z, r, 9.6 + (i % 3) * 1.2, { roof: i % 4 === 1 ? "roofSlate" : null });
    }
  }
  // gatehouses
  for (const g of city.gates) {
    const outward = { x: Math.cos(g.a), z: Math.sin(g.a) };
    const perp = { x: -outward.z, z: outward.x };
    const roadW = g.road ? g.road.width : 4.2;
    const gy = city.height(g.x, g.z);
    const tr = 3.6;
    for (const side of [-1, 1]) {
      const tx = g.x + perp.x * side * (roadW / 2 + tr * 0.92);
      const tz = g.z + perp.z * side * (roadW / 2 + tr * 0.92);
      addTower(B, city, tx, tz, tr, 10.4, { roof: null });
    }
    // the passage block over the road, with a machicolated parapet
    const ang = rotTo(perp.x, perp.z);
    B.add("stone0", box(roadW + tr * 2 + 1, 6.2, wallT + 1.6, 0.12), { matrix: at(g.x, gy + 6.6, g.z, ang) });
    for (const m of merlons({ length: roadW + tr * 2 + 1, count: 8, w: 1.0, h: 1.3, d: 0.85, tile: 0.16 })) {
      B.add("stone0", m, { matrix: at(g.x, gy + 9.7, g.z, ang) });
    }
    // the arch and the doors
    B.add("stone1", box(roadW + 1.6, 1.2, wallT + 2.0, 0.13), { matrix: at(g.x, gy + 5.6, g.z, ang) });
    for (const side of [-1, 1]) {
      const dx = g.x + outward.x * side * (wallT * 0.5 + 0.05);
      const dz = g.z + outward.z * side * (wallT * 0.5 + 0.05);
      B.add("wood1", box(roadW - 0.4, 4.6, 0.3, 0.3), { matrix: at(dx, gy + 2.3, dz, rotTo(outward.x, outward.z)) });
      // iron banding
      for (let k = 0; k < 3; k++) {
        B.add("wood0", box(roadW - 0.4, 0.28, 0.12, 0.3), { matrix: at(dx + outward.x * 0.2, gy + 1.1 + k * 1.5, dz + outward.z * 0.2, rotTo(outward.x, outward.z)) });
      }
    }
    // hoardings over the gate
    B.add("wood1", box(roadW + tr * 2, 0.4, wallT + 3.2, 0.2), { matrix: at(g.x, gy + 10.9, g.z, ang) });
  }
}

// ----------------------------------------------------------------------------------------------
// houses
// ----------------------------------------------------------------------------------------------

function buildHouse(B, city, h) {
  const { w, d, floors } = h;
  const bayH = SIZE.bayH;
  const wallH = floors * bayH;
  const jetty = h.jetty;
  // everything about a house is measured in its own frame, then thrown into the world at once,
  // so the whole building can lean over together the way a real one does
  const q = new THREE.Quaternion().setFromAxisAngle(_axY, h.rot)
    .premultiply(new THREE.Quaternion().setFromAxisAngle(_axX, h.tilt));
  const F = new THREE.Matrix4().compose(new THREE.Vector3(h.x, h.y - 0.14, h.z), q, new THREE.Vector3(1, 1, 1));
  const P = (lx, ly, lz, rotZ = 0, sx = 1, sy = 1, sz = 1) => {
    _q.setFromAxisAngle(_axY, rotZ);
    _mm.compose(_v.set(lx, ly, lz), _q, _s.set(sx, sy, sz));
    return _m.copy(F).multiply(_mm);
  };

  // footing
  B.add("stone1", box(w + 0.2, 0.7, d + 0.2, 0.16), { matrix: P(0, 0.3, 0), color: col(0x9c9484, 0.9) });

  // the walls: ground floor, then a jettied upper storey when there is one
  const bayKey = "bay" + h.bay;
  const upperKey = "bay" + ((h.bay + 2) % 6);
  if (floors === 1 || !jetty) {
    B.add(bayKey, bayBox(w, wallH, d), { matrix: P(0, wallH / 2, 0), color: col(0xffffff, 0.94 + (h.bay % 3) * 0.04) });
  } else {
    const h1 = Math.min(wallH - 1.4, bayH * 2);
    const h2 = wallH - h1;
    B.add(bayKey, bayBox(w, h1, d), { matrix: P(0, h1 / 2, 0), color: col(0xffffff, 0.95) });
    B.add(upperKey, bayBox(w + jetty * 2, h2, d + jetty), { matrix: P(0, h1 + h2 / 2, jetty * 0.4), color: col(0xffffff, 1.02) });
    for (const lx of [-w / 2 + 0.35, 0, w / 2 - 0.35]) {
      B.add("wood1", box(0.26, h1 * 0.5, 0.26, 0.4), { matrix: P(lx, h1 * 0.25, -(d / 2 + jetty * 0.6)) });
    }
  }

  // the roof, its gables and the ridge tile
  const span = h.ridge === "z" ? w : d;
  const length = h.ridge === "z" ? d : w;
  const rise = span * 0.5 * h.rise;
  const eaveY = wallH;
  const roofZ = h.ridge === "z" ? 0 : Math.PI / 2;
  B.add(h.roof.key, gableRoof(span, length, rise, { overhang: 0.42, tile: 0.17 }), { matrix: P(0, eaveY, 0, roofZ), color: col(0xffffff, h.roof.tint) });
  for (const sg of [-1, 1]) {
    const [gx, gz] = h.ridge === "z" ? [0, sg * (d / 2 + 0.02)] : [sg * (w / 2 + 0.02), 0];
    B.add("plaster0", gableTriangle(span, rise, { tile: 0.13 }), {
      matrix: P(gx, eaveY, gz, roofZ),
      color: col(0xd8c8a6, sg > 0 ? 1.02 : 0.9),
    });
  }
  B.add("stone1", box(h.ridge === "z" ? length + 0.9 : 0.4, 0.22, h.ridge === "z" ? 0.4 : length + 0.9, 0.2), { matrix: P(0, eaveY + rise + 0.03, 0) });

  // windows: a frame and a recessed pane, on whichever faces the town generator gave them
  for (const wd of h.win) {
    const ly = wd.fy * bayH + bayH * 0.62;
    const lx = wd.axis === "x" ? -w / 2 + SIZE.bayW * (wd.b + 0.5) : wd.faceSign * (w / 2 + 0.05);
    const lz = wd.axis === "x" ? wd.faceSign * (d / 2 + 0.05) : -d / 2 + SIZE.bayW * (wd.b + 0.5);
    const rz = wd.axis === "x" ? (wd.faceSign > 0 ? 0 : Math.PI) : (wd.faceSign > 0 ? Math.PI / 2 : -Math.PI / 2);
    // the upper storeys of a jettied house stand proud of the wall below
    const push = jetty && floors > 1 && wd.fy >= 2 ? jetty * 0.9 : 0;
    const px1 = lx + (wd.axis === "z" ? wd.faceSign * push : 0);
    const pz1 = lz + (wd.axis === "x" ? wd.faceSign * push : 0);
    B.add("wood1", box(1.12, 1.32, 0.14, 0.5), { matrix: P(px1, ly, pz1, rz), color: col(0x3c2c1c, 1) });
    B.add("glass", box(0.82, 1.02, 0.16, 0.3), { matrix: P(px1, ly, pz1, rz), color: col(0xffffff, wd.fy % 2 ? 0.9 : 1.1) });
  }

  // the door on the street side (local -Z), with a porch and a workshop bay
  B.add("wood1", box(1.25, 2.1, 0.18, 0.5), { matrix: P(0, 1.05, -(d / 2 + 0.06)) });
  B.add("stone1", box(1.6, 0.24, 0.5, 0.3), { matrix: P(0, 2.2, -(d / 2 + 0.12)) });
  if (h.porch) {
    for (const lx of [-0.95, 0.95]) B.add("wood1", box(0.16, 2.2, 0.16, 0.5), { matrix: P(lx, 1.1, -(d / 2 + 0.62)) });
    B.add(h.roof.key, box(2.6, 0.16, 1.5, 0.2), { matrix: P(0, 2.4, -(d / 2 + 0.45), 0, 1, 1, 1), color: col(0xffffff, h.roof.tint) });
  }
  if (h.workshop) {
    B.add("wood0", box(1.9, 1.15, 0.16, 0.4), { matrix: P(w / 2 - 1.1, 1.75, -(d / 2 + 0.12)) });
    B.add("wood0", box(2.0, 0.12, 0.7, 0.4), { matrix: P(w / 2 - 1.1, 1.12, -(d / 2 + 0.4)), color: col(0x6c5138, 1) });
  }

  // the chimney, on the gable end that does not face the street
  if (h.chimney) {
    const lx = h.ridge === "z" ? h.chimneySide * (w * 0.3) : 0;
    const lz = h.ridge === "z" ? 0 : h.chimneySide * (d * 0.3);
    const top = wallH + rise * 0.7 + 1.2;
    B.add("stone0", box(0.92, top, 0.92, 0.18), { matrix: P(lx, top / 2, lz), color: col(0x9a9082, 1) });
    B.add("stone1", box(1.14, 0.22, 1.14, 0.2), { matrix: P(lx, top, lz) });
  }
}


// ----------------------------------------------------------------------------------------------
// the castle on its motte
// ----------------------------------------------------------------------------------------------

function buildCastle(B, city) {
  const { castle } = city;
  const base = city.height(castle.x, castle.z);
  // the stone drum the compound stands on
  B.add("stone1", drum(castle.r * 0.98, castle.r * 1.04, 2.6, 26, 0.09), { matrix: at(castle.x, base - 0.6, castle.z) });
  // the curtain
  const cH = 6.4, segs = 22;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const mx = castle.x + Math.cos(am) * castle.r, mz = castle.z + Math.sin(am) * castle.r;
    const gy = city.height(mx, mz);
    const chord = 2 * castle.r * Math.sin((a1 - a0) / 2);
    B.add("stone0", box(chord, cH, 1.9, 0.12), { matrix: at(mx, gy + cH / 2 - 0.4, mz, rotTo(-Math.sin(am), Math.cos(am))) });
    for (const m of merlons({ length: chord, count: 3, w: 0.8, h: 1.1, d: 0.7, tile: 0.16 })) {
      B.add("stone0", m, { matrix: at(mx, gy + cH - 0.1, mz, rotTo(-Math.sin(am), Math.cos(am))) });
    }
  }
  // the gate tower in the curtain
  const ga = castle.hall.rot;
  {
    const mx = castle.x + Math.cos(ga) * castle.r, mz = castle.z + Math.sin(ga) * castle.r;
    const gy = city.height(mx, mz);
    B.add("stone0", box(5.2, 8.6, 3.4, 0.12), { matrix: at(mx, gy + 4.0, mz, rotTo(-Math.sin(ga), Math.cos(ga))) });
    for (const m of merlons({ length: 5.2, count: 4, w: 0.9, h: 1.2, d: 0.8, tile: 0.16 })) {
      B.add("stone0", m, { matrix: at(mx, gy + 8.3, mz, rotTo(-Math.sin(ga), Math.cos(ga))) });
    }
    B.add("wood1", box(2.6, 3.6, 0.3, 0.3), { matrix: at(mx, gy + 1.8, mz, rotTo(-Math.sin(ga), Math.cos(ga))) });
  }
  addTower(B, city, castle.x + Math.cos(ga + 2.1) * castle.r * 0.98, castle.z + Math.sin(ga + 2.1) * castle.r * 0.98, 4.2, castle.tower.h, { roof: castle.tower.roof ? "roofSlate" : null, posts: 16 });
  addTower(B, city, castle.x + Math.cos(ga - 2.1) * castle.r * 0.98, castle.z + Math.sin(ga - 2.1) * castle.r * 0.98, 3.8, castle.tower.h * 0.86, { roof: null, posts: 14 });

  // the keep
  const k = castle.keep;
  const kx = castle.x, kz = castle.z;
  const ky = base - 0.2;
  B.add("stone1", drum(Math.max(k.w, k.d) * 0.78, Math.max(k.w, k.d) * 0.86, 2.2, 18, 0.09), { matrix: at(kx, ky + 0.4, kz) });
  B.add("stone0", box(k.w, k.h, k.d, 0.11), { matrix: at(kx, ky + k.h / 2, kz, k.rot), color: col(0xa8a094, 1) });
  // buttresses
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add("stone1", box(1.1, k.h * 0.92, 1.1, 0.12), { matrix: at(kx + (sx * (k.w / 2 - 0.2)) * Math.cos(k.rot) + (sz * (k.d / 2 - 0.2)) * Math.sin(k.rot), ky + k.h * 0.46, kz - (sx * (k.w / 2 - 0.2)) * Math.sin(k.rot) + (sz * (k.d / 2 - 0.2)) * Math.cos(k.rot), k.rot) });
  }
  // the wall-head: hoarding line, merlons, a hooped roof over the top storey
  for (const m of merlons({ length: k.w, count: Math.round(k.w / 1.6), w: 1.0, h: 1.5, d: 0.9, tile: 0.14 })) {
    B.add("stone0", m, { matrix: at(kx, ky + k.h, kz, k.rot) });
  }
  for (const m of merlons({ length: k.d, count: Math.round(k.d / 1.6), w: 1.0, h: 1.5, d: 0.9, tile: 0.14 })) {
    B.add("stone0", m, { matrix: at(kx, ky + k.h, kz, k.rot + Math.PI / 2) });
  }
  B.add("stone1", box(k.w + 0.9, 0.5, k.d + 0.9, 0.12), { matrix: at(kx, ky + k.h - 0.35, kz, k.rot) });
  // the timber hoarding and a lantern turret on top
  B.add("wood0", box(k.w * 0.7, 1.6, k.d * 0.7, 0.2), { matrix: at(kx, ky + k.h + 1.6, kz, k.rot) });
  B.add("roofSlate", hipRoof(k.w * 0.78, k.d * 0.78, 1.9, { overhang: 0.35, tile: 0.16 }), { matrix: at(kx, ky + k.h + 2.4, kz, k.rot) });
  // windows up the keep
  for (let f = 0; f < 4; f++) {
    for (const lx of [-k.w * 0.25, k.w * 0.25]) {
      const wy = ky + 3 + f * 3.1;
      if (wy > ky + k.h - 1.6) break;
      const c = Math.cos(k.rot), s2 = Math.sin(k.rot);
      const wx = kx + lx * c - (k.d / 2 + 0.1) * s2, wz = kz - lx * s2 - (k.d / 2 + 0.1) * c;
      B.add("wood1", box(0.9, 1.5, 0.25, 0.4), { matrix: at(wx, wy, wz, k.rot) });
    }
  }
  // the great hall
  const hall = castle.hall;
  const hx = castle.x + Math.cos(ga + Math.PI) * castle.r * 0.52;
  const hz = castle.z + Math.sin(ga + Math.PI) * castle.r * 0.52;
  const hy = city.height(hx, hz);
  const hallRot = ga + Math.PI / 2;
  B.add("plaster0", box(hall.w, hall.h, hall.d, 0.13), { matrix: at(hx, hy + hall.h / 2, hz, hallRot), color: col(0xd6c6a4, 1) });
  B.add("roofThatch", gableRoof(hall.w, hall.d, hall.w * 0.55, { overhang: 0.5, tile: 0.16 }), { matrix: at(hx, hy + hall.h, hz, hallRot) });
  for (const sg of [-1, 1]) {
    B.add("plaster1", gableTriangle(hall.w, hall.w * 0.55, { tile: 0.13 }), { matrix: at(hx + Math.cos(hallRot + Math.PI / 2) * sg * hall.d / 2, hy + hall.h, hz - Math.sin(hallRot + Math.PI / 2) * sg * hall.d / 2, hallRot + Math.PI / 2), color: col(0xd0bfa0, 1) });
  }
  // a chapel, a well, and the keep's kitchen smoke
  const chx = castle.x + Math.cos(ga + 1.1) * castle.r * 0.56, chz = castle.z + Math.sin(ga + 1.1) * castle.r * 0.56;
  const chy = city.height(chx, chz);
  B.add("stone1", box(4.4, 4.2, 6.4, 0.13), { matrix: at(chx, chy + 2.1, chz, ga) });
  B.add("roofSlate", gableRoof(4.8, 6.8, 2.2, { overhang: 0.3, tile: 0.17 }), { matrix: at(chx, chy + 4.2, chz, ga) });
  B.add("stone0", drum(1.5, 1.6, 2.0, 10, 0.16), { matrix: at(castle.x + Math.cos(ga - 1.0) * castle.r * 0.5, city.height(castle.x, castle.z) + 0.6, castle.z + Math.sin(ga - 1.0) * castle.r * 0.5) });
}

// ----------------------------------------------------------------------------------------------
// the cathedral
// ----------------------------------------------------------------------------------------------

function buildCathedral(B, city) {
  const c = city.cathedral;
  if (!c) return;
  const { nave, aisle, tower, transept } = c;
  const y = city.height(c.x, c.z) - 0.1;
  const c2 = Math.cos(c.rot), s2 = Math.sin(c.rot);
  const L = (lx, lz) => [c.x + lx * c2 + lz * s2, c.z - lx * s2 + lz * c2];
  const stone = col(0xa9a292, 1), stoneDark = col(0x8f8878, 1);

  // the nave, with aisles along both sides
  B.add("stone0", box(nave.w, nave.h, nave.d, 0.09), { matrix: at(c.x, y + nave.h / 2, c.z, c.rot), color: stone });
  for (const sg of [-1, 1]) {
    const [ax, az] = L(sg * (nave.w / 2 + aisle.h * 0.55), 0);
    B.add("stone1", box(aisle.h * 1.1, aisle.h, nave.d * 0.9, 0.1), { matrix: at(ax, y + aisle.h / 2, az, c.rot), color: stoneDark });
    B.add("roofSlate", gableRoof(aisle.h * 1.2, nave.d * 0.92, aisle.h * 0.5, { overhang: 0.3, tile: 0.16 }), { matrix: at(ax, y + aisle.h, az, c.rot) });
  }
  // the nave roof and clerestory
  B.add("roofSlate", gableRoof(nave.w + 0.6, nave.d + 0.6, nave.w * 0.42, { overhang: 0.45, tile: 0.14 }), { matrix: at(c.x, y + nave.h, c.z, c.rot), color: col(0xffffff, 0.94) });
  // the apse at the far end
  const [ax2, az2] = L(0, nave.d / 2);
  B.add("stone0", drum(nave.w * 0.44, nave.w * 0.46, nave.h * 0.9, 12, 0.1, { top: false }), { matrix: at(ax2, y + nave.h * 0.45, az2, c.rot) });
  B.add("roofSlate", spire(nave.w * 0.5, nave.w * 0.36, 12, 0.15), { matrix: at(ax2, y + nave.h * 0.9, az2, c.rot) });
  // the transept, and the crossing tower with its spire
  const [tx, tz] = L(0, nave.d * 0.14);
  B.add("stone0", box(transept.w, nave.h * 0.92, transept.d, 0.09), { matrix: at(tx, y + nave.h * 0.46, tz, c.rot), color: stone });
  B.add("roofSlate", gableRoof(transept.w, transept.d + 0.4, 2.4, { overhang: 0.35, tile: 0.14 }), { matrix: at(tx, y + nave.h * 0.92, tz, c.rot) });
  const [wx, wz] = L(0, nave.d * 0.14);
  B.add("stone1", box(tower.w, tower.h, tower.w, 0.09), { matrix: at(wx, y + tower.h / 2, wz, c.rot), color: stoneDark });
  for (const m of merlons({ length: tower.w, count: 4, w: 0.8, h: 1.0, d: 0.7, tile: 0.15 })) {
    B.add("stone0", m, { matrix: at(wx, y + tower.h, wz, c.rot) });
    B.add("stone0", m, { matrix: at(wx, y + tower.h, wz, c.rot + Math.PI / 2) });
  }
  B.add("roofSlate", spire(tower.w * 0.82, tower.spire, 8, 0.14), { matrix: at(wx, y + tower.h + 0.9, wz, c.rot) });
  // buttresses down both flanks
  const nB = Math.max(3, Math.round(nave.d / 5));
  for (let i = 0; i < nB; i++) {
    const lz = -nave.d / 2 + (i + 0.5) * (nave.d / nB);
    for (const sg of [-1, 1]) {
      const [bx, bz] = L(sg * (nave.w / 2 + 0.55), lz);
      B.add("stone1", box(1.1, nave.h * 0.86, 1.2, 0.12), { matrix: at(bx, y + nave.h * 0.43, bz, c.rot), color: stoneDark });
      B.add("stone1", box(0.7, 1.0, 0.8, 0.12), { matrix: at(bx, y + nave.h * 0.88, bz, c.rot) });
    }
  }
  // the west door and a rose window
  const [dx, dz] = L(0, -(nave.d / 2 + 0.15));
  B.add("wood1", box(2.6, 4.4, 0.35, 0.3), { matrix: at(dx, y + 2.2, dz, c.rot) });
  B.add("stone1", box(4.2, 0.6, 0.7, 0.15), { matrix: at(dx, y + 4.7, dz, c.rot) });
  const rose = new THREE.CircleGeometry(2.0, 14);
  rose.applyMatrix4(at(dx, y + nave.h * 0.72, dz, c.rot));
  B.add("stone1", rose, { color: col(0x39435c, 1) });
  // the churchyard wall
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rx = c.x + Math.cos(a) * (transept.w / 2 + 4.5), rz = c.z + Math.sin(a) * (nave.d / 2 + 4.5);
    if (!city.insideWall(rx, rz)) continue;
    const ry = city.height(rx, rz);
    B.add("stone1", box(2.4, 1.5, 0.6, 0.16), { matrix: at(rx, ry + 0.7, rz, a + Math.PI / 2), color: col(0x8f8878, 1) });
  }
}

// ----------------------------------------------------------------------------------------------
// the market, the bridge, the mill, and the furniture of the fields
// ----------------------------------------------------------------------------------------------

function buildMarket(city, B) {
  const { market, marketCross } = city;
  // the cross on its steps
  const y = marketCross.y;
  for (let i = 0; i < 3; i++) {
    B.add("stone1", box(3.4 - i * 0.7, 0.32, 3.4 - i * 0.7, 0.18), { matrix: at(market.x, y + 0.16 + i * 0.32, market.z, 0.4) });
  }
  B.add("stone0", drum(0.45, 0.52, marketCross.h - 2.2, 10, 0.15), { matrix: at(market.x, y + 1.0 + (marketCross.h - 2.2) / 2, market.z) });
  B.add("stone0", box(1.5, 0.4, 0.4, 0.16), { matrix: at(market.x, y + marketCross.h - 1.6, market.z) });
  B.add("stone1", box(0.4, 1.2, 0.4, 0.16), { matrix: at(market.x, y + marketCross.h - 1.0, market.z) });
  B.add("stone1", drum(0.75, 0.5, 0.9, 8, 0.16), { matrix: at(market.x, y + marketCross.h - 0.2, market.z) });
  // stalls: trestles, a board, goods, and a striped canopy on poles
  for (const st of city.stalls) {
    const y2 = st.y;
    for (const lx of [-st.w * 0.35, st.w * 0.35]) {
      const c = Math.cos(st.rot), s = Math.sin(st.rot);
      const px1 = st.x + lx * c, pz1 = st.z - lx * s;
      B.add("wood1", box(st.w * 0.9, 0.16, 1.0, 0.35), { matrix: at(px1, y2 + 0.95, pz1, st.rot) });
      for (const leg of [-1, 1]) {
        B.add("wood1", box(0.14, 0.95, 0.14, 0.4), { matrix: at(px1 + leg * st.w * 0.35 * c, y2 + 0.47, pz1 - leg * st.w * 0.35 * s, st.rot) });
      }
    }
    // goods on the board
    for (let i = 0; i < 4; i++) {
      const c = Math.cos(st.rot), s = Math.sin(st.rot);
      const lx = (i - 1.5) * 0.55;
      B.add("cloth", box(0.42, 0.3, 0.42, 0.4), { matrix: at(st.x + lx * c + 0.1 * s, y2 + 1.2, st.z - lx * s + 0.1 * c, st.rot), color: col(PALETTESgoods[i % PALETTESgoods.length], 1) });
    }
    for (const lx of [-st.w * 0.45, st.w * 0.45]) {
      const c = Math.cos(st.rot), s = Math.sin(st.rot);
      B.add("wood1", box(0.12, 2.4, 0.12, 0.4), { matrix: at(st.x + lx * c, y2 + 1.2, st.z - lx * s, st.rot) });
    }
    B.add("cloth", box(st.w + 0.5, 0.1, 1.6, 0.3), { matrix: at(st.x, y2 + 2.4, st.z, st.rot), color: col(st.cloth, 1) });
  }
  // the town well
  const wx = market.x + market.r * 0.55, wz = market.z - market.r * 0.4;
  const wy = city.height(wx, wz);
  B.add("stone1", drum(1.0, 1.05, 0.95, 12, 0.18), { matrix: at(wx, wy + 0.45, wz) });
  for (const sg of [-1, 1]) B.add("wood1", box(0.16, 2.0, 0.16, 0.4), { matrix: at(wx + sg * 0.8, wy + 1.4, wz) });
  B.add("wood0", box(2.0, 0.18, 0.18, 0.4), { matrix: at(wx, wy + 2.35, wz) });
  B.add("roofThatch", gableRoof(2.2, 1.5, 0.7, { overhang: 0.25, tile: 0.2 }), { matrix: at(wx, wy + 2.4, wz) });
}
const PALETTESgoods = [0xc4483a, 0x6f9c4a, 0xd8b24a, 0x8a5a9c];

function buildBridges(city, B) {
  for (const b of city.bridges) {
    const across = b.flow + Math.PI / 2;                    // a bridge is built square to the current
    const ang = rotTo(Math.cos(across), Math.sin(across));
    const half = b.span / 2;
    // the deck, crowned
    const deckY = b.deck;
    B.add("stone1", box(b.width, 0.6, b.span, 0.12), { matrix: at(b.x, deckY, b.z, ang) });
    // parapets on the upstream and downstream edges, so they run with the current
    for (const sg of [-1, 1]) {
      B.add("stone0", box(0.55, 1.3, b.span, 0.14), { matrix: at(b.x + Math.cos(b.flow) * sg * (b.width / 2), deckY + 0.85, b.z + Math.sin(b.flow) * sg * (b.width / 2), ang) });
    }
    // two piers in the bed, spread along the span, with a cutwater under each
    for (const sg of [-1, 1]) {
      const px1 = b.x + Math.cos(across) * sg * half * 0.5;
      const pz1 = b.z + Math.sin(across) * sg * half * 0.5;
      B.add("stone1", drum(1.1, 1.3, 5.5, 10, 0.12), { matrix: at(px1, deckY - 2.6, pz1) });
      B.add("stone1", coneDown(1.3, 1.6), { matrix: at(px1, deckY - 5.2, pz1) });
    }
  }
}
function coneDown(r, h) {
  const g = drum(r, 0.2, h, 10, 0.12, { top: false, bottom: false });
  g.rotateX(Math.PI);
  return g;
}

function buildProps(city, B) {
  // barns and granaries out in the fields
  for (const b of city.props.barns) {
    B.add("plaster1", box(b.w, b.h, b.d, 0.12), { matrix: at(b.x, b.y + b.h / 2, b.z, b.rot), color: col(0xcbb994, 0.95) });
    B.add(b.roof.key, gableRoof(b.w + 0.5, b.d + 0.5, b.w * 0.52, { overhang: 0.5, tile: 0.15 }), { matrix: at(b.x, b.y + b.h, b.z, b.rot), color: col(0xffffff, b.roof.tint) });
    for (const sg of [-1, 1]) {
      B.add("plaster0", gableTriangle(b.w, b.w * 0.52, { tile: 0.13 }), { matrix: at(b.x + Math.cos(b.rot + Math.PI / 2) * sg * b.d / 2, b.y + b.h, b.z - Math.sin(b.rot + Math.PI / 2) * sg * b.d / 2, b.rot + Math.PI / 2) });
    }
    B.add("wood1", box(b.w * 0.45, b.h * 0.7, 0.2, 0.3), { matrix: at(b.x - Math.sin(b.rot) * (b.d / 2 + 0.1), b.y + b.h * 0.35, b.z + Math.cos(b.rot) * (b.d / 2 + 0.1), b.rot) });
  }
  // haystacks
  for (const h of city.props.haystacks) {
    B.add("roofThatch", drum(h.r, h.r * 0.72, h.r * 1.5, 9, 0.2), { matrix: at(h.x, h.y + h.r * 0.75, h.z, h.rot), color: col(0xc2a05a, 1) });
  }
  // hedgerows and fences: a low green bank, instanced later; here the stone-faced ones
  for (const st of city.props.stocks) {
    const { pts } = st;
    if (st.kind === "hedge") {
      B.add("foliage", ribbon(pts, 1.3, { heightFn: (x, z) => city.height(x, z) - 0.25, lift: 0.55, tile: 0.25 }), { color: col(0x36492a, 1) });
    } else {
      // posts and two rails
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b2 = pts[i + 1];
        const len = Math.hypot(b2.x - a.x, b2.z - a.z);
        const ang = rotTo(b2.x - a.x, b2.z - a.z);
        const mx = (a.x + b2.x) / 2, mz = (a.z + b2.z) / 2;
        const gy = city.height(mx, mz);
        B.add("wood1", box(len, 0.14, 0.12, 0.4), { matrix: at(mx, gy + 1.0, mz, ang) });
        B.add("wood1", box(len, 0.14, 0.12, 0.4), { matrix: at(mx, gy + 0.55, mz, ang) });
        B.add("wood1", box(0.16, 1.3, 0.16, 0.4), { matrix: at(a.x, city.height(a.x, a.z) + 0.65, a.z) });
      }
    }
  }
  // the mill on the hill
  const wm = city.props.windmill;
  if (wm) {
    B.add("stone1", drum(wm.r * 0.62, wm.r * 0.8, wm.h, 14, 0.11), { matrix: at(wm.x, wm.y + wm.h / 2 - 0.4, wm.z) });
    B.add("stone0", drum(wm.r * 0.66, wm.r * 0.62, 0.6, 14, 0.12), { matrix: at(wm.x, wm.y + 0.4, wm.z) });
    B.add("roofThatch", spire(wm.r * 0.72, wm.r * 1.1, 12, 0.16), { matrix: at(wm.x, wm.y + wm.h, wm.z, wm.rot) });
    B.add("wood1", box(1.2, 2.1, 0.25, 0.4), { matrix: at(wm.x + Math.cos(wm.rot) * wm.r * 0.62, wm.y + 1.1, wm.z + Math.sin(wm.rot) * wm.r * 0.62, wm.rot) });
  }
}

// ----------------------------------------------------------------------------------------------
// the entry point
// ----------------------------------------------------------------------------------------------

export function buildStatic(city, tex, { groundSize = 2048 } = {}) {
  const mats = buildMaterials(tex);
  const groundTex = paintGround(city, { size: groundSize });
  mats.ground = mat(groundTex, { roughness: 1 });
  const B = new Batch();
  buildBase(city, B);
  buildWalls(city, B);
  for (const h of city.houses) buildHouse(B, city, h);
  buildCastle(B, city);
  buildCathedral(B, city);
  buildMarket(city, B);
  buildBridges(city, B);
  buildProps(city, B);
  const group = B.build({ materials: mats, name: "town" });
  group.add(buildTrees(city, mats));
  return { group, mats, batch: B, stats: { ...B.stats, drawCalls: group.children.length } };
}
