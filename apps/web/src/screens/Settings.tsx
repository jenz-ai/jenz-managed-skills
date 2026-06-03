// Settings screen — General + workspace rename, wired to the live API
// (PATCH /api/workspace via AuthProvider.renameWorkspace). Registered into the
// ScreenSlot so the existing Sidebar "settings" nav lights up. Reads identity
// from the auth context — App passes no props.
import { useEffect, useState, type ComponentType } from "react";
import { registerScreen } from "../shell/ScreenSlot";
import { useAuth } from "../auth/AuthProvider";

function SkillsSettings() {
  const { workspace, user, renameWorkspace, signOut } = useAuth();
  const [name, setName] = useState(workspace?.name ?? "");
  const [slug, setSlug] = useState(workspace?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep local fields in sync if the workspace loads/changes underneath us.
  useEffect(() => {
    setName(workspace?.name ?? "");
    setSlug(workspace?.slug ?? "");
  }, [workspace?.name, workspace?.slug]);

  const dirty = name.trim() !== (workspace?.name ?? "") || slug.trim() !== (workspace?.slug ?? "");

  const save = async () => {
    setError(null);
    setSaved(false);
    setBusy(true);
    const input: { name?: string; slug?: string } = {};
    if (name.trim() && name.trim() !== workspace?.name) input.name = name.trim();
    if (slug.trim() && slug.trim() !== workspace?.slug) input.slug = slug.trim();
    const { error } = await renameWorkspace(input);
    setBusy(false);
    if (error) setError(error);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    }
  };

  return (
    <div className="set-wrap">
      <h1 className="set-h1">Settings</h1>
      <p className="set-sub">Manage your workspace and account.</p>

      <section className="set-card">
        <div className="set-card-head">
          <h3>Workspace</h3>
          <p>The name and slug your library, CLI commands, and MCP server use.</p>
        </div>
        <div className="set-card-body">
          <div className="set-row">
            <div className="set-row-l">
              <div className="set-row-label">Name</div>
              <div className="set-row-hint">Shown in the title bar and across the dashboard.</div>
            </div>
            <input className="set-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme" />
          </div>
          <div className="set-row">
            <div className="set-row-l">
              <div className="set-row-label">Slug</div>
              <div className="set-row-hint">Lowercase, used in CLI/MCP commands. a–z, 0–9, dashes.</div>
            </div>
            <input className="set-input mono" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" />
          </div>
          <div className="set-actions">
            <button className="lg-btn primary" style={{ height: 34, width: "auto", padding: "0 16px" }} disabled={!dirty || busy} onClick={save}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="set-saved">Saved ✓</span>}
            {error && <span className="set-err">{error}</span>}
          </div>
        </div>
      </section>

      <section className="set-card">
        <div className="set-card-head"><h3>Account</h3></div>
        <div className="set-card-body">
          <div className="set-row">
            <div className="set-row-l">
              <div className="set-row-label">Signed in as</div>
              <div className="set-row-hint set-user">{user?.email ?? "—"}</div>
            </div>
            <button className="lg-btn" style={{ height: 34, width: "auto", padding: "0 16px" }} onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

registerScreen("settings", SkillsSettings as unknown as ComponentType<Record<string, unknown>>);
export default SkillsSettings;
