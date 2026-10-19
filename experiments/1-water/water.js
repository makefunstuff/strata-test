// Water surface for experiment 1: a displaced height-field mesh with a shader that does
//  - planar reflection (a mirrored camera rendered to an offscreen target, sampled along the
//    reflected ray and distorted by the wave normal),
//  - screen-space refraction of the scene below (same camera, water hidden), tinted by depth,
//  - Schlick Fresnel between the two, sun specular, and foam where the field is steep/chaotic.
// The wave field itself lives in sim.js (r = height, g = velocity, b = foam).
import * as THREE from "three";
import { glslValue2 } from "../shared/noise.js";

export function createWater(renderer, {
  width = 24, depth = 24, level = 0, segments = 160,
  state = null, reflMap = null, refrMap = null,
  deep = new THREE.Color(0.008, 0.070, 0.092), shallow = new THREE.Color(0.06, 0.33, 0.35),
  sun = new THREE.Vector3(0.4, 0.75, 0.3).normalize(),
} = {}) {
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uState: { value: state },
      uTexel: { value: 1 / 256 },
      uPool: { value: new THREE.Vector2(width, depth) },
      uLevel: { value: level },
      uRefl: { value: reflMap },
      uRefr: { value: refrMap },
      uMirrorVP: { value: new THREE.Matrix4() },
      uMainVP: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSun: { value: sun.clone() },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
      uDeep: { value: deep.clone() },
      uShallow: { value: shallow.clone() },
      uAmp: { value: 1.0 },
      uDetail: { value: 0.8 },
      uFoam: { value: 1.0 },
      uReflAmt: { value: 1.0 },
      uRefrAmt: { value: 1.0 },
      uEdge: { value: 0.9 },
    },
    vertexShader: /* glsl */`
      uniform sampler2D uState; uniform float uAmp, uDetail, uLevel, uTexel;
      varying vec3 vWorld; varying vec2 vUv; varying float vH; varying float vFoam; varying vec3 vN;
      void main(){
        vUv = uv;
        vec4 s = texture2D(uState, uv);
        vec2 t = vec2(uTexel);
        float hl = texture2D(uState, uv - vec2(t.x, 0.0)).r;
        float hr = texture2D(uState, uv + vec2(t.x, 0.0)).r;
        float hd = texture2D(uState, uv - vec2(0.0, t.y)).r;
        float hu = texture2D(uState, uv + vec2(0.0, t.y)).r;
        vec3 pos = position;
        pos.y += s.r * uAmp;
        vH = s.r; vFoam = s.b;
        vN = normalize(vec3((hl - hr) * uAmp, 1.0, (hd - hu) * uAmp) * 4.2);
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uState, uRefl, uRefr;
      uniform vec2 uPool; uniform float uLevel, uTime, uReflAmt, uRefrAmt, uFoam, uEdge, uDetail;
      uniform vec3 uCamPos, uSun, uSunColor, uDeep, uShallow;
      uniform mat4 uMirrorVP, uMainVP;
      varying vec3 vWorld; varying vec2 vUv; varying float vH; varying float vFoam; varying vec3 vN;
      ${glslValue2}
      vec2 puv(vec3 p){ return vec2(p.x / uPool.x + 0.5, 0.5 - p.z / uPool.y); }
      void main(){
        // wave-normal detail: the sim normal plus animated fine ripples
        vec2 q = vWorld.xz * 1.4;
        float n1 = fbm2(q * 2.2 + vec2(uTime * 0.35, -uTime * 0.22));
        float n2 = fbm2(q * 4.7 - vec2(uTime * 0.5, uTime * 0.31));
        vec3 det = vec3((n1 - 0.5) * 0.06 + (n2 - 0.5) * 0.03, 0.0, (n2 - 0.5) * 0.055) * uDetail;
        vec3 N = normalize(vN + det * 12.0);
        vec3 V = normalize(vWorld - uCamPos);
        float ndv = clamp(dot(N, -V), 0.0, 1.0);
        float slope = length(vec3(vN.x, 0.0, vN.z)) * 4.0;

        // planar reflection along the mirrored camera's projection
        vec3 R = reflect(V, N);
        vec3 hit = vWorld + R * max(0.0, (uLevel + 0.02 - vWorld.y) / max(1e-4, R.y));
        vec4 rc = uMirrorVP * vec4(hit, 1.0);
        vec2 reflUV = rc.xy / max(1e-4, rc.w) * 0.5 + 0.5;
        vec3 refl = texture2D(uRefl, clamp(reflUV, 0.001, 0.999)).rgb;

        // refraction: the scene below, offset by the surface normal
        vec4 qc = uMainVP * vec4(vWorld + vec3(N.x, 0.0, N.z) * 1.9 * uRefrAmt, 1.0);
        vec2 refrUV = qc.xy / max(1e-4, qc.w) * 0.5 + 0.5;
        vec3 refr = texture2D(uRefr, clamp(refrUV, 0.001, 0.999)).rgb;

        // depth tint (path length through the water column to the floor)
        float thickness = max(0.05, (uLevel + 2.9) / max(0.25, -V.y));
        vec3 tint = mix(uShallow, uDeep, 1.0 - exp(-thickness * 0.22));
        vec3 water = refr * tint * 1.7 + uDeep * 0.55;

        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 col = mix(water, refl * uReflAmt, clamp(F * 1.25, 0.0, 1.0));

        // sun glint
        vec3 H = normalize(-V + uSun);
        float spec = pow(max(dot(N, H), 0.0), 150.0) + pow(max(dot(N, H), 0.0), 30.0) * 0.22;
        col += uSunColor * spec * 1.7;

        // foam: from the field, from steepness, and a bright lip at the pool edge
        float e = min(min(puv(vWorld).x, 1.0 - puv(vWorld).x), min(puv(vWorld).y, 1.0 - puv(vWorld).y)) * uPool.x;
        float rim = smoothstep(0.55, 0.0, e) * uEdge;
        float f = clamp(smoothstep(0.25, 0.85, vFoam) * 1.2 + slope * 0.18 + rim, 0.0, 1.2);
        float fn = f * smoothstep(0.45, 0.95, fbm2(vWorld.xz * 3.4 + uTime * 0.6) + 0.18);
        col = mix(col, vec3(0.90, 0.95, 1.0), clamp(fn, 0.0, 0.72) * uFoam);

        // thin-water sheen on the crests
        col += uSunColor * smoothstep(0.35, 1.0, vH) * 0.05;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.frustumCulled = false;
  mesh.name = "water";
  mesh.renderOrder = 2;
  return { mesh, material: mat, uniforms: mat.uniforms, geo };
}

/** Caustic pool floor: procedural tiles + wave-focused caustics + depth falloff. */
export function createFloor(renderer, { width = 24, depth = 24, y = -2.9, state = null } = {}) {
  const geo = new THREE.PlaneGeometry(width, depth, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uState: { value: state },
      uTexel: { value: 1 / 256 },
      uPool: { value: new THREE.Vector2(width, depth) },
      uTime: { value: 0 },
      uCaustic: { value: 1.0 },
      uFocus: { value: 26.0 },
      uTile: { value: new THREE.Vector2(6, 6) },
      uLight: { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uState; uniform vec2 uPool, uTile; uniform float uTime, uCaustic, uFocus, uTexel;
      uniform vec3 uLight;
      varying vec3 vWorld;
      ${glslValue2}
      vec2 puv(vec3 p){ return vec2(p.x / uPool.x + 0.5, 0.5 - p.z / uPool.y); }
      float caust(vec2 uv, float t){
        vec2 p = uv * 9.0; vec2 i = p; float c = 1.0;
        for (int k = 0; k < 4; k++){
          vec2 q = vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
          i += 1.06 * q;
        }
        return pow(clamp(1.0 - abs(i.y - i.x), 0.0, 1.0), 6.0);
      }
      void main(){
        vec2 uv = puv(vWorld);
        // wave focusing: the laplacian of the surface acts as a lens
        vec2 t = vec2(uTexel);
        float h = texture2D(uState, uv).r;
        float l = texture2D(uState, uv - vec2(t.x,0.0)).r, r = texture2D(uState, uv + vec2(t.x,0.0)).r;
        float d = texture2D(uState, uv - vec2(0.0,t.y)).r, u = texture2D(uState, uv + vec2(0.0,t.y)).r;
        float lens = 1.0 + (l + r + u + d - 4.0 * h) * uFocus;
        float c = caust(uv * 2.0 + vWorld.xz * 0.04, uTime * 0.55) + 0.65 * caust(uv * 3.1 - vWorld.xz * 0.03, uTime * 0.42 + 3.0);
        c *= clamp(lens, 0.0, 3.0);
        // tiles: grout lines, per-tile shade variation, speckle
        vec2 g = fract(vWorld.xz / 1.6) - 0.5;
        float grout = smoothstep(0.02, 0.06, max(abs(g.x), abs(g.y)));
        float tileId = hash21(floor(vWorld.xz / 1.6));
        vec3 base = mix(vec3(0.13, 0.36, 0.42), vec3(0.21, 0.52, 0.58), tileId) * (0.72 + 0.28 * grout);
        base += vec3(0.02, 0.05, 0.05) * fbm2(vWorld.xz * 5.0);
        vec3 col = base + vec3(0.42, 0.72, 0.66) * c * uCaustic * 1.5;
        col *= 0.55 + 0.45 * smoothstep(0.0, 1.0, dot(normalize(vec3(0.0, 1.0, 0.0)), uLight) + 0.4);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.name = "floor";
  return { mesh, material: mat, uniforms: mat.uniforms };
}

/** Mirrored camera for a horizontal reflector at height `level`. */
export function mirrorCamera(camera, level, target) {
  const cam = camera.clone();
  cam.layers.enableAll();
  const eye = camera.position, look = target;
  cam.position.set(eye.x, 2 * level - eye.y, eye.z);
  cam.up.set(0, 1, 0);
  cam.lookAt(look.x, 2 * level - look.y, look.z);
  cam.near = camera.near; cam.far = camera.far;
  cam.fov = camera.fov; cam.aspect = camera.aspect;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}
