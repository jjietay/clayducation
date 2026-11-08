// A formula that does what the voice says, in the style of Manim. Each term is its own piece: terms
// slide to new places, cancel with a strike and a burst, and the row closes up. It is flat text over the
// 3D, because Manim's own frames are solid images and cannot sit over a Three.js scene.
//
//   const e = await eqn(s, { x: 1250, y: 165, size: 56,
//     pieces: { m1: ['m', '#c4561f'], xdd: ['\\ddot{x}', INK, true], eq: ['='], m2: ['m', '#c4561f'], v: ['v', '#1f5fbf', true] },
//     rows: { mid: ['m1', 'xdd', 'eq', 'm2', 'v'], end: ['xdd', 'eq', 'v'] },
//     steps: [{ at: 2, row: 'mid' }, { at: s.at('cancels'), cancel: [['m1', 'm2']], then: 'end' }, { at: 8, pulse: 'v' }, { at: 9, row: null }] });
//   e.draw();     // in draw
//
// pieces: name: [tex, color, tight]. tight puts the piece close to the one before, as in m x.
// steps, in time order: row (slide to that row; null fades all out; drop: new terms fall in and settle;
// hop: terms that arc over the others; fall: how far new terms drop, small under another row; merge and to: terms that become one term), cancel (pairs; then = the
// row after it; a term with itself is removed), bounce (names; only when the voice names something important). A step with speed 0.75 runs faster. Everything comes from s.t.
import { E, clamp, lerp, set, el } from '/_engine/runtime.js';

// A burst of short rays, like Manim's Flash. draw(x, y, k): k from 0 to 1.
export function rays(s, { n = 8, color = '#d6336c', r0 = 14, r1 = 66, z = 7 } = {}) {
  const list = Array.from({ length: n }, () => {
    const d = el('div', {}, s.root);
    d.style.cssText = `position:absolute;left:0;top:0;width:20px;height:5px;margin:-2.5px 0 0 -10px;border-radius:3px;background:${color};opacity:0;z-index:${z}`;
    return d;
  });
  return { draw(x, y, k) {
    const on = k > 0 && k < 1, u = 1 - (1 - k) * (1 - k);
    list.forEach((d, i) => {
      const a = (i / n) * Math.PI * 2 + 0.3, r = lerp(r0, r1, u);
      d.style.opacity = on ? 1 - k : 0;
      d.style.transform = `translate(${x + Math.cos(a) * r}px,${y + Math.sin(a) * r}px) rotate(${a}rad) scaleX(${1.3 - k})`;
    });
  } };
}

let eqnCount = 0;
export async function eqn(s, { x = 960, y = 150, size = 56, gap = 14, arc = 62, fall = 52, color = '#26262a', pieces, rows, steps, sound = true }) {
  const names = Object.keys(pieces), node = {}, wide = {}, slash = {}, group = `eqn${++eqnCount}`;
  for (const name of names) {
    const [tex, col] = pieces[name];
    node[name] = await s.tex(tex, { x, y, size, color: col || color, z: 5 });
    node[name].dataset.eqn = group;
    set(node[name], { opacity: 0 });
    wide[name] = node[name].offsetWidth || node[name].getBoundingClientRect().width;
    const d = el('div', {}, s.root);
    d.style.cssText = `position:absolute;left:0;top:0;height:6px;border-radius:3px;background:#d6336c;opacity:0;z-index:6`;
    slash[name] = d;
  }
  // Each row: the centre x of each of its pieces, with the row centred on x.
  const places = {};
  for (const [rn, list] of Object.entries(rows)) {
    const gaps = list.map((n, i) => (i ? (pieces[n][2] ? 3 : gap) : 0)), total = list.reduce((w, n, i) => w + wide[n] + gaps[i], 0);
    let at = x - total / 2;
    places[rn] = {};
    list.forEach((n, i) => { at += gaps[i]; places[rn][n] = at + wide[n] / 2; at += wide[n]; });
  }
  // A cancel with "then" is a cancel and a slide.
  const flow = [];
  for (const st of steps) {
    const sp = st.speed || 1;
    flow.push({ ...st, sp });
    if (st.cancel && st.then) flow.push({ at: st.at + 1.15 * sp, row: st.then, dur: 0.6 * sp });
    if (st.cancel && sound) { s.sfx('swish', st.at + 0.6 * sp, { dur: 0.45 * sp, gain: -8 }); s.sfx('pop', st.at + 1.1 * sp); }
  }
  const pairs = flow.flatMap((st) => (st.cancel ? st.cancel.map(() => rays(s)) : []));

  const shown = {};
  return { node, pos: (n) => shown[n], draw() {
    const now = {};
    for (const n of names) now[n] = { x: null, o: 0, dx: null, dy: 0, k: 1, slash: 0, busy: false, moving: false, act: false };
    pairs.forEach((b) => b.draw(0, 0, 0));
    let burst = 0;
    for (const st of flow) {
      const t = s.t - st.at, sp = st.sp || 1;
      if (t < 0) { if (st.cancel) burst += st.cancel.length; continue; }
      for (const n of names) { now[n].dx = null; now[n].dy = 0; now[n].k = 1; now[n].slash = 0; now[n].busy = false; }
      if (st.row !== undefined) {
        const K = E.inOut(clamp(t / (st.dur || 0.6), 0, 1)), R = st.row ? places[st.row] : {}, u = clamp(t / 0.8, 0, 1);
        // While a row changes, its terms pass each other on purpose. The overlap check judges the settled row.
        if (K < 1 || (st.drop && u < 1)) for (const n of names) now[n].moving = true;
        for (const n of names) {
          const p = now[n], to = R[n];
          if (st.merge && st.merge.includes(n)) continue;
          if (n === st.to) continue;
          if (to === undefined) p.o *= 1 - K;
          else if (p.o <= 0.001 || p.x === null) {
            p.x = to; p.o = st.drop ? Math.min(1, u * 4) : K;
            p.dy = st.drop ? -fall * (1 - E.settle(u, 2, 0.14)) : (1 - K) * 14;
          } else {
            p.x = lerp(p.x, to, K); p.o = lerp(p.o, 1, K);
            if (st.hop && st.hop.includes(n)) { p.dy = -arc * Math.pow(Math.sin(Math.PI * K), 0.4); if (K > 0 && K < 1) p.act = true; }
          }
        }
        // Terms that become one term: they slide together, and the new term grows there.
        if (st.merge) {
          const m = clamp(t / 0.7, 0, 1), to = R[st.to], g = clamp((t - 0.55) / 0.3, 0, 1);
          for (const n of st.merge) { const p = now[n]; p.dx = lerp(p.x, to, E.inOut(m)); p.k = 1 - 0.6 * m; p.o = m < 1 ? 1 : 0; p.moving = true; if (t < 0.9) p.act = true; }
          const e = now[st.to]; e.x = to; e.o = g; e.k = 1 + 0.35 * Math.sin(Math.PI * clamp((t - 0.55) / 0.7, 0, 1)); e.moving = true;
        }
      }
      if (st.bounce) for (const n of st.bounce) {
        const u = clamp(t / 0.9, 0, 1);
        now[n].dy = -34 * Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u); now[n].k = 1 + 0.22 * Math.sin(Math.PI * u); if (u < 1) now[n].moving = true;
      }
      if (st.pulse) now[st.pulse].k = 1 + 0.35 * Math.sin(Math.PI * clamp(t / 0.7, 0, 1));
      if (st.cancel) for (const [a, b] of st.cancel) {
        const A = now[a], B = now[b], mid = (A.x + B.x) / 2, grow = E.out(clamp(t / (0.25 * sp), 0, 1)), strike = clamp((t - 0.25 * sp) / (0.35 * sp), 0, 1), fly = clamp((t - 0.6 * sp) / (0.5 * sp), 0, 1), gone = t >= 1.1 * sp;
        for (const p of [A, B]) {
          p.dx = lerp(p.x, mid, E.inOut(fly)); p.dy = -arc * Math.sin(fly * Math.PI / 2);
          p.k = lerp(1 + 0.3 * grow, 0.25, fly); p.slash = strike * (1 - fly); p.busy = !gone; p.o = gone ? 0 : 1;
        }
        pairs[burst++].draw(mid, y - arc, clamp((t - 1.05 * sp) / 0.55, 0, 1));
      }
    }
    for (const n of names) {
      const p = now[n], cx = p.dx ?? p.x ?? x, d = slash[n];
      shown[n] = cx;
      set(node[n], { x: cx - x, y: p.dy, scale: p.k, opacity: p.o });
      node[n].dataset.pass = p.busy || p.moving ? '1' : ''; node[n].dataset.cancelling = p.busy ? '1' : ''; node[n].dataset.acting = p.busy || p.act ? '1' : '';
      const L = Math.hypot(wide[n], size) * 1.15 * p.k;
      d.style.width = `${L}px`; d.style.opacity = p.slash > 0 ? 1 : 0;
      d.style.transform = `translate(${cx - L / 2}px,${y + p.dy - 3}px) rotate(-58deg) scaleX(${p.slash})`;
    }
  } };
}
