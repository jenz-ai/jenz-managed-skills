// Onboarding wizard (SPEC §6) — the app's first-paint entry. Jenz runs in the
// browser and can't reach the user's machine, so skills are either uploaded
// (folder picker scanning for SKILL.md), pulled from a GitHub repo, or pushed
// in by a CLI agent over MCP. Steps: name → import → (mcp if placement=step) →
// review → audit. Ported node-for-node from skills-onboarding.jsx.
//
// App.tsx passes only { onImport: startImport }; importLayout/mcpPlacement use
// their defaults ("per-tool"/"inline"). onImport(total) jumps to the audit.
//
// The pure branching (steps array), the SKILL.md folder scan, the GitHub
// repo-label parse, and the staged `total` count live in onboardingLogic.ts and
// are unit-tested in onboardingLogic.test.ts.
import { useRef, useState, type ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import { SourceBadge } from "../components/SourceBadge";
import { McpConnect } from "../components/McpConnect";
import {
  onboardingSteps,
  parseRepoLabel,
  scanSkillDirs,
  totalSkills,
  type McpPlacement,
  type StagedGroup,
} from "./onboardingLogic";

interface OnboardingProps {
  onImport: (total: number) => void;
  importLayout?: "per-tool" | "drop";
  mcpPlacement?: McpPlacement;
}

const TOOLS = [
  { id: "claude", name: "Claude Code", path: "~/.claude/skills" },
  { id: "codex", name: "Codex", path: "~/.codex/skills" },
  { id: "openclaw", name: "OpenClaw", path: "~/.openclaw/skills" },
  { id: "hermes", name: "Hermes", path: "~/.hermes/skills" },
];

const SKILL_POOL = [
  "narrative-arc", "competitor-diff", "weekly-memo", "trend-scan", "cold-open",
  "follow-up", "headline-3up", "pr-review", "standup-digest", "changelog-watcher",
  "invoice-ocr", "slack-digest", "lead-scorer", "release-notes", "persona-map",
  "tone-check",
];

function Onboarding({
  onImport,
  importLayout = "per-tool",
  mcpPlacement = "inline",
}: OnboardingProps) {
  const [name, setName] = useState("Bicone");
  const [groups, setGroups] = useState<StagedGroup[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [mcp, setMcp] = useState<{ connected: boolean; agent: string | null }>({
    connected: false,
    agent: null,
  });
  const [routeThrough, setRouteThrough] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);

  const folderRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<{ label: string | null; sub: string } | null>(null);
  const gidRef = useRef(0);

  const steps = onboardingSteps(mcpPlacement);
  const stepId = steps[Math.min(stepIdx, steps.length - 1)];
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));

  // Deterministic skill-name generator — a synthetic pool indexed off a seed.
  const mint = (seed: string, n: number) => {
    const start =
      Math.abs([...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0)) % SKILL_POOL.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ id: "sk-" + gidRef.current++ + "-" + i, name: SKILL_POOL[(start + i) % SKILL_POOL.length] });
    }
    return out;
  };

  const addGroup = (g: Omit<StagedGroup, "id">) =>
    setGroups((prev) => [...prev, { id: "grp-" + gidRef.current++, ...g }]);
  const removeGroup = (id: string) =>
    setGroups((prev) => prev.filter((g) => g.id !== id));
  const removeSkill = (gid: string, sid: string) =>
    setGroups((prev) =>
      prev
        .map((g) => (g.id === gid ? { ...g, skills: g.skills.filter((s) => s.id !== sid) } : g))
        .filter((g) => g.skills.length > 0),
    );

  const total = totalSkills(groups);

  const openFolder = (label: string | null, sub: string) => {
    pendingRef.current = { label, sub };
    folderRef.current && folderRef.current.click();
  };
  const onFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const meta = pendingRef.current || { label: null, sub: "" };
    pendingRef.current = null;
    if (!files.length) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const root = (first.webkitRelativePath || first.name).split("/")[0] || "skills";
    const paths = files.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    const names = scanSkillDirs(paths, root);
    const skills = names.length
      ? names.map((n) => ({ id: "sk-" + gidRef.current++ + "-" + n, name: n }))
      : mint(root, Math.min(Math.max(files.length, 1), 4));
    addGroup({ kind: "upload", label: meta.label || root, sub: meta.sub || root + "/", skills });
  };

  const addRepo = () => {
    const url = repoUrl.trim();
    if (!url) return;
    const label = parseRepoLabel(url);
    if (groups.some((g) => g.kind === "github" && g.label === label)) {
      setRepoUrl("");
      return;
    }
    addGroup({
      kind: "github",
      label,
      sub: "github repo",
      skills: mint(label, (Math.abs([...label].reduce((a, c) => a + c.charCodeAt(0), 0)) % 4) + 1),
    });
    setRepoUrl("");
  };

  const onMcpConnect = (agent: string) => {
    setMcp({ connected: true, agent });
    const label = (TOOLS.find((t) => t.id === agent) || {}).name || agent;
    if (!groups.some((g) => g.kind === "mcp" && g.agent === agent)) {
      addGroup({ kind: "mcp", agent, label, sub: "pushed via MCP", skills: mint("mcp" + agent, 4) });
    }
  };

  // ---- staged groups list (shared) ----
  const StagedList = ({ removableSkills }: { removableSkills?: boolean }) => {
    if (!groups.length) return null;
    return (
      <div className="jso-staged">
        {groups.map((g) => (
          <div className="jso-grp" key={g.id}>
            <div className="jso-grp-head">
              <span className="jg-ico">
                <SIcon name={g.kind === "github" ? "git" : g.kind === "mcp" ? "terminal" : "folder"} size={14} />
              </span>
              <span className="jg-label">{g.label}</span>
              <span className="jg-sub">{g.sub}</span>
              <span className="jg-count">{g.skills.length}</span>
              <button className="jg-x" title="Remove source" onClick={() => removeGroup(g.id)}><SIcon name="x" size={13} /></button>
            </div>
            {removableSkills && (
              <div className="jso-grp-skills">
                {g.skills.map((s) => (
                  <span className="jso-skchip" key={s.id}>
                    <SIcon name="skills" size={11} /> {s.name}
                    <button className="sk-x" title="Remove" onClick={() => removeSkill(g.id, s.id)}><SIcon name="x" size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const RouteToggle = () => (
    <div className="jso-route">
      <div className="jr-body">
        <div className="jr-title">Route new skills through Jenz</div>
        <div className="jr-sub">When a connected agent installs a new skill, Jenz audits it first — verified skills land in the agent’s folder automatically, risky ones stay quarantined here.</div>
      </div>
      <button className={"jso-switch" + (routeThrough ? " on" : "")} role="switch" aria-checked={routeThrough} onClick={() => setRouteThrough((r) => !r)}><i /></button>
    </div>
  );

  const stepNo = stepIdx + 1;

  return (
    <div className="jso">
      <div className="jso-inner">
        <div className="jso-mark"><SIcon name="shield-check" size={24} /></div>

        <div className="jso-stepper">
          <div className="jso-progress"><div className="jso-progress-fill" style={{ width: ((stepIdx + 1) / steps.length) * 100 + "%" }} /></div>
          <span className="jso-step-label">Step {stepNo} of {steps.length}</span>
        </div>

        {/* STEP — name */}
        {stepId === "name" && (
          <>
            <h1>Bring your skills somewhere safe.</h1>
            <p className="jso-sub">
              Jenz is the managed home for your agents’ skills. Upload them or let an agent push them in over MCP —
              every one gets audited for prompt injection and malicious code <em>before</em> it can run.
            </p>
            <div className="jso-field-label">Workspace name</div>
            <input className="jso-input" value={name} autoFocus spellCheck={false} placeholder="e.g. Bicone"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) next(); }} />
            <div className="jso-cta-row">
              <button className="jso-cta" disabled={!name.trim()} onClick={next}>Continue <SIcon name="arrow-right" size={15} /></button>
              <span className="jso-cta-note">you can rename this anytime</span>
            </div>
          </>
        )}

        {/* STEP — import */}
        {stepId === "import" && (
          <>
            <h1>Add your skills.</h1>
            <p className="jso-sub">
              Jenz runs in your browser, so it can’t reach your machine — pick each tool’s skills folder to upload it,
              pull a GitHub repo, or connect an agent over MCP to push them in automatically.
            </p>

            {importLayout === "per-tool" ? (
              <>
                <div className="jso-field-label">Upload from your tools</div>
                <div className="jso-tool-grid">
                  {TOOLS.map((t) => (
                    <div className="jso-tool" key={t.id}>
                      <SourceBadge kind={t.id} />
                      <div className="jt-body">
                        <div className="jt-name">{t.name}</div>
                        <div className="jt-path">{t.path}</div>
                      </div>
                      <button className="jt-btn" onClick={() => openFolder(t.name, t.path)}>
                        <SIcon name="folder" size={13} /> Choose folder
                      </button>
                    </div>
                  ))}
                </div>
                <div className="jso-field-label" style={{ marginTop: 22 }}>Other sources</div>
                <div className="jso-byo-grid">
                  <button className="jso-byo-tile" onClick={() => openFolder(null, "folder")}>
                    <span className="byo-ico"><SIcon name="import" size={17} /></span>
                    <div className="byo-body"><div className="byo-name">Upload any folder</div><div className="byo-meta">a SKILL.md tree or .zip</div></div>
                    <span className="byo-plus"><SIcon name="plus" size={14} /></span>
                  </button>
                  <div className="jso-byo-tile gh">
                    <span className="byo-ico"><SIcon name="git" size={17} /></span>
                    <input className="jso-gh-input" value={repoUrl} placeholder="github.com/org/skills" spellCheck={false}
                      onChange={(e) => setRepoUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addRepo(); }} />
                    <button className="jso-gh-add" onClick={addRepo} disabled={!repoUrl.trim()}>Add</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button className="jso-drop" onClick={() => openFolder(null, "folder")}>
                  <span className="jd-ico"><SIcon name="import" size={22} /></span>
                  <div className="jd-body">
                    <div className="jd-title">Upload a skills folder</div>
                    <div className="jd-meta">Pick the whole directory — e.g. <code>~/.claude/skills</code>, <code>~/.codex/skills</code></div>
                  </div>
                  <span className="jd-cta">Choose folder</span>
                </button>
                <div className="jso-byo-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
                  <div className="jso-byo-tile gh">
                    <span className="byo-ico"><SIcon name="git" size={17} /></span>
                    <input className="jso-gh-input" value={repoUrl} placeholder="github.com/org/skills" spellCheck={false}
                      onChange={(e) => setRepoUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addRepo(); }} />
                    <button className="jso-gh-add" onClick={addRepo} disabled={!repoUrl.trim()}>Add</button>
                  </div>
                </div>
              </>
            )}

            <input ref={(el) => { folderRef.current = el; if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } }}
              type="file" multiple style={{ display: "none" }} onChange={onFolder} />

            {mcpPlacement === "inline" && (
              <div style={{ marginTop: 22 }}>
                <div className="jso-field-label">Or connect an agent</div>
                <McpConnect workspace={name} connected={mcp.connected} connectedAgent={mcp.agent} onConnect={onMcpConnect} />
                <div style={{ marginTop: 12 }}><RouteToggle /></div>
              </div>
            )}

            <StagedList />

            <div className="jso-cta-row">
              <button className="jso-back" onClick={back}><SIcon name="arrow-left" size={14} /> Back</button>
              <button className="jso-cta" onClick={next}>
                {total > 0 ? "Review" : "Continue"} <SIcon name="arrow-right" size={15} />
              </button>
              <span className="jso-cta-note">{total > 0 ? `${total} skill${total > 1 ? "s" : ""} staged` : "or connect via CLI and add later"}</span>
            </div>
          </>
        )}

        {/* STEP — mcp (only when placement = step) */}
        {stepId === "mcp" && (
          <>
            <h1>Connect your CLI agent.</h1>
            <p className="jso-sub">
              The fastest path: your agent has filesystem access, so it can push its skills into Jenz directly and
              route new ones through the audit before they ever land in its folder.
            </p>
            <McpConnect workspace={name} connected={mcp.connected} connectedAgent={mcp.agent} onConnect={onMcpConnect} />
            <div style={{ marginTop: 14 }}><RouteToggle /></div>
            <StagedList />
            <div className="jso-cta-row">
              <button className="jso-back" onClick={back}><SIcon name="arrow-left" size={14} /> Back</button>
              <button className="jso-cta" onClick={next}>Review <SIcon name="arrow-right" size={15} /></button>
              <span className="jso-cta-note">{mcp.connected ? "agent connected" : "you can skip and connect later"}</span>
            </div>
          </>
        )}

        {/* STEP — review */}
        {stepId === "review" && (
          <>
            <h1>{total > 0 ? "Review before the audit." : "Nothing staged yet."}</h1>
            <p className="jso-sub">
              {total > 0
                ? <>These are the skills headed into <b>{name || "your workspace"}</b>. Drop anything you don’t want, then run the audit.</>
                : <>You can finish now and add skills later — uploads or a connected agent pushing them through Jenz.</>}
            </p>

            {total > 0 ? (
              <>
                <div className="jso-review-bar">
                  <span><b>{total}</b> skill{total > 1 ? "s" : ""}</span>
                  <span className="rb-sep">·</span>
                  <span>{groups.length} source{groups.length > 1 ? "s" : ""}</span>
                  {mcp.connected && <><span className="rb-sep">·</span><span className="rb-route"><SIcon name="shield-check" size={12} /> auto-route {routeThrough ? "on" : "off"}</span></>}
                </div>
                <StagedList removableSkills />
              </>
            ) : (
              <div className="jso-empty-card">
                <span className="je-ico"><SIcon name="shield-check" size={26} /></span>
                <div>Your managed library starts empty. Connect an agent over MCP and it’ll push verified skills in as you go.</div>
              </div>
            )}

            <div className="jso-cta-row">
              <button className="jso-back" onClick={back}><SIcon name="arrow-left" size={14} /> Back</button>
              <button className="jso-cta" onClick={() => onImport(total)}>
                <SIcon name="scan" size={15} />
                {total > 0 ? `Run audit on ${total} skill${total > 1 ? "s" : ""}` : "Finish setup"}
              </button>
              <span className="jso-cta-note">runs locally · nothing reaches an agent unvetted</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the OnboardingProps shape at the App.tsx call site.
registerScreen("onboarding", Onboarding as unknown as ComponentType<Record<string, unknown>>);
export default Onboarding;
