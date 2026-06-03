// Unit tests for the API client — fetch is mocked globally.
// RED first — implement api.ts to make these green.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  listSkills,
  getSkill,
  getSkillFiles,
  GateError,
  streamImport,
  parseSseFrames,
  type ListItem,
} from "./api";
import type { AuditedSkill, SkillFile } from "@jenz/shared";

// ---- helpers ----------------------------------------------------------------

function makeFetchMock(
  status: number,
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    body: null,
  });
}

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---- API_BASE ---------------------------------------------------------------

describe("API_BASE", () => {
  it("falls back to https://api.jenz.ai/api when VITE_API_BASE is not set", () => {
    // In the vitest env VITE_API_BASE is not defined, so the fallback is used.
    expect(API_BASE).toBe("https://api.jenz.ai/api");
  });
});

// ---- listSkills ------------------------------------------------------------

describe("listSkills", () => {
  it("GETs /skills and returns the .skills array", async () => {
    const items: ListItem[] = [
      { id: "1", name: "Foo", risk: "safe", category: "Ops", description: "desc", findingsCount: 0 },
    ];
    globalThis.fetch = makeFetchMock(200, { skills: items });
    const result = await listSkills();
    expect(result).toEqual(items);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      `${API_BASE}/skills`,
    );
  });

  it("appends query params when provided", async () => {
    globalThis.fetch = makeFetchMock(200, { skills: [] });
    await listSkills({ category: "Ops", risk: "safe", query: "foo" });
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("category=Ops");
    expect(url).toContain("risk=safe");
    expect(url).toContain("query=foo");
  });

  it("omits undefined params", async () => {
    globalThis.fetch = makeFetchMock(200, { skills: [] });
    await listSkills({ category: "Ops" });
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain("risk=");
    expect(url).not.toContain("query=");
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = makeFetchMock(500, { error: "server error" });
    await expect(listSkills()).rejects.toThrow();
  });
});

// ---- getSkill ---------------------------------------------------------------

describe("getSkill", () => {
  const skill: AuditedSkill & { id: string } = {
    id: "abc",
    slug: "my-skill",
    name: "My Skill",
    risk: "safe",
    findings: [],
    description: "desc",
    category: "Ops",
  };

  it("GETs /skills/:id and returns the body", async () => {
    globalThis.fetch = makeFetchMock(200, skill);
    const result = await getSkill("abc");
    expect(result).toEqual(skill);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      `${API_BASE}/skills/abc`,
    );
  });

  it("throws on 404", async () => {
    globalThis.fetch = makeFetchMock(404, { error: "not found" });
    await expect(getSkill("nope")).rejects.toThrow();
  });
});

// ---- getSkillFiles ----------------------------------------------------------

describe("getSkillFiles", () => {
  const files: SkillFile[] = [{ path: "SKILL.md", content: "# hi" }];

  it("returns .files array on 200", async () => {
    globalThis.fetch = makeFetchMock(200, { files });
    const result = await getSkillFiles("abc");
    expect(result).toEqual(files);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      `${API_BASE}/skills/abc/files`,
    );
  });

  it("throws GateError on 403 with risk and reason from the body", async () => {
    globalThis.fetch = makeFetchMock(403, { error: "blocked", risk: "malicious", reason: "exfil" });
    let caught: unknown;
    try {
      await getSkillFiles("abc");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GateError);
    const ge = caught as GateError;
    expect(ge.risk).toBe("malicious");
    expect(ge.reason).toBe("exfil");
  });

  it("throws a plain Error on other non-2xx (e.g. 500)", async () => {
    globalThis.fetch = makeFetchMock(500, { error: "server error" });
    await expect(getSkillFiles("abc")).rejects.toThrow(Error);
    // must NOT be a GateError
    await expect(getSkillFiles("abc")).rejects.not.toBeInstanceOf(GateError);
  });
});

// ---- parseSseFrames (pure, unit-tested separately) --------------------------

describe("parseSseFrames", () => {
  it("parses a progress frame", () => {
    const raw = "event: progress\ndata: {\"message\":\"scanning…\"}\n\n";
    const frames = parseSseFrames(raw);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ event: "progress", data: { message: "scanning…" } });
  });

  it("parses a verdict frame", () => {
    const verdict = {
      id: "abc",
      slug: "s",
      name: "Skill",
      risk: "safe",
      findings: [],
    };
    const raw = `event: verdict\ndata: ${JSON.stringify(verdict)}\n\n`;
    const frames = parseSseFrames(raw);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ event: "verdict", data: verdict });
  });

  it("parses multiple frames from a single buffer chunk", () => {
    const raw =
      "event: progress\ndata: {\"message\":\"a\"}\n\n" +
      "event: progress\ndata: {\"message\":\"b\"}\n\n";
    const frames = parseSseFrames(raw);
    expect(frames).toHaveLength(2);
    expect((frames[0].data as { message: string }).message).toBe("a");
    expect((frames[1].data as { message: string }).message).toBe("b");
  });

  it("skips frames with unparseable JSON (robust against malformed data)", () => {
    const raw = "event: progress\ndata: not-json\n\n";
    const frames = parseSseFrames(raw);
    expect(frames).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseSseFrames("")).toEqual([]);
  });

  it("ignores incomplete frames (no trailing double-newline)", () => {
    const raw = "event: progress\ndata: {\"message\":\"x\"}";
    expect(parseSseFrames(raw)).toHaveLength(0);
  });
});

// ---- streamImport -----------------------------------------------------------

describe("streamImport", () => {
  function makeStreamFetch(chunks: string[]) {
    // Build a ReadableStream from the string chunks
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
  }

  it("dispatches onProgress for progress events", async () => {
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    globalThis.fetch = makeStreamFetch([
      "event: progress\ndata: {\"message\":\"scanning…\"}\n\n",
    ]);
    await streamImport(
      { type: "inline", name: "test", files: [] },
      { onProgress, onVerdict, onError },
    );
    expect(onProgress).toHaveBeenCalledWith(0, "scanning…");
    expect(onVerdict).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispatches onDiscovered for the discovered event", async () => {
    const onDiscovered = vi.fn();
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    const skills = [
      { index: 0, slug: "a", name: "a" },
      { index: 1, slug: "b", name: "b" },
    ];
    globalThis.fetch = makeStreamFetch([
      `event: discovered\ndata: ${JSON.stringify({ total: 2, skills })}\n\n`,
    ]);
    await streamImport(
      { type: "github", url: "https://github.com/example/repo" },
      { onDiscovered, onProgress, onVerdict, onError },
    );
    expect(onDiscovered).toHaveBeenCalledWith(skills);
  });

  it("carries the skill index on progress and verdict events", async () => {
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    const verdict = { id: "z", slug: "z", name: "Z", risk: "safe", findings: [], index: 1 };
    globalThis.fetch = makeStreamFetch([
      "event: progress\ndata: {\"index\":1,\"message\":\"scanning skill 1\"}\n\n" +
        `event: verdict\ndata: ${JSON.stringify(verdict)}\n\n`,
    ]);
    await streamImport(
      { type: "github", url: "https://github.com/example/repo" },
      { onProgress, onVerdict, onError },
    );
    expect(onProgress).toHaveBeenCalledWith(1, "scanning skill 1");
    expect(onVerdict).toHaveBeenCalledWith(verdict);
  });

  it("dispatches onVerdict for verdict events", async () => {
    const verdict = { id: "x", slug: "x", name: "X", risk: "safe", findings: [] };
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    globalThis.fetch = makeStreamFetch([
      `event: verdict\ndata: ${JSON.stringify(verdict)}\n\n`,
    ]);
    await streamImport(
      { type: "inline", name: "test", files: [] },
      { onProgress, onVerdict, onError },
    );
    expect(onVerdict).toHaveBeenCalledWith(verdict);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("dispatches onError for error events", async () => {
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    globalThis.fetch = makeStreamFetch([
      "event: error\ndata: {\"error\":\"import failed\"}\n\n",
    ]);
    await streamImport(
      { type: "inline", name: "test", files: [] },
      { onProgress, onVerdict, onError },
    );
    expect(onError).toHaveBeenCalledWith(0, "import failed");
  });

  it("handles multiple frames across stream chunks", async () => {
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    const verdict = { id: "y", slug: "y", name: "Y", risk: "malicious", findings: [] };
    globalThis.fetch = makeStreamFetch([
      "event: progress\ndata: {\"message\":\"p1\"}\n\n",
      "event: progress\ndata: {\"message\":\"p2\"}\n\n" +
        `event: verdict\ndata: ${JSON.stringify(verdict)}\n\n`,
    ]);
    await streamImport(
      { type: "github", url: "https://github.com/example/repo" },
      { onProgress, onVerdict, onError },
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, "p1");
    expect(onProgress).toHaveBeenNthCalledWith(2, 0, "p2");
    expect(onVerdict).toHaveBeenCalledWith(verdict);
  });

  it("POSTs to /skills/import/stream with the source body and Accept: text/event-stream", async () => {
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    globalThis.fetch = makeStreamFetch([]);
    const source = { type: "inline" as const, name: "test", files: [] };
    await streamImport(source, { onProgress, onVerdict, onError });
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(`${API_BASE}/skills/import/stream`);
    expect(call[1].method).toBe("POST");
    expect(call[1].headers["Accept"]).toBe("text/event-stream");
    expect(JSON.parse(call[1].body)).toEqual({ source });
  });

  it("calls onError when the initial response is non-2xx", async () => {
    const onProgress = vi.fn();
    const onVerdict = vi.fn();
    const onError = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "bad request" }),
      body: null,
    });
    await streamImport(
      { type: "inline", name: "bad", files: [] },
      { onProgress, onVerdict, onError },
    );
    expect(onError).toHaveBeenCalledWith(0, "bad request");
  });
});
