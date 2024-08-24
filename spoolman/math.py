"""Various math-related functions."""

# ruff: noqa: PLR2004

import math


def weight_from_length(*, length: float, diameter: float, density: float) -> float:
    """Calculate the weight of a piece of filament.

    Args:
        length (float): Filament length in mm
        diameter (float): Filament diameter in mm
        density (float): Density of filament material in g/cm3

    Returns:
        float: Weight in g

    """
    volume_mm3 = length * math.pi * (diameter / 2) ** 2
    volume_cm3 = volume_mm3 / 1000
    return density * volume_cm3


def length_from_weight(*, weight: float, diameter: float, density: float) -> float:
    """Calculate the length of a piece of filament.

    Args:
        weight (float): Filament weight in g
        diameter (float): Filament diameter in mm
        density (float): Density of filament material in g/cm3

    Returns:
        float: Length in mm

    """
    volume_cm3 = weight / density
    volume_mm3 = volume_cm3 * 1000
    return volume_mm3 / (math.pi * (diameter / 2) ** 2)


def rgb_to_lab(rgb: list[int]) -> list[float]:
    """Convert a RGB color to CIELAB.

    Input is of form [r, g, b] where r, g, and b are integers between 0 and 255.
    Output is of form [l, a, b] where l, a, and b are floats.
    """
    r, g, b = rgb[0] / 255, rgb[1] / 255, rgb[2] / 255

    r = (r / 12.92) if (r <= 0.04045) else math.pow((r + 0.055) / 1.055, 2.4)
    g = (g / 12.92) if (g <= 0.04045) else math.pow((g + 0.055) / 1.055, 2.4)
    b = (b / 12.92) if (b <= 0.04045) else math.pow((b + 0.055) / 1.055, 2.4)

    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

    x = math.pow(x, 1 / 3) if (x > 0.008856) else (7.787 * x) + 16 / 116
    y = math.pow(y, 1 / 3) if (y > 0.008856) else (7.787 * y) + 16 / 116
    z = math.pow(z, 1 / 3) if (z > 0.008856) else (7.787 * z) + 16 / 116

    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)]


def delta_e(lab_a: list[float], lab_b: list[float]) -> float:
    """Calculate the color difference between two CIELAB colors."""
    delta_l = lab_a[0] - lab_b[0]
    delta_a = lab_a[1] - lab_b[1]
    delta_b = lab_a[2] - lab_b[2]
    c1 = math.sqrt(lab_a[1] * lab_a[1] + lab_a[2] * lab_a[2])
    c2 = math.sqrt(lab_b[1] * lab_b[1] + lab_b[2] * lab_b[2])
    delta_c = c1 - c2
    delta_h = delta_a * delta_a + delta_b * delta_b - delta_c * delta_c
    delta_h = math.sqrt(delta_h) if delta_h > 0 else 0
    sc = 1.0 + 0.045 * c1
    sh = 1.0 + 0.015 * c1
    delta_l_kl_sl = delta_l / 1.0
    delta_c_kc_sc = delta_c / sc
    delta_h_kh_sh = delta_h / sh
    i = delta_l_kl_sl * delta_l_kl_sl + delta_c_kc_sc * delta_c_kc_sc + delta_h_kh_sh * delta_h_kh_sh
    return math.sqrt(i) if i > 0 else 0


def hex_to_rgb(hex_code: str) -> list[int]:
    """Convert a hex color code to RGB.

    Input is of form #RRGGBB where RR, GG, and BB are hexadecimal numbers.
    Output is of form [r, g, b] where r, g, and b are integers between 0 and 255.
    """
    hex_code = hex_code.lstrip("#")

    r = int(hex_code[0:2], 16)
    g = int(hex_code[2:4], 16)
    b = int(hex_code[4:6], 16)

    return [r, g, b]
