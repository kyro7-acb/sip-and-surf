"""Draws the Sip and Surf characters and their full sprite sheets.

Run from the repo root:  python3 tools/make_character.py   (needs Pillow and numpy)

Writes, for each character (tools/gojo.py and tools/spiderman.py):
  assets/characters/<id>.png   every frame in one row
  assets/characters/<id>.json  frame size and layout, read by the extension
and also:
  assets/anger.png             the anger mark that pops up over a snoozed character's head

This file holds everything the characters share: the body, the poses, the walk cycle and the
bottle. It draws no character of its own: each character file swaps in its palette, head
pixels and outfit with use(), then build() draws its sheet.

The buddy walks in side view, facing the way he walks. When he stops he turns to face you
(one three-quarter frame), and drinks facing you: the arm lifts the bottle to his chin, the
straw goes into his mouth, the water level drops, then he smiles.

How it is drawn: every body part is a vector shape (polygons, ellipses, tapered limbs),
rasterised at 8x and reduced to one pixel per cell, so edges stay clean. Each part gets a
1 px outline in a darker shade of its own colour, then hand-placed pixels add the face,
seams and highlights. Limbs are posed with joint angles per frame.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

FW, FH = 64, 100  # frame size
GROUND = 96.0  # y of the shoe soles
SS = 8  # supersampling for the vector shapes

# ---------------------------------------------------------------------------------------
# Default palette and outfit. Every character overrides what it needs with use().

SKIN = {"hi": (246, 214, 186), "lt": (236, 198, 168), "base": (222, 178, 146), "sh": (196, 148, 118),
        "dk": (160, 112, 88), "ol": (96, 60, 48)}
HAIR = {"hi": (108, 84, 68), "lt": (74, 56, 45), "base": (47, 35, 30), "dk": (30, 22, 20), "ol": (15, 11, 11)}
JACKET = {"hi": (98, 96, 110), "lt": (72, 70, 82), "base": (50, 49, 58), "sh": (37, 36, 43),
          "dk": (26, 25, 31), "ol": (12, 11, 15)}
PACK = {"hi": (190, 190, 196), "lt": (164, 164, 172), "base": (138, 138, 146), "sh": (110, 110, 119),
        "dk": (84, 84, 94), "ol": (46, 46, 54)}
PANTS = {"hi": (96, 108, 136), "lt": (72, 82, 108), "base": (54, 62, 84), "sh": (40, 46, 64),
         "dk": (30, 34, 48), "ol": (17, 19, 28)}
SHOE = {"hi": (255, 255, 255), "base": (236, 236, 242), "sh": (200, 202, 212), "sole": (164, 166, 178),
        "dk": (124, 126, 140), "ol": (60, 60, 72)}
LIPS = {"up": (148, 86, 70), "low": (168, 106, 84), "line": (100, 56, 44), "hi": (184, 122, 96)}
GLASS = {"lens": (24, 22, 30), "rim": (8, 7, 10), "ref": (72, 78, 102), "glint": (190, 200, 226)}
BOTTLE = {"body": (206, 234, 250), "hi": (250, 253, 255), "sh": (158, 198, 226), "water": (64, 166, 232),
          "water_sh": (38, 126, 196), "water_hi": (130, 206, 248), "cap": (34, 92, 168),
          "cap_hi": (74, 138, 214), "ol": (38, 66, 104)}
STRAW, STRAW_OL = (246, 248, 252), (118, 134, 156)
BACKPACK = False  # a grey backpack, worn on the back
NECK = "collar"  # "collar": a high jacket collar; "bare": the neck shows above a suit's round neckline
JACKET_DETAILS = True  # zip placket, storm flap, pockets and hem band; off for a plain suit
CUFFS = True  # darker sleeve cuffs
GLOVE = None  # palette for the hands (keys like SKIN); None means bare hands
BOOT = None  # palette for boots up the shin (keys like PANTS); None means just the shoes
TORSO_EXTRA = None  # f(frame, view, body_mask, oy) paints suit patterns; view is "side", "front" or "turn"


# ---------------------------------------------------------------------------------------
# Masks and drawing helpers. A mask is a (FH, FW) bool array.

def empty():
    return np.zeros((FH, FW), bool)


def shift(m, dx, dy):
    """out[y, x] = m[y + dy, x + dx] (False outside)."""
    out = np.zeros_like(m)
    h, w = m.shape
    ys, yd = (slice(dy, h), slice(0, h - dy)) if dy >= 0 else (slice(0, h + dy), slice(-dy, h))
    xs, xd = (slice(dx, w), slice(0, w - dx)) if dx >= 0 else (slice(0, w + dx), slice(-dx, w))
    out[yd, xd] = m[ys, xs]
    return out


def dilate(m):
    return m | shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)


def edge(m, dx, dy, n=1):
    """Pixels of m within n px of its edge in direction (dx, dy)."""
    return m & ~shift(m, dx * n, dy * n) if n == 1 else m & ~erode_dir(m, dx, dy, n)


def erode_dir(m, dx, dy, n):
    out = m.copy()
    for k in range(1, n + 1):
        out &= shift(m, dx * k, dy * k)
    return out


class Vec:
    """Vector shapes drawn at SS x resolution; .mask() reduces them to pixels."""

    def __init__(self):
        self.im = Image.new("L", (FW * SS, FH * SS), 0)
        self.d = ImageDraw.Draw(self.im)

    def poly(self, pts, on=True):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=255 if on else 0)
        return self

    def ellipse(self, cx, cy, rx, ry, on=True):
        self.d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS - 1, (cy + ry) * SS - 1],
                       fill=255 if on else 0)
        return self

    def limb(self, pts, radii, on=True):
        """A tapered tube through pts, with the given radius at each point."""
        for (x0, y0), (x1, y1), r0, r1 in zip(pts, pts[1:], radii, radii[1:]):
            n = max(2, int(math.hypot(x1 - x0, y1 - y0) * 3))
            for i in range(n + 1):
                t = i / n
                self.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t, on)
        return self

    def mask(self):
        return np.asarray(self.im.resize((FW, FH), Image.BOX)) >= 128


def poly(pts):
    return Vec().poly(pts).mask()


def ellipse(cx, cy, rx, ry):
    return Vec().ellipse(cx, cy, rx, ry).mask()


def pixels(pts):
    m = empty()
    for x, y in pts:
        if 0 <= x < FW and 0 <= y < FH:
            m[int(y), int(x)] = True
    return m


def pline(pts):
    """A 1 px line through integer points."""
    im = Image.new("1", (FW, FH), 0)
    ImageDraw.Draw(im).line([(int(round(x)), int(round(y))) for x, y in pts], fill=1)
    return np.asarray(im, bool)


def rot(p, deg, origin=(0.0, 0.0)):
    t = math.radians(deg)
    x, y = p[0] - origin[0], p[1] - origin[1]
    return (origin[0] + x * math.cos(t) - y * math.sin(t), origin[1] + x * math.sin(t) + y * math.cos(t))


def polar(origin, length, deg):
    """Point at `length` from origin; deg is measured from straight down, positive = forward (right)."""
    t = math.radians(deg)
    return (origin[0] + length * math.sin(t), origin[1] + length * math.cos(t))


def move(pts, dx=0.0, dy=0.0):
    return [(x + dx, y + dy) for x, y in pts]


class Frame:
    def __init__(self):
        self.px = np.zeros((FH, FW, 4), np.uint8)

    def paint(self, m, color):
        self.px[m] = (*color, 255)

    def part(self, m, fill, outline, shades=()):
        """Fill a part, outline it (over whatever is below), then paint shading clipped to it."""
        self.paint(dilate(m) & ~m, outline)
        self.paint(m, fill)
        for sm, color in shades:
            self.paint(sm & m, color)
        return m

    def image(self):
        return Image.fromarray(self.px)


# ---------------------------------------------------------------------------------------
# Side view, facing right (the way he walks). Standing: hips at HIP, shoulder at SHOULDER.

HIP = (30.0, 59.5)
THIGH, SHIN = 16.5, 16.5
SHOULDER = (29.5, 35.5)
UPPER_ARM, FOREARM = 11.5, 10.0


# Hand-placed pixels. Each entry is (y, x0, x1, letter); later entries paint over earlier ones.
LETTERS = {
    "h": HAIR["base"], "d": HAIR["dk"], "l": HAIR["lt"], "H": HAIR["hi"], "o": HAIR["ol"],
    "S": SKIN["base"], "s": SKIN["sh"], "k": SKIN["dk"], "L": SKIN["lt"], "T": SKIN["hi"], "K": SKIN["ol"],
    "U": LIPS["up"], "W": LIPS["low"], "M": LIPS["line"], "w": LIPS["hi"],
    "G": GLASS["lens"], "g": GLASS["ref"], "F": GLASS["rim"], "*": GLASS["glint"],
    "J": JACKET["base"], "j": JACKET["sh"], "Q": JACKET["lt"], "q": JACKET["dk"], "Z": JACKET["ol"],
    "V": (238, 240, 246),  # teeth
}


def runs_mask(runs, letters, oy=0, ox=0):
    m = empty()
    for y, x0, x1, c in runs:
        if c in letters and 0 <= y + oy < FH:
            m[y + oy, max(0, x0 + ox):x1 + ox + 1] = True
    return m


def paint_runs(f, runs, oy=0, ox=0, skip=""):
    for y, x0, x1, c in runs:
        if c not in skip and 0 <= y + oy < FH:
            f.px[y + oy, max(0, x0 + ox):x1 + ox + 1] = (*LETTERS[c], 255)


def paint_head(f, skin_runs, hair_runs, detail_runs, oy, ox=0):
    """Skin, then hair over it; a dark outline round the whole head (it draws the jawline over the
    neck), a soft shadow on the skin under the hair, then the hand-placed details."""
    skin = runs_mask(skin_runs, "S", oy, ox)
    hair = runs_mask(hair_runs, "h", oy, ox)
    head = skin | hair
    ring = dilate(head) & ~head
    f.paint(ring & dilate(hair), HAIR["ol"])
    f.paint(ring & ~dilate(hair), SKIN["ol"])
    f.paint(skin, SKIN["base"])
    f.paint(skin & dilate(hair) & ~hair, SKIN["sh"])
    f.paint(hair, HAIR["base"])
    paint_runs(f, detail_runs, oy, ox)
    return head


R = lambda y, x0, x1=None, c="S": (y, x0, x0 if x1 is None else x1, c)


def px(points, c):
    return [R(y, x, x, c) for x, y in points]


def runs(mask, letter):
    """Turns a mask into pixel runs, so vector shapes can join the hand-placed pixels."""
    out = []
    for y in range(FH):
        row = mask[y]
        x = 0
        while x < FW:
            if row[x]:
                x0 = x
                while x < FW and row[x]:
                    x += 1
                out.append(R(y, x0, x - 1, letter))
            else:
                x += 1
    return out


def line(pts, letter):
    return runs(pline(pts), letter)


# The head shapes every character shares: an oval face with a clean jaw. A character adds its
# hair (or mask) and face pixels on top.
SIDE_SKIN = [R(y, a, b) for y, a, b in [
    (13, 31, 36), (14, 30, 37), (15, 29, 37), (16, 28, 38), (17, 28, 38), (18, 26, 37), (19, 25, 38),
    (20, 25, 39), (21, 25, 40), (22, 25, 40), (23, 26, 39), (24, 27, 38), (25, 27, 38), (26, 27, 38),
    (27, 27, 37), (28, 28, 37), (29, 31, 36)]]

# A character's own head pixels. Each list holds runs; hair runs use the letter "h".
SIDE_HAIR = []
SIDE_DETAIL = []


def side_head(f, oy):
    o = lambda pts: move(pts, 0, oy)
    # Neck first, so the head's outline draws the jawline over it.
    # The throat sits well behind the chin, so the jaw stands out against the neck in shadow.
    # Its back sits under the ear, well in front of the back of the head.
    neck = poly(o([(26.0, 21.0), (30.0, 25.5), (33.0, 29.0), (33.6, 31.0), (33.8, 35.0), (25.4, 35.0),
                   (25.8, 29.0), (26.0, 25.0)]))
    jaw = runs_mask(SIDE_SKIN, "S", oy)
    f.part(neck, SKIN["sh"], SKIN["ol"], [(dilate(dilate(dilate(jaw))) & ~jaw, SKIN["dk"])])

    if NECK == "collar":
        # High funnel collar around the neck, stopping low enough to show the jaw.
        collar = poly(o([(23.4, 31.0), (27.4, 32.0), (31.5, 32.6), (34.8, 32.6), (36.2, 33.8), (36.4, 35.8),
                         (23.0, 35.8), (22.6, 32.0)]))
        f.part(collar, JACKET["base"], JACKET["ol"], [
            (edge(collar, 0, -1), JACKET["lt"]),
            (poly(o([(22, 31.5), (27, 31.5), (26, 36), (22, 36)])), JACKET["sh"]),
        ])
    else:
        # A suit's round neckline at the base of the neck.
        band = poly(o([(24.0, 32.6), (28.6, 33.2), (33.4, 32.8), (35.6, 33.8), (36.4, 35.8), (23.2, 35.8)]))
        f.part(band, JACKET["base"], JACKET["ol"], [(edge(band, 0, -1), JACKET["lt"])])
    paint_head(f, SIDE_SKIN, SIDE_HAIR, SIDE_DETAIL, oy)


def side_torso(f, oy):
    o = lambda pts: move(pts, 0, oy)
    body = poly(o([(24.0, 31.0), (27.4, 29.8), (32.4, 30.6), (35.2, 32.4), (36.4, 35.6), (36.8, 41.0),
                   (36.4, 48.0), (36.6, 55.0), (37.2, 61.0), (36.6, 63.4), (23.4, 63.4), (23.0, 61.0),
                   (23.2, 50.0), (23.0, 40.0), (23.2, 34.4)]))
    f.part(body, JACKET["base"], JACKET["ol"], [
        (poly(o([(21, 30), (26.6, 30), (26.2, 64), (21, 64)])), JACKET["sh"]),  # the back, away from the light
        (edge(body, 1, 0), JACKET["lt"]),
        (poly(o([(33.5, 31.5), (37.5, 34), (37.5, 43), (35.6, 43), (35, 36)])), JACKET["lt"]),  # chest catches light
    ])
    if JACKET_DETAILS:
        f.paint(poly(o([(21, 61.6), (40, 61.6), (40, 65), (21, 65)])) & body, JACKET["dk"])  # hem band
        f.paint(pline(o([(34, 35), (34, 61)])) & body, JACKET["dk"])  # placket over the zip
        f.paint(pline(o([(29, 50), (33, 49)])) & body, JACKET["dk"])  # pocket flap
        f.paint(pline(o([(29, 51), (33, 50)])) & body, JACKET["lt"])
    if TORSO_EXTRA:
        TORSO_EXTRA(f, "side", body, oy)
    if not BACKPACK:
        return
    # Backpack strap: over the shoulder, then down the front of the chest.
    strap = Vec().limb(o([(23.2, 32.2), (26.8, 31.0), (30.4, 31.8), (32.6, 34.4), (33.4, 38.6), (33.2, 43.0)]),
                       [1.2] * 6).mask()
    f.part(strap, PACK["base"], PACK["ol"], [(edge(strap, 0, -1), PACK["hi"]), (edge(strap, 1, 0), PACK["lt"])])
    f.paint(pixels(o([(33, 41), (33, 42)])), PACK["dk"])  # strap adjuster


def side_backpack(f, oy):
    o = lambda pts: move(pts, 0.8, oy)
    pack = poly(o([(21.8, 30.4), (18.0, 30.8), (15.6, 32.6), (14.6, 37.0), (14.2, 47.0), (14.6, 53.4),
                   (16.2, 55.8), (23.0, 56.2), (23.4, 31.6)]))
    f.part(pack, PACK["base"], PACK["ol"], [
        (poly(o([(13, 30), (19, 29), (17, 34), (15.6, 40), (13, 40)])), PACK["lt"]),
        (edge(pack, 0, -1), PACK["hi"]),
        (poly(o([(13, 52.6), (24, 52.6), (24, 57), (13, 57)])), PACK["sh"]),
        (pline(o([(22, 33), (19, 32), (17, 34), (16, 37)])), PACK["dk"]),  # zip around the top
    ])
    pocket = Vec().poly(o([(16.6, 41.0), (14.0, 41.4), (12.8, 44.0), (12.8, 51.4), (13.8, 53.4), (16.6, 53.6)])).mask()
    f.part(pocket, PACK["sh"], PACK["ol"], [
        (edge(pocket, -1, 0), PACK["base"]),
        (pline(o([(13, 44), (16, 43)])), PACK["dk"]),  # pocket zip
        (pixels(o([(15, 43)])), PACK["hi"]),
    ])
    handle = Vec().limb(o([(18.6, 30.6), (19.4, 28.8), (21.4, 28.8), (22.0, 30.6)]), [0.6] * 4).mask() & ~pack
    f.part(handle, PACK["sh"], PACK["ol"])


def arm_points(shoulder, angle, bend):
    elbow = polar(shoulder, UPPER_ARM, angle)
    hand = polar(elbow, FOREARM, angle + bend)
    return elbow, hand


def side_arm(f, shoulder, angle, bend, far=False):
    """Oversized sleeve with a cuff, and the fist. Returns the hand centre."""
    if far:
        tone = {"base": JACKET["dk"], "sh": JACKET["ol"], "lt": JACKET["sh"], "cuff": JACKET["ol"]}
    else:  # the near sleeve is a step lighter than the jacket body so the arm reads against it
        tone = {"base": JACKET["lt"], "sh": JACKET["base"], "lt": JACKET["hi"], "cuff": JACKET["sh"]}
    elbow, hand = arm_points(shoulder, angle, bend)
    wrist = polar(elbow, FOREARM - 2.2, angle + bend)
    cuff0 = polar(elbow, FOREARM - 3.8, angle + bend)
    sleeve = Vec().limb([shoulder, elbow, wrist], [3.5, 3.0, 2.7]).mask()
    f.part(sleeve, tone["base"], JACKET["ol"], [
        (edge(sleeve, -1, 0, 2), tone["sh"]),
        (edge(sleeve, 1, 0), tone["lt"]),
        (Vec().limb([cuff0, wrist], [2.9, 2.8]).mask() if CUFFS else empty(), tone["cuff"]),
    ])
    if not far:
        # a fold at the elbow
        ex, ey = int(round(elbow[0])), int(round(elbow[1]))
        f.paint(pixels([(ex - 1, ey - 1), (ex, ey)]) & sleeve, tone["sh"])
    return hand


def side_fist(f, hand, far=False):
    """Fist gripping the bottle: back of the hand and knuckles, fingers wrapped round the front."""
    x, y = int(round(hand[0])), int(round(hand[1]))
    fist = poly([(x - 2.0, y - 1.6), (x + 1.6, y - 2.0), (x + 2.8, y - 0.6), (x + 2.8, y + 2.4),
                 (x + 1.2, y + 3.2), (x - 2.0, y + 2.6)])
    c = GLOVE or SKIN
    tone = c["sh"] if far else c["base"]
    f.part(fist, tone, c["ol"], [
        (edge(fist, 0, -1), c["lt"] if not far else c["base"]),
        (pixels([(x + 1, y), (x + 1, y + 1)]), c["dk"]),  # finger gaps
        (edge(fist, 0, 1), c["sh"] if not far else c["dk"]),
    ])
    return fist


def shoe_points(ankle, foot_deg, length=1.0):
    """Side-view sneaker around the ankle; foot_deg > 0 lifts the toe; length < 1 foreshortens it."""
    local = [(-4.0, -1.8), (1.2, -2.6), (3.4, -1.2), (6.4, -0.2), (8.4, 1.2), (8.8, 3.8), (-4.2, 3.8), (-4.5, 0.8)]
    return [rot((ankle[0] + x * (length if x > 0 else 1), ankle[1] + y), -foot_deg, ankle) for x, y in local]


def side_leg(f, hip, thigh, bend, foot, far=False, length=1.0):
    c = {k: tuple(int(v * 0.72) for v in PANTS[k]) for k in PANTS} if far else PANTS
    knee = polar(hip, THIGH, thigh)
    ankle = polar(knee, SHIN, thigh - bend)
    # sneaker first, then the trouser leg over its top
    pts = shoe_points(ankle, foot, length)
    shoe = poly(pts)
    sole = poly([rot((ankle[0] + x, ankle[1] + y), -foot, ankle)
                 for x, y in [(-4.6, 2.6), (9.0, 2.6), (9.0, 4.0), (-4.6, 4.0)]])
    toe = poly([rot((ankle[0] + x * length, ankle[1] + y), -foot, ankle)
                for x, y in [(5.0, -0.4), (9.0, 1.2), (9.0, 2.6), (5.0, 2.6)]])
    s = SHOE if not far else {k: tuple(int(v * 0.82) for v in SHOE[k]) for k in SHOE}
    f.part(shoe, s["base"], SHOE["ol"], [
        (edge(shoe, 0, -1), s["hi"]), (toe, s["sh"]), (sole, s["sole"]),
        (pline([rot((ankle[0] + x, ankle[1] + y), -foot, ankle) for x, y in [(-2.5, 1.2), (4.5, 1.2)]]), s["sh"]),
    ])
    leg = Vec().limb([hip, knee, polar(knee, SHIN - 0.6, thigh - bend)], [4.4, 3.7, 3.2]).mask()
    f.part(leg, c["base"], PANTS["ol"], [
        (edge(leg, -1, 0, 2), c["sh"]),
        (edge(leg, 1, 0), c["lt"]),
    ])
    kx, ky = int(round(knee[0])), int(round(knee[1]))
    if bend > 12:  # crease behind the bent knee
        f.paint(pixels([(kx - 1, ky), (kx - 2, ky + 1)]) & leg, c["dk"])
    if BOOT:
        top = polar(knee, SHIN * 0.42, thigh - bend)
        boot(f, leg, Vec().limb([top, polar(knee, SHIN, thigh - bend)], [4.4, 4.4]).mask(), far, (1, 0))
    return pts


def boot(f, leg, area, far, lit):
    """Paints the part of a leg inside `area` as a boot, with its own outline and shading."""
    b = {k: tuple(int(v * 0.72) for v in BOOT[k]) for k in BOOT} if far else BOOT
    m = leg & area
    f.paint(dilate(leg) & ~leg & dilate(m), BOOT["ol"])
    f.paint(m, b["base"])
    f.paint(m & edge(leg, -lit[0], 0, 2), b["sh"])
    f.paint(m & edge(leg, lit[0], 0), b["lt"])
    f.paint(m & edge(m, 0, -1), b["dk"])  # the boot's top edge


def bottle_parts(f, center, level, straw_to=None, bubbles=(), straw_up=True):
    """Upright bottle centred at `center`; level 0..1 water; straw_to = mouth point while sipping."""
    cx, cy = int(round(center[0])), int(round(center[1]))
    body = poly([(cx - 2.5, cy - 4.8), (cx - 1.4, cy - 6.2), (cx + 2.4, cy - 6.2), (cx + 3.5, cy - 4.8),
                 (cx + 3.5, cy + 6.6), (cx + 2.6, cy + 7.4), (cx - 1.6, cy + 7.4), (cx - 2.5, cy + 6.6)])
    top, bottom = cy - 5, cy + 7
    water_top = bottom - int(round((bottom - top) * level))
    water = body & (np.arange(FH)[:, None] >= water_top)
    f.part(body, BOTTLE["body"], BOTTLE["ol"], [
        (water, BOTTLE["water"]),
        (water & edge(body, 1, 0), BOTTLE["water_sh"]),
        (water & (np.arange(FH)[:, None] == water_top), BOTTLE["water_hi"]),
        (pline([(cx - 1, cy - 4), (cx - 1, cy + 5)]), BOTTLE["hi"]),
        (edge(body, 1, 0) & ~water, BOTTLE["sh"]),
    ])
    for bx, by in bubbles:
        p = (cx + bx, cy + by)
        if water_top < p[1] < bottom:
            f.paint(pixels([p]), BOTTLE["water_hi"])
    cap = poly([(cx - 1.4, cy - 8.6), (cx + 2.4, cy - 8.6), (cx + 2.4, cy - 6.0), (cx - 1.4, cy - 6.0)])
    f.part(cap, BOTTLE["cap"], BOTTLE["ol"], [(edge(cap, 0, -1), BOTTLE["cap_hi"])])
    sx = cx + 0
    if straw_to is not None:
        mx, my = int(round(straw_to[0])), int(round(straw_to[1]))
        straw = pline([(sx, cy - 9), (sx, my + 1), (mx, my)])
    elif straw_up:
        straw = pline([(sx, cy - 9), (sx, cy - 11), (sx + 1, cy - 12)])
    else:
        straw = empty()
    rim = dilate(straw) & ~straw & ~(cap | body)
    if straw_to is not None:
        rim &= ~dilate(pixels([straw_to]))  # no outline where the straw meets the lips
    f.paint(rim, STRAW_OL)
    f.paint(straw, STRAW)


def side_frame(leg_near, leg_far, arm_near, arm_far):
    """leg = (thigh deg, knee bend, foot deg); arm = (shoulder deg, elbow bend)."""
    # Sit the body so the lowest shoe touches the ground; move the upper body in whole pixels.
    def lowest(leg, hip):
        knee = polar(hip, THIGH, leg[0])
        ankle = polar(knee, SHIN, leg[0] - leg[1])
        return max(y for _, y in shoe_points(ankle, leg[2]))

    drop = GROUND - max(lowest(leg_near, HIP), lowest(leg_far, HIP))
    oy = int(round(drop))
    hip = (HIP[0], HIP[1] + drop)
    shoulder = (SHOULDER[0], SHOULDER[1] + oy)

    f = Frame()
    if BACKPACK:
        side_backpack(f, oy)
    far_hand = side_arm(f, (shoulder[0] - 0.5, shoulder[1]), arm_far[0], arm_far[1], far=True)
    side_fist(f, far_hand, far=True)
    side_leg(f, hip, *leg_far, far=True)
    side_leg(f, hip, *leg_near)
    side_torso(f, oy)
    side_head(f, oy)
    hand = side_arm(f, shoulder, *arm_near)
    bottle_parts(f, (hand[0] + 1.4, hand[1] + 0.4), 1.0)
    side_fist(f, hand)
    return f.image()


# Walk cycle, 8 frames = 2 steps. Per frame for one leg: thigh angle, knee bend, foot angle.
# contact, down, passing, up, then the same with the legs swapped.
WALK_LEG = [(24, 4, 16), (18, 16, 0), (0, 6, 0), (-12, 5, -8),
            (-22, 12, -26), (-16, 40, -44), (12, 62, -18), (28, 30, 8)]


def walk_frame(i):
    near = WALK_LEG[i]
    far = WALK_LEG[(i + 4) % 8]
    t = 2 * math.pi * i / 8
    swing = 18 * math.cos(t)  # the near arm swings opposite the near leg
    return side_frame(near, far, (-swing, 16 + max(0.0, -swing) * 0.5), (swing, 14 + max(0.0, swing) * 0.5))


SIDE_IDLE = dict(leg_near=(3, 4, 0), leg_far=(-3, 4, 0), arm_near=(-4, 16), arm_far=(4, 12))


# ---------------------------------------------------------------------------------------
# Front view: facing you. The face is centred on x = 31.5.

MID = 31.5


def mirror(pts):
    return [(2 * MID - x, y) for x, y in pts]


FRONT_SKIN = [R(y, a, b) for y, a, b in [
    (11, 27, 36), (12, 25, 38), (13, 24, 39), (14, 24, 39), (15, 24, 39), (16, 24, 39), (17, 22, 41),
    (18, 22, 41), (19, 22, 41), (20, 22, 41), (21, 23, 40), (22, 24, 39), (23, 24, 39), (24, 24, 39),
    (25, 25, 38), (26, 25, 38), (27, 26, 37), (28, 27, 36), (29, 29, 34)]]

FRONT_HAIR = []
FRONT_HAIR_DETAIL = []
FRONT_FACE = []

# Mouths, facing you. "cool" is the resting face, "sip" closes the lips round the straw, "smile"
# comes after the drink, "growl" and "frown" are the angry frames.
MOUTHS = {
    "cool": [R(25, 30, 33, "U"), R(26, 31, 32, "W"), R(27, 30, 33, "s")],
    "sip": [R(25, 30, 30, "U"), R(25, 32, 33, "U"), R(25, 29, 29, "k"), R(25, 34, 34, "k"),
            R(26, 30, 30, "W"), R(26, 32, 32, "W"), R(27, 30, 33, "s")],
    "smile": [R(24, 28, 28, "M"), R(24, 35, 35, "M"), R(25, 29, 29, "M"), R(25, 30, 33, "U"),
              R(25, 34, 34, "M"), R(26, 30, 33, "W"), R(26, 31, 32, "w"), R(27, 30, 33, "s")],
    # a tight frown, and teeth gritted between pressed lips
    "frown": [R(25, 30, 33, "M"), R(26, 29, 29, "M"), R(26, 34, 34, "M"), R(26, 30, 33, "W"), R(27, 30, 33, "s")],
    "growl": [R(25, 29, 34, "M"), R(26, 29, 29, "M"), R(26, 30, 33, "V"), R(26, 34, 34, "M"), R(27, 30, 33, "M")],
}
GLINT = []  # extra pixels for the happy "cheers" frame
ANGRY_FACE = []  # extra pixels for the angry frames
# where the anger mark sits over the head, in frame pixels
ANGER_AT = {"front": [42, 6], "side": [36, 4]}


def front_head(f, mouth="cool", glint=False, angry=False):
    if NECK == "collar":
        collar = poly([(24.4, 24.8), (27.6, 28.2), (MID, 29.6), (35.4, 28.2), (38.6, 24.8), (40.4, 29.0),
                       (41.0, 33.5), (22.0, 33.5), (22.6, 29.0)])
        f.part(collar, JACKET["base"], JACKET["ol"], [
            (edge(collar, 0, -1), JACKET["lt"]),
            (poly([(27, 27), (36, 27), (35, 31.2), (28, 31.2)]), JACKET["dk"]),  # shadow under the chin
            (poly([(36.5, 24), (42, 24), (42, 34), (37.5, 34)]), JACKET["sh"]),
            (pline([(31, 31), (31, 33)]), JACKET["ol"]),  # zip
        ])
    else:
        bare_neck(f, MID)
    face = FRONT_FACE + (ANGRY_FACE if angry else []) + MOUTHS[mouth] + (GLINT if glint else [])
    paint_head(f, FRONT_SKIN, FRONT_HAIR, FRONT_HAIR_DETAIL + face, 0)


def bare_neck(f, mid):
    """The neck in the suit's round neckline, facing you (mid is the middle of the neck)."""
    neck = poly([(mid - 4.8, 24.0), (mid + 4.8, 24.0), (mid + 5.0, 29.8), (mid + 3.2, 31.0), (mid, 31.4),
                 (mid - 3.2, 31.0), (mid - 5.0, 29.8)])
    f.part(neck, SKIN["sh"], SKIN["ol"], [(poly([(mid + 2, 23), (mid + 6, 23), (mid + 6, 32), (mid + 2, 32)]),
                                           SKIN["dk"])])
    band = dilate(neck) & ~neck & (np.arange(FH)[:, None] >= 29)  # the neckline's edge
    f.paint(band, JACKET["ol"])
    f.paint(shift(band, 0, -1) & ~neck & (np.arange(FH)[:, None] >= 30), JACKET["lt"])


def front_torso(f):
    body = poly([(20.5, 30.5), (25, 29.5), (38, 29.5), (42.5, 30.5), (45.2, 32.2), (46.2, 35.4),
                 (46.0, 44), (45.0, 53), (45.2, 60.4), (44.6, 62.8), (18.4, 62.8), (17.8, 60.4),
                 (18.0, 53), (17.0, 44), (16.8, 35.4), (17.8, 32.2)])
    f.part(body, JACKET["base"], JACKET["ol"], [
        (poly([(38.5, 29), (48, 29), (48, 65), (39.5, 65)]), JACKET["sh"]),  # right side in shade
        (edge(body, -1, 0), JACKET["lt"]),
        (poly([(19, 31), (25, 30), (24, 34.5), (19, 35)]), JACKET["lt"]),  # left shoulder in the light
    ])
    if JACKET_DETAILS:
        for m, color in [
            (poly([(16, 60.8), (48, 60.8), (48, 65), (16, 65)]), JACKET["dk"]),  # hem band
            (pline([(31, 33), (31, 60)]), JACKET["dk"]),  # placket over the zip
            (pline([(30, 34), (30, 60)]), JACKET["lt"]),
            (pline([(18, 42), (24, 45), (30, 48)]), JACKET["dk"]),  # storm flap across the chest
            (pline([(18, 41), (24, 44), (30, 47)]), JACKET["lt"]),
            (pline([(20, 53), (22, 56)]), JACKET["dk"]), (pline([(43, 53), (41, 56)]), JACKET["dk"]),  # pockets
            (pline([(25, 50), (25, 60)]), JACKET["sh"]), (pline([(38, 50), (37, 60)]), JACKET["dk"]),  # folds
        ]:
            f.paint(m & body, color)
    if TORSO_EXTRA:
        TORSO_EXTRA(f, "front", body, 0)
    if not BACKPACK:
        return
    # backpack straps over both shoulders
    left = [(22.2, 30.0), (25.4, 29.8), (25.0, 33.0), (23.8, 39.0), (22.4, 44.6), (19.8, 44.0),
            (20.8, 38.0), (21.4, 33.0)]
    for pts, lit in ((left, True), (mirror(left), False)):
        strap = poly(pts)
        f.part(strap, PACK["base"] if lit else PACK["sh"], PACK["ol"], [
            (edge(strap, 0, -1), PACK["hi"] if lit else PACK["base"]),
            (edge(strap, 1 if lit else -1, 0), PACK["sh"] if lit else PACK["dk"]),
        ])
        by = 42
        bx = 21 if lit else 41
        f.paint(pixels([(bx, by), (bx + 1, by)]) & strap, PACK["dk"])


def front_sleeve(f, shoulder, elbow, hand, lit=True):
    """Upper arm, then the forearm over it with its own outline, so a bent arm shows the elbow."""
    wrist = (hand[0] + (elbow[0] - hand[0]) * 0.22, hand[1] + (elbow[1] - hand[1]) * 0.22)
    cuff0 = (hand[0] + (elbow[0] - hand[0]) * 0.42, hand[1] + (elbow[1] - hand[1]) * 0.42)
    tone = ({"base": JACKET["lt"], "sh": JACKET["base"], "hi": JACKET["hi"], "cuff": JACKET["sh"]} if lit else
            {"base": JACKET["base"], "sh": JACKET["sh"], "hi": JACKET["lt"], "cuff": JACKET["dk"]})
    bent = abs(math.degrees(math.atan2(hand[0] - elbow[0], hand[1] - elbow[1]))
               - math.degrees(math.atan2(elbow[0] - shoulder[0], elbow[1] - shoulder[1]))) > 35
    if bent:
        upper = Vec().limb([shoulder, elbow], [3.7, 3.3]).mask()
        f.part(upper, tone["sh"], JACKET["ol"], [(edge(upper, -1, 0), tone["base"])])
        fore = Vec().limb([elbow, wrist], [3.2, 2.9]).mask()
        f.part(fore, tone["base"], JACKET["ol"], [
            (edge(fore, 0, -1), tone["hi"]),
            (edge(fore, 0, 1, 2), tone["sh"]),
            (Vec().limb([cuff0, wrist], [3.0, 2.9]).mask() if CUFFS else empty(), tone["cuff"]),
        ])
        return
    sleeve = Vec().limb([shoulder, elbow, wrist], [3.7, 3.2, 2.9]).mask()
    f.part(sleeve, tone["base"], JACKET["ol"], [
        (edge(sleeve, 1, 0, 2), tone["sh"]),
        (edge(sleeve, -1, 0), tone["hi"]),
        (Vec().limb([cuff0, wrist], [3.0, 2.9]).mask() if CUFFS else empty(), tone["cuff"]),
    ])
    ex, ey = int(round(elbow[0])), int(round(elbow[1]))
    f.paint(pixels([(ex, ey), (ex + 1, ey + 1)]) & sleeve, tone["sh"])


def front_fist(f, hand, lit=True):
    x, y = int(round(hand[0])), int(round(hand[1]))
    fist = poly([(x - 2.4, y - 1.8), (x + 2.4, y - 1.8), (x + 2.8, y + 2.6), (x + 1.4, y + 3.6),
                 (x - 1.6, y + 3.6), (x - 2.8, y + 2.4)])
    c = GLOVE or SKIN
    f.part(fist, c["base"] if lit else c["sh"], c["ol"], [
        (edge(fist, -1, 0), c["lt"] if lit else c["base"]),
        (edge(fist, 1, 0), c["sh"] if lit else c["dk"]),
        (pixels([(x - 1, y + 1), (x + 1, y + 1)]), c["sh"] if lit else c["dk"]),  # knuckle creases
        (edge(fist, 0, 1), c["dk"]),
    ])


def front_legs(f):
    for hip, knee, ankle, lit in (((27.4, 60.5), (26.8, 76.5), (26.4, 90.6), True),
                                  ((35.6, 60.5), (36.2, 76.5), (36.6, 90.6), False)):
        shoe_pts = [(ankle[0] - 4.2, 96), (ankle[0] - 4.2, 93.0), (ankle[0] - 2.8, 90.4), (ankle[0] + 2.8, 90.4),
                    (ankle[0] + 4.2, 93.0), (ankle[0] + 4.2, 96)]
        shoe = poly(shoe_pts)
        f.part(shoe, SHOE["base"], SHOE["ol"], [
            (edge(shoe, 0, -1), SHOE["hi"]),
            (edge(shoe, 1 if lit else -1, 0), SHOE["sh"]),
            (poly([(ankle[0] - 5, 94.6), (ankle[0] + 5, 94.6), (ankle[0] + 5, 96), (ankle[0] - 5, 96)]), SHOE["sole"]),
        ])
        ax = int(round(ankle[0]))
        f.paint(pixels([(ax - 1, 91), (ax + 1, 91), (ax, 92)]) & shoe, SHOE["sh"])  # laces
        leg = Vec().limb([hip, knee, ankle], [4.4, 3.8, 3.3]).mask()
        c = PANTS
        f.part(leg, c["base"] if lit else c["sh"], PANTS["ol"], [
            (edge(leg, 1, 0, 2), c["sh"] if lit else c["dk"]),
            (edge(leg, -1, 0), c["lt"] if lit else c["base"]),
        ])
        kx = int(round(knee[0]))
        f.paint(pixels([(kx - 1, 77), (kx, 78)]) & leg, c["sh"] if lit else c["dk"])  # knee crease
        if BOOT:
            top = (knee[0] + (ankle[0] - knee[0]) * 0.42, knee[1] + (ankle[1] - knee[1]) * 0.42)
            boot(f, leg, Vec().limb([top, ankle], [4.4, 4.4]).mask(), not lit, (-1, 0))


# Drinking: (elbow, hand) of his right arm (on your left), water level, mouth, bubbles.
FRONT_SHOULDER_L, FRONT_SHOULDER_R = (19.6, 35.0), (43.4, 35.0)
FRONT_IDLE_ARM = ((17.2, 46.0), (18.4, 57.0))
DRINK = [
    ((16.2, 45.6), (21.8, 49.6), 1.0, "cool", ()),
    ((16.8, 45.0), (27.2, 41.4), 1.0, "cool", ()),
    ((17.4, 44.6), (29.6, 38.6), 1.0, "sip", ((0, 4),)),
    ((17.4, 44.6), (29.6, 38.6), 0.84, "sip", ((1, 2), (-1, 5))),
    ((17.4, 44.6), (29.6, 38.6), 0.7, "sip", ((0, 1), (1, 4))),
    ((17.4, 44.6), (29.6, 38.6), 0.58, "sip", ((-1, 3),)),
    ((16.4, 45.6), (23.4, 48.4), 0.58, "smile", ()),
    ((17.0, 46.0), (18.6, 55.4), 0.58, "smile", ()),
]
MOUTH_FRONT = (31, 25)
CHEERS = ((12.2, 35.6), (14.6, 24.0))  # bottle raised beside his head


def front_frame(arm=FRONT_IDLE_ARM, level=1.0, mouth="cool", bubbles=(), glint=False, angry=False):
    f = Frame()
    front_legs(f)
    front_torso(f)
    front_head(f, mouth, glint, angry)
    # his left arm (on your right) hangs relaxed
    far = ((45.8, 46.0), (44.8, 57.0))
    front_sleeve(f, FRONT_SHOULDER_R, *far, lit=False)
    front_fist(f, far[1], lit=False)
    elbow, hand = arm
    front_sleeve(f, FRONT_SHOULDER_L, elbow, hand)
    sipping = mouth == "sip"
    bottle_parts(f, (hand[0] + 1.6, hand[1] - 0.6), level, MOUTH_FRONT if sipping else None, bubbles)
    front_fist(f, hand)
    return f.image()


# ---------------------------------------------------------------------------------------
# Three-quarter view: half-way through turning from the side view to face you.

TURN_SKIN = [R(y, a, b) for y, a, b in [
    (12, 28, 36), (13, 27, 37), (14, 26, 38), (15, 26, 38), (16, 26, 39), (17, 24, 39), (18, 24, 39),
    (19, 24, 40), (20, 24, 40), (21, 24, 40), (22, 25, 40), (23, 25, 39), (24, 25, 39), (25, 26, 38),
    (26, 27, 38), (27, 28, 38), (28, 30, 37), (29, 32, 36)]]

TURN_HAIR = []
TURN_DETAIL = []


def turn_frame():
    f = Frame()
    if BACKPACK:
        # backpack: its side shows behind his near shoulder
        pack = poly([(22.0, 30.6), (18.2, 31.0), (16.0, 33.0), (15.2, 38.0), (15.0, 48.0), (15.4, 53.4),
                     (17.0, 55.6), (22.0, 55.8)])
        f.part(pack, PACK["base"], PACK["ol"], [
            (poly([(14, 30), (19.6, 29), (17.6, 34), (16.2, 40), (14, 40)]), PACK["lt"]),
            (edge(pack, 0, -1), PACK["hi"]),
            (poly([(14, 52.8), (23, 52.8), (23, 57), (14, 57)]), PACK["sh"]),
            (pline([(21, 32), (18, 32), (17, 34), (16, 37)]), PACK["dk"]),
        ])
        pocket = poly([(17.4, 41.0), (14.8, 41.4), (13.6, 44.0), (13.6, 51.4), (14.6, 53.4), (17.4, 53.6)])
        f.part(pocket, PACK["sh"], PACK["ol"], [(edge(pocket, -1, 0), PACK["base"]),
                                               (pline([(14, 44), (17, 43)]), PACK["dk"])])
    # his left arm, mostly behind him
    side_arm(f, (41.0, 35.2), 6, 8, far=True)
    side_fist(f, arm_points((41.0, 35.2), 6, 8)[1], far=True)
    side_leg(f, (35.2, 59.2), 0, 2, 0, far=True, length=0.65)
    side_leg(f, (28.0, 59.2), 0, 2, 0, length=0.65)

    body = poly([(21.4, 31.2), (25.4, 29.6), (35.0, 29.6), (39.8, 31.0), (42.4, 33.4), (43.2, 36.4),
                 (43.2, 44.0), (42.4, 53.0), (42.8, 60.4), (42.2, 62.8), (19.8, 62.8), (19.2, 60.4),
                 (19.6, 53.0), (18.8, 44.0), (18.8, 36.4), (19.6, 33.2)])
    f.part(body, JACKET["base"], JACKET["ol"], [
        (poly([(38.8, 29), (45, 29), (45, 65), (39.6, 65)]), JACKET["sh"]),
        (edge(body, -1, 0), JACKET["lt"]),
    ])
    if JACKET_DETAILS:
        for m, color in [
            (poly([(16, 60.8), (46, 60.8), (46, 65), (16, 65)]), JACKET["dk"]),
            (pline([(34, 33), (34, 60)]), JACKET["dk"]),
            (pline([(33, 34), (33, 60)]), JACKET["lt"]),
            (pline([(22, 42), (27, 45), (33, 48)]), JACKET["dk"]),
            (pline([(22, 41), (27, 44), (33, 47)]), JACKET["lt"]),
            (pline([(23, 53), (25, 56)]), JACKET["dk"]), (pline([(40, 53), (39, 56)]), JACKET["dk"]),
            (pline([(28, 50), (28, 60)]), JACKET["sh"]),
        ]:
            f.paint(m & body, color)
    if TORSO_EXTRA:
        TORSO_EXTRA(f, "turn", body, 0)
    if BACKPACK:
        for pts, lit in (([(22.4, 30.2), (25.8, 29.8), (26.2, 33.0), (25.6, 39.0), (24.6, 44.6), (22.2, 44.0),
                           (22.6, 38.0), (22.6, 33.0)], True),
                         ([(37.6, 30.0), (40.4, 30.6), (40.2, 34.0), (39.4, 40.0), (38.8, 44.0), (37.2, 43.6),
                           (37.6, 38.0), (37.4, 33.0)], False)):
            strap = poly(pts)
            f.part(strap, PACK["base"] if lit else PACK["sh"], PACK["ol"], [
                (edge(strap, 0, -1), PACK["hi"] if lit else PACK["base"]),
                (edge(strap, 1, 0), PACK["sh"] if lit else PACK["dk"]),
            ])
    if NECK == "collar":
        collar = poly([(24.6, 25.0), (28.4, 28.2), (33.0, 29.6), (36.6, 28.4), (39.2, 25.0), (40.6, 29.0),
                       (41.0, 33.5), (22.4, 33.5), (22.8, 29.0)])
        f.part(collar, JACKET["base"], JACKET["ol"], [
            (edge(collar, 0, -1), JACKET["lt"]),
            (poly([(29, 27), (38, 27), (37, 31.2), (30, 31.2)]), JACKET["dk"]),
            (poly([(37.5, 24), (42, 24), (42, 34), (38.5, 34)]), JACKET["sh"]),
            (pline([(34, 31), (34, 33)]), JACKET["ol"]),
        ])
    else:
        bare_neck(f, 32.6)
    paint_head(f, TURN_SKIN, TURN_HAIR, TURN_DETAIL, 0)
    hand = side_arm(f, (22.0, 35.2), -3, 10)
    bottle_parts(f, (hand[0] + 1.4, hand[1] + 0.4), 1.0)
    side_fist(f, hand)
    return f.image()


def stride():
    """How far the body travels per step, in sprite pixels: the planted foot moves this far
    back relative to the hips, so moving the sprite this far per step keeps the foot still."""
    def ankle_x(leg):
        knee = polar(HIP, THIGH, leg[0])
        return polar(knee, SHIN, leg[0] - leg[1])[0]
    return ankle_x(WALK_LEG[0]) - ankle_x(WALK_LEG[4])


def anger_mark():
    """The manga anger mark: a ring of red veins split by a cross-shaped gap, each vein's ends
    flicking outwards."""
    size = 13
    im = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(im)
    c, r, w, gap = size / 2, 4.3, 2.3, 0.85
    d.ellipse([(c - r) * SS, (c - r) * SS, (c + r) * SS, (c + r) * SS], outline=255, width=int(w * SS))
    for sx in (-1, 1):  # the flicks: each end of each vein bends out along the gap
        for sy in (-1, 1):
            ax, ay = c + sx * (gap + 0.9), c + sy * (r - 0.4)
            d.line([ax * SS, ay * SS, (ax + sx * 0.9) * SS, (ay + sy * 2.0) * SS], fill=255, width=int(1.3 * SS))
            ax, ay = c + sx * (r - 0.4), c + sy * (gap + 0.9)
            d.line([ax * SS, ay * SS, (ax + sx * 2.0) * SS, (ay + sy * 0.9) * SS], fill=255, width=int(1.3 * SS))
    d.rectangle([(c - gap) * SS, 0, (c + gap) * SS, size * SS], fill=0)
    d.rectangle([0, (c - gap) * SS, size * SS, (c + gap) * SS], fill=0)
    small = np.asarray(im.resize((size, size), Image.BOX)) >= 110
    small = small[:7, :7]
    small = np.block([[small, small[:, :-1][:, ::-1]], [small[:-1][::-1], small[:-1, :-1][::-1, ::-1]]])  # mirror
    big = np.zeros((size + 4, size + 4), bool)
    big[2:-2, 2:-2] = small
    grow = lambda m: (np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)) & ~m
    ring = grow(big)
    halo = grow(big | ring)  # a white edge, so the mark shows up on red and dark heads too
    out = np.zeros((size + 4, size + 4, 4), np.uint8)
    out[halo] = (255, 255, 255, 235)
    out[ring] = (110, 14, 20, 255)
    out[big] = (232, 40, 44, 255)
    out[big & ~np.roll(big, 1, 0)] = (255, 122, 110, 255)  # lit top edges
    return Image.fromarray(out)


# Everything a character can swap in with use(). The values above are the defaults.
CHARACTER_KEYS = [
    "SKIN", "HAIR", "JACKET", "PANTS", "SHOE", "LIPS", "GLASS", "PACK", "BACKPACK", "NECK", "JACKET_DETAILS",
    "CUFFS", "GLOVE", "BOOT", "TORSO_EXTRA",
    "SIDE_SKIN", "SIDE_HAIR", "SIDE_DETAIL", "FRONT_SKIN", "FRONT_HAIR", "FRONT_HAIR_DETAIL", "FRONT_FACE",
    "MOUTHS", "GLINT", "ANGRY_FACE", "ANGER_AT", "TURN_SKIN", "TURN_HAIR", "TURN_DETAIL",
]
DEFAULTS = {k: globals()[k] for k in CHARACTER_KEYS}
BASE_LETTERS = dict(LETTERS)


def use(extra_letters=None, **overrides):
    """Switch every drawing function to a character: the defaults, then the overrides."""
    unknown = set(overrides) - set(CHARACTER_KEYS)
    assert not unknown, f"unknown character keys: {unknown}"
    globals().update(DEFAULTS)
    globals().update(overrides)
    LETTERS.clear()
    LETTERS.update(BASE_LETTERS)
    LETTERS.update({"h": HAIR["base"], "d": HAIR["dk"], "l": HAIR["lt"], "H": HAIR["hi"], "o": HAIR["ol"],
                    "S": SKIN["base"], "s": SKIN["sh"], "k": SKIN["dk"], "L": SKIN["lt"], "T": SKIN["hi"],
                    "K": SKIN["ol"], "U": LIPS["up"], "W": LIPS["low"], "M": LIPS["line"], "w": LIPS["hi"],
                    "G": GLASS["lens"], "g": GLASS["ref"], "F": GLASS["rim"], "*": GLASS["glint"],
                    "J": JACKET["base"], "j": JACKET["sh"], "Q": JACKET["lt"], "q": JACKET["dk"],
                    "Z": JACKET["ol"]})
    LETTERS.update(extra_letters or {})


def draw(name):
    """Draws every frame of the current character. Returns the sheet image and its layout."""
    frames = [side_frame(**SIDE_IDLE)]
    frames += [walk_frame(i) for i in range(len(WALK_LEG))]
    frames += [turn_frame(), front_frame()]
    frames += [front_frame((e, h), level, mouth, bubbles) for e, h, level, mouth, bubbles in DRINK]
    frames += [front_frame(CHEERS, DRINK[-1][2], "smile", glint=True)]
    frames += [front_frame(level=DRINK[-1][2], mouth=m, angry=True) for m in ("growl", "frown")]

    sheet = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.alpha_composite(fr, (i * FW, 0))
    walk = len(WALK_LEG)
    meta = {
        "image": f"assets/characters/{name}.png",
        "frameWidth": FW,
        "frameHeight": FH,
        "idle": 0,  # side view, facing right
        "walkStart": 1,
        "walkFrames": walk,
        "stride": round(stride(), 2),
        "turnStart": 1 + walk,  # three-quarter view, played forwards to face you and backwards to leave
        "turnFrames": 1,
        "frontIdle": 2 + walk,  # facing you
        "drinkStart": 3 + walk,
        "drinkFrames": len(DRINK),
        "drinkMs": 2400,
        "cheers": 3 + walk + len(DRINK),  # bottle raised to you, after you press Sip
        "angryStart": 4 + walk + len(DRINK),  # after you press Snooze: growls, then frowns
        "angryFrames": 2,
        "anger": ANGER_AT,  # where the anger mark goes, facing you and in side view (facing right)
        "total": len(frames),
    }
    return frames, sheet, meta


def build(name):
    """Draws the current character into assets/characters/<name>.png and .json."""
    frames, sheet, meta = draw(name)
    out = ASSETS / "characters"
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / f"{name}.png")
    (out / f"{name}.json").write_text(json.dumps(meta, indent=2) + "\n")
    return frames, meta


def build_all():
    import gojo  # tools/gojo.py
    import spiderman  # tools/spiderman.py

    anger_mark().save(ASSETS / "anger.png")
    metas = {}
    for name, setup in (("gojo", gojo.use_gojo), ("spiderman", spiderman.use_spiderman)):
        setup()
        metas[name] = build(name)[1]
    use()
    return metas


if __name__ == "__main__":
    # Run the copy that the character files import, so use() switches the same globals build() reads.
    import make_character

    metas = make_character.build_all()
    for name, meta in metas.items():
        print(f"Wrote assets/characters/{name}.png and .json ({meta['total']} frames of {FW} x {FH})")
    print("Wrote assets/anger.png")
