#!/bin/sh

PUID=${PUID:-1000}
PGID=${PGID:-1000}
SPOOLMAN_PORT=${SPOOLMAN_PORT:-8000}
SPOOLMAN_HOST=${SPOOLMAN_HOST:-0.0.0.0}

fail() {
    echo "$1" >&2
    exit 1
}

# Kubernetes sets a Docker-style "service link" variable for every Service that
# exists in the namespace when the pod starts, so a Service named "spoolman"
# makes SPOOLMAN_PORT=tcp://<clusterIP>:8000 here. That is the Service address,
# not a port, and uvicorn refuses to start on it. Ignore it and keep the default.
case "$SPOOLMAN_PORT" in
    *://*)
        echo "Warning: ignoring SPOOLMAN_PORT=\"$SPOOLMAN_PORT\", which is a Kubernetes service link rather than a port number. Using 8000 instead." >&2
        SPOOLMAN_PORT=8000
        ;;
esac

if [ "$(id -u app)" -ne "$PUID" ]; then
    usermod -o -u "$PUID" app ||
        fail "Failed to update app UID to $PUID"
fi

if [ "$(id -g app)" -ne "$PGID" ]; then
    groupmod -o -g "$PGID" app ||
        fail "Failed to update app GID to $PGID"
fi

if [ "$(id -u)" -eq 0 ]; then
    exec gosu "app" "$0" "$@"
    # NOT REACHABLE
fi

exec uvicorn spoolman.main:app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT "$@"
