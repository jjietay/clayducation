# Sound: the background music and the sound effects

The engine makes the music itself, from code in `engine/music.mjs`, and the sound effects
from code in `engine/sfx.mjs`. It uses no samples, no AI models and no recordings, so there is
no licence to clear. Read this file when you choose the music or add sound effects to a video,
or when the user asks for a new track or a new sound.

## The rules the user chose

| Rule | Value |
|---|---|
| Level | audible and steady, about 13 dB under the voice: `musicVolume` 0.37. The user raised it by 3 dB on 2026-11-02; before, it was 0.26, about 16 dB under |
| Ducking | gentle: sidechain ratio 2, attack 250 ms, release 1.8 s. Rejected: a hard duck (ratio 8), which pumps loud-soft-loud between sentences |
| Too soft | rejected: music that the user cannot hear under the voice |
| Fades | 3 s in, 4 s out |
| Format | 48 kHz stereo; `verify` checks it |
| New tracks | the user approves each new track by ear before it goes into the engine |

## How to choose a track

Set `_render.music` in `video.json`:

| Value | Track |
|---|---|
| `true` or `"current"` (the default) | **current**: calm pad and slow arpeggio, no beat. Neutral, suits any video |
| `"lofi"` | **lofi**: lo-fi study beat. Relaxed, with a light groove; suits a calm video that needs more energy |
| `false` | no music |

The render makes the track at the video's length (`build/music.wav`). It makes the track
again only when the track, the length or `music.mjs` changes. To change the track after a
render: change `_render.music`, then `make render <dir> --remix` (no new frames), then
`make verify`.

To listen to the approved 30 s previews: `mpv gallery/music/*.flac`.

## Track recipes

Each track is a function of the length in seconds. Its chord loop repeats until the length
is full. A seeded random generator (xorshift32) makes the noise, so one track and one length
always give the same file, byte for byte. The mix-down applies the fades, then normalises
the peak to 0.8.

### current (approved 2026-11-02)

The first engine music. Mono (left and right are the same).

| Item | Value |
|---|---|
| Tempo | 72 BPM, 4/4, one chord a bar (3.33 s) |
| Chords | C – Am – F – G (bass C2, A2, F2, G2) |
| Pad | each chord tone as a sine, plus a sine 0.3 % higher at half level (slow beating); 1.2 s attack; each chord overlaps the next by a quarter bar |
| Bass | sine on the root, level 0.16 |
| Arpeggio | the 3 chord tones, then the middle one, one a beat, one octave up; sine with a 2.2 /s decay, level 0.07 |
| Tone | one-pole low-pass at 2.5 kHz |

### lofi (approved 2026-11-02)

| Item | Value |
|---|---|
| Tempo | 76 BPM, 4/4, swing: the off-beat 8th is at 0.6 of the beat |
| Chords | ii – V – I – vi in C, one a bar (3.16 s): Dm9, G13, Cmaj9, Am9 |
| Voicings | Dm9: F3 A3 C4 E4 · G13: F3 B3 E4 · Cmaj9: E3 G3 B3 D4 · Am9: G3 C4 E4 B4 |
| Electric piano | FM synthesis: modulation index 1.4·e^(−3t) + 0.25 (bright attack, round tail); pitch wobble 0.15 % at 0.5 Hz (tape feel). Hits on beat 1 (1.7 beats long) and on the swung "and" of 2 (1.2 beats, softer). Notes 10 to 14 ms apart, like a soft strum, spread from left to right |
| Bass | triangle-like wave (3 odd harmonics): the root on beat 1; the octave (odd bars) or the 5th (even bars) on the swung "and" of 2; low-pass 600 Hz |
| Kick | sine that falls from 125 Hz to 45 Hz, on beat 1 and the swung "and" of 2 |
| Snare | band-passed noise (900 Hz to 4.5 kHz) with a 185 Hz body, on beats 2 and 4, soft |
| Hats | high-passed noise (7 kHz), swung 8ths, off-beats at 55 % |
| Vinyl | low hiss and sparse random clicks, band-pass at 2.5 kHz |
| Effects | piano low-pass 3.2 kHz; reverb on the piano (room 0.7, damping 0.6) at 35 %; master low-pass 5 kHz; `tanh` saturation (drive 1.5) |
| Stem levels (K-weighted) | piano −20.4 dB, piano reverb −24.9 dB, bass −20.7 dB, drums −23.8 dB, vinyl −42.9 dB |

## Rejected tracks (2026-11-02)

The user listened to these and rejected them. Do not make them again in the same form.
The user gave no reason.

| Track | What it was |
|---|---|
| marimba | bouncy marimba pattern, plucked bass, shaker and rim click, G–Em–C–D, 100 BPM |
| ambient | no beat: slow saw pads that change every 8 s, glass bells on a random pentatonic line, big reverb |
| chip | soft chiptune: square-wave arpeggio, triangle bass, square lead with echo, noise hats, 112 BPM |
| guitar | fingerpicked plucked-string guitar (Karplus-Strong), quiet pad, brushed shaker, 84 BPM |

## How to add a track

1. Write the track as a new function in `TRACKS` in `engine/music.mjs`. Use the toolkit:
   `epiano`, `tri`, `kick`, `snare`, `hat` and `noise` for sounds; `biquad`, `filt` and `freeverb`
   for effects; `add` to place a note; `mixdown` for the fades and the peak. Add a new
   instrument when the track needs one.
2. Make 30 s previews of the new track and of `current`: `node engine/music.mjs <tmp-dir> 30 current <name>`.
   It prints the K-weighted level of each stem. Keep the melody stem the loudest, and the bass and drums under it.
3. Match its loudness to `current` (both at −12.5 LUFS), and make a demo under a real
   narration with the engine's mix chain:
   ```bash
   lufs() { ffmpeg -nostats -i "$1" -af ebur128 -f null - 2>&1 | grep -A1 Integrated | grep -oP 'I:\s+\K-?[0-9.]+'; }
   g=$(python3 -c "print($(lufs current.wav) - ($(lufs new.wav)))")
   ffmpeg -y -i new.wav -af "volume=${g}dB" new-30s.wav
   ffmpeg -y -ss 20 -t 34 -i <project>/build/narration.wav -i new-30s.wav -filter_complex \
     "[0:a]apad=pad_dur=4,aresample=48000,loudnorm=I=-16:TP=-1.5,aresample=48000,asplit=2[v][key];[1:a]volume=0.37[m];[m][key]sidechaincompress=threshold=0.03:ratio=2:attack=250:release=1800:knee=6[md];[v][md]amix=inputs=2:normalize=0:duration=shortest,alimiter=limit=0.95,atrim=0:30" \
     -ac 2 new-under-voice.wav
   ```
4. Give the user both files to listen to. Only the user approves a track.
5. When a track is approved: add its recipe to this file, and its 30 s preview to
   `gallery/music/<name>-30s.flac` (lossless). When a track is rejected: delete its function,
   any instrument that only it used, and its preview files, then add one row to
   "Rejected tracks".

## Sound effects

The engine also makes short sound effects from code, in `engine/sfx.mjs`: no samples, no
licence. They are **off by default**. A video turns them on in `video.json`:

```json
"_render": { "music": true, "musicVolume": 0.37, "sfx": true, "sfxVolume": 1 }
```

A scene declares each sound at a cue, in `setup` (see `reference/engine.md`):

```js
s.sfx('whoosh', '#fly', { dur: s.at('#slam') - s.at('#fly'), peak: 0.95 });
s.sfx('stamp', '#slam'); s.sfx('thud', '#slam', { gain: -4 });   // two sounds at one time
s.sfx('pop', 'eigenvector', { at: 0.15, x: 1400 });              // 0.15 s after the word, panned right
```

`check` collects the sounds and warns about too many sounds in 2 s, two accents less than
2 s apart, more than 2 chimes, or an accent on a word. `render` makes `build/sfx.wav` and
mixes it after the music duck, before the limiter. `render --remix` changes the sounds
without new frames. With `sfx` off, the mix is the same as before, byte for byte.

### The kit (approved by the user on 2026-11-02)

| Sound | Length | Level | Use it for |
|---|---|---|---|
| `pop` | 0.18 s | medium | an icon or a node that appears |
| `click` | 0.1 s | small | a magnet, a part that snaps in |
| `tick` | 0.06 s | small | a counter or a data mark (`pitch` from the value) |
| `whoosh` | `dur`, 0.3 to 3 s | −25 LUFS | a fly-in or a big move (`peak` near 1 = a rise into a hit) |
| `swish` | 0.28 s | medium | a card or a label that slides in |
| `thud` | 0.45 s | accent | a heavy landing |
| `stamp` | 0.9 s | accent | a stamp or a slam |
| `paper` | `dur` + 0.12 s | medium | a sheet or a cut-out that slides and lands |
| `marker` | `dur` | medium | a marker stroke on a whiteboard |
| `pencil` | `dur` | medium | a pencil or grease-pencil line |
| `chime` | 2.3 s | accent | the one "aha" moment, 1 or 2 a video |
| `typing` | `dur` | medium | text that types out |

| Level | Loudness (largest K-weighted level over 100 ms) |
|---|---|
| accent | −21 LUFS |
| medium | −24 LUFS |
| small | −27 LUFS |

- The whoosh has its own level, −25 LUFS: the user found the 2.5 s fly-in whoosh at −21 a bit too loud.
- The voice is at −16 LUFS, so the sounds sit 7 to 12 dB under it. No sound peaks above −9 dBFS.
- A sound that starts while the voice speaks plays 3 dB softer. Put a sound that matters in the gap before a word.
- Each event gets a seeded change of up to ±0.5 semitone and ±1 dB, so repeats do not sound the same, and one video always gives the same file.
- Mark only what changes the picture, about one sound a beat at most.

Previews (3 variations of each sound, at video level): `gallery/sfx/<sound>.flac`, and all
of them over the music in `gallery/sfx/demo-music-30s.flac` (`mpv gallery/sfx/*.flac`).
Make them again with `node engine/sfx.mjs kit <dir>` and `node engine/sfx.mjs track
gallery/sfx/demo-events.json 30 <out.wav>`, then mix with the music at `musicVolume`.
The demo `gallery/sfx/demo-music-30s.flac` was made before the +3 dB change, with the music at 0.26.

New sounds follow the music rule: the user approves each one by ear. If a recorded sound is
ever needed, use only CC0 sources (Kenney audio packs, Freesound CC0). Sources for the design:
[Material Design: applying sound to UI](https://m2.material.io/design/sound/applying-sound-to-ui.html),
[sound design checklist for explainer videos](https://sounddesign.irpr.agency/guides/sound-design-checklist-for-explainer-videos/),
[repetition in game audio](https://sounddesign.irpr.agency/solutions/game-audio-repetitive/),
[the soundtrack of Kurzgesagt](https://kottke.org/18/01/the-soundtrack-to-kurzgesagt).
