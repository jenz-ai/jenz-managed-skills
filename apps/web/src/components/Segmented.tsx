// Segmented control — thin wrapper over @radix-ui/react-tabs (Root/List/Trigger).
// Used as the MCP agent picker. Active trigger = --accent-soft bg + --accent-line
// border + --fg-0. Styled via .ob-seg in skills.css. A trigger may render an
// optional badge node on the right (e.g. a connected dot).
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export interface SegmentedItem {
  id: string;
  label: string;
  badge?: ReactNode;
}

export interface SegmentedProps {
  value: string;
  onValueChange: (value: string) => void;
  items: SegmentedItem[];
}

export function Segmented({ value, onValueChange, items }: SegmentedProps) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} activationMode="manual">
      <Tabs.List className="ob-seg" aria-label="Select agent">
        {items.map((it) => (
          <Tabs.Trigger key={it.id} value={it.id} className="ob-seg-item">
            <span className="ob-seg-lbl">{it.label}</span>
            {it.badge}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export default Segmented;
