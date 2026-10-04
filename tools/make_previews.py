"""Makes the README previews from the character sheets.

Run from the repo root after tools/make_character.py:  python3 tools/make_previews.py

Writes:
  docs/gojo-preview.gif       Gojo walks in, turns to you, sips, and after Sip cheers and walks on
  docs/spiderman-preview.gif  Spider-Man walks in and sips, then after Snooze gets angry and walks back
  docs/sheet-preview.png      every frame of both sheets, one row each
"""
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
Z = 2  # on-screen scale
STEPS = 8


def load(name):
    meta = json.loads((ROOT / f"assets/characters/{name}.json").read_text())
    sheet = Image.open(ROOT / meta["image"]).convert("RGBA")
    return meta, sheet


def preview(name, out_path, ending):
    meta, sheet = load(name)
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    anger = Image.open(ROOT / "assets/anger.png").convert("RGBA")
    anger = anger.resize((anger.width * Z, anger.height * Z), Image.NEAREST)

    def frame(i, flip=False):
        im = sheet.crop((i * fw, 0, (i + 1) * fw, fh)).resize((fw * Z, fh * Z), Image.NEAREST)
        return ImageOps.mirror(im) if flip else im

    stride = meta["stride"] * Z
    x0 = -fw * Z * 0.55
    stop = x0 + stride * STEPS
    width, height = int(stop + fw * Z * 2.2), fh * Z + 8
    frames, durations = [], []

    def add(i, x, ms, flip=False, mark=None, dy=0):
        canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))
        canvas.alpha_composite(frame(i, flip), (int(round(x)), 4 + dy))
        if mark:
            mx, my = meta["anger"][mark]
            if flip:
                mx = fw - mx
            canvas.alpha_composite(anger, (int(round(x + mx * Z - anger.width / 2)), int(4 + my * Z - anger.height / 2)))
        frames.append(canvas.convert("P", palette=Image.ADAPTIVE, colors=255))
        durations.append(ms)

    def walk(x_from, x_to, step_ms, flip=False, mark=None):
        n = int(abs(x_to - x_from) / stride * meta["walkFrames"] / 2)
        for k in range(n):
            add(meta["walkStart"] + k % meta["walkFrames"], x_from + (x_to - x_from) * k / n, step_ms, flip, mark)

    walk(x0, stop, 112)
    add(meta["idle"], stop, 250)
    add(meta["turnStart"], stop, 140)
    add(meta["frontIdle"], stop, 500)
    for k in range(meta["drinkFrames"]):
        add(meta["drinkStart"] + k, stop, meta["drinkMs"] // meta["drinkFrames"])
    add(meta["drinkStart"] + meta["drinkFrames"] - 1, stop, 900)
    if ending == "sip":
        add(meta["cheers"], stop, 200, dy=-8)
        add(meta["cheers"], stop, 900)
        add(meta["turnStart"], stop, 140)
        walk(stop, width + 10, 75)
    else:
        a = meta["angryStart"]
        for k, dx in enumerate([0, -2, 2, -2, 2, 0, 0, 0]):
            add(a + k % 2, stop + dx, 140, mark="front")
        add(meta["turnStart"], stop, 140, flip=True, mark="side")
        walk(stop, -fw * Z, 75, flip=True, mark="side")
    frames[0].save(out_path, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2,
                   optimize=True)
    return meta, sheet


def sheet_preview(names, out_path):
    rows = [load(name) for name in names]
    fw, fh = rows[0][0]["frameWidth"], rows[0][0]["frameHeight"]
    total = max(meta["total"] for meta, _ in rows)
    out = Image.new("RGBA", (fw * total * Z, fh * Z * len(rows)), (0, 0, 0, 0))
    for i, (meta, sheet) in enumerate(rows):
        out.alpha_composite(sheet.resize((fw * meta["total"] * Z, fh * Z), Image.NEAREST), (0, i * fh * Z))
    out.save(out_path, optimize=True)


if __name__ == "__main__":
    (ROOT / "docs").mkdir(exist_ok=True)
    preview("gojo", ROOT / "docs/gojo-preview.gif", "sip")
    preview("spiderman", ROOT / "docs/spiderman-preview.gif", "snooze")
    sheet_preview(["gojo", "spiderman"], ROOT / "docs/sheet-preview.png")
    print("Wrote docs/gojo-preview.gif, docs/spiderman-preview.gif and docs/sheet-preview.png")
