"""Tests for the generated config.js, which interpolates the operator's base path into JS."""

import json

import pytest

from spoolman import main


def render(monkeypatch: pytest.MonkeyPatch, base_path: str) -> str:
    """Render config.js for the given base path, through the real endpoint."""
    monkeypatch.setattr(main, "base_path", base_path)
    return main.get_configjs().body.decode()


def value_of(rendered: str) -> str:
    """Parse back the JS string literal the endpoint produced."""
    literal = rendered.split(" = ", 1)[1].strip().rstrip(";")
    return json.loads(literal)


def test_an_ordinary_base_path_round_trips(monkeypatch: pytest.MonkeyPatch):
    assert value_of(render(monkeypatch, "/spoolman")) == "/spoolman"


def test_an_empty_base_path_round_trips(monkeypatch: pytest.MonkeyPatch):
    assert value_of(render(monkeypatch, "")) == ""


def test_a_quote_cannot_close_the_literal(monkeypatch: pytest.MonkeyPatch):
    """The old hand-quoting caught this case, by refusing to serve at all."""
    assert value_of(render(monkeypatch, '/spool"man')) == '/spool"man'


def test_a_trailing_backslash_cannot_escape_the_closing_quote(monkeypatch: pytest.MonkeyPatch):
    """The case hand-quoting missed: the backslash would have escaped the terminating quote."""
    rendered = render(monkeypatch, "/spoolman\\")
    assert rendered.strip() == 'window.SPOOLMAN_BASE_PATH = "/spoolman\\\\";'
    assert value_of(rendered) == "/spoolman\\"


def test_a_backslash_quote_pair_cannot_inject_a_statement(monkeypatch: pytest.MonkeyPatch):
    assert value_of(render(monkeypatch, '/spoolman\\";alert(1);//')) == '/spoolman\\";alert(1);//'


def test_a_newline_cannot_break_out_of_the_statement(monkeypatch: pytest.MonkeyPatch):
    rendered = render(monkeypatch, "/spool\nman")
    assert "\n" not in rendered.split(" = ", 1)[1].strip()
    assert value_of(rendered) == "/spool\nman"
