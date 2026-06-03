// Pure helpers for the Audit streaming integration.
// NO React, NO network — safe to import anywhere; unit-tested in auditStream.test.ts.
import type { AuditedSkill } from "@jenz/shared";
import type { RowStatus } from "./Audit";
import type { ImportSource } from "./onboardingLogic";

// ---- ImportSource (re-exported from onboardingLogic for convenience) --------

export type { ImportSource };

// ---- toApiSource ------------------------------------------------------------

/**
 * Maps an UI ImportSource (kind) to the API streamImport source shape (type).
 * The only shape difference is `kind` → `type`.
 */
export function toApiSource(
  src: ImportSource,
):
  | { type: "inline"; name: string; files: { path: string; content: string }[] }
  | { type: "github"; url: string } {
  if (src.kind === "github") {
    return { type: "github", url: src.url };
  }
  return { type: "inline", name: src.name, files: src.files };
}

// ---- Row display label ------------------------------------------------------

/** Returns the user-visible label for a source (label for github, name for inline). */
export function sourceLabel(src: ImportSource): string {
  return src.kind === "github" ? src.label : src.name;
}

// ---- RowState / reducer -----------------------------------------------------

export type RowEventKind = "scan-start" | "progress" | "verdict" | "error";

export interface RowState {
  status: RowStatus;
  scanLabel: string;
  /** Set when verdict arrives: the full resolved verdict (risk + id). */
  verdict: (AuditedSkill & { id: string }) | null;
  /** Set when an error arrives. */
  error: string | null;
}

export interface RowEvent {
  kind: RowEventKind;
  /** For "progress": the server progress message. */
  msg?: string;
  /** For "verdict": the full verdict object. */
  verdict?: AuditedSkill & { id: string };
  /** For "error": the error string. */
  error?: string;
}

const DEFAULT_SCAN_LABEL = "scanning…";

export function initialRowState(): RowState {
  return { status: "queued", scanLabel: DEFAULT_SCAN_LABEL, verdict: null, error: null };
}

/**
 * Pure reducer: folds a RowEvent into a RowState.
 * Fail-closed: errors never result in a "safe" status.
 */
export function applyRowEvent(state: RowState, event: RowEvent): RowState {
  switch (event.kind) {
    case "scan-start":
      return { ...state, status: "scanning", scanLabel: DEFAULT_SCAN_LABEL };
    case "progress":
      return { ...state, status: "scanning", scanLabel: event.msg || DEFAULT_SCAN_LABEL };
    case "verdict": {
      const v = event.verdict!;
      // map "pending" → "suspicious" fail-closed (same logic as adapt.ts mapRisk)
      const risk = v.risk === "pending" ? "suspicious" : v.risk;
      return { ...state, status: risk, verdict: v, error: null };
    }
    case "error":
      // fail-closed: errored rows surface as "malicious" (blocked/not-safe)
      return { ...state, status: "malicious", error: event.error || "unknown error", verdict: null };
    default:
      return state;
  }
}

/**
 * Derives RowStatus array from per-row RowState array.
 * Useful for passing into existing deriveCounts / resolvedCount helpers.
 */
export function rowStatuses(rows: RowState[]): RowStatus[] {
  return rows.map((r) => r.status);
}
