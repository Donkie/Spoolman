#!/bin/bash

# Check if the script is running under sudo
if [ "$EUID" -eq 0 ]; then
    echo "Please do not run this script with sudo. Run it as a regular user."
    exit 1
fi

# Get the current user's home directory
CURRENT_USER=$(whoami)
USER_HOME=$(eval echo "~$CURRENT_USER")


# Function to check if a user is in a group
user_in_group() {
    local user="$1"
    local group="$2"
    groups "$user" | grep -q "\b$group\b"
}

# ANSI escape codes for formatting
RED='\e[31m'  # Red text
BLUE='\e[34m'  # Blue text
UNDERLINE='\e[4m'  # Underlined text
BOLD='\e[1m'  # Bold text
RESET='\e[0m' # Reset formatting

# Check if Docker is installed
if ! command -v docker &>/dev/null; then
    echo "Docker is not installed. Please install Docker and run the script again."
    exit 1
fi

# Check if users were added to the group and prompt for a reboot
if user_in_group "$USER" "docker"; then
    echo "Users are in the docker group. Continuing with Docker container setup."
else
	echo "Adding $SUDO_USER to the docker group..."
    sudo usermod -aG docker "$SUDO_USER"

	echo "Adding $USER to the docker group..."
    sudo usermod -aG docker "$USER"
fi

# Create the folder and docker-compose.yml file
INSTALL_PATH="$USER_HOME/.local/share/spoolman"
mkdir -p "$INSTALL_PATH"
mkdir -p "$INSTALL_PATH/data"
cat <<EOF > "$INSTALL_PATH/docker-compose.yml"
version: '3.8'
services:
  spoolman:
    image: ghcr.io/donkie/spoolman:latest
    restart: unless-stopped
    volumes:
      - type: bind
        source: "$INSTALL_PATH"
        target: /home/app/.local/share/spoolman
    ports:
      - "7912:8000"
    environment:
      - TZ=$(cat /etc/timezone) # Set timezone based on system timezone
EOF

# Start the Docker container
cd "$INSTALL_PATH"
if docker compose up -d || docker-compose up -d; then
    echo "Spoolman Docker container is up and running at $INSTALL_PATH."
	echo -e "Please make sure all of your Klipper components are up to date and see Moonraker Documentation at: ${BLUE}${UNDERLINE}https://moonraker.readthedocs.io/en/latest/configuration/#spoolman${RESET} to add Spoolman to your Klipper Interfaces."
else
    echo -e "${RED}${BOLD}Error: Failed to start the Docker container.${RESET}" >&2
fi
