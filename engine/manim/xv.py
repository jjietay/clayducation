"""It takes a Manim scene and gives it the narration's clock, so animations start on spoken words.

Use it in a project's manim_scenes.py:

    from xv import *            # also imports everything from manim

    class knock(Timed, Scene):  # class name = the "## knock" id in script.md ("-" becomes "_")
        def construct(self):
            arrow = Arrow(...)
            self.play_at('#arrow', GrowArrow(arrow), run_time=0.6)
            self.wait_until('lands')      # a spoken word, or a [#marker]
            ...

The scene always lasts exactly as long as its narration: Timed waits at the end for
what is left. "make manim" renders each Timed class and the engine shows the frames.
"""
import json
import math
import os
import re
import sys

from manim import *  # noqa: F401,F403  (re-exported for manim_scenes.py)
from manim import Scene, config

__all__ = [n for n in dir(sys.modules['manim']) if not n.startswith('_')] + ['Timed', 'XV']

# The colour map used in the math style. Same meaning, same colour, in every scene.
XV = {
    'bg': '#14161f', 'grid': '#2a3352', 'old': '#1d2233', 'axis': '#6b7394', 'ink': '#e8e9f3',
    'dim': '#8a90a8', 'a': '#ffd166', 'b': '#f2668b', 'other': '#7aa2ff', 'lam': '#ff8c42', 'warn': '#ff5d5d',
}


def _norm(w):
    return re.sub(r'[^\w]', '', w.lower())


class Timed:
    """Mixin: put it first, before Scene or any Scene subclass."""

    scene_id = None  # set it when the script id is not a valid class name

    def setup(self):
        super().setup()
        tl = json.load(open(os.environ['XV_TIMELINE']))
        self.xv_id = self.scene_id or type(self).__name__.replace('_', '-')
        info = next((s for s in tl['scenes'] if s['id'] == self.xv_id), None)
        if info is None:
            raise SystemExit(f'manim: script.md has no "## {self.xv_id}" for class {type(self).__name__}')
        self.dur, self.words, self.marks = info['dur'], info.get('words', []), info.get('marks', {})
        self.fps = config.frame_rate
        self.xv_cues, self.xv_late, self.xv_trace, self.xv_traced = {}, [], {}, {}
        self.camera.background_color = XV['bg']
        self.add_updater(self._xv_record)

    # ---- the clock ----
    @property
    def now(self):
        """Seconds since this scene started."""
        return self.renderer.time

    def at(self, key, n=1):
        """Scene time of a cue: '#marker' from script.md, or the n-th time a word is spoken."""
        if isinstance(key, (int, float)):
            return float(key)
        if key.startswith('#'):
            if key[1:] not in self.marks:
                raise SystemExit(f'manim {self.xv_id}: no marker [{key}] in script.md. Markers: {", ".join(self.marks) or "none"}')
            t = self.marks[key[1:]]
        else:
            hits = [w['start'] for w in self.words if _norm(w['text']) == _norm(key)]
            if len(hits) < n:
                raise SystemExit(f'manim {self.xv_id}: the narration does not say "{key}"' + (f' {n} times' if n > 1 else ''))
            t = hits[n - 1]
        self.xv_cues[f'{self.xv_id}|{key}|{n}'] = t
        return t

    def _frames(self, secs):
        # Whole frames only, so the frame count never drifts from the clock.
        return max(0, round(secs * self.fps)) / self.fps

    def wait_until(self, key, offset=0.0, n=1):
        """Wait until a cue (plus offset seconds). If the scene is already past it, note it as late."""
        target = self.at(key, n) + offset
        d = self._frames(target - self.now)
        if d > 0:
            self.wait(d)
        elif target - self.now < -0.05:
            self.xv_late.append(f'{key}: started {self.now - target:.2f} s late, because the animation before it ran past the cue')

    def play_at(self, key, *anims, offset=0.0, n=1, **kw):
        """Wait until a cue, then play."""
        self.wait_until(key, offset, n)
        self.play(*anims, **kw)

    def play(self, *anims, run_time=None, **kw):
        if run_time is not None:
            kw['run_time'] = max(1 / self.fps, self._frames(run_time))
        super().play(*anims, **kw)

    def wait(self, duration=1.0, *a, **kw):
        duration = self._frames(duration)
        if duration > 0:
            super().wait(duration, *a, **kw)

    # ---- motion trace for "make review" ----
    def trace(self, name, mob):
        """Follow a mobject's centre each frame, so the physics review can measure its motion."""
        self.xv_traced[name] = mob
        return mob

    def _xv_record(self, dt):
        # renderer.time moves once per frame written; updaters can run more than once a
        # frame, so keep one sample per frame (the last one).
        t = self.renderer.time
        for name, m in self.xv_traced.items():
            x, y, _ = m.get_center()
            o = max(m.get_fill_opacity(), m.get_stroke_opacity())
            if not any(m is f for s in self.mobjects for f in s.get_family()):
                o = 0
            px = (x / config.frame_width + 0.5) * 1920
            py = (0.5 - y / config.frame_height) * 1080
            w = m.width / config.frame_width * 1920
            row = [round(t, 4), round(px, 1), round(py, 1), round(w, 1), round(float(o), 3)]
            rows = self.xv_trace.setdefault(name, [])
            if rows and round(rows[-1][0] * self.fps) == round(t * self.fps):
                rows[-1] = row
            else:
                rows.append(row)

    def tear_down(self):
        left = self.dur - self.now
        if left > 0.5 / self.fps:
            self.wait(left)
        elif left < -0.05:
            self.xv_late.append(f'the scene runs {-left:.2f} s past its narration ({self.dur:.2f} s); the end is cut')
        out = os.path.join(os.environ['XV_OUT'], self.xv_id)
        os.makedirs(out, exist_ok=True)
        json.dump({'cues': self.xv_cues, 'late': self.xv_late, 'trace': self.xv_trace}, open(os.path.join(out, 'timing.json'), 'w'))
        for msg in self.xv_late:
            print(f'WARN {self.xv_id}: {msg}', file=sys.stderr)
        super().tear_down()
