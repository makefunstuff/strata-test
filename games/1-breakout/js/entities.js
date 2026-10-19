// The arcade cabinet: neon floor, brushed-metal walls with glowing trim, bevelled bricks,
// a metal paddle, a chrome ball and an additive glow trail.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FIELD, ROWS, COLS, BRICK, PADDLE, BALL, PLANE_Y, COLORS } from "./config.js";
import { gridTexture, noiseTexture, brushedMetal, glowTexture, shadowTexture } from "../../shared/textures.js";

const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

export function buildWorld(scene) {
  const halfW = FIELD.width / 2;
  const halfD = FIELD.depth / 2;
  const t = FIELD.wall;

  const wallTex = brushedMetal({ top: "#2a3a4e", bottom: "#141d29" });
  wallTex.repeat.set(3, 1);

  const wallMat = new THREE.MeshStandardMaterial({
    color: COLORS.wall, map: wallTex, roughness: 0.38, metalness: 0.4, envMapIntensity: 1.1,
  });
  const trimMat = new THREE.MeshBasicMaterial({ color: COLORS.trim, toneMapped: false });

  const field = new THREE.Group();
  scene.add(field);

  // ---- floor: polished dark plate with a lit grid, picking up reflections.
// The grid carries real emissive now: a floor that only reflects a grey room env reads as
// black paper, and the cabinet sat in a void.
  const fTex = gridTexture({ base: "#16263a", line: "rgba(120,215,255,0.34)", major: "rgba(170,240,255,0.55)" });
  fTex.repeat.set(3, 4);
  const fRough = noiseTexture({ size: 256, octaves: 4, contrast: 1.2, base: 0.42 });
  fRough.repeat.set(3, 4);
  // The emissive map must be a black plate with glowing lines. Reusing the albedo grid texture
  // (base #16263a) made the whole floor a light source: in portrait, where the camera looks
  // straight down the field, the floor fills the tube, the CRT's gain (set for a dark arcade
  // picture) clips it, and the phone shows a white screen with scanlines on it.
  const fEmis = gridTexture({ base: "#000000", line: "rgba(120,215,255,0.55)", major: "rgba(190,245,255,0.9)" });
  fEmis.repeat.set(3, 4);
  const floor = add(field,
    new THREE.BoxGeometry(FIELD.width, t, FIELD.depth),
    new THREE.MeshStandardMaterial({
      color: COLORS.floor, map: fTex, roughnessMap: fRough,
      emissive: COLORS.gridGlow, emissiveMap: fEmis, emissiveIntensity: 1.1,
      roughness: 0.34, metalness: 0.45, envMapIntensity: 1.5,
    }), 0, -t / 2, 0);
  floor.name = "floor";
  floor.receiveShadow = true;

  // light pool on the floor behind the paddle: a wide additive wash that grounds the field
  const pool = add(field, new THREE.PlaneGeometry(FIELD.width * 0.9, FIELD.depth * 0.55),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0x2f7fd0, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 0, 0.012, -2.2);
  pool.rotation.x = -Math.PI / 2;

  // apron below and behind the field, so the cabinet sits in a lit room, not in a void
  const aTex = gridTexture({ base: "#0a1120", line: "rgba(70,150,220,0.16)", major: "rgba(110,200,255,0.24)", pool: null }).clone();  // clone: its repeat must not touch the floor's copy
  aTex.wrapS = aTex.wrapT = THREE.RepeatWrapping;
  aTex.repeat.set(9, 9);
  // anisotropy: a tiled grid seen at a grazing angle moirés into bright bands, which under the
  // CRT's gain reads as a white tube (first seen in portrait, where the camera sits far back).
  // Same family as the "this line wtf" artefact of 2026-08-11 — a full-tube-width cyan rule from
  // a far grid compressing into one line. The apron is now a quarter smaller, anisotropically
  // filtered, and fades out radially with an alphaMap so its grid dissolves into the dark before
  // the perspective can squash it. It carries no emissive at all.
  aTex.anisotropy = 8;
  aTex.needsUpdate = true;
  const apron = add(scene,
    new THREE.PlaneGeometry(44, 44),
    new THREE.MeshStandardMaterial({
      color: 0x0a1120, map: aTex, roughness: 0.6, metalness: 0.3,
      alphaMap: glowTexture(), transparent: true, depthWrite: false, envMapIntensity: 0.8,
    }), 0, -t - 0.35, 0);
  apron.name = "apron";
  apron.rotation.x = -Math.PI / 2;
  apron.receiveShadow = true;

  // ---- walls with glowing trim along their inner top edge
  const wallH = 2.4;
  const backWall = add(field, new THREE.BoxGeometry(FIELD.width + 2 * t, wallH, t), wallMat, 0, wallH / 2, -halfD - t / 2);
  const leftWall = add(field, new THREE.BoxGeometry(t, wallH, FIELD.depth + t), wallMat, -halfW - t / 2, wallH / 2, 0);
  const rightWall = add(field, new THREE.BoxGeometry(t, wallH, FIELD.depth + t), wallMat, halfW + t / 2, wallH / 2, 0);
  for (const w of [backWall, leftWall, rightWall]) { w.castShadow = true; w.receiveShadow = true; }

  // Cabinet trim. Deliberately no strip along the top of the back wall: the camera is level, so
  // the back strip and both side strips all project to the same height and merge into one bright
  // horizontal line across the tube, which reads as a broken CRT beam (see the 2026-08-11 report).
  // Side edges sit lower and are tone-mapped; the bright accents are vertical corner uprights.
  const trimSoft = new THREE.MeshStandardMaterial({
    color: 0x0a1a22, emissive: COLORS.trim, emissiveIntensity: 0.85, roughness: 0.4,
  });
  for (const sx of [-1, 1]) {
    add(field, new THREE.BoxGeometry(0.12, 0.12, FIELD.depth), trimSoft,
      sx * (halfW + t / 2 - 0.06), wallH - 0.5, 0);
    add(field, new THREE.BoxGeometry(0.1, wallH - 0.2, 0.1), trimMat,
      sx * (halfW + t / 2 - 0.05), (wallH - 0.2) / 2, -halfD - t / 2 + 0.05);
    // lit skirt at the foot of each side wall: the wall meets the floor with a glowing seam,
    // which is what makes the room read as a room in this near-top-down view
    add(field, new THREE.BoxGeometry(0.07, 0.07, FIELD.depth - 0.4), trimSoft,
      sx * (halfW + t / 2 - 0.09), 0.06, 0);
  }

  // the danger line behind the paddle: one glowing band with chevrons pointing at it, not a
  // row of identical ticks, which read as loose change scattered on the floor
  const failMat = new THREE.MeshBasicMaterial({ color: COLORS.fail, toneMapped: false });
  const failGlow = add(field, new THREE.PlaneGeometry(FIELD.width, 1.5),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: COLORS.fail, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 0, 0.014, halfD - 0.7);
  failGlow.rotation.x = -Math.PI / 2;
  add(field, new THREE.BoxGeometry(FIELD.width, 0.05, 0.09), failMat, 0, 0.03, halfD - 0.06);
  for (let i = 0; i < 7; i++) {
    const x = -halfW + (i + 0.5) * (FIELD.width / 7);
    const chevron = add(field, new THREE.BoxGeometry(0.5, 0.04, 0.09), failMat, x, 0.02, halfD - 0.5);
    chevron.rotation.y = 0.55;
    const mirror = add(field, new THREE.BoxGeometry(0.5, 0.04, 0.09), failMat, x + 0.36, 0.02, halfD - 0.22);
    mirror.rotation.y = -0.55;
  }

  // ---- bricks: bevelled blocks, one emissive colour per row
  const grid = new THREE.Group();
  scene.add(grid);
  const brickGeo = new RoundedBoxGeometry(BRICK.w, BRICK.h, BRICK.d, 2, 0.07);
  const brickMats = COLORS.brick.map((c) => new THREE.MeshStandardMaterial({
    // low metalness, real emissive: the colour is the brick's own, not the key light's.
    // (metalness 0.35 over a pale base turned every row into the same off-white. The shatter
    // pool colours its instances per row, so debris matches the brick it came from.)
    color: c, roughness: 0.42, metalness: 0.1,
    emissive: c, emissiveIntensity: 0.5, envMapIntensity: 0.7,
  }));

  const bricks = [];
  const startX = -((COLS - 1) * (BRICK.w + BRICK.gap)) / 2;
  const startZ = -halfD + 1.6;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const mesh = new THREE.Mesh(brickGeo, brickMats[r]);
      mesh.position.set(startX + c * (BRICK.w + BRICK.gap), BRICK.h / 2, startZ + r * (BRICK.d + BRICK.gap));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grid.add(mesh);
      // thin neon cap so the stack reads as lit from inside
      const cap = add(grid, new THREE.BoxGeometry(BRICK.w * 0.82, 0.035, BRICK.d * 0.6),
        new THREE.MeshBasicMaterial({
          color: COLORS.brick[r], transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }),
        mesh.position.x, BRICK.h + 0.005, mesh.position.z);
      bricks.push({
        mesh, cap, row: r, alive: true,
        center: mesh.position.clone(),
        half: new THREE.Vector3(BRICK.w / 2, BRICK.h / 2, BRICK.d / 2),
      });
    }
  }

  // ---- paddle: metal slab with a glowing edge and a soft light underneath
  const paddle = new THREE.Group();
  scene.add(paddle);
  const body = add(paddle,
    new RoundedBoxGeometry(PADDLE.w, PADDLE.h, PADDLE.d, 3, 0.11),
    new THREE.MeshStandardMaterial({
      color: COLORS.paddle, roughness: 0.18, metalness: 0.85,
      emissive: COLORS.paddle, emissiveIntensity: 0.14, envMapIntensity: 1.3,
    }), 0, PADDLE.h / 2, 0);
  body.castShadow = true;
  const edge = add(paddle, new THREE.BoxGeometry(PADDLE.w * 0.94, 0.06, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, PADDLE.h - 0.02, -PADDLE.d / 2 + 0.03);
  // neon outline on both long sides, so the paddle reads as a shape at a glance
  for (const sz of [-1, 1]) {
    add(paddle, new THREE.BoxGeometry(PADDLE.w * 0.9, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: COLORS.paddle, toneMapped: false }),
      0, PADDLE.h * 0.55, sz * (PADDLE.d / 2 - 0.01));
  }
  // contact shadow: the slab sits on the floor, it does not float over its own glow
  const padShadow = add(paddle, new THREE.PlaneGeometry(PADDLE.w * 1.5, PADDLE.d * 3),
    new THREE.MeshBasicMaterial({
      map: shadowTexture({ strength: 0.75 }), transparent: true, opacity: 0.65, depthWrite: false,
    }), 0, 0.008, 0);
  padShadow.rotation.x = -Math.PI / 2;
  const under = add(paddle, new THREE.PlaneGeometry(PADDLE.w * 1.2, PADDLE.d * 2.2),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: COLORS.paddle, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 0, 0.02, 0);
  under.rotation.x = -Math.PI / 2;
  paddle.position.set(0, 0, halfD - 0.8);

  // ---- ball: chrome sphere
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.r, 40, 28),
    new THREE.MeshPhysicalMaterial({
      color: COLORS.ball, roughness: 0.14, metalness: 0.35,
      emissive: 0xbfe6ff, emissiveIntensity: 0.85,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2,
    })
  );
  ball.position.set(0, PLANE_Y, halfD - 1.4);
  ball.castShadow = true;
  ball.velocity = new THREE.Vector3(0, 0, 0);
  scene.add(ball);

  const halo = add(scene, new THREE.PlaneGeometry(BALL.r * 4.4, BALL.r * 4.4),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: COLORS.ball, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), ball.position.x, ball.position.y, ball.position.z);

  // ---- trail: additive glow dots that follow the ball, sized down the line. Tighter and
  // brighter than before: the wide soft version read as smoke, not as a ball path.
  const dots = [];
  for (let i = 0; i < 14; i++) {
    const d = add(scene, new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTexture(), color: i < 3 ? 0xffffff : COLORS.ball, transparent: true, opacity: 0.6 * (1 - i / 14),
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }), ball.position.x, ball.position.y, ball.position.z);
    d.userData.base = 1 - i / 14;
    d.userData.size = BALL.r * (1.9 - 1.35 * (i / 14));
    dots.push(d);
  }

  return {
    field, floor, apron, pool, failGlow, backWall, leftWall, rightWall, grid, bricks,
    paddle, paddleBody: body, paddleEdge: edge, paddleUnder: under,
    ball, halo, dots, bricksLeft: bricks.length,
  };
}
