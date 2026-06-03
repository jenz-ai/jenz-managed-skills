/**
 * Detector module: data-exfiltration sinks, secret-store access & staged
 * install→fetch→execute chains.
 *
 * Catches idioms that move local data/secrets off the machine (DNS exfil,
 * webhook/pastebin/bot-API POSTs, env-dump pipes) and credential-store reads
 * the core detector misses. Owned by agent `prefilter-exfil` — add rules + TDD
 * here only.
 *
 * Finding types (must exist in `@jenz/shared` taxonomy):
 *   exfiltration · credential-access · suspicious-download · untrusted-fetch
 *
 * NOTE: the core prefilter already emits `exfiltration` (critical) when a secret
 * path AND a network sink co-occur on one line, and `suspicious-download` for
 * curl|bash. Add rules for what the core MISSES; the composition root dedupes
 * exact (type,file,line) overlaps and keeps the highest severity.
 */

import type { RegexRule } from './types';

export const EXFIL_RULES: RegexRule[] = [];
