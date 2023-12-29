"""A python script that bumps the version number of a project."""

# ruff: noqa: PLR2004, T201, S603, S607

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

    if subprocess.run(["pip", "show", "pdm-bump"], cwd=project_root, capture_output=True, check=False).returncode != 0:
        print("Please install pdm-bump using pip.")
        sys.exit(1)

    # Bump the version number, read the pdm bump output to determine the new version number
    bump_type = sys.argv[1]
    bump_output = subprocess.run(["pdm", "bump", bump_type], cwd=project_root, capture_output=True, check=True)
    # Example output: "Performing increment of version: 0.7.0 -> 0.8.0\nSome more text"
    # Parse using regex
    new_version_match = re.search(r"-> ([A-Za-z0-9\.\-]+)", bump_output.stdout.decode())
    if new_version_match is None:
        print("Failed to parse pdm bump output, did it fail?")
        sys.exit(1)
    new_version = new_version_match.group(1)

    # Update the version number in the node project
    with Path("client", "package.json").open("r") as f:
        node_package = json.load(f)
    node_package["version"] = new_version
    with Path("client", "package.json").open("w") as f:
        json.dump(node_package, f, indent=2)

    # Run npm install to update the lock file with new version
    # On windows, shell=True is required for npm to be found
    if os.name == "nt":
        subprocess.run(["npm", "install"], cwd=project_root.joinpath("client"), check=True, shell=True)  # noqa: S602
    else:
        subprocess.run(["npm", "install"], cwd=project_root.joinpath("client"), check=True)

    # Stage the changed files
    subprocess.run(
        ["git", "add", "pyproject.toml", "client/package.json", "client/package-lock.json"],
        cwd=project_root,
        check=True,
    )

    # Commit the changes
    subprocess.run(["git", "commit", "-m", f"Bump version to {new_version}"], cwd=project_root, check=True)

    # Tag the commit, prefix with "v"
    subprocess.run(["git", "tag", f"v{new_version}"], cwd=project_root, check=True)

    # Notify user that the process is complete
    print(f"Bumped version to {new_version}.")
