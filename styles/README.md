# Styles

Every video uses soft 3D clay, with the same silent mascot, unless the user asks for the classic 2D styles.

| File | What it holds |
|---|---|
| `clay.md` | the look, the mascot and his controls, every model and its moving parts, props, and formulas that act out the voice |
| `math-manim.md` | Manim, only for a formula that changes step by step |
| `library/clay.js` | `s.clay()`: the shared renderer, the studio, the mascot, the models, the props and the measures |
| `library/clay/` | the kit: `sdf.js` (shapes), `mascot.js`, `models.js`, `joins.js`; `make bake` saves the shapes, `make clay` draws vetting sheets |
| `library/eqn.js` | `eqn()`: formulas whose terms move, cancel and bounce on the voice |
| `classic/` | the classic 2D styles, only when the user asks for them: `README.md` chooses a style per part |
| `library/classic/` | the drawing code of the classic styles, served at `/_lib/classic/` |

Clay is the default. The classic styles use the same workflow and checks.
