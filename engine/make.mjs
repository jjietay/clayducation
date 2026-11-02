#!/usr/bin/env node
// The Kaleidoscope command line. It takes a project folder (script.md,
// scenes.js, video.json) and gives you a narrated MP4 with soft subtitles.
//
//   node make.mjs doctor                    check Chrome, ffmpeg, explainroo, MathJax
//   node make.mjs config [--budget high|medium|low] [--voice auto|chatterbox|kokoro] [--gpu auto|off]
//   node make.mjs init <dir> --title "..."  new project with learning-pace voice settings
//   node make.mjs build [dir]               voice, manim, check, sheet, review: every step before the agents look
//   node make.mjs final [dir]               render, verify
//   node make.mjs voice [dir]               narration + word timings (explainroo) + pacing report
//   node make.mjs manim [dir] [--scene id] [--all] [--draft]   render changed Manim scenes to frames
//   node make.mjs check [dir]               scene errors, missing cues, text outside the safe area, pacing
//   node make.mjs sheet [dir] [--scene id] [--every s]   contact sheets to build/sheet-N.png
//   node make.mjs still [dir] <t|scene|scene@t|scene@end|scene@#mark|scene@word> ...
//   node make.mjs review [dir] [--fps n]    build/review/: the pack the reviewer agents read
//   node make.mjs subtitles [dir]           build/subtitles.srt again from the timeline (no new voice)
//   node make.mjs render [dir] [--draft] [--from s --to s] [--workers n] [--remix]
//   node make.mjs verify [dir]              duration, loudness, black frames, streams
//   node make.mjs preview [dir]             play it in your browser with the narration
//
// Voice: Chatterbox speaks (engine/tts), explainroo's Whisper times each word. The
// pictures come from this engine: scenes.js drawn by runtime.js in headless
// Chrome, one seek(t) per frame. Never run explainroo's own render here.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { music } from './music.mjs';

const ENGINE = path.dirname(fileURLToPath(import.meta.url));
const EXR = process.env.EXPLAINROO_HOME || path.join(os.homedir(), '.explainroo');
const CHROME = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find((c) => spawnSync('which', [c]).status === 0);
// The settings of this machine, written by "make config", the installer or /setup-kaleidoscope.
// config.json is not in git. budget: how many tokens the review uses (SKILL.md, "Token budget").
// voice: chatterbox (natural, best on a GPU), kokoro (small, fast on a CPU) or auto. gpu: auto or off.
const CONFIG_FILE = path.join(ENGINE, '..', 'config.json');
const CONFIG_DEFAULT = { budget: 'high', voice: 'auto', gpu: 'auto', kokoroVoice: 'af_heart' };
const CONFIG_CHOICES = { budget: ['high', 'medium', 'low'], voice: ['auto', 'chatterbox', 'kokoro'], gpu: ['auto', 'off'] };
const readConfig = () => { try { return { ...CONFIG_DEFAULT, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { return { ...CONFIG_DEFAULT }; } };
const CONFIG = readConfig();

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (k) => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const positional = () => {
  const out = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (!['--draft', '--all', '--remix'].includes(argv[i])) i++; continue; }
    out.push(argv[i]);
  }
  return out;
};
const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

// ---------- project ----------
function projectDir(arg) {
  const dir = path.resolve(arg || '.');
  if (!fs.existsSync(path.join(dir, 'video.json'))) die(`${dir} has no video.json. Make a project with: node ${path.join(ENGINE, 'make.mjs')} init <dir>`);
  return dir;
}
function timeline(dir) {
  const f = path.join(dir, 'build', 'timeline.json');
  if (!fs.existsSync(f)) die('no build/timeline.json. Run "voice" first.');
  const script = path.join(dir, 'script.md');
  if (fs.statSync(script).mtimeMs > fs.statSync(f).mtimeMs) die('script.md changed after the last voice run. Run "voice" again.');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const renderCfg = (dir) => ({ music: true, musicVolume: 0.26, workers: Math.max(1, Math.min(6, Math.floor(os.cpus().length / 3))), ...(JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'))._render || {}) });
const slug = (dir) => path.basename(dir);

// ---------- Manim scenes (the maths style) ----------
const MANIM_PY = path.join(ENGINE, 'manim', '.venv', 'bin', 'python');
function manimClasses(dir) {
  const f = path.join(dir, 'manim_scenes.py');
  if (!fs.existsSync(f)) return [];
  return [...fs.readFileSync(f, 'utf8').matchAll(/^class\s+(\w+)\s*\(([^)]*)\)/gm)].filter((m) => /\bTimed\b/.test(m[2])).map((m) => m[1]);
}
// A scene's frames are old when its class, the shared code around the classes, or
// its narration timing changed. Only that scene needs a new render.
function manimHashes(dir) {
  const src = fs.readFileSync(path.join(dir, 'manim_scenes.py'), 'utf8');
  const blocks = {}, shared = [];
  let cur = null;
  for (const line of src.split('\n')) {
    const m = line.match(/^class\s+(\w+)\s*\(([^)]*)\)/);
    if (m && /\bTimed\b/.test(m[2])) cur = (blocks[m[1]] = []);
    else if (/^\S/.test(line) && !line.startsWith('#')) cur = null;
    (cur || shared).push(line);
  }
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'build', 'timeline.json'), 'utf8'));
  const out = {};
  for (const [cls, lines] of Object.entries(blocks)) {
    const id = cls.replace(/_/g, '-'), sc = tl.scenes.find((x) => x.id === id);
    out[id] = createHash('sha1').update(shared.join('\n')).update(lines.join('\n')).update(JSON.stringify(sc ? [sc.dur, sc.words, sc.marks] : null)).update(String(tl.fps)).digest('hex').slice(0, 16);
  }
  return out;
}
function manimStale(dir) {
  if (!fs.existsSync(path.join(dir, 'manim_scenes.py'))) return [];
  return Object.entries(manimHashes(dir)).filter(([id, h]) => {
    const f = path.join(dir, 'build', 'manim', id, 'info.json');
    return !fs.existsSync(f) || JSON.parse(fs.readFileSync(f, 'utf8')).hash !== h;
  }).map(([id]) => id);
}
function requireManim(dir) {
  const stale = manimStale(dir);
  if (stale.length) die(`Manim frames are missing or older than manim_scenes.py or the voice for: ${stale.join(', ')}. Run "manim" first.`);
}
const runAsync = (cmd, args, opts) => new Promise((res) => {
  const p = spawn(cmd, args, opts);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => res({ code, out }));
});

async function manim() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), cfg = renderCfg(dir);
  // A video with no Manim scenes (no manim_scenes.py) has nothing to render here.
  if (!fs.existsSync(path.join(dir, 'manim_scenes.py'))) { console.log('manim: no manim_scenes.py, nothing to render'); return; }
  if (!fs.existsSync(MANIM_PY)) die(`Manim is not installed. Run: cd ${path.join(ENGINE, 'manim')} && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python manim`);
  const only = opt('--scene'), draft = flag('--draft');
  const hashes = manimHashes(dir), stale = new Set(manimStale(dir));
  const all = manimClasses(dir);
  if (!all.length) die('manim_scenes.py has no class that uses Timed');
  // By default only scenes whose code or timing changed; --all for every scene.
  const classes = all.filter((c) => (only ? c === only || c.replace(/_/g, '-') === only : flag('--all') || stale.has(c.replace(/_/g, '-'))));
  if (!classes.length) { if (only) die(`no Timed class for scene "${only}" in manim_scenes.py`); console.log('manim: every scene is up to date (--all renders them again)'); return; }
  const outRoot = path.join(dir, 'build', 'manim'), media = path.join(outRoot, 'media');
  const env = { ...process.env, XV_TIMELINE: path.join(dir, 'build', 'timeline.json'), XV_OUT: outRoot, PYTHONPATH: path.join(ENGINE, 'manim') };
  const t0 = Date.now();
  let failed = false;
  const one = async (cls) => {
    const id = cls.replace(/_/g, '-'), s = tl.scenes.find((x) => x.id === id);
    if (!s) { console.log(`ERROR class ${cls}: script.md has no "## ${id}"`); failed = true; return; }
    const r = await runAsync(MANIM_PY, ['-m', 'manim', 'render', '--disable_caching', '--progress_bar', 'none', '-r', draft ? '960,540' : '1920,1080', '--fps', String(tl.fps), '--media_dir', path.join(media, id), '-o', cls, path.join(dir, 'manim_scenes.py'), cls], { cwd: dir, env });
    for (const l of r.out.split('\n')) if (/^WARN /.test(l)) console.log(l);
    if (r.code !== 0) { console.log(`ERROR ${id}: Manim failed\n${r.out.split('\n').filter((l) => l.trim()).slice(-25).join('\n')}`); failed = true; return; }
    const find = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? find(path.join(d, e.name)) : e.name === `${cls}.mp4` && !d.includes('partial_movie_files') ? [path.join(d, e.name)] : []));
    // One media folder a scene: parallel runs that share Manim's TeX cache delete each other's files.
    const mp4 = find(path.join(media, id, 'videos')).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!mp4) { console.log(`ERROR ${id}: Manim made no ${cls}.mp4`); failed = true; return; }
    const fdir = path.join(outRoot, id);
    fs.mkdirSync(fdir, { recursive: true });
    for (const f of fs.readdirSync(fdir)) if (/^f_\d+\.jpg$/.test(f)) fs.rmSync(path.join(fdir, f));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-q:v', '3', path.join(fdir, 'f_%05d.jpg')]);
    const frames = fs.readdirSync(fdir).filter((f) => /^f_\d+\.jpg$/.test(f)).length, want = Math.round(s.dur * tl.fps);
    if (Math.abs(frames - want) > 1) console.log(`WARN ${id}: ${frames} frames, the narration needs ${want}`);
    fs.writeFileSync(path.join(fdir, 'info.json'), JSON.stringify({ frames, fps: tl.fps, dur: s.dur, draft, hash: hashes[id] }));
    console.log(`ok   ${id.padEnd(16)} ${frames} frames`);
  };
  const queue = [...classes];
  await Promise.all(Array.from({ length: Math.min(cfg.workers, queue.length) }, async () => { while (queue.length) await one(queue.shift()); }));
  console.log(`manim: ${classes.length} scene(s) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (failed) process.exit(1);
}

// Which voice speaks a project: video.json "_tts": {"engine": ...} wins, then config.json, then
// Chatterbox if it is installed, else Kokoro.
function voiceEngine(cfg = {}) {
  const v = cfg._tts?.engine || CONFIG.voice;
  if (v === 'chatterbox' || v === 'kokoro') return v;
  return fs.existsSync(TTS_PY) ? 'chatterbox' : 'kokoro';
}

// ---------- config ----------
// make config                         print this machine's settings
// make config --budget medium --voice kokoro --gpu off    change them
function config() {
  const cur = readConfig();
  let changed = false;
  for (const [k, choices] of Object.entries(CONFIG_CHOICES)) {
    const v = opt(`--${k}`);
    if (v === undefined) continue;
    if (!choices.includes(v)) die(`--${k} must be one of: ${choices.join(', ')}`);
    cur[k] = v; changed = true;
  }
  const kv = opt('--kokoro-voice');
  if (kv !== undefined) { cur.kokoroVoice = kv; changed = true; }
  if (changed) fs.writeFileSync(CONFIG_FILE, JSON.stringify(cur, null, 2) + '\n');
  console.log(`budget  ${cur.budget}\nvoice   ${cur.voice}${cur.voice === 'auto' ? ` (now: ${fs.existsSync(TTS_PY) ? 'chatterbox' : 'kokoro'})` : ''}${cur.voice !== 'chatterbox' ? `, Kokoro voice ${cur.kokoroVoice}` : ''}\ngpu     ${cur.gpu}\nfile    ${CONFIG_FILE}${fs.existsSync(CONFIG_FILE) ? '' : ' (not written yet: these are the defaults)'}`);
}

// ---------- doctor ----------
async function doctor() {
  let ok = true;
  // An optional part (Manim, LaTeX) that is missing prints "skip": only maths scenes need it.
  const line = (good, name, note, optional = false) => { console.log(`${good ? 'ok  ' : optional ? 'skip' : 'FAIL'} ${name.padEnd(12)} ${note}`); if (!good && !optional) ok = false; };
  const major = +process.versions.node.split('.')[0];
  line(major >= 22, 'node', `${process.version}${major >= 22 ? '' : ' (needs 22+ for the built-in WebSocket)'}`);
  line(spawnSync('ffmpeg', ['-version']).status === 0, 'ffmpeg', spawnSync('which', ['ffmpeg']).stdout?.toString().trim() || 'not found');
  line(!!CHROME, 'chrome', CHROME || 'not found; set CHROME=/path/to/chrome');
  line(fs.existsSync(path.join(EXR, 'bin', 'explainroo.js')), 'explainroo', fs.existsSync(EXR) ? EXR : `not found at ${EXR}. Install: git clone https://github.com/vincentsch/explainroo ${EXR} && cd ${EXR} && npm install && node bin/explainroo.js doctor --fetch`);
  line(fs.existsSync(path.join(ENGINE, 'vendor', 'three.module.min.js')), 'three.js', 'engine/vendor/three.module.min.js');
  try { await tex('\\lambda v = A v', true); line(true, 'mathjax', 'typesets'); } catch (e) { line(false, 'mathjax', e.message); }
  const mv = fs.existsSync(MANIM_PY) && spawnSync(MANIM_PY, ['-c', 'import manim; print(manim.__version__)'], { encoding: 'utf8' });
  line(!!mv && mv.status === 0, 'manim', mv && mv.status === 0 ? `Manim Community ${mv.stdout.trim()} (maths scenes)` : `not installed: needs sudo apt install libcairo2-dev libpango1.0-dev pkg-config texlive texlive-latex-extra dvisvgm, then: cd ${path.join(ENGINE, 'manim')} && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python manim`, true);
  const cb = fs.existsSync(TTS_PY) && spawnSync(TTS_PY, ['-c', 'import torch, chatterbox; print(torch.cuda.is_available())'], { encoding: 'utf8' });
  const shared = fs.existsSync(path.join(ENGINE, 'tts', '.venv', 'shared-torch'));
  const needCb = voiceEngine() === 'chatterbox';
  line(!needCb || (!!cb && cb.status === 0), 'chatterbox', !needCb && !(cb && cb.status === 0) ? 'not used: the voice is Kokoro (make config)' : cb && cb.status === 0 ? `voice (GPU: ${cb.stdout.trim() === 'True' ? 'yes' : 'no, slow on CPU'}${shared ? "; PyTorch from /path/to/other/.venv" : ''})` : shared ? "fails: it uses /path/to/other/.venv's PyTorch, which changed or is gone. See README.md" : 'not installed: see README.md');
  line(spawnSync('which', ['latex']).status === 0 && spawnSync('which', ['dvisvgm']).status === 0, 'latex', 'latex + dvisvgm, for Manim formulas', true);
  if (fs.existsSync(EXR)) {
    const r = spawnSync('node', [path.join(EXR, 'bin', 'explainroo.js'), 'doctor'], { encoding: 'utf8' });
    for (const l of (r.stdout + r.stderr).split('\n')) if (/speech check/.test(l)) line(l.startsWith('ok'), 'whisper', l.replace(/^\S+\s+\S+(\s\S+)?\s+/, ''));
  }
  const g = gpu();
  console.log(`info settings     budget ${CONFIG.budget}, voice ${voiceEngine()}, frames by ${g.renderer}, encode ${g.nvenc ? 'NVENC (GPU)' : 'libx264 (CPU)'}`);
  process.exit(ok ? 0 : 1);
}

// ---------- init ----------
function init() {
  const [d] = positional();
  if (!d) die('init needs a folder, for example: init videos/eigenvectors --title "Eigenvectors"');
  const dir = path.resolve(d);
  if (fs.existsSync(path.join(dir, 'script.md'))) die(`${dir} already has a script.md`);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const title = opt('--title', path.basename(dir));
  const tpl = path.join(ENGINE, 'template');
  for (const f of ['script.md', 'scenes.js', 'storyboard.md']) fs.writeFileSync(path.join(dir, f), fs.readFileSync(path.join(tpl, f), 'utf8').replaceAll('{{title}}', title));
  const cfg = JSON.parse(fs.readFileSync(path.join(tpl, 'video.json'), 'utf8'));
  cfg.title = title;
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(cfg, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\nout/\n');
  console.log(`created ${dir}\nnext: write script.md, then run "voice"`);
}

// ---------- voice ----------
// Chatterbox (engine/tts) speaks each scene; explainroo then times every word with
// Whisper, as for a recording. A part = the words between two [pause] marks, read in
// one call, so the tone carries across sentences; the pause is silence we add.
const TTS_PY = path.join(ENGINE, 'tts', '.venv', 'bin', 'python');
// Number words, so Whisper's digits ("-1", "3") compare with the script's words.
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const numWords = (n) => (n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? NUM[n % 10] : '') : String(n));
// Letters only, numbers spelt out, "minus" and "negative" counted as one word: two texts
// that read the same compare equal however Whisper spaces or punctuates them.
const sayable = (text) => text.toLowerCase()
  .replace(/(^|[^\d.])-(?=\d)/g, '$1 negative ').replace(/\bminus\b/g, 'negative')
  .replace(/\d+(\.\d+)?/g, (m) => m.includes('.') ? m.split('.').map((x) => [...x].map((d) => NUM[d]).join('')).join('point') : numWords(+m))
  .replace(/[^a-z]/g, '');
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// What Whisper hears in a spoken part (cached next to it).
async function heardWords(raw) {
  const wordsFile = raw.replace(/\.wav$/, '.words.json');
  if (!fs.existsSync(wordsFile)) {
    const { readWav, resample } = await import(pathToFileURL(path.join(EXR, 'src', 'wav.js')).href);
    const { transcribeWords } = await import(pathToFileURL(path.join(EXR, 'src', 'models.js')).href);
    const { samples, sampleRate } = readWav(raw);
    fs.writeFileSync(wordsFile, JSON.stringify((await transcribeWords(resample(samples, sampleRate, 16000))).words));
  }
  return JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
}

// A word that names a symbol carries a whole idea, so it counts as two syllables of pace.
const SYMBOL = /^(?:[a-z]|lambda|sigma|mu|theta|alpha|beta|gamma|delta|epsilon|pi|phi|omega|rho|tau|nabla|det|log|exp|sin|cos)$/i;
// How a spoken part came out: how far its words are from the script (letters), and the
// pace of each clause (between punctuation marks) in syllables a second.
async function takeReport(part) {
  const heard = await heardWords(part.raw);
  const words = part.text.trim().split(/\s+/), end = alignWords(words, heard);
  const d = editDistance(sayable(part.text), sayable(heard.map((w) => w.text).join(' ')));
  const clauses = [];
  for (let i = 0, first = 0; i < words.length; i++) {
    if (!/[.!?,;:]["')\]]*$/.test(words[i]) && i < words.length - 1) continue;
    const hs = end.slice(first, i + 1).filter((h) => h >= 0);
    if (hs.length) {
      const a = heard[Math.min(...hs)].start, b = heard[Math.max(...hs)].end;
      const syl = words.slice(first, i + 1).reduce((k, w) => { const c = w.replace(/[^\w]/g, ''); return k + (SYMBOL.test(c) ? 2 : Math.max(1, (sayable(c).match(/[aeiouy]+/g) || []).length)); }, 0);
      // Under 0.5 s or 3 syllables, Whisper's word times are too rough to judge. Mostly
      // numbers ("negative one is one"): Whisper hears "-1" as one short token, so skip.
      const clause = words.slice(first, i + 1), nums = clause.filter((w) => /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|negative|minus|point)[,.;:!?]*$/i.test(w)).length;
      if (b - a >= 0.5 && syl >= 3 && nums * 2 < clause.length) clauses.push({ text: words.slice(first, i + 1).join(' '), rate: syl / (b - a) });
    }
    first = i + 1;
  }
  return { d, heard: heard.map((w) => w.text).join(' '), clauses };
}

async function chatterbox(dir, shadow, cfg) {
  if (!fs.existsSync(TTS_PY)) die(`Chatterbox is not installed. See README.md ("Voice").`);
  const { parseScript } = await import(pathToFileURL(path.join(EXR, 'src', 'script.js')).href);
  // The user chose these by ear: see the header of engine/tts/chatterbox_voice.py.
  const t = { exaggeration: 0.5, cfg_weight: 0.5, temperature: 0.8, seed: 7, stopGap: 0.6, commaMax: 0.3, paragraphGap: 1.0, retakes: 3, ...cfg._tts };
  const script = parseScript(fs.readFileSync(path.join(dir, 'script.md'), 'utf8'));
  // The user asked: a negative number is "negative", never "minus".
  const minus = [];
  for (const sc of script.scenes) for (const u of sc.units) {
    if (u.type === 'word' && /(^|[(\s,])-\d/.test(u.display) && (u.spoken === u.display || /\bminus\b/i.test(u.spoken))) minus.push(`${sc.id}: "${u.display}"`);
  }
  if (minus.length) die(`negative numbers must be read "negative", never "minus": ${minus.join(', ')}. Write {(1, -1)|one, negative one}.`);
  const outDir = path.join(shadow, 'assets', 'tts');
  fs.mkdirSync(outDir, { recursive: true });
  // Seeds that an earlier run found good stay chosen, so the cache keeps hitting.
  const seedFile = path.join(shadow, 'seeds.json');
  const chosen = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {};
  const scenes = [];
  for (const sc of script.scenes) {
    if (!sc.units.some((u) => u.type === 'word')) continue;
    const parts = [];
    let cur = [];
    const close = (gap) => {
      if (cur.length) { parts.push({ text: cur.join(' '), gap }); cur = []; } else if (parts.length) parts.at(-1).gap += gap;
    };
    for (const u of sc.units) {
      if (u.type === 'word') {
        cur.push(u.spoken);
        // One call a part; split only past about 45 words, where the model starts to lose its way.
        if (/[.!?]["')\]]*$/.test(u.spoken) && cur.length > 45) close(t.stopGap);
      } else if (u.type === 'pause') close(u.paragraph ? t.paragraphGap : u.sec);
    }
    close(0);
    for (const [i, x] of parts.entries()) {
      x.id = `${sc.id}#${i + 1}`;
      // The same short word twice ("one one") trips the voice: a comma between them fixes it.
      x.text = x.text.replace(/\b(\w+) (\1)\b/gi, '$1, $2');
      // A seed set by hand in video.json wins, then one found good before, then the default.
      x.seed = t.seeds?.[x.id] ?? t.seeds?.[sc.id] ?? chosen[x.id] ?? t.seed;
    }
    scenes.push({ id: sc.id, out: path.join(outDir, `${sc.id}.wav`), parts });
  }
  const jobs = path.join(shadow, 'tts-jobs.json');
  const { paragraphGap, seeds, stopGap, commaMax, retakes, ...params } = t;
  // Speak, then check every part: a changed or missing word, or a clause much faster than
  // the video's usual pace (the user found "lambda v is v, scaled by lambda" too fast).
  // A bad part is retaken with a new seed; each take has its own pace, and the best take
  // is kept. A seed set by hand in video.json is never changed.
  const all = scenes.flatMap((sc) => sc.parts);
  const takes = new Map(); // part id -> [{ seed, raw, report }]
  const fixed = (p) => t.seeds?.[p.id] !== undefined || t.seeds?.[p.id.split('#')[0]] !== undefined;
  let median = 0;
  const score = (r) => (r.d >= 3 ? 1e6 + r.d : 0) + Math.max(0, ...r.clauses.map((c) => c.rate / median));
  for (let round = 0; ; round++) {
    fs.writeFileSync(jobs, JSON.stringify({ params, cache: path.join(dir, 'build', 'tts-cache'), scenes }, null, 1));
    const r = spawnSync(TTS_PY, [path.join(ENGINE, 'tts', 'chatterbox_voice.py'), jobs], { stdio: 'inherit' });
    if (r.status !== 0) die('Chatterbox failed (see above)');
    const done = JSON.parse(fs.readFileSync(jobs + '.out.json', 'utf8')).scenes.flatMap((sc) => sc.parts);
    for (const [i, part] of done.entries()) {
      const list = takes.get(part.id) || [];
      if (!list.some((x) => x.seed === part.seed)) list.push({ seed: part.seed, raw: part.raw, report: await takeReport(part) });
      takes.set(part.id, list);
    }
    // The usual pace: the median clause of the first take of every part.
    if (round === 0) { const rs = [...takes.values()].flatMap((l) => l[0].report.clauses.map((c) => c.rate)).sort((a, b) => a - b); median = rs[rs.length >> 1] || 1; }
    const bad = all.filter((p) => { const best = takes.get(p.id).reduce((x, y) => (score(y.report) < score(x.report) ? y : x)); return score(best.report) > 1.3; });
    for (const p of all) p.seed = takes.get(p.id).reduce((x, y) => (score(y.report) < score(x.report) ? y : x)).seed;
    const retake = bad.filter((p) => !fixed(p));
    if (!retake.length || round >= t.retakes) {
      for (const p of bad) {
        const best = takes.get(p.id).find((x) => x.seed === p.seed).report;
        if (best.d >= 3) console.log(`WARN voice ${p.id}: after ${round} retake(s) it still says something else.\n  script: ${p.text}\n  heard:  ${best.heard}\n  If only the spelling differs, ignore this. Otherwise reword the part or set a seed in video.json ("_tts": {"seeds": {"${p.id}": 20}}).`);
        const why = fixed(p) ? 'its seed is set by hand in video.json, so it was not retaken' : `after ${round} retake(s)`;
        for (const c of best.clauses) if (c.rate > median * 1.3) console.log(`WARN fast ${p.id}: "${c.text}" at ${(c.rate / median).toFixed(2)} times the usual pace (${why}). Give it its own short sentence and a [pause] after it.`);
      }
      break;
    }
    console.log(`voice check: retaking ${retake.length} part(s): ${retake.map((p) => p.id).join(', ')}`);
    // Next seed not tried yet for each part to retake.
    for (const p of retake) { const tried = takes.get(p.id).map((x) => x.seed); let s2 = Math.max(...tried) + 1; p.seed = s2; }
  }
  for (const p of all) { p.raw = takes.get(p.id).find((x) => x.seed === p.seed).raw; if (p.seed !== t.seed && !fixed(p)) chosen[p.id] = p.seed; else delete chosen[p.id]; }
  fs.writeFileSync(seedFile, JSON.stringify(chosen, null, 1));
  const { writeWav } = await import(pathToFileURL(path.join(EXR, 'src', 'wav.js')).href);
  for (const sc of scenes) {
    const clips = [];
    let sr = 24000;
    for (const part of sc.parts) {
      const shaped = await shapePauses(part.raw, part.text, { stopGap: t.stopGap, commaMax: t.commaMax });
      sr = shaped.sampleRate;
      for (const w of shaped.missed) console.log(`WARN pause ${part.id}: could not place the pause after "${w}" (Whisper heard: ${(await heardWords(part.raw)).map((x) => x.text).join(' ')}). Listen to it.`);
      clips.push(shaped.samples, new Float32Array(Math.round(part.gap * sr)));
    }
    const all = new Float32Array(clips.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of clips) { all.set(c, o); o += c.length; }
    writeWav(sc.out, all, sr);
  }
  return { ...cfg, voice: { provider: 'recording', src: 'assets/tts' }, speed: 1 };
}

// Which heard (Whisper) word each script word ends in. Both texts become letters with
// numbers spelt out (sayable), then a letter-by-letter alignment maps them, so "-1"
// heard still matches "negative one" written.
function alignWords(scriptWords, heard) {
  const flat = (words) => {
    const chars = [], owner = [];
    words.forEach((w, i) => { for (const c of sayable(w)) { chars.push(c); owner.push(i); } });
    return { chars, owner };
  };
  const A = flat(scriptWords), B = flat(heard.map((w) => w.text));
  const n = A.chars.length, m = B.chars.length, D = Array.from({ length: n + 1 }, (_, i) => Int32Array.from({ length: m + 1 }, (_, j) => i + j));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (A.chars[i - 1] === B.chars[j - 1] ? 0 : 1));
  const hit = new Array(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (D[i][j] === D[i - 1][j - 1] + (A.chars[i - 1] === B.chars[j - 1] ? 0 : 1)) { hit[i - 1] = j - 1; i--; j--; }
    else if (D[i][j] === D[i - 1][j] + 1) i--; else j--;
  }
  const end = new Array(scriptWords.length).fill(-1);
  hit.forEach((j, i) => { if (j >= 0) end[A.owner[i]] = B.owner[j]; });
  return end;
}

// Sets the silences inside one spoken part: every full stop gets exactly stopGap, a comma
// at most commaMax, any other hesitation at most commaMax. The script says where the
// punctuation is (Whisper's own punctuation often differs: "three, three, it stays");
// Whisper says when each word ends. The voice's own pauses were not reliable: it
// sometimes paused longer at a comma than at a full stop.
async function shapePauses(raw, text, { stopGap = 0.6, commaMax = 0.3 } = {}) {
  const { readWav, writeWav } = await import(pathToFileURL(path.join(EXR, 'src', 'wav.js')).href);
  const out = raw.replace(/\.wav$/, `.shaped2-${stopGap}-${commaMax}.wav`), missFile = out.replace(/\.wav$/, '.missed.json');
  if (fs.existsSync(out) && fs.existsSync(missFile)) { const m = JSON.parse(fs.readFileSync(missFile, 'utf8')); return { ...readWav(out), missed: Array.isArray(m) ? m : m.missed || [] }; }
  const { samples, sampleRate: sr } = readWav(raw);
  const heard = await heardWords(raw);
  const words = text.trim().split(/\s+/), end = alignWords(words, heard);
  const hop = Math.round(sr * 0.01), n = Math.floor(samples.length / hop), rms = new Float32Array(n);
  for (let i = 0; i < n; i++) { let e = 0; for (let j = i * hop; j < (i + 1) * hop; j++) e += samples[j] ** 2; rms[i] = Math.sqrt(e / hop); }
  const peak = Math.max(...rms);
  const quietRuns = (db, from = 0, to = n) => {
    const floor = peak * 10 ** (db / 20), runs = [];
    for (let i = from; i < to;) {
      if (rms[i] >= floor) { i++; continue; }
      let j = i;
      while (j < to && rms[j] < floor) j++;
      if (i > 0 && j < n && j - i >= 4) runs.push({ a: i * hop, b: j * hop });
      i = j;
    }
    return runs;
  };
  const edits = new Map(); // start sample -> { a, b, len }
  const missed = []; // punctuation that could not be placed: its pause is the voice's own
  const overlaps = (r) => [...edits.values()].some((e) => r.a < e.b && e.a < r.b);
  for (let i = 0; i + 1 < words.length; i++) {
    const kind = /[.!?]["')\]]*$/.test(words[i]) ? 'stop' : /[,;:]["')\]]*$/.test(words[i]) ? 'comma' : null;
    const h = end[i];
    if (!kind) continue;
    if (h < 0 || h + 1 >= heard.length || end[i + 1] === h) { missed.push(words[i]); continue; }
    // The pause lies between the two heard words. A breath in it is louder than silence,
    // so look at -30 dB here; the breath is replaced by silence with the rest.
    const lo = Math.max(0, Math.floor((heard[h].end - 0.15) * sr / hop)), hi = Math.min(n, Math.ceil((heard[h + 1].start + 0.15) * sr / hop));
    const here = quietRuns(-30, lo, hi).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    if (kind === 'stop') {
      if (here) edits.set(here.a, { ...here, len: stopGap });
      else {
        // No silence at all: open one at the quietest frame between the two words.
        let best = lo;
        for (let k = lo; k < hi; k++) if (rms[k] < rms[best]) best = k;
        edits.set(best * hop, { a: best * hop, b: best * hop, len: stopGap });
      }
    } else if (here && !overlaps(here)) edits.set(here.a, { ...here, len: Math.min(commaMax, (here.b - here.a) / sr) });
  }
  // A long silence with no punctuation (a hesitation) is cut to commaMax too.
  for (const r of quietRuns(-38)) if (!overlaps(r) && (r.b - r.a) / sr > commaMax) edits.set(r.a, { ...r, len: commaMax });
  const parts = [];
  let last = 0;
  for (const e of [...edits.values()].sort((x, y) => x.a - y.a)) {
    if (e.a < last) continue;
    // Keep 20 ms of the natural fade on each side; the rest of the pause is exact silence.
    const keep = Math.min(Math.round(0.02 * sr), Math.floor((e.b - e.a) / 2));
    parts.push(samples.subarray(last, e.a + keep), new Float32Array(Math.max(0, Math.round(e.len * sr) - 2 * keep)));
    last = e.b - keep;
  }
  parts.push(samples.subarray(last));
  const shaped = new Float32Array(parts.reduce((k, p) => k + p.length, 0));
  let o = 0;
  for (const p of parts) { shaped.set(p, o); o += p.length; }
  writeWav(out, shaped, sr);
  fs.writeFileSync(missFile, JSON.stringify(missed));
  return { samples: shaped, sampleRate: sr, missed };
}

async function voice() {
  const dir = projectDir(positional()[0]);
  const shadow = path.join(dir, 'build', '_voice');
  fs.mkdirSync(shadow, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  fs.copyFileSync(path.join(dir, 'script.md'), path.join(shadow, 'script.md'));
  // Relative links, so a project folder can move. A link left from an old location is replaced.
  for (const [name, target] of [['build', '..'], ['scenes.js', path.join('..', '..', 'scenes.js')]]) {
    const l = path.join(shadow, name);
    let old = null; try { old = fs.readlinkSync(l); } catch {}
    if (old === target) continue;
    fs.rmSync(l, { force: true });
    fs.symlinkSync(target, l);
  }
  const engine = voiceEngine(cfg);
  console.log(`voice: ${engine}`);
  // Kokoro: explainroo speaks with its own small model, on the CPU. Measured on the test
  // video: speed 0.9 gives 182 to 187 words a minute, 0.82 gives 172 to 174 (over the 170
  // limit), 0.78 gives 148 to 152, near the 160 the user chose for Chatterbox. Chatterbox: we speak, check
  // and retake each part, then hand explainroo the recordings to time.
  const spoken = engine === 'kokoro' ? { ...cfg, voice: cfg._tts?.kokoroVoice || CONFIG.kokoroVoice, speed: cfg._tts?.speed ?? 0.78 } : await chatterbox(dir, shadow, cfg);
  fs.writeFileSync(path.join(shadow, 'video.json'), JSON.stringify(spoken, null, 2));
  const r = spawnSync('node', [path.join(EXR, 'bin', 'explainroo.js'), 'voice', shadow], { stdio: 'inherit' });
  if (r.status !== 0) die('explainroo voice failed (see above)');
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'build', 'timeline.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'build', 'timeline.js'), `window.TIMELINE = ${JSON.stringify(tl)};\n`);
  narration(dir, tl);
  subtitles(dir, tl);
  pacing(tl, true);
  pauses(tl, true);
}

// The gap after each full stop and each comma, as the viewer hears it, for the report.
// Whisper's timing over a whole scene is about 0.2 s off, so this is a summary, not a
// check: the exact check is in shapePauses (every full stop 0.6 s, comma at most 0.3 s).
function pauses(tl, print) {
  const stops = [], commas = [], warn = [];
  for (const s of tl.scenes) for (let i = 0; i + 1 < s.words.length; i++) {
    const w = s.words[i], g = s.words[i + 1].start - w.end;
    if (/[.!?]["')\]]*$/.test(w.text)) stops.push(g);
    else if (/[,;:]$/.test(w.text)) commas.push(g);
  }
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(2) : '-');
  if (print) {
    console.log(`pauses: after full stops median ${med(stops)} s, after commas median ${med(commas)} s`);
  }
  return warn;
}

// All scene WAVs placed at their start times in one track.
function narration(dir, tl) {
  const voiced = tl.scenes.filter((s) => s.voice);
  const args = ['-v', 'error', '-y'];
  for (const s of voiced) args.push('-i', path.join(dir, s.voice.url));
  const chains = voiced.map((s, i) => `[${i}:a]aresample=48000,adelay=delays=${Math.round(s.voice.start * 1000)}:all=1[a${i}]`);
  const mixIn = voiced.map((_, i) => `[a${i}]`).join('');
  args.push('-filter_complex', `${chains.join(';')};${mixIn}amix=inputs=${voiced.length}:normalize=0:dropout_transition=0,apad,atrim=0:${tl.duration.toFixed(3)}[out]`,
    '-map', '[out]', '-ac', '1', '-ar', '48000', path.join(dir, 'build', 'narration.wav'));
  execFileSync('ffmpeg', args);
}

const srtTime = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
// Subtitles: one line per cue, never two. A cue of more than SUB_MAX characters
// wraps to two lines in mpv (the user asked for one line). A phrase (up to a full stop
// or a pause) that is too long is split into the fewest cues that fit, with lengths as
// even as possible, and a break after a comma when one is near.
const SUB_MAX = 42;
function splitPhrase(ws) {
  const join = (a, b) => ws.slice(a, b).map((w) => w.text).join(' ');
  const total = join(0, ws.length).length;
  if (total <= SUB_MAX) return [ws];
  const n = Math.ceil(total / SUB_MAX), target = total / n;
  // best[j] = cheapest split of ws[0..j): cost of each part = (length - target)², less a bonus for a comma break.
  const best = [{ cost: 0, prev: -1 }];
  for (let j = 1; j <= ws.length; j++) {
    best[j] = { cost: Infinity, prev: -1 };
    for (let i = j - 1; i >= 0; i--) {
      const len = join(i, j).length;
      if (len > SUB_MAX && j - i > 1) break;
      if (best[i].cost === Infinity) continue;
      const comma = j < ws.length && /[,;:]$/.test(ws[j - 1].text) ? 120 : 0;
      // A line that ends on a small word ("in the / path") reads badly.
      const weak = j < ws.length && /^(the|a|an|of|to|in|on|at|for|and|or|is|its|your|with|from|by)$/i.test(ws[j - 1].text) ? 150 : 0;
      const c = best[i].cost + (len - target) ** 2 - comma + weak + 400;
      if (c < best[j].cost) best[j] = { cost: c, prev: i };
    }
  }
  const parts = [];
  for (let j = ws.length; j > 0; j = best[j].prev) parts.unshift(ws.slice(best[j].prev, j));
  return parts;
}
function subtitles(dir, tl) {
  const cues = [];
  for (const s of tl.scenes) {
    let cur = [];
    const flush = () => { for (const p of cur.length ? splitPhrase(cur) : []) cues.push({ a: s.start + p[0].start, b: s.start + p[p.length - 1].end, text: p.map((w) => w.text).join(' ') }); cur = []; };
    s.words.forEach((w, i) => {
      const next = s.words[i + 1];
      cur.push(w);
      if (/[.?!]$/.test(w.text) || (next && next.start - w.end > 0.5)) flush();
    });
    flush();
  }
  // A single word longer than SUB_MAX cannot be split: report it.
  for (const c of cues) if (c.text.length > SUB_MAX) console.log(`WARN subtitle "${c.text}" is ${c.text.length} characters, more than ${SUB_MAX}: it can wrap to two lines`);
  // Each cue ends before the next one starts, so two cues are never on screen together (two lines).
  for (let i = 0; i < cues.length; i++) cues[i].end = Math.min(cues[i].b + 0.15, cues[i + 1] ? cues[i + 1].a - 0.01 : Infinity);
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'build', 'subtitles.srt'), cues.map((c, i) => `${i + 1}\n${srtTime(c.a)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
}
// The subtitle file must have one line per cue, at most SUB_MAX characters, and no two cues at the same time.
function subtitleIssues(file) {
  const out = [], blocks = fs.readFileSync(file, 'utf8').trim().split(/\n\s*\n/);
  const sec = (x) => { const m = x.match(/(\d+):(\d+):(\d+),(\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  let prevEnd = -1;
  for (const b of blocks) {
    const lines = b.split('\n'), [a, z] = lines[1].split(' --> ').map(sec), text = lines.slice(2);
    if (text.length > 1) out.push(`subtitle ${lines[0]} has ${text.length} lines`);
    if (text.join(' ').length > SUB_MAX) out.push(`subtitle ${lines[0]} is ${text.join(' ').length} characters (most ${SUB_MAX}): it wraps to two lines`);
    if (a < prevEnd - 0.001) out.push(`subtitle ${lines[0]} starts before the one in front of it ends: two lines on screen`);
    prevEnd = z;
  }
  return out;
}

// Words a minute, scene by scene. Core scenes ({core=yes} in script.md) carry
// the new idea, so they get the stricter limit.
function pacing(tl, print) {
  const rows = [], warn = [];
  let words = 0, secs = 0;
  for (const s of tl.scenes) {
    if (!s.voice) continue;
    const n = s.words.length, wpm = n / (s.voice.dur / 60), core = !!s.attrs?.core;
    words += n; secs += s.voice.dur;
    // Measured on the pace the user chose by ear (Chatterbox, 2026-11-01): core scenes
    // came out at 116 to 138, other scenes at up to 165. Above these, it is too fast.
    const limit = core ? 145 : 170;
    rows.push(`${s.id.padEnd(20)} ${core ? 'core' : '    '} ${s.dur.toFixed(1).padStart(6)} s ${String(Math.round(wpm)).padStart(5)} wpm`);
    if (wpm > limit) warn.push(`${s.id}: ${Math.round(wpm)} words a minute is fast for ${core ? 'a core scene' : 'narration'} (limit ${limit}). Add [pause 0.8] after key statements, or cut words.`);
  }
  if (print) {
    console.log('\npacing\n' + rows.join('\n'));
    console.log(`total ${tl.duration.toFixed(1)} s, ${Math.round(words / (secs / 60))} words a minute while speaking`);
    for (const w of warn) console.log(`WARN ${w}`);
  }
  return warn;
}

// The music track at the video's length (engine/music.mjs, SOUND.md). It is made again
// only when the track, the length or music.mjs changes.
function musicTrack(dir, track, seconds) {
  const file = path.join(dir, 'build', 'music.wav'), stamp = path.join(dir, 'build', 'music.stamp');
  const key = `${track} ${seconds} ${createHash('sha1').update(fs.readFileSync(path.join(ENGINE, 'music.mjs'))).digest('hex')}`;
  if (fs.existsSync(file) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) return file;
  try { music(file, track, seconds); } catch (e) { die(e.message); }
  fs.writeFileSync(stamp, key);
  return file;
}

// ---------- TeX ----------
let mathjax;
async function tex(src, display) {
  mathjax ??= import(pathToFileURL(path.join(EXR, 'node_modules', 'mathjax', 'node-main.mjs')).href).then(({ default: mj }) => mj.init({
    loader: { load: ['input/tex', 'output/svg', '[tex]/html'], require: (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(EXR, 'node_modules', f)).href), failed: (e) => { throw e; } },
    tex: { packages: { '[+]': ['html'], '[-]': ['require', 'noundefined'] }, formatError: (_j, e) => { throw new Error(e.message); } },
    svg: { fontCache: 'none' },
  }));
  const mj = await mathjax;
  const doc = mj.startup.mathjax.document('', { InputJax: mj.startup.getInputJax(), OutputJax: mj.startup.getOutputJax() });
  const node = await doc.convertPromise(src, { display });
  return mj.startup.adaptor.outerHTML(mj.startup.adaptor.firstChild(node));
}

// ---------- server ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.gif': 'image/gif' };
// Fonts: explainroo's set, plus the skill's own in engine/fonts (fonts.json, same format).
function fontsCss() {
  const own = path.join(ENGINE, 'fonts', 'fonts.json');
  const list = [...JSON.parse(fs.readFileSync(path.join(EXR, 'fonts', 'fonts.json'), 'utf8')), ...(fs.existsSync(own) ? JSON.parse(fs.readFileSync(own, 'utf8')) : [])];
  return list.map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style || 'normal'};src:url(/_fonts/${f.file}) format('woff2');unicode-range:${f.unicodeRange}}`).join('\n');
}
function serve(dir) {
  const inside = (root, rel) => { const p = path.resolve(root, '.' + rel); return p.startsWith(path.resolve(root)) ? p : null; };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type = 'text/plain') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    try {
      if (u.pathname === '/') return send(200, fs.readFileSync(path.join(ENGINE, 'page.html')), 'text/html');
      if (u.pathname === '/_fonts.css') return send(200, fontsCss(), 'text/css');
      if (u.pathname === '/_tex') return send(200, await tex(u.searchParams.get('q'), u.searchParams.get('display') !== '0'), 'image/svg+xml');
      let file = null;
      if (u.pathname.startsWith('/_engine/')) file = inside(ENGINE, u.pathname.slice(8));
      else if (u.pathname.startsWith('/_lib/')) file = inside(path.join(ENGINE, '..', 'styles', 'library'), u.pathname.slice(5));   // the shared visual library
      else if (u.pathname.startsWith('/_fonts/')) { const own = inside(path.join(ENGINE, 'fonts'), u.pathname.slice(7)); file = own && fs.existsSync(own) ? own : inside(path.join(EXR, 'fonts'), u.pathname.slice(7)); }
      else file = inside(dir, decodeURIComponent(u.pathname));
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, `not found: ${u.pathname}`);
      send(200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    } catch (e) { send(500, String(e.message || e)); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((c) => server.close(c)) })));
}

// ---------- GPU ----------
// The NVIDIA GPU draws the frames (Chrome's raster and WebGL through ANGLE on EGL; on a hybrid
// laptop through PRIME offload) and NVENC encodes them. The steps, the fps and the capture size do
// not change; only the device does. XV_GPU=0 forces the old CPU path (SwiftShader and libx264).
// Vulkan was tested and crashes the GPU process on this driver, so ANGLE uses EGL.
const NV_ENV = { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __VK_LAYER_NV_optimus: 'NVIDIA_only', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' };
const GPU_FLAGS = ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--ozone-platform=headless'];
const CPU_FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
let gpuMemo;
function gpu() {
  if (gpuMemo) return gpuMemo;
  if (process.env.XV_GPU === '0' || CONFIG.gpu === 'off' || !CHROME) return (gpuMemo = { chrome: false, nvenc: false, renderer: 'SwiftShader (CPU)' });
  const ver = (spawnSync(CHROME, ['--version'], { encoding: 'utf8' }).stdout || '').trim().replace(/\W+/g, '_');
  const cache = path.join(os.tmpdir(), `xv-gpu-${ver}.json`);
  try { return (gpuMemo = JSON.parse(fs.readFileSync(cache, 'utf8'))); } catch { /* probe below */ }
  // Probe: does WebGL get the NVIDIA GPU with these flags?
  const page = 'data:text/html,' + encodeURIComponent("<body><script>const g=document.createElement('canvas').getContext('webgl');const e=g&&g.getExtension('WEBGL_debug_renderer_info');document.body.textContent='R='+(e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'none')</script>");
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'xv-gpu-probe-'));
  const r = spawnSync(CHROME, ['--headless=new', '--no-sandbox', `--user-data-dir=${prof}`, ...GPU_FLAGS, '--dump-dom', page], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...NV_ENV } });
  fs.rmSync(prof, { recursive: true, force: true });
  const renderer = ((r.stdout || '').match(/R=([^<]*)/) || [])[1] || 'none';
  const chromeGpu = /nvidia|geforce|rtx/i.test(renderer);
  const nvenc = /h264_nvenc/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout || '')
    && spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x144:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-']).status === 0;
  gpuMemo = { chrome: chromeGpu, nvenc, renderer: chromeGpu ? renderer : 'SwiftShader (CPU)' };
  try { fs.writeFileSync(cache, JSON.stringify(gpuMemo)); } catch { /* no cache */ }
  return gpuMemo;
}

// ---------- Chrome over the DevTools protocol ----------
async function chrome(url, { width = 1920, height = 1080 } = {}) {
  if (!CHROME) die('no Chrome found; set CHROME=/path/to/chrome');
  // Outside any repo: the profile holds symlinks that trip tools walking the tree.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xv-chrome-'));
  // Port 0: Chrome picks a free port and writes it to DevToolsActivePort. A random port
  // once collided between two render workers; both then drove one browser and the video
  // showed the formula scene inside the hook.
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    // The GPU when the probe found one (see gpu()), else WebGL in software (SwiftShader).
    ...(gpu().chrome ? GPU_FLAGS : CPU_FLAGS), '--force-color-profile=srgb',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore', env: gpu().chrome ? { ...process.env, ...NV_ENV } : process.env });
  let target, port;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!port) { proc.kill(); die('Chrome did not start (no DevToolsActivePort)'); }
  for (let i = 0; i < 150 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!target) { proc.kill(); die('Chrome did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let next = 1;
  const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = next++; waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await viewport(width, height);
  await send('Page.enable');
  await send('Page.navigate', { url: `${url}/?render=1` });
  for (let i = 0; i < 200 && (await evaluate('typeof window.seek').catch(() => '')) !== 'function'; i++) await new Promise((r) => setTimeout(r, 50));
  await evaluate('seek(0)');
  await evaluate('document.fonts.ready.then(() => true)');
  // A capture with a clip and a scale below 1 can show the canvas of an earlier seek:
  // the review pack showed shapes from later in a scene "flashing" on frames before
  // their cue, a flicker that the render did not have (tested: same frames, full-size
  // stills clean, scaled strips wrong, twice in a row). So the sheets and the review
  // pack capture at full size and let their grid page scale the image down.
  const shot = async ({ format = 'png', quality, scale = 1 } = {}) => Buffer.from((await send('Page.captureScreenshot', { format, quality, ...(scale !== 1 ? { clip: { x: 0, y: 0, width, height, scale } } : {}) })).data, 'base64');
  const close = async () => { ws.close(); await new Promise((r) => { proc.once('exit', r); proc.kill(); }); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); };
  return { send, evaluate, shot, close, viewport };
}

async function withPage(dir, fn) {
  const srv = await serve(dir);
  const page = await chrome(srv.url);
  try { return await fn(page); } finally { await page.close(); await srv.close(); }
}

const errorsSince = async (page, n) => (await page.evaluate('window.__errors')).slice(n);

// "12.5", "scene", "scene@2.4", "scene@end", "scene@#mark", "scene@word"
function resolveTime(tl, spec) {
  if (/^\d+(\.\d+)?$/.test(spec)) return +spec;
  const [id, at] = spec.split('@');
  const s = tl.scenes.find((x) => x.id === id);
  if (!s) die(`no scene "${id}". Scenes: ${tl.scenes.map((x) => x.id).join(', ')}`);
  if (at === undefined || at === 'end') return s.start + s.dur - 0.1;
  if (at === 'start') return s.start + 0.05;
  if (/^\d+(\.\d+)?$/.test(at)) return s.start + +at;
  if (at.startsWith('#')) { const m = s.marks[at.slice(1)]; if (m === undefined) die(`scene ${id} has no marker [${at}]`); return s.start + m + 0.4; }
  const w = s.words.find((x) => x.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === at.toLowerCase());
  if (!w) die(`scene ${id} does not say "${at}"`);
  return s.start + w.end + 0.4;
}

// ---------- still, sheet, check ----------
async function still() {
  const [d, ...specs] = positional();
  const dir = projectDir(d), tl = timeline(dir);
  requireManim(dir);
  if (!specs.length) die('still needs times, for example: still . intro@end 42.5');
  const outDir = path.join(dir, 'build', 'stills');
  fs.mkdirSync(outDir, { recursive: true });
  await withPage(dir, async (page) => {
    for (const spec of specs) {
      const t = resolveTime(tl, spec);
      const n = (await page.evaluate('window.__errors')).length;
      // Warm-up (see render): draw and capture once, throw it away, then the real capture.
      await page.evaluate(`seek(${t})`); await page.shot();
      await page.evaluate(`seek(${t})`);
      const f = path.join(outDir, `${spec.replace(/[^\w@#.-]/g, '_')}.png`);
      fs.writeFileSync(f, await page.shot());
      console.log(f);
      for (const e of await errorsSince(page, n)) console.log(`ERROR ${e}`);
    }
  });
}

async function sheet() {
  const dir = projectDir(positional()[0]), tl = timeline(dir);
  requireManim(dir);
  const only = opt('--scene'), every = opt('--every');
  const times = [];
  for (const s of tl.scenes) {
    if (only && s.id !== only) continue;
    if (every || only) { const step = +(every || 1); for (let t = 0.2; t < s.dur; t += step) times.push([s.id, s.start + t]); }
    else for (const f of [0.3, 0.65]) times.push([s.id, s.start + s.dur * f]);
    if (!every && !only) times.push([s.id, s.start + s.dur - 0.15]);
  }
  if (!times.length) die(`no scene "${only}"`);
  const per = 16, sheets = [];
  await withPage(dir, async (page) => {
    const cells = [];
    for (const [id, t] of times) {
      await page.evaluate(`seek(${t})`);
      cells.push({ id, t, img: (await page.shot({ format: 'jpeg', quality: 80 })).toString('base64') });  // full size: see shot()
    }
    const errs = await page.evaluate('window.__errors');
    for (let k = 0; k < cells.length; k += per) {
      const group = cells.slice(k, k + per), rows = Math.ceil(group.length / 4), h = rows * 306 + 8;
      await page.viewport(1960, h);
      await page.evaluate(`document.body.innerHTML = ${JSON.stringify(`<div style="display:grid;grid-template-columns:repeat(4,480px);gap:8px;padding:8px;background:#222;font:600 18px Inter,sans-serif;color:#eee">${group.map((c) => `<div><div style="height:28px">${c.id} @ ${(c.t - tl.scenes.find((s) => s.id === c.id).start).toFixed(1)} s  (${c.t.toFixed(1)})</div><img width="480" height="270" src="data:image/jpeg;base64,${c.img}"></div>`).join('')}</div>`)}; document.body.style.overflow='visible'; true`);
      const f = path.join(dir, 'build', `sheet-${sheets.length + 1}.png`);
      fs.writeFileSync(f, Buffer.from((await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1960, height: h, scale: 1 } })).data, 'base64'));
      sheets.push(f);
    }
    for (const e of [...new Set(errs)]) console.log(`ERROR ${e}`);
  });
  for (const f of sheets) console.log(f);
  console.log('Look at every sheet: clipped or tiny text, overlaps, empty frames, the same picture held too long.');
}

async function check() {
  const dir = projectDir(positional()[0]), tl = timeline(dir);
  const problems = new Set(), layout = new Set();
  const stale = manimStale(dir);
  if (stale.length) problems.add(`Manim frames are missing or old for: ${stale.join(', ')}. Run "manim".`);
  for (const id of fs.existsSync(path.join(dir, 'build', 'manim')) ? fs.readdirSync(path.join(dir, 'build', 'manim')) : []) {
    const f = path.join(dir, 'build', 'manim', id, 'timing.json');
    if (fs.existsSync(f)) for (const l of JSON.parse(fs.readFileSync(f, 'utf8')).late) layout.add(`${id} (Manim): ${l}`);
  }
  await withPage(dir, async (page) => {
    for (const s of tl.scenes) {
      const ts = new Set([0.05, s.dur / 2, s.dur - 0.1, ...Object.values(s.marks).map((m) => m + 0.7)]);
      for (let t = 1; t < s.dur; t += 1.5) ts.add(t);
      for (const t of [...ts].filter((x) => x >= 0 && x < s.dur).sort((a, b) => a - b)) {
        await page.evaluate(`seek(${s.start + t})`);
        for (const i of await page.evaluate('layoutIssues()')) layout.add(`${s.id}: ${i}`);
      }
    }
    for (const e of await page.evaluate('window.__errors')) problems.add(e.split('\n')[0]);
  });
  // Word timing: when Whisper matches too few words of a scene, the engine guesses the word
  // times, and the cues of that scene bunch together (video 3: six cues in 0.5 s, rate 0.46).
  for (const s of tl.scenes) {
    const f = path.join(dir, 'build', 'voice', `${s.id}.json`);
    const rate = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).matchRate : undefined;
    if (typeof rate === 'number' && rate < 0.9) problems.add(`scene ${s.id}: only ${Math.round(rate * 100)} % of the words were matched in the audio, so its cue times are guesses. Listen to build/voice/${s.id}, then make that scene's voice again (new seed) or split its long paragraph.`);
  }
  const script = fs.readFileSync(path.join(dir, 'script.md'), 'utf8');
  if (/[\u2013\u2014]/.test(script.replace(/^>.*$/gm, ''))) problems.add('script.md has an en or em dash in narration. The voice reads them badly: use a full stop or a comma.');
  const pace = pacing(tl, false);
  for (const p of problems) console.log(`ERROR ${p}`);
  for (const l of layout) console.log(`WARN  ${l}`);
  for (const p of pace) console.log(`WARN  ${p}`);
  if (!problems.size && !layout.size && !pace.length) console.log('check: no problems found');
  process.exit(problems.size ? 1 : 0);
}

// ---------- render ----------
const X264 = (fps, draft) => ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  // NVENC on the GPU when it works, with constant quality 17 like the x264 CRF; else libx264.
  ...(gpu().nvenc
    ? ['-c:v', 'h264_nvenc', '-preset', draft ? 'p4' : 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', draft ? '26' : '17', '-b:v', '0', '-profile:v', 'high']
    : ['-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', draft ? '26' : '17', '-profile:v', 'high', '-x264-params', 'weightp=0']),
  // A keyframe every second and no B-frames, so a seek in VLC never shows smeared colour blocks.
  '-g', String(fps), '-keyint_min', String(fps), '-bf', '0',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

async function render() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), cfg = renderCfg(dir);
  requireManim(dir);
  const track = cfg.music === true ? 'current' : cfg.music;
  const musicFile = track ? musicTrack(dir, track, tl.duration) : null;
  const draft = flag('--draft'), fps = tl.fps;
  { const g = gpu(); console.log(`render: frames drawn by ${g.renderer}; encode ${g.nvenc ? 'NVENC (GPU)' : 'libx264 (CPU)'}`); }
  const from = +opt('--from', 0), to = Math.min(+opt('--to', tl.duration), tl.duration);
  const partial = argv.includes('--from') || argv.includes('--to');
  const total = Math.round((to - from) * fps);
  const workers = Math.max(1, Math.min(+opt('--workers', cfg.workers), Math.ceil(total / (fps * 2))));
  const partsDir = path.join(dir, 'build', 'parts');
  const silent = path.join(dir, 'build', 'video.mp4');
  // --remix: new audio (music track or level, voice) on the frames of the last full render.
  const remix = flag('--remix');
  if (remix && (partial || draft || !fs.existsSync(silent))) die('--remix needs a full render first (no --draft, --from or --to)');
  if (!remix) {
  fs.rmSync(partsDir, { recursive: true, force: true });
  fs.mkdirSync(partsDir, { recursive: true });
  const srv = await serve(dir);
  const t0 = Date.now();
  let done = 0;
  const errors = new Set();
  const job = async (k) => {
    const a = Math.floor((total * k) / workers), b = Math.floor((total * (k + 1)) / workers);
    const page = await chrome(srv.url);
    const out = path.join(partsDir, `part_${k}.mp4`);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...X264(fps, draft), out], { stdio: ['pipe', 'inherit', 'inherit'] });
    try {
      // Warm-up: on the GPU path the first frame a fresh page draws of a WebGL scene can
      // miss objects whose shaders are not ready yet (a still showed a toy-3d block as a
      // pale shadow; the next seek in the same page drew it solid). So each worker draws
      // and captures its first frame once and throws that capture away.
      if (a < b) { await page.evaluate(`seek(${from + a / fps})`); await page.shot({ format: 'jpeg', quality: 50, scale: draft ? 0.5 : 1 }); }
      for (let i = a; i < b; i++) {
        await page.evaluate(`seek(${from + i / fps})`);
        const buf = await page.shot({ format: 'jpeg', quality: draft ? 80 : 95, scale: draft ? 0.5 : 1 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (k === 0 && i % fps === 0) process.stdout.write(`\rframes ${done} / ${total}  (${(done / ((Date.now() - t0) / 1000)).toFixed(1)} fps)   `);
      }
      for (const e of await page.evaluate('window.__errors')) errors.add(e.split('\n')[0]);
    } finally {
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      await page.close();
    }
    return out;
  };
  let parts;
  try { parts = await Promise.all(Array.from({ length: workers }, (_, k) => job(k))); } finally { await srv.close(); }
  console.log(`\nrendered ${total} frames with ${workers} workers in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const e of errors) console.log(`ERROR ${e}`);
  // A scene error means wrong frames in the video: never write it as finished.
  if (errors.size) die('the render had scene errors (above), so no video was written. Fix them and render again.');
  const list = path.join(partsDir, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
  fs.rmSync(partsDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const name = partial ? `part-${from}-${to}` : draft ? `${slug(dir)}-draft` : slug(dir);
  const final = path.join(dir, partial ? 'build' : 'out', `${name}.mp4`);
  const srt = path.join(dir, 'build', 'subtitles.srt'), useMusic = !!musicFile;
  const ss = ['-ss', String(from)];
  const args = ['-v', 'error', '-y', '-i', silent, ...ss, '-i', path.join(dir, 'build', 'narration.wav')];
  if (useMusic) args.push(...ss, '-i', musicFile);
  if (!partial) args.push('-i', srt);
  // loudnorm holds back about 3 s and drops it at the end, so pad the voice first.
  // The music ducks gently (ratio 2, slow release): a hard duck pumps loud-soft-loud
  // between sentences (measured: 13.5 LU swing with ratio 8, 5.5 LU with this).
  const voiceChain = `[1:a]apad=pad_dur=4,aresample=48000,loudnorm=I=-16:TP=-1.5`;
  args.push('-filter_complex', useMusic
    ? `${voiceChain},asplit=2[v][key];[2:a]volume=${cfg.musicVolume}[m];[m][key]sidechaincompress=threshold=0.03:ratio=2:attack=250:release=1800:knee=6[md];[v][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`
    : `${voiceChain},alimiter=limit=0.95[a]`);
  args.push('-map', '0:v', '-map', '[a]');
  if (!partial) args.push('-map', `${useMusic ? 3 : 2}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
  // loudnorm works at 192 kHz inside and passes that rate on. AAC at 96 kHz or
  // in mono plays silent in many players, so force 48 kHz stereo.
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(to - from), '-movflags', '+faststart', final);
  execFileSync('ffmpeg', args);
  if (!partial) fs.copyFileSync(srt, path.join(dir, 'out', `${name}.srt`));
  console.log(final);
}

// ---------- verify ----------
async function verify() {
  const dir = projectDir(positional()[0]), tl = timeline(dir);
  const file = opt('--file', path.join(dir, 'out', `${slug(dir)}.mp4`));
  if (!fs.existsSync(file)) die(`${file} does not exist. Run "render" first.`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const kinds = probe.streams.map((s) => s.codec_type);
  const dur = +probe.format.duration;
  const issues = [];
  if (Math.abs(dur - tl.duration) > 0.2) issues.push(`duration ${dur.toFixed(2)} s, timeline says ${tl.duration.toFixed(2)} s`);
  for (const k of ['video', 'audio', 'subtitle']) if (!kinds.includes(k)) issues.push(`no ${k} stream`);
  const srtOut = file.replace(/\.mp4$/, '.srt');
  if (fs.existsSync(srtOut)) issues.push(...subtitleIssues(srtOut).slice(0, 10));
  const au = probe.streams.find((s) => s.codec_type === 'audio');
  if (au && (+au.sample_rate !== 48000 || au.channels !== 2)) issues.push(`audio is ${au.sample_rate} Hz, ${au.channels} channel(s): many players play only 48000 Hz stereo`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-filter_complex', '[0:a]ebur128=peak=true[o]', '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8' });
  const lufs = +(r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
  if (!(lufs > -20 && lufs < -12)) issues.push(`loudness ${lufs} LUFS (aim for -16)`);
  const b = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', 'blackdetect=d=0.5:pix_th=0.06', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const blacks = [...b.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)} to ${(+m[2]).toFixed(1)} s`);
  if (blacks.length) issues.push(`black frames at ${blacks.join(', ')} (fine only if the style has a black background)`);
  // The picture: the video must show what the scenes draw. A render once showed the
  // formula scene inside the hook and every other check passed. "Different" = more than
  // 3 % of pixels off by more than 40 of 255: on these dark frames the average hides it.
  const fps = tl.fps, W4 = 160, H4 = 90, PX = W4 * H4, wrong = [];
  const gray = (args, input) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-vf', `scale=${W4}:${H4}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { input, maxBuffer: 1 << 28 });
  const differs = (x, xo, y, yo) => { let k = 0; for (let j = 0; j < PX; j++) if (Math.abs(x[xo + j] - y[yo + j]) > 40) k++; return k / PX > 0.03; };
  const vid = gray(['-i', file]);
  // Plain Manim scenes: every frame against its source frame. A Manim scene with an overlay
  // (manim({ setup, draw })), or a scene with stale Manim frames, is drawn again instead.
  const plainManim = await withPage(dir, async (page) => page.evaluate('window.manimOnly()'));
  const drawnScenes = [];
  for (const s of tl.scenes) {
    const info = path.join(dir, 'build', 'manim', s.id, 'info.json');
    if (!fs.existsSync(info) || !plainManim.includes(s.id)) { drawnScenes.push(s); continue; }
    const src = gray(['-framerate', String(fps), '-i', path.join(dir, 'build', 'manim', s.id, 'f_%05d.jpg')]);
    const first = Math.round(s.start * fps);
    let bad = 0, at = null;
    for (let i = 0; i < src.length / PX && (first + i + 1) * PX <= vid.length; i++) if (differs(vid, (first + i) * PX, src, i * PX)) { bad++; at ??= (first + i) / fps; }
    if (bad) wrong.push(`${s.id}: ${bad} frames, first at ${at.toFixed(1)} s`);
  }
  // Other scenes: 3 frames each, drawn again.
  if (drawnScenes.length) await withPage(dir, async (page) => {
    for (const s of drawnScenes) for (const k of [0.25, 0.55, 0.85]) {
      const f = Math.min(Math.round((s.start + s.dur * k) * fps), Math.round(tl.duration * fps) - 1);
      await page.evaluate(`seek(${f / fps})`);
      if (differs(gray(['-f', 'image2pipe', '-i', '-'], await page.shot({ format: 'png' })), 0, vid, f * PX)) wrong.push(`${s.id}: the frame at ${(f / fps).toFixed(1)} s`);
    }
  });
  if (wrong.length) issues.unshift(`the video does not show what the scenes draw: ${wrong.join('; ')}. Render again.`);
  console.log(`${file}\n${dur.toFixed(1)} s, streams: ${kinds.join(', ')}, loudness ${lufs} LUFS, picture checked`);
  for (const i of issues) console.log(`${i.startsWith('the video does not show') ? 'ERROR' : 'WARN'} ${i}`);
  if (!issues.length) console.log('verify: no problems found');
  if (wrong.length) process.exit(1);
}

// ---------- review ----------
// Builds build/review/, the pack the reviewer agents read. An agent cannot watch
// an MP4 or hear the voice, so the video becomes stills, words with times, and
// motion as numbers. The numbers find a one-frame jump that a picture hides.
const fmt = (t) => t.toFixed(1);
const stamp = (t) => t.toFixed(1).padStart(5, '0');

function sentencesOf(tl) {
  const out = [];
  for (const s of tl.scenes) {
    let cur = [];
    const flush = () => { if (cur.length) out.push({ scene: s.id, a: s.start + cur[0].start, b: s.start + cur.at(-1).end, words: cur }); cur = []; };
    for (const w of s.words) { cur.push(w); if (/[.?!]$/.test(w.text)) flush(); }
    flush();
    if (!s.words.length) out.push({ scene: s.id, a: s.start, b: s.start + s.dur / 2, words: [{ text: '(no narration)', start: 0 }] });
  }
  return out;
}

// The words around a scene time, with "▶" before the word spoken at that time.
function wordsAround(s, tRel) {
  const i = s.words.findIndex((w) => w.start >= tRel - 0.02);
  if (i < 0) return s.words.slice(-8).map((w) => w.text).join(' ') + ' ▶(after the voice)';
  return s.words.slice(Math.max(0, i - 8), i + 8).map((w, k, arr) => (w === s.words[i] ? '▶' : '') + w.text).join(' ');
}

// Motion found in the per-frame trace: movements, jumps, pops, collisions.
function motion(tl, frames, fps) {
  const flags = [], moves = [], traced = {};
  const byScene = {};
  for (const f of frames) if (f.scene) (byScene[f.scene] ??= []).push(f);
  for (const [id, fs_] of Object.entries(byScene)) {
    const series = {};
    fs_.slice(1).forEach((f) => { for (const it of f.items) (series[it.k] ??= []).push({ t: f.t, ...it }); });
    traced[id] = Object.keys(series);
    for (const [k, ser] of Object.entries(series)) {
      let seg = null;
      const end = (p) => {
        if (seg && seg.n >= 2) {
          const peak = Math.max(...seg.v), abruptA = seg.v[0] > 0.4 * peak && peak > 300, abruptB = seg.v.at(-1) > 0.4 * peak && peak > 300;
          moves.push({ scene: id, k, a: seg.a, b: p.t, dist: seg.dist, peak, abruptA, abruptB });
          if (peak > 2000) flags.push({ t: seg.a, scene: id, kind: 'fast', msg: `"${k}" moves at ${Math.round(peak)} px/s at its peak: hard to follow in a learning video` });
        }
        seg = null;
      };
      for (let i = 1; i < ser.length; i++) {
        const p = ser[i - 1], c = ser[i];
        if (Math.abs(c.t - p.t - 1 / fps) > 1e-3) { end(p); continue; }
        // A thing that grows or moves in as it appears is an entrance, not a pop.
        const settles = (j) => ser.slice(j, j + 4).every((q, x, a) => !x || (Math.hypot(q.x - a[x - 1].x, q.y - a[x - 1].y) < 2 && Math.abs((q.w || 0) - (a[x - 1].w || 0)) < 2));
        if (Math.abs(c.o - p.o) > 0.6 && settles(c.o > p.o ? i : Math.max(0, i - 4))) flags.push({ t: c.t, scene: id, kind: 'pop', msg: `"${k}" ${c.o > p.o ? 'appears' : 'disappears'} in one frame, with no fade, growth or movement` });
        if (p.o < 0.05 || c.o < 0.05) { end(p); continue; }
        const d = Math.hypot(c.x - p.x, c.y - p.y), v = d * fps;
        const dPrev = i > 1 ? Math.hypot(p.x - ser[i - 2].x, p.y - ser[i - 2].y) : 0, n = ser[i + 1], dNext = n ? Math.hypot(n.x - c.x, n.y - c.y) : 0;
        if (d > 80 && dPrev < d / 4 && dNext < d / 4) flags.push({ t: c.t, scene: id, kind: 'jump', msg: `"${k}" jumps ${Math.round(d)} px in one frame` });
        const dw = Math.abs(c.w - p.w), dwPrev = i > 1 ? Math.abs(p.w - ser[i - 2].w) : 0, dwNext = n ? Math.abs(n.w - c.w) : 0;
        if (!c.manual && p.w > 4 && dw > 40 && dwPrev < dw / 4 && dwNext < dw / 4 && c.o > 0.3 && p.o > 0.3 && c.text === p.text) flags.push({ t: c.t, scene: id, kind: 'size', msg: `"${k}" changes width from ${Math.round(p.w)} to ${Math.round(c.w)} px in one frame` });
        // An overshoot slows to zero where it turns back: up to 2 slow frames do not end a movement.
        if (v > 15) { seg ??= { a: p.t, v: [], dist: 0, n: 0 }; seg.v.push(...(seg.slow || []), v); seg.dist += d + (seg.slowD || 0); seg.n++; seg.slow = []; seg.slowD = 0; }
        else if (seg && (seg.slow ??= []).length < 2) { seg.slow.push(v); seg.slowD = (seg.slowD || 0) + d; seg.last = p; }
        else end(seg?.last || p);
      }
      end(ser.at(-1));
    }
    // Two traced things that touch, and two texts that cover each other.
    const episodes = {};
    for (const f of fs_) {
      const vis = f.items.filter((it) => it.o > 0.3);
      for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) {
        const A = vis[a], B = vis[b];
        let hit = false, what = '';
        if (A.r && B.r) { hit = Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r; what = 'touch or pass through each other'; }
        else if (A.isText && B.isText && A.o > 0.5 && B.o > 0.5) {
          const ix = Math.min(A.x + A.w / 2, B.x + B.w / 2) - Math.max(A.x - A.w / 2, B.x - B.w / 2), iy = Math.min(A.y + A.h / 2, B.y + B.h / 2) - Math.max(A.y - A.h / 2, B.y - B.h / 2);
          hit = ix > 0 && iy > 0 && ix * iy > 0.2 * Math.min(A.w * A.h, B.w * B.h); what = 'text covers text';
        }
        const key = `${A.k}|${B.k}`;
        if (hit) { if (!episodes[key]) { episodes[key] = f.t; flags.push({ t: f.t, scene: id, kind: 'overlap', msg: `"${A.k}" and "${B.k}": ${what}` }); } }
        else delete episodes[key];
      }
    }
  }
  flags.sort((a, b) => a.t - b.t);
  return { flags, moves, traced };
}

async function review() {
  const dir = projectDir(positional()[0]), tl = timeline(dir);
  requireManim(dir);
  const fps = +opt('--fps', tl.fps);
  const out = path.join(dir, 'build', 'review');
  fs.rmSync(out, { recursive: true, force: true });
  for (const d of ['stills', 'cues', 'film']) fs.mkdirSync(path.join(out, d), { recursive: true });
  const sceneOf = (id) => tl.scenes.find((s) => s.id === id);
  const inScene = (s, t) => Math.min(s.start + s.dur - 0.03, Math.max(s.start + 0.03, t));
  const sentences = sentencesOf(tl);
  const write = (f, txt) => fs.writeFileSync(path.join(out, f), txt);
  const t0 = Date.now();

  await withPage(dir, async (page) => {
    // Pass 1: every frame, numbers only.
    const frames = [], n = Math.round(tl.duration * fps);
    for (let i = 0; i < n; i++) {
      frames.push({ t: i / fps, ...(await page.evaluate(`seek(${i / fps}).then(() => __traceFrame())`)) });
      if (i % (fps * 5) === 0) process.stdout.write(`\rtrace ${fmt(i / fps)} / ${fmt(tl.duration)} s   `);
    }
    process.stdout.write('\n');
    const cueMap = await page.evaluate('window.__cues');
    // Manim scenes keep their own cue log and trace (from xv.py).
    for (const s of tl.scenes) {
      const f = path.join(dir, 'build', 'manim', s.id, 'timing.json');
      if (!fs.existsSync(f)) continue;
      const tm = JSON.parse(fs.readFileSync(f, 'utf8'));
      Object.assign(cueMap, tm.cues);
      for (const [k, samples] of Object.entries(tm.trace)) {
        const byFrame = new Map(samples.map(([t, x, y, w, o]) => [Math.round(t * fps), { k, x, y, w, h: 0, o, manual: true }]));
        for (const fr of frames) if (fr.scene === s.id) { const it = byFrame.get(Math.round((fr.t - s.start) * fps)); if (it) fr.items.push(it); }
      }
    }
    const errors = new Set((await page.evaluate('window.__errors')).map((e) => e.split('\n')[0]));
    const m = motion(tl, frames, fps);

    // Cues the scenes really use, in time order; two cues at one moment become one.
    const cues = [];
    for (const [key, tRel] of Object.entries(cueMap)) {
      const [id, cue, nth] = key.split('|');
      const s = sceneOf(id);
      const t = s.start + tRel, same = cues.find((c) => c.scene === id && Math.abs(c.t - t) < 0.15);
      const name = cue + (nth !== '1' ? ` (time ${nth})` : '');
      if (same) same.names.push(name); else cues.push({ scene: id, t, tRel, names: [name] });
    }
    cues.sort((a, b) => a.t - b.t);

    // Full size, never scaled: a scaled capture can show an earlier seek (see shot()).
    const shot = async (t) => { await page.evaluate(`seek(${t})`); return (await page.shot({ format: 'jpeg', quality: 85 })).toString('base64'); };
    const grids = [];

    // Pass 2a: one still at the end of each sentence, for the learner.
    for (const st of sentences) {
      const s = sceneOf(st.scene), t = inScene(s, st.b + 0.5);
      st.still = `stills/${stamp(t)}-${st.scene}.jpg`;
      fs.writeFileSync(path.join(out, st.still), Buffer.from(await shot(t, 2 / 3), 'base64'));
    }
    // Pass 2b: before, on and after each cue, for the alignment check.
    for (const c of cues) {
      const s = sceneOf(c.scene);
      c.file = `cues/${stamp(c.t)}-${c.scene}-${c.names[0].replace(/[^\w]+/g, '')}.jpg`;
      const cells = [];
      for (const [dt, label] of [[-0.5, '0.5 s before'], [0.05, 'on the cue'], [0.4, '+0.4 s'], [1.0, '+1.0 s']]) {
        const t = inScene(s, c.t + dt);
        cells.push({ label: `${label}  (${fmt(t)} s)`, img: await shot(t, 0.4) });
      }
      grids.push({ file: c.file, cols: 2, w: 768, h: 432, title: `${c.scene}: cue ${c.names.join(', ')} at ${fmt(c.t)} s`, cells });
    }
    // Pass 2c: film strips, frame by frame, at each flag and each scene change;
    // 8 frames across each of the longest movements; 8 across each cue in a
    // scene with nothing traced (canvas only).
    const film = [];
    // A strip that is more than half inside another strip shows nothing new.
    const strip = (t, step, why, scene) => {
      const b = t + 7 * step, inside = (f) => Math.max(0, Math.min(b, f.t + 7 * f.step) - Math.max(t, f.t)) > 0.5 * (b - t);
      if (!film.some(inside)) film.push({ t, step, why, scene });
    };
    for (const f of m.flags.slice(0, 24)) strip(f.t - 4 / fps, 1 / fps, f.msg, f.scene);
    for (const s of tl.scenes.slice(1)) strip(s.start - 4 / fps, 1 / fps, `scene change into "${s.id}"`, s.id);
    for (const mv of [...m.moves].sort((a, b) => b.dist - a.dist).slice(0, 16)) strip(mv.a - 0.1, (mv.b - mv.a + 0.3) / 7, `movement of "${mv.k}" (${fmt(mv.a)} to ${fmt(mv.b)} s)`, mv.scene);
    for (const s of tl.scenes) if (!m.moves.some((mv) => mv.scene === s.id)) for (const c of cues.filter((c) => c.scene === s.id)) strip(c.t, 2.4 / 7, `after cue ${c.names[0]} in "${s.id}" (no traced movement in this scene)`, s.id);
    for (const f of film) {
      f.file = `film/${stamp(f.t)}-${f.scene}-${film.indexOf(f)}.jpg`;
      const cells = [];
      for (let k = 0; k < 8; k++) { const t = Math.max(0, Math.min(tl.duration - 0.01, f.t + k * f.step)); cells.push({ label: `${fmt(t)} s${f.step < 0.05 ? `  frame ${Math.round(t * fps)}` : ''}`, img: await shot(t, 0.25) }); }
      grids.push({ file: f.file, cols: 4, w: 480, h: 270, title: f.why, cells });
    }
    // Last: compose the grids. This replaces the stage, so nothing is drawn after it.
    for (const g of grids) {
      const rows = Math.ceil(g.cells.length / g.cols), W_ = g.cols * (g.w + 8) + 8, H_ = 44 + rows * (g.h + 36) + 8;
      await page.viewport(W_, H_);
      await page.evaluate(`document.body.innerHTML = ${JSON.stringify(`<div style="background:#222;color:#eee;font:600 20px Inter,sans-serif;padding:8px;width:${W_ - 16}px"><div style="height:36px">${g.title.replace(/</g, '&lt;')}</div><div style="display:grid;grid-template-columns:repeat(${g.cols},${g.w}px);gap:8px">${g.cells.map((c) => `<div><div style="height:28px;font-size:18px">${c.label}</div><img width="${g.w}" height="${g.h}" src="data:image/jpeg;base64,${c.img}"></div>`).join('')}</div></div>`)}; document.body.style.overflow='visible'; true`);
      fs.writeFileSync(path.join(out, g.file), Buffer.from((await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: W_, height: H_, scale: 1 } })).data, 'base64'));
    }

    // ---- the text files ----
    const sceneHead = (s) => `## ${s.id}${s.attrs?.core ? ' (core)' : ''}: ${fmt(s.start)} to ${fmt(s.start + s.dur)} s\n`;
    write('transcript.md', `# Transcript\n\nWhat the voice says, sentence by sentence, with the still that shows the screen at the end of that sentence. This is all the viewer gets.\n\n` +
      tl.scenes.map((s) => sceneHead(s) + sentences.filter((x) => x.scene === s.id).map((x) => `- ${fmt(x.a)} to ${fmt(x.b)} s: ${x.words.map((w) => w.text).join(' ')}\n  screen: ${x.still}`).join('\n')).join('\n\n') + '\n');

    write('cues.md', `# Cues\n\nEach moment where a scene starts something on a spoken word or a [#marker]. "▶" marks the word spoken at the cue. Each grid shows the screen 0.5 s before the cue, on it, and 0.4 s and 1 s after.\n\n` +
      cues.map((c) => `## ${fmt(c.t)} s, ${c.scene}: ${c.names.join(', ')}\nvoice: ${wordsAround(sceneOf(c.scene), c.tRel)}\ngrid: ${c.file}`).join('\n\n') + '\n');

    const untraced = tl.scenes.filter((s) => !(m.traced[s.id] || []).some((k) => !k.startsWith('text ') && !k.startsWith('tex ')) && !m.moves.some((mv) => mv.scene === s.id)).map((s) => s.id);
    write('motion.md', `# Motion\n\nMeasured from every frame (${fps} frames a second, ${frames.length} frames). Speeds are in stage px a second (the stage is 1920 x 1080). ` +
      `"abrupt" means the movement starts or ends at more than 40 % of its top speed, with no ease. That is correct for a snap style and wrong for a weighted one.\n\n` +
      `Traced: text, formulas, every element moved with set(), and points given with s.trace(). Things drawn on a canvas or in Three.js without s.trace() are not in these numbers: ` +
      (untraced.length ? `scenes with nothing traced that moves: ${untraced.join(', ')}. Use their film strips.` : 'every scene has traced movement.') + '\n\n' +
      `## Flags (${m.flags.length})\n` + (m.flags.length ? m.flags.map((f) => `- ${fmt(f.t)} s, ${f.scene}, ${f.kind}: ${f.msg}`).join('\n') : 'none') + '\n\n' +
      `## Movements (${m.moves.length})\n| scene | item | from s | to s | distance px | top speed px/s | start | end |\n|---|---|---|---|---|---|---|---|\n` +
      m.moves.map((mv) => `| ${mv.scene} | ${mv.k} | ${fmt(mv.a)} | ${fmt(mv.b)} | ${Math.round(mv.dist)} | ${Math.round(mv.peak)} | ${mv.abruptA ? 'abrupt' : 'eased'} | ${mv.abruptB ? 'abrupt' : 'eased'} |`).join('\n') + '\n\n' +
      `## Film strips\n` + film.map((f) => `- ${f.file}: ${f.why}${f.step < 0.05 ? ', frame by frame' : ''}`).join('\n') + '\n');

    const onscreen = {};
    for (const f of frames) for (const it of f.items || []) if (it.isText && it.o > 0.5) { const key = `${f.scene}|${it.text}`; onscreen[key] ??= { scene: f.scene, t: f.t, text: it.text }; }
    write('onscreen.md', `# Text on screen\n\nEvery HTML text and TeX formula, with the first time it is fully visible. Text drawn on a canvas is not here: look at the stills.\n\n` +
      Object.values(onscreen).map((o) => `- ${fmt(o.t)} s, ${o.scene}: ${o.text}`).join('\n') + '\n');

    // Overlaps measured on every frame: text on text, and text on traced things
    // (set() elements and s.trace() points with a size). Canvas drawing that is not
    // traced is not in these numbers: the overlap agent looks at the frames for it.
    const ov = {}, box = (it) => ({ left: it.x - (it.w || 0) / 2, right: it.x + (it.w || 0) / 2, top: it.y - (it.h || 0) / 2, bottom: it.y + (it.h || 0) / 2 });
    for (const f of frames) {
      const its = (f.items || []).filter((it) => it.o > 0.3 && it.w > 0 && it.h > 0);
      for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
        const a = its[i], b = its[j];
        if (!a.isText && !b.isText) continue;
        const A = box(a), B = box(b);
        // A label inside its own box (fully contained, not a text) is the design, not an overlap.
        const inside = (p, q) => p.left >= q.left && p.right <= q.right && p.top >= q.top && p.bottom <= q.bottom;
        if (!(a.isText && b.isText) && (inside(A, B) || inside(B, A))) continue;
        const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (!(w > 6 && h > 6)) continue;
        const key = `${f.scene}|${a.k}|${b.k}`;
        const e = (ov[key] ??= { scene: f.scene, a: a.k, b: b.k, from: f.t, to: f.t, area: 0, at: { x: Math.round(Math.max(A.left, B.left)), y: Math.round(Math.max(A.top, B.top)) } });
        e.to = f.t; if (w * h > e.area) e.area = Math.round(w * h);
      }
    }
    const ovList = Object.values(ov).filter((e) => e.to - e.from >= 1.5 / fps).sort((x, y) => x.from - y.from);
    write('overlaps.md', `# Overlaps\n\nMeasured on every frame: each pair of a text or formula and another text, formula or traced element whose boxes share more than 6 px in both directions, while both are visible (opacity above 0.3). ` +
      `A text that sits fully inside a non-text box (a label in its own box) is not listed. Canvas and Three.js drawing without s.trace() is not measured: look at the frames for those.\n\n` +
      (ovList.length ? `| scene | from s | to s | item A | item B | largest overlap px² | at (x, y) |\n|---|---|---|---|---|---|---|\n` + ovList.map((e) => `| ${e.scene} | ${fmt(e.from)} | ${fmt(e.to)} | ${e.a} | ${e.b} | ${e.area} | ${e.at.x}, ${e.at.y} |`).join('\n') : 'No measured overlaps.') + '\n');
    if (ovList.length) console.log(`WARN ${ovList.length} measured overlap(s): see ${path.join(out, 'overlaps.md')}`);

    const board = fs.existsSync(path.join(dir, 'storyboard.md')) ? fs.readFileSync(path.join(dir, 'storyboard.md'), 'utf8') : '';
    const section = (name) => (board.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm')) || [])[1]?.replace(/^>.*\n?/gm, '').trim();
    const viewer = section('Viewer'), quiz = section('Quiz');
    if (!viewer || !quiz) console.log('WARN storyboard.md has no "## Viewer" or "## Quiz" section. The learner agent needs both.');
    write('quiz.md', `# You, the viewer\n\n${viewer || '(not given)'}\n\n# Questions\n\nAnswer from the video only, and give the time where the video taught you.\n\n${quiz || '(not given)'}\n`);

    const sheets = fs.readdirSync(path.join(dir, 'build')).filter((f) => /^sheet-\d+\.png$/.test(f));
    const stale = !sheets.length || fs.statSync(path.join(dir, 'build', sheets[0])).mtimeMs < fs.statSync(path.join(dir, 'scenes.js')).mtimeMs;
    if (stale) console.log('WARN contact sheets are missing or older than scenes.js. Run "sheet" before the overall review.');
    write('README.md', `# Review pack: ${tl.title || slug(dir)}\n\n${fmt(tl.duration)} s, ${tl.scenes.length} scenes, made ${new Date().toISOString().slice(0, 16)}. Times are seconds from the start of the video.\n\n` +
      `| File | What | Read by |\n|---|---|---|\n` +
      `| transcript.md + stills/ | each sentence and the screen at its end | learner, fact checker |\n` +
      `| quiz.md | who the viewer is, and the questions | learner |\n` +
      `| cues.md + cues/ | each cue: the words, and the screen before, on and after it | alignment |\n` +
      `| motion.md + film/ | movements, flags, frame-by-frame strips | physics |\n` +
      `| onscreen.md | all text and formulas on screen | fact checker, overall, overlap |\n` +
      `| overlaps.md | every measured overlap of text with text or with traced elements, frame by frame | overlap |\n` +
      `| ../sheet-*.png | contact sheets, 3 frames a scene | overall |\n` +
      `| ../../script.md, ../../storyboard.md, ../../scenes.js | the plan and the code | everyone except the learner |\n` +
      (errors.size ? `\nScene errors while tracing:\n${[...errors].map((e) => `- ${e}`).join('\n')}\n` : ''));
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(`${out}\n${sentences.length} sentence stills, ${cues.length} cue grids, ${film.length} film strips, ${m.moves.length} movements, ${m.flags.length} motion flags, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  });
}

// ---------- preview ----------
async function preview() {
  const dir = projectDir(positional()[0]);
  timeline(dir);
  const srv = await serve(dir);
  console.log(`preview: ${srv.url}  (Ctrl-C to stop)`);
}

// One shot: every mechanical step in order, stopping at the first one that fails.
function steps(names) {
  const d = positional()[0] || '.';
  for (const n of names) {
    console.log(`\n=== ${n} ===`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...n.split(' '), d], { stdio: 'inherit' });
    if (r.status !== 0) die(`stopped at "${n}". Fix it, then run the same command again: finished steps are cached.`);
  }
}
const build = () => steps(['voice', 'manim', 'check', 'sheet', 'review']);
const final = () => steps(['render', 'verify']);

async function subtitlesCmd() {
  const dir = projectDir(positional()[0]);
  subtitles(dir, timeline(dir));
  const issues = subtitleIssues(path.join(dir, 'build', 'subtitles.srt'));
  for (const i of issues) console.log(`WARN ${i}`);
  if (!issues.length) console.log('subtitles: one line per cue, no problems found');
}
const commands = { doctor, config, init, build, final, voice, subtitles: subtitlesCmd, manim, check, sheet, still, review, render, verify, preview };
if (!commands[cmd]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 18).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 1 : 0); }
await commands[cmd]();
if (cmd !== 'preview') process.exit(0);
