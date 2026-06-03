// Onboarding wizard (SPEC §6) — the app's first-paint entry, rebuilt to match
// the in-house jenz-brain desktop onboarding (the `ob-*` shell). Jenz runs in
// the browser and can't reach the user's machine, so skills are either uploaded
// (folder picker scanning for SKILL.md), pulled from a GitHub repo, or pushed in
// by a CLI agent over MCP. Steps: welcome → name → import → mcp → review.
//
// App.tsx passes { onComplete: (workspace, sources) => void }.
// onComplete fires on the final "Enter workspace" CTA with the workspace name
// and the collected ImportSource[] ready for stream-auditing.
//
// The pure branching (steps array), the SKILL.md folder scan, the GitHub
// repo-label parse, the staged `total` count, and buildInlineSources live in
// onboardingLogic.ts and are unit-tested in onboardingLogic.test.ts.
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon, type IconName } from "../components/SIcon";
import { McpConnect } from "../components/McpConnect";
import {
  onboardingSteps,
  parseRepoLabel,
  scanSkillDirs,
  totalSkills,
  buildInlineSources,
  type ImportSource,
  type StagedGroup,
  type StepId,
} from "./onboardingLogic";

interface OnboardingProps {
  onComplete: (workspace: string, sources: ImportSource[]) => void;
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

// Stepper labels, in step order — Welcome · Workspace · Skills · Agent · Review.
const STEP_LABELS: Record<StepId, string> = {
  welcome: "Welcome",
  name: "Workspace",
  import: "Skills",
  mcp: "Agent",
  review: "Review",
};

// Hoisted to module scope so their identity is stable across renders. Defining
// these INSIDE Onboarding made React remount the whole card subtree on every
// keystroke (the input lost focus and the page flickered).
interface ShellNav {
  steps: StepId[];
  stepIdx: number;
  setStepIdx: (i: number) => void;
}

function Stepper({ steps, stepIdx, setStepIdx }: ShellNav) {
  return (
    <div className="ob-stepper">
      {steps.map((s, i) => {
        const done = stepIdx > i;
        const active = stepIdx === i;
        return (
          <div className="ob-step-wrap" key={s}>
            <button
              className={"ob-step" + (active ? " active" : "") + (done ? " done" : "")}
              onClick={() => done && setStepIdx(i)}
              disabled={!done && !active}
            >
              <span className="ob-step-num">{done ? "✓" : i + 1}</span>
              <span className="ob-step-lbl">{STEP_LABELS[s]}</span>
            </button>
            {i < steps.length - 1 && <span className={"ob-step-line" + (done ? " done" : "")} />}
          </div>
        );
      })}
    </div>
  );
}

function Shell({ children, ...nav }: ShellNav & { children: ReactNode }) {
  return (
    <div className="ob-overlay">
      <div className="ob-wrap">
        <header className="ob-header">
          <Stepper {...nav} />
        </header>
        <main className="ob-body">
          <div className="ob-card">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Onboarding({ onComplete }: OnboardingProps) {
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<StagedGroup[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [mcp, setMcp] = useState<{ connected: boolean; agent: string | null }>({
    connected: false,
    agent: null,
  });
  const [stepIdx, setStepIdx] = useState(0);

  // Collected ImportSources — one per upload or github entry. MCP is excluded
  // (MCP-pushed skills come in via the MCP server at runtime, not at onboarding).
  const [importSources, setImportSources] = useState<ImportSource[]>([]);

  const folderRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<{ label: string | null; sub: string } | null>(null);
  const gidRef = useRef(0);

  const steps = onboardingSteps();
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

  const onFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const meta = pendingRef.current || { label: null, sub: "" };
    pendingRef.current = null;
    if (!files.length) return;

    const first = files[0] as File & { webkitRelativePath?: string };
    const root = (first.webkitRelativePath || first.name).split("/")[0] || "skills";

    // Read each file's text content. Files that fail to read (e.g. binary) are
    // silently skipped — buildInlineSources handles oversized/binary filtering too.
    const fileEntries: { path: string; content: string }[] = [];
    await Promise.all(
      files.map(async (f) => {
        const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        try {
          const content = await f.text();
          fileEntries.push({ path, content });
        } catch {
          // skip unreadable files (binary, permissions, etc.)
          console.warn(`[jenz] skipping unreadable file: ${path}`);
        }
      }),
    );

    const paths = fileEntries.map((fe) => fe.path);
    const skillDirNames = scanSkillDirs(paths, root);

    if (skillDirNames.length > 0) {
      // Build real ImportSources with file contents
      const newSources = buildInlineSources(fileEntries);
      setImportSources((prev) => [...prev, ...newSources]);

      const skills = skillDirNames.map((n) => ({ id: "sk-" + gidRef.current++ + "-" + n, name: n }));
      addGroup({ kind: "upload", label: meta.label || root, sub: meta.sub || root + "/", skills });
    } else {
      // No SKILL.md found — mint synthetic names for display (legacy behaviour)
      const skills = mint(root, Math.min(Math.max(files.length, 1), 4));
      addGroup({ kind: "upload", label: meta.label || root, sub: meta.sub || root + "/", skills });
      // For non-SKILL.md folders, use all readable files as a single inline source
      if (fileEntries.length > 0) {
        const source: ImportSource = { kind: "inline", name: root, files: fileEntries };
        setImportSources((prev) => [...prev, source]);
      }
    }
  };

  const addRepo = () => {
    const url = repoUrl.trim();
    if (!url) return;
    const label = parseRepoLabel(url);
    if (groups.some((g) => g.kind === "github" && g.label === label)) {
      setRepoUrl("");
      return;
    }
    // Add a github ImportSource
    const newSource: ImportSource = { kind: "github", url, label };
    setImportSources((prev) => [...prev, newSource]);

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
    // MCP skills are pushed at runtime via the MCP server, not collected as ImportSources here.
  };

  // Which staged groups are expanded to reveal their skill names.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- staged groups list (shared) ----
  const StagedList = ({ removableSkills }: { removableSkills?: boolean }) => {
    if (!groups.length) return null;
    return (
      <div className="ob-staged">
        {groups.map((g) => (
          <div className="ob-grp" key={g.id}>
            <div
              className="ob-grp-head"
              style={{ cursor: "pointer" }}
              onClick={() => toggleExpand(g.id)}
              title={expanded.has(g.id) ? "Hide skills" : "Show skills"}
            >
              <span className="ob-grp-ico">
                <SIcon name={g.kind === "github" ? "git" : g.kind === "mcp" ? "terminal" : "folder"} size={14} />
              </span>
              <span className="ob-grp-label">{g.label}</span>
              <span className="ob-grp-sub">{g.sub}</span>
              <span className="ob-grp-count">{g.skills.length}</span>
              {!removableSkills && (
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    transition: "transform .15s ease",
                    transform: expanded.has(g.id) ? "rotate(180deg)" : "none",
                    color: "var(--fg-3)",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4.5 L6 7.5 L9 4.5" /></svg>
                </span>
              )}
              <button className="ob-grp-x" title="Remove source" onClick={(e) => { e.stopPropagation(); removeGroup(g.id); }}><SIcon name="x" size={13} /></button>
            </div>
            {(removableSkills || expanded.has(g.id)) && (
              <div className="ob-grp-skills">
                {g.skills.map((s) => (
                  <span className="ob-skchip" key={s.id}>
                    <SIcon name="skills" size={11} /> {s.name}
                    {removableSkills && (
                      <button className="ob-skchip-x" title="Remove" onClick={() => removeSkill(g.id, s.id)}><SIcon name="x" size={11} /></button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const nav: ShellNav = { steps, stepIdx, setStepIdx };

  // ===== STEP: welcome =====
  if (stepId === "welcome") {
    return (
      <Shell {...nav}>
        <div className="ob-eyebrow">Welcome to jenz managed skills</div>
        <h1 className="ob-title">Every skill, audited before it runs.</h1>
        <p className="ob-blurb">
          Jenz is the managed home for your agents' skills. Upload them or let an agent push them in —
          every one is scanned for prompt injection and malicious code <em>before</em> it can reach your agent.
        </p>

        <div className="ob-hero">{HERO}</div>

        <div className="ob-pillars">
          {([
            { icon: "shield-check", h: "Audited before they run", b: "Every skill is scanned the moment it arrives. Nothing reaches your agent unvetted." },
            { icon: "shield-alert", h: "Prompt injection, caught", b: "Open-weight detectors flag hidden instructions, exfiltration, and unsafe tool calls — as evidence, not vibes." },
            { icon: "terminal", h: "Agent-pushed, auto-routed", b: "Connect a CLI agent and new skills route through Jenz automatically — clean ones land, risky ones stay quarantined." },
          ] as { icon: IconName; h: string; b: string }[]).map((p) => (
            <div className="ob-pillar" key={p.h}>
              <div className="ob-pillar-glyph"><SIcon name={p.icon} size={16} /></div>
              <div>
                <div className="ob-pillar-h">{p.h}</div>
                <div className="ob-pillar-b">{p.b}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="ob-foot">
          <span className="ob-foot-hint">~1 minute · you can change anything later</span>
          <span className="ob-foot-spacer" />
          <button className="btn-primary" onClick={next}>Get started →</button>
        </div>
      </Shell>
    );
  }

  // ===== STEP: name =====
  if (stepId === "name") {
    return (
      <Shell {...nav}>
        <div className="ob-eyebrow">Step 1 · Workspace</div>
        <h1 className="ob-title">Name your workspace.</h1>
        <p className="ob-blurb">Where your audited skills live. You can rename it anytime.</p>

        <input
          className="ob-input"
          value={name}
          autoFocus
          spellCheck={false}
          placeholder="e.g. Acme"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) next(); }}
        />

        <div className="ob-foot">
          <button className="btn-secondary" onClick={back}>← Back</button>
          <span className="ob-foot-spacer" />
          <button className="btn-primary" disabled={!name.trim()} onClick={next}>Continue →</button>
        </div>
      </Shell>
    );
  }

  // ===== STEP: import =====
  if (stepId === "import") {
    return (
      <Shell {...nav}>
        <div className="ob-eyebrow">Step 2 · Add skills</div>
        <h1 className="ob-title">Add your skills.</h1>
        <p className="ob-blurb">
          Jenz runs in your browser, so it can't reach your machine — upload a skills folder or pull a GitHub repo.
        </p>

        <div className="ob-choice-grid">
          <button className="ob-region ob-choice" onClick={() => openFolder(null, "folder")}>
            <span className="ob-choice-glyph"><SIcon name="folder" size={18} /></span>
            <div className="ob-choice-name">Upload a folder</div>
            <div className="ob-choice-hint">~/.claude/skills · ~/.codex/skills · ~/.openclaw/skills · ~/.hermes/skills</div>
          </button>

          <div className="ob-region ob-choice ob-choice-gh">
            <span className="ob-choice-glyph"><SIcon name="git" size={18} /></span>
            <div className="ob-choice-name">From GitHub</div>
            <div className="ob-gh-row">
              <input
                className="ob-input ob-gh-input"
                value={repoUrl}
                placeholder="github.com/org/skills"
                spellCheck={false}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addRepo(); }}
              />
              <button className="ob-gh-add" onClick={addRepo} disabled={!repoUrl.trim()}>Add</button>
            </div>
          </div>
        </div>

        <input
          ref={(el) => { folderRef.current = el; if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } }}
          type="file" multiple style={{ display: "none" }} onChange={onFolder}
        />

        <StagedList />

        <div className="ob-foot">
          <button className="btn-secondary" onClick={back}>← Back</button>
          <span className="ob-foot-spacer" />
          <span className="ob-foot-hint">{total > 0 ? `${total} skill${total > 1 ? "s" : ""} staged` : "or connect with MCP"}</span>
          <button className="btn-primary" onClick={next}>Continue →</button>
        </div>
      </Shell>
    );
  }

  // ===== STEP: mcp =====
  if (stepId === "mcp") {
    return (
      <Shell {...nav}>
        <div className="ob-eyebrow">Step 3 · Connect agent</div>
        <h1 className="ob-title">Connect your coding agent.</h1>
        <p className="ob-blurb">
          Connect Jenz to your coding agent so it pushes new skills through Jenz to be audited the moment
          they're added — nothing reaches the agent unvetted. You can do this later.
        </p>

        <McpConnect workspace={name} connected={mcp.connected} connectedAgent={mcp.agent} onConnect={onMcpConnect} />

        <StagedList />

        <div className="ob-foot">
          <button className="btn-secondary" onClick={back}>← Back</button>
          <span className="ob-foot-spacer" />
          <button className="ob-link" onClick={next}>Skip for now</button>
          <button className="btn-primary" onClick={next}>Continue →</button>
        </div>
      </Shell>
    );
  }

  // ===== STEP: review =====
  return (
    <Shell {...nav}>
      <div className="ob-eyebrow">Step 4 · Review</div>
      <h1 className="ob-title">{total > 0 ? "Review your skills." : "Nothing staged yet."}</h1>
      <p className="ob-blurb">
        {total > 0 ? (
          <>These are the skills headed into <b>{name || "your workspace"}</b>. Drop anything you don't want, then enter your workspace.</>
        ) : (
          <>You can finish now and add skills later — uploads or a connected agent pushing them through Jenz.</>
        )}
      </p>

      {total > 0 ? (
        <>
          <div className="ob-review-bar">
            <span><b>{total}</b> skill{total > 1 ? "s" : ""}</span>
            <span className="ob-review-sep">·</span>
            <span>{groups.length} source{groups.length > 1 ? "s" : ""}</span>
            {mcp.connected && (
              <>
                <span className="ob-review-sep">·</span>
                <span className="ob-review-route"><SIcon name="shield-check" size={12} /> agent connected</span>
              </>
            )}
          </div>
          <StagedList removableSkills />
        </>
      ) : (
        <div className="ob-empty">
          <span className="ob-empty-ico"><SIcon name="shield-check" size={24} /></span>
          <div>Your managed library starts empty. Connect an agent over MCP and it'll push verified skills in as you go.</div>
        </div>
      )}

      <div className="ob-foot">
        <button className="btn-secondary" onClick={back}>← Back</button>
        <span className="ob-foot-spacer" />
        <button className="btn-primary" onClick={() => onComplete(name || "My Workspace", importSources)}>Enter workspace →</button>
      </div>
    </Shell>
  );
}

// Hero SVG (welcome) — skills-audit story: skill "diamonds" flow left→right
// through a central shield/scan gate; on the right they emerge as green checks
// with ONE red flagged (quarantined) item. Tokens only; reads on light + dark.
const HERO = (
  <svg viewBox="0 0 240 150" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Skills audited through a shield gate">
    <defs>
      <radialGradient id="ob-hero-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* glow behind the gate */}
    <ellipse cx="120" cy="75" rx="56" ry="48" fill="url(#ob-hero-glow)" />

    {/* incoming connectors (faint) */}
    {[40, 62, 88].map((y, i) => (
      <line key={i} x1="28" y1={y} x2="104" y2="75" stroke="var(--fg-3)" strokeWidth="0.8" opacity="0.28" />
    ))}
    {/* outgoing connectors (faint) */}
    {[42, 75, 108].map((y, i) => (
      <line key={i} x1="136" y1="75" x2="212" y2={y} stroke="var(--fg-3)" strokeWidth="0.8" opacity="0.28" />
    ))}

    {/* incoming skill diamonds (unvetted) */}
    {[{ x: 24, y: 40 }, { x: 24, y: 62 }, { x: 24, y: 88 }].map((d, i) => (
      <polygon key={i} points={`${d.x},${d.y - 6} ${d.x + 6},${d.y} ${d.x},${d.y + 6} ${d.x - 6},${d.y}`}
        fill="none" stroke="var(--fg-3)" strokeWidth="1.4" opacity="0.7" />
    ))}

    {/* central shield gate */}
    <path d="M120 40 L140 48 V72 c0 13 -9 21 -20 24 c-11 -3 -20 -11 -20 -24 V48 Z"
      fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
    {/* scan line + check inside the shield */}
    <path d="M111 70 l6 6 l11 -12" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

    {/* outgoing: two safe checks */}
    {[{ x: 214, y: 42 }, { x: 214, y: 108 }].map((d, i) => (
      <g key={i}>
        <circle cx={d.x} cy={d.y} r="9" fill="var(--safe-soft)" stroke="var(--safe)" strokeWidth="1.4" />
        <path d={`M${d.x - 4} ${d.y} l3 3 l5 -6`} fill="none" stroke="var(--safe)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ))}
    {/* outgoing: one flagged / quarantined */}
    <g>
      <circle cx="214" cy="75" r="9" fill="var(--danger-soft)" stroke="var(--danger)" strokeWidth="1.4" />
      <path d="M214 71 v4 M214 79 v.5" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  </svg>
);

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the OnboardingProps shape at the App.tsx call site.
registerScreen("onboarding", Onboarding as unknown as ComponentType<Record<string, unknown>>);
export default Onboarding;
