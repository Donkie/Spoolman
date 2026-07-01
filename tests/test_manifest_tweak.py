"""Unit tests for the PWA manifest base-path rewrite (TESTING_CANDIDATES rows 94, 96).

Oracle: the documented contract — start_url/scope become "/" at the root or
"/<base>/" under a sub-path; all other fields pass through untouched; and the
output is always valid, properly-escaped JSON even for a hostile base path. Pure
function, no file I/O.
"""

import json

from spoolman.client import tweak_manifest

BASE_MANIFEST = {
    "name": "Spoolman",
    "start_url": "/",
    "scope": "/",
    "icons": [{"src": "pwa-64x64.png", "sizes": "64x64"}],
}


def test_root_deploy_keeps_slash():
    result = tweak_manifest("", dict(BASE_MANIFEST))
    assert result["start_url"] == "/"
    assert result["scope"] == "/"


def test_sub_path_deploy_rewrites_start_url_and_scope():
    result = tweak_manifest("spoolman", dict(BASE_MANIFEST))
    assert result["start_url"] == "/spoolman/"
    assert result["scope"] == "/spoolman/"


def test_other_fields_are_left_untouched():
    result = tweak_manifest("spoolman", dict(BASE_MANIFEST))
    assert result["name"] == "Spoolman"
    # Icon src stays relative so it resolves against the served manifest URL.
    assert result["icons"] == [{"src": "pwa-64x64.png", "sizes": "64x64"}]


def test_does_not_mutate_the_input_manifest():
    original = dict(BASE_MANIFEST)
    tweak_manifest("spoolman", original)
    assert original["start_url"] == "/"  # unchanged


def test_hostile_base_path_produces_valid_escaped_json():
    # A base path containing JSON metacharacters must not break out of the string.
    result = tweak_manifest('a"b</script>', dict(BASE_MANIFEST))
    serialized = json.dumps(result)
    # Round-trips as valid JSON with the literal (escaped) value preserved.
    assert json.loads(serialized)["start_url"] == '/a"b</script>/'
