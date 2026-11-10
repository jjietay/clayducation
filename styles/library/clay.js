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
  shared.domElement.dataset.clay = '1';   // the ID pass reads models from clay itself, not from this canvas
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

// See s._idPass. Index i + 1 in the red and green bytes marks model i; 0 is nothing.
const idMats = new Map();
let idTarget = null;
function idPass(R, scene, camera, models, w, h) {
  if (!idTarget || idTarget.width !== w) idTarget = new THREE.WebGLRenderTarget(w, h);
  const owner = new Map(), seen = {};
  const names = models.map((m) => { const b = m.hero ? 'mascot' : m.name; seen[b] = (seen[b] || 0) + 1; return seen[b] > 1 ? `${b} ${seen[b]}` : b; });
  models.forEach((m, i) => m.root.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) owner.set(o, i); }));
  const saved = [];
  scene.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) saved.push([o, o.material, o.visible]); });
  const mat = (i, side) => {
    const k = `${i}|${side}`;
    if (!idMats.has(k)) { const c = new THREE.Color(); c.setRGB(((i + 1) & 255) / 255, ((i + 1) >> 8) / 255, 0, THREE.LinearSRGBColorSpace); idMats.set(k, new THREE.MeshBasicMaterial({ color: c, side, toneMapped: false })); }
    return idMats.get(k);
  };
  for (const [o, m] of saved) { const i = owner.get(o); if (i === undefined) o.visible = false; else o.material = mat(i, (Array.isArray(m) ? m[0] : m)?.side ?? THREE.FrontSide); }
  const bg = scene.background, env = scene.environment, before = R.getRenderTarget(), buf = new Uint8Array(w * h * 4);
  scene.background = new THREE.Color(0, 0, 0); scene.environment = null;
  const read = () => { R.setRenderTarget(idTarget); R.clear(); R.render(scene, camera); R.readRenderTargetPixels(idTarget, 0, 0, w, h, buf); };
  const flip = (fn) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = ((h - 1 - y) * w + x) * 4; fn(y * w + x, buf[o] | (buf[o + 1] << 8)); } };
  try {
    read();
    const visible = new Uint16Array(w * h); flip((p, v) => { visible[p] = v; });
    const sil = models.map((_, i) => {
      for (const [o, , v] of saved) { const j = owner.get(o); if (j !== undefined) o.visible = j === i && v; }
      read(); const m = new Uint8Array(w * h); flip((p, v) => { m[p] = v === i + 1 ? 1 : 0; }); return m;
    });
    return { names, visible, sil };
  } finally {
    for (const [o, m, v] of saved) { o.material = m; o.visible = v; }
    scene.background = bg; scene.environment = env; R.setRenderTarget(before);
  }
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
      // Standing still with the legs apart reads as a frozen walk (the user saw it at 12:41 of the computed torque video).
      if (d && d.length() < 0.002 && Math.max(...h.legs.map((l) => Math.abs(l.hip.rotation.x))) > 0.15) out.push('mascot stands still with his legs apart, frozen mid-step');
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
  // Screen boxes of the mascot and each model, for "make zones": where the 3D is, so formulas go elsewhere.
  s._zoneBoxes = () => {
    const out = [], b = new THREE.Box3(), v = new THREE.Vector3();
    camera.updateMatrixWorld();
    for (const m of models) {
      if (m.name === 'arrow') continue;
      m.root.updateMatrixWorld(true);
      const sc = m.root.getWorldScale(v); if (Math.min(sc.x, sc.y, sc.z) < 0.01) continue;   // hidden with a tiny scale
      // One box for each mesh (part), not one for the whole model: a long rail would cover the frame.
      m.root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const ws = o.getWorldScale(v); if (Math.min(ws.x, ws.y, ws.z) < 0.01) return;
        o.geometry.boundingBox ?? o.geometry.computeBoundingBox();
        b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
          const x = (v.x + 1) / 2 * s.W, y = (1 - v.y) / 2 * s.H;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        out.push({ name: m.hero ? 'mascot' : m.name, x0, y0, x1, y1 });
      });
    }
    return out;
  };
  // The ID pass (engine/runtime.js): each model drawn in its own flat colour, and each model alone for
  // its full outline. Shadows and anything that is not a model stay out. The frame on screen does not change.
  s._idPass = (w, h) => idPass(R, scene, camera, models, w, h);
  // A hand on its way to a hold (k from 0 to 1): up in front of his chest, to just in front of the target, then onto it, so
  // the arm never sweeps from his hip through the thing he reaches for (the button and wheel tests, 2026-11-10).
  const moveHand = (hero, i, target, k) => {
    if (k <= 0) return;
    hero.root.updateMatrixWorld(true);
    const S = hero.arms[i].shoulder.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion);
    const df = (target[0] - S.x) * f.x + (target[2] - S.z) * f.z, lf = Math.min(1.6, Math.max(0.6, df - 0.9));   // stop short of the target's plane
    const lift = [S.x + f.x * lf, S.y - 0.8, S.z + f.z * lf], pre = [target[0] - f.x * 0.7, target[1] + 0.35, target[2] - f.z * 0.7];
    const mixP = (A, B, u) => { const e = u * u * (3 - 2 * u); return [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e]; };
    if (k < 0.4) hero.reach(i, lift, k / 0.4);                          // up in front of his chest
    else if (k < 0.75) hero.reach(i, mixP(lift, pre, (k - 0.4) / 0.35), 1);   // to just in front of the target, a little above
    else if (k < 0.999) hero.hold(i, mixP(pre, target, (k - 0.75) / 0.25), 0.94);   // onto it, as a hold (under 0.95: not yet checked for contact)
    else hero.hold(i, target, 1);
  };
  const g = {
    THREE, scene, camera, renderer: R,
    // A soft contact shadow under an object that stands on the floor at y = 0.
    ground(obj, k = 1.45) {
      shadowMap ??= shadowTexture();
      const b = new THREE.Box3().setFromObject(obj), size = new THREE.Vector3(), c = new THREE.Vector3(); b.getSize(size); b.getCenter(c);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.005, c.z); m.scale.set(size.x * k, size.z * k, 1); scene.add(m);
      m.userData.of = obj; m.userData.base = [size.x * k, size.z * k, obj.scale.x || 1]; return m;
    },
    // Each call makes a new one. x, z place it on the floor; shadow: false for something held or on a table.
    async mascot({ x = 0, z = 0, shadow = true } = {}) {
      await load((k) => !k.startsWith('m-'));
      const m = createMascot(THREE, {}); m.root.position.set(x, 6.82, z); scene.add(m.root);
      if (shadow) m.shadow = g.ground(m.root);
      m.root.userData.thing = 'mascot';
      s._heroModel = { name: 'mascot', root: m.root, hero: m, groups: Object.fromEntries(m.shapes.map((x) => [x.userData.part, x])) };
      // The pose at the end of setup is the start of every frame: the walk adds to the arms, so a scene
      // that does not set a pose each frame would otherwise draw a pose that depends on the frame before.
      const saved = [];
      (s._afterSetup ??= []).push(() => m.root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()])));
      (s._beforeDraw ??= []).push(() => { for (const [o, p, q, k] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(k); } });
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
    // Where the mascot stands to push, pull or hold one part of a model from one side (the user asked, 2026-11-09:
    // 4 look rounds went to hands that missed a cart and shoes inside its rail). side is the face he touches:
    // '-x', '+x', '-z' or '+z'. He stands standOff (1.85) out from that face and faces it; if a floor-level part
    // of any model (a rail, a base) is under his feet, he steps further out. The hands go on the face, spread
    // apart, at y (default: 0.35 below the top of the part, kept between 2.6 and 3.4, where his hands reach).
    // Returns { x, z, face, hands: [right, left], low } (a hand is null when only the other one reaches; low: the
    // face is too low to reach well).
    stance(model, part, { side = '-z', y, spread, standOff = 1.85, footR = 1.0 } = {}) {
      const grp = model.groups[part]; if (!grp) throw new Error(`stance: ${model.name} has no part "${part}"`);
      model.root.updateMatrixWorld(true);
      const b = boxOf(grp, new THREE.Box3()), ax = side[1], sg = side[0] === '-' ? -1 : 1;
      const n = ax === 'x' ? [sg, 0] : [0, sg], d = [-n[0], -n[1]], r = [-d[1], d[0]];
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const fx = ax === 'x' ? (sg < 0 ? b.min.x : b.max.x) : cx, fz = ax === 'z' ? (sg < 0 ? b.min.z : b.max.z) : cz;
      const top = b.max.y, hy = y ?? Math.min(Math.max(top - 0.35, 2.6, b.min.y + 0.2), 3.4, top - 0.05);
      const half = ax === 'x' ? (b.max.z - b.min.z) / 2 : (b.max.x - b.min.x) / 2, w = spread ?? Math.min(0.6, half * 0.6);
      // Floor-level parts of every model but the mascot and this part: his feet keep footR clear of them.
      const floor = [], tb = new THREE.Box3();
      for (const m of models) { if (m.hero || m.name === 'arrow') continue; for (const g2 of Object.values(m.groups || {})) { if (g2 === grp || !meshOf(g2)) continue; boxOf(g2, tb); if (tb.min.y < 0.6 && tb.max.y > 0.02) floor.push(tb.clone()); } }
      const hits = (x, z) => floor.some((fb) => x > fb.min.x - footR && x < fb.max.x + footR && z > fb.min.z - footR && z < fb.max.z + footR);
      // Straight out first (up to 1 more). If a floor part runs along that line (he would stand on a rail), step
      // sideways instead, to the side away from the camera so he does not hide the object, and reach sideways.
      let at = null;
      for (let so = standOff; so <= standOff + 1 && !at; so += 0.1) if (!hits(fx + n[0] * so, fz + n[1] * so)) at = [fx + n[0] * so, fz + n[1] * so];
      if (!at) {
        const away = (camera.position.x - fx) * r[0] + (camera.position.z - fz) * r[1] > 0 ? -1 : 1;
        for (let lat = 0.2; lat <= 3.5 && !at; lat += 0.1) for (const sgn of [away, -away]) {
          for (const so of [standOff - 0.35, standOff, standOff + 0.35]) {
            const x = fx + n[0] * so + r[0] * lat * sgn, z = fz + n[1] * so + r[1] * lat * sgn;
            if (!hits(x, z)) { at = [x, z]; break; }
          }
          if (at) break;
        }
      }
      at ??= [fx + n[0] * standOff, fz + n[1] * standOff];
      // Beside the face (he stepped sideways): the hands go on the edge of the face nearest to him.
      const latNow = (at[0] - fx) * r[0] + (at[1] - fz) * r[1], shift = Math.abs(latNow) > half ? Math.sign(latNow) * Math.max(0, half - w - 0.15) : 0;
      const p = (k) => [fx + r[0] * (w * k + shift), hy, fz + r[1] * (w * k + shift)];
      // Beside the face he reaches with the near hand only; the far hand would cross his body.
      const hands = shift ? (latNow > 0 ? [null, p(0)] : [p(0), null]) : [p(1), p(-1)];
      return { x: at[0], z: at[1], face: Math.atan2(d[0], d[1]), hands, low: top < 2.7 };
    },
    // Stand at the stance and put both hands on the face (k from 0 to 1). Call it after blendPose. For a model that
    // moves, call it every frame: he follows it. For walking legs while it moves, use route() or stride() as well.
    pushOn(hero, model, part, opts = {}) {
      const st = g.stance(model, part, opts), k = opts.k ?? 1;
      hero.place(st.x, st.z, { face: st.face, lean: opts.lean ?? 0.1 });
      if (k > 0) st.hands.forEach((h, i) => { if (h) hero.hold(i, h, k); });
      return st;
    },
    // ---------- more actions (the user asked, 2026-11-10: every video used pushOn, so he always pushed) ----------
    // Each one places him and his hands only; the measures judge contact as for pushOn. Call after blendPose,
    // and after route() when he walks. A point on a part is in model coordinates, the same as in models.js.
    // The world point of a model-space point on a part. It moves with the part (a lever, a wheel, a door).
    partPoint(model, part, P) {
      const grp = model.groups[part]; if (!grp) throw new Error(`partPoint: ${model.name} has no part "${part}"`);
      model.root.updateMatrixWorld(true);
      const pv = grp.userData.pv, v = grp.localToWorld(new THREE.Vector3(P[0] - pv[0], P[1] - pv[1], P[2] - pv[2]));
      return [v.x, v.y, v.z];
    },
    // Hold one or two points on a part (model coordinates). With standOff, he stands that far from the points along
    // dir (a world direction on the floor, default +z) and faces them, so he walks with a lever or a door handle that
    // moves. Two points: the one on his right takes hand 0. One point: hand (default 1). Returns { points, x, z }: x, z
    // is where he stands, for the end of a walk to it.
    grip(hero, model, part, points, { k = 1, hand = 1, standOff, dir = [0, 0, 1], lean = 0.1, shift = 0.9 } = {}) {
      const P = (Array.isArray(points[0]) ? points : [points]).map((p) => g.partPoint(model, part, p));
      let at = null;
      if (standOff != null) {
        const c = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length, a[2] + p[2] / P.length], [0, 0, 0]), L = Math.hypot(dir[0], dir[2]) || 1;
        // One point: he steps sideways so it is in front of the gripping shoulder, or that forearm crosses his chest.
        const fx = -dir[0] / L, fz = -dir[2] / L, sh = P.length === 1 ? (hand === 1 ? shift : -shift) : 0;
        at = [c[0] + dir[0] / L * standOff - fz * sh, c[2] + dir[2] / L * standOff + fx * sh];
        hero.place(at[0], at[1], { face: Math.atan2(fx, fz), lean });
      }
      if (k > 0) {
        // On the way (k < 1) each hand goes up in front of his chest first (moveHand).
        hero.root.updateMatrixWorld(true);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion), r = [-f.z, f.x];   // his right, on the floor
        if (P.length === 1) moveHand(hero, hand, P[0], k);
        else {
          const side = (p) => p[0] * r[0] + p[2] * r[1], [a, b] = side(P[0]) >= side(P[1]) ? [P[0], P[1]] : [P[1], P[0]];
          moveHand(hero, 0, a, k); moveHand(hero, 1, b, k);
        }
      }
      return { points: P, x: at?.[0], z: at?.[1] };
    },
    // Carry a model in front of him, a hand on each side of the part. k 0: the model rests at rest = [x, y, z] (its
    // root position, turned restRy); k 1: it is in his hands at height (the part's centre), and it follows him. Lift
    // and set down by moving k while he stands at the rest place; grip (0 to 1) brings the hands in first. His
    // shoulders are at y 4.52, so the held centre (height) is 3.6, and he stands 1.35 + the part's half depth behind it.
    carry(hero, model, part, { k = 1, grip = 1, rest, restRy = 0, height = 3.6, gap = 0 } = {}) {
      const grp = model.groups[part], geo = meshOf(grp).geometry; geo.boundingBox ?? geo.computeBoundingBox();
      const bb = geo.boundingBox, pv = grp.userData.pv, sc = model.root.scale.x;
      const c = [(bb.min.x + bb.max.x) / 2 + pv[0], (bb.min.y + bb.max.y) / 2 + pv[1], (bb.min.z + bb.max.z) / 2 + pv[2]];
      const hx = (bb.max.x - bb.min.x) / 2 * sc, hz = (bb.max.z - bb.min.z) / 2 * sc;
      hero.root.updateMatrixWorld(true);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion); f.y = 0; f.normalize();
      const face = Math.atan2(f.x, f.z), [fx, fz] = hero.feet, ahead = 1.35 + hz + gap;   // his shirt is about 1 deep from his centre, and he leans to lift
      // Carried: the part's centre in front of him; the model turned to face the same way he does.
      const cs = Math.cos(face), sn = Math.sin(face), rot = (x, z) => [x * cs + z * sn, -x * sn + z * cs];
      const [ox, oz] = rot(c[0] * sc, c[2] * sc), held = [fx + f.x * ahead - ox, height - c[1] * sc, fz + f.z * ahead - oz];
      const from = rest || held, e = k * k * (3 - 2 * k);
      let d = face - restRy; d = Math.atan2(Math.sin(d), Math.cos(d));
      model.root.position.set(from[0] + (held[0] - from[0]) * e, from[1] + (held[1] - from[1]) * e + 0.35 * Math.sin(Math.PI * e), from[2] + (held[2] - from[2]) * e);
      model.root.rotation.y = restRy + d * e;
      if (model.shadow) { model.shadow.position.x = model.root.position.x; model.shadow.position.z = model.root.position.z; }
      // The hands go on the two faces across his body: the model's x faces once it is turned to him.
      const C = g.partPoint(model, part, c), r = [-f.z, f.x], dd = d * (1 - e), hw = Math.abs(hx * Math.cos(dd)) + Math.abs(hz * Math.sin(dd));
      if (grip > 0) { hero.hold(0, [C[0] + r[0] * hw, C[1], C[2] + r[1] * hw], grip); hero.hold(1, [C[0] - r[0] * hw, C[1], C[2] - r[1] * hw], grip); }
      return { at: model.root.position.toArray(), held };
    },
    // Knock on a face: he stands at it (as for pushOn) and hits it count times, gap s apart, from at (scene seconds).
    // Returns the hit times, for s.sfx. hand: the hand on the side nearer the camera by default.
    knock(hero, model, part, t, { side = '+z', at = 0, count = 3, gap = 0.34, hand, y, standOff = 2.0, lean = 0.05 } = {}) {
      const st = g.stance(model, part, { side, y, standOff });
      hero.place(st.x, st.z, { face: st.face, lean });
      const i = hand ?? (st.hands[1] ? 1 : 0), cpt = st.hands[i] || st.hands[1 - i], ax = side[1], sg = side[0] === '-' ? -1 : 1;
      const n = ax === 'x' ? [sg, 0, 0] : [0, 0, sg], off = [cpt[0] + n[0] * 0.55, cpt[1] + 0.15, cpt[2] + n[2] * 0.55];
      const hits = Array.from({ length: count }, (_, j) => at + j * gap), last = hits[count - 1];
      const up = clamp((t - (at - 0.6)) / 0.35, 0, 1) * (1 - clamp((t - (last + 0.25)) / 0.35, 0, 1));
      let h = 0; for (const ht of hits) h = Math.max(h, 1 - Math.abs(t - ht) / (gap * 0.5));
      h = clamp(h, 0, 1) ** 2;
      // The fist travels to 0.35 off the face (the fist's own size), and touches it only at a hit.
      const near = [cpt[0] + n[0] * 0.35, cpt[1], cpt[2] + n[2] * 0.35];
      if (up > 0.95 && h > 0.97) hero.hold(i, cpt, 1);
      else if (up > 0) hero.reach(i, [off[0] + (near[0] - off[0]) * h, off[1] + (near[1] - off[1]) * h, off[2] + (near[2] - off[2]) * h], up);
      return { stance: st, hits };
    },
    // Press the top of a part (a button) with one hand. He stands at side, standOff from the part's centre.
    // He steps sideways by shift, so the part is in front of the pressing shoulder: a hand that reaches across his body
    // puts the forearm into his shirt. Use the returned x, z as the end of the walk to the button.
    press(hero, model, part, k = 1, { side = '+z', hand = 1, standOff = 1.7, lean = 0.15, shift = 0.9 } = {}) {
      const st = g.stance(model, part, { side, standOff }), f = [Math.sin(st.face), Math.cos(st.face)], sg = hand === 1 ? 1 : -1;
      const x = st.x - f[1] * shift * sg, z = st.z + f[0] * shift * sg;
      hero.place(x, z, { face: st.face, lean });
      const b = boxOf(model.groups[part], new THREE.Box3()), top = [(b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2];
      top[1] += 0.2;   // the fist rests on the cap, clear of the housing under it
      moveHand(hero, hand, top, k);   // up in front of his chest first, then onto the top
      return { stance: st, x, z, top };
    },
    // Point at a world point with a bent arm, the hand below the shoulder (a straight raised arm reads as a salute),
    // and look at it. hand: default the one on the target's side.
    pointAt(hero, point, { k = 1, hand, look = true } = {}) {
      hero.root.updateMatrixWorld(true);
      if (hand == null) {   // the hand on the target's side, or the forearm crosses his chest
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion), [fx, fz] = hero.feet;
        hand = (point[0] - fx) * -f.z + (point[2] - fz) * f.x > 0 ? 0 : 1;
      }
      const S = hero.arms[hand].shoulder.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(...point).sub(S).normalize();
      const T = S.clone().add(d.multiplyScalar(2.3)); T.y = Math.min(T.y, S.y - 0.75);   // 2.3 of the 2.65 arm: bent, but it reads as a point
      if (k > 0) hero.reach(hand, [T.x, T.y, T.z], k);
      if (look) g.lookAt(hero, point, k);
    },
    // Turn his head to a world point (k from 0 to 1), on top of the expression. Call it after blendExpression.
    lookAt(hero, point, k = 1) {
      const hp = hero.headPivot; hero.root.updateMatrixWorld(true);
      const v = hp.parent.worldToLocal(new THREE.Vector3(...point)).sub(hp.position);
      const yaw = clamp(Math.atan2(v.x, v.z), -1.0, 1.0), pitch = clamp(-Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.6, -0.45, 0.45);
      hp.rotation.y += (yaw - hp.rotation.y) * k; hp.rotation.x += (pitch - hp.rotation.x) * k;
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
    render() {
      if (R.domElement.parentElement !== s.root) s.root.prepend(R.domElement);
      // A floor shadow follows its object's size: a model hidden with a tiny scale lost its body but kept its
      // shadow (the computed torque video showed the gauge's shadow before the gauge appeared, 2026-11-09).
      for (const m of models) { const sh = m.shadow, u = sh?.userData; if (!u?.base) continue; const r = (u.of.scale.x || 0) / u.base[2];
        sh.visible = r > 0.02; sh.scale.set(u.base[0] * Math.max(r, 1e-4), u.base[1] * Math.max(r, 1e-4), 1); }
      R.render(scene, camera);
    },
    // Call at the end of setup, so every material is ready before the first frame.
    async ready() { R.compile(scene, camera); g.render(); },
  };
  return g;
}
