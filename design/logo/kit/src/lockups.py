"""Builds the lockups and the plugin tile from the symbol plus an outlined Inter SemiBold wordmark.

Usage: python lockups.py <inter-bold.woff2> <out-dir>   (needs shapely, fonttools, brotli, uharfbuzz)
"""
import sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from symbol import Symbol, MAIN, BLUE, AMBER, CORAL, TITLE

INK, PAPER = "#1D1D1F", "#FFFFFF"   # Apple label black
LINES = ["Tokens to Code"]
TRACK = -0.02             # em; Inter SemiBold tightened slightly at display size, as Apple sets titles
LEADING = 1.08


class Type:
    def __init__(self, path):
        self.tt = TTFont(path)
        self.tt.flavor = None
        import io
        buf = io.BytesIO()
        self.tt.save(buf)
        self.hb = hb.Font(hb.Face(buf.getvalue()))
        self.upem = self.tt["head"].unitsPerEm
        self.glyphs = self.tt.getGlyphSet()
        self.cap = self.tt["OS/2"].sCapHeight

    def line(self, text, size, x, baseline):
        """Outline one line of text; returns (path d, advance width)."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True, "liga": True})
        k = size / self.upem
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.2f}")
        cx = 0
        names = self.tt.getGlyphOrder()
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            g = names[info.codepoint]
            tp = TransformPen(pen, (k, 0, 0, -k, x + (cx + pos.x_offset) * k, baseline - pos.y_offset * k))
            self.glyphs[g].draw(tp)
            cx += pos.x_advance + TRACK * self.upem
        return pen.getCommands(), (cx - TRACK * self.upem) * k


def doc(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>\n' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" '
            f'role="img" aria-labelledby="t"><title id="t">{TITLE}</title>\n{rect}{body}\n</svg>\n')


def symbol_group(sym, fills, x=0, y=0, s=1.0):
    paths = "\n".join(f'<path fill="{c}" d="{d}"/>' for (_, d), c in zip(sym.paths(), fills))
    return f'<g id="symbol" transform="translate({x:.2f} {y:.2f}) scale({s:.4f})">\n{paths}\n</g>'


def wordmark(t, size, x, top, fill, align="left", width=None):
    """Two-line wordmark whose first cap-line sits at `top`. Returns (svg, block width, block height)."""
    cap = t.cap * size / t.upem
    step = size * LEADING
    widths = [t.line(s, size, 0, 0)[1] for s in LINES]
    bw = max(widths)
    out = []
    for i, (s, lw) in enumerate(zip(LINES, widths)):
        lx = x + ((width or bw) - lw) / 2 if align == "center" else x
        d, _ = t.line(s, size, lx, top + cap + i * step)
        out.append(d)
    g = f'<path id="wordmark" fill="{fill}" d="{" ".join(out)}"/>'
    return g, bw, cap + (len(LINES) - 1) * step


def build(font, out):
    t = Type(font)
    sym = Symbol(**MAIN)
    color = [CORAL, AMBER, BLUE]
    # symbol's front card spans ~y 37..205 on its 256 canvas; text block centres on the card
    fx0, fy0 = sym._t(0, 0)
    fx1, fy1 = sym._t(136, 136)
    size = 84
    _, bw, bh = wordmark(t, size, 0, 0, INK)
    top = (fy0 + fy1) / 2 - bh / 2
    tx = 256 + 8
    W = tx + bw + 16

    for name, sf, tf, bg in (("color", color, INK, None), ("on-dark", color, PAPER, INK),
                             ("black", ["#000"] * 3, "#000", None), ("white", ["#fff"] * 3, "#fff", None)):
        wm, _, _ = wordmark(t, size, tx, top, tf)
        open(f"{out}/logo-horizontal-{name}.svg", "w").write(doc(W, 256, symbol_group(sym, sf) + "\n" + wm, bg))

    # stacked: symbol above, centred two-line wordmark below
    s_size = 64
    _, sbw, sbh = wordmark(t, s_size, 0, 0, INK)
    SW = max(sbw, 256) + 64
    sym_h = 256
    SH = sym_h + 8 + sbh + 40
    for name, sf, tf, bg in (("color", color, INK, None), ("on-dark", color, PAPER, INK),
                             ("black", ["#000"] * 3, "#000", None), ("white", ["#fff"] * 3, "#fff", None)):
        wm, _, _ = wordmark(t, s_size, (SW - sbw) / 2, sym_h + 8, tf, align="center", width=sbw)
        body = symbol_group(sym, sf, (SW - 256) / 2, 0) + "\n" + wm
        open(f"{out}/logo-stacked-{name}.svg", "w").write(doc(SW, SH, body, bg))

    # wordmark only
    wm, bw2, bh2 = wordmark(t, 64, 8, 8, INK)
    open(f"{out}/wordmark-color.svg", "w").write(doc(bw2 + 16, bh2 + 16 + 14, wm))

    # Liquid Glass lockups (expressive version, for cover/README/marketing)
    import glass
    for name, tf, bg, dark in (("glass-on-dark", PAPER, INK, True), ("glass-on-light", INK, None, False)):
        wm, _, _ = wordmark(t, size, tx, top, tf)
        body = glass.defs(dark) + "\n" + glass.symbol(sym, dark) + "\n" + wm
        open(f"{out}/logo-horizontal-{name}.svg", "w").write(doc(W, 256, body, bg))

    # plugin tile (Figma Community icon): ink square, colour symbol at ~74 %
    tile = symbol_group(sym, color, 128 * 0.13, 128 * 0.13 + 2, 128 * 0.74 / 256)
    open(f"{out}/icon-tile.svg", "w").write(doc(128, 128, tile, INK))


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
