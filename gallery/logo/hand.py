# The Clayducation logo: "clayducati_n", hand-set (each letter upright, with its own lift and size, from a fixed
# seed, on one straight line), the clay play pebble for the o, and a ball of coral clay for the dot on the i.
# Usage: python3 hand.py <glyphs.json> <output folder>  ->  logo.svg (ink letters) and logo-dark.svg (cream letters)
import json, math, sys
src, out = sys.argv[1], sys.argv[2]
G = json.load(open(src)); XH = G["xh"]
def rnd(i, k): v = math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - math.floor(v)
def d_of(cmds, ox=0.0):
    s = []; X = lambda v: v * 1000 + ox
    for c in cmds:
        if c[0] == "M": s.append(f"M{X(c[1]):.1f} {-c[2]*1000:.1f}")
        elif c[0] == "L": s.append(f"L{X(c[1]):.1f} {-c[2]*1000:.1f}")
        elif c[0] == "Q": s.append(f"Q{X(c[1]):.1f} {-c[2]*1000:.1f} {X(c[3]):.1f} {-c[4]*1000:.1f}")
        elif c[0] == "C": s.append(f"C{X(c[1]):.1f} {-c[2]*1000:.1f} {X(c[3]):.1f} {-c[4]*1000:.1f} {X(c[5]):.1f} {-c[6]*1000:.1f}")
        else: s.append("Z")
    return " ".join(s)
def contours(cmds):
    out, cur = [], []
    for c in cmds:
        cur.append(c)
        if c[0] == "Z": out.append(cur); cur = []
    return out
PEB = "M100 10C150 7 191 41 193 95c3 55-34 96-90 98C48 196 8 160 8 103 7 49 47 13 100 10Z"
PLAY = "M72 58Q72 46 83 52L146 89Q157 96 146 103L83 141Q72 147 72 135Z"
DEFS = '''<defs>
<filter id="clay" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/>
<feSpecularLighting in="b" surfaceScale="5" specularConstant=".55" specularExponent="14" lighting-color="#fff5ea" result="s"><fePointLight x="40" y="-60" z="160"/></feSpecularLighting>
<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
<feDiffuseLighting in="b" surfaceScale="5" diffuseConstant="1.05" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>
<feComposite in="d" in2="SourceAlpha" operator="in" result="d2"/><feBlend in="SourceGraphic" in2="d2" mode="multiply" result="lit"/>
<feComposite in="lit" in2="s2" operator="arithmetic" k2="1" k3=".5"/>
</filter>
<filter id="press" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/><feOffset in="b" dx="3" dy="4" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
<feFlood flood-color="#4a2716" flood-opacity=".75"/><feComposite in2="e" operator="in" result="sh"/>
<feOffset in="b" dx="-2" dy="-2" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/>
<feFlood flood-color="#ffe7d4" flood-opacity=".6"/><feComposite in2="e2" operator="in" result="li"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/><feMergeNode in="li"/></feMerge>
</filter>
<radialGradient id="cf" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#e4a37c"/><stop offset=".6" stop-color="#cd8358"/><stop offset="1" stop-color="#a95f3c"/></radialGradient>
<radialGradient id="hole" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#a65a35"/><stop offset="1" stop-color="#8a4528"/></radialGradient>
<radialGradient id="pop" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#ff8a7f"/><stop offset="1" stop-color="#e2433a"/></radialGradient>
</defs>'''
# The bounce: each letter up or down by its own amount, with no drift along the word (the mean and the slope of
# the lifts are taken out), so the word stays on one straight horizontal line.
N = len(G["glyphs"]); L0 = [(rnd(i, 2) - 0.5) * 170 for i in range(N)]
xm = (N - 1) / 2; m = sum(L0) / N; b = sum((i - xm) * (l - m) for i, l in enumerate(L0)) / sum((i - xm) ** 2 for i in range(N))
LIFT = [l - m - b * (i - xm) for i, l in enumerate(L0)]
def build(ink):
    parts, k = [], 0
    for i, g in enumerate(G["glyphs"]):
        rot = 0                                # upright: no lean (kept for the pebble and the dot)
        lift = LIFT[i]                         # units (1000 = 1 em)
        sc = 1 + (rnd(i, 3) - 0.5) * 0.26
        x = g["x"] * 1000 + g["adv"] * 500     # the letter's middle
        if g["ch"] == "o":
            D = XH * 1000 * 1.2; cx, cy = x, -XH * 500 + lift * 0.5
            parts.append(f'<g transform="translate({cx - D/2:.1f} {cy - D/2:.1f}) rotate({rot*1.4:.1f} {D/2:.1f} {D/2:.1f}) scale({D/200:.4f})"><path d="{PEB}" fill="url(#cf)" filter="url(#clay)"/><path d="{PLAY}" fill="url(#hole)" filter="url(#press)"/></g>')
            continue
        cs = contours(g["path"])
        if g["ch"] == "i":
            top = lambda c: min(p[-1] for p in c if len(p) > 1)
            stem = [c for c in cs if top(c) < XH * 0.9]; dot = [c for c in cs if top(c) >= XH * 0.9]
            xs = [p[-2] for c in dot for p in c if len(p) > 1]; dx = (min(xs) + max(xs)) / 2 * 1000
            cs = stem
        d = d_of([p for c in cs for p in c], g["x"] * 1000)
        tf = f'rotate({rot:.1f} {x:.1f} {-XH*500:.1f}) translate({x:.1f} {-XH*500 - lift:.1f}) scale({sc:.3f}) translate({-x:.1f} {XH*500:.1f})'
        parts.append(f'<path d="{d}" fill="{ink}" transform="{tf}"/>')
        if g["ch"] == "i":
            R = 80; cx = g["x"] * 1000 + dx; cy = -XH * 1000 - 170
            parts.append(f'<g transform="rotate({rot:.1f} {x:.1f} {-XH*500:.1f}) translate(0 {-lift:.1f}) translate({cx - R:.1f} {cy - R:.1f}) scale({R/100:.3f})"><circle cx="100" cy="100" r="92" fill="url(#pop)" filter="url(#clay)"/></g>')
    W = G["width"] * 1000
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -1000 {W + 160:.0f} 1300" role="img" aria-label="Clayducation"><title>Clayducation</title>\n{DEFS}\n' + "\n".join(parts) + "\n</svg>\n"
open(f"{out}/logo.svg", "w").write(build("#26262a"))
open(f"{out}/logo-dark.svg", "w").write(build("#f3ede2"))
print("ok")
