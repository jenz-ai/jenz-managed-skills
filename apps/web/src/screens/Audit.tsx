// Audit "moment" screen (demo-critical #1). Props from App.tsx:
//   { runKey, onDone: (view) => void, onOpenSkill: (sk) => void }
// Build 1:1 per apps/web/SPEC.md §5.1 + source skills-audit.jsx. Replace this stub.
import { registerScreen } from "../shell/ScreenSlot";

function Audit() {
  return (
    <div className="jsa" style={{ padding: 24, color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
      audit screen — building…
    </div>
  );
}

registerScreen("audit", Audit);
export default Audit;
