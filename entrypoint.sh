#!/bin/sh

PUID=${PUID:-1000}
PGID=${PGID:-1000}
SPOOLMAN_PORT=${SPOOLMAN_PORT:-8000}
SPOOLMAN_HOST=${SPOOLMAN_HOST:-0.0.0.0}

[ $PUID -ne 1000 ] && usermod -o -u "$PUID" app
[ $PGID -ne 1000 ] && groupmod -o -g "$PGID" app

echo User UID: $(id -u app)
echo User GID: $(id -g app)

echo "Starting uvicorn..."

# Execute the uvicorn command with any additional arguments
if [ $PUID -ne $(id -u app) -o $PUID -ne $(id -g app) ]; then
    exec gosu "app" uvicorn spoolman.main:app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT "$@"
else
    exec uvicorn spoolman.main:app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT "$@"
fi
