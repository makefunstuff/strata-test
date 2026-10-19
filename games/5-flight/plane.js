// The player plane: a low-poly arcade jet built from boxes and a cone, with a spinning
// prop, a lit canopy rim and an exhaust glow. Built once; the loop only moves it.
import * as THREE from "three";
import { glowTexture } from "../shared/textures.js";

export function createPlaneMesh(scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xdde6f2, metalness: 0.8, roughness: 0.3, envMapIntensity: 1.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.6, roughness: 0.42, envMapIntensity: 1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x10202c, emissive: 0x35d0ff, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.4 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fe0ff, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.6,
    envMapIntensity: 1.8, clearcoat: 1,
  });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // nose is -z, so forward is (0,0,-1)
  add(new THREE.BoxGeometry(1.1, 0.95, 4.6), skin, 0, 0, 0);
  const nose = add(new THREE.ConeGeometry(0.55, 1.5, 10), dark, 0, 0, -3.0);
  nose.rotation.x = -Math.PI / 2;
  add(new THREE.BoxGeometry(10.6, 0.2, 1.7), skin, 0, 0.06, -0.3);
  add(new THREE.BoxGeometry(0.5, 0.42, 1.2), accent, 5.2, 0.1, -0.3);
  add(new THREE.BoxGeometry(0.5, 0.42, 1.2), accent, -5.2, 0.1, -0.3);
  add(new THREE.BoxGeometry(3.8, 0.16, 1.15), skin, 0, 0.12, 2.15);
  add(new THREE.BoxGeometry(0.18, 1.25, 1.3), skin, 0, 0.72, 2.15);
  add(new THREE.BoxGeometry(0.14, 0.5, 0.7), accent, 0, 1.22, 2.15);
  const canopy = add(new THREE.SphereGeometry(0.72, 14, 10), glass, 0, 0.62, -0.9);
  canopy.scale.set(0.72, 0.6, 1.5);

  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.55);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.14, 0.09), dark);
  prop.add(blade);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.22, 10), accent);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  group.add(prop);

  const exhaust = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xff9f4a, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  );
  exhaust.position.set(0, 0, 2.5);
  group.add(exhaust);

  const tipL = new THREE.Object3D(); tipL.position.set(5.2, 0.1, -0.3); group.add(tipL);
  const tipR = new THREE.Object3D(); tipR.position.set(-5.2, 0.1, -0.3); group.add(tipR);

  scene.add(group);
  return { group, prop, exhaust: exhaust.material, accent, tipL, tipR, skin };
}
