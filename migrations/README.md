# Migrations

Creating a new version:
```bash
pdm run python -m spoolman.main
pdm run alembic revision -m "some title" --autogenerate
```
