// Auth context for the dashboard. Wraps the whole app (see main.tsx).
//
// Flow: Supabase handles sign-in (magic link / OAuth) client-side; on a live
// session we call GET /api/me to load the user + workspace (created server-side
// on first call). Sign-in actions are passwordless — matching the design's
// magic-link screens. The agent-facing API stays open; this only gates the UI.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { fetchMe, patchWorkspace, type Workspace } from "./authApi";

const PENDING_KEY = "jenz-pending-workspace-name";

type Provider = "github" | "google";
type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  user?: { id: string; email: string };
  workspace?: Workspace;
  /** Magic-link sign-in for an existing user. */
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  /** Magic-link sign-up that names the workspace once the user lands authed. */
  createWorkspace: (name: string, email: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: Provider) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  renameWorkspace: (input: { name?: string; slug?: string }) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function fallbackName(email: string): string {
  const local = email.split("@")[0] || "My";
  return `${local.charAt(0).toUpperCase()}${local.slice(1)}'s workspace`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<{ id: string; email: string } | undefined>();
  const [workspace, setWorkspace] = useState<Workspace | undefined>();
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function applySession(session: Session | null) {
      if (!session?.access_token) {
        tokenRef.current = null;
        if (active) {
          setUser(undefined);
          setWorkspace(undefined);
          setStatus("signedOut");
        }
        return;
      }
      tokenRef.current = session.access_token;
      const email = session.user?.email ?? "";
      try {
        let me = await fetchMe(session.access_token);
        // If the user just created a workspace, apply the name they chose.
        const pending = localStorage.getItem(PENDING_KEY)?.trim();
        if (pending && pending !== me.workspace.name) {
          try {
            const ws = await patchWorkspace(session.access_token, { name: pending });
            me = { ...me, workspace: ws };
          } catch {
            // keep the default name if the rename fails
          }
        }
        localStorage.removeItem(PENDING_KEY);
        if (!active) return;
        setUser(me.user);
        setWorkspace(me.workspace);
        setStatus("signedIn");
      } catch (e) {
        // Backend unreachable — let the user in with a derived fallback so the
        // app still renders (the gate/audit API is separate and stays open).
        console.warn("[jenz] /api/me failed; using fallback workspace", e);
        if (!active) return;
        setUser({ id: session.user?.id ?? "", email });
        setWorkspace({ id: "", name: fallbackName(email), slug: "" });
        setStatus("signedIn");
      }
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  const value: AuthContextValue = {
    status,
    user,
    workspace,
    async signInWithEmail(email) {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return { error: error?.message ?? null };
    },
    async createWorkspace(name, email) {
      localStorage.setItem(PENDING_KEY, name);
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return { error: error?.message ?? null };
    },
    async signInWithOAuth(provider) {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async renameWorkspace(input) {
      const token = tokenRef.current;
      if (!token) return { error: "not signed in" };
      try {
        const ws = await patchWorkspace(token, input);
        setWorkspace(ws);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
