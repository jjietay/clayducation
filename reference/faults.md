# Faults that have happened, and what stops them now

Each row is a real mistake from a real video. Add a row for each new fault, with a case in
`engine/test/selftest.mjs`, before you fix the video. `make selftest` plants every case and
confirms that the engine catches it. Run it after each change to a check.

## Caught by a measure

| Fault | What stops it | Where |
|---|---|---|
| A spring stopped short of its wall | Every model lists its joins, and each join is measured | `make bake`, `make attached`, `JOINS` in `models.js` |
| A map pin floated, and clock hands had no axle | The same join list | `JOINS` |
| A hand went through a table | The mascot against each model part, on every frame | `objectHits` in `clay.js` |
| A foot went into a cart | His shoes are shapes in the same measure | `objectHits` |
| A robot went into a target, and a robot went through a post | Each object against each other object, by shared volume, on every frame | `objectHits` in `clay.js` |
| The mascot was measured only at a few points, so a shoulder or knee could enter an object | His real body shapes are measured like any object, and his hands and forearms against his own body | `objectHits` and `selfHits` in `clay.js` |
| Arrows were measured only against text | Each arrow is a shape too | `arrow` in `clay.js` |
| His hands were in the air beside a cart, a robot and a pole that he pushed or held | When a hold is complete (k ≥ 0.95), the hand's own shape must touch the part that it holds | `holds` in `clay.js`, `hold` in `mascot.js` |
| A change to `video.json` or to the checks did not close the gate | The gate also follows `video.json` and `make.mjs` | `sourceHashes` in `make.mjs` |
| Signal balls went through the mascot | `g.ball`: the kit registers each prop, so the measures see it | `clay.js` |
| The mascot's straight raised arm looked like a salute | A straight arm at shoulder height or above is a fault, on every frame | `clay.js` |
| Two formulas ran together on one line and read as one wrong formula | Two rows on one line need a gap of 40 px | `formulasRunTogether` in `make.mjs` |
| A formula sat still like notes | A formula shown for 3 s or more must move, build or bounce | `stillFormulas` in `make.mjs` |
| The mascot's head covered a title | 3D ink against each visible text and formula | `textHits` in `clay.js` |
| Two labels cross-faded on one spot | Text on text counts at any length, in `make look` as well as in the build | `overlapsOf` in `make.mjs` |
| The mascot walked sideways | A long walk must go the way that he faces | `route`, `clay.js` |
| A long, slow walk with his back to the viewer | A long walk must be at least 1 unit a second | `route`, `clay.js` |
| His arm stayed out of the frame | Head and hands must stay in the frame while he stands | `offFrame` in `clay.js` |
| His hand did not reach what it held | `hold` measures the reach | `mascot.js` |
| He pushed the air beside a cart and a robot | A hand in `hold` must be on the surface of an object. `reach` is only for pointing | `surfaceGap` in `clay.js` |
| The voice moved a term, and the screen stayed still | A sentence with a motion word needs motion on screen. A sentence that means it only in words goes in `_stillVoice` | `voiceWithoutMotion` in `make.mjs` |
| The voice said "the mass cancels", and nothing cancelled | A sentence with "cancel" or "cancels" needs a cancel on screen, from `eqn()` or `s.cancelling()`. Other motion does not count | `voiceWithoutMotion` in `make.mjs` |
| `s.H = robot` sent every label off the screen | The names of a scene are read only | `runtime.js` |
| The mascot stood in one spot for a whole video | WARN for a scene where he does not travel | `make check` |
| A formula was read aloud with no reason | WARN, the five steps, and the script agent | `make check`, `reference/script.md`, `agents/video-script.md` |
| A GPU drop-out removed a leg in 2 frames of 8 | Antialiasing is off, and frames are drawn twice and compared | `make stable` |
| The voice said "PC removes" for "P C A removes" (a distance of one letter) | A spoken letter of a spelt-out name that has no match in the take is a bad take | `missingLetters` in `engine/voicecheck.mjs`, `make voice` |
| `{p(ω_i|x)|p of omega i, given x}` was split at its first bar, so the voice read "x)|p of …" ("XTP") and the subtitle showed "p(ω_i" | `make voice` stops on a brace with two bars; write "∣" (U+2223) in the shown part | `twoBars` in `engine/voicecheck.mjs` |
| The voice said "XTP of omega i" for "p of omega i" three times, and the letter distance (2) passed it | Each heard word is lined up with the script; a word with 2 or more letters, and 60 % or more, unmatched is a bad take and gets retaken | `extraWords` in `engine/voicecheck.mjs`, `make voice` |
| A scene's first frame showed the end of the scene before, because a start was a float sum | The scene of a frame is found with a 1e-6 s tolerance | `seek` and `sceneAt` in `engine/runtime.js`, `make verify` |

## Caught by a gate

| Fault | What stops it |
|---|---|
| An edit went straight to a long build | `make build` stops until `make look` has passed for each changed scene |
| Renders started before anyone looked at a frame | `make final` stops until the source matches the last look and the last build |
| A checklist said "yes" for frames that nobody read | Each image has a CHECK digit, and the gates open only with the digits of all images, in order |
| Faults while a thing moved fell between the frames of a sheet | A dense strip for each measured movement. `make final` needs the digits of all strips |
| The build made the voice again, and cue times moved after the look | An unchanged script keeps its voice, and the gate compares cue times | `voice` and `gate` in `make.mjs` |
| A render ran with a collision or an overlap open | `make final` reads `collisions.md` and `overlaps.md` |

## Caught only by reading and by the user

No code checks these yet. Look for them in the strips.

- Feet that slide on the floor while he walks.
- One 3D object that hides another with no contact.
- Crowding: the user judges this, from the look of the frame.
- A picture that shows the wrong thing with the right motion (the servo gap did not match the voice).
- The sound of the voice: nobody has heard it until the user does. Whisper writes "EEE" for a voice that says "e, ee", and "changed" for an odd "changed". Spaced capitals ("E E E") read badly: say a word ("triple E").
- A patch that fails in a chained shell command: stop on the first failure, and confirm that the edit applied.
- A label that fades out on the same spot where a new label fades in. Below 0.3 opacity the overlap measure ignores it, but the eye still sees two words on top of each other. Move one label aside as it fades.
- An extra "one" after "one over lambda one, which is only a quarter" (video 2). Whisper drops a repeated word, so the voice check cannot hear it. End the sentence after a symbol that ends in a number ("... over {λ₁|lambda one}. [pause 0.6] ...").
- One sentence that starts slow and ends very fast ("... by the spread in the same unit, so the unit has no effect", video 2). The pace check measures whole clauses, so it passed. Split a long sentence that ends in short words, with a [pause] between.
- A fence that came only to the mascot's knee. Large objects keep their real size against him (`styles/clay.md`, "Models"); read the "With the mascot" cell of each model sheet.
- A scene where the voice names a limit or a result and the mascot stands and watches. Give him the work that shows it, for example holding the drifting cart, or pushing a robot that does not move.
