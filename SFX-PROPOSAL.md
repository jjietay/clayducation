# Proposal: sound effects (SFX) in the engine

Status: prototype for review. The engine does not use it yet. `make.mjs` and `runtime.js` are
not changed, so every render stays the same. The owner approves each sound by ear first
(the rule in `SOUND.md`).

## What to listen to

| File | What |
|---|---|
| `gallery/sfx/demo-gallery.mp4` | The first 28 s of the gallery, with voice, music and SFX, mixed with the engine's chain. Audio track 1 has SFX. Audio track 2 is the engine today, with no SFX. In mpv, press `#` to switch tracks |
| `gallery/sfx/demo-music-30s.flac` | All 12 sounds over `music/current-30s.flac` at the engine's music level (0.26). There is no voice, so the sounds are more clear than in a video |
| `gallery/sfx/<sound>.flac` | Each sound 3 times, with 3 different seeds, so you hear the variation. The level is the level in a video, so these files are quiet |

```bash
mpv gallery/sfx/demo-gallery.mp4            # press # for the track with no SFX
mpv gallery/sfx/demo-music-30s.flac
mpv gallery/sfx/{pop,click,tick,whoosh,swish,thud,stamp,paper,marker,pencil,chime,typing}.flac
```

## What I found

### How good videos use sound effects

- Use few sounds. Give a sound only to a change that the viewer must see: a thing lands, a
  thing appears, the scene changes. A sound on every motion becomes noise, and after a short
  time the viewer stops hearing it ([Morphic: SFX for explainer videos](https://morphic.com/resources/use-cases/sound-effects-for-explainer-videos),
  [IRPR: checklist for explainer videos](https://sounddesign.irpr.agency/guides/sound-design-checklist-for-explainer-videos/)).
- Match the sound to the motion: a pop for an icon that appears, a whoosh for a push to the
  next part, a hard hit only for the one point that matters (same sources).
- Keep the narration on top. A common start point puts SFX 12 to 18 dB under the dialogue,
  and never louder than the dialogue except for a planned big moment
  ([Pixflow: mix dialogue, music and SFX](https://pixflow.net/blog/audio-mixing-premiere-pro/)).
- Google Material sound design sorts sounds by importance. "Hero" sounds (a celebration)
  are rare and always used the same way. Frequent sounds are short and quiet, so they can
  repeat ([Material: applying sound to UI](https://m2.material.io/design/sound/applying-sound-to-ui.html),
  [Material: sound choreography](https://m2.material.io/design/sound/sound-choreography.html)).
  In this kit, the chime is the hero sound: 1 or 2 a video.
- UI sounds are short: 30 to 150 ms for a tap or a click, up to about 500 ms for a notice
  ([Bugnet: satisfying UI sounds](https://bugnet.io/blog/how-to-make-ui-sounds-satisfying)).
- Game "juice" gives each action audible feedback, and it is the sound, more than the
  picture, that makes a motion feel heavy or light
  ([GameAnalytics: juice](https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design),
  [Jonasson and Purho, "Juice it or lose it", cited in AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/download/18889/18654/22655)).
  Critics warn that too much juice makes all games feel the same
  ([Wayline](https://www.wayline.io/blog/the-juice-problem-how-exaggerated-feedback-is-harming-game-design)).
- One sound that repeats with no change sounds like a machine. The fix: a small random
  change in pitch (2 to 3 %) and level for each hit, and different "takes" (round robin)
  ([Violet Recording: UI sounds](https://violetrecording.com/how-to-design-ui-sounds/),
  [IRPR: repetitive game audio](https://sounddesign.irpr.agency/solutions/game-audio-repetitive/)).
  Too much pitch change sounds like a "chipmunk", so keep it small.
- Kurzgesagt (sound by Epic Mountain) and 3Blue1Brown: I found no primary source about how
  they use SFX ([kottke: the Kurzgesagt soundtrack](https://kottke.org/18/01/the-soundtrack-to-kurzgesagt),
  [3Blue1Brown FAQ](https://www.3blue1brown.com/faq/)). From watching: Kurzgesagt puts soft,
  short sounds on many landings, under the music; 3Blue1Brown uses almost no SFX. The kit
  supports both: SFX are off by default, and a video can mark only a few moments.

### How to make the sounds in code

Procedural sound design builds each sound from a model of how it is made, with no recording
([Farnell, *Designing Sound*, MIT Press](https://opencourser.com/book/50vd9c/designing-sound)).
The kit uses these models:

| Model | Sounds |
|---|---|
| White noise through a band-pass filter whose centre moves with the level (near = bright and loud) | whoosh, swish |
| Short transient: a burst of noise of 2 to 10 ms and a sine that decays in 5 to 20 ms | click, tick, pop |
| A sine whose pitch falls fast (135 Hz to 50 Hz), with 2nd and 3rd harmonics so laptop speakers play it | thud |
| Band-passed noise with a rough, grainy level | paper, pencil |
| A stick-slip tone (a squeak that comes and goes) and friction noise | marker |
| Inharmonic partials of a bell (1, 2.76, 5.4, 8.93 times the note) | chime |
| Layers (body, knock, slap) and a short room reverb | stamp |

### Licences

| Source | Licence | Use in this public repo |
|---|---|---|
| Sounds made in code (`engine/sfx.mjs`) | ours, MIT with the repo | yes |
| [Kenney.nl audio packs](https://github.com/Calinou/kenney-interface-sounds) (interface, impact) | CC0 | yes, if we need a recorded sound later. Check the `License.txt` in each download |
| Freesound | each file has its own licence | only files marked CC0 |
| [Sonniss GDC bundles](https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/) | royalty-free, commercial use, no credit; not CC0; no AI training | no. I did not confirm that the licence lets us publish the raw files, so do not put them in the repo |

The prototype uses only sounds made in code. It needs no licence and no new dependency.

## The kit (`engine/sfx.mjs`)

12 sounds, 48 kHz stereo. Each sound is a function. Node only, no new dependency.

| Sound | Length | Class | Use it for | Styles that ask for it |
|---|---|---|---|---|
| `pop` | 0.18 s | medium | an icon or a node that appears | iso-infographic, desktop-flythrough |
| `click` | 0.1 s | small | a magnet, a part that snaps in, a button | whiteboard (magnet), data-physical |
| `tick` | 0.06 s | small | a counter, a data mark (set `pitch` from the value) | data-story, transit-map (each stop) |
| `whoosh` | 0.3 to 3 s (`dur`) | accent | a scene change, a big move, a fly-in (`peak` near 1 = a riser into a hit) | newsreel fly-in, all styles at a cut |
| `swish` | 0.28 s | medium | a card or a label that slides in | briefing-board, all styles |
| `thud` | 0.45 s | accent | a heavy landing | desktop-flythrough, data-physical |
| `stamp` | 0.9 s with room | accent | a stamp, a slam | briefing-board, newsreel, midcentury-toon |
| `paper` | `dur` + 0.12 s | medium | a sheet or a cut-out that slides and lands | briefing-board, risograph, paper |
| `marker` | `dur` | medium | a marker stroke on a whiteboard | whiteboard |
| `pencil` | `dur` | medium | a pencil or grease-pencil line | newsreel, blueprint |
| `chime` | 2.3 s with room | accent | the one "aha" moment (C6 then G6, the key of the music) | any, 1 or 2 a video |
| `typing` | `dur` | medium | text that types out | desktop-flythrough, terminal |

Not in the kit yet: a brush pass for `watercolour`.

### Levels

Each sound gets a fixed loudness from its class. The voice in a render is at −16 LUFS integrated.

| Class | Loudness (largest K-weighted level over 100 ms) | Sounds |
|---|---|---|
| accent | −21 LUFS | whoosh, thud, stamp, chime |
| medium | −24 LUFS | pop, swish, paper, marker, pencil, typing |
| small | −27 LUFS | click, tick |

- The kit measures over 100 ms, not 400 ms. The ear adds up the loudness of a short sound
  over about 100 ms, so the 400 ms EBU window reads a 60 ms click 6 dB too soft. With 400 ms,
  the click peaked at −4.7 dBFS; now it peaks at −10.7 dBFS.
- No sound peaks above −9 dBFS (`PEAK_CEILING`), whatever its gain.
- A sound that starts while the voice speaks plays 3 dB softer (`duckDb`). The engine knows
  each word's time from `timeline.json`, so this needs no compressor and stays deterministic.
  A sound in a gap between words plays at its full level.
- The SFX bus is not ducked by a compressor. A compressor would change the attack of each
  transient. The music keeps its own gentle duck (`SOUND.md`).

Measured in the gallery demo (largest level near each sound):

| Event | SFX | Voice | Music (ducked) |
|---|---|---|---|
| 0.60 s whoosh (fly-in) | −22.2 | −11.9 | −32.3 |
| 3.12 s stamp + thud (slam) | −22.2 | −14.5 | −33.7 |
| 6.82 s pencil (ring) | −26.4 | −15.5 | −37.2 |
| 10.5 s pop | −23.2 | −13.4 | −26.8 |

So the SFX sit 7 to 12 dB under the voice and 5 to 10 dB over the music. The full mix with
SFX and the mix with no SFX both measure −16.8 LUFS integrated and −3.7 dBFS peak: the SFX do
not change the loudness and never reach the limiter.

### Variation (no robot repeats), and determinism

Each event gets a seed from its sound name and its time in ms (FNV-1a hash, then xorshift32,
as in `music.mjs`). From the seed, each event gets:

- a pitch change of up to ±0.5 semitone (±3 %);
- a level change of up to ±1 dB;
- a length change of up to ±4 % (for the sounds with a length);
- new noise, so each noise sound is a new "take".

The same events always give the same file, byte for byte. I made the kit twice and compared
the MD5 of the files: they are the same.

### Checks I did (the objective part of a listen check)

| Check | Result |
|---|---|
| Clipping | none. Peaks −9.0 to −19.4 dBFS for a single sound; −8.7 dBFS in the music demo |
| DC offset | 0.0014 or less for a single sound (the click); 0.00005 in the music demo |
| Format | 48 kHz, stereo, 16 bit |
| Clicks at the end | each sound ends with a 5 ms fade; the reverb tail fades over 0.3 s |
| Lengths | as in the kit table; the music demo is 30.0 s (1 440 000 samples) |
| Spectrograms | each sound has the shape of its model (the pop rises, the thud falls, the whoosh band opens and closes, the typing has one transient a key) |
| Picture sync | frames of the gallery demo at 1.0, 3.07, 3.13, 4.37, 6.87 and 7.23 s show the fly-in, the slam, the label and the ring at the times of their sounds |

A computer cannot judge the character of a sound. Only the owner can, by ear.

### Density rules (`lint` in `sfx.mjs`)

`lint(events, words)` returns warnings. `check` would print them:

- more than 4 sounds in 2 s (a layer at the same time counts once);
- two accents less than 2 s apart;
- more than 2 chimes;
- an accent that starts on a word (it plays 3 dB softer). If the word matters, move the sound
  into the gap before the word. "A short silence before the main action makes it land"
  (`styles/midcentury-toon.md`).

## How to wire it into the engine

The smallest change: scenes declare sounds at cues, `check` collects them, `render` makes one
SFX track and adds it to the mix as a third input. It is off by default.

### 1. The scene API (`engine/runtime.js`)

Add one method to `class Scene`, next to `at()`, and one global at the top:

```js
window.__sfx = {};
// A sound effect at a cue: s.sfx('stamp', '#slam'). Call it in setup, once for each sound.
// at = seconds after the cue (a landing that ends 0.6 s after its cue: { at: 0.6 }).
// x = the stage x of the thing, for the pan. Other options: gain (dB), pitch (semitones), dur, peak.
sfx(sound, cue, { at = 0, x, ...o } = {}) {
  const t = this.start + this.at(cue) + at, pan = x == null ? 0 : clamp((x - 960) / 1600, -0.6, 0.6);
  window.__sfx[`${this.id}|${sound}|${cue}|${at}`] = { t: +t.toFixed(4), sound, pan, ...o };
}
```

In `scenes.js`:

```js
async setup(s) {
  s.sfx('whoosh', '#fly', { dur: s.at('#slam') - s.at('#fly'), peak: 0.95 });
  s.sfx('stamp', '#slam');
  s.sfx('thud', '#slam', { gain: -4 });     // a layer: two sounds at one time
  s.sfx('pencil', '#ring', { dur: 0.4 });
  s.sfx('pop', 'eigenvector', { at: 0.15, x: 1400 });
}
```

`s.sfx` calls `s.at`, so a cue with a typo throws, and `check` finds it, as for any cue.
The key makes a second call with the same arguments have no effect, so setup can run again.

### 2. `engine/make.mjs`

| Where | Change |
|---|---|
| imports | `import { sfxTrack, lint, timelineWords, writeWav } from './sfx.mjs';` |
| `renderCfg` | add the defaults `sfx: false, sfxVolume: 1` |
| new `sfxEvents(dir, tl)` | open one page (`withPage`), `seek(s.start + 0.01)` for each scene (this runs each setup), return `Object.values(window.__sfx)`. Cache in `build/sfx.json`, with a key of the SHA-1 of `scenes.js`, `timeline.json` and `sfx.mjs` |
| `check` | it seeks every scene already: after the loop, read `window.__sfx`, write `build/sfx.json`, and print `WARN` for each line of `lint(events, timelineWords(tl))`. Only when `_render.sfx` is true |
| new `sfxBus(dir, tl)` | as `musicTrack`: `build/sfx.wav` at the video's length from `sfxTrack(events, tl.duration, { words })`, made again only when its stamp changes |
| `render` | `const sfxFile = cfg.sfx ? sfxBus(dir, tl) : null;` then add `...ss, '-i', sfxFile` after the music input |
| `render` filter | with music: `[v][md][sx]amix=inputs=3` in place of `[v][md]amix=inputs=2`, and `[N:a]volume=${cfg.sfxVolume}[sx]`, where N is the SFX input. With no music: `[v][sx]amix=inputs=2:normalize=0:duration=first` before the limiter |
| `render` subtitles | the subtitle input moves by one: `-map ${2 + useMusic + useSfx}:s` |
| `--remix` | works as today: it makes the audio again on the old frames, so an SFX change needs no new frames |

When `_render.sfx` is false (the default), the render makes no SFX track, and the
filter string is the same as today. So every existing video renders byte for byte as before.

### 3. `video.json`

```json
"_render": { "music": true, "musicVolume": 0.26, "sfx": true, "sfxVolume": 1 }
```

`sfxVolume` is a linear factor on the whole SFX bus (1 = the levels in the table above).

### 4. Review pack and docs

- `make review`: list each sound in `transcript.md` at its time, as `[sfx stamp]`. Then the
  alignment reviewer can check that each sound has a visual event at the same time.
- `SOUND.md`: a new part "Sound effects" with the kit, the classes and the approved levels.
- `reference/engine.md`: a row for `s.sfx` in the scene table, and `sfx`, `sfxVolume` in the
  `video.json` row.
- Each style file: change "A sound would mark ..." to the kit names, for example
  `whiteboard.md`: "`s.sfx('marker', cue, { dur })` on each stroke start, `click` on each magnet".

### Other designs I did not choose

| Design | Why not |
|---|---|
| A list of sounds in `video.json` (`"newsreel@#slam": "stamp"`) | It needs no browser, but the sounds are far from the motion they mark, and a cue time with an offset (a landing at cue + 0.6 s) is hard to write |
| A marker in `script.md` (`[#slam sfx=stamp]`) | Any change to `script.md` makes a new voice run |
| A compressor that ducks the SFX under the voice | It changes the attack of each transient; the word times give a clean, deterministic duck |
| Recorded sound packs | Licence work for each file, and the repo grows. Code is enough for these 12 sounds |

## How to make the demos again

```bash
node engine/sfx.mjs kit /tmp/kit                       # each sound, and a preview with 3 seeds
node engine/sfx.mjs track gallery/sfx/demo-events.json 30 /tmp/demo-sfx.wav
ffmpeg -i gallery/music/current-30s.flac -i /tmp/demo-sfx.wav -filter_complex \
  "[0:a]volume=0.26[m];[m][1:a]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,atrim=0:30" \
  -ar 48000 -ac 2 gallery/sfx/demo-music-30s.flac
# The gallery demo: render a copy of gallery/ with --from 0 --to 28.4 --draft, then
node engine/sfx.mjs track gallery/sfx/gallery-events.json 28.4 /tmp/gallery-sfx.wav <copy>/build/timeline.json
# and mix build/video.mp4, narration.wav, music.wav and gallery-sfx.wav with the chain above.
```

Note: with ffmpeg 6.1.1, `amix=duration=first` on two 30 s inputs gave only 28.6 s. The demo
uses `duration=longest` and `atrim`. The engine's render pads the voice by 4 s and cuts with
`-t`, so this does not change the engine's output.

## What the owner must approve by ear

1. Each of the 12 sounds: keep, change (say what), or reject. A rejected sound goes in a
   "Rejected sounds" table, as for the music.
2. The levels: accent −21, medium −24, small −27 LUFS, and the 3 dB duck on words. Use
   `demo-gallery.mp4` and switch the tracks with `#`. If all are too loud or too soft, change
   `sfxVolume`; if one class is wrong, change that class.
3. The variation: ±0.5 semitone and ±1 dB. Listen to the 3 takes in each `<sound>.flac`.
4. The density rules in `lint`.
5. Opt-in or a default: keep `sfx: false` as the default (proposed), or turn it on for some styles.

After approval: wire it in as in "How to wire it into the engine", add the approved part to
`SOUND.md`, and delete `gallery/sfx/demo-gallery.mp4` (4.6 MB) to keep the repo small.
