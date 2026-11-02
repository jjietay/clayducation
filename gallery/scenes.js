// Gallery: one catalogue project. The first scene shows the newsreel style,
// the last 8 draw every item of the shared library (styles/library/), one scene per module.
// The end still of each scene is a picture in png/: <style>.png, or library-<module>.png.
import { C, K, BG, FONT, header, showHeader, label, caption, lab, pin, arrow, leader, underLeader, tick, face, roundRect, wipeIn } from '/_lib/common.js';
import { barrel, card, drone, folderBack, folderLip, gpuBox, laptop, tankSide, tankTop, tile } from '/_lib/flat.js';
import { blobRow } from '/_lib/morph.js';
import { isoBuilding, isoFileBlock, isoPlate, tone } from '/_lib/iso.js';
import { BOIL, INK, envelope, inkFace, inkFolder, inkJar, pencil, stamp } from '/_lib/boil.js';
import { PAPER, circlePts, paperCard, paperGrain, paperPerson, paperPiece, paperReceipt, rectPts } from '/_lib/paper.js';
import { PX, pxCrate, pxDialog, pxFrame, pxGpu, pxMac, pxPadlock, pxPi, pxR, pxRing, pxShelf, pxText, pxWorker } from '/_lib/pixel.js';
import { cart, eyeBlock, fileCube, flag, gizmo, makeTank, nasTower, world } from '/_lib/toy3d.js';

// ==================== adapted styles ====================
// ---------- newsreel ----------
// Content: Rumelhart, Hinton and Williams, "Learning representations by back-propagating errors", Nature 323, 533-536 (9 October 1986).
const GX = 220, GW = 1480, GH = 1080, FPS = 30;
const hash = (n) => rng(Math.floor(n * 9973))();
function gate(c) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.beginPath(); c.roundRect(GX, 0, GW, GH, 26); c.clip(); }
function filmLook(c, f) {
  c.globalCompositeOperation = 'multiply'; c.fillStyle = '#efe7d6'; c.fillRect(GX, 0, GW, GH);
  c.globalCompositeOperation = 'screen'; c.fillStyle = '#17140f'; c.fillRect(GX, 0, GW, GH);
  c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(GX + GW / 2, GH / 2, GH * 0.42, GX + GW / 2, GH / 2, GH * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = g; c.fillRect(GX, 0, GW, GH);
  c.fillStyle = `rgba(0,0,0,${Math.max(0, 0.035 * (hash(f) - 0.5) * 2 + 0.03 * Math.sin(f / FPS * 6 * Math.PI))})`; c.fillRect(GX, 0, GW, GH);
  for (let k = 0; k < 3; k++) { const id = Math.floor((f + k * 5) / 9) * 7 + k; if (hash(id * 1.3) > 0.55) continue;
    c.fillStyle = hash(id) > 0.5 ? 'rgba(255,250,240,.22)' : 'rgba(0,0,0,.28)'; c.fillRect(GX + hash(id * 2.1) * GW, 0, 1.5, GH); }
  const n = Math.floor(hash(f * 0.91) * 5);
  for (let k = 0; k < n; k++) { const q = f * 13 + k * 3.1; c.fillStyle = hash(q + 3) > 0.35 ? 'rgba(10,8,6,.55)' : 'rgba(255,252,245,.45)';
    c.beginPath(); c.arc(GX + hash(q) * GW, hash(q + 1) * GH, 1 + hash(q + 2) * 4, 0, 2 * Math.PI); c.fill(); }
}
function greasePencil(c, pts, u) {
  if (u <= 0) return; const n = Math.max(2, Math.floor(pts.length * clamp(u, 0, 1)));
  for (const [dx, dy, a, lw] of [[0, 0, 0.92, 7], [1.6, -1.2, 0.41, 3.9]]) {
    c.save(); c.strokeStyle = `rgba(250,248,240,${a})`; c.lineWidth = lw; c.lineCap = c.lineJoin = 'round'; c.beginPath();
    for (let i = 0; i < n; i++) { const [x, y] = pts[i], j = (hash(i * 1.7 + x * 0.01) - 0.5) * 1.6; i ? c.lineTo(x + dx + j, y + dy + j) : c.moveTo(x + dx, y + dy); }
    c.stroke(); c.restore(); }
}
const ringPts = (cx, cy, rx, ry) => [...Array(64).keys()].map((i) => { const a = -2.2 + (i / 63) * 2 * Math.PI * 1.12, r = 1 + 0.05 * Math.sin(i * 0.7); return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]; });
// The front page, drawn once at 1000 x 1300: invented masthead, a true headline, grey text bars.
function makePage() { const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 1300; const c = cv.getContext('2d');
  c.fillStyle = '#d9d3c6'; c.fillRect(0, 0, 1000, 1300); c.fillStyle = '#1c1a17';
  c.font = '84px Limelight'; c.textAlign = 'center'; c.fillText('THE DAILY EXPLAINER', 500, 120);
  c.fillRect(40, 150, 920, 4); c.fillRect(40, 160, 920, 1.5);
  c.font = '600 26px Oswald'; c.fillText('OCTOBER 9, 1986  ·  PRICE TWO CENTS', 500, 196);
  c.font = '700 88px Oswald'; c.fillText('MACHINE LEARNS BY', 500, 320); c.fillText('SENDING ERRORS BACK', 500, 420);
  c.fillRect(40, 450, 920, 2);
  c.save(); c.fillStyle = '#b9b2a4'; c.fillRect(60, 480, 520, 380); c.restore();      // the picture box: a network in halftone
  const nodes = [[0, 3], [1, 4], [2, 2]].flatMap(([col, k]) => [...Array(k).keys()].map((i) => [140 + col * 180, 670 + (i - (k - 1) / 2) * 80]));
  c.strokeStyle = '#3b3833'; c.lineWidth = 2;
  for (const a of nodes) for (const b of nodes) if (b[0] - a[0] === 180) { c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); }
  for (const [x, y] of nodes) { c.beginPath(); c.arc(x, y, 22, 0, 2 * Math.PI); c.fillStyle = '#1c1a17'; c.fill(); }
  for (let y = 484; y < 858; y += 7) for (let x = 64; x < 578; x += 7) { c.fillStyle = 'rgba(28,26,23,0.12)'; c.beginPath(); c.arc(x, y, 1.6, 0, 6.3); c.fill(); }
  c.fillStyle = '#8d877c';
  for (let y = 490; y < 1260; y += 22) { if (y > 870) c.fillRect(60, y, 520 * (0.75 + 0.25 * hash(y)), 9); c.fillRect(610, y, 330 * (0.7 + 0.3 * hash(y + 1)), 9); }
  return cv; }
let PAGE;
function drawPaper(c, s, rot, jolt, fx, fy) {
  c.save(); c.translate(GX + GW / 2, GH / 2 + jolt); c.rotate(rot); c.scale(s, s);
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 40; c.shadowOffsetY = 14; c.drawImage(PAGE, -fx * 1000, -fy * 1300); c.restore();
}
scene('newsreel', { bg: '#000',
  async setup(s) { await document.fonts.load('84px Limelight'); await document.fonts.load('700 88px Oswald'); PAGE = makePage(); s.ctx = s.canvas();
    // Sound effects (engine/sfx.mjs): the paper flies in, slams down, the card slides, the pencil rings.
    s.sfx('whoosh', '#fly', { dur: s.at('#slam') - s.at('#fly'), peak: 0.95, lo: 150, hi: 2200 });
    s.sfx('stamp', '#slam'); s.sfx('thud', '#slam', { gain: -4 });
    s.sfx('swish', '#place'); s.sfx('pencil', '#ring', { dur: 0.4 }); s.place = s.text('NATURE · OCTOBER 1986', { x: GX + 48, y: 80, anchor: 'tl', size: 34, font: 'Oswald', weight: 600, color: '#f3eee4' });
    s.place.style.cssText += ';letter-spacing:5px;background:rgba(12,11,10,.8);padding:14px 22px;outline:2px solid #d8d0bf;outline-offset:-8px'; },
  draw(s) {
    const c = s.ctx, f = Math.floor(s.t * FPS); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); gate(c);
    c.fillStyle = '#1e1b18'; c.fillRect(GX, 0, GW, GH);                                     // desk
    c.translate(1.6 * Math.sin(f * 0.7), 2.2 * Math.sin(f * 0.43));
    const t0 = s.at('#fly'), t1 = s.at('#slam'), fit = 0.78;
    if (s.t < t1) { for (let k = 3; k >= 0; k--) { const u = clamp((s.t - k * 0.018 - t0) / (t1 - t0), 0, 1);
        c.globalAlpha = k ? 0.22 : 1; drawPaper(c, fit * (0.06 + 0.94 * u ** 2.3), -((1 - u) ** 1.25) * 5 * Math.PI, 0, 0.5, 0.5); } c.globalAlpha = 1; }
    else { const d = s.t - t1, jolt = Math.exp(-d * 14) * Math.sin(d * 70) * 16, push = s.p(s.at('#place'), 1.2, E.inOut);
      const sc = lerp(fit, 1.12, push) * (1 + Math.exp(-d * 18) * 0.03), fx = 0.5, fy = lerp(0.5, 0.3, push);
      drawPaper(c, sc, 0, jolt, fx, fy);
      const hx = GX + GW / 2 + (500 - fx * 1000) * sc, hy = GH / 2 + jolt + (370 - fy * 1300) * sc;  // headline centre
      filmLook(c, f); greasePencil(c, ringPts(hx, hy, 560 * sc, 150 * sc), s.p('#ring', 0.35));
      s.trace('paper', hx, hy, { r: 300 }); }
    if (s.t < t1) filmLook(c, f);
    c.restore();
    set(s.place, { opacity: s.p('#place', 0.22), x: (1 - s.p('#place', 0.22, E.out)) * -40 });
  } });

// ==================== library catalogue ====================
const NM = (s, str, x, y, color = '#55596b') => label(s, str, { x, y, anchor: 'c', size: 30, font: FONT.mono, weight: 500, color });
const showAll = (s, names) => names.forEach((n, i) => lab(s, n, 0.4 + i * 0.05));

// ============================ common.js ============================
scene('common', {
  bg: BG.cream,
  setup(s) {
    s.c = s.canvas();
    s.h = header(s, { kicker: 'LIBRARY · COMMON.JS · header()', title: 'Common parts' });
    const moods = ['calm', 'happy', 'worried', 'surprised', 'sad', 'focus'];
    s.moods = moods;
    s.names = [
      ...moods.map((m, i) => NM(s, `face ${m}`, 260 + i * 280, 400)),
      NM(s, 'arrow', 360, 660), NM(s, 'leader', 820, 660), NM(s, 'tick', 1640, 660),
    ];
    s.ul = label(s, 'underLeader', { x: 1080, y: 560, anchor: 'l', size: 30, font: FONT.mono, weight: 500, color: '#55596b' });
    s.cap = caption(s, 'caption(): one line at the bottom');
  },
  draw(s) {
    const c = s.c; c.clearRect(0, 0, W, H);
    showHeader(s, s.h, 0.1);
    s.moods.forEach((m, i) => face(c, 260 + i * 280, 320, 26, { mood: m }));
    arrow(c, 180, 600, 540, 600, { color: K.workerInk });
    leader(c, 700, 560, 940, 620, 1);
    tick(c, 1640, 620, 1);
    showAll(s, s.names);
    underLeader(c, s.ul, [1360, 640], lab(s, s.ul, 0.4));
    lab(s, s.cap, 0.5);
  },
});

// ============================ flat.js ============================
scene('flat', {
  bg: BG.cream,
  setup(s) {
    s.c = s.canvas();
    s.h = header(s, { kicker: 'LIBRARY · FLAT.JS', title: 'Flat props' });
    s.names = [
      NM(s, 'drone', 330, 540), NM(s, 'barrel', 900, 580), NM(s, 'laptop', 1265, 580), NM(s, 'barrel { cut: 1 }', 1620, 580),
      NM(s, 'folderBack · tile · folderLip', 360, 880), NM(s, 'tankSide', 860, 880), NM(s, 'tankTop', 1130, 880),
      NM(s, 'card', 1450, 880), NM(s, 'gpuBox', 1700, 880),
    ];
  },
  draw(s) {
    const c = s.c; c.clearRect(0, 0, W, H);
    showHeader(s, s.h, 0.1);
    drone(c, 330, 400, 0.9, s.t, { look: [0, 0.5] });
    barrel(c, 900, 530, 170, 220);
    laptop(c, 1265, 530, 0.7, { mood: 'happy', map: 0.7 });
    barrel(c, 1620, 530, 200, 240, { cut: 1 });
    folderBack(c, 360, 830, 360, 220);
    for (let i = 0; i < 6; i++) tile(c, 360 - 110 + (i % 3) * 110, 650 + Math.floor(i / 3) * 90, 70);
    folderLip(c, 360, 830, 360, 40);
    tankSide(c, 860, 830, 0.8);
    tankTop(c, 1130, 730, -0.4, 1.4);
    card(c, 1450, 740, 130, 130, K.chunk, { mood: 'happy' });
    gpuBox(c, 1700, 740);
    showAll(s, s.names);
  },
});

// ============================ morph.js ============================
scene('morph', {
  bg: BG.navy,
  setup(s) {
    s.h = header(s, { kicker: 'LIBRARY · MORPH.JS', title: 'Shape morph', kColor: '#f72585', color: '#e0e1dd', font: FONT.sg });
    s.a = blobRow(s, { id: 'galA' });
    s.b = blobRow(s, { id: 'galB' });
    s.names = [NM(s, 'blobRow, touching: one bar', 960, 520, '#e0e1dd'), NM(s, 'blobRow, gaps and lift(i): chunks', 960, 860, '#e0e1dd')];
  },
  draw(s) {
    showHeader(s, s.h, 0.1);
    s.a.draw({ pitch: 112, w: 116, h: 96, y: 420 });
    s.b.draw({ pitch: 128, w: 100, h: 70, y: 740, lift: (i) => (i === 3 ? 120 : 0) });
    showAll(s, s.names);
  },
});

// ============================ iso.js ============================
scene('iso', {
  bg: BG.grey,
  setup(s) {
    s.c = s.canvas();
    s.h = header(s, { kicker: 'LIBRARY · ISO.JS', title: 'Isometric', font: FONT.sg, kColor: '#c95a2b' });
    s.names = [NM(s, 'isoBuilding { roofK: 0 }', 360, 720), NM(s, 'isoBuilding { roofK: 1 }', 980, 720), NM(s, 'isoPlate · isoFileBlock', 1560, 720)];
  },
  draw(s) {
    const c = s.c; c.clearRect(0, 0, W, H);
    showHeader(s, s.h, 0.1);
    const T = 40;
    isoBuilding(c, { tile: T, ox: 330, oy: 440 }, { roofK: 0 });
    isoBuilding(c, { tile: T, ox: 980, oy: 440 }, {
      roofK: 1,
      contents: (box, o) => {
        for (const [x, y] of [[0.5, 0.5], [2.0, 0.5], [3.5, 0.5], [0.5, 2.1], [2.0, 2.1], [3.5, 2.1]]) box({ x, y, z: o.z, w: 1.2, d: 1.2, h: 0.8, ...tone(K.chunk) });
        box({ x: 4.9, y: 0.5, z: o.z, w: 0.7, d: 2.8, h: 1.0, ...tone(K.index) });
      },
    });
    const O3 = { tile: T, ox: 1520, oy: 440 };
    isoPlate(c, O3, { w: 6.6, d: 4.2 });
    for (const [x, y] of [[0.3, 0.5], [2.3, 0.5], [4.3, 0.5], [0.3, 2.6], [2.3, 2.6], [4.3, 2.6]]) isoFileBlock(c, O3, { x, y, z: 0.2 });
    showAll(s, s.names);
  },
});

// ============================ boil.js ============================
scene('boil', {
  bg: BG.offwhite,
  setup(s) {
    s.c = s.canvas();
    s.h = header(s, { kicker: 'LIBRARY · BOIL.JS', title: 'Hand drawn', font: FONT.hand, kColor: BOIL.blue, tSize: 64 });
    s.moods = ['calm', 'happy', 'surprised', 'dead'];
    s.names = [
      NM(s, 'inkJar', 300, 660), NM(s, 'inkJar { mood: dead }', 720, 660), NM(s, 'inkFolder', 1180, 660), NM(s, 'stamp', 1620, 560), NM(s, 'envelope · broken', 1600, 720),
      NM(s, 'pencil', 330, 880), ...s.moods.map((m, i) => NM(s, `inkFace ${m}`, 760 + i * 300, 880)),
    ];
  },
  draw(s) {
    const c = s.c; c.clearRect(0, 0, W, H);
    showHeader(s, s.h, 0.1);
    inkJar(s, c, 300, 610, { h: 260, w: 200 });
    inkJar(s, c, 720, 610, { h: 260, w: 200, mood: 'dead', pages: 14, fill: mix(K.file, '#9a9a9a', 0.55), seed: 60 });
    inkFolder(s, c, 1180, 610, { h: 220, mood: 'happy', sheets: 14 });
    stamp(s, c, 1620, 450, 'KILL');
    envelope(s, c, 1510, 650, C.ucast, 95);
    envelope(s, c, 1690, 640, C.mcast, 97, { broken: 0.35 });
    pencil(s, c, 260, 820, -0.5, 80);
    s.moods.forEach((m, i) => inkFace(s, c, 760 + i * 300, 800, 30, m, 90 + i * 5));
    showAll(s, s.names);
  },
});

// ============================ paper.js ============================
scene('paper', {
  bg: BG.card,
  setup(s) {
    s.c = s.canvas();
    s.h = header(s, { kicker: 'LIBRARY · PAPER.JS · paperPiece()', title: 'Paper cut-out', kColor: '#b5482d' });
    s.names = [
      NM(s, 'circlePts', 300, 520), NM(s, 'rectPts', 640, 520), NM(s, 'paperReceipt', 945, 520),
      NM(s, 'paperCard', 1215, 520), NM(s, 'paperCard', 1495, 520), NM(s, 'paperGrain', 1700, 300),
    ];
    s.p1 = label(s, 'paperPerson', { x: 800, y: 760, anchor: 'l', size: 30, font: FONT.mono, weight: 500, color: '#55596b' });
    s.p2 = label(s, "paperPerson, stop", { x: 1430, y: 820, anchor: 'r', size: 30, font: FONT.mono, weight: 500, color: '#55596b' });
  },
  draw(s) {
    const c = s.c; c.clearRect(0, 0, W, H);
    showHeader(s, s.h, 0.1);
    paperGrain(c);
    paperPiece(c, circlePts(300, 380, 100), PAPER.sand, 3);
    paperPiece(c, rectPts(560, 300, 160, 160), PAPER.red, 4);
    paperReceipt(c, 900, 300);
    paperCard(c, 1160, 310);
    paperCard(c, 1440, 310, { fill: PAPER.cream, mark: 'csv', markColor: PAPER.ink, seed: 41 });
    paperPerson(c, 700, 920, { arm: -1.2 });
    paperPerson(c, 1520, 920, { arm: 0.9, prop: 'stop', seed: 75 });
    showAll(s, s.names);
    lab(s, s.p1, 0.5); lab(s, s.p2, 0.55);
  },
});

// ============================ pixel.js ============================
scene('pixel', {
  bg: PX.k,
  setup(s) {
    s.px = s.canvas({ w: 320, h: 180, pixel: true });
  },
  draw(s) {
    const c = s.px, t = s.tq(10);
    c.clearRect(0, 0, 320, 180);
    pxR(c, 0, 0, 320, 180, 'k');
    pxText(c, 'LIBRARY - PIXEL.JS', 12, 10, PX.y);
    pxShelf(c, 12, 30, { hot: (r, q) => (r + q + Math.floor(t * 2)) % 9 === 0 });
    pxText(c, 'PXSHELF', 22, 113, PX.g3);
    pxCrate(c, 110, 30, 70, 70);
    pxText(c, 'PXCRATE', 124, 104, PX.g3);
    pxGpu(c, 196, 40, t, { eat: Math.floor(t * 4) % 2 === 0 });
    pxText(c, 'PXGPU', 209, 92, PX.g3);
    pxWorker(c, 268, 70, Math.floor(t * 8), { carry: true });
    pxWorker(c, 290, 70, Math.floor(t * 8) + 1);
    pxPadlock(c, 292, 61);
    pxText(c, 'PXWORKER', 262, 86, PX.g3);
    pxText(c, 'PXPADLOCK', 258, 96, PX.g3);
    pxDialog(c, t, [[0, 'PXDIALOG', 'TYPED TEXT IN A BOX, ABOVE THE SUBTITLES.']]);
  },
});

// ============================ pixel.js, network characters ============================
scene('pixel2', {
  bg: PX.k,
  setup(s) {
    s.px = s.canvas({ w: 320, h: 180, pixel: true });
  },
  draw(s) {
    const c = s.px, t = s.tq(10);
    c.clearRect(0, 0, 320, 180);
    pxR(c, 0, 0, 320, 180, 'k');
    pxText(c, 'LIBRARY - PIXEL.JS, NETWORKS', 12, 10, PX.y);
    for (let y = 98; y < 110; y++) for (let x = 0; x < 320; x++) if (0.2 > bayer(x, y)) pxR(c, x, y, 1, 1, 'g1');
    for (let k = 0; k < 3; k++) { const r = 24 + ((t * 24 + k * 8) % 24); pxRing(c, 60, 78, r, r > 42 ? PX.o : PX.y, 40, 96); }
    pxPi(c, 60, 88);
    pxPi(c, 130, 88, { sad: true, dim: true });
    pxMac(c, 200, 88, { mood: 'happy', topics: 1 });
    pxMac(c, 270, 88, { mood: 'sad' });
    pxText(c, 'PXPI PXRING', 30, 114, PX.g3);
    pxText(c, 'DIM', 120, 114, PX.g3);
    pxText(c, 'PXMAC', 186, 114, PX.g3);
    pxText(c, 'SAD', 261, 114, PX.g3);
    pxFrame(c, 8, 128, 304, 22, 'k', 'w');
    pxText(c, 'PXFRAME - A BOX WITH A BORDER', 16, 136, PX.w);
  },
});

// ============================ toy3d.js ============================
scene('toy3d', {
  bg: BG.pink,
  async setup(s) {
    const g = s.g = await world(s);
    const { THREE, scene } = g;
    s.tank = makeTank(g); s.tank.scale.setScalar(0.7); s.tank.position.set(-4.2, 0, 0.3); s.tank.rotation.y = 0.4; scene.add(s.tank);
    s.gz = gizmo(g, 1.2); s.gz.position.set(-1.2, 0.05, 0.4); scene.add(s.gz);
    s.cubes = []; let shared = null;
    for (let i = 0; i < 9; i++) { const f = fileCube(g, shared); shared = f.userData.shared; f.position.set(0.7 + (i % 3) * 0.42, 0, -0.1 + Math.floor(i / 3) * 0.42); scene.add(f); s.cubes.push(f); }
    s.nas = nasTower(g); s.nas.position.set(5.0, 0, -0.4); scene.add(s.nas);
    s.cart = cart(g); s.cart.position.set(3.2, 0, 0.9); scene.add(s.cart);
    s.eye = eyeBlock(g, C.viewer, { dir: -1 }); s.eye.scale.setScalar(0.8); s.eye.position.set(1.6, 0, -2.6); scene.add(s.eye);
    s.flag = flag(g, C.mcast); s.flag.position.set(-0.2, 0, -2.4); scene.add(s.flag);
    s.h = header(s, { kicker: 'LIBRARY · TOY3D.JS · world()', title: 'Toy 3D', kColor: '#b8406a' });
    s.nm = { tank: NM(s, 'makeTank', 0, 0), gz: NM(s, 'gizmo', 0, 0), cubes: NM(s, 'fileCube', 0, 0), nas: NM(s, 'nasTower', 0, 0), cart: NM(s, 'cart', 0, 0), eye: NM(s, 'eyeBlock', 0, 0), flag: NM(s, 'flag', 0, 0) };
    await g.ready();
  },
  draw(s) {
    const g = s.g, { THREE } = g, V = (x, y, z) => new THREE.Vector3(x, y, z);
    showHeader(s, s.h, 0.1);
    g.orbit(-18, 30, 13, [0.4, 0.6, 0.2]);
    pin(s.nm.tank, g.proj(V(-4.2, 0, 2.0)));
    pin(s.nm.gz, g.proj(V(-1.2, 0, 1.9)));
    pin(s.nm.cubes, g.proj(V(1.1, 0, 1.6)));
    pin(s.nm.cart, g.proj(V(3.2, 0, 2.2)));
    pin(s.nm.nas, g.proj(V(5.0, 0, 1.3)));
    pin(s.nm.eye, g.proj(V(1.6, 1.9, -2.6)));
    pin(s.nm.flag, g.proj(V(-0.2, 1.9, -2.4)));
    Object.values(s.nm).forEach((n, i) => lab(s, n, 0.4 + i * 0.05));
    g.render();
  },
});
