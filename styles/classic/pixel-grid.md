# Pixel grid

**Good for:** image processing and computer vision basics: pixels and channels,
convolution and kernels (blur, Sobel, Laplacian), thresholds, morphology (erode, dilate),
histograms, downsampling, feature maps in a CNN.

The viewer must see the numbers. Zoom in until each pixel is a cell with its value, do the
operation slowly on the first few cells, then let it run fast over the rest.

## Look

| Role | Colour |
|---|---|
| background | `#0f1115` |
| pixel cells | their real grey (or RGB) value, 2 px gap `#0f1115` |
| value text in a cell | `#111` on light cells, `#eee` on dark cells (switch at 128) |
| kernel window | `#ffb703`, 5 px outline, kernel weights in `#ffb703` |
| output grid / result | `#4cc9f0` outline; filled cells show their real value |
| text | `#e6e6e6`, `JetBrains Mono` for numbers, `Inter` for labels |

- Cells 64 to 90 px for an 8 x 8 grid. Show numbers only when cells are 48 px or more.
- Input on the left, output on the right, the sum written between them.
- Use a real small image (a digit, an edge) so the result means something.

## Motion

- Zoom from the full image into the grid over 1.5 s (`E.inOut`), on a cue.
- First 3 kernel positions: the window snaps (`E.snap`, 8 frames), each multiplied pair lights,
  the sum counts up, and the output cell fills. Hold 0.8 s at each.
- After that, the window runs over the rest at 8 to 15 positions a second. Say "and the same
  for every pixel" over it.
- Values that change roll to their new value in 6 frames.

## Avoid

Values that are not computed. Compute the output in `setup` from the real kernel and
input, and show those numbers. No blur or glow on the cells. No perspective.

## Build

```js
const img = [/* 8 rows of 8 values, 0..255 */];
const K = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];           // Sobel x
const conv = (y, x) => { let v = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) v += (img[y + j]?.[x + i] ?? 0) * K[j + 1][i + 1]; return v; };

scene('convolve', {
  bg: '#0f1115',
  setup(s) {
    s.ctx = s.canvas();
    s.out = img.map((row, y) => row.map((_, x) => conv(y, x)));   // computed once, shown as is
  },
  draw(s) {
    const c = s.ctx, cell = 72, x0 = 140, y0 = 252;
    c.clearRect(0, 0, W, H);
    img.forEach((row, y) => row.forEach((v, x) => {
      c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x0 + x * cell, y0 + y * cell, cell - 2, cell - 2);
      c.fillStyle = v > 128 ? '#111' : '#eee'; c.font = '600 22px JetBrains Mono'; c.textAlign = 'center';
      c.fillText(v, x0 + x * cell + cell / 2 - 1, y0 + y * cell + cell / 2 + 7);
    }));
    // window position: slow for the first 3 steps from cue '#slide', then fast
    const t = s.t - s.at('#slide'), slow = 1.6, n = t < 3 * slow ? Math.floor(t / slow) : 3 + Math.floor((t - 3 * slow) * 12);
    const k = clamp(n, 0, 35), wx = 1 + (k % 6), wy = 1 + Math.floor(k / 6);
    c.strokeStyle = '#ffb703'; c.lineWidth = 5;
    c.strokeRect(x0 + (wx - 1) * cell - 3, y0 + (wy - 1) * cell - 3, cell * 3 + 4, cell * 3 + 4);
  },
});
```
