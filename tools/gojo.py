"""Gojo: white spiky hair pushed up by a black blindfold, pale skin, a cocky smirk, the dark
navy high-collar uniform with its gold button, black shoes. The body, poses and bottle come from
tools/make_character.py; this file sets the palette and the head pixels.

Built by tools/make_character.py (python3 tools/make_character.py), which calls use_gojo().
"""
import make_character as mc
from make_character import R, line, px, runs

SKIN = {"hi": (255, 236, 222), "lt": (250, 222, 204), "base": (240, 206, 184), "sh": (218, 178, 156),
        "dk": (184, 142, 122), "ol": (110, 76, 66)}
HAIR = {"hi": (255, 255, 255), "lt": (246, 248, 253), "base": (224, 230, 242), "dk": (180, 190, 212),
        "ol": (92, 100, 126)}
NAVY = {"hi": (82, 88, 118), "lt": (58, 62, 88), "base": (40, 43, 63), "sh": (30, 32, 48),
        "dk": (21, 22, 35), "ol": (8, 8, 15)}
SHOE = {"hi": (96, 96, 108), "base": (44, 44, 52), "sh": (32, 32, 38), "sole": (70, 70, 80),
        "dk": (24, 24, 28), "ol": (8, 8, 12)}
LIPS = {"up": (196, 130, 118), "low": (214, 150, 136), "line": (148, 90, 82), "hi": (232, 172, 158)}
EXTRA = {
    "X": (24, 24, 32),  # blindfold
    "x": (62, 64, 82),  # light catching its folds
    "Y": (220, 176, 74),  # gold swirl button on the collar
    "y": (150, 108, 40),
}


# ---------------------------------------------------------------------------------------
# Facing you. The face is the shared oval; the blindfold sits over the eyes, rows 15 to 19.

FRONT_HAIR_SHAPE = [
    (21.4, 16.6), (19.4, 13.4), (16.6, 12.0), (19.8, 10.4), (16.4, 6.0), (21.6, 7.0), (21.0, 2.4),
    (25.6, 4.6), (27.6, 0.6), (30.6, 3.6), (33.4, 0.4), (35.6, 3.8), (39.8, 1.4), (40.6, 5.6),
    (46.2, 4.8), (43.4, 9.0), (47.0, 11.4), (43.4, 13.0), (42.6, 16.6), (41.0, 14.8), (22.6, 14.8)]
FRONT_HAIR = runs(mc.poly(FRONT_HAIR_SHAPE), "h")

FRONT_HAIR_DETAIL = (
    # the underside of the mop in shadow, the top lit from the upper left
    [R(13, 21, 42, "d"), R(14, 21, 42, "d"), R(12, 20, 23, "d"), R(12, 37, 44, "d"), R(11, 40, 44, "d"),
     R(10, 41, 43, "d")] + line([(21, 15), (21, 16)], "d") + line([(42, 15), (42, 16)], "d")
    # a crease between each pair of spikes
    + line([(25, 11), (22, 6)], "d") + line([(29, 10), (28, 4)], "d") + line([(33, 10), (33, 4)], "d")
    + line([(37, 10), (39, 5)], "d") + line([(40, 11), (43, 7)], "d") + line([(22, 12), (19, 10)], "d")
    + line([(26, 9), (24, 5)], "l") + line([(30, 8), (29, 3)], "l") + line([(34, 8), (35, 3)], "l")
    + px([(28, 2), (29, 3), (33, 2), (24, 5), (25, 6), (34, 3)], "H")
)

BAND_FRONT = (
    [R(15, 22, 41, "X"), R(16, 21, 42, "X"), R(17, 21, 42, "X"), R(18, 21, 42, "X"), R(19, 22, 41, "X")]
    + line([(23, 16), (28, 16)], "x") + line([(34, 16), (39, 16)], "x") + px([(30, 17), (31, 17)], "x")
    # one lock falls over the top of it
    + px([(33, 15), (34, 15), (34, 16)], "d")
)

FRONT_FACE = BAND_FRONT + [
    # ears under the band
    R(20, 22, 22, "S"), R(21, 23, 23, "s"), R(20, 41, 41, "s"), R(21, 40, 40, "k"),
    # light from the upper left: shade down the right side of the face, none on the chin
    R(20, 38, 39, "s"), R(21, 37, 39, "s"), R(22, 37, 38, "s"), R(23, 37, 38, "s"), R(24, 37, 39, "s"),
    R(25, 36, 38, "s"), R(26, 36, 38, "s"), R(27, 35, 37, "s"), R(28, 34, 36, "s"),
    R(20, 25, 28, "L"), R(21, 25, 28, "L"), R(22, 25, 27, "L"),
    R(20, 24, 39, "s"),  # soft shadow right under the band
    # a small straight nose
    R(20, 31, 31, "L"), R(21, 31, 31, "T"), R(21, 32, 32, "s"), R(22, 31, 31, "L"), R(22, 32, 32, "s"),
    R(23, 30, 30, "s"), R(23, 31, 32, "k"), R(23, 33, 33, "s"),
    R(28, 31, 32, "L"),  # chin
]

MOUTHS = {
    # his usual cocky smirk, one corner up
    "cool": [R(25, 30, 33, "M"), R(24, 34, 34, "M"), R(26, 30, 32, "W"), R(27, 30, 32, "s")],
    "sip": [R(25, 30, 30, "U"), R(25, 32, 33, "U"), R(25, 29, 29, "k"), R(25, 34, 34, "k"),
            R(26, 30, 30, "W"), R(26, 32, 32, "W"), R(27, 30, 33, "s")],
    "smile": [R(24, 29, 29, "M"), R(24, 34, 34, "M"), R(25, 30, 33, "M"), R(26, 30, 33, "V"),
              R(27, 30, 33, "W"), R(25, 29, 29, "M"), R(25, 34, 34, "M")],
    "frown": [R(25, 30, 33, "M"), R(26, 29, 29, "M"), R(26, 34, 34, "M"), R(26, 30, 33, "W"), R(27, 30, 33, "s")],
    "growl": [R(25, 29, 34, "M"), R(26, 29, 29, "M"), R(26, 30, 33, "V"), R(26, 34, 34, "M"), R(27, 30, 33, "M")],
}
GLINT = px([(25, 16), (26, 16), (36, 16), (37, 16)], "x")
# angry: the band dips in the middle where his brows pull down under it, and a crease shows
ANGRY_FACE = px([(30, 19), (31, 19), (32, 19), (31, 20), (32, 20)], "X") + px([(29, 20), (34, 20)], "k")


# ---------------------------------------------------------------------------------------
# Side view, facing right: the hair sweeps up and back in spikes.

SIDE_HAIR_SHAPE = [
    (20.6, 21.0), (17.6, 19.2), (12.8, 18.6), (16.4, 15.4), (11.6, 12.4), (16.8, 11.2), (13.2, 6.2),
    (19.4, 7.0), (18.8, 1.8), (24.2, 4.2), (26.4, 0.4), (29.6, 3.4), (33.4, 0.8), (34.6, 4.4),
    (39.6, 3.0), (39.4, 7.4), (43.6, 7.8), (40.6, 11.0), (41.8, 13.6), (39.4, 14.6),
    (26.0, 14.6), (25.4, 19.0), (24.6, 21.6), (22.6, 22.6)]
SIDE_HAIR = runs(mc.poly(SIDE_HAIR_SHAPE), "h")

SIDE_DETAIL = (
    [R(13, 18, 41, "d"), R(14, 16, 40, "d"), R(20, 18, 24, "d"), R(21, 19, 24, "d"), R(12, 14, 19, "d")]
    + line([(21, 15), (15, 13)], "d") + line([(22, 11), (16, 8)], "d") + line([(26, 10), (22, 4)], "d")
    + line([(30, 9), (28, 3)], "d") + line([(34, 10), (34, 3)], "d") + line([(37, 11), (40, 6)], "d")
    + line([(24, 11), (19, 7)], "l") + line([(28, 9), (25, 4)], "l") + line([(32, 8), (31, 3)], "l")
    + px([(29, 4), (33, 3), (24, 6), (25, 5)], "H")
    + [
        # the band wraps from the face round to the back of the head
        R(15, 26, 40, "X"), R(16, 19, 40, "X"), R(17, 18, 39, "X"), R(18, 18, 38, "X"), R(19, 19, 38, "X"),
        R(16, 30, 36, "x"), R(17, 22, 26, "x"),
        # ear below it
        R(20, 26, 27, "s"), R(21, 26, 26, "k"), R(21, 27, 27, "s"), R(22, 26, 27, "k"), R(23, 26, 26, "k"),
        R(20, 25, 25, "S"), R(21, 25, 25, "S"),
        # cheekbone and nose catch the light, and the jaw has a lit edge
        R(20, 33, 36, "L"), R(21, 33, 36, "L"), R(22, 34, 35, "L"), R(20, 39, 39, "L"), R(21, 39, 40, "L"),
        R(20, 30, 38, "s"),
        R(23, 38, 38, "k"), R(22, 39, 40, "s"), R(23, 39, 39, "s"), R(23, 37, 37, "s"),
        R(24, 28, 28, "L"), R(25, 28, 28, "L"), R(26, 28, 28, "L"), R(27, 28, 28, "L"), R(28, 28, 30, "T"),
        R(29, 31, 35, "T"),
        # smirk
        R(25, 36, 38, "M"), R(24, 38, 38, "M"), R(26, 36, 37, "W"), R(27, 36, 36, "s"),
    ]
)


# ---------------------------------------------------------------------------------------
# Three-quarter view, half-way through the turn.

TURN_HAIR_SHAPE = [
    (20.4, 22.6), (18.0, 17.6), (14.8, 16.6), (17.8, 13.8), (14.6, 9.6), (19.6, 9.4), (18.4, 4.0),
    (23.8, 5.2), (25.4, 0.8), (29.0, 3.6), (32.2, 0.4), (34.6, 3.8), (38.8, 1.6), (39.6, 6.0),
    (44.8, 5.6), (42.2, 9.4), (45.4, 12.2), (41.8, 13.2), (41.6, 16.6), (40.0, 14.8), (26.0, 14.8),
    (23.4, 16.4), (22.8, 20.4)]
TURN_HAIR = runs(mc.poly(TURN_HAIR_SHAPE), "h")

TURN_DETAIL = (
    [R(13, 19, 42, "d"), R(14, 18, 41, "d"), R(12, 37, 44, "d"), R(11, 40, 44, "d"), R(12, 16, 21, "d")]
    + line([(22, 17), (19, 16)], "d") + line([(24, 11), (19, 8)], "d") + line([(28, 10), (26, 4)], "d")
    + line([(32, 10), (32, 3)], "d") + line([(36, 10), (38, 5)], "d") + line([(40, 11), (43, 7)], "d")
    + line([(26, 9), (23, 6)], "l") + line([(30, 8), (28, 3)], "l") + line([(34, 8), (35, 3)], "l")
    + px([(27, 3), (32, 2), (23, 6), (28, 4)], "H")
    + [
        R(15, 25, 40, "X"), R(16, 22, 41, "X"), R(17, 22, 41, "X"), R(18, 22, 41, "X"), R(19, 23, 40, "X"),
        R(16, 27, 32, "x"), R(16, 36, 39, "x"),
        R(15, 36, 37, "d"), R(16, 37, 37, "d"),  # a lock falling over the band
        # ear (his right) under the band
        R(20, 24, 24, "S"), R(20, 25, 25, "k"), R(21, 25, 25, "s"),
        # far cheek in shade, near cheek lit
        R(20, 39, 40, "s"), R(21, 39, 40, "s"), R(22, 38, 40, "s"), R(23, 37, 39, "s"), R(24, 37, 38, "s"),
        R(25, 37, 38, "s"), R(26, 36, 37, "s"), R(27, 36, 37, "s"), R(28, 35, 36, "s"),
        R(20, 27, 31, "L"), R(21, 28, 31, "L"), R(22, 28, 30, "L"), R(20, 25, 38, "s"),
        # nose, pointing right
        R(20, 36, 36, "L"), R(21, 36, 37, "T"), R(21, 38, 38, "S"), R(22, 36, 36, "L"), R(22, 37, 38, "s"),
        R(23, 37, 37, "k"), R(23, 35, 36, "s"), R(23, 38, 38, "s"),
        # smirk and chin
        R(25, 33, 36, "M"), R(24, 37, 37, "M"), R(26, 34, 35, "W"), R(27, 34, 36, "s"), R(28, 33, 34, "L"),
    ]
)


def collar_button():
    """Gold swirl button on the high collar, facing you and in the turn."""
    return px([(29, 31), (30, 31), (29, 32), (30, 32)], "Y") + px([(30, 32)], "y")


def use_gojo():
    mc.use(
        extra_letters=EXTRA,
        SKIN=SKIN, HAIR=HAIR, JACKET=NAVY, PANTS=NAVY, SHOE=SHOE, LIPS=LIPS,
        SIDE_HAIR=SIDE_HAIR, SIDE_DETAIL=SIDE_DETAIL,
        FRONT_HAIR=FRONT_HAIR, FRONT_HAIR_DETAIL=FRONT_HAIR_DETAIL, FRONT_FACE=FRONT_FACE + collar_button(),
        MOUTHS=MOUTHS, GLINT=GLINT, ANGRY_FACE=ANGRY_FACE,
        ANGER_AT={"front": [44, 4], "side": [38, 3]},
        TURN_HAIR=TURN_HAIR, TURN_DETAIL=TURN_DETAIL,
    )
