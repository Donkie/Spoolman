#!/bin/bash

# ANSI color codes
GREEN='\033[0;32m'
ORANGE='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Warn with a prompt if we're running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${ORANGE}WARNING: You are running this script as root. It is recommended to run this script as a non-root user.${NC}"
    echo -e "${ORANGE}Do you want to continue? (y/n)${NC}"
    read choice

    if [ "$choice" != "y" ] && [ "$choice" != "Y" ]; then
        echo -e "${ORANGE}Aborting installation.${NC}"
        exit 1
    fi
fi

# CD to project root if we're in the scripts dir
current_dir=$(pwd)
if [ "$(basename "$current_dir")" = "scripts" ]; then
    cd ..
fi

#
# Python version verification
#
if ! command -v python3 &>/dev/null; then
    echo -e "${ORANGE}Python 3 is not installed or not found. Please install at least Python 3.9 before you continue.${NC}"
    exit 1
fi

python_version=$(python3 --version) || exit 1
version_number=$(echo "$python_version" | awk '{print $2}')
IFS='.' read -r major minor patch <<< "$version_number"

if [[ "$major" -eq 3 && "$minor" -ge 9 ]]; then
    echo -e "${GREEN}Python 3.9 or later is installed (Current version: $version_number)${NC}"
else
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        if [[ "$VERSION_CODENAME" == "buster" ]]; then
            echo -e "${ORANGE}Python 3.9 or later is not installed (Current version: $version_number)${NC}"
            echo -e "${ORANGE}You are running an outdated version of Debian/Raspbian (Buster). If you upgrade to Bullseye, you will get the correct python version. Please see guides online on how to upgrade your operating system.${NC}"
            exit 1
        fi
    fi
    echo -e "${ORANGE}Current version of Python ($version_number) is too old for Spoolman.${NC}"
    echo -e "${ORANGE}Please look up how to install Python 3.9 or later for your specific operating system.${NC}"
    exit 1
fi

#
# Install needed system packages
#
install_packages=0
if ! python3 -c 'import venv, ensurepip' &>/dev/null; then
    echo -e "${ORANGE}Python venv module is not accessible. Installing venv...${NC}"
    install_packages=1
fi

if ! command -v pip3 &>/dev/null; then
    echo -e "${ORANGE}Python pip is not installed. Installing pip...${NC}"
    install_packages=1
fi

if ! command -v pg_config &>/dev/null; then
    echo -e "${ORANGE}pg_config is not available. Installing libpq-dev...${NC}"
    install_packages=1
fi

if ! command -v unzip &>/dev/null; then
    echo -e "${ORANGE}unzip is not available. Installing unzip...${NC}"
    install_packages=1
fi

if [ "$install_packages" -eq 1 ]; then
    # sudo apt-get update
    sudo apt-get install -y python3-pip python3-venv libpq-dev unzip || exit 1
fi

#
# Update pip
#
echo -e "${GREEN}Updating pip...${NC}"
python3 -m pip install --user --upgrade pip &>/dev/null || exit 1

#
# Install various pip packages if needed
#
packages=("setuptools" "wheel" "pdm")
for package in "${packages[@]}"; do
    if ! pip3 show "$package" &>/dev/null; then
        echo -e "${GREEN}Installing $package...${NC}"
        pip3 install --user "$package" &>/dev/null || exit 1
    fi
done

#
# Add python bin dir to PATH if needed
#
user_python_bin_dir=$(python3 -m site --user-base)/bin
if [[ ! "$PATH" =~ "$user_python_bin_dir" ]]; then
    echo -e "${ORANGE}WARNING: $user_python_bin_dir is not in PATH, this will make it difficult to run PDM commands. Temporarily adding $user_python_bin_dir to PATH...${NC}"
    echo -e "${ORANGE}To make this permanent, add the following line to your .bashrc or .zshrc file:${NC}"
    echo -e "${ORANGE}export PATH=$user_python_bin_dir:\$PATH${NC}"
    export PATH=$user_python_bin_dir:$PATH
fi

#
# Install Spoolman
#

# Install PDM dependencies
echo -e "${GREEN}Installing Spoolman backend and its dependencies using PDM...${NC}"

# Force PDM to use venv. The default is virtualenv which has had some compatibility issues
pdm config venv.backend venv || exit 1
pdm sync --prod --no-editable || exit 1

# Get version number from pyproject.toml
spoolman_version=$(grep "^version = " pyproject.toml | awk '{print $3}' | sed 's/"//g')

# Check if a client has already been downloaded for this version
download_client=1
if [ -f "client/dist/version.txt" ]; then
    client_version=$(cat client/dist/version.txt)
    if [ "$client_version" != "$spoolman_version" ]; then
        # Client version is different, delete the client folder
        echo -e "${ORANGE}Spoolman web client version (v$client_version) is different from server version (v$spoolman_version). Deleting old client...${NC}"
        rm -rf client/dist
    else
        # Client version is the same, no need to download it again
        echo -e "${GREEN}Spoolman web client is up to date (v$client_version)${NC}"
        download_client=0
    fi
fi

# Download appropriate client for this version
if [ "$download_client" -eq 1 ]; then
    url="https://github.com/Donkie/Spoolman/releases/download/v$spoolman_version/spoolman-client.zip"
    echo -e "${GREEN}Downloading Spoolman web client v$spoolman_version...${NC}"
    # Download and unzip silently
    curl -sL "$url" -o spoolman-client.zip || exit 1
    unzip -q -o spoolman-client.zip -d client/dist/ || exit 1
    rm spoolman-client.zip

    # Write a file to the client/dist/ folder to indicate which version of the client this is
    echo "$spoolman_version" > client/dist/version.txt
fi

#
# Initialize the .env file if it doesn't exist
#
if [ ! -f ".env" ]; then
    echo -e "${ORANGE}.env file not found. Creating it...${NC}"
    cp .env.example .env
fi

#
# Install systemd service
#
echo -e "${CYAN}Do you want to install Spoolman as a systemd service? This will automatically start Spoolman when your server starts. (y/n)${NC}"
read choice

if [ "$choice" == "y" ] || [ "$choice" == "Y" ]; then

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
ExecStart=$spoolman_dir/scripts/start.sh
WorkingDirectory=$spoolman_dir
Restart=always

[Install]
WantedBy=default.target
"

    # Specify the service name
    service_name="Spoolman"

    # Create a temporary directory for the service unit file
    temp_dir="$(mktemp -d)"

    # Create the systemd service unit file
    service_file="$temp_dir/$service_name.service"
    echo "$service_unit" > "$service_file"

    # Move the service unit file to the user's systemd user directory
    systemd_user_dir="$HOME/.config/systemd/user"
    mkdir -p "$systemd_user_dir"
    mv "$service_file" "$systemd_user_dir/"

    # Reload the systemd user service manager
    systemctl --user daemon-reload

    # Enable and start the service
    systemctl --user enable "$service_name"
    systemctl --user start "$service_name"

    # Load .env file now
    set -o allexport
    source .env
    set +o allexport

    echo -e "${GREEN}Spoolman systemd service has been installed and Spoolman is now starting.${NC}"
    echo -e "${GREEN}Spoolman will soon be reachable at ${ORANGE}http://<server-ip>:$SPOOLMAN_PORT${NC}"
    echo -e "${GREEN}You can start/restart/stop the service by running e.g. '${CYAN}systemctl --user stop Spoolman${GREEN}'${NC}"
    echo -e "${GREEN}You can disable the service from starting automatically by running '${CYAN}systemctl --user disable Spoolman${GREEN}'${NC}"
    echo -e "${GREEN}You can view the Spoolman logs by running '${CYAN}journalctl --user -u Spoolman${GREEN}'${NC}"

    # Clean up temporary directory
    rm -r "$temp_dir"
else
    echo -e "${ORANGE}Skipping systemd service installation.${NC}"
    echo -e "${ORANGE}You can start Spoolman manually by running 'bash scripts/start.sh'${NC}"
fi

echo -e "${GREEN}Spoolman has been installed successfully!${NC}"
echo -e "${GREEN}If you want to connect to an external database, you can edit the .env file and restart the service.${NC}"
