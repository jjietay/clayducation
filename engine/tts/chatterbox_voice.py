"""It takes a jobs file (scenes, each a list of text parts with the silence after each) and
gives you each part spoken by Chatterbox's built-in voice at a calm pace, as cached WAVs
listed in jobs.json.out.json.

    .venv/bin/python chatterbox_voice.py jobs.json

jobs.json:
    {"params": {"exaggeration": 0.5, "cfg_weight": 0.5, "temperature": 0.8, "seed": 7},
     "cache": "<dir>",
     "scenes": [{"id": "knock", "out": "<file>.wav", "parts": [{"text": "...", "gap": 1.0}]}]}

Choices the user made by ear (2026-11-01), so keep them:
- A part is read in one call, so the tone carries across its sentences (one call a
  sentence made every sentence sound the same).
- The pace comes from slow-reference.wav: the built-in voice itself, slowed. Chatterbox
  copies a reference's pace, so it speaks at about 160 words a minute with every word
  made fresh. A time-stretch of the output reached the same speed but sounded muffled,
  "like a voice in another room".
- The pauses inside a part are set afterwards by make.mjs, from Whisper's word times:
  every full stop 0.6 s, every comma at most 0.3 s. (Taking the longest silences as the
  full stops failed: the voice sometimes pauses longer at a comma.)

Each part is cached by its text and the parameters: a changed sentence costs only its part.
"""
import hashlib
import json
import os
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE = os.path.join(HERE, 'slow-reference.wav')


def trim(wav, sr, keep=0.06, db=-45):
    """Cut the silence the model leaves at both ends, so the gaps are the ones we set."""
    level = 10 ** (db / 20) * max(1e-6, float(np.abs(wav).max()))
    loud = np.nonzero(np.abs(wav) > level)[0]
    if not len(loud):
        return wav
    return wav[max(0, loud[0] - int(keep * sr)):min(len(wav), loud[-1] + int(keep * sr))]


def main(path):
    jobs = json.load(open(path))
    p = jobs['params']
    os.makedirs(jobs['cache'], exist_ok=True)
    ref_hash = hashlib.sha1(open(REFERENCE, 'rb').read()).hexdigest()[:12]
    key = lambda part: hashlib.sha1(json.dumps([part['text'], part.get('seed', p.get('seed', 7)), p, ref_hash], sort_keys=True).encode()).hexdigest()[:20]
    cached = lambda part: os.path.join(jobs['cache'], key(part) + '.wav')
    todo = [part['text'] for s in jobs['scenes'] for part in s['parts'] if not os.path.exists(cached(part))]
    model = None
    if todo:
        import torch
        turbo = p.get('model') == 'turbo'
        # An NVIDIA GPU, else Apple silicon (Metal), else the CPU (slow: Kokoro is faster there).
        device = 'cuda' if torch.cuda.is_available() else 'mps' if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available() else 'cpu'
        print(f'chatterbox: {len(todo)} part(s) to speak on {device}', flush=True)
        # Chatterbox-Turbo (the user chose it by ear on 2026-11-09: it sounded best of 4, and makes audio about
        # twice as fast). It has no cfg or exaggeration: its pace comes from the reference clip alone.
        if turbo:
            from chatterbox.tts_turbo import ChatterboxTurboTTS
            model = ChatterboxTurboTTS.from_pretrained(device=device)
            model.prepare_conditionals(REFERENCE)
        else:
            from chatterbox.tts import ChatterboxTTS
            model = ChatterboxTTS.from_pretrained(device=device)
            model.prepare_conditionals(REFERENCE, exaggeration=p['exaggeration'])
    done = []
    for s in jobs['scenes']:
        for part in s['parts']:
            f = cached(part)
            if not os.path.exists(f):
                import torch
                torch.manual_seed(part.get('seed', p.get('seed', 7)))
                if turbo: wav = model.generate(part['text'], temperature=p['temperature']).squeeze(0).cpu().numpy()
                else: wav = model.generate(part['text'], exaggeration=p['exaggeration'], cfg_weight=p['cfg_weight'],
                                          temperature=p['temperature']).squeeze(0).cpu().numpy()
                sf.write(f, trim(wav, model.sr), model.sr)
            part['raw'] = f
        done.append(s)
    # make.mjs sets the pauses (it knows where each word ends) and joins the parts.
    json.dump({'scenes': done}, open(path + '.out.json', 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1])
