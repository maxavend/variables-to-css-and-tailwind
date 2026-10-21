"""Liquid Glass rendition of the symbol, in Apple's native idiom: superellipse cards in system
colours, each a pane of tinted glass lit from above (a bright top edge, a faint lower one),
short ambient shadows, and a frosted front pane that lets the colours behind it through at
the edge it overlaps. The '--' is plain white. No glows, no flares.

Effects are baked in (gradients, blur, masks) because Figma does not apply system glass the
way iOS does. The flat masters stay the reference for one-colour use; this is the expressive
version for the plugin icon, cover and marketing. Also writes unmasked flat layers for
Icon Composer, where the system adds the glass itself.

Usage: python glass.py <out-dir>   (needs shapely, for the shared geometry)
"""
import sys
from symbol import Symbol, MAIN, S, CARD_D, BLUE, AMBER, CORAL, TITLE

# Light: white to Apple's grouped-background grey. Dark: Apple's elevated dark to black.
BG = {False: ("#FFFFFF", "#E9EBF0"), True: ("#2C2C2E", "#0B0B0C")}
ANG, SHIFT = 15, (16, -8)
CARD = f'<path d="{CARD_D}"/>'


def card_transforms(sym):
    """Transforms (card space → 256 canvas) for back, mid and front, matching Symbol's layout."""
    place = f"translate({sym.ox:.3f} {sym.oy:.3f}) scale({sym.k:.5f})"
    return [f"{place} {behind(2)}", f"{place} {behind(1)}", place]


def behind(i):
    """Transform of the i-th card behind, relative to the front card."""
    return f"translate({i * SHIFT[0]} {i * SHIFT[1]}) rotate({i * ANG} 0 {S})"


def defs(dark):
    top, bottom = BG[dark]
    return f"""<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/>
  </linearGradient>
  <linearGradient id="g-red" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FF7A70"/><stop offset="1" stop-color="{CORAL}"/>
  </linearGradient>
  <linearGradient id="g-orange" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFBE4D"/><stop offset="1" stop-color="{AMBER}"/>
  </linearGradient>
  <linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4DA3FF" stop-opacity="0.86"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0.94"/>
  </linearGradient>
  <!-- light from above: a soft wash on the upper half of each pane -->
  <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <!-- glass edge: bright along the top, gone at the sides, a faint return at the bottom -->
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.22" stop-color="#fff" stop-opacity="0.18"/>
    <stop offset="0.8" stop-color="#fff" stop-opacity="0.05"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/>
  </linearGradient>
  <linearGradient id="edgefade" x1="0" y1="0" x2="1" y2="0.5">
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/>
  </linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="{0.45 if dark else 0.14}"/>
  </filter>
  <filter id="frost" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="inset" x="-50%" y="-80%" width="200%" height="260%">
    <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#002A66" flood-opacity="0.3"/>
  </filter>
</defs>"""


def pane(uid, t, fill):
    """One glass card: colour, top wash, edge light clipped inside, ambient shadow."""
    return f"""<g transform="{t}">
  <clipPath id="clip-{uid}">{CARD}</clipPath>
  <path d="{CARD_D}" fill="url(#{fill})" filter="url(#shadow)"/>
  <path d="{CARD_D}" fill="url(#wash)"/>
  <path d="{CARD_D}" fill="none" stroke="url(#edge)" stroke-width="3" clip-path="url(#clip-{uid})"/>
</g>"""


def symbol(sym, dark):
    tb, tm, tf = card_transforms(sym)
    dashes = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}"/>' for x, y, w, h in sym.dashes)
    return f"""<g id="symbol-glass">
{pane("back", tb, "g-red")}
{pane("mid", tm, "g-orange")}
<g transform="{tf}">
  <clipPath id="clip-front">{CARD}</clipPath>
  <!-- the colours behind only show through towards the edge they sit under -->
  <mask id="refract" maskContentUnits="userSpaceOnUse"><rect width="{S}" height="{S}" fill="url(#edgefade)"/></mask>
  <path d="{CARD_D}" fill="{BG[dark][0]}" filter="url(#shadow)"/>
  <g clip-path="url(#clip-front)">
    <g mask="url(#refract)"><g filter="url(#frost)" opacity="0.75">
      <g transform="{behind(2)}"><path d="{CARD_D}" fill="{CORAL}"/></g>
      <g transform="{behind(1)}"><path d="{CARD_D}" fill="{AMBER}"/></g>
    </g></g>
    <rect width="{S}" height="{S}" fill="url(#g-blue)"/>
    <rect width="{S}" height="{S}" fill="url(#wash)"/>
  </g>
  <path d="{CARD_D}" fill="none" stroke="url(#edge)" stroke-width="3" clip-path="url(#clip-front)"/>
  <g fill="#fff" filter="url(#inset)">{dashes}</g>
</g>
</g>"""


def tile(sym, dark, size=1024):
    k = size * 0.80 / 256
    o = size * 0.10
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-labelledby="t">
<title id="t">{TITLE}</title>
{defs(dark)}
<rect width="{size}" height="{size}" fill="url(#bg)"/>
<g transform="translate({o + size * 0.012} {o + size * 0.01}) scale({k:.4f})">
{symbol(sym, dark)}
</g>
</svg>
"""


def standalone(sym, dark):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-labelledby="t">
<title id="t">{TITLE}</title>
{defs(dark)}
{symbol(sym, dark)}
</svg>
"""


def layers(sym, out):
    """Flat, unmasked layers for Icon Composer (the system adds the glass)."""
    tb, tm, tf = card_transforms(sym)
    dashes = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="#fff"/>' for x, y, w, h in sym.dashes)
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1024" height="1024">'
    files = {
        "0-background.svg": f'{head}<rect width="256" height="256" fill="#FFFFFF"/></svg>',
        "1-card-back.svg": f'{head}<g transform="{tb}"><path d="{CARD_D}" fill="{CORAL}"/></g></svg>',
        "2-card-mid.svg": f'{head}<g transform="{tm}"><path d="{CARD_D}" fill="{AMBER}"/></g></svg>',
        "3-card-front.svg": f'{head}<g transform="{tf}"><path d="{CARD_D}" fill="{BLUE}"/></g></svg>',
        "4-dashes.svg": f'{head}<g transform="{tf}">{dashes}</g></svg>',
    }
    for name, body in files.items():
        open(f"{out}/{name}", "w").write(body + "\n")


if __name__ == "__main__":
    import os
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    sym = Symbol(**MAIN)
    open(f"{out}/icon-glass.svg", "w").write(tile(sym, dark=False))
    open(f"{out}/icon-glass-dark.svg", "w").write(tile(sym, dark=True))
    open(f"{out}/symbol-glass-on-dark.svg", "w").write(standalone(sym, True))
    open(f"{out}/symbol-glass-on-light.svg", "w").write(standalone(sym, False))
    os.makedirs(f"{out}/icon-composer-layers", exist_ok=True)
    layers(sym, f"{out}/icon-composer-layers")
