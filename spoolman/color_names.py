"""Nearest-neighbor color name lookup using CSS named colors + common filament shades."""

from __future__ import annotations

import math

# (name, (R, G, B))
_COLOR_TABLE: list[tuple[str, tuple[int, int, int]]] = [
    # Achromatic
    ("Black", (0, 0, 0)),
    ("White", (255, 255, 255)),
    ("Light Gray", (211, 211, 211)),
    ("Gray", (128, 128, 128)),
    ("Dark Gray", (64, 64, 64)),
    ("Silver", (192, 192, 192)),
    # Reds
    ("Red", (255, 0, 0)),
    ("Dark Red", (139, 0, 0)),
    ("Crimson", (220, 20, 60)),
    ("Firebrick", (178, 34, 34)),
    # Pinks
    ("Pink", (255, 192, 203)),
    ("Hot Pink", (255, 105, 180)),
    ("Deep Pink", (255, 20, 147)),
    ("Light Pink", (255, 182, 193)),
    # Oranges
    ("Orange", (255, 165, 0)),
    ("Dark Orange", (255, 140, 0)),
    ("Coral", (255, 127, 80)),
    ("Tomato", (255, 99, 71)),
    ("Orange Red", (255, 69, 0)),
    # Yellows
    ("Yellow", (255, 255, 0)),
    ("Gold", (255, 215, 0)),
    ("Amber", (255, 191, 0)),
    ("Dark Yellow", (204, 204, 0)),
    ("Khaki", (240, 230, 140)),
    ("Light Yellow", (255, 255, 224)),
    ("Lemon", (255, 247, 0)),
    # Greens
    ("Lime", (0, 255, 0)),
    ("Lime Green", (50, 205, 50)),
    ("Neon Green", (57, 255, 20)),
    ("Green", (0, 128, 0)),
    ("Dark Green", (0, 100, 0)),
    ("Forest Green", (34, 139, 34)),
    ("Olive", (128, 128, 0)),
    ("Olive Green", (107, 142, 35)),
    ("Yellow Green", (154, 205, 50)),
    ("Spring Green", (0, 255, 127)),
    ("Mint", (62, 180, 137)),
    ("Teal", (0, 128, 128)),
    # Cyans
    ("Cyan", (0, 255, 255)),
    ("Aqua", (0, 255, 255)),
    ("Dark Cyan", (0, 139, 139)),
    ("Turquoise", (64, 224, 208)),
    ("Sky Blue", (135, 206, 235)),
    ("Steel Blue", (70, 130, 180)),
    # Blues
    ("Blue", (0, 0, 255)),
    ("Dark Blue", (0, 0, 139)),
    ("Navy", (0, 0, 128)),
    ("Royal Blue", (65, 105, 225)),
    ("Cornflower Blue", (100, 149, 237)),
    ("Dodger Blue", (30, 144, 255)),
    ("Deep Sky Blue", (0, 191, 255)),
    ("Light Blue", (173, 216, 230)),
    ("Powder Blue", (176, 224, 230)),
    # Purples / Violets
    ("Purple", (128, 0, 128)),
    ("Dark Purple", (75, 0, 130)),
    ("Violet", (238, 130, 238)),
    ("Magenta", (255, 0, 255)),
    ("Fuchsia", (255, 0, 255)),
    ("Orchid", (218, 112, 214)),
    ("Medium Purple", (147, 112, 219)),
    ("Indigo", (75, 0, 130)),
    ("Lavender", (230, 230, 250)),
    ("Plum", (221, 160, 221)),
    # Browns
    ("Brown", (165, 42, 42)),
    ("Saddle Brown", (139, 69, 19)),
    ("Sienna", (160, 82, 45)),
    ("Chocolate", (210, 105, 30)),
    ("Peru", (205, 133, 63)),
    ("Tan", (210, 180, 140)),
    ("Beige", (245, 245, 220)),
    ("Wheat", (245, 222, 179)),
    ("Burlywood", (222, 184, 135)),
]


def _rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def list_color_names() -> list[str]:
    """Return all available color names, sorted alphabetically."""
    return sorted(name for name, _ in _COLOR_TABLE)


def color_map() -> dict[str, str]:
    """Return a dict mapping each color name to its hex code, sorted alphabetically by name."""
    return {name: f"{r:02X}{g:02X}{b:02X}" for name, (r, g, b) in sorted(_COLOR_TABLE, key=lambda x: x[0])}


def color_name_to_hex(name: str) -> str | None:
    """Return the hex code for a named color (case-insensitive). Returns None if not found."""
    needle = name.strip().lower()
    for color_name, (r, g, b) in _COLOR_TABLE:
        if color_name.lower() == needle:
            return f"{r:02X}{g:02X}{b:02X}"
    return None


def hex_to_color_name(hex_code: str | None) -> str | None:
    """Return the nearest human-readable color name for a hex color code.

    Returns None if hex_code is None or unparseable.
    """
    if not hex_code:
        return None
    try:
        h = hex_code.lstrip("#")[:6].upper()
        if len(h) < 6:
            return None
        rgb: tuple[int, int, int] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except (ValueError, IndexError):
        return None

    best_name, best_dist = _COLOR_TABLE[0][0], float("inf")
    for name, ref in _COLOR_TABLE:
        d = _rgb_distance(rgb, ref)
        if d < best_dist:
            best_dist = d
            best_name = name
    return best_name
