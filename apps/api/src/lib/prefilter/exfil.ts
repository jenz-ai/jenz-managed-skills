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
 *
 * Severity discipline (host's LOCKED scoreRisk turns ANY critical→malicious,
 * ≥2 high→malicious, ANY high→suspicious, ANY medium→suspicious): `critical` is
 * reserved for an unambiguous local-secret/state SOURCE piped to a network SINK
 * on one line. Everything else is `high`. Every rule is anchored so a bare
 * network sink, a plain install, or a normal API POST never fires — a curl
 * alone is NOT enough; we require the known exfil host, the source→sink pipe,
 * the OOB command-substitution, or the install+fetch+exec chain.
 */

import type { RegexRule } from './types';

// ── Known data-collection / OOB sink hosts ──────────────────────────────────
// Presence of one of these hosts on a request line is itself the signal: these
// are throwaway collectors with no legitimate place in a declared deploy. Host
// match alone, no secret needed on the line. (api.fly.io / api.github.com /
// api.render.com etc. are NOT here, so the canonical benign deploy stays clean.)
const SINK_HOST =
  /\b(?:api\.telegram\.org\/bot[^/\s]+\/send|discord(?:app)?\.com\/api\/webhooks\/|pastebin\.com|hastebin\.com|paste\.ee|transfer\.sh|0x0\.st|(?:[a-z0-9-]+\.)?(?:m\.)?pipedream\.net|(?:[a-z0-9-]+\.)?requestbin\.(?:net|com)|requestbin\.io|webhook\.site|[a-z0-9-]+\.ngrok(?:\.io|-free\.app)|burpcollaborator\.net|\.oast\.(?:fun|live|me|pro|online|site)|oastify\.com|interact\.sh)/i;

// A request reaching one of those hosts via any HTTP fetch/transfer tool.
const SINK_EXFIL = new RegExp(
  String.raw`\b(?:curl|wget|nc|ncat|http|fetch|Invoke-WebRequest|iwr|nslookup|dig|host)\b[^\n]*` +
    SINK_HOST.source,
  'i',
);

// ── DNS / OOB exfil via command substitution in the hostname ────────────────
// The hostname is *built* from a `$(…)` / backtick command — data smuggled out
// through DNS or an OOB request. A plain `dig example.com` has no substitution
// and stays clean.
const CMD_SUBST = String.raw`(?:\$\((?:[^()]|\$\([^()]*\))*\)|` + '`[^`]+`' + String.raw`)`;
const DNS_OOB_EXFIL = new RegExp(
  String.raw`\b(?:nslookup|dig|host|ping|curl|wget|nc)\b[^\n]*` + CMD_SUBST + String.raw`[^\n]*\.[a-z]`,
  'i',
);
// curl/ping to an URL whose host begins with a command substitution: http://$(…).evil
const CMD_SUBST_HOST = new RegExp(
  String.raw`\b(?:curl|wget|ping|nc)\b[^\n]*(?:https?:\/\/|\s)` + CMD_SUBST + String.raw`\.[a-z]`,
  'i',
);

// ── Local secret/state SOURCE piped to a network SINK on one line (critical) ─
// A clear local-data source (env dump, shell history, clipboard, .env) feeding a
// network tool on the same line = compromise. `env | grep PATH` has no sink and
// stays clean; the canonical benign line has no such source.
const SECRET_SOURCE =
  /(?:^|[;&|]|\b(?:sudo|then|do)\s+)\s*(?:env|printenv|set|history)\b|\bcat\b[^\n|]*(?:\.env\b|\.bash_history\b|\.zsh_history\b|\/\.history\b|\.netrc\b)|\bpbpaste\b|\bxclip\b[^\n]*-o\b/i;
const PIPED_NETWORK_SINK =
  /\|\s*(?:sudo\s+)?(?:curl|wget|nc|ncat|telnet|http|Invoke-WebRequest|iwr)\b/i;
const SOURCE_TO_SINK = (line: string): boolean =>
  SECRET_SOURCE.test(line) && PIPED_NETWORK_SINK.test(line);

// ── Credential-store reads the core SECRET_PATH misses (high) ───────────────
// Package/VCS/cloud cred files + OS keychain/secret-store CLIs + browser cred
// DBs. Anchored to a read/copy context or a CLI verb so a mere mention is
// unlikely; the core already covers ~/.ssh, ~/.aws, ~/.docker/config.json, etc.
const CRED_STORE_PATH =
  /(?:~|\$HOME|\/root|\/home\/[^/\s]+)?\/?\.(?:npmrc|git-credentials|pypirc|terraformrc|netrc\b)|\bgh\/hosts\.ya?ml\b|\bLogin Data\b|\bcookies\.sqlite\b|\bkey4\.db\b/i;
const CRED_STORE_CLI =
  /\bsecurity\s+find-(?:generic|internet)-password\b|\bcmdkey\s+\/list\b|\bsecret-tool\s+(?:lookup|search)\b|\bgnome-keyring\b/i;
const CRED_ACCESS = (line: string): boolean => CRED_STORE_PATH.test(line) || CRED_STORE_CLI.test(line);

// ── Remote-fetch execution the core PIPE_TO_SHELL misses (high) ─────────────
// Process substitution `bash <(curl …)`, eval of a fetch `eval "$(curl …)"`,
// `python -c "$(curl …)"`, and PowerShell IEX download-string. The core only
// catches the `curl … | bash` pipe form.
const PROC_SUBST_EXEC =
  /(?:\b(?:bash|sh|zsh|ksh|source|eval)\b|(?:^|[;&|]\s*)\.)\s*<\(\s*(?:curl|wget|fetch|iwr|Invoke-WebRequest)\b/i;
const EVAL_REMOTE_FETCH =
  /\b(?:eval|python3?\s+-c|ruby\s+-e|perl\s+-e|node\s+-e)\b[^\n]*(?:\$\(|`)\s*(?:curl|wget|fetch|iwr|Invoke-WebRequest)\b/i;
const IEX_DOWNLOAD =
  /\b(?:iex|Invoke-Expression)\b[^\n]*\b(?:iwr|Invoke-WebRequest|New-Object\s+Net\.WebClient|DownloadString|wget)\b|\b(?:New-Object\s+Net\.WebClient[^\n]*DownloadString|DownloadString\([^\n]*\bhttps?:)/i;
const REMOTE_EXEC = (line: string): boolean =>
  PROC_SUBST_EXEC.test(line) || EVAL_REMOTE_FETCH.test(line) || IEX_DOWNLOAD.test(line);

// ── Single-line staged install → fetch → execute chains (high) ──────────────
// An install step chained (`&&` / `;`) to a remote fetch that is then executed
// (piped to a shell, or wrapped in exec/eval). A plain `npm install` or an
// install followed by a normal command has no fetch-then-exec and stays clean.
const INSTALL_STEP =
  /\b(?:npm\s+(?:install|i|add)|yarn\s+add|pnpm\s+(?:install|add)|pip3?\s+install|pipx\s+install|gem\s+install|apt(?:-get)?\s+install|brew\s+install|cargo\s+install|go\s+install)\b/i;
const FETCH_THEN_EXEC =
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:bash|sh|zsh|python3?|perl|ruby|node)\b|\b(?:python3?|ruby|perl|node)\b[^\n]*\b(?:exec|eval)\s*\(\s*[^\n]*(?:urlopen|urllib|requests\.get|fetch|Net::HTTP|open-uri)/i;
const INSTALL_FETCH_EXEC = (line: string): boolean => {
  if (!INSTALL_STEP.test(line)) return false;
  if (!/[;&]/.test(line)) return false; // must be a chain, not a bare install
  return FETCH_THEN_EXEC.test(line);
};

export const EXFIL_RULES: RegexRule[] = [
  // Exfil to a known throwaway sink / OOB collector — host presence is the signal.
  { type: 'exfiltration', severity: 'high', match: SINK_EXFIL },
  // DNS / OOB exfil: a command-substitution payload smuggled into the hostname.
  { type: 'exfiltration', severity: 'high', match: DNS_OOB_EXFIL },
  { type: 'exfiltration', severity: 'high', match: CMD_SUBST_HOST },
  // Local secret/state SOURCE piped to a network SINK on one line — compromise.
  { type: 'exfiltration', severity: 'critical', match: SOURCE_TO_SINK },
  // Credential-store reads the core SECRET_PATH misses (npmrc, git-credentials,
  // keychain CLIs, browser cred DBs, …).
  { type: 'credential-access', severity: 'high', match: CRED_ACCESS },
  // Remote-fetch execution via process-substitution / eval / IEX download-string.
  { type: 'suspicious-download', severity: 'high', match: REMOTE_EXEC },
  // Staged install → remote-fetch → execute on a single line.
  { type: 'suspicious-download', severity: 'high', match: INSTALL_FETCH_EXEC },
];
