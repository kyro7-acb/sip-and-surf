"""Spider-Man: the red and blue suit with the web pattern and the black spider on the chest,
and the mask rolled up to just under his nose, so his mouth is free to sip. Big white lenses
with black rims, red gloves and boots. The body, poses and bottle come from
tools/make_character.py; this file sets the palette, the masked head and the suit pattern.

Built by tools/make_character.py (python3 tools/make_character.py), which calls use_spiderman().
"""
import math

import numpy as np
from PIL import Image, ImageDraw

import make_character as mc
from make_character import R, dilate, edge, empty, mirror, pixels, pline, poly, px, runs, shift

SKIN = {"hi": (252, 226, 204), "lt": (244, 210, 184), "base": (230, 190, 160), "sh": (204, 160, 132),
        "dk": (168, 122, 98), "ol": (100, 62, 50)}
RED = {"hi": (255, 124, 110), "lt": (236, 64, 58), "base": (206, 30, 40), "sh": (172, 22, 34),
       "dk": (138, 14, 28), "ol": (62, 6, 16)}
BLUE = {"hi": (98, 142, 238), "lt": (62, 106, 216), "base": (38, 76, 180), "sh": (28, 58, 146),
        "dk": (20, 40, 108), "ol": (8, 14, 50)}
SHOE = {"hi": RED["lt"], "base": RED["base"], "sh": RED["sh"], "sole": RED["dk"], "dk": RED["dk"], "ol": RED["ol"]}
LIPS = {"up": (192, 116, 104), "low": (210, 138, 122), "line": (136, 76, 68), "hi": (228, 162, 146)}
EXTRA = {
    "E": (246, 250, 255),  # lens
    "e": (184, 202, 228),  # lens in shade
    "N": (16, 12, 22),  # lens rims and the spider on the chest
    "n": (124, 10, 24),  # web lines
}
ROWS = np.arange(mc.FH)[:, None]
COLS = np.arange(mc.FW)[None, :]


def ring(cx, cy, r):
    im = Image.new("1", (mc.FW, mc.FH), 0)
    ImageDraw.Draw(im).ellipse([cx - r, cy - r, cx + r, cy + r], outline=1)
    return np.asarray(im, bool)


def web(center, radials, radii, length=60):
    """Web lines: straight threads out from `center` (degrees, 0 = up, clockwise), crossed by rings."""
    cx, cy = center
    m = empty()
    for a in radials:
        t = math.radians(a)
        m |= pline([(cx, cy), (cx + length * math.sin(t), cy - length * math.cos(t))])
    for r in radii:
        m |= ring(cx, cy, r)
    return m


# ---------------------------------------------------------------------------------------
# The masked head. The mask is drawn as the head's "hair": it covers everything down to just
# under the nose, where it is rolled up into a thick lip. Below it: mouth, jaw and neck.

def mask_shape(view):
    skin = mc.runs_mask({"front": mc.FRONT_SKIN, "side": mc.SIDE_SKIN, "turn": mc.TURN_SKIN}[view], "S")
    if view == "front":
        cranium = mc.ellipse(31.5, 15.0, 9.9, 8.6)
    elif view == "side":
        # the back of the mask runs on down the back of the head to the nape
        cranium = poly([(26.0, 6.6), (31.6, 6.4), (35.4, 7.8), (37.8, 10.2), (38.8, 13.2), (39.0, 15.6),
                        (38.6, 17.2), (39.4, 18.6), (40.6, 20.4), (41.4, 22.0), (40.6, 24.0), (31.0, 24.0),
                        (28.0, 24.8), (26.4, 26.4), (24.6, 26.6), (22.0, 24.6), (19.8, 21.2), (18.8, 16.0),
                        (19.4, 11.6), (21.6, 8.6)])
    else:
        cranium = poly([(28.0, 6.4), (33.6, 6.2), (37.6, 7.8), (40.0, 10.6), (41.0, 14.0), (41.2, 18.0),
                        (41.0, 21.6), (40.0, 24.0), (24.6, 24.0), (22.6, 21.6), (21.4, 17.8), (21.6, 13.0),
                        (23.2, 9.4)])
    return cranium | (skin & (ROWS <= 23))


LENS = {
    # facing you: the left lens (his right eye); the other is its mirror image
    "front": [(23.0, 12.8), (27.6, 13.0), (29.8, 14.4), (30.4, 18.2), (29.4, 19.2), (26.4, 18.4),
              (23.6, 16.6), (22.8, 14.6)],
    "side": [(31.8, 12.4), (35.8, 12.2), (38.0, 13.2), (38.6, 15.4), (37.8, 17.6), (35.6, 17.2), (33.0, 15.0)],
    "turn_near": [(25.6, 12.8), (30.4, 13.0), (32.4, 14.4), (32.8, 18.2), (31.8, 19.2), (28.8, 18.2),
                  (26.2, 16.6), (25.4, 14.6)],
    "turn_far": [(36.0, 14.2), (37.6, 13.0), (40.2, 13.0), (40.4, 15.6), (39.0, 17.6), (36.6, 18.6)],
}
WEB_CENTER = {"front": (31.5, 16.5), "side": (39.6, 17.0), "turn": (34.4, 16.5)}
WEB_RADIALS = {
    "front": [0, 38, 76, 112, 148, 180, -38, -76, -112, -148],
    "side": [-10, -40, -70, -100, -130, -160, 170],
    "turn": [0, 40, 80, 115, 150, 180, -36, -72, -108, -144],
}
WEB_RADII = {"front": [4.5, 8.5], "side": [6.0, 11.5, 17.0], "turn": [4.5, 8.5, 12.5]}


def lenses(view, mood="normal"):
    """The lens masks for a view. Angry lenses lose their top inner corner; happy ones curve up
    from below."""
    if view == "front":
        shapes = [LENS["front"], mirror(LENS["front"])]
    elif view == "side":
        shapes = [LENS["side"]]
    else:
        shapes = [LENS["turn_near"], LENS["turn_far"]]
    out = []
    for pts in shapes:
        m = poly(pts)
        xs = [x for x, _ in pts]
        inner_right = (sum(xs) / len(xs)) < mc.MID  # the lens on your left has its inner end on the right
        x0, x1 = min(xs), max(xs)
        top = min(y for _, y in pts)
        if mood == "angry":
            # a slanted cut from the outer top corner down to the inner side
            a, b = (x0, top - 0.6), (x1 + 0.6, top + 3.6)
            if not inner_right:
                a, b = (x1, top - 0.6), (x0 - 0.6, top + 3.6)
            slope = (b[1] - a[1]) / (b[0] - a[0])
            m &= ROWS >= a[1] + slope * (COLS - a[0])
        elif mood == "happy":
            bottom = max(y for _, y in pts)
            cx = (x0 + x1) / 2
            m &= ~mc.ellipse(cx, bottom + 2.2, (x1 - x0) * 0.42, 3.2)
        out.append(m)
    return out


def mask_details(view, mood="normal"):
    """Everything painted on the mask: shading, web lines, the rolled-up lip and the lenses."""
    shape = mask_shape(view)
    eyes = lenses(view, mood)
    eye_area = empty()
    for m in eyes:
        eye_area |= dilate(m)
    # rows counted up from the mask's bottom edge: the rolled-up lip is the lowest three
    above = [shape & ~shift(shape, 0, 1)]
    for _ in range(2):
        above.append(shape & shift(above[-1], 0, 1))
    roll = above[0] | above[1] | above[2]
    out = []
    # the light comes from the upper left: a lit rim there, shade down the far side
    out += runs(shape & ~shift(shape, -1, -1) & ~roll, "l")
    out += runs(shape & ~shift(shape, 2, 0) & (ROWS > 9) & ~roll, "d")
    out += runs(web(WEB_CENTER[view], WEB_RADIALS[view], WEB_RADII[view]) & shape & ~roll & ~eye_area, "n")
    # the rolled-up lip: a crease above it, lit on top, darker underneath
    out += runs(above[2], "n") + runs(above[1], "l") + runs(above[0], "h")
    out += runs(above[0] & ~shift(shape, 2, 0), "d")
    for m in eyes:
        out += runs(dilate(m) & ~m, "N")
        out += runs(m, "E")
        out += runs(m & ~shift(m, 0, 1), "e")  # shade along the bottom
        out += runs(m & ~shift(m, 1, 0) & ~shift(m, 0, 1), "e")
    return out


def relens(view, mood):
    """Repaints the lenses for a mood: wipes the normal lenses, then draws everything again."""
    area = empty()
    for m in lenses(view):
        area |= dilate(m)
    return runs(area, "h") + mask_details(view, mood)


# The lower face, under the mask: lit on the left, shade down the right side and under the jaw.
LOWER_FRONT = [
    R(24, 25, 26, "L"), R(25, 26, 27, "L"), R(26, 26, 27, "L"),
    R(24, 37, 39, "s"), R(25, 36, 38, "s"), R(26, 36, 38, "s"), R(27, 35, 37, "s"), R(28, 34, 36, "s"),
    R(25, 38, 38, "k"), R(26, 38, 38, "k"), R(27, 37, 37, "k"),
    R(28, 31, 32, "L"),  # chin
]
LOWER_SIDE = [
    R(24, 28, 28, "L"), R(25, 28, 28, "L"), R(26, 28, 28, "L"), R(27, 28, 28, "L"), R(28, 28, 30, "T"),
    R(29, 31, 35, "T"), R(26, 30, 32, "s"), R(27, 30, 31, "s"),
    # a grin in profile: the corner turns up
    R(24, 35, 35, "M"), R(25, 36, 38, "M"), R(26, 37, 38, "W"), R(27, 37, 37, "s"), R(28, 36, 37, "L"),
]
LOWER_TURN = [
    R(24, 37, 38, "s"), R(25, 37, 38, "s"), R(26, 36, 37, "s"), R(27, 36, 37, "s"), R(28, 35, 36, "s"),
    R(24, 27, 28, "L"), R(25, 28, 29, "L"),
    R(24, 32, 32, "M"), R(25, 33, 36, "M"), R(24, 37, 37, "M"), R(26, 34, 36, "W"), R(27, 34, 35, "s"),
    R(28, 33, 34, "L"),
]

MOUTHS = dict(mc.MOUTHS)
MOUTHS.update({
    # an easy grin, corners up
    "cool": [R(25, 29, 29, "M"), R(25, 34, 34, "M"), R(26, 30, 33, "M"), R(27, 31, 32, "W")],
    # after the drink: a wide grin with teeth
    "smile": [R(24, 28, 28, "M"), R(24, 35, 35, "M"), R(25, 29, 34, "M"), R(26, 29, 29, "M"), R(26, 30, 33, "V"),
              R(26, 34, 34, "M"), R(27, 30, 33, "W")],
})


# ---------------------------------------------------------------------------------------
# The suit: red with web lines, blue panels down the sides, a red belt, blue below it.

SPIDER = [
    "N......N",
    ".N.NN.N.",
    "..NNNN..",
    "NN.NN.NN",
    "..NNNN..",
    ".N.NN.N.",
    "N......N",
]


def spider(cx, top, squeeze=1.0):
    """The chest emblem, its middle on cx; squeeze < 1 narrows it for the turn."""
    pts = []
    for dy, row in enumerate(SPIDER):
        for dx, c in enumerate(row):
            if c == "N":
                pts.append((int(round(cx + (dx - 3.5) * squeeze)), top + dy))
    return pixels(pts)


def suit(f, view, body, oy):
    o = lambda pts: mc.move(pts, 0, oy)
    inside = body.copy()
    if view == "front":
        panels = [poly([(14, 35.0), (21.6, 35.4), (25.4, 56.6), (14, 57.0)]),
                  poly(mirror([(14, 35.0), (21.6, 35.4), (25.4, 56.6), (14, 57.0)]))]
        lit = [True, False]
        center, emblem = (31.5, 40.5), spider(31.5, 37)
    elif view == "turn":
        panels = [poly([(16, 35.0), (23.6, 35.4), (27.6, 56.6), (16, 57.0)]),
                  poly([(40.8, 35.0), (46, 35.0), (46, 57.0), (38.8, 56.6)])]
        lit = [True, False]
        center, emblem = (33.4, 40.5), spider(33.4, 37, 0.85)
    else:
        panels = [poly(o([(24.6, 37.0), (33.0, 37.0), (35.6, 56.6), (22.0, 56.6)]))]
        lit = [True]
        center, emblem = (34.0, 40.5 + oy), empty()
    belt_top, belt_bottom = 56.4 + oy, 59.0 + oy
    below = inside & (ROWS >= belt_bottom)
    blue = below.copy()
    for m in panels:
        blue |= m & inside & (ROWS < belt_top)
    red = inside & ~blue
    # web lines on the red parts, then the blue on top
    threads = web(center, [0, 45, 90, 135, 180, 225, 270, 315], [6.5, 12.5, 18.5]) & red
    f.paint(threads & ~(ROWS >= belt_top), RED["dk"])
    f.paint(red & (ROWS >= belt_top) & (ROWS < belt_bottom), RED["base"])  # belt
    f.paint(red & (ROWS >= belt_top) & (ROWS < belt_top + 1), RED["lt"])
    for m, is_lit in zip(panels, lit):
        part = m & blue & (ROWS < belt_top)
        f.paint(part, BLUE["base"] if is_lit else BLUE["sh"])
        f.paint(part & edge(part, -1, 0), BLUE["lt"] if is_lit else BLUE["base"])
    f.paint(below, BLUE["base"])
    if view != "side":
        f.paint(below & (COLS >= (39 if view == "front" else 40)), BLUE["sh"])
    f.paint(blue & ~shift(blue, 0, -1) & dilate(red), BLUE["dk"])  # the seam under the red
    f.paint(emblem & inside, EXTRA["N"])


def use_spiderman():
    mc.use(
        extra_letters=EXTRA,
        SKIN=SKIN, HAIR={k: RED[k] for k in ("hi", "lt", "base", "dk", "ol")}, JACKET=RED, PANTS=BLUE,
        SHOE=SHOE, LIPS=LIPS,
        NECK="bare", JACKET_DETAILS=False, CUFFS=False, GLOVE=RED, BOOT=RED, TORSO_EXTRA=suit,
        FRONT_HAIR=runs(mask_shape("front"), "h"), FRONT_FACE=mask_details("front") + LOWER_FRONT,
        SIDE_HAIR=runs(mask_shape("side"), "h"), SIDE_DETAIL=mask_details("side") + LOWER_SIDE,
        TURN_HAIR=runs(mask_shape("turn"), "h"), TURN_DETAIL=mask_details("turn") + LOWER_TURN,
        MOUTHS=MOUTHS, GLINT=relens("front", "happy"), ANGRY_FACE=relens("front", "angry"),
        ANGER_AT={"front": [45, 6], "side": [39, 5]},
    )
