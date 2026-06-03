// Top-level gate: routes between the auth screens and the app based on session.
// Signed-in users skip straight to the app (Supabase persists the session).
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { JenzMark } from "./JenzMark";
import App from "../App";
import { Login } from "../screens/Login";
import { CreateWorkspace } from "../screens/CreateWorkspace";

export function AuthGate() {
  const { status } = useAuth();
  const [mode, setMode] = useState<"create" | "signin">("create");

  if (status === "loading") {
    return (
      <div className="lg-win">
        <div className="lg-splash"><span className="lg-mark"><JenzMark size={44} /></span></div>
      </div>
    );
  }

  if (status === "signedIn") return <App />;

  return mode === "create" ? (
    <CreateWorkspace onSwitch={() => setMode("signin")} />
  ) : (
    <Login onSwitch={() => setMode("create")} />
  );
}
