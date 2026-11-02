---
name: setup-kaleidoscope
description: Set up or change the Kaleidoscope video skill on this machine - the token budget of the review (high, medium, low), the voice (Chatterbox or Kokoro) and GPU use. Use for /setup-kaleidoscope, "change the Kaleidoscope budget", "use fewer tokens for videos", "switch the video voice", or "make videos without a GPU".
---

# Set up Kaleidoscope

The settings are in `~/.claude/skills/kaleidoscope/config.json`. Change them only with the
`config` command, so the values stay valid. In this file, `make` means
`node ~/.claude/skills/kaleidoscope/engine/make.mjs`.

1. Run `make config` and `make doctor`. Note the current budget, voice and GPU, and what
   `doctor` says is missing.
2. Ask the user with AskUserQuestion, in one call, the questions below. Put the current
   value first and mark it "(current)". Skip a question that the user already answered
   in their message.

   | Question | Options |
   |---|---|
   | Token budget for the review | `high`: 2 rounds, 6 reviewers, Opus for the hard checks (most tokens). `medium`: 1 round, 6 reviewers on Sonnet, the fact check on Opus. `low`: 1 round, 2 reviewers on Sonnet (fewest tokens) |
   | Voice | `chatterbox`: natural, fast on an NVIDIA GPU or Apple silicon, slow on a CPU. `kokoro`: small, fast on a CPU. `auto`: Chatterbox if it is installed, else Kokoro |
   | GPU | `auto`: use an NVIDIA GPU if the engine finds one. `off`: always use the CPU |

3. Run `make config --budget <b> --voice <v> --gpu <g>`.
4. If the voice is `chatterbox` and `doctor` says Chatterbox is not installed, tell the user
   to run `npx --allow-git=all github:jjietay/kaleidoscope` in a terminal and choose `chatterbox`. It
   installs only what is missing. Do not install it yourself: it is a large download.
5. Run `make doctor` again and report the new settings in two or three lines.

What each budget does in a video is in the skill's `SKILL.md`, section "Token budget and
machine settings".
