// Shared lab kit for the five graphics experiments: renderer + bloom pipeline, an fps readout,
// the "how to interact" hint card, a lil-gui panel, a pointer helper and the window.experiment
// hook the headless checks drive. Plain ES modules, three.js from a pinned CDN, no build step.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "lil-gui";

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Full render + UI scaffolding. Returns the lab object everything else hangs off. */
export function createLab({
  title = "experiment",
  camera: camOpts = {},
  bloom = { strength: 0.55, radius: 0.5, threshold: 0.85, scale: 0.5 },
  exposure = 1.05,
  background = 0x05070c,
  fog = null,
  controls = true,
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2),
  preset = "high",
  shadow = false,
  hints = [],
  guiTitle = null,
} = {}) {
  const canvas = document.getElementById("stage-canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  if (background != null) scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

  const camera = new THREE.PerspectiveCamera(camOpts.fov ?? 52, window.innerWidth / window.innerHeight, camOpts.near ?? 0.1, camOpts.far ?? 400);
  camera.position.copy(new THREE.Vector3(...(camOpts.position ?? [0, 4, 12])));
  if (camOpts.target) camera.lookAt(new THREE.Vector3(...camOpts.target));

  let orbit = null;
  if (controls) {
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(...(camOpts.target ?? [0, 0, 0]));
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.07;
    orbit.maxPolarAngle = camOpts.maxPolar ?? Math.PI * 0.495;
    orbit.minDistance = camOpts.minDistance ?? 2;
    orbit.maxDistance = camOpts.maxDistance ?? 120;
    orbit.update();
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = bloom && bloom.strength > 0
    ? new UnrealBloomPass(new THREE.Vector2(256, 256), bloom.strength, bloom.radius, bloom.threshold)
    : null;
  if (bloomPass) composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  function setPixelRatio(r) {
    renderer.setPixelRatio(r);
    composer.setPixelRatio(r);
    setSize();
  }
  function setSize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (bloomPass) bloomPass.setSize(Math.max(64, Math.round(w * bloom.scale)), Math.max(64, Math.round(h * bloom.scale)));
  }
  setSize();
  window.addEventListener("resize", setSize);

  // ---- fps readout -------------------------------------------------------------
  const fpsEl = document.getElementById("fps");
  const fps = { value: 0, frames: 0, acc: 0, ms: 16.7 };
  function tickFps(dt) {
    fps.frames++; fps.acc += dt;
    if (fps.acc >= 0.4) {
      fps.value = Math.round(fps.frames / fps.acc);
      fps.ms = (fps.acc / fps.frames) * 1000;
      fps.frames = 0; fps.acc = 0;
      if (fpsEl) fpsEl.textContent = `${fps.value} fps · ${fps.ms.toFixed(1)} ms`;
    }
  }

  // ---- hint card ----------------------------------------------------------------
  const hintEl = document.getElementById("hint");
  if (hintEl && hints.length) {
    hintEl.innerHTML = hints.map((h) => `<span>${h}</span>`).join("");
    setTimeout(() => hintEl.classList.add("fade"), 12000);
  }
  const hudEl = document.getElementById("hud");
  function setHud(pairs) {
    if (!hudEl) return;
    hudEl.innerHTML = pairs.map(([k, v]) => `<span class="k">${k}</span><b>${v}</b>`).join("");
  }

  // ---- control panel ------------------------------------------------------------
  const gui = new GUI({ title: guiTitle ?? title, width: 250 });
  gui.domElement.classList.add("lab-gui");
  const q = { quality: preset, pixelRatio: renderer.getPixelRatio() };
  let onQuality = () => {};
  let lastQuality = preset;
  const qualityFolder = gui.addFolder("quality");
  const presetCtrl = qualityFolder.add(q, "quality", ["low", "medium", "high"]).name("preset");
  qualityFolder.add(q, "pixelRatio", 0.5, 2, 0.05).name("pixel ratio").onChange(setPixelRatio);
  qualityFolder.open();
  // the listener belongs to the preset select, not to the folder: on the folder it fires for the
  // pixel-ratio number box too (a number box emits change when it commits), so typing a ratio
  // re-applied the whole preset — which on the cloth means sewing a new sheet and wiping every tear
  presetCtrl.domElement.addEventListener("change", () => {
    if (q.quality === lastQuality) return;
    lastQuality = q.quality;
    onQuality(q.quality);
  });

  // ---- pointer ------------------------------------------------------------------
  const pointer = {
    ndc: new THREE.Vector2(0, 0),
    down: false, downAt: 0, moved: 0,
    dx: 0, dy: 0, // pixels moved since last frame
    over: false,
    raycast(target, obj) {
      const r = new THREE.Raycaster();
      r.setFromCamera(this.ndc, camera);
      const hit = target ? r.intersectObject(target, true) : [];
      return { hit, point: hit.length ? hit[0].point : null, ray: r.ray };
    },
  };
  const el = renderer.domElement;
  el.addEventListener("pointermove", (e) => {
    pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointer.dx += e.movementX || 0; pointer.dy += e.movementY || 0;
    pointer.over = true;
    if (pointer.down) pointer.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
  });
  el.addEventListener("pointerdown", (e) => {
    pointer.down = true; pointer.downAt = performance.now(); pointer.moved = 0;
    pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    el.setPointerCapture?.(e.pointerId);
  });
  const up = () => { pointer.down = false; };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", () => { pointer.over = false; });

  const clock = new THREE.Clock();
  const lab = {
    title, renderer, scene, camera, composer, bloomPass, orbit, clock, gui, q, fpsEl,
    pointer, fps, setSize, setPixelRatio, tickFps, setHud, hints,
    /** dt, capped so a slow frame (or a headless tab) never explodes the simulation. */
    step() { return Math.min(clock.getDelta(), 1 / 20); },
    render: () => composer.render(),
    onQuality(fn) { onQuality = fn; },
    /** jump to a preset and run the page handler; the dropdown follows */
    setQuality(name) { q.quality = name; lastQuality = name; presetCtrl.updateDisplay(); onQuality(name); },
    /** window.experiment: what the headless checks read and drive. */
    expose(api) { window.experiment = { THREE, renderer, scene, camera, lab, fps, ...api }; },
  };
  document.title = title;
  return lab;
}

/** PMREM room environment so metals have something to reflect. */
export async function roomEnvironment(renderer, scene, { intensity = 0.7, blur = 0.04 } = {}) {
  const { PMREMGenerator } = THREE;
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), blur).texture;
  scene.environment = tex;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  return tex;
}

/**
 * Gradient sky dome (top → horizon → ground haze) with an optional soft sun disc, added to the
 * scene. Cheaper and calmer than the Sky shader when the mood, not the physics, is the point.
 */
export function skyDome(scene, { top = 0x1d3a63, horizon = 0xdfeaf2, ground = 0x2b2620, radius = 260, sun = null, sunColor = 0xfff0d0, sunSize = 0.03, glow = 0.4 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uGround: { value: new THREE.Color(ground) },
      uSun: { value: new THREE.Vector3(0.4, 0.25, -0.9) },
      uSunColor: { value: new THREE.Color(sunColor) },
      uSunSize: { value: sunSize },
      uGlow: { value: glow },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uTop, uHorizon, uGround, uSun, uSunColor;
      uniform float uSunSize, uGlow;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uGround, pow(clamp(-h, 0.0, 1.0), 0.4));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += uSunColor * (pow(sd, 1.0 / max(1e-4, uSunSize * uSunSize)) * 2.4 + pow(sd, 8.0) * uGlow * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), mat);
  mesh.frustumCulled = false;
  mesh.name = "skyDome";
  scene.add(mesh);
  if (sun) mat.uniforms.uSun.value.copy(sun).normalize();
  return { mesh, material: mat, uniforms: mat.uniforms, setSun(v) { mat.uniforms.uSun.value.copy(v).normalize(); } };
}
