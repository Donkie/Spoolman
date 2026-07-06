#!/bin/sh

PUID=${PUID:-1000}
PGID=${PGID:-1000}
SPOOLMAN_PORT=${SPOOLMAN_PORT:-8000}
SPOOLMAN_HOST=${SPOOLMAN_HOST:-0.0.0.0}

fail() {
    echo "$1" >&2
    exit 1
}

if [ "$(id -u app)" -ne "$PUID" ]; then
    usermod -o -u "$PUID" app ||
        fail "Failed to update app UID to $PUID"
fi

if [ "$(id -g app)" -ne "$PGID" ]; then
    groupmod -o -g "$PGID" app ||
        fail "Failed to update app GID to $PGID"
fi

if [ "$(id -u)" -eq 0 ]; then
    exec gosu "app" uvicorn spoolman.main:app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT "$@"
else
    exec uvicorn spoolman.main:app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT "$@"
fi
