// One scene('id', { bg, setup, draw }) per "## id" in script.md.
// setup(s) runs once: build elements. draw(s) runs every frame: set them from s.t.
// Read the skill's styles/clay.md and reference/engine.md.
import { BG } from '/_lib/clay.js';

scene('hook', {
  bg: BG.cream,
  async setup(s) {
    s.g = await s.clay({ bg: BG.cream });
    s.hero = await s.g.mascot();
    s.g.orbit(0, 8, 42, [0, 5.2, 0]);           // look above him, so he stands low and the title is clear
    s.title = s.text('{{title}}', { size: 72, weight: 700, color: '#26262a', x: 960, y: 140 });
    await s.g.ready();
  },
  draw(s) {
    set(s.title, { opacity: s.p(0.2, 0.5) });
    s.hero.blendExpression('neutral', 'thinking', s.p(0.5, 0.9));
    s.hero.route(s.t, [[0.2, 6, 0, -Math.PI / 2], [2.2, 0, 0, 0]]);   // he walks in, then faces us
    s.g.render();
  },
});

scene('idea', {
  bg: BG.sky,
  async setup(s) {
    s.g = await s.clay({ bg: BG.sky });
    s.hero = await s.g.mascot({ x: -5 });
    s.bot = await s.g.model('tank', { x: 4, ry: -0.5, k: 1.4 });
    await s.g.ready();
  },
  draw(s) {
    s.g.orbit(-8 + 16 * s.p(0, s.dur), 10, 44, [0, 3, 0]);
    s.hero.blendPose('rest', 'point', s.p('#step', 0.5));
    // He walks to the robot, then shows it. Keys: [time, x, z, face]; route() comes after blendPose.
    s.hero.route(s.t, [[0.3, -7, 0, Math.PI / 2], [2.6, -3, 0, Math.PI / 2]]);
    s.g.render();
  },
});

scene('recap', {
  bg: BG.blush,
  async setup(s) {
    s.g = await s.clay({ bg: BG.blush });
    s.hero = await s.g.mascot();
    s.g.orbit(0, 8, 42, [0, 3.4, 0]);
    await s.g.ready();
  },
  draw(s) {
    s.hero.blendExpression('thinking', 'smile', s.p(0.2, 0.6));
    s.hero.route(s.t, [[0.2, -6, 0, Math.PI / 2], [2.2, 0, 0, 0]]);
    s.g.render();
  },
});
