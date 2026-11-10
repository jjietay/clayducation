#!/usr/bin/env node
// The gallery page's own checks (gallery/DESIGN.md, "Checks"). It serves gallery/, opens it in headless Chrome with
// ?check (the page then steps one frame at a time, with a fixed dt, on a clock of its own), and on every frame measures:
//   - the mascot's body against every object in view (their shape functions, as "make collide" does),
//   - hands that cannot reach what they hold (gap over 0.3),
//   - a jump: his root or a joint that moves too far in one frame,
//   - the change of the 3D picture against its neighbours (a frame much unlike both is a jump).
//
//   node engine/test/gallery-check.mjs scroll [--w 1440 --h 900] [--still]   the whole scroll, down and back up
//   node engine/test/gallery-check.mjs clicks [--w 1440 --h 900] [--still]   chapter 5: each action from 3 start points,
//                                                                             and a click during each action
//   node engine/test/gallery-check.mjs shots <out dir> <spec,...>            pictures: j:t (chapter) or j~u (transition)
// Each fault is one line; the last line gives the counts. Exit code 1 when there are faults.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), GALLERY = process.env.GALLERY_DIR || path.resolve(HERE, '..', '..', 'gallery');
const args = process.argv.slice(2), mode = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const W = +opt('w', 1440), Hh = +opt('h', 900), STILL = args.includes('--still'), TOUCH = args.includes('--touch');
const CHROME = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium'].find((c) => spawnSync('which', [c]).status === 0);
const GPU = ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--ozone-platform=headless'];
const NV = { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' };

async function freePort() { const net = await import('node:net'); return new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }
async function open() {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: GALLERY, stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gal-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...GPU,
    '--force-color-profile=srgb', `--window-size=${W},${Hh}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, ...NV } });
  let dport, target;
  for (let i = 0; i < 150 && !dport; i++) { try { dport = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  for (let i = 0; i < 150 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let next = 1; const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = next++; waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: Hh, deviceScaleFactor: 1, mobile: TOUCH });
  if (STILL) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (TOUCH) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const errors = [];
  await send('Runtime.enable'); ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((x) => x.description || x.value).join(' ')); });
  await send('Page.enable'); await send('Page.navigate', { url: `http://127.0.0.1:${port}/?check` });
  for (let i = 0; i < 600; i++) { if (await ev("document.documentElement.classList.contains('ready') || document.documentElement.classList.contains('no3d')").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  if (!(await ev("document.documentElement.classList.contains('ready')"))) throw new Error('the page did not get ready: ' + errors.join(' | '));
  await ev(`(${PROBE.toString()})()`);
  await ev('for (let i = 0; i < 120; i++) __clayFrame(1 / 60); true');   // 2 s on the page clock first, as a visitor's load
  const close = async () => { ws.close(); proc.kill(); srv.kill(); await new Promise((r) => setTimeout(r, 300)); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); };
  const shot = async (file) => fs.writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).data, 'base64'));
  return { send, ev, close, shot, errors };
}

// In the page: window.__chk(label) runs one measure of the frame drawn last and returns its faults.
function PROBE() {
  window.__clayProbe(({ THREE, H }) => {
    const v = new THREE.Vector3(), u = new THREE.Vector3(), A = new THREE.Box3(), B = new THREE.Box3(), I = new THREE.Box3(), mi = new THREE.Matrix4(), mj = new THREE.Matrix4(), sc = new THREE.Vector3();
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return o.getWorldScale(sc).y > 0.01; };
    const meshOf = (g) => (g.isMesh ? g : g.children.find((c) => c.isMesh));
    const box = (o, b) => { const m = meshOf(o); m.geometry.boundingBox ?? m.geometry.computeBoundingBox(); return b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); };
    const depth = (o, inv, p) => { u.copy(p).applyMatrix4(inv); const pv = o.userData.pv || [0, 0, 0]; return o.userData.f(u.x + pv[0], u.y + pv[1], u.z + pv[2]) * o.getWorldScale(sc).x; };
    const rootOf = (o) => { let p = o; while (p.parent && !p.parent.isScene && !(p.parent.type === 'Group' && p.parent.parent?.isScene)) p = p.parent; return p; };
    let last = null, lastPix = null, lastCut = -1;
    const small = document.createElement('canvas'); small.width = 64; small.height = 36; const sg = small.getContext('2d', { willReadFrequently: true });
    window.__chk = () => {
      const out = [];
      const scene = H.root.parent; scene.updateMatrixWorld(true);
      const objs = []; scene.traverse((o) => { if (o.userData?.f && o.userData.part && !o.userData.thing && shown(o)) { let p = o, mine = false; while (p) { if (p === H.root) { mine = true; break; } p = p.parent; } if (!mine) objs.push(o); } });
      const me = H.shapes.filter((m) => m.userData.f && shown(m));
      const holds = (H.holds || []).filter((h) => h.k > 0.5);
      const near = (pt) => { let best = null, bd = 0.8; for (const o of objs) { const d = depth(o, mi.copy(o.matrixWorld).invert(), v.set(...pt)); if (d < bd) { bd = d; best = o; } } return best; };
      const held = [0, 1].map((i) => holds.filter((h) => h.i === i).map((h) => near(h.point)).filter(Boolean));
      const N = 7;
      for (const a of me) {
        const pa = a.userData.part; box(a, A); mi.copy(a.matrixWorld).invert();
        for (const b of objs) {
          const pb = b.userData.part;
          if (/^(shoe|sole)/.test(pa) && /^(floor|foot|base|plate|rug)/.test(pb)) continue;
          if (H.seat && /^(hip|leg|shin)/.test(pa) && H.seat.m.groups?.[H.seat.part] === b) continue;
          if ((H.touch || []).some((c) => c.m.root === rootOf(b) && (!c.parts || c.parts.test(pa)))) continue;   // the kit's rule for a short contact (a kick, lying on the rug)
          let tol = 0.02;
          const hi = /^(hand|fore)(\d)/.exec(pa);
          if (hi) { const hs = held[+hi[2]]; if (hs.some((x) => rootOf(x) === rootOf(b))) continue; }   // a hand holds the whole thing (a can by its handle touches its body)
          if (pb === 'rug') tol = 0.05;   // lying on the rug: the console of chapter 6 measures it
          if (!A.intersectsBox(box(b, B))) continue;
          I.copy(A).intersect(B); mj.copy(b.matrixWorld).invert();
          let hit = false;
          for (let x = 0; x < N && !hit; x++) for (let y = 0; y < N && !hit; y++) for (let z = 0; z < N && !hit; z++) {
            v.set(I.min.x + (I.max.x - I.min.x) * (x + 0.5) / N, I.min.y + (I.max.y - I.min.y) * (y + 0.5) / N, I.min.z + (I.max.z - I.min.z) * (z + 0.5) / N);
            if (depth(a, mi, v) < -tol && depth(b, mj, v) < -tol) hit = true;
          }
          if (hit) out.push(`mascot ${pa} into ${pb}`);
        }
      }
      // Objects that move (the box, the ball, the laptop) against the other objects.
      for (const a of objs) if (/^(box|ball|base|deck)$/.test(a.userData.part)) {
        box(a, A); mi.copy(a.matrixWorld).invert();
        for (const b of objs) { if (rootOf(a) === rootOf(b) || b === a) continue; if (!A.intersectsBox(box(b, B))) continue; I.copy(A).intersect(B); mj.copy(b.matrixWorld).invert(); let hit = false;
          for (let x = 0; x < N && !hit; x++) for (let y = 0; y < N && !hit; y++) for (let z = 0; z < N && !hit; z++) { v.set(I.min.x + (I.max.x - I.min.x) * (x + 0.5) / N, I.min.y + (I.max.y - I.min.y) * (y + 0.5) / N, I.min.z + (I.max.z - I.min.z) * (z + 0.5) / N); if (depth(a, mi, v) < -0.03 && depth(b, mj, v) < -0.03) hit = true; }
          if (hit) out.push(`${a.userData.part} into ${b.userData.part}`); }
      }
      for (const g of H.grips || []) if (g.gap > 0.3) out.push(`hand ${g.i} misses what it holds, by ${g.gap.toFixed(1)}`);
      const fl = window.__clayFloor?.(); if (fl && Math.abs(fl.low - fl.want) > 0.02) out.push(`lying: his lowest point is ${(fl.low - fl.want).toFixed(2)} off the rug top`);
      // Jumps: his feet place, and each joint, against the frame before.
      const J = [['root', H.root], ...H.arms.flatMap((a, i) => [[`shoulder${i}`, a.shoulder], [`elbow${i}`, a.elbow]]), ...H.legs.flatMap((l, i) => [[`hip${i}`, l.hip], [`knee${i}`, l.knee]])].filter((x) => x[1]);
      const now = { p: H.root.position.clone(), q: J.map((x) => x[1].quaternion.clone()) };
      const st0 = window.__clayState(); if (st0.kind === 'pen' && Math.abs(st0.u - 0.5) < 0.03) last = null;   // the pen's cut, hidden by the pen's blue
      // The dream's cut (u = 0.62): only the one frame that crosses it, and only when the picture on both sides is one colour.
      const cutNow = st0.kind === 'dream' ? (st0.u >= 0.62 ? 1 : 0) : -1, crossed = cutNow >= 0 && lastCut >= 0 && cutNow !== lastCut; lastCut = cutNow;
      if (last) { const dp = now.p.distanceTo(last.p); if (dp > 0.6) out.push(`jump: his body moves ${dp.toFixed(2)} in one frame`); now.q.forEach((q, i) => { const dq = q.angleTo(last.q[i]); if (dq > 0.35) out.push(`jump: ${J[i][0]} turns ${dq.toFixed(2)} rad in one frame`); }); }
      last = now;
      // A 1-pixel read first: it waits for the GPU to finish the frame. Without it, drawImage sometimes copies a
      // cleared buffer (a blank frame that is not on the screen; it moved from run to run in the dream).
      const wc = document.querySelector('canvas.world'), gl = wc.getContext('webgl2') || wc.getContext('webgl'); gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      sg.clearRect(0, 0, 64, 36); sg.drawImage(wc, 0, 0, 64, 36); const px = sg.getImageData(0, 0, 64, 36).data;
      let diff = 0; if (lastPix) for (let i = 0; i < px.length; i += 4) diff += Math.abs(px[i] - lastPix[i]) + Math.abs(px[i + 1] - lastPix[i + 1]) + Math.abs(px[i + 2] - lastPix[i + 2]) + Math.abs(px[i + 3] - lastPix[i + 3]);
      if (crossed) { const flat = (q) => { const m = [0, 1, 2].map((c) => { let t = 0; for (let i = c; i < q.length; i += 4) t += q[i]; return t / (q.length / 4); }); let w = 0; for (let i = 0; i < q.length; i += 4) for (let c = 0; c < 3; c++) w = Math.max(w, Math.abs(q[i + c] - m[c])); return w; };
        const w0 = lastPix ? flat(lastPix) : 0, w1 = flat(px); if (w0 > 8 || w1 > 8) out.push(`the dream's cut can be seen: the picture is not one colour (${w0.toFixed(0)} before, ${w1.toFixed(0)} after)`); else out.splice(0, out.length, ...out.filter((f) => !/^jump: /.test(f))); }   /* a cut that cannot be seen: his move across it is no jump */
      lastPix = px;
      const s = window.__clayState();
      return { out, diff: diff / (64 * 36), s: `${s.i}${s.u > 0 ? '~' + s.u.toFixed(3) : ':' + s.t.toFixed(3)}` };
    };
    window.__chkReset = () => { last = null; lastPix = null; lastCut = -1; };
  });
}

const faults = new Map();
const note = (where, list) => { for (const f of list) { const k = f.replace(/[0-9.]+/g, '#'); const e = faults.get(k) || { n: 0, first: where, ex: f }; e.n++; faults.set(k, e); } };
function jumps(series) {   // a frame that changes much more than its neighbours
  const out = [];
  for (let i = 3; i < series.length - 3; i++) {
    const d = series[i].diff, nb = [series[i - 2], series[i - 1], series[i + 1], series[i + 2]].map((x) => x.diff).sort((a, b) => a - b)[2];
    if (d > 6 && d > 4 * Math.max(nb, 1)) out.push(`picture jump at ${series[i].s}: change ${d.toFixed(1)}, neighbours ${nb.toFixed(1)}`);
  }
  return out;
}
const report = () => { let n = 0; for (const [, e] of faults) { console.log(`FAULT ${e.ex}  (x${e.n}, first at ${e.first})`); n += e.n; } console.log(`gallery-check ${mode}: ${faults.size} kinds of fault, ${n} frames with faults`); return n; };

const page = await open();
try {
  if (mode === 'scroll') {
    // 1.2 screen heights a second, both ways, 60 frames a second.
    const total = await page.ev('document.documentElement.scrollHeight - innerHeight'), step = Hh * 1.2 / 60, series = [];
    for (const dir of [1, -1]) {
      await page.ev('__chkReset()');
      for (let y = dir > 0 ? 0 : total; dir > 0 ? y <= total : y >= 0; y += dir * step) {
        const r = await page.ev(`scrollTo(0, ${y}); __clayFrame(1 / 60); __chk()`);
        note(r.s, r.out); series.push(r);
      }
      const pj = jumps(series); if (args.includes('--every')) pj.forEach((f) => console.log(dir > 0 ? 'down' : 'up', f)); note('scroll', pj); series.length = 0;
    }
  } else if (mode === 'clicks') {
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); __chkReset(); true`);
    const acts = await page.ev('__clayPlayer.acts()'), W5 = (x, z) => page.ev(`__clayPlayer.w5(${x}, ${z})`);
    const starts = [await W5(0, 0), await page.ev(`__clayPlayer.stand('${acts[0]}')`), await page.ev(`__clayPlayer.stand('${acts[3]}')`)];
    const SHOTS = process.env.FAULT_SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const run = async (label, max = 60 * 60) => {
      for (let i = 0; i < max; i++) {
        const r = await page.ev('__clayFrame(1 / 60); Object.assign(__chk(), { p: __clayPlayer.state().mode, t: __clayPlayer.state().t })');
        const fresh = r.out.filter((f) => !faults.has(f.replace(/[0-9.]+/g, '#')));
        note(`${label} [${r.p} ${r.t.toFixed(2)}]`, r.out);
        if (SHOTS && fresh.length) await page.shot(path.join(SHOTS, `${faults.size}-${fresh[0].replace(/[^a-z0-9]+/gi, '_')}.jpg`));
        if (r.p === 'idle' && i > 5) return i;
      }
      note(label, ['the player never got back to idle']); return max;
    };
    for (const [k, s] of starts.entries()) for (const a of acts) for (const pass of [0, 1]) {
      await page.ev(`__clayPlayer.reset(${s[0]}, ${s[1]}, ${s[2] ?? 0}); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); __chkReset(); __clayPlayer.click('${a}'); true`);   // he settles where reset put him first
      await run(`${a} from start ${k}, use ${pass + 1}`);
    }
    // A click on another thing at 25, 50 and 75 % of each action.
    for (const a of acts) for (const f of [0.25, 0.5, 0.75]) {
      const other = acts[(acts.indexOf(a) + 2) % acts.length];
      await page.ev(`__clayPlayer.reset(...__clayPlayer.w5(0, 0)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); __chkReset(); __clayPlayer.click('${a}'); true`);
      let i = 0; for (; i < 1200; i++) { const st = await page.ev('__clayFrame(1 / 60); __chk(); __clayPlayer.state()'); if (st.mode === 'do') break; }
      const dur = await page.ev(`__clayPlayer.dur('${a}')`);
      for (let j = 0; j < Math.round(dur * f * 60); j++) note(`${a} at ${f}`, (await page.ev('__clayFrame(1 / 60); __chk()')).out);
      await page.ev(`__clayPlayer.click('${other}'); true`);
      await run(`${a} interrupted at ${f} by ${other}`);
    }
  } else if (mode === 'strip') {
    // One action from its stand point: a crop round him every 0.4 s, tiled into one sheet (needs ffmpeg).
    const out = args[1], act = args[2], uses = +(args[3] || 1), every = +(args[4] || 24), from = +(args[5] || 0); fs.mkdirSync(out, { recursive: true });
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); true`);
    let n = 0;
    const skip = +(args[6] || 0);   // uses played first with no pictures
    for (let k = 0; k < skip; k++) await page.ev(`{ const s = __clayPlayer.stand('${act}'); __clayPlayer.reset(s[0], s[1], s[2]); __clayPlayer.click('${act}'); } for (let i = 0; i < 60 * 15 && !(__clayPlayer.state().mode === 'idle' && i > 30); i++) __clayFrame(1 / 60); true`);
    for (let use = 0; use < uses; use++) {
      await page.ev(`{ const s = __clayPlayer.stand('${act}'); __clayPlayer.reset(s[0], s[1], s[2]); __clayPlayer.click('${act}'); } true`);
      if (from) await page.ev(`for (let k = 0; k < ${Math.round(from * 60)}; k++) __clayFrame(1 / 60); true`);
      for (let f = 0; f < 60 * 12; f += every) {
        const st = await page.ev(`for (let k = 0; k < ${every}; k++) __clayFrame(1 / 60); __clayProbe(({ H, toScreen }) => { const p = toScreen(H.root.getWorldPosition(new (H.root.position.constructor)())); return { x: p[0], y: p[1] + scrollY, m: __clayPlayer.state().mode }; })`);
        const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: Math.max(0, st.x - 260), y: st.y - 200, width: 520, height: 420, scale: 1 } });
        fs.writeFileSync(path.join(out, `${act}-${String(n++).padStart(3, '0')}.jpg`), Buffer.from(r.data, 'base64'));
        if (st.m === 'idle' && f > 48) break;
      }
    }
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-pattern_type', 'glob', '-i', path.join(out, `${act}-*.jpg`), '-vf', 'scale=312:252,tile=6x5:padding=4', '-frames:v', '1', path.join(out, `sheet-${act}.jpg`)]);
    console.log('sheet', path.join(out, `sheet-${act}.jpg`), n, 'frames');
  } else if (mode === 'input') {
    // Real input through Chrome: a mouse move over each thing shows its label; a click (or, with --touch, a tap) starts its action.
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 60; i++) __clayFrame(1 / 60); true`);
    const acts = await page.ev('__clayPlayer.acts()');
    for (const a of acts) {
      await page.ev(`__clayPlayer.reset(...__clayPlayer.w5(0, 2.5)); for (let i = 0; i < 4; i++) __clayFrame(1 / 60); true`);
      const pt = await page.ev(`__clayProbe(({ C }) => { const th = C[5].things.find((t) => t.name === '${a}'); const b = new (C[5].ball.position.constructor)(); th.o.getWorldPosition(b); b.y += 1.2; const p = __clayProbe(({ toScreen }) => toScreen(b)); return p; })`);
      if (!TOUCH) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt[0], y: pt[1], pointerType: 'mouse' });
        const lab = await page.ev('__clayFrame(1 / 60); [document.querySelector(".act-label").textContent, document.querySelector(".act-label").classList.contains("on")]');
        if (!lab[1]) note(`hover ${a}`, [`no label over ${a}`]); else console.log(`hover ${a}: "${lab[0]}"`);
        for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
      } else {
        await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1] }] });
        await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await new Promise((r) => setTimeout(r, 80));
      }
      const st = await page.ev('for (let i = 0; i < 3; i++) __clayFrame(1 / 60); __clayPlayer.state()');
      if (st.act !== a || st.mode === 'idle') note(`${TOUCH ? 'tap' : 'click'} ${a}`, [`a ${TOUCH ? 'tap' : 'click'} on ${a} did not start it (mode ${st.mode}, act ${st.act})`]);
      else console.log(`${TOUCH ? 'tap' : 'click'} ${a}: starts ${st.act} (${st.mode})`);
    }
  } else if (mode === 'walks') {
    // Every ordered pair of points: each action's stand and end points, the scene's start, the middle, the rug's stand.
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); true`);
    const pts = await page.ev(`(() => { const P = __clayPlayer, out = []; for (const a of P.acts()) { const s = P.stand(a); out.push([a, s]); } out.push(['start', [...P.w5(-6.5, 5.5), Math.PI / 2]]); out.push(['middle', [...P.w5(0, 2.5), 0]]); return out; })()`);
    let n = 0, back = 0, fast = 0, worstRatio = 0, sumRatio = 0;
    for (const [na, A] of pts) for (const [nb, B] of pts) {
      if (na === nb) continue;
      const w = await page.ev(`__clayPlayer.reset(${A[0]}, ${A[1]}, ${A[2]}); for (let i = 0; i < 20; i++) __clayFrame(1 / 60); __chkReset(); __clayPlayer.walkTo(${B[0]}, ${B[1]}, ${B[2]})`);
      const r = await page.ev(`(() => { const H = __clayHero(), out = [], V = H.root.position.constructor; let last = null, lf = null, back = 0, fast = 0;
        for (let i = 0; i < 60 * 40; i++) { __clayFrame(1 / 60); const c = __chk(); out.push(...c.out); const st = __clayPlayer.state();
          const f = H.root.rotation.y, d = new V(0, 0, 1).applyQuaternion(H.root.quaternion); d.y = 0; d.normalize(); const p = H.root.position.clone(); p.y = 0;
          if (last) { const v = p.clone().sub(last); if (v.length() > 0.004 && v.normalize().dot(d) < -0.1) back++; }
          if (lf && st.mode === 'walk') { const q = new V(0, 0, 1).applyQuaternion(H.root.quaternion); q.y = 0; q.normalize(); const ang = Math.acos(Math.min(1, Math.max(-1, q.dot(lf)))) * 60; if (ang > 2.5) fast++; }
          last = p; lf = d.clone(); if (st.mode !== 'walk') break; }
        return { out: [...new Set(out)], back, fast }; })()`);
      n++; back += r.back; fast += r.fast; note(`walk ${na} to ${nb}`, r.out); if (r.back) note(`walk ${na} to ${nb}`, [`he moves backwards on ${r.back} frames`]); if (r.fast) note(`walk ${na} to ${nb}`, [`he turns faster than 2.5 rad/s on ${r.fast} frames`]);
      if (w.straight > 0.5) { const ratio = w.L / w.straight; sumRatio += ratio; worstRatio = Math.max(worstRatio, ratio); }
    }
    console.log(`walks: ${n}, frames backwards ${back}, frames turning too fast ${fast}, path / straight: mean ${(sumRatio / n).toFixed(2)}, worst ${worstRatio.toFixed(2)}`);
  } else if (mode === 'walk1') {
    // Debug: one walk from action A's stand to action B's stand; logs frames where his facing target jumps.
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); true`);
    const r = await page.ev(`(() => { const P = __clayPlayer, A = P.stand('${args[1]}'), B = P.stand('${args[2]}'); P.reset(...A); for (let i = 0; i < 20; i++) __clayFrame(1 / 60);
      const w = P.walkTo(...B), out = [w]; let lf = null;
      for (let i = 0; i < 2400; i++) { __clayFrame(1 / 60); const s = P.state(); if (s.mode !== 'walk') break; const f = P.face(); if (lf !== null) { let d = f - lf; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 0.08) out.push({ i, t: +s.w.t.toFixed(3), d: +d.toFixed(3), d0: s.w.d0, T: s.w.T }); } lf = f; }
      return out; })()`);
    console.log(JSON.stringify(r).slice(0, 3000));
  } else if (mode === 'hair') {
    // Item 6: the colour of his hair in every frame of one action (a pixel read from the 3D canvas at his head's top).
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); { const s = __clayPlayer.stand('${args[1]}'); __clayPlayer.reset(s[0], s[1], s[2]); __clayPlayer.click('${args[1]}'); } true`);
    const r = await page.ev(`(() => { const out = [], c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true });
      for (let i = 0; i < ${Math.round(+(args[2] || 6) * 60)}; i++) { __clayFrame(1 / 60); const p = __clayProbe(({ H, toScreen }) => { const v = H.head.getWorldPosition(new (H.root.position.constructor)()); v.y += 0.9; return toScreen(v); });
        const cv = document.querySelector('canvas.world'), k = cv.width / innerWidth; g.clearRect(0, 0, 1, 1); g.drawImage(cv, p[0] * k, p[1] * k, 1, 1, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; const info = __clayProbe(({ H, THREE, cam }) => { const h = H.shapes.find((m) => m.userData.part === 'hair'); h.updateMatrixWorld(true); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); const bs = h.geometry.boundingSphere.clone().applyMatrix4(h.matrixWorld); let vis = true; for (let q = h; q; q = q.parent) if (!q.visible) vis = false; return [vis, +h.getWorldScale(new THREE.Vector3()).x.toFixed(3), fr.intersectsSphere(bs), +bs.radius.toFixed(2), h.frustumCulled]; }); out.push([i, d[0], d[1], d[2], d[3], ...info]); }
      return out; })()`);
    const brown = r.filter(([, R, G, B, A]) => A > 200 && R - B > 40);
    console.log('frames', r.length, 'brownish', brown.length, JSON.stringify(brown.slice(0, 12)), 'typical', JSON.stringify(r.slice(60, 63)));
  } else if (mode === 'film') {
    // One click on action args[2] from the scene's start, then a full picture every args[3] frames for args[4] s, tiled.
    const out = args[1], act = args[2], every = +(args[3] || 30), secs = +(args[4] || 16); fs.mkdirSync(out, { recursive: true });
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 60; i++) __clayFrame(1 / 60); __clayPlayer.click('${act}'); true`);
    let n = 0;
    for (let f = 0; f < secs * 60; f += every) {
      await page.ev(`for (let k = 0; k < ${every}; k++) __clayFrame(1 / 60); true`);
      await new Promise((r) => setTimeout(r, 120));
      fs.writeFileSync(path.join(out, `f-${String(n++).padStart(3, '0')}.jpg`), Buffer.from((await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 })).data, 'base64'));
    }
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-pattern_type', 'glob', '-i', path.join(out, 'f-*.jpg'), '-vf', 'scale=360:-1,tile=6x6:padding=3', '-frames:v', '1', path.join(out, 'sheet.jpg')]);
    console.log('film', n, 'frames');
  } else if (mode === 'eval') {
    // Debug: at chapter 5, click args[1], step args[2] seconds, print the value of args[3].
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 30; i++) __clayFrame(1 / 60); { const s = __clayPlayer.stand('${args[1]}'); __clayPlayer.reset(s[0], s[1], s[2]); } __clayPlayer.click('${args[1]}'); for (let i = 0; i < ${Math.round(+args[2] * 60)}; i++) __clayFrame(1 / 60); true`);
    console.log(JSON.stringify(await page.ev(args[3])));
  } else if (mode === 'trace') {
    // Debug: scroll from chapter args[1] u args[2] to u args[3] (its transition when args[5] is "~") in args[4] frames; print each frame.
    const tr = args[5] === '~', N = +args[4];
    const y0 = await page.ev(`__clayAt(${args[1]}, ${args[2]}, ${tr})`), y1 = await page.ev(`__clayAt(${args[1]}, ${args[3]}, ${tr})`);
    await page.ev(`scrollTo(0, ${y0}); for (let i = 0; i < 60; i++) __clayFrame(1 / 60); __chkReset(); __chk(); true`);
    for (let f = 1; f <= N; f++) {
      const r = await page.ev(`scrollTo(0, ${y0 + (y1 - y0) * f / N}); __clayFrame(1 / 60); (() => { const c = __chk(), H = __clayHero(), e = new H.root.rotation.constructor().setFromQuaternion(H.root.quaternion, 'YXZ'); return { ...c, p: H.root.position.toArray().map((v) => +v.toFixed(2)), ry: +e.y.toFixed(3), rx: +e.x.toFixed(3), rz: +e.z.toFixed(3), x: ${JSON.stringify(args[6] || 'null')} ? eval(${JSON.stringify(args[6] || 'null')}) : '' }; })()`);
      console.log(r.s, 'pic', r.diff.toFixed(1), 'root', r.p.join(','), 'turn', r.ry, r.rx, r.rz, JSON.stringify(r.x), r.out.join(' | '));
    }
  } else if (mode === 'hairscan') {
    // His hair's colour on every frame of five actions (a synced 5x5 read at the crown of the hair mesh, as seen).
    await page.ev(`scrollTo(0, __clayAt(5, 0.5)); for (let i = 0; i < 60; i++) __clayFrame(1 / 60); true`);
    let n = 0, light = [];
    for (const a of (args[1] || 'toss,kick,jump,carry,hammer').split(',')) {
      await page.ev(`__clayPlayer.click('${a}'); true`);
      const r = await page.ev(`(() => { const out = []; for (let i = 0; i < 60 * 14; i++) { __clayFrame(1 / 60); const q = __clayProbe(({ H, THREE, toScreen }) => { const h = H.shapes.find((m) => m.userData.part === 'hair'); const b = new THREE.Box3().setFromObject(h), c = b.getCenter(new THREE.Vector3()); return toScreen(new THREE.Vector3(c.x, b.max.y - 0.25, c.z)); });
        const R = __clayR(), gl = R.getContext(), k = gl.drawingBufferWidth / innerWidth, px = new Uint8Array(100); gl.readPixels(Math.round(q[0] * k) - 2, Math.round(gl.drawingBufferHeight - q[1] * k) - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let m = 0; for (let j = 0; j < 100; j += 4) m += (px[j] + px[j + 1] + px[j + 2]) / 3; out.push([+(m / 25).toFixed(0), px[0], px[1], px[2], __clayPlayer.state().mode]); if (i > 60 && __clayPlayer.state().mode === 'idle') break; } return out; })()`);
      r.forEach((x, i) => { n++; if (x[0] > 110) light.push(`${a} frame ${i}: mean ${x[0]} rgb ${x[1]},${x[2]},${x[3]} (${x[4]})`); });
      console.log(a, 'frames', r.length, 'typical', JSON.stringify(r[Math.floor(r.length / 2)]));
    }
    console.log('hairscan: frames', n, 'light crown', light.length); light.slice(0, 20).forEach((l) => console.log('  ' + l));
  } else if (mode === 'shots') {
    const out = args[1]; fs.mkdirSync(out, { recursive: true });
    for (const spec of args[2].split(',')) {
      const m = /^(\d+)([:~])([\d.]+)(?:@(\w+)(?:\+([\d.]+))?)?$/.exec(spec); if (!m) continue;
      await page.ev(`scrollTo(0, __clayAt(${m[1]}, ${m[3]}, ${m[2] === '~'})); for (let i = 0; i < 40; i++) __clayFrame(1 / 60); true`);
      if (m[4]) { await page.ev(`__clayPlayer.click('${m[4]}'); true`); const n = Math.round(60 * (+m[5] || 0)); for (let i = 0; i < n; i += 30) await page.ev(`for (let k = 0; k < 30; k++) __clayFrame(1 / 60); true`); }
      await new Promise((r) => setTimeout(r, 300)); await page.shot(path.join(out, `${spec.replace(/[:~@+]/g, '_')}.jpg`));
    }
    console.log('shots in', out);
  }
  if (page.errors.length) for (const e of [...new Set(page.errors)]) note('page', [`page error: ${e.split('\n')[0]}`]);
} finally { await page.close(); }
process.exit(report() ? 1 : 0);
