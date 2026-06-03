import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.MOCK_PORT) || 8787;
serve({ fetch: app.fetch, port }, () =>
  console.error(`[mock] jenz API on http://localhost:${port}`));
