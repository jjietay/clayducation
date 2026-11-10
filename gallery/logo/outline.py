# Set "clayducation" in Plus Jakarta Sans ExtraBold (800) with its kerning, -0.035 em tracking, as SVG paths.
import sys, json, io
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb
src = sys.argv[1]
f = instantiateVariableFont(TTFont(src), {"wght": 800})
buf = io.BytesIO(); f.save(buf); data = buf.getvalue()
face = hb.Face(data); font = hb.Font(face); upem = face.upem
gs = f.getGlyphSet(); order = f.getGlyphOrder()
def setText(text, x0=0.0):
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties(); hb.shape(font, b, {"kern": True, "liga": False})
    x = x0; parts = []
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        name = order[info.codepoint]; pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
        parts.append(pen.getCommands()); x += pos.x_advance - 0.035 * upem
    return " ".join(parts), x
a, x1 = setText("clay"); b, x2 = setText("ducation", x1)
os2 = f["OS/2"]
print(json.dumps({"upem": upem, "clay": a, "ducation": b, "width": x2 + 0.035 * upem, "cap": os2.sCapHeight, "xh": os2.sxHeight, "asc": f["hhea"].ascent, "desc": f["hhea"].descent}))
