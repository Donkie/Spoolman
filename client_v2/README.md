# Spoolman client v2

A ground-up rewrite of the Spoolman frontend using **Svelte 5 + SvelteKit**,
replacing the React / Refine / Ant Design stack in `client/`.

> Status: **connected to the real Spoolman API.** `src/lib/api/spoolSource.ts`
> talks to `/api/v1` over HTTP and `src/lib/api/live.ts` opens the real
> WebSocket channels; `src/lib/api/map.ts` maps the API shape to the client's
> domain types. Reads (grouped + flat lists, inspector details), writes (spool /
> filament / vendor edits, adjust weight, archive, add spools, drag-to-relocate)
> and live updates all round-trip against the backend.
>
> **Dev:** point the client at a running backend with `VITE_APIURL`, e.g.
> `VITE_APIURL=http://localhost:8000/api/v1 npm run dev`. In production the
> backend serves this SPA same-origin, so `VITE_APIURL` is unset and the base
> resolves to `<SPOOLMAN_BASE_PATH>/api/v1`.
>
> **Settings** (currency / round_prices / external URL) round-trip to
> `/api/v1/setting`; the low-stock threshold is a local per-browser preference.
> **Extra fields** have full parity with the original frontend: manage
> definitions per entity (all 8 types, key/type/multi_choice immutable after
> create, append-only choices) in Settings, and edit values inline on each
> inspector via type-aware inputs (`ExtraFieldInput`).
>
> **Add spools** is a single unified flow that creates spool + filament + vendor
> as needed. It searches the local catalog and **SpoolmanDB**
> (`/api/v1/external/filament`); a picked SpoolmanDB filament is imported (with its
> vendor, de-duplicated by `external_id`). "Create a new filament" expands the
> same modal inline: a **vendor combobox** reuses an existing vendor or creates a
> new one (with a live hint), and picking a **material** auto-fills density/temps
> from SpoolmanDB material presets. One submit creates whatever doesn't yet exist.
> Imported filaments show a "SpoolmanDB" badge in the inspector.
>
> **Not yet wired:** library search is a filament-name match (the API has no
> combined free-text or color-similarity search); status/diameter filters were
> dropped as the API can't express them.

## Data flow (server does the work)

Filtering, sorting, searching, **aggregation** and pagination are the server's
job — the client never sifts the full dataset. The list **paginates groups**, not
spools, so a group is atomic on a page (no splitting) and its header totals are
server-accurate. See `docs/backend-api-proposal.md` for the endpoints this
assumes.

```
UI state (filters/sort/group/search/page)
        │
   grouped mode (group≠none, not a color search):
        │  buildGroupQuery()                     api/query.ts
        ▼
   GroupQuery ── listGroups() ──▶  Page<GroupSummary>       api/spoolSource.ts
        ▼                          (key, title, counts, total_remaining,
   FilamentList                     has_stock, last_used — server aggregates)
        └─ GroupRow (per group)
              │ buildScopedSpoolQuery(group, limit)   ← lazily loads the
              ▼                                          group's spools,
           listSpools()  ── Page<Spool> ─▶ rows          in-use first, "show more"

   flat mode (group=none OR color search):
        │  buildFlatSpoolQuery()
        ▼
   SpoolQuery ── listSpools() ──▶ Page<Spool> ─▶ flat rows (no split problem)

   Pagination  ── paginates groups (grouped) or spools (flat)
```

- **Grouped**: `listGroups` returns a page of group summaries; each `GroupRow`
  fetches its own spools (`filament.id` / `vendor.id` / `location` / material
  scope). "Sort:" orders both the groups (by aggregate) and the rows within.
- **Flat** (`group=none` or a color search): plain spool pagination — no groups
  to split. Color search orders by similarity.
- **Pagination** is classic `limit`/`offset` + `X-Total-Count`. Any query change
  resets to page 1.

### Live updates (WebSocket)

Everything viewed is subscribed to and live-updates. The seam is `api/live.ts`
(`LiveConnection.subscribe(resource, {id?}, handler)` — mirrors
`ws://…/api/v1/<resource>[/<id>]`):

- **`inventory`** is a reactive normalized **cache**. `api/liveSync.ts` runs one
  central subscription per resource and applies remote events to it, so every
  cache-backed view (inspectors, locations) is live automatically.
- The **paginated list** fetches server-paged data _outside_ the cache, so it
  keeps its **own** subscription and refetches the current page on relevant
  events.
- Local edits patch the cache **and** emit a `local` event (mirroring the server
  echo). Try it in dev: `__spoolman.bumpId(103, 120)` in the console injects a
  `remote` update — the inspector and list both update instantly.

## Design

The look is ported from the design prototype (`Spoolman Prototype.dc.html` /
`Spoolman Mobile.dc.html`): a dark theme, IBM Plex type, warm-orange (`#be682f`)
accent, and a dense two-pane **Library** (list + inspector). Design tokens live as
CSS custom properties in `src/app.css`.

### Responsiveness

- **Desktop** — two panes: the filament/spool list on the left, a live inspector
  on the right.
- **Mobile** — the list becomes full-width and front-and-centre; selecting an item
  slides the _same_ inspector up as a bottom-sheet **Drawer**
  (`src/lib/components/Drawer.svelte`). The top-bar search/nav reflow onto their
  own rows and the "Add spools" button becomes a FAB.

The breakpoint is `860px`.

## Structure

```
src/
  app.css                     design tokens + resets
  routes/
    +layout.svelte            top bar + add-spools modal shell
    +page.svelte              Library (list + inspector / drawer)
    locations/+page.svelte    drag-and-drop shelf grid
    settings/+page.svelte     server-settings style sections
  lib/
    types.ts                  domain types
    api/
      config.ts               API base + WebSocket URL resolution (VITE_APIURL)
      http.ts                 fetch wrappers (list + X-Total-Count, GET/PATCH/POST)
      map.ts                  API JSON ↔ domain types (colors, rel-time, patches)
      types.ts                GroupQuery/SpoolQuery/Page/SpoolDataSource contract
      query.ts                UI state → queries (sort/group field maps)
      spoolSource.ts          HTTP client: /spool/group, /spool (+ scoping),
                              writes, filter-option lists; populates the cache
      live.ts                 real WebSockets to /api/v1/{spool,filament,vendor}
      liveSync.ts             central live events → cache
    stores/                   inventory (reactive cache), settings, ui (runes)
    utils/                    color, format, saver (debounced writes), library
    components/               Swatch, ProgressBar, Button, Toggle, TopBar,
                              Pagination, library/* (GroupRow, …), Drawer, …
  docs/
    backend-api-proposal.md   the grouped/aggregated endpoint (implemented)
```

### How the backend is wired

- **Reads** — `api/spoolSource.ts` hits `GET /api/v1/spool/group` (grouped) and
  `GET /api/v1/spool` (flat / group-scoped), both `limit`/`offset` +
  `X-Total-Count`. Filter option lists come from `/material`, `/location`,
  `/lot-number`, `/vendor`. Every fetched entity is upserted into the cache.
- **Writes** — inline edits PATCH `/spool|/filament|/vendor/{id}` (debounced,
  optimistic); adjust-weight and archive PATCH the spool; Add-spools POSTs
  `/spool`; drag-to-relocate PATCHes `location`.
- **Live** — `api/live.ts` opens one WebSocket per resource; `liveSync` applies
  events to the cache, so cache-backed views update instantly and the paginated
  list refetches. `api/map.ts` maps every payload to domain types.

## Develop

```bash
npm install
npm run dev      # http://localhost:5174
npm run check    # svelte-check (type gate)
npm run build    # static SPA build (adapter-static, index.html fallback)
```
