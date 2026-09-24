# Architecture

```
                          ┌─────────────────────────────────────────┐
   Upstream OSINT feeds   │                GATEWAY                   │
   ┌──────────────┐       │   ┌───────────┐   poll()   ┌─────────┐  │
   │ OpenSky      │──────▶│   │ Connector │──────────▶ │  Store  │  │
   │ CelesTrak    │──────▶│   │ registry  │   diff     │ (per-   │  │
   │ Windy        │──────▶│   └───────────┘            │  layer) │  │
   │ AIS / …      │       │         │                  └────┬────┘  │
   └──────────────┘       │         │ broadcast(diff)       │       │
                          │         ▼                       │ REST  │
                          │   ┌───────────┐                 ▼       │
                          │   │ WebSocket │           /api/layers   │
                          │   └─────┬─────┘                         │
                          └─────────┼───────────────────────────────┘
                                    │ snapshot + live diffs (JSON)
                                    ▼
                          ┌───────────────────────────────┐
                          │            WEB (Cesium)        │
                          │  LiveStore ──▶ imperative      │
                          │   (per-layer  reconcile into   │
                          │    entity map) CustomDataSource│
                          │  React panel = layer toggles   │
                          └───────────────────────────────┘
```

## Core idea: one normalized `Entity`, many sources

Every source — an aircraft, a satellite, a webcam, a ship — is normalized into a
single `Entity` (`packages/shared/src/index.ts`) on a `LayerId`. This keeps the
store, the wire protocol, and the renderer uniform no matter how many sources we
add. A connector's only job is `upstream feed → Entity[]`.

## Gateway

- **Connector** (`apps/gateway/src/connectors/types.ts`) — `poll()` returns the
  current `Entity[]` for one layer on a fixed interval.
- **Store** (`store.ts`) — holds the latest entity map per layer and computes a
  `{ upserts, removed }` diff each poll so we only push what changed.
- **Registry** (`registry.ts`) — schedules every connector and broadcasts diffs.
- **Server** (`index.ts`) — Fastify. REST snapshots (`/api/layers`,
  `/api/layers/:id`) for cold loads; `/ws` for the live stream.

Diff-based broadcasting means a client that just connected gets a full snapshot,
then only deltas — cheap enough to stream thousands of aircraft.

## Web

- **LiveStore** (`live.ts`) — mirrors the gateway world; entity maps live outside
  React so 1000s of updates/sec don't re-render the tree.
- **Globe** (`Globe.tsx`) — owns the Cesium `Viewer` and reconciles each layer's
  entities into a `CustomDataSource` imperatively (add / move / prune by id).
- **App** (`App.tsx`) — the layer panel; React state only holds toggles + counts,
  throttled to ~2 Hz.

## Status

| Layer        | Source(s)                                            | State                                |
| ------------ | ---------------------------------------------------- | ------------------------------------ |
| `flights`    | OpenSky Network (ADS-B)                               | ✅ live, keyless                      |
| `satellites` | CelesTrak TLEs → SGP4 (`satellite.js`)               | ✅ live, keyless                      |
| `incidents`  | USGS earthquakes + NASA EONET                         | ✅ live, keyless                      |
| `vessels`    | AISStream.io (persistent WS adapter)                 | ✅ built, needs `AISSTREAM_KEY`       |
| `cameras`    | Windy Webcams; +511/DOT networks planned             | ✅ built, needs `WINDY_WEBCAMS_KEY`   |
| `buildings`  | Google Photoreal 3D Tiles / Cesium OSM Buildings     | ✅ toggle in globe                    |
| `streetview` | **Mapillary**, KartaView                             | ⏳ next (open street-level, on-click) |
| `weather`    | RainViewer radar, NOAA                               | ⏳ planned (tiled imagery)            |

### Planned "superpower" features

- **Geofencing & watchlists** — draw a zone, alert when any entity enters; track
  specific tail numbers / MMSIs.
- **Entity dossiers** — click → pull registration, operator, photos, history from
  open registries (planespotters, etc.).
- **AI analyst** — natural-language queries over the live world (Claude).
- **Exposed-devices layer (later)** — Shodan API *metadata* only (where indexed
  devices are), never hotlinking into private feeds — see policy above.

New backend layers need no frontend changes — add styling in `Globe.tsx`'s
`STYLE` map and the layer appears in the panel automatically.

## Data-source policy

This project surfaces **openly published** data only. We do **not** integrate
sources that require bypassing authentication or that index private/"unsecured"
devices (e.g. scraping exposed RTSP/webcam endpoints) — that is unlawful in most
jurisdictions and is out of scope. "Cameras" means publicly published webcam and
official DOT/traffic feeds that are meant to be public.

## Scaling notes (next steps)

- Viewport-scoped subscriptions: client sends a `bbox`; gateway streams only
  in-view entities (protocol already carries `bbox`).
- Swap thousands of Cesium entities for `PointPrimitiveCollection` + clustering.
- Client-side SGP4 re-propagation between satellite polls for smooth orbits
  (TLEs are already shipped in each satellite entity's `properties`).
- Persistence/replay: add Postgres + PostGIS (see `docker-compose.yml`) to store
  tracks and scrub back through time.
