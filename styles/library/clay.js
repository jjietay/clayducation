// The clay kit in a scene (style: styles/clay.md). Every model and the mascot share one look.
//   const g = await s.clay({ bg: BG.sage });
//   const hero = await g.mascot(), bot = await g.model('tank');
//   g.orbit(20, 12, 40, [0, 3, 0]); await g.ready();          // in setup
//   hero.blendExpression('neutral', 'surprised', s.p('#wow')); g.render();   // in draw
import * as THREE from 'three';
import { createMascot, studio, EXPRESSIONS, CACHE } from './clay/mascot.js';
import { cone } from './clay/sdf.js';
import { buildModel, MODELS, MODEL_NAMES, PAL } from './clay/models.js';

export { EXPRESSIONS, MODELS, MODEL_NAMES, PAL };
// Muted plain backgrounds of this look, one for each part. Text on them is dark, except on navy.
export const BG = { sage: '#6c9575', cream: '#f0e7d6', sand: '#e4d3b7', sky: '#a9c4cf', blush: '#e6bfae', clay: '#c98f6b', lilac: '#b9b3cf', navy: '#27324a' };

let manifest = null; const saved = {};
const FILES = '/_lib/clay/cache';
CACHE.read = (k) => saved[k];
async function load(test) {
  if (!manifest) {
    const r = await fetch(`${FILES}/manifest.json`);
    if (!r.ok) throw new Error('the clay shapes are missing. Run "make bake".');
    manifest = await r.json();
  }
  await Promise.all(Object.entries(manifest).filter(([k]) => test(k) && !saved[k]).map(async ([k, n]) => {
    const b = await (await fetch(`${FILES}/${k}.bin`)).arrayBuffer();
    saved[k] = { pos: new Float32Array(b, 0, n.v * 3), nor: new Float32Array(b, n.v * 12, n.v * 3), col: new Float32Array(b, n.v * 24, n.v * 3), tri: new Uint32Array(b, n.v * 36, n.t) };
  }));
}

// One renderer for the whole video. Chrome keeps only about 16 WebGL contexts, and a video in
// 3D has more scenes than that. Antialiasing is off: on the GPU path it drops whole objects at
// random. Twice the pixels, shrunk by the browser, make the edges smooth instead.
let shared = null;
function renderer(W, H) {
  if (shared) return shared;
  shared = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  shared.setPixelRatio(2); shared.setSize(W, H, false);
  shared.outputColorSpace = THREE.SRGBColorSpace; shared.toneMapping = THREE.NoToneMapping;
  shared.domElement.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:0`;
  return shared;
}

const shadowTexture = () => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(20,24,20,.42)'); g.addColorStop(0.6, 'rgba(20,24,20,.2)'); g.addColorStop(1, 'rgba(20,24,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
};
let shadowMap = null;

const meshOf = (g) => (g.isMesh ? g : g.children.find((c) => c.isMesh));

// How far a world point is from the surface of the nearest object.
// The object part nearest to a point, and how far the point is from its surface.
function nearestPart(models, point) {
  models = models.filter((m) => !m.hero && m.name !== 'arrow');
  const v = new THREE.Vector3(), inv = new THREE.Matrix4(), sc = new THREE.Vector3();
  let best = { gap: 9, m: null, part: null };
  for (const m of models) {
    m.root.updateMatrixWorld(true);
    for (const g of Object.values(m.groups)) {
      if (Math.abs(g.getWorldScale(sc).y) < 0.01) continue;
      inv.copy(g.matrixWorld).invert(); v.set(...point).applyMatrix4(inv);
      const pv = g.userData.pv, d = g.userData.f(v.x + pv[0], v.y + pv[1], v.z + pv[2]) * m.root.scale.x;
      if (d < best.gap) best = { gap: d, m, part: g.userData.part };
    }
  }
  return best;
}
function surfaceGap(models, point) {
  return nearestPart(models, point).gap;
}

function offFrame(hero, camera, W, H) {
  const v = new THREE.Vector3();
  camera.updateMatrixWorld();
  for (const [name, node, y] of [['head', hero.head, 0], ['hand 0', hero.arms[0].wrist, -0.3], ['hand 1', hero.arms[1].wrist, -0.3]]) {
    node.localToWorld(v.set(0, y, 0)).project(camera);
    const x = (v.x + 1) / 2 * W, yy = (1 - v.y) / 2 * H;
    if (x < 0 || x > W || yy < 0 || yy > H) return name;
  }
  return '';
}

// Ink of each 3D thing against each visible text and formula, in stage px.
function textHits(scene, camera, items, W, H) {
  const texts = items.filter((t) => t.isText && t.o > 0.3 && t.w > 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), hits = new Set();
  if (!texts.length) return [];
  camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.material.transparent || o.getWorldScale(sc).x < 0.01) return;
    const pos = o.geometry.attributes.position, st = Math.max(1, Math.floor(pos.count / 150));
    for (let i = 0; i < pos.count; i += st) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      for (const t of texts) if (Math.abs(x - t.x) < t.w / 2 + 6 && Math.abs(y - t.y) < t.h / 2 + 6) {
        let p = o; while (p && !p.userData.thing) p = p.parent;
        hits.add(`${t.k} on ${p ? p.userData.thing : 'arrow or post'}`);
      }
    }
  });
  return [...hits];
}

// Which things moved since the last frame, and where each thing is on the stage.
function moved(hero, models, camera, W, H) {
  models = models.filter((m) => !m.hero && m.name !== 'arrow');
  const out = { roots: [], parts: [] }, v = new THREE.Vector3(), c = new THREE.Vector3();
  const stage = (p) => { v.copy(p).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  camera.updateMatrixWorld();
  const check = (key, thing, p) => { const last = moved.last.get(key); if (last && last.distanceTo(p) > 0.005) out.parts.push(thing); moved.last.set(key, p.clone()); };
  if (hero) {
    hero.root.updateMatrixWorld(true);
    const [x, y] = stage(hero.root.getWorldPosition(c)); out.roots.push({ k: 'mascot', x, y });
    check('mascot', 'mascot', c);
    hero.arms.forEach((a, i) => check(`mascot hand ${i}`, 'mascot', a.wrist.getWorldPosition(c)));
  }
  models.forEach((m, n) => {
    m.root.updateMatrixWorld(true);
    const name = `${m.name} ${n}`, [x, y] = stage(m.root.getWorldPosition(c)); out.roots.push({ k: name, x, y });
    for (const g of Object.values(m.groups)) {
      const geo = meshOf(g).geometry; geo.boundingBox ?? geo.computeBoundingBox();
      // The centre of a part: a part that spins on its own centre (a wheel, a propeller) stays put.
      check(`${name} ${g.userData.part}`, name, geo.boundingBox.getCenter(c).applyMatrix4(g.matrixWorld));
    }
  });
  return { roots: out.roots, parts: [...new Set(out.parts)] };
}
moved.last = new Map();

// Each shape against each other shape, from their own shape functions: a grid of points over the space
// that both bounding boxes share. A point inside both is a collision. The mascot, the models, arrows,
// posts and balls are all shapes, so nothing in the kit is left out. It runs on every frame.
const T = { A: new THREE.Box3(), B: new THREE.Box3(), C: new THREE.Box3(), v: new THREE.Vector3(), u: new THREE.Vector3(), ia: new THREE.Matrix4(), ib: new THREE.Matrix4(), sc: new THREE.Vector3() };
const shown = (g) => Math.abs(g.getWorldScale(T.sc).y) >= 0.01;
const boxOf = (g, b) => { if (g.userData.boxAll) return b.setFromObject(g); const geo = meshOf(g).geometry; geo.boundingBox ?? geo.computeBoundingBox(); return b.copy(geo.boundingBox).applyMatrix4(g.matrixWorld); };
const depthAt = (g, inv, m, p) => { T.u.copy(p).applyMatrix4(inv); const pv = g.userData.pv; return g.userData.f(T.u.x + pv[0], T.u.y + pv[1], T.u.z + pv[2]) * m.root.scale.x; };
function shapesMeet(ga, a, gb, b, ta, tb, N = 9) {
  boxOf(ga, T.A); if (!T.A.intersectsBox(boxOf(gb, T.B))) return false;
  T.C.copy(T.A).intersect(T.B); T.ia.copy(ga.matrixWorld).invert(); T.ib.copy(gb.matrixWorld).invert();
  const { C, v } = T;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    v.set(C.min.x + (C.max.x - C.min.x) * (i + 0.5) / N, C.min.y + (C.max.y - C.min.y) * (j + 0.5) / N, C.min.z + (C.max.z - C.min.z) * (k + 0.5) / N);
    if (depthAt(ga, T.ia, a, v) < -ta && depthAt(gb, T.ib, b, v) < -tb) return true;
  }
  return false;
}
// How far a part may go into another: null means the pair is not measured.
function allowance(m, g, other, om) {
  const p = g.userData.part;
  if (m.hero) {
    if (/^(shoe|sole)/.test(p) && /^(floor|foot|base|plate)/.test(other.userData.part)) return null;   // he stands on it
    // A hand that grips a part closes around it. hold() names the part; reach() only points.
    if (/^(hand|fore)/.test(p)) for (const gr of m.hero.gripped || []) if (gr.i === +p.slice(-1) && gr.m === om) return gr.part === other.userData.part ? null : 0.12;
  }
  return m.name === 'arrow' ? 0.05 : 0.02;
}
function objectHits(models) {
  const hits = [], parts = (m) => Object.values(m.groups).filter(shown);
  models.forEach((m) => m.root.updateMatrixWorld(true));
  models.forEach((a, n) => { for (const b of models.slice(n + 1)) {
    if (a.root.scale.x < 0.01 || b.root.scale.x < 0.01 || (a.name === 'arrow' && b.name === 'arrow')) continue;
    for (const ga of parts(a)) for (const gb of parts(b)) {
      const ta = allowance(a, ga, gb, b), tb = allowance(b, gb, ga, a);
      if (ta === null || tb === null) continue;
      if (shapesMeet(ga, a, gb, b, ta, tb)) hits.push(`${a.name} ${ga.userData.part} into ${b.name} ${gb.userData.part}`);
    }
  } });
  return hits;
}
// His hands and forearms against the rest of his own body.
function selfHits(m) {
  const P = m.groups, hits = [];
  for (const i of [0, 1]) for (const a of [`hand${i}`, `fore${i}`]) for (const b of ['shirt', 'head', 'hair', 'hip', 'leg0', 'leg1', 'shoe0', 'shoe1', `hand${1 - i}`, `fore${1 - i}`, `upper${1 - i}`]) {
    if (P[a] && P[b] && (b < a || !/^(hand|fore)/.test(b)) && shapesMeet(P[a], m, P[b], m, 0.06, 0.06)) hits.push(`mascot ${a} into own ${b}`);
  }
  return hits;
}

export async function clay(s, { bg = BG.sage, fov = 20 } = {}) {
  // Read the stage size now: a scene may use s.H or s.W for its own things later.
  const W = s.W, H = s.H, R = renderer(W, H), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 400);
  scene.background = new THREE.Color(bg);
  studio(THREE, R, scene);
  s.has3d = true; s.clayCount = 0;
  const models = [];
  let frame = 0;
  // What "make review" and "make collide" read on each frame.
  s._collide = (items = []) => {
    const third = frame++ % 3 === 0;
    // A walk that goes sideways or backwards over more than a short step looks wrong.
    const out = [];
    if (s._hero) {
      // The feet, not the body: he must be able to lean and straighten up in place.
      const p = new THREE.Vector3(s._hero.feet[0], 0, s._hero.feet[1]), d = s._walk ? p.clone().sub(s._walk) : null, h = s._hero; s._walk = p;
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(h.root.quaternion); f.y = 0;
      // Holding something, he may walk backwards: he pulls it.
      const side = d && d.length() > 0.012 && !(h.held?.[0] > 0.05 || h.held?.[1] > 0.05) && (d.y = 0, f.angleTo(d) > 1.05);
      // A short step back is natural. More than 1.5 units of it is a fault.
      s._side = side ? (s._side || 0) + d.length() : 0;
      if (s._side > 1.5) out.push('mascot walks sideways or backwards');
      // Standing with a part of him out of the frame. Walking in or out of the frame is fine.
      const off = offFrame(h, camera, W, H), still = !d || d.length() <= 0.012;
      s._off = off && still ? (s._off || 0) + 1 : 0;
      if (s._off > 8) out.push(`mascot leaves the frame: ${off}`);
      if (h.tooSlow) out.push('mascot walks too slowly');
      // A straight arm raised to shoulder height or above can read as a salute. It must never appear.
      h.root.updateMatrixWorld(true);
      const raised = h.arms.some((a) => {
        const S = a.shoulder.getWorldPosition(new THREE.Vector3()), M = a.elbow.getWorldPosition(new THREE.Vector3()), W = a.wrist.getWorldPosition(new THREE.Vector3());
        return S.clone().sub(M).angleTo(W.clone().sub(M)) > 2.5 && W.y > S.y - 0.5;
      });
      s._raised = raised ? (s._raised || 0) + 1 : 0;
      if (s._raised > 3) out.push('mascot raises a straight arm');
      // A hand that holds something must be on it: he once pushed the air beside a cart.
      // A hold is good when the hand's own shape touches the part it holds.
      h.gripped = (h.holds || []).map((g) => ({ i: g.i, ...nearestPart(models, g.point) })).filter((g) => g.gap < 0.8);
      for (const g of h.holds || []) {
        const gr = h.gripped.find((x) => x.i === g.i), hand = s._heroModel.groups[`hand${g.i}`];
        if (!gr) out.push(`hand ${g.i} holds nothing`);
        else if ((g.k ?? 1) < 0.95) continue;   // the hand is still on its way to the grip or away from it
        else if (!shapesMeet(hand, s._heroModel, gr.m.groups[gr.part], gr.m, -0.06, -0.06)) out.push(`hand ${g.i} does not touch the ${gr.m.name} ${gr.part} that it holds`);
      }
      for (const g of h.grips || []) if (g.gap > 0.3) out.push(`hand ${g.i} misses what it holds, by ${g.gap.toFixed(1)}`);
    }
    return [...out, ...objectHits(models), ...(s._heroModel ? selfHits(s._heroModel) : []), ...(third ? textHits(scene, camera, items, s.W, s.H) : [])];
  };
  s._movers = () => moved(s._hero, models, camera, s.W, s.H);
  const g = {
    THREE, scene, camera, renderer: R,
    // A soft contact shadow under an object that stands on the floor at y = 0.
    ground(obj, k = 1.45) {
      shadowMap ??= shadowTexture();
      const b = new THREE.Box3().setFromObject(obj), size = new THREE.Vector3(), c = new THREE.Vector3(); b.getSize(size); b.getCenter(c);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.005, c.z); m.scale.set(size.x * k, size.z * k, 1); scene.add(m); return m;
    },
    // Each call makes a new one. x, z place it on the floor; shadow: false for something held or on a table.
    async mascot({ x = 0, z = 0, shadow = true } = {}) {
      await load((k) => !k.startsWith('m-'));
      const m = createMascot(THREE, {}); m.root.position.set(x, 6.82, z); scene.add(m.root);
      if (shadow) m.shadow = g.ground(m.root);
      m.root.userData.thing = 'mascot';
      s._heroModel = { name: 'mascot', root: m.root, hero: m, groups: Object.fromEntries(m.shapes.map((x) => [x.userData.part, x])) };
      models.push(s._heroModel);
      m.place(x, z);
      s.hasMascot = true; s.clayCount++; s._hero = m;
      s._hero = m;
      return m;
    },
    async model(name, { x = 0, y = 0, z = 0, ry = 0, k = 1, shadow = y === 0 } = {}) {
      if (!MODELS[name]) throw new Error(`no clay model "${name}". Models: ${Object.keys(MODELS).join(', ')}`);
      await load((key) => key.startsWith(`m-${name}-`));
      const m = buildModel(THREE, name); m.root.position.set(x, y, z); m.root.rotation.y = ry; m.root.scale.setScalar(k); scene.add(m.root);
      m.name = name; m.root.userData.thing = name; models.push(m);
      if (shadow) m.shadow = g.ground(m.root);
      s.clayCount++;
      return m;
    },
    // A soft solid arrow for a force or a gap: a.set([x, y, z], [x, y, z]) each frame. A short one shrinks away.
    arrow(color, r = 0.13) {
      const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.56, sheen: 0.28, sheenRoughness: 0.6 });
      const group = new THREE.Group(), shaft = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 8, 24), mat), head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.5, r * 4.2, 32), mat);
      group.add(shaft, head); scene.add(group);
      Object.assign(group.userData, { thing: 'arrow', part: 'arrow', pv: [0, 0, 0], boxAll: true, f: () => 9 });
      models.push({ name: 'arrow', root: group, groups: { arrow: group } });
      const A = new THREE.Vector3(), B = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), hl = r * 4.2;
      group.set = (from, to) => {
        A.set(...from); B.set(...to);
        const L = A.distanceTo(B);
        if (L < 0.04) { group.scale.setScalar(1e-4); return group; }
        const k = Math.min(1, L / (hl * 1.2));    // a very short arrow is all head, and smaller
        group.scale.setScalar(1); group.position.copy(A);
        group.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize());
        const sl = Math.max(0.001, L - hl * k);
        shaft.scale.set(k, sl, k); shaft.position.y = sl / 2;
        head.scale.setScalar(k); head.position.y = L - hl * k / 2;
        const rk = r * k, hb = L - hl * k;
        group.userData.f = (x, y, z) => Math.min(cone(x, y, z, 0, 0, 0, 0, sl, 0, rk, rk), cone(x, y, z, 0, hb, 0, 0, L, 0, 2.5 * rk, 0.005));
        return group;
      };
      group.set([0, 0, 0], [0, 0, 0]);
      return group;
    },
    // A ball, for a pulse or a signal. It is an object like any other, so the collision measures see it.
    ball(color, r = 0.2) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshPhysicalMaterial({ color, roughness: 0.5 }));
      scene.add(m);
      Object.assign(m.userData, { thing: 'ball', part: 'ball', pv: [0, 0, 0], f: (x, y, z) => Math.hypot(x, y, z) - r });
      models.push({ name: 'ball', root: m, groups: { ball: m } });
      return m;
    },
    // A plain rounded post, to mark a place on the floor.
    post(color, h = 3, r = 0.12) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, h - 2 * r, 8, 24), new THREE.MeshPhysicalMaterial({ color, roughness: 0.56, sheen: 0.28, sheenRoughness: 0.6 }));
      m.position.y = h / 2; scene.add(m);
      // A post is an object like any other, so the collision measures see it.
      Object.assign(m.userData, { thing: 'post', part: 'post', pv: [0, 0, 0], f: (x, y, z) => Math.hypot(x, z, Math.max(Math.abs(y) - (h / 2 - r), 0)) - r });
      models.push({ name: 'post', root: m, groups: { post: m } });
      return m;
    },
    // Camera around a point: azimuth and elevation in degrees, then the distance.
    orbit(az, el, dist, look = [0, 3, 0]) {
      const A = az * Math.PI / 180, E = el * Math.PI / 180;
      camera.position.set(look[0] + dist * Math.sin(A) * Math.cos(E), look[1] + dist * Math.sin(E), look[2] + dist * Math.cos(A) * Math.cos(E));
      camera.lookAt(look[0], look[1], look[2]);
    },
    // Stage px of a point or an object: use it to place a flat label beside a 3D thing.
    screen(what) {
      const v = what.isObject3D ? what.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(...what);
      camera.updateMatrixWorld();   // the camera may have moved since the last render
      v.project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
    },
    // The renderer moves into the scene that draws now. All scenes share it.
    render() { if (R.domElement.parentElement !== s.root) s.root.prepend(R.domElement); R.render(scene, camera); },
    // Call at the end of setup, so every material is ready before the first frame.
    async ready() { R.compile(scene, camera); g.render(); },
  };
  return g;
}
