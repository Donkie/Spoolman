## Overview
This script enables you to back up your Spoolman database to GitHub. It follows a setup process similar to [Eric Zimmerman's backup scripts](https://docs.vorondesign.com/community/howto/EricZimmerman/BackupConfigToGithub.html). To use this script, you need to create a dedicated repository for your database and set up an access token by following Eric's detailed instructions.

## Installation
The following instructions provide a basic setup overview. For more detailed instructions, please refer to Eric's guide. For instructions on setting up Spoolman, please refer to the [Spoolman standalone installation guide](https://github.com/Donkie/Spoolman#standalone). Ensure you have already cloned Spoolman to your home directory and have it properly installed. 

1. If the Spoolman database directory is not already a Git repository, initialize it as one:
    ```bash
    cd ~/.local/share/spoolman
    git init
    ```

2. Set the remote repository for your Spoolman database backup, replacing the URL with your own repository link and access token (See [Eric's guide](https://docs.vorondesign.com/community/howto/EricZimmerman/BackupConfigToGithub.html#initialize-git)):
    ```bash
    git remote add origin https://your-access-token@github.com/your-username/your-repo.git
    ```

3. To execute the backup script manually, use:
    ```bash
    ~/Spoolman/scripts/autocommit.sh
    ```
    **This script assumes the Spoolman directory is labeled Spoolman, if you used something else modify the script path accordingly.**

4. To schedule automated backups at midnight every day, perform the following steps:
   - Open the Cron job configuration:
     ```bash
     crontab -e
     ```
   - If prompted to choose an editor, select one (e.g., nano).
   - Add the following line at the bottom of the file, then press `Ctrl + X`, followed by 'y', and 'Enter' to save and exit:
     ```bash
     0 0 * * * ~/Spoolman/scripts/autocommit.sh >/dev/null 2>&1
     ```
   - Optionally, if you wish to schedule Eric's backup script as well, add this line:
     ```bash
     0 0 * * * /usr/bin/bash ~/printer_data/config/autocommit.sh >/dev/null 2>&1
     ```
  
  5. If you would like to add a Macro to run the backup you can modify [Eric's Macro](https://docs.vorondesign.com/community/howto/EricZimmerman/BackupConfigToGithub.html#adding-the-backup-to-a-macro) as follows:
     ```bash
     [gcode_shell_command backup_cfg]
     command: /usr/bin/bash home/pi/printer_data/config/autocommit.sh
     timeout: 30
     verbose: True

     [gcode_shell_command backup_spoolman]
     command: ~/Spoolman/scripts/autocommit.sh
     timeout: 30
     verbose: True

     [gcode_macro BACKUP_CFG]
     description: Backs up config directory and Spoolman database to GitHub
     gcode:
         RUN_SHELL_COMMAND CMD=backup_cfg
         RUN_SHELL_COMMAND CMD=backup_spoolman
     ```
     Please keep in mind that if you are using a host other than a Raspberry Pi, or you have set a different username, you may need to modify the backup_cfg shell command home path.

## Final Notes
Before using this script, review the Spoolman standalone installation guide and verify the prerequisites and paths are correctly configured. Replace the origin URL with your own GitHub repository link and access token.
