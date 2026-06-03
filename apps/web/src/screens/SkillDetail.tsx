// Jenz Skills — Skill Detail (demo-critical #2). Props from App.tsx:
//   { sk, installed: string[], onInstall, onDelete, onReport, onRescan, onApprove }
// Ports skills-detail.jsx node-for-node: header + install, Files rail, then a
// flat flowing document: Description → Information (audit + meta + findings) →
// Skill file. The skill file renders as formatted markdown (like Brain), with
// injection lines still surfaced inline so the audit value is preserved.
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import { RiskPill } from "../components/RiskPill";
import { InstallMenu } from "../components/InstallMenu";
import { TARGET_BY_ID } from "../data/targets";
import { SOURCE_LABEL } from "../data/skills";
import type { MdLine, Risk, Skill } from "../state/types";

// ---- pure: files-rail derivation (testable) ----
export interface RailFile {
  name: string;
  dir: boolean;
  flagged: boolean;
}

// SKILL.md plus any file referenced by a finding; vetted skills also surface
// the canonical examples/ + refs/ folders. Mirrors the source useMemo body.
export function deriveFiles(sk: Skill): RailFile[] {
  const flagged = sk.risk !== "safe";
  const names = ["SKILL.md"];
  sk.findings.forEach((f) => {
    if (f.file !== "SKILL.md" && !names.includes(f.file)) names.push(f.file);
  });
  if (!flagged) names.push("examples/", "refs/");
  return names.map((n) => ({
    name: n,
    dir: n.endsWith("/"),
    flagged: sk.findings.some((f) => f.file === n),
  }));
}

// ---- pure: SKILL.md line array → flowing markdown blocks (testable) ----
export type MdBlock =
  | { t: "h2"; text: string }
  | { t: "h3"; text: string }
  | { t: "p"; lines: string[] }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "note"; lines: string[] }
  | { t: "inj"; lines: string[] };

export function parseSkillFileBody(
  lines: MdLine[],
  skillName: string,
  skillDesc: string,
): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;

  // skip YAML frontmatter (already surfaced in Information)
  if (lines[0] && lines[0].text.trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i].text.trim() !== "---") i++;
    i++;
  }

  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ t: "p", lines: para.slice() });
      para = [];
    }
  };

  while (i < lines.length) {
    const ln = lines[i];
    const txt = ln.text;
    const trimmed = txt.trim();

    if (ln.hot || ln.kind === "inj") {
      flush();
      const seg: string[] = [];
      while (i < lines.length && (lines[i].hot || lines[i].kind === "inj")) {
        seg.push(lines[i].text);
        i++;
      }
      blocks.push({ t: "inj", lines: seg });
      continue;
    }
    if (trimmed === "") {
      flush();
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flush();
      blocks.push({ t: "h3", text: trimmed.slice(3) });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flush();
      const t = trimmed.slice(2);
      if (t.trim() !== skillName) blocks.push({ t: "h2", text: t });
      i++;
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const seg: string[] = [];
      while (i < lines.length && lines[i].text.trim().startsWith(">")) {
        seg.push(lines[i].text.trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ t: "note", lines: seg });
      continue;
    }
    if (/^[-*]\s/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].text.trim())) {
        items.push(lines[i].text.trim().replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push({ t: "ul", items });
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].text.trim())) {
        items.push(lines[i].text.trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ t: "ol", items });
      continue;
    }
    // skip a body line that just repeats the description (shown above)
    if (trimmed === (skillDesc || "").trim()) {
      flush();
      i++;
      continue;
    }
    para.push(txt);
    i++;
  }
  flush();

  return blocks;
}

// ---- inline markdown: **bold**, `code` ----
function renderInline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (n: ReactNode) => parts.push(<Fragment key={key++}>{n}</Fragment>);
  while (i < s.length) {
    if (s[i] === "*" && s[i + 1] === "*") {
      const e = s.indexOf("**", i + 2);
      if (e > -1) {
        push(<strong>{s.slice(i + 2, e)}</strong>);
        i = e + 2;
        continue;
      }
    }
    if (s[i] === "`") {
      const e = s.indexOf("`", i + 1);
      if (e > -1) {
        push(<code>{s.slice(i + 1, e)}</code>);
        i = e + 1;
        continue;
      }
    }
    let j = i;
    while (j < s.length && s[j] !== "*" && s[j] !== "`") j++;
    push(s.slice(i, j));
    i = j;
  }
  return parts;
}

function CodeBlock({ lines }: { lines: MdLine[] }) {
  const tokClass = (kind: MdLine["kind"]) =>
    kind === "h" ? "tok-h" : kind === "com" ? "tok-com" : kind === "inj" ? "tok-inj" : "";
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className={"code-line" + (l.hot ? " hot" : "")}>
          <span className="ln">{l.n || ""}</span>
          <span className={tokClass(l.kind)}>{l.text || " "}</span>
        </span>
      ))}
    </>
  );
}

function SkillFileBody({
  lines,
  skillName,
  skillDesc,
}: {
  lines: MdLine[];
  skillName: string;
  skillDesc: string;
}) {
  const blocks = parseSkillFileBody(lines, skillName, skillDesc);
  return (
    <div className="skill-md jsd-skillmd">
      {blocks.map((b, idx) => {
        if (b.t === "h2") return <h2 key={idx}>{b.text}</h2>;
        if (b.t === "h3") return <h3 key={idx}>{b.text}</h3>;
        if (b.t === "p")
          return (
            <p key={idx}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j ? " " : ""}
                  {renderInline(l)}
                </Fragment>
              ))}
            </p>
          );
        if (b.t === "ul")
          return (
            <ul key={idx}>
              {b.items.map((t, j) => (
                <li key={j}>{renderInline(t)}</li>
              ))}
            </ul>
          );
        if (b.t === "ol")
          return (
            <ol key={idx}>
              {b.items.map((t, j) => (
                <li key={j}>{renderInline(t)}</li>
              ))}
            </ol>
          );
        if (b.t === "note")
          return (
            <blockquote key={idx} className="jsd-note">
              {b.lines.map((t, j) => (
                <div key={j}>{renderInline(t)}</div>
              ))}
            </blockquote>
          );
        if (b.t === "inj")
          return (
            <div key={idx} className="jsd-inj">
              <div className="jsd-inj-tag">
                <SIcon name="shield-alert" size={12} /> prompt injection — blocked
              </div>
              {b.lines.map((l, j) => (
                <div key={j} className="jsd-inj-line">
                  {l}
                </div>
              ))}
            </div>
          );
        return null;
      })}
    </div>
  );
}

const SEV_RISK: Record<string, Risk> = { high: "malicious", medium: "suspicious", low: "queued" };

interface SkillDetailProps {
  sk: Skill;
  installed: string[];
  onInstall: (id: string, target: string) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onRescan: (id: string) => void;
  onApprove: (id: string) => void;
}

function SkillDetail({
  sk,
  installed,
  onInstall,
  onDelete,
  onReport,
  onRescan,
  onApprove,
}: SkillDetailProps) {
  const flagged = sk.risk !== "safe";
  const [sel, setSel] = useState("SKILL.md");
  const [confirm, setConfirm] = useState<null | "approve" | "delete">(null);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    setSel("SKILL.md");
    setConfirm(null);
    setScanning(false);
  }, [sk.id]);

  const runRescan = () => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onRescan && onRescan(sk.id);
    }, 1500);
  };

  // file list — SKILL.md plus any files referenced by findings
  const files = useMemo(() => deriveFiles(sk), [sk]);

  // body for the selected file (non-SKILL.md = raw finding code)
  const selLines = useMemo<MdLine[]>(() => {
    if (sel === "SKILL.md") return sk.skillMd;
    const fs = sk.findings.filter((f) => f.file === sel);
    if (fs.length) {
      const out: MdLine[] = [];
      fs.forEach((f, i) => {
        if (i) out.push({ n: 0, text: "" });
        f.snippet.forEach((l) => out.push(l));
      });
      return out;
    }
    return [{ n: 1, text: "// " + sel }];
  }, [sel, sk]);

  const fileCount = files.filter((f) => !f.dir).length || 1;

  return (
    <div className="jsd">
      {/* header */}
      <div className="jsd-head">
        <div className="jsd-head-top">
          <div className="jsd-head-body">
            <h1 className={"jsd-name " + sk.risk}>
              {sk.name}
              {flagged && <RiskPill risk={sk.risk} />}
            </h1>
            <div className="jsd-meta">
              <span className="jsd-tag">
                <SIcon name="folder" size={13} /> {sk.category}
              </span>
              <span className="sep">·</span>
              <span>from {SOURCE_LABEL[sk.source]}</span>
              <span className="sep">·</span>
              <span>
                {fileCount} file{fileCount > 1 ? "s" : ""}
              </span>
              {!flagged && installed.length > 0 && (
                <>
                  <span className="sep">·</span>
                  <span className="inst-chips">
                    {installed.map((id) => {
                      const t = TARGET_BY_ID[id];
                      return (
                        <span className="inst-chip" key={id}>
                          <SIcon name="check" size={10} /> {t ? t.name : id}
                        </span>
                      );
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="jsd-actions">
            {flagged ? (
              <InstallMenu
                locked
                label="Install"
                lockedReason="Blocked — this skill is quarantined. Clear its findings before it can be installed."
                onInstall={() => {}}
              />
            ) : (
              <InstallMenu
                installed={installed}
                onInstall={(t) => onInstall(sk.id, t)}
                label="Install to"
              />
            )}
            <span className="jsd-secondary">
              {flagged ? "review required" : "vetted · canonical · install to any tool"}
            </span>
          </div>
        </div>
      </div>

      <div className="jsd-main">
        {/* files rail */}
        <div className="jsd-files">
          <div className="jsd-files-head">
            Files <span className="jfh-count">{files.length}</span>
          </div>
          {files.map((f) => (
            <button
              key={f.name}
              className={
                "jsd-file" + (sel === f.name ? " active" : "") + (f.flagged ? " flagged" : "")
              }
              onClick={() => !f.dir && setSel(f.name)}
            >
              <span className="jf-ico">
                <SIcon name={f.dir ? "folder" : "doc"} size={13} />
              </span>
              <span className="jf-name">{f.name}</span>
              {f.flagged && <span className="jf-flag" />}
            </button>
          ))}
        </div>

        {/* flowing document */}
        <div className="jsd-scroll">
          {/* quarantine action bar */}
          {flagged && (
            <div className="jsd-quar">
              <div className="jsd-quar-lead">
                <span className="qa-ico">
                  <SIcon name="lock" size={16} />
                </span>
                <div>
                  <div className="qa-title">Blocked from every tool</div>
                  <div className="qa-sub">
                    Decide what happens to this skill. Nothing here can reach an agent until you do.
                  </div>
                </div>
              </div>
              {confirm ? (
                <div className="jsd-quar-confirm">
                  <span className="qc-q">
                    {confirm === "delete"
                      ? "Delete this skill permanently?"
                      : "Override the audit and move this skill to your library?"}
                  </span>
                  <button
                    className={"qa-btn " + (confirm === "delete" ? "danger" : "warn") + " solid"}
                    onClick={() => {
                      if (confirm === "delete") onDelete(sk.id);
                      else onApprove(sk.id);
                    }}
                  >
                    {confirm === "delete" ? "Delete" : "Approve anyway"}
                  </button>
                  <button className="qa-btn" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="jsd-quar-btns">
                  <button className="qa-btn" onClick={runRescan} disabled={scanning}>
                    <SIcon name="refresh" size={14} className={scanning ? "spin" : ""} />
                    {scanning ? "Re-scanning…" : "Re-scan"}
                  </button>
                  <button className="qa-btn" onClick={() => onReport(sk.id)} disabled={sk.reported}>
                    <SIcon name="alert" size={14} />
                    {sk.reported ? "Reported" : "Report"}
                  </button>
                  <button className="qa-btn warn" onClick={() => setConfirm("approve")}>
                    <SIcon name="shield-check" size={14} />
                    Approve anyway
                  </button>
                  <button className="qa-btn danger" onClick={() => setConfirm("delete")}>
                    <SIcon name="ban" size={14} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Description — in a card */}
          <div className="skill-field">
            <label className="skill-field-label">
              <SIcon name="more" size={11} /> Description
            </label>
            <div className="skill-field-box">{sk.desc}</div>
          </div>

          {/* meta — horizontal row */}
          <div className="skill-meta-row">
            <span
              className="skill-meta-pill"
              style={{ color: flagged ? "var(--danger)" : "var(--safe)" }}
            >
              <SIcon name={flagged ? "shield-alert" : "shield-check"} size={13} />
              {flagged ? "Quarantined" : "Passed audit"}
            </span>
            <span className="skill-meta-sep">·</span>
            <span className="skill-meta-item">
              <SIcon name="folder" size={12} /> {sk.category}
            </span>
            <span className="skill-meta-sep">·</span>
            <span className="skill-meta-item">{"from " + SOURCE_LABEL[sk.source]}</span>
            <span className="skill-meta-sep">·</span>
            <span className="skill-meta-item">
              {fileCount + " file" + (fileCount > 1 ? "s" : "")}
            </span>
            {flagged && (
              <>
                <span className="skill-meta-sep">·</span>
                <span className="skill-meta-item" style={{ color: "var(--danger)" }}>
                  {sk.findings.length + " finding" + (sk.findings.length > 1 ? "s" : "")}
                </span>
              </>
            )}
          </div>

          {/* findings as audit evidence (flagged only) */}
          {sk.findings.length > 0 && (
            <div className="jsd-findings">
              {sk.findings.map((f, i) => (
                <div key={i} className={"finding " + sk.risk}>
                  <div className="finding-head">
                    <span className="finding-ico">
                      <SIcon name={sk.risk === "malicious" ? "ban" : "alert"} size={16} />
                    </span>
                    <span className="finding-type">{f.type}</span>
                    <RiskPill risk={SEV_RISK[f.sev]} label={f.sev} sm />
                    <span className="finding-loc">
                      {f.file}:{f.line}
                    </span>
                  </div>
                  <div className="finding-snippet">
                    <CodeBlock lines={f.snippet} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* skill file — single hairline + flowing markdown */}
          <div className="skill-file-bar">
            <span className="sfb-name">{sel}</span>
            <button className="head-action" title="Read-only">
              <SIcon name="more" size={12} />
            </button>
          </div>
          {sel === "SKILL.md" ? (
            <SkillFileBody lines={sk.skillMd} skillName={sk.name} skillDesc={sk.desc} />
          ) : (
            <div className="jsd-codeflow">
              <CodeBlock lines={selLines} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the SkillDetailProps shape at the App.tsx call site.
registerScreen("detail", SkillDetail as unknown as ComponentType<Record<string, unknown>>);
export default SkillDetail;
