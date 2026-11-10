// Models for the mascot's actions (carry, press, grip, turn): a stand at hand height, a parcel, a floor lever,
// a hand wheel on a post and a big button. Same rules as models.js: each part is a distance field, it stands on
// y = 0, +z is its front, and JOINS lists what each part must touch. Sizes are for k 1, next to the 8.6 tall mascot.
import { smin, smax, ell, cone, rbox, rcyl, torus } from '../sdf.js';
import { def, PAL } from '../models.js';

const C = { stand: '#d9cdb8', card: '#c99a6b', tape: '#e6d3a8', knob: '#cf4f45', dark: '#3a3d46' };

export const MODELS = {
  // A stand with a flat top at y 2.2, below his hips (hip joints at y 2.26, shoulders at 4.52), for carry(): an
  // object rests on it (rest y = 2.2) where he can reach it without his body touching the stand.
  pedestal: {
    label: 'Stand at hand height',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rbox(x, y, z, 0, 0.1, 0, 0.75, 0.1, 0.75, 0.08), C.stand);
      m.add('column', (x, y, z) => rbox(x, y, z, 0, 1.15, 0, 0.45, 1.05, 0.45, 0.1), C.stand);
      m.add('top', (x, y, z) => rbox(x, y, z, 0, 2.11, 0, 0.72, 0.09, 0.72, 0.07), C.stand);
      return m;
    },
    moving: 'No moving parts',
  },
  // A parcel, 1.6 wide, 1.2 tall and 1.3 deep, with a tape strip across the top. Carry it by the part "box".
  parcel: {
    label: 'Parcel to carry',
    make() {
      const m = def();
      m.add('box', (x, y, z) => rbox(x, y, z, 0, 0.6, 0, 0.8, 0.6, 0.65, 0.1), C.card);
      m.add('tape', (x, y, z) => rbox(x, y, z, 0, 1.19, 0, 0.81, 0.03, 0.16, 0.02), C.tape, { step: 0.02 });
      return m;
    },
    moving: 'No moving parts',
  },
  // A floor lever. The arm pivots at (0, 0.5, 0) about x: at rest it leans 0.3 rad away (-z), the moving pose pulls it 0.3 rad toward
  // +z. The knob centre is at (0, 4.1, 0) in arm coordinates: grip the arm part at [0, 4.1, 0.3] (its front).
  lever: {
    label: 'Floor lever',
    make() {
      const m = def();
      m.add('base', (x, y, z) => smax(rbox(x, y, z, 0, 0.28, 0, 0.75, 0.28, 0.7, 0.12), -rbox(x, y, z, 0, 0.55, 0, 0.16, 0.2, 0.56, 0.05), 0.04), C.dark);
      m.add('arm', (x, y, z) => smin(cone(x, y, z, 0, 0.4, 0, 0, 3.85, 0, 0.13, 0.11), ell(x, y, z, 0, 0.45, 0, 0.2, 0.2, 0.2), 0.05), PAL.steel, { pivot: [0, 0.5, 0], mat: 'metal' });
      m.add('knob', (x, y, z) => ell(x, y, z, 0, 4.1, 0, 0.32, 0.32, 0.32), C.knob, { parent: 'arm' });
      return m;
    },
    rest(g) { g.arm.rotation.x = -0.3; },
    pose(g) { g.arm.rotation.x = 0.3; },
    moving: 'Arm tips from back to front',
  },
  // A hand wheel on a post. The wheel turns about z, centre (0, 4.2, 0.62), rim radius 1.0 (tube 0.12). Grip the wheel
  // part at [-1.12, 4.2, 0.62] and [1.12, 4.2, 0.62] (the rim's outer edge) to turn it with both hands.
  handwheel: {
    label: 'Hand wheel on a post',
    make() {
      const m = def(), W = [0, 4.2, 0.62];
      m.add('foot', (x, y, z) => rcyl(x, y, z, 0, 0.12, 0, 'y', 0.8, 0.12, 0.06), C.dark);
      m.add('post', (x, y, z) => cone(x, y, z, 0, 0.2, 0, 0, 4.2, 0, 0.2, 0.17), C.dark);
      m.add('hub', (x, y, z) => rcyl(x, y, z, 0, 4.2, 0.28, 'z', 0.24, 0.3, 0.06), PAL.steel, { mat: 'metal' });
      m.add('wheel', (x, y, z) => {
        let d = torus(x, y, z, W[0], W[1], W[2], 'z', 1.0, 0.12);
        d = Math.min(d, rcyl(x, y, z, W[0], W[1], W[2], 'z', 0.22, 0.1, 0.04));
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; d = smin(d, cone(x, y, z, W[0], W[1], W[2], W[0] + Math.cos(a) * 0.95, W[1] + Math.sin(a) * 0.95, W[2], 0.07, 0.06), 0.04); }
        return d;
      }, C.knob, { pivot: W, step: 0.02 });
      return m;
    },
    pose(g) { g.wheel.rotation.z = Math.PI / 2; },
    moving: 'Wheel turns a quarter turn',
  },
  // A big button on a post: the red cap's top is at y 3.3 and sinks 0.18 in the moving pose. press() it by "cap".
  bigButton: {
    label: 'Big button on a post',
    make() {
      const m = def();
      m.add('foot', (x, y, z) => rcyl(x, y, z, 0, 0.1, 0, 'y', 0.7, 0.1, 0.05), C.dark);
      m.add('post', (x, y, z) => rbox(x, y, z, 0, 1.4, 0, 0.32, 1.3, 0.32, 0.08), C.dark);
      m.add('housing', (x, y, z) => rcyl(x, y, z, 0, 2.8, 0, 'y', 0.72, 0.13, 0.06), PAL.steel, { mat: 'metal' });
      m.add('cap', (x, y, z) => smin(rcyl(x, y, z, 0, 2.98, 0, 'y', 0.52, 0.08, 0.04), ell(x, y, z, 0, 3.05, 0, 0.5, 0.25, 0.5), 0.05), C.knob, { pivot: [0, 2.93, 0] });
      return m;
    },
    pose(g) { g.cap.position.y -= 0.18; },
    moving: 'Cap sinks when pressed',
  },
  // A bench, 4.8 long and 0.76 deep, seat top at y 0.74: sitOn() it, and his feet stay on the floor. It is shallow
  // on purpose: his thighs are 1.0 long, so a deeper seat would meet his calves.
  bench: {
    label: 'Bench',
    make() {
      const m = def();
      m.add('seat', (x, y, z) => rbox(x, y, z, 0, 0.66, 0, 2.4, 0.08, 0.38, 0.06), PAL.wood);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(`leg${sx}${sz}`, (x, y, z) => rbox(x, y, z, sx * 2.0, 0.3, sz * 0.24, 0.11, 0.31, 0.1, 0.04), C.dark);
      return m;
    },
    moving: 'No moving parts',
  },
  // A whiteboard on two posts. The white face is at z 0.09, x from -2.5 to 2.5, y from 3.1 to 6.0: write on it with
  // trace() between y 3.4 and 5.0 (his shoulders are at 4.52). Draw the ink with a canvas texture in the scene.
  whiteboard: {
    label: 'Whiteboard',
    step: 0.04,
    make() {
      const m = def();
      m.add('board', (x, y, z) => rbox(x, y, z, 0, 4.55, 0, 2.6, 1.55, 0.08, 0.05), '#f4f2ec');
      m.add('frame', (x, y, z) => smax(rbox(x, y, z, 0, 4.55, 0, 2.66, 1.61, 0.11, 0.05), -rbox(x, y, z, 0, 4.55, 0, 2.52, 1.47, 0.3, 0.03), 0.02), PAL.steel, { mat: 'metal' });
      m.add('tray', (x, y, z) => rbox(x, y, z, 0, 2.98, 0.16, 2.2, 0.05, 0.13, 0.03), PAL.steel, { mat: 'metal' });
      for (const sx of [-1, 1]) {
        m.add(`post${sx}`, (x, y, z) => cone(x, y, z, sx * 2.76, 0.1, 0, sx * 2.76, 6.1, 0, 0.1, 0.1), C.dark);
        m.add(`foot${sx}`, (x, y, z) => rbox(x, y, z, sx * 2.76, 0.07, 0, 0.14, 0.07, 0.7, 0.04), C.dark);
      }
      return m;
    },
    moving: 'No moving parts',
  },
  // An open basket, 1.0 tall, inner radius 0.85: toss() a ball into it (land at y 0.35 inside).
  basket: {
    label: 'Open basket',
    make() {
      const m = def();
      m.add('bin', (x, y, z) => smax(rcyl(x, y, z, 0, 0.5, 0, 'y', 1.0, 0.5, 0.08), -rcyl(x, y, z, 0, 0.62, 0, 'y', 0.85, 0.5, 0.05), 0.03), '#7d9fc4');
      m.add('rim', (x, y, z) => torus(x, y, z, 0, 1.0, 0, 'y', 0.93, 0.08), PAL.cream);
      return m;
    },
    moving: 'No moving parts',
  },
};

export const JOINS = {
  pedestal: [['column', 'base'], ['top', 'column']],
  parcel: [['tape', 'box']],
  lever: [['arm', 'base'], ['knob', 'arm']],
  handwheel: [['post', 'foot'], ['hub', 'post'], ['wheel', 'hub']],
  bigButton: [['post', 'foot'], ['housing', 'post'], ['cap', 'housing']],
  bench: [[/^leg/, 'seat']],
  whiteboard: [['frame', 'board'], ['tray', 'frame'], [/^post(.*)$/, 'frame'], [/^foot(.*)$/, 'post$1']],
  basket: [['rim', 'bin']],
};
