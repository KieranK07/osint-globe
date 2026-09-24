import WebSocket from 'ws';
import type { Entity } from '@osint-globe/shared';
import type { Connector } from './types.js';

/**
 * Live vessels via AISStream.io. AIS is a *streaming* source, so we keep one
 * persistent upstream WebSocket that continuously updates an in-memory map keyed
 * by MMSI; `poll()` just returns the current snapshot, adapting the stream to the
 * registry's poll model. Requires AISSTREAM_KEY (free at https://aisstream.io).
 */
const KNOT_TO_MS = 0.514444;
const STALE_MS = 10 * 60 * 1000;

const vessels = new Map<string, Entity>();
let started = false;

function startStream(key: string, log: (m: string) => void): void {
  if (started) return;
  started = true;

  const connect = () => {
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          APIKey: key,
          BoundingBoxes: [[[-90, -180], [90, 180]]], // whole planet
          FilterMessageTypes: ['PositionReport'],
        }),
      );
      log('AIS stream connected');
    });
    ws.on('message', (buf: Buffer) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg.MessageType !== 'PositionReport') return;
        const meta = msg.MetaData;
        const rep = msg.Message.PositionReport;
        const mmsi = String(meta.MMSI);
        vessels.set(mmsi, {
          id: `vessels:${mmsi}`,
          layer: 'vessels',
          source: 'aisstream',
          position: { lon: rep.Longitude, lat: rep.Latitude },
          heading: rep.TrueHeading !== 511 ? rep.TrueHeading : rep.Cog,
          velocity: rep.Sog != null ? rep.Sog * KNOT_TO_MS : undefined,
          label: (meta.ShipName || mmsi).trim(),
          properties: {
            mmsi,
            shipName: (meta.ShipName || '').trim(),
            sogKnots: rep.Sog,
            courseOverGround: rep.Cog,
          },
          updatedAt: Date.now(),
        });
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on('close', () => {
      log('AIS stream closed; reconnecting in 5s');
      setTimeout(connect, 5000);
    });
    ws.on('error', () => ws.close());
  };
  connect();
}

export const vesselsConnector: Connector = {
  id: 'aisstream',
  layer: 'vessels',
  title: 'Live Vessels',
  description: 'Live ship positions via open AIS (AISStream.io).',
  refreshIntervalMs: 5_000,
  enabledByDefault: false,
  async poll({ env, logger }) {
    const key = env.AISSTREAM_KEY;
    if (!key) {
      logger('AISSTREAM_KEY not set — skipping (see .env.example).');
      return [];
    }
    startStream(key, logger);

    const cutoff = Date.now() - STALE_MS;
    for (const [id, e] of vessels) if (e.updatedAt < cutoff) vessels.delete(id);

    logger(`${vessels.size} vessels`);
    return [...vessels.values()];
  },
};
