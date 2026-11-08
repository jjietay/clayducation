// Models for the course Part 2, video 6. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this set. Robot orange, map yellow and target green are kept for their roles.
const C = {
  violet: '#7a5cc8', lilac: '#b8a5ec', glow: '#fff1c9', valve: '#6d7480', gate: '#f4ecd8', wheel: '#cf4f45',
  step: '#4a56a6', sigmoid: '#2f9e8f', relu: '#7a5cc8', blue: '#3d63b8', plum: '#8e3f8f',
  basin: '#e8dcc3', shell: '#5d6b84', crust: '#e8d3a8', ground: '#9a6a4f', smooth: '#2f9e8f', wiggly: '#cf4f45',
};

// All models are at true size. A large model sets a coarse mesh step and a thin wire sets a fine one
// (the spec's step), so the triangle counts stay near the rest of the kit.

// 2D rounded box in the x-y plane, and a 2D shape pushed out along z to |z| <= hz with round edges r.
const box2 = (px, py, cx, cy, hx, hy, r) => { const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
const extrude = (d2, z, hz, r) => { const a = d2 + r, b = Math.abs(z) - hz + r; return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - r; };
// Distance to the region under a curve y = h(x), from its value and slope.
const under = (y, h, dh) => (y - h) / Math.sqrt(1 + dh * dh);

// ---------- activation ramps ----------
// Each ramp is a block from x = -3 to 3, 1.2 deep. At z = 0 its top surface is exactly y = h(x).
// Low level 0.4, high level 2.6. A rim 0.16 high on the front and back top edges (|z| from 0.47 to 0.6)
// keeps a ball on the track, so a ball of radius up to about 0.42 rolls on the curve.
const LO = 0.4, HI = 2.6, RIM = 0.16;
const sig = (x) => 1 / (1 + Math.exp(-2 * x));
const PROFILES = {
  // Step: y = 0.4 for x < 0, y = 2.6 for x > 0. A vertical wall at x = 0, with a round top edge (r 0.22)
  // and a round fillet at its foot.
  step: (x, y) => smin(y - LO, box2(x, y, 3, HI / 2, 3, HI / 2, 0.22), 0.25),
  // Sigmoid: y = 0.4 + 2.2 / (1 + e^(-2x)).
  sigmoid: (x, y) => { const s = sig(x); return under(y, LO + (HI - LO) * s, (HI - LO) * 2 * s * (1 - s)); },
  // ReLU: y = 0.4 + 0.7333 * max(0, x), so y = 2.6 at x = 3. Its high end is rounded off for x > 2.6.
  relu: (x, y) => Math.min(y - LO, (y - LO - x * (HI - LO) / 3) / Math.hypot(1, (HI - LO) / 3)),
};
function rampSpec(kind, label, color, k = 0.22) {
  const prof = PROFILES[kind], outer = (x, y) => box2(x, y, 0, 1.8, 3, 1.8, 0.12);
  const f = (x, y, z) => {
    const body = extrude(smax(prof(x, y), outer(x, y), k), z, 0.6, 0.1);
    const rim = smax(extrude(smax(prof(x, y - RIM), outer(x, y), k), z, 0.6, 0.07), 0.47 - Math.abs(z), 0.05);
    return smin(body, rim, 0.04);
  };
  return {
    label,
    step: 0.04,
    make() { return def().add('ramp', f, color); },
    moving: 'No moving parts',
  };
}

// ---------- error bowl ----------
// Inside surface y = 0.9 + 0.12 r² (r = hypot(x, z)), exact for r <= 4.3. The round lip starts at r = 4.38
// (top y = 3.61, outside radius 5.1), and a flat ring foot is below. Inside and lip light, outside dark.
const BY0 = 0.9, BK = 0.12, BR = 4.5, BYR = BY0 + BK * BR * BR;
const bowlP = (r) => BY0 + BK * r * r, bowlG = (r) => Math.sqrt(1 + (2 * BK * r) ** 2);

// ---------- terrain ----------
// Top surface along x, the same for all z in [-1.5, 1.5]:
//   c(u) = (1 + cos(pi u)) / 2 for |u| < 1, else 0
//   h(x) = 2.4 - 0.8 c((x + 2.5) / 1.6) - 1.8 c((x - 2.5) / 1.8) + 0.3 c(x / 1.1),  -5 <= x <= 5
// Local minimum h(-2.5) = 1.6, global minimum h(2.5) = 0.6, hump h(0) = 2.7, flat h = 2.4 for x <= -4.1 and x >= 4.3.
const bump = (u) => (Math.abs(u) < 1 ? (1 + Math.cos(Math.PI * u)) / 2 : 0);
const dbump = (u, w) => (Math.abs(u) < 1 ? -Math.PI * Math.sin(Math.PI * u) / (2 * w) : 0);
const terrH = (x) => 2.4 - 0.8 * bump((x + 2.5) / 1.6) - 1.8 * bump((x - 2.5) / 1.8) + 0.3 * bump(x / 1.1);
const terrD = (x) => -0.8 * dbump((x + 2.5) / 1.6, 1.6) - 1.8 * dbump((x - 2.5) / 1.8, 1.8) + 0.3 * dbump(x / 1.1, 1.1);

// ---------- boundary wires ----------
// Both lie on the floor along x from -4 to 4, tube centre at y = 0.2, tube radius 0.065.
//   smooth: z = 1 - (x / 4)²                                           (one bend, z = 0 at both ends)
//   wiggly: z = 1 - (x / 4)² + 0.9 asin(0.93 sin(3 pi (x + 4) / 4)) / asin(0.93)
// The wiggly wire goes through the same end points (-4, 0) and (4, 0), with 6 sharp bends at
// x = -3.33, -2, -0.67, 0.67, 2, 3.33.
const WY = 0.2, WR = 0.065;
const wireZ = {
  smooth: (x) => 1 - (x / 4) ** 2,
  wiggly: (x) => 1 - (x / 4) ** 2 + 0.9 * Math.asin(0.93 * Math.sin(3 * Math.PI * (x + 4) / 4)) / Math.asin(0.93),
};
function wireSpec(kind, label, color, n) {
  const zf = wireZ[kind], dx = 8 / n, P = Array.from({ length: n + 1 }, (_, i) => [-4 + i * dx, zf(-4 + i * dx)]);
  const feetX = [-4, -2, 0, 2, 4];
  const tube = (x, y, z) => {
    const i0 = Math.max(0, Math.floor((x + 4 - 0.3) / dx)), i1 = Math.min(n - 1, Math.ceil((x + 4 + 0.3) / dx));
    let d = 0.3;
    for (let i = i0; i <= i1; i++) d = Math.min(d, cone(x, y, z, P[i][0], WY, P[i][1], P[i + 1][0], WY, P[i + 1][1], WR, WR));
    for (const e of [-4, 4]) d = Math.min(d, ell(x, y, z, e, WY, 0, 0.1, 0.1, 0.1));
    return d;
  };
  const feet = (x, y, z) => { let d = 9; for (const fx of feetX) d = Math.min(d, rcyl(x, y, z, fx, 0.08, zf(fx), 'y', 0.13, 0.08, 0.05)); return d; };
  return {
    label,
    step: 0.0175,
    make() {
      const m = def();
      m.add('wire', tube, color);
      m.add('feet', feet, PAL.ink);
      return m;
    },
    moving: 'No moving parts',
  };
}

export const MODELS = {
  neuron: {
    label: 'Neuron',
    make() {
      const m = def(), Y = 1.5;
      // Three dendrites on the left (-x) and the axon on the right (+x), all blended into the cell body.
      const paths = [
        [[-0.45, 1.95, 0.2], [-1.1, 2.4, 0.14], [-1.6, 2.4, 0.12]],
        [[-0.6, Y, 0.22], [-1.6, Y, 0.12]],
        [[-0.45, 1.05, 0.2], [-1.1, 0.6, 0.14], [-1.6, 0.6, 0.12]],
        [[0.6, Y, 0.25], [1.55, Y, 0.14]],
      ];
      m.add('soma', (x, y, z) => {
        let d = ell(x, y, z, 0, Y, 0, 0.8, 0.78, 0.7);
        for (const p of paths) for (let i = 0; i + 1 < p.length; i++) d = smin(d, cone(x, y, z, p[i][0], p[i][1], 0, p[i + 1][0], p[i + 1][1], 0, p[i][2], p[i + 1][2]), 0.18);
        return d;
      }, C.violet);
      // Round ends where the pipes connect.
      for (const [i, cy] of [2.4, Y, 0.6].entries()) m.add(`in${i}`, (x, y, z) => ell(x, y, z, -1.72, cy, 0, 0.19, 0.19, 0.19), C.lilac);
      m.add('out', (x, y, z) => ell(x, y, z, 1.7, Y, 0, 0.22, 0.22, 0.22), C.lilac);
      m.add('foot', (x, y, z) => smin(rcyl(x, y, z, 0, 0.08, 0, 'y', 0.55, 0.08, 0.06), cone(x, y, z, 0, 0.1, 0, 0, 0.95, 0, 0.2, 0.16), 0.1), PAL.ink);
      // The nucleus glows when the neuron fires: the scene scales the group 'glow' up.
      m.add('glow', (x, y, z) => ell(x, y, z, 0, 1.6, 0.6, 0.34, 0.32, 0.16), C.glow, { pivot: [0, 1.6, 0.6], led: C.glow });
      return m;
    },
    pose(g) { g.glow.scale.setScalar(1.5); },
    moving: 'Nucleus glows larger',
  },
  pipe: {
    label: 'Pipe with a valve',
    make() {
      const m = def(), A = 0.3, W = A + 0.44;
      m.add('tube', (x, y, z) => cone(x, y, z, -1.38, A, 0, 1.38, A, 0, 0.15, 0.15), PAL.steel);
      for (const sx of [-1, 1]) m.add(`flange${sx}`, (x, y, z) => rcyl(x, y, z, sx * 1.42, A, 0, 'x', 0.2, 0.08, 0.04), PAL.ink);
      // The valve body has a round window on its front. The gate disc in the window shows how open it is.
      m.add('valve', (x, y, z) => smax(rbox(x, y, z, 0, A, 0, 0.32, 0.26, 0.28, 0.13), -rcyl(x, y, z, 0, A, 0.3, 'z', 0.17, 0.1, 0.02), 0.03), C.valve);
      m.add('window', (x, y, z) => rcyl(x, y, z, 0, A, 0.2, 'z', 0.18, 0.02, 0.01), PAL.navy);
      m.add('gate', (x, y, z) => rcyl(x, y, z, 0, A, 0.245, 'z', 0.15, 0.025, 0.02), C.gate, { pivot: [0, A, 0.245] });
      m.add('stem', (x, y, z) => cone(x, y, z, 0, A + 0.2, 0, 0, W, 0, 0.06, 0.06), PAL.ink);
      // Hand wheel: rim, three spokes and a hub. It turns about the stem.
      m.add('wheel', (x, y, z) => {
        let d = torus(x, y, z, 0, W, 0, 'y', 0.24, 0.05);
        for (let i = 0; i < 3; i++) { const a = i * 2.094; d = Math.min(d, cone(x, y, z, 0, W, 0, Math.sin(a) * 0.24, W, Math.cos(a) * 0.24, 0.035, 0.035)); }
        return smin(d, ell(x, y, z, 0, W, 0, 0.08, 0.07, 0.08), 0.03);
      }, C.wheel, { pivot: [0, W, 0] });
      return m;
    },
    rest(g) { g.gate.scale.set(0.25, 0.25, 1); },
    pose(g) { g.wheel.rotation.y = 1.5; g.gate.scale.set(1, 1, 1); },
    moving: 'Wheel turns, gate opens',
  },
  rampStep: rampSpec('step', 'Step ramp', C.step),
  rampSigmoid: rampSpec('sigmoid', 'Sigmoid ramp', C.sigmoid),
  rampRelu: rampSpec('relu', 'ReLU ramp', C.relu, 0.45),
  tokenCone: {
    label: 'Cone token',
    step: 0.024,
    make() { return def().add('cone', (x, y, z) => smax(cone(x, y, z, 0, 0.12, 0, 0, 0.92, 0, 0.46, 0.07), -y, 0.1), C.blue); },
    moving: 'No moving parts',
  },
  tokenCube: {
    label: 'Cube token',
    step: 0.03,
    make() { return def().add('cube', (x, y, z) => rbox(x, y, z, 0, 0.45, 0, 0.45, 0.45, 0.45, 0.12), C.plum); },
    moving: 'No moving parts',
  },
  bowl: {
    label: 'Error bowl',
    step: 0.12,
    make() {
      const m = def();
      m.add('shell', (x, y, z) => {
        const r = Math.hypot(x, z);
        return Math.max(ell(r, y, 0, 0, BYR, 0, 5.0, 3.05, 1), (y - bowlP(r) + 0.22) / bowlG(r), y - BYR);
      }, C.shell);
      // The light inside and the round lip are one shape, so no seam shows between them.
      m.add('basin', (x, y, z) => {
        const r = Math.hypot(x, z), g = bowlG(r), p = bowlP(r);
        return smin(Math.max((y - p) / g, (p - 0.45 - y) / g, r - 4.6), torus(x, y, z, 0, BYR - 0.08, 0, 'y', 4.74, 0.36), 0.1);
      }, C.basin);
      m.add('foot', (x, y, z) => box2(Math.hypot(x, z), y, 2.45, 0.475, 0.45, 0.475, 0.12), PAL.ink);
      return m;
    },
    moving: 'No moving parts',
  },
  terrain: {
    label: 'Error terrain',
    step: 0.08,
    make() {
      const m = def(), outer = (x, y) => box2(x, y, 0, 1.6, 5, 1.6, 0.25);
      m.add('ground', (x, y, z) => extrude(smax(under(y, terrH(x) - 0.12, terrD(x)), outer(x, y), 0.15), z, 1.5, 0.15), C.ground);
      m.add('crust', (x, y, z) => { const h = terrH(x), dh = terrD(x); return extrude(smax(Math.max(under(y, h, dh), -under(y, h - 0.28, dh)), box2(x, y, 0, 1.6, 5.03, 1.6, 0.25), 0.1), z, 1.53, 0.12); }, C.crust);
      return m;
    },
    moving: 'No moving parts',
  },
  wireSmooth: wireSpec('smooth', 'Smooth boundary wire', C.smooth, 48),
  wireWiggly: wireSpec('wiggly', 'Wiggly boundary wire', C.wiggly, 240),
};

export const JOINS = {
  neuron: [[/^in\d$/, 'soma'], ['out', 'soma'], ['foot', 'soma'], ['glow', 'soma']],
  pipe: [[/^flange/, 'tube'], ['valve', 'tube'], ['window', 'valve'], ['gate', 'window'], ['stem', 'valve'], ['wheel', 'stem']],
  bowl: [['basin', 'shell'], ['foot', 'shell']],
  terrain: [['crust', 'ground']],
  wireSmooth: [['feet', 'wire']],
  wireWiggly: [['feet', 'wire']],
};
