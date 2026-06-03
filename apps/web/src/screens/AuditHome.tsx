// Audit home / overview screen. Props from App.tsx:
//   { skills, onImport, onOpenQuarantine, onOpenSkill }
// Real data only: the headline stats and the skills list are derived from the
// live library (GET /skills, loaded in App). The former mock "recent runs" log
// (AUDIT_HISTORY) is gone — there is no audit-run history endpoint yet, so we
// show the audited skills themselves instead of fabricated run rows.
import type { ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import { RiskPill, RiskGlyph } from "../components/RiskPill";
import { auditHomeStats } from "../data/auditStats";
import { SOURCE_LABEL } from "../data/skills";
import type { Skill } from "../state/types";

interface AuditHomeProps {
  skills: Skill[];
  onImport: () => void;
  onOpenQuarantine: () => void;
  onOpenSkill: (sk: Skill) => void;
}

function AuditHome({ skills, onImport, onOpenQuarantine, onOpenSkill }: AuditHomeProps) {
  const { audited, safe, threats } = auditHomeStats(skills);

  return (
    <div className="jh">
      <div className="jh-head">
        <div className="jh-head-body">
          <h1 className="jsl-title">Audits</h1>
          <div className="jsl-sub">Every skill that’s passed through Jenz — uploads, GitHub pulls, and agent pushes.</div>
        </div>
        <button className="jh-cta" onClick={onImport}><SIcon name="import" size={15} /> Import &amp; audit</button>
      </div>

      <div className="jh-stats">
        <div className="jh-stat"><div className="jhs-v">{audited}</div><div className="jhs-l">skills audited</div></div>
        <div className="jh-stat"><div className="jhs-v">{safe}</div><div className="jhs-l">in library</div></div>
        <button className="jh-stat danger" onClick={onOpenQuarantine}>
          <div className="jhs-v">{threats}</div><div className="jhs-l">threats caught</div>
        </button>
      </div>

      {audited === 0 ? (
        <div className="jsl-empty">
          <span className="je-ico"><SIcon name="shield-check" size={32} /></span>
          <h3>No audited skills yet</h3>
          <p>Import a folder or a GitHub repo — Jenz audits every skill before it can reach an agent.</p>
        </div>
      ) : (
        <>
          <div className="jh-sec">Audited skills</div>
          <div className="jh-list">
            {skills.map((sk) => {
              const flagged = sk.risk !== "safe";
              return (
                <div
                  className="jh-row"
                  key={sk.id}
                  onClick={() => onOpenSkill(sk)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="jh-row-ico"><RiskGlyph risk={sk.risk} size={15} /></span>
                  <div className="jh-row-body">
                    <div className="jh-row-top"><b>{sk.name}</b> <span className="jh-trig">{SOURCE_LABEL[sk.source]}</span></div>
                    <div className="jh-row-when">
                      {sk.category}
                      {sk.findings.length > 0 && <>{sk.category ? " · " : ""}{sk.findings.length} finding{sk.findings.length > 1 ? "s" : ""}</>}
                    </div>
                  </div>
                  <div className="jh-row-end">
                    {flagged
                      ? <span className="jh-verdict bad"><SIcon name="shield-alert" size={13} /> quarantined</span>
                      : <span className="jh-verdict ok"><SIcon name="shield-check" size={13} /> safe</span>}
                    <RiskPill risk={sk.risk} sm />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the AuditHomeProps shape at the App.tsx call site.
registerScreen("auditHome", AuditHome as unknown as ComponentType<Record<string, unknown>>);
export default AuditHome;
