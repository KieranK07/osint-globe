import { useEffect, useMemo, useReducer, useState } from 'react';
import type { LayerId } from '@osint-globe/shared';
import { LiveStore } from './live.js';
import { Globe } from './Globe.js';

const WS_URL = (import.meta.env.VITE_GATEWAY_WS as string) ?? 'ws://localhost:4000/ws';

export function App() {
  const store = useMemo(() => new LiveStore(), []);
  const [, forceRender] = useReducer((n) => n + 1, 0);
  const [enabled, setEnabled] = useState<Set<LayerId>>(new Set());
  const [photoreal, setPhotoreal] = useState(false);

  useEffect(() => {
    store.connect(WS_URL);
    // Throttle UI re-renders to ~2/s; the globe updates itself imperatively.
    let pending = false;
    const unsub = store.onChange(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        forceRender();
      }, 500);
    });
    return unsub;
  }, [store]);

  // Default-enable layers once the gateway announces them.
  useEffect(() => {
    if (store.info.length && enabled.size === 0) {
      setEnabled(new Set(store.info.filter((l) => l.enabledByDefault).map((l) => l.id)));
    }
  }, [store.info.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: LayerId) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="app">
      <Globe store={store} enabled={enabled} photoreal={photoreal} />
      <aside className="panel">
        <header>
          <h1>OSINT Globe</h1>
          <span className={store.connected ? 'dot live' : 'dot'} />
          <small>{store.connected ? 'live' : 'connecting…'}</small>
        </header>

        <ul className="layers">
          {store.info.map((layer) => (
            <li key={layer.id}>
              <label>
                <input
                  type="checkbox"
                  checked={enabled.has(layer.id)}
                  onChange={() => toggle(layer.id)}
                />
                <span className="title">{layer.title}</span>
                <span className="count">{store.count(layer.id).toLocaleString()}</span>
              </label>
              <p className="desc">{layer.description}</p>
            </li>
          ))}
          {store.info.length === 0 && <li className="muted">Waiting for gateway…</li>}
        </ul>

        <div className="threed">
          <label>
            <input
              type="checkbox"
              checked={photoreal}
              onChange={() => setPhotoreal((v) => !v)}
            />
            <span className="title">Photoreal 3D geometry</span>
          </label>
          <p className="desc">Zoom in for real 3D city shape (Google 3D Tiles, or OSM Buildings with an ion token).</p>
        </div>

        <footer>
          <small>Open-source intelligence · {store.info.length} sources</small>
        </footer>
      </aside>
    </div>
  );
}
