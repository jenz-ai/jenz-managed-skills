/**
 * Layer-1 deterministic prefilter — the front gate of the audit pipeline.
 *
 * Scans skill bytes (markdown + scripts) line-by-line with a fixed set of
 * regex/Unicode detectors and emits `Finding[]` evidence BEFORE any LLM pass.
 * Pure and host-side: it never executes or obeys skill content, never calls
 * the network, and never mutates its input. Skill bytes are inert DATA.
 *
 * The regex constants below encode the false-positive / false-negative
 * boundary the product lives on — they are used verbatim and pinned by the
 * three canonical fixtures in `prefilter.test.ts`.
 */

import type { RawSkill, Finding, Severity } from '@jenz/shared';

// Filesystem paths to credentials/secret stores, plus well-known secret filenames.
const SECRET_PATH =
  /(?:~|\$HOME|\/root|\/home\/[^/\s]+)?\/?\.(?:ssh|aws\/credentials|aws|gnupg|netrc|kube\/config|config\/gcloud|docker\/config\.json)\b|\bid_(?:rsa|ed25519|dsa)\b|(?:Login Data|key4\.db|logins\.json|wallet\.dat|cookies\.sqlite)\b/i;

// Anything that can move bytes off the machine.
const NETWORK_SINK =
  /\b(?:curl|wget|nc|ncat|telnet|scp|sftp|Invoke-WebRequest|iwr|requests\.(?:post|get|put)|urllib|http\.client|socket\.)\b/i;

// Fetch a remote payload and pipe it straight into an interpreter.
const PIPE_TO_SHELL =
  /\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^\n|]*\|\s*(?:sudo\s+)?(?:bash|sh|zsh|ksh|python3?|perl|ruby|node|iex|Invoke-Expression)\b/i;

// Password-protected archive extraction — a classic staging primitive.
const PASSWORD_ARCHIVE = /\bunzip\s+-P\b|\b7z\s+x\b[^\n]*-p|\bgpg\b[^\n]*--passphrase/i;

// Irreversible / system-damaging commands and fork bombs.
const DESTRUCTIVE =
  /\brm\s+-[rf]{1,2}f?\s+(?:-[a-z]+\s+)*(?:\/|~|\$HOME|\$\{HOME\}|\*)(?:\s|$)|\bmkfs\.\w+|\bdd\b[^\n]*\bof=\/dev\/|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|\bchmod\s+-?R?\s*0?777\b|>\s*\/dev\/sd[a-z]/i;

// Prompt-injection: directives that try to override the agent's prior instructions.
const INSTRUCTION_OVERRIDE =
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:all\s+)?(?:previous|prior|earlier|above|the\s+system|your|any)\b[^.\n]{0,24}\b(?:instructions?|rules?|guidelines?|policy|policies|prompts?|directions?)\b|\byou\s+are\s+now\b[^.\n]{0,30}\b(?:DAN|unrestricted|jailbroken)\b/i;

// Long-lived credentials checked into the skill itself.
const HARDCODED_SECRET =
  /\bAKIA[0-9A-Z]{16}\b|\bghp_[0-9A-Za-z]{36}\b|\bgithub_pat_[0-9A-Za-z_]{22,}|\bxox[baprs]-[0-9A-Za-z-]{10,}|\bAIza[0-9A-Za-z\-_]{35}\b|-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/;

// Encoding/eval tricks used to hide intent from a reviewer.
const OBFUSCATION =
  /\bbase64\s+(?:-d|--decode|-D)\b|\|\s*base64\s+(?:-d|--decode)|\beval\s*\(|\bexec\s*\(|\$\(\s*(?:echo|printf)\s+[A-Za-z0-9+/=]{20,}|(?:\\x[0-9a-fA-F]{2}){4,}/i;

// Fetching and (implicitly) sourcing remote script/instruction files.
const UNTRUSTED_FETCH =
  /\b(?:curl|wget|fetch|source|Invoke-WebRequest|iwr|git\s+clone)\b[^\n]*https?:\/\/[^\s'"]+\.(?:md|markdown|sh|bash|py|ps1|rb|ya?ml)\b/i;

// Zero-width and bidi-control characters used to smuggle hidden text.
const HIDDEN_UNICODE = /[​-‍⁠﻿‪-‮⁦-⁩\u{E0000}-\u{E007F}]/u;

const MAX_QUOTE = 200;

/** Trim a line and cap it to MAX_QUOTE chars, appending an ellipsis when truncated. */
function toQuote(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MAX_QUOTE ? trimmed.slice(0, MAX_QUOTE) + '…' : trimmed;
}

/**
 * Run the Layer-1 detectors over every line of every file in `raw` and return
 * the evidence as `Finding[]`. Pure: the input is never mutated.
 */
export function prefilter(raw: RawSkill): Finding[] {
  const findings: Finding[] = [];

  for (const file of raw.files) {
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;

      const push = (type: string, severity: Severity): void => {
        findings.push({
          type,
          severity,
          file: file.path,
          line: lineNo,
          quote: toQuote(line),
          detector: 'regex',
        });
      };

      if (INSTRUCTION_OVERRIDE.test(line)) push('instruction-override', 'high');
      if (HIDDEN_UNICODE.test(line)) push('hidden-unicode', 'medium');

      // Secret access — exfiltration (secret + network sink on one line) outranks plain credential access.
      if (SECRET_PATH.test(line) && NETWORK_SINK.test(line)) {
        push('exfiltration', 'critical');
      } else if (SECRET_PATH.test(line)) {
        push('credential-access', 'high');
      }

      if (PIPE_TO_SHELL.test(line)) push('suspicious-download', 'high');
      if (PASSWORD_ARCHIVE.test(line)) push('suspicious-download', 'high');
      if (DESTRUCTIVE.test(line)) push('destructive-cmd', 'high');
      if (HARDCODED_SECRET.test(line)) push('hardcoded-secret', 'high');
      if (OBFUSCATION.test(line)) push('obfuscation', 'medium');

      // An untrusted fetch already counted as pipe-to-shell shouldn't double-fire.
      if (!PIPE_TO_SHELL.test(line) && UNTRUSTED_FETCH.test(line)) {
        push('untrusted-fetch', 'medium');
      }
    }
  }

  return findings;
}
