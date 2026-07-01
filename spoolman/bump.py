"""A python script that sets the CalVer version number of the project."""

# ruff: noqa: T201, S607

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def bump() -> None:
    """Set the project version to the current CalVer (YEAR.MONTH.PATCH) and tag it."""
    project_root = Path(__file__).parent.parent

    if subprocess.run(["git", "diff", "--quiet", "pyproject.toml"], cwd=project_root, check=False).returncode != 0:
        print("The pyproject.toml file is dirty, please commit your changes before bumping the version number.")
        sys.exit(1)

    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=project_root, check=False).returncode != 0:
        print("There are staged changes, please commit them before bumping the version number.")
        sys.exit(1)

    new_version = _calver_pyproject(project_root)

    # Update the version number in the node project
    _update_node_pkg_version(project_root, new_version)

    # Run uv lock to update the lock file
    subprocess.run(["uv", "lock"], check=True)

    # Stage the changed files
    subprocess.run(
        ["git", "add", "pyproject.toml", "uv.lock", "client/package.json", "client/package-lock.json"],
        cwd=project_root,
        check=True,
    )

    # Commit the changes
    subprocess.run(["git", "commit", "-m", f"Bump version to {new_version}"], cwd=project_root, check=True)

    # Tag the commit, prefix with "v"
    subprocess.run(["git", "tag", f"v{new_version}"], cwd=project_root, check=True)

    # Notify user that the process is complete
    print(f"Bumped version to {new_version}.")


def _update_node_pkg_version(project_root: Path, new_version: str) -> None:
    with Path("client", "package.json").open("r") as f:
        node_package = json.load(f)
    node_package["version"] = new_version
    with Path("client", "package.json").open("w") as f:
        json.dump(node_package, f, indent=2)
        f.write("\n")  # Ensure file ends with a newline, needed by prettier

    # Run npm install to update the lock file with new version
    # On windows, shell=True is required for npm to be found
    if os.name == "nt":
        subprocess.run(["npm", "install"], cwd=project_root.joinpath("client"), check=True, shell=True)  # noqa: S602
    else:
        subprocess.run(["npm", "install"], cwd=project_root.joinpath("client"), check=True)


def calver(now: datetime, current_version: str | None) -> str:
    """Derive the next CalVer YEAR.MONTH.PATCH version.

    PATCH starts at 0 for a new calendar month and increments for each release
    within the same year+month as ``current_version`` (e.g. 2026.6.0, 2026.6.1,
    ... then 2026.7.0 in the next month). ``current_version`` may be ``None`` or
    unparseable (first release / malformed), in which case PATCH starts at 0.

    This is a pure function of its inputs (no clock, no file I/O) so it can be
    unit-tested directly against a table of (now, current) -> expected.
    """
    year, month = now.year, now.month
    patch = 0
    if current_version is not None:
        match = re.match(r"^(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)$", current_version.strip())
        if match is not None and int(match.group("major")) == year and int(match.group("minor")) == month:
            patch = int(match.group("patch")) + 1
    return f"{year}.{month}.{patch}"


def _calver_pyproject(project_root: Path) -> str:
    """Set the version in pyproject.toml to the current-month CalVer and return it."""
    pyproject_path = project_root.joinpath("pyproject.toml")
    try:
        pyproject_text = pyproject_path.read_text()
    except OSError:
        print("Failed to read pyproject.toml to determine current version.")
        sys.exit(1)

    version_match = re.search(
        r'^\s*version\s*=\s*"(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)"',
        pyproject_text,
        re.MULTILINE,
    )
    current_version = (
        f"{version_match.group('major')}.{version_match.group('minor')}.{version_match.group('patch')}"
        if version_match is not None
        else None
    )

    new_version = calver(datetime.now(tz=timezone.utc), current_version)

    # Replace only the first occurrence of the version line in pyproject.toml
    pattern = re.compile(r"^\s*version\s*=.*$", re.MULTILINE)
    new_line = f'version = "{new_version}"'
    new_pyproject_text = pattern.sub(new_line, pyproject_text, count=1)
    pyproject_path.write_text(new_pyproject_text)
    return new_version
