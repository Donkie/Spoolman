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

### Using Docker
The easiest way to run Spoolman is using Docker. Docker is a platform for developing, shipping, and running applications in containers. Containers are lightweight, portable, and self-contained environments that can run on any machine with Docker installed.

To install Docker on your machine, follow the instructions for your operating system on the [Docker website](https://docs.docker.com/engine/install/). Once you have Docker installed, you can use the sample `docker-compose.yml` file below to run Spoolman in a container.

The data can be stored in any of the following databases: SQLite, PostgreSQL, MySQL, MariaDB, CockroachDB.
By default, SQLite is used which is a simple no-install database solution that saves to a single .db file located in the server's user directory.

Here is a sample docker-compose.yml to get you started:
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
```
With this example, you should first create a folder called `data` in the same directory as the docker-compose.yml, then you should run `chown 1000:1000 data` on it in order to give it the correct permissions for the user inside the docker container.

Once you have it up and running, you can access the web UI by browsing to `http://your.ip:7912`.

If you want to connect with an external database instead, specify the environment variables from the table below.

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
