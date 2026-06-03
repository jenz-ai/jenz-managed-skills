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
