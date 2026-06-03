// Sign-in screen — ported from the auth design (Login.html). Passwordless:
// providers (GitHub/Google OAuth) or a magic link to your email.
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { JenzMark } from "../auth/JenzMark";
import { ThemeToggle } from "../auth/ThemeToggle";
import { GitHubIcon, GoogleIcon, MailIcon } from "../auth/ProviderIcons";

export function Login({ onSwitch }: { onSwitch: () => void }) {
  const { signInWithEmail, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<"providers" | "email">("providers");
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
    // on success the browser redirects away
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setBusy(true);
    const { error } = await signInWithEmail(email.trim());
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
              <p className="lg-p">We sent a one-time magic link to <b>{email.trim()}</b>. Open it on this device to finish signing in.</p>
            </>
          ) : mode === "providers" ? (
            <>
              <h1 className="lg-h1">Sign in to Jenz</h1>
              <p className="lg-p">Audit, govern, and quarantine every skill your agents can run — from one workspace.</p>
              {error && <div className="lg-error">{error}</div>}
              <div className="lg-stack">
                <button className="lg-btn primary" type="button" disabled={busy} onClick={() => oauth("github")}>
                  <span className="lg-ic"><GitHubIcon /></span>Continue with GitHub
                </button>
                <button className="lg-btn" type="button" disabled={busy} onClick={() => oauth("google")}>
                  <span className="lg-ic"><GoogleIcon /></span>Continue with Google
                </button>
                <button className="lg-btn" type="button" disabled={busy} onClick={() => { setError(null); setMode("email"); }}>
                  <span className="lg-ic"><MailIcon /></span>Continue with email
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="lg-h1">Continue with email</h1>
              <p className="lg-p">We'll email you a one-time magic link to finish signing in.</p>
              {error && <div className="lg-error">{error}</div>}
              <form className="lg-form" onSubmit={submitEmail}>
                <input className="lg-input" type="email" placeholder="you@company.com" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="lg-btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send magic link"}</button>
                <button className="lg-text-btn" type="button" onClick={() => setMode("providers")}>← Back to all options</button>
              </form>
            </>
          )}

          {!sent && (
            <p className="lg-switch">New to Jenz? <button type="button" onClick={onSwitch}>Create a workspace</button></p>
          )}
        </section>
      </main>
    </div>
  );
}
