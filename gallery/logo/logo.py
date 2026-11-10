# The Clayducation mark (a pebble of clay with a play button pressed into it) and the favicon.
# Usage: python3 logo.py <output folder>  ->  mark.svg and favicon.svg
import sys, os
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
PEBBLE = "M100 10C150 7 191 41 193 95c3 55-34 96-90 98C48 196 8 160 8 103 7 49 47 13 100 10Z"
PLAY = "M80 66Q80 56 89 61L138 91Q147 97 138 103L89 133Q80 138 80 128Z"
def defs(p, shadow=True, rings=True):
    return f'''<defs>
  <filter id="{p}clay" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/>
    <feSpecularLighting in="b" surfaceScale="5" specularConstant=".55" specularExponent="14" lighting-color="#fff5ea" result="s"><fePointLight x="40" y="-60" z="160"/></feSpecularLighting>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feDiffuseLighting in="b" surfaceScale="5" diffuseConstant="1.05" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>
    <feComposite in="d" in2="SourceAlpha" operator="in" result="d2"/>
    <feBlend in="SourceGraphic" in2="d2" mode="multiply" result="lit"/>
    <feComposite in="lit" in2="s2" operator="arithmetic" k2="1" k3=".5" result="out"/>
    {'<feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#2a1a10" flood-opacity=".28"/>' if shadow else ''}
  </filter>
  <filter id="{p}press" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/>
    <feOffset in="b" dx="3" dy="4" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
    <feFlood flood-color="#4a2716" flood-opacity=".75"/><feComposite in2="e" operator="in" result="sh"/>
    <feOffset in="b" dx="-2" dy="-2" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/>
    <feFlood flood-color="#ffe7d4" flood-opacity=".6"/><feComposite in2="e2" operator="in" result="li"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/><feMergeNode in="li"/></feMerge>
  </filter>
  <radialGradient id="{p}clayfill" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#e4a37c"/><stop offset=".6" stop-color="#cd8358"/><stop offset="1" stop-color="#a95f3c"/></radialGradient>
  <radialGradient id="{p}hole" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#a65a35"/><stop offset="1" stop-color="#8a4528"/></radialGradient>
  {f'<clipPath id="{p}pebble"><path d="{PEBBLE}"/></clipPath>' if rings else ''}
</defs>'''
def mark(p, rings=True, play=PLAY):
    r = f'''<g clip-path="url(#{p}pebble)" fill="none" stroke="#fff3e8" stroke-opacity=".16" stroke-width="2.2">
    <ellipse cx="62" cy="150" rx="22" ry="17"/><ellipse cx="62" cy="150" rx="32" ry="26"/><ellipse cx="62" cy="150" rx="42" ry="35"/><ellipse cx="62" cy="150" rx="52" ry="44"/>
  </g>''' if rings else ''
    return f'''<g filter="url(#{p}clay)"><path d="{PEBBLE}" fill="url(#{p}clayfill)"/></g>
  {r}
  <path d="{play}" fill="url(#{p}hole)" filter="url(#{p}press)"/>'''
def svg(vb, body, title, w=None, h=None):
    size = f' width="{w}" height="{h}"' if w else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{size} role="img" aria-label="{title}"><title>{title}</title>\n{body}\n</svg>\n'
# The mark.
open(f"{out}/mark.svg", "w").write(svg("-6 -4 212 216", defs("m") + "\n" + mark("m"), "Clayducation", 212, 216))
# The favicon: no fingerprint, no drop shadow, a larger play shape, so it stays clear at 16 px.
BIGPLAY = "M72 58Q72 46 83 52L146 89Q157 96 146 103L83 141Q72 147 72 135Z"
open(f"{out}/favicon.svg", "w").write(svg("4 6 192 192", defs("f", shadow=False, rings=False) + "\n" + mark("f", rings=False, play=BIGPLAY), "Clayducation"))
print("ok")
