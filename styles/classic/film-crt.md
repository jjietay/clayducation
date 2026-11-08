# Film, VHS and CRT eras

**Good for:** history of an idea, an old method contrasted with a new one, a flashback.

Pick one era per scene: film, tape or CRT.

## Look and motion

- Grain is seeded per frame index (`rng(Math.floor(s.t * fps))`), never `Math.random`.
- Film: about 1 px gate weave, about 5% brightness flicker, warm tint.
- Tape: 2 to 3 px chroma shift (draw red and blue channels offset), a tracking line now and then.
- CRT: scanlines every 3 px at 15% opacity, slight barrel vignette.

## Avoid

Mixing eras in one scene, effects so strong the content is hard to read.

## Build

Draw the scene content to a canvas, then a second canvas over it with the era effects.
