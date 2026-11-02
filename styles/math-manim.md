# Math (Manim)

**Good for:** vectors, matrices, linear maps, eigenvectors and eigenvalues, PCA, SVD,
covariance, Gaussians, Mahalanobis distance, gradient descent, loss surfaces, any 2D or
3D geometry, and formulas that change step by step.

These scenes are drawn by **Manim Community** (the library behind 3Blue1Brown's look), not
by this engine. You write them in `manim_scenes.py`. `make manim` renders them on the
narration's clock, and the engine shows their frames in the video like any other scene.

The plane is the picture. Do not show a formula alone: show what it does to the plane,
then show the formula next to it, with each symbol coloured like the thing it names.

## Files

```
manim_scenes.py   class <scene_id>(Timed, Scene) for each Manim scene ("-" in the id becomes "_")
scenes.js         scene('<scene_id>', manim())  for each of them
```

`from xv import *` gives you all of Manim, plus `Timed` and the colour map `XV`.

## The clock (Timed)

| Call | Does |
|---|---|
| `self.play_at(cue, *anims, run_time=)` | waits until the cue, then plays. Cue = `'#marker'` or a spoken word (`n=2` for the second time) |
| `self.wait_until(cue, offset=0)` | waits until the cue. `self.wait_until(self.dur - 1.0)` = 1 s before the scene ends |
| `self.at(cue)`, `self.now`, `self.dur` | cue time, time now, scene length (seconds in the scene) |
| `self.trace('name', mobject)` | the physics review follows its centre every frame |

- Nothing starts before its cue. When an animation runs past the next cue, `make manim`
  and `make check` print "started late". Shorten the animation or move the cue.
- The scene always lasts exactly its narration: Timed waits at the end.
- Durations are rounded to whole frames, so the picture never drifts from the voice.

## Look

| Role | `XV[...]` | Colour |
|---|---|---|
| background | `bg` | `#14161f` |
| moving grid / original grid kept faint | `grid` / `old` | `#2a3352` / `#1d2233` |
| axes | `axis` | `#6b7394` |
| text and TeX | `ink` | `#e8e9f3` |
| first eigenvector, and **v** in formulas | `a` | `#ffd166` |
| second eigenvector | `b` | `#f2668b` |
| a vector that is not special (the counter-example) | `other` | `#7aa2ff` |
| λ, eigenvalues, scale factors, every time | `lam` | `#ff8c42` |
| greyed, before it matters | `dim` | `#8a90a8` |

- **One colour, one meaning, in every scene.** Never reuse a colour for something else.
- One unit = 1 Manim unit (135 px). **One origin for the whole video**; move it only with
  a visible slide, never with a cut.
- Labels: `MathTex` 40 to 52, next to the tip. Words: `Text(..., font='Inter')` 36 to 44.
- Vectors from the origin, stroke 8, tip 0.3.

## Motion

- A matrix acts on the whole plane: `plane.animate.apply_matrix(M, about_point=O)` over
  2 to 2.5 s with `smooth`, and the vectors move with the same `ValueTracker` k and the
  same rate function (`lerp_m(k) = I + k (M - I)`), so they stay on the grid.
- **Keep a ghost** (opacity 0.3) of the vector before it moves, so "longer", "turned" and
  "the same" can be seen, not only heard.
- A label never changes value during a move. Fade the old one out when the move starts,
  fade the new one in on the word that says the new value.
- Entrances: grow with `ease_out_back` over 0.5 to 0.7 s; labels fade in over 0.3 to 0.4 s.
- A formula term changes colour on the word that names it. A number on the plane becomes
  the number in the formula with `TransformFromCopy` (the "× 3" becomes "λ = 3").
- **Carry each cut.** End a scene in the state the next one starts from (for example, the
  plane back at the identity), or wipe in the next scene's background colour.

## Code traps

- `always_redraw` arrows are rebuilt every frame: an animation on them (`Indicate`,
  `set_color`, `set_opacity`) is lost. Drive colour and opacity from a `ValueTracker`
  inside the redraw function, and use `Flash(point)` to point at a tip.
- A zero-length `Arrow` breaks: grow from 0.02, not 0.
- `Text` uses Pango and system fonts (Inter is installed). `MathTex` needs LaTeX.

## Avoid

A formula with no picture next to it. More than 3 vectors moving at once (16 is fine when
they are one group that moves together). Values that do not match the picture: if
M = [[2, 1], [1, 2]], the arrow at (3, 3) is really at (3, 3). A motion that no real matrix
makes: drive every move with the real matrix. Camera moves unless the topic is 3D.

## Build

```python
from xv import *
import numpy as np

O = np.array([-0.8, -0.6, 0.0])                   # one origin for the whole video
MAT = np.array([[2.0, 1.0], [1.0, 2.0]])
P = lambda x, y: O + np.array([x, y, 0.0])
lerp_m = lambda k: np.eye(2) + k * (MAT - np.eye(2))

def planes():
    old = NumberPlane(x_range=[-24, 24, 1], y_range=[-16, 16, 1],
                      background_line_style={'stroke_color': XV['old'], 'stroke_width': 2},
                      axis_config={'stroke_color': XV['old'], 'stroke_width': 2}).shift(O)
    plane = NumberPlane(x_range=[-24, 24, 1], y_range=[-16, 16, 1],
                        background_line_style={'stroke_color': XV['grid'], 'stroke_width': 2},
                        axis_config={'stroke_color': XV['axis'], 'stroke_width': 3}).shift(O)
    return old, plane

def vec(v, color, k, g):
    return always_redraw(lambda: Arrow(P(0, 0), P(*(lerp_m(k.get_value()) @ np.array(v) * max(g.get_value(), 0.02))),
                                       buff=0, color=color, stroke_width=8, tip_length=0.3, max_tip_length_to_length_ratio=0.45))

class stay(Timed, Scene):
    def construct(self):
        old, plane = planes()
        self.add(old, plane)
        k, g = ValueTracker(0), ValueTracker(0)
        arrow = self.trace('vector (1, 1)', vec((1, 1), XV['a'], k, g))
        self.add(arrow)
        label = MathTex('(1, 1)', color=XV['a'], font_size=40).next_to(P(1, 1), RIGHT)
        self.play_at('#vector', g.animate(rate_func=rate_functions.ease_out_back).set_value(1), FadeIn(label), run_time=0.6)
        self.add(Arrow(P(0, 0), P(1, 1), buff=0, color=XV['a'], stroke_width=8).set_opacity(0.3))   # ghost
        self.play_at('#apply', FadeOut(label), run_time=0.3)
        self.play(k.animate.set_value(1), plane.animate.apply_matrix(MAT, about_point=O), run_time=2.5, rate_func=smooth)
        self.play_at('#lands', FadeIn(MathTex('(3, 3)', color=XV['a'], font_size=40).next_to(P(3, 3), RIGHT)), run_time=0.4)
```

A full example with six scenes: `~/Videos/explainers/eigenvectors/manim_scenes.py`.
