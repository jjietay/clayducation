# Gallery

The public page (GitHub Pages publishes this folder). `DESIGN.md` says what each chapter shows and why.

| File | What it is |
|---|---|
| `index.html` | the chapters, their statements and the styles |
| `app.js` | the clay world: scroll model, camera, mascot and the nine sets |
| `world/` | three.js, the clay kit and the packed shapes, made by `engine/gallery-export.mjs`; do not edit |
| `world.json` | the models that the sets use |
| `film/` | 8 s muted 1080p clips (the end fades into the start, so the loop has no jump) and their first frames, from six finished videos |
| `voice/` | the waveform and the Whisper word times of one sentence of the computed torque video |
| `png/`, `pipeline.html`, `music/`, `sfx/` | pictures and previews that the main README and SOUND.md use |

Make `world/` again after `make bake`, a change to the clay kit, or a new model in `world.json`:

```bash
cd gallery && node ../engine/gallery-export.mjs world.json
```

Check the page after a change (each fault is one line; see "Checks" in `DESIGN.md`):

```bash
node engine/test/gallery-check.mjs scroll     # the whole scroll, down and back up
node engine/test/gallery-check.mjs clicks     # chapter 5: every action, and a click during each one
node engine/test/gallery-check.mjs walks      # chapter 5: a walk between every two places
node engine/test/gallery-check.mjs input      # hover labels, clicks and (with --touch) taps
```

To view the page on your computer (a page opened as a file cannot load modules):

```bash
cd gallery && python3 -m http.server 8000    # then open http://localhost:8000
```
