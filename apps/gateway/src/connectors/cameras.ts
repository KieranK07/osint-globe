import type { Entity } from '@osint-globe/shared';
import type { Connector } from './types.js';

/**
 * Publicly published live webcams via the Windy Webcams API (v3).
 * Requires a free key (WINDY_WEBCAMS_KEY); without one the connector is a no-op.
 *
 * NOTE: This intentionally uses an opt-in directory of *publicly published*
 * webcams. We do not scan for or surface private/unsecured camera feeds —
 * accessing those without authorization is unlawful in most jurisdictions.
 */
interface WindyWebcam {
  webcamId: number;
  title: string;
  location: { latitude: number; longitude: number; city?: string; country?: string };
  images?: { current?: { preview?: string; thumbnail?: string } };
  urls?: { detail?: string };
}

export const camerasConnector: Connector = {
  id: 'windy-webcams',
  layer: 'cameras',
  title: 'Public Webcams',
  description: 'Publicly published live webcams (Windy Webcams API).',
  refreshIntervalMs: 120_000,
  enabledByDefault: false,
  async poll({ logger, env }) {
    const key = env.WINDY_WEBCAMS_KEY;
    if (!key) {
      logger('WINDY_WEBCAMS_KEY not set — skipping (see .env.example).');
      return [];
    }
    const url =
      'https://api.windy.com/webcams/api/v3/webcams?limit=50&include=location,images,urls';
    const res = await fetch(url, { headers: { 'x-windy-api-key': key } });
    if (!res.ok) throw new Error(`Windy responded ${res.status}`);
    const data = (await res.json()) as { webcams: WindyWebcam[] };

    const now = Date.now();
    const entities = data.webcams.map<Entity>((w) => ({
      id: `cameras:${w.webcamId}`,
      layer: 'cameras',
      source: 'windy-webcams',
      position: { lon: w.location.longitude, lat: w.location.latitude },
      label: w.title,
      properties: {
        preview: w.images?.current?.preview,
        thumbnail: w.images?.current?.thumbnail,
        url: w.urls?.detail,
        city: w.location.city,
        country: w.location.country,
      },
      updatedAt: now,
    }));
    logger(`${entities.length} webcams`);
    return entities;
  },
};
