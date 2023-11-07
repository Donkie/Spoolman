FROM node:16-alpine as client-builder

COPY ./client /client
WORKDIR /client
RUN npm ci

RUN rm -f .env && echo "VITE_APIURL=/api/v1" > .env.production
RUN npm run build

FROM python:3.11-alpine as python-builder

RUN apk add --no-cache g++ python3-dev libpq-dev libstdc++

# Add local user so we don't run as root
RUN adduser -D app
USER app

ENV PATH="/home/app/.local/bin:${PATH}"

# Install PDM
RUN pip install pip setuptools wheel\
    && pip install pdm

# Copy and install dependencies
COPY --chown=app:app pyproject.toml /home/app/spoolman/
COPY --chown=app:app pdm.lock /home/app/spoolman/
WORKDIR /home/app/spoolman
RUN pdm sync --prod --no-editable

# Copy and install app
COPY --chown=app:app migrations /home/app/spoolman/migrations
COPY --chown=app:app spoolman /home/app/spoolman/spoolman
COPY --chown=app:app alembic.ini /home/app/spoolman/
COPY --chown=app:app README.md /home/app/spoolman/

FROM python:3.11-alpine as python-runner

LABEL org.opencontainers.image.source=https://github.com/Donkie/Spoolman
LABEL org.opencontainers.image.description="Keep track of your inventory of 3D-printer filament spools."
LABEL org.opencontainers.image.licenses=MIT

RUN apk add --no-cache libstdc++

# Add local user so we don't run as root
RUN adduser -D app \
    && mkdir -p /home/app/.local/share/spoolman \
    && chown -R app:app /home/app/.local/share/spoolman

USER app

# Copy built client
COPY --chown=app:app --from=client-builder /client/dist /home/app/spoolman/client/dist

# Copy built app
COPY --chown=app:app --from=python-builder /home/app/spoolman /home/app/spoolman

WORKDIR /home/app/spoolman

ENV PATH="/home/app/spoolman/.venv/bin:${PATH}"
ENV PYTHONPATH="/home/app/spoolman:${PYTHONPATH}"

ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}

# Run command
EXPOSE 8000
ENTRYPOINT ["uvicorn", "spoolman.main:app"]
CMD ["--host", "0.0.0.0", "--port", "8000"]
