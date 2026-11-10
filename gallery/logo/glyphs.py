# Each letter of "clayducation" in Plus Jakarta Sans ExtraBold (800): its place (with kerning and a tracking given in em, -0.035 by default
# tracking) and its outline as M / L / Q / Z commands, in em units with y up.
import sys, json, io
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.basePen import BasePen
import uharfbuzz as hb
f = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 800})
buf = io.BytesIO(); f.save(buf)
face = hb.Face(buf.getvalue()); font = hb.Font(face); U = face.upem
gs = f.getGlyphSet(); order = f.getGlyphOrder()
class P(BasePen):
    def __init__(s, gs): super().__init__(gs); s.c = []
    def _moveTo(s, p): s.c.append(["M", p[0] / U, p[1] / U])
    def _lineTo(s, p): s.c.append(["L", p[0] / U, p[1] / U])
    def _qCurveToOne(s, p1, p2): s.c.append(["Q", p1[0] / U, p1[1] / U, p2[0] / U, p2[1] / U])
    def _curveToOne(s, p1, p2, p3): s.c.append(["C", p1[0] / U, p1[1] / U, p2[0] / U, p2[1] / U, p3[0] / U, p3[1] / U])
    def _closePath(s): s.c.append(["Z"])
    _endPath = _closePath
TRACK = float(sys.argv[2]) if len(sys.argv) > 2 else -0.035
text = "clayducation"
b = hb.Buffer(); b.add_str(text); b.guess_segment_properties(); hb.shape(font, b, {"kern": True, "liga": False})
x = 0; out = []
for ch, info, pos in zip(text, b.glyph_infos, b.glyph_positions):
    pen = P(gs); gs[order[info.codepoint]].draw(pen)
    out.append({"ch": ch, "x": (x + pos.x_offset) / U, "adv": pos.x_advance / U, "path": pen.c}); x += pos.x_advance + TRACK * U
print(json.dumps({"glyphs": out, "xh": f["OS/2"].sxHeight / U, "width": x / U}))
