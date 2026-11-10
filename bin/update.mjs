#!/usr/bin/env node
// Tells the agent when a newer Clayducation release is available, and installs it.
//   node bin/update.mjs           when a newer release is available, print it with the messages from
//                                 RELEASES.md at that release, else nothing. It asks the remote and
//                                 shows a release at most once a day; it never fails.
//   node bin/update.mjs --apply   move this install to the newest release, then run that release's
//                                 setup with --yes, so new parts are installed and the settings stay.
//   node bin/update.mjs --force   ask the remote now, not the answer saved today.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNewer, localVersion, moveToTag, newestTag } from './release.mjs';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheFile = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'clayducation', 'update.json');
const DAY = 24 * 3600 * 1000;
const local = localVersion(dir);
// "owner/repo" when origin is on GitHub, for the release page and the raw RELEASES.md.
const gh = (spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout || '')
  .trim().match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
const pageUrl = (tag) => (gh ? `https://github.com/${gh}/releases/tag/${tag}` : null);

// The messages of the releases after this install, up to tag, newest first, from RELEASES.md at tag.
// Each release there is a "## vX.Y.Z" heading and the short message under it.
async function notes(tag) {
  if (!gh) return [];
  const r = await fetch(`https://raw.githubusercontent.com/${gh}/${tag}/RELEASES.md`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const parts = (await r.text()).split(/^##\s+(v\d+\.\d+\.\d+)\s*$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1].trim();
    if (text && isNewer(parts[i], local) && !isNewer(parts[i], tag)) out.push({ version: parts[i], text });
  }
  return out;
}

if (process.argv.includes('--apply')) {
  const tag = newestTag('origin', dir);
  if (!tag) { console.log('Cannot find a release on the remote. Check the network, then try again.'); process.exit(1); }
  if (!isNewer(tag, local)) { console.log(`Clayducation ${local} is the newest release.`); process.exit(0); }
  console.log(`Update Clayducation ${local} to ${tag}.`);
  if (!moveToTag(dir, tag)) {
    console.log('\nThe update stopped. If git names files with local changes, keep a copy of them, then run: git -C ' + dir + ' checkout -- .');
    process.exit(1);
  }
  fs.rmSync(cacheFile, { force: true });
  // The setup of the new release knows the new parts; the old setup in this process does not.
  const r = spawnSync('node', [path.join(dir, 'bin', 'clayducation.mjs'), '--yes', '--dir', dir], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

try {
  let cache = null;
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  if (process.argv.includes('--force') || !cache || !(Date.now() - cache.time < DAY)) {
    const tag = newestTag('origin', dir) ?? cache?.tag ?? null;
    // With no network, try again tomorrow, not before each video.
    let found = cache?.notes || [];
    if (tag && isNewer(tag, local) && (tag !== cache?.tag || !found.length)) found = await notes(tag).catch(() => found);
    cache = { ...cache, time: Date.now(), tag, notes: found };
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  // A user who said no hears about the same release again a day later, not before each video.
  if (cache.tag && isNewer(cache.tag, local) && !(cache.shown === cache.tag && Date.now() - cache.shownTime < DAY)) {
    fs.writeFileSync(cacheFile, JSON.stringify({ ...cache, shown: cache.tag, shownTime: Date.now() }));
    // The agent shows these lines to the user as they are: keep the format plain.
    console.log(`UPDATE ${local} -> ${cache.tag}`);
    for (const n of (cache.notes || []).filter((n) => isNewer(n.version, local))) console.log(`\n${n.version}: ${n.text}`);
    if (pageUrl(cache.tag)) console.log(`\nMore: ${pageUrl(cache.tag)}`);
    console.log(`\nTo update: node ${dir}/bin/update.mjs --apply`);
  }
} catch {}
