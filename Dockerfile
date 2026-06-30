FROM python:3.14-slim-bookworm AS python-builder

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_DEV=1
ENV UV_PYTHON_DOWNLOADS=0

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    python3-dev \
    libpq-dev \
    libffi-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install UV
RUN pip install --no-cache-dir uv

# TARGETPLATFORM is provided automatically by Docker buildx (e.g. "linux/amd64",
# "linux/arm64", "linux/arm/v7"). The optional NFC extra pulls in cbor2, which
# has no prebuilt wheel for 32-bit ARM and can't compile in this image, so we
# skip it on armv7 — mirroring how pyproject.toml already excludes
# httptools/uvloop there. NFC endpoints are simply unavailable on armv7 images
# (the app imports those deps lazily, so it still runs).
ARG TARGETPLATFORM

# Install dependencies
WORKDIR /home/app/spoolman
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    if [ "$TARGETPLATFORM" = "linux/arm/v7" ]; then \
        uv sync --locked --no-install-project; \
    else \
        uv sync --locked --no-install-project --extra nfc; \
    fi

# Copy and install app
COPY --chown=app:app migrations /home/app/spoolman/migrations
COPY --chown=app:app spoolman /home/app/spoolman/spoolman
COPY --chown=app:app alembic.ini README.md uv.lock pyproject.toml /home/app/spoolman/
RUN --mount=type=cache,target=/root/.cache/uv \
    if [ "$TARGETPLATFORM" = "linux/arm/v7" ]; then \
        uv sync --locked; \
    else \
        uv sync --locked --extra nfc; \
    fi

FROM python:3.14-slim-bookworm AS python-runner

LABEL org.opencontainers.image.source=https://github.com/Donkie/Spoolman
LABEL org.opencontainers.image.description="Keep track of your inventory of 3D-printer filament spools."
LABEL org.opencontainers.image.licenses=MIT

# Install gosu for privilege dropping and libusb for NFC reader support
RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu \
    libusb-1.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Add local user so we don't run as root
RUN groupmod -g 1000 users \
    && useradd -u 1000 -U app \
    && usermod -G users app \
    && mkdir -p /home/app/.local/share/spoolman \
    && chown -R app:app /home/app/.local/share/spoolman

# Copy built client
COPY --chown=app:app ./client/dist /home/app/spoolman/client/dist

# Copy built app
COPY --chown=app:app --from=python-builder /home/app/spoolman /home/app/spoolman

COPY entrypoint.sh /home/app/spoolman/entrypoint.sh
RUN chmod +x /home/app/spoolman/entrypoint.sh

WORKDIR /home/app/spoolman

ENV PATH="/home/app/spoolman/.venv/bin:${PATH}"

ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}

# Write GIT_COMMIT and BUILD_DATE to a build.txt file
RUN echo "GIT_COMMIT=${GIT_COMMIT}" > build.txt \
    && echo "BUILD_DATE=${BUILD_DATE}" >> build.txt

# Run command
EXPOSE 8000

# Add healthcheck to verify the API is responsive using the internal Python interpreter
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python3 -c "import os, urllib.request; \
    port = os.getenv('SPOOLMAN_PORT', '8000'); \
    base = os.getenv('SPOOLMAN_BASE_PATH', '').strip('/'); \
    path = f'/{base}/api/v1/health'.replace('//', '/'); \
    urllib.request.urlopen(f'http://localhost:{port}{path}', timeout=5)" || exit 1

ENTRYPOINT ["/home/app/spoolman/entrypoint.sh"]
