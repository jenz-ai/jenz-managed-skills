// Audit "moment" screen — streams live verdicts from the real audit API.
// Props (new contract — App.tsx wires these):
//   { runKey, sources, onResolved, onDone, onOpenSkill }
// Visual structure, classNames, and all pure helpers are PRESERVED 1:1.
// The only change is the data source: real streamImport replaces the mock
// setTimeout pipeline.
import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { SIcon } from "../components/SIcon";
import { RiskPill, RiskGlyph } from "../components/RiskPill";
import { streamImport } from "../lib/api";
import type { AuditedSkill } from "@jenz/shared";
import type { Risk } from "../state/types";
import {
  toApiSource,
  sourceLabel,
  initialRowState,
  applyRowEvent,
  rowStatuses,
  type ImportSource,
} from "./auditStream";

// Re-export so App.tsx can import from here if convenient.
export type { ImportSource };

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

// Sub-line copy for a resolved threat row.
// For live-streamed skills we use the first finding's type (no curated headline).
export function findingFor(
  sk: { headline?: string; findings: { type: string }[] },
): string | undefined {
  return sk.headline || (sk.findings[0] && sk.findings[0].type);
}

// ---------------------------------------------------------------------------

interface AuditProps {
  runKey: number;
  sources: ImportSource[];
  onResolved: (audited: AuditedSkill & { id: string }) => void;
  onDone: (view: "library" | "audits") => void;
  onOpenSkill: (id: string) => void;
}

// Per-row display data derived from streamed events
interface RowDisplay {
  label: string; // the source name shown to the user
  status: RowStatus;
  scanLabel: string;
  verdict: (AuditedSkill & { id: string }) | null;
  error: string | null;
}

function Audit({ onDone, onOpenSkill, runKey, sources, onResolved }: AuditProps) {
  // Completion is tracked per SOURCE (stable count); the row total is dynamic
  // because one GitHub source can fan out into many skills (the `discovered`
  // event), so it can't drive the streaming effect or the done gate.
  const sourceCount = sources.length;

  // bySource[i] holds the display rows for source i. A source starts as ONE
  // placeholder row; a multi-skill repo replaces it with one row per skill when
  // its `discovered` event arrives. The flattened `rows` drives counts/render.
  const [bySource, setBySource] = useState<RowDisplay[][]>(() =>
    sources.map((s) => [{ label: sourceLabel(s), ...initialRowState() }]),
  );
  const [started, setStarted] = useState(false);
  // Number of sources whose stream has fully completed.
  const [sourcesDone, setSourcesDone] = useState(0);

  // Stable ref to sources so the streaming effect doesn't re-fire on re-renders
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  // Stable ref to onResolved so the callback inside the async closure captures
  // the latest version without re-running the effect.
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  // Apply a streamed RowEvent to a single (source, skill) cell, growing the
  // source's row list if an event arrives for an index we haven't seen yet
  // (defensive against a missing `discovered`).
  const applyToCell = (
    si: number,
    ki: number,
    event: Parameters<typeof applyRowEvent>[1],
  ) =>
    setBySource((prev) => {
      const next = prev.map((g) => g.slice());
      const group = next[si];
      if (!group) return prev;
      while (group.length <= ki) {
        group.push({ label: `skill ${group.length + 1}`, ...initialRowState() });
      }
      const cur = group[ki];
      group[ki] = {
        ...cur,
        ...applyRowEvent(
          { status: cur.status, scanLabel: cur.scanLabel, verdict: cur.verdict, error: cur.error },
          event,
        ),
      };
      return next;
    });

  // Reset on runKey change (re-run)
  useEffect(() => {
    setBySource(
      sourcesRef.current.map((s) => [{ label: sourceLabel(s), ...initialRowState() }]),
    );
    setStarted(false);
    setSourcesDone(0);
  }, [runKey]);

  // Stream all sources sequentially when started
  useEffect(() => {
    if (!started) return;
    if (sourceCount === 0) {
      setSourcesDone(0);
      return;
    }

    let cancelled = false;

    const streamAll = async () => {
      for (let i = 0; i < sourcesRef.current.length; i++) {
        if (cancelled) break;
        const apiSrc = toApiSource(sourcesRef.current[i]);

        await streamImport(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          apiSrc as any,
          {
            // The repo's full skill list — replace the placeholder with one
            // queued row per discovered skill so all N become visible at once.
            onDiscovered: (skills) => {
              if (cancelled) return;
              setBySource((prev) => {
                const next = prev.map((g) => g.slice());
                next[i] = skills.map((sk) => ({ label: sk.name, ...initialRowState() }));
                return next;
              });
            },
            onProgress: (index, msg) => {
              if (cancelled) return;
              applyToCell(i, index, { kind: "progress", msg });
            },
            onVerdict: (v) => {
              if (cancelled) return;
              applyToCell(i, v.index ?? 0, { kind: "verdict", verdict: v });
              onResolvedRef.current(v);
            },
            onError: (index, err) => {
              if (cancelled) return;
              applyToCell(i, index, { kind: "error", error: err });
            },
          },
        );

        if (!cancelled) {
          setSourcesDone((c) => c + 1);
        }
      }
    };

    streamAll().catch(() => {
      // Surface unexpected errors as done (all remaining rows stay in their current state)
      if (!cancelled) setSourcesDone(sourcesRef.current.length);
    });

    return () => {
      cancelled = true;
    };
  }, [started, sourceCount]);

  // Flatten the per-source rows for counts + render. `total` is the live skill
  // count, which grows as repos reveal their skills via `discovered`.
  const rows = bySource.flat();
  const total = rows.length;

  const statuses = rowStatuses(rows.map((r) => ({ status: r.status, scanLabel: r.scanLabel, verdict: r.verdict, error: r.error })));
  const resolved = resolvedCount(statuses);
  const done = started && sourcesDone >= sourceCount && sourceCount > 0;
  const counts = deriveCounts(statuses);
  const pct = derivePct(resolved, total);
  const threats = threatCount(counts);

  // The current "live" scan label: from the row currently scanning, or a default.
  const activeScanLabel =
    rows.find((r) => r.status === "scanning")?.scanLabel ?? "scanning…";

  // Radar phase drives the orchestrator-node visual: calm idle → live sonar →
  // settled shield. Threat tint is only applied on the settled state.
  const phase = !started ? "idle" : done ? "done" : "active";
  const orchClass =
    "jsa-orch " +
    (phase === "active" ? "is-scanning" : phase === "done" ? "is-done" : "is-idle") +
    (done && threats ? " has-threat" : "");

  return (
    <div className="jsa">
      <div className={orchClass}>
        <div className="jsa-orch-top">
          <div className="jsa-orch-ico" aria-hidden="true">
            <span className="jsa-radar-rings">
              <span className="jsa-ring" />
            </span>
            <span className="jsa-radar-core">
              <SIcon
                name={done ? (threats ? "shield-alert" : "shield-check") : "scan"}
                size={20}
              />
            </span>
          </div>
          <div className="jsa-orch-body">
            <div className="jsa-orch-title">
              {!started ? "Ready to audit" : done ? "Audit complete" : "Auditing imported skills"}
            </div>
            <div className="jsa-orch-sub">
              {!started
                ? <>{total} skill{total !== 1 ? "s" : ""} imported · open-weight auditor runs locally</>
                : done
                ? <>open-weight auditor · {total} skill{total !== 1 ? "s" : ""} · {threats} flagged</>
                : <>open-weight auditor running locally · <span className="live">{activeScanLabel}</span></>}
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
        {rows.map((row, i) => {
          const st = row.status;
          const resolvedRow = isResolved(st);
          // For resolved rows with a verdict, surface the first finding type
          const verdictFindings = row.verdict?.findings ?? [];
          const finding = verdictFindings[0]?.type;
          return (
            <div
              key={i}
              className={"jsa-row " + st}
              onClick={() => resolvedRow && row.verdict && onOpenSkill(row.verdict.id)}
              style={{ cursor: resolvedRow && row.verdict ? "pointer" : "default" }}
            >
              <div className="jsa-row-ico">
                {st === "queued" && <SIcon name="clock" size={15} />}
                {st === "scanning" && <SIcon name="scan" size={15} />}
                {resolvedRow && (
                  <span className="jsa-pop">
                    <RiskGlyph risk={st as Risk} size={16} />
                  </span>
                )}
              </div>
              <div className="jsa-row-body">
                <div className="jsa-row-name">
                  {row.label}
                </div>
                <div className="jsa-row-sub">
                  {st === "queued" && <>queued</>}
                  {st === "scanning" && <><span className="jsa-scan-dot" />{row.scanLabel}</>}
                  {st === "safe" && <>no findings</>}
                  {st === "suspicious" && row.error
                    ? <><SIcon name="alert" size={12} />error: {row.error}</>
                    : st === "suspicious" && <><SIcon name="alert" size={12} />{finding}</>}
                  {st === "malicious" && row.error
                    ? <><SIcon name="ban" size={12} />blocked: {row.error}</>
                    : st === "malicious" && <><SIcon name="ban" size={12} />{finding}</>}
                </div>
              </div>
              <div className="jsa-row-end">
                {st === "queued" && <RiskPill risk="queued" label="queued" sm />}
                {st === "scanning" && <RiskPill risk="scanning" label="scanning" sm />}
                {resolvedRow && (
                  <span className="jsa-pop">
                    <RiskPill risk={st as Risk} sm />
                  </span>
                )}
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
            <button className="btn-primary" onClick={() => onDone("audits")}>
              <SIcon name="lock" size={14} /> Review Quarantine
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Preserve the useMemo over sources in the component for future use; keeping
// the export for the screen registry which passes props opaquely.
registerScreen("audit", Audit as unknown as ComponentType<Record<string, unknown>>);
export default Audit;
