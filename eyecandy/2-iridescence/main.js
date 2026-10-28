// Eye candy 2 — Iridescence. Soap bubbles drifting up through a dark room with three coloured lamps.
// The colour comes from thin-film interference (optical path / wavelength, per channel), the film
// drains downward and swirls, Fresnel makes the rim a mirror and the face almost invisible, the far
// side focuses a bright spot, and a click pops a hole through the film.
import * as THREE from "three";
import { createCandy, gradePass, snap } from "../shared/candy.js";
import { Bubbles, bokeh } from "./soap.js";

const lab = createCandy({
  title: "2 · Iridescence — thin-film soap bubbles",
  camera: { position: [0, 0.5, 15], target: [0, 0, 0], fov: 46, near: 0.1, far: 200, minDistance: 4, maxDistance: 46 },
  bloom: { strength: 0.72, radius: 0.7, threshold: 0.78, scale: 0.5 },
  exposure: 1.1,
  background: 0x04060c,
  hints: ["drag to orbit", "wheel to move in", "click a bubble = pop", "P pop one", "N new field", "Space freeze"],
  guiTitle: "iridescence",
  preset: "high",
});
const { scene, camera, gui, composer, renderer, pointer } = lab;

const bg = new THREE.Mesh(
  new THREE.SphereGeometry(90, 32, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        vec3 c = mix(vec3(0.008,0.013,0.024), vec3(0.030,0.020,0.052), smoothstep(-0.7,0.9,d.y));
        c = mix(vec3(0.006,0.009,0.017), c, smoothstep(-1.0,-0.05,d.y));
        c += vec3(0.10,0.06,0.18) * pow(max(dot(d, normalize(vec3(-0.6,0.5,0.6))),0.0), 5.0) * 0.5;
        c += vec3(0.04,0.14,0.16) * pow(max(dot(d, normalize(vec3(0.75,0.1,0.4))),0.0), 5.0) * 0.5;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }),
);
bg.name = "backdrop";
bg.renderOrder = -10;
scene.add(bg);

const bubbles = new Bubbles(scene, { count: 14, radius: [0.7, 2.5], field: 15 });
const lights = bokeh(scene, { count: 26, spread: 46 });
lights.points.position.z = -30;
const grade = gradePass(composer, { vignette: 1.15, grain: 0.045, tint: 0xb9a6ff, tintAmount: 0.05, saturation: 1.16 });

// ---- droplets: what a popped film leaves behind -------------------------------------------------
const MAXD = 600;
const dpos = new Float32Array(MAXD * 3), dsz = new Float32Array(MAXD), dlife = new Float32Array(MAXD);
const dvel = new Float32Array(MAXD * 3);
const dgeo = new THREE.BufferGeometry();
dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
dgeo.setAttribute("aSize", new THREE.BufferAttribute(dsz, 1));
dgeo.setAttribute("aLife", new THREE.BufferAttribute(dlife, 1));
const dmat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uPR: { value: Math.min(devicePixelRatio || 1, 2) } },
  vertexShader: `
    attribute float aSize, aLife; varying float vL; uniform float uPR;
    void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = aSize * uPR * (150.0 / max(1.0,-mv.z)) * (0.35 + 0.65 * aLife);
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `
    varying float vL;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.05, d) * vL;
      if (a < 0.01) discard;
      vec3 c = mix(vec3(0.55,0.75,1.0), vec3(1.0,0.85,1.0), vL);
      gl_FragColor = vec4(c * a * 1.6, a);
    }`,
});
const drops = new THREE.Points(dgeo, dmat);
drops.frustumCulled = false;
drops.name = "droplets";
scene.add(drops);
let dhead = 0;
function burst(p, r) {
  for (let i = 0; i < 34; i++) {
    const k = dhead++ % MAXD;
    const th = Math.random() * 6.283, cp = Math.acos(2 * Math.random() - 1);
    dpos[k * 3] = p.x + 0.6 * r * Math.sin(cp) * Math.cos(th);
    dpos[k * 3 + 1] = p.y + 0.6 * r * Math.sin(cp) * Math.sin(th);
    dpos[k * 3 + 2] = p.z + 0.6 * r * Math.cos(cp);
    const s = 2.6 + Math.random() * 4.5;
    dvel[k * 3] = Math.sin(cp) * Math.cos(th) * s;
    dvel[k * 3 + 1] = Math.sin(cp) * Math.sin(th) * s + 0.6;
    dvel[k * 3 + 2] = Math.cos(cp) * s;
    dsz[k] = 2 + Math.random() * 7;
    dlife[k] = 1;
  }
}
function stepDrops(dt) {
  for (let i = 0; i < MAXD; i++) {
    if (dlife[i] <= 0) continue;
    dlife[i] = Math.max(0, dlife[i] - dt * 1.15);
    dvel[i * 3 + 1] -= dt * 1.4;
    for (let c = 0; c < 3; c++) dpos[i * 3 + c] += dvel[i * 3 + c] * dt;
  }
  dgeo.attributes.position.needsUpdate = true;
  dgeo.attributes.aLife.needsUpdate = true;
}

const P = { count: 14, thickness: 420, variance: 330, swirl: 0.9, drain: 0.55, irid: 1.5, rim: 1.15, refract: 1, spec: 1, wobble: 0.08, rise: 0.32, saturation: 1.25, bloom: 0.62, bokeh: 26, freeze: false };

const fFilm = gui.addFolder("the film");
fFilm.add(P, "thickness", 60, 900, 1).name("thickness nm").onChange(v => bubbles.P.thickness = v);
fFilm.add(P, "variance", 0, 620, 1).name("variance").onChange(v => bubbles.P.variance = v);
fFilm.add(P, "swirl", 0, 3, 0.01).name("swirl").onChange(v => bubbles.P.swirl = v);
fFilm.add(P, "drain", 0, 2, 0.01).name("drain").onChange(v => bubbles.P.drain = v);
fFilm.add(P, "irid", 0, 3, 0.01).name("interference").onChange(v => bubbles.P.irid = v);
fFilm.add(P, "saturation", 0, 2, 0.01).name("saturation").onChange(v => bubbles.P.saturation = v);
const fShell = gui.addFolder("the shell");
fShell.add(P, "rim", 0, 3, 0.01).name("fresnel rim").onChange(v => bubbles.P.rim = v);
fShell.add(P, "refract", 0, 2.5, 0.01).name("refraction").onChange(v => bubbles.P.refract = v);
fShell.add(P, "spec", 0, 3, 0.01).name("highlights").onChange(v => bubbles.P.spec = v);
fShell.add(P, "wobble", 0, 0.22, 0.001).name("wobble").onChange(v => bubbles.P.wobble = v);
fShell.add(P, "rise", 0, 1.6, 0.01).name("rise").onChange(v => bubbles.P.rise = v);
const fScene = gui.addFolder("scene");
fScene.add(P, "count", 1, 40, 1).name("bubbles").onChange((v) => { bubbles.build(v); });
fScene.add(P, "bokeh", 0, 60, 1).name("bokeh").onChange((v) => { lights.count = v; });
fScene.add(P, "bloom", 0, 2, 0.01).name("bloom").onChange((v) => { lab.bloomPass.strength = v; });
gui.add({ pop: () => popOne() }, "pop").name("💧 pop a bubble");

function popOne() {
  const live = bubbles.items.filter((b) => !b.popping);
  if (!live.length) return;
  const b = live[(Math.random() * live.length) | 0];
  bubbles.pop(b); burst(b.mesh.position, b.r);
}

// ---- interaction -----------------------------------------------------------------------------
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener("pointerup", (e) => {
  if (pointer.moved > 6 || e.button !== 0) return;
  ray.setFromCamera(pointer.ndc, camera);
  const hit = ray.intersectObjects(bubbles.items.filter((b) => !b.popping).map((b) => b.mesh), false);
  if (hit.length) {
    const b = hit[0].object.userData.bubble;
    bubbles.pop(b); burst(hit[0].point, b.r);
  }
});
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "p") popOne();
  if (k === "n") { bubbles.build(P.count); }
  if (k === " ") { P.freeze = !P.freeze; bubbles.P.rise = P.freeze ? 0 : 0.32; e.preventDefault(); }
});

function applyQuality(q) {
  const n = q === "low" ? 6 : q === "medium" ? 11 : 16;
  P.count = n; bubbles.build(n);
  lights.count = q === "low" ? 10 : q === "medium" ? 20 : 30;
  gui.controllersRecursive().forEach((c) => c.updateDisplay?.());
}
lab.onQuality(applyQuality);
applyQuality("high");

const clock = lab.clock;
let t = 0, hudT = 0;
function frame() {
  const dt = lab.step();
  t += dt;
  bg.material.uniforms.uTime.value = t;
  bubbles.update(P.freeze ? 0 : dt, t);
  lights.material.uniforms.uTime.value = t * 0.4;
  stepDrops(dt);
  grade.uniforms.uTime.value = t;
  if (lab.bloomPass) lab.bloomPass.strength = P.bloom;
  lab.render();
  lab.tickFps(dt);
  hudT += dt;
  if (hudT > 0.3) {
    hudT = 0;
    lab.setHud([
      ["bubbles", bubbles.items.length], ["film", `${Math.round(P.thickness)} nm`],
      ["n", "1.333"], ["interference", P.irid.toFixed(2)],
      ["popping", bubbles.items.filter((b) => b.popping).length],
      ["droplets", dlife.filter((v) => v > 0).length], ["rise", P.freeze ? "frozen" : P.rise.toFixed(2)],
    ]);
  }
}
renderer.setAnimationLoop(frame);

lab.expose({
  state: () => snap({
    fps: lab.fps.value, bubbles: bubbles.items.length, popping: bubbles.items.filter((b) => b.popping).length,
    thickness: P.thickness, variance: P.variance, swirl: P.swirl, drain: P.drain, irid: P.irid,
    rim: P.rim, refract: P.refract, spec: P.spec, wobble: P.wobble, rise: P.freeze ? 0 : P.rise,
    saturation: P.saturation, bloom: P.bloom, bokeh: lights.count, quality: lab.q.quality,
    droplets: dlife.filter((v) => v > 0).length,
  }),
  api: {
    params: P,
    set: (k, v) => { P[k] = v; if (k in bubbles.P) bubbles.P[k] = v; if (k === "bloom" && lab.bloomPass) lab.bloomPass.strength = v; if (k === "count") bubbles.build(v); },
    pop: () => popOne(),
    popIndex: (i) => { const b = bubbles.items[i ?? 0]; if (b) { bubbles.pop(b); burst(b.mesh.position, b.r); } },
    build: (n) => { P.count = n; bubbles.build(n); },
    setQuality: (q) => lab.setQuality(q),
    bubbles: () => bubbles,
  },
});
