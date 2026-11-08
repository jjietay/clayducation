// Models for the course Part 2, video 2. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this set. Robot orange, map yellow and target green stay free for their roles.
const C = { apple: '#cf4f45', pear: '#b5c94a', stem: '#6b5138', ring: '#2f6fd6', frame: '#56657a' };

// A leaf: a flat ellipse turned by angle a in the x-y plane about (cx, cy).
const leaf = (x, y, z, cx, cy, a, len, w) => {
  const c = Math.cos(a), s = Math.sin(a), px = x - cx, py = y - cy, u = c * px - s * py, v = s * px + c * py;
  return ell(u, v + Math.abs(u) * 0.05, z, 0, 0, 0, len, 0.032, w);
};

// The Gaussian hill: top surface y = B + A exp(-r² / 2σ²) on a plate of radius R.
const HILL = { A: 2.6, S: 1.5, B: 0.14, R: 4.7 };
function hill(x, y, z) {
  const { A, S, B, R } = HILL, r = Math.hypot(x, z), e = A * Math.exp(-r * r / (2 * S * S)), slope = e * r / (S * S);
  const top = (y - B - e) / Math.sqrt(1 + slope * slope);
  const plate = smax(smax(top, -y, 0.02), r - R, 0.12);
  return smin(plate, torus(x, y, z, 0, 0.13, 0, 'y', R - 0.1, 0.13), 0.08);
}

// A contour ring on the floor: a flat, rounded band, radius 1 to its centre line.
const RING = { w: 0.075, h: 0.045, r: 0.04, y: 0.065 };
const band = (x, y, z) => {
  const dx = Math.abs(Math.hypot(x, z) - 1) - RING.w + RING.r, dy = Math.abs(y - RING.y) - RING.h + RING.r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - RING.r;
};
const DASHES = 24;

// Film strip: 6 frames along x, sprocket holes on both edges.
const FILM = { cy: 1.0, hx: 3.5, hy: 0.8, hz: 0.06, n: 6, pitch: 1.15 };
const frameOf = (x) => clamp(Math.round(x / FILM.pitch + (FILM.n - 1) / 2), 0, FILM.n - 1);
const frameX = (i) => (i - (FILM.n - 1) / 2) * FILM.pitch;

export const MODELS = {
  apple: {
    label: 'Apple',
    make() {
      const m = def();
      m.add('body', (x, y, z) => {
        // Wider at the shoulders than at the base, with a deep top dimple and a small one below.
        const k = 1 + 0.09 * clamp((y - 0.6) / 0.6, -1, 1), b = ell(x / k, y, z / k, 0, 0.62, 0, 0.75, 0.62, 0.75) * k;
        return smax(smax(b, -ell(x, y, z, 0, 1.3, 0, 0.26, 0.2, 0.26), 0.16), -ell(x, y, z, 0, -0.04, 0, 0.14, 0.08, 0.14), 0.07) * 0.9;
      }, C.apple, { step: 0.033 });
      m.add('stem', (x, y, z) => cone(x, y, z, 0, 1.04, 0, 0.05, 1.44, 0, 0.05, 0.035), C.stem);
      m.add('leaf', (x, y, z) => leaf(x, y, z, 0.27, 1.36, -0.35, 0.26, 0.12), PAL.leaf);
      return m;
    },
    moving: 'No moving parts',
  },
  pear: {
    label: 'Pear',
    make() {
      const m = def();
      m.add('body', (x, y, z) => smax(smin(ell(x, y, z, 0, 0.54, 0, 0.6, 0.54, 0.6), ell(x, y, z, 0, 1.24, 0, 0.27, 0.34, 0.27), 0.42), -ell(x, y, z, 0, -0.03, 0, 0.12, 0.06, 0.12), 0.06), C.pear, { step: 0.029 });
      m.add('stem', (x, y, z) => cone(x, y, z, 0, 1.45, 0, -0.07, 1.74, 0, 0.05, 0.035), C.stem);
      m.add('leaf', (x, y, z) => leaf(x, y, z, 0.17, 1.66, -0.5, 0.19, 0.09), PAL.leaf);
      return m;
    },
    moving: 'No moving parts',
  },
  hill: {
    label: 'Gaussian density hill',
    make() {
      const m = def();
      // A coarse mesh step keeps the large smooth surface at a low triangle count.
      m.add('hill', hill, PAL.cream, { step: 0.064 });
      return m;
    },
    moving: 'No moving parts. Scale m.root in x, y and z',
  },
  ringCircle: {
    label: 'Dashed contour ring',
    make() {
      const m = def(), step = 2 * Math.PI / DASHES;
      m.add('dashes', (x, y, z) => {
        // Each dash is a short rounded bar on the ring, 60 % of each step long.
        const a = Math.round(Math.atan2(z, x) / step) * step, c = Math.cos(a), s = Math.sin(a);
        return rbox(x * c + z * s, y, z * c - x * s, 1, RING.y, 0, RING.w, RING.h, 0.3 * step, RING.r);
      }, PAL.ink);
      return m;
    },
    moving: 'No moving parts. Scale m.root in x and z',
  },
  ringEllipse: {
    label: 'Solid contour ring',
    make() {
      const m = def();
      m.add('ring', band, C.ring);
      return m;
    },
    moving: 'No moving parts. Scale m.root in x and z',
  },
  tape: {
    label: 'Tape measure',
    make() {
      const m = def(), X0 = 0.6, Y = 0.06, L = 6;
      m.add('case', (x, y, z) => rbox(x, y, z, 0, 0.64, 0, 0.62, 0.64, 0.32, 0.3), PAL.teal);
      m.add('badge', (x, y, z) => rcyl(x, y, z, -0.04, 0.68, 0.31, 'z', 0.34, 0.05, 0.04), PAL.cream);
      m.add('button', (x, y, z) => rbox(x, y, z, -0.12, 1.28, 0, 0.2, 0.07, 0.11, 0.05), PAL.ink);
      m.add('mouth', (x, y, z) => rbox(x, y, z, 0.54, 0.14, 0, 0.1, 0.13, 0.31, 0.05), PAL.ink);
      // The strip pivots at the slot (x = 0.6): scale x of the group, and the marks 1 unit apart stretch with it.
      m.add('strip', (x, y, z) => rbox(x, y, z, X0 + (L - 0.15) / 2, Y, 0, (L + 0.15) / 2, 0.05, 0.28, 0.035), PAL.cream, { pivot: [X0, Y, 0] });
      m.add('marks', (x, y, z) => { const k = clamp(Math.round(x - X0), 1, L - 1); return rbox(x, y, z, X0 + k, Y + 0.07, 0, 0.1, 0.045, 0.24, 0.04); }, PAL.ink, { parent: 'strip' });
      m.add('hook', (x, y, z) => rbox(x, y, z, X0 + L + 0.02, Y + 0.09, 0, 0.05, 0.14, 0.3, 0.04), PAL.ink, { parent: 'strip' });
      return m;
    },
    pose(g) { g.strip.scale.x = 1.6; },
    moving: 'Strip stretches (scale x of strip); the marks stretch with it',
  },
  fence: {
    label: 'Fence panel and post',
    // A waist-high garden fence at real size (1 m is about 5 units). Copies go 4 apart along x.
    step: 0.05,
    make() {
      const m = def(), P = 4 / 6;
      m.add('post', (x, y, z) => smin(rbox(x, y, z, 0, 2.2, 0, 0.3, 2.2, 0.3, 0.14), ell(x, y, z, 0, 4.4, 0, 0.34, 0.24, 0.34), 0.16), PAL.cream);
      m.add('rails', (x, y, z) => Math.min(rbox(x, y, z, 2.1, 1.4, 0, 1.9, 0.16, 0.12, 0.1), rbox(x, y, z, 2.1, 3.3, 0, 1.9, 0.16, 0.12, 0.1)), PAL.white);
      m.add('pickets', (x, y, z) => {
        const cx = P * clamp(Math.round(x / P), 1, 5);
        return smin(rbox(x, y, z, cx, 1.98, 0.22, 0.24, 1.72, 0.11, 0.1), cone(x, y, z, cx, 3.62, 0.22, cx, 4.08, 0.22, 0.2, 0.1), 0.12);
      }, PAL.white);
      return m;
    },
    moving: 'No moving parts',
  },
  filmstrip: {
    label: 'Film strip of six frames',
    make() {
      const m = def(), { cy, hx, hy, hz } = FILM, hp = 0.35;
      m.add('strip', (x, y, z) => {
        const hc = (Math.floor(x / hp) + 0.5) * hp, holes = Math.min(rbox(x, y, z, hc, cy + 0.64, 0, 0.08, 0.07, 1, 0.05), rbox(x, y, z, hc, cy - 0.64, 0, 0.08, 0.07, 1, 0.05));
        return smax(rbox(x, y, z, 0, cy, 0, hx, hy, hz, 0.05), Math.abs(hc) < hx - 0.15 ? -holes : -9, 0.02);
      }, PAL.ink);
      m.add('frames', (x, y, z) => rbox(x, y, z, frameX(frameOf(x)), cy, 0, 0.5, 0.44, 0.075, 0.05), C.frame);
      m.add('figures', (x, y, z) => {
        // The same figure in every frame, with a small lean and an arm that rises a little each frame.
        const i = frameOf(x), fx = frameX(i) - 0.09, dx = i * 0.012, lift = i * 0.035;
        const head = ell(x, y, z, fx + dx, cy + 0.22, 0.08, 0.15, 0.15, 0.05);
        const body = ell(x, y, z, fx + dx * 0.5, cy - 0.13, 0.08, 0.21, 0.28, 0.05);
        const arm = cone(x, y, z, fx + 0.14, cy - 0.02, 0.08, fx + 0.36, cy - 0.08 + lift, 0.08, 0.06, 0.055);
        return smin(smin(head, body, 0.06), arm, 0.05);
      }, PAL.cream);
      m.add('stand', (x, y, z) => rbox(Math.abs(x), y, z, 2.6, 0.15, 0, 0.42, 0.15, 0.42, 0.1), PAL.grey);
      return m;
    },
    moving: 'No moving parts',
  },
};

export const JOINS = {
  apple: [['stem', 'body'], ['leaf', 'stem']],
  pear: [['stem', 'body'], ['leaf', 'stem']],
  tape: [['badge', 'case'], ['button', 'case'], ['mouth', 'case'], ['strip', 'mouth'], ['marks', 'strip'], ['hook', 'strip']],
  fence: [['rails', 'post'], ['pickets', 'rails']],
  filmstrip: [['stand', 'strip'], ['frames', 'strip'], ['figures', 'frames']],
};
