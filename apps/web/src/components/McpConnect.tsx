// MCP connect block — add the Jenz MCP server to a CLI agent so it pushes its
// skills into Jenz directly (no folder hunting) and routes new installs through
// the audit first. Rebuilt FLAT to live inside the onboarding ob-card as plain
// sections separated by spacing/hairlines — no nested bordered card. The agent
// picker is a Radix segmented control; one terminal command inset; one status
// row. Copy: 1400ms; check: 1700ms (timers unchanged).
import { useState } from "react";
import { SIcon } from "./SIcon";
import { Segmented } from "./Segmented";

interface McpConnectProps {
  workspace?: string;
  connected: boolean;
  connectedAgent: string | null;
  onConnect: (agent: string) => void;
}

const AG = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "openclaw", name: "OpenClaw" },
  { id: "hermes", name: "Hermes" },
];

// Canonical Jenz MCP base — verified live by Remi (api.jenz.ai). The package is
// @jenz-ai/skills-mcp on npm; the server reads its API from the JENZ_API env, so
// the command is workspace-agnostic (the API is open, no token).
const JENZ_API = "https://api.jenz.ai/api";

// Per-agent CLI command. The `\` + newline continuations are part of the
// on-screen copy. Claude form is Remi-verified; others mirror the same
// `-e JENZ_API … -- npx -y @jenz-ai/skills-mcp` shape per agent CLI.
function mcpCommand(agent: string): string {
  const CONFIG: Record<string, string> = {
    claude: `claude mcp add jenz-skills \\\n  -e JENZ_API=${JENZ_API} \\\n  -- npx -y @jenz-ai/skills-mcp`,
    codex: `codex mcp add jenz-skills \\\n  --env JENZ_API=${JENZ_API} \\\n  -- npx -y @jenz-ai/skills-mcp`,
    openclaw: `openclaw connect jenz-skills \\\n  --env JENZ_API=${JENZ_API} \\\n  --cmd "npx -y @jenz-ai/skills-mcp"`,
    hermes: `hermes mcp:add jenz-skills \\\n  --env JENZ_API=${JENZ_API} \\\n  -- npx -y @jenz-ai/skills-mcp`,
  };
  return CONFIG[agent];
}

export function McpConnect({ connected, connectedAgent, onConnect }: McpConnectProps) {
  const [agent, setAgent] = useState<string>(connectedAgent || "claude");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const cmd = mcpCommand(agent);

  const copy = () => {
    try {
      navigator.clipboard.writeText(cmd);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const check = () => {
    if (checking || connected) return;
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      onConnect(agent);
    }, 1700);
  };

  return (
    <div className="ob-mcp">
      <Segmented
        value={agent}
        onValueChange={setAgent}
        items={AG.map((a) => ({
          id: a.id,
          label: a.name,
          badge: connected && connectedAgent === a.id ? <span className="ob-seg-dot" /> : undefined,
        }))}
      />

      <div className="ob-mcp-cmd">
        <div className="ob-mcp-cmd-bar">
          <span className="ob-mcp-cmd-label">run in your terminal</span>
          <button className="ob-mcp-copy" onClick={copy}>
            <SIcon name={copied ? "check" : "copy"} size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="ob-mcp-cmd-body">{cmd}</pre>
      </div>

      <div className={"ob-mcp-status" + (connected ? " ok" : "")}>
        {connected ? (
          <>
            <span className="ob-mcp-dot ok" />
            <span><b>{AG.find((a) => a.id === connectedAgent)?.name || "Agent"}</b> connected — its skills were pushed to Jenz.</span>
          </>
        ) : checking ? (
          <>
            <SIcon name="refresh" size={14} className="spin" />
            <span>Listening for your agent…</span>
          </>
        ) : (
          <>
            <span className="ob-mcp-dot" />
            <span>Waiting for connection.</span>
            <button className="ob-mcp-check" onClick={check}>Check connection</button>
          </>
        )}
      </div>
    </div>
  );
}

export default McpConnect;
