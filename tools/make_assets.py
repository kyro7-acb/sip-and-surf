"""Generates the toolbar icons and the sip sound.

Run from the repo root:  python3 tools/make_assets.py
Needs Pillow and numpy (pip install pillow numpy). The characters come from tools/make_character.py.
"""
import math
import struct
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ICONS = ROOT / "icons"

def make_icons():
    ICONS.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        s = 8  # draw at 8x then downscale for smooth edges
        big = size * s
        img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=(54, 179, 240, 255))
        # Water drop
        cx, top, bottom = big / 2, big * 0.16, big * 0.84
        r = big * 0.24
        cy = bottom - r
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))
        d.polygon([(cx, top), (cx - r * 0.93, cy - r * 0.35), (cx + r * 0.93, cy - r * 0.35)], fill=(255, 255, 255, 255))
        # Wave inside the drop
        hr = r * 0.62
        d.ellipse([cx - hr, cy - hr * 0.2, cx + hr, cy + hr * 1.3], fill=(36, 140, 210, 255))
        img = img.resize((size, size), Image.LANCZOS)
        img.save(ICONS / f"icon{size}.png")


def make_sip_sound():
    rate = 44100
    rng = np.random.default_rng(7)
    out = np.zeros(int(rate * 0.9))

    def add(start, sig):
        i = int(start * rate)
        out[i:i + len(sig)] += sig[: len(out) - i]

    # Slurp: noise through a resonant band that sweeps upward.
    dur = 0.38
    n = int(rate * dur)
    noise = rng.standard_normal(n)
    t = np.arange(n) / rate
    f = 500 + 1400 * (t / dur) ** 1.5
    y = np.zeros(n)
    y1 = y2 = 0.0
    for i in range(n):
        w0 = 2 * math.pi * f[i] / rate
        rq = 0.97
        a1, a2 = -2 * rq * math.cos(w0), rq * rq
        yi = noise[i] * (1 - rq) - a1 * y1 - a2 * y2
        y[i] = yi
        y2, y1 = y1, yi
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    add(0.0, 5.0 * y * env)

    # Gulp: two quick bubbles, falling pitch.
    for start, f0, f1, amp in ((0.46, 520, 260, 0.55), (0.63, 440, 230, 0.4)):
        d = 0.11
        tt = np.arange(int(rate * d)) / rate
        freq = f0 + (f1 - f0) * (tt / d)
        phase = 2 * np.pi * np.cumsum(freq) / rate
        e = np.exp(-tt * 28) * (1 - np.exp(-tt * 900))
        add(start, amp * np.sin(phase) * e)

    out /= max(1e-9, np.max(np.abs(out)))
    out *= 0.8
    pcm = (out * 32767).astype(np.int16)
    ASSETS.mkdir(exist_ok=True)
    with wave.open(str(ASSETS / "sip.wav"), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm.tobytes())


if __name__ == "__main__":
    make_icons()
    make_sip_sound()
    print("Wrote assets/sip.wav and icons/*.png (the character comes from tools/make_character.py)")
