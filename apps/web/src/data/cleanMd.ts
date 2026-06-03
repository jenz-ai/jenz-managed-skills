// Generic clean SKILL.md for vetted skills. Ported verbatim from
// skills-data.jsx cleanMd(): frontmatter + # name + ## When to use +
// ## Steps + ## Tools, as numbered/kinded lines for the viewer.
import type { MdLine } from "../state/types";

export function cleanMd(
  name: string,
  desc: string,
  category: string,
  trigger: string,
): MdLine[] {
  const L: MdLine[] = [];
  let n = 0;
  const push = (text: string, kind: MdLine["kind"] = null) => L.push({ n: ++n, text, kind });
  push("---", "com");
  push("name: " + name, null);
  push("description: " + desc, null);
  push("category: " + category, null);
  push("---", "com");
  push("", null);
  push("# " + name, "h");
  push("", null);
  push(desc, null);
  push("", null);
  push("## When to use", "h");
  push("", null);
  push("Use this skill when " + trigger + ".", null);
  push("", null);
  push("## Steps", "h");
  push("", null);
  push("1. Read the relevant context from the vault.", null);
  push("2. Call the declared tools only — no network egress outside scope.", null);
  push("3. Write the result back as markdown and stop.", null);
  push("", null);
  push("## Tools", "h");
  push("", null);
  push("- `read_file`, `write_file` (vault-scoped)", null);
  push("- `web_search` (read-only)", null);
  return L;
}
