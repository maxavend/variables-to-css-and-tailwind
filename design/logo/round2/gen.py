import math
INK="#1C1B3A"; BLUE="#2F6BFF"; CYAN="#19C2D6"; VIOLET="#8B5CF6"; CORAL="#FF5C5C"; AMBER="#FFB524"
def svg(title, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-labelledby="t"><title id="t">{title}</title>\n{body}\n</svg>\n'
def rot(p, a, c=(0,0)):
    a=math.radians(a); x,y=p
    return (c[0]+x*math.cos(a)-y*math.sin(a), c[1]+x*math.sin(a)+y*math.cos(a))
def f(p): return f"{p[0]:.2f} {p[1]:.2f}"
def poly(pts, fill): return f'<path fill="{fill}" d="M{" L".join(f(p) for p in pts)}Z"/>'
def pill(cx, cy, w, h, ang, fill):
    r=h/2; a=ang
    p1=rot((-w/2+r,-r),a,(cx,cy)); p2=rot((w/2-r,-r),a,(cx,cy)); p3=rot((w/2-r,r),a,(cx,cy)); p4=rot((-w/2+r,r),a,(cx,cy))
    return f'<path fill="{fill}" d="M{f(p1)} L{f(p2)} A{r} {r} 0 0 1 {f(p3)} L{f(p4)} A{r} {r} 0 0 1 {f(p1)}Z"/>'

# A — Cometa: kite of 4 swatches, its tail is the CSS "--"
def kite(cols, tail):
    C=(150,96); A=22
    T,L,R,B,M=[rot(p,A,C) for p in [(0,-84),(-62,-24),(62,-24),(0,96),(0,-24)]]
    b=[poly([T,L,M],cols[0]),poly([T,M,R],cols[1]),poly([L,B,M],cols[2]),poly([M,B,R],cols[3])]
    # tail dashes follow the line leaving the kite's bottom, angled like a falling ribbon
    b.append(pill(92,196,46,20,-28,tail[0])); b.append(pill(46,226,34,20,-12,tail[1]))
    return "\n".join(b)
open("a-cometa.svg","w").write(svg("Cometa",kite([BLUE,CYAN,VIOLET,CORAL],[INK,INK])))
open("a-cometa-black.svg","w").write(svg("Cometa",kite(["#000"]*4,["#000"]*2)))

# B — Molinete: pinwheel whose four blades grow like a token scale (100→400) and spin in the wind
def pin(cols, hole=True):
    cx,cy=118,148; radii=[56,76,96,116]; out=[]
    for k,(r,c) in enumerate(zip(radii,cols)):
        a0=math.radians(90*k); a1=math.radians(90*(k+1))
        p0=(cx+r*math.cos(a0),cy+r*math.sin(a0)); p1=(cx+r*math.cos(a1),cy+r*math.sin(a1))
        out.append(f'<path fill="{c}" d="M{cx} {cy} L{f(p0)} A{r} {r} 0 0 1 {f(p1)}Z"/>')
    if hole: out.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="#fff"/>')
    return "\n".join(out)
open("b-molinete.svg","w").write(svg("Molinete",pin([AMBER,CORAL,VIOLET,BLUE])))

# C — Prisma: one variable enters, it leaves split into its modes (each beam a "--" line of code)
def prism(tri, beam_in, beams):
    cx,cy=104,136; r=72
    pts=[(cx+r*math.cos(math.radians(a)), cy+r*math.sin(math.radians(a))) for a in (-90,30,150)]
    out=[pill(40,150,72,18,-14,beam_in)]
    for i,(c,ang) in enumerate(zip(beams,(-22,0,22))):
        out.append(pill(196+ (0 if i==1 else -4),136+ang*2.2,64,18,ang,c))
    out.append(f'<path fill="{tri}" stroke="{tri}" stroke-width="16" stroke-linejoin="round" d="M{f(pts[0])} L{f(pts[1])} L{f(pts[2])}Z"/>')
    return "\n".join(out)
open("c-prisma.svg","w").write(svg("Prisma",prism(INK,"#B8B6CC",[CORAL,AMBER,CYAN])))

# A v2 — tail dashes hug the kite tip and sweep left, whole mark recentred
def kite2(cols, tail):
    C=(150,92); A=22
    T,L,R,B,M=[rot(p,A,C) for p in [(0,-84),(-62,-24),(62,-24),(0,96),(0,-24)]]
    b=[poly([T,L,M],cols[0]),poly([T,M,R],cols[1]),poly([L,B,M],cols[2]),poly([M,B,R],cols[3])]
    b.append(pill(B[0]-12,B[1]+26,44,20,-38,tail[0])); b.append(pill(B[0]-60,B[1]+46,44,20,-14,tail[1]))
    return '<g transform="translate(-6 -2)">'+"\n".join(b)+"</g>"
open("a-cometa-v2.svg","w").write(svg("Cometa",kite2([BLUE,CYAN,VIOLET,CORAL],[INK,INK])))
open("a-cometa-v2-black.svg","w").write(svg("Cometa",kite2(["#000"]*4,["#000"]*2)))

# B — Abanico de modos: swatch cards fanned like a colour fan; the front card carries the CSS "--"
def fan(cols, dash):
    px,py=60,206; out=[]
    for c,ang in zip(cols,(28,14,0)):
        out.append(f'<rect x="{px}" y="{py-132}" width="132" height="132" rx="30" fill="{c}" transform="rotate({ang} {px} {py})"/>')
    cx,cy=px+66,py-66
    out.append(pill(cx-22,cy,36,18,0,dash)); out.append(pill(cx+22,cy,36,18,0,dash))
    return '<g transform="translate(-14 -34)">'+"\n".join(out)+"</g>"
open("b-abanico.svg","w").write(svg("Abanico de modos",fan([CORAL,AMBER,BLUE],"#fff")))

# C v2 — beams touch the prism faces, fan tighter
def prism2(tri, beam_in, beams):
    cx,cy=112,136; r=70
    pts=[(cx+r*math.cos(math.radians(a)), cy+r*math.sin(math.radians(a))) for a in (-90,30,150)]
    out=[pill(52,150,80,18,-16,beam_in)]
    for c,(dy,ang) in zip(beams,((-34,-20),(0,0),(34,20))):
        out.append(pill(194,136+dy,72,18,ang,c))
    out.append(f'<path fill="{tri}" stroke="{tri}" stroke-width="16" stroke-linejoin="round" d="M{f(pts[0])} L{f(pts[1])} L{f(pts[2])}Z"/>')
    return '<g transform="translate(-6 -6)">'+"\n".join(out)+"</g>"
open("c-prisma-v2.svg","w").write(svg("Prisma",prism2(INK,"#B8B6CC",[CORAL,AMBER,CYAN])))
