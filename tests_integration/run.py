"""Build and run the integration tests."""

# ruff: noqa: S605, S607, T201

import os
import sys

print("Building and running integration tests...")
print("Building Spoolman...")
os.system("docker build -t donkie/spoolman:test .")
print("Building Spoolman tester...")
os.system("docker build -t donkie/spoolman-tester:latest tests_integration")

targets = [
    "postgres",
    "sqlite",
    "mariadb",
    "cockroachdb",
]

for target in targets:
    print(f"Running integration tests against {target}...")
    os.system(f"docker-compose -f tests_integration/docker-compose-{target}.yml down -v")
    if os.system(f"docker-compose -f tests_integration/docker-compose-{target}.yml up --abort-on-container-exit") > 0:
        print(f"Integration tests against {target} failed!")
        sys.exit(1)
