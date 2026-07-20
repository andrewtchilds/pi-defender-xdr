import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { XdrAuth } from "../extensions/defender-xdr/auth.js";
import type { CommandRuntime } from "../extensions/defender-xdr/commands/types.js";
import type { XdrConfig } from "../extensions/defender-xdr/config.js";
import { findSchemaTable, getLiveTableColumns, loadSchemaSnapshot, searchSchema } from "../extensions/defender-xdr/schema.js";
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
    const described = await tool.execute("describe", { table: "AlertInfo" }, undefined, undefined, {});
    expect(described.content[0].text).toContain("AlertId");
    expect(described.content[0].text).not.toContain("Unique identifier for the alert");
    expect(described.content[0].text).not.toContain("\n");
    const verbose = await tool.execute("describe", { table: "AlertInfo", verbose: true }, undefined, undefined, {});
    expect(verbose.content[0].text).toContain("Unique identifier for the alert");
    expect(localRuntime.getAuth).not.toHaveBeenCalled();
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
