#!/usr/bin/env node
// Plants each fault that a video has really had, and confirms that the engine catches it. A check that
// nobody tests can stop working in silence, so "make selftest" runs after any change to the checks.
// A new fault found in a video gets a new case here, before the fix.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), MAKE = path.join(HERE, '..', 'make.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleidoscope-selftest-'));
const make = (...a) => { const r = spawnSync(process.execPath, [MAKE, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
let failed = 0;
// The test finds the digits from the salted hashes. A real look reads them from the images.
const digitsOf = (records) => records.map((r) => [...'0123456789'].find((d) => createHash('sha1').update(r.salt + d).digest('hex').slice(0, 16) === r.hash)).join('');
const code = () => digitsOf(JSON.parse(fs.readFileSync(path.join(dir, 'build', 'look', 'pending.json'), 'utf8')).checks);
const report = (name, pass, detail = '') => { console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${pass ? '' : `\n      ${detail.slice(0, 400)}`}`); if (!pass) failed++; };

// Each case is one 1 s scene: its code, and what the engine must say about that scene.
const CAM = "s.g.orbit(0, 8, 44, [0, 4, 0]);";
const world = (body) => `{ bg: BG.cream, async setup(s) { s.g = await s.clay({ bg: BG.cream }); s.hero = await s.g.mascot({ x: -9 }); ${body} ${CAM} await s.g.ready(); },`;
const CASES = {
  // A clean scene must give no fault: a check that always fires is useless too.
  clean: { code: `${world("s.m = await s.g.model('tank', { x: 5, ry: 1.57 }); s.lab = s.text('Clear', { x: 1500, y: 120, size: 40, color: '#222' });")} draw(s) { s.hero.place(-9 + s.t, 0, { face: 1.57 }); s.g.render(); } }`, expect: null },
  handThroughTable: { code: `${world("s.m = await s.g.model('table', { x: 0 });")} draw(s) { s.hero.place(-0.2, 0, { face: 1.57 }); s.g.render(); } }`, expect: /mascot .* into table|table .* into mascot/ },
  footIntoBox: { code: `${world("s.m = await s.g.model('crate', { x: 0 });")} draw(s) { s.hero.place(0, 0, { face: 1.57 }); s.g.render(); } }`, expect: /mascot (shoe|sole)\d into crate|crate .* into mascot (shoe|sole)/ },
  robotIntoTarget: { code: `${world("s.m = await s.g.model('tank', { x: 0 }); s.n = await s.g.model('target', { x: 0.4 });")} draw(s) { s.hero.place(-9, 0); s.g.render(); } }`, expect: /tank .* into target|target .* into tank/ },
  robotThroughPost: { code: `${world("s.m = await s.g.model('tank', { x: 0 }); s.p2 = s.g.post('#3f9e55', 2.6, 0.1); s.p2.position.x = 0.2;")} draw(s) { s.hero.place(-9, 0); s.g.render(); } }`, expect: /post .* into tank|tank .* into post/ },
  objectOverText: { code: `${world("s.m = await s.g.model('tank', { x: 0 }); s.lab = s.text('Covered', { x: 960, y: 760, size: 40, color: '#222' });")} draw(s) { s.hero.place(-9, 0); s.g.render(); } }`, expect: /text "Covered" on tank/ },
  headOverTitle: { code: `${world("s.lab = s.text('Title', { x: 960, y: 200, size: 60, color: '#222' });")} draw(s) { s.hero.place(0, 0); s.g.render(); } }`, expect: /text "Title" on mascot/ },
  armOutOfFrame: { code: `${world('')} draw(s) { s.hero.place(14, 0); s.g.render(); } }`, expect: /mascot leaves the frame/ },
  walksSideways: { code: `${world('')} draw(s) { s.hero.place(-6 + 6 * s.t, 0, { face: 0 }); s.g.render(); } }`, expect: /mascot walks sideways or backwards/ },
  handMissesHold: { code: `${world('')} draw(s) { s.hero.place(-4, 0, { face: 1.57 }); s.hero.hold(1, [6, 3, 0]); s.g.render(); } }`, expect: /hand 1 misses what it holds/ },
  ballThroughMascot: { code: `${world("s.b = s.g.ball('#3f7fdc');")} draw(s) { s.hero.place(-9, 0); s.b.position.set(-9, 3, 0); s.g.render(); } }`, expect: /mascot \w+ into ball|ball .* into mascot/ },
  walksTooSlowly: { code: `${world('')} draw(s) { s.hero.route(s.t, [[0, -9, 0, 1.57], [8, -3, 0, 1.57]]); s.g.render(); } }`, expect: /mascot walks too slowly/ },
  labelsCrossFade: { code: "{ bg: BG.cream, async setup(s) { s.g = await s.clay({ bg: BG.cream }); s.hero = await s.g.mascot({ x: -9 }); s.g.orbit(0, 8, 44, [0, 4, 0]); s.a = s.text('First label', { x: 1500, y: 300, size: 40, color: '#222' }); s.b = s.text('Second label', { x: 1500, y: 300, size: 40, color: '#222' }); await s.g.ready(); }, draw(s) { s.hero.place(-9, 0); set(s.a, { opacity: 1 - s.p(0.5, 0.3) }); set(s.b, { opacity: s.p(0.5, 0.3) }); s.g.render(); } }", expect: /overlap .*First label.*Second label/ },
  formulasRunTogether: { code: `${world("const one = (x) => eqn(s, { x, y: 200, size: 60, pieces: { a: ['x = 1'] }, rows: { a: ['a'] }, steps: [{ at: 0, row: 'a', dur: 0.1 }] }); s.f1 = await one(1200); s.f2 = await one(1340);")} draw(s) { s.hero.place(-9, 0); s.f1.draw(); s.f2.draw(); s.g.render(); } }`, expect: /two formulas run together/ },
  shoulderIntoRack: { code: `${world("s.m = await s.g.model('rack', { x: 2.5 });")} draw(s) { s.hero.place(0, 0); s.g.render(); } }`, expect: /mascot (shirt|sleeve\d|upper\d) into rack|rack .* into mascot (shirt|sleeve\d|upper\d)/ },
  handThroughOwnBody: { code: `${world('')} draw(s) { s.hero.place(0, 0, { face: 1.57 }); s.hero.reach(1, [0, 3.9, 0]); s.g.render(); } }`, expect: /mascot (hand|fore)1 into own/ },
  arrowThroughMascot: { code: `${world("s.a = s.g.arrow('#d6503e');")} draw(s) { s.hero.place(-9, 0); s.a.set([-13, 4, 0], [-5, 4, 0]); s.g.render(); } }`, expect: /arrow .* into mascot|mascot .* into arrow/ },
  oneFrameContact: { code: `${world("s.m = await s.g.model('tank', { x: 0 }); s.n = await s.g.model('target', { x: 6 });")} draw(s) { s.hero.place(-9, 0); s.n.root.position.x = Math.abs(s.t - 16 / 30) < 0.01 ? 0.4 : 6; s.g.render(); } }`, expect: /tank .* into target|target .* into tank/ },
  gripIsAllowed: { code: `${world("s.m = await s.g.model('rack', { x: 0 });")} draw(s) { s.hero.place(-3.6, 0, { face: 1.57 }); s.hero.hold(1, [-1.15, 4.0, -1.3]); s.g.render(); } }`, expect: null },
  holdsAboveObject: { code: `${world("s.m = await s.g.model('rack', { x: 0 });")} draw(s) { s.hero.place(-3.6, 0, { face: 1.57 }); s.hero.hold(1, [-1.8, 4.0, -1.3]); s.g.render(); } }`, expect: /hand 1 does not touch the rack/ },
  // A hand on its way to a grip is judged only when the hold is complete; the complete hold above still fails.
  gripOnItsWay: { code: `${world("s.m = await s.g.model('rack', { x: 0 });")} draw(s) { s.hero.place(-3.6, 0, { face: 1.57 }); s.hero.hold(1, [-1.15, 4.0, -1.3], 0.6); s.g.render(); } }`, expect: null },
  holdsNothing: { code: `${world('')} draw(s) { s.hero.place(-4, 0, { face: 1.57 }); s.hero.hold(1, [-3, 3, 0]); s.g.render(); } }`, expect: /hand 1 holds nothing/ },
  raisesStraightArm: { code: `${world('')} draw(s) { s.hero.place(-4, 0, { face: 1.57 }); s.hero.reach(1, [8, 9, 0]); s.g.render(); } }`, expect: /mascot raises a straight arm/ },
  formulaSitsStill: { dur: 4, code: `${world("s.f = await s.tex('x = 1', { x: 1500, y: 200, size: 60, color: '#222' });")} draw(s) { s.hero.place(-9, 0); s.g.render(); } }`, expect: /a formula sits still/ },
  voiceCancelsNothing: { code: `${world('')} draw(s) { s.hero.place(-9 + s.t, 0, { face: 1.57 }); s.g.render(); } }`, voice: 'The mass cancels here.', expect: /the voice says something cancels/ },
  voiceMovesNothing: { code: `${world('')} draw(s) { s.hero.place(-9, 0); s.g.render(); } }`, voice: 'Now move this term across.', expect: /the voice says something moves/ },
  overwritesStageSize: { code: "{ bg: BG.cream, setup(s) { s.H = 3; } }", expect: /read only|Cannot assign/ },
  overwritesTime: { code: "{ bg: BG.cream, setup(s) { s.t = {}; } }", expect: /only a getter|Cannot set/ },
};

const ids = Object.keys(CASES);
let script = '# Test\n\n', source = "import { BG } from '/_lib/clay.js';\nimport { eqn } from '/_lib/eqn.js';\n";
let clock = 0;
const scenes = ids.map((id, i) => {
  const c = CASES[id];
  script += `## ${id}\n${c.voice || 'A short test line.'}\n\n`;
  source += `scene('${id}', ${c.code});\n`;
  const words = (c.voice || 'A short test line.').split(' ').map((text, k) => ({ text, start: 0.05 + k * 0.1, end: 0.14 + k * 0.1 }));
  const dur = c.dur || 1, start = clock; clock += dur;
  return { id, index: i, start, dur, lead: 0, text: 'x', transition: 'none', words, marks: {}, attrs: {} };
});
const writeTimeline = (list) => {
  const total = list.reduce((n, x) => n + x.dur, 0), tl = { fps: 30, width: 1920, height: 1080, duration: total, frames: total * 30, transitionSeconds: 0.7, pace: 1, scenes: list, voiceSpans: [] };
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'build', 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(path.join(dir, 'build', 'timeline.js'), `window.TIMELINE = ${JSON.stringify(tl)};`);
};
fs.writeFileSync(path.join(dir, 'script.md'), script);
fs.writeFileSync(path.join(dir, 'scenes.js'), source);
fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({ title: 'selftest', _look: 'clay' }));
writeTimeline(scenes);

try {
  // ---------- the measures on each frame ----------
  const r = make('collide', dir);
  const lines = r.out.split('\n').filter((l) => l.startsWith('ERROR'));
  for (const id of ids) {
    const mine = lines.filter((l) => l.includes(`, ${id}:`) || l.includes(`scene ${id} `)), want = CASES[id].expect;
    if (!want) report(`${id} gives no fault`, mine.length === 0, mine.join('\n') || r.out);
    else report(`${id} is caught`, mine.some((l) => want.test(l)), mine.join('\n') || 'nothing reported');
  }

  // ---------- loose parts: a spring that stops short of its wall ----------
  const { measureJoins } = await import(pathToFileURL(path.join(HERE, '..', '..', 'styles', 'library', 'clay', 'joins.js')).href);
  const box = (x0, x1) => ({ f: (x, y, z) => Math.max(x0 - x, x - x1, Math.abs(y) - 0.5, Math.abs(z) - 0.5), pts: new Float32Array([x0, 0, 0, x1, 0, 0]) });
  const wall = { name: 'wall', ...box(-3, -2) }, spring = { name: 'spring', ...box(-1.7, 0) }, cart = { name: 'cart', ...box(0, 1) }, ptsOf = (p) => p.pts;
  report('a spring off its wall is caught', measureJoins([wall, spring, cart], [['spring', 'wall'], ['spring', 'cart']], 1, ptsOf).faults.some((f) => /spring does not touch wall/.test(f)));
  report('a model with no join list is caught', measureJoins([wall, spring], undefined, 1, ptsOf).faults.some((f) => /no join list/.test(f)));
  report('a model that connects gives no fault', measureJoins([{ name: 'wall', ...box(-3, -1.7) }, spring, cart], [['spring', 'wall'], ['spring', 'cart']], 1, ptsOf).faults.length === 0);

  // ---------- the rest use a small project ----------
  const one = [{ ...scenes[0], start: 0, dur: 2, marks: { a: 0.5 } }];
  fs.writeFileSync(path.join(dir, 'script.md'), '# Test\n\n## clean\nA short test line.\n');
  fs.writeFileSync(path.join(dir, 'scenes.js'), `import { BG } from '/_lib/clay.js';\nscene('clean', ${CASES.clean.code});\n`);
  writeTimeline(one);

  // ---------- two labels that cross-fade on one spot ----------
  const before = fs.readFileSync(path.join(dir, 'scenes.js'), 'utf8');
  fs.writeFileSync(path.join(dir, 'scenes.js'), `import { BG } from '/_lib/clay.js';\nscene('clean', { bg: BG.cream, setup(s) { s.a = s.text('First label', { x: 960, y: 400, size: 40, color: '#222' }); s.b = s.text('Second label', { x: 960, y: 400, size: 40, color: '#222' }); }, draw(s) { set(s.a, { opacity: 1 - s.p(1, 0.3) }); set(s.b, { opacity: s.p(1, 0.3) }); } });\n`);
  const rv = make('review', dir), ovf = path.join(dir, 'build', 'review', 'overlaps.md');
  report('labels that cross-fade on one spot are caught', fs.existsSync(ovf) && /First label.*Second label|Second label.*First label/.test(fs.readFileSync(ovf, 'utf8')), rv.out.slice(-400));
  fs.writeFileSync(path.join(dir, 'scenes.js'), before);

  // ---------- the voice stays when the script stays ----------
  const V = spawnSync(process.execPath, ['--input-type=module', '-e', `import { createHash } from 'node:crypto'; import fs from 'node:fs'; const d = ${JSON.stringify(dir)}, c = JSON.parse(fs.readFileSync(d + '/video.json', 'utf8')); process.stdout.write(createHash('sha1').update(fs.readFileSync(d + '/script.md')).update(JSON.stringify([c._tts || {}, c.fps, c.lead, c.hold, c.end])).digest('hex'));`], { encoding: 'utf8' });
  fs.writeFileSync(path.join(dir, 'build', 'voice.stamp'), V.stdout);
  report('an unchanged script keeps its voice', /script unchanged/.test(make('voice', dir).out));

  // ---------- the closed loop ----------
  report('build stops with no look', make('gate', dir).code !== 0);
  report('look --ok needs a look first', make('look', dir, '--ok', 'test').code !== 0);
  const l1 = make('look', dir);
  report('look measures and lists its frames', l1.code === 0 && /near-0\.jpg/.test(l1.out), l1.out);
  const good = code();
  report('look --ok refuses wrong digits', make('look', dir, '--ok', good.replace(/\d$/, (d) => (+d + 1) % 10)).code !== 0);
  report('look --ok refuses too few digits', make('look', dir, '--ok', good.slice(1)).code !== 0);
  report('look --ok opens the gate with the digits', make('look', dir, '--ok', good).code === 0 && make('gate', dir).code === 0);
  fs.appendFileSync(path.join(dir, 'scenes.js'), '// an edit outside any scene\n');
  const g2 = make('gate', dir);
  report('an edit closes the gate again', g2.code !== 0 && /clean/.test(g2.out), g2.out);
  report('look --ok refuses an edit made after the look', make('look', dir, '--ok', good).code !== 0);
  make('look', dir); make('look', dir, '--ok', code());
  const r1 = make('render', dir);
  report('render stops with no build', r1.code !== 0 && /last build/.test(r1.out), r1.out);
  make('built', dir);
  fs.mkdirSync(path.join(dir, 'build', 'review'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'build', 'review', 'collisions.md'), '- 1.0 to 1.2 s, clean: hand into table\n');
  fs.writeFileSync(path.join(dir, 'build', 'review', 'overlaps.md'), 'No measured overlaps.\n');
  const r2 = make('render', dir);
  report('render stops with a collision', r2.code !== 0 && /collisions/.test(r2.out), r2.out);
  fs.writeFileSync(path.join(dir, 'build', 'review', 'collisions.md'), 'No collisions.\n');
  const r3 = make('render', dir);
  report('render stops until the strips are read', r3.code !== 0 && /movement strips/.test(r3.out), r3.out);
  fs.writeFileSync(path.join(dir, 'build', 'review', 'moving-checks.json'), JSON.stringify([{ file: 'a.jpg', salt: 'x', hash: createHash('sha1').update('x7').digest('hex').slice(0, 16) }]));
  report('moving-ok refuses wrong digits', make('look', dir, '--moving-ok', '3').code !== 0);
  report('moving-ok accepts the digits', make('look', dir, '--moving-ok', '7').code === 0);
  // ---------- the voice check hears a word that the voice added ----------
  // Video 1: the voice said "We write them XTP of omega i given X" three times, and the letter
  // distance (2) let it pass. A clean take, with Whisper's number pieces and spellings, must pass.
  const { extraWords } = await import(pathToFileURL(path.join(HERE, '..', 'voicecheck.mjs')).href);
  report('voice check hears an added word ("XTP")', extraWords('We write them p of omega i, given x.', 'We write them XTP of omega i given X.'.split(' ')).join() === 'XTP');
  report('voice check passes numbers and spellings', !extraWords('It is one point seven five metres tall, thirty percent, p of e k, given x, rho, and a pear.', 'It is 1 .75 meters tall, 30 % P of EK given x, row, and a pair.'.split(' ')).length);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `selftest: ${failed} FAILED` : 'selftest: every planted fault was caught');
process.exit(failed ? 1 : 0);
