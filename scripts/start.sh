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
# Activate .venv
#
echo -e "${GREEN}Activating .venv...${NC}"
source .venv/bin/activate

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
uvicorn spoolman.main:app --host $SPOOLMAN_HOST --port $SPOOLMAN_PORT
