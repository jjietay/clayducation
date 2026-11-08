# Hand-drawn cartoon with line boil

**Good for:** "your case" stories, a bug and how it was found, a common mistake, a character
who tries something and fails. Emotion makes a lesson stick.

## Look

| Role | Colour |
|---|---|
| background | off-white `#fffaf0` |
| ink | `#1c1c1c` |
| flat fills | `#ff595e`, `#1982c4`, `#ffca3a` |

- Variable-width ink lines, no perfect geometric shapes, almost no text.
- Faces act: eyebrows, eyes and mouth change with the story.

## Motion

- 24 fps animated on twos: draw from `s.tq(12)`. Set `"fps": 24` in video.json if the whole video is in this style.
- Every line has 3 jitter variants cycled so it boils: `wobble(pts, 2.5, seed * 10 + s.boil(3, 12))`.
- Fast moves use a smear frame (one frame stretched along the motion).
- Every big action gets 4 to 6 frames (0.2 s) of anticipation: a small move the other way first.

## Avoid

Perfect circles and straight lines, smooth 60 fps motion, more than a few words of text, gradients.

## Build

Canvas. Keep each shape as a point list (resample an SVG path). Per frame:
`strokeVar(ctx, wobble(pts, 2.5, seed + s.boil()), (u) => 3 + 3 * Math.sin(Math.PI * u), '#1c1c1c')`.
Fill shapes with the same wobbled points, offset by the same seed, so the fill boils with the line.
