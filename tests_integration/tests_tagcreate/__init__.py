"""Integration tests for the opt-in tag-auto-create feature, enabled.

Runs only against docker-compose-sqlite-tagcreate.yml, the one deployment in this suite
with SPOOLMAN_TAG_AUTO_CREATE_ENABLED=TRUE -- see tests_integration/tests/tag/test_scan_decode.py
for the "still off by default" half of this contract, which runs on the regular DB-type matrix.

A standalone package (own conftest.py, own _openprinttag_fixtures.py), not a subpackage of
tests_integration/tests/: that package's default `pytest tests` entrypoint is what the
regular DB-type matrix runs, and those compose files never set the auto-create env var, so
mounting this suite inside it would run tests that assume a setting those deployments don't
have.
"""
