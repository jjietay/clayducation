// The Kaleidoscope mascot: built from distance fields, baked soft shading, and a small rig.
// Units: head half-width = 1. The head's centre is y = 0; the feet are near y = -6.75.
import { smin, smax, ell, cone, mesh, normalAt, ao, thin, mix, sstep, clamp } from './sdf.js';

const c3 = (THREE, hex) => new THREE.Color(hex);

const SKIN = { base: '#eec6a2', warm: '#e6a083', deep: '#a5735a', lid: '#e2b597', mouth: '#905b48' };

// ---------- the shapes ----------
const EYE = { x: 0.35, y: 0.2, z: 0.74, r: 0.335 };

function earSdf(ax, y, z) {
  // Ear in its own frame, turned so it faces forward and outward.
  const cx = 1.13, cy = -0.03, cz = -0.08, a = -0.5, ca = Math.cos(a), sa = Math.sin(a);
  const px = ax - cx, pz = z - cz, u = ca * px - sa * pz, w = sa * px + ca * pz;
  let d = ell(u, y, w, 0, cy, 0, 0.3, 0.385, 0.13);
  d = smax(d, -ell(u, y, w, -0.015, cy - 0.015, 0.14, 0.17, 0.24, 0.11), 0.07);
  return d;
}
export function headSkin(x, y, z) {
  const ax = Math.abs(x);
  let d = ell(x, y, z, 0, 0.24, -0.02, 1.0, 1.2, 0.98);
  d = smin(d, ell(x, y, z, 0, -0.5, 0.03, 0.9, 0.84, 0.85), 0.5);
  d = smin(d, ell(ax, y, z, 0.46, -0.5, 0.33, 0.4, 0.44, 0.44), 0.32);
  d = smin(d, ell(x, y, z, 0, -0.27, 1.02, 0.25, 0.245, 0.25), 0.07);
  d = smin(d, earSdf(ax, y, z), 0.09);
  return d;
}
function eyeSdf(x, y, z) { return Math.hypot(Math.abs(x) - EYE.x, y - EYE.y, z - EYE.z) - EYE.r; }

// Centre-parted curtain hair. The same thick sections run from the crown down all around the
// head, so the top, sides and back match the front.
const hairCap = (x, y, z) => {
  const ax = Math.abs(x);
  let d = smin(ell(ax, y, z, 0.32, 0.42, -0.05, 0.8, 1.27, 1.1), ell(x, y, z, 0, 0.36, -0.3, 1.09, 1.26, 0.86), 0.2);
  return smax(d, mix(-0.8, mix(1.0, 0.42, sstep(0.32, 0.86, ax)), sstep(-0.95, 0.55, z)) - y, 0.09);
};
function hairSections() {
  const out = [[[0.06, 1.2, 0.76, 0.13], [0.27, 1.14, 0.78, 0.2], [0.56, 0.9, 0.72, 0.2], [0.87, 0.58, 0.54, 0.15], [1.0, 0.3, 0.34, 0.05]]];
  const R = [0.12, 0.19, 0.2, 0.16, 0.05], C = [0, 0.42, -0.1];
  // Azimuth in degrees from the front toward the side, and where the section ends.
  for (const [deg, endY] of [[58, 0.72], [84, 0.5], [108, 0.28], [132, -0.2], [156, -0.5], [180, -0.6]]) {
    const ph = deg * Math.PI / 180, sp = Math.sin(ph), cp = Math.cos(ph);
    const onCap = (th) => {
      const dx = Math.sin(th) * sp, dy = Math.cos(th), dz = Math.sin(th) * cp;
      let t = 2.2; for (let i = 0; i < 60 && hairCapBody(C[0] + dx * t, C[1] + dy * t, C[2] + dz * t) > 0.001; i++) t -= Math.max(0.005, hairCapBody(C[0] + dx * t, C[1] + dy * t, C[2] + dz * t) * 0.8);
      return [C[0] + dx * t, C[1] + dy * t, C[2] + dz * t, dx, dy, dz];
    };
    let th1 = 0.3; while (th1 < 2.8 && onCap(th1)[1] > endY) th1 += 0.02;
    out.push(R.map((r, i) => { const P = onCap(mix(0.2, th1, i / 4)); const sink = r * mix(0.85, 0.6, sstep(0, 2, i)); return [P[0] - P[3] * sink, P[1] - P[4] * sink, P[2] - P[5] * sink, r]; }));
  }
  return out;
}
const hairCapBody = (x, y, z) => smin(ell(Math.abs(x), y, z, 0.32, 0.42, -0.05, 0.8, 1.27, 1.1), ell(x, y, z, 0, 0.36, -0.3, 1.09, 1.26, 0.86), 0.2);
export function hairSdf() {
  const sections = hairSections();
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = hairCap(x, y, z);
    if (d > 0.5) return d;
    for (const c of sections) for (let i = 0; i < c.length - 1; i++) {
      const A = c[i], B = c[i + 1];
      d = smin(d, cone(ax, y, z, A[0], A[1], A[2], B[0], B[1], B[2], A[3], B[3]), 0.13);
    }
    // Fine lines that follow the sections: out from the parting at the front, downward elsewhere.
    const front = sstep(0.1, 0.5, z), h = Math.hypot(ax, z);
    d += mix(Math.sin(Math.atan2(ax, z) * 30) * sstep(0.25, 0.6, h), Math.sin(Math.atan2(y - 1.75, ax + 0.05) * 16) * sstep(0.45, 0.9, y), front) * 0.0035;
    const part = cone(x, y, z, 0, 1.14, 0.98, 0, 1.72, 0.1, 0.024, 0.016);
    return smax(d, -part, 0.07);
  };
}

function shirtBase(x, y, z) {
  let d = ell(x, y, z, 0, -2.5, -0.02, 1.52, 1.12, 0.86);
  d = smin(d, ell(x, y, z, 0, -3.4, -0.02, 1.27, 1.25, 0.8), 0.4);
  return smin(d, ell(x, y, z, 0, -1.82, -0.28, 0.84, 0.42, 0.5), 0.3);
}
// How far a point is from the neck hole's edge, across a tube tilted low at the front.
function neckR(x, y, z) {
  const a = 0.3, py = y + 1.5, pz = z - 0.05, w = -Math.sin(a) * py + Math.cos(a) * pz, v = Math.cos(a) * py + Math.sin(a) * pz;
  return { R: Math.hypot(x / 0.7, w / 0.64), v };
}
function shirtSdf(x, y, z) {
  let d = smax(shirtBase(x, y, z), -4.3 - y, 0.05);
  const n = neckR(x, y, z);
  d = smax(d, -Math.max((n.R - 1) * 0.66, -0.34 - n.v), 0.03);
  d += Math.sin(y * 7 + Math.sin(x * 3) * 1.6) * 0.008 * sstep(-2.8, -3.6, y);
  return d;
}
function collarSdf(x, y, z) {
  const n = neckR(x, y, z);
  return Math.max(Math.hypot((n.R - 1) * 0.66, shirtBase(x, y, z)) - 0.05, -0.42 - n.v);
}
function neckSdf(x, y, z) {
  let d = cone(x, y, z, 0, -0.85, -0.04, 0, -1.72, -0.04, 0.545, 0.6);
  d = smin(d, ell(x, y, z, 0, -1.98, 0.0, 0.7, 0.42, 0.5), 0.25);
  return d;
}
const sleeveSdf = (x, y, z) => {
  let d = cone(x, y, z, 0, -0.05, 0, 0, -1.02, 0, 0.38, 0.47);
  d = smax(d, -1.06 - y, 0.05);
  d += Math.sin(y * 9 + x * 4) * 0.006;
  return d;
};
const upperArmSdf = (x, y, z) => cone(x, y, z, 0, -0.5, 0, 0, -1.35, 0, 0.3, 0.27);
const forearmSdf = (x, y, z) => cone(x, y, z, 0, 0, 0, 0, -1.02, 0, 0.27, 0.2);
const handSdf = (x, y, z) => {
  let d = ell(x, y, z, 0, -0.3, 0, 0.32, 0.37, 0.23);
  d = smin(d, cone(x, y, z, -0.25, -0.17, 0.1, -0.34, -0.36, 0.15, 0.095, 0.08), 0.05);
  return d;
};
const hipSdf = (x, y, z) => smin(ell(x, y, z, 0, -4.15, -0.02, 1.15, 0.62, 0.74), cone(Math.abs(x), y, z, 0.55, -4.4, 0, 0.56, -4.7, 0, 0.56, 0.54), 0.2);
const legSdf = (x, y, z) => {
  let d = cone(x, y, z, 0, 0, 0, 0, -2.05, 0, 0.56, 0.47);
  d = smax(d, -2.06 - y, 0.05);
  d += Math.sin(y * 5.5 + x * 3) * 0.006;
  return d;
};
const shoeSdf = (x, y, z) => {
  let d = ell(x, y, z, 0, -0.06, 0.2, 0.46, 0.33, 0.78);
  d = smax(d, -0.24 - y, 0.05);
  return d;
};
const soleSdf = (x, y, z) => { let d = ell(x, y, z, 0, -0.24, 0.2, 0.49, 0.14, 0.82); d = smax(d, -0.3 - y, 0.03); return smax(d, y + 0.16, 0.03); };
const budSdf = (x, y, z) => {
  let d = ell(x, y, z, 0, 0.02, 0.03, 0.135, 0.125, 0.15);
  return smin(d, cone(x, y, z, 0.01, -0.03, 0.03, -0.03, -0.42, 0.05, 0.056, 0.052), 0.06);
};

// ---------- baking ----------
export const CACHE = { read: null, write: null };
export function bake(THREE, key, f, box, step, world, shade) {
  const g = new THREE.BufferGeometry();
  let d = CACHE.read && CACHE.read(key);
  if (!d) {
    if (!CACHE.write) throw new Error(`error: no saved shape for ${key}. Run bake.mjs.`);
    const B = typeof box === 'function' ? box() : { min: box[0], max: box[1], step };
    const m = mesh(f, B.min, B.max, B.step), n = m.pos.length / 3;
    const nor = new Float32Array(n * 3), col = new Float32Array(n * 3), out = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2], N = normalAt(f, x, y, z);
      nor.set(N, i * 3);
      shade(x, y, z, N, world ? ao(world, x, y, z, N) : 1, out);
      col[i * 3] = out[0]; col[i * 3 + 1] = out[1]; col[i * 3 + 2] = out[2];
    }
    d = { pos: m.pos, nor, col, tri: m.tri };
    CACHE.write(key, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(d.pos.slice(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
  g.setIndex(new THREE.BufferAttribute(d.tri, 1));
  return g;
}
const lerp3 = (out, a, b, t) => { out[0] = mix(a.r, b.r, t); out[1] = mix(a.g, b.g, t); out[2] = mix(a.b, b.b, t); };

// ---------- expressions ----------
// lid: upper-lid angle, larger is more closed. tilt: + lowers the inner end, - raises it. low: lower lid.
// look: pupil yaw and pitch. m: mouth half width, corner lift, opening, side skew, shift.
const N = { lid: [0.06, 0.06], tilt: [0, 0], low: [0, 0], look: [0, 0.14], pupil: 1, m: { w: 0.31, c: -0.012, o: 0, sk: 0, dy: 0, dx: 0 }, head: [0, 0, 0] };
export const EXPRESSIONS = {
  neutral: { ...N },
  smile: { ...N, lid: [0.0, 0.0], low: [0.32, 0.32], m: { ...N.m, w: 0.33, c: 0.1 } },
  surprised: { ...N, lid: [-0.68, -0.68], look: [0, 0], pupil: 0.92, m: { ...N.m, w: 0.11, o: 0.16, dy: -0.03 }, head: [0, 0, -0.04] },
  confused: { ...N, lid: [0.14, -0.34], tilt: [0.08, -0.12], look: [-0.16, 0.05], m: { ...N.m, w: 0.2, sk: 0.07, dx: 0.07 }, head: [0.13, 0, 0] },
  thinking: { ...N, lid: [-0.34, -0.34], look: [0.3, -0.2], m: { ...N.m, w: 0.2, sk: -0.05, dx: 0.1 }, head: [-0.07, 0.1, -0.05] },
  worried: { ...N, lid: [-0.2, -0.2], tilt: [-0.3, -0.3], look: [0, 0.1], m: { ...N.m, w: 0.24, c: -0.08 } },
  unimpressed: { ...N, lid: [0.14, 0.14], tilt: [0.05, 0.05], look: [0.34, 0.2], m: { ...N.m, w: 0.27, sk: 0.03 } },
  understanding: { ...N, lid: [-0.5, -0.5], low: [0.18, 0.18], look: [0, 0.03], m: { ...N.m, w: 0.22, c: 0.08, o: 0.075 }, head: [0, 0, -0.03] },
  sleepy: { ...N, lid: [0.84, 0.84], look: [0, 0.34], m: { ...N.m, w: 0.2, c: -0.015 }, head: [0.05, 0, 0.09] },
};

// ---------- the character ----------
export function createMascot(THREE, opts = {}) {
  const skin = SKIN, step = opts.step || 0.024, bodyStep = opts.bodyStep || 0.035, fine = opts.fine || 0.014;
  const S = { base: c3(THREE, skin.base), warm: c3(THREE, skin.warm), deep: c3(THREE, skin.deep), lid: c3(THREE, skin.lid), mouth: c3(THREE, skin.mouth) };
  const hairF = hairSdf();
  // Each mesh carries the shape it was made from, so the collision measures use his real body.
  const shapes = [], tag = (part, f, m) => { Object.assign(m.userData, { part, f, pv: [0, 0, 0] }); shapes.push(m); return m; };
  const skinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.56, sheen: 0.28, sheenRoughness: 0.6, sheenColor: c3(THREE, '#ffd9c2'), specularIntensity: 0.32 });

  const root = new THREE.Group(), headPivot = new THREE.Group();
  headPivot.position.set(0, -0.95, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  headPivot.add(head); root.add(headPivot);

  // Skin of the head, with occlusion from hair, eyes and neck, and warmth where it is thin.
  const worldHead = (x, y, z) => Math.min(headSkin(x, y, z), hairF(x, y, z), eyeSdf(x, y, z) - 0.015, neckSdf(x, y, z));
  const shadeSkin = (self, world) => (x, y, z, n, A, out) => {
    const t = thin(self, x, y, z, n), base = out;
    const e = Math.pow(1 - clamp(n[2], 0, 1), 2) * 0.4, w = clamp(0.75 * t + e, 0, 1), r = mix(S.base.r, S.warm.r, w), g = mix(S.base.g, S.warm.g, w), b = mix(S.base.b, S.warm.b, w);
    const k = A;
    base[0] = mix(S.deep.r, r, k); base[1] = mix(S.deep.g, g, k); base[2] = mix(S.deep.b, b, k);
  };
  head.add(tag('head', headSkin, new THREE.Mesh(bake(THREE, 'head', headSkin, [[-1.55, -1.5, -1.2], [1.55, 1.75, 1.42]], step, worldHead, shadeSkin(headSkin)), skinMat)));

  // Hair.
  const hairCol = c3(THREE, '#0c0b0e'), hairHi = c3(THREE, '#3a3840');
  const hairMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, sheen: 0.25, sheenRoughness: 0.5, sheenColor: c3(THREE, '#6f6a78'), specularIntensity: 0.55 });
  head.add(tag('hair', hairF, new THREE.Mesh(bake(THREE, 'hair', hairF, [[-1.32, -1.0, -1.32], [1.32, 2.0, 1.15]], step, hairF, (x, y, z, n, A, o) => lerp3(o, hairCol, hairHi, Math.pow(A, 2) * (0.25 + 0.75 * sstep(0.7, 1.05, y) * sstep(1.5, 1.2, y)))), hairMat)));

  // Eyes, lids and pupils.
  const eyeMat = () => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#fbf9f6', roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    m.userData.u = { uLid: { value: new THREE.Vector3(0, 1, 0) } };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uLid = m.userData.u.uLid;
      sh.vertexShader = 'varying vec3 vL;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = position;');
      sh.fragmentShader = 'varying vec3 vL; uniform vec3 uLid;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
        float s = smoothstep(-0.01, 0.12, -dot(vL, uLid));
        diffuseColor.rgb *= mix(vec3(0.60, 0.56, 0.58), vec3(1.0), s);
        float b = smoothstep(0.05, 0.33, length(vL.xy));
        diffuseColor.rgb *= mix(1.0, 0.93, b);`);
    };
    return m;
  };
  const lidMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.25, sheenRoughness: 0.55, sheenColor: c3(THREE, '#ffd9c2'), specularIntensity: 0.3, side: THREE.DoubleSide });
  const pupilMat = new THREE.MeshPhysicalMaterial({ color: '#0d0c0e', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
  const eyes = [-1, 1].map((sx) => {
    const g = new THREE.Group(); g.position.set(sx * EYE.x, EYE.y, EYE.z); head.add(g);
    const em = eyeMat();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 64, 48), em));
    const look = new THREE.Group(); g.add(look);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.074, 32, 24), pupilMat);
    pupil.scale.set(1.15, 1.0, 0.22); pupil.position.z = EYE.r - 0.004; look.add(pupil);
    // Upper lid: a dome plus a rounded rim. tiltG turns it around the view axis.
    const tiltG = new THREE.Group(); g.add(tiltG);
    const upper = new THREE.Group(); tiltG.add(upper);
    const R = EYE.r + 0.022;
    const paint = (g, f) => { const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const t = f(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = mix(S.lid.r, S.deep.r, t); c[i * 3 + 1] = mix(S.lid.g, S.deep.g, t); c[i * 3 + 2] = mix(S.lid.b, S.deep.b, t); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
    upper.add(new THREE.Mesh(paint(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), (x, y) => 0.5 * Math.pow(1 - y / R, 3)), lidMat));
    const rim = new THREE.Mesh(paint(new THREE.TorusGeometry(R, 0.011, 16, 96), () => 0.42), lidMat); rim.rotation.x = Math.PI / 2; upper.add(rim);
    const lower = new THREE.Group(); g.add(lower);
    const lowMat = lidMat.clone(); lowMat.emissive = S.lid.clone(); lowMat.emissiveIntensity = 0.3;
    lower.add(new THREE.Mesh(paint(new THREE.SphereGeometry(R - 0.004, 64, 24, 0, Math.PI * 2, Math.PI - 0.8, 0.8), () => 0.0), lowMat));
    const rimL = new THREE.Mesh(paint(new THREE.TorusGeometry((R - 0.004) * Math.sin(0.8), 0.009, 12, 96), () => 0.1), lowMat);
    rimL.rotation.x = Math.PI / 2; rimL.position.y = -(R - 0.004) * Math.cos(0.8); lower.add(rimL);
    return { sx, look, pupil, tiltG, upper, lower, em };
  });

  // Earbuds, generic and with no logo.
  const budMat = new THREE.MeshPhysicalMaterial({ color: '#e6e3dd', roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const budG = bake(THREE, 'bud', budSdf, [[-0.3, -0.62, -0.25], [0.3, 0.25, 0.3]], fine, null, (x, y, z, n, A, o) => { o[0] = o[1] = o[2] = 1; });
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(budG, budMat);
    m.position.set(sx * 1.12, -0.02, 0.1); m.scale.x = -sx; m.rotation.y = sx * -0.35; m.rotation.z = sx * 0.05; head.add(m);
  }

  // The mouth: a ribbon laid on the face, rebuilt for each expression.
  const closedCol = c3(THREE, skin.mouth), openCol = c3(THREE, '#4a2019');
  const mouthMat = new THREE.MeshStandardMaterial({ color: closedCol, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
  const COLS = 41, ROWS = 7, mouthPos = new Float32Array(COLS * ROWS * 3), idx = [];
  for (let i = 0; i < COLS - 1; i++) for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j, b = a + ROWS; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const mouthG = new THREE.BufferGeometry();
  mouthG.setAttribute('position', new THREE.BufferAttribute(mouthPos, 3)); mouthG.setIndex(idx);
  const mouth = new THREE.Mesh(mouthG, mouthMat); head.add(mouth);
  const surfaceZ = (x, y) => { let z = 1.3; for (let i = 0; i < 28; i++) { const d = headSkin(x, y, z); if (Math.abs(d) < 0.0012) break; z -= d * 0.9; } return z; };
  function setMouth(m) {
    const Y0 = -0.735 + (m.dy || 0);
    for (let i = 0; i < COLS; i++) {
      const u = -1 + 2 * i / (COLS - 1), cx = u * m.w + (m.dx || 0);
      const cy = Y0 + m.c * u * u - m.c * 0.35 + (m.sk || 0) * u;
      const profile = Math.sqrt(Math.max(0, 1 - u * u));
      const half = 0.0155 * Math.pow(profile, 0.25) + (m.o || 0) * profile;
      for (let j = 0; j < ROWS; j++) {
        const v = -1 + 2 * j / (ROWS - 1), y = cy + v * half, k = (i * ROWS + j) * 3;
        mouthPos[k] = cx; mouthPos[k + 1] = y; mouthPos[k + 2] = surfaceZ(cx, y) + 0.004;
      }
    }
    mouthG.attributes.position.needsUpdate = true; mouthG.computeVertexNormals();
    mouthMat.color.copy(closedCol).lerp(openCol, clamp((m.o || 0) / 0.05, 0, 1));
  }

  // ---------- the body ----------
  const body = new THREE.Group(); root.add(body);
  const worldBody = (x, y, z) => Math.min(shirtSdf(x, y, z), headSkin(x, y, z), neckSdf(x, y, z), collarSdf(x, y, z), hipSdf(x, y, z));
  const shirtA = c3(THREE, '#161618'), shirtB = c3(THREE, '#09090a');
  const shirtMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.84, sheen: 0.3, sheenRoughness: 0.7, sheenColor: c3(THREE, '#55555c'), specularIntensity: 0.2 });
  const shadeCloth = (a, b) => (x, y, z, n, A, o) => lerp3(o, b, a, A);
  body.add(tag('neck', neckSdf, new THREE.Mesh(bake(THREE, 'neck', neckSdf, [[-1.0, -2.5, -0.8], [1.0, -0.6, 0.85]], bodyStep, worldBody, shadeSkin(neckSdf)), skinMat)));
  body.add(tag('shirt', shirtSdf, new THREE.Mesh(bake(THREE, 'shirt', shirtSdf, [[-1.6, -4.45, -1.05], [1.6, -1.1, 1.05]], bodyStep, worldBody, shadeCloth(shirtA, shirtB)), shirtMat)));
  body.add(tag('collar', collarSdf, new THREE.Mesh(bake(THREE, 'collar', collarSdf, [[-0.95, -2.2, -0.95], [0.95, -1.0, 0.95]], fine, null, (x, y, z, n, A, o) => lerp3(o, shirtA, shirtA, 1)), shirtMat)));

  const pantA = c3(THREE, '#ede3cf'), pantB = c3(THREE, '#a89a80');
  const pantMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, sheen: 0.4, sheenRoughness: 0.7, sheenColor: c3(THREE, '#fff4dc'), specularIntensity: 0.2 });
  body.add(tag('hip', hipSdf, new THREE.Mesh(bake(THREE, 'hip', hipSdf, [[-1.3, -5.3, -1.0], [1.3, -3.4, 1.0]], bodyStep, shirtSdf, shadeCloth(pantA, pantB)), pantMat)));

  const armParts = {
    sleeve: bake(THREE, 'sleeve', sleeveSdf, [[-0.65, -1.2, -0.65], [0.65, 0.65, 0.65]], bodyStep, null, (x, y, z, n, A, o) => lerp3(o, shirtA, shirtB, sstep(-1.0, 0.2, y) * 0.3)),
    upper: bake(THREE, 'upper', upperArmSdf, [[-0.45, -1.7, -0.45], [0.45, -0.1, 0.45]], bodyStep, sleeveSdf, shadeSkin(upperArmSdf)),
    fore: bake(THREE, 'fore', forearmSdf, [[-0.4, -1.4, -0.4], [0.4, 0.35, 0.4]], bodyStep, null, shadeSkin(forearmSdf)),
    hand: bake(THREE, 'hand', handSdf, [[-0.62, -0.82, -0.36], [0.45, 0.15, 0.36]], fine * 1.6, null, shadeSkin(handSdf)),
  };
  const shoeC = c3(THREE, '#f5f3ee'), shoeD = c3(THREE, '#a8a39a'), soleC = c3(THREE, '#cfcac0');
  const legParts = {
    leg: bake(THREE, 'leg', legSdf, [[-0.75, -2.2, -0.75], [0.75, 0.65, 0.75]], bodyStep, null, shadeCloth(pantA, pantB)),
    shoe: bake(THREE, 'shoe', shoeSdf, [[-0.62, -0.4, -0.7], [0.62, 0.35, 1.1]], fine * 1.6, soleSdf, (x, y, z, n, A, o) => lerp3(o, shoeD, shoeC, A)),
    sole: bake(THREE, 'sole', soleSdf, [[-0.62, -0.45, -0.75], [0.62, -0.05, 1.15]], fine * 1.6, null, (x, y, z, n, A, o) => lerp3(o, soleC, soleC, 1)),
  };
  const clothWhite = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, sheen: 0.3, sheenRoughness: 0.6, specularIntensity: 0.3 });

  const arms = [-1, 1].map((sx, ai) => {
    const shoulder = new THREE.Group(); shoulder.position.set(sx * 1.3, -2.3, -0.02); body.add(shoulder);
    shoulder.add(tag('sleeve' + ai, sleeveSdf, new THREE.Mesh(armParts.sleeve, shirtMat)), tag('upper' + ai, upperArmSdf, new THREE.Mesh(armParts.upper, skinMat)));
    const elbow = new THREE.Group(); elbow.position.y = -1.32; shoulder.add(elbow);
    elbow.add(tag('fore' + ai, forearmSdf, new THREE.Mesh(armParts.fore, skinMat)));
    const wrist = new THREE.Group(); wrist.position.y = -1.03; elbow.add(wrist);
    const h = tag('hand' + ai, handSdf, new THREE.Mesh(armParts.hand, skinMat)); h.scale.x = sx > 0 ? 1 : -1; wrist.add(h);
    return { sx, shoulder, elbow, wrist };
  });
  const legs = [-1, 1].map((sx, li) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.57, -4.56, 0); body.add(hip);
    hip.add(tag('leg' + li, legSdf, new THREE.Mesh(legParts.leg, pantMat)));
    const ankle = new THREE.Group(); ankle.position.y = -1.95; hip.add(ankle);
    ankle.add(tag('shoe' + li, shoeSdf, new THREE.Mesh(legParts.shoe, clothWhite)), tag('sole' + li, soleSdf, new THREE.Mesh(legParts.sole, clothWhite)));
    return { sx, hip, ankle };
  });

  // ---------- the rig ----------
  const pose = {
    rest() { for (const a of arms) { a.shoulder.rotation.set(0, 0, a.sx * 0.2); a.elbow.rotation.set(-0.12, 0, 0); a.wrist.rotation.set(0, 0, 0); } for (const l of legs) { l.hip.rotation.set(0, 0, 0); l.ankle.rotation.set(0, 0, 0); } },
    wave() { pose.rest(); const a = arms[1]; a.shoulder.rotation.set(0, 0, 1.9); a.elbow.rotation.set(-0.15, 0, 1.3); },
    point() { pose.rest(); const a = arms[1]; a.shoulder.rotation.set(-0.15, 0, 1.45); a.elbow.rotation.set(-0.4, 0, 0.12); },
    think() { pose.rest(); const a = arms[1]; a.shoulder.rotation.set(-1.35, -0.75, 0); a.elbow.rotation.set(-1.95, 0, 0); a.wrist.rotation.set(-0.15, 0, 0); },
  };
  function setExpression(e) {
    const p = typeof e === 'string' ? EXPRESSIONS[e] : e;
    eyes.forEach((E, i) => {
      // i = 0 is the viewer's left. Lid arrays are [viewer's left, viewer's right].
      const th = p.lid[i], tilt = p.tilt[i] * (E.sx < 0 ? -1 : 1);
      E.upper.rotation.x = th; E.tiltG.rotation.z = tilt;
      const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), th).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      E.em.userData.u.uLid.value.copy(n);
      E.look.rotation.set(p.look[1], p.look[0], 0);
      E.pupil.scale.set(1.15 * p.pupil, p.pupil, 0.22);
      if (p.low[i] > 0.01) { E.lower.scale.setScalar(1); E.lower.rotation.x = -p.low[i]; } else E.lower.scale.setScalar(1e-4);
    });
    setMouth(p.m);
    headPivot.rotation.set(p.head[2], p.head[1], p.head[0]);
  }
  // A blend of two expressions or two poses, k from 0 to 1, so a change never pops.
  const mixArr = (a, b, k) => a.map((v, i) => mix(v, b[i], k));
  function blendExpression(a, b, k) {
    const A = EXPRESSIONS[a] || a, B = EXPRESSIONS[b] || b, m = {};
    for (const key of Object.keys(A.m)) m[key] = mix(A.m[key] || 0, B.m[key] || 0, k);
    setExpression({ lid: mixArr(A.lid, B.lid, k), tilt: mixArr(A.tilt, B.tilt, k), low: mixArr(A.low, B.low, k), look: mixArr(A.look, B.look, k), pupil: mix(A.pupil, B.pupil, k), m, head: mixArr(A.head, B.head, k) });
  }
  const joints = () => [...arms.flatMap((a) => [a.shoulder, a.elbow, a.wrist]), ...legs.flatMap((l) => [l.hip, l.ankle])];
  function blendPose(a, b, k) {
    pose[a](); const A = joints().map((j) => [j.rotation.x, j.rotation.y, j.rotation.z]);
    pose[b](); const B = joints().map((j) => [j.rotation.x, j.rotation.y, j.rotation.z]);
    joints().forEach((j, i) => j.rotation.set(mix(A[i][0], B[i][0], k), mix(A[i][1], B[i][1], k), mix(A[i][2], B[i][2], k)));
  }
  // Blink: 0 open, 1 closed, on top of the expression that was set last.
  function blink(k) { for (const E of eyes) E.upper.rotation.x = mix(E.upper.rotation.x, 1.45, k); }
  // ---------- moving around, so he does the work and never only stands and watches ----------
  const api = { shapes, root, head, headPivot, arms, legs, pose, setExpression, blendExpression, blendPose, blink, place, stride, route, reach, hold };
  const eul = new THREE.Euler(), up = new THREE.Vector3();
  // Legs that swing 0.55 rad take a step of about 2.5 units, so this much phase for each unit walked.
  const STEP = 1.25; api.STEP = STEP;
  // Feet at (x, z) on the floor. face: 0 looks at +z, Math.PI / 2 looks at +x, -Math.PI / 2 looks at -x. lean: + forward, - back.
  function place(x, z = 0, { face = 0, lean = 0, y = 0 } = {}) {
    api.held = [0, 0]; api.grips = []; api.holds = []; api.feet = [x, z];   // reach() and hold() fill them: a hand that holds something may touch it
    eul.set(lean, face, 0, 'YXZ'); root.quaternion.setFromEuler(eul);
    up.set(0, 6.82, 0).applyEuler(eul); root.position.set(x + up.x, up.y + y, z + up.z);
    if (api.shadow) { api.shadow.position.x = x; api.shadow.position.z = z; }
    api.start ??= [x, z]; api.travel = Math.max(api.travel || 0, Math.hypot(x - api.start[0], z - api.start[1]));
  }
  // Swing the legs and arms. phase comes from the distance walked; amp is 0 when he stands.
  function stride(phase, amp = 0.5) {
    const w = Math.sin(phase) * amp;
    legs[0].hip.rotation.x = w; legs[1].hip.rotation.x = -w;
    arms[0].shoulder.rotation.x += -w * 0.6; arms[1].shoulder.rotation.x += w * 0.6;
    root.position.y += Math.abs(Math.sin(phase)) * amp * 0.09;
  }
  // Walk through keys [time, x, z, face], eased between them. Call it after blendPose, and before reach.
  function route(t, keys, { lean = 0, amp = 0.55, keep = false, y = 0 } = {}) {
    let dist = 0, cur = keys[0], move = 0, tooSlow = false;
    const turnTo = (from, to, k) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return from + d * k; };
    for (let i = 0; i + 1 < keys.length; i++) {
      const A = keys[i], B = keys[i + 1], L = Math.hypot(B[1] - A[1], B[2] - A[2]);
      if (t >= B[0]) { dist += L; cur = B; continue; }
      if (t <= A[0]) { cur = A; break; }
      const u = (t - A[0]) / (B[0] - A[0]), e = u * u * (3 - 2 * u);
      dist += L * e; move = Math.sin(Math.PI * u);
      tooSlow = !keep && L >= 1.5 && L / (B[0] - A[0]) < 1;   // a long, slow walk looks wrong: wait, then walk
      let face = turnTo(A[3] ?? 0, B[3] ?? 0, e);
      // He looks where he walks. A short step (under 1.5) may go back or to the side, and keep is for
      // pulling something: he walks backwards and faces it.
      if (L >= 1.5 && !keep) face = turnTo(face, Math.atan2(B[1] - A[1], B[2] - A[2]), Math.min(1, move * 2.5));
      cur = [t, mix(A[1], B[1], e), mix(A[2], B[2], e), face];
      break;
    }
    place(cur[1], cur[2], { face: cur[3] ?? 0, lean, y: typeof y === 'function' ? y(cur[1], cur[2]) : y });
    api.tooSlow = tooSlow;
    stride(dist * STEP, amp * Math.min(1, move * 1.6));
    return { x: cur[1], z: cur[2], moving: move };
  }
  // Put a hand on a world point: i = 0 or 1, k from 0 (the pose) to 1 (on the point). Call it last.
  // A point out of reach gives a straight arm that points at it.
  const Yd = new THREE.Vector3(0, -1, 0), UP = 1.32, LOW = 1.33;
  function reach(i, point, k = 1) {
    if (k <= 0) return;
    api.held ??= [0, 0]; api.held[i] = Math.max(api.held[i], k);
    const a = arms[i], par = a.shoulder.parent; root.updateMatrixWorld(true);
    const T = par.worldToLocal(new THREE.Vector3(...point)).sub(a.shoulder.position), L = Math.min(T.length(), UP + LOW - 0.002), n = T.clone().normalize();
    T.copy(n).multiplyScalar(L);
    const cosA = clamp((UP * UP + L * L - LOW * LOW) / (2 * UP * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const hint = new THREE.Vector3(a.sx * 0.5, -1, -0.3), perp = hint.sub(n.clone().multiplyScalar(hint.dot(n))).normalize();
    const e = n.clone().multiplyScalar(cosA).add(perp.multiplyScalar(sinA));
    const qS = new THREE.Quaternion().setFromUnitVectors(Yd, e), low = T.clone().sub(e.clone().multiplyScalar(UP)).normalize().applyQuaternion(qS.clone().invert());
    const qE = new THREE.Quaternion().setFromUnitVectors(Yd, low);
    a.shoulder.quaternion.slerp(qS, k); a.elbow.quaternion.slerp(qE, k); a.wrist.quaternion.slerp(new THREE.Quaternion(), k);
  }
  // reach, for a thing that the hand holds. "make look" gives a fault if the hand cannot get there.
  function hold(i, point, k = 1) {
    if (k > 0.5) {
      root.updateMatrixWorld(true);
      const a = arms[i], gap = a.shoulder.parent.worldToLocal(new THREE.Vector3(...point)).sub(a.shoulder.position).length() - (UP + LOW);
      if (gap > 0) (api.grips ??= []).push({ i, gap });
      (api.holds ??= []).push({ i, point, k });
    }
    reach(i, point, k);
  }
  pose.rest(); setExpression('neutral');
  return api;
}

// ---------- a shared studio: soft large lights only ----------
export function studio(THREE, renderer, scene) {
  const env = new THREE.Scene();
  const panel = (w, h, x, y, z, v) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v * 0.985, v * 0.96), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  env.background = new THREE.Color(0.34, 0.35, 0.34);
  panel(14, 14, 0, 9, 4, 1.5); panel(12, 12, -8, 3, 9, 1.45); panel(12, 12, 8, 2, 9, 0.95); panel(14, 8, 0, -7, 5, 0.5); panel(12, 12, 0, 2, -10, 0.9);
  renderer.userData ??= {};
  renderer.userData.clayEnv ??= new THREE.PMREMGenerator(renderer).fromScene(env, 0.04).texture;
  scene.environment = renderer.userData.clayEnv;
  const key = new THREE.DirectionalLight('#fff5ea', 0.8); key.position.set(-2.5, 3.5, 8); scene.add(key);
  const fill = new THREE.DirectionalLight('#eef4ff', 0.2); fill.position.set(5, 1, 4); scene.add(fill);
}
