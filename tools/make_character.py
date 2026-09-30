"""Draws the Sip and Surf character (a pixel portrait of ayush) and its full sprite sheet.

Run from the repo root:  python3 tools/make_character.py   (needs Pillow and numpy)

Writes:
  assets/character-sheet.png   every frame, one row: idle, 8 walk frames, 8 drink frames
  assets/character-sheet.json  frame size and layout, read by the extension
  assets/character-sprite.png  the idle frame on its own

The head and jacket are letter grids (one letter = one pixel, colours in PAL). Legs, the
arm and the bottle are drawn per frame so the legs swing when walking and the arm lifts the
bottle to sip through the straw. Every part gets its own dark outline, which keeps parts
readable where they overlap.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

FW, FH = 60, 70  # frame size
GROUND = 66  # y of the shoe soles

PAL = {
    # hair
    "H": (38, 28, 23), "M": (52, 39, 31), "L": (84, 64, 50),
    "F": (60, 48, 41),  # undercut stubble
    "f": (128, 86, 58),  # faded skin on the undercut
    "P": (170, 120, 84),  # hard part line
    # skin
    "S": (178, 125, 86), "s": (146, 96, 62), "T": (199, 146, 104), "j": (120, 76, 48),
    "E": (132, 84, 54), "N": (110, 66, 40), "m": (116, 78, 55), "O": (140, 78, 58),
    # sunglasses
    "G": (18, 14, 14), "g": (104, 108, 124), "R": (214, 58, 44), "B": (58, 123, 213),
    # jacket
    "J": (47, 44, 51), "D": (31, 29, 34), "U": (70, 66, 76), "C": (22, 20, 24), "Z": (24, 22, 27),
    "W": (236, 233, 240),
    # backpack strap
    "A": (138, 138, 145), "a": (104, 104, 111),
}
OUTLINE = (24, 18, 22, 255)
PANTS, PANTS_DARK, PANTS_HI = (42, 49, 66), (30, 35, 49), (60, 70, 92)
SHOE, SHOE_SHADE, SOLE = (236, 236, 240), (190, 190, 200), (138, 138, 150)
PACK, PACK_DARK, PACK_HI = (132, 132, 139), (100, 100, 108), (160, 160, 167)
SLEEVE, SLEEVE_DARK, SLEEVE_HI, CUFF = (47, 44, 51), (33, 31, 36), (72, 68, 78), (28, 26, 31)
SKIN, SKIN_DARK = (178, 125, 86), (146, 96, 62)
BOTTLE, BOTTLE_HI, WATER, WATER_DARK, CAP = (206, 236, 250), (240, 250, 255), (64, 170, 232), (40, 132, 196), (30, 90, 160)
STRAW = (238, 242, 246)

# 28 x 26 head, facing right. Hair: 80/20 side part (the hard part line P) with the long
# top swept over and forward, and a faded undercut (F/f) around the side and back.
# Jaw: sharp corner under the ear and a shadowed jawline (j) running to the chin.
HEAD = [
    "...........MMMMMM...........",
    "........MMMHHHHHHMMM........",
    "......MMHHHHLLLHHHHMM.......",
    ".....MHHHLLLHHHHHLLLHMM.....",
    "....MHHLLHHHHHLLLHHHHLMM....",
    "...MHHLHHHHHLLHHHHHLLHHMMM..",
    "..MHHHHHHHLLHHHHHLLHHHHHLMM.",
    "..HHHHHHHLHHHHHHLHHHHHLLHHMM",
    ".MHHHHHHHHHHHHHHHHHHHHHHHHHM",
    ".HPPPPPPPPPPPHHHHHHHHHHHHHMM",
    ".FFFFFFFFFFFFHHHHHHHHHHHHHH.",
    ".FFFFFFFFFFFFSSSHHHHHHHMHHH.",
    "FfFfFfFfFfFSSSSGGGGSSSGGHHH.",
    "fFfFfFfSESSSSSGgGGGGSGGGGSH.",
    "fFffFffSEGGRBGGGGGGGGGGGGS..",
    "ffFffFfSESSSSSGGGGGGSGGGGSS.",
    "fffFfffSESSSSSGGGGGGSSGGSSS.",
    "ffffffFSSSsSSSSGGGGSSSSSSSSS",
    ".fffffSsSSSSSSSSSSSSSSSTSNS.",
    "..ffffsjSSSSSSSSSSSSSTTSS...",
    "...fffsjSSSSSSSSSSSSSmmmSS..",
    "....ffsjjSSSSSSSSSSSSOOSS...",
    "......ssjjSSSSSSSSSSSSSSS...",
    "........jjjSSSSSSSSSSSSS....",
    "...........jjjSSSSSSSSS.....",
    "..............jjjjjjj.......",
]

# 30 x 22 oversized jacket with a high standing collar, storm-flap line, logo patch and the
# grey backpack strap over the near shoulder.
TORSO = [
    "........DDDDDJJJJJJ...........",
    ".......DDDDDDJJJJJJJU.........",
    ".......DDDDDCCJJJJJJU.........",
    ".......DDDDDCCCJJJJJJU........",
    "......DDDDDDCCJJJJJJJJU.......",
    "....DDDDDAAADJJJJJJJJJJJJU....",
    "...DDDDDDAAaDJJJJJJZJJJJJJU...",
    "..DDDDDDDAAaDJJJJJJZJJJJJJJU..",
    "..DDDDDDDAAaDJJJJJJZJJJJJJJU..",
    "..DDDDDDDAAaDJJJJJJJZJJJJJJU..",
    "..DDDDDDDAAaDJJWWWJJZJJJJJJU..",
    "..DDDDDDDAAaDJJJJJJJZJJJJJJU..",
    "..DDDDDDDAAaDJJJJJJJJZJJJJJU..",
    "..DDDDDDDAAaDJJJJJJJJZJJJJJU..",
    "..DDDDDDDDAaDJJJJJJJJZJJJJJJU.",
    "..DDDDDDDDAaDJJJJJJJJJZJJJJJU.",
    "..DDDDDDDDDDDJJJJJJJJJZJJJJJU.",
    "..DDDDDDDDDDDJJJJJJJJJZJJJJJU.",
    "..DDDDDDDDDDDJJJJJJJJJJZJJJJU.",
    "..DDDDDDDDDDDJJJJJJJJJJZJJJJU.",
    "...DDDDDDDDDDJJJJJJJJJJZJJJJU.",
    "...DDDDDDDDDDDDDDDDDDDDDDDDDD.",
]

HEAD_AT = (15, 2)
TORSO_AT = (14, 23)
SHOULDER = (37, 30)
HIPS = {"back": (24, 43), "front": (31, 43)}
LEG_LEN = 19
UPPER_ARM, FOREARM = 8, 8

# Arm poses are hand positions; a two-bone solve places the elbow (bent down and out).
# Holding: bottle at the hip. Drinking: bottle up at the chin so the straw reaches the mouth.
HAND_HOLD = (46, 40.5)
HAND_DRINK = (44, 33)
MOUTH = (HEAD_AT[0] + 22, HEAD_AT[1] + 21)


def blank():
    return Image.new("RGBA", (FW, FH), (0, 0, 0, 0))


def grid_layer(rows, ox, oy):
    layer = blank()
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c != ".":
                layer.putpixel((ox + x, oy + y), PAL[c] + (255,))
    return layer


def outlined(layer):
    a = np.array(layer)
    solid = a[..., 3] > 0
    grown = solid.copy()
    grown[1:, :] |= solid[:-1, :]
    grown[:-1, :] |= solid[1:, :]
    grown[:, 1:] |= solid[:, :-1]
    grown[:, :-1] |= solid[:, 1:]
    a[grown & ~solid] = OUTLINE
    return Image.fromarray(a)


def rp(p):
    return (int(round(p[0])), int(round(p[1])))


def thick(d, p0, p1, width, color):
    p0, p1 = rp(p0), rp(p1)
    d.line([p0, p1], fill=color, width=width)
    r = (width - 1) / 2
    for x, y in (p0, p1):
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def polar(origin, length, deg):
    t = math.radians(deg)
    return (origin[0] + length * math.sin(t), origin[1] + length * math.cos(t))


def draw_backpack(dy):
    layer = blank()
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([9, 29 + dy, 17, 45 + dy], radius=3, fill=PACK)
    d.line([(10, 31 + dy), (10, 43 + dy)], fill=PACK_HI)
    d.rectangle([14, 30 + dy, 17, 45 + dy], fill=PACK_DARK)
    d.line([(10, 38 + dy), (15, 38 + dy)], fill=PACK_DARK)  # pocket seam
    return outlined(layer)


def draw_leg(hip, angle, lift, dark):
    layer = blank()
    d = ImageDraw.Draw(layer)
    ankle = polar(hip, LEG_LEN, angle)
    ankle = (ankle[0], ankle[1] - lift)
    knee = ((hip[0] + ankle[0]) / 2 + (1.5 if lift > 0.5 else 0), (hip[1] + ankle[1]) / 2)
    color = PANTS_DARK if dark else PANTS
    thick(d, hip, knee, 7, color)
    thick(d, knee, ankle, 6, color)
    if not dark:
        k, a = rp(knee), rp(ankle)
        d.line([(k[0] + 2, k[1]), (a[0] + 2, a[1] - 2)], fill=PANTS_HI)
    ax, ay = rp(ankle)
    shoe = SHOE_SHADE if dark else SHOE
    d.polygon([(ax - 3, ay), (ax + 3, ay), (ax + 6, ay + 2), (ax + 6, ay + 3), (ax - 3, ay + 3)], fill=shoe)
    d.line([(ax - 3, ay + 3), (ax + 6, ay + 3)], fill=SOLE)
    if not dark:
        d.point([(ax + 1, ay + 1), (ax + 3, ay + 1)], fill=SHOE_SHADE)  # laces
    return outlined(layer)


def solve_elbow(shoulder, hand):
    dx, dy = hand[0] - shoulder[0], hand[1] - shoulder[1]
    dist = min(math.hypot(dx, dy), UPPER_ARM + FOREARM - 0.01)
    a = (UPPER_ARM ** 2 - FOREARM ** 2 + dist ** 2) / (2 * dist)
    h = math.sqrt(max(0.0, UPPER_ARM ** 2 - a ** 2))
    ux, uy = dx / dist, dy / dist
    mx, my = shoulder[0] + a * ux, shoulder[1] + a * uy
    # of the two solutions, take the elbow that sits lower (bigger y)
    e1 = (mx - h * uy, my + h * ux)
    e2 = (mx + h * uy, my - h * ux)
    return e1 if e1[1] >= e2[1] else e2


def draw_arm(shoulder, hand):
    layer = blank()
    d = ImageDraw.Draw(layer)
    elbow = solve_elbow(shoulder, hand)
    fore_deg = math.degrees(math.atan2(hand[0] - elbow[0], hand[1] - elbow[1]))
    wrist = polar(elbow, FOREARM - 2.5, fore_deg)
    thick(d, shoulder, elbow, 7, SLEEVE)
    thick(d, elbow, wrist, 6, SLEEVE)
    # fold shading on the sleeve
    s, e, w = rp(shoulder), rp(elbow), rp(wrist)
    d.line([(s[0] - 1, s[1] + 1), (e[0] - 1, e[1])], fill=SLEEVE_DARK)
    d.line([(s[0] + 2, s[1] - 1), (e[0] + 2, e[1] - 1)], fill=SLEEVE_HI)
    thick(d, polar(elbow, FOREARM - 3, fore_deg), wrist, 6, CUFF)
    hx, hy = rp(hand)
    hand = (hx, hy)
    d.ellipse([hx - 2, hy - 2, hx + 1, hy + 2], fill=SKIN)
    d.point([(hx - 2, hy + 1), (hx - 1, hy + 2)], fill=SKIN_DARK)
    return outlined(layer), hand


def draw_bottle(hand, level, straw_to=None, bubbles=()):
    layer = blank()
    d = ImageDraw.Draw(layer)
    cx, cy = int(round(hand[0])) + 2, int(round(hand[1]))
    x0, y0, x1, y1 = cx - 3, cy - 6, cx + 2, cy + 6
    d.rectangle([x0, y0, x1, y1], fill=BOTTLE)
    water_top = y1 - int(round((y1 - y0 - 1) * level))
    d.rectangle([x0, water_top, x1, y1], fill=WATER)
    d.line([(x1, water_top), (x1, y1)], fill=WATER_DARK)
    d.line([(x0 + 1, y0 + 1), (x0 + 1, y1 - 1)], fill=BOTTLE_HI)
    for bx, by in bubbles:
        if water_top < cy + by < y1:
            d.point((cx + bx, cy + by), fill=BOTTLE_HI)
    d.rectangle([x0 + 1, y0 - 2, x1 - 1, y0 - 1], fill=CAP)
    # Straw: sticks up out of the cap; while sipping it runs up to mouth height, then
    # straight across into the mouth (straight runs stay crisp at pixel size).
    if straw_to:
        mx, my = rp(straw_to)
        d.line([(cx, y0 - 2), (cx, my)], fill=STRAW)
        d.line([(cx, my), (mx, my)], fill=STRAW)
    else:
        d.line([(cx, y0 - 2), (cx, y0 - 5)], fill=STRAW)
    return outlined(layer)


def frame(leg_phase=None, lift=0.0, level=1.0, sipping=False, bubbles=()):
    if leg_phase is None:
        front, back, lift_f, lift_b = 0.0, 0.0, 0.0, 0.0
    else:
        s, c = math.sin(leg_phase), math.cos(leg_phase)
        front, back = 24 * s, -24 * s
        lift_f, lift_b = 2.5 * max(0.0, c), 2.5 * max(0.0, -c)
    # Body sinks a pixel or two when the legs are spread, rises when they pass.
    dy = int(round(LEG_LEN * (1 - math.cos(math.radians(abs(front))))))
    swing = -1.5 * math.sin(leg_phase) if leg_phase is not None else 0  # hand swings opposite the front leg

    img = blank()
    img.alpha_composite(draw_backpack(dy))
    hb, hf = HIPS["back"], HIPS["front"]
    img.alpha_composite(draw_leg((hb[0], hb[1] + dy), back, lift_b, dark=True))
    img.alpha_composite(draw_leg((hf[0], hf[1] + dy), front, lift_f, dark=False))
    img.alpha_composite(outlined(grid_layer(TORSO, TORSO_AT[0], TORSO_AT[1] + dy)))
    img.alpha_composite(outlined(grid_layer(HEAD, HEAD_AT[0], HEAD_AT[1] + dy)))
    shoulder = (SHOULDER[0], SHOULDER[1] + dy)
    hand = (
        HAND_HOLD[0] + (HAND_DRINK[0] - HAND_HOLD[0]) * lift + swing,
        HAND_HOLD[1] + (HAND_DRINK[1] - HAND_HOLD[1]) * lift + dy,
    )
    arm_layer, hand = draw_arm(shoulder, hand)
    mouth = (MOUTH[0], MOUTH[1] + dy)
    img.alpha_composite(draw_bottle(hand, level, mouth if sipping else None, bubbles))
    img.alpha_composite(arm_layer)
    return img


def build():
    frames = [frame()]
    walk_frames = 8
    for i in range(walk_frames):
        frames.append(frame(leg_phase=2 * math.pi * i / walk_frames))
    # Drink: lift, sip through the straw (water level drops, bubbles rise), lower.
    drink = [
        (0.35, 1.0, False, ()),
        (0.7, 1.0, False, ()),
        (1.0, 1.0, True, ((0, 4),)),
        (1.0, 0.88, True, ((-1, 2), (1, 5))),
        (1.0, 0.76, True, ((0, 0), (-1, 4))),
        (1.0, 0.66, True, ((1, 2),)),
        (0.6, 0.66, False, ()),
        (0.25, 0.66, False, ()),
    ]
    for t, level, sipping, bubbles in drink:
        frames.append(frame(lift=t, level=level, sipping=sipping, bubbles=bubbles))

    sheet = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (i * FW, 0))
    ASSETS.mkdir(exist_ok=True)
    sheet.save(ASSETS / "character-sheet.png")
    frames[0].save(ASSETS / "character-sprite.png")
    meta = {
        "image": "assets/character-sheet.png",
        "frameWidth": FW,
        "frameHeight": FH,
        "idle": 0,
        "walkStart": 1,
        "walkFrames": walk_frames,
        "drinkStart": 1 + walk_frames,
        "drinkFrames": len(drink),
        "drinkMs": 2200,
        "total": len(frames),
    }
    (ASSETS / "character-sheet.json").write_text(json.dumps(meta, indent=2) + "\n")
    return sheet, meta


if __name__ == "__main__":
    sheet, meta = build()
    print(f"Wrote assets/character-sheet.png ({meta['total']} frames of {FW} x {FH}) and character-sprite.png")
