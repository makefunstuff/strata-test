// Experiment 3 — cloth with wind and tearing. A flag, a curtain, a banner: a Verlet mass-spring
// sheet lit by a low sun, gusting in the wind, grabbed and pulled with the mouse until its
// constraints snap, or sliced open with the cut tool.
import * as THREE from "three";
import { createLab, rand, skyDome } from "../shared/lab.js";
import { Cloth } from "./cloth.js";

const lab = createLab({
  title: "3 · Cloth — verlet weave, gusts, tearing",
  camera: { position: [7.2, 5.6, 13.5], target: [0.4, 4.2, 0], fov: 46, near: 0.2, far: 400, minDistance: 3, maxDistance: 46 },
  bloom: { strength: 0.26, radius: 0.5, threshold: 0.95, scale: 0.4 },
  exposure: 1.12,
  background: null,
  fog: { color: 0xc0b49c, near: 40, far: 190 },
  shadow: true,
  hints: ["drag the cloth to grab and pull", "Shift-drag (or C) slices it", "Space gust", "R re-weave", "right-drag / wheel for the camera"],
  guiTitle: "cloth",
});
const { renderer, scene, camera, gui, pointer } = lab;
const orbit = lab.orbit;
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
orbit.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

// ---- setting: dusk field, a pole, a low sun ----------------------------------------------------
const dome = skyDome(scene, { top: 0x37527f, horizon: 0xf0c795, ground: 0x50412f, sun: { x: -0.72, y: 0.22, z: 0.62 }, sunSize: 0.018, glow: 0.7 });
const sunDir = new THREE.Vector3(-0.72, 0.34, 0.6).normalize();
const key = new THREE.DirectionalLight(0xffd8a8, 3.0);
key.position.copy(sunDir).multiplyScalar(26);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -12; key.shadow.camera.right = 12;
key.shadow.camera.top = 12; key.shadow.camera.bottom = -8;
key.shadow.camera.near = 6; key.shadow.camera.far = 70;
key.shadow.bias = -0.0008;
scene.add(key, new THREE.HemisphereLight(0xd6e6fa, 0x6b5a3d, 1.45));
const rim = new THREE.PointLight(0xff9a4a, 14, 26, 2);
rim.position.set(-6.5, 3.8, -3.4);
scene.add(rim);

function groundTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#6c6141"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = rand(0.4, 1.1);
    g.fillStyle = `rgba(${110 * v | 0},${104 * v | 0},${58 * v | 0},${0.05 + Math.random() * 0.16})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 6), rand(1, 3));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, color: 0xb5aa84 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 18),
  new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.34, metalness: 0.85 }));
pole.position.set(-3.62, 3.2, 0);
pole.castShadow = true;
scene.add(pole);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14),
  new THREE.MeshStandardMaterial({ color: 0xd8b45a, roughness: 0.22, metalness: 1 }));
finial.position.set(-3.62, 6.5, 0);
scene.add(finial);

// ---- set dressing: rail, tufts, stones, dust motes in the wind --------------------------------
const railMat = new THREE.MeshStandardMaterial({ color: 0x746c5f, roughness: 0.42, metalness: 0.75 });
const rig = new THREE.Group();
const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 7.4, 14), railMat);
rail.rotation.z = Math.PI / 2;
rail.position.set(0, 6.62, 0);
rail.castShadow = true;
rig.add(rail);
for (const sx of [-3.6, 3.6]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.7, 12), railMat);
  post.position.set(sx, 3.35, 0);
  post.castShadow = true;
  rig.add(post);
}
scene.add(rig);

function scatter(geo, mat, count, place) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    place(o, i);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  }
  m.castShadow = true;
  scene.add(m);
  return m;
}
const tufts = scatter(new THREE.ConeGeometry(0.16, 0.7, 5),
  new THREE.MeshStandardMaterial({ color: 0x767a44, roughness: 0.95, flatShading: true }), 300, (o, i) => {
    const a = rand(0, Math.PI * 2), r = rand(5.5, 19);
    o.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    o.rotation.set(rand(-0.15, 0.15), rand(0, 6.28), rand(-0.15, 0.15));
    o.scale.set(rand(0.35, 0.9), rand(0.4, 1.1), rand(0.35, 0.9));
  });
const stones = scatter(new THREE.IcosahedronGeometry(0.34, 0),
  new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.9, flatShading: true }), 26, (o, i) => {
    const a = rand(0, Math.PI * 2), r = rand(6, 17);
    o.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    o.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    o.scale.set(rand(0.5, 1.6), rand(0.35, 0.8), rand(0.5, 1.6));
  });

const MOTES = 700;
const motePos = new Float32Array(MOTES * 3);
for (let i = 0; i < MOTES; i++) {
  motePos[i * 3] = rand(-15, 15);
  motePos[i * 3 + 1] = rand(0.2, 9);
  motePos[i * 3 + 2] = rand(-15, 15);
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
  color: 0xffe6c0, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.55,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
scene.add(motes);

const reticle = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 24),
  new THREE.MeshBasicMaterial({ color: 0xff9a6a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
reticle.visible = false;
scene.add(reticle);

// ---- fabric -----------------------------------------------------------------------------------
function fabricTexture(kind = "flag") {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d");
  if (kind === "flag") {
    const bands = ["#1d2f4d", "#d9d4c8", "#8c2b2b", "#d9d4c8", "#1d2f4d", "#c8a24a", "#1d2f4d"];
    const bh = S / bands.length;
    bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * bh, S, bh + 1); });
    g.fillStyle = "rgba(20,26,38,0.92)"; g.fillRect(0, 0, S * 0.34, bh * 3);
    g.fillStyle = "#e8d9a0";
    for (let i = 0; i < 9; i++) {
      const cx = S * 0.06 + (i % 3) * S * 0.1, cy = S * 0.06 + Math.floor(i / 3) * S * 0.1;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? S * 0.018 : S * 0.045, a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        g[k ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.fill();
    }
    g.font = `700 ${S * 0.1}px ui-serif, Georgia, serif`;
    g.fillStyle = "rgba(232,217,160,0.95)";
    g.fillText("STRATA", S * 0.38, S * 0.62);
  } else if (kind === "plaid") {
    g.fillStyle = "#243b2c"; g.fillRect(0, 0, S, S);
    const stripes = [["#8e2f2f", 0.14], ["#d9d4c8", 0.05], ["#1b2b20", 0.3], ["#c8a24a", 0.035]];
    for (const [col, wgt] of stripes) {
      const w = S * wgt;
      for (let i = 0; i < S; i += w * 6) {
        g.fillStyle = col + "cc"; g.fillRect(i, 0, w, S);
        g.fillRect(0, i, S, w);
      }
    }
  } else {
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, "#2b3f6b"); grd.addColorStop(0.45, "#6d3a52"); grd.addColorStop(1, "#c8834a");
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(255,240,220,${0.02 + Math.random() * 0.05})`;
      g.lineWidth = rand(0.5, 2.5);
      g.beginPath(); g.moveTo(0, i * S / 260); g.bezierCurveTo(S * 0.3, i * S / 260 + 20, S * 0.6, i * S / 260 - 20, S, i * S / 260); g.stroke();
    }
  }
  // weave: fine cross-hatch so the fabric texture catches the light
  g.globalAlpha = 0.06;
  for (let i = 0; i < S; i += 3) {
    g.fillStyle = i % 6 ? "#000" : "#fff";
    g.fillRect(0, i, S, 1);
    g.fillRect(i, 0, 1, S);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const P = {
  fabric: "flag", mode: "flag", gravity: -3, wind: 7.5, windAz: 74, windEl: 3, gust: 0,
  iterations: 5, tearMul: 3.4, tearEnergy: 0.9, damping: 0.99, flutter: 1.1, cutMode: false, cutSize: 0.3,
  resolution: "medium", slowmo: 1,
};
const RES = { low: [30, 22], medium: [54, 38], high: [76, 54] };
let cloth = null, clothMesh = null;
const clothMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.82, metalness: 0.03, flatShading: false });

function sew() {
  if (clothMesh) { scene.remove(clothMesh); clothMesh.geometry.dispose(); }
  const [sx, sy] = RES[P.resolution] ?? RES.medium;
  const w = P.mode === "banner" ? 5.2 : 7, h = P.mode === "banner" ? 6.2 : 4.4;
  cloth = new Cloth({ w, h, segX: sx, segY: sy, origin: [0, 2.2, 0], mode: P.mode });
  const old = clothMat.map;
  clothMat.map = fabricTexture(P.fabric);
  clothMat.shadowSide = THREE.DoubleSide;
  if (old) old.dispose();
  clothMat.roughness = P.fabric === "silk" ? 0.34 : 0.82;
  clothMat.metalness = P.fabric === "silk" ? 0.22 : 0.03;
  clothMat.needsUpdate = true;
  clothMesh = new THREE.Mesh(cloth.geometry, clothMat);
  clothMesh.castShadow = true;
  clothMesh.receiveShadow = true;
  clothMesh.frustumCulled = false;
  scene.add(clothMesh);
  pole.visible = P.mode === "flag";
  finial.visible = P.mode === "flag";
  rig.visible = P.mode !== "flag";
  rail.position.y = P.mode === "banner" ? 8.42 : 6.62;
  return { particles: cloth.particles, constraints: cloth.constraints };
}
sew();

// ---- interaction ------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const dragPlane = new THREE.Plane();
const hitPoint = new THREE.Vector3();
let grabbing = false, cutting = false, gustLevel = 0;

function clothHit(u, v) {
  if (!clothMesh) return null;
  if (u !== undefined) pointer.ndc.set(u * 2 - 1, 1 - v * 2);
  ray.setFromCamera(pointer.ndc, camera);
  const hits = ray.intersectObject(clothMesh, false);
  return hits.length ? hits[0].point : null;
}
function startGrab(u, v, cut) {
  const p = clothHit(u, v);
  if (!p) return { ok: false };
  if (P.cutMode || cut) {
    cutting = true;
    return { ok: true, cut: cloth.cut(p, P.cutSize) };
  }
  const i = cloth.grabAt(p, 0.8);
  if (i >= 0) {
    grabbing = true;
    dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), p);
  }
  return { ok: i >= 0, index: i };
}
function moveDrag(u, v) {
  if (cutting) { const p = clothHit(u, v); if (p) return cloth.cut(p, P.cutSize); }
  if (!grabbing) return 0;
  pointer.ndc.set(u * 2 - 1, 1 - v * 2);
  ray.setFromCamera(pointer.ndc, camera);
  if (ray.ray.intersectPlane(dragPlane, hitPoint)) cloth.moveGrabTo(hitPoint);
  return 1;
}
function endDrag() { grabbing = false; cutting = false; cloth && cloth.release(); }

renderer.domElement.addEventListener("pointerdown", (e) => startGrab(e.clientX / window.innerWidth, e.clientY / window.innerHeight, e.shiftKey));
renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); gustLevel = 1; }
  if (e.code === "KeyR") sew();
  if (e.code === "KeyC") { P.cutMode = !P.cutMode; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
});

// ---- control panel -----------------------------------------------------------------------------
const fW = gui.addFolder("wind & gravity");
fW.add(P, "wind", 0, 40, 0.2).name("wind");
fW.add(P, "windAz", -90, 90, 1).name("wind azimuth");
fW.add(P, "windEl", -30, 40, 1).name("wind elevation");
fW.add(P, "gravity", -30, 2, 0.2).name("gravity");
fW.add(P, "flutter", 0, 2.5, 0.05).name("flutter");
fW.add({ gust: () => { gustLevel = 1; } }, "gust").name("gust (Space)");
const fC = gui.addFolder("cloth");
fC.add(P, "fabric", ["flag", "plaid", "silk"]).name("fabric").onChange(sew);
fC.add(P, "mode", ["flag", "top", "corners", "banner", "center"]).name("pinned").onChange(sew);
fC.add(P, "iterations", 1, 10, 1).name("stiffness (iters)");
fC.add(P, "tearMul", 1.1, 8, 0.05).name("tear stretch limit");
fC.add(P, "tearEnergy", 0.05, 4, 0.05).name("tear persistence");
fC.add(P, "damping", 0.9, 1.0, 0.001).name("damping");
fC.add(P, "resolution", ["low", "medium", "high"]).name("weave density").onChange(sew);
fC.add(P, "cutMode").name("cut tool (C)");
fC.add(P, "cutSize", 0.08, 1.2, 0.02).name("cut size");
fC.add(P, "slowmo", 0.15, 1, 0.05).name("time scale");
fC.add({ sew }, "sew").name("re-weave (R)");
fC.add({ slice: () => cloth.cut(new THREE.Vector3(rand(-2.2, 2.2), rand(2.2, 3.8), 0.2), P.cutSize * 2.4) }, "slice").name("slice a hole");

lab.onQuality((q) => {
  P.resolution = q === "low" ? "low" : q === "high" ? "high" : "medium";
  lab.setPixelRatio(q === "low" ? 0.75 : 1);
  sew();
});

// ---- loop ---------------------------------------------------------------------------------------
const windVec = new THREE.Vector3();
let t = 0, hudT = 0, Tore = 0, grabbed = -1;

function frame() {
  const dt = Math.min(lab.step(), 1 / 45) * P.slowmo;
  t += dt;
  gustLevel = Math.max(0, gustLevel - dt * 0.55);

  const az = THREE.MathUtils.degToRad(P.windAz), el = THREE.MathUtils.degToRad(P.windEl);
  windVec.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

  // dust motes ride the wind
  const ms = (1.1 + gustLevel * 3.4) * P.wind * 0.14;
  for (let i = 0; i < MOTES; i++) {
    const k = i * 3;
    motePos[k] += windVec.x * ms * dt + Math.sin(t * 1.7 + i) * 0.006;
    motePos[k + 1] += (windVec.y * ms + Math.sin(t * 0.9 + i * 2.1) * 0.25) * dt * 2.2;
    motePos[k + 2] += windVec.z * ms * dt + Math.cos(t * 1.3 + i * 0.7) * 0.006;
    for (let a = 0; a < 3; a++) {
      const lim = a === 1 ? 9.5 : 15;
      if (motePos[k + a] > lim) motePos[k + a] = -lim;
      else if (motePos[k + a] < (a === 1 ? 0.15 : -lim)) motePos[k + a] = a === 1 ? 9 : lim;
    }
  }
  moteGeo.attributes.position.needsUpdate = true;

  reticle.visible = P.cutMode;
  if (P.cutMode) {
    const p = clothHit();
    if (p) { reticle.position.copy(p); reticle.lookAt(camera.position); reticle.scale.setScalar(P.cutSize * 3.2); }
  }

  // the grab spring and the cut tool follow the pointer / the scripted drag API
  if (cutting && pointer.down) moveDrag(pointer.ndc.x * 0.5 + 0.5, 0.5 - pointer.ndc.y * 0.5);
  if (grabbing) {
    ray.setFromCamera(pointer.ndc, camera);
    if (ray.ray.intersectPlane(dragPlane, hitPoint)) cloth.moveGrabTo(hitPoint);
  }

  // fixed Verlet steps, count matched to the frame time so the sheet keeps real time
  const h = (1 / 60) * P.slowmo;
  const sub = Math.max(1, Math.min(4, Math.round(dt / (1 / 60))));
  for (let i = 0; i < sub; i++) {
    Tore += cloth.step(h, {
      gravity: P.gravity, wind: P.wind, windDir: [windVec.x, windVec.y, windVec.z],
      gust: gustLevel, damping: P.damping, iterations: P.iterations, tearMul: P.tearMul, tearEnergy: P.tearEnergy,
      time: t, flutter: P.flutter,
    });
  }
  cloth.syncGeometry();
  grabbed = cloth.grabbed;

  orbit.update();
  lab.render();
  lab.tickFps(dt);

  hudT += dt;
  if (hudT > 0.4) {
    hudT = 0;
    lab.setHud([["particles", cloth.particles], ["constraints", cloth.constraints], ["torn", cloth.torn],
      ["quads", `${cloth.quadsAlive}/${cloth.segX * cloth.segY}`], ["wind", `${(P.wind * (1 + gustLevel * 1.8)).toFixed(1)}`],
      ["mode", P.mode], ["fabric", P.fabric], ["tool", P.cutMode ? "cut" : grabbing ? "pull" : "grab"]]);
  }
}
lab.renderer.setAnimationLoop(frame);

lab.expose({
  state: () => ({
    fps: lab.fps.value, particles: cloth.particles, constraints: cloth.constraints, torn: cloth.torn,
    quads: cloth.quadsAlive, totalQuads: cloth.segX * cloth.segY, mode: P.mode, fabric: P.fabric,
    resolution: P.resolution, wind: P.wind, gust: Math.round(gustLevel * 100) / 100, iterations: P.iterations,
    tearMul: P.tearMul, tearEnergy: P.tearEnergy, gravity: P.gravity, grabbed: cloth.grabbed, cutMode: P.cutMode,
  }),
  api: {
    params: P, cloth: () => cloth, sew, gust: () => (gustLevel = 1),
    cutAt: (x, y, z = 0, r = P.cutSize) => cloth.cut(new THREE.Vector3(x, y, z), r),
    slice: () => cloth.cut(new THREE.Vector3(rand(-2.2, 2.2), rand(2.2, 3.8), 0.2), P.cutSize * 2.4),
    setMode: (m) => { P.mode = m; sew(); }, setResolution: (r) => { P.resolution = r; sew(); },
    setFabric: (f) => { P.fabric = f; sew(); },
    cutScreen: (u, v, r = P.cutSize) => { const p = clothHit(u, v); return p ? cloth.cut(p, r) : 0; },
    grabScreen: (u, v, cut = false) => startGrab(u, v, cut),
    dragTo: (u, v) => moveDrag(u, v),
    endDrag,
    grabPoint: (v) => cloth.grabAt(new THREE.Vector3(v[0], v[1], v[2]), 5),
    pullTo: (v) => cloth.moveGrabTo(new THREE.Vector3(v[0], v[1], v[2])),
    release: () => cloth.release(),
    project: (i) => {
      const v = new THREE.Vector3(cloth.pos[i * 3], cloth.pos[i * 3 + 1], cloth.pos[i * 3 + 2]).project(camera);
      return [v.x * 0.5 + 0.5, 0.5 - v.y * 0.5, Math.round(v.z * 1000) / 1000];
    },
    mid: () => {
      let x = 0, y = 0, z = 0, k = 0;
      for (let i = 0; i < cloth.n; i += 7) {
        if (cloth.dead[i]) continue;
        x += cloth.pos[i * 3]; y += cloth.pos[i * 3 + 1]; z += cloth.pos[i * 3 + 2]; k++;
      }
      const v = new THREE.Vector3(x / k, y / k, z / k).project(camera);
      return [v.x * 0.5 + 0.5, 0.5 - v.y * 0.5, Math.round(v.z * 1000) / 1000];
    },
  },
});
