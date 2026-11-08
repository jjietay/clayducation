"""Hears the voice takes with a large Whisper model, for the voice check only.

The small Whisper of the word timing (explainroo, base.en) writes what a sentence should say:
it merged "P C" into "PC" and dropped a doubled "one", so slips that the user heard passed.
A large model hears more exactly. The cue timing still comes from explainroo.

Usage: python hear.py <list.json> <model>
list.json: ["take.wav", ...]. For each take it writes take.heard-<model>.json:
[{"text": "word", "start": s, "end": s}, ...]. A take that has its file already is skipped.
"""
import json
import os
import sys

import librosa

try:
    # PyTorch loads its own CUDA libraries (cuBLAS, cuDNN) globally on import, so the GPU
    # build of ctranslate2 finds them. Without it: "libcublas.so.12 is not found".
    import torch  # noqa: F401
except ImportError:
    pass
from faster_whisper import WhisperModel


def load(name):
    # The GPU when it works, else the CPU: the check must not need a GPU.
    try:
        return WhisperModel(name, device="cuda", compute_type="float16")
    except Exception as e:
        print(f"hear: no GPU for Whisper ({str(e).splitlines()[0][:80]}), using the CPU")
        return WhisperModel(name, device="cpu", compute_type="int8")


def hear(model, audio):
    segments, _ = model.transcribe(audio, language="en", word_timestamps=True, beam_size=5,
                                   condition_on_previous_text=False, vad_filter=False)
    return [{"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
            for s in segments for w in (s.words or [])]


def main():
    takes, name = json.load(open(sys.argv[1])), sys.argv[2]
    todo = [t for t in takes if not os.path.exists(t.replace(".wav", f".heard-{name}.json"))]
    if not todo:
        return
    model = load(name)
    for t in todo:
        # Samples, not a path: faster-whisper opens a path with an option that new PyAV refuses.
        audio, _ = librosa.load(t, sr=16000, mono=True)
        try:
            words = hear(model, audio)
        except RuntimeError as e:
            # A GPU library can fail only when the model first runs: hear on the CPU instead.
            print(f"hear: GPU failed ({str(e).splitlines()[0][:80]}), using the CPU")
            model = WhisperModel(name, device="cpu", compute_type="int8")
            words = hear(model, audio)
        with open(t.replace(".wav", f".heard-{name}.json"), "w") as f:
            json.dump(words, f)
    print(f"hear: {len(todo)} take(s) heard with {name}")


if __name__ == "__main__":
    main()
