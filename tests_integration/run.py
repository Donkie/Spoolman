"""Build and run the integration tests."""

# ruff: noqa: S605, S607

import os

os.system("docker build -t donkie/spoolman:test .")
os.system("docker build -t donkie/spoolman-tester:latest tests_integration")
os.system("docker-compose -f tests_integration/docker-compose-postgres.yml down -v")
os.system("docker-compose -f tests_integration/docker-compose-postgres.yml up --abort-on-container-exit")
os.system("docker-compose -f tests_integration/docker-compose-sqlite.yml down -v")
os.system("docker-compose -f tests_integration/docker-compose-sqlite.yml up --abort-on-container-exit")
os.system("docker-compose -f tests_integration/docker-compose-mariadb.yml down -v")
os.system("docker-compose -f tests_integration/docker-compose-mariadb.yml up --abort-on-container-exit")
os.system("docker-compose -f tests_integration/docker-compose-cockroachdb.yml down -v")
os.system("docker-compose -f tests_integration/docker-compose-cockroachdb.yml up --abort-on-container-exit")
