import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import auditRoutes from './routes/audit';

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/audit', auditRoutes);

const port = Number(process.env.PORT) || 8080;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@jenz/api listening on http://localhost:${info.port}`);
});

export default app;
