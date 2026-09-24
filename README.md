# OSINT Globe

Status: early prototype; flights, satellites and events work without keys.

An open-source intelligence world on a single zoomable 3D globe. Aggregates live,
internet-sourced geospatial data — flights, satellites, vessels, public webcams,
street-level imagery and photoreal 3D geometry — and streams it to a Cesium globe
you can fly into anywhere on Earth.

> **Ethics & legality.** This project aggregates **openly published** data only.
> It deliberately does **not** scan for, index, or surface private/"unsecured"
> camera feeds or any source that requires bypassing authentication — doing so is
> unlawful in most jurisdictions. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#data-source-policy).

## Stack

| Layer    | Tech                                                              |
| -------- | ---------------------------------------------------------------- |
| Frontend | React + Vite + **CesiumJS** (3D globe, terrain, 3D tiles)         |
| Gateway  | Fastify + WebSocket — polls connectors, diffs, streams live data |
| Shared   | TypeScript contract (`Entity` / `LayerId`) used by both sides    |
| Data     | Pluggable **connectors**, one per source                         |

## Live now

- **Flights** — OpenSky Network (ADS-B), global, no key required
- **Satellites** — CelesTrak TLEs propagated with SGP4 (`satellite.js`)
- **World events** — USGS earthquakes + NASA EONET (wildfires, storms, volcanoes), no key
- **Vessels** — live AIS ships via AISStream.io (optional key)
- **Public webcams** — Windy Webcams API (optional key)
- **Photoreal 3D geometry** — toggle for Google 3D Tiles, or OSM Buildings with an ion token

See the roadmap in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for street-level
imagery, geofencing/watchlists, entity dossiers, an AI analyst and more.

## Quick start

```bash
npm install
cp .env.example .env      # optional keys enable more layers / terrain
npm run dev               # gateway :4000 + web :5173
```

Open http://localhost:5173. Flights and satellites stream immediately with no keys.
Add a free [Cesium ion token](https://cesium.com/ion) to `VITE_CESIUM_ION_TOKEN`
for world terrain and 3D buildings.

Run pieces individually:

```bash
npm run dev:gateway       # backend only
npm run dev:web           # frontend only
curl localhost:4000/api/layers
curl localhost:4000/api/layers/flights | head
```

## Add a data source

Implement the `Connector` interface and register it — the REST API, WebSocket
stream and frontend layer list pick it up automatically:

```ts
// apps/gateway/src/connectors/mything.ts
export const myConnector: Connector = {
  id: 'mything', layer: 'incidents', title: 'My Source', description: '…',
  refreshIntervalMs: 30_000,
  async poll(ctx) { /* fetch → return Entity[] */ return []; },
};
// then add it to apps/gateway/src/connectors/index.ts
```
