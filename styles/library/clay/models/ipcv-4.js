// Models for the course Part 2, video 4. Same rules as models.js: each part is a distance field,
// it stands on y = 0, +z is its front, and JOINS lists what each connector must touch.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from '../sdf.js';
import { def, stand, PAL } from '../models.js';

// Colours of this set. Robot orange is only for the humanoid robot.
const C = {
  easel: '#a7774f', sky: '#cfe2e8', hair: '#6b4a3a', skin: '#efc7a4', nose: '#e2ad8a', mouth: '#905b48', shirt: '#7f9fc4',
  salmon: '#e8907e', salmonFin: '#c96f60', bass: '#6f8597', bassFin: '#55687a', lens: '#fff1c9',
  arc: ['#cf4f45', '#c27b6c', '#a99e93', '#6fa89c', '#2f9e8f'],
};

// The easel picture leans back by this angle. A part made upright in "local" space is turned
// with the frame: local y = y cos a - z sin a, local z = y sin a + z cos a.
const LEAN = 0.1, cL = Math.cos(LEAN), sL = Math.sin(LEAN);
const lean = (f) => (x, y, z) => f(x, y * cL - z * sL, y * sL + z * cL);

// An ellipse in the x-y plane, turned so that its long axis points along (dx, dy).
function lobe(x, y, z, cx, cy, dx, dy, a, b, c) {
  const px = x - cx, py = y - cy;
  return ell(px * dx + py * dy, -px * dy + py * dx, z, 0, 0, 0, a, b, c);
}

// A fish on its belly, head at +x, so the side of the fish faces the camera. o: body sizes.
function fish(o) {
  return {
    label: o.label,
    make() {
      const m = def(), Y = o.Y;
      m.add('body', (x, y, z) => {
        const d = smin(ell(x, y, z, o.hx, Y, 0, o.rx, o.ry, o.rz), cone(x, y, z, o.hx - 0.1, Y, 0, o.px, Y + 0.02, 0, o.ry * 0.72, 0.07), 0.25);
        return smax(d, 0.012 - y, 0.08);
      }, o.color);
      m.add('fins', (x, y, z) => {
        const s = 0.7071;
        let d = Math.min(lobe(x, y, z, o.px - 0.17, Y + 0.17, -s, s, o.tail, 0.09, 0.06), lobe(x, y, z, o.px - 0.17, Y - 0.15, -s, -s, o.tail * 0.9, 0.09, 0.06));
        d = Math.min(d, ell(x + (y - Y) * 0.7, y, z, o.dx, Y + o.ry * 0.9, 0, o.dl, o.dh, 0.06) * 0.8);
        return smax(d, 0.012 - y, 0.03);
      }, o.fin);
      m.add('eyes', (x, y, z) => ell(x, y, Math.abs(z), o.ex, o.ey, o.ez, 0.06, 0.06, 0.035), PAL.ink);
      return m;
    },
    moving: 'No moving parts',
  };
}

export const MODELS = {
  portrait: {
    label: 'Face picture on an easel',
    make() {
      const m = def(), FLAT = (z) => -0.06 - z;   // the relief stays in front of the panel's back
      m.add('frame', lean((x, y, z) => smax(rbox(x, y, z, 0, 4.9, 0, 1.5, 1.9, 0.12, 0.1), -rbox(x, y, z, 0, 4.9, 0, 1.22, 1.62, 0.5, 0.03), 0.04)), PAL.wood, { step: 0.04 });
      m.add('panel', lean((x, y, z) => rbox(x, y, z, 0, 4.9, -0.03, 1.24, 1.64, 0.05, 0.03)), C.sky, { step: 0.05 });
      m.add('shirt', lean((x, y, z) => smax(smax(ell(x, y, z, 0, 3.4, 0, 1.0, 0.62, 0.14), 3.3 - y, 0.02), FLAT(z), 0.02)), C.shirt);
      m.add('hair', lean((x, y, z) => smax(smin(ell(x, y, z, 0, 5.2, 0, 0.8, 0.95, 0.1), ell(x, y, z, 0.08, 5.62, 0.1, 0.62, 0.24, 0.12), 0.12), FLAT(z), 0.02)), C.hair);
      m.add('face', lean((x, y, z) => smax(smin(ell(x, y, z, 0, 4.95, 0.04, 0.62, 0.8, 0.17), cone(x, y, z, 0, 4.3, 0.0, 0, 3.85, 0.0, 0.2, 0.21), 0.08), FLAT(z), 0.02)), C.skin);
      m.add('eyes', lean((x, y, z) => ell(Math.abs(x), y, z, 0.22, 5.0, 0.19, 0.075, 0.09, 0.04)), PAL.ink);
      m.add('nose', lean((x, y, z) => ell(x, y, z, 0, 4.8, 0.21, 0.07, 0.08, 0.05)), C.nose);
      m.add('smile', lean((x, y, z) => smax(torus(x, y, z, 0, 4.66, 0.17, 'z', 0.2, 0.035), y - 4.56, 0.02)), C.mouth);
      m.add('ledge', lean((x, y, z) => rbox(x, y, z, 0, 2.92, 0.03, 1.7, 0.08, 0.29, 0.06)), PAL.wood, { step: 0.04 });
      for (const [n, sx] of [['legL', 1], ['legR', -1]]) m.add(n, lean((x, y, z) => cone(x, y, z, sx * 1.1, 0.12, -0.24, sx * 0.15, 7.3, -0.24, 0.1, 0.08)), C.easel);
      m.add('top', lean((x, y, z) => ell(x, y, z, 0, 7.3, -0.25, 0.26, 0.17, 0.18)), C.easel);
      m.add('legBack', (x, y, z) => cone(x, y, z, 0, 7.2, -1.0, 0, 0.1, -2.3, 0.08, 0.09), C.easel);
      return m;
    },
    moving: 'No moving parts',
  },
  salmon: fish({ label: 'Salmon', color: C.salmon, fin: C.salmonFin, Y: 0.31, hx: 0.17, rx: 0.64, ry: 0.3, rz: 0.2, px: -0.6, tail: 0.25, dx: -0.02, dl: 0.26, dh: 0.15, ex: 0.56, ey: 0.37, ez: 0.135 }),
  seabass: fish({ label: 'Sea bass', color: C.bass, fin: C.bassFin, Y: 0.38, hx: 0.12, rx: 0.6, ry: 0.37, rz: 0.21, px: -0.56, tail: 0.27, dx: -0.06, dl: 0.38, dh: 0.18, ex: 0.52, ey: 0.48, ez: 0.135 }),
  lamp: {
    label: 'Spotlight on a stand',
    make() {
      const m = def(), P = [0, 5.2, 0];
      stand(m, 5.0, 1.5, 0.15);
      m.add('swivel', (x, y, z) => ell(x, y, z, 0, 5.2, 0, 0.22, 0.22, 0.22), PAL.ink);
      m.add('head', (x, y, z) => rcyl(x, y, z, 0, 6.0, 0.05, 'z', 0.6, 0.62, 0.24), PAL.cream, { pivot: P });
      m.add('yoke', (x, y, z) => { const ax = Math.abs(x); return smin(cone(ax, y, z, 0, 5.36, 0, 0.74, 5.36, 0, 0.1, 0.1), cone(ax, y, z, 0.74, 5.36, 0, 0.74, 6.0, 0.05, 0.1, 0.1), 0.08); }, PAL.ink, { parent: 'head' });
      m.add('knobs', (x, y, z) => rcyl(Math.abs(x), y, z, 0.73, 6.0, 0.05, 'x', 0.17, 0.16, 0.05), PAL.ink, { parent: 'head' });
      m.add('rim', (x, y, z) => torus(x, y, z, 0, 6.0, 0.66, 'z', 0.5, 0.1), PAL.ink, { parent: 'head' });
      m.add('lens', (x, y, z) => ell(x, y, z, 0, 6.0, 0.64, 0.48, 0.48, 0.09), C.lens, { parent: 'head', led: C.lens });
      return m;
    },
    rest(g) { g.head.rotation.order = 'YXZ'; },
    pose(g) { g.head.rotation.y = 0.61; g.head.rotation.x = 0.26; },
    moving: 'Head turns and tilts',
  },
  screen: {
    label: 'Projection screen',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rbox(x, y, z, 0, 0.12, 0, 1.7, 0.1, 0.2, 0.09), PAL.ink);
      for (const [n, sx] of [['footL', 1], ['footR', -1]]) m.add(n, (x, y, z) => rbox(x, y, z, sx * 1.7, 0.12, 0, 0.22, 0.12, 0.9, 0.11), PAL.ink);
      m.add('post', (x, y, z) => cone(x, y, z, 0, 0.2, 0, 0, 0.8, 0, 0.17, 0.17), PAL.ink);
      m.add('panel', (x, y, z) => rbox(x, y, z, 0, 3.2, 0, 3.02, 2.02, 0.05, 0.03), PAL.white, { pivot: [0, 3.2, 0], step: 0.05 });
      m.add('frame', (x, y, z) => smax(rbox(x, y, z, 0, 3.2, 0, 3.2, 2.2, 0.12, 0.11), -rbox(x, y, z, 0, 3.2, 0, 3.0, 2.0, 0.5, 0.02), 0.03), PAL.grey, { parent: 'panel', step: 0.04 });
      m.add('roller', (x, y, z) => rcyl(x, y, z, 0, 5.45, -0.02, 'x', 0.24, 3.4, 0.1), PAL.ink, { parent: 'panel', step: 0.04 });
      m.add('collar', (x, y, z) => rcyl(x, y, z, 0, 0.95, 0, 'y', 0.26, 0.1, 0.04), PAL.grey, { parent: 'panel' });
      return m;
    },
    pose(g) { g.panel.rotation.y = 0.87; },
    moving: 'Panel turns',
  },
  gauge: {
    label: 'Dial gauge',
    make() {
      const m = def(), CY = 4, T = 2.1;
      m.add('base', (x, y, z) => rcyl(x, y, z, 0, 0.12, 0, 'y', 0.75, 0.12, 0.08), PAL.ink);
      m.add('post', (x, y, z) => cone(x, y, z, 0, 0.2, 0, 0, 2.75, 0, 0.17, 0.15), PAL.ink);
      m.add('case', (x, y, z) => rcyl(x, y, z, 0, CY, 0, 'z', 1.35, 0.22, 0.14), PAL.ink);
      m.add('bezel', (x, y, z) => torus(x, y, z, 0, CY, 0.22, 'z', 1.27, 0.09), PAL.steel);
      m.add('face', (x, y, z) => rcyl(x, y, z, 0, CY, 0.22, 'z', 1.2, 0.04, 0.02), PAL.cream);
      // The arc band: segments from the far left (-T) to the far right (+T), clockwise from the top.
      const n = C.arc.length, w = (2 * T) / n, R0 = 0.9;
      C.arc.forEach((col, i) => {
        const mid = -T + w * (i + 0.5);
        m.add(`arc${i}`, (x, y, z) => { const th = Math.atan2(x, y - CY), r = Math.hypot(x, y - CY); return rbox((th - mid) * R0, r - R0, z, 0, 0, 0.28, w * R0 * 0.5, 0.12, 0.025, 0.02); }, col);
      });
      m.add('ticks', (x, y, z) => { const th = Math.atan2(x, y - CY), k = clamp(Math.round((th + T) / (T / 3)), 0, 6), a = -T + k * T / 3; return ell(x, y, z, 0.6 * Math.sin(a), CY + 0.6 * Math.cos(a), 0.27, 0.075, 0.075, 0.04); }, PAL.ink);
      m.add('pin', (x, y, z) => smin(rcyl(x, y, z, 0, CY, 0.36, 'z', 0.06, 0.12, 0.02), ell(x, y, z, 0, CY, 0.48, 0.15, 0.15, 0.06), 0.03), PAL.steel);
      m.add('needle', (x, y, z) => smin(cone(x, y, z, 0, CY, 0.4, 0, CY + 0.95, 0.4, 0.08, 0.03), cone(x, y, z, 0, CY, 0.4, 0, CY - 0.25, 0.4, 0.08, 0.06), 0.03), PAL.ink, { pivot: [0, CY, 0.4] });
      return m;
    },
    rest(g) { g.needle.rotation.z = 2.1; },
    pose(g) { g.needle.rotation.z = -2.1; },
    moving: 'Needle turns',
  },
  humanoid: {
    label: 'Humanoid robot',
    step: 0.038,
    make() {
      const m = def(), O = PAL.robot, K = PAL.ink;
      m.add('pelvis', (x, y, z) => rbox(x, y, z, 0, 3.38, 0, 0.76, 0.28, 0.44, 0.24), K, { pivot: [0, 3.38, 0] });
      // Legs: hip at y 3.3, knee at 1.85, ankle at 0.5. L is the robot's left, at +x. Each limb
      // stops short of its joint, so the ink ball shows and a bent joint does not fold into itself.
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        const hx = sx * 0.5;
        m.add(`thigh${s}`, (x, y, z) => cone(x, y, z, hx, 3.0, 0, hx, 2.3, 0, 0.38, 0.31), O, { parent: 'pelvis', pivot: [hx, 3.3, 0] });
        m.add(`hip${s}`, (x, y, z) => ell(x, y, z, hx, 3.3, 0, 0.32, 0.32, 0.32), K, { parent: `thigh${s}` });
        m.add(`shin${s}`, (x, y, z) => smin(cone(x, y, z, hx, 1.45, 0, hx, 0.72, 0, 0.3, 0.25), ell(x, y, z, hx, 1.25, 0.06, 0.3, 0.36, 0.3), 0.12), O, { parent: `thigh${s}`, pivot: [hx, 1.85, 0] });
        m.add(`knee${s}`, (x, y, z) => ell(x, y, z, hx, 1.85, 0, 0.33, 0.33, 0.33), K, { parent: `shin${s}` });
        m.add(`foot${s}`, (x, y, z) => smax(rbox(x, y, z, hx, 0.2, 0.18, 0.32, 0.2, 0.56, 0.18), -y, 0.02), O, { parent: `shin${s}`, pivot: [hx, 0.5, 0] });
        m.add(`ankle${s}`, (x, y, z) => ell(x, y, z, hx, 0.5, 0, 0.23, 0.23, 0.23), K, { parent: `foot${s}` });
      }
      m.add('torso', (x, y, z) => smin(smin(ell(x, y, z, 0, 4.62, -0.02, 0.9, 0.82, 0.58), ell(x, y, z, 0, 3.95, -0.02, 0.62, 0.45, 0.45), 0.25), cone(x, y, z, -0.78, 5.0, -0.02, 0.78, 5.0, -0.02, 0.3, 0.3), 0.2), O, { parent: 'pelvis', pivot: [0, 3.62, 0] });
      m.add('waist', (x, y, z) => rcyl(x, y, z, 0, 3.62, -0.02, 'y', 0.5, 0.16, 0.08), K, { parent: 'torso' });
      m.add('plate', (x, y, z) => ell(x, y, z, 0, 4.72, 0.5, 0.42, 0.34, 0.1), PAL.cream, { parent: 'torso' });
      m.add('head', (x, y, z) => smin(ell(x, y, z, 0, 5.98, 0, 0.68, 0.56, 0.6), rbox(x, y, z, 0, 5.78, 0, 0.55, 0.24, 0.5, 0.22), 0.1), O, { parent: 'torso', pivot: [0, 5.45, 0] });
      m.add('neck', (x, y, z) => rcyl(x, y, z, 0, 5.47, 0, 'y', 0.22, 0.14, 0.06), K, { parent: 'head' });
      m.add('visor', (x, y, z) => ell(x, y, z, 0, 6.03, 0.32, 0.54, 0.24, 0.33), PAL.screen, { parent: 'head', mat: 'gloss' });
      m.add('ears', (x, y, z) => rcyl(x, y, z, 0, 5.96, 0, 'x', 0.21, 0.74, 0.07), K, { parent: 'head' });
      // Arms: shoulder at y 5.0, elbow at 3.95.
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        const ax = sx * 1.3;
        m.add(`arm${s}`, (x, y, z) => cone(x, y, z, ax, 4.8, 0, ax, 4.27, 0, 0.26, 0.22), O, { parent: 'torso', pivot: [ax, 5.0, 0] });
        m.add(`shoulder${s}`, (x, y, z) => ell(x, y, z, ax, 5.0, 0, 0.32, 0.32, 0.32), K, { parent: `arm${s}` });
        m.add(`fore${s}`, (x, y, z) => cone(x, y, z, ax, 3.65, 0, ax, 3.12, 0, 0.22, 0.2), O, { parent: `arm${s}`, pivot: [ax, 3.95, 0] });
        m.add(`elbow${s}`, (x, y, z) => ell(x, y, z, ax, 3.95, 0, 0.26, 0.26, 0.26), K, { parent: `fore${s}` });
        m.add(`hand${s}`, (x, y, z) => ell(x, y, z, ax, 2.86, 0.02, 0.21, 0.26, 0.22), K, { parent: `fore${s}` });
      }
      return m;
    },
    pose(g) {
      g.thighL.rotation.x = -0.9; g.shinL.rotation.x = 1.0; g.footL.rotation.x = -0.1;
      g.thighR.rotation.x = 0.55; g.shinR.rotation.x = 1.2; g.footR.rotation.x = -0.3;
      g.armR.rotation.x = -0.7; g.foreR.rotation.x = -1.2;
      g.armL.rotation.x = 0.6; g.foreL.rotation.x = -1.0;
      g.torso.rotation.y = -0.15; g.head.rotation.y = 0.1; g.pelvis.position.y -= 0.5;
    },
    moving: 'Runs: all joints bend',
  },
};

export const JOINS = {
  portrait: [['panel', 'frame'], ['shirt', 'panel'], ['hair', 'panel'], ['face', 'hair'], ['face', 'shirt'], ['eyes', 'face'], ['nose', 'face'], ['smile', 'face'], ['ledge', 'frame'], [/^leg[LR]$/, 'ledge'], [/^leg[LR]$/, 'top'], ['legBack', 'top']],
  salmon: [['fins', 'body'], ['eyes', 'body']],
  seabass: [['fins', 'body'], ['eyes', 'body']],
  lamp: [['hub', 'column'], [/^leg/, 'hub'], ['swivel', 'column'], ['yoke', 'swivel'], ['knobs', 'yoke'], ['knobs', 'head'], ['rim', 'head'], ['lens', 'rim']],
  screen: [[/^foot/, 'base'], ['post', 'base'], ['collar', 'post'], ['collar', 'frame'], ['panel', 'frame'], ['roller', 'frame']],
  gauge: [['post', 'base'], ['post', 'case'], ['bezel', 'case'], ['face', 'case'], [/^arc/, 'face'], ['ticks', 'face'], ['pin', 'face'], ['needle', 'pin']],
  humanoid: [
    [/^hip(.)$/, 'pelvis'], [/^thigh(.)$/, 'hip$1'], [/^knee(.)$/, 'thigh$1'], [/^shin(.)$/, 'knee$1'], [/^ankle(.)$/, 'shin$1'], [/^foot(.)$/, 'ankle$1'],
    ['waist', 'pelvis'], ['torso', 'waist'], ['plate', 'torso'], ['neck', 'torso'], ['head', 'neck'], ['visor', 'head'], ['ears', 'head'],
    [/^shoulder(.)$/, 'torso'], [/^arm(.)$/, 'shoulder$1'], [/^elbow(.)$/, 'arm$1'], [/^fore(.)$/, 'elbow$1'], [/^hand(.)$/, 'fore$1'],
  ],
};
