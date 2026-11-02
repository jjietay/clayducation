---
name: kaleidoscope
description: Make a narrated learning-explainer video (MP4) that teaches a concept, in one or more animation styles (Manim maths, flat vector, isometric, toy 3D, pixel art, line drawing, hand-drawn, paper cut-out and more), checked by 6 reviewer agents. Use when the user asks for a video, an explainer, an animation or a visual walkthrough of an idea, such as "make a video explaining eigenvectors", "generate an explainer on I2C", "animate how attention works". Uses what the current conversation and project already show, so run it in the conversation where the topic came up.
---

# Explainer video

You make a video that helps the user **learn** a concept. You have one big advantage
over a fresh tool: you know this conversation and this project. Use that knowledge.

The engine is in `~/.claude/skills/kaleidoscope/engine/`. In this file, `make` means:

```bash
node ~/.claude/skills/kaleidoscope/engine/make.mjs <command> <project-dir>
```

## One shot (the user asked for this)

When the user says "generate" or asks for a video, **do every step below without stopping,
and come back only with the finished, checked video**. Do not ask "shall I continue?", do
not show drafts, do not wait between steps. Ask at most one question, only at step 2, and
only when the topic itself is unclear. Every check below is yours to run and to act on.

## The look the user wants (read before step 6)

The user's reference is `~/Documents/(a local folder)`
(code: `video.html` in the same folder). It was made from the same style files as this
skill. Before you choose styles, make its contact sheet and look at it:
`ffmpeg -i <final.mp4> -vf "fps=1/8,scale=480:-1,tile=4x4" -frames:v 1 ref.png`.

What makes it work, and what every video must do:

- **A mix of styles: one part, one style.** The video is split into parts of about 15 to
  40 s (hook, each idea, your case, close). Each part has its own style from `styles/`,
  its own background and its own type. The reference uses eight: flat cartoon (title),
  shape-morph on navy (the question), isometric (the setup), single line with handwritten
  labels (architecture A), pixel art with a dialogue box (architecture B), line-boil
  characters (the failure story), paper cut-out with a photo (the demo), toy 3D (the
  close). Two parts next to each other never share a style.
- **Each part is one continuous shot.** Inside a part there are no cuts and no new slides:
  the picture grows, splits, morphs, moves and gathers as the voice speaks. A new idea
  grows out of the shape before it. A part ends in the state the next part starts from,
  or with a wipe in the next part's background.
- **The picture explains; text only names.** Per frame: a kicker (small capitals, the
  part and a source, for example `THE QUESTION · INTERIM REPORT §1`), a title of at most
  8 words, one picture, a few labels of 1 to 4 words each (typed or wiped in, with thin
  leader lines), and at most one caption line at the bottom. **Never a column of
  sentences, never a bullet list, never a legend of what the colours mean** (say it once
  in the voice, or label the thing itself). About 15 words on screen at most.
- **Characters and physical motion.** Give things a face or a body when it helps (the
  tank, a node, a particle, a gripper, an orange). Things move like objects: an arm
  reaches, a ball falls and bounces, a block drops and settles, a pulse travels. No
  build-up of static boxes.
- **Mostly light, warm backgrounds.** Cream, paper, light grey, pastel. One or two parts
  may be dark (navy or pixel art) for contrast.
- **The same object keeps its colour across all parts** (for example the robot is always
  orange and the map always yellow), even when the style changes.

If a storyboard breaks one of these, change the storyboard before you write code. The
first ROS 2 videos broke them: one dark style for most scenes and columns of text on the
right, and the user said the skill was "definitely not taking you in the right direction".

## Hard rules

- **Do the thinking here, in the main conversation.** You write the script, the storyboard
  and the scenes yourself, because the context is here. Never give those steps to a
  subagent: a subagent starts with no context. The reviewers in step 9 are the one
  exception, and they start cold on purpose: they judge only what the video shows.
- **Never hurry the core explanation.** The user learns from these videos. Follow the
  pacing rules in `reference/script.md` and fix every pacing WARN.
- **Never make up a fact.** Each number, formula and claim comes from a source you checked:
  the user's code, a datasheet, a spec, a paper, the docs. List them in `storyboard.md`.
  Report anything you could not check.
- **"Your case" is optional.** Add it only when this conversation or project really holds
  a matching example (a bug the user hit, a fix, a measured number). Never invent one.
- **No overlaps.** No visual may cover another: text on text, text on a graphic, or a
  graphic that hides another graphic. Each label, formula, arrow and drawing gets its own
  space. `check` WARNs on overlapping texts, `review` writes every measured overlap to
  `overlaps.md`, and the `video-overlap` agent checks the frames in both review rounds.
  Fix every overlap WARN and every true "must" from that agent before `make final`.
- **Subtitles have one line.** Each cue is at most 42 characters and no two cues show at
  the same time, so a player never shows two lines. The engine does this; `verify` reports
  a cue that breaks the rule. Do not change `SUB_MAX` in `make.mjs` to make a cue fit.
- **Gates:** do not run `make final` until `make build` passes with no ERROR and no
  overlap WARN, you have looked at every contact sheet, the review is done and its
  fixes are in, and the **rebuild check** (step 8b) of the last rebuild is done.
- **Check what you rebuilt (the user asked for this).** After every rebuild, look at
  frames of each part you changed before you send it to review or to render (step 8b).
  The 3-frame contact sheet is not enough: a fault inside a changed part can fall
  between its frames.

## What the user asked for (keep these)

Each was asked for or chosen by ear. The engine does most of them by itself.

| Topic | What | Automatic? |
|---|---|---|
| Voice | Chatterbox's built-in voice, slowed to about 160 words a minute by `engine/tts/slow-reference.wav`; each paragraph read in one go so the tone carries | yes |
| Pauses | every full stop exactly 0.6 s, every comma at most 0.3 s, set from the script's punctuation | yes; `voice` WARNs if a pause could not be placed |
| Bad takes | a part whose words differ from the script (Whisper check) is retaken with a new seed, up to 3 times; the best take is kept | yes; WARN if still wrong |
| Fast spots | a clause more than 1.3 times the video's usual pace (symbol words count double) is retaken; the user found "lambda v is v, scaled by lambda" too fast | yes; WARN "fast": give it its own short sentence and a `[pause]` |
| Negative numbers | read "negative", never "minus" | `voice` stops with an ERROR |
| Repeated words | "one one" gets a comma ("one, one"), or the voice slips | yes |
| Writing | connected paragraphs; `[pause]` only where an idea ends or an animation plays. Rejected: a pause after every sentence, choppy sentences, a fast voice, a stretched (muffled) voice, Kokoro | you, see `reference/script.md` |
| Music | audible, steady, about 16 dB under the voice, gentle ducking; two approved tracks, `current` (default) and `lofi`. Rejected: loud-soft pumping, music too soft to hear, 4 other tracks | yes; you choose the track, see `SOUND.md` |
| Audio | 48 kHz stereo | yes; `verify` checks it |
| Subtitles | soft, never burned in; the user's mpv shows them small (`sub-scale=0.7`) | yes |
| One subtitle line | one line per cue, at most 42 characters, no two cues at the same time. The user saw two lines in video 1 of the ROS 2 set | yes; `verify` reports a cue that breaks it |
| No overlaps | no text or graphic covers another one | `check` WARN for texts, `overlaps.md` and the `video-overlap` agent for the rest |
| Look | a mix of styles, one per part, like `docs/interim/video_mix/build/final.mp4` in the FYP folder: characters, physical motion, few words, light backgrounds. Rejected: one dark style for the whole video, text columns, colour legends, build-up slides | you, see "The look the user wants" |
| Maths | Manim (3Blue1Brown's library), not hand-drawn canvas, for a part whose idea is a formula or a geometric map | you, see `styles/math-manim.md` |
| Quiz | none in the storyboard | you |
| Watching | `mpv <dir>/out/<slug>.mp4` | put it in the report |

## Workflow

1. **Collect context (no tool calls needed).** Note what the user already knows (level,
   words they use, projects), what this conversation or project shows about the topic,
   and whether a real "your case" exists ("none" if not).

2. **Ask one time, only if you must** (see "One shot"). Otherwise choose sensible defaults
   and say what you chose in the report. Defaults: 16:9, 2 to 4 minutes, intermediate depth.

3. **Check the facts.** Read the user's code, datasheets or docs that the video depends on.
   For maths, derive or check every formula and every example number.

4. **Create the project** where the topic lives: `<repo>/videos/<topic-slug>/` in a project
   repo, else `~/Videos/explainers/<topic-slug>/`.
   ```bash
   make init <dir> --title "Eigenvectors and eigenvalues"
   ```

5. **Write `script.md`.** Read `reference/script.md` first: learning order, how the voice
   reads, pacing, writing rules, markup, voice traps.

6. **Write `storyboard.md`.** Read "The look the user wants" above and look at the
   reference sheet. Then:
   - Split the script into **parts** (about 15 to 40 s each; a part can hold several
     `## scene` ids that share one picture). Give each part one style from
     `styles/README.md` ("By type of idea" says which style shows which idea best), and
     never the same style in two parts in a row. Read only the style files you chose.
   - For each part, write: the style, the background, the one picture that carries the
     idea, how it moves on each cue, the kicker and title, the labels (1 to 4 words each),
     the caption (one line or none), and how the part hands over to the next one.
   - List "Facts and sources", "Your case" and "## Viewer" (what the user knows before
     this video). **No quiz**: the user asked for none. The learner agent judges from the
     viewer and the hook question.
   - **Look in the shared library first** (`styles/library/README.md`, pictures in
     `gallery/png/library-*.png`). For each prop and character in the plan, use the library item
     of that style when one exists, and draw new only what is missing.

7. **Build the scenes.** Read `reference/engine.md`. Each "## id" in `script.md` needs one
   `scene('id', ...)` in `scenes.js`. Show each thing when the voice says it (`s.p('#cue')`,
   `s.p('word')`); give each canvas or Three.js thing that moves an `s.trace()`. When one
   part holds several scene ids, the next scene starts from the exact last frame of the one
   before, so the part looks like one shot. Load fonts before canvas text: the runtime
   loads every declared font, so use only the fonts listed in `reference/engine.md`.
   **Maths scenes use Manim**: write them in `manim_scenes.py` and put
   `scene('<id>', manim())` in `scenes.js`.
   **Import shared drawings from the library** (`import { barrel } from '/_lib/flat.js'`, see
   `reference/engine.md`, "Shared library"), and the colour roles from `/_lib/common.js`,
   instead of copying helpers into the project.

8. **Build and look.**
   ```bash
   make build <dir>     # voice, manim, check, sheet, review pack: stops at the first ERROR
   ```
   The voice comes first, and the scenes follow its measured word times, so the picture
   never runs ahead of the voice. Then act on everything it prints, and run it again
   (finished steps are cached):
   - **voice:** pacing WARN (cut words or add a `[pause]` after a key point); "could not
     place the pause" or "still says something else" (read the line it prints; reword the
     part or set a seed: `"_tts": {"seeds": {"stay#5": 20}}`). Read the transcript of any
     scene below 100 % confirmed: digits for spelt-out numbers are fine, a changed word is not.
   - **manim / check:** "started late" (shorten the animation before the cue), text outside
     the safe area or too small, scene errors.
   - **overlap:** `check` prints `"A" overlaps "B"` and `review` prints "measured
     overlap(s)". Move, resize or re-time one of the two things. Do not accept an overlap
     because it is short: the viewer pauses videos to read.
   - **sheet:** read every `build/sheet-N.png`. Look for clipped or tiny text, overlaps,
     empty frames, the same picture too long in a core scene, a picture that does not match
     the words. Then compare it with the reference sheet: does each part have its own
     style and background? Is any frame a slide (boxes and sentences, nothing moving)?
     More than about 15 words on screen? A column of text or a colour legend? Fix those
     before the review. `make sheet <dir> --scene <id>` and `make still <dir> <scene>@<cue>` look closer.

8b. **Rebuild check: look at the parts you changed.** After every `make build` that
    follows a change (to `script.md`, `scenes.js` or the engine), and before review or
    `make final`:
    - List the scenes you changed (and the scene after each one, because a hand-over
      wipe can change too).
    - For each one, `make sheet <dir> --scene <id>` (one frame a second) and read it.
    - For each changed cue, `make still <dir> <scene>@<cue>`, and read it. A still is
      drawn by a fresh browser, like the first frame of a render worker, so it shows
      first-frame faults that a sheet hides (for example, a WebGL object that is missing
      or pale in the first frame it appears).
    - Fix what you see and check again. Say in your status line which scenes you checked.
    In a Three.js scene, hide an object with a tiny scale (`1e-4`), not with
    `visible = false`. On the GPU path, an object that is first drawn mid-scene can miss
    its first frame.

9. **Review with agents, in two rounds.** `make build` made the review pack
   (`<dir>/build/review`). In each round, start the agents **in parallel, in one message**,
   with the Agent tool. Give each one only two paths: the review pack, and its report file
   `<dir>/build/reports/r<N>/<agent name>.md`. Give the learner no hint about the topic.
   Each reviewer writes its full report to that file and answers with one line.
   **Do not read the reports yourself.** When all reviewers of a round are done, start one
   `video-compiler` agent (see below). It reads all the reports and gives you one short,
   checked fix list. The user chose two rounds per video:

   | Round | Agents | Then |
   |---|---|---|
   | 1 | all 6 below | sort the notes, fix, `make build <dir>` again |
   | 2 | all 6 again, on the new pack | fix every true "must" (and cheap shoulds), `make build <dir>` again, look at the sheets |

   Start a new round only after the fixes of the round before are built, so each agent
   sees the fixed video. Never skip round 2 because round 1 found little.

   | subagent_type | Model | Checks |
   |---|---|---|
   | `video-learner` | Opus | learns from the transcript and stills only, answers the hook question with timestamps, says where it got lost |
   | `video-alignment` | Sonnet | each cue: does the screen show what the voice says, on time |
   | `video-physics` | Sonnet | jumps, pops, speed, easing, collisions, scene changes |
   | `video-overall` | Opus | legibility, layout, colour meaning, style rules |
   | `video-factcheck` | Opus | every claim, number and formula, worked out again |
   | `video-overlap` | Sonnet | no visual covers another: confirms each row of `overlaps.md` in the frames, and finds text on graphics and graphics on graphics that the engine cannot measure |
   | `video-compiler` | Opus | after each round: reads all the reports and `review-brief.md`, merges, checks each "must" in the frames, drops what the brief rejected, and returns one sorted fix list (also in `reports/r<N>/fixes.md`) |

   **The compiler and the brief.** The compiler starts cold, so it gets its context from
   `<dir>/review-brief.md`, which you write before round 1 and update after each round:
   who the viewer is and what the user asked for, the decisions you took, each suggestion
   you rejected and why, known engine artefacts, and a short list of the fixes of each
   round. Give the compiler the project path, the round number and the report folder.
   Read only its answer. If it lists items under "Decide", choose and note the choice in
   the brief.

   **Do not rebuild a review pack while an agent reads it.** `make review` deletes
   `build/review` first. Wait until every agent of the round is done. The reports are in
   `build/reports`, which `make review` does not touch.

   Sort the fixes:
   - Fix every "must" that is true. Check each claim against the frames or the code first:
     a reviewer can be wrong.
   - Fix a "should" or "could" when it serves the learning goal and costs little.
   - Reject a suggestion that conflicts with what you know about the user (the reviewers
     do not know them), or with the table above, and note why.
   - After the fixes, `make build <dir>` again.
   - In round 2, the brief lists the round 1 fixes, so the compiler checks that each one
     holds and that no fix made a new problem.
     A fix moves things, so the overlap check runs in every round.
   - After round 2, do not start a third round (the user chose two). Fix the round 2
     "musts", build again, look at every sheet, and say in the report what is still open.

10. **Render and verify.**
    ```bash
    make final <dir>     # render (out/<slug>.mp4, soft subtitles, .srt) and verify
    ```
    A 3-minute video renders in about 2 minutes. `verify` must print "no problems found".
    It also checks the `.srt`: one line per cue, at most 42 characters, no two cues at once.
    Then check the rendered file itself: take frames from the MP4 in each changed part and
    near each Three.js part
    (`ffmpeg -ss <t> -i out/<slug>.mp4 -frames:v 1 build/final-<t>.png`, or a tile of
    `fps=1` for a short range) and read them. Report this check with the result.

11. **Report** in a few lines:
    - `mpv <dir>/out/<slug>.mp4` and the length,
    - the styles you used and why, and any default you chose at step 2,
    - "your case": what you used, or that there was none,
    - facts you could not verify,
    - the learner's answer to the hook question in round 2, and the reviewer suggestions you rejected, with why,
    - the overlap result of round 2: clean, or what is left and why,
    - the two weakest moments, so the user knows where to look.

12. **Grow the library.** After the video passes `verify`, move each new drawing that a
    later video could use (a prop, a character, a helper) from `scenes.js` into the matching
    `styles/library/<style>.js`, with a one-line comment. Add it to `styles/library/README.md` and to
    `gallery/scenes.js` (the library part), run `make build gallery`, check the gallery sheets,
    and update its picture `gallery/png/library-<module>.png`. Only drawings that passed the rebuild
    check (step 8b) go in. Say in the report what you added.

## Files in this skill

| File | Read it |
|---|---|
| `reference/script.md` | before step 5: learning order, how the voice reads, pacing, writing rules, markup, voice traps |
| `styles/README.md` | at step 6: which style suits which type of idea |
| `styles/<name>.md` | only the styles you chose: rules, avoid list, code skeleton |
| `styles/README.md`, "Styles adapted from lemo-opuscar" | which styles are adapted from lemo-opuscar (MIT), with links to their posters |
| `styles/library/README.md` | at step 6: the shared drawings, by style; pictures in `gallery/png/library-*.png` |
| `reference/engine.md` | before step 7: the scene API and every command |
| `SOUND.md` | when you choose the music, or the user asks for a new track: the rules, the tracks and their recipes, the rejected tracks, how to add one |
| `agents/video-*.md` | the 6 reviewers (step 9), linked from `~/.claude/agents/`. You do not need to read them |

## If something fails

- Claude Code reads the agent files (`~/.claude/agents/video-*.md`) when a session starts.
  After you add or change an agent, the change applies only in a new session. In the old
  session a reviewer can still answer with its full report instead of writing a file.

- `make doctor` checks Node 22+, ffmpeg, Chrome, explainroo at `~/.explainroo` (Whisper),
  Chatterbox (in `engine/tts/.venv`, GPU), Three.js, MathJax, Manim (in `engine/manim/.venv`) and LaTeX.
- explainroo is used **only** for word timing inside `voice`. Never run `explainroo render`,
  `check` or `preview` in these projects: `scenes.js` here is for this engine.
- **On this laptop the voice uses another environment's PyTorch** (`/path/to/other/.venv`, linked through
  `engine/tts/.venv/shared-torch`) to save 7 GB of disk. If `make doctor` shows Chatterbox
  failing after a change to that environment, see README.md ("Optional, to save about 7 GB").
- To change only the music track or level (`_render.music`, `musicVolume`): `make render <dir> --remix` (no new frames), then `make verify`.
- The render uses the NVIDIA GPU (Chrome drawing and WebGL, NVENC encode) when the engine finds one; the probe
  result is cached in `/tmp/xv-gpu-<chrome version>.json` (delete it after a driver change). If frames look wrong or
  Chrome fails on the GPU, run with `XV_GPU=0` (the old CPU path). Never make a render faster by lowering the fps,
  the capture size or the review coverage: the user asked for speed from the GPU only.
