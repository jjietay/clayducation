# Styles

Every video uses one look: soft 3D clay, with the same silent mascot in every video.

| File | What it holds |
|---|---|
| `clay.md` | the look, the mascot and his controls, every model and its moving parts, props, and formulas that act out the voice |
| `math-manim.md` | Manim, only for a formula that changes step by step |
| `library/clay.js` | `s.clay()`: the shared renderer, the studio, the mascot, the models, the props and the measures |
| `library/clay/` | the kit: `sdf.js` (shapes), `mascot.js`, `models.js`, `joins.js`; `make bake` saves the shapes, `make clay` draws vetting sheets |
| `library/eqn.js` | `eqn()`: formulas whose terms move, cancel and bounce on the voice |

The old 2D styles were deleted on 2026-11-08, after the first clay video passed. They are in the git
history before that date.
