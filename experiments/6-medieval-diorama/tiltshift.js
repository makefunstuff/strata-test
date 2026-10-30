// A tilt-shift / miniature pass: blur grows with distance from a horizontal focus band, plus a
// nudge of saturation and a vignette, which is most of what makes a render read as a model.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFocus: { value: 0.52 },
    uRange: { value: 0.42 },
    uPower: { value: 1.0 },
    uAmount: { value: 0.0075 },
    uSaturation: { value: 1.16 },
    uVignette: { value: 0.32 },
    uWarm: { value: 0.05 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uFocus, uRange, uPower, uAmount, uSaturation, uVignette, uWarm;
    // a fixed disc of offsets: one blur loop, no dependent reads, cheap on a phone
    const vec2 D[12] = vec2[12](
      vec2(0.000, 0.000), vec2(0.610, 0.190), vec2(-0.480, 0.420), vec2(0.180, -0.710),
      vec2(-0.720, -0.230), vec2(0.330, 0.780), vec2(0.880, -0.360), vec2(-0.260, -0.950),
      vec2(-0.930, 0.510), vec2(0.710, 0.620), vec2(0.060, -0.360), vec2(-0.550, 0.080));
    void main() {
      float d = abs(vUv.y - uFocus) / max(uRange, 1e-4);
      d = pow(clamp(d, 0.0, 1.0), uPower);
      float r = d * uAmount;
      vec4 c = vec4(0.0);
      for (int i = 0; i < 12; i++) c += texture2D(tDiffuse, vUv + D[i] * vec2(r * 1.35, r));
      c /= 12.0;
      vec4 sharp = texture2D(tDiffuse, vUv);
      vec4 col = mix(sharp, c, smoothstep(0.12, 1.0, d));
      // the toy look: a little more colour, a little warmth in the highlights, corners falling away
      float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(vec3(l), col.rgb, uSaturation);
      col.rgb += vec3(uWarm, uWarm * 0.5, -uWarm * 0.4) * smoothstep(0.45, 1.0, l);
      float vig = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(1.12, 1.0)));
      col.rgb *= mix(1.0, vig, uVignette);
      gl_FragColor = vec4(col.rgb, 1.0);
    }`,
};

export function addTiltShift(composer, before) {
  const pass = new ShaderPass(TiltShiftShader);
  if (before) {
    // put it just before the OutputPass so tone mapping still happens afterwards
    const i = composer.passes.indexOf(before);
    composer.passes.splice(i < 0 ? composer.passes.length : i, 0, pass);
  } else {
    composer.addPass(pass);
  }
  return pass;
}
