import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { AuditedSkill } from '@jenz/shared';
import { sourceSchema, auditedShape, listShape } from './schemas.js';
import { submitSkill } from './tools/submit.js';
import { getSkill } from './tools/get.js';
import { listManagedSkills } from './tools/list.js';
import { pullSkill } from './tools/pull.js';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// Covers both connectivity failures and non-2xx API responses (api.ts throws on both),
// so the wording stays accurate either way.
const toolError = (e: unknown) => ({
  content: [{ type: 'text' as const, text: `jenz audit service error: ${msg(e)}` }],
  isError: true,
});
const verdictText = (v: AuditedSkill) =>
  `${v.name}: ${v.risk.toUpperCase()}` +
  (v.findings.length
    ? ` — ${v.findings.length} finding(s); e.g. ${v.findings[0].type} @ ${v.findings[0].file}:${v.findings[0].line}`
    : ' — no findings');

const server = new McpServer({ name: 'jenz-skills', version: '0.1.0' });

server.registerTool('submit_skill', {
  title: 'Submit a skill for audit',
  description:
    'Import a skill (github url or inline files) and run the open-weight security audit. ' +
    'Returns the verdict (risk + findings). Never returns files — use pull_skill for that.',
  inputSchema: { source: sourceSchema },
  outputSchema: auditedShape,
}, async ({ source }) => {
  try {
    const v = await submitSkill(source);
    return { content: [{ type: 'text', text: verdictText(v) }], structuredContent: v as unknown as Record<string, unknown> };
  } catch (e) { return toolError(e); }
});

server.registerTool('get_skill', {
  title: 'Get a skill verdict',
  description:
    'Fetch a skill\'s stored audit verdict + findings by id. Use when you have an id from a ' +
    'previous session and need to re-check its verdict. Does not return files.',
  inputSchema: { id: z.string() },
  outputSchema: auditedShape,
}, async ({ id }) => {
  try {
    const v = await getSkill(id);
    return { content: [{ type: 'text', text: verdictText(v) }], structuredContent: v as unknown as Record<string, unknown> };
  } catch (e) { return toolError(e); }
});

server.registerTool('list_managed_skills', {
  title: 'List managed skills',
  description: 'Browse/search the workspace skill library. Optional filters: category, risk, query.',
  inputSchema: {
    category: z.string().optional(),
    risk: z.enum(['pending', 'safe', 'suspicious', 'malicious']).optional(),
    query: z.string().optional(),
  },
  outputSchema: listShape,
}, async (filter) => {
  try {
    const res = await listManagedSkills(filter);
    const text = res.skills.length
      ? res.skills.map((s) => `• ${s.name} [${s.risk}] (${s.category})`).join('\n')
      : 'no skills found';
    return { content: [{ type: 'text', text }], structuredContent: res as unknown as Record<string, unknown> };
  } catch (e) { return toolError(e); }
});

// THE GATE. No outputSchema (two shapes); guarantee enforced in pullSkill() + tests.
server.registerTool('pull_skill', {
  title: 'Pull a vetted skill\'s files',
  description:
    'Retrieve a skill\'s files to install locally. Returns files ONLY if the skill passed ' +
    'the audit (risk=safe). Otherwise returns { ok:false } with no files — this is the gate, not an error.',
  inputSchema: { id: z.string() },
}, async ({ id }) => {
  try {
    const res = await pullSkill(id);
    const text = res.ok
      ? `SAFE — ${res.files.length} file(s) returned. ${res.hint}`
      : `BLOCKED — risk=${res.risk}. ${res.reason}. No files returned.`;
    return { content: [{ type: 'text', text }], structuredContent: res as unknown as Record<string, unknown> };
  } catch (e) { return toolError(e); }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[jenz-mcp] jenz-skills MCP server running on stdio');
}
main().catch((e) => { console.error('[jenz-mcp] fatal:', e); process.exit(1); });
