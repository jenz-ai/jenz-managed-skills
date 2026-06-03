import { describe, it, expect } from 'vitest';
import app from './app';

describe('CORS', () => {
  it('answers an OPTIONS preflight with an Access-Control-Allow-Origin header', async () => {
    const res = await app.request('/api/skills/x', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://jenz.ai',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
  });

  it('sets CORS headers on a simple GET to /healthz', async () => {
    const res = await app.request('/healthz', {
      headers: { Origin: 'https://jenz.ai' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
  });
});

describe('route mounts (must be reachable on the real app, not just as sub-apps)', () => {
  it('mounts POST /audit/stream — reaches boundary validation (400), not 404', async () => {
    const res = await app.request('/audit/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    // A 404 here would mean the SSE route was never mounted in app.ts (the bug this fixes).
    expect(res.status).toBe(400);
  });

  it('mounts POST /audit — reaches boundary validation (400), not 404', async () => {
    const res = await app.request('/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });
});
