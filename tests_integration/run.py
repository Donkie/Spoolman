"""Build and run the integration tests."""

# ruff: noqa: S605, T201

import os
import sys

# Container engine to use. Defaults to "docker"; set SPOOLMAN_CONTAINER_ENGINE=podman
# to run the suite with rootless Podman (both expose a compatible `build` and
# `compose` CLI).
ENGINE = os.environ.get("SPOOLMAN_CONTAINER_ENGINE", "docker")

if __name__ == "__main__":
    print(f"Building and running integration tests (engine: {ENGINE})...")
    print("Building Spoolman...")
    if os.system(f"{ENGINE} build -t donkie/spoolman:test .") > 0:
        print("Failed to build Spoolman!")
        sys.exit(1)
    print("Building Spoolman tester...")
    if os.system(f"{ENGINE} build -t donkie/spoolman-tester:latest tests_integration") > 0:
        print("Failed to build Spoolman tester!")
        sys.exit(1)

    # Support input arguments for running only specific tests
    if len(sys.argv) > 1:
        targets = sys.argv[1:]
        # Check that all targets are valid
        for target in targets:
            if target not in ["postgres", "sqlite", "mariadb", "cockroachdb"]:
                print(f"Unknown target: {target}")
                sys.exit(1)
    else:
        print("No targets specified, running all tests...")
        targets = [
            "postgres",
            "sqlite",
            "mariadb",
            "cockroachdb",
        ]

    for target in targets:
        print(f"Running integration tests against {target}...")
        os.system(f"{ENGINE} compose -f tests_integration/docker-compose-{target}.yml down -v")
        if (
            os.system(f"{ENGINE} compose -f tests_integration/docker-compose-{target}.yml up --abort-on-container-exit")
            > 0
        ):
            print(f"Integration tests against {target} failed!")
            sys.exit(1)

    print("Integration tests passed!")
