// Models for the course Part 2, video 5. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this video. The two sample classes are blue and plum in all the models.
const BLUE = '#3d63b8', PLUM = '#8e3f8f', BAR_BLUE = '#4f86c6', BAR_PLUM = '#b26cb0';

// A fixed random number from 0 to 1 for each i, so that the two colours mix with no pattern.
const hash = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };

// Distance to the nearest ball of a list of [x, y, z] centres.
function ballDist(x, y, z, list, r) { let d = 9; for (const [a, b, c] of list) d = Math.min(d, Math.hypot(x - a, y - b, z - c) - r); return d; }

// A slab whose lower face follows lo and whose upper face follows hi (both at this x), with half
// width hx, half depth hz and rounded edges r. s is the slope of the faces at this x.
function curvedSlab(x, y, z, hx, hz, lo, hi, s, r) {
  const dy = Math.max(lo - y, y - hi) / Math.sqrt(1 + s * s);
  const qx = Math.abs(x) - hx + r, qy = dy + r, qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// Signed distance to a triangle in 2D, with the corners a, b and c.
function tri2(px, py, ax, ay, bx, by, cx, cy) {
  let d = 1e9;
  for (const [ex, ey, vx, vy] of [[bx - ax, by - ay, px - ax, py - ay], [cx - bx, cy - by, px - bx, py - by], [ax - cx, ay - cy, px - cx, py - cy]]) {
    const t = clamp((vx * ex + vy * ey) / (ex * ex + ey * ey), 0, 1), qx = vx - ex * t, qy = vy - ey * t;
    d = Math.min(d, qx * qx + qy * qy);
  }
  const c0 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), c1 = (cx - bx) * (py - by) - (cy - by) * (px - bx), c2 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const inside = (c0 >= 0 && c1 >= 0 && c2 >= 0) || (c0 <= 0 && c1 <= 0 && c2 <= 0);
  return (inside ? -1 : 1) * Math.sqrt(d);
}

// The vat: a dome of blue clay fills it, and the balls sit on the dome in a sunflower spiral.
const VAT = { floor: 2.45, R: 1.52, dome: 0.72, ball: 0.22 };
const vatDome = (x, y, z) => smax(ell(x, y, z, 0, VAT.floor, 0, VAT.R, VAT.dome, VAT.R), VAT.floor - 0.05 - y, 0.04);
const VAT_BALLS = (() => {
  const out = { blue: [], plum: [] }, n = 46, rMax = 1.28;
  for (let i = 0; i < n; i++) {
    const r = rMax * Math.sqrt((i + 0.5) / n), a = i * 2.39996, u = r / VAT.R;
    const y = VAT.floor + VAT.dome * Math.sqrt(Math.max(0, 1 - u * u)) + 0.04;
    (hash(i) < 0.45 ? out.plum : out.blue).push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  return out;
})();

// The jar: 7 balls in a ring on the inner floor and 1 in the middle, level with the rim. The lid is a
// hollow dome, so it closes over them.
const JAR = { floor: 1.32, ball: 0.18 };
const JAR_BALLS = (() => {
  const out = { blue: [], plum: [] }, y0 = JAR.floor + JAR.ball;
  for (let i = 0; i < 7; i++) { const a = i * 2 * Math.PI / 7 + 0.3; (i % 2 ? out.plum : out.blue).push([0.3 * Math.cos(a), y0, 0.3 * Math.sin(a)]); }
  out.plum.push([0, y0 + 0.04, 0]);
  return out;
})();

// The spectrum: column k stands at x = (k - 5.5) * 0.72, and its height above the plate top
// (y = 0.24) is 4.2 / (1 + 0.55 k).
const COL = { n: 12, pitch: 0.72, top: 0.24, half: 0.25 };
const COLUMN_X = Array.from({ length: COL.n }, (_, k) => (k - (COL.n - 1) / 2) * COL.pitch);
const COLUMN_H = Array.from({ length: COL.n }, (_, k) => 4.2 / (1 + 0.55 * k));

// The press: the lower face of the ram is at low + drop * g(u), with u from 0 (left end, x = -2.95)
// to 1 (right end, x = 2.95) and g(u) = (1/(u + b) - 1/(1 + b)) / (1/b - 1/(1 + b)): 1 at the left, 0 at the right.
const MOLD = { half: 2.95, b: 0.3, drop: 1.2, low: 2.6, top: 4.32, face: 0.24, depth: 0.32, travel: 1.8, rodTop: 7.35 };
const moldU = (x) => clamp((x + MOLD.half) / (2 * MOLD.half), 0, 1);
const moldFace = (x) => { const u = moldU(x), b = MOLD.b; return MOLD.low + MOLD.drop * (1 / (u + b) - 1 / (1 + b)) / (1 / b - 1 / (1 + b)); };
const moldSlope = (x) => { const u = moldU(x), b = MOLD.b; return MOLD.drop / (2 * MOLD.half) / ((u + b) * (u + b)) / (1 / b - 1 / (1 + b)); };

// The scoreboard: four bar slots in the lower half of the face. Bar i is built at its rest height
// SB.rest[i], so a height v is scale.y = v / SB.rest[i]. The slot holds a bar up to about 1.06 tall. PAL is read only in make(), because models.js imports this file.
const SB = { foot: 2.85, slots: [-1.65, -0.55, 0.55, 1.65], rest: [0.75, 0.5, 0.95, 0.62] };

export const MODELS = {
  vat: {
    label: 'Vat full of samples',
    make() {
      const m = def();
      m.add('body', (x, y, z) => {
        const rho = Math.hypot(x, z), R = 1.62 + 0.08 * y / 2.85, rr = 0.22;
        const qx = rho - R + rr, qy = Math.abs(y - 1.425) - 1.425 + rr;
        let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
        d = smin(d, torus(x, y, z, 0, 2.86, 0, 'y', 1.68, 0.14), 0.08);
        for (const by of [0.7, 2.05]) d = smin(d, torus(x, y, z, 0, by, 0, 'y', 1.62 + 0.08 * by / 2.85, 0.075), 0.04);
        return smax(d, -rcyl(x, y, z, 0, VAT.floor + 1, 0, 'y', 1.5, 1, 0.12), 0.06);
      }, PAL.steel, { step: 0.05 });
      m.add('blue', (x, y, z) => smin(vatDome(x, y, z), ballDist(x, y, z, VAT_BALLS.blue, VAT.ball), 0.06), BLUE, { step: 0.04 });
      m.add('plum', (x, y, z) => smax(ballDist(x, y, z, VAT_BALLS.plum, VAT.ball), -vatDome(x, y, z) - 0.03, 0.02), PLUM, { step: 0.035 });
      return m;
    },
    moving: 'No moving parts',
  },
  jar: {
    label: 'Jar of samples with a lid',
    make() {
      const m = def();
      m.add('body', (x, y, z) => {
        let d = smin(rcyl(x, y, z, 0, 0.72, 0, 'y', 0.7, 0.72, 0.24), rcyl(x, y, z, 0, 1.47, 0, 'y', 0.58, 0.18, 0.05), 0.12);
        d = smin(d, torus(x, y, z, 0, 1.6, 0, 'y', 0.58, 0.07), 0.05);
        return smax(d, -rcyl(x, y, z, 0, JAR.floor + 1, 0, 'y', 0.5, 1, 0.08), 0.04);
      }, PAL.white);
      m.add('blue', (x, y, z) => ballDist(x, y, z, JAR_BALLS.blue, JAR.ball), BLUE);
      m.add('plum', (x, y, z) => ballDist(x, y, z, JAR_BALLS.plum, JAR.ball), PLUM);
      m.add('lid', (x, y, z) => {
        const dome = smax(smax(ell(x, y, z, 0, 1.67, 0, 0.72, 0.32, 0.72), 1.65 - y, 0.03), -ell(x, y, z, 0, 1.67, 0, 0.56, 0.2, 0.56), 0.03);
        return smin(dome, ell(x, y, z, 0, 2.0, 0, 0.17, 0.1, 0.17), 0.06);
      }, PAL.wood, { pivot: [0.62, 1.67, 0], free: true });
      return m;
    },
    pose(g) { g.lid.position.x += 0.5; g.lid.position.y += 0.45; g.lid.rotation.z = -0.55; },
    moving: 'Lid lifts and tilts off',
  },
  columns: {
    label: 'Eigenvalue spectrum columns',
    make() {
      const m = def();
      m.add('plate', (x, y, z) => rbox(x, y, z, 0, COL.top / 2, 0, 4.5, COL.top / 2, 0.5, 0.08), PAL.ink, { step: 0.06 });
      for (let k = 0; k < COL.n; k++) {
        const cx = COLUMN_X[k], h = COLUMN_H[k], lo = COL.top - 0.04, r = Math.min(0.12, h / 2);
        m.add(`col${k}`, (x, y, z) => rbox(x, y, z, cx, (lo + COL.top + h) / 2, 0, COL.half, (COL.top + h - lo) / 2, COL.half, r), PAL.teal, { pivot: [cx, COL.top, 0], step: 0.032 });
      }
      return m;
    },
    pose(g) { for (let k = 0; k < COL.n; k++) g[`col${k}`].scale.y = k < 3 ? 1.15 : 0.55; },
    moving: 'Each column scales in height',
  },
  seesaw: {
    label: 'Seesaw',
    make() {
      const m = def(), P = [0, 1.55, 0], Y = 1.82;
      m.add('fulcrum', (x, y, z) => {
        const t = tri2(x, y, -0.85, 0, 0.85, 0, 0, 1.5) + 0.1, dz = Math.abs(z) - 0.42 + 0.08;
        const d = Math.hypot(Math.max(t, 0), Math.max(dz, 0)) + Math.min(Math.max(t, dz), 0) - 0.08;
        return smin(d, rcyl(x, y, z, P[0], P[1], 0, 'z', 0.18, 0.5, 0.05), 0.08);
      }, PAL.ink);
      m.add('plank', (x, y, z) => rbox(x, y, z, 0, Y, 0, 3.5, 0.13, 0.45, 0.1), PAL.wood, { pivot: P });
      for (const s of [-1, 1]) {
        m.add(`seat${s}`, (x, y, z) => rbox(x, y, z, s * 3.0, Y + 0.24, 0, 0.42, 0.13, 0.4, 0.12), PAL.cream, { parent: 'plank' });
        m.add(`handle${s}`, (x, y, z) => smin(cone(x, y, z, s * 2.45, Y + 0.08, 0, s * 2.45, Y + 0.75, 0, 0.1, 0.09), cone(x, y, z, s * 2.45, Y + 0.75, -0.34, s * 2.45, Y + 0.75, 0.34, 0.1, 0.1), 0.06), PAL.ink, { parent: 'plank' });
      }
      return m;
    },
    pose(g) { g.plank.rotation.z = -0.3; },
    moving: 'Plank tips about the fulcrum',
  },
  discs: {
    label: 'Two overlapping plates',
    make() {
      const m = def(), c = 1.735, R = 2.6;
      m.add('plateA', (x, y, z) => rcyl(x, y, z, -c, 0.09, 0, 'y', R, 0.09, 0.06), BLUE, { step: 0.05 });
      m.add('plateB', (x, y, z) => rcyl(x, y, z, c, 0.11, 0, 'y', R, 0.11, 0.06), PLUM, { step: 0.05 });
      m.add('overlap', (x, y, z) => {
        const rr = 0.06, d2 = Math.max(Math.hypot(x + c, z) - R, Math.hypot(x - c, z) - R) + rr, dy = Math.abs(y - 0.23) - 0.13 + rr;
        return Math.min(Math.max(d2, dy), 0) + Math.hypot(Math.max(d2, 0), Math.max(dy, 0)) - rr;
      }, PAL.red, { step: 0.04 });
      return m;
    },
    moving: 'No moving parts',
  },
  mold: {
    label: 'Press with a shaped plate',
    make() {
      const m = def(), PZ = -1.05;
      m.add('frame', (x, y, z) => {
        let d = 9;
        for (const s of [-1, 1]) {
          d = Math.min(d, rbox(x, y, z, s * 3.25, 2.62, PZ, 0.25, 2.62, 0.25, 0.1));
          d = smin(d, rbox(x, y, z, s * 3.25, 0.1, PZ, 0.45, 0.1, 0.42, 0.08), 0.08);
        }
        d = smin(d, rbox(x, y, z, 0, 4.95, PZ, 3.5, 0.3, 0.27, 0.12), 0.1);
        d = smin(d, rbox(x, y, z, 0, 4.95, -0.42, 0.55, 0.3, 0.78, 0.12), 0.1);
        return smin(d, rcyl(x, y, z, 0, 5.3, 0, 'y', 0.34, 0.1, 0.05), 0.06);
      }, PAL.ink, { step: 0.05 });
      m.add('ram', (x, y, z) => {
        const body = curvedSlab(x, y, z, MOLD.half, MOLD.depth, moldFace(x) + MOLD.face - 0.02, MOLD.top, moldSlope(x), 0.1);
        return smin(body, cone(x, y, z, 0, MOLD.top - 0.1, 0, 0, MOLD.top + 0.25, 0, 0.2, 0.15), 0.1);
      }, PAL.steel, { pivot: [0, MOLD.top, 0], free: true, step: 0.045 });
      m.add('screw', (x, y, z) => cone(x, y, z, 0, MOLD.top + 0.05, 0, 0, MOLD.rodTop, 0, 0.15, 0.15) + 0.018 * Math.sin(Math.atan2(z, x) + y * 18), PAL.steel, { parent: 'ram', step: 0.02 });
      m.add('face', (x, y, z) => curvedSlab(x, y, z, MOLD.half, MOLD.depth + 0.02, moldFace(x), moldFace(x) + MOLD.face, moldSlope(x), 0.05), PAL.teal, { parent: 'ram', step: 0.04 });
      m.add('handle', (x, y, z) => { const Y = MOLD.rodTop; return Math.min(cone(x, y, z, -0.85, Y, 0, 0.85, Y, 0, 0.09, 0.09), ell(x, y, z, -0.92, Y, 0, 0.17, 0.17, 0.17), ell(x, y, z, 0.92, Y, 0, 0.17, 0.17, 0.17), ell(x, y, z, 0, Y, 0, 0.2, 0.15, 0.2)); }, PAL.ink, { parent: 'ram' });
      return m;
    },
    pose(g) { g.ram.position.y -= MOLD.travel; },
    moving: 'Ram presses down',
  },
  scoreboard: {
    label: 'Scoreboard with four bars',
    make() {
      const m = def(), C = 4.0, colors = [PAL.teal, PAL.cream, BAR_BLUE, BAR_PLUM];
      m.add('board', (x, y, z) => smax(rbox(x, y, z, 0, C, 0, 2.5, 1.5, 0.16, 0.12), -rbox(x, y, z, 0, C, 0, 2.3, 1.3, 0.5, 0.05), 0.04), PAL.cream, { step: 0.045 });
      m.add('face', (x, y, z) => {
        let s = 9;
        for (const sx of SB.slots) s = Math.min(s, rbox(x, y, z, sx, 3.38, 0.15, 0.33, 0.58, 0.09, 0.05));
        return smax(rbox(x, y, z, 0, C, 0, 2.32, 1.32, 0.12, 0.03), -s, 0.03);
      }, PAL.screen, { step: 0.04 });
      for (const sx of [-1, 1]) m.add(`leg${sx}`, (x, y, z) => smin(rbox(x, y, z, sx * 1.8, 1.31, 0, 0.14, 1.31, 0.12, 0.07), rbox(x, y, z, sx * 1.8, 0.09, 0, 0.32, 0.09, 0.45, 0.07), 0.08), PAL.ink);
      for (let i = 0; i < 4; i++) {
        const cx = SB.slots[i];
        const h = SB.rest[i];
        m.add(`bar${i}`, (x, y, z) => rbox(x, y, z, cx, SB.foot + h / 2, 0.1, 0.25, h / 2, 0.1, 0.08), colors[i], { pivot: [cx, SB.foot, 0.1] });
      }
      return m;
    },
    pose(g) { for (const [i, v] of [0.4, 1.0, 0.3, 0.85].entries()) g[`bar${i}`].scale.y = v / SB.rest[i]; },
    moving: 'Each bar scales in height',
  },
};

export const JOINS = {
  vat: [['blue', 'body'], ['plum', 'blue']],
  jar: [['blue', 'body'], ['plum', 'body'], ['lid', 'body']],
  columns: [[/^col/, 'plate']],
  seesaw: [['plank', 'fulcrum'], [/^seat/, 'plank'], [/^handle/, 'plank']],
  discs: [['plateA', 'plateB'], ['overlap', 'plateA'], ['overlap', 'plateB']],
  mold: [['screw', 'frame'], ['screw', 'ram'], ['face', 'ram'], ['handle', 'screw']],
  scoreboard: [[/^leg/, 'board'], ['face', 'board'], [/^bar/, 'face']],
};
