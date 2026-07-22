FROM python:3.14-slim-bookworm AS python-builder

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_DEV=1
ENV UV_PYTHON_DOWNLOADS=0

# Install system dependencies
RUN apt-get update && apt-get install -y \
    g++ \
    python3-dev \
    libpq-dev \
    libffi-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install UV
RUN pip install --no-cache-dir uv

# Install dependencies
WORKDIR /home/app/spoolman
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

# Copy and install app. No --chown here: the "app" user only exists in the
# runner stage, and Podman (unlike Docker/BuildKit) refuses to resolve it. Final
# ownership is set when these files are copied into the runner stage below.
COPY migrations /home/app/spoolman/migrations
COPY spoolman /home/app/spoolman/spoolman
COPY alembic.ini README.md uv.lock pyproject.toml /home/app/spoolman/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

# greenlet ships no 32-bit ARM wheel, so on armv7 it is compiled from source.
# setuptools links the C++ extension with gcc, which leaves libstdc++ out of the
# .so's NEEDED list, and it then crashes at import with an undefined libstdc++
# typeinfo symbol, taking startup down during the DB migration. Add libstdc++ to
# the NEEDED list so the loader pulls it in. Only armv7 is affected; amd64 and
# arm64 use a correctly linked prebuilt wheel.
RUN if [ "$(uname -m)" = "armv7l" ]; then \
        apt-get update && apt-get install -y --no-install-recommends patchelf \
        && patchelf --add-needed libstdc++.so.6 \
            "$(find /home/app/spoolman/.venv -name '_greenlet*.so')" \
        && apt-get clean && rm -rf /var/lib/apt/lists/*; \
    fi

FROM python:3.14-slim-bookworm AS python-runner

LABEL org.opencontainers.image.source=https://github.com/Donkie/Spoolman
LABEL org.opencontainers.image.description="Keep track of your inventory of 3D-printer filament spools."
LABEL org.opencontainers.image.licenses=MIT

# Install gosu for privilege dropping
RUN apt-get update && apt-get install -y \
    gosu \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Add local user so we don't run as root
RUN useradd -u 1000 -U app \
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
    urllib.request.urlopen(f'http://localhost:{port}{path}')" || exit 1

ENTRYPOINT ["/home/app/spoolman/entrypoint.sh"]
