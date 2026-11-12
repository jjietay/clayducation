// Models for the sensor fusion (Kalman filter) video: a plain hallway wall for a LiDAR beam to hit.
// Same rules as models.js: each part is a distance field, it stands on y = 0, +z is its front, and JOINS lists
// what each part must touch.
import { rbox } from '../sdf.js';
import { def } from '../models.js';

const C = { wall: '#e9e1d3', base: '#8c7b68', band: '#c9c0b2' };

export const MODELS = {
  // A wall panel 8 wide (x -4 to 4), 7 tall, 0.5 deep (front face at z 0.25), with a baseboard and a pale band at
  // y 2.4 to 3.6, where a robot's LiDAR beam hits. Turn it with ry so it faces the robot.
  wall: {
    label: 'Hallway wall',
    step: 0.05,
    make() {
      const m = def();
      m.add('panel', (x, y, z) => rbox(x, y, z, 0, 3.5, 0, 4.0, 3.5, 0.25, 0.08), C.wall);
      m.add('base', (x, y, z) => rbox(x, y, z, 0, 0.3, 0.05, 4.02, 0.3, 0.27, 0.05), C.base);
      m.add('band', (x, y, z) => rbox(x, y, z, 0, 3.0, 0.05, 4.01, 0.6, 0.26, 0.04), C.band);
      return m;
    },
    moving: 'No moving parts',
  },
};

export const JOINS = {
  wall: [['base', 'panel'], ['band', 'panel']],
};
