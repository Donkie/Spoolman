<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Donkie/Spoolman/assets/2332094/4e6e80ac-c7be-4ad2-9a33-dedc1b5ba30e">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/Donkie/Spoolman/assets/2332094/3c120b3a-1422-42f6-a16b-8d5a07c33000">
  <img alt="Icon of a filament spool" src="https://github.com/Donkie/Spoolman/assets/2332094/3c120b3a-1422-42f6-a16b-8d5a07c33000">
</picture>

<br/><br/>

_Keep track of your inventory of 3D-printer filament spools._

Spoolman is a web service that helps you keep track of your filament spools and how they are being used.

It is designed to be easily integrated into printer software such as Octoprint and Moonraker where
these services can e.g. list available spools, report filament consumption, etc.

It exposes a REST API which backends can interact with. See the [OpenAPI description](https://donkie.github.io/Spoolman/) for more information.

It also ships with a simple web-based UI that lets you manipulate the stored data, add filaments, etc.

## Installation
The data can be stored in any of the following databases: SQLite, PostgreSQL, MySQL, MariaDB, CockroachDB.
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
      - ./data:/home/app/.local/share/spoolman
    ports:
      - "7912:8000"
    environment:
      - TZ=Europe/Stockholm # Optional, defaults to UTC
```
Once you have it up and running, you can access the web UI by browsing to `http://your.ip:7912`.

If a new version of Spoolman has been released, you can update to it by first browsing to the directory where you have the `docker-compose.yml` file and then running `docker-compose pull && docker-compose up -d`.

If you want to connect with an external database instead, specify the `SPOOLMAN_DB_*` environment variables from the table below.

| Variable                  | Description                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SPOOLMAN_DB_TYPE          | Type of database, any of: `postgres`, `mysql`, `sqlite`, `cockroachdb`                                                       |
| SPOOLMAN_DB_HOST          | Database hostname                                                                                                            |
| SPOOLMAN_DB_PORT          | Database port                                                                                                                |
| SPOOLMAN_DB_NAME          | Database name                                                                                                                |
| SPOOLMAN_DB_USERNAME      | Database username                                                                                                            |
| SPOOLMAN_DB_PASSWORD_FILE | Path of file which contains the database password. This is more secure than using SPOOLMAN_DB_PASSWORD.                      |
| SPOOLMAN_DB_PASSWORD      | Database password                                                                                                            |
| SPOOLMAN_DB_QUERY         | Query parameters for the database connection, e.g. set to `unix_socket=/path/to/mysql.sock` to connect using a MySQL socket. |
| SPOOLMAN_LOGGING_LEVEL    | Logging level, any of: `CRITICAL`, `ERROR`, `WARNING`, `INFO`, `DEBUG`, defaults to `INFO`.                                  |
| SPOOLMAN_AUTOMATIC_BACKUP | Automatic nightly DB backups for SQLite databases. Enabled by default, set to `FALSE` to disable.                            |

## Configuration
### Moonraker
Moonraker has built-in support for Spoolman. See the [Moonraker Documentation](https://moonraker.readthedocs.io/en/latest/configuration/#spoolman) for more information.
