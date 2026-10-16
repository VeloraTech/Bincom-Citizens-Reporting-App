#!/usr/bin/env python3
"""Generate WeSignal's Cordova Android icons from the supplied original artwork.

Requires Pillow (python3 -m pip install Pillow). The source is retained unchanged;
only blank white margins are trimmed and the unmodified artwork is resampled onto
white legacy canvases and transparent adaptive foreground canvases.
"""
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources" / "icon-original.png"
ANDROID = ROOT / "resources" / "android"
LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
ADAPTIVE_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def artwork_from(source: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    white = Image.new("RGB", rgb.size, "white")
    bounds = ImageChops.difference(rgb, white).getbbox()
    if not bounds:
        raise ValueError("The original icon image contains no visible artwork")
    # Crop only blank canvas around the artwork; do not cut any non-white pixels.
    return rgb.crop(bounds).convert("RGBA")


def centered_artwork(art: Image.Image, size: int, coverage: float) -> Image.Image:
    max_side = max(1, round(size * coverage))
    scale = max_side / max(art.size)
    dims = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
    return art.resize(dims, Image.Resampling.LANCZOS)


def place(art: Image.Image, size: int, coverage: float, background):
    canvas = Image.new("RGBA", (size, size), background)
    rendered = centered_artwork(art, size, coverage)
    canvas.alpha_composite(rendered, ((size - rendered.width) // 2, (size - rendered.height) // 2))
    return canvas


if not SOURCE.exists():
    raise SystemExit(f"Missing original icon source: {SOURCE}")
original = Image.open(SOURCE)
artwork = artwork_from(original)

# Cordova's legacy square launcher images for Android versions before adaptive icons.
master = place(artwork, 512, 0.66, (255, 255, 255, 255)).convert("RGB")
master.save(ANDROID / "icon-512.png", format="PNG", optimize=True)
for density, size in LEGACY_SIZES.items():
    out = ANDROID / "icon" / f"drawable-{density}" / "icon.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    place(artwork, size, 0.66, (255, 255, 255, 255)).convert("RGB").save(out, format="PNG", optimize=True)

# Android 8+ adaptive icon layers: the supplied mark is the foreground; white is
# kept as a separate background, leaving the artwork centered within the safe zone.
for density, size in ADAPTIVE_SIZES.items():
    out_dir = ANDROID / "adaptive" / density
    out_dir.mkdir(parents=True, exist_ok=True)
    place(artwork, size, 0.64, (0, 0, 0, 0)).save(out_dir / "foreground.png", format="PNG", optimize=True)
    Image.new("RGB", (size, size), "white").save(out_dir / "background.png", format="PNG", optimize=True)

print(f"Generated legacy and adaptive launcher assets from {SOURCE.name}; source artwork preserved.")
