import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { XdrAuth } from "../extensions/defender-xdr/auth.js";
import type { CommandRuntime } from "../extensions/defender-xdr/commands/types.js";
import type { XdrConfig } from "../extensions/defender-xdr/config.js";
import { exportHuntingResult, registerRunQueryTool } from "../extensions/defender-xdr/tools/run-query.js";

afterEach(() => vi.unstubAllGlobals());

const config = {
  apiBaseUrl: "https://graph.microsoft.com",
  defaultLookback: "7d",
  maximumRows: 1,
} as XdrConfig;

function runtime(): CommandRuntime {
  const auth = { acquireTokenSilent: vi.fn(async () => ({ accessToken: "token" })) } as unknown as XdrAuth;
  return {
    getConfig: async () => config,
    getAuth: async () => auth,
    reset: () => undefined,
  };
}

describe("xdr_run_query tool", () => {
  it("returns compact rows without redundant schema or OData type annotations", async () => {
    let tool: any;
    registerRunQueryTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, runtime());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: [{ name: "Events", type: "Int64" }],
      results: [{ "Events@odata.type": "#Int64", Events: 3 }],
    }), { status: 200 })));

    const result = await tool.execute("call", { query: "DeviceInfo", max_rows: 1 }, undefined, undefined, {});
    const text = result.content[0].text as string;
    expect(text).toBe('{"totalRows":1,"displayedRows":1,"rowsTruncated":false,"results":[{"Events":3}]}');
    expect(text).not.toContain("schema");
    expect(text).not.toContain("odata.type");
    expect(result.details.schemaColumns).toBe(1);
  });

  it("includes compact schema for an empty result", async () => {
    let tool: any;
    registerRunQueryTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, runtime());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: [{ name: "Timestamp", type: "DateTime" }],
      results: [],
    }), { status: 200 })));

    const result = await tool.execute("call", { query: "DeviceInfo" }, undefined, undefined, {});
    expect(result.content[0].text).toContain('"schema":[{"name":"Timestamp","type":"DateTime"}]');
  });

  it("enforces row, line, and byte output limits", async () => {
    let tool: any;
    registerRunQueryTool({ registerTool: (definition: unknown) => { tool = definition; } } as ExtensionAPI, runtime());
    const wideRow = Object.fromEntries(Array.from({ length: 3_000 }, (_, index) => [`Column${index}`, "x".repeat(30)]));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: [{ name: "value", type: "String" }],
      results: [wideRow, { value: "second" }],
    }), { status: 200 })));

    const result = await tool.execute("call", { query: "DeviceInfo", max_rows: 10 }, undefined, undefined, {});
    const text = result.content[0].text as string;
    expect(result.details).toMatchObject({ totalRows: 2, displayedRows: 1, rowsTruncated: true, outputTruncated: true });
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
    expect(text.split("\n").length).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
  });

  it("exports complete results to a new owner-only file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-export-"));
    const data = { schema: [{ name: "DeviceId" }], results: [{ DeviceId: "complete" }] };
    const path = await exportHuntingResult(data, directory);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(data);
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(directory, "exports"))).mode & 0o777).toBe(0o700);
    }
  });
});
