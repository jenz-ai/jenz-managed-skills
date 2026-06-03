// Library / Quarantine screen (demo-critical #3). Props from App.tsx:
//   { mode: "library"|"quarantine", activeCategory, skills, installs,
//     onOpenSkill, onBulkInstall, onDragStart, onDragEnd, draggingId }
// Build 1:1 per apps/web/SPEC.md §5.3 + source skills-library.jsx. Replace this stub.
import { registerScreen } from "../shell/ScreenSlot";

function Library() {
  return (
    <div className="jsl" style={{ padding: 24, color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
      library screen — building…
    </div>
  );
}

registerScreen("library", Library);
export default Library;
