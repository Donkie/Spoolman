#!/bin/bash

# ANSI color codes
GREEN='\033[0;32m'
ORANGE='\033[0;33m'
NC='\033[0m' # No Color

# CD to project root if we're in the scripts dir
current_dir=$(pwd)
if [ "$(basename "$current_dir")" = "scripts" ]; then
    cd ..
fi

#
# Verify that the installation has been done, by checking for the existance of the venv folder
#
if [ ! -d ".venv" ]; then
    echo -e "${ORANGE}.venv folder not found. Please run the install script first.${NC}"
    exit 1
fi

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
# Load envvars from .env file
#
set -o allexport
source .env
set +o allexport

#
# Start Spoolman using pdm run
#
echo -e "${GREEN}Starting Spoolman...${NC}"
pdm run app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT
