<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Donkie/Spoolman/assets/2332094/4e6e80ac-c7be-4ad2-9a33-dedc1b5ba30e">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/Donkie/Spoolman/assets/2332094/3c120b3a-1422-42f6-a16b-8d5a07c33000">
  <img alt="Icon of a filament spool" src="https://github.com/Donkie/Spoolman/assets/2332094/3c120b3a-1422-42f6-a16b-8d5a07c33000">
</picture>

<br/><br/>

_Keep track of your inventory of 3D-printer filament spools._

Spoolman is a web service that helps you keep track of your filament spools and how they are being used.

It acts as a database, where other printer software such as Octoprint and Moonraker can interact with to have a centralized place for spool information.
For example, if used together with Moonraker, your spool weight will automatically be reduced as your print is progressing.

It exposes a HTTP API which services can interact with. See the [OpenAPI description](https://donkie.github.io/Spoolman/) for more information.

## Client
Spoolman includes a web-client that lets you directly manipulate all the data. It also has a few additional nice features such as label printing.

![image](https://github.com/Donkie/Spoolman/assets/2332094/33928d5e-440f-4445-aca9-456c4370ad0d)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://hosted.weblate.org/widget/spoolman/287x66-black.png">
  <source media="(prefers-color-scheme: light)" srcset="https://hosted.weblate.org/widget/spoolman/287x66-white.png">
  <img alt="Icon of a filament spool" src="https://hosted.weblate.org/widget/spoolman/287x66-white.png">
</picture>

_The web client is translated by the community using [Weblate](https://hosted.weblate.org/projects/spoolman/)._

## Integration status
Spoolman is still relatively new, so support isn't widespread yet, but it's being actively integrated to multiple different projects.

* ✔️ Moonraker - See the [Moonraker Documentation](https://moonraker.readthedocs.io/en/latest/configuration/#spoolman)
  * ✔️ Fluidd
  * ✔️ KlipperScreen
  * ✖️ Mainsail
* ✖️ Octoprint - A plugin is in progress: [OctoPrint-Spoolman](https://github.com/mkevenaar/OctoPrint-Spoolman)

## Installation
Spoolman can interact with any of the following databases: SQLite, PostgreSQL, MySQL, MariaDB, CockroachDB.
By default, SQLite is used which is a simple no-install database solution that saves to a single .db file located in the server's user directory.

### Using Docker
The easiest way to run Spoolman is using Docker. Docker is a platform for developing, shipping, and running applications in containers. Containers are lightweight, portable, and self-contained environments that can run on any machine with Docker installed.

To install Docker on your machine, follow the instructions for your operating system on the [Docker website](https://docs.docker.com/engine/install/). Docker also includes the docker-compose tool which lets you configure the container deployment in a simple yaml file, without having to remember all the command line options.

Here is a sample docker-compose config to get you started. Copy-paste it into a file called `docker-compose.yml` and run `docker-compose up -d` to start it. If you want to use the SQLite database as in this sample, you must first create a folder called `data` in the same directory as the `docker-compose.yml`, then you should run `chown 1000:1000 data` on it in order to give it the correct permissions for the user inside the docker container.
```yaml
version: '3.8'
services:
  spoolman:
    image: ghcr.io/donkie/spoolman:latest
    restart: unless-stopped
    volumes:
      # Mount the host machine's ./data directory into the container's /home/app/.local/share/spoolman directory
      - type: bind
        source: ./data # This is where the data will be stored locally. Could also be set to for example `source: /home/pi/printer_data/spoolman`.
        target: /home/app/.local/share/spoolman # Do NOT change this line
    ports:
      # Map the host machine's port 7912 to the container's port 8000
      - "7912:8000"
    environment:
      - TZ=Europe/Stockholm # Optional, defaults to UTC
```
Once you have it up and running, you can access the web UI by browsing to `http://your.ip:7912`. Make sure that the data folder you created now contains a `spoolman.db` file. If you cannot find this file in your machine, then **your data will be lost** every time you update Spoolman.

If a new version of Spoolman has been released, you can update to it by first browsing to the directory where you have the `docker-compose.yml` file and then running `docker-compose pull && docker-compose up -d`.

If you want to connect with an external database instead, specify the `SPOOLMAN_DB_*` environment variables from the table below.

| Variable                  | Description                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SPOOLMAN_DB_TYPE          | Type of database, any of: `postgres`, `mysql`, `sqlite`, `cockroachdb`                                                       |
| SPOOLMAN_DB_HOST          | Database hostname                                                                                                            |
| SPOOLMAN_DB_PORT          | Database port                                                                                                                |
| SPOOLMAN_DB_NAME          | Database name                                                                                                                |
| SPOOLMAN_DB_USERNAME      | Database username                                                                                                            |
| SPOOLMAN_DB_PASSWORD_FILE | Path of file which contains the database password. Can be used instead of SPOOLMAN_DB_PASSWORD if desired.                   |
| SPOOLMAN_DB_PASSWORD      | Database password                                                                                                            |
| SPOOLMAN_DB_QUERY         | Query parameters for the database connection, e.g. set to `unix_socket=/path/to/mysql.sock` to connect using a MySQL socket. |
| SPOOLMAN_LOGGING_LEVEL    | Logging level, any of: `CRITICAL`, `ERROR`, `WARNING`, `INFO`, `DEBUG`, defaults to `INFO`.                                  |
| SPOOLMAN_AUTOMATIC_BACKUP | Automatic nightly DB backups for SQLite databases. Enabled by default, set to `FALSE` to disable.                            |

## Development
### Client
To test out changes to the web client, the best way is to run it in development mode.

Prerequisities:
* NodeJS 16 or above installed, along with NPM. Running `node --version` should print a correct version.
* A running Spoolman server, with the following two environment variables added in the `docker-compose.yml`:
```yaml
    environment:
      - FORWARDED_ALLOW_IPS=*
      - SPOOLMAN_DEBUG_MODE=TRUE
```

Instructions:
1. Open a terminal and CD to the `client` subdirectory
2. Run `npm install`. If it doesn't succeed, you probably have an incorrect node version. Spoolman is only tested on NodeJS 16.
3. Run `echo "VITE_APIURL=http://192.168.0.123:7901/api/v1" > .env`, where the ip:port is the address of the running Spoolman server. This should create a `.env` file in the `client` directory. If you don't already have one running on your network, you can start one up using the `docker-compose.yml` showed above.
4. Run `npm run dev`. The terminal will print a "Local: xxxx" URL, open that in your browser and the web client should show up. Your existing spools etc in your Spoolman database should be loaded in.
5. Any edits in .ts/.tsx files will be automatically reloaded in your browser. If you make any change to .json files you will need to F5 in your browser.
