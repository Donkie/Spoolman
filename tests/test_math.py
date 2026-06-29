"""Unit tests for the pure math helpers in spoolman.math."""

import math

import pytest

from spoolman.math import (
    delta_e,
    hex_to_rgb,
    length_from_weight,
    rgb_to_lab,
    weight_from_length,
)

# Common 1.75 mm PLA-ish parameters used across several tests.
DIAMETER_MM = 1.75
DENSITY_G_CM3 = 1.24


def test_weight_from_length_known_value():
    # volume = length * pi * (d/2)^2 = 1000 * pi * (0.875)^2 mm^3
    # = 1000 * pi * 0.765625 / 1000 cm^3 -> * density
    expected_volume_cm3 = (1000 * math.pi * (DIAMETER_MM / 2) ** 2) / 1000
    expected_weight = DENSITY_G_CM3 * expected_volume_cm3
    weight = weight_from_length(length=1000, diameter=DIAMETER_MM, density=DENSITY_G_CM3)
    assert weight == pytest.approx(expected_weight)


def test_length_from_weight_known_value():
    volume_cm3 = 100 / DENSITY_G_CM3
    volume_mm3 = volume_cm3 * 1000
    expected_length = volume_mm3 / (math.pi * (DIAMETER_MM / 2) ** 2)
    length = length_from_weight(weight=100, diameter=DIAMETER_MM, density=DENSITY_G_CM3)
    assert length == pytest.approx(expected_length)


def test_weight_length_roundtrip():
    original_length = 12345.6
    weight = weight_from_length(length=original_length, diameter=DIAMETER_MM, density=DENSITY_G_CM3)
    length = length_from_weight(weight=weight, diameter=DIAMETER_MM, density=DENSITY_G_CM3)
    assert length == pytest.approx(original_length)


def test_length_weight_roundtrip():
    original_weight = 998.7
    length = length_from_weight(weight=original_weight, diameter=DIAMETER_MM, density=DENSITY_G_CM3)
    weight = weight_from_length(length=length, diameter=DIAMETER_MM, density=DENSITY_G_CM3)
    assert weight == pytest.approx(original_weight)


def test_weight_from_zero_length_is_zero():
    # Edge case: zero length yields zero weight.
    assert weight_from_length(length=0, diameter=DIAMETER_MM, density=DENSITY_G_CM3) == pytest.approx(0)


def test_length_from_zero_weight_is_zero():
    # Edge case: zero weight yields zero length.
    assert length_from_weight(weight=0, diameter=DIAMETER_MM, density=DENSITY_G_CM3) == pytest.approx(0)


def test_hex_to_rgb_basic():
    assert hex_to_rgb("#FF0000") == [255, 0, 0]
    assert hex_to_rgb("00FF00") == [0, 255, 0]  # Works without leading '#'
    assert hex_to_rgb("#0000ff") == [0, 0, 255]


def test_rgb_to_lab_black_and_white():
    # Black maps to L ~= 0; white maps to L ~= 100.
    lab_black = rgb_to_lab([0, 0, 0])
    lab_white = rgb_to_lab([255, 255, 255])
    assert lab_black[0] == pytest.approx(0, abs=1e-6)
    assert lab_white[0] == pytest.approx(100, abs=1e-6)


def test_delta_e_identical_colors_is_zero():
    lab = rgb_to_lab([123, 45, 67])
    assert delta_e(lab, lab) == pytest.approx(0, abs=1e-9)


def test_delta_e_distinct_colors_is_positive():
    lab_a = rgb_to_lab([0, 0, 0])
    lab_b = rgb_to_lab([255, 255, 255])
    assert delta_e(lab_a, lab_b) > 0
