import { Hono } from 'hono';
import { cors } from 'hono/cors';
import auditRoutes from './routes/audit';
import skillRoutes from './routes/skills';

const app = new Hono();

// CORS first, before routes. The browser frontend is hosted cross-origin
// (Cloudflare Pages: jenz.ai / *.pages.dev) and calls this API directly.
// Env-driven allowlist; default '*' is acceptable here — auth is via
// header/bearer, not cookies.
const corsOrigins = process.env.CORS_ORIGINS;
app.use(
  '*',
  cors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-jenz-workspace'],
  }),
);

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/audit', auditRoutes);
app.route('/api/skills', skillRoutes);

export default app;
