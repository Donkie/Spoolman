## Overview
This install script will install Docker and create the Spoolman container.<br><br>
I have chosen to install the container in the Klipper config folder in order to facilitate automatic backups of your spool database if you are using [Eric Zimmerman's backup scripts](https://docs.vorondesign.com/community/howto/EricZimmerman/BackupConfigToGithub.html), which I highly recommend if you're not already.<br><br>
You may encounter a permissions error when it tries to launch the Docker container, if it does just reboot the host device and re-run the install script and it should load. It seems as though the group permissions don't always update properly without a reboot.<br><br>
## Installation
To install run the following:
```
  cd ~
  git clone https://github.com/mlee12382/Spoolman.git
  cd Spoolman
  ./install_spoolman.sh
```
