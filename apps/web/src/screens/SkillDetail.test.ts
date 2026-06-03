import { describe, expect, it } from "vitest";
import { deriveFiles, parseSkillFileBody } from "./SkillDetail";
import { SKILLS } from "../data/skills";
import type { MdLine, Skill } from "../state/types";

const byId = (id: string): Skill => {
  const s = SKILLS.find((x) => x.id === id);
  if (!s) throw new Error("fixture missing " + id);
  return s;
};

describe("deriveFiles", () => {
  it("a vetted skill is SKILL.md plus the canonical examples/ + refs/ folders", () => {
    const files = deriveFiles(byId("competitor-diff"));
    expect(files.map((f) => f.name)).toEqual(["SKILL.md", "examples/", "refs/"]);
    // folders are dirs, none flagged on a safe skill
    expect(files.find((f) => f.name === "examples/")?.dir).toBe(true);
    expect(files.find((f) => f.name === "refs/")?.dir).toBe(true);
    expect(files.every((f) => !f.flagged)).toBe(true);
  });

  it("collapses multiple findings on the same file into one rail entry", () => {
    // pdf-extract has two findings, both in extract.py
    const files = deriveFiles(byId("pdf-extract"));
    expect(files.map((f) => f.name)).toEqual(["SKILL.md", "extract.py"]);
    expect(files.find((f) => f.name === "extract.py")?.flagged).toBe(true);
    // no examples/ or refs/ on a flagged skill
    expect(files.some((f) => f.dir)).toBe(false);
  });

  it("flags SKILL.md itself when a finding points at it", () => {
    // meeting-notes-sync findings: run.sh + SKILL.md
    const files = deriveFiles(byId("meeting-notes-sync"));
    expect(files.map((f) => f.name)).toEqual(["SKILL.md", "run.sh"]);
    expect(files.find((f) => f.name === "SKILL.md")?.flagged).toBe(true);
    expect(files.find((f) => f.name === "run.sh")?.flagged).toBe(true);
  });
});

describe("parseSkillFileBody", () => {
  it("skips frontmatter and drops the # title that repeats the skill name", () => {
    const sk = byId("competitor-diff");
    const blocks = parseSkillFileBody(sk.skillMd, sk.name, sk.desc);
    // no block should be the frontmatter fence or the name heading
    expect(blocks.some((b) => "text" in b && b.text === sk.name)).toBe(false);
    expect(blocks.some((b) => b.t === "h3")).toBe(true); // ## sections become h3
  });

  it("parses ordered + unordered lists", () => {
    const sk = byId("competitor-diff");
    const blocks = parseSkillFileBody(sk.skillMd, sk.name, sk.desc);
    expect(blocks.some((b) => b.t === "ol")).toBe(true);
    expect(blocks.some((b) => b.t === "ul")).toBe(true);
  });

  it("groups hot/injection lines into a single inj block", () => {
    const sk = byId("meeting-notes-sync");
    const blocks = parseSkillFileBody(sk.skillMd, sk.name, sk.desc);
    const inj = blocks.filter((b) => b.t === "inj");
    expect(inj).toHaveLength(1);
    // the two injection lines (18,19) are grouped together
    expect((inj[0] as { lines: string[] }).lines).toHaveLength(2);
  });

  it("turns blockquote lines into a note block with the marker stripped", () => {
    const sk = byId("pdf-extract");
    const blocks = parseSkillFileBody(sk.skillMd, sk.name, sk.desc);
    const note = blocks.find((b) => b.t === "note") as { lines: string[] } | undefined;
    expect(note).toBeDefined();
    expect(note!.lines[0].startsWith(">")).toBe(false);
  });

  it("emits no blocks for an empty document", () => {
    const empty: MdLine[] = [];
    expect(parseSkillFileBody(empty, "x", "")).toEqual([]);
  });
});
