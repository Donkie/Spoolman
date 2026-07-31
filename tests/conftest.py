"""Session-wide setup for the unit tests.

Importing ``spoolman.main`` (or anything that reads ``env.get_data_dir()``) creates the data
directory as a side effect, which would otherwise be the *real* one -- a developer running
``poe test`` would find the suite reaching into the same directory as their live instance.
Point the directories at a throwaway location before any test module is imported.
"""

import os
import tempfile
from pathlib import Path

_TMP_DIR = Path(tempfile.mkdtemp(prefix="spoolman-unit-tests-"))

os.environ.setdefault("SPOOLMAN_DIR_DATA", str(_TMP_DIR / "data"))
os.environ.setdefault("SPOOLMAN_DIR_LOGS", str(_TMP_DIR / "logs"))
os.environ.setdefault("SPOOLMAN_DIR_BACKUPS", str(_TMP_DIR / "backups"))
