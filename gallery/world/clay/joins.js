// Measures that the parts of a model really connect. A spring that stopped short of its wall passed
// every other check and every look at the frames, so this works from the shapes, not from pictures.
// parts: [{ name, f }]. joins: [[from, to]], where a RegExp names several parts. pointsOf(part): flat x, y, z.
export function measureJoins(parts, joins, pieces, pointsOf, touch = 0.02) {
  const faults = [], by = Object.fromEntries(parts.map((p) => [p.name, p])), cloud = new Map();
  const points = (p) => { if (!cloud.has(p)) cloud.set(p, pointsOf(p)); return cloud.get(p); };
  const oneWay = (a, b) => { let m = 9; const P = points(a), st = Math.max(1, Math.floor(P.length / 3 / 3000)) * 3; for (let v = 0; v < P.length; v += st) m = Math.min(m, b.f(P[v], P[v + 1], P[v + 2])); return m; };
  const gap = (a, b) => Math.min(oneWay(a, b), oneWay(b, a));
  let measured = 0;
  if (parts.length > 1 && !joins) faults.push('has no join list in JOINS');
  // 1. Each named connector, against each thing that it joins.
  for (const [from, to] of joins || []) {
    const list = from instanceof RegExp ? parts.filter((p) => from.test(p.name)) : [by[from]];
    if (!list.length || list.includes(undefined)) { faults.push(`the join list names no part "${from}"`); continue; }
    for (const p of list) {
      const target = to instanceof RegExp ? parts.find((q) => to.test(q.name)) : by[from instanceof RegExp && String(to).includes('$') ? p.name.replace(from, to) : to];
      if (!target) { faults.push(`${p.name} joins "${to}", and there is no such part`); continue; }
      measured++;
      const g = gap(p, target);
      if (g > touch) faults.push(`${p.name} does not touch ${target.name} (gap ${g.toFixed(3)})`);
    }
  }
  // 2. All parts in one connected piece, or as many pieces as the model says.
  const root = parts.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) if (find(a) !== find(b) && gap(parts[a], parts[b]) <= touch) root[find(a)] = find(b);
  const groups = [...new Set(parts.map((_, i) => find(i)))].map((r) => parts.filter((_, i) => find(i) === r).map((p) => p.name));
  if (groups.length > (pieces || 1)) faults.push(`separate pieces: ${groups.map((g) => g.slice(0, 3).join('+')).join(' | ')}`);
  return { faults, measured };
}
