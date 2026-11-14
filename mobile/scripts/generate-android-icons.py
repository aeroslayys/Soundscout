from pathlib import Path
from io import BytesIO
import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/brand/soundscout-logo.svg"
OUT = ROOT / "mobile/assets/images"
SIZE = 512
OUT.mkdir(parents=True, exist_ok=True)

rendered = cairosvg.svg2png(url=str(SOURCE), output_width=SIZE, output_height=SIZE)
logo = Image.open(BytesIO(rendered)).convert("RGBA")

# Keep the original artwork and colours, but crop it to a circular launcher mark.
circle = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(circle).ellipse((16, 16, SIZE - 16, SIZE - 16), fill=255)
launcher = logo.copy()
launcher.putalpha(circle)
launcher.save(OUT / "icon.png", optimize=True)

# Android adaptive foreground: inset the circular mark into the safe zone.
foreground = launcher.resize((432, 432), Image.Resampling.LANCZOS)
foreground_canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
foreground_canvas.alpha_composite(foreground, (40, 40))
foreground_canvas.save(OUT / "android-icon-foreground.png", optimize=True)

# Adaptive background is the brand's existing green accent.
Image.new("RGBA", (SIZE, SIZE), (22, 163, 74, 255)).save(
    OUT / "android-icon-background.png", optimize=True
)

# Monochrome Android themed icon: white silhouette of the dark logo mark.
rgb = Image.open(BytesIO(rendered)).convert("RGB")
pixels = rgb.load()
mono = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
mp = mono.load()
for y in range(SIZE):
    for x in range(SIZE):
        r, g, b = pixels[x, y]
        if max(r, g, b) < 90:
            mp[x, y] = (255, 255, 255, 255)
mono = mono.resize((432, 432), Image.Resampling.LANCZOS)
mono_canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
mono_canvas.alpha_composite(mono, (40, 40))
mono_canvas.save(OUT / "android-icon-monochrome.png", optimize=True)

# Regenerate icon assets from the canonical SVG source.
