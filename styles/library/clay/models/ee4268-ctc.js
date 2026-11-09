// Models for the the course computed torque video. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, ell, cone, rbox, rcyl } from '../sdf.js';
import { def, PAL } from '../models.js';

// The spring coil along +x from x0, length L, radius R, around the axis (y = Y, z = Z). Wire radius w.
function coil(x, y, z, x0, L, Y, Z, R = 0.2, turns = 7, w = 0.045) {
  const dy = y - Y, dz = z - Z, P = L / turns, th = Math.atan2(dz, dy);
  const k = Math.round((x - x0 - (th / 6.283) * P) / P), xc = Math.max(x0, Math.min(x0 + L, x0 + (k + th / 6.283) * P));
  return (Math.hypot(Math.hypot(dy, dz) - R, x - xc) - w) * 0.8;
}

// track: the cart (the joint, orange) follows the sled (the desired position, green) through a spring (k_p)
// and a damper (k_v). Rest: the gap between the cart's plate (x = -0.8) and the sled's plate (x = 1.2) is
// TRACK.L0. A scene moves groups.body and groups.lead in x, and sets spring.scale.x = gap / TRACK.L0.
// The rod rides 0.8 deep in the pot at rest, so the gap can grow by 0.75 and shrink by 0.35.
export const TRACK = { L0: 2.0, cartX: -1.6, leadX: 2.0, top: 1.5, cartHalf: 0.8, leadHalf: 0.6 };

export const MODELS = {
  joint: {
    label: 'Robot joint with a weight on its link',
    make() {
      const m = def(), PY = 3.6, Z = 0.62;
      m.add('base', (x, y, z) => rbox(x, y, z, 0, 0.15, 0, 1.25, 0.15, 0.95, 0.1), PAL.ink);
      m.add('post', (x, y, z) => rbox(x, y, z, 0, 1.85, -0.15, 0.36, 1.75, 0.34, 0.14), PAL.grey);
      m.add('motor', (x, y, z) => rcyl(x, y, z, 0, PY, 0.2, 'z', 0.58, 0.3, 0.12), PAL.steel, { mat: 'metal' });
      m.add('link', (x, y, z) => cone(x, y, z, 0, PY, Z, 2.35, PY, Z, 0.24, 0.2), PAL.robot, { pivot: [0, PY, Z] });
      m.add('hub', (x, y, z) => rcyl(x, y, z, 0, PY, Z, 'z', 0.38, 0.13, 0.06), PAL.ink, { parent: 'link' });
      m.add('mass', (x, y, z) => ell(x, y, z, 2.6, PY, Z, 0.44, 0.44, 0.44), PAL.ink, { parent: 'link' });
      return m;
    },
    // rest: the link is level. The scene turns groups.link.rotation.z (negative = down).
    pose(g) { g.link.rotation.z = -1.35; },
    moving: 'Link turns about the motor',
  },
  track: {
    label: 'Cart, spring and damper behind a sled on a rail',
    make() {
      const m = def(), Y = 0.72, ZS = -0.27, YD = 1.2, ZD = 0.28;
      m.add('rail', (x, y, z) => rbox(x, y, z, 1.0, 0.1, 0, 6.2, 0.1, 0.72, 0.06), PAL.grey, { step: 0.05 });
      // the cart: the joint
      m.add('body', (x, y, z) => rbox(x, y, z, -1.6, 0.98, 0, 0.8, 0.52, 0.6, 0.2), PAL.robot, { pivot: [-1.6, 0.2, 0], free: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = -1.6 + sx * 0.48, cz = sz * 0.6;
        m.add(`wheel${sx}${sz}`, (x, y, z) => rcyl(x, y, z, cx, 0.42, cz, 'z', 0.22, 0.09, 0.04), PAL.ink, { parent: 'body', pivot: [cx, 0.42, cz] });
      }
      m.add('plateB', (x, y, z) => rcyl(x, y, z, -0.78, Y, ZS, 'x', 0.3, 0.04, 0.02), PAL.ink, { parent: 'body' });
      m.add('rod', (x, y, z) => cone(x, y, z, -0.85, YD, ZD, 1.0, YD, ZD, 0.065, 0.065), PAL.steel, { parent: 'body', mat: 'metal' });
      m.add('spring', (x, y, z) => coil(x, y, z, -0.8, 2.0, Y, ZS), PAL.teal, { parent: 'body', pivot: [-0.8, Y, ZS] });
      // the sled: the desired position
      m.add('lead', (x, y, z) => rbox(x, y, z, 2.0, 0.9, 0, 0.6, 0.6, 0.6, 0.2), PAL.target, { pivot: [2.0, 0.2, 0], free: true });
      m.add('runner', (x, y, z) => rbox(x, y, z, 2.0, 0.26, 0, 0.56, 0.07, 0.56, 0.04), PAL.ink, { parent: 'lead' });
      m.add('plateA', (x, y, z) => rcyl(x, y, z, 1.3, Y, ZS, 'x', 0.3, 0.1, 0.03), PAL.ink, { parent: 'lead' });
      m.add('pot', (x, y, z) => smin(rcyl(x, y, z, 0.8, YD, ZD, 'x', 0.19, 0.62, 0.05), rcyl(x, y, z, 0.2, YD, ZD, 'x', 0.23, 0.05, 0.02), 0.03), '#6f7686', { parent: 'lead' });
      return m;
    },
    // rest: gap 2.0. pose: the sled has moved on by 0.6, the cart by 0.3, so the spring stretches.
    pose(g) { g.lead.position.x += 0.6; g.body.position.x += 0.3; g.spring.scale.x = 2.3 / 2.0; },
    moving: 'Cart and sled slide; spring stretches; rod slides in the pot',
  },
  twin: {
    label: 'Two carts on two rails, linked by a bar',
    make() {
      const m = def(), ZA = -1.25, ZB = 1.25;
      for (const [n, z0] of [['railA', ZA], ['railB', ZB]]) m.add(n, (x, y, z) => rbox(x, y, z, 0, 0.1, z0, 4.0, 0.1, 0.55, 0.06), PAL.grey, { step: 0.05 });
      m.add('cartA', (x, y, z) => rbox(x, y, z, 0, 0.9, ZA, 0.75, 0.48, 0.45, 0.18), PAL.robot, { pivot: [0, 0.2, 0], free: true });
      m.add('cartB', (x, y, z) => rbox(x, y, z, 0, 0.9, ZB, 0.75, 0.48, 0.45, 0.18), '#e0a23a', { parent: 'cartA' });
      for (const [n, z0] of [['postA', ZA], ['postB', ZB]]) m.add(n, (x, y, z) => rcyl(x, y, z, 0, 1.62, z0, 'y', 0.1, 0.32, 0.03), PAL.ink, { parent: 'cartA' });
      m.add('bar', (x, y, z) => cone(x, y, z, 0, 1.92, ZA, 0, 1.92, ZB, 0.13, 0.13), PAL.ink, { parent: 'cartA' });
      for (const [p, z0] of [['A', ZA], ['B', ZB]]) for (const sx of [-1, 1]) m.add(`wheel${p}${sx}`, (x, y, z) => rcyl(x, y, z, sx * 0.45, 0.4, z0 + 0.45, 'z', 0.2, 0.07, 0.03), PAL.ink, { parent: 'cartA' });
      return m;
    },
    pose(g) { g.cartA.position.x += 1.2; },
    moving: 'Both carts slide together',
  },
};

export const JOINS = {
  joint: [['post', 'base'], ['motor', 'post'], ['hub', 'motor'], ['link', 'hub'], ['mass', 'link']],
  track: [[/^wheel/, 'rail'], ['runner', 'rail'], [/^wheel/, 'body'], ['plateB', 'body'], ['plateA', 'lead'], ['spring', 'plateA'], ['spring', 'plateB'],
    ['rod', 'body'], ['rod', 'pot'], ['pot', 'lead'], ['runner', 'lead']],
  twin: [[/^wheelA/, 'railA'], [/^wheelB/, 'railB'], ['postA', 'cartA'], ['postB', 'cartB'], ['bar', 'postA'], ['bar', 'postB'], [/^wheelA/, 'cartA'], [/^wheelB/, 'cartB']],
};
