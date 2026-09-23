#!/usr/bin/env python3
"""Copy the provided Android/iOS icon packs into native + Expo paths — no resizing."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "images"
IOS_MASTER = ASSETS / "iOS" / "AppIcon.appiconset" / "Icon-1024@1x.png"
ANDROID_SRC = ASSETS / "Android"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
ADAPTIVE_DIR = ANDROID_RES / "mipmap-anydpi-v26"
PLAY_STORE = ANDROID_SRC / "play_store_512.png"

DENSITIES = ("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi")


def copy_file(src: Path, dest: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def sync_expo_assets() -> None:
    copy_file(IOS_MASTER, ASSETS / "icon.png")
    copy_file(PLAY_STORE, ASSETS / "adaptive-icon.png")
    copy_file(PLAY_STORE, ASSETS / "logo.png")
    copy_file(
        ASSETS / "iOS" / "AppIcon.appiconset" / "Icon-60@2x.png",
        ASSETS / "favicon.png",
    )
    copy_file(PLAY_STORE, ASSETS / "splash-icon.png")


def sync_android_mipmaps() -> None:
    for folder in DENSITIES:
        src_dir = ANDROID_SRC / folder
        dest_dir = ANDROID_RES / folder
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            copy_file(src_dir / name, dest_dir / name)
            # Remove broken adaptive foreground layers from older syncs.
            fg = dest_dir / "ic_launcher_foreground.png"
            if fg.exists():
                fg.unlink()


def remove_adaptive_icon_xml() -> None:
    """Legacy launcher icons display as designed; adaptive split was cropping/doubling the logo."""
    if ADAPTIVE_DIR.exists():
        shutil.rmtree(ADAPTIVE_DIR)


def remove_stale_webp() -> None:
    for path in ANDROID_RES.glob("mipmap-*/*.webp"):
        path.unlink(missing_ok=True)


def main() -> None:
    sync_expo_assets()
    sync_android_mipmaps()
    remove_adaptive_icon_xml()
    remove_stale_webp()
    print("Copied original icon packs (no resize/crop).")
    print("- Android: exact mipmap-* from assets/images/Android")
    print("- Disabled mipmap-anydpi-v26 adaptive split")
    print("- Expo: icon.png (1024), adaptive-icon/logo (play_store_512)")


if __name__ == "__main__":
    main()
