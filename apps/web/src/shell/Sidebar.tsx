// App shell — left sidebar: import button, nav, collapsible library
// categories (drag targets), quarantine, workspace footer + popover.
// DOM + classNames ported node-for-node from skills-app.jsx Sidebar().
import { useRef, useState } from "react";
import { SIcon } from "../components/SIcon";
import type { Skill, View } from "../state/types";
import { AUDIT_HISTORY } from "../data/auditHistory";
import { useOutside } from "../components/useOutside";

interface SidebarProps {
  view: View;
  activeCategory: string | null;
  skillId: string | null;
  skills: Skill[];
  categories: string[];
  onNav: (view: View, cat?: string | null) => void;
  onOpenSkill: (id: string) => void;
  onAddCategory: (name: string) => void;
  onAddSkill: (cat: string, name: string) => void;
  onDropSkill: (id: string, cat: string) => void;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onImport: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    view, activeCategory, skillId, skills, categories, onNav, onOpenSkill,
    onAddCategory, onAddSkill, onDropSkill, dragging, theme, onToggleTheme, onLogout,
  } = props;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newFolder, setNewFolder] = useState(false);
  const [nfName, setNfName] = useState("");
  const [addingCat, setAddingCat] = useState<string | null>(null);
  const [skName, setSkName] = useState("");
  const [dropCat, setDropCat] = useState<string | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  useOutside(popRef, () => setPopOpen(false), popOpen);

  const safe = skills.filter((s) => s.risk === "safe");
  const quarCount = skills.filter((s) => s.risk !== "safe").length;
  const byCat = (c: string) => safe.filter((s) => s.category === c);

  const commitFolder = () => {
    if (nfName.trim()) onAddCategory(nfName.trim());
    setNfName(""); setNewFolder(false);
  };
  const commitSkill = (c: string) => {
    if (skName.trim()) onAddSkill(c, skName.trim());
    setSkName(""); setAddingCat(null);
  };

  return (
    <div className="js-sidebar">
      <div className="js-side-top">
        <button className="js-import-btn" onClick={props.onImport}>
          <SIcon name="import" size={14} /> Import skills
        </button>
      </div>

      <div className="js-side-scroll">
        <div className="js-nav">
          <button
            className={"js-nav-item" + (view === "audits" || view === "audit" ? " active" : "")}
            onClick={() => onNav("audits")}
          >
            <span className="ji-icon"><SIcon name="scan" size={16} /></span>
            <span className="ji-label">Audits</span>
            <span className="ji-count">{AUDIT_HISTORY.length}</span>
          </button>
          <button
            className={"js-nav-item" + (view === "library" && !activeCategory ? " active" : "")}
            onClick={() => onNav("library", null)}
          >
            <span className="ji-icon"><SIcon name="files" size={16} /></span>
            <span className="ji-label">All skills</span>
            <span className="ji-count">{safe.length}</span>
          </button>
        </div>

        <div className="js-side-sec">
          Library <span className="jss-count">{categories.length}</span>
          <button className="jss-act" title="New folder" onClick={() => setNewFolder(true)}>
            <SIcon name="plus" size={13} />
          </button>
        </div>

        {newFolder && (
          <div className="js-newfolder">
            <span className="nf-ico"><SIcon name="folder" size={13} /></span>
            <input
              autoFocus value={nfName} placeholder="folder name…"
              onChange={(e) => setNfName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitFolder();
                if (e.key === "Escape") { setNewFolder(false); setNfName(""); }
              }}
              onBlur={commitFolder}
            />
          </div>
        )}

        {categories.map((cat) => {
          const items = byCat(cat);
          const col = collapsed[cat];
          return (
            <div className="js-grp" key={cat}>
              <button
                className={
                  "js-grp-head" +
                  (view === "library" && activeCategory === cat ? " active" : "") +
                  (col ? " collapsed" : "") +
                  (dropCat === cat ? " drop" : "")
                }
                onClick={() => onNav("library", cat)}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); setDropCat(cat); } }}
                onDragLeave={() => setDropCat((d) => (d === cat ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragging;
                  if (id) onDropSkill(id, cat);
                  setDropCat(null);
                }}
              >
                <span
                  className="jg-tw"
                  onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [cat]: !c[cat] })); }}
                >
                  <SIcon name="chev-down" size={12} />
                </span>
                <span className="jg-ico"><SIcon name="folder" size={14} /></span>
                <span className="jg-label">{cat}</span>
                <span className="jg-count">{items.length}</span>
                <span
                  className="jg-add" title="Add skill"
                  onClick={(e) => { e.stopPropagation(); setAddingCat(cat); }}
                >
                  <SIcon name="plus" size={12} />
                </span>
              </button>
              {addingCat === cat && (
                <div className="js-newfolder" style={{ marginLeft: 18 }}>
                  <span className="nf-ico"><SIcon name="skills" size={12} /></span>
                  <input
                    autoFocus value={skName} placeholder="skill-name…"
                    onChange={(e) => setSkName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitSkill(cat);
                      if (e.key === "Escape") { setAddingCat(null); setSkName(""); }
                    }}
                    onBlur={() => commitSkill(cat)}
                  />
                </div>
              )}
              {!col && (
                <div className="js-grp-items">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      className={"js-sk" + (view === "detail" && skillId === s.id ? " active" : "")}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        props.onDragStart(s.id);
                      }}
                      onDragEnd={() => props.onDragEnd()}
                      onClick={() => onOpenSkill(s.id)}
                    >
                      <span className="jsk-name">{s.name}</span>
                    </button>
                  ))}
                  {items.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--fg-4)", padding: "3px 10px", fontFamily: "var(--font-mono)" }}>
                      empty — drag a skill here
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="js-side-sep" />

        <div className="js-nav">
          <button
            className={"js-nav-item danger" + (view === "quarantine" ? " active" : "")}
            onClick={() => onNav("quarantine")}
          >
            <span className="ji-icon"><SIcon name="lock" size={16} /></span>
            <span className="ji-label">Quarantine</span>
            <span className="ji-count danger">{quarCount}</span>
          </button>
        </div>
      </div>

      <div className="js-ws-wrap" ref={popRef}>
        {popOpen && (
          <div className="js-ws-pop">
            <button className="jwp-item" onClick={() => { setPopOpen(false); onNav("settings"); }}>
              <SIcon name="settings" size={15} /> Settings
            </button>
            <button className="jwp-item" onClick={() => onToggleTheme()}>
              <SIcon name="sparkles" size={15} /> Theme
              <span className="jwp-val">{theme === "light" ? "Light" : "Dark"}</span>
            </button>
            <div className="jwp-sep" />
            <button className="jwp-item danger" onClick={() => { setPopOpen(false); onLogout(); }}>
              <SIcon name="external" size={15} /> Log out
            </button>
          </div>
        )}
        <button className={"js-ws" + (popOpen ? " open" : "")} onClick={() => setPopOpen((o) => !o)}>
          <span className="js-ws-avatar">B</span>
          <span className="js-ws-name">
            Bicone<span className="sub">{skills.length} skills · audited</span>
          </span>
          <SIcon name="chev-up" size={14} />
        </button>
      </div>
    </div>
  );
}
