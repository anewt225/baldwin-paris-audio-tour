"""Render the app icons (gold italic serif "B" on the tour's dark ground).

    uv run scripts/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
BG, GOLD, RING = (20, 17, 15), (212, 162, 76), (58, 50, 43)
FONTS = ["C:/Windows/Fonts/georgiai.ttf", "/Library/Fonts/Georgia Italic.ttf", "DejaVuSerif-Italic.ttf"]


def font(size: int) -> ImageFont.FreeTypeFont:
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def icon(size: int, glyph_scale: float, rounded: bool) -> Image.Image:
    s = size * 4  # supersample, then downscale for smooth edges
    img = Image.new("RGB", (s, s), BG) if not rounded else Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=s * 0.22, fill=BG)
    d.ellipse((s * 0.14, s * 0.14, s * 0.86, s * 0.86), outline=RING, width=max(4, s // 90))
    d.text((s * 0.5, s * 0.52), "B", font=font(int(s * glyph_scale)), fill=GOLD, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
icon(192, 0.56, True).save(OUT / "icon-192.png")
icon(512, 0.56, True).save(OUT / "icon-512.png")
icon(512, 0.44, False).save(OUT / "icon-maskable-512.png")  # full-bleed, glyph inside safe zone
icon(180, 0.56, False).save(OUT / "apple-touch-icon.png")  # iOS rounds corners itself
print("icons written to", OUT)
