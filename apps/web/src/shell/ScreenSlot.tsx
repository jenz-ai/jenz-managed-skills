// Screen registry seam. The app root renders panes through ScreenSlot so the
// shell can boot before the screen teammates land their work. Each screen
// (audit / detail / library / auditHome / settings / onboarding / importModal)
// registers its component via registerScreen(); until then a labeled
// placeholder renders. This is the boundary that unblocks parallel work —
// no screen needs to touch App.tsx.
import type { ComponentType } from "react";

export type ScreenKind =
  | "onboarding"
  | "auditHome"
  | "audit"
  | "library"
  | "detail"
  | "settings"
  | "importModal";

// Screens own their own prop shapes; the slot passes them through opaquely.
type AnyProps = Record<string, unknown>;

const registry = new Map<ScreenKind, ComponentType<AnyProps>>();

export function registerScreen(kind: ScreenKind, component: ComponentType<AnyProps>) {
  registry.set(kind, component);
}

function Placeholder({ kind }: { kind: ScreenKind }) {
  // importModal renders nothing until wired (it is an overlay, not a pane).
  if (kind === "importModal") return null;
  return (
    <div style={{ padding: "40px 32px", color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
      {kind} screen — pending
    </div>
  );
}

export function ScreenSlot({ kind, props }: { kind: ScreenKind; props: AnyProps }) {
  const Component = registry.get(kind);
  if (Component) return <Component {...props} />;
  return <Placeholder kind={kind} />;
}
