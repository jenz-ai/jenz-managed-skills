import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { listManagedSkills } from '../src/tools/list.js';

// A backend with NO GET /api/skills route — mirrors the live API, which only mounts
// import + /:id + /:id/files. A bare Hono returns 404 for the unmounted list route.
const bare = new Hono();
bare.get('/api/skills/:id', (c) => c.json({ error: 'not_found' }, 404));

let server: ReturnType<typeof serve>;
let originalApiEnv: string | undefined;

beforeAll(() => {
  originalApiEnv = process.env.JENZ_API;
  process.env.JENZ_API = 'http://localhost:8802/api';
  server = serve({ fetch: bare.fetch, port: 8802 });
});
afterAll(() => {
  if ('closeAllConnections' in server) server.closeAllConnections();
  server.close();
  process.env.JENZ_API = originalApiEnv;
});

describe('list_managed_skills degradation', () => {
  it('returns { available:false, skills:[] } (not an error) when the list route is missing', async () => {
    const res = await listManagedSkills({});
    expect(res.available).toBe(false);
    expect(res.skills).toEqual([]);
  });
});
