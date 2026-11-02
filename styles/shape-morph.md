# Continuous shape morph

**Good for:** one idea that turns into the next: a vector becoming a matrix column, data
becoming a distribution, a pixel becoming a feature, raw signal becoming a symbol. Good
for intuition scenes.

## Look

| Role | Colour |
|---|---|
| background | `#0d1b2a` |
| shapes | `#f72585`, `#7209b7`, `#4cc9f0` |
| text | `#e0e1dd`, `Space Grotesk` |

## Motion

- No cuts. Each idea grows out of the previous shape through a readable in-between shape over 18 to 30 frames (0.6 to 1 s).
- Each finished shape holds for at least 1 s.
- Liquid moments use metaball blending, so drops merge smoothly.
- The camera stays still. The shapes do the moving.

## Avoid

Morphs faster than 18 frames, shapes that twist through themselves, hard cuts, camera moves,
more than one morph at the same time.

## Build

```js
// setup: resample both outlines to the same number of points and align their starts
s.a = resample('M760,540 a200,200 0 1,0 400,0 a200,200 0 1,0 -400,0', 160);
s.b = align(resample('M760,340 h400 v400 h-400 Z', 160), s.a[0]);
s.path = el('path', { fill: '#f72585' }, s.svg());
// draw:
s.path.setAttribute('d', pathFrom(lerpPoints(s.a, s.b, s.p('#square', 0.8, E.inOut))));
```
Metaballs: put circles in `<g filter="${goo(svg)}">` and move them together.
Because each scene draws only itself, a scene starts with the exact shape the previous scene ended with.
