// Jenz Skills — icon set. Ports skills-icons.jsx (security/audit glyphs,
// strokeWidth 1.7) layered over _shared/icons.jsx (generic glyphs,
// strokeWidth 1.6). Unknown names fall back to the generic set, then a dot.
import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "check" | "check-circle" | "alert" | "ban" | "shield-check" | "shield-alert"
  | "scan" | "import" | "lock" | "refresh" | "copy" | "external" | "arrow-right"
  | "arrow-left" | "eye" | "bug" | "network" | "key"
  | "files" | "skills" | "git" | "github" | "terminal" | "doc" | "folder" | "chev-down"
  | "chev-right" | "chev-up" | "plus" | "x" | "settings" | "sparkles" | "more"
  | "link" | "clock" | "globe";

interface SIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName | string;
  size?: number;
}

// Security/audit glyphs — strokeWidth 1.7 (from skills-icons.jsx).
const SECURITY: Record<string, ReactElement> = {
  "check": <path d="m5 12 5 5 9-11" />,
  "check-circle": <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  "alert": <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></>,
  "ban": <><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></>,
  "shield-check": <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4.5" /></>,
  "shield-alert": <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="M12 8v4M12 15v.5" /></>,
  "scan": <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" /></>,
  "import": <><path d="M12 3v12M8 11l4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  "lock": <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  "refresh": <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></>,
  "copy": <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  "external": <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  "eye": <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
  "bug": <><rect x="8" y="7" width="8" height="11" rx="4" /><path d="M8 11H4M16 11h4M8 15H4M16 15h4M9 7 7.5 5M15 7l1.5-2M12 18v3" /></>,
  "network": <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v4M12 11 6 17M12 11l6 6" /></>,
  "key": <><circle cx="8" cy="8" r="4" /><path d="m11 11 9 9M17 17l2-2M14 14l2-2" /></>,
};

// Generic glyphs — strokeWidth 1.6 (from _shared/icons.jsx).
const GENERIC: Record<string, ReactElement> = {
  "files": <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  "skills": <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 19l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>,
  "git": <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8M8 18c4 0 8-3 8-6" /></>,
  "terminal": <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>,
  "doc": <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></>,
  "folder": <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  "chev-down": <path d="m6 9 6 6 6-6" />,
  "chev-right": <path d="m9 6 6 6-6 6" />,
  "chev-up": <path d="m6 15 6-6 6 6" />,
  "plus": <path d="M12 5v14M5 12h14" />,
  "x": <path d="M6 6l12 12M18 6 6 18" />,
  "settings": <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  "sparkles": <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  "more": <><circle cx="6" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18" cy="12" r="1.4" /></>,
  "link": <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  "clock": <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  "globe": <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></>,
};

// Brand glyphs — solid FILLED paths (official marks), rendered with
// fill="currentColor" and no stroke (unlike the line glyphs above).
const BRAND: Record<string, ReactElement> = {
  // Official GitHub "Octocat" mark (24x24 viewBox).
  "github": <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 6.844c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />,
};

export function SIcon({ name, size = 14, ...rest }: SIconProps) {
  const brand = BRAND[name];
  const security = SECURITY[name];
  const generic = GENERIC[name];
  const body = brand ?? security ?? generic ?? <circle cx="12" cy="12" r="2" />;
  // skills-icons.jsx strokes its own glyphs at 1.7; delegated glyphs at 1.6.
  const strokeWidth = security ? 1.7 : 1.6;
  // Brand marks are solid silhouettes: fill them, no stroke.
  if (brand) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
        {body}
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {body}
    </svg>
  );
}
