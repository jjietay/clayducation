// Clayducation: one clay world, played by the scroll. DESIGN.md says what each chapter shows and why.
//
// The scroll is a timeline of chapters and transitions. In a chapter, the scroll plays its set (t from 0 to 1)
// and its statement stays in place on the screen. In a transition (u from 0 to 1), the statement fades out,
// the camera flies to the next set and the mascot walks there at a steady pace (the scroll length of a walk
// matches its distance), or, from the book to the files, the pen flies into the camera and out again.
// The mascot is the one thing that stays: he is sculpted out of the clay and goes through the whole pipeline.

import * as THREE from 'three';
import { createMascot, studio, CACHE, EXPRESSIONS } from './world/clay/mascot.js';
import { buildModel, MODELS } from './world/clay/models.js';

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
// Cont: at a steady pace from the start (he is already walking), slowing over the last 15 %.
const cont = (u) => 1 - flow(1 - u);
const pace = (u) => { const a = 0.15, v = 1 / (1 - a); return u < a ? v * u * u / (2 * a) : u > 1 - a ? 1 - v * (1 - u) ** 2 / (2 * a) : v * (u - a / 2); };
const D = Math.PI / 180, PI2 = Math.PI / 2;
const $ = (s, el = document) => el.querySelector(s);
// ?check: the page's own checks step each frame with a fixed dt (window.__clayFrame), on a clock of their own.
const TESTING = new URLSearchParams(location.search).has('check');
let clockMs = 0;
const now = () => (TESTING ? clockMs : performance.now());
let dt = 1 / 60, lastT = now();
const damp = (a, b, rate) => a + (b - a) * (1 - Math.exp(-rate * dt));

// ---------- the world layout: where each set stands ----------
const S1 = [10, 0], S2 = [34, 2.4], WX0 = 50, WX1 = 72, WZ = 1.2, Z3 = WZ - 2.8, CX = 82, KK = 2.4, FX = CX + 56, S7 = [FX + 24, 0];
const FACE = CX + (0.3 + 0.82) * KK + 0.04;   // the +x face of the cart body at rest

// ---------- the timeline ----------
const chs = [...document.querySelectorAll('.ch')];
const ACT = [3.2, 3.6, 3.6, 3.0, 3.4, 2.4, 2.6, 4.6, 2.8];   // scroll of each chapter, in screen heights
const WALK = 9;                                          // world units walked for each screen height of scroll
let segs = [], total = 0;
const C = [];                                            // the chapters' sets, below
function plan() {
  segs = []; let y = 0;
  for (let j = 0; j < chs.length; j++) {
    segs.push({ j, kind: 'act', y, len: ACT[j] }); y += ACT[j];
    if (j === chs.length - 1) break;
    const kind = C[j].next || 'walk', len = kind === 'pen' ? 2.6 : kind === 'rug' ? 2.2 : kind === 'dream' ? 2.6 : kind === 'in5' ? Math.max(1.3, route(j).total / WALK) / 0.85 : C[j].cont ? route(j).total / (1 - 0.075) / C[j].speed : Math.max(1.3, route(j).total / WALK);   // cont: the walk starts at the chapter's own pace
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
window.__clayProbe = (fn) => fn({ THREE, cam, H, C, toScreen, state });
window.__clayAt = (j, f, tr) => { const s = segs.find((x) => x.j === j && (tr ? x.kind !== 'act' : x.kind === 'act')); return (s.y + f * s.len) * innerHeight; };
const yOf = (j, t = 0) => { const s = segs.find((x) => x.kind === 'act' && x.j === j); return (s.y + t * s.len) * innerHeight; };

// ---------- smooth wheel scroll: the page eases to where the wheel sends it ----------
const focus = { obj: null, k: 0, want: 0 };
const scrollMax = () => document.documentElement.scrollHeight - innerHeight;
let goal = scrollY, cur = scrollY, gliding = false;
addEventListener('wheel', (e) => {
  if (stylesOpen()) { if (!e.target.closest('.folder .sheet')) e.preventDefault(); return; }   // the panel scrolls; the page does not
  if (focus.obj) { e.preventDefault(); return; }
  if (still || e.ctrlKey) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  if (!gliding) cur = goal = scrollY;
  goal = clamp(goal + d, 0, scrollMax()); gliding = true;
}, { passive: false });
addEventListener('keydown', (e) => {
  if (stylesOpen()) { if (e.key === 'Escape') closeStyles(); return; }
  if (focus.obj && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) e.preventDefault();
  if (e.key === 'Escape') closeFocus();
});
function glide() {
  if (!gliding) { cur = goal = scrollY; return; }
  cur = damp(cur, goal, 6);
  if (Math.abs(cur - goal) < 0.5) { cur = goal; gliding = false; }
  scrollTo(0, cur);
}
// More styles (chapter 8): a folder at the bottom of the screen. A click on it slides it up to a quarter of the
// screen; a click on its tab, a click on the dark page above it, or Escape slides it back down.
const folderEl = $('.folder'), tabEl = $('.tab', folderEl), sheetEl = $('.sheet', folderEl);
const stylesOpen = () => folderEl.classList.contains('open');
function openStyles() { folderEl.classList.add('open'); document.documentElement.classList.add('folder-open'); tabEl.setAttribute('aria-expanded', 'true'); sheetEl.scrollTop = 0; sheetEl.setAttribute('tabindex', '-1'); sheetEl.focus({ preventScroll: true }); }
function closeStyles() { folderEl.classList.remove('open'); document.documentElement.classList.remove('folder-open'); tabEl.setAttribute('aria-expanded', 'false'); sheetEl.scrollTop = 0; tabEl.focus({ preventScroll: true }); }
folderEl.addEventListener('click', (e) => { if (!stylesOpen()) openStyles(); else if (e.target.closest('.tab')) closeStyles(); });
addEventListener('click', (e) => { if (stylesOpen() && !e.target.closest('.folder')) closeStyles(); });
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
    const shown = vis;   // with a page or a frame open, the statement stays, behind it
    c.style.opacity = shown; c.style.visibility = shown > 0.002 ? 'visible' : 'hidden';
    c.querySelectorAll('.say .w').forEach((w, k) => w.style.setProperty('--in', still ? 1 : sm(-0.15 + k * 0.03, 0.08 + k * 0.03, q)));
    const b = $('.say b', c); if (b) b.style.setProperty('--k', still ? 1 : sm(0.06, 0.18, q));
  });
}
// The name at the top goes back to the first chapter (the chapters are fixed layers, so the #c0 link alone does not).
$('.mark').addEventListener('click', (e) => { e.preventDefault(); jump(0); });
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

// The point on the plane z = zz under the screen point (x, y): for things placed by where they are on the screen.
function worldAt(x, y, zz = 0) { const r = rayAt(x, y).ray; return r.origin.clone().addScaledVector(r.direction, (zz - r.origin.z) / r.direction.z); }
// A roll of film: dark film round a tall core, with a row of sprocket holes at the top and the bottom.
let rollSide = null;
function filmRoll() {
  rollSide ??= (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
    g.fillStyle = '#1c1d24'; g.fillRect(0, 0, 1024, 1024); g.fillStyle = '#e9e4da';
    const hh = 1024 * 0.22 / (FH + 1.3), n = 20;
    for (const v of [0.06, 0.94]) for (let k = 0; k < n; k++) { g.beginPath(); g.roundRect((k + 0.27) * 1024 / n, (1 - v) * 1024 - hh / 2, 1024 / n * 0.46, hh, 3); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; R.initTexture(t); return t;   // on the GPU now
  })();
  const side = new THREE.MeshPhysicalMaterial({ map: rollSide, roughness: 0.5 }), end = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.7 });
  return new THREE.Mesh(new THREE.CylinderGeometry(1, 1, FH + 1.3, 56), [side, end, end]);
}
// A red balloon: its knot is at the root. Its string hangs to a point (hang, in its own units) or is tied to a
// point in the world (tie).
function balloon() {
  const root = new THREE.Group(), mat = new THREE.MeshPhysicalMaterial({ color: '#e0343c', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 40, 28), mat); body.scale.set(1, 1.18, 1); body.position.y = 1.08;
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 16), mat); knot.rotation.x = Math.PI; knot.position.y = 0.1;
  const string = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#efe6d8', roughness: 0.8 }));
  root.add(body, knot, string);
  const b = { root, body, string, last: '' };
  b.hang = (end) => {
    const key = end.toArray().map((v) => v.toFixed(3)).join();
    if (key === b.last) return; b.last = key;
    const mid = end.clone().multiplyScalar(0.5); mid.x -= 0.25 * end.y * 0.2; mid.y -= 0.15;
    string.geometry.dispose(); string.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(), mid, end), 24, 0.03, 6);
  };
  b.tie = (p) => { root.updateMatrixWorld(true); b.hang(root.worldToLocal(p.clone())); };
  return b;
}

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
  want.gest?.(H);   // a nod or a blink, on top of the expression
  // The head: towards the point or the pointer, through a damped spring.
  const L = want.look || { point: null, k: 0 }, head = H.headPivot, at = head.getWorldPosition(new THREE.Vector3());
  let target = L.point;
  if (!target) { ray.setFromCamera(new THREE.Vector2(pn.sx, pn.sy), cam); target = cam.position.clone().addScaledVector(ray.ray.direction, cam.position.distanceTo(at)); }
  const d = head.parent.worldToLocal(target.clone()).sub(head.position);
  gaze.yaw = damp(gaze.yaw, clamp(Math.atan2(d.x, d.z), -0.7, 0.7), 5); gaze.pitch = damp(gaze.pitch, clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.4, 0.4), 5);
  gaze.k = damp(gaze.k, L.k, 3);
  head.rotation.y += gaze.yaw * gaze.k; head.rotation.x -= gaze.pitch * gaze.k;
  const b = (now() / 1000) % 4.1; if (b < 0.16) H.blink(Math.sin(b / 0.16 * Math.PI));
  // Arms, legs and the body's turn: each eases from its last angle to the new one. These are the poses only:
  // a hand that holds something is put on it below, after the body has eased.
  const parts = [...H.arms.flatMap((a) => [a.shoulder, a.elbow, a.wrist]), ...H.legs.flatMap((l) => [l.hip, l.knee, l.ankle]), H.root];
  const k = 1 - Math.exp(-14 * dt);
  for (const o of parts) { const q = o.quaternion.clone(), was = ease.q.get(o); if (was) o.quaternion.copy(was).slerp(q, o === H.root ? 1 - Math.exp(-9 * dt) : k); ease.q.set(o, o.quaternion.clone()); }
  // His body's place too (a lean moves it): eased, except a real jump of the scene, which it follows at once.
  const p = H.root.position.clone();
  if (ease.p && ease.p.distanceTo(p) < 2) H.root.position.copy(ease.p.lerp(p, 1 - Math.exp(-16 * dt)));
  ease.p = H.root.position.clone();
  // The hands: each one reaches from the eased body to what it holds, so it stays on the book or the cart
  // while the body moves. How firmly it holds eases; a hold point that jumps (another thing to hold) glides.
  H.root.updateMatrixWorld(true);
  hands.forEach((h, i) => {
    const w = want.hands[i];
    h.k = damp(h.k, w ? w.k : 0, 14);
    if (w) {
      if (!h.p || h.k < 0.01) { h.p = w.p.clone(); h.glide = false; }
      else if (h.last && h.last.distanceTo(w.p) > 0.5) h.glide = true;
      if (h.glide) { h.p.lerp(w.p, 1 - Math.exp(-10 * dt)); if (h.p.distanceTo(w.p) < 0.02) h.glide = false; } else h.p.copy(w.p);
      h.last = w.p.clone();
    }
    h.face = w ? w.face : h.face; h.hint = w ? w.hint : h.hint;
    if (h.k > 0.002 && h.p) palmReach(i, h);
  });
  want.face = null; want.look = null; want.hands = [null, null]; want.gest = null;
}
// A hand on its point. With a palm direction (face), the palm (the hand's +z, where the thumb is) turns that
// way and the fingers go on from the forearm, so the hand lies on the thing it holds; the wrist moves so that
// the middle of the palm is still on the point.
// The kit's reach (two bones: upper arm 1.32, forearm and hand 1.33), with a chosen way for the elbow to point
// (hint, in the body's own frame: +z is his front). The kit's own way puts the elbow out to the side; on the cart
// the arm moves front to back, so there the elbow points down and back, as a real arm does.
const ARM_UP = 1.32, ARM_LOW = 1.33, DOWN = new THREE.Vector3(0, -1, 0);
function ikReach(i, point, k, hint) {
  if (!hint) { realReach(i, point, k); return; }
  const a = H.arms[i]; H.root.updateMatrixWorld(true);
  const T = a.shoulder.parent.worldToLocal(new THREE.Vector3(...point)).sub(a.shoulder.position), n = T.clone().normalize(), L = Math.min(T.length(), ARM_UP + ARM_LOW - 0.002);
  T.copy(n).multiplyScalar(L);
  const cosA = clamp((ARM_UP * ARM_UP + L * L - ARM_LOW * ARM_LOW) / (2 * ARM_UP * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const hv = new THREE.Vector3(hint[0] * a.sx, hint[1], hint[2]), perp = hv.sub(n.clone().multiplyScalar(hv.dot(n))).normalize();
  const e = n.clone().multiplyScalar(cosA).add(perp.multiplyScalar(sinA));
  const qS = new THREE.Quaternion().setFromUnitVectors(DOWN, e), low = T.clone().sub(e.clone().multiplyScalar(ARM_UP)).normalize().applyQuaternion(qS.clone().invert());
  a.shoulder.quaternion.slerp(qS, k); a.elbow.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(DOWN, low), k); a.wrist.quaternion.slerp(new THREE.Quaternion(), k);
}
const ELBOW_BACK = [0.1, -0.6, -1];   // down and back, a little out
function palmReach(i, h) {
  if (!h.face) { ikReach(i, h.p.toArray(), h.k, h.hint); return; }
  const a = H.arms[i], sh = a.shoulder.getWorldPosition(new THREE.Vector3());
  const z = h.face.clone().normalize(), fd = h.p.clone().sub(sh).normalize();
  let y = fd.clone().addScaledVector(z, -fd.dot(z)).multiplyScalar(-1); if (y.lengthSq() < 1e-6) y.set(0, 1, 0); y.normalize();   // the fingers (-y) go on from the forearm
  const x = y.clone().cross(z).normalize(), wristAt = h.p.clone().addScaledVector(y, 0.3);
  ikReach(i, wristAt.addScaledVector(fd, 0.3).toArray(), h.k, h.hint);
  a.wrist.parent.updateMatrixWorld(true);
  const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  a.wrist.quaternion.slerp(a.wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want), h.k);
}
// What each hand holds (from H.hold and H.reach in the chapters); settle() puts the hands there.
const hands = [{ k: 0 }, { k: 0 }];
want.hands = [null, null];
let realReach = null;
function wrapHands(m) {
  realReach = m.reach;
  const reachOf = (i, point, k, face, hint) => { want.hands[i] = { p: new THREE.Vector3(...point), k: clamp(k), face: face ? new THREE.Vector3(...face) : null, hint }; };
  m.reach = (i, point, k = 1) => { if (k > 0) reachOf(i, point, k); };
  // As the kit's hold(): a hand that cannot get to what it holds is a fault for "make look" (H.grips).
  m.hold = (i, point, k = 1, face = null, hint = null) => {
    if (k > 0.5) {
      m.root.updateMatrixWorld(true);
      const a = m.arms[i], gap = a.shoulder.parent.worldToLocal(new THREE.Vector3(...point)).sub(a.shoulder.position).length() - 2.65;
      if (gap > 0) (m.grips ??= []).push({ i, gap });
      (m.holds ??= []).push({ i, point, k });
    }
    if (k > 0) reachOf(i, point, k, face, hint);
  };
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
// A press dents it; with the button down the dent stays. Then the lump morphs into a clay statue of him,
// which bursts into many pieces as he jumps out of it in a star.
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
// The lump morphs into a clay statue of him (0.4 to 0.62): each point of the lump goes to his outside skin, a
// little outside it (measured once from his own shapes when he is made). Fine cracks open all over it at once
// (0.625 to 0.655). Then it bursts (0.655): about 180 pieces fly off together, each at its own random speed,
// direction and spin; they land, squash, and shrink away into the floor. He jumps out of it in a star (arms and
// legs out, 0.675 to 0.81), lands with a small squash, and waves.
const SKIN = 0.045;   // how far outside his skin the statue is
const BURST = 0.655, GRAV = 22, REST = 0.1, TS = 0.1;   // the burst; gravity; a landed piece's middle above the floor; scroll per time unit
const JUMP = [0.675, 0.81], HIGH = 2.0;                 // his jump, and how high his feet go
C[0] = {
  start: [0, 0.6, 0], end: [0, 0.6, 0.35], via: [[3.5, -4.4], [S1[0] - 1, -4.4]],
  build() {
    // The lump: a UV sphere in one piece. When he is made, sculpt() cuts it into the pieces of the burst.
    this.src = new THREE.SphereGeometry(2, 180, 130);
    const sp = this.src.attributes.position.array, sid = new Int32Array(sp.length / 3), pk = new Map();
    for (let i = 0; i < sid.length; i++) { const k = `${sp[i * 3].toFixed(4)},${sp[i * 3 + 1].toFixed(4)},${sp[i * 3 + 2].toFixed(4)}`; if (!pk.has(k)) pk.set(k, pk.size); sid[i] = pk.get(k); }
    this.sid = sid; this.ns = pk.size;   // points of the sphere at the same place (its seam and poles) are one point
    this.mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.86, sheen: 0.22, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffd9bf'), specularIntensity: 0.12,
      normalMap: clayNormals(), normalScale: new THREE.Vector2(0.95, 0.95), side: THREE.DoubleSide });
    this.lump = new THREE.Mesh(this.split(new Int32Array(this.src.index.count / 3)), this.mat); this.lump.position.set(0, 0, 0.6); put(this.lump);
    this.lump.frustumCulled = false;   // its shape changes every frame
    this.inMat = new THREE.MeshPhysicalMaterial({ color: '#9c5c3e', roughness: 0.93, sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color('#f0b894'), specularIntensity: 0.08, side: THREE.DoubleSide });
    this.crumbs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshPhysicalMaterial({ color: '#b47758', roughness: 0.9, sheen: 0.2, sheenColor: new THREE.Color('#ffd9bf') }), 320);
    this.crumbs.position.copy(this.lump.position); this.crumbs.frustumCulled = false; this.crumbs.visible = false; put(this.crumbs);
    this.statue = null;   // set by sculpt(), when he is made
    this.sh = shadow(5.5, 4.5, 0, 0.6, 0.55);
  },
  // The lump's geometry, with tk[t] the piece of each triangle of the sphere: each piece has its own copy of the
  // points on its edge, so a piece leaves no stretched triangles behind when it flies. Also the lump's shape
  // (uneven, with palm-flattened faces and thumb marks) and colour at each point.
  split(tk) {
    const sp = this.src.attributes.position.array, idx = this.src.index.array, map = new Map(), from = [], piece = [], tri = [];
    for (let t = 0; t < idx.length; t += 3) {
      const k = tk[t / 3];
      for (const i of [idx[t], idx[t + 1], idx[t + 2]]) { const key = i * 4096 + k; let j = map.get(key); if (j === undefined) { j = from.length; map.set(key, j); from.push(i); piece.push(k); } tri.push(j); }
    }
    const n = from.length, dirs = new Float32Array(n * 3), canon = new Int32Array(n), v = new THREE.Vector3();
    for (let j = 0; j < n; j++) { dirs.set([sp[from[j] * 3], sp[from[j] * 3 + 1], sp[from[j] * 3 + 2]], j * 3); canon[j] = this.sid[from[j]]; }
    // Points at the same place share one normal while the clay is whole, so no seam shows.
    const groups = new Map(); for (let j = 0; j < n; j++) { if (!groups.has(canon[j])) groups.set(canon[j], []); groups.get(canon[j]).push(j); }
    this.twins = [...groups.values()].filter((l) => l.length > 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uvs = new Float32Array(n * 2), uv0 = this.src.attributes.uv.array;
    for (let j = 0; j < n; j++) { uvs[j * 2] = uv0[from[j] * 2]; uvs[j * 2 + 1] = uv0[from[j] * 2 + 1]; }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(tri);
    this.dirs = dirs; this.piece = piece; this.n = n; this.canon = canon; this.tri = tri;
    this.shape = new Float32Array(n); this.perm = new Float32Array(n); this.temp = new Float32Array(n);
    const thumbs = [[0.55, 0.35, 0.76], [-0.7, 0.1, 0.7], [0.1, 0.8, 0.5], [0.8, -0.1, -0.5]].map((d) => new THREE.Vector3(...d).normalize());
    const palms = [[0.9, 0.2, 0.3, 1.72], [-0.5, 0.3, -0.8, 1.78], [0.1, 1, -0.2, 1.7], [-0.6, -0.1, 0.75, 1.82]].map(([x, y, z, d]) => [new THREE.Vector3(x, y, z).normalize(), d / 2]);
    const col = new Float32Array(n * 3), base = new THREE.Color('#c08463');
    for (let i = 0; i < n; i++) {
      v.fromArray(dirs, i * 3).normalize();
      let r = 1 + 0.12 * fbm(v.x * 1.1 + 3, v.y * 1.1, v.z * 1.1) + 0.04 * fbm(v.x * 3, v.y * 3 + 7, v.z * 3);
      for (const [pv, d] of palms) { const c = v.dot(pv); if (c > 0.05) r = smin(r, d / c, 0.12); }
      for (const d of thumbs) { const a = v.angleTo(d); r -= 0.085 * Math.exp(-((a / 0.3) ** 2)); }
      this.shape[i] = r;
      const k = 0.9 + 0.12 * fbm(v.x * 2.5 + 11, v.y * 2.5, v.z * 2.5) - 0.35 * Math.max(0, 1.04 - r);
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
    }
    this.col0 = col.slice(); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  },
  // Once, when he is made: in the pose he has under the clay, find his outside skin along each direction of
  // the lump (sphere tracing on the distance functions of his parts). Then cut the statue into pieces of about
  // one size (on the statue itself, so a piece is a chunk, not a strip), and set how each one flies.
  sculpt() {
    H.pose.rest(); realSetExpression(EXPRESSIONS.sleepy); place(0, 0.6, 0); H.root.updateMatrixWorld(true);
    const O = this.lump.position, p = new THREE.Vector3(), q = new THREE.Vector3();
    const parts = H.shapes.filter((m) => m.userData.f && m.geometry?.attributes.position).map((m) => {
      m.geometry.computeBoundingSphere(); const s = m.matrixWorld.getMaxScaleOnAxis();
      const bs = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld);
      return { f: m.userData.f, s, inv: m.matrixWorld.clone().invert(), c: bs.center.sub(O), r: bs.radius + 0.3 };
    });
    // His other parts (eyes, lids, ear buds, mouth) have no distance function: a sphere round each one.
    const balls = [];
    H.root.traverse((m) => { if (m.isMesh && !m.userData.f && m.geometry?.attributes.position) { m.geometry.computeBoundingSphere(); const b = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld); b.center.sub(O); balls.push(b); } });
    const dist = (x, y, z) => {
      let best = 9;
      for (const b of balls) { const d = Math.hypot(x - b.center.x, y - b.center.y, z - b.center.z) - b.radius; if (d < best) best = d; }
      for (const P of parts) {
        const dx = x - P.c.x, dy = y - P.c.y, dz = z - P.c.z; if (dx * dx + dy * dy + dz * dz > P.r * P.r) continue;
        q.set(x + O.x, y + O.y, z + O.z).applyMatrix4(P.inv); const d = P.f(q.x, q.y, q.z) * P.s; if (d < best) best = d;
      }
      return best;
    };
    const sp = this.src.attributes.position.array, ns = this.ns, at = new Float32Array(ns * 3), done = new Uint8Array(ns), v = new THREE.Vector3(), o = new THREE.Vector3();
    for (let i = 0; i < this.sid.length; i++) {
      const c = this.sid[i]; if (done[c]) continue; done[c] = 1;
      // Each direction of the lump has its own start on a line up through his middle (its height goes with the
      // direction's height), and goes out nearly level from it: so the face, the arms and the legs are met
      // from the front and the side, not at a slant from his chest. The top start stays under his crown.
      v.fromArray(sp, i * 3).normalize(); o.set(0, 4.45 + 3.4 * v.y, 0); v.set(v.x, v.y * 0.5, v.z).normalize();
      // In from outside, to the first point on his skin (SKIN outside it), or to the floor.
      let r = 8, hit = false;
      const rFloor = v.y < -1e-4 ? (0.012 - o.y) / v.y : 1e9;
      while (r > 0.05) {
        p.copy(o).addScaledVector(v, r);
        if (r > rFloor) { r -= 0.05; continue; }   // under the floor: no clay there
        const d = dist(p.x, p.y, p.z);
        if (d < SKIN) { hit = true; break; }
        r -= Math.max(0.02, Math.min(d - SKIN, 0.6) * 0.8);
      }
      if (!hit && rFloor < 8) r = Math.min(r, rFloor);
      p.copy(o).addScaledVector(v, Math.max(r, 0.05)); p.y = Math.max(p.y, 0.012);
      at.set([p.x, p.y, p.z], c * 3);
    }
    const raw = at.slice();
    // Smooth the statue a little (three passes; ten at the top pole, where the points are close together), so a
    // sharp step in depth (the edge of the nose, an ear, an arm against the body) is a soft clay slope.
    const idx = this.src.index.array, adj = Array.from({ length: ns }, () => new Set()), top = new Uint8Array(ns);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = this.sid[idx[t + e]], b = this.sid[idx[t + (e + 1) % 3]]; if (a !== b) { adj[a].add(b); adj[b].add(a); } }
    for (let i = 0; i < this.sid.length; i++) if (sp[i * 3 + 1] > 1.9) top[this.sid[i]] = 1;
    for (let it = 0; it < 10; it++) {
      const nx = at.slice();
      for (let c = 0; c < ns; c++) {
        if (at[c * 3 + 1] < 0.03 || !adj[c].size || (it >= 3 && !top[c])) continue;   // the floor stays flat
        let x = 0, y = 0, z = 0; for (const d of adj[c]) { x += at[d * 3]; y += at[d * 3 + 1]; z += at[d * 3 + 2]; }
        const k = adj[c].size;
        nx[c * 3] = 0.5 * at[c * 3] + 0.5 * x / k; nx[c * 3 + 1] = Math.max(0.012, 0.5 * at[c * 3 + 1] + 0.5 * y / k); nx[c * 3 + 2] = 0.5 * at[c * 3 + 2] + 0.5 * z / k;
      }
      at.set(nx);
    }
    this.statue = at;
    // The pieces: seeds spread over the statue, about PIECE apart (each point of the statue is tried in a
    // random order, and kept if no seed is near it); each triangle goes to its nearest seed, measured from a
    // slightly warped place, so the cracks wander.
    const PIECE = 0.5, CELL = PIECE, grid = new Map(), seeds = [], cellOf = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
    const order = Array.from({ length: ns }, (_, c) => c).sort((a, b) => hash3(a, 1, 2) - hash3(b, 1, 2));
    for (const c of order) {
      const x = at[c * 3], y = at[c * 3 + 1], z = at[c * 3 + 2]; if (y < 0.03) continue;
      const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), gz = Math.floor(z / CELL); let ok = true;
      for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) for (let e = -1; e <= 1 && ok; e++) for (const s of grid.get(`${gx + a},${gy + b},${gz + e}`) || []) if ((seeds[s * 3] - x) ** 2 + (seeds[s * 3 + 1] - y) ** 2 + (seeds[s * 3 + 2] - z) ** 2 < PIECE * PIECE) { ok = false; break; }
      if (!ok) continue;
      const k = seeds.length / 3; seeds.push(x, y, z); const key = cellOf(x, y, z); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k);
    }
    const NP = seeds.length / 3, NT = idx.length / 3, tk = new Int32Array(NT);
    for (let t = 0; t < NT; t++) {
      let x = 0, y = 0, z = 0; for (let e = 0; e < 3; e++) { const c = this.sid[idx[t * 3 + e]]; x += at[c * 3] / 3; y += at[c * 3 + 1] / 3; z += at[c * 3 + 2] / 3; }
      const wx = x + 0.14 * fbm(x * 2.3 + 1, y * 2.3, z * 2.3), wy = y + 0.14 * fbm(x * 2.3, y * 2.3 + 4, z * 2.3), wz = z + 0.14 * fbm(x * 2.3, y * 2.3, z * 2.3 + 8);
      const gx = Math.floor(wx / CELL), gy = Math.floor(wy / CELL), gz = Math.floor(wz / CELL); let best = -1, bd = 1e9;
      for (let R = 1; best < 0 || R <= 2; R++) {
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let e = -R; e <= R; e++) for (const s of grid.get(`${gx + a},${gy + b},${gz + e}`) || []) { const d = (seeds[s * 3] - wx) ** 2 + (seeds[s * 3 + 1] - wy) ** 2 + (seeds[s * 3 + 2] - wz) ** 2; if (d < bd) { bd = d; best = s; } }
        if (R > 6) break;
      }
      tk[t] = Math.max(0, best);
    }
    // Each triangle then takes the piece of most of its neighbours, so no small islands of one piece are left
    // inside another.
    const te = new Map(), tn = Array.from({ length: NT }, () => []);
    for (let t = 0; t < NT; t++) for (let e = 0; e < 3; e++) { const x = this.sid[idx[t * 3 + e]], y = this.sid[idx[t * 3 + (e + 1) % 3]]; if (x === y) continue; const k = x < y ? x * 1e6 + y : y * 1e6 + x; const u = te.get(k); if (u === undefined) te.set(k, t); else { tn[t].push(u); tn[u].push(t); } }
    for (let it = 0; it < 6; it++) for (let t = 0; t < NT; t++) {
      const same = tn[t].filter((u) => tk[u] === tk[t]).length; if (same >= 2 || !tn[t].length) continue;
      const cnt = new Map(); for (const u of tn[t]) cnt.set(tk[u], (cnt.get(tk[u]) || 0) + 1);
      tk[t] = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
    }
    // The lump, now in pieces (the same shape; nothing on the screen changes).
    const old = this.lump.geometry; this.lump.geometry = this.split(tk); old.dispose();
    const n = this.n, tri = this.tri, canon = this.canon;
    this.NP = NP;
    // The edges where two pieces meet: smooth them along the edge on the statue, so a crack is a curve, not
    // steps of the sphere's grid (a point where three pieces meet stays); then relax the points near the edges
    // so no small triangle folds over.
    const edges = new Map();
    for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = tri[t + e], b = tri[t + (e + 1) % 3], ca = canon[a], cb = canon[b]; if (ca === cb) continue;
      const k = ca < cb ? ca * 1e6 + cb : cb * 1e6 + ca; let l = edges.get(k); if (!l) edges.set(k, (l = [])); l.push([a, b, this.piece[a]]);
    }
    const nbE = new Map();
    for (const l of edges.values()) if (l.length === 2 && l[0][2] !== l[1][2]) {
      const a = canon[l[0][0]], b = canon[l[0][1]];
      if (!nbE.has(a)) nbE.set(a, new Set()); if (!nbE.has(b)) nbE.set(b, new Set()); nbE.get(a).add(b); nbE.get(b).add(a);
    }
    for (let it = 0; it < 4; it++) {
      const nx = at.slice();
      for (const [c, S2] of nbE) { if (S2.size !== 2 || at[c * 3 + 1] < 0.03) continue; const [a, b] = [...S2]; for (let d = 0; d < 3; d++) nx[c * 3 + d] = 0.5 * at[c * 3 + d] + 0.25 * (at[a * 3 + d] + at[b * 3 + d]); }
      at.set(nx);
    }
    let ring = new Set(nbE.keys()); const near = new Set(), seen = new Set(ring);
    for (let r = 0; r < 3; r++) { const nx = new Set(); for (const c of ring) for (const d of adj[c]) if (!seen.has(d)) { seen.add(d); nx.add(d); near.add(d); } ring = nx; }
    for (let it = 0; it < 6; it++) for (const c of near) {
      if (at[c * 3 + 1] < 0.03 || top[c]) continue;
      let x = 0, y = 0, z = 0; for (const d of adj[c]) { x += at[d * 3]; y += at[d * 3 + 1]; z += at[d * 3 + 2]; }
      const k = adj[c].size; at[c * 3] = 0.5 * at[c * 3] + 0.5 * x / k; at[c * 3 + 1] = 0.5 * at[c * 3 + 1] + 0.5 * y / k; at[c * 3 + 2] = 0.5 * at[c * 3 + 2] + 0.5 * z / k;
    }
    // No point of the statue may come closer to his skin than it was measured (the smoothing pulls the clay in
    // over a bump, such as a shoe's toe or a knuckle, and he would show through): such a point goes back.
    for (let c = 0; c < ns; c++) if (at[c * 3 + 1] > 0.03 && dist(at[c * 3], at[c * 3 + 1], at[c * 3 + 2]) < 0.02) at.set([raw[c * 3], raw[c * 3 + 1], raw[c * 3 + 2]], c * 3);
    // The statue's normals (shared across the edges): the inner wall of a piece is under its points along them.
    const fg = new THREE.BufferGeometry(), fp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) fp.set([at[canon[i] * 3], at[canon[i] * 3 + 1], at[canon[i] * 3 + 2]], i * 3);
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setIndex(tri); fg.computeVertexNormals();
    const fn = fg.attributes.normal.array, acc = new Float32Array(ns * 3);
    for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) acc[canon[i] * 3 + d] += fn[i * 3 + d];
    this.figN = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = canon[i] * 3, l = Math.hypot(acc[c], acc[c + 1], acc[c + 2]) || 1; for (let d = 0; d < 3; d++) this.figN[i * 3 + d] = acc[c + d] / l; }
    // The inside of the clay: an inner wall under each point, and a broken edge (a strip of two triangles)
    // along every edge where two pieces meet. Each piece has its own edge, so the pieces can come apart.
    const rim = [];
    for (const l of edges.values()) if (l.length === 2 && l[0][2] !== l[1][2]) rim.push(l[0][0], l[0][1], l[1][0], l[1][1]);
    this.rim = rim; const E = rim.length / 2, m = n + E * 4, tg = new THREE.BufferGeometry(), tidx = [];
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3));
    tg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m * 3), 3));
    for (let t = 0; t < tri.length; t += 3) tidx.push(tri[t], tri[t + 2], tri[t + 1]);
    for (let e = 0; e < E; e++) { const u = n + e * 4; tidx.push(u, u + 1, u + 2, u, u + 2, u + 3); }   // outer a, outer b, inner b, inner a
    tg.setIndex(tidx);
    this.thick = new Float32Array(n); for (let i = 0; i < n; i++) this.thick[i] = 0.12 + 0.06 * hash3(canon[i], 3, 7);
    this.inner = new THREE.Mesh(tg, this.inMat); this.inner.position.copy(this.lump.position); this.inner.frustumCulled = false; this.inner.visible = false; this.lump.parent.add(this.inner);
    // How each piece flies. All of them leave at the burst (within a few frames of each other), each at a
    // random speed (most of them slow, some fast), outwards and up; the ones over his head go up faster than
    // he jumps.
    this.pieces = Array.from({ length: NP }, (_, k) => ({ c: new THREE.Vector3(), n: 0, k }));
    for (let i = 0; i < n; i++) { const P = this.pieces[this.piece[i]], c = canon[i] * 3; P.c.x += at[c]; P.c.y += at[c + 1]; P.c.z += at[c + 2]; P.n++; P.top = Math.max(P.top ?? 0, at[c + 1]); }
    for (const P of this.pieces) {
      const h = (a, b) => hash3(P.k, a, b + 70);
      P.c.divideScalar(Math.max(1, P.n));
      // Out from his middle, bent to the sides: a piece that flew at the camera would stay over him on the screen.
      const flat = new THREE.Vector3(P.c.x, 0, P.c.z); if (flat.lengthSq() < 0.01) flat.set(h(1, 1) - 0.5, 0, 0.5); flat.normalize();
      flat.set(flat.x + (flat.x >= 0 ? 0.6 : -0.6) * Math.abs(flat.z), 0, flat.z * 0.5).normalize();
      P.nrm = P.c.clone().sub(new THREE.Vector3(0, clamp(P.c.y, 1, 7.4), 0)).normalize();
      P.tc = 0.625 + 0.012 * h(4, 1);   // its crack opens
      P.tl = BURST + 0.008 * h(2, 2);
      // Over his arms, his face and the sides of his head: away fast to the sides, before his arms come up into
      // the star and before his head comes up with the jump. On the top of his head: up, faster than he jumps.
      const arm = Math.abs(P.c.x) > 0.6 && P.c.y > 1.1 && P.c.y < 6.2, head = P.c.y > 5.8, crown = P.c.y > 8.1 || (head && P.nrm.y > 0.6);
      const speed = 5.5 + 5.5 * h(3, 3) ** 1.7 + (arm || (head && !crown) ? 3.5 : 0);
      P.v = flat.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 1.4 + 3.5 * h(5, 5) + (crown ? 4 + 2.5 * h(6, 6) : 0), 0));
      // Between his legs: backwards (behind him), not to the side, which is through a leg.
      if (Math.abs(P.c.x) < 0.25 && P.c.y < 2.4) P.v.set(0.25 * Math.sign(P.c.x || 1), 1.2 + 2 * h(5, 5), -(4.5 + 3 * h(3, 3)));
      P.tland = (P.v.y + Math.sqrt(P.v.y * P.v.y + 2 * GRAV * Math.max(0, P.c.y - REST))) / GRAV;
      P.axis = new THREE.Vector3(h(7, 1) - 0.5, h(8, 2) - 0.5, h(9, 3) - 0.5).normalize(); P.spin = 3 + 8 * h(10, 4);
      P.stay = 0.15 + 0.2 * h(11, 5);   // how long it lies on the floor before it shrinks away
      // The flat bottom on the floor, round and under his shoes, and the clay low between his feet: it does not
      // fly (every way out is through a shoe); it flattens and shrinks away.
      if (P.top < 0.3 || (Math.abs(P.c.x) < 0.35 && P.c.y < 0.6)) { P.v.set(0, 0, 0); P.tland = 0; P.stay = 0.02 + 0.08 * h(12, 5); P.floor = true; }
    }
    // Each piece's path is tested against his body (his shapes, lifted as he jumps) for its first moments, at
    // up to 14 of its points. If it touches him, other directions are tried (turned about the vertical, or
    // straight forwards or backwards), and the one that keeps farthest from him is kept.
    const pts = Array.from({ length: NP }, () => []);
    for (let i = 0; i < n; i += 5) { const l = pts[this.piece[i]]; if (l.length < 14) l.push(canon[i]); }
    const liftAt = (tau) => { const j = clamp((BURST + tau * TS - JUMP[0]) / (JUMP[1] - JUMP[0])); return HIGH * 4 * j * (1 - j); };
    const clear = (P, vel) => {
      let worst = 9;
      for (let tau = 0.03; tau <= 0.5; tau += 0.06) {
        const lift = liftAt(tau);
        for (const c of pts[P.k]) {
          const d = dist(at[c * 3] + vel.x * tau, at[c * 3 + 1] + vel.y * tau - 0.5 * GRAV * tau * tau - lift, at[c * 3 + 2] + vel.z * tau);
          if (d < worst) worst = d;
        }
      }
      return worst;
    };
    const Y = new THREE.Vector3(0, 1, 0);
    for (const P of this.pieces) {
      if (P.floor || clear(P, P.v) > 0.03) continue;
      // In this order (the first that keeps off him is kept): small turns, then larger ones, then backwards
      // (behind him), and towards the camera only at the end (a piece that flies at the camera stays over him
      // on the screen). If none keeps off him, the one that keeps farthest from him.
      const sp = Math.hypot(P.v.x, P.v.z), tries = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2].map((a) => P.v.clone().applyAxisAngle(Y, a));
      tries.push(new THREE.Vector3(0.2 * Math.sign(P.c.x || 1) * sp, P.v.y, -sp), new THREE.Vector3(0, 0.3, -1.5), new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0.2 * Math.sign(P.c.x || 1) * sp, P.v.y, sp));
      let best = P.v, bd = -9;
      for (const vel of tries) { const d = clear(P, vel); if (d > 0.03) { best = vel; bd = d; break; } if (d > bd) { bd = d; best = vel; } }
      // A piece that must leave towards the camera turns to the side once it is off him, so it does not stay
      // over him on the screen.
      if (best.z > 0.5 * Math.hypot(best.x, best.z)) P.v2 = new THREE.Vector3((P.c.x >= 0 ? 1 : -1) * 9, 0, 0);
      P.v = best; P.tland = (P.v.y + Math.sqrt(P.v.y * P.v.y + 2 * GRAV * Math.max(0, P.c.y - REST))) / GRAV;
    }
    // Crumbs: small bits that break off the edges at the burst, each from one piece, with its own speed.
    this.crumb = Array.from({ length: this.crumbs.count }, (_, i) => {
      const h = (a, b) => hash3(i, a, b + 40), P = this.pieces[Math.floor(h(1, 1) * NP)];
      const r = 0.03 + 0.08 * h(2, 2) ** 2, from = P.c.clone().add(new THREE.Vector3(h(3, 3) - 0.5, h(4, 4) - 0.5, h(5, 5) - 0.5).multiplyScalar(0.5));
      const vel = P.v.clone().multiplyScalar(0.7 + 0.4 * h(6, 6)).add(new THREE.Vector3(h(7, 7) - 0.5, h(8, 8) * 0.6, (h(9, 9) - 0.5) * 0.5).multiplyScalar(2));
      return { r, from, vel, t0: P.tl + 0.004 * h(10, 10), land: (vel.y + Math.sqrt(vel.y * vel.y + 2 * GRAV * Math.max(0, from.y - r))) / GRAV,
        axis: new THREE.Vector3(h(11, 1) - 0.5, h(12, 1) - 0.5, h(13, 1) - 0.5).normalize(), sq: new THREE.Vector3(1 + 0.4 * h(14, 1), 0.7 + 0.3 * h(15, 1), 1 + 0.3 * h(16, 1)), stay: 0.1 + 0.2 * h(17, 1) };
    });
  },
  // Where piece P's middle is, and how it is turned, squashed and sized, at scroll t (ck: how open its crack is).
  pieceAt(P, t) {
    const ck = sm(P.tc, P.tc + 0.02, t), tau = Math.max(0, (t - P.tl) / TS);
    const o = { ck, tau, at: P.c.clone().addScaledVector(P.nrm, 0.04 * ck), q: null, s: 1, sy: 1, sxz: 1 };
    if (tau <= 0) return o;
    const f = Math.min(tau, P.tland), after = tau - P.tland;
    o.at.addScaledVector(P.v, f); o.at.y -= 0.5 * GRAV * f * f;
    if (P.v2) o.at.addScaledVector(P.v2, Math.max(0, f - 0.12));
    if (after > 0) {
      // Landed: it slides a little, the soft clay squashes on the floor, and after a moment it shrinks away.
      o.at.x += P.v.x * 0.1 * (1 - Math.exp(-after * 6)); o.at.z += P.v.z * 0.1 * (1 - Math.exp(-after * 6)); o.at.y = P.floor ? P.c.y : REST;
      const sq = sm(0, 0.1, after); o.sy = 1 - 0.45 * sq; o.sxz = 1 + 0.15 * sq;
      o.s = 1 - sm(P.stay, P.stay + 0.35, after);
    }
    // It starts to turn only once it is off him (a piece round an arm would swing its inner edge into the arm).
    o.q = new THREE.Quaternion().setFromAxisAngle(P.axis, P.spin * Math.max(0, f - 0.12) * sm(0.12, 0.45, f));
    return o;
  },
  act(t) {
    const L = this.lump, n = this.n, D3 = this.dirs, v = new THREE.Vector3(), w = new THREE.Vector3(), ready = !!this.statue;
    // The scroll: a lump (0 to 0.3, the pointer can dent it); a squash (0.3 to 0.42); the statue (0.4 to 0.62).
    const sq = still ? 0 : bump(0.3, 0.42, t), m = ready ? (still ? sm(0.4, 0.62, t) : back(sm(0.4, 0.62, t))) : 0;
    this.mat.normalScale.setScalar(lerp(0.95, 0.5, clamp(m)));
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
    const at = ready ? this.pieces.map((P) => this.pieceAt(P, t)) : null, broken = ready && at.some((a) => a.ck > 0);
    const P = L.geometry.attributes.position, col = L.geometry.attributes.color, S = this.statue;
    for (let i = 0; i < n; i++) {
      v.fromArray(D3, i * 3).normalize();
      // The lump point (with its dents, the squash, and a flat bottom on the floor).
      const r = 2 * (this.shape[i] - this.perm[i] - this.temp[i]);
      let x = v.x * r * (1 + 0.28 * sq), y = v.y * r * (1 - 0.3 * sq), z = v.z * r * (1 + 0.28 * sq);
      if (y < FLOOR + 0.5) y = FLOOR + Math.log1p(Math.exp((y - FLOOR) * 6)) / 6;
      y += LIFT * (1 - 0.3 * sq) - 0.01;
      let kc = 1 - 0.55 * this.perm[i] - 0.3 * this.temp[i];
      if (m > 0) {
        const c = this.canon[i] * 3; x = lerp(x, S[c], m); y = lerp(y, S[c + 1], m); z = lerp(z, S[c + 2], m);
        const A = at[this.piece[i]], Pc = this.pieces[this.piece[i]].c;
        if (A.q) {
          w.set(x - Pc.x, y - Pc.y, z - Pc.z).multiplyScalar(A.s).applyQuaternion(A.q);
          x = A.at.x + w.x * A.sxz; y = Math.max(0.02, A.at.y + w.y * A.sy); z = A.at.z + w.z * A.sxz;
          kc -= 0.08 * clamp(A.tau);
        } else if (A.ck > 0) { x += A.at.x - Pc.x; y += A.at.y - Pc.y; z += A.at.z - Pc.z; }
      }
      P.setXYZ(i, x, y, z);
      col.setXYZ(i, this.col0[i * 3] * kc, this.col0[i * 3 + 1] * kc, this.col0[i * 3 + 2] * kc);
    }
    P.needsUpdate = true; col.needsUpdate = true; L.geometry.computeVertexNormals();
    const N = L.geometry.attributes.normal, a = new THREE.Vector3();
    for (const list of this.twins) {
      if (broken && list.some((i) => at[this.piece[i]].ck > 0)) continue;   // a cracked piece has its own edge
      a.set(0, 0, 0); for (const i of list) a.add(v.fromBufferAttribute(N, i)); a.normalize(); for (const i of list) N.setXYZ(i, a.x, a.y, a.z);
    }
    N.needsUpdate = true; L.geometry.computeBoundingSphere();
    const gone = ready && at.every((A) => A.tau > 0 && A.s <= 0);
    L.visible = !gone;
    // The inner wall and the broken edges, once the cracks open: under each point along the statue's normal,
    // turned and squashed with its piece.
    if (this.inner) this.inner.visible = broken && !gone;
    if (this.inner?.visible) {
      const T = this.inner.geometry.attributes.position, rim = this.rim, FN = this.figN, nv = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const A = at[this.piece[i]], th = this.thick[i] * (A.q ? A.s : 1); nv.fromArray(FN, i * 3); if (A.q) { nv.applyQuaternion(A.q); nv.x *= A.sxz; nv.y *= A.sy; nv.z *= A.sxz; }
        T.setXYZ(i, P.getX(i) - nv.x * th, Math.max(0.01, P.getY(i) - nv.y * th), P.getZ(i) - nv.z * th);
      }
      for (let e = 0, o = n; e < rim.length; e += 2, o += 4) {
        const A = rim[e], B = rim[e + 1];
        T.setXYZ(o, P.getX(A), P.getY(A), P.getZ(A)); T.setXYZ(o + 1, P.getX(B), P.getY(B), P.getZ(B));
        T.setXYZ(o + 2, T.getX(B), T.getY(B), T.getZ(B)); T.setXYZ(o + 3, T.getX(A), T.getY(A), T.getZ(A));
      }
      T.needsUpdate = true; this.inner.geometry.computeVertexNormals();
    }
    // The crumbs.
    const CR = this.crumbs, M = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    let any = false;
    if (ready) this.crumb.forEach((c, i) => {
      const tau = (t - c.t0) / TS, after = Math.max(0, tau - c.land), k = sm(0, 0.06, tau) * (1 - sm(c.stay, c.stay + 0.3, after));
      if (tau <= 0 || k <= 0) { M.makeScale(0, 0, 0); CR.setMatrixAt(i, M); return; }
      any = true;
      const f = Math.min(tau, c.land);
      p3.copy(c.from).addScaledVector(c.vel, f); p3.y -= 0.5 * GRAV * f * f;
      if (after > 0) { p3.x += c.vel.x * 0.1 * (1 - Math.exp(-after * 5)); p3.z += c.vel.z * 0.1 * (1 - Math.exp(-after * 5)); p3.y = c.r * 0.7 + Math.abs(Math.sin(after * 9)) * 0.25 * Math.exp(-after * 7); }
      q.setFromAxisAngle(c.axis, 6 * f + 2 * Math.min(after, 0.4));
      s3.copy(c.sq).multiplyScalar(c.r * k);
      CR.setMatrixAt(i, M.compose(p3, q, s3));
    });
    CR.visible = any; CR.instanceMatrix.needsUpdate = true;
    // The lump's shadow goes as it becomes the statue: after the burst, only he and his own shadow are there.
    this.sh.scale.set(5.6 * (1 + 0.28 * sq), 4.6 * (1 + 0.28 * sq), 1); this.sh.material.opacity = 0.55 * (1 - sm(0.42, 0.58, t)); this.sh.visible = this.sh.material.opacity > 0.002;
    if (!H) return;
    // He is inside the statue until the burst; he jumps out of it in a star, and lands.
    H.root.visible = ready && t >= BURST;
    H.pose.rest();
    const j = clamp((t - JUMP[0]) / (JUMP[1] - JUMP[0])), lift = still ? 0 : HIGH * 4 * j * (1 - j);
    const star = still ? 0 : sm(JUMP[0] + 0.012, JUMP[0] + 0.055, t) * (1 - sm(JUMP[1] - 0.035, JUMP[1], t));
    if (star > 0) {
      for (const A of H.arms) { A.shoulder.rotation.set(0, 0, A.sx * lerp(0.2, 2.25, star)); A.elbow.rotation.set(lerp(-0.12, -0.1, star), 0, A.sx * 0.22 * star); A.wrist.rotation.set(0, 0, A.sx * 0.15 * star); }
      for (const Lg of H.legs) { Lg.hip.rotation.set(0, 0, Lg.sx * 0.42 * star); Lg.ankle.rotation.set(0, 0, -Lg.sx * 0.3 * star); }
    }
    // The landing: a short squash (his feet stay on the floor).
    const land = still ? 0 : bump(JUMP[1], JUMP[1] + 0.05, t), sy = 1 - 0.09 * land, sxz = 1 + 0.045 * land;
    place(0, 0.6, lerp(0, 0.35, sm(0.92, 1, t)), { y: lift - 6.82 * (1 - sy) });
    H.root.scale.set(sxz, sy, sxz);
    if (H.shadow) { const k = 1 - 0.4 * lift / HIGH; H.shadow.scale.set(3.8 * k, 2.4 * k, 1); }
    const hand = still ? 0 : bump(0.88, 0.995, t);
    if (hand) { H.blendPose('rest', 'wave', hand); H.arms[1].elbow.rotation.z += Math.sin(now() / 120) * 0.3 * hand; }
    H.blendExpression('sleepy', 'surprised', sm(BURST, BURST + 0.02, t)); H.blendExpression('surprised', 'smile', sm(0.7, 0.74, t));
    lookAt(cam.position, sm(0.8, 0.86, t) * (1 - hand));
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
  // The set stands on the right, under the prompt, so no word of the statement (bottom left) touches it.
  shot(t) { return { at: [S1[0] + 0.3, 4.2, S1[1]], dist: lerp(34, 29, sm(0.5, 1, t)), az: 8 + 3 * pn.x, el: lerp(10, 16, sm(0.5, 1, t)) - 2 * pn.y, sx: 0.2, sy: 0.13 }; },
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
  start: [S2[0], S2[1], -0.95], end: [S2[0], S2[1], -0.95], flows: true, via: [[WX0 - 7, Z3]],
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
      put(m); m.redraw(0); R.initTexture(m.material.map); return m;   // on the GPU now, not on the first frame that shows it
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
  // the nib points into the page and down, as in a right hand that writes.
  nib(i, x, y, lift = 0) {
    const m = this.pages[i]; m.updateMatrixWorld(true);
    const q0 = m.getWorldQuaternion(new THREE.Quaternion()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(q0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q0), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q0);
    const dir = n.clone().multiplyScalar(-0.62).addScaledVector(up, -0.62).addScaledVector(right, -0.3).normalize();   // a right hand's pen: its back leans to the right
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
    // He starts with the surprised face that he had at the end of chapter 1, so his face goes on across the cut.
    H.blendExpression('surprised', 'thinking', sm(0.08, 0.2, t)); H.blendExpression('thinking', 'surprised', sm(0.8, 0.84, t)); H.blendExpression('surprised', 'understanding', sm(0.92, 0.97, t));
    lookAt(pen.position, 1);
  },
  shot(t) { return { at: [S2[0] - 5.6, 4.6, 0], dist: 28, az: -4 + 3 * pn.x, el: 7 - 2 * pn.y, sx: 0.05, sy: 0.1 }; },
};

// 3. Whisper times every word: the real waveform of one sentence; each word drops in at its Whisper time.
// The pointer finds the word under it: its chip lifts and its bars turn green.
let VOICE;
C[3] = {
  cont: true, speed: (WX1 + 2 - WX0) / ACT[3],
  start: [WX0 - 1, Z3, PI2], end: [WX1 + 1, Z3, PI2], via: [[WX1 + 3.5, -0.5], [WX1 + 4.5, 3.6], [FACE + 3, 3.6]],
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
    // He walks on at one pace through the whole chapter and on into the walk out (C[3].speed, cont), and the
    // playhead goes with him; at the end of the track it sinks into the floor.
    const hx = WX0 - 1 + (WX1 + 2 - WX0) * t, { words } = VOICE, n = this.h.length;
    const x = clamp(hx + 0.8, WX0, WX1), T = (x - WX0) / (WX1 - WX0) * this.dur;
    const sink = 1 - sm(0.9, 0.98, t); this.head.position.set(x, 0, WZ); this.head.scale.set(1, Math.max(sink, 0.001), 1); this.head.visible = sink > 0.002;
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
    // He walks behind the bars and the words, smiling. His hand on the side of the camera (hand 0) goes along
    // behind the words at the height of their middle row, its palm to them, as if it touches each one.
    H.pose.rest(); place(hx, Z3, PI2);
    H.stride((route(2).total + hx - (WX0 - 1)) * H.STEP, 0.5);   // the steps go on from the walk in, and on into the walk out
    // The hand rises from where it hangs and goes back down at the end (a hold at full strength all the time:
    // a half-strength hold swings the elbow out in front of the words).
    const up = sm(0.01, 0.12, t) * (1 - sm(0.82, 0.95, t)), hang = [hx + 0.3, 2.0, Z3 + 1.45], top = [hx + 1.0, 5.15, WZ + 0.2 - 0.6];
    H.hold(0, hang.map((v, q) => lerp(v, top[q], up)), 1, up > 0.3 ? [0, 0, 1] : null);
    H.blendExpression('neutral', 'smile', 0.9);
    // He turns his head to the words ahead of him; the point is at the height of his head, so it does not tip.
    lookAt(new THREE.Vector3(hx + 2.2, H.headPivot.getWorldPosition(new THREE.Vector3()).y, WZ + 0.2), 0.9 * (1 - sm(0.9, 0.98, t)));
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
  start: [FACE + 1.75, 0, -PI2], end: [FACE + 3.4, 0, -PI2], next: 'in5', get via() { return VIA5(); },
  build() {
    this.c = model('cart', { x: CX, k: KK });
    const G = this.c.groups; this.b0 = G.body.position.x;
    // The ghost: a clear copy of the cart body.
    this.ghost = G.body.clone(true); this.ghost.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; } });
    G.body.parent.add(this.ghost); this.ghost.visible = false;
    this.hoverS = null;
    graphEl.addEventListener('pointermove', (e) => { const r = graphEl.getBoundingClientRect(), f = (e.clientX - r.left - r.width * 0.1) / (r.width * 0.74); this.hoverS = f >= 0 && f <= 1 ? f * SIM * (1 - T0) : null; });
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
    const g = graphEl.getContext('2d'), x0 = W * 0.1, x1 = W * 0.84, xa = W * 0.92, y0 = Hh * 0.44, A = Hh * 0.28, S = SIM * (1 - T0);   // the curve ends at x1; the t axis goes on to xa
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = 'rgba(240, 231, 214, .6)'; round(g, 0, 0, W, Hh, 16 * dpr); g.fill();
    g.strokeStyle = 'rgba(38, 38, 42, .35)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(x0, y0); g.lineTo(xa, y0); g.moveTo(x0, Hh * 0.12); g.lineTo(x0, Hh * 0.92); g.stroke();
    g.fillStyle = '#26262a'; g.font = `600 ${13 * dpr}px "JetBrains Mono"`;
    g.fillText('x(t)', x0 + 8 * dpr, Hh * 0.16); g.fillText('t', xa + 6 * dpr, y0 + 5 * dpr);
    g.fillText(`frame ${String(Math.round(s * 30)).padStart(4, '0')}   t = ${s.toFixed(2)} s`, x0 + 8 * dpr, Hh * 0.94);
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
    if (grip > 0) { H.hold(0, [F + 0.02, 2.6, -0.62], grip, null, ELBOW_BACK); H.hold(1, [F + 0.02, 2.6, 0.62], grip, null, ELBOW_BACK); }
    H.blendExpression('neutral', 'thinking', grip); H.blendExpression('thinking', 'smile', sm(0.55, 0.65, t));
    lookAt(t > 0.5 ? this.c.groups.body.getWorldPosition(new THREE.Vector3()) : null, t > 0.5 ? 0.8 : 0);
  },
  shot(t) { return { at: [CX + 2.5, 3.6, 0], dist: 30, az: -14 + 3 * pn.x, el: 9 - 2 * pn.y, sx: -0.08, sy: 0.14 }; },
};

// 5. Click anything, and he does one of his 12 moves. A ring of objects; a click (or a tap) on one sends him there
// to use it. The scroll only moves the story on: inside the chapter the actions run on time (the player below).
// Each action is one entry of ACTS: where he stands, how long it is, and run(t, dir), which sets him and its objects
// from its own time t only. dir is the object's state (0 or 1): each use changes it (the box goes to the stand, then
// back). The six new actions of Phase C go in the free places of FREE.
const SC = [CX + 30, 0], SPREAD = 1.3;   /* the ring spread out: a clear corridor between the things' grown footprints */
const W5 = (x, z) => [SC[0] + x * SPREAD, SC[1] + z * SPREAD];   // ring coordinates to world
const PED = 2.2, BR = 0.42, BK = 0.66;   /* the ball's radius reads on screen; the basket's size (inner radius 0.56) */                                   // the stand's top; the ball's radius
const RING = { berry: [-12, 3], bench: [-14.5, -1.5], wheel: [-12, -6], board: [0.6, -9.4], nails: [-5.6, -10], plant: [8.5, 6.0], basket: [12.18, -6.6], rack: [7.1, -6.6],   /* 6.6 apart in the world (x SPREAD): he stands 3.3 from each, with room for his hands */   /* in a line across the screen: the throw is seen from the side */
  parcel: [13.5, 2.5], stand: [13.5, -2.5], rug: [0, 5.8] };
const FREE = { sweep: [13, -7.5] };   // kept for the sweep
const KICK = [[-4.5, 1.8], [-7.2, 5.9]], SPOT = [0, -1];   // the ball's two places; the jump's spot
const angMix = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const seg = (t, a, d) => sm(a, a + d, t);                    // 0 to 1 from time a, over d

// ---------- the kit's helpers, for the page (styles/library/clay.js): they place him and his hands only ----------
const meshOf = (g) => (g.isMesh ? g : g.children.find((c) => c.isMesh));
const boxOf = (g, b = new THREE.Box3()) => { const geo = meshOf(g).geometry; geo.boundingBox ?? geo.computeBoundingBox(); return b.copy(geo.boundingBox).applyMatrix4(g.matrixWorld); };
const kit = {
  fwd() { H.root.updateMatrixWorld(true); const f = new THREE.Vector3(0, 0, 1).applyQuaternion(H.root.quaternion); f.y = 0; return f.normalize(); },
  partPoint(m, part, P) { const g = m.groups[part]; m.root.updateMatrixWorld(true); const pv = g.userData.pv; return g.localToWorld(new THREE.Vector3(P[0] - pv[0], P[1] - pv[1], P[2] - pv[2])).toArray(); },
  // A hand on its way to a hold: up in front of his chest, to just before the target, then onto it (moveHand in clay.js).
  moveHand(i, target, k, asHold = true) {
    if (k <= 0) return;
    H.root.updateMatrixWorld(true);
    const S = H.arms[i].shoulder.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(H.root.quaternion);
    const df = (target[0] - S.x) * f.x + (target[2] - S.z) * f.z, lf = Math.min(1.6, Math.max(0.6, df - 1.0)), side = 0.35 + 0.35 * clamp((1.15 - lf) / 0.3);   // smooth (Phase A: it jumped 0.35 to 0.7)
    const out = new THREE.Vector3(-1, 0, 0).applyQuaternion(H.root.quaternion).multiplyScalar(i === 0 ? side : -side);
    const pb = Math.min(0.9, Math.max(0.8, df - 0.8));
    const lift = [S.x + f.x * lf + out.x, S.y - 0.8, S.z + f.z * lf + out.z], pre = [target[0] - f.x * pb + out.x, target[1] + 0.35, target[2] - f.z * pb + out.z];
    const mixP = (A, B, u) => { const e = u * u * (3 - 2 * u); return [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e]; };
    if (k < 0.4) H.reach(i, lift, k / 0.4);
    else if (!asHold) H.reach(i, mixP(lift, target, Math.min(1, (k - 0.4) / 0.6)), 1);
    else if (k < 0.75) H.reach(i, mixP(lift, pre, (k - 0.4) / 0.35), 1);
    else if (k < 0.999) { H.reach(i, mixP(pre, target, (k - 0.75) / 0.25), 1); (H.holds ??= []).push({ i, point: target, k: 0.94 }); }
    else H.hold(i, target, 1);
  },
  grip(m, part, points, { k = 1, standOff, dir = [0, 0, 1], lean = 0.1 } = {}) {
    const P = points.map((p) => kit.partPoint(m, part, p));
    const c = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length, a[2] + p[2] / P.length], [0, 0, 0]), L = Math.hypot(dir[0], dir[2]) || 1;
    const at = [c[0] + dir[0] / L * standOff, c[2] + dir[2] / L * standOff];
    place(at[0], at[1], Math.atan2(-dir[0], -dir[2]), { lean });
    if (k > 0) { const f = kit.fwd(), r = [-f.z, f.x], sd = (p) => p[0] * r[0] + p[2] * r[1], [a, b] = sd(P[0]) >= sd(P[1]) ? [P[0], P[1]] : [P[1], P[0]]; kit.moveHand(0, a, k); kit.moveHand(1, b, k); }
    return at;
  },
  // Carry a model by a part: k 0 at rest (root at rest, turned restRy), k 1 in his hands in front of him.
  carry(m, part, { k = 1, grip = 1, rest, restRy = 0, height = 3.6 } = {}) {
    const grp = m.groups[part], geo = meshOf(grp).geometry; geo.boundingBox ?? geo.computeBoundingBox();
    const bb = geo.boundingBox, pv = grp.userData.pv, sc = m.root.scale.x;
    const c = [(bb.min.x + bb.max.x) / 2 + pv[0], (bb.min.y + bb.max.y) / 2 + pv[1], (bb.min.z + bb.max.z) / 2 + pv[2]];
    const hx = (bb.max.x - bb.min.x) / 2 * sc, hz = (bb.max.z - bb.min.z) / 2 * sc;
    const low = rest && rest[1] + c[1] * sc < 2.6, kk = k * k * (3 - 2 * k);   // (low: from the floor, he crouches)
    if (low && grip > 0) H.legsPose('crouch', Math.min(1, grip * 2) * (1 - kk));
    const f = kit.fwd(), face = Math.atan2(f.x, f.z), [fx, fz] = H.feet, ahead = 1.35 + hz + 0.2;   // one distance for the floor and the stand, so nothing jumps when the rest place changes
    const cs = Math.cos(face), sn = Math.sin(face), ox = c[0] * sc * cs + c[2] * sc * sn, oz = -c[0] * sc * sn + c[2] * sc * cs;
    const held = [fx + f.x * ahead - ox, height - c[1] * sc, fz + f.z * ahead - oz], from = rest || held, e = kk;
    let d = face - restRy; d = Math.atan2(Math.sin(d), Math.cos(d));
    m.root.position.set(lerp(from[0], held[0], e), lerp(from[1], held[1], e) + 0.35 * Math.sin(Math.PI * e), lerp(from[2], held[2], e));
    m.root.rotation.y = restRy + d * e;
    if (m.shadow) { m.shadow.position.x = m.root.position.x; m.shadow.position.z = m.root.position.z; m.shadow.visible = m.root.position.y < 0.05; }
    const C2 = kit.partPoint(m, part, c), r = [-f.z, f.x], dd = d * (1 - e), hw = Math.abs(hx * Math.cos(dd)) + Math.abs(hz * Math.sin(dd));
    const hy = C2[1] + 0.3;   // above the middle: the fist hangs 0.67 below the wrist, and must stay above a stand's top
    if (grip > 0) { kit.moveHand(0, [C2[0] + r[0] * hw, hy, C2[2] + r[1] * hw], grip); kit.moveHand(1, [C2[0] - r[0] * hw, hy, C2[2] - r[1] * hw], grip); }
  },
  // aside: he comes from the side (that far along the seat, 0.8 in front of it), when something stands in front of it.
  sitOn(m, part, { k = 1, back = 0.1, hands = 1, aside = 0 } = {}) {
    m.root.updateMatrixWorld(true);
    const b = boxOf(m.groups[part]), cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, top = b.max.y, face = m.root.rotation.y;
    const fx = Math.sin(face), fz = Math.cos(face), hd = Math.abs(fx) * (b.max.x - b.min.x) / 2 + Math.abs(fz) * (b.max.z - b.min.z) / 2;
    const ax = Math.cos(face), az = -Math.sin(face), fo = aside ? 0.8 : hd + 1.5;
    const stand = [cx + fx * fo + ax * aside, cz + fz * fo + az * aside], seat = [cx - fx * back, cz - fz * back], e = k * k * (3 - 2 * k);
    if (k < 0) return { stand, face };
    place(lerp(stand[0], seat[0], e), lerp(stand[1], seat[1], e), face, { lean: 0.3 * Math.sin(Math.PI * e) });
    if (e > 0) {
      H.legsPose('sit', e);
      const HP = H.legs[0].hip.getWorldPosition(new THREE.Vector3()), up = top + 0.5 - HP.y;
      if (up > 0) H.root.position.y += up * e;
      if (e > 0.15) H.seat = { m, part };
      const hw = hands * e;
      if (hw > 0) {
        H.root.updateMatrixWorld(true);
        const r = new THREE.Vector3(-1, 0, 0).applyQuaternion(H.root.quaternion), M = H.legs[0].hip.getWorldPosition(new THREE.Vector3()).add(H.legs[1].hip.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        for (const i of [0, 1]) { const sg = i === 0 ? 1 : -1; H.reach(i, [M.x + r.x * 1.45 * sg, top + 0.5, M.z + r.z * 1.45 * sg], hw); }
      }
    }
    return { stand, face };
  },
  typeOn(m, part, t, { at = 0, dur = 2, rate = 5 } = {}) {
    m.root.updateMatrixWorld(true);
    const b = boxOf(m.groups[part]), c = [(b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2], f = kit.fwd(), r = [-f.z, f.x];
    const on = clamp((t - at) / 0.5) * (1 - clamp((t - (at + dur)) / 0.5));
    [0, 1].forEach((i) => { const sg = i === 0 ? 1 : -1, hop = Math.max(0, Math.sin((t - at) * rate * Math.PI + i * Math.PI)) * 0.16;
      if (on > 0) kit.moveHand(i, [c[0] + r[0] * 0.38 * sg - f.x * 0.3, c[1] + 0.38 + hop, c[2] + r[1] * 0.38 * sg - f.z * 0.3], on, false); });   // 0.3 nearer to him: clear of the lid
  },
  pointAt(point, k) {
    const f = kit.fwd(), [fx, fz] = H.feet, hand = (point[0] - fx) * -f.z + (point[2] - fz) * f.x > 0 ? 0 : 1;
    const S = H.arms[hand].shoulder.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(...point).sub(S).normalize();
    const T = S.clone().add(d.multiplyScalar(2.3)); T.y = Math.min(T.y, S.y - 0.75);
    if (k > 0) H.reach(hand, T.toArray(), k);
  },
  // An underhand toss of a ball to a point: on his palm before at, in the air for dur after it.
  toss(ball, t, { hand = 1, at = 1, dur = 0.9, to, height = 2.5 }) {
    const S = H.arms[hand].shoulder.getWorldPosition(new THREE.Vector3()), f = kit.fwd();
    const Hh = [S.x + f.x * 1.45, S.y - 1.0, S.z + f.z * 1.45], Wb = [S.x + f.x * 1.5, S.y - 1.75, S.z + f.z * 1.5], Rf = [S.x + f.x * 1.85, S.y - 0.5, S.z + f.z * 1.85];
    const l3 = (A, B, u) => { const e = u * u * (3 - 2 * u); return [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e]; };
    const P = t < at - 0.7 ? Hh : t < at - 0.25 ? l3(Hh, Wb, (t - (at - 0.7)) / 0.45) : t < at ? l3(Wb, Rf, (t - (at - 0.25)) / 0.25) : l3(Rf, Hh, clamp((t - at) / 0.6));
    H.reach(hand, P, t < at + 0.6 ? 1 : 1 - clamp((t - at - 0.6) / 0.4));
    if (t < at) ball.position.set(P[0], P[1] + 0.25 + BR, P[2]);
    else { const u = clamp((t - at) / dur), A = [Rf[0], Rf[1] + 0.25 + BR, Rf[2]]; ball.position.set(lerp(A[0], to[0], u), lerp(A[1], to[1], u) + 4 * height * u * (1 - u), lerp(A[2], to[2], u)); }
    return Hh;
  },
};
const walkTime = (a, b) => 0.6 + Math.hypot(b[0] - a[0], b[1] - a[1]) / 3.6;
// ---------- walks: the shortest clear path on the floor (the user asked, 2026-11-10) ----------
// Each thing's floor footprint (its box, seen from above) grown by his body (0.6) and a margin (0.3). The path goes
// from his place to the goal through the corners of the grown footprints (a visibility graph, Dijkstra), each corner
// rounded with an arc. He turns on the spot toward the path, walks it forward (the kit's walkPath: one pace, eased only
// at its two ends, facing along the path), and turns on the spot to face the thing.
const GROW = 2.1, NODE = 1.4, ARC = 1.8, TURN = 2.3, PACE = 2.7;   /* GROW: his fists reach about 1.7 from his middle as he walks, plus 0.4 */
function footprints() {
  const out = [], b = new THREE.Box3(), seen = new Set();
  const add = (o) => {
    if (!o || seen.has(o)) return; seen.add(o); if (!o.visible || o.scale.x < 0.01) return;
    o.updateMatrixWorld(true); b.setFromObject(o); if (b.isEmpty() || b.max.y < 0.15) return;   // a floor mark (the rug, the spot) is walked on
    out.push([b.min.x, b.min.z, b.max.x, b.max.z]);
  };
  for (const th of C[5].things) if (th.o !== C[5].ball) add(th.o);   // the ball moves with his hand
  for (const m of [C[5].nails, C[5].canStand, C[5].kickball, C[5].plant, C[5].can]) add(m?.root);
  return out;
}
const grow = (r, g) => [r[0] - g, r[1] - g, r[2] + g, r[3] + g];
const inside = (p, r) => p[0] > r[0] && p[0] < r[2] && p[1] > r[1] && p[1] < r[3];
const boxGap = (p, r) => Math.hypot(Math.max(r[0] - p[0], 0, p[0] - r[2]), Math.max(r[1] - p[1], 0, p[1] - r[3]));
// Does the segment a-b cross the inside of rect r? (Liang-Barsky)
function crosses(a, b, r) {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[2] - a[0]], [-dz, a[1] - r[1]], [dz, r[3] - a[1]]]) {
    if (Math.abs(p) < 1e-12) { if (q <= 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}
// The grown footprints for a walk from a to b: a footprint that holds a or b (a stand point right by its thing) grows
// less, so the point is just outside it.
function obstacles(a, b, G = GROW) {
  // A box is square: the point is outside it when it is out along one axis, so grow the box less than the larger axis gap.
  const axisGap = (p, r) => Math.max(r[0] - p[0], p[0] - r[2], r[1] - p[1], p[1] - r[3]);
  return footprints().map((raw) => { let g = G; for (const p of [a, b]) if (inside(p, grow(raw, g))) g = Math.max(0, axisGap(p, raw) - 0.05); return grow(raw, g); });
}
function planPath(a, b) {
  for (const G of [GROW, 1.2, 0.9]) { const p = planWith(a, b, G); if (p) return p; }   /* no way at full room: try a little less */
  return [a, b];
}
function planWith(a, b, G) {
  const R = obstacles(a, b, G), clear = (p, q) => !R.some((r) => crosses(p, q, r));
  if (clear(a, b)) return [a, b];
  const nodes = [a, b];
  for (const r of R) for (const c of [[r[0] - NODE, r[1] - NODE], [r[2] + NODE, r[1] - NODE], [r[0] - NODE, r[3] + NODE], [r[2] + NODE, r[3] + NODE]]) if (!R.some((q) => inside(c, q))) nodes.push(c);
  const n = nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false); dist[0] = 0;
  for (let guard = 0; guard <= n; guard++) {   /* at most one pass for each node: it can never hang the page */
    let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break; done[u] = true;
    for (let v = 0; v < n; v++) if (!done[v] && v !== u) { const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]); if (d < dist[v] && clear(nodes[u], nodes[v])) { dist[v] = d; prev[v] = u; } }
  }
  if (dist[1] === Infinity) return null;
  const path = []; for (let v = 1; v >= 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}
// Round each corner with an arc (radius up to ARC, less where the legs are short), as dense points for walkPath.
function rounded(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, n, c] = [pts[i - 1], pts[i], pts[i + 1]], l1 = Math.hypot(n[0] - a[0], n[1] - a[1]), l2 = Math.hypot(c[0] - n[0], c[1] - n[1]);
    const d1 = [(n[0] - a[0]) / l1, (n[1] - a[1]) / l1], d2 = [(c[0] - n[0]) / l2, (c[1] - n[1]) / l2], th = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
    if (th < 0.05) { out.push(n); continue; }
    const Rmax = Math.min(ARC, (NODE - 0.4) / (1 / Math.cos(th / 2) - 1));   /* an arc cuts in by R (1 / cos(th / 2) - 1): keep it inside the nodes' margin */
    const tl = Math.min(Rmax * Math.tan(th / 2), 0.45 * l1, 0.45 * l2), rr = tl / Math.tan(th / 2);
    const p0 = [n[0] - d1[0] * tl, n[1] - d1[1] * tl], side = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : -1, nrm = [-d1[1] * side, d1[0] * side], cen = [p0[0] + nrm[0] * rr, p0[1] + nrm[1] * rr];
    const a0 = Math.atan2(p0[1] - cen[1], p0[0] - cen[0]);
    for (let k = 0; k <= 6; k++) { const ang = a0 + side * th * k / 6; out.push([cen[0] + Math.cos(ang) * rr, cen[1] + Math.sin(ang) * rr]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// Points every 0.4 along a path: walkPath's curve (Catmull-Rom) loops back where its points are bunched (an arc
// between two long legs), so it gets evenly spaced ones.
function resample(p, step = 0.4) {
  const L = pathLen(p); if (!(L >= step) || !Number.isFinite(L) || L > 500) return p;   /* a bad path (NaN, endless) is never sampled */
  const n = Math.ceil(L / step), out = [p[0]]; let k = 0, acc = 0;
  for (let j = 1; j < n; j++) {
    const d = j * L / n;
    while (k < p.length - 2 && acc + Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]) < d) { acc += Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]); k++; }
    const sl = Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]) || 1, w = (d - acc) / sl;
    out.push([lerp(p[k][0], p[k + 1][0], w), lerp(p[k][1], p[k + 1][1], w)]);
  }
  out.push(p[p.length - 1]); return out;
}
const pathLen = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const turnDur = (a, b) => 1.5 * Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) / TURN;   /* an eased turn peaks at 1.5 times its mean speed */
// A walk from [x, z, face] to [x, z, face]: a turn on the spot, the path, a turn on the spot.
function makeWalk(from, to) {
  // The last 1.4 is straight, along the way he will face: he arrives walking toward the thing he uses.
  const g = [to[0], to[1]], pre = [to[0] - Math.sin(to[2]) * 1.4, to[1] - Math.cos(to[2]) * 1.4], Rg = obstacles([from[0], from[1]], g);
  const usePre = Math.hypot(g[0] - from[0], g[1] - from[1]) > 2.5 && !Rg.some((r) => inside(pre, r) || crosses(pre, g, r));
  const pts = resample(rounded(usePre ? [...planPath([from[0], from[1]], pre), g] : planPath([from[0], from[1]], g))), L = pathLen(pts);
  if (L < 0.05) { const d = turnDur(from[2], to[2]); return { pts: [[from[0], from[1]], [to[0], to[1]]], L: 0, f0: from[2], f1: to[2], d0: d, T: 0, d1: 0, dur: d, to }; }
  const T = 0.5 + L / PACE, fx = (t) => { let r = null; play.walkPath({ place: (x, z, { face }) => { r = face; }, stride() {}, STEP: 1 }, t, { t0: 0, t1: T, pts }); return r; };
  const dir0 = fx(0), dir1 = fx(T), d0 = turnDur(from[2], dir0), d1 = turnDur(dir1, to[2]);   /* the facing that walkPath itself has at its two ends */
  return { pts, L, straight: Math.hypot(to[0] - from[0], to[1] - from[1]), f0: from[2], f1: to[2], dir0, dir1, d0, T, d1, dur: d0 + T + d1, to };
}
// Where the walk puts him at t, and how he moves (for a stand-in: hero = null).
function walkAt(w, t, hero) {
  const out = { r: null };
  const h = hero || { place: (x, z, { face }) => { out.r = [x, z, face]; }, stride() {}, STEP: 1 };
  if (t < w.d0 || w.T === 0) { const e = sm(0, w.d0 || 1, t); const f = angMix(w.f0, w.dir0 ?? w.f1, e); h.place(w.pts[0][0], w.pts[0][1], { face: f }); if (hero) hero.stride(Math.abs(f - w.f0) * 1.2, 0.18 * Math.sin(Math.PI * e)); return out.r; }
  if (t < w.d0 + w.T) { play.walkPath(h, t - w.d0, { t0: 0, t1: w.T, pts: w.pts }); return out.r; }
  const e = sm(0, w.d1 || 1, t - w.d0 - w.T), f = angMix(w.dir1, w.f1, e), p = w.pts[w.pts.length - 1];
  h.place(p[0], p[1], { face: f }); if (hero) hero.stride(Math.abs(f - w.dir1) * 1.2, 0.18 * Math.sin(Math.PI * e));
  return out.r;
}

// ---------- the play and tool actions of the clay kit (styles/library/clay.js, Phase A), for the page ----------
// Copied from the kit with: kit.partPoint and kit.moveHand for the page's hands, cam for the camera, and the blink after
// settle(). Keep it the same as the kit when the kit changes.
const play = (() => {
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
  const holdTool = (hero, hand, W, grip) => { if (grip > 0) kit.moveHand(hand, W.toArray(), grip); };
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
  return {
    walkPath(hero, t, { t0, t1, pts, face0, face1, amp = 0.55 } = {}) {
      const P = pts.map((p) => new THREE.Vector2(p[0], p[1])), n = P.length - 1, at = (i) => P[clamp(i, 0, n)];
      const cr = (i, u) => { const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2), u2 = u * u, u3 = u2 * u;
        return new THREE.Vector2(0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3)); };
      // Arc length table (the same for every t).
      const tab = [[0, P[0].clone()]]; let L = 0;
      for (let i = 0; i < n; i++) for (let k = 1; k <= 40; k++) { const q = cr(i, k / 40); L += q.distanceTo(tab[tab.length - 1][1]); tab.push([L, q]); }
      const pos = (d) => { let lo = 0, hi = tab.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m][0] < d) lo = m; else hi = m; } const A = tab[lo], B = tab[hi], w = (d - A[0]) / ((B[0] - A[0]) || 1); return A[1].clone().lerp(B[1], clamp(w, 0, 1)); };
      // Distance walked: a trapezoid speed profile (accelerate 20 %, cruise, slow 20 %).
      const T = t1 - t0, u = clamp((t - t0) / T, 0, 1), a = 0.2, vmax = 1 / (1 - a);
      const frac = u < a ? vmax * u * u / (2 * a) : u > 1 - a ? 1 - vmax * (1 - u) * (1 - u) / (2 * a) : vmax * (u - a / 2);
      const speed = u < a ? u / a : u > 1 - a ? (1 - u) / a : 1;
      const d = L * frac, p = pos(d), q = pos(Math.min(L, d + 0.05)), r0 = pos(Math.max(0, d - 0.05));
      let face = Math.atan2(q.x - r0.x, q.y - r0.y);
      const turnTo = (from, to, k) => { let dd = (to - from) % (Math.PI * 2); if (dd > Math.PI) dd -= Math.PI * 2; if (dd < -Math.PI) dd += Math.PI * 2; return from + dd * k; };
      const tt = t - t0;
      if (face0 != null) face = turnTo(face0, face, ease(clamp(tt / 0.6, 0, 1)));
      if (face1 != null) face = turnTo(face, face1, ease(clamp((tt - (T - 0.6)) / 0.6, 0, 1)));
      hero.place(p.x, p.y, { face });
      hero.stride(d * hero.STEP, amp * speed);
      return { x: p.x, z: p.y, face, length: L };
    },
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
      // Weight shift: he leans back a little on the wind-up and forward through the swing, then settles.
      const lw = t < at - 0.3 ? -0.05 * ease(span(t, at - 0.9, 0.6)) : t < at + 0.3 ? -0.05 + 0.11 * ease(span(t, at - 0.3, 0.6)) : 0.06 * (1 - ease(span(t, at + 0.3, 0.6)));
      hero.place(stand[0], stand[1], { face, lean: lw });
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
    // his facing, to choose it). The broom leans into its stand (rest: [x, z] of its head) until at; he takes it there, walks
    // with the head lifted to the strokes, steps along with the pile, walks back, and leans the broom into its stand again.
    // His left hand holds the handle high, his right hand low; the strokes run 2.6 to his right.
    // Walk him to the returned stand point (face) before at. Returns { stand, face, end, pileEnd, rest } (rest: where the
    // broom stands, for the next sweep).
    sweep(hero, broom, pile, t, { at = 1, dur = 4, strokes = 4, from, dist = 2.4, dir = [-1, 0], face, rest, stand, reach = 4.3 } = {}) {
      const s = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
      if (face == null) { const c = new THREE.Vector3(cam.position.x - from[0], 0, cam.position.z - from[1]); const p = new THREE.Vector3(-s.z, 0, s.x); face = Math.atan2(...(p.dot(c) >= 0 ? [p.x, p.z] : [-p.x, -p.z])); }
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
      // At rest it leans into a 'broomStand' (stand: the model; sweep() places it) 1.1 beyond the head, away from him:
      // the handle rests on the stand's hook, 3.5 up, so the broom leans 0.21 rad and cannot fall. Its head's width is
      // along s, so it stays clear of the stand's base.
      const Pst = R.clone().addScaledVector(f, 1.1);
      if (stand) { stand.root.position.set(Pst.x, 0, Pst.z); stand.root.rotation.y = Math.atan2(-f.x, -f.z); if (stand.shadow) { stand.shadow.position.x = Pst.x; stand.shadow.position.z = Pst.z; } }
      const hr = f.clone().multiplyScalar(0.735).add(new THREE.Vector3(0, 3.5, 0)).normalize(), xr = s.clone().addScaledVector(hr, -s.dot(hr)).normalize();
      const rq = basisQ(xr.toArray(), hr.toArray(), xr.clone().cross(hr).toArray()), rp = { Q: rq, W: R.clone().add(V3(G[0]).applyQuaternion(rq)) };
      // Out of the hook: 0.45 toward him and 0.15 up, the same lean; it goes this way first when he takes it.
      const out = { Q: rq, W: rp.W.clone().addScaledVector(f, -0.45).add(new THREE.Vector3(0, 0.15, 0)) };
      let { P, grip, take, busy } = toolPath(t, at, end, rp, swPose, 0.3);
      if (take > 0 && take < 1) { const W = swPose(t < a ? a : b0 + w2); P = take < 0.4 ? mixPose(rp, out, ease(take / 0.4)) : mixPose(out, W, ease((take - 0.4) / 0.6), 0.3); }
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
        holdTool(hero, 1, V3(kit.partPoint(broom, 'handle', G[0])), grip);
        // The right hand comes to the lower grip from his right side (a path across his chest goes into his shirt).
        const k1 = ease(span(t, a - 0.2, 0.6)) * (1 - ease(span(t, b0 + w2 - 0.4, 0.6)));   /* page: 0.4 s later than the kit, when the broom is out of its hook */
        if (k1 > 0) {
          const L = kit.partPoint(broom, 'handle', G[1]), M = Hp(t).addScaledVector(f, 2.0).addScaledVector(r, 1.3).setY(3.2).toArray();
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
      const T = C.clone().addScaledVector(sp, -0.3).setY(1.75), T1 = T.clone().addScaledVector(sp, -0.65).setY(2.1);   /* page: 0.3 higher than the kit, so the hand stays above the grown flower */
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
      const rose = kit.partPoint(can, 'rose', ROSE);
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
      if (sleep > 0) { hero.blendExpression('neutral', 'sleepy', sleep); const bk = ease(span(sleep, 0.5, 0.5)); want.gest = (h) => h.blink(bk); }   // settle() sets the face, then the blink
      return { stand, face };
    },
  };
})();

// ---------- the actions: one entry each ----------
const WAVE = Array.from({ length: 25 }, (_, i) => [-1.6 + 2.8 * i / 24, 4.15 + 0.55 * Math.sin(i / 24 * Math.PI * 2), 0.09]);
const A0W = -35 * D, STEPW = 70 * D, RIM = [-1, 1].map((sx) => [sx * 1.12 * Math.cos(A0W), 4.2 + sx * 1.12 * Math.sin(A0W), 0.62]);
const ACTS = {
  // Carry the box from the floor to the stand (dir 0), or back (dir 1).
  carry: {
    label: 'carry()', objs: () => [C[5].parcel, C[5].stand],
    ends() { const P = W5(...RING.parcel), S = W5(...RING.stand); return [[P[0] - 2.6, P[1], PI2], [S[0] - 2.7, S[1], PI2]]; /* room for his knees when he crouches */ },
    stand(dir) { return this.ends()[dir]; }, end(dir) { return this.ends()[1 - dir]; }, dur: 4.9, commit: 4.2,
    rests() { const P = W5(...RING.parcel), S = W5(...RING.stand); return [[P[0], 0, P[1]], [S[0], PED, S[1]]]; },
    idle(st) { const R = this.rests()[st], m = C[5].parcel; m.root.position.set(...R); m.root.rotation.y = PI2; if (m.shadow) { m.shadow.position.set(R[0], 0.01, R[2]); m.shadow.visible = st === 0; } },
    run(t, dir) {
      const [a, b] = [this.stand(dir), this.end(dir)], R = this.rests(), k = seg(t, 0.6, 1.0) * (1 - seg(t, 3.4, 0.8)), grip = seg(t, 0, 0.6) * (1 - seg(t, 4.2, 0.7));
      const ln = 0.22 * grip * (1 - k), lnA = R[dir][1] > 0 ? ln : 0, lnB = R[1 - dir][1] > 0 ? ln : 0;   // a lean to reach the box where it rests (it comes and goes with the hands)
      if (t < 1.6) { H.pose.rest(); place(a[0], a[1], a[2], { lean: lnA }); }
      else if (t < 3.4) { H.pose.rest(); play.walkPath(H, t - 1.6, { t0: 0, t1: 1.8, pts: [[a[0], a[1]], [b[0], b[1]]], face0: a[2], face1: b[2] }); }
      else { H.pose.rest(); place(b[0], b[1], b[2], { lean: lnB }); }
      kit.carry(C[5].parcel, 'box', { k, grip, rest: t < 2.5 ? R[dir] : R[1 - dir], restRy: PI2 });
      blendFace('neutral', 'thinking', grip);
    },
  },
  // Sit on the bench; a laptop grows on his knees (as the sets grow out of the floor), he types, it goes, he stands up.
  sit: {
    label: 'sitOn() · typeOn()', objs: () => [C[5].bench],
    stand() { const s = kit.sitOn(C[5].bench, 'seat', { k: -1 }); return [s.stand[0], s.stand[1], s.face]; }, end(d) { return this.stand(d); }, dur: 5.6, commit: 99,
    idle() { C[5].laptop.root.scale.setScalar(1e-4); C[5].laptop.root.visible = false; },
    run(t) {
      const sitK = seg(t, 0, 1.1) * (1 - seg(t, 4.6, 1.0)), L = C[5].laptop;
      kit.sitOn(C[5].bench, 'seat', { k: sitK, hands: 1 - seg(t, 1.6, 0.4) + seg(t, 4.1, 0.4) * (1 - seg(t, 4.6, 0.3)) });
      H.root.updateMatrixWorld(true);
      const f = kit.fwd(), M = H.legs[0].hip.getWorldPosition(new THREE.Vector3()).add(H.legs[1].hip.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      const on = seg(t, 1.1, 0.5) * (1 - seg(t, 4.1, 0.5)), k = on <= 0 ? 1e-4 : 0.7 * (on >= 1 ? 1 : back(on));
      L.root.position.set(M.x + f.x * 1.45, M.y + 0.58, M.z + f.z * 1.45); L.root.rotation.y = Math.atan2(f.x, f.z) + Math.PI;
      L.root.scale.setScalar(k); L.root.visible = on > 0;
      kit.typeOn(L, 'keys', t, { at: 1.8, dur: 2.3 });
      blendFace('neutral', 'thinking', seg(t, 1.8, 0.5) * (1 - seg(t, 3.9, 0.5)));
      lookAt(L.root.position, seg(t, 1.1, 0.5) * (1 - seg(t, 4.2, 0.5)));
    },
  },
  // Kneel by the strawberry, point at it, nod.
  kneel: {
    label: "legsPose('kneel') · pointAt()", objs: () => [C[5].berry],
    stand() { const B = W5(...RING.berry); return [B[0] + 3.5, B[1] + 0.6, -1.3]; }, end(d) { return this.stand(d); }, dur: 4.4, commit: 99,
    idle() {},
    run(t) {
      const s = this.stand(), B = W5(...RING.berry), P = [B[0], 1.4, B[1]];
      H.pose.rest(); place(s[0], s[1], s[2]); H.legsPose('kneel', seg(t, 0, 0.9) * (1 - seg(t, 3.5, 0.9)));
      kit.pointAt(P, seg(t, 1.2, 0.5) * (1 - seg(t, 3.0, 0.5)));
      blendFace('neutral', 'smile', seg(t, 1.6, 0.4) * (1 - seg(t, 3.6, 0.5)));
      want.gest = (h) => h.nod(t, { at: 2.0, count: 2 });
      lookAt(new THREE.Vector3(...P), seg(t, 0.4, 0.5) * (1 - seg(t, 3.4, 0.5)));
    },
  },
  // Write a wave on the whiteboard (dir 0), or wipe it off along the same line (dir 1).
  write: {
    label: 'trace()', objs: () => [C[5].board],
    pen(u) { const L = WAVE.length - 1, f = clamp(u) * L, i = Math.min(L - 1, Math.floor(f)), w = f - i, B = W5(...RING.board); return [B[0] + lerp(WAVE[i][0], WAVE[i + 1][0], w), lerp(WAVE[i][1], WAVE[i + 1][1], w), B[1] + 0.09]; },
    Z() { return W5(...RING.board)[1] + 0.09 + 2.2; },   /* room to turn on the spot */
    stand(dir) { return [this.pen(dir)[0] + 1.3, this.Z(), Math.PI]; }, end(dir) { return this.stand(1 - dir); }, dur: 5.1, commit: 4.3,
    idle(st) { C[5].ink(st ? 1 : 0); },
    run(t, dir) {
      const u = seg(t, 0.7, 3.6), uu = dir ? 1 - u : u, k = seg(t, 0, 0.7) * (1 - seg(t, 4.3, 0.8)), P = this.pen(uu);
      H.pose.rest(); place(P[0] + 1.3, this.Z(), Math.PI, { lean: 0.06 }); H.stride((P[0] + 1.3) * H.STEP, 0.25 * seg(t, 0.7, 0.3) * (1 - seg(t, 4.0, 0.3)));
      const scrub = dir ? 0.22 * Math.sin(t * 14) * seg(t, 0.7, 0.3) * (1 - seg(t, 4.0, 0.3)) : 0;
      if (k > 0) kit.moveHand(1, [P[0], P[1] + scrub, P[2]], k);
      C[5].ink(uu);
      blendFace('neutral', 'thinking', k);
      lookAt(new THREE.Vector3(...P), k);
    },
  },
  // Take the ball from the low stand and throw it in a high arc into the basket, where it bounces once and settles
  // (dir 0); take it out of the basket by hand, turn, and put it back on the low stand (dir 1).
  toss: {
    label: 'toss()', objs: () => [C[5].basketStand, C[5].basket, C[5].rack, C[5].ball],
    spots() { const R = W5(...RING.rack), K = W5(...RING.basket); return [[R[0], PED + BR, R[1]], [K[0], PED + BK * 0.12 + BR, K[1]]]; },
    stand(dir) { const R = W5(...RING.rack), K = W5(...RING.basket); return dir ? [K[0] - 3.3, K[1], PI2] : [R[0] + 3.3, R[1], -PI2]; },
    end(dir) { const s = this.stand(dir); return [s[0], s[1], s[2] + Math.PI]; }, dur: 5.1, commit: 1.6,
    idle(st) { C[5].ball.position.set(...this.spots()[st]); },
    run(t, dir) {
      const s = this.stand(dir), [Rs, Ks] = this.spots(), from = dir ? Ks : Rs, ball = C[5].ball, AT = 3.45;
      const grab = seg(t, 0, 0.8), lift = seg(t, 0.8, 0.6), turn = seg(t, 1.4, Math.PI / TURN), face = angMix(s[2], s[2] + Math.PI, turn);
      const lean = 0.42 * grab * (1 - lift) + (dir ? 0.42 * seg(t, 2.6, 0.5) * (1 - seg(t, 3.9, 0.8)) : 0);
      H.pose.rest(); place(s[0], s[1], face, { lean }); H.stride(turn * 2.4, 0.16 * Math.sin(Math.PI * turn));
      H.root.updateMatrixWorld(true);
      const S = H.arms[1].shoulder.getWorldPosition(new THREE.Vector3()), f = kit.fwd(), carryPt = [S.x + f.x * 1.5, S.y - 0.9, S.z + f.z * 1.5];
      const top = [from[0], from[1] + BR + 0.12, from[2]], under = (p) => ball.position.set(p[0], p[1] - BR - 0.12, p[2]);   // the ball under his hand
      if (t < 0.8) { kit.moveHand(1, top, grab); ball.position.set(...from); }
      else if (t < 1.4) {   // up and out (over the basket's rim)
        const p = [lerp(top[0], carryPt[0], lift), lerp(top[1], carryPt[1], lift) + 0.7 * Math.sin(Math.PI * lift), lerp(top[2], carryPt[2], lift)];
        H.hold(1, p, 1); if (dir) under(p); else ball.position.set(p[0], p[1] + lerp(-BR - 0.12, 0.25 + BR, lift), p[2]);
      } else if (!dir) {   // on his palm as he turns, then the throw
        if (t < 2.85) { const Hh = [S.x + f.x * 1.45, S.y - 1.0, S.z + f.z * 1.45]; H.reach(1, Hh, 1); ball.position.set(Hh[0], Hh[1] + 0.25 + BR, Hh[2]); }
        else {
          kit.toss(ball, t, { at: AT, dur: 0.9, to: Ks, height: 1 });
          if (t >= AT) {   // a high arc: its top 3 above the higher end; it lands on the basket's floor, bounces once and settles
            const Rf = [S.x + f.x * 1.85, S.y - 0.5 + 0.25 + BR, S.z + f.z * 1.85], u = clamp((t - AT) / 0.9), hh = Math.max(Rf[1], Ks[1]) + 3.0 - (Rf[1] + Ks[1]) / 2;
            if (u < 1) ball.position.set(lerp(Rf[0], Ks[0], u), lerp(Rf[1], Ks[1], u) + 4 * hh * u * (1 - u), lerp(Rf[2], Ks[2], u));
            else { const b = clamp((t - AT - 0.9) / 0.34); ball.position.set(Ks[0], Ks[1] + 0.22 * Math.sin(Math.PI * b), Ks[2]); }
          }
        }
      } else {   // he holds it as he turns, then puts it down on the low stand and lets go
        const rt = [Rs[0], Rs[1] + BR + 0.12, Rs[2]], down = seg(t, 2.9, 0.9), off = seg(t, 3.8, 1.0);
        if (t < 2.9) { H.hold(1, carryPt, 1); under(carryPt); }
        else if (t < 3.8) { const p = [lerp(carryPt[0], rt[0], down), lerp(carryPt[1], rt[1], down) + 0.4 * Math.sin(Math.PI * down), lerp(carryPt[2], rt[2], down)]; H.hold(1, p, 1); under(p); }
        else { ball.position.set(...Rs); kit.moveHand(1, rt, 1 - off); }
      }
      blendFace('neutral', 'smile', seg(t, dir ? 3.9 : 4.4, 0.4));
      lookAt(ball.position, seg(t, 0, 0.4) * (1 - seg(t, 4.7, 0.4)));
    },
  },
  // Turn the hand wheel a step clockwise (dir 0) or back (dir 1), with both hands on its rim.
  wheel: {
    label: 'grip()', objs: () => [C[5].wheel],
    dir3() { const ry = C[5].wheel.root.rotation.y; return [Math.sin(ry), 0, Math.cos(ry)]; },
    stand() { const m = C[5].wheel, P = RIM.map((p) => kit.partPoint(m, 'wheel', p)), d = this.dir3(); const c = [(P[0][0] + P[1][0]) / 2, (P[0][2] + P[1][2]) / 2]; return [c[0] + d[0] * 2.0, c[1] + d[2] * 2.0, Math.atan2(-d[0], -d[2])]; },
    end(d) { return this.stand(d); }, dur: 3.3, commit: 1.3,
    idle(st) { C[5].wheel.setPose(st * STEPW / PI2); },
    run(t, dir) {
      const a = (dir ? 1 - seg(t, 1.0, 1.4) : seg(t, 1.0, 1.4)) * STEPW, k = seg(t, 0, 0.9) * (1 - seg(t, 2.6, 0.6));   /* the hands come in over 0.9 s */
      C[5].wheel.setPose(a / PI2); H.pose.rest();
      kit.grip(C[5].wheel, 'wheel', RIM, { k, standOff: 2.0, dir: this.dir3(), lean: 0.08 });
      blendFace('neutral', 'thinking', k);
    },
  },
  // Kick the ball to its other place (dir 0: away, dir 1: back). The kit's kick() rolls it about its own centre.
  kick: {
    label: 'kick()', objs: () => [C[5].kickball],
    o(dir) { const A = W5(...KICK[dir]), B = W5(...KICK[1 - dir]), L = Math.hypot(B[0] - A[0], B[1] - A[1]); return { from: A, to: B, spin: dir ? -L / 0.55 : 0, at: 1.0, roll: 2.0 }; },
    stand(dir) { const r = play.kick({ place() {}, touch: [] }, { root: new THREE.Object3D() }, -99, this.o(dir)); /* a stand-in ball: only the numbers */ return [r.stand[0], r.stand[1], r.face]; },
    end(dir) { return this.stand(dir); }, dur: 3.1, commit: 1.0,
    idle(st) { const B = W5(...KICK[st]), A = W5(...KICK[1 - st]), L = Math.hypot(B[0] - A[0], B[1] - A[1]); play.kick({ place() {}, touch: [] }, C[5].kickball, 99, { from: A, to: B, at: 0, roll: 1, spin: st ? 0 : -L / 0.55 }); },
    run(t, dir) {
      const s = this.stand(dir); H.pose.rest(); place(s[0], s[1], s[2]);
      play.kick(H, C[5].kickball, t, this.o(dir));
      blendFace('neutral', 'smile', seg(t, 1.3, 0.4) * (1 - seg(t, 2.6, 0.4)));
      lookAt(C[5].kickball.root.position, seg(t, 0, 0.4) * (1 - seg(t, 2.7, 0.4)));
    },
  },
  // Jump on the spot: a crouch, both feet off the floor, bent arms up, a landing crouch (the kit's jump()).
  jump: {
    label: 'jump()', objs: () => [C[5].spot],
    stand() { const [x, z] = W5(...SPOT); return [x, z, 0]; }, end(d) { return this.stand(d); }, dur: 2.3, commit: 0.6,
    idle() {},
    run(t) { const s = this.stand(); H.pose.rest(); place(s[0], s[1], s[2]); play.jump(H, t, { at: 0.6, x: s[0], z: s[1], face: s[2] }); blendFace('neutral', 'smile', seg(t, 0.6, 0.3) * (1 - seg(t, 1.9, 0.3))); },
  },
  // Lie down on the rug, rest, and get up (the kit's lieDown(), as in chapter 6).
  rest: {
    label: 'lieDown()', objs: () => [C[5].rug],
    stand() { const r = play.lieDown(H, C[5].rug, 0, { k: 0 }); return [r.stand[0], r.stand[1], r.face]; }, end(d) { return this.stand(d); }, dur: 7.4, commit: 99,
    idle() {},
    run(t) { const s = this.stand(), k = seg(t, 0.1, 2.6) * (1 - seg(t, 4.7, 2.6)); H.pose.rest(); place(s[0], s[1], s[2]); play.lieDown(H, C[5].rug, t, { k, sleep: k }); if (k > 0) floorPlant = RUGTOP; },
  },
  // Drive the nail in with three hits (dir 0), or pull it out with the claw (dir 1): the kit's hammer().
  hammer: {
    label: 'hammer()', objs: () => [C[5].nails, C[5].hammer],
    r(t, dir, hero) { return play.hammer(hero || { place() {}, touch: [] }, C[5].hammer, C[5].nails, t, { at: 0.3, mode: dir ? 'pull' : 'drive' }); },
    stand(dir) { const r = this.r(-99, dir); return [r.stand[0], r.stand[1], r.face]; }, end(dir) { return this.stand(dir); },
    get dur() { return this.r(-99, P5.dir).end + 0.2; }, commit: 2.15,
    idle(st) { this.r(-99, st); },
    run(t, dir) { const D = this.dur, s = this.stand(dir); /* both call the helper at t -99 (it puts the tool at rest), so before the real call */ H.pose.rest(); place(s[0], s[1], s[2]); this.r(t, dir, H); blendFace('neutral', 'thinking', seg(t, 0.3, 0.5) * (1 - seg(t, D - 1.2, 0.5))); lookAt(C[5].nails.groups.nail.getWorldPosition(new THREE.Vector3()), seg(t, 0.3, 0.6)); },
  },
  // Water the plant: it grows (state 0), its flower opens (1), and closes (2) again. The kit's water().
  water: {
    label: 'water()', objs: () => [C[5].plant, C[5].can, C[5].canStand],
    eff: ['grow', 'open', 'close'], next: (dir) => (dir === 1 ? 2 : 1),
    r(t, dir, hero) { return play.water(hero || { place() {}, touch: [] }, C[5].can, C[5].plant, t, { at: 0.3, effect: this.eff[dir], drops: C[5].drops, face: 0, rest: this.rest }); },
    stand(dir) { const r = this.r(-99, dir); return [r.stand[0], r.stand[1], r.face]; }, end(dir) { return this.stand(dir); },
    get dur() { return this.r(-99, P5.dir).end + 0.2; }, commit: 99,
    idle(st) { this.r(-99, 0); const P = C[5].plant; P.setPose(st ? 1 : 0); if (st) P.setPose(st === 2 ? 1 : 0, 'bloom'); },
    run(t, dir) { const D = this.dur, s = this.stand(dir); H.pose.rest(); place(s[0], s[1], s[2]); this.r(t, dir, H); blendFace('neutral', 'smile', seg(t, 4, 0.5) * (1 - seg(t, D - 1.5, 0.5))); lookAt(C[5].plant.root.position, seg(t, 1.5, 0.6) * (1 - seg(t, D - 1.2, 0.5))); },
  },
  // Sweep the dust pile to the left with the broom (dir 0), and back to the right (dir 1): the kit's sweep(). The broom
  // leans into its stand, where he takes it and puts it back.
  sweep: {
    label: 'sweep()', objs: () => [C[5].dust, C[5].broom, C[5].broomStand],
    o(dir) {
      const fake = { place() {}, stride() {}, touch: [] }, base = { at: 0.3, dur: 4, strokes: 4, dist: 2.4, face: 0, stand: C[5].broomStand };
      const P0 = W5(3.5, -11.2), first = play.sweep(fake, C[5].broom, C[5].dust, -99, { ...base, from: P0, dir: [-1, 0] });
      return dir ? { ...base, from: first.pileEnd, dir: [1, 0], rest: first.rest } : { ...base, from: P0, dir: [-1, 0] };
    },
    r(t, dir, hero) { return play.sweep(hero || { place() {}, stride() {}, touch: [] }, C[5].broom, C[5].dust, t, this.o(dir)); },
    stand(dir) { const r = this.r(-99, dir); return [r.stand[0], r.stand[1], r.face]; }, end(dir) { return this.stand(dir); },
    get dur() { return this.r(-99, P5.dir).end + 0.2; }, commit: 3.2,
    idle(st) { this.r(-99, st); },
    run(t, dir) { const D = this.dur, s = this.stand(dir); /* both call sweep() at t -99, so before the real call */ H.pose.rest(); place(s[0], s[1], s[2]); this.r(t, dir, H); blendFace('neutral', 'thinking', seg(t, 1.5, 0.5) * (1 - seg(t, D - 1.5, 0.5))); lookAt(C[5].dust.root.position, seg(t, 1.0, 0.6) * (1 - seg(t, D - 1.2, 0.5))); },
  },
};
const ORDER = ['kneel', 'kick', 'sit', 'wheel', 'hammer', 'write', 'sweep', 'toss', 'carry', 'water', 'jump', 'rest'];   // round the ring, for auto-play

// ---------- the action player: idle, walk to X, do X, undo X (a click came in while he was busy) ----------
// Time only: it reads dt, never the scroll. snap() gives what the transitions out of the chapter play back.
const P5 = { mode: 'idle', at: null, face: PI2, act: null, dir: 0, t: 0, w: null, next: null, quiet: 0, last: null, st: {} };
function p5Init() { if (!P5.at) { P5.at = [W5(-6.5, 5.5)[0], W5(-6.5, 5.5)[1]]; P5.face = PI2; for (const k in ACTS) P5.st[k] = 0; } }
function p5Click(name) { P5.next = name; P5.quiet = 0; if (P5.mode === 'do') P5.mode = 'undo'; }
function p5Step(dt) {
  p5Init();
  if (P5.mode === 'idle') {
    P5.quiet += dt;
    if (!P5.next && !still && P5.quiet > 4) { const i = (ORDER.indexOf(P5.last) + 1) % ORDER.length; P5.next = ORDER[i]; }
    if (P5.next) { const A = ACTS[P5.next], g = A.stand(P5.st[P5.next]); P5.w = { ...makeWalk([P5.at[0], P5.at[1], P5.face], g), t: 0 }; P5.act = P5.next; P5.next = null; P5.mode = 'walk'; }
  } else if (P5.mode === 'walk') {
    if (P5.next && P5.next !== P5.act) { const e = p5Exit(P5); P5.at = [e[0], e[1]]; P5.face = e[2]; P5.mode = 'idle'; return p5Step(0); }   /* a new goal: from where he is now */
    P5.next = null; P5.w.t += dt;
    if (P5.w.t >= P5.w.dur) { P5.mode = P5.act ? 'do' : 'idle'; P5.t = 0; P5.dir = P5.st[P5.act]; P5.at = [P5.w.to[0], P5.w.to[1]]; P5.face = P5.w.to[2]; P5.quiet = 0; }   /* a walk with no action (the checks) ends idle */
  } else if (P5.mode === 'do' || P5.mode === 'undo') {
    const A = ACTS[P5.act], back = P5.mode === 'undo' && P5.t < A.commit;
    P5.t += (P5.mode === 'undo' ? 2 : 1) * dt * (back ? -1 : 1);
    if (back && P5.t <= 0) { P5.t = 0; const s = A.stand(P5.dir); P5.at = [s[0], s[1]]; P5.face = s[2]; P5.mode = 'idle'; P5.quiet = 0; }
    else if (!back && P5.t >= A.dur) { const e = A.end(P5.dir); P5.st[P5.act] = A.next ? A.next(P5.dir) : 1 - P5.dir; P5.at = [e[0], e[1]]; P5.face = e[2]; P5.last = P5.act; P5.mode = 'idle'; P5.quiet = 0; }
  }
}
// Draw him and every object from a state of the player (live, or a snapshot played back by the scroll).
// f (0 to 1): how far the clean ending of a busy action has got (undo, as for a click).
const busy = (p) => p.mode === 'do' || p.mode === 'undo';
function walkDraw(w) { H.pose.rest(); walkAt(w, w.t, H); }
function stAfter(p, f) { const st = { ...p.st }, A = ACTS[p.act]; if (busy(p) && f >= 1 && p.t >= A.commit) st[p.act] = A.next ? A.next(p.dir) : 1 - p.dir; return st; }
function p5Draw(p, f = 0) {
  const st = stAfter(p, f), mid = busy(p) && f < 1 && H;
  for (const k in ACTS) if (!(mid && p.act === k)) ACTS[k].idle(st[k]);
  if (!H) return;
  if (mid) { const A = ACTS[p.act], tt = p.t < A.commit ? lerp(p.t, 0, f) : lerp(p.t, A.dur, f); A.run(clamp(tt, 0, A.dur - 1e-3), p.dir); }
  else if (p.mode === 'walk') walkDraw(p.w);
  else { const e = p5Exit(p); H.pose.rest(); place(e[0], e[1], e[2]); }
}
// Where he ends up after the clean ending of a snapshot: [x, z, face].
function p5Exit(p) {
  if (p.mode === 'do' || p.mode === 'undo') { const A = ACTS[p.act]; return p.t < A.commit ? A.stand(p.dir) : A.end(p.dir); }
  if (p.mode === 'walk') return walkAt(p.w, p.w.t);
  return [p.at[0], p.at[1], p.face];
}
const snap = () => JSON.parse(JSON.stringify({ mode: P5.mode, at: P5.at, face: P5.face, act: P5.act, dir: P5.dir, t: P5.t, w: P5.w, st: P5.st }));
let rec5 = null;   // the player's state when the scroll left the chapter
window.__clayPlayer = { click: (n) => p5Click(n), state: () => snap(), acts: () => Object.keys(ACTS), stand: (n) => ACTS[n].stand(P5.st[n]), dur: (n) => ACTS[n].dur,
  reset: (x, z, face = 0) => { p5Init(); Object.assign(P5, { mode: 'idle', at: [x, z], face, next: null, quiet: 0, act: null, w: null }); }, w5: W5,
  plan: (a, b) => ({ raw: footprints().map((r) => r.map((v) => +v.toFixed(2))), path: planPath(a, b).map((p) => p.map((v) => +v.toFixed(2))) }),
  face: () => { const w = P5.w; return w ? walkAt(w, w.t)[2] : P5.face; },
  walkTo: (x, z, face) => { P5.w = { ...makeWalk([P5.at[0], P5.at[1], P5.face], [x, z, face]), t: 0 }; P5.act = null; P5.mode = 'walk'; return { L: P5.w.L, straight: P5.w.straight, dur: P5.w.dur }; } };

// ---------- the 12-moves set ----------
const labelEl = $('.act-label');
C[5] = {
  get start() { const e = rec5 ? p5Exit(rec5) : [W5(-6.5, 5.5)[0], W5(-6.5, 5.5)[1], PI2]; return e; },
  end: [0, 0, 0], next: 'rug',
  build() {
    const at = (n, o = {}) => { const [x, z] = W5(...RING[n]); return { x, z, ...o }; };
    this.berry = model('strawberry', at('berry', { k: 0.8 }));
    this.bench = model('bench', at('bench', { ry: PI2 }));
    this.laptop = model('laptop', { ...at('bench'), k: 0.7, floor: false }); this.laptop.setPose(0);
    this.wheel = model('handwheel', at('wheel', { ry: Math.atan2(-RING.wheel[0], -RING.wheel[1]) }));
    this.board = model('whiteboard', at('board'));
    this.basketStand = model('pedestal', at('basket')); this.basket = model('basket', { ...at('basket'), y: PED, k: BK, floor: false });
    this.rack = model('pedestal', at('rack'));
    this.parcel = model('parcel', at('parcel', { ry: PI2 })); this.stand = model('pedestal', at('stand'));
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 32, 20), new THREE.MeshPhysicalMaterial({ color: '#cf4f45', roughness: 0.5, sheen: 0.2 })); put(this.ball);
    Object.assign(this.ball.userData, { part: 'ball', pv: [0, 0, 0], f: (x, y, z) => Math.hypot(x, y, z) - BR });
    this.rug = model('rug', at('rug'));
    this.nails = model('nailboard', at('nails', { ry: -PI2 }));   /* he works side on to the camera, so the hammer shows */ this.hammer = model('hammer', { ...at('nails'), floor: false });
    this.dust = model('dust', at('board')); this.broomStand = model('broomStand', at('board')); this.broom = model('broom', { ...at('board'), floor: false });   /* sweep() places all three */
    this.plant = model('plant', at('plant', { ry: 0.63 }));   /* a gap between two petals faces his hand */ this.can = model('wateringCan', { ...at('plant'), floor: false });
    this.drops = Array.from({ length: 6 }, () => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshPhysicalMaterial({ color: '#7fb3e0', roughness: 0.2 })); d.scale.setScalar(1e-4); put(d); return d; });
    { const ra = ACTS.water.r(-99, 0).restAt; ACTS.water.rest = [ra[0], ra[1], ra[2] + 0.3]; this.canStand = model('pedestal', { x: ra[0], z: ra[2] + 0.3 }); }   /* 0.3 further: room for his right hand as he arrives */
    { const [x, z] = W5(...KICK[0]); this.kickball = model('kickball', { x, z }); }
    { const [x, z] = W5(...SPOT); this.spot = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 48), new THREE.MeshPhysicalMaterial({ color: '#e4d3b7', roughness: 0.8, sheen: 0.3 })); this.spot.position.set(x, 0.02, z); put(this.spot);
      Object.assign(this.spot.userData, { part: 'floor', pv: [0, 0, 0], f: (px, py, pz) => Math.max(Math.hypot(px, pz) - 1.0, Math.abs(py) - 0.02) }); }   // 9.6 by 3.8, top y 0.08; parts floor, floorStripes (he may stand on it)
    // The ink on the whiteboard: a canvas on its face, drawn up to the pen.
    const c = document.createElement('canvas'); c.width = 1040; c.height = 600; this.inkC = c;
    this.inkT = new THREE.CanvasTexture(c); this.inkT.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.0), new THREE.MeshBasicMaterial({ map: this.inkT, transparent: true, depthWrite: false }));
    m.position.set(0, 4.55, 0.0815); this.board.groups.board.add(m); this.inkU = -1;
    // Which action each thing starts (a click on it), for the hover label and the hit test.
    this.things = [];
    for (const [name, A] of Object.entries(ACTS)) for (const o of A.objs()) this.things.push({ name, o: o.root || o });
    p5Init();
  },
  ink(u) {
    if (Math.abs(u - this.inkU) < 1e-4) return; this.inkU = u;
    const x = this.inkC.getContext('2d'); x.clearRect(0, 0, 1040, 600); x.strokeStyle = '#2b4c9b'; x.lineWidth = 14; x.lineCap = x.lineJoin = 'round';
    const N = Math.floor(u * 400); x.beginPath();
    for (let j = 0; j <= N; j++) { const q = ACTS.write.pen(j / 400), B = W5(...RING.board); const X = (q[0] - B[0] + 2.6) / 5.2 * 1040, Y = (1 - (q[1] - 3.05) / 3.0) * 600; j ? x.lineTo(X, Y) : x.moveTo(X, Y); }
    if (N > 0) x.stroke(); this.inkT.needsUpdate = true;
  },
  // The 11 other things sink into the floor before he lies down (k 1 shown, 0 gone); the rug stays.
  sink(k) {
    const e = k * k * (3 - 2 * k);   // no overshoot: a stand that grew past its size would go into the ball
    for (const th of this.things) { const o = th.o; o.userData.home ??= o.position.clone(); }
    for (const o of [this.kickball, this.nails, this.hammer, this.plant, this.can, this.canStand, this.dust, this.broom, this.broomStand, this.berry, this.bench, this.wheel, this.board, this.basketStand, this.basket, this.rack, this.parcel, this.stand].map((m) => m.root).concat(this.ball, this.spot)) {
      o.scale.setScalar(Math.max(e, 0.002) * (o.userData.k0 ??= o.scale.x)); o.visible = e > 0.002;
    }
    for (const m of [this.kickball, this.nails, this.plant, this.canStand, this.dust, this.broomStand, this.berry, this.bench, this.wheel, this.board, this.basketStand, this.basket, this.rack, this.parcel, this.stand]) if (m.shadow) m.shadow.material.opacity = 0.4 * e;
  },
  // The thing under a screen point: screen boxes of each thing, 24 px larger, at least 48 by 48.
  pick(x, y) {
    let best = null, bd = 1e9; const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const th of this.things) {
      th.o.updateMatrixWorld(true); b.setFromObject(th.o); if (b.isEmpty()) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) { const [sx, sy] = toScreen(v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(24, (x1 - x0) / 2 + 24), hh = Math.max(24, (y1 - y0) / 2 + 24);
      if (Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { ...th, top: [cx, y0] }; } }
    }
    return best;
  },
  act(t) {
    const live = state.i === 5 && state.u === 0;
    if (live) { if (H) { p5Step(dt); p5Draw(P5); rec5 = snap(); } else p5Draw(P5); }
    else if (!(state.i === 5 && state.u > 0)) p5Draw(rec5 || P5, 1);
    this.sink(1);
    if (H || !live) this.steer(live && !!H);
  },
  // The camera: the whole ring while he walks; during an action it eases in to frame him and the thing he uses, and
  // eases back out when it ends (damped on time; reduced motion: always the whole ring).
  zoom: 0, cv: null,
  wide() { return { at: [SC[0] + 0.5 * SPREAD, 4.2, SC[1] - 1.5 * SPREAD], dist: 57 * SPREAD, az: -4 + 3 * pn.x, el: 24 - 2 * pn.y, sx: 0.14, sy: 0.21 }; },
  close() {
    const A = ACTS[P5.act], o = A?.objs()[0], q = o ? (o.root || o).getWorldPosition(new THREE.Vector3()) : null, h = H ? H.root.getWorldPosition(new THREE.Vector3()) : null;
    if (!q || !h) return null;
    const span = Math.hypot(q.x - h.x, q.z - h.z);
    return { at: [(q.x + h.x) / 2, 3.6, (q.z + h.z) / 2], dist: clamp(1.3 * span + 26, 28, 40), az: (A.view ?? -4) + 2 * pn.x, el: 16 - 2 * pn.y, sx: 0.12, sy: 0 };   /* he and the thing whole on the screen */
  },
  steer(live) {
    const want = live && !still && P5.act && (P5.mode === 'do' || P5.mode === 'undo') ? 1 : 0, c = want ? this.close() : null;
    this.zoom = damp(this.zoom, want, 1.6);
    if (c) this.cv = this.cv ? { ...c, at: this.cv.at.map((v, i) => damp(v, c.at[i], 2.5)), dist: damp(this.cv.dist, c.dist, 2.5), az: damp(this.cv.az, c.az, 2.5) } : c;
    if (this.zoom < 0.002) { this.zoom = 0; if (!want) this.cv = null; }
    // The statement fades while the camera is close, so it never sits over the action.
    if (this.zoom > 0) { const op = +chs[5].style.opacity * (1 - 0.9 * sm(0, 0.6, this.zoom)); chs[5].style.opacity = op; }
  },
  shot(t) {
    const w = this.wide(), c = this.cv, z = this.zoom * this.zoom * (3 - 2 * this.zoom);
    if (!c || z <= 0) return w;
    return { at: w.at.map((v, i) => lerp(v, c.at[i], z)), dist: lerp(w.dist, c.dist, z), az: lerp(w.az, c.az, z), el: lerp(w.el, c.el, z), sx: lerp(w.sx, c.sx, z), sy: lerp(w.sy, c.sy, z) };
  },
};
// The walk in from the cart (4 to 5): to where the player left him, then his action plays back to where it was.
const VIA5 = () => [W5(-12.5, 6.5)];   /* in the camera's view all the way */
function into5(s) {
  const p = rec5, e = C[5].start, a = C[4].end;
  if (p && busy(p) && s.u > 0.85) { p5Draw(p, 1 - sm(0.85, 1, s.u)); return; }
  if (p) p5Draw(p, 1);   // the objects as he left them
  // To the ring's edge, then the shortest clear path to where he was.
  const v = VIA5()[0], key = `${e.join()}`;
  if (into5.key !== key) { into5.key = key; const pts = resample(rounded([[a[0], a[1]], ...planPath([v[0], v[1]], [e[0], e[1]])])), leg = { dir1: Math.atan2(pts.at(-1)[0] - pts.at(-2)[0], pts.at(-1)[1] - pts.at(-2)[1]) };   /* one path, its corner at the ring's edge rounded too */ into5.w = { pts, L: pathLen(pts), f0: a[2], f1: e[2], dir0: Math.atan2(pts[1][0] - a[0], pts[1][1] - a[1]), dir1: leg.dir1 ?? e[2], d0: turnDur(a[2], Math.atan2(pts[1][0] - a[0], pts[1][1] - a[1])), T: 0.5 + pathLen(pts) / PACE, d1: turnDur(leg.dir1 ?? e[2], e[2]) }; into5.w.dur = into5.w.d0 + into5.w.T + into5.w.d1; }
  H.pose.rest(); walkAt(into5.w, Math.min(1, s.u / 0.85) * into5.w.dur, H);
  blendFace('neutral', 'smile', 0.5);
}
// From the ring to the rug (5 to 6): he ends what he does, walks to the rug, and yawns.
const RUGSTAND = () => { const r = play.lieDown(H, C[5].rug, 0, { k: 0 }); return [r.stand[0], r.stand[1], r.face]; };
function outOf5(s) {
  const p = rec5 || snap(), e = p5Exit(p), r = RUGSTAND(), k = 1 - sm(0.3, 0.7, s.u);
  if (s.u < 0.25 && busy(p)) { p5Draw(p, s.u / 0.25); C[5].sink(k); return; }
  p5Draw({ ...p, mode: 'idle', st: stAfter(p, 1), at: [e[0], e[1]], face: e[2] }, 1); C[5].sink(k);
  const key = `${e.join()}|${r.join()}`;
  if (outOf5.key !== key) { outOf5.key = key; C[5].sink(1); outOf5.w = makeWalk(e, r); C[5].sink(k); }   /* planned with all the things standing */
  H.pose.rest(); walkAt(outOf5.w, clamp((s.u - 0.25) / 0.55) * outOf5.w.dur, H);
  blendFace('neutral', 'sleepy', sm(0.8, 1, s.u));
}

// 6. Nothing renders until the checks pass: he lies down on the rug, and the console of "make look" checks his pose
// on every frame, with its real measures; when they pass, he falls asleep. The way out is his dream (chapter 7).
// He lies or sits on the floor: after settle() has eased his joints, his lowest point (any part) is set on the floor.
let floorPlant = null, floorLast = null;
function lowest() { H.root.updateMatrixWorld(true); let lo = 1e9; const v = new THREE.Vector3(); for (const sh of H.shapes) { const p = sh.geometry?.attributes.position; if (!p) continue; for (let i = 0; i < p.count; i += 7) { v.fromBufferAttribute(p, i).applyMatrix4(sh.matrixWorld); if (v.y < lo) lo = v.y; } } return lo; }
function plantFloor() {
  if (floorPlant === null || !H) { floorLast = null; return; }
  H.root.position.y += floorPlant - lowest(); H.root.updateMatrixWorld(true);
  floorLast = { want: floorPlant, low: lowest() }; floorPlant = null;
}
window.__clayFloor = () => floorLast;
const consoleEl = $('.console'), lineEls = [...document.querySelectorAll('.console .line')];
const RUGTOP = 0.08;
C[6] = {
  get start() { return RUGSTAND(); }, end: [0, 0, 0], next: 'dream',
  build() {
    this.msgs = ['', '', '']; this.oks = [null, null, null];
    // The dream: three puffs and a round bubble in chapter 7's colour (in the scene, not a set).
    const clay = new THREE.MeshPhysicalMaterial({ color: '#f0e7d6', roughness: 0.6, sheen: 0.3 });
    this.puffs = [0.22, 0.34, 0.5].map((r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), clay); m.visible = false; scene.add(m); return m; });
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshBasicMaterial({ color: chs[7].dataset.bg, side: THREE.DoubleSide, toneMapped: false, transparent: true }));
    this.edge = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshPhysicalMaterial({ color: '#f0e7d6', roughness: 0.6, side: THREE.BackSide }));
    // Drawn over the world: as it grows, it covers him and then the whole screen.
    this.bubble.material.depthTest = false; this.bubble.renderOrder = 12; this.edge.material.depthTest = false; this.edge.renderOrder = 11;
    this.bubble.visible = this.edge.visible = false; scene.add(this.bubble, this.edge);
  },
  hip() { const r = RUGSTAND(); return [r[0], r[1]]; },
  // The checks: real measures of his pose against the rug.
  checks() {
    H.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(); let torsoLow = 1e9, deep = 0;
    const R = C[5].rug.groups.floor, inv = R.matrixWorld.clone().invert(), pv = R.userData.pv, f = (x, y, z) => R.userData.f(x + pv[0], y + pv[1], z + pv[2]);
    for (const sh of H.shapes) {
      const p = sh.geometry?.attributes.position; if (!p) continue; const torso = /^(shirt|hip|collar)/.test(sh.userData.part);
      for (let i = 0; i < p.count; i += 29) { v.fromBufferAttribute(p, i).applyMatrix4(sh.matrixWorld); if (torso && v.y < torsoLow) torsoLow = v.y; const q = v.clone().applyMatrix4(inv); const d = f(q.x, q.y, q.z); if (d < -deep) deep = -d; }
    }
    const gap = torsoLow - RUGTOP, hands = [0, 1].filter((i) => { const m = H.shapes.find((x) => x.userData.part === `hand${i}`); return m && boxOf(m).min.y < RUGTOP + 0.35; }).length;   // the lowest point of each hand on the rug
    return [
      gap > 0.4 ? [`his back is ${gap.toFixed(2)} above the rug`, false] : ['he lies flat on the rug', true],   // his head rests on his hair, so his back is a little above
      deep > 0.04 ? [`a part of him goes ${deep.toFixed(2)} into the rug`, false] : ['no part of him goes into the rug', true],
      hands < 2 ? [`${2 - hands} hand${hands === 1 ? '' : 's'} not on the rug yet`, false] : ['both hands rest on the rug', true],
    ];
  },
  act(t) {
    const live = state.i === 6 && state.u === 0;
    const p = rec5 || snap(); p5Draw({ ...p, mode: 'idle', st: stAfter(p, 1), at: [0, 0], face: 0 }, 1);
    C[5].sink(0);
    if (!H) return;
    H.pose.rest();
    play.lieDown(H, C[5].rug, still ? 0 : now() / 1000, { k: sm(0, 0.5, t), sleep: sm(0.82, 0.95, t) });   // breathing from the clock
    if (t > 0) floorPlant = RUGTOP;
    lookAt(null, 0);
    this.console(live);
  },
  // The console: real measures of his pose as drawn now, on every frame it shows (also while the chapter fades in).
  console(live) {
    const hero = H || __clayHero(); if (!hero) return; const keep = H; H = hero;
    // The console, at the top right of the set, over everything.
    const res = this.checks(), bw = consoleEl.offsetWidth, [hx, hy] = toScreen(H.head.getWorldPosition(new THREE.Vector3()));
    // Beside him, never over him: right of his head (or left of it when the right has no room), at his head's height.
    const bh = consoleEl.offsetHeight, gap = Math.max(140, innerWidth * 0.11), right = hx + gap + bw < innerWidth - 16;
    let bx = clamp(right ? hx + gap : hx - gap - bw, 16, innerWidth - bw - 16), by = clamp(hy - bh - 60, 90, innerHeight - bh - 16);
    if (innerWidth > 700) { bx = innerWidth - bw - 70; by = innerHeight - bh - 60; }   /* wide: the bottom right, below his feet, clear of him and of the statement */
    consoleEl.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
    res.forEach(([text, ok], i) => {
      const el = lineEls[i], msg = $('.msg', el);
      if (msg.textContent !== text) { const kind = text.replace(/[0-9.]+/g, '#'); msg.textContent = text; if (kind !== this.msgs[i]) { this.msgs[i] = kind; msg.getAnimations().forEach((a) => a.cancel()); msg.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' }); } }
      if (ok !== this.oks[i]) { this.oks[i] = ok; el.classList.toggle('ok', ok); }
    });
    consoleEl.classList.toggle('ok', res.every((r) => r[1]) && live);
    H = keep;
  },
  // The dream at u (0 to 1 of the transition to chapter 7): puffs, then a bubble that grows round the camera.
  bubbleAt(u) {
    const head = H ? H.head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(this.hip()[0] - 4, 0.6, this.hip()[1]);
    const c = head.clone().add(new THREE.Vector3(-0.8, 5.6, 1.0)), r = 0.05 + 2.4 * sm(0.12, 0.32, u) + 60 * sm(0.4, DREAM_CUT, u) ** 2;
    return { head, c, r };
  },
  dream(u) {
    const on = u > 0 && u < DREAM_CUT, { head, c, r } = this.bubbleAt(u);
    this.puffs.forEach((m, i) => { const k = sm(0.02 + i * 0.05, 0.08 + i * 0.05, u) * (1 - sm(0.34, 0.4, u)); m.visible = on && k > 0.01; m.scale.setScalar(Math.max(k, 0.01)); m.position.copy(head).add(new THREE.Vector3(0, 2.0, 0.9)).lerp(c, 0.12 + i * 0.22);   /* above and in front of his head, clear of it */ });
    this.bubble.visible = on && r > 0.06; this.bubble.position.copy(c); this.bubble.scale.setScalar(r);
    this.edge.visible = this.bubble.visible && u < 0.42; this.edge.position.copy(c); this.edge.scale.setScalar(r * 1.035);
    // After the cut, the bubble is round the camera and opens: the first frame after the cut is all chapter 7's
    // colour, as the last frame before it, and the film set shows through as it fades (0.62 to 0.7).
    const cover = u >= DREAM_CUT && u < 1 ? 1 - sm(DREAM_CUT, 0.7, u) : 0;
    this.bubble.material.opacity = 1;
    if (cover > 0) { this.bubble.visible = true; this.bubble.position.copy(cam.position); this.bubble.scale.setScalar(5); this.bubble.material.opacity = cover; }
    // (No film frames in the bubble: JJ asked for the bubble to open onto him holding the roll.)
  },
  shot(t) { const [x, z] = this.hip(); return { at: [x - 1.6, 1.8, z], dist: 26, az: 4 + 3 * pn.x, el: 26 - 2 * pn.y, sx: 0.14, sy: 0.12 }; },
};
const DREAM_CUT = 0.62;   // the dream's cut: the camera is inside the bubble, so the screen is chapter 7's colour
let cutSide = -1;   // 0: chapter 6 and the dream before the cut; 1: after it
// A cut: settle() starts again from the pose that the chapter asks for now, so nothing eases across the cut.
function unease() {
  ease.q.clear(); ease.p = null; ease.face = null; gaze.k = want.look ? want.look.k : 0;
  hands.forEach((h, i) => { const w = want.hands[i]; h.k = w ? w.k : 0; h.p = w ? w.p.clone() : null; h.last = h.p && h.p.clone(); h.glide = false; });
}

// 7. The result is a real MP4: a film strip rolls out of his hands, from the title card of the visitor's own
// topic to frames of six finished videos. A click brings a frame to the camera and plays it.
const CLIPS = ['bayes', 'ruler', 'knn', 'robot', 'lever', 'servo'];
const FW = 7.2, FH = 4.05, GAP = 8.1;
// He holds a film spool by its rim, and the strip comes out of it. He stands behind the end of the strip.
const SPOOL = [FX + 9.0, 4.6, 0], STAND = [FX + 11.0, -1.0], SFACE = Math.atan2(SPOOL[0] - STAND[0], SPOOL[2] - STAND[1]);
C[7] = {
  start: [...STAND, SFACE], end: [...STAND, SFACE],
  build() {
    film = this;
    this.strip = new THREE.Group(); put(this.strip);
    const plateGeo = new THREE.BoxGeometry(GAP, FH + 1.1, 0.12), plateMat = new THREE.MeshPhysicalMaterial({ color: '#1c1d24', roughness: 0.5 });
    const holeGeo = new THREE.BoxGeometry(0.32, 0.22, 0.14),   // through the plate, so the holes show on both faces
           holeMat = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.7 });
    this.title = card(FW, FH, (g, w, h) => {
      g.fillStyle = '#e4d3b7'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#57534c'; g.font = `700 ${h * 0.065}px "Plus Jakarta Sans"`; g.fillText('CLAYDUCATION', w * 0.07, h * 0.18);
      g.fillStyle = '#26262a'; g.font = `800 ${h * 0.12}px "Plus Jakarta Sans"`;
      const tt = topic.charAt(0).toUpperCase() + topic.slice(1), lines = [''];
      for (const wd of tt.split(' ')) { const l = lines.at(-1) + (lines.at(-1) ? ' ' : '') + wd; if (g.measureText(l).width > w * 0.84 && lines.at(-1)) lines.push(wd); else lines[lines.length - 1] = l; }
      lines.slice(0, 3).forEach((l, i) => g.fillText(l, w * 0.07, h * (0.34 + i * 0.14)));
      g.fillStyle = '#d6336c'; g.fillRect(w * 0.07, h * 0.82, w * 0.22, h * 0.025);
    }, { px: 2048 });
    const loader = new THREE.TextureLoader();
    const pics = [this.title, ...CLIPS.map((c) => {
      // Sent to the GPU as soon as it loads, so the first frame that shows it does not stall.
      const tex = loader.load(`film/${c}.jpg`, (q) => R.initTexture(q)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.poster = tex; m.clip = c; return m;
    })];
    this.cells = pics.map((pic, i) => {
      const cell = new THREE.Group(), holes = new THREE.InstancedMesh(holeGeo, holeMat, 24), m4 = new THREE.Matrix4();
      for (let k = 0; k < 12; k++) for (const [y, nn] of [[-(FH / 2 + 0.33), 0], [FH / 2 + 0.33, 1]]) holes.setMatrixAt(k * 2 + nn, m4.makeTranslation(-GAP / 2 + 0.35 + k * 0.68, y, 0));
      pic.position.z = 0.07; cell.add(new THREE.Mesh(plateGeo, plateMat), holes, pic); cell.i = i; pic.lift = 0;
      this.strip.add(cell); return cell;
    });
    this.pics = pics; R.initTexture(this.title.material.map);
    this.strip.position.set(0, 4.6, 0);
    shadow(16, 3, FX, 0, 0.3);
    // The roll: the film is rolled up round a tall core, and the strip comes out of it. The part of the strip
    // that is still in the roll is cut off by a clipping plane through the roll's middle.
    this.spool = filmRoll(); this.spool.position.set(...SPOOL); put(this.spool);
    this.balloon = balloon(); put(this.balloon.root);
    this.cut = new THREE.Plane(new THREE.Vector3(-1, 0, 0), SPOOL[0]);
    for (const m of [plateMat, holeMat, ...pics.map((q) => q.material)]) m.clippingPlanes = [this.cut];
    // His hands hold the roll on its side towards him (H.hold in act, as the roll gets thinner).
    this.d = new THREE.Vector2(STAND[0] - SPOOL[0], STAND[1] - SPOOL[2]).normalize(); this.p = new THREE.Vector2(Math.cos(SFACE), -Math.sin(SFACE));
    // The clips load now, so a selected frame plays at once.
    for (const pic of pics) if (pic.clip) {
      pic.video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'auto', src: `film/${pic.clip}.mp4` });
      pic.vtex = Object.assign(new THREE.VideoTexture(pic.video), { colorSpace: THREE.SRGBColorSpace });
    }
  },
  act(t) {
    // The strip rolls out (0.04 to 0.62); a balloon comes in at the top right (0.62), the wind takes it (0.79)
    // and then the roll out of his hands (0.84); he reaches after it, leans, lets his arms fall, and smiles.
    // The strip never leaves the roll: at the end, the right edge of its last frame is still inside it.
    // When the wind takes the roll (0.79 to 0.9), the film rolls back into it fast, as it shakes and flies off.
    const out = FX + 8.8, RMAX = out + (CLIPS.length - 0.1) * GAP - SPOOL[0] - 0.4, R0 = out - 1.1 * GAP - SPOOL[0] - 0.3;
    const rollOut = (still ? 0.5 : sm(0.04, 0.62, t)) * RMAX, roll = lerp(rollOut, R0, sm(0.79, 0.9, t));
    this.cells.forEach((c) => {
      const x = out - GAP * 0.6 - roll + c.i * GAP;
      c.position.set(x, 0, 0); c.visible = x - GAP / 2 < SPOOL[0];   // in the strip's own frame, the roll is always at SPOOL
    });
    this.pics.forEach((p) => {
      // A selected frame shows its clip as soon as the clip has a frame to show (its first frame is the poster).
      if (p.video && p.material.map !== (focus.obj === p && p.video.readyState >= 2 ? p.vtex : p.poster)) { p.material.map = focus.obj === p && p.video.readyState >= 2 ? p.vtex : p.poster; p.material.needsUpdate = true; }
      if (focus.obj === p) return;
      p.position.z = 0.07; p.scale.setScalar(1);   // a frame does not move on hover (the pointer shows that it can be selected)
    });
    // The roll gets thinner as the film comes out. The cut is in world units: the set grows and sinks (morph).
    const rc = still ? 0.4 : 0.55 - 0.27 * clamp(roll / RMAX); this.spool.scale.set(rc, 1, rc);   // fat again as the film goes back in
    const live = state.i === 7 && state.u === 0;
    // The balloon: in from the right, it bobs at the top right; the gust takes it off to the left.
    const B = this.balloon, gust = clamp((t - 0.79) / 0.11), bIn = sm(0.62, 0.76, t);
    B.root.visible = live && t > 0.62 && gust < 1;
    if (B.root.visible) {
      const rest = worldAt(innerWidth * 0.8, innerHeight * 0.2), from = worldAt(innerWidth + 160, innerHeight * 0.1), to = worldAt(-220, innerHeight * 0.08);
      const k = B.root.position.copy(from).lerp(rest, 1 - (1 - bIn) ** 3);
      k.y += 0.35 * Math.abs(Math.sin(now() / 380)) * (1 - gust);
      if (gust > 0) { k.lerp(to, gust * gust); k.y += Math.sin(gust * Math.PI) * 0.8; }
      B.root.rotation.z = 0.45 * sm(0, 0.4, gust) + 0.12 * Math.sin(now() / 700) * (1 - gust);
      B.hang(new THREE.Vector3(0.4 + 2.2 * sm(0, 0.3, gust) + 0.3 * Math.sin(now() / 520), -2.9 + 0.8 * sm(0, 0.3, gust), 0));
    }
    // The roll: the wind tugs at it, then it flies off to the left, turning over.
    const fly = clamp((t - 0.84) / 0.1), tug = bump(0.79, 0.86, t) * (still ? 0 : 1);
    this.spool.visible = fly < 1;
    const exit = live ? worldAt(-320, innerHeight * 0.3) : new THREE.Vector3(FX - 16, 8, 0);
    this.spool.position.set(...SPOOL).lerp(exit, fly * fly); this.spool.position.y += Math.sin(fly * Math.PI) * 1.5 * sm(0.3, 0.6, fly);
    // The strip is cut by the plane through the roll's axis, across the strip, wherever the roll is and however
    // it turns (in world units: the set grows and sinks).
    this.strip.updateMatrixWorld(true);
    const axisW = this.strip.parent.localToWorld(this.spool.position.clone()), nW = new THREE.Vector3(-1, 0, 0).transformDirection(this.strip.matrixWorld);
    this.cut.setFromNormalAndCoplanarPoint(nW, axisW);
    // The roll turns on its own axis as the film goes back in (the turn is the length wound, over the radius),
    // and it tumbles as it flies; the strip is fixed to it, so the strip turns and flies with it.
    const tumble = 0.08 * Math.sin(now() / 60) * tug + fly * fly * 5;
    this.spool.rotation.order = 'ZYX'; this.spool.rotation.set(0, -(rollOut - roll) / 0.4, tumble);
    const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tumble);
    this.strip.quaternion.copy(rq); this.strip.position.set(0, 4.6, 0).sub(new THREE.Vector3(...SPOOL)).applyQuaternion(rq).add(this.spool.position);
    const at = (f) => new THREE.Vector3(...SPOOL).lerp(exit, f * f);   // where the roll is, for his hands
    const reachTo = at(Math.min(fly, 0.3)).sub(new THREE.Vector3(...SPOOL));
    // As a tall pole is held: both hands on the side of the roll towards him, one over the other (hand 1 high,
    // hand 0 low), so his arms never cross.
    this.grip = [[-1, 3.9], [1, 5.2]].map(([s, y]) => { const r = rc + 0.08; return [SPOOL[0] + reachTo.x + r * this.d.x + s * 0.2 * this.p.x, y + Math.min(reachTo.y, 0.6), SPOOL[2] + r * this.d.y + s * 0.2 * this.p.y]; });
    if (!H) return;
    const lean = 0.32 * sm(0.84, 0.88, t) * (1 - sm(0.91, 0.97, t)), hold = 1 - sm(0.91, 0.96, t);   /* JJ: he holds the roll from the start of chapter 7 (it was sm(0, 0.04, t)), so he never lets go after the pull-back */
    H.pose.rest(); place(STAND[0], STAND[1], SFACE, { lean });
    const axis = this.spool.position, faceTo = (g) => [axis.x - g[0], 0, axis.z - g[2]];   // palms to the roll's axis
    H.hold(0, this.grip[0], hold, faceTo(this.grip[0])); H.hold(1, this.grip[1], hold, faceTo(this.grip[1]));
    H.blendExpression('neutral', 'smile', 0.7); H.blendExpression('smile', 'surprised', sm(0.78, 0.82, t)); H.blendExpression('surprised', 'neutral', sm(0.93, 0.98, t));   // shocked in the wind; unbothered after
    if (t < 0.64) lookAt(cam.position, 0); else if (t < 0.84) lookAt(B.root.position, sm(0.64, 0.7, t)); else if (t < 0.93) lookAt(this.spool.position, 1); else lookAt(cam.position, 0.8);
  },
  shot(t) { return { at: [FX + 3.5, 4.6, 0.5], dist: 30, az: -4 + 4 * pn.x, el: 4 - 2 * pn.y, sx: 0.0, sy: 0.14 }; },
};

// 8. Install it with one command. The balloon and the roll that the wind took come back from the right: the
// string of the balloon catches on the command, and he catches the roll. Then he points at the command; a copy
// makes him wave. The pointer can push the balloon; it swings back.
const termEl = $('.term');
// The string of the balloon in chapter 8 is drawn on a canvas over the page (#ink), so it can lie on the black
// bar of the command. It is a rope of points with one length and its own weight, tied to the knot. The bar is
// solid to it, and its top holds the string by friction: as the balloon floats in from the right, the end of
// the string meets the side of the bar, is pulled up over its corner, and stays caught on its top. Nothing pins it.
const inkEl = $('#ink'), ink = inkEl.getContext('2d'), codeEl = $('.term code'), copyEl = $('.copy');
const STRING = 230, KNOTS = 26;
function inkClear() { if (inkEl.dataset.on) { ink.setTransform(1, 0, 0, 1, 0, 0); ink.clearRect(0, 0, inkEl.width, inkEl.height); delete inkEl.dataset.on; } }
function hookOf() {
  const r = termEl.getBoundingClientRect(), a = codeEl.getBoundingClientRect(), b = copyEl.getBoundingClientRect();
  return { x: (a.right + b.left) / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}
// Hand 0 (his right hand) catches the roll in the air, the arm fully out, then brings it down to his side and
// turns it so that it is level with the ground. The roll touches his hand at one point: the middle of the palm.
const F7 = 1.2, FWD7 = [Math.sin(F7), Math.cos(F7)], RIGHT7 = [-Math.cos(F7), Math.sin(F7)];
// The catch is ahead of him (to the right on the screen), so the roll is never in front of his face.
const CATCH7 = (() => { const sh = [S7[0] + RIGHT7[0] * 1.3, 4.5, S7[1] + RIGHT7[1] * 1.3], d = new THREE.Vector3(FWD7[0] * 0.95 + RIGHT7[0] * 0.05, 0.3, FWD7[1] * 0.95 + RIGHT7[1] * 0.05).normalize();
  return new THREE.Vector3(...sh).addScaledVector(d, 2.6); })();
// At his side his arm hangs straight down (a little out from his hip), and his palm is on top of the roll.
const PALM7 = new THREE.Vector3(RIGHT7[0], 0, RIGHT7[1]);   // at the catch: from the palm to the roll's axis
// The palm faces down and a little in (straight down would bend the wrist square), and the roll lies just
// outside his leg, under the hand: the arm hangs nearly straight, a little out.
const OVER7 = new THREE.Vector3(-RIGHT7[0] * 0.35, -0.94, -RIGHT7[1] * 0.35).normalize();
// After he has the roll down at his side, he turns towards the viewer (0.6 to 0.74); his hand and the roll turn
// with him, about his middle.
const TURN7 = (t) => -0.42 * (still ? 1 : sm(0.6, 0.74, t));
function turn7(v, a, point = true) { const c = Math.cos(a), sn = Math.sin(a), x = v.x - (point ? S7[0] : 0), z = v.z - (point ? S7[1] : 0); v.x = x * c + z * sn + (point ? S7[0] : 0); v.z = -x * sn + z * c + (point ? S7[1] : 0); return v; }
const GRIP7 = 0.61;                                         // from the middle of the palm to the axis
const CARRY7 = new THREE.Vector3(S7[0] + RIGHT7[0] * 1.66 + FWD7[0] * 0.1, 4.52 - 2.56, S7[1] + RIGHT7[1] * 1.66 + FWD7[1] * 0.1);
C[8] = {
  start: [S7[0], S7[1], F7], end: [S7[0], S7[1], F7],
  build() {
    // Not in the set's group: they come in from off the screen, not out of the floor.
    this.balloon = balloon(); this.balloon.string.visible = false; scene.add(this.balloon.root); this.balloon.root.visible = false;
    this.roll = filmRoll(); this.roll.scale.set(0.28, 1, 0.28); scene.add(this.roll); this.roll.visible = false;
    this.off = [0, 0]; this.vel = [0, 0]; this.rope = null;
  },
  act(t) {
    const live = state.i === 8 && state.u === 0, B = this.balloon;
    if (!live) { inkClear(); this.rope = null; }
    B.root.visible = live && t > 0.03; this.roll.visible = live && t > 0.1;
    if (live) {
      const hk = hookOf(), fin = sm(0.04, 0.42, t), e = 1 - (1 - fin) ** 3, T = now() / 1000;
      // The knot: it floats in from the right, low enough that the string meets the bar, and comes to rest over
      // the bar between the command and Copy, where it bobs a little in the air. The pointer pushes the balloon;
      // a spring brings it back.
      let kx = lerp(innerWidth + 220, hk.x - 20, e) + fin * 6 * Math.sin(T / 1.1), ky = lerp(hk.top - 200, hk.top - 165, e) + fin * 4 * Math.sin(T / 1.5);
      const [ex] = toScreen(B.body.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.9, 0, 0))), [bx, by] = toScreen(B.body.getWorldPosition(new THREE.Vector3()));
      const rad = Math.abs(ex - bx) * 1.3, dx = bx - ptr.x, dy = by - ptr.y, dd = Math.hypot(dx, dy), push = ptr.mouse && dd < rad && fin >= 1 ? 2400 * (1 - dd / rad) : 0;
      for (const q of [0, 1]) { const f = push * (q ? dy : dx) / (dd || 1); this.vel[q] += (-60 * this.off[q] - 7 * this.vel[q] + f) * dt; this.off[q] += this.vel[q] * dt; }
      kx += this.off[0]; ky += this.off[1];
      // The rope: its own weight, a little air drag, one length; the bar pushes it out, and its top holds it.
      if (!this.rope) this.rope = Array.from({ length: KNOTS + 1 }, (_, q) => ({ x: kx, y: ky + q * STRING / KNOTS, px: kx, py: ky + q * STRING / KNOTS }));
      const Rp = this.rope, seg = STRING / KNOTS, h = Math.min(dt, 1 / 30);
      for (const p of Rp) { const vx = (p.x - p.px) * 0.97, vy = (p.y - p.py) * 0.97; p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 900 * h * h; }
      for (let it = 0; it < 16; it++) {
        Rp[0].x = kx; Rp[0].y = ky;
        for (let q = 0; q < KNOTS; q++) {
          const a = Rp[q], b = Rp[q + 1], ddx = b.x - a.x, ddy = b.y - a.y, l = Math.hypot(ddx, ddy) || 1e-6, c = (l - seg) / l / 2;
          if (q === 0) { b.x -= ddx * c * 2; b.y -= ddy * c * 2; } else { a.x += ddx * c; a.y += ddy * c; b.x -= ddx * c; b.y -= ddy * c; }
        }
        for (let q = 1; q <= KNOTS; q++) {
          const p = Rp[q], m = 1.5, L = hk.left - m, Rr = hk.right + m, Tt = hk.top - m, Bb = hk.bottom + m;
          if (p.x > L && p.x < Rr && p.y > Tt && p.y < Bb) {
            const out = [[p.y - Tt, 'top'], [Rr - p.x, 'right'], [p.x - L, 'left'], [Bb - p.y, 'bottom']].sort((u, v) => u[0] - v[0])[0][1];
            if (out === 'top') { p.y = Tt; p.px = lerp(p.px, p.x, 0.85); }   // friction on the top: it stays where it lies
            else if (out === 'right') p.x = Rr; else if (out === 'left') p.x = L; else p.y = Bb;
          }
        }
      }
      B.root.position.copy(worldAt(kx, ky)); B.root.rotation.z = clamp(Math.atan2(Rp[0].x - Rp[3].x, Rp[3].y - Rp[0].y), -0.35, 0.35) * 0.6;
      // Draw the string.
      const dpr = Math.min(devicePixelRatio, 2), W = Math.round(innerWidth * dpr), Hh = Math.round(innerHeight * dpr);
      if (inkEl.width !== W || inkEl.height !== Hh) { inkEl.width = W; inkEl.height = Hh; }
      ink.setTransform(dpr, 0, 0, dpr, 0, 0); ink.clearRect(0, 0, innerWidth, innerHeight); inkEl.dataset.on = 1;
      ink.lineCap = 'round'; ink.lineJoin = 'round';
      for (const [col, lw] of [['rgba(38,38,42,.55)', 3.6], ['#efe6d8', 2]]) {
        ink.strokeStyle = col; ink.lineWidth = lw; ink.beginPath(); ink.moveTo(Rp[0].x, Rp[0].y);
        for (let q = 1; q < Rp.length - 1; q++) ink.quadraticCurveTo(Rp[q].x, Rp[q].y, (Rp[q].x + Rp[q + 1].x) / 2, (Rp[q].y + Rp[q + 1].y) / 2);
        ink.lineTo(Rp.at(-1).x, Rp.at(-1).y); ink.stroke();
      }
      // The roll: in from the right, turning over, to his open hand (0.1 to 0.42); then with his hand down to his
      // side, turned level with the ground (0.46 to 0.62).
      const rc = 0.28, f = sm(0.1, 0.42, t), fe = 1 - (1 - f) ** 3, down = sm(0.46, 0.62, t);
      const tn = TURN7(t), hand = turn7(CATCH7.clone().lerp(CARRY7, down), tn), palm = turn7(PALM7.clone().lerp(OVER7, down).normalize(), tn, false), atHand = hand.clone().addScaledVector(palm, lerp(GRIP7, 0.39, sm(0.7, 1, down)) + 0.1 * Math.sin(down * Math.PI));   // the straight arm stops short of its point: the roll comes up to the palm   // the palm touches the roll at one point
      if (f < 1) {
        const A = worldAt(innerWidth + 260, innerHeight * 0.2, CATCH7.z);
        this.roll.position.copy(A).lerp(atHand, fe); this.roll.position.y += Math.sin(f * Math.PI) * 1.0;
        this.roll.rotation.set(0.3 * (1 - fe), 0, (1 - fe) * 9);
      } else {
        this.roll.position.copy(atHand);
        this.roll.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), turn7(new THREE.Vector3(FWD7[0] * down, 1 - down, FWD7[1] * down), tn, false).normalize());
      }
    }
    if (!H) return;
    H.pose.rest(); place(S7[0], S7[1], F7 + TURN7(t));
    const h = happy();
    if (h > 0) { H.blendPose('rest', 'wave', h); H.arms[1].elbow.rotation.z += Math.sin(now() / 120) * 0.3 * h; }
    else H.blendPose('rest', 'point', sm(0.66, 0.82, t));
    const reach = sm(0.26, 0.36, t), hand = turn7(CATCH7.clone().lerp(CARRY7, sm(0.46, 0.62, t)), TURN7(t));
    H.hold(0, hand.toArray(), reach, turn7(PALM7.clone().lerp(OVER7, sm(0.46, 0.62, t)), TURN7(t), false).normalize().toArray());
    H.blendExpression('neutral', 'surprised', sm(0.08, 0.16, t)); H.blendExpression('surprised', 'smile', Math.max(h, sm(0.42, 0.5, t)));
    if (t < 0.24) lookAt(B.root.position, sm(0.06, 0.14, t)); else if (t < 0.5) lookAt(this.roll.position, 1); else lookAt(null, h ? 0 : 0.5);
  },
  shot(t) { return { at: [S7[0] + 0.6, 4.4, 0], dist: 30.5, az: -6 + 3 * pn.x, el: 6 - 2 * pn.y, sx: -0.18, sy: 0.13 }; },
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
  const P = C[s.i].flows ? flow : C[s.i].cont ? cont : pace, from = C[s.i].cont ? route(s.i - 1).total + route(s.i).pts[0][0] - C[s.i].start[0] : 0;
  let d = P(s.u) * total, k = 0;
  while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++; }
  const f = seg[k] ? d / seg[k] : 0, p0 = pts[k], p1 = pts[k + 1], x = lerp(p0[0], p1[0], f), z = lerp(p0[1], p1[1], f);
  // He turns towards the way he walks, and round at the corners, not in one step.
  const dir = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), want = s.u > 0.93 && !C[s.i].flows ? b[2] : dir;
  if (walkFace === null || s.u < 0.02) walkFace = a[2];
  let dd = want - walkFace; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); walkFace += dd * (1 - Math.exp(-8 * dt));
  H.pose.rest(); place(x, z, walkFace);
  H.stride((from + P(s.u) * total) * H.STEP, 0.5 * (C[s.i].cont ? 1 : sm(0, 0.06, s.u)) * (C[s.i].flows ? 1 : 1 - sm(0.94, 1, s.u)));   // cont: the legs go on in step
  H.blendExpression('neutral', 'smile', 0.5);
}
function shotAt(s) {
  const a = C[s.i].shot(s.t);
  if (!s.u) return a;
  const b = C[s.i + 1].shot(0);
  if (s.kind === 'pen') return s.u < 0.5 ? a : b;   // the cut is behind the pen's blue, which fills the frame
  if (s.kind === 'dream') {   // into the bubble; the cut is inside it, where the screen is all chapter 7's colour
    if (s.u >= DREAM_CUT) {   /* out from close on him holding the roll: chapter 7's own view, its look point and distance scaled about his chest, so the camera moves on one straight line and he stays in place on the screen */
      const e = still ? 1 : inOut(sm(DREAM_CUT, 1, s.u)), k = lerp(0.22, 1, e), M = [STAND[0], 4.4, STAND[1]];
      return { ...b, at: b.at.map((v, i) => M[i] + (v - M[i]) * k), dist: b.dist * k };
    }
    const A = C[s.i].shot(1), { c } = C[6].bubbleAt(s.u), e = still ? 0 : sm(0.3, DREAM_CUT, s.u);
    return { ...A, at: A.at.map((v, i) => lerp(v, c.getComponent(i), e)), dist: lerp(A.dist, 6, e), sx: A.sx * (1 - e), sy: A.sy * (1 - e) };
  }
  const u = pace(s.u), lift = still ? 0 : Math.sin(Math.PI * s.u), mid = (k) => lerp(a[k], b[k], u);
  return { at: a.at.map((v, i) => lerp(v, b.at[i], u)), dist: mid('dist') * (1 + 0.35 * lift), az: mid('az') - 18 * lift, el: mid('el') + 16 * lift, sx: mid('sx'), sy: mid('sy') };
}
// From the book to the files: the pen flies to a point in front of the camera, across the middle of the
// screen; then the camera moves in on its barrel until the pen's own blue fills the whole frame. The cut to the
// files happens there. After the cut, the camera moves back out of the pen and the pen flies to the first page.
const PEN_R = 0.064, PEN_MID = -0.15, NEAR = 0.1;   // the barrel's radius, and its middle on the pen's axis (pen units)
let penZoom = 0;
function penFlight(s) {
  // The camera of the set (no zoom yet): the ray through the middle of the screen, and the pen's pose there,
  // its axis across the screen, at right angles to the ray, so the barrel (not an end) comes to the camera.
  cam.near = NEAR; cam.updateProjectionMatrix();
  ray.setFromCamera(new THREE.Vector2(0, 0), cam);
  const dir = ray.ray.direction.clone(), D0 = 3.2, hover = cam.position.clone().addScaledVector(dir, D0);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const across = right.multiplyScalar(Math.cos(0.3)).addScaledVector(up, Math.sin(0.3)).normalize();
  const slant = new THREE.Quaternion().setFromUnitVectors(PEN_AXIS, across), SC = 2;
  const atHover = { p: hover.clone().addScaledVector(across, -PEN_MID * SC), q: slant, s: new THREE.Vector3(SC, SC, SC) };
  const u = s.u;
  let f, a, b;
  if (u < 0.5) { a = C[1].penAt(1); b = atHover; f = inOut(sm(0, 0.26, u)); penZoom = inOut(sm(0.22, 0.5, u)); }
  else {
    // On the way out, the pen spins in the plane of the screen, about the ray to the camera (so the barrel's
    // skin in front of the camera stays where it is), and comes to rest as the camera is back.
    const spin = new THREE.Quaternion().setFromAxisAngle(dir, -2.4 * (1 - inOut(sm(0.5, 0.8, u))));
    a = { p: atHover.p.clone().sub(hover).applyQuaternion(spin).add(hover), q: spin.multiply(atHover.q), s: atHover.s };
    b = C[2].penAt(0); f = inOut(sm(0.66, 1, u)); penZoom = inOut(1 - sm(0.5, 0.72, u));
  }
  pen.position.lerpVectors(a.p, b.p, f); pen.position.y += Math.sin(f * Math.PI) * (u < 0.5 ? 0.8 : 0.6);
  pen.quaternion.slerpQuaternions(a.q, b.q, f); pen.scale.lerpVectors(a.s, b.s, f);
  // The camera moves along the ray to the barrel: at the end, the barrel's edge is far outside the frame.
  const rEnd = PEN_R * SC, dEnd = rEnd * 1.22, step = (D0 - dEnd) * penZoom;
  if (step > 0) {
    cam.position.addScaledVector(dir, step);
    const gapToPen = D0 - step - rEnd;   // how far the camera is from the barrel's skin
    cam.near = clamp(gapToPen * 0.5, 0.005, NEAR); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
}

// ---------- the colour of each chapter: a blob of the next colour grows out of the mascot ----------
// Its edge moves (three slow waves round it), and it is a smooth curve through 120 points: round, with no
// corners and no blur.
const bgEl = $('#bg'), wipeEl = $('#wipe'), wipeG = wipeEl.getContext('2d');
function blob(colour, cx, cy, r) {
  const dpr = Math.min(devicePixelRatio, 2), W = Math.round(innerWidth * dpr), Hh = Math.round(innerHeight * dpr);
  if (wipeEl.width !== W || wipeEl.height !== Hh) { wipeEl.width = W; wipeEl.height = Hh; }
  wipeEl.style.display = 'block'; wipeG.setTransform(dpr, 0, 0, dpr, 0, 0); wipeG.clearRect(0, 0, innerWidth, innerHeight);
  if (r <= 0) return;
  const T = now() / 1000, N = 120, P = [];
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2, w = 1 + 0.07 * Math.sin(3 * a + T * 1.7) + 0.045 * Math.sin(5 * a - T * 2.3) + 0.025 * Math.sin(7 * a + T * 1.1);
    P.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w]);
  }
  // A closed Catmull-Rom curve through the points, as cubic Bézier segments.
  wipeG.beginPath(); wipeG.moveTo(...P[0]);
  for (let k = 0; k < N; k++) {
    const p0 = P[(k + N - 1) % N], p1 = P[k], p2 = P[(k + 1) % N], p3 = P[(k + 2) % N];
    wipeG.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  wipeG.closePath(); wipeG.fillStyle = colour; wipeG.fill();
}
const farFrom = (cx, cy) => Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
function colours(s) {
  wipeEl.style.display = 'none';
  if (!(s.u > 0) || !chs[s.i + 1]) { bgEl.style.background = chs[s.i].dataset.bg; return; }
  // From the book to the files there is no blob: the pen's blue fills the frame, and the cut is behind it.
  if (s.kind === 'pen') { bgEl.style.background = chs[s.u < 0.5 ? s.i : s.i + 1].dataset.bg; return; }
  if (s.kind === 'dream') { bgEl.style.background = chs[s.u < DREAM_CUT ? s.i : s.i + 1].dataset.bg; return; }
  bgEl.style.background = chs[s.i].dataset.bg;
  let cx = innerWidth / 2, cy = innerHeight / 2;
  if (H && cam) { [cx, cy] = toScreen(H.root.getWorldPosition(new THREE.Vector3())); cx = clamp(cx, 0, innerWidth); cy = clamp(cy, 0, innerHeight); }
  // At its full size the blob's smallest radius (1 - 0.14 of it) still goes past every corner of the screen.
  const R0 = farFrom(cx, cy) / 0.85 + 4, r = R0 * (still ? (s.u > 0.5 ? 1 : 0) : inOut(sm(0.08, 0.92, s.u)));
  blob(chs[s.i + 1].dataset.bg, cx, cy, r);
}

// ---------- the morph: a set that the camera leaves sinks into the floor like soft clay, and the next one grows
// out of it. Each set shrinks and grows about its own middle on the floor; nothing appears or goes in one frame.
const MIDDLE = () => [[0, 0.6], S1, [S2[0] - 10.7, -0.8], [(WX0 + WX1) / 2, WZ], [CX, 0], SC, SC, [FX, 0], S7];
const setOf = (j) => (j === 6 ? 5 : j);   // the rug chapter is in the ring's set
function morph(g, k, [cx, cz]) {
  if (!g) return;
  g.visible = k > 0.002; g.scale.setScalar(Math.max(k, 0.002)); g.position.set(cx * (1 - k), 0, cz * (1 - k));
}
function morphs(s) {
  const mid = MIDDLE(), k = {};
  if (!(s.u > 0)) k[setOf(s.i)] = 1;
  else if (s.kind === 'pen') k[s.u < 0.5 ? s.i : s.i + 1] = 1;
  else if (s.kind === 'dream') { if (s.u < DREAM_CUT) k[setOf(s.i)] = 1; else k[s.i + 1] = 1; }   /* the film set is there at once, behind the bubble */
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
function pickables() { return state.u === 0 && state.i === 2 && C[2].ready ? C[2].pages : state.u === 0 && state.i === 7 && C[7].ready ? C[7].pics : []; }
const in5 = () => state.u === 0 && state.i === 5 && C[5].ready && !focus.obj;
let labelFor = null;
function hover() {
  hovered = null;
  // Chapter 5: the thing under the pointer shows the name of its helper, beside it, never over the statement.
  const pk = in5() && ptr.mouse ? C[5].pick(ptr.x, ptr.y) : null;
  if (pk) {
    if (labelFor !== pk.name) { labelFor = pk.name; labelEl.textContent = ACTS[pk.name].label; }
    const say = $('#c5 .say').getBoundingClientRect(), lw = labelEl.offsetWidth, lh = labelEl.offsetHeight;
    let x = clamp(pk.top[0] - lw / 2, 8, innerWidth - lw - 8), y = pk.top[1] - lh - 10;
    if (x < say.right && x + lw > say.left && y < say.bottom && y + lh > say.top) y = say.bottom + 8;
    labelEl.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`; labelEl.classList.add('on'); document.body.style.cursor = 'pointer'; return;
  }
  labelEl.classList.remove('on'); labelFor = null;
  if (!ptr.mouse || focus.obj) { document.body.style.cursor = focus.obj ? 'zoom-out' : ''; return; }
  const list = pickables(); if (!list.length) { document.body.style.cursor = ''; return; }
  const h = rayAt().intersectObjects(list)[0]; hovered = h ? h.object : null;
  document.body.style.cursor = hovered ? 'zoom-in' : '';
}
addEventListener('click', (e) => {
  if (!built || e.target.closest('a, button, [contenteditable], .graph, .folder')) return;
  if (focus.obj) { closeFocus(); return; }
  const list = pickables(), h = list.length ? rayAt(e.clientX, e.clientY).intersectObjects(list)[0] : null;
  if (h) {
    const o = h.object;
    openFocus(o, () => {
      if (!o.video) return null;
      o.video.currentTime = 0; o.video.play().catch((err) => console.warn('clip', o.clip, err));
      return () => { o.video.pause(); };
    });
    return;
  }
  if (in5()) { const pk = C[5].pick(e.clientX, e.clientY); if (pk) { p5Click(pk.name); return; } }
  if (H && rayAt(e.clientX, e.clientY).intersectObject(H.root, true).length) happyAt = now();
});

// ---------- the frame loop ----------
let state = { i: 0, t: 0, u: 0, kind: 'act' }, built = false;
function frame() {
  if (!TESTING) requestAnimationFrame(frame);
  if (document.hidden) return;
  const tNow = now(); dt = Math.min(0.1, (tNow - lastT) / 1000); lastT = tNow;
  glide();
  pn.x = damp(pn.x, ptr.x / innerWidth * 2 - 1, 3); pn.y = damp(pn.y, ptr.y / innerHeight * 2 - 1, 3);
  pn.sx = damp(pn.sx, ptr.x / innerWidth * 2 - 1, 9); pn.sy = damp(pn.sy, 1 - ptr.y / innerHeight * 2, 9);
  state = where(scrollY);
  words(state);
  // The console of chapter 6 is outside the chapter (on the top layer): it fades with it.
  consoleEl.style.opacity = chs[6].style.opacity; consoleEl.style.visibility = chs[6].style.visibility;
  if (!in5()) labelEl.classList.remove('on');
  if (state.i !== 8 || state.u > 0) inkClear();   // the balloon string of chapter 8
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === (state.u > 0.5 ? state.i + 1 : state.i)));
  if (state.i !== 1 || state.u > 0) document.querySelectorAll('.fly').forEach((f) => { f.style.display = 'none'; });
  if (!built) { colours(state); return; }
  // The camera first: the sets use it to find the pointer and to place things on the screen.
  aim(shotAt(state));
  hover();
  if (H) { H.root.visible = true; H.root.scale.set(1, 1, 1); H.shadow?.scale.set(3.8, 2.4, 1); }   // chapter 0 squashes him on landing
  if (H) { H.shirt ??= H.shapes.find((m) => m.userData.part === 'shirt'); H.shirt.scale.z = 1; H.shirt.position.z = 0; }   // lieDown's breathing scales it
  if (pen) pen.visible = state.i === 1 || state.i === 2 || (state.i === 0 && state.u > 0);
  // The dream's cut (0: chapter 6 and the dream before the cut; 1: after it): on the frame that crosses it, the
  // sets go to their new places first, so his new pose is made on them.
  const side = state.i >= 7 || (state.kind === 'dream' && state.u >= DREAM_CUT) ? 1 : state.i === 6 ? 0 : -1, cut = side >= 0 && cutSide >= 0 && side !== cutSide;
  if (cut) morphs(state);
  for (let j = 0; j < C.length; j++) {
    if (!C[j].ready || !(j === state.i || (state.u > 0 && j === state.i + 1))) continue;
    const keep = H; if (!(state.u === 0 && j === state.i)) H = null;
    C[j].act(j === state.i ? state.t : 0);
    H = keep;
  }
  if (state.u > 0 && C[state.i + 1]?.ready) {
    if (state.kind === 'pen') {
      // He stays at the book until the cut, and is at the files after it.
      if (H) { if (state.u < 0.5) C[1].act(1); else C[2].act(0); }
    } else if (state.kind === 'in5') { if (H) into5(state); }
    else if (state.kind === 'rug') { if (H) outOf5(state); }
    else if (state.kind === 'dream') { if (H) { if (state.u < DREAM_CUT) C[6].act(1); else C[7].act(0.04); } }   /* he holds the roll (chapter 7's holding pose) from the first frame of the pull-back */
    else walkBetween(state);
  } else walkFace = null;
  // ... and his new pose is there at once (either way, or over the cut in one frame).
  if (H && cut) unease();
  cutSide = side;
  morphs(state);
  settle();
  plantFloor();   /* on the eased pose */
  aim(shotAt(state));
  if (C[6].ready) C[6].dream(state.kind === 'dream' && state.i === 6 ? state.u : 0);
  if (C[6].ready && +consoleEl.style.opacity > 0) C[6].console(state.i === 6 && state.u === 0);   /* every line always has its text */
  if (state.kind === 'pen' && state.u > 0 && C[2].ready) penFlight(state); else if (cam.near !== NEAR) { cam.near = NEAR; cam.updateProjectionMatrix(); }
  stepFocus();
  // The world goes in front of the words while a page or a frame is open, and while the roll and the balloon
  // fly off at the end of chapter 6 (they cross the statement there).
  const front = focus.obj || (state.i === 7 && (state.u > 0 ? state.u < 0.3 : state.t > 0.7));
  if (canvas.style.zIndex !== (front ? '3' : '')) canvas.style.zIndex = front ? '3' : '';
  colours(state);
  R.render(scene, cam);
}
window.__clayFrame = (s = 1 / 60) => { clockMs += s * 1000; frame(); };

async function boot() {
  plan();
  addEventListener('resize', () => { plan(); R?.setSize(innerWidth, innerHeight, false); });
  if (!TESTING) requestAnimationFrame(frame);
  try {
    if (!canvas.getContext('webgl2') || typeof DecompressionStream === 'undefined') throw new Error('no WebGL 2');
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    R.setClearColor(0, 0); R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.setSize(innerWidth, innerHeight, false);
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NoToneMapping; R.localClippingEnabled = true;   // the film roll (chapter 7)
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
    realSetExpression = m.setExpression; m.blendExpression = blendFace; wrapHands(m);
    C[0].sculpt();
    await Promise.all(Object.keys(index).filter((n) => n !== 'mascot').map(load));   // every model that world.json names
    for (let j = 1; j < C.length; j++) { group(j); C[j].build(); C[j].ready = true; }
    plan();
    // Compile every material now, also of things that are hidden until later (the balloons, the rolls), so no
    // frame stalls the first time one of them shows.
    const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    // Also draw one frame with all of it shown and nothing culled, so no material is first made in a frame
    // of the scroll (that stalled the first frame of chapter 0's burst).
    const culled = []; scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });   // all of it, also what is out of view
    R.compile(scene, cam); R.render(scene, cam);
    culled.forEach((o) => { o.frustumCulled = true; }); hidden.forEach((o) => { o.visible = false; });
    document.documentElement.classList.add('ready');
  } catch (e) {
    console.error(e);
    document.documentElement.classList.add('no3d');
  }
}
boot();
