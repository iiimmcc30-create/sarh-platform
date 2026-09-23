#!/usr/bin/env python3
"""Generate circular logo + launcher assets aligned with the SAFAT brand."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "images"
ANDROID_SRC = ASSETS / "Android"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
# Official circular SAFAT emblem (green · white · black).
MASTER_SOURCE = ASSETS / "ايقونه.png"

BRAND_BG = (255, 255, 255, 255)  # #FFFFFF — matches splash + app background
LAUNCHER_EMBLEM_SCALE = 1.0
ADAPTIVE_EMBLEM_SCALE = 0.98
CIRCLE_INSET = 0.012
# Android 12+ masks the splash icon to a circle; artwork must fit the inner 2/3 diameter.
ANDROID_SPLASH_SAFE_SCALE = 2 / 3
SPLASH_WIDTH_DP = 280
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
SPLASH_DENSITIES = {
    "drawable-mdpi": int(SPLASH_WIDTH_DP * 1),
    "drawable-hdpi": int(SPLASH_WIDTH_DP * 1.5),
    "drawable-xhdpi": int(SPLASH_WIDTH_DP * 2),
    "drawable-xxhdpi": int(SPLASH_WIDTH_DP * 3),
    "drawable-xxxhdpi": int(SPLASH_WIDTH_DP * 4),
}


def center_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def apply_circle_mask(img: Image.Image, inset_ratio: float = CIRCLE_INSET) -> Image.Image:
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    inset = int(size * inset_ratio)
    draw.ellipse((inset, inset, size - inset - 1, size - inset - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def emblem_from_master(size: int) -> Image.Image:
    base = Image.open(MASTER_SOURCE).convert("RGBA")
    square = center_square(base).resize((size, size), Image.Resampling.LANCZOS)
    return apply_circle_mask(square)


def icon_on_brand_background(emblem: Image.Image, canvas_size: int, scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), BRAND_BG)
    emblem_size = int(canvas_size * scale)
    resized = emblem.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    offset = (canvas_size - emblem_size) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def splash_logo(size: int) -> Image.Image:
    """Circular emblem only — splash screen backgroundColor provides the canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    emblem_size = max(1, int(size * ANDROID_SPLASH_SAFE_SCALE))
    emblem = emblem_from_master(emblem_size)
    offset = (size - emblem_size) // 2
    canvas.paste(emblem, (offset, offset), emblem)
    return canvas


def adaptive_foreground(canvas_size: int = 1024) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    emblem_size = int(canvas_size * ADAPTIVE_EMBLEM_SCALE)
    emblem = emblem_from_master(emblem_size)
    offset = (canvas_size - emblem_size) // 2
    canvas.paste(emblem, (offset, offset), emblem)
    return canvas


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def main() -> None:
    if not MASTER_SOURCE.exists():
        raise FileNotFoundError(MASTER_SOURCE)

    emblem_512 = emblem_from_master(512)
    emblem_1024 = emblem_from_master(1024)

    save_png(emblem_512, ASSETS / "logo-circle.png")
    save_png(emblem_512, ASSETS / "logo.png")
    save_png(adaptive_foreground(1024), ASSETS / "adaptive-icon.png")
    save_png(splash_logo(512), ASSETS / "splash-icon.png")
    save_png(splash_logo(1024), ASSETS / "splash-circle.png")
    save_png(
        icon_on_brand_background(emblem_512, 512, LAUNCHER_EMBLEM_SCALE),
        ANDROID_SRC / "play_store_512.png",
    )
    save_png(
        icon_on_brand_background(emblem_1024, 1024, LAUNCHER_EMBLEM_SCALE),
        ASSETS / "icon.png",
    )
    save_png(
        emblem_512.resize((120, 120), Image.Resampling.LANCZOS),
        ASSETS / "favicon.png",
    )

    for folder, size in DENSITIES.items():
        emblem = emblem_from_master(size)
        icon = icon_on_brand_background(emblem, size, LAUNCHER_EMBLEM_SCALE)
        src_dir = ANDROID_SRC / folder
        res_dir = ANDROID_RES / folder
        for target_dir in (src_dir, res_dir):
            save_png(icon, target_dir / "ic_launcher.png")
            save_png(icon, target_dir / "ic_launcher_round.png")

    for folder, size in SPLASH_DENSITIES.items():
        save_png(splash_logo(size), ANDROID_RES / folder / "splashscreen_logo.png")

    print("Generated circular SAFAT branding assets.")
    print(f"- Launcher emblem scale: {LAUNCHER_EMBLEM_SCALE:.0%}")


if __name__ == "__main__":
    main()
