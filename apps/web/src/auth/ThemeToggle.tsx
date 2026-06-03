// Floating dark/light toggle for the auth screens (self-contained: toggles
// body.light + persists, mirroring the design's inline script). The in-app
// shell manages its own theme once signed in.
import { useEffect, useState } from "react";

const KEY = "jenz-theme";

export function ThemeToggle() {
  const [light, setLight] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    const saved = localStorage.getItem(KEY);
    // App defaults to light; honour an explicit saved choice.
    return saved ? saved === "light" : !document.body.classList.contains("light") ? false : true;
  });

  useEffect(() => {
    document.body.classList.toggle("light", light);
  }, [light]);

  const toggle = () => {
    setLight((prev) => {
      const next = !prev;
      localStorage.setItem(KEY, next ? "light" : "dark");
      return next;
    });
  };

  return (
    <button className="lg-theme" type="button" title="Toggle theme" aria-label="Toggle light/dark theme" onClick={toggle}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
