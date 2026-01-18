#!/bin/bash -e

# ANSI color codes
GREEN='\033[0;32m'
ORANGE='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Warn with a prompt if we're running as root
SUDO=sudo
if [ "$EUID" -eq 0 ]; then
    echo -e "${ORANGE}WARNING: You are running this script as root. It is recommended to run this script as a non-root user.${NC}"
    echo -e "${ORANGE}Do you want to continue? (y/n)${NC}"
    read choice

    if [ "$choice" != "y" ] && [ "$choice" != "Y" ]; then
        echo -e "${ORANGE}Aborting installation.${NC}"
        exit 1
    fi

    SUDO=
fi

# CD to project root if we're in the scripts dir
current_dir=$(pwd)
if [ "$(basename "$current_dir")" = "scripts" ]; then
    cd ..
fi

#
# Install uv if not installed
#
local_uv_dir="$(pwd)/uv"
local_uv_bin="$local_uv_dir/uv"

if command -v uv &> /dev/null; then
    echo "uv found in PATH. Using system uv."
else
    if [ -x "$local_uv_bin" ]; then
        if "$local_uv_bin" --version &> /dev/null; then
            echo "Using local uv from $local_uv_dir"
            export PATH="$local_uv_dir:$PATH"
        else
            echo "Local uv found but failed to run. Installing temporary uv..."
            curl -LsSf https://astral.sh/uv/install.sh | env UV_UNMANAGED_INSTALL="$local_uv_dir" sh
            export PATH="$local_uv_dir:$PATH"
        fi
    else
        echo "Installing temporary uv..."
        curl -LsSf https://astral.sh/uv/install.sh | env UV_UNMANAGED_INSTALL="$local_uv_dir" sh
        export PATH="$local_uv_dir:$PATH"
    fi
fi

#
# Get os package manager
#
if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    if [[ "$ID_LIKE" == *"debian"* || "$ID" == *"debian"* ]]; then
        pkg_manager="apt-get"
        update_cmd="$SUDO $pkg_manager update"
        install_cmd="$SUDO $pkg_manager install -y"
        echo -e "${GREEN}Detected Debian-based system. Using apt-get package manager.${NC}"
    elif [[ "$ID_LIKE" == *"arch"* || "$ID" == *"arch"* ]]; then
        pkg_manager="pacman"
        update_cmd="$SUDO $pkg_manager -Sy"
        install_cmd="$SUDO $pkg_manager -S --noconfirm"
        echo -e "${GREEN}Detected Arch-based system. Using pacman package manager.${NC}"
    elif [[ "$ID_LIKE" == *"fedora"* || "$ID" == *"fedora"* ]]; then
        pkg_manager="dnf"
        update_cmd="$SUDO $pkg_manager update"
        install_cmd="$SUDO $pkg_manager install -y"
        echo -e "${GREEN}Detected Fedora-based system. Using dnf package manager.${NC}"
    else
        echo -e "${ORANGE}Unsupported Linux distribution. Please install the required dependencies manually.${NC}"
    fi
fi

# Run pkg manager update
packages=""
if ! command -v pg_config &>/dev/null; then
    echo -e "${ORANGE}pg_config is not available. Installing libpq-dev...${NC}"
    if [[ "$pkg_manager" == "apt-get" ]]; then
        packages+=" libpq-dev"
    elif [[ "$pkg_manager" == "pacman" ]]; then
        packages+=" postgresql-libs"
    else
        echo -e "${ORANGE}pg_config not found and automatic installation not supported for this OS. Please install libpq-dev or postgresql-libs manually.${NC}"
    fi
fi

# not needed?
# if ! command -v unzip &>/dev/null; then
#     echo -e "${ORANGE}unzip is not available. Installing unzip...${NC}"
#     packages+=" unzip"
# fi

if [[ -n "$packages" ]]; then
    $update_cmd || exit 1
    $install_cmd $packages || exit 1
fi

#
# Install Spoolman
#

# Install dependencies
echo -e "${GREEN}Installing Spoolman backend and its dependencies...${NC}"

uv sync --no-dev

#
# Initialize the .env file if it doesn't exist
#
if [ ! -f ".env" ]; then
    echo -e "${ORANGE}.env file not found. Creating it...${NC}"
    cp .env.example .env
fi

#
# Add execute permissions of all files in scripts dir
#
echo -e "${GREEN}Adding execute permissions to all files in scripts dir...${NC}"
chmod +x scripts/*.sh

#
# Install systemd service
#
systemd_option=$1
if [ "$systemd_option" == "-systemd=no" ]; then
   choice="n"
elif [ "$systemd_option" == "-systemd=yes" ]; then
   choice="y"
elif ! command -v systemctl &> /dev/null; then
   echo -e "${ORANGE}systemctl not found. Skipping systemd service installation.${NC}"
   choice="n"
else
   echo -e "${CYAN}Do you want to install Spoolman as a systemd service? This will automatically start Spoolman when your server starts. (y/n)${NC}"
   read choice
fi

if [ "$choice" == "y" ] || [ "$choice" == "Y" ]; then
    systemd_user_dir="$HOME/.config/systemd/user"
    service_name="Spoolman"

    # Check if user-level systemd service exists and remove it
    if [ -f "$systemd_user_dir/$service_name.service" ]; then
        echo -e "${ORANGE}User-level systemd service already installed. Removing the existing service.${NC}"
        systemctl --user stop Spoolman  # Stop the service if it's running
        systemctl --user disable Spoolman  # Disable the service
        rm "$systemd_user_dir/$service_name.service"  # Remove the user-level service unit file
        systemctl --user daemon-reload  # Reload the systemd user service manager
    fi

    # Get the parent directory of the installer script
    script_dir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
    spoolman_dir=$(dirname "$script_dir")

    # Verify that we found the right spoolman dir by checking for the existence of pyproject.toml
    if [ ! -f "$spoolman_dir/pyproject.toml" ]; then
        echo -e "${ORANGE}Could not automatically find the Spoolman directory. Please specify the path to the Spoolman directory (the directory containing pyproject.toml):${NC}"
        read spoolman_dir
        # Expand the path
        spoolman_dir=$(eval echo "$spoolman_dir")
        # Verify again
        if [ ! -f "$spoolman_dir/pyproject.toml" ]; then
            echo -e "${ORANGE}Could not find pyproject.toml in $spoolman_dir. Aborting installation.${NC}"
            exit 1
        fi
    fi

    # Define the systemd service unit file
    service_unit="[Unit]
Description=Spoolman

[Service]
Type=simple
ExecStart=bash $spoolman_dir/scripts/start.sh
WorkingDirectory=$spoolman_dir
User=$USER
Restart=always

[Install]
WantedBy=default.target
"

    # Create the systemd service unit file
    service_file="/etc/systemd/system/$service_name.service"
    echo "$service_unit" | $SUDO tee "$service_file" > /dev/null

    # Reload the systemd user service manager
    $SUDO systemctl daemon-reload

    # Enable and start the service
    $SUDO systemctl enable "$service_name"
    $SUDO systemctl start "$service_name"

    # Load .env file now
    set -o allexport
    source .env
    set +o allexport

    local_ip=$(hostname -I | awk '{print $1}')

    echo -e "${GREEN}Spoolman systemd service has been installed and Spoolman is now starting.${NC}"
    echo -e "${GREEN}Spoolman will soon be reachable at ${ORANGE}http://$local_ip:$SPOOLMAN_PORT${NC}"
    echo -e "${GREEN}Please note that the displayed IP address may be incorrect for your setup. If needed, replace it manually with the correct IP.${NC}"
    echo -e "${GREEN}You can start/restart/stop the service by running e.g. '${CYAN}sudo systemctl stop Spoolman${GREEN}'${NC}"
    echo -e "${GREEN}You can disable the service from starting automatically by running '${CYAN}sudo systemctl disable Spoolman${GREEN}'${NC}"
    echo -e "${GREEN}You can view the Spoolman logs by running '${CYAN}sudo journalctl -u Spoolman${GREEN}'${NC}"
else
    echo -e "${ORANGE}Skipping systemd service installation.${NC}"
    echo -e "${ORANGE}You can start Spoolman manually by running 'bash scripts/start.sh'${NC}"
fi

echo -e "${GREEN}Spoolman has been installed successfully!${NC}"
echo -e "${GREEN}If you want to connect to an external database, you can edit the .env file and restart the service.${NC}"
