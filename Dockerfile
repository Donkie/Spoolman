FROM python:3.11-alpine

# Add local user so we don't run as root
RUN adduser -D app
USER app

ENV PATH="/home/app/.local/bin:${PATH}"

# Copy and install app
COPY --chown=app:app ./ /home/app/spoolman/
WORKDIR /home/app/spoolman
RUN pip install --user .

# Run command
EXPOSE 8000
CMD ["uvicorn", "spoolman.main:app", "--host", "0.0.0.0", "--port", "8000"]
