// Models for the image processing video 1. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this video. Blue is the class "male" and plum is the class "female".
const BLUE = '#3d63b8', PLUM = '#8e3f8f', GREY = '#9a968e';
const FRAME = '#5b6474', FROST = '#c2d4e4', SLATE = '#4a5466';

function pawnSpec(color, label) {
  return {
    label,
    make() {
      const m = def();
      m.add('pawn', (x, y, z) => {
        const base = rcyl(x, y, z, 0, 0.12, 0, 'y', 0.47, 0.12, 0.09);
        const body = cone(x, y, z, 0, 0.36, 0, 0, 0.86, 0, 0.3, 0.15);
        const collar = ell(x, y, z, 0, 0.84, 0, 0.27, 0.07, 0.27);
        const head = ell(x, y, z, 0, 1.05, 0, 0.26, 0.26, 0.26);
        return smin(smin(smin(base, body, 0.16), collar, 0.06), head, 0.05);
      }, color);
      return m;
    },
    moving: 'No moving parts',
  };
}

export const MODELS = {
  door: {
    label: 'Classroom door',
    make() {
      const m = def(), HX = -2, HZ = -0.11;
      // Opening: x from -2 to 2, y from 0 to 10.5.
      m.add('frame', (x, y, z) => smax(rbox(x, y, z, 0, 5.46, 0, 2.42, 5.46, 0.21, 0.1), -rbox(x, y, z, 0, 5.0, 0, 2.0, 5.5, 0.6, 0.06), 0.06), FRAME, { step: 0.055 });
      m.add('hinges', (x, y, z) => Math.min(...[1.4, 5.25, 9.1].map((cy) => rcyl(x, y, z, HX, cy, HZ, 'y', 0.12, 0.42, 0.05))), PAL.steel, { mat: 'metal' });
      m.add('leaf', (x, y, z) => smax(rbox(x, y, z, 0, 5.25, 0, 1.96, 5.19, 0.11, 0.08), -rbox(x, y, z, 0, 7.8, 0, 1.1, 1.8, 0.5, 0.1), 0.05), PAL.wood, { pivot: [HX, 0, HZ], free: true, step: 0.055 });
      m.add('window', (x, y, z) => rbox(x, y, z, 0, 7.8, 0, 1.12, 1.82, 0.05, 0.04), FROST, { parent: 'leaf', step: 0.05 });
      m.add('handle', (x, y, z) => {
        let d = rcyl(x, y, z, 1.5, 4.3, 0, 'z', 0.27, 0.17, 0.07);
        for (const s of [-1, 1]) d = smin(d, Math.min(cone(x, y, z, 1.5, 4.3, s * 0.14, 1.5, 4.3, s * 0.4, 0.12, 0.12), cone(x, y, z, 1.5, 4.3, s * 0.42, 0.72, 4.3, s * 0.44, 0.13, 0.12)), 0.06);
        return d;
      }, PAL.steel, { parent: 'leaf', mat: 'metal' });
      return m;
    },
    pose(g) { g.leaf.rotation.y = 1.22; },
    moving: 'Leaf opens 70 degrees',
  },
  sign: {
    label: 'School sign on two posts',
    make() {
      const m = def(), BY = 7.8;
      m.add('frame', (x, y, z) => {
        let d = Math.min(rbox(x, y, z, 0, 9.08, 0, 3.05, 0.2, 0.18, 0.12), rbox(x, y, z, 0, 6.52, 0, 3.0, 0.18, 0.16, 0.11));
        for (const s of [-1, 1]) d = Math.min(d, rcyl(x, y, z, s * 3.0, 4.7, 0, 'y', 0.26, 4.7, 0.1), ell(x, y, z, s * 3.0, 9.45, 0, 0.32, 0.32, 0.32), rcyl(x, y, z, s * 3.0, 0.1, 0, 'y', 0.46, 0.1, 0.06));
        // Pins on the turning axis, above and below the board.
        return Math.min(d, rcyl(x, y, z, 0, 8.74, 0, 'y', 0.12, 0.18, 0.03), rcyl(x, y, z, 0, 6.86, 0, 'y', 0.12, 0.18, 0.03));
      }, PAL.ink, { step: 0.05 });
      // Board face: x from -2.5 to 2.5, y from 7.0 to 8.6. The text goes on it later, as flat HTML.
      m.add('board', (x, y, z) => rbox(x, y, z, 0, BY, 0, 2.5, 0.8, 0.1, 0.08), PAL.cream, { pivot: [0, BY, 0], free: true, step: 0.05 });
      m.add('rim', (x, y, z) => smax(rbox(x, y, z, 0, BY, 0, 2.6, 0.9, 0.14, 0.1), -rbox(x, y, z, 0, BY, 0, 2.4, 0.7, 0.3, 0.06), 0.03), PAL.ink, { parent: 'board', step: 0.04 });
      return m;
    },
    pose(g) { g.board.rotation.y = Math.PI; },
    moving: 'Board turns 180 degrees',
  },
  pawnA: pawnSpec(BLUE, 'Student token, blue'),
  pawnB: pawnSpec(PLUM, 'Student token, plum'),
  // The student seen unclearly: same token in grey, before any decision.
  pawnQ: pawnSpec(GREY, 'Student token, grey (class unknown)'),
  stadiometer: {
    label: 'Height-measuring post',
    make() {
      const m = def(), CZ = -1.2, Y0 = 9.78;
      m.add('plate', (x, y, z) => rbox(x, y, z, 0, 0.1, 0.2, 1.6, 0.1, 1.7, 0.09), PAL.grey, { step: 0.05 });
      m.add('column', (x, y, z) => rbox(x, y, z, 0, 5.15, CZ, 0.5, 5.1, 0.4, 0.2), PAL.cream, { step: 0.05 });
      // One tick at each whole unit of height, y = 1 to 10; longer ticks at 5 and 10.
      m.add('ticks', (x, y, z) => { const k = clamp(Math.round(y), 1, 10); return ell(x, y, z, 0, k, CZ + 0.38, k % 5 ? 0.34 : 0.5, 0.13, 0.13); }, PAL.ink);
      m.add('slider', (x, y, z) => rbox(x, y, z, 0, Y0, CZ, 0.66, 0.36, 0.6, 0.16), PAL.teal, { pivot: [0, Y0, CZ], free: true, step: 0.045 });
      // The head bar: its underside is at y = 9.6 at rest, and it reaches z = 1.4.
      m.add('bar', (x, y, z) => rbox(x, y, z, 0, Y0 - 0.06, 0.3, 0.46, 0.12, 1.1, 0.1), PAL.teal, { parent: 'slider' });
      return m;
    },
    pose(g) { g.slider.position.y -= 3; },
    moving: 'Head bar slides down 3',
  },
  balance: {
    label: 'Beam balance',
    make() {
      const m = def(), BY = 4.8, PX = 2.4, FY = 1.9;
      m.add('base', (x, y, z) => smin(rbox(x, y, z, 0, 0.2, 0, 1.4, 0.2, 0.9, 0.15), rcyl(x, y, z, 0, 0.45, 0, 'y', 0.5, 0.1, 0.08), 0.12), SLATE, { step: 0.05 });
      m.add('column', (x, y, z) => cone(x, y, z, 0, 0.4, 0, 0, 4.62, 0, 0.24, 0.17), SLATE);
      m.add('beam', (x, y, z) => Math.min(cone(x, y, z, 0, BY, 0, PX, BY, 0, 0.2, 0.12), cone(x, y, z, 0, BY, 0, -PX, BY, 0, 0.2, 0.12), ell(x, y, z, PX, BY, 0, 0.17, 0.17, 0.17), ell(x, y, z, -PX, BY, 0, 0.17, 0.17, 0.17)), SLATE, { pivot: [0, BY, 0], free: true });
      m.add('hub', (x, y, z) => rcyl(x, y, z, 0, BY, 0, 'z', 0.34, 0.22, 0.08), PAL.cream, { parent: 'beam' });
      m.add('pointer', (x, y, z) => cone(x, y, z, 0, BY, 0, 0, 5.45, 0, 0.11, 0.04), PAL.cream, { parent: 'beam' });
      // Pans: the inner floor is flat at y = 1.9, 2.14 across, with a rim up to y = 2.15.
      for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
        const cx = s * PX;
        m.add(`pan${n}`, (x, y, z) => smin(smax(rcyl(x, y, z, cx, FY + 0.075, 0, 'y', 1.2, 0.175, 0.1), -rcyl(x, y, z, cx, FY + 0.5, 0, 'y', 1.07, 0.5, 0.1), 0.05), torus(x, y, z, cx, FY + 0.24, 0, 'y', 1.14, 0.07), 0.04), PAL.steel, { parent: 'beam', pivot: [cx, BY, 0], step: 0.045 });
        m.add(`hanger${n}`, (x, y, z) => Math.min(cone(x, y, z, cx, BY, 0, cx - 1.13, FY + 0.2, 0, 0.09, 0.09), cone(x, y, z, cx, BY, 0, cx + 1.13, FY + 0.2, 0, 0.09, 0.09)), SLATE, { parent: `pan${n}` });
      }
      return m;
    },
    pose(g) { g.beam.rotation.z = 0.25; g.panL.rotation.z = -0.25; g.panR.rotation.z = -0.25; },
    moving: 'Beam tips, pans stay level',
  },
};

export const JOINS = {
  door: [['hinges', 'frame'], ['leaf', 'hinges'], ['window', 'leaf'], ['handle', 'leaf']],
  sign: [['board', 'frame'], ['rim', 'board']],
  stadiometer: [['column', 'plate'], ['ticks', 'column'], ['slider', 'column'], ['bar', 'slider']],
  balance: [['column', 'base'], ['hub', 'column'], ['beam', 'hub'], ['pointer', 'hub'], [/^hanger(.)$/, 'beam'], [/^hanger(.)$/, 'pan$1']],
};
