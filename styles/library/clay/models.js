// The object library: one kit, so every model shares the mascot's clay look.
// Each part is a distance field in model space, baked once with soft shading, then rigged
// on a named pivot. A model stands on y = 0, and +z is its front.
import { smin, smax, ell, cone, rbox, rcyl, torus, mix, clamp } from './sdf.js';
import { bake } from './mascot.js';
// Model sets, one file each, so that several authors can add models at the same time.
import * as IPCV1 from './models/ipcv-1.js';
import * as IPCV2 from './models/ipcv-2.js';
import * as IPCV3 from './models/ipcv-3.js';
import * as IPCV4 from './models/ipcv-4.js';
import * as IPCV5 from './models/ipcv-5.js';
import * as IPCV6 from './models/ipcv-6.js';

export const PAL = {
  robot: '#f2773a', ink: '#2a2a2e', cream: '#ede3cf', white: '#f1efe9', grey: '#b7b4ab', steel: '#a9adb2',
  target: '#3f9e55', barrel: '#4f86c6', pcbA: '#4a56a6', pcbB: '#2f7d5b', gold: '#d9a441', fruit: '#f39a2e', leaf: '#4f9a4a',
  teal: '#2f9e8f', navy: '#1c2433', screen: '#1d2a3a', wood: '#d6ae80', card: '#c99a6b', map: '#f2c14e', red: '#cf4f45',
};

export function def() {
  const parts = [];
  return { parts, add(name, f, color, o = {}) { parts.push({ name, f, color, ...o }); return this; } };
}

// Three legs and a column up to height h, so a model can stand at any height.
export function stand(m, h, spread, r) {
  m.add('column', (x, y, z) => cone(x, y, z, 0, h * 0.55, 0, 0, h + 0.05, 0, r * 1.25, r * 1.25), PAL.ink);
  m.add('hub', (x, y, z) => ell(x, y, z, 0, h * 0.55, 0, r * 2, r * 1.6, r * 2), PAL.ink);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + 0.5, lx = Math.sin(a) * spread, lz = Math.cos(a) * spread;
    m.add(`leg${i}`, (x, y, z) => cone(x, y, z, 0, h * 0.55, 0, lx, r * 0.75, lz, r, r * 0.75), PAL.ink);
  }
}
function armSpec(h, label) {
  return {
    label,
    make() {
      const m = def(), up = (f) => (x, y, z) => f(x, y - h, z);
      if (h > 0) stand(m, h, 0.5 + h * 0.42, 0.13);
      m.add('base', up((x, y, z) => rcyl(x, y, z, 0, 0.26, 0, 'y', 0.98, 0.26, 0.12)), PAL.ink);
      m.add('turret', up((x, y, z) => rcyl(x, y, z, 0, 0.82, 0, 'y', 0.64, 0.32, 0.14)), PAL.robot, { pivot: [0, 0.5 + h, 0] });
      m.add('shoulder', up((x, y, z) => cone(x, y, z, 0, 1.36, 0, 0, 3.15, 0, 0.38, 0.3)), PAL.robot, { parent: 'turret', pivot: [0, 1.36 + h, 0] });
      m.add('shoulderJoint', up((x, y, z) => rcyl(x, y, z, 0, 1.36, 0, 'x', 0.47, 0.43, 0.08)), PAL.ink, { parent: 'shoulder' });
      m.add('elbow', up((x, y, z) => cone(x, y, z, 0, 3.15, 0, 0, 4.55, 0, 0.29, 0.24)), PAL.robot, { parent: 'shoulder', pivot: [0, 3.15 + h, 0] });
      m.add('elbowJoint', up((x, y, z) => rcyl(x, y, z, 0, 3.15, 0, 'x', 0.39, 0.36, 0.08)), PAL.ink, { parent: 'elbow' });
      m.add('wrist', up((x, y, z) => rbox(x, y, z, 0, 4.9, 0, 0.4, 0.16, 0.2, 0.08)), PAL.cream, { parent: 'elbow', pivot: [0, 4.55 + h, 0] });
      m.add('wristJoint', up((x, y, z) => rcyl(x, y, z, 0, 4.55, 0, 'x', 0.28, 0.3, 0.07)), PAL.ink, { parent: 'wrist' });
      for (const sx of [-1, 1]) m.add(`finger${sx}`, up((x, y, z) => rbox(x, y, z, sx * 0.27, 5.38, 0, 0.09, 0.36, 0.15, 0.06)), PAL.ink, { parent: 'wrist', pivot: [sx * 0.27, 5.05 + h, 0] });
      return m;
    },
    rest(g) { g.turret.rotation.y = 1.25; g.shoulder.rotation.x = 0.28; g.elbow.rotation.x = 1.15; g.wrist.rotation.x = 0.75; },
    pose(g) { g.turret.rotation.y = -0.7; g.shoulder.rotation.x = -0.35; g.elbow.rotation.x = 1.75; g.wrist.rotation.x = 0.5; g['finger-1'].position.x -= 0.13; g.finger1.position.x += 0.13; },
    moving: 'All joints bend',
  };
}
function cameraSpec(h, label) {
  return {
    label,
    make() {
      const m = def(), up = (f) => (x, y, z) => f(x, y - h, z), pv = [0, h + 0.56, 0];
      m.add('bar', up((x, y, z) => rbox(x, y, z, 0, 0.84, 0, 0.92, 0.24, 0.24, 0.2)), PAL.grey, { pivot: pv });
      m.add('face', up((x, y, z) => rbox(x, y, z, 0, 0.84, 0.22, 0.8, 0.16, 0.05, 0.05)), PAL.ink, { parent: 'bar' });
      for (const [i, cx] of [-0.54, 0, 0.54].entries()) {
        m.add(`rim${i}`, up((x, y, z) => torus(x, y, z, cx, 0.84, 0.27, 'z', 0.12, 0.022)), PAL.grey, { parent: 'bar' });
        m.add(`lens${i}`, up((x, y, z) => ell(x, y, z, cx, 0.84, 0.26, 0.105, 0.105, 0.05)), PAL.navy, { parent: 'bar', mat: 'gloss' });
      }
      m.add('post', up((x, y, z) => cone(x, y, z, 0, 0, 0, 0, 0.62, 0, 0.12, 0.12)), PAL.ink);
      stand(m, h, 0.45 + h * 0.3, 0.095);
      return m;
    },
    pose(g) { g.bar.rotation.y = 0.5; g.bar.rotation.x = 0.2; },
    moving: 'Tilts and turns',
  };
}

export const MODELS = {
  tank: {
    label: 'Tank-drive robot',
    make() {
      const m = def();
      m.add('body', (x, y, z) => rbox(x, y, z, 0, 1.0, 0, 0.98, 0.48, 1.25, 0.28), PAL.robot);
      m.add('deck', (x, y, z) => rbox(x, y, z, 0, 1.5, -0.1, 0.7, 0.08, 0.88, 0.07), PAL.cream);
      m.add('bumper', (x, y, z) => rbox(x, y, z, 0, 0.74, 1.27, 0.78, 0.16, 0.12, 0.1), PAL.ink);
      for (const sx of [-1, 1]) m.add(`light${sx}`, (x, y, z) => ell(x, y, z, sx * 0.48, 1.12, 1.24, 0.15, 0.13, 0.07), PAL.white, { mat: 'gloss' });
      m.add('lidarBase', (x, y, z) => rcyl(x, y, z, 0, 1.68, 0.15, 'y', 0.3, 0.12, 0.05), PAL.ink);
      m.add('lidarHead', (x, y, z) => rcyl(x, y, z, 0, 1.9, 0.15, 'y', 0.26, 0.11, 0.05), PAL.white, { pivot: [0, 1.9, 0.15] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = sx * 1.22, cz = sz * 0.76, w = `wheel${sx}${sz}`;
        m.add(w, (x, y, z) => rcyl(x, y, z, cx, 0.62, cz, 'x', 0.62, 0.22, 0.09) + Math.sin(Math.atan2(y - 0.62, z - cz) * 14) * 0.012, PAL.ink, { pivot: [cx, 0.62, cz] });
        m.add(`${w}hub`, (x, y, z) => smin(rcyl(x, y, z, cx + sx * 0.03, 0.62, cz, 'x', 0.27, 0.22, 0.05), rbox(x, y, z, cx + sx * 0.25, 0.62, cz, 0.03, 0.27, 0.06, 0.02), 0.02), PAL.cream, { parent: w });
      }
      return m;
    },
    pose(g) { for (const k in g) if (/^wheel-?\d-?\d$/.test(k)) g[k].rotation.x = 0.6; g.lidarHead.rotation.y = 1; },
    moving: 'Wheels and LiDAR head turn',
  },
  drone: {
    label: 'Drone',
    make() {
      const m = def();
      m.add('body', (x, y, z) => smin(ell(x, y, z, 0, 1.42, 0, 0.82, 0.4, 1.12), ell(x, y, z, 0, 1.18, -0.05, 0.62, 0.28, 0.88), 0.14), PAL.white);
      m.add('shell', (x, y, z) => ell(x, y, z, 0, 1.7, -0.06, 0.52, 0.2, 0.72), PAL.teal);
      m.add('gimbal', (x, y, z) => ell(x, y, z, 0, 0.9, 0.76, 0.28, 0.28, 0.28), PAL.ink);
      m.add('lens', (x, y, z) => ell(x, y, z, 0, 0.9, 1.0, 0.15, 0.15, 0.07), PAL.navy, { mat: 'gloss' });
      for (const sx of [-1, 1]) {
        m.add(`skid${sx}`, (x, y, z) => Math.min(cone(x, y, z, sx * 0.78, 0.11, -0.95, sx * 0.78, 0.11, 0.95, 0.1, 0.1), cone(x, y, z, sx * 0.78, 0.11, 0.45, sx * 0.48, 1.12, 0.28, 0.085, 0.085), cone(x, y, z, sx * 0.78, 0.11, -0.45, sx * 0.48, 1.12, -0.28, 0.085, 0.085)), PAL.ink);
        for (const sz of [-1, 1]) {
          const tx = sx * 1.68, tz = sz * 1.68, p = `prop${sx}${sz}`;
          m.add(`arm${sx}${sz}`, (x, y, z) => cone(x, y, z, sx * 0.45, 1.42, sz * 0.5, tx, 1.5, tz, 0.19, 0.15), PAL.ink);
          m.add(`motor${sx}${sz}`, (x, y, z) => rcyl(x, y, z, tx, 1.55, tz, 'y', 0.29, 0.19, 0.08), PAL.ink);
          m.add(p, (x, y, z) => Math.min(ell(x, y, z, tx, 1.82, tz, 0.13, 0.09, 0.13), ell(x, y, z, tx + 0.55, 1.82, tz, 0.5, 0.05, 0.17), ell(x, y, z, tx - 0.55, 1.82, tz, 0.5, 0.05, 0.17)), PAL.cream, { pivot: [tx, 1.82, tz] });
        }
      }
      return m;
    },
    pose(g) { for (const k in g) if (k.startsWith('prop')) g[k].rotation.y = 0.8; },
    moving: 'Propellers turn',
  },
  arm: armSpec(0, 'Robot arm with gripper'),
  armShort: { ...armSpec(1.6, 'Robot arm, short stand'), variant: true },
  armTall: { ...armSpec(3.6, 'Robot arm, tall stand'), variant: true },
  lidar: {
    label: 'LiDAR',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rcyl(x, y, z, 0, 0.24, 0, 'y', 0.66, 0.24, 0.09), PAL.ink);
      m.add('head', (x, y, z) => rcyl(x, y, z, 0, 0.82, 0, 'y', 0.58, 0.34, 0.14), PAL.white, { pivot: [0, 0.5, 0] });
      m.add('window', (x, y, z) => smax(rcyl(x, y, z, 0, 0.82, 0, 'y', 0.6, 0.13, 0.03), 0.18 - z, 0.03), PAL.navy, { parent: 'head', mat: 'gloss' });
      m.add('cap', (x, y, z) => rcyl(x, y, z, 0, 1.18, 0, 'y', 0.3, 0.05, 0.03), PAL.grey, { parent: 'head' });
      return m;
    },
    rest(g) { g.head.rotation.y = 0.45; },
    pose(g) { g.head.rotation.y = -1.25; },
    moving: 'Head spins',
  },
  imu: {
    label: 'IMU board',
    make() {
      const m = def();
      const hole = (x, z) => Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => Math.hypot(x - a * 0.68, z - b * 0.44) - 0.085));
      m.add('board', (x, y, z) => smax(rbox(x, y, z, 0, 0.1, 0, 0.88, 0.08, 0.64, 0.07), -hole(x, z), 0.02), PAL.pcbA);
      m.add('chip', (x, y, z) => rbox(x, y, z, -0.02, 0.26, -0.08, 0.28, 0.07, 0.28, 0.04), PAL.ink);
      m.add('dot', (x, y, z) => ell(x, y, z, -0.2, 0.33, -0.26, 0.03, 0.012, 0.03), PAL.white);
      m.add('capA', (x, y, z) => rbox(x, y, z, 0.48, 0.22, -0.16, 0.1, 0.05, 0.06, 0.025), PAL.cream);
      m.add('capB', (x, y, z) => rbox(x, y, z, 0.48, 0.22, 0.04, 0.1, 0.05, 0.06, 0.025), PAL.gold);
      m.add('capC', (x, y, z) => rbox(x, y, z, -0.56, 0.22, -0.08, 0.06, 0.05, 0.1, 0.025), PAL.cream);
      m.add('header', (x, y, z) => rbox(x, y, z, 0, 0.23, 0.46, 0.5, 0.055, 0.075, 0.03), PAL.ink);
      m.add('pins', (x, y, z) => { let d = 9; for (let i = 0; i < 6; i++) d = Math.min(d, rcyl(x, y, z, -0.4 + i * 0.16, 0.34, 0.46, 'y', 0.03, 0.09, 0.012)); return d; }, PAL.gold, { mat: 'metal' });
      return m;
    },
    moving: 'No moving parts',
  },
  sbc: {
    label: 'Single-board computer, no brand',
    make() {
      const m = def();
      const hole = (x, z) => Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => Math.hypot(x - a * 1.08, z - b * 0.68) - 0.08));
      m.add('board', (x, y, z) => smax(rbox(x, y, z, 0, 0.1, 0, 1.28, 0.08, 0.86, 0.08), -hole(x, z), 0.02), PAL.pcbB);
      m.add('chip', (x, y, z) => rbox(x, y, z, -0.42, 0.27, 0.05, 0.3, 0.08, 0.3, 0.04), PAL.steel, { mat: 'metal' });
      m.add('ram', (x, y, z) => rbox(x, y, z, 0.12, 0.23, 0.08, 0.18, 0.05, 0.24, 0.03), PAL.ink);
      m.add('header', (x, y, z) => rbox(x, y, z, -0.15, 0.25, -0.71, 0.9, 0.07, 0.09, 0.03) + Math.sin(x * 30) * 0.004, PAL.ink);
      m.add('pins', (x, y, z) => { let d = 9; for (let i = 0; i < 12; i++) d = Math.min(d, rcyl(x, y, z, -0.98 + i * 0.15, 0.36, -0.71, 'y', 0.024, 0.07, 0.01)); return d; }, PAL.gold, { mat: 'metal' });
      for (const [i, z0] of [0.56, 0.08, -0.4].entries()) {
        m.add(`port${i}`, (x, y, z) => rbox(x, y, z, 1.02, 0.36, z0, 0.3, 0.2, 0.2, 0.04), PAL.steel, { mat: 'metal' });
        m.add(`slot${i}`, (x, y, z) => rbox(x, y, z, 1.31, 0.36, z0, 0.02, 0.11, 0.13, 0.01), PAL.ink);
      }
      return m;
    },
    moving: 'No moving parts',
  },
  camera: cameraSpec(1.26, 'Depth camera on a tripod'),
  cameraShort: { ...cameraSpec(0.62, 'Depth camera, short tripod'), variant: true },
  cameraTall: { ...cameraSpec(3.4, 'Depth camera, tall tripod'), variant: true },
  rack: {
    label: 'Server rack',
    make() {
      const m = def();
      m.add('frame', (x, y, z) => rbox(x, y, z, 0, 3.2, 0, 1.25, 3.05, 1.02, 0.22), PAL.ink);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(`foot${sx}${sz}`, (x, y, z) => rcyl(x, y, z, sx * 0.95, 0.09, sz * 0.72, 'y', 0.13, 0.09, 0.04), PAL.ink);
      for (let i = 0; i < 5; i++) {
        const cy = 1.05 + i * 1.08, name = `unit${i}`;
        m.add(name, (x, y, z) => rbox(x, y, z, 0, cy, 1.03, 1.02, 0.43, 0.08, 0.07), PAL.cream);
        m.add(`vent${i}`, (x, y, z) => { let d = 9; for (let k = -1; k <= 1; k++) d = Math.min(d, rbox(x, y, z, -0.28, cy + k * 0.18, 1.1, 0.56, 0.035, 0.02, 0.015)); return d; }, PAL.ink);
        m.add(`ledA${i}`, (x, y, z) => ell(x, y, z, 0.6, cy, 1.12, 0.075, 0.075, 0.035), '#57d98a', { led: '#57d98a' });
        m.add(`ledB${i}`, (x, y, z) => ell(x, y, z, 0.83, cy, 1.12, 0.075, 0.075, 0.035), '#f2b84b', { led: '#f2b84b' });
      }
      return m;
    },
    moving: 'Status lights can blink',
  },
  laptop: {
    label: 'Laptop',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rbox(x, y, z, 0, 0.1, 0, 1.28, 0.1, 0.9, 0.09), PAL.grey);
      m.add('deck', (x, y, z) => rbox(x, y, z, 0, 0.2, -0.14, 1.08, 0.015, 0.54, 0.012), PAL.ink);
      m.add('keys', (x, y, z) => { const fx = Math.max(-5, Math.min(5, Math.round(x / 0.19))) * 0.19, fz = Math.max(-2, Math.min(2, Math.round((z + 0.14) / 0.2))) * 0.2 - 0.14; return rbox(x, y, z, fx, 0.225, fz, 0.08, 0.02, 0.085, 0.018); }, '#4b4b52');
      m.add('pad', (x, y, z) => rbox(x, y, z, 0, 0.195, 0.62, 0.36, 0.018, 0.2, 0.015), PAL.cream);
      m.add('hinge', (x, y, z) => rcyl(x, y, z, 0, 0.2, -0.84, 'x', 0.1, 1.05, 0.04), PAL.grey);
      m.add('lid', (x, y, z) => rbox(x, y, z, 0, 1.08, -0.84, 1.28, 0.94, 0.07, 0.07), PAL.grey, { pivot: [0, 0.2, -0.84], free: true });
      m.add('screen', (x, y, z) => rbox(x, y, z, 0, 1.14, -0.76, 1.12, 0.74, 0.015, 0.012), PAL.screen, { parent: 'lid', mat: 'gloss' });
      return m;
    },
    rest(g) { g.lid.rotation.x = -0.22; },
    pose(g) { g.lid.rotation.x = 0.85; },
    moving: 'Lid opens and closes',
  },
  shelf: {
    label: 'Storage shelf with barrels',
    make() {
      const m = def();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(`post${sx}${sz}`, (x, y, z) => rbox(x, y, z, sx * 1.95, 2.75, sz * 0.82, 0.14, 2.75, 0.14, 0.06), PAL.ink);
      for (const [i, cy] of [0.5, 2.4, 4.3].entries()) {
        m.add(`board${i}`, (x, y, z) => rbox(x, y, z, 0, cy, 0, 2.02, 0.1, 0.92, 0.06), PAL.cream);
        for (const sx of [-1, 1]) {
          const bx = sx * 0.98, by = cy + 0.1 + 0.7, n = `barrel${i}${sx}`;
          m.add(n, (x, y, z) => { const u = (y - by) / 0.7, R = 0.5 + 0.08 * (1 - u * u), d1 = Math.hypot(x - bx, z) - R + 0.1, d2 = Math.abs(y - by) - 0.7 + 0.1; return Math.min(Math.max(d1, d2), 0) + Math.hypot(Math.max(d1, 0), Math.max(d2, 0)) - 0.1; }, PAL.barrel, { pivot: [bx, by, 0], free: true });
          for (const k of [-1, 1]) m.add(`${n}ring${k}`, (x, y, z) => torus(x, y, z, bx, by + k * 0.34, 0, 'y', 0.55, 0.035), PAL.white, { parent: n });
        }
      }
      return m;
    },
    pose(g) { g['barrel11'].position.z += 0.42; g['barrel0-1'].position.z += 0.42; },
    moving: 'Each barrel can slide out',
  },
  orange: {
    label: 'Orange',
    make() {
      const m = def();
      m.add('fruit', (x, y, z) => smax(ell(x, y, z, 0, 0.78, 0, 0.78, 0.74, 0.78), -ell(x, y, z, 0, 1.52, 0, 0.13, 0.05, 0.13), 0.06) + Math.sin(x * 62) * Math.sin(y * 62) * Math.sin(z * 62) * 0.0016, PAL.fruit);
      m.add('stem', (x, y, z) => cone(x, y, z, 0, 1.46, 0, 0.02, 1.62, 0, 0.05, 0.035), '#6b5138');
      m.add('leaf', (x, y, z) => { const a = -0.42, c = Math.cos(a), s = Math.sin(a), px = x - 0.33, py = y - 1.62, u = c * px - s * py, v = s * px + c * py; return ell(u, v + Math.abs(u) * 0.05, z, 0, 0, 0, 0.33, 0.035, 0.15); }, PAL.leaf);
      return m;
    },
    moving: 'No moving parts',
  },
  target: {
    label: 'Target block and flag',
    pieces: 2,
    make() {
      const m = def();
      m.add('block', (x, y, z) => rbox(x, y, z, 0, 0.68, 0, 0.68, 0.68, 0.68, 0.17), PAL.target);
      m.add('ring', (x, y, z) => torus(x, y, z, 0, 0.68, 0.67, 'z', 0.36, 0.05), PAL.white);
      m.add('dot', (x, y, z) => ell(x, y, z, 0, 0.68, 0.67, 0.13, 0.13, 0.05), PAL.white);
      m.add('foot', (x, y, z) => rcyl(x, y, z, 1.75, 0.08, 0, 'y', 0.38, 0.08, 0.05), PAL.ink);
      m.add('pole', (x, y, z) => cone(x, y, z, 1.75, 0.1, 0, 1.75, 3.45, 0, 0.065, 0.055), PAL.ink);
      m.add('tip', (x, y, z) => ell(x, y, z, 1.75, 3.5, 0, 0.11, 0.11, 0.11), PAL.cream);
      m.add('cloth', (x, y, z) => rbox(x, y, z - 0.09 * Math.sin((x - 1.8) * 4.2), 2.38, 2.95, 0, 0.58, 0.45, 0.045, 0.04) * 0.72, PAL.target, { pivot: [1.75, 2.95, 0] });
      return m;
    },
    pose(g) { g.cloth.rotation.y = -0.65; },
    moving: 'Flag swings',
  },
  table: {
    label: 'Table',
    make() {
      const m = def();
      m.add('top', (x, y, z) => rbox(x, y, z, 0, 2.62, 0, 2.3, 0.14, 1.3, 0.11), PAL.wood);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(`leg${sx}${sz}`, (x, y, z) => cone(x, y, z, sx * 1.9, 2.5, sz * 0.95, sx * 2.0, 0.12, sz * 1.03, 0.16, 0.115), PAL.ink);
      return m;
    },
    moving: 'No moving parts',
  },
  crate: {
    label: 'Cardboard box',
    make() {
      const m = def();
      m.add('box', (x, y, z) => smax(rbox(x, y, z, 0, 0.82, 0, 0.95, 0.82, 0.8, 0.09), -rbox(x, y, z, 0, 1.64, 0, 0.012, 0.05, 0.9, 0.006), 0.012), PAL.card);
      m.add('tape', (x, y, z) => Math.min(rbox(x, y, z, 0, 1.645, 0, 0.2, 0.012, 0.81, 0.01), rbox(x, y, z, 0, 1.38, 0.805, 0.2, 0.26, 0.012, 0.01), rbox(x, y, z, 0, 1.38, -0.805, 0.2, 0.26, 0.012, 0.01)), PAL.cream);
      m.add('label', (x, y, z) => rbox(x, y, z, 0.48, 0.55, 0.805, 0.28, 0.2, 0.012, 0.012), PAL.white);
      return m;
    },
    moving: 'No moving parts',
  },
  clock: {
    label: 'Clock',
    make() {
      const m = def(), C = [0, 1.32, 0];
      m.add('case', (x, y, z) => rcyl(x, y, z, 0, 1.32, 0, 'z', 1.08, 0.2, 0.14), PAL.ink);
      m.add('dial', (x, y, z) => rcyl(x, y, z, 0, 1.32, 0.17, 'z', 0.88, 0.05, 0.03), PAL.white);
      m.add('ticks', (x, y, z) => { const a = Math.atan2(x, y - 1.32), k = Math.round(a / (Math.PI / 6)) * Math.PI / 6, r = 0.72; return ell(x, y, z, r * Math.sin(k), 1.32 + r * Math.cos(k), 0.225, 0.045, 0.045, 0.012); }, PAL.ink);
      m.add('foot', (x, y, z) => smin(rbox(x, y, z, 0, 0.09, 0, 0.72, 0.09, 0.3, 0.07), cone(x, y, z, 0, 0.1, 0, 0, 0.4, 0, 0.2, 0.16), 0.06), PAL.ink);
      m.add('hour', (x, y, z) => rbox(x, y, z, 0, 1.56, 0.25, 0.05, 0.27, 0.018, 0.015), PAL.ink, { pivot: [0, 1.32, 0.25] });
      m.add('minute', (x, y, z) => rbox(x, y, z, 0, 1.67, 0.28, 0.035, 0.38, 0.015, 0.012), PAL.robot, { pivot: [0, 1.32, 0.28] });
      m.add('pin', (x, y, z) => Math.min(ell(x, y, z, 0, 1.32, 0.31, 0.07, 0.07, 0.03), rcyl(x, y, z, 0, 1.32, 0.26, 'z', 0.04, 0.06, 0.01)), PAL.cream);
      return m;
    },
    rest(g) { g.hour.rotation.z = -1.0; g.minute.rotation.z = 0.5; },
    pose(g) { g.hour.rotation.z = 0.8; g.minute.rotation.z = -2.2; },
    moving: 'Hands turn',
  },
  map: {
    label: 'Folded map with a pin',
    make() {
      const m = def(), fold = (x) => { const t = (x + 3) * 0.75, u = t - Math.floor(t); return 0.1 + 0.2 * Math.abs(u - 0.5) * 2; };
      m.add('sheet', (x, y, z) => rbox(x, y - fold(x), z, 0, 0, 0, 2, 0.03, 1.4, 0.025) * 0.8, PAL.map);
      m.add('road', (x, y, z) => Math.min(rbox(x, y - fold(x) - 0.018, z - 0.25 * Math.sin(x * 1.3), 0, 0, 0, 1.94, 0.04, 0.085, 0.02), rbox(x, y - fold(x) - 0.018, z, 0.5, 0, 0, 0.085, 0.04, 1.34, 0.02)) * 0.8, PAL.white);
      m.add('pin', (x, y, z) => smin(ell(x, y, z, 0.5, 0.94, 0.25, 0.22, 0.22, 0.22), cone(x, y, z, 0.5, 0.83, 0.25, 0.5, 0.2, 0.25, 0.14, 0.02), 0.05), PAL.red, { pivot: [0.5, 0.2, 0.25], free: true });
      return m;
    },
    pose(g) { g.pin.position.x -= 1.0; g.pin.position.z -= 0.5; },
    moving: 'Pin moves',
  },
  tag: {
    label: 'Marker tag on a stand',
    make() {
      const m = def(), cy = 1.22, B = ['111111', '100101', '101001', '110011', '100101', '111111'];
      m.add('plate', (x, y, z) => rbox(x, y, z, 0, cy, 0, 0.95, 0.95, 0.07, 0.07), PAL.white);
      m.add('bits', (x, y, z) => { const c = 0.2, i = Math.max(0, Math.min(5, Math.round((x + 0.5) / c))), j = Math.max(0, Math.min(5, Math.round((cy + 0.5 - y) / c))); let d = 9; for (let a = Math.max(0, i - 1); a <= Math.min(5, i + 1); a++) for (let b = Math.max(0, j - 1); b <= Math.min(5, j + 1); b++) if (B[b][a] === '1') d = Math.min(d, rbox(x, y, z, -0.5 + a * c, cy + 0.5 - b * c, 0.075, 0.1, 0.1, 0.012, 0.006)); return d; }, PAL.ink);
      m.add('foot', (x, y, z) => smin(rbox(x, y, z, 0, 0.08, 0, 0.62, 0.08, 0.34, 0.06), rbox(x, y, z, 0, 0.22, 0, 0.14, 0.14, 0.09, 0.04), 0.05), PAL.ink);
      return m;
    },
    moving: 'No moving parts',
  },
  cart: {
    label: 'Cart on a spring',
    make() {
      const m = def(), X0 = -2.44, L = 1.9, T = 7, P = L / T, Y = 0.85;
      m.add('floor', (x, y, z) => rbox(x, y, z, 0.1, 0.06, 0, 3.0, 0.06, 0.8, 0.05), PAL.grey);
      m.add('wall', (x, y, z) => rbox(x, y, z, -2.65, 1.0, 0, 0.17, 0.95, 0.72, 0.09), PAL.ink);
      m.add('spring', (x, y, z) => { const dy = y - Y, th = Math.atan2(z, dy), k = Math.round((x - X0 - (th / 6.283) * P) / P), xc = Math.max(X0, Math.min(X0 + L, X0 + (k + th / 6.283) * P)); return (Math.hypot(Math.hypot(dy, z) - 0.28, x - xc) - 0.05) * 0.8; }, PAL.teal, { pivot: [X0, Y, 0] });
      m.add('plateA', (x, y, z) => rcyl(x, y, z, -2.46, Y, 0, 'x', 0.36, 0.045, 0.02), PAL.ink);
      m.add('body', (x, y, z) => rbox(x, y, z, 0.3, 0.95, 0, 0.82, 0.55, 0.62, 0.2), PAL.robot, { pivot: [0.3, 0.42, 0], free: true });
      m.add('plateB', (x, y, z) => rcyl(x, y, z, -0.53, Y, 0, 'x', 0.36, 0.045, 0.02), PAL.ink, { parent: 'body' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const cx = 0.3 + sx * 0.5, cz = sz * 0.62; m.add(`wheel${sx}${sz}`, (x, y, z) => rcyl(x, y, z, cx, 0.33, cz, 'z', 0.21, 0.1, 0.05) + Math.sin(Math.atan2(y - 0.33, x - cx) * 3) * 0.012, PAL.ink, { parent: 'body', pivot: [cx, 0.33, cz] }); }
      return m;
    },
    pose(g) { g.body.position.x += 0.7; g.spring.scale.x = (1.9 + 0.7) / 1.9; },
    moving: 'Spring stretches',
  },
  disk: {
    label: 'Disk drive, open',
    make() {
      const m = def();
      m.add('base', (x, y, z) => rbox(x, y, z, 0, 0.14, 0, 1.08, 0.14, 1.42, 0.11), PAL.ink);
      m.add('platter', (x, y, z) => rcyl(x, y, z, 0, 0.32, 0.26, 'y', 0.88, 0.04, 0.02) + Math.sin(Math.atan2(x, z - 0.26) * 2) * 0.0005, PAL.steel, { pivot: [0, 0.32, 0.26], mat: 'metal' });
      m.add('hub', (x, y, z) => rcyl(x, y, z, 0, 0.38, 0.26, 'y', 0.2, 0.05, 0.02), PAL.cream, { parent: 'platter' });
      m.add('pivotPost', (x, y, z) => rcyl(x, y, z, 0.8, 0.36, -1.0, 'y', 0.16, 0.08, 0.03), PAL.grey);
      m.add('reader', (x, y, z) => smin(cone(x, y, z, 0.8, 0.44, -1.0, 0.18, 0.44, 0.42, 0.075, 0.035), ell(x, y, z, 0.8, 0.44, -1.0, 0.13, 0.05, 0.13), 0.04), PAL.robot, { pivot: [0.8, 0.44, -1.0] });
      return m;
    },
    pose(g) { g.reader.rotation.y = -0.35; g.platter.rotation.y = 1; },
    moving: 'Reader arm swings',
  },
  book: {
    label: 'Book and pen',
    make() {
      const m = def();
      m.add('covers', (x, y, z) => Math.min(rbox(x, y, z, 0, 0.06, 0, 1.2, 0.05, 0.86, 0.04), rbox(x, y, z, 0, 0.56, 0, 1.2, 0.05, 0.86, 0.04), rbox(x, y, z, -1.15, 0.31, 0, 0.05, 0.28, 0.86, 0.04)), PAL.red);
      m.add('pages', (x, y, z) => rbox(x, y, z, 0.03, 0.31, 0, 1.1, 0.2, 0.8, 0.02) + Math.sin(y * 70) * 0.002, PAL.cream);
      m.add('pen', (x, y, z) => { const ax = 0.28, c = Math.cos(ax), s = Math.sin(ax), u = c * (x - 0.1) - s * z, w = s * (x - 0.1) + c * z; return cone(u, y, w, -0.72, 0.675, 0, 0.42, 0.675, 0, 0.065, 0.065); }, PAL.barrel, { pivot: [0.1, 0.675, 0], free: true });
      m.add('nib', (x, y, z) => { const ax = 0.28, c = Math.cos(ax), s = Math.sin(ax), u = c * (x - 0.1) - s * z, w = s * (x - 0.1) + c * z; return cone(u, y, w, 0.42, 0.675, 0, 0.66, 0.675, 0, 0.06, 0.012); }, PAL.ink, { parent: 'pen' });
      return m;
    },
    pose(g) { g.pen.position.y += 0.3; g.pen.rotation.z = -0.75; },
    moving: 'Pen lifts and writes',
  },
  conveyor: {
    label: 'Conveyor',
    make() {
      const m = def(), Y = 1.65;
      m.add('belt', (x, y, z) => { const px = Math.max(Math.abs(x) - 2.55, 0), dy = y - Y, d1 = Math.hypot(px, dy) - 0.29, d2 = Math.abs(z) - 0.82; return Math.min(Math.max(d1, d2), 0) + Math.hypot(Math.max(d1, 0), Math.max(d2, 0)) - 0.03 + Math.sin(x * 12) * 0.008 * (dy > 0 ? 1 : 0); }, PAL.ink);
      for (const sz of [-1, 1]) m.add(`rail${sz}`, (x, y, z) => rbox(x, y, z, 0, Y, sz * 0.92, 2.55, 0.22, 0.07, 0.05), PAL.cream);
      for (let i = 0; i < 6; i++) { const cx = -2.3 + i * 0.92; m.add(`roller${i}`, (x, y, z) => rcyl(x, y, z, cx, Y, 0.985, 'z', 0.14, 0.03, 0.015), PAL.robot, { pivot: [cx, Y, 0.985] }); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(`leg${sx}${sz}`, (x, y, z) => rbox(x, y, z, sx * 2.1, 0.72, sz * 0.86, 0.11, 0.72, 0.11, 0.05), PAL.ink);
      return m;
    },
    moving: 'Rollers can turn',
  },
  radio: {
    label: 'Radio with an antenna',
    make() {
      const m = def();
      m.add('body', (x, y, z) => rbox(x, y, z, 0, 1.05, 0, 0.62, 1.05, 0.3, 0.2), '#5d6f5a');
      m.add('screen', (x, y, z) => rbox(x, y, z, 0, 1.55, 0.29, 0.42, 0.26, 0.02, 0.018), PAL.screen, { mat: 'gloss' });
      m.add('grille', (x, y, z) => { let d = 9; for (let k = 0; k < 5; k++) d = Math.min(d, rbox(x, y, z, 0, 0.42 + k * 0.17, 0.295, 0.4, 0.03, 0.012, 0.01)); return d; }, PAL.ink);
      m.add('knob', (x, y, z) => rcyl(x, y, z, 0.32, 2.2, 0, 'y', 0.13, 0.13, 0.03), PAL.cream, { pivot: [0.32, 2.2, 0] });
      m.add('antenna', (x, y, z) => Math.min(cone(x, y, z, -0.34, 2.05, 0, -0.34, 3.5, 0, 0.075, 0.045), ell(x, y, z, -0.34, 3.55, 0, 0.1, 0.1, 0.1)), PAL.ink);
      return m;
    },
    moving: 'Knob turns',
  },
  servo: {
    label: 'Servo motor',
    make() {
      const m = def();
      m.add('body', (x, y, z) => smin(rbox(x, y, z, 0, 0.72, 0, 1.0, 0.72, 0.5, 0.16), rbox(x, y, z, 0, 1.02, 0, 1.36, 0.08, 0.5, 0.06), 0.03), PAL.ink);
      m.add('label', (x, y, z) => rbox(x, y, z, -0.1, 0.55, 0.495, 0.62, 0.26, 0.012, 0.012), PAL.robot);
      m.add('collar', (x, y, z) => rcyl(x, y, z, 0.42, 1.52, 0, 'y', 0.3, 0.1, 0.04), PAL.grey);
      m.add('horn', (x, y, z) => smin(rcyl(x, y, z, 0.42, 1.7, 0, 'y', 0.22, 0.09, 0.04), cone(x, y, z, 0.42, 1.7, 0, 1.25, 1.7, 0, 0.14, 0.09), 0.05), PAL.cream, { pivot: [0.42, 1.7, 0] });
      for (const [i, c] of [PAL.red, PAL.gold, PAL.white].entries()) m.add(`wire${i}`, (x, y, z) => { const dz = (i - 1) * 0.1; return Math.min(cone(x, y, z, -1.0, 0.3, dz, -1.45, 0.25, dz, 0.05, 0.05), cone(x, y, z, -1.45, 0.25, dz, -1.75, 0.08, dz + 0.12, 0.05, 0.05)); }, c);
      return m;
    },
    rest(g) { g.horn.rotation.y = 0.4; },
    pose(g) { g.horn.rotation.y = -1.1; },
    moving: 'Horn turns',
  },
  node: {
    label: 'Network node',
    make() {
      const m = def(), C = 0.95, stubs = [[0.95, 0.3, 0.5], [-0.95, 0.3, 0.5], [0, -0.05, -1.05]];
      m.add('core', (x, y, z) => ell(x, y, z, 0, C, 0, 0.85, 0.85, 0.85), PAL.pcbA);
      m.add('band', (x, y, z) => torus(x, y, z, 0, C, 0, 'y', 0.84, 0.06), PAL.cream);
      m.add('light', (x, y, z) => ell(x, y, z, 0, C + 0.32, 0.77, 0.11, 0.11, 0.05), '#57d98a', { led: '#57d98a' });
      for (const [i, [a, b, c]] of stubs.entries()) { const l = Math.hypot(a, b, c), ux = a / l, uy = b / l, uz = c / l; m.add(`port${i}`, (x, y, z) => smin(cone(x, y, z, ux * 0.7, C + uy * 0.7, uz * 0.7, ux * 1.2, C + uy * 1.2, uz * 1.2, 0.17, 0.15), ell(x, y, z, ux * 1.22, C + uy * 1.22, uz * 1.22, 0.2, 0.2, 0.2), 0.04), PAL.ink); }
      return m;
    },
    moving: 'Light can blink',
  },
};

// What each connector must touch. "make attached" measures these: being connected through some
// other part is not enough, because a spring can touch its cart and the floor and miss its wall.
export const JOINS = {
  cart: [['plateA', 'wall'], ['spring', 'plateA'], ['spring', 'plateB'], ['plateB', 'body'], ['wall', 'floor']],
  tank: [[/^wheel-?\d-?\d$/, 'body'], ['lidarBase', 'deck'], ['lidarHead', 'lidarBase'], ['deck', 'body'], ['bumper', 'body']],
  drone: [[/^arm(.*)$/, 'body'], [/^arm(.*)$/, 'motor$1'], [/^prop(.*)$/, 'motor$1'], [/^skid/, 'body'], ['shell', 'body'], ['gimbal', 'body']],
  arm: [['turret', 'base'], ['shoulderJoint', 'turret'], ['elbowJoint', 'shoulder'], ['wristJoint', 'elbow'], [/^finger/, 'wrist']],
  armShort: [['column', 'base'], ['hub', 'column'], [/^leg/, 'hub'], ['turret', 'base']],
  armTall: [['column', 'base'], ['hub', 'column'], [/^leg/, 'hub'], ['turret', 'base']],
  camera: [['post', 'bar'], ['post', 'column'], ['hub', 'column'], [/^leg/, 'hub']],
  cameraShort: [['post', 'bar'], ['post', 'column'], ['hub', 'column'], [/^leg/, 'hub']],
  cameraTall: [['post', 'bar'], ['post', 'column'], ['hub', 'column'], [/^leg/, 'hub']],
  lidar: [['head', 'base'], ['cap', 'head']],
  imu: [['chip', 'board'], ['header', 'board'], ['pins', 'header']],
  sbc: [['chip', 'board'], ['header', 'board'], ['pins', 'header'], [/^port/, 'board']],
  rack: [[/^foot/, 'frame'], [/^unit/, 'frame']],
  laptop: [['hinge', 'base'], ['hinge', 'lid'], ['screen', 'lid']],
  shelf: [[/^post/, 'board0'], [/^post/, 'board2'], [/^barrel(\d)(-?1)$/, 'board$1']],
  orange: [['stem', 'fruit'], ['leaf', 'stem']],
  target: [['pole', 'foot'], ['tip', 'pole'], ['cloth', 'pole']],
  table: [[/^leg/, 'top']],
  crate: [['tape', 'box'], ['label', 'box']],
  clock: [['foot', 'case'], ['dial', 'case'], ['hour', 'pin'], ['minute', 'pin'], ['pin', 'dial']],
  map: [['pin', 'sheet'], ['road', 'sheet']],
  tag: [['foot', 'plate'], ['bits', 'plate']],
  disk: [['platter', 'hub'], ['pivotPost', 'base'], ['reader', 'pivotPost']],
  book: [['pen', 'covers'], ['nib', 'pen'], ['pages', 'covers']],
  conveyor: [[/^leg/, 'belt'], [/^rail/, 'belt'], [/^roller/, /^rail1$/]],
  radio: [['knob', 'body'], ['antenna', 'body'], ['screen', 'body'], ['grille', 'body']],
  servo: [['collar', 'body'], ['horn', 'collar'], [/^wire/, 'body'], ['label', 'body']],
  node: [[/^port/, 'core'], ['band', 'core'], ['light', 'core']],
};

// Add the model sets to the kit.
for (const set of [IPCV1, IPCV2, IPCV3, IPCV4, IPCV5, IPCV6]) { Object.assign(MODELS, set.MODELS); Object.assign(JOINS, set.JOINS); }

// Finds the part's bounds from its distance field, and a mesh step from its size.
function autoBox(f) {
  const G = 0.25, E = 8; let a = [9, 9, 9], b = [-9, -9, -9];
  for (let x = -E; x <= E; x += G) for (let y = -1; y <= 12; y += G) for (let z = -E; z <= E; z += G) if (f(x, y, z) < G) { a = [Math.min(a[0], x), Math.min(a[1], y), Math.min(a[2], z)]; b = [Math.max(b[0], x), Math.max(b[1], y), Math.max(b[2], z)]; }
  const size = Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 2 * G, step = clamp(size / 85, 0.007, 0.032);
  return { min: a.map((v) => v - G), max: b.map((v) => v + G), step };
}

export function buildModel(THREE, name) {
  const spec = MODELS[name], d = spec.make(), byName = Object.fromEntries(d.parts.map((p) => [p.name, p]));
  // A part marked free travels away from its place. It and the parts on it leave no saved
  // shadow on the rest of the model, so nothing marks the spot where it rested.
  const freeRoot = (p) => { for (let q = p; q; q = byName[q.parent]) if (q.free) return q.name; return null; };
  const worldFor = (p) => { const r = freeRoot(p), mine = d.parts.filter((q) => freeRoot(q) === r); return (x, y, z) => { let m = 9; for (const q of mine) m = Math.min(m, q.f(x, y, z)); return m; }; };
  const mats = {
    clay: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.56, sheen: 0.28, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffe9d8'), specularIntensity: 0.32 }),
    gloss: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.12 }),
    metal: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.55 }),
  };
  const root = new THREE.Group(), groups = {};
  for (const p of d.parts) {
    const base = new THREE.Color(p.color), deep = base.clone().multiplyScalar(0.42).lerp(new THREE.Color('#3a2a26'), 0.12);
    const g = bake(THREE, `m-${name}-${p.name}`, p.f, () => { const b = autoBox(p.f), st = p.step ?? spec.step; if (st) b.step = st; return b; }, 0, worldFor(p), (x, y, z, n, A, o) => { o[0] = mix(deep.r, base.r, A); o[1] = mix(deep.g, base.g, A); o[2] = mix(deep.b, base.b, A); });
    const parent = p.parent ? groups[p.parent] : null, pv = p.pivot || parent?.userData.pv || [0, 0, 0], ppv = parent?.userData.pv || [0, 0, 0];
    const grp = new THREE.Group(); grp.userData.pv = pv; grp.userData.f = p.f; grp.userData.part = p.name; grp.position.set(pv[0] - ppv[0], pv[1] - ppv[1], pv[2] - ppv[2]);
    g.translate(-pv[0], -pv[1], -pv[2]);
    const mat = p.led ? new THREE.MeshStandardMaterial({ color: p.led, emissive: p.led, emissiveIntensity: 0.75, roughness: 0.4 }) : mats[p.mat || 'clay'];
    grp.add(new THREE.Mesh(g, mat));
    (parent || root).add(grp); groups[p.name] = grp;
  }
  spec.rest?.(groups);
  // setPose(k): blends from the rest pose (0) to the model's moving pose (1).
  const take = () => Object.values(groups).map((g) => [g.position.clone(), g.rotation.clone(), g.scale.clone()]);
  const A = take(); spec.pose?.(groups); const B = take();
  const setPose = (k) => Object.values(groups).forEach((g, i) => {
    g.position.lerpVectors(A[i][0], B[i][0], k); g.scale.lerpVectors(A[i][2], B[i][2], k);
    g.rotation.set(A[i][1].x + (B[i][1].x - A[i][1].x) * k, A[i][1].y + (B[i][1].y - A[i][1].y) * k, A[i][1].z + (B[i][1].z - A[i][1].z) * k);
  });
  setPose(0);
  return { root, groups, setPose, label: spec.label, moving: spec.moving, hasPose: !!spec.pose };
}
export const MODEL_NAMES = Object.keys(MODELS).filter((k) => !MODELS[k].variant);
export const ALL_MODELS = Object.keys(MODELS);
