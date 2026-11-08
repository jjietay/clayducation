# Flat vector explainer

**Good for:** processes, cause and effect, system overviews, hooks and recaps, any topic
for a viewer who is new to it.

## Look

| Role | Colour |
|---|---|
| background | `#fdf6ec` |
| ink (outlines, text) | `#2b2d42` |
| accents | `#ff6b35`, `#4ecdc4`, `#ffd23f` |

- Geometric shapes. Simple characters built from circles and rounded rectangles.
- Flat fills only. Outlines at least 3 px. 4 to 5 colours in total.
- Text: `Plus Jakarta Sans` 700 for titles (80 to 110 px), 600 for labels (40 to 56 px).

## Motion

- Entrances overshoot with `bezier(0.34, 1.56, 0.64, 1)` (`E.overshoot`) and settle within 12 frames (0.4 s).
- Groups stagger by 3 frames (0.1 s).
- A scene change is a shape that grows to fill the frame and becomes the next background. No crossfades.

## Avoid

Gradients, shadows, glow, crossfades, more than 5 colours, outlines under 3 px, text on top of shapes it does not label.

## Build

SVG (`s.svg()` + `el()`) or canvas. Entrance of a group:
```js
items.forEach((n, i) => { const k = s.p(s.at('#parts') + i * 0.1, 0.4, E.overshoot); set(n, { scale: k, opacity: Math.min(1, k * 3) }); });
```
Scene change: in the last 0.5 s of the scene, grow a circle in the next scene's `bg` from the
object that leads into it until it covers the frame (radius 2300 px).
