# Shared visual library

Reusable, tested drawings for explainer videos. Use them before you draw something new, and add the new reusable things you draw after each video.

## Use it

```js
// in a project's scenes.js (the engine serves this folder at /_lib/)
import { K, BG, header, showHeader, label, lab, makeWipe, endWipe } from '/_lib/common.js';
import { barrel, folderBack, folderLip, tile } from '/_lib/flat.js';
```

The engine globals (E, clamp, lerp, mix, rng, set, el, wobble, strokeVar, iso, isoBox, bayer, pixelText, typed, goo, W, H) are on window, so the modules use them directly.

## Look at it

The gallery project (`gallery/` at the repo root) draws every item with its function name in its last 16 scenes. Its end stills are the catalogue pictures `gallery/png/library-<module>.png` (one per module; pixel has a second picture, `library-pixel2.png`, for the network characters). Look at them at storyboard time (SKILL.md step 6).

```bash
make build gallery
make still gallery common@end flat@end morph@end iso@end boil@end paper@end pixel@end pixel2@end toy3d@end riso@end blueprint@end hud@end toon@end whiteboard@end transit@end water@end
for m in common flat morph iso boil paper pixel pixel2 toy3d riso blueprint hud toon whiteboard transit; do cp gallery/build/stills/$m@end.png gallery/png/library-$m.png; done
cp gallery/build/stills/water@end.png gallery/png/library-watercolour.png
```

## Catalogue

| Module | Style file | Items |
|---|---|---|
| `common.js` | all | `C` (robotics colour roles; network roles `viewer`, `mcast`, `ucast`, `ws`), `K` (data roles: file, folder, chunk, index, source, worker, ok, bad), `BG`, `FONT`; `header`, `showHeader`, `label`, `caption`, `lab`, `wipeIn`, `pin`, `hideAll`; `pop`, `bump`, `blinkAt`, `shuffled`; `leader`, `lead`, `underLeader` (anchor 'l' labels only), `arrow`, `roundRect`, `tick`; `face` (calm, happy, worried, surprised, sad, focus); `makeWipe`, `showWipe`, `showSlide`, `endWipe`; `polyPath`, `drawTo` (a line up to a fraction of its length), `bez`, `arcPts` |
| `flat.js` | flat-vector | `tile` (chunk / window), `barrel` (one file; `cut` shows index + chunks inside), `folderBack` + `folderLip` (a folder / store), `drone`, `card` (box character), `gpuBox`, `tankSide`, `tankTop`, `laptop` (the viewer's laptop with a face, a map panel or a terminal) |
| `morph.js` | shape-morph | `blobRow` (goo row: touching = one bar, gaps = chunks, `lift(i)`) |
| `iso.js` | isometric | `tone`, `isoBuilding` (opens: `roofK` lifts and slides the roof; `contents(box)`), `isoPlate`, `isoFileBlock` (one file per block) |
| `boil.js` | line-boil | `INK`, `BOIL`; `inkLine`, `inkShape`, `ring`, `rrect`, `inkFace` (calm, happy, surprised, dead), `pencil`, `stamp`, `inkJar` (one file with pages), `inkFolder` (a folder with sheets), `envelope` (a frame or packet; `broken` = lost) |
| `paper.js` | paper-cutout | `PAPER`; `paperPiece`, `rectPts`, `circlePts`, `paperGrain`, `paperPerson` (split-pin arm, optional stop sign), `paperReceipt`, `paperCard` |
| `pixel.js` | pixel-art | `PX` (palette + `tl` teal file, `pk` pink chunk); `pxR`, `pxText` (with "_"), `pxFloor`, `pxWorker`, `pxPadlock`, `pxGpu`, `pxShelf` (a store of separate tiles), `pxCrate` (one file), `pxDialog`, `pxFrame`, `pxRing` (a multicast wave), `pxPi` (the robot computer), `pxMac` (the viewer's laptop) |
| `toy3d.js` | toy-3d | `world` (studio, opaque materials, `g.proj`, `g.orbit`, `g.ready()`), `showK` (hide by scale), `AX`, `gizmo`, `gizmoGrow`, `tube`, `stretch`, `setOpacity`, `makeTank`, `fileCube`, `nasTower`, `cart`, `eyeBlock` (a writer or reader with eyes), `flag` (a message on a pole) |
| `riso.js` | risograph | `RI` (inks, paper); `rInk` (print on one plate, with a registration kick), `halftone` (a tint on one plate), `kickAt` |
| `blueprint.js` | blueprint | `BP` (whiteprint ink, sheet, stamp red); `bpLine` (draws on with a nib), `bpRect`, `bpArrowHead`, `balloon` |
| `hud.js` | hud-terminal | `HU` (colours, font); `roll` (digits roll, then lock), `hudBrackets` |
| `toon.js` | midcentury-toon | `MC` (palette); `regOff` (off-register offset), `toonDot` (dot or ring), `medallion` (numbered step), `presenter` (egg head, one arm reaches to a point) |
| `whiteboard.js` | whiteboard | `WBI` (inks, font); `tk` (a formula token: text, sub, sup, drawn sigma), `wbLayout`, `wbWrite` (writes a line behind a diagonal clip), `wbMarker`, `wbBox` |
| `transit.js` | transit-map | `TM` (paper, ink, accent); `tmLine` (grows with a pen tip), `tmStop` (stop or interchange that pops), `capsule` (the vehicle, with a face) |
| `watercolour.js` | watercolour | `WC` (paper, ink, wash); `wcBlob`, `wcRect` (wobbly outlines), `wcWash` (three passes that multiply), `wcArrow` (a brush arrow) |
| `newsreel.js` | newsreel | `NR` (gate size, newsprint colours), `nHash`; `gate`, `filmLook` (silver, vignette, flicker, scratches, dust), `greasePencil`, `ringPts` |

## Rules

- **One meaning, one colour.** Use the roles in `C` and `K`; a new role goes into `common.js` with a comment.
- **Style first.** A shared object gets its own version per style (a file is `barrel` in flat, `inkJar` in line-boil, `pxCrate` in pixel art, a teal box in toy 3D), in the same colour role.
- **Tested only.** An item goes in after it passed `check` and the rebuild check (SKILL.md step 8b) in a real video, and it is added to `gallery/scenes.js`, with a new gallery still.
- **3D on the GPU path:** hide objects with `showK` (scale), never `visible = false`, and `await g.ready()` at the end of setup.
- A module must not depend on time except through its arguments (`t`, `k`, `s.boil()`), so frames can be drawn in any order.
