"""Build and run the integration tests."""

import os

os.system("docker build -t donkie/spoolman:test .")
os.system("docker build -t donkie/spoolman-tester:latest tests_integration")
os.system("docker-compose -f tests_integration/docker-compose-postgres.yml down -v")
os.system("docker-compose -f tests_integration/docker-compose-postgres.yml up --abort-on-container-exit")
