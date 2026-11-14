from pathlib import Path
from io import BytesIO
import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/brand/soundscout-logo.svg"
OUT = ROOT / "mobile/assets/images"
SIZE = 512
OUT.mkdir(parents=True, exist_ok=True)

rendered = cairosvg.svg2png(url=str(SOURCE), output_width=SIZE, output_height=SIZE)
logo = Image.open(BytesIO(rendered)).convert("RGBA")

# Keep the original square artwork completely unchanged for the main launcher icon.
logo.save(OUT / "icon.png", optimize=True)

# Android adaptive foreground: inset the original square artwork into Android's safe zone.
foreground = logo.resize((432, 432), Image.Resampling.LANCZOS)
foreground_canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
foreground_canvas.alpha_composite(foreground, (40, 40))
foreground_canvas.save(OUT / "android-icon-foreground.png", optimize=True)

# Adaptive background is the brand's existing green accent.
Image.new("RGBA", (SIZE, SIZE), (22, 163, 74, 255)).save(
    OUT / "android-icon-background.png", optimize=True
)

# Monochrome Android themed icon: preserve the original logo silhouette for themed-icon support.
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

# Source logo is present on this branch; regenerate the native icon assets.

# Keep generated launcher assets in sync with the original square brand artwork.
