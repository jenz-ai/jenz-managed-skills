// Risk primitives — ported node-for-node from skills-icons.jsx.
// RiskGlyph maps a risk to its security glyph; RiskPill is the labeled pill.
import { SIcon } from "./SIcon";
import type { Risk } from "../state/types";

// RiskGlyph accepts any risk plus "scanning" (a transient audit state).
type GlyphRisk = Risk | "scanning";

export function RiskGlyph({ risk, size = 13 }: { risk: GlyphRisk; size?: number }) {
  if (risk === "safe") return <SIcon name="check-circle" size={size} />;
  if (risk === "suspicious") return <SIcon name="alert" size={size} />;
  if (risk === "malicious") return <SIcon name="ban" size={size} />;
  if (risk === "scanning") return <SIcon name="scan" size={size} />;
  return <SIcon name="clock" size={size} />;
}

export function RiskPill({
  risk,
  label,
  sm,
}: {
  risk: GlyphRisk;
  label?: string;
  sm?: boolean;
}) {
  const text = label || risk;
  return (
    <span className={"risk-pill " + risk + (sm ? " sm" : "")}>
      <span className="rp-ico"><RiskGlyph risk={risk} size={sm ? 11 : 12} /></span>
      {text}
    </span>
  );
}
