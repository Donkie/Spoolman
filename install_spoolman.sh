#!/bin/bash

# Get the current user's home directory
USER_HOME=$(eval echo "~$SUDO_USER")

# Check if Docker is installed
if ! command -v docker &>/dev/null; then
    echo "Docker is not installed. Installing Docker..."

    # Add Docker's official GPG key
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/raspbian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    # Set up Docker's Apt repository
    echo "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/raspbian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update

    # Install Docker
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    echo "Docker has been installed."
else
    echo "Docker is already installed."
fi

# Create the folder and docker-compose.yml file
INSTALL_PATH="$USER_HOME/printer_data/config/Spoolman"
mkdir -p "$INSTALL_PATH"
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

# Change timezone to match the system timezone
echo "Changing timezone to match the system timezone..."
echo $(cat /etc/timezone) | sudo tee /etc/timezone
sudo dpkg-reconfigure -f noninteractive tzdata

# Start the Docker container
cd "$INSTALL_PATH"
docker-compose up -d

echo "Spoolman Docker container is up and running at $INSTALL_PATH."
