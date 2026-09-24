import type { ServerMessage } from '@osint-globe/shared';
import type { Connector } from './connectors/types.js';
import type { Store } from './store.js';

type Broadcast = (msg: ServerMessage) => void;

/** Polls each connector on its own interval and broadcasts diffs. */
export class Registry {
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly connectors: Connector[],
    private readonly store: Store,
    private readonly broadcast: Broadcast,
  ) {}

  start(): void {
    for (const connector of this.connectors) {
      const run = async () => {
        try {
          const entities = await connector.poll({
            env: process.env,
            logger: (msg, ...args) => console.log(`[${connector.id}] ${msg}`, ...args),
          });
          const diff = this.store.apply(connector.layer, entities);
          if (diff.upserts.length || diff.removed.length) {
            this.broadcast({
              type: 'update',
              layer: connector.layer,
              upserts: diff.upserts,
              removed: diff.removed,
              generatedAt: diff.generatedAt,
            });
          }
        } catch (err) {
          console.error(`[${connector.id}] poll failed:`, (err as Error).message);
        }
      };

      void run(); // prime immediately
      this.timers.push(setInterval(run, connector.refreshIntervalMs));
    }
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}
