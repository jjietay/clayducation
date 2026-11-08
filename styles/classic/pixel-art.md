# 16-bit pixel art

**Good for:** reinforcement learning (agent, grid world, reward, policy), search and path
planning, game-like states, retro "your case" stories.

## Look

- Render to a 320 x 180 canvas and scale 6 times without smoothing: `s.canvas({ w: 320, h: 180, pixel: true })`.
- One fixed palette: `#1a1c2c`, `#5d275d`, `#b13e53`, `#ef7d57`, `#ffcd75`, `#a7f070`, `#38b764`, `#41a6f6`, plus greys `#333c57`, `#566c86`, `#94b0c2`, `#f4f4f4`.
- Shading by dithering only: `if (shade > bayer(x, y)) fill`.
- Dialogue in a pixel font (`pixelText`) that types out (`typed`) in a bordered box.

## Motion

- Sprites animate at 8 to 12 fps: `s.tq(10)`.
- The camera moves in whole pixels: `Math.round(camX)`.
- RL: show the grid world, the agent, rewards as numbers above cells, and the value of each
  cell as a dithered shade that brightens as learning goes on.

## Avoid

Smooth gradients, anti-aliased shapes, colours outside the palette, sub-pixel positions, text drawn with fonts.

## Build

Clear and redraw the 320 x 180 canvas every frame. All positions are integers. Text:
`pixelText(c, typed(line, s.t - start, 20), x, y, '#f4f4f4')`, 6 px per character, so a
box 300 px wide holds 49 characters.
