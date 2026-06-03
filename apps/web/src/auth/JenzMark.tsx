// The jenz pixel "eye" mark, ported verbatim from the auth design. Pupil uses
// --bg-0 so it reads as a cut-out on both themes; shrunk slightly in light mode
// (see auth.css .lg-pupil) to match the dark-mode optical weight.
export function JenzMark({ size = 58 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      <g>
        <rect x="28" y="4" width="8" height="4" />
        <rect x="24" y="8" width="16" height="4" />
        <rect x="20" y="12" width="24" height="4" />
        <rect x="16" y="16" width="32" height="4" />
        <rect x="12" y="20" width="8" height="4" />
        <rect x="44" y="20" width="8" height="4" />
        <rect x="8" y="24" width="8" height="4" />
        <rect x="48" y="24" width="8" height="4" />
        <rect x="4" y="28" width="8" height="8" />
        <rect x="52" y="28" width="8" height="8" />
        <rect x="8" y="36" width="8" height="4" />
        <rect x="48" y="36" width="8" height="4" />
        <rect x="12" y="40" width="8" height="4" />
        <rect x="44" y="40" width="8" height="4" />
        <rect x="16" y="44" width="32" height="4" />
        <rect x="20" y="48" width="24" height="4" />
        <rect x="24" y="52" width="16" height="4" />
        <rect x="28" y="56" width="8" height="4" />
        <rect x="24" y="24" width="16" height="16" />
      </g>
      <rect className="lg-pupil" x="28" y="28" width="8" height="8" style={{ fill: "var(--bg-0)" }} />
    </svg>
  );
}
