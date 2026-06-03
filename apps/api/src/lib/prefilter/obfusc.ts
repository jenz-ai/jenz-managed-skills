/**
 * Detector module: obfuscation & hidden-character smuggling.
 *
 * Catches base64/hex/escaped-byte concealment of executable intent, plus
 * homoglyph / mixed-script / zero-width / bidi tricks used to hide text from a
 * human reviewer. Owned by agent `prefilter-obfusc` — add rules + TDD here only.
 *
 * Finding types (must exist in `@jenz/shared` taxonomy):
 *   obfuscation · hidden-unicode
 *
 * NOTE: the core prefilter (`../prefilter.ts`, const OBFUSCATION) already emits
 * `obfuscation` for: `base64 -d/--decode/-D`, `| base64 -d`, bare `eval(`,
 * `exec(`, `$(echo|printf <b64>)`, and escaped-hex runs `(\x..){4,}`; const
 * HIDDEN_UNICODE already covers zero-width + bidi-control characters. The rules
 * below add what the core MISSES — decode-AND-execute idioms across JS / Python
 * / PowerShell, char-code & string-building construction, dangerous-token
 * concatenation, and homoglyph / mixed-script disguises. The composition root
 * dedupes exact (type,file,line,quote) overlaps and keeps the highest severity.
 *
 * Severity discipline (LOCKED `scoreRisk()`: any medium/high ⇒ suspicious,
 * critical ⇒ malicious, ≥2 high ⇒ malicious): a bare encoded blob (a data URI,
 * a base64 env value, a git SHA, a plain hex colour) is NOT an attack on its
 * own and MUST stay clean. We only fire when an encoded payload is paired with
 * a decode-then-execute idiom, or when characters/strings are assembled to hide
 * a known dangerous token. `high` is reserved for unambiguous hidden code
 * execution (decode → shell/eval); construction-only tricks are `medium`.
 */

import type { RegexRule } from './types';

// Interpreters / execution sinks an encoded blob can be decoded straight into.
// Used as the "execute" half of decode-AND-execute rules below.
const EXEC_SINK = String.raw`(?:eval|exec|os\.system|subprocess\.\w+|sh|bash|zsh|node|python3?|perl|ruby|IEX|Invoke-Expression|spawn|child_process)`;

export const OBFUSC_RULES: RegexRule[] = [
  // ── base64 decode-AND-EXECUTE (the core only catches CLI `base64 -d`) ──

  // JS: atob('…') fed into eval(...) or new Function(...). Hidden code execution
  // via the browser/node base64 decoder. high — clear decode→eval on one line.
  // e.g.  eval(atob('Y3VybC...'))   |   new Function(atob(x))()
  {
    type: 'obfuscation',
    severity: 'high',
    match: /\b(?:eval|Function)\s*\([^\n]*\batob\s*\(|\batob\s*\([^\n]*\)[^\n]*\b(?:eval|Function)\s*\(/i,
  },

  // JS: Buffer.from(<x>, 'base64').toString(...) whose decoded output is then
  // handed to a shell/exec sink on the same line. high — decode→execute.
  // e.g.  exec(Buffer.from('Y3VybA==','base64').toString())
  {
    type: 'obfuscation',
    severity: 'high',
    match: new RegExp(
      String.raw`\bBuffer\.from\s*\([^\n]*['"]base64['"][^\n]*\)\s*\.toString\b[^\n]*\b` + EXEC_SINK + String.raw`\b|` +
        String.raw`\b` + EXEC_SINK + String.raw`\s*\([^\n]*\bBuffer\.from\s*\([^\n]*['"]base64['"]`,
      'i',
    ),
  },

  // Python: base64.b64decode(…) / b64decode(…) whose output is run via
  // exec/os.system/subprocess. high — decode→execute.
  // e.g.  exec(base64.b64decode('aW1wb3J0...'))  |  os.system(b64decode(x))
  {
    type: 'obfuscation',
    severity: 'high',
    match: new RegExp(
      String.raw`\b(?:base64\.)?b64decode\s*\([^\n]*\)[^\n]*\b` + EXEC_SINK + String.raw`\b|` +
        String.raw`\b` + EXEC_SINK + String.raw`\s*\([^\n]*\b(?:base64\.)?b64decode\s*\(`,
      'i',
    ),
  },

  // PowerShell: [Convert]::FromBase64String(...) piped/fed into IEX
  // (Invoke-Expression) — the canonical PowerShell encoded-command attack. high.
  // e.g.  IEX ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)))
  {
    type: 'obfuscation',
    severity: 'high',
    match: /\[Convert\]::FromBase64String[^\n]*\b(?:IEX|Invoke-Expression)\b|\b(?:IEX|Invoke-Expression)\b[^\n]*\[Convert\]::FromBase64String/i,
  },

  // PowerShell: powershell -EncodedCommand <blob> — base64-encoded script payload
  // passed directly to the interpreter. high — hidden code execution.
  // e.g.  powershell.exe -EncodedCommand SQBFAFgA...
  {
    type: 'obfuscation',
    severity: 'high',
    match: /\b(?:powershell(?:\.exe)?|pwsh)\b[^\n]*\s-(?:e|ec|enc|encodedcommand)\b/i,
  },

  // Shell: printf/echo of a base64 blob piped through `base64 ... | sh|bash`, or
  // macOS capital `base64 -D` piped into a shell. high — decode→execute. The
  // core catches `| base64 -d`; it does NOT catch `-D` (macOS) piped to a shell.
  // e.g.  printf 'Y3VybC...' | base64 -D | bash
  {
    type: 'obfuscation',
    severity: 'high',
    match: /\bbase64\s+(?:-d|-D|--decode)\b[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|ksh|python3?|perl|ruby|node)\b/i,
  },

  // ── char-code / escape-run construction (build a string from raw codes) ──

  // String.fromCharCode(<many ints>) — JS char-code construction of a hidden
  // string/command. medium — construction only; require ≥4 numeric args so a
  // lone fromCharCode(10) in legit code stays clean.
  // e.g.  String.fromCharCode(99,117,114,108)  → "curl"
  {
    type: 'obfuscation',
    severity: 'medium',
    match: /\bString\.fromCharCode\s*\(\s*\d+\s*(?:,\s*\d+\s*){3,}\)/,
  },

  // Python chr()-join construction: ''.join(chr(x) for ...) or chr(..)+chr(..)+…
  // building a string from code points. medium — construction only. Scoped to a
  // join-over-chr or a run of ≥3 chr(int) so a prose mention of `chr` stays clean.
  // e.g.  ''.join(chr(c) for c in [99,117,114,108])  |  chr(99)+chr(117)+chr(114)
  {
    type: 'obfuscation',
    severity: 'medium',
    match: /\.join\s*\([^\n]*\bchr\s*\(|\bchr\s*\(\s*\d+\s*\)\s*\+\s*chr\s*\(\s*\d+\s*\)\s*\+\s*chr\s*\(/i,
  },

  // Long \uXXXX escape runs (≥4) — Unicode-escape concealment of text the core's
  // \xXX rule misses. medium. Targets ESCAPE SEQUENCES, never plain hex digits.
  // e.g.  "curl"  → "curl"
  {
    type: 'obfuscation',
    severity: 'medium',
    match: /(?:\\u[0-9a-fA-F]{4}){4,}/,
  },

  // Long octal \NNN escape runs (≥4) — octal-escape concealment. medium.
  // Targets backslash-octal escapes, not arbitrary numbers.
  // e.g.  "\143\165\162\154"  → "curl"
  {
    type: 'obfuscation',
    severity: 'medium',
    match: /(?:\\[0-3]?[0-7]{1,2}){4,}/,
  },

  // ── string-split concatenation assembling a KNOWN dangerous token ──
  // Predicate: strip quotes+`+` joins and check whether the concatenation
  // assembles one of a small set of dangerous tokens (curl/wget/bash/sh/eval/
  // exec/.ssh/credentials/rm -rf). Scoped to a KNOWN token so arbitrary "a"+"b"
  // stays clean; requires the line to actually contain a quote-plus-quote join.
  {
    type: 'obfuscation',
    severity: 'medium',
    match: (line: string): boolean => {
      // Must look like string concatenation: '…' + '…' or "…" + "…".
      if (!/['"][^'"]*['"]\s*\+\s*['"][^'"]*['"]/.test(line)) return false;
      // Reconstruct the joined literal: drop quotes and the `+` between them.
      const joined = line.replace(/['"]\s*\+\s*['"]/g, '');
      const tokens = joined.match(/['"]([^'"]*)['"]/g) ?? [];
      for (const tok of tokens) {
        const inner = tok.slice(1, -1).toLowerCase();
        if (/(?:curl|wget|bash|\/bin\/sh|eval|exec|\.ssh|credentials|rm\s+-rf|nc\s|ncat)/.test(inner)) {
          return true;
        }
      }
      return false;
    },
  },

  // ── homoglyph / mixed-script disguise (PREDICATE) ──
  // Flag an alphabetic token that mixes ASCII-Latin letters with confusable
  // Cyrillic (U+0400–U+04FF) or Greek (U+0370–U+03FF) homoglyphs inside ONE word
  // — the classic trick to disguise `curl`, `bash`, `eval`, `ignore` so a human
  // skims past them. medium. Norwegian/accented Latin (æøåé, Latin Extended) is
  // NOT in these ranges, so legit Nordic prose stays clean.
  {
    type: 'hidden-unicode',
    severity: 'medium',
    match: (line: string): boolean => {
      // Tokenise on whitespace and common code/markdown punctuation; inspect each
      // word for co-occurring ASCII-Latin + Cyrillic/Greek letters.
      const tokens = line.split(/[\s/\\.,;:()[\]{}<>"'`|=*#-]+/);
      for (const token of tokens) {
        if (token.length < 2) continue;
        const hasAsciiLatin = /[A-Za-z]/.test(token);
        const hasConfusable = /[Ѐ-ӿͰ-Ͽ]/.test(token);
        if (hasAsciiLatin && hasConfusable) return true;
      }
      return false;
    },
  },
];
