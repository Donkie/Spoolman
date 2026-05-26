# Photo fields dev build notes

This fork builds the frontend with `VITE_APIURL=/api/v1` by default.

Use:

```bash
./scripts/install_photo_dev.sh
```

Optional overrides:

```bash
HOST_PORT=7914 CONTAINER_NAME=spoolman-photo-test VITE_APIURL=/api/v1 ./scripts/install_photo_dev.sh
```

The API URL is intentionally relative, so the UI works from localhost, LAN IP, or reverse proxy hostnames.

## Added in this iteration

- Orphan photo upload before creating a vendor/filament/spool card.
- Automatic linking of orphan photos during entity create/update through photo extra-field values.
- Daily scheduler cleanup of orphaned photos older than 24 hours.
- Backend hard validation: no more than 5 uploaded photos per entity field.
- Separate `photo_url` extra-field type for externally stored images, for example S3 URLs.
- Preview modal navigation with left/right arrows and portrait-friendly sizing.
- No-cache headers and versioned image URLs to avoid stale photo rendering after delete/upload.
- Local UI cache updates after upload/delete to avoid immediate redundant refetches.
- Backend batch metadata endpoint: `POST /api/v1/photo/batch`.
- DB inspection helper: `scripts/inspect_photo_storage.py`.

## Inspect photo storage

Inside the repository:

```bash
python3 scripts/inspect_photo_storage.py /path/to/spoolman.db
```

Inside the dev container:

```bash
docker exec -it spoolman-photo-dev \
  python3 /home/app/spoolman/scripts/inspect_photo_storage.py \
  /home/app/.local/share/spoolman/spoolman.db
```
