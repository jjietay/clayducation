// Models for the attention video: a sitting cat and a striped floor mat. Same rules as models.js: each part
// is a distance field, it stands on y = 0, +z is its front, and JOINS lists what each part must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this set. The cat is a warm tabby, kept apart from robot orange.
const C = { cat: '#d79a5c', cream: '#f3e2c4', nose: '#d9737a', mat: '#4f86c6', stripe: '#f1efe9' };

export const MODELS = {
  // A sitting cat, about 3.05 tall (larger than real size, so it reads next to the mascot).
  // The head pivots at the neck (0, 1.85, 0.35): rotation.y turns it, rotation.x nods it.
  // The tail pivots at its root (0.5, 0.3, -0.85): rotation.y swings it on the floor.
  cat: {
    label: 'Sitting cat',
    make() {
      const m = def();
      m.add('body', (x, y, z) => smin(ell(x, y, z, 0, 0.75, -0.3, 0.95, 0.75, 1.0), ell(x, y, z, 0, 1.35, 0.25, 0.6, 0.75, 0.55), 0.35), C.cat);
      m.add('head', (x, y, z) => ell(x, y, z, 0, 2.25, 0.45, 0.62, 0.55, 0.55), C.cat, { pivot: [0, 1.85, 0.35] });
      for (const sx of [-1, 1]) {
        m.add(`ear${sx}`, (x, y, z) => cone(x, y, z, sx * 0.32, 2.62, 0.4, sx * 0.46, 3.05, 0.36, 0.2, 0.05), C.cat, { parent: 'head' });
        m.add(`eye${sx}`, (x, y, z) => ell(x, y, z, sx * 0.22, 2.32, 0.95, 0.12, 0.035, 0.04), PAL.ink, { parent: 'head', step: 0.012 });
        m.add(`leg${sx}`, (x, y, z) => cone(x, y, z, sx * 0.3, 1.1, 0.45, sx * 0.3, 0.22, 0.8, 0.17, 0.15), C.cat);
        m.add(`paw${sx}`, (x, y, z) => ell(x, y, z, sx * 0.3, 0.15, 0.86, 0.2, 0.15, 0.28), C.cream);
      }
      m.add('muzzle', (x, y, z) => ell(x, y, z, 0, 2.08, 0.86, 0.28, 0.18, 0.18), C.cream, { parent: 'head' });
      m.add('nose', (x, y, z) => ell(x, y, z, 0, 2.2, 1.0, 0.07, 0.05, 0.04), C.nose, { parent: 'head', step: 0.012 });
      m.add('tail', (x, y, z) => smin(cone(x, y, z, 0.5, 0.3, -0.85, 1.15, 0.16, 0.1, 0.17, 0.15), cone(x, y, z, 1.15, 0.16, 0.1, 0.95, 0.16, 0.85, 0.15, 0.13), 0.1), C.cat, { pivot: [0.5, 0.3, -0.85] });
      return m;
    },
    rest(g) { g.head.rotation.order = 'YXZ'; },
    pose(g) { g.head.rotation.x = -0.22; g.tail.rotation.y = 0.35; },
    moving: 'Head lifts and turns, tail swings',
  },
  // A floor mat, 5.2 by 3.4, 0.12 thick, with two pale stripes.
  mat: {
    label: 'Floor mat',
    make() {
      const m = def();
      m.add('mat', (x, y, z) => rbox(x, y, z, 0, 0.06, 0, 2.6, 0.06, 1.7, 0.05), C.mat, { step: 0.03 });
      m.add('stripes', (x, y, z) => Math.min(rbox(x, y, z, -1.9, 0.07, 0, 0.16, 0.06, 1.71, 0.04), rbox(x, y, z, 1.9, 0.07, 0, 0.16, 0.06, 1.71, 0.04)), C.stripe, { step: 0.03 });
      return m;
    },
    moving: 'No moving parts',
  },
};

export const JOINS = {
  cat: [['head', 'body'], [/^ear/, 'head'], [/^eye/, 'head'], ['muzzle', 'head'], ['nose', 'muzzle'], [/^leg/, 'body'], ['paw-1', 'leg-1'], ['paw1', 'leg1'], ['tail', 'body']],
  mat: [['stripes', 'mat']],
};
