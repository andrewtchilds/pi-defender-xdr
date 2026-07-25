import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const skillsDirectory = join(process.cwd(), "skills");
const coreName = "defender-xdr-investigation";

async function skillDirectories(): Promise<string[]> {
  return (await readdir(skillsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function kqlBlocks(text: string): string[] {
  return [...text.matchAll(/```kusto\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
}

describe("investigation skills", () => {
  it("ships valid and discoverable skill files", async () => {
    const directories = await skillDirectories();
    expect(directories).toEqual([
      "defender-xdr-endpoint-investigation",
      "defender-xdr-identity-investigation",
      coreName,
      "defender-xdr-messaging-investigation",
    ]);

    for (const directory of directories) {
      const text = await readFile(join(skillsDirectory, directory, "SKILL.md"), "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
      const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      expect(name).toBe(directory);
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(description?.length).toBeGreaterThan(40);
      expect(description?.length).toBeLessThanOrEqual(1024);
      expect(text).toContain("xdr_get_schema");
    }
  });

  it("keeps shared safety and evidence rules in the core skill", async () => {
    const core = await readFile(join(skillsDirectory, coreName, "SKILL.md"), "utf8");
    expect(core).toContain("read-only");
    expect(core).toContain("export_results=true");
    expect(core).toContain("empty result");
    expect(core).toContain("evidence ledger");
    expect(core).toContain("truncation notices");
    expect(core).toContain("Stop querying when");

    for (const directory of (await skillDirectories()).filter((name) => name !== coreName)) {
      const text = await readFile(join(skillsDirectory, directory, "SKILL.md"), "utf8");
      expect(text).toContain("Load and apply `defender-xdr-investigation` first");
      expect(text).toContain("Continue when");
      expect(text).toContain("references/query-patterns.md");
    }
  });

  it("bounds every bundled KQL pattern that reads timestamped telemetry", async () => {
    for (const directory of await skillDirectories()) {
      const files = [join(skillsDirectory, directory, "SKILL.md")];
      const reference = join(skillsDirectory, directory, "references", "query-patterns.md");
      try {
        await readFile(reference, "utf8");
        files.push(reference);
      } catch {
        // A skill may have no query reference.
      }

      for (const file of files) {
        const text = await readFile(file, "utf8");
        for (const query of kqlBlocks(text)) {
          expect(query, `${file} contains an unbounded query`).toContain("Timestamp between");
          expect(query, `${file} contains a query without a row limit`).toMatch(/\| (take|top) /);
        }
      }
    }
  });

  it("documents the exact Entra interactive sign-in representation", async () => {
    const text = await readFile(join(skillsDirectory, "defender-xdr-identity-investigation", "SKILL.md"), "utf8");
    expect(text).toContain("LogonType == '[\"interactiveUser\"]'");
    expect(text).toContain("references/query-patterns.md");
  });
});
