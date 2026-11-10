#!/usr/bin/env node
// Clayducation setup: installs the Claude Code skill and what it needs, after a few questions.
//   npx clayducation            ask the questions, show the plan, then install
//   npx clayducation --yes      take every default
//   npx clayducation --dry-run  show the plan and the commands, change nothing
// Other flags: --dir <path>, --voice chatterbox|kokoro, --no-manim, --no-agents,
//   --main (follow the main branch, not the newest release tag).
// Run it again at any time: it updates the skill to the newest release and installs only what is missing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { moveToTag, newestTag } from './release.mjs';

// CLAYDUCATION_REPO: clone from another place, for example a local copy when you test this file.
const REPO = process.env.CLAYDUCATION_REPO || 'https://github.com/jjietay/clayducation.git';
const EXPLAINROO = 'https://github.com/vincentsch/explainroo';
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const stop = (msg) => { console.log(msg); process.exit(1); };
// A flag that takes a value must have one: "--dir --yes" must not clone into a folder named "--yes".
const opt = (k) => {
  const i = argv.indexOf(k);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('-')) stop(`${k} needs a value, for example: ${k} ${k === '--voice' ? 'kokoro' : '~/my/folder'}`);
  return v;
};
const YES = flag('--yes') || flag('-y'), DRY = flag('--dry-run'), MAIN = flag('--main');
const VOICES = ['chatterbox', 'kokoro'];
const voiceArg = opt('--voice')?.toLowerCase();
if (voiceArg && !VOICES.includes(voiceArg)) stop(`--voice must be one of: ${VOICES.join(', ')}`);
const dirArg = opt('--dir');
const HOME = os.homedir();
const tilde = (p) => (p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p);
const untilde = (p) => (p.startsWith('~') ? path.join(HOME, p.slice(1)) : path.resolve(p));
const has = (c) => spawnSync('which', [c]).status === 0;
const out = (c, a) => { const r = spawnSync(c, a, { encoding: 'utf8' }); return r.status === 0 ? (r.stdout || r.stderr).trim() : null; };
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);

// ---------- what this machine has ----------
const mac = process.platform === 'darwin';
const appleSilicon = mac && process.arch === 'arm64';
const gpuName = has('nvidia-smi') ? out('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'])?.split('\n')[0] : null;
const chrome = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find(has)
  || (mac && fs.existsSync('/Applications/Google Chrome.app') ? '/Applications/Google Chrome.app' : null);
const nodeMajor = +process.versions.node.split('.')[0];
const pkg = mac ? 'brew install' : 'sudo apt install';
const checks = [
  ['git', has('git'), out('git', ['--version']) || `missing: ${pkg} git`, true],
  ['node', nodeMajor >= 22, nodeMajor >= 22 ? process.version : `${process.version}: the engine needs Node 22 or newer`, true],
  ['ffmpeg', has('ffmpeg'), has('ffmpeg') ? 'found' : `missing: ${pkg} ffmpeg`, true],
  ['chrome', !!chrome, chrome || 'missing: install Google Chrome or Chromium', true],
  ['uv', has('uv'), has('uv') ? out('uv', ['--version']) : 'missing: needed for the voice and Manim (the plan can install it)', false],
  ['latex', has('latex') && has('dvisvgm'), has('latex') ? 'found' : `missing: needed for Manim formulas: ${mac ? 'brew install --cask mactex-no-gui' : 'sudo apt install texlive texlive-latex-extra dvisvgm'}`, false],
];
const gpuNote = gpuName ? `NVIDIA ${gpuName.replace(/^NVIDIA /, '')}` : appleSilicon ? 'Apple silicon (Metal)' : 'none found: the engine uses the CPU';

// ---------- questions ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// With no input (stdin closed or piped short), a question never gets an answer: stop with a message.
let inputClosed = false;
rl.on('close', () => { inputClosed = true; });
const noInput = () => stop('\nNo input for the questions. Run the setup in a terminal, or add --yes to take every default.');
// Each prompt shows its options and its default; Enter takes the default.
async function ask(q, def, choices, show) {
  if (YES) return def;
  const opts = show || (choices ? choices.join('/') : 'a path');
  for (;;) {
    if (inputClosed) noInput();
    const answer = await Promise.race([rl.question(`${q} (${opts}) [Enter = ${def}]: `), new Promise((r) => rl.once('close', () => r(null)))]);
    if (answer === null) noInput();
    const a = answer.trim() || def;
    if (!choices || choices.includes(a.toLowerCase())) return choices ? a.toLowerCase() : a;
    console.log(`  Type one of: ${choices.join(', ')}`);
  }
}
const yesNo = async (q, def) => (await ask(q, def ? 'y' : 'n', ['y', 'n', 'yes', 'no'], 'y/n')).startsWith('y');

console.log(`\n${bold('Clayducation setup')}\nThis installs the Clayducation skill for Claude Code. It asks 4 questions,\nthen shows the plan before it changes anything.\n`);
for (const [name, ok, note, needed] of checks) console.log(`  ${ok ? 'ok  ' : needed ? 'MISS' : 'miss'}  ${name.padEnd(7)} ${note}`);
console.log(`  info  ${'gpu'.padEnd(7)} ${gpuNote}\n`);
if (checks.some(([, ok, , needed]) => needed && !ok)) {
  console.log('Install the items marked MISS first, then run this again.');
  process.exit(1);
}

const skillLink = path.join(HOME, '.claude', 'skills', 'clayducation');
const dir = untilde(dirArg || await ask(`1. Install folder`, '~/.claude/skills/clayducation'));
// Before the rename, the skill was "Kaleidoscope" in ~/.claude/skills/kaleidoscope. Move that copy
// to the new folder, so its voice and Manim environments stay, and point it at the renamed repository.
const oldDir = path.join(HOME, '.claude', 'skills', 'kaleidoscope');
const moveOld = !fs.existsSync(dir) && fs.existsSync(path.join(oldDir, '.git'));
// The plan is made before anything moves, so every check of what is installed looks where it is now.
const base = moveOld ? oldDir : dir;
const at = (...p) => path.join(base, ...p);
// A run on an existing install keeps its settings (voice, GPU, Whisper), as /setup-clayducation left them.
const prev = (() => { try { return JSON.parse(fs.readFileSync(at('config.json'), 'utf8')); } catch { return null; } })();
const hwVoice = gpuName || appleSilicon ? 'chatterbox' : 'kokoro';
const defVoice = prev?.voice === 'kokoro' ? 'kokoro' : prev?.voice?.startsWith('chatterbox') ? 'chatterbox' : hwVoice;
console.log(`\n   chatterbox  natural voice; a 3 to 6 GB download; fast on a GPU, slow on a CPU
   kokoro      small voice model; fast on a CPU; comes with the word-timing tool`);
const voice = voiceArg || await ask('2. Voice', defVoice, VOICES);
// On an existing install the defaults are what it has, so "--yes" (as bin/update.mjs runs it) adds nothing new.
const manim = flag('--no-manim') ? false : await yesNo('\n3. Install Manim for maths scenes (about 1 GB, needs LaTeX)?', prev ? fs.existsSync(at('engine', 'manim', '.venv')) : true);
const agentsDir = path.join(HOME, '.claude', 'agents');
const agentLinked = () => fs.existsSync(agentsDir) && fs.readdirSync(agentsDir).some((f) => /^video-.*\.md$/.test(f) && fs.lstatSync(path.join(agentsDir, f)).isSymbolicLink());
const agents = flag('--no-agents') ? false : await yesNo(`4. Link the script agent into ${tilde(agentsDir)}?`, prev ? agentLinked() : true);

// ---------- the plan ----------
const exr = process.env.EXPLAINROO_HOME || path.join(HOME, '.explainroo');
const steps = [];
const run = (title, cmd, args, opts = {}) => steps.push({ title, cmd, args, ...opts });
if (moveOld) {
  steps.push({ title: `Move the old Kaleidoscope install from ${tilde(oldDir)}`, move: oldDir });
  run('Point the skill at the renamed repository', 'git', ['-C', dir, 'remote', 'set-url', 'origin', REPO]);
}
// Users get the newest release tag (vX.Y.Z), so work on main reaches them only when it is released.
// With --main, or before the first tag, the install follows main as before.
const isRepo = fs.existsSync(at('.git'));
// An existing install asks its own remote, so a copy of a fork follows the fork's releases.
const tag = MAIN ? null : isRepo && !moveOld ? newestTag('origin', base) : newestTag(REPO);
if (!MAIN && !tag) console.log('  note  No release tag found (no network, or none made yet): the install follows main.\n');
const onBranch = () => spawnSync('git', ['-C', dir, 'symbolic-ref', '-q', 'HEAD']).status === 0;
// An install on a release does not change to main only because the tag lookup failed.
if (isRepo && !tag && !MAIN && !moveOld && spawnSync('git', ['-C', base, 'symbolic-ref', '-q', 'HEAD']).status !== 0) {
  run('Keep the installed release (no newer release found)', null);
} else if (isRepo && tag) steps.push({ title: `Update the skill to release ${tag}`, fn: () => moveToTag(dir, tag) });
else if (isRepo) steps.push({
  title: 'Update the skill from main',
  // An install on a release tag has no branch to pull, so it moves to the newest main.
  fn: () => (onBranch()
    ? spawnSync('git', ['-C', dir, 'pull', '--ff-only', 'origin', 'main'], { stdio: 'inherit' }).status === 0
    : spawnSync('git', ['-C', dir, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'inherit' }).status === 0
      && spawnSync('git', ['-C', dir, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'FETCH_HEAD'], { stdio: 'inherit' }).status === 0),
});
else run(`Download the skill${tag ? ` (release ${tag})` : ''}`, 'git', ['-c', 'advice.detachedHead=false', 'clone', '--depth', '1', ...(tag ? ['--branch', tag] : []), REPO, dir]);
// explainroo is installed only when its packages are there too: a failed "npm install" leaves the clone alone.
const exrCloned = fs.existsSync(path.join(exr, 'bin', 'explainroo.js'));
if (exrCloned && fs.existsSync(path.join(exr, 'node_modules'))) run('Word timing (explainroo) is installed', null);
else {
  if (!exrCloned) run('Download explainroo (word timing, Kokoro voice)', 'git', ['clone', '--depth', '1', EXPLAINROO, exr]);
  run('Install explainroo', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: exr });
}
run('Fetch the Whisper and Kokoro models', 'node', [path.join(exr, 'bin', 'explainroo.js'), 'doctor', '--fetch'], { cwd: exr });
const needUv = (voice === 'chatterbox' || manim) && !has('uv');
if (needUv) run('Install uv (Python tool)', 'sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh']);
const uv = needUv ? path.join(HOME, '.local', 'bin', 'uv') : 'uv';
if (voice === 'chatterbox') {
  const tts = path.join(dir, 'engine', 'tts');
  const py = path.join(tts, '.venv', 'bin', 'python');
  // NVIDIA: Chatterbox pins torch 2.6, which lacks RTX 50 support, so take 2.9.1 for CUDA 12.8.
  // Without NVIDIA: the CPU build of torch on Linux (much smaller); the default build on a Mac.
  const torchArgs = gpuName
    ? ['--override', path.join(tts, 'torch-overrides.txt'), '--index', 'https://download.pytorch.org/whl/cu128', '--index-strategy', 'unsafe-best-match']
    : mac ? [] : ['--index', 'https://download.pytorch.org/whl/cpu', '--index-strategy', 'unsafe-best-match'];
  // Never make a venv where one is: uv asks to replace it, and Enter (yes) deletes the voice.
  if (!fs.existsSync(at('engine', 'tts', '.venv', 'bin', 'python'))) run('Make the voice environment', uv, ['venv', '--python', '3.12', path.join(tts, '.venv')]);
  run(`Install Chatterbox (${gpuName ? 'CUDA' : mac ? 'Metal or CPU' : 'CPU'})`, uv, ['pip', 'install', '--python', py, ...torchArgs, 'chatterbox-tts', 'setuptools<81'], { env: { UV_HTTP_TIMEOUT: '600' } });
  // The large Whisper (make config --whisper large) runs in the same environment.
  run('Install faster-whisper (large Whisper for word timing)', uv, ['pip', 'install', '--python', py, 'faster-whisper', 'librosa']);
}
if (manim) {
  const m = path.join(dir, 'engine', 'manim');
  if (!fs.existsSync(at('engine', 'manim', '.venv', 'bin', 'python'))) run('Make the Manim environment', uv, ['venv', '--python', '3.12', path.join(m, '.venv')]);
  run('Install Manim', uv, ['pip', 'install', '--python', path.join(m, '.venv', 'bin', 'python'), 'manim']);
}
if (agents) steps.push({ title: `Link the script agent into ${tilde(agentsDir)}`, link: 'agents' });
steps.push({ title: 'Add the /setup-clayducation command', link: 'setup' });
// Claude Code finds skills only in ~/.claude/skills, so a skill in another folder gets a link there.
if (path.resolve(dir) !== skillLink) steps.push({ title: `Link the skill as ${tilde(skillLink)}`, link: 'skill' });
// The large Whisper is the default on an NVIDIA GPU; on a Mac or a CPU it is slower, so the small one stays.
// Settings that are already there stay: a Turbo voice stays Turbo when the answer is chatterbox.
const keepTurbo = voice === 'chatterbox' && prev?.voice === 'chatterbox-turbo';
const gpuSetting = prev?.gpu || 'auto';
const whisperSetting = prev?.whisper || (voice === 'chatterbox' && gpuName ? 'large' : 'base');
run('Save the settings', 'node', [path.join(dir, 'engine', 'make.mjs'), 'config', '--voice', keepTurbo ? 'chatterbox-turbo' : voice, '--gpu', gpuSetting, '--whisper', whisperSetting]);
run('Compute the clay shapes', 'node', [path.join(dir, 'engine', 'make.mjs'), 'bake'], { mayFail: true });
run('Check everything', 'node', [path.join(dir, 'engine', 'make.mjs'), 'doctor'], { mayFail: true });

console.log(`\n${bold('Plan')}`);
steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.title}${s.cmd ? `\n      ${[s.cmd, ...s.args].map(tilde).join(' ')}` : ''}`));
if (manim && !checks.find(([n]) => n === 'latex')[1]) console.log(`\n  Note: Manim needs LaTeX for formulas. ${checks.find(([n]) => n === 'latex')[2]}`);
if (!mac && manim) console.log(`  Note: on Linux, Manim also needs: sudo apt install libcairo2-dev libpango1.0-dev pkg-config`);
if (DRY) { console.log('\nDry run: nothing changed.'); rl.close(); process.exit(0); }
if (!YES && !(await yesNo('\nGo?', true))) { console.log('Stopped. Nothing changed.'); rl.close(); process.exit(0); }
rl.close();

// ---------- do it ----------
for (const [i, s] of steps.entries()) {
  console.log(`\n${bold(`[${i + 1}/${steps.length}] ${s.title}`)}`);
  if (s.move) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.renameSync(s.move, dir);
    // The old /setup-kaleidoscope link and the agent links point into the old folder.
    const oldSetup = path.join(HOME, '.claude', 'skills', 'setup-kaleidoscope');
    if (fs.lstatSync(oldSetup, { throwIfNoEntry: false })?.isSymbolicLink()) fs.rmSync(oldSetup);
    for (const f of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir) : []) {
      const a = path.join(agentsDir, f);
      if (!fs.lstatSync(a).isSymbolicLink()) continue;
      const target = fs.readlinkSync(a);
      if (!target.startsWith(s.move + path.sep)) continue;
      fs.rmSync(a);
      fs.symlinkSync(path.join(dir, path.relative(s.move, target)), a);
    }
    // The Python environments keep absolute paths: the shared-torch .pth file and the script
    // first lines. Write the new folder into them, or the voice cannot find PyTorch.
    const oldPath = s.move + path.sep, newPath = dir + path.sep;
    for (const venv of ['tts/.venv', 'tts/.venv-turbo', 'manim/.venv'].map((v) => path.join(dir, 'engine', v))) {
      if (!fs.existsSync(venv)) continue;
      const files = [];
      const bin = path.join(venv, 'bin');
      if (fs.existsSync(bin)) for (const f of fs.readdirSync(bin)) files.push(path.join(bin, f));
      const lib = path.join(venv, 'lib');
      for (const py of fs.existsSync(lib) ? fs.readdirSync(lib) : []) {
        const site = path.join(lib, py, 'site-packages');
        if (fs.existsSync(site)) for (const f of fs.readdirSync(site)) if (f.endsWith('.pth')) files.push(path.join(site, f));
      }
      files.push(path.join(venv, 'pyvenv.cfg'));
      for (const f of files) {
        const st = fs.lstatSync(f, { throwIfNoEntry: false });
        if (!st?.isFile() || st.size > 1e6) continue;
        const text = fs.readFileSync(f, 'latin1');
        if (text.includes(oldPath)) fs.writeFileSync(f, text.replaceAll(oldPath, newPath), 'latin1');
      }
    }
    continue;
  }
  if (s.link === 'agents') {
    fs.mkdirSync(agentsDir, { recursive: true });
    for (const f of fs.readdirSync(path.join(dir, 'agents')).filter((f) => /^video-.*\.md$/.test(f))) {
      const to = path.join(agentsDir, f);
      fs.rmSync(to, { force: true });
      fs.symlinkSync(path.join(dir, 'agents', f), to);
    }
    continue;
  }
  if (s.link === 'setup') {
    const to = path.join(HOME, '.claude', 'skills', 'setup-clayducation');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.rmSync(to, { force: true, recursive: false });
    fs.symlinkSync(path.join(dir, 'setup'), to);
    continue;
  }
  if (s.link === 'skill') {
    const st = fs.lstatSync(skillLink, { throwIfNoEntry: false });
    if (st && !st.isSymbolicLink()) { console.log(`  ${tilde(skillLink)} is a folder already, so Claude Code uses that copy, not ${tilde(dir)}.`); continue; }
    fs.mkdirSync(path.dirname(skillLink), { recursive: true });
    if (st) fs.rmSync(skillLink);
    fs.symlinkSync(dir, skillLink);
    continue;
  }
  if (s.fn) {
    if (!s.fn()) { console.log(`\nStep ${i + 1} failed. Fix the error above, then run the setup again: it skips what is done.`); process.exit(1); }
    continue;
  }
  if (!s.cmd) continue;
  const r = spawnSync(s.cmd, s.args, { stdio: 'inherit', cwd: s.cwd, env: { ...process.env, ...s.env } });
  if (r.status !== 0 && !s.mayFail) {
    console.log(`\nStep ${i + 1} failed. Fix the error above, then run the setup again: it skips what is done.`);
    process.exit(1);
  }
}
console.log(`\n${bold('Done.')} In Claude Code, ask for a video, for example:
  "Make a video explaining how a Kalman filter works."
Change the voice later with /setup-clayducation.`);
