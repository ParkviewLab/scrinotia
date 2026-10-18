#!/usr/bin/env python3
"""Scrinotia icon generator. Pure Python, no dependencies.
Writes every SVG variant of the icon into ./out (or argv[1])."""
import math, os, sys

PALETTE = {
    "midnight":  "#0B1226",  # background
    "cream":     "#F2EBDD",  # spokes, hash fill
    "apricot":   "#EC8A4E",  # starburst tips
    "sky":       "#6BB3E0",  # centre ball
    "ultramarine":"#3558B8", # orbit dashes + satellite
    "gold":      "#E0B23A",  # sparkles
    "ink":       "#141518",  # hash outline
}
P = PALETTE
C = 512  # canvas centre (1024 x 1024)

# ---------- primitives ----------
def svg(body, size=1024):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}">{body}</svg>\n')

def sparkle(cx, cy, R):
    V, H = R * 1.35, R * 0.8          # taller than wide
    return (f'<path d="M{cx},{cy-V:.1f} Q{cx},{cy} {cx+H:.1f},{cy} Q{cx},{cy} {cx},{cy+V:.1f} '
            f'Q{cx},{cy} {cx-H:.1f},{cy} Q{cx},{cy} {cx},{cy-V:.1f}Z" fill="{P["gold"]}"/>')

def hash_mark(S=225, w=29, outline=15, rot=-12):
    o, h = S * 0.19, S / 2
    def rects():
        r = lambda x, y, W, H: f'<rect x="{x:.1f}" y="{y:.1f}" width="{W}" height="{H}" rx="{w*.22:.1f}"/>'
        return (r(C-o-w/2, C-h, w, S) + r(C+o-w/2, C-h, w, S) +
                r(C-h, C-o-w/2, S, w) + r(C-h, C+o-w/2, S, w))
    out = ""
    if outline:
        out += (f'<g transform="rotate({rot} {C} {C})" fill="{P["ink"]}" stroke="{P["ink"]}" '
                f'stroke-width="{outline}" stroke-linejoin="round">{rects()}</g>')
    out += f'<g transform="rotate({rot} {C} {C})" fill="{P["cream"]}">{rects()}</g>'
    return out

# ---------- starburst ----------
def tips(n=10, rot0=-112, lens=(380, 275), radii=(33, 25)):
    t = []
    for i in range(n):
        a = math.radians(rot0 + i * 360 / n)
        R = lens[i % len(lens)]
        t.append((C + R * math.cos(a), C + R * math.sin(a), radii[i % len(radii)]))
    return t

def starburst(spoke_w=12, **kw):
    T = tips(**kw)
    sp = "".join(f'<line x1="{C}" y1="{C}" x2="{x:.1f}" y2="{y:.1f}"/>' for x, y, _ in T)
    tp = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{P["apricot"]}"/>' for x, y, r in T)
    return f'<g stroke="{P["cream"]}" stroke-width="{spoke_w}" stroke-linecap="round">{sp}</g>{tp}'

def ball(r=178):
    return f'<circle cx="{C}" cy="{C}" r="{r}" fill="{P["sky"]}"/>'

# ---------- orbit: tapered ring of speed dashes ----------
RX, RY, OROT = 430, 180, math.radians(-21)
START, TOTAL = -6, 348
def _pt(thd):
    th = math.radians(thd); ex, ey = RX * math.cos(th), RY * math.sin(th)
    return C + ex*math.cos(OROT) - ey*math.sin(OROT), C + ex*math.sin(OROT) + ey*math.cos(OROT)
def _w(a):
    u = (START - a) / TOTAL
    return 4 + 3*(u/0.5) if u < 0.5 else 7 + 19*((u-0.5)/0.5)**1.2
def _dash(a0, a1, n=30):
    L, R = [], []
    for k in range(n + 1):
        th = a0 + (a1 - a0) * k / n; x, y = _pt(th); x2, y2 = _pt(th - 0.3)
        dx, dy = x2 - x, y2 - y; l = math.hypot(dx, dy); nx, ny = -dy/l, dx/l; w = _w(th)
        L.append((x + nx*w, y + ny*w)); R.append((x - nx*w, y - ny*w))
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in L + R[::-1]) + "Z"
    (ax, ay), (bx, by) = _pt(a0), _pt(a1); U = P["ultramarine"]
    return (f'<path d="{d}" fill="{U}"/><circle cx="{ax:.1f}" cy="{ay:.1f}" r="{_w(a0):.1f}" fill="{U}"/>'
            f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="{_w(a1):.1f}" fill="{U}"/>')
def orbit():
    """returns (back_half, front_half). Back half sits behind the whole starburst."""
    back = front = ""; a = START; seg = (START + 180) / 7
    for _ in range(7):
        back += _dash(a, a - seg*0.55); a -= seg
    span = -180 - (START - TOTAL); wts = [1 + 0.6*i/3 for i in range(4)]; k = span / sum(wts)
    for i, duty in enumerate([0.6, 0.65, 0.7, 0.5]):
        sg = wts[i]*k; front += _dash(a, a - sg*duty); a -= sg
    x, y = _pt(START - TOTAL)
    front += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="30" fill="{P["ultramarine"]}"/>'
    return back, front

def sparkles():
    return sparkle(205, 215, 52) + sparkle(830, 830, 34) + sparkle(845, 175, 22)

# ---------- backgrounds ----------
def bg_squircle(inset=40, rx=210):
    s = 1024 - 2*inset
    return f'<rect x="{inset}" y="{inset}" width="{s}" height="{s}" rx="{rx}" fill="{P["midnight"]}"/>'
def bg_full():
    return f'<rect width="1024" height="1024" fill="{P["midnight"]}"/>'

def artwork():
    b, f = orbit()
    return b + starburst() + ball() + hash_mark() + f + sparkles()

def scaled(body, s):
    return f'<g transform="translate({C} {C}) scale({s}) translate({-C} {-C})">{body}</g>'

# ---------- small-size art (16-32 px) ----------
def small_art():
    T = tips(n=8, rot0=-112, lens=(405,), radii=(58,))
    sp = "".join(f'<line x1="{C}" y1="{C}" x2="{x:.1f}" y2="{y:.1f}"/>' for x, y, _ in T)
    tp = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{P["apricot"]}"/>' for x, y, r in T)
    return (f'<g stroke="{P["cream"]}" stroke-width="44" stroke-linecap="round">{sp}</g>{tp}'
            + ball(300) + hash_mark(S=380, w=64, outline=26))

def build(out):
    os.makedirs(out, exist_ok=True)
    b, f = orbit()
    files = {
        # master: rounded-square tile with margin (docs, README, generic use)
        "scrinotia-icon.svg": svg(bg_squircle() + artwork()),
        # full-bleed square: iOS / iPadOS / web touch icons (the OS applies its own mask)
        "scrinotia-icon-fullbleed.svg": svg(bg_full() + artwork()),
        # macOS Big Sur+ grid: 824 px body at 100 px inset, artwork scaled to match
        "scrinotia-icon-macos.svg": svg(bg_squircle(100, 185) + scaled(artwork(), 824/944)),
        # simplified art for 16-32 px (favicon, macOS 16/32 slots)
        "scrinotia-icon-small.svg": svg(bg_squircle(0, 230) + small_art()),
        # simplified art on the macOS grid, for the 16 / 32 px macOS slots
        "scrinotia-icon-macos-small.svg": svg(bg_squircle(100, 185) + scaled(small_art(), 824/1024)),
        # layers (transparent, full canvas): visionOS image stack / Xcode Icon Composer
        "layers/1-background.svg": svg(bg_full()),
        "layers/2-orbit-back.svg": svg(b),
        "layers/3-starburst.svg": svg(starburst() + sparkles()),
        "layers/4-ball.svg": svg(ball() + hash_mark()),
        "layers/5-orbit-front.svg": svg(f),
        # visionOS 3-layer stack (Back / Middle / Front)
        "visionos/back.svg": svg(bg_full()),
        "visionos/middle.svg": svg(b + starburst() + sparkles()),
        "visionos/front.svg": svg(ball() + hash_mark() + f),
    }
    for name, content in files.items():
        p = os.path.join(out, name); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w").write(content)
    return files

if __name__ == "__main__":
    for n in build(sys.argv[1] if len(sys.argv) > 1 else "out"): print(n)
