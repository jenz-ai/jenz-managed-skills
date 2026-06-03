// Pill switch — thin wrapper over @radix-ui/react-switch. Off = --bg-3 track,
// on = --accent track, white thumb. Styled via .ob-switch in skills.css.
import * as RSwitch from "@radix-ui/react-switch";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label"?: string;
}

export function Switch({ checked, onCheckedChange, ...rest }: SwitchProps) {
  return (
    <RSwitch.Root
      className="ob-switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...rest}
    >
      <RSwitch.Thumb className="ob-switch-thumb" />
    </RSwitch.Root>
  );
}

export default Switch;
