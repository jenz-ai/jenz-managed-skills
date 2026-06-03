// Installed-on chips — shows which tools a vetted skill is installed to, with
// a "+N" overflow. Ported from skills-library.jsx InstalledChips. Each chip is
// a check + the tool's monogram badge.
import { SIcon } from "./SIcon";
import { TARGET_BY_ID } from "../data/targets";

export function InstalledChips({ ids, max = 3 }: { ids: string[]; max?: number }) {
  const shown = ids.slice(0, max);
  const overflow = ids.length - shown.length;
  return (
    <span className="inst-chips">
      {shown.map((id) => {
        const t = TARGET_BY_ID[id];
        if (!t) return null;
        return (
          <span className="inst-chip" key={id}>
            <SIcon name="check" size={10} />
            {t.badge}
          </span>
        );
      })}
      {overflow > 0 && <span className="inst-chip">+{overflow}</span>}
    </span>
  );
}
