import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { XdrAuth } from "../extensions/defender-xdr/auth.js";
import type { CommandRuntime } from "../extensions/defender-xdr/commands/types.js";
import type { XdrConfig } from "../extensions/defender-xdr/config.js";
import { findSchemaTable, getLiveTableColumns, loadSchemaSnapshot, searchCachedLiveSchema, searchSchema } from "../extensions/defender-xdr/schema.js";
import { registerSchemaTool } from "../extensions/defender-xdr/tools/schema.js";

afterEach(() => vi.unstubAllGlobals());

const config = {
  apiBaseUrl: "https://graph.microsoft.com",
  defaultLookback: "7d",
  schemaTtlHours: 168,
} as XdrConfig;

function runtime(): CommandRuntime {
  const auth = { acquireTokenSilent: vi.fn(async () => ({ accessToken: "token" })) } as unknown as XdrAuth;
  return { getConfig: async () => config, getAuth: async () => auth, reset: () => undefined };
}

describe("Defender XDR schema", () => {
  it("loads a pinned official snapshot and searches tables and columns", async () => {
    const snapshot = await loadSchemaSnapshot();
    expect(snapshot.tables.length).toBeGreaterThan(60);
    expect(snapshot.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    const process = await findSchemaTable("deviceprocessevents");
    expect(process?.columns.some((column) => column.name === "ProcessCommandLine")).toBe(true);
    expect(searchSchema(snapshot, "command line").some((match) => match.table === "DeviceProcessEvents")).toBe(true);
  });

  it("searches tenant-cached columns that are absent from the bundled snapshot without querying", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-schema-search-"));
    const cachePath = join(directory, "schema-cache.json");
    await writeFile(cachePath, JSON.stringify({
      version: 1,
      tables: {
        entraidsigninevents: {
          fetchedAt: "2026-07-13T21:43:45.140Z",
          columns: [{ name: "RiskLevelDuringSignIn", type: "Int32" }],
        },
      },
    }));

    await expect(searchCachedLiveSchema("RiskLevelDuringSignIn", 20, cachePath)).resolves.toEqual([{
      table: "entraidsigninevents",
      fetchedAt: "2026-07-13T21:43:45.140Z",
      matchingColumns: [{ name: "RiskLevelDuringSignIn", type: "Int32" }],
    }]);
  });

  it("marks superseded tables as retired", async () => {
    await expect(findSchemaTable("AIAgentsInfo")).resolves.toMatchObject({ status: "retired", replacedBy: "AgentsInfo" });
  });

  it("lists and describes schema without authentication", async () => {
    let tool: any;
    const localRuntime = runtime();
    localRuntime.getAuth = vi.fn(async () => { throw new Error("authentication should not be used"); });
    registerSchemaTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, localRuntime);

    const listed = await tool.execute("list", {}, undefined, undefined, {});
    expect(listed.content[0].text).toContain("DeviceProcessEvents");
    expect(listed.content[0].text).not.toContain('"name": "AIAgentsInfo"');
    const described = await tool.execute("describe", { table: "AlertInfo", live: false }, undefined, undefined, {});
    expect(described.content[0].text).toContain("AlertId");
    expect(described.content[0].text).not.toContain("Unique identifier for the alert");
    expect(described.content[0].text).not.toContain("\n");
    const verbose = await tool.execute("describe", { table: "AlertInfo", verbose: true, live: false }, undefined, undefined, {});
    expect(verbose.content[0].text).toContain("Unique identifier for the alert");
    expect(localRuntime.getAuth).not.toHaveBeenCalled();
  });

  it("auto-verifies an exact table against the tenant by default and merges live columns", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-schema-tool-"));
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = directory;
    try {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ schema: [{ name: "AlertId", type: "String" }, { name: "BrandNewLiveColumn", type: "String" }], results: [] }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      let tool: any;
      const localRuntime = runtime();
      registerSchemaTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, localRuntime);

      const described = await tool.execute("describe", { table: "AlertInfo" }, undefined, undefined, {});
      const text = described.content[0].text as string;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(text).toContain("BrandNewLiveColumn");
      expect(text).toContain("liveVerification");
      expect(text).toContain('"cached":false');
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
    }
  });

  it("falls back to the bundled snapshot when live verification fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-schema-fail-"));
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = directory;
    try {
      const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
      vi.stubGlobal("fetch", fetchMock);
      let tool: any;
      registerSchemaTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, runtime());

      const described = await tool.execute("describe", { table: "AlertInfo" }, undefined, undefined, {});
      const text = described.content[0].text as string;
      expect(text).toContain("AlertId");
      expect(text).toContain('"status":"failed"');
      expect(text).toContain("may be incomplete");
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
    }
  });

  it("rejects retired tables by default with replacement guidance", async () => {
    let tool: any;
    registerSchemaTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, runtime());
    await expect(tool.execute("describe", { table: "AIAgentsInfo" }, undefined, undefined, {})).rejects.toThrow("use AgentsInfo");
  });

  it("verifies tenant schema and reuses an owner-only TTL cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-schema-"));
    const cachePath = join(directory, "schema-cache.json");
    const table = await findSchemaTable("DeviceInfo");
    expect(table).toBeDefined();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ schema: [{ name: "DeviceId", type: "String" }], results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getLiveTableColumns(table!, runtime(), undefined, false, cachePath);
    const second = await getLiveTableColumns(table!, runtime(), undefined, false, cachePath);
    expect(first).toMatchObject({ cached: false, columns: [{ name: "DeviceId" }] });
    expect(second).toMatchObject({ cached: true, columns: [{ name: "DeviceId" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (process.platform !== "win32") expect((await stat(cachePath)).mode & 0o777).toBe(0o600);
  });
});
