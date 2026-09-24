import type { Entity, LayerId } from '@osint-globe/shared';

interface LayerState {
  entities: Map<string, Entity>;
  generatedAt: number;
}

export interface LayerDiff {
  upserts: Entity[];
  removed: string[];
  generatedAt: number;
}

/** In-memory snapshot of the current world, one entity map per layer. */
export class Store {
  private layers = new Map<LayerId, LayerState>();

  snapshot(layer: LayerId): Entity[] {
    return [...(this.layers.get(layer)?.entities.values() ?? [])];
  }

  /** Replace a layer with a fresh poll result and return what changed. */
  apply(layer: LayerId, next: Entity[]): LayerDiff {
    const prev = this.layers.get(layer)?.entities ?? new Map<string, Entity>();
    const nextMap = new Map(next.map((e) => [e.id, e]));

    const upserts: Entity[] = [];
    for (const e of next) {
      const old = prev.get(e.id);
      if (!old || old.updatedAt !== e.updatedAt) upserts.push(e);
    }
    const removed: string[] = [];
    for (const id of prev.keys()) if (!nextMap.has(id)) removed.push(id);

    const generatedAt = Date.now();
    this.layers.set(layer, { entities: nextMap, generatedAt });
    return { upserts, removed, generatedAt };
  }
}
