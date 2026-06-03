// App shell — breadcrumb. Always starts "Bicone"; segments per view.
// Ported node-for-node from skills-app.jsx Breadcrumb().
import { Fragment } from "react";
import type { Skill, View } from "../state/types";

interface Seg {
  label: string;
  current?: boolean;
  go?: () => void;
}

interface BreadcrumbProps {
  view: View;
  activeCategory: string | null;
  skill?: Skill;
  onNav: (view: View, cat?: string | null) => void;
}

export function Breadcrumb({ view, activeCategory, skill, onNav }: BreadcrumbProps) {
  const segs: Seg[] = [{ label: "Bicone", go: () => onNav("library", null) }];
  if (view === "audit" || view === "audits") segs.push({ label: "Audits", current: true });
  else if (view === "settings") segs.push({ label: "Settings", current: true });
  else if (view === "quarantine") segs.push({ label: "Quarantine", current: true });
  else if (view === "library") {
    segs.push({ label: "Library", current: !activeCategory, go: () => onNav("library", null) });
    if (activeCategory) segs.push({ label: activeCategory, current: true });
  } else if (view === "detail" && skill) {
    const inQuar = skill.risk !== "safe";
    segs.push({
      label: inQuar ? "Quarantine" : skill.category,
      go: () => onNav(inQuar ? "quarantine" : "library", inQuar ? null : skill.category),
    });
    segs.push({ label: skill.name, current: true });
  }
  return (
    <div className="js-crumb">
      {segs.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="jc-sep">/</span>}
          <span className={"jc-seg" + (s.current ? " current" : "")} onClick={s.go}>{s.label}</span>
        </Fragment>
      ))}
    </div>
  );
}
