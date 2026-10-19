// Shared post-processing and image-based lighting for the five games: ACES tone mapping,
// a bloom pass, the CRT pass and an OutputPass, plus a PMREM room environment so metals
// and glass have something to reflect.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { attachCRT } from "./crt.js";

/** PMREM environment from three's RoomEnvironment. Returns the texture. */
export function setupEnvironment(renderer, scene, { intensity = 0.6, blur = 0.04 } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), blur).texture;
  scene.environment = tex;
  scene.environmentIntensity = intensity;
  return tex;
}

/**
 * Build the render pipeline: Render → Bloom → CRT → Output.
 * Returns { composer, bloom, crt, setSize(w,h), update(elapsed), render() }.
 */
export function createPost(renderer, scene, camera, {
  exposure = 1.0,
  bloom = { strength: 0.5, radius: 0.45, threshold: 0.92, scale: 0.5 },
  crt = { look: "cabinet", overrides: {}, overlay: true },
} = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const b = bloom.strength > 0
    ? new UnrealBloomPass(new THREE.Vector2(256, 256), bloom.strength, bloom.radius, bloom.threshold)
    : null;
  if (b) composer.addPass(b);

  const c = crt ? attachCRT(composer, renderer, crt) : null;
  composer.addPass(new OutputPass());

  const scale = bloom.scale ?? 0.5;
  function setSize(w, h) {
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (b) b.setSize(Math.max(64, Math.round(w * scale)), Math.max(64, Math.round(h * scale)));
    if (c) c.setSize(w, h);
  }
  function update(elapsed) { if (c) c.update(elapsed); }

  return { composer, bloom: b, crt: c, setSize, update, render: () => composer.render() };
}
