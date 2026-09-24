import type { Connector } from './types.js';
import { flightsConnector } from './flights.js';
import { satellitesConnector } from './satellites.js';
import { vesselsConnector } from './vessels.js';
import { eventsConnector } from './events.js';
import { camerasConnector } from './cameras.js';

/**
 * The active connector set. Add a new data source by implementing the
 * `Connector` interface and registering it here — the registry, REST API,
 * WebSocket stream and frontend layer list all pick it up automatically.
 */
export const connectors: Connector[] = [
  flightsConnector,
  satellitesConnector,
  vesselsConnector,
  eventsConnector,
  camerasConnector,
];
