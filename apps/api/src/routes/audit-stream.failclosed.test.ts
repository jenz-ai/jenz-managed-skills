import { describe, it, expect, vi } from 'vitest';

// Mock the engine to emit one progress message then throw — simulates a model
// outage / unparseable output. The route MUST fail closed: progress + error, no
// verdict. Mock is hoisted above the app import by vi.mock.
vi.mock('../lib/audit', () => ({
  auditSkill: async (_raw: unknown, onProgress?: (m: string) => void) => {
    onProgress?.('prefilter: scanning skill bytes');
    throw new Error('model down');
  },
}));

import app from './audit-stream';

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

describe('POST /audit/stream (fail closed — engine throws)', () => {
  it('streams progress then an error event, and NEVER a verdict', async () => {
    const res = await post({ raw: sampleSkill });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const frames = parseSSE(await res.text());

    // It still streamed what it had before the throw.
    expect(frames.some((f) => f.event === 'progress')).toBe(true);

    // It signalled the failure as an error frame with a parseable { error }.
    const errors = frames.filter((f) => f.event === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(errors[0].data ?? 'null');
    expect(payload).toBeTypeOf('object');
    expect(payload).not.toBeNull();
    expect(typeof payload.error).toBe('string');

    // Fail closed: a thrown audit must NOT imply a safe/any verdict.
    expect(frames.some((f) => f.event === 'verdict')).toBe(false);
  });
});
