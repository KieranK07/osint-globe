/**
 * Shared contract between the gateway (data aggregation) and the web client.
 * Every data source normalizes its output into `Entity` objects on a `LayerId`.
 */

/** The categories of OSINT data the globe can display. */
export type LayerId =
  | 'flights'
  | 'satellites'
  | 'vessels'
  | 'cameras'
  | 'streetview'
  | 'buildings'
  | 'weather'
  | 'incidents';

export interface GeoPosition {
  lon: number;
  lat: number;
  /** Altitude in meters above the ellipsoid. */
  alt?: number;
}

/** A single geolocated observation from a connector, stable across updates by `id`. */
export interface Entity {
  /** Stable id, conventionally `${layer}:${sourceId}`. */
  id: string;
  layer: LayerId;
  /** Connector id that produced this entity, e.g. 'opensky'. */
  source: string;
  position: GeoPosition;
  /** Heading in degrees clockwise from north. */
  heading?: number;
  /** Ground/orbital speed in m/s. */
  velocity?: number;
  label?: string;
  /** Source-specific extras shown in the inspector and used for styling. */
  properties?: Record<string, unknown>;
  /** Epoch ms of this observation. */
  updatedAt: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface LayerInfo {
  id: LayerId;
  title: string;
  description: string;
  source: string;
  enabledByDefault: boolean;
}

export interface LayerSnapshot {
  layer: LayerId;
  entities: Entity[];
  generatedAt: number;
}

/** Messages the gateway pushes to clients over the WebSocket. */
export type ServerMessage =
  | { type: 'layers'; layers: LayerInfo[] }
  | { type: 'snapshot'; layer: LayerId; entities: Entity[]; generatedAt: number }
  | { type: 'update'; layer: LayerId; upserts: Entity[]; removed: string[]; generatedAt: number };

/** Messages clients send to the gateway. */
export type ClientMessage =
  | { type: 'subscribe'; layers: LayerId[]; bbox?: BBox }
  | { type: 'unsubscribe'; layers: LayerId[] };
