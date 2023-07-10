"""Various math-related functions."""

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
