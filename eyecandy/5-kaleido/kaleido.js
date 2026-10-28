// Eye candy 5 — Kaleidoscope. A generator feeding a feedback loop. The source is domain-warped fBm
// plus voronoi shards and drifting rings; the buffer lives in *wedge space* (x is the angle inside
// one wedge, y is the radius), which makes the two things a kaleidoscope does to itself — rotate and
// zoom — into a texture lookup: shift x, scale y, multiply by a fade, add the new frame. The display
// pass then mirrors that single wedge n times around the circle.
import * as THREE from "three";
import { GLSL } from "../shared/candy.js";

export const PALETTES = {
  oil: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 1.0], d: [0.00, 0.20, 0.50] },
  peacock: { a: [0.45, 0.40, 0.45], b: [0.45, 0.42, 0.45], c: [1.0, 1.0, 1.0], d: [0.62, 0.35, 0.12] },
  sunset: { a: [0.52, 0.36, 0.24], b: [0.46, 0.42, 0.38], c: [1.0, 1.0, 0.9], d: [0.00, 0.12, 0.24] },
  magma: { a: [0.30, 0.16, 0.10], b: [0.60, 0.45, 0.30], c: [1.0, 1.0, 1.0], d: [0.10, 0.32, 0.55] },
  ice: { a: [0.35, 0.45, 0.58], b: [0.42, 0.42, 0.40], c: [1.0, 1.0, 1.0], d: [0.55, 0.42, 0.28] },
  acid: { a: [0.40, 0.52, 0.30], b: [0.50, 0.45, 0.55], c: [1.0, 1.0, 0.8], d: [0.30, 0.62, 0.05] },
  neon: { a: [0.42, 0.20, 0.48], b: [0.52, 0.42, 0.52], c: [1.0, 0.9, 1.0], d: [0.85, 0.42, 0.18] },
};

const SRC_GLSL = /* glsl */`
  // the generator, evaluated in wedge space: x = angle across the wedge, y = radius
  vec3 source(vec2 uv, float t, float scale, float warp, float shards, float hue, vec3 pa, vec3 pb, vec3 pc, vec3 pd){
    vec2 p = vec2(uv.x * 3.0, uv.y * 3.2) * scale;
    vec2 q = warp2(p * 0.9, t * 0.12, 1.15 * warp);
    float body = fbm2(q) ;
    float rings = 0.5 + 0.5 * sin((length(p) * 6.0 - t * 0.7 + body * 4.0) * TAU * 0.5);
    float veins = ridge2(q * 1.7 + vec2(t * 0.05, -t * 0.08));
    // voronoi shards: hard facets that catch the light as the whole thing turns
    vec2 vp = q * 2.4 + vec2(t * 0.05, 0.0);
    vec2 vi = floor(vp), vf = fract(vp), best = vec2(9.0), bid = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + hash22(vi + o) - vf;
      if (dot(r, r) < dot(best, best)) { best = r; bid = vi + o; }
    }
    float facet = pow(1.0 - clamp(length(best) * 1.6, 0.0, 1.0), 3.0);
    float cell = hash21(bid * 1.7 + floor(t * 0.5) * 0.11);
    float spark = pow(hash21(bid + floor(t * 6.0) * 0.37), 34.0);

    float m = body * 0.72 + rings * 0.26 + veins * 0.42 * shards + facet * 0.55 * shards;
    vec3 c = palette(m * 1.25 + hue + t * 0.02 + cell * 0.06, pa, pb, pc, pd);
    c *= 0.55 + 0.85 * body;
    c += facet * shards * 0.35 * palette(m + hue + 0.2, pa, pb, pc, pd);
    c += spark * 1.6;
    // the middle of the wedge is the mirror axis: brighten it so the seams read as glass edges
    c *= 0.85 + 0.5 * exp(-pow(uv.x * 7.0, 2.0)) + 0.35 * exp(-pow((uv.x - 1.0) * 7.0, 2.0));
    return c;
  }`;

export function kaleidoscope({ size = 1024, palette = "peacock" } = {}) {
  const P = {
    folds: 14, spin: 0.012, zoom: 1.0, damp: 0.88, sourceMix: 0.3, scale: 2.1,
    warp: 1.5, shards: 1.3, speed: 1.0, hue: 0.0, palette, bloom: 0.55, exposure: 0.92, curve: 1,
  };
  const pal = PALETTES[palette] ?? PALETTES.oil;

  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping };
  const rt = [new THREE.WebGLRenderTarget(size, size, rtOpts), new THREE.WebGLRenderTarget(size, size, rtOpts)];
  let cur = 0;

  const fbScene = new THREE.Scene();
  const fbCam = new THREE.Camera();

  // ---- the feedback pass: rotate + zoom the buffer in wedge space, add the new frame -------------
  const fbMat = new THREE.ShaderMaterial({
    uniforms: {
      tPrev: { value: null },
      uTime: { value: 0 },
      uDt: { value: 1 / 60 },
      uDamp: { value: P.damp },
      uSpin: { value: P.spin },
      uZoom: { value: P.zoom },
      uSourceMix: { value: P.sourceMix },
      uScale: { value: P.scale },
      uWarp: { value: P.warp },
      uShards: { value: P.shards },
      uSpeed: { value: P.speed },
      uHue: { value: P.hue },
      uPalA: { value: new THREE.Vector3(...pal.a) },
      uPalB: { value: new THREE.Vector3(...pal.b) },
      uPalC: { value: new THREE.Vector3(...pal.c) },
      uPalD: { value: new THREE.Vector3(...pal.d) },
      uPulse: { value: 0 },
      uPulseAt: { value: 0 },
    },
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL + SRC_GLSL + /* glsl */`
      precision highp float;
      uniform sampler2D tPrev;
      uniform float uTime, uDt, uDamp, uSpin, uZoom, uSourceMix, uScale, uWarp, uShards, uSpeed, uHue, uPulse, uPulseAt;
      uniform vec3 uPalA, uPalB, uPalC, uPalD;
      varying vec2 vUv;
      void main(){
        // the loop: last frame, rotated (shift in angle) and zoomed (scale in radius)
        vec2 sp = vec2(vUv.x - uSpin * uDt, vUv.y / uZoom);
        vec3 prev = texture2D(tPrev, sp).rgb * pow(uDamp, uDt * 60.0);
        // ...and if the zoom pushed content past the rim, the generator fills the gap
        if (vUv.y / uZoom > 1.0) prev = vec3(0.0);
        vec3 src = source(vUv, uTime * uSpeed, uScale, uWarp, uShards, uHue, uPalA, uPalB, uPalC, uPalD);
        vec3 c = mix(prev, src, uSourceMix);
        // a click injects a bright expanding ring of new light
        float dt = uTime - uPulseAt;
        if (dt < 2.4 && uPulse > 0.0) {
          float rr = dt * 0.62;
          c += palette(rr + uHue, uPalA, uPalB, uPalC, uPalD)
             * exp(-pow((vUv.y - rr) * 9.0, 2.0)) * uPulse * exp(-dt * 1.6) * 1.9;
        }
        gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
      }`,
  });
  fbScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fbMat));

  // ---- the display pass: mirror the wedge n times -------------------------------------------------
  const dispMat = new THREE.ShaderMaterial({
    uniforms: {
      tBuf: { value: rt[0].texture },
      uFolds: { value: P.folds },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uRot: { value: 0 },
      uExposure: { value: P.exposure },
      uCurved: { value: 1 },
    },
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL + /* glsl */`
      precision highp float;
      uniform sampler2D tBuf;
      uniform float uFolds, uTime, uRot, uExposure, uCurved;
      uniform vec2 uRes;
      varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x) + uRot;
        // fold the circle into one wedge, mirroring at each seam
        float wedge = TAU / max(1.0, uFolds);
        float t = mod(a, wedge * 2.0);
        t = abs(t - wedge);
        float u = t / wedge;
        // a touch of barrel so the glass reads as a lens, not a square
        float rr = mix(r * 0.5 + 0.5, pow(clamp(r * 0.5 + 0.5, 0.0, 1.0), 1.0 / 1.18), uCurved);
        vec3 c = texture2D(tBuf, vec2(u, clamp(rr, 0.0, 1.0))).rgb;
        // the very centre is where all the wedges meet: keep it clean and bright
        c *= 0.72 + 0.55 * smoothstep(0.0, 0.35, rr);
        // the rim is where the afterimage accumulates most — hold it back so the pattern stays crisp
        c *= 1.0 - 0.42 * smoothstep(0.52, 1.0, rr);
        c = pow(max(c, vec3(0.0)), vec3(1.12));                     // contrast
        c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.28);  // and colour
        c *= uExposure;
        // a dark rim and a hairline ring frame the picture
        c *= smoothstep(1.06, 0.96, r);
        c += vec3(0.6, 0.75, 1.0) * smoothstep(0.004, 0.0, abs(r - 0.985)) * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dispMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dispMat);
  dispMesh.frustumCulled = false;
  dispMesh.name = "kaleido";

  return {
    P,
    mesh: dispMesh,
    feedback: fbMat,
    display: dispMat,
    /** run the feedback pass; call once per frame before the composer renders */
    step(renderer, dt) {
      const prev = rt[cur], next = rt[1 - cur];
      fbMat.uniforms.tPrev.value = prev.texture;
      fbMat.uniforms.uDt.value = Math.min(0.05, dt);
      renderer.setRenderTarget(next);
      renderer.render(fbScene, fbCam);
      renderer.setRenderTarget(null);
      cur = 1 - cur;
      dispMat.uniforms.tBuf.value = next.texture;
    },
    clear(renderer) {
      for (const r of rt) { renderer.setRenderTarget(r); renderer.clear(true, true, true); }
      renderer.setRenderTarget(null);
    },
    setSize(w, h) {
      const n = Math.max(256, Math.round(size));
      for (const r of rt) if (r.width !== n) r.setSize(n, n);
      dispMat.uniforms.uRes.value.set(w, h);
    },
    setPalette(name) {
      const q = PALETTES[name] ?? PALETTES.oil;
      P.palette = PALETTES[name] ? name : P.palette;
      fbMat.uniforms.uPalA.value.set(...q.a);
      fbMat.uniforms.uPalB.value.set(...q.b);
      fbMat.uniforms.uPalC.value.set(...q.c);
      fbMat.uniforms.uPalD.value.set(...q.d);
    },
  };
}
