# Spoolman Helm Charts
This folder contains a prebuilt set of Helm Charts to get up and running with Spoolman in a K8S Cluster. This document assumes that a K8S cluster already exists.

*These charts were developed initially using Rancher Desktop.*

# Installation

## Configuration

Reference the `values.yaml` file for all available configuration options. Noteworthy Options are:

1. `application.autoBackup` - Enable Auto Backup - @see SPOOLMAN_AUTOMATIC_BACKUP
2. `application.claimName` - PVC Claim Name To Mount For SQLite DB and/or Backups Folder
3. `application.logLevel` - Logging Level - @see SPOOLMAN_LOGGING_LEVEL
4. `application.environment` - ENV Dictionary
5. `application.environmentSecret` - Secret To Load Environment Variables From

## Automatic

Requires GNU Make

```shell
cd helm
make helm-start
make helm-start
```

*You must run the `make helm-start` command twice. The first time it runs, it will create the `bin` sub-folder with the `values-local.yaml` override file.* 

## Manual

Run standard helm commands to spin up environment. IE: `helm install spoolman . --set application.logLevel=WARNING`