import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const skillsDirectory = join(process.cwd(), "skills");

describe("investigation skills", () => {
  it("ships valid, discoverable, safety-bounded skill files", async () => {
    const directories = (await readdir(skillsDirectory, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    expect(directories).toHaveLength(4);

    for (const directory of directories) {
      const text = await readFile(join(skillsDirectory, directory.name, "SKILL.md"), "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
      const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      expect(name).toBe(directory.name);
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(description?.length).toBeGreaterThan(40);
      expect(description?.length).toBeLessThanOrEqual(1024);
      expect(text).toContain("xdr_get_schema");
      expect(text).toContain("read-only");
      expect(text).toMatch(/empty result|Empty results|empty results/i);
    }
  });

  it("documents the exact Entra interactive sign-in representation", async () => {
    const text = await readFile(join(skillsDirectory, "defender-xdr-identity-investigation", "SKILL.md"), "utf8");
    expect(text).toContain("LogonType == '[\"interactiveUser\"]'");
    expect(text).toContain("references/query-patterns.md");
  });
});
