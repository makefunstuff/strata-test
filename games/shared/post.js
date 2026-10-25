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
 *
 * One rule, learned the hard way (tools/bloomprobe.mjs measures it, games/README.md quotes the
 * numbers): the bloom threshold has to sit ABOVE the brightest non-emissive surface in the
 * scene, i.e. in HDR (> 1). A threshold below the play content makes the bloom pass the frame's
 * colour grading layer — whatever is brightest (Breakout's near-white pastel brick faces) gets
 * blurred and added back over the whole tube, and the wash carries that object's hue. It looked
 * like a CRT bug and was not one: with the CRT pass disabled entirely the green remained.
 *
 * Returns { composer, bloom, crt, setSize(w,h), update(elapsed), render(), debug(name) }.
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

  /**
   * Post-chain bisection, for finding which pass owns a defect. The games are all one compositer
   * deep now, and "the sky is a white field" was only answerable by turning passes off one at a
   * time — so make that a call instead of an edit. Names: crt | bloom | tonemap | vignette.
   *
   *   post.debug({ crt: false })              // from --overjs / a console
   *   index.html?post=crt:0,bloom:0           // from the URL, no tooling
   */
  function debug({ crt: onCrt, bloom: onBloom, tonemap, vignette } = {}) {
    if (c) {
      if (onCrt !== undefined) c.setEnabled(!!onCrt);
      if (vignette !== undefined) c.uniforms.uVignette.value = vignette ? c.uniforms.uVignette.userData.base : 0;
    }
    if (b && onBloom !== undefined) b.enabled = !!onBloom;
    if (tonemap !== undefined) {
      renderer.toneMapping = tonemap ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.needsUpdate = true;
    }
    return { crt: c?.pass.enabled ?? null, bloom: b?.enabled ?? null, tonemap: renderer.toneMapping };
  }
  const qp = new URLSearchParams(location.search).get("post");
  if (qp) {
    const on = (n) => qp.split(",").some((t) => t.trim() === `${n}:1`);
    const off = (n) => qp.split(",").some((t) => t.trim() === `${n}:0`);
    debug({
      ...(off("crt") ? { crt: false } : on("crt") ? { crt: true } : {}),
      ...(off("bloom") ? { bloom: false } : on("bloom") ? { bloom: true } : {}),
      ...(off("tonemap") ? { tonemap: false } : on("tonemap") ? { tonemap: true } : {}),
    });
  }
  if (c) c.uniforms.uVignette.userData = { base: c.uniforms.uVignette.value };
  function setSize(w, h) {
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (b) b.setSize(Math.max(64, Math.round(w * scale)), Math.max(64, Math.round(h * scale)));
    if (c) c.setSize(w, h);
  }
  function update(elapsed) { if (c) c.update(elapsed); }

  return { composer, bloom: b, crt: c, setSize, update, render: () => composer.render(), debug };
}
