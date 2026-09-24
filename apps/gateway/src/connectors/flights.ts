import type { Entity } from '@osint-globe/shared';
import type { Connector } from './types.js';

const OPENSKY_URL = 'https://opensky-network.org/api/states/all';

/**
 * OpenSky Network state vectors (ADS-B). The `states` array is positional;
 * see https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
 */
type StateVector = [
  icao24: string,
  callsign: string | null,
  originCountry: string,
  timePosition: number | null,
  lastContact: number,
  longitude: number | null,
  latitude: number | null,
  baroAltitude: number | null,
  onGround: boolean,
  velocity: number | null,
  trueTrack: number | null,
  verticalRate: number | null,
  sensors: number[] | null,
  geoAltitude: number | null,
  ...rest: unknown[],
];

export const flightsConnector: Connector = {
  id: 'opensky',
  layer: 'flights',
  title: 'Live Flights',
  description: 'Live aircraft positions from the OpenSky Network (ADS-B).',
  refreshIntervalMs: 12_000,
  enabledByDefault: true,
  async poll({ logger, env }) {
    const headers: Record<string, string> = {};
    if (env.OPENSKY_USER && env.OPENSKY_PASS) {
      const basic = Buffer.from(`${env.OPENSKY_USER}:${env.OPENSKY_PASS}`).toString('base64');
      headers.Authorization = `Basic ${basic}`;
    }

    const res = await fetch(OPENSKY_URL, { headers });
    if (!res.ok) throw new Error(`OpenSky responded ${res.status}`);
    const data = (await res.json()) as { time: number; states: StateVector[] | null };

    const now = Date.now();
    const entities: Entity[] = [];
    for (const s of data.states ?? []) {
      const lon = s[5];
      const lat = s[6];
      if (lon == null || lat == null) continue;
      const icao = s[0].trim();
      entities.push({
        id: `flights:${icao}`,
        layer: 'flights',
        source: 'opensky',
        position: { lon, lat, alt: s[13] ?? s[7] ?? 0 },
        heading: s[10] ?? undefined,
        velocity: s[9] ?? undefined,
        label: (s[1] || icao).trim(),
        properties: {
          icao24: icao,
          callsign: (s[1] ?? '').trim(),
          originCountry: s[2],
          onGround: s[8],
          verticalRate: s[11],
          baroAltitude: s[7],
        },
        updatedAt: now,
      });
    }
    logger(`${entities.length} aircraft`);
    return entities;
  },
};
