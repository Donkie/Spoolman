# Spoolman

_Keep track of your inventory of 3D-printer filament spools._

Spoolman is a python-based web service that helps you keep track of your filament spools and how they are being used.

It is designed to be easily integrated into printer software such as Octoprint and Moonraker where
these services can e.g. list available spools, report filament consumption, etc.

Currently, it has no client GUI, and only operates using HTTP REST commands.

REST API: https://donkie.github.io/Spoolman/

## Prerequisites

The data can be stored using any async SQLAlchemy supported database:

- External databases: PostgreSQL, MySQL, MariaDB, CockroachDB
- Internal database: SQLite

If none of the below SPOOLMAN_DB_* environment variables are set, a SQLite database located in the user directory will be created and used.

Database configuration:
| Variable                  | Description                                                                                                                  |
|---------------------------|------------------------------------------------------------------------------------------------------------------------------|
| SPOOLMAN_DB_TYPE          | Type of database, any of: "postgres", "mysql", "sqlite", "cockroachdb"                                                       |
| SPOOLMAN_DB_HOST          | Database hostname                                                                                                            |
| SPOOLMAN_DB_PORT          | Database port                                                                                                                |
| SPOOLMAN_DB_NAME          | Database name                                                                                                                |
| SPOOLMAN_DB_USERNAME      | Database username                                                                                                            |
| SPOOLMAN_DB_PASSWORD_FILE | Path of file which contains the database password. This is more secure than using SPOOLMAN_DB_PASSWORD.                      |
| SPOOLMAN_DB_PASSWORD      | Database password                                                                                                            |
| SPOOLMAN_DB_QUERY         | Query parameters for the database connection, e.g. set to "unix_socket=/path/to/mysql.sock" to connect using a MySQL socket. |

## Data

The objects that this web service stores are:

### Spool

An individual spool of filament.

Attributes: first use, last use, filament, weight left, location, lot/batch number, comment

### Filament

A type of filament from a specific vendor.

Attributes: name+color, vendor, material, price, density, diameter, net weight, spool weight, article number, comment

### Vendor

A filament producer.

Attributes: name, comment
