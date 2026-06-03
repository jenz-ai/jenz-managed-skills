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

// Per-agent CLI command, verbatim from skills-mcp.jsx CONFIG. The `\` + newline
// continuations are part of the on-screen copy.
function mcpCommand(agent: string, ws: string): string {
  const CONFIG: Record<string, string> = {
    claude: `claude mcp add jenz \\\n  -- npx -y @jenz/mcp --workspace ${ws}`,
    codex: `codex mcp add jenz \\\n  npx -y @jenz/mcp --workspace ${ws}`,
    openclaw: `openclaw connect jenz \\\n  --cmd "npx -y @jenz/mcp" --workspace ${ws}`,
    hermes: `hermes mcp:add jenz \\\n  "npx -y @jenz/mcp --workspace ${ws}"`,
  };
  return CONFIG[agent];
}

export function McpConnect({ workspace, connected, connectedAgent, onConnect }: McpConnectProps) {
  const [agent, setAgent] = useState<string>(connectedAgent || "claude");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const ws =
    (workspace || "workspace")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace";
  const cmd = mcpCommand(agent, ws);

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
