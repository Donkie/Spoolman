"""Integration tests for the opt-in tag-auto-create feature, enabled.

Runs only against docker-compose-sqlite-tagcreate.yml, the one deployment in this suite
with SPOOLMAN_TAG_AUTO_CREATE_ENABLED=TRUE -- see tests_integration/tests/tag/test_scan_decode.py
for the "still off by default" half of this contract, which runs on the regular DB-type matrix.
"""
