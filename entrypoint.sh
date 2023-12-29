#!/bin/sh

PUID=${PUID:-1000}
PGID=${PGID:-1000}

groupmod -o -g "$PGID" app
usermod -o -u "$PUID" app

echo User UID: $(id -u app)
echo User GID: $(id -g app)

echo "Starting uvicorn..."

# Execute the uvicorn command with any additional arguments
exec su-exec "app" uvicorn spoolman.main:app "$@"
