import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 8080;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@jenz/api listening on http://localhost:${info.port}`);
});

export default app;
