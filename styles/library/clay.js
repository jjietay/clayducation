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
    if (m.hero.seat && m.hero.seat.m === om && m.hero.seat.part === other.userData.part && /^(hip|leg|shin)/.test(p)) return null;   // he sits on it (sitOn)
    // A short contact that a helper names for this frame only: a shoe on the ball at the kick, his body on the rug (lieDown).
    for (const c of m.hero.touch || []) if (c.m === om && c.parts.test(p)) return null;
    // A hand that grips a part closes around it. hold() names the part; reach() only points.
    if (/^(hand|fore)/.test(p)) for (const gr of m.hero.gripped || []) if (gr.i === +p.slice(-1) && gr.m === om) return gr.part === other.userData.part ? null : 0.12;
  }
  // A short contact between two objects that a helper names for this frame only (the broom's bristles on the dust).
  for (const c of m.touch || []) if (c.m === om) return null;
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
  for (const i of [0, 1]) for (const a of [`hand${i}`, `fore${i}`]) for (const b of ['shirt', 'head', 'hair', 'hip', 'leg0', 'leg1', 'shin0', 'shin1', 'shoe0', 'shoe1', `hand${1 - i}`, `fore${1 - i}`, `upper${1 - i}`]) {
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
      if (d && d.length() < 0.002 && !(h.posed > 0.05) && Math.max(...h.legs.map((l) => Math.abs(l.hip.rotation.x))) > 0.15) out.push('mascot stands still with his legs apart, frozen mid-step');
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
  // asHold false: the hand only hovers (typing), so it is never checked for contact.
  const moveHand = (hero, i, target, k, asHold = true) => {
    if (k <= 0) return;
    hero.root.updateMatrixWorld(true);
    const S = hero.arms[i].shoulder.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion);
    // The first point is in front of the shoulder and 0.35 out to its side, so it is clear of his shirt however near
    // the target is, and at least 1.0 short of the target's plane (the fist reaches 0.67 beyond the wrist; a lean toward
    // a board once put it on the board).
    const df = (target[0] - S.x) * f.x + (target[2] - S.z) * f.z, lf = Math.min(1.6, Math.max(0.6, df - 1.0)), side = 0.35 + 0.35 * clamp((1.15 - lf) / 0.3, 0, 1);   // a smooth change, or the hand jumps when he leans
    const out = new THREE.Vector3(-1, 0, 0).applyQuaternion(hero.root.quaternion).multiplyScalar(i === 0 ? side : -side);   // a near target: further out
    // The point before the target: 0.8 to 0.9 off it for a hold, so the hand does not touch before it holds. reach() puts
    // the wrist on a point, and the fist reaches about 0.67 beyond the wrist.
    const pb = Math.min(0.9, Math.max(0.8, df - 0.8));
    // Both points are out to the side, so the hand comes in around his body, not through his shirt.
    const lift = [S.x + f.x * lf + out.x, S.y - 0.8, S.z + f.z * lf + out.z], pre = [target[0] - f.x * pb + out.x, target[1] + 0.35, target[2] - f.z * pb + out.z];
    const mixP = (A, B, u) => { const e = u * u * (3 - 2 * u); return [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e]; };
    if (k < 0.4) hero.reach(i, lift, k / 0.4);                          // up in front of his chest
    else if (!asHold) hero.reach(i, mixP(lift, target, Math.min(1, (k - 0.4) / 0.6)), 1);   // a hover goes straight on
    else if (k < 0.75) hero.reach(i, mixP(lift, pre, (k - 0.4) / 0.35), 1);   // to just in front of the target, a little above
    else if (k < 0.999) {   // onto it: the hand moves along the path, and the hold is the target (under 0.95: not yet checked for
      // contact), so the part it is about to hold counts as held while the fist, 0.67 beyond the wrist, reaches it
      hero.reach(i, mixP(pre, target, (k - 0.75) / 0.25), 1);
      if (asHold) (hero.holds ??= []).push({ i, point: target, k: 0.94 });
    }
    else if (asHold) hero.hold(i, target, 1);
    else hero.reach(i, target, 1);
  };
  // ---------- for the play and tool actions (kick, jump, hammer, sweep, water, lieDown) ----------
  const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const span = (t, a, d) => clamp((t - a) / d, 0, 1);
  const V3 = (a) => new THREE.Vector3(...a);
  // His forward and his right on the floor (unit vectors). His right is the side of hand 0.
  const facing = (hero) => { hero.root.updateMatrixWorld(true); const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion); f.y = 0; f.normalize(); return { f, r: new THREE.Vector3(-f.z, 0, f.x) }; };
  const dirOf = (face) => new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
  const basisQ = (X, Y, Z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(X), V3(Y), V3(Z)));
  // A point and a turn in the frame of a model (its root: place and turn; size 1) to world.
  const toWorld = (ref, P) => { ref.root.updateMatrixWorld(true); return V3(P).applyMatrix4(ref.root.matrixWorld); };
  const qWorld = (ref, Q) => ref.root.quaternion.clone().multiply(Q);
  // A held tool: { Q, W } is its turn and the world point of its grip G (model coordinates). Its root goes where that puts it.
  const placeTool = (m, { Q, W }, G) => { m.root.quaternion.copy(Q); m.root.position.copy(W).sub(V3(G).applyQuaternion(Q)); m.root.updateMatrixWorld(true); };
  const mixPose = (A, B, e, arc = 0) => ({ Q: A.Q.clone().slerp(B.Q, e), W: A.W.clone().lerp(B.W, e).add(new THREE.Vector3(0, arc * Math.sin(Math.PI * e), 0)) });
  // A tool's day: it rests until at; the hand comes to its grip (0.6 s), lifts it to the first work pose (0.8 s); work(t)
  // runs until end - 1.4; it goes back to rest (0.8 s) and the hand lets go (0.6 s). Returns the pose and how far the hand is on.
  const toolPath = (t, at, end, rest, work, arc = 0.5) => {
    const a = at + 1.4, b = end - 1.4;
    const P = t < at + 0.6 || t >= end - 0.6 ? rest : t < a ? mixPose(rest, work(a), ease((t - at - 0.6) / 0.8), arc) : t <= b ? work(t) : mixPose(work(b), rest, ease((t - b) / 0.8), arc);
    const grip = t < at ? 0 : t < at + 0.6 ? ease((t - at) / 0.6) : t > end ? 0 : t > end - 0.6 ? 1 - ease((t - (end - 0.6)) / 0.6) : 1;
    const take = t < at + 0.6 || t >= end - 0.6 ? 0 : t < a ? ease((t - at - 0.6) / 0.8) : t <= b ? 1 : 1 - ease((t - b) / 0.8);
    return { P, grip, take, busy: t >= at && t <= end };
  };
  const holdTool = (hero, hand, W, grip) => { if (grip > 0) moveHand(hero, hand, W.toArray(), grip); };
  // The hammer's claw on the bench (hammer() in "pull" mode), measured from the hammer's own shape. b: how far the
  // handle leans away from him (0 upright). claw(b): the head centre's height over the bench top when the head rests on
  // it. clawLift(b, slide): the top of the hammer under the nail's head (a disc of radius 0.16 round the shank, 0.75
  // from the head centre, away from him, plus slide), over the bench top; -9 when the claw is not under it.
  let clawTable = null, clawHead = null;
  const clawFrame = (b) => { const D = [-Math.cos(b), Math.sin(b)], Y = [-Math.sin(b), -Math.cos(b)]; return (oy, oz) => [oy * Y[0] + oz * Y[1] + 0.06, oy * D[0] + oz * D[1] + 1.62]; };
  const claw = (b) => {
    if (!clawTable) {
      clawHead = MODELS.hammer.make().parts.find((p) => p.name === 'head').f;
      clawTable = [];
      for (let i = 0; i <= 40; i++) {
        const bb = i * 0.025, D = [-Math.cos(bb), Math.sin(bb)], Y = [-Math.sin(bb), -Math.cos(bb)];
        let low = 9;
        for (let ly = -0.45; ly <= 1.0; ly += 0.01) for (let lz = 0.95; lz <= 1.85; lz += 0.01) if (clawHead(0, ly, lz) < 0) low = Math.min(low, (ly - 0.06) * Y[0] + (lz - 1.62) * D[0]);
        clawTable.push(-low);
      }
    }
    const u = clamp(b, 0, 1) / 0.025, i = Math.min(39, Math.floor(u)), w = u - i;
    return clawTable[i] + (clawTable[i + 1] - clawTable[i]) * w;
  };
  const clawLift = (b, slide) => {
    const h = claw(b), loc = clawFrame(b); let top = -9;
    for (let dz = -0.16; dz <= 0.161; dz += 0.04) for (const x of [0.09, 0.14]) for (let oy = -h; oy <= -h + 0.6; oy += 0.005) { const [ly, lz] = loc(oy, -0.75 - slide + dz); if (clawHead(x, ly, lz) < 0.01) top = Math.max(top, oy); }
    return top < -8 ? -9 : top + h;
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
      for (const m of models) m.root.updateMatrixWorld(true);   // boxes of this frame: frames are drawn out of order
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
      // From the floor (the part's centre below 2.6, out of reach), he crouches while the thing is low, and rises as he
      // lifts it; his knees need 0.2 more room in front of him.
      const low = rest && rest[1] + c[1] * sc < 2.6, kk = k * k * (3 - 2 * k);
      if (low && grip > 0) hero.legsPose('crouch', Math.min(1, grip * 2) * (1 - kk));   // the crouch leads the hands
      hero.root.updateMatrixWorld(true);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion); f.y = 0; f.normalize();
      const face = Math.atan2(f.x, f.z), [fx, fz] = hero.feet, ahead = 1.35 + hz + gap + (low ? 0.2 : 0);   // his shirt is about 1 deep from his centre, and he leans to lift
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
      const st = g.stance(model, part, { side, standOff }), f = [Math.sin(st.face), Math.cos(st.face)], sg = hand === 1 ? 1 : -1;   // stance() updates the matrices
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
    // ---------- sitting, crouching, kneeling and more (the user asked, 2026-11-10) ----------
    // Legs: hero.legsPose('sit' | 'crouch' | 'kneel', k) bends his legs and lowers him to the floor; call it after place()
    // or route(). Head: hero.nod(t, { at, count }) and hero.shake(t, ...). Arms: blendPose('rest', 'shrug', k).
    // Move a hand to a world point by the safe path (up in front of his chest, then on). As a hold when hold is true.
    reachTo(hero, hand, point, k = 1) { moveHand(hero, hand, point, k); },
    // Sit on the top of a part (a bench seat: top about 0.75, so his feet stay on the floor, and at most about 0.8 deep,
    // because his thighs are only 1.0 long and his calves would meet a deeper seat's edge). k 0: he stands in front
    // of it; 1: seated, his hands resting on the seat beside his hips (hands: 0 to 1, how much; 0 when the arms do
    // something else). face: the way he looks when seated (default the model's front).
    // His hips, thighs and shins may touch the seat. Call after blendPose; for the walk to it, end route() at the
    // returned stand point.
    sitOn(hero, model, part, { k = 1, face, back = 0.1, hands = true } = {}) {
      model.root.updateMatrixWorld(true);
      const b = boxOf(model.groups[part], new THREE.Box3()), cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, top = b.max.y;
      face ??= model.root.rotation.y;
      const fx = Math.sin(face), fz = Math.cos(face), hd = Math.abs(fx) * (b.max.x - b.min.x) / 2 + Math.abs(fz) * (b.max.z - b.min.z) / 2;
      const stand = [cx + fx * (hd + 1.5), cz + fz * (hd + 1.5)], seat = [cx - fx * back, cz - fz * back], e = k * k * (3 - 2 * k);
      hero.place(stand[0] + (seat[0] - stand[0]) * e, stand[1] + (seat[1] - stand[1]) * e, { face, lean: 0.3 * Math.sin(Math.PI * e) });
      if (e > 0) {
        hero.legsPose('sit', e);
        // On a seat higher than his knees, his feet leave the floor: the hips rest on the seat.
        const H = hero.legs[0].hip.getWorldPosition(new THREE.Vector3()), up = top + 0.5 - H.y;
        if (up > 0) hero.root.position.y += up * e;
        if (e > 0.15) hero.seat = { m: model, part };
        // Hands on the seat beside his hips: the arms hang straight, clear of his shirt and legs (hands on the thighs
        // touch his own legs).
        const hw = (hands === true ? 1 : +hands || 0) * e;
        if (hw > 0) {
          hero.root.updateMatrixWorld(true);
          const r = new THREE.Vector3(-1, 0, 0).applyQuaternion(hero.root.quaternion), HP = hero.legs[0].hip.getWorldPosition(new THREE.Vector3()).add(hero.legs[1].hip.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
          for (const i of [0, 1]) { const sg = i === 0 ? 1 : -1; hero.reach(i, [HP.x + r.x * 1.45 * sg, top + 0.5, HP.z + r.z * 1.45 * sg], hw); }
        }
      }
      return { stand, seat };
    },
    // Tap a world point with one hand count times, gap s apart, from at: a key, a screen, a sleeping cat. Returns the hit
    // times for s.sfx. The hand waits lift above the point between taps.
    tap(hero, hand, point, t, { at = 0, count = 3, gap = 0.3, lift = 0.3 } = {}) {
      const hits = Array.from({ length: count }, (_, j) => at + j * gap), last = hits[count - 1];
      const up = clamp((t - (at - 0.6)) / 0.4, 0, 1) * (1 - clamp((t - (last + 0.2)) / 0.4, 0, 1));
      let h = 0; for (const ht of hits) h = Math.max(h, 1 - Math.abs(t - ht) / (gap * 0.5));
      h = clamp(h, 0, 1) ** 2;
      const off = [point[0], point[1] + lift, point[2]];
      if (up > 0.95 && h > 0.97) hero.hold(hand, point, 1);
      else if (up > 0) moveHand(hero, hand, [off[0], off[1] - (lift - 0.12) * h, off[2]], up);
      return { hits };
    },
    // Type on the top of a part (a laptop's keys) with both hands, from at for dur s: small alternating taps.
    typeOn(hero, model, part, t, { at = 0, dur = 2, rate = 5, k = 1 } = {}) {
      model.root.updateMatrixWorld(true);   // the box of this frame, not of the frame drawn before (frames are drawn out of order)
      const b = boxOf(model.groups[part], new THREE.Box3()), c = [(b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2];
      hero.root.updateMatrixWorld(true);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion), r = [-f.z, f.x];
      const on = clamp((t - at) / 0.5, 0, 1) * (1 - clamp((t - (at + dur)) / 0.5, 0, 1)) * k;
      [0, 1].forEach((i) => {
        const sg = i === 0 ? 1 : -1, ph = (t - at) * rate * Math.PI + i * Math.PI, hop = Math.max(0, Math.sin(ph)) * 0.16;
        const P = [c[0] + r[0] * 0.38 * sg, c[1] + 0.38 + hop, c[2] + r[1] * 0.38 * sg];
        if (on > 0) moveHand(hero, i, P, on, false);   // the fingers hover over the keys: not a hold
      });
    },
    // Move a hand along a path of world points on a surface (writing or drawing on a board): u from 0 to 1 along it.
    // k brings the hand in and away. Returns the point the hand is at, so the scene can draw the ink to it.
    trace(hero, hand, pts, u, { k = 1 } = {}) {
      const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
      const d = clamp(u, 0, 1) * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
      const w = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), P = [0, 1, 2].map((j) => pts[i - 1][j] + (pts[i][j] - pts[i - 1][j]) * w);
      moveHand(hero, hand, P, k);
      return P;
    },
    // Throw a thing (a ball) in an arc to a world point: he holds it on his palm in front of his chest, swings back,
    // and lets go at at; it lands at to after dur s. Before at, the thing rests on his hand. obj: a mesh (g.ball()).
    toss(hero, obj, t, { hand = 1, at = 1, dur = 0.9, to, height = 2.5, r = 0.2 } = {}) {
      hero.root.updateMatrixWorld(true);
      const S = hero.arms[hand].shoulder.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion); f.y = 0; f.normalize();
      // An underhand toss: the hand stays 1.4 or more in front of him (his shirt is about 1 deep), so the ball on his
      // palm never touches his body; the swing goes down and up in front of him.
      const H = [S.x + f.x * 1.45, S.y - 1.0, S.z + f.z * 1.45], W = [S.x + f.x * 1.5, S.y - 1.75, S.z + f.z * 1.5], R = [S.x + f.x * 1.85, S.y - 0.5, S.z + f.z * 1.85];
      const lerp3 = (A, B, u) => { const e = u * u * (3 - 2 * u); return [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e]; };
      let P;
      if (t < at - 0.7) P = H;
      else if (t < at - 0.25) P = lerp3(H, W, (t - (at - 0.7)) / 0.45);   // swing back
      else if (t < at) P = lerp3(W, R, (t - (at - 0.25)) / 0.25);        // and forward
      else P = lerp3(R, H, clamp((t - at) / 0.6, 0, 1));                  // follow through, then down
      hero.reach(hand, P, t < at + 0.6 ? 1 : 1 - clamp((t - at - 0.6) / 0.4, 0, 1));
      if (t < at) obj.position.set(P[0], P[1] + 0.25 + r, P[2]);   // on his palm, not in it
      else {
        const u = clamp((t - at) / dur, 0, 1), A = [R[0], R[1] + 0.25 + r, R[2]];
        obj.position.set(A[0] + (to[0] - A[0]) * u, A[1] + (to[1] - A[1]) * u + 4 * height * u * (1 - u), A[2] + (to[2] - A[2]) * u);
      }
      return { landed: at + dur };
    },
    // Hands on his hips, elbows out (k from 0 to 1).
    handsOnHips(hero, k = 1) {
      if (k <= 0) return;
      hero.root.updateMatrixWorld(true);
      const H = new THREE.Vector3(0, -4.25, 0.05).applyMatrix4(hero.root.matrixWorld), r = new THREE.Vector3(-1, 0, 0).applyQuaternion(hero.root.quaternion);
      for (const i of [0, 1]) { const sg = i === 0 ? 1 : -1; hero.reach(i, [H.x + r.x * 1.55 * sg, H.y + 0.2, H.z + r.z * 1.55 * sg], k); }
    },
    // ---------- play and tool actions (the user asked, 2026-11-10): kick, jump, hammer, sweep, water, lieDown ----------
    // Each one starts and ends with him standing, so they chain. A held tool rests at its own place until the action
    // takes it, and goes back there after it. Times are scene seconds; draw only from t.
    // Kick a ball (a 'kickball' model) from `from` to `to` ([x, z] on the floor) with leg (0: his right). He stands behind
    // the ball, swings the leg back (hip +0.4, knee bent) and through (hip to -0.9, knee straight); the shoe meets the
    // ball at `at`, and it rolls away and slows to a stop at `to` after roll s. spin: the turn of the ball at the start, so
    // a kick back continues from the end of the first kick (its returned roll, negated). Walk him to the returned stand
    // point (face) before at - 0.9. Returns { stand, face, end, roll }.
    kick(hero, ball, t, { at = 1, from, to, leg = 0, roll = 2.0, spin = 0, r = 0.55 } = {}) {
      const d = new THREE.Vector3(to[0] - from[0], 0, to[1] - from[1]), L = d.length(); d.normalize();
      const face = Math.atan2(d.x, d.z), rgt = new THREE.Vector3(-d.z, 0, d.x), sg = leg === 0 ? 1 : -1;
      // The leg at the moment of contact (hip -0.25, knee straight): the front of the sole is this far ahead of his feet.
      const HC = -0.25, toe = 1.95 * Math.sin(-HC) + 0.06 * Math.sin(-HC) + 1.02 * Math.cos(HC) + 0.02;
      const stand = [from[0] - d.x * (toe + r) - rgt.x * 0.57 * sg, from[1] - d.z * (toe + r) - rgt.z * 0.57 * sg];
      // The ball: still until at, then a constant slowing: its speed at the start (2 L / roll) is more than the shoe's.
      const u = clamp((t - at) / roll, 0, 1), s = L * (1 - (1 - u) * (1 - u));
      const P = [from[0] + d.x * s, from[1] + d.z * s];
      // It rolls about its own centre (y = r): the root (its bottom) is placed so the centre stays at (P, r).
      ball.root.quaternion.setFromAxisAngle(new THREE.Vector3(d.z, 0, -d.x), spin + s / r);
      const cOff = new THREE.Vector3(0, r, 0).applyQuaternion(ball.root.quaternion);
      ball.root.position.set(P[0] - cOff.x, r - cOff.y, P[1] - cOff.z);
      if (ball.shadow) { ball.shadow.position.x = P[0]; ball.shadow.position.z = P[1]; }
      const end = at + 0.9;
      if (t < at - 0.9 || t > end) return { stand, face, end, roll: L / r };
      hero.place(stand[0], stand[1], { face, lean: -0.08 * Math.sin(Math.PI * span(t, at, 0.9)) });
      // The hip: back (0 to +0.4, 0.6 s), through the ball (+0.4 to -0.9, eased, the contact at the middle), and back to 0.
      let h, kn;
      if (t < at - 0.3) { const e = ease(span(t, at - 0.9, 0.6)); h = 0.4 * e; kn = 1.2 * e; }
      else if (t < at + 0.3) { const e = ease(span(t, at - 0.3, 0.6)); h = 0.4 - 1.3 * e; kn = 1.2 * (1 - ease(span(t, at - 0.3, 0.28))); }
      else { const e = ease(span(t, at + 0.3, 0.6)); h = -0.9 * (1 - e); kn = 0.35 * Math.sin(Math.PI * e); }
      const Lg = hero.legs[leg]; Lg.hip.rotation.x = h; Lg.knee.rotation.x = kn; Lg.ankle.rotation.x = -0.25 * Math.max(0, -h);
      hero.posed = 1;   // a kick, not a frozen step
      hero.arms[leg].shoulder.rotation.x += -0.5 * h; hero.arms[1 - leg].shoulder.rotation.x += 0.6 * h;
      // The shoe meets the ball: for these frames it may touch it.
      if (Math.abs(t - at) < 0.12) hero.touch.push({ m: ball, parts: /^(shoe|sole|shin)/ });
      return { stand, face, end, roll: L / r };
    },
    // Jump at at: a short crouch, both feet leave the floor for air s in an arc height high, the arms bent and up (never
    // straight), and a landing crouch. From (x, z) to `to` ([x, z], default the same place), facing face. Returns { end }.
    jump(hero, t, { at = 1, x = 0, z = 0, to, face = 0, height = 1.3, air = 0.7 } = {}) {
      const end = at + air + 0.5, T = to || [x, z], u = span(t, at, air), e = ease(u);
      hero.place(x + (T[0] - x) * e, z + (T[1] - z) * e, { face });
      if (t < at - 0.45 || t > end) return { end };
      // The crouch before (0.4 s down, a fast push up) and after (down and up in 0.5 s).
      const pre = t < at ? ease(span(t, at - 0.45, 0.35)) * (1 - span(t, at - 0.08, 0.08)) : 0;
      const land = t > at + air ? Math.sin(Math.PI * span(t, at + air, 0.5)) : 0;
      const tuck = t >= at && t <= at + air ? 0.3 * Math.sin(Math.PI * u) : 0;
      const k = Math.max(pre * 0.55, land * 0.45, tuck);
      if (k > 0) hero.legsPose('crouch', k);
      hero.posed = 1;
      if (t >= at && t <= at + air) hero.root.position.y += 4 * height * u * (1 - u);
      // The arms: back in the crouch, then up beside his head with the elbows bent (the hands 0.95 from the shoulder).
      const up = t < at ? 0 : t <= at + air ? Math.sin(Math.PI * Math.min(1, u * 1.6)) : 0;
      if (pre > 0) for (const a of hero.arms) a.shoulder.rotation.x += 0.55 * pre;
      if (up > 0) {
        const { f, r } = facing(hero);
        [0, 1].forEach((i) => { const S = hero.arms[i].shoulder.getWorldPosition(new THREE.Vector3()), sg = i === 0 ? 1 : -1;
          hero.reach(i, [S.x + f.x * 0.35 + r.x * 0.55 * sg, S.y + 0.6, S.z + f.z * 0.35 + r.z * 0.55 * sg], up); });
      }
      return { end };
    },
    // Hammer a nail into a 'nailboard' (mode 'drive': count hits, gap s apart; the nail sinks a third on each) or pull it
    // out with the claw (mode 'pull': he turns the hammer, the claw's slot takes the nail under its head, and he pulls the
    // handle toward him so the head rocks on the bench and the claw levers the nail up). The 'hammer' model rests on the
    // bench near him until at, and goes back there at the end. hand: 0 his right. The bench must have size 1. He stands
    // at the bench's +z side and faces it; walk him to the returned stand point (face) before at. Returns { stand, face,
    // hits, end }: the hit times are for s.sfx('thud', t).
    hammer(hero, tool, board, t, { at = 1, mode = 'drive', count = 3, gap = 0.75, hand = 0, lean = 0.1 } = {}) {
      // The grip: on the handle's axis, 0.3 from its end. At rest (the hammer on its side) the hand holds it 0.36 above the
      // axis (local +x is up there), so the fist closes on the handle and stays clear of the bench.
      const sg = hand === 0 ? 1 : -1, pull = mode === 'pull', G = [0, 0, 0.3], GR = [0.36, 0, 0.3];
      // He stands with the nail 3.2 in front of him and 1.35 to the hand's side (drive), or 2.85 in front and 0.75 to the
      // side (pull: the elbow then stays outside the hammer's head, which comes back toward him).
      const sb = toWorld(board, [0.9 - sg * (pull ? 0.75 : 1.35), 0, pull ? 2.55 : 2.9]), stand = [sb.x, sb.z], face = board.root.rotation.y + Math.PI;
      const pose = (QB, WB) => ({ Q: qWorld(board, QB), W: toWorld(board, WB) });
      const rest = pose(basisQ([0, 1, 0], [0, 0, -1], [-1, 0, 0]), [0.9, 2.775 + 0.36, 0.45]);   // on its side on the bench, the claw away from him
      const nail = (k) => board.setPose(clamp(k, 0, 1));
      // Drive: the head turns about the hand, theta up from level (the face down on the nail at theta 0).
      const swing = (th, W) => pose(basisQ([-1, 0, 0], [0, Math.cos(th), Math.sin(th)], [0, Math.sin(th), -Math.cos(th)]), W);
      // The hand when the face is on the nail's head, the nail sunk k: the face is 0.37 below and 1.32 beyond the grip.
      let hits = [], end, work, nk;
      if (!pull) {
        const h0 = at + 1.85; hits = Array.from({ length: count }, (_, j) => h0 + j * gap);
        const last = hits[count - 1]; end = last + 0.55 + 1.4;
        const sunk = (tt) => hits.reduce((s2, h) => s2 + span(tt, h, 0.06), 0) / count;
        // The hand (bench frame) when the face is on the nail's head, the nail sunk k: the face is 0.37 below and 1.32 beyond the grip.
        const strikeW = (k) => [0.9, 3.13 - 0.3 * k + 0.374, -0.3 + 1.32], raisedW = (k) => { const W = strikeW(k); return [W[0], W[1] + 0.45, W[2] + 0.3]; };
        const lerp3 = (A, B, e) => A.map((v, i) => v + (B[i] - v) * e);
        nk = sunk(t);
        work = (tt) => {
          const k = sunk(tt);
          if (tt > last) { if (tt < last + 0.2) return swing(0, strikeW(k)); const e = ease(span(tt, last + 0.2, 0.35)); return swing(0.95 * e, lerp3(strikeW(k), raisedW(k), e)); }
          const j = hits.findIndex((h) => h >= tt), u = (tt - (hits[j] - gap)) / gap, kp = j / count;   // kp: the nail before hit j
          if (j > 0 && u < 0.12) return swing(0, strikeW(k));   // on the nail while it sinks
          if (u < 0.55) { if (j === 0) return swing(0.95, raisedW(0)); const e = ease((u - 0.12) / 0.43); return swing(0.95 * e, lerp3(strikeW(kp), raisedW(kp), e)); }
          const e = ((u - 0.55) / 0.45) ** 2;   // down, faster and faster
          return swing(0.95 * (1 - e), lerp3(raisedW(kp), strikeW(kp), e));
        };
      } else {
        // Pull: the claw's pose for lean b (0 upright); slide (toward him) and lift move the whole hammer.
        const clawPose = (b, slide = 0, lift = 0) => {
          const C = [0.9, 2.6 + claw(b) + lift, -0.3 + 0.75 + slide];
          const D = [0, -Math.cos(b), Math.sin(b)], Y = [0, -Math.sin(b), -Math.cos(b)];
          const QB = basisQ([-1, 0, 0], Y, D), W = V3([0, -0.06, 0.3 - 1.62]).applyQuaternion(QB).add(V3(C));
          return pose(QB, W.toArray());
        };
        // The lever: b from 0.95 (the claw flat under the sunk nail's head) to 0.16 (the nail's head back at its rest
        // height, 0.47 over the bench). The nail's head rides on the claw: its underside 0.17 (sunk) to 0.47 (out).
        const a = at + 1.4; end = a + 2.6 + 1.4;
        const lev = (tt) => 0.95 - 0.79 * ease(span(tt, a + 1.0, 1.2));
        const slideOf = (tt) => tt < a + 1.0 ? 0.3 * (1 - ease(span(tt, a + 0.4, 0.6))) : 0.3 * ease(span(tt, a + 2.2, 0.4));
        const under = (tt) => { if (tt < a + 0.4 || tt > a + 2.6) return -9; const sl = slideOf(tt); return clawLift(tt < a + 2.2 ? lev(tt) : 0.16, sl) + 0.005; };
        nk = t < a + 2.2 ? 1 - clamp((under(t) - 0.17) / 0.3, 0, 1) : 0;
        work = (tt) => {
          if (tt < a + 0.4) return clawPose(0.95, 0.3, 0.3 * (1 - ease(span(tt, a, 0.4))));
          if (tt < a + 1.0) return clawPose(0.95, slideOf(tt));
          if (tt < a + 2.2) return clawPose(lev(tt));
          return clawPose(0.16, slideOf(tt));
        };
      }
      const { P, grip, take, busy } = toolPath(t, at, end, rest, work, 0.6);
      placeTool(tool, P, GR.map((v, i) => v + (G[i] - v) * take));
      nail(pull ? (t < at ? 1 : t > end ? 0 : nk) : (t < at ? 0 : t > end ? 1 : nk));
      const ln = pull ? 0.15 : lean;
      // The lean comes in and goes out with the hand, so his body never jumps at the start or the end.
      if (busy) { hero.place(stand[0], stand[1], { face, lean: ln * grip }); holdTool(hero, hand, P.W, grip); }
      return { stand, face, hits, end };
    },
    // Sweep a 'dust' pile with a 'broom' (both hands on the handle): strokes times in dur s, the broom's head pushes along
    // dir ([x, z] on the floor: the pile's way) with its bristles on the floor, then lifts and goes back for the next push.
    // The pile moves only while the bristles push it, at their speed, touching their edge: dist in all. from: the pile's start [x, z]. He faces across the pile's way, to the camera's side (face:
    // his facing, to choose it). The broom stands upright on its brush at rest ([x, z]) until at; he takes it there, walks
    // with the brush lifted to the strokes, steps along with the pile, walks back, and stands the broom at rest again.
    // His left hand holds the handle high, his right hand low; the strokes run 2.6 to his right.
    // Walk him to the returned stand point (face) before at. Returns { stand, face, end, pileEnd, rest } (rest: where the
    // broom stands, for the next sweep).
    sweep(hero, broom, pile, t, { at = 1, dur = 4, strokes = 4, from, dist = 2.4, dir = [-1, 0], face, rest, reach = 4.3 } = {}) {
      const s = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
      if (face == null) { const c = new THREE.Vector3(camera.position.x - from[0], 0, camera.position.z - from[1]); const p = new THREE.Vector3(-s.z, 0, s.x); face = Math.atan2(...(p.dot(c) >= 0 ? [p.x, p.z] : [-p.x, -p.z])); }
      const f = dirOf(face), r = new THREE.Vector3(-f.z, 0, f.x), P0 = new THREE.Vector3(from[0], 0, from[1]), up = new THREE.Vector3(0, 1, 0);
      // Along the pile's way (s), from the pile's start: the bristles' leading edge is E (0.16) ahead of the head's centre,
      // the pile's back edge 0.72 behind its centre. Each push goes c + 0.6 (c = dist / strokes): 0.6 to reach the pile,
      // then c with it; the return goes back 0.6, lifted 0.3. x0: where the first push starts.
      const E = 0.16, c = dist / strokes, Lp = c + 0.6, x0 = -0.72 - E - 0.6, T = dur / strokes, PF = 0.55;
      const stroke = (tt) => { const u = clamp((tt - a0) / T, 0, strokes - 1e-9), k = Math.floor(u), q = u - k, st = x0 + k * c;
        return q < PF ? { k, push: true, q: q / PF, x: st + Lp * ease(q / PF), y: 0 } : { k, push: false, q: (q - PF) / (1 - PF), x: st + Lp - 0.6 * ease((q - PF) / (1 - PF)), y: 0.3 * Math.sin(Math.PI * (q - PF) / (1 - PF)) }; };
      const brushX = (tt) => tt <= a0 ? x0 : tt >= b0 ? x0 + strokes * c : stroke(tt).x;
      const mid = (tt) => x0 + Lp / 2 + c * strokes * span(tt, a0, dur);
      // Where he stands to sweep: reach behind the pile's line, with the line of strokes 2.6 to his right.
      const H = (tt) => P0.clone().addScaledVector(s, mid(tt)).addScaledVector(f, -reach).addScaledVector(r, -2.6);
      // The rest: the broom upright at R; he takes it standing at Sr, 2.2 in front of him and 0.75 to his left. Default R: at the
      // first stroke.
      const H0 = P0.clone().addScaledVector(s, x0).addScaledVector(f, -reach).addScaledVector(r, -2.6);
      const R = rest ? new THREE.Vector3(rest[0], 0, rest[1]) : H0.clone().addScaledVector(f, 2.2).addScaledVector(r, -0.75);
      const Sr = R.clone().addScaledVector(f, -2.2).addScaledVector(r, 0.75);
      const a = at + 1.4, w1 = Math.max(0.5, Sr.distanceTo(H0) / 2.2);
      let a0 = a + w1;
      const b0 = a0 + dur, w2 = Math.max(0.5, Sr.distanceTo(H(b0)) / 2.2), end = b0 + w2 + 1.4;
      // Where he is: at Sr, walking to the strokes, sweeping, walking back.
      const Hp = (tt) => tt <= a ? Sr.clone() : tt < a0 ? Sr.clone().lerp(H(a0), ease(span(tt, a, w1))) : tt <= b0 ? H(tt) : tt < b0 + w2 ? H(b0).lerp(Sr, ease(span(tt, b0, w2))) : Sr.clone();
      const lift = (tt) => tt < a0 ? 1.0 * (1 - ease(span(tt, a0 - 0.35, 0.35))) : tt > b0 ? 1.0 * ease(span(tt, b0, 0.35)) : stroke(tt).y;
      // The pile: its back edge stays 0.02 into the bristles' furthest edge so far (it moves only while they push it).
      const now = t > a0 && t < b0 ? stroke(t) : null;
      const edge = t <= a0 ? -9 : t >= b0 ? x0 + (strokes - 1) * c + Lp + E : Math.max(now.k > 0 ? x0 + (now.k - 1) * c + Lp + E : -9, (now.push ? now.x : x0 + now.k * c + Lp) + E);
      const px = Math.max(0, edge + 0.72 - 0.02), pileEnd = [P0.x + s.x * (dist - 0.02), P0.z + s.z * (dist - 0.02)];
      broom.touch = now && (now.push || now.q < 0.15) && edge + 0.72 - 0.02 > 0 ? [{ m: pile }] : [];
      pile.root.position.set(P0.x + s.x * px, 0, P0.z + s.z * px);
      if (pile.shadow) { pile.shadow.position.x = pile.root.position.x; pile.shadow.position.z = pile.root.position.z; }
      // The broom: the brush at B, the handle up to U (2.6 in front of him, 0.5 to his left), where the upper hand holds it.
      const G = [[0, 4.6, 0], [0, 3.8, 0]];   // the grips on the handle: upper hand (1, his left) and lower hand (0, his right)
      const B = (tt) => { const h = Hp(tt), rel = tt >= a0 && tt <= b0 ? brushX(tt) - mid(tt) : -Lp / 2; return h.addScaledVector(f, reach).addScaledVector(r, 2.6).addScaledVector(s, rel).addScaledVector(up, lift(tt)); };
      const U = (tt) => Hp(tt).addScaledVector(f, 2.6).addScaledVector(r, -0.5).setY(3.8);
      // The handle runs from the head on the floor to the upper hand; the head's broad face looks along s (it pushes).
      const swPose = (tt) => { const Bv = B(tt), h = U(tt).sub(Bv).normalize(), zz = s.clone().addScaledVector(h, -s.dot(h)).normalize(), xx = h.clone().cross(zz);
        const Q = basisQ(xx.toArray(), h.toArray(), zz.toArray()); return { Q, W: Bv.add(V3(G[0]).applyQuaternion(Q)) }; };
      // At rest it stands upright, its broad face along s.
      const rq = basisQ(s.clone().cross(up).negate().toArray(), [0, 1, 0], s.toArray()), rp = { Q: rq, W: R.clone().add(V3(G[0]).applyQuaternion(rq)) };
      const { P, grip, busy } = toolPath(t, at, end, rp, swPose, 0.3);
      placeTool(broom, P, G[0]);
      // The bristles never go into the floor: lift the broom when its lowest point is below y 0.
      const brush = broom.groups.brush, pos = meshOf(brush).geometry.attributes.position, v = new THREE.Vector3(); let low = 9;
      for (let i = 0; i < pos.count; i += 5) { v.fromBufferAttribute(pos, i).applyMatrix4(brush.matrixWorld); low = Math.min(low, v.y); }
      if (low < 0) { broom.root.position.y -= low; broom.root.updateMatrixWorld(true); }
      if (busy) {
        const Hn = Hp(t), walked = t < a0 ? Sr.distanceTo(Hn) : t <= b0 ? Sr.distanceTo(H(a0)) + Math.abs(mid(t) - mid(a0)) : Sr.distanceTo(H(a0)) + dist + H(b0).distanceTo(Hn);
        const moving = t > a && t < a0 ? Math.sin(Math.PI * span(t, a, w1)) : t > b0 && t < b0 + w2 ? Math.sin(Math.PI * span(t, b0, w2)) : t >= a0 && t <= b0 ? 0.4 * span(t, a0, 0.4) * (1 - span(t, b0 - 0.4, 0.4)) : 0;
        hero.place(Hn.x, Hn.z, { face, lean: 0.2 * grip });
        hero.stride(walked * hero.STEP, 0.4 * moving);
        holdTool(hero, 1, V3(g.partPoint(broom, 'handle', G[0])), grip);
        // The right hand comes to the lower grip from his right side (a path across his chest goes into his shirt).
        const k1 = ease(span(t, a - 0.6, 0.6)) * (1 - ease(span(t, b0 + w2, 0.6)));
        if (k1 > 0) {
          const L = g.partPoint(broom, 'handle', G[1]), M = Hp(t).addScaledVector(f, 2.0).addScaledVector(r, 1.3).setY(3.2).toArray();
          if (k1 < 0.5) hero.reach(0, M, ease(k1 / 0.5));
          else if (k1 < 0.999) { hero.reach(0, M.map((v, i) => v + (L[i] - v) * ease((k1 - 0.5) / 0.5)), 1); (hero.holds ??= []).push({ i: 0, point: L, k: 0.94 }); }
          else hero.hold(0, L, 1);
        }
      }
      return { stand: [Sr.x, Sr.z], face, end, pileEnd, rest: [R.x, R.z] };
    },
    // Water a 'plant' (on the floor, size 1) with a 'wateringCan' held by its top handle. The can rests on a 'pedestal'
    // (top y 2.2) at restAt (returned; put the pedestal there), to the side of the pour place away from the hand. He takes
    // it there, walks sideways to the pour place, holds it out beside the pot, tilts it until the spout points down over
    // the soil, and drops fall from the rose; then he walks back and sets it down. effect: 'grow' (the stem grows), 'open'
    // (the flower opens) or 'close' (it closes again); the plant shows the state before at and after the end. drops:
    // g.ball()s made in setup (6 is enough). He faces face (default: the plant's turn, so he looks along its +z). Walk him to the returned stand point (face) before at. Returns { stand, face, end, restAt }.
    water(hero, can, plant, t, { at = 1, effect = 'grow', rest, drops = [], hand = 0, face } = {}) {
      const sg = hand === 0 ? 1 : -1, G = [-0.1, 1.53, 0];
      plant.root.updateMatrixWorld(true);
      const C = plant.root.position.clone(); face ??= plant.root.rotation.y;
      const f = dirOf(face), r = new THREE.Vector3(-f.z, 0, f.x), rs = r.clone().multiplyScalar(sg), up = new THREE.Vector3(0, 1, 0);
      // The can's turn: its spout (+x) toward the pot, along f turned 0.5 in toward his middle (so the can's body, which
      // swings back under the hand as it tilts, stays out beyond his forearm), tilted down by tau about its own z.
      const sp = f.clone().multiplyScalar(Math.cos(0.5)).addScaledVector(rs, -Math.sin(0.5)), yaw = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(-sp.z, sp.x));
      const Qc = (tau) => yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tau));
      const ROSE = [1.52, 1.15, 0], roseOff = (tau) => V3([ROSE[0] - G[0], ROSE[1] - G[1], 0]).applyQuaternion(Qc(tau));
      // The rose: over the soil, 0.3 from the stem on the spout's side, 0.5 above the soil (T). It comes there level from
      // T1 (0.65 further out, 0.35 higher), under where the open petals reach, while the can tilts from 0.8 to 1.15.
      // Carried, the can is level and the rose is high (y 3.6), 0.5 out from the stem: it goes down outside the petals.
      const T = C.clone().addScaledVector(sp, -0.3).setY(1.45), T1 = T.clone().addScaledVector(sp, -0.65).setY(1.8);
      const roseAt = (R, tau) => ({ Q: Qc(tau), W: R.clone().sub(roseOff(tau)) });   // the can's pose for its rose at R
      // The pour place X: the hand at the pour is 2.0 in front of him and 2.0 to the hand's side.
      const X = roseAt(T, 1.15).W.addScaledVector(f, -2.0).addScaledVector(rs, -2.0).setY(0);
      const carryR = (H) => H.clone().add(C.clone().sub(X)).addScaledVector(sp, -0.5).setY(3.6);
      const carry = (H) => roseAt(carryR(H), 0);
      const pourPose = (u) => u < 0.5 ? (() => { const e = ease(u / 0.5); return roseAt(carryR(X).lerp(T1, e), 0.8 * e); })() : (() => { const e = ease((u - 0.5) / 0.5); return roseAt(T1.clone().lerp(T, e), 0.8 + 0.35 * e); })();
      // The rest place Sr: 3.0 further to the hand's side; the can stands on its pedestal 2.2 in front of him there and
      // 1.3 to the hand's side, so he walks away from it to the pour.
      const Sr = X.clone().addScaledVector(rs, 3.0);
      const restAt = rest ? V3(rest) : Sr.clone().addScaledVector(f, 2.2).addScaledVector(rs, 1.3).setY(2.2);
      const rp = { Q: yaw.clone(), W: restAt.clone().add(V3(G).applyQuaternion(yaw)) };
      const w1 = Sr.distanceTo(X) / 2.2, a = at + 1.4, a1 = a + w1, b1 = a1 + 4.0, end = b1 + w1 + 1.4;
      const Hp = (tt) => tt <= a ? Sr.clone() : tt < a1 ? Sr.clone().lerp(X, ease(span(tt, a, w1))) : tt <= b1 ? X.clone() : tt < b1 + w1 ? X.clone().lerp(Sr, ease(span(tt, b1, w1))) : Sr.clone();
      const wobble = (tt) => 0.06 * Math.sin(2 * Math.PI * (tt - a1) / 0.8) * Math.sin(Math.PI * span(tt, a1 + 1.3, 1.6));
      const work = (tt) => {
        if (tt < a1 || tt > b1) return carry(Hp(tt));
        if (tt < a1 + 1.3) return pourPose(span(tt, a1, 1.3));
        if (tt < a1 + 2.9) return roseAt(T, 1.15 + wobble(tt));
        return pourPose(1 - span(tt, a1 + 2.9, 1.1));
      };
      const { P, grip, busy } = toolPath(t, at, end, rp, work, 0.25);
      placeTool(can, P, G);
      // The plant: before, during and after.
      const e = ease(span(t, a1 + 1.5, 1.8));
      if (effect === 'grow') plant.setPose(e);
      else { plant.setPose(1); plant.setPose(effect === 'open' ? e : 1 - e, 'bloom'); }
      // Drops: each falls from 0.22 below the rose to just above the soil, one after another, while he pours.
      const rose = g.partPoint(can, 'rose', ROSE);
      drops.forEach((d, i) => {
        // Each falls at a steady 3 a second, so drops that follow each other stay apart; between falls it is hidden.
        const top = rose[1] - 0.22, fall = Math.max(0.05, (top - 1.0) / 3);
        const tt = t - (a1 + 1.35) - i * 0.3 / drops.length, cyc = tt - Math.floor(tt / 0.3) * 0.3, on = tt >= 0 && t <= a1 + 2.85 && cyc < fall;
        const y = top - 3 * cyc;
        d.position.set(rose[0] + 0.07 * Math.sin(i * 2.4), y, rose[2] + 0.07 * Math.cos(i * 2.4));
        d.scale.setScalar(on && y > 1.0 ? 1 : 1e-4);
      });
      if (busy) {
        const Hn = Hp(t), walked = t < a1 ? Sr.distanceTo(Hn) : t <= b1 ? Sr.distanceTo(X) : Sr.distanceTo(X) + X.distanceTo(Hn);
        const moving = t > a && t < a1 ? Math.sin(Math.PI * span(t, a, w1)) : t > b1 && t < b1 + w1 ? Math.sin(Math.PI * span(t, b1, w1)) : 0;
        hero.place(Hn.x, Hn.z, { face, lean: 0.1 * grip });
        hero.stride(walked * hero.STEP, 0.4 * moving);
        holdTool(hero, hand, P.W, grip);
      }
      return { stand: [Sr.x, Sr.z], face, end, restAt: [restAt.x, restAt.y, restAt.z] };
    },
    // Lie down on a 'rug' and rest (k 0 standing, 1 lying flat), and get up again (k back to 0): he sits on the floor
    // with his legs straight out (k 0 to 0.55: a crouch, then the sit), then leans back about his hips until he lies flat
    // (0.55 to 1). Lying, he breathes slowly (from t) and sleeps: the sleepy face with his eyes shut (sleep: 0 to 1).
    // His feet point to the rug's +x end; his hips are 1.5 from its middle. His body may touch the rug while k > 0. He
    // stands on the rug (y 0.08) at the returned stand point, facing face: route him there with { y: 0.08 }.
    lieDown(hero, rug, t, { k = 1, sleep = k } = {}) {
      rug.root.updateMatrixWorld(true);
      const H = toWorld(rug, [1.5, 0, 0]), ax = V3([1, 0, 0]).applyQuaternion(rug.root.quaternion), face = Math.atan2(ax.x, ax.z), stand = [H.x, H.z];
      if (k <= 0) return { stand, face };
      hero.place(H.x, H.z, { face, y: 0.08 });
      hero.touch.push({ m: rug, parts: /./ });
      const c = ease(span(k, 0, 0.3)), sit = ease(span(k, 0.3, 0.25)), back = ease(span(k, 0.55, 0.45));
      if (sit <= 0) hero.legsPose('crouch', c * 0.8, { y: 0.08 });
      else { hero.legsPose('crouch', 0.8 * (1 - sit), { y: 0.08 }); hero.legsPose('sitFloor', sit, { y: 0.08 }); }
      if (back > 0) {
        // Lean back about the hips; the thighs turn forward by the same angle, so the legs stay on the floor. Breathing
        // lifts his chest a little.
        const beta = (Math.PI / 2 - 0.03) * back;
        hero.root.updateMatrixWorld(true);
        const Pm = hero.legs[0].hip.getWorldPosition(new THREE.Vector3()).add(hero.legs[1].hip.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(hero.root.quaternion), q = new THREE.Quaternion().setFromAxisAngle(side, -beta);
        hero.root.position.sub(Pm).applyQuaternion(q).add(Pm); hero.root.quaternion.premultiply(q);
        for (const l of hero.legs) l.hip.rotation.x += beta;
        hero.plant(0.08, { body: true });
        // Breathing: only his chest rises and falls (the shirt grows 7 % in depth about its back, 3.6 s a breath).
        const sh = hero.shapes.find((m) => m.userData.part === 'shirt'), bz = 1 + 0.07 * back * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / 3.6));
        sh.scale.z = bz; sh.position.z = 1.05 * (bz - 1);
      }
      // Sitting, his hands rest on the rug beside his hips; they let go as he leans back, and his arms lie at his sides.
      // Lying, they stay there, a little nearer his head, so his arms stay bent (a straight arm level with the shoulder
      // reads as a salute).
      if (sit > 0) {
        hero.root.updateMatrixWorld(true);
        const f = dirOf(face), r = new THREE.Vector3(-f.z, 0, f.x), HP = hero.legs[0].hip.getWorldPosition(new THREE.Vector3()).add(hero.legs[1].hip.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        for (const i of [0, 1]) { const sg = i === 0 ? 1 : -1, bk = 0.25 + 0.45 * back; hero.reach(i, [HP.x + r.x * 1.45 * sg - f.x * bk, 0.6, HP.z + r.z * 1.45 * sg - f.z * bk], sit); }
      }
      if (sleep > 0) { hero.blendExpression('neutral', 'sleepy', sleep); hero.blink(ease(span(sleep, 0.5, 0.5))); }
      return { stand, face };
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
