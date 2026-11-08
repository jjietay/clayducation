# HUD and terminal

**Good for:** tokens, prompts and model output, logs, tool calls of an agent, sensor
readouts, register values, anything where the real text matters.

## Look

| Role | Colour |
|---|---|
| background | `#0a0f0d` |
| text | `#9ef0c0` |
| dim grid lines, frames | `#16332a` |
| one highlight | `#ffcc33` |

- `JetBrains Mono` on a character grid: one cell = 0.6 × font size wide, 1.25 × tall. Text 30 to 40 px.
- Two colours plus the dim grid. Brackets `[ ]` frame the thing under study.

## Motion

- Numbers roll through random glyphs for 6 to 10 frames before they lock (seeded `rng`).
- Brackets lock in 3 steps: wide, closer, on the target, 3 frames each.
- Text types at 30 to 60 characters a second; real model output may scroll.
- Tokens: split text into its real tokens and outline each token as a box when it is said.

## Avoid

Fake hacker effects (matrix rain), more than 2 colours, glow, text too small to read.

## Build

HTML `s.text(..., { font: 'JetBrains Mono' })` or canvas `fillText` on a grid. Typing: `typed(str, s.t - start, 40)`.
Rolling digit: `s.t < lock ? '0123456789'[Math.floor(r() * 10)] : real`, with `r = rng(seed + frame)`.
