// Side-effect barrel: importing each screen module runs its registerScreen()
// call, populating the ScreenSlot registry before App renders. main.tsx imports
// this once. Each screen owns exactly one file here — no shared-file edits.
import "./Audit";
import "./SkillDetail";
import "./Library";
import "./AuditHome";
import "./Onboarding";
