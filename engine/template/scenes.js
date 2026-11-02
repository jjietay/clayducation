// One scene('id', { bg, setup, draw }) per "## id" in script.md.
// setup(s) runs once: build elements. draw(s) runs every frame: set them from s.t.
// Read the skill's reference/engine.md for the full API.

scene('hook', {
  bg: '#fdf6ec',
  setup(s) {
    s.title = s.text('{{title}}', { size: 110, weight: 700, color: '#2b2d42' });
  },
  draw(s) {
    const k = s.p(0.2, 0.4, E.overshoot);
    set(s.title, { x: 0, y: (1 - k) * 40, opacity: Math.min(1, k * 2) });
  },
});

scene('idea', {
  bg: '#fdf6ec',
  setup(s) {
    s.dot = s.text('', { x: 960, y: 540 });
    s.dot.style.cssText += ';width:160px;height:160px;border-radius:50%;background:#ff6b35';
  },
  draw(s) {
    set(s.dot, { x: 0, y: 0, scale: s.p('#step', 0.4, E.overshoot) });
  },
});

scene('recap', {
  bg: '#2b2d42',
  setup(s) {
    s.line = s.text('Recap', { size: 96, weight: 700, color: '#fdf6ec' });
  },
  draw(s) {
    set(s.line, { opacity: s.p(0.2, 0.5) });
  },
});
