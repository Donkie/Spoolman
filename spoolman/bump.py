"""A python script that bumps the version number of a project."""

# ruff: noqa: PLR2004, T201, S607

import json
import os
import re
import subprocess
import sys
from pathlib import Path


def bump() -> None:
    """Bump the version number of the project."""
    project_root = Path(__file__).parent.parent

    if len(sys.argv) < 2:
        print("Please specify a bump type, e.g. major, minor, micro.")
        sys.exit(1)

    if subprocess.run(["git", "diff", "--quiet", "pyproject.toml"], cwd=project_root, check=False).returncode != 0:
        print("The pyproject.toml file is dirty, please commit your changes before bumping the version number.")
        sys.exit(1)

    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=project_root, check=False).returncode != 0:
        print("There are staged changes, please commit them before bumping the version number.")
        sys.exit(1)

    # Bump the version number by editing pyproject.toml directly.
    bump_type = sys.argv[1]

    new_version = _bump_pyproject(project_root, bump_type)

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


def _bump_pyproject(project_root: Path, bump_type: str) -> str:
    """Bump the version number in pyproject.toml. Returns the new version."""
    pyproject_path = project_root.joinpath("pyproject.toml")
    try:
        pyproject_text = pyproject_path.read_text()
    except OSError:
        print("Failed to read pyproject.toml to determine current version.")
        sys.exit(1)

    # Parse current version expecting MAJOR.MINOR.PATCH (digits only)
    version_match = re.search(
        r'^\s*version\s*=\s*"(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)"',
        pyproject_text,
        re.MULTILINE,
    )
    if version_match is None:
        print("Failed to parse current version from pyproject.toml.")
        sys.exit(1)

    major = int(version_match.group("major"))
    minor = int(version_match.group("minor"))
    patch = int(version_match.group("patch"))

    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    elif bump_type in ("micro", "patch"):
        patch += 1
    else:
        print("Unknown bump type. Use 'major', 'minor' or 'micro'.")
        sys.exit(1)

    new_version = f"{major}.{minor}.{patch}"

    # Replace only the first occurrence of the version line in pyproject.toml
    pattern = re.compile(r"^\s*version\s*=.*$", re.MULTILINE)
    new_line = f'version = "{new_version}"'
    new_pyproject_text = pattern.sub(new_line, pyproject_text, count=1)
    pyproject_path.write_text(new_pyproject_text)
    return new_version
