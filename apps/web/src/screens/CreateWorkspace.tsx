// Create-workspace screen — ported from the auth design (Create Workspace.html).
// Passwordless: providers, or name your workspace + email → magic link. The name
// is applied to the workspace once the user lands back authenticated.
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { JenzMark } from "../auth/JenzMark";
import { ThemeToggle } from "../auth/ThemeToggle";
import { GitHubIcon, GoogleIcon, MailIcon } from "../auth/ProviderIcons";

export function CreateWorkspace({ onSwitch }: { onSwitch: () => void }) {
  const { createWorkspace, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<"providers" | "email">("providers");
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauth = async (provider: "github" | "google") => {
    setError(null);
    setBusy(true);
    const { error } = await signInWithOAuth(provider);
    if (error) {
      setError(error);
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace.trim() || !email.trim()) return;
    setError(null);
    setBusy(true);
    const { error } = await createWorkspace(workspace.trim(), email.trim());
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  };

  return (
    <div className="lg-win">
      <ThemeToggle />
      <main className="lg-stage">
        <section className="lg-card">
          <span className="lg-mark"><JenzMark /></span>
          <div className="lg-eyebrow">managed skills</div>

          {sent ? (
            <>
              <h1 className="lg-h1">Check your inbox</h1>
              <p className="lg-p">We sent a magic link to <b>{email.trim()}</b>. Open it to finish setting up <b>{workspace.trim()}</b>.</p>
            </>
          ) : mode === "providers" ? (
            <>
              <h1 className="lg-h1">Create your workspace</h1>
              <p className="lg-p">Spin up a workspace and start auditing the skills your agents can run — in minutes.</p>
              {error && <div className="lg-error">{error}</div>}
              <div className="lg-stack">
                <button className="lg-btn primary" type="button" disabled={busy} onClick={() => oauth("github")}>
                  <span className="lg-ic"><GitHubIcon /></span>Sign up with GitHub
                </button>
                <button className="lg-btn" type="button" disabled={busy} onClick={() => oauth("google")}>
                  <span className="lg-ic"><GoogleIcon /></span>Sign up with Google
                </button>
                <button className="lg-btn" type="button" disabled={busy} onClick={() => { setError(null); setMode("email"); }}>
                  <span className="lg-ic"><MailIcon /></span>Sign up with email
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="lg-h1">Name your workspace</h1>
              <p className="lg-p">Pick a name and the email you'll manage this workspace with.</p>
              {error && <div className="lg-error">{error}</div>}
              <form className="lg-form" onSubmit={submit}>
                <input className="lg-input" type="text" placeholder="Workspace name (e.g. Acme)" required autoComplete="organization" autoFocus value={workspace} onChange={(e) => setWorkspace(e.target.value)} />
                <input className="lg-input" type="email" placeholder="you@company.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="lg-btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Create workspace"}</button>
                <button className="lg-text-btn" type="button" onClick={() => setMode("providers")}>← Back to all options</button>
              </form>
            </>
          )}

          {!sent && (
            <p className="lg-switch">Already have an account? <button type="button" onClick={onSwitch}>Sign in</button></p>
          )}
        </section>
      </main>
    </div>
  );
}
