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

By default, an internal SQLite database is used.

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
