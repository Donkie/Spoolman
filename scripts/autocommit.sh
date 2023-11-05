#!/bin/bash

config_folder="$HOME/.local/share/spoolman"

push_config(){
  cd "$config_folder" || exit
  git pull origin master

  # Check if there are changes to commit
  if [[ $(git status --porcelain) ]]; then
    git add .
    current_date=$(date +"%Y-%m-%d %T")
    git commit -m "Autocommit from $current_date"
    git push origin master
    echo "Changes pushed to the remote repository."
  else
    echo "No changes to commit."
  fi
}

push_config
