// Source brand badge — text monogram tinted per tool. Ported node-for-node
// from skills-icons.jsx SourceBadge. Color stays oklch(0.80 0.10 <hue>).
const MAP: Record<string, { t: string; hue: number }> = {
  claude: { t: "CC", hue: 35 },
  codex: { t: "Cx", hue: 145 },
  openclaw: { t: "OC", hue: 295 },
  hermes: { t: "He", hue: 230 },
  cursor: { t: "Cu", hue: 280 },
};

export function SourceBadge({ kind, sm = false }: { kind: string; sm?: boolean }) {
  const m = MAP[kind] || { t: "·", hue: 280 };
  return (
    <span className={"jss-logo" + (sm ? " sm" : "")} style={{ color: `oklch(0.80 0.10 ${m.hue})` }}>
      {m.t}
    </span>
  );
}
