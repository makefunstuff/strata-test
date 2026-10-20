// Experiment 4 — boid rendering. One InstancedBufferGeometry, one draw call: each instance reads
// its own position and velocity out of the simulation textures in the vertex shader, builds a
// frame from the velocity and stretches a dart along it. Fog comes from the scene, so the flock
// dissolves into the haze at distance.
import * as THREE from "three";

const vert = /* glsl */`
attribute float aIndex;
uniform sampler2D uPosTex;
uniform sampler2D uVelTex;
uniform float uSize;
uniform float uScale;
uniform float uStretch;
uniform float uMinSpeed, uMaxSpeed;
uniform float uColorMode;
uniform vec3 uSun;
uniform vec3 uColA, uColB, uColC;
varying vec3 vCol;
varying float vShade;
#include <fog_pars_vertex>

void main() {
  vec2 uv = (vec2(mod(aIndex, uSize), floor(aIndex / uSize)) + 0.5) / uSize;
  vec3 p = texture2D(uPosTex, uv).xyz;
  vec3 v = texture2D(uVelTex, uv).xyz;
  float sp = length(v);
  vec3 fwd = normalize(v + vec3(1e-3, 0.0, 0.0));
  vec3 upRef = abs(fwd.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 side = normalize(cross(upRef, fwd));
  vec3 up = cross(fwd, side);
  mat3 B = mat3(side * uScale, up * uScale, fwd * uScale * uStretch);
  vec3 wp = p + B * position;

  vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vec3 n = normalize(B * normal);
  vShade = 0.34 + 0.85 * max(dot(n, uSun), 0.0) + 0.18 * max(dot(-n, uSun), 0.0);

  float t = clamp((sp - uMinSpeed) / max(uMaxSpeed - uMinSpeed, 0.01), 0.0, 1.0);
  float m = uColorMode;
  if (m < 0.5) vCol = mix(uColA, uColB, t);
  else if (m < 1.5) vCol = mix(uColA, uColB, 0.5 + 0.5 * fwd.z) * (0.75 + 0.5 * t);
  else vCol = mix(uColB, uColC, clamp(wp.y * 0.035 + 0.5, 0.0, 1.0));
  #include <fog_vertex>
}`;

const frag = /* glsl */`
precision highp float;
varying vec3 vCol;
varying float vShade;
#include <fog_pars_fragment>

void main() {
  gl_FragColor = vec4(vCol * vShade, 1.0);
  #include <fog_fragment>
}`;

export function createBoids(flock, opts = {}) {
  const base = new THREE.TetrahedronGeometry(0.5);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", base.getAttribute("position"));
  geo.setAttribute("normal", base.getAttribute("normal"));
  const n = flock.n, count = n * n;
  const idx = new Float32Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  geo.setAttribute("aIndex", new THREE.InstancedBufferAttribute(idx, 1));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uPosTex: { value: null }, uVelTex: { value: null },
      uSize: { value: n }, uScale: { value: opts.scale ?? 0.32 }, uStretch: { value: opts.stretch ?? 2.4 },
      uMinSpeed: { value: 3 }, uMaxSpeed: { value: 10 }, uColorMode: { value: 0 },
      uSun: { value: new THREE.Vector3(0.5, 0.6, 0.6).normalize() },
      uColA: { value: new THREE.Color(0x1b2a44) }, uColB: { value: new THREE.Color(0xf0a04a) },
      uColC: { value: new THREE.Color(0x9fd8e8) },
    },
  ]);

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag, fog: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.sync = () => {
    material.uniforms.uPosTex.value = flock.positionTexture;
    material.uniforms.uVelTex.value = flock.velocityTexture;
  };
  mesh.geometry2 = geo;
  mesh.material2 = material;
  return mesh;
}
