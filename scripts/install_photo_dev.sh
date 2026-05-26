#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-spoolman-photo-dev}"
IMAGE_NAME="${IMAGE_NAME:-spoolman-photo-dev:latest}"
HOST_PORT="${HOST_PORT:-7913}"
CONTAINER_PORT="${CONTAINER_PORT:-8000}"
DATA_VOLUME="${DATA_VOLUME:-spoolman-photo-dev-data}"
VITE_APIURL="${VITE_APIURL:-/api/v1}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker не найден. Установи Docker и повтори запуск." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon недоступен. Запусти Docker и повтори запуск." >&2
  exit 1
fi

rm -rf client/dist

echo "Сборка frontend в docker-контейнере node:20..."
echo "VITE_APIURL=${VITE_APIURL}"
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e "VITE_APIURL=${VITE_APIURL}" \
  -v "${ROOT_DIR}/client:/work" \
  -w /work \
  node:20-bookworm \
  sh -lc 'npm ci && npm run build'

echo "Сборка docker image ${IMAGE_NAME}..."
docker build -t "${IMAGE_NAME}" .

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  echo "Удаляю старый контейнер ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "Создаю volume ${DATA_VOLUME}, чтобы не пересекаться с официальным Spoolman на 7912..."
docker volume create "${DATA_VOLUME}" >/dev/null

echo "Ремонтирую dev-БД предыдущих сборок, если она уже существует..."
docker run --rm \
  --entrypoint python3 \
  -v "${DATA_VOLUME}:/home/app/.local/share/spoolman" \
  "${IMAGE_NAME}" \
  - <<'PYREPAIR' || true
import sqlite3
from pathlib import Path

db_path = Path('/home/app/.local/share/spoolman/spoolman.db')
if not db_path.exists():
    raise SystemExit(0)
conn = sqlite3.connect(db_path)
try:
    conn.execute(
        "UPDATE alembic_version SET version_num = ? WHERE version_num = ?",
        ("5bd2ab9f413e", "872cfd0e5c5c"),
    )
    for key in ("extra_fields_vendor", "extra_fields_filament", "extra_fields_spool"):
        for old, new in (
            ('"field_type":"image_url"', '"field_type":"photo_url"'),
            ('"field_type": "image_url"', '"field_type": "photo_url"'),
        ):
            conn.execute(
                "UPDATE setting SET value = replace(value, ?, ?) WHERE key = ?",
                (old, new, key),
            )
    conn.commit()
finally:
    conn.close()
PYREPAIR

echo "Запускаю ${CONTAINER_NAME} на http://127.0.0.1:${HOST_PORT}"
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -e SPOOLMAN_PORT="${CONTAINER_PORT}" \
  -v "${DATA_VOLUME}:/home/app/.local/share/spoolman" \
  "${IMAGE_NAME}"

echo "Готово. Открой: http://127.0.0.1:${HOST_PORT}"
echo "Логи: docker logs -f ${CONTAINER_NAME}"
