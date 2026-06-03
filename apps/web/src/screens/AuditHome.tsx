// Audit home / history screen. Props from App.tsx:
//   { onImport, onOpenQuarantine }
// Ported node-for-node from skills-history.jsx (SPEC §6). The headline stats
// (Σ scanned, Σ threats, per-row threats) are derived by pure helpers in
// data/auditHistory.ts and unit-tested in auditHistory.test.ts.
import type { ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import {
  AUDIT_HISTORY,
  runThreats,
  totalScanned,
  totalThreats,
  trigMeta,
} from "../data/auditHistory";

interface AuditHomeProps {
  onImport: () => void;
  onOpenQuarantine: () => void;
}

function AuditHome({ onImport, onOpenQuarantine }: AuditHomeProps) {
  const scanned = totalScanned(AUDIT_HISTORY);
  const threats = totalThreats(AUDIT_HISTORY);
  const last = AUDIT_HISTORY[0];

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
        <div className="jh-stat"><div className="jhs-v">{scanned}</div><div className="jhs-l">skills audited</div></div>
        <div className="jh-stat"><div className="jhs-v">{AUDIT_HISTORY.length}</div><div className="jhs-l">audit runs</div></div>
        <button className="jh-stat danger" onClick={onOpenQuarantine}>
          <div className="jhs-v">{threats}</div><div className="jhs-l">threats caught</div>
        </button>
        <div className="jh-stat"><div className="jhs-v sm">{last.when}</div><div className="jhs-l">last run</div></div>
      </div>

      <div className="jh-sec">Recent runs</div>
      <div className="jh-list">
        {AUDIT_HISTORY.map((r) => {
          const m = trigMeta(r.trigger);
          const rowThreats = runThreats(r);
          return (
            <div className="jh-row" key={r.id}>
              <span className="jh-row-ico"><SIcon name={m.icon} size={15} /></span>
              <div className="jh-row-body">
                <div className="jh-row-top"><b>{r.source}</b> <span className="jh-trig">{m.label}</span></div>
                <div className="jh-row-when">{r.when} · {r.scanned} skill{r.scanned > 1 ? "s" : ""} scanned</div>
              </div>
              <div className="jh-row-end">
                {rowThreats === 0
                  ? <span className="jh-verdict ok"><SIcon name="shield-check" size={13} /> all clear</span>
                  : <span className="jh-verdict bad"><SIcon name="shield-alert" size={13} /> {rowThreats} quarantined</span>}
                <span className="jh-bd">
                  <span className="jh-bd-i safe" title="safe">{r.safe}</span>
                  {r.suspicious > 0 && <span className="jh-bd-i warn" title="suspicious">{r.suspicious}</span>}
                  {r.malicious > 0 && <span className="jh-bd-i danger" title="malicious">{r.malicious}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The screen registry passes props opaquely (Record<string, unknown>); the
// shell guarantees the AuditHomeProps shape at the App.tsx call site.
registerScreen("auditHome", AuditHome as unknown as ComponentType<Record<string, unknown>>);
export default AuditHome;
