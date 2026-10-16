#!/usr/bin/env python3
"""Rasterize the WeSignal vector symbol into Cordova Android density sizes."""
from pathlib import Path
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "resources" / "icon.svg"
targets = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
for density, size in targets.items():
    output = ROOT / "resources" / "android" / "icon" / f"drawable-{density}" / "icon.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(url=str(source), write_to=str(output), output_width=size, output_height=size)
master = ROOT / "resources" / "android" / "icon-512.png"
master.parent.mkdir(parents=True, exist_ok=True)
cairosvg.svg2png(url=str(source), write_to=str(master), output_width=512, output_height=512)
print(f"Generated {len(targets) + 1} WeSignal icon PNGs")
