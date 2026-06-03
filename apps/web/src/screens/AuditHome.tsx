// Audit home / history screen. Props from App.tsx:
//   { onImport, onOpenQuarantine }
// Build 1:1 per apps/web/SPEC.md §6 + source skills-history.jsx. Replace this stub.
import { registerScreen } from "../shell/ScreenSlot";

function AuditHome() {
  return (
    <div className="jh" style={{ padding: 24, color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
      audit home — building…
    </div>
  );
}

registerScreen("auditHome", AuditHome);
export default AuditHome;
