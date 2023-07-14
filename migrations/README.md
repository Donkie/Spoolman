# Migrations

Creating a new version:
```bash
python -m spoolman.main
pdm run alembic revision -m "some title" --autogenerate
```
