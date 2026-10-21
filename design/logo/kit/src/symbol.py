"""Builds the 'Abanico de modos' symbol (superellipse cards): three swatch cards fanned 0/15/30° around the
front card's bottom-left corner (each also slid out a little so its edge shows all the way
round), separated by real gaps; the front card carries the CSS '--' as holes.

The front card and its dashes are written as exact arcs; the two cards behind are boolean
results (shapely), written as fine polylines.

Usage: python symbol.py <out-dir>   (needs shapely)
"""
import sys
from shapely.geometry import box
from shapely.affinity import rotate, translate, scale
from shapely.ops import unary_union

# Apple system colours (light-mode blue, dark-mode orange and red: the warmer, cleaner pair)
BLUE, AMBER, CORAL = "#007AFF", "#FF9F0A", "#FF453A"
S, R = 136, 32          # card size; R is the pill/arc radius scale
RES = 24                # arc segments per quarter
N = 5                   # superellipse exponent: continuous-curvature corners, like Apple's icon shape


def squircle_pts(count=240):
    """Superellipse |x|^N + |y|^N = 1 scaled to the S×S card, in card space (origin top-left)."""
    import math
    a = S / 2
    pts = []
    for i in range(count):
        t = 2 * math.pi * i / count
        c, s_ = math.cos(t), math.sin(t)
        pts.append((a + a * math.copysign(abs(c) ** (2 / N), c), a + a * math.copysign(abs(s_) ** (2 / N), s_)))
    return pts


CARD_D = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in squircle_pts()) + "Z"
TITLE = "Tokens to Code"


def rrect(x, y, w, h, r):
    return box(x + r, y + r, x + w - r, y + h - r).buffer(r, resolution=RES)


def card():
    from shapely.geometry import Polygon
    return Polygon(squircle_pts())


class Symbol:
    def __init__(self, gap, dash_w, dash_h, dash_gap, inset, ang=15, shift=(16, -8), size=256, pad=16):
        front = card()
        # each card behind turns `ang` more around the pivot and slides by `shift`
        mid = translate(rotate(front, ang, origin=(0, S)), *shift)
        back = translate(rotate(front, 2 * ang, origin=(0, S)), 2 * shift[0], 2 * shift[1])
        mid_vis = mid.difference(front.buffer(gap, resolution=RES))
        back_vis = back.difference(unary_union([front, mid]).buffer(gap, resolution=RES))
        # round the sharp tips the gaps leave near the pivot
        self.back, self.mid = (s.buffer(-3, resolution=RES).buffer(3, resolution=RES) for s in (back_vis, mid_vis))
        y = S - inset - dash_h
        self.dashes = [(inset, y, dash_w, dash_h), (inset + dash_w + dash_gap, y, dash_w, dash_h)]

        # fit everything into the canvas, centred, nudged 2 units up for the optical centre
        minx, miny, maxx, maxy = unary_union([front, self.mid, self.back]).bounds
        w, h = maxx - minx, maxy - miny
        self.k = (size - 2 * pad) / max(w, h)
        self.ox = (size - w * self.k) / 2 - minx * self.k
        self.oy = (size - h * self.k) / 2 - 2 - miny * self.k

    def _t(self, x, y):
        return x * self.k + self.ox, y * self.k + self.oy

    def _poly(self, geom):
        geom = scale(geom, self.k, self.k, origin=(0, 0))
        geom = translate(geom, self.ox, self.oy).simplify(0.02)
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        parts = []
        for p in polys:
            for ring in [p.exterior, *p.interiors]:
                parts.append("M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in list(ring.coords)[:-1]) + "Z")
        return " ".join(parts)

    def _rrect(self, x, y, w, h, r, ccw=False):
        (x, y), w, h, r = self._t(x, y), w * self.k, h * self.k, r * self.k
        f = lambda v: f"{v:.2f}"
        if not ccw:
            return (f"M{f(x + r)} {f(y)}H{f(x + w - r)}A{f(r)} {f(r)} 0 0 1 {f(x + w)} {f(y + r)}"
                    f"V{f(y + h - r)}A{f(r)} {f(r)} 0 0 1 {f(x + w - r)} {f(y + h)}H{f(x + r)}"
                    f"A{f(r)} {f(r)} 0 0 1 {f(x)} {f(y + h - r)}V{f(y + r)}A{f(r)} {f(r)} 0 0 1 {f(x + r)} {f(y)}Z")
        return (f"M{f(x + r)} {f(y)}A{f(r)} {f(r)} 0 0 0 {f(x)} {f(y + r)}V{f(y + h - r)}"
                f"A{f(r)} {f(r)} 0 0 0 {f(x + r)} {f(y + h)}H{f(x + w - r)}"
                f"A{f(r)} {f(r)} 0 0 0 {f(x + w)} {f(y + h - r)}V{f(y + r)}"
                f"A{f(r)} {f(r)} 0 0 0 {f(x + w - r)} {f(y)}Z")

    def paths(self):
        """(id, d) for back, mid, front — front includes the dashes as holes."""
        front = "M" + " L".join("%.2f %.2f" % self._t(x, y) for x, y in squircle_pts()) + "Z" + "".join(self._rrect(x, y, w, h, h / 2, ccw=True) for x, y, w, h in self.dashes)
        return [("card-back", self._poly(self.back)), ("card-mid", self._poly(self.mid)), ("card-front", front)]

    def svg(self, fills, size=256):
        body = "\n".join(f'<path id="{i}" fill="{c}" d="{d}"/>' for (i, d), c in zip(self.paths(), fills))
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
                f'role="img" aria-labelledby="t"><title id="t">{TITLE}</title>\n<g id="symbol">\n{body}\n</g>\n</svg>\n')


MAIN = dict(gap=8, dash_w=30, dash_h=16, dash_gap=8, inset=24)
# small-size cut (≤ 24 px): wider gaps, bigger dashes, tighter padding
SMALL = dict(gap=10, dash_w=40, dash_h=24, dash_gap=12, inset=22, pad=8)

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for name, params in (("symbol", MAIN), ("symbol-small", SMALL)):
        sym = Symbol(**params)
        open(f"{out}/{name}-color.svg", "w").write(sym.svg([CORAL, AMBER, BLUE]))
        open(f"{out}/{name}-black.svg", "w").write(sym.svg(["#000"] * 3))
