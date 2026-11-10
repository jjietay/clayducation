// Releases are git tags named vX.Y.Z, and each one has the same version in package.json.
// The installer and bin/update.mjs use this file to find the newest release and move an install to it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const parse = (v) => v?.replace(/^v/, '').split('.').map(Number);
const valid = (v) => /^v?\d+\.\d+\.\d+$/.test(v || '');

// The version in the install's package.json, or null.
export function localVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch { return null; }
}

// True when version a is newer than version b ("0.4.0" or "v0.4.0").
export function isNewer(a, b) {
  if (!valid(a)) return false;
  if (!valid(b)) return true;
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// The newest vX.Y.Z tag on a remote (a URL, or "origin" with cwd set), or null when there is none
// or the remote cannot be reached in 15 s.
export function newestTag(remote, cwd) {
  const r = spawnSync('git', ['ls-remote', '--tags', '--refs', remote, 'v*'], { cwd, encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) return null;
  const tags = r.stdout.split('\n').map((l) => l.split('refs/tags/')[1]).filter(valid);
  return tags.reduce((best, t) => (isNewer(t, best) ? t : best), null);
}

const git = (dir, args) => spawnSync('git', ['-C', dir, ...args], { stdio: 'inherit' }).status === 0;
const quiet = (dir, args) => spawnSync('git', ['-C', dir, ...args], { stdio: 'ignore' }).status === 0;

// Move the install in dir to the release tag. An install that already has the tag in its history
// stays where it is (a copy of main that is newer than the release, or a developer's checkout).
// A shallow clone cannot always see that history, so a newer version in package.json also keeps it.
// Uncommitted changes that the new files would overwrite stop it: git then names the files.
export function moveToTag(dir, tag) {
  if (isNewer(localVersion(dir), tag)) {
    console.log(`  The install (${localVersion(dir)}) is newer than ${tag}.`);
    return true;
  }
  const shallow = spawnSync('git', ['-C', dir, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).stdout.trim() === 'true';
  if (!git(dir, ['fetch', '--quiet', '--no-tags', ...(shallow ? ['--depth', '1'] : []), 'origin', 'tag', tag])) return false;
  if (quiet(dir, ['merge-base', '--is-ancestor', tag, 'HEAD'])) {
    console.log(`  The install already has ${tag}.`);
    return true;
  }
  return git(dir, ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', tag]);
}
