# Monitoring with Prometheus

Spoolman NG can expose its inventory as Prometheus metrics, letting you graph
filament usage over time (e.g. in Grafana) and alert on low stock.

## Enable metrics

Set the environment variable and restart:

```
SPOOLMAN_METRICS_ENABLED=TRUE
```

Metrics are then served at `http://<host>:<port>/metrics` (honoring
`SPOOLMAN_BASE_PATH` if set). Spool and filament gauges refresh from the
database once per minute.

> The metrics endpoint is unauthenticated, like the rest of the API — keep it
> on a trusted network or behind an authenticating reverse proxy.

## Exported metrics

| Metric | Labels | Meaning |
|---|---|---|
| `spoolman_spool_price` | `spool_id`, `filament_id` | Total price of the spool. |
| `spoolman_spool_weight_used` | `spool_id`, `filament_id` | Used weight in grams (monotonically increases as you print). |
| `spoolman_spool_initial_weight` | `spool_id`, `filament_id` | Net filament weight of the full spool in grams. |
| `spoolman_filament_info` | `filament_id`, `vendor`, `name`, `material`, `color` | Filament metadata carrier (value is always 1; join on `filament_id`). |
| `spoolman_filament_density` | `filament_id` | Density in g/cm³. |
| `spoolman_filament_diameter` | `filament_id` | Diameter in mm. |
| `spoolman_filament_weight` | `filament_id` | Net weight of a full spool of this filament in grams. |
| `spoolman_build_info` | version fields | Build/version information. |

## Scrape configuration

```yaml
scrape_configs:
  - job_name: spoolman
    scrape_interval: 60s # gauges refresh every minute; scraping faster adds nothing
    static_configs:
      - targets: ["spoolman-host:7912"]
    # metrics_path: /spoolman/metrics   # if you run with SPOOLMAN_BASE_PATH=/spoolman
```

## Useful queries

Remaining weight per spool (grams):

```promql
spoolman_spool_initial_weight - spoolman_spool_weight_used
```

Filament consumed in the last 7 days, per spool:

```promql
increase(spoolman_spool_weight_used[7d])
```

Total consumption per material (joins usage to filament metadata):

```promql
sum by (material) (
  increase(spoolman_spool_weight_used[30d])
  * on (filament_id) group_left(material) spoolman_filament_info
)
```

Low-stock alert (below 15% remaining):

```promql
(spoolman_spool_initial_weight - spoolman_spool_weight_used)
  / spoolman_spool_initial_weight < 0.15
```

Note that gauges only exist for spools present in the database; archived or
deleted spools stop being exported, so use `increase()`/`rate()` windows rather
than raw counters when aggregating history.
