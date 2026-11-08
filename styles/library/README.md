# Shared library

The engine serves this folder at `/_lib/`. Import from it in a project's `scenes.js`:

```js
import { BG } from '/_lib/clay.js';
import { eqn, rays } from '/_lib/eqn.js';
```

`s.clay()` itself needs no import. Read `../clay.md` before you use the kit.

| File | Items |
|---|---|
| `clay.js` | `clay(s, {bg, fov})` and `BG`; on the returned `g`: `mascot`, `model`, `arrow`, `ball`, `post`, `ground`, `orbit`, `screen`, `render`, `ready`; the measures behind `make collide` (objects, the mascot's own body, holds, text, frame edges) |
| `clay/sdf.js` | signed distance shapes: `smin`, `smax`, `ell`, `cone`, `rbox`, `rcyl`, `torus`, `thin`; `mesh` (surface nets), `normalAt`, `ao` |
| `clay/mascot.js` | `createMascot`: expressions, poses, `place`, `route`, `stride`, `reach`, `hold`, `blink`; `studio`; `bake` |
| `clay/models.js` | `MODELS` (28 models) and `JOINS`; `buildModel` returns `{ root, groups, setPose, label, moving, hasPose }` |
| `clay/joins.js` | `measureJoins`: each listed join must touch, for `make attached` |
| `clay/sheet.html` | the page that `make clay` uses for the vetting sheets |
| `eqn.js` | `eqn()`: terms that build, slide, hop, merge, cancel with a strike and a burst, and bounce; `rays()` |

## Rules

- **Our own models only.** A new model goes into `clay/models.js` with its joins, then `make bake`,
  `make attached` and `make clay` to look at it.
- **Tested only.** A new item goes in after it passed `make look` in a real video.
- A module must not depend on time except through its arguments, so frames can be drawn in any order.
