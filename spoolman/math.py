"""Various math-related functions."""

import math


def weight_from_length(*, length: float, radius: float, density: float) -> float:
    """Calculate the weight of a piece of filament.

    Args:
        length (float): Filament length in mm
        radius (float): Filament radius in mm
        density (float): Density of filament material in g/cm3

    Returns:
        float: Weight in g
    """
    volume_mm3 = length * math.pi * radius * radius
    volume_cm3 = volume_mm3 / 1000
    return density * volume_cm3
