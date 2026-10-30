// The plan of Tallinn, in local metres around the Town Hall (+x east, +z south, -z north).
//
// The fabric is real: 700-odd building footprints, the street centre-lines and the surviving wall
// fragments come from OpenStreetMap (see tools/bake-tallinn.mjs, © OpenStreetMap contributors,
// ODbL) and are baked into osm.js. The landmarks are hand-placed at their surveyed positions with
// their real dimensions, and the hill, the wall ring, the quay and the squares are hand-traced from
// the same extract. House *shapes* are procedural; where they stand is not.
import { Rng, clamp, lerp, smoothstep } from "../6-medieval-diorama/rng.js";
import { HOUSES, FRINGE, STREETS, OLD_TOWN_RING } from "./osm.js";
import { makeTerrain, polyDist, coastZ } from "./terrain.js";

export const GROUND_SEED = "tallinn";

/** what the UI lists, what the tour walks and what the camera flies to */
export const LANDMARKS = [
  {
    id: "raekoda", name: "Town Hall", et: "Tallinna raekoda", x: 1, z: 22, rot: 0, year: "1404",
    w: 38, d: 15, stop: 1, kind: "townhall",
    blurb: "The only Gothic town hall in Northern Europe still standing whole. Its 64 m spire has carried Old Thomas — a town guardsman with a sword — since 1530.",
  },
  {
    id: "raekoja-plats", name: "Town Hall Square", et: "Raekoja plats", x: -6, z: -22, rot: 0,
    year: "1248", w: 95, d: 80, stop: 2, kind: "square",
    blurb: "Market, tournament ground, fire-watch and pillory: the square is older than the hall that later grew into its south side, and it is still the town's living room.",
  },
  {
    id: "oleviste", name: "St Olaf's Church", et: "Oleviste kirik", x: 147, z: -457, rot: 0.15,
    year: "1267", w: 22, d: 34, stop: 3, kind: "oleviste",
    blurb: "Merchants' church raised to 150 m around 1500 — for a while perhaps the tallest building on earth. Lightning has hit the spire at least eight times.",
  },
  {
    id: "niguliste", name: "St Nicholas' Church", et: "Niguliste kirik", x: -142, z: 144, rot: 0.2,
    year: "1261", w: 21, d: 33, stop: 4, kind: "niguliste",
    blurb: "The great merchants' church of the Lower Town. Blown up in 1944 and rebuilt as a museum and concert hall; Bernt Notke's Dance of Death still hangs in the dark.",
  },
  {
    id: "puhavaimu", name: "Holy Spirit Church", et: "Püha Vaimu kirik", x: 24, z: -100, rot: -0.25,
    year: "1237", w: 20, d: 30, stop: 5, kind: "puhavaimu",
    blurb: "A white baroque front with two needle towers, finished in 1770. Next door, the 1319 almshouse behind the gate is the oldest social building in the city.",
  },
  {
    id: "viru", name: "Viru Gate", et: "Viru värav", x: 282, z: 71, rot: 1.35, year: "c. 1350",
    w: 26, d: 20, stop: 6, kind: "viru",
    blurb: "Twin gate towers with a passage and a bridge over the harbour road — the first thing every traveller from the east saw, and a gun platform when it mattered.",
  },
  {
    id: "toompea", name: "Toompea Castle", et: "Toompea loss", x: -448, z: 161, rot: 0.12,
    year: "1227", w: 90, d: 78, stop: 7, kind: "castle",
    blurb: "A stone castle the Danish king raised in 1227 on a hill that had been a pagan stronghold. The parliament still sits behind the same limestone wall.",
  },
  {
    id: "hermann", name: "Tall Hermann", et: "Pikk Hermann", x: -474, z: 228, rot: 0.12,
    year: "1466", w: 12, d: 12, stop: 8, kind: "hermann",
    blurb: "The 48 m red-brick keep of Toompea, with a white gallery and a tall spire. The flag above it has been raised, hauled down and raised again across five occupations.",
  },
  {
    id: "nevski", name: "Alexander Nevsky Cathedral", et: "Aleksander Nevski katedraal",
    x: -339, z: 163, rot: 0.08, year: "1900", w: 30, d: 38, stop: 9, kind: "nevski",
    blurb: "Raised 1894–1900 while Estonia was a province of Russia, planted squarely opposite the Lutheran cathedral: eleven onion domes and a bell tower anyone may climb.",
  },
  {
    id: "toomkirik", name: "St Mary's Cathedral", et: "Toomkirik", x: -348, z: 16, rot: 0.06,
    year: "1233", w: 20, d: 46, stop: 10, kind: "toomkirik",
    blurb: "The old Dome Church of the German parish — whitewashed, with a baroque spire on the west tower and the epitaphs of two centuries of Baltic nobility on its walls.",
  },
  {
    id: "kiek", name: "Kiek in de Kök", et: "Kiek in de Kök", x: -228, z: 278, rot: 0.3,
    year: "1475", w: 17, d: 17, stop: 11, kind: "kiek",
    blurb: "The wall's biggest artillery tower: 17 m across with 4 m walls. The name is cheeky Low German — 'peek into the kitchen' — from the view the garrison had of the roofs.",
  },
  {
    id: "margareeta", name: "Fat Margaret", et: "Paks Margareeta", x: 241, z: -596, rot: 0,
    year: "1530", w: 25, d: 25, stop: 12, kind: "margareeta",
    blurb: "The harbour gate's artillery tower: 25 m wide, 5 m of wall, built to make the sea obey. Never taken; today the maritime museum and the Great Coastal Gate.",
  },
  {
    id: "katariina", name: "St Catherine's Church", et: "Püha Katariina kirik", x: 181, z: -58, rot: 0.1,
    year: "1240s", w: 18, d: 32, stop: 13, kind: "katariina",
    blurb: "The Dominican church down Katariina käik, the cobbled alley behind it. Its spire came down in the great storm of 1775 and was never rebuilt.",
  },
  {
    id: "suurgild", name: "Great Guild Hall", et: "Suurgild", x: 104, z: -262, rot: -1.15,
    year: "1410", w: 15, d: 26, stop: 0, kind: "guild",
    blurb: "The house of the merchant guild on Pikk — the strongest, richest facade on the street, its late-Gothic door and vaults paid for with wax, herring and rye.",
  },
  {
    id: "jaani", name: "St John's Church", et: "Jaani kirik", x: 7, z: 387, rot: 0.05,
    year: "1233", w: 16, d: 30, stop: 0, kind: "jaani",
    blurb: "The oldest stone room in the city, raised outside the wall for the leper hospital of the Holy Spirit, with a low tower and a churchyard of flat graves.",
  },
  {
    id: "linnahall", name: "Linnahall", et: "Linnahall", x: 400, z: -688, rot: 0.28,
    year: "1980", w: 190, d: 84, stop: 0, kind: "linnahall",
    blurb: "A concrete sea-wall of a hall built for the sailing events of the 1980 Olympics, parked across the harbour front where the old warehouses stood.",
  },
];

/** hand-traced open ground: cobbled, grassed or paved, with what stands on it */
export const SQUARES = [
  { id: "raekoja", name: "Raekoja plats", x: -4, z: -18, w: 96, d: 78, rot: 0.03, surface: "cobble", market: true },
  { id: "lossi", name: "Lossi plats", x: -344, z: 96, w: 62, d: 84, rot: 0.06, surface: "paving" },
  { id: "kohtu", name: "Kohtu plats", x: -300, z: 246, w: 54, d: 40, rot: 0.25, surface: "grass", trees: 12 },
  { id: "puhavaimu", name: "Püha Vaimu plats", x: 34, z: -122, w: 40, d: 32, rot: -0.2, surface: "cobble" },
  { id: "vabaduse", name: "Vabaduse väljak", x: -66, z: 388, w: 150, d: 110, rot: 0.02, surface: "paving", trees: 14 },
  { id: "viru", name: "Viru väljak", x: 316, z: 84, w: 56, d: 62, rot: 1.3, surface: "paving" },
  { id: "rae", name: "Rae plats", x: 62, z: 62, w: 34, d: 30, rot: 0.1, surface: "cobble" },
  { id: "vanaturg", name: "Old market", x: 150, z: -330, w: 44, d: 34, rot: -0.9, surface: "cobble", market: true },
];

/** the Bastion passages: earth works on the hill's south-east face (1670s, Swedish engineers) */
export const BASTIONS = [
  { x: -262, z: 232, rot: 0.55, w: 74, d: 52, name: "Sundukin" },
  { x: -316, z: 306, rot: 0.35, w: 66, d: 46, name: "Karberg" },
  { x: -232, z: 108, rot: 1.15, w: 58, d: 40, name: "Vaasa" },
];

/** named towers along the wall, at their real spots where OSM knows them */
export const NAMED_TOWERS = [
  { x: 241, z: -596, kind: "margareeta" },
  { x: -228, z: 278, kind: "kiek" },
  { x: 282, z: 71, kind: "viru" },
  { x: 60, z: -640, kind: "plate" },
  { x: -198, z: -60, kind: "round" },
  { x: 268, z: -20, kind: "square" },
  { x: -20, z: 332, kind: "round" },
];

/** where the city keeps its grass: the gardens on the hill's slopes and the ridge park */
export const PARKS = [
  { x: -258, z: 208, r: 46, n: 52, kind: "linden" },      // Sundukin / Bastion gardens
  { x: -300, z: 330, r: 44, n: 46, kind: "oak" },          // Falgi park below the south face
  { x: -506, z: -170, r: 40, n: 38, kind: "linden" },      // the ridge park on Toompuiestee
  { x: -566, z: 96, r: 46, n: 44, kind: "oak" },           // Kadriorg's edge, west of the hill
  { x: 158, z: -508, r: 30, n: 20, kind: "elm" },          // the garden by St Olaf's
];

export const GATES = [
  { x: 282, z: 71, rot: 1.35, name: "Viru gate", w: 15 },
  { x: 239, z: -562, rot: -0.05, name: "Great Coastal Gate", w: 16 },
  { x: 60, z: -643, rot: 0.05, name: "Nunna gate", w: 12 },
  { x: -104, z: 322, rot: 0.1, name: "Rävala gate", w: 12 },
];

const HOUSE_ONLY_R = 9;   // metres: no two houses may overlap by more than this
const LANDMARK_CLEAR = [  // keep these discs clear of generated houses
  ["raekoda", 30], ["raekoja-plats", 8], ["oleviste", 26], ["niguliste", 24],
  ["puhavaimu", 22], ["viru", 22], ["toompea", 62], ["hermann", 16], ["nevski", 28],
  ["toomkirik", 24], ["kiek", 20], ["margareeta", 26], ["katariina", 22], ["suurgild", 16],
  ["jaani", 26], ["linnahall", 120],
];

// Pastel plaster, the way the merchant houses are painted today (and roughly as lime-wash did it).
const PLASTER = [
  0xd9b48a, 0xc8a074, 0xe0c79a, 0xbfa382, 0xc97d5f, 0xd8a2a2, 0xa9b79c, 0xc2b091,
  0xb5836a, 0xd7c0a0, 0x9e8f76, 0xc9a882, 0xb2a48c, 0xd0926f, 0x8f9c93, 0xc76f52,
];
const ROOF = [0xa4562e, 0x8f4a2a, 0xb06034, 0x96593a, 0x7d4630, 0xa86b3e, 0x8a5238];

const isMainName = (n) => /^(pikk|lai|viru|rüütli|müürivahe|vene|aia|tolli|pühavaimu|suur-karja|väike-karja|rataskaevu|kloostri|dunkri|pagari|umu|omu|kuke|suluri|lühike jalg|pikk jalg|lossi|toom-kooli|kiriku|suurgild|väikegild|hobujaama|vene|harju|koaegild|kaari|poska|laboratooriumi|liivalaia|nunne|rose|rotsi|müürivahe)$/.test((n || "").toLowerCase());

/** which gable a house faces the street with: stepped, pointed, pedimented or plain */
function gableKind(rng, main) {
  return rng.weighted(main
    ? [["stepped", 4], ["pointed", 3], ["pediment", 2], ["plain", 2]]
    : [["plain", 6], ["pointed", 2], ["stepped", 2], ["pediment", 1]]);
}

export function generateTallinn(seed = GROUND_SEED) {
  const terr = makeTerrain(GROUND_SEED);          // the geography is real, whatever the seed says
  const rng = new Rng(seed + "/build");                  // the seed varies how it is furnished
  const { ground, slope, isSea } = terr;

  // the baked plan stores a centre-line as [[x,z],…]; work in points
  const STREETS_PTS = STREETS.map((s) => ({ ...s, pts: s.p.map(([px, pz]) => ({ x: px, z: pz })) }));

  // ---------------------------------------------------------------- landmark occupancy ----
  const keepOut = [];
  for (const l of LANDMARKS) {
    const r = (LANDMARK_CLEAR.find((k) => k[0] === l.id) || [null, Math.max(l.w, l.d) / 2])[1];
    keepOut.push({ x: l.x, z: l.z, r, id: l.id });
  }
  const clearOfLandmark = (x, z, pad = 0) => {
    for (const k of keepOut) {
      const dx = x - k.x, dz = z - k.z;
      if (dx * dx + dz * dz < (k.r + pad) * (k.r + pad)) return false;
    }
    return true;
  };

  // ------------------------------------------------------------------------ houses ----
  const houses = [];
  const orphanSlope = [];   // spots where the slope is too steep to build: trees go there
  const seen = new Set();
  for (const h of HOUSES) {
    const [x, z, w, d, rot, lvBaked, fill, kind] = h;
    if (!clearOfLandmark(x, z, -2)) continue;
    if (isSea(x, z)) continue;
    const y = ground(x, z);
    if (y < 1.4) continue;                                   // on the beach or in the sea
    if (polyDist(terr.WALL_PATH.map((p) => p), x, z) > 0 && Math.abs(polyDist(terr.WALL_PATH, x, z)) < 7) continue;
    const sl = slope(x, z);
    if (sl > 0.46) { orphanSlope.push([x, z]); continue; }   // no houses on the cliff face
    const key = `${Math.round(x / 6)}:${Math.round(z / 6)}`; // two wings of one palace, once
    if (seen.has(key)) continue;
    seen.add(key);

    const onHill = terr.onHill(x, z);
    // OSM's :levels is a wish as often as a measurement, and a five-storey house among the
    // cottages is the one thing that makes the Old Town skyline unreadable: 2-3, rarely 4
    const storeys = clamp(Math.min(lvBaked || rng.i(2, 3), onHill ? 3 : 4), 2, 4);
    const hWall = storeys * 3.05 + 0.7;
    // the street it faces: the nearest centre-line, and whether that street is a famous one
    let nearest = null, nearestD = Infinity;
    for (const s of STREETS_PTS) {
      const pts = s.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const dd = Math.hypot(mx - x, mz - z);
        if (dd < nearestD) { nearestD = dd; nearest = s; }
      }
    }
    const main = nearest ? (nearest.m === 1 || isMainName(nearest.n)) : false;
    const deep = Math.max(6, d), wide = Math.max(4.2, w);
    const ridgeAlong = wide >= deep ? 0 : Math.PI / 2;      // gable ends look down the short side
    houses.push({
      x, z, y, w: wide, d: deep, rot, storeys, hWall,
      fill, kind: kind || "",
      plaster: PLASTER[Math.floor(rng.f(0, PLASTER.length))],
      roofCol: ROOF[Math.floor(rng.f(0, ROOF.length))],
      gable: gableKind(rng, main),
      ridgeAlong,
      roofStyle: rng.chance(0.16) ? "hip" : "gable",
      dormer: rng.chance(0.45),
      porch: rng.chance(0.35),
      bay: rng.chance(0.22),
      chimney: rng.chance(0.72) ? rng.i(1, 2) : 0,
      tower: rng.chance(0.04) && !onHill,
      shop: rng.chance(0.55),
      facade: Math.floor(rng.f(0, 6)),
      main,
      onHill,
    });
  }

  // ------------------------------------------------------------------ modern fringe ----
  // A hint of the modern city, not a second diorama. The real one stands east and south of the
  // walls (Viru väljak, Estonia puiestee, Sadam), so that is where the skyline is allowed to
  // stand; scattered all round, the blocks read as a business park on grass rather than a city.
  const fringeKeep = FRINGE.map((f, i) => ({ f, i, r: Math.hypot(f[0], f[1]), size: f[2] * f[3] * (f[5] || 3) }))
    .filter(({ f, r }) => r > 620 && (f[0] > 130 || f[1] > 250))
    .sort((a, b) => b.size - a.size)
    .slice(0, 48);
  const blocks = [];
  for (const { f } of fringeKeep) {
    const [x, z, w, d, rot, lv] = f;
    // no modern block in or beside the walls: the bake classifies by footprint, and a 1930s office
    // just inside the ring used to stand in the foreground of the hero shot as a pale slab
    if (polyDist(OLD_TOWN_RING, x, z) > -58) continue;
    if (isSea(x, z)) continue;
    if (!clearOfLandmark(x, z, -8)) continue;
    const y = ground(x, z);
    if (y < 1.2) continue;
    const storeys = clamp(lv || rng.i(3, 5), 2, 7);
    blocks.push({
      x, z, y, w: Math.max(6, w), d: Math.max(6, d), rot, storeys,
      h: storeys * 2.95 + 1.2,
      col: rng.pick([0xa39a8c, 0x8f8c86, 0xbcae95, 0x9a938a, 0xc0b49c, 0x7f8a8c]),
    });
  }

  // --------------------------------------------------------------------- streets ----
  const roads = [];
  for (const s of STREETS_PTS) {
    const pts = s.pts;
    if (pts.length < 2) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    if (isSea(mid.x, mid.z)) continue;
    roads.push({ name: s.n, width: s.w, main: s.m === 1, pts });
  }

  // ----------------------------------------------------------------------- trees ----
  const trees = [];
  const pushTree = (x, z, kind, s = 1) => {
    if (isSea(x, z)) return;
    if (!clearOfLandmark(x, z, -12)) return;
    for (const h of houses) { if (Math.hypot(h.x - x, h.z - z) < 5.5) return; }
    const y = ground(x, z);
    if (y < 1.2) return;
    trees.push({ x, y, z, kind, s });
  };
  // the green belt: the escarpment of Toompea (Lilu, Falgi and Sundukin gardens) and the ridge
  let tries = 0;
  while (tries < 42000 && trees.length < 780) {
    tries++;
    const a = rng.f(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 780;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 60;
    const sl = slope(x, z);
    const hf = terr.hillFactor(x, z);
    if (sl < 0.17 || hf > 0.52) continue;                     // the slopes, not the top, not the flat
    if (polyDist(OLD_TOWN_RING, x, z) > 0 && sl < 0.34) continue;   // inside the town: only real banks
    pushTree(x, z, rng.weighted([["oak", 3], ["linden", 4], ["pine", 2], ["elm", 2]]), rng.f(0.75, 1.35));
  }
  // the named parks, where the city keeps its grass even between houses
  for (const p of PARKS) {
    for (let i = 0; i < p.n; i++) {
      const a = rng.f(0, Math.PI * 2), r = Math.sqrt(rng.next()) * p.r;
      pushTree(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r * 0.8, p.kind || "linden", rng.f(0.85, 1.3));
    }
  }
  // planned green: the park squares and the churchyards
  for (const sq of SQUARES) {
    for (let i = 0; i < (sq.trees || 0); i++) {
      const a = rng.f(0, Math.PI * 2), r = Math.sqrt(rng.next()) * Math.min(sq.w, sq.d) * 0.42;
      pushTree(sq.x + Math.cos(a) * r, sq.z + Math.sin(a) * r, "linden", rng.f(0.9, 1.3));
    }
  }
  for (const l of LANDMARKS) {
    if (l.kind !== "jaani") continue;
    for (let i = 0; i < 22; i++) {
      const a = rng.f(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 30;
      pushTree(l.x + Math.cos(a) * r, l.z + 26 + Math.sin(a) * r * 0.7, "elm", rng.f(0.7, 1.1));
    }
  }
  // the quay and the harbour road
  for (let x = -520; x < 420; x += 22) {
    const z = coastZ(x) + rng.f(16, 30);
    pushTree(x, z, "linden", rng.f(0.65, 0.9));
  }

  // ------------------------------------------------------------------- town wall ----
  const wall = [];
  const path = terr.WALL_PATH;
  const segLen = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    segLen.push(L); total += L;
  }
  // walk the ring, keeping a tower where the ring bends or every ~70 m, and never near a real one
  const towerAt = (x, z) => NAMED_TOWERS.some((t) => Math.hypot(t.x - x, t.z - z) < 34);
  let acc = 0;
  const towers = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, z1] = path[i], [x2, z2] = path[i + 1];
    const L = segLen[i];
    const n = Math.max(1, Math.round(L / 68));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = lerp(x1, x2, t), z = lerp(z1, z2, t);
      if (towerAt(x, z)) continue;
      towers.push({
        x, z, kind: rng.weighted([["round", 5], ["square", 3], ["hex", 2]]),
        h: rng.f(17, 24), r: rng.f(3.4, 4.6), named: false,
      });
    }
    acc += L;
  }
  for (const t of NAMED_TOWERS) {
    towers.push({
      x: t.x, z: t.z, kind: t.kind === "margareeta" ? "round" : t.kind === "kiek" ? "round" : t.kind,
      h: t.kind === "kiek" ? 38 : t.kind === "margareeta" ? 20 : 22,
      r: t.kind === "kiek" ? 8.6 : t.kind === "margareeta" ? 12.5 : 4.4, named: true, t: t.kind,
    });
  }
  void total; void acc;

  return {
    terr, houses, blocks, roads, trees, towers, wallPath: path,
    landmarks: LANDMARKS, squares: SQUARES, bastions: BASTIONS, gates: GATES,
    bounds: { R: 820 },
  };
}
