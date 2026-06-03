// Load apps/api/.env (gitignored) into process.env BEFORE app/routes init, so
// local `tsx src/index.ts` runs on real keys (OPENROUTER_API_KEY etc.). A no-op
// in prod (Railway injects env directly; dotenv never overrides existing vars).
import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './app';

const port = Number(process.env.PORT) || 8080;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@jenz/api listening on http://localhost:${info.port}`);
});

export default app;
