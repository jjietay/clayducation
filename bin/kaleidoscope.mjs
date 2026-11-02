#!/usr/bin/env node
// Kaleidoscope setup: installs the Claude Code skill and what it needs, after a few questions.
// npm 12 blocks packages from git unless --allow-git=all is given; older npm ignores the flag.
//   npx --allow-git=all github:jjietay/kaleidoscope            ask the questions, show the plan, then install
//   npx --allow-git=all github:jjietay/kaleidoscope --yes      take every default
//   npx --allow-git=all github:jjietay/kaleidoscope --dry-run  show the plan and the commands, change nothing
// Other flags: --dir <path>, --budget high|medium|low, --voice chatterbox|kokoro, --no-manim, --no-agents.
// Run it again at any time: it updates the skill and installs only what is missing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';

// KALEIDOSCOPE_REPO: clone from another place, for example a local copy when you test this file.
const REPO = process.env.KALEIDOSCOPE_REPO || 'https://github.com/jjietay/kaleidoscope.git';
const EXPLAINROO = 'https://github.com/vincentsch/explainroo';
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const YES = flag('--yes') || flag('-y'), DRY = flag('--dry-run');
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
async function ask(q, def, choices) {
  if (YES) return def;
  for (;;) {
    const a = (await rl.question(`${q} [${def}]: `)).trim() || def;
    if (!choices || choices.includes(a.toLowerCase())) return choices ? a.toLowerCase() : a;
    console.log(`  Type one of: ${choices.join(', ')}`);
  }
}
const yesNo = async (q, def) => (await ask(q, def ? 'y' : 'n', ['y', 'n', 'yes', 'no'])).startsWith('y');

console.log(`\n${bold('Kaleidoscope setup')}\nThis installs the Kaleidoscope skill for Claude Code. It asks 5 questions,\nthen shows the plan before it changes anything.\n`);
for (const [name, ok, note, needed] of checks) console.log(`  ${ok ? 'ok  ' : needed ? 'MISS' : 'miss'}  ${name.padEnd(7)} ${note}`);
console.log(`  info  ${'gpu'.padEnd(7)} ${gpuNote}\n`);
if (checks.some(([, ok, , needed]) => needed && !ok)) {
  console.log('Install the items marked MISS first, then run this again.');
  process.exit(1);
}

const dir = untilde(opt('--dir') || await ask(`1. Install folder`, '~/.claude/skills/kaleidoscope'));
console.log(`\n   high    2 review rounds, 6 reviewers, Opus for the hard checks (most tokens)
   medium  1 round, 6 reviewers on Sonnet, the fact check on Opus
   low     1 round, 2 reviewers on Sonnet (fewest tokens)`);
const budget = opt('--budget') || await ask('2. Token budget for the review', 'medium', ['high', 'medium', 'low']);
const defVoice = gpuName || appleSilicon ? 'chatterbox' : 'kokoro';
console.log(`\n   chatterbox  natural voice; a 3 to 6 GB download; fast on a GPU, slow on a CPU
   kokoro      small voice model; fast on a CPU; comes with the word-timing tool`);
const voice = opt('--voice') || await ask('3. Voice', defVoice, ['chatterbox', 'kokoro']);
const manim = flag('--no-manim') ? false : await yesNo('\n4. Install Manim for maths scenes (about 1 GB, needs LaTeX)?', true);
const agentsDir = path.join(HOME, '.claude', 'agents');
const agents = flag('--no-agents') ? false : await yesNo(`5. Link the 7 reviewer agents into ${tilde(agentsDir)}?`, true);

// ---------- the plan ----------
const exr = process.env.EXPLAINROO_HOME || path.join(HOME, '.explainroo');
const steps = [];
const run = (title, cmd, args, opts = {}) => steps.push({ title, cmd, args, ...opts });
const isRepo = fs.existsSync(path.join(dir, '.git'));
if (isRepo) run('Update the skill', 'git', ['-C', dir, 'pull', '--ff-only']);
else run('Download the skill', 'git', ['clone', '--depth', '1', REPO, dir]);
if (fs.existsSync(path.join(exr, 'bin', 'explainroo.js'))) run('Word timing (explainroo) is installed', null);
else {
  run('Download explainroo (word timing, Kokoro voice)', 'git', ['clone', '--depth', '1', EXPLAINROO, exr]);
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
  if (!fs.existsSync(py)) run('Make the voice environment', uv, ['venv', '--python', '3.12', path.join(tts, '.venv')]);
  run(`Install Chatterbox (${gpuName ? 'CUDA' : mac ? 'Metal or CPU' : 'CPU'})`, uv, ['pip', 'install', '--python', py, ...torchArgs, 'chatterbox-tts', 'setuptools<81'], { env: { UV_HTTP_TIMEOUT: '600' } });
}
if (manim) {
  const m = path.join(dir, 'engine', 'manim');
  if (!fs.existsSync(path.join(m, '.venv', 'bin', 'python'))) run('Make the Manim environment', uv, ['venv', '--python', '3.12', path.join(m, '.venv')]);
  run('Install Manim', uv, ['pip', 'install', '--python', path.join(m, '.venv', 'bin', 'python'), 'manim']);
}
if (agents) steps.push({ title: `Link the reviewer agents into ${tilde(agentsDir)}`, link: 'agents' });
steps.push({ title: 'Add the /setup-kaleidoscope command', link: 'setup' });
run('Save the settings', 'node', [path.join(dir, 'engine', 'make.mjs'), 'config', '--budget', budget, '--voice', voice, '--gpu', 'auto']);
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
    const to = path.join(HOME, '.claude', 'skills', 'setup-kaleidoscope');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.rmSync(to, { force: true, recursive: false });
    fs.symlinkSync(path.join(dir, 'setup'), to);
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
Change the budget or the voice later with /setup-kaleidoscope.`);
