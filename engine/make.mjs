#!/usr/bin/env node
// The Kaleidoscope command line. It takes a project folder (script.md,
// scenes.js, video.json) and gives you a narrated MP4 with soft subtitles.
//
//   node make.mjs doctor                    check Chrome, ffmpeg, explainroo, MathJax
//   node make.mjs config [--voice auto|chatterbox|kokoro] [--gpu auto|off] [--whisper base|large]
//   node make.mjs init <dir> --title "..."  new project with learning-pace voice settings
//   node make.mjs build [dir]               voice, manim, check, sheet, review: every step before you look
//   node make.mjs final [dir]               render, verify
//   node make.mjs voice [dir] [--again]     narration + word timings (explainroo) + pacing report; skips an unchanged script
//   node make.mjs manim [dir] [--scene id] [--all] [--draft]   render changed Manim scenes to frames
//   node make.mjs check [dir]               scene errors, missing cues, text outside the safe area, pacing
//   node make.mjs sheet [dir] [--scene id] [--every s]   contact sheets to build/sheet-N.png
//   node make.mjs stable [dir] [--every s]  draws each sampled frame twice: a frame that differs is a GPU drop-out
//   node make.mjs still [dir] <t|scene|scene@t|scene@end|scene@#mark|scene@word> ...
//   node make.mjs review [dir] [--fps n]    build/review/: motion flags, measured overlaps and a grid at each cue
//   node make.mjs bake [--only mascot|models|a,b]   compute the clay shapes once, to styles/library/clay/cache
//   node make.mjs attached                  measures that every part of every model touches the rest
//   node make.mjs clay [sheet]              vetting sheets of the mascot and models, to styles/library/clay/sheets
//   node make.mjs zones [dir] [--scene a,b]   where the 3D is in each clay scene, and the free boxes for formulas
//   node make.mjs look [dir] [--scene a,b]  after each edit: measure the changed scenes, draw their near frames and moving parts
//   node make.mjs look [dir] --ok <digits>  the CHECK digit of each image, in order: "build" can run. --moving-ok <digits>: the same for the strips of a build: "final" can run
//   node make.mjs collide [dir] [--scene a,b]   only the measures: mascot, objects and text against each other
//   node make.mjs selftest                  plants each known fault, and confirms that the engine catches it
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
import { sfxTrack, lint as sfxLint, timelineWords, writeWav as writeSfxWav } from './sfx.mjs';
import { sayable, editDistance, extraWords, missingLetters, twoBars } from './voicecheck.mjs';

const ENGINE = path.dirname(fileURLToPath(import.meta.url));
const EXR = process.env.EXPLAINROO_HOME || path.join(os.homedir(), '.explainroo');
const CHROME = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find((c) => spawnSync('which', [c]).status === 0);
// The settings of this machine, written by "make config", the installer or /setup-kaleidoscope.
// config.json is not in git. voice: chatterbox (natural, best on a GPU), kokoro (small, fast on a CPU)
// or auto. gpu: auto or off. whisper: base (small, fast, explainroo's own) or large (large-v3-turbo,
// more exact word times and voice checks; needs faster-whisper in engine/tts/.venv, about 1.6 GB).
const CONFIG_FILE = path.join(ENGINE, '..', 'config.json');
const CONFIG_DEFAULT = { voice: 'auto', gpu: 'auto', whisper: 'base', kokoroVoice: 'af_heart' };
const CONFIG_CHOICES = { voice: ['auto', 'chatterbox-turbo', 'chatterbox', 'kokoro'], gpu: ['auto', 'off'], whisper: ['base', 'large'] };
const readConfig = () => { try { return { ...CONFIG_DEFAULT, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { return { ...CONFIG_DEFAULT }; } };
const CONFIG = readConfig();

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (k) => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const positional = () => {
  const out = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (!['--draft', '--all', '--remix', '--again'].includes(argv[i])) i++; continue; }
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
// musicVolume 0.37: the user raised the music by 3 dB on 2026-11-02 (it was 0.26).
// Workers from the machine (Remotion's rule, get-concurrency.ts: half the cores, at most 8), and only as many
// as free memory allows (HyperFrames' parallelCoordinator): about 1.2 GB for each Chrome page at 1080p.
const autoWorkers = () => Math.max(1, Math.min(8, Math.round(os.cpus().length / 2), Math.floor(os.freemem() / (1.2 * 2 ** 30))));
const renderCfg = (dir) => ({ music: true, musicVolume: 0.37, sfx: false, sfxVolume: 1, workers: autoWorkers(), ...(JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'))._render || {}) });
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
  if (v === 'chatterbox' || v === 'kokoro' || v === 'chatterbox-turbo') return v;
  return fs.existsSync(TURBO_PY) ? 'chatterbox-turbo' : fs.existsSync(TTS_PY) ? 'chatterbox' : 'kokoro';
}

// ---------- config ----------
// make config                         print this machine's settings
// make config --voice kokoro --gpu off    change them
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
  console.log(`voice   ${cur.voice}${cur.voice === 'auto' ? ` (now: ${fs.existsSync(TTS_PY) ? 'chatterbox' : 'kokoro'})` : ''}${cur.voice !== 'chatterbox' ? `, Kokoro voice ${cur.kokoroVoice}` : ''}\ngpu     ${cur.gpu}\nwhisper ${cur.whisper}${cur.whisper === 'large' ? ' (large-v3-turbo)' : ' (base.en)'}\nfile    ${CONFIG_FILE}${fs.existsSync(CONFIG_FILE) ? '' : ' (not written yet: these are the defaults)'}`);
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
  const needCb = voiceEngine().startsWith('chatterbox');
  line(!needCb || (!!cb && cb.status === 0), 'chatterbox', !needCb && !(cb && cb.status === 0) ? 'not used: the voice is Kokoro (make config)' : cb && cb.status === 0 ? `voice (GPU: ${cb.stdout.trim() === 'True' ? 'yes' : 'no, slow on CPU'}${shared ? "; PyTorch shared from another environment" : ''})` : shared ? "fails: it uses another environment's PyTorch (shared-torch), which changed or is gone. See INSTALL.md" : 'not installed: see README.md');
  line(spawnSync('which', ['latex']).status === 0 && spawnSync('which', ['dvisvgm']).status === 0, 'latex', 'latex + dvisvgm, for Manim formulas', true);
  if (fs.existsSync(EXR)) {
    const r = spawnSync('node', [path.join(EXR, 'bin', 'explainroo.js'), 'doctor'], { encoding: 'utf8' });
    for (const l of (r.stdout + r.stderr).split('\n')) if (/speech check/.test(l)) line(l.startsWith('ok'), 'whisper', l.replace(/^\S+\s+\S+(\s\S+)?\s+/, ''));
  }
  const g = gpu();
  if (CONFIG.whisper === 'large') {
    const fw = fs.existsSync(TTS_PY) && spawnSync(TTS_PY, ['-c', 'import faster_whisper'], { encoding: 'utf8' }).status === 0;
    line(fw, 'whisper big', fw ? 'large-v3-turbo through faster-whisper (word timing and voice checks)' : 'faster-whisper is missing in engine/tts/.venv: pip install faster-whisper, or "make config --whisper base"');
  }
  console.log(`info settings     voice ${voiceEngine()}, frames by ${g.renderer}, encode ${encName(g)}`);
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
// Chatterbox-Turbo has its own environment: the main one may share PyTorch with another environment (see INSTALL.md).
const TURBO_PY = path.join(ENGINE, 'tts', '.venv-turbo', 'bin', 'python');
// What Whisper hears in a spoken part (cached next to it).
const LARGE_WHISPER = 'large-v3-turbo', HEAR = path.join(ENGINE, 'tts', 'hear.py');
const largeWhisper = () => CONFIG.whisper === 'large' && fs.existsSync(TTS_PY);
// With the large Whisper, all new takes of a round are heard in one run, so the model loads once.
function hearAll(raws) {
  if (!largeWhisper()) return;
  const todo = raws.filter((r) => !fs.existsSync(r.replace(/\.wav$/, `.heard-${LARGE_WHISPER}.json`)));
  if (!todo.length) return;
  const list = path.join(os.tmpdir(), `xv-hear-${process.pid}.json`);
  fs.writeFileSync(list, JSON.stringify(todo));
  const r = spawnSync(TTS_PY, [HEAR, list, LARGE_WHISPER], { stdio: 'inherit' });
  fs.rmSync(list, { force: true });
  if (r.status !== 0) die('the large Whisper failed (see above). "make config --whisper base" goes back to the small one.');
}
async function heardWords(raw) {
  if (largeWhisper()) { hearAll([raw]); return JSON.parse(fs.readFileSync(raw.replace(/\.wav$/, `.heard-${LARGE_WHISPER}.json`), 'utf8')); }
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
  return { d, extra: [...extraWords(part.text, heard.map((w) => w.text)), ...missingLetters(part.text, heard.map((w) => w.text)).map((w) => `missing ${w}`)], heard: heard.map((w) => w.text).join(' '), clauses };
}

async function chatterbox(dir, shadow, cfg, turbo = false) {
  const PY = turbo ? TURBO_PY : TTS_PY;
  if (!fs.existsSync(PY)) die(`Chatterbox${turbo ? '-Turbo' : ''} is not installed. See README.md ("Voice").`);
  const { parseScript } = await import(pathToFileURL(path.join(EXR, 'src', 'script.js')).href);
  // The user chose these by ear: see the header of engine/tts/chatterbox_voice.py.
  const t = { exaggeration: 0.5, cfg_weight: 0.5, temperature: 0.8, seed: 7, stopGap: 0.6, commaMax: 0.3, paragraphGap: 1.0, retakes: 3, ...cfg._tts, ...(turbo ? { model: 'turbo' } : {}) };
  delete t.engine;
  const scriptText = fs.readFileSync(path.join(dir, 'script.md'), 'utf8'), bars = twoBars(scriptText);
  if (bars.length) die(`a {shown|spoken} has a second bar, so the voice reads the wrong text: ${bars.join(', ')}. Write "∣" (U+2223) for the bar in the shown part, for example {p(x∣ω_i)|p of x, given omega i}.`);
  const script = parseScript(scriptText);
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
  // Parts that used all their retakes, by the hash of their text. A later run does not retake them again
  // while the text stays the same (the computed torque video retook 3 unchanged parts on each of 4 runs).
  const doneFile = path.join(shadow, 'exhausted.json'), exhausted = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};
  const textKey = (p) => createHash('sha1').update(p.text).digest('hex').slice(0, 12);
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
      // The same letter spelt out two or more times ("E E E") becomes "E, E, E" below, and the
      // voice read it as "e, ee" in video 1, which Whisper still writes as "EEE".
      const twin = x.text.match(/\b([a-z])(?: \1\b)+/i);
      if (twin) console.log(`WARN voice ${x.id}: "${twin[0]}" repeats one letter, and the voice reads it badly. Say a word instead, for example {EEE|triple E}.`);
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
  const fixed = (p) => t.seeds?.[p.id] !== undefined || t.seeds?.[p.id.split('#')[0]] !== undefined || exhausted[p.id] === textKey(p);
  let median = 0;
  const score = (r) => (r.d >= 3 || r.extra?.length ? 1e6 + r.d : 0) + Math.max(0, ...r.clauses.map((c) => c.rate / median));
  for (let round = 0; ; round++) {
    fs.writeFileSync(jobs, JSON.stringify({ params, cache: path.join(dir, 'build', 'tts-cache'), scenes }, null, 1));
    const r = spawnSync(PY, [path.join(ENGINE, 'tts', 'chatterbox_voice.py'), jobs], { stdio: 'inherit' });
    if (r.status !== 0) die('Chatterbox failed (see above)');
    const done = JSON.parse(fs.readFileSync(jobs + '.out.json', 'utf8')).scenes.flatMap((sc) => sc.parts);
    hearAll(done.map((p) => p.raw));
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
        if (best.d >= 3 || best.extra?.length) console.log(`WARN voice ${p.id}: after ${round} retake(s) it still says something else${best.extra?.length ? ` (words that do not match the script: ${best.extra.join(', ')})` : ''}.\n  script: ${p.text}\n  heard:  ${best.heard}\n  If only the spelling differs, ignore this. Otherwise reword the part or set a seed in video.json ("_tts": {"seeds": {"${p.id}": 20}}).`);
        const why = fixed(p) ? (exhausted[p.id] === textKey(p) ? 'it used its retakes in an earlier run, and its text is the same' : 'its seed is set by hand in video.json, so it was not retaken') : `after ${round} retake(s)`;
        if (!fixed(p) && round >= t.retakes) exhausted[p.id] = textKey(p);
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
  fs.writeFileSync(doneFile, JSON.stringify(exhausted, null, 1));
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

// The pace of each scene from the script text alone, before any voice is made (the user asked, 2026-11-09:
// 3 voice runs of 10 to 25 min each went to fixing the pace limit after the voice existed). The voice length
// is fitted on 121 scenes of 7 Chatterbox videos: 0.173 s a syllable (a symbol word counts 2), 0.70 s a full
// stop, 0.35 s a comma, 1.15 s a scene, plus every [pause] and 1 s a paragraph break. Mean error 3.6 % of the
// length, about 5 words a minute. So an estimate over the limit + 2 stops the voice, and over limit - 5 WARNs.
function paceEstimate(dir) {
  const text = fs.readFileSync(path.join(dir, 'script.md'), 'utf8'), out = [];
  for (const part of text.split(/^## /m).slice(1)) {
    const [head, ...rest] = part.split('\n'), id = head.split(/[\s{]/)[0], core = /core=yes/.test(head);
    const body = rest.filter((l) => !l.startsWith('>')).join('\n');
    const pauses = [...body.matchAll(/\[pause\s*([\d.]*)\]/g)].reduce((a, m) => a + (+m[1] || 1), 0);
    const paras = body.trim().split(/\n\s*\n/).filter((x) => x.trim()).length - 1;
    const spoken = body.replace(/\{[^|}]*\|([^}]*)\}/g, '$1').replace(/\[[^\]]*\]/g, ''), words = spoken.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const syl = words.reduce((k, w) => { const c = w.replace(/[^\w]/g, ''); return k + (!c ? 0 : SYMBOL.test(c) ? 2 : Math.max(1, (c.toLowerCase().match(/[aeiouy]+/g) || []).length)); }, 0);
    const stops = (spoken.match(/[.!?](\s|$)/g) || []).length, commas = (spoken.match(/,/g) || []).length;
    const dur = 0.1729 * syl + 0.6973 * stops + 0.3451 * commas + 1.1525 + pauses + paras;
    // Clauses packed with symbol words came out "fast" and were retaken up to 3 times.
    const dense = spoken.split(/[.!?;:]/).map((c) => c.trim().split(/\s+/).filter(Boolean)).filter((c) => c.length >= 5 && c.filter((w) => SYMBOL.test(w.replace(/[^\w]/g, ''))).length / c.length >= 0.4).map((c) => c.join(' '));
    out.push({ id, core, dur, wpm: words.length / (dur / 60), limit: core ? 145 : 170, dense });
  }
  return out;
}
function paceReport(dir) {
  const est = paceEstimate(dir), stop = [];
  console.log('pace (estimated from the text, before any voice)');
  for (const e of est) {
    console.log(`${e.id.padEnd(20)} ${e.core ? 'core' : '    '} ${e.dur.toFixed(1).padStart(6)} s ${String(Math.round(e.wpm)).padStart(5)} wpm`);
    if (e.wpm > e.limit + 15) stop.push(`${e.id}: about ${Math.round(e.wpm)} words a minute, over the limit of ${e.limit}. Cut words or add [pause 0.8] after key statements, before the voice is made`);
    else if (e.wpm > e.limit - 5) console.log(`WARN ${e.id}: about ${Math.round(e.wpm)} words a minute, near or over the limit of ${e.limit} (the estimate is good to about 8)`);
    for (const c of e.dense) console.log(`WARN ${e.id}: a clause that is mostly symbol words, likely to come out fast: "${c.slice(0, 70)}". Give each symbol its own short sentence`);
  }
  return stop;
}
async function pace() { const stop = paceReport(projectDir(positional()[0])); for (const x of stop) console.log(`ERROR ${x}`); process.exit(stop.length ? 1 : 0); }

async function voice() {
  const dir = projectDir(positional()[0]);
  if (!flag('--skip-pace')) { const stop = paceReport(dir); if (stop.length) { for (const x of stop) console.log(`ERROR ${x}`); die('voice: fix the pace first (no voice was made). --skip-pace makes it anyway.'); } }
  const shadow = path.join(dir, 'build', '_voice');
  fs.mkdirSync(shadow, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  // An unchanged script keeps its voice. A new run moves cue times by itself, so it would make a look wrong.
  const stampFile = path.join(dir, 'build', 'voice.stamp'), stampNow = createHash('sha1').update(fs.readFileSync(path.join(dir, 'script.md'))).update(JSON.stringify([cfg._tts || {}, cfg.fps, cfg.lead, cfg.hold, cfg.end, CONFIG.whisper])).digest('hex');
  if (!flag('--again') && fs.existsSync(path.join(dir, 'build', 'timeline.json')) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stampNow) return console.log('voice: script unchanged, so the voice stays. Use --again to make it again.');
  fs.copyFileSync(path.join(dir, 'script.md'), path.join(shadow, 'script.md'));
  // explainroo keeps each scene's word times by the recording, not by the model: a new Whisper times again.
  const vdir = path.join(dir, 'build', 'voice'), mark = path.join(vdir, 'whisper.txt'), want = largeWhisper() ? LARGE_WHISPER : 'base.en';
  if (fs.existsSync(vdir) && (fs.existsSync(mark) ? fs.readFileSync(mark, 'utf8') : 'base.en') !== want) for (const f of fs.readdirSync(vdir)) if (f.endsWith('.json')) fs.rmSync(path.join(vdir, f));
  fs.mkdirSync(vdir, { recursive: true }); fs.writeFileSync(mark, want);
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
  const spoken = engine === 'kokoro' ? { ...cfg, voice: cfg._tts?.kokoroVoice || CONFIG.kokoroVoice, speed: cfg._tts?.speed ?? 0.78 } : await chatterbox(dir, shadow, cfg, engine === 'chatterbox-turbo');
  fs.writeFileSync(path.join(shadow, 'video.json'), JSON.stringify(spoken, null, 2));
  // The large Whisper also times the words: asr-hook.mjs changes explainroo's transcribeWords.
  const hook = largeWhisper() ? ['--import', pathToFileURL(path.join(ENGINE, 'asr-hook.mjs')).href] : [];
  const r = spawnSync('node', [...hook, path.join(EXR, 'bin', 'explainroo.js'), 'voice', shadow], { stdio: 'inherit',
    env: { ...process.env, XV_TTS_PY: TTS_PY, XV_HEAR: HEAR, XV_WHISPER_MODEL: LARGE_WHISPER } });
  if (r.status !== 0) die('explainroo voice failed (see above)');
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'build', 'timeline.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'build', 'timeline.js'), `window.TIMELINE = ${JSON.stringify(tl)};\n`);
  narration(dir, tl);
  subtitles(dir, tl);
  pacing(tl, true);
  pauses(tl, true);
  fs.writeFileSync(stampFile, stampNow);
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
// The sound effects that the scenes declare with s.sfx(): seek each scene once (that runs its
// setup) and read them. Cached in build/sfx.json until scenes.js or the timeline changes.
async function sfxEvents(dir, tl) {
  const file = path.join(dir, 'build', 'sfx.json');
  const key = createHash('sha1').update(fs.readFileSync(path.join(dir, 'scenes.js'))).update(fs.readFileSync(path.join(dir, 'build', 'timeline.json'))).digest('hex');
  try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.key === key) return c.events; } catch { /* make it below */ }
  let events = [];
  await withPage(dir, async (page) => {
    for (const s of tl.scenes) await page.evaluate(`seek(${s.start + 0.01})`);
    events = Object.values(await page.evaluate('window.__sfx || {}'));
  });
  events.sort((a, b) => a.t - b.t);
  fs.writeFileSync(file, JSON.stringify({ key, events }, null, 1));
  return events;
}
// The SFX bus at the video's length (engine/sfx.mjs), made again only when it changes.
function sfxBus(dir, tl, events) {
  const file = path.join(dir, 'build', 'sfx.wav'), stamp = path.join(dir, 'build', 'sfx.stamp');
  const key = createHash('sha1').update(JSON.stringify(events)).update(String(tl.duration)).update(fs.readFileSync(path.join(ENGINE, 'sfx.mjs'))).digest('hex');
  if (fs.existsSync(file) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) return file;
  writeSfxWav(file, sfxTrack(events, tl.duration, { words: timelineWords(tl) }));
  fs.writeFileSync(stamp, key);
  return file;
}

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
      else if (u.pathname.startsWith('/_lib/')) {   // the shared visual library
        // A project from before the classic styles moved imports '/_lib/flat.js': serve it from classic/.
        const lib = path.join(ENGINE, '..', 'styles', 'library'), own = inside(lib, u.pathname.slice(5));
        file = own && fs.existsSync(own) ? own : inside(path.join(lib, 'classic'), u.pathname.slice(5));
      }
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
// A Mac (Apple silicon or AMD) draws with Metal and encodes with VideoToolbox. Not tested on a Mac yet:
// the probe below falls back to the CPU path when Chrome does not get the GPU.
const MAC = process.platform === 'darwin';
const GPU_FLAGS = MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
  : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--ozone-platform=headless'];
const GPU_ENV = MAC ? {} : NV_ENV;
const encName = (g) => (g.nvenc ? 'NVENC (GPU)' : g.vt ? 'VideoToolbox (GPU)' : 'libx264 (CPU)');
const CPU_FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
let gpuMemo;
function gpu() {
  if (gpuMemo) return gpuMemo;
  if (process.env.XV_GPU === '0' || CONFIG.gpu === 'off' || !CHROME) return (gpuMemo = { chrome: false, nvenc: false, vt: false, renderer: 'SwiftShader (CPU)' });
  const ver = (spawnSync(CHROME, ['--version'], { encoding: 'utf8' }).stdout || '').trim().replace(/\W+/g, '_');
  const cache = path.join(os.tmpdir(), `xv-gpu-${ver}.json`);
  try { return (gpuMemo = JSON.parse(fs.readFileSync(cache, 'utf8'))); } catch { /* probe below */ }
  // Probe: does WebGL get the NVIDIA GPU with these flags?
  const page = 'data:text/html,' + encodeURIComponent("<body><script>const g=document.createElement('canvas').getContext('webgl');const e=g&&g.getExtension('WEBGL_debug_renderer_info');document.body.textContent='R='+(e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'none')</script>");
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'xv-gpu-probe-'));
  const r = spawnSync(CHROME, ['--headless=new', '--no-sandbox', `--user-data-dir=${prof}`, ...GPU_FLAGS, '--dump-dom', page], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...GPU_ENV } });
  fs.rmSync(prof, { recursive: true, force: true });
  const renderer = ((r.stdout || '').match(/R=([^<]*)/) || [])[1] || 'none';
  const chromeGpu = /nvidia|geforce|rtx/i.test(renderer) || (MAC && /apple|metal|amd|radeon/i.test(renderer));
  const nvenc = /h264_nvenc/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout || '')
    && spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x144:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-']).status === 0;
  const vt = MAC && !nvenc && spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x144:d=0.2', '-c:v', 'h264_videotoolbox', '-f', 'null', '-']).status === 0;
  gpuMemo = { chrome: chromeGpu, nvenc, vt, renderer: chromeGpu ? renderer : 'SwiftShader (CPU)' };
  try { fs.writeFileSync(cache, JSON.stringify(gpuMemo)); } catch { /* no cache */ }
  return gpuMemo;
}

// ---------- Chrome over the DevTools protocol ----------
async function chrome(url, { width = 1920, height = 1080, page = '/?render=1', video = true } = {}) {
  if (!CHROME) die('no Chrome found; set CHROME=/path/to/chrome');
  // Outside any repo: the profile holds symlinks that trip tools walking the tree.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xv-chrome-'));
  // Port 0: Chrome picks a free port and writes it to DevToolsActivePort. A random port
  // once collided between two render workers; both then drove one browser and the video
  // showed the formula scene inside the hook.
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    // The GPU when the probe found one (see gpu()), else WebGL in software (SwiftShader).
    ...(gpu().chrome ? GPU_FLAGS : CPU_FLAGS), '--force-color-profile=srgb',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore', env: gpu().chrome ? { ...process.env, ...GPU_ENV } : process.env });
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
  await send('Page.navigate', { url: `${url}${page}` });
  if (video) {
    for (let i = 0; i < 200 && (await evaluate('typeof window.seek').catch(() => '')) !== 'function'; i++) await new Promise((r) => setTimeout(r, 50));
    await evaluate('seek(0)');
    await evaluate('document.fonts.ready.then(() => true)');
  }
  // A capture with a clip and a scale below 1 can show the canvas of an earlier seek:
  // a review grid showed shapes from later in a scene "flashing" on frames before
  // their cue, a flicker that the render did not have (tested: same frames, full-size
  // stills clean, scaled strips wrong, twice in a row). So the sheets and the review
  // grids capture at full size and let their grid page scale the image down.
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
    if (!every && !only) times.push([s.id, s.start + Math.max(s.dur * 0.65, s.dur - 1.4)]);   // the last picture, before the end wipe or iris
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

// Narration that only reads symbols: three sentences in a row with symbols and no plain sentence.
function formulaRuns(script) {
  const out = [];
  const isSymbol = (shown) => !/^[A-Z][A-Za-z0-9]+$/.test(shown) && !/^[\d.,()\s-]+$/.test(shown);
  for (const part of script.split(/^## /m).slice(1)) {
    const id = part.split(/[\s{]/)[0], body = part.split('\n').slice(1).filter((l) => !l.startsWith('>')).join(' ').replace(/\[[^\]]*\]/g, ' ');
    let run = 0, count = 0, first = '';
    for (const raw of body.split(/(?<=[.!?])\s+/)) {
      const syms = [...raw.matchAll(/\{([^}|]+)\|[^}]+\}/g)].filter((m) => isSymbol(m[1])).length;
      // A sentence with enough plain words explains something, even if it also names a symbol.
      const plain = raw.replace(/\{[^}]*\}/g, ' ').toLowerCase().match(/[a-z]{2,}/g)?.filter((w) => !['equals', 'plus', 'minus', 'times', 'over', 'is', 'and', 'so', 'the', 'to', 'of', 'at', 'we', 'get', 'with', 'then', 'here', 'this', 'that'].includes(w)).length || 0;
      if (!syms || plain >= 6) { run = 0; count = 0; continue; }
      if (!run) first = raw.replace(/\{([^}|]+)\|[^}]+\}/g, '$1').trim();
      run++; count += syms;
      if (run === 3 && count >= 4) { out.push(`${id}: three sentences in a row only read symbols, from "${first.slice(0, 60)}". Say what the terms mean in plain words (reference/script.md, "Formulas")`); break; }
    }
  }
  return out;
}
// A Manim scene with formulas and nothing else to look at.
function manimFormulaAlone(dir) {
  const f = path.join(dir, 'manim_scenes.py');
  if (!fs.existsSync(f)) return [];
  const pic = /\b(Axes|NumberPlane|ThreeDAxes|Surface|Arrow|Vector|Dot|Circle|Square|Rectangle|Polygon|Line|Sphere|Cube|Arc|plot|ImageMobject|SVGMobject)\b/;
  return fs.readFileSync(f, 'utf8').split(/^class /m).slice(1).filter((c) => /\b(MathTex|Tex)\s*\(/.test(c) && !pic.test(c)).map((c) => `${c.split(/[\s(]/)[0]} (Manim): a formula with no picture (reference/script.md, "Formulas")`);
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
        // Maths in a plain text label looks like notes, not a formula (the user saw "ωres = 16 → ωn = 8" at 10:00 of the
        // computed torque video). Typeset it with eqn() or s.tex().
        for (const m of await page.evaluate(`[...document.querySelectorAll('[data-text="1"]')].filter((n) => n.closest('.scene')?.style.display !== 'none' && /[ωζθβτλσμπΣ∫≤≥∂∇→]|[₀-₉ₐ-ₜ]|\\b[kK][pvi]\\b|\\b\\w+\\s*=\\s*-?\\d/.test(n.textContent)).map((n) => n.textContent.trim().slice(0, 40))`)) layout.add(`${s.id}: "${m}" is maths in a plain text label. Typeset it with eqn() or s.tex()`);
      }
    }
    for (const f of await page.evaluate('window.__fits()')) layout.add(`${f.scene}: auto-fit ${f.k < 0.999 ? `shrank "${f.label}" to ${Math.round(f.k * 100)} %` : `moved "${f.label}" ${Math.round(f.d)} px`} into the safe area (${fmt(f.from)} to ${fmt(f.to)} s). Place it there yourself`);
    for (const e of await page.evaluate('window.__errors')) problems.add(e.split('\n')[0]);
    const looks = await page.evaluate('window.__looks()');
    for (const l of looks.filter((x) => x.texAlone)) layout.add(`${l.id}: a formula with no picture. Show what it does with an object, and name each term on that object (reference/script.md, "Formulas")`);
    // The clay look (styles/clay.md): every scene in 3D, and the mascot in the video.
    if (JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'))._look === 'clay') {
      // A Manim scene passes: a curve or a plot is a Manim part on its dark background (the user asked).
      const flat = looks.filter((x) => !x.has3d && !x.manim).map((x) => x.id);
      if (flat.length) problems.add(`not in 3D: ${flat.join(', ')}. Use s.clay(), or manim() for a part whose picture is a curve or a plot`);
      if (!looks.some((x) => x.mascot)) problems.add('the mascot is in no scene. Add g.mascot() (styles/clay.md)');
      const none = looks.filter((x) => !x.mascot && !x.manim).map((x) => x.id);
      if (none.length) layout.add(`the mascot is not in: ${none.join(', ')}`);
      const still = looks.filter((x) => x.heroTravel !== null && x.heroTravel < 0.5).map((x) => x.id);
      if (still.length) layout.add(`the mascot stays in one spot in: ${still.join(', ')}. Have him walk, pull, push or carry something (styles/clay.md)`);
    }
    // Sound effects: too many, two accents close together, an accent on a word.
    if (renderCfg(dir).sfx) for (const w of sfxLint(Object.values(await page.evaluate('window.__sfx || {}')), timelineWords(tl))) layout.add(`sfx ${w}`);
  });
  for (const m of voiceMatchIssues(dir, tl)) problems.add(m);
  const script = fs.readFileSync(path.join(dir, 'script.md'), 'utf8');
  if (/[\u2013\u2014]/.test(script.replace(/^>.*$/gm, ''))) problems.add('script.md has an en or em dash in narration. The voice reads them badly: use a full stop or a comma.');
  for (const w of formulaRuns(script)) layout.add(w);
  for (const w of manimFormulaAlone(dir)) layout.add(w);
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
    : gpu().vt ? ['-c:v', 'h264_videotoolbox', '-b:v', draft ? '10M' : '24M', '-maxrate', draft ? '14M' : '32M', '-profile:v', 'high', '-allow_sw', '1']
    : ['-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', draft ? '26' : '17', '-profile:v', 'high', '-x264-params', 'weightp=0']),
  // A keyframe every second and no B-frames, so a seek in VLC never shows smeared colour blocks.
  '-g', String(fps), '-keyint_min', String(fps), '-bf', '0',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

async function render() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), cfg = renderCfg(dir);
  requireManim(dir);
  const track = cfg.music === true ? 'current' : cfg.music;
  const musicFile = track ? musicTrack(dir, track, tl.duration) : null;
  const sfxFile = cfg.sfx ? sfxBus(dir, tl, await sfxEvents(dir, tl)) : null;
  const draft = flag('--draft'), fps = tl.fps;
  { const g = gpu(); console.log(`render: frames drawn by ${g.renderer}; encode ${encName(g)}`); }
  const from = +opt('--from', 0), to = Math.min(+opt('--to', tl.duration), tl.duration);
  const partial = argv.includes('--from') || argv.includes('--to');
  const total = Math.round((to - from) * fps);
  const workers = Math.max(1, Math.min(+opt('--workers', cfg.workers), Math.ceil(total / (fps * 2))));
  const partsDir = path.join(dir, 'build', 'parts');
  const silent = path.join(dir, 'build', 'video.mp4');
  // --remix: new audio (music track or level, voice) on the frames of the last full render.
  const remix = flag('--remix');
  if (remix && (partial || draft || !fs.existsSync(silent))) die('--remix needs a full render first (no --draft, --from or --to)');
  if (!partial && !draft && !remix) renderGate(dir, tl);
  if (!remix) {
  fs.rmSync(partsDir, { recursive: true, force: true });
  fs.mkdirSync(partsDir, { recursive: true });
  const srv = await serve(dir);
  const t0 = Date.now();
  let done = 0;
  const errors = new Set();
  // Tasks. A Manim stretch (from HyperFrames' static-frame reuse) does not screenshot each frame: the page draws
  // only its overlay (header, wipe), screenshots it when it changes, and ffmpeg lays it over Manim's own frames.
  // Everything else is drawn by Chrome as before. --no-fast turns the Manim path off; a draft never uses it.
  const sceneOf = (T) => tl.scenes.find((x) => T >= x.start - 1e-6 && T < x.start + x.dur - 1e-6) || tl.scenes[tl.scenes.length - 1];
  let manimIds = [];
  if (!draft && !flag('--no-fast')) { const p0 = await chrome(srv.url); try { manimIds = await p0.evaluate('window.manimScenes()'); } finally { await p0.close(); } }
  const segs = [];
  for (let f = 0; f < total; f++) {
    const sc = sceneOf(from + f / fps), kind = manimIds.includes(sc.id) ? `manim:${sc.id}` : 'chrome', last = segs[segs.length - 1];
    if (last && last.kind === kind) last.b = f + 1; else segs.push({ kind, a: f, b: f + 1 });
  }
  const chromeFrames = segs.filter((x) => x.kind === 'chrome').reduce((n, x) => n + x.b - x.a, 0);
  const piece = Math.max(fps * 2, Math.ceil(chromeFrames / workers));
  const tasks = [];
  for (const sg of segs) {
    if (sg.kind !== 'chrome') { tasks.push({ ...sg, id: sg.kind.slice(6) }); continue; }
    for (let a = sg.a; a < sg.b; a += piece) tasks.push({ kind: 'chrome', a, b: Math.min(sg.b, a + piece) });
  }
  const enc = X264(fps, draft), encVf = enc[1], encRest = enc.slice(2);
  const partOf = (t) => path.join(partsDir, `part_${String(t.a).padStart(7, '0')}.mp4`);
  const drawChrome = async (page, t) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...enc, partOf(t)], { stdio: ['pipe', 'inherit', 'inherit'] });
    try {
      // Warm-up: on the GPU path the first frame a fresh page draws of a WebGL scene can miss objects whose
      // shaders are not ready yet. So each task draws and captures its first frame once and throws it away.
      await page.evaluate(`seek(${from + t.a / fps})`); await page.shot({ format: 'jpeg', quality: 50, scale: draft ? 0.5 : 1 });
      for (let i = t.a; i < t.b; i++) {
        await page.evaluate(`seek(${from + i / fps})`);
        const buf = await page.shot({ format: 'jpeg', quality: draft ? 80 : 95, scale: draft ? 0.5 : 1 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (done % (fps * 5) === 0) process.stdout.write(`\rframes ${done} / ${total}  (${(done / ((Date.now() - t0) / 1000)).toFixed(1)} fps)   `);
      }
    } finally { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
  };
  const drawManim = async (page, t) => {
    const sc = tl.scenes.find((x) => x.id === t.id), mdir = path.join(dir, 'build', 'manim', t.id), info = JSON.parse(fs.readFileSync(path.join(mdir, 'info.json'), 'utf8'));
    const ov = path.join(partsDir, `ov_${t.a}`); fs.mkdirSync(ov, { recursive: true });
    const groups = [];
    await page.evaluate('window.__overlayOnly = true');
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    try {
      for (let i = t.a; i < t.b; i++) {
        await page.evaluate(`seek(${from + i / fps})`);
        const sig = await page.evaluate('window.__overlaySig()');
        if (sig === null) return false;   // a canvas: draw this stretch the normal way
        if (!groups.length || groups[groups.length - 1].sig !== sig) {
          await page.evaluate('window.__overlayMode(true)');
          const file = path.join(ov, `${groups.length}.png`);
          fs.writeFileSync(file, await page.shot({ format: 'png' }));
          await page.evaluate('window.__overlayMode(false)');
          groups.push({ sig, file, n: 0 });
        }
        groups[groups.length - 1].n++;
        done++;
      }
    } finally {
      await page.evaluate('window.__overlayOnly = false');
      await page.send('Emulation.setDefaultBackgroundColorOverride', {});
    }
    // Manim's frames, one line a frame (a frame index repeats where the scene outlasts its frames).
    const mlist = [], olist = [];
    for (let i = t.a; i < t.b; i++) {
      const k = Math.min(info.frames - 1, Math.floor((from + i / fps - sc.start) * info.fps + 1e-6));
      mlist.push(`file '${path.join(mdir, `f_${String(Math.max(0, k) + 1).padStart(5, '0')}.jpg`)}'`, `duration ${1 / fps}`);
    }
    mlist.push(mlist[mlist.length - 2]);
    for (const g of groups) olist.push(`file '${g.file}'`, `duration ${g.n / fps}`);
    olist.push(olist[olist.length - 2]);
    fs.writeFileSync(path.join(ov, 'm.txt'), mlist.join('\n')); fs.writeFileSync(path.join(ov, 'o.txt'), olist.join('\n'));
    const r = await runAsync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(ov, 'm.txt'), '-f', 'concat', '-safe', '0', '-i', path.join(ov, 'o.txt'),
      '-filter_complex', `[0:v]fps=${fps},format=rgba[m];[1:v]fps=${fps},format=rgba[o];[m][o]overlay=0:0:eof_action=repeat:format=rgb,${encVf}[v]`,
      '-map', '[v]', '-frames:v', String(t.b - t.a), '-r', String(fps), ...encRest, partOf(t)]);
    if (r.code !== 0) throw new Error(`fast Manim render of ${t.id} failed: ${r.out.slice(-300)}`);
    fs.rmSync(ov, { recursive: true, force: true });
    return true;
  };
  // A pool of pages: each takes the next task. The longest tasks go first, so no page waits at the end.
  const queue = tasks.slice().sort((x, y) => (y.b - y.a) - (x.b - x.a));
  const worker = async () => {
    const page = await chrome(srv.url);
    try {
      while (queue.length) {
        const t = queue.shift();
        if (t.kind === 'chrome' || !(await drawManim(page, t))) await drawChrome(page, t);
      }
      for (const e of await page.evaluate('window.__errors')) errors.add(e.split('\n')[0]);
    } finally { await page.close(); }
  };
  try { await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, worker)); } finally { await srv.close(); }
  const parts = tasks.map(partOf).sort();
  const fastFrames = tasks.filter((x) => x.kind !== 'chrome').reduce((n, x) => n + x.b - x.a, 0);
  if (fastFrames) console.log(`\nManim stretches: ${fastFrames} frames composited by ffmpeg, not drawn by Chrome`);
  console.log(`rendered ${total} frames with ${workers} workers in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
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
  const srt = path.join(dir, 'build', 'subtitles.srt'), useMusic = !!musicFile, useSfx = !!sfxFile;
  const ss = ['-ss', String(from)];
  const args = ['-v', 'error', '-y', '-i', silent, ...ss, '-i', path.join(dir, 'build', 'narration.wav')];
  if (useMusic) args.push(...ss, '-i', musicFile);
  if (useSfx) args.push(...ss, '-i', sfxFile);
  if (!partial) args.push('-i', srt);
  // loudnorm holds back about 3 s and drops it at the end, so pad the voice first.
  // The music ducks gently (ratio 2, slow release): a hard duck pumps loud-soft-loud
  // between sentences (measured: 13.5 LU swing with ratio 8, 5.5 LU with this).
  const voiceChain = `[1:a]apad=pad_dur=4,aresample=48000,loudnorm=I=-16:TP=-1.5`;
  // Sound effects (when video.json turns them on) are a third input, after the music duck and
  // before the limiter. With sfx off, the filter is the same as before, so old videos do not change.
  const sx = useSfx ? `;[${2 + useMusic}:a]volume=${cfg.sfxVolume}[sx]` : '', sxIn = useSfx ? '[sx]' : '';
  args.push('-filter_complex', useMusic
    ? `${voiceChain},asplit=2[v][key];[2:a]volume=${cfg.musicVolume}[m];[m][key]sidechaincompress=threshold=0.03:ratio=2:attack=250:release=1800:knee=6[md]${sx};[v][md]${sxIn}amix=inputs=${2 + useSfx}:normalize=0:duration=first,alimiter=limit=0.95[a]`
    : useSfx ? `${voiceChain}[v]${sx};[v][sx]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]` : `${voiceChain},alimiter=limit=0.95[a]`);
  args.push('-map', '0:v', '-map', '[a]');
  if (!partial) args.push('-map', `${2 + useMusic + useSfx}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
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
  const gray = (args, input) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-vf', `scale=${W4}:${H4}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { input, maxBuffer: 1 << 30 });   // 160 x 90 grey: 1 << 28 held only about 10 min
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
// Builds build/review/: a grid at each cue with the spoken words, and motion as numbers.
// The numbers find a one-frame jump that a picture hides.
const fmt = (t) => t.toFixed(1);
const stamp = (t) => t.toFixed(1).padStart(5, '0');

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
      const vis = f.items.filter((it) => it.o > 0.3 && !it.pass);
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
  let collisions = [];
  const dir = projectDir(positional()[0]), tl = timeline(dir);
  requireManim(dir);
  const fps = +opt('--fps', tl.fps);
  loadApproved(dir);
  const out = path.join(dir, 'build', 'review');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'cues'), { recursive: true });
  fs.mkdirSync(path.join(out, 'moving'), { recursive: true });
  const sceneOf = (id) => tl.scenes.find((s) => s.id === id);
  const inScene = (s, t) => Math.min(s.start + s.dur - 0.03, Math.max(s.start + 0.03, t));
  const write = (f, txt) => fs.writeFileSync(path.join(out, f), txt);
  const t0 = Date.now();

  await withPage(dir, async (page) => {
    // Pass 1: every frame, numbers only.
    const n = Math.round(tl.duration * fps), frames = await traceParallel(dir, Array.from({ length: n }, (_, i) => i / fps), fps);
    // The ID pass over the whole video: drawings that move join the strips, and ink.md lists the rest.
    const ink = await idParallel(dir, tl, tl.scenes.map((x) => x.id), frames);
    write('ink.md', `# Ink\n\nFrom exact masks of each text, formula, drawing and model, on every sixth frame. These are WARNs: look at each one.\n\n`
      + (ink.warns.length ? ink.warns.map((w) => `- ${w}`).join('\n') : 'Nothing to report.')
      + `\n\n## The 20 tightest gaps\n\n` + (ink.tight.length ? ink.tight.map((g) => `- ${fmt(g.t)} s, ${g.scene}: ${g.v} px between ${g.a} and ${g.b}`).join('\n') : 'None under 60 px.') + '\n');
    for (const w of ink.warns) console.log(`WARN ${w}`);
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
    // The mascot against every object, and object against object (styles/library/clay.js).
    collisions = hitRuns(frames);
    write('collisions.md', `# Collisions\n\nThe mascot against every object on every frame, and each object against each other object on every third frame.\n\n` + (collisions.length ? collisions.map((e) => `- ${fmt(e.from)} to ${fmt(e.to)} s, ${e.scene}: ${e.what}`).join('\n') : 'No collisions.') + '\n');
    for (const e of collisions.slice(0, 25)) console.log(`ERROR collision ${fmt(e.from)} to ${fmt(e.to)} s, ${e.scene}: ${e.what}`);
    if (collisions.length > 25) console.log(`ERROR ${collisions.length - 25} more collisions in ${path.join(out, 'collisions.md')}`);
    // Things in 3D join the motion measures, so a jump or a teleport of a robot or the mascot is flagged.
    for (const f of frames) for (const r of f.moved?.roots || []) f.items.push({ k: r.k, x: r.x, y: r.y, w: 0, h: 0, o: 1, manual: true });
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

    // Before, on and after each cue, so the main session can check picture against voice.
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
    // Every movement of the mascot or an object gets its own dense strip, because a fault while a thing
    // moves falls between the frames of a sheet. The list comes from the measured motion, not from a guess.
    const moving = movingStrips(frames), movingChecks = [];
    for (const v of moving) {
      const cells = [];
      for (let k = 0; k < 12; k++) { const t = v.a + ((v.b - v.a) * k) / 11; cells.push({ label: `${fmt(t)} s`, img: await shot(inScene(sceneOf(v.scene), t), 0.25) }); }
      v.file = `moving/${stamp(v.a)}-${v.scene}-${moving.indexOf(v)}.jpg`;
      grids.push({ file: v.file, cols: 4, w: 480, h: 270, title: `${v.thing} moves, ${v.scene}, ${fmt(v.a)} to ${fmt(v.b)} s`, cells }); grids[grids.length - 1].check = checkDigit(movingChecks, v.file, gridKey(grids[grids.length - 1]));
    }
    write('moving-checks.json', JSON.stringify(movingChecks));
    { const nNew = movingChecks.filter((c) => !c.pre).length; console.log(`movement strips: ${movingChecks.length}, ${movingChecks.length - nNew} read before (no digit), ${nNew} new: make look <dir> --moving-ok <their ${nNew} digits${nNew ? '' : ', or -'}>`); }
    const still = [...voiceWithoutMotion(dir, tl, frames), ...stillFormulas(dir, frames), ...formulasRunTogether(frames)];
    for (const w of still) console.log(`ERROR ${w}`);
    collisions.push(...still.map((what) => ({ what })));
    write('moving.md', `# Things that move\n\nMeasured from every frame. Read every strip: look at contact, clearance, feet, and whether the thing moves the way the voice says.\n\n` + moving.map((v) => `- ${fmt(v.a)} to ${fmt(v.b)} s, ${v.scene}, ${v.thing}: ${v.file}\n  voice: ${wordsAround(sceneOf(v.scene), v.a - sceneOf(v.scene).start)}`).join('\n') + '\n' + (still.length ? `\n## The voice says that something moves, and nothing moves\n${still.map((w) => `- ${w}`).join('\n')}\n` : ''));
    // Last: compose the grids. This replaces the stage, so nothing is drawn after it.
    await composeGrids(page, grids, out);

    // ---- the text files ----
    write('cues.md', `# Cues\n\nEach moment where a scene starts something on a spoken word or a [#marker]. "▶" marks the word spoken at the cue. Each grid shows the screen 0.5 s before the cue, on it, and 0.4 s and 1 s after.\n\n` +
      cues.map((c) => `## ${fmt(c.t)} s, ${c.scene}: ${c.names.join(', ')}\nvoice: ${wordsAround(sceneOf(c.scene), c.tRel)}\ngrid: ${c.file}`).join('\n\n') + '\n');

    write('motion.md', `# Motion\n\nMeasured from every frame (${fps} frames a second, ${frames.length} frames). Speeds are in stage px a second (the stage is 1920 x 1080). ` +
      `"abrupt" means the movement starts or ends at more than 40 % of its top speed, with no ease. That is correct for a snap style and wrong for a weighted one. ` +
      `Traced: text, formulas, every element moved with set(), and points given with s.trace().\n\n` +
      `## Flags (${m.flags.length})\n` + (m.flags.length ? m.flags.map((f) => `- ${fmt(f.t)} s, ${f.scene}, ${f.kind}: ${f.msg}`).join('\n') : 'none') + '\n\n' +
      `## Movements (${m.moves.length})\n| scene | item | from s | to s | distance px | top speed px/s | start | end |\n|---|---|---|---|---|---|---|---|\n` +
      m.moves.map((mv) => `| ${mv.scene} | ${mv.k} | ${fmt(mv.a)} | ${fmt(mv.b)} | ${Math.round(mv.dist)} | ${Math.round(mv.peak)} | ${mv.abruptA ? 'abrupt' : 'eased'} | ${mv.abruptB ? 'abrupt' : 'eased'} |`).join('\n') + '\n');
    for (const f of m.flags.slice(0, 20)) console.log(`WARN motion ${fmt(f.t)} s, ${f.scene}, ${f.kind}: ${f.msg}`);
    if (m.flags.length > 20) console.log(`WARN motion: ${m.flags.length - 20} more in ${path.join(out, 'motion.md')}`);

    const onscreen = {};
    for (const f of frames) for (const it of f.items || []) if (it.isText && it.o > 0.5) { const key = `${f.scene}|${it.text}`; onscreen[key] ??= { scene: f.scene, t: f.t, text: it.text }; }
    write('onscreen.md', `# Text on screen\n\nEvery HTML text and TeX formula, with the first time it is fully visible. Text drawn on a canvas is not here: look at the stills.\n\n` +
      Object.values(onscreen).map((o) => `- ${fmt(o.t)} s, ${o.scene}: ${o.text}`).join('\n') + '\n');

    // Overlaps measured on every frame: text on text, and text on traced things
    // (set() elements and s.trace() points with a size). Canvas drawing that is not
    // traced is not in these numbers: the overlap agent looks at the frames for it.
    const ovList = overlapsOf(frames, fps);
    write('overlaps.md', `# Overlaps\n\nMeasured on every frame: each pair of a text or formula and another text, formula or traced element whose boxes share more than 6 px in both directions, while both are visible (opacity above 0.3). ` +
      `A text that sits fully inside a non-text box (a label in its own box) is not listed. Canvas and Three.js drawing without s.trace() is not measured: look at the frames for those.\n\n` +
      (ovList.length ? `| scene | from s | to s | item A | item B | largest overlap px² | at (x, y) |\n|---|---|---|---|---|---|---|\n` + ovList.map((e) => `| ${e.scene} | ${fmt(e.from)} | ${fmt(e.to)} | ${e.a} | ${e.b} | ${e.area} | ${e.at.x}, ${e.at.y} |`).join('\n') : 'No measured overlaps.') + '\n');
    if (ovList.length) console.log(`WARN ${ovList.length} measured overlap(s): see ${path.join(out, 'overlaps.md')}`);

    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(`${out}\n${cues.length} cue grids, ${m.moves.length} movements, ${m.flags.length} motion flags, ${collisions.length} collisions, ${moving.length} movement strips, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  });
  if (collisions.length) process.exit(1);
}

// ---------- preview ----------
async function preview() {
  const dir = projectDir(positional()[0]);
  timeline(dir);
  const srv = await serve(dir);
  console.log(`preview: ${srv.url}  (Ctrl-C to stop)`);
}

// One shot: every mechanical step in order, stopping at the first one that fails.
// ---------- the closed loop: look before each build and each render ----------
// After every edit: "make look" measures the changed scenes and draws their near frames and their moving
// parts. Nothing heavy runs until someone has read them. The user found renders that started before
// anyone had looked at a frame, and faults that a look at the frames would have shown in seconds.
const hash12 = (x) => createHash('sha1').update(x).digest('hex').slice(0, 16);
function sourceHashes(dir, tl) {
  const blocks = {}; let common = '', cur = null;
  for (const line of fs.readFileSync(path.join(dir, 'scenes.js'), 'utf8').split('\n')) {
    const m = !cur && line.match(/^scene\('([\w-]+)'/);
    if (m) { cur = m[1]; blocks[cur] = ''; }
    if (cur) { blocks[cur] += line + '\n'; if (/^\}\);?\s*$/.test(line) || (m && /\}\);?\s*$/.test(line))) cur = null; } else common += line + '\n';
  }
  // Anything that all scenes share: their helpers, the Manim code, the kit and the runtime.
  const shared = [path.join(dir, 'manim_scenes.py'), path.join(dir, 'video.json'), path.join(ENGINE, 'make.mjs'), path.join(ENGINE, 'runtime.js'), path.join(CLAY, '..', 'clay.js'), path.join(CLAY, '..', 'eqn.js'), ...['sdf.js', 'mascot.js', 'models.js'].map((f) => path.join(CLAY, f))];
  const src = path.join(dir, 'src');
  if (fs.existsSync(src)) shared.push(...fs.readdirSync(src).sort().map((f) => path.join(src, f)));
  for (const f of shared) if (fs.existsSync(f)) common += fs.readFileSync(f, 'utf8');
  const script = fs.readFileSync(path.join(dir, 'script.md'), 'utf8'), section = {};
  for (const part of script.split(/^## /m).slice(1)) section[part.split(/[\s{]/)[0]] = part;
  const scenes = {};
  for (const x of tl.scenes) scenes[x.id] = hash12((blocks[x.id] || '') + (section[x.id] || '') + JSON.stringify([x.dur, x.marks]));
  return { common: hash12(common), scenes };
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const lookFile = (dir, n) => path.join(dir, 'build', 'look', n);
const changedSince = (cur, old) => (!old || old.common !== cur.common ? Object.keys(cur.scenes) : Object.keys(cur.scenes).filter((k) => old.scenes[k] !== cur.scenes[k]));
const gateOff = (dir) => readJson(path.join(dir, 'video.json'))?._gate === false;
function gate() {
  const dir = projectDir(positional()[0]);
  if (gateOff(dir)) return;
  const changed = changedSince(sourceHashes(dir, timeline(dir)), readJson(lookFile(dir, 'passed.json'))?.hashes);
  if (changed.length) die(`no look at these changed scenes: ${changed.join(', ')}.\nRun "make look ${dir}", read every image it lists, fix what you see, then run "make look ${dir} --ok <the digits>".`);
  console.log('gate: every changed scene has had a look');
}
function renderGate(dir, tl) {
  if (gateOff(dir)) return;
  const cur = JSON.stringify(sourceHashes(dir, tl)), passed = readJson(lookFile(dir, 'passed.json')), built = readJson(lookFile(dir, 'built.json')), moved = readJson(lookFile(dir, 'moving-ok.json'));
  if (!passed || JSON.stringify(passed.hashes) !== cur) die(`the source changed after the last look. Run "make look ${dir}" first.`);
  if (!built || JSON.stringify(built.hashes) !== cur) die(`the source changed after the last build. Run "make build ${dir}" first.`);
  const rev = path.join(dir, 'build', 'review');
  if (!/No collisions/.test(fs.readFileSync(path.join(rev, 'collisions.md'), 'utf8'))) die(`there are collisions: see ${path.join(rev, 'collisions.md')}.`);
  if (!/No measured overlaps/.test(fs.readFileSync(path.join(rev, 'overlaps.md'), 'utf8'))) die(`there are overlaps: see ${path.join(rev, 'overlaps.md')}.`);
  if (!moved || JSON.stringify(moved.hashes) !== cur) die(`nobody has read the movement strips of this build. Read every strip in ${path.join(rev, 'moving.md')}, in order, then run "make look ${dir} --moving-ok <the CHECK digits>". With no strips, give 0 digits.`);
}
function built() {
  const dir = projectDir(positional()[0]);
  fs.mkdirSync(path.dirname(lookFile(dir, 'x')), { recursive: true });
  fs.writeFileSync(lookFile(dir, 'built.json'), JSON.stringify({ hashes: sourceHashes(dir, timeline(dir)) }));
}
// Each movement, from what was measured on each frame. Things that move at one time share one strip.
function movingStrips(frames) {
  const runs = [], open = {};
  // A formula that cancels, or a term that moves across it, gets a strip like an object that moves.
  for (const f of frames) for (const thing of [...(f.moved?.parts || []), ...(f.acting ? ['formula'] : [])]) {
    const key = `${f.scene}|${thing}`;
    if (open[key] && f.t - open[key].to <= 0.8) open[key].to = f.t;
    else { if (open[key]) runs.push(open[key]); open[key] = { scene: f.scene, things: [thing], from: f.t, to: f.t }; }
  }
  runs.push(...Object.values(open));
  const merged = [];
  for (const r of runs.filter((x) => x.to - x.from >= 0.25).sort((a, b) => (b.to - b.from) - (a.to - a.from))) {
    const same = merged.find((m) => m.scene === r.scene && Math.min(m.to, r.to) - Math.max(m.from, r.from) > 0.8 * (r.to - r.from));
    if (same) same.things.push(...r.things); else merged.push(r);
  }
  const out = [];
  for (const r of merged.sort((a, b) => a.from - b.from)) {
    const span = r.to - r.from, parts = Math.ceil(span / 8);
    for (let p = 0; p < parts; p++) out.push({ scene: r.scene, thing: [...new Set(r.things)].join(', '), a: r.from + (span * p) / parts, b: r.from + (span * (p + 1)) / parts });
  }
  return out;
}
// A sentence that says something moves must have something moving on screen. The voice once moved a term
// across an equation while the screen stayed still. A sentence that only means it in words goes in
// "_stillVoice" in video.json, with a part of its text.
const MOTION = /\b(moves?|moving|pushe?s?|pulls?|drags?|slides?|lifts?|drops?|swaps?|flips?|carr(?:y|ies)|throws?)\b/i;
// A formula that only sits on the screen is no better than notes. A formula shown for 3 s or more must
// move, build or bounce while it is shown. Scene labels pinned to a moving thing pass by themselves.
function stillFormulas(dir, frames) {
  // New videos in either look; an old project with no _look keeps its old rules.
  if (!['clay', 'classic'].includes(readJson(path.join(dir, 'video.json'))?._look)) return [];
  // One formula is one row of eqn() pieces, so an "=" that stays while its terms move is correct.
  const seen = {};
  for (const f of frames) for (const it of f.items || []) {
    if (!it.isText || !String(it.k).startsWith('tex ') || it.o < 0.1) continue;
    const key = `${f.scene}|${it.group || it.k}`, g = (seen[key] ??= { scene: f.scene, k: it.k, from: f.t, to: f.t, moved: false, parts: {} }), r = (g.parts[it.k] ??= { x: it.x, y: it.y, w: it.w });
    g.to = f.t;
    if (Math.abs(it.x - r.x) >= 3 || Math.abs(it.y - r.y) >= 3 || Math.abs(it.w - r.w) >= 3) g.moved = true;
  }
  return Object.values(seen).filter((g) => g.to - g.from >= 3 && !g.moved).map((g) => `${fmt(g.from)} s, ${g.scene}: a formula sits still for ${fmt(g.to - g.from)} s: ${g.k}. Build it with eqn(): it must do what the voice says`);
}
// Two formulas on one line with almost no gap read as one wrong formula.
function formulasRunTogether(frames) {
  const seen = {};
  for (const f of frames) {
    const rows = {};
    for (const it of f.items || []) if (it.isText && it.group && it.o > 0.5 && !it.pass) {
      const r = (rows[it.group] ??= { l: 1e9, r: -1e9, t: 1e9, b: -1e9, k: it.k });
      r.l = Math.min(r.l, it.x - it.w / 2); r.r = Math.max(r.r, it.x + it.w / 2); r.t = Math.min(r.t, it.y - it.h / 2); r.b = Math.max(r.b, it.y + it.h / 2);
    }
    const list = Object.entries(rows);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [ga, A] = list[i], [gb, B] = list[j], high = Math.min(A.b, B.b) - Math.max(A.t, B.t), gap = Math.max(A.l, B.l) - Math.min(A.r, B.r);
      if (high < 0.4 * Math.min(A.b - A.t, B.b - B.t) || gap >= 40) continue;
      const e = (seen[`${f.scene}|${ga}|${gb}`] ??= { scene: f.scene, a: A.k, b: B.k, from: f.t, to: f.t }); e.to = f.t;
    }
  }
  return Object.values(seen).map((e) => `overlap ${fmt(e.from)} to ${fmt(e.to)} s, ${e.scene}: two formulas run together: ${e.a} and ${e.b}`);
}
const CANCEL = /\bcancels?\b/i;
function voiceWithoutMotion(dir, tl, frames, only) {
  const allowed = readJson(path.join(dir, 'video.json'))?._stillVoice || [], out = [];
  for (const sc of tl.scenes) {
    if (only && !only.includes(sc.id)) continue;
    let cur = [];
    for (const w of sc.words || []) {
      cur.push(w);
      if (!/[.!?]["')\]]*$/.test(w.text)) continue;
      const text = cur.map((x) => x.text).join(' '), a = sc.start + cur[0].start, b = sc.start + w.end + 1.5, first = cur[0]; cur = [];
      if (allowed.some((x) => text.includes(x))) continue;
      const fs_ = frames.filter((f) => f.scene === sc.id && f.t >= a && f.t <= b), range = {};
      // "The mass cancels" needs a cancel on screen. Other motion does not count: a mascot who walks
      // past a formula is not a term that cancels.
      if (CANCEL.test(text) && !fs_.some((f) => f.cancelling)) out.push(`${fmt(sc.start + first.start)} s, ${sc.id}: the voice says something cancels, and nothing cancels on screen: "${text.slice(0, 70)}". Use eqn() or s.cancelling(), or list it in "_stillVoice" in video.json`);
      if (!MOTION.test(text)) continue;
      let moved = fs_.some((f) => f.moved?.parts?.length);
      for (const f of fs_) for (const it of f.items || []) if (it.isText && it.o > 0.1) {
        const r = (range[it.k] ??= { x0: it.x, x1: it.x, y0: it.y, y1: it.y }); r.x0 = Math.min(r.x0, it.x); r.x1 = Math.max(r.x1, it.x); r.y0 = Math.min(r.y0, it.y); r.y1 = Math.max(r.y1, it.y);
        if (r.x1 - r.x0 > 12 || r.y1 - r.y0 > 12) moved = true;
      }
      if (!moved) out.push(`${fmt(sc.start + first.start)} s, ${sc.id}: the voice says something moves, and nothing moves: "${text.slice(0, 70)}". Show it, or list it in "_stillVoice" in video.json`);
    }
  }
  return out;
}
// One digit on each image. The gate opens only with the digits of all images, in order, so a look must
// really read each one: a plain "ok" was a promise, and the promise was broken more than once.
// Images already read need no digit again (the user asked, 2026-11-09: each look made him read 59 images,
// most of them the same as in the look before). An image is the same when its frames and labels are the same:
// its key is a hash of them, not of the composed file, which carries a new digit each time. The keys of images
// read and confirmed with the right digits are kept in build/approved-images.json.
let APPROVED = new Set();
const approvedFile = (dir) => path.join(dir, 'build', 'approved-images.json');
const loadApproved = (dir) => { APPROVED = new Set(readJson(approvedFile(dir)) || []); };
const gridKey = (g) => createHash('sha1').update(g.title || '').update(g.cells.map((c) => `${c.label}|${c.img}`).join('\n')).digest('hex').slice(0, 16);
function checkDigit(records, file, key) {
  if (key && APPROVED.has(key)) { records.push({ file, key, pre: true }); return 'read'; }
  const digit = createHash('sha1').update(file + Date.now() + records.length).digest()[0] % 10, salt = createHash('sha1').update(`${file}${Math.random()}`).digest('hex').slice(0, 12);
  records.push({ file, salt, hash: hash12(salt + digit), key });
  return digit;
}
function checkCode(records, code, what, dir) {
  const digits = String(code).replace(/\D/g, ''), need = records.filter((r) => !r.pre);
  if (digits.length !== need.length) die(`${what}: this needs ${need.length} digit(s), one from each new image in the order listed (images marked "read before" have none), and you gave ${digits.length}.`);
  const wrong = need.filter((r, i) => hash12(r.salt + digits[i]) !== r.hash).map((r) => r.file);
  if (wrong.length) die(`${what}: the digit is wrong for ${wrong.length} image(s). Read them again:\n${wrong.join('\n')}`);
  if (dir) { loadApproved(dir); for (const r of records) if (r.key) APPROVED.add(r.key); fs.writeFileSync(approvedFile(dir), JSON.stringify([...APPROVED])); }
}
async function composeGrids(page, grids, out) {
  for (const g of grids) {
    const rows = Math.ceil(g.cells.length / g.cols), W_ = g.cols * (g.w + 8) + 8, H_ = 52 + rows * (g.h + 36) + 8;
    await page.viewport(W_, H_);
    await page.evaluate(`document.body.innerHTML = ${JSON.stringify(`<div style="background:#222;color:#eee;font:600 20px Inter,sans-serif;padding:8px;width:${W_ - 16}px"><div style="height:44px;display:flex;justify-content:space-between;align-items:center"><span>${g.title.replace(/</g, '&lt;')}</span>${g.check === undefined ? '' : (g.check === 'read' ? `<span style="font-size:30px;color:#8a90a8">READ BEFORE</span>` : `<span style="font-size:34px;color:#ffd166">CHECK ${g.check}</span>`)}</div><div style="display:grid;grid-template-columns:repeat(${g.cols},${g.w}px);gap:8px">${g.cells.map((c) => `<div><div style="height:28px;font-size:18px">${c.label}</div><img width="${g.w}" height="${g.h}" src="data:image/jpeg;base64,${c.img}"></div>`).join('')}</div></div>`)}; document.body.style.overflow='visible'; true`);
    fs.writeFileSync(path.join(out, g.file), Buffer.from((await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: W_, height: H_, scale: 1 } })).data, 'base64'));
  }
}
// Boxes of text and traced things that share more than 6 px in both directions, on every frame.
function overlapsOf(frames, fps) {
  const ov = {}, box = (it) => ({ left: it.x - (it.w || 0) / 2, right: it.x + (it.w || 0) / 2, top: it.y - (it.h || 0) / 2, bottom: it.y + (it.h || 0) / 2 });
  for (const f of frames) {
    // pass: a term that flies across a formula on purpose while it cancels (styles/library/eqn.js).
    const its = (f.items || []).filter((it) => it.o > 0.3 && it.w > 0 && it.h > 0 && !it.pass);
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
      const e = (ov[key] ??= { scene: f.scene, a: a.k, b: b.k, textOnText: a.isText && b.isText, from: f.t, to: f.t, area: 0, at: { x: Math.round(Math.max(A.left, B.left)), y: Math.round(Math.max(A.top, B.top)) } });
      e.to = f.t; if (w * h > e.area) e.area = Math.round(w * h);
    }
  }
  // Text on text counts at any length: two labels that cross-fade on one spot cover each other.
  return Object.values(ov).filter((e) => e.textOnText || e.to - e.from >= 1.5 / fps).sort((x, y) => x.from - y.from);
}
// Every frame of some scenes: what collides, what overlaps, what moves, and the page errors.
// ---------- the ID pass (engine/runtime.js, "the ID pass") ----------
// On every sixth frame (--id-every n; XV_ID=0 turns it off): exact masks of each text, formula, drawing
// and model. Motion that only the pixels show joins the frame's moved parts, so the voice check and the
// movement strips see a moving drawing too. Gaps, text on a drawing, hidden models and low contrast are
// WARNs: crowding is the user's judgement, so the 20 tightest moments go on a sheet for the reader.
// The ID pass in several pages at once: scenes are independent, so split them, balanced by length.
async function idParallel(dir, tl, ids, frames) {
  const K = Math.max(1, Math.min(renderCfg(dir).workers, ids.length)), bins = Array.from({ length: K }, () => ({ ids: [], dur: 0 }));
  const dur = (id) => tl.scenes.find((x) => x.id === id).dur;
  for (const id of [...ids].sort((a, b) => dur(b) - dur(a))) { const b = bins.reduce((m, x) => (x.dur < m.dur ? x : m)); b.ids.push(id); b.dur += dur(id); }
  const parts = await Promise.all(bins.filter((b) => b.ids.length).map((b) => withPage(dir, (page) => idPass(page, tl, b.ids, frames))));
  return { warns: parts.flatMap((x) => x.warns), tight: parts.flatMap((x) => x.tight).sort((a, b) => a.v - b.v).slice(0, 20) };
}
async function idPass(page, tl, ids, frames) {
  const every = +(opt('--id-every') ?? 6), res = { warns: [], tight: [] };
  if (process.env.XV_ID === '0' || !(every > 0)) return res;
  const runs = {}, pairs = {};
  for (const sc of tl.scenes.filter((x) => ids.includes(x.id))) {
    await page.evaluate('__idReset()');
    const n = Math.round(sc.dur * tl.fps), step = every / tl.fps;
    for (let i = 0; i < n; i += every) {
      const t = sc.start + i / tl.fps;
      await page.evaluate(`seek(${t})`);
      const plan = await page.evaluate('__idPlan()');
      try {
        for (let k = 0; k < plan.shots; k++) {
          await page.evaluate(`__idShow(${k})`);
          await page.evaluate(`__idTake(${k}, "data:image/jpeg;base64,${(await page.shot({ format: 'jpeg', quality: 92 })).toString('base64')}")`);
        }
      } finally { await page.evaluate('__idShow(-1)'); }
      if (plan.text) await page.evaluate(`__idFrame("data:image/jpeg;base64,${(await page.shot({ format: 'jpeg', quality: 92 })).toString('base64')}")`);
      const r = await page.evaluate('__idMeasure()');
      // A change since two captures ago: the frames in that window moved.
      if (r.moved.length) for (const f of frames) if (f.scene === sc.id && f.t > t - 2 * step && f.t <= t + 1e-6) {
        f.moved ??= { roots: [], parts: [] }; f.moved.parts = [...(f.moved.parts || []), ...r.moved.filter((x) => !f.moved.parts?.includes(x))];
      }
      for (const w of r.warns) {
        const key = `${sc.id}|${w.kind}|${w.a}|${w.b || ''}`, e = runs[key];
        if (e && t - e.to <= step + 1e-6) { e.to = t; e.v = w.kind === 'contrast' ? Math.min(e.v, w.v) : Math.max(e.v, w.v); e.n++; }
        else (runs[key] = { scene: sc.id, ...w, from: t, to: t, n: 1, done: e ? [...(e.done || []), e] : [] });
      }
      for (const g of r.gaps) { const key = `${sc.id}|${g.a}|${g.b}`; if (!pairs[key] || g.v < pairs[key].v) pairs[key] = { scene: sc.id, t, ...g }; }
    }
  }
  const all = Object.values(runs).flatMap((e) => [...e.done, e]).filter((e) => e.n >= 2);
  const say = { ink: (e) => `${e.a} lies on ${e.b} (${e.v} px²)`, hidden: (e) => `${e.a} is ${e.v} % hidden by other models`, contrast: (e) => `${e.a} has a contrast of only ${e.v} : 1 with the pixels around it (aim for 3 : 1 or more)` };
  res.warns = all.sort((a, b) => a.from - b.from).map((e) => `${e.kind} ${fmt(e.from)} to ${fmt(e.to)} s, ${e.scene}: ${say[e.kind](e)}`);
  res.tight = Object.values(pairs).sort((a, b) => a.v - b.v).slice(0, 20);
  for (const g of res.tight.filter((x) => x.v < 12)) res.warns.push(`gap ${fmt(g.t)} s, ${g.scene}: ${g.a} is ${g.v} px from ${g.b}`);
  return res;
}
// The tightest gaps as one image for a look, with both things outlined.
async function tightGrid(page, tight, stampOf) {
  if (!tight.length) return null;
  const cells = [];
  for (const g of tight.slice(0, 9)) {
    await page.evaluate(`seek(${g.t})`); await page.evaluate(`__idMark(${JSON.stringify(g.boxes)})`);
    cells.push({ label: `${g.scene} ${fmt(g.t)} s: ${g.v} px, ${g.a} / ${g.b}`.slice(0, 90), img: (await page.shot({ format: 'jpeg', quality: 85 })).toString('base64') });
    await page.evaluate('__idMark(null)');
  }
  return { file: `${stampOf(tight[0].t)}-tightest-gaps.jpg`, cols: 3, w: 640, h: 360, title: 'the tightest gaps: is any of them too close?', cells };
}
// The frames of one fault, as runs: a gap of more than 0.5 s starts a new run. A fault at 0.8 s and
// another at 11.9 s once printed as one fault "0.8 to 11.9 s".
function hitRuns(frames) {
  const open = {}, out = [];
  for (const f of frames) for (const h of f.hits || []) {
    const k = `${f.scene}|${h}`, e = open[k];
    if (e && f.t - e.to <= 0.5) e.to = f.t; else { if (e) out.push(e); open[k] = { scene: f.scene, what: h, from: f.t, to: f.t }; }
  }
  return [...out, ...Object.values(open)].sort((a, b) => a.from - b.from);
}
// Word timing: when Whisper matches too few words of a scene, the engine guesses the word
// times, and the cues of that scene bunch together (video 3: six cues in 0.5 s, rate 0.46).
// check stops on it, and look reports it too, so it is fixed before the images are read.
function voiceMatchIssues(dir, tl, ids) {
  const out = [];
  for (const s of tl.scenes) {
    if (ids && !ids.includes(s.id)) continue;
    const f = path.join(dir, 'build', 'voice', `${s.id}.json`);
    const rate = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).matchRate : undefined;
    if (typeof rate === 'number' && rate < 0.9) out.push(`scene ${s.id}: only ${Math.round(rate * 100)} % of the words were matched in the audio, so its cue times are guesses. Listen to build/voice/${s.id}, then make that scene's voice again (new seed) or split its long paragraph.`);
  }
  return out;
}
// One line for one error, however many frames it happened on: a Manim scene with no frames gave
// 300 lines, one for each frame.
function groupErrors(list) {
  const seen = new Map();
  for (const e of list) {
    const line = e.split('\n')[0], m = line.match(/^scene (\S+) at ([\d.]+) s: (.*)$/);
    const key = m ? `${m[1]}|${m[3]}` : line, t = m ? +m[2] : null;
    const g = seen.get(key) || { line, id: m?.[1], msg: m?.[3], from: t, to: t, n: 0 };
    if (t !== null) { g.from = Math.min(g.from, t); g.to = Math.max(g.to, t); }
    g.n++; seen.set(key, g);
  }
  return [...seen.values()].map((g) => (g.id && g.n > 1 ? `scene ${g.id} at ${g.from.toFixed(2)} to ${g.to.toFixed(2)} s (${g.n} frames): ${g.msg}` : g.line));
}
// The measures of each frame run in one page at a time, so one page used one core and the GPU idled (the
// user found a 13-minute look that took 15 minutes on a 24-core machine). Split the scenes over several pages
// that run at the same time, balanced by length, and join the results in time order.
async function measureParallel(dir, tl, ids) {
  const K = Math.max(1, Math.min(renderCfg(dir).workers, ids.length));
  const bins = Array.from({ length: K }, () => ({ ids: [], dur: 0 }));
  for (const id of [...ids].sort((a, b) => tl.scenes.find((x) => x.id === b).dur - tl.scenes.find((x) => x.id === a).dur)) {
    const bin = bins.reduce((m, x) => (x.dur < m.dur ? x : m)); bin.ids.push(id); bin.dur += tl.scenes.find((x) => x.id === id).dur;
  }
  const parts = await Promise.all(bins.filter((b) => b.ids.length).map((b) => withPage(dir, (page) => measureScenes(page, tl, b.ids, dir))));
  return { frames: parts.flatMap((x) => x.frames).sort((a, b) => a.t - b.t), faults: parts.flatMap((x) => x.faults),
    warns: parts.flatMap((x) => x.warns), tight: parts.flatMap((x) => x.tight).sort((a, b) => a.v - b.v).slice(0, 20) };
}

// Trace a list of times in several pages at once, in order (the review's pass over every frame).
async function traceParallel(dir, times, fps) {
  const K = Math.max(1, Math.min(renderCfg(dir).workers, Math.ceil(times.length / (fps * 20)))), out = new Array(times.length);
  let done = 0;
  await Promise.all(Array.from({ length: K }, (_, k) => withPage(dir, async (page) => {
    for (let i = Math.floor((times.length * k) / K), b = Math.floor((times.length * (k + 1)) / K); i < b; i++) {
      out[i] = { t: times[i], ...(await page.evaluate(`seek(${times[i]}).then(() => __traceFrame())`)) };
      if (++done % (fps * 5) === 0) process.stdout.write(`\rtrace ${done} / ${times.length} frames, ${K} pages   `);
    }
  })));
  process.stdout.write('\n');
  return out;
}

async function measureScenes(page, tl, ids, dir) {
  const frames = [];
  for (const sc of tl.scenes.filter((x) => ids.includes(x.id))) for (let i = 0, n = Math.round(sc.dur * tl.fps); i < n; i++) {
    const t = sc.start + i / tl.fps, f = await page.evaluate(`seek(${t}).then(() => __traceFrame())`);
    frames.push({ t, ...f });
  }
  const faults = hitRuns(frames).map((e) => `collision ${fmt(e.from)} to ${fmt(e.to)} s, ${e.scene}: ${e.what}`);
  faults.push(...stillFormulas(dir, frames), ...formulasRunTogether(frames));
  for (const e of overlapsOf(frames, tl.fps)) faults.push(`overlap ${fmt(e.from)} to ${fmt(e.to)} s, ${e.scene}: ${e.a} and ${e.b}`);
  const ink = await idPass(page, tl, ids, frames);
  faults.push(...groupErrors(await page.evaluate('window.__errors')));
  return { frames, faults, warns: ink.warns, tight: ink.tight };
}
async function look() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), cur = sourceHashes(dir, tl), base = path.dirname(lookFile(dir, 'x')), ok = opt('--ok'), movOk = opt('--moving-ok');
  fs.mkdirSync(base, { recursive: true });
  if (movOk !== undefined) {
    if (JSON.stringify(readJson(lookFile(dir, 'built.json'))?.hashes) !== JSON.stringify(cur)) die('the source changed after the last build. Build first, then read the strips.');
    checkCode(readJson(path.join(dir, 'build', 'review', 'moving-checks.json')) || [], movOk, 'moving-ok', dir);
    fs.writeFileSync(lookFile(dir, 'moving-ok.json'), JSON.stringify({ hashes: cur }));
    return console.log('look: the movement strips of this build are recorded as read. "make final" can run.');
  }
  if (ok !== undefined) {
    const pending = readJson(lookFile(dir, 'pending.json'));
    if (!pending) die('no look to confirm. Run "make look" first.');
    if (pending.faults.length) die(`the last look has ${pending.faults.length} fault(s). Fix them and look again.`);
    const old = readJson(lookFile(dir, 'passed.json'))?.hashes, still = changedSince(cur, pending.hashes);
    if (still.length) die(`these scenes changed after the last look: ${still.join(', ')}. Look again.`);
    const left = changedSince(cur, old).filter((id) => !pending.scenes.includes(id));
    if (left.length) die(`these changed scenes were not in the last look: ${left.join(', ')}. Look again.`);
    checkCode(pending.checks || [], ok, 'ok', dir);
    fs.writeFileSync(lookFile(dir, 'passed.json'), JSON.stringify({ hashes: cur, at: new Date().toISOString() }));
    return console.log('look: recorded. "make build" can run.');
  }
  const ids = opt('--scene')?.split(',') || changedSince(cur, readJson(lookFile(dir, 'passed.json'))?.hashes);
  if (!ids.length) { fs.writeFileSync(lookFile(dir, 'pending.json'), JSON.stringify({ hashes: cur, scenes: [], faults: [], checks: [] })); return console.log('look: no scene changed since the last look.'); }
  for (const f of fs.readdirSync(base)) if (f.endsWith('.jpg')) fs.rmSync(path.join(base, f));
  const grids = [], list = [], checks = [], warns = [];
  const measured = await measureParallel(dir, tl, ids);
  const faults = await withPage(dir, async (page) => {
    const { frames, faults, warns: inkWarns, tight } = measured;
    warns.push(...inkWarns);
    for (const l of (await (async () => { const out = new Set(); for (const f of frames.filter((_, i) => i % 15 === 0)) { await page.evaluate(`seek(${f.t})`); for (const x of await page.evaluate('layoutIssues()')) out.add(`${f.scene}: ${x}`); } return out; })())) faults.push(l);
    for (const f of await page.evaluate('window.__fits()')) warns.push(`fit ${f.scene}: auto-fit ${f.k < 0.999 ? `shrank "${f.label}" to ${Math.round(f.k * 100)} %` : `moved "${f.label}" ${Math.round(f.d)} px`} into the safe area`);
    faults.push(...voiceWithoutMotion(dir, tl, frames, ids));
    faults.push(...voiceMatchIssues(dir, tl, ids));
    const shot = async (t) => { await page.evaluate(`seek(${t})`); return (await page.shot({ format: 'jpeg', quality: 85 })).toString('base64'); };
    for (const id of ids) {
      const sc = tl.scenes.find((x) => x.id === id), inS = (t) => Math.min(sc.start + sc.dur - 0.03, Math.max(sc.start + 0.03, t));
      // Near frames: the start, the end, and on and just after each cue.
      const times = [sc.start, ...Object.values(sc.marks || {}).flatMap((m) => [sc.start + m + 0.05, sc.start + m + 1]), sc.start + sc.dur - 0.7, sc.start + sc.dur / 2].map(inS).sort((a, b) => a - b).filter((t, i, a) => !i || t - a[i - 1] > 0.2);
      for (let g = 0; g < times.length; g += 9) {
        const cells = [];
        for (const t of times.slice(g, g + 9)) cells.push({ label: `${id} @ ${fmt(t - sc.start)} s (${fmt(t)})`, img: await shot(t) });
        const file = `${stamp(sc.start)}-${id}-near-${g / 9}.jpg`; grids.push({ file, cols: 3, w: 640, h: 360, title: `${id}: near frames`, cells }); list.push(file);
      }
    }
    for (const v of movingStrips(frames)) {
      const sc = tl.scenes.find((x) => x.id === v.scene), cells = [];
      for (let k = 0; k < 12; k++) { const t = Math.min(sc.start + sc.dur - 0.03, v.a + ((v.b - v.a) * k) / 11); cells.push({ label: `${fmt(t)} s`, img: await shot(t) }); }
      const file = `${stamp(v.a)}-${v.scene}-moving-${list.length}.jpg`; grids.push({ file, cols: 4, w: 480, h: 270, title: `${v.thing} moves, ${v.scene}, ${fmt(v.a)} to ${fmt(v.b)} s`, cells }); list.push(file);
    }
    const tg = await tightGrid(page, tight, stamp);
    if (tg) { grids.push(tg); list.push(tg.file); }
    // Time order, and each image gets its digit in the order that the list prints.
    grids.sort((a, b) => (a.file < b.file ? -1 : 1));
    loadApproved(dir);
    for (const g of grids) g.check = checkDigit(checks, g.file, gridKey(g));
    await composeGrids(page, grids, base);
    return faults;
  });
  fs.writeFileSync(lookFile(dir, 'pending.json'), JSON.stringify({ hashes: cur, scenes: ids, faults, checks }));
  for (const w of warns) console.log(`WARN ${w}`);
  for (const f of faults) console.log(`ERROR ${f}`);
  console.log(`look: ${ids.length} scene(s), ${faults.length} fault(s). Read each image, in order:`);
  const pre = new Set(checks.filter((c) => c.pre).map((c) => c.file)), nNew = checks.length - pre.size;
  for (const f of list.sort()) console.log(path.join(base, f) + (pre.has(f) ? '   (read before: the same frames, no digit)' : ''));
  console.log(faults.length ? 'Fix the faults, then look again.' : nNew ? `Each new image has a CHECK digit at its top right. Then run: make look ${dir} --ok <the ${nNew} digits, in this order>` : `Every image was read before. Run: make look ${dir} --ok -`);
  process.exit(faults.length ? 1 : 0);
}
async function selftest() {
  const r = spawnSync(process.execPath, [path.join(ENGINE, 'test', 'selftest.mjs')], { stdio: 'inherit', env: process.env });
  process.exit(r.status ?? 1);
}

// A step in brackets runs at the same time as the others in its group: they read the same timeline and write
// to different files. The user asked on 2026-11-09 that every step that can run in parallel does.
async function steps(names) {
  const d = positional()[0] || '.';
  const run = (n) => new Promise((ok) => spawn(process.execPath, [fileURLToPath(import.meta.url), ...n.split(' '), d], { stdio: 'inherit' }).on('close', (code) => ok(code)));
  for (const n of names) {
    const group = Array.isArray(n) ? n : [n];
    console.log(`\n=== ${group.join(' + ')} ===`);
    const codes = await Promise.all(group.map(run));
    const bad = group.filter((_, i) => codes[i] !== 0);
    if (bad.length) die(`stopped at "${bad.join('", "')}". Fix it, then run the same command again: finished steps are cached.`);
  }
}
const build = () => steps(['voice', 'gate', 'manim', 'check', ['sheet', 'stable', 'review'], 'built']);
const final = () => steps(['render', 'verify']);

async function subtitlesCmd() {
  const dir = projectDir(positional()[0]);
  subtitles(dir, timeline(dir));
  const issues = subtitleIssues(path.join(dir, 'build', 'subtitles.srt'));
  for (const i of issues) console.log(`WARN ${i}`);
  if (!issues.length) console.log('subtitles: one line per cue, no problems found');
}
// ---------- the clay kit ----------
const CLAY = path.join(ENGINE, '..', 'styles', 'library', 'clay');
async function bake() {
  const only = opt('--only', 'all');
  const THREE = await import(pathToFileURL(path.join(ENGINE, 'vendor', 'three.module.min.js')).href);
  const { createMascot, CACHE } = await import(pathToFileURL(path.join(CLAY, 'mascot.js')).href);
  const { buildModel, ALL_MODELS } = await import(pathToFileURL(path.join(CLAY, 'models.js')).href);
  const dir = path.join(CLAY, 'cache'), file = path.join(dir, 'manifest.json'), t0 = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  const man = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  CACHE.write = (k, d) => {
    fs.writeFileSync(path.join(dir, `${k}.bin`), Buffer.concat([d.pos, d.nor, d.col, d.tri].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));
    man[k] = { v: d.pos.length / 3, t: d.tri.length };
  };
  // --only takes mascot, models, or a list of model names: "--only apple,pear" bakes only those.
  const pick = ['all', 'mascot', 'models'].includes(only) ? null : only.split(',');
  for (const n of pick || []) if (!ALL_MODELS.includes(n)) die(`no model named "${n}"`);
  if (only === 'all' || only === 'mascot') createMascot(THREE, { step: 0.018, bodyStep: 0.03, fine: 0.012 });
  if (only !== 'mascot') for (const n of ALL_MODELS) if (!pick || pick.includes(n)) buildModel(THREE, n);
  fs.writeFileSync(file, JSON.stringify(man));
  console.log(`baked ${Object.keys(man).length} shapes in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${dir}`);
  if (only !== 'mascot') await attached();
}
// Every part of a model must touch the rest of it, measured from the shapes: a spring that stopped
// short of its wall passed every other check, and every look at the frames. A model that is meant
// to be in separate pieces says so with pieces: n.
async function attached() {
  const { MODELS, JOINS } = await import(pathToFileURL(path.join(CLAY, 'models.js')).href);
  const { measureJoins } = await import(pathToFileURL(path.join(CLAY, 'joins.js')).href);
  const man = JSON.parse(fs.readFileSync(path.join(CLAY, 'cache', 'manifest.json'), 'utf8'));
  let bad = 0, joins = 0;
  for (const [name, spec] of Object.entries(MODELS)) {
    const pts = (p) => { const k = `m-${name}-${p.name}`, b = fs.readFileSync(path.join(CLAY, 'cache', `${k}.bin`)); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + man[k].v * 12)); };
    const r = measureJoins(spec.make().parts, JOINS[name], spec.pieces, pts);
    joins += r.measured; bad += r.faults.length;
    for (const f of r.faults) console.log(`ERROR ${name}: ${f}`);
  }
  console.log(`attached: ${Object.keys(MODELS).length} models, ${joins} joins measured, ${bad} fault(s)`);
  process.exit(bad ? 1 : 0);
}
async function claySheets() {
  if (!fs.existsSync(path.join(CLAY, 'cache', 'manifest.json'))) die('no clay shapes. Run "make bake" first.');
  const { MODEL_NAMES } = await import(pathToFileURL(path.join(CLAY, 'models.js')).href);
  const pick = positional()[0], names = pick ? [pick] : ['body', 'hair', 'expressions', 'group', 'group2', 'stands', 'room', ...MODEL_NAMES.map((n) => `m-${n}`)];
  const out = path.join(CLAY, 'sheets'), srv = await serve(ENGINE);
  fs.mkdirSync(out, { recursive: true });
  for (const n of names) {
    const page = await chrome(srv.url, { width: 1800, height: 1200, page: `/_lib/clay/sheet.html?sheet=${n}`, video: false });
    try {
      let size = null;
      for (let i = 0; i < 600 && !size; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const e = await page.evaluate('window.__error || null').catch(() => null);
        if (e) die(`${n}: ${e}`);
        size = await page.evaluate('window.__done || null').catch(() => null);
      }
      if (!size) die(`${n}: the sheet did not finish`);
      const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 }, captureBeyondViewport: true });
      fs.writeFileSync(path.join(out, `${n}.png`), Buffer.from(r.data, 'base64'));
    } finally { await page.close(); }
  }
  await srv.close();
  console.log(`${names.length} sheet(s): ${out}`);
}

// A frame comes only from its time, so two draws of it must match. A difference means that the GPU
// dropped something: with antialiasing on, a leg vanished from 2 frames of 8.
async function stable() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), every = +opt('--every', 1), bad = [];
  // Several pages at once, each over its own stretch of the video (the user asked for parallel work everywhere).
  // A fixed grid, and the risky frames (HyperFrames' riskFrames): a GPU drop-out shows when something is drawn
  // for the first time, so the first frames of each scene and the moment after each cue.
  const tset = new Set(); for (let t = 0.04; t < tl.duration; t += every) tset.add(+t.toFixed(3));
  if (!flag('--grid-only')) for (const sc of tl.scenes) { for (const d of [0.04, 0.5]) tset.add(+(sc.start + d).toFixed(3)); for (const m of Object.values(sc.marks || {})) if (m + 0.1 < sc.dur) tset.add(+(sc.start + m + 0.1).toFixed(3)); }
  const times = [...tset].filter((t) => t < tl.duration).sort((a, b) => a - b);
  const K = Math.max(1, Math.min(renderCfg(dir).workers, Math.ceil(times.length / 20)));
  await Promise.all(Array.from({ length: K }, (_, k) => withPage(dir, async (page) => {
    const pic = async (t) => { await page.evaluate(`seek(${t})`); return page.shot({ format: 'jpeg', quality: 80 }); };
    for (let i = Math.floor((times.length * k) / K), e = Math.floor((times.length * (k + 1)) / K); i < e; i++) {
      const t = times[i], a = await pic(t);
      await pic(Math.max(0, t - every / 2));       // draw something else in between
      if (!a.equals(await pic(t))) bad.push(+t.toFixed(2));
    }
  })));
  bad.sort((a, b) => a - b);
  console.log(`stable: ${times.length} frames drawn twice, in ${K} pages, ${bad.length} differ`);
  for (const t of bad.slice(0, 10)) console.log(`ERROR two draws differ at ${t} s (${tl.scenes.find((x) => t >= x.start && t < x.start + x.dur)?.id}). Look at it: "make still ${dir} ${t}"`);
  process.exit(bad.length ? 1 : 0);
}

// Parity (from HyperFrames' regression harness): a speed change must not change the picture.
//   make parity <dir> --save   draw reference frames by the slow, sure path (seek + PNG screenshot)
//   make parity <dir>          compare the rendered MP4 with them (PSNR); ERROR under the limit
//   make parity <dir> --draw   compare a new drawing (PNG, no encode) with them: for runtime and capture changes
// The frames: one every --every s (default 10) and one 1.5 s into each scene. PSNR is in dB; the MP4 limit is
// 30 dB (lossy encode), the drawing limit 45 dB (the same pixels, but for GPU noise).
async function parity() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), every = +opt('--every', 10), base = path.join(dir, 'build', 'parity');
  const ref = path.join(base, 'ref'), test = path.join(base, 'test'), fps = tl.fps;
  const frames = new Set();
  for (let t = 1; t < tl.duration - 1; t += every) frames.add(Math.round(t * fps));
  for (const s of tl.scenes) frames.add(Math.round(Math.min(s.start + 1.5, s.start + s.dur - 0.2) * fps));
  const list = [...frames].sort((a, b) => a - b), name = (f) => `${String(f).padStart(6, '0')}.png`;
  const draw = async (into) => {
    fs.rmSync(into, { recursive: true, force: true }); fs.mkdirSync(into, { recursive: true });
    const K = Math.max(1, Math.min(renderCfg(dir).workers, Math.ceil(list.length / 4)));
    await Promise.all(Array.from({ length: K }, (_, k) => withPage(dir, async (page) => {
      for (let i = k; i < list.length; i += K) {
        const t = list[i] / fps;
        await page.evaluate(`seek(${t})`); await page.shot({ format: 'png' });   // the first draw warms the shaders
        await page.evaluate(`seek(${t})`); fs.writeFileSync(path.join(into, name(list[i])), await page.shot({ format: 'png' }));
      }
    })));
  };
  if (flag('--save')) { await draw(ref); return console.log(`parity: ${list.length} reference frames in ${ref}`); }
  if (!fs.existsSync(ref)) die('parity: no reference frames. Run "make parity <dir> --save" first, with the engine you trust.');
  const asDraw = flag('--draw'), video = opt('--file', path.join(dir, 'out', `${slug(dir)}.mp4`));
  // A partial render (render --from s --to s): compare only its frames, shifted by its start.
  const vFrom = Math.round(+opt('--from', 0) * fps), vTo = argv.includes('--to') ? Math.round(+opt('--to') * fps) : Infinity;
  if (!asDraw && (vFrom || vTo < Infinity)) { const keep = list.filter((f) => f >= vFrom && f < vTo); list.length = 0; list.push(...keep); }
  if (asDraw) await draw(test);
  else {
    if (!fs.existsSync(video)) die(`parity: no video at ${video}`);
    fs.rmSync(test, { recursive: true, force: true }); fs.mkdirSync(test, { recursive: true });
    // Exact frames by number, in one decoding pass: a time seek can land one frame late (it did at a wipe).
    const r = await runAsync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `select='${list.map((f) => `eq(n\\,${f - vFrom})`).join('+')}'`, '-fps_mode', 'passthrough', path.join(test, 'x%06d.png')]);
    if (r.code !== 0) die(`parity: ffmpeg could not read the frames: ${r.out.slice(-300)}`);
    list.forEach((f, i) => { const src = path.join(test, `x${String(i + 1).padStart(6, '0')}.png`); if (fs.existsSync(src)) fs.renameSync(src, path.join(test, name(f))); });
  }
  const limit = +opt('--limit', asDraw ? 45 : 30), res = [];
  const pool = list.slice(); await Promise.all(Array.from({ length: 6 }, async () => { while (pool.length) { const f = pool.shift();
    const r = await runAsync('ffmpeg', ['-v', 'info', '-i', path.join(ref, name(f)), '-i', path.join(test, name(f)), '-lavfi', '[0][1]psnr', '-f', 'null', '-']);
    const m = String(r.err || r.stderr || r.out || '').match(/average:(inf|[\d.]+)/);
    res.push({ f, db: m ? (m[1] === 'inf' ? Infinity : +m[1]) : NaN }); } }));
  res.sort((a, b) => a.f - b.f);
  const bad = res.filter((r) => !(r.db >= limit)), fin = res.filter((r) => isFinite(r.db)).map((r) => r.db);
  const avg = fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : Infinity;
  fs.writeFileSync(path.join(base, 'parity.md'), `# Parity (${asDraw ? 'new drawing' : 'video'} against the reference)\n\n` + res.map((r) => `- ${fmt(r.f / fps)} s (${tl.scenes.find((s) => r.f / fps >= s.start && r.f / fps < s.start + s.dur)?.id}): ${isFinite(r.db) ? r.db.toFixed(1) + ' dB' : r.db === Infinity ? 'identical' : 'not measured'}`).join('\n') + '\n');
  console.log(`parity: ${res.length} frames, lowest ${Math.min(...res.map((r) => r.db)).toFixed(1)} dB, mean of the others ${avg === Infinity ? 'identical' : avg.toFixed(1) + ' dB'} (limit ${limit} dB)`);
  for (const r of bad) console.log(`ERROR parity: the frame at ${fmt(r.f / fps)} s differs (${isNaN(r.db) ? 'not measured' : r.db.toFixed(1) + ' dB'}). Compare ${path.join(ref, name(r.f))} with ${path.join(test, name(r.f))}`);
  process.exit(bad.length ? 1 : 0);
}

// Measure capture paths on one stretch (for engine work): screenshot against canvas.drawElementImage.
async function capbench() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), at = +opt('--at', 150), n = +opt('--n', 60), fps = tl.fps;
  const srv = await serve(dir), page = await chrome(srv.url, { flags: ['--enable-features=CanvasDrawElement'] });
  try {
    await page.evaluate(`seek(${at})`); await page.shot({ format: 'jpeg', quality: 95 });
    let t0 = Date.now();
    for (let i = 0; i < n; i++) { await page.evaluate(`seek(${at + i / fps})`); await page.shot({ format: 'jpeg', quality: 95 }); }
    const a = (Date.now() - t0) / n;
    await page.evaluate(`(() => { const st = document.getElementById('stage'), c = document.createElement('canvas'); c.setAttribute('layoutsubtree', ''); c.setAttribute('content', 'drawable'); c.width = 1920; c.height = 1080; c.id = 'xv-de';
      st.parentNode.insertBefore(c, st); c.appendChild(st); st.setAttribute('drawable', ''); window.__deCtx = c.getContext('2d'); })()`);
    const one = `(async () => { const c = document.getElementById('xv-de'); await new Promise((r) => requestAnimationFrame(r)); window.__deCtx.clearRect(0, 0, 1920, 1080); window.__deCtx.drawElementImage(document.getElementById('stage'), 0, 0); return (c.toDataURL('image/jpeg', 0.95)).length; })()`;
    await page.evaluate(`seek(${at})`); let len = await page.evaluate(one);
    t0 = Date.now();
    for (let i = 0; i < n; i++) { await page.evaluate(`seek(${at + i / fps})`); len = await page.evaluate(one); }
    const b = (Date.now() - t0) / n;
    console.log(`screenshot: ${a.toFixed(1)} ms a frame; drawElementImage + toDataURL: ${b.toFixed(1)} ms a frame (last ${len} bytes)`);
    await page.evaluate(`seek(${at + 0.5})`); await page.evaluate(one);
    const url = await page.evaluate("document.getElementById('xv-de').toDataURL('image/png')");
    fs.writeFileSync(path.join(dir, 'build', 'capbench-de.png'), Buffer.from(url.split(',')[1], 'base64'));
    await page.evaluate("(() => { const c = document.getElementById('xv-de'), st = document.getElementById('stage'); c.parentNode.insertBefore(st, c); c.remove(); })()");
    fs.writeFileSync(path.join(dir, 'build', 'capbench-shot.png'), await page.shot({ format: 'png' }));
  } finally { await page.close(); await srv.close(); }
}

// Where can formulas and labels go? (the user asked, 2026-11-09: fixes by guess made new faults.) For each
// clay scene: sample it every 0.25 s, mark every screen cell that the mascot or a model covers at any time
// (with a 16 px margin), keep the title band, and report the largest free rectangles in the safe area.
// Each scene also gets an image: its middle frame with the 3D area shaded and the free areas outlined.
async function zones() {
  const W = 1920, H = 1080, SAFE = { x: 96, y: 72, w: 1728, h: 936 };
  const dir = projectDir(positional()[0]), tl = timeline(dir), only = opt('--scene')?.split(',');
  const ids = tl.scenes.map((x) => x.id).filter((id) => !only || only.includes(id));
  const out = path.join(dir, 'build', 'zones'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const C = 24, GW = Math.ceil(W / C), GH = Math.ceil(H / C), M = 16, TITLE = { x1: 960, y1: 190 }, MINW = 360, MINH = 72;
  const K = Math.max(1, Math.min(renderCfg(dir).workers, ids.length)), bins = Array.from({ length: K }, () => []);
  ids.forEach((id, i) => bins[i % K].push(id));
  const results = (await Promise.all(bins.filter((b) => b.length).map((b) => withPage(dir, async (page) => {
    const res = [];
    for (const id of b) {
      const sc = tl.scenes.find((x) => x.id === id), grid = new Uint8Array(GW * GH);
      let clay = false;
      for (let t = 0.05; t < sc.dur; t += 0.25) {
        await page.evaluate(`seek(${sc.start + t})`);
        const boxes = await page.evaluate('window.__zoneBoxes()');
        if (!boxes) break;
        clay = true;
        for (const bx of boxes) {
          const x0 = Math.max(0, Math.floor((bx.x0 - M) / C)), x1 = Math.min(GW - 1, Math.floor((bx.x1 + M) / C));
          const y0 = Math.max(0, Math.floor((bx.y0 - M) / C)), y1 = Math.min(GH - 1, Math.floor((bx.y1 + M) / C));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * GW + x] = 1;
        }
      }
      if (!clay) continue;
      // Outside the safe area, and the title band, are not free.
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const px = x * C, py = y * C;
        if (px < SAFE.x || py < SAFE.y || px + C > SAFE.x + SAFE.w || py + C > SAFE.y + SAFE.h || (px < TITLE.x1 && py < TITLE.y1)) grid[y * GW + x] = 2;
      }
      // The largest empty rectangles, one after another (histogram method), down to the smallest useful size.
      const free = [];
      for (let n = 0; n < 4; n++) {
        const hgt = new Array(GW).fill(0); let best = null;
        for (let y = 0; y < GH; y++) {
          for (let x = 0; x < GW; x++) hgt[x] = grid[y * GW + x] ? 0 : hgt[x] + 1;
          const st = [];
          for (let x = 0; x <= GW; x++) {
            const hh = x < GW ? hgt[x] : 0; let start = x;
            while (st.length && st[st.length - 1][1] >= hh) {
              const [sx, sh] = st.pop(), w = x - sx;
              if (sh * w > (best?.a || 0)) best = { a: sh * w, x: sx, y: y - sh + 1, w, h: sh };
              start = sx;
            }
            st.push([start, hh]);
          }
        }
        if (!best || best.w * C < MINW || best.h * C < MINH) break;
        free.push({ x: best.x * C, y: best.y * C, w: best.w * C, h: best.h * C });
        for (let y = best.y; y < best.y + best.h; y++) for (let x = best.x; x < best.x + best.w; x++) grid[y * GW + x] = 3;
      }
      // The image: the middle frame, 3D cells shaded red, free areas outlined green.
      await page.evaluate(`seek(${sc.start + sc.dur / 2})`);
      await page.evaluate(`(() => { const st = document.getElementById('stage'), o = document.createElement('div'); o.id = 'xv-zones'; o.style.cssText = 'position:absolute;inset:0;z-index:999;pointer-events:none';
        const g = ${JSON.stringify(Array.from(grid))}, f = ${JSON.stringify(free)};
        for (let y = 0; y < ${GH}; y++) for (let x = 0; x < ${GW}; x++) if (g[y * ${GW} + x] === 1) { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:' + x * ${C} + 'px;top:' + y * ${C} + 'px;width:${C}px;height:${C}px;background:rgba(214,51,108,0.22)'; o.appendChild(d); }
        f.forEach((r, i) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px;border:5px solid #2f9e55;box-sizing:border-box;font:700 34px Inter;color:#2f9e55;padding:6px'; d.textContent = 'free ' + (i + 1); o.appendChild(d); });
        st.appendChild(o); })()`);
      fs.writeFileSync(path.join(out, `${id}.jpg`), await page.shot({ format: 'jpeg', quality: 80 }));
      await page.evaluate("document.getElementById('xv-zones')?.remove()");
      res.push({ id, free });
    }
    return res;
  })))).flat().sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const md = ['# Free zones for formulas and labels', '', 'From every quarter second of each clay scene. Place formulas inside these boxes (stage px).', ''];
  for (const r of results) {
    const line = r.free.length ? r.free.map((f, i) => `free ${i + 1}: x ${f.x} to ${f.x + f.w}, y ${f.y} to ${f.y + f.h} (${f.w} x ${f.h})`).join('; ') : 'NO free zone of 360 x 72 px: move the camera';
    console.log(`${r.id}: ${line}`); md.push(`- ${r.id}: ${line} (zones/${r.id}.jpg)`);
    if (!r.free.length) console.log(`WARN ${r.id}: the 3D covers the whole safe area at some time. Pull the camera back or move the look point`);
  }
  fs.writeFileSync(path.join(out, 'zones.md'), md.join('\n') + '\n');
  console.log(`zones: ${results.length} clay scene(s), images in ${out}`);
}

// The collision measures alone, fast, for one scene or all: run it after each edit, before any build.
async function collide() {
  const dir = projectDir(positional()[0]), tl = timeline(dir), ids = opt('--scene')?.split(',') || tl.scenes.map((x) => x.id);
  let warns = [];
  const m = await measureParallel(dir, tl, ids); warns = m.warns; const faults = [...m.faults, ...voiceWithoutMotion(dir, tl, m.frames, ids)];
  for (const w of warns) console.log(`WARN ${w}`);
  for (const f of faults) console.log(`ERROR ${f}`);
  console.log(`collide: ${faults.length} fault(s)`);
  process.exit(faults.length ? 1 : 0);
}

const commands = { pace, capbench, parity, zones, collide, look, gate, built, attached, selftest, doctor, config, init, build, final, voice, subtitles: subtitlesCmd, manim, check, sheet, stable, still, review, render, verify, preview, bake, clay: claySheets };
if (!commands[cmd]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 27).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 1 : 0); }
await commands[cmd]();
if (cmd !== 'preview') process.exit(0);
