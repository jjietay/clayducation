// transcribeWords for explainroo, with a large Whisper model. The samples are 16 kHz mono floats.
// engine/tts/hear.py writes the words with their times; the result has explainroo's own shape.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PY = process.env.XV_TTS_PY, HEAR = process.env.XV_HEAR, MODEL = process.env.XV_WHISPER_MODEL || 'large-v3-turbo';
let n = 0;
export async function transcribeWords(samples) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xv-asr-')), wav = path.join(dir, `part${n++}.wav`), list = path.join(dir, 'list.json');
  try {
    const pcm = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
    head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(16000, 24);
    head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(wav, Buffer.concat([head, pcm]));
    fs.writeFileSync(list, JSON.stringify([wav]));
    const r = spawnSync(PY, [HEAR, list, MODEL], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`hear.py failed: ${(r.stderr || r.stdout).slice(-300)}`);
    const words = JSON.parse(fs.readFileSync(wav.replace(/\.wav$/, `.heard-${MODEL}.json`), 'utf8'));
    return { text: words.map((w) => w.text).join(' '), words };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
