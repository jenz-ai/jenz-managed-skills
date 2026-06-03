// Library / Quarantine screen (demo-critical #3). Props from App.tsx:
//   { mode: "library"|"quarantine", activeCategory, skills, installs,
//     onOpenSkill, onBulkInstall, onDragStart, onDragEnd, draggingId }
// Ported node-for-node from skills-library.jsx (SPEC §5.3). One component
// switched by mode; the pure list-filter + top-finding logic is extracted
// (filterSkills / topFinding) and unit-tested in Library.test.ts.
import type { ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import { RiskPill } from "../components/RiskPill";
import { InstallMenu } from "../components/InstallMenu";
import { InstalledChips } from "../components/InstalledChips";
import { SOURCE_LABEL } from "../data/skills";
import type { Skill } from "../state/types";

type Mode = "library" | "quarantine";

// --- pure logic (tested) -------------------------------------------------
// Library shows the vetted (safe) set, optionally scoped to a category.
// Quarantine shows everything held back (non-safe), no category filter.
export function filterSkills(
  skills: Skill[],
  mode: Mode,
  activeCategory: string | null,
): Skill[] {
  const quarantine = mode === "quarantine";
  let list = skills.filter((s) => (quarantine ? s.risk !== "safe" : s.risk === "safe"));
  if (!quarantine && activeCategory) list = list.filter((s) => s.category === activeCategory);
  return list;
}

// The flagged card's headline line: prefer the skill's headline, else the
// first finding's type, else undefined (card omits the line).
export function topFinding(sk: Skill): string | undefined {
  return sk.headline || (sk.findings[0] && sk.findings[0].type);
}

// --- card ----------------------------------------------------------------
interface SkillCardProps {
  sk: Skill;
  installed: string[];
  onOpen: (sk: Skill) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  dragging: boolean;
}

function SkillCard({ sk, installed, onOpen, onDragStart, onDragEnd, dragging }: SkillCardProps) {
  const flagged = sk.risk !== "safe";
  const finding = topFinding(sk);
  return (
    <button
      className={"skill-card " + sk.risk + (dragging ? " dragging" : "")}
      draggable={!flagged}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", sk.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart && onDragStart(sk.id);
      }}
      onDragEnd={() => onDragEnd && onDragEnd()}
      onClick={() => onOpen(sk)}
    >
      <div className="skill-card-top">
        <div className="skill-card-name">{sk.name}</div>
        {flagged ? <RiskPill risk={sk.risk} sm /> : <InstalledChips ids={installed} />}
      </div>
      <div className="skill-card-desc">{sk.desc}</div>
      {flagged && finding && (
        <div className="skill-card-finding-line">
          <span className="fl-ico"><SIcon name={sk.risk === "malicious" ? "ban" : "alert"} size={12} /></span>
          {finding}
        </div>
      )}
      <div className="skill-card-foot">
        {sk.category && (
          <span className="skill-card-tag">
            <span className="t-glyph"><SIcon name="folder" size={12} /></span>
            {sk.category}
          </span>
        )}
        <span className="skill-card-tag">{SOURCE_LABEL[sk.source]}</span>
        {flagged ? (
          <span className="skill-card-findings has">
            {sk.findings.length} finding{sk.findings.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="skill-card-findings">
            {installed && installed.length ? `on ${installed.length} tool${installed.length > 1 ? "s" : ""}` : "not installed"}
          </span>
        )}
      </div>
    </button>
  );
}

// --- screen --------------------------------------------------------------
interface LibraryProps {
  mode: Mode;
  activeCategory: string | null;
  skills: Skill[];
  installs: Record<string, string[]>;
  onOpenSkill: (sk: Skill) => void;
  onBulkInstall: (target: string, ids: string[]) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  draggingId: string | null;
}

function Library({
  mode,
  activeCategory,
  skills,
  installs,
  onOpenSkill,
  onBulkInstall,
  onDragStart,
  onDragEnd,
  draggingId,
}: LibraryProps) {
  const quarantine = mode === "quarantine";
  const list = filterSkills(skills, mode, activeCategory);

  return (
    <div className="jsl">
      <div className={"jsl-head" + (quarantine ? " quar" : "")}>
        <div className="jsl-head-body">
          <h1 className="jsl-title">{quarantine ? "Quarantine" : activeCategory || "All skills"}</h1>
          <div className="jsl-sub">
            {quarantine
              ? "Skills held back from your agents until you clear or remove them."
              : `${list.length} vetted skill${list.length === 1 ? "" : "s"} · canonical form · install to any tool`}
          </div>
        </div>
        {!quarantine && list.length > 0 && (
          <InstallMenu
            ghost
            label="Install all to"
            note="Installs every skill shown here to the chosen tool. Already-installed skills are skipped."
            onInstall={(target) => onBulkInstall(target, list.map((s) => s.id))}
          />
        )}
      </div>

      {quarantine && list.length > 0 && (
        <div className="jsl-banner">
          <span className="jb-ico"><SIcon name="shield-alert" size={18} /></span>
          <div>
            <b>{list.length} skill{list.length > 1 ? "s" : ""} blocked.</b> Install is disabled
            until each is reviewed. Nothing here can reach an agent.
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="jsl-empty">
          <span className="je-ico"><SIcon name="shield-check" size={32} /></span>
          <h3>{quarantine ? "Nothing quarantined" : "No skills here yet"}</h3>
          <p>{quarantine ? "Every imported skill passed the audit." : "Drag a skill here, or import more from a tool."}</p>
        </div>
      ) : (
        <div className="jsl-grid">
          {list.map((sk) => (
            <SkillCard
              key={sk.id}
              sk={sk}
              installed={installs[sk.id] || []}
              onOpen={onOpenSkill}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              dragging={draggingId === sk.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the LibraryProps shape at the App.tsx call site.
registerScreen("library", Library as unknown as ComponentType<Record<string, unknown>>);
export default Library;
