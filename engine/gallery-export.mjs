#!/usr/bin/env node
// Writes gallery/world/: what the gallery page needs to build the clay world in the visitor's browser.
//
//   node engine/gallery-export.mjs [gallery/world.json]
//
// world.json names the models that the page uses. The script copies three.js and the clay kit
// (mascot, models, sdf), and packs the baked shapes: one file for the mascot and one for each model,
// so the page loads each set only when the visitor comes near it. Run it again after "make bake" or
// a change to the kit.
//
// Packing (about 9 times smaller than the cache): positions as 16-bit steps inside the shape's box,
// stored as deltas; normals as 8-bit; colours as 8-bit with a 2.2 curve; triangle corners as zigzag
// varint deltas; then gzip. gallery/world.js unpacks each shape to the float layout of the cache.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ENGINE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(ENGINE, '..', 'styles', 'library');
const CACHE = path.join(LIB, 'clay', 'cache');
const die = (m) => { console.error('error: ' + m); process.exit(1); };

const cfgPath = path.resolve(process.argv[2] || path.join(ENGINE, '..', 'gallery', 'world.json'));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const OUT = path.resolve(path.dirname(cfgPath), cfg.out || 'world');
if (!fs.existsSync(path.join(CACHE, 'manifest.json'))) die(`no baked clay shapes in ${CACHE}. Run "make bake" first.`);
const man = JSON.parse(fs.readFileSync(path.join(CACHE, 'manifest.json'), 'utf8'));

fs.rmSync(OUT, { recursive: true, force: true });
const put = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return rel; };
const hash = (b) => createHash('sha1').update(b).digest('hex').slice(0, 10);

put('three.module.min.js', fs.readFileSync(path.join(ENGINE, 'vendor', 'three.module.min.js')));
for (const d of ['clay', 'clay/models']) for (const f of fs.readdirSync(path.join(LIB, d))) if (f.endsWith('.js')) put(`${d}/${f}`, fs.readFileSync(path.join(LIB, d, f)));

function pack(keys) {
  const packed = {}, parts = [];
  let offset = 0;
  for (const k of keys) {
    const { v, t } = man[k], b = fs.readFileSync(path.join(CACHE, `${k}.bin`)), a = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    const pos = new Float32Array(a, 0, v * 3), nor = new Float32Array(a, v * 12, v * 3), col = new Float32Array(a, v * 24, v * 3), tri = new Uint32Array(a, v * 36, t);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], pos[i * 3 + c]); hi[c] = Math.max(hi[c], pos[i * 3 + c]); }
    const P = new Uint16Array(v * 3), N = new Int8Array(v * 3), C = new Uint8Array(v * 3);
    for (let c = 0; c < 3; c++) {
      const span = Math.max(hi[c] - lo[c], 1e-9); let last = 0;
      for (let i = 0; i < v; i++) {
        const q = Math.round((pos[i * 3 + c] - lo[c]) / span * 65535);
        P[c * v + i] = (q - last) & 0xffff; last = q;
        N[c * v + i] = Math.round(Math.max(-1, Math.min(1, nor[i * 3 + c])) * 127);
        C[c * v + i] = Math.round(Math.max(0, Math.min(1, col[i * 3 + c])) ** (1 / 2.2) * 255);
      }
    }
    const I = []; let last = 0;
    for (let i = 0; i < t; i++) { const d = tri[i] - last; last = tri[i]; let z = d >= 0 ? d * 2 : -d * 2 - 1; while (z >= 128) { I.push((z & 127) | 128); z = Math.floor(z / 128); } I.push(z); }
    const chunk = Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), Buffer.from(C.buffer), Buffer.from(I)]);
    packed[k] = { v, t, lo, hi, at: offset, n: I.length };
    parts.push(chunk); offset += chunk.length;
  }
  return { packed, data: zlib.gzipSync(Buffer.concat(parts), { level: 9 }) };
}

const groups = { mascot: Object.keys(man).filter((k) => !k.startsWith('m-')) };
for (const m of cfg.models) {
  groups[m] = Object.keys(man).filter((k) => k.startsWith(`m-${m}-`));
  if (!groups[m].length) die(`no baked shapes for the model "${m}"`);
}
const index = {};
let total = 0;
for (const [name, keys] of Object.entries(groups)) {
  const { packed, data } = pack(keys.sort());
  index[name] = { file: put(`shapes/${name}-${hash(data)}.bin`, data), packed };
  total += data.length;
}
put('index.json', JSON.stringify(index));
console.log(`world: mascot and ${cfg.models.length} models, shapes ${(total / 1e6).toFixed(2)} MB -> ${path.relative(process.cwd(), OUT)}`);
