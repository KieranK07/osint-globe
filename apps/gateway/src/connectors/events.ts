import type { Entity } from '@osint-globe/shared';
import type { Connector } from './types.js';

/**
 * Live world events on the `incidents` layer. Two keyless global feeds:
 *  - USGS earthquakes (past 24h)
 *  - NASA EONET open natural events (wildfires, storms, volcanoes, ice, …)
 * FIRMS (fire detections) and GDELT (news/conflict) can be added the same way.
 */
const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200';

async function earthquakes(now: number): Promise<Entity[]> {
  const res = await fetch(USGS_URL);
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const data = (await res.json()) as { features: any[] };
  return (data.features ?? []).map((f) => {
    const [lon, lat, depthKm] = f.geometry.coordinates as [number, number, number];
    return {
      id: `incidents:quake:${f.id}`,
      layer: 'incidents' as const,
      source: 'usgs',
      position: { lon, lat, alt: 0 },
      label: f.properties.title,
      properties: {
        kind: 'earthquake',
        magnitude: f.properties.mag,
        depthKm,
        place: f.properties.place,
        time: new Date(f.properties.time).toISOString(),
        url: f.properties.url,
      },
      updatedAt: now,
    };
  });
}

async function naturalEvents(now: number): Promise<Entity[]> {
  const res = await fetch(EONET_URL);
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data = (await res.json()) as { events: any[] };
  const out: Entity[] = [];
  for (const ev of data.events ?? []) {
    const geo = ev.geometry?.[ev.geometry.length - 1];
    if (!geo || geo.type !== 'Point') continue; // skip track polygons for now
    const [lon, lat] = geo.coordinates as [number, number];
    out.push({
      id: `incidents:eonet:${ev.id}`,
      layer: 'incidents',
      source: 'nasa-eonet',
      position: { lon, lat },
      label: ev.title,
      properties: {
        kind: ev.categories?.[0]?.title ?? 'event',
        date: geo.date,
        url: ev.link ?? ev.sources?.[0]?.url,
      },
      updatedAt: now,
    });
  }
  return out;
}

export const eventsConnector: Connector = {
  id: 'world-events',
  layer: 'incidents',
  title: 'Live World Events',
  description: 'Earthquakes (USGS) + natural events — wildfires, storms, volcanoes (NASA EONET).',
  refreshIntervalMs: 120_000,
  enabledByDefault: true,
  async poll({ logger }) {
    const now = Date.now();
    const settled = await Promise.allSettled([earthquakes(now), naturalEvents(now)]);
    const entities: Entity[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') entities.push(...r.value);
      else logger(`source failed: ${(r.reason as Error).message}`);
    }
    logger(`${entities.length} events`);
    return entities;
  },
};
