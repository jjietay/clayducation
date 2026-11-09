// Clayducation: one clay world, played by the scroll. DESIGN.md says what each chapter shows and why.
//
// The scroll is a timeline of chapters and transitions. In a chapter, the scroll plays its set (t from 0 to 1)
// and its statement stays in place on the screen. In a transition (u from 0 to 1), the statement fades out,
// the camera flies to the next set and the mascot walks there at a steady pace (the scroll length of a walk
// matches its distance), or, from the book to the files, the pen flies into the camera and out again.
// The mascot is the one thing that stays: he is sculpted out of the clay and goes through the whole pipeline.

import * as THREE from 'three';
import { createMascot, studio, CACHE, EXPRESSIONS } from './world/clay/mascot.js';
import { buildModel } from './world/clay/models.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t) => { t = clamp(t); return 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2; };
const bump = (a, b, x) => sm(a, a + (b - a) * 0.3, x) * (1 - sm(b - (b - a) * 0.3, b, x));
// Steady pace: speeds up over the first 15 %, then constant, then slows over the last 15 %.
// Flow: speeds up over the first 15 %, then constant to the end, so he walks on into the next chapter.
const flow = (u) => { const a = 0.15, v = 1 / (1 - a / 2); return u < a ? v * u * u / (2 * a) : v * (u - a / 2); };
const pace = (u) => { const a = 0.15, v = 1 / (1 - a); return u < a ? v * u * u / (2 * a) : u > 1 - a ? 1 - v * (1 - u) ** 2 / (2 * a) : v * (u - a / 2); };
const D = Math.PI / 180, PI2 = Math.PI / 2;
const $ = (s, el = document) => el.querySelector(s);
const now = () => performance.now();
let dt = 1 / 60, lastT = now();
const damp = (a, b, rate) => a + (b - a) * (1 - Math.exp(-rate * dt));

// ---------- the world layout: where each set stands ----------
const S1 = [10, 0], S2 = [34, 2.4], WX0 = 50, WX1 = 72, WZ = 1.2, CX = 82, KK = 2.4, FX = 92, S7 = [116, 0];
const FACE = CX + (0.3 + 0.82) * KK + 0.04;   // the +x face of the cart body at rest

// ---------- the timeline ----------
const chs = [...document.querySelectorAll('.ch')];
const ACT = [3.2, 3.6, 3.6, 3.0, 3.4, 2.6, 3.4, 1.4];   // scroll of each chapter, in screen heights
const WALK = 9;                                          // world units walked for each screen height of scroll
let segs = [], total = 0;
const C = [];                                            // the chapters' sets, below
function plan() {
  segs = []; let y = 0;
  for (let j = 0; j < chs.length; j++) {
    segs.push({ j, kind: 'act', y, len: ACT[j] }); y += ACT[j];
    if (j === chs.length - 1) break;
    const kind = C[j].next || 'walk', len = kind === 'pen' ? 2.6 : Math.max(1.3, route(j).total / WALK);
    segs.push({ j, kind, y, len }); y += len;
  }
  total = y;
  $('#track').style.height = `${(total + 1) * innerHeight}px`;
}
// { i, t, u, kind }: chapter i plays at t, or (u > 0) the transition from i to i + 1 is at u.
function where(y) {
  const v = y / innerHeight;
  for (const s of segs) if (v < s.y + s.len || s === segs.at(-1)) {
    const f = clamp((v - s.y) / s.len);
    return s.kind === 'act' ? { i: s.j, t: f, u: 0, kind: 'act' } : { i: s.j, t: 1, u: Math.max(f, 1e-4), kind: s.kind };
  }
}
// For the page's own checks: the scroll position of chapter j at t, or of the transition after it at u.
window.__claySets = C;   // for the page's own checks
window.__clayHero = () => H; window.__clayState = () => state; window.__clayR = () => R;
window.__clayCam = () => cam && { p: cam.position.toArray().map((v) => +v.toFixed(3)), o: [cam.view?.offsetX, cam.view?.offsetY] };
window.__clayAt = (j, f, tr) => { const s = segs.find((x) => x.j === j && (tr ? x.kind !== 'act' : x.kind === 'act')); return (s.y + f * s.len) * innerHeight; };
const yOf = (j, t = 0) => { const s = segs.find((x) => x.kind === 'act' && x.j === j); return (s.y + t * s.len) * innerHeight; };

// ---------- smooth wheel scroll: the page eases to where the wheel sends it ----------
const focus = { obj: null, k: 0, want: 0 };
const scrollMax = () => document.documentElement.scrollHeight - innerHeight;
let goal = scrollY, cur = scrollY, gliding = false;
addEventListener('wheel', (e) => {
  if (focus.obj) { e.preventDefault(); return; }
  if (still || e.ctrlKey) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  if (!gliding) cur = goal = scrollY;
  goal = clamp(goal + d, 0, scrollMax()); gliding = true;
}, { passive: false });
addEventListener('keydown', (e) => {
  if (focus.obj && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) e.preventDefault();
  if (e.key === 'Escape') closeFocus();
});
function glide() {
  if (!gliding) { cur = goal = scrollY; return; }
  cur = damp(cur, goal, 6);
  if (Math.abs(cur - goal) < 0.5) { cur = goal; gliding = false; }
  scrollTo(0, cur);
}
const jump = (y) => { goal = clamp(y, 0, scrollMax()); cur = scrollY; gliding = !still; if (still) scrollTo(0, goal); };

// ---------- words: one statement per chapter, in place on the screen; nothing floats between chapters ----------
for (const say of document.querySelectorAll('.say')) {
  [...say.childNodes].forEach((c) => {
    if (c.nodeType === 3) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach((p) => { if (!p) return; if (/^\s+$/.test(p)) f.append(p); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = p; f.append(s); } }); c.replaceWith(f); }
    else if (c.nodeName === 'B') { const s = document.createElement('span'); s.className = 'w'; c.replaceWith(s); s.append(c); }
  });
}
const born = now();
// How far chapter j is: below 0 at the end of the transition into it, 0 to 1 while it plays, above 1 after.
function qOf(s, j) { if (s.u === 0) return s.i === j ? s.t : s.i > j ? 2 : -2; if (s.i === j) return 1 + s.u; if (s.i === j - 1) return s.u - 1; return s.i > j ? 2 : -2; }
function words(s) {
  chs.forEach((c, j) => {
    let q = qOf(s, j);
    if (j === 0) q = Math.min(q, (now() - born) / 1500 - 0.2);
    // Shown while it plays; fades out in the first 12 % of the transition out, in during the last 15 % of the one in.
    const vis = q >= 0 && q <= 1 ? 1 : q > 1 ? 1 - sm(1, 1.12, q) : sm(-0.15, 0, q);
    const shown = vis * (focus.obj ? 1 - clamp(focus.k * 1.6) : 1);
    c.style.opacity = shown; c.style.visibility = shown > 0.002 ? 'visible' : 'hidden';
    c.querySelectorAll('.say .w').forEach((w, k) => w.style.setProperty('--in', still ? 1 : sm(-0.15 + k * 0.03, 0.08 + k * 0.03, q)));
    const b = $('.say b', c); if (b) b.style.setProperty('--k', still ? 1 : sm(0.06, 0.18, q));
  });
}
const dots = $('.dots');
chs.forEach((c, j) => {
  const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${c.dataset.name}</span>`; b.title = c.dataset.name;
  b.addEventListener('click', () => jump(yOf(j, j ? 0.02 : 0)));
  dots.append(b);
});

// ---------- the pointer: the raw one, and a damped copy for the camera and the head ----------
const ptr = { x: innerWidth / 2, y: innerHeight / 2, at: -1e9, mouse: false, pressed: false };
addEventListener('pointermove', (e) => Object.assign(ptr, { x: e.clientX, y: e.clientY, at: now(), mouse: e.pointerType === 'mouse' }), { passive: true });
document.documentElement.addEventListener('mouseleave', () => { ptr.mouse = false; });
const pn = { x: 0, y: 0, sx: 0, sy: 0 };

// ---------- the world ----------
const canvas = document.createElement('canvas'); canvas.className = 'world'; canvas.setAttribute('aria-hidden', 'true');
let R, scene, cam, H = null, heroReady = false, put = null;
const ray = new THREE.Raycaster();
function rayAt(x = ptr.x, y = ptr.y) { ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), cam); return ray; }
const toScreen = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; };
let shadowTex;
function shadow(w, d, x, z, a = 0.4) {
  shadowTex ??= (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    r.addColorStop(0, 'rgba(20,20,30,1)'); r.addColorStop(0.6, 'rgba(20,20,30,.4)'); r.addColorStop(1, 'rgba(20,20,30,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: a, depthWrite: false }));
  m.rotation.x = -PI2; m.position.set(x, 0.01, z); m.scale.set(w, d, 1); m.renderOrder = -1; put(m); return m;
}
function model(name, { x = 0, y = 0, z = 0, ry = 0, k = 1, floor = true } = {}) {
  const m = buildModel(THREE, name); m.root.position.set(x, y, z); m.root.rotation.y = ry; m.root.scale.setScalar(k); put(m.root);
  m.root.updateMatrixWorld(true);
  if (floor) { const b = new THREE.Box3().setFromObject(m.root), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); m.shadow = shadow(s.x * 1.4, s.z * 1.6, c.x, c.z); }
  return m;
}
function card(w, h, draw, { px = 1024 } = {}) {
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.redraw = (...a) => { draw(c.getContext('2d'), c.width, c.height, ...a); tex.needsUpdate = true; };
  m.redraw(); return m;
}
const round = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

// ---------- shapes, packed by engine/gallery-export.mjs ----------
const ROOT = new URL('world/', import.meta.url);
const saved = {}; CACHE.read = (k) => saved[k];
let index;
function unpack(blob, { v, t, lo, hi, at, n }) {
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), col = new Float32Array(v * 3), tri = new Uint32Array(t);
  const P = new Uint16Array(blob.slice(at, at + v * 6)), N = new Int8Array(blob, at + v * 6, v * 3), Cc = new Uint8Array(blob, at + v * 9, v * 3);
  for (let a = 0; a < 3; a++) {
    const span = Math.max(hi[a] - lo[a], 1e-9) / 65535; let q = 0;
    for (let i = 0; i < v; i++) { q = (q + P[a * v + i]) & 0xffff; pos[i * 3 + a] = lo[a] + q * span; nor[i * 3 + a] = N[a * v + i] / 127; col[i * 3 + a] = (Cc[a * v + i] / 255) ** 2.2; }
  }
  for (let i = 0; i < v * 3; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
  const I = new Uint8Array(blob, at + v * 12, n);
  for (let i = 0, p = 0, last = 0; i < t; i++) { let z = 0, m = 1, b; do { b = I[p++]; z += (b & 127) * m; m *= 128; } while (b & 128); last += z % 2 ? -(z + 1) / 2 : z / 2; tri[i] = last; }
  return { pos, nor, col, tri };
}
async function load(name) {
  const g = index[name], r = await fetch(new URL(g.file, ROOT));
  const blob = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  for (const [k, p] of Object.entries(g.packed)) saved[k] = unpack(blob, p);
}

// ---------- the mascot ----------
function place(x, z, face, o = {}) { H.place(x, z, { face, ...o }); }
// Smooth: the chapters only say what they want (an expression, where to look, a pose); at the end of each frame
// the mascot eases from where he was towards it. So nothing on him changes in one frame: not his face when a
// chapter ends, not his head when it turns, not his arms when he lets go.
const mixVal = (a, b, k) => typeof a === 'number' ? a + ((b ?? a) - a) * k : Array.isArray(a) ? a.map((v, i) => mixVal(v, b?.[i], k))
  : Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b || {})])].map((key) => [key, a[key] === undefined ? b[key] : mixVal(a[key], b?.[key], k)]));
const want = { face: null, look: null };
const gaze = { yaw: 0, pitch: 0, k: 0 }, ease = { face: null, q: new Map() };
let realSetExpression = null;
// A chain of blends (a to b, then b to c) works as before: a later blend at 0 leaves the earlier one.
function blendFace(a, b, k) { if (want.face && k <= 0.001) return; want.face = mixVal(EXPRESSIONS[a] || a, EXPRESSIONS[b] || b, clamp(k)); }
function lookAt(point, k) { if (H) want.look = { point: point ? point.clone() : null, k }; }
function settle() {
  if (!H) return;
  const f = want.face || EXPRESSIONS.neutral;
  ease.face = ease.face ? mixVal(ease.face, f, 1 - Math.exp(-6 * dt)) : mixVal(f, f, 0);
  realSetExpression(ease.face);
  // The head: towards the point or the pointer, through a damped spring.
  const L = want.look || { point: null, k: 0 }, head = H.headPivot, at = head.getWorldPosition(new THREE.Vector3());
  let target = L.point;
  if (!target) { ray.setFromCamera(new THREE.Vector2(pn.sx, pn.sy), cam); target = cam.position.clone().addScaledVector(ray.ray.direction, cam.position.distanceTo(at)); }
  const d = head.parent.worldToLocal(target.clone()).sub(head.position);
  gaze.yaw = damp(gaze.yaw, clamp(Math.atan2(d.x, d.z), -0.7, 0.7), 5); gaze.pitch = damp(gaze.pitch, clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.4, 0.4), 5);
  gaze.k = damp(gaze.k, L.k, 3);
  head.rotation.y += gaze.yaw * gaze.k; head.rotation.x -= gaze.pitch * gaze.k;
  const b = (now() / 1000) % 4.1; if (b < 0.16) H.blink(Math.sin(b / 0.16 * Math.PI));
  // Arms, legs and the body's turn: each eases from its last angle to the new one.
  const parts = [...H.arms.flatMap((a) => [a.shoulder, a.elbow, a.wrist]), ...H.legs.flatMap((l) => [l.hip, l.ankle]), H.root];
  const k = 1 - Math.exp(-14 * dt);
  for (const o of parts) { const q = o.quaternion.clone(), was = ease.q.get(o); if (was) o.quaternion.copy(was).slerp(q, o === H.root ? 1 - Math.exp(-9 * dt) : k); ease.q.set(o, o.quaternion.clone()); }
  // His body's place too (a lean moves it): eased, except a real jump of the scene, which it follows at once.
  const p = H.root.position.clone();
  if (ease.p && ease.p.distanceTo(p) < 2) H.root.position.copy(ease.p.lerp(p, 1 - Math.exp(-16 * dt)));
  ease.p = H.root.position.clone();
  want.face = null; want.look = null;
}
let happyAt = -1e9;
const happy = () => clamp(1 - Math.abs((now() - happyAt) / 1000 - 0.9) / 0.9);

// ---------- focus: a page or a film frame comes to the camera; the scroll is locked until it goes back ----------
let dim;
function openFocus(obj, onOpen) {
  if (focus.obj) return;
  focus.obj = obj; focus.home = { parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() };
  obj.updateMatrixWorld(true);
  focus.from = { pos: obj.getWorldPosition(new THREE.Vector3()), quat: obj.getWorldQuaternion(new THREE.Quaternion()), scale: obj.getWorldScale(new THREE.Vector3()) };
  scene.attach(obj); focus.want = 1; focus.k = 0; focus.onClose = onOpen?.() || null; focus.ch = state.i;
  // Drawn last and on top: transparent things draw after opaque ones, so it must be one too.
  focus.wasClear = obj.material.transparent; obj.material.transparent = true; obj.material.depthTest = false; obj.material.needsUpdate = true; obj.renderOrder = 20;
}
function closeFocus() { if (focus.obj) focus.want = 0; }
function stepFocus() {
  if (!focus.obj) { if (dim) dim.visible = false; return; }
  if (state.i !== focus.ch || state.u > 0) focus.want = 0;   // a jump to another chapter closes it
  focus.k = damp(focus.k, focus.want, 7);
  const o = focus.obj, k = inOut(clamp(focus.k)), h = o.geometry.parameters.height;
  // In front of the camera, in the middle of the screen (the view is shifted, so take the ray through it).
  ray.setFromCamera(new THREE.Vector2(0, 0), cam);
  const dist = h * 0.5 / (Math.tan(cam.fov * D / 2) * 0.74), to = cam.position.clone().addScaledVector(ray.ray.direction, dist);
  o.position.lerpVectors(focus.from.pos, to, k); o.quaternion.slerpQuaternions(focus.from.quat, cam.quaternion, k); o.scale.lerpVectors(focus.from.scale, new THREE.Vector3(1, 1, 1), k);
  dim.visible = true; dim.material.opacity = 0.55 * k;
  dim.position.copy(cam.position).addScaledVector(ray.ray.direction, dist + 0.6); dim.quaternion.copy(cam.quaternion);
  if (focus.want === 0 && focus.k < 0.01) {
    const { parent, pos, quat, scale } = focus.home;
    parent.add(o); o.position.copy(pos); o.quaternion.copy(quat); o.scale.copy(scale);
    o.material.depthTest = true; o.material.transparent = focus.wasClear; o.material.needsUpdate = true; o.renderOrder = 0; focus.onClose?.(); focus.obj = null; focus.k = 0;
  }
}

// ---------- the chapters ----------
// Each: start / end [x, z, face] of the mascot, via (points of the walk to the next set), build(), act(t)
// and shot(t) -> { at, dist, az, el, sx, sy }. sx, sy move the subject on the screen, beside the words.

// 0. A lump of clay. It is heavy and uneven: palm-flattened faces, thumb marks, finger ridges, a flat bottom.
// A press dents it; with the button down the dent stays. Then the lump becomes a clay figure in his shape,
// which cracks: its pieces fall away from the top down, show him inside, and land as crumbs.
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
const fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.28 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.12;
function clayNormals() {
  const W = 1024, Hh = 512, h = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) h[y * W + x] = fbm(x / 26, y / 26, 0.5) * 0.55 + fbm(x / 7, y / 7, 3.1) * 0.22 + (hash3(x, y, 9) - 0.5) * 0.05;
  // Finger ridges, and the marks of a wire tool.
  for (const [cx, cy, r] of [[300, 210, 80], [690, 300, 70], [520, 120, 60], [110, 360, 55], [880, 150, 60]]) for (let y = Math.max(0, cy - r); y < Math.min(Hh, cy + r); y++) for (let x = cx - r; x < cx + r; x++) {
    const xx = (x + W) % W, d = Math.hypot((x - cx) / 1.35, y - cy); if (d < r) h[y * W + xx] += Math.sin(d * 1.05) * 0.2 * (1 - d / r) ** 0.7;
  }
  for (let k = 0; k < 6; k++) { const y0 = 60 + k * 70 + hash3(k, 2, 3) * 30; for (let x = 0; x < W; x++) { const y = Math.round(y0 + Math.sin(x / 90 + k) * 14); for (let dy = -2; dy <= 2; dy++) if (y + dy >= 0 && y + dy < Hh) h[(y + dy) * W + x] -= 0.12 * (1 - Math.abs(dy) / 3); } }
  const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'), img = g.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W], dy = h[Math.min(Hh - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x];
    const n = [-dx * 3.2, -dy * 3.2, 1], l = Math.hypot(...n), o = (y * W + x) * 4;
    img.data[o] = (n[0] / l * 0.5 + 0.5) * 255; img.data[o + 1] = (n[1] / l * 0.5 + 0.5) * 255; img.data[o + 2] = (n[2] / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
}
const FLOOR = -1.75, LIFT = 1.77;   // the lump's flat bottom in its own units, and how high its middle is
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
// The clay figure: his shape (a round head on a body, on legs), a little larger than him, so he stands
// inside it. A distance field of three soft ellipsoids.
const FIG = new THREE.Vector3(0, 4.4, 0);
function figure(x, y, z) {
  const e = (cx, cy, cz, rx, ry, rz) => { const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz, k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / rx, b / ry, c / rz); return k1 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); };
  let d = e(0, 7.05, 0.05, 2.05, 1.95, 1.95);          // the head, with hair and ears
  d = smin(d, e(0, 4.45, 0, 2.4, 1.8, 1.4), 1.1);      // the body, with the arms
  d = smin(d, e(0, 2.85, 0.05, 2.45, 1.15, 1.4), 0.9);     // the hips, round his hands
  return smin(d, e(0, 1.75, 0.15, 1.6, 2.05, 1.45), 1.0);   // the legs and shoes
}
C[0] = {
  start: [0, 0.6, 0], end: [0, 0.6, 0.35], via: [[3.5, -4.4], [S1[0] - 1, -4.4]],
  build() {
    // A UV sphere, cut into pieces that can fall away: each piece has its own copy of the points on its edge,
    // so a piece leaves no stretched triangles behind when it falls.
    const src = new THREE.SphereGeometry(2, 180, 130), sp = src.attributes.position.array, idx = src.index.array, n0 = sp.length / 3;
    const seeds = Array.from({ length: 46 }, (_, i) => { const y = 1 - (i + 0.5) / 46 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
    const v = new THREE.Vector3(), pieceOf = (x, y, z) => { v.set(x, y, z).normalize(); let best = 0, bd = -2; seeds.forEach((s, k) => { const d = v.dot(s); if (d > bd) { bd = d; best = k; } }); return best; };
    const map = new Map(), dirs = [], piece = [], tri = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const k = pieceOf(sp[a * 3] + sp[b * 3] + sp[c * 3], sp[a * 3 + 1] + sp[b * 3 + 1] + sp[c * 3 + 1], sp[a * 3 + 2] + sp[b * 3 + 2] + sp[c * 3 + 2]);
      for (const i of [a, b, c]) { const key = i * 64 + k; let j = map.get(key); if (j === undefined) { j = dirs.length / 3; map.set(key, j); dirs.push(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]); piece.push(k); } tri.push(j); }
    }
    const n = dirs.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uvs = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { v.fromArray(dirs, i * 3).normalize(); uvs[i * 2] = 0.5 + Math.atan2(v.z, -v.x) / (2 * Math.PI); uvs[i * 2 + 1] = Math.acos(clamp(v.y, -1, 1)) / Math.PI; }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(tri);
    this.dirs = dirs; this.piece = piece; this.n = n;
    this.shape = new Float32Array(n); this.perm = new Float32Array(n); this.temp = new Float32Array(n);
    // The lump: uneven, with palm-flattened faces and thumb marks.
    const thumbs = [[0.55, 0.35, 0.76], [-0.7, 0.1, 0.7], [0.1, 0.8, 0.5], [0.8, -0.1, -0.5]].map((d) => new THREE.Vector3(...d).normalize());
    const palms = [[0.9, 0.2, 0.3, 1.72], [-0.5, 0.3, -0.8, 1.78], [0.1, 1, -0.2, 1.7], [-0.6, -0.1, 0.75, 1.82]].map(([x, y, z, d]) => [new THREE.Vector3(x, y, z).normalize(), d / 2]);
    const col = new Float32Array(n * 3), base = new THREE.Color('#c08463');
    // The figure: for each point, how far its own direction from the figure's middle reaches the figure's skin.
    this.fig = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromArray(dirs, i * 3).normalize();
      let r = 1 + 0.12 * fbm(v.x * 1.1 + 3, v.y * 1.1, v.z * 1.1) + 0.04 * fbm(v.x * 3, v.y * 3 + 7, v.z * 3);
      for (const [pv, d] of palms) { const c = v.dot(pv); if (c > 0.05) r = smin(r, d / c, 0.12); }
      for (const d of thumbs) { const a = v.angleTo(d); r -= 0.085 * Math.exp(-((a / 0.3) ** 2)); }
      this.shape[i] = r;
      const k = 0.9 + 0.12 * fbm(v.x * 2.5 + 11, v.y * 2.5, v.z * 2.5) - 0.35 * Math.max(0, 1.04 - r);
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
      let lo = 0, hi = 7;
      for (let s = 0; s < 28; s++) { const m = (lo + hi) / 2; if (figure(FIG.x + v.x * m, FIG.y + v.y * m, FIG.z + v.z * m) < 0) lo = m; else hi = m; }
      const fy = Math.max(0.03, FIG.y + v.y * lo) + 0.035 * fbm(v.x * 4, v.y * 4, v.z * 4 + 5);
      this.fig[i * 3] = v.x * lo * (1 + 0.03 * fbm(v.x * 3 + 2, v.y * 3, v.z * 3)); this.fig[i * 3 + 1] = fy; this.fig[i * 3 + 2] = v.z * lo;
    }
    this.col0 = col.slice(); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Points at the same place (the sphere's seam and poles, and the edges of the pieces) share one normal
    // while the clay is whole, so no seam shows.
    const key = new Map(); this.twins = [];
    for (let i = 0; i < n; i++) { const k = `${dirs[i * 3].toFixed(4)},${dirs[i * 3 + 1].toFixed(4)},${dirs[i * 3 + 2].toFixed(4)}`; if (key.has(k)) key.get(k).push(i); else key.set(k, [i]); }
    for (const list of key.values()) if (list.length > 1) this.twins.push(list);
    // Each piece: its middle on the figure, when it falls (from the top down), which way, and how it turns.
    this.pieces = seeds.map((s, k) => ({ c: new THREE.Vector3(), n: 0, k }));
    for (let i = 0; i < n; i++) { const p = this.pieces[piece[i]]; p.c.x += this.fig[i * 3]; p.c.y += this.fig[i * 3 + 1]; p.c.z += this.fig[i * 3 + 2]; p.n++; }
    for (const p of this.pieces) {
      p.c.divideScalar(Math.max(1, p.n));
      p.t0 = 0.66 + 0.16 * clamp(1 - p.c.y / 9) + 0.02 * hash3(p.k, 4, 1);
      const out = new THREE.Vector3(p.c.x, 0, p.c.z); if (out.lengthSq() < 0.01) out.set(hash3(p.k, 1, 1) - 0.5, 0, 0.5); out.normalize();
      p.out = out.multiplyScalar(1.3 + 1.6 * hash3(p.k, 2, 7));
      p.axis = new THREE.Vector3(hash3(p.k, 3, 1) - 0.5, hash3(p.k, 5, 2) - 0.5, hash3(p.k, 6, 3) - 0.5).normalize(); p.spin = 1.5 + 2.5 * hash3(p.k, 7, 4);
    }
    this.mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.86, sheen: 0.22, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffd9bf'), specularIntensity: 0.12,
      normalMap: clayNormals(), normalScale: new THREE.Vector2(0.95, 0.95), side: THREE.DoubleSide });
    this.lump = new THREE.Mesh(g, this.mat); this.lump.position.set(0, 0, 0.6); put(this.lump);
    this.lump.frustumCulled = false;   // its shape changes every frame
    this.sh = shadow(5.5, 4.5, 0, 0.6, 0.55);
  },
  act(t) {
    const L = this.lump, n = this.n, D3 = this.dirs, v = new THREE.Vector3(), q = new THREE.Quaternion(), w = new THREE.Vector3();
    // The scroll: a lump (0 to 0.3, the pointer can dent it); a squash (0.3 to 0.42); the lump becomes the
    // figure (0.4 to 0.62); the figure cracks, and its pieces fall away from the top down (0.66 to 0.92).
    const sq = still ? 0 : bump(0.3, 0.42, t), m = heroReady ? (still ? sm(0.4, 0.62, t) : back(sm(0.4, 0.62, t))) : 0;
    const shake = still ? 0 : bump(0.6, 0.68, t) * 0.04 * Math.sin(now() / 22);
    // The pointer, while it is a lump: the ray hits the lump's fixed shape (a dent moves away from the pointer).
    let dir = null;
    if (ptr.mouse && t < 0.3 && state.u === 0 && !focus.obj) {
      const r = rayAt().ray.clone(); r.applyMatrix4(L.matrixWorld.clone().invert()); r.origin.y -= LIFT;
      const hit = r.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 2.08), new THREE.Vector3());
      if (hit) dir = hit.normalize();
    }
    const hard = dir && ptr.pressed;
    for (let i = 0; i < n; i++) {
      let tp = this.temp[i] * (1 - Math.min(1, dt * 6));
      if (dir) { v.fromArray(D3, i * 3).normalize(); const a = v.angleTo(dir); if (a < 0.9) { const f = Math.exp(-((a / 0.34) ** 2)); tp = Math.max(tp, damp(this.temp[i], 0.14 * f, 9)); if (hard) this.perm[i] = Math.min(0.42, this.perm[i] + dt * 0.7 * f); } }
      this.temp[i] = tp < 1e-4 ? 0 : tp;
    }
    // How far each piece has fallen.
    const fall = this.pieces.map((p) => (heroReady ? clamp((t - p.t0) / 0.11) : 0));
    const rot = this.pieces.map((p, k) => new THREE.Quaternion().setFromAxisAngle(p.axis, p.spin * fall[k]));
    const P = L.geometry.attributes.position, col = L.geometry.attributes.color;
    for (let i = 0; i < n; i++) {
      v.fromArray(D3, i * 3).normalize();
      // The lump point (with its dents, the squash, and a flat bottom on the floor).
      const r = 2 * (this.shape[i] - this.perm[i] - this.temp[i]);
      let lx = v.x * r * (1 + 0.28 * sq), ly = v.y * r * (1 - 0.3 * sq), lz = v.z * r * (1 + 0.28 * sq);
      if (ly < FLOOR + 0.5) ly = FLOOR + Math.log1p(Math.exp((ly - FLOOR) * 6)) / 6;
      ly += LIFT * (1 - 0.3 * sq) - 0.01;
      // Towards the figure.
      let x = lerp(lx, this.fig[i * 3], m) + shake, y = lerp(ly, this.fig[i * 3 + 1], m), z = lerp(lz, this.fig[i * 3 + 2], m);
      const k = this.piece[i], f = fall[k];
      if (f > 0) {
        // A falling piece: it turns about its middle, flies a little out, drops to the floor, and gets small.
        const p = this.pieces[k], s = 1 - 0.78 * sm(0.5, 1, f);
        w.set(x - p.c.x, y - p.c.y, z - p.c.z).multiplyScalar(s).applyQuaternion(rot[k]);
        const drop = 1.2 * f - (p.c.y + 1.2 - 0.3) * f * f;
        x = p.c.x + p.out.x * f + w.x; y = Math.max(0.02, p.c.y + drop + w.y); z = p.c.z + p.out.z * f + w.z;
      }
      P.setXYZ(i, x, y, z);
      const kc = 1 - 0.55 * this.perm[i] - 0.3 * this.temp[i] - 0.12 * f;
      col.setXYZ(i, this.col0[i * 3] * kc, this.col0[i * 3 + 1] * kc, this.col0[i * 3 + 2] * kc);
    }
    P.needsUpdate = true; col.needsUpdate = true; L.geometry.computeVertexNormals();
    const N = L.geometry.attributes.normal, a = new THREE.Vector3();
    for (const list of this.twins) {
      if (list.some((i) => fall[this.piece[i]] > 0)) continue;   // a piece that falls has its own edge
      a.set(0, 0, 0); for (const i of list) a.add(v.fromBufferAttribute(N, i)); a.normalize(); for (const i of list) N.setXYZ(i, a.x, a.y, a.z);
    }
    N.needsUpdate = true; L.geometry.computeBoundingSphere();
    L.visible = true;
    const sw = lerp(1, 1.15, m);
    this.sh.scale.set(5.6 * sw * (1 + 0.28 * sq), 4.6 * (1 + 0.28 * sq), 1);
    if (!H) return;
    // He is inside the figure; the falling pieces show him, head first.
    H.root.visible = heroReady && t > 0.64;
    H.pose.rest(); place(0, 0.6, lerp(0, 0.35, sm(0.92, 1, t)));
    const wave = still ? 0 : bump(0.88, 0.995, t);
    if (wave) { H.blendPose('rest', 'wave', wave); H.arms[1].elbow.rotation.z += Math.sin(now() / 120) * 0.3 * wave; }
    H.blendExpression('sleepy', 'surprised', sm(0.7, 0.78, t)); H.blendExpression('surprised', 'smile', sm(0.84, 0.9, t));
    lookAt(null, sm(0.88, 0.95, t) * (1 - wave));
  },
  shot(t) {
    const o = still ? 1 : sm(0.34, 0.6, t);
    return { at: [0, lerp(2.1, 4.6, o), 0.6], dist: lerp(14, 31, o), az: lerp(-12, -6, o) + 3 * pn.x, el: lerp(13, 7, o) - 2 * pn.y, sx: 0.16, sy: lerp(-0.04, 0.03, o) };
  },
};

// 1. One sentence: the prompt types itself, its words fly into the book on the table, and the pen writes.
// Then the pen vibrates faster and faster and flies into the camera: its blue fills the screen.
const topicEl = $('.prompt .topic');
let topic = topicEl.textContent, film = null;
topicEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); topicEl.blur(); } });
topicEl.addEventListener('input', () => {
  // At most 70 characters, so the prompt stays within 3 rows.
  if (topicEl.textContent.length > 70) { topicEl.textContent = topicEl.textContent.slice(0, 70); const r = document.createRange(); r.selectNodeContents(topicEl); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  topic = topicEl.textContent.trim() || 'your topic'; film?.title.redraw();
});
const askEl = $('.prompt .ask'), fullAsk = askEl.textContent, PEN = '#4f86c6';
let pen = null;   // the pen: it writes in chapter 1, flies through the camera, and writes the files in chapter 2
C[1] = {
  start: [S1[0], S1[1] - 2.8, 0], end: [S1[0], S1[1] - 2.8, 0], next: 'pen',
  build() {
    this.table = model('table', { x: S1[0], z: S1[1], k: 1.15 });
    const top = 2.76 * 1.15;
    this.book = model('book', { x: S1[0], y: top, z: S1[1] - 0.15, ry: 0.15, k: 1.25, floor: false });
    this.book.root.updateMatrixWorld(true);
    // The pen is a copy of the book's pen, free in the world; the book's own pen stays hidden.
    const g = this.book.groups.pen; g.visible = false; g.updateMatrixWorld(true);
    pen = g.clone(true); pen.visible = true; pen.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    scene.add(pen);
    this.rest = { pos: g.getWorldPosition(new THREE.Vector3()), quat: g.getWorldQuaternion(new THREE.Quaternion()), scale: g.getWorldScale(new THREE.Vector3()) };
    this.flies = []; this.from = null;
  },
  penAt(t) {
    // On the book; tapping across the page (0.55 to 0.74); vibrating, faster and faster (0.74 to 1).
    const p = this.rest.pos.clone(), q = this.rest.quat.clone(), T = now() / 1000;
    const w = sm(0.55, 0.74, t), tap = Math.abs(Math.sin(w * Math.PI * 5)) * bump(0.55, 0.74, t);
    p.x += (w - 0.5) * 1.2 * bump(0.55, 0.76, t); p.y += 0.35 * tap + 0.45 * sm(0.74, 0.82, t);
    const vib = still ? 0 : sm(0.74, 1, t) ** 1.5, f = 20 + 70 * vib;
    p.x += Math.sin(T * f * 1.3) * 0.05 * vib; p.y += Math.sin(T * f) * 0.05 * vib; p.z += Math.cos(T * f * 0.9) * 0.04 * vib;
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(T * f * 1.1) * 0.12 * vib, 0, -0.35 * tap + Math.sin(T * f) * 0.1 * vib)));
    return { p, q, s: this.rest.scale.clone() };
  },
  act(t) {
    const ty = still ? 1 : sm(0.03, 0.2, t), n = Math.round(ty * fullAsk.length);
    if (askEl.textContent.length !== n) askEl.textContent = fullAsk.slice(0, n);
    topicEl.style.opacity = sm(0.18, 0.24, t);
    // The words fly from the prompt into the book.
    const parts = (askEl.textContent + topicEl.textContent).split(/\s+/).filter(Boolean);
    if (this.flies.length !== parts.length || this.flies.some((f, i) => f.textContent !== parts[i])) {
      this.flies.forEach((f) => f.remove());
      this.flies = parts.map((p) => { const s = document.createElement('span'); s.className = 'fly'; s.textContent = p; document.body.append(s); return s; });
      this.from = null;
    }
    const pr = $('.prompt').getBoundingClientRect();
    if (!this.from || this.from.top !== pr.top || this.from.n !== parts.length) {
      const range = document.createRange(), ws = [];
      for (const node of [askEl, topicEl]) { const tn = node.firstChild; if (!tn) continue; for (const m of tn.textContent.matchAll(/\S+/g)) { range.setStart(tn, m.index); range.setEnd(tn, m.index + m[0].length); const r = range.getBoundingClientRect(); ws.push([r.left, r.top]); } }
      this.from = { top: pr.top, n: parts.length, ws };
    }
    const bp = toScreen(this.book.root.position.clone().add(new THREE.Vector3(0, 0.7, 0))), live = state.i === 1 && state.u === 0;
    this.flies.forEach((f, i) => {
      const k = inOut(sm(0.28 + i * 0.022, 0.46 + i * 0.022, t)), [x0, y0] = this.from.ws[i] || bp;
      f.style.display = live && k > 0 && k < 1 ? 'block' : 'none';
      f.style.transform = `translate(${lerp(x0, bp[0], k)}px, ${lerp(y0, bp[1], k) - 70 * Math.sin(k * Math.PI)}px) scale(${1 - 0.7 * k}) rotate(${k * (i % 2 ? 24 : -24)}deg)`;
      f.style.opacity = 1 - sm(0.8, 1, k);
    });
    $('.prompt').style.opacity = 1 - 0.7 * sm(0.28, 0.5 + parts.length * 0.022, t);
    if (state.u === 0 || state.i !== 1) { const a = this.penAt(t); pen.position.copy(a.p); pen.quaternion.copy(a.q); pen.scale.copy(a.s); }
    if (!H) return;
    H.pose.rest(); place(S1[0], S1[1] - 2.8, 0);
    const B = this.book.root.position;
    H.hold(0, [B.x - 1.25, B.y + 0.15, B.z - 0.85], sm(0.02, 0.1, t)); H.hold(1, [B.x + 1.3, B.y + 0.15, B.z - 0.7], sm(0.02, 0.1, t) * (1 - bump(0.6, 0.98, t)));
    H.blendExpression('neutral', 'thinking', sm(0.2, 0.3, t)); H.blendExpression('thinking', 'surprised', sm(0.78, 0.88, t));
    lookAt(t < 0.5 ? null : pen.position, t < 0.5 ? 0.7 * (1 - sm(0.3, 0.5, t)) : 1);
  },
  shot(t) { return { at: [S1[0] + 0.3, 4.2, S1[1]], dist: lerp(28, 22, sm(0.5, 1, t)), az: 8 + 3 * pn.x, el: lerp(10, 16, sm(0.5, 1, t)) - 2 * pn.y, sx: -0.1, sy: -0.03 }; },
};

// 2. Claude writes three files: the pen comes out of the camera and writes the pages, line by line, while he
// watches it. Then the script agent strikes a wrong fact in pink and the pen writes the fix.
const FILES = [
  ['storyboard.md', ['## cancel  ·  sand', '', 'He holds the weight,', 'then lets go.', '', '[#beta]  a plum ring', '         round the hub', '[#sub]   M q̈ + β = M v + β', '[#cancel] β cancels,', '          then M'], 'mono'],
  ['script.md', ['## cancel', '', 'Now choose the torque as', 'τ equals M v, plus β.', '', 'The β part supplies the', 'inertia torque.', 'gravity and friction torques.', '', 'So with v equal to zero,', 'the link stays where it is.'], 'serif'],
  ['scenes.js', ["scene('cancel', {", '  bg: BG.sand,', '  async setup(s) {', "    s.j = await s.g.model('joint');", '    s.hero = await s.g.mascot();', '  },', '  draw(s) {', '    s.hero.hold(0, massAt(a));', '    s.e.draw(); s.g.render();', '  },', '});'], 'mono'],
];
const PW = 4.0, PH = 5.2;
const PEN_AXIS = new THREE.Vector3(Math.cos(0.28), 0, -Math.sin(0.28)), PEN_TIP = 0.66;   // the pen's axis and its nib tip, in its own units
const WRITE = [[0.1, 0.32], [0.34, 0.56], [0.58, 0.76]], CHECK = [0.8, 0.94];
const lineY = (j) => 0.19 + j * 0.072;
C[2] = {
  start: [S2[0], S2[1], -0.95], end: [S2[0], S2[1], -0.95], flows: true, via: [[WX0 - 7, -2.6]],
  build() {
    this.pages = FILES.map(([name, lines, kind], i) => {
      const m = card(PW, PH, (g, w, h, upto = 99, fix = 0) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#fbf7ef'; round(g, 0, 0, w, h, w * 0.04); g.fill();
        g.fillStyle = '#26262a'; g.font = `700 ${w * 0.05}px "JetBrains Mono"`; g.fillText(name, w * 0.08, h * 0.09);
        g.fillStyle = '#e4d3b7'; g.fillRect(w * 0.08, h * 0.115, w * 0.84, 3);
        let left = upto;
        lines.forEach((l, j) => {
          const y = h * lineY(j), isFix = kind === 'serif' && j === 7, wrong = kind === 'serif' && j === 6;
          if (isFix) { if (fix < 0.55) return; const n = Math.round(l.length * sm(0.55, 1, fix)); g.fillStyle = '#2f7d45'; g.font = `${w * 0.064}px "Instrument Serif"`; g.fillText(l.slice(0, n), w * 0.08, y); return; }
          if (left <= 0) return;
          const shown = l.slice(0, Math.max(0, Math.min(l.length, Math.floor(left)))); left -= l.length + 1;
          g.fillStyle = '#26262a'; g.font = kind === 'serif' ? `${w * 0.064}px "Instrument Serif"` : `${w * 0.043}px "JetBrains Mono"`;
          g.fillText(shown, w * 0.08, y);
          if (wrong && fix > 0) { const tw = g.measureText(l).width; g.strokeStyle = '#d6336c'; g.lineWidth = w * 0.012; g.beginPath(); g.moveTo(w * 0.07, y - h * 0.018); g.lineTo(w * 0.07 + (tw + w * 0.02) * sm(0, 0.5, fix), y - h * 0.018); g.stroke(); }
        });
      });
      m.lines = lines; m.chars = lines.reduce((a, l) => a + l.length + 1, 0); m.kind = kind;
      m.position.set(S2[0] - 15.4 + i * 4.7, 5.0 + (i === 1 ? 0.35 : 0), -0.6 - (i === 1 ? 0.5 : 0)); m.rotation.y = (1 - i) * 0.22 - 0.1;
      m.home = m.position.clone(); m.lift = 0; m.drawn = '';
      put(m); m.redraw(0); return m;
    });
  },
  // Where the pen tip is on page i when the writing there is at f (0 to 1).
  tip(i, f) {
    const m = this.pages[i], chars = f * m.chars; let left = chars, j = 0;
    while (j < m.lines.length - 1 && left > m.lines[j].length + 1) { left -= m.lines[j].length + 1; j++; }
    const xf = 0.08 + Math.min(1, left / 30) * 0.8;
    m.updateMatrixWorld(true);
    return m.localToWorld(new THREE.Vector3((xf - 0.5) * PW, (0.5 - lineY(j)) * PH + 0.1, 0.18));
  },
  onLine(i, j, f) { const m = this.pages[i]; m.updateMatrixWorld(true); return m.localToWorld(new THREE.Vector3((0.08 + 0.8 * f - 0.5) * PW, (0.5 - lineY(j)) * PH + 0.1, 0.18)); },
  // The pen's pose with its nib tip on page i at (x, y) in the page's own units, lifted by `lift` off the page:
  // the nib points into the page and down, as in a hand that writes.
  nib(i, x, y, lift = 0) {
    const m = this.pages[i]; m.updateMatrixWorld(true);
    const q0 = m.getWorldQuaternion(new THREE.Quaternion()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(q0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q0), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q0);
    const dir = n.clone().multiplyScalar(-0.62).addScaledVector(up, -0.62).addScaledVector(right, 0.3).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(PEN_AXIS, dir), sc = 1.25;
    const tip = m.localToWorld(new THREE.Vector3(x, y, 0.015)).addScaledVector(n, lift);
    return { p: tip.addScaledVector(dir, -PEN_TIP * sc), q, s: new THREE.Vector3(sc, sc, sc) };
  },
  // The point of the text where the writing on page i is at f (0 to 1), in the page's own units.
  at(i, f) {
    const m = this.pages[i]; let left = f * m.chars, j = 0;
    while (j < m.lines.length - 1 && left > m.lines[j].length + 1) { left -= m.lines[j].length + 1; j++; }
    const g = this.measure(i, j), xf = 0.08 + g * Math.min(1, left / Math.max(1, m.lines[j].length));
    return [(xf - 0.5) * PW, (0.5 - lineY(j) + 0.012) * PH];
  },
  // How wide line j of page i is, as a part of the page's width (measured once with the page's own font).
  measure(i, j) {
    const m = this.pages[i]; m.widths ??= [];
    if (m.widths[j] === undefined) { const g = document.createElement('canvas').getContext('2d'), w = 1024; g.font = m.kind === 'serif' ? `${w * 0.064}px "Instrument Serif"` : `${w * 0.043}px "JetBrains Mono"`; m.widths[j] = g.measureText(m.lines[j]).width / w; }
    return m.widths[j];
  },
  blend(a, b, f, arc) { const p = a.p.clone().lerp(b.p, f); p.y += Math.sin(f * Math.PI) * arc; return { p, q: a.q.clone().slerp(b.q, f), s: a.s.clone().lerp(b.s, f) }; },
  penAt(t) {
    // The pen writes each page in turn with its nib on the line, hops between pages, makes the check, then
    // goes into his hand.
    const k = WRITE.findIndex(([a, b]) => t >= a && t < b);
    if (k >= 0) { const [a, b] = WRITE[k], f = (t - a) / (b - a), [x, y] = this.at(k, f); return this.nib(k, x, y, Math.abs(Math.sin(f * 140)) * 0.05); }
    if (t < WRITE[0][0]) { const [x, y] = this.at(0, 0); return this.nib(0, x, y, 0.6 * (1 - sm(0, WRITE[0][0], t))); }
    const g6 = this.measure(1, 6), g7 = this.measure(1, 7), lx = (f, g) => (0.08 + g * f - 0.5) * PW, ly = (j) => (0.5 - lineY(j) + 0.012) * PH;
    if (t >= CHECK[0] && t < CHECK[1]) { const f = (t - CHECK[0]) / (CHECK[1] - CHECK[0]); return f < 0.5 ? this.nib(1, lx(f * 2, g6), ly(6) + 0.08) : this.nib(1, lx((f - 0.5) * 2, g7), ly(7)); }
    if (t >= CHECK[1]) {
      const a = this.nib(1, lx(1, g7), ly(7)), hand = H ? H.arms[1].wrist.getWorldPosition(new THREE.Vector3()) : a.p, f = sm(CHECK[1], 1, t);
      const b = { p: hand, q: a.q, s: a.s.clone().multiplyScalar(0.01) }; return this.blend(a, b, f, 1.2);
    }
    // A hop between two pages, or to the check.
    const g = WRITE.findIndex(([a]) => t < a), a0 = g > 0 ? WRITE[g - 1][1] : WRITE[2][1], b0 = g >= 0 ? WRITE[g][0] : CHECK[0], f = inOut(sm(a0, b0, t));
    const from = (() => { const i = g > 0 ? g - 1 : 2, [x, y] = this.at(i, 1); return this.nib(i, x, y); })();
    const to = g >= 0 ? (() => { const [x, y] = this.at(g, 0); return this.nib(g, x, y); })() : this.nib(1, lx(0, g6), ly(6) + 0.08);
    return this.blend(from, to, f, 1.4);
  },
  act(t) {
    this.pages.forEach((m, i) => {
      const [a, b] = WRITE[i], f = still ? 1 : clamp((t - a) / (b - a)), fix = i === 1 ? (still ? 1 : sm(CHECK[0], CHECK[1], t)) : 0, key = `${Math.floor(f * m.chars)}|${fix.toFixed(3)}`;
      if (key !== m.drawn) { m.redraw(f * m.chars, fix); m.drawn = key; }
      if (focus.obj === m) return;
      m.lift = damp(m.lift, !focus.obj && hovered === m ? 1 : 0, 10);
      m.position.copy(m.home).add(new THREE.Vector3(0, 0.25 * m.lift, 0.6 * m.lift));
    });
    if (state.u === 0 || state.i !== 1) { const a = this.penAt(t); pen.position.copy(a.p); pen.quaternion.copy(a.q); pen.scale.copy(a.s); }
    if (!H) return;
    H.pose.rest(); place(S2[0], S2[1], -0.95);
    H.blendPose('rest', 'think', sm(0.2, 0.3, t) * (1 - sm(0.76, 0.8, t)));
    H.blendExpression('neutral', 'thinking', sm(0.1, 0.2, t)); H.blendExpression('thinking', 'surprised', sm(0.8, 0.84, t)); H.blendExpression('surprised', 'understanding', sm(0.92, 0.97, t));
    lookAt(pen.position, 1);
  },
  shot(t) { return { at: [S2[0] - 5.6, 4.6, 0], dist: 28, az: -4 + 3 * pn.x, el: 7 - 2 * pn.y, sx: 0.05, sy: 0.1 }; },
};

// 3. Whisper times every word: the real waveform of one sentence; each word drops in at its Whisper time.
// The pointer finds the word under it: its chip lifts and its bars turn green.
let VOICE;
C[3] = {
  start: [WX0 - 1, -2.6, PI2], end: [WX1 + 1, -2.6, PI2], via: [[WX1 + 3.5, -0.5], [WX1 + 4.5, 3.6], [FACE + 3, 3.6]],
  build() {
    const { wave, words } = VOICE, n = wave.length, dur = 6.48;
    this.dur = dur;
    const geo = new THREE.BoxGeometry(0.17, 1, 0.5); geo.translate(0, 0.5, 0);
    this.bars = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({ roughness: 0.5, sheen: 0.3 }), n);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    this.h = wave.map((a) => 0.12 + 3.4 * a);
    for (let i = 0; i < n; i++) { m4.makeScale(1, this.h[i], 1).setPosition(WX0 + (i + 0.5) / n * (WX1 - WX0), 0, WZ); this.bars.setMatrixAt(i, m4); this.bars.setColorAt(i, c.set('#3d3a44')); }
    put(this.bars); shadow(WX1 - WX0 + 3, 2.6, (WX0 + WX1) / 2, WZ, 0.3);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.2, 0.08), new THREE.MeshBasicMaterial({ color: '#d6336c' })); this.head.geometry.translate(0, 2.6, 0); put(this.head);
    this.chips = words.map((w, j) => {
      const m = card(Math.max(1.1, 0.34 * w.w.length + 0.5), 0.9, (g, W, H2) => {
        g.clearRect(0, 0, W, H2); g.fillStyle = '#fbf7ef'; round(g, 2, 2, W - 4, H2 - 4, H2 * 0.28); g.fill();
        g.fillStyle = '#26262a'; g.font = `800 ${H2 * 0.4}px "Plus Jakarta Sans"`; g.textAlign = 'center'; g.fillText(w.w, W / 2, H2 * 0.52);
        g.fillStyle = '#8e3f8f'; g.font = `600 ${H2 * 0.22}px "JetBrains Mono"`; g.fillText(`${w.a.toFixed(2)} s`, W / 2, H2 * 0.84);
      }, { px: 256 });
      m.x = WX0 + w.a / dur * (WX1 - WX0) + m.geometry.parameters.width / 2 - 0.1; m.y = 4.25 + (j % 3) * 1.0; m.up = 0; put(m); return m;
    });
  },
  act(t) {
    // He walks on at the same pace as the walk in (about WALK units for each screen of scroll), and the
    // playhead goes with him.
    const hx = WX0 - 1 + (WX1 + 2 - WX0) * clamp(t / 0.9), { words } = VOICE, n = this.h.length;
    const x = clamp(hx + 0.8, WX0, WX1), T = (x - WX0) / (WX1 - WX0) * this.dur;
    this.head.position.set(x, 0, WZ); this.head.visible = t < 0.97;
    let hov = -1;
    if (ptr.mouse && state.i === 3 && state.u === 0) { const h = rayAt().intersectObjects([this.bars, ...this.chips])[0]; if (h) { if (h.object === this.bars) { const tt = (h.instanceId + 0.5) / n * this.dur; hov = words.findIndex((w) => tt >= w.a - 0.05 && tt <= w.b + 0.05); } else hov = this.chips.indexOf(h.object); } }
    if (hov >= 0 && (still ? 1 : back((T - words[hov].a) / 0.35)) < 0.5) hov = -1;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n * this.dur, w = words[hov]; this.bars.setColorAt(i, c.set(w && tt >= w.a && tt <= w.b ? '#2f7d45' : tt < T ? '#d6336c' : '#3d3a44')); }
    this.bars.instanceColor.needsUpdate = true;
    this.chips.forEach((m, j) => {
      const w = words[j], k = still ? 1 : back((T - w.a) / 0.35);
      m.up = damp(m.up, hov === j ? 1 : 0, 12);
      m.visible = k > 0.01; m.scale.setScalar(Math.max(0.01, k) * (1 + 0.25 * m.up));
      m.position.set(m.x, m.y + 2.5 * (1 - clamp(k)) + 0.35 * m.up, WZ + 0.2 + 0.5 * m.up);
      m.rotation.set(0, Math.atan2(cam.position.x - m.position.x, cam.position.z - m.position.z), 0);
    });
    if (!H) return;
    H.pose.rest(); place(hx, -2.6, PI2);
    H.stride((route(2).total + hx - (WX0 - 1)) * H.STEP, 0.5 * (1 - sm(0.86, 0.94, t)));   // the steps go on from the walk in
    H.blendExpression('neutral', 'smile', 0.6);
  },
  shot(t) { const x = lerp(WX0 + 5, WX1 - 5, sm(0.08, 0.9, t)); return { at: [x, 3.6, 0.6], dist: 27, az: -8 + 4 * pn.x, el: 8 - 2 * pn.y, sx: 0.1, sy: 0.15 }; },
};

// 4. Code draws every frame: he pushes the cart against its spring and lets go; it swings and settles.
// Beside it, the graph of x(t) is drawn frame by frame. The pointer on the graph shows a ghost cart: where the
// cart was at that time, because every frame comes only from its time.
const graphEl = $('.graph');
const SIM = 16, T0 = 0.12;                    // seconds of motion for the chapter's scroll, and where it starts
const simT = (t) => Math.max(0, (t - T0) * SIM);
const REL = (0.44 - T0) * SIM, AMP = 0.6;     // he lets go at this time; how far he pushes the cart (model units)
function cartX(s) {                           // the cart's offset (model units) at time s
  if (s < REL) return -AMP * sm(0, REL - 1.2, s);
  const u = s - REL; return -AMP * Math.exp(-0.32 * u) * Math.cos(2.4 * u);
}
C[4] = {
  start: [FACE + 1.75, 0, -PI2], end: [FACE + 3.4, 0, -PI2],
  build() {
    this.c = model('cart', { x: CX, k: KK });
    const G = this.c.groups; this.b0 = G.body.position.x;
    // The ghost: a clear copy of the cart body.
    this.ghost = G.body.clone(true); this.ghost.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; } });
    G.body.parent.add(this.ghost); this.ghost.visible = false;
    this.hoverS = null;
    graphEl.addEventListener('pointermove', (e) => { const r = graphEl.getBoundingClientRect(), f = (e.clientX - r.left - r.width * 0.1) / (r.width * 0.85); this.hoverS = f >= 0 && f <= 1 ? f * SIM * (1 - T0) : null; });
    graphEl.addEventListener('pointerleave', () => { this.hoverS = null; });
  },
  setCart(dx) {
    const G = this.c.groups;
    G.body.position.x = this.b0 + dx; G.spring.scale.x = (1.9 + dx) / 1.9;
    for (const k of ['wheel-1-1', 'wheel-11', 'wheel1-1', 'wheel11']) G[k].rotation.z = -dx / 0.21;
  },
  graph(s) {
    const r = graphEl.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2), W = Math.round(r.width * dpr), Hh = Math.round(r.height * dpr);
    if (!W || !Hh) return;
    if (graphEl.width !== W || graphEl.height !== Hh) { graphEl.width = W; graphEl.height = Hh; }
    const g = graphEl.getContext('2d'), x0 = W * 0.1, x1 = W * 0.95, y0 = Hh * 0.55, A = Hh * 0.38, S = SIM * (1 - T0);
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = 'rgba(240, 231, 214, .6)'; round(g, 0, 0, W, Hh, 16 * dpr); g.fill();
    g.strokeStyle = 'rgba(38, 38, 42, .35)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.moveTo(x0, Hh * 0.12); g.lineTo(x0, Hh * 0.92); g.stroke();
    g.fillStyle = '#26262a'; g.font = `600 ${13 * dpr}px "JetBrains Mono"`;
    g.fillText('x(t)', x0 + 8 * dpr, Hh * 0.16); g.fillText('t', x1 - 10 * dpr, y0 - 8 * dpr);
    g.fillText(`frame ${String(Math.round(s * 30)).padStart(4, '0')}   t = ${s.toFixed(2)} s`, x0 + 8 * dpr, Hh * 0.97);
    g.strokeStyle = '#d6336c'; g.lineWidth = 3 * dpr; g.lineJoin = 'round'; g.beginPath();
    const N = Math.max(2, Math.round(s / S * 400));
    for (let i = 0; i <= N; i++) { const ss = s * i / N, X = x0 + ss / S * (x1 - x0), Y = y0 - cartX(ss) / AMP * A; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.stroke();
    const X = x0 + s / S * (x1 - x0), Y = y0 - cartX(s) / AMP * A; g.fillStyle = '#d6336c'; g.beginPath(); g.arc(X, Y, 6 * dpr, 0, 7); g.fill();
    if (this.hoverS !== null && this.hoverS <= s) { const hx = x0 + this.hoverS / S * (x1 - x0), hy = y0 - cartX(this.hoverS) / AMP * A; g.strokeStyle = 'rgba(38,38,42,.5)'; g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(hx, Hh * 0.12); g.lineTo(hx, Hh * 0.9); g.stroke(); g.setLineDash([]); g.fillStyle = '#26262a'; g.beginPath(); g.arc(hx, hy, 5 * dpr, 0, 7); g.fill(); }
  },
  act(t) {
    const s = simT(t), dx = cartX(s);
    this.setCart(dx);
    this.graph(s);   // also while the chapter fades in, so the graph never pops in
    const hs = this.hoverS !== null && this.hoverS <= s && state.i === 4 && state.u === 0 ? this.hoverS : null;
    this.ghost.visible = hs !== null; if (hs !== null) this.ghost.position.x = this.b0 + cartX(hs);
    if (!H) return;
    // Hands on (0.04 to 0.12), push with the cart, let go and step back as it springs out (0.42 to 0.52), so
    // it never reaches him. One step phase for the whole chapter, so his legs never jump.
    const grip = sm(0.04, 0.12, t) * (1 - sm(0.42, 0.445, t)), F = FACE + dx * KK, away = sm(0.42, 0.52, t);
    H.pose.rest();
    const hx = t < 0.42 ? F + 1.75 : lerp(FACE + cartX(REL) * KK + 1.75, FACE + 3.4, away);   // the cart is fully pushed by 0.37
    place(hx, 0, -PI2, { lean: 0.2 * grip });
    H.stride((hx - FACE) * H.STEP * 1.4, 0.25 * sm(0.12, 0.16, t) * (1 - sm(0.42, 0.44, t)) + 0.42 * bump(0.42, 0.54, t));
    if (grip > 0) { H.hold(0, [F + 0.02, 2.6, -0.62], grip); H.hold(1, [F + 0.02, 2.6, 0.62], grip); }
    H.blendExpression('neutral', 'thinking', grip); H.blendExpression('thinking', 'smile', sm(0.55, 0.65, t));
    lookAt(t > 0.5 ? this.c.groups.body.getWorldPosition(new THREE.Vector3()) : null, t > 0.5 ? 0.8 : 0);
  },
  shot(t) { return { at: [CX + 2.5, 3.6, 0], dist: 30, az: -14 + 3 * pn.x, el: 9 - 2 * pn.y, sx: -0.08, sy: 0.14 }; },
};

// 5. Nothing renders until the checks pass: the same cart, closer. Hand 1 follows the pointer (or the scroll,
// until the pointer moves), and the hold checks of the clay kit run on every frame, with their messages.
const consoleEl = $('.console'), msgEl = $('.console .msg'), ringEl = $('.ring');
C[5] = {
  start: [FACE + 1.75, 0, -PI2], end: [FACE + 1.75, 0, -PI2], via: [[FACE + 2.2, 4.2], [FX + 6, 4.2]],
  build() { this.body = C[4].c.groups.body.userData.f; this.target = new THREE.Vector3(FACE + 1.1, 3.9, 0.62); this.ok = null; this.mine = false; this.ring = null; },
  act(t) {
    const F = FACE, live = state.i === 5 && state.u === 0;
    C[4].setCart(0);
    if (!live) this.mine = false; else if (ptr.mouse && now() - ptr.at < 200) this.mine = true;
    let want;
    if (this.mine) {
      const hit = rayAt().ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.62), new THREE.Vector3());
      if (hit) { const sh = new THREE.Vector3(F + 1.75, 4.5, 0.62), d = hit.clone().sub(sh); if (d.length() > 3.3) d.setLength(3.3); want = sh.add(d); want.x = Math.max(F - 0.05, want.x); want.y = Math.max(0.6, want.y); }
    }
    const on = sm(0.25, 0.55, t);
    want ??= new THREE.Vector3(lerp(F + 1.1, F + 0.02, on), lerp(3.9, 2.6, on), 0.62);
    this.target.x = damp(this.target.x, want.x, 12); this.target.y = damp(this.target.y, want.y, 12); this.target.z = 0.62;
    if (!H) return;
    H.pose.rest(); place(F + 1.75, 0, -PI2, { lean: 0.1 });
    const grip = sm(0, 0.06, t);   // his hands come onto the cart, not in one frame
    H.hold(0, [F + 0.02, 2.6, -0.62], grip); H.hold(1, this.target.toArray(), grip);
    const reach = (H.grips || []).filter((g) => g.i === 1).reduce((a, g) => Math.max(a, g.gap), 0);
    const l = C[4].c.root.worldToLocal(this.target.clone()), gap = Math.max(0, this.body(l.x, l.y, l.z) * KK - 0.25);
    let text, ok = false;
    if (reach > 0.3) text = `hand 1 misses what it holds, by ${reach.toFixed(1)}`;
    else if (gap > 0.8) text = 'hand 1 holds nothing';
    else if (gap > 0.04) text = `hand 1 does not touch the cart body that it holds (gap ${gap.toFixed(2)})`;
    else { text = 'no faults: both hands touch the cart'; ok = true; }
    if (msgEl.textContent !== text) { msgEl.textContent = text; msgEl.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' }); }   // a new message fades in
    if (ok !== this.ok) { this.ok = ok; consoleEl.classList.toggle('ok', ok); ringEl.classList.toggle('ok', ok); }
    const [sx, sy] = toScreen(this.target);
    this.ring ??= [sx, sy]; this.ring[0] = damp(this.ring[0], sx, 14); this.ring[1] = damp(this.ring[1], sy, 14);
    ringEl.style.transform = `translate(${this.ring[0]}px, ${this.ring[1]}px)`; ringEl.style.opacity = live ? sm(0.02, 0.12, t) : 0;
    H.blendExpression('neutral', ok ? 'smile' : 'worried', 0.8);
  },
  shot(t) { return { at: [FACE + 0.6, 3.6, 0], dist: 21, az: -22 + 3 * pn.x, el: 8 - 2 * pn.y, sx: 0.18, sy: 0.1 }; },
};

// 6. The result is a real MP4: a film strip rolls out of his hands, from the title card of the visitor's own
// topic to frames of six finished videos. A click brings a frame to the camera and plays it.
const CLIPS = ['bayes', 'ruler', 'knn', 'shadow', 'lever', 'servo'];
const FW = 7.2, FH = 4.05, GAP = 8.1;
C[6] = {
  start: [FX + 10.6, 1.4, -PI2 + 0.35], end: [FX + 10.6, 1.4, -0.3],
  build() {
    film = this;
    this.strip = new THREE.Group(); put(this.strip);
    const plateGeo = new THREE.BoxGeometry(GAP, FH + 1.1, 0.12), plateMat = new THREE.MeshPhysicalMaterial({ color: '#1c1d24', roughness: 0.5 });
    const holeGeo = new THREE.BoxGeometry(0.32, 0.22, 0.05), holeMat = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.7 });
    this.title = card(FW, FH, (g, w, h) => {
      g.fillStyle = '#e4d3b7'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#57534c'; g.font = `700 ${h * 0.065}px "Plus Jakarta Sans"`; g.fillText('CLAYDUCATION', w * 0.07, h * 0.18);
      g.fillStyle = '#26262a'; g.font = `800 ${h * 0.12}px "Plus Jakarta Sans"`;
      const tt = topic.charAt(0).toUpperCase() + topic.slice(1), lines = [''];
      for (const wd of tt.split(' ')) { const l = lines.at(-1) + (lines.at(-1) ? ' ' : '') + wd; if (g.measureText(l).width > w * 0.84 && lines.at(-1)) lines.push(wd); else lines[lines.length - 1] = l; }
      lines.slice(0, 3).forEach((l, i) => g.fillText(l, w * 0.07, h * (0.34 + i * 0.14)));
      g.fillStyle = '#d6336c'; g.fillRect(w * 0.07, h * 0.82, w * 0.22, h * 0.025);
    });
    const loader = new THREE.TextureLoader();
    const pics = [this.title, ...CLIPS.map((c) => {
      const tex = loader.load(`film/${c}.jpg`); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.poster = tex; m.clip = c; return m;
    })];
    this.cells = pics.map((pic, i) => {
      const cell = new THREE.Group(), holes = new THREE.InstancedMesh(holeGeo, holeMat, 24), m4 = new THREE.Matrix4();
      for (let k = 0; k < 12; k++) for (const [y, nn] of [[-(FH / 2 + 0.33), 0], [FH / 2 + 0.33, 1]]) holes.setMatrixAt(k * 2 + nn, m4.makeTranslation(-GAP / 2 + 0.35 + k * 0.68, y, 0));
      pic.position.z = 0.07; cell.add(new THREE.Mesh(plateGeo, plateMat), holes, pic); cell.i = i; pic.lift = 0;
      this.strip.add(cell); return cell;
    });
    this.pics = pics;
    this.strip.position.set(0, 4.6, 0);
    shadow(16, 3, FX, 0, 0.3);
  },
  act(t) {
    const roll = (still ? 0.5 : sm(0.04, 0.92, t)) * GAP * (CLIPS.length + 0.4), out = FX + 8.8;
    this.cells.forEach((c) => {
      const x = out - GAP * 0.6 - roll + c.i * GAP, k = sm(out + 0.4, out - GAP * 0.7, x);
      c.position.set(x, 0, 0); c.scale.set(Math.max(0.01, k), Math.max(0.01, k), 1); c.visible = k > 0.01; c.rotation.y = (1 - k) * -0.8;
    });
    this.pics.forEach((p) => { if (focus.obj === p) return; p.lift = damp(p.lift, !focus.obj && hovered === p ? 1 : 0, 10); p.position.z = 0.07 + 0.5 * p.lift; p.scale.setScalar(1 + 0.06 * p.lift); });
    if (!H) return;
    H.pose.rest(); place(FX + 10.6, 1.4, lerp(-PI2 + 0.35, -0.3, sm(0.92, 1, t)));
    const g = 1 - sm(0.9, 0.97, t);
    H.hold(0, [out + 0.4, 3.0, 0.3], g); H.hold(1, [out + 0.4, 5.6, 0.3], g);
    H.blendExpression('neutral', 'smile', 0.7);
    lookAt(null, sm(0.92, 1, t) * 0.8);
  },
  shot(t) { return { at: [FX + 3.5, 4.6, 0.5], dist: 30, az: -4 + 4 * pn.x, el: 4 - 2 * pn.y, sx: 0.0, sy: 0.14 }; },
};

// 7. Install it with one command: he points at the command; a copy makes him wave.
C[7] = {
  start: [S7[0], S7[1], 0.9], end: [S7[0], S7[1], 0.9],
  build() {},
  act(t) {
    if (!H) return;
    H.pose.rest(); place(S7[0], S7[1], 0.9);
    const h = happy();
    if (h > 0) { H.blendPose('rest', 'wave', h); H.arms[1].elbow.rotation.z += Math.sin(now() / 120) * 0.3 * h; }
    else H.blendPose('rest', 'point', sm(0.1, 0.35, t));
    H.blendExpression('neutral', 'smile', Math.max(h, sm(0.1, 0.35, t) * 0.7));
    lookAt(null, h ? 0 : 0.5);
  },
  shot(t) { return { at: [S7[0] + 0.6, 4.4, 0], dist: 28, az: -6 + 3 * pn.x, el: 6 - 2 * pn.y, sx: -0.18, sy: 0.17 }; },
};
$('.copy').addEventListener('click', (e) => {
  navigator.clipboard?.writeText('npx clayducation').catch(() => {});
  e.currentTarget.textContent = 'Copied'; happyAt = now();
  setTimeout(() => { e.currentTarget.textContent = 'Copy'; }, 1800);
});

// ---------- transitions ----------
function route(j) {
  const a = C[j].end, b = C[j + 1].start, pts = [a, ...(C[j].via || []), b];
  const seg = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
  return { pts, seg, total: seg.reduce((x, y) => x + y, 0) };
}
// A walk: a steady pace along the route, round the sets; the legs move with the distance walked.
let walkFace = null;
function walkBetween(s) {
  if (!H) return;
  const { pts, seg, total } = route(s.i), a = pts[0], b = pts.at(-1);
  const P = C[s.i].flows ? flow : pace;
  let d = P(s.u) * total, k = 0;
  while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++; }
  const f = seg[k] ? d / seg[k] : 0, p0 = pts[k], p1 = pts[k + 1], x = lerp(p0[0], p1[0], f), z = lerp(p0[1], p1[1], f);
  // He turns towards the way he walks, and round at the corners, not in one step.
  const dir = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), want = s.u > 0.93 && !C[s.i].flows ? b[2] : dir;
  if (walkFace === null || s.u < 0.02) walkFace = a[2];
  let dd = want - walkFace; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); walkFace += dd * (1 - Math.exp(-8 * dt));
  H.pose.rest(); place(x, z, walkFace);
  H.stride(P(s.u) * total * H.STEP, 0.5 * sm(0, 0.06, s.u) * (C[s.i].flows ? 1 : 1 - sm(0.94, 1, s.u)));
  H.blendExpression('neutral', 'smile', 0.5);
}
function shotAt(s) {
  const a = C[s.i].shot(s.t);
  if (!s.u) return a;
  const b = C[s.i + 1].shot(0);
  if (s.kind === 'pen') return s.u < 0.5 ? a : b;   // the cut is behind the full blue
  const u = pace(s.u), lift = still ? 0 : Math.sin(Math.PI * s.u), mid = (k) => lerp(a[k], b[k], u);
  return { at: a.at.map((v, i) => lerp(v, b.at[i], u)), dist: mid('dist') * (1 + 0.35 * lift), az: mid('az') - 18 * lift, el: mid('el') + 16 * lift, sx: mid('sx'), sy: mid('sy') };
}
// From the book to the files: the pen flies into the camera, the whole screen goes the pen's blue, the cut
// happens behind the blue, and the blue fades out on the blue files chapter while the pen flies to the page.
function penFlight(s) {
  // A point in front of the camera, in the middle of the screen, and a slanted pose there: the blue barrel
  // shows, not the dark end, and the pen never passes behind the camera.
  ray.setFromCamera(new THREE.Vector2(0, 0), cam);
  const hover = cam.position.clone().addScaledVector(ray.ray.direction, 2.6);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const slant = new THREE.Quaternion().setFromUnitVectors(PEN_AXIS, right.clone().multiplyScalar(0.8).addScaledVector(up, 0.35).addScaledVector(ray.ray.direction, -0.45).normalize());
  const u = s.u;
  if (u < 0.5) {
    const a = C[1].penAt(1), f = inOut(sm(0, 0.46, u));
    pen.position.lerpVectors(a.p, hover, f); pen.position.y += Math.sin(f * Math.PI) * 0.8;
    pen.quaternion.slerpQuaternions(a.q, slant, inOut(sm(0, 0.35, u))); pen.scale.copy(a.s).multiplyScalar(lerp(1, 1.8, f));
  } else {
    const b = C[2].penAt(0), f = inOut(sm(0.56, 1, u));
    pen.position.lerpVectors(hover, b.p, f); pen.position.y += Math.sin(f * Math.PI) * 0.8;
    pen.quaternion.slerpQuaternions(slant, b.q, f); pen.scale.copy(b.s).multiplyScalar(lerp(1.8 * 1.25 / b.s.x, 1, f));
  }
}

// ---------- the colour of each chapter: a soft bloom of the next colour grows out of the mascot ----------
const bgEl = $('#bg'), wipeEl = $('#wipe'), coverEl = $('#cover');
function circle(colour, cx, cy, r, soft = 1.2) {
  const m = `radial-gradient(circle ${Math.max(0, r).toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${Math.max(0, r - soft).toFixed(1)}px, transparent ${(r + 0.5).toFixed(1)}px)`;
  wipeEl.style.display = 'block'; wipeEl.style.background = colour; wipeEl.style.webkitMaskImage = m; wipeEl.style.maskImage = m;
}
const farFrom = (cx, cy) => Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) * 1.02;
function colours(s) {
  wipeEl.style.display = 'none'; coverEl.style.opacity = 0;
  if (!(s.u > 0) || !chs[s.i + 1]) { bgEl.style.background = chs[s.i].dataset.bg; return; }
  if (s.kind === 'pen') {
    // The whole screen goes blue as the pen comes close, and clears on the blue chapter after the cut.
    bgEl.style.background = chs[s.u < 0.5 ? s.i : s.i + 1].dataset.bg;
    coverEl.style.opacity = s.u < 0.5 ? sm(0.24, 0.48, s.u) : 1 - sm(0.52, 0.74, s.u);
    return;
  }
  bgEl.style.background = chs[s.i].dataset.bg;
  let cx = innerWidth / 2, cy = innerHeight / 2;
  if (H && cam) { [cx, cy] = toScreen(H.root.getWorldPosition(new THREE.Vector3())); cx = clamp(cx, 0, innerWidth); cy = clamp(cy, 0, innerHeight); }
  // A soft bloom: its edge fades over 45 % of its radius, so the colour flows in.
  const R0 = farFrom(cx, cy) / 0.55, r = R0 * (still ? (s.u > 0.5 ? 1 : 0) : Math.sqrt(sm(0.08, 0.92, s.u)));   // an even rate of area
  circle(chs[s.i + 1].dataset.bg, cx, cy, r, r * 0.45);
}

// ---------- the morph: a set that the camera leaves sinks into the floor like soft clay, and the next one grows
// out of it. Each set shrinks and grows about its own middle on the floor; nothing appears or goes in one frame.
const MIDDLE = () => [[0, 0.6], S1, [S2[0] - 10.7, -0.8], [(WX0 + WX1) / 2, WZ], [CX, 0], [CX, 0], [FX, 0], S7];
const setOf = (j) => (j === 5 ? 4 : j);
function morph(g, k, [cx, cz]) {
  if (!g) return;
  g.visible = k > 0.002; g.scale.setScalar(Math.max(k, 0.002)); g.position.set(cx * (1 - k), 0, cz * (1 - k));
}
function morphs(s) {
  const mid = MIDDLE(), k = {};
  if (!(s.u > 0)) k[setOf(s.i)] = 1;
  else if (s.kind === 'pen') k[s.u < 0.5 ? s.i : s.i + 1] = 1;
  else {
    const a = setOf(s.i), b = setOf(s.i + 1);
    if (a === b) k[a] = 1;
    else { k[a] = still ? (s.u < 0.5 ? 1 : 0) : 1 - inOut(sm(0.04, 0.5, s.u)); k[b] = still ? (s.u < 0.5 ? 0 : 1) : back(sm(0.48, 0.96, s.u)); }
  }
  for (let j = 0; j < C.length; j++) morph(C[j].g, k[j] || 0, mid[j]);
  // The pen lies on the book, so it grows with the table.
  if (pen && s.i === 0 && s.u > 0) { const kk = k[1] || 0, [cx, cz] = mid[1]; pen.position.set(cx + (pen.position.x - cx) * kk, pen.position.y * kk, cz + (pen.position.z - cz) * kk); pen.scale.multiplyScalar(Math.max(kk, 0.002)); pen.visible = kk > 0.002; }
}

// ---------- the camera ----------
function aim(v) {
  const W = innerWidth, Hh = innerHeight, aspect = W / Hh, narrow = aspect < 1;
  const dist = v.dist * (narrow ? 1.25 / Math.max(aspect, 0.45) : 1), sx = narrow ? 0 : v.sx, sy = narrow ? 0.14 : v.sy;
  const A = v.az * D, E = v.el * D, T = new THREE.Vector3(...v.at);
  cam.aspect = aspect; cam.fov = 30;
  cam.position.set(T.x + dist * Math.sin(A) * Math.cos(E), T.y + dist * Math.sin(E), T.z + dist * Math.cos(A) * Math.cos(E));
  cam.lookAt(T);
  cam.setViewOffset(W, Hh, -sx * W, -sy * Hh, W, Hh);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
}

// ---------- hover and click: pages (chapter 2) and film frames (chapter 6) ----------
let hovered = null;
function pickables() { return state.u === 0 && state.i === 2 && C[2].ready ? C[2].pages : state.u === 0 && state.i === 6 && C[6].ready ? C[6].pics : []; }
function hover() {
  hovered = null;
  if (!ptr.mouse || focus.obj) { document.body.style.cursor = focus.obj ? 'zoom-out' : ''; return; }
  const list = pickables(); if (!list.length) { document.body.style.cursor = ''; return; }
  const h = rayAt().intersectObjects(list)[0]; hovered = h ? h.object : null;
  document.body.style.cursor = hovered ? 'zoom-in' : '';
}
addEventListener('click', (e) => {
  if (!built || e.target.closest('a, button, [contenteditable], .graph')) return;
  if (focus.obj) { closeFocus(); return; }
  const list = pickables(), h = list.length ? rayAt(e.clientX, e.clientY).intersectObjects(list)[0] : null;
  if (h) {
    const o = h.object;
    openFocus(o, () => {
      if (!o.clip) return null;
      o.video ??= Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, src: `film/${o.clip}.mp4` });
      o.vtex ??= Object.assign(new THREE.VideoTexture(o.video), { colorSpace: THREE.SRGBColorSpace });
      o.material.map = o.vtex; o.material.needsUpdate = true; o.video.currentTime = 0; o.video.play().catch(() => {});
      return () => { o.video.pause(); o.material.map = o.poster; o.material.needsUpdate = true; };
    });
    return;
  }
  if (H && rayAt(e.clientX, e.clientY).intersectObject(H.root, true).length) happyAt = now();
});

// ---------- the frame loop ----------
let state = { i: 0, t: 0, u: 0, kind: 'act' }, built = false;
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const tNow = now(); dt = Math.min(0.1, (tNow - lastT) / 1000); lastT = tNow;
  glide();
  pn.x = damp(pn.x, ptr.x / innerWidth * 2 - 1, 3); pn.y = damp(pn.y, ptr.y / innerHeight * 2 - 1, 3);
  pn.sx = damp(pn.sx, ptr.x / innerWidth * 2 - 1, 9); pn.sy = damp(pn.sy, 1 - ptr.y / innerHeight * 2, 9);
  state = where(scrollY);
  words(state);
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === (state.u > 0.5 ? state.i + 1 : state.i)));
  if (state.i !== 1 || state.u > 0) document.querySelectorAll('.fly').forEach((f) => { f.style.display = 'none'; });
  if (!built) { colours(state); return; }
  // The camera first: the sets use it to find the pointer and to place things on the screen.
  aim(shotAt(state));
  hover();
  if (H) H.root.visible = true;
  if (pen) pen.visible = state.i === 1 || state.i === 2 || (state.i === 0 && state.u > 0);
  for (let j = 0; j < C.length; j++) {
    if (!C[j].ready || !(j === state.i || (state.u > 0 && j === state.i + 1))) continue;
    const keep = H; if (!(state.u === 0 && j === state.i)) H = null;
    C[j].act(j === state.i ? state.t : 0);
    H = keep;
  }
  if (state.u > 0 && C[state.i + 1]?.ready) {
    if (state.kind === 'pen') {
      penFlight(state);
      // Behind the blue, he is already at the next set.
      if (H) { if (state.u < 0.5) C[1].act(1); else C[2].act(0); }
    } else walkBetween(state);
  } else walkFace = null;
  morphs(state);
  settle();
  aim(shotAt(state));
  stepFocus();
  colours(state);
  R.render(scene, cam);
}

async function boot() {
  plan();
  addEventListener('resize', () => { plan(); R?.setSize(innerWidth, innerHeight, false); });
  requestAnimationFrame(frame);
  try {
    if (!canvas.getContext('webgl2') || typeof DecompressionStream === 'undefined') throw new Error('no WebGL 2');
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    R.setClearColor(0, 0); R.setPixelRatio(Math.min(devicePixelRatio, 1.5)); R.setSize(innerWidth, innerHeight, false);
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NoToneMapping;
    scene = new THREE.Scene(); studio(THREE, R, scene);
    cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 800);
    document.body.prepend(canvas);
    dim = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#14161f', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    dim.renderOrder = 19; dim.visible = false; scene.add(dim);
    addEventListener('pointerdown', (e) => { if (!e.target.closest('a, button, [contenteditable], .graph')) ptr.pressed = true; });
    addEventListener('pointerup', () => { ptr.pressed = false; });
    await document.fonts?.ready;
    const group = (j) => { C[j].g = new THREE.Group(); scene.add(C[j].g); put = (...o) => C[j].g.add(...o); };
    group(0); C[0].build(); C[0].ready = true; built = true;
    [index, VOICE] = await Promise.all([fetch(new URL('index.json', ROOT)).then((r) => r.json()),
      Promise.all([fetch('voice/wave.json').then((r) => r.json()), fetch('voice/words.json').then((r) => r.json())]).then(([wave, words]) => ({ wave, words }))]);
    await load('mascot');
    put = (...o) => scene.add(...o);
    const m = createMascot(THREE, {}); m.root.position.set(0, 6.82, 0.6); scene.add(m.root);
    m.shadow = shadow(3.8, 2.4, 0, 0.6, 0.45); H = m; heroReady = true;
    realSetExpression = m.setExpression; m.blendExpression = blendFace;
    for (const name of ['table', 'book', 'cart']) await load(name);
    for (let j = 1; j < C.length; j++) { group(j); C[j].build(); C[j].ready = true; }
    plan();
    R.compile(scene, cam);
    document.documentElement.classList.add('ready');
  } catch (e) {
    console.error(e);
    document.documentElement.classList.add('no3d');
  }
}
boot();
