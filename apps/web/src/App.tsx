// Jenz Skills — app root. Owns the state machine (screen × view + aux state),
// titlebar, sidebar, breadcrumb, main pane, toast. Ports skills-app.jsx App().
// Screen panes are wired through ScreenSlot; later tasks replace the slots
// with the real Audit / Library / SkillDetail / AuditHome / Settings screens.
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { SIcon } from "./components/SIcon";
import { Sidebar } from "./shell/Sidebar";
import { Breadcrumb } from "./shell/Breadcrumb";
import { TARGET_BY_ID } from "./data/targets";
import { SOURCE_LABEL } from "./data/skills";
import type { MdLine, Screen, Skill, View } from "./state/types";
import { ScreenSlot } from "./shell/ScreenSlot";
import { listSkills } from "./lib/api";
import { listItemToSkill, auditedToSkill } from "./lib/adapt";
import type { ImportSource } from "./screens/onboardingLogic";
import type { AuditedSkill } from "@jenz/shared";
import { useAuth } from "./auth/AuthProvider";

// Unique, non-empty folder names across a skill set.
const catsOf = (arr: Skill[]) =>
  Array.from(new Set(arr.map((s) => s.category))).filter(Boolean);

interface Toast {
  msg: ReactNode;
  id: number;
}

export default function App() {
  // Land returning users in the app, not the wizard. Onboarding completion is
  // remembered in localStorage (set in handleOnboardingComplete).
  const [screen, setScreen] = useState<Screen>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("jenz-onboarded") === "1"
      ? "app"
      : "onboarding",
  );
  const [view, setView] = useState<View>("audits");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [skillId, setSkillId] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [installs, setInstalls] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [auditSources, setAuditSources] = useState<ImportSource[]>([]);
  const { workspace, signOut, renameWorkspace } = useAuth();

  useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
  }, [theme]);

  // Load the live skill library (GET /skills) on mount. On failure we show an
  // HONEST empty/error state — never bundled fixtures. This is a security tool:
  // silently substituting fake skills for a failed audit fetch would be worse
  // than showing nothing. (The gate/verdict logic is server-side regardless.)
  useEffect(() => {
    let alive = true;
    listSkills()
      .then((items) => {
        if (!alive) return;
        const live = items.map(listItemToSkill);
        setSkills(live);
        setCategories(catsOf(live));
      })
      .catch((e) => {
        if (!alive) return;
        console.warn("[jenz] failed to load skills from the audit API", e);
        setSkills([]);
        setCategories([]);
        notify(<>Couldn't reach the audit service — no skills loaded.</>);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (msg: ReactNode) => setToast({ msg, id: Date.now() });

  const skill = useMemo(() => skills.find((s) => s.id === skillId), [skills, skillId]);

  const nav = (v: View, cat?: string | null) => {
    setView(v);
    if (v === "library") setActiveCategory(cat ?? null);
    if (v !== "detail") setSkillId(null);
  };
  const openSkill = (arg: string | Skill) => {
    const id = typeof arg === "string" ? arg : arg.id;
    setSkillId(id);
    setView("detail");
  };

  // Onboarding finished: take the user's chosen sources into the streaming
  // audit run, then land them in the app.
  const handleOnboardingComplete = (ws: string, sources: ImportSource[]) => {
    // Persist the onboarding-chosen name to the real (auth) workspace.
    if (ws && ws !== workspace?.name) void renameWorkspace({ name: ws });
    // Remember onboarding is done so a refresh lands in the app, not the wizard.
    try { localStorage.setItem("jenz-onboarded", "1"); } catch { /* ignore */ }
    setAuditSources(sources);
    setRunKey((k) => k + 1);
    setView("audit");
    setScreen("app");
  };

  // A streamed verdict arrived — adapt it to a web Skill and upsert into the
  // library so it appears in its folder live (it's persisted server-side too).
  const handleResolved = (audited: AuditedSkill & { id: string }) => {
    const sk = auditedToSkill(audited);
    setSkills((arr) => {
      const i = arr.findIndex((s) => s.id === sk.id);
      if (i === -1) return [...arr, sk];
      const next = arr.slice();
      next[i] = sk;
      return next;
    });
    setCategories((prev) => (prev.includes(sk.category) ? prev : [...prev, sk.category]));
  };

  const moveSkill = (id: string, cat: string) => {
    const sk = skills.find((s) => s.id === id);
    if (!sk || sk.category === cat) return;
    setSkills((arr) => arr.map((s) => (s.id === id ? { ...s, category: cat } : s)));
    notify(<><b>{sk.name}</b> moved to <b>{cat}</b></>);
  };
  const addCategory = (name: string) => {
    if (categories.includes(name)) { notify(<><b>{name}</b> already exists</>); return; }
    setCategories((c) => [...c, name]);
    notify(<>Folder <b>{name}</b> created</>);
  };
  // CLIENT-SIDE ONLY: creates a local skill (unaudited). A real "new skill"
  // should route through the import/audit pipeline + persist, not appear safe.
  const addSkill = (cat: string, name: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill-" + Date.now();
    if (skills.some((s) => s.id === id)) { notify(<><b>{id}</b> already exists</>); return; }
    const md: MdLine[] = [
      { n: 1, text: "---", kind: "com" }, { n: 2, text: "name: " + id }, { n: 3, text: "description: New skill — add a description." },
      { n: 4, text: "category: " + cat }, { n: 5, text: "---", kind: "com" }, { n: 6, text: "" },
      { n: 7, text: "# " + id, kind: "h" }, { n: 8, text: "" }, { n: 9, text: "Describe when an agent should use this skill." },
    ];
    setSkills((arr) => [...arr, { id, name: id, category: cat, source: "claude", risk: "safe", desc: "New skill — add a description.", findings: [], skillMd: md, files: 1 }]);
    notify(<>Skill <b>{id}</b> added to <b>{cat}</b></>);
  };
  // ---- install actions ----
  // CLIENT-SIDE ONLY: installs are kept in local state and not persisted. Needs
  // a backend (e.g. POST /skills/:id/install + GET to hydrate) before it's real.
  const installOne = (id: string, target: string) => {
    const sk = skills.find((s) => s.id === id);
    const t = TARGET_BY_ID[target];
    setInstalls((m) => ({ ...m, [id]: Array.from(new Set([...(m[id] || []), target])) }));
    if (sk && t) notify(<><b>{sk.name}</b> installed to <b>{t.name}</b></>);
  };
  const bulkInstall = (target: string, ids: string[]) => {
    const t = TARGET_BY_ID[target];
    setInstalls((m) => {
      const next = { ...m };
      ids.forEach((id) => {
        const cur = next[id] || [];
        if (!cur.includes(target)) next[id] = [...cur, target];
      });
      return next;
    });
    if (t) notify(<>Installed <b>{ids.length}</b> skills to <b>{t.name}</b></>);
  };

  // ---- quarantine actions ----
  // CLIENT-SIDE ONLY: delete/report/rescan/approve mutate local state for the
  // demo. Real versions need backend endpoints (DELETE /skills/:id, a verdict
  // override/report route, a re-audit trigger) — none exist yet.
  const deleteSkill = (id: string) => {
    const sk = skills.find((s) => s.id === id);
    setSkills((arr) => arr.filter((s) => s.id !== id));
    setSkillId(null);
    setView("quarantine");
    if (sk) notify(<><b>{sk.name}</b> deleted from the workspace</>);
  };
  const reportSkill = (id: string) => {
    const sk = skills.find((s) => s.id === id);
    setSkills((arr) => arr.map((s) => (s.id === id ? { ...s, reported: true } : s)));
    if (sk) notify(<>Reported <b>{sk.name}</b> to {SOURCE_LABEL[sk.source]} + threat feed</>);
  };
  const rescanSkill = (id: string) => {
    const sk = skills.find((s) => s.id === id);
    if (sk) notify(<>Re-scan complete — <b>{sk.findings.length} finding{sk.findings.length > 1 ? "s" : ""}</b> still present. Still quarantined.</>);
  };
  const approveSkill = (id: string) => {
    const sk = skills.find((s) => s.id === id);
    setSkills((arr) => arr.map((s) => (s.id === id ? { ...s, risk: "safe", overridden: true, findings: [] } : s)));
    setSkillId(null);
    if (sk) {
      setActiveCategory(sk.category);
      setView("library");
      notify(<>Override accepted — <b>{sk.name}</b> moved to <b>{sk.category}</b></>);
    }
  };

  // In-app re-import (the Import modal, from the sidebar / AuditHome). The modal
  // collects ImportSource[] (folder uploads + GitHub) the same way onboarding
  // does, and we stream-audit them through the live API — same path as
  // handleOnboardingComplete, just without leaving the app.
  const runImport = (sources: ImportSource[]) => {
    setImportOpen(false);
    setAuditSources(sources);
    setRunKey((k) => k + 1);
    setView("audit");
  };

  if (screen === "onboarding") {
    return (
      <div className="js-win">
        <div className="js-shell" style={{ gridTemplateColumns: "1fr" }}>
          <div className="js-main">
            <ScreenSlot kind="onboarding" props={{ onComplete: handleOnboardingComplete }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="js-win">
      <div className="js-titlebar">
        <div className="js-title">
          <span className="js-logo"><SIcon name="shield-check" size={12} /></span>
          jenz managed skills <span className="js-title-sub">· {workspace?.name ?? "Workspace"}</span>
        </div>
        <div className="js-titlebar-end"><SIcon name="shield-check" size={13} /> auditor online</div>
      </div>

      <div className="js-shell">
        <Sidebar
          view={view} activeCategory={activeCategory} skillId={skillId}
          skills={skills} categories={categories}
          onNav={nav} onOpenSkill={openSkill}
          onAddCategory={addCategory} onAddSkill={addSkill} onDropSkill={moveSkill}
          dragging={dragging} onDragStart={setDragging} onDragEnd={() => setDragging(null)}
          onImport={() => setImportOpen(true)}
          theme={theme} onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          onLogout={() => { setScreen("onboarding"); setView("audits"); void signOut(); }}
        />
        <div className="js-main">
          <Breadcrumb view={view} activeCategory={activeCategory} skill={skill} onNav={nav} />
          {view === "audits" && (
            <div className="js-body">
              <ScreenSlot kind="auditHome" props={{ skills, onImport: () => setImportOpen(true), onOpenQuarantine: () => nav("quarantine"), onOpenSkill: openSkill }} />
            </div>
          )}
          {view === "settings" && <ScreenSlot kind="settings" props={{}} />}
          {view === "audit" && (
            <div className="js-body">
              <ScreenSlot kind="audit" props={{ runKey, sources: auditSources, onResolved: handleResolved, onDone: (v: View) => nav(v, null), onOpenSkill: openSkill }} />
            </div>
          )}
          {(view === "library" || view === "quarantine") && (
            <div className="js-body">
              <ScreenSlot
                kind="library"
                props={{
                  mode: view, activeCategory, skills, installs,
                  onOpenSkill: openSkill, onBulkInstall: bulkInstall,
                  onDragStart: setDragging, onDragEnd: () => setDragging(null), draggingId: dragging,
                }}
              />
            </div>
          )}
          {view === "detail" && skill && (
            <ScreenSlot
              kind="detail"
              props={{
                sk: skill, installed: installs[skill.id] || [], onInstall: installOne,
                onDelete: deleteSkill, onReport: reportSkill, onRescan: rescanSkill, onApprove: approveSkill,
              }}
            />
          )}
        </div>
      </div>

      {toast && (
        <div className="js-toast" key={toast.id}>
          <span className="jt-ico"><SIcon name="check-circle" size={16} /></span>
          <span>{toast.msg}</span>
        </div>
      )}
      <ScreenSlot kind="importModal" props={{ open: importOpen, onClose: () => setImportOpen(false), onAudit: runImport }} />
    </div>
  );
}
