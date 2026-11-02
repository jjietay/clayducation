// Toy 3D parts (style: styles/toy-3d.md). Three.js through s.three().
// import { world, showK, AX, gizmo, gizmoGrow, tube, stretch, setOpacity, makeTank, fileCube, nasTower, cart } from '/_lib/toy3d.js';
//
// Two rules learned on the GPU path (see SKILL.md step 8b):
//  - Hide an object with showK(obj, k) (a tiny scale), not with obj.visible = false. An object
//    that is first drawn mid-scene can miss its first frame.
//  - Call `await g.ready()` at the end of setup, so every material is compiled before the first frame.
import { C, K, BG } from './common.js';

export const AX = { x: '#d64545', y: '#43aa8b', z: '#4d7cfe' };   // frame axes: x red, y green, z blue

// The studio: soft light, one shadow-casting key, a shadow-only floor. Returns g with helpers:
// g.mat(color, opts), g.box(w, h, d, color), g.ball(r, color), g.cyl(r, h, color), g.proj(vec3) -> [x, y] stage px,
// g.wp(obj) -> stage px of its world position, g.orbit(azDeg, elDeg, dist, look[3]), g.ready().
export async function world(s, { floor = true, bg = BG.pink } = {}) {
  const g = await s.three({ bg });
  const { THREE, scene } = g;
  scene.add(new THREE.HemisphereLight('#ffffff', bg, 1.3));
  const key = new THREE.DirectionalLight('#ffffff', 1.9);
  key.position.set(5, 10, 7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); key.shadow.radius = 6;
  scene.add(key);
  if (floor) { const f = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 })); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; scene.add(f); }
  // Opaque unless an opacity below 1 is asked for: transparent materials sort badly.
  g.mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, transparent: (o.opacity ?? 1) < 1, ...o });
  g.box = (w, h, d, color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), g.mat(color)); m.castShadow = true; m.receiveShadow = true; return m; };
  g.ball = (r, color) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), g.mat(color)); m.castShadow = true; return m; };
  g.cyl = (r, h, color, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), g.mat(color)); m.castShadow = true; m.receiveShadow = true; return m; };
  g.proj = (v) => { const p = v.clone().project(g.camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
  g.wp = (obj) => g.proj(obj.getWorldPosition(new THREE.Vector3()));
  g.orbit = (az, el, dist, look) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; g.camera.position.set(look[0] + dist * Math.cos(e) * Math.sin(a), look[1] + dist * Math.sin(e), look[2] + dist * Math.cos(e) * Math.cos(a)); g.camera.lookAt(...look); g.camera.updateMatrixWorld(); };
  g.ready = () => g.renderer.compileAsync(scene, g.camera);
  return g;
}
// Show an object at scale k (0 = hidden by a tiny scale, so it is still drawn and its shader is ready).
export function showK(obj, k, base = 1) { obj.scale.setScalar(base * Math.max(1e-4, k)); }

// A frame gizmo: three rounded arrows (x red forward, y green left, z blue up). ROS axes -> Three.js: (x, y, z) -> (x, z, -y).
export function gizmo(g, L = 1, r = 0.05) {
  const { THREE } = g, grp = new THREE.Group();
  const mk = (col, dir) => {
    const m = g.mat(col), a = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L * 0.8, 14), m), cone = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, L * 0.22, 18), m);
    cyl.position.y = L * 0.4; cone.position.y = L * 0.89; cyl.castShadow = cone.castShadow = true; a.add(cyl, cone);
    a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); grp.add(a); return a;
  };
  grp.userData = { x: mk(AX.x, new THREE.Vector3(1, 0, 0)), y: mk(AX.y, new THREE.Vector3(0, 0, -1)), z: mk(AX.z, new THREE.Vector3(0, 1, 0)), L };
  const c = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 16, 12), g.mat('#fff4f0')); c.castShadow = true; grp.add(c);
  return grp;
}
// Grow each axis of a gizmo from 0 to 1.
export function gizmoGrow(gz, kx, ky, kz) { const d = gz.userData; d.x.scale.set(1, Math.max(1e-4, kx), 1); d.y.scale.set(1, Math.max(1e-4, ky), 1); d.z.scale.set(1, Math.max(1e-4, kz), 1); }
// A tube from a to b (Vector3).
export function tube(g, a, b, r = 0.05, color = '#d8c7cf') {
  const { THREE } = g, d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), g.mat(color));
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
// Stretch a unit tube (made with tube(g, (0,0,0), (0,1,0))) from a to b.
export function stretch(THREE, m, a, b) {
  const d = b.clone().sub(a), L = Math.max(0.001, d.length());
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.scale.set(1, L, 1);
}
// Fade a whole group (materials must be made with an opacity < 1 to blend).
export function setOpacity(obj, o) { obj.traverse((m) => { if (m.material) { m.material.opacity = o; m.material.transparent = o < 1; m.material.depthWrite = o > 0.6; } }); }

// The tank robot: 1 unit = 10 cm. Body, two tracks, a plate, a lidar puck, eyes on the front. Forward = +x.
export function makeTank(g, { color = C.robot } = {}) {
  const { THREE } = g, t = new THREE.Group();
  const body = g.box(3.0, 0.7, 1.9, color); body.position.y = 0.55;
  const tr1 = g.box(3.3, 0.5, 0.42, '#5b5f73'); tr1.position.set(0, 0.3, 1.1);
  const tr2 = g.box(3.3, 0.5, 0.42, '#5b5f73'); tr2.position.set(0, 0.3, -1.1);
  const plate = g.box(1.6, 0.12, 1.4, C.robotLight); plate.position.y = 0.96;
  const puck = g.cyl(0.28, 0.2, C.scan); puck.position.set(0.5, 1.32, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 16), g.mat('#fff4f0')); nose.rotation.z = -Math.PI / 2; nose.position.set(1.62, 0.6, 0);
  const eyeW = g.mat('#ffffff'), eyeK = g.mat(C.ink);
  for (const z of [-0.42, 0.42]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), eyeW); e.position.set(1.5, 0.66, z); e.scale.set(0.5, 1, 1);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), eyeK); p.position.set(1.58, 0.66, z);
    t.add(e, p);
  }
  t.add(body, tr1, tr2, plate, puck, nose); t.userData = { body, puck };
  return t;
}
// One file: a pink cube on an amber tile (the Zarr "one file per chunk" picture). Shares geometry and materials.
export function fileCube(g, shared = null) {
  const { THREE } = g;
  const S = shared || { tileG: new THREE.BoxGeometry(0.36, 0.06, 0.36), cubeG: new THREE.BoxGeometry(0.26, 0.26, 0.26), mT: g.mat(K.folder), mC: g.mat(K.chunk) };
  const grp = new THREE.Group();
  const tl = new THREE.Mesh(S.tileG, S.mT); tl.castShadow = tl.receiveShadow = true; tl.position.y = 0.03;
  const cb = new THREE.Mesh(S.cubeG, S.mC); cb.castShadow = true; cb.position.y = 0.19;
  grp.add(tl, cb); grp.userData.shared = S;
  return grp;
}
// A network drive: a grey tower with light stripes. Feet at y = 0.
export function nasTower(g) {
  const { THREE } = g, grp = new THREE.Group();
  const tower = g.box(1.2, 2.4, 1.2, '#8d93a8'); tower.position.y = 1.2; grp.add(tower);
  for (let i = 0; i < 4; i++) { const l = g.box(0.8, 0.08, 0.04, '#e3e6ee'); l.position.set(0, 0.5 + i * 0.5, 0.62); grp.add(l); }
  return grp;
}
// A small cart with four wheels and a load slot (grp.userData.load = a pink cube).
export function cart(g, { color = K.worker } = {}) {
  const { THREE } = g, grp = new THREE.Group();
  const body = g.box(0.7, 0.28, 0.5, color); body.position.y = 0.3; grp.add(body);
  for (const [x, z] of [[-0.25, -0.27], [0.25, -0.27], [-0.25, 0.27], [0.25, 0.27]]) { const w = g.cyl(0.1, 0.06, '#3d4152'); w.rotation.x = Math.PI / 2; w.position.set(x, 0.12, z); grp.add(w); }
  const load = g.box(0.26, 0.26, 0.26, K.chunk); load.position.y = 0.6; grp.add(load);
  grp.userData.load = load;
  return grp;
}
