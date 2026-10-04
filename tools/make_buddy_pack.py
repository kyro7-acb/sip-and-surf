"""Packs a custom buddy into a .buddy.json file, for "Make me a buddy" orders.

Run from the repo root (needs Pillow and numpy). Two ways to make one:

  python3 tools/make_buddy_pack.py customers/jane/jane.py --name "Jane"
      Draws a character file with the shared body, poses and bottle (tools/make_character.py)
      and packs the full sheet: walking, turning to you, sipping, cheers and the angry frames.
      A character file works like tools/gojo.py: copy it, change the palette and head pixels,
      and keep one use_...() function that calls make_character.use(...).

  python3 tools/make_buddy_pack.py --image customers/jane/jane.png --name "Jane"
      Packs one picture of the buddy standing, facing right, holding a bottle, on a transparent
      background. The extension animates it itself (lib/sprite.js). Quicker, simpler look.

Options:
  --line "Short description"   shown under the name in the buddy picker
  --out path.buddy.json        where to write it (default: next to the input)

Email the .buddy.json to the buyer. They add it from the popup (Add a buddy file).
Keep customers' photos and files out of the repo: the customers/ folder is in .gitignore.
"""
import argparse
import base64
import importlib.util
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

TOOLS = Path(__file__).resolve().parent
FORMAT = "sip-and-surf-buddy"
MAX_BYTES = 2 * 1024 * 1024


def png_data_url(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    if len(data) > MAX_BYTES:
        sys.exit(f"The picture is {len(data) // 1024} KB; buddy pictures must be under {MAX_BYTES // 1024} KB.")
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def from_character(path, name):
    sys.path.insert(0, str(TOOLS))
    sys.path.insert(0, str(path.parent))
    import make_character as mc

    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    setups = [v for k, v in vars(module).items() if k.startswith("use_") and callable(v)]
    if len(setups) != 1:
        sys.exit(f"{path} should have exactly one use_...() function, like tools/gojo.py has use_gojo().")
    setups[0]()
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "buddy"
    _, sheet, meta = mc.draw(slug)
    mc.use()
    meta.pop("image")
    return png_data_url(sheet), meta


def from_image(path):
    im = Image.open(path).convert("RGBA")
    if not (8 <= im.width <= 1024 and 8 <= im.height <= 1024):
        sys.exit("The picture should be between 8 and 1024 pixels on each side.")
    box = im.getbbox()
    if box:  # trim empty space, but keep the feet on the bottom edge
        im = im.crop((box[0], box[1], box[2], box[3]))
    return png_data_url(im), None


def main():
    ap = argparse.ArgumentParser(description="Pack a custom buddy into a .buddy.json file.")
    ap.add_argument("character", nargs="?", help="a character file like tools/gojo.py")
    ap.add_argument("--image", help="one picture of the buddy, facing right, instead of a character file")
    ap.add_argument("--name", required=True, help="the buddy's name, up to 24 characters")
    ap.add_argument("--line", default="", help="a short description, up to 80 characters")
    ap.add_argument("--out", help="where to write the .buddy.json")
    args = ap.parse_args()
    if bool(args.character) == bool(args.image):
        ap.error("give either a character file or --image, not both")
    name = args.name.strip()[:24]
    source = Path(args.character or args.image).resolve()
    image, sheet = from_character(source, name) if args.character else from_image(source)
    pack = {"format": FORMAT, "version": 1, "name": name, "line": args.line.strip()[:80] or "Your very own buddy.",
            "image": image}
    if sheet:
        pack["sheet"] = sheet
    out = Path(args.out) if args.out else source.with_name(f"{source.stem}.buddy.json")
    out.write_text(json.dumps(pack))
    kind = f"full sheet, {sheet['total']} frames" if sheet else "one picture"
    print(f"Wrote {out} ({kind}, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
