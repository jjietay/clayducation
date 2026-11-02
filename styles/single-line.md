# Single continuous line drawing

**Good for:** signals and waveforms (I2C, UART, PWM), a path a robot follows, a curve
(a function, a loss curve), a story told as one connected drawing.

## Look

| Role | Colour |
|---|---|
| background | warm paper `#faf7f0` |
| ink | `#1a1a1a` |
| one accent | `#c1121f` |

- One line, round caps, a constant 4 px width.
- Labels in `Kalam` or `Patrick Hand`, 40 to 52 px, written near the line, never over it.

## Motion

- The line draws itself at a steady linear speed of about 800 px/s and never lifts.
- Each picture becomes the next by continuing the line.
- The camera pans to keep the pen tip in the middle third of the frame.
- One moment where a closed shape floods with the accent colour on a beat.

## Avoid

A second line, a change of width, easing on the drawing speed, more than one flood, fills other than the flood.

## Build

Build the whole drawing as one long point list in setup (resample each part and join
them). In draw, `const drawn = polySlice(pts, (s.t - start) * 800)`; the pen tip is
`drawn.at(-1)`. Move a camera offset with `c.setTransform(1, 0, 0, 1, -camX, -camY)` so the
tip stays between x 640 and 1280. For the flood, fill the closed sub-path on the cue word.
For a waveform (I2C SDA and SCL), draw the two lines one under the other as parts of the
same path, joined by a short link off the side.
