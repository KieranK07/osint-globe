import * as satellite from 'satellite.js';
import type { Entity } from '@osint-globe/shared';
import type { Connector } from './types.js';

interface Tle {
  name: string;
  line1: string;
  line2: string;
}

const TLE_TTL_MS = 6 * 60 * 60 * 1000; // TLEs are valid for hours; refetch a few times a day.
let cache: { tles: Tle[]; fetchedAt: number } | null = null;

async function loadTles(group: string): Promise<Tle[]> {
  if (cache && Date.now() - cache.fetchedAt < TLE_TTL_MS) return cache.tles;
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CelesTrak responded ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);

  const tles: Tle[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const [name, line1, line2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
    tles.push({ name: name.trim(), line1, line2 });
  }
  cache = { tles, fetchedAt: Date.now() };
  return tles;
}

export const satellitesConnector: Connector = {
  id: 'celestrak',
  layer: 'satellites',
  title: 'Satellites',
  description: 'Orbital positions propagated from CelesTrak TLEs (SGP4/SDP4).',
  refreshIntervalMs: 5_000,
  enabledByDefault: true,
  async poll({ logger, env }) {
    const group = env.SAT_GROUP || 'visual';
    const tles = await loadTles(group);
    const now = new Date();
    const gmst = satellite.gstime(now);

    const entities: Entity[] = [];
    for (const t of tles) {
      try {
        const rec = satellite.twoline2satrec(t.line1, t.line2);
        const pv = satellite.propagate(rec, now);
        if (!pv.position || typeof pv.position === 'boolean') continue;
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const noradId = t.line2.slice(2, 7).trim();
        entities.push({
          id: `satellites:${noradId}`,
          layer: 'satellites',
          source: 'celestrak',
          position: {
            lon: satellite.degreesLong(geo.longitude),
            lat: satellite.degreesLat(geo.latitude),
            alt: geo.height * 1000,
          },
          label: t.name,
          // Ship the TLE so the client can keep propagating between polls for smooth motion.
          properties: { noradId, group, tle1: t.line1, tle2: t.line2 },
          updatedAt: now.getTime(),
        });
      } catch {
        // Skip malformed or deep-space-decayed TLEs.
      }
    }
    logger(`${entities.length} satellites (${group})`);
    return entities;
  },
};
