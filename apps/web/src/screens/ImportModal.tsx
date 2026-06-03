// In-app Import modal. Props from App.tsx:
//   { open, onClose, onAudit: (sources: ImportSource[]) => void }
//
// The returning-user counterpart to the onboarding "Add skills" step: stage
// skills from a folder upload or a GitHub repo, then stream-audit them through
// the live API (App.runImport feeds the collected ImportSource[] into the audit
// screen, exactly like onboarding's handleOnboardingComplete). Before this, the
// sidebar/AuditHome "Import" buttons opened an unregistered slot that rendered
// nothing, and runImport() passed an empty source list — so in-app import was a
// dead end. This wires it to the real streaming path.
//
// Reuses the already-authored `jim-*` modal CSS (skills.css §import modal) and
// the onboarding `ob-choice`/`ob-staged` affordances + the SAME pure helpers
// (buildInlineSources / parseRepoLabel / scanSkillDirs), so behaviour matches
// onboarding exactly. MCP is intentionally omitted — connecting an agent is a
// connect-once flow (onboarding / settings), not a per-import action.
import { useEffect, useRef, useState, type ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import {
  buildInlineSources,
  parseRepoLabel,
  scanSkillDirs,
  type ImportSource,
  type StagedGroup,
} from "./onboardingLogic";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onAudit: (sources: ImportSource[]) => void;
}

// A staged group plus the ImportSource(s) it produced. Keeping the sources ON
// the group means removing a group prunes its sources too — no orphaned sources
// reaching the audit (a looseness the onboarding screen has with its separate
// importSources array).
interface ModalGroup extends StagedGroup {
  sources: ImportSource[];
}

function ImportModal({ open, onClose, onAudit }: ImportModalProps) {
  const [groups, setGroups] = useState<ModalGroup[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const folderRef = useRef<HTMLInputElement | null>(null);
  const gidRef = useRef(0);

  // Fresh modal each time it opens — no stale staging from a prior import.
  useEffect(() => {
    if (open) {
      setGroups([]);
      setRepoUrl("");
    }
  }, [open]);

  // Esc closes the modal while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sources = groups.flatMap((g) => g.sources);

  const addGroup = (g: Omit<ModalGroup, "id">) =>
    setGroups((prev) => [...prev, { id: "img-" + gidRef.current++, ...g }]);
  const removeGroup = (id: string) => setGroups((prev) => prev.filter((g) => g.id !== id));

  const openFolder = () => {
    folderRef.current && folderRef.current.click();
  };

  // Mirrors Onboarding.onFolder: read each file's text, build inline sources
  // from the SKILL.md-bearing directories (file CONTENTS, not just names).
  const onFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const first = files[0] as File & { webkitRelativePath?: string };
    const root = (first.webkitRelativePath || first.name).split("/")[0] || "skills";

    const fileEntries: { path: string; content: string }[] = [];
    await Promise.all(
      files.map(async (f) => {
        const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        try {
          fileEntries.push({ path, content: await f.text() });
        } catch {
          console.warn(`[jenz] skipping unreadable file: ${path}`);
        }
      }),
    );

    const skillDirNames = scanSkillDirs(fileEntries.map((fe) => fe.path), root);
    if (skillDirNames.length > 0) {
      const skills = skillDirNames.map((n) => ({ id: "im-" + gidRef.current++ + "-" + n, name: n }));
      addGroup({ kind: "upload", label: root, sub: root + "/", skills, sources: buildInlineSources(fileEntries) });
    } else if (fileEntries.length > 0) {
      // No SKILL.md dir — submit the readable files as one inline source. We
      // can't know the skill names client-side, so stage it as a source with no
      // fabricated names; the real skills surface when the audit runs.
      addGroup({
        kind: "upload",
        label: root,
        sub: "folder · audited on import",
        skills: [],
        sources: [{ kind: "inline", name: root, files: fileEntries }],
      });
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
    // Can't enumerate a repo's skills in the browser — stage it as a source
    // (no fabricated names); real skills appear as the audit streams them.
    addGroup({
      kind: "github",
      label,
      sub: "github repo · audited on import",
      skills: [],
      sources: [{ kind: "github", url, label }],
    });
    setRepoUrl("");
  };

  const runAudit = () => {
    if (sources.length === 0) return;
    onAudit(sources);
  };

  return (
    <div className="jim-overlay" onClick={onClose}>
      <div className="jim" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="jim-head">
          <div className="jim-title">
            <SIcon name="import" size={16} /> Import skills
          </div>
          <button className="jim-x" title="Close" onClick={onClose}>
            <SIcon name="x" size={15} />
          </button>
        </div>

        <div className="jim-body">
          <p className="jim-note">
            Every skill is audited for prompt injection before it can reach an agent.
          </p>

          <div className="ob-choice-grid">
            <button className="ob-region ob-choice" onClick={openFolder}>
              <span className="ob-choice-glyph"><SIcon name="folder" size={18} /></span>
              <div className="ob-choice-name">Upload a folder</div>
              <div className="ob-choice-hint">Drop a skills folder</div>
            </button>

            <div className="ob-region ob-choice ob-choice-gh">
              <span className="ob-choice-glyph"><SIcon name="github" size={18} /></span>
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

          {groups.length > 0 && (
            <div className="ob-staged" style={{ marginTop: 16 }}>
              {groups.map((g) => (
                <div className="ob-grp" key={g.id}>
                  <div className="ob-grp-head">
                    <span className="ob-grp-ico">
                      <SIcon name={g.kind === "github" ? "github" : "folder"} size={14} />
                    </span>
                    <span className="ob-grp-label">{g.label}</span>
                    <span className="ob-grp-sub">{g.sub}</span>
                    {g.skills.length > 0 && (
                      <span className="ob-grp-count">
                        {g.skills.length} skill{g.skills.length > 1 ? "s" : ""}
                      </span>
                    )}
                    <button className="ob-grp-x" title="Remove source" onClick={() => removeGroup(g.id)}>
                      <SIcon name="x" size={13} />
                    </button>
                  </div>
                  {g.skills.length > 0 && (
                    <div className="ob-grp-list">
                      {g.skills.map((sk) => (
                        <div className="ob-skrow" key={sk.id}>
                          <span className="ob-skrow-ico"><SIcon name="skills" size={13} /></span>
                          <span className="ob-skrow-name">{sk.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="jim-foot">
          <button className="jim-cancel" onClick={onClose}>Cancel</button>
          <button className="jim-go" onClick={runAudit} disabled={sources.length === 0}>
            <SIcon name="scan" size={14} />
            {sources.length > 0 ? `Audit ${sources.length} source${sources.length > 1 ? "s" : ""}` : "Audit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the ImportModalProps shape at the App.tsx call site.
registerScreen("importModal", ImportModal as unknown as ComponentType<Record<string, unknown>>);
export default ImportModal;
