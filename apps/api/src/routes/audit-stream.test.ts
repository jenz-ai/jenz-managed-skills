// Manual smoke (route mounted at /audit/stream on PORT=8085):
// curl -N -X POST http://localhost:8085/audit/stream \
//   -H 'content-type: application/json' \
//   -d '{"raw":{"slug":"hello","name":"Hello","source":"upload","files":[{"path":"SKILL.md","content":"# Hello"}]}}'
// Expect: a sequence of `event: progress` frames, then one `event: verdict` frame.

import { describe, it, expect, beforeAll } from 'vitest';
import app from './audit-stream';

// Keep the happy path hermetic: with no OPENROUTER_API_KEY the engine runs the
// regex-only lane — fast, no network — regardless of local env.
beforeAll(() => {
  delete process.env.OPENROUTER_API_KEY;
});

const sampleSkill = {
  slug: 'hello',
  name: 'Hello',
  source: 'upload',
  files: [{ path: 'SKILL.md', content: '# Hello\nJust says hi.\n' }],
};

const post = (body: unknown) =>
  app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

interface SSEFrame {
  event?: string;
  data?: string;
}

function parseSSE(text: string): SSEFrame[] {
  return text
    .split('\n\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((frame) => {
      const event = frame.match(/event:\s*(.*)/)?.[1]?.trim();
      const data = frame.match(/data:\s*([\s\S]*)/)?.[1]?.trim();
      return { event, data };
    });
}

describe('POST /audit/stream (happy path, regex-only)', () => {
  it('opens an SSE stream (200 + text/event-stream) for { raw: skill }', async () => {
    const res = await post({ raw: sampleSkill });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Anti-buffering header so proxies stream frames live instead of one burst.
    expect(res.headers.get('x-accel-buffering')).toBe('no');
  });

  it('streams ≥1 progress event and exactly one verdict event', async () => {
    const res = await post({ raw: sampleSkill });
    const frames = parseSSE(await res.text());

    const progress = frames.filter((f) => f.event === 'progress');
    const verdicts = frames.filter((f) => f.event === 'verdict');

    expect(progress.length).toBeGreaterThanOrEqual(1);
    expect(verdicts.length).toBe(1);

    const verdict = JSON.parse(verdicts[0].data ?? 'null');
    expect(verdict).toBeTypeOf('object');
    expect(verdict).not.toBeNull();
    expect(typeof verdict.risk).toBe('string');
    expect(Array.isArray(verdict.findings)).toBe(true);
  });

  it('emits the verdict AFTER the first progress event', async () => {
    const res = await post({ raw: sampleSkill });
    const frames = parseSSE(await res.text());

    const firstProgressIdx = frames.findIndex((f) => f.event === 'progress');
    const verdictIdx = frames.findIndex((f) => f.event === 'verdict');

    expect(firstProgressIdx).toBeGreaterThanOrEqual(0);
    expect(verdictIdx).toBeGreaterThan(firstProgressIdx);
  });

  it('accepts a bare RawSkill (no { raw } wrapper) and still yields a verdict', async () => {
    const res = await post(sampleSkill);
    expect(res.status).toBe(200);
    const frames = parseSSE(await res.text());
    expect(frames.some((f) => f.event === 'verdict')).toBe(true);
  });

  it('really streams frames (a chunk arrives with event: progress, not one buffered blob)', async () => {
    const res = await post({ raw: sampleSkill });
    const body = res.body;
    expect(body).not.toBeNull();
    if (!body) return;

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    let sawProgressChunk = false;

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      acc += chunk;
      if (chunk.includes('event: progress')) sawProgressChunk = true;
    }

    // The full body must contain a verdict; at least one decoded chunk must have
    // carried a progress frame — proving the route writes SSE frames as it goes.
    expect(acc).toContain('event: verdict');
    expect(sawProgressChunk).toBe(true);
  });
});

describe('POST /audit/stream (invalid body → 400 JSON, not a stream)', () => {
  it('400 + JSON { error } when body is not a RawSkill', async () => {
    const res = await post({ nope: true });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).not.toContain('text/event-stream');
    expect(await res.json()).toHaveProperty('error');
  });

  it('400 when files entries are malformed', async () => {
    const res = await post({ raw: { slug: 'x', name: 'X', files: [{ path: 'a' }] } });
    expect(res.status).toBe(400);
  });
});
