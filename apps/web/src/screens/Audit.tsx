// Audit "moment" screen (demo-critical #1). Props from App.tsx:
//   { runKey, onDone: (view) => void, onOpenSkill: (sk) => void }
// Built 1:1 per apps/web/SPEC.md §5.1 + source skills-audit.jsx — matches the
// prototype DOM + classNames node-for-node, copy verbatim.
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import { RiskPill, RiskGlyph } from "../components/RiskPill";
import { SKILLS, AUDIT_ORDER, SCAN_LABELS, SOURCE_LABEL } from "../data/skills";
import type { Risk, Skill, View } from "../state/types";

// A row's status while the audit streams: "queued" → "scanning" → its risk.
export type RowStatus = "queued" | "scanning" | Risk;

// ---- Pure helpers (unit-tested in Audit.test.ts) ---------------------------

// Threats take a beat longer on stage so the red flash lands.
export function dwellForRisk(risk: Risk): number {
  return risk === "safe" ? 640 : 1250;
}

// A row is "resolved" once it has settled to a real verdict.
export function isResolved(st: RowStatus): boolean {
  return st === "safe" || st === "suspicious" || st === "malicious";
}

export function resolvedCount(statuses: RowStatus[]): number {
  return statuses.filter(isResolved).length;
}

export function deriveCounts(statuses: RowStatus[]) {
  return {
    safe: statuses.filter((s) => s === "safe").length,
    suspicious: statuses.filter((s) => s === "suspicious").length,
    malicious: statuses.filter((s) => s === "malicious").length,
  };
}

export function derivePct(resolved: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((resolved / total) * 100);
}

export function threatCount(counts: { suspicious: number; malicious: number }): number {
  return counts.suspicious + counts.malicious;
}

// Sub-line copy for a resolved threat row: prefer the curated headline,
// else fall back to the first finding's type.
export function findingFor(sk: Skill): string | undefined {
  return sk.headline || (sk.findings[0] && sk.findings[0].type);
}

// ---------------------------------------------------------------------------

interface AuditProps {
  runKey: number;
  onDone: (view: View) => void;
  onOpenSkill: (sk: Skill) => void;
}

function Audit({ onDone, onOpenSkill, runKey }: AuditProps) {
  const order = useMemo(
    () => AUDIT_ORDER.map((id) => SKILLS.find((s) => s.id === id)!),
    [],
  );
  const total = order.length;
  const [statuses, setStatuses] = useState<RowStatus[]>(() => order.map(() => "queued"));
  const [scanning, setScanning] = useState(0); // index scanning, or >=total when done
  const [label, setLabel] = useState(SCAN_LABELS[0]);
  const [started, setStarted] = useState(false); // gate: audit only runs after "Run audit"

  // reset when re-run
  useEffect(() => {
    setStatuses(order.map(() => "queued"));
    setScanning(0);
    setStarted(false);
  }, [runKey, order]);

  // drive the scan of the current row
  useEffect(() => {
    if (!started) return;
    if (scanning >= total) return;
    setStatuses((prev) => {
      const next = prev.slice();
      next[scanning] = "scanning";
      return next;
    });
    let li = 0;
    setLabel(SCAN_LABELS[0]);
    const labelTimer = setInterval(() => {
      li = (li + 1) % SCAN_LABELS.length;
      setLabel(SCAN_LABELS[li]);
    }, 480);
    const risk = order[scanning].risk;
    const dwell = dwellForRisk(risk); // threats take a beat longer
    const resolveTimer = setTimeout(() => {
      setStatuses((prev) => {
        const next = prev.slice();
        next[scanning] = risk;
        return next;
      });
      setScanning((s) => s + 1);
    }, dwell);
    return () => {
      clearInterval(labelTimer);
      clearTimeout(resolveTimer);
    };
  }, [started, scanning, total, order]);

  const resolved = resolvedCount(statuses);
  const done = scanning >= total;
  const counts = deriveCounts(statuses);
  const pct = derivePct(resolved, total);
  const threats = threatCount(counts);

  return (
    <div className="jsa">
      <div className="jsa-orch">
        <div className="jsa-orch-top">
          <div className="jsa-orch-ico">
            <SIcon name={!started ? "scan" : done ? "shield-check" : "scan"} size={20} />
          </div>
          <div className="jsa-orch-body">
            <div className="jsa-orch-title">
              {!started ? "Ready to audit" : done ? "Audit complete" : "Auditing imported skills"}
            </div>
            <div className="jsa-orch-sub">
              {!started
                ? <>{total} skills imported · open-weight auditor runs locally</>
                : done
                ? <>open-weight auditor · {total} skills · {threats} flagged</>
                : <>open-weight auditor running locally · <span className="live">{label}</span></>}
            </div>
          </div>
          {!started ? (
            <button className="jh-cta" onClick={() => setStarted(true)}>
              <SIcon name="scan" size={14} /> Run audit
            </button>
          ) : (
            <div className="jsa-counter">
              <b>{resolved}</b> / {total}
              <div style={{ fontSize: "10.5px", color: "var(--fg-3)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>audited</div>
            </div>
          )}
        </div>
        <div className="jsa-bar"><div className="jsa-bar-fill" style={{ width: pct + "%" }} /></div>
        <div className="jsa-bar-stats">
          <span className="safe">● <b>{counts.safe}</b> safe</span>
          <span className="warn">● <b>{counts.suspicious}</b> suspicious</span>
          <span className="danger">● <b>{counts.malicious}</b> malicious</span>
          <span style={{ marginLeft: "auto" }}>{total - resolved} queued</span>
        </div>
      </div>

      <div className="jsa-list">
        {order.map((sk, i) => {
          const st = statuses[i];
          const resolvedRow = isResolved(st);
          const finding = findingFor(sk);
          return (
            <div
              key={sk.id}
              className={"jsa-row " + st}
              onClick={() => resolvedRow && onOpenSkill(sk)}
              style={{ cursor: resolvedRow ? "pointer" : "default" }}
            >
              <div className="jsa-row-ico">
                {st === "queued" && <SIcon name="clock" size={15} />}
                {st === "scanning" && <SIcon name="scan" size={15} />}
                {resolvedRow && <RiskGlyph risk={st as Risk} size={16} />}
              </div>
              <div className="jsa-row-body">
                <div className="jsa-row-name">
                  {sk.name}
                  <span className="src">{SOURCE_LABEL[sk.source]}</span>
                </div>
                <div className="jsa-row-sub">
                  {st === "queued" && <>queued</>}
                  {st === "scanning" && <><span className="jsa-scan-dot" />{label}</>}
                  {st === "safe" && <>no findings · {sk.category}</>}
                  {st === "suspicious" && <><SIcon name="alert" size={12} />{finding}</>}
                  {st === "malicious" && <><SIcon name="ban" size={12} />{finding}</>}
                </div>
              </div>
              <div className="jsa-row-end">
                {st === "queued" && <RiskPill risk="queued" label="queued" sm />}
                {st === "scanning" && <RiskPill risk="scanning" label="scanning" sm />}
                {resolvedRow && <RiskPill risk={st as Risk} sm />}
              </div>
            </div>
          );
        })}
      </div>

      {done && (
        <div className={"jsa-done-bar" + (threats ? " has-threat" : "")}>
          <div className="jsa-done-ico">
            <SIcon name={threats ? "shield-alert" : "shield-check"} size={24} />
          </div>
          <div className="jsa-done-body">
            <div className="jsa-done-title">
              {threats
                ? `Caught ${threats} risky skill${threats > 1 ? "s" : ""} before they reached an agent.`
                : "All clear — every skill is safe to install."}
            </div>
            <div className="jsa-done-sub">
              {counts.safe} sorted into your library{threats ? `, ${threats} quarantined for review.` : "."}
            </div>
          </div>
          <button className="btn-secondary" onClick={() => onDone("library")}>
            <SIcon name="files" size={14} /> Open Library
          </button>
          {threats > 0 && (
            <button className="btn-primary" onClick={() => onDone("quarantine")}>
              <SIcon name="lock" size={14} /> Review Quarantine
            </button>
          )}
        </div>
      )}
    </div>
  );
}

registerScreen("audit", Audit as unknown as ComponentType<Record<string, unknown>>);
export default Audit;
