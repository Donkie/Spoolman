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

# A non-numeric PUID/PGID makes the [ -ne ] test below error out, so usermod is
# skipped and the app silently runs as the default 1000. PUID 0 is worse: the
# container starts as root and drops to "app" via gosu, so a PUID of 0 keeps
# that user at uid 0, the "still root?" check never turns false, and the script
# re-execs itself forever.
case "$PUID" in
    '' | *[!0-9]*) fail "PUID must be a number, got \"$PUID\"." ;;
    0) fail "PUID cannot be 0: Spoolman drops root privileges and cannot run as root." ;;
esac
case "$PGID" in
    '' | *[!0-9]*) fail "PGID must be a number, got \"$PGID\"." ;;
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
