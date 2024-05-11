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
Spoolman doesn't depend on any specific printer software, but to make the most out of it, you should use it together with a frontend that supports it.
It is currently only supported in the Klipper ecosystem, with official support for the major frontends. Support for other ecosystems like Octoprint is ongoing.

* ✔️ Moonraker - See the [Moonraker Documentation](https://moonraker.readthedocs.io/en/latest/configuration/#spoolman)
  * ✔️ Fluidd
  * ✔️ KlipperScreen
  * ✔️ Mainsail
* ✖️ Octoprint - A plugin is in progress: [OctoPrint-Spoolman](https://github.com/mkevenaar/OctoPrint-Spoolman)
* ✔️ Home Assistant integration: [spoolman-homeassistant](https://github.com/Disane87/spoolman-homeassistant)

## Installation
Spoolman can interact with any of the following databases: SQLite, PostgreSQL, MySQL, MariaDB, CockroachDB.
By default, SQLite is used which is a simple no-install database solution that saves to a single .db file located in the server's user directory.

Spoolman can be installed in two ways, either standalone on your machine or using Docker. If you already have Docker installed, it's recommended to use that.

### Standalone
This installation guide assumes you are using a Debian-based Linux distribution such as Ubuntu or Raspberry Pi OS. If you are using another distribution, please look inside the bash scripts to see what commands are being run and adapt them to your distribution.

Copy-paste the entire below command and run it on your machine to install Spoolman.
```bash
sudo apt-get update && \
sudo apt-get install -y curl jq && \
mkdir -p ./Spoolman && \
source_url=$(curl -s https://api.github.com/repos/Donkie/Spoolman/releases/latest | jq -r '.assets[] | select(.name == "spoolman.zip").browser_download_url') && \
curl -sSL $source_url -o temp.zip && unzip temp.zip -d ./Spoolman && rm temp.zip && \
cd ./Spoolman && \
bash ./scripts/install.sh
```

#### Updating
Updating Spoolman is quite simple. If you use the default database type, SQLite, it is stored outside of the installation folder (in `~/.local/share/spoolman`), so you will not lose any data by moving to a new installation folder.

Copy-paste the entire below commands and run it on your machine to update Spoolman to the latest version. The command assumes your existing Spoolman folder is named `Spoolman` and is located in your current directory.
```bash
# Stop and disable the old Spoolman service
sudo systemctl stop Spoolman
sudo systemctl disable Spoolman
systemctl --user stop Spoolman
systemctl --user disable Spoolman

# Download and install the new version
mv Spoolman Spoolman_old && \
mkdir -p ./Spoolman && \
source_url=$(curl -s https://api.github.com/repos/Donkie/Spoolman/releases/latest | jq -r '.assets[] | select(.name == "spoolman.zip").browser_download_url') && \
curl -sSL $source_url -o temp.zip && unzip temp.zip -d ./Spoolman && rm temp.zip && \
cp Spoolman_old/.env Spoolman/.env && \
cd ./Spoolman && \
bash ./scripts/install.sh && \
rm -rf ../Spoolman_old
```

### Using Docker
You can also run Spoolman using Docker. Docker is a platform for developing, shipping, and running applications in containers. Containers are lightweight, portable, and self-contained environments that can run on any machine with Docker installed.

To install Docker on your machine, follow the instructions for your operating system on the [Docker website](https://docs.docker.com/engine/install/). Docker also includes the docker-compose tool which lets you configure the container deployment in a simple yaml file, without having to remember all the command line options. Note: older versions of docker-compose require you to have a dash (`-`) in the following commands, like `docker-compose` instead of `docker compose`.

Here is a sample docker-compose config to get you started. Copy-paste it into a file called `docker-compose.yml` and run `docker compose up -d` to start it. If you want to use the SQLite database as in this sample, you must first create a folder called `data` in the same directory as the `docker-compose.yml`, then you should run `chown 1000:1000 data` on it in order to give it the correct permissions for the user inside the docker container.
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

#### Updating
If a new version of Spoolman has been released, you can update to it by first browsing to the directory where you have the `docker-compose.yml` file and then running `docker compose pull && docker compose up -d`.

### Environment variables
See the `.env.example` file for a list of all environment variables you can use.

## Frequently Asked Questions (FAQs)
### QR Code Does not work on HTTP / The page is not served over HTTPS
This is a limitation of the browsers. Browsers require a secure connection to the server to enable HTTPS. This is not a limitation of Spoolman. For more information read this [blog](https://blog.mozilla.org/webrtc/camera-microphone-require-https-in-firefox-68/) from Mozilla.

You can put Spoolman behind a reverse proxy like Caddy or Nginx to enable HTTPS. See for example [this guide](https://caddyserver.com/docs/quick-starts/reverse-proxy) for Caddy.

### Can Spoolman be translated into my language?
Yes, head over to [Weblate](https://hosted.weblate.org/projects/spoolman/) to start the Translation

## Install from source
**Advanced users only.**

If you want to run the absolute latest version of Spoolman, you can either use the `edge` tagged Docker image, or follow
these steps to install from source. Keep in mind that this may contain bugs and is not recommended for production use.

1. Make sure you have at least NodeJS 20 or higher installed, and Python 3.9 or higher installed.
1. Clone this repo or download the zip source.
2. Inside the `client/` folder:
   1. Create a .env file with `VITE_APIURL=/api/v1` in it
   2. Run `npm ci`
   3. Run `npm run build`
3. Give scripts permissions: `chmod +x ./scripts/*.sh`
4. Install PDM using `pip install --user pdm`
5. Build the requirements.txt file: `pdm export -o requirements.txt --without-hashes > requirements.txt`
6. Run the installer script like the normal install: `./scripts/install.sh`

## Development
### Server/Backend (Python)
The Python backend runs on Python 3.9. It's built on FastAPI for the REST API, and SQLAlchemy to handle the databases.

To setup yourself for Python development, do the following:
1. Clone this repo
2. CD into the repo
3. Install PDM: `pip install --user pdm`
> At pre-commit hook used pdm==2.7.4
4. Install Spoolman dependencies: `pdm sync`

And you should be all setup. Read the Style and Integration Testing sections below as well.

#### Style
[Black](https://black.readthedocs.io/en/stable/) and [Ruff](https://docs.astral.sh/ruff/) is used to ensure a consistent style and good code quality. You can install extensions in your editor to make them run automatically.

[Pre-commit](https://pre-commit.com/) is used to ensure the style is maintained for each commit. You can setup pre-commit by simply running the following in the Spoolman root directory:
```
pip install pre-commit
pre-commit install
```

#### Integration Testing
The entire REST API is integration tested using an isolated docker container, with all 4 database types that we support (Postgres, MySQL, SQLite and CockroachDB). These integration tests live in `tests_integration/`. They are designed to "use" the REST API in the same way that a client would, and ensures that everything remains consistent between updates. The databases are created as part of the integration testing, so no external database is needed to run them.

If you have docker installed, you can run the integration tests using `pdm run itest` for all databases, or e.g. `pdm run itest postgres` for a single database.


### Client (Node/React/Typescript)
The client is a React-based web client, built using the [refine.dev](https://refine.dev) framework, with Ant Design as the components.

To test out changes to the web client, the best way is to run it in development mode.

Prerequisites:
* NodeJS 20 or above installed, along with NPM. Running `node --version` should print a correct version.
* A running Spoolman server, with the following two environment variables added in the `docker-compose.yml`:
```yaml
    environment:
      - FORWARDED_ALLOW_IPS=*
      - SPOOLMAN_DEBUG_MODE=TRUE
```

Instructions:
1. Open a terminal and CD to the `client` subdirectory
2. Run `npm install`. If it doesn't succeed, you probably have an incorrect node version. Spoolman is only tested on NodeJS 20.
3. Run `echo "VITE_APIURL=http://192.168.0.123:7901/api/v1" > .env`, where the ip:port is the address of the running Spoolman server. This should create a `.env` file in the `client` directory. If you don't already have one running on your network, you can start one up using the `docker-compose.yml` showed above.
4. Run `npm run dev`. The terminal will print a "Local: xxxx" URL, open that in your browser and the web client should show up. Your existing spools etc in your Spoolman database should be loaded in.
5. Any edits in .ts/.tsx files will be automatically reloaded in your browser. If you make any change to .json files you will need to F5 in your browser.
