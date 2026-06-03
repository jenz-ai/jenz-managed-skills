// MCP connect block — add the Jenz MCP server to a CLI agent so it pushes its
// skills into Jenz directly (no folder hunting) and routes new installs through
// the audit first. Used inline in the onboarding import step or as its own step.
// Ported node-for-node from skills-mcp.jsx (SPEC §6). Copy: 1400ms; check: 1700ms.
import { useState } from "react";
import { SIcon } from "./SIcon";
import { SourceBadge } from "./SourceBadge";

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
    <div className="mcp">
      <div className="mcp-head">
        <span className="mcp-ico"><SIcon name="terminal" size={17} /></span>
        <div className="mcp-head-body">
          <div className="mcp-title">Connect a CLI agent <span className="mcp-pill">MCP</span></div>
          <div className="mcp-sub">
            Your agent has filesystem access, so it can push its skills into Jenz directly — no folder hunting.
            It’ll also route any new skills it installs through Jenz to be checked first.
          </div>
        </div>
      </div>

      <div className="mcp-tabs">
        {AG.map((a) => (
          <button key={a.id} className={"mcp-tab" + (agent === a.id ? " on" : "")} onClick={() => setAgent(a.id)}>
            <SourceBadge kind={a.id} sm />
            <span>{a.name}</span>
            {connected && connectedAgent === a.id && <span className="mcp-tab-dot" />}
          </button>
        ))}
      </div>

      <div className="mcp-cmd">
        <div className="mcp-cmd-bar">
          <span className="mcp-cmd-label">run in your terminal</span>
          <button className="mcp-copy" onClick={copy}>
            <SIcon name={copied ? "check" : "copy"} size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="mcp-cmd-body">{cmd}</pre>
      </div>

      <div className={"mcp-status" + (connected ? " ok" : "")}>
        {connected ? (
          <>
            <span className="ms-dot ok" />
            <span><b>{AG.find((a) => a.id === connectedAgent)?.name || "Agent"}</b> connected — its skills were pushed to Jenz.</span>
          </>
        ) : checking ? (
          <>
            <SIcon name="refresh" size={14} className="spin" />
            <span>Listening for your agent…</span>
          </>
        ) : (
          <>
            <span className="ms-dot" />
            <span>Waiting for connection.</span>
            <button className="mcp-check" onClick={check}>Check connection</button>
          </>
        )}
      </div>
    </div>
  );
}

export default McpConnect;
