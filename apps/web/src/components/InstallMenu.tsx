// Generic install menu — canonical skill → any tool. Radix DropdownMenu for
// behavior (open state, focus, keyboard, dismiss), styled with the design's
// .inst-* classes. Ports skills-shared.jsx InstallMenu node-for-node; the
// locked variant keeps the CSS-hover .jsd-tooltip rather than a menu.
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SIcon } from "./SIcon";
import { TARGETS } from "../data/targets";

export interface InstallMenuProps {
  installed?: string[];
  onInstall: (targetId: string) => void;
  disabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  sm?: boolean;
  ghost?: boolean;
  label?: string;
  note?: string;
  align?: "left" | "right";
}

const DEFAULT_NOTE =
  "Skills are normalized to a canonical form. Claude-specific frontmatter is mapped where it can be; the rest is flagged on install.";

export function InstallMenu({
  installed = [],
  onInstall,
  disabled,
  locked,
  lockedReason,
  sm,
  ghost,
  label,
  note,
  align = "right",
}: InstallMenuProps) {
  if (locked) {
    return (
      <div className="inst-wrap">
        <span className="jsd-install-wrap">
          <button className={"inst-btn locked" + (sm ? " sm" : "")} disabled>
            <SIcon name="lock" size={14} /> {label || "Install"}
          </button>
          {lockedReason && (
            <div className="jsd-tooltip">
              <div className="tt-row">
                <span className="tt-ico"><SIcon name="ban" size={14} /></span>
                <span>{lockedReason}</span>
              </div>
            </div>
          )}
        </span>
      </div>
    );
  }

  const head = label && label.startsWith("Install all") ? "Install all to" : "Install to";

  return (
    <DropdownMenu.Root>
      <div className="inst-wrap">
        <DropdownMenu.Trigger asChild>
          <button
            className={"inst-btn" + (sm ? " sm" : "") + (ghost ? " ghost" : "")}
            disabled={disabled}
          >
            <SIcon name="import" size={14} />
            {label || "Install to"}
            <span className="ib-chev"><SIcon name="chev-down" size={13} /></span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={"inst-menu" + (align === "left" ? " left" : "")}
            align={align === "left" ? "start" : "end"}
            sideOffset={6}
          >
            <div className="inst-menu-head">{head}</div>
            {TARGETS.map((t) => {
              const isIn = installed.includes(t.id);
              return (
                <DropdownMenu.Item
                  key={t.id}
                  className={"inst-opt" + (isIn ? " installed" : "")}
                  onSelect={() => onInstall(t.id)}
                >
                  <span className="io-badge" style={{ color: `oklch(0.80 0.10 ${t.hue})` }}>{t.badge}</span>
                  <span className="io-body">
                    <span className="io-name">{t.name}</span>
                    <span className="io-path">{t.path}</span>
                  </span>
                  <span className="io-check"><SIcon name="check" size={15} /></span>
                </DropdownMenu.Item>
              );
            })}
            <div className="inst-note">
              <span className="in-ico"><SIcon name="alert" size={12} /></span>
              <span>{note || DEFAULT_NOTE}</span>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </div>
    </DropdownMenu.Root>
  );
}
