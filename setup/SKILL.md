---
name: setup-clayducation
description: Set up or change the Clayducation video engine on this machine - the voice (Chatterbox or Kokoro), GPU use and the Whisper model. Use for /setup-clayducation, "switch the video voice", or "make videos without a GPU".
---

# Set up Clayducation

The settings are in `~/.claude/skills/clayducation/config.json`. Change them only with the
`config` command, so the values stay valid. In this file, `make` means
`node ~/.claude/skills/clayducation/engine/make.mjs`.

1. Run `make config` and `make doctor`. Note the current voice and GPU, and what
   `doctor` says is missing.
2. Ask the user with AskUserQuestion, in one call, the questions below. Put the current
   value first and mark it "(current)". Skip a question that the user already answered
   in their message.

   | Question | Options |
   |---|---|
   | Voice | `chatterbox`: natural, fast on an NVIDIA GPU or Apple silicon, slow on a CPU. `kokoro`: small, fast on a CPU. `auto`: Chatterbox if it is installed, else Kokoro |
   | GPU | `auto`: use the GPU if the engine finds one (NVIDIA, or Metal and VideoToolbox on a Mac). `off`: always use the CPU |
   | Whisper | `large`: large-v3-turbo, more exact word times and voice checks, best on an NVIDIA GPU (about 1.6 GB, needs Chatterbox's environment). `base`: small and fast, the right choice on a CPU |

3. Run `make config --voice <v> --gpu <g> --whisper <w>`, then `make bake` if `styles/library/clay/cache` is empty.
4. If the voice is `chatterbox` and `doctor` says Chatterbox is not installed, tell the user
   to run `npx clayducation` in a terminal and choose `chatterbox`. It
   installs only what is missing. Do not install it yourself: it is a large download.
5. Run `make doctor` again and report the new settings in two or three lines.
