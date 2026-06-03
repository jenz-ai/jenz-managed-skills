import { describe, expect, it } from "vitest";
import { cleanMd } from "./cleanMd";

// cleanMd generates the canonical 24-line vetted SKILL.md. Numbers are
// 1-based and contiguous; frontmatter (lines 1 & 5) + headings are tagged
// so the viewer can color them. These assertions pin the verbatim shape
// from skills-data.jsx cleanMd().
describe("cleanMd", () => {
  const md = cleanMd(
    "competitor-diff",
    "Diffs competitor changelogs and flags positioning shifts worth a response.",
    "Research",
    "a competitor ships a release or updates pricing",
  );

  it("produces exactly 24 numbered lines, contiguous from 1", () => {
    expect(md).toHaveLength(24);
    md.forEach((line, i) => expect(line.n).toBe(i + 1));
  });

  it("opens and closes the frontmatter block with com-tagged fences", () => {
    expect(md[0]).toEqual({ n: 1, text: "---", kind: "com" });
    expect(md[1]).toEqual({ n: 2, text: "name: competitor-diff", kind: null });
    expect(md[2]).toEqual({
      n: 3,
      text: "description: Diffs competitor changelogs and flags positioning shifts worth a response.",
      kind: null,
    });
    expect(md[3]).toEqual({ n: 4, text: "category: Research", kind: null });
    expect(md[4]).toEqual({ n: 5, text: "---", kind: "com" });
  });

  it("tags the # title and ## section headings as h", () => {
    expect(md[6]).toEqual({ n: 7, text: "# competitor-diff", kind: "h" });
    expect(md.filter((l) => l.kind === "h").map((l) => l.text)).toEqual([
      "# competitor-diff",
      "## When to use",
      "## Steps",
      "## Tools",
    ]);
  });

  it("renders the trigger into the When-to-use sentence", () => {
    expect(md.some((l) => l.text === "Use this skill when a competitor ships a release or updates pricing.")).toBe(true);
  });

  it("lists the canonical scoped tools verbatim", () => {
    const texts = md.map((l) => l.text);
    expect(texts).toContain("1. Read the relevant context from the vault.");
    expect(texts).toContain("2. Call the declared tools only — no network egress outside scope.");
    expect(texts).toContain("3. Write the result back as markdown and stop.");
    expect(texts).toContain("- `read_file`, `write_file` (vault-scoped)");
    expect(texts).toContain("- `web_search` (read-only)");
  });
});
