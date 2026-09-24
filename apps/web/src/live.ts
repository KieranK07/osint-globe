import type { Entity, LayerId, LayerInfo, ServerMessage } from '@osint-globe/shared';

type Listener = (layer: LayerId | 'meta') => void;

/**
 * Client-side mirror of the gateway world. Holds an entity map per layer and
 * notifies subscribers when a layer changes. Kept outside React state so that
 * high-frequency updates (thousands of aircraft) drive Cesium imperatively
 * instead of re-rendering the component tree.
 */
export class LiveStore {
  readonly layers = new Map<LayerId, Map<string, Entity>>();
  info: LayerInfo[] = [];
  connected = false;

  private listeners = new Set<Listener>();
  private url = '';

  connect(url: string): void {
    this.url = url;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      this.connected = true;
      this.emit('meta');
    };
    ws.onmessage = (ev) => this.handle(JSON.parse(ev.data) as ServerMessage);
    ws.onclose = () => {
      this.connected = false;
      this.emit('meta');
      setTimeout(() => this.connect(this.url), 2000);
    };
    ws.onerror = () => ws.close();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  count(layer: LayerId): number {
    return this.layers.get(layer)?.size ?? 0;
  }

  private mapFor(layer: LayerId): Map<string, Entity> {
    let m = this.layers.get(layer);
    if (!m) {
      m = new Map();
      this.layers.set(layer, m);
    }
    return m;
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'layers':
        this.info = msg.layers;
        this.emit('meta');
        break;
      case 'snapshot': {
        const m = this.mapFor(msg.layer);
        m.clear();
        for (const e of msg.entities) m.set(e.id, e);
        this.emit(msg.layer);
        break;
      }
      case 'update': {
        const m = this.mapFor(msg.layer);
        for (const e of msg.upserts) m.set(e.id, e);
        for (const id of msg.removed) m.delete(id);
        this.emit(msg.layer);
        break;
      }
    }
  }

  private emit(what: LayerId | 'meta'): void {
    for (const fn of this.listeners) fn(what);
  }
}
