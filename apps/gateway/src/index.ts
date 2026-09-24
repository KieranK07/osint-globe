import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { LayerId, LayerInfo, ServerMessage } from '@osint-globe/shared';
import { Store } from './store.js';
import { Registry } from './registry.js';
import { connectors } from './connectors/index.js';

const PORT = Number(process.env.PORT || 4000);

const store = new Store();
const clients = new Set<WebSocket>();

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

const layerInfo: LayerInfo[] = connectors.map((c) => ({
  id: c.layer,
  title: c.title,
  description: c.description,
  source: c.id,
  enabledByDefault: c.enabledByDefault ?? true,
}));

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);

app.get('/api/health', async () => ({ ok: true, connectors: connectors.map((c) => c.id) }));
app.get('/api/layers', async () => layerInfo);
app.get('/api/layers/:id', async (req) => {
  const { id } = req.params as { id: LayerId };
  return { layer: id, entities: store.snapshot(id), generatedAt: Date.now() };
});

app.register(async (scoped) => {
  scoped.get('/ws', { websocket: true }, (socket: WebSocket) => {
    clients.add(socket);

    socket.send(JSON.stringify({ type: 'layers', layers: layerInfo } satisfies ServerMessage));
    for (const info of layerInfo) {
      socket.send(
        JSON.stringify({
          type: 'snapshot',
          layer: info.id,
          entities: store.snapshot(info.id),
          generatedAt: Date.now(),
        } satisfies ServerMessage),
      );
    }

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
});

const registry = new Registry(connectors, store, broadcast);
registry.start();

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`gateway listening on http://localhost:${PORT}  (ws: /ws)`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
