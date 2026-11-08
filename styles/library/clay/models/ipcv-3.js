// Models for the course Part 2, video 3. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this video. Class A is deep blue, class B is plum, on beads and on the abacus.
const C = { classA: '#3d63b8', classB: '#8e3f8f', sand: '#d9c08a', arch: '#2f9e8f', column: '#cf4f45' };
const DEG = Math.PI / 180;

// A small part gets a fine mesh step, so it costs many triangles. shrink() makes the part s times
// smaller about the point p. The rest pose then scales its group up by s again, so it shows at full
// size with fewer triangles. The distance stays correct, because the field is divided by s.
const shrink = (f, p, s) => (x, y, z) => f(p[0] + (x - p[0]) * s, p[1] + (y - p[1]) * s, p[2] + (z - p[2]) * s) / s;

// The same for a whole model: each part is baked s times smaller about the origin, and the rest pose
// scales each top group up by s. A top group must then have its pivot at the origin.
function shrinkModel(m, s) { for (const p of m.parts) { p.f = shrink(p.f, [0, 0, 0], s); if (p.pivot) p.pivot = p.pivot.map((v) => v / s); } return m; }

// Turns a field about the z axis by angle a about the point (cx, cy).
const turnZ = (f, a, cx, cy) => { const c = Math.cos(a), s = Math.sin(a); return (x, y, z) => { const px = x - cx, py = y - cy; return f(cx + c * px + s * py, cy - s * px + c * py, z); }; };

// A fat clay bead, 0.7 across, with a shallow hole on top. Its flat bottom sits on y = 0.
function beadSpec(color, label) {
  return {
    label,
    make() {
      const m = def();
      m.add('bead', (x, y, z) => smax(smax(ell(x, y, z, 0, 0.235, 0, 0.35, 0.25, 0.35), -y, 0.05), -ell(x, y, z, 0, 0.5, 0, 0.13, 0.12, 0.13), 0.07), color);
      return m;
    },
    moving: 'No moving parts',
  };
}

// The abacus: frame and rods in model space, beads at the left end of each rod.
const AB = { postX: 2.4, postR: 0.17, rodY: [2.45, 1.45], bx: 0.16, by: 0.32, pitch: 0.32, s: 3.2 };
AB.inner = AB.postX - AB.postR;                       // the inner face of a post
AB.slide = 2 * AB.inner - 10 * AB.pitch;              // how far a bead can slide, from end to end

// The sand heap: a bell profile that meets the floor at radius R. It is baked SH times smaller.
const SH = 2;
function heap(x, y, z) {
  const H = 1.2, R = 1.8, lift = 0.24, sg = R / Math.sqrt(2 * Math.log((H + lift) / lift)), r = Math.hypot(x, z);
  const e = Math.exp(-r * r / (2 * sg * sg)), h = (H + lift) * e - lift, dh = (H + lift) * e * r / (sg * sg);
  // The base is just below the floor, off the mesh grid. The last term bounds the field, so the bake box stays small.
  return Math.max(smax((y - h) / Math.sqrt(1 + dh * dh), -y - 0.004, 0.24), r - R - 0.1);
}

// The Gaussian arch: the curve y = AH exp(-x² / 2), with sigma = 1 model unit, from x = -AW to AW.
const AH = 2.8, AW = 2.55, AY = 1.19, ARCH = [], BS = 1.3;   // BS: the whole model is baked BS times smaller
for (let i = 0; i <= 80; i++) { const x = -AW + (2 * AW * i) / 80; ARCH.push([x, AY + 0.26 + AH * Math.exp(-x * x / 2)]); }
function archField(x, y, z) {
  let d = 9;
  for (let i = 0; i < ARCH.length - 1; i++) {
    const [ax, ay] = ARCH[i], [bx, by] = ARCH[i + 1];
    if (Math.abs(x - ax) > d + 0.1 && Math.abs(x - bx) > d + 0.1) continue;
    const ex = bx - ax, ey = by - ay, t = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
  }
  const r = 0.08, a = d - 0.15 + r, b = Math.abs(z) - 0.26 + r, strip = Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - r;
  return smin(strip, rbox(x, y, z, 0, AY + 0.13, 0, AW + 0.15, 0.13, 0.26, 0.08), 0.1);
}

// The thermometer column runs from its pivot just inside the bulb to the top of the tube.
const TH = { pivot: 1.3, top: 5.75 };

// The compass: legs of length L from the hinge. At rest each leg is 10 degrees from the vertical.
const CP = { L: 4.3, rest: 10 * DEG, pose: 35 * DEG };
CP.H = CP.L * Math.cos(CP.rest);

export const MODELS = {
  beadA: beadSpec(C.classA, 'Training sample bead, class A'),
  beadB: beadSpec(C.classB, 'Training sample bead, class B'),
  abacus: {
    label: 'Abacus that counts the classes',
    make() {
      const m = def(), X = AB.postX;
      m.add('frame', (x, y, z) => {
        const posts = Math.min(rbox(x, y, z, -X, 1.9, 0, AB.postR, 1.6, AB.postR, 0.08), rbox(x, y, z, X, 1.9, 0, AB.postR, 1.6, AB.postR, 0.08));
        const bars = Math.min(rbox(x, y, z, 0, 3.32, 0, X + 0.2, 0.18, 0.22, 0.1), rbox(x, y, z, 0, 0.6, 0, X + 0.2, 0.16, 0.22, 0.1));
        const feet = Math.min(rbox(x, y, z, -X, 0.14, 0, 0.32, 0.14, 0.78, 0.1), rbox(x, y, z, X, 0.14, 0, 0.32, 0.14, 0.78, 0.1));
        return smin(smin(posts, bars, 0.1), feet, 0.12);
      }, PAL.wood);
      for (const [r, cy] of AB.rodY.entries()) {
        m.add(`rod${r}`, (x, y, z) => rcyl(x, y, z, 0, cy, 0, 'x', 0.06, X, 0.03), PAL.ink);
        for (let i = 0; i < 10; i++) {
          const cx = -AB.inner + AB.bx + i * AB.pitch, pv = [cx, cy, 0];
          m.add(`b${r}-${i}`, shrink((x, y, z) => ell(x, y, z, cx, cy, 0, AB.bx, AB.by, AB.by), pv, AB.s), r ? C.classB : C.classA, { pivot: pv, free: true });
        }
      }
      return m;
    },
    rest(g) { for (const k in g) if (/^b\d-\d$/.test(k)) g[k].scale.setScalar(AB.s); },
    pose(g) { for (let i = 3; i < 10; i++) g[`b0-${i}`].position.x += AB.slide; for (let i = 7; i < 10; i++) g[`b1-${i}`].position.x += AB.slide; },
    moving: 'Beads slide: 7 of 10 and 3 of 10',
  },
  sandcone: {
    label: 'Cone of sand (Parzen window)',
    make() {
      const m = def();
      m.add('heap', shrink(heap, [0, 0, 0], SH), C.sand);
      return m;
    },
    rest(g) { g.heap.scale.setScalar(SH); },
    moving: 'No moving parts',
  },
  hoop: {
    label: 'Hoop on the floor (k-NN region)',
    make() {
      const m = def(), r = 0.07, w = Math.PI / 8;
      for (let i = 0; i < 8; i++) {
        const c = (2 * i + 1) * w;
        m.add(`stripe${i}`, (x, y, z) => {
          const a = Math.atan2(z, x) - c, rho = Math.hypot(x, z), da = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) - w;
          return Math.max(torus(x, y, z, 0, r, 0, 'y', 1, r), da < Math.PI / 2 ? rho * Math.sin(da) : rho);
        }, i % 2 ? PAL.ink : PAL.gold, i ? { parent: 'stripe0' } : { pivot: [0, 0, 0] });
      }
      return m;
    },
    moving: 'No moving parts',
  },
  bellslider: {
    label: 'Gaussian arch on a track',
    make() {
      const m = def();
      m.add('sleepers', (x, y, z) => { const i = clamp(Math.round((x + 5) / 2), 0, 5) * 2 - 5; return rbox(x, y, z, i, 0.07, 0, 0.24, 0.07, 0.9, 0.06); }, PAL.ink);
      for (const sz of [-1, 1]) m.add(`rail${sz}`, (x, y, z) => rbox(x, y, z, 0, 0.24, sz * 0.52, 6, 0.1, 0.11, 0.07), PAL.ink);
      m.add('carriage', (x, y, z) => rbox(x, y, z, 0, 0.95, 0, 1.25, 0.24, 0.72, 0.18), PAL.cream, { free: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(`wheel${sx}${sz}`, (x, y, z) => rcyl(x, y, z, sx * 0.78, 0.58, sz * 0.52, 'z', 0.24, 0.1, 0.05), PAL.ink, { parent: 'carriage' });
      m.add('arch', archField, C.arch, { parent: 'carriage', pivot: [0, AY, 0] });
      return shrinkModel(m, BS);
    },
    rest(g) { for (const k of ['sleepers', 'rail-1', 'rail1', 'carriage']) g[k].scale.setScalar(BS); g.carriage.position.x = -3; },
    pose(g) { g.carriage.position.x = 2; g.arch.scale.x = 1.4; },
    moving: 'Carriage slides, arch widens',
  },
  thermometer: {
    label: 'Thermometer (log-likelihood)',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rcyl(x, y, z, 0, 0.16, 0, 'y', 0.85, 0.16, 0.1), PAL.ink);
      m.add('bulb', (x, y, z) => ell(x, y, z, 0, 0.92, 0, 0.62, 0.62, 0.62), C.column);
      m.add('tube', (x, y, z) => {
        const shell = Math.max(rcyl(x, y, z, 0, 3.65, 0, 'y', 0.42, 2.35, 0.3), -rcyl(x, y, z, 0, 3.6, 0, 'y', 0.32, 2.3, 0.2));
        return smax(shell, -rbox(x, y, z, 0, 3.7, 0.6, 0.28, 2.05, 0.6, 0.12), 0.05);
      }, PAL.white);
      m.add('collar', (x, y, z) => torus(x, y, z, 0, 1.42, 0, 'y', 0.44, 0.09), PAL.white);
      m.add('ticks', (x, y, z) => { let d = 9; for (let k = 0; k < 6; k++) d = Math.min(d, cone(x, y, z, 0.36, 2.0 + 0.7 * k, 0, k % 2 ? 0.66 : 0.82, 2.0 + 0.7 * k, 0, 0.12, 0.12)); return d; }, PAL.ink);
      m.add('fill', (x, y, z) => rcyl(x, y, z, 0, (TH.pivot + TH.top) / 2, 0, 'y', 0.27, (TH.top - TH.pivot) / 2, 0.1), C.column, { pivot: [0, TH.pivot, 0] });
      return m;
    },
    rest(g) { g.fill.scale.y = 0.25; },
    pose(g) { g.fill.scale.y = 0.9; },
    moving: 'Red column rises',
  },
  compass: {
    label: 'Drawing compass',
    make() {
      const m = def(), { L, H } = CP, hv = [0, H, 0];
      m.add('hinge', (x, y, z) => rcyl(x, y, z, 0, H, 0, 'z', 0.42, 0.3, 0.14), PAL.ink, { pivot: hv, free: true });
      m.add('knob', (x, y, z) => smin(cone(x, y, z, 0, H + 0.25, 0, 0, H + 0.8, 0, 0.17, 0.15), ell(x, y, z, 0, H + 0.95, 0, 0.32, 0.3, 0.32), 0.08), PAL.teal, { parent: 'hinge' });
      // Each leg is made straight down from the hinge, then turned to its rest angle.
      const A = (f) => turnZ(f, -CP.rest, 0, H), B = (f) => turnZ(f, CP.rest, 0, H), at = (t) => H - t * L;
      m.add('legA', A((x, y, z) => cone(x, y, z, 0, H, 0, 0, at(0.86), 0, 0.22, 0.14)), PAL.steel, { parent: 'hinge', pivot: hv });
      m.add('needle', A((x, y, z) => cone(x, y, z, 0, at(0.84), 0, 0, at(1) + 0.012, 0, 0.1, 0.012)), PAL.ink, { parent: 'legA' });
      m.add('legB', B((x, y, z) => cone(x, y, z, 0, H, 0, 0, at(0.74), 0, 0.22, 0.15)), PAL.steel, { parent: 'hinge', pivot: hv });
      m.add('clamp', B((x, y, z) => rcyl(x, y, z, 0, at(0.74), 0, 'y', 0.24, 0.13, 0.07)), PAL.ink, { parent: 'legB' });
      m.add('pencil', B((x, y, z) => smin(rcyl(x, y, z, 0, at(0.79), 0, 'y', 0.16, 0.11 * L, 0.06), cone(x, y, z, 0, at(0.9), 0, 0, at(0.965), 0, 0.16, 0.05), 0.04)), PAL.wood, { parent: 'legB' });
      m.add('lead', B((x, y, z) => cone(x, y, z, 0, at(0.96), 0, 0, at(1) + 0.012, 0, 0.055, 0.012)), PAL.ink, { parent: 'legB' });
      return m;
    },
    // In the pose the legs open, so the hinge comes down to keep both tips on the floor.
    pose(g) { const d = CP.pose - CP.rest; g.legA.rotation.z = -d; g.legB.rotation.z = d; g.hinge.position.y -= CP.L * (Math.cos(CP.rest) - Math.cos(CP.pose)); },
    moving: 'Legs open wider',
  },
};

export const JOINS = {
  abacus: [[/^rod/, 'frame'], [/^b(\d)-\d$/, 'rod$1']],
  hoop: [...Array(8).keys()].map((i) => [`stripe${i}`, `stripe${(i + 1) % 8}`]),
  bellslider: [[/^rail/, 'sleepers'], [/^wheel-?1-1$/, 'rail-1'], [/^wheel-?11$/, 'rail1'], [/^wheel/, 'carriage'], ['arch', 'carriage']],
  thermometer: [['bulb', 'base'], ['collar', 'bulb'], ['collar', 'tube'], ['ticks', 'tube'], ['fill', 'bulb']],
  compass: [['knob', 'hinge'], ['legA', 'hinge'], ['legB', 'hinge'], ['needle', 'legA'], ['clamp', 'legB'], ['pencil', 'clamp'], ['lead', 'pencil']],
};
