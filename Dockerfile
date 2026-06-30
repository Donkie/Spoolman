FROM python:3.14-slim-trixie AS python-builder

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

# The NFC extra is installed on every platform. On 32-bit ARM the lockfile
# resolves cbor2 to the C-based 5.x line (6.x is a Rust extension with no armv7
# wheel); CBOR2_BUILD_C_EXTENSION=false makes it build as pure Python so no
# extra toolchain is needed for it. The flag is ignored by cbor2 6.x on
# amd64/arm64, which install from prebuilt wheels.
ENV CBOR2_BUILD_C_EXTENSION=false

# Install dependencies
WORKDIR /home/app/spoolman
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --extra nfc

# Copy and install app
COPY --chown=app:app migrations /home/app/spoolman/migrations
COPY --chown=app:app spoolman /home/app/spoolman/spoolman
COPY --chown=app:app alembic.ini README.md uv.lock pyproject.toml /home/app/spoolman/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --extra nfc

FROM python:3.14-slim-trixie AS python-runner

LABEL org.opencontainers.image.title="Spoolman NG"
LABEL org.opencontainers.image.source=https://github.com/sherrmann/Spoolman
LABEL org.opencontainers.image.description="Spoolman NG - a community-maintained continuation of Spoolman. Keep track of your inventory of 3D-printer filament spools."
LABEL org.opencontainers.image.licenses=MIT

# Install gosu for privilege dropping and libusb for NFC reader support.
# libstdc++6 (C++ runtime, see the LD_PRELOAD note below) and libpq5 (libpq for
# psycopg2/PostgreSQL, which has no armv7 wheel and is compiled from source) are
# needed by the 32-bit ARM image; on amd64/arm64 they come in via prebuilt wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu \
    libusb-1.0-0 \
    libstdc++6 \
    libpq5 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# greenlet (required by SQLAlchemy's async engine on every backend) has no armv7
# wheel, so on 32-bit ARM it is compiled from source — and setuptools links the
# extension with gcc, leaving libstdc++.so.6 out of the .so's NEEDED list even
# though it uses libstdc++ C++ ABI symbols. That makes greenlet fail to import
# with "undefined symbol: _ZTVN10__cxxabiv120__si_class_type_infoE", aborting
# startup before the API comes up. Preload libstdc++ by SONAME (resolved per-arch
# via ldconfig) so the symbols are available. No-op on amd64/arm64, where greenlet
# installs from a correctly linked wheel.
ENV LD_PRELOAD=libstdc++.so.6

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
