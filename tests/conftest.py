"""Session-wide setup for the unit tests.

``env.get_data_dir()`` and its siblings create their directory as a side effect of being called,
so any test that reaches one -- directly, or by importing a module that does -- would otherwise
touch the same directory as the developer's live instance. Point them somewhere disposable
before any test module is imported. Nothing depends on this today; it is here so that the first
test that does cannot quietly reach into real data.
"""

import os
import tempfile
from pathlib import Path

_TMP_DIR = Path(tempfile.mkdtemp(prefix="spoolman-unit-tests-"))

os.environ.setdefault("SPOOLMAN_DIR_DATA", str(_TMP_DIR / "data"))
os.environ.setdefault("SPOOLMAN_DIR_LOGS", str(_TMP_DIR / "logs"))
os.environ.setdefault("SPOOLMAN_DIR_BACKUPS", str(_TMP_DIR / "backups"))
