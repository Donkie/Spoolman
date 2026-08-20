"""Tests for the generated config.js, which interpolates the operator's base path into JS."""

import json

from spoolman.client import render_config_js


def value_of(rendered: str) -> str:
    """Parse back the JS string literal the renderer produced."""
    literal = rendered.split(" = ", 1)[1].strip().rstrip(";")
    return json.loads(literal)


def test_an_ordinary_base_path_round_trips():
    assert value_of(render_config_js("/spoolman")) == "/spoolman"


def test_an_empty_base_path_round_trips():
    assert value_of(render_config_js("")) == ""


def test_a_quote_cannot_close_the_literal():
    """The old hand-quoting caught this case, by refusing to serve at all."""
    assert value_of(render_config_js('/spool"man')) == '/spool"man'


def test_a_trailing_backslash_cannot_escape_the_closing_quote():
    """The case hand-quoting missed: the backslash would have escaped the terminating quote."""
    rendered = render_config_js("/spoolman\\")
    assert rendered.strip() == 'window.SPOOLMAN_BASE_PATH = "/spoolman\\\\";'
    assert value_of(rendered) == "/spoolman\\"


def test_a_backslash_quote_pair_cannot_inject_a_statement():
    assert value_of(render_config_js('/spoolman\\";alert(1);//')) == '/spoolman\\";alert(1);//'


def test_a_newline_cannot_break_out_of_the_statement():
    rendered = render_config_js("/spool\nman")
    assert "\n" not in rendered.split(" = ", 1)[1].strip()
    assert value_of(rendered) == "/spool\nman"
