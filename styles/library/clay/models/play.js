// Props for the mascot's play and tool actions (the user asked for more varied actions, 2026-11-10): a ball to kick,
// a claw hammer and a workbench with a nail, a broom and a dust pile, a watering can and a plant that grows and
// flowers, and a long rug to lie on. Same rules as models.js: each part is a distance field, +z is its front, and
// JOINS lists what each part must touch. The helpers in clay.js move them: kick, hammer, sweep, water, lieDown.
import { smin, smax, ell, cone, rbox, rcyl, torus } from '../sdf.js';
import { def, PAL } from '../models.js';

const C = { wood: '#c99a6b', bench: '#b98a5e', straw: '#d8b45a', red: '#cf4f45', can: '#5a9e6f', pot: '#c56a45', soil: '#5a3d2b',
  leaf: '#4f9a4a', petal: '#f2a7b8', core: '#f2c14e', rug: '#c9a27e', stripe: '#8a5a44', dust: '#9d958a', ball: '#f1efe9' };

// The flower's petals: five parts with the same shape (along +z from the flower's centre), each turned about y.
const FLOWER = [0, 2.3, 0], PETALS = 5;
const petal = (x, y, z) => ell(x, y, z, FLOWER[0], FLOWER[1] + 0.02, FLOWER[2] + 0.3, 0.17, 0.05, 0.26);

export const MODELS = {
  // A ball to kick, radius 0.55 (a football next to the 8.6 tall mascot), centre at y 0.55. Two red bands show it
  // roll. kick() in clay.js moves and turns its root.
  kickball: {
    label: 'Ball to kick',
    make() {
      const m = def();
      m.add('ball', (x, y, z) => ell(x, y, z, 0, 0.55, 0, 0.55, 0.55, 0.55), C.ball, { step: 0.02 });
      m.add('band', (x, y, z) => Math.min(torus(x, y, z, 0, 0.55, 0, 'x', 0.5, 0.055), torus(x, y, z, 0, 0.55, 0, 'y', 0.5, 0.055)), C.red, { step: 0.015 });
      return m;
    },
    moving: 'Rolls (its root)',
  },
  // A claw hammer, held at its origin (the end of the handle, which runs along +z). The head is at z 1.62, upright:
  // the striking face is at y -0.37 (local), and the claw curls from the top of the head back toward the handle, with
  // a slot 0.14 wide for a nail. hammer() in clay.js places it.
  hammer: {
    label: 'Claw hammer',
    make() {
      const m = def();
      m.add('handle', (x, y, z) => rcyl(x, y, z, 0, 0, 0.8, 'z', 0.09, 0.82, 0.05), C.wood, { step: 0.02 });
      m.add('head', (x, y, z) => {
        let d = rbox(x, y, z, 0, 0.06, 1.62, 0.13, 0.26, 0.15, 0.05);
        d = smin(d, rcyl(x, y, z, 0, -0.27, 1.62, 'y', 0.17, 0.1, 0.04), 0.05);
        // The claw: a curved profile in the y-z plane, 0.32 wide in x, with a slot 0.13 wide for the nail's shank.
        let claw = smin(cone(0, y, z, 0, 0.28, 1.63, 0, 0.56, 1.55, 0.12, 0.1), cone(0, y, z, 0, 0.56, 1.55, 0, 0.76, 1.28, 0.1, 0.05), 0.04);
        claw = smax(smax(claw, Math.abs(x) - 0.16, 0.03), -rbox(x, y, z, 0, 0.76, 1.3, 0.065, 0.22, 0.2, 0.02), 0.02);
        return smin(d, claw, 0.05);
      }, PAL.steel, { mat: 'metal', step: 0.015 });
      return m;
    },
    moving: 'Held',
  },
  // A workbench (top 3.6 by 1.2, at y 2.6) with a nail at (0.9, 2.6, -0.3). The nail's head (radius 0.16) is at
  // y 3.1 and sinks 0.3 in the moving pose, to 0.17 above the top: room for the hammer's claw under it.
  nailboard: {
    label: 'Workbench with a nail',
    make() {
      const m = def();
      m.add('top', (x, y, z) => rbox(x, y, z, 0, 2.4, 0, 1.8, 0.2, 0.6, 0.06), C.bench);
      for (const sx of [-1, 1]) m.add(`leg${sx}`, (x, y, z) => rbox(x, y, z, sx * 1.35, 1.12, 0, 0.12, 1.12, 0.5, 0.05), C.wood);
      m.add('bar', (x, y, z) => rbox(x, y, z, 0, 0.55, 0, 1.3, 0.08, 0.08, 0.04), C.wood);
      m.add('nail', (x, y, z) => smin(rcyl(x, y, z, 0.9, 3.1, -0.3, 'y', 0.16, 0.03, 0.015), cone(x, y, z, 0.9, 2.5, -0.3, 0.9, 3.08, -0.3, 0.03, 0.05), 0.02), PAL.steel, { pivot: [0.9, 2.6, -0.3], mat: 'metal', step: 0.012 });
      return m;
    },
    pose(g) { g.nail.position.y -= 0.3; },
    moving: 'Nail sinks',
  },
  // A broom, 5.1 tall (1 m). Its head is a flat fan of five straw bundles, 1.5 wide (x) and 0.3 deep (z) at the floor,
  // narrow at the binding (three red bands); a steel ferrule joins it to the handle, which ends in a round knob. The
  // root is the bottom of the head, on the floor; the head's broad faces look along z, the way it pushes. sweep() in
  // clay.js holds it at y 4.6 (upper hand) and 3.8 (lower hand) on the handle.
  broom: {
    label: 'Broom',
    make() {
      const m = def();
      m.add('brush', (x, y, z) => {
        let d = ell(x, y, z, 0, 1.12, 0, 0.3, 0.26, 0.15);
        for (let i = -2; i <= 2; i++) d = smin(d, cone(x, y, z, i * 0.08, 1.1, 0, i * 0.29, 0.16, 0, 0.09, 0.15), 0.05);
        return smax(d, -y, 0.03);
      }, C.straw, { step: 0.02 });
      m.add('band', (x, y, z) => Math.min(ell(x, y, z, 0, 0.98, 0, 0.36, 0.045, 0.19), ell(x, y, z, 0, 1.12, 0, 0.33, 0.045, 0.18), ell(x, y, z, 0, 1.26, 0, 0.26, 0.045, 0.16)), C.red, { step: 0.015 });
      m.add('ferrule', (x, y, z) => cone(x, y, z, 0, 1.3, 0, 0, 1.6, 0, 0.13, 0.095), PAL.steel, { mat: 'metal', step: 0.015 });
      m.add('handle', (x, y, z) => smin(cone(x, y, z, 0, 1.5, 0, 0, 4.98, 0, 0.085, 0.075), ell(x, y, z, 0, 5.02, 0, 0.11, 0.09, 0.11), 0.04), C.wood, { step: 0.02 });
      return m;
    },
    moving: 'Held',
  },
  // A stand for the broom: a post 3.8 tall on a small round base, with a U hook at y 3.5 that opens toward +z. A broom
  // leans into it: its handle rests on the hook's back (handle centre at (0, 3.5, 0.365)) and its head stands on the
  // floor at (0, 0, 1.1), so the handle leans 0.21 rad. sweep() in clay.js places the stand and the broom there.
  broomStand: {
    label: 'Broom stand',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rcyl(x, y, z, 0, 0.06, 0, 'y', 0.32, 0.06, 0.04), PAL.ink);
      m.add('post', (x, y, z) => cone(x, y, z, 0, 0.1, 0, 0, 3.8, 0, 0.09, 0.08), PAL.ink, { step: 0.02 });
      m.add('hook', (x, y, z) => Math.min(smax(torus(x, y, z, 0, 3.5, 0.4, 'y', 0.17, 0.045), z - 0.43, 0.02), cone(x, y, z, 0, 3.5, 0.05, 0, 3.5, 0.24, 0.05, 0.045)), PAL.steel, { mat: 'metal', step: 0.012 });
      return m;
    },
    moving: 'No moving parts',
  },
  // A small pile of dust, 1.3 wide and 0.45 high, for sweep() to push (its root moves).
  dust: {
    label: 'Dust pile',
    make() {
      const m = def();
      m.add('pile', (x, y, z) => {
        let d = ell(x, y, z, 0, 0, 0, 0.6, 0.38, 0.5);
        d = smin(d, ell(x, y, z, 0.42, 0, 0.18, 0.3, 0.24, 0.28), 0.12);
        d = smin(d, ell(x, y, z, -0.38, 0, -0.2, 0.28, 0.2, 0.3), 0.12);
        d = smin(d, ell(x, y, z, 0.05, 0.3, 0.05, 0.22, 0.17, 0.2), 0.12);
        return smax(d, -y, 0.03);
      }, C.dust, { step: 0.02 });
      return m;
    },
    moving: 'Pushed (its root)',
  },
  // A watering can. Its handle's top (the hold point) is at (-0.1, 1.53, 0); the spout's tip (the rose) is at
  // (1.6, 1.15, 0). water() in clay.js holds it by the handle and tilts it about z.
  wateringCan: {
    label: 'Watering can',
    make() {
      const m = def();
      m.add('body', (x, y, z) => rcyl(x, y, z, 0, 0.55, 0, 'y', 0.55, 0.5, 0.12), C.can);
      m.add('spout', (x, y, z) => cone(x, y, z, 0.42, 0.45, 0, 1.45, 1.1, 0, 0.13, 0.07), C.can, { step: 0.02 });
      m.add('rose', (x, y, z) => ell(x, y, z, 1.52, 1.15, 0, 0.13, 0.1, 0.13), C.can, { step: 0.015 });
      m.add('grip', (x, y, z) => smax(torus(x, y, z, -0.1, 1.04, 0, 'z', 0.42, 0.07), 1.0 - y, 0.03), C.can, { step: 0.02 });
      return m;
    },
    moving: 'Held',
  },
  // A plant in a pot (the soil at y 0.91). Two states: setPose(k) grows the stem (scale 0.45 to 1), and
  // setPose(k, 'bloom') opens the five petals of the flower (closed: folded up round the yellow centre). Call
  // setPose(k) first: it sets every part, and the named pose then sets only the petals.
  plant: {
    label: 'Plant that grows and flowers',
    make() {
      const m = def();
      m.add('pot', (x, y, z) => smax(rcyl(x, y, z, 0, 0.45, 0, 'y', 0.55, 0.45, 0.08), -rcyl(x, y, z, 0, 0.95, 0, 'y', 0.45, 0.1, 0.02), 0.02), C.pot);
      m.add('soil', (x, y, z) => rcyl(x, y, z, 0, 0.86, 0, 'y', 0.47, 0.05, 0.02), C.soil);
      m.add('stem', (x, y, z) => smin(cone(x, y, z, 0, 0.88, 0, 0, 2.25, 0, 0.07, 0.06), Math.min(ell(x, y, z, 0.32, 1.5, 0, 0.3, 0.09, 0.15), ell(x, y, z, -0.3, 1.75, 0, 0.28, 0.09, 0.14)), 0.05), C.leaf, { pivot: [0, 0.88, 0], step: 0.02 });
      m.add('flower', (x, y, z) => ell(x, y, z, FLOWER[0], FLOWER[1], FLOWER[2], 0.17, 0.15, 0.17), C.core, { parent: 'stem', step: 0.015 });
      for (let i = 0; i < PETALS; i++) m.add(`petal${i}`, petal, C.petal, { parent: 'stem', pivot: FLOWER, step: 0.015 });
      return m;
    },
    rest(g) {
      g.stem.scale.setScalar(0.45);
      for (let i = 0; i < PETALS; i++) { const p = g[`petal${i}`]; p.rotation.order = 'YXZ'; p.rotation.y = i * 2 * Math.PI / PETALS; p.rotation.x = -1.3; }
    },
    pose(g) { g.stem.scale.setScalar(1); },
    poses: { bloom(g) { for (let i = 0; i < PETALS; i++) g[`petal${i}`].rotation.x = -0.2; } },
    moving: 'Grows; the flower opens (pose "bloom")',
  },
  // A rug, 9.6 long and 3.8 wide, top at y 0.08, to lie down on (his body is 8.6 long). lieDown() in clay.js. The parts are
  // named "floor...", so his shoes may stand on it (allowance() in clay.js): walk on it with route(..., { y: 0.08 }).
  rug: {
    label: 'Rug',
    make() {
      const m = def();
      m.add('floor', (x, y, z) => rbox(x, y, z, 0, 0.04, 0, 4.8, 0.04, 1.9, 0.03), C.rug, { step: 0.05 });
      m.add('floorStripes', (x, y, z) => Math.min(rbox(x, y, z, 0, 0.045, 1.5, 4.78, 0.042, 0.12, 0.02), rbox(x, y, z, 0, 0.045, -1.5, 4.78, 0.042, 0.12, 0.02)), C.stripe, { step: 0.04 });
      return m;
    },
    moving: 'No moving parts',
  },
};

export const JOINS = {
  kickball: [['band', 'ball']],
  hammer: [['head', 'handle']],
  nailboard: [[/^leg/, 'top'], ['bar', /^leg/], ['nail', 'top']],
  broom: [['band', 'brush'], ['ferrule', 'brush'], ['handle', 'ferrule']],
  broomStand: [['post', 'base'], ['hook', 'post']],
  wateringCan: [['spout', 'body'], ['rose', 'spout'], ['grip', 'body']],
  plant: [['soil', 'pot'], ['stem', 'soil'], ['flower', 'stem'], [/^petal/, 'flower']],
  rug: [['floorStripes', 'floor']],
};
