import type { BBox, Entity, LayerId } from '@osint-globe/shared';

export interface ConnectorContext {
  /** Optional viewport hint a connector may use to narrow its query. */
  bbox?: BBox;
  logger: (msg: string, ...args: unknown[]) => void;
  env: NodeJS.ProcessEnv;
}

/**
 * A data source. Each connector normalizes one upstream feed into `Entity[]`
 * on a single layer. The registry polls `poll()` on `refreshIntervalMs` and
 * diffs the result against the previous snapshot before broadcasting.
 */
export interface Connector {
  /** Unique source id, e.g. 'opensky'. */
  id: string;
  layer: LayerId;
  title: string;
  description: string;
  refreshIntervalMs: number;
  enabledByDefault?: boolean;
  poll(ctx: ConnectorContext): Promise<Entity[]>;
}
