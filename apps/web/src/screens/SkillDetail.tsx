// Skill detail screen (demo-critical #2). Props from App.tsx:
//   { sk, installed: string[], onInstall, onDelete, onReport, onRescan, onApprove }
// Build 1:1 per apps/web/SPEC.md §5.2 + source skills-detail.jsx. Replace this stub.
import { registerScreen } from "../shell/ScreenSlot";

function SkillDetail() {
  return (
    <div className="jsd" style={{ padding: 24, color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
      detail screen — building…
    </div>
  );
}

registerScreen("detail", SkillDetail);
export default SkillDetail;
