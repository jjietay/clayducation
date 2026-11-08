# Install

The easy way is the setup command. It asks questions, shows the plan, and installs only
what you choose:

```bash
npx kaleidoscope-video            # or add --yes to take every default
```

Without an NVIDIA GPU or Apple silicon, choose the Kokoro voice: it is fast on a CPU. Chrome
then draws the frames with SwiftShader and ffmpeg encodes with libx264, so a render takes
longer. Change the settings later with `/setup-kaleidoscope` in Claude Code, or with
`node engine/make.mjs config`.

## Manual setup

You need Node 22+, Google Chrome or Chromium, ffmpeg, Python 3.12 with
[uv](https://docs.astral.sh/uv/), and for the Chatterbox voice a GPU.

```bash
git clone https://github.com/jjietay/kaleidoscope.git ~/.claude/skills/kaleidoscope
cd ~/.claude/skills/kaleidoscope

# The script agent: Claude Code reads it from ~/.claude/agents
mkdir -p ~/.claude/agents
for f in agents/video-*.md; do ln -sf "$PWD/$f" ~/.claude/agents/; done
# The /setup-kaleidoscope command (voice, GPU)
ln -sfn "$PWD/setup" ~/.claude/skills/setup-kaleidoscope

# Word timing: explainroo (its Whisper model). doctor --fetch also gets the Kokoro voice model,
# which the engine uses on a computer without a GPU.
git clone --depth 1 https://github.com/vincentsch/explainroo ~/.explainroo
(cd ~/.explainroo && npm install && node bin/explainroo.js doctor --fetch)

# Voice: Chatterbox, for an NVIDIA GPU (skip it without one, and use Kokoro: see the end).
# Chatterbox pins torch 2.6, which has no Blackwell (RTX 50) support,
# so override it; perth (its watermark) needs pkg_resources from setuptools < 81.
(cd engine/tts && uv venv --python 3.12 .venv && UV_HTTP_TIMEOUT=600 uv pip install --python .venv/bin/python \
  --override torch-overrides.txt --index https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match \
  chatterbox-tts "setuptools<81")

# Optional, to save about 7 GB: use the PyTorch of another environment instead (on the user's
# laptop: /path/to/other/.venv, torch 2.11.0+cu128). Remove the voice env's own copy, link only
# torch and its CUDA libraries in, and add the matching torchaudio:
#   V=engine/tts/.venv; L=/path/to/other/.venv/lib/python3.12/site-packages
#   uv pip uninstall --python $V/bin/python torch torchaudio triton $(ls $V/lib/python3.12/site-packages | grep -oE '^nvidia_[a-z0-9_]+' | sed 's/_/-/g' | sort -u)
#   mkdir -p $V/shared-torch && for n in torch torchgen functorch triton nvidia $(cd $L && ls -d torch-*.dist-info triton-*.dist-info nvidia_*.dist-info); do ln -sfn $L/$n $V/shared-torch/$n; done
#   echo "$PWD/$V/shared-torch" > $V/lib/python3.12/site-packages/_shared_torch.pth
#   uv pip install --python $V/bin/python --no-deps --index https://download.pytorch.org/whl/cu128 "torchaudio==2.11.0+cu128"
#   uv cache clean torch torchaudio triton   # and the nvidia-* names above, to free the space
# If that environment's torch changes, the voice breaks: make doctor shows it.

# Maths scenes: Manim Community
sudo apt install ffmpeg texlive texlive-latex-extra dvisvgm libcairo2-dev libpango1.0-dev pkg-config
(cd engine/manim && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python manim)

# Settings: the voice (chatterbox, or kokoro without a GPU). Then compute the clay shapes.
node engine/make.mjs config --voice chatterbox
node engine/make.mjs bake
node engine/make.mjs doctor
```
