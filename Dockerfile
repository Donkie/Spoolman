FROM node:16-alpine as client-builder

COPY ./client /client
WORKDIR /client
RUN npm install

RUN echo "VITE_APIURL=/api/v1" > .env.production
RUN npm run build

FROM python:3.11-alpine as python-builder

RUN    apk update \
    && apk add \
    build-base \
    python3-dev \
    gcc \
    libc-dev

# Add local user so we don't run as root
RUN adduser -D app
USER app

RUN python -m venv /home/app/.venv

ENV PATH="/home/app/.venv/bin:${PATH}"

# Copy and install app
COPY --chown=app:app migrations /home/app/spoolman/migrations
COPY --chown=app:app spoolman /home/app/spoolman/spoolman
COPY --chown=app:app pyproject.toml /home/app/spoolman/
COPY --chown=app:app requirements.txt /home/app/spoolman/
COPY --chown=app:app alembic.ini /home/app/spoolman/
COPY --chown=app:app README.md /home/app/spoolman/

WORKDIR /home/app/spoolman
RUN pip install -e .

FROM python:3.11-alpine as python-runner

LABEL org.opencontainers.image.source=https://github.com/Donkie/Spoolman
LABEL org.opencontainers.image.description="Keep track of your inventory of 3D-printer filament spools."
LABEL org.opencontainers.image.licenses=MIT

# Add local user so we don't run as root
RUN adduser -D app
USER app

# Copy built client
COPY --chown=app:app --from=client-builder /client/dist /home/app/spoolman/client/dist

# Copy built app
COPY --chown=app:app --from=python-builder /home/app/.venv /home/app/.venv
COPY --chown=app:app --from=python-builder /home/app/spoolman /home/app/spoolman

WORKDIR /home/app/spoolman

ENV PATH="/home/app/.venv/bin:${PATH}"
ENV PYTHONPATH="/home/app/spoolman:${PYTHONPATH}"

# Run command
EXPOSE 8000
ENTRYPOINT ["uvicorn", "spoolman.main:app"]
CMD ["--host", "0.0.0.0", "--port", "8000"]
